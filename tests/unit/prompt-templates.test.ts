import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";

vi.mock("fs");

describe("loadPromptTemplate", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns file content when template file exists", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("Hello {{name}}!" as any);
    const { loadPromptTemplate } = await import("../../src/prompt-templates");
    const result = loadPromptTemplate("standard", "/some/dir");
    expect(result).toBe("Hello {{name}}!");
  });

  it("returns built-in default when file does not exist", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const { loadPromptTemplate, BUILT_IN_PROMPTS } = await import("../../src/prompt-templates");
    const result = loadPromptTemplate("standard", "/some/dir");
    expect(result).toBe(BUILT_IN_PROMPTS["standard"]);
  });

  it("returns built-in default when promptsDir is undefined", async () => {
    const { loadPromptTemplate, BUILT_IN_PROMPTS } = await import("../../src/prompt-templates");
    const result = loadPromptTemplate("standard", undefined);
    expect(result).toBe(BUILT_IN_PROMPTS["standard"]);
  });
});

describe("fillTemplate", () => {
  it("replaces all {{variable}} occurrences", async () => {
    const { fillTemplate } = await import("../../src/prompt-templates");
    const result = fillTemplate("Hello {{name}}, you are {{age}}.", { name: "Alice", age: "30" });
    expect(result).toBe("Hello Alice, you are 30.");
  });

  it("leaves unreplaced variables as-is", async () => {
    const { fillTemplate } = await import("../../src/prompt-templates");
    const result = fillTemplate("Hello {{name}}.", {});
    expect(result).toBe("Hello {{name}}.");
  });
});
