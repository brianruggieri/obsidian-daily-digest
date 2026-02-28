/**
 * daily-matrix.ts — Settings Matrix CLI runner
 *
 * Runs one or all presets through the full plugin pipeline and writes
 * rendered markdown notes to ~/obsidian-vaults/daily-digest-test/YYYY-MM-DD/.
 *
 * This script mirrors the plugin's pipeline in main.ts stage-for-stage so that
 * matrix runs produce output identical to what users would see in Obsidian.
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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

// Load .env if present (for ANTHROPIC_API_KEY in matrix:real runs).
// Shell / CI environment values take precedence over .env so callers stay in control.
const envPath = join(process.cwd(), ".env");
if (existsSync(envPath)) {
	for (const line of readFileSync(envPath, "utf-8").split("\n")) {
		const match = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*"?(.*?)"?\s*$/);
		if (match) {
			const key = match[1];
			const value = match[2];
			// Only populate missing variables and skip empty values to avoid accidental overrides.
			if (process.env[key] === undefined && value !== "") {
				process.env[key] = value;
			}
		}
	}
}

import { PRESETS, resolvePreset, getPresetFilename } from "./presets";
import { collectFixtureData, collectRealData } from "./lib/collector-shim";
import { getMockSummary } from "./lib/mock-ai";
import { createPromptLog, appendPromptEntry, estimateTokens } from "./lib/prompt-logger";
import type { PromptLog } from "./lib/prompt-logger";
import { runAssertions, writeReport } from "./lib/assertion-runner";
import type { MatrixReport, PresetReport } from "./lib/assertion-runner";

// src/ imports — obsidian is shimmed via tsconfig.scripts.json paths alias
import { sanitizeCollectedData } from "../src/filter/sanitize";
import { filterSensitiveDomains, filterSensitiveSearches } from "../src/filter/sensitivity";
import { categorizeVisits } from "../src/filter/categorize";
import { classifyEventsRuleOnly, classifyEvents } from "../src/filter/classify";
import { extractPatterns, buildEmptyTopicHistory } from "../src/analyze/patterns";
import { generateKnowledgeSections } from "../src/analyze/knowledge";
import { clusterArticles } from "../src/analyze/clusters";
import { linkSearchesToVisits } from "../src/analyze/intent";
import { computeEngagementScore } from "../src/analyze/engagement";
import { cleanTitle } from "../src/collect/browser";
import { groupCommitsIntoWorkUnits } from "../src/analyze/commits";
import { groupClaudeSessionsIntoTasks, detectSearchMissions, fuseCrossSourceSessions } from "../src/analyze/task-sessions";
import { compressActivity } from "../src/summarize/compress";
import { renderMarkdown } from "../src/render/renderer";
import { buildPrompt, summarizeDay, resolvePromptAndTier } from "../src/summarize/summarize";

import type {
	SanitizeConfig,
	SensitivityConfig,
	ClassificationResult,
	PatternConfig,
	PatternAnalysis,
	AISummary,
	ArticleCluster,
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

// ── Per-preset runner ────────────────────────────────
//
// KEEP IN SYNC WITH src/plugin/main.ts PIPELINE.
//
// This function mirrors the plugin's generateNote() method stage-for-stage.
// Whenever main.ts gains a new pipeline stage, add it here in the same order.
// Whenever summarizeDay() or resolvePromptAndTier() signatures change, update
// both call sites below to match.
// Verify with: npx tsc --project scripts/tsconfig.json --noEmit
//
// Current stage map (main.ts → runPreset):
//   1. Collect                    ✓
//   2. Sensitivity filter         ✓ (raw data, before sanitize)
//   3. Sanitize                   ✓
//   4. Categorize                 ✓
//   5. Classify (LLM or rule)     ✓
//   6. Article clustering         ✓
//   7. Pattern extraction         ✓
//   8. Knowledge sections         ✓
//   9. Semantic extraction        ✓
//  10. AI summary                 ✓
//  11. Render markdown            ✓────

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

	// ── 2. Sensitivity filter ───────────────────────────
	// Mirrors main.ts: run on RAW data before sanitization.
	const sensitivityConfig: SensitivityConfig = {
		enabled: settings.enableSensitivityFilter,
		categories: settings.sensitivityCategories,
		customDomains: settings.sensitivityCustomDomains
			? settings.sensitivityCustomDomains.split(",").map((d) => d.trim()).filter(Boolean)
			: [],
		action: settings.sensitivityAction,
	};

	let rawVisits = raw.visits;
	let rawSearches = raw.searches;
	if (sensitivityConfig.enabled) {
		const visitResult = filterSensitiveDomains(rawVisits, sensitivityConfig);
		rawVisits = visitResult.kept;
		const searchResult = filterSensitiveSearches(rawSearches, sensitivityConfig);
		rawSearches = searchResult.kept;
		const filtered = (raw.visits.length - rawVisits.length) + (raw.searches.length - rawSearches.length);
		if (filtered > 0) console.log(`[${presetId}] Sensitivity: removed ${filtered} items`);
	}

	// ── 3. Sanitize ──────────────────────────────────────
	// Auto-upgrade to aggressive for Anthropic when enabled (mirrors main.ts).
	const effectiveSanitizationLevel =
		settings.autoAggressiveSanitization && settings.aiProvider === "anthropic"
			? "aggressive"
			: settings.sanitizationLevel;
	const sanitizeConfig: SanitizeConfig = {
		enabled: settings.enableSanitization,
		level: effectiveSanitizationLevel,
		excludedDomains: settings.excludedDomains
			? settings.excludedDomains.split(",").map((d) => d.trim()).filter(Boolean)
			: [],
		redactPaths: settings.redactPaths,
		scrubEmails: settings.scrubEmails,
	};

	const sanitized = sanitizeCollectedData(
		rawVisits,
		rawSearches,
		raw.claudeSessions,
		raw.gitCommits,
		sanitizeConfig
	);
	const visits = sanitized.visits;
	const searches = sanitized.searches;
	const claudeSessions = sanitized.claudeSessions;
	const gitCommits = sanitized.gitCommits;

	// ── 4. Categorize ────────────────────────────────────
	const categorized = categorizeVisits(visits);

	// ── 5. Classify ──────────────────────────────────────
	// AI_MODE=real: mirrors main.ts — LLM classification only when enableClassification && enableAI.
	// AI_MODE=mock: uses rule-only as a testing approximation (LLM not available).
	let classification: ClassificationResult | undefined;
	const useAI = settings.enableAI && settings.aiProvider !== "none";

	if (AI_MODE === "real") {
		if (settings.enableClassification && useAI) {
			const classifyConfig = {
				enabled: true,
				endpoint: settings.localEndpoint,
				model: settings.classificationModel,
				batchSize: settings.classificationBatchSize,
			};
			try {
				classification = await classifyEvents(
					visits, searches, claudeSessions, gitCommits, categorized, classifyConfig
				);
				console.log(`[${presetId}] LLM-classified ${classification.llmClassified} events`);
			} catch (e) {
				console.warn(`[${presetId}] Classification failed, continuing without:`, e);
			}
		}
	} else {
		// AI_MODE=mock: rule-only for presets that need classification or patterns
		if (settings.enableClassification || settings.enablePatterns) {
			if (settings.enableClassification) {
				console.log(`[${presetId}] Classification: rule-only (AI_MODE=mock, skipping LLM)`);
			}
			classification = classifyEventsRuleOnly(
				visits, searches, claudeSessions, gitCommits, categorized
			);
		}
	}

	// ── 6. Article Clustering ────────────────────────────
	// Mirrors main.ts: pure TF-IDF + engagement scoring, no LLM calls.
	let articleClusters: ArticleCluster[] = [];
	let knowledge: KnowledgeSections | undefined;
	try {
		const searchLinks = linkSearchesToVisits(searches, visits);
		const cleanedTitles = visits.map((v) => cleanTitle(v.title ?? ""));
		const engagementScores = visits.map((v, i) =>
			computeEngagementScore(v, cleanedTitles[i], visits, searchLinks)
		);
		articleClusters = clusterArticles(visits, cleanedTitles, engagementScores);
		if (articleClusters.length > 0) {
			console.log(`[${presetId}] Article clustering: ${articleClusters.length} clusters`);
		}
	} catch (e) {
		console.warn(`[${presetId}] Article clustering failed, continuing without:`, e);
	}

	// ── 7. Patterns ─────────────────────────────────────
	let patterns: PatternAnalysis | undefined;

	if (settings.enablePatterns && classification && classification.events.length > 0) {
		const patternConfig: PatternConfig = {
			enabled: true,
			cooccurrenceWindow: settings.patternCooccurrenceWindow,
			minClusterSize: settings.patternMinClusterSize,
			trackRecurrence: settings.trackRecurrence,
		};
		const topicHistory = buildEmptyTopicHistory();
		try {
			patterns = extractPatterns(
				classification, patternConfig, topicHistory, DATE_STR,
				gitCommits, claudeSessions, searches, visits, articleClusters
			);
			console.log(
				`[${presetId}] Patterns: focus=${Math.round(patterns.focusScore * 100)}%,` +
				` clusters=${patterns.temporalClusters.length}`
			);
		} catch (e) {
			console.warn(`[${presetId}] Pattern extraction failed, continuing without:`, e);
		}
	}

	// ── 8. Knowledge sections ────────────────────────────
	if (patterns) {
		knowledge = generateKnowledgeSections(patterns);
	}
	// Attach article clusters to knowledgeSections even without patterns (mirrors main.ts)
	if (articleClusters.length > 0) {
		if (knowledge) {
			knowledge.articleClusters = articleClusters;
		} else {
			knowledge = {
				focusSummary: "", focusScore: 0,
				temporalInsights: [], topicMap: [], entityGraph: [],
				recurrenceNotes: [], knowledgeDeltaLines: [], tags: [],
				articleClusters,
			};
		}
	}

	// ── 9. Semantic extraction ───────────────────────────
	// Mirrors main.ts: commit work units + Claude task sessions, no LLM calls.
	if (gitCommits.length > 0 || claudeSessions.length > 0) {
		try {
			const commitWorkUnits = groupCommitsIntoWorkUnits(gitCommits);
			const claudeTaskSessions = groupClaudeSessionsIntoTasks(claudeSessions);
			const searchMissions = detectSearchMissions(searches, visits);
			fuseCrossSourceSessions(articleClusters, commitWorkUnits, claudeTaskSessions, searchMissions);

			if (knowledge) {
				if (!knowledge.commitWorkUnits?.length) knowledge.commitWorkUnits = commitWorkUnits;
				if (!knowledge.claudeTaskSessions?.length) knowledge.claudeTaskSessions = claudeTaskSessions;
			} else if (commitWorkUnits.length > 0 || claudeTaskSessions.length > 0) {
				knowledge = {
					focusSummary: "", focusScore: 0,
					temporalInsights: [], topicMap: [], entityGraph: [],
					recurrenceNotes: [], knowledgeDeltaLines: [], tags: [],
					articleClusters: articleClusters.length > 0 ? articleClusters : undefined,
					commitWorkUnits, claudeTaskSessions,
				};
			}
			if (patterns) {
				patterns.commitWorkUnits = commitWorkUnits;
				patterns.claudeTaskSessions = claudeTaskSessions;
			}
			console.log(`[${presetId}] Semantic: ${commitWorkUnits.length} work units, ${claudeTaskSessions.length} task sessions`);
		} catch (e) {
			console.warn(`[${presetId}] Semantic extraction failed, continuing without:`, e);
		}
	}

	// ── 10. AI summary + prompt log ──────────────────────
	const promptLog: PromptLog = createPromptLog();
	let aiSummary: AISummary | null = null;
	const aiProviderUsed = (useAI ? settings.aiProvider : "none") as
		"none" | "anthropic" | "local";

	if (!useAI) {
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
		const ragConfigPreview = settings.enableRAG
			? { enabled: true, embeddingEndpoint: settings.localEndpoint, embeddingModel: settings.embeddingModel, topK: settings.ragTopK, minChunkTokens: 100, maxChunkTokens: 500 }
			: undefined;
		const compressed = compressActivity(categorized, searches, claudeSessions, gitCommits, settings.promptBudget);
		const resolution = resolvePromptAndTier(
			date, categorized, searches, claudeSessions,
			aiCallConfig, settings.profile,
			ragConfigPreview, classification, patterns, compressed, gitCommits,
			settings.promptsDir, settings.privacyTierOverride
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

		const compressed = compressActivity(categorized, searches, claudeSessions, gitCommits, settings.promptBudget);
		console.log(`[${presetId}] Compressed: ~${compressed.tokenEstimate} tokens (budget: ${settings.promptBudget})`);

		// Log the prompt and tier that resolvePromptAndTier selects.
		// For RAG presets, we pass a minimal ragConfig so the tier label (Tier 2) is
		// correct; the actual RAG chunks are fetched asynchronously inside summarizeDay.
		const ragConfigPreview = settings.enableRAG
			? { enabled: true, embeddingEndpoint: settings.localEndpoint, embeddingModel: settings.embeddingModel, topK: settings.ragTopK, minChunkTokens: 100, maxChunkTokens: 500 }
			: undefined;
		const previewResolution = resolvePromptAndTier(
			date, categorized, searches, claudeSessions,
			aiCallConfig, settings.profile,
			ragConfigPreview, classification, patterns, compressed, gitCommits,
			settings.promptsDir, settings.privacyTierOverride
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
			date, categorized, searches, claudeSessions,
			aiCallConfig, settings.profile,
			ragConfigPreview, classification, patterns,
			compressed, gitCommits,
			settings.promptsDir, settings.promptStrategy,
			articleClusters, settings.privacyTierOverride
		);
		console.log(`[${presetId}] AI: real summary generated`);
	}

	// ── 11. Render markdown ──────────────────────────────
	const md = renderMarkdown(
		date,
		visits,
		searches,
		claudeSessions,
		gitCommits,
		categorized,
		aiSummary,
		aiProviderUsed,
		knowledge,
		promptLog
	);

	// ── 12. Write file ───────────────────────────────────
	const filePath = join(outputDir, `${getPresetFilename(preset)}.md`);
	writeFileSync(filePath, md, "utf-8");
	console.log(`[${presetId}] Written to ${filePath}`);

	// ── 13. Assertions ───────────────────────────────────
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
