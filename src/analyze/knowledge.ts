/**
 * Knowledge Unit Generation — Phase 3.
 *
 * Takes PatternAnalysis and produces knowledge-oriented markdown sections
 * for the daily note renderer: topic maps, entity graphs, temporal insights,
 * recurrence tracking, and focus analysis.
 *
 * This module generates structured text — no LLM calls, no vault writes.
 * The renderer integrates these sections into the final markdown.
 */

import {
	ArticleCluster,
	ClaudeTaskSession,
	CommitWorkUnit,
	PatternAnalysis,
	TemporalCluster,
	RecurrenceSignal,
} from "../types";

// ── Knowledge Sections ─────────────────────────────────

export interface KnowledgeSections {
	focusSummary: string;
	focusScore: number;
	temporalInsights: string[];
	topicMap: string[];
	entityGraph: string[];
	recurrenceNotes: string[];
	knowledgeDeltaLines: string[];
	tags: string[];
	/** Article clusters produced by TF-IDF clustering of substantive browser visits. */
	articleClusters?: ArticleCluster[];
	/** Commit work units produced by the semantic extraction layer. */
	commitWorkUnits?: CommitWorkUnit[];
	/** Claude task sessions produced by the semantic extraction layer. */
	claudeTaskSessions?: ClaudeTaskSession[];
}

export function generateKnowledgeSections(
	patterns: PatternAnalysis
): KnowledgeSections {
	return {
		focusSummary: buildFocusSummary(patterns),
		focusScore: patterns.focusScore,
		temporalInsights: buildTemporalInsights(patterns.temporalClusters, patterns.peakHours),
		topicMap: buildTopicMap(patterns),
		entityGraph: buildEntityGraph(patterns),
		recurrenceNotes: buildRecurrenceNotes(patterns.recurrenceSignals),
		knowledgeDeltaLines: buildKnowledgeDeltaLines(patterns),
		tags: generateTags(patterns),
		commitWorkUnits: patterns.commitWorkUnits,
		claudeTaskSessions: patterns.claudeTaskSessions,
	};
}

// ── Focus Summary ──────────────────────────────────────

function buildFocusSummary(patterns: PatternAnalysis): string {
	const score = patterns.focusScore;
	const topTypes = patterns.topActivityTypes.slice(0, 3);

	let focusLevel: string;
	if (score >= 0.7) focusLevel = "Highly focused";
	else if (score >= 0.5) focusLevel = "Moderately focused";
	else if (score >= 0.3) focusLevel = "Varied";
	else focusLevel = "Widely scattered";

	const typeBreakdown = topTypes
		.map((t) => `${t.type} (${t.pct}%)`)
		.join(", ");

	const peakStr = patterns.peakHours.length > 0
		? ` Peak activity: ${patterns.peakHours.slice(0, 2).map((p) => formatHour(p.hour)).join(", ")}.`
		: "";

	return `${focusLevel} day (focus score: ${Math.round(score * 100)}%). ` +
		`Primary activity: ${typeBreakdown}.${peakStr}`;
}

function formatHour(h: number): string {
	if (h === 0) return "12am";
	if (h < 12) return `${h}am`;
	if (h === 12) return "12pm";
	return `${h - 12}pm`;
}

// ── Temporal Insights ──────────────────────────────────

function buildTemporalInsights(
	clusters: TemporalCluster[],
	peakHours: { hour: number; count: number }[]
): string[] {
	const lines: string[] = [];

	if (clusters.length === 0 && peakHours.length === 0) {
		return ["No significant activity clusters detected."];
	}

	// Top clusters as narrative
	for (const cluster of clusters.slice(0, 4)) {
		const intensityLabel = cluster.intensity >= 5
			? "intense" : cluster.intensity >= 3
				? "steady" : "light";
		const topicStr = cluster.topics.length > 0
			? ` focused on ${cluster.topics.slice(0, 3).join(", ")}`
			: "";
		lines.push(
			`${cluster.label} \u2014 ${intensityLabel} (${cluster.eventCount} events)${topicStr}`
		);
	}

	return lines;
}

// ── Topic Map ──────────────────────────────────────────

function buildTopicMap(patterns: PatternAnalysis): string[] {
	const lines: string[] = [];

	// Topic co-occurrence pairs (strongest connections)
	const strong = patterns.topicCooccurrences.filter((c) => c.strength >= 0.3);

	if (strong.length > 0) {
		for (const pair of strong.slice(0, 8)) {
			const strengthBar = pair.strength >= 0.7 ? "\u2588\u2588\u2588"
				: pair.strength >= 0.5 ? "\u2588\u2588"
					: "\u2588";
			lines.push(`${strengthBar} ${pair.topicA} \u2194 ${pair.topicB} (${pair.sharedEvents} co-occurrences)`);
		}
	}

	// If no co-occurrences, show top topics from activity distribution
	if (lines.length === 0) {
		const allTopics = patterns.temporalClusters
			.flatMap((c) => c.topics);
		const topicCounts: Record<string, number> = {};
		for (const t of allTopics) {
			topicCounts[t] = (topicCounts[t] || 0) + 1;
		}
		const sorted = Object.entries(topicCounts)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 8);
		for (const [topic, count] of sorted) {
			lines.push(`\u2022 ${topic} (${count} mentions)`);
		}
	}

	return lines;
}

// ── Entity Graph ───────────────────────────────────────

function buildEntityGraph(patterns: PatternAnalysis): string[] {
	const lines: string[] = [];

	for (const rel of patterns.entityRelations.slice(0, 10)) {
		const contexts = rel.contexts.join(", ");
		lines.push(
			`${rel.entityA} \u2194 ${rel.entityB} (${rel.cooccurrences}x in ${contexts})`
		);
	}

	return lines;
}

// ── Recurrence Notes ───────────────────────────────────

function buildRecurrenceNotes(signals: RecurrenceSignal[]): string[] {
	const lines: string[] = [];

	const newTopics = signals.filter((s) => s.trend === "new");
	const returning = signals.filter((s) => s.trend === "returning");
	const rising = signals.filter((s) => s.trend === "rising");
	const stable = signals.filter((s) => s.trend === "stable");

	if (newTopics.length > 0) {
		lines.push(`**New today:** ${newTopics.map((s) => s.topic).join(", ")}`);
	}

	if (returning.length > 0) {
		for (const sig of returning.slice(0, 3)) {
			const daysSinceFirst = sig.firstSeen
				? Math.floor((Date.now() - new Date(sig.firstSeen).getTime()) / (1000 * 60 * 60 * 24))
				: 0;
			lines.push(
				`**Returning:** ${sig.topic} \u2014 seen ${sig.dayCount} times over ${daysSinceFirst} days`
			);
		}
	}

	if (rising.length > 0) {
		lines.push(
			`**Trending up:** ${rising.map((s) => `${s.topic} (${s.dayCount} days)`).join(", ")}`
		);
	}

	if (stable.length > 0) {
		lines.push(
			`**Ongoing:** ${stable.map((s) => `${s.topic} (${s.dayCount} days)`).join(", ")}`
		);
	}

	return lines;
}

// ── Knowledge Delta Lines ──────────────────────────────

function buildKnowledgeDeltaLines(patterns: PatternAnalysis): string[] {
	const delta = patterns.knowledgeDelta;
	const lines: string[] = [];

	if (delta.newTopics.length > 0) {
		lines.push(`New topics explored: ${delta.newTopics.join(", ")}`);
	}

	if (delta.recurringTopics.length > 0) {
		lines.push(`Continued work on: ${delta.recurringTopics.join(", ")}`);
	}

	if (delta.novelEntities.length > 0) {
		lines.push(`New tools/entities: ${delta.novelEntities.join(", ")}`);
	}

	if (delta.connections.length > 0) {
		lines.push(`Cross-topic connections: ${delta.connections.join("; ")}`);
	}

	return lines;
}

// ── Tag Generation ─────────────────────────────────────

const TAG_CAP = 20;
const TAG_MIN_SCORE = 0.1;

interface ScoredTag {
	tag: string;
	score: number;
}

function generateTags(patterns: PatternAnalysis): string[] {
	const scored: ScoredTag[] = [];

	// Activity type tags — always included (top 3 are inherently meaningful)
	for (const at of patterns.topActivityTypes.slice(0, 3)) {
		scored.push({ tag: `activity/${at.type}`, score: Math.max(at.pct / 100, 0.5) });
	}

	// Topic tags from clusters — score = cluster intensity / max intensity (0–1)
	const maxIntensity = patterns.temporalClusters.length > 0
		? Math.max(...patterns.temporalClusters.map((c) => c.intensity))
		: 1;
	const topicsSeen = new Set<string>();
	for (const cluster of patterns.temporalClusters) {
		const clusterScore = maxIntensity > 0 ? cluster.intensity / maxIntensity : 0;
		for (const topic of cluster.topics.slice(0, 2)) {
			const tag = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
			if (tag.length > 2 && !topicsSeen.has(tag)) {
				topicsSeen.add(tag);
				scored.push({ tag: `topic/${tag}`, score: clusterScore });
			}
		}
	}

	// Entity tags — score = co-occurrence count / max co-occurrence count (0–1)
	const maxCooccurrence = patterns.entityRelations.length > 0
		? Math.max(...patterns.entityRelations.map((r) => r.cooccurrences))
		: 1;
	const entitySeen = new Set<string>();
	for (const rel of patterns.entityRelations.slice(0, 5)) {
		const relScore = maxCooccurrence > 0 ? rel.cooccurrences / maxCooccurrence : 0;
		for (const entity of [rel.entityA, rel.entityB]) {
			const tag = entity.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
			if (tag.length > 2 && !entitySeen.has(tag)) {
				entitySeen.add(tag);
				scored.push({ tag: `entity/${tag}`, score: relScore });
			}
		}
	}

	// Pattern tags — score = 1.0 (always meaningful, at most 4)
	const newSignals = patterns.recurrenceSignals.filter((s) => s.trend === "new");
	if (newSignals.length > 0) scored.push({ tag: "pattern/new-exploration", score: 1.0 });

	const returningSignals = patterns.recurrenceSignals.filter((s) => s.trend === "returning");
	if (returningSignals.length > 0) scored.push({ tag: "pattern/returning-interest", score: 1.0 });

	if (patterns.focusScore >= 0.7) scored.push({ tag: "pattern/deep-focus", score: 1.0 });
	else if (patterns.focusScore <= 0.3) scored.push({ tag: "pattern/scattered", score: 1.0 });

	// Filter by minimum threshold, sort by score descending, cap at TAG_CAP
	return scored
		.filter((s) => s.score >= TAG_MIN_SCORE)
		.sort((a, b) => b.score - a.score)
		.slice(0, TAG_CAP)
		.map((s) => s.tag);
}
