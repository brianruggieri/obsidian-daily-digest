/**
 * Digest Quality — LLM-as-Judge Evaluation Suite
 *
 * Uses a Claude judge model to score rendered daily notes against six quality
 * criteria. Complements the deterministic checks in digest-quality-deterministic.eval.ts
 * by catching problems that rule-based checks cannot: generic-sounding prose,
 * low-signal callouts, misleading summaries, and template-like repetition.
 *
 * ── Gating ──────────────────────────────────────────────────────────────────
 * Gated behind DAILY_DIGEST_AI_EVAL=true to avoid accidental API spend.
 * Requires ANTHROPIC_API_KEY in environment or .env.
 *
 * ── Run commands ────────────────────────────────────────────────────────────
 *
 *   # Full suite (~15 personas × 2 modes + cross-persona = ~30 judge calls)
 *   DAILY_DIGEST_AI_EVAL=true npx vitest run tests/eval/digest-quality.eval.ts
 *
 *   # Single persona (faster iteration)
 *   DAILY_DIGEST_AI_EVAL=true npx vitest run tests/eval/digest-quality.eval.ts \
 *     -t "Software Engineer"
 *
 *   # No-AI mode only
 *   DAILY_DIGEST_AI_EVAL=true npx vitest run tests/eval/digest-quality.eval.ts \
 *     -t "LLM judge (no-AI mode)"
 *
 * ── Scoring ─────────────────────────────────────────────────────────────────
 * Each criterion is scored 0.0–1.0 by the judge. Weighted average must reach
 * the threshold (currently 0.5) to pass. This is a low bar — failing means
 * something is badly broken, not just suboptimal.
 *
 *   0.0–0.3  Broken: content is missing, fabricated, or unreadable
 *   0.4–0.6  Marginal: usable but needs attention
 *   0.7–0.9  Good: solid, minor quibbles
 *   1.0      Excellent: hard to improve
 *
 * ── Best Use Cases ───────────────────────────────────────────────────────────
 *
 * 1. AFTER RENDERER CHANGES
 *    When renderer.ts sections are added, reordered, or reformatted, run this
 *    suite to verify the three-layer structure (10-second glance → curated
 *    insights → archive) remains coherent and the note is still scannable.
 *    Key criterion: page_flow.
 *
 * 2. AFTER AI SUMMARY FIELD CHANGES
 *    When AISummary gains/loses fields (work_story, notable, learnings, etc.)
 *    or when prompt templates change, run AI-on mode to verify the populated
 *    note is not repetitive and each section earns its screen space.
 *    Key criterion: repetitiveness.
 *
 * 3. AFTER KNOWLEDGE SECTION CHANGES
 *    When patterns.ts or knowledge.ts logic changes (clusters, topic maps,
 *    recurrence), run no-AI mode to verify the knowledge callouts still
 *    communicate useful information rather than raw data dumps.
 *    Key criteria: clarity, completeness.
 *
 * 4. PERSONA DIFFERENTIATION SPOT-CHECK
 *    Run the cross-persona suite after adding new personas or changing how
 *    fixture data is generated.  Ensures the three chosen personas produce
 *    visibly different notes — guards against fixtures that are too similar
 *    or rendering that ignores persona-specific data.
 *
 * 5. PRE-RELEASE QUALITY GATE
 *    Run the full suite before cutting a release to catch any regressions in
 *    overall note quality.  Combined with privacy-audit.eval.ts, this gives
 *    confidence that the plugin produces useful, honest, non-leaking notes.
 *
 * 6. PROMPT TEMPLATE TUNING
 *    When iterating on prompt-templates/ files, run AI-on mode with a single
 *    persona to quickly compare before/after quality without running the full
 *    matrix.  The per-criterion breakdown in console output pinpoints exactly
 *    which aspect (clarity, honesty, page_flow, etc.) changed.
 *
 * ── Criteria Weights ────────────────────────────────────────────────────────
 *   readability     0.20 — 10-second scannability, data density
 *   clarity         0.20 — sections serve clear purposes, callout types match
 *   repetitiveness  0.15 — no content repeated across sections (higher = less repetitive)
 *   honesty         0.15 — stats and content match input data
 *   completeness    0.15 — all data sources represented
 *   page_flow       0.15 — logical reading order, three-layer structure evident
 *
 * ── Related eval suites ──────────────────────────────────────────────────────
 *   digest-quality-deterministic.eval.ts  — rule-based structural checks (free, fast)
 *   privacy-audit.eval.ts                 — judge verifies no PII leaks to Anthropic tier
 *   summary-quality.eval.ts               — judges prose quality of AI-generated fields
 *   prompt-safety.eval.ts                 — prompt injection resistance
 */

import { describe, it, expect } from "vitest";
import { ALL_PERSONAS } from "../fixtures/personas";
import { renderForPersona } from "./digest-quality-helpers";
import {
	skipIfNoAI,
	evaluateMultiCriteria,
	evaluateWithRubric,
	type RubricCriterion,
} from "./eval-helpers";

const SKIP = skipIfNoAI();

// ── Quality Criteria ────────────────────────────────────────

const DIGEST_QUALITY_CRITERIA: RubricCriterion[] = [
	{
		name: "readability",
		weight: 0.20,
		description:
			"Is the note scannable in 10 seconds? Layer 1 gives a clear " +
			"overview. Collapsed callouts have descriptive titles. Data density is " +
			"appropriate — not a wall of text.",
	},
	{
		name: "repetitiveness",
		weight: 0.15,
		description:
			"Does the same information appear in multiple sections? The " +
			"headline should not repeat the work_story verbatim. Notable should not " +
			"duplicate category summaries. Knowledge insights should not restate " +
			"raw data. Score HIGH (close to 1.0) when content is NOT repetitive.",
	},
	{
		name: "clarity",
		weight: 0.20,
		description:
			"Does each section serve a clear purpose? Section labels " +
			"match their content. Callout types are semantically appropriate " +
			"([!todo] for actionables, [!info] for reference, [!tip] for seeds). " +
			"No confusing or misleading section titles.",
	},
	{
		name: "honesty",
		weight: 0.15,
		description:
			"Does the note faithfully represent the input data? No " +
			"fabricated items, no inflated counts, no misleading summaries. Stats " +
			"line matches actual data. Categories match actual visits.",
	},
	{
		name: "completeness",
		weight: 0.15,
		description:
			"Are all input data sources represented? Browser visits, " +
			"searches, Claude sessions, git commits each have corresponding " +
			"sections. No source type silently dropped. Knowledge sections present " +
			"when patterns are available.",
	},
	{
		name: "page_flow",
		weight: 0.15,
		description:
			"Does the note follow a logical reading order? High-level " +
			"summary first, then curated insights, then raw data archive. The " +
			"three-layer structure is evident. Notes section is at the end for " +
			"user authoring.",
	},
];

// ══════════════════════════════════════════════════════════════
// Per-Persona No-AI Mode
//
// Runs the full pipeline (sanitize → categorize → patterns →
// knowledge → render) WITHOUT an AI summary for every persona.
// Validates that the static layout — knowledge callouts, browser
// activity sections, git/Claude archives — is clear and complete
// on its own. If this fails, the issue is in the renderer or
// knowledge generator, not in prompt templates.
// ══════════════════════════════════════════════════════════════

describe("digest quality — LLM judge (no-AI mode)", () => {
	for (const personaFn of ALL_PERSONAS) {
		const result = renderForPersona(personaFn);

		it.skipIf(SKIP)(
			`${result.persona.name} scores >= 0.5 overall`,
			async () => {
				const evalResult = await evaluateMultiCriteria(
					result.markdown.slice(0, 4000),
					DIGEST_QUALITY_CRITERIA,
					0.5
				);

				console.log(`\n  Persona: ${result.persona.name}`);
				console.log(`  Overall: ${evalResult.overall.score.toFixed(2)}`);
				for (const [name, score] of Object.entries(evalResult.criteria)) {
					console.log(`    ${name}: ${score.score.toFixed(2)} — ${score.reasoning}`);
				}

				expect(evalResult.overall.score).toBeGreaterThanOrEqual(0.5);
			},
			60000
		);
	}
});

// ══════════════════════════════════════════════════════════════
// AI-On Mode (3 representative personas)
//
// Injects a deterministic mock AI summary (getMockSummary("ai-on"))
// so the full three-layer layout is populated — headline, work_story,
// work patterns, cognitive patterns, learnings, note seeds, reflection.
// Uses only 3 personas to limit judge cost while still covering dev,
// research, and writing archetypes.
//
// If this fails but no-AI mode passes, the issue is in how the
// renderer integrates AI summary fields (repetition, redundancy).
// ══════════════════════════════════════════════════════════════

describe("digest quality — LLM judge (AI-on mode)", () => {
	const AI_PERSONAS = ALL_PERSONAS.slice(0, 3);

	for (const personaFn of AI_PERSONAS) {
		const result = renderForPersona(personaFn, { withAI: true });

		it.skipIf(SKIP)(
			`AI-on: ${result.persona.name} scores >= 0.5 overall`,
			async () => {
				const evalResult = await evaluateMultiCriteria(
					result.markdown.slice(0, 5000),
					DIGEST_QUALITY_CRITERIA,
					0.5
				);

				console.log(`\n  Persona (AI-on): ${result.persona.name}`);
				console.log(`  Overall: ${evalResult.overall.score.toFixed(2)}`);
				for (const [name, score] of Object.entries(evalResult.criteria)) {
					console.log(`    ${name}: ${score.score.toFixed(2)} — ${score.reasoning}`);
				}

				expect(evalResult.overall.score).toBeGreaterThanOrEqual(0.5);
			},
			60000
		);
	}
});

// ══════════════════════════════════════════════════════════════
// Cross-Persona Differentiation
//
// Single judge call comparing three maximally-different personas:
// Software Engineer (heavy git/dev), Academic Researcher (heavy
// research/searches), Content Writer (writing/social/media).
//
// Guards against two failure modes:
//   a) Fixtures that are too similar — personas generate nearly
//      identical browser visits despite different job descriptions.
//   b) Renderer that ignores persona data — all notes look like
//      the same boilerplate regardless of input.
//
// Run this after adding personas or changing fixture generators.
// ══════════════════════════════════════════════════════════════

describe("digest quality — cross-persona differentiation", () => {
	it.skipIf(SKIP)(
		"rendered notes look meaningfully different across personas",
		async () => {
			// Pick 3 maximally different personas: dev, researcher, writer
			const devResult = renderForPersona(ALL_PERSONAS[0]);      // Software Engineer
			const researchResult = renderForPersona(ALL_PERSONAS[1]); // Academic Researcher
			const writerResult = renderForPersona(ALL_PERSONAS[6]);   // Content Writer

			const combined = [
				`=== NOTE A: ${devResult.persona.name} ===\n${devResult.markdown.slice(0, 2500)}`,
				`=== NOTE B: ${researchResult.persona.name} ===\n${researchResult.markdown.slice(0, 2500)}`,
				`=== NOTE C: ${writerResult.persona.name} ===\n${writerResult.markdown.slice(0, 2500)}`,
			].join("\n\n");

			const evalResult = await evaluateWithRubric(
				combined,
				`These are three daily digest notes for three different personas. Evaluate whether they are meaningfully different:
1. Do the notes reflect different types of workdays (engineering vs research vs writing)?
2. Are the statistics different (visit counts, searches, AI prompts, commits)?
3. Do the Knowledge Insights sections surface different topics?
4. Would a reader glancing at these notes quickly understand that each represents a distinct type of day?
5. Are the category breakdowns and activity patterns genuinely different?

Score 1.0 = all three are clearly distinct and persona-appropriate.
Score 0.0 = they look like cookie-cutter copies.`,
				0.5
			);

			console.log(`\n  Cross-persona differentiation: ${evalResult.score.toFixed(2)}`);
			console.log(`  ${evalResult.reasoning}`);

			expect(evalResult.score).toBeGreaterThanOrEqual(0.5);
		},
		60000
	);
});
