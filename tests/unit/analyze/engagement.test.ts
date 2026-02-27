import { describe, it, expect } from "vitest";
import { computeEngagementScore } from "../../../src/analyze/engagement";
import { BrowserVisit } from "../../../src/types";
import { SearchVisitPair } from "../../../src/analyze/intent";

// ── Helpers ──────────────────────────────────────────────

function makeVisit(url: string, timeMs = 0): BrowserVisit {
	return { url, title: "", time: new Date(timeMs) };
}

function makeSearch(visits: BrowserVisit[]): SearchVisitPair {
	return { query: "some query", visits, intentType: "directed" };
}

// ── computeEngagementScore ───────────────────────────────

describe("computeEngagementScore", () => {
	// ── Baseline score ───────────────────────────
	it("returns 0 for an empty cleaned title with no other signals", () => {
		const visit = makeVisit("https://example.com");
		const score = computeEngagementScore(visit, "", [visit], []);
		expect(score).toBe(0);
	});

	// ── Title quality (+0.25) ────────────────────
	it("adds 0.25 for a cleaned title with 5 or more words", () => {
		const visit = makeVisit("https://example.com");
		const title = "How to use TypeScript generic constraints"; // 7 words
		const score = computeEngagementScore(visit, title, [visit], []);
		expect(score).toBeCloseTo(0.25);
	});

	it("does not add title bonus for a 4-word title", () => {
		const visit = makeVisit("https://example.com");
		const title = "TypeScript generic constraints explained"; // 4 words
		const score = computeEngagementScore(visit, title, [visit], []);
		expect(score).toBe(0);
	});

	it("does not add title bonus for an empty cleaned title", () => {
		const visit = makeVisit("https://example.com");
		const score = computeEngagementScore(visit, "", [visit], []);
		expect(score).toBe(0);
	});

	// ── Revisit signal (+0.20) ───────────────────
	it("adds 0.20 when the same URL appears more than once in todayVisits", () => {
		const visit = makeVisit("https://example.com");
		const todayVisits = [visit, visit]; // same URL twice
		const score = computeEngagementScore(visit, "", todayVisits, []);
		expect(score).toBeCloseTo(0.20);
	});

	it("does not add revisit bonus when URL appears only once", () => {
		const visit = makeVisit("https://example.com");
		const otherVisit = makeVisit("https://other.com");
		const todayVisits = [visit, otherVisit];
		const score = computeEngagementScore(visit, "", todayVisits, []);
		expect(score).toBe(0);
	});

	// ── Search-intent linkage (+0.25) ────────────
	it("adds 0.25 when the visit is linked to a search query", () => {
		const visit = makeVisit("https://typescriptlang.org/docs");
		const searchLink = makeSearch([visit]);
		const score = computeEngagementScore(visit, "", [visit], [searchLink]);
		expect(score).toBeCloseTo(0.25);
	});

	it("does not add search bonus when visit URL is not in any search link", () => {
		const visit = makeVisit("https://typescriptlang.org/docs");
		const otherVisit = makeVisit("https://other.com");
		const searchLink = makeSearch([otherVisit]);
		const score = computeEngagementScore(visit, "", [visit], [searchLink]);
		expect(score).toBe(0);
	});

	// ── Technical terms (+0.15) ──────────────────
	it("adds 0.15 for a version number in the cleaned title", () => {
		const visit = makeVisit("https://example.com");
		const title = "Node.js 20.0 upgrade guide"; // "20.0" matches
		const score = computeEngagementScore(visit, title, [visit], []);
		expect(score).toBeCloseTo(0.15);
	});

	it("adds 0.15 for an Error suffix in the cleaned title (plus 0.25 for 6 words = 0.40)", () => {
		const visit = makeVisit("https://example.com");
		// 6 words (+0.25) + TypeError matches \w+Error (+0.15) = 0.40
		const title = "TypeError cannot read properties of undefined";
		const score = computeEngagementScore(visit, title, [visit], []);
		expect(score).toBeCloseTo(0.40);
	});

	it("adds 0.15 for a method call pattern in the cleaned title (plus 0.25 for 7 words = 0.40)", () => {
		const visit = makeVisit("https://example.com");
		// 7 words (+0.25) + Array.reduce() matches \w+\(\) (+0.15) = 0.40
		const title = "Using Array.reduce() to flatten nested arrays";
		const score = computeEngagementScore(visit, title, [visit], []);
		expect(score).toBeCloseTo(0.40);
	});

	it("adds 0.15 for a version number in isolation (short title, no word bonus)", () => {
		const visit = makeVisit("https://example.com");
		// 4 words → no word bonus. "20.0" matches \d+\.\d+ → +0.15
		const title = "Node 20.0 changelog";
		const score = computeEngagementScore(visit, title, [visit], []);
		expect(score).toBeCloseTo(0.15);
	});

	// ── Combined scores ──────────────────────────
	it("returns 0.50 for title + search link (crosses the substantive threshold)", () => {
		const visit = makeVisit("https://example.com");
		const title = "How to use TypeScript generic constraints"; // 7 words → +0.25
		const searchLink = makeSearch([visit]); // linked to search → +0.25
		const score = computeEngagementScore(visit, title, [visit], [searchLink]);
		expect(score).toBeCloseTo(0.50);
	});

	it("returns 0.65 for title + revisit + search link", () => {
		const visit = makeVisit("https://example.com");
		const title = "How to use TypeScript generic constraints"; // +0.25
		const todayVisits = [visit, visit]; // revisit → +0.20
		const searchLink = makeSearch([visit]); // search link → +0.25
		const score = computeEngagementScore(visit, title, todayVisits, [searchLink]);
		expect(score).toBeCloseTo(0.70);
	});

	it("caps at 1.0 even when all signals are present", () => {
		const visit = makeVisit("https://example.com");
		const title = "TypeError: reduce() on empty array without initial value 2.0"; // words + Error + ()
		const todayVisits = [visit, visit]; // revisit
		const searchLink = makeSearch([visit]); // search link
		const score = computeEngagementScore(visit, title, todayVisits, [searchLink]);
		expect(score).toBeLessThanOrEqual(1.0);
	});

	// ── Threshold boundary ───────────────────────
	it("a title-only visit is below the 0.5 substantive threshold", () => {
		const visit = makeVisit("https://example.com");
		const title = "Understanding the JavaScript event loop in depth"; // 8 words → +0.25
		const score = computeEngagementScore(visit, title, [visit], []);
		expect(score).toBeLessThan(0.5);
	});

	it("a revisit-only visit is below the 0.5 substantive threshold", () => {
		const visit = makeVisit("https://example.com");
		const todayVisits = [visit, visit]; // revisit → +0.20
		const score = computeEngagementScore(visit, "", todayVisits, []);
		expect(score).toBeLessThan(0.5);
	});
});
