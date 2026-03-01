#!/usr/bin/env tsx
// ── ETL: Build expanded domain categories ────────────────────
//
// Cross-references UT1 Blacklists (CC BY-SA 3.0) with Tranco
// popularity rankings to expand categorize.ts domain coverage.
//
// Usage:
//   npm run etl:categories                    # Standard run
//   npm run etl:categories -- --dry-run       # Preview only
//   npm run etl:categories -- --refresh       # Force re-download
//   npm run etl:categories -- --tranco-limit 100000
//   npm run etl:categories -- --categories shopping,gaming

import { readFile, writeFile, mkdir } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

import { ensureDataSources } from "./lib/download.js";
import { parseTrancoCSV, lookupTrancoRank } from "./lib/tranco.js";
import { readUT1Categories } from "./lib/ut1.js";
import { CATEGORY_MAP, type CategoryMapping } from "./lib/category-map.js";
import { checkQuality, type QualityResult } from "./lib/quality-filter.js";
import { parseCategoryRules, isDomainCovered, getAllExistingPatterns } from "./lib/merger.js";
import { generateCategorizeTS, type ETLEntry } from "./lib/codegen.js";
import {
	printConsoleSummary,
	writeMarkdownReport,
	type ETLReport,
	type CategoryReport,
	type RejectionStats,
} from "./lib/reporter.js";

// ── Paths ────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, "../..");
const DATA_DIR = join(__dirname, "data");
const OUTPUT_DIR = join(__dirname, "output");
const CATEGORIZE_SRC = join(PROJECT_ROOT, "src/filter/categorize.ts");

// ── CLI argument parsing ─────────────────────────────────────

interface CLIArgs {
	dryRun: boolean;
	refresh: boolean;
	trancoLimit: number;
	categories: string[] | null; // null = all
}

function parseArgs(): CLIArgs {
	const args = process.argv.slice(2);
	const result: CLIArgs = {
		dryRun: false,
		refresh: false,
		trancoLimit: 50_000,
		categories: null,
	};

	for (let i = 0; i < args.length; i++) {
		switch (args[i]) {
			case "--dry-run":
				result.dryRun = true;
				break;
			case "--refresh":
				result.refresh = true;
				break;
			case "--tranco-limit":
				result.trancoLimit = parseInt(args[++i], 10);
				if (isNaN(result.trancoLimit) || result.trancoLimit < 1) {
					console.error("Invalid --tranco-limit value");
					process.exit(1);
				}
				break;
			case "--categories":
				result.categories = args[++i].split(",").map((s) => s.trim());
				break;
			default:
				console.error(`Unknown argument: ${args[i]}`);
				process.exit(1);
		}
	}

	return result;
}

// ── Candidate processing ─────────────────────────────────────

interface Candidate {
	domain: string;
	trancoRank: number;
	ut1Category: string;
	pluginCategory: string;
}

interface ProcessingResult {
	candidates: Candidate[];
	categoryReport: CategoryReport;
	rejections: Partial<RejectionStats>;
}

function processCategoryMapping(
	mapping: CategoryMapping,
	ut1Domains: string[],
	trancoMap: Map<string, number>,
	allExistingPatterns: string[],
	globalTrancoLimit: number,
): ProcessingResult {
	const effectiveLimit = Math.min(mapping.trancoLimit, globalTrancoLimit);
	const rejections: Partial<RejectionStats> = {};
	const candidates: Candidate[] = [];

	let trancoMatches = 0;
	let qualityRejected = 0;
	let alreadyCovered = 0;

	for (const domain of ut1Domains) {
		// Step 1: Tranco popularity filter
		const rank = lookupTrancoRank(domain, trancoMap);
		if (rank === undefined || rank > effectiveLimit) {
			rejections["below-tranco-threshold"] = (rejections["below-tranco-threshold"] || 0) + 1;
			continue;
		}
		trancoMatches++;

		// Step 2: Quality filters
		const quality: QualityResult = checkQuality(domain, rank);
		if (!quality.passed) {
			qualityRejected++;
			const reason = quality.reason as keyof RejectionStats;
			rejections[reason] = (rejections[reason] || 0) + 1;
			continue;
		}

		// Step 3: Already covered by hand-curated patterns?
		if (isDomainCovered(domain, allExistingPatterns)) {
			alreadyCovered++;
			rejections["already-covered"] = (rejections["already-covered"] || 0) + 1;
			continue;
		}

		candidates.push({
			domain,
			trancoRank: rank,
			ut1Category: mapping.ut1Category,
			pluginCategory: mapping.pluginCategory,
		});
	}

	// Sort by Tranco rank (most popular first) and cap
	candidates.sort((a, b) => a.trancoRank - b.trancoRank);
	const capped = candidates.slice(0, mapping.cap);

	return {
		candidates: capped,
		categoryReport: {
			pluginCategory: mapping.pluginCategory,
			ut1Categories: [mapping.ut1Category],
			ut1Total: ut1Domains.length,
			trancoMatches,
			qualityRejected,
			alreadyCovered,
			imported: capped.length,
			cap: mapping.cap,
		},
		rejections,
	};
}

// ── Main ─────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = parseArgs();

	if (args.dryRun) {
		console.log("🏃 DRY RUN — no files will be written\n");
	}

	// 1. Download/cache data sources
	const { trancoCSV, ut1BlacklistsDir } = await ensureDataSources(DATA_DIR, args.refresh);

	// 2. Parse Tranco CSV (use the max tranco limit across all mappings, or CLI override)
	const maxTrancoLimit = Math.max(
		args.trancoLimit,
		...CATEGORY_MAP.map((m) => m.trancoLimit),
	);
	console.log(`\nParsing Tranco CSV (top ${maxTrancoLimit.toLocaleString()})...`);
	const trancoMap = await parseTrancoCSV(trancoCSV, maxTrancoLimit);
	console.log(`  Loaded ${trancoMap.size.toLocaleString()} domains\n`);

	// 3. Determine which UT1 categories to read
	let mappingsToProcess = CATEGORY_MAP;
	if (args.categories) {
		mappingsToProcess = CATEGORY_MAP.filter(
			(m) => args.categories!.includes(m.pluginCategory) || args.categories!.includes(m.ut1Category),
		);
		if (mappingsToProcess.length === 0) {
			console.error(`No mappings found for categories: ${args.categories.join(", ")}`);
			process.exit(1);
		}
	}

	// 4. Read UT1 categories
	const ut1CategoryNames = [...new Set(mappingsToProcess.map((m) => m.ut1Category))];
	console.log(`Reading UT1 categories: ${ut1CategoryNames.join(", ")}...`);
	const ut1Data = await readUT1Categories(ut1BlacklistsDir, ut1CategoryNames);

	for (const [cat, domains] of ut1Data) {
		console.log(`  ${cat}: ${domains.length.toLocaleString()} domains`);
	}

	// 5. Parse existing categorize.ts
	console.log("\nParsing existing categorize.ts...");
	const originalSource = await readFile(CATEGORIZE_SRC, "utf-8");
	const handCurated = parseCategoryRules(originalSource);
	const allExistingPatterns = getAllExistingPatterns(handCurated);
	console.log(`  ${handCurated.size} categories, ${allExistingPatterns.length} hand-curated patterns\n`);

	// 6. Process each UT1→plugin mapping
	console.log("Processing domain candidates...\n");
	const allETLEntries = new Map<string, ETLEntry[]>();
	const categoryReports: CategoryReport[] = [];
	const totalRejections: RejectionStats = {
		"excessive-hyphens": 0,
		"consecutive-digit-segments": 0,
		"suspicious-tld": 0,
		"low-value-cctld": 0,
		"major-platform-subdomain": 0,
		"below-tranco-threshold": 0,
		"already-covered": 0,
	};

	for (const mapping of mappingsToProcess) {
		const ut1Domains = ut1Data.get(mapping.ut1Category) || [];
		const result = processCategoryMapping(
			mapping,
			ut1Domains,
			trancoMap,
			allExistingPatterns,
			args.trancoLimit,
		);

		// Merge ETL entries (multiple UT1 categories can map to same plugin category)
		const existing = allETLEntries.get(mapping.pluginCategory) || [];
		allETLEntries.set(mapping.pluginCategory, [...existing, ...result.candidates]);

		// Merge category reports for same plugin category
		const existingReport = categoryReports.find(
			(r) => r.pluginCategory === mapping.pluginCategory,
		);
		if (existingReport) {
			existingReport.ut1Categories.push(mapping.ut1Category);
			existingReport.ut1Total += result.categoryReport.ut1Total;
			existingReport.trancoMatches += result.categoryReport.trancoMatches;
			existingReport.qualityRejected += result.categoryReport.qualityRejected;
			existingReport.alreadyCovered += result.categoryReport.alreadyCovered;
			existingReport.imported += result.categoryReport.imported;
			existingReport.cap += mapping.cap;
		} else {
			categoryReports.push(result.categoryReport);
		}

		// Merge rejections
		for (const [reason, count] of Object.entries(result.rejections)) {
			totalRejections[reason as keyof RejectionStats] += count as number;
		}
	}

	// Deduplicate within each plugin category (domains from multiple UT1 sources)
	for (const [category, entries] of allETLEntries) {
		const seen = new Set<string>();
		const deduped = entries.filter((e) => {
			if (seen.has(e.domain)) return false;
			seen.add(e.domain);
			return true;
		});
		// Re-sort by rank and find the effective cap
		deduped.sort((a, b) => a.trancoRank - b.trancoRank);
		const caps = mappingsToProcess
			.filter((m) => m.pluginCategory === category)
			.reduce((sum, m) => sum + m.cap, 0);
		allETLEntries.set(category, deduped.slice(0, caps));
	}

	// 7. Compute UT1 hash for metadata
	let ut1Hash = "unknown";
	try {
		const hashOutput = execSync(
			`find "${ut1BlacklistsDir}" -name domains -type f | sort | xargs cat | shasum -a 256 | head -c 7`,
			{ encoding: "utf-8" },
		).trim();
		ut1Hash = hashOutput;
	} catch {
		// Not critical
	}

	// 8. Compute totals
	const totalHandCurated = allExistingPatterns.length;
	const totalETL = [...allETLEntries.values()].reduce((sum, entries) => sum + entries.length, 0);

	// 9. Build report
	const report: ETLReport = {
		date: new Date().toISOString().split("T")[0],
		ut1Hash,
		trancoDate: new Date().toISOString().split("T")[0], // Tranco is fetched "latest"
		trancoLimit: args.trancoLimit,
		categories: categoryReports,
		rejections: totalRejections,
		totalHandCurated,
		totalETL,
		totalCombined: totalHandCurated + totalETL,
	};

	printConsoleSummary(report);

	if (args.dryRun) {
		console.log("DRY RUN complete — no files written.");
		return;
	}

	// 10. Generate output files
	await mkdir(OUTPUT_DIR, { recursive: true });

	// 10a. Generate replacement categorize.ts
	console.log("Generating output files...");
	const { source: generatedSource, stats } = generateCategorizeTS(
		originalSource,
		handCurated,
		allETLEntries,
		{
			date: report.date,
			ut1Hash,
			trancoDate: report.trancoDate,
		},
	);

	const outputTSPath = join(OUTPUT_DIR, "categories-expanded.ts");
	await writeFile(outputTSPath, generatedSource, "utf-8");
	console.log(`  Written: ${outputTSPath}`);

	// 10b. Generate candidates JSON (for debugging)
	const candidatesPath = join(OUTPUT_DIR, "category-candidates.json");
	const candidatesJSON: Record<string, ETLEntry[]> = {};
	for (const [cat, entries] of allETLEntries) {
		candidatesJSON[cat] = entries;
	}
	await writeFile(candidatesPath, JSON.stringify(candidatesJSON, null, 2), "utf-8");
	console.log(`  Written: ${candidatesPath}`);

	// 10c. Generate markdown report
	const reportPath = join(OUTPUT_DIR, "etl-report.md");
	await writeMarkdownReport(reportPath, report);
	console.log(`  Written: ${reportPath}`);

	// Print per-category stats
	console.log("\nPer-category breakdown:");
	for (const [cat, s] of stats) {
		if (s.etl > 0) {
			console.log(`  ${cat}: ${s.handCurated} hand-curated + ${s.etl} ETL = ${s.handCurated + s.etl} total`);
		}
	}

	console.log("\nDone! Review the output:");
	console.log(`  diff src/filter/categorize.ts ${outputTSPath}`);
	console.log(`  cat ${reportPath}`);
}

main().catch((err) => {
	console.error("ETL failed:", err);
	process.exit(1);
});
