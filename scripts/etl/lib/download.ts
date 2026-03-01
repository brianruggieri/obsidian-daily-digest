// ── Cached download for UT1 + Tranco data sources ───────────
//
// Downloads and caches the two data sources used by the ETL:
//   1. UT1 Blacklists (tar.gz from Université Toulouse)
//   2. Tranco top-1M list (CSV zip)
//
// Cache directory: scripts/etl/data/ (gitignored)
// Cache freshness: 7 days by default

import { existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";
import { execSync } from "child_process";

const UT1_URL = "https://dsi.ut-capitole.fr/blacklists/download/blacklists.tar.gz";
const TRANCO_URL = "https://tranco-list.eu/top-1m.csv.zip";

const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface DownloadPaths {
	trancoCSV: string;
	ut1BlacklistsDir: string;
}

function isCacheFresh(path: string): boolean {
	if (!existsSync(path)) return false;
	const stat = statSync(path);
	return Date.now() - stat.mtimeMs < CACHE_MAX_AGE_MS;
}

/**
 * Download and extract the Tranco top-1M CSV.
 * Returns the path to the extracted CSV file.
 */
async function downloadTranco(dataDir: string, forceRefresh: boolean): Promise<string> {
	const zipPath = join(dataDir, "tranco-top-1m.csv.zip");
	const csvPath = join(dataDir, "top-1m.csv");

	if (!forceRefresh && isCacheFresh(csvPath)) {
		console.log("  Tranco: using cached CSV");
		return csvPath;
	}

	console.log("  Tranco: downloading top-1M list...");
	execSync(`curl -fsSL -o "${zipPath}" "${TRANCO_URL}"`, { stdio: "inherit" });

	console.log("  Tranco: extracting CSV...");
	execSync(`unzip -o -q "${zipPath}" -d "${dataDir}"`, { stdio: "inherit" });

	return csvPath;
}

/**
 * Download and extract the UT1 Blacklists tarball.
 * Returns the path to the extracted "blacklists" directory.
 */
async function downloadUT1(dataDir: string, forceRefresh: boolean): Promise<string> {
	const tarPath = join(dataDir, "blacklists.tar.gz");
	const extractDir = join(dataDir, "blacklists");

	if (!forceRefresh && isCacheFresh(extractDir)) {
		console.log("  UT1: using cached blacklists");
		return extractDir;
	}

	console.log("  UT1: downloading blacklists tarball...");
	execSync(`curl -fsSL -o "${tarPath}" "${UT1_URL}"`, { stdio: "inherit" });

	console.log("  UT1: extracting...");
	// Remove old extraction to avoid stale categories
	if (existsSync(extractDir)) {
		execSync(`rm -rf "${extractDir}"`);
	}
	execSync(`tar -xzf "${tarPath}" -C "${dataDir}"`, { stdio: "inherit" });

	return extractDir;
}

/**
 * Ensure both data sources are downloaded and cached.
 *
 * @param dataDir - Cache directory (scripts/etl/data/)
 * @param forceRefresh - If true, re-download even if cache is fresh
 */
export async function ensureDataSources(
	dataDir: string,
	forceRefresh = false,
): Promise<DownloadPaths> {
	mkdirSync(dataDir, { recursive: true });

	console.log("Checking data sources...");
	const [trancoCSV, ut1BlacklistsDir] = await Promise.all([
		downloadTranco(dataDir, forceRefresh),
		downloadUT1(dataDir, forceRefresh),
	]);

	return { trancoCSV, ut1BlacklistsDir };
}
