// ── Tranco top-1M CSV parser ─────────────────────────────────
//
// Parses the Tranco list CSV into a Map<domain, rank>.
// Supports early-exit when we only need the top-N.
//
// CSV format: rank,domain (no header row)
//   1,google.com
//   2,youtube.com
//   ...

import { createReadStream } from "fs";
import { createInterface } from "readline";

/**
 * Parse a Tranco CSV file into a Map<domain, rank>.
 *
 * @param csvPath - Path to the downloaded Tranco CSV
 * @param limit - Stop after this rank (default 50,000). Set to 0 for no limit.
 * @returns Map where keys are normalized domains, values are integer ranks
 */
export async function parseTrancoCSV(
	csvPath: string,
	limit = 50_000,
): Promise<Map<string, number>> {
	const domains = new Map<string, number>();
	const rl = createInterface({
		input: createReadStream(csvPath, { encoding: "utf-8" }),
		crlfDelay: Infinity,
	});

	for await (const line of rl) {
		if (!line.trim()) continue;
		const comma = line.indexOf(",");
		if (comma === -1) continue;

		const rank = parseInt(line.slice(0, comma), 10);
		const domain = line.slice(comma + 1).trim().toLowerCase();

		if (isNaN(rank) || !domain) continue;

		// Early exit: if we've passed the limit rank, stop reading
		if (limit > 0 && rank > limit) break;

		domains.set(domain, rank);
	}

	return domains;
}

/**
 * Check whether a domain appears in the Tranco map, accounting for
 * subdomain stripping. Tries exact match first, then strips one
 * subdomain level (e.g. "store.example.com" → "example.com").
 *
 * @returns The rank if found, or undefined
 */
export function lookupTrancoRank(
	domain: string,
	trancoMap: Map<string, number>,
): number | undefined {
	const normalized = domain.toLowerCase().replace(/^www\./, "");

	// Exact match
	const exact = trancoMap.get(normalized);
	if (exact !== undefined) return exact;

	// Strip one subdomain level
	const dotIndex = normalized.indexOf(".");
	if (dotIndex > 0) {
		const parent = normalized.slice(dotIndex + 1);
		return trancoMap.get(parent);
	}

	return undefined;
}
