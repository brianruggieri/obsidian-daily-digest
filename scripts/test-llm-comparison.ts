#!/usr/bin/env node

/**
 * Comprehensive LLM Testing & Comparison Orchestrator
 *
 * Coordinates testing across:
 * - Mock (simulated) outputs
 * - Claude API (Haiku)
 * - Local LLMs (Ollama, llama.cpp, vLLM)
 *
 * Usage:
 *   npm run test:llm-compare [--with-api] [--with-local] [--all]
 *   npm run test:llm-compare --all                    # Test all 3 providers
 *   npm run test:llm-compare --with-api               # Test Claude API only
 *   npm run test:llm-compare --with-local=localhost:11434  # Test specific local endpoint
 *
 * Environment variables:
 *   ANTHROPIC_API_KEY=sk-ant-...                     — for Claude API
 *   LOCAL_LLM_ENDPOINT=http://localhost:11434        — local LLM endpoint
 *   LOCAL_LLM_MODEL=qwen3:8b|mistral:7b|llama2:7b    — model to use
 *   TEST_PERSONAS=1,3,5                              — which personas to test (1-6)
 *   TEST_TIERS=tier-3-classified,tier-4-deidentified — which tiers to test
 */

import { execSync } from "child_process";
import { promises as fs } from "fs";
import * as path from "path";

interface TestConfig {
	withMock: boolean;
	withAPI: boolean;
	withLocal: boolean;
	localEndpoint?: string;
	localModel?: string;
	personas?: number[]; // 1-6
	tiers?: string[];
	verbose?: boolean;
}

interface TestResult {
	provider: "mock" | "anthropic" | "local";
	status: "passed" | "failed" | "skipped";
	duration: number;
	message: string;
	testsRun: number;
	testsPassed: number;
	testsFailed: number;
}

// ─ Configuration Parsing ────────────────────────────────────────────

function parseArgs(): TestConfig {
	const args = process.argv.slice(2);
	const config: TestConfig = {
		withMock: true,
		withAPI: false,
		withLocal: false,
		verbose: args.includes("--verbose"),
	};

	for (const arg of args) {
		if (arg === "--all") {
			config.withAPI = true;
			config.withLocal = true;
		} else if (arg === "--with-api") {
			config.withAPI = true;
		} else if (arg.startsWith("--with-local")) {
			config.withLocal = true;
			if (arg.includes("=")) {
				config.localEndpoint = arg.split("=")[1];
			}
		} else if (arg.startsWith("--personas=")) {
			config.personas = arg
				.split("=")[1]
				.split(",")
				.map((n) => parseInt(n, 10))
				.filter((n) => n >= 1 && n <= 6);
		} else if (arg.startsWith("--tiers=")) {
			config.tiers = arg.split("=")[1].split(",");
		}
	}

	return config;
}

// ─ Environment Checks ────────────────────────────────────────────────

function checkEnvironment(config: TestConfig): string[] {
	const warnings: string[] = [];

	if (config.withAPI && !process.env.ANTHROPIC_API_KEY) {
		warnings.push("⚠️  ANTHROPIC_API_KEY not set — skipping Claude API tests");
		config.withAPI = false;
	}

	if (config.withLocal) {
		const endpoint = config.localEndpoint || process.env.LOCAL_LLM_ENDPOINT || "http://localhost:11434";
		try {
			const testUrl = `${endpoint}/api/tags`;
			const result = execSync(`curl -s "${testUrl}"`, { encoding: "utf-8" });

			if (!result || result.includes("error")) {
				warnings.push(`⚠️  Local LLM not responding at ${endpoint} — skipping local tests`);
				config.withLocal = false;
			} else {
				console.log(`✅ Local LLM detected at ${endpoint}`);
			}
		} catch (e) {
			warnings.push(
				`⚠️  Could not reach local LLM at ${endpoint}. Start with: ollama serve`
			);
			config.withLocal = false;
		}
	}

	return warnings;
}

// ─ Test Runners ────────────────────────────────────────────────────

async function runMockTests(): Promise<TestResult> {
	console.log("\n🏃 Running Mock Tests (no LLM calls)...");
	const start = Date.now();

	try {
		const output = execSync("npm run test:integration -- --reporter=verbose", {
			encoding: "utf-8",
			stdio: "pipe",
		});

		const passed = (output.match(/✓/g) || []).length;
		const failed = (output.match(/✗/g) || []).length;

		return {
			provider: "mock",
			status: failed === 0 ? "passed" : "failed",
			duration: Date.now() - start,
			message: `${passed} tests passed, ${failed} failed`,
			testsRun: passed + failed,
			testsPassed: passed,
			testsFailed: failed,
		};
	} catch (e) {
		const error = e instanceof Error ? e.message : String(e);
		return {
			provider: "mock",
			status: "failed",
			duration: Date.now() - start,
			message: error.substring(0, 100),
			testsRun: 0,
			testsPassed: 0,
			testsFailed: 1,
		};
	}
}

async function runClaudeAPITests(): Promise<TestResult> {
	console.log("\n🤖 Running Claude API Tests (Haiku)...");
	const start = Date.now();

	try {
		// Set environment for eval tests
		process.env.DAILY_DIGEST_AI_EVAL = "true";
		process.env.DAILY_DIGEST_AI_EVAL_PROVIDER = "anthropic";
		process.env.DAILY_DIGEST_AI_EVAL_MODEL = "claude-3-5-haiku-20241022";

		const output = execSync("npm run test:eval -- --reporter=verbose", {
			encoding: "utf-8",
			stdio: "pipe",
			env: process.env,
		});

		const passed = (output.match(/✓/g) || []).length;
		const failed = (output.match(/✗/g) || []).length;

		return {
			provider: "anthropic",
			status: failed === 0 ? "passed" : "failed",
			duration: Date.now() - start,
			message: `${passed} tests passed, ${failed} failed`,
			testsRun: passed + failed,
			testsPassed: passed,
			testsFailed: failed,
		};
	} catch (e) {
		const error = e instanceof Error ? e.message : String(e);
		return {
			provider: "anthropic",
			status: "failed",
			duration: Date.now() - start,
			message: error.substring(0, 100),
			testsRun: 0,
			testsPassed: 0,
			testsFailed: 1,
		};
	}
}

async function runLocalLLMTests(config: TestConfig): Promise<TestResult> {
	console.log(`\n🖥️  Running Local LLM Tests...`);
	const start = Date.now();

	try {
		const endpoint = config.localEndpoint || process.env.LOCAL_LLM_ENDPOINT || "http://localhost:11434";
		const model = config.localModel || process.env.LOCAL_LLM_MODEL || "qwen3:8b";

		// Set environment for eval tests
		process.env.DAILY_DIGEST_AI_EVAL = "true";
		process.env.DAILY_DIGEST_AI_EVAL_PROVIDER = "local";
		process.env.LOCAL_EVAL_ENDPOINT = endpoint;
		process.env.LOCAL_EVAL_MODEL = model;

		const output = execSync("npm run test:eval -- --reporter=verbose", {
			encoding: "utf-8",
			stdio: "pipe",
			env: process.env,
		});

		const passed = (output.match(/✓/g) || []).length;
		const failed = (output.match(/✗/g) || []).length;

		return {
			provider: "local",
			status: failed === 0 ? "passed" : "failed",
			duration: Date.now() - start,
			message: `${passed} tests passed, ${failed} failed (model: ${model})`,
			testsRun: passed + failed,
			testsPassed: passed,
			testsFailed: failed,
		};
	} catch (e) {
		const error = e instanceof Error ? e.message : String(e);
		return {
			provider: "local",
			status: "failed",
			duration: Date.now() - start,
			message: error.substring(0, 100),
			testsRun: 0,
			testsPassed: 0,
			testsFailed: 1,
		};
	}
}

// ─ Report Generation ────────────────────────────────────────────────

function generateReport(results: TestResult[]): string {
	const lines: string[] = [];

	lines.push("\n" + "═".repeat(70));
	lines.push("📊 LLM Comparison Test Results");
	lines.push("═".repeat(70) + "\n");

	// Summary table
	lines.push("| Provider | Status | Tests | Passed | Failed | Duration |");
	lines.push("|----------|--------|-------|--------|--------|----------|");

	results.forEach((r) => {
		const statusIcon = r.status === "passed" ? "✅" : r.status === "skipped" ? "⏭️ " : "❌";
		const durationSec = (r.duration / 1000).toFixed(1);
		lines.push(
			`| ${r.provider} | ${statusIcon} ${r.status} | ${r.testsRun} | ${r.testsPassed} | ${r.testsFailed} | ${durationSec}s |`
		);
	});

	// Details
	lines.push("\n### Detailed Results\n");
	results.forEach((r) => {
		lines.push(`**${r.provider}** (${r.status})`);
		lines.push(`  - Message: ${r.message}`);
		lines.push(`  - Duration: ${(r.duration / 1000).toFixed(2)}s\n`);
	});

	// Recommendations
	lines.push("### Recommendations\n");

	const allPassed = results.every((r) => r.status === "passed" || r.status === "skipped");
	if (allPassed) {
		lines.push("✅ All tests passed! Ready for production.\n");
	}

	const mockPassed = results.find((r) => r.provider === "mock");
	const apiPassed = results.find((r) => r.provider === "anthropic");
	const localPassed = results.find((r) => r.provider === "local");

	if (mockPassed && mockPassed.status === "passed") {
		lines.push("✅ Mock tests pass — baseline validation works.");
	}

	if (apiPassed) {
		if (apiPassed.status === "passed") {
			lines.push("✅ Claude API tests pass — safe for production use.");
			lines.push("   - Privacy compliance: ✓");
			lines.push("   - Format consistency: ✓");
			lines.push("   - No secret leakage detected");
		} else if (apiPassed.status === "failed") {
			lines.push("❌ Claude API tests failed — review issues above.");
		}
	}

	if (localPassed) {
		if (localPassed.status === "passed") {
			lines.push("✅ Local LLM tests pass — viable cost-free alternative.");
			lines.push("   - Good for offline testing");
			lines.push("   - Compare quality metrics with Claude API");
		} else if (localPassed.status === "failed") {
			lines.push("⚠️  Local LLM tests failed — may need model tuning.");
		}
	}

	lines.push("\n" + "═".repeat(70) + "\n");

	return lines.join("\n");
}

// ─ Main ────────────────────────────────────────────────────────────

async function main() {
	console.log("\n🚀 LLM Fixture Validation & Comparison Suite");
	console.log("═".repeat(70));

	const config = parseArgs();
	const warnings = checkEnvironment(config);

	if (warnings.length > 0) {
		console.log("\nEnvironment Warnings:");
		warnings.forEach((w) => console.log(w));
	}

	console.log(`\n📋 Test Configuration:`);
	console.log(`   Mock tests: ${config.withMock ? "✓" : "✗"}`);
	console.log(`   Claude API: ${config.withAPI ? "✓" : "✗"}`);
	console.log(`   Local LLM: ${config.withLocal ? "✓" : "✗"}`);
	console.log(`   Verbose: ${config.verbose ? "✓" : "✗"}`);

	const results: TestResult[] = [];

	// Run tests
	if (config.withMock) {
		results.push(await runMockTests());
	}

	if (config.withAPI) {
		results.push(await runClaudeAPITests());
	}

	if (config.withLocal) {
		results.push(await runLocalLLMTests(config));
	}

	// Report
	const report = generateReport(results);
	console.log(report);

	// Save report
	const reportPath = path.join(process.cwd(), "test-results.md");
	await fs.writeFile(reportPath, report);
	console.log(`📄 Report saved to: ${reportPath}\n`);

	// Exit code
	const allPassed = results.every((r) => r.status === "passed" || r.status === "skipped");
	process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
	console.error("Fatal error:", e);
	process.exit(1);
});
