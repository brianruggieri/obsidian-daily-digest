import { writeFileSync } from "fs";
import { join } from "path";
import { runStructuralAssertions, runQualityAssertions } from "./assertions";

export interface PresetReport {
	preset: string;
	passed: boolean;
	durationMs: number;
	filePath: string;
	checks: {
		structural: { passed: boolean; failures: string[] };
		quality: { passed: boolean; failures: string[] };
		llmJudge: null;
	};
}

export interface MatrixReport {
	date: string;
	aiMode: string;
	dataMode: string;
	totalPresets: number;
	passed: number;
	failed: number;
	results: PresetReport[];
}

export function runAssertions(
	md: string,
	presetId: string,
	filePath: string,
	durationMs: number,
	options: { aiEnabled: boolean }
): PresetReport {
	const structural = runStructuralAssertions(md);
	const quality = runQualityAssertions(md, options);
	const passed = structural.passed && quality.passed;

	return {
		preset: presetId,
		passed,
		durationMs,
		filePath,
		checks: { structural, quality, llmJudge: null },
	};
}

export function writeReport(outputDir: string, report: MatrixReport): void {
	const reportPath = join(outputDir, "matrix-report.json");
	writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
	console.log(`\nMatrix report written to ${reportPath}`);
	console.log(`Results: ${report.passed}/${report.totalPresets} passed`);
	if (report.failed > 0) {
		console.error(`${report.failed} preset(s) failed assertions — see matrix-report.json`);
	}
}
