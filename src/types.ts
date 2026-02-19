export interface BrowserVisit {
	url: string;
	title: string;
	time: Date | null;
	visitCount?: number;
	domain?: string;
}

export interface SearchQuery {
	query: string;
	time: Date | null;
	engine: string;
}

export interface ShellCommand {
	cmd: string;
	time: Date | null;
}

export interface ClaudeSession {
	prompt: string;
	time: Date;
	project: string;
}

export type CategorizedVisits = Record<string, BrowserVisit[]>;

export interface ReflectionPrompt {
	id: string;
	question: string;
}

/** Turn a question string into a stable, Dataview-friendly field name. */
export function slugifyQuestion(question: string): string {
	return question
		.toLowerCase()
		.replace(/['']/g, "")             // remove apostrophes
		.replace(/[^a-z0-9]+/g, "_")      // non-alphanumeric → underscore
		.replace(/^_+|_+$/g, "")          // trim leading/trailing underscores
		.slice(0, 60);                     // keep it reasonable
}

export interface AISummary {
	headline: string;
	tldr: string;
	themes: string[];
	category_summaries: Record<string, string>;
	notable: string[];
	questions: string[];
	/** Structured prompts with stable IDs for inline-field rendering */
	prompts?: ReflectionPrompt[];
}

export interface CollectedData {
	visits: BrowserVisit[];
	searches: SearchQuery[];
	shellCommands: ShellCommand[];
	claudeSessions: ClaudeSession[];
	categorized: CategorizedVisits;
	aiSummary: AISummary | null;
}

export interface BrowserConfig {
	history: string;
	type: "chromium" | "firefox" | "safari";
}

export const BROWSER_PATHS: Record<string, BrowserConfig> = {
	chrome: {
		history: "~/Library/Application Support/Google/Chrome/Default/History",
		type: "chromium",
	},
	brave: {
		history: "~/Library/Application Support/BraveSoftware/Brave-Browser/Default/History",
		type: "chromium",
	},
	edge: {
		history: "~/Library/Application Support/Microsoft Edge/Default/History",
		type: "chromium",
	},
	firefox: {
		history: "~/Library/Application Support/Firefox/Profiles",
		type: "firefox",
	},
	safari: {
		history: "~/Library/Safari/History.db",
		type: "safari",
	},
};

export const SEARCH_ENGINES: Record<string, string> = {
	"google.com": "q",
	"bing.com": "q",
	"duckduckgo.com": "q",
	"search.yahoo.com": "p",
	"kagi.com": "q",
	"perplexity.ai": "q",
};

export const EXCLUDE_DOMAINS = new Set([
	"google.com/complete",
	"google.com/gen_204",
	"accounts.google.com",
	"doubleclick.net",
	"localhost",
	"127.0.0.1",
]);
