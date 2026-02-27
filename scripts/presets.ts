import type { DailyDigestSettings } from "../src/settings/types";
import type { SensitivityCategory } from "../src/types";

export type PresetOverride = Partial<DailyDigestSettings>;

export interface Preset {
	id: string;
	description: string;
	privacyRank: number;           // 1 = most private, 11 = least private
	privacyGroup: "no-ai" | "local" | "cloud";
	settings: PresetOverride;
}

/**
 * Returns a zero-padded filename prefix for a preset so Obsidian sorts them
 * in privacy order (most private first). E.g. "01-no-ai-minimal".
 */
export function getPresetFilename(preset: Preset): string {
	return `${String(preset.privacyRank).padStart(2, "0")}-${preset.id}`;
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
	promptBudget: 4000,

	// Data sources — toggles & paths
	browserConfigs: [],
	enableBrowser: true,
	enableClaude: true,
	claudeSessionsDir: "~/.claude/projects",
	enableCodex: true,
	codexSessionsDir: "~/.codex/sessions",
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
	promptStrategy: "monolithic-json",
	promptsDir: "",
	debugMode: false,
	enableAI: false,
	profile: "",
	aiProvider: "none",
	localEndpoint: "http://localhost:11434",
	localModel: "qwen2.5:14b-instruct",
	aiModel: "claude-haiku-4-5-20251001",

	// Advanced AI
	enableRAG: false,
	embeddingModel: "nomic-embed-text",
	ragTopK: 8,
	enableClassification: false,
	classificationModel: "qwen2.5:7b-instruct",
	classificationBatchSize: 8,
	enablePatterns: true,
	patternCooccurrenceWindow: 30,
	patternMinClusterSize: 3,
	trackRecurrence: false,

	// Meta
	hasCompletedOnboarding: true,
	privacyConsentVersion: 1,
};

// Presets are ordered from most private (rank 1) to least private (rank 11).
// This order drives the inspector dropdown and the numbered output filenames.
export const PRESETS: Preset[] = [
	// ── No-AI group (ranks 1–2) ──────────────────────────────────────────────
	// No data ever leaves the machine; no LLM sees any content.
	{
		id: "no-ai-minimal",
		description: "Browser only, no AI, no patterns — minimum viable note",
		privacyRank: 1,
		privacyGroup: "no-ai",
		settings: {
			enableClaude: false,
			enableGit: false,
			enableAI: false,
			aiProvider: "none",
			enablePatterns: false,
		},
	},
	{
		id: "no-ai-full",
		description: "All 4 sources, no AI, patterns enabled",
		privacyRank: 2,
		privacyGroup: "no-ai",
		settings: {
			enableAI: false,
			aiProvider: "none",
			enablePatterns: true,
		},
	},

	// ── Local-LLM group (ranks 3–5) ──────────────────────────────────────────
	// Data stays on-device; a local model sees it. Ordered by least exposure:
	// classified abstractions → RAG chunks → full context.
	{
		id: "local-llm-classified",
		description: "All sources, local model + classification (no RAG)",
		privacyRank: 3,
		privacyGroup: "local",
		settings: {
			enableAI: true,
			aiProvider: "local",
			enableRAG: false,
			enableClassification: true,
		},
	},
	{
		id: "local-llm-rag",
		description: "All sources, local model + RAG",
		privacyRank: 4,
		privacyGroup: "local",
		settings: {
			enableAI: true,
			aiProvider: "local",
			enableRAG: true,
			enableClassification: false,
		},
	},
	{
		id: "local-llm-basic",
		description: "All sources, local model, no RAG or classification",
		privacyRank: 5,
		privacyGroup: "local",
		settings: {
			enableAI: true,
			aiProvider: "local",
			enableRAG: false,
			enableClassification: false,
		},
	},
	{
		id: "local-llm-prose",
		description: "All sources, local model, prose output (no JSON)",
		privacyRank: 6,
		privacyGroup: "local",
		settings: {
			enableAI: true,
			aiProvider: "local",
			enableRAG: false,
			enableClassification: false,
			promptStrategy: "single-prose",
		},
	},

	// ── Cloud group (ranks 7–13) ─────────────────────────────────────────────
	// Data sent to Anthropic API. Ordered by least exposure:
	// stats-only → abstractions → RAG chunks → aggressive sanitization → full context.
	{
		id: "cloud-tier4-stats",
		description: "Anthropic Haiku, aggregated statistics only (Tier 4)",
		privacyRank: 7,
		privacyGroup: "cloud",
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
		id: "cloud-sonnet-tier3",
		description: "Anthropic Sonnet, classified abstractions only (Tier 3)",
		privacyRank: 8,
		privacyGroup: "cloud",
		settings: {
			enableAI: true,
			aiProvider: "anthropic",
			aiModel: "claude-sonnet-4-6",
			enableClassification: true,
			enableRAG: false,
			enablePatterns: false, // patterns → Tier 4; disable to route classification → Tier 3
		},
	},
	{
		id: "cloud-haiku-tier2",
		description: "Anthropic Haiku, RAG chunks only (Tier 2)",
		privacyRank: 9,
		privacyGroup: "cloud",
		settings: {
			enableAI: true,
			aiProvider: "anthropic",
			aiModel: "claude-haiku-4-5-20251001",
			enableRAG: true,
			enableClassification: false,
			enablePatterns: false, // patterns → Tier 4; disable to route RAG → Tier 2
		},
	},
	{
		id: "privacy-aggressive",
		description: "All sources, Sonnet, aggressive sanitization + all sensitivity categories",
		privacyRank: 10,
		privacyGroup: "cloud",
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
			enablePatterns: false, // Tier 1 full context with aggressive sanitization
		},
	},
	{
		id: "cloud-haiku-tier1",
		description: "Anthropic Haiku, full sanitized context (Tier 1)",
		privacyRank: 11,
		privacyGroup: "cloud",
		settings: {
			enableAI: true,
			aiProvider: "anthropic",
			aiModel: "claude-haiku-4-5-20251001",
			enableRAG: false,
			enableClassification: false,
			enablePatterns: false, // Tier 1 full context
		},
	},
	{
		id: "cloud-haiku-prose",
		description: "Anthropic Haiku, prose output (Tier 1)",
		privacyRank: 12,
		privacyGroup: "cloud",
		settings: {
			enableAI: true,
			aiProvider: "anthropic",
			aiModel: "claude-haiku-4-5-20251001",
			enableRAG: false,
			enableClassification: false,
			enablePatterns: false,
			promptStrategy: "single-prose",
		},
	},
	{
		id: "cloud-sonnet-tier1",
		description: "Anthropic Sonnet, full sanitized context (Tier 1)",
		privacyRank: 13,
		privacyGroup: "cloud",
		settings: {
			enableAI: true,
			aiProvider: "anthropic",
			aiModel: "claude-sonnet-4-6",
			enableRAG: false,
			enableClassification: false,
			enablePatterns: false, // Tier 1 full context
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
