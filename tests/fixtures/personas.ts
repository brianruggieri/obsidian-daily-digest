/**
 * Workday personas — 6 realistic Obsidian user archetypes.
 * Each generates a full day of mock data with expected outcomes.
 *
 * These represent complete days (8–16 hours of digital activity) for the
 * kinds of people who actually use Obsidian: developers, researchers,
 * students, product managers, DevOps engineers, and freelancers.
 */

import {
	BrowserVisit,
	SearchQuery,
	ClaudeSession,
	GitCommit,
	ActivityType,
} from "../../src/types";
import { defaultTimeConfig, generateTimeSeries } from "./time-utils";
import {
	DOMAIN_SETS,
	SEARCH_TEMPLATES,
	generateBrowserVisits,
	generateSearchQueries,
	generateClaudeSessions,
	generateCodexSessions,
	generateGitCommits,
} from "./generators";

export interface PersonaOutput {
	name: string;
	description: string;
	visits: BrowserVisit[];
	searches: SearchQuery[];
	claude: ClaudeSession[];
	codex: ClaudeSession[];
	git: GitCommit[];
	expectedThemes: string[];
	expectedActivityTypes: ActivityType[];
	expectedFocusRange: [number, number];
	narrative: string;
}

// ── Persona 1: Software Engineer — Deep Work Day ────────
// NOTE: Based on real usage data (Feb 11-25, 2026), developers using Claude Code
// have 75-80 Claude sessions per day, not 12. Updated to reflect reality.

export function softwareEngineerDeepWork(date?: Date): PersonaOutput {
	const config = defaultTimeConfig(date);
	const visitTs = generateTimeSeries(62, config);  // Real devs: 62 browser visits (was 180)
	const searchTs = generateTimeSeries(4, config);   // Real devs: 4 searches (was 25)
	const claudeTs = generateTimeSeries(75, config);  // Real devs: 75-80 Claude sessions (was 12)
	const codexTs = generateTimeSeries(6, config);    // Codex slightly higher
	const gitTs = generateTimeSeries(35, config);     // Real devs: 33-37 commits (was 8)

	const domains = [
		...DOMAIN_SETS.webdev.slice(0, 4),  // GitHub, StackOverflow, MDN, Anthropic (less browsing)
		...DOMAIN_SETS.communication.slice(0, 2),  // Gmail, Slack
		...DOMAIN_SETS.ai_tools,  // claude.ai
	];

	return {
		name: "Software Engineer — Deep Work Day",
		description: "62 browser visits, 75+ Claude sessions: Morning standup → rubber-ducking OAuth flow → pair-programming session with Claude → debugging race condition → code review → deployment",
		visits: generateBrowserVisits({ count: 62, domains, timestamps: visitTs }),
		searches: generateSearchQueries({
			count: 4,
			queries: SEARCH_TEMPLATES.webdev,
			engines: ["google.com"],
			timestamps: searchTs,
		}),
		claude: generateClaudeSessions({
			count: 75,
			promptCategory: "coding",
			projectName: "webapp",
			timestamps: claudeTs,
		}),
		codex: generateCodexSessions({
			count: 6,
			promptCategory: "coding",
			projectName: "webapp",
			timestamps: codexTs,
		}),
		git: generateGitCommits({
			count: 35,
			templateCategory: "webdev",
			timestamps: gitTs,
		}),
		expectedThemes: ["OAuth", "React", "authentication", "API design", "debugging", "code review"],
		expectedActivityTypes: ["implementation", "debugging", "communication"],
		expectedFocusRange: [0.02, 0.08],  // Real dev work is scattered across many contexts
		narrative: "A software developer's day heavy on Claude Code usage. 75 Claude sessions for rubber-ducking, architecture questions, debugging help, and code reviews. Only 62 browser visits to GitHub PRs, Stack Overflow, and MDN docs — most problem-solving happens in Claude. 35 git commits showing progressive implementation across multiple branches. Low focus score (2-8%) reflects context switching between multiple PRs, code reviews, and debugging sessions.",
	};
}

// ── Persona 2: Academic Researcher — Literature Review Day ──
// NOTE: Focused researcher doing deep paper reading. High browser visits to arXiv/Scholar,
// high searches for topic discovery, minimal Claude (mostly for paper summaries),
// zero git (non-technical work), high note-linking (building knowledge graph).

export function academicResearcher(date?: Date): PersonaOutput {
	const config = defaultTimeConfig(date);
	const visitTs = generateTimeSeries(70, config);   // arXiv, Scholar, Semantic Scholar
	const searchTs = generateTimeSeries(18, config);  // High search frequency for topic discovery
	const claudeTs = generateTimeSeries(2, config);   // Minimal: paper summaries only
	const codexTs = generateTimeSeries(0, config);    // No code
	const gitTs = generateTimeSeries(0, config);      // No git for pure researcher

	const domains = [
		...DOMAIN_SETS.academic.slice(0, 6),  // arXiv, Scholar, Semantic Scholar, JSTOR, Overleaf, Zotero
		...DOMAIN_SETS.research.slice(0, 2),  // Wikipedia, Medium articles
		...DOMAIN_SETS.communication.slice(0, 1),  // Email for collaboration
	];

	return {
		name: "Academic Researcher — Literature Review Day",
		description: "70 browser visits, 18 searches: Deep dive into papers on transformers → arXiv citation chasing → Zotero library curation → Overleaf note synthesis → knowledge graph expansion",
		visits: generateBrowserVisits({ count: 70, domains, timestamps: visitTs }),
		searches: generateSearchQueries({
			count: 18,
			queries: SEARCH_TEMPLATES.academic,
			engines: ["scholar.google.com", "semanticscholar.org"],
			timestamps: searchTs,
		}),
		claude: generateClaudeSessions({
			count: 2,
			promptCategory: "academic",
			projectName: "thesis",
			timestamps: claudeTs,
		}),
		codex: generateCodexSessions({
			count: 0,
			promptCategory: "general",
			projectName: "thesis",
			timestamps: codexTs,
		}),
		git: generateGitCommits({
			count: 0,
			templateCategory: "academic",
			timestamps: gitTs,
		}),
		expectedThemes: ["transformers", "attention mechanisms", "retrieval-augmented generation", "literature review", "knowledge synthesis"],
		expectedActivityTypes: ["research", "browsing", "learning"],
		expectedFocusRange: [0.65, 0.75],  // Sustained deep work on 2-3 topics
		narrative: "A research scientist's day deep in the literature. Morning: arXiv and Semantic Scholar dives on transformer attention mechanisms. 18 searches tracking down key papers, citation networks, methodology refinements. Zotero library curated with tags and annotations. Overleaf synthesis notes capturing patterns and gaps. Heavy internal linking building knowledge graph connections (60+ links). Two brief Claude sessions for paper abstraction help. Zero interruptions or context switches — sustained focus on single research area. Focus score 65-75%.",
	};
}

// ── Persona 3: Product Manager — Meeting Marathon ───────

export function productManagerMeetings(date?: Date): PersonaOutput {
	const config = defaultTimeConfig(date);
	const visitTs = generateTimeSeries(160, config);
	const searchTs = generateTimeSeries(15, config);
	const claudeTs = generateTimeSeries(6, config);
	const codexTs = generateTimeSeries(2, config);

	const domains = [
		...DOMAIN_SETS.product,
		...DOMAIN_SETS.communication,
		...DOMAIN_SETS.work_tools,
		...DOMAIN_SETS.shopping.slice(0, 1),
		...DOMAIN_SETS.social.slice(0, 2),
		...DOMAIN_SETS.news.slice(0, 1),
		...DOMAIN_SETS.media.slice(0, 1),
		...DOMAIN_SETS.personal.slice(0, 1),
	];

	return {
		name: "Product Manager — Meeting Marathon",
		description: "Back-to-back meetings 9am-3pm → Figma/Miro design reviews → competitor research → analytics deep dive → personal errands at lunch",
		visits: generateBrowserVisits({ count: 160, domains, timestamps: visitTs }),
		searches: generateSearchQueries({
			count: 15,
			queries: SEARCH_TEMPLATES.product,
			engines: ["google.com"],
			timestamps: searchTs,
		}),
		claude: generateClaudeSessions({
			count: 6,
			promptCategory: "product",
			projectName: "search-redesign",
			timestamps: claudeTs,
		}),
		codex: generateCodexSessions({
			count: 2,
			promptCategory: "general",
			projectName: "search-redesign",
			timestamps: codexTs,
		}),
		git: [],
		expectedThemes: ["product strategy", "design review", "user metrics", "meetings", "roadmap"],
		expectedActivityTypes: ["browsing", "communication", "admin", "planning"],
		expectedFocusRange: [0.1, 0.35],
		narrative: "A product manager's meeting-heavy day. Morning packed with 1:1s, design reviews, and cross-team syncs. Constant context switching between Figma wireframes, Notion PRDs, Amplitude dashboards, and Slack threads. Quick Amazon shopping at lunch. Afternoon catching up on async work: writing user stories, analyzing funnel data, and prepping the roadmap for next sprint.",
	};
}

// ── Persona 4: DevOps Engineer — Incident Day ───────────

export function devopsIncidentDay(date?: Date): PersonaOutput {
	const config = {
		...defaultTimeConfig(date),
		workStart: 6,  // Paged at 6am
		workEnd: 18,   // Long day
	};
	const visitTs = generateTimeSeries(140, config);
	const searchTs = generateTimeSeries(20, config);
	const claudeTs = generateTimeSeries(10, config);
	const codexTs = generateTimeSeries(4, config);
	const gitTs = generateTimeSeries(6, config);

	const domains = [
		...DOMAIN_SETS.incident,
		...DOMAIN_SETS.devops,
		...DOMAIN_SETS.communication,
		...DOMAIN_SETS.webdev.slice(0, 2),
		...DOMAIN_SETS.work_tools.slice(0, 2),
	];

	return {
		name: "DevOps Engineer — Incident Day",
		description: "Paged at 6am → production API outage → Grafana/PagerDuty incident response → postmortem writing → remediation deployment",
		visits: generateBrowserVisits({ count: 140, domains, timestamps: visitTs }),
		searches: generateSearchQueries({
			count: 20,
			queries: SEARCH_TEMPLATES.incident,
			engines: ["google.com"],
			timestamps: searchTs,
		}),
		claude: generateClaudeSessions({
			count: 10,
			promptCategory: "incident",
			projectName: "infrastructure",
			timestamps: claudeTs,
		}),
		codex: generateCodexSessions({
			count: 4,
			promptCategory: "coding",
			projectName: "infrastructure",
			timestamps: codexTs,
		}),
		git: generateGitCommits({
			count: 6,
			templateCategory: "devops",
			timestamps: gitTs,
		}),
		expectedThemes: ["incident response", "Kubernetes", "OOMKilled", "monitoring", "postmortem"],
		expectedActivityTypes: ["infrastructure", "debugging", "communication"],
		expectedFocusRange: [0.4, 0.7],
		narrative: "A DevOps engineer paged at 6am for a production API outage. Morning consumed by incident response: Grafana dashboards, PagerDuty timelines, kubectl commands, CloudWatch logs. Root cause: OOMKilled pods from a memory leak. Afternoon writing the postmortem, deploying a hotfix with increased memory limits, and tuning alerting thresholds. Heavy shell usage throughout — 60 commands. Used Claude for error trace analysis and postmortem drafting.",
	};
}

// ── Persona 5: Student — Exam Prep Day ──────────────────

export function studentExamPrep(date?: Date): PersonaOutput {
	const config = {
		...defaultTimeConfig(date),
		workStart: 8,   // Starts studying early
		workEnd: 22,    // Studies late
		lunchStart: 12,
		lunchEnd: 13,
	};
	const visitTs = generateTimeSeries(250, config);
	const searchTs = generateTimeSeries(40, config);
	const claudeTs = generateTimeSeries(15, config);
	const codexTs = generateTimeSeries(3, config);
	const gitTs = generateTimeSeries(3, config);

	const domains = [
		...DOMAIN_SETS.student,
		...DOMAIN_SETS.social.slice(0, 3),  // Reddit, Discord breaks
		...DOMAIN_SETS.media.slice(0, 2),    // YouTube lectures, Spotify
		...DOMAIN_SETS.news.slice(0, 1),     // HN procrastination
		...DOMAIN_SETS.shopping.slice(0, 1), // Quick snack order
		...DOMAIN_SETS.personal.slice(0, 1),
	];

	return {
		name: "Student — Exam Prep Day",
		description: "CS finals cramming → algorithms textbook/videos → LeetCode practice → study group on Discord → Reddit/YouTube breaks → Claude for explanations",
		visits: generateBrowserVisits({ count: 250, domains, timestamps: visitTs }),
		searches: generateSearchQueries({
			count: 40,
			queries: SEARCH_TEMPLATES.student,
			engines: ["google.com", "duckduckgo.com"],
			timestamps: searchTs,
		}),
		claude: generateClaudeSessions({
			count: 15,
			promptCategory: "student",
			projectName: "cs301-algorithms",
			timestamps: claudeTs,
		}),
		codex: generateCodexSessions({
			count: 3,
			promptCategory: "coding",
			projectName: "cs301-algorithms",
			timestamps: codexTs,
		}),
		git: generateGitCommits({
			count: 3,
			templateCategory: "general",
			timestamps: gitTs,
		}),
		expectedThemes: ["algorithms", "data structures", "exam prep", "dynamic programming", "graph algorithms"],
		expectedActivityTypes: ["learning", "research", "browsing"],
		expectedFocusRange: [0.3, 0.6],
		narrative: "A CS student cramming for their algorithms final. Jumping between Khan Academy, GeeksforGeeks, YouTube lectures (MIT 6.006, Abdul Bari), and Quizlet flashcards. LeetCode practice for hands-on coding. Frequent Reddit and Discord breaks for study group coordination. Heavy Claude usage — 15 prompts asking for algorithm explanations, step-by-step walkthroughs, and help with homework problems. Highest visit count (250) reflecting the fragmented nature of exam prep.",
	};
}

// ── Persona 6: Freelancer — Multi-Project Day ───────────

export function freelancerMultiProject(date?: Date): PersonaOutput {
	const config = {
		...defaultTimeConfig(date),
		workStart: 8,
		workEnd: 20,   // Long freelancer day
	};
	const visitTs = generateTimeSeries(200, config);
	const _searchTs = generateTimeSeries(20, config);
	const gitTs = generateTimeSeries(4, config);

	const domains = [
		...DOMAIN_SETS.freelance,
		...DOMAIN_SETS.webdev.slice(0, 4),
		...DOMAIN_SETS.communication.slice(0, 3),
		...DOMAIN_SETS.work_tools.slice(0, 2),
		...DOMAIN_SETS.social.slice(0, 2),
		...DOMAIN_SETS.news.slice(0, 1),
		...DOMAIN_SETS.media.slice(0, 1),
		...DOMAIN_SETS.shopping.slice(0, 1),
	];

	// Claude sessions split across 3 project names
	const claudeTs = generateTimeSeries(10, config);
	const codexTs = generateTimeSeries(3, config);
	const claudeA = generateClaudeSessions({
		count: 4,
		promptCategory: "freelance",
		projectName: "client-a-dashboard",
		timestamps: claudeTs.slice(0, 4),
	});
	const claudeB = generateClaudeSessions({
		count: 3,
		promptCategory: "freelance",
		projectName: "client-b-wordpress",
		timestamps: claudeTs.slice(4, 7),
	});
	const claudeC = generateClaudeSessions({
		count: 3,
		promptCategory: "freelance",
		projectName: "personal-blog",
		timestamps: claudeTs.slice(7, 10),
	});


	return {
		name: "Freelancer — Multi-Project Day",
		description: "Morning: Client A React dashboard → Afternoon: Client B WordPress theme → Evening: Client C invoicing + personal blog post",
		visits: generateBrowserVisits({ count: 200, domains, timestamps: visitTs }),
		searches: generateSearchQueries({
			count: 20,
			queries: SEARCH_TEMPLATES.freelance,
			engines: ["google.com", "duckduckgo.com"],
			timestamps: generateTimeSeries(20, config),
		}),
		claude: [...claudeA, ...claudeB, ...claudeC],
		codex: generateCodexSessions({
			count: 3,
			promptCategory: "coding",
			projectName: "client-a-dashboard",
			timestamps: codexTs,
		}),
		git: generateGitCommits({
			count: 4,
			templateCategory: "webdev",
			timestamps: gitTs,
		}),
		expectedThemes: ["React", "WordPress", "client work", "invoicing", "multi-project"],
		expectedActivityTypes: ["implementation", "admin", "communication", "writing"],
		expectedFocusRange: [0.2, 0.5],
		narrative: "A freelance developer's typical juggling act across 3 client projects plus a personal blog. Morning heads-down on Client A's React dashboard (SSR hydration fix). After lunch, switches to Client B's WordPress theme update. Evening wraps up with Client C invoicing on FreshBooks and drafting a blog post about React Server Components. Shell history shows 3 distinct project contexts. Claude sessions spread across all projects. Lots of Slack workspace switching.",
	};
}

// ── Persona 7: Writer — Long-Form Writing Day ──────────

export function contentWriterLongForm(date?: Date): PersonaOutput {
	const config = {
		...defaultTimeConfig(date),
		workStart: 8,
		workEnd: 18,
	};
	const visitTs = generateTimeSeries(10, config);   // Minimal: just research/references
	const searchTs = generateTimeSeries(1, config);   // Almost no external searches
	const claudeTs = generateTimeSeries(3, config);   // Minimal: feedback/brainstorm
	const codexTs = generateTimeSeries(0, config);    // No code
	const gitTs = generateTimeSeries(0, config);      // No git

	const domains = [
		...DOMAIN_SETS.research.slice(0, 2),  // Wikipedia, Medium for research
		...DOMAIN_SETS.communication.slice(0, 1),  // Email
		...DOMAIN_SETS.work_tools.slice(3, 4),  // Google Docs
	];

	return {
		name: "Content Writer — Long-Form Writing Day",
		description: "10 browser visits, 1 search: Morning planning → 4-hour deep writing block → edit & link to previous posts → publish → promotion",
		visits: generateBrowserVisits({ count: 10, domains, timestamps: visitTs }),
		searches: generateSearchQueries({
			count: 1,
			queries: ["keyword research for blog post"],
			engines: ["google.com"],
			timestamps: searchTs,
		}),
		claude: generateClaudeSessions({
			count: 3,
			promptCategory: "general",
			projectName: "blog",
			timestamps: claudeTs,
		}),
		codex: generateCodexSessions({
			count: 0,
			promptCategory: "general",
			projectName: "blog",
			timestamps: codexTs,
		}),
		git: generateGitCommits({
			count: 0,
			templateCategory: "general",
			timestamps: gitTs,
		}),
		expectedThemes: ["long-form writing", "editorial voice", "narrative arc", "reader engagement", "publishing"],
		expectedActivityTypes: ["writing", "planning", "admin"],
		expectedFocusRange: [0.75, 0.85],  // Very high focus — long uninterrupted blocks
		narrative: "A content creator's deep writing day. Morning planning and outline in Notion. Then 4-hour uninterrupted writing block on a substantive topic (minimal external references). Editing and internal linking to previous blog posts to build narrative coherence. Brief Claude sessions for brainstorming angles and editing feedback. Minimal browsing (10 visits) — mostly research tabs open during writing. Highest focus score (75-85%) reflecting sustained deep work on single output.",
	};
}

// ── All Personas ────────────────────────────────────────

export const ALL_PERSONAS = [
	softwareEngineerDeepWork,
	academicResearcher,
	productManagerMeetings,
	devopsIncidentDay,
	studentExamPrep,
	freelancerMultiProject,
	contentWriterLongForm,
];

export function generateAllPersonas(date?: Date): PersonaOutput[] {
	return ALL_PERSONAS.map((fn) => fn(date));
}

// ── Backward-Compatible Aliases ─────────────────────────
// Eval tests reference old persona names. These aliases keep them working.

export const fullStackDeveloper = softwareEngineerDeepWork;
export const researchKnowledgeWorker = academicResearcher;
export const scatteredContextSwitcher = productManagerMeetings;
export const devopsInfrastructureDay = devopsIncidentDay;
export const learningDay = studentExamPrep;
export const mixedRemoteWorkDay = freelancerMultiProject;
