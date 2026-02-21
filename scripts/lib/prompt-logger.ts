export interface PromptLogEntry {
  stage: "classify" | "embed" | "summarize";
  model: string;
  tokenCount: number;
  privacyTier?: 1 | 2 | 3 | 4;
  prompt: string;
}

export type PromptLog = PromptLogEntry[];

export function createPromptLog(): PromptLog {
  return [];
}

export function appendPromptEntry(log: PromptLog, entry: PromptLogEntry): void {
  log.push(entry);
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function formatDetailsBlock(entry: PromptLogEntry): string {
  const tierLabel = entry.privacyTier ? ` · Tier ${entry.privacyTier}` : "";
  const summary = `Prompt sent to ${entry.model} · ${entry.tokenCount} tokens${tierLabel}`;
  return [
    "<details>",
    `<summary>${summary}</summary>`,
    "",
    "```",
    entry.prompt,
    "```",
    "",
    "</details>",
  ].join("\n");
}
