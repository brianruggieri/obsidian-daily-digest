/**
 * Engagement Scoring — Stage C of the article-first browsing pipeline.
 *
 * Assigns each browser visit a score from 0.0–1.0 representing the likelihood
 * that it was a substantive, knowledge-seeking interaction rather than
 * background navigation or noise.
 *
 * Threshold: score >= 0.5 = "substantive". Below 0.5 = background noise or
 * purely navigational.
 *
 * Scoring is entirely local — no LLM calls, no network, no API keys.
 */

import { BrowserVisit } from "../types";
import { SearchVisitPair } from "./intent";

// ── Engagement Score Constants ───────────────────────────

/**
 * Titles with at least this many words contain enough semantic content to be
 * considered meaningful (vs. single-word titles like "About" or "Contact").
 */
const SUBSTANTIVE_TITLE_MIN_WORDS = 5;

/**
 * Technical term patterns in a title signal debugging or implementation work:
 * - version numbers (1.2.3, 20.0)
 * - Error/Exception suffixes (TypeError, RangeException)
 * - method-call patterns at word boundary (reduce(), map())
 * - CSS class/ID selectors (#root, .foo)
 */
const TECHNICAL_TERMS_RE =
	/\b\d+\.\d+\b|\b\w+Error\b|\b\w+Exception\b|\b\w+\(\)|\B#\w+|\B\.\w+\(/;

// ── Engagement Scoring ───────────────────────────────────

/**
 * Compute an engagement score for a single browser visit.
 *
 * Score components (capped at 1.0):
 * - +0.25 if the cleaned title has >= 5 words (content-rich title)
 * - +0.20 if the same URL was visited more than once today (revisit signal)
 * - +0.25 if this visit was preceded by a related search query (intent signal)
 * - +0.15 if the cleaned title contains technical terms (debugging/implementing)
 *
 * @param visit        - The visit being scored
 * @param cleanedTitle - Output of `cleanTitle(visit.title)` — empty string if noise
 * @param todayVisits  - All visits for the day (used to count revisits)
 * @param searchLinks  - Output of `linkSearchesToVisits()` for search-intent linkage
 */
export function computeEngagementScore(
	visit: BrowserVisit,
	cleanedTitle: string,
	todayVisits: BrowserVisit[],
	searchLinks: SearchVisitPair[],
): number {
	let score = 0;

	// Title quality: enough words to encode a real topic
	const wordCount = cleanedTitle.split(/\s+/).filter(Boolean).length;
	if (wordCount >= SUBSTANTIVE_TITLE_MIN_WORDS) score += 0.25;

	// Revisit signal: same URL loaded more than once today = implementing or referring back
	const todayRevisitCount = todayVisits.filter((v) => v.url === visit.url).length;
	if (todayRevisitCount > 1) score += 0.20;

	// Search-intent linkage: visit was preceded by a related search query
	const linkedToSearch = searchLinks.some((sl) =>
		sl.visits.some((v) => v.url === visit.url)
	);
	if (linkedToSearch) score += 0.25;

	// Technical terms in title: debugging/implementing signal
	if (TECHNICAL_TERMS_RE.test(cleanedTitle)) score += 0.15;

	return Math.min(score, 1.0);
}
