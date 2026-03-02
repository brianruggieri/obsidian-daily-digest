/**
 * Settings Registry — typed metadata for every DailyDigestSettings field.
 *
 * This is the single source of truth for settings documentation.
 * `scripts/generate-settings-docs.ts` reads this to generate
 * `docs/settings-reference.md`.
 * `scripts/check-settings-registry.ts` verifies that every key in
 * DailyDigestSettings has an entry here.
 */

import type { DailyDigestSettings } from "./settings/types";

export type SettingType =
	| "boolean"
	| "string"
	| "number"
	| "select"
	| "textarea"
	| "slider"
	| "internal";

export type SettingSection =
	| "General"
	| "Data sources"
	| "Privacy"
	| "AI summarization"
	| "Advanced"
	| "Meta";

export interface SettingMeta {
	/** The key as it appears in DailyDigestSettings. */
	key: keyof DailyDigestSettings;
	/** Display label shown in the settings panel. */
	label: string;
	/** Prose description of the setting. */
	description: string;
	/** UI section this setting belongs to. */
	section: SettingSection;
	/** Input type for the setting. */
	type: SettingType;
	/** Default value from DEFAULT_SETTINGS (serialized as string for display). */
	defaultValue: string;
	/** Whether this setting is enabled by default. */
	enabledByDefault?: boolean;
	/** Key of another setting that must be true for this one to appear. */
	dependsOn?: keyof DailyDigestSettings;
	/** Privacy note shown alongside the setting, if any. */
	privacyNote?: string;
}

export const SETTINGS_REGISTRY: SettingMeta[] = [
	// ── General ─────────────────────────────────────────────────────────────
	{
		key: "dailyFolder",
		label: "Daily notes folder",
		description: "Folder within your vault where daily notes are saved.",
		section: "General",
		type: "string",
		defaultValue: "daily",
	},
	{
		key: "filenameTemplate",
		label: "Filename template",
		description:
			"Date format for daily note filenames. Supports YYYY, MM, DD tokens " +
			"(e.g. YYYY-MM-DD produces 2025-06-18.md).",
		section: "General",
		type: "string",
		defaultValue: "YYYY-MM-DD",
	},

	// ── Data sources ─────────────────────────────────────────────────────────
	{
		key: "promptBudget",
		label: "Prompt detail budget",
		description:
			"Target token budget for the data section of AI prompts. Higher values " +
			"include more detail but consume more context window. Activity is " +
			"compressed proportionally to fit within this budget.",
		section: "AI summarization",
		type: "slider",
		defaultValue: "3000",
		dependsOn: "enableAI",
	},
	{
		key: "maxVisitsPerDomain",
		label: "Max visits per domain",
		description:
			"Maximum number of unique page visits shown per domain in the daily note. " +
			"Higher values give more detail; lower values keep notes concise.",
		section: "Data sources",
		type: "slider",
		defaultValue: "5",
	},
	{
		key: "enableBrowser",
		label: "Browser history",
		description:
			"Collect browser history from installed browsers via local SQLite databases. " +
			"Only reads History files — passwords, cookies, and payment data are never accessed.",
		section: "Data sources",
		type: "boolean",
		defaultValue: "false",
		privacyNote:
			"Data source: local browser SQLite databases. " +
			"Destination: stays on your machine unless Anthropic AI is enabled.",
	},
	{
		key: "browserConfigs",
		label: "Browser & profile detection",
		description:
			"Per-browser, per-profile configuration. Populated when the user clicks " +
			"'Detect Browsers & Profiles'. Each browser can be enabled/disabled " +
			"independently; individual profiles can be included or excluded.",
		section: "Data sources",
		type: "internal",
		defaultValue: "[]",
	},
	{
		key: "enableClaude",
		label: "Claude Code sessions",
		description:
			"Collect Claude Code session summaries from local JSONL files. " +
			"Reads project names and session summaries only — never the full conversation.",
		section: "Data sources",
		type: "boolean",
		defaultValue: "false",
		privacyNote:
			"Data source: ~/.claude/projects JSONL files. " +
			"Destination: stays on your machine unless Anthropic AI is enabled.",
	},
	{
		key: "claudeSessionsDir",
		label: "Claude sessions directory",
		description:
			"Path to the directory containing Claude Code session logs. " +
			"Supports ~ for the home directory.",
		section: "Data sources",
		type: "string",
		defaultValue: "~/.claude/projects",
		dependsOn: "enableClaude",
	},
	{
		key: "enableCodex",
		label: "Codex CLI sessions",
		description:
			"Collect Codex CLI session summaries from local JSONL files. " +
			"Reads session metadata and summaries only — no API key required.",
		section: "Data sources",
		type: "boolean",
		defaultValue: "false",
		privacyNote:
			"Data source: ~/.codex/sessions JSONL files. " +
			"Destination: stays on your machine unless Anthropic AI is enabled.",
	},
	{
		key: "codexSessionsDir",
		label: "Codex sessions directory",
		description:
			"Path to the directory containing Codex CLI session logs. " +
			"Supports ~ for the home directory.",
		section: "Data sources",
		type: "string",
		defaultValue: "~/.codex/sessions",
		dependsOn: "enableCodex",
	},
	{
		key: "enableGit",
		label: "Git commit history",
		description:
			"Collect recent git commits from repositories in the configured parent directory. " +
			"Scans one directory level deep for .git folders.",
		section: "Data sources",
		type: "boolean",
		defaultValue: "false",
		privacyNote:
			"Data source: local git repositories. " +
			"Destination: stays on your machine unless Anthropic AI is enabled.",
	},
	{
		key: "gitParentDir",
		label: "Git parent directory",
		description:
			"Parent directory containing your git repositories. The plugin scans one " +
			"level deep for .git directories. Supports ~ for the home directory " +
			"(e.g. ~/git or ~/projects).",
		section: "Data sources",
		type: "string",
		defaultValue: "",
		dependsOn: "enableGit",
	},

	// ── Privacy ──────────────────────────────────────────────────────────────
	{
		key: "sensitivityPreset",
		label: "Sensitivity filter",
		description:
			"Quick-select for sensitivity filter categories. Off: no filtering. " +
			"Recommended: adult, gambling, dating, health, drugs. " +
			"Strict: all 11 categories. Custom: choose individual categories.",
		section: "Privacy",
		type: "select",
		defaultValue: "off",
	},
	{
		key: "enableSensitivityFilter",
		label: "Enable sensitivity filter",
		description:
			"Automatically filter visits to sensitive domains using a built-in blocklist " +
			"(419+ domains across 11 categories). Driven by the sensitivity preset dropdown.",
		section: "Privacy",
		type: "boolean",
		defaultValue: "false",
	},
	{
		key: "sensitivityCategories",
		label: "Sensitivity categories",
		description:
			"Which categories of sensitive domains to filter. " +
			"Available categories: adult, gambling, dating, health, drugs, finance, " +
			"weapons, piracy, vpn_proxy, job_search, social_personal.",
		section: "Privacy",
		type: "internal",
		defaultValue: "[]",
		dependsOn: "enableSensitivityFilter",
	},
	{
		key: "sensitivityCustomDomains",
		label: "Custom sensitive domains",
		description:
			"Additional domains to filter using exact matching. " +
			"Subdomains are matched automatically — adding example.com also matches " +
			"sub.example.com. Supports path prefixes (e.g. reddit.com/r/subreddit).",
		section: "Privacy",
		type: "textarea",
		defaultValue: "",
		dependsOn: "enableSensitivityFilter",
	},

	// ── Advanced ─────────────────────────────────────────────────────────────
	{
		key: "sensitivityAction",
		label: "Sensitivity filter action",
		description:
			"Exclude: remove matching visits entirely from the note. " +
			"Redact: keep the visit but replace the URL and title with a category label.",
		section: "Advanced",
		type: "select",
		defaultValue: "exclude",
		dependsOn: "enableSensitivityFilter",
	},
	{
		key: "privacyTier",
		label: "Privacy tier",
		description:
			"Explicit privacy tier for Anthropic cloud calls. " +
			"Tiers: 4 (statistics only), 3 (classified abstractions), " +
			"2 (budget-compressed), 1 (sanitized raw data). Auto selects the highest available tier.",
		section: "AI summarization",
		type: "select",
		defaultValue: "null",
		dependsOn: "enableAI",
	},
	{
		key: "debugMode",
		label: "Debug mode",
		description:
			"Enables the 'Inspect pipeline stage' command for per-stage data inspection. " +
			"For development use only.",
		section: "Advanced",
		type: "boolean",
		defaultValue: "false",
	},

	// ── AI summarization ─────────────────────────────────────────────────────
	{
		key: "enableAI",
		label: "Enable AI summaries",
		description:
			"Use an AI model to generate daily summaries, themes, and reflections. " +
			"Choose a local model to keep all data on your machine, or Anthropic's API " +
			"for cloud-based summarization.",
		section: "AI summarization",
		type: "boolean",
		defaultValue: "false",
	},
	{
		key: "profile",
		label: "Profile hint",
		description:
			"Context hint for AI summaries (e.g. 'software engineer at a SaaS startup'). " +
			"Helps the model tailor the summary to your role.",
		section: "AI summarization",
		type: "string",
		defaultValue: "",
		dependsOn: "enableAI",
	},
	{
		key: "aiProvider",
		label: "AI provider",
		description:
			"Local: runs on your machine via Ollama, LM Studio, or any OpenAI-compatible " +
			"server — no data leaves your computer. " +
			"Anthropic: sends sanitized activity data to api.anthropic.com for processing.",
		section: "AI summarization",
		type: "select",
		defaultValue: "local",
		dependsOn: "enableAI",
		privacyNote:
			"Selecting 'Anthropic' causes sanitized activity data to be sent to " +
			"api.anthropic.com when generating a note.",
	},
	{
		key: "localEndpoint",
		label: "Local server endpoint",
		description:
			"URL of your local inference server. Ollama defaults to http://localhost:11434, " +
			"LM Studio to http://localhost:1234. Must expose an OpenAI-compatible " +
			"/v1/chat/completions endpoint.",
		section: "AI summarization",
		type: "string",
		defaultValue: "http://localhost:11434",
		dependsOn: "enableAI",
	},
	{
		key: "localModel",
		label: "Local model",
		description:
			"Model name to use with the local server (e.g. qwen2.5:14b-instruct, llama3.2). " +
			"Click 'Detect' to query your server for available models.",
		section: "AI summarization",
		type: "string",
		defaultValue: "",
		dependsOn: "enableAI",
	},
	{
		key: "aiModel",
		label: "Anthropic model",
		description:
			"Anthropic model to use for summarization when the Anthropic provider is selected.",
		section: "AI summarization",
		type: "select",
		defaultValue: "claude-haiku-4-5",
		dependsOn: "enableAI",
	},
	{
		key: "enablePromptPreview",
		label: "Show prompt preview",
		description:
			"Display the exact AI prompt in the data preview modal before sending to " +
			"Anthropic. The prompt can be reviewed and edited before confirming. " +
			"Only applies to the Anthropic provider (local models don't show a consent modal).",
		section: "AI summarization",
		type: "boolean",
		defaultValue: "true",
		enabledByDefault: true,
		dependsOn: "enableAI",
	},
	{
		key: "promptsDir",
		label: "Prompt templates directory",
		description:
			"Path to a folder containing custom prompt templates " +
			"(prose-high.txt, prose-balanced.txt, prose-lite.txt). Leave empty to use the built-in prompts.",
		section: "AI summarization",
		type: "string",
		defaultValue: "",
		dependsOn: "enableAI",
	},

	// (Advanced AI settings — classification, patterns, etc.)
	{
		key: "enableClassification",
		label: "Enable event classification",
		description:
			"Classify raw activity events into structured abstractions (activity type, " +
			"topics, entities, intent) using a local LLM. " +
			"When Anthropic is the AI provider, only these abstractions are sent " +
			"externally — never raw URLs, search queries, or commands.",
		section: "Advanced",
		type: "boolean",
		defaultValue: "false",
		dependsOn: "enableAI",
		privacyNote:
			"Classification always runs locally on your machine, even when Anthropic " +
			"is the summarization provider.",
	},
	{
		key: "classificationModel",
		label: "Classification model",
		description:
			"Local model for event classification. Leave blank to use the same model " +
			"as AI summarization. Recommended: qwen2.5:7b-instruct.",
		section: "Advanced",
		type: "string",
		defaultValue: "",
		dependsOn: "enableClassification",
	},
	{
		key: "classificationBatchSize",
		label: "Classification batch size",
		description:
			"Number of events per classification batch. Larger batches are faster " +
			"but may reduce accuracy.",
		section: "Advanced",
		type: "slider",
		defaultValue: "8",
		dependsOn: "enableClassification",
	},
	{
		key: "trackRecurrence",
		label: "Track recurrence",
		description:
			"Remember topics you visit across multiple days and highlight recurring interests " +
			"in your daily notes. When enabled, a small topic-history file is stored locally " +
			"in your vault (.daily-digest/topic-history.json).",
		section: "Advanced",
		type: "boolean",
		defaultValue: "true",
		enabledByDefault: true,
		dependsOn: undefined,
	},
	{
		key: "enableTimeline",
		label: "Unified timeline",
		description:
			"Render a cross-source chronological timeline in the daily note. " +
			"Merges browser visits, searches, Claude sessions, and git commits " +
			"into a single timeline grouped by time-of-day and focus sessions.",
		section: "General",
		type: "boolean",
		defaultValue: "false",
		enabledByDefault: false,
	},

	// ── Meta ─────────────────────────────────────────────────────────────────
	{
		key: "hasCompletedOnboarding",
		label: "Has completed onboarding",
		description:
			"Internal flag. Set to true after the user dismisses the first-run privacy " +
			"disclosure modal. Reset via 'Reset privacy onboarding' in Advanced settings.",
		section: "Meta",
		type: "internal",
		defaultValue: "false",
	},
	{
		key: "privacyConsentVersion",
		label: "Privacy consent version",
		description:
			"Internal flag tracking which version of the privacy disclosure the user " +
			"has accepted. Bumping CURRENT_PRIVACY_VERSION re-triggers the onboarding modal.",
		section: "Meta",
		type: "internal",
		defaultValue: "0",
	},
];
