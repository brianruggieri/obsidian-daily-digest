/**
 * Pattern Extraction — Phase 3.
 *
 * Takes StructuredEvent[] from classification and extracts:
 *   - Temporal clusters: activity concentration patterns by hour
 *   - Topic co-occurrences: topics appearing in same time windows
 *   - Entity relations: entities that co-occur across events
 *   - Recurrence signals: topic frequency trends across days
 *   - Knowledge delta: new vs. recurring topics relative to vault
 *
 * All computation is local and statistical — no LLM calls.
 */

import {
	ActivityType,
	ClaudeSession,
	GitCommit,
	ArticleCluster,
	SearchQuery,
	BrowserVisit,
	StructuredEvent,
	ClassificationResult,
	TemporalCluster,
	TopicCooccurrence,
	EntityRelation,
	RecurrenceSignal,
	KnowledgeDelta,
	PatternAnalysis,
	PatternConfig,
} from "../types";
import { groupCommitsIntoWorkUnits } from "./commits";
import { groupClaudeSessionsIntoTasks, detectSearchMissions, fuseCrossSourceSessions } from "./task-sessions";

// ── Temporal Clustering ────────────────────────────────

interface HourBucket {
	hour: number;
	events: StructuredEvent[];
}

function bucketByHour(events: StructuredEvent[]): HourBucket[] {
	const buckets: Map<number, StructuredEvent[]> = new Map();

	for (const event of events) {
		if (!event.timestamp) continue;
		const date = new Date(event.timestamp);
		if (isNaN(date.getTime())) continue;
		const hour = date.getHours();
		if (!buckets.has(hour)) buckets.set(hour, []);
		buckets.get(hour)!.push(event);
	}

	return Array.from(buckets.entries())
		.map(([hour, evts]) => ({ hour, events: evts }))
		.sort((a, b) => a.hour - b.hour);
}

function formatHour(h: number): string {
	if (h === 0) return "12am";
	if (h < 12) return `${h}am`;
	if (h === 12) return "12pm";
	return `${h - 12}pm`;
}

function extractTemporalClusters(
	events: StructuredEvent[],
	minClusterSize: number
): TemporalCluster[] {
	const hourBuckets = bucketByHour(events);
	if (hourBuckets.length === 0) return [];

	// Find clusters: consecutive hours with dominant activity types
	const clusters: TemporalCluster[] = [];

	// Group by activity type across hours
	const activityHours: Map<ActivityType, HourBucket[]> = new Map();
	for (const bucket of hourBuckets) {
		// Find dominant activity type for this hour
		const typeCounts: Record<string, number> = {};
		for (const ev of bucket.events) {
			typeCounts[ev.activityType] = (typeCounts[ev.activityType] || 0) + 1;
		}
		const dominant = Object.entries(typeCounts)
			.sort((a, b) => b[1] - a[1])[0];
		if (dominant) {
			const type = dominant[0] as ActivityType;
			if (!activityHours.has(type)) activityHours.set(type, []);
			activityHours.get(type)!.push(bucket);
		}
	}

	// Merge consecutive hours for each activity type into clusters
	for (const [actType, buckets] of activityHours.entries()) {
		if (buckets.length === 0) continue;

		const sorted = buckets.sort((a, b) => a.hour - b.hour);
		let clusterStart = sorted[0].hour;
		let clusterEvents: StructuredEvent[] = [...sorted[0].events];
		let prevHour = sorted[0].hour;

		for (let i = 1; i < sorted.length; i++) {
			if (sorted[i].hour - prevHour <= 1) {
				// Consecutive or same hour — extend cluster
				clusterEvents.push(...sorted[i].events);
				prevHour = sorted[i].hour;
			} else {
				// Gap — flush cluster and start new one
				if (clusterEvents.length >= minClusterSize) {
					clusters.push(buildCluster(clusterStart, prevHour, actType, clusterEvents));
				}
				clusterStart = sorted[i].hour;
				clusterEvents = [...sorted[i].events];
				prevHour = sorted[i].hour;
			}
		}

		// Flush last cluster
		if (clusterEvents.length >= minClusterSize) {
			clusters.push(buildCluster(clusterStart, prevHour, actType, clusterEvents));
		}
	}

	return clusters.sort((a, b) => b.eventCount - a.eventCount);
}

/**
 * Leading words that carry no topical meaning — stripped before quality checks.
 * Includes pronouns, demonstratives, articles, and possessives that frequently
 * leak from Claude prompt text into extracted topics.
 */
const LEADING_NOISE = new Set([
	"the", "a", "an", "this", "that", "these", "those",
	"my", "our", "your", "his", "her", "its", "their",
	"some", "any", "all", "each", "every",
]);

/**
 * Common English stopwords. A topic composed mostly of stopwords
 * (e.g. "these last few") carries no knowledge value.
 */
const STOPWORDS = new Set([
	"the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
	"of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
	"have", "has", "had", "do", "does", "did", "will", "would", "could",
	"should", "can", "may", "might", "shall", "must",
	"this", "that", "these", "those", "it", "its",
	"i", "we", "you", "he", "she", "they", "me", "us", "him", "her", "them",
	"my", "our", "your", "his", "their",
	"what", "which", "who", "whom", "where", "when", "how", "why",
	"not", "no", "so", "if", "then", "than", "just", "also", "very",
	"about", "up", "out", "into", "over", "after", "before",
	"some", "any", "all", "each", "every", "few", "more", "most",
	"other", "last", "first", "next", "new", "old", "same",
	"thing", "things", "stuff", "way", "lot",
]);

/**
 * Clean a raw topic string: strip leading noise words and trim.
 * Returns the cleaned string (may be empty if the topic was all noise).
 * Exported for testing.
 */
export function cleanTopic(raw: string): string {
	const words = raw.trim().split(/\s+/);

	// Strip leading noise words
	let start = 0;
	while (start < words.length && LEADING_NOISE.has(words[start].toLowerCase())) {
		start++;
	}

	return words.slice(start).join(" ");
}

/**
 * Returns the fraction of words in a topic that are stopwords (0.0–1.0).
 * A topic with high stopword ratio carries no knowledge value.
 */
function stopwordRatio(topic: string): number {
	const words = topic.toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return 1;
	const stopCount = words.filter((w) => STOPWORDS.has(w)).length;
	return stopCount / words.length;
}

/**
 * Filters and cleans extracted topic strings for cluster labels.
 *
 * Rejection criteria:
 *   - Contains dots (domain separators: "specright.isolvedhire")
 *   - Multi-word all-capitalized words (company name fragments)
 *   - Contains URL/slug characters
 *   - Fewer than 2 characters after cleaning
 *   - 50% or more stopwords after cleaning (conversational fragments)
 *
 * Cleaning steps:
 *   - Strip leading pronouns/demonstratives/articles
 *
 * Exported for testing.
 */
export function filterClusterTopics(topics: string[]): string[] {
	const result: string[] = [];

	for (const raw of topics) {
		// Reject topics containing domain separators
		if (raw.includes(".")) continue;
		// Reject multi-word ProperCase topics (company name fragments like "Some Company Name").
		// Allow topics where every word is an UPPERCASE acronym (e.g. "OAuth PKCE").
		const rawWords = raw.split(/\s+/);
		if (rawWords.length >= 2
			&& rawWords.every((w) => /^[A-Z]/.test(w))
			&& rawWords.some((w) => /^[A-Z][a-z]/.test(w))) continue;
		// Reject topics with URL/slug characters
		if (/[/\\?=&]/.test(raw)) continue;

		// Clean: strip leading noise words
		const cleaned = cleanTopic(raw);

		// Reject if too short after cleaning
		if (cleaned.length < 2) continue;

		// Reject if half or more words are stopwords (conversational fragments)
		if (stopwordRatio(cleaned) >= 0.5) continue;

		result.push(cleaned);
	}

	return result;
}

function buildCluster(
	hourStart: number,
	hourEnd: number,
	activityType: ActivityType,
	events: StructuredEvent[]
): TemporalCluster {
	const allTopics = filterClusterTopics([...new Set(events.flatMap((e) => e.topics))]);
	const allEntities = [...new Set(events.flatMap((e) => e.entities))];
	const duration = hourEnd - hourStart + 1;
	const intensity = events.length / duration;

	const label =
		`${activityType} ${formatHour(hourStart)}-${formatHour(hourEnd + 1)}` +
		(allTopics.length > 0 ? `: ${allTopics.slice(0, 3).join(", ")}` : "");

	return {
		hourStart,
		hourEnd,
		activityType,
		eventCount: events.length,
		topics: allTopics.slice(0, 5),
		entities: allEntities.slice(0, 5),
		intensity,
		label,
	};
}

// ── Co-occurrence Analysis ─────────────────────────────

function extractTopicCooccurrences(
	events: StructuredEvent[],
	windowMinutes: number
): TopicCooccurrence[] {
	// Group events into time windows
	const windows: StructuredEvent[][] = [];
	const sorted = events
		.filter((e) => e.timestamp)
		.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

	if (sorted.length === 0) return [];

	let currentWindow: StructuredEvent[] = [sorted[0]];
	let windowStart = new Date(sorted[0].timestamp).getTime();

	for (let i = 1; i < sorted.length; i++) {
		const evTime = new Date(sorted[i].timestamp).getTime();
		if (evTime - windowStart <= windowMinutes * 60 * 1000) {
			currentWindow.push(sorted[i]);
		} else {
			if (currentWindow.length > 1) windows.push(currentWindow);
			currentWindow = [sorted[i]];
			windowStart = evTime;
		}
	}
	if (currentWindow.length > 1) windows.push(currentWindow);

	// Count topic co-occurrences within windows
	const pairCounts: Map<string, { count: number; window: string }> = new Map();

	for (const window of windows) {
		const allTopics = [...new Set(window.flatMap((e) => e.topics))];
		const windowLabel = window[0].timestamp
			? formatHour(new Date(window[0].timestamp).getHours())
			: "unknown";

		for (let i = 0; i < allTopics.length; i++) {
			for (let j = i + 1; j < allTopics.length; j++) {
				const key = [allTopics[i], allTopics[j]].sort().join("|||");
				const existing = pairCounts.get(key);
				if (existing) {
					existing.count++;
				} else {
					pairCounts.set(key, { count: 1, window: windowLabel });
				}
			}
		}
	}

	// Normalize and convert to output format
	const maxCount = Math.max(1, ...Array.from(pairCounts.values()).map((v) => v.count));

	return Array.from(pairCounts.entries())
		.map(([key, val]) => {
			const [topicA, topicB] = key.split("|||");
			return {
				topicA,
				topicB,
				strength: val.count / maxCount,
				sharedEvents: val.count,
				window: val.window,
			};
		})
		.sort((a, b) => b.strength - a.strength)
		.slice(0, 20);
}

// ── Entity Relations ───────────────────────────────────

/**
 * Categories whose events contribute entities and topics to the knowledge graph.
 * Events in all other categories (other, shopping, finance, news, social, media,
 * gaming, personal) still flow through temporal/focus/distribution analysis but
 * have their entities and topics zeroed before being passed here.
 */
export const ENTITY_BEARING_CATEGORIES = new Set([
	"dev", "work", "research", "education", "ai_tools", "pkm", "writing",
]);

const MIN_COOCCURRENCE_COUNT = 3;

function extractEntityRelations(events: StructuredEvent[]): EntityRelation[] {
	// Count entity co-occurrences within individual events
	const pairCounts: Map<string, { count: number; contexts: Set<string> }> = new Map();

	for (const event of events) {
		const entities = event.entities;
		if (entities.length < 2) continue;

		for (let i = 0; i < entities.length; i++) {
			for (let j = i + 1; j < entities.length; j++) {
				const key = [entities[i], entities[j]].sort().join("|||");
				const existing = pairCounts.get(key);
				if (existing) {
					existing.count++;
					existing.contexts.add(event.activityType);
				} else {
					pairCounts.set(key, {
						count: 1,
						contexts: new Set([event.activityType]),
					});
				}
			}
		}
	}

	return Array.from(pairCounts.entries())
		.filter(([, val]) => {
			// Require at least MIN_COOCCURRENCE_COUNT co-occurrences across distinct events
			if (val.count < MIN_COOCCURRENCE_COUNT) return false;
			// Filter out pairs where all contexts are "unknown" — these come from
			// uncategorized browser events with no knowledge value
			const contextList = [...val.contexts];
			if (contextList.every((c) => c === "unknown")) return false;
			return true;
		})
		.map(([key, val]) => {
			const [entityA, entityB] = key.split("|||");
			return {
				entityA,
				entityB,
				cooccurrences: val.count,
				contexts: [...val.contexts],
			};
		})
		.sort((a, b) => b.cooccurrences - a.cooccurrences)
		.slice(0, 15);
}

// ── Recurrence Signals ─────────────────────────────────

/**
 * Persisted topic history format — stored in vault as `.daily-digest/topic-history.json`
 */
export interface TopicHistory {
	version: 1;
	topics: Record<string, {
		firstSeen: string;    // ISO date
		lastSeen: string;     // ISO date
		dayCount: number;
		recentDays: string[]; // last 30 ISO dates
	}>;
}

export function buildEmptyTopicHistory(): TopicHistory {
	return { version: 1, topics: {} };
}

export function computeRecurrenceSignals(
	todayTopics: string[],
	todayDate: string,
	history: TopicHistory
): RecurrenceSignal[] {
	const signals: RecurrenceSignal[] = [];

	for (const topic of todayTopics) {
		const normalized = topic.toLowerCase().trim();
		if (!normalized) continue;

		const existing = history.topics[normalized];

		if (!existing) {
			signals.push({
				topic,
				frequency: 1,
				trend: "new",
				firstSeen: todayDate,
				lastSeen: todayDate,
				dayCount: 1,
			});
		} else {
			// Count recent appearances (last 14 days)
			const fourteenDaysAgo = new Date(todayDate);
			fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
			const recentCount = existing.recentDays.filter(
				(d) => new Date(d) >= fourteenDaysAgo
			).length;

			// Determine trend
			const sevenDaysAgo = new Date(todayDate);
			sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
			const lastSeenDate = new Date(existing.lastSeen);

			let trend: RecurrenceSignal["trend"];
			if (lastSeenDate < sevenDaysAgo) {
				trend = "returning"; // hasn't been seen in a week
			} else if (recentCount >= 5) {
				trend = "stable"; // appears frequently
			} else if (recentCount >= 3) {
				trend = "rising"; // appearing more often
			} else {
				trend = "declining"; // infrequent
			}

			signals.push({
				topic,
				frequency: existing.dayCount + 1,
				trend,
				firstSeen: existing.firstSeen,
				lastSeen: todayDate,
				dayCount: existing.dayCount + 1,
			});
		}
	}

	return signals.sort((a, b) => {
		// New and returning topics first, then by frequency
		const trendOrder = { new: 0, returning: 1, rising: 2, stable: 3, declining: 4 };
		const trendDiff = trendOrder[a.trend] - trendOrder[b.trend];
		if (trendDiff !== 0) return trendDiff;
		return b.frequency - a.frequency;
	});
}

export function updateTopicHistory(
	history: TopicHistory,
	todayTopics: string[],
	todayDate: string
): TopicHistory {
	const updated = { ...history, topics: { ...history.topics } };

	for (const topic of todayTopics) {
		const normalized = topic.toLowerCase().trim();
		if (!normalized) continue;

		const existing = updated.topics[normalized];
		if (existing) {
			// Update existing entry
			const recentDays = [...existing.recentDays, todayDate]
				.filter((d) => {
					const thirtyDaysAgo = new Date(todayDate);
					thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
					return new Date(d) >= thirtyDaysAgo;
				})
				.slice(-30); // Keep at most 30 entries

			updated.topics[normalized] = {
				firstSeen: existing.firstSeen,
				lastSeen: todayDate,
				dayCount: existing.dayCount + 1,
				recentDays,
			};
		} else {
			// New topic
			updated.topics[normalized] = {
				firstSeen: todayDate,
				lastSeen: todayDate,
				dayCount: 1,
				recentDays: [todayDate],
			};
		}
	}

	return updated;
}

// ── Knowledge Delta ────────────────────────────────────

export function computeKnowledgeDelta(
	todayTopics: string[],
	todayEntities: string[],
	recurrence: RecurrenceSignal[],
	topicCooccurrences: TopicCooccurrence[]
): KnowledgeDelta {
	const newTopics = recurrence
		.filter((r) => r.trend === "new")
		.map((r) => r.topic);

	const recurringTopics = recurrence
		.filter((r) => r.trend !== "new" && r.dayCount > 1)
		.map((r) => r.topic);

	const novelEntities = todayEntities.filter((e) => {
		// An entity is "novel" if it appears for the first time
		// We approximate this by checking if it's in new topics' entities
		// (In a full implementation, entity history would be tracked separately)
		return !recurringTopics.some((t) =>
			t.toLowerCase().includes(e.toLowerCase())
		);
	});

	// Cross-topic connections from co-occurrence
	const connections = topicCooccurrences
		.filter((c) => c.strength >= 0.5)
		.map((c) => `${c.topicA} \u2194 ${c.topicB}`);

	return {
		newTopics,
		recurringTopics,
		novelEntities: novelEntities.slice(0, 10),
		connections: connections.slice(0, 8),
	};
}

// ── Focus Score ────────────────────────────────────────

function computeTopicFocus(events: StructuredEvent[]): number {
	if (events.length === 0) return 0;

	// Focus = inverse of topic entropy. More concentrated topics = higher focus
	const topicCounts: Record<string, number> = {};
	for (const ev of events) {
		for (const topic of ev.topics) {
			const key = topic.toLowerCase();
			topicCounts[key] = (topicCounts[key] || 0) + 1;
		}
	}

	const totalMentions = Object.values(topicCounts).reduce((s, c) => s + c, 0);
	if (totalMentions === 0) return 0;

	// Shannon entropy
	let entropy = 0;
	for (const count of Object.values(topicCounts)) {
		const p = count / totalMentions;
		if (p > 0) entropy -= p * Math.log2(p);
	}

	// Normalize: max entropy = log2(uniqueTopics)
	const uniqueTopics = Object.keys(topicCounts).length;
	const maxEntropy = Math.log2(Math.max(2, uniqueTopics));

	// Invert: low entropy = high focus
	return Math.max(0, Math.min(1, 1 - (entropy / maxEntropy)));
}

/**
 * Compress a blended focus score (0-1) into a perceptually useful range
 * via sigmoid mapping. Normal days land in 55-80%.
 *
 * FLOOR=0.30, CEIL=0.98, k=5 (steepness)
 *
 *   blended 0.0 -> 30%
 *   blended 0.5 -> 64%
 *   blended 1.0 -> 98%
 */
export function compressScore(blended: number): number {
	const FLOOR = 0.30;
	const CEIL = 0.98;
	const k = 5;

	const sig = 1 / (1 + Math.exp(-k * (blended - 0.5)));
	const sigMin = 1 / (1 + Math.exp(-k * (0 - 0.5)));
	const sigMax = 1 / (1 + Math.exp(-k * (1 - 0.5)));
	const sigRange = sigMax - sigMin;

	return FLOOR + (CEIL - FLOOR) * (sig - sigMin) / sigRange;
}

/**
 * Canonical focus label -- single source of truth for the entire codebase.
 * Operates on the compressed (sigmoid) scale (0.30–0.98).
 * Returns "" for score === 0, which is the sentinel value produced by
 * extractPatterns() when no events are present (not a real focus reading).
 */
export function getFocusLabel(score: number): string {
	if (score === 0) return "";
	if (score >= 0.75) return "Highly focused";
	if (score >= 0.60) return "Moderately focused";
	if (score >= 0.45) return "Varied";
	return "Widely scattered";
}

// ── Category Diversity Score ────────────────────────────
// Measures how concentrated events are in one activity category.
// Returns the fraction of events in the single most-common category.
// 1.0 = all events in one category (highly focused)
// 0.25 = evenly spread across 4 types
// Unlike focusScore (topic entropy), this is stable even when developers
// work across many fine-grained topics within the same activity type.

function computeCategoryDiversityScore(events: StructuredEvent[]): number {
	if (events.length === 0) return 0;
	const typeCounts: Record<string, number> = {};
	for (const ev of events) {
		typeCounts[ev.activityType] = (typeCounts[ev.activityType] || 0) + 1;
	}
	const maxCount = Math.max(...Object.values(typeCounts));
	return maxCount / events.length;
}

// ── Peak Hours ─────────────────────────────────────────

function computePeakHours(events: StructuredEvent[]): { hour: number; count: number }[] {
	const hourCounts: Record<number, number> = {};
	for (const ev of events) {
		if (!ev.timestamp) continue;
		const date = new Date(ev.timestamp);
		if (isNaN(date.getTime())) continue;
		const hour = date.getHours();
		hourCounts[hour] = (hourCounts[hour] || 0) + 1;
	}

	return Object.entries(hourCounts)
		.map(([h, count]) => ({ hour: parseInt(h), count }))
		.sort((a, b) => b.count - a.count)
		.slice(0, 5);
}

// ── Activity Type Distribution ─────────────────────────

function computeActivityDistribution(
	events: StructuredEvent[]
): { type: ActivityType; count: number; pct: number }[] {
	const counts: Record<string, number> = {};
	for (const ev of events) {
		counts[ev.activityType] = (counts[ev.activityType] || 0) + 1;
	}

	const total = events.length || 1;
	return Object.entries(counts)
		.map(([type, count]) => ({
			type: type as ActivityType,
			count,
			pct: Math.round((count / total) * 100),
		}))
		.sort((a, b) => b.count - a.count);
}

// ── Main Entry Point ───────────────────────────────────

export function extractPatterns(
	classification: ClassificationResult,
	config: PatternConfig,
	topicHistory: TopicHistory,
	todayDate: string,
	rawGitCommits: GitCommit[] = [],
	rawClaudeSessions: ClaudeSession[] = [],
	rawSearches: SearchQuery[] = [],
	rawVisits: BrowserVisit[] = [],
	articleClusters: ArticleCluster[] = [],
): PatternAnalysis {
	const events = classification.events;

	// Derive a filtered event set for entity/topic graph analysis only.
	// Events in non-bearing categories (maps, shopping, news, etc.) still
	// contribute to temporal clusters, focus score, and activity distribution,
	// but their entities and topics are zeroed so they don't corrupt the
	// knowledge graph with place-name fragments or product titles.
	const eventsForEntityExtraction = events.map((e) =>
		ENTITY_BEARING_CATEGORIES.has(e.category ?? "other")
			? e
			: { ...e, entities: [], topics: [] }
	);

	// Temporal clusters — use full events (maps/shopping browsing is valid for focus score)
	const temporalClusters = extractTemporalClusters(events, config.minClusterSize);

	// Topic co-occurrences — use category-gated events only
	const topicCooccurrences = extractTopicCooccurrences(
		eventsForEntityExtraction,
		config.cooccurrenceWindow
	);

	// Entity relations — use category-gated events only
	const entityRelations = extractEntityRelations(eventsForEntityExtraction);

	// All unique topics and entities today (from gated events for knowledge delta)
	const allTopics = [...new Set(eventsForEntityExtraction.flatMap((e) => e.topics))];
	const allEntities = [...new Set(eventsForEntityExtraction.flatMap((e) => e.entities))];

	// Recurrence signals (requires persisted history)
	const recurrenceSignals = config.trackRecurrence
		? computeRecurrenceSignals(allTopics, todayDate, topicHistory)
		: [];

	// Knowledge delta
	const knowledgeDelta = computeKnowledgeDelta(
		allTopics,
		allEntities,
		recurrenceSignals,
		topicCooccurrences
	);

	// Focus score: blend topic entropy with category concentration, then compress
	const topicFocus = computeTopicFocus(events);
	const activityConcentrationScore = computeCategoryDiversityScore(events);
	const focusScore = events.length === 0
		? 0
		: compressScore(0.6 * topicFocus + 0.4 * activityConcentrationScore);

	// Activity type distribution
	const topActivityTypes = computeActivityDistribution(events);

	// Peak hours
	const peakHours = computePeakHours(events);

	// ── Semantic Extraction Layer ─────────────────────────
	// Group git commits into work units (90-min session gap + scope clustering)
	const commitWorkUnits = groupCommitsIntoWorkUnits(rawGitCommits);

	// Group Claude sessions into task sessions (by JSONL file)
	const claudeTaskSessions = groupClaudeSessionsIntoTasks(rawClaudeSessions);

	// Detect search missions from query chains
	const searchMissions = detectSearchMissions(rawSearches, rawVisits);

	// Cross-source fusion (stub: returns [] — see task-sessions.ts TODO)
	const unifiedTaskSessions = fuseCrossSourceSessions(
		articleClusters,
		commitWorkUnits,
		claudeTaskSessions,
		searchMissions,
	);

	return {
		temporalClusters,
		topicCooccurrences,
		entityRelations,
		recurrenceSignals,
		knowledgeDelta,
		focusScore,
		activityConcentrationScore,
		topActivityTypes,
		peakHours,
		commitWorkUnits,
		claudeTaskSessions,
		unifiedTaskSessions,
	};
}
