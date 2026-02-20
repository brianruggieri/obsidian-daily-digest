import { describe, it, expect } from "vitest";
import { compressActivity } from "../../src/compress";
import { estimateTokens } from "../../src/chunker";
import { categorizeVisits } from "../../src/categorize";
import {
	generateBrowserVisits,
	generateSearchQueries,
	generateShellCommands,
	generateClaudeSessions,
	DOMAIN_SETS,
	SEARCH_TEMPLATES,
} from "../fixtures/generators";
import { generateTimeSeries, defaultTimeConfig } from "../fixtures/time-utils";

const TIME_CONFIG = defaultTimeConfig(new Date("2025-06-15T00:00:00"));

function makeTimestamps(count: number): Date[] {
	return generateTimeSeries(count, TIME_CONFIG);
}

// ── compressActivity ─────────────────────────────────────

describe("compressActivity", () => {
	it("returns empty markers for zero events", () => {
		const result = compressActivity({}, [], [], [], 3000);
		expect(result.totalEvents).toBe(0);
		expect(result.tokenEstimate).toBe(0);
		expect(result.browserText).toBe("  (none)");
		expect(result.searchText).toBe("  (none)");
		expect(result.shellText).toBe("  (none)");
		expect(result.claudeText).toBe("  (none)");
	});

	it("compresses a small day within budget", () => {
		const visits = generateBrowserVisits({
			count: 30,
			domains: DOMAIN_SETS.webdev,
			timestamps: makeTimestamps(30),
		});
		const searches = generateSearchQueries({
			count: 8,
			queries: SEARCH_TEMPLATES.webdev,
			timestamps: makeTimestamps(8),
		});
		const shell = generateShellCommands({
			count: 15,
			workflow: "webdev",
			timestamps: makeTimestamps(15),
		});
		const claude = generateClaudeSessions({
			count: 5,
			promptCategory: "coding",
			projectName: "my-app",
			timestamps: makeTimestamps(5),
		});

		const categorized = categorizeVisits(visits);
		const result = compressActivity(categorized, searches, shell, claude, 3000);

		expect(result.totalEvents).toBe(30 + searches.length + 15 + 5);
		expect(result.tokenEstimate).toBeGreaterThan(0);
		expect(result.tokenEstimate).toBeLessThanOrEqual(3500);
		expect(result.browserText).not.toBe("  (none)");
		expect(result.searchText).not.toBe("  (none)");
	});

	it("compresses a heavy day (500+ events) within budget", () => {
		const allSearchQueries = [
			...SEARCH_TEMPLATES.webdev,
			...SEARCH_TEMPLATES.research,
			...SEARCH_TEMPLATES.devops,
			...SEARCH_TEMPLATES.general,
		];
		const visits = generateBrowserVisits({
			count: 400,
			domains: [
				...DOMAIN_SETS.webdev,
				...DOMAIN_SETS.communication,
				...DOMAIN_SETS.research,
				...DOMAIN_SETS.news,
			],
			timestamps: makeTimestamps(400),
		});
		const searches = generateSearchQueries({
			count: allSearchQueries.length,
			queries: allSearchQueries,
			timestamps: makeTimestamps(allSearchQueries.length),
		});
		const shell = generateShellCommands({
			count: 80,
			workflow: "webdev",
			timestamps: makeTimestamps(80),
		});
		const claude = generateClaudeSessions({
			count: 30,
			promptCategory: "coding",
			projectName: "big-project",
			timestamps: makeTimestamps(30),
		});

		const categorized = categorizeVisits(visits);
		const result = compressActivity(categorized, searches, shell, claude, 3000);

		const expectedTotal = 400 + searches.length + 80 + 30;
		expect(result.totalEvents).toBe(expectedTotal);
		expect(result.totalEvents).toBeGreaterThan(500);
		// Should fit within budget (with some tolerance for progressive compression)
		expect(result.tokenEstimate).toBeLessThanOrEqual(4000);
		// Should still contain meaningful data
		expect(result.browserText).toContain("visits");
		expect(result.searchText).toContain("queries");
		expect(result.shellText).toContain("commands");
		expect(result.claudeText).toContain("prompts");
	});

	it("allocates budget proportionally to source sizes", () => {
		// Browser-heavy day: 200 visits, 5 searches, 5 shell, 0 claude
		const visits = generateBrowserVisits({
			count: 200,
			domains: DOMAIN_SETS.webdev,
			timestamps: makeTimestamps(200),
		});
		const searches = generateSearchQueries({
			count: 5,
			queries: SEARCH_TEMPLATES.webdev.slice(0, 5),
			timestamps: makeTimestamps(5),
		});
		const shell = generateShellCommands({
			count: 5,
			workflow: "webdev",
			timestamps: makeTimestamps(5),
		});

		const categorized = categorizeVisits(visits);
		const result = compressActivity(categorized, searches, shell, [], 3000);

		// Browser should get the lion's share of the token budget
		const browserTokens = estimateTokens(result.browserText);
		const searchTokens = estimateTokens(result.searchText);
		expect(browserTokens).toBeGreaterThan(searchTokens);
	});

	it("handles single-source days (browser only)", () => {
		const visits = generateBrowserVisits({
			count: 100,
			domains: DOMAIN_SETS.webdev,
			timestamps: makeTimestamps(100),
		});
		const categorized = categorizeVisits(visits);
		const result = compressActivity(categorized, [], [], [], 2000);

		expect(result.totalEvents).toBe(100);
		expect(result.browserText).not.toBe("  (none)");
		expect(result.searchText).toBe("  (none)");
		expect(result.shellText).toBe("  (none)");
		expect(result.claudeText).toBe("  (none)");
	});

	it("respects a tiny budget by using stats-only mode", () => {
		const allSearchQueries = [
			...SEARCH_TEMPLATES.webdev,
			...SEARCH_TEMPLATES.research,
		];
		const visits = generateBrowserVisits({
			count: 300,
			domains: [
				...DOMAIN_SETS.webdev,
				...DOMAIN_SETS.communication,
				...DOMAIN_SETS.research,
			],
			timestamps: makeTimestamps(300),
		});
		const searches = generateSearchQueries({
			count: allSearchQueries.length,
			queries: allSearchQueries,
			timestamps: makeTimestamps(allSearchQueries.length),
		});
		const shell = generateShellCommands({
			count: 50,
			workflow: "devops",
			timestamps: makeTimestamps(50),
		});

		const categorized = categorizeVisits(visits);
		// Very tight budget — should force stats-only compression
		const result = compressActivity(categorized, searches, shell, [], 500);

		const expectedTotal = 300 + searches.length + 50;
		expect(result.totalEvents).toBe(expectedTotal);
		// Should still produce output, just compressed
		expect(result.browserText.length).toBeGreaterThan(0);
		expect(result.tokenEstimate).toBeLessThanOrEqual(800); // generous tolerance
	});

	it("includes time ranges in browser output", () => {
		const visits = generateBrowserVisits({
			count: 20,
			domains: DOMAIN_SETS.webdev,
			timestamps: makeTimestamps(20),
		});
		const categorized = categorizeVisits(visits);
		const result = compressActivity(categorized, [], [], [], 3000);

		// Time range format includes HH:MM somewhere in the text
		expect(result.browserText).toMatch(/\d{2}:\d{2}/);
	});

	it("includes domain counts in browser output", () => {
		const visits = generateBrowserVisits({
			count: 50,
			domains: DOMAIN_SETS.webdev,
			timestamps: makeTimestamps(50),
		});
		const categorized = categorizeVisits(visits);
		const result = compressActivity(categorized, [], [], [], 3000);

		// Should include count in parentheses like "github.com (12)"
		expect(result.browserText).toMatch(/\(\d+\)/);
	});

	it("groups Claude sessions by project", () => {
		const sessions = [
			...generateClaudeSessions({
				count: 5,
				promptCategory: "coding",
				projectName: "frontend",
				timestamps: makeTimestamps(5),
			}),
			...generateClaudeSessions({
				count: 3,
				promptCategory: "devops",
				projectName: "infra",
				timestamps: makeTimestamps(3),
			}),
		];

		const result = compressActivity({}, [], [], sessions, 3000);

		expect(result.claudeText).toContain("frontend");
		expect(result.claudeText).toContain("infra");
		expect(result.totalEvents).toBe(8);
	});
});
