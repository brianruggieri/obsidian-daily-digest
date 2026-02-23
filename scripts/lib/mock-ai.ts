import type { AISummary } from "../../src/types";

const NO_AI_PRESETS = new Set(["no-ai-minimal", "no-ai-full"]);

/**
 * Return a deterministic mock AISummary for the given preset, or null when
 * the preset does not use AI (no-ai-minimal, no-ai-full).
 *
 * The preset id is embedded in the headline so each preset's output is
 * visually distinguishable in the matrix run report.
 */
export function getMockSummary(presetId: string): AISummary | null {
	if (NO_AI_PRESETS.has(presetId)) return null;

	return {
		headline: `[MOCK ${presetId}] Deep focus engineering day with active development sessions`,
		tldr: `This is a mock summary generated for preset "${presetId}". In a real run, this would contain an AI-generated summary of the day's activity based on collected browser, shell, git, and Claude session data.`,
		themes: ["software-development", "mock-output", presetId],
		category_summaries: {
			dev: `Mock category summary for preset ${presetId}: development activity detected.`,
		},
		notable: [
			`Mock insight 1 for ${presetId}: this note was generated without real AI.`,
			`Mock insight 2 for ${presetId}: prompt log below shows what would be sent.`,
		],
		questions: [
			`What would real AI output look like for preset ${presetId}?`,
			"Run with AI_MODE=real to find out.",
		],
		work_patterns: [
			"2-hour deep work block on TypeScript refactoring",
			"Frequent context switches between documentation and coding",
		],
		cross_source_connections: [
			"Searched for OAuth flows, then committed authentication middleware 30 minutes later",
		],
	};
}
