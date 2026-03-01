import { existsSync, readFileSync, copyFileSync, unlinkSync } from "fs";
import { tmpdir, platform } from "os";
import { join } from "path";
import initSqlJs from "sql.js";
import { warn } from "../plugin/log";
import { DailyDigestSettings } from "../settings/types";
import {
	BrowserVisit,
	SearchQuery,
	SEARCH_ENGINES,
	EXCLUDE_DOMAINS,
} from "../types";
import { canonicalKey, deduplicateVisits, DEDUP_DEFAULTS } from "../filter/dedup";

function tmpPath(suffix: string): string {
	return join(tmpdir(), `daily-digest-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`);
}

// ── SQLite via sql.js (WebAssembly) ──────────────
// Uses sql.js (SQLite compiled to WASM) — no native binaries, no CLI dependency,
// works on macOS, Windows, and Linux. The wasm binary is bundled inline by esbuild.

// esbuild inlines the .wasm via binary loader; tsx scripts fall back to readFileSync.
let _wasmBinary: Uint8Array | ArrayBuffer | undefined;
async function loadWasmBinary(): Promise<Uint8Array | ArrayBuffer> {
	if (_wasmBinary) return _wasmBinary;
	try {
		// @ts-expect-error — esbuild binary loader resolves .wasm to a Uint8Array default export
		const { default: wasm } = await import("sql.js/dist/sql-wasm.wasm");
		_wasmBinary = wasm as Uint8Array;
	} catch {
		// tsx scripts: load from disk at runtime
		_wasmBinary = readFileSync(join(process.cwd(), "node_modules/sql.js/dist/sql-wasm.wasm"));
	}
	return _wasmBinary;
}

async function querySqlite(dbPath: string, sql: string): Promise<string[][]> {
	const tmp = tmpPath(".db");
	try {
		copyFileSync(dbPath, tmp);
		// Also copy WAL/SHM if they exist (for locked databases)
		if (existsSync(dbPath + "-wal")) {
			copyFileSync(dbPath + "-wal", tmp + "-wal");
		}
		if (existsSync(dbPath + "-shm")) {
			copyFileSync(dbPath + "-shm", tmp + "-shm");
		}

		const SQL = await initSqlJs({ wasmBinary: await loadWasmBinary() as ArrayBuffer });
		const buf = readFileSync(tmp);
		const db = new SQL.Database(buf);
		try {
			const results: string[][] = [];
			const stmt = db.prepare(sql);
			while (stmt.step()) {
				results.push(stmt.get().map((v) => (v === null ? "" : String(v))));
			}
			stmt.free();
			return results;
		} finally {
			db.close();
		}
	} catch (e) {
		warn(`querySqlite failed for ${dbPath}:`, e);
		return [];
	} finally {
		try { unlinkSync(tmp); } catch { /* ignore */ }
		try { unlinkSync(tmp + "-wal"); } catch { /* ignore */ }
		try { unlinkSync(tmp + "-shm"); } catch { /* ignore */ }
	}
}

// ── Title Cleaning ────────────────────────────────

/**
 * Separators used to split a raw page title into article portion and site name.
 * Matches: " | ", " — ", " – ", " · ", " » ", " - " (with surrounding spaces).
 */
const TITLE_SEPARATORS = /\s+[|—–·»]\s+|\s+-\s+/;

/**
 * Navigation and UI noise titles that carry no knowledge value.
 * Matched against the article portion after separator splitting.
 */
const NAV_NOISE_TITLES = new Set([
	"Home", "Login", "Sign In", "Dashboard", "Settings", "Profile",
	"New Tab", "Untitled", "Loading...", "404", "Error", "Page Not Found",
	"Search Results", "Google", "Bing", "DuckDuckGo",
]);

/**
 * Known brand suffixes appended by popular sites that obscure the actual
 * article title. Stripped before separator splitting so the separator split
 * operates only on the article content, not the brand name.
 */
const BRAND_SUFFIXES = [
	" | GitHub", " · GitHub", " - GitHub",
	" - Stack Overflow", " — Stack Overflow",
	" | MDN Web Docs", " | TypeScript",
	" | Google", " - Google Search",
	" | YouTube", " - YouTube",
	" | Reddit",
	" | Obsidian",
	" | Wikipedia", " - Wikipedia",
];

/**
 * Extract the article portion of a raw browser page title.
 *
 * Steps:
 * 1. Strip known brand suffixes (e.g. " | GitHub").
 * 2. Split on title separators (|, —, –, ·, ») and take the left portion.
 * 3. Reject nav-noise titles (Home, Login, Dashboard, …) and very short results.
 *
 * Returns "" when the title carries no knowledge value so callers can skip it.
 *
 * @example
 * cleanTitle("TypeScript: Handbook - Generics | TypeScript") → "TypeScript: Handbook - Generics"
 * cleanTitle("How to deep copy array — Stack Overflow") → "How to deep copy array"
 * cleanTitle("Home") → ""
 */
export function cleanTitle(rawTitle: string): string {
	if (!rawTitle) return "";

	let title = rawTitle;

	// Strip known brand suffixes first (more reliable than splitting)
	for (const suffix of BRAND_SUFFIXES) {
		if (title.endsWith(suffix)) {
			title = title.slice(0, title.length - suffix.length).trim();
			break;
		}
	}

	// Split on separators and select the most meaningful segment.
	// Using the longest non-trivial segment handles Stack Overflow's
	// "lang-tag - article title" format where the left portion is the short tag.
	const parts = title.split(TITLE_SEPARATORS).map((p) => p.trim());
	const article = parts.reduce((best, candidate) =>
		candidate.length > best.length ? candidate : best,
	"");

	// Reject nav-noise titles and very short results
	if (NAV_NOISE_TITLES.has(article) || article.length < 5) return "";

	return article;
}

// ── Browser URL Utilities ────────────────────────

/**
 * Unwrap a google.com/url?q= redirect to its real destination.
 * Returns the destination URL string if extractable, null otherwise.
 *
 * Google (and Gmail) proxy outbound links through google.com/url so they can
 * measure click-through rates. Chrome logs a visit to the intermediary AND
 * (usually) a separate visit to the destination. This function recovers the
 * destination so we can either deduplicate or preserve it with the real URL.
 */
export function unwrapGoogleRedirect(rawUrl: string): string | null {
	try {
		const url = new URL(rawUrl);
		const domain = url.hostname.replace(/^www\./, "");
		if (domain !== "google.com" || url.pathname !== "/url") return null;
		const dest = url.searchParams.get("q") || url.searchParams.get("url");
		if (dest && dest.startsWith("https://")) return dest;
		return null;
	} catch {
		return null;
	}
}

// ── Near-Duplicate Collapse ──────────────────────

/**
 * Bucket a timestamp by minute boundary (floor to calendar minute).
 * Two visits in the same calendar minute produce the same key suffix.
 * Note: visits 1 second apart that straddle a minute boundary (e.g.
 * 10:00:59 and 10:01:00) will land in different buckets — this is
 * acceptable because the downstream canonical-URL dedup in dedup.ts
 * catches any remaining near-duplicates regardless of timestamp.
 */
export function minuteKey(time: Date | null): number {
	if (!time) return 0;
	return Math.floor(time.getTime() / 60_000);
}

/**
 * Collapse visits that share the same canonical URL within a 1-minute window.
 * Keeps the entry with the best (longest cleaned) title.
 *
 * This catches duplicates that the exact-URL `seenUrls` check misses:
 *   - Same path with different query strings or fragments
 *   - www vs non-www variants
 *   - Trailing-slash differences
 *   - Chrome logging multiple visit types for one navigation
 */
export function collapseNearDuplicates(visits: BrowserVisit[]): BrowserVisit[] {
	const groups = new Map<string, BrowserVisit[]>();

	for (const v of visits) {
		const key = `${canonicalKey(v.url)}|${minuteKey(v.time)}`;
		const g = groups.get(key);
		if (g) {
			g.push(v);
		} else {
			groups.set(key, [v]);
		}
	}

	const result: BrowserVisit[] = [];
	for (const g of groups.values()) {
		// Pick the entry with the best title
		result.push(g.reduce((best, v) => {
			const bl = cleanTitle(best.title ?? "").length || (best.title || "").length;
			const vl = cleanTitle(v.title ?? "").length || (v.title || "").length;
			if (vl > bl) return v;
			if (vl === bl) {
				const bt = best.time?.getTime() ?? Infinity;
				const vt = v.time?.getTime() ?? Infinity;
				return vt < bt ? v : best;
			}
			return best;
		}));
	}

	return result;
}

// ── Browser History ──────────────────────────────

export function chromeEpochToDate(ts: number): Date {
	return new Date((ts / 1_000_000 - 11644473600) * 1000);
}

/**
 * Reads Chromium-based browser history from an absolute, pre-resolved History file path.
 * The path is set at profile detection time — no runtime path expansion needed here.
 */
async function readChromiumHistory(historyPath: string, since: Date): Promise<BrowserVisit[]> {
	if (!existsSync(historyPath)) return [];

	const sinceChrome = BigInt(Math.floor((since.getTime() / 1000 + 11644473600) * 1_000_000));
	const sql = `SELECT urls.url, urls.title, visits.visit_time, urls.visit_count, visits.transition FROM visits JOIN urls ON visits.url = urls.id WHERE visits.visit_time > ${sinceChrome} ORDER BY visits.visit_time DESC`;

	const rows = await querySqlite(historyPath, sql);
	const results: BrowserVisit[] = [];
	for (const row of rows) {
		try {
			// Filter iframe navigations (AUTO_SUBFRAME=3, MANUAL_SUBFRAME=4).
			// These are page resources loaded in iframes, not pages the user visited.
			const coreType = parseInt(row[4]) & 0xFF;
			if (coreType === 3 || coreType === 4) continue;

			results.push({
				url: row[0],
				title: row[1] || "",
				time: chromeEpochToDate(parseInt(row[2])),
				visitCount: parseInt(row[3]),
			});
		} catch {
			// skip bad rows
		}
	}
	return results;
}

/**
 * Reads Firefox history from an absolute, pre-resolved places.sqlite path.
 * The path is sourced from profiles.ini at detection time, not auto-discovered here.
 */
async function readFirefoxHistoryFromPath(placesPath: string, since: Date): Promise<BrowserVisit[]> {
	if (!existsSync(placesPath)) return [];

	const sinceMicro = Math.floor(since.getTime() * 1000);
	const sql = `SELECT p.url, p.title, h.visit_date FROM moz_historyvisits h JOIN moz_places p ON h.place_id = p.id WHERE h.visit_date > ${sinceMicro} ORDER BY h.visit_date DESC`;

	const rows = await querySqlite(placesPath, sql);
	const results: BrowserVisit[] = [];
	for (const row of rows) {
		try {
			results.push({
				url: row[0],
				title: row[1] || "",
				time: new Date(parseInt(row[2]) / 1000),
			});
		} catch {
			// skip bad rows
		}
	}
	return results;
}

/**
 * Reads Safari history from its fixed single-database location.
 * Safari has no profiles — always reads from ~/Library/Safari/History.db.
 * macOS only; will return [] on other platforms.
 */
async function readSafariHistory(historyPath: string, since: Date): Promise<BrowserVisit[]> {
	if (platform() !== "darwin") return [];
	if (!existsSync(historyPath)) return [];

	// Apple epoch: seconds since 2001-01-01 00:00:00 UTC
	const sinceApple = since.getTime() / 1000 - 978307200;
	const sql = `SELECT i.url, v.title, v.visit_time FROM history_visits v JOIN history_items i ON v.history_item = i.id WHERE v.visit_time > ${sinceApple} ORDER BY v.visit_time DESC`;

	const rows = await querySqlite(historyPath, sql);
	const results: BrowserVisit[] = [];
	for (const row of rows) {
		try {
			results.push({
				url: row[0],
				title: row[1] || "",
				time: new Date((parseFloat(row[2]) + 978307200) * 1000),
			});
		} catch {
			// skip bad rows
		}
	}
	return results;
}

/**
 * Collects browser history from all user-selected browser profiles.
 *
 * Iterates settings.browserConfigs — browsers that are enabled with at least
 * one selected profile. Each enabled profile is read independently and
 * deduplicated by URL across all browsers/profiles.
 *
 * Browsers with browserConfig.enabled = false are entirely skipped.
 * Profiles not in selectedProfiles are entirely skipped.
 */
export async function collectBrowserHistory(
	settings: DailyDigestSettings,
	since: Date
): Promise<{ visits: BrowserVisit[]; searches: SearchQuery[] }> {
	if (!settings.enableBrowser) return { visits: [], searches: [] };

	// Support both new browserConfigs and legacy browsers[] (migration fallback)
	const configs = settings.browserConfigs;
	if (configs.length === 0) return { visits: [], searches: [] };

	const rawVisits: BrowserVisit[] = [];

	for (const browserConfig of configs) {
		if (!browserConfig.enabled) continue;

		const enabledProfiles = browserConfig.profiles.filter(
			(p) => browserConfig.selectedProfiles.includes(p.profileDir) && p.hasHistory
		);

		for (const profile of enabledProfiles) {
			try {
				let visits: BrowserVisit[] = [];
				if (browserConfig.browserId === "safari") {
					visits = await readSafariHistory(profile.historyPath, since);
				} else if (browserConfig.browserId === "firefox") {
					visits = await readFirefoxHistoryFromPath(profile.historyPath, since);
				} else {
					// Chromium: chrome, brave, edge
					visits = await readChromiumHistory(profile.historyPath, since);
				}
				rawVisits.push(...visits);
			} catch {
				// If one profile fails, continue with others
				continue;
			}
		}
	}

	// Collapse near-duplicates: same canonical URL within 1-minute window.
	// This catches dupes from Chrome logging multiple visit types for one
	// navigation, synced profiles producing identical rows, and URL variants
	// (query string, fragment, www vs non-www) at the same timestamp.
	const allVisits = collapseNearDuplicates(rawVisits);

	// Filter and extract searches
	const clean: BrowserVisit[] = [];
	const searches: SearchQuery[] = [];
	const seenQueries = new Set<string>();
	const seenCanonical = new Set<string>(allVisits.map((v) => canonicalKey(v.url)));

	for (const v of allVisits) {
		try {
			const url = new URL(v.url);
			const domain = url.hostname.replace(/^www\./, "");

			// Skip excluded domains
			if ([...EXCLUDE_DOMAINS].some((ex) => domain.includes(ex))) continue;
			if (!["http:", "https:"].includes(url.protocol)) continue;

			// Unwrap google.com/url?q= redirect intermediaries.
			// Chrome logs a visit to the redirect URL AND (usually) a separate visit
			// to the destination. Extract the destination so we either deduplicate
			// (destination already seen) or preserve the signal with the real URL.
			const dest = unwrapGoogleRedirect(v.url);
			if (dest !== null) {
				const destKey = canonicalKey(dest);
				if (!seenCanonical.has(destKey)) {
					seenCanonical.add(destKey);
					clean.push({ ...v, url: dest });
				}
				continue;
			}

			// Extract search queries — if a URL is a search engine results page
			// with a query param, record the search and skip the visit so it
			// only appears in the Searches section, not Browser Activity.
			let isSearchHit = false;
			for (const [eng, param] of Object.entries(SEARCH_ENGINES)) {
				if (domain.includes(eng)) {
					const q = url.searchParams.get(param);
					// Skip redirect/click-through URLs stored in the query param
					// (e.g. Google stores LinkedIn email-click URLs in `q`)
					if (q && q.trim() && !q.trim().startsWith("http")) {
						isSearchHit = true;
						if (!seenQueries.has(q.trim())) {
							seenQueries.add(q.trim());
							searches.push({
								query: decodeURIComponent(q.trim()),
								time: v.time,
								engine: eng,
							});
						}
					}
					break;
				}
			}

			if (!isSearchHit) {
				clean.push(v);
			}
		} catch {
			// skip invalid URLs
		}
	}

	clean.sort((a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0));
	searches.sort((a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0));

	const VISIT_CEILING = 2000;
	const SEARCH_CEILING = 500;
	const visitLimit = VISIT_CEILING;
	const searchLimit = SEARCH_CEILING;

	const { visits: dedupedVisits } = deduplicateVisits(
		clean.slice(0, visitLimit),
		{
			maxVisitsPerDomain: settings.maxVisitsPerDomain ?? DEDUP_DEFAULTS.maxVisitsPerDomain,
			maxOtherTotal: DEDUP_DEFAULTS.maxOtherTotal,
		}
	);

	return {
		visits: dedupedVisits,
		searches: searches.slice(0, searchLimit),
	};
}
