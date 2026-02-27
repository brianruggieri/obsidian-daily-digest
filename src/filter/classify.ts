import {
	ActivityType,
	IntentType,
	StructuredEvent,
	ClassificationResult,
	ClassificationConfig,
	BrowserVisit,
	SearchQuery,
	ClaudeSession,
	GitCommit,
	CategorizedVisits,
} from "../types";
import { callLocal } from "../summarize/ai-client";
import { categorizeDomain } from "./categorize";
import * as log from "../plugin/log";

// ── Entity Extraction Constants ─────────────────────────

/**
 * Domains for which entity extraction produces only noise (maps, travel,
 * booking, email, shopping). Any browser event whose metadata.domain matches
 * one of these values will return [] from extractEntities immediately.
 */
export const ENTITY_EXTRACTION_SKIP_DOMAINS = new Set([
	"google.com",           // maps, search results, account pages
	"maps.google.com",
	"maps.apple.com",
	"airbnb.com",           // trip/reservation titles are always noisy
	"booking.com",
	"vrbo.com",
	"expedia.com",
	"tripadvisor.com",
	"mail.google.com",      // email subject lines
	"outlook.live.com",
	"outlook.office.com",
	"mail.yahoo.com",
	"amazon.com",           // product titles are noun soup
	"adobe.com",            // Creative Cloud titles add no signal
	"app.hubspot.com",      // CRM record pages
	"app.salesforce.com",
]);

/**
 * Words that pass the length > 2 and capitalized-word checks in extractEntities
 * but carry no domain-specific knowledge value. Includes common English words,
 * git commit imperative verbs, email/notification noise, navigation/UI chrome
 * words, and generic tech acronyms.
 */
export const ENTITY_STOPWORDS = new Set([
	// Existing entries
	"The", "This", "That", "How", "What", "Why", "When",
	// Common English that pass the length check but carry no specificity
	"From", "With", "Here", "There", "Your", "About", "After", "Before",
	"Into", "Over", "Just", "Also", "More", "Some", "Such", "Each",
	// Git commit imperative verbs
	"Fix", "Add", "Remove", "Update", "Refactor", "Revert", "Merge", "Bump",
	"Move", "Rename", "Delete", "Change", "Enable", "Disable", "Clean",
	"Init", "Create", "Build", "Test", "Deploy", "Release", "Improve",
	"Handle", "Pull", "Push", "Commit", "Branch", "Issue", "Draft",
	"Review", "Resolve", "Conflict", "Sync",
	// Email/notification noise
	"Inbox", "Unread", "Reply", "Forward", "Sent", "Subject", "Thread",
	"Notification", "Alert",
	// Navigation/UI chrome words in page titles
	"Home", "Settings", "Profile", "Dashboard", "Overview", "Summary",
	"Details", "Results", "Loading", "Untitled",
	// Generic tech acronyms (no knowledge value as entities)
	"HTML", "CSS", "API", "URL", "SDK", "CLI", "GUI", "IDE",
]);

// ── Raw Event Normalization ─────────────────────────────

interface RawEvent {
	timestamp: string;
	source: "browser" | "search" | "claude" | "git";
	text: string;
	category?: string;
	metadata?: Record<string, string>;
}

function normalizeBrowserVisits(
	visits: BrowserVisit[],
	categorized: CategorizedVisits
): RawEvent[] {
	// Build a domain→category lookup from the categorized map
	const domainCatMap: Record<string, string> = {};
	for (const [cat, catVisits] of Object.entries(categorized)) {
		for (const v of catVisits) {
			if (v.domain) domainCatMap[v.domain] = cat;
		}
	}

	return visits.map((v) => {
		let domain = "";
		try {
			domain = new URL(v.url).hostname.replace(/^www\./, "");
		} catch {
			// ignore
		}
		const cat = domainCatMap[domain] || categorizeDomain(domain);
		const title = (v.title || "").slice(0, 80);
		return {
			timestamp: v.time ? v.time.toISOString() : "",
			source: "browser" as const,
			text: `${domain} - ${title}`,
			category: cat,
			metadata: { domain },
		};
	});
}

function normalizeSearchQueries(searches: SearchQuery[]): RawEvent[] {
	return searches.map((s) => ({
		timestamp: s.time ? s.time.toISOString() : "",
		source: "search" as const,
		text: `"${s.query}" (${s.engine})`,
		metadata: { engine: s.engine },
	}));
}

function normalizeClaudeSessions(sessions: ClaudeSession[]): RawEvent[] {
	return sessions.map((s) => ({
		timestamp: s.time ? s.time.toISOString() : "",
		source: "claude" as const,
		text: s.prompt.slice(0, 150),
		metadata: { project: s.project },
	}));
}

function normalizeGitCommits(commits: GitCommit[]): RawEvent[] {
	return commits.map((c) => ({
		timestamp: c.time ? c.time.toISOString() : "",
		source: "git" as const,
		text: `${c.repo}: ${c.message} (+${c.insertions}/-${c.deletions})`,
		metadata: { repo: c.repo },
	}));
}

// ── Claude Task Classification ──────────────────────────

/**
 * Vocabulary-based intent type for Claude Code conversations.
 * Applied to the opener prompt (first user message in a JSONL file).
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
 * Ordered decision tree: first matching pattern wins.
 * Applied to the opener prompt text (up to 200 chars).
 */
const CLAUDE_TASK_TYPE_PATTERNS: [RegExp, ClaudeTaskType][] = [
	[/\b(fix|debug|why\s+(does|is|isn'?t)|not\s+work|error|crash|bug|broken|fail)\b/i, "debugging"],
	[/\b(review|check|audit|is\s+this\s+(correct|right|good)|critique|look\s+at)\b/i, "review"],
	[/\b(explain|describe|what\s+is|what\s+are|how\s+does|help\s+me\s+understand|teach|clarify)\b/i, "learning"],
	[/\b(design|plan|should\s+i|what\s+approach|architecture|structure|how\s+should\s+i\s+(design|structure|organize))\b/i, "architecture"],
	[/\b(add|build|create|implement|write|refactor|update|generate|set\s+up|migrate)\b/i, "implementation"],
];

/**
 * Classifies a Claude prompt into a ClaudeTaskType using verb-based pattern matching.
 * Defaults to "implementation" when no pattern matches.
 */
export function classifyClaudeTaskType(prompt: string): ClaudeTaskType {
	const text = prompt.slice(0, 200);
	for (const [pattern, taskType] of CLAUDE_TASK_TYPE_PATTERNS) {
		if (pattern.test(text)) return taskType;
	}
	return "implementation";
}

/**
 * Vocabulary-based topic clusters for Claude prompts.
 * Each entry is [pattern, topicLabel]. First match wins.
 * Covers 15 common software development topic domains.
 */
export const CLAUDE_TOPIC_VOCABULARY: [RegExp, string][] = [
	[/\b(oauth|auth|jwt|token|session|login|password|credential|permission|role|access)\b/i, "authentication"],
	[/\b(react|vue|angular|svelte|next\.?js|remix|component|hook|state|props|jsx|tsx)\b/i, "frontend"],
	[/\b(api|rest|graphql|endpoint|route|http|request|response|fetch|axios|webhook)\b/i, "api-design"],
	[/\b(docker|kubernetes|k8s|terraform|aws|cloud|deploy|ci|cd|pipeline|helm|ecs)\b/i, "infrastructure"],
	[/\b(test|spec|mock|vitest|jest|coverage|unit|integration|e2e|assert|expect)\b/i, "testing"],
	[/\b(sql|database|postgres|mysql|sqlite|query|schema|migration|index|orm|prisma)\b/i, "database"],
	[/\b(typescript|type|interface|generic|infer|narrowing|zod|validation)\b/i, "typescript"],
	[/\b(performance|optimize|slow|latency|memory|cache|cdn|bundle|profil)\b/i, "performance"],
	[/\b(security|vuln|xss|csrf|injection|sanitize|escape|encrypt|hash)\b/i, "security"],
	[/\b(git|commit|branch|merge|rebase|conflict|pr|pull\s+request|review)\b/i, "version-control"],
	[/\b(algorithm|data\s+structure|complexity|sort|search|tree|graph|dynamic\s+programming)\b/i, "algorithms"],
	[/\b(machine\s+learning|llm|ai|model|embedding|vector|neural|gpt|claude|anthropic)\b/i, "ai-ml"],
	[/\b(refactor|clean|solid|pattern|architecture|design|monolith|microservice|domain)\b/i, "software-design"],
	[/\b(error|exception|crash|stack\s+trace|debug|log|monitor|alert|incident)\b/i, "debugging"],
	[/\b(doc|readme|comment|jsdoc|api\s+spec|openapi|swagger|markdown)\b/i, "documentation"],
];

/**
 * Extracts a topic cluster label from a Claude prompt using CLAUDE_TOPIC_VOCABULARY.
 * Falls back to extracting the first 3 meaningful words when no vocabulary match is found.
 */
function extractClaudeTopics(text: string): string[] {
	for (const [pattern, label] of CLAUDE_TOPIC_VOCABULARY) {
		if (pattern.test(text)) return [label];
	}
	// Fallback: first 3 meaningful words
	const words = text
		.replace(/[^\w\s-]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 3)
		.slice(0, 3);
	return words.length > 0 ? [words.join(" ")] : [];
}

// ── Rule-Based Fallback Classification ──────────────────

const CATEGORY_TO_ACTIVITY: Record<string, ActivityType> = {
	dev: "implementation",
	work: "admin",
	research: "research",
	news: "browsing",
	social: "communication",
	media: "browsing",
	shopping: "browsing",
	finance: "admin",
	ai_tools: "implementation",
	personal: "browsing",
	education: "learning",
	gaming: "browsing",
	writing: "writing",
	pkm: "writing",
	other: "unknown",
};

const SEARCH_INTENT_PATTERNS: [RegExp, IntentType][] = [
	[/\bvs\b|\bcompare\b|\bdifference\b|\bversus\b|\balternative/i, "compare"],
	[/\bhow\s+to\b|\bexample\b|\btutorial\b|\bguide\b/i, "implement"],
	[/\bbest\b|\breview\b|\brecommend\b|\bpros\b|\bcons\b/i, "evaluate"],
	[/\bwhat\s+is\b|\bwho\s+is\b|\bdefin/i, "read"],
	[/\berror\b|\bfix\b|\bdebug\b|\bnot\s+work/i, "troubleshoot"],
	[/\bconfig\b|\bsetup\b|\binstall\b|\benable\b|\bconfigure\b/i, "configure"],
];

function inferIntent(text: string, source: string): IntentType {
	if (source === "search" || source === "browser") {
		for (const [pattern, intent] of SEARCH_INTENT_PATTERNS) {
			if (pattern.test(text)) return intent;
		}
	}
	if (source === "claude") return "implement";
	if (source === "git") return "implement";
	return "explore";
}

export function extractEntities(text: string, domain?: string): string[] {
	// Skip noisy domains entirely — maps, booking, email, shopping
	if (domain && ENTITY_EXTRACTION_SKIP_DOMAINS.has(domain)) {
		return [];
	}

	const entities: string[] = [];

	// Extract domain as entity for browser events
	if (domain) {
		const baseDomain = domain.replace(/\.\w{2,4}$/, "").split(".").pop() || "";
		if (baseDomain.length > 2) {
			entities.push(baseDomain.charAt(0).toUpperCase() + baseDomain.slice(1));
		}
	}

	// Extract capitalized words that look like tool/library names
	const capWords = text.match(/\b[A-Z][a-zA-Z0-9]+(?:\.[a-zA-Z]+)?\b/g) || [];
	for (const word of capWords) {
		if (word.length > 2 && !ENTITY_STOPWORDS.has(word)) {
			if (!entities.includes(word)) entities.push(word);
		}
	}

	// Extract common tool patterns: word-word (kebab-case tools like llama-cpp)
	const kebabTools = text.match(/\b[a-z]+-[a-z]+(?:-[a-z]+)?\b/g) || [];
	for (const tool of kebabTools) {
		if (tool.length > 4 && !entities.includes(tool)) {
			entities.push(tool);
		}
	}

	return entities.slice(0, 5);
}

function ruleBasedClassify(event: RawEvent): StructuredEvent {
	let activityType: ActivityType = "unknown";
	let topics: string[];

	if (event.source === "browser") {
		activityType = CATEGORY_TO_ACTIVITY[event.category || "other"] || "unknown";
		// Simple topic extraction: first 3 meaningful words
		const words = event.text
			.replace(/[^\w\s-]/g, " ")
			.split(/\s+/)
			.filter((w) => w.length > 3)
			.slice(0, 3);
		topics = words.length > 0 ? [words.join(" ")] : [];
	} else if (event.source === "search") {
		activityType = "research";
		// Simple topic extraction: first 3 meaningful words
		const words = event.text
			.replace(/[^\w\s-]/g, " ")
			.split(/\s+/)
			.filter((w) => w.length > 3)
			.slice(0, 3);
		topics = words.length > 0 ? [words.join(" ")] : [];
	} else if (event.source === "claude") {
		// Vocabulary-based classification replaces unconditional "implementation"
		const taskType = classifyClaudeTaskType(event.text);
		// Map ClaudeTaskType → ActivityType
		const claudeActivityMap: Record<ClaudeTaskType, ActivityType> = {
			implementation: "implementation",
			debugging: "debugging",
			review: "implementation",
			learning: "learning",
			architecture: "planning",
		};
		activityType = claudeActivityMap[taskType];
		// Vocabulary-based topic extraction replaces "first 3 words" heuristic
		topics = extractClaudeTopics(event.text);
	} else if (event.source === "git") {
		activityType = "implementation";
		// Simple topic extraction: first 3 meaningful words
		const words = event.text
			.replace(/[^\w\s-]/g, " ")
			.split(/\s+/)
			.filter((w) => w.length > 3)
			.slice(0, 3);
		topics = words.length > 0 ? [words.join(" ")] : [];
	} else {
		// Simple topic extraction: first 3 meaningful words
		const words = event.text
			.replace(/[^\w\s-]/g, " ")
			.split(/\s+/)
			.filter((w) => w.length > 3)
			.slice(0, 3);
		topics = words.length > 0 ? [words.join(" ")] : [];
	}

	const intent = inferIntent(event.text, event.source);
	const entities = extractEntities(event.text, event.metadata?.domain);

	return {
		timestamp: event.timestamp,
		source: event.source,
		activityType,
		topics,
		entities,
		intent,
		confidence: 0.3,
		category: event.category,
		summary: event.text.slice(0, 100),
	};
}

// ── LLM Classification ─────────────────────────────────

const VALID_ACTIVITY_TYPES = new Set<ActivityType>([
	"research", "debugging", "implementation", "infrastructure",
	"writing", "learning", "admin", "communication",
	"browsing", "planning", "unknown",
]);

const VALID_INTENT_TYPES = new Set<IntentType>([
	"compare", "implement", "evaluate", "read", "troubleshoot",
	"configure", "explore", "communicate", "unknown",
]);

function buildClassificationPrompt(batch: RawEvent[]): string {
	const lines = batch.map((e, i) =>
		`${i + 1}. [${e.source}] ${e.text}${e.category ? ` (${e.category})` : ""}`
	).join("\n");

	return `Classify each activity. For each determine:
- activityType: research|debugging|implementation|infrastructure|writing|learning|admin|communication|browsing|planning
- topics: 1-3 noun phrases describing what the activity is about
- entities: tools, libraries, companies, or technologies mentioned
- intent: compare|implement|evaluate|read|troubleshoot|configure|explore|communicate
- confidence: 0.0-1.0 how confident you are in the classification
- summary: one sentence describing the activity, no raw URLs or file paths

Activities:
${lines}

Return ONLY a JSON array (no markdown fences, no preamble). Each element must have: activityType, topics, entities, intent, confidence, summary.
Example: [{"activityType":"research","topics":["OAuth flows"],"entities":["GitHub"],"intent":"evaluate","confidence":0.8,"summary":"Researching OAuth authentication flows for GitHub integration"}]`;
}

interface LLMClassification {
	activityType: string;
	topics: string[];
	entities: string[];
	intent: string;
	confidence: number;
	summary: string;
}

function validateClassification(raw: LLMClassification): boolean {
	if (!raw || typeof raw !== "object") return false;
	if (!raw.activityType || typeof raw.activityType !== "string") return false;
	if (!Array.isArray(raw.topics)) return false;
	if (!Array.isArray(raw.entities)) return false;
	return true;
}

function parseLLMResponse(
	responseText: string,
	batchSize: number
): (LLMClassification | null)[] {
	// Strip markdown fences if present
	const cleaned = responseText
		.replace(/^```json?\s*/m, "")
		.replace(/\s*```$/m, "")
		.trim();

	try {
		const parsed = JSON.parse(cleaned);
		if (Array.isArray(parsed)) {
			return parsed.map((item: unknown) => {
				const c = item as LLMClassification;
				return validateClassification(c) ? c : null;
			});
		}
		// Single object response for single-item batch
		if (typeof parsed === "object" && validateClassification(parsed as LLMClassification)) {
			return [parsed as LLMClassification];
		}
		return new Array(batchSize).fill(null);
	} catch (e) {
		log.warn("LLM classification batch failed, falling back to rules:", e);
		return new Array(batchSize).fill(null);
	}
}

function llmToStructuredEvent(
	raw: RawEvent,
	classification: LLMClassification
): StructuredEvent {
	const activityType = VALID_ACTIVITY_TYPES.has(classification.activityType as ActivityType)
		? (classification.activityType as ActivityType)
		: "unknown";
	const intent = VALID_INTENT_TYPES.has(classification.intent as IntentType)
		? (classification.intent as IntentType)
		: "unknown";
	const confidence = typeof classification.confidence === "number"
		? Math.max(0, Math.min(1, classification.confidence))
		: 0.5;

	return {
		timestamp: raw.timestamp,
		source: raw.source,
		activityType,
		topics: (classification.topics || []).slice(0, 3).map((t) => String(t)),
		entities: (classification.entities || []).slice(0, 5).map((e) => String(e)),
		intent,
		confidence,
		category: raw.category,
		summary: String(classification.summary || raw.text).slice(0, 120),
	};
}

// ── Main Classification Entry Point ─────────────────────

export async function classifyEvents(
	visits: BrowserVisit[],
	searches: SearchQuery[],
	claudeSessions: ClaudeSession[],
	gitCommits: GitCommit[],
	categorized: CategorizedVisits,
	config: ClassificationConfig
): Promise<ClassificationResult> {
	const startTime = Date.now();

	// 1. Normalize all events
	const rawEvents: RawEvent[] = [
		...normalizeBrowserVisits(visits, categorized),
		...normalizeSearchQueries(searches),
		...normalizeClaudeSessions(claudeSessions),
		...normalizeGitCommits(gitCommits),
	];

	if (rawEvents.length === 0) {
		return {
			events: [],
			totalProcessed: 0,
			llmClassified: 0,
			ruleClassified: 0,
			processingTimeMs: Date.now() - startTime,
		};
	}

	const structuredEvents: StructuredEvent[] = [];
	let llmClassified = 0;
	let ruleClassified = 0;

	// 2. Batch events and classify via local LLM
	const batchSize = config.batchSize || 8;
	const batches: RawEvent[][] = [];
	for (let i = 0; i < rawEvents.length; i += batchSize) {
		batches.push(rawEvents.slice(i, i + batchSize));
	}

	for (const batch of batches) {
		try {
			const prompt = buildClassificationPrompt(batch);
			const systemPrompt =
				"You are an activity classifier. Analyze each activity and return " +
				"structured classifications as a JSON array. Be concise and accurate. " +
				"Return only valid JSON with no markdown fences.";

			const response = await callLocal(
				prompt,
				config.endpoint,
				config.model,
				1500,
				systemPrompt
			);

			// Check for AI failure indicators
			if (response.startsWith("[AI summary unavailable")) {
				throw new Error(response);
			}

			const classifications = parseLLMResponse(response, batch.length);

			for (let i = 0; i < batch.length; i++) {
				const classification = i < classifications.length ? classifications[i] : null;
				if (classification) {
					structuredEvents.push(llmToStructuredEvent(batch[i], classification));
					llmClassified++;
				} else {
					structuredEvents.push(ruleBasedClassify(batch[i]));
					ruleClassified++;
				}
			}
		} catch (e) {
			log.warn(
				`Daily Digest: LLM classification failed for batch, falling back to rules:`,
				e
			);
			// Fall back to rule-based for entire batch
			for (const event of batch) {
				structuredEvents.push(ruleBasedClassify(event));
				ruleClassified++;
			}
		}
	}

	return {
		events: structuredEvents,
		totalProcessed: rawEvents.length,
		llmClassified,
		ruleClassified,
		processingTimeMs: Date.now() - startTime,
	};
}

// ── Rule-Only Classification (no LLM) ──────────────────

export function classifyEventsRuleOnly(
	visits: BrowserVisit[],
	searches: SearchQuery[],
	claudeSessions: ClaudeSession[],
	gitCommits: GitCommit[],
	categorized: CategorizedVisits
): ClassificationResult {
	const startTime = Date.now();

	const rawEvents: RawEvent[] = [
		...normalizeBrowserVisits(visits, categorized),
		...normalizeSearchQueries(searches),
		...normalizeClaudeSessions(claudeSessions),
		...normalizeGitCommits(gitCommits),
	];

	const structuredEvents = rawEvents.map((e) => ruleBasedClassify(e));

	return {
		events: structuredEvents,
		totalProcessed: rawEvents.length,
		llmClassified: 0,
		ruleClassified: rawEvents.length,
		processingTimeMs: Date.now() - startTime,
	};
}
