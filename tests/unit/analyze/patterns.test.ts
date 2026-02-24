import { describe, it, expect } from "vitest";
import {
	extractPatterns,
	computeRecurrenceSignals,
	updateTopicHistory,
	buildEmptyTopicHistory,
	computeKnowledgeDelta,
} from "../../../src/analyze/patterns";
import {
	StructuredEvent,
	ClassificationResult,
	PatternConfig,
	TopicCooccurrence,
} from "../../../src/types";

const TODAY = "2025-06-15";
const baseConfig: PatternConfig = {
	enabled: true,
	cooccurrenceWindow: 30,
	minClusterSize: 2,
	trackRecurrence: true,
};

// Use local timezone timestamps to avoid getHours() timezone issues
function localIso(hour: number, minute = 0): string {
	const d = new Date(2025, 5, 15, hour, minute, 0); // June 15, 2025 local
	return d.toISOString();
}

function makeEvent(overrides: Partial<StructuredEvent>): StructuredEvent {
	return {
		timestamp: localIso(10),
		source: "browser",
		activityType: "research",
		topics: ["testing"],
		entities: ["Vitest"],
		intent: "evaluate",
		confidence: 0.8,
		summary: "Test event",
		...overrides,
	};
}

function makeClassification(events: StructuredEvent[]): ClassificationResult {
	return {
		events,
		totalProcessed: events.length,
		llmClassified: 0,
		ruleClassified: events.length,
		processingTimeMs: 0,
	};
}

// ── Temporal Clustering ─────────────────────────────────

describe("temporal clustering", () => {
	it("clusters events in the same hour", () => {
		const events = [
			makeEvent({ timestamp: localIso(10), activityType: "research" }),
			makeEvent({ timestamp: localIso(10, 15), activityType: "research" }),
			makeEvent({ timestamp: localIso(10, 30), activityType: "research" }),
		];
		const result = extractPatterns(makeClassification(events), baseConfig, buildEmptyTopicHistory(), TODAY);
		expect(result.temporalClusters.length).toBeGreaterThanOrEqual(1);
		expect(result.temporalClusters[0].eventCount).toBeGreaterThanOrEqual(3);
	});

	it("merges consecutive hours into one cluster", () => {
		const events = [
			makeEvent({ timestamp: localIso(10), activityType: "implementation" }),
			makeEvent({ timestamp: localIso(10, 30), activityType: "implementation" }),
			makeEvent({ timestamp: localIso(11, 15), activityType: "implementation" }),
			makeEvent({ timestamp: localIso(11, 45), activityType: "implementation" }),
		];
		const result = extractPatterns(makeClassification(events), baseConfig, buildEmptyTopicHistory(), TODAY);
		// All implementation events in hours 10-11 should form one cluster
		const implClusters = result.temporalClusters.filter((c) => c.activityType === "implementation");
		expect(implClusters.length).toBe(1);
		expect(implClusters[0].hourStart).toBe(10);
		expect(implClusters[0].hourEnd).toBe(11);
	});

	it("separates clusters with hour gaps", () => {
		const events = [
			makeEvent({ timestamp: localIso(9), activityType: "debugging" }),
			makeEvent({ timestamp: localIso(9, 30), activityType: "debugging" }),
			// gap at 10, 11, 12
			makeEvent({ timestamp: localIso(13), activityType: "debugging" }),
			makeEvent({ timestamp: localIso(13, 30), activityType: "debugging" }),
		];
		const result = extractPatterns(makeClassification(events), baseConfig, buildEmptyTopicHistory(), TODAY);
		const debugClusters = result.temporalClusters.filter((c) => c.activityType === "debugging");
		expect(debugClusters.length).toBe(2);
	});

	it("respects minClusterSize", () => {
		const events = [
			makeEvent({ timestamp: localIso(10), activityType: "writing" }),
			// Only 1 event — below default minClusterSize of 2
		];
		const config = { ...baseConfig, minClusterSize: 2 };
		const result = extractPatterns(makeClassification(events), config, buildEmptyTopicHistory(), TODAY);
		const writingClusters = result.temporalClusters.filter((c) => c.activityType === "writing");
		expect(writingClusters.length).toBe(0);
	});

	it("handles empty events", () => {
		const result = extractPatterns(makeClassification([]), baseConfig, buildEmptyTopicHistory(), TODAY);
		expect(result.temporalClusters).toHaveLength(0);
	});

	it("skips events without timestamps", () => {
		const events = [
			makeEvent({ timestamp: "", activityType: "research" }),
			makeEvent({ timestamp: localIso(10), activityType: "research" }),
			makeEvent({ timestamp: localIso(10, 30), activityType: "research" }),
		];
		const result = extractPatterns(makeClassification(events), baseConfig, buildEmptyTopicHistory(), TODAY);
		// Only 2 events with timestamps should be clustered
		const totalClusteredEvents = result.temporalClusters.reduce((s, c) => s + c.eventCount, 0);
		expect(totalClusteredEvents).toBe(2);
	});
});

// ── Topic Co-occurrence ─────────────────────────────────

describe("topic co-occurrence", () => {
	it("detects co-occurring topics within time window", () => {
		const events = [
			makeEvent({ timestamp: localIso(10), topics: ["React", "hooks"] }),
			makeEvent({ timestamp: localIso(10, 10), topics: ["React", "testing"] }),
			makeEvent({ timestamp: localIso(10, 20), topics: ["hooks", "testing"] }),
		];
		const result = extractPatterns(makeClassification(events), baseConfig, buildEmptyTopicHistory(), TODAY);
		expect(result.topicCooccurrences.length).toBeGreaterThan(0);
		// React and hooks should co-occur
		const reactHooks = result.topicCooccurrences.find(
			(c) => (c.topicA === "React" && c.topicB === "hooks") || (c.topicA === "hooks" && c.topicB === "React")
		);
		expect(reactHooks).toBeDefined();
	});

	it("does not co-occur topics in different time windows", () => {
		const events = [
			makeEvent({ timestamp: localIso(9), topics: ["morning-topic"] }),
			// 3 hours later — well outside 30-minute window
			makeEvent({ timestamp: localIso(12), topics: ["afternoon-topic"] }),
		];
		const result = extractPatterns(makeClassification(events), baseConfig, buildEmptyTopicHistory(), TODAY);
		const cross = result.topicCooccurrences.find(
			(c) => c.topicA.includes("morning") || c.topicB.includes("morning")
		);
		expect(cross).toBeUndefined();
	});

	it("normalizes strength between 0 and 1", () => {
		const events = [
			makeEvent({ timestamp: localIso(10), topics: ["A", "B"] }),
			makeEvent({ timestamp: localIso(10, 5), topics: ["A", "B"] }),
		];
		const result = extractPatterns(makeClassification(events), baseConfig, buildEmptyTopicHistory(), TODAY);
		for (const co of result.topicCooccurrences) {
			expect(co.strength).toBeGreaterThanOrEqual(0);
			expect(co.strength).toBeLessThanOrEqual(1);
		}
	});
});

// ── Entity Relations ────────────────────────────────────

describe("entity relations", () => {
	it("detects co-occurring entities within events", () => {
		const events = [
			makeEvent({ entities: ["GitHub", "React"], activityType: "implementation" }),
			makeEvent({ entities: ["GitHub", "React"], activityType: "debugging" }),
		];
		const result = extractPatterns(makeClassification(events), baseConfig, buildEmptyTopicHistory(), TODAY);
		expect(result.entityRelations.length).toBeGreaterThan(0);
		const ghReact = result.entityRelations.find(
			(r) => (r.entityA === "GitHub" && r.entityB === "React") || (r.entityA === "React" && r.entityB === "GitHub")
		);
		expect(ghReact).toBeDefined();
		expect(ghReact!.cooccurrences).toBe(2);
		expect(ghReact!.contexts).toContain("implementation");
		expect(ghReact!.contexts).toContain("debugging");
	});

	it("ignores events with fewer than 2 entities", () => {
		const events = [
			makeEvent({ entities: ["GitHub"] }),
			makeEvent({ entities: [] }),
		];
		const result = extractPatterns(makeClassification(events), baseConfig, buildEmptyTopicHistory(), TODAY);
		expect(result.entityRelations).toHaveLength(0);
	});
});

// ── Focus Score ─────────────────────────────────────────

describe("focus score", () => {
	it("high focus when all events have same topic", () => {
		const events = Array.from({ length: 10 }, () =>
			makeEvent({ topics: ["React"] })
		);
		const result = extractPatterns(makeClassification(events), baseConfig, buildEmptyTopicHistory(), TODAY);
		expect(result.focusScore).toBeGreaterThanOrEqual(0.9);
	});

	it("low focus when events have many different topics", () => {
		const events = Array.from({ length: 10 }, (_, i) =>
			makeEvent({ topics: [`topic-${i}`] })
		);
		const result = extractPatterns(makeClassification(events), baseConfig, buildEmptyTopicHistory(), TODAY);
		expect(result.focusScore).toBeLessThan(0.3);
	});

	it("returns 0 for empty events", () => {
		const result = extractPatterns(makeClassification([]), baseConfig, buildEmptyTopicHistory(), TODAY);
		expect(result.focusScore).toBe(0);
	});

	it("intermediate focus for mixed topics", () => {
		// 7 React + 3 DevOps: Shannon entropy ~0.88 out of max log2(2)=1.0
		// focus = 1 - (0.88/1.0) ≈ 0.12 — still relatively low because only 2 topics
		const events = [
			...Array.from({ length: 7 }, () => makeEvent({ topics: ["React"] })),
			...Array.from({ length: 3 }, () => makeEvent({ topics: ["DevOps"] })),
		];
		const result = extractPatterns(makeClassification(events), baseConfig, buildEmptyTopicHistory(), TODAY);
		// With 2 topics at 70/30 split, entropy is high relative to max; focus is modest
		expect(result.focusScore).toBeGreaterThan(0.05);
		expect(result.focusScore).toBeLessThan(0.5);
	});
});

// ── Recurrence Signals ──────────────────────────────────

describe("computeRecurrenceSignals", () => {
	it("marks new topics as 'new'", () => {
		const signals = computeRecurrenceSignals(["React", "Rust"], TODAY, buildEmptyTopicHistory());
		expect(signals).toHaveLength(2);
		expect(signals.every((s) => s.trend === "new")).toBe(true);
		expect(signals[0].dayCount).toBe(1);
	});

	it("marks topics not seen in 7 days as 'returning'", () => {
		const history = buildEmptyTopicHistory();
		history.topics["react"] = {
			firstSeen: "2025-06-01",
			lastSeen: "2025-06-05", // 10 days ago
			dayCount: 3,
			recentDays: ["2025-06-01", "2025-06-03", "2025-06-05"],
		};

		const signals = computeRecurrenceSignals(["React"], TODAY, history);
		expect(signals[0].trend).toBe("returning");
		expect(signals[0].dayCount).toBe(4);
	});

	it("marks frequently seen topics as 'stable'", () => {
		const history = buildEmptyTopicHistory();
		// Seen 6 times in last 14 days
		history.topics["react"] = {
			firstSeen: "2025-06-01",
			lastSeen: "2025-06-14",
			dayCount: 6,
			recentDays: [
				"2025-06-04", "2025-06-06", "2025-06-08",
				"2025-06-10", "2025-06-12", "2025-06-14",
			],
		};

		const signals = computeRecurrenceSignals(["React"], TODAY, history);
		expect(signals[0].trend).toBe("stable");
	});

	it("marks moderately frequent topics as 'rising'", () => {
		const history = buildEmptyTopicHistory();
		history.topics["react"] = {
			firstSeen: "2025-06-10",
			lastSeen: "2025-06-14",
			dayCount: 3,
			recentDays: ["2025-06-10", "2025-06-12", "2025-06-14"],
		};

		const signals = computeRecurrenceSignals(["React"], TODAY, history);
		expect(signals[0].trend).toBe("rising");
	});

	it("sorts by trend priority: new > returning > rising > stable > declining", () => {
		const history = buildEmptyTopicHistory();
		history.topics["stable-topic"] = {
			firstSeen: "2025-06-01",
			lastSeen: "2025-06-14",
			dayCount: 6,
			recentDays: ["2025-06-04", "2025-06-06", "2025-06-08", "2025-06-10", "2025-06-12", "2025-06-14"],
		};
		history.topics["returning-topic"] = {
			firstSeen: "2025-05-01",
			lastSeen: "2025-06-01",
			dayCount: 2,
			recentDays: ["2025-05-01", "2025-06-01"],
		};

		const signals = computeRecurrenceSignals(
			["new-topic", "returning-topic", "stable-topic"],
			TODAY,
			history
		);

		expect(signals[0].trend).toBe("new");
		expect(signals[1].trend).toBe("returning");
		expect(signals[2].trend).toBe("stable");
	});
});

// ── Topic History Update ────────────────────────────────

describe("updateTopicHistory", () => {
	it("adds new topics", () => {
		const history = buildEmptyTopicHistory();
		const updated = updateTopicHistory(history, ["React", "Rust"], TODAY);
		expect(updated.topics["react"]).toBeDefined();
		expect(updated.topics["rust"]).toBeDefined();
		expect(updated.topics["react"].dayCount).toBe(1);
		expect(updated.topics["react"].firstSeen).toBe(TODAY);
	});

	it("updates existing topics", () => {
		const history = buildEmptyTopicHistory();
		history.topics["react"] = {
			firstSeen: "2025-06-01",
			lastSeen: "2025-06-14",
			dayCount: 3,
			recentDays: ["2025-06-01", "2025-06-10", "2025-06-14"],
		};

		const updated = updateTopicHistory(history, ["React"], TODAY);
		expect(updated.topics["react"].dayCount).toBe(4);
		expect(updated.topics["react"].lastSeen).toBe(TODAY);
		expect(updated.topics["react"].firstSeen).toBe("2025-06-01");
		expect(updated.topics["react"].recentDays).toContain(TODAY);
	});

	it("trims recentDays to 30 entries", () => {
		const history = buildEmptyTopicHistory();
		history.topics["react"] = {
			firstSeen: "2025-05-01",
			lastSeen: "2025-06-14",
			dayCount: 35,
			recentDays: Array.from({ length: 30 }, (_, i) => {
				const d = new Date("2025-05-16");
				d.setDate(d.getDate() + i);
				return d.toISOString().slice(0, 10);
			}),
		};

		const updated = updateTopicHistory(history, ["React"], TODAY);
		expect(updated.topics["react"].recentDays.length).toBeLessThanOrEqual(30);
	});

	it("does not modify original history", () => {
		const history = buildEmptyTopicHistory();
		const updated = updateTopicHistory(history, ["React"], TODAY);
		expect(history.topics["react"]).toBeUndefined();
		expect(updated.topics["react"]).toBeDefined();
	});
});

// ── Knowledge Delta ─────────────────────────────────────

describe("computeKnowledgeDelta", () => {
	it("identifies new topics from new recurrence signals", () => {
		const recurrence = [
			{ topic: "Rust", frequency: 1, trend: "new" as const, dayCount: 1 },
			{ topic: "React", frequency: 5, trend: "stable" as const, dayCount: 5 },
		];

		const delta = computeKnowledgeDelta(
			["Rust", "React"],
			["Cargo", "GitHub"],
			recurrence,
			[]
		);
		expect(delta.newTopics).toContain("Rust");
		expect(delta.newTopics).not.toContain("React");
	});

	it("identifies recurring topics", () => {
		const recurrence = [
			{ topic: "React", frequency: 5, trend: "stable" as const, dayCount: 5 },
			{ topic: "TypeScript", frequency: 3, trend: "rising" as const, dayCount: 3 },
		];

		const delta = computeKnowledgeDelta(
			["React", "TypeScript"],
			[],
			recurrence,
			[]
		);
		expect(delta.recurringTopics).toContain("React");
		expect(delta.recurringTopics).toContain("TypeScript");
	});

	it("identifies cross-topic connections from strong co-occurrences", () => {
		const cooccurrences: TopicCooccurrence[] = [
			{ topicA: "React", topicB: "Testing", strength: 0.8, sharedEvents: 5, window: "10am" },
			{ topicA: "CSS", topicB: "Grid", strength: 0.3, sharedEvents: 1, window: "2pm" },
		];

		const delta = computeKnowledgeDelta([], [], [], cooccurrences);
		expect(delta.connections.length).toBe(1);
		expect(delta.connections[0]).toContain("React");
		expect(delta.connections[0]).toContain("Testing");
	});
});

// ── Full extractPatterns ────────────────────────────────

describe("extractPatterns", () => {
	it("produces all fields for realistic data", () => {
		const events = [
			makeEvent({ timestamp: localIso(9), activityType: "research", topics: ["OAuth"], entities: ["GitHub"] }),
			makeEvent({ timestamp: localIso(9, 15), activityType: "research", topics: ["OAuth", "PKCE"], entities: ["GitHub", "Auth0"] }),
			makeEvent({ timestamp: localIso(9, 30), activityType: "implementation", topics: ["OAuth"], entities: ["React"] }),
			makeEvent({ timestamp: localIso(10), activityType: "implementation", topics: ["React", "hooks"], entities: ["React"] }),
			makeEvent({ timestamp: localIso(10, 15), activityType: "debugging", topics: ["React", "testing"], entities: ["Vitest"] }),
			makeEvent({ timestamp: localIso(14), activityType: "implementation", topics: ["deployment"], entities: ["Vercel"] }),
			makeEvent({ timestamp: localIso(14, 30), activityType: "implementation", topics: ["deployment"], entities: ["Vercel", "Docker"] }),
		];

		const result = extractPatterns(makeClassification(events), baseConfig, buildEmptyTopicHistory(), TODAY);

		expect(result.temporalClusters.length).toBeGreaterThan(0);
		expect(result.topicCooccurrences.length).toBeGreaterThan(0);
		expect(result.entityRelations.length).toBeGreaterThan(0);
		expect(result.recurrenceSignals.length).toBeGreaterThan(0);
		expect(result.focusScore).toBeGreaterThan(0);
		expect(result.topActivityTypes.length).toBeGreaterThan(0);
		expect(result.peakHours.length).toBeGreaterThan(0);
	});

	it("skips recurrence when trackRecurrence is false", () => {
		const events = [
			makeEvent({ timestamp: localIso(10), topics: ["React"] }),
			makeEvent({ timestamp: localIso(10, 15), topics: ["React"] }),
		];
		const config = { ...baseConfig, trackRecurrence: false };
		const result = extractPatterns(makeClassification(events), config, buildEmptyTopicHistory(), TODAY);
		expect(result.recurrenceSignals).toHaveLength(0);
	});

	it("computes activity type distribution", () => {
		const events = [
			makeEvent({ activityType: "research" }),
			makeEvent({ activityType: "research" }),
			makeEvent({ activityType: "implementation" }),
		];
		const result = extractPatterns(makeClassification(events), baseConfig, buildEmptyTopicHistory(), TODAY);
		expect(result.topActivityTypes[0].type).toBe("research");
		expect(result.topActivityTypes[0].count).toBe(2);
		expect(result.topActivityTypes[0].pct).toBeCloseTo(67, -1);
	});

	it("computes peak hours", () => {
		const events = [
			makeEvent({ timestamp: localIso(10) }),
			makeEvent({ timestamp: localIso(10, 15) }),
			makeEvent({ timestamp: localIso(10, 30) }),
			makeEvent({ timestamp: localIso(14) }),
		];
		const result = extractPatterns(makeClassification(events), baseConfig, buildEmptyTopicHistory(), TODAY);
		expect(result.peakHours[0].hour).toBe(10);
		expect(result.peakHours[0].count).toBe(3);
	});
});
