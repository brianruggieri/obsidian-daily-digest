/**
 * Unit tests for src/collect/claude.ts — noise filtering, signal preservation,
 * deduplication, cap behavior, and conversation identity fields.
 */

import { describe, it, expect } from "vitest";
import { readClaudeSessions, findJsonlFiles, extractTaskTitle } from "../../../src/collect/claude";
import { DailyDigestSettings } from "../../../src/settings/types";
import { mkdtempSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

// ── Helpers ─────────────────────────────────────────────

function makeTempDir(): string {
	return mkdtempSync(join(tmpdir(), "claude-test-"));
}

function makeSettings(overrides: Partial<DailyDigestSettings> = {}): DailyDigestSettings {
	return {
		dailyFolder: "daily",
		filenameTemplate: "YYYY-MM-DD",
		promptBudget: 3000,
		browserConfigs: [],
		aiModel: "claude-haiku-4-5",
		profile: "",
		enableAI: false,
		aiProvider: "local",
		localEndpoint: "",
		localModel: "",
		enableBrowser: false,
		enableClaude: true,
		claudeSessionsDir: "",
		enableCodex: false,
		codexSessionsDir: "",
		enableClassification: false,
		classificationModel: "",
		classificationBatchSize: 8,
		enableSensitivityFilter: false,
		sensitivityPreset: "off",
		sensitivityCategories: [],
		sensitivityCustomDomains: "",
		sensitivityAction: "exclude",
		enableGit: false,
		gitParentDir: "",
		trackRecurrence: false,
		maxVisitsPerDomain: 5,
		promptsDir: "",
		hasCompletedOnboarding: true,
		privacyConsentVersion: 0,
		debugMode: false,
		enableTimeline: false,
		privacyTier: null,
		...overrides,
	} as DailyDigestSettings;
}

/** Write a minimal JSONL file with role:"user" messages and return the path. */
function writeJsonl(dir: string, fileName: string, messages: Array<{ text: string; timestamp?: string }>): string {
	const filePath = join(dir, fileName);
	const lines = messages.map((m, i) => JSON.stringify({
		message: { role: "user", content: m.text },
		timestamp: m.timestamp ?? new Date(Date.now() + i * 1000).toISOString(),
	}));
	writeFileSync(filePath, lines.join("\n") + "\n");
	return filePath;
}

const SINCE = new Date(Date.now() - 86400000); // 24h ago

// ── One real coding prompt for signal tests ──────────────

const REAL_PROMPT = "Implement the OAuth PKCE flow for our React app. We need to support Google and GitHub providers.";
const RESEARCH_PROMPT = "Explain the difference between Raft and Paxos consensus algorithms. Which is better for a 5-node cluster?";

// ── Noise Detection — each noise category excluded ──────

describe("isNoiseMessage — noise categories excluded", () => {
	it("excludes continuation boilerplate", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "This session is being continued from a previous conversation that ran out of context. The conversation history has been summarized above." },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes summarized conversation boilerplate", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "The conversation so far has been summarized as follows:\n\n- User asked about OAuth flow\n- Claude explained PKCE" },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes subagent summary request", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "Your task is to create a detailed summary of the conversation so far, so that a future agent can continue the work." },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes alternate subagent summary request prefix", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "Please provide a detailed summary of our conversation so far, focusing on the key technical decisions." },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes skill file injection starting with 'Base directory for this skill:'", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "Base directory for this skill: /Users/brian/.claude/skills/commit\n\nSkill content follows..." },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes CLAUDE.md dump starting with '# CLAUDE.md'", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "# CLAUDE.md\n\n## Project Overview\n\nThis is the project instructions file." },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes CLAUDE.md contents prefix", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "CLAUDE.md contents:\n\n# My Project\n\nDevelopment instructions..." },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes system-reminder XML wrapper", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "<system-reminder>\nRemember to follow all safety guidelines.\n</system-reminder>" },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes compact-context injection", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "<compact-context>\nPrevious conversation history compressed here.\n</compact-context>" },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes compact representation prefix", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "This is a compact representation of the conversation history for context continuation." },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes [Request interrupted by user] marker", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "[Request interrupted by user]" },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes [SUGGESTION MODE: ...] marker", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "[SUGGESTION MODE: enabled] The user has enabled suggestion mode for this session." },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes [AnthropicBeta: ...] marker", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "[AnthropicBeta: extended-context-preview]" },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes existing protocol tags (local-command-stdout, etc.)", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "<local-command-stdout>\nnpm run build output\n</local-command-stdout>" },
			{ text: "<command-name>git</command-name>" },
			{ text: "<task-notification>Task completed</task-notification>" },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes tool_result XML", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "<tool_result>\n{\"success\": true, \"output\": \"done\"}\n</tool_result>" },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes function_results XML", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "<function_results>\n<result>success</result>\n</function_results>" },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes prompts shorter than NOISE_FILTER_MIN_LENGTH (20 chars)", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		// "Fix it" is 6 chars — should be excluded
		// "Ok" is 2 chars — should be excluded
		writeJsonl(dir, "session.jsonl", [
			{ text: "Fix it" },
			{ text: "Ok" },
			{ text: "Continue" },
			{ text: "Yes do that" },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes prompts longer than NOISE_FILTER_MAX_LENGTH (1500 chars)", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		const longPrompt = "A".repeat(1600);
		writeJsonl(dir, "session.jsonl", [
			{ text: longPrompt },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes markdown-heading-prefixed messages", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "# My Project\n\nThis is the project overview with many lines of content for testing." },
			{ text: "## Section Title\n\nSome detailed content about this section of the document." },
			{ text: "### Subsection\n\nAnother block of injected file content from a dumped markdown file." },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("excludes large JSON blobs", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		const json = JSON.stringify({ data: Array(50).fill({ key: "value", nested: { a: 1, b: 2 } }) });
		expect(json.length).toBeGreaterThan(300); // Verify it's big enough to trigger
		writeJsonl(dir, "session.jsonl", [
			{ text: json },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});
});

// ── Signal Preservation ──────────────────────────────────

describe("signal preservation — real prompts kept", () => {
	it("keeps a real coding prompt", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: REAL_PROMPT },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(1);
		expect(result[0].prompt).toContain("OAuth PKCE");
	});

	it("keeps a real research question", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: RESEARCH_PROMPT },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(1);
		expect(result[0].prompt).toContain("Raft");
	});

	it("keeps a prompt at exactly NOISE_FILTER_MIN_LENGTH (20) chars", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		// Exactly 20 characters (at boundary — should be kept)
		const exactBoundary = "12345678901234567890"; // 20 chars
		expect(exactBoundary.length).toBe(20);
		writeJsonl(dir, "session.jsonl", [
			{ text: exactBoundary },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(1);
	});

	it("keeps prompts with embedded markdown that are not file dumps", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		// Has inline markdown but doesn't start with a heading
		const prompt = "Fix the bug in `auth.ts` where the **token** isn't being refreshed. Here's the error trace.";
		writeJsonl(dir, "session.jsonl", [
			{ text: prompt },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(1);
		expect(result[0].prompt).toContain("auth.ts");
	});

	it("keeps a prompt at exactly NOISE_FILTER_MAX_LENGTH (1500) chars", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		// Exactly 1500 characters — should be kept (boundary is exclusive: > 1500 excluded)
		const atMax = "A".repeat(1500);
		writeJsonl(dir, "session.jsonl", [
			{ text: atMax },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(1);
	});

	it("mixed noise and signal — only signal is kept", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "This session is being continued from a previous conversation that ran out of context." },
			{ text: REAL_PROMPT },
			{ text: "<system-reminder>\nSystem context injection here.\n</system-reminder>" },
			{ text: RESEARCH_PROMPT },
			{ text: "Fix it" },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(2);
		const prompts = result.map((r) => r.prompt);
		expect(prompts.some((p) => p.includes("OAuth PKCE"))).toBe(true);
		expect(prompts.some((p) => p.includes("Raft"))).toBe(true);
	});
});

// ── Deduplication ────────────────────────────────────────

describe("deduplication", () => {
	it("deduplicates prompts sharing the same 60-char prefix", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		// These two prompts share the same first 60 chars
		const base = "Implement the OAuth PKCE flow for our React app — we need it";
		const promptA = base + " to support Google and GitHub providers today.";
		const promptB = base + " to handle edge cases and token refresh properly.";
		expect(base.length).toBe(60);
		const t1 = new Date(Date.now() - 2000).toISOString();
		const t2 = new Date(Date.now() - 1000).toISOString();
		writeJsonl(dir, "session.jsonl", [
			{ text: promptA, timestamp: t1 },
			{ text: promptB, timestamp: t2 },
		]);
		const result = readClaudeSessions(settings, SINCE);
		// After sort (newest-first), promptB is first and kept; promptA is second and deduped
		expect(result).toHaveLength(1);
	});

	it("keeps prompts that differ in first 60 chars even if similar overall", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		const promptA = "Implement the OAuth PKCE flow for our React app with Google.";
		const promptB = "Debug the OAuth PKCE flow in our React app with GitHub.";
		expect(promptA.slice(0, 60)).not.toBe(promptB.slice(0, 60));
		writeJsonl(dir, "session.jsonl", [
			{ text: promptA },
			{ text: promptB },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(2);
	});
});

// ── Cap Behavior ─────────────────────────────────────────

describe("cap behavior (CLAUDE_DISPLAY_CAP = 50)", () => {
	it("returns at most 50 entries after filtering", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		// Create 60 unique, real-looking prompts — all should pass noise filter
		const messages = Array.from({ length: 60 }, (_, i) => ({
			text: `Implement feature ${i} for the authentication module. This needs OAuth PKCE support and token refresh logic.`,
			timestamp: new Date(Date.now() - (60 - i) * 60000).toISOString(),
		}));
		writeJsonl(dir, "session.jsonl", messages);
		const result = readClaudeSessions(settings, SINCE);
		expect(result.length).toBeLessThanOrEqual(50);
	});

	it("returns empty array when all prompts are noise", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: "This session is being continued from a previous conversation." },
			{ text: "<system-reminder>\nContext injection.\n</system-reminder>" },
			{ text: "Fix it" },
			{ text: "[Request interrupted by user]" },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});

	it("preserves newest-first sort after filtering", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		const t1 = new Date(Date.now() - 3000).toISOString(); // oldest
		const t2 = new Date(Date.now() - 2000).toISOString();
		const t3 = new Date(Date.now() - 1000).toISOString(); // newest
		writeJsonl(dir, "session.jsonl", [
			{ text: "Fix the null pointer exception in the auth middleware. Here's the TypeError.", timestamp: t1 },
			{ text: "Write a unit test for the sanitizeUrl function that covers edge cases.", timestamp: t2 },
			{ text: "Review this Express middleware stack for the OAuth flow. I'm getting errors.", timestamp: t3 },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(3);
		// First entry should be newest (t3)
		expect(result[0].time.getTime()).toBeGreaterThan(result[1].time.getTime());
		expect(result[1].time.getTime()).toBeGreaterThan(result[2].time.getTime());
	});

	it("returns empty array when claude is disabled", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir, enableClaude: false });
		writeJsonl(dir, "session.jsonl", [
			{ text: REAL_PROMPT },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(0);
	});
});

// ── Conversation Identity ────────────────────────────────

describe("conversation identity fields", () => {
	it("sets isConversationOpener=true on first message in file", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: REAL_PROMPT, timestamp: new Date(Date.now() - 2000).toISOString() },
			{ text: RESEARCH_PROMPT, timestamp: new Date(Date.now() - 1000).toISOString() },
		]);
		const result = readClaudeSessions(settings, SINCE);
		// After sort newest-first: RESEARCH_PROMPT is first in results
		// but isConversationOpener reflects position in file (first = opener)
		const openers = result.filter((r) => r.isConversationOpener);
		const nonOpeners = result.filter((r) => !r.isConversationOpener);
		expect(openers).toHaveLength(1);
		expect(nonOpeners).toHaveLength(1);
		// The opener prompt should be REAL_PROMPT (first in file)
		expect(openers[0].prompt).toContain("OAuth PKCE");
	});

	it("sets conversationFile to the JSONL filename", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "my-session.jsonl", [
			{ text: REAL_PROMPT },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(1);
		expect(result[0].conversationFile).toBe("my-session.jsonl");
	});

	it("sets conversationTurnCount to total user turns in the file", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session.jsonl", [
			{ text: REAL_PROMPT, timestamp: new Date(Date.now() - 3000).toISOString() },
			{ text: RESEARCH_PROMPT, timestamp: new Date(Date.now() - 2000).toISOString() },
			{ text: "Write a unit test for the sanitizeUrl function that covers edge cases.", timestamp: new Date(Date.now() - 1000).toISOString() },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(3);
		// All entries from the same file share the same conversationTurnCount
		expect(result.every((r) => r.conversationTurnCount === 3)).toBe(true);
	});

	it("assigns different conversationFiles to entries from different JSONL files", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session-a.jsonl", [
			{ text: REAL_PROMPT },
		]);
		writeJsonl(dir, "session-b.jsonl", [
			{ text: RESEARCH_PROMPT },
		]);
		const result = readClaudeSessions(settings, SINCE);
		expect(result).toHaveLength(2);
		const files = result.map((r) => r.conversationFile);
		expect(new Set(files).size).toBe(2);
		expect(files).toContain("session-a.jsonl");
		expect(files).toContain("session-b.jsonl");
	});

	it("entries from different files are each marked as conversation openers", () => {
		const dir = makeTempDir();
		const settings = makeSettings({ claudeSessionsDir: dir });
		writeJsonl(dir, "session-a.jsonl", [
			{ text: REAL_PROMPT },
		]);
		writeJsonl(dir, "session-b.jsonl", [
			{ text: RESEARCH_PROMPT },
		]);
		const result = readClaudeSessions(settings, SINCE);
		// Each file has 1 message, so each should be an opener
		expect(result.every((r) => r.isConversationOpener)).toBe(true);
	});
});

// ── extractTaskTitle ─────────────────────────────────────

describe("extractTaskTitle", () => {
	it("strips imperative verb prefix 'Fix'", () => {
		const title = extractTaskTitle("Fix the null pointer exception in auth middleware");
		expect(title).not.toMatch(/^fix/i);
		expect(title).toContain("null pointer");
	});

	it("strips imperative verb prefix 'Implement'", () => {
		const title = extractTaskTitle("Implement the OAuth PKCE flow for our React app");
		expect(title).not.toMatch(/^implement/i);
		expect(title).toContain("OAuth");
	});

	it("strips question structure 'What is'", () => {
		const title = extractTaskTitle("What is the difference between Raft and Paxos?");
		expect(title).not.toMatch(/^what is/i);
	});

	it("strips question structure 'How does'", () => {
		const title = extractTaskTitle("How does token refresh work in React?");
		expect(title).not.toMatch(/^how does/i);
	});

	it("takes first sentence when prompt has sentence boundary", () => {
		const title = extractTaskTitle("Fix the auth bug. Here is the error trace: TypeError...");
		// Should stop at the period
		expect(title).not.toContain("Here is the error trace");
	});

	it("limits output to 80 chars when no sentence boundary", () => {
		const longPrompt = "Implement the very complex OAuth PKCE flow for our React app that needs many features and also handles edge cases";
		const title = extractTaskTitle(longPrompt);
		expect(title.length).toBeLessThanOrEqual(80);
	});

	it("handles short prompts without stripping too much", () => {
		const title = extractTaskTitle("Add TypeScript types for the API response");
		expect(title.length).toBeGreaterThan(0);
	});
});

// ── findJsonlFiles ───────────────────────────────────────

describe("findJsonlFiles", () => {
	it("returns empty array for non-existent directory", () => {
		const result = findJsonlFiles("/path/that/does/not/exist/at/all");
		expect(result).toHaveLength(0);
	});

	it("finds JSONL files recursively", () => {
		const dir = makeTempDir();
		const subdir = join(dir, "project-a");
		mkdirSync(subdir);
		writeFileSync(join(dir, "top.jsonl"), "");
		writeFileSync(join(subdir, "nested.jsonl"), "");
		writeFileSync(join(subdir, "not-jsonl.txt"), "");
		const result = findJsonlFiles(dir);
		expect(result).toHaveLength(2);
		expect(result.some((f) => f.includes("top.jsonl"))).toBe(true);
		expect(result.some((f) => f.includes("nested.jsonl"))).toBe(true);
		expect(result.some((f) => f.includes("not-jsonl.txt"))).toBe(false);
	});
});
