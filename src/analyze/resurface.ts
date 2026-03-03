/**
 * Spaced Resurfacing Block Builder.
 *
 * Uses recurrence signals (already computed locally by patterns.ts) to
 * generate a "Resurface" section linking back to prior daily notes where
 * the same topics were encountered.
 *
 * Entirely local — no LLM calls, no cloud API calls.
 */

import type { RecurrenceSignal, KnowledgeDelta } from "../types";
import type { DailyDigestSettings } from "../settings/types";

// ── Vault interface (read-only) ──────────────────────────

export interface ResurfaceVault {
	getAbstractFileByPath(path: string): { path: string } | null;
}

// ── Types ────────────────────────────────────────────────

export interface ResurfaceLine {
	/** The topic being resurfaced. */
	topic: string;
	/** Vault path to the prior daily note (without .md). */
	priorNotePath: string;
	/** Number of days since the topic was last seen. */
	daysSince: number;
	/** Recurrence trend signal. */
	trend: RecurrenceSignal["trend"];
}

// ── Main builder ─────────────────────────────────────────

/**
 * Build a list of resurfacing lines from recurrence signals.
 *
 * For each "returning" or "rising" signal that has a `lastSeen` date,
 * attempts to find the corresponding daily note in the vault and emits
 * a "You last touched [[Topic]] N days ago — see [[daily/YYYY-MM-DD]]" line.
 *
 * Returns an empty array when there is nothing to resurface.
 */
export function buildResurfaceBlock(
	recurrenceSignals: RecurrenceSignal[],
	knowledgeDelta: KnowledgeDelta,
	vault: ResurfaceVault,
	currentDate: Date,
	settings: DailyDigestSettings,
): ResurfaceLine[] {
	const lines: ResurfaceLine[] = [];

	// Focus on returning and rising topics — these are the most actionable for recall
	const candidates = recurrenceSignals.filter(
		(s) => (s.trend === "returning" || s.trend === "rising") && s.lastSeen
	);

	// Also surface new recurring topics from knowledgeDelta that aren't already in signals
	const deltaReturning = knowledgeDelta.recurringTopics.filter(
		(t) => !candidates.some((s) => s.topic === t)
	);

	for (const signal of candidates.slice(0, 4)) {
		if (!signal.lastSeen) continue;

		const priorDate = new Date(signal.lastSeen);
		const daysSince = Math.floor(
			(currentDate.getTime() - priorDate.getTime()) / (1000 * 60 * 60 * 24)
		);

		if (daysSince <= 0) continue; // same-day, skip

		const priorPath = buildDailyPath(priorDate, settings);

		// Only include if the prior daily note actually exists in the vault
		const noteExists = vault.getAbstractFileByPath(priorPath + ".md") !== null
			|| vault.getAbstractFileByPath(priorPath) !== null;

		if (noteExists) {
			lines.push({
				topic: signal.topic,
				priorNotePath: priorPath,
				daysSince,
				trend: signal.trend,
			});
		}
	}

	// Add delta-based entries (no vault check — these are known recurring topics)
	for (const topic of deltaReturning.slice(0, 2)) {
		// Find the most recent occurrence in signals (may be stable/declining)
		const signal = recurrenceSignals.find((s) => s.topic === topic && s.lastSeen);
		if (!signal?.lastSeen) continue;

		const priorDate = new Date(signal.lastSeen);
		const daysSince = Math.floor(
			(currentDate.getTime() - priorDate.getTime()) / (1000 * 60 * 60 * 24)
		);

		if (daysSince <= 0) continue;

		const priorPath = buildDailyPath(priorDate, settings);
		lines.push({
			topic,
			priorNotePath: priorPath,
			daysSince,
			trend: signal.trend,
		});
	}

	return lines;
}

/**
 * Render ResurfaceLine[] as markdown bullet lines for the ## Resurface section.
 */
export function renderResurfaceLines(lines: ResurfaceLine[]): string[] {
	if (lines.length === 0) return [];

	return lines.map((l) => {
		const dayWord = l.daysSince === 1 ? "day" : "days";
		const trendNote = l.trend === "returning" ? " (returning)" : "";
		return `- **${l.topic}**${trendNote} — last seen ${l.daysSince} ${dayWord} ago · see [[${l.priorNotePath}]]`;
	});
}

// ── Daily path builder ───────────────────────────────────

function buildDailyPath(date: Date, settings: DailyDigestSettings): string {
	const template = settings.filenameTemplate || "YYYY-MM-DD";
	const filename = template
		.replace("YYYY", String(date.getFullYear()))
		.replace("MM", String(date.getMonth() + 1).padStart(2, "0"))
		.replace("DD", String(date.getDate()).padStart(2, "0"));
	return settings.dailyFolder ? `${settings.dailyFolder}/${filename}` : filename;
}
