import { describe, it, expect } from "vitest";
import { cleanTitle } from "../../../src/collect/browser";

// ── cleanTitle ───────────────────────────────────────────

describe("cleanTitle", () => {
	// ── Empty / falsy input ──────────────────────
	it("returns empty string for empty input", () => {
		expect(cleanTitle("")).toBe("");
	});

	// ── Brand suffix stripping ───────────────────
	it("strips ' | GitHub' suffix", () => {
		expect(cleanTitle("obsidian-community/obsidian-api | GitHub")).toBe(
			"obsidian-community/obsidian-api",
		);
	});

	it("strips ' · GitHub' suffix", () => {
		expect(cleanTitle("Pull Request #42 · org/repo · GitHub")).toBe(
			"Pull Request #42",
		);
	});

	it("strips ' - GitHub' suffix and splits on remaining ' - ' separator", () => {
		// After stripping " - GitHub": "Releases - org/repo"
		// After splitting on " - ": ["Releases", "org/repo"] — both 8 chars, first wins
		const result = cleanTitle("Releases - org/repo - GitHub");
		expect(["Releases", "org/repo"]).toContain(result);
	});

	it("strips ' - Stack Overflow' suffix", () => {
		expect(cleanTitle("How to deep clone an object in JavaScript - Stack Overflow")).toBe(
			"How to deep clone an object in JavaScript",
		);
	});

	it("strips ' | MDN Web Docs' suffix", () => {
		expect(cleanTitle("Array.prototype.map() | MDN Web Docs")).toBe(
			"Array.prototype.map()",
		);
	});

	it("strips ' | TypeScript' suffix and splits on remaining ' - ' separator", () => {
		// Strip " | TypeScript" → "TypeScript: Handbook - Generics"
		// Split on " - " → ["TypeScript: Handbook", "Generics"]
		// Longest wins: "TypeScript: Handbook"
		expect(cleanTitle("TypeScript: Handbook - Generics | TypeScript")).toBe(
			"TypeScript: Handbook",
		);
	});

	it("strips ' | YouTube' suffix", () => {
		expect(cleanTitle("React hooks in 10 minutes | YouTube")).toBe(
			"React hooks in 10 minutes",
		);
	});

	it("strips ' | Wikipedia' suffix", () => {
		expect(cleanTitle("Dijkstra's algorithm | Wikipedia")).toBe(
			"Dijkstra's algorithm",
		);
	});

	it("strips ' - Wikipedia' suffix", () => {
		expect(cleanTitle("Merge sort - Wikipedia")).toBe("Merge sort");
	});

	it("strips ' | Reddit' suffix", () => {
		expect(cleanTitle("Why is TypeScript so verbose? | Reddit")).toBe(
			"Why is TypeScript so verbose?",
		);
	});

	// ── Separator splitting ──────────────────────
	it("splits on ' | ' separator and takes left portion", () => {
		expect(cleanTitle("Obsidian Plugin API reference | Obsidian")).toBe(
			"Obsidian Plugin API reference",
		);
	});

	it("splits on ' — ' (em dash) separator", () => {
		expect(cleanTitle("Generic constraint not assignable to type 'object' — Stack Overflow")).toBe(
			"Generic constraint not assignable to type 'object'",
		);
	});

	it("splits on ' - ' separator with surrounding spaces", () => {
		expect(cleanTitle("typescript - How to use generic constraints - Stack Overflow")).toBe(
			"How to use generic constraints",
		);
	});

	it("splits on ' · ' separator and takes the longest segment", () => {
		expect(cleanTitle("Vitest · Fast unit testing framework")).toBe(
			"Fast unit testing framework",
		);
	});

	// ── Nav-noise rejection ──────────────────────
	it("returns empty string for 'Home' (nav noise)", () => {
		expect(cleanTitle("Home")).toBe("");
	});

	it("returns empty string for 'Dashboard' (nav noise)", () => {
		expect(cleanTitle("Dashboard")).toBe("");
	});

	it("returns empty string for 'Dashboard | HubSpot' (nav noise after stripping)", () => {
		// After separator split: "Dashboard" → nav noise
		expect(cleanTitle("Dashboard | HubSpot")).toBe("");
	});

	it("returns empty string for 'Login' (nav noise)", () => {
		expect(cleanTitle("Login")).toBe("");
	});

	it("returns empty string for 'Settings' (nav noise)", () => {
		expect(cleanTitle("Settings")).toBe("");
	});

	it("returns empty string for 'New Tab' (nav noise)", () => {
		expect(cleanTitle("New Tab")).toBe("");
	});

	it("returns empty string for 'Google' (nav noise)", () => {
		expect(cleanTitle("Google")).toBe("");
	});

	it("returns empty string for 'Search Results' (nav noise)", () => {
		expect(cleanTitle("Search Results")).toBe("");
	});

	// ── Short title rejection ────────────────────
	it("returns empty string for a title shorter than 5 chars after cleaning", () => {
		// "OK" → length 2, rejected
		expect(cleanTitle("OK")).toBe("");
	});

	it("returns empty string for 4-char title after cleaning", () => {
		// "Atom" → 4 chars, rejected
		expect(cleanTitle("Atom")).toBe("");
	});

	it("keeps a title exactly 5 chars long", () => {
		// "Cargo" → 5 chars, kept
		expect(cleanTitle("Cargo")).toBe("Cargo");
	});

	// ── Real-world end-to-end examples ──────────
	it("cleans a real TypeScript handbook URL title", () => {
		// Strip " | TypeScript" → "TypeScript: Documentation - Generics"
		// Split on " - " → ["TypeScript: Documentation", "Generics"]
		// Longest segment wins: "TypeScript: Documentation"
		expect(cleanTitle("TypeScript: Documentation - Generics | TypeScript")).toBe(
			"TypeScript: Documentation",
		);
	});

	it("cleans a real Stack Overflow question title", () => {
		// Strip " - Stack Overflow" → "javascript - How to deep copy an array in JavaScript"
		// Split on " - " → ["javascript", "How to deep copy an array in JavaScript"]
		// Longest segment wins: "How to deep copy an array in JavaScript" (39 chars vs 10)
		expect(
			cleanTitle("javascript - How to deep copy an array in JavaScript - Stack Overflow"),
		).toBe("How to deep copy an array in JavaScript");
	});

	it("preserves a clean article title with no separators or brand suffixes", () => {
		expect(cleanTitle("Understanding the JavaScript Event Loop")).toBe(
			"Understanding the JavaScript Event Loop",
		);
	});

	it("strips brand suffix before splitting separators", () => {
		// Without suffix stripping, split on ' - GitHub' would happen incorrectly
		expect(cleanTitle("Fix TypeError in reduce callback - GitHub")).toBe(
			"Fix TypeError in reduce callback",
		);
	});
});
