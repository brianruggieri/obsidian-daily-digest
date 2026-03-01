// ── Static parser for existing categorize.ts ────────────────
//
// Parses the CATEGORY_RULES object from src/filter/categorize.ts
// using regex (no TypeScript compiler or Obsidian imports needed).
//
// Used to:
//   1. Extract hand-curated domain patterns so we can dedup ETL imports
//   2. Preserve hand-curated entries in the generated output

/**
 * Parsed representation of a single category's hand-curated entries.
 */
export interface ParsedCategory {
	/** Plugin category key (e.g. "shopping") */
	name: string;
	/** Hand-curated domain patterns in their original order */
	patterns: string[];
	/** Raw source text of this category block (for comment preservation) */
	rawBlock: string;
}

/**
 * Parse CATEGORY_RULES from the categorize.ts source.
 * Extracts each category key and its string array entries.
 *
 * @param source - Full text of src/filter/categorize.ts
 * @returns Map from category name to parsed data
 */
export function parseCategoryRules(source: string): Map<string, ParsedCategory> {
	const result = new Map<string, ParsedCategory>();

	// Find the CATEGORY_RULES block: from "export const CATEGORY_RULES" to the closing "};"
	const rulesStart = source.indexOf("export const CATEGORY_RULES");
	if (rulesStart === -1) {
		throw new Error("Could not find CATEGORY_RULES in source");
	}

	// Find closing of the object — match the "};" at the correct nesting level
	let depth = 0;
	let rulesEnd = -1;
	let inObject = false;
	for (let i = rulesStart; i < source.length; i++) {
		if (source[i] === "{") {
			depth++;
			inObject = true;
		} else if (source[i] === "}") {
			depth--;
			if (inObject && depth === 0) {
				// Check for optional semicolon after closing brace
				rulesEnd = i + 1;
				if (source[i + 1] === ";") rulesEnd = i + 2;
				break;
			}
		}
	}

	if (rulesEnd === -1) {
		throw new Error("Could not find end of CATEGORY_RULES");
	}

	const rulesBlock = source.slice(rulesStart, rulesEnd);

	// Extract each category: key: [...],
	// Pattern: word/underscore key followed by array contents
	const categoryPattern = /(\w+)\s*:\s*\[/g;
	let match;

	while ((match = categoryPattern.exec(rulesBlock)) !== null) {
		const name = match[1];
		const arrayStart = match.index + match[0].length;

		// Find the matching "]" — account for nested brackets (none expected, but safe)
		let bracketDepth = 1;
		let arrayEnd = -1;
		for (let i = arrayStart; i < rulesBlock.length; i++) {
			if (rulesBlock[i] === "[") bracketDepth++;
			else if (rulesBlock[i] === "]") {
				bracketDepth--;
				if (bracketDepth === 0) {
					arrayEnd = i;
					break;
				}
			}
		}

		if (arrayEnd === -1) continue;

		const arrayContent = rulesBlock.slice(arrayStart, arrayEnd);
		const rawBlock = rulesBlock.slice(match.index, arrayEnd + 1);

		// Extract all quoted strings from the array
		const stringPattern = /"([^"]+)"/g;
		const patterns: string[] = [];
		let strMatch;
		while ((strMatch = stringPattern.exec(arrayContent)) !== null) {
			patterns.push(strMatch[1]);
		}

		result.set(name, { name, patterns, rawBlock });
	}

	return result;
}

/**
 * Check whether a domain is already covered by existing hand-curated patterns.
 * Uses `includes()` matching to mirror the plugin's runtime behavior.
 *
 * For example, if a hand-curated pattern is "amazon.com", then
 * "amazon.com" would be covered, but also checked is whether
 * the pattern appears as a substring of the domain.
 */
export function isDomainCovered(domain: string, existingPatterns: string[]): boolean {
	const normalized = domain.toLowerCase().replace(/^www\./, "");
	for (const pattern of existingPatterns) {
		// Mirror the runtime: domain.includes(pattern)
		if (normalized.includes(pattern)) return true;
		// Also check reverse: pattern.includes(domain) for broader patterns like "docs."
		if (pattern.includes(normalized)) return true;
	}
	return false;
}

/**
 * Collect ALL hand-curated patterns across all categories (flattened).
 * Used for deduplication against ETL candidates.
 */
export function getAllExistingPatterns(categories: Map<string, ParsedCategory>): string[] {
	const all: string[] = [];
	for (const cat of categories.values()) {
		all.push(...cat.patterns);
	}
	return all;
}
