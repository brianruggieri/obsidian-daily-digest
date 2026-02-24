/**
 * AI Evaluation: Summary Quality
 *
 * Uses LLM-as-judge to evaluate the quality of AI-generated summaries.
 * Tests whether the summarization prompts produce meaningful, accurate,
 * and well-structured output when processed by an AI model.
 *
 * Run: DAILY_DIGEST_AI_EVAL=true npx vitest run tests/eval/summary-quality.eval.ts
 */

import { describe, it, expect } from "vitest";
import { buildClassifiedPrompt, buildDeidentifiedPrompt } from "../../src/summarize";
import { categorizeVisits } from "../../src/filter/categorize";
import { classifyEventsRuleOnly } from "../../src/filter/classify";
import { extractPatterns, buildEmptyTopicHistory } from "../../src/patterns";
import { sanitizeCollectedData } from "../../src/filter/sanitize";
import { fullStackDeveloper, researchKnowledgeWorker, scatteredContextSwitcher } from "../fixtures/personas";
import { defaultSanitizeConfig, defaultPatternConfig } from "../fixtures/scenarios";
import {
	skipIfNoAI,
	evaluateWithRubric,
	evaluateMultiCriteria,
	evaluateContainment,
	RubricCriterion,
} from "./eval-helpers";

const DATE = new Date("2025-06-15T00:00:00");
const TODAY = "2025-06-15";

// Build classified prompt from persona
function buildPersonaClassifiedPrompt(personaFn: (d?: Date) => ReturnType<typeof fullStackDeveloper>) {
	const persona = personaFn(DATE);
	const sanitized = sanitizeCollectedData(
		persona.visits, persona.searches, [...persona.claude, ...(persona.codex ?? [])], [],
		defaultSanitizeConfig()
	);
	const categorized = categorizeVisits(sanitized.visits);
	const classification = classifyEventsRuleOnly(
		sanitized.visits, sanitized.searches, sanitized.claudeSessions, sanitized.gitCommits,
		categorized
	);
	return {
		prompt: buildClassifiedPrompt(DATE, classification, ""),
		persona,
		classification,
	};
}

// Build deidentified prompt from persona
function buildPersonaDeidentifiedPrompt(personaFn: (d?: Date) => ReturnType<typeof fullStackDeveloper>) {
	const persona = personaFn(DATE);
	const sanitized = sanitizeCollectedData(
		persona.visits, persona.searches, [...persona.claude, ...(persona.codex ?? [])], [],
		defaultSanitizeConfig()
	);
	const categorized = categorizeVisits(sanitized.visits);
	const classification = classifyEventsRuleOnly(
		sanitized.visits, sanitized.searches, sanitized.claudeSessions, sanitized.gitCommits,
		categorized
	);
	const patterns = extractPatterns(
		classification, defaultPatternConfig(), buildEmptyTopicHistory(), TODAY
	);
	return {
		prompt: buildDeidentifiedPrompt(DATE, patterns, ""),
		persona,
		patterns,
	};
}

describe("summary quality evaluation", () => {
	const SKIP = skipIfNoAI();

	// ── Classified Prompt Structure ──────────────────────────

	describe("classified prompt structure", () => {
		it.skipIf(SKIP)("full-stack developer prompt is well-structured for AI consumption", async () => {
			const { prompt, classification: _classification } = buildPersonaClassifiedPrompt(fullStackDeveloper);

			const result = await evaluateWithRubric(
				prompt,
				`This is a prompt that will be sent to an AI model to generate a daily activity summary.
Evaluate whether the prompt:
1. Clearly identifies the date and purpose
2. Organizes activities by type with topics and entities
3. Includes concrete event summaries (not just counts)
4. Requests a specific JSON output format
5. Provides enough context for a meaningful summary
6. Does NOT contain raw URLs, shell commands, or file paths`,
				0.7
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.6);
		}, 30000);

		it.skipIf(SKIP)("research worker prompt captures research depth", async () => {
			const { prompt } = buildPersonaClassifiedPrompt(researchKnowledgeWorker);

			const result = await evaluateContainment(
				prompt,
				[
					"Activity organized by type (research, writing, learning, etc.)",
					"Topics related to distributed systems or consensus or technical content",
					"Entity references to tools or platforms used",
					"Event summaries describing research activities",
					"JSON output format specification",
				],
				0.6
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.5);
		}, 30000);

		it.skipIf(SKIP)("scattered context-switcher prompt reflects diversity", async () => {
			const { prompt, classification: _classification } = buildPersonaClassifiedPrompt(scatteredContextSwitcher);

			const result = await evaluateWithRubric(
				prompt,
				`This prompt should reflect a scattered, context-switching workday.
Evaluate whether:
1. Multiple distinct activity types are represented (not just one or two)
2. Topics span diverse areas (not focused on one domain)
3. The prompt contains enough variety to produce a meaningful "scattered day" summary
4. At least 3 different activity types appear`,
				0.6
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.5);
		}, 30000);
	});

	// ── Deidentified Prompt Quality ─────────────────────────

	describe("deidentified prompt quality", () => {
		it.skipIf(SKIP)("deidentified prompt provides rich pattern context", async () => {
			const { prompt, patterns: _patterns } = buildPersonaDeidentifiedPrompt(fullStackDeveloper);

			const criteria: RubricCriterion[] = [
				{
					name: "statistical_richness",
					description: "Contains meaningful statistics: activity distributions, focus score, peak hours, cluster counts",
					weight: 0.3,
				},
				{
					name: "pattern_context",
					description: "Includes temporal clusters, topic connections, entity relationships — enough context for cognitive analysis",
					weight: 0.3,
				},
				{
					name: "privacy_preservation",
					description: "Contains NO raw URLs, NO individual event details, NO shell commands, NO search queries — only aggregated patterns",
					weight: 0.25,
				},
				{
					name: "actionable_request",
					description: "Requests specific meta-insights (cognitive patterns, quirky signals, focus narrative) with a clear JSON format",
					weight: 0.15,
				},
			];

			const result = await evaluateMultiCriteria(prompt, criteria, 0.65);

			console.log(`  Overall: ${result.overall.score.toFixed(2)}`);
			for (const [name, score] of Object.entries(result.criteria)) {
				console.log(`    ${name}: ${score.score.toFixed(2)} — ${score.reasoning}`);
			}

			expect(result.overall.score).toBeGreaterThanOrEqual(0.55);
		}, 45000);

		it.skipIf(SKIP)("deidentified prompt requests meta-level analysis", async () => {
			const { prompt } = buildPersonaDeidentifiedPrompt(researchKnowledgeWorker);

			const result = await evaluateContainment(
				prompt,
				[
					"Requests meta_insights about cognitive patterns",
					"Asks for quirky_signals or unusual observations",
					"Requests a focus_narrative describing the day's shape",
					"Mentions cross-pollination or unformalized knowledge",
					"Positions the AI as a cognitive pattern analyst, not a task tracker",
				],
				0.7
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.6);
		}, 30000);
	});

	// ── Cross-Persona Consistency ───────────────────────────

	describe("cross-persona prompt differentiation", () => {
		it.skipIf(SKIP)("different personas produce meaningfully different prompts", async () => {
			const dev = buildPersonaClassifiedPrompt(fullStackDeveloper);
			const researcher = buildPersonaClassifiedPrompt(researchKnowledgeWorker);
			const scattered = buildPersonaClassifiedPrompt(scatteredContextSwitcher);

			const combinedInput = `
## Prompt A (Full-Stack Developer):
${dev.prompt.slice(0, 1500)}

## Prompt B (Research Knowledge Worker):
${researcher.prompt.slice(0, 1500)}

## Prompt C (Scattered Context-Switcher):
${scattered.prompt.slice(0, 1500)}
`;

			const result = await evaluateWithRubric(
				combinedInput,
				`These are three prompts generated from different user personas.
Evaluate whether:
1. The three prompts are meaningfully DIFFERENT from each other (not cookie-cutter)
2. Prompt A reflects developer/implementation activities
3. Prompt B reflects research/writing activities
4. Prompt C reflects scattered/diverse activities
5. Each prompt's activity types and topics are distinct
Score highly if the prompts clearly differentiate the three work styles.`,
				0.6
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.5);
		}, 45000);
	});
});
