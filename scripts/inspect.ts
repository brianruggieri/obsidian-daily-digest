/**
 * inspect.ts — Pipeline Inspector CLI
 *
 * Run any pipeline stage against real or fixture data and dump output.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/inspect.ts [options]
 *
 * Options:
 *   --date YYYY-MM-DD        Target date (default: today)
 *   --stage <name>           Stage to inspect (default: rendered)
 *   --format json|md|stats   Output format (default: json)
 *   --data-mode fixtures|real Data source (default: real)
 *   --ai-mode mock|real      AI calls (default: mock)
 *   --prompts-dir <path>     Prompt template directory (default: ./prompts)
 *   --out <file>             Write to file instead of stdout
 *
 * Stages:
 *   raw         Collected data before any processing
 *   sanitized   After sanitization + sensitivity filter
 *   categorized After domain categorization
 *   classified  After rule-based event classification
 *   patterns    After statistical pattern extraction
 *   knowledge   After knowledge section generation
 *   prompt      The LLM prompt text (filled template)
 *   summary     The AI summary JSON
 *   rendered    The final markdown note
 */

import { writeFileSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import { parseArgs } from "util";

import { collectFixtureData, collectRealData } from "./lib/collector-shim";
import { BASE_SETTINGS } from "./presets";
import { detectAllBrowsers } from "../src/collect/browser-profiles";
import { getMockSummary } from "./lib/mock-ai";
import { sanitizeCollectedData } from "../src/filter/sanitize";
import { filterSensitiveDomains, filterSensitiveSearches } from "../src/filter/sensitivity";
import { categorizeVisits } from "../src/filter/categorize";
import { classifyEventsRuleOnly } from "../src/filter/classify";
import { extractPatterns, buildEmptyTopicHistory } from "../src/analyze/patterns";
import { generateKnowledgeSections } from "../src/analyze/knowledge";
import { buildPrompt } from "../src/summarize/summarize";
import { renderMarkdown } from "../src/render/renderer";

type Stage = "raw" | "sanitized" | "categorized" | "classified" | "patterns" | "knowledge" | "prompt" | "summary" | "rendered";
type Format = "json" | "md" | "stats";
type DataMode = "fixtures" | "real";
type AIMode = "mock" | "real";

function parseDate(dateStr: string): Date {
	const [y, m, d] = dateStr.split("-").map(Number);
	return new Date(y, m - 1, d);
}

function expandHome(p: string): string {
	return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

function printStats(data: unknown): void {
	if (Array.isArray(data)) {
		console.log(`Array: ${data.length} items`);
		if (data.length > 0) {
			console.log("First item:", JSON.stringify(data[0], null, 2));
		}
		return;
	}
	if (typeof data === "object" && data !== null) {
		for (const [k, v] of Object.entries(data)) {
			const display = Array.isArray(v)
				? `[${v.length} items]`
				: typeof v === "string" && v.length > 80
				? v.slice(0, 80) + "…"
				: v;
			console.log(`  ${k}: ${JSON.stringify(display)}`);
		}
		return;
	}
	console.log(String(data).slice(0, 2000));
}

function output(data: unknown, format: Format, outFile: string | undefined): void {
	let text: string;
	if (format === "stats") {
		printStats(data);
		return;
	}
	if (format === "json" && typeof data !== "string") {
		text = JSON.stringify(data, null, 2);
	} else {
		text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
	}
	if (outFile) {
		writeFileSync(outFile, text, "utf-8");
		console.error(`[inspect] Written to ${outFile}`);
	} else {
		process.stdout.write(text + "\n");
	}
}

async function main(): Promise<void> {
	const { values } = parseArgs({
		options: {
			date: { type: "string", default: new Date().toISOString().slice(0, 10) },
			stage: { type: "string", default: "rendered" },
			format: { type: "string", default: "json" },
			"data-mode": { type: "string", default: "real" },
			"ai-mode": { type: "string", default: "mock" },
			"prompts-dir": { type: "string", default: resolve("prompts") },
			out: { type: "string" },
		},
		strict: false,
	});

	const dateStr = values.date as string;
	const date = parseDate(dateStr);
	const stage = values.stage as Stage;
	const format = values.format as Format;
	const dataMode = values["data-mode"] as DataMode;
	const aiMode = values["ai-mode"] as AIMode;
	const promptsDir = expandHome(values["prompts-dir"] as string);
	const outFile = values.out as string | undefined;

	console.error(`[inspect] date=${dateStr} stage=${stage} format=${format} data=${dataMode} ai=${aiMode}`);

	// Auto-detect all browsers and opt in to every profile (inspector = dev tool, not production)
	const detectedBrowsers = await detectAllBrowsers();
	const browserConfigs = detectedBrowsers.map((b) => ({
		...b,
		enabled: true,
		selectedProfiles: b.profiles.filter((p) => p.hasHistory).map((p) => p.profileDir),
	}));

	const settings = {
		...BASE_SETTINGS,
		enableBrowser: true,
		enableShell: true,
		enableClaude: true,
		enableCodex: true,
		enableGit: true,
		browserConfigs,
	};

	// ── Stage: raw ───────────────────────────────────────
	// For real data, collect the target date window: midnight → 23:59:59.999
	const since = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0);
	const until = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
	const raw = dataMode === "real"
		? await collectRealData(settings, since, until)
		: await collectFixtureData(settings);

	if (stage === "raw") {
		output({
			visits: raw.visits,
			searches: raw.searches,
			claudeSessions: raw.claudeSessions,
			gitCommits: raw.gitCommits,
		}, format, outFile);
		return;
	}

	// ── Stage: sanitized ─────────────────────────────────
	const sanitized = sanitizeCollectedData(
		raw.visits, raw.searches, raw.claudeSessions, raw.gitCommits,
		{ enabled: true, level: "standard", excludedDomains: [], redactPaths: false, scrubEmails: true }
	);
	const visitResult = filterSensitiveDomains(sanitized.visits, {
		enabled: true, categories: ["adult", "gambling", "dating", "tracker", "auth"], customDomains: [], action: "exclude",
	});
	const searchResult = filterSensitiveSearches(sanitized.searches, {
		enabled: true, categories: ["adult", "gambling", "dating", "tracker", "auth"], customDomains: [], action: "exclude",
	});

	if (stage === "sanitized") {
		output({
			visits: visitResult.kept,
			searches: searchResult.kept,
			claudeSessions: sanitized.claudeSessions,
			gitCommits: sanitized.gitCommits,
			filtered: visitResult.filtered + searchResult.filtered,
		}, format, outFile);
		return;
	}

	// ── Stage: categorized ───────────────────────────────
	const categorized = categorizeVisits(visitResult.kept);

	if (stage === "categorized") {
		output(categorized, format, outFile);
		return;
	}

	// ── Stage: classified ────────────────────────────────
	const classification = classifyEventsRuleOnly(
		visitResult.kept, searchResult.kept,
		sanitized.claudeSessions, sanitized.gitCommits, categorized
	);

	if (stage === "classified") {
		output(classification, format, outFile);
		return;
	}

	// ── Stage: patterns ──────────────────────────────────
	const patterns = extractPatterns(
		classification,
		{ enabled: true, cooccurrenceWindow: 30, minClusterSize: 2, trackRecurrence: false },
		buildEmptyTopicHistory(),
		dateStr
	);

	if (stage === "patterns") {
		output(patterns, format, outFile);
		return;
	}

	// ── Stage: knowledge ─────────────────────────────────
	const knowledge = generateKnowledgeSections(patterns);

	if (stage === "knowledge") {
		output(knowledge, format, outFile);
		return;
	}

	// ── Stage: prompt ────────────────────────────────────
	if (stage === "prompt") {
		const promptText = buildPrompt(
			date, categorized, searchResult.kept,
			sanitized.claudeSessions, settings.profile, sanitized.gitCommits, promptsDir
		);
		output(promptText, "md", outFile);
		return;
	}

	// ── Stage: summary ───────────────────────────────────
	if (stage === "summary") {
		if (aiMode === "mock") {
			output(getMockSummary("inspect"), format, outFile);
		} else {
			console.error("[inspect] --ai-mode real for summary stage: set ANTHROPIC_API_KEY env var and ensure your localEndpoint is running.");
			console.error("[inspect] Real AI summary not yet wired in inspect.ts — use the full matrix runner for now.");
			process.exit(1);
		}
		return;
	}

	// ── Stage: rendered ──────────────────────────────────
	if (stage === "rendered") {
		const aiSummary = aiMode === "mock" ? getMockSummary("inspect") : null;
		const md = renderMarkdown(
			date, visitResult.kept, searchResult.kept,
			sanitized.claudeSessions, sanitized.gitCommits, categorized,
			aiSummary, aiMode === "mock" ? "local" : "none",
			knowledge
		);
		output(md, "md", outFile);
		return;
	}

	console.error(`[inspect] Unknown stage: ${stage}`);
	process.exit(1);
}

main().catch((e: unknown) => {
	console.error("[inspect] Fatal error:", e instanceof Error ? e.message : String(e));
	process.exit(1);
});
