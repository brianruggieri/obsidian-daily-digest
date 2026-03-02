#!/usr/bin/env node

/**
 * matrix-validator.ts — Matrix Batch Validator
 *
 * Orchestrates two-phase validation:
 * - Phase 1: Free validation (Mock + Local LLM on Tier 4 only)
 * - Phase 2: Full matrix (all providers × all 4 tiers)
 *
 * Invoke via:
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/matrix-validator.ts
 */

import { promises as fs } from "fs";
import { join } from "path";
import { pathToFileURL } from "url";

// ── Types ─────────────────────────────────────────────────────────────

export interface BatchConfig {
	phase: 1 | 2;
	tier: "tier-4-deidentified" | "tier-3-classified" | "tier-2-rag" | "tier-1-standard";
	providers: ("mock" | "local" | "anthropic")[];
	personas: string[];
}

export interface BatchResult {
	phase: number;
	tier: string;
	passed: boolean;
	issues: string[];
	cost: number;
	duration: number;
}

interface MatrixReport {
	timestamp: number;
	batchResults: BatchResult[];
}

// ── Constants ─────────────────────────────────────────────────────────

const PERSONAS = [
	"Software Engineer",
	"Research Knowledge Worker",
	"DevOps Infrastructure",
	"Product Manager",
	"Student",
	"Scattered Switcher",
];

const TIERS_PHASE_2 = ["tier-4-deidentified", "tier-3-classified", "tier-2-rag", "tier-1-standard"];

// ── MatrixValidator Class ─────────────────────────────────────────────

export class MatrixValidator {
	private resultsDir: string;
	private batchResults: BatchResult[] = [];
	private lastReport: MatrixReport | null = null;
	private phase1ShouldFail = false;
	private forceError = false;

	constructor(resultsDir: string) {
		this.resultsDir = resultsDir;
	}

	/**
	 * Phase 1: Free validation (Mock + Local on Tier 4 only)
	 * Returns boolean indicating pass/fail
	 */
	async validatePhase1(): Promise<boolean> {
		const config = this.createPhase1Config();
		const result = await this.runBatch(config);
		this.batchResults.push(result);

		const header =
			"\n╔══════════════════════════════════════════════════╗\n" +
			"║  🔍 PHASE 1: FREE VALIDATION (Tier 4 only)      ║\n" +
			"╚══════════════════════════════════════════════════╝\n";
		console.log(header);

		if (result.passed) {
			console.log("✅ Phase 1 PASSED - Proceeding to Phase 2\n");
		} else {
			console.log("❌ Phase 1 FAILED - Issues detected:");
			for (const issue of result.issues) {
				console.log(`   • ${issue}`);
			}
			console.log("");
		}

		return result.passed;
	}

	/**
	 * Phase 2: Full matrix (all providers × all 4 tiers)
	 * Only runs if Phase 1 passes
	 */
	async validatePhase2(): Promise<void> {
		const phase1Results = this.batchResults.filter((r) => r.phase === 1);
		if (!phase1Results.length || !phase1Results[0].passed) {
			return;
		}

		const header =
			"\n╔══════════════════════════════════════════════════╗\n" +
			"║  🚀 PHASE 2: FULL MATRIX VALIDATION              ║\n" +
			"╚══════════════════════════════════════════════════╝\n";
		console.log(header);

		for (const tier of TIERS_PHASE_2) {
			const config = this.createPhase2ConfigForTier(
				tier as "tier-4-deidentified" | "tier-3-classified" | "tier-2-rag" | "tier-1-standard"
			);
			const result = await this.runBatch(config);
			this.batchResults.push(result);

			const status = result.passed ? "✅" : "❌";
			console.log(`${status} ${tier}: ${result.passed ? "PASSED" : "FAILED WITH ISSUES"}`);
			console.log(`   Cost: $${result.cost.toFixed(4)}, Duration: ${result.duration}ms`);

			if (result.issues.length > 0) {
				console.log("   Issues:");
				for (const issue of result.issues) {
					console.log(`     • ${issue}`);
				}
			}
		}
		console.log("");
	}

	/**
	 * Generate reports after validation completes
	 */
	async generateReports(): Promise<void> {
		const resultsPath = join(this.resultsDir, "results");
		await fs.mkdir(resultsPath, { recursive: true });

		const report: MatrixReport = {
			timestamp: Date.now(),
			batchResults: this.batchResults,
		};

		this.lastReport = report;

		const now = new Date();
		const dateStr = now.toISOString().slice(0, 10);
		const reportPath = join(resultsPath, `matrix-validation-${dateStr}.json`);

		await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
		console.log(`📊 Report generated: ${reportPath}`);
	}

	/**
	 * Pipe batch output to Inspector tool for real-time visualization
	 * Allows users to step through validation with pause/resume capability
	 */
	async pipeToInspector(batchConfig: BatchConfig, output: unknown): Promise<void> {
		console.log(`\n📺 Piping to Inspector: ${batchConfig.tier} (${batchConfig.providers.join(", ")})`);
		console.log(`   Providers: ${batchConfig.providers.join(", ")}`);
		console.log(`   Personas: ${batchConfig.personas.length} test cases`);

		// Inspector integration point:
		// This pipes the batch output to the existing inspector tool (scripts/inspect.ts)
		// for real-time visual inspection of the pipeline as it runs.
		//
		// The Inspector tool can:
		// - Visualize tier-specific data leaving the machine
		// - Step through each persona/provider combination
		// - Show privacy leak detection in real-time
		// - Display quality/cost metrics side-by-side
		// - Pause/resume validation for inspection

		try {
			// Payload for inspector
			const inspectorPayload = {
				tier: batchConfig.tier,
				phase: batchConfig.phase,
				providers: batchConfig.providers,
				personas: batchConfig.personas,
				output,
				timestamp: new Date().toISOString(),
			};

			// TODO: Connect to inspector.ts via IPC/socket
			// For now, log the payload that would be sent
			console.log(`   ✓ Ready to pipe ${JSON.stringify(inspectorPayload).length} bytes to inspector`);
		} catch (error) {
			console.warn(`   ⚠️  Inspector unavailable: ${error instanceof Error ? error.message : "unknown error"}`);
			// Non-fatal: validation continues even if inspector is offline
		}
	}

	/**
	 * Main orchestration function
	 */
	async run(): Promise<void> {
		const header =
			"╔════════════════════════════════════════════════════════════╗\n" +
			"║  MATRIX VALIDATION: Claude vs Local LLM Comparison        ║\n" +
			"╚════════════════════════════════════════════════════════════╝";
		console.log(header);

		try {
			if (this.forceError) {
				throw new Error("Forced error for testing");
			}

			const phase1Passed = await this.validatePhase1();

			if (phase1Passed) {
				await this.validatePhase2();
			}

			await this.generateReports();

			console.log("✨ Validation complete!");
		} catch (error) {
			console.error("❌ Validation failed:", error instanceof Error ? error.message : String(error));
			// Re-throw so callers (including tests) can handle the failure
			throw error;
		}
	}

	/**
	 * Internal: Run a batch with given configuration
	 * (Placeholder implementation for now)
	 */
	private async runBatch(config: BatchConfig): Promise<BatchResult> {
		const startTime = Date.now();

		// Placeholder: simulate batch execution
		await new Promise((resolve) => setTimeout(resolve, 10));

		const duration = Date.now() - startTime;
		const issues: string[] = [];

		if (config.phase === 1 && this.phase1ShouldFail) {
			return {
				phase: config.phase,
				tier: config.tier,
				passed: false,
				issues: ["Mock provider failed", "Local provider timed out"],
				cost: 0,
				duration,
			};
		}

		return {
			phase: config.phase,
			tier: config.tier,
			passed: true,
			issues,
			cost: config.providers.includes("anthropic") ? Math.random() * 0.01 : 0,
			duration,
		};
	}

	// ── Test Helper Methods ──────────────────────────────────────────────

	/**
	 * Create Phase 1 configuration
	 */
	createPhase1Config(): BatchConfig {
		return {
			phase: 1,
			tier: "tier-4-deidentified",
			providers: ["mock", "local"],
			personas: PERSONAS,
		};
	}

	/**
	 * Create Phase 2 configuration for a specific tier
	 */
	createPhase2ConfigForTier(
		tier: "tier-4-deidentified" | "tier-3-classified" | "tier-2-rag" | "tier-1-standard"
	): BatchConfig {
		return {
			phase: 2,
			tier,
			providers: ["mock", "local", "anthropic"],
			personas: PERSONAS,
		};
	}

	/**
	 * Create a mock batch result (for testing)
	 */
	async createMockBatchResult(config: BatchConfig): Promise<BatchResult> {
		return {
			phase: config.phase,
			tier: config.tier,
			passed: true,
			issues: [],
			cost: Math.random() * 0.01,
			duration: Math.floor(Math.random() * 1000),
		};
	}

	/**
	 * Get all batch results
	 */
	getBatchResults(): BatchResult[] {
		return this.batchResults;
	}

	/**
	 * Get the last generated report
	 */
	getLastReport(): MatrixReport | null {
		return this.lastReport;
	}

	/**
	 * Test helper: Make Phase 1 fail
	 */
	setPhase1Failure(shouldFail: boolean): void {
		this.phase1ShouldFail = shouldFail;
	}

	/**
	 * Test helper: Force an error during run()
	 */
	setForceError(shouldError: boolean): void {
		this.forceError = shouldError;
	}
}

// ── Main Execution ────────────────────────────────────────────────────

// ESM-safe check: only run if this file is executed directly
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	const resultsDir = join(process.cwd(), "results");
	const validator = new MatrixValidator(resultsDir);
	validator.run().catch((err) => {
		console.error("Fatal error:", err);
		process.exit(1);
	});
}

export default MatrixValidator;
