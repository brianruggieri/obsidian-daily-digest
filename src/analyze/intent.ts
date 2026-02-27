/**
 * Search-Visit Linkage — Stage B of the article-first browsing pipeline.
 *
 * Pairs search queries with the page visits that followed within a configurable
 * time window. This linkage identifies informational intent: a search followed
 * by page visits is evidence that the user was actively seeking knowledge, not
 * just navigating to a known destination.
 *
 * No LLM calls. No network. No API keys. Offline-only.
 */

import { BrowserVisit, SearchQuery } from "../types";

// ── Search-Visit Pair ────────────────────────────────────

/**
 * A search query paired with the browser visits that occurred shortly after it.
 *
 * `intentType`:
 * - "directed"   — 1–2 result pages visited; user found what they wanted quickly
 * - "undirected" — 3+ result pages visited; user was exploring or comparing sources
 */
export interface SearchVisitPair {
	query: string;
	visits: BrowserVisit[];
	intentType: "directed" | "undirected";
}

// ── Search-Visit Linkage ─────────────────────────────────

/**
 * Link each search query to the page visits that occurred within `windowMs`
 * milliseconds after the search was issued.
 *
 * A visit is linked to a search if:
 *   - The visit's timestamp >= the search timestamp
 *   - The visit's timestamp - search timestamp <= windowMs (default: 5 minutes)
 *
 * Searches with zero linked visits are still returned (empty `visits` array)
 * so callers can account for searches that produced no browsing.
 *
 * The `intentType` is inferred from the number of linked visits:
 *   - <= 2 visits: "directed" (found what they needed quickly)
 *   - >= 3 visits: "undirected" (explored multiple results)
 *
 * @param searches - Search queries from `collectBrowserHistory()`
 * @param visits   - Browser visits from `collectBrowserHistory()`
 * @param windowMs - Maximum milliseconds after a search to consider a visit linked
 */
export function linkSearchesToVisits(
	searches: SearchQuery[],
	visits: BrowserVisit[],
	windowMs = 5 * 60 * 1000,
): SearchVisitPair[] {
	return searches.map((search) => {
		if (!search.time) {
			return { query: search.query, visits: [], intentType: "directed" };
		}
		const searchTimeMs = search.time.getTime();
		const linked = visits.filter((v) => {
			if (!v.time) return false;
			const vt = v.time.getTime();
			return vt >= searchTimeMs && vt - searchTimeMs <= windowMs;
		});
		return {
			query: search.query,
			visits: linked,
			intentType: linked.length <= 2 ? "directed" : "undirected",
		};
	});
}
