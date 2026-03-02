/**
 * Automated privacy onboarding modal screenshot.
 *
 * Captures the "Welcome to Daily Digest" consent modal that appears
 * on first run. This spec must run BEFORE other specs that need the
 * modal dismissed (digest, settings).
 *
 * Naming convention: privacy-<scenario>.png
 */

import {
	dismissOnboarding,
	collapseSidebars,
	captureFullPage,
} from "../helpers/screenshot";

describe("Privacy Onboarding Modal Screenshots", () => {
	it("should capture the onboarding consent modal", async () => {
		// The modal opens automatically on plugin load because
		// hasCompletedOnboarding defaults to false. Wait for it
		// to render fully.
		const modal = await $(".daily-digest-onboarding-modal");
		await modal.waitForExist({ timeout: 10000 });
		await collapseSidebars();
		await browser.pause(500);

		await captureFullPage("privacy-onboarding");
	});

	it("should dismiss the modal for subsequent specs", async () => {
		await dismissOnboarding();

		// Verify the modal is gone
		const modal = await $(".daily-digest-onboarding-modal");
		const gone = await modal.waitForExist({
			timeout: 3000,
			reverse: true,
		});
		expect(gone).toBe(true);
	});
});
