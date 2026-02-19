import { Notice, Plugin, TFile, TFolder, Modal, Setting, App } from "obsidian";
import { DailyDigestSettings, DailyDigestSettingTab, DEFAULT_SETTINGS } from "./settings";
import { collectBrowserHistory, readShellHistory, readClaudeSessions } from "./collectors";
import { categorizeVisits } from "./categorize";
import { summarizeDay } from "./summarize";
import { renderMarkdown } from "./renderer";

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
		const since = new Date(targetDate.getTime() - this.settings.lookbackHours * 60 * 60 * 1000);
		const apiKey = this.settings.anthropicApiKey || process.env.ANTHROPIC_API_KEY || "";
		const useAI = this.settings.enableAI && !skipAI && !!apiKey;

		if (this.settings.enableAI && !skipAI && !apiKey) {
			new Notice("No Anthropic API key configured. Running without AI summaries. Set it in Daily Digest settings.", 8000);
		}

		const progressNotice = new Notice("Daily Digest: Collecting activity data\u2026", 0);
		this.statusBarItem.setText("Daily Digest: collecting\u2026");

		try {
			// ── Collect ──────────────────────────
			progressNotice.setMessage("Daily Digest: Reading browser history\u2026");
			const { visits, searches } = collectBrowserHistory(this.settings, since);

			progressNotice.setMessage("Daily Digest: Reading shell history\u2026");
			const shellCmds = readShellHistory(this.settings, since);

			progressNotice.setMessage("Daily Digest: Reading Claude sessions\u2026");
			const claudeSessions = readClaudeSessions(this.settings, since);

			// ── Categorize ───────────────────────
			progressNotice.setMessage("Daily Digest: Categorizing activity\u2026");
			const categorized = categorizeVisits(visits);

			// ── AI Summary ───────────────────────
			let aiSummary = null;
			if (useAI) {
				progressNotice.setMessage("Daily Digest: Generating AI summary\u2026");
				aiSummary = await summarizeDay(
					targetDate,
					categorized,
					searches,
					shellCmds,
					claudeSessions,
					apiKey,
					this.settings.aiModel,
					this.settings.profile
				);
			}

			// ── Render ───────────────────────────
			progressNotice.setMessage("Daily Digest: Rendering markdown\u2026");
			const md = renderMarkdown(
				targetDate,
				visits,
				searches,
				shellCmds,
				claudeSessions,
				categorized,
				aiSummary
			);

			// ── Write to vault ───────────────────
			progressNotice.setMessage("Daily Digest: Writing to vault\u2026");
			const filePath = await this.writeToVault(targetDate, md);

			progressNotice.hide();
			this.statusBarItem.setText("Daily Digest ready");

			const stats = `${visits.length} visits, ${searches.length} searches, ${shellCmds.length} commands, ${claudeSessions.length} prompts`;
			new Notice(`Daily Digest: Daily note created!\n${stats}`, 6000);

			// Open the file
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				await this.app.workspace.getLeaf(false).openFile(file);
			}
		} catch (e) {
			progressNotice.hide();
			this.statusBarItem.setText("Daily Digest: error");
			new Notice(`Daily Digest error: ${e}`, 10000);
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
