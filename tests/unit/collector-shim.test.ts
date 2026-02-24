import { describe, it, expect } from "vitest";
import { collectFixtureData, CollectedData } from "../../scripts/lib/collector-shim";
import { BASE_SETTINGS } from "../../scripts/presets";

describe("CollectorShim (fixtures mode)", () => {
	it("returns CollectedData with all four arrays", async () => {
		const data: CollectedData = await collectFixtureData(BASE_SETTINGS);
		expect(Array.isArray(data.visits)).toBe(true);
		expect(Array.isArray(data.searches)).toBe(true);
		expect(Array.isArray(data.claudeSessions)).toBe(true);
		expect(Array.isArray(data.gitCommits)).toBe(true);
	});

	it("returns non-empty data for a fully-enabled settings object", async () => {
		const data = await collectFixtureData(BASE_SETTINGS);
		const total = data.visits.length + data.claudeSessions.length + data.gitCommits.length;
		expect(total).toBeGreaterThan(0);
	});

	it("returns empty arrays when all sources are disabled", async () => {
		const settings = { ...BASE_SETTINGS, enableBrowser: false, enableClaude: false, enableCodex: false, enableGit: false };
		const data = await collectFixtureData(settings);
		expect(data.visits).toHaveLength(0);
		expect(data.claudeSessions).toHaveLength(0);
		expect(data.gitCommits).toHaveLength(0);
	});

	it("includes codex sessions when enableCodex is true", async () => {
		const withCodex = await collectFixtureData({ ...BASE_SETTINGS, enableClaude: false, enableCodex: true });
		const withoutCodex = await collectFixtureData({ ...BASE_SETTINGS, enableClaude: false, enableCodex: false });
		expect(withCodex.claudeSessions.length).toBeGreaterThan(0);
		expect(withoutCodex.claudeSessions).toHaveLength(0);
	});

	it("merges claude and codex sessions together", async () => {
		const combined = await collectFixtureData({ ...BASE_SETTINGS, enableClaude: true, enableCodex: true });
		const claudeOnly = await collectFixtureData({ ...BASE_SETTINGS, enableClaude: true, enableCodex: false });
		const codexOnly = await collectFixtureData({ ...BASE_SETTINGS, enableClaude: false, enableCodex: true });
		expect(combined.claudeSessions.length).toBe(claudeOnly.claudeSessions.length + codexOnly.claudeSessions.length);
	});
});
