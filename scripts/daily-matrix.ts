/**
 * daily-matrix.ts — Settings Matrix CLI runner
 *
 * Runs one or all presets through the full 9-stage pipeline and writes
 * rendered markdown notes to ~/obsidian-vaults/daily-digest-test/YYYY-MM-DD/.
 *
 * Invoke via:
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/daily-matrix.ts
 * or through the npm scripts defined in package.json ("matrix", "matrix:real", etc.)
 *
 * Env vars:
 *   PRESET        — preset id to run, or "all" (default: all)
 *   AI_MODE       — "mock" | "real" (default: mock)
 *   DATA_MODE     — "fixtures" | "real" (default: fixtures)
 *   DATE          — ISO date string YYYY-MM-DD (default: today)
 *   MATRIX_ASSERT — "true" to run structural/quality assertions
 */

import { mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

import { PRESETS, resolvePreset, getPresetFilename } from "./presets";
import { collectFixtureData, collectRealData } from "./lib/collector-shim";
import { getMockSummary } from "./lib/mock-ai";
import { createPromptLog, appendPromptEntry, estimateTokens } from "./lib/prompt-logger";
import type { PromptLog } from "./lib/prompt-logger";
import { runAssertions, writeReport } from "./lib/assertion-runner";
import type { MatrixReport, PresetReport } from "./lib/assertion-runner";

// src/ imports — obsidian is shimmed via tsconfig.scripts.json paths alias
import { sanitizeCollectedData } from "../src/filter/sanitize";
import { filterSensitiveDomains } from "../src/filter/sensitivity";
import { categorizeVisits } from "../src/filter/categorize";
import { classifyEventsRuleOnly, classifyEvents } from "../src/filter/classify";
import { extractPatterns, buildEmptyTopicHistory } from "../src/analyze/patterns";
import { generateKnowledgeSections } from "../src/analyze/knowledge";
import { renderMarkdown } from "../src/render/renderer";
import { buildPrompt, summarizeDay, resolvePromptAndTier } from "../src/summarize/summarize";

import type {
	SanitizeConfig,
	SensitivityConfig,
	ClassificationResult,
	PatternConfig,
	PatternAnalysis,
	AISummary,
} from "../src/types";
import type { KnowledgeSections } from "../src/analyze/knowledge";
import type { AICallConfig } from "../src/summarize/ai-client";

// ── Env vars ─────────────────────────────────────────────

const AI_MODE = (process.env.AI_MODE ?? "mock") as "real" | "mock";
const DATA_MODE = (process.env.DATA_MODE ?? "fixtures") as "real" | "fixtures";
const PRESET_FILTER = process.env.PRESET ?? "all";
const GROUP_FILTER = process.env.GROUP ?? "";  // "no-ai", "local", "cloud", or "" for all
const DATE_STR = process.env.DATE ?? new Date().toISOString().slice(0, 10);
const ASSERT = process.env.MATRIX_ASSERT === "true";

const VAULT_ROOT = join(homedir(), "obsidian-vaults", "daily-digest-test");

// ── Per-preset runner ────────────────────────────────────

async function runPreset(
	presetId: string,
	date: Date,
	outputDir: string
): Promise<PresetReport | null> {
	const start = Date.now();
	console.log(`\n[${presetId}] Starting...`);

	const preset = PRESETS.find((p) => p.id === presetId);
	if (!preset) {
		console.error(`[${presetId}] ERROR: preset not found`);
		return null;
	}

	const settings = resolvePreset(preset);

	// ── 1. Collect ──────────────────────────────────────
	// For real data: collect exactly the target calendar day (midnight → midnight).
	// For fixtures: use synthetic persona data (date-independent).
	const since = new Date(date);
	since.setHours(0, 0, 0, 0);
	const until = new Date(since);
	until.setDate(until.getDate() + 1);

	const raw = DATA_MODE === "real"
		? await collectRealData(settings, since, until)
		: await collectFixtureData(settings);

	// ── 2. Sanitize ─────────────────────────────────────
	const sanitizeConfig: SanitizeConfig = {
		enabled: settings.enableSanitization,
		level: settings.sanitizationLevel,
		excludedDomains: settings.excludedDomains
			? settings.excludedDomains.split(",").map((d) => d.trim()).filter(Boolean)
			: [],
		redactPaths: settings.redactPaths,
		scrubEmails: settings.scrubEmails,
	};

	const sanitized = sanitizeCollectedData(
		raw.visits,
		raw.searches,
		raw.claudeSessions,
		raw.gitCommits,
		sanitizeConfig
	);

	// ── 3. Sensitivity filter ───────────────────────────
	const sensitivityConfig: SensitivityConfig = {
		enabled: settings.enableSensitivityFilter,
		categories: settings.sensitivityCategories,
		customDomains: settings.sensitivityCustomDomains
			? settings.sensitivityCustomDomains.split(",").map((d) => d.trim()).filter(Boolean)
			: [],
		action: settings.sensitivityAction,
	};

	const sensitivityResult = filterSensitiveDomains(sanitized.visits, sensitivityConfig);
	const filteredVisits = sensitivityResult.kept;

	// ── 4. Categorize ────────────────────────────────────
	const categorized = categorizeVisits(filteredVisits);

	// ── 5. Classify ──────────────────────────────────────
	// classifyEvents makes LLM calls — only run when AI_MODE=real.
	// classifyEventsRuleOnly is always safe (no network calls).
	let classification: ClassificationResult | undefined;

	if (settings.enableClassification || settings.enablePatterns) {
		if (AI_MODE === "real" && settings.enableClassification) {
			const classifyConfig = {
				enabled: true,
				endpoint: settings.localEndpoint,
				model: settings.classificationModel,
				batchSize: settings.classificationBatchSize,
			};
			classification = await classifyEvents(
				filteredVisits,
				sanitized.searches,
				sanitized.claudeSessions,
				sanitized.gitCommits,
				categorized,
				classifyConfig
			);
			console.log(`[${presetId}] LLM-classified ${classification.llmClassified} events`);
		} else {
			if (settings.enableClassification && AI_MODE === "mock") {
				console.log(`[${presetId}] Classification: rule-only (AI_MODE=mock, skipping LLM)`);
			}
			classification = classifyEventsRuleOnly(
				filteredVisits,
				sanitized.searches,
				sanitized.claudeSessions,
				sanitized.gitCommits,
				categorized
			);
		}
	}

	// ── 6. Patterns ─────────────────────────────────────
	let patterns: PatternAnalysis | undefined;

	if (settings.enablePatterns && classification) {
		const patternConfig: PatternConfig = {
			enabled: true,
			cooccurrenceWindow: settings.patternCooccurrenceWindow,
			minClusterSize: settings.patternMinClusterSize,
			trackRecurrence: settings.trackRecurrence,
		};
		const topicHistory = buildEmptyTopicHistory();
		patterns = extractPatterns(classification, patternConfig, topicHistory, DATE_STR);
		console.log(
			`[${presetId}] Patterns: focus=${Math.round(patterns.focusScore * 100)}%,` +
			` clusters=${patterns.temporalClusters.length}`
		);
	}

	// ── 7. Knowledge sections ────────────────────────────
	const knowledge: KnowledgeSections | undefined = patterns
		? generateKnowledgeSections(patterns)
		: undefined;

	// ── 8. AI summary + prompt log ───────────────────────
	const promptLog: PromptLog = createPromptLog();
	let aiSummary: AISummary | null = null;
	const aiProviderUsed = (settings.enableAI ? settings.aiProvider : "none") as
		"none" | "anthropic" | "local";

	if (!settings.enableAI || settings.aiProvider === "none") {
		console.log(`[${presetId}] AI: disabled`);
	} else if (AI_MODE === "mock") {
		// Use resolvePromptAndTier to log the actual prompt + tier that would be sent
		const aiCallConfig: AICallConfig = {
			provider: settings.aiProvider as "anthropic" | "local",
			anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "mock-key",
			anthropicModel: settings.aiModel ?? "claude-haiku-4-5-20251001",
			localEndpoint: settings.localEndpoint,
			localModel: settings.localModel,
		};
		const resolution = resolvePromptAndTier(
			date, categorized, sanitized.searches, sanitized.claudeSessions,
			aiCallConfig, settings.profile,
			undefined, classification, patterns, undefined, sanitized.gitCommits
		);
		appendPromptEntry(promptLog, {
			stage: "summarize",
			model: aiCallConfig.provider === "local"
				? (aiCallConfig.localModel ?? "local")
				: (aiCallConfig.anthropicModel ?? "mock"),
			tokenCount: estimateTokens(resolution.prompt),
			privacyTier: resolution.tier,
			prompt: resolution.prompt,
		});
		aiSummary = getMockSummary(presetId);
		console.log(`[${presetId}] AI: mock (tier ${resolution.tier}, ${estimateTokens(resolution.prompt)} tokens)`);
	} else {
		// AI_MODE === "real" — call the real AI provider
		const aiCallConfig: AICallConfig = {
			provider: settings.aiProvider as "anthropic" | "local",
			anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
			anthropicModel: settings.aiModel ?? "claude-haiku-4-5-20251001",
			localEndpoint: settings.localEndpoint,
			localModel: settings.localModel,
		};

		// Log the prompt and tier that resolvePromptAndTier selects (non-RAG path).
		// summarizeDay handles the async RAG path separately, so its logged tier
		// may differ for RAG-enabled presets, but is accurate for all others.
		const previewResolution = resolvePromptAndTier(
			date, categorized, sanitized.searches, sanitized.claudeSessions,
			aiCallConfig, settings.profile,
			undefined, classification, patterns, undefined, sanitized.gitCommits
		);
		appendPromptEntry(promptLog, {
			stage: "summarize",
			model: aiCallConfig.provider === "local"
				? (aiCallConfig.localModel ?? "local")
				: (aiCallConfig.anthropicModel ?? "unknown"),
			tokenCount: estimateTokens(previewResolution.prompt),
			privacyTier: previewResolution.tier,
			prompt: previewResolution.prompt,
		});

		aiSummary = await summarizeDay(
			date,
			categorized,
			sanitized.searches,
			sanitized.claudeSessions,
			aiCallConfig,
			settings.profile,
			undefined,
			classification,
			patterns,
			undefined,
			sanitized.gitCommits,
			settings.promptsDir,
			settings.promptStrategy
		);
		console.log(`[${presetId}] AI: real summary generated`);
	}

	// ── 9. Render markdown ───────────────────────────────
	const md = renderMarkdown(
		date,
		filteredVisits,
		sanitized.searches,
		sanitized.claudeSessions,
		sanitized.gitCommits,
		categorized,
		aiSummary,
		aiProviderUsed,
		knowledge,
		promptLog
	);

	// ── 10. Write file ───────────────────────────────────
	const filePath = join(outputDir, `${getPresetFilename(preset)}.md`);
	writeFileSync(filePath, md, "utf-8");
	console.log(`[${presetId}] Written to ${filePath}`);

	// ── 11. Assertions ───────────────────────────────────
	if (ASSERT) {
		const durationMs = Date.now() - start;
		const report = runAssertions(md, presetId, filePath, durationMs, {
			aiEnabled: settings.enableAI && settings.aiProvider !== "none",
		});
		const status = report.passed ? "PASS" : "FAIL";
		console.log(`[${presetId}] Assertions: ${status}`);
		if (!report.passed) {
			const failures = [
				...report.checks.structural.failures,
				...report.checks.quality.failures,
			];
			for (const f of failures) console.error(`  - ${f}`);
		}
		return report;
	}

	return null;
}

// ── Main ──────────────────────────────────────────────────

async function main(): Promise<void> {
	const date = new Date(`${DATE_STR}T12:00:00`);
	const outputDir = join(VAULT_ROOT, DATE_STR);
	mkdirSync(outputDir, { recursive: true });

	console.log(`Daily Matrix`);
	console.log(`  Date:      ${DATE_STR}`);
	console.log(`  AI mode:   ${AI_MODE}`);
	console.log(`  Data mode: ${DATA_MODE}`);
	console.log(`  Preset:    ${PRESET_FILTER}`);
	console.log(`  Group:     ${GROUP_FILTER || "all"}`);
	console.log(`  Output:    ${outputDir}`);
	console.log(`  Assert:    ${ASSERT}`);

	// Filter presets by ID, then by privacy group
	let presetsToRun = PRESET_FILTER === "all"
		? PRESETS
		: PRESETS.filter((p) => p.id === PRESET_FILTER);
	if (GROUP_FILTER) {
		presetsToRun = presetsToRun.filter((p) => p.privacyGroup === GROUP_FILTER);
	}

	if (presetsToRun.length === 0) {
		console.error(`No presets matched: "${PRESET_FILTER}"`);
		process.exit(1);
	}

	// Run presets sequentially
	const reports: PresetReport[] = [];
	for (const preset of presetsToRun) {
		const report = await runPreset(preset.id, date, outputDir);
		if (ASSERT && report) {
			reports.push(report);
		}
	}

	// Write assertion report
	if (ASSERT && reports.length > 0) {
		const passed = reports.filter((r) => r.passed).length;
		const failed = reports.length - passed;
		const matrixReport: MatrixReport = {
			date: DATE_STR,
			aiMode: AI_MODE,
			dataMode: DATA_MODE,
			totalPresets: reports.length,
			passed,
			failed,
			results: reports,
		};
		writeReport(outputDir, matrixReport);
	}

	console.log(`\nDone. Open ${VAULT_ROOT} in Obsidian to review.`);
}

main().catch((err) => {
	console.error("daily-matrix failed:", err);
	process.exit(1);
});
