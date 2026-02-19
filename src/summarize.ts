import { CATEGORY_LABELS, scrubSecrets } from "./categorize";
import { chunkActivityData, estimateTokens } from "./chunker";
import { retrieveRelevantChunks } from "./embeddings";
import { AISummary, CategorizedVisits, ClassificationResult, EmbeddedChunk, RAGConfig, SearchQuery, ShellCommand, ClaudeSession, StructuredEvent } from "./types";
import { callAI, AICallConfig } from "./ai-client";

// Re-export for consumers that import from summarize
export type { AICallConfig } from "./ai-client";

// ── Prompt builder & summarizer ─────────────────────────

function buildPrompt(
	date: Date,
	categorized: CategorizedVisits,
	searches: SearchQuery[],
	shellCmds: ShellCommand[],
	claudeSessions: ClaudeSession[],
	profile: string
): string {
	const catLines: string[] = [];
	for (const [cat, visits] of Object.entries(categorized)) {
		const label = CATEGORY_LABELS[cat]?.[1] ?? cat;
		const domains = [...new Set(visits.map((v) => v.domain || ""))].slice(0, 8);
		const titles = visits
			.slice(0, 5)
			.map((v) => v.title?.slice(0, 60))
			.filter((t) => t);
		catLines.push(
			`  [${label}] domains: ${domains.join(", ")}` +
				(titles.length ? ` | sample titles: ${titles.join("; ")}` : "")
		);
	}

	const searchList = searches.slice(0, 20).map((s) => s.query);
	const claudeList = claudeSessions.slice(0, 10).map((e) => e.prompt.slice(0, 120));
	const shellList = shellCmds.slice(0, 15).map((e) => scrubSecrets(e.cmd).slice(0, 80));
	const contextHint = profile ? `\nUser profile context: ${profile}` : "";

	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	return `You are summarizing a person's digital activity for ${dateStr}.
Your job is to distill raw activity logs into useful, human-readable intelligence for a personal knowledge base.${contextHint}

## Browser activity by category:
${catLines.length ? catLines.join("\n") : "  (none)"}

## Search queries:
${searchList.length ? searchList.map((q) => `  - ${q}`).join("\n") : "  (none)"}

## Claude / AI prompts:
${claudeList.length ? claudeList.map((p) => `  - ${p}`).join("\n") : "  (none)"}

## Shell commands (secrets redacted):
${shellList.length ? shellList.map((c) => `  - ${c}`).join("\n") : "  (none)"}

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence summarizing the whole day (max 15 words)",
  "tldr": "2-3 sentence paragraph. What was this person focused on? What did they accomplish or investigate?",
  "themes": ["3-5 short theme labels inferred from activity, e.g. 'API integration', 'market research', 'debugging'"],
  "category_summaries": {
    "<category_name>": "1-sentence plain-English summary of what they did in this category"
  },
  "notable": ["2-4 specific notable things: interesting searches, unusual patterns, apparent decisions or pivots"],
  "questions": ["1-2 open questions this day's activity raises, useful for future reflection"]
}

Be specific and concrete. Prefer "researched OAuth 2.0 flows for a GitHub integration" over "did some dev work".
Only include category_summaries for categories that actually had activity.
Do not include categories with zero visits.`;
}

// ── RAG-aware prompt builder ────────────────────────────

function buildRAGPrompt(
	date: Date,
	retrievedChunks: EmbeddedChunk[],
	profile: string
): string {
	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	const contextHint = profile ? `\nUser profile context: ${profile}` : "";

	const chunkTexts = retrievedChunks
		.map(
			(c, i) =>
				`--- Activity Block ${i + 1} (${c.type}${c.category ? `: ${c.category}` : ""}) ---\n${c.text}`
		)
		.join("\n\n");

	return `You are summarizing a person's digital activity for ${dateStr}.
Your job is to distill activity logs into useful, human-readable intelligence for a personal knowledge base.${contextHint}

The following activity blocks were selected as the most relevant from today's data:

${chunkTexts}

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence summarizing the whole day (max 15 words)",
  "tldr": "2-3 sentence paragraph. What was this person focused on? What did they accomplish or investigate?",
  "themes": ["3-5 short theme labels inferred from activity, e.g. 'API integration', 'market research', 'debugging'"],
  "category_summaries": {
    "<category_name>": "1-sentence plain-English summary of what they did in this category"
  },
  "notable": ["2-4 specific notable things: interesting searches, unusual patterns, apparent decisions or pivots"],
  "questions": ["1-2 open questions this day's activity raises, useful for future reflection"]
}

Be specific and concrete. Prefer "researched OAuth 2.0 flows for a GitHub integration" over "did some dev work".
Only include category_summaries for categories represented in the activity blocks above.`;
}

// ── Classified prompt builder (Phase 2) ─────────────────
// Sends ONLY structured abstractions — zero raw URLs, queries, commands, or prompts.

export function buildClassifiedPrompt(
	date: Date,
	classification: ClassificationResult,
	profile: string
): string {
	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	const contextHint = profile ? `\nUser profile context: ${profile}` : "";

	// Group events by activityType
	const byType: Record<string, StructuredEvent[]> = {};
	for (const event of classification.events) {
		if (!byType[event.activityType]) {
			byType[event.activityType] = [];
		}
		byType[event.activityType].push(event);
	}

	const sections: string[] = [];
	for (const [activityType, events] of Object.entries(byType)) {
		const typeTopics = [...new Set(events.flatMap((ev: StructuredEvent) => ev.topics))];
		const typeEntities = [...new Set(events.flatMap((ev: StructuredEvent) => ev.entities))];
		const summaries = events.map((ev: StructuredEvent) => `  - ${ev.summary}`).join("\n");

		sections.push(
			`### ${activityType} (${events.length} events)\n` +
			`Topics: ${typeTopics.join(", ") || "none"}\n` +
			`Entities: ${typeEntities.join(", ") || "none"}\n` +
			`Activities:\n${summaries}`
		);
	}

	// Collect all unique topics and entities across events
	const allTopics = [...new Set(classification.events.flatMap((ev: StructuredEvent) => ev.topics))];
	const allEntities = [...new Set(classification.events.flatMap((ev: StructuredEvent) => ev.entities))];

	return `You are summarizing a person's digital activity for ${dateStr}.
Your job is to distill classified activity abstractions into useful, human-readable intelligence for a personal knowledge base.${contextHint}

## Activity Overview
Total events: ${classification.totalProcessed} (${classification.llmClassified} LLM-classified, ${classification.ruleClassified} rule-classified)
All topics: ${allTopics.join(", ") || "none"}
All entities: ${allEntities.join(", ") || "none"}

## Activity by Type
${sections.length ? sections.join("\n\n") : "(no classified events)"}

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence summarizing the whole day (max 15 words)",
  "tldr": "2-3 sentence paragraph. What was this person focused on? What did they accomplish or investigate?",
  "themes": ["3-5 short theme labels inferred from activity, e.g. 'API integration', 'market research', 'debugging'"],
  "category_summaries": {
    "<activity_type>": "1-sentence plain-English summary of what they did in this activity type"
  },
  "notable": ["2-4 specific notable things: interesting patterns, apparent decisions or pivots, cross-domain connections"],
  "questions": ["1-2 open questions this day's activity raises, useful for future reflection"]
}

Be specific and concrete. Refer to the topics and entities mentioned.
Only include category_summaries for activity types that had events.`;
}

// ── Main summarization entry point ──────────────────────

export async function summarizeDay(
	date: Date,
	categorized: CategorizedVisits,
	searches: SearchQuery[],
	shellCmds: ShellCommand[],
	claudeSessions: ClaudeSession[],
	config: AICallConfig,
	profile: string,
	ragConfig?: RAGConfig,
	classification?: ClassificationResult
): Promise<AISummary> {
	let prompt: string;

	// If classification is available and provider is Anthropic, use classified prompt
	// (data stays abstract — no raw URLs/commands/queries sent externally)
	if (classification && classification.events.length > 0 && config.provider === "anthropic") {
		prompt = buildClassifiedPrompt(date, classification, profile);
		console.debug(
			`Daily Digest: Using classified prompt for Anthropic ` +
			`(${classification.events.length} events, ${classification.llmClassified} LLM-classified)`
		);
	} else if (ragConfig?.enabled) {
		const chunks = chunkActivityData(
			date, categorized, searches, shellCmds, claudeSessions
		);
		const totalTokens = chunks.reduce(
			(sum, c) => sum + estimateTokens(c.text), 0
		);

		if (chunks.length > 2 && totalTokens > 500) {
			try {
				const retrieved = await retrieveRelevantChunks(
					chunks,
					ragConfig.embeddingEndpoint,
					ragConfig.embeddingModel,
					ragConfig.topK
				);
				prompt = buildRAGPrompt(date, retrieved, profile);
				console.debug(
					`Daily Digest RAG: Using RAG prompt (${retrieved.length} chunks, ` +
					`~${estimateTokens(prompt)} tokens)`
				);
			} catch (e) {
				console.warn(
					"Daily Digest: RAG pipeline failed, falling back to standard prompt:",
					e
				);
				prompt = buildPrompt(
					date, categorized, searches, shellCmds, claudeSessions, profile
				);
			}
		} else {
			console.debug(
				`Daily Digest RAG: Skipping RAG (${chunks.length} chunks, ` +
				`${totalTokens} tokens — too small)`
			);
			prompt = buildPrompt(
				date, categorized, searches, shellCmds, claudeSessions, profile
			);
		}
	} else {
		prompt = buildPrompt(
			date, categorized, searches, shellCmds, claudeSessions, profile
		);
	}

	const raw = await callAI(prompt, config, 1000);

	// Strip markdown fences if the model wrapped it
	const cleaned = raw
		.replace(/^```json?\s*/m, "")
		.replace(/\s*```$/m, "")
		.trim();

	try {
		return JSON.parse(cleaned) as AISummary;
	} catch {
		return {
			headline: "Activity summary unavailable",
			tldr: cleaned.slice(0, 400),
			themes: [],
			category_summaries: {},
			notable: [],
			questions: [],
		};
	}
}
