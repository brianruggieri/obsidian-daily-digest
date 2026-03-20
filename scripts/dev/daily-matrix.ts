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
import type { Preset } from "./presets";
import { collectFixtureData, collectRealData } from "../lib/collector-shim";
import { getMockSummary } from "../lib/mock-ai";
import { createPromptLog, appendPromptEntry, estimateTokens } from "../../src/plugin/prompt-logger";
import type { PromptLog } from "../../src/plugin/prompt-logger";
import { runAssertions, writeReport } from "../lib/assertion-runner";
import type { MatrixReport, PresetReport } from "../lib/assertion-runner";

// src/ imports — obsidian is shimmed via tsconfig.scripts.json paths alias
import { sanitizeCollectedData } from "../../src/filter/sanitize";
import { filterSensitiveDomains, filterSensitiveSearches } from "../../src/filter/sensitivity";
import { categorizeVisits } from "../../src/filter/categorize";
import { classifyEventsRuleOnly, classifyEvents } from "../../src/filter/classify";
import { extractPatterns, buildEmptyTopicHistory, DEFAULT_COOCCURRENCE_WINDOW, DEFAULT_MIN_CLUSTER_SIZE } from "../../src/analyze/patterns";
import { generateKnowledgeSections } from "../../src/analyze/knowledge";
import { clusterArticles } from "../../src/analyze/clusters";
import { linkSearchesToVisits } from "../../src/analyze/intent";
import { computeEngagementScore } from "../../src/analyze/engagement";
import { cleanTitle } from "../../src/collect/browser";
import { groupCommitsIntoWorkUnits } from "../../src/analyze/commits";
import { groupClaudeSessionsIntoTasks, detectSearchMissions, fuseCrossSourceSessions } from "../../src/analyze/task-sessions";
import { compressActivity } from "../../src/summarize/compress";
import { renderMarkdown } from "../../src/render/renderer";
import { buildPrompt, summarizeDay, resolvePrivacyTier, buildTierFilteredOptions, buildProsePrompt, resolvePromptCapability } from "../../src/summarize/summarize";
import { submitAnthropicBatch, pollAnthropicBatch, retrieveAnthropicBatchResults } from "../../src/summarize/ai-client";
import type { AnthropicBatchRequest } from "../../src/summarize/ai-client";
import { parseProseSections } from "../../src/summarize/prose-parser";

import type {
	SensitivityConfig,
	ClassificationResult,
	PatternConfig,
	PatternAnalysis,
	AISummary,
	ArticleCluster,
	BrowserVisit,
	SearchQuery,
	ClaudeSession,
	GitCommit,
	CategorizedVisits,
} from "../../src/types";
import type { KnowledgeSections } from "../../src/analyze/knowledge";
import type { AICallConfig } from "../../src/summarize/ai-client";
import type { AIProvider } from "../../src/settings/types";

// ── Env vars ─────────────────────────────────────────────

const AI_MODE = (process.env.AI_MODE ?? "mock") as "real" | "mock";
const DATA_MODE = (process.env.DATA_MODE ?? "fixtures") as "real" | "fixtures";
const PRESET_FILTER = process.env.PRESET ?? "all";
const GROUP_FILTER = process.env.GROUP ?? "";  // "no-ai", "local", "cloud", or "" for all
const DATE_STR = process.env.DATE ?? new Date().toISOString().slice(0, 10);
const ASSERT = process.env.MATRIX_ASSERT === "true";
const BATCH_MODE = process.argv.includes("--batch");

const VAULT_ROOT = join(homedir(), "obsidian-vaults", "daily-digest-test");

// ── Preset pipeline data (stages 1–9) ───────────────────
//
// Carries all data produced by the non-AI pipeline stages so it can be
// used both to build the prompt (stage 10) and to render the output (stage 11).

interface PresetPipelineData {
	presetId: string;
	preset: Preset;
	settings: ReturnType<typeof resolvePreset>;
	visits: BrowserVisit[];
	searches: SearchQuery[];
	claudeSessions: ClaudeSession[];
	gitCommits: GitCommit[];
	categorized: CategorizedVisits;
	classification: ClassificationResult;
	patterns: PatternAnalysis | undefined;
	knowledge: KnowledgeSections | undefined;
	articleClusters: ArticleCluster[];
	aiCallConfig: AICallConfig;
	compressed: ReturnType<typeof compressActivity>;
	prompt: string;
	tier: 1 | 2 | 3 | 4;
	promptLog: PromptLog;
	aiProviderUsed: AIProvider;
}

// ── Stages 1–9: Collect → Semantic extraction ────────────
//
// KEEP IN SYNC WITH src/plugin/main.ts PIPELINE.
//
// This function mirrors the plugin's generateNote() method stage-for-stage.
// Whenever main.ts gains a new pipeline stage, add it here in the same order.
// Verify with: npx tsc --project scripts/tsconfig.json --noEmit

async function computePresetData(
	presetId: string,
	date: Date
): Promise<PresetPipelineData | null> {
	const preset = PRESETS.find((p) => p.id === presetId);
	if (!preset) {
		console.error(`[${presetId}] ERROR: preset not found`);
		return null;
	}

	const settings = resolvePreset(preset);

	// ── 1. Collect ──────────────────────────────────────
	const since = new Date(date);
	since.setHours(0, 0, 0, 0);
	const until = new Date(since);
	until.setDate(until.getDate() + 1);

	const raw = DATA_MODE === "real"
		? await collectRealData(settings, since, until)
		: await collectFixtureData(settings);

	// ── 2. Sensitivity filter ───────────────────────────
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
	const sanitized = sanitizeCollectedData(
		rawVisits, rawSearches, raw.claudeSessions, raw.gitCommits
	);
	const visits = sanitized.visits;
	const searches = sanitized.searches;
	const claudeSessions = sanitized.claudeSessions;
	const gitCommits = sanitized.gitCommits;

	// ── 4. Categorize ────────────────────────────────────
	const categorized = categorizeVisits(visits);

	// ── 5. Classify ──────────────────────────────────────
	const useAI = settings.enableAI && settings.aiProvider !== "none";
	let classification: ClassificationResult = classifyEventsRuleOnly(
		visits, searches, claudeSessions, gitCommits, categorized
	);

	if (AI_MODE === "real" && settings.enableClassification && useAI) {
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
			console.warn(`[${presetId}] LLM classification failed, using rule-based:`, e);
		}
	}

	// ── 6. Article Clustering ────────────────────────────
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

	if (classification.events.length > 0) {
		const patternConfig: PatternConfig = {
			enabled: true,
			cooccurrenceWindow: DEFAULT_COOCCURRENCE_WINDOW,
			minClusterSize: DEFAULT_MIN_CLUSTER_SIZE,
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

	// ── Build prompt (for logging and batch submission) ──
	const aiProviderUsed: AIProvider = useAI ? settings.aiProvider : "none";
	const promptLog: PromptLog = createPromptLog();
	const aiCallConfig: AICallConfig = {
		provider: settings.aiProvider,
		anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? (AI_MODE === "mock" ? "mock-key" : ""),
		anthropicModel: settings.aiModel ?? "claude-haiku-4-5-20251001",
		localEndpoint: settings.localEndpoint,
		localModel: settings.localModel,
	};
	const compressed = compressActivity(categorized, searches, claudeSessions, gitCommits, settings.promptBudget);
	const tier = resolvePrivacyTier(aiCallConfig, settings.privacyTier);
	const proseOptions = buildTierFilteredOptions(tier, {
		categorized, searches, claudeSessions, gitCommits,
		compressed, classification, patterns, articleClusters,
	});
	const modelName = aiCallConfig.provider === "anthropic" ? aiCallConfig.anthropicModel : aiCallConfig.localModel;
	const capability = resolvePromptCapability(modelName, aiCallConfig.provider);
	const prompt = buildProsePrompt(date, settings.profile, proseOptions, settings.promptsDir, capability, tier);
	appendPromptEntry(promptLog, {
		stage: "summarize",
		model: aiCallConfig.provider === "local"
			? (aiCallConfig.localModel ?? "local")
			: (aiCallConfig.anthropicModel ?? (AI_MODE === "mock" ? "mock" : "unknown")),
		tokenCount: estimateTokens(prompt),
		privacyTier: tier,
		prompt,
	});

	return {
		presetId, preset, settings,
		visits, searches, claudeSessions, gitCommits,
		categorized, classification, patterns, knowledge, articleClusters,
		aiCallConfig, compressed, prompt, tier, promptLog, aiProviderUsed,
	};
}

// ── Stage 11: Render + write ─────────────────────────────

function renderAndWrite(
	data: PresetPipelineData,
	aiSummary: AISummary | null,
	outputDir: string,
	start: number,
	date: Date
): PresetReport | null {
	const { presetId, preset, visits, searches, claudeSessions, gitCommits,
		categorized, knowledge, promptLog, aiProviderUsed } = data;
	const md = renderMarkdown(
		date, visits, searches, claudeSessions, gitCommits,
		categorized, aiSummary, aiProviderUsed, knowledge, promptLog
	);

	const filePath = join(outputDir, `${getPresetFilename(preset)}.md`);
	writeFileSync(filePath, md, "utf-8");
	console.log(`[${presetId}] Written to ${filePath}`);

	if (ASSERT) {
		const durationMs = Date.now() - start;
		const report = runAssertions(md, presetId, filePath, durationMs, {
			aiEnabled: data.settings.enableAI && data.settings.aiProvider !== "none",
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

// ── Per-preset runner (sequential mode) ─────────────────
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
//  11. Render markdown            ✓

async function runPreset(
	presetId: string,
	date: Date,
	outputDir: string
): Promise<PresetReport | null> {
	const start = Date.now();
	console.log(`\n[${presetId}] Starting...`);

	const data = await computePresetData(presetId, date);
	if (!data) return null;

	const { settings, aiCallConfig, compressed, prompt, tier } = data;
	const useAI = settings.enableAI && settings.aiProvider !== "none";

	// ── 10. AI summary + prompt log ──────────────────────
	let aiSummary: AISummary | null = null;

	if (!useAI) {
		console.log(`[${presetId}] AI: disabled`);
	} else if (AI_MODE === "mock") {
		aiSummary = getMockSummary(presetId);
		console.log(`[${presetId}] AI: mock (tier ${tier}, ${estimateTokens(prompt)} tokens)`);
	} else {
		// AI_MODE === "real"
		console.log(`[${presetId}] Compressed: ~${compressed.tokenEstimate} tokens (budget: ${settings.promptBudget})`);
		aiSummary = await summarizeDay(
			date, data.categorized, data.searches, data.claudeSessions,
			aiCallConfig, settings.profile,
			data.classification, data.patterns,
			compressed, data.gitCommits,
			settings.promptsDir,
			data.articleClusters, settings.privacyTier
		);
		console.log(`[${presetId}] AI: real summary generated`);
	}

	// ── 11. Render markdown ──────────────────────────────
	return renderAndWrite(data, aiSummary, outputDir, start, date);
}

// ── Batch mode runner ────────────────────────────────────
//
// Collects prompts for all cloud (Anthropic) presets, submits them as a
// single Message Batches API request, then polls until the batch completes.
// Non-Anthropic presets run sequentially as usual.

async function runBatchMode(
	presetsToRun: Preset[],
	date: Date,
	outputDir: string
): Promise<PresetReport[]> {
	console.log(`\nBatch mode: pre-computing pipeline for ${presetsToRun.length} presets...`);

	// Stage 1–9 for all presets in parallel-ish (sequential to avoid I/O contention)
	const allData: PresetPipelineData[] = [];
	for (const preset of presetsToRun) {
		console.log(`\n[${preset.id}] Pipeline (stages 1–9)...`);
		const data = await computePresetData(preset.id, date);
		if (data) allData.push(data);
	}

	// Separate cloud (Anthropic) presets from others
	const anthropicData = allData.filter(
		(d) => d.settings.enableAI && d.settings.aiProvider === "anthropic"
	);
	const nonAnthropicData = allData.filter(
		(d) => !(d.settings.enableAI && d.settings.aiProvider === "anthropic")
	);

	const reports: PresetReport[] = [];
	const startTimes: Map<string, number> = new Map(allData.map((d) => [d.presetId, Date.now()]));

	// ── Run non-Anthropic presets sequentially ────────────
	for (const data of nonAnthropicData) {
		const useAI = data.settings.enableAI && data.settings.aiProvider !== "none";
		let aiSummary: AISummary | null = null;

		if (!useAI) {
			console.log(`\n[${data.presetId}] AI: disabled`);
		} else if (AI_MODE === "mock") {
			aiSummary = getMockSummary(data.presetId);
			console.log(`\n[${data.presetId}] AI: mock`);
		} else {
			aiSummary = await summarizeDay(
				date, data.categorized, data.searches, data.claudeSessions,
				data.aiCallConfig, data.settings.profile,
				data.classification, data.patterns,
				data.compressed, data.gitCommits,
				data.settings.promptsDir,
				data.articleClusters, data.settings.privacyTier
			);
			console.log(`\n[${data.presetId}] AI: real summary generated`);
		}

		const report = renderAndWrite(data, aiSummary, outputDir, startTimes.get(data.presetId)!, date);
		if (ASSERT && report) reports.push(report);
	}

	// ── Submit Anthropic presets as a batch ───────────────
	if (anthropicData.length === 0) {
		return reports;
	}

	const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
	const summaryMap: Map<string, AISummary | null> = new Map();

	if (AI_MODE === "mock") {
		// In mock mode, skip the network call and use mock summaries
		for (const data of anthropicData) {
			summaryMap.set(data.presetId, getMockSummary(data.presetId));
			console.log(`\n[${data.presetId}] AI: mock (batch mode)`);
		}
	} else {
		// Build one batch request per preset
		const batchRequests: AnthropicBatchRequest[] = anthropicData.map((data) => ({
			custom_id: data.presetId,
			params: {
				model: data.aiCallConfig.anthropicModel,
				max_tokens: 1500,
				messages: [{ role: "user" as const, content: data.prompt }],
			},
		}));

		console.log(`\nSubmitting batch with ${batchRequests.length} request(s) to Anthropic...`);
		const batch = await submitAnthropicBatch(batchRequests, apiKey);
		console.log(`Batch submitted: ${batch.id} (status: ${batch.processing_status})`);

		// Poll until ended
		const completed = await pollAnthropicBatch(batch.id, apiKey, { intervalMs: 5000 });
		console.log(
			`Batch ${completed.id} ended — ` +
			`${completed.request_counts.succeeded} succeeded, ` +
			`${completed.request_counts.errored} errored`
		);

		// Retrieve JSONL results
		const resultsUrl = completed.results_url ?? `https://api.anthropic.com/v1/messages/batches/${completed.id}/results`;
		const resultItems = await retrieveAnthropicBatchResults(resultsUrl, apiKey);

		for (const item of resultItems) {
			if (item.result.type === "succeeded") {
				const text = item.result.message.content[0]?.text ?? "";
				summaryMap.set(item.custom_id, parseProseSections(text));
			} else {
				const reason = item.result.type === "errored"
					? item.result.error.message
					: item.result.type;
				console.warn(`[${item.custom_id}] Batch request ${item.result.type}: ${reason}`);
				summaryMap.set(item.custom_id, null);
			}
		}
	}

	// ── Render all Anthropic preset results ──────────────
	for (const data of anthropicData) {
		const aiSummary = summaryMap.get(data.presetId) ?? null;
		const report = renderAndWrite(data, aiSummary, outputDir, startTimes.get(data.presetId)!, date);
		if (ASSERT && report) reports.push(report);
	}

	return reports;
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
	console.log(`  Batch:     ${BATCH_MODE}`);
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

	let reports: PresetReport[] = [];

	if (BATCH_MODE) {
		reports = await runBatchMode(presetsToRun, date, outputDir);
	} else {
		// Run presets sequentially (default)
		for (const preset of presetsToRun) {
			const report = await runPreset(preset.id, date, outputDir);
			if (ASSERT && report) {
				reports.push(report);
			}
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
