import { Notice, Plugin, TFile } from "obsidian";
import { DailyDigestSettings, DailyDigestSettingTab, DEFAULT_SETTINGS, SECRET_ID } from "./settings";
import { collectBrowserHistory, readShellHistory, readClaudeSessions, readCodexSessions, readGitHistory } from "./collectors";
import { categorizeVisits } from "./categorize";
import { compressActivity } from "./compress";
import { summarizeDay } from "./summarize";
import { AICallConfig } from "./ai-client";
import { renderMarkdown } from "./renderer";
import {
	OnboardingModal,
	DataPreviewModal,
	shouldShowOnboarding,
} from "./privacy";
import { RAGConfig, SanitizeConfig, SensitivityConfig, ClassificationConfig, ClassificationResult, PatternConfig, PatternAnalysis } from "./types";
import { sanitizeCollectedData } from "./sanitize";
import { classifyEvents } from "./classify";
import { filterSensitiveDomains, filterSensitiveSearches } from "./sensitivity";
import { extractPatterns, TopicHistory, buildEmptyTopicHistory, updateTopicHistory } from "./patterns";
import { generateKnowledgeSections, KnowledgeSections } from "./knowledge";
import { extractUserContent, mergeContent, createBackup, hasUserEdits, VaultAdapter } from "./merge";
import * as log from "./log";

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
		await this.migrateLegacyBrowserSettings();
	}

	/**
	 * One-time migration: browsers: string[] → browserConfigs: BrowserInstallConfig[]
	 *
	 * Existing users who had `browsers: ["chrome", "firefox"]` in their settings will
	 * get skeleton BrowserInstallConfig entries (enabled=true, no profiles yet). They
	 * must click "Detect Browsers & Profiles" to populate profiles, but their browser
	 * selection is preserved and they won't lose any other settings.
	 */
	private async migrateLegacyBrowserSettings(): Promise<void> {
		// Cast through unknown first — DailyDigestSettings no longer has a `browsers` field,
		// but data.json from older versions may still contain it.
		const rawSettings = this.settings as unknown as Record<string, unknown>;
		const legacy = rawSettings["browsers"];
		if (
			Array.isArray(legacy) &&
			legacy.length > 0 &&
			this.settings.browserConfigs.length === 0
		) {
			this.settings.browserConfigs = (legacy as string[]).map((id) => ({
				browserId: id,
				enabled: true,
				profiles: [],
				selectedProfiles: [],
			}));
			// Remove the stale field so it doesn't linger in data.json
			delete rawSettings["browsers"];
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/**
	 * Resolve the Anthropic API key from the best available source:
	 *   1. Obsidian SecretStorage — not synced, not in data.json
	 *   2. ANTHROPIC_API_KEY environment variable
	 */
	getAnthropicApiKey(): string {
		const stored = this.app.secretStorage.getSecret(SECRET_ID);
		return stored || process.env.ANTHROPIC_API_KEY || "";
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

		const since = targetDate; // targetDate is already midnight local time
		const provider = this.settings.aiProvider;
		const apiKey = this.getAnthropicApiKey();

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
			let { visits: rawVisits, searches: rawSearches } = await collectBrowserHistory(this.settings, since);

			progressNotice.setMessage("Daily Digest: Reading shell history\u2026");
			const rawShellCmds = readShellHistory(this.settings, since);

			progressNotice.setMessage("Daily Digest: Reading Claude Code and Codex sessions\u2026");
			const rawClaudeSessions = [
				...readClaudeSessions(this.settings, since),
				...readCodexSessions(this.settings, since),
			];

			progressNotice.setMessage("Daily Digest: Reading git history\u2026");
			const rawGitCommits = readGitHistory(this.settings, since);

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
					log.debug(
						`Daily Digest: Sensitivity filter removed ${sensitivityFiltered} items` +
						(catBreakdown ? ` (${catBreakdown})` : "")
					);
				}
			}

			// ── Sanitize ────────────────────────
			progressNotice.setMessage("Daily Digest: Sanitizing data\u2026");
			const sanitized = sanitizeCollectedData(
				rawVisits, rawSearches, rawShellCmds, rawClaudeSessions, rawGitCommits,
				sanitizeConfig
			);
			const visits = sanitized.visits;
			const searches = sanitized.searches;
			const shellCmds = sanitized.shellCommands;
			const claudeSessions = sanitized.claudeSessions;
			const gitCommits = sanitized.gitCommits;
			const excludedCount = sanitized.excludedVisitCount;

			const totalExcluded = excludedCount + sensitivityFiltered;
			if (excludedCount > 0) {
				log.debug(`Daily Digest: Excluded ${excludedCount} visits by domain filter`);
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
							visits, searches, shellCmds, claudeSessions, gitCommits,
							categorized, classConfig
						);
						log.debug(
							`Daily Digest: Classified ${classification.totalProcessed} events ` +
							`(${classification.llmClassified} LLM, ${classification.ruleClassified} rule) ` +
							`in ${classification.processingTimeMs}ms`
						);
					} catch (e) {
						log.warn("Daily Digest: Classification failed, continuing without:", e);
					}
				} else {
					log.debug("Daily Digest: Classification enabled but no local model/endpoint configured");
				}
			}

			// ── Pattern Extraction (Phase 3) ────
			let knowledgeSections: KnowledgeSections | undefined;
			let extractedPatterns: PatternAnalysis | undefined;
			if (this.settings.enablePatterns && classification && classification.events.length > 0) {
				progressNotice.setMessage("Daily Digest: Extracting patterns\u2026");
				const patternConfig: PatternConfig = {
					enabled: true,
					cooccurrenceWindow: this.settings.patternCooccurrenceWindow,
					minClusterSize: this.settings.patternMinClusterSize,
					trackRecurrence: this.settings.trackRecurrence,
				};

				// Load topic history for recurrence detection
				let topicHistory: TopicHistory = buildEmptyTopicHistory();
				const historyPath = ".daily-digest/topic-history.json";
				if (patternConfig.trackRecurrence) {
					try {
						const existing = this.app.vault.getAbstractFileByPath(historyPath);
						if (existing instanceof TFile) {
							const raw = await this.app.vault.read(existing);
							topicHistory = JSON.parse(raw) as TopicHistory;
						}
					} catch (e) {
						log.debug("Daily Digest: No topic history found, starting fresh:", e);
					}
				}

				const todayStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, "0")}-${String(targetDate.getDate()).padStart(2, "0")}`;
				try {
					const patterns: PatternAnalysis = extractPatterns(
						classification, patternConfig, topicHistory, todayStr
					);
					extractedPatterns = patterns;
					knowledgeSections = generateKnowledgeSections(patterns);

					log.debug(
						`Daily Digest: Extracted ${patterns.temporalClusters.length} clusters, ` +
						`${patterns.topicCooccurrences.length} co-occurrences, ` +
						`${patterns.entityRelations.length} entity relations, ` +
						`focus score ${Math.round(patterns.focusScore * 100)}%`
					);

					// Persist updated topic history
					if (patternConfig.trackRecurrence) {
						const allTopics = [...new Set(classification.events.flatMap((e) => e.topics))];
						const updatedHistory = updateTopicHistory(topicHistory, allTopics, todayStr);
						try {
							const historyFolder = ".daily-digest";
							const folderObj = this.app.vault.getAbstractFileByPath(historyFolder);
							if (!folderObj) {
								await this.app.vault.createFolder(historyFolder);
							}
							const historyFile = this.app.vault.getAbstractFileByPath(historyPath);
							const historyJson = JSON.stringify(updatedHistory, null, 2);
							if (historyFile instanceof TFile) {
								await this.app.vault.modify(historyFile, historyJson);
							} else {
								await this.app.vault.create(historyPath, historyJson);
							}
						} catch (e) {
							log.warn("Daily Digest: Failed to persist topic history:", e);
						}
					}
				} catch (e) {
					log.warn("Daily Digest: Pattern extraction failed, continuing without:", e);
				}
			}

			// ── AI Summary ───────────────────────
			let aiSummary = null;
			if (useAI) {
				// ── Compress ──────────────────────
				progressNotice.setMessage("Daily Digest: Compressing activity data\u2026");
				const compressed = compressActivity(
					categorized, searches, shellCmds, claudeSessions, gitCommits,
					this.settings.promptBudget
				);
				log.debug(
					`Daily Digest: Compressed ${compressed.totalEvents} events ` +
					`to ~${compressed.tokenEstimate} tokens ` +
					`(budget: ${this.settings.promptBudget})`
				);

				if (provider === "anthropic") {
					// Cloud provider: show data preview for explicit consent
					progressNotice.hide();

					const result = await new DataPreviewModal(this.app, {
						visitCount: visits.length,
						searchCount: searches.length,
						shellCount: shellCmds.length,
						claudeCount: claudeSessions.length,
						gitCount: gitCommits.length,
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
							git: rawGitCommits.slice(0, 5).map((c) => ({
								text: `${c.repo}: ${c.message}`.slice(0, 80),
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
							extractedPatterns
								? "Daily Digest: Analyzing de-identified patterns (Anthropic)\u2026"
								: classification
									? "Daily Digest: Summarizing classified abstractions (Anthropic)\u2026"
									: ragConfig?.enabled
										? "Daily Digest: Chunking, embedding & summarizing (Anthropic)\u2026"
										: "Daily Digest: Generating AI summary (Anthropic)\u2026",
							0
						);
						aiSummary = await summarizeDay(
							targetDate, categorized, searches, shellCmds,
							claudeSessions, aiConfig, this.settings.profile,
							ragConfig, classification, extractedPatterns,
							compressed, gitCommits, this.settings.promptsDir
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
						ragConfig, classification, extractedPatterns,
						compressed, gitCommits, this.settings.promptsDir
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
				gitCommits,
				categorized,
				aiSummary,
				aiProviderUsed,
				knowledgeSections
			);

			// ── Write to vault ───────────────────
			renderNotice.setMessage("Daily Digest: Writing to vault\u2026");
			const filePath = await this.writeToVault(targetDate, md);

			renderNotice.hide();
			this.statusBarItem.setText("Daily Digest ready");

			const stats = `${visits.length} visits, ${searches.length} searches, ${shellCmds.length} commands, ${claudeSessions.length} prompts, ${gitCommits.length} commits`;
			new Notice(`Daily Digest: Daily note created!\n${stats}`, 6000);

			// Open the file
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				await this.app.workspace.getLeaf(false).openFile(file);
			}
		} catch (e) {
			new Notice(`Daily Digest error: ${e}`, 10000);
			this.statusBarItem.setText("Daily Digest: error");
			log.error("Daily Digest error:", e);
		}
	}

	private async writeToVault(date: Date, content: string): Promise<string> {
		// Build the file path
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

		const existing = this.app.vault.getAbstractFileByPath(filePath);
		if (existing instanceof TFile) {
			// ── Merge with existing content ─────────────
			const existingContent = await this.app.vault.read(existing);
			const extraction = extractUserContent(existingContent);

			// Create backup BEFORE any modification (safety net)
			if (hasUserEdits(extraction)) {
				try {
					const backupPath = await createBackup(
						this.app.vault as unknown as VaultAdapter,
						filePath,
						existingContent,
					);
					log.debug(`Daily Digest: Backup created at ${backupPath}`);
				} catch (e) {
					// Backup failed — abort to protect user data
					throw new Error(
						`Daily Digest: Cannot create backup of existing note. ` +
						`Aborting to protect your data. Error: ${e}`
					);
				}
			}

			// Merge user content into newly generated note
			const merged = mergeContent(content, extraction);
			await this.app.vault.modify(existing, merged);
		} else {
			await this.app.vault.create(filePath, content);
		}

		return filePath;
	}
}
