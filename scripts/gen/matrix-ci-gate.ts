#!/usr/bin/env node
/* eslint-disable no-console */

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
