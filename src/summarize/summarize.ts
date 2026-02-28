import { CATEGORY_LABELS } from "../filter/categorize";
import { chunkActivityData, estimateTokens } from "./chunker";
import { retrieveRelevantChunks } from "./embeddings";
import { CompressedActivity } from "./compress";
import { AISummary, CategorizedVisits, ClassificationResult, PatternAnalysis, EmbeddedChunk, RAGConfig, SearchQuery, ClaudeSession, StructuredEvent, slugifyQuestion, GitCommit, ArticleCluster } from "../types";
import { callAI, AICallConfig } from "./ai-client";
import { loadPromptTemplate, loadProseTemplate, fillTemplate, PromptCapability } from "./prompt-templates";
import { parseProseSections } from "./prose-parser";
import { PromptStrategy } from "../settings/types";
import * as log from "../plugin/log";

// ── Prompt builder & summarizer ─────────────────────────

export function buildPrompt(
	date: Date,
	categorized: CategorizedVisits,
	searches: SearchQuery[],
	claudeSessions: ClaudeSession[],
	profile: string,
	gitCommits: GitCommit[] = [],
	promptsDir?: string,
	focusScore?: number
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
	const gitList = gitCommits.slice(0, 20).map((c) => `  - [${c.repo}] ${c.message.slice(0, 80)}`);
	const contextHint = profile ? `\nUser profile context: ${profile}` : "";

	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	const focusLabel = focusScore !== undefined
		? (focusScore >= 0.7 ? "highly focused" : focusScore >= 0.5 ? "moderately focused" : focusScore >= 0.3 ? "varied" : "widely scattered")
		: "";
	const focusHint = focusScore !== undefined
		? `\nEstimated focus score: ${Math.round(focusScore * 100)}% (${focusLabel})`
		: "";

	const vars: Record<string, string> = {
		dateStr,
		contextHint,
		focusHint,
		browserActivity: catLines.length ? catLines.join("\n") : "  (none)",
		searches: searchList.length ? searchList.map((q) => `  - ${q}`).join("\n") : "  (none)",
		claudePrompts: claudeList.length ? claudeList.map((p) => `  - ${p}`).join("\n") : "  (none)",
		gitCommits: gitList.length ? gitList.join("\n") : "  (none)",
	};
	return fillTemplate(loadPromptTemplate("standard", promptsDir), vars);
}

// ── Compressed prompt builder (full-day mode) ───────────
// Uses pre-compressed activity data from compress.ts. This path is taken
// when collectionMode === "complete" — it replaces the fixed-cap slicing
// in buildPrompt with budget-aware proportional compression.

function buildCompressedPrompt(
	date: Date,
	compressed: CompressedActivity,
	profile: string,
	promptsDir?: string,
	focusScore?: number
): string {
	const contextHint = profile ? `\nUser profile context: ${profile}` : "";
	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	const focusLabel = focusScore !== undefined
		? (focusScore >= 0.7 ? "highly focused" : focusScore >= 0.5 ? "moderately focused" : focusScore >= 0.3 ? "varied" : "widely scattered")
		: "";
	const focusHint = focusScore !== undefined
		? `\nEstimated focus score: ${Math.round(focusScore * 100)}% (${focusLabel})`
		: "";

	const vars: Record<string, string> = {
		dateStr,
		contextHint,
		focusHint,
		totalEvents: String(compressed.totalEvents),
		browserActivity: compressed.browserText,
		searches: compressed.searchText,
		claudePrompts: compressed.claudeText,
		gitCommits: compressed.gitText,
	};
	return fillTemplate(loadPromptTemplate("compressed", promptsDir), vars);
}

// ── RAG-aware prompt builder ────────────────────────────

function buildRAGPrompt(
	date: Date,
	retrievedChunks: EmbeddedChunk[],
	profile: string,
	promptsDir?: string,
	focusScore?: number
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

	const focusLabel = focusScore !== undefined
		? (focusScore >= 0.7 ? "highly focused" : focusScore >= 0.5 ? "moderately focused" : focusScore >= 0.3 ? "varied" : "widely scattered")
		: "";
	const focusHint = focusScore !== undefined
		? `\nEstimated focus score: ${Math.round(focusScore * 100)}% (${focusLabel})`
		: "";

	const vars: Record<string, string> = {
		dateStr,
		contextHint,
		focusHint,
		chunkTexts,
	};
	return fillTemplate(loadPromptTemplate("rag", promptsDir), vars);
}

// ── Classified prompt builder (Phase 2) ─────────────────
// Sends ONLY structured abstractions — zero raw URLs, queries, commands, or prompts.

export function buildClassifiedPrompt(
	date: Date,
	classification: ClassificationResult,
	profile: string,
	promptsDir?: string,
	focusScore?: number
): string {
	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	const contextHint = profile ? `\nUser profile context: ${profile}` : "";

	const focusLabel = focusScore !== undefined
		? (focusScore >= 0.7 ? "highly focused" : focusScore >= 0.5 ? "moderately focused" : focusScore >= 0.3 ? "varied" : "widely scattered")
		: "";
	const focusHint = focusScore !== undefined
		? `\nEstimated focus score: ${Math.round(focusScore * 100)}% (${focusLabel})`
		: "";

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

	const vars: Record<string, string> = {
		dateStr,
		contextHint,
		focusHint,
		totalProcessed: String(classification.totalProcessed),
		llmClassified: String(classification.llmClassified),
		ruleClassified: String(classification.ruleClassified),
		allTopics: allTopics.join(", ") || "none",
		allEntities: allEntities.join(", ") || "none",
		activitySections: sections.join("\n\n") || "(no classified events)",
	};
	return fillTemplate(loadPromptTemplate("classified", promptsDir), vars);
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
	profile: string,
	promptsDir?: string
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
		.join("\n") || "  (no activity data)";

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
	const knowledgeDeltaLines = [
		delta.newTopics.length > 0 ? `  New topics: ${delta.newTopics.join(", ")}` : null,
		delta.recurringTopics.length > 0 ? `  Recurring: ${delta.recurringTopics.join(", ")}` : null,
		delta.novelEntities.length > 0 ? `  New entities: ${delta.novelEntities.join(", ")}` : null,
		delta.connections.length > 0 ? `  Cross-connections: ${delta.connections.join("; ")}` : null,
	].filter(Boolean).join("\n") || "  No knowledge delta data.";

	// ── Peak hours ──
	const peakHours = patterns.peakHours.length > 0
		? patterns.peakHours.slice(0, 3).map((p) => {
			const h = p.hour;
			const label = h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
			return `${label} (${p.count})`;
		}).join(", ")
		: "unknown";

	// ── Focus label ──
	const focusLabel = patterns.focusScore >= 0.7
		? "highly focused"
		: patterns.focusScore >= 0.5
			? "moderately focused"
			: patterns.focusScore >= 0.3
				? "varied"
				: "widely scattered";

	const vars: Record<string, string> = {
		dateStr,
		contextHint,
		focusScore: `${Math.round(patterns.focusScore * 100)}% (${focusLabel})`,
		peakHours,
		activityDist,
		temporalShape,
		topTopics,
		topicConnections,
		entityClusters,
		recurrenceLines: recurrenceStr,
		knowledgeDeltaLines,
	};
	return fillTemplate(loadPromptTemplate("deidentified", promptsDir), vars);
}

// ── Unified prompt builder (local provider) ─────────────
// Merges all available data layers — raw activity, classification, and
// statistical patterns — into a single prompt for local providers.
// Privacy escalation is not needed; data stays on device.
// The output schema scales with context richness.

export function buildUnifiedPrompt(
	date: Date,
	profile: string,
	options: {
		categorized?: CategorizedVisits;
		searches?: SearchQuery[];
		claudeSessions?: ClaudeSession[];
		gitCommits?: GitCommit[];
		compressed?: CompressedActivity;
		classification?: ClassificationResult;
		patterns?: PatternAnalysis;
	}
): string {
	const {
		categorized, searches, claudeSessions, gitCommits,
		compressed, classification, patterns,
	} = options;

	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	const contextHint = profile ? `\nContext about this person: ${profile}` : "";
	const sections: string[] = [];

	// ── Layer 1: Statistical patterns (highest-level view) ──
	if (patterns) {
		const activityDist = patterns.topActivityTypes
			.map((a) => `  ${a.type}: ${a.count} events (${a.pct}%)`)
			.join("\n");
		const temporalShape = patterns.temporalClusters.length > 0
			? patterns.temporalClusters.slice(0, 6)
				.map((c) => `  ${c.label} (${c.eventCount} events, ${c.intensity.toFixed(1)}/hr)`)
				.join("\n")
			: "  No significant clusters detected.";
		const topicCounts: Record<string, number> = {};
		for (const cluster of patterns.temporalClusters) {
			for (const topic of cluster.topics) {
				topicCounts[topic] = (topicCounts[topic] || 0) + cluster.eventCount;
			}
		}
		const topTopics = Object.entries(topicCounts)
			.sort((a, b) => b[1] - a[1]).slice(0, 12)
			.map(([topic, count]) => `  ${topic}: ~${count} events`)
			.join("\n") || "  (none)";
		const topicConnections = patterns.topicCooccurrences
			.filter((c) => c.strength >= 0.3).slice(0, 8)
			.map((c) => `  ${c.topicA} \u2194 ${c.topicB} (strength: ${c.strength.toFixed(2)})`)
			.join("\n") || "  None.";
		const entityClusters = patterns.entityRelations.length > 0
			? patterns.entityRelations.slice(0, 8)
				.map((r) => `  ${r.entityA} \u2194 ${r.entityB} (${r.cooccurrences}x, in: ${r.contexts.join(", ")})`)
				.join("\n")
			: "  None detected.";
		const recurrenceLines: string[] = [];
		const newTopics = patterns.recurrenceSignals.filter((s) => s.trend === "new");
		const returning = patterns.recurrenceSignals.filter((s) => s.trend === "returning");
		const rising = patterns.recurrenceSignals.filter((s) => s.trend === "rising");
		const stable = patterns.recurrenceSignals.filter((s) => s.trend === "stable");
		if (newTopics.length > 0) recurrenceLines.push(`  New explorations: ${newTopics.map((s) => s.topic).join(", ")}`);
		if (returning.length > 0) recurrenceLines.push(`  Returning: ${returning.map((s) => `${s.topic} (${s.dayCount}d)`).join(", ")}`);
		if (rising.length > 0) recurrenceLines.push(`  Trending up: ${rising.map((s) => s.topic).join(", ")}`);
		if (stable.length > 0) recurrenceLines.push(`  Ongoing: ${stable.map((s) => s.topic).join(", ")}`);
		const delta = patterns.knowledgeDelta;
		const deltaLines = [
			delta.newTopics.length > 0 ? `  New topics: ${delta.newTopics.join(", ")}` : null,
			delta.recurringTopics.length > 0 ? `  Recurring: ${delta.recurringTopics.join(", ")}` : null,
			delta.novelEntities.length > 0 ? `  New entities: ${delta.novelEntities.join(", ")}` : null,
			delta.connections.length > 0 ? `  Cross-connections: ${delta.connections.join("; ")}` : null,
		].filter(Boolean).join("\n") || "  None.";
		const focusLabel = patterns.focusScore >= 0.7 ? "highly focused"
			: patterns.focusScore >= 0.5 ? "moderately focused"
			: patterns.focusScore >= 0.3 ? "varied"
			: "widely scattered";
		const peakStr = patterns.peakHours.length > 0
			? patterns.peakHours.slice(0, 3).map((p) => {
				const h = p.hour;
				const label = h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
				return `${label} (${p.count} events)`;
			}).join(", ")
			: "unknown";
		sections.push(`<pattern_analysis>
<focus_context>Focus score: ${Math.round(patterns.focusScore * 100)}% (${focusLabel}) | Peak hours: ${peakStr}</focus_context>

<activity_distribution>
${activityDist || "  (none)"}
</activity_distribution>

<temporal_clusters>
${temporalShape}
</temporal_clusters>

<topic_distribution>
${topTopics}
</topic_distribution>

<topic_connections>
${topicConnections}
</topic_connections>

<entity_cooccurrences>
${entityClusters}
</entity_cooccurrences>

<recurrence_signals>
${recurrenceLines.length > 0 ? recurrenceLines.join("\n") : "  None."}
</recurrence_signals>

<knowledge_delta>
${deltaLines}
</knowledge_delta>
</pattern_analysis>`);
	}

	// ── Layer 2: Structured classification (mid-level) ──
	if (classification && classification.events.length > 0) {
		const byType: Record<string, StructuredEvent[]> = {};
		for (const event of classification.events) {
			if (!byType[event.activityType]) byType[event.activityType] = [];
			byType[event.activityType].push(event);
		}
		const typeSections: string[] = [];
		const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
		const escText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
		for (const [activityType, events] of Object.entries(byType)) {
			const typeTopics = [...new Set(events.flatMap((ev) => ev.topics))];
			const typeEntities = [...new Set(events.flatMap((ev) => ev.entities))];
			typeSections.push(
				`<activity_type name="${escAttr(activityType)}" count="${events.length}">\n` +
				`Topics: ${typeTopics.map(escText).join(", ") || "none"}\n` +
				`Entities: ${typeEntities.map(escText).join(", ") || "none"}\n` +
				`Activities:\n${events.map((ev) => `  - ${escText(ev.summary)}`).join("\n")}\n` +
				`</activity_type>`
			);
		}
		sections.push(`<structured_activity total_events="${classification.totalProcessed}" llm_classified="${classification.llmClassified}">
${typeSections.join("\n\n")}
</structured_activity>`);
	}

	// ── Layer 3: Raw activity log (most concrete) ──
	if (compressed) {
		sections.push(`<raw_activity total_events="${compressed.totalEvents}">
<browser_activity>
${compressed.browserText}
</browser_activity>

<search_queries>
${compressed.searchText}
</search_queries>

<ai_sessions>
${compressed.claudeText}
</ai_sessions>

<git_commits>
${compressed.gitText}
</git_commits>
</raw_activity>`);
	} else if (categorized || searches?.length || claudeSessions?.length || gitCommits?.length) {
		const catLines: string[] = [];
		if (categorized) {
			for (const [cat, visits] of Object.entries(categorized)) {
				const label = CATEGORY_LABELS[cat]?.[1] ?? cat;
				const domains = [...new Set(visits.map((v) => v.domain || ""))].slice(0, 8);
				const titles = visits.slice(0, 5).map((v) => v.title?.slice(0, 60)).filter((t) => t);
				catLines.push(`  [${label}] domains: ${domains.join(", ")}` +
					(titles.length ? ` | titles: ${titles.join("; ")}` : ""));
			}
		}
		const searchList = (searches ?? []).slice(0, 20).map((s) => `  - ${s.query}`);
		const claudeList = (claudeSessions ?? []).slice(0, 10).map((e) => `  - ${e.prompt.slice(0, 120)}`);
		const gitList = (gitCommits ?? []).slice(0, 20).map((c) => `  - [${c.repo}] ${c.message.slice(0, 80)}`);
		sections.push(`<raw_activity>
<browser_activity>
${catLines.length ? catLines.join("\n") : "  (none)"}
</browser_activity>

<search_queries>
${searchList.length ? searchList.join("\n") : "  (none)"}
</search_queries>

<ai_sessions>
${claudeList.length ? claudeList.join("\n") : "  (none)"}
</ai_sessions>

<git_commits>
${gitList.length ? gitList.join("\n") : "  (none)"}
</git_commits>
</raw_activity>`);
	}

	const hasRichContext = !!(patterns || classification);
	const metaFields = hasRichContext ? `
  "focus_narrative": "1-2 sentences on the day's cognitive character — deep-dive, execution, research, or scattered? What does the temporal shape suggest about how well this person directed their attention?",
  "meta_insights": ["2-3 cognitive pattern observations: research-to-implementation ratio, depth vs breadth, attention fragmentation, learning style signals"],
  "quirky_signals": ["1-3 unusual signals: topics revisited but never formalized, unexpected cross-domain connections, rabbit holes, contradictions between stated focus and actual behavior"]` : "";

	return `You are building a daily note entry for a personal knowledge base. Your task is to synthesize this person's digital activity into meaningful, reflective intelligence — not just a log of what happened, but a clear picture of their focus, learning, and the arc of the day's work. You have access to multiple levels of data — use all of them. This note will be read during personal reflection and linked to ongoing projects and future notes in the vault.${contextHint}

Date: ${dateStr}

${sections.join("\n\n")}

The sections above represent the same day at different levels of granularity — statistical patterns, structured abstractions, and raw activity logs. Synthesize across all available layers to produce observations richer than any single layer would support. Use the patterns layer as a calibrating prior, the structured layer as evidence of what those patterns mean, and the raw layer for concrete specifics.

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence capturing the day's essential character (max 15 words)",
  "work_story": "2-3 sentences narrating the arc of the day's actual work — what was really being built or solved, how understanding evolved, what was discovered or decided. Tell the story: what changed from start to end of the day?",
  "mindset": "1 sentence characterizing the working mode today — exploring, building, debugging, synthesizing, learning? What energy or cognitive style characterized the day?",
  "tldr": "2-3 sentences for future recall: key accomplishment, main learning, and what this day unlocks or sets up next",
  "themes": ["3-5 broad theme tags for grouping this day with related days — e.g. 'authentication', 'debugging', 'market-research'"],
  "topics": ["4-8 specific vault-linkable noun phrases — the actual concepts, tools, or methods worked with today. Format as note titles for use as [[wikilinks]]: 'OAuth 2.0', 'React hooks', 'PostgreSQL indexing'. Use consistent naming across sessions."],
  "entities": ["3-6 named tools, libraries, frameworks, services, or APIs encountered today"],
  "category_summaries": {
    "<category_or_activity_type>": "1-sentence summary of what they were doing in this area"
  },
  "notable": ["2-4 specific notable things: interesting searches, decisions, pivots, or things worth linking to other notes"],
  "learnings": ["2-4 concrete things the person learned or understood today that can be applied later — skills grasped, patterns recognized, things they can now do that they couldn't before"],
  "remember": ["3-5 specific things worth noting for quick future recall: commands that worked, configurations found, key resource names, approaches that succeeded or failed"],
  "questions": ["1-2 genuinely open questions a thoughtful outside observer would ask after reading this — questions the person themselves might not think to ask. Do not presuppose an emotional state, outcome, or conclusion. Focus on the 'why' behind patterns, not just 'what happened next'."],
  "note_seeds": ["2-4 topics from today that most deserve their own permanent note — concepts that came up repeatedly or represent key learning moments"]${metaFields}
}

Write \`headline\` and \`tldr\` last — as final distillations after completing all other fields.
Themes are broad tags for cross-day filtering. Topics are specific [[wikilink]] candidates. Note seeds deserve standalone atomic notes.
Be specific and concrete. Prefer "debugged the OAuth callback race condition in the auth module" over "did some dev work".
Only include category_summaries for categories or activity types that had actual activity.
Write for a person reading their own notes 3 months from now — help them remember what it felt like, what they understood, and where they were in their work.`;
}

// ── Privacy tier resolution (sync, no network) ──────────

export type PrivacyTier = 1 | 2 | 3 | 4;

export interface PromptResolution {
	prompt: string;
	tier: PrivacyTier;
	maxTokens: number;
}

/**
 * Routes to a specific forced tier, falling back to Tier 1 with a warning
 * if the requested tier's data is unavailable.
 */
function buildTierForced(
	tier: number,
	date: Date,
	categorized: CategorizedVisits,
	searches: SearchQuery[],
	claudeSessions: ClaudeSession[],
	config: AICallConfig,
	profile: string,
	classification?: ClassificationResult,
	patterns?: PatternAnalysis,
	compressed?: CompressedActivity,
	gitCommits: GitCommit[] = [],
	promptsDir?: string
): PromptResolution {
	const standardPrompt = () =>
		compressed
			? buildCompressedPrompt(date, compressed, profile, promptsDir, patterns?.focusScore)
			: buildPrompt(date, categorized, searches, claudeSessions, profile, gitCommits, promptsDir, patterns?.focusScore);

	switch (tier) {
		case 4:
			if (patterns) {
				return { prompt: buildDeidentifiedPrompt(date, patterns, profile, promptsDir), tier: 4, maxTokens: 1500 };
			}
			log.warn("Daily Digest: Tier 4 override requested but no patterns available, falling back to Tier 1");
			return { prompt: standardPrompt(), tier: 1, maxTokens: 1000 };
		case 3:
			if (classification && classification.events.length > 0) {
				return {
					prompt: buildClassifiedPrompt(date, classification, profile, promptsDir, patterns?.focusScore),
					tier: 3,
					maxTokens: 1000,
				};
			}
			log.warn("Daily Digest: Tier 3 override requested but no classification available, falling back to Tier 1");
			return { prompt: standardPrompt(), tier: 1, maxTokens: 1000 };
		case 2:
			return { prompt: standardPrompt(), tier: 2, maxTokens: 1000 };
		case 1:
		default:
			return { prompt: standardPrompt(), tier: 1, maxTokens: 1000 };
	}
}

/**
 * Resolve which prompt to build and which privacy tier it corresponds to,
 * based on available data layers and the AI provider.
 *
 * This is the synchronous, non-network portion of the privacy escalation
 * chain. The async RAG path (tier 2 with actual chunk retrieval) is handled
 * only inside `summarizeDay`; this function returns tier 2 with a standard
 * prompt as a placeholder for the tier label when RAG is enabled.
 *
 * Privacy escalation for Anthropic:
 *   Tier 4: De-identified — aggregated patterns only, zero per-event data
 *   Tier 3: Classified — per-event abstractions, no raw URLs
 *   Tier 2: RAG — retrieval-selected chunks (async path in summarizeDay)
 *   Tier 1: Standard — sanitized raw activity data
 * Local provider always uses the unified prompt (all layers, stays on device).
 */
export function resolvePromptAndTier(
	date: Date,
	categorized: CategorizedVisits,
	searches: SearchQuery[],
	claudeSessions: ClaudeSession[],
	config: AICallConfig,
	profile: string,
	ragConfig?: RAGConfig,
	classification?: ClassificationResult,
	patterns?: PatternAnalysis,
	compressed?: CompressedActivity,
	gitCommits: GitCommit[] = [],
	promptsDir?: string,
	privacyTierOverride?: number | null
): PromptResolution {
	const standardPrompt = () =>
		compressed
			? buildCompressedPrompt(date, compressed, profile, promptsDir, patterns?.focusScore)
			: buildPrompt(date, categorized, searches, claudeSessions, profile, gitCommits, promptsDir, patterns?.focusScore);

	// Explicit tier override bypasses auto-escalation
	if (privacyTierOverride !== null && privacyTierOverride !== undefined) {
		return buildTierForced(
			privacyTierOverride, date, categorized, searches, claudeSessions,
			config, profile, classification, patterns, compressed, gitCommits, promptsDir
		);
	}

	if (patterns && config.provider === "anthropic") {
		return {
			prompt: buildDeidentifiedPrompt(date, patterns, profile, promptsDir),
			tier: 4,
			maxTokens: 1500,
		};
	} else if (classification && classification.events.length > 0 && config.provider === "anthropic") {
		return {
			prompt: buildClassifiedPrompt(date, classification, profile, promptsDir, patterns?.focusScore),
			tier: 3,
			maxTokens: 1000,
		};
	} else if (config.provider === "local") {
		return {
			prompt: buildUnifiedPrompt(date, profile, {
				categorized,
				searches,
				claudeSessions,
				gitCommits,
				compressed,
				classification: classification?.events.length ? classification : undefined,
				patterns,
			}),
			tier: 1,
			maxTokens: patterns ? 1500 : 1000,
		};
	} else if (ragConfig?.enabled) {
		// RAG requires async chunk retrieval — return the standard prompt as a
		// placeholder. The actual RAG prompt is built inside summarizeDay.
		return { prompt: standardPrompt(), tier: 2, maxTokens: 1000 };
	} else {
		return { prompt: standardPrompt(), tier: 1, maxTokens: 1000 };
	}
}

// ── Privacy tier helpers ─────────────────────────────────

/**
 * Resolve the privacy tier for a prose-strategy call, applying the same
 * escalation logic used by the monolithic-json path in resolvePromptAndTier().
 */
export function resolvePrivacyTier(
	config: AICallConfig,
	classification?: ClassificationResult,
	patterns?: PatternAnalysis,
	ragConfig?: RAGConfig,
	privacyTierOverride?: number | null
): 1 | 2 | 3 | 4 {
	if (privacyTierOverride !== null && privacyTierOverride !== undefined) {
		return privacyTierOverride as 1 | 2 | 3 | 4;
	}
	if (config.provider !== "anthropic") return 1;
	if (patterns) return 4;
	if (classification?.events.length) return 3;
	if (ragConfig?.enabled) return 2;
	return 1;
}

/** Data options object passed to buildProsePrompt. */
type ProseOptions = {
	categorized?: CategorizedVisits;
	searches?: SearchQuery[];
	claudeSessions?: ClaudeSession[];
	gitCommits?: GitCommit[];
	compressed?: CompressedActivity;
	classification?: ClassificationResult;
	patterns?: PatternAnalysis;
	articleClusters?: ArticleCluster[];
};

/**
 * Filter the full options object to only include data layers appropriate
 * for the resolved privacy tier.
 */
export function buildTierFilteredOptions(
	tier: 1 | 2 | 3 | 4,
	full: ProseOptions
): ProseOptions {
	if (tier === 4) {
		// Aggregated statistics + semantic patterns only — no raw text
		return {
			patterns: full.patterns,
			articleClusters: full.articleClusters,
		};
	}
	if (tier === 3) {
		// Classified abstractions + patterns — no raw browser/search/git text
		return {
			classification: full.classification,
			patterns: full.patterns,
			articleClusters: full.articleClusters,
		};
	}
	if (tier === 2) {
		// RAG-selected chunks + patterns + classification
		return {
			compressed: full.compressed,
			classification: full.classification,
			patterns: full.patterns,
			articleClusters: full.articleClusters,
		};
	}
	// Tier 1: everything
	return full;
}

/**
 * Resolve the prompt complexity tier based on model and provider.
 * Sonnet/Opus → "high" (full schema), Haiku / large local → "balanced",
 * small local models → "lite".
 */
export function resolvePromptCapability(model: string, provider: string): PromptCapability {
	if (provider === "anthropic") {
		if (/sonnet|opus/i.test(model)) return "high";
		return "balanced";
	}
	if (provider === "local") {
		if (/\b(14b|22b|32b|70b)\b/i.test(model)) return "balanced";
		return "lite";
	}
	return "balanced";
}

// ── Prose prompt builder ─────────────────────────────────
// Builds a prose-format prompt that asks for heading-delimited markdown
// instead of JSON. Uses the same activity data as the JSON prompts.

export function buildProsePrompt(
	date: Date,
	profile: string,
	options: ProseOptions,
	promptsDir?: string,
	capability: PromptCapability = "balanced",
	tier: 1 | 2 | 3 | 4 = 1
): string {
	const {
		categorized, searches, claudeSessions, gitCommits,
		compressed, classification, patterns, articleClusters,
	} = options;

	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	const contextHint = profile ? `\nContext about this person: ${profile}` : "";

	// Assemble activity data from available layers (same layering as unified prompt)
	const dataSections: string[] = [];

	// Layer 0: Semantic work sessions (pre-digested by extraction layer)
	if (patterns) {
		const semanticLines: string[] = [];

		// Commit work units — skip generic/WIP
		const units = (patterns.commitWorkUnits ?? []).filter(u => !u.isGeneric);
		if (units.length > 0) {
			semanticLines.push("Work sessions (from git):");
			for (const unit of units.slice(0, 5)) {
				semanticLines.push(`  - [${unit.workMode}] ${unit.commits.length} commits: "${unit.label}" (${unit.repos.join(", ")})`);
			}
		}

		// Claude task sessions
		const taskSessions = patterns.claudeTaskSessions ?? [];
		if (taskSessions.length > 0) {
			semanticLines.push("AI task sessions:");
			for (const session of taskSessions.slice(0, 5)) {
				const depthLabel = session.isDeepLearning ? "deep exploration"
					: session.interactionMode === "exploration" ? "exploration"
					: "implementation";
				semanticLines.push(`  - "${session.taskTitle}" (${session.turnCount} turns, ${depthLabel})`);
			}
		}

		// Article clusters (from browser reading)
		const clusters = articleClusters ?? [];
		if (clusters.length > 0) {
			semanticLines.push("Reading clusters (from browser):");
			for (const cluster of clusters.slice(0, 4)) {
				semanticLines.push(`  - ${cluster.label} (${cluster.articles.length} articles, intent: ${cluster.intentSignal})`);
			}
		}

		if (semanticLines.length > 0) {
			dataSections.push(semanticLines.join("\n"));
		}
	}

	// Layer 1: Statistical patterns summary
	if (patterns) {
		const focusLabel = patterns.focusScore >= 0.7 ? "highly focused"
			: patterns.focusScore >= 0.5 ? "moderately focused"
			: patterns.focusScore >= 0.3 ? "varied"
			: "widely scattered";
		const activityDist = patterns.topActivityTypes
			.map((a) => `  ${a.type}: ${a.count} events (${a.pct}%)`)
			.join("\n");
		const clusters = patterns.temporalClusters.slice(0, 6)
			.map((c) => `  ${c.label} (${c.eventCount} events, ${c.intensity.toFixed(1)}/hr)`)
			.join("\n");
		dataSections.push(
			`Focus: ${Math.round(patterns.focusScore * 100)}% (${focusLabel})` +
			(activityDist ? `\nActivity distribution:\n${activityDist}` : "") +
			(clusters ? `\nTemporal clusters:\n${clusters}` : "")
		);
	}

	// Layer 2: Classified abstractions
	if (classification && classification.events.length > 0) {
		const byType: Record<string, StructuredEvent[]> = {};
		for (const event of classification.events) {
			if (!byType[event.activityType]) byType[event.activityType] = [];
			byType[event.activityType].push(event);
		}
		const typeSections: string[] = [];
		for (const [activityType, events] of Object.entries(byType)) {
			const summaries = events.slice(0, 5).map((ev) => `  - ${ev.summary}`).join("\n");
			typeSections.push(`${activityType} (${events.length}):\n${summaries}`);
		}
		dataSections.push(`Classified activity:\n${typeSections.join("\n")}`);
	}

	// Layer 3: Raw activity
	if (compressed) {
		dataSections.push(
			`Browser activity:\n${compressed.browserText}\n` +
			`Searches:\n${compressed.searchText}\n` +
			`AI sessions:\n${compressed.claudeText}\n` +
			`Git commits:\n${compressed.gitText}`
		);
	} else if (categorized || searches?.length || claudeSessions?.length || gitCommits?.length) {
		const catLines: string[] = [];
		if (categorized) {
			for (const [cat, visits] of Object.entries(categorized)) {
				const label = CATEGORY_LABELS[cat]?.[1] ?? cat;
				const domains = [...new Set(visits.map((v) => v.domain || ""))].slice(0, 8);
				catLines.push(`  [${label}] ${domains.join(", ")}`);
			}
		}
		const searchList = (searches ?? []).slice(0, 20).map((s) => `  - ${s.query}`);
		const claudeList = (claudeSessions ?? []).slice(0, 10).map((e) => `  - ${e.prompt.slice(0, 120)}`);
		const gitList = (gitCommits ?? []).slice(0, 20).map((c) => `  - [${c.repo}] ${c.message.slice(0, 80)}`);
		dataSections.push(
			`Browser activity:\n${catLines.length ? catLines.join("\n") : "  (none)"}\n` +
			`Searches:\n${searchList.length ? searchList.join("\n") : "  (none)"}\n` +
			`AI sessions:\n${claudeList.length ? claudeList.join("\n") : "  (none)"}\n` +
			`Git commits:\n${gitList.length ? gitList.join("\n") : "  (none)"}`
		);
	}

	const activityData = dataSections.join("\n\n");

	const tierInstruction = tier === 4
		? "You are working from statistical patterns only. Do not invent specific events, names, or entities. Every claim must be inferrable from the pattern data provided.\n\n"
		: tier === 3
		? "You are working from classified activity abstractions. Do not invent specific URLs, domain names, or verbatim queries.\n\n"
		: "";

	const vars: Record<string, string> = {
		dateStr,
		contextHint,
		activityData: activityData || "(no activity data available)",
		tierInstruction,
	};
	return fillTemplate(loadProseTemplate(capability, promptsDir), vars);
}

// ── Main summarization entry point ──────────────────────

export async function summarizeDay(
	date: Date,
	categorized: CategorizedVisits,
	searches: SearchQuery[],
	claudeSessions: ClaudeSession[],
	config: AICallConfig,
	profile: string,
	ragConfig?: RAGConfig,
	classification?: ClassificationResult,
	patterns?: PatternAnalysis,
	compressed?: CompressedActivity,
	gitCommits: GitCommit[] = [],
	promptsDir?: string,
	promptStrategy: PromptStrategy = "monolithic-json",
	articleClusters?: ArticleCluster[],
	privacyTierOverride?: number | null
): Promise<AISummary> {
	// ── Prose strategy: heading-delimited markdown output ──
	if (promptStrategy === "single-prose") {
		// Resolve privacy tier and filter data layers accordingly
		const tier = resolvePrivacyTier(config, classification, patterns, ragConfig, privacyTierOverride);
		const proseOptions = buildTierFilteredOptions(tier, {
			categorized, searches, claudeSessions, gitCommits,
			compressed, classification, patterns, articleClusters,
		});

		const modelName = config.provider === "anthropic" ? config.anthropicModel : config.localModel;
		const capability = resolvePromptCapability(modelName, config.provider);
		const prompt = buildProsePrompt(date, profile, proseOptions, promptsDir, capability, tier);

		log.debug(
			`Daily Digest: Using single-prose strategy ` +
			`(tier=${tier}, capability=${capability}, ` +
			`~${estimateTokens(prompt)} prompt tokens, provider=${config.provider})`
		);

		const raw = await callAI(prompt, config, 1500, undefined, false);
		return parseProseSections(raw);
	}

	// ── JSON strategy (monolithic-json): existing behavior ──
	let prompt: string;
	let maxTokens = 1000;

	if (ragConfig?.enabled) {
		// Async RAG path — kept here because it requires network calls.
		const chunks = chunkActivityData(
			date, categorized, searches, claudeSessions
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
				prompt = buildRAGPrompt(date, retrieved, profile, promptsDir, patterns?.focusScore);
				log.debug(
					`Daily Digest RAG: Using RAG prompt (${retrieved.length} chunks, ` +
					`~${estimateTokens(prompt)} tokens)`
				);
			} catch (e) {
				log.warn(
					"Daily Digest: RAG pipeline failed, falling back to standard prompt:",
					e
				);
				const fallback = resolvePromptAndTier(
					date, categorized, searches, claudeSessions, config, profile,
					undefined, classification, patterns, compressed, gitCommits, promptsDir
				);
				prompt = fallback.prompt;
				maxTokens = fallback.maxTokens;
			}
		} else {
			log.debug(
				`Daily Digest RAG: Skipping RAG (${chunks.length} chunks, ` +
				`${totalTokens} tokens — too small)`
			);
			const fallback = resolvePromptAndTier(
				date, categorized, searches, claudeSessions, config, profile,
				undefined, classification, patterns, compressed, gitCommits, promptsDir, privacyTierOverride
			);
			prompt = fallback.prompt;
			maxTokens = fallback.maxTokens;
		}
	} else {
		const resolution = resolvePromptAndTier(
			date, categorized, searches, claudeSessions, config, profile,
			undefined, classification, patterns, compressed, gitCommits, promptsDir, privacyTierOverride
		);
		prompt = resolution.prompt;
		maxTokens = resolution.maxTokens;

		// Debug logging for non-RAG paths
		if (patterns && config.provider === "anthropic") {
			log.debug(
				`Daily Digest: Using de-identified prompt for Anthropic ` +
				`(${patterns.temporalClusters.length} clusters, ` +
				`focus ${Math.round(patterns.focusScore * 100)}%, ` +
				`${patterns.recurrenceSignals.length} recurrence signals)`
			);
		} else if (classification && classification.events.length > 0 && config.provider === "anthropic") {
			log.debug(
				`Daily Digest: Using classified prompt for Anthropic ` +
				`(${classification.events.length} events, ${classification.llmClassified} LLM-classified)`
			);
		} else if (config.provider === "local") {
			log.debug(
				`Daily Digest: Using unified prompt for local provider ` +
				`(raw=${!!(compressed ?? Object.keys(categorized).length)}, ` +
				`classified=${!!(classification?.events.length)}, ` +
				`patterns=${!!patterns})`
			);
		}
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
