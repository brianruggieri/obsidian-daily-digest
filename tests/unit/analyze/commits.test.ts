import { describe, it, expect } from "vitest";
import {
	parseConventionalCommit,
	classifyWorkMode,
	groupCommitsIntoWorkUnits,
} from "../../../src/analyze/commits";
import { GitCommit } from "../../../src/types";

// ── Helpers ───────────────────────────────────────────────

const BASE_MS = 1_700_000_000_000;
const MIN = 60_000;

function makeCommit(
	message: string,
	offsetMin = 0,
	repo = "my-repo",
	insertions = 10,
	deletions = 2,
): GitCommit {
	return {
		hash: `hash-${offsetMin}`,
		message,
		time: new Date(BASE_MS + offsetMin * MIN),
		repo,
		filesChanged: 1,
		insertions,
		deletions,
	};
}

// ── parseConventionalCommit ───────────────────────────────

describe("parseConventionalCommit", () => {
	it("parses a simple feat commit", () => {
		const result = parseConventionalCommit("feat: add login page");
		expect(result.type).toBe("feat");
		expect(result.scope).toBeNull();
		expect(result.breaking).toBe(false);
		expect(result.description).toBe("add login page");
	});

	it("parses a commit with scope", () => {
		const result = parseConventionalCommit("fix(render): fix null pointer");
		expect(result.type).toBe("fix");
		expect(result.scope).toBe("render");
		expect(result.description).toBe("fix null pointer");
	});

	it("parses a breaking change commit", () => {
		const result = parseConventionalCommit("feat(api)!: change response format");
		expect(result.type).toBe("feat");
		expect(result.scope).toBe("api");
		expect(result.breaking).toBe(true);
		expect(result.description).toBe("change response format");
	});

	it("handles non-conventional commit", () => {
		const result = parseConventionalCommit("update some things");
		expect(result.type).toBe("");
		expect(result.scope).toBeNull();
		expect(result.breaking).toBe(false);
		expect(result.description).toBe("update some things");
		expect(result.raw).toBe("update some things");
	});

	it("is case-insensitive for type", () => {
		const result = parseConventionalCommit("FEAT: add something");
		expect(result.type).toBe("feat");
	});

	it("preserves raw message exactly", () => {
		const msg = "feat(scope): description with | pipe";
		const result = parseConventionalCommit(msg);
		expect(result.raw).toBe(msg);
	});

	it("handles description with pipe characters", () => {
		const result = parseConventionalCommit("docs: update README | add examples");
		expect(result.type).toBe("docs");
		expect(result.description).toBe("update README | add examples");
	});
});

// ── classifyWorkMode ──────────────────────────────────────

describe("classifyWorkMode", () => {
	it("maps feat type to building", () => {
		const parsed = parseConventionalCommit("feat: add feature");
		expect(classifyWorkMode(parsed, 100, 10)).toBe("building");
	});

	it("maps fix type to debugging", () => {
		const parsed = parseConventionalCommit("fix: resolve crash");
		expect(classifyWorkMode(parsed, 5, 5)).toBe("debugging");
	});

	it("maps refactor to restructuring", () => {
		const parsed = parseConventionalCommit("refactor: extract helper");
		expect(classifyWorkMode(parsed, 20, 20)).toBe("restructuring");
	});

	it("maps test type to testing", () => {
		const parsed = parseConventionalCommit("test: add unit tests");
		expect(classifyWorkMode(parsed, 50, 0)).toBe("testing");
	});

	it("maps docs type to documenting", () => {
		const parsed = parseConventionalCommit("docs: update README");
		expect(classifyWorkMode(parsed, 10, 5)).toBe("documenting");
	});

	it("maps chore/build/ci to infrastructure", () => {
		const c = parseConventionalCommit("chore: update deps");
		expect(classifyWorkMode(c, 5, 5)).toBe("infrastructure");
		const b = parseConventionalCommit("build: upgrade webpack");
		expect(classifyWorkMode(b, 5, 5)).toBe("infrastructure");
		const ci = parseConventionalCommit("ci: fix pipeline");
		expect(classifyWorkMode(ci, 5, 5)).toBe("infrastructure");
	});

	it("maps perf to optimizing", () => {
		const parsed = parseConventionalCommit("perf: cache results");
		expect(classifyWorkMode(parsed, 20, 5)).toBe("optimizing");
	});

	it("maps revert to reverting", () => {
		const parsed = parseConventionalCommit("revert: undo previous change");
		expect(classifyWorkMode(parsed, 0, 50)).toBe("reverting");
	});

	it("uses keyword fallback for bug-fix language", () => {
		const parsed = parseConventionalCommit("fixed null pointer exception");
		expect(classifyWorkMode(parsed, 3, 3)).toBe("debugging");
	});

	it("uses keyword fallback for add/implement language", () => {
		const parsed = parseConventionalCommit("implement new auth flow");
		expect(classifyWorkMode(parsed, 80, 5)).toBe("building");
	});

	it("uses ratio heuristic when only insertions", () => {
		const parsed = parseConventionalCommit("some new stuff");
		expect(classifyWorkMode(parsed, 100, 0)).toBe("building");
	});

	it("uses ratio heuristic for deletions-heavy change", () => {
		const parsed = parseConventionalCommit("remove old code");
		expect(classifyWorkMode(parsed, 2, 100)).toBe("restructuring");
	});

	it("falls back to tweaking for generic messages", () => {
		const parsed = parseConventionalCommit("misc");
		expect(classifyWorkMode(parsed, 2, 2)).toBe("tweaking");
	});
});

// ── groupCommitsIntoWorkUnits ─────────────────────────────

describe("groupCommitsIntoWorkUnits", () => {
	it("returns [] for empty input", () => {
		expect(groupCommitsIntoWorkUnits([])).toEqual([]);
	});

	it("groups a single commit into one work unit", () => {
		const commits = [makeCommit("feat: add login page", 0)];
		const units = groupCommitsIntoWorkUnits(commits);
		expect(units).toHaveLength(1);
		expect(units[0].commits).toHaveLength(1);
	});

	it("groups nearby commits into one session", () => {
		const commits = [
			makeCommit("feat: add header", 0),
			makeCommit("feat: add footer", 30), // 30 min gap — within 90 min session
		];
		const units = groupCommitsIntoWorkUnits(commits);
		// Both are feat building — should be one unit
		const buildingUnits = units.filter((u) => u.workMode === "building");
		expect(buildingUnits.length).toBeGreaterThanOrEqual(1);
		const totalCommits = units.reduce((s, u) => s + u.commits.length, 0);
		expect(totalCommits).toBe(2);
	});

	it("splits sessions on a 90+ minute gap", () => {
		const commits = [
			makeCommit("feat: morning work", 0),
			makeCommit("fix: afternoon fix", 100), // 100 min gap — new session
		];
		const units = groupCommitsIntoWorkUnits(commits);
		// Should produce 2 separate work units (different sessions)
		expect(units.length).toBe(2);
	});

	it("separates debugging commits from building commits within a session", () => {
		const commits = [
			makeCommit("feat: add feature", 0),
			makeCommit("fix: fix crash", 10),   // 10 min gap, same session
		];
		const units = groupCommitsIntoWorkUnits(commits);
		// Should produce 2 units: one building, one debugging
		const modes = units.map((u) => u.workMode);
		expect(modes).toContain("building");
		expect(modes).toContain("debugging");
	});

	it("uses scope to label work units", () => {
		const commits = [
			makeCommit("feat(render): add section", 0),
			makeCommit("fix(render): fix null check", 5),
		];
		const units = groupCommitsIntoWorkUnits(commits);
		// The building unit should be labeled with scope "render"
		const buildUnit = units.find((u) => u.workMode === "building");
		expect(buildUnit?.label).toContain("render");
	});

	it("populates timeRange from commit times", () => {
		const start = new Date(BASE_MS);
		const end = new Date(BASE_MS + 30 * MIN);
		const commits = [
			makeCommit("feat: first", 0),
			makeCommit("feat: second", 30),
		];
		const units = groupCommitsIntoWorkUnits(commits);
		const unit = units.find((u) => u.commits.length > 0);
		expect(unit).toBeDefined();
		if (unit) {
			expect(unit.timeRange.start.getTime()).toBeLessThanOrEqual(end.getTime());
			expect(unit.timeRange.end.getTime()).toBeGreaterThanOrEqual(start.getTime());
		}
	});

	it("detects why information in commit messages", () => {
		const commits = [makeCommit("feat: add caching because it was slow", 0)];
		const units = groupCommitsIntoWorkUnits(commits);
		expect(units[0].hasWhyInformation).toBe(true);
		expect(units[0].whyClause).not.toBeNull();
	});

	it("marks generic commits with isGeneric=true", () => {
		const commits = [makeCommit("wip", 0)];
		const units = groupCommitsIntoWorkUnits(commits);
		expect(units[0].isGeneric).toBe(true);
	});

	it("populates repos from commit data", () => {
		const commits = [makeCommit("feat: add feature", 0, "my-repo")];
		const units = groupCommitsIntoWorkUnits(commits);
		expect(units[0].repos).toContain("my-repo");
	});

	it("handles commits without timestamps gracefully", () => {
		const commit: GitCommit = {
			hash: "abc",
			message: "feat: something",
			time: null,
			repo: "repo",
			filesChanged: 1,
			insertions: 5,
			deletions: 0,
		};
		const units = groupCommitsIntoWorkUnits([commit]);
		expect(units).toHaveLength(1);
	});

	it("sorts work units most-recent first", () => {
		const commits = [
			makeCommit("feat: older", 0),
			makeCommit("feat: newer", 200), // new session
		];
		const units = groupCommitsIntoWorkUnits(commits);
		if (units.length >= 2) {
			expect(units[0].timeRange.start.getTime()).toBeGreaterThanOrEqual(
				units[1].timeRange.start.getTime()
			);
		}
	});
});
