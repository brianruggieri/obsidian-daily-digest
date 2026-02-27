/**
 * Commit Work Unit Analysis — Semantic Extraction Layer.
 *
 * Parses conventional commit messages, classifies developer intent (work mode),
 * and groups related commits into coherent work units using session gap detection
 * and scope/mode clustering.
 *
 * No LLM calls. No network. No external libraries.
 *
 * Research basis:
 *   - Mockus & Votta (ICSE 2000): commit type → developer intent taxonomy
 *   - Sliwerski/Zimmermann/Zeller (MSR 2005): bug keyword heuristics
 *   - Tian et al. (ICSE 2022): why-detection patterns, ~38% of commits have why
 *   - Hindle et al. (MSR 2008): change statistics as intent cross-check
 *   - Alali et al. (ICPC 2008): 90-minute session gap (git-hours validated)
 */

import { CommitWorkMode, CommitWorkUnit, GitCommit, ParsedCommit } from "../types";

// ── Conventional Commit Parsing ───────────────────────────

// Positional groups: [1]=type, [2]=scope (optional), [3]=breaking (optional), [4]=description
// Named capturing groups require ES2018+; this project targets ES6.
const CONVENTIONAL_COMMIT_RE =
	/^(feat|fix|refactor|docs|test|chore|build|ci|perf|revert|style)(?:\(([^)]+)\))?(!)?\s*:\s*(.+)$/i;

/**
 * Parse a commit message into its conventional commit components.
 * Handles non-conventional commits by returning empty type and full message as description.
 */
export function parseConventionalCommit(message: string): ParsedCommit {
	const m = CONVENTIONAL_COMMIT_RE.exec(message.trim());
	if (m) {
		return {
			type: m[1].toLowerCase(),
			scope: m[2] ?? null,
			breaking: m[3] === "!",
			description: m[4].trim(),
			raw: message,
		};
	}
	return {
		type: "",
		scope: null,
		breaking: false,
		description: message.trim(),
		raw: message,
	};
}

// ── Work Mode Classification ──────────────────────────────

/**
 * Maps conventional commit types directly to CommitWorkMode.
 * Only types that have a 1:1 mapping are listed here; others use fallbacks.
 */
const CONVENTIONAL_TYPE_TO_WORK_MODE: Record<string, CommitWorkMode> = {
	feat:     "building",
	fix:      "debugging",
	refactor: "restructuring",
	test:     "testing",
	docs:     "documenting",
	chore:    "infrastructure",
	build:    "infrastructure",
	ci:       "infrastructure",
	perf:     "optimizing",
	revert:   "reverting",
	style:    "restructuring",
};

// Keyword fallback patterns (Sliwerski/Zimmermann/Zeller SZZ heuristics)
const BUG_KEYWORDS_RE    = /\b(fix(es|ed|ing)?|bug|defect|error|fault|issue|problem|crash(es|ed)?|fail(s|ed|ure)?|wrong|incorrect|broken|repair|patch|resolve[sd]?)\b/i;
const FEAT_KEYWORDS_RE   = /\b(add|implement|introduce|create|new|support|enable|allow|feature)\b/i;
const REFACTOR_KEYWORDS_RE = /\b(refactor|clean|cleanup|reorganize|restructure|rename|move|extract|simplify|improve|optimize)\b/i;
const TEST_KEYWORDS_RE   = /\b(test|spec|coverage|assert|mock|fixture)\b/i;
const DOCS_KEYWORDS_RE   = /\b(doc|readme|comment|documentation|changelog|license)\b/i;
const REVERT_KEYWORDS_RE = /\b(revert|rollback|undo)\b/i;

// Generic/WIP commit detection
const GENERIC_COMMIT_PATTERNS: RegExp[] = [
	/^(wip|work in progress)$/i,
	/^(update|updates)$/i,
	/^(fix|fixes|fixed)$/i,      // bare "fix" with no object
	/^(cleanup|clean\s+up|clean)$/i,
	/^(misc|various|minor|small|quick|tiny)(\s+(fix|change|update|tweak))?$/i,
	/^(temp|tmp|temporary)$/i,
	/^(changes?|changes made)$/i,
];

/**
 * Determine the CommitWorkMode for a commit using a prioritised decision tree:
 *   1. Parse conventional commit prefix → direct type mapping
 *   2. No prefix → apply BUG/FEAT/REFACTOR/TEST/DOCS/REVERT keyword patterns
 *   3. No keyword match → infer from insertions/deletions ratio (Hindle et al. MSR 2008)
 *   4. All else fails → "tweaking"
 */
export function classifyWorkMode(
	commit: ParsedCommit,
	insertions: number,
	deletions: number,
): CommitWorkMode {
	// 1. Conventional type
	if (commit.type && CONVENTIONAL_TYPE_TO_WORK_MODE[commit.type]) {
		return CONVENTIONAL_TYPE_TO_WORK_MODE[commit.type];
	}

	const text = commit.description + " " + commit.raw;

	// 2. Keyword fallback
	if (REVERT_KEYWORDS_RE.test(text)) return "reverting";
	if (TEST_KEYWORDS_RE.test(text)) return "testing";
	if (DOCS_KEYWORDS_RE.test(text)) return "documenting";
	if (BUG_KEYWORDS_RE.test(text)) return "debugging";
	if (FEAT_KEYWORDS_RE.test(text)) return "building";
	if (REFACTOR_KEYWORDS_RE.test(text)) return "restructuring";

	// 3. Change statistics ratio heuristic
	const total = insertions + deletions;
	if (total > 0) {
		if (insertions > 0 && deletions === 0) return "building";
		if (deletions > 0 && insertions === 0) return "restructuring"; // cleanup/removal
		const ratio = insertions / (deletions || 1);
		if (ratio > 3) return "building";
		if (ratio < 0.33) return "restructuring"; // deletions >> insertions
	}

	// 4. Fallback
	return "tweaking";
}

// ── Why-Clause Detection ──────────────────────────────────

// Tian et al. (ICSE 2022) why-patterns — only ~38% of commits contain a "why"
const WHY_PATTERNS: RegExp[] = [
	/\bso\s+that\b/i,
	// "so " not followed by common adverbs/adjectives that are not causal
	/\bso\s+(?!far|long|much|many|good|bad|great|well|often|little|few)\w/i,
	/\bbecause\b/i,
	/\bsince\b/i,
	/\bin\s+order\s+to\b/i,
	/\bto\s+avoid\b/i,
	/\bprevents?\b/i,
	/\bfixes?\s+#\d+/i,
	/\bcloses?\s+#\d+/i,
	/\baddresses\b/i,
	/\bensures?\b/i,
	/\bhandles?\b/i,
	/\botherwise\b/i,
];

function extractWhyClause(message: string): string | null {
	for (const pattern of WHY_PATTERNS) {
		const m = pattern.exec(message);
		if (m) {
			// Return the fragment from the why-marker to end, capped at 120 chars
			return message.slice(m.index, m.index + 120).trim();
		}
	}
	return null;
}

function isGenericMessage(message: string): boolean {
	const trimmed = message.trim();
	return GENERIC_COMMIT_PATTERNS.some((re) => re.test(trimmed));
}

// ── Session Detection ─────────────────────────────────────

/** 90-minute session gap (validated by git-hours tooling, Alali et al. ICPC 2008). */
const SESSION_GAP_MS = 90 * 60 * 1000;

/**
 * Determine if two commit times cross a session boundary.
 * A session boundary exists when:
 *   - The gap between commits exceeds SESSION_GAP_MS, OR
 *   - The commits are on different calendar days (midnight boundary)
 */
function isSessionBoundary(earlier: Date, later: Date): boolean {
	if (later.getTime() - earlier.getTime() > SESSION_GAP_MS) return true;
	if (earlier.toDateString() !== later.toDateString()) return true;
	return false;
}

// ── Work Unit Clustering ──────────────────────────────────

/**
 * Extract a label for a work unit in priority order:
 *   1. Scope field if consistent across commits (e.g. "render", "summarize")
 *   2. Repo name if single-repo session + work mode
 *   3. Most common meaningful noun from descriptions
 */
function buildWorkUnitLabel(
	commits: GitCommit[],
	parsedCommits: ParsedCommit[],
	workMode: CommitWorkMode,
): string {
	// 1. Consistent scope
	const scopes = parsedCommits
		.map((p) => p.scope)
		.filter((s): s is string => s !== null && s.trim().length > 0);
	if (scopes.length > 0) {
		const scopeCounts: Record<string, number> = {};
		for (const s of scopes) {
			scopeCounts[s] = (scopeCounts[s] ?? 0) + 1;
		}
		const topScope = Object.entries(scopeCounts).sort((a, b) => b[1] - a[1])[0][0];
		return `Feature work: ${topScope}`;
	}

	// 2. Single-repo session
	const repos = [...new Set(commits.map((c) => c.repo))];
	if (repos.length === 1 && repos[0]) {
		return `${repos[0]}: ${workMode}`;
	}

	// 3. Most common noun phrase across descriptions (words > 3 chars, not stopwords)
	const LABEL_STOPWORDS = new Set([
		"with", "from", "that", "this", "into", "when", "then", "also",
		"some", "have", "more", "each", "such", "just", "very", "only",
	]);
	const wordCounts: Record<string, number> = {};
	for (const p of parsedCommits) {
		const words = p.description
			.toLowerCase()
			.replace(/[^\w\s-]/g, " ")
			.split(/\s+/)
			.filter((w) => w.length > 3 && !LABEL_STOPWORDS.has(w));
		for (const w of words) {
			wordCounts[w] = (wordCounts[w] ?? 0) + 1;
		}
	}
	const topWords = Object.entries(wordCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 3)
		.map(([w]) => w);

	if (topWords.length > 0) {
		return topWords.join(" ");
	}

	// Ultimate fallback
	return workMode;
}

/**
 * Determine the dominant work mode across a set of commits.
 * Picks the most frequent work mode (excluding "tweaking" if any other mode is present).
 */
function dominantWorkMode(modes: CommitWorkMode[]): CommitWorkMode {
	if (modes.length === 0) return "tweaking";
	const counts: Record<string, number> = {};
	for (const m of modes) {
		counts[m] = (counts[m] ?? 0) + 1;
	}
	// Prefer non-tweaking modes
	const nonTweaking = Object.entries(counts).filter(([m]) => m !== "tweaking");
	if (nonTweaking.length > 0) {
		return nonTweaking.sort((a, b) => b[1] - a[1])[0][0] as CommitWorkMode;
	}
	return "tweaking";
}

/**
 * Group a flat list of GitCommit objects into coherent CommitWorkUnit objects
 * using a two-pass algorithm:
 *
 * Pass 1 — Session detection (90-min gap + midnight boundary):
 *   Sort commits chronologically. Split into sessions on gap boundaries.
 *
 * Pass 2 — Work unit clustering within sessions:
 *   Group by dominant work mode. Split debugging commits from building commits.
 *   Multi-repo sessions are split by repo.
 *
 * @param commits  Flat list of GitCommit objects (any order; sorted internally).
 */
export function groupCommitsIntoWorkUnits(commits: GitCommit[]): CommitWorkUnit[] {
	if (commits.length === 0) return [];

	// Sort chronologically (oldest first for session boundary detection)
	const sorted = [...commits].sort((a, b) => {
		const ta = a.time?.getTime() ?? 0;
		const tb = b.time?.getTime() ?? 0;
		return ta - tb;
	});

	// ── Pass 1: Session detection ──────────────────────────
	const sessions: GitCommit[][] = [];
	let currentSession: GitCommit[] = [sorted[0]];

	for (let i = 1; i < sorted.length; i++) {
		const prev = sorted[i - 1];
		const curr = sorted[i];
		const prevTime = prev.time;
		const currTime = curr.time;

		if (prevTime && currTime && isSessionBoundary(prevTime, currTime)) {
			sessions.push(currentSession);
			currentSession = [curr];
		} else {
			currentSession.push(curr);
		}
	}
	sessions.push(currentSession);

	// ── Pass 2: Cluster within sessions ───────────────────
	const workUnits: CommitWorkUnit[] = [];

	for (const session of sessions) {
		// Parse all commits in session
		const parsed = session.map((c) => parseConventionalCommit(c.message));
		const modes = parsed.map((p, idx) =>
			classifyWorkMode(p, session[idx].insertions, session[idx].deletions)
		);

		// Group by repo first, then by work mode within repo
		const byRepo: Record<string, Array<{ commit: GitCommit; parsed: ParsedCommit; mode: CommitWorkMode }>> = {};
		for (let idx = 0; idx < session.length; idx++) {
			const repo = session[idx].repo || "unknown";
			if (!byRepo[repo]) byRepo[repo] = [];
			byRepo[repo].push({ commit: session[idx], parsed: parsed[idx], mode: modes[idx] });
		}

		// Within each repo, split by dominant work mode (debugging vs. building)
		for (const [_repo, repoItems] of Object.entries(byRepo)) {
			// Group by whether the mode is "debugging" or everything else
			const debugItems = repoItems.filter((x) => x.mode === "debugging");
			const buildItems = repoItems.filter((x) => x.mode !== "debugging");

			const groups: typeof repoItems[] = [];
			if (buildItems.length > 0) groups.push(buildItems);
			if (debugItems.length > 0) groups.push(debugItems);

			for (const group of groups) {
				const groupCommits = group.map((x) => x.commit);
				const groupParsed = group.map((x) => x.parsed);
				const groupModes = group.map((x) => x.mode);

				const workMode = dominantWorkMode(groupModes);
				const allGeneric = groupCommits.every((c) => isGenericMessage(c.message));
				const repos = [...new Set(groupCommits.map((c) => c.repo))];

				// Collect why clauses
				const whyClauses = groupCommits
					.map((c) => extractWhyClause(c.message))
					.filter((w): w is string => w !== null);

				const times = groupCommits
					.map((c) => c.time?.getTime())
					.filter((t): t is number => t !== undefined && !isNaN(t));
				const start = times.length > 0 ? new Date(Math.min(...times)) : new Date();
				const end   = times.length > 0 ? new Date(Math.max(...times)) : new Date();

				workUnits.push({
					label: buildWorkUnitLabel(groupCommits, groupParsed, workMode),
					workMode,
					commits: groupCommits,
					repos,
					timeRange: { start, end },
					hasWhyInformation: whyClauses.length > 0,
					whyClause: whyClauses[0] ?? null,
					isGeneric: allGeneric,
				});
			}
		}
	}

	// Sort work units by start time (most recent first for rendering)
	return workUnits.sort((a, b) => b.timeRange.start.getTime() - a.timeRange.start.getTime());
}
