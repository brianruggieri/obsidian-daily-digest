import { describe, it, expect } from "vitest";
import {
	buildResurfaceBlock,
	renderResurfaceLines,
	type ResurfaceVault,
} from "../../../src/analyze/resurface";
import type { RecurrenceSignal, KnowledgeDelta } from "../../../src/types";
import type { DailyDigestSettings } from "../../../src/settings/types";
import { DEFAULT_SETTINGS } from "../../../src/settings/types";

// ── Helpers ──────────────────────────────────────────────

const CURRENT_DATE = new Date("2026-02-27T00:00:00");

function makeSettings(overrides: Partial<DailyDigestSettings> = {}): DailyDigestSettings {
	return {
		...DEFAULT_SETTINGS,
		dailyFolder: "daily",
		filenameTemplate: "YYYY-MM-DD",
		...overrides,
	};
}

function makeVault(existingPaths: string[] = []): ResurfaceVault {
	const paths = new Set(existingPaths);
	return {
		getAbstractFileByPath(path: string) {
			return paths.has(path) ? { path } : null;
		},
	};
}

function makeSignal(overrides: Partial<RecurrenceSignal>): RecurrenceSignal {
	return {
		topic: "typescript",
		frequency: 3,
		trend: "returning",
		firstSeen: "2026-02-01",
		lastSeen: "2026-02-20",
		dayCount: 5,
		...overrides,
	};
}

const emptyDelta: KnowledgeDelta = {
	newTopics: [],
	recurringTopics: [],
	novelEntities: [],
	connections: [],
};

// ═══════════════════════════════════════════════════════════
// buildResurfaceBlock
// ═══════════════════════════════════════════════════════════

describe("buildResurfaceBlock", () => {
	it("returns empty array when no signals", () => {
		const vault = makeVault();
		const settings = makeSettings();
		const result = buildResurfaceBlock([], emptyDelta, vault, CURRENT_DATE, settings);
		expect(result).toHaveLength(0);
	});

	it("returns empty array when vault note does not exist", () => {
		// Signal says returning, but the prior note doesn't exist
		const vault = makeVault([]); // no notes
		const settings = makeSettings();
		const signal = makeSignal({ topic: "typescript", trend: "returning", lastSeen: "2026-02-20" });

		const result = buildResurfaceBlock([signal], emptyDelta, vault, CURRENT_DATE, settings);
		expect(result).toHaveLength(0);
	});

	it("returns a resurface line when vault note exists", () => {
		const vault = makeVault(["daily/2026-02-20.md"]);
		const settings = makeSettings();
		const signal = makeSignal({ topic: "typescript", trend: "returning", lastSeen: "2026-02-20" });

		const result = buildResurfaceBlock([signal], emptyDelta, vault, CURRENT_DATE, settings);

		expect(result).toHaveLength(1);
		expect(result[0].topic).toBe("typescript");
		expect(result[0].daysSince).toBe(7); // 2026-02-20 to 2026-02-27
		expect(result[0].priorNotePath).toBe("daily/2026-02-20");
		expect(result[0].trend).toBe("returning");
	});

	it("handles rising trend signals", () => {
		const vault = makeVault(["daily/2026-02-24.md"]);
		const settings = makeSettings();
		const signal = makeSignal({ topic: "authentication", trend: "rising", lastSeen: "2026-02-24" });

		const result = buildResurfaceBlock([signal], emptyDelta, vault, CURRENT_DATE, settings);

		expect(result).toHaveLength(1);
		expect(result[0].trend).toBe("rising");
		expect(result[0].daysSince).toBe(3);
	});

	it("ignores stable and declining signals", () => {
		const vault = makeVault(["daily/2026-02-20.md"]);
		const settings = makeSettings();
		const stableSignal = makeSignal({ trend: "stable", lastSeen: "2026-02-20" });
		const decliningSignal = makeSignal({ trend: "declining", lastSeen: "2026-02-20" });

		const result = buildResurfaceBlock(
			[stableSignal, decliningSignal], emptyDelta, vault, CURRENT_DATE, settings
		);
		expect(result).toHaveLength(0);
	});

	it("ignores signals without lastSeen", () => {
		const vault = makeVault(["daily/2026-02-20.md"]);
		const settings = makeSettings();
		const signal = makeSignal({ trend: "returning", lastSeen: undefined });

		const result = buildResurfaceBlock([signal], emptyDelta, vault, CURRENT_DATE, settings);
		expect(result).toHaveLength(0);
	});

	it("ignores same-day signals (daysSince = 0)", () => {
		const vault = makeVault(["daily/2026-02-27.md"]);
		const settings = makeSettings();
		const signal = makeSignal({ trend: "returning", lastSeen: "2026-02-27" });

		const result = buildResurfaceBlock([signal], emptyDelta, vault, CURRENT_DATE, settings);
		expect(result).toHaveLength(0);
	});

	it("limits to at most 4 returning/rising signals", () => {
		const signals: RecurrenceSignal[] = Array.from({ length: 6 }, (_, i) =>
			makeSignal({ topic: `topic-${i}`, trend: "returning", lastSeen: "2026-02-20" })
		);
		const paths = signals.map(() => "daily/2026-02-20.md");
		const vault = makeVault(paths);
		const settings = makeSettings();

		const result = buildResurfaceBlock(signals, emptyDelta, vault, CURRENT_DATE, settings);
		expect(result.length).toBeLessThanOrEqual(4);
	});

	it("uses delta recurringTopics when signal has lastSeen but not in candidates", () => {
		const vault = makeVault(["daily/2026-02-22.md"]);
		const settings = makeSettings();
		// stable signal with lastSeen — not in candidates (not returning/rising)
		// but listed in delta.recurringTopics
		const stableSignal = makeSignal({ topic: "react", trend: "stable", lastSeen: "2026-02-22" });
		const delta: KnowledgeDelta = {
			newTopics: [],
			recurringTopics: ["react"],
			novelEntities: [],
			connections: [],
		};

		const result = buildResurfaceBlock([stableSignal], delta, vault, CURRENT_DATE, settings);
		expect(result.length).toBe(1);
		expect(result[0].topic).toBe("react");
	});

	it("respects custom filenameTemplate", () => {
		const vault = makeVault(["daily/27-02-2026.md"]);
		const settings = makeSettings({ filenameTemplate: "DD-MM-YYYY" });
		const signal = makeSignal({ topic: "typescript", trend: "returning", lastSeen: "2026-02-20" });

		// The prior note would be at daily/20-02-2026.md which doesn't exist
		const result = buildResurfaceBlock([signal], emptyDelta, vault, CURRENT_DATE, settings);
		expect(result).toHaveLength(0);
	});
});

// ═══════════════════════════════════════════════════════════
// renderResurfaceLines
// ═══════════════════════════════════════════════════════════

describe("renderResurfaceLines", () => {
	it("returns empty array for no lines", () => {
		expect(renderResurfaceLines([])).toHaveLength(0);
	});

	it("renders a single resurface line correctly", () => {
		const lines = renderResurfaceLines([{
			topic: "typescript",
			priorNotePath: "daily/2026-02-20",
			daysSince: 7,
			trend: "returning",
		}]);

		expect(lines).toHaveLength(1);
		expect(lines[0]).toContain("typescript");
		expect(lines[0]).toContain("7 days ago");
		expect(lines[0]).toContain("[[daily/2026-02-20]]");
		expect(lines[0]).toContain("(returning)");
	});

	it("uses singular 'day' for daysSince = 1", () => {
		const lines = renderResurfaceLines([{
			topic: "oauth",
			priorNotePath: "daily/2026-02-26",
			daysSince: 1,
			trend: "rising",
		}]);

		expect(lines[0]).toContain("1 day ago");
		expect(lines[0]).not.toContain("1 days ago");
	});

	it("does not add trend note for rising (only for returning)", () => {
		const lines = renderResurfaceLines([{
			topic: "testing",
			priorNotePath: "daily/2026-02-25",
			daysSince: 2,
			trend: "rising",
		}]);

		expect(lines[0]).not.toContain("(returning)");
	});

	it("renders multiple lines", () => {
		const input = [
			{ topic: "typescript", priorNotePath: "daily/2026-02-20", daysSince: 7, trend: "returning" as const },
			{ topic: "react", priorNotePath: "daily/2026-02-22", daysSince: 5, trend: "rising" as const },
		];

		const lines = renderResurfaceLines(input);
		expect(lines).toHaveLength(2);
		expect(lines[0]).toContain("typescript");
		expect(lines[1]).toContain("react");
	});
});
