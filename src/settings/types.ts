import { BrowserInstallConfig, SanitizationLevel, SensitivityCategory } from "../types";

/** Secret ID used in Obsidian's shared SecretStorage (>=1.11.4). */
export const SECRET_ID = "anthropic-api-key";

export type AIProvider = "none" | "local" | "anthropic";

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
	enableRAG: boolean;
	embeddingModel: string;
	ragTopK: number;
	enableSanitization: boolean;
	sanitizationLevel: SanitizationLevel;
	excludedDomains: string;
	redactPaths: boolean;
	scrubEmails: boolean;
	enableSensitivityFilter: boolean;
	sensitivityCategories: SensitivityCategory[];
	sensitivityCustomDomains: string;
	sensitivityAction: "exclude" | "redact";
	enableGit: boolean;
	gitParentDir: string;
	enablePatterns: boolean;
	patternCooccurrenceWindow: number;
	patternMinClusterSize: number;
	trackRecurrence: boolean;
	promptsDir: string;
	hasCompletedOnboarding: boolean;
	privacyConsentVersion: number;
	debugMode: boolean;
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
	enableRAG: false,
	embeddingModel: "nomic-embed-text",
	ragTopK: 8,
	enableSanitization: true,
	sanitizationLevel: "standard" as SanitizationLevel,
	excludedDomains: "",
	redactPaths: true,
	scrubEmails: true,
	enableSensitivityFilter: false,
	sensitivityCategories: [] as SensitivityCategory[],
	sensitivityCustomDomains: "",
	sensitivityAction: "exclude" as "exclude" | "redact",
	enableGit: false,
	gitParentDir: "",
	enablePatterns: false,
	patternCooccurrenceWindow: 30,
	patternMinClusterSize: 3,
	trackRecurrence: true,
	promptsDir: "",
	hasCompletedOnboarding: false,
	privacyConsentVersion: 0,
	debugMode: false,
};
