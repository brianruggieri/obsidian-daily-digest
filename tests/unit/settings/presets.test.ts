import { describe, it, expect } from "vitest";
import { PRESETS, BASE_SETTINGS, resolvePreset } from "../../../scripts/presets";

describe("Presets", () => {
  it("exports exactly 11 presets", () => {
    expect(PRESETS).toHaveLength(11);
  });

  it("every preset has a unique id", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every preset has id, description, and settings", () => {
    for (const preset of PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.description).toBeTruthy();
      expect(preset.settings).toBeDefined();
    }
  });

  it("BASE_SETTINGS has all required fields", () => {
    expect(BASE_SETTINGS.enableBrowser).toBeDefined();
    expect(BASE_SETTINGS.aiProvider).toBeDefined();
  });

  it("resolvePreset merges settings over base", () => {
    const preset = PRESETS.find(p => p.id === "no-ai-minimal")!;
    const resolved = resolvePreset(preset);
    expect(resolved.enableAI).toBe(false);
    expect(resolved.aiProvider).toBe("none");
  });
});

describe("local LLM presets", () => {
  it("local-llm-classified resolves correctly", () => {
    const preset = PRESETS.find(p => p.id === "local-llm-classified")!;
    expect(preset).toBeDefined();
    const settings = resolvePreset(preset);
    expect(settings.aiProvider).toBe("local");
    expect(settings.enableClassification).toBe(true);
    expect(settings.enableRAG).toBe(false);
    expect(settings.enablePatterns).toBe(true);
  });

  it("local-llm-rag resolves correctly", () => {
    const preset = PRESETS.find(p => p.id === "local-llm-rag")!;
    expect(preset).toBeDefined();
    const settings = resolvePreset(preset);
    expect(settings.aiProvider).toBe("local");
    expect(settings.enableRAG).toBe(true);
    expect(settings.enableClassification).toBe(false);
    expect(settings.enablePatterns).toBe(true);
    expect(settings.ragTopK).toBe(8);
    expect(settings.embeddingModel).toBe("nomic-embed-text");
  });

  it("local-llm-basic resolves correctly", () => {
    const preset = PRESETS.find(p => p.id === "local-llm-basic")!;
    expect(preset).toBeDefined();
    const settings = resolvePreset(preset);
    expect(settings.aiProvider).toBe("local");
    expect(settings.enableRAG).toBe(false);
    expect(settings.enableClassification).toBe(false);
    expect(settings.enablePatterns).toBe(true);
  });
});
