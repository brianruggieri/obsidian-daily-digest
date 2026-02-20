/**
 * Screenshot capture utilities for WDIO specs.
 *
 * Uses wdio-obsidian-service browser commands for reliable Obsidian
 * interaction, and @wdio/visual-service for screenshot capture.
 */

const RENDER_SETTLE_MS = 500;

/**
 * Dismiss the privacy onboarding modal if it's showing.
 *
 * The plugin shows a "Welcome to Daily Digest" modal on first run
 * (or when CURRENT_PRIVACY_VERSION bumps). This bypasses it by
 * setting the consent flags directly via the plugin API, then
 * closing any open modal.
 */
export async function dismissOnboarding(): Promise<void> {
	await browser.executeObsidian(async ({ app, plugins }) => {
		const plugin = plugins.dailyDigest;
		if (!plugin) throw new Error("daily-digest plugin not found");

		// Mark onboarding as completed so the modal won't reappear
		plugin.settings.hasCompletedOnboarding = true;
		plugin.settings.privacyConsentVersion = 2; // CURRENT_PRIVACY_VERSION
		await plugin.saveSettings();

		// Close any open modal (the onboarding modal that fired on load)
		const modal = app.workspace.containerEl
			?.closest("body")
			?.querySelector(".daily-digest-onboarding-modal");
		if (modal) {
			const closeBtn = modal.querySelector(".modal-close-button") as HTMLElement | null;
			if (closeBtn) closeBtn.click();
		}
	});
	await browser.pause(300);
}

/**
 * Take a full-page screenshot of the current viewport.
 */
export async function captureFullPage(tag: string): Promise<void> {
	await browser.pause(RENDER_SETTLE_MS);
	await browser.saveScreen(tag, {});
}

/**
 * Scroll an element into view and take an element-level screenshot.
 */
export async function captureElement(
	selector: string,
	tag: string
): Promise<void> {
	const el = await $(selector);
	await el.scrollIntoView({ block: "start" });
	await browser.pause(RENDER_SETTLE_MS);
	await browser.saveElement(el, tag, {});
}

/**
 * Scroll to a settings section heading and capture the viewport.
 *
 * Falls back to a full-page screenshot if the heading can't be found.
 */
export async function captureSettingsSection(
	headingText: string,
	tag: string
): Promise<void> {
	// Find the heading element by partial text content
	const heading = await $(`.setting-item-heading*=${headingText}`);
	await heading.scrollIntoView({ block: "start" });
	await browser.pause(RENDER_SETTLE_MS);

	// Capture the viewport from this scroll position
	await browser.saveScreen(tag, {});
}

/**
 * Open the Obsidian settings modal and navigate to the Daily Digest tab.
 *
 * Uses the Obsidian API directly via executeObsidian for reliability
 * (avoids keyboard-shortcut fragility across platforms).
 */
export async function openPluginSettings(): Promise<void> {
	await browser.executeObsidian(({ app }) => {
		// Open settings and navigate to our plugin tab
		app.setting.open();
		app.setting.openTabById("daily-digest");
	});
	await browser.pause(500);
}

/**
 * Close the settings modal.
 */
export async function closeSettings(): Promise<void> {
	await browser.executeObsidian(({ app }) => {
		app.setting.close();
	});
	await browser.pause(200);
}

/**
 * Open a note by filename in reading view.
 *
 * Uses the Obsidian API to open the file directly rather than
 * keyboard shortcuts (more reliable, cross-platform).
 */
export async function openNoteInReadingView(filename: string): Promise<void> {
	// Note: executeObsidian serializes the callback — it cannot capture
	// outer-scope variables. Pass data as extra arguments instead.
	const filePath = `daily/${filename}.md`;
	await browser.executeObsidian(async ({ app, obsidian }, path) => {
		const file = app.vault.getAbstractFileByPath(path);
		if (!file || !(file instanceof obsidian.TFile)) {
			throw new Error(`Note ${path} not found in vault`);
		}
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(file, { state: { mode: "preview" } });
	}, filePath);
	await browser.pause(500);

	// Verify we're in reading view
	const readingView = await $(".markdown-reading-view");
	if (!(await readingView.isExisting())) {
		// Toggle to reading view
		await browser.keys(["Meta", "e"]);
		await browser.pause(300);
	}
}

/**
 * Scroll to a markdown heading in the current reading view.
 *
 * Obsidian uses a virtual scroller in reading view — only visible
 * sections are in the DOM. We use the file's heading cache to find
 * the target heading's line number, then scroll via the preview
 * renderer to bring that section into view.
 */
export async function scrollToHeading(headingText: string): Promise<void> {
	// Use Obsidian's metadata cache to find the heading position,
	// then scroll the preview to that line.
	const found = await browser.executeObsidian(({ app }, text) => {
		const leaf = app.workspace.activeLeaf;
		if (!leaf?.view) return false;

		const file = (leaf.view as any).file;
		if (!file) return false;

		// Get heading positions from Obsidian's metadata cache
		const cache = app.metadataCache.getFileCache(file);
		if (!cache?.headings) return false;

		const heading = cache.headings.find(
			(h: any) => h.heading.includes(text)
		);
		if (!heading) return false;

		// Use the preview renderer to scroll to the heading's line
		const previewMode = (leaf.view as any).previewMode;
		if (previewMode?.renderer?.applyScroll) {
			previewMode.renderer.applyScroll(heading.position.start.line);
			return true;
		}

		return false;
	}, headingText);

	if (!found) {
		throw new Error(`Heading "${headingText}" not found in reading view`);
	}

	await browser.pause(RENDER_SETTLE_MS);
}
