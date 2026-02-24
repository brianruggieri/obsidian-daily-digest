import { App, Notice, PluginSettingTab, Setting, setIcon, ToggleComponent } from "obsidian";
import type DailyDigestPlugin from "./main";
import { PRIVACY_DESCRIPTIONS } from "./privacy";
import { BrowserInstallConfig, SanitizationLevel, SensitivityCategory } from "./types";
import { getCategoryInfo, getTotalBuiltinDomains } from "./sensitivity";
import { detectAllBrowsers, mergeDetectedWithExisting, BROWSER_DISPLAY_NAMES } from "./browser-profiles";
import * as log from "./log";

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
	enableShell: boolean;
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
	enableShell: false,
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

// Browser display names are imported from browser-profiles.ts (BROWSER_DISPLAY_NAMES)

export class DailyDigestSettingTab extends PluginSettingTab {
	plugin: DailyDigestPlugin;

	constructor(app: App, plugin: DailyDigestPlugin) {
		super(app, plugin);
		this.plugin = plugin;
		this.icon = "calendar-days";
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		// ━━ 1. General ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		const generalHeading = new Setting(containerEl).setName("General").setHeading();
		this.prependIcon(generalHeading.nameEl, "settings");

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
			.setDesc("Date format for filenames (supports YYYY, MM, DD tokens, e.g. YYYY-MM-DD)")
			.addText((text) =>
				text
					.setPlaceholder("YYYY-MM-DD")
					.setValue(this.plugin.settings.filenameTemplate)
					.onChange(async (value) => {
						this.plugin.settings.filenameTemplate = value;
						await this.plugin.saveSettings();
					})
			);

		// ━━ 2. Data Sources ━━━━━━━━━━━━━━━━━━━━━━━━━
		const dataHeading = new Setting(containerEl).setName("Data sources").setHeading();
		this.prependIcon(dataHeading.nameEl, "database");

		new Setting(containerEl)
			.setName("Prompt detail budget")
			.setDesc(
				"Target token budget for the data section of AI prompts. " +
				"Higher values include more detail but use more context. " +
				"Activity is compressed proportionally to fit."
			)
			.addSlider((slider) =>
				slider
					.setLimits(1000, 8000, 500)
					.setValue(this.plugin.settings.promptBudget)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.promptBudget = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Browser ──────────────────────────────────
		const browserGroup = containerEl.createDiv({ cls: "dd-source-group" });
		new Setting(browserGroup)
			.setName("Browser history")
			.setDesc(PRIVACY_DESCRIPTIONS.browser.access + " " + PRIVACY_DESCRIPTIONS.browser.destination)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableBrowser)
					.onChange(async (value) => {
						this.plugin.settings.enableBrowser = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);
		if (this.plugin.settings.enableBrowser) {
			this.renderBrowserProfileSection(browserGroup);
		}

		// ── Shell ─────────────────────────────────────
		const shellGroup = containerEl.createDiv({ cls: "dd-source-group" });
		new Setting(shellGroup)
			.setName("Shell history")
			.setDesc(PRIVACY_DESCRIPTIONS.shell.access + " " + PRIVACY_DESCRIPTIONS.shell.destination)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableShell)
					.onChange(async (value) => {
						this.plugin.settings.enableShell = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// ── Claude ────────────────────────────────────
		const claudeGroup = containerEl.createDiv({ cls: "dd-source-group" });
		new Setting(claudeGroup)
			.setName("Claude Code sessions")
			.setDesc(PRIVACY_DESCRIPTIONS.claude.access + " " + PRIVACY_DESCRIPTIONS.claude.destination)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableClaude)
					.onChange(async (value) => {
						this.plugin.settings.enableClaude = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);
		if (this.plugin.settings.enableClaude) {
			new Setting(claudeGroup)
				.setName("Sessions directory")
				.setDesc("Path to Claude Code session logs (uses ~ for home)")
				.addText((text) =>
					text
						.setPlaceholder("~/.claude/projects")
						.setValue(this.plugin.settings.claudeSessionsDir)
						.onChange(async (value) => {
							this.plugin.settings.claudeSessionsDir = value;
							await this.plugin.saveSettings();
						})
				);
		}

		// ── Codex ─────────────────────────────────────
		const codexGroup = containerEl.createDiv({ cls: "dd-source-group" });
		new Setting(codexGroup)
			.setName("Codex CLI sessions")
			.setDesc(PRIVACY_DESCRIPTIONS.codex.access + " " + PRIVACY_DESCRIPTIONS.codex.destination)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableCodex)
					.onChange(async (value) => {
						this.plugin.settings.enableCodex = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);
		if (this.plugin.settings.enableCodex) {
			new Setting(codexGroup)
				.setName("Sessions directory")
				.setDesc("Path to Codex CLI session logs. No API key required — reads local files only.")
				.addText((text) =>
					text
						.setPlaceholder("~/.codex/sessions")
						.setValue(this.plugin.settings.codexSessionsDir)
						.onChange(async (value) => {
							this.plugin.settings.codexSessionsDir = value;
							await this.plugin.saveSettings();
						})
				);
		}

		// ── Git ───────────────────────────────────────
		const gitGroup = containerEl.createDiv({ cls: "dd-source-group" });
		new Setting(gitGroup)
			.setName("Git commit history")
			.setDesc(PRIVACY_DESCRIPTIONS.git.access + " " + PRIVACY_DESCRIPTIONS.git.destination)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.enableGit)
					.onChange(async (value) => {
						this.plugin.settings.enableGit = value;
						await this.plugin.saveSettings();
						this.display();
					})
			);
		if (this.plugin.settings.enableGit) {
			new Setting(gitGroup)
				.setName("Git parent directory")
				.setDesc(
					"Parent directory containing your git repositories. " +
					"The plugin scans one level deep for .git directories. " +
					"Uses ~ for home directory (e.g. ~/git or ~/projects)."
				)
				.addText((text) =>
					text
						.setPlaceholder("~/git")
						.setValue(this.plugin.settings.gitParentDir)
						.onChange(async (value) => {
							this.plugin.settings.gitParentDir = value;
							await this.plugin.saveSettings();
						})
				);
		}

		// ━━ 3. Privacy & Filtering ━━━━━━━━━━━━━━━━━━
		const privacyHeading = new Setting(containerEl).setName("Privacy & filtering").setHeading();
		this.prependIcon(privacyHeading.nameEl, "shield");

		// Status callouts (informational banners)
		const enabledSources: string[] = [];
		if (this.plugin.settings.enableBrowser) enabledSources.push("browser history databases");
		if (this.plugin.settings.enableShell) enabledSources.push("shell history files");
		if (this.plugin.settings.enableClaude) enabledSources.push("Claude Code sessions");
		if (this.plugin.settings.enableCodex) enabledSources.push("Codex CLI sessions");
		if (this.plugin.settings.enableGit) enabledSources.push("git commit history");

		const accessCallout = containerEl.createDiv({ cls: "dd-settings-callout" });
		if (enabledSources.length > 0) {
			accessCallout.createEl("p", {
				text: `Currently accessing: ${enabledSources.join(", ")}.`,
			});
		} else {
			accessCallout.createEl("p", {
				text: "No external data sources are currently enabled. Enable sources above to collect activity data.",
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

		// ── Sanitization ──────────────────────────────
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
					"Always-exclude list using simple pattern matching. A pattern like " +
					"'mybank' matches any domain containing that text (mybank.com, " +
					"us.mybank.com, etc). For exact domain matching or path-based " +
					"filtering, use Custom Sensitive Domains in the Sensitivity filter " +
					"section instead."
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

		// ── Sensitivity filter ────────────────────────
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
					"Additional domains to filter using exact matching. " +
					"Subdomains are matched automatically (adding example.com also " +
					"matches sub.example.com). Supports path prefixes " +
					"(e.g. reddit.com/r/subreddit). These domains follow the " +
					"filter action setting above (exclude or redact)."
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

		// ── Reset onboarding ──────────────────────────
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

		new Setting(containerEl)
			.setName("Debug mode")
			.setDesc("Enables the 'Inspect pipeline stage' command for per-stage data inspection. For development use only.")
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugMode)
				.onChange(async (value) => {
					this.plugin.settings.debugMode = value;
					await this.plugin.saveSettings();
				}));

		// ━━ 4. AI Summarization ━━━━━━━━━━━━━━━━━━━━━━
		const aiHeading = new Setting(containerEl).setName("AI summarization").setHeading();
		this.prependIcon(aiHeading.nameEl, "sparkles");

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
				const currentKey = this.plugin.app.secretStorage.getSecret(SECRET_ID) ?? "";

				new Setting(containerEl)
					.setName("Anthropic API key")
					.setDesc(
						"Your Anthropic API key. Stored securely in Obsidian's secret " +
						"storage — not in data.json, not synced with your vault. " +
						"Alternative: set the ANTHROPIC_API_KEY environment variable instead."
					)
					.addText((text) => {
						text.inputEl.type = "password";
						text.setPlaceholder("sk-ant-...")
							.setValue(currentKey)
							.onChange((value) => {
								this.plugin.app.secretStorage.setSecret(SECRET_ID, value);
							});
					});

				const apiKeyNote = containerEl.createDiv({
					cls: "dd-settings-callout dd-settings-callout-info",
				});
				apiKeyNote.createEl("p", {
					text:
						"This key is stored in Obsidian's secure secret storage, separate " +
						"from your vault files. It will not be synced or committed to git.",
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

			new Setting(containerEl)
				.setName("Prompt templates directory")
				.setDesc("Path to a directory containing standard.txt, rag.txt, etc. Leave empty to use built-in prompts.")
				.addText((text) =>
					text
						.setPlaceholder("e.g. ~/prompts/daily-digest")
						.setValue(this.plugin.settings.promptsDir)
						.onChange(async (value) => {
							this.plugin.settings.promptsDir = value;
							await this.plugin.saveSettings();
						})
				);

			// ── Advanced AI processing ───────────────
			const advAiHeading = new Setting(containerEl)
				.setName("Advanced AI processing")
				.setHeading();
			this.prependIcon(advAiHeading.nameEl, "cpu");

			// RAG pipeline
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

			// Event classification
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
							"shell commands, or Claude Code prompts are sent to Anthropic.",
					});
				}

				// Pattern extraction (requires classification)
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
		} else {
			const depCallout = containerEl.createDiv({
				cls: "dd-settings-callout",
			});
			depCallout.createEl("p", {
				text:
					"Pattern extraction and knowledge delta analysis require " +
					"event classification to be enabled. Enable classification " +
					"above to unlock these features.",
			});
		}

	}

	/** Prepend a Lucide icon before the text content of a heading element. */
	private prependIcon(el: HTMLElement, iconId: string): void {
		const span = createSpan({ cls: "dd-heading-icon" });
		setIcon(span, iconId);
		el.prepend(span);
	}

	private async detectLocalModels(_containerEl: HTMLElement): Promise<void> {
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
				log.debug("Daily Digest: Ollama /api/tags failed:", e1);
				// Fall back to OpenAI-compatible /v1/models
				try {
					const data = (await doFetch(`${endpoint}/v1/models`)) as {
						data?: { id: string }[];
					};
					if (data?.data) {
						models = data.data.map((m) => m.id);
					}
				} catch (e2) {
					log.debug("Daily Digest: /v1/models failed:", e2);
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

	// ── Browser Profile UI ───────────────────────────────

	/**
	 * Renders the browser profile picker section inside the Data Sources area.
	 * Called conditionally when enableBrowser is true.
	 *
	 * Layout:
	 *   Privacy note
	 *   [Detect Browsers & Profiles] button
	 *   Status line (N browsers · M profiles selected)
	 *   Per-browser toggles with indented per-profile sub-toggles
	 */
	private renderBrowserProfileSection(containerEl: HTMLElement): void {
		const privacyNote = containerEl.createDiv({ cls: "dd-settings-callout dd-settings-callout-info" });
		privacyNote.createEl("p", {
			text:
				"Scanning reads only browser History files. Profile names are read from " +
				"browser configuration — passwords, cookies, and payment data are never accessed.",
		});

		const configs = this.plugin.settings.browserConfigs;

		new Setting(containerEl)
			.setName("Browser & profile detection")
			.setDesc(
				configs.length === 0
					? "Scan your system to find installed browsers and their profiles. " +
					  "Nothing is read until you enable a profile and generate a note."
					: this.buildBrowserStatusLine(configs)
			)
			.addButton((btn) =>
				btn
					.setButtonText(configs.length === 0 ? "Detect Browsers & Profiles" : "Re-scan")
					.setCta()
					.onClick(() => this.detectBrowserProfiles())
			);

		if (configs.length === 0) {
			const hint = containerEl.createDiv({ cls: "dd-settings-callout" });
			hint.createEl("p", { text: "Click 'Detect Browsers & Profiles' to scan for installed browsers." });
			return;
		}

		for (const config of configs) {
			const displayName = BROWSER_DISPLAY_NAMES[config.browserId] ?? config.browserId;
			const profileWord = config.profiles.length !== 1 ? "profiles" : "profile";

			let browserDesc = `${config.profiles.length} ${profileWord} found`;
			if (config.browserId === "safari") {
				browserDesc += " · macOS Full Disk Access may be required";
			}

			new Setting(containerEl)
				.setName(displayName)
				.setDesc(browserDesc)
				.addToggle((toggle) =>
					toggle
						.setValue(config.enabled)
						.onChange(async (value) => {
							config.enabled = value;
							await this.plugin.saveSettings();
							this.display();
						})
				);

			if (config.enabled && config.profiles.length > 0) {
				const profileList = containerEl.createDiv({ cls: "dd-profile-list" });

				for (const profile of config.profiles) {
					const row = profileList.createDiv({ cls: "dd-profile-row" });

					row.createSpan({ cls: "dd-profile-name", text: profile.displayName });

					if (profile.profileDir !== profile.displayName) {
						row.createSpan({ cls: "dd-profile-path", text: profile.profileDir });
					}

					const profileToggle = new ToggleComponent(row);
					profileToggle.toggleEl.setAttr("aria-label", `Enable ${profile.displayName} profile`);
					profileToggle
						.setValue(config.selectedProfiles.includes(profile.profileDir))
						.onChange(async (value) => {
							const selected = new Set(config.selectedProfiles);
							if (value) {
								selected.add(profile.profileDir);
							} else {
								selected.delete(profile.profileDir);
							}
							config.selectedProfiles = [...selected];
							await this.plugin.saveSettings();
						});
				}
			}
		}

		const anyEnabledWithNoProfiles = configs.some(
			(c) => c.enabled && c.selectedProfiles.length === 0
		);
		if (anyEnabledWithNoProfiles) {
			const warnEl = containerEl.createDiv({ cls: "dd-settings-callout dd-settings-callout-warn" });
			warnEl.createEl("p", {
				text:
					"One or more browsers are enabled but have no profiles selected. " +
					"Toggle on at least one profile per browser to collect history.",
			});
		}
	}

	/** Summary line shown under the Re-scan button once detection has run. */
	private buildBrowserStatusLine(configs: BrowserInstallConfig[]): string {
		const enabledCount = configs.filter((c) => c.enabled).length;
		const selectedCount = configs.reduce((n, c) => n + c.selectedProfiles.length, 0);
		const totalProfiles = configs.reduce((n, c) => n + c.profiles.length, 0);

		if (enabledCount === 0) {
			const b = configs.length;
			return `${b} browser${b !== 1 ? "s" : ""} detected · none enabled`;
		}
		const b = enabledCount;
		const p = totalProfiles;
		return (
			`${b} browser${b !== 1 ? "s" : ""} enabled · ` +
			`${selectedCount} of ${p} profile${p !== 1 ? "s" : ""} selected`
		);
	}

	/**
	 * Runs a filesystem scan for installed browsers and profiles.
	 * Merges results with existing settings so the user's choices are preserved.
	 */
	private async detectBrowserProfiles(): Promise<void> {
		const notice = new Notice("Scanning for browser profiles\u2026", 0);
		try {
			const detected = await detectAllBrowsers();
			notice.hide();

			if (detected.length === 0) {
				new Notice(
					"No browser profiles found.\n\n" +
					"Make sure your browser has been opened at least once and that " +
					"Obsidian has permission to read your files.",
					10000
				);
				return;
			}

			this.plugin.settings.browserConfigs = mergeDetectedWithExisting(
				detected,
				this.plugin.settings.browserConfigs
			);
			await this.plugin.saveSettings();

			const totalProfiles = this.plugin.settings.browserConfigs
				.reduce((n, b) => n + b.profiles.length, 0);
			const bCount = detected.length;
			new Notice(
				`Found ${bCount} browser${bCount !== 1 ? "s" : ""} · ` +
				`${totalProfiles} profile${totalProfiles !== 1 ? "s" : ""}. ` +
				"Enable the profiles you want to include.",
				7000
			);
			this.display();
		} catch (e) {
			notice.hide();
			new Notice(
				`Browser detection failed: ${e instanceof Error ? e.message : String(e)}`,
				8000
			);
		}
	}
}
