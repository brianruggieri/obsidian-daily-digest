export interface AssertionResult {
	passed: boolean;
	failures: string[];
}

const REQUIRED_FRONTMATTER = ["date", "tags"];
// Patterns that indicate template rendering artifacts (not content that happens to contain these words)
const PLACEHOLDER_PATTERNS: RegExp[] = [
	/\[object Object\]/,
	// "undefined" as a bare value (not embedded in longer phrases like "Cannot read properties of undefined")
	/(?:^|:\s*)undefined(?:\s*$|\n)/m,
	/(?:^|\s)NaN(?:\s|$)/m,
];
const MIN_FILE_SIZE = 300;

function parseFrontmatterFields(fmContent: string): Record<string, string | null> {
	const fields: Record<string, string | null> = {};
	for (const line of fmContent.split("\n")) {
		const match = line.match(/^([\w][\w_-]*):\s*(.*)/);
		if (match) {
			const value = match[2].trim();
			fields[match[1]] = value.length > 0 ? value : null;
		}
	}
	return fields;
}

export function runStructuralAssertions(md: string): AssertionResult {
	const failures: string[] = [];

	if (md.length < MIN_FILE_SIZE) {
		failures.push(`File too short: ${md.length} bytes (minimum ${MIN_FILE_SIZE})`);
	}

	const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
	if (!fmMatch) {
		failures.push("No frontmatter found");
	} else {
		const frontmatter = parseFrontmatterFields(fmMatch[1]);
		for (const field of REQUIRED_FRONTMATTER) {
			if (frontmatter[field] == null || frontmatter[field] === "") {
				failures.push(`Frontmatter missing required field: ${field}`);
			}
		}
	}

	for (const pattern of PLACEHOLDER_PATTERNS) {
		const match = md.match(pattern);
		if (match) {
			failures.push(`Contains rendering artifact matching ${pattern}: "${match[0].trim()}"`);
		}
	}

	return { passed: failures.length === 0, failures };
}

export function runQualityAssertions(
	md: string,
	options: { aiEnabled: boolean }
): AssertionResult {
	const failures: string[] = [];

	const fsMatch = md.match(/focus_score:\s*(\d+)%/);
	if (fsMatch) {
		const score = parseInt(fsMatch[1], 10);
		if (isNaN(score) || score < 0 || score > 100) {
			failures.push(`focus_score out of range [0,100]: ${fsMatch[1]}%`);
		}
	}

	if (options.aiEnabled) {
		const hasHeadline = /## AI Summary/.test(md) || /^> .+/m.test(md);
		if (!hasHeadline) {
			failures.push("AI enabled but no headline or summary block found");
		}
	}

	return { passed: failures.length === 0, failures };
}

/**
 * Validate Obsidian callout syntax and structure in rendered markdown.
 *
 * Checks:
 * - Every callout header has at least one content line
 * - No H3 headings inside callouts (renders poorly in Obsidian)
 * - No nesting deeper than 2 levels
 * - Markdown link syntax integrity
 * - Dataview `answer_` fields end with `:: ` (space after `::`)
 */
export function runCalloutAssertions(md: string): AssertionResult {
	const failures: string[] = [];
	const lines = md.split("\n");

	// ── Empty callout detection ────────────────────
	// Only check collapsible callouts (those with - or +). Non-collapsible
	// callouts like `> [!info] stats text` are intentionally single-line.
	const calloutHeaderRe = /^((?:> )*> )\[!(\w+)\][+-]?\s/;
	const collapsibleRe = /^((?:> )*> )\[!(\w+)\][+-]\s/;
	for (let i = 0; i < lines.length; i++) {
		const headerMatch = lines[i].match(collapsibleRe);
		if (!headerMatch) continue;

		const prefix = headerMatch[1]; // e.g. "> " or "> > "
		const calloutType = headerMatch[2];

		// Look ahead for at least one body line with the same prefix
		let hasBody = false;
		for (let j = i + 1; j < lines.length; j++) {
			const line = lines[j];
			// Blank line or line not starting with the prefix ends this callout
			if (line.trim() === "" || !line.startsWith(prefix.trimEnd())) break;
			// Nested callout headers count as body content
			if (calloutHeaderRe.test(line)) {
				hasBody = true;
				break;
			}
			hasBody = true;
			break;
		}

		if (!hasBody) {
			failures.push(`Empty callout [!${calloutType}] at line ${i + 1}`);
		}
	}

	// ── No H3 inside callouts ──────────────────────
	// Exception: "Today I Read About" uses > ### for article cluster labels.
	for (let i = 0; i < lines.length; i++) {
		if (/^> ### /.test(lines[i]) && !isInsideArticleCluster(lines, i)) {
			failures.push(`H3 heading inside callout at line ${i + 1}: "${lines[i].slice(0, 60)}"`);
		}
	}

	// ── Nesting depth check (max 2 levels) ────────
	for (let i = 0; i < lines.length; i++) {
		const nestMatch = lines[i].match(/^((?:> )+)/);
		if (nestMatch) {
			const depth = nestMatch[1].length / 2; // each "> " is 2 chars
			if (depth > 2) {
				failures.push(`Callout nesting exceeds 2 levels at line ${i + 1} (depth ${depth})`);
			}
		}
	}

	// ── Markdown link integrity ────────────────────
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		let searchFrom = 0;
		while (true) {
			const linkClose = line.indexOf("](", searchFrom);
			if (linkClose === -1) break;
			const before = line.slice(0, linkClose);
			const openBracket = before.lastIndexOf("[");
			if (openBracket === -1) {
				failures.push(`Broken markdown link at line ${i + 1}: missing [ before ]()`);
				break;
			}
			searchFrom = linkClose + 2;
		}
	}

	// ── Dataview answer_ field format ──────────────
	const answerFieldRe = /^answer_\S+::\S/;
	for (let i = 0; i < lines.length; i++) {
		if (answerFieldRe.test(lines[i].replace(/^> /, ""))) {
			failures.push(`Dataview answer_ field missing space after :: at line ${i + 1}`);
		}
	}

	return { passed: failures.length === 0, failures };
}

/**
 * Check if a line is inside a "Today I Read About" callout,
 * where ### headings are intentionally used for cluster labels.
 */
function isInsideArticleCluster(lines: string[], index: number): boolean {
	for (let i = index - 1; i >= 0; i--) {
		const line = lines[i];
		if (line.trim() === "") continue;
		if (/Today I Read About/.test(line)) return true;
		if (!line.startsWith(">")) return false;
		if (/\[!(\w+)\]/.test(line) && !/Today I Read About/.test(line)) return false;
	}
	return false;
}
