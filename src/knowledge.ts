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
	PatternAnalysis,
	TemporalCluster,
	RecurrenceSignal,
} from "./types";

// ── Knowledge Sections ─────────────────────────────────

export interface KnowledgeSections {
	focusSummary: string;
	temporalInsights: string[];
	topicMap: string[];
	entityGraph: string[];
	recurrenceNotes: string[];
	knowledgeDeltaLines: string[];
	tags: string[];
}

export function generateKnowledgeSections(
	patterns: PatternAnalysis
): KnowledgeSections {
	return {
		focusSummary: buildFocusSummary(patterns),
		temporalInsights: buildTemporalInsights(patterns.temporalClusters, patterns.peakHours),
		topicMap: buildTopicMap(patterns),
		entityGraph: buildEntityGraph(patterns),
		recurrenceNotes: buildRecurrenceNotes(patterns.recurrenceSignals),
		knowledgeDeltaLines: buildKnowledgeDeltaLines(patterns),
		tags: generateTags(patterns),
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

function generateTags(patterns: PatternAnalysis): string[] {
	const tags: string[] = [];

	// Activity type tags
	for (const at of patterns.topActivityTypes.slice(0, 3)) {
		tags.push(`activity/${at.type}`);
	}

	// Topic tags from clusters
	const topicsSeen = new Set<string>();
	for (const cluster of patterns.temporalClusters) {
		for (const topic of cluster.topics.slice(0, 2)) {
			const tag = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
			if (tag.length > 2 && !topicsSeen.has(tag)) {
				topicsSeen.add(tag);
				tags.push(`topic/${tag}`);
			}
		}
	}

	// Entity tags
	const entitySeen = new Set<string>();
	for (const rel of patterns.entityRelations.slice(0, 5)) {
		for (const entity of [rel.entityA, rel.entityB]) {
			const tag = entity.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
			if (tag.length > 2 && !entitySeen.has(tag)) {
				entitySeen.add(tag);
				tags.push(`entity/${tag}`);
			}
		}
	}

	// Recurrence tags
	const newSignals = patterns.recurrenceSignals.filter((s) => s.trend === "new");
	if (newSignals.length > 0) tags.push("pattern/new-exploration");

	const returningSignals = patterns.recurrenceSignals.filter((s) => s.trend === "returning");
	if (returningSignals.length > 0) tags.push("pattern/returning-interest");

	// Focus tag
	if (patterns.focusScore >= 0.7) tags.push("pattern/deep-focus");
	else if (patterns.focusScore <= 0.3) tags.push("pattern/scattered");

	return tags;
}
