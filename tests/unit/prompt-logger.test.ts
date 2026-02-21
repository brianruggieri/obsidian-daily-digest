import { describe, it, expect } from "vitest";
import { createPromptLog, appendPromptEntry, formatDetailsBlock, estimateTokens } from "../../scripts/lib/prompt-logger";

describe("PromptLogger", () => {
  it("starts empty", () => {
    const log = createPromptLog();
    expect(log).toEqual([]);
  });

  it("appends entries", () => {
    const log = createPromptLog();
    appendPromptEntry(log, {
      stage: "summarize",
      model: "claude-haiku-4-5-20251001",
      tokenCount: 1200,
      privacyTier: 1,
      prompt: "You are a productivity assistant...",
    });
    expect(log).toHaveLength(1);
    expect(log[0].stage).toBe("summarize");
  });

  it("formats a details block with token count and model in summary line", () => {
    const log = createPromptLog();
    appendPromptEntry(log, {
      stage: "summarize",
      model: "claude-haiku-4-5-20251001",
      tokenCount: 842,
      privacyTier: 2,
      prompt: "Hello world",
    });
    const block = formatDetailsBlock(log[0]);
    expect(block).toContain("<details>");
    expect(block).toContain("claude-haiku-4-5-20251001");
    expect(block).toContain("842 tokens");
    expect(block).toContain("Tier 2");
    expect(block).toContain("Hello world");
    expect(block).toContain("</details>");
  });

  it("estimateTokens returns ~1 token per 4 chars", () => {
    expect(estimateTokens("abcdefgh")).toBe(2); // 8 chars / 4 = 2
  });
});
