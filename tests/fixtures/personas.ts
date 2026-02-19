/**
 * Workday personas — 6 realistic Obsidian user archetypes.
 * Each generates a full day of mock data with expected outcomes.
 */

import {
	BrowserVisit,
	SearchQuery,
	ShellCommand,
	ClaudeSession,
	ActivityType,
} from "../../src/types";
import { TimeConfig, defaultTimeConfig, generateTimeSeries } from "./time-utils";
import {
	DOMAIN_SETS,
	SEARCH_TEMPLATES,
	generateBrowserVisits,
	generateSearchQueries,
	generateShellCommands,
	generateClaudeSessions,
} from "./generators";

export interface PersonaOutput {
	name: string;
	description: string;
	visits: BrowserVisit[];
	searches: SearchQuery[];
	shell: ShellCommand[];
	claude: ClaudeSession[];
	expectedThemes: string[];
	expectedActivityTypes: ActivityType[];
	expectedFocusRange: [number, number];
	narrative: string;
}

// ── Persona 1: Full-Stack Developer ─────────────────────

export function fullStackDeveloper(date?: Date): PersonaOutput {
	const config = defaultTimeConfig(date);
	const visitTs = generateTimeSeries(70, config);
	const searchTs = generateTimeSeries(10, config);
	const shellTs = generateTimeSeries(18, config);
	const claudeTs = generateTimeSeries(5, config);

	const domains = [
		...DOMAIN_SETS.webdev,
		...DOMAIN_SETS.communication.slice(0, 2),
		...DOMAIN_SETS.news.slice(0, 2),
		...DOMAIN_SETS.social.slice(0, 1),
	];

	return {
		name: "Full-Stack Developer",
		description: "Debugging React auth bug → implementing OAuth → deploying to Vercel",
		visits: generateBrowserVisits({ count: 70, domains, timestamps: visitTs }),
		searches: generateSearchQueries({
			count: 10,
			queries: SEARCH_TEMPLATES.webdev.slice(0, 10),
			engines: ["google.com", "kagi.com"],
			timestamps: searchTs,
		}),
		shell: generateShellCommands({ count: 18, workflow: "webdev", timestamps: shellTs }),
		claude: generateClaudeSessions({
			count: 5,
			promptCategory: "coding",
			projectName: "webapp",
			timestamps: claudeTs,
		}),
		expectedThemes: ["OAuth", "React", "authentication", "deployment", "debugging"],
		expectedActivityTypes: ["implementation", "debugging", "research"],
		expectedFocusRange: [0.4, 0.85],
		narrative: "A full-stack developer spent the day debugging a React authentication bug, implementing an OAuth PKCE flow, writing tests, and deploying to Vercel. They used Claude for coding help and browsed Hacker News during breaks.",
	};
}

// ── Persona 2: Research-Heavy Knowledge Worker ──────────

export function researchKnowledgeWorker(date?: Date): PersonaOutput {
	const config = defaultTimeConfig(date);
	const visitTs = generateTimeSeries(55, config);
	const searchTs = generateTimeSeries(12, config);
	const shellTs = generateTimeSeries(8, config);
	const claudeTs = generateTimeSeries(4, config);

	const domains = [
		...DOMAIN_SETS.research,
		...DOMAIN_SETS.webdev.slice(0, 2),
		...DOMAIN_SETS.work_tools.slice(0, 3),
	];

	return {
		name: "Research Knowledge Worker",
		description: "Exploring distributed systems → writing blog post → reviewing papers",
		visits: generateBrowserVisits({ count: 55, domains, timestamps: visitTs }),
		searches: generateSearchQueries({
			count: 12,
			queries: SEARCH_TEMPLATES.research,
			engines: ["google.com", "kagi.com"],
			timestamps: searchTs,
		}),
		shell: generateShellCommands({ count: 8, workflow: "writing", timestamps: shellTs }),
		claude: generateClaudeSessions({
			count: 4,
			promptCategory: "research",
			projectName: "blog",
			timestamps: claudeTs,
		}),
		expectedThemes: ["distributed systems", "consensus", "technical writing", "research"],
		expectedActivityTypes: ["research", "writing", "learning"],
		expectedFocusRange: [0.5, 0.95],
		narrative: "A knowledge worker spent the day deep-diving into distributed systems research, reading arXiv papers about consensus algorithms, writing a blog post about Raft vs Paxos, and using Claude for research summaries.",
	};
}

// ── Persona 3: Scattered Context-Switcher ───────────────

export function scatteredContextSwitcher(date?: Date): PersonaOutput {
	const config = defaultTimeConfig(date);
	const visitTs = generateTimeSeries(100, config);
	const searchTs = generateTimeSeries(15, config);
	const shellTs = generateTimeSeries(12, config);
	const claudeTs = generateTimeSeries(6, config);

	const domains = [
		...DOMAIN_SETS.communication,
		...DOMAIN_SETS.webdev.slice(0, 3),
		...DOMAIN_SETS.shopping,
		...DOMAIN_SETS.finance,
		...DOMAIN_SETS.news,
		...DOMAIN_SETS.social,
		...DOMAIN_SETS.media.slice(0, 2),
		...DOMAIN_SETS.personal,
	];

	const mixedQueries = [
		...SEARCH_TEMPLATES.webdev.slice(0, 3),
		...SEARCH_TEMPLATES.general,
		"weather this weekend",
		"best restaurants downtown",
		"netflix new releases june 2025",
		"python asyncio tutorial",
		"how to fix leaking faucet",
		"mortgage rate calculator 2025",
		"typescript monorepo structure",
		"healthy meal prep recipes",
	];

	return {
		name: "Scattered Context-Switcher",
		description: "Jumping between 5+ unrelated tasks all day",
		visits: generateBrowserVisits({ count: 100, domains, timestamps: visitTs }),
		searches: generateSearchQueries({
			count: 15,
			queries: mixedQueries,
			engines: ["google.com", "duckduckgo.com"],
			timestamps: searchTs,
		}),
		shell: generateShellCommands({ count: 12, workflow: "webdev", timestamps: shellTs }),
		claude: generateClaudeSessions({
			count: 6,
			promptCategory: "general",
			projectName: "various",
			timestamps: claudeTs,
		}),
		expectedThemes: ["email", "shopping", "coding", "news", "personal"],
		expectedActivityTypes: ["browsing", "communication", "admin", "implementation"],
		expectedFocusRange: [0.05, 0.4],
		narrative: "A scattered workday jumping between email triage, Jira tickets, Slack, Amazon shopping, banking, news, YouTube, Reddit, coding in short bursts, and personal errands. No sustained focus on any single task.",
	};
}

// ── Persona 4: DevOps/Infrastructure Day ────────────────

export function devopsInfrastructureDay(date?: Date): PersonaOutput {
	const config = defaultTimeConfig(date);
	const visitTs = generateTimeSeries(45, config);
	const searchTs = generateTimeSeries(8, config);
	const shellTs = generateTimeSeries(22, config);
	const claudeTs = generateTimeSeries(4, config);

	const domains = [
		...DOMAIN_SETS.devops,
		...DOMAIN_SETS.webdev.slice(0, 2),
		...DOMAIN_SETS.communication.slice(0, 2),
	];

	return {
		name: "DevOps Infrastructure Day",
		description: "Kubernetes troubleshooting → monitoring setup → incident response",
		visits: generateBrowserVisits({ count: 45, domains, timestamps: visitTs }),
		searches: generateSearchQueries({
			count: 8,
			queries: SEARCH_TEMPLATES.devops,
			engines: ["google.com"],
			timestamps: searchTs,
		}),
		shell: generateShellCommands({ count: 22, workflow: "devops", timestamps: shellTs }),
		claude: generateClaudeSessions({
			count: 4,
			promptCategory: "devops",
			projectName: "infrastructure",
			timestamps: claudeTs,
		}),
		expectedThemes: ["Kubernetes", "infrastructure", "monitoring", "DevOps"],
		expectedActivityTypes: ["infrastructure", "debugging", "implementation"],
		expectedFocusRange: [0.35, 0.75],
		narrative: "A DevOps engineer spent the day troubleshooting Kubernetes pod crashes, setting up Grafana monitoring dashboards, writing Terraform modules, and responding to a production incident via Slack and PagerDuty.",
	};
}

// ── Persona 5: Learning Day ─────────────────────────────

export function learningDay(date?: Date): PersonaOutput {
	const config = defaultTimeConfig(date);
	const visitTs = generateTimeSeries(60, config);
	const searchTs = generateTimeSeries(10, config);
	const shellTs = generateTimeSeries(15, config);
	const claudeTs = generateTimeSeries(6, config);

	const rustDomains: import("./generators").DomainSpec[] = [
		{ domain: "doc.rust-lang.org", titlePatterns: ["The Rust Programming Language - Ownership", "std::collections - Rust", "Traits: Defining Shared Behavior"], category: "dev", weight: 5 },
		{ domain: "crates.io", titlePatterns: ["serde - crates.io", "tokio - crates.io", "clap - crates.io"], category: "dev", weight: 3 },
		{ domain: "rust-lang.org", titlePatterns: ["Rust Programming Language", "Install Rust - Rust"], category: "dev", weight: 2 },
	];

	const domains = [
		...rustDomains,
		...DOMAIN_SETS.media.slice(0, 2),
		...DOMAIN_SETS.social.slice(0, 1),
		...DOMAIN_SETS.news.slice(0, 1),
	];

	const rustSearches = [
		"rust ownership borrowing explained",
		"rust vs go performance comparison",
		"rust async runtime tokio tutorial",
		"rust error handling best practices",
		"convert python to rust guide",
		"rust cargo workspace monorepo",
		"rust lifetime annotations explained",
		"serde json serialization rust",
		"rust trait object vs generic",
		"rust actix-web rest api tutorial",
	];

	const rustClaude = [
		"Explain ownership and borrowing in Rust. I'm coming from TypeScript — what's the mental model?",
		"Convert this Python function to Rust: def fibonacci(n): ...",
		"What's the difference between Box<dyn Trait> and impl Trait in Rust?",
		"Help me implement a basic HTTP server in Rust using actix-web",
		"Why does the Rust compiler reject this code? I'm getting a lifetime error.",
		"Explain the difference between String and &str in Rust with examples",
	];

	return {
		name: "Learning Day",
		description: "Exploring Rust → following tutorials → building first project",
		visits: generateBrowserVisits({ count: 60, domains, timestamps: visitTs }),
		searches: generateSearchQueries({
			count: 10,
			queries: rustSearches,
			engines: ["google.com", "kagi.com"],
			timestamps: searchTs,
		}),
		shell: generateShellCommands({ count: 15, workflow: "webdev", timestamps: shellTs }),
		claude: generateClaudeSessions({
			count: 6,
			promptCategory: "coding",
			projectName: "rust-learning",
			timestamps: claudeTs,
		}),
		expectedThemes: ["Rust", "learning", "systems programming", "ownership"],
		expectedActivityTypes: ["learning", "research", "implementation"],
		expectedFocusRange: [0.6, 0.98],
		narrative: "An engineer spent the entire day learning Rust: reading the Rust Book, exploring crates.io, watching tutorials, searching for explanations of ownership/borrowing, and using Claude to understand Rust concepts.",
	};
}

// ── Persona 6: Mixed Remote Work Day ────────────────────

export function mixedRemoteWorkDay(date?: Date): PersonaOutput {
	const config = defaultTimeConfig(date);
	const visitTs = generateTimeSeries(65, config);
	const searchTs = generateTimeSeries(6, config);
	const shellTs = generateTimeSeries(10, config);
	const claudeTs = generateTimeSeries(5, config);

	const domains = [
		...DOMAIN_SETS.communication,
		...DOMAIN_SETS.work_tools,
		...DOMAIN_SETS.webdev.slice(0, 3),
		...DOMAIN_SETS.media.slice(0, 1),
		...DOMAIN_SETS.social.slice(0, 2),
		...DOMAIN_SETS.news.slice(0, 1),
	];

	const workSearches = [
		"how to write effective code review feedback",
		"google docs design template",
		"figma auto-layout best practices",
		"confluence page templates engineering",
		"obsidian daily notes workflow",
		"remote work standup best practices",
	];

	return {
		name: "Mixed Remote Work Day",
		description: "Standup → code review → meetings → doc writing → 1:1s",
		visits: generateBrowserVisits({ count: 65, domains, timestamps: visitTs }),
		searches: generateSearchQueries({
			count: 6,
			queries: workSearches,
			engines: ["google.com"],
			timestamps: searchTs,
		}),
		shell: generateShellCommands({ count: 10, workflow: "webdev", timestamps: shellTs }),
		claude: generateClaudeSessions({
			count: 5,
			promptCategory: "general",
			projectName: "team-work",
			timestamps: claudeTs,
		}),
		expectedThemes: ["code review", "collaboration", "documentation", "meetings"],
		expectedActivityTypes: ["communication", "admin", "implementation", "writing"],
		expectedFocusRange: [0.2, 0.6],
		narrative: "A remote engineer's typical mixed day: morning standup, code reviews on GitHub, meetings on Zoom, writing a design doc in Google Docs, Figma review, 1:1 with manager, and winding down with social media and music.",
	};
}

// ── All Personas ────────────────────────────────────────

export const ALL_PERSONAS = [
	fullStackDeveloper,
	researchKnowledgeWorker,
	scatteredContextSwitcher,
	devopsInfrastructureDay,
	learningDay,
	mixedRemoteWorkDay,
];

export function generateAllPersonas(date?: Date): PersonaOutput[] {
	return ALL_PERSONAS.map((fn) => fn(date));
}
