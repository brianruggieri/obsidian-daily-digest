# Pipeline Inspector Implementation Plan

> **Status:** Implementation complete. Integration test has a server startup timeout issue tracked separately.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a local dev server (`scripts/inspector.ts`) with a browser UI to run the 9-stage pipeline against a chosen date/preset and watch each stage fire live, with step-through mode.

**Architecture:** Node native `http` module server on port 3747. SSE streams stage events to the browser. A `POST /api/next` endpoint resolves a between-stage Promise to implement step mode. Pipeline stages are imported inline — same modules as `daily-matrix.ts`.

**Tech Stack:** TypeScript + tsx, Node `http`, CDN `marked.js` for markdown rendering. Zero new npm deps.

---

## Task 1: Scaffold inspector.ts with routing skeleton

**Files:**
- Create: `scripts/inspector.ts`

**Step 1: Create the file**

```typescript
/**
 * inspector.ts — Pipeline Inspector dev server
 *
 * Start:  npm run inspect
 * Open:   http://localhost:3747
 */
import * as http from "http";
import type { IncomingMessage, ServerResponse } from "http";

import { PRESETS, resolvePreset } from "./presets.js";
import { collectFixtureData, collectRealData } from "./lib/collector-shim.js";
import { getMockSummary } from "./lib/mock-ai.js";
import { createPromptLog, appendPromptEntry, estimateTokens } from "./lib/prompt-logger.js";
import type { PromptLog } from "./lib/prompt-logger.js";
import { sanitizeCollectedData } from "../src/sanitize.js";
import { filterSensitiveDomains } from "../src/sensitivity.js";
import { categorizeVisits } from "../src/categorize.js";
import { classifyEventsRuleOnly, classifyEvents } from "../src/classify.js";
import { extractPatterns, buildEmptyTopicHistory } from "../src/patterns.js";
import { generateKnowledgeSections } from "../src/knowledge.js";
import type { KnowledgeSections } from "../src/knowledge.js";
import { renderMarkdown } from "../src/renderer.js";
import { buildPrompt, summarizeDay } from "../src/summarize.js";
import type {
	SanitizeConfig,
	SensitivityConfig,
	ClassificationResult,
	PatternConfig,
	PatternAnalysis,
	AISummary,
} from "../src/types.js";
import type { AICallConfig } from "../src/ai-client.js";
import type { CollectedData } from "./lib/collector-shim.js";

const PORT = 3747;

// ── Step-mode state ──────────────────────────────────────────────────────────

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

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseEvent(res: ServerResponse, data: object): void {
	res.write(`data: ${JSON.stringify(data)}\n\n`);
}

// ── HTML (populated in Task 4) ────────────────────────────────────────────────

const HTML = `<!DOCTYPE html><html><body><h1>Pipeline Inspector (UI coming in Task 4)</h1></body></html>`;

// ── Pipeline runner (populated in Task 2) ────────────────────────────────────

async function runPipeline(
	res: ServerResponse,
	presetId: string,
	dateStr: string,
	dataMode: "fixtures" | "real",
	aiMode: "mock" | "real",
	stepMode: boolean
): Promise<void> {
	sseEvent(res, { type: "stage", name: "collect", status: "running" });
	await new Promise(r => setTimeout(r, 50));
	sseEvent(res, { type: "stage", name: "collect", status: "done", durationMs: 50, detail: "stub" });
	sseEvent(res, { type: "complete", markdown: `# ${dateStr}\n\n_Pipeline stub — implement stages in Task 2_` });
}

// ── Request router ────────────────────────────────────────────────────────────

async function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve) => {
		let body = "";
		req.on("data", (chunk) => (body += chunk));
		req.on("end", () => resolve(body));
	});
}

const server = http.createServer(async (req, res) => {
	const { method, url } = req;

	if (method === "GET" && url === "/") {
		res.writeHead(200, { "Content-Type": "text/html" });
		res.end(HTML);
		return;
	}

	if (method === "GET" && url === "/api/presets") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify(PRESETS.map((p) => ({ id: p.id, description: p.description }))));
		return;
	}

	if (method === "POST" && url === "/api/next") {
		if (currentRun) {
			clearTimeout(currentRun.timeoutId);
			currentRun.advance();
			currentRun = null;
		}
		res.writeHead(204);
		res.end();
		return;
	}

	if (method === "POST" && url === "/api/run") {
		// Cancel any in-progress run
		if (currentRun) {
			clearTimeout(currentRun.timeoutId);
			currentRun.advance();
			currentRun = null;
		}

		res.writeHead(200, {
			"Content-Type": "text/event-stream",
			"Cache-Control": "no-cache",
			Connection: "keep-alive",
			"Access-Control-Allow-Origin": "*",
		});

		const body = await readBody(req);
		let params: { preset: string; date: string; dataMode: "fixtures" | "real"; aiMode: "mock" | "real"; stepMode: boolean };
		try {
			params = JSON.parse(body);
		} catch {
			sseEvent(res, { type: "error", message: "Invalid JSON in request body" });
			res.end();
			return;
		}

		try {
			await runPipeline(res, params.preset, params.date, params.dataMode, params.aiMode, params.stepMode);
		} catch (err) {
			sseEvent(res, { type: "error", message: String(err) });
		} finally {
			res.end();
		}
		return;
	}

	res.writeHead(404);
	res.end("Not found");
});

server.listen(PORT, () => {
	console.log(`Pipeline Inspector → http://localhost:${PORT}`);
	console.log("Press Ctrl+C to stop.");
});
```

**Step 2: Add npm script to package.json**

In `package.json`, add to the `"scripts"` block:
```json
"inspect": "tsx --env-file=.env --tsconfig tsconfig.scripts.json scripts/inspector.ts"
```

Add it after the `"matrix:assert"` line.

**Step 3: Start the server and verify routing**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run inspect
```

Expected output:
```
Pipeline Inspector → http://localhost:3747
Press Ctrl+C to stop.
```

In a second terminal:
```bash
curl http://localhost:3747/api/presets | head -c 200
```

Expected: JSON array with `id` and `description` fields for each preset.

```bash
curl -s -X POST http://localhost:3747/api/run \
  -H 'Content-Type: application/json' \
  -d '{"preset":"no-ai-minimal","date":"2026-02-23","dataMode":"fixtures","aiMode":"mock","stepMode":false}'
```

Expected: SSE lines including `data: {"type":"stage","name":"collect","status":"running"}` and a final `data: {"type":"complete",...}`.

**Step 4: Commit**

```bash
git add scripts/inspector.ts package.json
git commit -m "feat: add pipeline inspector server skeleton"
```

---

## Task 2: Implement all 9 pipeline stages in runPipeline

**Files:**
- Modify: `scripts/inspector.ts` — replace the stub `runPipeline` function

**Step 1: Replace runPipeline with the full implementation**

Replace the entire `runPipeline` function (everything between `// ── Pipeline runner` and `// ── Request router`) with:

```typescript
async function runPipeline(
	res: ServerResponse,
	presetId: string,
	dateStr: string,
	dataMode: "fixtures" | "real",
	aiMode: "mock" | "real",
	stepMode: boolean
): Promise<void> {
	const preset = PRESETS.find((p) => p.id === presetId);
	if (!preset) throw new Error(`Preset not found: "${presetId}"`);
	const settings = resolvePreset(preset);
	const date = new Date(`${dateStr}T12:00:00`);

	// Helper: emit running → run fn → emit done → maybe wait
	async function stage(
		name: string,
		fn: () => Promise<{ detail?: string }> | { detail?: string }
	): Promise<void> {
		const t = Date.now();
		sseEvent(res, { type: "stage", name, status: "running" });
		const result = await fn();
		sseEvent(res, { type: "stage", name, status: "done", durationMs: Date.now() - t, detail: result.detail ?? "" });
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
			raw.visits, raw.searches, raw.shell, raw.claudeSessions, raw.gitCommits, sanitizeConfig
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
					filteredVisits, sanitized.searches, sanitized.shellCommands,
					sanitized.claudeSessions, sanitized.gitCommits, categorized, classifyConfig
				);
				return { detail: `LLM: ${classification.llmClassified} events` };
			} else {
				classification = classifyEventsRuleOnly(
					filteredVisits, sanitized.searches, sanitized.shellCommands,
					sanitized.claudeSessions, sanitized.gitCommits, categorized
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
				detail: `focus=${Math.round(patterns.focusScore * 100)}%, ` +
					`clusters=${patterns.temporalClusters.length}`,
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
				date, categorized, sanitized.searches, sanitized.shellCommands,
				sanitized.claudeSessions, settings.profile, sanitized.gitCommits
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
				date, categorized, sanitized.searches, sanitized.shellCommands,
				sanitized.claudeSessions, settings.profile, sanitized.gitCommits
			);
			appendPromptEntry(promptLog, {
				stage: "summarize",
				model: aiCallConfig.anthropicModel ?? aiCallConfig.localModel ?? "unknown",
				tokenCount: estimateTokens(promptText),
				privacyTier: 1,
				prompt: promptText,
			});
			aiSummary = await summarizeDay(
				date, categorized, sanitized.searches, sanitized.shellCommands,
				sanitized.claudeSessions, aiCallConfig, settings.profile, undefined,
				classification, patterns, undefined, sanitized.gitCommits
			);
			return { detail: `model=${aiCallConfig.anthropicModel ?? aiCallConfig.localModel}` };
		});
	}

	// ── 9. Render ─────────────────────────────────────────
	let md!: string;
	await stage("render", () => {
		md = renderMarkdown(
			date, filteredVisits, sanitized.searches, sanitized.shellCommands,
			sanitized.claudeSessions, sanitized.gitCommits, categorized,
			aiSummary, aiProviderUsed, knowledge, promptLog
		);
		return { detail: `${md.length} chars` };
	});

	sseEvent(res, { type: "complete", markdown: md });
}
```

**Step 2: Restart the server and verify all stages fire**

Stop the server (Ctrl+C), restart it, then run:

```bash
curl -s -X POST http://localhost:3747/api/run \
  -H 'Content-Type: application/json' \
  -d '{"preset":"no-ai-full","date":"2026-02-23","dataMode":"fixtures","aiMode":"mock","stepMode":false}' \
  | grep '"type"'
```

Expected output (one `"type"` per line):
```
data: {"type":"stage","name":"collect",...}
data: {"type":"stage","name":"collect",...}
data: {"type":"stage","name":"sanitize",...}
...
data: {"type":"complete",...}
```

All 9 stages should appear (some as "skipped" depending on preset). No `"error"` events.

**Step 3: Commit**

```bash
git add scripts/inspector.ts
git commit -m "feat: implement all 9 pipeline stages with SSE events"
```

---

## Task 3: Verify step mode via curl

No code changes needed — step mode is already wired in `waitForNext` and `stage()`. This task verifies it works correctly before the UI exists.

**Step 1: Start the server, run a step-mode pipeline in one terminal**

```bash
curl -s -N -X POST http://localhost:3747/api/run \
  -H 'Content-Type: application/json' \
  -d '{"preset":"no-ai-minimal","date":"2026-02-23","dataMode":"fixtures","aiMode":"mock","stepMode":true}'
```

The `-N` flag disables buffering so SSE lines print immediately. Leave this running.

Expected — you see the first stage events, then:
```
data: {"type":"waiting","nextStage":"collect"}
```
…and it pauses.

**Step 2: In a second terminal, advance to next stage**

```bash
curl -s -X POST http://localhost:3747/api/next
```

Expected: the first terminal advances, shows the next stage running, then pauses again at the next `"waiting"` event.

**Step 3: Verify 60s timeout (optional)**

Start a step-mode run, then wait 60 seconds without calling `/api/next`. Expected: stream closes with:
```
data: {"type":"error","message":"Step timeout — run cancelled after 60 seconds of inactivity"}
```

**Step 4: Commit** (no code change needed — if step mode worked correctly, just note it. If you had to fix something, commit the fix.)

```bash
git commit -m "feat: verify step mode works correctly"
```

---

## Task 4: Write the HTML frontend

**Files:**
- Modify: `scripts/inspector.ts` — replace the `HTML` constant

**Step 1: Replace the HTML constant**

Replace the one-liner `const HTML = ...` with the full template string below. Place it just above `// ── Pipeline runner`.

```typescript
const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pipeline Inspector</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
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
  .output-panel .markdown-body { max-width: 760px; line-height: 1.6; color: #d4d4d4; }
  .output-panel .markdown-body h1,h2,h3 { color: #eee; border-bottom: 1px solid #333; padding-bottom: 4px; margin: 16px 0 8px; }
  .output-panel .markdown-body code { background: #2a2a2a; padding: 1px 5px; border-radius: 3px; font-size: 12px; }
  .output-panel .markdown-body pre { background: #2a2a2a; padding: 10px; border-radius: 4px; overflow-x: auto; }
  .output-panel .markdown-body a { color: #7b68ee; }
  .raw-toggle { margin-top: 16px; }
  .raw-toggle summary { color: #555; cursor: pointer; font-size: 11px; }
  .raw-toggle textarea { width: 100%; height: 200px; background: #111; border: 1px solid #333; color: #666; padding: 8px; font-family: inherit; font-size: 11px; margin-top: 6px; resize: vertical; }
  .error-msg { color: #f87171; padding: 12px; background: #2a1515; border-radius: 4px; border: 1px solid #5a2020; }
  .idle-msg { color: #555; font-size: 12px; padding: 20px 0; }
  .waiting-badge { display: inline-block; color: #74c69d; background: #1a3a2a; border: 1px solid #2d6a4f; padding: 1px 7px; border-radius: 10px; font-size: 10px; margin-left: 8px; }
</style>
</head>
<body>
<header><strong>Pipeline Inspector</strong> &nbsp;·&nbsp; obsidian-claude-daily</header>
<div class="workspace">
  <div class="sidebar">
    <div>
      <label>Date</label>
      <input type="date" id="date" />
    </div>
    <div>
      <label>Preset</label>
      <select id="preset"></select>
    </div>
    <div>
      <label>Data</label>
      <div class="radio-group">
        <input type="radio" name="dataMode" id="dm-fixtures" value="fixtures" checked />
        <label for="dm-fixtures">fixtures</label>
        <input type="radio" name="dataMode" id="dm-real" value="real" />
        <label for="dm-real">real</label>
      </div>
    </div>
    <div>
      <label>AI</label>
      <div class="radio-group">
        <input type="radio" name="aiMode" id="ai-mock" value="mock" checked />
        <label for="ai-mock">mock</label>
        <input type="radio" name="aiMode" id="ai-real" value="real" />
        <label for="ai-real">real</label>
      </div>
    </div>
    <div class="btn-group">
      <button id="btn-step">Step</button>
      <button id="btn-run">Run All</button>
    </div>
    <button id="btn-next">Next Stage →</button>
  </div>

  <div class="main">
    <div class="log-panel" id="log"></div>
    <div class="output-panel" id="output">
      <p class="idle-msg">Select a preset and click Step or Run All.</p>
    </div>
  </div>
</div>

<script>
const STAGES = ["collect","sanitize","sensitivity","categorize","classify","patterns","knowledge","summarize","render"];

// ── Init ──────────────────────────────────────────────────────────────────────

(async function init() {
  // Set date to today
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("date").value = today;

  // Load presets
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

  // Buttons
  document.getElementById("btn-step").addEventListener("click", () => startRun(true));
  document.getElementById("btn-run").addEventListener("click", () => startRun(false));
  document.getElementById("btn-next").addEventListener("click", advanceStep);
})();

// ── Run ───────────────────────────────────────────────────────────────────────

function setRunning(running) {
  document.getElementById("btn-step").disabled = running;
  document.getElementById("btn-run").disabled = running;
}

function showNextBtn(visible) {
  document.getElementById("btn-next").classList.toggle("visible", visible);
}

async function startRun(stepMode) {
  setRunning(true);
  showNextBtn(false);

  // Clear log and output
  const log = document.getElementById("log");
  const output = document.getElementById("output");
  log.innerHTML = "";
  output.innerHTML = '<p class="idle-msg">Running…</p>';

  const preset = document.getElementById("preset").value;
  const date = document.getElementById("date").value;
  const dataMode = document.querySelector('[name=dataMode]:checked').value;
  const aiMode = document.querySelector('[name=aiMode]:checked').value;

  // Pre-populate stage rows in order
  for (const name of STAGES) {
    const row = makeStageRow(name, "pending");
    row.id = "stage-" + name;
    log.appendChild(row);
  }

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
          handleEvent(JSON.parse(line.slice(6)));
        }
      }
    }
  } catch (err) {
    showError(String(err));
  } finally {
    setRunning(false);
    showNextBtn(false);
  }
}

async function advanceStep() {
  showNextBtn(false);
  await fetch("/api/next", { method: "POST" });
}

// ── Event handling ────────────────────────────────────────────────────────────

function handleEvent(evt) {
  if (evt.type === "stage") {
    updateStageRow(evt.name, evt.status, evt.durationMs, evt.detail);
  } else if (evt.type === "waiting") {
    showNextBtn(true);
  } else if (evt.type === "complete") {
    renderMarkdown(evt.markdown);
  } else if (evt.type === "error") {
    showError(evt.message);
  }
}

// ── Stage log ─────────────────────────────────────────────────────────────────

function makeStageRow(name, status) {
  const row = document.createElement("div");
  row.className = "stage-row";
  row.innerHTML =
    '<span class="dot ' + status + '">' + dotChar(status) + '</span>' +
    '<span class="name">' + name + '</span>' +
    '<span class="dur"></span>' +
    '<span class="detail"></span>';
  return row;
}

function dotChar(status) {
  if (status === "running") return "◌";
  if (status === "done") return "●";
  if (status === "skipped") return "○";
  if (status === "pending") return "·";
  if (status === "error") return "✕";
  return "·";
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
  if (detail) {
    row.querySelector(".detail").textContent = detail;
  }
}

// ── Output ────────────────────────────────────────────────────────────────────

function renderMarkdown(raw) {
  const output = document.getElementById("output");
  const html = marked.parse(raw);
  output.innerHTML =
    '<div class="markdown-body">' + html + '</div>' +
    '<details class="raw-toggle"><summary>Raw markdown</summary>' +
    '<textarea readonly>' + escapeHtml(raw) + '</textarea></details>';
}

function showError(msg) {
  document.getElementById("output").innerHTML =
    '<div class="error-msg">Error: ' + escapeHtml(msg) + '</div>';
}

function escapeHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}
</script>
</body>
</html>`;
```

**Step 2: Restart and open in browser**

```bash
npm run inspect
```

Open `http://localhost:3747`. Verify:
- Preset dropdown is populated from `/api/presets`
- Date defaults to today
- "Step" and "Run All" buttons are present

**Step 3: Run with fixtures/mock in Run All mode**

Select preset `no-ai-full`, click **Run All**. Expected:
- Stage rows animate in the log panel (collect → sanitize → ... → render)
- Rendered markdown appears in the output panel when complete
- "Raw markdown" `<details>` toggle shows raw text

**Step 4: Run with fixtures/mock in Step mode**

Select preset `no-ai-full`, click **Step**. Expected:
- First stage fires, then "Next Stage →" button appears
- Clicking it advances to the next stage
- Continues until render, then markdown renders

**Step 5: Commit**

```bash
git add scripts/inspector.ts
git commit -m "feat: add browser UI to pipeline inspector"
```

---

## Task 5: Smoke test with real data, then final commit

**Step 1: Run with real data, mock AI**

In the inspector UI: set Data → **real**, AI → **mock**, pick today's date, select `no-ai-full`, click **Run All**.

Expected: stages complete with real counts (actual browser visits, shell commands, etc.), rendered markdown reflects your actual day.

**Step 2: Verify error handling — missing preset**

```bash
curl -s -X POST http://localhost:3747/api/run \
  -H 'Content-Type: application/json' \
  -d '{"preset":"does-not-exist","date":"2026-02-23","dataMode":"fixtures","aiMode":"mock","stepMode":false}'
```

Expected: `data: {"type":"error","message":"Preset not found: \"does-not-exist\""}` and stream closes cleanly. Server stays alive.

**Step 3: Run npm test to make sure nothing broke**

```bash
source ~/.nvm/nvm.sh && nvm use && npm test
```

Expected: all existing tests still pass. (No new tests for the server script itself — it's a dev tool with manual verification.)

**Step 4: Final commit**

```bash
git add scripts/inspector.ts package.json
git commit -m "feat: pipeline inspector with step-through mode"
```
