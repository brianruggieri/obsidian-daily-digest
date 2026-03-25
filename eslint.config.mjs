import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const obsidianmd = require("eslint-plugin-obsidianmd").default;

export default ts.config(
	js.configs.recommended,
	...ts.configs.recommended,
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node,
			},
		},
		plugins: {
			obsidianmd,
		},
		rules: {
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/ban-ts-comment": "off",
			"no-console": "error",
			"obsidianmd/ui/sentence-case": ["error", {
				brands: [
					"Daily Digest",
					"Anthropic",
					"Claude Code",
					"Codex CLI",
					"Ollama",
					"LM Studio",
					"Claude Haiku",
					"Claude Sonnet",
					"Claude Opus",
					"OpenAI",
					"Dataview",
					"GitHub",
					"Obsidian",
					"MOC",
					"MOCs",
					"AI",
					"YYYY",
					"MM",
					"DD",
				],
				ignoreRegex: [
					"^https?://",
					"^sk-",
					"^qwen",
					"^brew ",
					"^ollama ",
					"lmstudio\\.ai",
					"\\bDetect\\b",
					"Generate .* icon",
					"Data Preview",
				],
			}],
			"obsidianmd/settings-tab/no-manual-html-headings": "error",
			"obsidianmd/settings-tab/no-problematic-settings-headings": "error",
			"obsidianmd/no-static-styles-assignment": "error",
			"obsidianmd/hardcoded-config-path": "error",
		},
	},
	{
		files: ["src/plugin/log.ts"],
		rules: {
			"no-console": "off",
		},
	},
	{
		files: ["tests/**/*.ts"],
		rules: {
			"no-console": "off",
		},
	},
	{
		files: ["src/filter/categorize.ts"],
		rules: {
			"obsidianmd/hardcoded-config-path": "off",
		},
	},
	{
		ignores: ["main.js", "node_modules/", "*.mjs"],
	},
);
