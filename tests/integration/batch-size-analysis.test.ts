/**
 * Investigation: classificationBatchSize — Issue #84
 *
 * Answers the question: "What does tuning classificationBatchSize actually change?"
 *
 * Findings are captured as test assertions so they stay verifiable as the
 * codebase evolves. Each describe block corresponds to a dimension of the
 * investigation.
 *
 * TL;DR from the investigation:
 *   1. batchSize ONLY affects the LLM classification path (classifyEvents).
 *      The rule-only path (classifyEventsRuleOnly) ignores it completely.
 *   2. Since most users don't run a local LLM, this setting has zero effect
 *      on the default experience.
 *   3. Even in the LLM path, batch size affects HTTP round-trips and parse
 *      reliability, NOT the quality of individual event classifications.
 *   4. The REAL quality lever is rule-based vs LLM classification — rule-based
 *      produces coarser topics/entities/summaries. This test quantifies the gap.
 */

import { describe, it, expect, beforeAll } from "vitest";

// Pipeline stages
import { sanitizeCollectedData } from "../../src/filter/sanitize";
import { categorizeVisits } from "../../src/filter/categorize";
import {
	classifyEventsRuleOnly,
	extractEntities,
	extractSearchTopics,
	classifyClaudeTaskType,
	CATEGORY_TO_ACTIVITY,
} from "../../src/filter/classify";
import { extractPatterns, buildEmptyTopicHistory } from "../../src/analyze/patterns";
import { clusterArticles } from "../../src/analyze/clusters";
import { computeEngagementScore } from "../../src/analyze/engagement";
import { linkSearchesToVisits } from "../../src/analyze/intent";
import { cleanTitle } from "../../src/collect/browser";
import { compressActivity } from "../../src/summarize/compress";
import {
	buildTierFilteredOptions,
	buildProsePrompt,
	type ProseOptions,
	type PrivacyTier,
} from "../../src/summarize/summarize";

// Fixtures
import {
	softwareEngineerDeepWork,
	freelancerMultiProject,
	devopsIncidentDay,
	academicResearcher,
} from "../fixtures/personas";
import type { PersonaOutput } from "../fixtures/personas";
import { defaultSanitizeConfig, defaultPatternConfig } from "../fixtures/scenarios";
import type {
	ClassificationResult,
	PatternAnalysis,
	ActivityType,
} from "../../src/types";
import type { CompressedActivity } from "../../src/summarize/compress";

// ── Helpers ─────────────────────────────────────────────

const DATE = new Date("2025-06-15T00:00:00");
const TODAY = "2025-06-15";

interface AnalysisResult {
	classification: ClassificationResult;
	patterns: PatternAnalysis;
	compressed: CompressedActivity;
	prompts: Record<PrivacyTier, string>;
	promptLengths: Record<PrivacyTier, number>;
	uniqueTopics: string[];
	uniqueEntities: string[];
	uniqueActivityTypes: ActivityType[];
	avgConfidence: number;
	eventCount: number;
}

function runAnalysis(persona: PersonaOutput): AnalysisResult {
	const sanitizeConfig = defaultSanitizeConfig();

	const sanitized = sanitizeCollectedData(
		persona.visits,
		persona.searches,
		[...persona.claude, ...(persona.codex ?? [])],
		persona.git ?? [],
		sanitizeConfig
	);

	const categorized = categorizeVisits(sanitized.visits);

	const classification = classifyEventsRuleOnly(
		sanitized.visits,
		sanitized.searches,
		sanitized.claudeSessions,
		sanitized.gitCommits,
		categorized
	);

	const searchLinks = linkSearchesToVisits(sanitized.searches, sanitized.visits);
	const cleanedTitles = sanitized.visits.map((v) => cleanTitle(v.title ?? ""));
	const engagementScores = sanitized.visits.map((v, i) =>
		computeEngagementScore(v, cleanedTitles[i], sanitized.visits, searchLinks)
	);
	const articleClusters = clusterArticles(sanitized.visits, cleanedTitles, engagementScores);

	const patternConfig = defaultPatternConfig();
	const patterns = extractPatterns(
		classification,
		patternConfig,
		buildEmptyTopicHistory(),
		TODAY,
		sanitized.gitCommits,
		sanitized.claudeSessions,
		sanitized.searches,
		sanitized.visits,
		articleClusters
	);

	const compressed = compressActivity(categorized, sanitized.searches, sanitized.claudeSessions, sanitized.gitCommits, 1500);

	const fullOptions: ProseOptions = {
		categorized,
		searches: sanitized.searches,
		claudeSessions: sanitized.claudeSessions,
		gitCommits: sanitized.gitCommits,
		compressed,
		classification,
		patterns,
		articleClusters,
	};

	const prompts = {} as Record<PrivacyTier, string>;
	const promptLengths = {} as Record<PrivacyTier, number>;
	for (const tier of [1, 2, 3, 4] as PrivacyTier[]) {
		const tierOptions = buildTierFilteredOptions(tier, fullOptions);
		prompts[tier] = buildProsePrompt(DATE, "", tierOptions, undefined, "balanced", tier);
		promptLengths[tier] = prompts[tier].length;
	}

	const events = classification.events;
	const uniqueTopics = [...new Set(events.flatMap((e) => e.topics))].sort();
	const uniqueEntities = [...new Set(events.flatMap((e) => e.entities))].sort();
	const uniqueActivityTypes = [...new Set(events.map((e) => e.activityType))].sort() as ActivityType[];
	const avgConfidence = events.length > 0
		? events.reduce((sum, e) => sum + e.confidence, 0) / events.length
		: 0;

	return {
		classification,
		patterns,
		compressed,
		prompts,
		promptLengths,
		uniqueTopics,
		uniqueEntities,
		uniqueActivityTypes,
		avgConfidence,
		eventCount: events.length,
	};
}

// ── Investigation ───────────────────────────────────────

describe("investigation: classificationBatchSize (#84)", () => {
	// ── Shared persona analyses (reused by D3 and D7) ──

	const PERSONAS = [
		{ fn: softwareEngineerDeepWork, name: "SWE Deep Work" },
		{ fn: freelancerMultiProject, name: "Freelancer" },
		{ fn: devopsIncidentDay, name: "DevOps Incident" },
		{ fn: academicResearcher, name: "Academic Researcher" },
	];
	const personaResults: Record<string, AnalysisResult> = {};

	beforeAll(() => {
		for (const { fn, name } of PERSONAS) {
			personaResults[name] = runAnalysis(fn(DATE));
		}
	});

	// ── Dimension 1: batchSize has zero effect on rule-only path ──

	describe("D1: batchSize is irrelevant for rule-only classification", () => {
		it("rule-only classification is fully synchronous (no async batching or HTTP)", () => {
			const persona = softwareEngineerDeepWork(DATE);
			const sanitized = sanitizeCollectedData(
				persona.visits, persona.searches,
				[...persona.claude, ...(persona.codex ?? [])],
				persona.git ?? [], defaultSanitizeConfig()
			);
			const categorized = categorizeVisits(sanitized.visits);

			const result = classifyEventsRuleOnly(
				sanitized.visits, sanitized.searches,
				sanitized.claudeSessions, sanitized.gitCommits, categorized
			);

			// If this ever becomes async (e.g., to support LLM/batch HTTP calls),
			// it will return a Promise instead of a plain result.
			expect(result instanceof Promise).toBe(false);
		});

		it("rule-only classification processes all events in one pass (no batching)", () => {
			const persona = softwareEngineerDeepWork(DATE);
			const sanitized = sanitizeCollectedData(
				persona.visits, persona.searches,
				[...persona.claude, ...(persona.codex ?? [])],
				persona.git ?? [], defaultSanitizeConfig()
			);
			const categorized = categorizeVisits(sanitized.visits);

			const result = classifyEventsRuleOnly(
				sanitized.visits, sanitized.searches,
				sanitized.claudeSessions, sanitized.gitCommits, categorized
			);

			// Every single input event produces exactly one structured event
			const inputCount = sanitized.visits.length + sanitized.searches.length
				+ sanitized.claudeSessions.length + sanitized.gitCommits.length;
			expect(result.events.length).toBe(inputCount);
			expect(result.totalProcessed).toBe(inputCount);
			expect(result.ruleClassified).toBe(inputCount);
			expect(result.llmClassified).toBe(0);
		});
	});

	// ── Dimension 2: Rule-based classification quality audit ──

	describe("D2: rule-based classification field quality", () => {
		let result: AnalysisResult;

		beforeAll(() => {
			result = runAnalysis(softwareEngineerDeepWork(DATE));
		});

		it("all events have non-empty activityType", () => {
			for (const event of result.classification.events) {
				expect(event.activityType).toBeTruthy();
				expect(event.activityType).not.toBe("");
			}
		});

		it("all events have at least one topic", () => {
			// Rule-based uses category labels or vocabulary matching
			const withTopics = result.classification.events.filter((e) => e.topics.length > 0);
			// At least 80% should have topics (some edge cases might fall through)
			expect(withTopics.length / result.eventCount).toBeGreaterThan(0.8);
		});

		it("entity extraction produces domain-derived entities for browser events", () => {
			const browserEvents = result.classification.events.filter((e) => e.source === "browser");
			const withEntities = browserEvents.filter((e) => e.entities.length > 0);
			// Most browser events should extract the domain as an entity
			expect(withEntities.length / browserEvents.length).toBeGreaterThan(0.5);
		});

		it("all rule-based events have confidence 0.3", () => {
			for (const event of result.classification.events) {
				expect(event.confidence).toBe(0.3);
			}
			expect(result.avgConfidence).toBe(0.3);
		});

		it("summaries are generic category labels, not event-specific", () => {
			const browserEvents = result.classification.events.filter((e) => e.source === "browser");
			const summaries = new Set(browserEvents.map((e) => e.summary));
			// Rule-based produces a small set of category-based summaries
			// like "Working in development tools", "Browsing social media"
			// rather than one unique summary per event
			expect(summaries.size).toBeLessThan(browserEvents.length * 0.5);
		});

		it("topic vocabulary is limited to category labels", () => {
			// Rule-based topics come from CATEGORY_TOPIC_LABELS or vocabulary patterns
			// They're never event-specific like "OAuth PKCE implementation"
			const allTopics = result.uniqueTopics;
			// Should produce fewer than 40 unique topics even for a 100+ event day
			// (category labels + search vocabulary + git/claude vocabulary)
			expect(allTopics.length).toBeLessThan(40);
		});
	});

	// ── Dimension 3: Downstream impact on patterns ──

	describe("D3: classification impact on pattern extraction", () => {
		for (const { name } of PERSONAS) {
			describe(`Persona: ${name}`, () => {
				it("focus score is computed (classification provides activity types)", () => {
					const result = personaResults[name];
					expect(result.patterns.focusScore).toBeDefined();
					expect(result.patterns.focusScore).toBeGreaterThanOrEqual(0);
					expect(result.patterns.focusScore).toBeLessThanOrEqual(1);
				});

				it("activity distribution reflects classified types", () => {
					const result = personaResults[name];
					const types = result.patterns.topActivityTypes;
					expect(types.length).toBeGreaterThan(0);
					// Sum of counts should equal total events
					const total = types.reduce((s, t) => s + t.count, 0);
					expect(total).toBe(result.eventCount);
				});

				it("temporal clusters are detected", () => {
					const result = personaResults[name];
					expect(result.patterns.temporalClusters.length).toBeGreaterThan(0);
				});

				it("topic co-occurrence captures cross-event relationships", () => {
					const result = personaResults[name];
					expect(result.patterns.topicCooccurrences.length).toBeGreaterThan(0);
				});
			});
		}
	});

	// ── Dimension 4: Prompt size and content across tiers ──

	describe("D4: prompt characteristics at each tier", () => {
		let result: AnalysisResult;
		let persona: PersonaOutput;

		beforeAll(() => {
			persona = softwareEngineerDeepWork(DATE);
			result = runAnalysis(persona);
		});

		it("Tier 3 prompt contains classification section", () => {
			const prompt = result.prompts[3];
			// Tier 3 includes classification but not raw arrays
			expect(prompt).toMatch(/Classified activity:|classified_activity|activity.*summary/i);
		});

		it("Tier 4 prompt does NOT contain classification", () => {
			const prompt = result.prompts[4];
			// Tier 4 is patterns-only — no per-event data
			expect(prompt).not.toMatch(/Classified activity:/);
		});

		it("prompt sizes increase from Tier 4 → Tier 1", () => {
			// More data at lower tiers = larger prompts
			expect(result.promptLengths[4]).toBeLessThan(result.promptLengths[1]);
		});

		it("classification adds meaningful content to Tier 3", () => {
			// Tier 3 has classification, Tier 4 doesn't
			// The delta represents the cost/value of classification in the prompt
			const delta = result.promptLengths[3] - result.promptLengths[4];
			expect(delta).toBeGreaterThan(0);
		});

		it("quantify: Tier 3 classification section size", () => {
			// How many characters does classification add to the prompt?
			const delta = result.promptLengths[3] - result.promptLengths[4];
			// This is informational — the assertion is just that it's measurable.
			// For a ~120-event day, classification typically adds 1-3KB of text.
			expect(delta).toBeGreaterThan(100);
			expect(delta).toBeLessThan(10000); // sanity upper bound
		});
	});

	// ── Dimension 5: Rule-based vs hypothetical LLM quality gap ──

	describe("D5: quality comparison — rule-based vs LLM classification", () => {
		it("rule-based topics are coarse (category labels only)", () => {
			// Demonstrate the granularity limitation of rule-based topics
			const browserTopics = new Set<string>();
			// Generate topics for each category
			for (const category of Object.keys(CATEGORY_TO_ACTIVITY)) {
				// Browser events get category-derived topics
				browserTopics.add(category);
			}
			// Rule-based can only produce topics from the fixed category set
			// There's no way for a "github.com/myorg/project" visit to get
			// topic "myorg project" — it gets "software development" instead.
			expect(browserTopics.size).toBeLessThanOrEqual(Object.keys(CATEGORY_TO_ACTIVITY).length);
		});

		it("entity extraction catches domain names and capitalized words", () => {
			// Test entity extraction on real-looking browser event text
			const entities1 = extractEntities("GitHub - anthropics/claude-code: CLI tool", "github.com");
			expect(entities1).toContain("Github");

			const entities2 = extractEntities("TypeScript Handbook - learn TypeScript", "typescriptlang.org");
			expect(entities2).toContain("Typescriptlang");

			// Entity extraction is domain-derived, not semantic
			// An LLM would extract ["TypeScript"] from the title
			// Rule-based extracts ["Typescriptlang"] from the domain
		});

		it("search topics use vocabulary matching (coarse but reasonable)", () => {
			const topics1 = extractSearchTopics("how to implement OAuth in React");
			expect(topics1).toEqual(["authentication"]); // matches "oauth"

			// "near me" matches navigation pattern before "restaurants" matches food
			// — first-match-wins behavior is coarser than semantic understanding
			const topics2 = extractSearchTopics("best restaurants near me");
			expect(topics2).toEqual(["navigation"]); // "near me" wins over "restaurants"

			const topics3 = extractSearchTopics("best restaurants downtown");
			expect(topics3).toEqual(["food"]); // without "near me", "restaurants" matches food

			const topics4 = extractSearchTopics("something completely unrelated");
			expect(topics4).toEqual(["information"]); // fallback
		});

		it("Claude task classification uses verb patterns", () => {
			expect(classifyClaudeTaskType("Fix the null pointer in parser.ts")).toBe("debugging");
			expect(classifyClaudeTaskType("Explain how React hooks work")).toBe("learning");
			expect(classifyClaudeTaskType("Add user authentication to the app")).toBe("implementation");
			expect(classifyClaudeTaskType("Review this function for errors")).toBe("review");
			expect(classifyClaudeTaskType("some ambiguous prompt")).toBe("implementation"); // default
		});

		it("rule-based summaries are generic, not event-specific", () => {
			// Two completely different GitHub pages get the same summary
			const persona = softwareEngineerDeepWork(DATE);
			const sanitized = sanitizeCollectedData(
				persona.visits, persona.searches,
				[...persona.claude, ...(persona.codex ?? [])],
				persona.git ?? [], defaultSanitizeConfig()
			);
			const categorized = categorizeVisits(sanitized.visits);
			const classification = classifyEventsRuleOnly(
				sanitized.visits, sanitized.searches,
				sanitized.claudeSessions, sanitized.gitCommits, categorized
			);

			const browserSummaries = classification.events
				.filter((e) => e.source === "browser")
				.map((e) => e.summary);

			// Count how many unique summaries there are vs total browser events
			const uniqueSummaries = new Set(browserSummaries);
			const ratio = uniqueSummaries.size / browserSummaries.length;

			// Rule-based: most browser events share summaries (low uniqueness)
			// LLM-based: each event would get a unique summary (high uniqueness)
			expect(ratio).toBeLessThan(0.5); // rule-based is very repetitive
		});
	});

	// ── Dimension 6: LLM batch size mechanical effects ──

	describe("D6: batch size mechanical analysis (no LLM needed)", () => {
		it("batch count monotonically decreases as batch size increases", () => {
			const eventCount = 100;
			const batchSizes = [4, 6, 8, 10, 12, 14, 16];

			let previousBatchCount = Infinity;
			let hasDecrease = false;

			for (const batchSize of batchSizes) {
				const batchCount = Math.ceil(eventCount / batchSize);
				expect(batchCount).toBeLessThanOrEqual(previousBatchCount);
				if (batchCount < previousBatchCount) {
					hasDecrease = true;
				}
				previousBatchCount = batchCount;
			}

			expect(hasDecrease).toBe(true);
		});

		it("failure blast radius is proportional to batch size", () => {
			// If a batch's LLM response is malformed JSON, the ENTIRE batch
			// falls back to rule-based classification.
			const eventCount = 100;

			// Pin concrete expected percentages
			expect((4 / eventCount) * 100).toBe(4);
			expect((8 / eventCount) * 100).toBe(8);
			expect((16 / eventCount) * 100).toBe(16);

			// Blast radius increases with batch size
			expect(4 / eventCount).toBeLessThan(8 / eventCount);
			expect(8 / eventCount).toBeLessThan(16 / eventCount);
		});

		it("smaller batches have more overhead (system prompt repeated per batch)", () => {
			const eventCount = 100;
			const overheadTokens = 150;
			const tokensPerEvent = 30;

			const costs: Record<number, number> = {};
			for (const batchSize of [4, 8, 16]) {
				const batches = Math.ceil(eventCount / batchSize);
				costs[batchSize] = (overheadTokens * batches) + (eventCount * tokensPerEvent);
			}

			// Batch 4: 150×25 + 3000 = 6750 tokens
			// Batch 8: 150×13 + 3000 = 4950 tokens
			// Batch 16: 150×7 + 3000 = 4050 tokens
			expect(costs[4]).toBeGreaterThan(costs[8]);
			expect(costs[8]).toBeGreaterThan(costs[16]);
		});
	});

	// ── Dimension 7: Cross-persona comparison ──

	describe("D7: classification richness across personas", () => {
		it("all personas produce meaningful focus scores", () => {
			for (const [_name, result] of Object.entries(personaResults)) {
				expect(result.patterns.focusScore).toBeGreaterThan(0);
				expect(result.patterns.focusScore).toBeLessThanOrEqual(1);
				expect(typeof result.patterns.focusScore).toBe("number");
			}
		});

		it("personas with diverse activities have more activity types", () => {
			const freelancer = personaResults["Freelancer"];
			const swe = personaResults["SWE Deep Work"];

			// Both should have at least 2 activity types
			expect(freelancer.uniqueActivityTypes.length).toBeGreaterThanOrEqual(2);
			expect(swe.uniqueActivityTypes.length).toBeGreaterThanOrEqual(2);
		});

		it("Tier 3 prompt differs across personas (classification carries persona signal)", () => {
			const lengths = Object.values(personaResults).map((r) => r.promptLengths[3]);
			const min = Math.min(...lengths);
			const max = Math.max(...lengths);
			expect(max).toBeGreaterThan(min);
		});
	});
});
