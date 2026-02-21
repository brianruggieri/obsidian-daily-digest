import { describe, it, expect } from "vitest";
import { PRESETS, BASE_SETTINGS, resolvePreset } from "../../scripts/presets";

describe("Presets", () => {
  it("exports exactly 12 presets", () => {
    expect(PRESETS).toHaveLength(12);
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
    expect(BASE_SETTINGS.collectionMode).toBeDefined();
  });

  it("resolvePreset merges settings over base", () => {
    const preset = PRESETS.find(p => p.id === "no-ai-minimal")!;
    const resolved = resolvePreset(preset);
    expect(resolved.enableAI).toBe(false);
    expect(resolved.aiProvider).toBe("none");
  });
});
