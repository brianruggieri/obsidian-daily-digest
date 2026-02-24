import { describe, it, expect } from "vitest";
import {
	buildEmptyTopicHistory,
	updateTopicHistory,
	computeRecurrenceSignals,
} from "../../src/analyze/patterns";

/**
 * Multi-day simulation: tests recurrence signal tracking across
 * 5 consecutive days to verify trend detection accuracy.
 */

describe("multi-day recurrence simulation", () => {
	it("tracks topic trends across 5 consecutive days", () => {
		let history = buildEmptyTopicHistory();

		// Day 1: Topics A and B are new
		const day1Topics = ["React", "TypeScript"];
		const day1Signals = computeRecurrenceSignals(day1Topics, "2025-06-11", history);
		expect(day1Signals.every((s) => s.trend === "new")).toBe(true);
		history = updateTopicHistory(history, day1Topics, "2025-06-11");

		// Day 2: A returns, C is new
		const day2Topics = ["React", "OAuth"];
		const day2Signals = computeRecurrenceSignals(day2Topics, "2025-06-12", history);
		const reactDay2 = day2Signals.find((s) => s.topic === "React");
		const oauthDay2 = day2Signals.find((s) => s.topic === "OAuth");
		expect(reactDay2?.trend).not.toBe("new"); // seen yesterday
		expect(oauthDay2?.trend).toBe("new");
		history = updateTopicHistory(history, day2Topics, "2025-06-12");

		// Day 3: A, B return, D is new
		const day3Topics = ["React", "TypeScript", "Rust"];
		const day3Signals = computeRecurrenceSignals(day3Topics, "2025-06-13", history);
		const rustDay3 = day3Signals.find((s) => s.topic === "Rust");
		expect(rustDay3?.trend).toBe("new");
		const reactDay3 = day3Signals.find((s) => s.topic === "React");
		expect(reactDay3?.dayCount).toBe(3); // 3rd day
		history = updateTopicHistory(history, day3Topics, "2025-06-13");

		// Day 4: A continues, E is new
		const day4Topics = ["React", "Docker"];
		const day4Signals = computeRecurrenceSignals(day4Topics, "2025-06-14", history);
		const reactDay4 = day4Signals.find((s) => s.topic === "React");
		expect(reactDay4?.dayCount).toBe(4);
		history = updateTopicHistory(history, day4Topics, "2025-06-14");

		// Day 5: A continues (5th day — should be rising/stable)
		const day5Topics = ["React", "Rust"];
		const day5Signals = computeRecurrenceSignals(day5Topics, "2025-06-15", history);
		const reactDay5 = day5Signals.find((s) => s.topic === "React");
		expect(reactDay5?.dayCount).toBe(5);
		expect(["rising", "stable"]).toContain(reactDay5?.trend);

		// Rust appeared on day 3, then day 5 (skip day 4) — should be returning or rising
		const rustDay5 = day5Signals.find((s) => s.topic === "Rust");
		expect(rustDay5?.dayCount).toBe(2);
	});

	it("detects returning topics after a week gap", () => {
		let history = buildEmptyTopicHistory();

		// Day 1: Topic appears
		history = updateTopicHistory(history, ["Machine Learning"], "2025-06-01");

		// Day 15 (14 days later): Topic returns
		const signals = computeRecurrenceSignals(["Machine Learning"], "2025-06-15", history);
		const ml = signals.find((s) => s.topic === "Machine Learning");
		expect(ml?.trend).toBe("returning");
		expect(ml?.dayCount).toBe(2);
	});

	it("preserves topic history structure", () => {
		let history = buildEmptyTopicHistory();
		history = updateTopicHistory(history, ["React"], "2025-06-11");
		history = updateTopicHistory(history, ["React", "TypeScript"], "2025-06-12");

		expect(history.version).toBe(1);
		expect(history.topics["react"]).toBeDefined();
		expect(history.topics["react"].firstSeen).toBe("2025-06-11");
		expect(history.topics["react"].lastSeen).toBe("2025-06-12");
		expect(history.topics["react"].dayCount).toBe(2);
		expect(history.topics["react"].recentDays).toContain("2025-06-11");
		expect(history.topics["react"].recentDays).toContain("2025-06-12");

		expect(history.topics["typescript"]).toBeDefined();
		expect(history.topics["typescript"].firstSeen).toBe("2025-06-12");
	});

	it("cleans up old recentDays entries (>30 days)", () => {
		let history = buildEmptyTopicHistory();

		// Add topic 40 days ago
		history = updateTopicHistory(history, ["Old Topic"], "2025-05-06");

		// Update today (40 days later)
		history = updateTopicHistory(history, ["Old Topic"], "2025-06-15");

		// The old entry should be cleaned from recentDays
		const topic = history.topics["old topic"];
		expect(topic.recentDays).not.toContain("2025-05-06");
		expect(topic.recentDays).toContain("2025-06-15");
		expect(topic.dayCount).toBe(2);
		expect(topic.firstSeen).toBe("2025-05-06"); // firstSeen preserved
	});
});
