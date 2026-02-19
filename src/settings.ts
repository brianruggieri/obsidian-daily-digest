import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import DailyDigestPlugin from "./main";
import { PRIVACY_DESCRIPTIONS } from "./privacy";
import { SanitizationLevel, SensitivityCategory } from "./types";
import { getCategoryInfo, getTotalBuiltinDomains } from "./sensitivity";

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
	enablePatterns: boolean;
	patternCooccurrenceWindow: number;
	patternMinClusterSize: number;
	trackRecurrence: boolean;
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
	enablePatterns: false,
	patternCooccurrenceWindow: 30,
	patternMinClusterSize: 3,
	trackRecurrence: true,
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

		// ── Data Sanitization ────────────────────────
		new Setting(containerEl).setName("Data sanitization").setHeading();

		new Setting(containerEl)
			.setName("Enable sanitization")
			.setDesc(
				"Scrub sensitive tokens, auth parameters, email addresses, and " +
				"IP addresses from all collected data before AI processing or " +
				"vault storage. Highly recommended when using Anthropic API."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableSanitization)
					.onChange(async (value) => {
						this.plugin.settings.enableSanitization = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.enableSanitization) {
			new Setting(containerEl)
				.setName("Sanitization level")
				.setDesc(
					"Standard: strip tokens, sensitive URL params, emails, IPs. " +
					"Aggressive: also reduce URLs to domain+path only (removes all query strings)."
				)
				.addDropdown((dropdown) =>
					dropdown
						.addOption("standard", "Standard")
						.addOption("aggressive", "Aggressive")
						.setValue(this.plugin.settings.sanitizationLevel)
						.onChange(async (value) => {
							this.plugin.settings.sanitizationLevel = value as SanitizationLevel;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Excluded domains")
				.setDesc(
					"Visits to these domains will be excluded entirely from collection. " +
					"Comma-separated patterns (e.g. mybank.com, healthportal.com, vpn.)."
				)
				.addText((text) =>
					text
						.setPlaceholder("mybank.com, internal.corp.com")
						.setValue(this.plugin.settings.excludedDomains)
						.onChange(async (value) => {
							this.plugin.settings.excludedDomains = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Redact file paths")
				.setDesc(
					"Replace home directory paths (/Users/you/...) with ~/ in all output."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.redactPaths)
						.onChange(async (value) => {
							this.plugin.settings.redactPaths = value;
							await this.plugin.saveSettings();
						})
				);

			new Setting(containerEl)
				.setName("Redact email addresses")
				.setDesc(
					"Replace email addresses with [EMAIL] in all output."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.scrubEmails)
						.onChange(async (value) => {
							this.plugin.settings.scrubEmails = value;
							await this.plugin.saveSettings();
						})
				);

			const sanitizeCallout = containerEl.createDiv({
				cls: "dd-settings-callout dd-settings-callout-info",
			});
			sanitizeCallout.createEl("p", {
				text:
					"Secrets (API keys, tokens, passwords, JWTs) are always scrubbed " +
					"from all output regardless of these settings. These controls " +
					"provide additional defense-in-depth.",
			});
		}

		// ── Sensitivity Filter ───────────────────────
		new Setting(containerEl).setName("Sensitivity filter").setHeading();

		const totalDomains = getTotalBuiltinDomains();

		new Setting(containerEl)
			.setName("Enable sensitivity filter")
			.setDesc(
				`Automatically filter visits to sensitive domains (${totalDomains} built-in ` +
				`across 11 categories). Works like an adblock list for your daily notes — ` +
				`prevents embarrassing or private domains from appearing in your activity log.`
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableSensitivityFilter)
					.onChange(async (value) => {
						this.plugin.settings.enableSensitivityFilter = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		if (this.plugin.settings.enableSensitivityFilter) {
			new Setting(containerEl)
				.setName("Filter action")
				.setDesc(
					"Exclude: remove matching visits entirely. " +
					"Redact: keep the visit but replace URL and title with a category label."
				)
				.addDropdown((dropdown) =>
					dropdown
						.addOption("exclude", "Exclude (remove entirely)")
						.addOption("redact", "Redact (replace with category label)")
						.setValue(this.plugin.settings.sensitivityAction)
						.onChange(async (value) => {
							this.plugin.settings.sensitivityAction = value as "exclude" | "redact";
							await this.plugin.saveSettings();
						})
				);

			// Category toggles
			const catInfo = getCategoryInfo();
			const enabledCats = new Set(this.plugin.settings.sensitivityCategories);

			const catContainer = containerEl.createDiv({ cls: "dd-sensitivity-categories" });
			const catHeading = new Setting(catContainer)
				.setName("Categories")
				.setDesc(
					`Select which types of domains to filter. ` +
					`${enabledCats.size} of ${Object.keys(catInfo).length - 1} categories enabled.`
				);

			// Quick-select buttons
			catHeading.addButton((btn) =>
				btn.setButtonText("All").onClick(async () => {
					this.plugin.settings.sensitivityCategories = Object.keys(catInfo)
						.filter((k) => k !== "custom") as SensitivityCategory[];
					await this.plugin.saveSettings();
					this.display();
				})
			);
			catHeading.addButton((btn) =>
				btn.setButtonText("None").onClick(async () => {
					this.plugin.settings.sensitivityCategories = [];
					await this.plugin.saveSettings();
					this.display();
				})
			);
			catHeading.addButton((btn) =>
				btn.setButtonText("Recommended").onClick(async () => {
					this.plugin.settings.sensitivityCategories = [
						"adult", "gambling", "dating", "health", "drugs",
					];
					await this.plugin.saveSettings();
					this.display();
				})
			);

			// Individual category toggles
			for (const [key, info] of Object.entries(catInfo)) {
				if (key === "custom") continue;
				const cat = key as SensitivityCategory;
				new Setting(catContainer)
					.setName(`${info.label} (${info.count})`)
					.setDesc(info.description)
					.addToggle((toggle) =>
						toggle
							.setValue(enabledCats.has(cat))
							.onChange(async (value) => {
								const cats = new Set(this.plugin.settings.sensitivityCategories);
								if (value) {
									cats.add(cat);
								} else {
									cats.delete(cat);
								}
								this.plugin.settings.sensitivityCategories = [...cats];
								await this.plugin.saveSettings();
							})
					);
			}

			// Custom domains
			new Setting(containerEl)
				.setName("Custom sensitive domains")
				.setDesc(
					"Additional domains to filter, comma-separated. " +
					"Supports path prefixes (e.g. reddit.com/r/subreddit)."
				)
				.addTextArea((text) => {
					text.inputEl.rows = 3;
					text.inputEl.cols = 40;
					text.setPlaceholder("example.com, reddit.com/r/mysubreddit")
						.setValue(this.plugin.settings.sensitivityCustomDomains)
						.onChange(async (value) => {
							this.plugin.settings.sensitivityCustomDomains = value;
							await this.plugin.saveSettings();
						});
				});

			const sensitivityCallout = containerEl.createDiv({
				cls: "dd-settings-callout dd-settings-callout-info",
			});
			sensitivityCallout.createEl("p", {
				text:
					"The sensitivity filter runs before all other processing. Filtered " +
					"domains never reach AI models, the vault note, or any external " +
					"service. The built-in list covers well-known sites; add custom " +
					"domains for anything specific to your situation.",
			});
		}

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

				// ── Quick start guide ────────────────
				const guide = containerEl.createDiv({ cls: "dd-setup-guide" });
				const guideToggle = new Setting(guide)
					.setName("Quick start guide")
					.setDesc("How to set up a local AI model");

				const guideContent = guide.createDiv({ cls: "dd-setup-guide-content" });
				guideContent.style.display = "none";

				guideToggle.addButton((btn) =>
					btn.setButtonText("Show").onClick(() => {
						const visible = guideContent.style.display !== "none";
						guideContent.style.display = visible ? "none" : "block";
						btn.setButtonText(visible ? "Show" : "Hide");
					})
				);

				// Ollama section
				guideContent.createEl("h4", { text: "Ollama (recommended)" });
				const ollamaSteps = guideContent.createEl("ol");
				ollamaSteps.createEl("li").createEl("span", {
					text: "Install: ",
				}).parentElement!.createEl("code", { text: "brew install ollama" });
				const li2 = ollamaSteps.createEl("li");
				li2.createEl("span", { text: "Pull a model: " });
				li2.createEl("code", { text: "ollama pull llama3.2" });
				const li3 = ollamaSteps.createEl("li");
				li3.createEl("span", { text: "Start server: " });
				li3.createEl("code", { text: "ollama serve" });
				ollamaSteps.createEl("li", {
					text: "Click Detect above to find available models",
				});

				const ollamaNote = guideContent.createDiv({ cls: "dd-settings-callout dd-settings-callout-info" });
				ollamaNote.createEl("p", {
					text:
						"Recommended models: llama3.2 (3B, fast), mistral (7B, balanced), " +
						"phi3 (3.8B, good for summarization). Smaller models are faster " +
						"but may produce less polished summaries.",
				});

				// LM Studio section
				guideContent.createEl("h4", { text: "LM Studio" });
				const lmSteps = guideContent.createEl("ol");
				lmSteps.createEl("li", {
					text: "Download from lmstudio.ai",
				});
				lmSteps.createEl("li", {
					text: "Download a model from the built-in browser",
				});
				const li3b = lmSteps.createEl("li");
				li3b.createEl("span", {
					text: "Start the local server (default: ",
				});
				li3b.createEl("code", { text: "http://localhost:1234" });
				li3b.appendText(")");
				lmSteps.createEl("li", {
					text: "Update the endpoint above, then click Detect",
				});

				// Other servers
				guideContent.createEl("h4", { text: "Other OpenAI-compatible servers" });
				const otherNote = guideContent.createDiv({ cls: "dd-settings-callout dd-settings-callout-info" });
				otherNote.createEl("p", {
					text:
						"Any server exposing /v1/chat/completions works: llama.cpp server, " +
						"LocalAI, vLLM, text-generation-webui with OpenAI extension, etc. " +
						"Set the endpoint URL and model name accordingly.",
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

			// ── RAG Pipeline (Advanced) ─────────────
			new Setting(containerEl)
				.setName("RAG pipeline (advanced)")
				.setHeading();

			new Setting(containerEl)
				.setName("Enable RAG chunking")
				.setDesc(
					"Split activity data into focused chunks and use embeddings " +
					"to select the most relevant context for summarization. " +
					"Improves quality with large datasets and small context models. " +
					"Requires a local model server with an embedding model."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.enableRAG)
						.onChange(async (value) => {
							this.plugin.settings.enableRAG = value;
							await this.plugin.saveSettings();
							this.display();
						})
				);

			if (this.plugin.settings.enableRAG) {
				new Setting(containerEl)
					.setName("Embedding model")
					.setDesc(
						"Model for generating embeddings (e.g. nomic-embed-text, " +
						"all-minilm, mxbai-embed-large). Must be available on your " +
						"local server."
					)
					.addText((text) =>
						text
							.setPlaceholder("nomic-embed-text")
							.setValue(this.plugin.settings.embeddingModel)
							.onChange(async (value) => {
								this.plugin.settings.embeddingModel = value;
								await this.plugin.saveSettings();
							})
					);

				new Setting(containerEl)
					.setName("Retrieved chunks (Top K)")
					.setDesc(
						"Number of most-relevant chunks to include in the AI prompt. " +
						"Higher = more context but slower. 6–10 is a good range."
					)
					.addSlider((slider) =>
						slider
							.setLimits(4, 15, 1)
							.setValue(this.plugin.settings.ragTopK)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.ragTopK = value;
								await this.plugin.saveSettings();
							})
					);

				const ragCallout = containerEl.createDiv({
					cls: "dd-settings-callout dd-settings-callout-info",
				});
				ragCallout.createEl("p", {
					text:
						"Embeddings are always generated locally using your local server " +
						"endpoint, even when Anthropic is selected for summarization. " +
						"No embedding data is sent externally.",
				});

				const ragPullHint = containerEl.createDiv({
					cls: "dd-settings-callout",
				});
				const pullP = ragPullHint.createEl("p");
				pullP.createEl("span", { text: "Pull an embedding model: " });
				pullP.createEl("code", { text: "ollama pull nomic-embed-text" });

				// Warn if Anthropic selected but no local endpoint
				if (
					this.plugin.settings.aiProvider === "anthropic" &&
					!this.plugin.settings.localEndpoint
				) {
					const warnCallout = containerEl.createDiv({
						cls: "dd-settings-callout dd-settings-callout-warn",
					});
					warnCallout.createEl("p", {
						text:
							"RAG requires a local model server for embedding generation. " +
							"Configure a local server endpoint above.",
					});
				}
			}
		}

		// ── Event Classification ─────────────────────
		if (this.plugin.settings.enableAI) {
			new Setting(containerEl)
				.setName("Event classification (advanced)")
				.setHeading();

			new Setting(containerEl)
				.setName("Enable event classification")
				.setDesc(
					"Classify raw activity events into structured abstractions " +
					"(activity type, topics, entities, intent) using a local LLM. " +
					"When Anthropic is the AI provider, only these abstractions " +
					"are sent externally — never raw URLs, queries, or commands."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.enableClassification)
						.onChange(async (value) => {
							this.plugin.settings.enableClassification = value;
							await this.plugin.saveSettings();
							this.display();
						})
				);

			if (this.plugin.settings.enableClassification) {
				new Setting(containerEl)
					.setName("Classification model")
					.setDesc(
						"Local model for event classification. Leave blank to use " +
						"the same model as AI summarization. Smaller models (3B) " +
						"work well for classification."
					)
					.addText((text) =>
						text
							.setPlaceholder("(same as AI model)")
							.setValue(this.plugin.settings.classificationModel)
							.onChange(async (value) => {
								this.plugin.settings.classificationModel = value;
								await this.plugin.saveSettings();
							})
					);

				new Setting(containerEl)
					.setName("Batch size")
					.setDesc(
						"Number of events per classification batch. " +
						"Larger batches are faster but may reduce accuracy."
					)
					.addSlider((slider) =>
						slider
							.setLimits(4, 16, 2)
							.setValue(this.plugin.settings.classificationBatchSize)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.classificationBatchSize = value;
								await this.plugin.saveSettings();
							})
					);

				const classifyCallout = containerEl.createDiv({
					cls: "dd-settings-callout",
				});
				classifyCallout.createEl("p", {
					text:
						"Classification always runs locally on your machine. " +
						"It adds ~2-5 seconds per batch but ensures only structured " +
						"abstractions (topics, entities, activity types) reach " +
						"external APIs. Raw data never leaves your machine.",
				});

				if (this.plugin.settings.aiProvider === "anthropic") {
					const privacyCallout = containerEl.createDiv({
						cls: "dd-settings-callout dd-settings-callout-info",
					});
					privacyCallout.createEl("p", {
						text:
							"With Anthropic selected: classification is highly recommended. " +
							"When enabled, the AI summary prompt contains only activity types, " +
							"topics, and entity names — zero raw URLs, search queries, " +
							"shell commands, or Claude prompts are sent to Anthropic.",
					});
				}
			}
		}

		// ── Pattern Extraction ───────────────────────
		if (this.plugin.settings.enableAI && this.plugin.settings.enableClassification) {
			new Setting(containerEl)
				.setName("Pattern extraction (advanced)")
				.setHeading();

			new Setting(containerEl)
				.setName("Enable pattern extraction")
				.setDesc(
					"Extract temporal clusters, topic co-occurrences, entity relations, " +
					"and recurrence signals from classified events. Adds focus scores, " +
					"topic maps, and knowledge delta analysis to your daily notes."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.enablePatterns)
						.onChange(async (value) => {
							this.plugin.settings.enablePatterns = value;
							await this.plugin.saveSettings();
							this.display();
						})
				);

			if (this.plugin.settings.enablePatterns) {
				new Setting(containerEl)
					.setName("Co-occurrence window")
					.setDesc(
						"Time window in minutes for detecting topic co-occurrences. " +
						"Events within the same window are considered related."
					)
					.addSlider((slider) =>
						slider
							.setLimits(10, 120, 10)
							.setValue(this.plugin.settings.patternCooccurrenceWindow)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.patternCooccurrenceWindow = value;
								await this.plugin.saveSettings();
							})
					);

				new Setting(containerEl)
					.setName("Minimum cluster size")
					.setDesc(
						"Minimum number of events to form a temporal cluster. " +
						"Lower values detect more clusters but may include noise."
					)
					.addSlider((slider) =>
						slider
							.setLimits(2, 10, 1)
							.setValue(this.plugin.settings.patternMinClusterSize)
							.setDynamicTooltip()
							.onChange(async (value) => {
								this.plugin.settings.patternMinClusterSize = value;
								await this.plugin.saveSettings();
							})
					);

				new Setting(containerEl)
					.setName("Track recurrence")
					.setDesc(
						"Persist topic history across days to detect recurring interests, " +
						"returning topics, and rising trends. Stored locally in your vault " +
						"under .daily-digest/topic-history.json."
					)
					.addToggle((toggle) =>
						toggle
							.setValue(this.plugin.settings.trackRecurrence)
							.onChange(async (value) => {
								this.plugin.settings.trackRecurrence = value;
								await this.plugin.saveSettings();
							})
					);

				const patternCallout = containerEl.createDiv({
					cls: "dd-settings-callout",
				});
				patternCallout.createEl("p", {
					text:
						"Pattern extraction is entirely local and statistical — no LLM calls. " +
						"It analyzes classified events to find activity clusters, topic connections, " +
						"and curiosity patterns. Results appear as new sections in your daily note.",
				});
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
			let models: string[] = [];

			// Use native fetch for localhost — Obsidian's requestUrl can fail
			// on app:// origins due to CORS restrictions with local servers.
			const isLocalhost =
				endpoint.includes("localhost") ||
				endpoint.includes("127.0.0.1") ||
				endpoint.includes("0.0.0.0");

			const doFetch = async (url: string): Promise<unknown> => {
				if (isLocalhost) {
					const resp = await fetch(url, {
						method: "GET",
						headers: { Accept: "application/json" },
					});
					if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
					return await resp.json();
				} else {
					const { requestUrl } = await import("obsidian");
					const resp = await requestUrl({ url, method: "GET" });
					if (resp.status !== 200) throw new Error(`HTTP ${resp.status}`);
					return resp.json;
				}
			};

			// Try Ollama-native endpoint first
			try {
				const data = (await doFetch(`${endpoint}/api/tags`)) as {
					models?: { name: string }[];
				};
				if (data?.models) {
					models = data.models.map((m) => m.name);
				}
			} catch (e1) {
				console.debug("Daily Digest: Ollama /api/tags failed:", e1);
				// Fall back to OpenAI-compatible /v1/models
				try {
					const data = (await doFetch(`${endpoint}/v1/models`)) as {
						data?: { id: string }[];
					};
					if (data?.data) {
						models = data.data.map((m) => m.id);
					}
				} catch (e2) {
					console.debug("Daily Digest: /v1/models failed:", e2);
				}
			}

			notice.hide();

			if (models.length === 0) {
				new Notice(
					`No models found at ${endpoint}. Is your local server running?\n\n` +
					`If using Ollama, you may need to set the OLLAMA_ORIGINS ` +
					`environment variable to allow Obsidian's requests:\n` +
					`OLLAMA_ORIGINS="*" ollama serve`,
					12000
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
