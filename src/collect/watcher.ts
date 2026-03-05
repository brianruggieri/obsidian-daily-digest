/**
 * LiveCollectionWatcher — background polling service that incrementally
 * collects data from all enabled sources throughout the day.
 *
 * Design goals:
 *   1. Non-blocking — collection runs in async ticks, never stalls the UI
 *   2. Incremental — only collects events newer than last successful cycle
 *   3. Memory-bounded — snapshot is a single day's data, reset at midnight
 *   4. Privacy-safe — all data passes through the same sanitize + sensitivity
 *      pipeline before entering the snapshot
 *   5. Obsidian-friendly — timers are registered through the plugin so they
 *      are automatically cleaned up on disable/quit
 *
 * The watcher emits status updates via a callback so the plugin can
 * update the status bar or trigger note renders without tight coupling.
 */

import { DailyDigestSettings } from "../settings/types";
import {
	BrowserVisit,
	SearchQuery,
	ClaudeSession,
	GitCommit,
	CollectionSnapshot,
	CollectionCursors,
	WatcherState,
	WatcherStatus,
	SensitivityConfig,
} from "../types";
import { collectBrowserHistory } from "./browser";
import { readClaudeSessions } from "./claude";
import { readCodexSessions } from "./codex";
import { readGitHistory } from "./git";
import { sanitizeCollectedData } from "../filter/sanitize";
import { filterSensitiveDomains, filterSensitiveSearches } from "../filter/sensitivity";
import * as log from "../plugin/log";

// ── Helpers ──────────────────────────────────────────────

/** Return midnight (00:00) local time for the given date. */
export function midnightOf(date: Date): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Return a Date for today at the given HH:MM time string (24h format). */
export function todayAt(time: string): Date {
	const [h, m] = parseTimeString(time);
	const now = new Date();
	return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
}

/** Parse "HH:MM" → [hours, minutes], clamped to valid ranges. */
export function parseTimeString(time: string): [number, number] {
	const parts = (time || "00:00").split(":");
	const h = Math.max(0, Math.min(23, parseInt(parts[0], 10) || 0));
	const m = Math.max(0, Math.min(59, parseInt(parts[1], 10) || 0));
	return [h, m];
}

/**
 * Compute milliseconds until the next occurrence of `targetTime` (HH:MM).
 * If the target has already passed today, returns the ms until that time tomorrow.
 */
export function msUntilNextOccurrence(targetTime: string, now: Date = new Date()): number {
	const [h, m] = parseTimeString(targetTime);
	const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
	if (target.getTime() <= now.getTime()) {
		// Already passed today — schedule for tomorrow
		target.setDate(target.getDate() + 1);
	}
	return target.getTime() - now.getTime();
}

/** Build a SensitivityConfig from plugin settings. */
export function buildSensitivityConfig(settings: DailyDigestSettings): SensitivityConfig {
	return {
		enabled: settings.enableSensitivityFilter,
		categories: settings.sensitivityCategories,
		customDomains: settings.sensitivityCustomDomains
			.split(",")
			.map((d) => d.trim())
			.filter((d) => d),
		action: settings.sensitivityAction,
	};
}

/** Deduplicate items by a key function, keeping the first occurrence. */
function deduplicateBy<T>(existing: T[], incoming: T[], keyFn: (item: T) => string): T[] {
	const seen = new Set(existing.map(keyFn));
	const novel: T[] = [];
	for (const item of incoming) {
		const key = keyFn(item);
		if (!seen.has(key)) {
			seen.add(key);
			novel.push(item);
		}
	}
	return novel;
}

/** Create an empty snapshot anchored at the given time. */
export function emptySnapshot(now: Date = new Date()): CollectionSnapshot {
	return {
		lastCollectedAt: now,
		visits: [],
		searches: [],
		claudeSessions: [],
		gitCommits: [],
	};
}

/** Create cursors initialized to midnight of the current day. */
export function initialCursors(now: Date = new Date()): CollectionCursors {
	const midnight = midnightOf(now);
	return {
		browser: midnight,
		claude: midnight,
		codex: midnight,
		git: midnight,
	};
}

// ── Watcher Class ────────────────────────────────────────

export type StatusCallback = (status: WatcherStatus) => void;
export type DigestCallback = () => Promise<void>;

export class LiveCollectionWatcher {
	private settings: DailyDigestSettings;
	private snapshot: CollectionSnapshot;
	private cursors: CollectionCursors;
	private state: WatcherState = "stopped";
	private lastError: string | null = null;

	/** Interval ID for the collection polling loop. */
	private collectionTimer: ReturnType<typeof setInterval> | null = null;
	/** Timeout ID for the next scheduled digest. */
	private digestTimer: ReturnType<typeof setTimeout> | null = null;
	/** Timeout ID for the midnight reset. */
	private midnightTimer: ReturnType<typeof setTimeout> | null = null;

	private onStatus: StatusCallback;
	private onDigest: DigestCallback;

	constructor(
		settings: DailyDigestSettings,
		onStatus: StatusCallback,
		onDigest: DigestCallback,
	) {
		this.settings = settings;
		this.onStatus = onStatus;
		this.onDigest = onDigest;
		this.snapshot = emptySnapshot();
		this.cursors = initialCursors();
	}

	// ── Lifecycle ─────────────────────────────────────────

	/** Start background polling and schedule the daily digest timer. */
	start(): void {
		if (this.state !== "stopped") return;

		log.debug("LiveCollectionWatcher: Starting background collection");
		this.snapshot = emptySnapshot();
		this.cursors = initialCursors();
		this.state = "idle";

		// Kick off an initial collection immediately
		void this.collectOnce();

		// Set up the repeating collection interval
		const intervalMs = Math.max(1, this.settings.collectionIntervalMinutes) * 60_000;
		this.collectionTimer = setInterval(() => {
			void this.collectOnce();
		}, intervalMs);

		// Schedule the daily digest
		this.scheduleDigest();

		// Schedule a midnight reset so the snapshot rolls over to the new day
		this.scheduleMidnightReset();

		this.emitStatus();
	}

	/** Stop all timers and reset state. */
	stop(): void {
		log.debug("LiveCollectionWatcher: Stopping background collection");
		if (this.collectionTimer !== null) {
			clearInterval(this.collectionTimer);
			this.collectionTimer = null;
		}
		if (this.digestTimer !== null) {
			clearTimeout(this.digestTimer);
			this.digestTimer = null;
		}
		if (this.midnightTimer !== null) {
			clearTimeout(this.midnightTimer);
			this.midnightTimer = null;
		}
		this.state = "stopped";
		this.emitStatus();
	}

	/** Update settings (e.g. when the user changes them mid-session). */
	updateSettings(settings: DailyDigestSettings): void {
		const wasRunning = this.state !== "stopped";
		const intervalChanged = this.settings.collectionIntervalMinutes !== settings.collectionIntervalMinutes;
		const digestTimeChanged = this.settings.scheduledDigestTime !== settings.scheduledDigestTime;
		const enabledChanged = this.settings.enableLiveCollection !== settings.enableLiveCollection;

		this.settings = settings;

		if (enabledChanged) {
			if (settings.enableLiveCollection && !wasRunning) {
				this.start();
			} else if (!settings.enableLiveCollection && wasRunning) {
				this.stop();
			}
			return;
		}

		if (!wasRunning) return;

		// Reschedule if interval or digest time changed
		if (intervalChanged) {
			if (this.collectionTimer !== null) clearInterval(this.collectionTimer);
			const intervalMs = Math.max(1, settings.collectionIntervalMinutes) * 60_000;
			this.collectionTimer = setInterval(() => {
				void this.collectOnce();
			}, intervalMs);
		}
		if (digestTimeChanged) {
			this.scheduleDigest();
		}
	}

	/** Return a read-only copy of the current snapshot. */
	getSnapshot(): Readonly<CollectionSnapshot> {
		return this.snapshot;
	}

	/** Return current watcher status. */
	getStatus(): WatcherStatus {
		return this.buildStatus();
	}

	// ── Core Collection ──────────────────────────────────

	/**
	 * Run a single incremental collection cycle.
	 * Collects from all enabled sources, sanitizes, deduplicates against
	 * the existing snapshot, and appends novel items.
	 */
	async collectOnce(): Promise<void> {
		if (this.state === "stopped") return;
		this.state = "collecting";
		this.emitStatus();

		try {
			const sensitivityConfig = buildSensitivityConfig(this.settings);

			// ── Collect from each source using cursor timestamps ──
			let newVisits: BrowserVisit[] = [];
			let newSearches: SearchQuery[] = [];
			let newClaude: ClaudeSession[] = [];
			let newGit: GitCommit[] = [];

			if (this.settings.enableBrowser) {
				try {
					const result = await collectBrowserHistory(this.settings, this.cursors.browser);
					newVisits = result.visits;
					newSearches = result.searches;
				} catch (e) {
					log.warn("LiveCollectionWatcher: Browser collection failed:", e);
				}
			}

			if (this.settings.enableClaude) {
				try {
					newClaude = readClaudeSessions(this.settings, this.cursors.claude);
				} catch (e) {
					log.warn("LiveCollectionWatcher: Claude collection failed:", e);
				}
			}

			if (this.settings.enableCodex) {
				try {
					const codexSessions = readCodexSessions(this.settings, this.cursors.codex);
					newClaude = [...newClaude, ...codexSessions];
				} catch (e) {
					log.warn("LiveCollectionWatcher: Codex collection failed:", e);
				}
			}

			if (this.settings.enableGit) {
				try {
					newGit = readGitHistory(this.settings, this.cursors.git);
				} catch (e) {
					log.warn("LiveCollectionWatcher: Git collection failed:", e);
				}
			}

			// ── Sensitivity filter ──
			if (sensitivityConfig.enabled) {
				const visitResult = filterSensitiveDomains(newVisits, sensitivityConfig);
				newVisits = visitResult.kept;
				const searchResult = filterSensitiveSearches(newSearches, sensitivityConfig);
				newSearches = searchResult.kept;
			}

			// ── Sanitize ──
			const sanitized = sanitizeCollectedData(newVisits, newSearches, newClaude, newGit);

			// ── Deduplicate against existing snapshot ──
			const novelVisits = deduplicateBy(
				this.snapshot.visits,
				sanitized.visits,
				(v) => `${v.url}|${v.time?.getTime() ?? 0}`,
			);
			const novelSearches = deduplicateBy(
				this.snapshot.searches,
				sanitized.searches,
				(s) => `${s.query}|${s.time?.getTime() ?? 0}`,
			);
			const novelClaude = deduplicateBy(
				this.snapshot.claudeSessions,
				sanitized.claudeSessions,
				(c) => `${c.conversationFile}|${c.time.getTime()}|${c.prompt.slice(0, 50)}`,
			);
			const novelGit = deduplicateBy(
				this.snapshot.gitCommits,
				sanitized.gitCommits,
				(g) => g.hash,
			);

			// ── Append to snapshot ──
			this.snapshot.visits.push(...novelVisits);
			this.snapshot.searches.push(...novelSearches);
			this.snapshot.claudeSessions.push(...novelClaude);
			this.snapshot.gitCommits.push(...novelGit);
			this.snapshot.lastCollectedAt = new Date();

			// ── Advance cursors ──
			// Use midnight as the floor — sources always return events since midnight,
			// but cursors prevent re-processing events already in the snapshot.
			const now = new Date();
			this.cursors.browser = now;
			this.cursors.claude = now;
			this.cursors.codex = now;
			this.cursors.git = now;

			this.lastError = null;
			this.state = "idle";

			const totalNew = novelVisits.length + novelSearches.length + novelClaude.length + novelGit.length;
			if (totalNew > 0) {
				log.debug(
					`LiveCollectionWatcher: Collected ${totalNew} new items ` +
					`(${novelVisits.length}v ${novelSearches.length}s ${novelClaude.length}c ${novelGit.length}g)`
				);
			}
		} catch (e) {
			this.state = "error";
			this.lastError = e instanceof Error ? e.message : String(e);
			log.warn("LiveCollectionWatcher: Collection cycle failed:", e);
		}

		this.emitStatus();
	}

	// ── Scheduling ───────────────────────────────────────

	/** Schedule (or reschedule) the daily digest timer. */
	private scheduleDigest(): void {
		if (this.digestTimer !== null) {
			clearTimeout(this.digestTimer);
			this.digestTimer = null;
		}

		if (!this.settings.enableScheduledDigest) return;

		const ms = msUntilNextOccurrence(this.settings.scheduledDigestTime);
		log.debug(`LiveCollectionWatcher: Scheduling digest in ${Math.round(ms / 60_000)} minutes`);

		this.digestTimer = setTimeout(async () => {
			log.debug("LiveCollectionWatcher: Running scheduled digest");
			try {
				await this.onDigest();
			} catch (e) {
				log.warn("LiveCollectionWatcher: Scheduled digest failed:", e);
			}
			// Reschedule for tomorrow
			this.scheduleDigest();
		}, ms);
	}

	/** Schedule a midnight reset to roll the snapshot to the new day. */
	private scheduleMidnightReset(): void {
		if (this.midnightTimer !== null) {
			clearTimeout(this.midnightTimer);
			this.midnightTimer = null;
		}

		const ms = msUntilNextOccurrence("00:00");
		this.midnightTimer = setTimeout(() => {
			log.debug("LiveCollectionWatcher: Midnight reset — rolling snapshot to new day");
			this.snapshot = emptySnapshot();
			this.cursors = initialCursors();
			this.emitStatus();
			// Reschedule for next midnight
			this.scheduleMidnightReset();
		}, ms);
	}

	// ── Status ───────────────────────────────────────────

	private buildStatus(): WatcherStatus {
		const nextCollection = this.collectionTimer !== null
			? new Date(Date.now() + Math.max(1, this.settings.collectionIntervalMinutes) * 60_000).toISOString()
			: null;
		const nextDigest = this.settings.enableScheduledDigest
			? new Date(Date.now() + msUntilNextOccurrence(this.settings.scheduledDigestTime)).toISOString()
			: null;

		return {
			state: this.state,
			snapshotCounts: {
				visits: this.snapshot.visits.length,
				searches: this.snapshot.searches.length,
				claudeSessions: this.snapshot.claudeSessions.length,
				gitCommits: this.snapshot.gitCommits.length,
			},
			nextCollectionAt: nextCollection,
			nextDigestAt: nextDigest,
			lastError: this.lastError,
		};
	}

	private emitStatus(): void {
		try {
			this.onStatus(this.buildStatus());
		} catch (e) {
			log.warn("LiveCollectionWatcher: Status callback failed:", e);
		}
	}
}
