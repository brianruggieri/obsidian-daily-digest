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
	ShellCommand,
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
	generateShellCommands,
	generateClaudeSessions,
	generateGitCommits,
} from "./generators";

export interface PersonaOutput {
	name: string;
	description: string;
	visits: BrowserVisit[];
	searches: SearchQuery[];
	shell: ShellCommand[];
	claude: ClaudeSession[];
	git: GitCommit[];
	expectedThemes: string[];
	expectedActivityTypes: ActivityType[];
	expectedFocusRange: [number, number];
	narrative: string;
}

// ── Persona 1: Software Engineer — Deep Work Day ────────

export function softwareEngineerDeepWork(date?: Date): PersonaOutput {
	const config = defaultTimeConfig(date);
	const visitTs = generateTimeSeries(180, config);
	const searchTs = generateTimeSeries(25, config);
	const shellTs = generateTimeSeries(40, config);
	const claudeTs = generateTimeSeries(12, config);
	const gitTs = generateTimeSeries(8, config);

	const domains = [
		...DOMAIN_SETS.webdev,
		...DOMAIN_SETS.communication,
		...DOMAIN_SETS.news.slice(0, 2),
		...DOMAIN_SETS.social.slice(0, 2),
		...DOMAIN_SETS.ai_tools,
		...DOMAIN_SETS.work_tools.slice(0, 3),
		...DOMAIN_SETS.media.slice(0, 1),
	];

	return {
		name: "Software Engineer — Deep Work Day",
		description: "Morning standup → heads-down OAuth implementation → debugging token refresh race condition → PR review → deployment",
		visits: generateBrowserVisits({ count: 180, domains, timestamps: visitTs }),
		searches: generateSearchQueries({
			count: 25,
			queries: SEARCH_TEMPLATES.webdev,
			engines: ["google.com", "kagi.com"],
			timestamps: searchTs,
		}),
		shell: generateShellCommands({ count: 40, workflow: "webdev", timestamps: shellTs }),
		claude: generateClaudeSessions({
			count: 12,
			promptCategory: "coding",
			projectName: "webapp",
			timestamps: claudeTs,
		}),
		git: generateGitCommits({
			count: 8,
			templateCategory: "webdev",
			timestamps: gitTs,
		}),
		expectedThemes: ["OAuth", "React", "authentication", "API design", "deployment", "debugging"],
		expectedActivityTypes: ["implementation", "debugging", "research"],
		expectedFocusRange: [0.6, 0.9],
		narrative: "A software engineer's focused 9-5 day: morning standup and email triage, then heads-down implementing an OAuth PKCE flow for the React app. Hit a nasty token refresh race condition mid-afternoon that required deep debugging with Claude's help. Wrapped up with PR review, deployment to staging, and HN browsing over lunch.",
	};
}

// ── Persona 2: Academic Researcher — Paper Writing Day ──

export function academicResearcher(date?: Date): PersonaOutput {
	const config = defaultTimeConfig(date);
	const visitTs = generateTimeSeries(220, config);
	const searchTs = generateTimeSeries(35, config);
	const shellTs = generateTimeSeries(15, config);
	const claudeTs = generateTimeSeries(8, config);
	const gitTs = generateTimeSeries(5, config);

	const domains = [
		...DOMAIN_SETS.academic,
		...DOMAIN_SETS.research,
		...DOMAIN_SETS.communication.slice(0, 2),
		...DOMAIN_SETS.work_tools.slice(0, 2),
		...DOMAIN_SETS.media.slice(0, 1),
		...DOMAIN_SETS.news.slice(0, 1),
		...DOMAIN_SETS.social.slice(0, 1),
	];

	return {
		name: "Academic Researcher — Paper Writing Day",
		description: "Literature review → citation chasing across arXiv/Scholar/Semantic Scholar → thesis writing in Overleaf → experiment scripts → evening slides prep",
		visits: generateBrowserVisits({ count: 220, domains, timestamps: visitTs }),
		searches: generateSearchQueries({
			count: 35,
			queries: SEARCH_TEMPLATES.academic,
			engines: ["google.com", "scholar.google.com"],
			timestamps: searchTs,
		}),
		shell: generateShellCommands({ count: 15, workflow: "academic", timestamps: shellTs }),
		claude: generateClaudeSessions({
			count: 8,
			promptCategory: "academic",
			projectName: "thesis",
			timestamps: claudeTs,
		}),
		git: generateGitCommits({
			count: 5,
			templateCategory: "academic",
			timestamps: gitTs,
		}),
		expectedThemes: ["transformers", "NLP", "attention mechanisms", "literature review", "thesis writing"],
		expectedActivityTypes: ["research", "writing", "learning"],
		expectedFocusRange: [0.5, 0.85],
		narrative: "A PhD student's day writing a literature review chapter. Deep dives into papers on arXiv and Semantic Scholar, citation chasing through Google Scholar, managing references in Zotero, writing in Overleaf. Used Claude to help summarize papers and structure the related work section. Wikipedia rabbit holes on attention mechanisms. Evening prep for conference slides.",
	};
}

// ── Persona 3: Product Manager — Meeting Marathon ───────

export function productManagerMeetings(date?: Date): PersonaOutput {
	const config = defaultTimeConfig(date);
	const visitTs = generateTimeSeries(160, config);
	const searchTs = generateTimeSeries(15, config);
	const shellTs = generateTimeSeries(5, config);
	const claudeTs = generateTimeSeries(6, config);

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
		shell: generateShellCommands({ count: 5, workflow: "writing", timestamps: shellTs }),
		claude: generateClaudeSessions({
			count: 6,
			promptCategory: "product",
			projectName: "search-redesign",
			timestamps: claudeTs,
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
	const shellTs = generateTimeSeries(60, config);
	const claudeTs = generateTimeSeries(10, config);
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
		shell: generateShellCommands({ count: 60, workflow: "incident", timestamps: shellTs }),
		claude: generateClaudeSessions({
			count: 10,
			promptCategory: "incident",
			projectName: "infrastructure",
			timestamps: claudeTs,
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
	const shellTs = generateTimeSeries(10, config);
	const claudeTs = generateTimeSeries(15, config);
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
		shell: generateShellCommands({ count: 10, workflow: "student", timestamps: shellTs }),
		claude: generateClaudeSessions({
			count: 15,
			promptCategory: "student",
			projectName: "cs301-algorithms",
			timestamps: claudeTs,
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
	const _shellTs = generateTimeSeries(35, config);
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

	// Shell commands from 3 different workflows representing project switching
	const shellA = generateShellCommands({ count: 12, workflow: "freelance_react", timestamps: generateTimeSeries(12, config) });
	const shellB = generateShellCommands({ count: 8, workflow: "freelance_wordpress", timestamps: generateTimeSeries(8, config) });
	const shellC = generateShellCommands({ count: 5, workflow: "freelance_invoicing", timestamps: generateTimeSeries(5, config) });
	const shellMisc = generateShellCommands({ count: 10, workflow: "webdev", timestamps: generateTimeSeries(10, config) });

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
		shell: [...shellA, ...shellB, ...shellC, ...shellMisc].slice(0, 35),
		claude: [...claudeA, ...claudeB, ...claudeC],
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

// ── All Personas ────────────────────────────────────────

export const ALL_PERSONAS = [
	softwareEngineerDeepWork,
	academicResearcher,
	productManagerMeetings,
	devopsIncidentDay,
	studentExamPrep,
	freelancerMultiProject,
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
