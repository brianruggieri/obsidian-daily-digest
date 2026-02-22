import type { DailyDigestSettings } from "../src/settings";
import type { SensitivityCategory } from "../src/types";

export type PresetOverride = Partial<DailyDigestSettings>;

export interface Preset {
	id: string;
	description: string;
	settings: PresetOverride;
}

/**
 * Baseline settings used as the foundation for all presets.
 * Every field in DailyDigestSettings is present here; presets only need
 * to specify the fields they want to override.
 */
export const BASE_SETTINGS: DailyDigestSettings = {
	// General
	dailyFolder: "",
	filenameTemplate: "{{date}}",
	lookbackHours: 24,
	collectionMode: "complete",
	promptBudget: 4000,

	// Data sources — caps (used in limited mode)
	maxBrowserVisits: 500,
	maxSearches: 100,
	maxShellCommands: 200,
	maxClaudeSessions: 20,
	maxGitCommits: 100,

	// Data sources — toggles & paths
	browserConfigs: [],
	enableBrowser: true,
	enableShell: true,
	enableClaude: true,
	claudeSessionsDir: "~/.claude/projects",
	enableCodex: true,
	codexSessionsDir: "~/.codex/sessions",
	maxCodexSessions: 30,
	enableGit: true,
	gitParentDir: "~/git",

	// Privacy & sanitization
	enableSanitization: true,
	sanitizationLevel: "standard",
	excludedDomains: "",
	redactPaths: false,
	scrubEmails: true,
	enableSensitivityFilter: true,
	sensitivityAction: "exclude",
	sensitivityCategories: ["adult", "gambling", "dating"] as SensitivityCategory[],
	sensitivityCustomDomains: "",

	// AI
	enableAI: false,
	profile: "",
	aiProvider: "none",
	localEndpoint: "http://localhost:11434",
	localModel: "llama3.2",
	aiModel: "claude-haiku-4-5-20251001",

	// Advanced AI
	enableRAG: false,
	embeddingModel: "nomic-embed-text",
	ragTopK: 8,
	enableClassification: false,
	classificationModel: "llama3.2",
	classificationBatchSize: 8,
	enablePatterns: true,
	patternCooccurrenceWindow: 30,
	patternMinClusterSize: 3,
	trackRecurrence: false,

	// Meta
	hasCompletedOnboarding: true,
	privacyConsentVersion: 1,
};

export const PRESETS: Preset[] = [
	{
		id: "no-ai-minimal",
		description: "Browser only, no AI, no patterns — minimum viable note",
		settings: {
			enableShell: false,
			enableClaude: false,
			enableGit: false,
			enableAI: false,
			aiProvider: "none",
			enablePatterns: false,
			collectionMode: "limited",
		},
	},
	{
		id: "no-ai-full",
		description: "All 4 sources, no AI, patterns enabled",
		settings: {
			enableAI: false,
			aiProvider: "none",
			enablePatterns: true,
		},
	},
	{
		id: "local-llm-basic",
		description: "All sources, local model, no RAG or classification",
		settings: {
			enableAI: true,
			aiProvider: "local",
			enableRAG: false,
			enableClassification: false,
		},
	},
	{
		id: "local-llm-rag",
		description: "All sources, local model + RAG",
		settings: {
			enableAI: true,
			aiProvider: "local",
			enableRAG: true,
			enableClassification: false,
		},
	},
	{
		id: "local-llm-classified",
		description: "All sources, local model + classification (no RAG)",
		settings: {
			enableAI: true,
			aiProvider: "local",
			enableRAG: false,
			enableClassification: true,
		},
	},
	{
		id: "cloud-haiku-tier1",
		description: "Anthropic Haiku, full sanitized context (Tier 1)",
		settings: {
			enableAI: true,
			aiProvider: "anthropic",
			aiModel: "claude-haiku-4-5-20251001",
			enableRAG: false,
			enableClassification: false,
		},
	},
	{
		id: "cloud-haiku-tier2",
		description: "Anthropic Haiku, RAG chunks only (Tier 2)",
		settings: {
			enableAI: true,
			aiProvider: "anthropic",
			aiModel: "claude-haiku-4-5-20251001",
			enableRAG: true,
			enableClassification: false,
		},
	},
	{
		id: "cloud-sonnet-tier1",
		description: "Anthropic Sonnet, full sanitized context (Tier 1)",
		settings: {
			enableAI: true,
			aiProvider: "anthropic",
			aiModel: "claude-sonnet-4-6",
			enableRAG: false,
			enableClassification: false,
		},
	},
	{
		id: "cloud-sonnet-tier3",
		description: "Anthropic Sonnet, classified abstractions only (Tier 3)",
		settings: {
			enableAI: true,
			aiProvider: "anthropic",
			aiModel: "claude-sonnet-4-6",
			enableClassification: true,
			enableRAG: false,
		},
	},
	{
		id: "cloud-tier4-stats",
		description: "Anthropic Haiku, aggregated statistics only (Tier 4)",
		settings: {
			enableAI: true,
			aiProvider: "anthropic",
			aiModel: "claude-haiku-4-5-20251001",
			enableClassification: true,
			enableRAG: false,
			enablePatterns: true,
			sanitizationLevel: "aggressive",
		},
	},
	{
		id: "privacy-aggressive",
		description: "All sources, Sonnet, aggressive sanitization + all sensitivity categories",
		settings: {
			enableAI: true,
			aiProvider: "anthropic",
			aiModel: "claude-sonnet-4-6",
			sanitizationLevel: "aggressive",
			sensitivityCategories: [
				"adult", "gambling", "dating", "health", "drugs",
				"finance", "weapons", "piracy", "vpn_proxy", "job_search", "social_personal",
			] as SensitivityCategory[],
			sensitivityAction: "redact",
		},
	},
	{
		id: "compression-limited",
		description: "All sources, Haiku, limited collection mode (fixed caps)",
		settings: {
			enableAI: true,
			aiProvider: "anthropic",
			aiModel: "claude-haiku-4-5-20251001",
			collectionMode: "limited",
			maxBrowserVisits: 100,
			maxShellCommands: 50,
		},
	},
];

/**
 * Merge a preset's overrides on top of BASE_SETTINGS to produce a fully
 * resolved DailyDigestSettings object.
 */
export function resolvePreset(preset: Preset): DailyDigestSettings {
	return { ...BASE_SETTINGS, ...preset.settings };
}
