/**
 * Provider Comparison Tests — Cost/Quality Analyzer
 *
 * TDD: Tests for cost calculation, quality scoring, consistency comparison,
 * and recommendations across Mock, Local LLM, and Claude Haiku providers.
 *
 * Run: npx vitest run tests/eval/provider-comparison.test.eval.ts
 */

import { describe, it, expect } from "vitest";
import {
	ProviderComparator,
	type ComparisonMetrics,
	type ComparisonResult,
} from "./provider-comparison";

// ── Cost Calculation Tests ──────────────────────────────────────────────

describe("ProviderComparator - Cost Calculation", () => {
	it("calculates Claude Haiku cost correctly", () => {
		const comparator = new ProviderComparator("anthropic");
		const cost = comparator.calculateCost(1200, 350);

		// Input: 1200 * $0.80 / 1,000,000 = $0.00096
		// Output: 350 * $0.40 / 1,000,000 = $0.00014
		// Total ≈ $0.0011 (but let's verify precise calc)
		const expectedInputCost = (1200 * 0.8) / 1_000_000;
		const expectedOutputCost = (350 * 0.4) / 1_000_000;
		const expectedTotal = expectedInputCost + expectedOutputCost;

		expect(cost).toBeCloseTo(expectedTotal, 8);
		expect(cost).toBeGreaterThan(0.001);
		expect(cost).toBeLessThan(0.002);
	});

	it("calculates Mock provider cost as zero", () => {
		const comparator = new ProviderComparator("mock");
		const cost = comparator.calculateCost(1200, 350);
		expect(cost).toBe(0);
	});

	it("calculates Local LLM cost as zero", () => {
		const comparator = new ProviderComparator("local");
		const cost = comparator.calculateCost(1200, 350);
		expect(cost).toBe(0);
	});

	it("handles zero token inputs", () => {
		const comparator = new ProviderComparator("anthropic");
		expect(comparator.calculateCost(0, 0)).toBe(0);
	});

	it("calculates cost for various token counts", () => {
		const comparator = new ProviderComparator("anthropic");

		// Small call: 100 input, 50 output
		const smallCost = comparator.calculateCost(100, 50);
		const smallExpected = (100 * 0.8 + 50 * 0.4) / 1_000_000;
		expect(smallCost).toBeCloseTo(smallExpected, 8);

		// Large call: 5000 input, 1000 output
		const largeCost = comparator.calculateCost(5000, 1000);
		const largeExpected = (5000 * 0.8 + 1000 * 0.4) / 1_000_000;
		expect(largeCost).toBeCloseTo(largeExpected, 8);
	});
});

// ── Quality Scoring Tests ──────────────────────────────────────────────

describe("ProviderComparator - Quality Scoring", () => {
	it("returns score in 0-1 range for good output", () => {
		const comparator = new ProviderComparator("anthropic");
		const output: Record<string, unknown> = {
			headline: "A productive day of auth refactoring",
			work_patterns: ["Deep 2h focus block", "Context switch to testing"],
			cross_source_connections: [
				"Searched OAuth, then committed auth middleware",
			],
			focus_score: 0.75,
		};

		const score = comparator.scoreQuality(output, "productive-dev");
		expect(score).toBeGreaterThanOrEqual(0);
		expect(score).toBeLessThanOrEqual(1);
	});

	it("awards 0.2 for excellent headline (20-150 chars)", () => {
		const comparator = new ProviderComparator("mock");
		const output: Record<string, unknown> = {
			headline: "Built new feature and fixed critical bug", // 39 chars
			work_patterns: [],
			cross_source_connections: [],
		};

		const score = comparator.scoreQuality(output, "dev");
		// Headline = 0.2, work_patterns = 0, connections = 0, focus = 0
		// Base 0.5 + 0.2 = 0.7
		expect(score).toBe(0.7);
	});

	it("awards 0.1 for short headlines (10+ chars but <20)", () => {
		const comparator = new ProviderComparator("mock");
		const output: Record<string, unknown> = {
			headline: "Good progress",  // 13 chars
			work_patterns: [],
			cross_source_connections: [],
		};

		const score = comparator.scoreQuality(output, "dev");
		// Headline = 0.1, rest = 0
		// Base 0.5 + 0.1 = 0.6
		expect(score).toBe(0.6);
	});

	it("awards 0 for missing or short headline (<10 chars)", () => {
		const comparator = new ProviderComparator("mock");
		const output: Record<string, unknown> = {
			headline: "Work",  // 4 chars, too short
			work_patterns: [],
			cross_source_connections: [],
		};

		const score = comparator.scoreQuality(output, "dev");
		// Headline = 0, rest = 0
		// Base 0.5
		expect(score).toBe(0.5);
	});

	it("awards 0.3 for 2+ work patterns", () => {
		const comparator = new ProviderComparator("mock");
		const output: Record<string, unknown> = {
			headline: "Work",  // 4 chars, gives 0
			work_patterns: ["Pattern A", "Pattern B"],
			cross_source_connections: [],
		};

		const score = comparator.scoreQuality(output, "dev");
		// Headline = 0 (too short), work_patterns = 0.3
		// Base 0.5 + 0.3 = 0.8
		expect(score).toBe(0.8);
	});

	it("awards 0.15 for 1 work pattern", () => {
		const comparator = new ProviderComparator("mock");
		const output: Record<string, unknown> = {
			headline: "Work",  // 4 chars, gives 0
			work_patterns: ["One pattern"],
			cross_source_connections: [],
		};

		const score = comparator.scoreQuality(output, "dev");
		// Headline = 0, work_patterns = 0.15
		// Base 0.5 + 0.15 = 0.65
		expect(score).toBe(0.65);
	});

	it("awards 0.2 for 2+ connections", () => {
		const comparator = new ProviderComparator("mock");
		const output: Record<string, unknown> = {
			headline: "Work",  // 4 chars, gives 0
			work_patterns: [],
			cross_source_connections: ["Connection A", "Connection B"],
		};

		const score = comparator.scoreQuality(output, "dev");
		// Headline = 0, work_patterns = 0, connections = 0.2
		// Base 0.5 + 0.2 = 0.7
		expect(score).toBe(0.7);
	});

	it("awards 0.1 for 1 connection", () => {
		const comparator = new ProviderComparator("mock");
		const output: Record<string, unknown> = {
			headline: "Work",  // 4 chars, gives 0
			work_patterns: [],
			cross_source_connections: ["One connection"],
		};

		const score = comparator.scoreQuality(output, "dev");
		// Headline = 0, work_patterns = 0, connections = 0.1
		// Base 0.5 + 0.1 = 0.6
		expect(score).toBe(0.6);
	});

	it("awards 0.2 for reasonable focus score for persona", () => {
		const comparator = new ProviderComparator("mock");

		// For "focused-dev" persona, a focus_score of 0.8 is reasonable
		const output: Record<string, unknown> = {
			headline: "Work",  // 4 chars, gives 0
			work_patterns: [],
			cross_source_connections: [],
			focus_score: 0.8,
		};

		const score = comparator.scoreQuality(output, "focused-dev");
		// Headline = 0, work_patterns = 0, connections = 0, focus = 0.2
		// Base 0.5 + 0.2 = 0.7
		expect(score).toBe(0.7);
	});

	it("awards 0.1 for partially reasonable focus score", () => {
		const comparator = new ProviderComparator("mock");

		// For "unfocused-dev" persona, a focus_score of 0.4 is somewhat reasonable
		const output: Record<string, unknown> = {
			headline: "A good day",
			work_patterns: [],
			cross_source_connections: [],
			focus_score: 0.4,
		};

		const score = comparator.scoreQuality(output, "unfocused-dev");
		// Headline = 0, work_patterns = 0, connections = 0, focus = 0.1
		// Base 0.5 + 0.1 = 0.6
		expect(score).toBe(0.6);
	});

	it("awards 0 for unreasonable focus score", () => {
		const comparator = new ProviderComparator("mock");

		// For "focused-dev" persona, a focus_score of 0.2 is too low
		const output: Record<string, unknown> = {
			headline: "Work",  // 4 chars, gives 0
			work_patterns: [],
			cross_source_connections: [],
			focus_score: 0.2,
		};

		const score = comparator.scoreQuality(output, "focused-dev");
		// Headline = 0, work_patterns = 0, connections = 0, focus = 0
		// Base 0.5
		expect(score).toBe(0.5);
	});

	it("combines all scoring dimensions correctly", () => {
		const comparator = new ProviderComparator("mock");
		const output: Record<string, unknown> = {
			headline: "Excellent day of productive work",  // 32 chars = 0.2
			work_patterns: ["Deep focus", "Testing"],     // 2+ = 0.3
			cross_source_connections: ["Git + Claude"],   // 1 = 0.1
			focus_score: 0.85,                             // reasonable = 0.2
		};

		const score = comparator.scoreQuality(output, "productive-dev");
		// Base 0.5 + 0.2 + 0.3 + 0.1 + 0.2 = 1.3, capped at 1.0
		expect(score).toBe(1.0);
	});

	it("caps final score at 1.0", () => {
		const comparator = new ProviderComparator("mock");
		const output: Record<string, unknown> = {
			headline: "Excellent work today",
			work_patterns: ["A", "B", "C"],
			cross_source_connections: ["X", "Y", "Z"],
			focus_score: 0.9,
		};

		const score = comparator.scoreQuality(output, "busy-dev");
		expect(score).toBeLessThanOrEqual(1.0);
	});
});

// ── Consistency Comparison Tests ────────────────────────────────────────

describe("ProviderComparator - Consistency Comparison", () => {
	it("returns 1.0 for identical current and baseline", () => {
		const comparator = new ProviderComparator("anthropic");

		const baseline: ComparisonMetrics = {
			inputTokens: 1000,
			outputTokens: 300,
			estimatedCost: 0.001,
			responseTime: 2000,
			workPatternsCount: 2,
			focusScore: 0.75,
			connectionsCount: 1,
		};

		const current: ComparisonMetrics = {
			inputTokens: 1000,
			outputTokens: 300,
			estimatedCost: 0.001,
			responseTime: 2000,
			workPatternsCount: 2,
			focusScore: 0.75,
			connectionsCount: 1,
		};

		const consistency = comparator.compareToBaseline(current, baseline);
		expect(consistency).toBe(1.0);
	});

	it("penalizes 10% work pattern deviation (-0.1)", () => {
		const comparator = new ProviderComparator("anthropic");

		const baseline: ComparisonMetrics = {
			inputTokens: 1000,
			outputTokens: 300,
			estimatedCost: 0.001,
			responseTime: 2000,
			workPatternsCount: 2,  // baseline
			focusScore: 0.75,
			connectionsCount: 1,
		};

		const current: ComparisonMetrics = {
			inputTokens: 1000,
			outputTokens: 300,
			estimatedCost: 0.001,
			responseTime: 2000,
			workPatternsCount: 2.2,  // +10% (within ±50%)
			focusScore: 0.75,
			connectionsCount: 1,
		};

		const consistency = comparator.compareToBaseline(current, baseline);
		expect(consistency).toBe(0.9);
	});

	it("penalizes >50% work pattern deviation (-0.3)", () => {
		const comparator = new ProviderComparator("anthropic");

		const baseline: ComparisonMetrics = {
			inputTokens: 1000,
			outputTokens: 300,
			estimatedCost: 0.001,
			responseTime: 2000,
			workPatternsCount: 2,
			focusScore: 0.75,
			connectionsCount: 1,
		};

		const current: ComparisonMetrics = {
			inputTokens: 1000,
			outputTokens: 300,
			estimatedCost: 0.001,
			responseTime: 2000,
			workPatternsCount: 3.5,  // +75% (exceeds 50%)
			focusScore: 0.75,
			connectionsCount: 1,
		};

		const consistency = comparator.compareToBaseline(current, baseline);
		expect(consistency).toBe(0.7);
	});

	it("penalizes 0.15 focus score diff (-0.1)", () => {
		const comparator = new ProviderComparator("anthropic");

		const baseline: ComparisonMetrics = {
			inputTokens: 1000,
			outputTokens: 300,
			estimatedCost: 0.001,
			responseTime: 2000,
			workPatternsCount: 2,
			focusScore: 0.75,
			connectionsCount: 1,
		};

		const current: ComparisonMetrics = {
			inputTokens: 1000,
			outputTokens: 300,
			estimatedCost: 0.001,
			responseTime: 2000,
			workPatternsCount: 2,
			focusScore: 0.6,  // 0.15 diff (within 0.2)
			connectionsCount: 1,
		};

		const consistency = comparator.compareToBaseline(current, baseline);
		expect(consistency).toBe(0.9);
	});

	it("penalizes >0.2 focus score diff (-0.2)", () => {
		const comparator = new ProviderComparator("anthropic");

		const baseline: ComparisonMetrics = {
			inputTokens: 1000,
			outputTokens: 300,
			estimatedCost: 0.001,
			responseTime: 2000,
			workPatternsCount: 2,
			focusScore: 0.75,
			connectionsCount: 1,
		};

		const current: ComparisonMetrics = {
			inputTokens: 1000,
			outputTokens: 300,
			estimatedCost: 0.001,
			responseTime: 2000,
			workPatternsCount: 2,
			focusScore: 0.5,  // 0.25 diff (exceeds 0.2)
			connectionsCount: 1,
		};

		const consistency = comparator.compareToBaseline(current, baseline);
		expect(consistency).toBe(0.8);
	});

	it("handles zero baseline gracefully", () => {
		const comparator = new ProviderComparator("anthropic");

		const baseline: ComparisonMetrics = {
			inputTokens: 1000,
			outputTokens: 300,
			estimatedCost: 0.001,
			responseTime: 2000,
			workPatternsCount: 0,  // zero patterns
			focusScore: 0.75,
			connectionsCount: 0,  // zero connections
		};

		const current: ComparisonMetrics = {
			inputTokens: 1000,
			outputTokens: 300,
			estimatedCost: 0.001,
			responseTime: 2000,
			workPatternsCount: 1,
			focusScore: 0.75,
			connectionsCount: 1,
		};

		const consistency = comparator.compareToBaseline(current, baseline);
		expect(consistency).toBeGreaterThanOrEqual(0);
		expect(consistency).toBeLessThanOrEqual(1);
	});
});

// ── Recommendation Tests ─────────────────────────────────────────────────

describe("ProviderComparator - Recommendations", () => {
	it("recommends Mock as baseline", () => {
		const comparator = new ProviderComparator("mock");

		const result: ComparisonResult = {
			provider: "mock",
			metrics: {
				inputTokens: 1000,
				outputTokens: 300,
				estimatedCost: 0,
				responseTime: 500,
				workPatternsCount: 2,
				focusScore: 0.75,
				connectionsCount: 1,
			},
			qualityScore: 0.75,
			privacyScore: 1.0,
			consistency: 1.0,
			recommendation: "",
		};

		result.recommendation = comparator.getRecommendation(result);

		expect(result.recommendation).toContain("Baseline for comparison");
	});

	it("recommends Local as testing/dev alternative", () => {
		const comparator = new ProviderComparator("local");

		const result: ComparisonResult = {
			provider: "local",
			metrics: {
				inputTokens: 1000,
				outputTokens: 300,
				estimatedCost: 0,
				responseTime: 5000,
				workPatternsCount: 2,
				focusScore: 0.75,
				connectionsCount: 1,
			},
			qualityScore: 0.72,
			privacyScore: 1.0,
			consistency: 0.95,
			recommendation: "",
		};

		result.recommendation = comparator.getRecommendation(result);

		expect(result.recommendation).toMatch(
			/(?:testing|dev|free|privacy|local)/i
		);
	});

	it("recommends Claude with quality comparison", () => {
		const comparator = new ProviderComparator("anthropic");

		const mockResult: ComparisonResult = {
			provider: "mock",
			metrics: {
				inputTokens: 1000,
				outputTokens: 300,
				estimatedCost: 0,
				responseTime: 500,
				workPatternsCount: 2,
				focusScore: 0.75,
				connectionsCount: 1,
			},
			qualityScore: 0.7,
			privacyScore: 1.0,
			consistency: 1.0,
			recommendation: "Baseline for comparison",
		};

		const claudeResult: ComparisonResult = {
			provider: "anthropic",
			metrics: {
				inputTokens: 1200,
				outputTokens: 350,
				estimatedCost: 0.00164,
				responseTime: 2000,
				workPatternsCount: 3,
				focusScore: 0.82,
				connectionsCount: 2,
			},
			qualityScore: 0.85,
			privacyScore: 1.0,
			consistency: 0.9,
			recommendation: "",
		};

		claudeResult.recommendation = comparator.getRecommendation(
			claudeResult,
			[mockResult]
		);

		expect(claudeResult.recommendation).toMatch(/(?:Best choice|quality)/i);
		expect(claudeResult.recommendation).toMatch(/\+\d+%/);  // should have +X% quality
		expect(claudeResult.recommendation).toMatch(/\$[\d.]+/);  // should have cost
	});
});
