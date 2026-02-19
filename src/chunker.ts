import { CATEGORY_LABELS } from "./categorize";
import {
	ActivityChunk,
	BrowserVisit,
	CategorizedVisits,
	ClaudeSession,
	SearchQuery,
	ShellCommand,
} from "./types";

// ── Token estimation ────────────────────────────────────

/** Rough token count: ~4 chars per token on average. */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

// ── Time helpers ────────────────────────────────────────

function formatTime(d: Date | null): string {
	if (!d) return "??:??";
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function timeRange(
	items: { time: Date | null }[]
): { start: string; end: string } | undefined {
	const times = items
		.map((i) => i.time)
		.filter((t): t is Date => t instanceof Date)
		.sort((a, b) => a.getTime() - b.getTime());
	if (times.length === 0) return undefined;
	return { start: formatTime(times[0]), end: formatTime(times[times.length - 1]) };
}

function dateStr(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// ── Domain counting ─────────────────────────────────────

function topDomains(visits: BrowserVisit[], limit = 8): string[] {
	const counts: Record<string, number> = {};
	for (const v of visits) {
		const d = v.domain || "unknown";
		counts[d] = (counts[d] || 0) + 1;
	}
	return Object.entries(counts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([domain, count]) => `${domain} (${count})`);
}

// ── Command pattern extraction ──────────────────────────

function commandPatterns(cmds: ShellCommand[], limit = 6): string[] {
	const counts: Record<string, number> = {};
	for (const c of cmds) {
		const base = c.cmd.trim().split(/\s+/)[0] || "";
		if (base) counts[base] = (counts[base] || 0) + 1;
	}
	return Object.entries(counts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([cmd, count]) => `${cmd} (${count})`);
}

// ── Chunk splitting ─────────────────────────────────────

function splitTextChunks(
	items: string[],
	maxPerChunk: number
): string[][] {
	const result: string[][] = [];
	for (let i = 0; i < items.length; i += maxPerChunk) {
		result.push(items.slice(i, i + maxPerChunk));
	}
	return result;
}

// ── Main chunking function ──────────────────────────────

export function chunkActivityData(
	date: Date,
	categorized: CategorizedVisits,
	searches: SearchQuery[],
	shellCmds: ShellCommand[],
	claudeSessions: ClaudeSession[]
): ActivityChunk[] {
	const ds = dateStr(date);
	const chunks: ActivityChunk[] = [];

	// ── Browser chunks: one per category ────────────
	for (const [cat, visits] of Object.entries(categorized)) {
		if (visits.length === 0) continue;
		const label = CATEGORY_LABELS[cat]?.[1] ?? cat;
		const domains = topDomains(visits);
		const titles = visits
			.slice(0, 8)
			.map((v) => v.title?.slice(0, 60))
			.filter((t): t is string => !!t);
		const tr = timeRange(visits);

		const lines: string[] = [
			`${label} Browser Activity (${visits.length} visits)`,
			`Top domains: ${domains.join(", ")}`,
		];
		if (titles.length > 0) {
			lines.push(`Sample pages: ${titles.join(" | ")}`);
		}
		if (tr) {
			lines.push(`Time range: ${tr.start} – ${tr.end}`);
		}

		chunks.push({
			id: `${ds}:browser:${cat}`,
			date: ds,
			type: "browser",
			category: cat,
			text: lines.join("\n"),
			metadata: {
				itemCount: visits.length,
				domains: domains.map((d) => d.replace(/\s*\(\d+\)$/, "")),
				timeRange: tr,
			},
		});
	}

	// ── Search chunks ───────────────────────────────
	if (searches.length > 0) {
		const queries = searches.map((s) => s.query);
		const batches = splitTextChunks(queries, 30);

		// Engine breakdown
		const engines: Record<string, number> = {};
		for (const s of searches) {
			engines[s.engine] = (engines[s.engine] || 0) + 1;
		}
		const engineStr = Object.entries(engines)
			.sort((a, b) => b[1] - a[1])
			.map(([e, c]) => `${e} (${c})`)
			.join(", ");

		const tr = timeRange(searches);

		for (let i = 0; i < batches.length; i++) {
			const suffix = batches.length > 1 ? `:${i + 1}` : "";
			const lines: string[] = [
				`Search Queries (${batches[i].length} queries)`,
				`Queries: ${batches[i].join(" | ")}`,
				`Engines: ${engineStr}`,
			];
			if (tr) lines.push(`Time range: ${tr.start} – ${tr.end}`);

			chunks.push({
				id: `${ds}:search${suffix}`,
				date: ds,
				type: "search",
				text: lines.join("\n"),
				metadata: {
					itemCount: batches[i].length,
					timeRange: tr,
				},
			});
		}
	}

	// ── Shell chunks ────────────────────────────────
	if (shellCmds.length > 0) {
		const cmdTexts = shellCmds.map((c) => c.cmd.trim());
		const batches = splitTextChunks(cmdTexts, 40);
		const patterns = commandPatterns(shellCmds);
		const tr = timeRange(shellCmds);

		for (let i = 0; i < batches.length; i++) {
			const suffix = batches.length > 1 ? `:${i + 1}` : "";
			const lines: string[] = [
				`Shell Commands (${batches[i].length} commands)`,
				`Commands: ${batches[i].join(" | ")}`,
				`Patterns: ${patterns.join(", ")}`,
			];
			if (tr) lines.push(`Time range: ${tr.start} – ${tr.end}`);

			chunks.push({
				id: `${ds}:shell${suffix}`,
				date: ds,
				type: "shell",
				text: lines.join("\n"),
				metadata: {
					itemCount: batches[i].length,
					timeRange: tr,
				},
			});
		}
	}

	// ── Claude chunks: one per project ──────────────
	if (claudeSessions.length > 0) {
		const byProject: Record<string, ClaudeSession[]> = {};
		for (const s of claudeSessions) {
			const proj = s.project || "general";
			if (!byProject[proj]) byProject[proj] = [];
			byProject[proj].push(s);
		}

		for (const [proj, sessions] of Object.entries(byProject)) {
			const prompts = sessions
				.slice(0, 15)
				.map((s) => s.prompt.slice(0, 120));
			const tr = timeRange(sessions);

			const lines: string[] = [
				`Claude Code Sessions – ${proj} (${sessions.length} prompts)`,
				`Prompts: ${prompts.join(" | ")}`,
			];
			if (tr) lines.push(`Time range: ${tr.start} – ${tr.end}`);

			chunks.push({
				id: `${ds}:claude:${proj.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
				date: ds,
				type: "claude",
				text: lines.join("\n"),
				metadata: {
					itemCount: sessions.length,
					projects: [proj],
					timeRange: tr,
				},
			});
		}
	}

	// ── Merge small chunks ──────────────────────────
	return mergeSmallChunks(chunks, ds, 100);
}

function mergeSmallChunks(
	chunks: ActivityChunk[],
	ds: string,
	minTokens: number
): ActivityChunk[] {
	const keep: ActivityChunk[] = [];
	const small: ActivityChunk[] = [];

	for (const c of chunks) {
		if (estimateTokens(c.text) < minTokens) {
			small.push(c);
		} else {
			keep.push(c);
		}
	}

	if (small.length === 0) return keep;
	if (small.length === 1) {
		// Single small chunk — keep as-is rather than creating a "misc" wrapper
		keep.push(small[0]);
		return keep;
	}

	// Merge small chunks into one
	const mergedText = small.map((c) => c.text).join("\n\n");
	const totalItems = small.reduce((sum, c) => sum + c.metadata.itemCount, 0);

	keep.push({
		id: `${ds}:misc`,
		date: ds,
		type: "browser",
		category: "other",
		text: `Miscellaneous Activity (${totalItems} items)\n\n${mergedText}`,
		metadata: { itemCount: totalItems },
	});

	return keep;
}
