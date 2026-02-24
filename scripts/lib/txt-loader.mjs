/**
 * txt-loader.mjs — Node.js ESM loader for .txt and .wasm files
 *
 * Handles file types that the default Node.js ESM loader rejects:
 *   .txt  — exported as a string (matches esbuild's `loader: { ".txt": "text" }`)
 *   .wasm — exported as a Buffer so sql.js can use it via readFileSync fallback
 *
 * Usage:
 *   npx tsx --loader ./scripts/lib/txt-loader.mjs --tsconfig tsconfig.scripts.json <script>
 */

import { readFile } from "fs/promises";
import { fileURLToPath } from "url";

export async function load(url, context, nextLoad) {
	if (url.endsWith(".txt")) {
		const filePath = fileURLToPath(url);
		const content = await readFile(filePath, "utf-8");
		const escaped = JSON.stringify(content);
		return {
			format: "module",
			source: `export default ${escaped};\n`,
			shortCircuit: true,
		};
	}

	if (url.endsWith(".wasm")) {
		// Return the wasm file as a Buffer exported as default.
		// sql.js can receive the WASM bytes via its `wasmBinary` option,
		// but in the scripts context we just need the import to not crash.
		// The collector-shim catches sql.js errors gracefully.
		const filePath = fileURLToPath(url);
		const bytes = await readFile(filePath);
		// Encode as a Uint8Array literal in the module source
		const arr = JSON.stringify(Array.from(bytes));
		return {
			format: "module",
			source: `export default new Uint8Array(${arr});\n`,
			shortCircuit: true,
		};
	}

	return nextLoad(url, context);
}
