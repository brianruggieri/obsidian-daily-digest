#!/usr/bin/env tsx
/**
 * Verify that every key in DailyDigestSettings has an entry in the
 * settings registry, and that the registry contains no unknown keys.
 *
 * Usage (from project root):
 *   npm run docs:check
 *
 * Exits with code 1 if any keys are missing or unknown, so CI can gate on it.
 */

import { SETTINGS_REGISTRY } from "../src/settings-registry";
import { DEFAULT_SETTINGS } from "../src/settings/types";

const settingsKeys = new Set(Object.keys(DEFAULT_SETTINGS));
const registryKeys = new Set(SETTINGS_REGISTRY.map((m) => m.key));

let ok = true;

// Check for keys in DailyDigestSettings that are missing from the registry.
const missing = [...settingsKeys].filter((k) => !registryKeys.has(k));
if (missing.length > 0) {
	console.error(
		`❌ Settings keys missing from registry (${missing.length}):\n` +
		missing.map((k) => `   - ${k}`).join("\n") +
		"\n\nAdd these keys to src/settings-registry.ts."
	);
	ok = false;
}

// Check for keys in the registry that no longer exist in DailyDigestSettings.
const unknown = [...registryKeys].filter((k) => !settingsKeys.has(k));
if (unknown.length > 0) {
	console.error(
		`❌ Registry keys not found in DailyDigestSettings (${unknown.length}):\n` +
		unknown.map((k) => `   - ${k}`).join("\n") +
		"\n\nRemove or rename these keys in src/settings-registry.ts."
	);
	ok = false;
}

if (ok) {
	console.log(
		`✅ Registry complete: all ${settingsKeys.size} settings keys are documented.`
	);
	process.exit(0);
} else {
	process.exit(1);
}
