/**
 * Safe merge logic for daily digest notes.
 *
 * When a daily note already exists, this module extracts user-authored
 * content (notes, reflection answers, custom sections) and re-injects
 * it into the freshly generated note so nothing is lost.
 *
 * Safety guarantees:
 *   1. A timestamped backup is created BEFORE any modification.
 *   2. If content extraction fails, the entire old file is preserved
 *      verbatim inside a "Previous Content" section (graceful fallback).
 *   3. Backups live in the user's vault — no data leaves the machine.
 */

// ── Known generated section headings ─────────────────────
// Any `## ` heading NOT in this set is treated as user-added content.
const GENERATED_HEADINGS = new Set([
	"Notable",
	"Cognitive Patterns",
	"Knowledge Insights",
	"Searches",
	"Claude / AI Work",
	"Browser Activity",
	"Shell",
	"Reflection",
	"Notes",
]);

/** Normalize a heading by stripping leading emoji + whitespace. */
function stripEmoji(heading: string): string {
	// Remove leading emoji (Unicode ranges) and whitespace
	return heading.replace(/^[\p{Emoji_Presentation}\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, "").trim();
}

function isGeneratedHeading(raw: string): boolean {
	const clean = stripEmoji(raw);
	return GENERATED_HEADINGS.has(clean);
}

// ── Types ────────────────────────────────────────────────

export interface UserContent {
	/** Free-form text the user added under the Notes section. */
	notesText: string;
	/**
	 * Reflection answers keyed by the inline-field slug (e.g. "answer_whats_the_best_token_storage_strategy").
	 * Only includes entries where the user actually typed a value.
	 */
	reflectionAnswers: Map<string, string>;
	/**
	 * Entire sections (heading + body) the user added that aren't
	 * part of the generated template.
	 */
	customSections: string[];
}

export interface ExtractionResult {
	/** Parsed user content, or null if parsing failed. */
	content: UserContent | null;
	/** The raw text of the existing file (always preserved). */
	raw: string;
}

// ── Extraction ───────────────────────────────────────────

/**
 * Parse an existing daily-digest markdown file and pull out everything
 * the user authored.  Returns structured content plus the raw text as
 * a safety net.
 */
export function extractUserContent(markdown: string): ExtractionResult {
	const raw = markdown;
	try {
		const content = parseUserContent(markdown);
		return { content, raw };
	} catch {
		// Extraction failed — caller will use `raw` as fallback
		return { content: null, raw };
	}
}

/**
 * Regex matching a Dataview inline field: `answer_some_slug:: user value`
 * Captures: [1] = full field key, [2] = value (may be empty/whitespace)
 */
const INLINE_FIELD_RE = /^(answer_[a-z0-9_]+)::\s*(.*)$/;

function parseUserContent(md: string): UserContent {
	const lines = md.split("\n");

	let notesText = "";
	const reflectionAnswers = new Map<string, string>();
	const customSections: string[] = [];

	// Walk through sections (## headings)
	let i = 0;
	while (i < lines.length) {
		const line = lines[i];

		// Detect ## heading
		if (line.startsWith("## ")) {
			const headingText = line.slice(3).trim();
			const strippedHeading = stripEmoji(headingText);

			if (strippedHeading === "Notes") {
				// Collect everything until next --- or ## or EOF
				i++;
				const noteLines: string[] = [];
				while (i < lines.length && !lines[i].startsWith("## ") && lines[i] !== "---") {
					noteLines.push(lines[i]);
					i++;
				}
				const joined = noteLines.join("\n").trim();
				// Ignore the default placeholder
				if (joined && joined !== "> _Add your reflections here_") {
					notesText = joined;
				}
				continue;
			}

			if (strippedHeading === "Reflection") {
				// Parse Dataview inline-field answers:
				//   ### Question text
				//   answer_slug:: user's answer
				i++;
				while (i < lines.length && !lines[i].startsWith("## ") && lines[i] !== "---") {
					const match = lines[i].match(INLINE_FIELD_RE);
					if (match) {
						const fieldKey = match[1]; // e.g. "answer_whats_the_best_token_storage_strategy"
						const value = match[2].trim();
						if (value.length > 0) {
							reflectionAnswers.set(fieldKey, value);
						}
					}
					i++;
				}
				continue;
			}

			if (!isGeneratedHeading(headingText)) {
				// This is a user-added section — collect it entirely
				const sectionLines: string[] = [line];
				i++;
				while (i < lines.length && !lines[i].startsWith("## ")) {
					sectionLines.push(lines[i]);
					i++;
				}
				const sectionText = sectionLines.join("\n").trimEnd();
				if (sectionText.trim()) {
					customSections.push(sectionText);
				}
				continue;
			}
		}

		i++;
	}

	return { notesText, reflectionAnswers, customSections };
}

// ── Merge ────────────────────────────────────────────────

const NOTES_PLACEHOLDER = "> _Add your reflections here_";

/**
 * Merge preserved user content into a freshly rendered daily-digest note.
 *
 * If `extraction.content` is available, performs a structured merge.
 * Otherwise falls back to appending the entire previous file verbatim
 * so that absolutely nothing is lost.
 */
export function mergeContent(
	newMarkdown: string,
	extraction: ExtractionResult,
): string {
	// Nothing to merge
	if (!extraction.raw.trim()) {
		return newMarkdown;
	}

	if (extraction.content) {
		return structuredMerge(newMarkdown, extraction.content);
	}

	// Fallback: append entire old content in a safe wrapper
	return fallbackMerge(newMarkdown, extraction.raw);
}

/**
 * Inject parsed user content into the correct locations in the new note.
 */
function structuredMerge(md: string, user: UserContent): string {
	const hasNotes = user.notesText.trim().length > 0;
	const hasReflection = user.reflectionAnswers.size > 0;
	const hasCustom = user.customSections.length > 0;

	if (!hasNotes && !hasReflection && !hasCustom) {
		return md;
	}

	let result = md;

	// 1. Replace Notes placeholder with user notes
	if (hasNotes) {
		result = result.replace(NOTES_PLACEHOLDER, user.notesText);
	}

	// 2. Restore reflection answers into Dataview inline fields
	if (hasReflection) {
		const lines = result.split("\n");
		const merged: string[] = [];
		for (const line of lines) {
			const match = line.match(INLINE_FIELD_RE);
			if (match) {
				const fieldKey = match[1];
				const savedAnswer = user.reflectionAnswers.get(fieldKey);
				if (savedAnswer) {
					merged.push(`${fieldKey}:: ${savedAnswer}`);
					continue;
				}
			}
			merged.push(line);
		}
		result = merged.join("\n");
	}

	// 3. Insert custom user sections before the footer (last ---)
	if (hasCustom) {
		const footerMarker = "\n---\n";
		const lastFooterIdx = result.lastIndexOf(footerMarker);
		if (lastFooterIdx !== -1) {
			const before = result.slice(0, lastFooterIdx);
			const after = result.slice(lastFooterIdx);
			const sections = user.customSections.join("\n\n");
			result = before + "\n\n" + sections + "\n" + after;
		} else {
			// No footer found — just append
			result += "\n\n" + user.customSections.join("\n\n") + "\n";
		}
	}

	return result;
}

/**
 * When structured extraction failed, append the entire old file content
 * under a clearly labeled section so the user can manually recover.
 */
function fallbackMerge(newMarkdown: string, rawOld: string): string {
	const divider = "\n---\n\n";
	const header = "## Previous Content (preserved)\n\n";
	const notice =
		"> The previous version of this note could not be automatically merged.\n" +
		"> Your original content is preserved below in full.\n\n";

	// Insert before the generation footer (last ---)
	const footerMarker = "\n---\n";
	const lastFooterIdx = newMarkdown.lastIndexOf(footerMarker);
	if (lastFooterIdx !== -1) {
		const before = newMarkdown.slice(0, lastFooterIdx);
		const after = newMarkdown.slice(lastFooterIdx);
		return before + divider + header + notice + rawOld + "\n" + after;
	}

	// Fallback: just append
	return newMarkdown + divider + header + notice + rawOld + "\n";
}

// ── Backup ───────────────────────────────────────────────

export interface VaultAdapter {
	getAbstractFileByPath(path: string): { path: string } | null;
	create(path: string, content: string): Promise<unknown>;
	createFolder(path: string): Promise<void>;
}

const BACKUP_FOLDER = ".daily-digest-backup";

/**
 * Create a timestamped backup of an existing file.
 * Returns the backup file path, or throws if backup creation fails.
 *
 * Backup files live in `.daily-digest-backup/` inside the vault.
 * They are plain markdown files the user can open and recover from.
 */
export async function createBackup(
	vault: VaultAdapter,
	originalPath: string,
	content: string,
): Promise<string> {
	// Ensure backup folder exists
	const folder = vault.getAbstractFileByPath(BACKUP_FOLDER);
	if (!folder) {
		await vault.createFolder(BACKUP_FOLDER);
	}

	// Build backup filename: original-name.2025-06-15T10-30-00.bak.md
	const basename = originalPath.split("/").pop() || "unknown.md";
	const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupName = `${basename.replace(".md", "")}.${timestamp}.bak.md`;
	const backupPath = `${BACKUP_FOLDER}/${backupName}`;

	await vault.create(backupPath, content);

	return backupPath;
}

/**
 * Check whether user content is truly empty (only default placeholders).
 * Used to skip backup when a file has never been user-edited.
 */
export function hasUserEdits(extraction: ExtractionResult): boolean {
	if (!extraction.content) {
		// Extraction failed — assume there are edits to be safe
		return true;
	}
	const { notesText, reflectionAnswers, customSections } = extraction.content;
	return (
		notesText.trim().length > 0 ||
		reflectionAnswers.size > 0 ||
		customSections.length > 0
	);
}
