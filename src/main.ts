import { Notice, Plugin, TFile, TFolder, Modal, Setting, App } from "obsidian";
import { DailyDigestSettings, DailyDigestSettingTab, DEFAULT_SETTINGS } from "./settings";
import { collectBrowserHistory, readShellHistory, readClaudeSessions } from "./collectors";
import { categorizeVisits } from "./categorize";
import { summarizeDay, AICallConfig } from "./summarize";
import { renderMarkdown } from "./renderer";
import {
	OnboardingModal,
	DataPreviewModal,
	shouldShowOnboarding,
} from "./privacy";
import { RAGConfig, SanitizeConfig, SensitivityConfig, ClassificationConfig, ClassificationResult } from "./types";
import { sanitizeCollectedData } from "./sanitize";
import { classifyEvents } from "./classify";
import { filterSensitiveDomains, filterSensitiveSearches } from "./sensitivity";

class DatePickerModal extends Modal {
	onSubmit: (date: Date) => void;
	selectedDate: string;

	constructor(app: App, onSubmit: (date: Date) => void) {
		super(app);
		this.onSubmit = onSubmit;
		const now = new Date();
		this.selectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle("Generate daily note");

		new Setting(contentEl)
			.setName("Date")
			.setDesc("Select which date to compile")
			.addText((text) => {
				text.inputEl.type = "date";
				text.setValue(this.selectedDate).onChange((value) => {
					this.selectedDate = value;
				});
			});

		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("Generate")
				.setCta()
				.onClick(() => {
					this.close();
					const parts = this.selectedDate.split("-");
					const date = new Date(
						parseInt(parts[0]),
						parseInt(parts[1]) - 1,
						parseInt(parts[2])
					);
					this.onSubmit(date);
				})
		);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
	}
}

export default class DailyDigestPlugin extends Plugin {
	settings: DailyDigestSettings;
	statusBarItem: HTMLElement;

	async onload(): Promise<void> {
		await this.loadSettings();

		// Ribbon icon
		this.addRibbonIcon("calendar-clock", "Daily Digest: Generate daily note", () => {
			this.generateToday();
		});

		// Status bar
		this.statusBarItem = this.addStatusBarItem();
		this.statusBarItem.setText("Daily Digest ready");

		// Command: generate today's note
		this.addCommand({
			id: "generate-today",
			name: "Generate today's daily note",
			callback: () => this.generateToday(),
		});

		// Command: generate note for specific date
		this.addCommand({
			id: "generate-date",
			name: "Generate daily note for a specific date",
			callback: () => {
				new DatePickerModal(this.app, (date) => {
					this.generateNote(date);
				}).open();
			},
		});

		// Command: generate without AI
		this.addCommand({
			id: "generate-today-no-ai",
			name: "Generate today's daily note (no AI)",
			callback: () => this.generateToday(true),
		});

		// Settings tab
		this.addSettingTab(new DailyDigestSettingTab(this.app, this));

		// Privacy onboarding check
		if (shouldShowOnboarding(this.settings)) {
			this.app.workspace.onLayoutReady(() => {
				new OnboardingModal(
					this.app,
					this.settings,
					async (updatedSettings) => {
						this.settings = updatedSettings;
						await this.saveSettings();
					}
				).open();
			});
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	private generateToday(skipAI = false): void {
		const now = new Date();
		const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		this.generateNote(today, skipAI);
	}

	private async generateNote(targetDate: Date, skipAI = false): Promise<void> {
		// Ensure onboarding is complete
		if (shouldShowOnboarding(this.settings)) {
			new Notice("Please complete Daily Digest setup first.", 5000);
			new OnboardingModal(
				this.app,
				this.settings,
				async (updatedSettings) => {
					this.settings = updatedSettings;
					await this.saveSettings();
				}
			).open();
			return;
		}

		const since = new Date(targetDate.getTime() - this.settings.lookbackHours * 60 * 60 * 1000);
		const provider = this.settings.aiProvider;
		const apiKey = this.settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "";

		// Determine if AI is usable
		let useAI = this.settings.enableAI && !skipAI;
		if (useAI && provider === "anthropic" && !apiKey) {
			new Notice("No Anthropic API key configured. Running without AI summaries.", 8000);
			useAI = false;
		}
		if (useAI && provider === "local" && !this.settings.localModel) {
			new Notice("No local model configured. Set a model name in Daily Digest settings.", 8000);
			useAI = false;
		}

		const aiConfig: AICallConfig = {
			provider,
			anthropicApiKey: apiKey,
			anthropicModel: this.settings.aiModel,
			localEndpoint: this.settings.localEndpoint,
			localModel: this.settings.localModel,
		};

		// Build RAG config if enabled
		let ragConfig: RAGConfig | undefined;
		if (this.settings.enableRAG && useAI) {
			ragConfig = {
				enabled: true,
				embeddingEndpoint: this.settings.localEndpoint,
				embeddingModel: this.settings.embeddingModel,
				topK: this.settings.ragTopK,
				minChunkTokens: 100,
				maxChunkTokens: 1500,
			};
		}

		const progressNotice = new Notice("Daily Digest: Collecting activity data\u2026", 0);
		this.statusBarItem.setText("Daily Digest: collecting\u2026");

		// Build sanitization config
		const sanitizeConfig: SanitizeConfig = {
			enabled: this.settings.enableSanitization,
			level: this.settings.sanitizationLevel,
			excludedDomains: this.settings.excludedDomains
				.split(",")
				.map((d) => d.trim())
				.filter((d) => d),
			redactPaths: this.settings.redactPaths,
			scrubEmails: this.settings.scrubEmails,
		};

		// Build sensitivity config
		const sensitivityConfig: SensitivityConfig = {
			enabled: this.settings.enableSensitivityFilter,
			categories: this.settings.sensitivityCategories,
			customDomains: this.settings.sensitivityCustomDomains
				.split(",")
				.map((d) => d.trim())
				.filter((d) => d),
			action: this.settings.sensitivityAction,
		};

		try {
			// ── Collect ──────────────────────────
			progressNotice.setMessage("Daily Digest: Reading browser history\u2026");
			let { visits: rawVisits, searches: rawSearches } = collectBrowserHistory(this.settings, since);

			progressNotice.setMessage("Daily Digest: Reading shell history\u2026");
			const rawShellCmds = readShellHistory(this.settings, since);

			progressNotice.setMessage("Daily Digest: Reading Claude sessions\u2026");
			const rawClaudeSessions = readClaudeSessions(this.settings, since);

			// ── Sensitivity Filter ──────────────
			let sensitivityFiltered = 0;
			if (sensitivityConfig.enabled) {
				progressNotice.setMessage("Daily Digest: Applying sensitivity filter\u2026");
				const visitResult = filterSensitiveDomains(rawVisits, sensitivityConfig);
				rawVisits = visitResult.kept;
				sensitivityFiltered += visitResult.filtered;

				const searchResult = filterSensitiveSearches(rawSearches, sensitivityConfig);
				rawSearches = searchResult.kept;
				sensitivityFiltered += searchResult.filtered;

				if (sensitivityFiltered > 0) {
					const catBreakdown = Object.entries(visitResult.byCategory)
						.map(([cat, count]) => `${cat}: ${count}`)
						.join(", ");
					console.debug(
						`Daily Digest: Sensitivity filter removed ${sensitivityFiltered} items` +
						(catBreakdown ? ` (${catBreakdown})` : "")
					);
				}
			}

			// ── Sanitize ────────────────────────
			progressNotice.setMessage("Daily Digest: Sanitizing data\u2026");
			const sanitized = sanitizeCollectedData(
				rawVisits, rawSearches, rawShellCmds, rawClaudeSessions,
				sanitizeConfig
			);
			const visits = sanitized.visits;
			const searches = sanitized.searches;
			const shellCmds = sanitized.shellCommands;
			const claudeSessions = sanitized.claudeSessions;
			const excludedCount = sanitized.excludedVisitCount;

			const totalExcluded = excludedCount + sensitivityFiltered;
			if (excludedCount > 0) {
				console.debug(`Daily Digest: Excluded ${excludedCount} visits by domain filter`);
			}

			// ── Categorize ───────────────────────
			progressNotice.setMessage("Daily Digest: Categorizing activity\u2026");
			const categorized = categorizeVisits(visits);

			// ── Classify (Phase 2) ──────────────
			let classification: ClassificationResult | undefined;
			if (this.settings.enableClassification && useAI) {
				const classifyModel = this.settings.classificationModel || this.settings.localModel;
				if (classifyModel && this.settings.localEndpoint) {
					progressNotice.setMessage("Daily Digest: Classifying events (local LLM)\u2026");
					const classConfig: ClassificationConfig = {
						enabled: true,
						endpoint: this.settings.localEndpoint,
						model: classifyModel,
						batchSize: this.settings.classificationBatchSize,
					};
					try {
						classification = await classifyEvents(
							visits, searches, shellCmds, claudeSessions,
							categorized, classConfig
						);
						console.debug(
							`Daily Digest: Classified ${classification.totalProcessed} events ` +
							`(${classification.llmClassified} LLM, ${classification.ruleClassified} rule) ` +
							`in ${classification.processingTimeMs}ms`
						);
					} catch (e) {
						console.warn("Daily Digest: Classification failed, continuing without:", e);
					}
				} else {
					console.debug("Daily Digest: Classification enabled but no local model/endpoint configured");
				}
			}

			// ── AI Summary ───────────────────────
			let aiSummary = null;
			if (useAI) {
				if (provider === "anthropic") {
					// Cloud provider: show data preview for explicit consent
					progressNotice.hide();

					const result = await new DataPreviewModal(this.app, {
						visitCount: visits.length,
						searchCount: searches.length,
						shellCount: shellCmds.length,
						claudeCount: claudeSessions.length,
						excludedCount: totalExcluded,
						samples: {
							visits: visits.slice(0, 5).map((v) => ({
								text: `${v.domain || "unknown"} - ${(v.title || "").slice(0, 60) || v.url}`,
							})),
							searches: searches.slice(0, 5).map((s) => ({
								text: s.query,
							})),
							shell: shellCmds.slice(0, 5).map((c) => ({
								text: c.cmd.slice(0, 80),
							})),
							claude: claudeSessions.slice(0, 3).map((c) => ({
								text: c.prompt.slice(0, 100),
							})),
						},
					}).openAndWait();

					if (result === "cancel") {
						this.statusBarItem.setText("Daily Digest ready");
						new Notice("Daily Digest: Generation cancelled.");
						return;
					}

					if (result === "proceed-with-ai") {
						const aiNotice = new Notice(
							classification
								? "Daily Digest: Summarizing classified abstractions (Anthropic)\u2026"
								: ragConfig?.enabled
									? "Daily Digest: Chunking, embedding & summarizing (Anthropic)\u2026"
									: "Daily Digest: Generating AI summary (Anthropic)\u2026",
							0
						);
						aiSummary = await summarizeDay(
							targetDate, categorized, searches, shellCmds,
							claudeSessions, aiConfig, this.settings.profile,
							ragConfig, classification
						);
						aiNotice.hide();
					} else {
						useAI = false;
					}
				} else {
					// Local provider: no consent needed, data stays on machine
					progressNotice.setMessage(
						ragConfig?.enabled
							? "Daily Digest: Chunking, embedding & summarizing (local)\u2026"
							: "Daily Digest: Generating AI summary (local)\u2026"
					);
					aiSummary = await summarizeDay(
						targetDate, categorized, searches, shellCmds,
						claudeSessions, aiConfig, this.settings.profile,
						ragConfig, classification
					);
				}
			}

			progressNotice.hide();

			// ── Render ───────────────────────────
			const renderNotice = new Notice("Daily Digest: Rendering markdown\u2026", 0);
			const aiProviderUsed = useAI && aiSummary !== null ? provider : "none";
			const md = renderMarkdown(
				targetDate,
				visits,
				searches,
				shellCmds,
				claudeSessions,
				categorized,
				aiSummary,
				aiProviderUsed
			);

			// ── Write to vault ───────────────────
			renderNotice.setMessage("Daily Digest: Writing to vault\u2026");
			const filePath = await this.writeToVault(targetDate, md);

			renderNotice.hide();
			this.statusBarItem.setText("Daily Digest ready");

			const stats = `${visits.length} visits, ${searches.length} searches, ${shellCmds.length} commands, ${claudeSessions.length} prompts`;
			new Notice(`Daily Digest: Daily note created!\n${stats}`, 6000);

			// Open the file
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				await this.app.workspace.getLeaf(false).openFile(file);
			}
		} catch (e) {
			new Notice(`Daily Digest error: ${e}`, 10000);
			this.statusBarItem.setText("Daily Digest: error");
			console.error("Daily Digest error:", e);
		}
	}

	private async writeToVault(date: Date, content: string): Promise<string> {
		// Build the file path
		const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
		const template = this.settings.filenameTemplate || "YYYY-MM-DD";
		const filename =
			template
				.replace("YYYY", String(date.getFullYear()))
				.replace("MM", String(date.getMonth() + 1).padStart(2, "0"))
				.replace("DD", String(date.getDate()).padStart(2, "0")) + ".md";

		const folder = this.settings.dailyFolder;
		const filePath = folder ? `${folder}/${filename}` : filename;

		// Ensure folder exists
		if (folder) {
			const folderObj = this.app.vault.getAbstractFileByPath(folder);
			if (!folderObj) {
				await this.app.vault.createFolder(folder);
			}
		}

		// Write or overwrite
		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile) {
			await this.app.vault.modify(existing, content);
		} else {
			await this.app.vault.create(filePath, content);
		}

		return filePath;
	}
}
