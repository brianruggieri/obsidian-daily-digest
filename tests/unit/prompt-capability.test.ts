/**
 * Model capability resolution — unit tests for resolvePromptCapability (Issue #45).
 *
 * Verifies that the correct prompt complexity tier is selected for each
 * provider/model combination.
 */

import { describe, it, expect } from "vitest";
import { resolvePromptCapability } from "../../src/summarize/summarize";

describe("resolvePromptCapability — Anthropic", () => {
	it("Sonnet → high", () => {
		expect(resolvePromptCapability("claude-sonnet-4-6", "anthropic")).toBe("high");
	});

	it("Opus → high", () => {
		expect(resolvePromptCapability("claude-opus-4-6", "anthropic")).toBe("high");
	});

	it("Haiku → balanced", () => {
		expect(resolvePromptCapability("claude-haiku-4-5-20251001", "anthropic")).toBe("balanced");
	});

	it("unknown Anthropic model → balanced (safe default)", () => {
		expect(resolvePromptCapability("claude-future-model", "anthropic")).toBe("balanced");
	});
});

describe("resolvePromptCapability — local models", () => {
	it("14b model → balanced", () => {
		expect(resolvePromptCapability("qwen2.5:14b-instruct", "local")).toBe("balanced");
	});

	it("22b model → balanced", () => {
		expect(resolvePromptCapability("mistral:22b", "local")).toBe("balanced");
	});

	it("32b model → balanced", () => {
		expect(resolvePromptCapability("qwen2.5:32b", "local")).toBe("balanced");
	});

	it("70b model → balanced", () => {
		expect(resolvePromptCapability("llama3.1:70b", "local")).toBe("balanced");
	});

	it("7b model → lite", () => {
		expect(resolvePromptCapability("qwen2.5:7b-instruct", "local")).toBe("lite");
	});

	it("3b model → lite", () => {
		expect(resolvePromptCapability("llama3.2:3b", "local")).toBe("lite");
	});

	it("unlabeled small model → lite", () => {
		expect(resolvePromptCapability("phi3:mini", "local")).toBe("lite");
	});
});

describe("resolvePromptCapability — unknown provider", () => {
	it("unknown provider → balanced (safe default)", () => {
		expect(resolvePromptCapability("some-model", "openai")).toBe("balanced");
	});
});
