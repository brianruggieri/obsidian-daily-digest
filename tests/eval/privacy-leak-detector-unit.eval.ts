import { describe, it, expect } from "vitest";
import { PrivacyLeakDetector } from "./privacy-leak-detector";

describe("PrivacyLeakDetector", () => {
  it("detects URLs in tier-4 deidentified output", () => {
    const detector = new PrivacyLeakDetector("tier-4-deidentified");
    const output = JSON.stringify({
      headline: "Day of research",
      summary: "Visited https://github.com for work",
      work_patterns: [],
      cross_source_connections: [],
    });

    const report = detector.validate(output);
    expect(report.passed).toBe(false);
    expect(report.violations.some((v) => v.includes("URL"))).toBe(true);
  });

  it("allows aggregates in tier-4 deidentified output", () => {
    const detector = new PrivacyLeakDetector("tier-4-deidentified");
    const output = JSON.stringify({
      headline: "Day of focused research",
      summary: "Spent 4 hours in research mode, primarily on OAuth patterns",
      work_patterns: [
        { pattern: "Research → Implementation cycle", confidence: 0.85 },
      ],
      cross_source_connections: ["OAuth concepts mentioned across 5 sources"],
    });

    const report = detector.validate(output);
    expect(report.passed).toBe(true);
    expect(report.violations).toHaveLength(0);
  });

  it("detects secrets even in tier-1 standard output", () => {
    const detector = new PrivacyLeakDetector("tier-1-standard");
    const output = JSON.stringify({
      summary: "API key: sk-ant-abc123def456ghijklmnopqr",
      work_patterns: [],
      cross_source_connections: [],
    });

    const report = detector.validate(output);
    expect(report.passed).toBe(false);
    expect(report.secrets_found.length).toBeGreaterThan(0);
  });
});
