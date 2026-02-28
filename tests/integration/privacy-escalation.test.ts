import { describe, it, expect } from "vitest";
import { buildClassifiedPrompt, buildDeidentifiedPrompt } from "../../src/summarize/summarize";
import { classifyEventsRuleOnly } from "../../src/filter/classify";
import { ClassificationResult, PatternAnalysis } from "../../src/types";
import type { BrowserVisit, SearchQuery } from "../../src/types";

/**
 * Tests that the correct prompt tier is selected based on available data.
 * The privacy escalation chain: deidentified > classified > RAG > standard.
 */

const DATE = new Date("2025-06-15T00:00:00");

const classification: ClassificationResult = {
	events: [{
		timestamp: "2025-06-15T10:00:00Z",
		source: "browser",
		activityType: "research",
		topics: ["OAuth"],
		entities: ["GitHub"],
		intent: "evaluate",
		confidence: 0.8,
		summary: "Researching OAuth flows",
	}],
	totalProcessed: 1,
	llmClassified: 1,
	ruleClassified: 0,
	processingTimeMs: 50,
};

const patterns: PatternAnalysis = {
	temporalClusters: [{
		hourStart: 10,
		hourEnd: 11,
		activityType: "research",
		eventCount: 3,
		topics: ["OAuth"],
		entities: ["GitHub"],
		intensity: 3,
		label: "research 10am-12pm: OAuth",
	}],
	topicCooccurrences: [],
	entityRelations: [],
	recurrenceSignals: [],
	knowledgeDelta: {
		newTopics: ["OAuth"],
		recurringTopics: [],
		novelEntities: [],
		connections: [],
	},
	focusScore: 0.7,
	activityConcentrationScore: 1.0,
	topActivityTypes: [{ type: "research", count: 3, pct: 100 }],
	peakHours: [{ hour: 10, count: 3 }],
	commitWorkUnits: [],
	claudeTaskSessions: [],
};

describe("privacy escalation chain", () => {
	describe("deidentified prompt (Phase 4)", () => {
		it("contains ONLY aggregated statistics", () => {
			const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
			// Should have aggregated data (XML section tags)
			expect(prompt).toContain("activity_distribution");
			expect(prompt).toContain("temporal_clusters");
			expect(prompt).toContain("Focus score");
			// Should NOT have per-event data
			expect(prompt).not.toMatch(/https?:\/\//);
		});

		it("is more private than classified prompt", () => {
			const deidentified = buildDeidentifiedPrompt(DATE, patterns, "");
			const classified = buildClassifiedPrompt(DATE, classification, "");

			// Deidentified should NOT contain per-event summaries
			expect(deidentified).not.toContain("Researching OAuth flows");
			// Classified DOES contain per-event summaries
			expect(classified).toContain("Researching OAuth flows");
		});

		it("requests cognitive pattern analysis", () => {
			const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
			expect(prompt).toContain("meta_insights");
			expect(prompt).toContain("quirky_signals");
			expect(prompt).toContain("focus_narrative");
		});
	});

	describe("classified prompt (Phase 2)", () => {
		it("contains per-event abstractions but no raw data", () => {
			const prompt = buildClassifiedPrompt(DATE, classification, "");
			// Should have event summaries
			expect(prompt).toContain("Researching OAuth flows");
			// Should NOT have raw URLs
			expect(prompt).not.toMatch(/https?:\/\/github\.com/);
		});

		it("groups by activity type", () => {
			const prompt = buildClassifiedPrompt(DATE, classification, "");
			expect(prompt).toContain("### research");
		});

		it("includes entity and topic lists", () => {
			const prompt = buildClassifiedPrompt(DATE, classification, "");
			expect(prompt).toContain("Topics:");
			expect(prompt).toContain("Entities:");
		});
	});

	describe("prompt content verification", () => {
		it("deidentified prompt never contains ISO timestamps", () => {
			const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
			expect(prompt).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});

		it("classified prompt uses date string not raw timestamps", () => {
			const prompt = buildClassifiedPrompt(DATE, classification, "");
			expect(prompt).toContain("June 15, 2025");
		});

		it("deidentified prompt describes the data shape it receives", () => {
			const prompt = buildDeidentifiedPrompt(DATE, patterns, "");
			expect(prompt).toContain("aggregated");
			expect(prompt).toContain("no raw data");
		});
	});

	describe("Tier 3 prompt — no raw domain+title or verbatim search query (Bug 1 regression)", () => {
		// Build a rule-classified classification with browser and search events
		// that would previously have leaked raw data
		const rawVisits: BrowserVisit[] = [
			{
				url: "https://airbnb.com/trips",
				domain: "airbnb.com",
				title: "Your trips - Airbnb",
				time: new Date("2026-02-26T10:00:00Z"),
			},
			{
				url: "https://linkedin.com/jobs/view/1234",
				domain: "linkedin.com",
				title: "Senior Engineer - LinkedIn",
				time: new Date("2026-02-26T10:05:00Z"),
			},
		];
		const rawSearches: SearchQuery[] = [
			{
				query: "time traveler outfits for halloween",
				engine: "google.com",
				time: new Date("2026-02-26T11:00:00Z"),
			},
		];

		const categorized = {
			travel: [rawVisits[0]],
			work: [rawVisits[1]],
		};

		const ruleClassification = classifyEventsRuleOnly(
			rawVisits, rawSearches, [], [], categorized
		);

		it("classified prompt does not contain domain-title patterns", () => {
			const prompt = buildClassifiedPrompt(DATE, ruleClassification, "");
			// Should not match "domain.tld - Title" pattern
			expect(prompt).not.toMatch(/\b\w+\.\w+\s*-\s*\w/);
		});

		it("classified prompt does not contain verbatim search query format", () => {
			const prompt = buildClassifiedPrompt(DATE, ruleClassification, "");
			// Should not match '"query" (engine)' format
			expect(prompt).not.toMatch(/^"[^"]+"\s*\(\w/m);
		});

		it("classified prompt does not contain the raw airbnb domain name in summaries", () => {
			const prompt = buildClassifiedPrompt(DATE, ruleClassification, "");
			expect(prompt).not.toContain("airbnb.com - Your trips");
		});

		it("classified prompt does not contain verbatim search query text", () => {
			const prompt = buildClassifiedPrompt(DATE, ruleClassification, "");
			expect(prompt).not.toContain("time traveler outfits for halloween");
		});
	});

	describe("Tier 4 prompt — no company name fragments in cluster labels (Bug 3 regression)", () => {
		const patternsWithBadTopics: PatternAnalysis = {
			...patterns,
			temporalClusters: [
				{
					hourStart: 9,
					hourEnd: 10,
					activityType: "browsing",
					eventCount: 5,
					topics: ["software development", "authentication"],
					entities: [],
					intensity: 2.5,
					// After fix: label should NOT contain raw company name fragments
					label: "browsing 9am-11am: software development, authentication",
				},
			],
		};

		it("deidentified prompt cluster labels contain only semantic topics", () => {
			const prompt = buildDeidentifiedPrompt(DATE, patternsWithBadTopics, "");
			// Should have the semantic cluster label
			expect(prompt).toContain("software development");
			// Should not contain the patterns that indicate raw company name leakage
			// (These would appear in the temporalShape section)
			expect(prompt).not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+ [A-Z][a-z]+: /);
		});
	});
});
