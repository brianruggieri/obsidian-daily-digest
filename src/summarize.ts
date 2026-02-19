import { CATEGORY_LABELS, scrubSecrets } from "./categorize";
import { chunkActivityData, estimateTokens } from "./chunker";
import { retrieveRelevantChunks } from "./embeddings";
import { AISummary, CategorizedVisits, ClassificationResult, PatternAnalysis, EmbeddedChunk, RAGConfig, SearchQuery, ShellCommand, ClaudeSession, StructuredEvent, slugifyQuestion } from "./types";
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

## Claude Code / AI prompts:
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

// ── De-identified prompt builder (Phase 4) ──────────────
// Sends ONLY aggregated patterns and statistics — zero per-event data.
// The most privacy-preserving prompt tier. Used when PatternAnalysis
// is available and the provider is Anthropic.
//
// What IS sent:   topic frequency distributions, entity co-occurrence
//                 clusters, temporal activity shapes, recurrence trends,
//                 focus score, knowledge delta counts.
// What is NOT:    individual event summaries, per-event topics, raw data
//                 of any kind, timestamps of individual events.

export function buildDeidentifiedPrompt(
	date: Date,
	patterns: PatternAnalysis,
	profile: string
): string {
	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	const contextHint = profile ? `\nUser profile context: ${profile}` : "";

	// ── Activity distribution (counts only, no per-event data) ──
	const activityDist = patterns.topActivityTypes
		.map((a) => `  ${a.type}: ${a.count} events (${a.pct}%)`)
		.join("\n");

	// ── Temporal shape (cluster labels only) ──
	const temporalShape = patterns.temporalClusters.length > 0
		? patterns.temporalClusters
			.slice(0, 6)
			.map((c) => `  ${c.label} (${c.eventCount} events, intensity ${c.intensity.toFixed(1)}/hr)`)
			.join("\n")
		: "  No significant clusters detected.";

	// ── Topic distribution (aggregated counts) ──
	const topicCounts: Record<string, number> = {};
	for (const cluster of patterns.temporalClusters) {
		for (const topic of cluster.topics) {
			topicCounts[topic] = (topicCounts[topic] || 0) + cluster.eventCount;
		}
	}
	const topTopics = Object.entries(topicCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 12)
		.map(([topic, count]) => `  ${topic}: ~${count} events`)
		.join("\n") || "  (no topics extracted)";

	// ── Entity clusters (co-occurrence pairs only) ──
	const entityClusters = patterns.entityRelations.length > 0
		? patterns.entityRelations
			.slice(0, 8)
			.map((r) => `  ${r.entityA} \u2194 ${r.entityB} (${r.cooccurrences}x, in: ${r.contexts.join(", ")})`)
			.join("\n")
		: "  No entity co-occurrences detected.";

	// ── Topic co-occurrences (strongest connections) ──
	const topicConnections = patterns.topicCooccurrences
		.filter((c) => c.strength >= 0.3)
		.slice(0, 8)
		.map((c) => `  ${c.topicA} \u2194 ${c.topicB} (strength: ${c.strength.toFixed(2)})`)
		.join("\n") || "  No strong topic connections.";

	// ── Recurrence signals (trend labels only) ──
	const recurrenceLines: string[] = [];
	const newTopics = patterns.recurrenceSignals.filter((s) => s.trend === "new");
	const returning = patterns.recurrenceSignals.filter((s) => s.trend === "returning");
	const rising = patterns.recurrenceSignals.filter((s) => s.trend === "rising");
	const stable = patterns.recurrenceSignals.filter((s) => s.trend === "stable");

	if (newTopics.length > 0) {
		recurrenceLines.push(`  New explorations: ${newTopics.map((s) => s.topic).join(", ")}`);
	}
	if (returning.length > 0) {
		recurrenceLines.push(`  Returning interests: ${returning.map((s) => `${s.topic} (${s.dayCount} days total)`).join(", ")}`);
	}
	if (rising.length > 0) {
		recurrenceLines.push(`  Trending up: ${rising.map((s) => s.topic).join(", ")}`);
	}
	if (stable.length > 0) {
		recurrenceLines.push(`  Ongoing: ${stable.map((s) => s.topic).join(", ")}`);
	}
	const recurrenceStr = recurrenceLines.length > 0
		? recurrenceLines.join("\n")
		: "  No recurrence data available.";

	// ── Knowledge delta (counts and labels) ──
	const delta = patterns.knowledgeDelta;
	const deltaLines = [
		delta.newTopics.length > 0 ? `  New topics: ${delta.newTopics.join(", ")}` : null,
		delta.recurringTopics.length > 0 ? `  Recurring: ${delta.recurringTopics.join(", ")}` : null,
		delta.novelEntities.length > 0 ? `  New entities: ${delta.novelEntities.join(", ")}` : null,
		delta.connections.length > 0 ? `  Cross-connections: ${delta.connections.join("; ")}` : null,
	].filter(Boolean).join("\n") || "  No knowledge delta data.";

	// ── Peak hours ──
	const peakStr = patterns.peakHours.length > 0
		? patterns.peakHours.slice(0, 3).map((p) => {
			const h = p.hour;
			const label = h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
			return `${label} (${p.count})`;
		}).join(", ")
		: "unknown";

	return `You are a cognitive pattern analyst reviewing a person's aggregated digital activity for ${dateStr}.
You are receiving ONLY statistical patterns and aggregated distributions — no raw data, URLs, search queries, commands, or individual event details. Your role is to provide meta-insights about cognitive patterns, focus, and learning behaviors.${contextHint}

## Day Shape
Focus score: ${Math.round(patterns.focusScore * 100)}% (${patterns.focusScore >= 0.7 ? "highly focused" : patterns.focusScore >= 0.5 ? "moderately focused" : patterns.focusScore >= 0.3 ? "varied" : "widely scattered"})
Peak activity hours: ${peakStr}

## Activity Distribution
${activityDist || "  (no activity data)"}

## Temporal Clusters
${temporalShape}

## Topic Distribution (aggregated)
${topTopics}

## Topic Connections
${topicConnections}

## Entity Clusters
${entityClusters}

## Recurrence Patterns
${recurrenceStr}

## Knowledge Delta
${deltaLines}

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
  "focus_narrative": "A 1-2 sentence narrative about the day's focus pattern — was it a deep-dive day, a context-switching day, a research day, an execution day? What does the temporal shape suggest?"
}

Be insightful and specific. You're a cognitive coach analyzing work patterns, not a task tracker. Look for:
- Research spirals (same topic approached from multiple angles over time)
- Implementation momentum (sustained focus on building)
- Context-switching costs (fragmented clusters suggest attention debt)
- Unformalized knowledge (topics explored repeatedly but never documented)
- Cross-pollination (unexpected connections between different topic clusters)
Only include category_summaries for activity types represented in the distribution.`;
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
	classification?: ClassificationResult,
	patterns?: PatternAnalysis
): Promise<AISummary> {
	let prompt: string;
	let maxTokens = 1000;

	// Privacy escalation chain for Anthropic:
	//   1. De-identified (patterns available) — ONLY aggregated statistics, zero per-event data
	//   2. Classified (classification available) — per-event abstractions, no raw data
	//   3. RAG / Standard — raw data (sanitized), least private
	// Local provider always uses full context since data stays on machine.

	if (patterns && config.provider === "anthropic") {
		// Phase 4: Maximum privacy — aggregated patterns only
		prompt = buildDeidentifiedPrompt(date, patterns, profile);
		maxTokens = 1500; // Larger response for meta-insights
		console.debug(
			`Daily Digest: Using de-identified prompt for Anthropic ` +
			`(${patterns.temporalClusters.length} clusters, ` +
			`focus ${Math.round(patterns.focusScore * 100)}%, ` +
			`${patterns.recurrenceSignals.length} recurrence signals)`
		);
	} else if (classification && classification.events.length > 0 && config.provider === "anthropic") {
		// Phase 2: Per-event abstractions — no raw data
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

	const raw = await callAI(prompt, config, maxTokens);

	// Strip markdown fences if the model wrapped it
	const cleaned = raw
		.replace(/^```json?\s*/m, "")
		.replace(/\s*```$/m, "")
		.trim();

	try {
		const summary = JSON.parse(cleaned) as AISummary;
		// Derive structured prompts with stable IDs from plain question strings
		if (summary.questions?.length) {
			const seen = new Set<string>();
			summary.prompts = summary.questions.map((q) => {
				let id = slugifyQuestion(q);
				// Deduplicate IDs by appending a suffix
				const base = id;
				let n = 2;
				while (seen.has(id)) {
					id = `${base}_${n++}`;
				}
				seen.add(id);
				return { id, question: q };
			});
		}
		return summary;
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
