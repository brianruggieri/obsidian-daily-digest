import { DailyDigestSettings } from "../../src/settings";
import { BrowserVisit, SearchQuery, ShellCommand, ClaudeSession, GitCommit } from "../../src/types";
import { softwareEngineerDeepWork } from "../../tests/fixtures/personas";

export interface CollectedData {
	visits: BrowserVisit[];
	searches: SearchQuery[];
	shell: ShellCommand[];
	claudeSessions: ClaudeSession[];
	gitCommits: GitCommit[];
}

export async function collectFixtureData(settings: DailyDigestSettings): Promise<CollectedData> {
	const persona = softwareEngineerDeepWork();
	return {
		visits: settings.enableBrowser ? (persona.visits ?? []) : [],
		searches: settings.enableBrowser ? (persona.searches ?? []) : [],
		shell: settings.enableShell ? (persona.shell ?? []) : [],
		claudeSessions: [
			...(settings.enableClaude ? (persona.claude ?? []) : []),
			...(settings.enableCodex ? (persona.codex ?? []) : []),
		],
		gitCommits: settings.enableGit ? (persona.git ?? []) : [],
	};
}

export async function collectRealData(settings: DailyDigestSettings): Promise<CollectedData> {
	const since = new Date();
	since.setHours(since.getHours() - settings.lookbackHours);

	let visits: BrowserVisit[] = [];
	let searches: SearchQuery[] = [];
	if (settings.enableBrowser) {
		const { collectBrowserHistory } = await import("../../src/collectors");
		const result = await collectBrowserHistory(settings, since);
		visits = result.visits;
		searches = result.searches;
	}

	const { readShellHistory, readClaudeSessions, readCodexSessions, readGitHistory } = await import("../../src/collectors");

	return {
		visits,
		searches,
		shell: settings.enableShell ? readShellHistory(settings, since) : [],
		claudeSessions: [
			...(settings.enableClaude ? readClaudeSessions(settings, since) : []),
			...(settings.enableCodex ? readCodexSessions(settings, since) : []),
		],
		gitCommits: settings.enableGit ? readGitHistory(settings, since) : [],
	};
}
