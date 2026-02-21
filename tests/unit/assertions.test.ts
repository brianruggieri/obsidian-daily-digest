import { describe, it, expect } from "vitest";
import { runStructuralAssertions, runQualityAssertions } from "../../scripts/lib/assertions";

const VALID_MD = `---
date: 2026-02-21
day: Saturday
tags: [daily, daily-digest]
focus_score: 74%
generated: 2026-02-21 07:00
---

# Saturday, February 21

> AI summary here with enough content to pass length checks.

This is content for the dev section and it has enough characters to be valid and exceed the minimum size requirement for the structural assertion check.
`;

describe("Structural assertions", () => {
	it("passes for valid markdown", () => {
		const result = runStructuralAssertions(VALID_MD);
		expect(result.passed).toBe(true);
		expect(result.failures).toHaveLength(0);
	});

	it("fails when frontmatter is missing required field", () => {
		const bad = VALID_MD.replace("focus_score: 74%\n", "");
		const result = runStructuralAssertions(bad);
		expect(result.passed).toBe(false);
		expect(result.failures.some((f) => f.includes("focus_score"))).toBe(true);
	});

	it("fails when file is too short", () => {
		const result = runStructuralAssertions("---\ndate: 2026-02-21\n---\nhi");
		expect(result.passed).toBe(false);
		expect(result.failures.some((f) => f.includes("too short"))).toBe(true);
	});

	it("fails when placeholder strings are present", () => {
		const bad = VALID_MD + "\n[object Object]\n";
		const result = runStructuralAssertions(bad);
		expect(result.passed).toBe(false);
		expect(result.failures.some((f) => f.includes("[object Object]"))).toBe(true);
	});
});

describe("Quality assertions", () => {
	it("passes for valid markdown with AI output indicated by blockquote", () => {
		const result = runQualityAssertions(VALID_MD, { aiEnabled: true });
		expect(result.passed).toBe(true);
	});

	it("passes when AI is disabled and no headline present", () => {
		const noAI = VALID_MD.replace(/^> .+$/m, "").trim() + "\n";
		const result = runQualityAssertions(noAI, { aiEnabled: false });
		expect(result.passed).toBe(true);
	});

	it("fails when focus_score is out of range", () => {
		const bad = VALID_MD.replace("focus_score: 74%", "focus_score: 150%");
		const result = runQualityAssertions(bad, { aiEnabled: false });
		expect(result.passed).toBe(false);
		expect(result.failures.some((f) => f.includes("focus_score"))).toBe(true);
	});
});
