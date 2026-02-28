import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type PromptName = "standard" | "compressed" | "rag" | "classified" | "deidentified" | "prose";

/** Which prompt complexity tier to use based on model capability. */
export type PromptCapability = "high" | "balanced" | "lite";

/**
 * Built-in prompt defaults, inlined as string literals so they work in both
 * the esbuild plugin bundle and tsx scripts without needing a .txt loader.
 * The prompts/ directory on disk takes precedence when promptsDir is set.
 */
export const BUILT_IN_PROMPTS: Record<PromptName, string> = {
	standard: `You are building a daily note entry for a personal knowledge base. Your task is to synthesize this person's raw activity logs into meaningful, reflective intelligence — not just a log of what happened, but a clear picture of their focus, learning, and momentum for the day. This note will be read during personal reflection and linked to recurring themes, ongoing projects, and future notes in the vault.{{contextHint}}{{focusHint}}

Date: {{dateStr}}

<browser_activity>
{{browserActivity}}
</browser_activity>

<search_queries>
{{searches}}
</search_queries>

<ai_sessions>
{{claudePrompts}}
</ai_sessions>

<git_commits>
{{gitCommits}}
</git_commits>

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence capturing the day's essential character (max 15 words)",
  "work_story": "2-3 sentences narrating the arc of the day's actual work — what was really being built or solved, how understanding evolved, what was discovered or decided. Tell the story: what changed from start to end?",
  "mindset": "1 sentence characterizing the working mode today — exploring, building, debugging, synthesizing, learning? What energy or cognitive style characterized the day?",
  "tldr": "2-3 sentences for future recall: key accomplishment, main learning, and what this day unlocks or sets up next",
  "themes": ["3-5 broad theme tags for grouping this day with related days — e.g. 'authentication', 'debugging', 'market-research'"],
  "topics": ["4-8 specific vault-linkable noun phrases — the actual concepts, tools, or methods worked with today. Format as note titles for use as [[wikilinks]] in Obsidian: 'OAuth 2.0', 'React hooks', 'PostgreSQL indexing'. Use consistent naming across sessions."],
  "entities": ["3-6 named tools, libraries, frameworks, services, or APIs encountered today — e.g. 'GitHub Actions', 'Tailwind CSS', 'Anthropic API'"],
  "category_summaries": {
    "<category_name>": "1-sentence plain-English summary of what they were doing in this category"
  },
  "notable": ["2-4 specific notable things: interesting searches, apparent decisions or pivots, things worth linking to other notes"],
  "learnings": ["2-4 concrete things the person learned or understood today that can be applied later — skills grasped, patterns recognized, things they can now do that they couldn't before"],
  "remember": ["3-5 specific things worth noting for quick future recall: commands that worked, configurations found, key resource names, approaches that succeeded or failed"],
  "questions": ["1-2 genuinely open questions a thoughtful outside observer would ask after reading this — questions the person themselves might not think to ask. Do not presuppose an emotional state, outcome, or conclusion. Focus on the 'why' behind patterns, not just 'what happened next'."],
  "note_seeds": ["2-4 topics from today that most deserve their own permanent note — concepts that came up repeatedly or represent key learning moments, candidates for new atomic notes in the vault"],
  "work_patterns": ["1-3 behavioral observations, e.g. 'sustained 3-hour focus block on auth', 'frequent context switching between research and implementation'"],
  "cross_source_connections": ["1-2 meaningful connections across data sources, e.g. 'Searched OAuth 2.0 flows, then committed auth middleware two hours later'"]
}

Write \`headline\` and \`tldr\` last — as final distillations after completing all other fields.
Themes are broad tags for cross-day filtering. Topics are specific [[wikilink]] candidates. Note seeds deserve standalone atomic notes.
Be specific and concrete. Prefer "debugged the OAuth callback race condition in the auth module" over "did some dev work".
Only include category_summaries for categories that actually had activity.
Write for a person reading their own notes 3 months from now — help them remember what they understood and where they were in their work.
`,

	compressed: `You are building a daily note entry for a personal knowledge base. Your task is to synthesize this person's raw activity logs into meaningful, reflective intelligence — not just a log of what happened, but a clear picture of their focus, learning, and momentum for the day. This note will be read during personal reflection and linked to recurring themes, ongoing projects, and future notes in the vault.{{contextHint}}{{focusHint}}

Date: {{dateStr}}
Total events collected: {{totalEvents}}

<browser_activity>
{{browserActivity}}
</browser_activity>

<search_queries>
{{searches}}
</search_queries>

<ai_sessions>
{{claudePrompts}}
</ai_sessions>

<git_commits>
{{gitCommits}}
</git_commits>

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence capturing the day's essential character (max 15 words)",
  "work_story": "2-3 sentences narrating the arc of the day's actual work — what was really being built or solved, how understanding evolved, what was discovered or decided. Tell the story: what changed from start to end?",
  "mindset": "1 sentence characterizing the working mode today — exploring, building, debugging, synthesizing, learning? What energy or cognitive style characterized the day?",
  "tldr": "2-3 sentences for future recall: key accomplishment, main learning, and what this day unlocks or sets up next",
  "themes": ["3-5 broad theme tags for grouping this day with related days — e.g. 'authentication', 'debugging', 'market-research'"],
  "topics": ["4-8 specific vault-linkable noun phrases — the actual concepts, tools, or methods worked with today. Format as note titles for use as [[wikilinks]] in Obsidian: 'OAuth 2.0', 'React hooks', 'PostgreSQL indexing'. Use consistent naming across sessions."],
  "entities": ["3-6 named tools, libraries, frameworks, services, or APIs encountered today — e.g. 'GitHub Actions', 'Tailwind CSS', 'Anthropic API'"],
  "category_summaries": {
    "<category_name>": "1-sentence plain-English summary of what they were doing in this category"
  },
  "notable": ["2-4 specific notable things: interesting searches, apparent decisions or pivots, things worth linking to other notes"],
  "learnings": ["2-4 concrete things the person learned or understood today that can be applied later — skills grasped, patterns recognized, things they can now do that they couldn't before"],
  "remember": ["3-5 specific things worth noting for quick future recall: commands that worked, configurations found, key resource names, approaches that succeeded or failed"],
  "questions": ["1-2 genuinely open questions a thoughtful outside observer would ask after reading this — questions the person themselves might not think to ask. Do not presuppose an emotional state, outcome, or conclusion. Focus on the 'why' behind patterns, not just 'what happened next'."],
  "note_seeds": ["2-4 topics from today that most deserve their own permanent note — concepts that came up repeatedly or represent key learning moments, candidates for new atomic notes in the vault"],
  "work_patterns": ["1-3 behavioral observations, e.g. 'sustained 3-hour focus block on auth', 'frequent context switching between research and implementation'"],
  "cross_source_connections": ["1-2 meaningful connections across data sources, e.g. 'Searched OAuth 2.0 flows, then committed auth middleware two hours later'"]
}

Write \`headline\` and \`tldr\` last — as final distillations after completing all other fields.
Themes are broad tags for cross-day filtering. Topics are specific [[wikilink]] candidates. Note seeds deserve standalone atomic notes.
Be specific and concrete. Prefer "debugged the OAuth callback race condition in the auth module" over "did some dev work".
Only include category_summaries for categories that actually had activity.
Write for a person reading their own notes 3 months from now — help them remember what they understood and where they were in their work.
`,

	rag: `You are building a daily note entry for a personal knowledge base. Your task is to synthesize this person's activity into meaningful, reflective intelligence. The following activity blocks were selected as the most relevant from today's data.{{contextHint}}{{focusHint}}

Date: {{dateStr}}

<activity_blocks>
{{chunkTexts}}
</activity_blocks>

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence capturing the day's essential character (max 15 words)",
  "work_story": "2-3 sentences narrating the arc of the day's actual work — what was really being built or solved, how understanding evolved, what was discovered or decided",
  "mindset": "1 sentence characterizing the working mode today — exploring, building, debugging, synthesizing, learning?",
  "tldr": "2-3 sentences for future recall: key accomplishment, main learning, and what this day unlocks or sets up next",
  "themes": ["3-5 broad theme tags for grouping this day with related days — e.g. 'authentication', 'debugging', 'market-research'"],
  "topics": ["4-8 specific vault-linkable noun phrases — format as note titles for [[wikilinks]]: 'OAuth 2.0', 'React hooks', 'PostgreSQL indexing'. Use consistent naming."],
  "entities": ["3-6 named tools, libraries, frameworks, services, or APIs encountered today"],
  "category_summaries": {
    "<category_name>": "1-sentence plain-English summary of what they were doing in this category"
  },
  "notable": ["2-4 specific notable things: interesting searches, apparent decisions or pivots, things worth linking to other notes"],
  "learnings": ["2-4 concrete things the person learned or understood today that can be applied later"],
  "remember": ["3-5 specific things worth noting for quick future recall: commands, configurations, key resource names, approaches that worked"],
  "questions": ["1-2 genuinely open questions a thoughtful outside observer would ask after reading this — questions the person themselves might not think to ask. Do not presuppose an emotional state, outcome, or conclusion. Focus on the 'why' behind patterns, not just 'what happened next'."],
  "note_seeds": ["2-4 topics that most deserve their own permanent note — concepts that came up repeatedly or represent key learning moments"],
  "work_patterns": ["1-3 behavioral observations, e.g. 'sustained focus block on auth', 'context switching between research and implementation'"],
  "cross_source_connections": ["1-2 meaningful connections across data sources, e.g. 'Searched for X, then committed code addressing it'"]
}

Write \`headline\` and \`tldr\` last — as final distillations after completing all other fields.
Themes are broad tags; topics are [[wikilink]] candidates; note seeds deserve standalone atomic notes.
Be specific and concrete. Only include category_summaries for categories represented in the activity blocks above.
Write for a person reading their own notes 3 months from now.
`,

	classified: `You are building a daily note entry for a personal knowledge base. You are receiving structured activity abstractions — classified events with topics, entities, and summaries. Your task is to synthesize these into meaningful, reflective intelligence that helps this person understand their day, track learning, and connect today's work to their broader knowledge graph.{{contextHint}}{{focusHint}}

Date: {{dateStr}}

<activity_overview>
Total events: {{totalProcessed}} ({{llmClassified}} LLM-classified, {{ruleClassified}} rule-classified)
All topics: {{allTopics}}
All entities: {{allEntities}}
</activity_overview>

<activity_by_type>
{{activitySections}}
</activity_by_type>

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence capturing the day's essential character (max 15 words)",
  "work_story": "2-3 sentences narrating the arc of the day's actual work — what was really being built or solved, how understanding evolved, what was discovered or decided",
  "mindset": "1 sentence characterizing the working mode today — exploring, building, debugging, synthesizing, learning?",
  "tldr": "2-3 sentences for future recall: key accomplishment, main learning, and what this day unlocks or sets up next",
  "themes": ["3-5 broad theme tags for grouping this day with related days — e.g. 'authentication', 'debugging', 'market-research'"],
  "topics": ["4-8 specific vault-linkable noun phrases drawn from today's topics. Format as note titles for [[wikilinks]]: 'OAuth 2.0', 'React hooks', 'PostgreSQL indexing'. Use consistent naming."],
  "entities": ["3-6 named tools, libraries, frameworks, services, or APIs from today's entity data"],
  "category_summaries": {
    "<activity_type>": "1-sentence plain-English summary of what they were doing in this activity type"
  },
  "notable": ["2-4 specific notable things: interesting patterns, apparent decisions or pivots, cross-domain connections worth noting"],
  "learnings": ["2-4 concrete things the person learned or understood today that can be applied later — skills demonstrated, concepts grasped, transitions from research to application"],
  "remember": ["3-5 specific things worth surfacing for future recall — recurring topics not yet formalized, entities that keep appearing, patterns in what gets explored vs. what gets built"],
  "questions": ["1-2 genuinely open questions a thoughtful outside observer would ask — questions the person themselves might not think to ask. Do not presuppose an emotional state, outcome, or conclusion."],
  "note_seeds": ["2-4 topics from today that most deserve their own permanent note — concepts that appeared across multiple activity types or represent clear learning moments"],
  "work_patterns": ["1-3 behavioral observations, e.g. 'sustained focus block on auth implementation', 'context switching between debugging and research'"],
  "cross_source_connections": ["1-2 meaningful connections across activity types, e.g. 'Researched OAuth patterns, then implemented the flow in the same session'"]
}

Write \`headline\` and \`tldr\` last — as final distillations after completing all other fields.
Themes are broad tags; topics are [[wikilink]] candidates; note seeds deserve standalone atomic notes.
Be specific and concrete. Refer to the topics and entities in the activity data above.
Write for a person reading their own notes 3 months from now — help them remember not just what happened, but what it meant and where they were in their work.
Only include category_summaries for activity types that had events.
`,

	deidentified: `You are building a daily note entry for a personal knowledge base using only aggregated statistical patterns. You are receiving ONLY distributions and meta-signals — no raw data, URLs, queries, commands, or per-event details. Your role is to synthesize cognitive patterns, focus quality, and learning behaviors into reflective intelligence this person can use to understand their own work rhythms over time and connect this day to their broader knowledge graph.{{contextHint}}

Date: {{dateStr}}

<pattern_analysis>
<focus_context>Focus score: {{focusScore}} | Peak activity hours: {{peakHours}}</focus_context>

<activity_distribution>
{{activityDist}}
</activity_distribution>

<temporal_clusters>
{{temporalShape}}
</temporal_clusters>

<topic_distribution>
{{topTopics}}
</topic_distribution>

<topic_connections>
{{topicConnections}}
</topic_connections>

<entity_cooccurrences>
{{entityClusters}}
</entity_cooccurrences>

<recurrence_signals>
{{recurrenceLines}}
</recurrence_signals>

<knowledge_delta>
{{knowledgeDeltaLines}}
</knowledge_delta>
</pattern_analysis>

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence capturing the day's cognitive character (max 15 words)",
  "work_story": "2-3 sentences describing the arc of the day's work based on the patterns — what the temporal clusters and topic distributions suggest about what was being built or solved, and how the focus evolved",
  "mindset": "1 sentence characterizing the cognitive mode — was this a research day, execution day, debugging day, or mixed mode? What does the focus score and temporal shape suggest?",
  "tldr": "2-3 sentences for future recall: the day's character, the knowledge accumulated, and what the patterns suggest about where this person's work is heading",
  "themes": ["3-5 broad theme tags for grouping this day with related days — inferred from topic distributions"],
  "topics": ["4-8 specific vault-linkable noun phrases — dominant concepts from today's topic distribution. Format as note titles for [[wikilinks]]: 'OAuth 2.0', 'React hooks'. Infer from the topic data; use consistent naming."],
  "entities": ["3-6 named entities inferred from the entity cluster data: specific tools, frameworks, or services that co-occurred prominently"],
  "category_summaries": {
    "<activity_type>": "1-sentence interpretation of what the person was doing in this activity type (infer from topic distribution, not raw data)"
  },
  "notable": ["2-4 notable patterns: unusual topic combinations, context-switching moments, research spirals, or decision points"],
  "learnings": ["2-4 things the person likely learned based on the patterns — transitions from research to application, topics that deepened, knowledge accumulation signals"],
  "remember": ["3-5 things worth surfacing for future recall — recurring topics not yet formalized, entities that keep appearing, patterns in what gets explored vs. built"],
  "questions": ["1-2 genuinely open questions based on what the patterns reveal — questions the person themselves might not think to ask. Do not presuppose conclusions. Focus on the 'why' behind recurring patterns or the unresolved shape of focus."],
  "note_seeds": ["2-4 topics from the distribution that most deserve their own permanent note — concepts that appeared across multiple clusters or represent clear knowledge accumulation"],
  "meta_insights": ["2-3 cognitive pattern observations: research-to-implementation ratio, topic depth vs breadth, attention fragmentation patterns, learning style indicators"],
  "quirky_signals": ["1-3 unusual or interesting signals: topics revisited but never formalized, contradictions between focus areas, rabbit holes, or unexpectedly connected interests"],
  "focus_narrative": "1-2 sentences on the day's cognitive character — was it a deep-dive day, a context-switching day, a research day, an execution day? What does the temporal shape suggest about how well this person directed their attention?",
  "work_patterns": ["1-3 behavioral observations inferred from temporal clusters, e.g. 'sustained morning focus block', 'fragmented afternoon attention across 4 topics'"],
  "cross_source_connections": ["1-2 patterns suggesting connections between activity types, e.g. 'Research topics align with the implementation cluster two hours later'"]
}

Write \`headline\` and \`tldr\` last — as final distillations after completing all other fields.
Be insightful and specific. You're analyzing work patterns for someone building their own knowledge base, not writing a task log. Look for:
- Research spirals (same topic approached from multiple angles over time)
- Implementation momentum (sustained, uninterrupted focus on building)
- Context-switching costs (fragmented clusters signal attention debt)
- Unformalized knowledge (topics explored repeatedly but never documented or resolved)
- Cross-pollination (unexpected connections between different topic clusters)
Themes are broad tags; topics are [[wikilink]] candidates; note seeds deserve standalone atomic notes.
Write for a person reading their own notes 3 months from now — help them understand their own cognitive patterns, not just recall events.
Only include category_summaries for activity types represented in the distribution.
`,

	prose: `You are writing sections of a daily note for a personal knowledge base. Below is a structured summary of today's activity (already processed by code). Your job is to add the human insight layer — narrative, synthesis, and connections that code can't produce.

Write for someone rereading this note 3 months from now. Be specific and concrete — prefer "debugged the OAuth callback race condition" over "did some dev work."{{contextHint}}

Date: {{dateStr}}

<activity_data>
{{activityData}}
</activity_data>

Write each section below using the exact heading format shown. You may vary section depth — write more where it matters, less where it doesn't.

## Headline
One punchy sentence (max 15 words) capturing the day's essential character.

## Day Story
2-3 sentences narrating the arc: what was being built or solved, how it evolved, what was discovered. Tell what changed from morning to evening.

## Mindset
1 sentence characterizing the working mode — exploring, building, debugging, synthesizing, learning? What energy or cognitive style drove the day?

## TLDR
2-3 sentences for future recall: key accomplishment, main learning, and what this day unlocks or sets up next.

## Learnings
Bullet list. 2-4 concrete things understood today that can be applied later — skills grasped, patterns recognized, capabilities gained.

## Remember
Bullet list. 3-5 specific things worth quick future recall: commands that worked, configurations found, resource names, approaches that succeeded or failed.

## Connections
1-2 sentences linking different activities: searches that led to commits, research that informed implementation, topics that bridged domains.

## Questions
1-2 genuinely open questions a thoughtful observer would ask. Don't presuppose emotions or outcomes. Focus on "why" behind patterns.

## Note Seeds
Bullet list. 2-4 topics from today that deserve their own permanent note — concepts that came up repeatedly or represent key learning moments.
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
 * Load the prose template appropriate for the given model capability.
 * Looks for prose-high.txt / prose-balanced.txt / prose-lite.txt in promptsDir;
 * falls back to the built-in "prose" template if the file doesn't exist.
 */
export function loadProseTemplate(capability: PromptCapability, promptsDir?: string): string {
	const name = capability === "high" ? "prose-high"
		: capability === "lite" ? "prose-lite"
		: "prose-balanced";
	if (promptsDir) {
		const filePath = join(promptsDir, `${name}.txt`);
		if (existsSync(filePath)) {
			return readFileSync(filePath, "utf-8");
		}
	}
	return BUILT_IN_PROMPTS.prose;
}

/**
 * Replace all {{variable}} placeholders in a template string.
 * Unknown variables are left unchanged.
 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}
