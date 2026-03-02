import { Modal, App, Setting } from "obsidian";
import type DailyDigestPlugin from "./main";

type DebugStage = "raw" | "sanitized" | "categorized";

export class PipelineDebugModal extends Modal {
	private plugin: DailyDigestPlugin;
	private selectedDate: string;
	private selectedStage: DebugStage = "categorized";

	constructor(app: App, plugin: DailyDigestPlugin) {
		super(app);
		this.plugin = plugin;
		const now = new Date();
		this.selectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
	}

	onOpen(): void {
		const { contentEl } = this;
		this.setTitle("Pipeline Inspector (debug)");

		new Setting(contentEl)
			.setName("Date")
			.addText(text => {
				text.inputEl.type = "date";
				text.setValue(this.selectedDate).onChange(v => { this.selectedDate = v; });
			});

		new Setting(contentEl)
			.setName("Stage")
			.setDesc("To preview the actual AI prompt, use Generate → eye icon (Data Preview).")
			.addDropdown(drop => drop
				.addOptions({
					raw: "raw — collected counts",
					sanitized: "sanitized — after secret scrubbing & sensitivity filter",
					categorized: "categorized — browser visits by category",
				})
				.setValue(this.selectedStage)
				.onChange(v => { this.selectedStage = v as DebugStage; }));

		new Setting(contentEl)
			.addButton(btn =>
				btn.setButtonText("Inspect").setCta().onClick(() => this.runInspection()));
	}

	private async runInspection(): Promise<void> {
		const { contentEl } = this;
		const existing = contentEl.querySelector(".pipeline-debug-output");
		if (existing) existing.remove();

		const out = contentEl.createEl("div", { cls: "pipeline-debug-output" });
		out.style.cssText = [
			"margin-top: 1rem",
			"max-height: 400px",
			"overflow: auto",
			"background: var(--background-secondary)",
			"padding: 1rem",
			"border-radius: 4px",
			"font-family: var(--font-monospace)",
			"font-size: 12px",
			"white-space: pre-wrap",
		].join("; ");
		out.setText("Running\u2026");

		try {
			const result = await this.plugin.runPipelineStage(this.selectedDate, this.selectedStage);
			out.setText(typeof result === "string" ? result : JSON.stringify(result, null, 2));
		} catch (e) {
			out.setText(`Error: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	onClose(): void {
		this.contentEl.empty();
	}
}
