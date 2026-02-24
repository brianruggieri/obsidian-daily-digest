/**
 * inspector.ts — Pipeline Inspector Web Server
 *
 * A browser-accessible UI for stepping through the 9-stage pipeline
 * with real or fixture data, with optional step-mode pausing between stages.
 *
 * Invoke via:
 *   npm run inspector
 *
 * Then open http://localhost:3747 in a browser.
 *
 * Routes:
 *   GET  /            — Serve inspector HTML UI
 *   GET  /api/presets — List available presets (id + description)
 *   POST /api/run     — Start a pipeline run (SSE stream)
 *   POST /api/next    — Advance to next step in step-mode
 */

import { createServer } from "http";
import type { IncomingMessage, ServerResponse } from "http";

import { PRESETS, resolvePreset } from "./presets";
import { collectFixtureData, collectRealData } from "./lib/collector-shim";
import type { CollectedData } from "./lib/collector-shim";
import { getMockSummary } from "./lib/mock-ai";
import { createPromptLog, appendPromptEntry, estimateTokens } from "./lib/prompt-logger";
import type { PromptLog } from "./lib/prompt-logger";

// src/ imports — obsidian is shimmed via tsconfig.scripts.json paths alias
import { sanitizeCollectedData } from "../src/sanitize";
import { filterSensitiveDomains } from "../src/sensitivity";
import { categorizeVisits } from "../src/categorize";
import { classifyEventsRuleOnly, classifyEvents } from "../src/classify";
import { extractPatterns, buildEmptyTopicHistory } from "../src/patterns";
import { generateKnowledgeSections } from "../src/knowledge";
import type { KnowledgeSections } from "../src/knowledge";
import { renderMarkdown } from "../src/renderer";
import { buildPrompt, summarizeDay } from "../src/summarize";

import type {
	SanitizeConfig,
	SensitivityConfig,
	ClassificationResult,
	PatternConfig,
	PatternAnalysis,
	AISummary,
} from "../src/types";
import type { AICallConfig } from "../src/ai-client";

// ── Constants ────────────────────────────────────────────

const PORT = 3747;

const VALID_DATA_MODES = ["fixtures", "real"] as const;
const VALID_AI_MODES = ["mock", "real"] as const;

// ── Step-mode state ──────────────────────────────────────

interface RunState {
	advance: () => void;
	timeoutId: ReturnType<typeof setTimeout>;
}
let currentRun: RunState | null = null;

function waitForNext(): Promise<void> {
	return new Promise<void>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			currentRun = null;
			reject(new Error("Step timeout — run cancelled after 60 seconds of inactivity"));
		}, 60_000);
		currentRun = { advance: resolve, timeoutId };
	});
}

// ── SSE helper ───────────────────────────────────────────

function sseEvent(res: ServerResponse, data: object): void {
	res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── HTML stub ────────────────────────────────────────────

const HTML = `<!DOCTYPE html><html><body><h1>Pipeline Inspector (UI coming later)</h1></body></html>`;

// ── Pipeline runner ──────────────────────────────────────

async function runPipeline(
	res: ServerResponse,
	presetId: string,
	dateStr: string,
	dataMode: "fixtures" | "real",
	aiMode: "mock" | "real",
	stepMode: boolean
): Promise<void> {
	const preset = PRESETS.find((p) => p.id === presetId);
	if (!preset) {
		throw new Error(`Unknown preset: "${presetId}"`);
	}
	const settings = resolvePreset(preset);
	const date = new Date(`${dateStr}T12:00:00`);

	// ── Stage helpers ──────────────────────────────────────

	async function stage(
		name: string,
		fn: () => Promise<{ detail?: string }> | { detail?: string }
	): Promise<void> {
		const t = Date.now();
		sseEvent(res, { type: "stage", name, status: "running" });
		const result = await fn();
		sseEvent(res, {
			type: "stage",
			name,
			status: "done",
			durationMs: Date.now() - t,
			detail: result.detail ?? "",
		});
		if (stepMode) {
			sseEvent(res, { type: "waiting", nextStage: name });
			await waitForNext();
		}
	}

	function skip(name: string): void {
		sseEvent(res, { type: "stage", name, status: "skipped" });
	}

	// ── 1. Collect ───────────────────────────────────────

	let raw!: CollectedData;
	await stage("collect", async () => {
		raw = dataMode === "real"
			? await collectRealData(settings)
			: await collectFixtureData(settings);
		return {
			detail: `${raw.visits.length} visits, ${raw.searches.length} searches, ` +
				`${raw.shell.length} shell, ${raw.claudeSessions.length} sessions, ` +
				`${raw.gitCommits.length} commits`,
		};
	});

	// ── 2. Sanitize ──────────────────────────────────────

	const sanitizeConfig: SanitizeConfig = {
		enabled: settings.enableSanitization,
		level: settings.sanitizationLevel,
		excludedDomains: settings.excludedDomains
			? settings.excludedDomains.split(",").map((d) => d.trim()).filter(Boolean)
			: [],
		redactPaths: settings.redactPaths,
		scrubEmails: settings.scrubEmails,
	};
	let sanitized!: ReturnType<typeof sanitizeCollectedData>;
	await stage("sanitize", () => {
		sanitized = sanitizeCollectedData(
			raw.visits,
			raw.searches,
			raw.shell,
			raw.claudeSessions,
			raw.gitCommits,
			sanitizeConfig
		);
		return { detail: sanitizeConfig.enabled ? `level=${sanitizeConfig.level}` : "disabled" };
	});

	// ── 3. Sensitivity filter ────────────────────────────

	const sensitivityConfig: SensitivityConfig = {
		enabled: settings.enableSensitivityFilter,
		categories: settings.sensitivityCategories,
		customDomains: settings.sensitivityCustomDomains
			? settings.sensitivityCustomDomains.split(",").map((d) => d.trim()).filter(Boolean)
			: [],
		action: settings.sensitivityAction,
	};
	let filteredVisits!: typeof sanitized.visits;
	await stage("sensitivity", () => {
		const result = filterSensitiveDomains(sanitized.visits, sensitivityConfig);
		filteredVisits = result.kept;
		const excluded = sanitized.visits.length - result.kept.length;
		return {
			detail: sensitivityConfig.enabled
				? `${excluded} excluded (${sensitivityConfig.action})`
				: "disabled",
		};
	});

	// ── 4. Categorize ────────────────────────────────────

	let categorized!: ReturnType<typeof categorizeVisits>;
	await stage("categorize", () => {
		categorized = categorizeVisits(filteredVisits);
		const cats = Object.entries(categorized)
			.filter(([, v]) => Array.isArray(v) && v.length > 0)
			.map(([k]) => k);
		return { detail: `${cats.length} categories` };
	});

	// ── 5. Classify ──────────────────────────────────────

	let classification: ClassificationResult | undefined;
	if (settings.enableClassification || settings.enablePatterns) {
		await stage("classify", async () => {
			if (aiMode === "real" && settings.enableClassification) {
				const classifyConfig = {
					enabled: true,
					endpoint: settings.localEndpoint,
					model: settings.classificationModel,
					batchSize: settings.classificationBatchSize,
				};
				classification = await classifyEvents(
					filteredVisits,
					sanitized.searches,
					sanitized.shellCommands,
					sanitized.claudeSessions,
					sanitized.gitCommits,
					categorized,
					classifyConfig
				);
				return { detail: `LLM: ${classification.llmClassified} events` };
			} else {
				classification = classifyEventsRuleOnly(
					filteredVisits,
					sanitized.searches,
					sanitized.shellCommands,
					sanitized.claudeSessions,
					sanitized.gitCommits,
					categorized
				);
				return { detail: "rule-only" };
			}
		});
	} else {
		skip("classify");
	}

	// ── 6. Patterns ──────────────────────────────────────

	let patterns: PatternAnalysis | undefined;
	if (settings.enablePatterns && classification) {
		await stage("patterns", () => {
			const patternConfig: PatternConfig = {
				enabled: true,
				cooccurrenceWindow: settings.patternCooccurrenceWindow,
				minClusterSize: settings.patternMinClusterSize,
				trackRecurrence: settings.trackRecurrence,
			};
			patterns = extractPatterns(classification!, patternConfig, buildEmptyTopicHistory(), dateStr);
			return {
				detail: `focus=${Math.round(patterns.focusScore * 100)}%, clusters=${patterns.temporalClusters.length}`,
			};
		});
	} else {
		skip("patterns");
	}

	// ── 7. Knowledge ─────────────────────────────────────

	let knowledge: KnowledgeSections | undefined;
	if (patterns) {
		await stage("knowledge", () => {
			knowledge = generateKnowledgeSections(patterns!);
			return { detail: "" };
		});
	} else {
		skip("knowledge");
	}

	// ── 8. Summarize ─────────────────────────────────────

	const promptLog: PromptLog = createPromptLog();
	let aiSummary: AISummary | null = null;
	const aiProviderUsed = (settings.enableAI ? settings.aiProvider : "none") as
		"none" | "anthropic" | "local";

	if (!settings.enableAI || settings.aiProvider === "none") {
		skip("summarize");
	} else if (aiMode === "mock") {
		await stage("summarize", () => {
			const promptText = buildPrompt(
				date,
				categorized,
				sanitized.searches,
				sanitized.shellCommands,
				sanitized.claudeSessions,
				settings.profile,
				sanitized.gitCommits
			);
			appendPromptEntry(promptLog, {
				stage: "summarize",
				model: settings.aiModel ?? "mock",
				tokenCount: estimateTokens(promptText),
				privacyTier: 1,
				prompt: promptText,
			});
			aiSummary = getMockSummary(presetId);
			return { detail: "mock" };
		});
	} else {
		const apiKey = process.env.ANTHROPIC_API_KEY ?? "";
		if (!apiKey && settings.aiProvider === "anthropic") {
			throw new Error("ANTHROPIC_API_KEY not set in environment or .env file");
		}
		const aiCallConfig: AICallConfig = {
			provider: settings.aiProvider as "anthropic" | "local",
			anthropicApiKey: apiKey,
			anthropicModel: settings.aiModel ?? "claude-haiku-4-5-20251001",
			localEndpoint: settings.localEndpoint,
			localModel: settings.localModel,
		};
		await stage("summarize", async () => {
			const promptText = buildPrompt(
				date,
				categorized,
				sanitized.searches,
				sanitized.shellCommands,
				sanitized.claudeSessions,
				settings.profile,
				sanitized.gitCommits
			);
			appendPromptEntry(promptLog, {
				stage: "summarize",
				model: aiCallConfig.anthropicModel ?? aiCallConfig.localModel ?? "unknown",
				tokenCount: estimateTokens(promptText),
				privacyTier: 1,
				prompt: promptText,
			});
			aiSummary = await summarizeDay(
				date,
				categorized,
				sanitized.searches,
				sanitized.shellCommands,
				sanitized.claudeSessions,
				aiCallConfig,
				settings.profile,
				undefined,
				classification,
				patterns,
				undefined,
				sanitized.gitCommits
			);
			return { detail: `model=${aiCallConfig.anthropicModel ?? aiCallConfig.localModel}` };
		});
	}

	// ── 9. Render ────────────────────────────────────────

	let md!: string;
	await stage("render", () => {
		md = renderMarkdown(
			date,
			filteredVisits,
			sanitized.searches,
			sanitized.shellCommands,
			sanitized.claudeSessions,
			sanitized.gitCommits,
			categorized,
			aiSummary,
			aiProviderUsed,
			knowledge,
			promptLog
		);
		return { detail: `${md.length} chars` };
	});

	sseEvent(res, { type: "complete", markdown: md });
}

// ── Body reader ──────────────────────────────────────────

async function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		let body = "";
		req.on("data", (chunk) => (body += chunk));
		req.on("end", () => resolve(body));
	});
}

// ── HTTP server ──────────────────────────────────────────

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
	const method = req.method ?? "GET";
	const url = req.url ?? "/";

	// GET / — serve HTML UI
	if (method === "GET" && url === "/") {
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(HTML);
		return;
	}

	// GET /api/presets — list preset ids and descriptions
	if (method === "GET" && url === "/api/presets") {
		const presets = PRESETS.map(p => ({ id: p.id, description: p.description }));
		res.writeHead(200, {
			"Content-Type": "application/json",
			"Access-Control-Allow-Origin": "*",
		});
		res.end(JSON.stringify(presets));
		return;
	}

	// POST /api/next — advance step-mode to the next stage
	if (method === "POST" && url === "/api/next") {
		if (currentRun) {
			const run = currentRun;
			currentRun = null;
			clearTimeout(run.timeoutId);
			run.advance();
		}
		res.writeHead(204);
		res.end();
		return;
	}

	// POST /api/run — start a pipeline run, stream results via SSE
	if (method === "POST" && url === "/api/run") {
		// Cancel any in-progress run first
		if (currentRun) {
			const run = currentRun;
			currentRun = null;
			clearTimeout(run.timeoutId);
			run.advance();
		}

		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			"Connection": "keep-alive",
			"Access-Control-Allow-Origin": "*",
		});

		let body: string;
		try {
			body = await readBody(req);
		} catch (err) {
			sseEvent(res, { type: "error", message: `Failed to read request body: ${String(err)}` });
			res.end();
			return;
		}

		let params: {
			preset?: string;
			date?: string;
			dataMode?: string;
			aiMode?: string;
			stepMode?: boolean;
		};
		try {
			params = JSON.parse(body);
		} catch (err) {
			sseEvent(res, { type: "error", message: `Invalid JSON body: ${String(err)}` });
			res.end();
			return;
		}

		const presetId = params.preset ?? "no-ai-minimal";
		const dateStr = params.date ?? new Date().toISOString().slice(0, 10);
		const rawDataMode = params.dataMode ?? "fixtures";
		const rawAiMode = params.aiMode ?? "mock";
		const stepMode = params.stepMode ?? false;

		const preset = PRESETS.find(p => p.id === presetId);
		if (!preset) {
			sseEvent(res, { type: "error", message: `Unknown preset: "${presetId}"` });
			res.end();
			return;
		}

		if (!VALID_DATA_MODES.includes(rawDataMode as typeof VALID_DATA_MODES[number])) {
			sseEvent(res, { type: "error", message: `Invalid dataMode: "${rawDataMode}"` });
			res.end();
			return;
		}
		if (!VALID_AI_MODES.includes(rawAiMode as typeof VALID_AI_MODES[number])) {
			sseEvent(res, { type: "error", message: `Invalid aiMode: "${rawAiMode}"` });
			res.end();
			return;
		}
		const dataMode = rawDataMode as "fixtures" | "real";
		const aiMode = rawAiMode as "mock" | "real";

		try {
			await runPipeline(res, presetId, dateStr, dataMode, aiMode, stepMode);
		} catch (err) {
			sseEvent(res, { type: "error", message: String(err) });
		} finally {
			res.end();
		}
		return;
	}

	// Catch-all — 404
	res.writeHead(404, { "Content-Type": "text/plain" });
	res.end("Not found");
});

server.listen(PORT, () => {
	console.log(`Pipeline Inspector running at http://localhost:${PORT}`);
});
