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

export interface GitCommit {
	hash: string;          // Full hash (40 chars)
	message: string;       // First line of commit message
	time: Date | null;     // Author date
	repo: string;          // Repo directory name (not full path)
	filesChanged: number;  // From --shortstat
	insertions: number;    // Lines added
	deletions: number;     // Lines removed
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
	/** Observed behavioral patterns, e.g. 'deep 2h focus block on auth', '4 context switches' */
	work_patterns?: string[];
	/** Cross-source narrative connections, e.g. 'Searched OAuth, then committed auth middleware' */
	cross_source_connections?: string[];
}

// ── Browser Profile Types ────────────────────────────────

/**
 * A single browser profile detected on disk.
 * Contains only what's needed for display and collection — no credentials,
 * no cookies, no encrypted fields, no account email addresses.
 */
export interface DetectedProfile {
	/** Directory name on disk: "Default", "Profile 1", "Profile 2", etc. */
	profileDir: string;
	/**
	 * Human-readable label for the UI.
	 * Chromium: read from Local State → profile.info_cache[dir].name only.
	 * Firefox: read from profiles.ini → Name= field only.
	 * Falls back to profileDir if the display name can't be determined.
	 */
	displayName: string;
	/** Absolute, fully-resolved path to the History (or places.sqlite) file. */
	historyPath: string;
	/** Whether the History file exists and is readable right now. */
	hasHistory: boolean;
}

/**
 * Settings record for a single installed browser.
 * Stored in settings.browserConfigs[].
 */
export interface BrowserInstallConfig {
	/** Browser identifier: "chrome" | "brave" | "edge" | "firefox" | "safari" */
	browserId: string;
	/** Master toggle — when false, this browser is entirely skipped. */
	enabled: boolean;
	/** All profiles detected on the last scan. */
	profiles: DetectedProfile[];
	/** profileDir values the user has opted in to collect. */
	selectedProfiles: string[];
}

/**
 * Internal config used by browser-profiles.ts for per-OS path resolution.
 * Not stored in settings — only used during detection.
 */
export interface BrowserPathConfig {
	/** Browser type determines which SQLite schema to query. */
	type: "chromium" | "firefox" | "safari";
	/** Per-OS base directories for the User Data folder (Chromium) or profiles dir (Firefox). */
	userDataDirs: Partial<Record<"darwin" | "win32" | "linux", string>>;
}

/**
 * Per-OS User Data base directories for each supported browser.
 * Used exclusively by browser-profiles.ts during profile detection.
 * Paths use ~/ and %LOCALAPPDATA% prefixes — resolved at runtime by expandHome().
 */
export const BROWSER_PATH_CONFIGS: Record<string, BrowserPathConfig> = {
	chrome: {
		type: "chromium",
		userDataDirs: {
			darwin: "~/Library/Application Support/Google/Chrome",
			win32:  "%LOCALAPPDATA%/Google/Chrome/User Data",
			linux:  "~/.config/google-chrome",
		},
	},
	brave: {
		type: "chromium",
		userDataDirs: {
			darwin: "~/Library/Application Support/BraveSoftware/Brave-Browser",
			win32:  "%LOCALAPPDATA%/BraveSoftware/Brave-Browser/User Data",
			linux:  "~/.config/BraveSoftware/Brave-Browser",
		},
	},
	edge: {
		type: "chromium",
		userDataDirs: {
			darwin: "~/Library/Application Support/Microsoft Edge",
			win32:  "%LOCALAPPDATA%/Microsoft/Edge/User Data",
			linux:  "~/.config/microsoft-edge",
		},
	},
	firefox: {
		type: "firefox",
		userDataDirs: {
			darwin: "~/Library/Application Support/Firefox",
			win32:  "%APPDATA%/Mozilla/Firefox",
			linux:  "~/.mozilla/firefox",
		},
	},
	safari: {
		type: "safari",
		userDataDirs: {
			darwin: "~/Library/Safari",
		},
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
	source: "browser" | "search" | "shell" | "claude" | "git";
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
	type: "browser" | "search" | "shell" | "claude" | "git";
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
