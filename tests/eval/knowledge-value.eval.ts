/**
 * AI Evaluation: Knowledge Value
 *
 * Uses LLM-as-judge to assess whether the knowledge extraction pipeline
 * produces genuinely useful knowledge artifacts — not just reformatted logs.
 * Tests the Phase 3 knowledge sections and the full pipeline output.
 *
 * Run: DAILY_DIGEST_AI_EVAL=true npx vitest run tests/eval/knowledge-value.eval.ts
 */

import { describe, it, expect } from "vitest";
import { categorizeVisits } from "../../src/filter/categorize";
import { classifyEventsRuleOnly } from "../../src/filter/classify";
import { extractPatterns, buildEmptyTopicHistory } from "../../src/patterns";
import { generateKnowledgeSections } from "../../src/knowledge";
import { renderMarkdown } from "../../src/renderer";
import { sanitizeCollectedData } from "../../src/filter/sanitize";
import {
	fullStackDeveloper,
	researchKnowledgeWorker,
	scatteredContextSwitcher,
	learningDay,
} from "../fixtures/personas";
import { defaultSanitizeConfig, defaultPatternConfig } from "../fixtures/scenarios";
import {
	skipIfNoAI,
	evaluateWithRubric,
	evaluateMultiCriteria,
	evaluateContainment,
} from "./eval-helpers";

const DATE = new Date("2025-06-15T00:00:00");
const TODAY = "2025-06-15";

function generateKnowledgeForPersona(personaFn: (d?: Date) => ReturnType<typeof fullStackDeveloper>) {
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
	const knowledge = generateKnowledgeSections(patterns);
	const markdown = renderMarkdown(
		DATE, sanitized.visits, sanitized.searches,
		sanitized.claudeSessions, sanitized.gitCommits, categorized, null, "none", knowledge
	);

	return { persona, patterns, knowledge, markdown };
}

describe("knowledge value evaluation", () => {
	const SKIP = skipIfNoAI();

	// ── Focus Summary Quality ───────────────────────────────

	describe("focus summary quality", () => {
		it.skipIf(SKIP)("focus summary accurately describes developer day", async () => {
			const { knowledge, patterns } = generateKnowledgeForPersona(fullStackDeveloper);

			const result = await evaluateWithRubric(
				`Focus summary: "${knowledge.focusSummary}"\n\nContext: Focus score was ${(patterns.focusScore * 100).toFixed(0)}%. Top activity types: ${patterns.topActivityTypes.map((a) => `${a.type} (${a.pct}%)`).join(", ")}`,
				`Evaluate whether the focus summary:
1. Uses appropriate language for the focus level (e.g., "highly focused" for >70%, "varied" for 30-50%, "scattered" for <30%)
2. Mentions relevant activity types or topics
3. Is concise and informative (1-2 sentences)
4. Provides useful context about the day's work pattern
5. Would be genuinely helpful in a personal knowledge base note`,
				0.6
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.5);
		}, 30000);

		it.skipIf(SKIP)("scattered day gets appropriate low-focus description", async () => {
			const { knowledge, patterns } = generateKnowledgeForPersona(scatteredContextSwitcher);

			const result = await evaluateWithRubric(
				`Focus summary: "${knowledge.focusSummary}"\n\nContext: Focus score was ${(patterns.focusScore * 100).toFixed(0)}%. This persona is a "Scattered Context-Switcher" jumping between 5+ unrelated tasks all day.`,
				`Evaluate whether the focus summary accurately reflects a scattered, context-switching day:
1. Uses language suggesting low focus or high variety ("varied", "scattered", "diverse")
2. Does NOT claim high focus when the day was fragmented
3. Correctly describes the attention pattern
4. Is honest about context-switching (not overly positive)`,
				0.6
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.5);
		}, 30000);
	});

	// ── Knowledge Section Richness ──────────────────────────

	describe("knowledge section richness", () => {
		it.skipIf(SKIP)("temporal insights add value beyond raw data", async () => {
			const { knowledge, patterns } = generateKnowledgeForPersona(fullStackDeveloper);

			if (knowledge.temporalInsights.length === 0) {
				console.log("  Skipped: no temporal insights generated");
				return;
			}

			const insightsText = knowledge.temporalInsights.join("\n");
			const result = await evaluateWithRubric(
				`Temporal insights:\n${insightsText}\n\nRaw data: ${patterns.temporalClusters.length} clusters detected across the day.`,
				`Evaluate whether these temporal insights provide KNOWLEDGE (not just reformatted data):
1. Do they describe work patterns (e.g., "morning research, afternoon implementation")?
2. Do they go beyond just listing times and counts?
3. Would they help someone reflect on their work rhythm?
4. Are they expressed in natural language, not just data formats?`,
				0.5
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.4);
		}, 30000);

		it.skipIf(SKIP)("topic map reveals meaningful connections", async () => {
			const { knowledge } = generateKnowledgeForPersona(researchKnowledgeWorker);

			if (knowledge.topicMap.length === 0) {
				console.log("  Skipped: no topic map entries generated");
				return;
			}

			const topicText = knowledge.topicMap.join("\n");
			const result = await evaluateWithRubric(
				`Topic map entries:\n${topicText}`,
				`Evaluate whether this topic map reveals meaningful connections:
1. Does it show relationships between topics (not just a flat list)?
2. Does it use connecting language ("with", "and", "related to")?
3. Would it help someone understand their research landscape?
4. Does it distinguish between primary topics and secondary ones?`,
				0.5
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.4);
		}, 30000);

		it.skipIf(SKIP)("entity graph provides useful tool/platform relationships", async () => {
			const { knowledge } = generateKnowledgeForPersona(fullStackDeveloper);

			if (knowledge.entityGraph.length === 0) {
				console.log("  Skipped: no entity graph entries generated");
				return;
			}

			const entityText = knowledge.entityGraph.join("\n");
			const result = await evaluateWithRubric(
				`Entity relations:\n${entityText}`,
				`Evaluate whether these entity relations are useful:
1. Do they show tool/platform co-usage patterns?
2. Are the entities meaningful (real tools, platforms, libraries)?
3. Do the relationships make sense (tools used together for a purpose)?
4. Would this help someone understand their technology usage?`,
				0.5
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.4);
		}, 30000);
	});

	// ── Tag Quality ─────────────────────────────────────────

	describe("tag quality", () => {
		it.skipIf(SKIP)("generated tags are well-structured and meaningful", async () => {
			const { knowledge } = generateKnowledgeForPersona(learningDay);

			const result = await evaluateWithRubric(
				`Generated tags: ${knowledge.tags.join(", ")}`,
				`Evaluate the quality of these automatically generated tags for an Obsidian daily note:
1. Do they use a hierarchical namespace (activity/xxx, topic/xxx, entity/xxx)?
2. Are the tag values specific and meaningful (not just generic words)?
3. Would they be useful for cross-referencing notes over time?
4. Do they reflect actual activities (not invented content)?
5. Is the tag count reasonable (not too many, not too few)?`,
				0.6
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.5);
		}, 30000);
	});

	// ── Full Markdown Output Quality ────────────────────────

	describe("full output quality", () => {
		it.skipIf(SKIP)("rendered markdown is well-structured Obsidian note", async () => {
			const { markdown } = generateKnowledgeForPersona(fullStackDeveloper);

			// Only send first ~3000 chars to stay within eval limits
			const result = await evaluateMultiCriteria(
				markdown.slice(0, 3000),
				[
					{
						name: "frontmatter",
						description: "Has valid YAML frontmatter with date, day, tags, and categories",
						weight: 0.2,
					},
					{
						name: "structure",
						description: "Uses proper Markdown heading hierarchy (H1, H2, H3) with meaningful section names",
						weight: 0.2,
					},
					{
						name: "knowledge_sections",
						description: "Contains knowledge-oriented sections (Knowledge Insights, Focus, Activity Clusters, Topic Map)",
						weight: 0.3,
					},
					{
						name: "readability",
						description: "Content is human-readable, uses bullet points and formatting effectively, would be useful in a daily note",
						weight: 0.3,
					},
				],
				0.6
			);

			console.log(`  Overall: ${result.overall.score.toFixed(2)}`);
			for (const [name, score] of Object.entries(result.criteria)) {
				console.log(`    ${name}: ${score.score.toFixed(2)} — ${score.reasoning}`);
			}

			expect(result.overall.score).toBeGreaterThanOrEqual(0.5);
		}, 45000);

		it.skipIf(SKIP)("output contains expected elements for learning day", async () => {
			const { markdown, persona: _persona } = generateKnowledgeForPersona(learningDay);

			const result = await evaluateContainment(
				markdown.slice(0, 4000),
				[
					"YAML frontmatter with date and tags",
					"Browser Activity section with categorized visits",
					"Knowledge Insights section",
					"Focus summary describing the day's concentration level",
					"Tags with activity type prefixes",
					"Stats line with counts of visits, searches, and AI prompts",
				],
				0.6
			);

			console.log(`  Score: ${result.score.toFixed(2)} | ${result.reasoning}`);
			expect(result.score).toBeGreaterThanOrEqual(0.5);
		}, 30000);
	});
});
