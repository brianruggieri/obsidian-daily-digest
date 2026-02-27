import { describe, it, expect } from "vitest";
import {
	buildTfIdf,
	cosineSimilarity,
	labelCluster,
	clusterArticles,
} from "../../../src/analyze/clusters";
import { BrowserVisit } from "../../../src/types";

// ── Helpers ──────────────────────────────────────────────

const BASE_MS = 1_700_000_000_000;
const MIN = 60_000;

function makeVisit(url: string, offsetMin = 0): BrowserVisit {
	return {
		url,
		title: "",
		time: new Date(BASE_MS + offsetMin * MIN),
	};
}

// ── buildTfIdf ───────────────────────────────────────────

describe("buildTfIdf", () => {
	it("returns a matrix with one entry per title", () => {
		const titles = ["typescript generics inference", "react hooks state"];
		const matrix = buildTfIdf(titles);
		expect(matrix.size).toBe(2);
	});

	it("assigns higher TF-IDF to a term that appears in fewer documents", () => {
		const titles = [
			"typescript generics inference types",
			"typescript react integration hooks",
		];
		// "typescript" appears in both docs → lower IDF
		// "generics" appears in only 1 doc → higher IDF
		const matrix = buildTfIdf(titles);
		const doc0 = matrix.get("0")!;
		const tsScore = doc0.get("typescript") ?? 0;
		const genericsScore = doc0.get("generics") ?? 0;
		expect(genericsScore).toBeGreaterThan(tsScore);
	});

	it("assigns lower score to a term appearing in all documents (smooth IDF)", () => {
		// Smooth IDF: 1 + log(N/df). For N=2, df=2: IDF = 1 + log(1) = 1.
		// For N=2, df=1: IDF = 1 + log(2) ≈ 1.69.
		// So shared terms get lower score than unique terms.
		const titles = ["common word special", "common word unique"];
		const matrix = buildTfIdf(titles);
		const doc0 = matrix.get("0")!;
		const sharedScore = doc0.get("common") ?? 0;
		const uniqueScore = doc0.get("special") ?? 0;
		// Unique terms get higher TF-IDF than shared terms
		expect(uniqueScore).toBeGreaterThan(sharedScore);
		// Shared term score is > 0 with smooth IDF
		expect(sharedScore).toBeGreaterThan(0);
	});

	it("filters out stopwords from the tokeniser", () => {
		// ENTITY_STOPWORDS includes "HTML", "API", "URL", "CSS", "SDK", "CLI", "IDE"
		// After lowercasing: "html", "api", "url", "css", "sdk", "cli", "ide" are in STOPWORDS_LOWER
		// "to" is 2 chars (not > 2) and is also filtered by length
		const titles = ["HTML API URL CSS SDK to"];
		const matrix = buildTfIdf(titles);
		const doc0 = matrix.get("0")!;
		// All tokens are stopwords or too short — nothing should remain
		expect(doc0.size).toBe(0);
	});

	it("handles a single-title corpus without crashing", () => {
		const titles = ["unique topic deep dive exploration"];
		const matrix = buildTfIdf(titles);
		expect(matrix.size).toBe(1);
	});
});

// ── cosineSimilarity ─────────────────────────────────────

describe("cosineSimilarity", () => {
	it("returns 1.0 for identical vectors", () => {
		const a = new Map([["foo", 1], ["bar", 2]]);
		const b = new Map([["foo", 1], ["bar", 2]]);
		expect(cosineSimilarity(a, b)).toBeCloseTo(1.0);
	});

	it("returns 0 for orthogonal vectors (no shared terms)", () => {
		const a = new Map([["foo", 1]]);
		const b = new Map([["bar", 1]]);
		expect(cosineSimilarity(a, b)).toBeCloseTo(0);
	});

	it("returns 0 for an empty vector", () => {
		const a = new Map<string, number>();
		const b = new Map([["foo", 1]]);
		expect(cosineSimilarity(a, b)).toBe(0);
	});

	it("returns a value between 0 and 1 for partially-overlapping vectors", () => {
		const a = new Map([["typescript", 0.5], ["generics", 0.8]]);
		const b = new Map([["typescript", 0.5], ["hooks", 0.8]]);
		const sim = cosineSimilarity(a, b);
		expect(sim).toBeGreaterThan(0);
		expect(sim).toBeLessThan(1);
	});
});

// ── labelCluster ─────────────────────────────────────────

describe("labelCluster", () => {
	it("returns top-3 most frequent meaningful words joined by space", () => {
		const articles = [
			"TypeScript generic constraints explained",
			"TypeScript generic type inference guide",
			"TypeScript generic utility types",
		];
		const label = labelCluster(articles);
		// "typescript" and "generic" appear 3x each; next most frequent differs
		expect(label).toContain("typescript");
		expect(label).toContain("generic");
	});

	it("excludes words of 3 chars or fewer", () => {
		// All words are <= 3 chars so none pass the > 3 char filter
		const articles = ["how the use to run and for"];
		const label = labelCluster(articles);
		expect(label).toBe("");
	});

	it("returns empty string for empty articles array", () => {
		expect(labelCluster([])).toBe("");
	});

	it("returns only words longer than 3 chars from article text", () => {
		// "info" is 4 chars, passes filter; "on" and "the" are <= 3 chars, excluded
		const articles = ["info on the info on the info"];
		const label = labelCluster(articles);
		expect(label).toBe("info");
	});
});

// ── clusterArticles ──────────────────────────────────────

describe("clusterArticles", () => {
	it("returns empty array when no visits pass the engagement threshold", () => {
		const visits = [makeVisit("https://example.com", 0)];
		const titles = ["Home"];
		const scores = [0.1]; // below 0.5
		const clusters = clusterArticles(visits, titles, scores);
		expect(clusters).toEqual([]);
	});

	it("returns empty array when there is only one substantive visit (singleton dropped)", () => {
		const visits = [makeVisit("https://typescriptlang.org", 0)];
		const titles = ["TypeScript generics constraints tutorial"];
		const scores = [0.75]; // above 0.5, but only one visit
		const clusters = clusterArticles(visits, titles, scores);
		expect(clusters).toEqual([]);
	});

	it("groups two similar visits into one cluster", () => {
		const visits = [
			makeVisit("https://typescriptlang.org/docs/generics", 0),
			makeVisit("https://stackoverflow.com/q/generics", 5),
		];
		const titles = [
			"TypeScript generic constraints tutorial overview",
			"TypeScript generic type constraints example solution",
		];
		const scores = [0.75, 0.75];
		const clusters = clusterArticles(visits, titles, scores);
		expect(clusters).toHaveLength(1);
		expect(clusters[0].articles).toHaveLength(2);
	});

	it("splits visits by time gap: two distinct sessions produce separate clusters", () => {
		// Use a lower similarity threshold (0.1) to focus on testing the time-gap
		// session boundary logic, not TF-IDF similarity.
		const SESSION_GAP_MS = 45 * MIN;
		const LOW_THRESHOLD = 0.1;
		const visits = [
			makeVisit("https://typescriptlang.org/docs", 0),
			makeVisit("https://typescriptlang.org/handbook", 5),
			// 60-minute gap — beyond session boundary:
			makeVisit("https://reactjs.org/docs/hooks", 65),
			makeVisit("https://react.dev/learn/state", 70),
		];
		const titles = [
			"TypeScript generics constraints overview tutorial guide",
			"TypeScript generics constraints narrowing advanced guide",
			"React hooks state patterns complete tutorial overview",
			"React hooks state patterns advanced complete guide",
		];
		const scores = [0.75, 0.75, 0.75, 0.75];
		const clusters = clusterArticles(visits, titles, scores, SESSION_GAP_MS, LOW_THRESHOLD);
		// The two groups are separated by > 45 minutes → should form distinct clusters
		expect(clusters.length).toBeGreaterThanOrEqual(2);
	});

	it("each cluster has a non-empty label", () => {
		const visits = [
			makeVisit("https://typescriptlang.org/docs", 0),
			makeVisit("https://stackoverflow.com/q/ts", 5),
		];
		const titles = [
			"TypeScript generic constraints explained tutorial",
			"TypeScript generic type inference guide",
		];
		const scores = [0.75, 0.75];
		const clusters = clusterArticles(visits, titles, scores);
		if (clusters.length > 0) {
			expect(clusters[0].label.length).toBeGreaterThan(0);
		}
	});

	it("cluster timeRange.start <= timeRange.end", () => {
		const visits = [
			makeVisit("https://typescriptlang.org/docs", 0),
			makeVisit("https://stackoverflow.com/q/ts", 10),
		];
		const titles = [
			"TypeScript generic constraints explained tutorial",
			"TypeScript generic type inference advanced guide",
		];
		const scores = [0.75, 0.75];
		const clusters = clusterArticles(visits, titles, scores);
		for (const cluster of clusters) {
			expect(cluster.timeRange.start.getTime()).toBeLessThanOrEqual(
				cluster.timeRange.end.getTime(),
			);
		}
	});

	it("infers 'research' intent when 3+ distinct domains are in a cluster", () => {
		const visits = [
			makeVisit("https://typescriptlang.org/docs", 0),
			makeVisit("https://stackoverflow.com/q/ts", 5),
			makeVisit("https://mdn.mozilla.org/js/types", 10),
		];
		const titles = [
			"TypeScript generic constraints tutorial guide",
			"TypeScript generic type inference overview",
			"TypeScript type system generics reference",
		];
		const scores = [0.75, 0.75, 0.75];
		const clusters = clusterArticles(visits, titles, scores);
		if (clusters.length > 0) {
			expect(clusters[0].intentSignal).toBe("research");
		}
	});

	it("engagementScore is between 0 and 1 for all clusters", () => {
		const visits = [
			makeVisit("https://typescriptlang.org/docs", 0),
			makeVisit("https://stackoverflow.com/q/ts", 5),
		];
		const titles = [
			"TypeScript generic constraints explained tutorial",
			"TypeScript generic type inference advanced guide",
		];
		const scores = [0.75, 0.60];
		const clusters = clusterArticles(visits, titles, scores);
		for (const cluster of clusters) {
			expect(cluster.engagementScore).toBeGreaterThan(0);
			expect(cluster.engagementScore).toBeLessThanOrEqual(1);
		}
	});
});
