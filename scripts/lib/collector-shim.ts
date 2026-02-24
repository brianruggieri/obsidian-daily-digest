import { DailyDigestSettings } from "../../src/settings";
import { BrowserVisit, SearchQuery, ClaudeSession, GitCommit } from "../../src/types";
import { softwareEngineerDeepWork } from "../../tests/fixtures/personas";

export interface CollectedData {
	visits: BrowserVisit[];
	searches: SearchQuery[];
	claudeSessions: ClaudeSession[];
	gitCommits: GitCommit[];
}

export async function collectFixtureData(settings: DailyDigestSettings): Promise<CollectedData> {
	const persona = softwareEngineerDeepWork();
	return {
		visits: settings.enableBrowser ? (persona.visits ?? []) : [],
		searches: settings.enableBrowser ? (persona.searches ?? []) : [],
		claudeSessions: [
			...(settings.enableClaude ? (persona.claude ?? []) : []),
			...(settings.enableCodex ? (persona.codex ?? []) : []),
		],
		gitCommits: settings.enableGit ? (persona.git ?? []) : [],
	};
}

export async function collectRealData(settings: DailyDigestSettings, since?: Date, until?: Date): Promise<CollectedData> {
	if (!since) {
		// Default: use lookbackHours from settings (same window as the plugin uses)
		const now = new Date();
		const lookbackMs = (settings.lookbackHours ?? 24) * 60 * 60 * 1000;
		since = new Date(now.getTime() - lookbackMs);
	}

	let visits: BrowserVisit[] = [];
	let searches: SearchQuery[] = [];
	if (settings.enableBrowser) {
		const { collectBrowserHistory } = await import("../../src/collectors");

		// Auto-detect browser profiles when none are configured (inspector real-data mode).
		// Enables all profiles that have a history database.
		let effectiveSettings = settings;
		if (settings.browserConfigs.length === 0) {
			const { detectAllBrowsers } = await import("../../src/browser-profiles");
			const detected = await detectAllBrowsers();
			const autoConfigs = detected.map((c) => ({
				...c,
				enabled: true,
				selectedProfiles: c.profiles.filter((p) => p.hasHistory).map((p) => p.profileDir),
			}));
			effectiveSettings = { ...settings, browserConfigs: autoConfigs };
		}

		const result = await collectBrowserHistory(effectiveSettings, since);
		visits = result.visits;
		searches = result.searches;
	}

	const { readClaudeSessions, readCodexSessions, readGitHistory } = await import("../../src/collectors");

	let raw: CollectedData = {
		visits,
		searches,
		claudeSessions: [
			...(settings.enableClaude ? readClaudeSessions(settings, since) : []),
			...(settings.enableCodex ? readCodexSessions(settings, since) : []),
		],
		gitCommits: settings.enableGit ? readGitHistory(settings, since) : [],
	};

	if (until) {
		raw = {
			visits: raw.visits.filter((v) => v.time === null || v.time <= until!),
			searches: raw.searches.filter((s) => s.time === null || s.time <= until!),
			claudeSessions: raw.claudeSessions.filter((s) => s.time <= until!),
			gitCommits: raw.gitCommits.filter((c) => c.time === null || c.time <= until!),
		};
	}

	return raw;
}
