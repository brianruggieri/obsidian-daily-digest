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
	// Phase 4: De-identified meta-insights (Anthropic only, patterns required)
	meta_insights?: string[];       // cognitive pattern observations from aggregated data
	quirky_signals?: string[];      // unusual combos, contradictions, unformalized interests
	focus_narrative?: string;       // AI narrative about focus/fragmentation patterns
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

// Browser history paths by OS. The `history` field is only used for Chromium browsers;
// Firefox and Safari resolve their paths at runtime via OS detection.
export const BROWSER_PATHS: Record<string, Record<string, BrowserConfig>> = {
	chrome: {
		darwin: { history: "~/Library/Application Support/Google/Chrome/Default/History", type: "chromium" },
		win32:  { history: "%LOCALAPPDATA%/Google/Chrome/User Data/Default/History", type: "chromium" },
		linux:  { history: "~/.config/google-chrome/Default/History", type: "chromium" },
	},
	brave: {
		darwin: { history: "~/Library/Application Support/BraveSoftware/Brave-Browser/Default/History", type: "chromium" },
		win32:  { history: "%LOCALAPPDATA%/BraveSoftware/Brave-Browser/User Data/Default/History", type: "chromium" },
		linux:  { history: "~/.config/BraveSoftware/Brave-Browser/Default/History", type: "chromium" },
	},
	edge: {
		darwin: { history: "~/Library/Application Support/Microsoft Edge/Default/History", type: "chromium" },
		win32:  { history: "%LOCALAPPDATA%/Microsoft/Edge/User Data/Default/History", type: "chromium" },
		linux:  { history: "~/.config/microsoft-edge/Default/History", type: "chromium" },
	},
	firefox: {
		darwin: { history: "", type: "firefox" },
		win32:  { history: "", type: "firefox" },
		linux:  { history: "", type: "firefox" },
	},
	safari: {
		darwin: { history: "~/Library/Safari/History.db", type: "safari" },
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

// ── Sensitivity Filter Types ────────────────────────────

export type SensitivityCategory =
	| "adult" | "gambling" | "dating" | "health"
	| "finance" | "drugs" | "weapons" | "piracy"
	| "vpn_proxy" | "job_search" | "social_personal"
	| "custom";

export interface SensitivityConfig {
	enabled: boolean;
	categories: SensitivityCategory[];
	customDomains: string[];
	action: "exclude" | "redact";
}

export interface SensitivityFilterResult {
	kept: BrowserVisit[];
	filtered: number;
	byCategory: Record<string, number>;
}

// ── Pattern Extraction Types (Phase 3) ──────────────────

export interface TemporalCluster {
	hourStart: number;           // 0-23
	hourEnd: number;             // 0-23
	activityType: ActivityType;
	eventCount: number;
	topics: string[];
	entities: string[];
	intensity: number;           // events per hour in this cluster
	label: string;               // e.g. "debugging spike 2-4pm"
}

export interface TopicCooccurrence {
	topicA: string;
	topicB: string;
	strength: number;            // 0.0-1.0 normalized
	sharedEvents: number;
	window: string;              // time window label
}

export interface EntityRelation {
	entityA: string;
	entityB: string;
	cooccurrences: number;
	contexts: string[];          // activity types where they co-occur
}

export interface RecurrenceSignal {
	topic: string;
	frequency: number;           // appearances in time window
	trend: "rising" | "stable" | "declining" | "new" | "returning";
	firstSeen?: string;          // ISO date
	lastSeen?: string;           // ISO date
	dayCount: number;            // number of days topic appeared
}

export interface KnowledgeDelta {
	newTopics: string[];         // topics not seen in vault
	recurringTopics: string[];   // topics that match existing vault tags/notes
	novelEntities: string[];     // entities not previously encountered
	connections: string[];       // cross-topic connections discovered today
}

export interface PatternAnalysis {
	temporalClusters: TemporalCluster[];
	topicCooccurrences: TopicCooccurrence[];
	entityRelations: EntityRelation[];
	recurrenceSignals: RecurrenceSignal[];
	knowledgeDelta: KnowledgeDelta;
	focusScore: number;          // 0.0-1.0, higher = more focused day
	topActivityTypes: { type: ActivityType; count: number; pct: number }[];
	peakHours: { hour: number; count: number }[];
}

export interface PatternConfig {
	enabled: boolean;
	cooccurrenceWindow: number;  // minutes for co-occurrence grouping
	minClusterSize: number;      // minimum events to form a temporal cluster
	trackRecurrence: boolean;    // persist topic history for recurrence detection
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
