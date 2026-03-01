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

export interface ClaudeSession {
	prompt: string;
	time: Date;
	project: string;
	/** true = first user message in this JSONL file (conversation opener) */
	isConversationOpener: boolean;
	/** JSONL filename — conversation identity boundary */
	conversationFile: string;
	/** Total user turns in this JSONL file — engagement signal */
	conversationTurnCount: number;
}

export interface GitCommit {
	hash: string;          // Full hash (40 chars)
	message: string;       // First line of commit message
	time: Date | null;     // Author date
	repo: string;          // Repo directory name (not full path)
	filesChanged: number;  // From numstat (total unique files changed)
	insertions: number;    // Lines added
	deletions: number;     // Lines removed
	/** File paths changed in this commit (from --numstat). */
	filePaths?: string[];
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

/** Normalize an LLM-generated theme string into a Dataview-safe kebab-case slug.
 *  Ensures the result is safe for YAML frontmatter values and Dataview inline field keys. */
export function sanitizeReflectionId(raw: string): string {
	return raw
		.toLowerCase()
		.replace(/['']/g, "")
		.replace(/[^a-z0-9-]+/g, "-")    // non-alphanumeric → hyphen (kebab-case)
		.replace(/^-+|-+$/g, "")          // trim leading/trailing hyphens
		.slice(0, 40)                     // bound length
		|| "reflection";                  // fallback if empty after sanitization
}

export interface AISummary {
	headline: string;
	tldr: string;
	themes: string[];
	/** Specific vault-linkable noun phrases → rendered as [[wikilinks]] in Obsidian */
	topics?: string[];
	/** Named tools, frameworks, services, APIs encountered today → [[wikilinks]] */
	entities?: string[];
	/** Topics that surfaced repeatedly today and most deserve their own permanent note */
	note_seeds?: string[];
	/** Narrative arc of the day's actual work: what was being built/solved, how it evolved, what was discovered */
	work_story?: string;
	/** 1-sentence characterization of the working mode: exploring, building, debugging, synthesizing, learning */
	mindset?: string;
	/** Concrete things the person learned or understood today that can be applied later */
	learnings?: string[];
	/** Specific things worth remembering for quick future recall: commands, configs, findings, resource names */
	remember?: string[];
	category_summaries: Record<string, string>;
	notable: string[];
	questions: string[];
	/** Structured reflections returned by the LLM: [{theme, text}] */
	reflections?: Array<{ theme: string; text: string }>;
	// De-identified meta-insights (Anthropic + patterns, or local unified prompt)
	meta_insights?: string[];       // cognitive pattern observations from aggregated data
	quirky_signals?: string[];      // unusual combos, contradictions, unformalized interests
	focus_narrative?: string;       // AI narrative about focus/fragmentation patterns
	/** Structured prompts with stable IDs for inline-field rendering */
	prompts?: ReflectionPrompt[];
	// Pipeline inspector: behavioral analysis fields (populated by cloud AI, rendered by renderer.ts)
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
	arc: {
		type: "chromium",
		userDataDirs: {
			darwin: "~/Library/Application Support/Arc/User Data",
		},
	},
	vivaldi: {
		type: "chromium",
		userDataDirs: {
			darwin: "~/Library/Application Support/Vivaldi",
			win32:  "%LOCALAPPDATA%/Vivaldi/User Data",
			linux:  "~/.config/vivaldi",
		},
	},
	opera: {
		type: "chromium",
		userDataDirs: {
			darwin: "~/Library/Application Support/com.operasoftware.Opera",
			win32:  "%APPDATA%/Opera Software/Opera Stable",
			linux:  "~/.config/opera",
		},
	},
	"opera-gx": {
		type: "chromium",
		userDataDirs: {
			darwin: "~/Library/Application Support/com.operasoftware.OperaGX",
			win32:  "%APPDATA%/Opera Software/Opera GX Stable",
			linux:  "~/.config/opera-gx",
		},
	},
	chromium: {
		type: "chromium",
		userDataDirs: {
			darwin: "~/Library/Application Support/Chromium",
			win32:  "%LOCALAPPDATA%/Chromium/User Data",
			linux:  "~/.config/chromium",
		},
	},
	helium: {
		type: "chromium",
		userDataDirs: {
			darwin: "~/Library/Application Support/net.imput.helium",
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
	"search.brave.com": "q",
	"ecosia.org": "q",
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

export interface SanitizeConfig {
	enabled: boolean;
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
	source: "browser" | "search" | "claude" | "git";
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
	| "tracker" | "auth"
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
	focusScore: number;          // 0.30-0.98 compressed (0 = empty input sentinel), higher = more focused day
	activityConcentrationScore: number; // 0.0-1.0 fraction of events in dominant activity type (1.0 = all one type; 0.25 = evenly spread across 4)
	topActivityTypes: { type: ActivityType; count: number; pct: number }[];
	peakHours: { hour: number; count: number }[];
	/** Git commit work units produced by the semantic extraction layer. */
	commitWorkUnits: CommitWorkUnit[];
	/** Claude task sessions produced by the semantic extraction layer. */
	claudeTaskSessions: ClaudeTaskSession[];
	/** Cross-source unified task sessions (stub: [] until fusion is implemented).
	 * Optional for backward compatibility with tests that construct PatternAnalysis directly. */
	unifiedTaskSessions?: UnifiedTaskSession[];
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
	type: "browser" | "search" | "claude" | "git";
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

// ── Article Clustering Types ─────────────────────────────

/**
 * A cluster of thematically related browser visits grouped by TF-IDF
 * cosine similarity within a session time window.
 *
 * Produced by `clusterArticles()` in `src/analyze/clusters.ts`.
 * Added to `KnowledgeSections.articleClusters` for rendering.
 */
export interface ArticleCluster {
	/** Top-3 TF-IDF terms joined by space — the emergent topic label. */
	label: string;
	/** Cleaned page titles of articles in this cluster. */
	articles: string[];
	/** Source browser visits (superset of articles, filtered to substantive). */
	visits: BrowserVisit[];
	/** Time range of the session: first and last visit timestamps. */
	timeRange: { start: Date; end: Date };
	/** Average engagement score across visits in this cluster. */
	engagementScore: number;
	/** Inferred reading intent based on domain diversity and revisit patterns. */
	intentSignal: "research" | "reference" | "implementation" | "browsing";
}

// ── Semantic Extraction Types ────────────────────────────

/**
 * Vocabulary-based intent type for Claude Code conversations.
 * Applied to the opener prompt (first user message in a JSONL file).
 * Moved here from src/filter/classify.ts so all modules can import it
 * without depending on the classify module.
 *
 *   - "implementation"  Add/Build/Create/Implement/Write — acceleration mode
 *   - "debugging"       Fix/Debug/Why does/not working/error — acceleration
 *   - "review"          Review/Check/Audit/Is this correct — acceleration
 *   - "learning"        Explain/Describe/What is/How does — exploration
 *   - "architecture"    Design/Plan/Should I/What approach — exploration
 */
export type ClaudeTaskType =
	| "implementation"
	| "debugging"
	| "review"
	| "learning"
	| "architecture";

/**
 * Developer intent derived from a parsed conventional commit.
 * Maps directly to the commit type prefix (feat/fix/refactor/…) or
 * is inferred from keyword patterns and change statistics.
 */
export type CommitWorkMode =
	| "building"       // feat: — adding capability
	| "debugging"      // fix: — repairing defect
	| "restructuring"  // refactor: — improving structure
	| "testing"        // test: — building confidence
	| "documenting"    // docs: — codifying knowledge
	| "infrastructure" // chore:/build:/ci: — maintenance metabolism
	| "optimizing"     // perf: — improving efficiency
	| "reverting"      // revert: — regression indicator
	| "tweaking";      // generic/WIP/small — low-signal

/**
 * A conventional commit message parsed into its component fields.
 * Non-conventional commits use the keyword fallback paths.
 */
export interface ParsedCommit {
	/** Conventional type: "feat", "fix", "refactor", etc. May be empty string. */
	type: string;
	/** Scope field (e.g. "render", "summarize"). null when absent. */
	scope: string | null;
	/** True when the commit has a breaking-change marker (!). */
	breaking: boolean;
	/** The description portion after the prefix and colon. */
	description: string;
	/** The original unmodified commit message. */
	raw: string;
}

/**
 * A coherent grouping of git commits representing one logical work unit —
 * e.g., "Feature work: hybrid prose prompts" or "obsidian-claude-daily: debugging".
 *
 * Produced by `groupCommitsIntoWorkUnits()` in `src/analyze/commits.ts`.
 */
export interface CommitWorkUnit {
	/** Human-readable label derived from scope, repo, or dominant noun phrase. */
	label: string;
	/** Developer intent classification for this unit. */
	workMode: CommitWorkMode;
	/** All commits belonging to this work unit. */
	commits: GitCommit[];
	/** Repos involved (usually one). */
	repos: string[];
	/** Earliest and latest commit times in this unit. */
	timeRange: { start: Date; end: Date };
	/** True when at least one commit message contains a "why" clause. */
	hasWhyInformation: boolean;
	/** Extracted "because X" / "so that Y" text from the commit messages. */
	whyClause: string | null;
	/** True when all commits in this unit have generic/WIP/low-signal messages. */
	isGeneric: boolean;
}

/**
 * A single Claude Code conversation grouped into a higher-level task.
 * Corresponds to one JSONL file (conversation identity boundary).
 *
 * Produced by `groupClaudeSessionsIntoTasks()` in `src/analyze/task-sessions.ts`.
 */
export interface ClaudeTaskSession {
	/** Extracted from the opener prompt by `extractTaskTitle()`. */
	taskTitle: string;
	/** Verb-pattern-classified intent for the opener prompt. */
	taskType: ClaudeTaskType;
	/** Vocabulary-matched topic cluster (e.g. "typescript", "testing"). */
	topicCluster: string;
	/** All ClaudeSession turns in this conversation. */
	prompts: ClaudeSession[];
	/** First and last prompt timestamps. */
	timeRange: { start: Date; end: Date };
	/** Project name from the JSONL path (directory above the file). */
	project: string;
	/** The JSONL filename used as the conversation identity key. */
	conversationFile: string;
	/** Total user turn count in this conversation. */
	turnCount: number;
	/** Whether this is predominantly acceleration (building) or exploration (learning). */
	interactionMode: "acceleration" | "exploration";
	/** True when turnCount >= 5 on a learning or architecture task. */
	isDeepLearning: boolean;
}

/**
 * A chain of related search queries within a short time window,
 * representing a single information-seeking mission.
 *
 * Produced by `detectSearchMissions()` in `src/analyze/task-sessions.ts`.
 */
export interface SearchMission {
	/** Label derived from the first (most general) query in the chain. */
	label: string;
	/** All queries that form this mission chain. */
	queries: SearchQuery[];
	/** Browser visits that occurred within the mission time window. */
	visits: BrowserVisit[];
	/** Start of first query to end of last visit in the mission window. */
	timeRange: { start: Date; end: Date };
	/** Broder intent type of the opening query. */
	intentType: "navigational" | "informational" | "transactional";
}

/**
 * A cross-source task session: one logical unit of work synthesized from
 * browser reading, git commits, Claude conversations, and search missions
 * that overlapped in time and topic.
 *
 * Produced by `fuseCrossSourceSessions()` in `src/analyze/task-sessions.ts`.
 */
export interface UnifiedTaskSession {
	/** Human-readable label — most common topic across all contributing sources. */
	label: string;
	/** Overall time range spanning all contributing work units. */
	timeRange: { start: Date; end: Date };
	/** Article clusters (browser reading) that contributed to this session. */
	browserClusters: ArticleCluster[];
	/** Git commit work units that contributed to this session. */
	commitWorkUnits: CommitWorkUnit[];
	/** Claude task sessions that contributed to this session. */
	claudeTaskSessions: ClaudeTaskSession[];
	/** Search missions that contributed to this session. */
	searchMissions: SearchMission[];
	/** Ordered lifecycle stages inferred from source type ordering. */
	lifecycle: Array<"research" | "implementation" | "debugging" | "commit">;
	/** Most common topic string across all contributing sources. */
	primaryTopic: string;
	/** Outcome inferred from whether commits are present and task type. */
	outcome: "committed" | "in-progress" | "abandoned" | "learning-only";
}
