import { requestUrl } from "obsidian";
import { AIProvider } from "../settings/types";

// ── Anthropic Message Batches API ───────────────────────

export interface AnthropicBatchRequest {
	custom_id: string;
	params: {
		model: string;
		max_tokens: number;
		messages: { role: string; content: string }[];
		system?: string;
	};
}

export interface AnthropicBatchResponse {
	id: string;
	processing_status: "in_progress" | "canceling" | "ended";
	request_counts: {
		processing: number;
		succeeded: number;
		errored: number;
		canceled: number;
		expired: number;
	};
	results_url?: string;
}

export interface AnthropicBatchResultItem {
	custom_id: string;
	result:
		| { type: "succeeded"; message: { content: { type: string; text: string }[] } }
		| { type: "errored"; error: { type: string; message: string } }
		| { type: "canceled" }
		| { type: "expired" };
}

/**
 * Submit a batch of prompts to the Anthropic Message Batches API.
 * Returns the batch response (including the batch ID).
 */
export async function submitAnthropicBatch(
	requests: AnthropicBatchRequest[],
	apiKey: string
): Promise<AnthropicBatchResponse> {
	const response = await requestUrl({
		url: "https://api.anthropic.com/v1/messages/batches",
		method: "POST",
		contentType: "application/json",
		headers: {
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
			"anthropic-beta": "message-batches-2024-09-24",
		},
		body: JSON.stringify({ requests }),
	});
	if (response.status !== 200) {
		throw new Error(`Batch submit failed: HTTP ${response.status}`);
	}
	return response.json as AnthropicBatchResponse;
}

/**
 * Poll the Anthropic Message Batches API until the batch has ended.
 * Rejects if the batch never completes within the allowed time.
 *
 * Timeout precedence:
 * - `maxAttempts` (explicit) takes priority when provided
 * - Otherwise `maxDurationMs` (default 24h) is divided by `intervalMs`
 */
export async function pollAnthropicBatch(
	batchId: string,
	apiKey: string,
	opts: { intervalMs?: number; maxAttempts?: number; maxDurationMs?: number } = {}
): Promise<AnthropicBatchResponse> {
	const intervalMs = Math.max(1, opts.intervalMs ?? 5000);
	const maxDurationMs = opts.maxDurationMs ?? 24 * 60 * 60 * 1000; // 24 hours
	const maxAttempts = opts.maxAttempts ?? Math.ceil(maxDurationMs / intervalMs);

	for (let attempt = 0; attempt < maxAttempts; attempt++) {
		if (attempt > 0) {
			await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));
		}
		const response = await requestUrl({
			url: `https://api.anthropic.com/v1/messages/batches/${batchId}`,
			method: "GET",
			headers: {
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
				"anthropic-beta": "message-batches-2024-09-24",
			},
		});
		if (response.status !== 200) {
			throw new Error(`Batch poll failed: HTTP ${response.status}`);
		}
		const batch = response.json as AnthropicBatchResponse;
		if (batch.processing_status === "ended") {
			return batch;
		}
	}
	throw new Error(`Batch ${batchId} did not complete within the maximum polling time`);
}

/**
 * Retrieve and parse JSONL results for a completed batch.
 * Returns one result item per request in the batch.
 */
export async function retrieveAnthropicBatchResults(
	resultsUrl: string,
	apiKey: string
): Promise<AnthropicBatchResultItem[]> {
	const response = await requestUrl({
		url: resultsUrl,
		method: "GET",
		headers: {
			"x-api-key": apiKey,
			"anthropic-version": "2023-06-01",
			"anthropic-beta": "message-batches-2024-09-24",
		},
	});
	if (response.status !== 200) {
		throw new Error(`Batch results fetch failed: HTTP ${response.status}`);
	}
	const text = response.text;
	return text
		.split("\n")
		.filter((line) => line.trim())
		.map((line) => JSON.parse(line) as AnthropicBatchResultItem);
}

// ── Anthropic caller ────────────────────────────────────

export async function callAnthropic(
	prompt: string,
	apiKey: string,
	model: string,
	maxTokens = 800,
	systemPrompt?: string
): Promise<string> {
	try {
		const messages: { role: string; content: string }[] = [
			{ role: "user", content: prompt },
		];

		const body: Record<string, unknown> = {
			model,
			max_tokens: maxTokens,
			messages,
		};

		if (systemPrompt) {
			body.system = systemPrompt;
		}

		const response = await requestUrl({
			url: "https://api.anthropic.com/v1/messages",
			method: "POST",
			contentType: "application/json",
			headers: {
				"x-api-key": apiKey,
				"anthropic-version": "2023-06-01",
			},
			body: JSON.stringify(body),
		});

		if (response.status === 200) {
			const data = response.json;
			const text = data?.content?.[0]?.text;
			if (typeof text === "string") return text.trim();
			return "[AI summary unavailable: unexpected response shape]";
		}
		return `[AI summary unavailable: HTTP ${response.status}]`;
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return `[AI summary unavailable: ${msg}]`;
	}
}

// ── Local model caller (OpenAI-compatible) ──────────────

export async function callLocal(
	prompt: string,
	endpoint: string,
	model: string,
	maxTokens = 800,
	systemPrompt?: string,
	jsonMode = true
): Promise<string> {
	const baseUrl = endpoint.replace(/\/+$/, "");
	const url = `${baseUrl}/v1/chat/completions`;
	const isLocalhost =
		baseUrl.includes("localhost") ||
		baseUrl.includes("127.0.0.1") ||
		baseUrl.includes("0.0.0.0");

	const messages: { role: string; content: string }[] = [];

	messages.push({
		role: "system",
		content: systemPrompt ||
			(jsonMode
				? "You are a concise summarization assistant. Return only valid JSON with no markdown fences or preamble."
				: "You are a concise summarization assistant. Write clear, specific markdown as instructed."),
	});

	messages.push({ role: "user", content: prompt });

	const basePayload: Record<string, unknown> = {
		model,
		max_tokens: maxTokens,
		temperature: 0.3,
		messages,
	};
	if (jsonMode) {
		basePayload.response_format = { type: "json_object" };
	}

	const headers = { "Content-Type": "application/json", Accept: "application/json" };

	try {
		// Use native fetch for localhost to avoid Obsidian requestUrl CORS issues
		if (isLocalhost) {
			// Some local OpenAI-compatible servers reject `response_format` with 400.
			// Try with it first; if the server returns 400, retry without it.
			let resp = await fetch(url, {
				method: "POST",
				headers,
				body: JSON.stringify(basePayload),
			});
			if (!resp.ok && resp.status === 400) {
				const { response_format: _, ...payloadWithoutFormat } = basePayload;
				resp = await fetch(url, {
					method: "POST",
					headers,
					body: JSON.stringify(payloadWithoutFormat),
				});
			}
			if (!resp.ok) return `[AI summary unavailable: HTTP ${resp.status}]`;
			const data = await resp.json();
			const text = data?.choices?.[0]?.message?.content;
			if (typeof text === "string") return text.trim();
			return "[AI summary unavailable: unexpected response shape]";
		} else {
			const response = await requestUrl({
				url,
				method: "POST",
				contentType: "application/json",
				body: JSON.stringify(basePayload),
			});
			if (response.status === 200) {
				const data = response.json;
				const text = data?.choices?.[0]?.message?.content;
				if (typeof text === "string") return text.trim();
				return "[AI summary unavailable: unexpected response shape]";
			}
			return `[AI summary unavailable: HTTP ${response.status}]`;
		}
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		return `[AI summary unavailable: ${msg}]`;
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

export async function callAI(
	prompt: string,
	config: AICallConfig,
	maxTokens = 800,
	systemPrompt?: string,
	jsonMode = true
): Promise<string> {
	if (config.provider === "anthropic") {
		return callAnthropic(prompt, config.anthropicApiKey, config.anthropicModel, maxTokens, systemPrompt);
	}
	if (config.provider === "local") {
		return callLocal(prompt, config.localEndpoint, config.localModel, maxTokens, systemPrompt, jsonMode);
	}
	return "[AI summary unavailable: no provider configured]";
}
