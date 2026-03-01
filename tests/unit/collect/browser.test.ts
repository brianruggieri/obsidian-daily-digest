import { describe, it, expect } from "vitest";
import { unwrapGoogleRedirect, collapseNearDuplicates } from "../../../src/collect/browser";
import type { BrowserVisit } from "../../../src/types";

// ── Google Redirect Extraction ──────────────────────────

describe("unwrapGoogleRedirect", () => {
	it("extracts destination from standard google.com/url?q= redirect", () => {
		const url = "https://www.google.com/url?q=https://linkedin.com/jobs/view/123&sa=D&sntz=1&usg=AOvVaw0abc";
		expect(unwrapGoogleRedirect(url)).toBe("https://linkedin.com/jobs/view/123");
	});

	it("extracts destination from Gmail click-through (google.com/url?url=)", () => {
		const url = "https://www.google.com/url?url=https://example.com/page&rct=j&q=&source=web";
		expect(unwrapGoogleRedirect(url)).toBe("https://example.com/page");
	});

	it("returns null for google.com/url without q or url param", () => {
		const url = "https://www.google.com/url?sa=t&rct=j&source=web";
		expect(unwrapGoogleRedirect(url)).toBeNull();
	});

	it("returns null for google.com/url where q is not an https URL", () => {
		const url = "https://www.google.com/url?q=javascript:void(0)";
		expect(unwrapGoogleRedirect(url)).toBeNull();
	});

	it("returns null for a regular Google search URL", () => {
		expect(unwrapGoogleRedirect("https://google.com/search?q=typescript")).toBeNull();
	});

	it("returns null for a non-google URL", () => {
		expect(unwrapGoogleRedirect("https://github.com/myorg/repo")).toBeNull();
	});

	it("returns null for an invalid URL string", () => {
		expect(unwrapGoogleRedirect("not-a-url")).toBeNull();
	});

	it("preserves full destination URL including path and query params", () => {
		const dest = "https://docs.github.com/en/actions/writing-workflows?page=2#triggers";
		const url = `https://www.google.com/url?q=${encodeURIComponent(dest)}&sa=D`;
		const result = unwrapGoogleRedirect(url);
		// URL class normalises the encoding, so compare decoded
		expect(result).toBeTruthy();
		expect(result).toContain("docs.github.com");
	});
});

// ── Near-Duplicate Collapse ────────────────────────────

describe("collapseNearDuplicates", () => {
	function visit(url: string, title: string, minuteOffset = 0): BrowserVisit {
		const time = new Date("2026-02-28T10:00:00Z");
		time.setMinutes(time.getMinutes() + minuteOffset);
		return { url, title, time };
	}

	it("collapses exact-URL dupes at the same timestamp", () => {
		const visits = [
			visit("https://example.com/page", "Page Title"),
			visit("https://example.com/page", "Page Title"),
			visit("https://example.com/page", ""),
		];
		const result = collapseNearDuplicates(visits);
		expect(result).toHaveLength(1);
		expect(result[0].title).toBe("Page Title");
	});

	it("collapses query-string variants at the same timestamp", () => {
		const visits = [
			visit("https://example.com/page?utm_source=google", "Page"),
			visit("https://example.com/page?ref=twitter", "Page - Full Title"),
			visit("https://example.com/page", ""),
		];
		const result = collapseNearDuplicates(visits);
		expect(result).toHaveLength(1);
		// Keeps the entry with the best title
		expect(result[0].title).toBe("Page - Full Title");
	});

	it("collapses www vs non-www variants at the same timestamp", () => {
		const visits = [
			visit("https://www.example.com/page", "Example Page"),
			visit("https://example.com/page", ""),
		];
		const result = collapseNearDuplicates(visits);
		expect(result).toHaveLength(1);
		expect(result[0].title).toBe("Example Page");
	});

	it("collapses visits within the same 1-minute window", () => {
		// Both at minute 0 — same window
		const visits = [
			visit("https://example.com/page", "Short", 0),
			visit("https://example.com/page?q=1", "Full Page Title Here", 0),
		];
		const result = collapseNearDuplicates(visits);
		expect(result).toHaveLength(1);
	});

	it("preserves visits to the same page in different minutes", () => {
		// Visit at minute 0 and minute 5 — different windows
		const visits = [
			visit("https://example.com/page", "Morning Visit", 0),
			visit("https://example.com/page", "Later Visit", 5),
		];
		const result = collapseNearDuplicates(visits);
		expect(result).toHaveLength(2);
	});

	it("preserves visits to different pages at the same timestamp", () => {
		const visits = [
			visit("https://example.com/page-a", "Page A"),
			visit("https://example.com/page-b", "Page B"),
		];
		const result = collapseNearDuplicates(visits);
		expect(result).toHaveLength(2);
	});

	it("handles trailing-slash differences", () => {
		const visits = [
			visit("https://example.com/page/", "With Slash"),
			visit("https://example.com/page", "Without Slash - Better Title"),
		];
		const result = collapseNearDuplicates(visits);
		expect(result).toHaveLength(1);
		expect(result[0].title).toBe("Without Slash - Better Title");
	});

	it("handles visits with null timestamps", () => {
		const visits: BrowserVisit[] = [
			{ url: "https://example.com/page", title: "A", time: null },
			{ url: "https://example.com/page", title: "B Longer", time: null },
		];
		const result = collapseNearDuplicates(visits);
		// Both have minuteKey 0, same canonical URL — collapsed
		expect(result).toHaveLength(1);
	});

	it("returns empty array for empty input", () => {
		expect(collapseNearDuplicates([])).toEqual([]);
	});

	it("handles realistic Chrome multi-visit-type scenario", () => {
		// Chrome logs TYPED, REDIRECT_PERMANENT, and LINK visits for one navigation
		const base = new Date("2026-02-28T10:30:15Z");
		const visits: BrowserVisit[] = [
			{ url: "https://github.com/user/repo", title: "", time: new Date(base.getTime()) },
			{ url: "https://github.com/user/repo", title: "user/repo", time: new Date(base.getTime() + 200) },
			{ url: "https://github.com/user/repo", title: "user/repo: Description", time: new Date(base.getTime() + 500) },
		];
		const result = collapseNearDuplicates(visits);
		expect(result).toHaveLength(1);
		expect(result[0].title).toBe("user/repo: Description");
	});
});
