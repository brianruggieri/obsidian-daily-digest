import js from "@eslint/js";
import ts from "typescript-eslint";
import globals from "globals";

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
		rules: {
			"no-unused-vars": "off",
			"@typescript-eslint/no-unused-vars": [
				"error",
				{ argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
			],
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/ban-ts-comment": "off",
			"no-console": "error",
		},
	},
	{
		files: ["src/log.ts"],
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
		ignores: ["main.js", "node_modules/", "*.mjs"],
	},
);
