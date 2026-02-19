import { existsSync, readFileSync, copyFileSync, unlinkSync, readdirSync, statSync } from "fs";
import { homedir, tmpdir, platform } from "os";
import { join, basename } from "path";
import initSqlJs from "sql.js";
// @ts-ignore — wasm loaded as binary by esbuild
import sqlWasm from "sql.js/dist/sql-wasm.wasm";
import { DailyDigestSettings } from "./settings";
import { scrubSecrets } from "./categorize";
import {
	BrowserVisit,
	SearchQuery,
	ShellCommand,
	ClaudeSession,
	BROWSER_PATHS,
	SEARCH_ENGINES,
	EXCLUDE_DOMAINS,
} from "./types";

function expandHome(p: string): string {
	if (p.startsWith("~/")) {
		return join(homedir(), p.slice(2));
	}
	// Windows: expand %LOCALAPPDATA% and %APPDATA%
	if (p.startsWith("%LOCALAPPDATA%")) {
		const localAppData = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
		return join(localAppData, p.slice("%LOCALAPPDATA%".length + 1));
	}
	if (p.startsWith("%APPDATA%")) {
		const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
		return join(appData, p.slice("%APPDATA%".length + 1));
	}
	return p;
}

function tmpPath(suffix: string): string {
	return join(tmpdir(), `daily-digest-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`);
}

// ── SQLite via sql.js (WebAssembly) ──────────────
// Uses sql.js (SQLite compiled to WASM) — no native binaries, no CLI dependency,
// works on macOS, Windows, and Linux. The wasm binary is bundled inline by esbuild.

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

		const SQL = await initSqlJs({ wasmBinary: sqlWasm });
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
	} catch {
		return [];
	} finally {
		try { unlinkSync(tmp); } catch { /* ignore */ }
		try { unlinkSync(tmp + "-wal"); } catch { /* ignore */ }
		try { unlinkSync(tmp + "-shm"); } catch { /* ignore */ }
	}
}

// ── Browser History ──────────────────────────────

function chromeEpochToDate(ts: number): Date {
	return new Date((ts / 1_000_000 - 11644473600) * 1000);
}

async function readChromiumHistory(dbPath: string, since: Date): Promise<BrowserVisit[]> {
	const expanded = expandHome(dbPath);
	if (!existsSync(expanded)) return [];

	const sinceChrome = BigInt(Math.floor((since.getTime() / 1000 + 11644473600) * 1_000_000));
	const sql = `SELECT urls.url, urls.title, visits.visit_time, urls.visit_count FROM visits JOIN urls ON visits.url = urls.id WHERE visits.visit_time > ${sinceChrome} ORDER BY visits.visit_time DESC`;

	const rows = await querySqlite(expanded, sql);
	const results: BrowserVisit[] = [];
	for (const row of rows) {
		try {
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

function findFirefoxProfilesDir(): string {
	const os = platform();
	if (os === "win32") {
		const appdata = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
		return join(appdata, "Mozilla", "Firefox", "Profiles");
	} else if (os === "linux") {
		return join(homedir(), ".mozilla", "firefox");
	} else {
		// macOS
		return join(homedir(), "Library", "Application Support", "Firefox", "Profiles");
	}
}

function findFirefoxProfile(): string | null {
	const profilesDir = findFirefoxProfilesDir();
	if (!existsSync(profilesDir)) return null;

	const entries = readdirSync(profilesDir);
	for (const entry of entries) {
		const placesPath = join(profilesDir, entry, "places.sqlite");
		if (existsSync(placesPath)) {
			return placesPath;
		}
	}
	return null;
}

async function readFirefoxHistory(since: Date): Promise<BrowserVisit[]> {
	const dbPath = findFirefoxProfile();
	if (!dbPath) return [];

	const sinceMicro = Math.floor(since.getTime() * 1000);
	const sql = `SELECT p.url, p.title, h.visit_date FROM moz_historyvisits h JOIN moz_places p ON h.place_id = p.id WHERE h.visit_date > ${sinceMicro} ORDER BY h.visit_date DESC`;

	const rows = await querySqlite(dbPath, sql);
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

async function readSafariHistory(since: Date): Promise<BrowserVisit[]> {
	const dbPath = expandHome("~/Library/Safari/History.db");
	if (!existsSync(dbPath)) return [];

	// Apple epoch: seconds since 2001-01-01
	const sinceApple = since.getTime() / 1000 - 978307200;
	const sql = `SELECT i.url, v.title, v.visit_time FROM history_visits v JOIN history_items i ON v.history_item = i.id WHERE v.visit_time > ${sinceApple} ORDER BY v.visit_time DESC`;

	const rows = await querySqlite(dbPath, sql);
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

export async function collectBrowserHistory(
	settings: DailyDigestSettings,
	since: Date
): Promise<{ visits: BrowserVisit[]; searches: SearchQuery[] }> {
	if (!settings.enableBrowser) return { visits: [], searches: [] };

	const allVisits: BrowserVisit[] = [];
	const seenUrls = new Set<string>();

	const os = platform();
	for (const browser of settings.browsers) {
		const byOs = BROWSER_PATHS[browser];
		if (!byOs) continue;
		const info = byOs[os] ?? byOs["darwin"]; // fallback for unknown OS
		if (!info) continue;

		let visits: BrowserVisit[] = [];
		if (info.type === "chromium") {
			visits = await readChromiumHistory(info.history, since);
		} else if (info.type === "firefox") {
			visits = await readFirefoxHistory(since);
		} else if (info.type === "safari") {
			if (os !== "darwin") continue; // Safari is macOS only
			visits = await readSafariHistory(since);
		}

		for (const v of visits) {
			if (!seenUrls.has(v.url)) {
				seenUrls.add(v.url);
				allVisits.push(v);
			}
		}
	}

	// Filter and extract searches
	const clean: BrowserVisit[] = [];
	const searches: SearchQuery[] = [];
	const seenQueries = new Set<string>();

	for (const v of allVisits) {
		try {
			const url = new URL(v.url);
			const domain = url.hostname.replace(/^www\./, "");

			// Skip excluded domains
			if ([...EXCLUDE_DOMAINS].some((ex) => domain.includes(ex))) continue;
			if (!["http:", "https:"].includes(url.protocol)) continue;

			clean.push(v);

			// Extract search queries
			for (const [eng, param] of Object.entries(SEARCH_ENGINES)) {
				if (domain.includes(eng)) {
					const q = url.searchParams.get(param);
					if (q && q.trim() && !seenQueries.has(q.trim())) {
						seenQueries.add(q.trim());
						searches.push({
							query: decodeURIComponent(q.trim()),
							time: v.time,
							engine: eng,
						});
					}
					break;
				}
			}
		} catch {
			// skip invalid URLs
		}
	}

	clean.sort((a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0));
	searches.sort((a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0));

	return {
		visits: clean.slice(0, settings.maxBrowserVisits),
		searches: searches.slice(0, settings.maxSearches),
	};
}

// ── Shell History ────────────────────────────────

const NOISE_COMMANDS = new Set(["ls", "cd", "pwd", "clear", "exit", "history", ""]);

export function readShellHistory(settings: DailyDigestSettings, since: Date): ShellCommand[] {
	if (!settings.enableShell) return [];

	const entries: ShellCommand[] = [];
	const zshHist = expandHome("~/.zsh_history");

	if (existsSync(zshHist)) {
		try {
			const cutoff = Math.floor(since.getTime() / 1000);
			const raw = readFileSync(zshHist);
			const lines = raw.toString("utf-8").split("\n");

			for (const line of lines) {
				try {
					if (line.startsWith(": ")) {
						const parts = line.slice(2).split(";", 2);
						if (parts.length === 2) {
							const ts = parseInt(parts[0].split(":")[0].trim());
							const cmd = parts[1].trim();
							if (ts >= cutoff && cmd) {
								entries.push({
									cmd: scrubSecrets(cmd),
									time: new Date(ts * 1000),
								});
							}
						}
					}
				} catch {
					// skip unparseable lines
				}
			}
		} catch {
			// zsh history read failed
		}
	}

	// Fallback to bash history if no zsh entries
	if (entries.length === 0) {
		const bashHist = expandHome("~/.bash_history");
		if (existsSync(bashHist)) {
			try {
				const content = readFileSync(bashHist, "utf-8");
				const lines = content.trim().split("\n").slice(-100);
				for (const line of lines) {
					if (line.trim()) {
						entries.push({ cmd: scrubSecrets(line.trim()), time: null });
					}
				}
			} catch {
				// bash history read failed
			}
		}
	}

	// Deduplicate and filter noise
	const seen = new Set<string>();
	const clean: ShellCommand[] = [];

	for (const e of entries) {
		const base = e.cmd.split(/\s+/)[0] || "";
		if (NOISE_COMMANDS.has(base) || seen.has(e.cmd)) continue;
		seen.add(e.cmd);
		clean.push(e);
	}

	const timestamped = clean
		.filter((e) => e.time !== null)
		.sort((a, b) => (b.time!.getTime()) - (a.time!.getTime()));
	const plain = clean.filter((e) => e.time === null);

	return [...timestamped, ...plain].slice(0, settings.maxShellCommands);
}

// ── Claude Code Sessions ─────────────────────────

function findJsonlFiles(dir: string): string[] {
	const results: string[] = [];
	if (!existsSync(dir)) return results;

	function walk(d: string): void {
		try {
			const entries = readdirSync(d);
			for (const entry of entries) {
				const full = join(d, entry);
				try {
					const stat = statSync(full);
					if (stat.isDirectory()) {
						walk(full);
					} else if (entry.endsWith(".jsonl")) {
						results.push(full);
					}
				} catch {
					// skip inaccessible entries
				}
			}
		} catch {
			// skip inaccessible directories
		}
	}

	walk(dir);
	return results;
}

export function readClaudeSessions(settings: DailyDigestSettings, since: Date): ClaudeSession[] {
	if (!settings.enableClaude) return [];

	const sessionsDir = expandHome(settings.claudeSessionsDir);
	if (!existsSync(sessionsDir)) return [];

	const cutoffTs = since.getTime() / 1000;
	const entries: ClaudeSession[] = [];
	const jsonlFiles = findJsonlFiles(sessionsDir);

	for (const filePath of jsonlFiles) {
		try {
			const fileStat = statSync(filePath);
			if (fileStat.mtimeMs / 1000 < cutoffTs) continue;

			const content = readFileSync(filePath, "utf-8");
			for (const line of content.split("\n")) {
				if (!line.trim()) continue;
				try {
					const obj = JSON.parse(line);
					const ts = obj.timestamp || obj.created_at;
					let dt: Date | null = null;

					if (ts) {
						if (typeof ts === "number") {
							dt = new Date(ts > 1e10 ? ts : ts * 1000);
						} else if (typeof ts === "string") {
							dt = new Date(ts.replace(/Z$/, ""));
						}
						if (dt && dt.getTime() / 1000 < cutoffTs) continue;
					}

					const msg = obj.message || {};
					const role = msg.role || obj.role;
					const rawContent = msg.content || obj.content || "";

					if (role === "user" && rawContent) {
						let text: string;
						if (typeof rawContent === "string") {
							text = rawContent;
						} else if (Array.isArray(rawContent)) {
							text = rawContent
								.filter((c: Record<string, unknown>) => typeof c === "object" && c !== null)
								.map((c: Record<string, unknown>) => (c.text as string) || "")
								.join(" ");
						} else {
							continue;
						}

						text = text.trim();
						if (text.length > 5) {
							entries.push({
								prompt: text.length > 200 ? text.slice(0, 200) + "\u2026" : text,
								time: dt || new Date(fileStat.mtimeMs),
								project: basename(join(filePath, "..")),
							});
						}
					}
				} catch {
					// skip unparseable lines
				}
			}
		} catch {
			// skip unreadable files
		}
	}

	entries.sort((a, b) => b.time.getTime() - a.time.getTime());
	return entries.slice(0, settings.maxClaudeSessions);
}
