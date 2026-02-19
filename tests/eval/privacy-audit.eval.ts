/**
 * AI Evaluation: Privacy Audit
 *
 * Uses LLM-as-judge to verify that privacy-sensitive data does not leak
 * through the prompt construction pipeline. Tests both the classified
 * and deidentified prompt tiers.
 *
 * Run: DAILY_DIGEST_AI_EVAL=true npx vitest run tests/eval/privacy-audit.eval.ts
 */

import { describe, it, expect } from "vitest";
import { buildClassifiedPrompt, buildDeidentifiedPrompt } from "../../src/summarize";
import { categorizeVisits } from "../../src/categorize";
import { classifyEventsRuleOnly } from "../../src/classify";
import { extractPatterns, buildEmptyTopicHistory } from "../../src/patterns";
import { sanitizeCollectedData } from "../../src/sanitize";
import { fullStackDeveloper, scatteredContextSwitcher, devopsInfrastructureDay } from "../fixtures/personas";
import { defaultSanitizeConfig, defaultPatternConfig, privacyTestScenario } from "../fixtures/scenarios";
import {
	skipIfNoAI,
	evaluateAbsence,
	evaluateWithRubric,
	evaluateMultiCriteria,
	RubricCriterion,
} from "./eval-helpers";

const DATE = new Date("2025-06-15T00:00:00");
const TODAY = "2025-06-15";

function buildClassifiedFromPersona(personaFn: (d?: Date) => ReturnType<typeof fullStackDeveloper>) {
	const persona = personaFn(DATE);
	const sanitized = sanitizeCollectedData(
		persona.visits, persona.searches, persona.shell, persona.claude,
		defaultSanitizeConfig()
	);
	const categorized = categorizeVisits(sanitized.visits);
	const classification = classifyEventsRuleOnly(
		sanitized.visits, sanitized.searches, sanitized.shellCommands, sanitized.claudeSessions,
		categorized
	);
	return buildClassifiedPrompt(DATE, classification, "");
}

function buildDeidentifiedFromPersona(personaFn: (d?: Date) => ReturnType<typeof fullStackDeveloper>) {
	const persona = personaFn(DATE);
	const sanitized = sanitizeCollectedData(
		persona.visits, persona.searches, persona.shell, persona.claude,
		defaultSanitizeConfig()
	);
	const categorized = categorizeVisits(sanitized.visits);
	const classification = classifyEventsRuleOnly(
		sanitized.visits, sanitized.searches, sanitized.shellCommands, sanitized.claudeSessions,
		categorized
	);
	const patterns = extractPatterns(
		classification, defaultPatternConfig(), buildEmptyTopicHistory(), TODAY
	);
	return buildDeidentifiedPrompt(DATE, patterns, "");
}

describe("privacy audit evaluation", () => {
	const SKIP = skipIfNoAI();

	// ── Classified Prompt Privacy ────────────────────────────

	describe("classified prompt privacy", () => {
		it.skipIf(SKIP)("classified prompt contains no raw URLs or file paths", async () => {
			const prompt = buildClassifiedFromPersona(fullStackDeveloper);

			const result = await evaluateAbsence(
				prompt,
				[
					"Full HTTP/HTTPS URLs (like https://github.com/user/repo)",
					"File system paths (like /Users/name/project or C:\\Users\\name)",
					"IP addresses (like 192.168.1.100 or 10.0.0.1)",
					"Email addresses (like user@example.com)",
					"API keys or tokens (like sk-ant-, ghp_, AKIA, Bearer ...)",
				],
				0.85
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.8);
		}, 30000);

		it.skipIf(SKIP)("classified prompt contains no shell commands", async () => {
			const prompt = buildClassifiedFromPersona(devopsInfrastructureDay);

			const result = await evaluateAbsence(
				prompt,
				[
					"Raw shell commands (like git push, npm install, kubectl apply, docker run)",
					"Command-line flags and arguments (like --force, -v, --namespace)",
					"Shell pipelines (commands with | or && or ;)",
					"Environment variable values (like export VAR=value)",
				],
				0.85
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.75);
		}, 30000);
	});

	// ── Deidentified Prompt Privacy ─────────────────────────

	describe("deidentified prompt privacy", () => {
		it.skipIf(SKIP)("deidentified prompt contains only aggregated statistics", async () => {
			const prompt = buildDeidentifiedFromPersona(fullStackDeveloper);

			const criteria: RubricCriterion[] = [
				{
					name: "no_individual_events",
					description: "Contains NO individual event summaries, descriptions, or per-event details. Only shows counts, percentages, and distributions.",
					weight: 0.35,
				},
				{
					name: "no_raw_data",
					description: "Contains NO raw URLs, search queries, shell commands, file paths, or Claude prompts.",
					weight: 0.35,
				},
				{
					name: "aggregated_only",
					description: "All data is presented as aggregated statistics: activity type distributions, temporal cluster labels, topic frequencies, entity co-occurrence counts.",
					weight: 0.3,
				},
			];

			const result = await evaluateMultiCriteria(prompt, criteria, 0.8);

			console.log(`  Overall: ${result.overall.score.toFixed(2)}`);
			for (const [name, score] of Object.entries(result.criteria)) {
				console.log(`    ${name}: ${score.score.toFixed(2)} — ${score.reasoning}`);
			}

			expect(result.overall.score).toBeGreaterThanOrEqual(0.7);
		}, 45000);

		it.skipIf(SKIP)("deidentified prompt is strictly more private than classified", async () => {
			const classified = buildClassifiedFromPersona(fullStackDeveloper);
			const deidentified = buildDeidentifiedFromPersona(fullStackDeveloper);

			const combinedInput = `
## Classified Prompt (Tier 2):
${classified}

## Deidentified Prompt (Tier 1 — most private):
${deidentified}
`;

			const result = await evaluateWithRubric(
				combinedInput,
				`Compare these two prompts for privacy level. The deidentified prompt (Tier 1) should be STRICTLY more private than the classified prompt (Tier 2).

Evaluate:
1. Does the deidentified prompt contain FEWER specific details about individual events? (It should have NONE)
2. Does the classified prompt contain per-event summaries that the deidentified does NOT?
3. Is the deidentified prompt limited to aggregated statistics, distributions, and pattern labels?
4. Could someone reconstruct individual browsing/shell activity from the deidentified prompt? (Answer should be NO)
5. Is the privacy gap significant and meaningful (not just cosmetic)?

Score 1.0 = deidentified is clearly and significantly more private.
Score 0.0 = both prompts have the same level of detail.`,
				0.7
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.6);
		}, 45000);
	});

	// ── Sanitization Pipeline ───────────────────────────────

	describe("sanitization effectiveness", () => {
		it.skipIf(SKIP)("dirty data is properly sanitized before reaching prompts", async () => {
			const dirty = privacyTestScenario();
			const sanitized = sanitizeCollectedData(
				dirty.visits, dirty.searches, dirty.shell, dirty.claude,
				defaultSanitizeConfig()
			);

			// Build a summary of what was sanitized
			const sanitizedSummary = [
				"## Sanitized Visits:",
				...sanitized.visits.map((v) => `  URL: ${v.url} | Title: ${v.title}`),
				"",
				"## Sanitized Searches:",
				...sanitized.searches.map((s) => `  Query: ${s.query}`),
				"",
				"## Sanitized Shell Commands:",
				...sanitized.shellCommands.map((s) => `  Cmd: ${s.cmd}`),
				"",
				"## Sanitized Claude Sessions:",
				...sanitized.claudeSessions.map((c) => `  Prompt: ${c.prompt}`),
			].join("\n");

			const result = await evaluateAbsence(
				sanitizedSummary,
				[
					"GitHub PAT tokens (ghp_...)",
					"Anthropic API keys (sk-ant-...)",
					"OpenAI API keys (sk-...)",
					"AWS access keys (AKIA...)",
					"Email addresses (user@domain.com)",
					"Home directory paths (/Users/username or /home/username)",
					"Bank domain URLs (mybank.com)",
					"Database connection strings with passwords",
					"Authorization bearer tokens",
				],
				0.85
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.75);
		}, 30000);
	});

	// ── Privacy Escalation Chain ────────────────────────────

	describe("privacy escalation verification", () => {
		it.skipIf(SKIP)("three prompt tiers have correct privacy ordering", async () => {
			const persona = fullStackDeveloper(DATE);
			const sanitized = sanitizeCollectedData(
				persona.visits, persona.searches, persona.shell, persona.claude,
				defaultSanitizeConfig()
			);
			const categorized = categorizeVisits(sanitized.visits);
			const classification = classifyEventsRuleOnly(
				sanitized.visits, sanitized.searches, sanitized.shellCommands, sanitized.claudeSessions,
				categorized
			);
			const patterns = extractPatterns(
				classification, defaultPatternConfig(), buildEmptyTopicHistory(), TODAY
			);

			const classifiedPrompt = buildClassifiedPrompt(DATE, classification, "");
			const deidentifiedPrompt = buildDeidentifiedPrompt(DATE, patterns, "");

			const combinedInput = `
# Privacy Tier Analysis

## Tier 1 — Deidentified (most private):
${deidentifiedPrompt.slice(0, 2000)}

## Tier 2 — Classified (medium privacy):
${classifiedPrompt.slice(0, 2000)}
`;

			const criteria: RubricCriterion[] = [
				{
					name: "tier1_aggregation",
					description: "Tier 1 (deidentified) contains ONLY aggregated statistics, distributions, and pattern labels — no individual event details",
					weight: 0.35,
				},
				{
					name: "tier2_abstraction",
					description: "Tier 2 (classified) contains per-event abstractions (summaries, topics, entities) but NO raw URLs, commands, or queries",
					weight: 0.30,
				},
				{
					name: "privacy_ordering",
					description: "Tier 1 is strictly more private than Tier 2 — it contains less specific information about individual activities",
					weight: 0.35,
				},
			];

			const result = await evaluateMultiCriteria(combinedInput, criteria, 0.65);

			console.log(`  Overall: ${result.overall.score.toFixed(2)}`);
			for (const [name, score] of Object.entries(result.criteria)) {
				console.log(`    ${name}: ${score.score.toFixed(2)} — ${score.reasoning}`);
			}

			expect(result.overall.score).toBeGreaterThanOrEqual(0.55);
		}, 60000);
	});
});
