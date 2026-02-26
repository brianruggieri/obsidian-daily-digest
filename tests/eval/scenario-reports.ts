/**
 * Scenario Report Templates
 *
 * Generates specialized reports for real-world decision scenarios
 */

export interface ScenarioReport {
  scenario: string;
  decision: string;
  recommendation: string;
  metrics: Record<string, number | string>;
  risks: string[];
  benefits: string[];
}

export class ScenarioReporter {
  /**
   * Scenario 1: Cost-Benefit Analysis
   * "Should we use Claude instead of local LLM?"
   */
  generateCostBenefitReport(results: any[]): ScenarioReport {
    const local = results.find(r => r.provider === "local");
    const claude = results.find(r => r.provider === "anthropic");

    if (!local || !claude) {
      throw new Error("Cost-benefit requires local and claude results");
    }

    const qualityGain = ((claude.quality - local.quality) * 100).toFixed(1);
    const costDifference = (claude.cost - local.cost).toFixed(4);
    const costPerQualityPoint = (claude.cost / (claude.quality - local.quality)).toFixed(4);

    return {
      scenario: "cost-benefit-analysis",
      decision: qualityGain > 10 ? "recommend-claude" : "local-sufficient",
      recommendation: qualityGain > 10
        ? `Claude +${qualityGain}% quality for $${costDifference}/day — recommended for premium tier`
        : `Local LLM sufficient (+${qualityGain}% gap, $0 cost) — recommend for standard tier`,
      metrics: {
        "Local Quality": `${(local.quality * 100).toFixed(0)}%`,
        "Claude Quality": `${(claude.quality * 100).toFixed(0)}%`,
        "Quality Gap": `${qualityGain}%`,
        "Cost Difference": `$${costDifference}`,
        "Cost per 1% Quality": `$${costPerQualityPoint}`,
      },
      benefits: qualityGain > 10
        ? ["Higher summary quality", "Better work pattern detection", "Cross-source connections"]
        : ["Zero cost", "Instant processing", "On-device privacy"],
      risks: qualityGain > 10
        ? ["Ongoing API costs", "Rate limit dependency"]
        : ["Lower quality summaries", "Missing subtle patterns"],
    };
  }

  /**
   * Scenario 2: Privacy Audit
   * "Do we comply with privacy requirements for each tier?"
   */
  generatePrivacyAuditReport(results: any[]): ScenarioReport {
    const tier4 = results.find(r => r.tier === "tier-4-deidentified");
    const tier1 = results.find(r => r.tier === "tier-1-standard");

    if (!tier4 || !tier1) {
      throw new Error("Privacy audit requires tier-4 and tier-1 results");
    }

    const tier4Compliant = tier4.privacy.compliant;
    const tier1Compliant = tier1.privacy.compliant;

    return {
      scenario: "privacy-audit",
      decision: tier4Compliant && tier1Compliant ? "pass" : "fail",
      recommendation: tier4Compliant && tier1Compliant
        ? "All privacy tiers pass validation. Safe for release."
        : `Privacy violations detected. Review: Tier 4 ${tier4Compliant ? "✓" : "✗"}, Tier 1 ${tier1Compliant ? "✓" : "✗"}`,
      metrics: {
        "Tier 4 Status": tier4Compliant ? "✓ Compliant" : "✗ Violations",
        "Tier 1 Status": tier1Compliant ? "✓ Compliant" : "✗ Violations",
        "Tier 4 Leaks": tier4.privacy.leaks || 0,
        "Tier 1 Leaks": tier1.privacy.leaks || 0,
      },
      benefits: ["Regulatory compliance", "User trust", "Security audit-ready"],
      risks: tier4Compliant && tier1Compliant ? [] : ["Data exposure risk", "Regulatory violation"],
    };
  }

  /**
   * Scenario 3: Quality Regression Detection
   * "Has quality dropped since last release?"
   */
  generateRegressionReport(currentResults: any[], previousResults?: any[]): ScenarioReport {
    const current = currentResults.find(r => r.provider === "anthropic");

    if (!current) {
      throw new Error("Regression detection requires anthropic results");
    }

    if (!previousResults) {
      return {
        scenario: "quality-regression",
        decision: "baseline",
        recommendation: "No previous results. Establishing baseline.",
        metrics: {
          "Current Quality": `${(current.quality * 100).toFixed(0)}%`,
          "Status": "Baseline",
        },
        benefits: ["Baseline established for future comparison"],
        risks: [],
      };
    }

    const previous = previousResults.find(r => r.provider === "anthropic");
    const qualityDelta = ((current.quality - previous.quality) * 100).toFixed(1);
    const isRegression = current.quality < previous.quality * 0.95; // 5% threshold

    return {
      scenario: "quality-regression",
      decision: isRegression ? "block-merge" : "approve",
      recommendation: isRegression
        ? `Quality regression detected: ${qualityDelta}% (threshold: -5%). Block merge and investigate.`
        : `Quality stable: ${qualityDelta}% change (within threshold). Approve.`,
      metrics: {
        "Previous Quality": `${(previous.quality * 100).toFixed(0)}%`,
        "Current Quality": `${(current.quality * 100).toFixed(0)}%`,
        "Change": `${qualityDelta}%`,
        "Threshold": "-5%",
        "Status": isRegression ? "REGRESSION" : "STABLE",
      },
      benefits: ["Prevents quality loss", "Maintains user experience"],
      risks: isRegression ? ["Need investigation before release"] : [],
    };
  }

  /**
   * Scenario 4: Persona-Specific Quality
   * "Does each user type get appropriate quality?"
   */
  generatePersonaQualityReport(results: any[]): ScenarioReport {
    const personas = {
      engineer: results.filter(r => r.persona.includes("Engineer")),
      researcher: results.filter(r => r.persona.includes("Researcher")),
      pm: results.filter(r => r.persona.includes("Manager")),
      student: results.filter(r => r.persona.includes("Student")),
    };

    const avgQuality = (results: any[]) =>
      results.reduce((sum, r) => sum + (r.quality || 0), 0) / (results.length || 1);

    const metrics: Record<string, string> = {};
    let allMeet = true;

    for (const [persona, results] of Object.entries(personas)) {
      const avg = avgQuality(results as any[]);
      const threshold = persona === "engineer" ? 0.85 : 0.75;
      metrics[`${persona} Quality`] = `${(avg * 100).toFixed(0)}% ${avg >= threshold ? "✓" : "✗"}`;
      if (avg < threshold) allMeet = false;
    }

    return {
      scenario: "persona-quality",
      decision: allMeet ? "approve" : "investigate",
      recommendation: allMeet
        ? "All personas meet quality thresholds. Good for release."
        : "Some personas below quality threshold. Investigate prompt adjustments.",
      metrics,
      benefits: ["Tailored user experience", "Quality assurance per segment"],
      risks: allMeet ? [] : ["Poor experience for certain user types"],
    };
  }
}
