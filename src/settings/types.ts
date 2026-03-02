import { BrowserInstallConfig, SensitivityCategory } from "../types";

/** Secret ID used in Obsidian's shared SecretStorage (>=1.11.4). */
export const SECRET_ID = "anthropic-api-key";

export type AIProvider = "none" | "local" | "anthropic";
export type SensitivityPreset = "off" | "recommended" | "strict" | "custom";
export interface DailyDigestSettings {
	dailyFolder: string;
	filenameTemplate: string;
	promptBudget: number;
	/**
	 * Per-browser, per-profile selection. Replaces the old `browsers: string[]`.
	 * Populated when the user clicks "Detect Browsers & Profiles". Empty by default.
	 */
	browserConfigs: BrowserInstallConfig[];
	aiModel: string;
	profile: string;
	enableAI: boolean;
	aiProvider: AIProvider;
	localEndpoint: string;
	localModel: string;
	enableBrowser: boolean;
	enableClaude: boolean;
	claudeSessionsDir: string;
	enableCodex: boolean;
	codexSessionsDir: string;
	enableClassification: boolean;
	classificationModel: string;
	classificationBatchSize: number;
	enableSensitivityFilter: boolean;
	sensitivityPreset: SensitivityPreset;
	sensitivityCategories: SensitivityCategory[];
	sensitivityCustomDomains: string;
	sensitivityAction: "exclude" | "redact";
	enableGit: boolean;
	gitParentDir: string;
	patternCooccurrenceWindow: number;
	patternMinClusterSize: number;
	trackRecurrence: boolean;
	/** Max unique pages shown per domain in the daily note. Default: 5. Range: 1-20. */
	maxVisitsPerDomain: number;
	promptsDir: string;
	hasCompletedOnboarding: boolean;
	privacyConsentVersion: number;
	debugMode: boolean;
	/** Render a cross-source chronological timeline in the daily note (Layer 3A). Default: false (post-v1). */
	enableTimeline: boolean;
	/** Explicit privacy tier for Anthropic cloud calls. null = auto-select based on available data layers. */
	privacyTier: 4 | 3 | 2 | 1 | null;
	/** Show the AI prompt in the data preview modal before sending to Anthropic. Default: true. */
	enablePromptPreview: boolean;
}

export const DEFAULT_SETTINGS: DailyDigestSettings = {
	dailyFolder: "daily",
	filenameTemplate: "YYYY-MM-DD",
	promptBudget: 3000,
	// Empty until the user clicks "Detect Browsers & Profiles". Nothing is
	// collected until the user has reviewed and enabled specific profiles.
	browserConfigs: [],
	aiModel: "claude-haiku-4-5",
	profile: "",
	enableAI: false,
	aiProvider: "local",
	localEndpoint: "http://localhost:11434",
	localModel: "",
	enableBrowser: false,
	enableClaude: false,
	claudeSessionsDir: "~/.claude/projects",
	enableCodex: false,
	codexSessionsDir: "~/.codex/sessions",
	enableClassification: false,
	classificationModel: "",
	classificationBatchSize: 8,
	enableSensitivityFilter: true,
	sensitivityPreset: "recommended" as SensitivityPreset,
	sensitivityCategories: [] as SensitivityCategory[],
	sensitivityCustomDomains: "",
	sensitivityAction: "exclude" as "exclude" | "redact",
	enableGit: false,
	gitParentDir: "",
	patternCooccurrenceWindow: 30,
	patternMinClusterSize: 3,
	trackRecurrence: true,
	maxVisitsPerDomain: 5,
	promptsDir: "",
	hasCompletedOnboarding: false,
	privacyConsentVersion: 0,
	debugMode: false,
	enableTimeline: false,
	privacyTier: null,
	enablePromptPreview: true,
};
