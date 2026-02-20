/**
 * Centralized CSS selectors for Obsidian UI elements.
 *
 * Obsidian's DOM is not a public API — selectors may change between versions.
 * Keeping them in one place means a version bump only requires updating this
 * file, not every spec.
 *
 * Plugin-specific selectors (dd-*) are stable — we control those.
 */
export const SEL = {
	// ── Settings modal ────────────────────────────────────
	settingsModal: ".modal.mod-settings",
	settingsNav: ".vertical-tab-nav-item",
	settingsContent: ".vertical-tab-content",
	settingItem: ".setting-item",
	settingHeading: ".setting-item-heading",
	toggle: ".checkbox-container",
	dropdown: "select",

	// ── Editor / reading view ─────────────────────────────
	readingView: ".markdown-reading-view",
	markdownContent: ".markdown-preview-section",

	// ── Plugin-specific (our CSS classes — stable) ────────
	calloutInfo: ".dd-settings-callout-info",
	calloutWarn: ".dd-settings-callout-warn",
	browserConfigs: ".dd-browser-configs",
	browserProfileSub: ".dd-browser-profile-sub",
	sensitivityCategories: ".dd-sensitivity-categories",
	setupGuide: ".dd-setup-guide",
	headingIcon: ".dd-heading-icon",
} as const;

/**
 * Find a settings nav item by its label text.
 * Returns a selector string for use with WDIO $() commands.
 */
export function settingsNavItem(label: string): string {
	return `${SEL.settingsNav}=${label}`;
}

/**
 * Find a setting heading by its text content.
 */
export function settingHeading(text: string): string {
	return `${SEL.settingHeading}*=${text}`;
}
