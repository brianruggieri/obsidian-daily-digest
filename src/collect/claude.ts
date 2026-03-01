import { existsSync, readFileSync, readdirSync, statSync } from "fs";
import { join, basename } from "path";
import { DailyDigestSettings } from "../settings/types";
import { ClaudeSession } from "../types";
import { expandHome } from "./browser-profiles";

/**
 * Matches Claude Code internal protocol messages — machine-generated wrappers
 * for slash commands, local command output, task system events, and system
 * caveats. These are not user prompts; they add noise to the daily note and
 * contain XML-like tags that Obsidian renders as HTML.
 *
 * Covered tag families:
 *   - local-command-{caveat,stdout,stdin,stderr}: shell command I/O wrappers
 *   - command-{name,message,args}: slash command metadata
 *   - task-{notification,id,result}: internal task scheduling events
 *   - tool-{use-id,result}: tool call plumbing messages
 *   - antml:*: Anthropic tool markup namespace tags
 */
const PROTOCOL_TAG_RE =
	/^<(?:local-command-(?:caveat|stdout|stdin|stderr)|command-(?:name|message|args)|task-(?:notification|id|result)|tool-(?:use-id|result)|antml:[a-z_-]+)[>\s/]/;

/**
 * Exact prefix strings for machine-generated noise injected by the Claude Code
 * runtime. These are verbatim strings — prefix matching is appropriate because
 * each is distinctive and stable across Claude Code versions.
 */
const NOISE_PREFIXES: readonly string[] = [
	// Context continuation boilerplate
	"This session is being continued from a previous conversation",
	"The conversation so far has been summarized as follows",

	// Subagent summary request (orchestrator → subagent)
	"Your task is to create a detailed summary of the conversation so far",
	"Please provide a detailed summary of our conversation",

	// Skill / CLAUDE.md file injection
	"Base directory for this skill:",
	"# CLAUDE.md",
	"CLAUDE.md contents:",

	// System reminder XML wrapper
	"<system-reminder>",

	// Compact/compressed context injection
	"<compact-context>",
	"This is a compact representation of the conversation history",

	// Subagent housekeeping
	"[Request interrupted by user]",
	"[SUGGESTION MODE:",
	"[AnthropicBeta:",

	// Tool use plumbing (supplements existing PROTOCOL_TAG_RE)
	"<tool_result>",
	"<function_results>",
];

const NOISE_FILTER_MIN_LENGTH = 20;
const NOISE_FILTER_MAX_LENGTH = 1500;
const CLAUDE_DISPLAY_CAP = 50;

/**
 * Returns true when the message is machine-generated noise that should not
 * appear in the daily note. Supersedes the narrower `isProtocolMessage` check.
 *
 * Noise categories:
 *  - XML protocol tags (delegated to PROTOCOL_TAG_RE)
 *  - Known boilerplate prefixes (NOISE_PREFIXES)
 *  - Length outliers: too short to be meaningful, or too long (file dumps)
 *  - Markdown heading at line start: CLAUDE.md / skill file dumps
 *  - Large JSON blobs: tool result accidentally captured
 */
function isNoiseMessage(text: string): boolean {
	const t = text.trimStart();
	if (PROTOCOL_TAG_RE.test(t)) return true;
	for (const prefix of NOISE_PREFIXES) {
		if (t.startsWith(prefix)) return true;
	}
	if (t.length < NOISE_FILTER_MIN_LENGTH) return true;
	if (t.length > NOISE_FILTER_MAX_LENGTH) return true;
	// Markdown heading at start → likely a CLAUDE.md / SKILL.md file dump
	if (/^#{1,3} /.test(t)) return true;
	// Large JSON blob → tool result accidentally captured
	if (/^\s*\{[\s\S]{300,}\}\s*$/.test(t)) return true;
	return false;
}

/**
 * Removes duplicate prompts by their first-60-char prefix.
 * Assumes input is already sorted newest-first; the first occurrence (most
 * recent) is kept, subsequent duplicates are dropped.
 */
function deduplicatePrompts(entries: ClaudeSession[]): ClaudeSession[] {
	const seen = new Set<string>();
	return entries.filter((e) => {
		const key = e.prompt.slice(0, 60).toLowerCase().replace(/\s+/g, " ").trim();
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

/**
 * Extracts a human-readable task title from a conversation opener prompt.
 * Strips common imperative verb prefixes and question structures, then
 * takes the first sentence boundary or 80 characters.
 */
export function extractTaskTitle(prompt: string): string {
	let text = prompt.slice(0, 200);
	// Strip imperative verb prefix
	text = text.replace(
		/^(fix|debug|add|create|build|implement|write|refactor|update|review|explain|help\s+me\s+(with|understand)|how\s+do\s+i)\s+/i,
		""
	);
	// Strip question structure
	text = text.replace(/^(what\s+is|what\s+are|why\s+(does|is|isn'?t)|how\s+does)\s+/i, "");
	// Take first sentence or 80 chars
	const boundary = text.search(/[?.!]/);
	return (boundary > 0 ? text.slice(0, boundary) : text.slice(0, 80)).trim();
}

export function findJsonlFiles(dir: string): string[] {
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
			const fileName = basename(filePath);
			const fallbackProject = basename(join(filePath, ".."));

			// Collect all qualifying messages from this file before emitting,
			// so we can compute turn count and mark the opener.
			const fileMessages: Array<{ text: string; dt: Date }> = [];

			// Extract short project name from the cwd field on the first
			// record that has one (e.g. "/Users/me/git/my-repo" → "my-repo").
			let projectName = fallbackProject;
			for (const line of content.split("\n")) {
				if (!line.trim()) continue;
				try {
					const obj = JSON.parse(line);
					if (obj.cwd && typeof obj.cwd === "string") {
						projectName = basename(obj.cwd);
						break;
					}
				} catch { /* skip */ }
			}

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
							dt = new Date(ts);
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
						if (!isNoiseMessage(text)) {
							fileMessages.push({ text, dt: dt || new Date(fileStat.mtimeMs) });
						}
					}
				} catch {
					// skip unparseable lines
				}
			}

			// Emit sessions with conversation identity metadata
			const turnCount = fileMessages.length;
			for (let i = 0; i < fileMessages.length; i++) {
				const { text, dt } = fileMessages[i];
				const isOpener = i === 0;
				entries.push({
					prompt: text.length > 200 ? text.slice(0, 200) + "\u2026" : text,
					time: dt,
					project: projectName,
					isConversationOpener: isOpener,
					conversationFile: fileName,
					conversationTurnCount: turnCount,
				});
			}
		} catch {
			// skip unreadable files
		}
	}

	entries.sort((a, b) => b.time.getTime() - a.time.getTime());

	// Filter out subagent sessions — these are internal orchestration prompts
	// (e.g. "Explore the codebase for…"), not meaningful user activity.
	const filtered = entries.filter((e) => e.project !== "subagents");

	return deduplicatePrompts(filtered).slice(0, CLAUDE_DISPLAY_CAP);
}
