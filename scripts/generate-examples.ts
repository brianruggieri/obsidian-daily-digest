/**
 * generate-examples.ts — Generate screenshot example notes from persona fixtures.
 *
 * Runs 3 persona fixtures through the full 10-stage pipeline + renderer,
 * producing notes in docs/examples/ that always match the current renderer
 * output format. Re-run after any renderer change to keep examples in sync.
 *
 * Note: Persona fixtures use randomized data (timestamps, entities, etc.),
 * so each run produces slightly different content. The `generated:` timestamp
 * in frontmatter is pinned to avoid unnecessary diff noise.
 *
 * Usage:
 *   npm run generate:examples
 *
 * Persona → Example mapping:
 *   softwareEngineerDeepWork  → docs/examples/2025-06-18.md  (with AI)
 *   productManagerMeetings    → docs/examples/2025-06-19.md  (with AI)
 *   freelancerMultiProject    → docs/examples/2025-06-20-no-ai.md (no AI)
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";

import {
	softwareEngineerDeepWork,
	productManagerMeetings,
	freelancerMultiProject,
} from "../tests/fixtures/personas";
import type { PersonaOutput } from "../tests/fixtures/personas";
import { getPersonaMockSummary } from "./lib/mock-ai";
import { BASE_SETTINGS } from "./presets";
import { sanitizeCollectedData } from "../src/filter/sanitize";
import { filterSensitiveDomains, filterSensitiveSearches } from "../src/filter/sensitivity";
import { categorizeVisits } from "../src/filter/categorize";
import { classifyEventsRuleOnly } from "../src/filter/classify";
import { extractPatterns, buildEmptyTopicHistory } from "../src/analyze/patterns";
import { generateKnowledgeSections } from "../src/analyze/knowledge";
import { renderMarkdown } from "../src/render/renderer";
import type { AISummary } from "../src/types";
import type { AIProvider } from "../src/settings/types";

interface ExampleSpec {
	/** Output filename relative to docs/examples/ */
	filename: string;
	/** Fixed date for deterministic output */
	dateStr: string;
	/** Persona factory function */
	persona: (date?: Date) => PersonaOutput;
	/** Persona key for getPersonaMockSummary() lookup, or null for no-AI */
	personaKey: string | null;
}

const EXAMPLES: ExampleSpec[] = [
	{
		filename: "2025-06-18.md",
		dateStr: "2025-06-18",
		persona: softwareEngineerDeepWork,
		personaKey: "softwareEngineerDeepWork",
	},
	{
		filename: "2025-06-19.md",
		dateStr: "2025-06-19",
		persona: productManagerMeetings,
		personaKey: "productManagerMeetings",
	},
	{
		filename: "2025-06-20-no-ai.md",
		dateStr: "2025-06-20",
		persona: freelancerMultiProject,
		personaKey: null,
	},
];

function parseDate(dateStr: string): Date {
	const [y, m, d] = dateStr.split("-").map(Number);
	return new Date(y, m - 1, d);
}

function generateExample(spec: ExampleSpec): string {
	const date = parseDate(spec.dateStr);
	const data = spec.persona(date);

	// ── Stage 1: Sanitize ────────────────────────────
	const sanitized = sanitizeCollectedData(
		data.visits, data.searches, data.claude, data.git
	);

	// ── Stage 2: Sensitivity filter ──────────────────
	const visitResult = filterSensitiveDomains(sanitized.visits, {
		enabled: true,
		categories: ["adult", "gambling", "dating", "tracker", "auth"],
		customDomains: [],
		action: "exclude",
	});
	const searchResult = filterSensitiveSearches(sanitized.searches, {
		enabled: true,
		categories: ["adult", "gambling", "dating", "tracker", "auth"],
		customDomains: [],
		action: "exclude",
	});

	// ── Stage 3: Categorize ──────────────────────────
	const categorized = categorizeVisits(visitResult.kept);

	// ── Stage 4: Classify (rule-based) ───────────────
	const classification = classifyEventsRuleOnly(
		visitResult.kept, searchResult.kept,
		sanitized.claudeSessions, sanitized.gitCommits, categorized
	);

	// ── Stage 5: Patterns ────────────────────────────
	const patterns = extractPatterns(
		classification,
		{
			enabled: true,
			cooccurrenceWindow: BASE_SETTINGS.patternCooccurrenceWindow,
			minClusterSize: BASE_SETTINGS.patternMinClusterSize,
			trackRecurrence: false,
		},
		buildEmptyTopicHistory(),
		spec.dateStr
	);

	// ── Stage 6: Knowledge ───────────────────────────
	const knowledge = generateKnowledgeSections(patterns);

	// ── Stage 7–8: AI Summary (mock or null) ─────────
	let aiSummary: AISummary | null = null;
	let aiProvider: AIProvider | "none" = "none";
	if (spec.personaKey) {
		const summary = getPersonaMockSummary(spec.personaKey);
		if (!summary) {
			throw new Error(
				`[generate-examples] No mock AI summary found for personaKey "${spec.personaKey}". ` +
				`Add it to PERSONA_SUMMARIES in scripts/lib/mock-ai.ts.`
			);
		}
		aiSummary = summary;
		aiProvider = "local";
	}

	// ── Stage 9: Render ──────────────────────────────
	const md = renderMarkdown(
		date,
		visitResult.kept,
		searchResult.kept,
		sanitized.claudeSessions,
		sanitized.gitCommits,
		categorized,
		aiSummary,
		aiProvider,
		knowledge,
	);

	return md;
}

function main(): void {
	const outDir = resolve("docs/examples");
	mkdirSync(outDir, { recursive: true });
	console.error("[generate-examples] Generating example notes...");

	for (const spec of EXAMPLES) {
		let md = generateExample(spec);
		// Pin the generated timestamp so re-runs don't produce diff noise
		md = md.replace(/^generated: .+$/m, `generated: ${spec.dateStr} 08:00`);
		const outPath = resolve(outDir, spec.filename);
		writeFileSync(outPath, md, "utf-8");
		const aiLabel = spec.personaKey ? "with AI" : "no AI";
		console.error(`  ${spec.filename} (${aiLabel}) — ${md.split("\n").length} lines`);
	}

	console.error("[generate-examples] Done.");
}

main();
