// ── UT1 Blacklist file reader ────────────────────────────────
//
// Reads UT1 category directories and returns normalized domain lists.
//
// UT1 directory structure:
//   blacklists/
//     press/
//       domains        ← one domain per line
//       urls           ← (ignored — we only need domains)
//     bank/
//       domains
//     ...
//
// Domain normalization:
//   - Lowercase
//   - Strip "www." prefix
//   - Strip trailing slashes / paths
//   - Skip empty lines and comments

import { readFile } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";

/**
 * Read a single UT1 category's domain list.
 *
 * @param blacklistsDir - Path to the extracted "blacklists" directory
 * @param category - UT1 category name (directory name)
 * @returns Array of normalized domain strings
 */
export async function readUT1Category(
	blacklistsDir: string,
	category: string,
): Promise<string[]> {
	const domainsPath = join(blacklistsDir, category, "domains");

	if (!existsSync(domainsPath)) {
		console.warn(`UT1: no domains file for category "${category}" at ${domainsPath}`);
		return [];
	}

	const content = await readFile(domainsPath, "utf-8");
	const domains: string[] = [];

	for (const line of content.split("\n")) {
		const trimmed = line.trim();

		// Skip empty lines and comments
		if (!trimmed || trimmed.startsWith("#")) continue;

		// Normalize: extract just the domain part (some entries have paths)
		let domain = trimmed.toLowerCase();

		// Remove protocol if present (shouldn't be, but defensive)
		domain = domain.replace(/^https?:\/\//, "");

		// Remove path and trailing slash
		const slashIdx = domain.indexOf("/");
		if (slashIdx > 0) {
			domain = domain.slice(0, slashIdx);
		}

		// Remove port number
		const colonIdx = domain.indexOf(":");
		if (colonIdx > 0) {
			domain = domain.slice(0, colonIdx);
		}

		// Strip www. prefix
		domain = domain.replace(/^www\./, "");

		// Skip if empty after normalization
		if (!domain) continue;

		// Basic domain validation: must have at least one dot
		if (!domain.includes(".")) continue;

		domains.push(domain);
	}

	return [...new Set(domains)]; // Deduplicate
}

/**
 * Read multiple UT1 categories at once.
 *
 * @param blacklistsDir - Path to the extracted "blacklists" directory
 * @param categories - Array of UT1 category names to read
 * @returns Map from category name to domain array
 */
export async function readUT1Categories(
	blacklistsDir: string,
	categories: string[],
): Promise<Map<string, string[]>> {
	const result = new Map<string, string[]>();

	for (const cat of categories) {
		const domains = await readUT1Category(blacklistsDir, cat);
		result.set(cat, domains);
	}

	return result;
}
