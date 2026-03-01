// ── TypeScript code generator for categorize.ts ─────────────
//
// Generates a replacement categorize.ts that preserves hand-curated
// entries and appends ETL-sourced entries with clear delimiters.

import { ParsedCategory } from "./merger.js";

export interface ETLEntry {
	domain: string;
	trancoRank: number;
	ut1Category: string;
}

export interface GeneratedOutput {
	/** Full TypeScript source for the replacement categorize.ts */
	source: string;
	/** Per-category stats for the report */
	stats: Map<string, { handCurated: number; etl: number }>;
}

/**
 * Generate the full replacement categorize.ts source.
 *
 * @param originalSource - Full text of the current src/filter/categorize.ts
 * @param handCurated - Parsed hand-curated categories from merger.ts
 * @param etlEntries - Map from plugin category to sorted ETL entries
 * @param metadata - Metadata to include in the ETL delimiter comments
 */
export function generateCategorizeTS(
	originalSource: string,
	handCurated: Map<string, ParsedCategory>,
	etlEntries: Map<string, ETLEntry[]>,
	metadata: { date: string; ut1Hash: string; trancoDate: string },
): GeneratedOutput {
	const stats = new Map<string, { handCurated: number; etl: number }>();

	// Build the new CATEGORY_RULES object entries
	const categoryBlocks: string[] = [];

	// Process categories in the same order as the original source
	const categoryOrder = [...handCurated.keys()];

	for (const catName of categoryOrder) {
		const existing = handCurated.get(catName)!;
		const etl = etlEntries.get(catName) || [];

		stats.set(catName, {
			handCurated: existing.patterns.length,
			etl: etl.length,
		});

		// Build the array body
		let arrayBody = "";

		// Hand-curated section (preserve original formatting from rawBlock)
		const innerContent = extractArrayInner(existing.rawBlock);
		if (innerContent.trim()) {
			arrayBody += "\t\t// ── Hand-curated ──────────────────────────\n";
			arrayBody += innerContent;
		}

		// ETL section (only if there are entries)
		if (etl.length > 0) {
			if (arrayBody.trim()) {
				arrayBody += "\n\n";
			}
			arrayBody += `\t\t// ── ETL: UT1 + Tranco (CC BY-SA 3.0) ──\n`;
			arrayBody += `\t\t// Generated: ${metadata.date} | UT1: ${metadata.ut1Hash} | Tranco: ${metadata.trancoDate}\n`;

			// Format entries in rows of 4 for readability
			const rows = chunkArray(etl.map((e) => `"${e.domain}"`), 4);
			for (const row of rows) {
				const line = row.join(", ");
				arrayBody += `\t\t${line},\n`;
			}
		}

		categoryBlocks.push(`\t${catName}: [\n${arrayBody}\t],`);
	}

	// Reconstruct the full CATEGORY_RULES
	const rulesBlock = `export const CATEGORY_RULES: Record<string, string[]> = {\n${categoryBlocks.join("\n")}\n};`;

	// Replace the CATEGORY_RULES block in the original source
	const rulesStart = originalSource.indexOf("export const CATEGORY_RULES");
	let rulesEnd = findObjectEnd(originalSource, rulesStart);

	// Update the domain count in the header comment
	const totalPatterns = [...stats.values()].reduce(
		(sum, s) => sum + s.handCurated + s.etl, 0,
	);
	let newSource = originalSource.slice(0, rulesStart) + rulesBlock + originalSource.slice(rulesEnd);

	// Update the "~N domain patterns" comment if present
	newSource = newSource.replace(
		/~[\d,]+ domain patterns/,
		`~${totalPatterns.toLocaleString()} domain patterns`,
	);

	return { source: newSource, stats };
}

/** Extract the inner content of a category array block (between [ and ]). */
function extractArrayInner(rawBlock: string): string {
	const start = rawBlock.indexOf("[");
	const end = rawBlock.lastIndexOf("]");
	if (start === -1 || end === -1) return "";

	const inner = rawBlock.slice(start + 1, end);

	// Re-indent lines and clean up, preserving comments
	const lines = inner.split("\n");
	const result: string[] = [];
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;
		result.push(`\t\t${trimmed}`);
	}
	return result.join("\n") + "\n";
}

/** Find the end of an object literal starting from a position. */
function findObjectEnd(source: string, start: number): number {
	let depth = 0;
	let inObject = false;
	for (let i = start; i < source.length; i++) {
		if (source[i] === "{") {
			depth++;
			inObject = true;
		} else if (source[i] === "}") {
			depth--;
			if (inObject && depth === 0) {
				let end = i + 1;
				if (source[i + 1] === ";") end = i + 2;
				return end;
			}
		}
	}
	return source.length;
}

/** Split an array into chunks of a given size. */
function chunkArray<T>(arr: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let i = 0; i < arr.length; i += size) {
		chunks.push(arr.slice(i, i + size));
	}
	return chunks;
}
