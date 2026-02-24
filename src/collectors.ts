import { existsSync, readFileSync, copyFileSync, unlinkSync, readdirSync, statSync } from "fs";
import { execFileSync } from "child_process";
import { homedir, tmpdir, platform } from "os";
// Note: readdirSync is used by readClaudeSessions → findJsonlFiles below
import { join, basename } from "path";
import initSqlJs from "sql.js";
import { DailyDigestSettings } from "./settings";
import { scrubSecrets } from "./sanitize";
import { warn } from "./log";
import {
	BrowserVisit,
	SearchQuery,
	ShellCommand,
	ClaudeSession,
	GitCommit,
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
		return join(localAppData, p.slice("%LOCALAPPDATA%/".length));
	}
	if (p.startsWith("%APPDATA%")) {
		const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
		return join(appData, p.slice("%APPDATA%/".length));
	}
	return p;
}

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
	} catch {
		return [];
	} finally {
		try { unlinkSync(tmp); } catch { /* ignore */ }
		try { unlinkSync(tmp + "-wal"); } catch { /* ignore */ }
		try { unlinkSync(tmp + "-shm"); } catch { /* ignore */ }
	}
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

// ── Browser History ──────────────────────────────

function chromeEpochToDate(ts: number): Date {
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

	const allVisits: BrowserVisit[] = [];
	const seenUrls = new Set<string>();

	for (const browserConfig of configs) {
		if (!browserConfig.enabled) continue;

		const enabledProfiles = browserConfig.profiles.filter(
			(p) => browserConfig.selectedProfiles.includes(p.profileDir) && p.hasHistory
		);

		for (const profile of enabledProfiles) {
			let visits: BrowserVisit[] = [];

			try {
				if (browserConfig.browserId === "safari") {
					visits = await readSafariHistory(profile.historyPath, since);
				} else if (browserConfig.browserId === "firefox") {
					visits = await readFirefoxHistoryFromPath(profile.historyPath, since);
				} else {
					// Chromium: chrome, brave, edge
					visits = await readChromiumHistory(profile.historyPath, since);
				}
			} catch {
				// If one profile fails, continue with others
				continue;
			}

			for (const v of visits) {
				if (!seenUrls.has(v.url)) {
					seenUrls.add(v.url);
					allVisits.push(v);
				}
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

			// Unwrap google.com/url?q= redirect intermediaries.
			// Chrome logs a visit to the redirect URL AND (usually) a separate visit
			// to the destination. Extract the destination so we either deduplicate
			// (destination already seen) or preserve the signal with the real URL.
			const dest = unwrapGoogleRedirect(v.url);
			if (dest !== null) {
				if (!seenUrls.has(dest)) {
					seenUrls.add(dest);
					clean.push({ ...v, url: dest });
				}
				continue;
			}

			clean.push(v);

			// Extract search queries
			for (const [eng, param] of Object.entries(SEARCH_ENGINES)) {
				if (domain.includes(eng)) {
					const q = url.searchParams.get(param);
					// Skip redirect/click-through URLs stored in the query param
					// (e.g. Google stores LinkedIn email-click URLs in `q`)
					if (q && q.trim() && !seenQueries.has(q.trim()) && !q.trim().startsWith("http")) {
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

	const VISIT_CEILING = 2000;
	const SEARCH_CEILING = 500;
	const visitLimit = VISIT_CEILING;
	const searchLimit = SEARCH_CEILING;

	return {
		visits: clean.slice(0, visitLimit),
		searches: searches.slice(0, searchLimit),
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

	const SHELL_CEILING = 500;
	const shellLimit = SHELL_CEILING;

	return [...timestamped, ...plain].slice(0, shellLimit);
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

	const cutoffMs = since.getTime();
	const entries: ClaudeSession[] = [];
	const jsonlFiles = findJsonlFiles(sessionsDir);

	for (const filePath of jsonlFiles) {
		try {
			const fileStat = statSync(filePath);
			if (fileStat.mtimeMs < cutoffMs) continue;

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
						if (dt && dt.getTime() < cutoffMs) continue;
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

	const CLAUDE_CEILING = 300;
	const claudeLimit = CLAUDE_CEILING;

	return entries.slice(0, claudeLimit);
}

// ── Codex CLI Sessions ────────────────────────────────────

/**
 * Prefixes that indicate Codex-injected system context rather than real user prompts.
 * These are injected at the start of each turn and must be filtered out.
 */
const CODEX_INJECTED_PREFIXES = [
	"<environment_context",
	"<permissions instructions>",
	"<app-context>",
	"# AGENTS.md",
	"<INSTRUCTIONS",
	"You are Codex",
	"<system",
];

export function readCodexSessions(settings: DailyDigestSettings, since: Date): ClaudeSession[] {
	if (!settings.enableCodex) return [];

	const sessionsDir = expandHome(settings.codexSessionsDir);
	if (!existsSync(sessionsDir)) return [];

	const cutoffMs = since.getTime();
	const entries: ClaudeSession[] = [];
	const jsonlFiles = findJsonlFiles(sessionsDir);

	for (const filePath of jsonlFiles) {
		try {
			const fileStat = statSync(filePath);
			if (fileStat.mtimeMs < cutoffMs) continue;

			const rawContent = readFileSync(filePath, "utf-8");
			const lines = rawContent.split("\n");

			// First pass: extract project name from session_meta
			let projectName = basename(join(filePath, ".."));
			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const obj = JSON.parse(line);
					if (obj.type === "session_meta") {
						const cwd = obj.payload?.cwd;
						if (typeof cwd === "string" && cwd) {
							projectName = basename(cwd);
						}
						break;
					}
				} catch {
					// skip
				}
			}

			// Second pass: extract user prompts from response_item entries
			for (const line of lines) {
				if (!line.trim()) continue;
				try {
					const obj = JSON.parse(line);
					if (obj.type !== "response_item") continue;

					const payload = obj.payload || {};
					if (payload.role !== "user") continue;

					const ts = obj.timestamp;
					let dt: Date | null = null;
					if (typeof ts === "string") {
						dt = new Date(ts.replace(/Z$/, ""));
						if (dt.getTime() < cutoffMs) continue;
					}

					const contentItems: unknown[] = Array.isArray(payload.content) ? payload.content : [];
					for (const item of contentItems) {
						if (typeof item !== "object" || item === null) continue;
						const text = (item as Record<string, unknown>).text;
						if (typeof text !== "string") continue;

						const trimmed = text.trim();
						if (trimmed.length <= 5) continue;

						// Skip injected context blocks
						if (CODEX_INJECTED_PREFIXES.some((p) => trimmed.startsWith(p))) continue;

						entries.push({
							// Truncate Codex prompts to 200 chars, consistent with Claude sessions
						prompt: trimmed.length > 200 ? trimmed.slice(0, 200) + "\u2026" : trimmed,
							time: dt || new Date(fileStat.mtimeMs),
							project: projectName,
						});
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

	const CODEX_CEILING = 300;
	const codexLimit = CODEX_CEILING;

	return entries.slice(0, codexLimit);
}

// ── Git History ──────────────────────────────────────────

/**
 * Parse raw `git log --pretty=format:"%H|%s|%aI" --shortstat` output
 * into GitCommit objects. Exported for testing.
 */
export function parseGitLogOutput(raw: string, repoName: string): GitCommit[] {
	const commits: GitCommit[] = [];
	const lines = raw.split("\n");
	let i = 0;

	while (i < lines.length) {
		const line = lines[i].trim();
		if (!line) { i++; continue; }

		// Expect format: hash|subject|authorDateISO
		const parts = line.split("|");
		if (parts.length < 3) { i++; continue; }

		const hash = parts[0];
		const rawMessage = parts.slice(1, -1).join("|"); // Handle | in messages
		const dateStr = parts[parts.length - 1];

		let time: Date | null = null;
		try {
			const parsed = new Date(dateStr);
			if (!isNaN(parsed.getTime())) time = parsed;
		} catch {
			// skip
		}

		let filesChanged = 0;
		let insertions = 0;
		let deletions = 0;

		// Next line might be a shortstat line
		if (i + 1 < lines.length) {
			const statLine = lines[i + 1].trim();
			const filesMatch = statLine.match(/(\d+) files? changed/);
			const insMatch = statLine.match(/(\d+) insertions?\(\+\)/);
			const delMatch = statLine.match(/(\d+) deletions?\(-\)/);

			if (filesMatch || insMatch || delMatch) {
				filesChanged = filesMatch ? parseInt(filesMatch[1]) : 0;
				insertions = insMatch ? parseInt(insMatch[1]) : 0;
				deletions = delMatch ? parseInt(delMatch[1]) : 0;
				i++; // consume the stat line
			}
		}

		commits.push({
			hash,
			message: scrubSecrets(rawMessage),
			time,
			repo: repoName,
			filesChanged,
			insertions,
			deletions,
		});

		i++;
	}

	return commits;
}

/**
 * Collect git commits from all repos under settings.gitParentDir.
 *
 * Discovery: walks one level deep looking for .git subdirectories.
 * Per-repo: gets local user.email, runs git log filtered to that author.
 * Deduplicates by hash, sorts by time descending, applies limits.
 */
export function readGitHistory(settings: DailyDigestSettings, since: Date): GitCommit[] {
	if (!settings.enableGit) return [];
	if (!settings.gitParentDir) return [];

	const parentDir = expandHome(settings.gitParentDir);
	if (!existsSync(parentDir)) return [];

	const sinceISO = since.toISOString();
	const allCommits: GitCommit[] = [];
	const seenHashes = new Set<string>();

	let entries: string[];
	try {
		entries = readdirSync(parentDir);
	} catch {
		return [];
	}

	for (const entry of entries) {
		const repoPath = join(parentDir, entry);
		const gitDir = join(repoPath, ".git");

		try {
			if (!statSync(repoPath).isDirectory()) continue;
			if (!existsSync(gitDir)) continue;
		} catch {
			continue;
		}

		try {
			// Get local user email for this repo
			const email = execFileSync("git", ["config", "user.email"], {
				cwd: repoPath,
				encoding: "utf-8",
				timeout: 5000,
			}).trim();

			if (!email) continue;

			// Get commits since the target date for this author
			const gitLog = execFileSync(
				"git",
				[
					"log",
					`--since=${sinceISO}`,
					`--author=${email}`,
					"--all",
					"--pretty=format:%H|%s|%aI",
					"--shortstat",
				],
				{
					cwd: repoPath,
					encoding: "utf-8",
					timeout: 10000,
				}
			);

			const commits = parseGitLogOutput(gitLog, entry);
			for (const c of commits) {
				if (!seenHashes.has(c.hash)) {
					seenHashes.add(c.hash);
					allCommits.push(c);
				}
			}
		} catch (err) {
			// Skip repos where git commands fail — never crash the pipeline
			warn(`git collection failed for "${repoPath}":`, err instanceof Error ? err.message : err);
			continue;
		}
	}

	allCommits.sort((a, b) => (b.time?.getTime() ?? 0) - (a.time?.getTime() ?? 0));

	const GIT_CEILING = 500;
	const gitLimit = GIT_CEILING;

	return allCommits.slice(0, gitLimit);
}
