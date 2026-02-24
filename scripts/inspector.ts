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

import { PRESETS } from "./presets";

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

// ── Stub pipeline runner ─────────────────────────────────

async function runPipeline(
	res: ServerResponse,
	_presetId: string,
	dateStr: string,
	_dataMode: "fixtures" | "real",
	_aiMode: "mock" | "real",
	_stepMode: boolean
): Promise<void> {
	sseEvent(res, { type: "stage", name: "collect", status: "running" });
	await new Promise(r => setTimeout(r, 50));
	sseEvent(res, { type: "stage", name: "collect", status: "done", durationMs: 50, detail: "stub" });
	sseEvent(res, { type: "complete", markdown: `# ${dateStr}\n\n_Pipeline stub_` });
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
