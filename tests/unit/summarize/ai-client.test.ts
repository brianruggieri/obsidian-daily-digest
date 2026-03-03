import { vi, describe, it, expect, beforeEach, afterAll } from "vitest";
import { requestUrl } from "obsidian";

// ── Mock setup ──────────────────────────────────────────

vi.mock("obsidian", async () => {
	const actual = await vi.importActual<typeof import("obsidian")>("obsidian");
	return {
		...actual,
		requestUrl: vi.fn(),
	};
});

const mockRequestUrl = vi.mocked(requestUrl);
const originalFetch = global.fetch;
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

afterAll(() => {
	global.fetch = originalFetch;
});

import { callAnthropic, callLocal, callAI, AICallConfig } from "../../../src/summarize/ai-client";

// ── Helpers ─────────────────────────────────────────────

/** Build a mock Anthropic Messages API response. */
function anthropicResponse(text: string, status = 200) {
	return {
		status,
		json: { content: [{ text }] },
		text: JSON.stringify({ content: [{ text }] }),
	};
}

/** Build a mock OpenAI-compatible chat completion response. */
function chatCompletionResponse(content: string, status = 200) {
	return {
		status,
		json: { choices: [{ message: { content } }] },
		text: JSON.stringify({ choices: [{ message: { content } }] }),
	};
}

/** Build a fetch Response-like object for local model calls. */
function fetchResponse(content: string, status = 200) {
	return {
		ok: status >= 200 && status < 300,
		status,
		json: async () => ({ choices: [{ message: { content } }] }),
	} as unknown as Response;
}

function fetchErrorResponse(status: number) {
	return {
		ok: false,
		status,
		json: async () => ({}),
	} as unknown as Response;
}

// ── Tests ───────────────────────────────────────────────

beforeEach(() => {
	vi.clearAllMocks();
});

// ─── callAnthropic ──────────────────────────────────────

describe("callAnthropic", () => {
	it("returns trimmed text on 200 with valid response shape", async () => {
		mockRequestUrl.mockResolvedValue(anthropicResponse("  Hello, world!  "));
		const result = await callAnthropic("test prompt", "sk-key", "claude-3-haiku");
		expect(result).toBe("Hello, world!");
	});

	it("returns error message on non-200 status", async () => {
		mockRequestUrl.mockResolvedValue(anthropicResponse("", 429));
		const result = await callAnthropic("test prompt", "sk-key", "claude-3-haiku");
		expect(result).toBe("[AI summary unavailable: HTTP 429]");
	});

	it("returns error message on unexpected response shape (missing content)", async () => {
		mockRequestUrl.mockResolvedValue({
			status: 200,
			json: { id: "msg_123", content: [] },
			text: "",
		});
		const result = await callAnthropic("test prompt", "sk-key", "claude-3-haiku");
		expect(result).toBe("[AI summary unavailable: unexpected response shape]");
	});

	it("returns error message when content[0].text is not a string", async () => {
		mockRequestUrl.mockResolvedValue({
			status: 200,
			json: { content: [{ type: "tool_use" }] },
			text: "",
		});
		const result = await callAnthropic("test prompt", "sk-key", "claude-3-haiku");
		expect(result).toBe("[AI summary unavailable: unexpected response shape]");
	});

	it("returns error message on network error", async () => {
		mockRequestUrl.mockRejectedValue(new Error("net::ERR_CONNECTION_REFUSED"));
		const result = await callAnthropic("test prompt", "sk-key", "claude-3-haiku");
		expect(result).toBe("[AI summary unavailable: net::ERR_CONNECTION_REFUSED]");
	});

	it("returns error message on non-Error throw", async () => {
		mockRequestUrl.mockRejectedValue("string error");
		const result = await callAnthropic("test prompt", "sk-key", "claude-3-haiku");
		expect(result).toBe("[AI summary unavailable: string error]");
	});

	it("includes system field in request body when systemPrompt is provided", async () => {
		mockRequestUrl.mockResolvedValue(anthropicResponse("ok"));
		await callAnthropic("test prompt", "sk-key", "claude-3-haiku", 800, "You are helpful.");

		expect(mockRequestUrl).toHaveBeenCalledOnce();
		const callBody = JSON.parse(mockRequestUrl.mock.calls[0][0].body as string);
		expect(callBody.system).toBe("You are helpful.");
	});

	it("omits system field when no systemPrompt is given", async () => {
		mockRequestUrl.mockResolvedValue(anthropicResponse("ok"));
		await callAnthropic("test prompt", "sk-key", "claude-3-haiku");

		const callBody = JSON.parse(mockRequestUrl.mock.calls[0][0].body as string);
		expect(callBody).not.toHaveProperty("system");
	});

	it("sends correct headers and endpoint", async () => {
		mockRequestUrl.mockResolvedValue(anthropicResponse("ok"));
		await callAnthropic("test", "my-api-key", "claude-3-sonnet", 1024);

		const opts = mockRequestUrl.mock.calls[0][0];
		expect(opts.url).toBe("https://api.anthropic.com/v1/messages");
		expect(opts.method).toBe("POST");
		expect(opts.headers?.["x-api-key"]).toBe("my-api-key");
		expect(opts.headers?.["anthropic-version"]).toBe("2023-06-01");

		const body = JSON.parse(opts.body as string);
		expect(body.model).toBe("claude-3-sonnet");
		expect(body.max_tokens).toBe(1024);
		expect(body.messages).toEqual([{ role: "user", content: "test" }]);
	});
});

// ─── callLocal (localhost — uses fetch) ─────────────────

describe("callLocal (localhost)", () => {
	const LOCALHOST = "http://localhost:11434";

	it("returns trimmed text on 200 with valid chat completion shape", async () => {
		mockFetch.mockResolvedValue(fetchResponse("  Summary here  "));
		const result = await callLocal("test prompt", LOCALHOST, "llama3");
		expect(result).toBe("Summary here");
	});

	it("calls fetch with correct URL and payload", async () => {
		mockFetch.mockResolvedValue(fetchResponse("ok"));
		await callLocal("test prompt", `${LOCALHOST}/`, "llama3", 512, undefined, true);

		expect(mockFetch).toHaveBeenCalledOnce();
		const [url, opts] = mockFetch.mock.calls[0];
		expect(url).toBe("http://localhost:11434/v1/chat/completions");

		const body = JSON.parse(opts.body);
		expect(body.model).toBe("llama3");
		expect(body.max_tokens).toBe(512);
		expect(body.temperature).toBe(0.3);
		expect(body.response_format).toEqual({ type: "json_object" });
		expect(body.messages).toHaveLength(2);
		expect(body.messages[0].role).toBe("system");
		expect(body.messages[1]).toEqual({ role: "user", content: "test prompt" });
	});

	it("omits response_format when jsonMode is false", async () => {
		mockFetch.mockResolvedValue(fetchResponse("ok"));
		await callLocal("test", LOCALHOST, "llama3", 800, undefined, false);

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body).not.toHaveProperty("response_format");
	});

	it("retries without response_format on 400", async () => {
		// First call returns 400, retry succeeds
		mockFetch
			.mockResolvedValueOnce(fetchErrorResponse(400))
			.mockResolvedValueOnce(fetchResponse("retry worked"));

		const result = await callLocal("test prompt", LOCALHOST, "llama3");
		expect(result).toBe("retry worked");
		expect(mockFetch).toHaveBeenCalledTimes(2);

		// Second call should NOT have response_format
		const retryBody = JSON.parse(mockFetch.mock.calls[1][1].body);
		expect(retryBody).not.toHaveProperty("response_format");
	});

	it("returns error message when both initial and retry fail", async () => {
		mockFetch
			.mockResolvedValueOnce(fetchErrorResponse(400))
			.mockResolvedValueOnce(fetchErrorResponse(500));

		const result = await callLocal("test prompt", LOCALHOST, "llama3");
		expect(result).toBe("[AI summary unavailable: HTTP 500]");
	});

	it("returns error on non-200 non-400 status without retry", async () => {
		mockFetch.mockResolvedValueOnce(fetchErrorResponse(503));
		const result = await callLocal("test prompt", LOCALHOST, "llama3");
		expect(result).toBe("[AI summary unavailable: HTTP 503]");
		// Should not retry on non-400 errors
		expect(mockFetch).toHaveBeenCalledOnce();
	});

	it("returns error message on unexpected response shape", async () => {
		mockFetch.mockResolvedValue({
			ok: true,
			status: 200,
			json: async () => ({ choices: [] }),
		} as unknown as Response);

		const result = await callLocal("test prompt", LOCALHOST, "llama3");
		expect(result).toBe("[AI summary unavailable: unexpected response shape]");
	});

	it("returns error message on network error", async () => {
		mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
		const result = await callLocal("test prompt", LOCALHOST, "llama3");
		expect(result).toBe("[AI summary unavailable: ECONNREFUSED]");
	});

	it("uses custom systemPrompt when provided", async () => {
		mockFetch.mockResolvedValue(fetchResponse("ok"));
		await callLocal("test", LOCALHOST, "llama3", 800, "Custom system prompt");

		const body = JSON.parse(mockFetch.mock.calls[0][1].body);
		expect(body.messages[0]).toEqual({ role: "system", content: "Custom system prompt" });
	});

	it("recognizes 127.0.0.1 and 0.0.0.0 as localhost", async () => {
		for (const host of ["http://127.0.0.1:8080", "http://0.0.0.0:1234"]) {
			mockFetch.mockResolvedValue(fetchResponse("ok"));
			await callLocal("test", host, "model");
			// Should use fetch (not requestUrl) for all localhost variants
			expect(mockRequestUrl).not.toHaveBeenCalled();
		}
	});
});

// ─── callLocal (non-localhost — uses requestUrl) ────────

describe("callLocal (non-localhost)", () => {
	const REMOTE = "https://my-inference-server.example.com";

	it("uses requestUrl for non-localhost URLs", async () => {
		mockRequestUrl.mockResolvedValue(chatCompletionResponse("  Remote result  "));
		const result = await callLocal("test prompt", REMOTE, "gpt-4");

		expect(result).toBe("Remote result");
		expect(mockRequestUrl).toHaveBeenCalledOnce();
		expect(mockFetch).not.toHaveBeenCalled();

		const opts = mockRequestUrl.mock.calls[0][0];
		expect(opts.url).toBe("https://my-inference-server.example.com/v1/chat/completions");
		expect(opts.method).toBe("POST");
	});

	it("returns error message on non-200 status", async () => {
		mockRequestUrl.mockResolvedValue(chatCompletionResponse("", 502));
		const result = await callLocal("test prompt", REMOTE, "gpt-4");
		expect(result).toBe("[AI summary unavailable: HTTP 502]");
	});

	it("returns error message on unexpected response shape", async () => {
		mockRequestUrl.mockResolvedValue({
			status: 200,
			json: { data: "wrong shape" },
			text: "",
		});
		const result = await callLocal("test prompt", REMOTE, "gpt-4");
		expect(result).toBe("[AI summary unavailable: unexpected response shape]");
	});

	it("returns error message on network error", async () => {
		mockRequestUrl.mockRejectedValue(new Error("timeout"));
		const result = await callLocal("test prompt", REMOTE, "gpt-4");
		expect(result).toBe("[AI summary unavailable: timeout]");
	});
});

// ─── callAI (provider router) ───────────────────────────

describe("callAI", () => {
	const baseConfig: AICallConfig = {
		provider: "anthropic",
		anthropicApiKey: "sk-test",
		anthropicModel: "claude-3-haiku",
		localEndpoint: "http://localhost:11434",
		localModel: "llama3",
	};

	it("routes to callAnthropic when provider is 'anthropic'", async () => {
		mockRequestUrl.mockResolvedValue(anthropicResponse("Anthropic result"));
		const result = await callAI("test", { ...baseConfig, provider: "anthropic" });

		expect(result).toBe("Anthropic result");
		expect(mockRequestUrl).toHaveBeenCalledOnce();
		const opts = mockRequestUrl.mock.calls[0][0];
		expect(opts.url).toBe("https://api.anthropic.com/v1/messages");
	});

	it("routes to callLocal when provider is 'local'", async () => {
		mockFetch.mockResolvedValue(fetchResponse("Local result"));
		const result = await callAI("test", { ...baseConfig, provider: "local" });

		expect(result).toBe("Local result");
		expect(mockFetch).toHaveBeenCalledOnce();
	});

	it("returns error for 'none' provider", async () => {
		const result = await callAI("test", { ...baseConfig, provider: "none" });
		expect(result).toBe("[AI summary unavailable: no provider configured]");
		expect(mockRequestUrl).not.toHaveBeenCalled();
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it("returns error for unknown provider value", async () => {
		const result = await callAI("test", {
			...baseConfig,
			provider: "openai" as AICallConfig["provider"],
		});
		expect(result).toBe("[AI summary unavailable: no provider configured]");
	});

	it("passes maxTokens and systemPrompt through to the provider", async () => {
		mockRequestUrl.mockResolvedValue(anthropicResponse("ok"));
		await callAI("prompt", { ...baseConfig, provider: "anthropic" }, 2048, "Be terse.");

		const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body as string);
		expect(body.max_tokens).toBe(2048);
		expect(body.system).toBe("Be terse.");
	});
});

// ─── MockAI (scripts/lib/mock-ai) ──────────────────────

import { getMockSummary } from "../../../scripts/lib/mock-ai";

describe("MockAI", () => {
	it("returns a valid AISummary shape", () => {
		const summary = getMockSummary("cloud-haiku-tier1");
		expect(summary).not.toBeNull();
		expect(summary!.headline).toBeTruthy();
		expect(summary!.tldr).toBeTruthy();
		expect(Array.isArray(summary!.themes)).toBe(true);
		expect(Array.isArray(summary!.notable)).toBe(true);
		expect(Array.isArray(summary!.questions)).toBe(true);
		expect(typeof summary!.category_summaries).toBe("object");
	});

	it("returns non-empty work_patterns and cross_source_connections", () => {
		const summary = getMockSummary("cloud-haiku-tier1");
		expect(Array.isArray(summary!.work_patterns)).toBe(true);
		expect(summary!.work_patterns!.length).toBeGreaterThan(0);
		expect(Array.isArray(summary!.cross_source_connections)).toBe(true);
		expect(summary!.cross_source_connections!.length).toBeGreaterThan(0);
	});

	it("embeds the preset id in the headline so outputs are distinguishable", () => {
		const summary = getMockSummary("cloud-sonnet-tier3");
		expect(summary!.headline).toContain("cloud-sonnet-tier3");
	});

	it("returns null for no-ai presets", () => {
		expect(getMockSummary("no-ai-minimal")).toBeNull();
		expect(getMockSummary("no-ai-full")).toBeNull();
	});
});

// ─── Anthropic Message Batches API ─────────────────────

import {
	submitAnthropicBatch,
	pollAnthropicBatch,
	retrieveAnthropicBatchResults,
	type AnthropicBatchRequest,
	type AnthropicBatchResponse,
} from "../../../src/summarize/ai-client";

function batchSubmitResponse(id = "msgbatch_123", status = 200) {
	const json: AnthropicBatchResponse = {
		id,
		processing_status: "in_progress",
		request_counts: { processing: 1, succeeded: 0, errored: 0, canceled: 0, expired: 0 },
	};
	return { status, json, text: JSON.stringify(json) };
}

function batchStatusResponse(
	id: string,
	processingStatus: AnthropicBatchResponse["processing_status"],
	resultsUrl?: string,
	status = 200
) {
	const json: AnthropicBatchResponse = {
		id,
		processing_status: processingStatus,
		request_counts: { processing: 0, succeeded: 1, errored: 0, canceled: 0, expired: 0 },
		results_url: resultsUrl,
	};
	return { status, json, text: JSON.stringify(json) };
}

function batchResultsResponse(lines: object[], status = 200) {
	const text = lines.map((l) => JSON.stringify(l)).join("\n");
	return { status, json: {}, text };
}

const SAMPLE_REQUEST: AnthropicBatchRequest = {
	custom_id: "preset-cloud-haiku-tier1",
	params: {
		model: "claude-haiku-4-5-20251001",
		max_tokens: 1500,
		messages: [{ role: "user", content: "Summarize today." }],
	},
};

describe("submitAnthropicBatch", () => {
	it("POSTs to /v1/messages/batches with the beta header", async () => {
		mockRequestUrl.mockResolvedValue(batchSubmitResponse());
		await submitAnthropicBatch([SAMPLE_REQUEST], "sk-key");

		const opts = mockRequestUrl.mock.calls[0][0];
		expect(opts.url).toBe("https://api.anthropic.com/v1/messages/batches");
		expect(opts.method).toBe("POST");
		expect(opts.headers?.["anthropic-beta"]).toBe("message-batches-2024-09-24");
		expect(opts.headers?.["x-api-key"]).toBe("sk-key");
	});

	it("serialises requests in the body", async () => {
		mockRequestUrl.mockResolvedValue(batchSubmitResponse());
		await submitAnthropicBatch([SAMPLE_REQUEST], "sk-key");

		const body = JSON.parse(mockRequestUrl.mock.calls[0][0].body as string);
		expect(body.requests).toHaveLength(1);
		expect(body.requests[0].custom_id).toBe("preset-cloud-haiku-tier1");
		expect(body.requests[0].params.model).toBe("claude-haiku-4-5-20251001");
	});

	it("returns the parsed batch response", async () => {
		mockRequestUrl.mockResolvedValue(batchSubmitResponse("msgbatch_abc"));
		const result = await submitAnthropicBatch([SAMPLE_REQUEST], "sk-key");
		expect(result.id).toBe("msgbatch_abc");
		expect(result.processing_status).toBe("in_progress");
	});

	it("throws on non-200 status", async () => {
		mockRequestUrl.mockResolvedValue(batchSubmitResponse("x", 429));
		await expect(submitAnthropicBatch([SAMPLE_REQUEST], "sk-key")).rejects.toThrow(
			"Batch submit failed: HTTP 429"
		);
	});
});

describe("pollAnthropicBatch", () => {
	it("GETs /v1/messages/batches/{id} with the beta header", async () => {
		mockRequestUrl.mockResolvedValue(
			batchStatusResponse("msgbatch_123", "ended", "https://api.anthropic.com/v1/messages/batches/msgbatch_123/results")
		);
		await pollAnthropicBatch("msgbatch_123", "sk-key", { intervalMs: 0 });

		const opts = mockRequestUrl.mock.calls[0][0];
		expect(opts.url).toBe("https://api.anthropic.com/v1/messages/batches/msgbatch_123");
		expect(opts.method).toBe("GET");
		expect(opts.headers?.["anthropic-beta"]).toBe("message-batches-2024-09-24");
	});

	it("returns immediately when already ended", async () => {
		mockRequestUrl.mockResolvedValue(
			batchStatusResponse("msgbatch_123", "ended", "https://results.example.com")
		);
		const result = await pollAnthropicBatch("msgbatch_123", "sk-key", { intervalMs: 0 });
		expect(result.processing_status).toBe("ended");
		expect(mockRequestUrl).toHaveBeenCalledOnce();
	});

	it("polls until status is ended", async () => {
		mockRequestUrl
			.mockResolvedValueOnce(batchStatusResponse("b1", "in_progress"))
			.mockResolvedValueOnce(batchStatusResponse("b1", "in_progress"))
			.mockResolvedValueOnce(batchStatusResponse("b1", "ended", "https://r.example.com"));
		const result = await pollAnthropicBatch("b1", "sk-key", { intervalMs: 0 });
		expect(result.processing_status).toBe("ended");
		expect(mockRequestUrl).toHaveBeenCalledTimes(3);
	});

	it("throws after maxAttempts without completion", async () => {
		mockRequestUrl.mockResolvedValue(batchStatusResponse("b1", "in_progress"));
		await expect(
			pollAnthropicBatch("b1", "sk-key", { intervalMs: 0, maxAttempts: 2 })
		).rejects.toThrow("did not complete");
	});

	it("throws on non-200 status", async () => {
		mockRequestUrl.mockResolvedValue(batchStatusResponse("b1", "in_progress", undefined, 500));
		await expect(
			pollAnthropicBatch("b1", "sk-key", { intervalMs: 0 })
		).rejects.toThrow("Batch poll failed: HTTP 500");
	});
});

describe("retrieveAnthropicBatchResults", () => {
	const RESULTS_URL = "https://api.anthropic.com/v1/messages/batches/msgbatch_123/results";

	it("GETs the results URL with the beta header", async () => {
		mockRequestUrl.mockResolvedValue(
			batchResultsResponse([
				{ custom_id: "preset-a", result: { type: "succeeded", message: { content: [{ type: "text", text: "ok" }] } } },
			])
		);
		await retrieveAnthropicBatchResults(RESULTS_URL, "sk-key");

		const opts = mockRequestUrl.mock.calls[0][0];
		expect(opts.url).toBe(RESULTS_URL);
		expect(opts.method).toBe("GET");
		expect(opts.headers?.["anthropic-beta"]).toBe("message-batches-2024-09-24");
	});

	it("parses JSONL and returns one item per line", async () => {
		const lines = [
			{ custom_id: "a", result: { type: "succeeded", message: { content: [{ type: "text", text: "summary A" }] } } },
			{ custom_id: "b", result: { type: "errored", error: { type: "api_error", message: "rate limited" } } },
		];
		mockRequestUrl.mockResolvedValue(batchResultsResponse(lines));
		const results = await retrieveAnthropicBatchResults(RESULTS_URL, "sk-key");

		expect(results).toHaveLength(2);
		expect(results[0].custom_id).toBe("a");
		expect(results[0].result.type).toBe("succeeded");
		expect(results[1].custom_id).toBe("b");
		expect(results[1].result.type).toBe("errored");
	});

	it("handles trailing newline in JSONL gracefully", async () => {
		const text = '{"custom_id":"x","result":{"type":"succeeded","message":{"content":[{"type":"text","text":"ok"}]}}}\n';
		mockRequestUrl.mockResolvedValue({ status: 200, json: {}, text });
		const results = await retrieveAnthropicBatchResults(RESULTS_URL, "sk-key");
		expect(results).toHaveLength(1);
		expect(results[0].custom_id).toBe("x");
	});

	it("throws on non-200 status", async () => {
		mockRequestUrl.mockResolvedValue({ status: 403, json: {}, text: "" });
		await expect(retrieveAnthropicBatchResults(RESULTS_URL, "sk-key")).rejects.toThrow(
			"Batch results fetch failed: HTTP 403"
		);
	});
});
