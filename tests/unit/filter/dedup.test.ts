import { describe, it, expect } from "vitest";
import { canonicalKey, deduplicateVisits, DEDUP_DEFAULTS } from "../../../src/filter/dedup";
import type { BrowserVisit } from "../../../src/types";

// ── Helpers ──────────────────────────────────────────────

function visit(url: string, title: string, time: Date, visitCount?: number): BrowserVisit {
	return { url, title, time, visitCount };
}

// ── canonicalKey() ───────────────────────────────────────

describe("canonicalKey", () => {
	it("strips query string from Amazon product URL", () => {
		const url = "https://www.amazon.com/gp/buy/thankyou/handlers/display.html?orderId=112-345&token=abc&purchaseId=xyz";
		expect(canonicalKey(url)).toBe("https://amazon.com/gp/buy/thankyou/handlers/display.html");
	});

	it("strips /@lat,lng,zoom from Google Maps directions URL", () => {
		const url = "https://maps.google.com/maps/dir/Providence+Canyon/Columbus+GA/@32.4527517,-84.9942759,12.67z";
		expect(canonicalKey(url)).toBe("https://maps.google.com/maps/dir/Providence+Canyon/Columbus+GA");
	});

	it("strips www. from hostname", () => {
		const url = "https://www.airbnb.com/book/stays/12345?locale=en&adults=2&currency=USD";
		expect(canonicalKey(url)).toBe("https://airbnb.com/book/stays/12345");
	});

	it("returns / for root URLs with no path", () => {
		expect(canonicalKey("https://example.com/")).toBe("https://example.com/");
		expect(canonicalKey("https://example.com")).toBe("https://example.com/");
	});

	it("returns raw URL unchanged if new URL() throws", () => {
		const bad = "not-a-valid-url";
		expect(canonicalKey(bad)).toBe(bad);
	});

	it("does not strip path for non-Maps Google URLs", () => {
		const url = "https://www.google.com/search?q=typescript+generics";
		expect(canonicalKey(url)).toBe("https://google.com/search");
	});

	it("strips query string from Airbnb booking URL", () => {
		const url = "https://www.airbnb.com/book/stays/99999?locale=en&adults=2&currency=USD&source=pdp_availability";
		expect(canonicalKey(url)).toBe("https://airbnb.com/book/stays/99999");
	});

	it("strips URL fragment", () => {
		const url = "https://docs.example.com/guide#section-3";
		expect(canonicalKey(url)).toBe("https://docs.example.com/guide");
	});

	it("strips trailing slash from path", () => {
		const url = "https://example.com/foo/bar/";
		expect(canonicalKey(url)).toBe("https://example.com/foo/bar");
	});

	it("handles Google Maps via google.com/maps/ path", () => {
		const url = "https://www.google.com/maps/place/Eiffel+Tower/@48.8583701,2.2944813,17z";
		expect(canonicalKey(url)).toBe("https://google.com/maps/place/Eiffel+Tower");
	});
});

// ── deduplicateVisits() — near-duplicate collapsing ──────

describe("deduplicateVisits — near-duplicate collapsing", () => {
	it("collapses 81 Google Maps zoom variants to 1, collapsedCount = 80", () => {
		const base = "https://maps.google.com/maps/dir/Providence+Canyon/Columbus+GA";
		const zooms = Array.from({ length: 81 }, (_, i) =>
			visit(
				`${base}/@32.4527517,-84.994${i},${(10 + i * 0.1).toFixed(2)}z`,
				"Providence Canyon to Columbus, GA",
				new Date(2026, 1, 26, 8, i)
			)
		);

		const result = deduplicateVisits(zooms, DEDUP_DEFAULTS);
		expect(result.visits.length).toBe(1);
		expect(result.collapsedCount).toBe(80);
	});

	it("collapses 18 Airbnb param variants to 1", () => {
		const base = "https://www.airbnb.com/book/stays/12345";
		const locales = ["en", "fr", "de", "es", "it", "pt", "nl", "ja", "ko", "zh", "sv", "no", "da", "fi", "pl", "ru", "ar", "he"];
		const visits = locales.map((locale, i) =>
			visit(
				`${base}?locale=${locale}&adults=2&currency=USD&source=pdp`,
				"Airbnb booking confirmation",
				new Date(2026, 1, 26, 10, i)
			)
		);

		const result = deduplicateVisits(visits, DEDUP_DEFAULTS);
		expect(result.visits.length).toBe(1);
	});

	it("collapses duplicate keys but preserves distinct paths", () => {
		const v1 = visit("https://github.com/org/repo-a", "repo-a", new Date(2026, 1, 26, 9, 0));
		const v2 = visit("https://github.com/org/repo-a?tab=issues", "repo-a issues", new Date(2026, 1, 26, 9, 1));
		const v3 = visit("https://github.com/org/repo-b", "repo-b", new Date(2026, 1, 26, 9, 2));

		const result = deduplicateVisits([v1, v2, v3], { maxVisitsPerDomain: 10, maxOtherTotal: 20 });
		// repo-a and repo-a?tab=issues share canonical key; repo-b is distinct
		expect(result.visits.length).toBe(2);
		expect(result.collapsedCount).toBe(1);
	});
});

// ── deduplicateVisits() — representative selection ───────

describe("deduplicateVisits — representative selection", () => {
	it("picks the visit with the longest title within a group", () => {
		const short = visit("https://example.com/page?q=1", "Page", new Date(2026, 1, 26, 8, 0));
		const long  = visit("https://example.com/page?q=2", "Page Title — The Full Article Headline", new Date(2026, 1, 26, 8, 1));
		const mid   = visit("https://example.com/page?q=3", "Page Title", new Date(2026, 1, 26, 8, 2));

		const result = deduplicateVisits([short, long, mid], { maxVisitsPerDomain: 10, maxOtherTotal: 20 });
		expect(result.visits.length).toBe(1);
		expect(result.visits[0].title).toBe("Page Title — The Full Article Headline");
	});

	it("tiebreaks equal-length titles by earliest timestamp", () => {
		const earlier = visit("https://example.com/page?x=1", "Same Title", new Date(2026, 1, 26, 8, 0));
		const later   = visit("https://example.com/page?x=2", "Same Title", new Date(2026, 1, 26, 9, 0));

		const result = deduplicateVisits([later, earlier], { maxVisitsPerDomain: 10, maxOtherTotal: 20 });
		expect(result.visits.length).toBe(1);
		expect(result.visits[0].time).toEqual(new Date(2026, 1, 26, 8, 0));
	});
});

// ── deduplicateVisits() — per-domain cap ─────────────────

describe("deduplicateVisits — per-domain cap", () => {
	it("caps 10 distinct github.com paths to 5 (most recent 5)", () => {
		const visits = Array.from({ length: 10 }, (_, i) =>
			visit(
				`https://github.com/org/repo-${i}`,
				`repo-${i}`,
				new Date(2026, 1, 26, 8, i)   // i=0 is earliest, i=9 is latest
			)
		);

		const result = deduplicateVisits(visits, { maxVisitsPerDomain: 5, maxOtherTotal: 20 });
		expect(result.visits.length).toBe(5);
		// The 5 most recent should be kept (indices 5-9)
		const titles = result.visits.map((v) => v.title);
		for (let i = 5; i <= 9; i++) {
			expect(titles).toContain(`repo-${i}`);
		}
	});

	it("keeps all entries for two domains each with 3 distinct pages", () => {
		const githubVisits = Array.from({ length: 3 }, (_, i) =>
			visit(`https://github.com/repo-${i}`, `github repo ${i}`, new Date(2026, 1, 26, 8, i))
		);
		const npmVisits = Array.from({ length: 3 }, (_, i) =>
			visit(`https://npmjs.com/package/pkg-${i}`, `npm pkg ${i}`, new Date(2026, 1, 26, 9, i))
		);

		const result = deduplicateVisits([...githubVisits, ...npmVisits], { maxVisitsPerDomain: 5, maxOtherTotal: 20 });
		expect(result.visits.length).toBe(6);
	});
});

// ── Output properties ────────────────────────────────────

describe("deduplicateVisits — output properties", () => {
	it("output is sorted by time descending", () => {
		const visits = [
			visit("https://alpha.com/a", "Alpha A", new Date(2026, 1, 26, 8, 0)),
			visit("https://beta.com/b",  "Beta B",  new Date(2026, 1, 26, 10, 0)),
			visit("https://gamma.com/c", "Gamma C", new Date(2026, 1, 26, 9, 0)),
		];

		const result = deduplicateVisits(visits, DEDUP_DEFAULTS);
		const times = result.visits.map((v) => v.time?.getTime() ?? 0);
		expect(times).toEqual([...times].sort((a, b) => b - a));
	});

	it("collapsedCount equals total input length minus output length", () => {
		// 5 Google Maps variants → 1 canonical after phase 1
		// 4 github.com distinct → capped at 3 after phase 2
		const mapsVisits = Array.from({ length: 5 }, (_, i) =>
			visit(
				`https://maps.google.com/maps/place/Paris/@48.858${i},2.294,15z`,
				"Paris",
				new Date(2026, 1, 26, 8, i)
			)
		);
		const githubVisits = Array.from({ length: 4 }, (_, i) =>
			visit(`https://github.com/user/proj-${i}`, `proj ${i}`, new Date(2026, 1, 26, 9, i))
		);

		const input = [...mapsVisits, ...githubVisits];
		const result = deduplicateVisits(input, { maxVisitsPerDomain: 3, maxOtherTotal: 20 });

		expect(result.collapsedCount).toBe(input.length - result.visits.length);
	});

	it("returns empty result for empty input", () => {
		const result = deduplicateVisits([], DEDUP_DEFAULTS);
		expect(result.visits).toEqual([]);
		expect(result.collapsedCount).toBe(0);
	});

	it("returns single visit unchanged", () => {
		const v = visit("https://example.com/page", "Example Page", new Date(2026, 1, 26, 8, 0));
		const result = deduplicateVisits([v], DEDUP_DEFAULTS);
		expect(result.visits.length).toBe(1);
		expect(result.collapsedCount).toBe(0);
	});
});
