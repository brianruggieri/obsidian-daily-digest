import { describe, it, expect } from "vitest";
import { renderMarkdown, mergeToUnifiedEvents, buildTimeBlocks } from "../../../src/render/renderer";
import { AISummary, BrowserVisit, SearchQuery, ClaudeSession, CategorizedVisits, GitCommit, TemporalCluster } from "../../../src/types";
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
		expect(md).not.toContain("categories:");
	});

	it("includes themes in note body and themes field (not in tags)", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("OAuth");
		expect(md).toContain("React");
		expect(md).toContain("themes:");
		// theme slugs must NOT appear in the tags: line
		const tagsLine = md.split("\n").find((l) => l.startsWith("tags:")) ?? "";
		expect(tagsLine).not.toContain("oauth");
		expect(tagsLine).not.toContain("react");
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
		expect(md).toContain("1 AI prompt");
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

	it("includes reflection section with blockquote and reflect_ field", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("Reflection");
		expect(md).toContain("token storage strategy");
		expect(md).toContain("reflect_");
		expect(md).toContain("Anything else on your mind today?");
	});

	it("does not include old Notes section", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).not.toContain("## \u{1F4DD} Notes");
		expect(md).not.toContain("Add your reflections here");
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
		// The [!abstract]- callout is used for Activity Overview, not TL;DR
		expect(md).not.toContain("> [!abstract] ");
		// tldr content still appears as plain text since work_story is absent
		expect(md).toContain("Spent the day building a CLI tool");
	});

	it("renders category_summaries as collapsed callout with markdown table", () => {
		const md = renderMarkdown(testDate, [], [], [], [], {}, mockAISummary, "anthropic");
		expect(md).toContain("> [!abstract]- Activity Overview");
		expect(md).toContain("> | Category | Activity |");
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
		// No TL;DR [!abstract] callout (trailing space distinguishes from [!abstract]- Activity Overview)
		expect(md).not.toContain("> [!abstract] ");
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
		expect(md).not.toContain("> [!abstract] ");
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

// ── Three-Layer Layout ──────────────────────────────────

describe("three-layer layout", () => {
	const fullSummary: AISummary = {
		...sampleAISummary,
		learnings: ["TypeScript generics can infer from return types"],
		remember: ["Use --frozen-lockfile in CI"],
		note_seeds: ["TypeScript inference patterns"],
		meta_insights: ["Research-to-implementation ratio was 2:1"],
		work_patterns: ["Deep focus block on auth"],
	};

	it("Layer 1 sections appear before Layer 2 callouts", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, sampleGitCommits, sampleCategorized, fullSummary, "anthropic", knowledgeForLayout);
		const notableIdx = md.indexOf("Notable");
		const activityOverviewIdx = md.indexOf("Activity Overview");
		const searchesIdx = md.indexOf("Searches");
		expect(notableIdx).toBeGreaterThan(-1);
		expect(activityOverviewIdx).toBeGreaterThan(-1);
		expect(notableIdx).toBeLessThan(activityOverviewIdx);
		// Searches (Layer 3) comes after Activity Overview (Layer 2)
		expect(searchesIdx).toBeGreaterThan(activityOverviewIdx);
	});

	it("Learnings, Remember, Note Seeds render as collapsed callouts in Layer 2", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, fullSummary, "anthropic");
		expect(md).toContain("> [!todo]- \u{1F4DA} Learnings");
		expect(md).toContain("> [!todo]- \u{1F5D2}\uFE0F Remember");
		expect(md).toContain("> [!tip]- \u{1F331} Note Seeds");
		// No ## headings for these
		expect(md).not.toContain("## \u{1F4DA} Learnings");
		expect(md).not.toContain("## \u{1F5D2}\uFE0F Remember");
		expect(md).not.toContain("## \u{1F331} Note Seeds");
	});

	it("Learnings/Remember/Note Seeds appear before Searches (Layer 2 before Layer 3)", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, fullSummary, "anthropic");
		const learningsIdx = md.indexOf("Learnings");
		const searchesIdx = md.indexOf("Searches");
		expect(learningsIdx).toBeGreaterThan(-1);
		expect(searchesIdx).toBeGreaterThan(-1);
		expect(learningsIdx).toBeLessThan(searchesIdx);
	});

	it("Cognitive Patterns renders as collapsed [!example] callout", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, fullSummary, "anthropic");
		expect(md).toContain("> [!example]- \u{1F52D} Cognitive Patterns");
		expect(md).not.toContain("## \u{1F52D} Cognitive Patterns");
	});

	it("Knowledge Insights renders as collapsed [!info] callout in AI-on mode", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, fullSummary, "anthropic", knowledgeForLayout);
		expect(md).toContain("> [!info]- \u{1F9E0} Knowledge Insights");
		// Should NOT have ## heading in AI-on mode
		expect(md).not.toContain("## \u{1F9E0} Knowledge Insights");
	});

	it("Knowledge Insights renders as open ## heading in no-AI mode", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, sampleGitCommits, sampleCategorized, null, "none", knowledgeForLayout);
		expect(md).toContain("## \u{1F9E0} Knowledge Insights");
		expect(md).not.toContain("> [!info]- \u{1F9E0} Knowledge Insights");
	});

	it("Searches renders as collapsed callout with count", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("> [!info]- \u{1F50D} Searches (1)");
		expect(md).not.toContain("## \u{1F50D} Searches");
	});

	it("Claude Code renders as collapsed callout with count", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		expect(md).toContain("> [!info]- \u{1F916} Claude Code / AI Work (1)");
		expect(md).not.toContain("## \u{1F916} Claude Code / AI Work");
	});

	it("Git Activity renders as collapsed callout with count", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, sampleGitCommits, sampleCategorized, sampleAISummary);
		expect(md).toContain("> [!info]- \u{1F4E6} Git Activity (1 commits)");
		expect(md).not.toContain("## \u{1F4E6} Git Activity");
	});

	it("Browser Activity renders as two-level nested collapse", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, [], sampleCategorized, sampleAISummary);
		// Outer callout with total stats
		expect(md).toContain("> [!info]- \u{1F310} Browser Activity (1 visits, 1 categories)");
		// Summary line with top domains
		expect(md).toContain("> - ");
		expect(md).toContain("github.com");
		// Nested inner callout
		expect(md).toContain("> > [!info]-");
		expect(md).not.toContain("## \u{1F310} Browser Activity");
	});

	it("Reflection soft-close appears before footer", () => {
		const md = renderMarkdown(DATE, sampleVisits, sampleSearches, sampleClaude, sampleGitCommits, sampleCategorized, fullSummary, "anthropic", knowledgeForLayout);
		const softCloseIdx = md.indexOf("_Anything else on your mind today?_");
		const footerIdx = md.indexOf("Generated by Daily Digest");
		expect(softCloseIdx).toBeGreaterThan(-1);
		expect(footerIdx).toBeGreaterThan(-1);
		expect(softCloseIdx).toBeLessThan(footerIdx);
		// Reflection should be after all archive sections
		const gitIdx = md.indexOf("Git Activity");
		const browserIdx = md.indexOf("Browser Activity");
		expect(softCloseIdx).toBeGreaterThan(gitIdx);
		expect(softCloseIdx).toBeGreaterThan(browserIdx);
	});
});

// ── Unified Timeline ──────────────────────────────────────

const timelineVisits: BrowserVisit[] = [
	{ url: "https://github.com/repo", title: "My Repo", time: new Date("2025-06-15T09:15:00"), domain: "github.com" },
	{ url: "https://docs.obsidian.md", title: "Obsidian Docs", time: new Date("2025-06-15T14:30:00"), domain: "docs.obsidian.md" },
];

const timelineSearches: SearchQuery[] = [
	{ query: "typescript generics", time: new Date("2025-06-15T09:10:00"), engine: "google.com" },
];

const timelineClaude: ClaudeSession[] = [
	{ prompt: "Fix the auth bug in login", time: new Date("2025-06-15T09:20:00"), project: "webapp", isConversationOpener: true, conversationFile: "session.jsonl", conversationTurnCount: 3 },
	{ prompt: "Explain PKCE flow", time: new Date("2025-06-15T14:45:00"), project: "webapp", isConversationOpener: true, conversationFile: "session2.jsonl", conversationTurnCount: 2 },
];

const timelineGitCommits: GitCommit[] = [
	{ hash: "abc1234def5678", message: "feat: add login page", repo: "webapp", time: new Date("2025-06-15T09:30:00"), filesChanged: 3, insertions: 80, deletions: 5 },
	{ hash: "def5678abc1234", message: "fix: correct token validation", repo: "webapp", time: new Date("2025-06-15T15:00:00"), filesChanged: 1, insertions: 5, deletions: 2 },
];

describe("mergeToUnifiedEvents", () => {
	it("merges all sources into a single sorted array", () => {
		const events = mergeToUnifiedEvents(timelineVisits, timelineSearches, timelineClaude, timelineGitCommits);
		// 2 visits + 1 search + 2 claude + 2 git = 7
		expect(events.length).toBe(7);
		// Sorted chronologically
		expect(events[0].source).toBe("search");   // 09:10
		expect(events[1].source).toBe("browser");   // 09:15
		expect(events[2].source).toBe("claude");     // 09:20
		expect(events[3].source).toBe("git");        // 09:30
		expect(events[4].source).toBe("browser");    // 14:30
		expect(events[5].source).toBe("claude");     // 14:45
		expect(events[6].source).toBe("git");        // 15:00
	});

	it("skips events without timestamps", () => {
		const visitNoTime: BrowserVisit[] = [
			{ url: "https://example.com", title: "No Time", time: null, domain: "example.com" },
		];
		const events = mergeToUnifiedEvents(visitNoTime, [], [], []);
		expect(events.length).toBe(0);
	});
});

describe("buildTimeBlocks", () => {
	it("groups events into Morning, Afternoon, and Evening blocks", () => {
		const events = mergeToUnifiedEvents(timelineVisits, timelineSearches, timelineClaude, timelineGitCommits);
		const blocks = buildTimeBlocks(events, []);
		// Morning block (09:xx events) and Afternoon block (14:xx-15:xx)
		expect(blocks.length).toBe(2);
		expect(blocks[0].period).toBe("Morning");
		expect(blocks[1].period).toBe("Afternoon");
	});

	it("assigns events to cluster-based sessions when clusters provided", () => {
		const cluster: TemporalCluster = {
			hourStart: 9,
			hourEnd: 10,
			activityType: "implementation",
			eventCount: 4,
			topics: ["typescript", "auth"],
			entities: ["GitHub"],
			intensity: 4,
			label: "implementation 9am-10am: typescript, auth",
		};
		const events = mergeToUnifiedEvents(timelineVisits, timelineSearches, timelineClaude, timelineGitCommits);
		const blocks = buildTimeBlocks(events, [cluster]);
		// Morning block should have a session labeled from the cluster
		const morningBlock = blocks.find((b) => b.period === "Morning");
		expect(morningBlock).toBeDefined();
		const clusterSession = morningBlock!.sessions.find(
			(s) => s.label.toLowerCase().includes("typescript")
		);
		expect(clusterSession).toBeDefined();
	});
});

describe("timeline rendering", () => {
	it("renders timeline callout with source badges", () => {
		const md = renderMarkdown(
			DATE, timelineVisits, timelineSearches, timelineClaude, timelineGitCommits,
			{ dev: timelineVisits }, null, "none",
		);
		expect(md).toContain("Timeline");
		// Source badges
		expect(md).toContain("\u{1F310}"); // browser
		expect(md).toContain("\u{1F4E6}"); // git
		expect(md).toContain("\u{1F916}"); // claude
		expect(md).toContain("\u{1F50D}"); // search
	});

	it("renders time-of-day labels", () => {
		const md = renderMarkdown(
			DATE, timelineVisits, timelineSearches, timelineClaude, timelineGitCommits,
			{ dev: timelineVisits }, null, "none",
		);
		expect(md).toContain("**Morning**");
		expect(md).toContain("**Afternoon**");
	});

	it("renders events in chronological order within the timeline", () => {
		const md = renderMarkdown(
			DATE, timelineVisits, timelineSearches, timelineClaude, timelineGitCommits,
			{ dev: timelineVisits }, null, "none",
		);
		const timelineStart = md.indexOf("Timeline");
		const searchIdx = md.indexOf("typescript generics", timelineStart);
		const browserIdx = md.indexOf("My Repo", timelineStart);
		const claudeIdx = md.indexOf("Fix the auth bug", timelineStart);
		const gitIdx = md.indexOf("abc1234", timelineStart);
		// 09:10 search < 09:15 browser < 09:20 claude < 09:30 git
		expect(searchIdx).toBeLessThan(browserIdx);
		expect(browserIdx).toBeLessThan(claudeIdx);
		expect(claudeIdx).toBeLessThan(gitIdx);
	});

	it("timeline appears before Layer 3B archive callouts", () => {
		const md = renderMarkdown(
			DATE, timelineVisits, timelineSearches, timelineClaude, timelineGitCommits,
			{ dev: timelineVisits }, null, "none",
		);
		const timelineIdx = md.indexOf("Timeline");
		const searchesIdx = md.indexOf("Searches");
		const browserActivityIdx = md.indexOf("Browser Activity");
		const gitActivityIdx = md.indexOf("Git Activity");
		expect(timelineIdx).toBeLessThan(searchesIdx);
		expect(timelineIdx).toBeLessThan(browserActivityIdx);
		expect(timelineIdx).toBeLessThan(gitActivityIdx);
	});

	it("omits timeline when enableTimeline is false", () => {
		const md = renderMarkdown(
			DATE, timelineVisits, timelineSearches, timelineClaude, timelineGitCommits,
			{ dev: timelineVisits }, null, "none",
			undefined, undefined, false,
		);
		expect(md).not.toContain("Timeline");
		// Archive sections should still be present
		expect(md).toContain("Browser Activity");
		expect(md).toContain("Git Activity");
	});

	it("omits timeline when no events have timestamps", () => {
		const noTimeVisits: BrowserVisit[] = [
			{ url: "https://example.com", title: "No time", time: null, domain: "example.com" },
		];
		const md = renderMarkdown(
			DATE, noTimeVisits, [], [], [],
			{ other: noTimeVisits }, null, "none",
		);
		expect(md).not.toContain("Timeline");
	});

	it("renders session count summary line", () => {
		const md = renderMarkdown(
			DATE, timelineVisits, timelineSearches, timelineClaude, timelineGitCommits,
			{ dev: timelineVisits }, null, "none",
		);
		// The morning session should show counts like "1 commit · 1 visit · 1 AI prompt · 1 search"
		expect(md).toMatch(/\d+ commit/);
		expect(md).toMatch(/\d+ visit/);
		expect(md).toMatch(/\d+ AI prompt/);
	});
});
