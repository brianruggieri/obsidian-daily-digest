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
