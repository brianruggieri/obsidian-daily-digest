import { existsSync, readdirSync, statSync } from "fs";
import { execFileSync } from "child_process";
import { homedir } from "os";
import { join } from "path";
import { DailyDigestSettings } from "../settings/types";
import { scrubSecrets } from "../filter/sanitize";
import { warn } from "../log";
import { GitCommit } from "../types";

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
