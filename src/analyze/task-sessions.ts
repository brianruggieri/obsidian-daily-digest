/**
 * Task Session Analysis — Semantic Extraction Layer.
 *
 * Groups Claude Code conversations into higher-level ClaudeTaskSession objects,
 * detects query chain SearchMissions, and (as a stub) fuses cross-source
 * UnifiedTaskSession objects from all four data source types.
 *
 * No LLM calls. No network. No external libraries.
 *
 * Research basis:
 *   - Barke, James, Polikarpova (OOPSLA 2023): acceleration/exploration bimodal model
 *   - Hagen et al. (OAIR 2013): 10-minute query chain = single search mission
 *   - Jones & Klinkner (WSDM 2008): file boundary = strongest session signal
 *   - Broder (SIGIR Forum 2002): navigational/informational/transactional taxonomy
 */

import {
	ClaudeSession,
	ClaudeTaskSession,
	ClaudeTaskType,
	SearchMission,
	SearchQuery,
	BrowserVisit,
	UnifiedTaskSession,
	ArticleCluster,
	CommitWorkUnit,
} from "../types";
import { classifyClaudeTaskType, CLAUDE_TOPIC_VOCABULARY } from "../filter/classify";
import { extractTaskTitle } from "../collect/claude";

// ── Claude Task Session Grouping ──────────────────────────

/**
 * Map ClaudeTaskType to the bimodal interaction mode.
 * "acceleration" = user knows what they want, using AI to go faster.
 * "exploration"  = user is discovering options or learning.
 */
function toInteractionMode(taskType: ClaudeTaskType): "acceleration" | "exploration" {
	if (taskType === "learning" || taskType === "architecture") return "exploration";
	return "acceleration";
}

/**
 * Extract a vocabulary-based topic cluster label from prompt text.
 * Falls back to the first 3 meaningful words when no vocabulary term matches.
 */
function extractTopicCluster(text: string): string {
	for (const [pattern, label] of CLAUDE_TOPIC_VOCABULARY) {
		if (pattern.test(text)) return label;
	}
	// Fallback: first 3 meaningful words
	const words = text
		.replace(/[^\w\s-]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 3)
		.slice(0, 3);
	return words.length > 0 ? words.join(" ") : "general";
}

/**
 * Group flat ClaudeSession[] into ClaudeTaskSession[] objects, where each
 * session corresponds to one JSONL file (conversation identity boundary).
 *
 * Algorithm:
 *   1. Group all ClaudeSession objects by their `conversationFile` field.
 *   2. For each file group, find the opener (isConversationOpener === true).
 *   3. Extract task title and classify task type from the opener.
 *   4. Build a ClaudeTaskSession from the group.
 *
 * @param sessions  All ClaudeSession objects for the day (may include non-openers).
 */
export function groupClaudeSessionsIntoTasks(sessions: ClaudeSession[]): ClaudeTaskSession[] {
	if (sessions.length === 0) return [];

	// Group by conversation file
	const byFile = new Map<string, ClaudeSession[]>();
	for (const s of sessions) {
		const file = s.conversationFile || "unknown";
		const existing = byFile.get(file);
		if (existing) {
			existing.push(s);
		} else {
			byFile.set(file, [s]);
		}
	}

	const taskSessions: ClaudeTaskSession[] = [];

	for (const [conversationFile, prompts] of byFile) {
		// Sort within conversation by time (oldest first)
		const sorted = [...prompts].sort((a, b) => a.time.getTime() - b.time.getTime());

		// Find the opener — if none is marked as opener, treat the earliest as opener
		const opener = sorted.find((s) => s.isConversationOpener) ?? sorted[0];

		const taskTitle = extractTaskTitle(opener.prompt);
		const taskType = classifyClaudeTaskType(opener.prompt);
		const topicCluster = extractTopicCluster(opener.prompt);
		const interactionMode = toInteractionMode(taskType);
		const turnCount = opener.conversationTurnCount || sorted.length;

		// A session is "deep learning" if it has 5+ turns on a conceptual topic
		const isDeepLearning = turnCount >= 5 &&
			(taskType === "learning" || taskType === "architecture");

		const times = sorted.map((s) => s.time.getTime());
		const start = new Date(Math.min(...times));
		const end   = new Date(Math.max(...times));

		taskSessions.push({
			taskTitle,
			taskType,
			topicCluster,
			prompts: sorted,
			timeRange: { start, end },
			project: opener.project,
			conversationFile,
			turnCount,
			interactionMode,
			isDeepLearning,
		});
	}

	// Sort by start time (most recent first)
	return taskSessions.sort((a, b) => b.timeRange.start.getTime() - a.timeRange.start.getTime());
}

// ── Search Mission Detection ──────────────────────────────

/** Broder query intent classification patterns. */
const NAV_QUERY_RE = /\b(site:|docs|github|npm|official|login|sign\s+in|download)\b/i;
const INFO_QUERY_RE = /^(how|what|why|when|where|who|which|can|is|does|difference\s+between|vs\.?|versus|explain)/i;

function classifySearchIntent(query: string): "navigational" | "informational" | "transactional" {
	if (NAV_QUERY_RE.test(query)) return "navigational";
	if (INFO_QUERY_RE.test(query)) return "informational";
	return "transactional";
}

/**
 * Extract content words from a search query for chain overlap detection.
 * Filters out stopwords and words shorter than 3 characters.
 */
function queryContentWords(query: string): Set<string> {
	const QUERY_STOPWORDS = new Set([
		"the", "and", "for", "are", "but", "not", "you", "all", "can",
		"was", "will", "had", "has", "is", "it", "its", "of", "to",
		"in", "on", "at", "an", "a", "be", "do",
	]);
	const words = query
		.toLowerCase()
		.replace(/[^\w\s]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 2 && !QUERY_STOPWORDS.has(w));
	return new Set(words);
}

/**
 * Check whether two queries share at least one content word.
 */
function sharesContentWord(a: Set<string>, b: Set<string>): boolean {
	for (const w of a) {
		if (b.has(w)) return true;
	}
	return false;
}

/**
 * Detect search missions from a list of queries and nearby browser visits.
 *
 * A search mission = consecutive queries within `window` ms that share at
 * least one content word (Hagen et al. OAIR 2013 definition).
 *
 * @param searches  All search queries for the day.
 * @param visits    All browser visits (used to find visits within the mission window).
 * @param window    Max milliseconds between queries to chain them (default: 10 min).
 */
export function detectSearchMissions(
	searches: SearchQuery[],
	visits: BrowserVisit[],
	window = 10 * 60 * 1000,
): SearchMission[] {
	if (searches.length === 0) return [];

	// Sort chronologically
	const sorted = [...searches].sort((a, b) => {
		return (a.time?.getTime() ?? 0) - (b.time?.getTime() ?? 0);
	});

	const missions: SearchMission[] = [];
	let chainStart = 0;

	while (chainStart < sorted.length) {
		let chainEnd = chainStart;
		const startWords = queryContentWords(sorted[chainStart].query);

		// Extend chain as long as queries are within `window` ms AND share a content word
		while (chainEnd + 1 < sorted.length) {
			const curr = sorted[chainEnd];
			const next = sorted[chainEnd + 1];
			const currTime = curr.time?.getTime() ?? 0;
			const nextTime = next.time?.getTime() ?? 0;

			if (nextTime - currTime > window) break;

			// Check content word overlap between the chain opener and the next query
			const nextWords = queryContentWords(next.query);
			if (!sharesContentWord(startWords, nextWords)) break;

			chainEnd++;
		}

		const chainQueries = sorted.slice(chainStart, chainEnd + 1);

		// Find visits within the mission time window
		const missionStart = chainQueries[0].time?.getTime() ?? 0;
		const missionEnd   = (chainQueries[chainEnd - chainStart].time?.getTime() ?? missionStart) + window;
		const missionVisits = visits.filter((v) => {
			const vt = v.time?.getTime();
			return vt !== undefined && vt >= missionStart && vt <= missionEnd;
		});

		const intentType = classifySearchIntent(chainQueries[0].query);

		missions.push({
			label: chainQueries[0].query,
			queries: chainQueries,
			visits: missionVisits,
			timeRange: {
				start: chainQueries[0].time ?? new Date(missionStart),
				end: chainQueries[chainEnd - chainStart].time ?? new Date(missionEnd),
			},
			intentType,
		});

		chainStart = chainEnd + 1;
	}

	// Only return multi-query missions (singletons are not really "missions")
	// Actually per design we keep all missions including single queries
	return missions;
}

// ── Cross-Source Fusion ───────────────────────────────────

/**
 * Fuse work units from all four sources into UnifiedTaskSession objects
 * using temporal overlap + topic entity overlap.
 *
 * TODO: This is currently a stub returning []. The full fusion algorithm
 * (Section "Cross-Source Fusion" in design-semantic-extraction-layer.md)
 * requires topic entity extraction from each source type and a time-window
 * merge pass. Implement in a follow-up once the per-source work units
 * have been validated in production.
 *
 * @param _browser   Article clusters from browser reading
 * @param _commits   Commit work units from git history
 * @param _claude    Claude task sessions from AI interactions
 * @param _search    Search missions from query chains
 */
export function fuseCrossSourceSessions(
	_browser: ArticleCluster[],
	_commits: CommitWorkUnit[],
	_claude: ClaudeTaskSession[],
	_search: SearchMission[],
): UnifiedTaskSession[] {
	// TODO: Implement temporal + topic entity overlap fusion.
	// This stub returns [] so the rest of the pipeline can ship while fusion
	// is designed and validated.
	return [];
}
