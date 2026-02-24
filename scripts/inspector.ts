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

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pipeline Inspector</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: ui-monospace, "Cascadia Code", "Fira Code", monospace; font-size: 13px; background: #1a1a1a; color: #d4d4d4; height: 100vh; display: flex; flex-direction: column; }
  header { padding: 10px 16px; background: #111; border-bottom: 1px solid #333; color: #888; font-size: 12px; }
  header strong { color: #ccc; }
  .workspace { display: flex; flex: 1; overflow: hidden; }
  .sidebar { width: 220px; min-width: 220px; background: #111; border-right: 1px solid #333; padding: 16px 12px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; }
  .sidebar label { display: block; color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px; }
  .sidebar input[type=date], .sidebar select { width: 100%; background: #1a1a1a; border: 1px solid #444; color: #d4d4d4; padding: 5px 7px; border-radius: 3px; font-family: inherit; font-size: 12px; }
  .sidebar input[type=date]:focus, .sidebar select:focus { outline: none; border-color: #7b68ee; }
  .radio-group { display: flex; gap: 0; border: 1px solid #444; border-radius: 3px; overflow: hidden; }
  .radio-group label { flex: 1; text-align: center; padding: 4px 0; cursor: pointer; color: #888; font-size: 11px; text-transform: none; letter-spacing: 0; margin: 0; }
  .radio-group input[type=radio] { display: none; }
  .radio-group input[type=radio]:checked + label { background: #7b68ee22; color: #7b68ee; }
  .btn-group { display: flex; gap: 6px; }
  button { flex: 1; padding: 7px 0; border: none; border-radius: 3px; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: 600; transition: opacity 0.1s; }
  button:disabled { opacity: 0.35; cursor: not-allowed; }
  #btn-step  { background: #7b68ee; color: #fff; }
  #btn-run   { background: #333; color: #ccc; border: 1px solid #555; }
  #btn-next  { background: #2d6a4f; color: #74c69d; border: 1px solid #2d6a4f; width: 100%; margin-top: 4px; display: none; }
  #btn-next.visible { display: block; }
  .main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .log-panel { flex: 0 0 auto; max-height: 240px; overflow-y: auto; border-bottom: 1px solid #333; padding: 10px 14px; display: flex; flex-direction: column; gap: 3px; }
  .stage-row { display: flex; align-items: center; gap: 10px; padding: 3px 0; font-size: 12px; }
  .stage-row .dot { width: 10px; text-align: center; flex-shrink: 0; }
  .stage-row .name { width: 90px; color: #ccc; }
  .stage-row .dur { width: 55px; color: #666; text-align: right; }
  .stage-row .detail { color: #888; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dot.running { animation: spin 0.8s linear infinite; display: inline-block; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .dot.done { color: #7b68ee; }
  .dot.skipped { color: #555; }
  .dot.error { color: #f87171; }
  .output-panel { flex: 1; overflow-y: auto; padding: 20px 24px; }
  .markdown-body { max-width: 760px; line-height: 1.6; color: #d4d4d4; }
  .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: #eee; border-bottom: 1px solid #333; padding-bottom: 4px; margin: 16px 0 8px; }
  .markdown-body code { background: #2a2a2a; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
  .markdown-body pre { background: #2a2a2a; padding: 10px; border-radius: 4px; overflow-x: auto; }
  .markdown-body a { color: #7b68ee; }
  .markdown-body ul, .markdown-body ol { padding-left: 20px; }
  .markdown-body blockquote { border-left: 3px solid #555; padding-left: 12px; color: #888; }
  .raw-toggle { margin-top: 16px; max-width: 760px; }
  .raw-toggle summary { color: #555; cursor: pointer; font-size: 11px; }
  .raw-toggle textarea { width: 100%; height: 200px; background: #111; border: 1px solid #333; color: #666; padding: 8px; font-family: inherit; font-size: 11px; margin-top: 6px; resize: vertical; }
  .error-msg { color: #f87171; padding: 12px; background: #2a1515; border-radius: 4px; border: 1px solid #5a2020; max-width: 760px; }
  .idle-msg { color: #555; font-size: 12px; padding: 20px 0; }
<\/style>
<\/head>
<body>
<header><strong>Pipeline Inspector<\/strong> &nbsp;\u00b7&nbsp; obsidian-claude-daily<\/header>
<div class="workspace">
  <div class="sidebar">
    <div>
      <label>Date<\/label>
      <input type="date" id="date" />
    <\/div>
    <div>
      <label>Preset<\/label>
      <select id="preset"><\/select>
    <\/div>
    <div>
      <label>Data<\/label>
      <div class="radio-group">
        <input type="radio" name="dataMode" id="dm-fixtures" value="fixtures" checked />
        <label for="dm-fixtures">fixtures<\/label>
        <input type="radio" name="dataMode" id="dm-real" value="real" />
        <label for="dm-real">real<\/label>
      <\/div>
    <\/div>
    <div>
      <label>AI<\/label>
      <div class="radio-group">
        <input type="radio" name="aiMode" id="ai-mock" value="mock" checked />
        <label for="ai-mock">mock<\/label>
        <input type="radio" name="aiMode" id="ai-real" value="real" />
        <label for="ai-real">real<\/label>
      <\/div>
    <\/div>
    <div class="btn-group">
      <button id="btn-step">Step<\/button>
      <button id="btn-run">Run All<\/button>
    <\/div>
    <button id="btn-next">Next Stage \u2192<\/button>
  <\/div>

  <div class="main">
    <div class="log-panel" id="log"><\/div>
    <div class="output-panel" id="output">
      <p class="idle-msg">Select a preset and click Step or Run All.<\/p>
    <\/div>
  <\/div>
<\/div>

<script>
const STAGES = ["collect","sanitize","sensitivity","categorize","classify","patterns","knowledge","summarize","render"];
let gotComplete = false;

(async function init() {
  document.getElementById("date").value = new Date().toISOString().slice(0, 10);

  const res = await fetch("/api/presets");
  const presets = await res.json();
  const sel = document.getElementById("preset");
  for (const p of presets) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.id;
    opt.title = p.description;
    sel.appendChild(opt);
  }

  document.getElementById("btn-step").addEventListener("click", () => startRun(true));
  document.getElementById("btn-run").addEventListener("click", () => startRun(false));
  document.getElementById("btn-next").addEventListener("click", advanceStep);
})().catch(function(err) {
  document.getElementById("output").innerHTML =
    '<div class="error-msg">Failed to initialize: ' + String(err) + '<\/div>';
});

function setRunning(running) {
  document.getElementById("btn-step").disabled = running;
  document.getElementById("btn-run").disabled = running;
}

function showNextBtn(visible) {
  document.getElementById("btn-next").classList.toggle("visible", visible);
}

async function startRun(stepMode) {
  gotComplete = false;
  setRunning(true);
  showNextBtn(false);

  const log = document.getElementById("log");
  const output = document.getElementById("output");
  log.innerHTML = "";
  output.innerHTML = '<p class="idle-msg">Running\u2026<\/p>';

  for (const name of STAGES) {
    const row = makeStageRow(name, "pending");
    row.id = "stage-" + name;
    log.appendChild(row);
  }

  const preset = document.getElementById("preset").value;
  const date = document.getElementById("date").value;
  const dataMode = document.querySelector('[name=dataMode]:checked').value;
  const aiMode = document.querySelector('[name=aiMode]:checked').value;

  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset, date, dataMode, aiMode, stepMode }),
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            handleEvent(JSON.parse(line.slice(6)));
          } catch (_) {}
        }
      }
    }
  } catch (err) {
    showError(String(err));
  } finally {
    setRunning(false);
    showNextBtn(false);
    if (!gotComplete) {
      showError("Run ended without a result \u2014 the server may have crashed.");
    }
  }
}

async function advanceStep() {
  showNextBtn(false);
  try {
    await fetch("/api/next", { method: "POST" });
  } catch (_err) {
    showNextBtn(true); // restore button if POST failed
  }
}

function handleEvent(evt) {
  if (evt.type === "stage") {
    updateStageRow(evt.name, evt.status, evt.durationMs, evt.detail);
  } else if (evt.type === "waiting") {
    showNextBtn(true);
  } else if (evt.type === "complete") {
    gotComplete = true;
    renderOutput(evt.markdown);
  } else if (evt.type === "error") {
    gotComplete = true; // error counts as a terminal event
    showError(evt.message);
  }
}

function dotChar(status) {
  if (status === "running") return "\u25cc";
  if (status === "done") return "\u25cf";
  if (status === "skipped") return "\u25cb";
  if (status === "pending") return "\u00b7";
  return "\u00b7";
}

function makeStageRow(name, status) {
  const row = document.createElement("div");
  row.className = "stage-row";
  row.innerHTML =
    '<span class="dot ' + status + '">' + dotChar(status) + '<\/span>' +
    '<span class="name">' + name + '<\/span>' +
    '<span class="dur"><\/span>' +
    '<span class="detail"><\/span>';
  return row;
}

function updateStageRow(name, status, durationMs, detail) {
  let row = document.getElementById("stage-" + name);
  if (!row) {
    row = makeStageRow(name, status);
    row.id = "stage-" + name;
    document.getElementById("log").appendChild(row);
  }
  const dot = row.querySelector(".dot");
  dot.className = "dot " + status;
  dot.textContent = dotChar(status);
  if (durationMs !== undefined) {
    row.querySelector(".dur").textContent = durationMs + "ms";
  }
  if (detail !== undefined) {
    row.querySelector(".detail").textContent = detail;
  }
}

function renderOutput(raw) {
  const output = document.getElementById("output");
  const html = marked.parse(raw);
  output.innerHTML =
    '<div class="markdown-body">' + html + '<\/div>' +
    '<details class="raw-toggle"><summary>Raw markdown<\/summary>' +
    '<textarea readonly>' + escapeHtml(raw) + '<\/textarea><\/details>';
}

function showError(msg) {
  document.getElementById("output").innerHTML =
    '<div class="error-msg">Error: ' + escapeHtml(msg) + '<\/div>';
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
<\/script>
<\/body>
<\/html>`;

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
			sseEvent(res, { type: "waiting", completedStage: name });
			await waitForNext();
		}
	}

	function skip(name: string): void {
		sseEvent(res, { type: "stage", name, status: "skipped" });
	}

	// ── 1. Collect ───────────────────────────────────────

	// Build the day's time window from the UI-selected date
	const dayStart = new Date(`${dateStr}T00:00:00`);
	const dayEnd = new Date(`${dateStr}T23:59:59.999`);

	let raw!: CollectedData;
	await stage("collect", async () => {
		raw = dataMode === "real"
			? await collectRealData(settings, dayStart, dayEnd)
			: await collectFixtureData(settings);
		return {
			detail: `${raw.visits.length} visits, ${raw.searches.length} searches, ` +
				`${raw.claudeSessions.length} sessions, ${raw.gitCommits.length} commits`,
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
	//
	// Note: In real-AI mode, summarizeDay selects the privacy tier internally (Tier 1-4)
	// based on settings. The promptLog will only show the mock/Tier-1 estimate
	// from the AI-disabled and mock branches above — not the actual prompt sent.

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
