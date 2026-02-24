import { CATEGORY_LABELS } from "./categorize";
import { estimateTokens } from "./chunker";
import {
	CategorizedVisits,
	ClaudeSession,
	GitCommit,
	SearchQuery,
} from "./types";

// ── Types ──────────────────────────────────────────────

export interface CompressedActivity {
	/** Pre-formatted text for the browser section of the prompt. */
	browserText: string;
	/** Pre-formatted text for the search section of the prompt. */
	searchText: string;
	/** Pre-formatted text for the Claude section of the prompt. */
	claudeText: string;
	/** Pre-formatted text for the git section of the prompt. */
	gitText: string;
	/** Total events across all sources before compression. */
	totalEvents: number;
	/** Estimated token count of all compressed text combined. */
	tokenEstimate: number;
}

// ── Helpers ────────────────────────────────────────────

function formatTime(d: Date | null): string {
	if (!d) return "??:??";
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function timeRangeStr(items: { time: Date | null }[]): string {
	const times = items
		.map((i) => i.time)
		.filter((t): t is Date => t instanceof Date)
		.sort((a, b) => a.getTime() - b.getTime());
	if (times.length === 0) return "";
	return `${formatTime(times[0])}–${formatTime(times[times.length - 1])}`;
}

function topN<T>(
	items: T[],
	keyFn: (item: T) => string,
	limit: number
): { key: string; count: number }[] {
	const counts: Record<string, number> = {};
	for (const item of items) {
		const k = keyFn(item);
		counts[k] = (counts[k] || 0) + 1;
	}
	return Object.entries(counts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([key, count]) => ({ key, count }));
}

// ── Browser compression ────────────────────────────────

function compressBrowser(
	categorized: CategorizedVisits,
	budget: number
): string {
	const entries = Object.entries(categorized).filter(
		([, visits]) => visits.length > 0
	);
	if (entries.length === 0) return "  (none)";

	// Calculate total visits for proportional allocation
	const totalVisits = entries.reduce((sum, [, v]) => sum + v.length, 0);
	const lines: string[] = [];

	for (const [cat, visits] of entries) {
		const label = CATEGORY_LABELS[cat]?.[1] ?? cat;
		const domains = topN(visits, (v) => v.domain || "unknown", 8);
		const domainStr = domains
			.map((d) => `${d.key} (${d.count})`)
			.join(", ");
		const tr = timeRangeStr(visits);

		// Proportional title budget: more visits = more sample titles
		const share = visits.length / totalVisits;
		const titleBudget = Math.max(2, Math.round(share * 20));
		const titles = visits
			.slice(0, titleBudget)
			.map((v) => v.title?.slice(0, 60))
			.filter((t): t is string => !!t);

		let line = `  [${label}] (${visits.length} visits) domains: ${domainStr}`;
		if (titles.length > 0) {
			line += ` | titles: ${titles.join("; ")}`;
		}
		if (tr) {
			line += ` | ${tr}`;
		}

		lines.push(line);
	}

	// If over budget, progressively compress
	let text = lines.join("\n");
	if (estimateTokens(text) > budget) {
		// Remove titles, keep only domain counts and time ranges
		const condensedLines: string[] = [];
		for (const [cat, visits] of entries) {
			const label = CATEGORY_LABELS[cat]?.[1] ?? cat;
			const domains = topN(visits, (v) => v.domain || "unknown", 5);
			const domainStr = domains
				.map((d) => `${d.key} (${d.count})`)
				.join(", ");
			const tr = timeRangeStr(visits);
			let line = `  [${label}] (${visits.length} visits) ${domainStr}`;
			if (tr) line += ` | ${tr}`;
			condensedLines.push(line);
		}
		text = condensedLines.join("\n");
	}

	if (estimateTokens(text) > budget) {
		// Stats-only: just category counts
		const statsLines = entries.map(([cat, visits]) => {
			const label = CATEGORY_LABELS[cat]?.[1] ?? cat;
			return `  [${label}] ${visits.length} visits`;
		});
		text = statsLines.join("\n");
	}

	return text;
}

// ── Search compression ─────────────────────────────────

function compressSearches(
	searches: SearchQuery[],
	budget: number
): string {
	if (searches.length === 0) return "  (none)";

	// Engine breakdown
	const engines = topN(searches, (s) => s.engine, 5);
	const engineStr = engines
		.map((e) => `${e.key} (${e.count})`)
		.join(", ");
	const tr = timeRangeStr(searches);

	// Try full list first
	const queryLimit = Math.min(searches.length, 50);
	const queries = searches.slice(0, queryLimit).map((s) => s.query);
	let text =
		`  ${searches.length} queries via ${engineStr}` +
		(tr ? ` | ${tr}` : "") +
		`\n  ${queries.join(" | ")}`;

	if (estimateTokens(text) > budget) {
		// Reduce to fewer queries
		const reducedLimit = Math.max(5, Math.floor(budget / 3));
		const reducedQueries = searches.slice(0, reducedLimit).map((s) => s.query);
		const more = searches.length - reducedLimit;
		text =
			`  ${searches.length} queries via ${engineStr}` +
			(tr ? ` | ${tr}` : "") +
			`\n  ${reducedQueries.join(" | ")}` +
			(more > 0 ? ` (+${more} more)` : "");
	}

	if (estimateTokens(text) > budget) {
		// Stats only
		text =
			`  ${searches.length} queries via ${engineStr}` +
			(tr ? ` | ${tr}` : "");
	}

	return text;
}

// ── Claude compression ─────────────────────────────────

function compressClaude(
	sessions: ClaudeSession[],
	budget: number
): string {
	if (sessions.length === 0) return "  (none)";

	// Group by project
	const byProject: Record<string, ClaudeSession[]> = {};
	for (const s of sessions) {
		const proj = s.project || "general";
		if (!byProject[proj]) byProject[proj] = [];
		byProject[proj].push(s);
	}
	const tr = timeRangeStr(sessions);

	// Try full prompts
	const lines: string[] = [];
	for (const [proj, projSessions] of Object.entries(byProject)) {
		const promptLimit = Math.min(projSessions.length, 10);
		const prompts = projSessions
			.slice(0, promptLimit)
			.map((s) => s.prompt.slice(0, 120));
		const more = projSessions.length - promptLimit;
		lines.push(
			`  [${proj}] (${projSessions.length} prompts)` +
			(more > 0 ? ` (+${more} more)` : "") +
			`\n    ${prompts.join(" | ")}`
		);
	}
	let text =
		`  ${sessions.length} total prompts` +
		(tr ? ` | ${tr}` : "") +
		`\n${lines.join("\n")}`;

	if (estimateTokens(text) > budget) {
		// Fewer prompts per project
		const condensedLines: string[] = [];
		for (const [proj, projSessions] of Object.entries(byProject)) {
			const prompts = projSessions
				.slice(0, 3)
				.map((s) => s.prompt.slice(0, 80));
			condensedLines.push(
				`  [${proj}] (${projSessions.length} prompts): ${prompts.join(" | ")}` +
				(projSessions.length > 3 ? ` (+${projSessions.length - 3} more)` : "")
			);
		}
		text =
			`  ${sessions.length} total prompts` +
			(tr ? ` | ${tr}` : "") +
			`\n${condensedLines.join("\n")}`;
	}

	if (estimateTokens(text) > budget) {
		// Project names + counts only
		const projLines = Object.entries(byProject)
			.map(([proj, s]) => `${proj} (${s.length})`)
			.join(", ");
		text =
			`  ${sessions.length} prompts across: ${projLines}` +
			(tr ? ` | ${tr}` : "");
	}

	return text;
}

// ── Git compression ────────────────────────────────────

function compressGit(
	commits: GitCommit[],
	budget: number
): string {
	if (commits.length === 0) return "  (none)";

	// Group by repo
	const byRepo: Record<string, GitCommit[]> = {};
	for (const c of commits) {
		const repo = c.repo || "unknown";
		if (!byRepo[repo]) byRepo[repo] = [];
		byRepo[repo].push(c);
	}
	const tr = timeRangeStr(commits);

	// Try full commit lines grouped by repo
	const lines: string[] = [];
	for (const [repo, repoCommits] of Object.entries(byRepo)) {
		const totalIns = repoCommits.reduce((s, c) => s + c.insertions, 0);
		const totalDel = repoCommits.reduce((s, c) => s + c.deletions, 0);
		const commitLines = repoCommits
			.slice(0, 15)
			.map((c) => `${c.hash} ${c.message.slice(0, 80)} (+${c.insertions}/-${c.deletions})`);
		const more = repoCommits.length - 15;
		lines.push(
			`  [${repo}] (${repoCommits.length} commits, +${totalIns}/-${totalDel})` +
			(more > 0 ? ` (+${more} more)` : "") +
			`\n    ${commitLines.join(" | ")}`
		);
	}
	let text =
		`  ${commits.length} total commits` +
		(tr ? ` | ${tr}` : "") +
		`\n${lines.join("\n")}`;

	if (estimateTokens(text) > budget) {
		const condensedLines: string[] = [];
		for (const [repo, repoCommits] of Object.entries(byRepo)) {
			const totalIns = repoCommits.reduce((s, c) => s + c.insertions, 0);
			const totalDel = repoCommits.reduce((s, c) => s + c.deletions, 0);
			const msgs = repoCommits
				.slice(0, 5)
				.map((c) => c.message.slice(0, 60));
			condensedLines.push(
				`  [${repo}] (${repoCommits.length} commits, +${totalIns}/-${totalDel}): ${msgs.join(" | ")}` +
				(repoCommits.length > 5 ? ` (+${repoCommits.length - 5} more)` : "")
			);
		}
		text =
			`  ${commits.length} total commits` +
			(tr ? ` | ${tr}` : "") +
			`\n${condensedLines.join("\n")}`;
	}

	if (estimateTokens(text) > budget) {
		const repoLines = Object.entries(byRepo)
			.map(([repo, c]) => `${repo} (${c.length})`)
			.join(", ");
		text =
			`  ${commits.length} commits across: ${repoLines}` +
			(tr ? ` | ${tr}` : "");
	}

	return text;
}

// ── Main entry point ───────────────────────────────────

/**
 * Compress all collected activity data to fit within a target token budget.
 *
 * Each source gets a proportional share of the budget based on its event
 * count. Within each budget, compression is progressive: full detail first,
 * then grouped summaries, then statistics only.
 *
 * Pure function — no LLM calls, no I/O. Runs in <10ms for 2000+ items.
 */
export function compressActivity(
	categorized: CategorizedVisits,
	searches: SearchQuery[],
	claudeSessions: ClaudeSession[],
	gitCommits: GitCommit[],
	budget: number
): CompressedActivity {
	const browserCount = Object.values(categorized).reduce(
		(sum, v) => sum + v.length, 0
	);
	const totalEvents =
		browserCount + searches.length + claudeSessions.length + gitCommits.length;

	if (totalEvents === 0) {
		return {
			browserText: "  (none)",
			searchText: "  (none)",
			claudeText: "  (none)",
			gitText: "  (none)",
			totalEvents: 0,
			tokenEstimate: 0,
		};
	}

	// Proportional budget allocation (minimum share per active source, capped at 10%)
	const activeSources = [
		browserCount > 0 ? "browser" : null,
		searches.length > 0 ? "search" : null,
		claudeSessions.length > 0 ? "claude" : null,
		gitCommits.length > 0 ? "git" : null,
	].filter(Boolean).length;

	// Cap minShare so activeSources * minShare never exceeds budget.
	const minShare = activeSources > 0
		? Math.min(Math.floor(budget * 0.1), Math.floor(budget / activeSources))
		: 0;
	const flexBudget = budget - activeSources * minShare;

	const browserShare = browserCount > 0
		? minShare + Math.round(flexBudget * browserCount / totalEvents)
		: 0;
	const searchShare = searches.length > 0
		? minShare + Math.round(flexBudget * searches.length / totalEvents)
		: 0;
	const claudeShare = claudeSessions.length > 0
		? minShare + Math.round(flexBudget * claudeSessions.length / totalEvents)
		: 0;
	const gitShare = gitCommits.length > 0
		? minShare + Math.round(flexBudget * gitCommits.length / totalEvents)
		: 0;

	const browserText = compressBrowser(categorized, browserShare);
	const searchText = compressSearches(searches, searchShare);
	const claudeText = compressClaude(claudeSessions, claudeShare);
	const gitText = compressGit(gitCommits, gitShare);

	const tokenEstimate =
		estimateTokens(browserText) +
		estimateTokens(searchText) +
		estimateTokens(claudeText) +
		estimateTokens(gitText);

	return {
		browserText,
		searchText,
		claudeText,
		gitText,
		totalEvents,
		tokenEstimate,
	};
}
