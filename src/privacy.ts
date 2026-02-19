import { App, Modal, Setting, Notice } from "obsidian";
import { DailyDigestSettings } from "./settings";

// ── Constants ────────────────────────────────────────────

/** Bump this to re-trigger the onboarding modal for all users. */
export const CURRENT_PRIVACY_VERSION = 1;

export const PRIVACY_DESCRIPTIONS = {
	browser: {
		label: "Browser History",
		access:
			"Reads SQLite database files from your browsers to extract visited URLs, " +
			"page titles, and timestamps. This includes all browsing activity within " +
			"the configured lookback window.",
		files:
			"~/Library/Application Support/Google/Chrome/Default/History " +
			"(and equivalents for Brave, Edge, Firefox, Safari)",
		destination:
			"Stored in your vault as part of the daily note. If your vault syncs " +
			"(iCloud, Obsidian Sync, Dropbox, etc.), this data will be uploaded " +
			"to those services.",
	},
	shell: {
		label: "Shell History",
		access:
			"Reads your terminal command history from ~/.zsh_history or " +
			"~/.bash_history. Secrets and tokens are automatically redacted " +
			"using pattern matching, but redaction is not guaranteed to catch " +
			"all sensitive values.",
		files: "~/.zsh_history, ~/.bash_history",
		destination:
			"Stored in your vault as part of the daily note. Commands may " +
			"reveal project names, file paths, and tools you use.",
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
	ai: {
		label: "AI Summarization",
		access:
			"Uses an AI model to generate summaries, themes, and reflections " +
			"from your collected activity data.",
		destination:
			"Local model: all data stays on your machine. " +
			"Anthropic API: data is sent to api.anthropic.com via HTTPS.",
		warning:
			"If using Anthropic API, your browser history, search queries, shell " +
			"commands, and Claude prompts are sent to Anthropic's servers for " +
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
		enableShell: boolean;
		enableClaude: boolean;
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
			enableShell: settings.enableShell,
			enableClaude: settings.enableClaude,
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
			.setDesc(PRIVACY_DESCRIPTIONS.browser.access)
			.addToggle((toggle) =>
				toggle
					.setValue(this.localToggles.enableBrowser)
					.onChange((v) => {
						this.localToggles.enableBrowser = v;
					})
			);

		new Setting(contentEl)
			.setName(PRIVACY_DESCRIPTIONS.shell.label)
			.setDesc(PRIVACY_DESCRIPTIONS.shell.access)
			.addToggle((toggle) =>
				toggle
					.setValue(this.localToggles.enableShell)
					.onChange((v) => {
						this.localToggles.enableShell = v;
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
					this.settings.enableShell = this.localToggles.enableShell;
					this.settings.enableClaude = this.localToggles.enableClaude;
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

export interface DataPreviewStats {
	visitCount: number;
	searchCount: number;
	shellCount: number;
	claudeCount: number;
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
		if (this.stats.shellCount > 0) {
			statsList.createEl("li", {
				text: `${this.stats.shellCount} shell commands (secrets redacted)`,
			});
		}
		if (this.stats.claudeCount > 0) {
			statsList.createEl("li", {
				text: `${this.stats.claudeCount} Claude Code prompts`,
			});
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
