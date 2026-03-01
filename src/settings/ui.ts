import { App, Notice, PluginSettingTab, Setting, setIcon, ToggleComponent } from "obsidian";
import type DailyDigestPlugin from "../plugin/main";
import { PRIVACY_DESCRIPTIONS } from "../plugin/privacy";
import { BrowserInstallConfig, SensitivityCategory } from "../types";
import { getCategoryInfo, getTotalBuiltinDomains } from "../filter/sensitivity";
import { detectAllBrowsers, mergeDetectedWithExisting, BROWSER_DISPLAY_NAMES } from "../collect/browser-profiles";
import * as log from "../plugin/log";
import { AIProvider, SECRET_ID, SensitivityPreset } from "./types";

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

		new Setting(containerEl)
			.setName("Unified timeline")
			.setDesc("Render a cross-source chronological timeline in the daily note")
			.addToggle((toggle: ToggleComponent) =>
				toggle
					.setValue(this.plugin.settings.enableTimeline)
					.onChange(async (value) => {
						this.plugin.settings.enableTimeline = value;
						await this.plugin.saveSettings();
					})
			);

		// ━━ 2. Data Sources ━━━━━━━━━━━━━━━━━━━━━━━━━
		const dataHeading = new Setting(containerEl).setName("Data sources").setHeading();
		this.prependIcon(dataHeading.nameEl, "database");

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

		new Setting(containerEl)
			.setName("Max visits per domain")
			.setDesc("Maximum unique page visits shown per domain in the daily note.")
			.addSlider((slider) =>
				slider
					.setLimits(1, 20, 1)
					.setValue(this.plugin.settings.maxVisitsPerDomain)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.maxVisitsPerDomain = value;
						await this.plugin.saveSettings();
					})
			);

		// ━━ 3. Privacy ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		const privacyHeading = new Setting(containerEl).setName("Privacy").setHeading();
		this.prependIcon(privacyHeading.nameEl, "shield");

		// Status callouts (informational banners)
		const enabledSources: string[] = [];
		if (this.plugin.settings.enableBrowser) enabledSources.push("browser history");
		if (this.plugin.settings.enableClaude) enabledSources.push("Claude Code sessions");
		if (this.plugin.settings.enableCodex) enabledSources.push("Codex CLI sessions");
		if (this.plugin.settings.enableGit) enabledSources.push("git commit history");

		const transmitCallout = containerEl.createDiv({
			cls: "dd-settings-callout " +
				(this.plugin.settings.enableAI && this.plugin.settings.aiProvider === "anthropic"
					? "dd-settings-callout-warn" : ""),
		});
		if (!this.plugin.settings.enableAI) {
			transmitCallout.createEl("p", {
				text:
					"All data stays on your computer. Sanitization is always active " +
					"(API keys, tokens, passwords, emails, IPs, and home paths are scrubbed; " +
					"URLs are reduced to protocol + domain + path).",
			});
		} else if (this.plugin.settings.aiProvider === "local") {
			transmitCallout.createEl("p", {
				text:
					"All data stays on your computer (local AI model). " +
					"Sanitization is always active.",
			});
		} else {
			transmitCallout.createEl("p", {
				text:
					"Sanitized data will be sent to api.anthropic.com when generating a note. " +
					"Sanitization is always active (API keys, tokens, passwords, emails, IPs, " +
					"and home paths are scrubbed; URLs reduced to domain + path).",
			});
		}

		// ── Sensitivity preset dropdown (Step 2) ─────
		const RECOMMENDED_CATS: SensitivityCategory[] = ["adult", "gambling", "dating", "health", "drugs"];
		const ALL_CATS: SensitivityCategory[] = [
			"adult", "gambling", "dating", "health", "drugs",
			"finance", "weapons", "piracy", "vpn_proxy", "job_search", "social_personal",
		];

		// Derive dropdown value from existing settings
		const deriveSensitivityPreset = (): SensitivityPreset => {
			if (!this.plugin.settings.enableSensitivityFilter) return "off";
			const cats = [...this.plugin.settings.sensitivityCategories].sort();
			const recSorted = [...RECOMMENDED_CATS].sort();
			const allSorted = [...ALL_CATS].sort();
			if (cats.length === recSorted.length && cats.every((c, i) => c === recSorted[i])) return "recommended";
			if (cats.length === allSorted.length && cats.every((c, i) => c === allSorted[i])) return "strict";
			return "custom";
		};

		const currentPreset = deriveSensitivityPreset();
		// Sync derived value to settings on load
		this.plugin.settings.sensitivityPreset = currentPreset;

		const totalDomains = getTotalBuiltinDomains();

		new Setting(containerEl)
			.setName("Sensitivity filter")
			.setDesc(
				`Filter visits to sensitive domains (${totalDomains} built-in across 11 categories). ` +
				`Prevents embarrassing or private domains from appearing in your daily notes.`
			)
			.addDropdown((dropdown) =>
				dropdown
					.addOption("off", "Off")
					.addOption("recommended", "Recommended (5 categories)")
					.addOption("strict", "Strict (all 11 categories)")
					.addOption("custom", "Custom")
					.setValue(currentPreset)
					.onChange(async (value) => {
						const preset = value as SensitivityPreset;
						this.plugin.settings.sensitivityPreset = preset;
						if (preset === "off") {
							this.plugin.settings.enableSensitivityFilter = false;
						} else if (preset === "recommended") {
							this.plugin.settings.enableSensitivityFilter = true;
							this.plugin.settings.sensitivityCategories = [...RECOMMENDED_CATS];
						} else if (preset === "strict") {
							this.plugin.settings.enableSensitivityFilter = true;
							this.plugin.settings.sensitivityCategories = [...ALL_CATS];
						} else {
							// custom — keep current categories, ensure filter is on
							this.plugin.settings.enableSensitivityFilter = true;
						}
						await this.plugin.saveSettings();
						this.display();
					})
			);

		// Show custom domains when filter is active
		if (this.plugin.settings.enableSensitivityFilter) {
			new Setting(containerEl)
				.setName("Custom sensitive domains")
				.setDesc(
					"Additional domains to filter. Subdomains match automatically " +
					"(example.com also matches sub.example.com). Supports path prefixes."
				)
				.addTextArea((text) => {
					text.inputEl.rows = 2;
					text.inputEl.cols = 40;
					text.setPlaceholder("example.com, reddit.com/r/mysubreddit")
						.setValue(this.plugin.settings.sensitivityCustomDomains)
						.onChange(async (value) => {
							this.plugin.settings.sensitivityCustomDomains = value;
							await this.plugin.saveSettings();
						});
				});
		}

		// Show individual category toggles only in "custom" mode
		if (currentPreset === "custom") {
			const catInfo = getCategoryInfo();
			const enabledCats = new Set(this.plugin.settings.sensitivityCategories);

			const catContainer = containerEl.createDiv({ cls: "dd-sensitivity-categories" });
			new Setting(catContainer)
				.setName("Categories")
				.setDesc(
					`${enabledCats.size} of ${Object.keys(catInfo).length - 1} categories enabled.`
				);

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
		}

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
						"Model name to use (e.g. qwen2.5:14b-instruct, llama3.2). " +
						"Click Detect to query your server for available models."
					)
					.addText((text) =>
						text
							.setPlaceholder("qwen2.5:14b-instruct")
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
				li2.createEl("code", { text: "ollama pull qwen2.5:7b-instruct" });
				const li3 = ollamaSteps.createEl("li");
				li3.createEl("span", { text: "Start server: " });
				li3.createEl("code", { text: "ollama serve" });
				ollamaSteps.createEl("li", {
					text: "Click Detect above to find available models",
				});

				const ollamaNote = guideContent.createDiv({ cls: "dd-settings-callout dd-settings-callout-info" });
				ollamaNote.createEl("p", {
					text:
						"Recommended: qwen2.5:7b-instruct (7B, best JSON output), " +
						"qwen2.5:14b-instruct (14B, higher quality summaries). " +
						"The Qwen2.5 family excels at structured JSON output. " +
						"Smaller models are faster but may produce less polished summaries.",
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

				// ── Privacy tier (Anthropic only) ────
				new Setting(containerEl)
					.setName("Privacy tier")
					.setDesc(
						"Controls what data is sent to Anthropic. Higher tiers send less data. " +
						"Auto selects the highest tier supported by your enabled features."
					)
					.addDropdown((dropdown) =>
						dropdown
							.addOption("null", "Auto (highest available)")
							.addOption("4", "Tier 4 — Statistics only (most private)")
							.addOption("3", "Tier 3 — Classified abstractions (no raw data)")
							.addOption("2", "Tier 2 — Budget-compressed activity")
							.addOption("1", "Tier 1 — Full sanitized data (least private)")
							.setValue(String(this.plugin.settings.privacyTier ?? "null"))
							.onChange(async (value) => {
								const tier = value === "null" ? null : (Number(value) as 4 | 3 | 2 | 1);
								this.plugin.settings.privacyTier = tier;
								// Auto-enable classification for Tier 3 (requires abstractions).
								// Tier 4 uses aggregated statistics only — classification not required.
								if (tier === 3 && !this.plugin.settings.enableClassification) {
									this.plugin.settings.enableClassification = true;
								}
								await this.plugin.saveSettings();
								this.display();
							})
					);

				// Tier description callout
				const tierValue = this.plugin.settings.privacyTier;
				const tierDescriptions: Record<string, string> = {
					"null": "Auto mode selects the most private tier your data supports. " +
						"Pattern extraction always runs, so Auto resolves to Tier 4 (statistics only). " +
						"Select Tier 3 explicitly to send classification abstractions instead.",
					"4": "Only aggregated statistics (visit counts, category distributions, time patterns) " +
						"are sent. No domains, titles, URLs, or queries reach Anthropic.",
					"3": "Per-event classified abstractions (activity type, topics, entities) are sent. " +
						"Requires event classification. No raw URLs, search queries, or commands.",
					"2": "Budget-compressed activity data is sent: domain names, page titles, and queries " +
						"proportionally compressed to fit the prompt budget.",
					"1": "Full sanitized data arrays are sent: all visits, search queries, Claude sessions, " +
						"and git commits (after secret scrubbing and path redaction).",
				};
				const tierKey = String(tierValue ?? "null");
				const tierCallout = containerEl.createDiv({
					cls: "dd-settings-callout " +
						(tierValue !== null && tierValue <= 2 ? "dd-settings-callout-warn" : "dd-settings-callout-info"),
				});
				tierCallout.createEl("p", {
					text: tierDescriptions[tierKey] ?? "",
				});
			}

			// Prompt detail budget (moved here from Data Sources — only relevant for AI)
			new Setting(containerEl)
				.setName("Prompt detail budget")
				.setDesc(
					"Target token budget for the data section of AI prompts. " +
					"Higher values include more detail but consume more context window."
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
		}

		// ━━ 5. Advanced ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
		const advHeading = new Setting(containerEl).setName("Advanced").setHeading();
		this.prependIcon(advHeading.nameEl, "sliders-horizontal");

		const advContent = containerEl.createDiv({ cls: "dd-advanced-section" });
		advContent.style.display = "none";

		const advToggle = new Setting(containerEl)
			.setDesc("Fine-tune filtering, classification, pattern extraction, and other power-user settings.")
			.addButton((btn) =>
				btn.setButtonText("Show advanced settings").onClick(() => {
					const visible = advContent.style.display !== "none";
					advContent.style.display = visible ? "none" : "block";
					btn.setButtonText(visible ? "Show advanced settings" : "Hide advanced settings");
				})
			);
		// Move the toggle button before the content div
		containerEl.insertBefore(advToggle.settingEl, advContent);

		// ── Excluded domains ─────────────────────────
		new Setting(advContent)
			.setName("Excluded domains")
			.setDesc(
				"Always-exclude list using simple pattern matching. A pattern like 'mybank' " +
				"matches any domain containing that text (mybank.com, us.mybank.com, etc.)."
			)
			.addText((text) =>
				text
					.setPlaceholder("e.g. mybank, internal.corp")
					.setValue(this.plugin.settings.excludedDomains)
					.onChange(async (value) => {
						this.plugin.settings.excludedDomains = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Sensitivity action ───────────────────────
		if (this.plugin.settings.enableSensitivityFilter) {
			new Setting(advContent)
				.setName("Sensitivity filter action")
				.setDesc(
					"Exclude: remove matching visits entirely. " +
					"Redact: keep the visit but replace URL and title with a category label."
				)
				.addDropdown((dropdown) =>
					dropdown
						.addOption("exclude", "Exclude (remove entirely)")
						.addOption("redact", "Redact (replace with label)")
						.setValue(this.plugin.settings.sensitivityAction)
						.onChange(async (value) => {
							this.plugin.settings.sensitivityAction = value as "exclude" | "redact";
							await this.plugin.saveSettings();
						})
				);
		}

		// ── Event classification ─────────────────────
		if (this.plugin.settings.enableAI) {
			new Setting(advContent)
				.setName("Enable event classification")
				.setDesc(
					"Classify raw activity events into structured abstractions " +
					"(activity type, topics, entities, intent) using a local LLM. " +
					"Required for Privacy Tier 3. When Anthropic is the provider, " +
					"only abstractions are sent externally."
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.enableClassification)
						.onChange(async (value) => {
							this.plugin.settings.enableClassification = value;
							// Disabling classification while Tier 3 is selected would
							// produce a prompt expecting abstractions with none available.
							// Downgrade to Auto (which resolves to Tier 4).
							if (!value && this.plugin.settings.privacyTier === 3) {
								this.plugin.settings.privacyTier = null;
							}
							await this.plugin.saveSettings();
							this.display();
						})
				);

			if (this.plugin.settings.enableClassification) {
				new Setting(advContent)
					.setName("Classification model")
					.setDesc(
						"Local model for event classification. Leave blank to use " +
						"the same model as AI summarization."
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

				new Setting(advContent)
					.setName("Classification batch size")
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

				const classifyCallout = advContent.createDiv({
					cls: "dd-settings-callout",
				});
				classifyCallout.createEl("p", {
					text:
						"Classification always runs locally on your machine. " +
						"It adds ~2-5 seconds per batch but ensures only structured " +
						"abstractions reach external APIs.",
				});
			}

			// ── RAG pipeline ─────────────────────────
			new Setting(advContent)
				.setName("Enable RAG chunking")
				.setDesc(
					"Split activity data into focused chunks and use embeddings " +
					"to select the most relevant context for summarization. " +
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
				new Setting(advContent)
					.setName("Embedding model")
					.setDesc(
						"Model for generating embeddings (e.g. nomic-embed-text). " +
						"Must be available on your local server."
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

				new Setting(advContent)
					.setName("Retrieved chunks (Top K)")
					.setDesc(
						"Number of most-relevant chunks to include in the AI prompt. " +
						"Higher = more context but slower. 6-10 is a good range."
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

				const ragCallout = advContent.createDiv({
					cls: "dd-settings-callout dd-settings-callout-info",
				});
				ragCallout.createEl("p", {
					text:
						"Embeddings are always generated locally, even when Anthropic " +
						"is the summarization provider. No embedding data is sent externally.",
				});
			}

			// ── Prompt templates ─────────────────────
			new Setting(advContent)
				.setName("Prompt templates directory")
				.setDesc("Path to custom prompt templates (standard.txt, rag.txt, etc.). Leave empty for built-in prompts.")
				.addText((text) =>
					text
						.setPlaceholder("e.g. ~/prompts/daily-digest")
						.setValue(this.plugin.settings.promptsDir)
						.onChange(async (value) => {
							this.plugin.settings.promptsDir = value;
							await this.plugin.saveSettings();
						})
				);
		}

		// ── Pattern extraction (always runs — free, on-device, no LLM) ──
		const patternLabel = new Setting(advContent)
			.setName("Pattern extraction")
			.setDesc(
				"Pattern extraction always runs — it is entirely local and statistical " +
				"(no LLM calls). These settings tune cluster detection and recurrence tracking."
			);
		patternLabel.settingEl.addClass("dd-subsection-label");

		new Setting(advContent)
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

		new Setting(advContent)
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

		new Setting(advContent)
			.setName("Track recurrence")
			.setDesc(
				"Persist topic history across days to detect recurring interests " +
				"and rising trends. Stored in .daily-digest/topic-history.json."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.trackRecurrence)
					.onChange(async (value) => {
						this.plugin.settings.trackRecurrence = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Debug mode ───────────────────────────────
		new Setting(advContent)
			.setName("Debug mode")
			.setDesc(
				"Enables the 'Inspect pipeline stage' command for per-stage data inspection. " +
				"For development use only."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.debugMode)
					.onChange(async (value) => {
						this.plugin.settings.debugMode = value;
						await this.plugin.saveSettings();
					})
			);

		// ── Reset onboarding ─────────────────────────
		new Setting(advContent)
			.setName("Reset privacy onboarding")
			.setDesc("Re-show the first-run privacy disclosure modal on next settings open.")
			.addButton((btn) =>
				btn.setButtonText("Reset").onClick(async () => {
					this.plugin.settings.hasCompletedOnboarding = false;
					this.plugin.settings.privacyConsentVersion = 0;
					await this.plugin.saveSettings();
					new Notice("Privacy onboarding will re-appear next time you open settings.");
				})
			);
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
