import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../../src/renderer";
import { AISummary, BrowserVisit, SearchQuery, ShellCommand, ClaudeSession, CategorizedVisits } from "../../src/types";
import { KnowledgeSections } from "../../src/knowledge";

const DATE = new Date("2025-06-15T00:00:00");

const sampleVisits: BrowserVisit[] = [
	{ url: "https://github.com/repo", title: "My Repo", time: new Date("2025-06-15T10:00:00"), domain: "github.com" },
];

const sampleSearches: SearchQuery[] = [
	{ query: "react hooks tutorial", time: new Date("2025-06-15T10:30:00"), engine: "google.com" },
];

const sampleShell: ShellCommand[] = [
	{ cmd: "git status", time: new Date("2025-06-15T11:00:00") },
];

const sampleClaude: ClaudeSession[] = [
	{ prompt: "Fix the auth bug", time: new Date("2025-06-15T11:30:00"), project: "webapp" },
];

const sampleCategorized: CategorizedVisits = {
	dev: [{ url: "https://github.com/repo", title: "My Repo", time: new Date(), domain: "github.com" }],
};

const sampleAISummary: AISummary = {
	headline: "Productive day focused on React auth",
	tldr: "Spent the day debugging and implementing OAuth flows.",
	themes: ["OAuth", "React", "debugging"],
	category_summaries: { dev: "Worked on GitHub repos and Stack Overflow" },
	notable: ["Started OAuth PKCE implementation", "Fixed critical auth bug"],
	questions: ["What's the best token storage strategy?"],
};

describe("renderMarkdown", () => {
	it("produces valid frontmatter", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toMatch(/^---\n/);
		expect(md).toContain("date: 2025-06-15");
		expect(md).toContain("day: Sunday");
		expect(md).toContain("tags:");
		expect(md).toContain("daily");
		expect(md).toContain("daily-digest");
		expect(md).toContain("categories:");
	});

	it("includes theme tags in frontmatter", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("oauth");
		expect(md).toContain("react");
	});

	it("includes title with date", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("# ");
		expect(md).toContain("June 15, 2025");
	});

	it("includes AI headline and tldr", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("**Productive day focused on React auth**");
		expect(md).toContain("Spent the day debugging");
	});

	it("includes themes as chips", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("`OAuth`");
		expect(md).toContain("`React`");
	});

	it("includes stats line", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("1 visits");
		expect(md).toContain("1 searches");
		expect(md).toContain("1 commands");
		expect(md).toContain("1 AI prompts");
	});

	it("includes notable section", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("Notable");
		expect(md).toContain("Started OAuth PKCE implementation");
	});

	it("includes searches section", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("Searches");
		expect(md).toContain("react hooks tutorial");
	});

	it("includes Claude Code section", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("Claude Code / AI Work");
		expect(md).toContain("Fix the auth bug");
	});

	it("includes browser activity section", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("Browser Activity");
		expect(md).toContain("github.com");
	});

	it("includes shell section in code block", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("```bash");
		expect(md).toContain("git status");
		expect(md).toContain("```");
	});

	it("includes reflection section", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("Reflection");
		expect(md).toContain("token storage strategy");
	});

	it("includes notes section", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("Notes");
		expect(md).toContain("Add your reflections here");
	});

	it("includes footer with provider info", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary, "anthropic");
		expect(md).toContain("Anthropic API");
	});

	it("includes local provider footer", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary, "local");
		expect(md).toContain("locally");
		expect(md).toContain("No data was sent externally");
	});

	it("includes none provider footer", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary, "none");
		expect(md).toContain("No data was sent externally");
	});
});

// ── Optional Sections ───────────────────────────────────

describe("optional sections", () => {
	it("omits notable section when empty", () => {
		const summary = { ...sampleAISummary, notable: [] };
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, summary);
		expect(md).not.toContain("Notable");
	});

	it("omits searches section when empty", () => {
		const md = renderMarkdown(DATE, sampleVisits, [], sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).not.toContain("Searches");
	});

	it("omits claude section when empty", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, [], [], sampleCategorized, sampleAISummary);
		expect(md).not.toContain("Claude / AI Work");
	});

	it("omits shell section when empty", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, [], sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).not.toContain("Shell");
	});

	it("omits reflection when no questions", () => {
		const summary = { ...sampleAISummary, questions: [] };
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, summary);
		expect(md).not.toContain("Reflection");
	});

	it("works with null AI summary", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, null);
		expect(md).toContain("2025-06-15");
		expect(md).not.toContain("Notable");
		expect(md).not.toContain("Reflection");
	});
});

// ── Phase 4: Cognitive Patterns ─────────────────────────

describe("cognitive patterns section", () => {
	it("renders meta_insights", () => {
		const summary: AISummary = {
			...sampleAISummary,
			meta_insights: ["Research-to-implementation ratio was 2:1"],
			quirky_signals: [],
		};
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, summary);
		expect(md).toContain("Cognitive Patterns");
		expect(md).toContain("Research-to-implementation ratio was 2:1");
	});

	it("renders quirky_signals", () => {
		const summary: AISummary = {
			...sampleAISummary,
			quirky_signals: ["Visited Rust docs but never ran cargo"],
		};
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, summary);
		expect(md).toContain("Unusual Signals");
		expect(md).toContain("Visited Rust docs but never ran cargo");
	});

	it("renders focus_narrative", () => {
		const summary: AISummary = {
			...sampleAISummary,
			focus_narrative: "This was a deep-dive research day with sustained attention.",
		};
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, summary);
		expect(md).toContain("deep-dive research day");
	});

	it("omits cognitive patterns when no Phase 4 data", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).not.toContain("Cognitive Patterns");
	});
});

// ── Phase 3: Knowledge Insights ─────────────────────────

describe("knowledge insights section", () => {
	const knowledge: KnowledgeSections = {
		focusSummary: "Moderately focused day (focus score: 60%).",
		temporalInsights: ["research 10am-12pm — steady (5 events)"],
		topicMap: ["███ OAuth ↔ PKCE (3 co-occurrences)"],
		entityGraph: ["GitHub ↔ React (3x in implementation, debugging)"],
		recurrenceNotes: ["**New today:** Rust, WASM"],
		knowledgeDeltaLines: ["New topics explored: Rust, WASM"],
		tags: ["activity/research", "topic/oauth", "entity/github"],
	};

	it("renders knowledge insights section", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary, "none", knowledge);
		expect(md).toContain("Knowledge Insights");
		expect(md).toContain("Moderately focused day");
	});

	it("renders activity clusters", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary, "none", knowledge);
		expect(md).toContain("Activity Clusters");
		expect(md).toContain("research 10am-12pm");
	});

	it("renders topic map", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary, "none", knowledge);
		expect(md).toContain("Topic Map");
		expect(md).toContain("OAuth");
	});

	it("renders entity relations", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary, "none", knowledge);
		expect(md).toContain("Entity Relations");
		expect(md).toContain("GitHub");
	});

	it("includes knowledge tags in frontmatter", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary, "none", knowledge);
		expect(md).toContain("activity/research");
		expect(md).toContain("focus_score:");
	});

	it("omits knowledge section when not provided", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleShell, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).not.toContain("Knowledge Insights");
	});
});
