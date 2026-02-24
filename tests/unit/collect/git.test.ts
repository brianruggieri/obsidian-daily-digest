import { describe, it, expect } from "vitest";
import { readGitHistory, parseGitLogOutput } from "../../../src/collect/git";
import type { DailyDigestSettings } from "../../../src/settings/types";

// ── parseGitLogOutput tests ─────────────────────────────

describe("parseGitLogOutput", () => {
	it("parses well-formed git log output", () => {
		const raw = [
			"abc1234|feat: Add OAuth PKCE flow|2026-02-20T14:30:00+00:00",
			" 3 files changed, 42 insertions(+), 8 deletions(-)",
			"",
			"def5678|fix: Handle null token edge case|2026-02-20T15:15:00+00:00",
			" 1 file changed, 12 insertions(+), 3 deletions(-)",
		].join("\n");

		const commits = parseGitLogOutput(raw, "my-repo");
		expect(commits).toHaveLength(2);

		expect(commits[0].hash).toBe("abc1234");
		expect(commits[0].message).toBe("feat: Add OAuth PKCE flow");
		expect(commits[0].time).toBeInstanceOf(Date);
		expect(commits[0].repo).toBe("my-repo");
		expect(commits[0].filesChanged).toBe(3);
		expect(commits[0].insertions).toBe(42);
		expect(commits[0].deletions).toBe(8);

		expect(commits[1].hash).toBe("def5678");
		expect(commits[1].filesChanged).toBe(1);
		expect(commits[1].insertions).toBe(12);
		expect(commits[1].deletions).toBe(3);
	});

	it("handles insertions-only stat lines", () => {
		const raw = [
			"aaa1111|feat: Add new file|2026-02-20T10:00:00+00:00",
			" 1 file changed, 20 insertions(+)",
		].join("\n");

		const commits = parseGitLogOutput(raw, "repo");
		expect(commits[0].insertions).toBe(20);
		expect(commits[0].deletions).toBe(0);
	});

	it("handles deletions-only stat lines", () => {
		const raw = [
			"bbb2222|chore: Remove dead code|2026-02-20T10:00:00+00:00",
			" 2 files changed, 15 deletions(-)",
		].join("\n");

		const commits = parseGitLogOutput(raw, "repo");
		expect(commits[0].insertions).toBe(0);
		expect(commits[0].deletions).toBe(15);
	});

	it("handles commits with no shortstat (merge commits)", () => {
		const raw = [
			"ccc3333|Merge branch 'main' into feature|2026-02-20T11:00:00+00:00",
			"",
			"ddd4444|feat: Real commit|2026-02-20T12:00:00+00:00",
			" 1 file changed, 5 insertions(+)",
		].join("\n");

		const commits = parseGitLogOutput(raw, "repo");
		expect(commits).toHaveLength(2);
		expect(commits[0].filesChanged).toBe(0);
		expect(commits[0].insertions).toBe(0);
		expect(commits[0].deletions).toBe(0);
		expect(commits[1].filesChanged).toBe(1);
	});

	it("returns empty array for empty output", () => {
		expect(parseGitLogOutput("", "repo")).toEqual([]);
		expect(parseGitLogOutput("\n\n", "repo")).toEqual([]);
	});

	it("scrubs secrets from commit messages", () => {
		const secret = "sk_test_abc123def456ghi789abcde";
		const raw = [
			`eee5555|fix: Update API key ${secret}|2026-02-20T10:00:00+00:00`,
			" 1 file changed, 1 insertion(+)",
		].join("\n");

		const commits = parseGitLogOutput(raw, "repo");
		expect(commits[0].message).not.toContain(secret);
		expect(commits[0].message).toContain("[STRIPE_KEY_REDACTED]");
	});

	it("uses directory name as repo, not full path", () => {
		const raw = [
			"fff6666|feat: Something|2026-02-20T10:00:00+00:00",
			" 1 file changed, 1 insertion(+)",
		].join("\n");

		const commits = parseGitLogOutput(raw, "my-project");
		expect(commits[0].repo).toBe("my-project");
		expect(commits[0].repo).not.toContain("/");
	});
});

// ── readGitHistory tests ────────────────────────────────

describe("readGitHistory", () => {
	it("returns empty array when enableGit is false", () => {
		const settings = { enableGit: false } as DailyDigestSettings;
		const result = readGitHistory(settings, new Date());
		expect(result).toEqual([]);
	});

	it("returns empty array when gitParentDir is empty", () => {
		const settings = {
			enableGit: true,
			gitParentDir: "",
		} as DailyDigestSettings;
		const result = readGitHistory(settings, new Date());
		expect(result).toEqual([]);
	});

	it("returns empty array when gitParentDir does not exist", () => {
		const settings = {
			enableGit: true,
			gitParentDir: "/nonexistent/path/that/does/not/exist",
		} as DailyDigestSettings;
		const result = readGitHistory(settings, new Date());
		expect(result).toEqual([]);
	});

});
