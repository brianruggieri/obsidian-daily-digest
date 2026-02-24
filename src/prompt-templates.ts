import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type PromptName = "standard" | "compressed" | "rag" | "classified" | "deidentified";

/**
 * Built-in prompt defaults, inlined as string literals so they work in both
 * the esbuild plugin bundle and tsx scripts without needing a .txt loader.
 * The prompts/ directory on disk takes precedence when promptsDir is set.
 */
export const BUILT_IN_PROMPTS: Record<PromptName, string> = {
	standard: `You are summarizing a person's digital activity for {{dateStr}}.
Your job is to distill raw activity logs into useful, human-readable intelligence for a personal knowledge base.{{contextHint}}

## Browser activity by category:
{{browserActivity}}

## Search queries:
{{searches}}

## Claude Code / AI prompts:
{{claudePrompts}}

## Shell commands (secrets redacted):
{{shellCommands}}

## Git commits:
{{gitCommits}}

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence summarizing the whole day (max 15 words)",
  "tldr": "2-3 sentence paragraph. What was this person focused on? What did they accomplish or investigate?",
  "themes": ["3-5 short theme labels inferred from activity, e.g. 'API integration', 'market research', 'debugging'"],
  "category_summaries": {
    "<category_name>": "1-sentence plain-English summary of what they did in this category"
  },
  "notable": ["2-4 specific notable things: interesting searches, unusual patterns, apparent decisions or pivots"],
  "questions": ["1-2 open questions this day's activity raises, useful for future reflection"],
  "work_patterns": ["1-3 behavioral observations, e.g. 'deep 2-hour focus block', 'frequent context switching between X and Y'"],
  "cross_source_connections": ["1-2 connections across data sources, e.g. 'Searched for X, then committed code addressing it'"]
}

Be specific and concrete. Prefer "researched OAuth 2.0 flows for a GitHub integration" over "did some dev work".
Only include category_summaries for categories that actually had activity.
Do not include categories with zero visits.
`,

	compressed: `You are summarizing a person's digital activity for {{dateStr}}.
Your job is to distill raw activity logs into useful, human-readable intelligence for a personal knowledge base.{{contextHint}}

Total events collected: {{totalEvents}}

## Browser activity by category:
{{browserActivity}}

## Search queries:
{{searches}}

## Claude Code / AI prompts:
{{claudePrompts}}

## Shell commands (secrets redacted):
{{shellCommands}}

## Git commits:
{{gitCommits}}

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence summarizing the whole day (max 15 words)",
  "tldr": "2-3 sentence paragraph. What was this person focused on? What did they accomplish or investigate?",
  "themes": ["3-5 short theme labels inferred from activity, e.g. 'API integration', 'market research', 'debugging'"],
  "category_summaries": {
    "<category_name>": "1-sentence plain-English summary of what they did in this category"
  },
  "notable": ["2-4 specific notable things: interesting searches, unusual patterns, apparent decisions or pivots"],
  "questions": ["1-2 open questions this day's activity raises, useful for future reflection"],
  "work_patterns": ["1-3 behavioral observations, e.g. 'deep 2-hour focus block', 'frequent context switching between X and Y'"],
  "cross_source_connections": ["1-2 connections across data sources, e.g. 'Searched for X, then committed code addressing it'"]
}

Be specific and concrete. Prefer "researched OAuth 2.0 flows for a GitHub integration" over "did some dev work".
Only include category_summaries for categories that actually had activity.
Do not include categories with zero visits.
`,

	rag: `You are summarizing a person's digital activity for {{dateStr}}.
Your job is to distill activity logs into useful, human-readable intelligence for a personal knowledge base.{{contextHint}}

The following activity blocks were selected as the most relevant from today's data:

{{chunkTexts}}

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence summarizing the whole day (max 15 words)",
  "tldr": "2-3 sentence paragraph. What was this person focused on? What did they accomplish or investigate?",
  "themes": ["3-5 short theme labels inferred from activity, e.g. 'API integration', 'market research', 'debugging'"],
  "category_summaries": {
    "<category_name>": "1-sentence plain-English summary of what they did in this category"
  },
  "notable": ["2-4 specific notable things: interesting searches, unusual patterns, apparent decisions or pivots"],
  "questions": ["1-2 open questions this day's activity raises, useful for future reflection"],
  "work_patterns": ["1-3 behavioral observations, e.g. 'deep 2-hour focus block', 'frequent context switching between X and Y'"],
  "cross_source_connections": ["1-2 connections across data sources, e.g. 'Searched for X, then committed code addressing it'"]
}

Be specific and concrete. Prefer "researched OAuth 2.0 flows for a GitHub integration" over "did some dev work".
Only include category_summaries for categories represented in the activity blocks above.
`,

	classified: `You are summarizing a person's digital activity for {{dateStr}}.
Your job is to distill classified activity abstractions into useful, human-readable intelligence for a personal knowledge base.{{contextHint}}

## Activity Overview
Total events: {{totalProcessed}} ({{llmClassified}} LLM-classified, {{ruleClassified}} rule-classified)
All topics: {{allTopics}}
All entities: {{allEntities}}

## Activity by Type
{{activitySections}}

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence summarizing the whole day (max 15 words)",
  "tldr": "2-3 sentence paragraph. What was this person focused on? What did they accomplish or investigate?",
  "themes": ["3-5 short theme labels inferred from activity, e.g. 'API integration', 'market research', 'debugging'"],
  "category_summaries": {
    "<activity_type>": "1-sentence plain-English summary of what they did in this activity type"
  },
  "notable": ["2-4 specific notable things: interesting patterns, apparent decisions or pivots, cross-domain connections"],
  "questions": ["1-2 open questions this day's activity raises, useful for future reflection"],
  "work_patterns": ["1-3 behavioral observations, e.g. 'deep 2-hour focus block', 'frequent context switching between X and Y'"],
  "cross_source_connections": ["1-2 connections across data sources, e.g. 'Searched for X, then committed code addressing it'"]
}

Be specific and concrete. Refer to the topics and entities mentioned.
Only include category_summaries for activity types that had events.
`,

	deidentified: `You are a cognitive pattern analyst reviewing a person's aggregated digital activity for {{dateStr}}.
You are receiving ONLY statistical patterns and aggregated distributions — no raw data, URLs, search queries, commands, or individual event details. Your role is to provide meta-insights about cognitive patterns, focus, and learning behaviors.{{contextHint}}

## Day Shape
Focus score: {{focusScore}}
Peak activity hours: {{peakHours}}

## Activity Distribution
{{activityDist}}

## Temporal Clusters
{{temporalShape}}

## Topic Distribution (aggregated)
{{topTopics}}

## Topic Connections
{{topicConnections}}

## Entity Clusters
{{entityClusters}}

## Recurrence Patterns
{{recurrenceLines}}

## Knowledge Delta
{{knowledgeDeltaLines}}

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence summarizing the day's cognitive character (max 15 words)",
  "tldr": "2-3 sentence paragraph describing what this person's day looked like at a high level — their focus areas, work rhythm, and any shifts in attention",
  "themes": ["3-5 theme labels inferred from topic and entity distributions"],
  "category_summaries": {
    "<activity_type>": "1-sentence interpretation of what the person was doing in this activity type (infer from topic distribution, not raw data)"
  },
  "notable": ["2-4 notable patterns: unusual topic combinations, context-switching moments, research spirals, or decision points"],
  "questions": ["1-2 reflective questions based on the patterns — things the person might not have noticed about their own behavior"],
  "meta_insights": ["2-3 cognitive pattern observations: research-to-implementation ratio, topic depth vs breadth, attention fragmentation patterns, learning style indicators"],
  "quirky_signals": ["1-3 unusual or interesting signals: topics revisited but never formalized, contradictions between focus areas, rabbit holes, or unexpectedly connected interests"],
  "focus_narrative": "A 1-2 sentence narrative about the day's focus pattern — was it a deep-dive day, a context-switching day, a research day, an execution day? What does the temporal shape suggest?",
  "work_patterns": ["1-3 behavioral observations, e.g. 'deep 2-hour focus block', 'frequent context switching between X and Y'"],
  "cross_source_connections": ["1-2 connections across data sources, e.g. 'Searched for X, then committed code addressing it'"]
}

Be insightful and specific. You're a cognitive coach analyzing work patterns, not a task tracker. Look for:
- Research spirals (same topic approached from multiple angles over time)
- Implementation momentum (sustained focus on building)
- Context-switching costs (fragmented clusters suggest attention debt)
- Unformalized knowledge (topics explored repeatedly but never documented)
- Cross-pollination (unexpected connections between different topic clusters)
Only include category_summaries for activity types represented in the distribution.
`,
};

/**
 * Load a named prompt template. Looks for <promptsDir>/<name>.txt first.
 * Falls back to the built-in default string if the file doesn't exist.
 */
export function loadPromptTemplate(name: PromptName, promptsDir: string | undefined): string {
	if (promptsDir) {
		const filePath = join(promptsDir, `${name}.txt`);
		if (existsSync(filePath)) {
			return readFileSync(filePath, "utf-8");
		}
	}
	return BUILT_IN_PROMPTS[name];
}

/**
 * Replace all {{variable}} placeholders in a template string.
 * Unknown variables are left unchanged.
 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}
