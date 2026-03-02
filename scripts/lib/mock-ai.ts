import type { AISummary } from "../../src/types";

const NO_AI_PRESETS = new Set(["no-ai-minimal", "no-ai-full"]);

// ── Persona-Specific Mock Summaries ─────────────────────
// Used by scripts/generate-examples.ts to produce realistic screenshot examples.

const PERSONA_SUMMARIES: Record<string, AISummary> = {
	softwareEngineerDeepWork: {
		headline: "Deep-focus engineering day: plugin development, Claude-assisted debugging, and cross-repo PR workflow",
		tldr: "A heads-down development day split between two projects — the daily digest plugin and a prompt review tool. Most problem-solving happened in Claude Code sessions rather than browser searches, with 21 commits landing across three repos.",
		themes: ["software-development", "debugging", "code-review", "testing"],
		topics: ["TypeScript", "Obsidian plugin", "esbuild", "vitest", "sanitization"],
		entities: ["Claude Code", "GitHub", "Vitest", "esbuild", "ESLint"],
		note_seeds: ["Race condition debugging patterns", "Privacy tier architecture"],
		work_story: "The morning started with a race condition in the sanitization pipeline — two concurrent regex passes were clobbering each other's match indices. Three Claude sessions and a Stack Overflow deep-dive later, the fix was a simple mutex guard around the shared buffer. After lunch, focus shifted to the prompt review tool: wiring up a new reviewer weight system, writing integration tests, and cleaning up a PR that had been open for a week. The day ended with a satisfying green CI run across all three repos.",
		mindset: "Building and debugging — a focused maker day with minimal meetings.",
		learnings: [
			"Shared mutable state in regex pipelines needs synchronization even in single-threaded JS (generator interleaving)",
			"Vitest's mockResolvedValueOnce chains are cleaner than manual jest.fn() setup for sequential async mocks",
		],
		remember: [
			"The --experimental-loader flag is needed for .txt imports in tsx scripts",
			"esbuild external: ['obsidian'] must match the exact import string, not the resolved path",
		],
		category_summaries: {
			dev: "Heavy GitHub and Stack Overflow usage for PR reviews and debugging reference. MDN consulted for regex edge cases.",
			communication: "Light Slack and Gmail — a few PR review requests and a standup thread.",
			ai_tools: "Occasional claude.ai for longer-form questions alongside the CLI sessions.",
		},
		notable: [
			"Fixed a subtle race condition in the sanitization pipeline — concurrent regex passes were clobbering shared match indices",
			"Landed a cross-repo PR workflow: 3 repos, 21 commits, all CI green by end of day",
			"Claude Code sessions outnumbered browser searches 12:1 — most problem-solving happened in the terminal",
		],
		questions: [
			"The race condition fix used a mutex — would restructuring as a pipeline of pure transforms be more robust long-term?",
			"With 75 Claude sessions today, which conversations led to actual code changes vs. exploratory dead ends?",
		],
		reflections: [
			{ theme: "deep-work", text: "Today's uninterrupted morning block produced more than the previous two fragmented days combined. What conditions made that possible, and can they be replicated?" },
			{ theme: "tool-leverage", text: "Claude handled the debugging grunt work (trace analysis, test scaffolding) while you focused on architectural decisions. Is there a pattern here worth formalizing?" },
		],
		prompts: [
			{ id: "deep-work", question: "Today's uninterrupted morning block produced more than the previous two fragmented days combined. What conditions made that possible, and can they be replicated?" },
			{ id: "tool-leverage", question: "Claude handled the debugging grunt work (trace analysis, test scaffolding) while you focused on architectural decisions. Is there a pattern here worth formalizing?" },
		],
		meta_insights: [
			"Debugging sessions cluster in the morning (6 of 8 debug-tagged Claude prompts before noon), suggesting fresh-eyes effect",
			"Context switches between repos correlate with commit bursts — the 'wrap up and ship' pattern before moving on",
		],
		quirky_signals: [
			"You searched 'regex lookahead catastrophic backtracking' three times today — once in the browser, once in Claude, once in a commit message. The repetition suggests this concept is still crystallizing.",
			"Commit messages get progressively shorter after 4pm — 'fix sanitize race' vs. morning's 'fix: guard shared buffer in concurrent regex passes to prevent match index corruption'",
		],
		focus_narrative: "A focused maker day with two distinct work blocks: morning debugging (3 hours, single-threaded focus on the race condition) and afternoon feature work (PR cleanup across repos). The transition at lunch was clean — no dangling threads carried over. Focus score reflects the dual-project split rather than fragmentation.",
		work_patterns: [
			"3-hour deep debugging block in the morning on a single race condition",
			"Afternoon shift to cross-repo PR cleanup and feature work",
			"Claude Code sessions used as primary problem-solving tool over browser searches",
			"Commit frequency peaks at end of each work block (ship-before-switch pattern)",
		],
		cross_source_connections: [
			"Searched 'regex lookahead catastrophic backtracking' on Stack Overflow, then asked Claude to analyze the specific regex, then committed the fix 45 minutes later",
			"Reviewed a PR on GitHub, discussed the approach in a Claude session, then committed follow-up changes in the same repo",
			"Slack thread about CI failures led to 4 consecutive debug commits in the prompt-review repo",
		],
	},

	productManagerMeetings: {
		headline: "Meeting marathon: sprint planning, design reviews, analytics deep-dive, and async catch-up",
		tldr: "A meeting-heavy day with constant context switching between Figma wireframes, analytics dashboards, Slack threads, and PRDs. Six Claude sessions for competitive analysis and user story drafting. No code committed — pure product work.",
		themes: ["product-strategy", "design-review", "user-metrics", "roadmap"],
		topics: ["sprint planning", "funnel analysis", "search redesign", "competitor research", "user stories"],
		entities: ["Figma", "Amplitude", "Notion", "Slack", "Jira", "Google Analytics"],
		note_seeds: ["Search redesign UX patterns", "Competitor feature matrix"],
		work_story: "The day opened with back-to-back standups and a sprint planning session that ran 30 minutes over. Mid-morning was a Figma design review for the search redesign — three rounds of feedback on the filter panel layout. After a quick lunch (Amazon order squeezed in), the afternoon was an analytics deep-dive: Amplitude funnels, Google Analytics segments, and a competitor teardown using Claude to structure the analysis. The day closed with async catch-up — 40 Slack messages, two PRD updates in Notion, and user stories backlogged in Jira.",
		mindset: "Synthesizing and coordinating — connecting dots across teams, users, and data.",
		learnings: [
			"Amplitude's cohort comparison feature surfaces retention patterns that raw funnel charts miss",
			"Competitor X launched a semantic search feature — worth prototyping for our search redesign",
		],
		remember: [
			"Sprint 14 commitment: search redesign MVP by March 15",
			"Design review feedback: filter panel should collapse on mobile, not hide behind a hamburger menu",
			"Amplitude segment 'power-searchers' = users with >10 searches/week",
		],
		category_summaries: {
			product: "Figma design reviews, Notion PRDs, Jira backlog grooming, and Miro whiteboarding for the search redesign.",
			communication: "Heavy Slack day — 40+ messages across 3 workspace channels. Gmail for meeting follow-ups.",
			reference: "Amplitude and Google Analytics for funnel analysis and user segmentation.",
			shopping: "Quick Amazon order during lunch break.",
			social: "Brief LinkedIn check and a Twitter thread about competitor launches.",
			news: "Hacker News scan during a meeting break — one article on search UX patterns saved for later.",
		},
		notable: [
			"Competitor research surfaced a semantic search feature launch — flagged for the search redesign roadmap",
			"Funnel analysis revealed a 23% drop-off at the filter step — design review feedback aligned with this data",
			"Cross-team dependency flagged: search API team needs 2-week lead time for the new filter endpoint",
		],
		questions: [
			"The filter panel drop-off is 23% — is this a UX problem or are users finding what they need before filtering?",
			"Six meetings today consumed 4 hours. Which ones could have been async, and what would you do with that recovered time?",
		],
		reflections: [
			{ theme: "meeting-load", text: "Four hours in meetings left only fragmented windows for deep product thinking. The analytics deep-dive happened in a 45-minute gap between calls — is that enough time to draw reliable conclusions from data?" },
			{ theme: "async-first", text: "The design review generated 12 Slack follow-up threads. Would a structured async review (Figma comments + Loom walkthrough) have produced better feedback with less calendar cost?" },
		],
		prompts: [
			{ id: "meeting-load", question: "Four hours in meetings left only fragmented windows for deep product thinking. The analytics deep-dive happened in a 45-minute gap between calls — is that enough time to draw reliable conclusions from data?" },
			{ id: "async-first", question: "The design review generated 12 Slack follow-up threads. Would a structured async review (Figma comments + Loom walkthrough) have produced better feedback with less calendar cost?" },
		],
		meta_insights: [
			"Context switches averaged every 18 minutes — the highest of any tracked day. Meeting-adjacent browsing (opening links shared in calls) drove most of the visit count.",
			"Analytics and competitor research happened in compressed bursts between meetings, suggesting these tasks get deprioritized when calendar is full.",
		],
		quirky_signals: [
			"You checked Amplitude 7 times but only spent >5 minutes twice — the other visits were quick stat-checks mid-conversation, like looking up a number to quote in a meeting.",
			"The Amazon order (11:52am) was sandwiched between a design review and a sprint retro — the classic 'micro-break as context switch buffer' pattern.",
		],
		focus_narrative: "A highly fragmented day driven by meeting cadence rather than personal prioritization. The few focused windows (analytics deep-dive, competitor teardown) produced the day's most valuable outputs, but together they total less than 90 minutes of deep work. The rest was reactive: responding to Slack, jumping between tabs during calls, and context-switching between product surfaces.",
		work_patterns: [
			"Back-to-back meetings 9am-1pm with no breaks longer than 10 minutes",
			"Compressed deep work in 45-minute gaps between meetings",
			"Meeting-adjacent browsing: opening shared links during calls",
			"Async catch-up batch at end of day (4-5pm): Slack, Notion, Jira",
		],
		cross_source_connections: [
			"Competitor research in Claude led to a Figma annotation on the search filter panel 20 minutes later",
			"Amplitude funnel data cited in sprint planning was pulled during a between-meetings gap the same morning",
			"Slack thread about API team capacity directly influenced the Jira story prioritization in the afternoon",
		],
	},
};

/**
 * Return a persona-specific mock AISummary for screenshot example generation.
 * Returns null if the persona has no mock summary (e.g., no-AI personas).
 */
export function getPersonaMockSummary(personaName: string): AISummary | null {
	return PERSONA_SUMMARIES[personaName] ?? null;
}

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
