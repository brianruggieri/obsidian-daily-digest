import type { BrowserVisit } from "../types";

export interface DedupConfig {
	/** Max unique pages kept per domain after canonical-key grouping. Default: 5 */
	maxVisitsPerDomain: number;
	/** Max total entries rendered for the "Other" category. Default: 20 */
	maxOtherTotal: number;
}

export const DEDUP_DEFAULTS: DedupConfig = {
	maxVisitsPerDomain: 5,
	maxOtherTotal: 20,
};

/**
 * For Google Maps directions/place URLs, strip the `/@lat,lng,zoomz` viewport
 * suffix that Chrome records on every zoom or pan event.
 *
 * Input:  /maps/dir/Providence+Canyon/Columbus+GA/@32.4527517,-84.9942759,12.67z
 * Output: /maps/dir/Providence+Canyon/Columbus+GA
 */
function normalizeMapsPath(pathname: string): string {
	const idx = pathname.indexOf("/@");
	return idx !== -1 ? pathname.slice(0, idx) : pathname;
}

/**
 * Compute a canonical key for a browser visit URL.
 *
 * Two URLs with the same canonical key are near-duplicates of the same page.
 * The key format is: `https://<host-without-www><normalized-path>`
 *
 * What is stripped:
 * - The entire query string
 * - The URL fragment (#...)
 * - Trailing slashes (treat /foo/ and /foo as equal)
 * - `www.` prefix on hostname
 * - For Google Maps: `/@lat,lng,zoom` viewport coordinate suffix in the path
 *
 * What is kept:
 * - The hostname (domain identity)
 * - The path (page identity)
 */
export function canonicalKey(rawUrl: string): string {
	try {
		const url = new URL(rawUrl);
		const host = url.hostname.replace(/^www\./, "");
		const isMaps =
			(host === "maps.google.com" || host === "google.com") &&
			url.pathname.startsWith("/maps/");
		const path = isMaps
			? normalizeMapsPath(url.pathname)
			: url.pathname.replace(/\/+$/, "") || "/";
		return `https://${host}${path}`;
	} catch {
		return rawUrl;
	}
}

/**
 * Select the most informative representative from a group of near-duplicate visits.
 *
 * Priority:
 * 1. Longest title (proxy for most informative page load — e.g. page with title
 *    vs. blank redirect vs. loading placeholder)
 * 2. Tiebreak: earliest timestamp (first clean load, not a reload)
 */
function pickBest(group: BrowserVisit[]): BrowserVisit {
	return group.reduce((best, v) => {
		const bl = (best.title || "").length;
		const vl = (v.title || "").length;
		if (vl > bl) return v;
		if (vl === bl) {
			const bt = best.time?.getTime() ?? Infinity;
			const vt = v.time?.getTime() ?? Infinity;
			return vt < bt ? v : best;
		}
		return best;
	});
}

export interface DedupResult {
	visits: BrowserVisit[];
	/** Total number of visits removed (near-duplicate collapse + per-domain cap) */
	collapsedCount: number;
}

/**
 * Deduplicate a list of browser visits in two phases:
 *
 * Phase 1 — Canonical-key grouping:
 *   Group visits by canonical URL (strip query string, fragment, trailing slash,
 *   www. prefix; normalise Google Maps path). Keep one representative per group
 *   (longest title, tiebreak: earliest timestamp).
 *
 * Phase 2 — Per-domain cap:
 *   After grouping, limit each domain to `config.maxVisitsPerDomain` entries
 *   (most recent first). This prevents a legitimately-browsed domain from
 *   dominating the note.
 *
 * Output is sorted by time descending (most recent first).
 */
export function deduplicateVisits(
	visits: BrowserVisit[],
	config: DedupConfig = DEDUP_DEFAULTS
): DedupResult {
	// Phase 1: canonical-key grouping
	const groups = new Map<string, BrowserVisit[]>();
	for (const v of visits) {
		const key = canonicalKey(v.url);
		const g = groups.get(key);
		if (g) {
			g.push(v);
		} else {
			groups.set(key, [v]);
		}
	}

	let collapsedCount = 0;
	const deduplicated: BrowserVisit[] = [];
	for (const g of groups.values()) {
		deduplicated.push(pickBest(g));
		collapsedCount += g.length - 1;
	}

	// Phase 2: per-domain cap
	const byDomain = new Map<string, BrowserVisit[]>();
	for (const v of deduplicated) {
		try {
			const domain = new URL(v.url).hostname.replace(/^www\./, "");
			const bucket = byDomain.get(domain) ?? [];
			bucket.push(v);
			byDomain.set(domain, bucket);
		} catch {
			// skip invalid URLs — they were already through Phase 1 so this is unlikely
		}
	}

	const capped: BrowserVisit[] = [];
	for (const domainVisits of byDomain.values()) {
		domainVisits.sort((a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0));
		const kept = domainVisits.slice(0, config.maxVisitsPerDomain);
		collapsedCount += domainVisits.length - kept.length;
		capped.push(...kept);
	}

	capped.sort((a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0));
	return { visits: capped, collapsedCount };
}
