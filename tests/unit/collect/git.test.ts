import { describe, it, expect } from "vitest";
import { readGitHistory, parseGitLogOutput, isStashCommit } from "../../../src/collect/git";
import type { DailyDigestSettings } from "../../../src/settings/types";

// ── parseGitLogOutput tests ─────────────────────────────
//
// The --numstat format produces per-commit output structured as:
//   <hash>|<refs>|<subject>|<authorDateISO>
//   (blank line)
//   <insertions>\t<deletions>\t<filepath>
//   ...
//   (blank line separating commits)
//
// The %D (refs) field may be empty string. Subject may contain "|".

describe("parseGitLogOutput", () => {
	it("parses well-formed numstat git log output", () => {
		// Two commits with numstat file lines
		const raw = [
			"abc1234||feat: Add OAuth PKCE flow|2026-02-20T14:30:00+00:00",
			"",
			"42\t8\tsrc/auth/pkce.ts",
			"5\t0\tsrc/auth/index.ts",
			"3\t2\ttests/auth.test.ts",
			"",
			"def5678||fix: Handle null token edge case|2026-02-20T15:15:00+00:00",
			"",
			"12\t3\tsrc/auth/token.ts",
			"",
		].join("\n");

		const commits = parseGitLogOutput(raw, "my-repo");
		expect(commits).toHaveLength(2);

		expect(commits[0].hash).toBe("abc1234");
		expect(commits[0].message).toBe("feat: Add OAuth PKCE flow");
		expect(commits[0].time).toBeInstanceOf(Date);
		expect(commits[0].repo).toBe("my-repo");
		expect(commits[0].filesChanged).toBe(3);
		expect(commits[0].insertions).toBe(50); // 42 + 5 + 3
		expect(commits[0].deletions).toBe(10);  // 8 + 0 + 2
		expect(commits[0].filePaths).toEqual([
			"src/auth/pkce.ts",
			"src/auth/index.ts",
			"tests/auth.test.ts",
		]);

		expect(commits[1].hash).toBe("def5678");
		expect(commits[1].filesChanged).toBe(1);
		expect(commits[1].insertions).toBe(12);
		expect(commits[1].deletions).toBe(3);
		expect(commits[1].filePaths).toEqual(["src/auth/token.ts"]);
	});

	it("handles insertions-only numstat lines", () => {
		const raw = [
			"aaa1111||feat: Add new file|2026-02-20T10:00:00+00:00",
			"",
			"20\t0\tsrc/newfile.ts",
		].join("\n");

		const commits = parseGitLogOutput(raw, "repo");
		expect(commits[0].insertions).toBe(20);
		expect(commits[0].deletions).toBe(0);
	});

	it("handles deletions-only numstat lines", () => {
		const raw = [
			"bbb2222||chore: Remove dead code|2026-02-20T10:00:00+00:00",
			"",
			"0\t15\tsrc/old.ts",
			"0\t8\tsrc/another.ts",
		].join("\n");

		const commits = parseGitLogOutput(raw, "repo");
		expect(commits[0].insertions).toBe(0);
		expect(commits[0].deletions).toBe(23); // 15 + 8
		expect(commits[0].filesChanged).toBe(2);
	});

	it("handles merge commits with no numstat lines", () => {
		const raw = [
			"ccc3333||Merge branch 'main' into feature|2026-02-20T11:00:00+00:00",
			"",
			"",
			"ddd4444||feat: Real commit|2026-02-20T12:00:00+00:00",
			"",
			"5\t0\tsrc/feature.ts",
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
			`eee5555||fix: Update API key ${secret}|2026-02-20T10:00:00+00:00`,
			"",
			"1\t1\tsrc/config.ts",
		].join("\n");

		const commits = parseGitLogOutput(raw, "repo");
		expect(commits[0].message).not.toContain(secret);
		expect(commits[0].message).toContain("[STRIPE_KEY_REDACTED]");
	});

	it("uses directory name as repo, not full path", () => {
		const raw = [
			"fff6666||feat: Something|2026-02-20T10:00:00+00:00",
			"",
			"1\t0\tsrc/thing.ts",
		].join("\n");

		const commits = parseGitLogOutput(raw, "my-project");
		expect(commits[0].repo).toBe("my-project");
		expect(commits[0].repo).not.toContain("/");
	});

	it("handles binary files (numstat shows - for counts)", () => {
		const raw = [
			"ggg7777||chore: Add image|2026-02-20T10:00:00+00:00",
			"",
			"-\t-\tassets/logo.png",
			"5\t2\tsrc/component.ts",
		].join("\n");

		const commits = parseGitLogOutput(raw, "repo");
		// Binary files don't contribute to insertions/deletions counts
		expect(commits[0].filesChanged).toBe(2); // both files counted
		expect(commits[0].insertions).toBe(5);   // only from ts file
		expect(commits[0].deletions).toBe(2);    // only from ts file
	});

	it("handles subject lines with | characters", () => {
		const raw = [
			"hhh8888||feat(render): add section A | section B|2026-02-20T10:00:00+00:00",
			"",
			"3\t0\tsrc/render.ts",
		].join("\n");

		const commits = parseGitLogOutput(raw, "repo");
		expect(commits[0].message).toContain("section A | section B");
	});

	it("handles refs/decorator field", () => {
		const raw = [
			"iii9999|HEAD -> main, origin/main|fix: patch|2026-02-20T10:00:00+00:00",
			"",
			"1\t0\tsrc/patch.ts",
		].join("\n");

		const commits = parseGitLogOutput(raw, "repo");
		expect(commits[0].hash).toBe("iii9999");
		expect(commits[0].message).toBe("fix: patch");
	});
});

// ── isStashCommit tests ─────────────────────────────────

describe("isStashCommit", () => {
	it("matches 'On <branch>:' stash messages", () => {
		expect(isStashCommit("On main: WIP save")).toBe(true);
		expect(isStashCommit("On feat/login: stash changes")).toBe(true);
		expect(isStashCommit("On fix/v1-data-quality: quick save")).toBe(true);
	});

	it("matches 'index on <branch>:' stash messages", () => {
		expect(isStashCommit("index on main: abc1234 some commit message")).toBe(true);
		expect(isStashCommit("index on feat/login: def5678 fix auth")).toBe(true);
	});

	it("matches 'untracked files on <branch>:' stash messages", () => {
		expect(isStashCommit("untracked files on main: abc1234 some commit")).toBe(true);
		expect(isStashCommit("untracked files on feat/auth: def5678 WIP")).toBe(true);
	});

	it("does not match regular commit messages", () => {
		expect(isStashCommit("feat: Add OAuth PKCE flow")).toBe(false);
		expect(isStashCommit("fix: Handle null token edge case")).toBe(false);
		expect(isStashCommit("Merge branch 'main' into feature")).toBe(false);
		expect(isStashCommit("chore: Update dependencies")).toBe(false);
	});

	it("does not match messages that contain stash-like text mid-string", () => {
		expect(isStashCommit("fix: Based On main: fix logic")).toBe(false);
		expect(isStashCommit("docs: Note about index on main: usage")).toBe(false);
	});
});

// ── parseGitLogOutput stash filtering ───────────────────

describe("parseGitLogOutput stash filtering", () => {
	it("filters out stash commits from parsed output", () => {
		const raw = [
			"aaa1111||On main: WIP save|2026-02-20T10:00:00+00:00",
			"",
			"5\t0\tsrc/file.ts",
			"",
			"bbb2222||feat: Real commit|2026-02-20T10:05:00+00:00",
			"",
			"10\t3\tsrc/auth.ts",
			"",
			"ccc3333||index on main: aaa1111 WIP save|2026-02-20T10:00:00+00:00",
			"",
			"5\t0\tsrc/file.ts",
			"",
			"ddd4444||untracked files on main: aaa1111 WIP save|2026-02-20T10:00:00+00:00",
			"",
			"-\t-\tnew-file.txt",
		].join("\n");

		const commits = parseGitLogOutput(raw, "my-repo");
		expect(commits).toHaveLength(1);
		expect(commits[0].hash).toBe("bbb2222");
		expect(commits[0].message).toBe("feat: Real commit");
	});

	it("preserves all commits when none are stash entries", () => {
		const raw = [
			"abc1234||feat: Add feature|2026-02-20T10:00:00+00:00",
			"",
			"5\t0\tsrc/feature.ts",
			"",
			"def5678||fix: Fix bug|2026-02-20T11:00:00+00:00",
			"",
			"2\t1\tsrc/bug.ts",
		].join("\n");

		const commits = parseGitLogOutput(raw, "repo");
		expect(commits).toHaveLength(2);
	});

	it("returns empty array when all commits are stash entries", () => {
		const raw = [
			"aaa1111||On main: stash 1|2026-02-20T10:00:00+00:00",
			"",
			"bbb2222||index on main: aaa1111 stash 1|2026-02-20T10:00:00+00:00",
			"",
		].join("\n");

		const commits = parseGitLogOutput(raw, "repo");
		expect(commits).toHaveLength(0);
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
