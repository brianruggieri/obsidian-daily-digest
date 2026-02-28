import { AISummary, ReflectionPrompt, slugifyQuestion } from "../types";

/**
 * Heading-to-AISummary field mapping.
 * Keys are lowercased heading text; values are the AISummary field name.
 */
const HEADING_MAP: Record<string, keyof AISummary> = {
	"headline": "headline",
	"day story": "work_story",
	"mindset": "mindset",
	"tldr": "tldr",
	"learnings": "learnings",
	"remember": "remember",
	"connections": "cross_source_connections",
	"questions": "questions",
	"note seeds": "note_seeds",
	// Extended fields used by prose-high.txt
	"work patterns": "work_patterns",
	"notable": "notable",
	"themes": "themes",
	"topics": "topics",
	"entities": "entities",
};

/**
 * Fields whose prose content should be parsed as a bullet list (string[]).
 * All others are treated as a single string.
 */
const LIST_FIELDS = new Set<keyof AISummary>([
	"learnings",
	"remember",
	"questions",
	"note_seeds",
	"cross_source_connections",
	"work_patterns",
	"notable",
	"themes",
	"topics",
	"entities",
]);

/**
 * Parse tagged reflections from prose: `- **theme-slug**: Observation. Question?`
 * Returns ReflectionPrompt[] with theme as id and text as question.
 */
const TAGGED_REFLECTION_RE = /^\s*[-*•]\s*\*\*([a-z0-9][-a-z0-9]*)\*\*:\s*(.+)$/;

function parseTaggedReflections(text: string): ReflectionPrompt[] {
	const prompts: ReflectionPrompt[] = [];
	const seen = new Set<string>();
	for (const line of text.split("\n")) {
		const match = line.match(TAGGED_REFLECTION_RE);
		if (match) {
			let id = match[1];
			const base = id;
			let n = 2;
			while (seen.has(id)) {
				id = `${base}_${n++}`;
			}
			seen.add(id);
			prompts.push({ id, question: match[2].trim() });
		}
	}
	return prompts;
}

/**
 * Parse a bullet list from markdown text.
 * Handles `- item`, `* item`, and `• item` prefixes.
 * Continuation lines (not starting with a bullet) are appended to the
 * previous item.
 */
function parseBulletList(text: string): string[] {
	const items: string[] = [];
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		const bulletMatch = trimmed.match(/^[-*•]\s+(.*)/);
		if (bulletMatch) {
			items.push(bulletMatch[1].trim());
		} else if (items.length > 0) {
			// Continuation line — append to previous item
			items[items.length - 1] += " " + trimmed;
		} else {
			// No bullet prefix and no previous item — treat as standalone
			items.push(trimmed);
		}
	}
	return items;
}

/**
 * Parse heading-delimited prose LLM output into a partial AISummary.
 *
 * The parser splits on `## Heading` markers and maps each section's content
 * to the corresponding AISummary field. It is inherently forgiving — if the
 * model skips a section, adds extra ones, or reorders them, all recognized
 * sections still parse correctly.
 *
 * Returns a complete AISummary with sensible defaults for any missing fields.
 */
export function parseProseSections(raw: string): AISummary {
	// Detect error strings from callAI (e.g. "[AI summary unavailable: HTTP 401]")
	if (raw.startsWith("[AI summary unavailable:")) {
		return {
			headline: "Activity summary unavailable",
			tldr: raw,
			themes: [],
			category_summaries: {},
			notable: [],
			questions: [],
		};
	}

	// Split on ## headings, capturing the heading text
	const parts = raw.split(/^##\s+(.+)$/m);

	// parts[0] is text before the first heading (preamble — discard).
	// Then alternating: parts[1]=heading, parts[2]=content, parts[3]=heading, ...
	const sections: Record<string, string> = {};
	for (let i = 1; i < parts.length; i += 2) {
		const heading = parts[i].trim().toLowerCase();
		const content = (parts[i + 1] ?? "").trim();
		if (content) {
			sections[heading] = content;
		}
	}

	// Build the AISummary from parsed sections
	const summary: AISummary = {
		headline: "",
		tldr: "",
		themes: [],
		category_summaries: {},
		notable: [],
		questions: [],
	};

	for (const [heading, field] of Object.entries(HEADING_MAP)) {
		const content = sections[heading];
		if (!content) continue;

		if (LIST_FIELDS.has(field)) {
			const items = parseBulletList(content);
			(summary as unknown as Record<string, unknown>)[field] = items;
		} else {
			(summary as unknown as Record<string, unknown>)[field] = content;
		}
	}

	// Derive structured prompts — prefer new "reflections" heading over legacy "questions"
	const reflectionsContent = sections["reflections"];
	if (reflectionsContent) {
		const tagged = parseTaggedReflections(reflectionsContent);
		if (tagged.length > 0) {
			summary.prompts = tagged;
		}
	}

	if (!summary.prompts && summary.questions?.length) {
		// Legacy fallback: derive IDs from question text
		const seen = new Set<string>();
		summary.prompts = summary.questions.map((q) => {
			let id = slugifyQuestion(q);
			const base = id;
			let n = 2;
			while (seen.has(id)) {
				id = `${base}_${n++}`;
			}
			seen.add(id);
			return { id, question: q };
		});
	}

	// Ensure headline has a fallback
	if (!summary.headline) {
		summary.headline = "Activity summary";
	}

	return summary;
}
