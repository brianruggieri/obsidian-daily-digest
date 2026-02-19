import {
	ActivityType,
	IntentType,
	StructuredEvent,
	ClassificationResult,
	ClassificationConfig,
	BrowserVisit,
	SearchQuery,
	ShellCommand,
	ClaudeSession,
	CategorizedVisits,
} from "./types";
import { callLocal } from "./ai-client";
import { categorizeDomain } from "./categorize";

// ── Raw Event Normalization ─────────────────────────────

interface RawEvent {
	timestamp: string;
	source: "browser" | "search" | "shell" | "claude";
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

function normalizeShellCommands(cmds: ShellCommand[]): RawEvent[] {
	return cmds.map((c) => ({
		timestamp: c.time ? c.time.toISOString() : "",
		source: "shell" as const,
		text: c.cmd.slice(0, 120),
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
	other: "unknown",
};

const SHELL_ACTIVITY_PATTERNS: [RegExp, ActivityType][] = [
	[/\b(?:git\s+(?:clone|pull|push|merge|rebase|checkout|branch))\b/i, "implementation"],
	[/\b(?:git\s+(?:log|diff|status|show|blame))\b/i, "debugging"],
	[/\b(?:npm\s+(?:install|i|add)|yarn\s+add|pip\s+install|brew\s+install|cargo\s+add)\b/i, "infrastructure"],
	[/\b(?:npm\s+(?:run|test)|yarn\s+(?:test|build)|pytest|jest|cargo\s+test|make\s+test)\b/i, "debugging"],
	[/\b(?:docker|kubectl|terraform|ansible|helm)\b/i, "infrastructure"],
	[/\b(?:ssh|scp|rsync|curl|wget)\b/i, "infrastructure"],
	[/\b(?:vim|nvim|nano|code|subl|emacs)\b/i, "implementation"],
	[/\b(?:cd|ls|cat|grep|find|awk|sed|head|tail|wc)\b/i, "debugging"],
	[/\b(?:mkdir|rm|mv|cp|chmod|chown)\b/i, "infrastructure"],
];

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
	if (source === "shell") return "implement";
	if (source === "claude") return "implement";
	return "explore";
}

function extractEntities(text: string, domain?: string): string[] {
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
		if (word.length > 2 && !["The", "This", "That", "How", "What", "Why", "When"].includes(word)) {
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

	if (event.source === "browser") {
		activityType = CATEGORY_TO_ACTIVITY[event.category || "other"] || "unknown";
	} else if (event.source === "search") {
		activityType = "research";
	} else if (event.source === "shell") {
		activityType = "implementation";
		for (const [pattern, type] of SHELL_ACTIVITY_PATTERNS) {
			if (pattern.test(event.text)) {
				activityType = type;
				break;
			}
		}
	} else if (event.source === "claude") {
		activityType = "implementation";
	}

	const intent = inferIntent(event.text, event.source);
	const entities = extractEntities(event.text, event.metadata?.domain);

	// Simple topic extraction: first 3 meaningful words
	const words = event.text
		.replace(/[^\w\s-]/g, " ")
		.split(/\s+/)
		.filter((w) => w.length > 3)
		.slice(0, 3);

	return {
		timestamp: event.timestamp,
		source: event.source,
		activityType,
		topics: words.length > 0 ? [words.join(" ")] : [],
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
	} catch {
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
	shellCmds: ShellCommand[],
	claudeSessions: ClaudeSession[],
	categorized: CategorizedVisits,
	config: ClassificationConfig
): Promise<ClassificationResult> {
	const startTime = Date.now();

	// 1. Normalize all events
	const rawEvents: RawEvent[] = [
		...normalizeBrowserVisits(visits, categorized),
		...normalizeSearchQueries(searches),
		...normalizeShellCommands(shellCmds),
		...normalizeClaudeSessions(claudeSessions),
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
			console.warn(
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
	shellCmds: ShellCommand[],
	claudeSessions: ClaudeSession[],
	categorized: CategorizedVisits
): ClassificationResult {
	const startTime = Date.now();

	const rawEvents: RawEvent[] = [
		...normalizeBrowserVisits(visits, categorized),
		...normalizeSearchQueries(searches),
		...normalizeShellCommands(shellCmds),
		...normalizeClaudeSessions(claudeSessions),
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
