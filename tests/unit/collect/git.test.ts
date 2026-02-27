import { describe, it, expect } from "vitest";
import { readGitHistory, parseGitLogOutput } from "../../../src/collect/git";
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
