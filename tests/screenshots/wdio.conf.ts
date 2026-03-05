/**
 * WebdriverIO configuration for automated Obsidian screenshots.
 *
 * Uses wdio-obsidian-service to launch a sandboxed Obsidian instance
 * with the plugin installed. Screenshots are captured via macOS-native
 * `screencapture -l <cgWindowId>` (see helpers/screenshot.ts) to produce
 * PNGs with window chrome — title bar, rounded corners, drop shadow.
 *
 * Run: npm run screenshots
 * Setup: npm run screenshots:setup (creates vault template first)
 */

import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const cacheDir = path.resolve(projectRoot, ".obsidian-cache");

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
				plugins: [projectRoot], // Project root where manifest.json + main.js live
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

	services: ["obsidian"],

	reporters: ["obsidian"],

	cacheDir,
};
