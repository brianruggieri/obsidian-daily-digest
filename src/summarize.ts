import { requestUrl } from "obsidian";
import { CATEGORY_LABELS, scrubSecrets } from "./categorize";
import { chunkActivityData, estimateTokens } from "./chunker";
import { retrieveRelevantChunks } from "./embeddings";
import { AISummary, CategorizedVisits, EmbeddedChunk, RAGConfig, SearchQuery, ShellCommand, ClaudeSession } from "./types";
import { AIProvider } from "./settings";

// ── Anthropic caller ────────────────────────────────────

async function callAnthropic(
	prompt: string,
	apiKey: string,
	model: string,
	maxTokens = 800
): Promise<string> {
	try {
		const response = await requestUrl({
			url: "https://api.anthropic.com/v1/messages",
			method: "POST",
			contentType: "application/json",
			headers: {
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify({
				model,
				max_tokens: maxTokens,
				messages: [{ role: "user", content: prompt }],
			}),
		});

		if (response.status === 200) {
			const data = response.json;
			return data.content[0].text.trim();
		}
		return `[AI summary unavailable: HTTP ${response.status}]`;
	} catch (e) {
		return `[AI summary unavailable: ${e}]`;
	}
}

// ── Local model caller (OpenAI-compatible) ──────────────

async function callLocal(
	prompt: string,
	endpoint: string,
	model: string,
	maxTokens = 800
): Promise<string> {
	const baseUrl = endpoint.replace(/\/+$/, "");
	const url = `${baseUrl}/v1/chat/completions`;
	const isLocalhost =
		baseUrl.includes("localhost") ||
		baseUrl.includes("127.0.0.1") ||
		baseUrl.includes("0.0.0.0");

	const payload = JSON.stringify({
		model,
		max_tokens: maxTokens,
		temperature: 0.3,
		messages: [
			{
				role: "system",
				content:
					"You are a concise summarization assistant. " +
					"Return only valid JSON with no markdown fences or preamble.",
			},
			{ role: "user", content: prompt },
		],
	});

	try {
		// Use native fetch for localhost to avoid Obsidian requestUrl CORS issues
		if (isLocalhost) {
			const resp = await fetch(url, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: payload,
			});
			if (!resp.ok) return `[AI summary unavailable: HTTP ${resp.status}]`;
			const data = await resp.json();
			return data.choices[0].message.content.trim();
		} else {
			const response = await requestUrl({
				url,
				method: "POST",
				contentType: "application/json",
				body: payload,
			});
			if (response.status === 200) {
				const data = response.json;
				return data.choices[0].message.content.trim();
			}
			return `[AI summary unavailable: HTTP ${response.status}]`;
		}
	} catch (e) {
		return `[AI summary unavailable: ${e}]`;
	}
}

// ── Provider router ─────────────────────────────────────

export interface AICallConfig {
	provider: AIProvider;
	anthropicApiKey: string;
	anthropicModel: string;
	localEndpoint: string;
	localModel: string;
}

async function callAI(
	prompt: string,
	config: AICallConfig,
	maxTokens = 800
): Promise<string> {
	if (config.provider === "anthropic") {
		return callAnthropic(prompt, config.anthropicApiKey, config.anthropicModel, maxTokens);
	}
	if (config.provider === "local") {
		return callLocal(prompt, config.localEndpoint, config.localModel, maxTokens);
	}
	return "[AI summary unavailable: no provider configured]";
}

// ── Prompt builder & summarizer ─────────────────────────

function buildPrompt(
	date: Date,
	categorized: CategorizedVisits,
	searches: SearchQuery[],
	shellCmds: ShellCommand[],
	claudeSessions: ClaudeSession[],
	profile: string
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
	const contextHint = profile ? `\nUser profile context: ${profile}` : "";

	const dateStr = date.toLocaleDateString("en-US", {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	});

	return `You are summarizing a person's digital activity for ${dateStr}.
Your job is to distill raw activity logs into useful, human-readable intelligence for a personal knowledge base.${contextHint}

## Browser activity by category:
${catLines.length ? catLines.join("\n") : "  (none)"}

## Search queries:
${searchList.length ? searchList.map((q) => `  - ${q}`).join("\n") : "  (none)"}

## Claude / AI prompts:
${claudeList.length ? claudeList.map((p) => `  - ${p}`).join("\n") : "  (none)"}

## Shell commands (secrets redacted):
${shellList.length ? shellList.map((c) => `  - ${c}`).join("\n") : "  (none)"}

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence summarizing the whole day (max 15 words)",
  "tldr": "2-3 sentence paragraph. What was this person focused on? What did they accomplish or investigate?",
  "themes": ["3-5 short theme labels inferred from activity, e.g. 'API integration', 'market research', 'debugging'"],
  "category_summaries": {
    "<category_name>": "1-sentence plain-English summary of what they did in this category"
  },
  "notable": ["2-4 specific notable things: interesting searches, unusual patterns, apparent decisions or pivots"],
  "questions": ["1-2 open questions this day's activity raises, useful for future reflection"]
}

Be specific and concrete. Prefer "researched OAuth 2.0 flows for a GitHub integration" over "did some dev work".
Only include category_summaries for categories that actually had activity.
Do not include categories with zero visits.`;
}

// ── RAG-aware prompt builder ────────────────────────────

function buildRAGPrompt(
	date: Date,
	retrievedChunks: EmbeddedChunk[],
	profile: string
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

	return `You are summarizing a person's digital activity for ${dateStr}.
Your job is to distill activity logs into useful, human-readable intelligence for a personal knowledge base.${contextHint}

The following activity blocks were selected as the most relevant from today's data:

${chunkTexts}

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence summarizing the whole day (max 15 words)",
  "tldr": "2-3 sentence paragraph. What was this person focused on? What did they accomplish or investigate?",
  "themes": ["3-5 short theme labels inferred from activity, e.g. 'API integration', 'market research', 'debugging'"],
  "category_summaries": {
    "<category_name>": "1-sentence plain-English summary of what they did in this category"
  },
  "notable": ["2-4 specific notable things: interesting searches, unusual patterns, apparent decisions or pivots"],
  "questions": ["1-2 open questions this day's activity raises, useful for future reflection"]
}

Be specific and concrete. Prefer "researched OAuth 2.0 flows for a GitHub integration" over "did some dev work".
Only include category_summaries for categories represented in the activity blocks above.`;
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
	ragConfig?: RAGConfig
): Promise<AISummary> {
	let prompt: string;

	if (ragConfig?.enabled) {
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
				prompt = buildRAGPrompt(date, retrieved, profile);
				console.debug(
					`Daily Digest RAG: Using RAG prompt (${retrieved.length} chunks, ` +
					`~${estimateTokens(prompt)} tokens)`
				);
			} catch (e) {
				console.warn(
					"Daily Digest: RAG pipeline failed, falling back to standard prompt:",
					e
				);
				prompt = buildPrompt(
					date, categorized, searches, shellCmds, claudeSessions, profile
				);
			}
		} else {
			console.debug(
				`Daily Digest RAG: Skipping RAG (${chunks.length} chunks, ` +
				`${totalTokens} tokens — too small)`
			);
			prompt = buildPrompt(
				date, categorized, searches, shellCmds, claudeSessions, profile
			);
		}
	} else {
		prompt = buildPrompt(
			date, categorized, searches, shellCmds, claudeSessions, profile
		);
	}

	const raw = await callAI(prompt, config, 1000);

	// Strip markdown fences if the model wrapped it
	const cleaned = raw
		.replace(/^```json?\s*/m, "")
		.replace(/\s*```$/m, "")
		.trim();

	try {
		return JSON.parse(cleaned) as AISummary;
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
