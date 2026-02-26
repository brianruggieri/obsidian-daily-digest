# Matrix Validation Enhancement Plan
## Scenarios, CLI, and User-Facing Integration

**Date:** 2026-02-25
**Status:** Ready for implementation
**For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

---

## Overview

Build complete integration of matrix validation into real-world workflows:
1. **Enhanced Reporting** — Scenario-specific report templates
2. **Real-World Scenarios** — CI/CD, analytics, visualization integration
3. **CLI Commands** — npm scripts for common use cases
4. **User-Facing Documentation** — Settings UI, README, release notes

**Goals:**
- Matrix validation fully integrated into development workflow
- Cost/privacy/quality decisions backed by data
- Non-technical stakeholders can understand trade-offs
- Automated gates prevent regressions

---

## Batch 1: Enhanced Reporting & Scenario Templates (Tasks 1-3)

### Task 1: Create Scenario Report Templates

**Files:**
- Create: `tests/eval/scenario-reports.ts`

**Implementation:**

```typescript
cat > tests/eval/scenario-reports.ts << 'EOF'
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
    const mock = results.find(r => r.provider === "mock");
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
EOF
npm run test:eval -- tests/eval/scenario-reports.ts 2>&1 | head -20
```

**Expected Output:** Tests created, ready for implementation

**Commit:**
```bash
git add tests/eval/scenario-reports.ts
git commit -m "feat: add scenario-specific report templates (cost-benefit, privacy audit, regression, persona quality)"
```

---

### Task 2: Create CI/CD Integration Module

**Files:**
- Create: `scripts/matrix-ci-gate.ts`

**Implementation:**

```typescript
cat > scripts/matrix-ci-gate.ts << 'EOF'
#!/usr/bin/env node

/**
 * Matrix CI Gate
 *
 * Blocks merges/deploys based on validation metrics
 * Exit code 0 = pass, 1 = fail
 */

import { readFileSync } from "fs";
import { join } from "path";

interface Gate {
  name: string;
  check: (data: any) => boolean;
  errorMsg: string;
}

const gates: Gate[] = [
  {
    name: "privacy-no-leaks",
    check: (data) => !data.results.some((r: any) => r.privacy.leaks > 0),
    errorMsg: "❌ Privacy leaks detected. Fix before merge.",
  },
  {
    name: "quality-threshold",
    check: (data) => data.results.every((r: any) => r.quality >= 0.75),
    errorMsg: "❌ Quality below 75%. Investigate before merge.",
  },
  {
    name: "tier4-compliant",
    check: (data) => data.results
      .filter((r: any) => r.tier === "tier-4-deidentified")
      .every((r: any) => r.privacy.compliant),
    errorMsg: "❌ Tier 4 privacy compliance failed. Fix before merge.",
  },
];

async function runGate(): Promise<void> {
  const reportPath = join(process.cwd(), "results", "matrix-validation-latest.json");

  try {
    const reportJson = readFileSync(reportPath, "utf-8");
    const report = JSON.parse(reportJson);

    console.log("\n🔒 CI Gate: Matrix Validation Checks\n");

    let passed = true;
    for (const gate of gates) {
      const result = gate.check(report);
      console.log(`${result ? "✓" : "✗"} ${gate.name}`);
      if (!result) {
        console.log(`  ${gate.errorMsg}`);
        passed = false;
      }
    }

    console.log("");
    if (passed) {
      console.log("✅ All gates passed. Merge approved.\n");
      process.exit(0);
    } else {
      console.log("⛔ Some gates failed. Merge blocked.\n");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ Gate check failed:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

runGate();
EOF
chmod +x scripts/matrix-ci-gate.ts
```

**Commit:**
```bash
git add scripts/matrix-ci-gate.ts
git commit -m "feat: add CI gate for privacy/quality validation"
```

---

### Task 3: Create Cost Analytics Module

**Files:**
- Create: `scripts/matrix-cost-analyzer.ts`

**Implementation:**

```typescript
cat > scripts/matrix-cost-analyzer.ts << 'EOF'
#!/usr/bin/env node

/**
 * Matrix Cost Analyzer
 *
 * Analyzes and projects costs across providers and time horizons
 */

import { readFileSync } from "fs";
import { join } from "path";

interface CostMetrics {
  provider: string;
  costPerRun: number;
  runsPerDay: number;
  runsPerMonth: number;
  dailyCost: number;
  monthlyCost: number;
  annualCost: number;
}

function analyzeReport(reportPath: string): void {
  const report = JSON.parse(readFileSync(reportPath, "utf-8"));

  const providers = new Map<string, number>();

  for (const result of report.results) {
    const provider = result.provider;
    const current = providers.get(provider) || 0;
    providers.set(provider, current + (result.cost || 0));
  }

  console.log("\n💰 Cost Analysis\n");
  console.log("Provider        | Per-Run  | Daily    | Monthly    | Annual");
  console.log("─".repeat(60));

  const metrics: CostMetrics[] = [];

  for (const [provider, costPerRun] of providers) {
    const runsPerDay = 1; // daily digest = 1 run/day
    const runsPerMonth = 30;
    const runsPerYear = 365;

    const dailyCost = costPerRun * runsPerDay;
    const monthlyCost = costPerRun * runsPerMonth;
    const annualCost = costPerRun * runsPerYear;

    metrics.push({
      provider,
      costPerRun,
      runsPerDay,
      runsPerMonth,
      dailyCost,
      monthlyCost,
      annualCost,
    });

    console.log(
      `${provider.padEnd(15)} | $${costPerRun.toFixed(4)} | $${dailyCost.toFixed(2)} | $${monthlyCost.toFixed(2)} | $${annualCost.toFixed(2)}`
    );
  }

  console.log("");

  // Comparison
  const [cheapest, ...others] = metrics.sort((a, b) => a.monthlyCost - b.monthlyCost);

  if (others.length > 0) {
    console.log("💡 Recommendations:\n");
    for (const m of others) {
      const diff = m.monthlyCost - cheapest.monthlyCost;
      const pct = ((diff / cheapest.monthlyCost) * 100).toFixed(0);
      console.log(
        `  ${m.provider} costs $${diff.toFixed(2)}/month (+${pct}%) more than ${cheapest.provider}`
      );
    }
  }

  console.log("");
}

const reportPath = join(process.cwd(), "results", "matrix-validation-latest.json");
analyzeReport(reportPath);
EOF
chmod +x scripts/matrix-cost-analyzer.ts
```

**Commit:**
```bash
git add scripts/matrix-cost-analyzer.ts
git commit -m "feat: add cost analysis tool for provider comparison"
```

---

## Batch 2: CLI Commands & Integration (Tasks 4-6)

### Task 4: Add npm Scripts

**File:** `package.json`

**Update scripts section:**

```json
{
  "scripts": {
    "matrix:validate": "tsx --tsconfig scripts/tsconfig.json scripts/matrix-validator.ts",
    "matrix:validate:phase1": "tsx --tsconfig scripts/tsconfig.json scripts/matrix-validator.ts --phase 1",
    "matrix:cost-analysis": "tsx --tsconfig scripts/tsconfig.json scripts/matrix-cost-analyzer.ts",
    "matrix:ci-gate": "tsx --tsconfig scripts/tsconfig.json scripts/matrix-ci-gate.ts",
    "matrix:scenario:cost-benefit": "SCENARIO=cost-benefit npm run matrix:validate",
    "matrix:scenario:privacy-audit": "SCENARIO=privacy-audit npm run matrix:validate",
    "matrix:scenario:regression": "SCENARIO=regression npm run matrix:validate"
  }
}
```

**Commit:**
```bash
git add package.json
git commit -m "feat: add npm scripts for matrix validation scenarios and analysis"
```

---

### Task 5: Create Documentation Templates

**Files:**
- Create: `docs/matrix-validation/README.md`
- Create: `docs/matrix-validation/SCENARIOS.md`
- Create: `docs/matrix-validation/SETTINGS-UI-TEMPLATE.html`

**README.md:**
```markdown
# Matrix Validation

## Quick Commands

# Cost analysis
npm run matrix:cost-analysis

# Privacy audit
npm run matrix:scenario:privacy-audit

# Regression detection
npm run matrix:scenario:regression

# CI gate check
npm run matrix:ci-gate
```

**Commit:**
```bash
git add docs/matrix-validation/
git commit -m "docs: add matrix validation scenario documentation"
```

---

### Task 6: Integrate with Release Notes

**Files:**
- Create: `scripts/generate-release-validation-section.ts`

**Implementation:**

Generates validation metrics section for release notes from matrix reports.

**Commit:**
```bash
git add scripts/generate-release-validation-section.ts
git commit -m "feat: add release notes integration for validation metrics"
```

---

## Batch 3: User-Facing Documentation (Tasks 7-9)

### Task 7: Settings UI Template

Create interactive HTML template for settings showing:
- Privacy tier selection with cost/privacy bars
- Quality metrics per tier
- Provider comparison

### Task 8: README Updates

Add matrix validation section to main README:
- Link to latest validation dashboard
- Cost/quality comparison
- Privacy tier explanation

### Task 9: Integration Tests

Create e2e tests for:
- Cost analyzer accuracy
- CI gate decision logic
- Scenario report generation
- Release note integration

---

## Success Criteria

✅ All npm scripts functional
✅ CI gate prevents regressions
✅ Cost analyzer provides actionable data
✅ Scenario reports inform decisions
✅ Documentation visible to users
✅ Release notes include validation metrics
✅ All tests passing (520+ tests)
