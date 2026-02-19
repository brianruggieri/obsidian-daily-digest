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

export interface AISummary {
	headline: string;
	tldr: string;
	themes: string[];
	category_summaries: Record<string, string>;
	notable: string[];
	questions: string[];
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

// ── Sanitization Types ───────────────────────────────────

export type SanitizationLevel = "standard" | "aggressive";

export interface SanitizeConfig {
	enabled: boolean;
	level: SanitizationLevel;
	excludedDomains: string[];
	redactPaths: boolean;
	scrubEmails: boolean;
}

// ── Classification Types (Phase 2) ──────────────────────

export type ActivityType =
	| "research" | "debugging" | "implementation" | "infrastructure"
	| "writing" | "learning" | "admin" | "communication"
	| "browsing" | "planning" | "unknown";

export type IntentType =
	| "compare" | "implement" | "evaluate" | "read" | "troubleshoot"
	| "configure" | "explore" | "communicate" | "unknown";

export interface StructuredEvent {
	timestamp: string;
	source: "browser" | "search" | "shell" | "claude";
	activityType: ActivityType;
	topics: string[];
	entities: string[];
	intent: IntentType;
	confidence: number;
	category?: string;
	summary: string;
}

export interface ClassificationResult {
	events: StructuredEvent[];
	totalProcessed: number;
	llmClassified: number;
	ruleClassified: number;
	processingTimeMs: number;
}

export interface ClassificationConfig {
	enabled: boolean;
	endpoint: string;
	model: string;
	batchSize: number;
}

// ── RAG Types ───────────────────────────────────────────

export interface ActivityChunk {
	id: string;
	date: string;
	type: "browser" | "search" | "shell" | "claude";
	category?: string;
	text: string;
	metadata: {
		itemCount: number;
		domains?: string[];
		projects?: string[];
		timeRange?: { start: string; end: string };
	};
	embedding?: number[];
}

export interface EmbeddedChunk extends ActivityChunk {
	embedding: number[];
}

export interface RAGConfig {
	enabled: boolean;
	embeddingEndpoint: string;
	embeddingModel: string;
	topK: number;
	minChunkTokens: number;
	maxChunkTokens: number;
}
