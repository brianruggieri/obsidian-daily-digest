import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { resolve } from "path";

export default defineConfig(({ mode }) => {
	// Load .env file so ANTHROPIC_API_KEY and other eval vars are available.
	// Passing '' as the prefix loads ALL vars (not just VITE_-prefixed ones).
	const env = loadEnv(mode ?? "test", process.cwd(), "");
	Object.assign(process.env, env);

	return {
		test: {
			globals: true,
			include: [
				"tests/unit/**/*.test.ts",
				"tests/integration/**/*.test.ts",
				"tests/eval/**/*.eval.ts",
			],
			setupFiles: ["tests/setup.ts"],
			testTimeout: 30000,
			hookTimeout: 60000,
		},
		resolve: {
			alias: {
				obsidian: resolve(__dirname, "tests/mocks/obsidian.ts"),
			},
		},
	};
});
