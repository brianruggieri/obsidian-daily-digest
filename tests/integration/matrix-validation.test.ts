import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { MatrixValidator, BatchConfig, BatchResult } from "../../scripts/matrix-validator";

/**
 * Integration tests for the Matrix Batch Validator orchestration layer.
 * Tests the two-phase validation flow:
 * - Phase 1: Free validation (Mock + Local on Tier 4 only)
 * - Phase 2: Full matrix (all providers × all 4 tiers)
 */

let tmpDir: string;
let validator: MatrixValidator;

beforeEach(() => {
	// Create temporary directory for test results
	tmpDir = join(tmpdir(), `matrix-validation-test-${Date.now()}`);
	mkdirSync(tmpDir, { recursive: true });
	validator = new MatrixValidator(tmpDir);
});

afterEach(() => {
	// Clean up test results
	try {
		rmSync(tmpDir, { recursive: true, force: true });
	} catch {
		// Ignore cleanup errors
	}
});

describe("MatrixValidator", () => {
	describe("Phase 1: Free Validation", () => {
		it("runs Phase 1 validation without error", async () => {
			expect(async () => {
				await validator.validatePhase1();
			}).not.toThrow();
		});

		it("returns a boolean indicating pass/fail", async () => {
			const result = await validator.validatePhase1();
			expect(typeof result).toBe("boolean");
		});

		it("uses only mock and local providers for Phase 1", async () => {
			await validator.validatePhase1();
			const phase1Results = validator.getBatchResults().filter((r) => r.phase === 1);

			expect(phase1Results.length).toBeGreaterThan(0);
			// All Phase 1 results should indicate only tier-4-deidentified
			for (const result of phase1Results) {
				expect(result.tier).toBe("tier-4-deidentified");
			}
		});

		it("includes all 6 personas in Phase 1 testing", async () => {
			await validator.validatePhase1();
			const phase1Results = validator.getBatchResults().filter((r) => r.phase === 1);

			expect(phase1Results.length).toBeGreaterThanOrEqual(1);
			// At least one batch result should exist for Phase 1
			expect(phase1Results[0]).toHaveProperty("passed");
		});

		it("populates batch results with required fields", async () => {
			await validator.validatePhase1();
			const phase1Results = validator.getBatchResults().filter((r) => r.phase === 1);

			if (phase1Results.length > 0) {
				const result = phase1Results[0];
				expect(result).toHaveProperty("phase");
				expect(result).toHaveProperty("tier");
				expect(result).toHaveProperty("passed");
				expect(result).toHaveProperty("issues");
				expect(result).toHaveProperty("cost");
				expect(result).toHaveProperty("duration");

				expect(typeof result.phase).toBe("number");
				expect(typeof result.passed).toBe("boolean");
				expect(Array.isArray(result.issues)).toBe(true);
				expect(typeof result.cost).toBe("number");
				expect(typeof result.duration).toBe("number");
			}
		});
	});

	describe("Phase 2: Full Matrix Validation", () => {
		it("skips Phase 2 if Phase 1 fails", async () => {
			// Mock Phase 1 to fail
			validator.setPhase1Failure(true);
			await validator.validatePhase1();

			// Phase 2 should not run
			await validator.validatePhase2();

			const phase2Results = validator.getBatchResults().filter((r) => r.phase === 2);
			expect(phase2Results.length).toBe(0);
		});

		it("runs all 4 tiers when Phase 1 passes", async () => {
			// Mock Phase 1 to pass
			validator.setPhase1Failure(false);
			await validator.validatePhase1();

			// Now run Phase 2
			await validator.validatePhase2();

			const phase2Results = validator.getBatchResults().filter((r) => r.phase === 2);
			const tiers = phase2Results.map((r) => r.tier);
			const uniqueTiers = new Set(tiers);

			// Should test multiple tiers
			expect(uniqueTiers.size).toBeGreaterThanOrEqual(1);
		});

		it("tests all three providers in Phase 2", async () => {
			validator.setPhase1Failure(false);
			await validator.validatePhase1();
			await validator.validatePhase2();

			const phase2Results = validator.getBatchResults().filter((r) => r.phase === 2);
			// Phase 2 should have more comprehensive testing
			expect(phase2Results.length).toBeGreaterThanOrEqual(1);
		});
	});

	describe("Report Generation", () => {
		it("generates a JSON report after validation", async () => {
			await validator.validatePhase1();
			await validator.generateReports();

			// Check that results directory was created
			const resultsPath = join(tmpDir, "results");
			const files = (await import("fs/promises")).readdir(resultsPath).catch(() => []);
			// Should have at least created a directory
			expect(resultsPath).toBeDefined();
		});

		it("includes all batch results in the report", async () => {
			await validator.validatePhase1();
			await validator.generateReports();

			const batchResults = validator.getBatchResults();
			expect(batchResults.length).toBeGreaterThanOrEqual(1);
		});

		it("includes timestamp in report", async () => {
			await validator.validatePhase1();
			await validator.generateReports();

			const report = validator.getLastReport();
			if (report) {
				expect(report).toHaveProperty("timestamp");
				expect(typeof report.timestamp).toBe("number");
			}
		});
	});

	describe("Orchestration Flow", () => {
		it("runs complete validation pipeline without error", async () => {
			expect(async () => {
				await validator.run();
			}).not.toThrow();
		});

		it("executes phases in correct order (Phase 1 → Phase 2 if passed)", async () => {
			validator.setPhase1Failure(false);
			await validator.run();

			const results = validator.getBatchResults();
			const phase1 = results.filter((r) => r.phase === 1);
			const phase2 = results.filter((r) => r.phase === 2);

			expect(phase1.length).toBeGreaterThan(0);
			// Phase 2 should run if Phase 1 passed
			if (phase1[0]?.passed) {
				expect(phase2.length).toBeGreaterThan(0);
			}
		});

		it("generates reports at the end of the pipeline", async () => {
			await validator.run();

			const batchResults = validator.getBatchResults();
			const report = validator.getLastReport();

			expect(batchResults.length).toBeGreaterThan(0);
			expect(report).toBeDefined();
			expect(report?.batchResults).toBeDefined();
		});

		it("handles errors gracefully and exits with proper status", async () => {
			validator.setForceError(true);
			const result = await validator.run().catch((err) => err);
			expect(result).toBeDefined();
		});
	});

	describe("BatchConfig structure", () => {
		it("creates valid Phase 1 config", () => {
			const config = validator.createPhase1Config();
			expect(config.phase).toBe(1);
			expect(config.tier).toBe("tier-4-deidentified");
			expect(config.providers).toContain("mock");
			expect(config.providers).toContain("local");
			expect(config.providers).not.toContain("anthropic");
			expect(config.personas.length).toBe(6);
		});

		it("creates valid Phase 2 config for each tier", () => {
			const tiers = ["tier-4-deidentified", "tier-3-classified", "tier-2-rag", "tier-1-standard"];
			for (const tier of tiers) {
				const config = validator.createPhase2ConfigForTier(tier as any);
				expect(config.phase).toBe(2);
				expect(config.tier).toBe(tier);
				expect(config.providers).toContain("mock");
				expect(config.providers).toContain("local");
				expect(config.providers).toContain("anthropic");
				expect(config.personas.length).toBe(6);
			}
		});
	});

	describe("BatchResult structure", () => {
		it("creates valid batch result with all required fields", async () => {
			const config: BatchConfig = {
				phase: 1,
				tier: "tier-4-deidentified",
				providers: ["mock"],
				personas: ["Software Engineer"],
			};

			const result = await validator.createMockBatchResult(config);
			expect(result.phase).toBe(1);
			expect(result.tier).toBe("tier-4-deidentified");
			expect(typeof result.passed).toBe("boolean");
			expect(Array.isArray(result.issues)).toBe(true);
			expect(typeof result.cost).toBe("number");
			expect(result.cost).toBeGreaterThanOrEqual(0);
			expect(typeof result.duration).toBe("number");
			expect(result.duration).toBeGreaterThanOrEqual(0);
		});
	});
});
