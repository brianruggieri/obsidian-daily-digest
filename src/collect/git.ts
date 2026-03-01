import { existsSync, readdirSync, statSync } from "fs";
import { execFileSync } from "child_process";
import { join } from "path";
import { DailyDigestSettings } from "../settings/types";
import { scrubSecrets } from "../filter/sanitize";
import { warn } from "../plugin/log";
import { GitCommit } from "../types";
import { expandHome } from "./browser-profiles";

// ── Git History ──────────────────────────────────────────

/**
 * Matches git stash commit messages.
 * `git stash` creates up to 3 commits per stash entry:
 *   - "WIP on <branch>: <hash> <msg>"             (auto stash, no custom message)
 *   - "On <branch>: <message>"                     (stash with custom message)
 *   - "index on <branch>: <hash> <msg>"            (index state)
 *   - "untracked files on <branch>: <hash> <msg>"  (untracked files)
 *
 * These are internal bookkeeping commits, not real developer work.
 */
const STASH_MESSAGE_RE = /^(WIP on |On |index on |untracked files on )\S+:/;

/**
 * Returns true if a commit message matches a git stash pattern.
 * Exported for testing.
 */
export function isStashCommit(message: string): boolean {
	return STASH_MESSAGE_RE.test(message);
}

/**
 * Parse raw `git log --pretty=format:"%H|%D|%s|%aI" --numstat` output
 * into GitCommit objects. Exported for testing.
 *
 * Output format per commit:
 *   <hash>|<refs>|<subject>|<authorDateISO>
 *   <blank line>
 *   <insertions>\t<deletions>\t<filepath>
 *   <insertions>\t<deletions>\t<filepath>
 *   ...
 *   <blank line separating commits>
 *
 * Special numstat lines for binary files use "-" for both counts.
 */
export function parseGitLogOutput(raw: string, repoName: string): GitCommit[] {
	const commits: GitCommit[] = [];
	const lines = raw.split("\n");
	let i = 0;

	while (i < lines.length) {
		const line = lines[i].trim();
		if (!line) { i++; continue; }

		// Expect format: hash|refs|subject|authorDateISO
		// The %D (refs/decorators) field may be empty, so we handle it carefully.
		const parts = line.split("|");
		if (parts.length < 3) { i++; continue; }

		const hash = parts[0];

		// Last part is the ISO date, second-to-last is the subject,
		// everything between hash and subject is the %D decorator (may be empty).
		const dateStr = parts[parts.length - 1];
		// Subject is everything between the decorator and the date
		// Parts: [hash, decorator, ...subject_parts, date]
		// Since subject can contain "|" we join all parts except first and last
		const rawMessage = parts.slice(2, -1).join("|");

		let time: Date | null = null;
		try {
			const parsed = new Date(dateStr);
			if (!isNaN(parsed.getTime())) time = parsed;
		} catch {
			// skip
		}

		// Skip the blank line that git inserts between the pretty format and numstat
		i++;
		if (i < lines.length && lines[i].trim() === "") i++;

		// Collect numstat lines (tab-separated: insertions\tdeletions\tfilepath)
		let filesChanged = 0;
		let insertions = 0;
		let deletions = 0;
		const filePaths: string[] = [];

		while (i < lines.length) {
			const numstatLine = lines[i];
			// A blank line signals end of numstat for this commit
			if (!numstatLine.trim()) { i++; break; }
			// Stop if we hit the next commit header (no tab = header line)
			if (!numstatLine.includes("\t")) break;

			const tabParts = numstatLine.split("\t");
			if (tabParts.length >= 3) {
				const insStr = tabParts[0].trim();
				const delStr = tabParts[1].trim();
				const filePath = tabParts.slice(2).join("\t").trim();

				// Binary files show "-" for both counts
				if (insStr !== "-" && delStr !== "-") {
					const ins = parseInt(insStr, 10);
					const del = parseInt(delStr, 10);
					if (!isNaN(ins)) insertions += ins;
					if (!isNaN(del)) deletions += del;
				}

				if (filePath) {
					filePaths.push(filePath);
					filesChanged++;
				}
			}
			i++;
		}

		const message = scrubSecrets(rawMessage);

		// Skip git stash bookkeeping commits — not real developer work
		if (isStashCommit(message)) continue;

		commits.push({
			hash,
			message,
			time,
			repo: repoName,
			filesChanged,
			insertions,
			deletions,
			filePaths: filePaths.length > 0 ? filePaths : undefined,
		});
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
			// --numstat outputs: header line, blank line, then tab-separated file stats
			const gitLog = execFileSync(
				"git",
				[
					"log",
					`--since=${sinceISO}`,
					`--author=${email}`,
					"--all",
					"--pretty=format:%H|%D|%s|%aI",
					"--numstat",
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
