/**
 * bundle-analyze.mjs — Generate an esbuild metafile and print bundle composition.
 *
 * Usage:
 *   npm run build:analyze
 *
 * Outputs the top 30 contributors to bundle size (by unminified byte count),
 * and writes /tmp/metafile.json for use with https://esbuild.github.io/analyze/
 */

import esbuild from "esbuild";
import { builtinModules } from "node:module";
import { writeFileSync, statSync } from "node:fs";
import { join } from "node:path";
import process from "process";

const result = await esbuild.build({
	entryPoints: ["src/plugin/main.ts"],
	bundle: true,
	external: [
		"obsidian",
		"electron",
		"@codemirror/autocomplete",
		"@codemirror/collab",
		"@codemirror/commands",
		"@codemirror/language",
		"@codemirror/lint",
		"@codemirror/search",
		"@codemirror/state",
		"@codemirror/view",
		"@lezer/common",
		"@lezer/highlight",
		"@lezer/lr",
		...builtinModules,
	],
	format: "cjs",
	target: "es2018",
	treeShaking: true,
	outfile: "/tmp/main-analyze.js",
	metafile: true,
	minify: true,
	logLevel: "silent",
});

const metafilePath = "/tmp/metafile.json";
writeFileSync(metafilePath, JSON.stringify(result.metafile, null, 2));

const inputs = result.metafile.inputs;
const sorted = Object.entries(inputs)
	.map(([file, meta]) => ({ file, bytes: meta.bytes }))
	.sort((a, b) => b.bytes - a.bytes)
	.slice(0, 30);

const totalInput = Object.values(inputs).reduce((s, v) => s + v.bytes, 0);
const outSize = statSync("/tmp/main-analyze.js").size;

console.log("\nBundle composition (top 30 by unminified size):\n");
console.log("   Size     File");
console.log("   ────     ────");
for (const { file, bytes } of sorted) {
	const kb = (bytes / 1024).toFixed(1).padStart(7);
	console.log(`${kb} KB  ${file}`);
}

console.log(`\nTotal input:   ${(totalInput / 1024).toFixed(1)} KB`);
console.log(`Minified output: ${(outSize / 1024).toFixed(1)} KB`);
console.log(`\nMetafile written to: ${metafilePath}`);
console.log("Paste it at https://esbuild.github.io/analyze/ for a visual breakdown.\n");

process.exit(0);
