/**
 * privacy-diff.ts — Privacy Level Comparison Tool
 *
 * Reads all preset output files for a given date from the matrix output
 * directory and generates a `00-privacy-diff.md` report showing how each
 * privacy level compares to the others:
 *
 *   1. Structured field comparison table (stats, AI exposure)
 *   2. Prompt/AI exposure table (model, tokens, tier, sections sent)
 *   3. Incremental diffs — adjacent privacy-rank pairs
 *   4. Group-boundary diffs — no-ai → local → cloud transitions
 *
 * Invoke via:
 *   npm run matrix:diff
 * or:
 *   DATE=2026-02-25 npm run matrix:diff
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

import { PRESETS, getPresetFilename } from "./presets";

// ── Env vars ──────────────────────────────────────────────

const DATE_STR = process.env.DATE ?? new Date().toISOString().slice(0, 10);
const VAULT_ROOT = join(homedir(), "obsidian-vaults", "daily-digest-test");
const OUTPUT_DIR = join(VAULT_ROOT, DATE_STR);

// ── Types ─────────────────────────────────────────────────

interface ParsedNote {
	presetId: string;
	filename: string;
	privacyRank: number;
	privacyGroup: "no-ai" | "local" | "cloud";

	// Frontmatter fields
	focusScore: string | null;      // e.g. "2%"
	categories: string[];
	tags: string[];
	gitCommits: number | null;

	// Stats line
	visits: number;
	searches: number;
	aiPrompts: number;
	commits: number;
	categoryCount: number;

	// AI / prompt details
	aiModel: string | null;
	tokenCount: number | null;
	privacyTier: number | null;
	promptSections: string[];       // e.g. ["browser_activity", "ai_sessions"]

	// Note sections present (## headings)
	headings: string[];

	// Raw markdown
	raw: string;
}

// ── Parsers ───────────────────────────────────────────────

function parseFrontmatter(md: string): Record<string, string> {
	const match = md.match(/^---\n([\s\S]*?)\n---/);
	if (!match) return {};
	const result: Record<string, string> = {};
	for (const line of match[1].split("\n")) {
		const colon = line.indexOf(":");
		if (colon === -1) continue;
		const key = line.slice(0, colon).trim();
		const val = line.slice(colon + 1).trim();
		result[key] = val;
	}
	return result;
}

function parseTags(raw: string): string[] {
	// tags: [daily, daily-digest, work, activity/implementation, ...]
	const m = raw.match(/^\[(.+)\]$/);
	if (!m) return [];
	return m[1].split(",").map(t => t.trim()).filter(Boolean);
}

function parseCategories(raw: string): string[] {
	const m = raw.match(/^\[(.+)\]$/);
	if (!m) return [];
	return m[1].split(",").map(t => t.trim()).filter(Boolean);
}

/** Parse the `> [!info] N visits · N searches · N AI prompts · N commits · N categories` line */
function parseStatsLine(md: string): { visits: number; searches: number; aiPrompts: number; commits: number; categories: number } {
	const m = md.match(/\[!info\]\s+(\d+)\s+visits\s+·\s+(\d+)\s+searches\s+·\s+(\d+)\s+AI prompts\s+·\s+(\d+)\s+commits\s+·\s+(\d+)\s+categories/);
	if (!m) return { visits: 0, searches: 0, aiPrompts: 0, commits: 0, categories: 0 };
	return {
		visits: parseInt(m[1], 10),
		searches: parseInt(m[2], 10),
		aiPrompts: parseInt(m[3], 10),
		commits: parseInt(m[4], 10),
		categories: parseInt(m[5], 10),
	};
}

/** Parse the <details> prompt block summary line: "Prompt sent to MODEL · N tokens · Tier T" */
function parseDetailsBlock(md: string): { model: string | null; tokens: number | null; tier: number | null; sections: string[] } {
	const summaryM = md.match(/<summary>\s*Prompt sent to ([^\s·]+)\s+·\s+(\d+)\s+tokens\s+·\s+Tier\s+(\d+)/);
	if (!summaryM) return { model: null, tokens: null, tier: null, sections: [] };
	const model = summaryM[1];
	const tokens = parseInt(summaryM[2], 10);
	const tier = parseInt(summaryM[3], 10);

	// Extract XML-style section tags from the prompt body inside <details>
	const detailsM = md.match(/<details>([\s\S]*?)<\/details>/);
	const sections: string[] = [];
	if (detailsM) {
		const tagMatches = detailsM[1].matchAll(/<([a-z_]+)>/g);
		for (const t of tagMatches) {
			const name = t[1];
			if (!["summary", "details", "br", "p", "pre", "code"].includes(name)) {
				sections.push(name);
			}
		}
	}
	return { model, tokens, tier, sections };
}

/** Extract ## headings from a note */
function parseHeadings(md: string): string[] {
	const headings: string[] = [];
	for (const line of md.split("\n")) {
		if (line.startsWith("## ")) {
			headings.push(line.slice(3).trim());
		}
	}
	return headings;
}

function parseNote(presetId: string, md: string): ParsedNote {
	const preset = PRESETS.find(p => p.id === presetId)!;
	const fm = parseFrontmatter(md);
	const stats = parseStatsLine(md);
	const details = parseDetailsBlock(md);

	return {
		presetId,
		filename: getPresetFilename(preset),
		privacyRank: preset.privacyRank,
		privacyGroup: preset.privacyGroup,
		focusScore: fm["focus_score"] ?? null,
		categories: fm["categories"] ? parseCategories(fm["categories"]) : [],
		tags: fm["tags"] ? parseTags(fm["tags"]) : [],
		gitCommits: fm["git-commits"] ? parseInt(fm["git-commits"], 10) : null,
		visits: stats.visits,
		searches: stats.searches,
		aiPrompts: stats.aiPrompts,
		commits: stats.commits,
		categoryCount: stats.categories,
		aiModel: details.model,
		tokenCount: details.tokens,
		privacyTier: details.tier,
		promptSections: details.sections,
		headings: parseHeadings(md),
		raw: md,
	};
}

// ── Diff helpers ──────────────────────────────────────────

function statsDelta(a: ParsedNote, b: ParsedNote): string[] {
	const lines: string[] = [];
	const fields: Array<[string, keyof ParsedNote]> = [
		["Visits", "visits"],
		["Searches", "searches"],
		["AI Prompts", "aiPrompts"],
		["Commits", "commits"],
		["Categories", "categoryCount"],
	];
	for (const [label, key] of fields) {
		const av = a[key] as number;
		const bv = b[key] as number;
		if (av !== bv) {
			const delta = bv - av;
			lines.push(`${label}: ${av} → ${bv} (${delta >= 0 ? "+" : ""}${delta})`);
		}
	}
	if (a.focusScore !== b.focusScore) {
		lines.push(`Focus: ${a.focusScore ?? "—"} → ${b.focusScore ?? "—"}`);
	}
	return lines;
}

function headingsDelta(a: ParsedNote, b: ParsedNote): { added: string[]; removed: string[] } {
	const aSet = new Set(a.headings);
	const bSet = new Set(b.headings);
	return {
		added: b.headings.filter(h => !aSet.has(h)),
		removed: a.headings.filter(h => !bSet.has(h)),
	};
}

function promptDelta(a: ParsedNote, b: ParsedNote): string[] {
	const lines: string[] = [];

	// Model / tier transition
	if (a.aiModel !== b.aiModel || a.privacyTier !== b.privacyTier) {
		const aDesc = a.aiModel ? `${a.aiModel} Tier ${a.privacyTier}` : "no AI";
		const bDesc = b.aiModel ? `${b.aiModel} Tier ${b.privacyTier}` : "no AI";
		lines.push(`AI: ${aDesc} → ${bDesc}`);
	}

	// Token delta
	if (a.tokenCount !== b.tokenCount) {
		const delta = (b.tokenCount ?? 0) - (a.tokenCount ?? 0);
		lines.push(`Tokens: ${a.tokenCount ?? "—"} → ${b.tokenCount ?? "—"} (${delta >= 0 ? "+" : ""}${delta})`);
	}

	// Prompt sections added/removed
	const aSet = new Set(a.promptSections);
	const bSet = new Set(b.promptSections);
	const added = b.promptSections.filter(s => !aSet.has(s));
	const removed = a.promptSections.filter(s => !bSet.has(s));
	if (added.length) lines.push(`Prompt sections added: ${added.map(s => `\`${s}\``).join(", ")}`);
	if (removed.length) lines.push(`Prompt sections removed: ${removed.map(s => `\`${s}\``).join(", ")}`);

	return lines;
}

// ── Rendering helpers ─────────────────────────────────────

function renderSummaryTable(notes: ParsedNote[]): string {
	const header = "| # | Preset | Group | Visits | Searches | AI Prompts | Commits | Focus |";
	const sep    = "|---|--------|-------|-------:|----------:|-----------:|--------:|------:|";
	const rows = notes.map(n =>
		`| ${n.privacyRank} | \`${n.presetId}\` | ${n.privacyGroup} | ${n.visits} | ${n.searches} | ${n.aiPrompts} | ${n.commits} | ${n.focusScore ?? "—"} |`
	);
	return [header, sep, ...rows].join("\n");
}

function renderExposureTable(notes: ParsedNote[]): string {
	const header = "| # | Preset | Provider | Model | Tokens | Tier | Sections Sent to LLM |";
	const sep    = "|---|--------|----------|-------|-------:|-----:|----------------------|";
	const rows = notes.map(n => {
		const provider = n.privacyGroup === "no-ai" ? "none" : n.privacyGroup === "local" ? "local" : "Anthropic";
		const model = n.aiModel ?? "—";
		const tokens = n.tokenCount !== null ? String(n.tokenCount) : "—";
		const tier = n.privacyTier !== null ? String(n.privacyTier) : "—";
		const sections = n.promptSections.length ? n.promptSections.map(s => `\`${s}\``).join(", ") : "—";
		return `| ${n.privacyRank} | \`${n.presetId}\` | ${provider} | ${model} | ${tokens} | ${tier} | ${sections} |`;
	});
	return [header, sep, ...rows].join("\n");
}

function renderIncrementalDiff(a: ParsedNote, b: ParsedNote): string {
	const title = `### ${a.presetId} → ${b.presetId}`;
	const lines: string[] = [title, ""];

	const sd = statsDelta(a, b);
	if (sd.length) {
		lines.push("**Stats delta:**");
		for (const l of sd) lines.push(`- ${l}`);
	} else {
		lines.push("**Stats delta:** _no change_");
	}
	lines.push("");

	const hd = headingsDelta(a, b);
	if (hd.added.length || hd.removed.length) {
		lines.push("**Note sections:**");
		if (hd.added.length) lines.push(`- Added: ${hd.added.map(h => `"${h}"`).join(", ")}`);
		if (hd.removed.length) lines.push(`- Removed: ${hd.removed.map(h => `"${h}"`).join(", ")}`);
	} else {
		lines.push("**Note sections:** _no change_");
	}
	lines.push("");

	const pd = promptDelta(a, b);
	if (pd.length) {
		lines.push("**AI/Prompt changes:**");
		for (const l of pd) lines.push(`- ${l}`);
	} else {
		lines.push("**AI/Prompt changes:** _no change_");
	}

	lines.push("");
	lines.push("---");
	return lines.join("\n");
}

function renderGroupBoundary(fromNotes: ParsedNote[], toNotes: ParsedNote[], fromLabel: string, toLabel: string): string {
	const from = fromNotes[fromNotes.length - 1]; // least-private of the from group
	const to = toNotes[0];                          // most-private of the to group
	const lines: string[] = [
		`### ${fromLabel} → ${toLabel}`,
		"",
		`Transition: \`${from.presetId}\` (rank ${from.privacyRank}) → \`${to.presetId}\` (rank ${to.privacyRank})`,
		"",
	];

	const pd = promptDelta(from, to);
	if (pd.length) {
		lines.push("**Key changes:**");
		for (const l of pd) lines.push(`- ${l}`);
	}

	const hd = headingsDelta(from, to);
	if (hd.added.length || hd.removed.length) {
		lines.push("");
		lines.push("**Note sections:**");
		if (hd.added.length) lines.push(`- Added: ${hd.added.map(h => `"${h}"`).join(", ")}`);
		if (hd.removed.length) lines.push(`- Removed: ${hd.removed.map(h => `"${h}"`).join(", ")}`);
	}

	lines.push("");
	lines.push("---");
	return lines.join("\n");
}

// ── Main ──────────────────────────────────────────────────

async function main(): Promise<void> {
	console.log(`Privacy Diff`);
	console.log(`  Date:   ${DATE_STR}`);
	console.log(`  Dir:    ${OUTPUT_DIR}`);

	// Load all preset files in privacy order
	const notes: ParsedNote[] = [];
	const missing: string[] = [];

	for (const preset of PRESETS) {
		const filename = `${getPresetFilename(preset)}.md`;
		const filePath = join(OUTPUT_DIR, filename);
		if (!existsSync(filePath)) {
			// Also try the old (unranked) naming scheme for backwards compat
			const oldPath = join(OUTPUT_DIR, `${preset.id}.md`);
			if (existsSync(oldPath)) {
				const md = readFileSync(oldPath, "utf-8");
				notes.push(parseNote(preset.id, md));
				console.log(`  Loaded (legacy name): ${preset.id}.md`);
			} else {
				missing.push(filename);
				console.warn(`  Missing: ${filename}`);
			}
		} else {
			const md = readFileSync(filePath, "utf-8");
			notes.push(parseNote(preset.id, md));
			console.log(`  Loaded: ${filename}`);
		}
	}

	if (notes.length === 0) {
		console.error("No preset files found. Run 'npm run matrix' first.");
		process.exit(1);
	}

	// Build report
	const lines: string[] = [
		`# Privacy Diff Report — ${DATE_STR}`,
		"",
		`> Generated: ${new Date().toISOString()}  `,
		`> Presets loaded: ${notes.length}/${PRESETS.length}${missing.length ? ` (missing: ${missing.join(", ")})` : ""}`,
		"",
		"---",
		"",
		"## Summary Table",
		"",
		renderSummaryTable(notes),
		"",
		"---",
		"",
		"## AI Exposure Table",
		"",
		renderExposureTable(notes),
		"",
		"---",
		"",
		"## Incremental Diffs",
		"",
		"> Each step shows what changes when you move from the more-private preset to the less-private one immediately below it.",
		"",
	];

	for (let i = 0; i < notes.length - 1; i++) {
		lines.push(renderIncrementalDiff(notes[i], notes[i + 1]));
		lines.push("");
	}

	// Group boundary diffs
	const noAiNotes = notes.filter(n => n.privacyGroup === "no-ai");
	const localNotes = notes.filter(n => n.privacyGroup === "local");
	const cloudNotes = notes.filter(n => n.privacyGroup === "cloud");

	lines.push("## Group Boundary Diffs");
	lines.push("");
	lines.push("> Compares the least-private preset of one group with the most-private preset of the next group.");
	lines.push("");

	if (noAiNotes.length && localNotes.length) {
		lines.push(renderGroupBoundary(noAiNotes, localNotes, "No-AI Group", "Local LLM Group"));
	}
	if (localNotes.length && cloudNotes.length) {
		lines.push(renderGroupBoundary(localNotes, cloudNotes, "Local LLM Group", "Cloud Group"));
	}

	// Footer
	lines.push("---");
	lines.push("");
	lines.push("*Generated by privacy-diff.ts — No data was sent externally.*");
	lines.push("");

	const report = lines.join("\n");
	const outPath = join(OUTPUT_DIR, "00-privacy-diff.md");
	writeFileSync(outPath, report, "utf-8");
	console.log(`\nReport written to ${outPath}`);
}

main().catch(err => {
	console.error("privacy-diff failed:", err);
	process.exit(1);
});
