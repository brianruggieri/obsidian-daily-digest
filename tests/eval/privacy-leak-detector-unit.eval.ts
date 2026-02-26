import { describe, it, expect } from "vitest";
import { PrivacyLeakDetector, LeakReport } from "./privacy-leak-detector";

describe("PrivacyLeakDetector", () => {
  it("detects URLs in tier-4 deidentified output", () => {
    const detector = new PrivacyLeakDetector("tier-4-deidentified");
    const output = {
      headline: "Day of research",
      summary: "Visited https://github.com for work",
      work_patterns: [],
      cross_source_connections: [],
    };

    const report = detector.validate(output);
    expect(report.passed).toBe(false);
    expect(report.violations).toContain("URL found in tier-4 output: https://github.com");
  });

  it("allows aggregates in tier-4 deidentified output", () => {
    const detector = new PrivacyLeakDetector("tier-4-deidentified");
    const output = {
      headline: "Day of focused research",
      summary: "Spent 4 hours in research mode, primarily on OAuth patterns",
      work_patterns: [
        { pattern: "Research → Implementation cycle", confidence: 0.85 },
      ],
      cross_source_connections: ["OAuth concepts mentioned across 5 sources"],
    };

    const report = detector.validate(output);
    expect(report.passed).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it("detects secrets even in tier-1 standard output", () => {
    const detector = new PrivacyLeakDetector("tier-1-standard");
    const output = {
      summary: "API key: sk-ant-abc123def456",
      work_patterns: [],
      cross_source_connections: [],
    };

    const report = detector.validate(output);
    expect(report.passed).toBe(false);
    expect(report.violations.some(v => v.includes("API key"))).toBe(true);
  });
});
