import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { readCodexSessions } from "../../src/collectors";
import { DEFAULT_SETTINGS } from "../../src/settings";

// ── Helpers ──────────────────────────────────────────────

function makeSettings(overrides: Record<string, unknown> = {}) {
	return {
		...DEFAULT_SETTINGS,
		enableCodex: true,
		maxCodexSessions: 30,
		collectionMode: "complete" as const,
		...overrides,
	};
}

/** Build a minimal Codex session_meta line */
function metaLine(cwd: string): string {
	return JSON.stringify({
		timestamp: new Date().toISOString(),
		type: "session_meta",
		payload: { id: "test-session", cwd, model_provider: "openai" },
	});
}

/** Build a Codex response_item user message */
function userLine(text: string, ts?: Date): string {
	return JSON.stringify({
		timestamp: (ts ?? new Date()).toISOString(),
		type: "response_item",
		payload: {
			role: "user",
			content: [{ type: "input_text", text }],
		},
	});
}

/** Build an injected context line (should be filtered out) */
function injectedLine(prefix: string): string {
	return userLine(`${prefix} some injected context that should be skipped`);
}

/** Build a non-user response_item (assistant) — should be ignored */
function assistantLine(text: string): string {
	return JSON.stringify({
		timestamp: new Date().toISOString(),
		type: "response_item",
		payload: {
			role: "assistant",
			content: [{ type: "text", text }],
		},
	});
}

// ── Test setup ───────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
	tmpDir = join(tmpdir(), `codex-test-${Date.now()}`);
	mkdirSync(tmpDir, { recursive: true });
});

afterEach(() => {
	rmSync(tmpDir, { recursive: true, force: true });
});

// ── Tests ────────────────────────────────────────────────

describe("readCodexSessions", () => {
	it("returns empty array when enableCodex is false", () => {
		const settings = makeSettings({ enableCodex: false, codexSessionsDir: tmpDir });
		const result = readCodexSessions(settings, new Date(0));
		expect(result).toHaveLength(0);
	});

	it("returns empty array when directory does not exist", () => {
		const settings = makeSettings({ codexSessionsDir: "/nonexistent/path/xyz" });
		const result = readCodexSessions(settings, new Date(0));
		expect(result).toHaveLength(0);
	});

	it("parses a simple session file and extracts user prompts", () => {
		const prompt = "commit vCard changes and clean up screenshots";
		const sessionFile = join(tmpDir, "rollout-test.jsonl");
		writeFileSync(sessionFile, [
			metaLine("/Users/test/myproject"),
			userLine(prompt),
			assistantLine("Sure, I can help with that."),
		].join("\n"));

		const settings = makeSettings({ codexSessionsDir: tmpDir });
		const result = readCodexSessions(settings, new Date(0));

		expect(result).toHaveLength(1);
		expect(result[0].prompt).toBe(prompt);
		expect(result[0].project).toBe("myproject");
	});

	it("uses cwd basename from session_meta as project name", () => {
		const sessionFile = join(tmpDir, "session.jsonl");
		writeFileSync(sessionFile, [
			metaLine("/Users/brian/git/obsidian-claude-daily"),
			userLine("refactor the auth module"),
		].join("\n"));

		const settings = makeSettings({ codexSessionsDir: tmpDir });
		const result = readCodexSessions(settings, new Date(0));

		expect(result[0].project).toBe("obsidian-claude-daily");
	});

	it("filters out injected system context prefixes", () => {
		const realPrompt = "fix the race condition in session manager";
		const sessionFile = join(tmpDir, "session.jsonl");
		writeFileSync(sessionFile, [
			metaLine("/Users/test/proj"),
			injectedLine("<environment_context"),
			injectedLine("<permissions instructions>"),
			injectedLine("<app-context>"),
			injectedLine("# AGENTS.md"),
			injectedLine("<INSTRUCTIONS"),
			injectedLine("You are Codex"),
			injectedLine("<system"),
			userLine(realPrompt),
		].join("\n"));

		const settings = makeSettings({ codexSessionsDir: tmpDir });
		const result = readCodexSessions(settings, new Date(0));

		expect(result).toHaveLength(1);
		expect(result[0].prompt).toBe(realPrompt);
	});

	it("ignores assistant messages", () => {
		const sessionFile = join(tmpDir, "session.jsonl");
		writeFileSync(sessionFile, [
			metaLine("/Users/test/proj"),
			userLine("a real user prompt"),
			assistantLine("Here is the assistant response"),
		].join("\n"));

		const settings = makeSettings({ codexSessionsDir: tmpDir });
		const result = readCodexSessions(settings, new Date(0));

		expect(result).toHaveLength(1);
		expect(result[0].prompt).toBe("a real user prompt");
	});

	it("ignores prompts of 5 characters or fewer", () => {
		const sessionFile = join(tmpDir, "session.jsonl");
		writeFileSync(sessionFile, [
			metaLine("/Users/test/proj"),
			userLine("ok"),
			userLine("hi"),
			userLine("this is a real prompt worth keeping"),
		].join("\n"));

		const settings = makeSettings({ codexSessionsDir: tmpDir });
		const result = readCodexSessions(settings, new Date(0));

		expect(result).toHaveLength(1);
	});

	it("truncates prompts longer than 200 characters", () => {
		const longPrompt = "a".repeat(300);
		const sessionFile = join(tmpDir, "session.jsonl");
		writeFileSync(sessionFile, [
			metaLine("/Users/test/proj"),
			userLine(longPrompt),
		].join("\n"));

		const settings = makeSettings({ codexSessionsDir: tmpDir });
		const result = readCodexSessions(settings, new Date(0));

		expect(result[0].prompt).toHaveLength(201); // 200 chars + ellipsis character
		expect(result[0].prompt.endsWith("\u2026")).toBe(true);
	});

	it("respects the since date cutoff", () => {
		const past = new Date("2025-01-01T00:00:00Z");
		const recent = new Date("2025-06-01T12:00:00Z");
		const cutoff = new Date("2025-03-01T00:00:00Z");

		const sessionFile = join(tmpDir, "session.jsonl");
		writeFileSync(sessionFile, [
			metaLine("/Users/test/proj"),
			userLine("old prompt that should be excluded", past),
			userLine("recent prompt that should be included", recent),
		].join("\n"));

		const settings = makeSettings({ codexSessionsDir: tmpDir });
		const result = readCodexSessions(settings, cutoff);

		expect(result).toHaveLength(1);
		expect(result[0].prompt).toBe("recent prompt that should be included");
	});

	it("respects maxCodexSessions limit in limited mode", () => {
		const sessionFile = join(tmpDir, "session.jsonl");
		const lines = [metaLine("/Users/test/proj")];
		for (let i = 0; i < 20; i++) {
			lines.push(userLine(`prompt number ${i} from the session`));
		}
		writeFileSync(sessionFile, lines.join("\n"));

		const settings = makeSettings({
			codexSessionsDir: tmpDir,
			collectionMode: "limited",
			maxCodexSessions: 5,
		});
		const result = readCodexSessions(settings, new Date(0));

		expect(result).toHaveLength(5);
	});

	it("returns up to 300 entries in complete mode regardless of maxCodexSessions", () => {
		const sessionFile = join(tmpDir, "session.jsonl");
		const lines = [metaLine("/Users/test/proj")];
		for (let i = 0; i < 50; i++) {
			lines.push(userLine(`bulk prompt number ${i} for complete mode test`));
		}
		writeFileSync(sessionFile, lines.join("\n"));

		const settings = makeSettings({
			codexSessionsDir: tmpDir,
			collectionMode: "complete",
			maxCodexSessions: 5, // ignored in complete mode
		});
		const result = readCodexSessions(settings, new Date(0));

		expect(result).toHaveLength(50);
	});

	it("walks subdirectories recursively (date-based YYYY/MM/DD layout)", () => {
		const dateDir = join(tmpDir, "2026", "02", "21");
		mkdirSync(dateDir, { recursive: true });
		writeFileSync(join(dateDir, "rollout-session.jsonl"), [
			metaLine("/Users/test/myrepo"),
			userLine("nested session prompt in date-based directory"),
		].join("\n"));

		const settings = makeSettings({ codexSessionsDir: tmpDir });
		const result = readCodexSessions(settings, new Date(0));

		expect(result).toHaveLength(1);
		expect(result[0].prompt).toBe("nested session prompt in date-based directory");
	});

	it("gracefully skips malformed or unparseable lines", () => {
		const sessionFile = join(tmpDir, "session.jsonl");
		writeFileSync(sessionFile, [
			metaLine("/Users/test/proj"),
			"not valid json at all {{{",
			'{"type": "response_item"}', // missing payload
			userLine("valid prompt after bad lines"),
		].join("\n"));

		const settings = makeSettings({ codexSessionsDir: tmpDir });
		const result = readCodexSessions(settings, new Date(0));

		expect(result).toHaveLength(1);
		expect(result[0].prompt).toBe("valid prompt after bad lines");
	});

	it("returns results sorted newest-first", () => {
		const t1 = new Date("2025-06-01T10:00:00Z");
		const t2 = new Date("2025-06-01T14:00:00Z");
		const t3 = new Date("2025-06-01T18:00:00Z");

		const sessionFile = join(tmpDir, "session.jsonl");
		writeFileSync(sessionFile, [
			metaLine("/Users/test/proj"),
			userLine("morning prompt", t1),
			userLine("afternoon prompt", t2),
			userLine("evening prompt", t3),
		].join("\n"));

		const settings = makeSettings({ codexSessionsDir: tmpDir });
		const result = readCodexSessions(settings, new Date(0));

		expect(result[0].prompt).toBe("evening prompt");
		expect(result[1].prompt).toBe("afternoon prompt");
		expect(result[2].prompt).toBe("morning prompt");
	});
});
