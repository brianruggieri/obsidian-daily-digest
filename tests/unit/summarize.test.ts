import { describe, it, expect } from "vitest";
import { buildClassifiedPrompt, buildDeidentifiedPrompt } from "../../src/summarize/summarize";
import { ClassificationResult, StructuredEvent, PatternAnalysis } from "../../src/types";

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
		topActivityTypes: [
			{ type: "research", count: 10, pct: 50 },
			{ type: "implementation", count: 6, pct: 30 },
			{ type: "debugging", count: 4, pct: 20 },
		],
		peakHours: [
			{ hour: 10, count: 8 },
			{ hour: 14, count: 6 },
		],
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
