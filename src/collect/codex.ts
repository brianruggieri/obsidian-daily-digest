import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { homedir } from "os";
import { join, basename } from "path";
import { DailyDigestSettings } from "../settings/types";
import { ClaudeSession } from "../types";

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
