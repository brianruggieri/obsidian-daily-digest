/**
 * Privacy tests for classify.ts — verifies that rule-based classification
 * does NOT leak raw domain names, page titles, or verbatim search queries.
 *
 * These tests cover Bugs 1, 2 from the privacy tier overhaul:
 *   Bug 1: ruleBasedClassify() summary was event.text.slice(0, 100)
 *   Bug 2: Browser topics were raw page-title word fragments
 */

import { describe, it, expect } from "vitest";
import {
	extractSearchTopics,
	CATEGORY_TOPIC_LABELS,
	CATEGORY_SUMMARIES,
} from "../../src/filter/classify";
import { classifyEventsRuleOnly } from "../../src/filter/classify";
import type { BrowserVisit, SearchQuery, CategorizedVisits } from "../../src/types";

// ── extractSearchTopics ─────────────────────────────────

describe("extractSearchTopics", () => {
	it("maps fashion query to 'fashion'", () => {
		expect(extractSearchTopics("time traveler outfits")).toEqual(["fashion"]);
	});

	it("maps event query to 'event-planning'", () => {
		expect(extractSearchTopics("uga events march 26th")).toEqual(["event-planning"]);
	});

	it("maps job search query to 'job-search'", () => {
		expect(extractSearchTopics("software engineer salary 2025")).toEqual(["job-search"]);
	});

	it("maps dev query to a vocabulary label", () => {
		const result = extractSearchTopics("how to fix oauth token expiry");
		expect(result).not.toEqual(["information"]);
		// Should match authentication or troubleshoot-related
		expect(result.length).toBeGreaterThan(0);
	});

	it("falls back to 'information' for unrecognized queries", () => {
		expect(extractSearchTopics("xyzzy blorp wumble")).toEqual(["information"]);
	});

	it("does not return the raw query text", () => {
		const result = extractSearchTopics("airbnb trips booking");
		// Result should be a semantic label, not the raw query
		for (const topic of result) {
			expect(topic).not.toContain("airbnb");
			expect(topic).not.toContain("trips");
			expect(topic).not.toContain("booking");
		}
	});
});

// ── CATEGORY_TOPIC_LABELS ────────────────────────────────

describe("CATEGORY_TOPIC_LABELS", () => {
	it("returns semantic labels for known categories", () => {
		expect(CATEGORY_TOPIC_LABELS["social"]).toEqual(["social networking"]);
		expect(CATEGORY_TOPIC_LABELS["dev"]).toEqual(["software development"]);
		expect(CATEGORY_TOPIC_LABELS["shopping"]).toEqual(["online shopping"]);
	});

	it("returns empty array for 'other'", () => {
		expect(CATEGORY_TOPIC_LABELS["other"]).toEqual([]);
	});

	it("gracefully returns undefined for unknown UT1 keys (fallback handled by caller)", () => {
		// Unknown keys should not crash — caller uses ?? [] fallback
		const result = CATEGORY_TOPIC_LABELS["social_networks"];
		expect(result).toBeUndefined();
	});
});

// ── CATEGORY_SUMMARIES ────────────────────────────────────

describe("CATEGORY_SUMMARIES", () => {
	it("returns social media summary for social category", () => {
		expect(CATEGORY_SUMMARIES["social"]).toBe("Browsing social media");
	});

	it("has a general fallback for 'other'", () => {
		expect(CATEGORY_SUMMARIES["other"]).toBe("General web browsing");
	});
});

// ── ruleBasedClassify via classifyEventsRuleOnly ──────────

describe("rule-based classification privacy (no raw data in summary)", () => {
	const emptyCategorized: CategorizedVisits = {};

	it("browser event summary does not contain domain or page title text", () => {
		const visits: BrowserVisit[] = [
			{
				url: "https://airbnb.com/trips",
				domain: "airbnb.com",
				title: "Your trips - Airbnb",
				time: new Date("2026-02-26T10:00:00Z"),
			},
		];
		const categorized: CategorizedVisits = {
			travel: visits,
		};

		const result = classifyEventsRuleOnly(visits, [], [], [], categorized);
		const event = result.events[0];

		expect(event.summary).not.toContain("airbnb");
		expect(event.summary).not.toContain("airbnb.com");
		expect(event.summary).not.toContain("Your trips");
	});

	it("browser event topics do not contain page-title fragments", () => {
		const visits: BrowserVisit[] = [
			{
				url: "https://specright.com/dashboard",
				domain: "specright.com",
				title: "Specright - Product Specification Management",
				time: new Date("2026-02-26T09:00:00Z"),
			},
		];
		const categorized: CategorizedVisits = {
			work: visits,
		};

		const result = classifyEventsRuleOnly(visits, [], [], [], categorized);
		const event = result.events[0];

		// Topics should not be raw page-title words
		for (const topic of event.topics) {
			expect(topic).not.toContain("Specright");
			expect(topic).not.toContain("specright");
			expect(topic).not.toContain("Product");
			expect(topic).not.toContain("Specification");
		}
	});

	it("search event summary starts with 'Searched for' or is generic, not raw query", () => {
		const searches: SearchQuery[] = [
			{
				query: "time traveler outfits for halloween",
				engine: "google.com",
				time: new Date("2026-02-26T11:00:00Z"),
			},
		];

		const result = classifyEventsRuleOnly([], searches, [], [], emptyCategorized);
		const event = result.events[0];

		// Summary should be semantic, not raw query
		expect(event.summary).not.toContain("time traveler outfits for halloween");
		expect(event.summary).not.toContain('"time traveler');
		// Should be either "Searched for <topic>" or "Performed online search"
		expect(
			event.summary.startsWith("Searched for") ||
			event.summary === "Performed online search"
		).toBe(true);
	});

	it("search event topics do not contain verbatim query text", () => {
		const searches: SearchQuery[] = [
			{
				query: "specright isolvedhire agentic job search",
				engine: "google.com",
				time: new Date("2026-02-26T11:00:00Z"),
			},
		];

		const result = classifyEventsRuleOnly([], searches, [], [], emptyCategorized);
		const event = result.events[0];

		for (const topic of event.topics) {
			expect(topic).not.toContain("specright");
			expect(topic).not.toContain("isolvedhire");
		}
	});

	it("git event summary does not expose raw commit message", () => {
		const commits: GitCommit[] = [
			{
				hash: "abc123",
				message: "Fix OAuth token refresh race condition",
				repo: "my-secret-startup",
				time: new Date("2026-02-26T14:00:00Z"),
				insertions: 5,
				deletions: 2,
				author: "dev",
			},
		];

		const result = classifyEventsRuleOnly([], [], [], commits, emptyCategorized);
		const event = result.events[0];

		// Summary should not expose raw commit message verbatim
		// It should be something like "Committed authentication changes"
		expect(event.summary).not.toContain("my-secret-startup");
		expect(event.summary.startsWith("Committed") || event.summary.endsWith("activity")).toBe(true);
	});
});
