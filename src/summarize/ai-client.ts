import { requestUrl } from "obsidian";
import { AIProvider } from "../settings/types";

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
	systemPrompt?: string
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
			"You are a concise summarization assistant. " +
			"Return only valid JSON with no markdown fences or preamble.",
	});

	messages.push({ role: "user", content: prompt });

	const payload = JSON.stringify({
		model,
		max_tokens: maxTokens,
		temperature: 0.3,
		messages,
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
			const text = data?.choices?.[0]?.message?.content;
			if (typeof text === "string") return text.trim();
			return "[AI summary unavailable: unexpected response shape]";
		} else {
			const response = await requestUrl({
				url,
				method: "POST",
				contentType: "application/json",
				body: payload,
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
	systemPrompt?: string
): Promise<string> {
	if (config.provider === "anthropic") {
		return callAnthropic(prompt, config.anthropicApiKey, config.anthropicModel, maxTokens, systemPrompt);
	}
	if (config.provider === "local") {
		return callLocal(prompt, config.localEndpoint, config.localModel, maxTokens, systemPrompt);
	}
	return "[AI summary unavailable: no provider configured]";
}
