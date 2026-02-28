/**
 * Tier-aware prose prompting — unit tests for resolvePrivacyTier and
 * buildTierFilteredOptions (Issue #45).
 *
 * These tests verify that the single-prose strategy's data filtering
 * correctly restricts which layers reach the LLM based on the resolved tier.
 */

import { describe, it, expect } from "vitest";
import {
	resolvePrivacyTier,
	buildTierFilteredOptions,
} from "../../src/summarize/summarize";
import type { AICallConfig } from "../../src/summarize/ai-client";
import type { ClassificationResult, PatternAnalysis, RAGConfig } from "../../src/types";

// ── Fixtures ─────────────────────────────────────────────

const anthropicConfig: AICallConfig = {
	provider: "anthropic",
	anthropicApiKey: "test-key",
	anthropicModel: "claude-sonnet-4-6",
	localEndpoint: "",
	localModel: "",
};

const localConfig: AICallConfig = {
	provider: "local",
	anthropicApiKey: "",
	anthropicModel: "",
	localEndpoint: "http://localhost:11434",
	localModel: "qwen2.5:7b",
};

const mockClassification = { events: [{ activityType: "browsing", summary: "test", topics: [], entities: [], source: "browser", sentiment: "neutral" as const }] } as ClassificationResult;
const mockPatterns = { focusScore: 0.7, temporalClusters: [], topActivityTypes: [], topicCooccurrence: [], entityClusters: [], recurrenceSignals: [], commitWorkUnits: [], claudeTaskSessions: [], knowledgeDelta: "" } as unknown as PatternAnalysis;
const mockRAGConfig: RAGConfig = { enabled: true, embeddingEndpoint: "", embeddingModel: "", topK: 5 };

const fullOptions = {
	categorized: { dev: [] },
	searches: [{ query: "test", engine: "google", time: new Date() }],
	claudeSessions: [],
	gitCommits: [],
	compressed: { browserText: "b", searchText: "s", claudeText: "c", gitText: "g", totalEvents: 10 } as import("../../src/summarize/compress").CompressedActivity,
	classification: mockClassification,
	patterns: mockPatterns,
	articleClusters: [],
};

// ── resolvePrivacyTier ───────────────────────────────────

describe("resolvePrivacyTier", () => {
	it("returns 4 when patterns available + anthropic", () => {
		expect(resolvePrivacyTier(anthropicConfig, mockClassification, mockPatterns)).toBe(4);
	});

	it("returns 3 when classification available but no patterns + anthropic", () => {
		expect(resolvePrivacyTier(anthropicConfig, mockClassification, undefined)).toBe(3);
	});

	it("returns 2 when RAG enabled + anthropic + no classification/patterns", () => {
		expect(resolvePrivacyTier(anthropicConfig, undefined, undefined, mockRAGConfig)).toBe(2);
	});

	it("returns 1 when nothing available + anthropic", () => {
		expect(resolvePrivacyTier(anthropicConfig, undefined, undefined, undefined)).toBe(1);
	});

	it("returns 1 for local provider regardless of patterns", () => {
		expect(resolvePrivacyTier(localConfig, mockClassification, mockPatterns)).toBe(1);
	});

	it("honours explicit override over auto-escalation", () => {
		expect(resolvePrivacyTier(anthropicConfig, mockClassification, mockPatterns, undefined, 2)).toBe(2);
	});

	it("ignores null override and falls through to auto-escalation", () => {
		expect(resolvePrivacyTier(anthropicConfig, mockClassification, mockPatterns, undefined, null)).toBe(4);
	});
});

// ── buildTierFilteredOptions ─────────────────────────────

describe("buildTierFilteredOptions — tier 4 (stats only)", () => {
	const result = buildTierFilteredOptions(4, fullOptions);

	it("includes patterns", () => {
		expect(result.patterns).toBeDefined();
	});

	it("includes articleClusters", () => {
		expect(result.articleClusters).toBeDefined();
	});

	it("excludes categorized (raw browser data)", () => {
		expect(result.categorized).toBeUndefined();
	});

	it("excludes searches", () => {
		expect(result.searches).toBeUndefined();
	});

	it("excludes claudeSessions", () => {
		expect(result.claudeSessions).toBeUndefined();
	});

	it("excludes gitCommits", () => {
		expect(result.gitCommits).toBeUndefined();
	});

	it("excludes compressed (raw text)", () => {
		expect(result.compressed).toBeUndefined();
	});

	it("excludes classification (per-event details)", () => {
		expect(result.classification).toBeUndefined();
	});
});

describe("buildTierFilteredOptions — tier 3 (classified abstractions)", () => {
	const result = buildTierFilteredOptions(3, fullOptions);

	it("includes classification", () => {
		expect(result.classification).toBeDefined();
	});

	it("includes patterns", () => {
		expect(result.patterns).toBeDefined();
	});

	it("includes articleClusters", () => {
		expect(result.articleClusters).toBeDefined();
	});

	it("excludes categorized (raw domains)", () => {
		expect(result.categorized).toBeUndefined();
	});

	it("excludes compressed (raw text)", () => {
		expect(result.compressed).toBeUndefined();
	});

	it("excludes searches", () => {
		expect(result.searches).toBeUndefined();
	});

	it("excludes gitCommits", () => {
		expect(result.gitCommits).toBeUndefined();
	});
});

describe("buildTierFilteredOptions — tier 2 (RAG chunks)", () => {
	const result = buildTierFilteredOptions(2, fullOptions);

	it("includes compressed (RAG-selected content)", () => {
		expect(result.compressed).toBeDefined();
	});

	it("includes classification", () => {
		expect(result.classification).toBeDefined();
	});

	it("includes patterns", () => {
		expect(result.patterns).toBeDefined();
	});

	it("excludes full categorized visits", () => {
		expect(result.categorized).toBeUndefined();
	});

	it("excludes raw searches", () => {
		expect(result.searches).toBeUndefined();
	});
});

describe("buildTierFilteredOptions — tier 1 (full context)", () => {
	const result = buildTierFilteredOptions(1, fullOptions);

	it("passes through all fields unchanged", () => {
		expect(result).toEqual(fullOptions);
	});
});
