/**
 * browser-profiles.ts
 *
 * Cross-platform browser profile discovery for Daily Digest.
 *
 * PRIVACY DESIGN
 * ──────────────
 * This module performs read-only filesystem scans to enumerate which browser
 * profiles exist on the user's machine. It is explicitly scoped to the minimum
 * data required for display and collection:
 *
 *   Chromium (Chrome / Brave / Edge):
 *     • Scans User Data directory for profile subdirectories ("Default", "Profile N")
 *     • Reads ONE field from Local State JSON: profile.info_cache[dir].name
 *     • NEVER reads: os_crypt, Login Data, Cookies, Web Data, or any encrypted field
 *
 *   Firefox:
 *     • Reads profiles.ini — only the [ProfileN] Name= and Path= fields
 *     • NEVER reads: key4.db, logins.json, cookies.sqlite, or any credential file
 *
 *   Safari (macOS only):
 *     • Single history database, no profiles — returns a synthetic "Default" entry
 *
 * Nothing in this module is persisted except what the caller explicitly saves to
 * settings. The raw Local State JSON and profiles.ini content are never stored,
 * logged, or transmitted — only the safe display name string is kept.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import { homedir, platform } from "os";
import { join } from "path";
import { BrowserInstallConfig, BrowserPathConfig, DetectedProfile, BROWSER_PATH_CONFIGS } from "../types";

// ── Path helpers ─────────────────────────────────────────

/**
 * Resolves path prefixes that vary by OS.
 * Handles ~/ (Unix home), %LOCALAPPDATA%, and %APPDATA% (Windows).
 */
export function expandHome(p: string): string {
	if (p.startsWith("~/")) {
		return join(homedir(), p.slice(2));
	}
	if (p.startsWith("%LOCALAPPDATA%")) {
		const base = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
		return join(base, p.slice("%LOCALAPPDATA%/".length));
	}
	if (p.startsWith("%APPDATA%")) {
		const base = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
		return join(base, p.slice("%APPDATA%/".length));
	}
	return p;
}

/**
 * Returns the User Data base directory for a given browser on the current OS,
 * or null if the browser isn't configured for this platform.
 */
function resolveUserDataDir(config: BrowserPathConfig): string | null {
	const os = platform() as "darwin" | "win32" | "linux";
	const template = config.userDataDirs[os];
	if (!template) return null;
	return expandHome(template);
}

// ── Chromium profile discovery ───────────────────────────

/**
 * Enumerates profile directory names inside a Chromium User Data directory.
 * Only returns entries whose name matches "Default" or "Profile N" (where N is
 * a positive integer). This pattern avoids mistaking internal directories like
 * "Crashpad", "GrShaderCache", "Profile Sync" or "System Profile" for user
 * profiles.
 */
export function chromiumProfileDirs(userDataDir: string): string[] {
	if (!existsSync(userDataDir)) return [];
	try {
		return readdirSync(userDataDir).filter((entry) => {
			// Only include entries that are directories
			try {
				if (!statSync(join(userDataDir, entry)).isDirectory()) return false;
			} catch {
				return false;
			}
			return entry === "Default" || /^Profile \d+$/.test(entry);
		});
	} catch {
		return [];
	}
}

/**
 * Safely parses the Chromium Local State file and returns a map of
 * profileDir → display name.
 *
 * SAFETY CONTRACT: Only reads profile.info_cache[N].name.
 * All other fields (os_crypt, gaia_id, gaia_name, user_name, hosted_domain,
 * sync_authorization_status, etc.) are structurally ignored — the return type
 * is Record<string,string> so no sensitive data can leak through.
 *
 * Returns {} on any error (file missing, JSON invalid, wrong structure).
 */
export function parseChromiumLocalState(userDataDir: string): Record<string, string> {
	const localStatePath = join(userDataDir, "Local State");
	if (!existsSync(localStatePath)) return {};
	try {
		const raw = readFileSync(localStatePath, "utf-8");
		// Parse cautiously — Local State is a large file with many sensitive fields.
		// We destructure only the exact path we need; everything else is discarded.
		const parsed = JSON.parse(raw) as {
			profile?: {
				info_cache?: Record<string, { name?: string }>;
			};
		};
		const infoCache = parsed?.profile?.info_cache;
		if (!infoCache || typeof infoCache !== "object") return {};

		const result: Record<string, string> = {};
		for (const [profileDir, info] of Object.entries(infoCache)) {
			// Only the name field — nothing else is extracted.
			if (typeof info?.name === "string" && info.name.trim()) {
				result[profileDir] = info.name.trim();
			}
		}
		return result;
	} catch {
		// Any error (JSON parse, file read, unexpected structure) → safe fallback
		return {};
	}
}

/**
 * Scans a Chromium-based browser's User Data directory and returns a
 * BrowserInstallConfig describing every profile found on disk.
 *
 * Profile display names are sourced from Local State if available; otherwise
 * the directory name is used as-is ("Default", "Profile 1", etc.).
 */
function scanChromiumBrowser(browserId: string, config: BrowserPathConfig): BrowserInstallConfig {
	const userDataDir = resolveUserDataDir(config);
	if (!userDataDir || !existsSync(userDataDir)) {
		return { browserId, enabled: false, profiles: [], selectedProfiles: [] };
	}

	const displayNames = parseChromiumLocalState(userDataDir);
	const profileDirs = chromiumProfileDirs(userDataDir);

	const profiles: DetectedProfile[] = profileDirs.map((profileDir) => {
		const historyPath = join(userDataDir, profileDir, "History");
		return {
			profileDir,
			displayName: displayNames[profileDir] || profileDir,
			historyPath,
			hasHistory: existsSync(historyPath),
		};
	}).filter((p) => p.hasHistory); // Only include profiles with actual history data

	return {
		browserId,
		enabled: false,    // Always off by default — user must opt in
		profiles,
		selectedProfiles: [],
	};
}

// ── Firefox profile discovery ────────────────────────────

/**
 * Parses a Firefox profiles.ini file and returns a list of profile entries.
 *
 * SAFETY CONTRACT: Only reads [ProfileN] section Name= and Path= values.
 * Ignores all other sections (Installs, General) and all other fields within
 * profile sections. Never reads key4.db, logins.json, or cookies.sqlite.
 *
 * Returns [] on any error.
 */
export function parseFirefoxProfilesIni(
	profilesDir: string
): Array<{ dir: string; name: string }> {
	const iniPath = join(profilesDir, "profiles.ini");
	if (!existsSync(iniPath)) return [];

	try {
		const content = readFileSync(iniPath, "utf-8");
		const results: Array<{ dir: string; name: string }> = [];
		let currentName: string | null = null;
		let currentPath: string | null = null;
		let isRelative = true;
		let inProfileSection = false;

		for (const rawLine of content.split(/\r?\n/)) {
			const line = rawLine.trim();

			if (/^\[Profile\d+\]$/i.test(line)) {
				// Flush previous profile if complete
				if (inProfileSection && currentPath) {
					const dir = isRelative ? join(profilesDir, currentPath) : currentPath;
					results.push({ dir, name: currentName || currentPath });
				}
				currentName = null;
				currentPath = null;
				isRelative = true;
				inProfileSection = true;
				continue;
			}

			// If we hit a non-profile section header while in a profile, flush and exit
			if (line.startsWith("[") && line.endsWith("]") && inProfileSection) {
				if (currentPath) {
					const dir = isRelative ? join(profilesDir, currentPath) : currentPath;
					results.push({ dir, name: currentName || currentPath });
				}
				inProfileSection = false;
				currentName = null;
				currentPath = null;
				continue;
			}

			if (!inProfileSection) continue;

			// Only extract Name= and Path= — everything else is discarded
			const nameMatch = line.match(/^Name=(.+)$/i);
			if (nameMatch) { currentName = nameMatch[1].trim(); continue; }

			const pathMatch = line.match(/^Path=(.+)$/i);
			if (pathMatch) { currentPath = pathMatch[1].trim(); continue; }

			const relMatch = line.match(/^IsRelative=(\d)$/i);
			if (relMatch) { isRelative = relMatch[1] === "1"; continue; }
		}

		// Flush final profile
		if (inProfileSection && currentPath) {
			const dir = isRelative ? join(profilesDir, currentPath) : currentPath;
			results.push({ dir, name: currentName || currentPath });
		}

		return results;
	} catch {
		return [];
	}
}

/**
 * Scans Firefox profiles and returns a BrowserInstallConfig.
 * Uses profiles.ini for profile names; verifies places.sqlite exists.
 */
function scanFirefoxBrowser(config: BrowserPathConfig): BrowserInstallConfig {
	const baseDir = resolveUserDataDir(config);
	if (!baseDir || !existsSync(baseDir)) {
		return { browserId: "firefox", enabled: false, profiles: [], selectedProfiles: [] };
	}

	const profilesDir = join(baseDir, "Profiles");
	const parsedProfiles = parseFirefoxProfilesIni(
		existsSync(profilesDir) ? profilesDir : baseDir
	);

	const profiles: DetectedProfile[] = parsedProfiles
		.map(({ dir, name }) => {
			const historyPath = join(dir, "places.sqlite");
			return {
				profileDir: dir,      // Full path used as the key for Firefox (no simple dir name)
				displayName: name,
				historyPath,
				hasHistory: existsSync(historyPath),
			};
		})
		.filter((p) => p.hasHistory);

	return {
		browserId: "firefox",
		enabled: false,
		profiles,
		selectedProfiles: [],
	};
}

// ── Safari discovery (macOS only) ────────────────────────

/**
 * Safari has a single history database and no user profiles.
 * Returns a synthetic "Default" DetectedProfile pointing to History.db.
 * Returns an empty config on non-macOS platforms.
 */
function scanSafariBrowser(config: BrowserPathConfig): BrowserInstallConfig {
	if (platform() !== "darwin") {
		return { browserId: "safari", enabled: false, profiles: [], selectedProfiles: [] };
	}

	const safariDir = resolveUserDataDir(config);
	if (!safariDir) {
		return { browserId: "safari", enabled: false, profiles: [], selectedProfiles: [] };
	}

	const historyPath = join(safariDir, "History.db");
	const profiles: DetectedProfile[] = existsSync(historyPath)
		? [{ profileDir: "Default", displayName: "Default", historyPath, hasHistory: true }]
		: [];

	return {
		browserId: "safari",
		enabled: false,
		profiles,
		selectedProfiles: [],
	};
}

// ── Master detection entry point ─────────────────────────

/**
 * Scans the system for all supported browsers and their profiles.
 *
 * Called by the "Detect Browsers & Profiles" button in Settings.
 * Returns only browsers where at least one profile with history was found.
 * All returned BrowserInstallConfigs have enabled=false and selectedProfiles=[]
 * — the user must explicitly opt in to each profile.
 */
export async function detectAllBrowsers(): Promise<BrowserInstallConfig[]> {
	const results: BrowserInstallConfig[] = [];

	for (const [browserId, config] of Object.entries(BROWSER_PATH_CONFIGS)) {
		let detected: BrowserInstallConfig;

		switch (config.type) {
			case "chromium":
				detected = scanChromiumBrowser(browserId, config);
				break;
			case "firefox":
				detected = scanFirefoxBrowser(config);
				break;
			case "safari":
				detected = scanSafariBrowser(config);
				break;
			default:
				continue;
		}

		// Only include browsers where we actually found history
		if (detected.profiles.length > 0) {
			results.push(detected);
		}
	}

	return results;
}

// ── Settings merge helper ─────────────────────────────────

/**
 * Merges freshly-detected browser configs with the user's existing settings.
 *
 * Rules:
 *   • For browsers already in existing settings, preserve enabled and selectedProfiles.
 *   • For newly discovered browsers, start with enabled=false, selectedProfiles=[].
 *   • Remove profiles no longer found on disk from selectedProfiles.
 *   • Never flip an existing ON toggle to OFF.
 *   • Return browsers in a stable order (same as BROWSER_PATH_CONFIGS).
 */
export function mergeDetectedWithExisting(
	detected: BrowserInstallConfig[],
	existing: BrowserInstallConfig[]
): BrowserInstallConfig[] {
	const existingMap = new Map(existing.map((b) => [b.browserId, b]));

	return detected.map((fresh) => {
		const prior = existingMap.get(fresh.browserId);
		if (!prior) return fresh; // Brand-new browser — use fresh defaults (off, nothing selected)

		// Compute which previously-selected profiles still exist on disk
		const freshDirs = new Set(fresh.profiles.map((p) => p.profileDir));
		const stillValid = prior.selectedProfiles.filter((dir) => freshDirs.has(dir));

		return {
			...fresh,
			enabled: prior.enabled,           // Preserve the user's master toggle
			selectedProfiles: stillValid,     // Prune stale profiles, keep valid ones
		};
	});
}

// ── Display helpers ───────────────────────────────────────

/** Human-readable browser display name for use in settings UI labels. */
export const BROWSER_DISPLAY_NAMES: Record<string, string> = {
	chrome:     "Google Chrome",
	brave:      "Brave",
	edge:       "Microsoft Edge",
	arc:        "Arc",
	vivaldi:    "Vivaldi",
	opera:      "Opera",
	"opera-gx": "Opera GX",
	chromium:   "Chromium",
	helium:     "Helium",
	firefox:    "Firefox",
	safari:     "Safari",
};
