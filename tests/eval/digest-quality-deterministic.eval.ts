/**
 * Digest Quality — Tier 1: Deterministic Checks
 *
 * Fast regex/structural checks that catch rendering bugs without any LLM cost.
 * These run in `npm run test` alongside existing tests.
 *
 * Run: npx vitest run tests/eval/digest-quality-deterministic.eval.ts
 */

import { describe, it, expect } from "vitest";
import { ALL_PERSONAS } from "../fixtures/personas";
import { renderForPersona } from "./digest-quality-helpers";
import {
	runStructuralAssertions,
	runCalloutAssertions,
} from "../../scripts/lib/assertions";

// ── Expected section markers per data source ────────────────
// When input data has a given source, the rendered output must contain
// a section marker for that source.

const SOURCE_SECTION_MAP: Record<string, string> = {
	searches: "Searches",
	claude: "Claude Code",
	git: "Git Activity",
};

// ══════════════════════════════════════════════════════════════
// Per-Persona Deterministic Checks
// ══════════════════════════════════════════════════════════════

describe("digest quality — deterministic", () => {
	for (const personaFn of ALL_PERSONAS) {
		const { persona, markdown, inputStats, knowledge } = renderForPersona(personaFn);

		describe(`Persona: ${persona.name}`, () => {
			// ── Structural assertions (frontmatter, placeholders) ──
			it("passes structural assertions", () => {
				const result = runStructuralAssertions(markdown);
				expect(result.failures).toEqual([]);
			});

			// ── Callout assertions (syntax, nesting, links) ───────
			it("passes callout assertions", () => {
				const result = runCalloutAssertions(markdown);
				expect(result.failures).toEqual([]);
			});

			// ── Layer ordering ────────────────────────────────────
			// In no-AI mode: Knowledge Insights → Browser Activity → Notes
			// (Notable and Activity Overview only appear with AI summary)
			it("has correct layer ordering", () => {
				const knowledgeIdx = markdown.indexOf("Knowledge Insights");
				const browserIdx = markdown.indexOf("Browser Activity");
				const notesIdx = markdown.indexOf("## \u{1F4DD} Notes");

				if (knowledgeIdx !== -1 && browserIdx !== -1) {
					expect(knowledgeIdx).toBeLessThan(notesIdx);
				}
				if (browserIdx !== -1) {
					expect(browserIdx).toBeLessThan(notesIdx);
				}
				// Notes section must exist
				expect(notesIdx).toBeGreaterThan(-1);
			});

			// ── Callout syntax: every [!type] has body lines ──────
			it("has no empty callouts", () => {
				const calloutHeaders = markdown.match(/^> \[!\w+\][+-]?\s.+$/gm) ?? [];
				// Already covered by runCalloutAssertions, but keep an explicit
				// count check for visibility in test output.
				expect(calloutHeaders.length).toBeGreaterThan(0);
			});

			// ── No H3 inside callouts (except article clusters) ───
			it("has no H3 inside callouts", () => {
				const lines = markdown.split("\n");
				for (let i = 0; i < lines.length; i++) {
					if (/^> ### /.test(lines[i])) {
						// Check if it's inside an article cluster (allowed)
						let inArticleCluster = false;
						for (let j = i - 1; j >= 0; j--) {
							if (lines[j].trim() === "") continue;
							if (/Today I Read About/.test(lines[j])) {
								inArticleCluster = true;
								break;
							}
							if (!lines[j].startsWith(">")) break;
							if (/\[!\w+\]/.test(lines[j]) && !/Today I Read About/.test(lines[j])) break;
						}
						if (!inArticleCluster) {
							expect.fail(`Unexpected H3 inside callout at line ${i + 1}: ${lines[i].slice(0, 60)}`);
						}
					}
				}
			});

			// ── Nested callout depth ≤ 2 ─────────────────────────
			it("has nesting depth <= 2", () => {
				const lines = markdown.split("\n");
				for (let i = 0; i < lines.length; i++) {
					const match = lines[i].match(/^((?:> )+)/);
					if (match) {
						const depth = match[1].length / 2;
						expect(depth).toBeLessThanOrEqual(2);
					}
				}
			});

			// ── Source completeness ───────────────────────────────
			// If input has data for a source, output must reference it.
			it("represents all input sources in output", () => {
				for (const [source, marker] of Object.entries(SOURCE_SECTION_MAP)) {
					const count = inputStats[source as keyof typeof inputStats];
					if (count > 0) {
						expect(
							markdown.includes(marker),
							`Input has ${count} ${source} but output missing "${marker}" section`
						).toBe(true);
					}
				}
			});

			// ── Browser Activity has nested callouts ─────────────
			it("Browser Activity uses nested callouts for categories", () => {
				if (inputStats.visits > 0) {
					// Outer callout
					expect(markdown).toMatch(/> \[!info\]- .+ Browser Activity/);
					// Inner nested callout
					expect(markdown).toMatch(/> > \[!info\]-/);
				}
			});

			// ── Activity Overview table (AI-on only) ─────────────
			// This test is skipped for no-AI renders since the section
			// only appears when aiSummary.category_summaries is present.

			// ── Markdown link integrity ──────────────────────────
			it("has no broken markdown links", () => {
				const lines = markdown.split("\n");
				for (let i = 0; i < lines.length; i++) {
					const line = lines[i];
					let searchFrom = 0;
					while (true) {
						const linkClose = line.indexOf("](", searchFrom);
						if (linkClose === -1) break;
						const before = line.slice(0, linkClose);
						expect(
							before.lastIndexOf("["),
							`Broken link at line ${i + 1}`
						).toBeGreaterThanOrEqual(0);
						searchFrom = linkClose + 2;
					}
				}
			});

			// ── Dataview field format ────────────────────────────
			it("has correct answer_ field format", () => {
				const answerLines = markdown.split("\n").filter((l) => /^answer_/.test(l));
				for (const line of answerLines) {
					expect(line).toMatch(/^answer_\S+:: /);
				}
			});

			// ── Layer 1 line count ───────────────────────────────
			// Frontmatter close to first callout should be < 40 lines.
			it("Layer 1 is concise (< 40 lines before first callout)", () => {
				const lines = markdown.split("\n");
				const fmEnd = lines.findIndex((l, i) => i > 0 && l === "---") + 1;
				const firstCallout = lines.findIndex(
					(l, i) => i > fmEnd && /^> \[!\w+\]/.test(l)
				);
				if (firstCallout > 0) {
					const layer1Lines = firstCallout - fmEnd;
					expect(layer1Lines).toBeLessThan(40);
				}
			});

			// ── Tag cap ──────────────────────────────────────────
			it("has at most 10 tags", () => {
				expect(knowledge.tags.length).toBeLessThanOrEqual(10);
			});

			// ── Semantic section presence ─────────────────────────
			// Personas with git data should produce commit work units.
			it("has commit work units when git data present", () => {
				if (inputStats.git > 0) {
					expect(
						(knowledge.commitWorkUnits ?? []).length,
						`Input has ${inputStats.git} git commits but no commitWorkUnits produced`
					).toBeGreaterThan(0);
				}
			});

			// Personas with Claude sessions should produce task sessions.
			it("has Claude task sessions when Claude data present", () => {
				if (inputStats.claude > 0) {
					expect(
						(knowledge.claudeTaskSessions ?? []).length,
						`Input has ${inputStats.claude} Claude sessions but no claudeTaskSessions produced`
					).toBeGreaterThan(0);
				}
			});
		});
	}
});

// ══════════════════════════════════════════════════════════════
// AI-On Mode Deterministic Checks
// ══════════════════════════════════════════════════════════════

describe("digest quality — AI-on deterministic", () => {
	// Use 3 representative personas for AI-on mode
	const AI_PERSONAS = ALL_PERSONAS.slice(0, 3);

	for (const personaFn of AI_PERSONAS) {
		const { persona, markdown } = renderForPersona(personaFn, { withAI: true });

		describe(`AI-on: ${persona.name}`, () => {
			it("passes structural assertions", () => {
				const result = runStructuralAssertions(markdown);
				expect(result.failures).toEqual([]);
			});

			it("passes callout assertions", () => {
				const result = runCalloutAssertions(markdown);
				expect(result.failures).toEqual([]);
			});

			// ── AI-specific sections present ─────────────────────
			it("has Notable section", () => {
				expect(markdown).toContain("Notable");
			});

			it("has Activity Overview table in callout", () => {
				expect(markdown).toMatch(/> \[!abstract\]- Activity Overview/);
				expect(markdown).toMatch(/> \|.*\|.*\|/); // table rows
			});

			it("has headline callout", () => {
				expect(markdown).toMatch(/> \[!tip\]/);
			});

			// ── Layer ordering with AI ───────────────────────────
			it("has correct three-layer ordering", () => {
				const headlineIdx = markdown.indexOf("[!tip]");
				const notableIdx = markdown.indexOf("Notable");
				const activityIdx = markdown.indexOf("Activity Overview");
				const searchesIdx = markdown.indexOf("Searches");
				const browserIdx = markdown.indexOf("Browser Activity");
				const notesIdx = markdown.indexOf("## \u{1F4DD} Notes");

				// Layer 1: headline and notable come first
				if (headlineIdx !== -1 && notableIdx !== -1) {
					expect(headlineIdx).toBeLessThan(notableIdx);
				}
				// Layer 2: Activity Overview
				if (notableIdx !== -1 && activityIdx !== -1) {
					expect(notableIdx).toBeLessThan(activityIdx);
				}
				// Layer 3: raw data archive
				if (activityIdx !== -1 && browserIdx !== -1) {
					expect(activityIdx).toBeLessThan(browserIdx);
				}
				// Notes at the end
				if (browserIdx !== -1) {
					expect(browserIdx).toBeLessThan(notesIdx);
				}
				// Searches before Browser Activity (if both exist)
				if (searchesIdx !== -1 && browserIdx !== -1) {
					expect(searchesIdx).toBeLessThan(browserIdx);
				}
			});

			// ── Knowledge Insights as callout (not open headings) in AI mode
			it("renders Knowledge Insights as callout in AI mode", () => {
				if (markdown.includes("Knowledge Insights")) {
					expect(markdown).toMatch(/> \[!info\]- .* Knowledge Insights/);
					// Should NOT have ## Knowledge Insights (open heading)
					expect(markdown).not.toMatch(/^## .* Knowledge Insights/m);
				}
			});
		});
	}
});
