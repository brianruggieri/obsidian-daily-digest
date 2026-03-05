/**
 * Automated settings panel screenshots.
 *
 * Each scenario:
 *   1. Applies a settings preset via the Obsidian plugin API
 *   2. Reopens Settings → Daily Digest to reflect the new state
 *   3. Scrolls to the relevant section
 *   4. Captures a screenshot
 *
 * Naming convention: settings-<scenario>.png
 * All images saved to screenshots/output/ and compared against screenshots/baseline/.
 */

import { PRESETS, BASE, type PresetName } from "../helpers/settings-presets";
import {
	dismissOnboarding,
	openPluginSettings,
	closeSettings,
	captureFullPage,
	captureSettingsSection,
	initCgWindowId,
} from "../helpers/screenshot";

/**
 * Apply a settings preset by writing directly to the plugin's settings
 * object via the Obsidian API, then reload the settings panel.
 *
 * This avoids filesystem path issues with sandboxed vaults and ensures
 * Obsidian's own settings persistence logic is used.
 */
async function applyPreset(preset: PresetName): Promise<void> {
	const merged = { ...BASE, ...PRESETS[preset] };

	// Note: executeObsidian serializes the callback — it cannot capture
	// outer-scope variables. Pass data as extra arguments instead.
	// Plugin keys are camelCase ("dailyDigest" for "daily-digest").
	await browser.executeObsidian(async ({ plugins }, settings) => {
		const plugin = plugins.dailyDigest;
		if (!plugin) throw new Error("daily-digest plugin not found");

		Object.assign(plugin.settings, settings);
		await plugin.saveSettings();
	}, merged);

	// Close and reopen settings to pick up the new state
	await closeSettings();
	await browser.pause(200);
	await openPluginSettings();
	await browser.pause(500);
}

describe("Settings Panel Screenshots", () => {
	before(async () => {
		initCgWindowId();
		await dismissOnboarding();
		await openPluginSettings();
	});

	after(async () => {
		await closeSettings();
	});

	it("should capture default / first-run state", async () => {
		await applyPreset("default");
		await captureFullPage("settings-default");
	});

	it("should capture data sources with all enabled", async () => {
		await applyPreset("sourcesExpanded");
		await captureSettingsSection("Data sources", "settings-sources");
	});

	it("should capture browser profile detection", async () => {
		await applyPreset("browserProfiles");
		await captureSettingsSection("Data sources", "settings-browser-profiles");
	});

	it("should capture privacy warning callout (Anthropic + all sources)", async () => {
		await applyPreset("privacyWarn");
		await captureSettingsSection("Privacy", "settings-privacy-warn");
	});

	it("should capture sensitivity filter with recommended preset", async () => {
		await applyPreset("sensitivityRecommended");
		await captureSettingsSection("Privacy", "settings-sensitivity");
	});

	it("should capture sensitivity filter with custom preset (category checkboxes)", async () => {
		await applyPreset("sensitivityCustom");
		await captureSettingsSection("Privacy", "settings-sensitivity-custom");
	});

	it("should capture Codex CLI sessions toggle in Data Sources", async () => {
		await applyPreset("codexEnabled");
		await captureSettingsSection("Data sources", "settings-codex");
	});

	it("should capture AI section with local provider", async () => {
		await applyPreset("aiLocal");
		await captureSettingsSection("AI summarization", "settings-ai-local");
	});

	it("should capture AI section with Anthropic provider", async () => {
		await applyPreset("aiAnthropic");
		await captureSettingsSection("AI summarization", "settings-ai-anthropic");
	});

	it("should capture Anthropic AI with prompt preview toggle disabled", async () => {
		await applyPreset("promptPreview");
		await captureSettingsSection("AI summarization", "settings-prompt-preview");
	});

	it("should capture Anthropic AI with explicit privacy tier selector", async () => {
		await applyPreset("privacyTierExplicit");
		await captureSettingsSection("AI summarization", "settings-privacy-tier");
	});

	it("should capture advanced AI pipeline (classification + patterns)", async () => {
		await applyPreset("advancedPipeline");

		// The Advanced section is collapsed by default — click the toggle to expand it
		await browser.execute(() => {
			const buttons = document.querySelectorAll(".dd-settings-group button");
			for (const btn of buttons) {
				if (btn.textContent?.includes("Show advanced settings")) {
					(btn as HTMLElement).click();
					return;
				}
			}
		});
		await browser.pause(300);

		await captureSettingsSection("Advanced", "settings-advanced-ai");
	});
});
