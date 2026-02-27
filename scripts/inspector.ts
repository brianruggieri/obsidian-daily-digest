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
import { sanitizeCollectedData } from "../src/filter/sanitize";
import { filterSensitiveDomains } from "../src/filter/sensitivity";
import { categorizeVisits } from "../src/filter/categorize";
import { classifyEventsRuleOnly, classifyEvents } from "../src/filter/classify";
import { extractPatterns, buildEmptyTopicHistory } from "../src/analyze/patterns";
import { generateKnowledgeSections } from "../src/analyze/knowledge";
import type { KnowledgeSections } from "../src/analyze/knowledge";
import { renderMarkdown } from "../src/render/renderer";
import { buildPrompt, summarizeDay } from "../src/summarize/summarize";

import type {
	BrowserVisit,
	SearchQuery,
	ClaudeSession,
	GitCommit,
	SanitizeConfig,
	SensitivityConfig,
	ClassificationResult,
	PatternConfig,
	PatternAnalysis,
	AISummary,
} from "../src/types";
import type { AICallConfig } from "../src/summarize/ai-client";

// ── Stage data snapshot helpers ──────────────────────────
// Build compact summaries of stage output for the inspector UI.
// We truncate arrays to keep SSE payloads reasonable.

const SAMPLE_LIMIT = 8;

function sampleVisits(visits: BrowserVisit[]) {
	return visits.slice(0, SAMPLE_LIMIT).map(v => ({
		title: (v.title || "").slice(0, 80),
		domain: v.domain ?? "",
		time: v.time ? v.time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : null,
	}));
}

function sampleSearches(searches: SearchQuery[]) {
	return searches.slice(0, SAMPLE_LIMIT).map(s => ({
		query: s.query,
		engine: s.engine,
		time: s.time ? s.time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }) : null,
	}));
}

function sampleSessions(sessions: ClaudeSession[]) {
	return sessions.slice(0, SAMPLE_LIMIT).map(s => ({
		prompt: s.prompt.slice(0, 100),
		project: s.project,
		time: s.time.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
	}));
}

function sampleCommits(commits: GitCommit[]) {
	return commits.slice(0, SAMPLE_LIMIT).map(c => ({
		hash: c.hash.slice(0, 7),
		message: c.message.slice(0, 80),
		repo: c.repo,
		stats: c.filesChanged > 0 ? `+${c.insertions}/-${c.deletions}` : "",
	}));
}

function summarizeOutput(summary: AISummary | null, promptLog: PromptLog) {
	if (!summary) return { skipped: true };
	return {
		headline: summary.headline,
		tldr: summary.tldr,
		themes: summary.themes,
		notable: summary.notable,
		category_summaries: summary.category_summaries,
		work_patterns: summary.work_patterns,
		questions: summary.questions,
		promptLog: promptLog.map(e => ({
			stage: e.stage,
			model: e.model,
			tokens: e.tokenCount,
			tier: e.privacyTier,
		})),
	};
}

function classifyOutput(c: ClassificationResult) {
	// Tally activity types and top topics
	const typeCounts: Record<string, number> = {};
	const topicCounts: Record<string, number> = {};
	for (const e of c.events) {
		typeCounts[e.activityType] = (typeCounts[e.activityType] || 0) + 1;
		for (const t of e.topics) {
			topicCounts[t] = (topicCounts[t] || 0) + 1;
		}
	}
	const topTopics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
	return {
		totalEvents: c.totalProcessed,
		llmClassified: c.llmClassified,
		ruleClassified: c.ruleClassified,
		activityTypes: typeCounts,
		topTopics: Object.fromEntries(topTopics),
		sampleEvents: c.events.slice(0, SAMPLE_LIMIT).map(e => ({
			source: e.source,
			activityType: e.activityType,
			intent: e.intent,
			topics: e.topics,
			summary: e.summary.slice(0, 80),
		})),
	};
}

// ── Constants ────────────────────────────────────────────

const PORT = process.env.INSPECTOR_PORT ? parseInt(process.env.INSPECTOR_PORT, 10) : 3747;

const VALID_DATA_MODES = ["fixtures", "real"] as const;
const VALID_AI_MODES = ["mock", "real"] as const;

// ── Step-mode state ──────────────────────────────────────

interface RunState {
	advance: () => void;
	timeoutId: ReturnType<typeof setTimeout>;
}
let currentRun: RunState | null = null;
let pendingAdvance = false;

// Run ID: incremented on each new /api/run, checked by the pipeline to
// detect that a newer run has started and the current one should bail out.
let activeRunId = 0;

function waitForNext(runId: number): Promise<void> {
	// If this run has been superseded, bail immediately.
	if (runId !== activeRunId) {
		console.log(`[step] waitForNext → run ${runId} superseded by ${activeRunId}, bailing`);
		return Promise.reject(new Error("__cancelled__"));
	}
	// If a /api/next arrived before waitForNext was called (race between
	// the client clicking "Next Stage" and the server setting up the wait),
	// resolve immediately instead of blocking.
	if (pendingAdvance) {
		pendingAdvance = false;
		console.log("[step] waitForNext → consuming pendingAdvance, resolving immediately");
		return Promise.resolve();
	}
	console.log("[step] waitForNext → blocking until /api/next");
	return new Promise<void>((resolve, reject) => {
		const timeoutId = setTimeout(() => {
			currentRun = null;
			console.log("[step] waitForNext → TIMED OUT after 60s");
			reject(new Error("Step timeout — run cancelled after 60 seconds of inactivity"));
		}, 60_000);
		currentRun = { advance: resolve, timeoutId };
	});
}

// ── SSE helper ───────────────────────────────────────────

function sseEvent(res: ServerResponse, data: object): void {
	const json = JSON.stringify(data);
	const preview = json.length > 120 ? json.slice(0, 120) + "…" : json;
	console.log(`[sse] → ${preview}`);
	res.write(`data: ${json}\n\n`);
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
  .stage-output { max-width: 900px; }
  .stage-output h3 { color: #7b68ee; font-size: 14px; margin-bottom: 12px; text-transform: capitalize; }
  .stage-row:hover { background: #222; }
  .stage-row .name { cursor: pointer; }
  .json-obj { padding-left: 16px; border-left: 1px solid #333; margin: 2px 0; }
  .json-arr { padding-left: 16px; border-left: 1px solid #2d4a3f; margin: 2px 0; }
  .json-row { padding: 1px 0; }
  .json-item { padding: 1px 0; }
  .json-key { color: #7b68ee; }
  .json-str { color: #a5d6a7; }
  .json-num { color: #f0c674; }
  .json-null { color: #666; font-style: italic; }
  .json-empty { color: #666; }
  .json-count { color: #666; font-size: 11px; }
  .json-bracket { color: #666; }
  .json-ellipsis { color: #555; font-style: italic; }
  .mode-toggle { display: flex; gap: 0; border: 1px solid #444; border-radius: 3px; overflow: hidden; }
  .mode-toggle button { flex: 1; background: #1a1a1a; color: #888; border: none; border-radius: 0; font-size: 11px; padding: 4px 0; cursor: pointer; font-family: inherit; font-weight: 400; transition: none; }
  .mode-toggle button.active { background: #7b68ee22; color: #7b68ee; }
  #preset-b-group { display: none; }
  #preset-b-group.visible { display: block; }
  .compare-layout { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .compare-col h4 { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; border-bottom: 1px solid #222; padding-bottom: 4px; }
  .diff-section { margin-top: 20px; padding-top: 16px; border-top: 1px solid #333; }
  .diff-section h4 { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
  .diff-table { width: 100%; border-collapse: collapse; font-size: 12px; max-width: 600px; }
  .diff-table th { color: #666; text-align: left; padding: 4px 10px; border-bottom: 1px solid #333; font-weight: 400; }
  .diff-table td { padding: 3px 10px; border-bottom: 1px solid #1e1e1e; }
  .diff-table .field { color: #666; }
  .diff-table .val-a { color: #a5d6a7; }
  .diff-table .val-b { color: #9b8fef; }
  .diff-changed td { background: #1c1c2a; }
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
      <label>Mode<\/label>
      <div class="mode-toggle">
        <button id="mode-single" class="active">Single<\/button>
        <button id="mode-compare">Compare<\/button>
      <\/div>
    <\/div>
    <div>
      <label>Preset A<\/label>
      <select id="preset"><\/select>
    <\/div>
    <div id="preset-b-group">
      <label>Preset B<\/label>
      <select id="preset-b"><\/select>
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
let runController = null;
let stageDataCache = {};  // name -> data object, for clicking back to view
let compareMode = false;

function populatePresetDropdown(sel, presets) {
  const groups = { "no-ai": [], "local": [], "cloud": [] };
  for (const p of presets) (groups[p.privacyGroup] || []).push(p);
  const labels = { "no-ai": "No AI", "local": "Local LLM", "cloud": "Cloud" };
  for (const [groupKey, groupPresets] of Object.entries(groups)) {
    if (!groupPresets.length) continue;
    const optgroup = document.createElement("optgroup");
    optgroup.label = labels[groupKey] + " (most \u2192 least private)";
    for (const p of groupPresets) {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.id;
      opt.title = p.description;
      optgroup.appendChild(opt);
    }
    sel.appendChild(optgroup);
  }
}

function setMode(mode) {
  compareMode = mode === "compare";
  document.getElementById("mode-single").classList.toggle("active", !compareMode);
  document.getElementById("mode-compare").classList.toggle("active", compareMode);
  document.getElementById("preset-b-group").classList.toggle("visible", compareMode);
  document.getElementById("btn-step").disabled = compareMode;
}

(async function init() {
  document.getElementById("date").value = new Date().toISOString().slice(0, 10);

  const res = await fetch("/api/presets");
  const presets = await res.json();
  const selA = document.getElementById("preset");
  const selB = document.getElementById("preset-b");
  populatePresetDropdown(selA, presets);
  populatePresetDropdown(selB, presets);
  // Default preset-b to the second option so compare starts with a meaningful diff
  if (selB.options.length > 1) selB.selectedIndex = 1;

  document.getElementById("btn-step").addEventListener("click", () => startRun(true));
  document.getElementById("btn-run").addEventListener("click", () => compareMode ? startCompare() : startRun(false));
  document.getElementById("btn-next").addEventListener("click", advanceStep);
  document.getElementById("mode-single").addEventListener("click", () => setMode("single"));
  document.getElementById("mode-compare").addEventListener("click", () => setMode("compare"));
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
  // Abort any in-progress run before starting a new one
  if (runController) {
    console.log("[client] Aborting previous run");
    runController.abort();
    runController = null;
  }

  gotComplete = false;
  setRunning(true);
  showNextBtn(false);

  const log = document.getElementById("log");
  const output = document.getElementById("output");
  log.innerHTML = "";
  output.innerHTML = '<p class="idle-msg">Running\u2026<\/p>';
  stageDataCache = {};

  for (const name of STAGES) {
    const row = makeStageRow(name, "pending");
    row.id = "stage-" + name;
    log.appendChild(row);
  }

  const preset = document.getElementById("preset").value;
  const date = document.getElementById("date").value;
  const dataMode = document.querySelector('[name=dataMode]:checked').value;
  const aiMode = document.querySelector('[name=aiMode]:checked').value;

  const controller = new AbortController();
  runController = controller;

  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ preset, date, dataMode, aiMode, stepMode }),
      signal: controller.signal,
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log("[client] SSE stream ended (done=true), remaining buffer:", JSON.stringify(buffer));
        break;
      }
      const chunk = decoder.decode(value, { stream: true });
      buffer += chunk;
      const lines = buffer.split("\\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("data: ")) {
          try {
            handleEvent(JSON.parse(line.slice(6)));
          } catch (parseErr) {
            console.error("[client] SSE parse error:", parseErr, "line:", line.slice(0, 100));
          }
        }
      }
    }
  } catch (err) {
    if (err && err.name === "AbortError") {
      console.log("[client] Run aborted (new run started)");
      return; // Don't show error or touch UI — the new run owns the UI now
    }
    showError(String(err));
  } finally {
    if (runController === controller) {
      // Only clean up UI if this is still the active run
      runController = null;
      setRunning(false);
      showNextBtn(false);
      if (!gotComplete) {
        showError("Run ended without a result \u2014 the server may have crashed.");
      }
    }
  }
}

async function advanceStep() {
  console.log("[client] Next Stage clicked");
  showNextBtn(false);
  try {
    const resp = await fetch("/api/next", { method: "POST" });
    console.log("[client] /api/next responded:", resp.status);
  } catch (_err) {
    console.error("[client] /api/next failed:", _err);
    showNextBtn(true); // restore button if POST failed
  }
}

function handleEvent(evt) {
  if (evt.type === "stage") {
    updateStageRow(evt.name, evt.status, evt.durationMs, evt.detail);
  } else if (evt.type === "stageProgress") {
    // Heartbeat: update elapsed time on the running stage
    var row = document.getElementById("stage-" + evt.name);
    if (row) {
      row.querySelector(".dur").textContent = evt.elapsedSec + "s\u2026";
    }
  } else if (evt.type === "stageData") {
    stageDataCache[evt.name] = evt.data;
    renderStageData(evt.name, evt.data);
  } else if (evt.type === "waiting") {
    showNextBtn(true);
  } else if (evt.type === "complete") {
    gotComplete = true;
    renderOutput(evt.markdown);
  } else if (evt.type === "error") {
    gotComplete = true;
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
  row.style.cursor = "pointer";
  row.addEventListener("click", function() {
    if (stageDataCache[name]) {
      renderStageData(name, stageDataCache[name]);
    }
  });
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

function renderStageData(name, data) {
  const output = document.getElementById("output");
  var h = '<div class="stage-output">';
  h += '<h3>' + escapeHtml(name) + ' output<\/h3>';
  h += renderDataTree(data, 0);
  h += '<\/div>';
  output.innerHTML = h;
}

function renderDataTree(obj, depth) {
  if (obj === null || obj === undefined) return '<span class="json-null">null<\/span>';
  if (typeof obj === "string") return '<span class="json-str">"' + escapeHtml(obj).slice(0, 200) + '"<\/span>';
  if (typeof obj === "number" || typeof obj === "boolean") return '<span class="json-num">' + String(obj) + '<\/span>';
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '<span class="json-empty">[]<\/span>';
    var h = '<div class="json-arr">';
    h += '<span class="json-bracket">[<\/span> <span class="json-count">' + obj.length + ' items<\/span>';
    for (var i = 0; i < Math.min(obj.length, 20); i++) {
      h += '<div class="json-item">' + renderDataTree(obj[i], depth + 1) + '<\/div>';
    }
    if (obj.length > 20) h += '<div class="json-item json-ellipsis">\u2026 ' + (obj.length - 20) + ' more<\/div>';
    h += '<span class="json-bracket">]<\/span><\/div>';
    return h;
  }
  if (typeof obj === "object") {
    var keys = Object.keys(obj);
    if (keys.length === 0) return '<span class="json-empty">{}<\/span>';
    var h = '<div class="json-obj">';
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      var val = obj[key];
      h += '<div class="json-row">';
      h += '<span class="json-key">' + escapeHtml(key) + '<\/span>: ';
      h += renderDataTree(val, depth + 1);
      h += '<\/div>';
    }
    h += '<\/div>';
    return h;
  }
  return escapeHtml(String(obj));
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

// ── Compare mode ──────────────────────────────────────────

async function runPresetFull(presetId, date, dataMode, aiMode) {
  const response = await fetch("/api/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ preset: presetId, date, dataMode, aiMode, stepMode: false }),
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let markdown = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === "complete") markdown = evt.markdown;
        else if (evt.type === "stage") updateStageRow(evt.name, evt.status, evt.durationMs, evt.detail);
        else if (evt.type === "error") throw new Error(evt.message);
      } catch (_e) { if (_e.message && !_e.message.startsWith("{")) throw _e; }
    }
  }
  return markdown;
}

async function startCompare() {
  gotComplete = false;
  setRunning(true);
  showNextBtn(false);
  stageDataCache = {};

  const log = document.getElementById("log");
  const output = document.getElementById("output");
  log.innerHTML = "";
  output.innerHTML = '<p class="idle-msg">Running comparison\u2026<\/p>';

  const presetA = document.getElementById("preset").value;
  const presetB = document.getElementById("preset-b").value;
  const date = document.getElementById("date").value;
  const dataMode = document.querySelector("[name=dataMode]:checked").value;
  const aiMode = document.querySelector("[name=aiMode]:checked").value;

  try {
    // Run A first, then B (server cancels previous run on each /api/run)
    for (const name of STAGES) {
      const row = makeStageRow(name, "pending");
      row.id = "stage-" + name;
      log.appendChild(row);
    }

    output.innerHTML = '<p class="idle-msg">Running ' + escapeHtml(presetA) + '\u2026<\/p>';
    const mdA = await runPresetFull(presetA, date, dataMode, aiMode);

    // Reset stage rows for run B
    log.innerHTML = "";
    for (const name of STAGES) {
      const row = makeStageRow(name, "pending");
      row.id = "stage-" + name;
      log.appendChild(row);
    }

    output.innerHTML = '<p class="idle-msg">Running ' + escapeHtml(presetB) + '\u2026<\/p>';
    const mdB = await runPresetFull(presetB, date, dataMode, aiMode);

    gotComplete = true;
    renderComparison(presetA, mdA, presetB, mdB);
  } catch (err) {
    showError(String(err));
  } finally {
    setRunning(false);
    showNextBtn(false);
  }
}

function parseMdStats(md) {
  if (!md) return {};
  const m = md.match(/\[!info\]\s+(\d+)\s+visits\s+·\s+(\d+)\s+searches\s+·\s+(\d+)\s+AI prompts\s+·\s+(\d+)\s+commits\s+·\s+(\d+)\s+categories/);
  if (!m) return {};
  return { visits: m[1], searches: m[2], aiPrompts: m[3], commits: m[4], categories: m[5] };
}

function parseMdDetails(md) {
  if (!md) return {};
  const m = md.match(/<summary>\s*Prompt sent to ([^\s·]+)\s+·\s+(\d+)\s+tokens\s+·\s+Tier\s+(\d+)/);
  if (!m) return {};
  return { model: m[1], tokens: m[2], tier: m[3] };
}

function buildDiffTable(presetA, mdA, presetB, mdB) {
  const sA = parseMdStats(mdA);
  const sB = parseMdStats(mdB);
  const dA = parseMdDetails(mdA);
  const dB = parseMdDetails(mdB);
  const fields = [
    ["Visits",       sA.visits   || "0",   sB.visits   || "0"],
    ["Searches",     sA.searches || "0",   sB.searches || "0"],
    ["AI Prompts",   sA.aiPrompts|| "0",   sB.aiPrompts|| "0"],
    ["Commits",      sA.commits  || "0",   sB.commits  || "0"],
    ["Categories",   sA.categories|| "0",  sB.categories|| "0"],
    ["AI Model",     dA.model    || "\u2014", dB.model  || "\u2014"],
    ["Tokens",       dA.tokens   || "\u2014", dB.tokens || "\u2014"],
    ["Privacy Tier", dA.tier     || "\u2014", dB.tier   || "\u2014"],
  ];
  let h = '<table class="diff-table">';
  h += "<tr><th>Field<\/th><th class=\\"val-a\\">" + escapeHtml(presetA) + "<\/th><th class=\\"val-b\\">" + escapeHtml(presetB) + "<\/th><\/tr>";
  for (const [field, a, b] of fields) {
    const changed = String(a) !== String(b);
    h += "<tr" + (changed ? ' class="diff-changed"' : "") + ">";
    h += "<td class=\\"field\\">" + escapeHtml(field) + "<\/td>";
    h += "<td class=\\"val-a\\">" + escapeHtml(String(a)) + "<\/td>";
    h += "<td class=\\"val-b\\">" + escapeHtml(String(b)) + "<\/td>";
    h += "<\/tr>";
  }
  h += "<\/table>";
  return h;
}

function renderComparison(presetA, mdA, presetB, mdB) {
  const output = document.getElementById("output");
  let h = '<div class="compare-layout">';
  h += '<div class="compare-col">';
  h += "<h4>" + escapeHtml(presetA) + "<\/h4>";
  h += '<div class="markdown-body">' + (mdA ? marked.parse(mdA) : "<em>No output<\/em>") + "<\/div>";
  h += "<\/div>";
  h += '<div class="compare-col">';
  h += "<h4>" + escapeHtml(presetB) + "<\/h4>";
  h += '<div class="markdown-body">' + (mdB ? marked.parse(mdB) : "<em>No output<\/em>") + "<\/div>";
  h += "<\/div>";
  h += "<\/div>";
  h += '<div class="diff-section">';
  h += "<h4>Field Diff<\/h4>";
  h += buildDiffTable(presetA, mdA, presetB, mdB);
  h += "<\/div>";
  output.innerHTML = h;
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
	stepMode: boolean,
	runId: number
): Promise<void> {
	const preset = PRESETS.find((p) => p.id === presetId);
	if (!preset) {
		throw new Error(`Unknown preset: "${presetId}"`);
	}
	const settings = resolvePreset(preset);
	const date = new Date(`${dateStr}T12:00:00`);

	// ── Stage helpers ──────────────────────────────────────

	interface StageResult {
		detail?: string;
		/** Structured data snapshot to display in the output panel. */
		output?: object;
	}

	const STAGE_TIMEOUT_MS = 180_000; // 3 minutes max per stage

	async function stage(
		name: string,
		fn: () => Promise<StageResult> | StageResult,
		opts?: { last?: boolean }
	): Promise<void> {
		// Bail if a newer run has started
		if (runId !== activeRunId) {
			throw new Error("__cancelled__");
		}
		const t = Date.now();
		sseEvent(res, { type: "stage", name, status: "running" });

		// Heartbeat: send elapsed time every 2s so the UI knows we're alive
		const heartbeat = setInterval(() => {
			const elapsed = Math.round((Date.now() - t) / 1000);
			sseEvent(res, { type: "stageProgress", name, elapsedSec: elapsed });
		}, 2_000);

		try {
			const result = await Promise.race([
				Promise.resolve().then(fn),
				new Promise<never>((_, reject) =>
					setTimeout(() => reject(new Error(`Stage "${name}" timed out after ${STAGE_TIMEOUT_MS / 1000}s`)), STAGE_TIMEOUT_MS)
				),
			]);
			const durationMs = Date.now() - t;
			sseEvent(res, {
				type: "stage",
				name,
				status: "done",
				durationMs,
				detail: result.detail ?? "",
			});
			// Send the stage output snapshot to the client
			if (result.output) {
				sseEvent(res, { type: "stageData", name, data: result.output });
			}
			// In step mode, pause after each stage — except the last one,
			// which should fall through to the complete event immediately.
			if (stepMode && !opts?.last) {
				sseEvent(res, { type: "waiting", completedStage: name });
				await waitForNext(runId);
			}
		} finally {
			clearInterval(heartbeat);
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
			output: {
				counts: {
					visits: raw.visits.length,
					searches: raw.searches.length,
					sessions: raw.claudeSessions.length,
					commits: raw.gitCommits.length,
				},
				visits: sampleVisits(raw.visits),
				searches: sampleSearches(raw.searches),
				sessions: sampleSessions(raw.claudeSessions),
				commits: sampleCommits(raw.gitCommits),
				_truncated: raw.visits.length > SAMPLE_LIMIT || raw.claudeSessions.length > SAMPLE_LIMIT,
			},
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
		const detail = sanitizeConfig.enabled ? `level=${sanitizeConfig.level}` : "disabled";
		return {
			detail,
			output: {
				config: { level: sanitizeConfig.level, redactPaths: sanitizeConfig.redactPaths, scrubEmails: sanitizeConfig.scrubEmails },
				counts: {
					visits: sanitized.visits.length,
					searches: sanitized.searches.length,
					sessions: sanitized.claudeSessions.length,
					commits: sanitized.gitCommits.length,
				},
				visits: sampleVisits(sanitized.visits),
				searches: sampleSearches(sanitized.searches),
			},
		};
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
		const excluded = result.filtered;
		return {
			detail: sensitivityConfig.enabled
				? `${excluded} excluded (${sensitivityConfig.action})`
				: "disabled",
			output: {
				action: sensitivityConfig.action,
				categories: sensitivityConfig.categories,
				inputCount: sanitized.visits.length,
				keptCount: filteredVisits.length,
				excludedCount: excluded,
				excludedByCategory: result.byCategory,
				keptSample: sampleVisits(filteredVisits),
			},
		};
	});

	// ── 4. Categorize ────────────────────────────────────

	let categorized!: ReturnType<typeof categorizeVisits>;
	await stage("categorize", () => {
		categorized = categorizeVisits(filteredVisits);
		const catEntries = Object.entries(categorized)
			.filter(([, v]) => Array.isArray(v) && v.length > 0)
			.map(([k, v]) => [k, (v as unknown[]).length] as const);
		return {
			detail: `${catEntries.length} categories`,
			output: {
				categories: Object.fromEntries(catEntries),
				topDomains: Object.fromEntries(
					catEntries.slice(0, 5).map(([cat]) => {
						const domains: Record<string, number> = {};
						for (const v of categorized[cat]) {
							const d = v.domain || "unknown";
							domains[d] = (domains[d] || 0) + 1;
						}
						const sorted = Object.entries(domains).sort((a, b) => b[1] - a[1]).slice(0, 5);
						return [cat, Object.fromEntries(sorted)];
					})
				),
			},
		};
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
				return {
					detail: `LLM: ${classification.llmClassified} events`,
					output: classifyOutput(classification),
				};
			} else {
				classification = classifyEventsRuleOnly(
					filteredVisits,
					sanitized.searches,
					sanitized.claudeSessions,
					sanitized.gitCommits,
					categorized
				);
				return {
					detail: "rule-only",
					output: classifyOutput(classification),
				};
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
				output: {
					focusScore: `${Math.round(patterns.focusScore * 100)}%`,
					topActivityTypes: patterns.topActivityTypes.slice(0, 5),
					peakHours: patterns.peakHours.slice(0, 5).map(h => ({ hour: `${h.hour}:00`, count: h.count })),
					temporalClusters: patterns.temporalClusters.map(c => ({
						hours: `${c.hourStart}:00–${c.hourEnd}:00`,
						events: c.eventCount,
						activityType: c.activityType,
						label: c.label,
					})),
					topCooccurrences: patterns.topicCooccurrences.slice(0, 5).map(c => ({
						topics: [c.topicA, c.topicB],
						strength: c.strength,
						sharedEvents: c.sharedEvents,
					})),
					entityRelations: patterns.entityRelations.slice(0, 5).map(r => ({
						entities: [r.entityA, r.entityB],
						cooccurrences: r.cooccurrences,
						contexts: r.contexts,
					})),
				},
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
			return {
				detail: `${knowledge.tags.length} tags`,
				output: knowledge,
			};
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
			return {
				detail: "mock",
				output: summarizeOutput(aiSummary, promptLog),
			};
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
				sanitized.gitCommits,
				settings.promptsDir,
				settings.promptStrategy
			);
			return {
				detail: `model=${aiCallConfig.provider === "local" ? aiCallConfig.localModel : aiCallConfig.anthropicModel}`,
				output: summarizeOutput(aiSummary, promptLog),
			};
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
		// Count sections in the markdown
		const h2Count = (md.match(/^## /gm) || []).length;
		const lineCount = md.split("\n").length;
		return {
			detail: `${md.length} chars`,
			output: {
				chars: md.length,
				lines: lineCount,
				sections: h2Count,
				preview: md.slice(0, 500),
			},
		};
	}, { last: true });

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
		const presets = PRESETS.map(p => ({ id: p.id, description: p.description, privacyRank: p.privacyRank, privacyGroup: p.privacyGroup }));
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
			console.log("[step] /api/next → advancing currentRun");
			const run = currentRun;
			currentRun = null;
			clearTimeout(run.timeoutId);
			run.advance();
		} else {
			// No active wait yet — queue the advance so the next waitForNext()
			// resolves immediately (prevents race when client clicks before the
			// server has set up the wait for the next stage).
			console.log("[step] /api/next → no currentRun, setting pendingAdvance");
			pendingAdvance = true;
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
		pendingAdvance = false;
		const runId = ++activeRunId;
		console.log(`[run] Starting run ${runId}`);

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
			await runPipeline(res, presetId, dateStr, dataMode, aiMode, stepMode, runId);
		} catch (err) {
			const msg = String(err);
			if (msg.includes("__cancelled__")) {
				console.log(`[run] Run ${runId} cancelled (superseded)`);
			} else {
				sseEvent(res, { type: "error", message: msg });
			}
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
