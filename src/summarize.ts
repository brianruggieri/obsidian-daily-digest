import { CATEGORY_LABELS } from "./categorize";
import { scrubSecrets } from "./sanitize";
import { chunkActivityData, estimateTokens } from "./chunker";
import { retrieveRelevantChunks } from "./embeddings";
import { CompressedActivity } from "./compress";
import { AISummary, CategorizedVisits, ClassificationResult, PatternAnalysis, EmbeddedChunk, RAGConfig, SearchQuery, ShellCommand, ClaudeSession, StructuredEvent, slugifyQuestion, GitCommit } from "./types";
import { callAI, AICallConfig } from "./ai-client";
import { loadPromptTemplate, fillTemplate } from "./prompt-templates";
import * as log from "./log";

// ── Prompt builder & summarizer ─────────────────────────

export function buildPrompt(
	date: Date,
	categorized: CategorizedVisits,
	searches: SearchQuery[],
	shellCmds: ShellCommand[],
	claudeSessions: ClaudeSession[],
	profile: string,
	gitCommits: GitCommit[] = [],
	promptsDir?: string
): string {
	const catLines: string[] = [];
	for (const [cat, visits] of Object.entries(categorized)) {
		const label = CATEGORY_LABELS[cat]?.[1] ?? cat;
		const domains = [...new Set(visits.map((v) => v.domain || ""))].slice(0, 8);
		const titles = visits
			.slice(0, 5)
			.map((v) => v.title?.slice(0, 60))
			.filter((t) => t);
		catLines.push(
			`  [${label}] domains: ${domains.join(", ")}` +
				(titles.length ? ` | sample titles: ${titles.join("; ")}` : "")
		);
	}

	const searchList = searches.slice(0, 20).map((s) => s.query);
	const claudeList = claudeSessions.slice(0, 10).map((e) => e.prompt.slice(0, 120));
	const shellList = shellCmds.slice(0, 15).map((e) => scrubSecrets(e.cmd).slice(0, 80));
	const gitList = gitCommits.slice(0, 20).map((c) => `  - [${c.repo}] ${c.message.slice(0, 80)}`);
	const contextHint = profile ? `\nUser profile context: ${profile}` : "";

	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	const vars: Record<string, string> = {
		dateStr,
		contextHint,
		browserActivity: catLines.length ? catLines.join("\n") : "  (none)",
		searches: searchList.length ? searchList.map((q) => `  - ${q}`).join("\n") : "  (none)",
		claudePrompts: claudeList.length ? claudeList.map((p) => `  - ${p}`).join("\n") : "  (none)",
		shellCommands: shellList.length ? shellList.map((c) => `  - ${c}`).join("\n") : "  (none)",
		gitCommits: gitList.length ? gitList.join("\n") : "  (none)",
	};
	return fillTemplate(loadPromptTemplate("standard", promptsDir), vars);
}

// ── Compressed prompt builder (full-day mode) ───────────
// Uses pre-compressed activity data from compress.ts. This path is taken
// when collectionMode === "complete" — it replaces the fixed-cap slicing
// in buildPrompt with budget-aware proportional compression.

function buildCompressedPrompt(
	date: Date,
	compressed: CompressedActivity,
	profile: string,
	promptsDir?: string
): string {
	const contextHint = profile ? `\nUser profile context: ${profile}` : "";
	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	const vars: Record<string, string> = {
		dateStr,
		contextHint,
		totalEvents: String(compressed.totalEvents),
		browserActivity: compressed.browserText,
		searches: compressed.searchText,
		claudePrompts: compressed.claudeText,
		shellCommands: compressed.shellText,
		gitCommits: compressed.gitText,
	};
	return fillTemplate(loadPromptTemplate("compressed", promptsDir), vars);
}

// ── RAG-aware prompt builder ────────────────────────────

function buildRAGPrompt(
	date: Date,
	retrievedChunks: EmbeddedChunk[],
	profile: string,
	promptsDir?: string
): string {
	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	const contextHint = profile ? `\nUser profile context: ${profile}` : "";

	const chunkTexts = retrievedChunks
		.map(
			(c, i) =>
				`--- Activity Block ${i + 1} (${c.type}${c.category ? `: ${c.category}` : ""}) ---\n${c.text}`
		)
		.join("\n\n");

	const vars: Record<string, string> = {
		dateStr,
		contextHint,
		chunkTexts,
	};
	return fillTemplate(loadPromptTemplate("rag", promptsDir), vars);
}

// ── Classified prompt builder (Phase 2) ─────────────────
// Sends ONLY structured abstractions — zero raw URLs, queries, commands, or prompts.

export function buildClassifiedPrompt(
	date: Date,
	classification: ClassificationResult,
	profile: string,
	promptsDir?: string
): string {
	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	const contextHint = profile ? `\nUser profile context: ${profile}` : "";

	// Group events by activityType
	const byType: Record<string, StructuredEvent[]> = {};
	for (const event of classification.events) {
		if (!byType[event.activityType]) {
			byType[event.activityType] = [];
		}
		byType[event.activityType].push(event);
	}

	const sections: string[] = [];
	for (const [activityType, events] of Object.entries(byType)) {
		const typeTopics = [...new Set(events.flatMap((ev: StructuredEvent) => ev.topics))];
		const typeEntities = [...new Set(events.flatMap((ev: StructuredEvent) => ev.entities))];
		const summaries = events.map((ev: StructuredEvent) => `  - ${ev.summary}`).join("\n");

		sections.push(
			`### ${activityType} (${events.length} events)\n` +
			`Topics: ${typeTopics.join(", ") || "none"}\n` +
			`Entities: ${typeEntities.join(", ") || "none"}\n` +
			`Activities:\n${summaries}`
		);
	}

	// Collect all unique topics and entities across events
	const allTopics = [...new Set(classification.events.flatMap((ev: StructuredEvent) => ev.topics))];
	const allEntities = [...new Set(classification.events.flatMap((ev: StructuredEvent) => ev.entities))];

	const vars: Record<string, string> = {
		dateStr,
		contextHint,
		totalProcessed: String(classification.totalProcessed),
		llmClassified: String(classification.llmClassified),
		ruleClassified: String(classification.ruleClassified),
		allTopics: allTopics.join(", ") || "none",
		allEntities: allEntities.join(", ") || "none",
		activitySections: sections.join("\n\n") || "(no classified events)",
	};
	return fillTemplate(loadPromptTemplate("classified", promptsDir), vars);
}

// ── De-identified prompt builder (Phase 4) ──────────────
// Sends ONLY aggregated patterns and statistics — zero per-event data.
// The most privacy-preserving prompt tier. Used when PatternAnalysis
// is available and the provider is Anthropic.
//
// What IS sent:   topic frequency distributions, entity co-occurrence
//                 clusters, temporal activity shapes, recurrence trends,
//                 focus score, knowledge delta counts.
// What is NOT:    individual event summaries, per-event topics, raw data
//                 of any kind, timestamps of individual events.

export function buildDeidentifiedPrompt(
	date: Date,
	patterns: PatternAnalysis,
	profile: string,
	promptsDir?: string
): string {
	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});
	const contextHint = profile ? `\nUser profile context: ${profile}` : "";

	// ── Activity distribution (counts only, no per-event data) ──
	const activityDist = patterns.topActivityTypes
		.map((a) => `  ${a.type}: ${a.count} events (${a.pct}%)`)
		.join("\n") || "  (no activity data)";

	// ── Temporal shape (cluster labels only) ──
	const temporalShape = patterns.temporalClusters.length > 0
		? patterns.temporalClusters
			.slice(0, 6)
			.map((c) => `  ${c.label} (${c.eventCount} events, intensity ${c.intensity.toFixed(1)}/hr)`)
			.join("\n")
		: "  No significant clusters detected.";

	// ── Topic distribution (aggregated counts) ──
	const topicCounts: Record<string, number> = {};
	for (const cluster of patterns.temporalClusters) {
		for (const topic of cluster.topics) {
			topicCounts[topic] = (topicCounts[topic] || 0) + cluster.eventCount;
		}
	}
	const topTopics = Object.entries(topicCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 12)
		.map(([topic, count]) => `  ${topic}: ~${count} events`)
		.join("\n") || "  (no topics extracted)";

	// ── Entity clusters (co-occurrence pairs only) ──
	const entityClusters = patterns.entityRelations.length > 0
		? patterns.entityRelations
			.slice(0, 8)
			.map((r) => `  ${r.entityA} \u2194 ${r.entityB} (${r.cooccurrences}x, in: ${r.contexts.join(", ")})`)
			.join("\n")
		: "  No entity co-occurrences detected.";

	// ── Topic co-occurrences (strongest connections) ──
	const topicConnections = patterns.topicCooccurrences
		.filter((c) => c.strength >= 0.3)
		.slice(0, 8)
		.map((c) => `  ${c.topicA} \u2194 ${c.topicB} (strength: ${c.strength.toFixed(2)})`)
		.join("\n") || "  No strong topic connections.";

	// ── Recurrence signals (trend labels only) ──
	const recurrenceLines: string[] = [];
	const newTopics = patterns.recurrenceSignals.filter((s) => s.trend === "new");
	const returning = patterns.recurrenceSignals.filter((s) => s.trend === "returning");
	const rising = patterns.recurrenceSignals.filter((s) => s.trend === "rising");
	const stable = patterns.recurrenceSignals.filter((s) => s.trend === "stable");

	if (newTopics.length > 0) {
		recurrenceLines.push(`  New explorations: ${newTopics.map((s) => s.topic).join(", ")}`);
	}
	if (returning.length > 0) {
		recurrenceLines.push(`  Returning interests: ${returning.map((s) => `${s.topic} (${s.dayCount} days total)`).join(", ")}`);
	}
	if (rising.length > 0) {
		recurrenceLines.push(`  Trending up: ${rising.map((s) => s.topic).join(", ")}`);
	}
	if (stable.length > 0) {
		recurrenceLines.push(`  Ongoing: ${stable.map((s) => s.topic).join(", ")}`);
	}
	const recurrenceStr = recurrenceLines.length > 0
		? recurrenceLines.join("\n")
		: "  No recurrence data available.";

	// ── Knowledge delta (counts and labels) ──
	const delta = patterns.knowledgeDelta;
	const knowledgeDeltaLines = [
		delta.newTopics.length > 0 ? `  New topics: ${delta.newTopics.join(", ")}` : null,
		delta.recurringTopics.length > 0 ? `  Recurring: ${delta.recurringTopics.join(", ")}` : null,
		delta.novelEntities.length > 0 ? `  New entities: ${delta.novelEntities.join(", ")}` : null,
		delta.connections.length > 0 ? `  Cross-connections: ${delta.connections.join("; ")}` : null,
	].filter(Boolean).join("\n") || "  No knowledge delta data.";

	// ── Peak hours ──
	const peakHours = patterns.peakHours.length > 0
		? patterns.peakHours.slice(0, 3).map((p) => {
			const h = p.hour;
			const label = h === 0 ? "12am" : h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`;
			return `${label} (${p.count})`;
		}).join(", ")
		: "unknown";

	// ── Focus label ──
	const focusLabel = patterns.focusScore >= 0.7
		? "highly focused"
		: patterns.focusScore >= 0.5
			? "moderately focused"
			: patterns.focusScore >= 0.3
				? "varied"
				: "widely scattered";

	const vars: Record<string, string> = {
		dateStr,
		contextHint,
		focusScore: `${Math.round(patterns.focusScore * 100)}% (${focusLabel})`,
		peakHours,
		activityDist,
		temporalShape,
		topTopics,
		topicConnections,
		entityClusters,
		recurrenceLines: recurrenceStr,
		knowledgeDeltaLines,
	};
	return fillTemplate(loadPromptTemplate("deidentified", promptsDir), vars);
}

// ── Main summarization entry point ──────────────────────

export async function summarizeDay(
	date: Date,
	categorized: CategorizedVisits,
	searches: SearchQuery[],
	shellCmds: ShellCommand[],
	claudeSessions: ClaudeSession[],
	config: AICallConfig,
	profile: string,
	ragConfig?: RAGConfig,
	classification?: ClassificationResult,
	patterns?: PatternAnalysis,
	compressed?: CompressedActivity,
	gitCommits: GitCommit[] = [],
	promptsDir?: string
): Promise<AISummary> {
	let prompt: string;
	let maxTokens = 1000;

	// Helper: build the best available standard/fallback prompt.
	// In "complete" collection mode, compressed data is available and
	// produces a budget-aware prompt. Otherwise fall back to the legacy
	// fixed-cap prompt builder.
	const standardPrompt = () =>
		compressed
			? buildCompressedPrompt(date, compressed, profile, promptsDir)
			: buildPrompt(date, categorized, searches, shellCmds, claudeSessions, profile, gitCommits, promptsDir);

	// Privacy escalation chain for Anthropic:
	//   1. De-identified (patterns available) — ONLY aggregated statistics, zero per-event data
	//   2. Classified (classification available) — per-event abstractions, no raw data
	//   3. RAG / Standard — raw data (sanitized), least private
	// Local provider always uses full context since data stays on machine.

	if (patterns && config.provider === "anthropic") {
		// Phase 4: Maximum privacy — aggregated patterns only
		prompt = buildDeidentifiedPrompt(date, patterns, profile, promptsDir);
		maxTokens = 1500; // Larger response for meta-insights
		log.debug(
			`Daily Digest: Using de-identified prompt for Anthropic ` +
			`(${patterns.temporalClusters.length} clusters, ` +
			`focus ${Math.round(patterns.focusScore * 100)}%, ` +
			`${patterns.recurrenceSignals.length} recurrence signals)`
		);
	} else if (classification && classification.events.length > 0 && config.provider === "anthropic") {
		// Phase 2: Per-event abstractions — no raw data
		prompt = buildClassifiedPrompt(date, classification, profile, promptsDir);
		log.debug(
			`Daily Digest: Using classified prompt for Anthropic ` +
			`(${classification.events.length} events, ${classification.llmClassified} LLM-classified)`
		);
	} else if (ragConfig?.enabled) {
		const chunks = chunkActivityData(
			date, categorized, searches, shellCmds, claudeSessions
		);
		const totalTokens = chunks.reduce(
			(sum, c) => sum + estimateTokens(c.text), 0
		);

		if (chunks.length > 2 && totalTokens > 500) {
			try {
				const retrieved = await retrieveRelevantChunks(
					chunks,
					ragConfig.embeddingEndpoint,
					ragConfig.embeddingModel,
					ragConfig.topK
				);
				prompt = buildRAGPrompt(date, retrieved, profile, promptsDir);
				log.debug(
					`Daily Digest RAG: Using RAG prompt (${retrieved.length} chunks, ` +
					`~${estimateTokens(prompt)} tokens)`
				);
			} catch (e) {
				log.warn(
					"Daily Digest: RAG pipeline failed, falling back to standard prompt:",
					e
				);
				prompt = standardPrompt();
			}
		} else {
			log.debug(
				`Daily Digest RAG: Skipping RAG (${chunks.length} chunks, ` +
				`${totalTokens} tokens — too small)`
			);
			prompt = standardPrompt();
		}
	} else {
		prompt = standardPrompt();
	}

	const raw = await callAI(prompt, config, maxTokens);

	// Strip markdown fences if the model wrapped it
	const cleaned = raw
		.replace(/^```json?\s*/m, "")
		.replace(/\s*```$/m, "")
		.trim();

	try {
		const summary = JSON.parse(cleaned) as AISummary;
		// Derive structured prompts with stable IDs from plain question strings
		if (summary.questions?.length) {
			const seen = new Set<string>();
			summary.prompts = summary.questions.map((q) => {
				let id = slugifyQuestion(q);
				// Deduplicate IDs by appending a suffix
				const base = id;
				let n = 2;
				while (seen.has(id)) {
					id = `${base}_${n++}`;
				}
				seen.add(id);
				return { id, question: q };
			});
		}
		return summary;
	} catch {
		return {
			headline: "Activity summary unavailable",
			tldr: cleaned.slice(0, 400),
			themes: [],
			category_summaries: {},
			notable: [],
			questions: [],
		};
	}
}
