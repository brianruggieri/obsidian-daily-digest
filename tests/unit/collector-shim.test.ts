import { describe, it, expect } from "vitest";
import { collectFixtureData, CollectedData } from "../../scripts/lib/collector-shim";
import { BASE_SETTINGS } from "../../scripts/presets";

describe("CollectorShim (fixtures mode)", () => {
	it("returns CollectedData with all five arrays", async () => {
		const data: CollectedData = await collectFixtureData(BASE_SETTINGS);
		expect(Array.isArray(data.visits)).toBe(true);
		expect(Array.isArray(data.searches)).toBe(true);
		expect(Array.isArray(data.shell)).toBe(true);
		expect(Array.isArray(data.claudeSessions)).toBe(true);
		expect(Array.isArray(data.gitCommits)).toBe(true);
	});

	it("returns non-empty data for a fully-enabled settings object", async () => {
		const data = await collectFixtureData(BASE_SETTINGS);
		const total = data.visits.length + data.shell.length + data.claudeSessions.length + data.gitCommits.length;
		expect(total).toBeGreaterThan(0);
	});

	it("returns empty arrays when all sources are disabled", async () => {
		const settings = { ...BASE_SETTINGS, enableBrowser: false, enableShell: false, enableClaude: false, enableGit: false };
		const data = await collectFixtureData(settings);
		expect(data.visits).toHaveLength(0);
		expect(data.shell).toHaveLength(0);
		expect(data.claudeSessions).toHaveLength(0);
		expect(data.gitCommits).toHaveLength(0);
	});
});
