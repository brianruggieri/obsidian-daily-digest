import { describe, it, expect } from "vitest";
import { generateKnowledgeSections } from "../../../src/analyze/knowledge";
import { PatternAnalysis } from "../../../src/types";

function makePatterns(overrides: Partial<PatternAnalysis> = {}): PatternAnalysis {
	return {
		temporalClusters: [],
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
		topActivityTypes: [
			{ type: "research", count: 10, pct: 50 },
			{ type: "implementation", count: 6, pct: 30 },
			{ type: "debugging", count: 4, pct: 20 },
		],
		peakHours: [
			{ hour: 10, count: 8 },
			{ hour: 14, count: 6 },
		],
		...overrides,
	};
}

describe("generateKnowledgeSections", () => {
	it("generates all section types", () => {
		const sections = generateKnowledgeSections(makePatterns());
		expect(sections).toHaveProperty("focusSummary");
		expect(sections).toHaveProperty("temporalInsights");
		expect(sections).toHaveProperty("topicMap");
		expect(sections).toHaveProperty("entityGraph");
		expect(sections).toHaveProperty("recurrenceNotes");
		expect(sections).toHaveProperty("knowledgeDeltaLines");
		expect(sections).toHaveProperty("tags");
	});
});

// ── Focus Summary ───────────────────────────────────────

describe("focus summary", () => {
	it("labels highly focused day (≥0.7)", () => {
		const sections = generateKnowledgeSections(makePatterns({ focusScore: 0.8 }));
		expect(sections.focusSummary).toContain("Highly focused");
		expect(sections.focusSummary).toContain("80%");
	});

	it("labels moderately focused day (0.5-0.7)", () => {
		const sections = generateKnowledgeSections(makePatterns({ focusScore: 0.6 }));
		expect(sections.focusSummary).toContain("Moderately focused");
	});

	it("labels varied day (0.3-0.5)", () => {
		const sections = generateKnowledgeSections(makePatterns({ focusScore: 0.4 }));
		expect(sections.focusSummary).toContain("Varied");
	});

	it("labels scattered day (<0.3)", () => {
		const sections = generateKnowledgeSections(makePatterns({ focusScore: 0.2 }));
		expect(sections.focusSummary).toContain("Widely scattered");
	});

	it("includes activity type breakdown", () => {
		const sections = generateKnowledgeSections(makePatterns());
		expect(sections.focusSummary).toContain("research");
		expect(sections.focusSummary).toContain("50%");
	});

	it("includes peak hours", () => {
		const sections = generateKnowledgeSections(makePatterns());
		expect(sections.focusSummary).toContain("10am");
	});
});

// ── Temporal Insights ───────────────────────────────────

describe("temporal insights", () => {
	it("generates cluster descriptions", () => {
		const sections = generateKnowledgeSections(makePatterns({
			temporalClusters: [{
				hourStart: 10,
				hourEnd: 12,
				activityType: "research",
				eventCount: 8,
				topics: ["OAuth", "PKCE"],
				entities: ["GitHub"],
				intensity: 2.67,
				label: "research 10am-1pm: OAuth, PKCE",
			}],
		}));
		expect(sections.temporalInsights.length).toBeGreaterThan(0);
		expect(sections.temporalInsights[0]).toContain("research");
	});

	it("returns default message when no clusters", () => {
		const sections = generateKnowledgeSections(makePatterns({
			temporalClusters: [],
			peakHours: [],
		}));
		expect(sections.temporalInsights[0]).toContain("No significant");
	});
});

// ── Topic Map ───────────────────────────────────────────

describe("topic map", () => {
	it("shows strong co-occurrence pairs", () => {
		const sections = generateKnowledgeSections(makePatterns({
			topicCooccurrences: [{
				topicA: "React",
				topicB: "Testing",
				strength: 0.8,
				sharedEvents: 5,
				window: "10am",
			}],
		}));
		expect(sections.topicMap.length).toBeGreaterThan(0);
		expect(sections.topicMap[0]).toContain("React");
		expect(sections.topicMap[0]).toContain("Testing");
	});

	it("falls back to topic frequency when no co-occurrences", () => {
		const sections = generateKnowledgeSections(makePatterns({
			topicCooccurrences: [],
			temporalClusters: [{
				hourStart: 10,
				hourEnd: 11,
				activityType: "research",
				eventCount: 5,
				topics: ["OAuth", "PKCE"],
				entities: [],
				intensity: 2.5,
				label: "research 10am-12pm",
			}],
		}));
		// Should show topic frequency instead
		expect(sections.topicMap.length).toBeGreaterThan(0);
	});
});

// ── Entity Graph ────────────────────────────────────────

describe("entity graph", () => {
	it("shows entity relations", () => {
		const sections = generateKnowledgeSections(makePatterns({
			entityRelations: [{
				entityA: "GitHub",
				entityB: "React",
				cooccurrences: 3,
				contexts: ["implementation", "debugging"],
			}],
		}));
		expect(sections.entityGraph.length).toBe(1);
		expect(sections.entityGraph[0]).toContain("GitHub");
		expect(sections.entityGraph[0]).toContain("React");
		expect(sections.entityGraph[0]).toContain("3x");
	});

	it("returns empty for no relations", () => {
		const sections = generateKnowledgeSections(makePatterns({
			entityRelations: [],
		}));
		expect(sections.entityGraph).toHaveLength(0);
	});
});

// ── Recurrence Notes ────────────────────────────────────

describe("recurrence notes", () => {
	it("shows new topics", () => {
		const sections = generateKnowledgeSections(makePatterns({
			recurrenceSignals: [
				{ topic: "Rust", frequency: 1, trend: "new", dayCount: 1 },
			],
		}));
		expect(sections.recurrenceNotes.some((n) => n.includes("New today"))).toBe(true);
		expect(sections.recurrenceNotes.some((n) => n.includes("Rust"))).toBe(true);
	});

	it("shows returning topics", () => {
		const sections = generateKnowledgeSections(makePatterns({
			recurrenceSignals: [
				{ topic: "React", frequency: 5, trend: "returning", firstSeen: "2025-05-01", lastSeen: "2025-06-15", dayCount: 5 },
			],
		}));
		expect(sections.recurrenceNotes.some((n) => n.includes("Returning"))).toBe(true);
	});

	it("shows rising topics", () => {
		const sections = generateKnowledgeSections(makePatterns({
			recurrenceSignals: [
				{ topic: "TypeScript", frequency: 3, trend: "rising", dayCount: 3 },
			],
		}));
		expect(sections.recurrenceNotes.some((n) => n.includes("Trending up"))).toBe(true);
	});

	it("shows stable topics", () => {
		const sections = generateKnowledgeSections(makePatterns({
			recurrenceSignals: [
				{ topic: "JavaScript", frequency: 10, trend: "stable", dayCount: 10 },
			],
		}));
		expect(sections.recurrenceNotes.some((n) => n.includes("Ongoing"))).toBe(true);
	});
});

// ── Knowledge Delta Lines ───────────────────────────────

describe("knowledge delta lines", () => {
	it("shows new topics explored", () => {
		const sections = generateKnowledgeSections(makePatterns({
			knowledgeDelta: {
				newTopics: ["Rust", "WASM"],
				recurringTopics: [],
				novelEntities: [],
				connections: [],
			},
		}));
		expect(sections.knowledgeDeltaLines.some((l) => l.includes("Rust"))).toBe(true);
		expect(sections.knowledgeDeltaLines.some((l) => l.includes("New topics"))).toBe(true);
	});

	it("shows recurring topics", () => {
		const sections = generateKnowledgeSections(makePatterns({
			knowledgeDelta: {
				newTopics: [],
				recurringTopics: ["React", "TypeScript"],
				novelEntities: [],
				connections: [],
			},
		}));
		expect(sections.knowledgeDeltaLines.some((l) => l.includes("Continued work"))).toBe(true);
	});

	it("shows novel entities", () => {
		const sections = generateKnowledgeSections(makePatterns({
			knowledgeDelta: {
				newTopics: [],
				recurringTopics: [],
				novelEntities: ["Vitest", "esbuild"],
				connections: [],
			},
		}));
		expect(sections.knowledgeDeltaLines.some((l) => l.includes("New tools"))).toBe(true);
	});

	it("returns empty for empty delta", () => {
		const sections = generateKnowledgeSections(makePatterns());
		expect(sections.knowledgeDeltaLines).toHaveLength(0);
	});
});

// ── Tag Generation ──────────────────────────────────────

describe("tag generation", () => {
	it("generates activity type tags", () => {
		const sections = generateKnowledgeSections(makePatterns());
		expect(sections.tags.some((t) => t.startsWith("activity/"))).toBe(true);
		expect(sections.tags).toContain("activity/research");
	});

	it("generates topic tags from clusters", () => {
		const sections = generateKnowledgeSections(makePatterns({
			temporalClusters: [{
				hourStart: 10,
				hourEnd: 11,
				activityType: "research",
				eventCount: 5,
				topics: ["OAuth"],
				entities: [],
				intensity: 2.5,
				label: "research",
			}],
		}));
		expect(sections.tags.some((t) => t.startsWith("topic/"))).toBe(true);
	});

	it("generates entity tags from relations", () => {
		const sections = generateKnowledgeSections(makePatterns({
			entityRelations: [{
				entityA: "GitHub",
				entityB: "React",
				cooccurrences: 3,
				contexts: ["implementation"],
			}],
		}));
		expect(sections.tags.some((t) => t.startsWith("entity/"))).toBe(true);
	});

	it("generates deep-focus pattern tag", () => {
		const sections = generateKnowledgeSections(makePatterns({ focusScore: 0.8 }));
		expect(sections.tags).toContain("pattern/deep-focus");
	});

	it("generates scattered pattern tag", () => {
		const sections = generateKnowledgeSections(makePatterns({ focusScore: 0.2 }));
		expect(sections.tags).toContain("pattern/scattered");
	});

	it("generates new-exploration pattern tag", () => {
		const sections = generateKnowledgeSections(makePatterns({
			recurrenceSignals: [
				{ topic: "Rust", frequency: 1, trend: "new", dayCount: 1 },
			],
		}));
		expect(sections.tags).toContain("pattern/new-exploration");
	});
});
