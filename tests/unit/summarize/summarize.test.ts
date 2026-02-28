import { describe, it, expect } from "vitest";
import { buildClassifiedPrompt, buildDeidentifiedPrompt, buildProsePrompt, resolvePromptAndTier } from "../../../src/summarize/summarize";
import { ClassificationResult, StructuredEvent, PatternAnalysis, CategorizedVisits, ActivityType, RAGConfig, ArticleCluster, CommitWorkUnit, ClaudeTaskSession, GitCommit } from "../../../src/types";
import type { AICallConfig } from "../../../src/summarize/ai-client";

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

// ── resolvePromptAndTier helpers ─────────────────────────

function emptyCategorized(): CategorizedVisits {
	return {};
}

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

function makeMockClassification(n: number): ClassificationResult {
	return {
		events: Array.from({ length: n }, (_, i) => ({
			timestamp: "",
			source: "browser" as const,
			activityType: "browsing" as ActivityType,
			topics: ["test"],
			entities: [],
			intent: "explore" as const,
			confidence: 0.9,
			summary: `event ${i}`,
		})),
		totalProcessed: n,
		llmClassified: 0,
		ruleClassified: n,
		processingTimeMs: 0,
	};
}

// ── resolvePromptAndTier ─────────────────────────────────

describe("resolvePromptAndTier", () => {
	it("returns tier 4 when patterns + anthropic provider", () => {
		const config: AICallConfig = {
			provider: "anthropic",
			anthropicApiKey: "key",
			anthropicModel: "claude-haiku-4-5-20251001",
		};
		const mockPatterns = makeMockPatterns();
		const { tier } = resolvePromptAndTier(
			new Date("2026-02-24"),
			emptyCategorized(),
			[], [], config, "test",
			undefined, undefined, mockPatterns, undefined, []
		);
		expect(tier).toBe(4);
	});

	it("returns tier 3 when classification + anthropic provider (no patterns)", () => {
		const config: AICallConfig = {
			provider: "anthropic",
			anthropicApiKey: "key",
			anthropicModel: "claude-haiku-4-5-20251001",
		};
		const mockClassification = makeMockClassification(5);
		const { tier } = resolvePromptAndTier(
			new Date("2026-02-24"),
			emptyCategorized(),
			[], [], config, "test",
			undefined, mockClassification, undefined, undefined, []
		);
		expect(tier).toBe(3);
	});

	it("returns tier 1 when local provider", () => {
		const config: AICallConfig = {
			provider: "local",
			localEndpoint: "http://localhost:11434",
			localModel: "llama3",
		};
		const { tier } = resolvePromptAndTier(
			new Date("2026-02-24"),
			emptyCategorized(),
			[], [], config, "test"
		);
		expect(tier).toBe(1);
	});

	it("returns tier 2 when ragConfig.enabled is true", () => {
		const config: AICallConfig = {
			provider: "anthropic",
			anthropicApiKey: "key",
			anthropicModel: "claude-haiku-4-5-20251001",
		};
		const ragConfig: RAGConfig = {
			enabled: true,
			embeddingEndpoint: "http://localhost:11434",
			embeddingModel: "nomic-embed-text",
			topK: 5,
			minChunkTokens: 50,
			maxChunkTokens: 500,
		};
		const { tier } = resolvePromptAndTier(
			new Date("2026-02-24"),
			emptyCategorized(),
			[], [], config, "test",
			ragConfig
		);
		expect(tier).toBe(2);
	});

	it("returns the prompt string (non-empty)", () => {
		const config: AICallConfig = {
			provider: "anthropic",
			anthropicApiKey: "key",
			anthropicModel: "claude-haiku-4-5-20251001",
		};
		const { prompt } = resolvePromptAndTier(
			new Date("2026-02-24"),
			emptyCategorized(),
			[], [], config, "test"
		);
		expect(typeof prompt).toBe("string");
		expect(prompt.length).toBeGreaterThan(10);
	});

	it("local provider always returns tier 1 even with ragConfig enabled", () => {
		const config: AICallConfig = {
			provider: "local",
			localEndpoint: "http://localhost:11434",
			localModel: "llama3.2",
		};
		const ragConfig: RAGConfig = {
			enabled: true,
			embeddingEndpoint: "http://localhost:11434",
			embeddingModel: "nomic-embed-text",
			topK: 8,
			minChunkTokens: 50,
			maxChunkTokens: 500,
		};
		const { tier } = resolvePromptAndTier(
			new Date("2026-02-24"),
			emptyCategorized(),
			[], [], config, "test",
			ragConfig
		);
		expect(tier).toBe(1);
	});

	it("local provider returns higher maxTokens when patterns present", () => {
		const config: AICallConfig = {
			provider: "local",
			localEndpoint: "http://localhost:11434",
			localModel: "llama3.2",
		};
		const mockPatterns = makeMockPatterns();

		const withPatterns = resolvePromptAndTier(
			new Date("2026-02-24"),
			emptyCategorized(),
			[], [], config, "test",
			undefined, undefined, mockPatterns, undefined, []
		);

		const withoutPatterns = resolvePromptAndTier(
			new Date("2026-02-24"),
			emptyCategorized(),
			[], [], config, "test"
		);

		expect(withPatterns.maxTokens).toBeGreaterThan(withoutPatterns.maxTokens);
	});

	// ── forceTier override tests ─────────────────────────

	it("forceTier=1 routes to tier 1 even when patterns are present (anthropic)", () => {
		const config: AICallConfig = {
			provider: "anthropic",
			anthropicApiKey: "key",
			anthropicModel: "claude-haiku-4-5-20251001",
		};
		const mockPatterns = makeMockPatterns();
		const { tier } = resolvePromptAndTier(
			new Date("2026-02-24"),
			emptyCategorized(),
			[], [], config, "test",
			undefined, undefined, mockPatterns, undefined, [], undefined, 1
		);
		expect(tier).toBe(1);
	});

	it("forceTier=4 routes to tier 4 when patterns present (anthropic)", () => {
		const config: AICallConfig = {
			provider: "anthropic",
			anthropicApiKey: "key",
			anthropicModel: "claude-haiku-4-5-20251001",
		};
		const mockPatterns = makeMockPatterns();
		const { tier } = resolvePromptAndTier(
			new Date("2026-02-24"),
			emptyCategorized(),
			[], [], config, "test",
			undefined, undefined, mockPatterns, undefined, [], undefined, 4
		);
		expect(tier).toBe(4);
	});

	it("forceTier=3 routes to tier 3 when classification present, no patterns (anthropic)", () => {
		const config: AICallConfig = {
			provider: "anthropic",
			anthropicApiKey: "key",
			anthropicModel: "claude-haiku-4-5-20251001",
		};
		const mockClassification = makeMockClassification(5);
		const { tier } = resolvePromptAndTier(
			new Date("2026-02-24"),
			emptyCategorized(),
			[], [], config, "test",
			undefined, mockClassification, undefined, undefined, [], undefined, 3
		);
		expect(tier).toBe(3);
	});

	it("forceTier=3 falls back to tier 1 when no classification available (anthropic)", () => {
		const config: AICallConfig = {
			provider: "anthropic",
			anthropicApiKey: "key",
			anthropicModel: "claude-haiku-4-5-20251001",
		};
		const { tier } = resolvePromptAndTier(
			new Date("2026-02-24"),
			emptyCategorized(),
			[], [], config, "test",
			undefined, undefined, undefined, undefined, [], undefined, 3
		);
		expect(tier).toBe(1);
	});

	it("forceTier=4 falls back to tier 3 when patterns unavailable but classification present (anthropic)", () => {
		const config: AICallConfig = {
			provider: "anthropic",
			anthropicApiKey: "key",
			anthropicModel: "claude-haiku-4-5-20251001",
		};
		const mockClassification = makeMockClassification(5);
		// forceTier=4 requested but no patterns → gracefully degrades to tier 3
		const { tier } = resolvePromptAndTier(
			new Date("2026-02-24"),
			emptyCategorized(),
			[], [], config, "test",
			undefined, mockClassification, undefined, undefined, [], undefined, 4
		);
		expect(tier).toBe(3);
	});

	it("forceTier=4 falls back to tier 1 when neither patterns nor classification available (anthropic)", () => {
		const config: AICallConfig = {
			provider: "anthropic",
			anthropicApiKey: "key",
			anthropicModel: "claude-haiku-4-5-20251001",
		};
		const { tier } = resolvePromptAndTier(
			new Date("2026-02-24"),
			emptyCategorized(),
			[], [], config, "test",
			undefined, undefined, undefined, undefined, [], undefined, 4
		);
		expect(tier).toBe(1);
	});

	it("forceTier=1 with patterns does NOT use deidentified prompt (tier 1 standard prompt)", () => {
		const config: AICallConfig = {
			provider: "anthropic",
			anthropicApiKey: "key",
			anthropicModel: "claude-haiku-4-5-20251001",
		};
		const mockPatterns = makeMockPatterns();
		const { tier, prompt } = resolvePromptAndTier(
			new Date("2026-02-24"),
			emptyCategorized(),
			[], [], config, "test",
			undefined, undefined, mockPatterns, undefined, [], undefined, 1
		);
		expect(tier).toBe(1);
		// Standard prompt should NOT contain de-identified stats markers
		expect(prompt).not.toContain("focus_narrative");
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
