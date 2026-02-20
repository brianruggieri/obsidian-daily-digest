/**
 * Pre-built data.json configurations for each screenshot scenario.
 *
 * Rather than clicking through the UI to set up each state (brittle, slow),
 * we write data.json directly before each scenario. This makes screenshots:
 *   - Fast: no UI interaction needed to configure state
 *   - Deterministic: exact same state every run
 *   - Resilient to name changes: we reference setting keys, not labels
 *
 * Each preset is a partial override of DEFAULT_SETTINGS.
 */

import type { DailyDigestSettings } from "../../src/settings";
import type { BrowserInstallConfig, SensitivityCategory } from "../../src/types";

/**
 * Minimal copy of DEFAULT_SETTINGS to avoid importing Obsidian-dependent code.
 * This must stay in sync with src/settings.ts DEFAULT_SETTINGS.
 * The CI check-settings-registry script will catch drift.
 */
export const BASE: DailyDigestSettings = {
	dailyFolder: "daily",
	filenameTemplate: "YYYY-MM-DD",
	lookbackHours: 24,
	maxBrowserVisits: 80,
	maxSearches: 40,
	maxShellCommands: 50,
	maxClaudeSessions: 30,
	browserConfigs: [],
	anthropicApiKey: "",
	aiModel: "claude-haiku-4-5",
	profile: "",
	enableAI: false,
	aiProvider: "local",
	localEndpoint: "http://localhost:11434",
	localModel: "",
	enableBrowser: false,
	enableShell: false,
	enableClaude: false,
	claudeSessionsDir: "~/.claude/projects",
	enableClassification: false,
	classificationModel: "",
	classificationBatchSize: 8,
	enableRAG: false,
	embeddingModel: "nomic-embed-text",
	ragTopK: 8,
	enableSanitization: true,
	sanitizationLevel: "standard",
	excludedDomains: "",
	redactPaths: true,
	scrubEmails: true,
	enableSensitivityFilter: false,
	sensitivityCategories: [],
	sensitivityCustomDomains: "",
	sensitivityAction: "exclude",
	enablePatterns: false,
	patternCooccurrenceWindow: 30,
	patternMinClusterSize: 3,
	trackRecurrence: true,
	hasCompletedOnboarding: false,
	privacyConsentVersion: 0,
};

/** Realistic mock browser profiles for the browser detection screenshot. */
const MOCK_BROWSER_CONFIGS: BrowserInstallConfig[] = [
	{
		browserId: "chrome",
		enabled: true,
		profiles: [
			{ profileDir: "Default", displayName: "Personal", historyPath: "/tmp/mock", hasHistory: true },
			{ profileDir: "Profile 1", displayName: "Work", historyPath: "/tmp/mock", hasHistory: true },
		],
		selectedProfiles: ["Default", "Profile 1"],
	},
	{
		browserId: "brave",
		enabled: true,
		profiles: [
			{ profileDir: "Default", displayName: "Default", historyPath: "/tmp/mock", hasHistory: true },
		],
		selectedProfiles: ["Default"],
	},
	{
		browserId: "firefox",
		enabled: false,
		profiles: [
			{ profileDir: "abc123.default-release", displayName: "default-release", historyPath: "/tmp/mock", hasHistory: true },
		],
		selectedProfiles: [],
	},
];

export const PRESETS = {
	/** Factory defaults — first-run experience. */
	default: {},

	/** All data sources enabled with browser profiles detected. */
	sourcesExpanded: {
		enableBrowser: true,
		enableShell: true,
		enableClaude: true,
		browserConfigs: MOCK_BROWSER_CONFIGS,
		hasCompletedOnboarding: true,
	},

	/** Browser profiles section with detected browsers. */
	browserProfiles: {
		enableBrowser: true,
		browserConfigs: MOCK_BROWSER_CONFIGS,
		hasCompletedOnboarding: true,
	},

	/** Sanitization section expanded. */
	sanitizationExpanded: {
		enableSanitization: true,
		hasCompletedOnboarding: true,
	},

	/** Sensitivity filter with recommended categories. */
	sensitivityRecommended: {
		enableSensitivityFilter: true,
		sensitivityCategories: [
			"adult", "gambling", "dating", "health", "drugs",
		] as SensitivityCategory[],
		sensitivityAction: "exclude" as const,
		hasCompletedOnboarding: true,
	},

	/** AI enabled with local provider (Ollama). */
	aiLocal: {
		enableAI: true,
		aiProvider: "local" as const,
		localEndpoint: "http://localhost:11434",
		localModel: "llama3.2",
		hasCompletedOnboarding: true,
	},

	/** AI enabled with Anthropic provider. */
	aiAnthropic: {
		enableAI: true,
		aiProvider: "anthropic" as const,
		aiModel: "claude-haiku-4-5",
		hasCompletedOnboarding: true,
	},

	/** Full advanced pipeline: classification + patterns. */
	advancedPipeline: {
		enableAI: true,
		aiProvider: "anthropic" as const,
		enableClassification: true,
		classificationModel: "llama3.2",
		enablePatterns: true,
		trackRecurrence: true,
		localEndpoint: "http://localhost:11434",
		hasCompletedOnboarding: true,
	},

	/** Privacy warning state: Anthropic + all sources = yellow callout. */
	privacyWarn: {
		enableBrowser: true,
		enableShell: true,
		enableClaude: true,
		enableAI: true,
		aiProvider: "anthropic" as const,
		hasCompletedOnboarding: true,
	},
} as const satisfies Record<string, Partial<DailyDigestSettings>>;

export type PresetName = keyof typeof PRESETS;

/**
 * Build a complete data.json string for a given preset.
 * Merges the preset overrides with the base defaults.
 */
export function buildDataJson(preset: PresetName): string {
	const merged = { ...BASE, ...PRESETS[preset] };
	return JSON.stringify(merged, null, "\t");
}
