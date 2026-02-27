import { describe, it, expect } from "vitest";
import { linkSearchesToVisits } from "../../../src/analyze/intent";
import { BrowserVisit, SearchQuery } from "../../../src/types";

// ── Helpers ──────────────────────────────────────────────

function makeVisit(url: string, timeMs: number): BrowserVisit {
	return {
		url,
		title: "Some title",
		time: new Date(timeMs),
	};
}

function makeSearch(query: string, timeMs: number): SearchQuery {
	return {
		query,
		time: new Date(timeMs),
		engine: "google.com",
	};
}

// ── linkSearchesToVisits ──────────────────────────────────

describe("linkSearchesToVisits", () => {
	const BASE = 1_700_000_000_000; // arbitrary base timestamp
	const MIN = 60_000;
	const WIN = 5 * MIN; // default 5-minute window

	it("returns empty array when searches is empty", () => {
		const visits = [makeVisit("https://example.com", BASE + 30_000)];
		expect(linkSearchesToVisits([], visits)).toEqual([]);
	});

	it("returns pairs with empty visits when no visits fall in the window", () => {
		const searches = [makeSearch("typescript generics", BASE)];
		const visits = [makeVisit("https://example.com", BASE + WIN + 1_000)]; // just outside window
		const result = linkSearchesToVisits(searches, visits);
		expect(result).toHaveLength(1);
		expect(result[0].visits).toHaveLength(0);
	});

	it("links a visit that is exactly at the search time (gap = 0)", () => {
		const searches = [makeSearch("typescript generics", BASE)];
		const visits = [makeVisit("https://typescriptlang.org/docs", BASE)];
		const result = linkSearchesToVisits(searches, visits);
		expect(result[0].visits).toHaveLength(1);
	});

	it("links a visit at exactly windowMs after the search", () => {
		const searches = [makeSearch("typescript generics", BASE)];
		const visits = [makeVisit("https://typescriptlang.org/docs", BASE + WIN)];
		const result = linkSearchesToVisits(searches, visits);
		expect(result[0].visits).toHaveLength(1);
	});

	it("does not link a visit before the search time", () => {
		const searches = [makeSearch("typescript generics", BASE)];
		const visits = [makeVisit("https://typescriptlang.org/docs", BASE - 1_000)]; // before search
		const result = linkSearchesToVisits(searches, visits);
		expect(result[0].visits).toHaveLength(0);
	});

	it("links multiple visits within the window", () => {
		const searches = [makeSearch("react hooks", BASE)];
		const visits = [
			makeVisit("https://reactjs.org/docs/hooks-intro.html", BASE + MIN),
			makeVisit("https://reactjs.org/docs/hooks-state.html", BASE + 2 * MIN),
			makeVisit("https://react.dev/learn/managing-state", BASE + 4 * MIN),
		];
		const result = linkSearchesToVisits(searches, visits);
		expect(result[0].visits).toHaveLength(3);
	});

	// ── intentType inference ─────────────────────

	it("returns 'directed' when 1 visit is linked", () => {
		const searches = [makeSearch("typescript generics", BASE)];
		const visits = [makeVisit("https://typescriptlang.org/docs", BASE + 30_000)];
		const result = linkSearchesToVisits(searches, visits);
		expect(result[0].intentType).toBe("directed");
	});

	it("returns 'directed' when 2 visits are linked", () => {
		const searches = [makeSearch("typescript generics", BASE)];
		const visits = [
			makeVisit("https://typescriptlang.org/docs", BASE + 30_000),
			makeVisit("https://stackoverflow.com/q/1", BASE + MIN),
		];
		const result = linkSearchesToVisits(searches, visits);
		expect(result[0].intentType).toBe("directed");
	});

	it("returns 'undirected' when 3 or more visits are linked", () => {
		const searches = [makeSearch("css grid layout", BASE)];
		const visits = [
			makeVisit("https://css-tricks.com/a", BASE + 30_000),
			makeVisit("https://mdn.mozilla.org/b", BASE + MIN),
			makeVisit("https://web.dev/c", BASE + 2 * MIN),
		];
		const result = linkSearchesToVisits(searches, visits);
		expect(result[0].intentType).toBe("undirected");
	});

	it("returns 'directed' with 0 visits (no result to direct to)", () => {
		const searches = [makeSearch("something obscure", BASE)];
		const result = linkSearchesToVisits(searches, []);
		expect(result[0].intentType).toBe("directed");
	});

	// ── multiple searches ────────────────────────

	it("handles multiple searches independently", () => {
		const searches = [
			makeSearch("query A", BASE),
			makeSearch("query B", BASE + 10 * MIN),
		];
		const visits = [
			makeVisit("https://a.com", BASE + MIN),
			makeVisit("https://b.com", BASE + 11 * MIN),
		];
		const result = linkSearchesToVisits(searches, visits);
		expect(result).toHaveLength(2);
		expect(result[0].visits[0].url).toBe("https://a.com");
		expect(result[1].visits[0].url).toBe("https://b.com");
	});

	it("preserves the search query string in the result", () => {
		const searches = [makeSearch("vitest mocking modules", BASE)];
		const result = linkSearchesToVisits(searches, []);
		expect(result[0].query).toBe("vitest mocking modules");
	});

	// ── null-time handling ───────────────────────

	it("returns empty visits when search has null time", () => {
		const searches: SearchQuery[] = [{ query: "foo", time: null, engine: "google.com" }];
		const visits = [makeVisit("https://example.com", BASE)];
		const result = linkSearchesToVisits(searches, visits);
		expect(result[0].visits).toHaveLength(0);
	});

	it("skips visits with null time", () => {
		const searches = [makeSearch("bar", BASE)];
		const visits: BrowserVisit[] = [
			{ url: "https://example.com", title: "Foo", time: null },
		];
		const result = linkSearchesToVisits(searches, visits);
		expect(result[0].visits).toHaveLength(0);
	});

	// ── custom windowMs ──────────────────────────

	it("respects a custom windowMs", () => {
		const CUSTOM_WIN = 1 * MIN; // 1-minute window
		const searches = [makeSearch("rust ownership", BASE)];
		const visits = [
			makeVisit("https://doc.rust-lang.org/a", BASE + 30_000), // within 1 min
			makeVisit("https://doc.rust-lang.org/b", BASE + 2 * MIN), // outside 1 min
		];
		const result = linkSearchesToVisits(searches, visits, CUSTOM_WIN);
		expect(result[0].visits).toHaveLength(1);
	});
});
