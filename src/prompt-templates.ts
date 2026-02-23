import { existsSync, readFileSync } from "fs";
import { join } from "path";
import standardTxt from "../prompts/standard.txt";
import compressedTxt from "../prompts/compressed.txt";
import ragTxt from "../prompts/rag.txt";
import classifiedTxt from "../prompts/classified.txt";
import deidentifiedTxt from "../prompts/deidentified.txt";

export type PromptName = "standard" | "compressed" | "rag" | "classified" | "deidentified";

export const BUILT_IN_PROMPTS: Record<PromptName, string> = {
	standard: standardTxt,
	compressed: compressedTxt,
	rag: ragTxt,
	classified: classifiedTxt,
	deidentified: deidentifiedTxt,
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
