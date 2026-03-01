import { CATEGORY_LABELS } from "../filter/categorize";
import { estimateTokens } from "./chunker";
import { CompressedActivity } from "./compress";
import { AISummary, CategorizedVisits, ClassificationResult, PatternAnalysis, SearchQuery, ClaudeSession, StructuredEvent, GitCommit, ArticleCluster } from "../types";
import { callAI, AICallConfig } from "./ai-client";
import { loadPromptTemplate, loadProseTemplate, fillTemplate, PromptCapability } from "./prompt-templates";
import { parseProseSections } from "./prose-parser";
import { getFocusLabel } from "../analyze/patterns";
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
		? getFocusLabel(focusScore).toLowerCase()
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
		? getFocusLabel(focusScore).toLowerCase()
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
	const focusLabel = getFocusLabel(patterns.focusScore).toLowerCase();

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
		const focusLabel = getFocusLabel(patterns.focusScore).toLowerCase();
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
  "reflections": [{"theme": "short-kebab-case-id", "text": "1-2 sentences: state what you noticed, then ask a short direct question"}],
  "note_seeds": ["2-4 topics from today that most deserve their own permanent note — concepts that came up repeatedly or represent key learning moments"]${metaFields}
}

Write \`headline\` and \`tldr\` last — as final distillations after completing all other fields.
Themes are broad tags for cross-day filtering. Topics are specific [[wikilink]] candidates. Note seeds deserve standalone atomic notes.
Be specific and concrete. Prefer "debugged the OAuth callback race condition in the auth module" over "did some dev work".
Only include category_summaries for categories or activity types that had actual activity.
Write for a person reading their own notes 3 months from now — help them remember what it felt like, what they understood, and where they were in their work.

Reflections: Return 1-3 reflection prompts depending on the day's complexity — fewer for focused days, more for scattered ones. Each object has: "theme" = short kebab-case topic ID (e.g. job-search, tool-boundaries, focus-pattern) — prefer reusing common themes across days when the topic recurs; "text" = 1-2 sentences: first state what you noticed in the data, then ask a short direct question (under 15 words). Use contractions. Sound like a thoughtful friend, not an analyst. Use second person (you).`;
}

// ── Privacy tier resolution (sync, no network) ──────────

export type PrivacyTier = 1 | 2 | 3 | 4;

// ── Privacy tier helpers ─────────────────────────────────

/**
 * Resolve the privacy tier for a given AI call.
 * This is the sole tier-routing function — both the main plugin and the
 * matrix script call this to determine what data reaches the AI prompt.
 *
 * Patterns always run (free, on-device), so all 4 tiers are always available.
 * - Anthropic + explicit tier → use it (1-4)
 * - Anthropic + null (auto)  → default to 4 (most private)
 * - Local provider           → always 1 (data stays on machine)
 */
export function resolvePrivacyTier(
	config: AICallConfig,
	privacyTier?: number | null
): 1 | 2 | 3 | 4 {
	if (config.provider !== "anthropic") return 1;

	if (privacyTier !== null && privacyTier !== undefined) {
		const clamped = Math.max(1, Math.min(4, privacyTier)) as 1 | 2 | 3 | 4;
		return clamped;
	}

	return 4;
}

/** Data options object passed to buildProsePrompt. */
export type ProseOptions = {
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
		// Compressed activity + patterns + classification
		return {
			compressed: full.compressed,
			classification: full.classification,
			patterns: full.patterns,
			articleClusters: full.articleClusters,
		};
	}
	// Tier 1: raw arrays (full granularity) + classification + patterns
	// Excludes `compressed` so the prompt builder renders raw arrays
	// instead of budget-compressed text — this is what distinguishes
	// Tier 1 (full detail) from Tier 2 (budget-compressed).
	return {
		categorized: full.categorized,
		searches: full.searches,
		claudeSessions: full.claudeSessions,
		gitCommits: full.gitCommits,
		classification: full.classification,
		patterns: full.patterns,
		articleClusters: full.articleClusters,
	};
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
		const focusLabel = getFocusLabel(patterns.focusScore).toLowerCase();
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

// ── Prompt builder (extract for preview) ────────────────

export interface SummaryPromptResult {
	prompt: string;
	tier: 1 | 2 | 3 | 4;
	capability: PromptCapability;
	tokenEstimate: number;
}

/**
 * Build the AI prompt without sending it. Returns the prompt string,
 * resolved tier, capability level, and estimated token count.
 * Used by the prompt preview modal to show what will be sent.
 */
export function buildSummaryPrompt(
	date: Date,
	categorized: CategorizedVisits,
	searches: SearchQuery[],
	claudeSessions: ClaudeSession[],
	config: AICallConfig,
	profile: string,
	classification?: ClassificationResult,
	patterns?: PatternAnalysis,
	compressed?: CompressedActivity,
	gitCommits?: GitCommit[],
	promptsDir?: string,
	articleClusters?: ArticleCluster[],
	privacyTier?: number | null
): SummaryPromptResult {
	const tier = resolvePrivacyTier(config, privacyTier);
	const proseOptions = buildTierFilteredOptions(tier, {
		categorized, searches, claudeSessions, gitCommits: gitCommits ?? [],
		compressed, classification, patterns, articleClusters,
	});
	const modelName = config.provider === "anthropic" ? config.anthropicModel : config.localModel;
	const capability = resolvePromptCapability(modelName, config.provider);
	const prompt = buildProsePrompt(date, profile, proseOptions, promptsDir, capability, tier);
	return {
		prompt,
		tier,
		capability,
		tokenEstimate: estimateTokens(prompt),
	};
}

/**
 * Send a pre-built prompt to the AI and parse the response.
 * Used when the user edits the prompt in the preview modal.
 */
export async function summarizeDayWithPrompt(
	prompt: string,
	config: AICallConfig,
): Promise<AISummary> {
	const raw = await callAI(prompt, config, 1500, undefined, false);
	return parseProseSections(raw);
}

// ── Main summarization entry point ──────────────────────

export async function summarizeDay(
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
	promptsDir?: string,
	articleClusters?: ArticleCluster[],
	privacyTier?: number | null
): Promise<AISummary> {
	// ── Guard: skip AI call when no activity data is available ──
	const hasVisits = Object.values(categorized).some((categoryVisits) => categoryVisits.length > 0);
	const hasActivity = hasVisits || searches.length > 0 ||
		claudeSessions.length > 0 || gitCommits.length > 0;
	if (!hasActivity) {
		return {
			headline: "",
			tldr: "",
			themes: [],
			category_summaries: {},
			notable: [],
			questions: [],
		};
	}

	const { prompt, tier, capability, tokenEstimate } = buildSummaryPrompt(
		date, categorized, searches, claudeSessions, config, profile,
		classification, patterns, compressed, gitCommits, promptsDir,
		articleClusters, privacyTier
	);

	log.debug(
		`Daily Digest: Summarizing ` +
		`(tier=${tier}, capability=${capability}, ` +
		`~${tokenEstimate} prompt tokens, provider=${config.provider})`
	);

	return summarizeDayWithPrompt(prompt, config);
}
