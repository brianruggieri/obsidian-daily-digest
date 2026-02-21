import { describe, it, expect } from "vitest";
import { getMockSummary } from "../../scripts/lib/mock-ai";

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

  it("embeds the preset id in the headline so outputs are distinguishable", () => {
    const summary = getMockSummary("cloud-sonnet-tier3");
    expect(summary!.headline).toContain("cloud-sonnet-tier3");
  });

  it("returns null for no-ai presets", () => {
    expect(getMockSummary("no-ai-minimal")).toBeNull();
    expect(getMockSummary("no-ai-full")).toBeNull();
  });
});
