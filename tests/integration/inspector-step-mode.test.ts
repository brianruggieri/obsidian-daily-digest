/**
 * Integration tests for the Pipeline Inspector's step-mode SSE flow.
 *
 * Spins up the inspector HTTP server and verifies that:
 * - Step mode sends "waiting" events between stages
 * - /api/next advances the pipeline correctly
 * - Rapid /api/next calls don't lose advances (race condition fix)
 * - Run-all mode completes without /api/next calls
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import { spawn, type ChildProcess } from "child_process";
import { resolve } from "path";

const PORT = 13747;

// ── Helpers ────────────────────────────────────────────────

interface SSEEvent {
	type: string;
	name?: string;
	status?: string;
	durationMs?: number;
	detail?: string;
	completedStage?: string;
	markdown?: string;
	message?: string;
}

/** POST JSON to the inspector and return the response body. */
function post(
	path: string,
	body?: object
): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const payload = body ? JSON.stringify(body) : "";
		const req = http.request(
			{
				hostname: "127.0.0.1",
				port: PORT,
				path,
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(payload),
				},
			},
			(res) => {
				let data = "";
				res.on("data", (chunk) => (data += chunk));
				res.on("end", () =>
					resolve({ status: res.statusCode ?? 0, body: data })
				);
			}
		);
		req.on("error", reject);
		req.write(payload);
		req.end();
	});
}

/** Parse SSE events from a raw response body string. */
function parseSSE(raw: string): SSEEvent[] {
	const events: SSEEvent[] = [];
	for (const line of raw.split("\n")) {
		if (line.startsWith("data: ")) {
			try {
				events.push(JSON.parse(line.slice(6)));
			} catch {
				// skip malformed
			}
		}
	}
	return events;
}

/** Start an SSE run and collect events, calling advanceFn for each "waiting" event. */
function runWithAdvance(
	params: object,
	advanceFn: (waitingEvent: SSEEvent, eventsSoFar: SSEEvent[]) => Promise<void>
): Promise<SSEEvent[]> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error("Run timed out")), 25_000);
		const events: SSEEvent[] = [];
		const payload = JSON.stringify(params);
		const req = http.request(
			{
				hostname: "127.0.0.1",
				port: PORT,
				path: "/api/run",
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"Content-Length": Buffer.byteLength(payload),
				},
			},
			(res) => {
				let buffer = "";
				res.on("data", (chunk: Buffer) => {
					buffer += chunk.toString();
					const lines = buffer.split("\n");
					buffer = lines.pop() ?? "";
					for (const line of lines) {
						if (line.startsWith("data: ")) {
							try {
								const evt = JSON.parse(line.slice(6)) as SSEEvent;
								events.push(evt);
								if (evt.type === "waiting") {
									advanceFn(evt, events).catch(reject);
								}
							} catch {
								// skip
							}
						}
					}
				});
				res.on("end", () => {
					clearTimeout(timeout);
					resolve(events);
				});
			}
		);
		req.on("error", (err) => {
			clearTimeout(timeout);
			reject(err);
		});
		req.write(payload);
		req.end();
	});
}

// ── Server lifecycle ───────────────────────────────────────

let serverProcess: ChildProcess | null = null;

beforeAll(async () => {
	const root = resolve(__dirname, "../..");
	const tsx = resolve(root, "node_modules/.bin/tsx");

	serverProcess = spawn(
		tsx,
		["--tsconfig", "scripts/tsconfig.json", "scripts/inspector.ts"],
		{
			cwd: root,
			env: {
				...process.env,
				INSPECTOR_PORT: String(PORT),
				NODE_OPTIONS: "--experimental-loader ./scripts/lib/txt-loader.mjs",
			},
			stdio: ["ignore", "pipe", "pipe"],
		}
	);

	// Collect stdout/stderr for diagnostics
	let stderr = "";
	let stdout = "";
	serverProcess.stdout?.on("data", (chunk) => {
		stdout += chunk.toString();
	});
	serverProcess.stderr?.on("data", (chunk) => {
		stderr += chunk.toString();
	});

	// Wait for server to be ready (poll /api/presets)
	const deadline = Date.now() + 15_000;
	while (Date.now() < deadline) {
		try {
			const res = await post("/api/presets");
			if (res.status === 200) return;
		} catch {
			// not ready yet
		}
		await new Promise((r) => setTimeout(r, 500));
	}
	throw new Error(
		`Inspector server failed to start within 15s.\nstdout: ${stdout.slice(0, 1000)}\nstderr: ${stderr.slice(0, 1000)}`
	);
}, 20_000);

afterAll(() => {
	if (serverProcess) {
		serverProcess.kill("SIGTERM");
		serverProcess = null;
	}
});

// ── Tests ──────────────────────────────────────────────────

const ALL_STAGES = [
	"collect",
	"sanitize",
	"sensitivity",
	"categorize",
	"classify",
	"patterns",
	"knowledge",
	"summarize",
	"render",
];

// These tests require spawning the inspector server as a child process.
// Skip in CI — run manually with: INSPECTOR_TEST=1 npx vitest run tests/integration/inspector-step-mode.test.ts
const RUN = process.env.INSPECTOR_TEST === "1";

describe.skipIf(!RUN)("Inspector step-mode", () => {
	it("run-all mode completes without /api/next calls", async () => {
		const result = await post("/api/run", {
			preset: "no-ai-minimal",
			date: "2025-06-15",
			dataMode: "fixtures",
			aiMode: "mock",
			stepMode: false,
		});

		const events = parseSSE(result.body);
		const waitingEvents = events.filter((e) => e.type === "waiting");
		const completeEvents = events.filter((e) => e.type === "complete");

		expect(waitingEvents).toHaveLength(0);
		expect(completeEvents).toHaveLength(1);
		expect(completeEvents[0].markdown!.length).toBeGreaterThan(100);
	}, 15_000);

	it("step mode sends waiting events and advances via /api/next", async () => {
		const events = await runWithAdvance(
			{
				preset: "no-ai-minimal",
				date: "2025-06-15",
				dataMode: "fixtures",
				aiMode: "mock",
				stepMode: true,
			},
			async () => {
				await new Promise((r) => setTimeout(r, 50));
				await post("/api/next");
			}
		);

		const waitingEvents = events.filter((e) => e.type === "waiting");
		const completeEvents = events.filter((e) => e.type === "complete");
		const doneEvents = events.filter(
			(e) => e.type === "stage" && e.status === "done"
		);

		// Waiting events should exist for each stage that ran
		expect(waitingEvents.length).toBeGreaterThanOrEqual(4);

		// All done stages should be valid names
		for (const e of doneEvents) {
			expect(ALL_STAGES).toContain(e.name);
		}

		// Must end with a complete event containing markdown
		expect(completeEvents).toHaveLength(1);
		expect(completeEvents[0].markdown!.length).toBeGreaterThan(100);
	}, 20_000);

	it("zero-delay /api/next calls do not lose advances", async () => {
		const events = await runWithAdvance(
			{
				preset: "no-ai-minimal",
				date: "2025-06-15",
				dataMode: "fixtures",
				aiMode: "mock",
				stepMode: true,
			},
			async () => {
				// No delay — fire immediately to stress the race condition
				await post("/api/next");
			}
		);

		const completeEvents = events.filter((e) => e.type === "complete");
		expect(completeEvents).toHaveLength(1);
		expect(completeEvents[0].markdown).toBeDefined();
	}, 20_000);

	it("full preset completes all 9 stages in step mode", async () => {
		const events = await runWithAdvance(
			{
				preset: "local-llm-classified",
				date: "2025-06-15",
				dataMode: "fixtures",
				aiMode: "mock",
				stepMode: true,
			},
			async () => {
				await new Promise((r) => setTimeout(r, 20));
				await post("/api/next");
			}
		);

		const doneEvents = events.filter(
			(e) => e.type === "stage" && e.status === "done"
		);
		const completeEvents = events.filter((e) => e.type === "complete");

		expect(doneEvents).toHaveLength(9);
		const doneNames = doneEvents.map((e) => e.name);
		for (const stage of ALL_STAGES) {
			expect(doneNames).toContain(stage);
		}

		expect(completeEvents).toHaveLength(1);
		expect(completeEvents[0].markdown).toContain("---");
	}, 20_000);
});
