/**
 * deploy.mjs — Copy built plugin files to a local Obsidian vault for testing.
 *
 * Usage:
 *   npm run deploy                          # uses OBSIDIAN_VAULT from .env or auto-detects
 *   npm run deploy -- /path/to/vault        # explicit vault path
 *   OBSIDIAN_VAULT=/path/to/vault npm run deploy
 *
 * Recommended: set OBSIDIAN_VAULT in .env to point at the dedicated test vault
 * (~/obsidian-vaults/daily-digest-test) so builds never land in a personal vault.
 * Copy .env.example → .env to get started.
 *
 * The script copies main.js, manifest.json, and styles.css (if present)
 * into <vault>/.obsidian/plugins/daily-digest/
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import process from "process";

// Load .env if present (no external deps — manual parse)
const envPath = new URL("../.env", import.meta.url).pathname;
if (existsSync(envPath)) {
	const lines = readFileSync(envPath, "utf8").split("\n");
	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		const key = trimmed.slice(0, eq).trim();
		const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
		if (!(key in process.env)) process.env[key] = val;
	}
}

const PLUGIN_ID = JSON.parse(readFileSync("manifest.json", "utf8")).id;

function findVaultPath() {
	// 1. Explicit CLI argument
	const cliArg = process.argv[2];
	if (cliArg) {
		return resolve(cliArg);
	}

	// 2. Environment variable
	if (process.env.OBSIDIAN_VAULT) {
		return resolve(process.env.OBSIDIAN_VAULT);
	}

	// 3. Auto-detect from Obsidian config (macOS)
	const home = process.env.HOME;
	const obsidianConfigDir = join(home, "Library", "Application Support", "obsidian");
	const obsidianJsonPath = join(obsidianConfigDir, "obsidian.json");

	if (existsSync(obsidianJsonPath)) {
		try {
			const config = JSON.parse(readFileSync(obsidianJsonPath, "utf8"));
			const vaults = config.vaults;
			if (vaults) {
				const vaultEntries = Object.values(vaults);
				if (vaultEntries.length === 1) {
					return vaultEntries[0].path;
				}
				if (vaultEntries.length > 1) {
					console.log("\nMultiple Obsidian vaults found:");
					vaultEntries.forEach((v, i) => {
						console.log(`  ${i + 1}. ${v.path}`);
					});
					console.error(
						"\nSet OBSIDIAN_VAULT in .env (recommended) or specify inline:\n" +
						"  echo 'OBSIDIAN_VAULT=/path/to/vault' >> .env\n" +
						"  npm run deploy -- /path/to/vault\n"
					);
					process.exit(1);
				}
			}
		} catch {
			// Fall through to error
		}
	}

	// 4. Check common macOS vault locations
	const commonPaths = [
		join(home, "Documents", "Obsidian"),
		join(home, "Obsidian"),
		join(home, "Documents", "Obsidian Vault"),
	];

	for (const p of commonPaths) {
		if (existsSync(join(p, ".obsidian"))) {
			return p;
		}
	}

	console.error(
		"Could not auto-detect Obsidian vault. Specify the path:\n" +
		"  npm run deploy -- /path/to/vault\n" +
		"  OBSIDIAN_VAULT=/path/to/vault npm run deploy\n"
	);
	process.exit(1);
}

const vaultPath = findVaultPath();
const pluginDir = join(vaultPath, ".obsidian", "plugins", PLUGIN_ID);

// Verify vault looks valid
if (!existsSync(join(vaultPath, ".obsidian"))) {
	console.error(`Error: "${vaultPath}" does not appear to be an Obsidian vault (no .obsidian directory).`);
	process.exit(1);
}

// Ensure plugin directory exists
mkdirSync(pluginDir, { recursive: true });

// Files to copy
const files = ["main.js", "manifest.json", "styles.css"];
let copied = 0;

// sql-wasm.wasm is not bundled into main.js — it is loaded at runtime from
// the plugin directory. Copy it from node_modules so the plugin can find it.
const WASM_SRC = join("node_modules", "sql.js", "dist", "sql-wasm.wasm");
if (existsSync(WASM_SRC)) {
	copyFileSync(WASM_SRC, join(pluginDir, "sql-wasm.wasm"));
	console.log(`  sql-wasm.wasm → ${join(pluginDir, "sql-wasm.wasm")}`);
	copied++;
} else {
	console.warn("  WARNING: sql-wasm.wasm not found — browser history collection will fail.");
}

for (const file of files) {
	if (existsSync(file)) {
		copyFileSync(file, join(pluginDir, file));
		console.log(`  ${file} → ${join(pluginDir, file)}`);
		copied++;
	}
}

if (copied === 0) {
	console.error("No build artifacts found. Run 'npm run build' first.");
	process.exit(1);
}

console.log(`\nDeployed ${copied} file(s) to ${pluginDir}`);
console.log("Reload Obsidian or use the 'Reload app without saving' command (Ctrl+R / Cmd+R).");
