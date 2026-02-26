import { describe, it, expect, beforeEach } from "vitest";
import { ScenarioReporter } from "../../tests/eval/scenario-reports";

describe("Matrix Enhancement Integration Tests", () => {
  let reporter: ScenarioReporter;

  const mockResults = [
    {
      provider: "mock",
      persona: "Software Engineer",
      quality: 0.85,
      cost: 0,
      privacy: { leaks: 0, compliant: true },
      tier: "tier-4-deidentified",
    },
    {
      provider: "local",
      persona: "Software Engineer",
      quality: 0.87,
      cost: 0,
      privacy: { leaks: 0, compliant: true },
      tier: "tier-4-deidentified",
    },
    {
      provider: "anthropic",
      persona: "Software Engineer",
      quality: 0.98,
      cost: 0.0012,
      privacy: { leaks: 0, compliant: true },
      tier: "tier-4-deidentified",
    },
  ];

  const mockTierResults = [
    {
      provider: "mock",
      persona: "Engineer",
      quality: 0.85,
      cost: 0,
      privacy: { leaks: 0, compliant: true },
      tier: "tier-4-deidentified",
    },
    {
      provider: "local",
      persona: "Engineer",
      quality: 0.87,
      cost: 0,
      privacy: { leaks: 0, compliant: true },
      tier: "tier-4-deidentified",
    },
    {
      provider: "mock",
      persona: "Engineer",
      quality: 0.82,
      cost: 0,
      privacy: { leaks: 0, compliant: true },
      tier: "tier-1-standard",
    },
    {
      provider: "local",
      persona: "Engineer",
      quality: 0.84,
      cost: 0,
      privacy: { leaks: 0, compliant: true },
      tier: "tier-1-standard",
    },
  ];

  beforeEach(() => {
    reporter = new ScenarioReporter();
  });

  describe("Cost-Benefit Analysis", () => {
    it("calculates quality gap correctly", () => {
      const report = reporter.generateCostBenefitReport(mockResults);
      expect(report.scenario).toBe("cost-benefit-analysis");
      expect(report.metrics["Quality Gap"]).toBe("11.0%");
    });

    it("recommends Claude for significant quality gap", () => {
      const report = reporter.generateCostBenefitReport(mockResults);
      expect(report.decision).toBe("recommend-claude");
      expect(report.recommendation).toContain("recommended for premium tier");
    });

    it("recommends local LLM for small quality gap", () => {
      const smallGapResults = [
        { ...mockResults[1], quality: 0.95 },
        { ...mockResults[2], quality: 0.98 },
      ];
      const report = reporter.generateCostBenefitReport(smallGapResults);
      expect(report.decision).toBe("local-sufficient");
      expect(report.recommendation).toContain("Local LLM sufficient");
    });

    it("includes cost difference metric", () => {
      const report = reporter.generateCostBenefitReport(mockResults);
      expect(report.metrics["Cost Difference"]).toBeDefined();
      expect(report.metrics["Cost per 1% Quality"]).toBeDefined();
    });

    it("lists benefits and risks", () => {
      const report = reporter.generateCostBenefitReport(mockResults);
      expect(report.benefits.length).toBeGreaterThan(0);
      expect(report.risks.length).toBeGreaterThan(0);
    });
  });

  describe("Privacy Audit Report", () => {
    it("passes when all tiers compliant", () => {
      const report = reporter.generatePrivacyAuditReport(mockTierResults);
      expect(report.decision).toBe("pass");
      expect(report.metrics["Tier 4 Status"]).toContain("✓");
    });

    it("fails when privacy leaks detected", () => {
      const leakyResults = [
        { ...mockTierResults[0], tier: "tier-4-deidentified", privacy: { leaks: 1, compliant: false } },
        { ...mockTierResults[2], tier: "tier-1-standard", privacy: { leaks: 0, compliant: true } },
      ];
      const report = reporter.generatePrivacyAuditReport(leakyResults);
      expect(report.decision).toBe("fail");
      expect(report.metrics["Tier 4 Leaks"]).toBe(1);
    });

    it("includes compliance metrics", () => {
      const report = reporter.generatePrivacyAuditReport(mockTierResults);
      expect(report.metrics["Tier 4 Status"]).toBeDefined();
      expect(report.metrics["Tier 1 Status"]).toBeDefined();
    });

    it("recommends regulatory compliance", () => {
      const report = reporter.generatePrivacyAuditReport(mockTierResults);
      expect(report.benefits).toContain("Regulatory compliance");
      expect(report.benefits).toContain("User trust");
    });
  });

  describe("Quality Regression Detection", () => {
    it("approves when quality stable", () => {
      const current = [{ ...mockResults[2], quality: 0.98 }];
      const previous = [{ ...mockResults[2], quality: 0.97 }];
      const report = reporter.generateRegressionReport(current, previous);
      expect(report.decision).toBe("approve");
    });

    it("blocks merge on regression", () => {
      const current = [{ ...mockResults[2], quality: 0.90 }];
      const previous = [{ ...mockResults[2], quality: 0.98 }];
      const report = reporter.generateRegressionReport(current, previous);
      expect(report.decision).toBe("block-merge");
      expect(report.metrics["Status"]).toBe("REGRESSION");
    });

    it("uses 5% threshold correctly", () => {
      const current = [{ ...mockResults[2], quality: 0.94 }]; // 4% drop
      const previous = [{ ...mockResults[2], quality: 0.98 }];
      const report = reporter.generateRegressionReport(current, previous);
      expect(report.decision).toBe("approve"); // Within 5% threshold
    });

    it("establishes baseline when no previous results", () => {
      const current = [{ ...mockResults[2], quality: 0.98 }];
      const report = reporter.generateRegressionReport(current, undefined);
      expect(report.decision).toBe("baseline");
      expect(report.recommendation).toContain("Establishing baseline");
    });

    it("calculates quality delta", () => {
      const current = [{ ...mockResults[2], quality: 0.95 }];
      const previous = [{ ...mockResults[2], quality: 0.98 }];
      const report = reporter.generateRegressionReport(current, previous);
      expect(report.metrics["Change"]).toBe("-3.0%");
    });
  });

  describe("Persona-Specific Quality", () => {
    const personaResults = [
      {
        provider: "anthropic",
        persona: "Software Engineer",
        quality: 0.88,
        cost: 0.0012,
        privacy: { leaks: 0, compliant: true },
      },
      {
        provider: "anthropic",
        persona: "Research Knowledge Worker",
        quality: 0.80,
        cost: 0.0012,
        privacy: { leaks: 0, compliant: true },
      },
      {
        provider: "anthropic",
        persona: "Product Manager",
        quality: 0.79,
        cost: 0.0012,
        privacy: { leaks: 0, compliant: true },
      },
      {
        provider: "anthropic",
        persona: "Student",
        quality: 0.81,
        cost: 0.0012,
        privacy: { leaks: 0, compliant: true },
      },
    ];

    it("generates persona quality report", () => {
      const report = reporter.generatePersonaQualityReport(personaResults);
      expect(report.scenario).toBe("persona-quality");
      expect(["approve", "investigate"]).toContain(report.decision);
      expect(Object.keys(report.metrics).length).toBeGreaterThan(0);
    });

    it("investigates when persona below threshold", () => {
      const lowPersonaResults = [
        personaResults[0],
        { ...personaResults[1], quality: 0.70 }, // Below 75% threshold for researcher
      ];
      const report = reporter.generatePersonaQualityReport(lowPersonaResults);
      expect(report.decision).toBe("investigate");
    });

    it("applies engineer-specific threshold (85%)", () => {
      const engineerThreshold = [
        { ...personaResults[0], persona: "Software Engineer", quality: 0.84 }, // Below 85% threshold
      ];
      const report = reporter.generatePersonaQualityReport(engineerThreshold);
      expect(report.decision).toBe("investigate");
    });

    it("includes all persona metrics", () => {
      const report = reporter.generatePersonaQualityReport(personaResults);
      expect(Object.keys(report.metrics).length).toBeGreaterThan(0);
      expect(
        Object.values(report.metrics).some((m) => m.toString().includes("✓"))
      ).toBe(true);
    });

    it("recommends prompt adjustments when needed", () => {
      const lowPersonaResults = [
        { ...personaResults[0], quality: 0.70 },
      ];
      const report = reporter.generatePersonaQualityReport(lowPersonaResults);
      expect(report.recommendation).toContain("prompt adjustments");
    });
  });

  describe("Scenario Integration", () => {
    it("cost-benefit analysis triggers for provider decision", () => {
      const report = reporter.generateCostBenefitReport(mockResults);
      expect(report.scenario).toBe("cost-benefit-analysis");
      expect(report.decision).toBeDefined();
      expect(report.recommendation).toBeDefined();
    });

    it("privacy audit validates compliance", () => {
      const report = reporter.generatePrivacyAuditReport(mockTierResults);
      expect(report.scenario).toBe("privacy-audit");
      expect(["pass", "fail"]).toContain(report.decision);
    });

    it("regression detection prevents quality loss", () => {
      const report = reporter.generateRegressionReport(mockResults, mockResults);
      expect(report.scenario).toBe("quality-regression");
      expect(["approve", "block-merge", "baseline"]).toContain(report.decision);
    });

    it("persona quality ensures user experience", () => {
      const multiPersonaResults = [
        {
          provider: "anthropic",
          persona: "Software Engineer",
          quality: 0.88,
          cost: 0,
          privacy: { leaks: 0, compliant: true },
        },
        {
          provider: "anthropic",
          persona: "Researcher",
          quality: 0.82,
          cost: 0,
          privacy: { leaks: 0, compliant: true },
        },
      ];
      const report = reporter.generatePersonaQualityReport(multiPersonaResults);
      expect(report.scenario).toBe("persona-quality");
      expect(["approve", "investigate"]).toContain(report.decision);
    });
  });
});
