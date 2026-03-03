/**
 * Knowledge Artifact Writer — post-render stage.
 *
 * Writes atomic notes for topics, entities, note seeds, and weekly MOCs
 * into the user's vault after each daily digest generation. All operations
 * are opt-in and controlled by settings.enableArtifactWriter.
 *
 * Inputs are KnowledgeSections and AISummary data already produced locally —
 * no new cloud API calls are made by this module.
 */

import { topicSlug, entitySlug, seedSlug } from "../types";
import type { KnowledgeSections } from "../analyze/knowledge";
import type { AISummary } from "../types";
import type { DailyDigestSettings } from "../settings/types";

// ── Vault interface (mirrors merge.ts VaultAdapter) ──────

export interface ArtifactVault {
	getAbstractFileByPath(path: string): { path: string } | null;
	create(path: string, content: string): Promise<unknown>;
	modify(file: { path: string }, content: string): Promise<unknown>;
	read(file: { path: string }): Promise<string>;
	createFolder(path: string): Promise<void>;
}

// ── Helpers ──────────────────────────────────────────────

/**
 * Ensure a folder exists in the vault, creating it if needed.
 * Swallows "already exists" errors to tolerate concurrent creation.
 */
async function ensureFolder(vault: ArtifactVault, folder: string): Promise<void> {
	if (!folder) return;
	const existing = vault.getAbstractFileByPath(folder);
	if (!existing) {
		try {
			await vault.createFolder(folder);
		} catch (e) {
			if (!String(e).toLowerCase().includes("already exists")) throw e;
		}
	}
}

/**
 * Build the ISO week identifier for a given date, e.g. "2026-W09".
 */
export function isoWeek(date: Date): string {
	// Algorithm: find Thursday of the current week (ISO week starts Monday)
	const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
	const dayNum = d.getUTCDay() || 7; // Sunday=0 → 7
	d.setUTCDate(d.getUTCDate() + 4 - dayNum); // Thursday of current week
	const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
	const weekNum = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
	return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Format a Date as YYYY-MM-DD.
 */
function formatDate(d: Date): string {
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ── Topic Notes ──────────────────────────────────────────

/**
 * Create or update a topic atomic note.
 * If the note exists, appends a backlink to today's daily note.
 * If it doesn't exist, creates a minimal stub.
 */
export async function writeTopicNote(
	vault: ArtifactVault,
	topic: string,
	dailyDate: Date,
	settings: DailyDigestSettings,
): Promise<void> {
	const folder = settings.artifactFolders.topics;
	await ensureFolder(vault, folder);

	const slug = topicSlug(topic);
	const filePath = folder ? `${folder}/${slug}.md` : `${slug}.md`;
	const dateStr = formatDate(dailyDate);
	const dailyPath = buildDailyPath(dailyDate, settings);

	const existing = vault.getAbstractFileByPath(filePath);
	if (existing) {
		const content = await vault.read(existing);
		// Only append if this date isn't already linked
		if (!content.includes(`[[${dailyPath}]]`) && !content.includes(dateStr)) {
			const updated = content.trimEnd() + `\n- [[${dailyPath}]] — ${dateStr}\n`;
			await vault.modify(existing, updated);
		}
	} else {
		const content = buildTopicNoteContent(topic, slug, dailyPath, dateStr);
		await vault.create(filePath, content);
	}
}

function buildTopicNoteContent(topic: string, _slug: string, dailyPath: string, dateStr: string): string {
	return `---
type: topic
created: ${dateStr}
---

# ${topic}

## Daily Digest Appearances

- [[${dailyPath}]] — ${dateStr}
`;
}

// ── Entity Notes ─────────────────────────────────────────

/**
 * Create or update an entity atomic note.
 */
export async function writeEntityNote(
	vault: ArtifactVault,
	entity: string,
	dailyDate: Date,
	settings: DailyDigestSettings,
): Promise<void> {
	const folder = settings.artifactFolders.entities;
	await ensureFolder(vault, folder);

	const slug = entitySlug(entity);
	const filePath = folder ? `${folder}/${slug}.md` : `${slug}.md`;
	const dateStr = formatDate(dailyDate);
	const dailyPath = buildDailyPath(dailyDate, settings);

	const existing = vault.getAbstractFileByPath(filePath);
	if (existing) {
		const content = await vault.read(existing);
		if (!content.includes(`[[${dailyPath}]]`) && !content.includes(dateStr)) {
			const updated = content.trimEnd() + `\n- [[${dailyPath}]] — ${dateStr}\n`;
			await vault.modify(existing, updated);
		}
	} else {
		const content = buildEntityNoteContent(entity, slug, dailyPath, dateStr);
		await vault.create(filePath, content);
	}
}

function buildEntityNoteContent(entity: string, _slug: string, dailyPath: string, dateStr: string): string {
	return `---
type: entity
created: ${dateStr}
---

# ${entity}

## Daily Digest Appearances

- [[${dailyPath}]] — ${dateStr}
`;
}

// ── Seed Notes ───────────────────────────────────────────

/**
 * Create a note seed stub if it doesn't exist yet.
 * Unlike topic/entity notes, seeds are not updated on subsequent runs —
 * the user is expected to flesh them out manually.
 */
export async function writeSeedNote(
	vault: ArtifactVault,
	seed: string,
	dailyDate: Date,
	settings: DailyDigestSettings,
): Promise<void> {
	const folder = settings.artifactFolders.seeds;
	await ensureFolder(vault, folder);

	const slug = seedSlug(seed);
	const filePath = folder ? `${folder}/${slug}.md` : `${slug}.md`;
	const dateStr = formatDate(dailyDate);
	const dailyPath = buildDailyPath(dailyDate, settings);

	const existing = vault.getAbstractFileByPath(filePath);
	if (!existing) {
		const content = buildSeedNoteContent(seed, dailyPath, dateStr);
		await vault.create(filePath, content);
	}
	// Seeds are stubs — we don't append to them after first creation
}

function buildSeedNoteContent(seed: string, dailyPath: string, dateStr: string): string {
	return `---
type: seed
created: ${dateStr}
source: "[[${dailyPath}]]"
status: stub
---

# ${seed}

> Seeded from [[${dailyPath}]] on ${dateStr}. Expand this note.

## Notes

`;
}

// ── Weekly MOC ───────────────────────────────────────────

/**
 * Create or update the weekly Map of Content note, appending today's
 * daily note link and the top topic slugs for this run.
 */
export async function writeWeeklyMOC(
	vault: ArtifactVault,
	date: Date,
	topicSlugs: string[],
	settings: DailyDigestSettings,
): Promise<void> {
	const mocFolder = settings.artifactFolders.mocs;
	const weeklyFolder = mocFolder ? `${mocFolder}/Weekly` : "Weekly";
	await ensureFolder(vault, mocFolder ? mocFolder : "");
	await ensureFolder(vault, weeklyFolder);

	const week = isoWeek(date);
	const filePath = `${weeklyFolder}/${week}.md`;
	const dateStr = formatDate(date);
	const dailyPath = buildDailyPath(date, settings);

	const topicLinks = topicSlugs.slice(0, 10)
		.map((s) => `[[${settings.artifactFolders.topics}/${s}]]`)
		.join(", ");

	const existing = vault.getAbstractFileByPath(filePath);
	if (existing) {
		const content = await vault.read(existing);
		if (!content.includes(`[[${dailyPath}]]`)) {
			const entryLine = topicLinks
				? `- [[${dailyPath}]] — ${dateStr} · Topics: ${topicLinks}\n`
				: `- [[${dailyPath}]] — ${dateStr}\n`;
			const updated = content.trimEnd() + "\n" + entryLine;
			await vault.modify(existing, updated);
		}
	} else {
		const content = buildWeeklyMOCContent(week, dailyPath, dateStr, topicLinks);
		await vault.create(filePath, content);
	}
}

function buildWeeklyMOCContent(week: string, dailyPath: string, dateStr: string, topicLinks: string): string {
	const dailyEntry = topicLinks
		? `- [[${dailyPath}]] — ${dateStr} · Topics: ${topicLinks}`
		: `- [[${dailyPath}]] — ${dateStr}`;
	return `---
type: moc
week: ${week}
created: ${dateStr}
---

# Week ${week}

## Daily Notes

${dailyEntry}
`;
}

// ── Main entry point ─────────────────────────────────────

/**
 * Run the full artifact writer pipeline for a given date.
 * Called from main.ts after mergeOrCreate(), gated by settings.enableArtifactWriter.
 */
export async function writeArtifacts(
	vault: ArtifactVault,
	date: Date,
	knowledge: KnowledgeSections,
	aiSummary: AISummary | null,
	settings: DailyDigestSettings,
): Promise<{ topicsWritten: number; entitiesWritten: number; seedsWritten: number; mocWritten: boolean }> {
	let topicsWritten = 0;
	let entitiesWritten = 0;
	let seedsWritten = 0;
	let mocWritten = false;

	// Collect topic names from pattern analysis (topicMap lines → extract names)
	const topicNames = extractTopicNames(knowledge);
	for (const topic of topicNames) {
		try {
			await writeTopicNote(vault, topic, date, settings);
			topicsWritten++;
		} catch {
			// Non-fatal — continue with remaining artifacts
		}
	}

	// Collect entity names from entityGraph lines
	const entityNames = extractEntityNames(knowledge);
	for (const entity of entityNames) {
		try {
			await writeEntityNote(vault, entity, date, settings);
			entitiesWritten++;
		} catch {
			// Non-fatal
		}
	}

	// Note seeds from AI summary
	const seeds = aiSummary?.note_seeds ?? [];
	for (const seed of seeds) {
		try {
			await writeSeedNote(vault, seed, date, settings);
			seedsWritten++;
		} catch {
			// Non-fatal
		}
	}

	// Weekly MOC
	try {
		const slugs = topicNames.map(topicSlug);
		await writeWeeklyMOC(vault, date, slugs, settings);
		mocWritten = true;
	} catch {
		// Non-fatal
	}

	return { topicsWritten, entitiesWritten, seedsWritten, mocWritten };
}

// ── Name extraction helpers ──────────────────────────────

/**
 * Extract plain topic names from topicMap lines.
 * Handles both "topic (N mentions)" and "topic ↔ otherTopic (N co-occurrences)" formats.
 */
export function extractTopicNames(knowledge: KnowledgeSections): string[] {
	const names = new Set<string>();
	for (const line of knowledge.topicMap) {
		// Strip strength bar prefixes (█, ██, ███)
		const stripped = line.replace(/^█+\s*/, "");
		// Format: "topicA ↔ topicB (N co-occurrences)"
		const pairMatch = stripped.match(/^(.+?)\s*↔\s*(.+?)\s*\(/);
		if (pairMatch) {
			names.add(pairMatch[1].trim());
			names.add(pairMatch[2].trim());
			continue;
		}
		// Format: "topic (N mentions)"
		const singleMatch = stripped.match(/^(.+?)\s*\(/);
		if (singleMatch) {
			names.add(singleMatch[1].trim());
		}
	}
	return [...names].filter((n) => n.length > 0);
}

/**
 * Extract entity names from entityGraph lines.
 * Handles "entityA ↔ entityB (Nx in context)" format.
 */
export function extractEntityNames(knowledge: KnowledgeSections): string[] {
	const names = new Set<string>();
	for (const line of knowledge.entityGraph) {
		const match = line.match(/^(.+?)\s*↔\s*(.+?)\s*\(/);
		if (match) {
			names.add(match[1].trim());
			names.add(match[2].trim());
		}
	}
	return [...names].filter((n) => n.length > 0);
}

// ── Daily path builder ───────────────────────────────────

/**
 * Build the vault path for a daily note (without .md extension) using the
 * current settings (folder + filename template).
 */
function buildDailyPath(date: Date, settings: DailyDigestSettings): string {
	const template = settings.filenameTemplate || "YYYY-MM-DD";
	const filename = template
		.replace("YYYY", String(date.getFullYear()))
		.replace("MM", String(date.getMonth() + 1).padStart(2, "0"))
		.replace("DD", String(date.getDate()).padStart(2, "0"));
	return settings.dailyFolder ? `${settings.dailyFolder}/${filename}` : filename;
}
