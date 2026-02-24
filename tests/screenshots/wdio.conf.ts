/**
 * WebdriverIO configuration for automated Obsidian screenshots.
 *
 * Uses wdio-obsidian-service to launch a sandboxed Obsidian instance
 * with the plugin installed, and @wdio/visual-service for screenshot
 * capture + visual regression.
 *
 * Run: npm run screenshots
 * Setup: npm run screenshots:setup (creates vault template first)
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.resolve(__dirname, "../.obsidian-cache");

export const config: WebdriverIO.Config = {
	runner: "local",
	framework: "mocha",
	// Privacy spec must run first to capture then dismiss the onboarding
	// modal. Remaining specs can run in any order after that.
	specs: [
		"./specs/privacy.screenshot.ts",
		"./specs/digest.screenshot.ts",
		"./specs/settings.screenshot.ts",
	],

	maxInstances: 1, // One Obsidian instance at a time for deterministic screenshots

	capabilities: [
		{
			browserName: "obsidian",
			browserVersion: "latest",
			"wdio:obsidianOptions": {
				installerVersion: "earliest",
				plugins: [path.resolve(__dirname, "..")], // Project root where manifest.json lives
				vault: path.resolve(__dirname, "vault"),
			},
		},
	],

	logLevel: "warn",
	bail: 0,
	waitforTimeout: 10000,
	waitforInterval: 250,
	connectionRetryTimeout: 30000,
	connectionRetryCount: 1,

	mochaOpts: {
		ui: "bdd",
		timeout: 60000, // Screenshots need time for Obsidian to render
	},

	services: [
		"obsidian",
		[
			"visual",
			{
				baselineFolder: path.resolve(__dirname, "baseline"),
				screenshotPath: path.resolve(__dirname, "output"),
				formatImageName: "{tag}",
				misMatchPercentage: 2, // Allow 2% pixel diff (anti-aliasing, fonts)
				clearRuntimeFolder: false,
			},
		],
	],

	reporters: ["obsidian"],

	cacheDir,
};
