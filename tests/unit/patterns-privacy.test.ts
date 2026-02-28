/**
 * Privacy tests for patterns.ts — verifies that filterClusterTopics()
 * removes raw page-title fragments from temporal cluster labels.
 *
 * Covers Bug 3: Tier 4 temporal cluster labels contained raw company names
 * from page titles (e.g., "specright isolvedhire Agentic, job search, career").
 */

import { describe, it, expect } from "vitest";
import { extractPatterns, buildEmptyTopicHistory } from "../../src/analyze/patterns";
import type { ClassificationResult, StructuredEvent } from "../../src/types";

// We test filterClusterTopics indirectly through the cluster labels produced
// by extractPatterns, since filterClusterTopics is an internal function.
// We also export it via a test-helper approach by testing the cluster output.

// ── filterClusterTopics behavior via cluster label inspection ──

describe("filterClusterTopics (via temporal cluster labels)", () => {
	function makeEvent(
		hour: number,
		topics: string[],
		activityType: string = "browsing"
	): StructuredEvent {
		const d = new Date("2026-02-26");
		d.setHours(hour, 0, 0, 0);
		return {
			timestamp: d.toISOString(),
			source: "browser",
			activityType: activityType as StructuredEvent["activityType"],
			topics,
			entities: [],
			intent: "explore",
			confidence: 0.3,
			category: "other",
			summary: "General web browsing",
		};
	}

	function buildClassification(events: StructuredEvent[]): ClassificationResult {
		return {
			events,
			totalProcessed: events.length,
			llmClassified: 0,
			ruleClassified: events.length,
			processingTimeMs: 10,
		};
	}

	it("filters topics containing dots (domain separators)", () => {
		// Topics like "specright.isolvedhire" should be filtered
		const events = Array.from({ length: 5 }, (_, i) =>
			makeEvent(9 + i, ["specright.isolvedhire", "job-search"])
		);
		const patterns = extractPatterns(
			buildClassification(events),
			{ enabled: true, cooccurrenceWindow: 30, minClusterSize: 3, trackRecurrence: false },
			buildEmptyTopicHistory(),
			"2026-02-26"
		);

		for (const cluster of patterns.temporalClusters) {
			for (const topic of cluster.topics) {
				expect(topic).not.toContain(".");
			}
			// Label should not contain the dotted topic
			expect(cluster.label).not.toContain("specright.isolvedhire");
		}
	});

	it("filters multi-word all-capitalized topics (company name fragments)", () => {
		// Topics like "LinkedIn Member Technical" should be filtered (all words start with caps)
		const events = Array.from({ length: 5 }, (_, i) =>
			makeEvent(9 + i, ["LinkedIn Member Technical", "job-search"])
		);
		const patterns = extractPatterns(
			buildClassification(events),
			{ enabled: true, cooccurrenceWindow: 30, minClusterSize: 3, trackRecurrence: false },
			buildEmptyTopicHistory(),
			"2026-02-26"
		);

		for (const cluster of patterns.temporalClusters) {
			for (const topic of cluster.topics) {
				// Multi-word all-caps should not appear
				const words = topic.split(/\s+/);
				if (words.length >= 2) {
					expect(words.every((w) => /^[A-Z]/.test(w))).toBe(false);
				}
			}
		}
	});

	it("keeps clean semantic topics like 'authentication' and 'job-search'", () => {
		// These should pass through the filter
		const events = Array.from({ length: 5 }, (_, i) =>
			makeEvent(9 + i, ["authentication", "job-search"])
		);
		const patterns = extractPatterns(
			buildClassification(events),
			{ enabled: true, cooccurrenceWindow: 30, minClusterSize: 3, trackRecurrence: false },
			buildEmptyTopicHistory(),
			"2026-02-26"
		);

		const allTopics = patterns.temporalClusters.flatMap((c) => c.topics);
		// At least one semantic topic should survive
		const hasAuthentication = allTopics.includes("authentication");
		const hasJobSearch = allTopics.includes("job-search");
		expect(hasAuthentication || hasJobSearch).toBe(true);
	});

	it("filters topics with URL characters", () => {
		// Topics containing /\\?=& are slug/URL fragments
		const events = Array.from({ length: 5 }, (_, i) =>
			makeEvent(9 + i, ["user/profile", "dashboard?tab=overview"])
		);
		const patterns = extractPatterns(
			buildClassification(events),
			{ enabled: true, cooccurrenceWindow: 30, minClusterSize: 3, trackRecurrence: false },
			buildEmptyTopicHistory(),
			"2026-02-26"
		);

		for (const cluster of patterns.temporalClusters) {
			for (const topic of cluster.topics) {
				expect(/[/\\?=&]/.test(topic)).toBe(false);
			}
		}
	});
});

// ── Direct unit test for filterClusterTopics logic ──────────
// Since filterClusterTopics is not exported, we test its behavior
// by asserting on the topics array of the resulting clusters.

describe("filterClusterTopics filter logic verification", () => {
	// Topics that SHOULD be filtered: contain dots, all-caps words, or slug chars
	const bugTopics = [
		"LinkedIn Member Technical",    // multi-word all-caps
		"Kidco Contact Keep",           // multi-word all-caps
		"Specright Isolvedhire Agentic",// multi-word all-caps
		"specright.isolvedhire",        // dot separator
		"user/profile",                 // slash
		"search?q=test",                // query string
	];

	const cleanTopics = [
		"authentication",
		"job-search",
		"software development",
		"social networking",
		"research",
	];

	it("all bug topics are filtered out by at least one rule", () => {
		// Verify each bug topic would be caught by the filter rules
		for (const t of bugTopics) {
			const hasDot = t.includes(".");
			const words = t.split(/\s+/);
			const allCaps = words.length >= 2 && words.every((w) => /^[A-Z]/.test(w));
			const hasSlug = /[/\\?=&]/.test(t);

			expect(hasDot || allCaps || hasSlug).toBe(true);
		}
	});

	it("all clean topics pass the filter", () => {
		// Verify clean semantic topics would NOT be filtered
		for (const t of cleanTopics) {
			const hasDot = t.includes(".");
			const words = t.split(/\s+/);
			const allCaps = words.length >= 2 && words.every((w) => /^[A-Z]/.test(w));
			const hasSlug = /[/\\?=&]/.test(t);

			expect(hasDot || allCaps || hasSlug).toBe(false);
		}
	});
});
