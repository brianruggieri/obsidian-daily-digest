import { describe, it, expect } from "vitest";
import {
	groupClaudeSessionsIntoTasks,
	detectSearchMissions,
	fuseCrossSourceSessions,
} from "../../../src/analyze/task-sessions";
import { ClaudeSession, SearchQuery } from "../../../src/types";

// ── Helpers ───────────────────────────────────────────────

const BASE_MS = 1_700_000_000_000;
const MIN = 60_000;

function makeSession(
	prompt: string,
	offsetMin = 0,
	file = "conv1.jsonl",
	project = "my-project",
	isOpener = true,
	turnCount = 1,
): ClaudeSession {
	return {
		prompt,
		time: new Date(BASE_MS + offsetMin * MIN),
		project,
		isConversationOpener: isOpener,
		conversationFile: file,
		conversationTurnCount: turnCount,
	};
}

function makeSearch(query: string, offsetMin = 0): SearchQuery {
	return {
		query,
		time: new Date(BASE_MS + offsetMin * MIN),
		engine: "google.com",
	};
}

// ── groupClaudeSessionsIntoTasks ─────────────────────────

describe("groupClaudeSessionsIntoTasks", () => {
	it("returns [] for empty input", () => {
		expect(groupClaudeSessionsIntoTasks([])).toEqual([]);
	});

	it("groups sessions by conversationFile", () => {
		const sessions = [
			makeSession("fix the login bug", 0, "conv1.jsonl", "proj", true, 2),
			makeSession("also check the session timeout", 5, "conv1.jsonl", "proj", false, 2),
			makeSession("explain typescript generics", 60, "conv2.jsonl", "proj", true, 1),
		];
		const tasks = groupClaudeSessionsIntoTasks(sessions);
		expect(tasks).toHaveLength(2);
		const conv1 = tasks.find((t) => t.conversationFile === "conv1.jsonl");
		const conv2 = tasks.find((t) => t.conversationFile === "conv2.jsonl");
		expect(conv1?.prompts).toHaveLength(2);
		expect(conv2?.prompts).toHaveLength(1);
	});

	it("extracts task title from opener prompt", () => {
		const sessions = [makeSession("implement user authentication middleware", 0)];
		const tasks = groupClaudeSessionsIntoTasks(sessions);
		expect(tasks[0].taskTitle.length).toBeGreaterThan(0);
		// Title should strip the "implement" verb prefix
		expect(tasks[0].taskTitle.toLowerCase()).not.toMatch(/^implement\s/);
	});

	it("classifies debugging tasks correctly", () => {
		const sessions = [makeSession("fix the broken import that throws TypeError", 0)];
		const tasks = groupClaudeSessionsIntoTasks(sessions);
		expect(tasks[0].taskType).toBe("debugging");
	});

	it("classifies learning tasks correctly", () => {
		const sessions = [makeSession("explain how typescript generic constraints work", 0)];
		const tasks = groupClaudeSessionsIntoTasks(sessions);
		expect(tasks[0].taskType).toBe("learning");
	});

	it("classifies architecture tasks correctly", () => {
		const sessions = [makeSession("design a state management architecture for my app", 0)];
		const tasks = groupClaudeSessionsIntoTasks(sessions);
		expect(tasks[0].taskType).toBe("architecture");
	});

	it("classifies implementation tasks by default", () => {
		const sessions = [makeSession("create a new authentication service", 0)];
		const tasks = groupClaudeSessionsIntoTasks(sessions);
		expect(tasks[0].taskType).toBe("implementation");
	});

	it("sets interactionMode to exploration for learning tasks", () => {
		const sessions = [makeSession("explain how rust borrow checker works", 0)];
		const tasks = groupClaudeSessionsIntoTasks(sessions);
		expect(tasks[0].interactionMode).toBe("exploration");
	});

	it("sets interactionMode to acceleration for debugging tasks", () => {
		const sessions = [makeSession("fix the null error in user service", 0)];
		const tasks = groupClaudeSessionsIntoTasks(sessions);
		expect(tasks[0].interactionMode).toBe("acceleration");
	});

	it("detects deep learning when turnCount >= 5 on learning task", () => {
		const sessions = [
			makeSession("explain how event loops work in javascript", 0, "deep.jsonl", "p", true, 7),
			makeSession("follow up question 1", 5, "deep.jsonl", "p", false, 7),
			makeSession("follow up question 2", 10, "deep.jsonl", "p", false, 7),
		];
		const tasks = groupClaudeSessionsIntoTasks(sessions);
		const task = tasks[0];
		expect(task.turnCount).toBe(7);
		expect(task.isDeepLearning).toBe(true);
	});

	it("does not mark implementation as deep learning even with 5+ turns", () => {
		const sessions = [makeSession("implement a user service", 0, "impl.jsonl", "p", true, 10)];
		const tasks = groupClaudeSessionsIntoTasks(sessions);
		expect(tasks[0].isDeepLearning).toBe(false);
	});

	it("extracts topic cluster from prompt vocabulary", () => {
		const sessions = [makeSession("fix the typescript interface that causes type error", 0)];
		const tasks = groupClaudeSessionsIntoTasks(sessions);
		// Should match "typescript" in CLAUDE_TOPIC_VOCABULARY
		expect(tasks[0].topicCluster).toBe("typescript");
	});

	it("computes timeRange from prompt times", () => {
		const sessions = [
			makeSession("ask first question", 0, "f.jsonl", "p", true, 3),
			makeSession("ask second question", 10, "f.jsonl", "p", false, 3),
			makeSession("ask third question", 20, "f.jsonl", "p", false, 3),
		];
		const tasks = groupClaudeSessionsIntoTasks(sessions);
		expect(tasks[0].timeRange.start.getTime()).toBe(BASE_MS);
		expect(tasks[0].timeRange.end.getTime()).toBe(BASE_MS + 20 * MIN);
	});

	it("sorts tasks by start time (most recent first)", () => {
		const sessions = [
			makeSession("older conversation", 0, "old.jsonl", "p"),
			makeSession("newer conversation", 120, "new.jsonl", "p"),
		];
		const tasks = groupClaudeSessionsIntoTasks(sessions);
		expect(tasks[0].timeRange.start.getTime()).toBeGreaterThan(
			tasks[1].timeRange.start.getTime()
		);
	});

	it("handles sessions with unknown conversation file gracefully", () => {
		const session: ClaudeSession = {
			prompt: "fix the bug",
			time: new Date(BASE_MS),
			project: "proj",
			isConversationOpener: true,
			conversationFile: "",
			conversationTurnCount: 1,
		};
		const tasks = groupClaudeSessionsIntoTasks([session]);
		expect(tasks).toHaveLength(1);
	});
});

// ── detectSearchMissions ─────────────────────────────────

describe("detectSearchMissions", () => {
	it("returns [] for empty searches", () => {
		expect(detectSearchMissions([], [])).toEqual([]);
	});

	it("treats a single search as a single mission", () => {
		const searches = [makeSearch("typescript generics tutorial", 0)];
		const missions = detectSearchMissions(searches, []);
		expect(missions).toHaveLength(1);
		expect(missions[0].label).toBe("typescript generics tutorial");
	});

	it("chains queries within 10 minutes with shared content word", () => {
		const searches = [
			makeSearch("typescript generics", 0),
			makeSearch("typescript generic extends", 5),  // shares "typescript" and "generic"
			makeSearch("typescript generic constraints", 9), // shares "typescript"
		];
		const missions = detectSearchMissions(searches, []);
		// All three should chain into one mission
		expect(missions).toHaveLength(1);
		expect(missions[0].queries).toHaveLength(3);
	});

	it("breaks chain when time gap exceeds 10 minutes", () => {
		const searches = [
			makeSearch("typescript generics", 0),
			makeSearch("typescript types", 15),  // 15 min gap — breaks chain
		];
		const missions = detectSearchMissions(searches, [], 10 * MIN);
		expect(missions).toHaveLength(2);
	});

	it("breaks chain when queries share no content words", () => {
		const searches = [
			makeSearch("typescript generics tutorial", 0),
			makeSearch("pizza recipe dinner", 3),  // no shared words, within 10 min
		];
		const missions = detectSearchMissions(searches, [], 10 * MIN);
		expect(missions).toHaveLength(2);
	});

	it("uses first query as mission label", () => {
		const searches = [
			makeSearch("how does jwt work", 0),
			makeSearch("how jwt authentication flow works", 5),
		];
		const missions = detectSearchMissions(searches, [], 10 * MIN);
		expect(missions[0].label).toBe("how does jwt work");
	});

	it("classifies informational queries correctly", () => {
		const searches = [makeSearch("how does typescript inference work", 0)];
		const missions = detectSearchMissions(searches, []);
		expect(missions[0].intentType).toBe("informational");
	});

	it("classifies navigational queries correctly", () => {
		const searches = [makeSearch("typescript docs github", 0)];
		const missions = detectSearchMissions(searches, []);
		expect(missions[0].intentType).toBe("navigational");
	});

	it("classifies transactional queries as default", () => {
		// "best typescript books" has no navigational or informational markers
		const searches = [makeSearch("best typescript books 2024", 0)];
		const missions = detectSearchMissions(searches, []);
		expect(missions[0].intentType).toBe("transactional");
	});

	it("respects custom window parameter", () => {
		const searches = [
			makeSearch("typescript generics", 0),
			makeSearch("typescript types", 3),  // 3 min gap
		];
		// With 2-minute window, the 3-minute gap breaks the chain
		const missions = detectSearchMissions(searches, [], 2 * MIN);
		expect(missions).toHaveLength(2);
	});

	it("sets timeRange from query times", () => {
		const searches = [makeSearch("react hooks", 0)];
		const missions = detectSearchMissions(searches, []);
		expect(missions[0].timeRange.start.getTime()).toBe(BASE_MS);
	});
});

// ── fuseCrossSourceSessions ──────────────────────────────

describe("fuseCrossSourceSessions", () => {
	it("returns [] (stub implementation)", () => {
		const result = fuseCrossSourceSessions([], [], [], []);
		expect(result).toEqual([]);
	});
});
