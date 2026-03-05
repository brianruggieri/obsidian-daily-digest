import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
	LiveCollectionWatcher,
	parseTimeString,
	msUntilNextOccurrence,
	midnightOf,
	todayAt,
	emptySnapshot,
	initialCursors,
	buildSensitivityConfig,
} from "../../../src/collect/watcher";
import type { DailyDigestSettings } from "../../../src/settings/types";
import { DEFAULT_SETTINGS } from "../../../src/settings/types";
import type { WatcherStatus } from "../../../src/types";

// ── Helper ──────────────────────────────────────────────

function testSettings(overrides: Partial<DailyDigestSettings> = {}): DailyDigestSettings {
	return {
		...DEFAULT_SETTINGS,
		enableLiveCollection: true,
		collectionIntervalMinutes: 5,
		enableScheduledDigest: false,
		scheduledDigestTime: "00:00",
		enableAutoUpdate: false,
		...overrides,
	};
}

// ── parseTimeString ─────────────────────────────────────

describe("parseTimeString", () => {
	it("parses valid HH:MM strings", () => {
		expect(parseTimeString("00:00")).toEqual([0, 0]);
		expect(parseTimeString("12:30")).toEqual([12, 30]);
		expect(parseTimeString("23:59")).toEqual([23, 59]);
	});

	it("clamps out-of-range values", () => {
		expect(parseTimeString("25:00")).toEqual([23, 0]);
		expect(parseTimeString("12:75")).toEqual([12, 59]);
		expect(parseTimeString("-1:00")).toEqual([0, 0]);
	});

	it("handles empty/malformed input", () => {
		expect(parseTimeString("")).toEqual([0, 0]);
		expect(parseTimeString("abc")).toEqual([0, 0]);
		expect(parseTimeString("12")).toEqual([12, 0]);
	});
});

// ── msUntilNextOccurrence ───────────────────────────────

describe("msUntilNextOccurrence", () => {
	it("returns positive ms when target is later today", () => {
		const now = new Date(2026, 2, 5, 10, 0, 0); // 10:00 AM
		const ms = msUntilNextOccurrence("15:00", now);
		expect(ms).toBe(5 * 60 * 60 * 1000); // 5 hours
	});

	it("wraps to tomorrow when target has passed today", () => {
		const now = new Date(2026, 2, 5, 18, 0, 0); // 6:00 PM
		const ms = msUntilNextOccurrence("10:00", now);
		// Should be ~16 hours
		expect(ms).toBe(16 * 60 * 60 * 1000);
	});

	it("wraps to tomorrow when target is exactly now", () => {
		const now = new Date(2026, 2, 5, 10, 0, 0);
		const ms = msUntilNextOccurrence("10:00", now);
		expect(ms).toBe(24 * 60 * 60 * 1000); // Full day
	});

	it("handles midnight target", () => {
		const now = new Date(2026, 2, 5, 23, 0, 0); // 11:00 PM
		const ms = msUntilNextOccurrence("00:00", now);
		expect(ms).toBe(1 * 60 * 60 * 1000); // 1 hour
	});
});

// ── midnightOf ──────────────────────────────────────────

describe("midnightOf", () => {
	it("returns midnight of the given date", () => {
		const date = new Date(2026, 2, 5, 14, 30, 45);
		const result = midnightOf(date);
		expect(result.getHours()).toBe(0);
		expect(result.getMinutes()).toBe(0);
		expect(result.getSeconds()).toBe(0);
		expect(result.getDate()).toBe(5);
	});
});

// ── todayAt ─────────────────────────────────────────────

describe("todayAt", () => {
	it("returns today's date at the specified time", () => {
		const result = todayAt("15:30");
		const now = new Date();
		expect(result.getFullYear()).toBe(now.getFullYear());
		expect(result.getMonth()).toBe(now.getMonth());
		expect(result.getDate()).toBe(now.getDate());
		expect(result.getHours()).toBe(15);
		expect(result.getMinutes()).toBe(30);
	});
});

// ── emptySnapshot ───────────────────────────────────────

describe("emptySnapshot", () => {
	it("creates an empty snapshot with zero-length arrays", () => {
		const snap = emptySnapshot();
		expect(snap.visits).toHaveLength(0);
		expect(snap.searches).toHaveLength(0);
		expect(snap.claudeSessions).toHaveLength(0);
		expect(snap.gitCommits).toHaveLength(0);
		expect(snap.lastCollectedAt).toBeInstanceOf(Date);
	});
});

// ── initialCursors ──────────────────────────────────────

describe("initialCursors", () => {
	it("creates cursors all set to midnight", () => {
		const now = new Date(2026, 2, 5, 14, 30, 0);
		const cursors = initialCursors(now);
		const midnight = midnightOf(now);
		expect(cursors.browser.getTime()).toBe(midnight.getTime());
		expect(cursors.claude.getTime()).toBe(midnight.getTime());
		expect(cursors.codex.getTime()).toBe(midnight.getTime());
		expect(cursors.git.getTime()).toBe(midnight.getTime());
	});
});

// ── buildSensitivityConfig ──────────────────────────────

describe("buildSensitivityConfig", () => {
	it("builds config from settings", () => {
		const settings = testSettings({
			enableSensitivityFilter: true,
			sensitivityCategories: ["adult", "gambling"],
			sensitivityCustomDomains: "evil.com, badsite.org",
			sensitivityAction: "redact",
		});
		const config = buildSensitivityConfig(settings);
		expect(config.enabled).toBe(true);
		expect(config.categories).toEqual(["adult", "gambling"]);
		expect(config.customDomains).toEqual(["evil.com", "badsite.org"]);
		expect(config.action).toBe("redact");
	});

	it("handles empty custom domains", () => {
		const settings = testSettings({ sensitivityCustomDomains: "" });
		const config = buildSensitivityConfig(settings);
		expect(config.customDomains).toEqual([]);
	});
});

// ── LiveCollectionWatcher ───────────────────────────────

describe("LiveCollectionWatcher", () => {
	let statusUpdates: WatcherStatus[];
	let digestCalls: number;
	let onStatus: (status: WatcherStatus) => void;
	let onDigest: () => Promise<void>;

	beforeEach(() => {
		vi.useFakeTimers();
		statusUpdates = [];
		digestCalls = 0;
		onStatus = (status) => statusUpdates.push(status);
		onDigest = async () => { digestCalls++; };
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("starts in stopped state", () => {
		const watcher = new LiveCollectionWatcher(testSettings(), onStatus, onDigest);
		const status = watcher.getStatus();
		expect(status.state).toBe("stopped");
	});

	it("transitions to idle after start", () => {
		const watcher = new LiveCollectionWatcher(
			testSettings({ enableBrowser: false, enableClaude: false, enableCodex: false, enableGit: false }),
			onStatus,
			onDigest,
		);
		watcher.start();

		// Should have emitted status updates (at least one for "collecting", one for "idle")
		expect(statusUpdates.length).toBeGreaterThanOrEqual(1);
		// After the initial collectOnce resolves, state should be idle
		const lastStatus = statusUpdates[statusUpdates.length - 1];
		expect(["idle", "collecting"]).toContain(lastStatus.state);

		watcher.stop();
	});

	it("stop clears all timers and sets state to stopped", () => {
		const watcher = new LiveCollectionWatcher(
			testSettings({ enableBrowser: false, enableClaude: false, enableCodex: false, enableGit: false }),
			onStatus,
			onDigest,
		);
		watcher.start();
		watcher.stop();

		const lastStatus = statusUpdates[statusUpdates.length - 1];
		expect(lastStatus.state).toBe("stopped");
	});

	it("getSnapshot returns empty snapshot when no sources enabled", async () => {
		const watcher = new LiveCollectionWatcher(
			testSettings({ enableBrowser: false, enableClaude: false, enableCodex: false, enableGit: false }),
			onStatus,
			onDigest,
		);
		watcher.start();
		// Wait for initial collection to complete
		await vi.advanceTimersByTimeAsync(100);
		const snap = watcher.getSnapshot();
		expect(snap.visits).toHaveLength(0);
		expect(snap.searches).toHaveLength(0);
		expect(snap.claudeSessions).toHaveLength(0);
		expect(snap.gitCommits).toHaveLength(0);
		watcher.stop();
	});

	it("updateSettings handles enableLiveCollection toggle", () => {
		const watcher = new LiveCollectionWatcher(
			testSettings({ enableLiveCollection: false, enableBrowser: false, enableClaude: false, enableCodex: false, enableGit: false }),
			onStatus,
			onDigest,
		);
		expect(watcher.getStatus().state).toBe("stopped");

		// Enable
		watcher.updateSettings(testSettings({
			enableLiveCollection: true,
			enableBrowser: false, enableClaude: false, enableCodex: false, enableGit: false,
		}));
		// After enabling, the watcher should have started
		expect(watcher.getStatus().state).not.toBe("stopped");

		// Disable
		watcher.updateSettings(testSettings({
			enableLiveCollection: false,
			enableBrowser: false, enableClaude: false, enableCodex: false, enableGit: false,
		}));
		expect(watcher.getStatus().state).toBe("stopped");
	});

	it("does not double-start if already running", () => {
		const watcher = new LiveCollectionWatcher(
			testSettings({ enableBrowser: false, enableClaude: false, enableCodex: false, enableGit: false }),
			onStatus,
			onDigest,
		);
		watcher.start();
		const countBefore = statusUpdates.length;
		watcher.start(); // Should be a no-op
		expect(statusUpdates.length).toBe(countBefore); // No additional status emitted
		watcher.stop();
	});

	it("snapshotCounts reflect accumulated items", async () => {
		const watcher = new LiveCollectionWatcher(
			testSettings({ enableBrowser: false, enableClaude: false, enableCodex: false, enableGit: false }),
			onStatus,
			onDigest,
		);
		watcher.start();
		await vi.advanceTimersByTimeAsync(100);

		const status = watcher.getStatus();
		expect(status.snapshotCounts.visits).toBe(0);
		expect(status.snapshotCounts.searches).toBe(0);
		expect(status.snapshotCounts.claudeSessions).toBe(0);
		expect(status.snapshotCounts.gitCommits).toBe(0);
		watcher.stop();
	});

	it("reports nextDigestAt when scheduled digest is enabled", () => {
		const watcher = new LiveCollectionWatcher(
			testSettings({
				enableScheduledDigest: true,
				scheduledDigestTime: "23:00",
				enableBrowser: false, enableClaude: false, enableCodex: false, enableGit: false,
			}),
			onStatus,
			onDigest,
		);
		watcher.start();

		const status = watcher.getStatus();
		expect(status.nextDigestAt).not.toBeNull();
		watcher.stop();
	});

	it("reports null nextDigestAt when scheduled digest is disabled", () => {
		const watcher = new LiveCollectionWatcher(
			testSettings({
				enableScheduledDigest: false,
				enableBrowser: false, enableClaude: false, enableCodex: false, enableGit: false,
			}),
			onStatus,
			onDigest,
		);
		watcher.start();

		const status = watcher.getStatus();
		expect(status.nextDigestAt).toBeNull();
		watcher.stop();
	});

	it("does not call onDigest when scheduled digest is disabled", async () => {
		const watcher = new LiveCollectionWatcher(
			testSettings({
				enableScheduledDigest: false,
				enableBrowser: false, enableClaude: false, enableCodex: false, enableGit: false,
			}),
			onStatus,
			onDigest,
		);
		watcher.start();
		// Advance past what would be a digest time
		await vi.advanceTimersByTimeAsync(25 * 60 * 60 * 1000); // 25 hours
		expect(digestCalls).toBe(0);
		watcher.stop();
	});
});
