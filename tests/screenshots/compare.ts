#!/usr/bin/env tsx
/**
 * Visual regression comparison: actual screenshots vs committed baselines.
 *
 * Reads every PNG in baseline/, finds the matching file in output/actual/,
 * and diffs them with pixelmatch. Fails with exit code 1 if any image exceeds
 * the mismatch threshold or is missing. Writes diff PNGs to output/diff/ for
 * review (uploaded as CI artifacts on failure).
 *
 * Usage (from project root):
 *   npm run screenshots:compare
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import pixelmatch from "pixelmatch";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASELINE_DIR = path.resolve(__dirname, "baseline");
const ACTUAL_DIR = path.resolve(__dirname, "output/actual");
const DIFF_DIR = path.resolve(__dirname, "output/diff");

/** Fraction of pixels allowed to differ before the test fails. */
const MISMATCH_THRESHOLD = 0.02;

fs.mkdirSync(DIFF_DIR, { recursive: true });

const baselineFiles = fs.readdirSync(BASELINE_DIR).filter(f => f.endsWith(".png"));

let passed = 0;
let failed = 0;
const failures: string[] = [];

for (const filename of baselineFiles) {
	const tag = filename.replace(".png", "");
	const baselinePath = path.join(BASELINE_DIR, filename);
	const actualPath = path.join(ACTUAL_DIR, filename);
	const diffPath = path.join(DIFF_DIR, filename);

	if (!fs.existsSync(actualPath)) {
		console.error(`  ✗ ${tag} — actual not found (run npm run screenshots first)`);
		failures.push(`${tag}: actual file missing`);
		failed++;
		continue;
	}

	const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
	const actual = PNG.sync.read(fs.readFileSync(actualPath));

	if (baseline.width !== actual.width || baseline.height !== actual.height) {
		console.error(
			`  ✗ ${tag} — dimensions changed ` +
			`(baseline ${baseline.width}×${baseline.height}, ` +
			`actual ${actual.width}×${actual.height})`
		);
		failures.push(`${tag}: dimensions changed`);
		failed++;
		continue;
	}

	const { width, height } = baseline;
	const diff = new PNG({ width, height });
	const numDiffPixels = pixelmatch(
		baseline.data, actual.data, diff.data,
		width, height,
		{ threshold: 0.1 }, // per-pixel sensitivity (0.1 is standard)
	);

	const mismatchRatio = numDiffPixels / (width * height);

	if (mismatchRatio > MISMATCH_THRESHOLD) {
		fs.writeFileSync(diffPath, PNG.sync.write(diff));
		console.error(
			`  ✗ ${tag} — ${(mismatchRatio * 100).toFixed(2)}% mismatch ` +
			`(${numDiffPixels.toLocaleString()} pixels) → diff saved`
		);
		failures.push(`${tag}: ${(mismatchRatio * 100).toFixed(2)}% mismatch`);
		failed++;
	} else {
		console.log(`  ✓ ${tag}`);
		passed++;
	}
}

console.log(`\nScreenshot comparison: ${passed} passed, ${failed} failed`);

if (failures.length > 0) {
	console.error("\nFailed:");
	for (const f of failures) {
		console.error(`  - ${f}`);
	}
	process.exit(1);
}
