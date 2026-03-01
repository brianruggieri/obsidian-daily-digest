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
	| "Privacy & filtering"
	| "AI summarization"
	| "Advanced AI processing"
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
		section: "Data sources",
		type: "slider",
		defaultValue: "3000",
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

	// ── Privacy & filtering ──────────────────────────────────────────────────
	{
		key: "enableSanitization",
		label: "Enable sanitization",
		description:
			"Scrub sensitive tokens, auth parameters, email addresses, and IP addresses " +
			"from all collected data before AI processing or vault storage. " +
			"Highly recommended when using the Anthropic API.",
		section: "Privacy & filtering",
		type: "boolean",
		defaultValue: "true",
		enabledByDefault: true,
	},
	{
		key: "sanitizationLevel",
		label: "Sanitization level",
		description:
			"Standard: strip tokens, sensitive URL parameters, emails, and IP addresses. " +
			"Aggressive: also reduces URLs to domain + path only, removing all query strings.",
		section: "Privacy & filtering",
		type: "select",
		defaultValue: "standard",
		dependsOn: "enableSanitization",
	},
	{
		key: "excludedDomains",
		label: "Excluded domains",
		description:
			"Always-exclude list using simple pattern matching. A pattern like 'mybank' " +
			"matches any domain containing that text (mybank.com, us.mybank.com, etc.). " +
			"For exact domain matching or path-based filtering, use Custom Sensitive Domains instead.",
		section: "Privacy & filtering",
		type: "string",
		defaultValue: "",
		dependsOn: "enableSanitization",
	},
	{
		key: "redactPaths",
		label: "Redact file paths",
		description:
			"Replace absolute home directory paths (/Users/you/...) with ~/ in all output.",
		section: "Privacy & filtering",
		type: "boolean",
		defaultValue: "true",
		enabledByDefault: true,
		dependsOn: "enableSanitization",
	},
	{
		key: "scrubEmails",
		label: "Redact email addresses",
		description: "Replace email addresses with [EMAIL] in all output.",
		section: "Privacy & filtering",
		type: "boolean",
		defaultValue: "true",
		enabledByDefault: true,
		dependsOn: "enableSanitization",
	},
	{
		key: "enableSensitivityFilter",
		label: "Enable sensitivity filter",
		description:
			"Automatically filter visits to sensitive domains using a built-in blocklist " +
			"(419+ domains across 11 categories). Works like an adblock list for your " +
			"daily notes — prevents embarrassing or private domains from appearing in " +
			"your activity log.",
		section: "Privacy & filtering",
		type: "boolean",
		defaultValue: "false",
	},
	{
		key: "sensitivityAction",
		label: "Filter action",
		description:
			"Exclude: remove matching visits entirely from the note. " +
			"Redact: keep the visit but replace the URL and title with a category label.",
		section: "Privacy & filtering",
		type: "select",
		defaultValue: "exclude",
		dependsOn: "enableSensitivityFilter",
	},
	{
		key: "sensitivityCategories",
		label: "Sensitivity categories",
		description:
			"Which categories of sensitive domains to filter. " +
			"Available categories: adult, gambling, dating, health, drugs, finance, " +
			"weapons, piracy, vpn_proxy, job_search, social_personal.",
		section: "Privacy & filtering",
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
			"sub.example.com. Supports path prefixes (e.g. reddit.com/r/subreddit). " +
			"These domains follow the filter action setting (exclude or redact).",
		section: "Privacy & filtering",
		type: "textarea",
		defaultValue: "",
		dependsOn: "enableSensitivityFilter",
	},
	{
		key: "autoAggressiveSanitization",
		label: "Auto-aggressive sanitization for cloud",
		description:
			"Always apply aggressive sanitization when sending data to the Anthropic API. " +
			"Strips all URL query strings and reduces URLs to domain+path only. " +
			"Recommended when using the cloud provider.",
		section: "Privacy & filtering",
		type: "boolean",
		defaultValue: "true",
		enabledByDefault: true,
		dependsOn: "enableSanitization",
	},
	{
		key: "privacyTier",
		label: "Privacy tier",
		description:
			"Explicit privacy tier for Anthropic cloud calls. " +
			"Tiers: 4 (de-identified stats only), 3 (classified abstractions), " +
			"2 (budget-compressed), 1 (sanitized raw data). Auto selects the highest available tier.",
		section: "Privacy & filtering",
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
		section: "Privacy & filtering",
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
		key: "promptsDir",
		label: "Prompt templates directory",
		description:
			"Path to a directory containing custom prompt templates " +
			"(standard.txt, rag.txt, etc.). Leave empty to use the built-in prompts.",
		section: "AI summarization",
		type: "string",
		defaultValue: "",
		dependsOn: "enableAI",
	},

	// ── Advanced AI processing ───────────────────────────────────────────────
	{
		key: "enableRAG",
		label: "Enable RAG chunking",
		description:
			"Split activity data into focused chunks and use embeddings to select the " +
			"most relevant context for summarization. Improves quality with large datasets " +
			"and small context window models. Requires a local model server with an " +
			"embedding model.",
		section: "Advanced AI processing",
		type: "boolean",
		defaultValue: "false",
		dependsOn: "enableAI",
		privacyNote:
			"Embeddings are always generated locally, even when Anthropic is the " +
			"summarization provider. No embedding data is sent externally.",
	},
	{
		key: "embeddingModel",
		label: "Embedding model",
		description:
			"Model for generating embeddings (e.g. nomic-embed-text, all-minilm, " +
			"mxbai-embed-large). Must be available on your local server.",
		section: "Advanced AI processing",
		type: "string",
		defaultValue: "nomic-embed-text",
		dependsOn: "enableRAG",
	},
	{
		key: "ragTopK",
		label: "Retrieved chunks (Top K)",
		description:
			"Number of most-relevant chunks to include in the AI prompt. " +
			"Higher values provide more context but increase latency. 6–10 is a good range.",
		section: "Advanced AI processing",
		type: "slider",
		defaultValue: "8",
		dependsOn: "enableRAG",
	},
	{
		key: "enableClassification",
		label: "Enable event classification",
		description:
			"Classify raw activity events into structured abstractions (activity type, " +
			"topics, entities, intent) using a local LLM. " +
			"When Anthropic is the AI provider, only these abstractions are sent " +
			"externally — never raw URLs, search queries, or commands.",
		section: "Advanced AI processing",
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
		section: "Advanced AI processing",
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
		section: "Advanced AI processing",
		type: "slider",
		defaultValue: "8",
		dependsOn: "enableClassification",
	},
	{
		key: "patternCooccurrenceWindow",
		label: "Co-occurrence window",
		description:
			"Time window in minutes for detecting topic co-occurrences. " +
			"Events within the same window are considered related.",
		section: "Advanced AI processing",
		type: "slider",
		defaultValue: "30",
		dependsOn: undefined,
	},
	{
		key: "patternMinClusterSize",
		label: "Minimum cluster size",
		description:
			"Minimum number of events required to form a temporal cluster. " +
			"Lower values detect more clusters but may include noise.",
		section: "Advanced AI processing",
		type: "slider",
		defaultValue: "3",
		dependsOn: undefined,
	},
	{
		key: "trackRecurrence",
		label: "Track recurrence",
		description:
			"Persist topic history across days to detect recurring interests, " +
			"returning topics, and rising trends. Stored locally in your vault " +
			"under .daily-digest/topic-history.json.",
		section: "Advanced AI processing",
		type: "boolean",
		defaultValue: "true",
		enabledByDefault: true,
		dependsOn: undefined,
	},

	// ── Meta ─────────────────────────────────────────────────────────────────
	{
		key: "hasCompletedOnboarding",
		label: "Has completed onboarding",
		description:
			"Internal flag. Set to true after the user dismisses the first-run privacy " +
			"disclosure modal. Reset via 'Reset privacy onboarding' in Privacy & Filtering.",
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
