/**
 * Automated daily digest note screenshots.
 *
 * Each scenario opens an example .md file in Obsidian's reading view
 * and captures a section for use in the README.
 *
 * Naming convention: digest-<scenario>.png
 */

import {
	dismissOnboarding,
	collapseSidebars,
	openNoteInReadingView,
	scrollToCalloutTitle,
	captureFullPage,
} from "../helpers/screenshot";

/**
 * Scroll to the very top of the current reading view.
 */
async function scrollToTop(): Promise<void> {
	const container = await $(".markdown-reading-view");
	await browser.execute(
		(el: HTMLElement) => el.scrollTo(0, 0),
		container as unknown as HTMLElement
	);
	await browser.pause(300);
}

describe("Daily Digest Note Screenshots", () => {
	// Dismiss the onboarding modal if it's still showing.
	// The privacy spec handles this when running the full suite,
	// but this ensures digest specs work when run in isolation too.
	before(async () => {
		await dismissOnboarding();
		await collapseSidebars();
	});

	describe("Deep-focus dev day (2025-06-18)", () => {
		before(async () => {
			await openNoteInReadingView("2025-06-18");
		});

		it("should capture hero shot (title + summary + notable)", async () => {
			await scrollToTop();
			await captureFullPage("digest-hero");
		});

		it("should capture browser activity section", async () => {
			await scrollToCalloutTitle("Browser Activity");
			await captureFullPage("digest-browser");
		});

		it("should capture searches and Claude sections", async () => {
			await scrollToCalloutTitle("Searches");
			await captureFullPage("digest-searches-claude");
		});
	});

	describe("Meeting-heavy day (2025-06-19)", () => {
		before(async () => {
			await openNoteInReadingView("2025-06-19");
		});

		it("should capture meeting-heavy day overview", async () => {
			await scrollToTop();
			await captureFullPage("digest-meeting-day");
		});
	});

	describe("No-AI mode (2025-06-20)", () => {
		before(async () => {
			await openNoteInReadingView("2025-06-20");
		});

		it("should capture no-AI mode output", async () => {
			await scrollToTop();
			await captureFullPage("digest-no-ai");
		});
	});
});
