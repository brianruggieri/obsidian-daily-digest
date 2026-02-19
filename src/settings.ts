import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import DailyDigestPlugin from "./main";
import { PRIVACY_DESCRIPTIONS } from "./privacy";

export type AIProvider = "none" | "local" | "anthropic";

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
	aiProvider: AIProvider;
	localEndpoint: string;
	localModel: string;
	enableBrowser: boolean;
	enableShell: boolean;
	enableClaude: boolean;
	claudeSessionsDir: string;
	hasCompletedOnboarding: boolean;
	privacyConsentVersion: number;
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
	enableAI: false,
	aiProvider: "local",
	localEndpoint: "http://localhost:11434",
	localModel: "",
	enableBrowser: false,
	enableShell: false,
	enableClaude: false,
	claudeSessionsDir: "~/.claude/projects",
	hasCompletedOnboarding: false,
	privacyConsentVersion: 0,
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

		// ── Privacy & Data ───────────────────────────
		new Setting(containerEl).setName("Privacy & Data").setHeading();

		const enabledSources: string[] = [];
		if (this.plugin.settings.enableBrowser) enabledSources.push("browser history databases");
		if (this.plugin.settings.enableShell) enabledSources.push("shell history files");
		if (this.plugin.settings.enableClaude) enabledSources.push("Claude Code session logs");

		const accessCallout = containerEl.createDiv({ cls: "dd-settings-callout" });
		if (enabledSources.length > 0) {
			accessCallout.createEl("p", {
				text: `Currently accessing: ${enabledSources.join(", ")}.`,
			});
		} else {
			accessCallout.createEl("p", {
				text: "No external data sources are currently enabled. Enable sources below to collect activity data.",
			});
		}

		const transmitCallout = containerEl.createDiv({
			cls: "dd-settings-callout " +
				(this.plugin.settings.enableAI && this.plugin.settings.aiProvider === "anthropic"
					? "dd-settings-callout-warn" : ""),
		});
		if (!this.plugin.settings.enableAI) {
			transmitCallout.createEl("p", {
				text:
					"AI Summarization is OFF. All data stays on your computer. " +
					"No data is transmitted externally.",
			});
		} else if (this.plugin.settings.aiProvider === "local") {
			transmitCallout.createEl("p", {
				text:
					"AI Summarization is ON (local model). All data stays on your " +
					"computer. No data is transmitted externally.",
			});
		} else {
			transmitCallout.createEl("p", {
				text:
					"AI Summarization is ON (Anthropic API). When you generate a note, " +
					"collected data will be sent to api.anthropic.com for processing.",
			});
		}

		// ── Data Sources ─────────────────────────────
		new Setting(containerEl).setName("Data sources").setHeading();

		new Setting(containerEl)
			.setName("Browser history")
			.setDesc(
				PRIVACY_DESCRIPTIONS.browser.access + " " +
				PRIVACY_DESCRIPTIONS.browser.destination
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableBrowser)
					.onChange(async (value) => {
						this.plugin.settings.enableBrowser = value;
						await this.plugin.saveSettings();
						this.display();
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
			.setDesc(
				PRIVACY_DESCRIPTIONS.shell.access + " " +
				PRIVACY_DESCRIPTIONS.shell.destination
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableShell)
					.onChange(async (value) => {
						this.plugin.settings.enableShell = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		new Setting(containerEl)
			.setName("Claude sessions")
			.setDesc(
				PRIVACY_DESCRIPTIONS.claude.access + " " +
				PRIVACY_DESCRIPTIONS.claude.destination
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableClaude)
					.onChange(async (value) => {
						this.plugin.settings.enableClaude = value;
						await this.plugin.saveSettings();
						this.display();
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

		// ── AI Summarization ─────────────────────────
		new Setting(containerEl).setName("AI summarization").setHeading();

		new Setting(containerEl)
			.setName("Enable AI summaries")
			.setDesc(
				"Use an AI model to generate daily summaries, themes, and reflections. " +
				"Choose a local model to keep all data on your machine, or Anthropic's " +
				"API for cloud-based summarization."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableAI)
					.onChange(async (value) => {
						this.plugin.settings.enableAI = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.enableAI) {
			new Setting(containerEl)
				.setName("AI provider")
				.setDesc(
					"Local: runs on your machine via Ollama, LM Studio, or any OpenAI-compatible " +
					"server. No data leaves your computer. " +
					"Anthropic: sends data to api.anthropic.com for processing."
				)
				.addDropdown((dropdown) =>
					dropdown
						.addOption("local", "Local model (private)")
						.addOption("anthropic", "Anthropic API (cloud)")
						.setValue(this.plugin.settings.aiProvider)
						.onChange(async (value) => {
							this.plugin.settings.aiProvider = value as AIProvider;
							await this.plugin.saveSettings();
							this.display();
						})
				);

			if (this.plugin.settings.aiProvider === "local") {
				// ── Local model settings ─────────────
				new Setting(containerEl)
					.setName("Local server endpoint")
					.setDesc(
						"URL of your local inference server. Ollama defaults to " +
						"http://localhost:11434, LM Studio to http://localhost:1234. " +
						"Must expose an OpenAI-compatible /v1/chat/completions endpoint."
					)
					.addText((text) =>
						text
							.setPlaceholder("http://localhost:11434")
							.setValue(this.plugin.settings.localEndpoint)
							.onChange(async (value) => {
								this.plugin.settings.localEndpoint = value;
								await this.plugin.saveSettings();
							})
					);

				new Setting(containerEl)
					.setName("Local model")
					.setDesc(
						"Model name to use (e.g. llama3.2, mistral, phi3). " +
						"Click Detect to query your server for available models."
					)
					.addText((text) =>
						text
							.setPlaceholder("llama3.2")
							.setValue(this.plugin.settings.localModel)
							.onChange(async (value) => {
								this.plugin.settings.localModel = value;
								await this.plugin.saveSettings();
							})
					)
					.addButton((btn) =>
						btn.setButtonText("Detect").onClick(async () => {
							await this.detectLocalModels(containerEl);
						})
					);

				const localCallout = containerEl.createDiv({
					cls: "dd-settings-callout",
				});
				localCallout.createEl("p", {
					text:
						"All data stays on your machine. The local server receives your " +
						"activity data over localhost only. No internet connection is used.",
				});
			} else {
				// ── Anthropic settings ───────────────
				new Setting(containerEl)
					.setName("Anthropic API key")
					.setDesc(
						"Your Anthropic API key. Stored in this plugin's data.json file " +
						"within your vault. If your vault is synced, this key may be " +
						"uploaded to your sync provider. Alternative: set the " +
						"ANTHROPIC_API_KEY environment variable instead and leave this blank."
					)
					.addText((text) => {
						text.inputEl.type = "password";
						text.setPlaceholder("sk-ant-...")
							.setValue(this.plugin.settings.anthropicApiKey)
							.onChange(async (value) => {
								this.plugin.settings.anthropicApiKey = value;
								await this.plugin.saveSettings();
							});
					});

				const apiKeyNote = containerEl.createDiv({
					cls: "dd-settings-callout dd-settings-callout-info",
				});
				apiKeyNote.createEl("p", {
					text:
						"Security note: API keys in data.json are readable by any Obsidian " +
						"plugin and may be synced with your vault. For better security, use " +
						"the ANTHROPIC_API_KEY environment variable and leave the field above blank.",
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

		// ── Advanced ─────────────────────────────────
		new Setting(containerEl).setName("Advanced").setHeading();

		new Setting(containerEl)
			.setName("Reset privacy onboarding")
			.setDesc("Show the first-run privacy disclosure modal again next time the plugin loads.")
			.addButton((btn) =>
				btn.setButtonText("Reset").onClick(async () => {
					this.plugin.settings.hasCompletedOnboarding = false;
					this.plugin.settings.privacyConsentVersion = 0;
					await this.plugin.saveSettings();
					new Notice("Onboarding will be shown again when Obsidian restarts.");
				})
			);
	}

	private async detectLocalModels(containerEl: HTMLElement): Promise<void> {
		const endpoint = this.plugin.settings.localEndpoint.replace(/\/+$/, "");
		const notice = new Notice("Detecting local models\u2026", 0);

		try {
			// Try Ollama-native endpoint first
			let models: string[] = [];
			try {
				const { requestUrl } = await import("obsidian");
				const resp = await requestUrl({
					url: `${endpoint}/api/tags`,
					method: "GET",
				});
				if (resp.status === 200 && resp.json?.models) {
					models = resp.json.models.map(
						(m: { name: string }) => m.name
					);
				}
			} catch {
				// Fall back to OpenAI-compatible /v1/models
				try {
					const { requestUrl } = await import("obsidian");
					const resp = await requestUrl({
						url: `${endpoint}/v1/models`,
						method: "GET",
					});
					if (resp.status === 200 && resp.json?.data) {
						models = resp.json.data.map(
							(m: { id: string }) => m.id
						);
					}
				} catch {
					// Both failed
				}
			}

			notice.hide();

			if (models.length === 0) {
				new Notice(
					`No models found at ${endpoint}. Is your local server running?`,
					8000
				);
				return;
			}

			// Auto-select first model if none set
			if (!this.plugin.settings.localModel && models.length > 0) {
				this.plugin.settings.localModel = models[0];
				await this.plugin.saveSettings();
			}

			new Notice(`Found ${models.length} model(s): ${models.slice(0, 5).join(", ")}`, 6000);
			this.display();
		} catch (e) {
			notice.hide();
			new Notice(`Failed to detect models: ${e}`, 8000);
		}
	}
}
