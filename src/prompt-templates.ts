import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type PromptName = "standard" | "compressed" | "rag" | "classified" | "deidentified";

// Built-in placeholder defaults — will be populated with actual content in Task A3
export const BUILT_IN_PROMPTS: Record<PromptName, string> = {
	standard: "__BUILT_IN_STANDARD__",
	compressed: "__BUILT_IN_COMPRESSED__",
	rag: "__BUILT_IN_RAG__",
	classified: "__BUILT_IN_CLASSIFIED__",
	deidentified: "__BUILT_IN_DEIDENTIFIED__",
};

/**
 * Load a named prompt template. Looks for <promptsDir>/<name>.txt first.
 * Falls back to the built-in default string if the file doesn't exist.
 */
export function loadPromptTemplate(name: PromptName, promptsDir: string | undefined): string {
	if (promptsDir) {
		const filePath = join(promptsDir, `${name}.txt`);
		if (existsSync(filePath)) {
			return readFileSync(filePath, "utf-8");
		}
	}
	return BUILT_IN_PROMPTS[name];
}

/**
 * Replace all {{variable}} placeholders in a template string.
 * Unknown variables are left unchanged.
 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
	return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}
