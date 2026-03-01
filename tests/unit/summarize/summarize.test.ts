import { describe, it, expect, vi } from "vitest";
import { buildClassifiedPrompt, buildDeidentifiedPrompt, buildProsePrompt, resolvePrivacyTier, summarizeDay } from "../../../src/summarize/summarize";
import { ClassificationResult, StructuredEvent, PatternAnalysis, ArticleCluster, CommitWorkUnit, ClaudeTaskSession, GitCommit } from "../../../src/types";
import type { AICallConfig } from "../../../src/summarize/ai-client";

vi.mock("../../../src/summarize/ai-client", async (importOriginal) => {
	const actual = await importOriginal<typeof import("../../../src/summarize/ai-client")>();
	return { ...actual, callAI: vi.fn() };
});

const DATE = new Date("2025-06-15T00:00:00");

function makeEvent(overrides: Partial<StructuredEvent> = {}): StructuredEvent {
	return {
		timestamp: "2025-06-15T10:00:00.000Z",
		source: "browser",
		activityType: "research",
		topics: ["OAuth"],
		entities: ["GitHub"],
		intent: "evaluate",
		confidence: 0.8,
		summary: "Researching OAuth flows",
		...overrides,
	};
}

// ── summarizeDay empty-activity guard ────────────────────

describe("summarizeDay empty-activity guard", () => {
	it("returns empty summary without calling AI when no activity data", async () => {
		const { callAI } = await import("../../../src/summarize/ai-client");
		vi.mocked(callAI).mockClear();

		const config: AICallConfig = {
			provider: "local",
			localEndpoint: "http://localhost:11434",
			localModel: "llama3",
		};
		const result = await summarizeDay(
			DATE, {}, [], [], config, ""
		);
		expect(result.headline).toBe("");
		expect(result.tldr).toBe("");
		expect(result.themes).toEqual([]);
		expect(result.notable).toEqual([]);
		expect(result.category_summaries).toEqual({});
		expect(result.questions).toEqual([]);
		expect(callAI).not.toHaveBeenCalled();
	});
});

// ── buildClassifiedPrompt (Phase 2) ─────────────────────

describe("buildClassifiedPrompt", () => {
	const classification: ClassificationResult = {
		events: [
			makeEvent({ activityType: "research", topics: ["OAuth", "PKCE"], entities: ["GitHub", "Auth0"], summary: "Researching OAuth PKCE flows" }),
			makeEvent({ activityType: "implementation", topics: ["React", "hooks"], entities: ["React"], summary: "Implementing React auth component" }),
			makeEvent({ activityType: "debugging", topics: ["testing"], entities: ["Vitest"], summary: "Debugging test failures" }),
		],
		totalProcessed: 3,
		llmClassified: 2,
		ruleClassified: 1,
		processingTimeMs: 150,
	};

	it("groups events by activity type", () => {
		const prompt = buildClassifiedPrompt(DATE, classification, "");
		expect(prompt).toContain("### research (1 events)");
		expect(prompt).toContain("### implementation (1 events)");
		expect(prompt).toContain("### debugging (1 events)");
	});

	it("includes topics and entities per type", () => {
		const prompt = buildClassifiedPrompt(DATE, classification, "");
		expect(prompt).toContain("OAuth");
		expect(prompt).toContain("PKCE");
		expect(prompt).toContain("GitHub");
	});

	it("includes event summaries (not raw data)", () => {
		const prompt = buildClassifiedPrompt(DATE, classification, "");
		expect(prompt).toContain("Researching OAuth PKCE flows");
		expect(prompt).toContain("Implementing React auth component");
	});

	it("includes classification stats", () => {
		const prompt = buildClassifiedPrompt(DATE, classification, "");
		expect(prompt).toContain("Total events: 3");
		expect(prompt).toContain("2 LLM-classified");
		expect(prompt).toContain("1 rule-classified");
	});

	it("includes date in prompt", () => {
		const prompt = buildClassifiedPrompt(DATE, classification, "");
		expect(prompt).toContain("June 15, 2025");
	});

	it("includes profile when provided", () => {
		const prompt = buildClassifiedPrompt(DATE, classification, "Full-stack developer");
		expect(prompt).toContain("Full-stack developer");
	});

	it("requests JSON output format", () => {
		const prompt = buildClassifiedPrompt(DATE, classification, "");
		expect(prompt).toContain("JSON object");
		expect(prompt).toContain("headline");
		expect(prompt).toContain("tldr");
		expect(prompt).toContain("themes");
	});

	it("does NOT contain raw URLs or commands", () => {
		const prompt = buildClassifiedPrompt(DATE, classification, "");
		expect(prompt).not.toContain("https://");
		expect(prompt).not.toContain("git ");
		expect(prompt).not.toContain("npm ");
	});
});

// ── buildDeidentifiedPrompt (Phase 4) ───────────────────

describe("buildDeidentifiedPrompt", () => {
	const patterns: PatternAnalysis = {
		temporalClusters: [{
			hourStart: 10,
			hourEnd: 12,
			activityType: "research",
			eventCount: 8,
			topics: ["OAuth", "PKCE"],
			entities: ["GitHub", "Auth0"],
			intensity: 2.67,
			label: "research 10am-1pm: OAuth, PKCE",
		}],
		topicCooccurrences: [{
			topicA: "OAuth",
			topicB: "PKCE",
			strength: 0.8,
			sharedEvents: 5,
			window: "10am",
		}],
		entityRelations: [{
			entityA: "GitHub",
			entityB: "Auth0",
			cooccurrences: 3,
			contexts: ["research", "implementation"],
		}],
		recurrenceSignals: [
			{ topic: "OAuth", frequency: 5, trend: "stable", dayCount: 5 },
			{ topic: "Rust", frequency: 1, trend: "new", dayCount: 1 },
		],
		knowledgeDelta: {
			newTopics: ["Rust"],
			recurringTopics: ["OAuth"],
			novelEntities: ["Auth0"],
			connections: ["OAuth ↔ PKCE"],
		},
		focusScore: 0.7,
		activityConcentrationScore: 0.5,
		topActivityTypes: [
			{ type: "research", count: 10, pct: 50 },
			{ type: "implementation", count: 6, pct: 30 },
			{ type: "debugging", count: 4, pct: 20 },
		],
		peakHours: [
			{ hour: 10, count: 8 },
			{ hour: 14, count: 6 },
		],
		commitWorkUnits: [],
		claudeTaskSessions: [],
	};

	it("includes aggregated activity distribution", () => {
		const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
		expect(prompt).toContain("research: 10 events (50%)");
		expect(prompt).toContain("implementation: 6 events (30%)");
	});

	it("includes temporal cluster labels (not event lists)", () => {
		const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
		expect(prompt).toContain("research 10am-1pm");
		expect(prompt).toContain("8 events");
	});

	it("includes topic distribution (aggregated counts)", () => {
		const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
		expect(prompt).toContain("OAuth");
		expect(prompt).toContain("events");
	});

	it("includes entity clusters", () => {
		const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
		expect(prompt).toContain("GitHub");
		expect(prompt).toContain("Auth0");
	});

	it("includes recurrence signals", () => {
		const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
		expect(prompt).toContain("Ongoing: OAuth");
		expect(prompt).toContain("New explorations: Rust");
	});

	it("includes focus score", () => {
		const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
		expect(prompt).toContain("70%");
	});

	it("includes peak hours", () => {
		const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
		expect(prompt).toContain("10am");
	});

	it("requests meta_insights and quirky_signals", () => {
		const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
		expect(prompt).toContain("meta_insights");
		expect(prompt).toContain("quirky_signals");
		expect(prompt).toContain("focus_narrative");
	});

	// ── CRITICAL PRIVACY ASSERTIONS ──

	it("does NOT contain individual event summaries", () => {
		const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
		// No per-event summaries should appear
		expect(prompt).not.toContain("Researching OAuth");
		expect(prompt).not.toContain("Implementing React");
	});

	it("does NOT contain raw URLs", () => {
		const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
		expect(prompt).not.toContain("https://");
		expect(prompt).not.toContain("http://");
	});

	it("does NOT contain raw shell commands", () => {
		const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
		expect(prompt).not.toContain("git ");
		expect(prompt).not.toContain("npm ");
		expect(prompt).not.toContain("kubectl ");
	});

	it("does NOT contain raw search queries", () => {
		const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
		expect(prompt).not.toContain("how to");
		expect(prompt).not.toContain("tutorial");
	});

	it("does NOT contain individual timestamps", () => {
		const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
		// Should not contain ISO timestamps
		expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
	});

	it("describes synthesizing cognitive patterns for knowledge base", () => {
		const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
		expect(prompt).toContain("cognitive patterns");
		expect(prompt).toContain("knowledge base");
	});

	it("asks about cross-pollination and unformalized knowledge", () => {
		const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
		expect(prompt.toLowerCase()).toContain("cross-pollination");
		expect(prompt.toLowerCase()).toContain("unformalized");
	});
});

// ── resolvePrivacyTier helpers ───────────────────────────

function makeMockPatterns(): PatternAnalysis {
	return {
		temporalClusters: [{
			hourStart: 9,
			hourEnd: 10,
			activityType: "research",
			eventCount: 3,
			topics: ["testing"],
			entities: [],
			intensity: 3.0,
			label: "morning",
		}],
		topicCooccurrences: [],
		entityRelations: [],
		recurrenceSignals: [],
		knowledgeDelta: {
			newTopics: [],
			recurringTopics: [],
			novelEntities: [],
			connections: [],
		},
		focusScore: 0.5,
		activityConcentrationScore: 0,
		topActivityTypes: [],
		peakHours: [],
		commitWorkUnits: [],
		claudeTaskSessions: [],
	};
}

// ── resolvePrivacyTier ──────────────────────────────────

describe("resolvePrivacyTier", () => {
	it("defaults to tier 4 for anthropic with no explicit tier", () => {
		const config: AICallConfig = {
			provider: "anthropic",
			anthropicApiKey: "key",
			anthropicModel: "claude-haiku-4-5-20251001",
		};
		expect(resolvePrivacyTier(config)).toBe(4);
	});

	it("returns tier 1 for local provider", () => {
		const config: AICallConfig = {
			provider: "local",
			localEndpoint: "http://localhost:11434",
			localModel: "llama3",
		};
		expect(resolvePrivacyTier(config)).toBe(1);
	});

	it("explicit privacyTier overrides default for anthropic", () => {
		const config: AICallConfig = {
			provider: "anthropic",
			anthropicApiKey: "key",
			anthropicModel: "claude-haiku-4-5-20251001",
		};
		expect(resolvePrivacyTier(config, 1)).toBe(1);
		expect(resolvePrivacyTier(config, 2)).toBe(2);
		expect(resolvePrivacyTier(config, 3)).toBe(3);
	});

	it("defaults to tier 4 for anthropic with null privacyTier", () => {
		const config: AICallConfig = {
			provider: "anthropic",
			anthropicApiKey: "key",
			anthropicModel: "claude-haiku-4-5-20251001",
		};
		expect(resolvePrivacyTier(config, null)).toBe(4);
		expect(resolvePrivacyTier(config)).toBe(4);
	});
});

// ── buildProsePrompt Layer 0 (Semantic Context) ─────────

describe("buildProsePrompt Layer 0", () => {
	function makeWorkUnit(overrides: Partial<CommitWorkUnit> = {}): CommitWorkUnit {
		const now = new Date("2025-06-15T10:00:00");
		return {
			label: "hybrid prose prompts",
			workMode: "building",
			commits: [{
				hash: "abc123",
				message: "feat: add hybrid prose prompt strategy",
				time: now,
				repo: "obsidian-claude-daily",
				filesChanged: 3,
				insertions: 120,
				deletions: 10,
			} as GitCommit],
			repos: ["obsidian-claude-daily"],
			timeRange: { start: now, end: now },
			hasWhyInformation: false,
			whyClause: null,
			isGeneric: false,
			...overrides,
		};
	}

	function makeClaudeTaskSession(overrides: Partial<ClaudeTaskSession> = {}): ClaudeTaskSession {
		const now = new Date("2025-06-15T10:00:00");
		return {
			taskTitle: "Implement semantic extraction layer",
			taskType: "implementation",
			topicCluster: "typescript",
			prompts: [],
			timeRange: { start: now, end: now },
			project: "obsidian-claude-daily",
			conversationFile: "abc.jsonl",
			turnCount: 12,
			interactionMode: "acceleration",
			isDeepLearning: false,
			...overrides,
		};
	}

	function makeArticleCluster(overrides: Partial<ArticleCluster> = {}): ArticleCluster {
		const now = new Date("2025-06-15T10:00:00");
		return {
			label: "typescript generics patterns",
			articles: ["Understanding TypeScript Generics", "Advanced TS Patterns"],
			visits: [],
			timeRange: { start: now, end: now },
			engagementScore: 0.7,
			intentSignal: "research",
			...overrides,
		};
	}

	function makePatternsWithSemantics(
		commitWorkUnits: CommitWorkUnit[] = [],
		claudeTaskSessions: ClaudeTaskSession[] = []
	): PatternAnalysis {
		return {
			...makeMockPatterns(),
			commitWorkUnits,
			claudeTaskSessions,
		};
	}

	it("renders work sessions from patterns.commitWorkUnits", () => {
		const patterns = makePatternsWithSemantics([makeWorkUnit()]);
		const prompt = buildProsePrompt(DATE, "", { patterns });
		expect(prompt).toContain("Work sessions (from git):");
		expect(prompt).toContain("hybrid prose prompts");
		expect(prompt).toContain("[building]");
	});

	it("filters out generic work units", () => {
		const patterns = makePatternsWithSemantics([
			makeWorkUnit({ label: "real work", isGeneric: false }),
			makeWorkUnit({ label: "wip stuff", isGeneric: true }),
		]);
		const prompt = buildProsePrompt(DATE, "", { patterns });
		expect(prompt).toContain("real work");
		expect(prompt).not.toContain("wip stuff");
	});

	it("renders Claude task sessions from patterns.claudeTaskSessions", () => {
		const patterns = makePatternsWithSemantics([], [makeClaudeTaskSession()]);
		const prompt = buildProsePrompt(DATE, "", { patterns });
		expect(prompt).toContain("AI task sessions:");
		expect(prompt).toContain("Implement semantic extraction layer");
		expect(prompt).toContain("12 turns");
		expect(prompt).toContain("implementation");
	});

	it("uses correct depth labels for Claude sessions", () => {
		const deep = makeClaudeTaskSession({
			taskTitle: "Deep learning session",
			isDeepLearning: true,
			interactionMode: "exploration",
		});
		const explore = makeClaudeTaskSession({
			taskTitle: "Exploring session",
			isDeepLearning: false,
			interactionMode: "exploration",
		});
		const impl = makeClaudeTaskSession({
			taskTitle: "Building session",
			isDeepLearning: false,
			interactionMode: "acceleration",
		});

		const pDeep = makePatternsWithSemantics([], [deep]);
		expect(buildProsePrompt(DATE, "", { patterns: pDeep })).toContain("deep exploration");

		const pExplore = makePatternsWithSemantics([], [explore]);
		expect(buildProsePrompt(DATE, "", { patterns: pExplore })).toContain("exploration");

		const pImpl = makePatternsWithSemantics([], [impl]);
		expect(buildProsePrompt(DATE, "", { patterns: pImpl })).toContain("implementation");
	});

	it("renders article clusters when passed", () => {
		const patterns = makePatternsWithSemantics();
		const clusters = [makeArticleCluster()];
		const prompt = buildProsePrompt(DATE, "", { patterns, articleClusters: clusters });
		expect(prompt).toContain("Reading clusters (from browser):");
		expect(prompt).toContain("typescript generics patterns");
		expect(prompt).toContain("2 articles");
		expect(prompt).toContain("intent: research");
	});

	it("omits Layer 0 when no semantic data exists", () => {
		const patterns = makePatternsWithSemantics([], []);
		const prompt = buildProsePrompt(DATE, "", { patterns });
		expect(prompt).not.toContain("Work sessions (from git):");
		expect(prompt).not.toContain("AI task sessions:");
		expect(prompt).not.toContain("Reading clusters (from browser):");
	});

	it("respects caps: 5 work units, 5 Claude sessions, 4 article clusters", () => {
		const units = Array.from({ length: 10 }, (_, i) =>
			makeWorkUnit({ label: `unit-${i}` })
		);
		const sessions = Array.from({ length: 10 }, (_, i) =>
			makeClaudeTaskSession({ taskTitle: `session-${i}` })
		);
		const clusters = Array.from({ length: 8 }, (_, i) =>
			makeArticleCluster({ label: `cluster-${i}` })
		);
		const patterns = makePatternsWithSemantics(units, sessions);
		const prompt = buildProsePrompt(DATE, "", { patterns, articleClusters: clusters });

		// Only first 5 work units
		expect(prompt).toContain("unit-4");
		expect(prompt).not.toContain("unit-5");

		// Only first 5 Claude sessions
		expect(prompt).toContain("session-4");
		expect(prompt).not.toContain("session-5");

		// Only first 4 article clusters
		expect(prompt).toContain("cluster-3");
		expect(prompt).not.toContain("cluster-4");
	});

	it("Layer 0 appears before Layer 1 (Focus:)", () => {
		const patterns = makePatternsWithSemantics([makeWorkUnit()]);
		const prompt = buildProsePrompt(DATE, "", { patterns });
		const layer0Pos = prompt.indexOf("Work sessions (from git):");
		const layer1Pos = prompt.indexOf("Focus:");
		expect(layer0Pos).toBeGreaterThan(-1);
		expect(layer1Pos).toBeGreaterThan(-1);
		expect(layer0Pos).toBeLessThan(layer1Pos);
	});
});

// ── Prose template includes voice & vernacular instructions ──

describe("prose template voice signals", () => {
	it("includes Voice & Vernacular section in the prose prompt", () => {
		const prompt = buildProsePrompt(DATE, "", {});
		expect(prompt).toContain("## Voice & Vernacular");
		expect(prompt).toContain("verbal tics");
		expect(prompt).toContain("Misspellings");
	});

	it("includes Cognitive Patterns section in the prose prompt", () => {
		const prompt = buildProsePrompt(DATE, "", {});
		expect(prompt).toContain("## Cognitive Patterns");
		expect(prompt).toContain("Research spirals");
	});

	it("includes Focus Narrative section in the prose prompt", () => {
		const prompt = buildProsePrompt(DATE, "", {});
		expect(prompt).toContain("## Focus Narrative");
		expect(prompt).toContain("cognitive character");
	});

	it("includes tier instruction at Tier 4", () => {
		const prompt = buildProsePrompt(DATE, "", {}, undefined, "balanced", 4);
		expect(prompt).toContain("statistical patterns only");
		expect(prompt).toContain("Do not invent");
	});

	it("includes tier instruction at Tier 3", () => {
		const prompt = buildProsePrompt(DATE, "", {}, undefined, "balanced", 3);
		expect(prompt).toContain("classified activity abstractions");
		expect(prompt).toContain("Do not invent specific URLs");
	});

	it("omits tier instruction at Tier 1", () => {
		const prompt = buildProsePrompt(DATE, "", {}, undefined, "balanced", 1);
		expect(prompt).not.toContain("Do not invent");
	});
});
