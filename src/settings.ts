import { App, PluginSettingTab, Setting } from "obsidian";
import DailyDigestPlugin from "./main";

export interface DailyDigestSettings {
	dailyFolder: string;
	filenameTemplate: string;
	lookbackHours: number;
	maxBrowserVisits: number;
	maxSearches: number;
	maxShellCommands: number;
	maxClaudeSessions: number;
	browsers: string[];
	anthropicApiKey: string;
	aiModel: string;
	profile: string;
	enableAI: boolean;
	enableBrowser: boolean;
	enableShell: boolean;
	enableClaude: boolean;
	claudeSessionsDir: string;
}

export const DEFAULT_SETTINGS: DailyDigestSettings = {
	dailyFolder: "daily",
	filenameTemplate: "YYYY-MM-DD",
	lookbackHours: 24,
	maxBrowserVisits: 80,
	maxSearches: 40,
	maxShellCommands: 50,
	maxClaudeSessions: 30,
	browsers: ["chrome", "brave", "firefox", "safari"],
	anthropicApiKey: "",
	aiModel: "claude-haiku-4-5",
	profile: "",
	enableAI: true,
	enableBrowser: true,
	enableShell: true,
	enableClaude: true,
	claudeSessionsDir: "~/.claude/projects",
};

const BROWSER_OPTIONS: Record<string, string> = {
	chrome: "Google Chrome",
	brave: "Brave",
	edge: "Microsoft Edge",
	firefox: "Firefox",
	safari: "Safari",
};

export class DailyDigestSettingTab extends PluginSettingTab {
	plugin: DailyDigestPlugin;

	constructor(app: App, plugin: DailyDigestPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ── General ──────────────────────────────────
		new Setting(containerEl).setName("General").setHeading();

		new Setting(containerEl)
			.setName("Daily notes folder")
			.setDesc("Folder within your vault for daily notes")
			.addText((text) =>
				text
					.setPlaceholder("daily")
					.setValue(this.plugin.settings.dailyFolder)
					.onChange(async (value) => {
						this.plugin.settings.dailyFolder = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Filename template")
			.setDesc("Date format for filenames (uses Moment.js format, e.g. YYYY-MM-DD)")
			.addText((text) =>
				text
					.setPlaceholder("YYYY-MM-DD")
					.setValue(this.plugin.settings.filenameTemplate)
					.onChange(async (value) => {
						this.plugin.settings.filenameTemplate = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Lookback hours")
			.setDesc("How many hours of history to collect")
			.addSlider((slider) =>
				slider
					.setLimits(1, 72, 1)
					.setValue(this.plugin.settings.lookbackHours)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.lookbackHours = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Profile hint")
			.setDesc("Context hint for AI summaries (e.g. 'software engineer at a SaaS startup')")
			.addText((text) =>
				text
					.setPlaceholder("optional")
					.setValue(this.plugin.settings.profile)
					.onChange(async (value) => {
						this.plugin.settings.profile = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Data Sources ─────────────────────────────
		new Setting(containerEl).setName("Data sources").setHeading();

		new Setting(containerEl)
			.setName("Browser history")
			.setDesc("Collect visited URLs and search queries from browsers")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableBrowser)
					.onChange(async (value) => {
						this.plugin.settings.enableBrowser = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Browsers")
			.setDesc("Which browsers to scan (comma-separated: chrome, brave, edge, firefox, safari)")
			.addText((text) =>
				text
					.setPlaceholder("chrome, brave, firefox, safari")
					.setValue(this.plugin.settings.browsers.join(", "))
					.onChange(async (value) => {
						this.plugin.settings.browsers = value
							.split(",")
							.map((b) => b.trim().toLowerCase())
							.filter((b) => b in BROWSER_OPTIONS);
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Shell history")
			.setDesc("Collect commands from zsh/bash history")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableShell)
					.onChange(async (value) => {
						this.plugin.settings.enableShell = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Claude sessions")
			.setDesc("Collect prompts from Claude Code sessions")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableClaude)
					.onChange(async (value) => {
						this.plugin.settings.enableClaude = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Claude sessions directory")
			.setDesc("Path to Claude Code sessions (uses ~ for home)")
			.addText((text) =>
				text
					.setPlaceholder("~/.claude/projects")
					.setValue(this.plugin.settings.claudeSessionsDir)
					.onChange(async (value) => {
						this.plugin.settings.claudeSessionsDir = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Limits ───────────────────────────────────
		new Setting(containerEl).setName("Limits").setHeading();

		new Setting(containerEl)
			.setName("Max browser visits")
			.addSlider((slider) =>
				slider
					.setLimits(10, 200, 10)
					.setValue(this.plugin.settings.maxBrowserVisits)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxBrowserVisits = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Max searches")
			.addSlider((slider) =>
				slider
					.setLimits(10, 100, 5)
					.setValue(this.plugin.settings.maxSearches)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxSearches = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Max shell commands")
			.addSlider((slider) =>
				slider
					.setLimits(10, 100, 5)
					.setValue(this.plugin.settings.maxShellCommands)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxShellCommands = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Max Claude sessions")
			.addSlider((slider) =>
				slider
					.setLimits(5, 100, 5)
					.setValue(this.plugin.settings.maxClaudeSessions)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxClaudeSessions = value;
						await this.plugin.saveSettings();
					})
			);

		// ── AI ───────────────────────────────────────
		new Setting(containerEl).setName("AI summarization").setHeading();

		new Setting(containerEl)
			.setName("Enable AI summaries")
			.setDesc("Use Anthropic API to generate daily summaries, themes, and reflections")
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableAI)
					.onChange(async (value) => {
						this.plugin.settings.enableAI = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Anthropic API key")
			.setDesc("Your Anthropic API key (or set ANTHROPIC_API_KEY environment variable)")
			.addText((text) => {
				text.inputEl.type = "password";
				text.setPlaceholder("sk-ant-...")
					.setValue(this.plugin.settings.anthropicApiKey)
					.onChange(async (value) => {
						this.plugin.settings.anthropicApiKey = value;
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("AI model")
			.setDesc("Anthropic model for summarization")
			.addDropdown((dropdown) =>
				dropdown
					.addOption("claude-haiku-4-5", "Claude Haiku 4.5 (fast, cheap)")
					.addOption("claude-sonnet-4-5-20250929", "Claude Sonnet 4.5")
					.addOption("claude-opus-4-6", "Claude Opus 4.6")
					.setValue(this.plugin.settings.aiModel)
					.onChange(async (value) => {
						this.plugin.settings.aiModel = value;
						await this.plugin.saveSettings();
					})
			);
	}
}
