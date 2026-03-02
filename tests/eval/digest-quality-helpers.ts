/**
 * Shared helpers for digest quality eval tests.
 *
 * Runs the full pipeline (sanitize → categorize → classify → patterns →
 * knowledge → render) for a given persona and returns the rendered markdown
 * alongside input statistics for deterministic and LLM-judge assertions.
 */

import { categorizeVisits } from "../../src/filter/categorize";
import { sanitizeCollectedData } from "../../src/filter/sanitize";
import { classifyEventsRuleOnly } from "../../src/filter/classify";
import { extractPatterns, buildEmptyTopicHistory } from "../../src/analyze/patterns";
import { generateKnowledgeSections } from "../../src/analyze/knowledge";
import { renderMarkdown } from "../../src/render/renderer";
import { cleanTitle } from "../../src/collect/browser";
import { computeEngagementScore } from "../../src/analyze/engagement";
import { linkSearchesToVisits } from "../../src/analyze/intent";
import { clusterArticles } from "../../src/analyze/clusters";
import { PersonaOutput } from "../fixtures/personas";
import { defaultPatternConfig } from "../fixtures/scenarios";
import { getMockSummary } from "../../scripts/lib/mock-ai";
import type { KnowledgeSections } from "../../src/analyze/knowledge";
import type { AISummary } from "../../src/types";

const DATE = new Date("2025-06-15T00:00:00");
const TODAY = "2025-06-15";

export interface InputStats {
	visits: number;
	searches: number;
	claude: number;
	git: number;
}

export interface RenderResult {
	persona: PersonaOutput;
	markdown: string;
	inputStats: InputStats;
	knowledge: KnowledgeSections;
	aiSummary: AISummary | null;
}

/**
 * Run the full pipeline for a persona and render markdown.
 *
 * @param personaFn - Persona generator function
 * @param options.withAI - When true, uses getMockSummary() for a deterministic
 *   AI summary so the full three-layer layout is populated.
 */
export function renderForPersona(
	personaFn: (d?: Date) => PersonaOutput,
	options?: { withAI?: boolean }
): RenderResult {
	const persona = personaFn(DATE);

	// 1. Sanitize
	const sanitized = sanitizeCollectedData(
		persona.visits,
		persona.searches,
		[...persona.claude, ...(persona.codex ?? [])],
		persona.git ?? []
	);

	// 2. Categorize
	const categorized = categorizeVisits(sanitized.visits);

	// 3. Classify (rule-only, no LLM)
	const classification = classifyEventsRuleOnly(
		sanitized.visits,
		sanitized.searches,
		sanitized.claudeSessions,
		sanitized.gitCommits,
		categorized
	);

	// 4. Article clustering (matches main.ts pipeline)
	const searchLinks = linkSearchesToVisits(sanitized.searches, sanitized.visits);
	const cleanedTitles = sanitized.visits.map((v) => cleanTitle(v.title ?? ""));
	const engagementScores = sanitized.visits.map((v, i) =>
		computeEngagementScore(v, cleanedTitles[i], sanitized.visits, searchLinks)
	);
	const articleClusters = clusterArticles(sanitized.visits, cleanedTitles, engagementScores);

	// 5. Extract patterns (all 9 args — matching main.ts)
	const patterns = extractPatterns(
		classification,
		defaultPatternConfig(),
		buildEmptyTopicHistory(),
		TODAY,
		sanitized.gitCommits,
		sanitized.claudeSessions,
		sanitized.searches,
		sanitized.visits,
		articleClusters
	);

	// 6. Generate knowledge sections + attach semantic data
	const knowledge = generateKnowledgeSections(patterns);
	if (articleClusters.length > 0) {
		knowledge.articleClusters = articleClusters;
	}
	// Attach commit work units and Claude task sessions from extractPatterns
	// (already computed internally when rawGitCommits/rawClaudeSessions are passed)
	if (patterns.commitWorkUnits.length > 0) {
		knowledge.commitWorkUnits = patterns.commitWorkUnits;
	}
	if (patterns.claudeTaskSessions.length > 0) {
		knowledge.claudeTaskSessions = patterns.claudeTaskSessions;
	}

	// 7. Optionally attach a mock AI summary
	const aiSummary = options?.withAI ? getMockSummary("ai-on") : null;

	// 8. Render markdown
	const markdown = renderMarkdown(
		DATE,
		sanitized.visits,
		sanitized.searches,
		sanitized.claudeSessions,
		sanitized.gitCommits,
		categorized,
		aiSummary,
		aiSummary ? "anthropic" : "none",
		knowledge
	);

	return {
		persona,
		markdown,
		inputStats: {
			visits: persona.visits.length,
			searches: persona.searches.length,
			claude: persona.claude.length,
			git: (persona.git ?? []).length,
		},
		knowledge,
		aiSummary,
	};
}
