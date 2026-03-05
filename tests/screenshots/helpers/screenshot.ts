/**
 * Screenshot capture utilities for WDIO specs.
 *
 * Uses wdio-obsidian-service browser commands for Obsidian interaction.
 * Captures are taken via `screencapture -l -o <cgWindowId>` (macOS-native)
 * rather than @wdio/visual-service, producing PNGs of the exact window frame
 * (title bar, rounded corners) without drop shadow. Omitting the shadow keeps
 * capture dimensions equal to the window's logical size regardless of its
 * position on screen, which is required for deterministic CI comparisons.
 *
 * Call `initCgWindowId()` once before any captures (in the wdio.conf `before`
 * hook). The CGWindowID must be obtained while the Obsidian window is frontmost,
 * immediately after the WebDriver session launches Obsidian.
 */

import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACTUAL_DIR = path.resolve(__dirname, "../output/actual");
const RENDER_SETTLE_MS = 500;

// Module-level CGWindowID — set by initCgWindowId(), used by captureWindow().
let cgWindowId: number | null = null;

// Python script that finds the frontmost Obsidian window's CGWindowID.
// Passed to python3 via stdin to avoid shell-quoting complexity.
const GET_WINDOW_ID_PY = `
import Quartz, sys
wins = Quartz.CGWindowListCopyWindowInfo(
    Quartz.kCGWindowListOptionOnScreenOnly,
    Quartz.kCGNullWindowID
)
for w in wins:
    if (w.get('kCGWindowOwnerName') == 'Obsidian'
            and w.get('kCGWindowLayer', 1) == 0
            and w.get('kCGWindowAlpha', 0.0) > 0):
        print(w['kCGWindowNumber'])
        sys.exit(0)
sys.exit(1)
`.trim();

/**
 * Initialise the CGWindowID for the running Obsidian window.
 *
 * Must be called while Obsidian is frontmost — immediately after WDIO
 * launches the session. Call once per worker (each spec runs in its own
 * worker with its own Obsidian instance).
 *
 * Throws on non-macOS or if no Obsidian window is found.
 */
export function initCgWindowId(): void {
	if (process.platform !== "darwin") {
		throw new Error(
			"screencapture -l is macOS-only. Ensure screenshots.yml uses runs-on: macos-latest."
		);
	}
	const result = spawnSync("python3", ["-"], {
		input: GET_WINDOW_ID_PY,
		encoding: "utf8",
	});
	if (result.status !== 0 || !result.stdout.trim()) {
		throw new Error(
			`Failed to obtain Obsidian CGWindowID.\n` +
			`stderr: ${result.stderr}\n` +
			`Ensure Obsidian is running and frontmost when initCgWindowId() is called.`
		);
	}
	const parsed = parseInt(result.stdout.trim(), 10);
	if (isNaN(parsed)) {
		throw new Error(`CGWindowID parse failed: received "${result.stdout.trim()}"`);
	}
	cgWindowId = parsed;
}

/**
 * Capture the Obsidian window using screencapture -l.
 *
 * Produces a PNG of the window frame. The -o flag omits the drop shadow so
 * capture dimensions equal the window's logical frame regardless of its
 * position on screen. This keeps baseline comparisons deterministic across
 * CI runs where window placement varies.
 * The -x flag suppresses the shutter sound.
 */
async function captureWindow(tag: string): Promise<void> {
	if (cgWindowId === null) {
		throw new Error(
			`cgWindowId is not set — initCgWindowId() must be called before any captures.`
		);
	}
	fs.mkdirSync(ACTUAL_DIR, { recursive: true });
	await browser.pause(RENDER_SETTLE_MS);
	const outPath = path.join(ACTUAL_DIR, `${tag}.png`);
	// -l: capture the specific window by CGWindowID
	// -o: omit drop shadow (deterministic dimensions independent of screen position)
	// -x: suppress shutter sound
	execSync(`screencapture -l ${cgWindowId} -o -x "${outPath}"`);
}

/**
 * Take a full-page screenshot of the current viewport.
 */
export async function captureFullPage(tag: string): Promise<void> {
	await captureWindow(tag);
}

/**
 * Scroll an element into view and capture the window.
 */
export async function captureElement(
	selector: string,
	tag: string
): Promise<void> {
	const el = await $(selector);
	await el.scrollIntoView({ block: "start" });
	await browser.pause(RENDER_SETTLE_MS);
	await captureWindow(tag);
}

/**
 * Scroll to a settings section heading and capture the window.
 *
 * Falls back to a full-window screenshot if the heading can't be found.
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

	await captureWindow(tag);
}

/**
 * Dismiss the privacy onboarding modal if it's showing.
 */
export async function dismissOnboarding(): Promise<void> {
	await browser.executeObsidian(async ({ app, plugins }) => {
		const plugin = plugins.dailyDigest;
		if (!plugin) throw new Error("daily-digest plugin not found");

		plugin.settings.hasCompletedOnboarding = true;
		plugin.settings.privacyConsentVersion = 4; // CURRENT_PRIVACY_VERSION
		await plugin.saveSettings();

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
 * Open the Obsidian settings modal and navigate to the Daily Digest tab.
 */
export async function openPluginSettings(): Promise<void> {
	await browser.executeObsidian(({ app }) => {
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
 */
export async function openNoteInReadingView(filename: string): Promise<void> {
	const filePath = `daily/${filename}.md`;
	await browser.executeObsidian(async ({ app, obsidian }, p) => {
		const file = app.vault.getAbstractFileByPath(p);
		if (!file || !(file instanceof obsidian.TFile)) {
			throw new Error(`Note ${p} not found in vault`);
		}
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(file, { state: { mode: "preview" } });
	}, filePath);
	await browser.pause(500);

	const readingView = await $(".markdown-reading-view");
	if (!(await readingView.isExisting())) {
		await browser.keys(["Meta", "e"]);
		await browser.pause(300);
	}
}

/**
 * Scroll to a markdown heading in the current reading view.
 */
export async function scrollToHeading(headingText: string): Promise<void> {
	const found = await browser.executeObsidian(({ app }, text) => {
		const leaf = app.workspace.activeLeaf;
		if (!leaf?.view) return false;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const file = (leaf.view as any).file;
		if (!file) return false;

		const cache = app.metadataCache.getFileCache(file);
		if (!cache?.headings) return false;

		const heading = cache.headings.find(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(h: any) => h.heading.includes(text)
		);
		if (!heading) return false;

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
 */
export async function expandCallout(titleText: string): Promise<void> {
	await browser.execute((text: string) => {
		const titles = document.querySelectorAll(".callout-title-inner");
		for (const el of titles) {
			if (!el.textContent?.includes(text)) continue;
			const callout = el.closest(".callout");
			if (!callout) continue;
			if (!callout.classList.contains("is-collapsed")) return;
			const fold = callout.querySelector(".callout-fold") as HTMLElement | null;
			if (fold) {
				fold.click();
				return;
			}
			(el as HTMLElement).click();
			return;
		}
	}, titleText);
	await browser.pause(RENDER_SETTLE_MS);
}

/**
 * Scroll to an Obsidian callout by matching its title text in the file content.
 */
export async function scrollToCalloutTitle(titleText: string): Promise<void> {
	const found = await browser.executeObsidian(async ({ app }, text) => {
		const leaf = app.workspace.activeLeaf;
		if (!leaf?.view) return false;

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const file = (leaf.view as any).file;
		if (!file) return false;

		const content = await app.vault.cachedRead(file);
		if (typeof content !== "string") return false;

		const lines = content.split("\n");
		let targetLine = -1;
		for (let i = 0; i < lines.length; i++) {
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
