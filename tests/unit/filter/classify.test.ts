import { describe, it, expect } from "vitest";
import { classifyEventsRuleOnly } from "../../../src/filter/classify";
import { BrowserVisit, SearchQuery, ClaudeSession, CategorizedVisits } from "../../../src/types";

const NOW = new Date("2025-06-15T10:00:00");

describe("classifyEventsRuleOnly", () => {
	it("classifies browser visits by category mapping", () => {
		const visits: BrowserVisit[] = [
			{ url: "https://github.com/repo", title: "GitHub Repo", time: NOW, domain: "github.com" },
		];
		const categorized: CategorizedVisits = {
			dev: [{ ...visits[0], domain: "github.com" }],
		};

		const result = classifyEventsRuleOnly(visits, [], [], [], categorized);
		expect(result.events).toHaveLength(1);
		expect(result.events[0].activityType).toBe("implementation");
		expect(result.events[0].source).toBe("browser");
		expect(result.events[0].confidence).toBe(0.3);
	});

	it("classifies searches as research", () => {
		const searches: SearchQuery[] = [
			{ query: "react hooks best practices", time: NOW, engine: "google.com" },
		];

		const result = classifyEventsRuleOnly([], searches, [], [], {});
		expect(result.events).toHaveLength(1);
		expect(result.events[0].activityType).toBe("research");
		expect(result.events[0].source).toBe("search");
	});

	it("classifies Claude sessions using vocabulary-based task type", () => {
		const claudeDebug: ClaudeSession[] = [
			{ prompt: "Fix the auth middleware bug", time: NOW, project: "webapp", isConversationOpener: true, conversationFile: "session.jsonl", conversationTurnCount: 1 },
		];
		const claudeImpl: ClaudeSession[] = [
			{ prompt: "Implement the OAuth PKCE flow for our React app", time: NOW, project: "webapp", isConversationOpener: true, conversationFile: "session2.jsonl", conversationTurnCount: 1 },
		];

		const resultDebug = classifyEventsRuleOnly([], [], claudeDebug, [], {});
		expect(resultDebug.events).toHaveLength(1);
		expect(resultDebug.events[0].activityType).toBe("debugging");
		expect(resultDebug.events[0].source).toBe("claude");

		const resultImpl = classifyEventsRuleOnly([], [], claudeImpl, [], {});
		expect(resultImpl.events).toHaveLength(1);
		expect(resultImpl.events[0].activityType).toBe("implementation");
		expect(resultImpl.events[0].source).toBe("claude");
	});

	it("handles empty input", () => {
		const result = classifyEventsRuleOnly([], [], [], [], {});
		expect(result.events).toHaveLength(0);
		expect(result.totalProcessed).toBe(0);
		expect(result.llmClassified).toBe(0);
		expect(result.ruleClassified).toBe(0);
	});

	it("tracks processing stats", () => {
		const visits: BrowserVisit[] = [
			{ url: "https://github.com/a", title: "A", time: NOW, domain: "github.com" },
			{ url: "https://github.com/b", title: "B", time: NOW, domain: "github.com" },
		];
		const searches: SearchQuery[] = [
			{ query: "test", time: NOW, engine: "google.com" },
		];

		const result = classifyEventsRuleOnly(visits, searches, [], [], {
			dev: visits.map((v) => ({ ...v, domain: "github.com" })),
		});
		expect(result.totalProcessed).toBe(3);
		expect(result.ruleClassified).toBe(3);
		expect(result.llmClassified).toBe(0);
		expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
	});

	it("infers intent from search queries", () => {
		const searches: SearchQuery[] = [
			{ query: "react vs vue comparison", time: NOW, engine: "google.com" },
			{ query: "how to implement oauth", time: NOW, engine: "google.com" },
			{ query: "error module not found fix", time: NOW, engine: "google.com" },
			{ query: "what is raft consensus", time: NOW, engine: "google.com" },
		];

		const result = classifyEventsRuleOnly([], searches, [], [], {});
		expect(result.events[0].intent).toBe("compare");
		expect(result.events[1].intent).toBe("implement");
		expect(result.events[2].intent).toBe("troubleshoot");
		expect(result.events[3].intent).toBe("read");
	});

	it("extracts entities from domain names", () => {
		const visits: BrowserVisit[] = [
			{ url: "https://github.com/repo", title: "GitHub Repo", time: NOW, domain: "github.com" },
		];

		const result = classifyEventsRuleOnly(visits, [], [], [], {
			dev: [{ ...visits[0], domain: "github.com" }],
		});
		// Should extract "Github" as entity from domain
		const entities = result.events[0].entities;
		expect(entities.length).toBeGreaterThan(0);
	});

	it("extracts entities from capitalized words in titles", () => {
		const visits: BrowserVisit[] = [
			{ url: "https://example.com", title: "Install TypeScript and React", time: NOW, domain: "example.com" },
		];

		const result = classifyEventsRuleOnly(visits, [], [], [], {
			dev: [{ ...visits[0], domain: "example.com" }],
		});
		const entities = result.events[0].entities;
		expect(entities.some((e) => e.includes("TypeScript") || e.includes("React"))).toBe(true);
	});

	it("normalizes timestamps to ISO strings", () => {
		const visits: BrowserVisit[] = [
			{ url: "https://github.com/a", title: "A", time: NOW, domain: "github.com" },
		];

		const result = classifyEventsRuleOnly(visits, [], [], [], {});
		expect(result.events[0].timestamp).toBe(NOW.toISOString());
	});

	it("handles visits with null time", () => {
		const visits: BrowserVisit[] = [
			{ url: "https://github.com/a", title: "A", time: null, domain: "github.com" },
		];

		const result = classifyEventsRuleOnly(visits, [], [], [], {});
		expect(result.events).toHaveLength(1);
		expect(result.events[0].timestamp).toBe("");
	});
});
