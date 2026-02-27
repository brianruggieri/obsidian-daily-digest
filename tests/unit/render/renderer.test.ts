import { describe, it, expect } from "vitest";
import { renderMarkdown } from "../../../src/render/renderer";
import { AISummary, BrowserVisit, SearchQuery, ClaudeSession, CategorizedVisits, GitCommit } from "../../../src/types";
import { KnowledgeSections } from "../../../src/analyze/knowledge";
import { createPromptLog, appendPromptEntry } from "../../../scripts/lib/prompt-logger";

const DATE = new Date("2025-06-15T00:00:00");

const sampleVisits: BrowserVisit[] = [
	{ url: "https://github.com/repo", title: "My Repo", time: new Date("2025-06-15T10:00:00"), domain: "github.com" },
];

const sampleSearches: SearchQuery[] = [
	{ query: "react hooks tutorial", time: new Date("2025-06-15T10:30:00"), engine: "google.com" },
];

const sampleClaude: ClaudeSession[] = [
	{ prompt: "Fix the auth bug", time: new Date("2025-06-15T11:30:00"), project: "webapp", isConversationOpener: true, conversationFile: "session.jsonl", conversationTurnCount: 1 },
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
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toMatch(/^---\n/);
		expect(md).toContain("date: 2025-06-15");
		expect(md).toContain("day: Sunday");
		expect(md).toContain("tags:");
		expect(md).toContain("daily");
		expect(md).toContain("daily-digest");
		expect(md).toContain("categories:");
	});

	it("includes theme tags in frontmatter", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("oauth");
		expect(md).toContain("react");
	});

	it("includes title with date", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("# ");
		expect(md).toContain("June 15, 2025");
	});

	it("includes AI headline and tldr", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("> [!tip] Productive day focused on React auth");
		// sampleAISummary has no work_story, so tldr renders as a plain paragraph fallback
		expect(md).toContain("Spent the day debugging");
	});

	it("includes themes as chips", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("`OAuth`");
		expect(md).toContain("`React`");
	});

	it("includes stats line", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("1 visits");
		expect(md).toContain("1 searches");
		expect(md).toContain("1 AI prompts");
	});

	it("includes notable section", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("Notable");
		expect(md).toContain("Started OAuth PKCE implementation");
	});

	it("includes searches section", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("Searches");
		expect(md).toContain("react hooks tutorial");
	});

	it("includes Claude Code section", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("Claude Code / AI Work");
		expect(md).toContain("Fix the auth bug");
	});

	it("includes browser activity section", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("Browser Activity");
		expect(md).toContain("github.com");
	});

	it("includes reflection section", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("Reflection");
		expect(md).toContain("token storage strategy");
	});

	it("includes notes section", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("Notes");
		expect(md).toContain("Add your reflections here");
	});

	it("includes footer with provider info", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary, "anthropic");
		expect(md).toContain("Anthropic API");
	});

	it("includes local provider footer", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary, "local");
		expect(md).toContain("locally");
		expect(md).toContain("No data was sent externally");
	});

	it("includes none provider footer", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary, "none");
		expect(md).toContain("No data was sent externally");
	});
});

// ── Optional Sections ───────────────────────────────────

describe("optional sections", () => {
	it("omits notable section when empty", () => {
		const summary = { ...sampleAISummary, notable: [] };
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, summary);
		expect(md).not.toContain("Notable");
	});

	it("omits searches section when empty", () => {
		const md = renderMarkdown(DATE, sampleVisits, [], sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).not.toContain("Searches");
	});

	it("omits claude section when empty", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, [], [], sampleCategorized, sampleAISummary);
		expect(md).not.toContain("Claude / AI Work");
	});

	it("omits reflection when no questions", () => {
		const summary = { ...sampleAISummary, questions: [] };
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, summary);
		expect(md).not.toContain("Reflection");
	});

	it("works with null AI summary", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, null);
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
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, summary);
		expect(md).toContain("Cognitive Patterns");
		expect(md).toContain("Research-to-implementation ratio was 2:1");
	});

	it("renders quirky_signals", () => {
		const summary: AISummary = {
			...sampleAISummary,
			quirky_signals: ["Visited Rust docs but never ran cargo"],
		};
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, summary);
		expect(md).toContain("Unusual Signals");
		expect(md).toContain("Visited Rust docs but never ran cargo");
	});

	it("renders focus_narrative", () => {
		const summary: AISummary = {
			...sampleAISummary,
			focus_narrative: "This was a deep-dive research day with sustained attention.",
		};
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, summary);
		expect(md).toContain("deep-dive research day");
	});

	it("omits cognitive patterns when no Phase 4 data", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).not.toContain("Cognitive Patterns");
	});
});

// ── Phase 3: Knowledge Insights ─────────────────────────

describe("knowledge insights section", () => {
	const knowledge: KnowledgeSections = {
		focusSummary: "Moderately focused day (focus score: 60%).",
		focusScore: 0.60,
		temporalInsights: ["research 10am-12pm — steady (5 events)"],
		topicMap: ["███ OAuth ↔ PKCE (3 co-occurrences)"],
		entityGraph: ["GitHub ↔ React (3x in implementation, debugging)"],
		recurrenceNotes: ["**New today:** Rust, WASM"],
		knowledgeDeltaLines: ["New topics explored: Rust, WASM"],
		tags: ["activity/research", "topic/oauth", "entity/github"],
	};

	it("renders knowledge insights section", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary, "none", knowledge);
		expect(md).toContain("Knowledge Insights");
		expect(md).toContain("Moderately focused day");
	});

	it("renders activity clusters", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary, "none", knowledge);
		expect(md).toContain("Activity Clusters");
		expect(md).toContain("research 10am-12pm");
	});

	it("renders topic map", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary, "none", knowledge);
		expect(md).toContain("Topic Map");
		expect(md).toContain("OAuth");
	});

	it("renders entity relations", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary, "none", knowledge);
		expect(md).toContain("Entity Relations");
		expect(md).toContain("GitHub");
	});

	it("includes knowledge tags in frontmatter", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary, "none", knowledge);
		expect(md).toContain("activity/research");
		expect(md).toContain("focus_score:");
	});

	it("omits knowledge section when not provided", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).not.toContain("Knowledge Insights");
	});
});

// ── Prompt Log Injection ─────────────────────────────────

describe("prompt log injection", () => {
	it("injects prompt details block after AI summary when promptLog provided", () => {
		const log = createPromptLog();
		appendPromptEntry(log, {
			stage: "summarize",
			model: "claude-haiku-4-5-20251001",
			tokenCount: 500,
			privacyTier: 1,
			prompt: "Test prompt text",
		});

		const md = renderMarkdown(
			new Date("2026-02-21"),
			[], [], [], [],
			{ dev: [], work: [], finance: [], social: [], news: [], media: [], shopping: [], health: [], other: [] },
			{ headline: "Test", tldr: "Summary", themes: [], category_summaries: {}, notable: [], questions: [] },
			"anthropic",
			undefined,
			log  // new optional parameter
		);

		expect(md).toContain("> [!example]-");
		expect(md).toContain("claude-haiku-4-5-20251001");
		expect(md).toContain("> Test prompt text");
		expect(md).toContain("> ```");
	});

	it("renders cleanly with no promptLog (backwards compatible)", () => {
		const md = renderMarkdown(
			new Date("2026-02-21"),
			[], [], [], [],
			{ dev: [], work: [], finance: [], social: [], news: [], media: [], shopping: [], health: [], other: [] },
			null,
			"none"
			// no promptLog argument — must still work
		);
		expect(md).not.toContain("claude-haiku");
	});
});

// ── C2: Callouts, Tables, Collapsible Sections ───────────

const testDate = new Date(2026, 1, 23); // Feb 23 2026

const mockAISummary: AISummary = {
	headline: "Built a pipeline inspector",
	tldr: "Spent the day building a CLI tool for debugging the pipeline.",
	themes: ["development", "tooling"],
	category_summaries: { development: "Heavy coding session" },
	notable: ["Committed 5 times"],
	questions: ["Is the inspector fast enough?"],
	work_patterns: ["Deep focus block on TypeScript implementation"],
	cross_source_connections: ["Searched for esbuild docs, then committed loader config"],
};

describe("C2 callout format", () => {
	it("renders stats as [!info] callout", () => {
		const md = renderMarkdown(testDate, [], [], [], [], {}, null, "none");
		expect(md).toContain("> [!info]");
	});

	it("renders headline as [!tip] callout when AI summary provided", () => {
		const md = renderMarkdown(testDate, [], [], [], [], {}, mockAISummary, "anthropic");
		expect(md).toContain("> [!tip]");
		expect(md).toContain("Built a pipeline inspector");
	});

	it("does not render tldr as a [!abstract] callout — TL;DR callout has been removed", () => {
		// mockAISummary has no work_story, so tldr renders as a plain paragraph
		const md = renderMarkdown(testDate, [], [], [], [], {}, mockAISummary, "anthropic");
		expect(md).not.toContain("> [!abstract]");
		// tldr content still appears as plain text since work_story is absent
		expect(md).toContain("Spent the day building a CLI tool");
	});

	it("renders category_summaries as markdown table", () => {
		const md = renderMarkdown(testDate, [], [], [], [], {}, mockAISummary, "anthropic");
		expect(md).toContain("| Category | Activity |");
	});

	it("renders work_patterns section when present", () => {
		const md = renderMarkdown(testDate, [], [], [], [], {}, mockAISummary, "anthropic");
		expect(md).toContain("Work Patterns");
		expect(md).toContain("Deep focus block on TypeScript implementation");
	});

	it("renders cross_source_connections inside the Work Patterns collapsed callout", () => {
		const md = renderMarkdown(testDate, [], [], [], [], {}, mockAISummary, "anthropic");
		expect(md).toContain("Cross-Source Connections");
		expect(md).toContain("Searched for esbuild docs");
	});

	it("omits Work Patterns section when work_patterns and cross_source_connections are absent", () => {
		const summaryNoPatterns: AISummary = {
			headline: "A quiet day",
			tldr: "Not much happened.",
			themes: ["misc"],
			category_summaries: {},
			notable: [],
			questions: [],
		};
		const md = renderMarkdown(testDate, [], [], [], [], {}, summaryNoPatterns, "anthropic");
		expect(md).not.toContain("Work Patterns");
	});
});

// ── Note Layout Reorder ──────────────────────────────────

const sampleGitCommits: GitCommit[] = [
	{
		hash: "abc1234def5",
		message: "feat: add login page",
		repo: "webapp",
		time: new Date("2025-06-15T14:00:00"),
		filesChanged: 3,
		insertions: 80,
		deletions: 5,
	},
];

const knowledgeForLayout: KnowledgeSections = {
	focusSummary: "Highly focused day (focus score: 80%).",
	focusScore: 0.80,
	temporalInsights: ["coding 09:00-11:00 — deep focus"],
	topicMap: ["███ Auth ↔ React (5 co-occurrences)"],
	entityGraph: [],
	recurrenceNotes: [],
	knowledgeDeltaLines: [],
	tags: ["topic/auth"],
};

describe("note layout reorder", () => {
	it("no-AI mode: Knowledge Insights renders after Git Activity", () => {
		const md = renderMarkdown(
			DATE,
			sampleVisits,
			sampleSearches,
			sampleClaude,
			sampleGitCommits,
			sampleCategorized,
			null,
			"none",
			knowledgeForLayout,
		);
		const gitActivityIdx = md.indexOf("Git Activity");
		const knowledgeInsightsIdx = md.indexOf("Knowledge Insights");
		expect(knowledgeInsightsIdx).toBeGreaterThan(-1);
		expect(gitActivityIdx).toBeGreaterThan(-1);
		expect(knowledgeInsightsIdx).toBeGreaterThan(gitActivityIdx);
	});

	it("AI-on mode: TL;DR callout is not rendered when work_story is present", () => {
		const summaryWithWorkStory: AISummary = {
			...sampleAISummary,
			work_story: "Spent the morning deep in OAuth flows, finishing the PKCE implementation.",
		};
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, summaryWithWorkStory, "anthropic");
		expect(md).not.toContain("> [!abstract]");
		// tldr content must NOT appear because work_story is present
		expect(md).not.toContain("Spent the day debugging and implementing");
	});

	it("AI-on mode: TL;DR renders as plain paragraph when work_story is absent", () => {
		const summaryNoWorkStory: AISummary = {
			...sampleAISummary,
			work_story: undefined,
			tldr: "Wrapped up the OAuth implementation.",
		};
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, summaryNoWorkStory, "anthropic");
		expect(md).not.toContain("> [!abstract]");
		expect(md).toContain("Wrapped up the OAuth implementation.");
	});

	it("Work Patterns is rendered as a collapsed callout, not a ##-heading section", () => {
		const summaryWithPatterns: AISummary = {
			...sampleAISummary,
			work_patterns: ["3-hour deep focus block on auth"],
		};
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, summaryWithPatterns, "anthropic");
		expect(md).not.toContain("## \u26A1 Work Patterns");
		expect(md).toContain("> [!info]- \u26A1 Work Patterns");
		expect(md).toContain("> - 3-hour deep focus block on auth");
	});
});
