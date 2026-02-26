/**
 * Markdown/Obsidian escape utilities for rendering safe daily digest notes.
 *
 * Obsidian's markdown engine interprets HTML tags, wikilinks, Dataview inline
 * fields, tag syntax, LaTeX math, and ANSI escape codes. Content sourced from
 * external data (browser titles, Claude/Codex sessions, git messages, LLM
 * output) must be escaped before interpolation into rendered markdown.
 */

// ── ANSI Escape Codes ────────────────────────────────────────────────────────

/**
 * Comprehensive ANSI escape sequence regex.
 * Matches CSI sequences (ESC[...letter), OSC sequences (ESC]...ST),
 * and standalone escape codes (ESC(A, ESC>, etc.).
 */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B(?:\[[0-9;]*[A-Za-z]|\][^\x07\x1B]*(?:\x07|\x1B\\)|\([A-B0-2]|[>=N~])/g;

/** Strip ANSI terminal formatting codes (bold, color, cursor, etc.) */
export function stripAnsi(text: string): string {
	return text.replace(ANSI_RE, "");
}

// ── HTML Tag Escaping ────────────────────────────────────────────────────────

/** Escape angle brackets so Obsidian doesn't render stray XML/HTML tags. */
export function escapeHtml(text: string): string {
	return text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ── Obsidian-Specific Escaping ───────────────────────────────────────────────

/**
 * Escape a `#` that would create an accidental Obsidian tag.
 * Tags match `#word` at word boundaries — we escape `#` followed by a letter.
 * Preserves `#123` (numbers-only are not tags) and mid-word `#`.
 */
function escapeHashTags(text: string): string {
	return text.replace(/(?<=^|[\s([])#(?=[A-Za-z])/g, "\\#");
}

/**
 * Escape `::` that Dataview would parse as an inline field.
 * Uses a zero-width space between colons: `:\u200B:`
 */
function escapeDataviewFields(text: string): string {
	return text.replace(/::/g, ":\u200B:");
}

// ── Composite Escape Functions ───────────────────────────────────────────────

/**
 * Escape text for safe rendering in a markdown bullet item or paragraph.
 * Handles: ANSI codes, HTML tags, Obsidian tags, Dataview inline fields.
 */
export function escapeForMarkdown(text: string): string {
	let s = stripAnsi(text);
	s = escapeHtml(s);
	s = escapeHashTags(s);
	s = escapeDataviewFields(s);
	return s;
}

/**
 * Escape text for use inside a markdown link title: `[title](url)`.
 * Handles everything in escapeForMarkdown plus `]` which breaks link syntax.
 */
export function escapeForLinkText(text: string): string {
	return escapeForMarkdown(text).replace(/\]/g, "\\]");
}

/**
 * Escape text for use inside a markdown table cell: `| text |`.
 * Handles everything in escapeForMarkdown plus `|` which breaks table columns.
 */
export function escapeForTableCell(text: string): string {
	return escapeForMarkdown(text).replace(/\|/g, "\\|");
}

/**
 * Escape a string for safe inclusion as a YAML frontmatter value.
 * Wraps in double quotes if the value contains any YAML-special characters.
 */
export function escapeForYaml(value: string): string {
	// Characters that require quoting in YAML values
	if (/[:{}[\]#&*!|>'"%@`,?]/.test(value) || value.includes("---")) {
		// Escape internal double quotes, then wrap
		return `"${value.replace(/"/g, '\\"')}"`;
	}
	return value;
}
