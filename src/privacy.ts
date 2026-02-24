import { App, Modal, Setting, Notice } from "obsidian";
import { DailyDigestSettings } from "./settings/types";

// ── Constants ────────────────────────────────────────────

/**
 * Bump this to re-trigger the onboarding modal for all users.
 * v1 → v2: updated for cross-platform browser profile detection.
 * v2 → v3: added explicit disclosure of Git data source collection and usage.
 */
export const CURRENT_PRIVACY_VERSION = 3;

export const PRIVACY_DESCRIPTIONS = {
	browser: {
		label: "Browser History",
		access:
			"Reads browser History SQLite databases for visited URLs, page titles, and timestamps. " +
			"Supports per-profile selection — you choose exactly which browsers and profiles " +
			"are included. Only History files are read; passwords, cookies, and saved payment " +
			"data are never accessed.",
		files:
			"macOS:   ~/Library/Application Support/{Browser}/[Profile]/History\n" +
			"Windows: %LOCALAPPDATA%\\{Browser}\\User Data\\[Profile]\\History\n" +
			"Linux:   ~/.config/{browser}/[Profile]/History\n" +
			"Firefox: OS-specific profiles directory · places.sqlite per profile\n" +
			"Safari (macOS only): ~/Library/Safari/History.db\n" +
			"Profile names are read from browser config files (Local State / profiles.ini). " +
			"No credentials, cookies, or encrypted data are read from those files.",
		destination:
			"Stored in your vault as part of the daily note. If your vault syncs " +
			"(iCloud, Obsidian Sync, Dropbox, etc.), this data will be uploaded " +
			"to those services.",
	},
	claude: {
		label: "Claude Code Sessions",
		access:
			"Reads JSONL log files from Claude Code to extract your prompts " +
			"(not Claude's responses). Prompts are truncated to 200 characters.",
		files: "~/.claude/projects/**/*.jsonl",
		destination:
			"Stored in your vault as part of the daily note. Prompts may " +
			"contain code snippets, project context, or sensitive instructions.",
	},
	codex: {
		label: "Codex CLI Sessions",
		access:
			"Reads JSONL log files from the Codex CLI desktop app to extract your prompts " +
			"(not model responses). Injected system context is filtered automatically. " +
			"No API key required — reads local files only. Prompts are truncated to 200 characters.",
		files: "~/.codex/sessions/**/*.jsonl",
		destination:
			"Stored in your vault as part of the daily note. Prompts may " +
			"contain code snippets, project context, or file paths.",
	},
	git: {
		label: "Git commit history",
		access:
			"Reads git log output from repositories under a parent directory you specify. " +
			"Only your own commits (matched by local git user.email) are collected.",
		files: "Git repository .git directories (read-only, via git log)",
		destination:
			"Commit messages, file change counts, and repo names are included in your daily note. " +
			"When using Anthropic API, this data is sent for summarization.",
	},
	ai: {
		label: "AI Summarization",
		access:
			"Uses an AI model to generate summaries, themes, and reflections " +
			"from your collected activity data.",
		destination:
			"Local model: all data stays on your machine. " +
			"Anthropic API: data is sent to api.anthropic.com via HTTPS.",
		warning:
			"If using Anthropic API, your browser history, search queries, " +
			"and Claude Code prompts are sent to Anthropic's servers for " +
			"processing. Using a local model keeps everything on your machine.",
	},
	rag: {
		label: "RAG Pipeline",
		access:
			"Generates vector embeddings of your activity data using your " +
			"local model server. Embeddings are numerical representations " +
			"of text used for similarity search.",
		destination:
			"Embeddings are generated locally and stored in memory only " +
			"(not persisted to disk). No embedding data is sent externally.",
	},
};

// ── Utilities ────────────────────────────────────────────

export function shouldShowOnboarding(settings: DailyDigestSettings): boolean {
	return (
		!settings.hasCompletedOnboarding ||
		settings.privacyConsentVersion < CURRENT_PRIVACY_VERSION
	);
}

// ── Onboarding Modal ────────────────────────────────────

export class OnboardingModal extends Modal {
	private settings: DailyDigestSettings;
	private onComplete: (settings: DailyDigestSettings) => Promise<void>;
	private localToggles: {
		enableBrowser: boolean;
		enableClaude: boolean;
		enableGit: boolean;
		enableAI: boolean;
	};

	constructor(
		app: App,
		settings: DailyDigestSettings,
		onComplete: (settings: DailyDigestSettings) => Promise<void>
	) {
		super(app);
		this.settings = settings;
		this.onComplete = onComplete;
		this.localToggles = {
			enableBrowser: settings.enableBrowser,
			enableClaude: settings.enableClaude,
			enableGit: settings.enableGit,
			enableAI: settings.enableAI,
		};
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle("Welcome to Daily Digest");
		this.modalEl.addClass("daily-digest-onboarding-modal");

		// Introduction
		const intro = contentEl.createDiv({ cls: "dd-onboarding-intro" });
		intro.createEl("p", {
			text:
				"Daily Digest compiles your daily digital activity into a structured " +
				"Obsidian note. Before you begin, please review the data sources this " +
				"plugin can access.",
		});

		// Privacy notice
		const callout = contentEl.createDiv({ cls: "dd-privacy-callout" });
		callout.createEl("p", {
			text:
				"This plugin reads files from outside your Obsidian vault. All data " +
				"sources are disabled by default. Enable only the sources you are " +
				"comfortable with.",
		});

		// ── Local Data Sources ───────────────────────
		contentEl.createEl("h3", { text: "Local Data Sources" });
		contentEl.createEl("p", {
			text: "These sources are read locally. Data is stored in your vault as a daily note.",
			cls: "dd-onboarding-subtitle",
		});

		new Setting(contentEl)
			.setName(PRIVACY_DESCRIPTIONS.browser.label)
			.setDesc(
				PRIVACY_DESCRIPTIONS.browser.access +
				"\n\nAfter enabling, use Settings → Data Sources → " +
				"'Detect Browsers & Profiles' to choose which browsers and " +
				"profiles to include. Nothing is collected until you select profiles there."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.localToggles.enableBrowser)
					.onChange((v) => {
						this.localToggles.enableBrowser = v;
					})
			);

		new Setting(contentEl)
			.setName(PRIVACY_DESCRIPTIONS.claude.label)
			.setDesc(PRIVACY_DESCRIPTIONS.claude.access)
			.addToggle((toggle) =>
				toggle
					.setValue(this.localToggles.enableClaude)
					.onChange((v) => {
						this.localToggles.enableClaude = v;
					})
			);

		new Setting(contentEl)
			.setName(PRIVACY_DESCRIPTIONS.git.label)
			.setDesc(PRIVACY_DESCRIPTIONS.git.access)
			.addToggle((toggle) =>
				toggle
					.setValue(this.localToggles.enableGit)
					.onChange((v) => {
						this.localToggles.enableGit = v;
					})
			);

		// ── AI Summarization ────────────────────────
		contentEl.createEl("h3", { text: "AI Summarization" });

		const aiInfo = contentEl.createDiv({ cls: "dd-privacy-callout" });
		aiInfo.createEl("p", {
			text:
				"AI summarization can run locally (via Ollama, LM Studio, or any " +
				"OpenAI-compatible server) or via Anthropic's cloud API. Using a " +
				"local model keeps all data on your machine.",
		});

		const aiWarning = contentEl.createDiv({ cls: "dd-ai-warning-callout" });
		aiWarning.createEl("p", {
			text: PRIVACY_DESCRIPTIONS.ai.warning,
		});

		new Setting(contentEl)
			.setName(PRIVACY_DESCRIPTIONS.ai.label)
			.setDesc(
				"Enable to generate headlines, themes, and reflections from your " +
				"activity data. You can choose the provider (local or cloud) in Settings."
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.localToggles.enableAI)
					.onChange((v) => {
						this.localToggles.enableAI = v;
					})
			);

		// Vault sync warning
		const syncWarning = contentEl.createDiv({ cls: "dd-sync-warning" });
		syncWarning.createEl("p", {
			text:
				"Note: Generated daily notes are stored in your vault. If your vault " +
				"is synced to a cloud service (iCloud, Obsidian Sync, Dropbox, etc.), " +
				"your activity data will be uploaded to those services.",
		});

		// ── Acknowledge button ──────────────────────
		new Setting(contentEl).addButton((btn) =>
			btn
				.setButtonText("I understand, continue")
				.setCta()
				.onClick(async () => {
					this.settings.enableBrowser = this.localToggles.enableBrowser;
					this.settings.enableClaude = this.localToggles.enableClaude;
					this.settings.enableGit = this.localToggles.enableGit;
					this.settings.enableAI = this.localToggles.enableAI;
					this.settings.hasCompletedOnboarding = true;
					this.settings.privacyConsentVersion = CURRENT_PRIVACY_VERSION;
					await this.onComplete(this.settings);
					this.close();
					new Notice(
						"Daily Digest configured. Use the ribbon icon or command palette to generate a note."
					);
				})
		);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		if (!this.settings.hasCompletedOnboarding) {
			new Notice(
				"Daily Digest: Complete setup in Settings to start generating notes.",
				6000
			);
		}
	}
}

// ── Data Preview Modal ──────────────────────────────────

export interface DataPreviewSample {
	text: string;
	time?: string;
}

export interface DataPreviewStats {
	visitCount: number;
	searchCount: number;
	claudeCount: number;
	gitCount: number;
	excludedCount?: number;
	samples?: {
		visits: DataPreviewSample[];
		searches: DataPreviewSample[];
		claude: DataPreviewSample[];
		git: DataPreviewSample[];
	};
}

export type DataPreviewResult =
	| "proceed-with-ai"
	| "proceed-without-ai"
	| "cancel";

export class DataPreviewModal extends Modal {
	private stats: DataPreviewStats;
	private resolvePromise: ((result: DataPreviewResult) => void) | null = null;
	private resolved = false;

	constructor(app: App, stats: DataPreviewStats) {
		super(app);
		this.stats = stats;
	}

	openAndWait(): Promise<DataPreviewResult> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			this.open();
		});
	}

	private complete(result: DataPreviewResult): void {
		if (!this.resolved && this.resolvePromise) {
			this.resolved = true;
			this.resolvePromise(result);
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle("Review Data Before AI Summarization");
		this.modalEl.addClass("daily-digest-preview-modal");

		contentEl.createEl("p", {
			text:
				"The following data has been collected and will be sent to " +
				"Anthropic's API for AI summarization:",
		});

		const statsList = contentEl.createEl("ul", { cls: "dd-preview-stats" });
		if (this.stats.visitCount > 0) {
			statsList.createEl("li", {
				text: `${this.stats.visitCount} browser visits`,
			});
		}
		if (this.stats.searchCount > 0) {
			statsList.createEl("li", {
				text: `${this.stats.searchCount} search queries`,
			});
		}
		if (this.stats.claudeCount > 0) {
			statsList.createEl("li", {
				text: `${this.stats.claudeCount} Claude Code session prompts`,
			});
		}
		if (this.stats.gitCount > 0) {
			statsList.createEl("li", {
				text: `${this.stats.gitCount} git commits`,
			});
		}
		if (this.stats.excludedCount && this.stats.excludedCount > 0) {
			statsList.createEl("li", {
				text: `${this.stats.excludedCount} visits excluded by domain filter`,
				cls: "dd-preview-excluded",
			});
		}

		// ── Scrubbed data samples ────────────────
		if (this.stats.samples) {
			const sampleSection = contentEl.createDiv({ cls: "dd-preview-samples" });
			const sampleToggle = sampleSection.createEl("p", {
				cls: "dd-preview-toggle",
				text: "\u25B6 Show sample data (sanitized)",
			});
			const sampleContent = sampleSection.createDiv({
				cls: "dd-preview-sample-content",
			});
			sampleContent.style.display = "none";

			sampleToggle.addEventListener("click", () => {
				const visible = sampleContent.style.display !== "none";
				sampleContent.style.display = visible ? "none" : "block";
				sampleToggle.textContent = visible
					? "\u25B6 Show sample data (sanitized)"
					: "\u25BC Sample data (sanitized)";
			});

			const { samples } = this.stats;

			if (samples.visits.length > 0) {
				sampleContent.createEl("h4", { text: "Browser visits" });
				const visitList = sampleContent.createEl("ul", { cls: "dd-preview-items" });
				for (const s of samples.visits) {
					visitList.createEl("li", { text: s.text });
				}
			}

			if (samples.searches.length > 0) {
				sampleContent.createEl("h4", { text: "Search queries" });
				const searchList = sampleContent.createEl("ul", { cls: "dd-preview-items" });
				for (const s of samples.searches) {
					searchList.createEl("li", { text: s.text });
				}
			}

			if (samples.claude.length > 0) {
				sampleContent.createEl("h4", { text: "Claude Code prompts" });
				const claudeList = sampleContent.createEl("ul", { cls: "dd-preview-items" });
				for (const s of samples.claude) {
					claudeList.createEl("li", { text: s.text });
				}
			}

			if (samples.git.length > 0) {
				sampleContent.createEl("h4", { text: "Git commits" });
				const gitList = sampleContent.createEl("ul", { cls: "dd-preview-items" });
				for (const s of samples.git) {
					gitList.createEl("li", { text: s.text, cls: "dd-preview-mono" });
				}
			}
		}

		const destination = contentEl.createDiv({
			cls: "dd-preview-destination",
		});
		destination.createEl("p", {
			text:
				"This data will be sent to api.anthropic.com for processing. " +
				"Anthropic's privacy policy applies.",
		});

		// Buttons
		new Setting(contentEl)
			.addButton((btn) =>
				btn
					.setButtonText("Send to AI & Generate")
					.setCta()
					.onClick(() => {
						this.complete("proceed-with-ai");
						this.close();
					})
			)
			.addButton((btn) =>
				btn.setButtonText("Generate without AI").onClick(() => {
					this.complete("proceed-without-ai");
					this.close();
				})
			)
			.addButton((btn) =>
				btn.setButtonText("Cancel").onClick(() => {
					this.complete("cancel");
					this.close();
				})
			);
	}

	onClose(): void {
		// Escape or click-outside → treat as cancel
		this.complete("cancel");
		this.contentEl.empty();
	}
}
