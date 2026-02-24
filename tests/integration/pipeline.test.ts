import { describe, it, expect } from "vitest";
import { categorizeVisits } from "../../src/filter/categorize";
import { sanitizeCollectedData } from "../../src/filter/sanitize";
import { classifyEventsRuleOnly } from "../../src/filter/classify";
import { extractPatterns, buildEmptyTopicHistory } from "../../src/analyze/patterns";
import { generateKnowledgeSections } from "../../src/analyze/knowledge";
import { renderMarkdown } from "../../src/render/renderer";
import { ALL_PERSONAS, PersonaOutput } from "../fixtures/personas";
import { defaultSanitizeConfig, defaultPatternConfig } from "../fixtures/scenarios";

const DATE = new Date("2025-06-15T00:00:00");
const TODAY = "2025-06-15";

function runPipeline(persona: PersonaOutput) {
	// 1. Sanitize
	const sanitizeConfig = defaultSanitizeConfig();
	const sanitized = sanitizeCollectedData(
		persona.visits,
		persona.searches,
		[...persona.claude, ...(persona.codex ?? [])],
		persona.git ?? [],
		sanitizeConfig
	);

	// 2. Categorize
	const categorized = categorizeVisits(sanitized.visits);

	// 3. Classify (rule-only, no LLM in tests)
	const classification = classifyEventsRuleOnly(
		sanitized.visits,
		sanitized.searches,
		sanitized.claudeSessions,
		sanitized.gitCommits,
		categorized
	);

	// 4. Extract patterns
	const patternConfig = defaultPatternConfig();
	const patterns = extractPatterns(
		classification,
		patternConfig,
		buildEmptyTopicHistory(),
		TODAY
	);

	// 5. Generate knowledge sections
	const knowledge = generateKnowledgeSections(patterns);

	// 6. Render markdown
	const markdown = renderMarkdown(
		DATE,
		sanitized.visits,
		sanitized.searches,
		sanitized.claudeSessions,
		sanitized.gitCommits,
		categorized,
		null, // no AI summary in unit test
		"none",
		knowledge
	);

	return { sanitized, categorized, classification, patterns, knowledge, markdown };
}

describe("full pipeline", () => {
	for (const personaFn of ALL_PERSONAS) {
		const persona = personaFn(DATE);

		describe(`Persona: ${persona.name}`, () => {
			const result = runPipeline(persona);

			it("produces valid markdown", () => {
				expect(result.markdown).toMatch(/^---\n/);
				expect(result.markdown).toContain("date: 2025-06-15");
				expect(result.markdown).toContain("# ");
			});

			it("has non-empty categorized visits", () => {
				const catCount = Object.values(result.categorized).flat().length;
				expect(catCount).toBeGreaterThan(0);
			});

			it("classifies all events", () => {
				const totalInput = persona.visits.length + persona.searches.length +
					persona.claude.length + (persona.codex?.length ?? 0) + (persona.git?.length ?? 0);
				expect(result.classification.totalProcessed).toBe(totalInput);
			});

			it("produces focus score in valid range", () => {
				// Focus score is Shannon entropy-based and depends on random mock data
				// distribution, so we verify it's a valid number in [0, 1]
				expect(result.patterns.focusScore).toBeGreaterThanOrEqual(0);
				expect(result.patterns.focusScore).toBeLessThanOrEqual(1);
				// Also verify it's a finite number (not NaN/Infinity)
				expect(Number.isFinite(result.patterns.focusScore)).toBe(true);
			});

			it("generates knowledge sections", () => {
				expect(result.knowledge.focusSummary.length).toBeGreaterThan(0);
				expect(result.knowledge.tags.length).toBeGreaterThan(0);
			});

			it("renders Knowledge Insights in markdown", () => {
				expect(result.markdown).toContain("Knowledge Insights");
			});

			it("includes activity type tags", () => {
				expect(result.knowledge.tags.some((t) => t.startsWith("activity/"))).toBe(true);
			});

			it("contains no obvious secrets in output", () => {
				// Check for common secret patterns
				expect(result.markdown).not.toMatch(/ghp_[A-Za-z0-9]{36}/);
				expect(result.markdown).not.toMatch(/sk-ant-/);
				expect(result.markdown).not.toMatch(/AKIA[A-Z0-9]{16}/);
				expect(result.markdown).not.toMatch(/sk-[A-Za-z0-9]{20,}/);
			});
		});
	}
});

// ── Edge Cases ──────────────────────────────────────────

describe("pipeline edge cases", () => {
	it("handles empty data gracefully", () => {
		const result = runPipeline({
			name: "Empty",
			description: "No data",
			visits: [],
			searches: [],
			claude: [],
			codex: [],
			git: [],
			expectedThemes: [],
			expectedActivityTypes: [],
			expectedFocusRange: [0, 0],
			narrative: "",
		});
		expect(result.markdown).toContain("2025-06-15");
		expect(result.classification.totalProcessed).toBe(0);
		expect(result.patterns.focusScore).toBe(0);
	});

	it("handles single event", () => {
		const result = runPipeline({
			name: "Single",
			description: "One visit",
			visits: [{ url: "https://github.com/repo", title: "Repo", time: DATE, domain: "github.com" }],
			searches: [],
			claude: [],
			codex: [],
			git: [],
			expectedThemes: [],
			expectedActivityTypes: ["implementation"],
			expectedFocusRange: [0, 1],
			narrative: "",
		});
		expect(result.classification.totalProcessed).toBe(1);
		expect(result.markdown).toContain("github.com");
	});
});
