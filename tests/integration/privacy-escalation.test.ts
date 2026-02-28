import { describe, it, expect } from "vitest";
import { buildClassifiedPrompt, buildDeidentifiedPrompt, resolvePromptAndTier } from "../../src/summarize/summarize";
import { ClassificationResult, PatternAnalysis, RAGConfig } from "../../src/types";
import type { AICallConfig } from "../../src/summarize/ai-client";

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

	describe("forceTier: 4 explicit output filter", () => {
		const anthropicConfig: AICallConfig = {
			provider: "anthropic",
			anthropicApiKey: "key",
			anthropicModel: "claude-haiku-4-5-20251001",
		};

		it("forceTier: 4 with enablePatterns: true sends only aggregate stats", () => {
			// This validates the acceptance criterion: Tier 4 + patterns enabled
			// must never send per-event data regardless of what features are on.
			const { tier, prompt } = resolvePromptAndTier(
				DATE, {}, [], [], anthropicConfig, "",
				undefined, classification, patterns, undefined, [],
				undefined, 4
			);
			expect(tier).toBe(4);
			expect(prompt).toContain("activity_distribution");
			expect(prompt).toContain("temporal_clusters");
			// No per-event data
			expect(prompt).not.toMatch(/https?:\/\//);
			expect(prompt).not.toContain("Researching OAuth flows");
		});

		it("forceTier: 4 without patterns still returns tier 4", () => {
			const { tier } = resolvePromptAndTier(
				DATE, {}, [], [], anthropicConfig, "",
				undefined, undefined, undefined, undefined, [],
				undefined, 4
			);
			expect(tier).toBe(4);
		});

		it("forceTier: 4 overrides patterns-would-escalate: no per-event URLs", () => {
			// Even if classification has event summaries, tier 4 must not expose them
			const { prompt } = resolvePromptAndTier(
				DATE, {}, [], [], anthropicConfig, "",
				undefined, classification, patterns, undefined, [],
				undefined, 4
			);
			expect(prompt).not.toContain("Researching OAuth flows");
		});

		it("forceTier: 1 with patterns enabled never escalates to tier 4", () => {
			// This validates the acceptance criterion: Tier 1 + patterns must not
			// be silently promoted to Tier 4 by the inference chain.
			const { tier } = resolvePromptAndTier(
				DATE, {}, [], [], anthropicConfig, "",
				undefined, undefined, patterns, undefined, [],
				undefined, 1
			);
			expect(tier).toBe(1);
		});

		it("forceTier: 1 with all features on uses full sanitized context, not de-identified", () => {
			const { tier, prompt } = resolvePromptAndTier(
				DATE, {}, [], [], anthropicConfig, "",
				undefined, classification, patterns, undefined, [],
				undefined, 1
			);
			expect(tier).toBe(1);
			// Should NOT use de-identified format
			expect(prompt).not.toContain("activity_distribution");
		});

		it("all 4 tiers preserve the tier invariant when forceTier is set", () => {
			const ragConfig: RAGConfig = {
				enabled: true,
				embeddingEndpoint: "http://localhost:11434",
				embeddingModel: "nomic-embed-text",
				topK: 5,
				minChunkTokens: 50,
				maxChunkTokens: 500,
			};
			for (const t of [1, 2, 3, 4] as const) {
				const { tier } = resolvePromptAndTier(
					DATE, {}, [], [], anthropicConfig, "",
					ragConfig, classification, patterns, undefined, [],
					undefined, t
				);
				expect(tier).toBe(t);
			}
		});
	});
});
