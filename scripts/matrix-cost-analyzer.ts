#!/usr/bin/env node
/* eslint-disable no-console */

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
