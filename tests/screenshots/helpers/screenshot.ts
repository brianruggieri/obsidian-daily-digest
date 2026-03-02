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
		plugin.settings.privacyConsentVersion = 4; // CURRENT_PRIVACY_VERSION
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

	// Scroll the settings container back a bit so the heading isn't
	// jammed against the top edge of the modal
	await browser.execute((text: string) => {
		const headings = document.querySelectorAll(".setting-item-heading");
		for (const h of headings) {
			if (!h.textContent?.includes(text)) continue;
			const container = h.closest(".vertical-tab-content");
			if (container) {
				container.scrollTop = Math.max(0, container.scrollTop - 40);
			}
			break;
		}
	}, headingText);

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
 * Collapse both sidebars to maximise the content area for screenshots.
 */
export async function collapseSidebars(): Promise<void> {
	await browser.executeObsidian(({ app }) => {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const workspace = app.workspace as any;
		workspace.leftSplit?.collapse();
		workspace.rightSplit?.collapse();
	});
	await browser.pause(300);
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

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const file = (leaf.view as any).file;
		if (!file) return false;

		// Get heading positions from Obsidian's metadata cache
		const cache = app.metadataCache.getFileCache(file);
		if (!cache?.headings) return false;

		const heading = cache.headings.find(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(h: any) => h.heading.includes(text)
		);
		if (!heading) return false;

		// Use the preview renderer to scroll to the heading's line
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/**
 * Expand a collapsed callout by clicking its fold icon.
 *
 * Must be called after scrollToCalloutTitle() has brought the callout
 * into the DOM. Finds the `.callout-title-inner` containing the text,
 * walks up to the `.callout` container, and clicks the fold icon to
 * toggle it open. No-ops if the callout is already expanded.
 */
export async function expandCallout(titleText: string): Promise<void> {
	await browser.execute((text: string) => {
		const titles = document.querySelectorAll(".callout-title-inner");
		for (const el of titles) {
			if (!el.textContent?.includes(text)) continue;
			const callout = el.closest(".callout");
			if (!callout) continue;
			// If already expanded (no "is-collapsed" class), skip
			if (!callout.classList.contains("is-collapsed")) return;
			// Click the fold icon to expand
			const fold = callout.querySelector(".callout-fold") as HTMLElement | null;
			if (fold) {
				fold.click();
				return;
			}
			// Fallback: click the title itself
			(el as HTMLElement).click();
			return;
		}
	}, titleText);
	await browser.pause(RENDER_SETTLE_MS);
}

/**
 * Scroll to an Obsidian callout by matching its title text in the file content.
 *
 * Callouts are NOT in Obsidian's metadata cache, and Obsidian's virtual
 * scroller only renders visible sections — so we can't query the DOM for
 * offscreen callouts. Instead, we find the callout's line number from the
 * raw file content and use the preview renderer's applyScroll() to bring
 * that section into view (same approach as scrollToHeading).
 */
export async function scrollToCalloutTitle(titleText: string): Promise<void> {
	const found = await browser.executeObsidian(async ({ app }, text) => {
		const leaf = app.workspace.activeLeaf;
		if (!leaf?.view) return false;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const file = (leaf.view as any).file;
		if (!file) return false;

		// Read the file content and find the line containing the callout title
		const content = await app.vault.cachedRead(file);
		if (typeof content !== "string") return false;

		const lines = content.split("\n");
		let targetLine = -1;
		for (let i = 0; i < lines.length; i++) {
			// Callout lines look like: > [!info]- 🌐 Browser Activity (20 visits, 3 categories)
			if (lines[i].includes("[!") && lines[i].includes(text)) {
				targetLine = i;
				break;
			}
		}
		if (targetLine === -1) return false;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const previewMode = (leaf.view as any).previewMode;
		if (previewMode?.renderer?.applyScroll) {
			previewMode.renderer.applyScroll(targetLine);
			return true;
		}

		return false;
	}, titleText);

	if (!found) {
		throw new Error(`Callout title "${titleText}" not found in reading view`);
	}

	await browser.pause(RENDER_SETTLE_MS);
}
