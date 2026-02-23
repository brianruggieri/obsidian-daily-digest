# Pipeline Inspector & Richer Output Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a per-stage pipeline inspector (CLI + Obsidian debug modal), extract all LLM prompts to editable disk-based template files, and enrich the AI output schema + Obsidian note rendering for better knowledge retrieval.

**Architecture:** Three sequential phases, each buildable independently. Phase A extracts the 5 hardcoded prompt builders into `{{variable}}`-interpolated `.txt` template files loaded at runtime, with graceful fallback to built-in defaults. Phase B adds `scripts/inspect.ts` — a CLI tool that runs any pipeline stage against real or fixture data and dumps the output as JSON, stats, or rendered markdown. Phase C adds new optional fields to `AISummary` (timeline, cross-source connections, work patterns, momentum) and upgrades `renderer.ts` to use Obsidian callouts, tables, and collapsible sections for richer knowledge retrieval.

**Tech Stack:** TypeScript strict, Vitest, `tsx` runner for scripts, Obsidian Plugin API (modals only for debug), esbuild CommonJS output.

**Worktree:** `.worktrees/feat-pipeline-inspector` on branch `feat/pipeline-inspector`

**Run all tests:** `source ~/.nvm/nvm.sh && nvm use && npm run test:unit`
**Run lint:** `npm run lint`

---

## Phase A — Prompt Template System

### Task A1: Template loader module (TDD)

**Files:**
- Create: `src/prompt-templates.ts`
- Create: `tests/unit/prompt-templates.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/unit/prompt-templates.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";

vi.mock("fs");

describe("loadPromptTemplate", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns file content when template file exists", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue("Hello {{name}}!" as any);
    const { loadPromptTemplate } = await import("../../src/prompt-templates");
    const result = loadPromptTemplate("standard", "/some/dir");
    expect(result).toBe("Hello {{name}}!");
  });

  it("returns built-in default when file does not exist", async () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    const { loadPromptTemplate, BUILT_IN_PROMPTS } = await import("../../src/prompt-templates");
    const result = loadPromptTemplate("standard", "/some/dir");
    expect(result).toBe(BUILT_IN_PROMPTS["standard"]);
  });

  it("returns built-in default when promptsDir is undefined", async () => {
    const { loadPromptTemplate, BUILT_IN_PROMPTS } = await import("../../src/prompt-templates");
    const result = loadPromptTemplate("standard", undefined);
    expect(result).toBe(BUILT_IN_PROMPTS["standard"]);
  });
});

describe("fillTemplate", () => {
  it("replaces all {{variable}} occurrences", async () => {
    const { fillTemplate } = await import("../../src/prompt-templates");
    const result = fillTemplate("Hello {{name}}, you are {{age}}.", { name: "Alice", age: "30" });
    expect(result).toBe("Hello Alice, you are 30.");
  });

  it("leaves unreplaced variables as-is", async () => {
    const { fillTemplate } = await import("../../src/prompt-templates");
    const result = fillTemplate("Hello {{name}}.", {});
    expect(result).toBe("Hello {{name}}.");
  });
});
```

**Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npx vitest run tests/unit/prompt-templates.test.ts 2>&1 | tail -10
```

Expected: FAIL — `prompt-templates` module does not exist.

**Step 3: Implement the module**

```typescript
// src/prompt-templates.ts
import { existsSync, readFileSync } from "fs";
import { join } from "path";

export type PromptName = "standard" | "compressed" | "rag" | "classified" | "deidentified";

// Built-in placeholder defaults — Phase C will replace these with full prompt text
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
```

**Step 4: Run test to verify it passes**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npx vitest run tests/unit/prompt-templates.test.ts 2>&1 | tail -10
```

Expected: PASS (all 5 tests).

**Step 5: Commit**

```bash
cd .worktrees/feat-pipeline-inspector
git add src/prompt-templates.ts tests/unit/prompt-templates.test.ts
git commit -m "feat: add prompt template loader with disk-first fallback"
```

---

### Task A2: Create the prompt template files

**Files:**
- Create: `prompts/standard.txt`
- Create: `prompts/compressed.txt`
- Create: `prompts/rag.txt`
- Create: `prompts/classified.txt`
- Create: `prompts/deidentified.txt`
- Create: `prompts/README.md`

**Step 1: Extract standard prompt** — copy the current `buildPrompt` return string from `src/summarize.ts:48-80` into `prompts/standard.txt`, replacing runtime expressions with `{{variable}}` placeholders:

Variables: `{{dateStr}}`, `{{contextHint}}`, `{{browserActivity}}`, `{{searches}}`, `{{claudePrompts}}`, `{{shellCommands}}`, `{{gitCommits}}`

```text
You are summarizing a person's digital activity for {{dateStr}}.
Your job is to distill raw activity logs into useful, human-readable intelligence for a personal knowledge base.{{contextHint}}

## Browser activity by category:
{{browserActivity}}

## Search queries:
{{searches}}

## Claude Code / AI prompts:
{{claudePrompts}}

## Shell commands (secrets redacted):
{{shellCommands}}

## Git commits:
{{gitCommits}}

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence summarizing the whole day (max 15 words)",
  "tldr": "2-3 sentence paragraph. What was this person focused on? What did they accomplish or investigate?",
  "themes": ["3-5 short theme labels inferred from activity, e.g. 'API integration', 'market research', 'debugging'"],
  "category_summaries": {
    "<category_name>": "1-sentence plain-English summary of what they did in this category"
  },
  "notable": ["2-4 specific notable things: interesting searches, unusual patterns, apparent decisions or pivots"],
  "questions": ["1-2 open questions this day's activity raises, useful for future reflection"],
  "work_patterns": ["1-3 behavioral observations, e.g. 'deep 2-hour focus block', 'frequent context switching between X and Y'"],
  "cross_source_connections": ["1-2 connections across data sources, e.g. 'Searched for X, then committed code addressing it'"]
}

Be specific and concrete. Prefer "researched OAuth 2.0 flows for a GitHub integration" over "did some dev work".
Only include category_summaries for categories that actually had activity.
Do not include categories with zero visits.
```

**Step 2: Create `prompts/compressed.txt`** — same structure, different header section:

Variables: `{{dateStr}}`, `{{contextHint}}`, `{{totalEvents}}`, `{{browserActivity}}`, `{{searches}}`, `{{claudePrompts}}`, `{{shellCommands}}`, `{{gitCommits}}`

```text
You are summarizing a person's digital activity for {{dateStr}}.
Your job is to distill raw activity logs into useful, human-readable intelligence for a personal knowledge base.{{contextHint}}

Total events collected: {{totalEvents}}

## Browser activity by category:
{{browserActivity}}

## Search queries:
{{searches}}

## Claude Code / AI prompts:
{{claudePrompts}}

## Shell commands (secrets redacted):
{{shellCommands}}

## Git commits:
{{gitCommits}}

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence summarizing the whole day (max 15 words)",
  "tldr": "2-3 sentence paragraph. What was this person focused on? What did they accomplish or investigate?",
  "themes": ["3-5 short theme labels inferred from activity"],
  "category_summaries": {
    "<category_name>": "1-sentence plain-English summary of what they did in this category"
  },
  "notable": ["2-4 specific notable things: interesting searches, unusual patterns, apparent decisions or pivots"],
  "questions": ["1-2 open questions this day's activity raises, useful for future reflection"],
  "work_patterns": ["1-3 behavioral observations"],
  "cross_source_connections": ["1-2 connections across data sources"]
}

Be specific and concrete.
Only include category_summaries for categories that actually had activity.
```

**Step 3: Create `prompts/rag.txt`**

Variables: `{{dateStr}}`, `{{contextHint}}`, `{{chunkTexts}}`

```text
You are summarizing a person's digital activity for {{dateStr}}.
Your job is to distill activity logs into useful, human-readable intelligence for a personal knowledge base.{{contextHint}}

The following activity blocks were selected as the most relevant from today's data:

{{chunkTexts}}

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence summarizing the whole day (max 15 words)",
  "tldr": "2-3 sentence paragraph. What was this person focused on? What did they accomplish or investigate?",
  "themes": ["3-5 short theme labels inferred from activity"],
  "category_summaries": {
    "<category_name>": "1-sentence plain-English summary of what they did in this category"
  },
  "notable": ["2-4 specific notable things: interesting patterns, apparent decisions or pivots"],
  "questions": ["1-2 open questions this day's activity raises, useful for future reflection"],
  "work_patterns": ["1-3 behavioral observations"],
  "cross_source_connections": ["1-2 connections across data sources"]
}

Be specific and concrete.
Only include category_summaries for categories represented in the activity blocks above.
```

**Step 4: Create `prompts/classified.txt`**

Variables: `{{dateStr}}`, `{{contextHint}}`, `{{totalProcessed}}`, `{{llmClassified}}`, `{{ruleClassified}}`, `{{allTopics}}`, `{{allEntities}}`, `{{activitySections}}`

```text
You are summarizing a person's digital activity for {{dateStr}}.
Your job is to distill classified activity abstractions into useful, human-readable intelligence for a personal knowledge base.{{contextHint}}

## Activity Overview
Total events: {{totalProcessed}} ({{llmClassified}} LLM-classified, {{ruleClassified}} rule-classified)
All topics: {{allTopics}}
All entities: {{allEntities}}

## Activity by Type
{{activitySections}}

Return ONLY a JSON object with these exact keys — no markdown, no preamble:
{
  "headline": "one punchy sentence summarizing the whole day (max 15 words)",
  "tldr": "2-3 sentence paragraph. What was this person focused on? What did they accomplish or investigate?",
  "themes": ["3-5 short theme labels inferred from activity"],
  "category_summaries": {
    "<activity_type>": "1-sentence plain-English summary of what they did in this activity type"
  },
  "notable": ["2-4 specific notable things: interesting patterns, apparent decisions or pivots, cross-domain connections"],
  "questions": ["1-2 open questions this day's activity raises, useful for future reflection"],
  "work_patterns": ["1-3 behavioral observations"],
  "cross_source_connections": ["1-2 connections across data sources"]
}

Be specific and concrete. Refer to the topics and entities mentioned.
Only include category_summaries for activity types that had events.
```

**Step 5: Create `prompts/deidentified.txt`**

Variables: `{{dateStr}}`, `{{contextHint}}`, `{{activityDist}}`, `{{temporalShape}}`, `{{topTopics}}`, `{{entityClusters}}`, `{{topicConnections}}`, `{{recurrenceLines}}`, `{{focusScore}}`, `{{knowledgeDeltaCount}}`

Copy the return value from `src/summarize.ts:buildDeidentifiedPrompt` (lines ~350-420), replacing all runtime expressions with `{{variable}}` placeholders. Add `work_patterns` and `cross_source_connections` to the JSON schema.

**Step 6: Create `prompts/README.md`**

```markdown
# Daily Digest Prompt Templates

These files are loaded at runtime by `src/prompt-templates.ts`.
Edit them to customize the AI instructions without rebuilding the plugin.

## Variables

Each template uses `{{variable}}` placeholders. Unknown variables are left as-is.

| Template | Key variables |
|---|---|
| standard.txt | dateStr, contextHint, browserActivity, searches, claudePrompts, shellCommands, gitCommits |
| compressed.txt | + totalEvents |
| rag.txt | dateStr, contextHint, chunkTexts |
| classified.txt | dateStr, contextHint, totalProcessed, llmClassified, ruleClassified, allTopics, allEntities, activitySections |
| deidentified.txt | dateStr, contextHint, activityDist, temporalShape, topTopics, entityClusters, topicConnections, recurrenceLines, focusScore, knowledgeDeltaCount |

## Override location

Set `promptsDir` in plugin settings (or `--prompts-dir` CLI flag) to a directory
containing `.txt` files. Missing files fall back to built-in defaults.
```

**Step 7: Commit**

```bash
git add prompts/
git commit -m "feat: add editable prompt template files with variable placeholders"
```

---

### Task A3: Wire summarize.ts to use template loader

**Files:**
- Modify: `src/summarize.ts`
- Modify: `src/prompt-templates.ts` — populate BUILT_IN_PROMPTS from template file contents

**Step 1: Update `BUILT_IN_PROMPTS`** in `src/prompt-templates.ts` to read from `prompts/` at build time via esbuild's `fs.readFileSync` (which esbuild handles as inline at bundle time):

```typescript
// At top of src/prompt-templates.ts, import the files as raw strings
// esbuild will inline these at build time
import standardTxt from "../prompts/standard.txt";
import compressedTxt from "../prompts/compressed.txt";
import ragTxt from "../prompts/rag.txt";
import classifiedTxt from "../prompts/classified.txt";
import deidentifiedTxt from "../prompts/deidentified.txt";

export const BUILT_IN_PROMPTS: Record<PromptName, string> = {
  standard: standardTxt,
  compressed: compressedTxt,
  rag: ragTxt,
  classified: classifiedTxt,
  deidentified: deidentifiedTxt,
};
```

**Note:** esbuild needs a loader rule for `.txt`. Add to `esbuild.config.mjs`:

```javascript
// In the build config, add loader for .txt:
loader: {
  ".wasm": "binary",
  ".txt": "text",   // ← ADD THIS
}
```

**Step 2: Update each prompt builder in `src/summarize.ts`** to accept an optional `promptsDir?: string` param and use `loadPromptTemplate` + `fillTemplate`:

For `buildPrompt`:
```typescript
export function buildPrompt(
  date: Date,
  categorized: CategorizedVisits,
  searches: SearchQuery[],
  shellCmds: ShellCommand[],
  claudeSessions: ClaudeSession[],
  profile: string,
  gitCommits: GitCommit[] = [],
  promptsDir?: string
): string {
  // ... build vars object (same logic as before) ...
  const template = loadPromptTemplate("standard", promptsDir);
  return fillTemplate(template, vars);
}
```

Repeat for `buildCompressedPrompt`, `buildRAGPrompt`, `buildClassifiedPrompt`, `buildDeidentifiedPrompt`.

**Step 3: Run existing summarize tests**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npx vitest run tests/unit/summarize.test.ts 2>&1 | tail -15
```

Expected: PASS (all 23 tests).

**Step 4: Run all unit tests**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npm run test:unit 2>&1 | tail -10
```

Expected: all 342+ passing.

**Step 5: Verify build works**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npm run build 2>&1 | tail -10
```

Expected: no errors.

**Step 6: Add `promptsDir` to settings** in `src/settings.ts`:

```typescript
// Add to DailyDigestSettings interface:
promptsDir: string;

// Add to DEFAULT_SETTINGS:
promptsDir: "",
```

Add a settings UI field in `src/settings.ts` in the AI section:
```typescript
new Setting(containerEl)
  .setName("Prompt templates directory")
  .setDesc("Path to directory containing standard.txt, rag.txt, etc. Leave empty to use built-in prompts.")
  .addText(text => text
    .setPlaceholder("e.g. ~/prompts/daily-digest")
    .setValue(this.plugin.settings.promptsDir)
    .onChange(async (value) => {
      this.plugin.settings.promptsDir = value;
      await this.plugin.saveSettings();
    }));
```

**Step 7: Wire promptsDir through main.ts** — pass `this.settings.promptsDir` to `summarizeDay` (which should pass it through to the prompt builders).

**Step 8: Commit**

```bash
git add src/prompt-templates.ts src/summarize.ts src/settings.ts esbuild.config.mjs prompts/
git commit -m "feat: wire prompt template loader into summarize.ts and settings"
```

---

## Phase B — CLI Pipeline Inspector

### Task B1: Inspector framework + stages 1-4 (collect → categorize)

**Files:**
- Create: `scripts/inspect.ts`

**Context:** The existing `scripts/daily-matrix.ts` runs all presets. `inspect.ts` runs a single date/stage combination with richer output. It reuses `scripts/lib/collector-shim.ts` for data collection.

**Step 1: Create `scripts/inspect.ts`**

```typescript
/**
 * inspect.ts — Pipeline Inspector CLI
 *
 * Run any pipeline stage against real or fixture data and dump the output.
 *
 * Usage:
 *   npx tsx --tsconfig tsconfig.scripts.json scripts/inspect.ts [options]
 *
 * Options:
 *   --date YYYY-MM-DD     Target date (default: today)
 *   --stage <name>        Stage to inspect (default: rendered)
 *   --format json|md|stats Output format (default: json)
 *   --data-mode fixtures|real  Data source (default: real)
 *   --ai-mode mock|real   AI calls (default: mock)
 *   --prompts-dir <path>  Path to prompt template dir (default: prompts/)
 *   --out <file>          Write output to file instead of stdout
 *
 * Stages:
 *   raw           Collected data (visits, searches, shell, claude, git)
 *   sanitized     After sanitization + sensitivity filter
 *   categorized   After domain categorization
 *   classified    After event classification
 *   patterns      After pattern extraction
 *   knowledge     After knowledge section generation
 *   prompt        The built prompt text sent to LLM
 *   summary       The AI summary JSON
 *   rendered      The final markdown note
 */

import { writeFileSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";
import { parseArgs } from "util";

import { collectFixtureData, collectRealData } from "./lib/collector-shim";
import { BASE_SETTINGS } from "./presets";
import { sanitizeCollectedData } from "../src/sanitize";
import { filterSensitiveDomains, filterSensitiveSearches } from "../src/sensitivity";
import { categorizeVisits } from "../src/categorize";
import { buildPrompt } from "../src/summarize";
import { renderMarkdown } from "../src/renderer";

type Stage = "raw" | "sanitized" | "categorized" | "classified" | "patterns" | "knowledge" | "prompt" | "summary" | "rendered";
type Format = "json" | "md" | "stats";
type DataMode = "fixtures" | "real";
type AIMode = "mock" | "real";

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function expandHome(p: string): string {
  return p.startsWith("~/") ? join(homedir(), p.slice(2)) : p;
}

function printStats(data: unknown): void {
  if (Array.isArray(data)) {
    console.log(`Array of ${data.length} items`);
    if (data.length > 0) console.log("First item:", JSON.stringify(data[0], null, 2));
    return;
  }
  if (typeof data === "object" && data !== null) {
    for (const [k, v] of Object.entries(data)) {
      const val = Array.isArray(v) ? `[${v.length} items]` : typeof v === "string" && v.length > 80 ? v.slice(0, 80) + "…" : v;
      console.log(`  ${k}: ${JSON.stringify(val)}`);
    }
    return;
  }
  console.log(String(data).slice(0, 2000));
}

async function main() {
  const { values } = parseArgs({
    options: {
      date: { type: "string", default: new Date().toISOString().slice(0, 10) },
      stage: { type: "string", default: "rendered" },
      format: { type: "string", default: "json" },
      "data-mode": { type: "string", default: "real" },
      "ai-mode": { type: "string", default: "mock" },
      "prompts-dir": { type: "string", default: resolve("prompts") },
      out: { type: "string" },
    },
    strict: false,
  });

  const date = parseDate(values.date as string);
  const stage = values.stage as Stage;
  const format = values.format as Format;
  const dataMode = values["data-mode"] as DataMode;
  const aiMode = values["ai-mode"] as AIMode;
  const promptsDir = expandHome(values["prompts-dir"] as string);
  const outFile = values.out as string | undefined;

  console.error(`[inspect] date=${values.date} stage=${stage} format=${format} data=${dataMode} ai=${aiMode}`);

  const settings = { ...BASE_SETTINGS };
  settings.enableBrowser = true;
  settings.enableShell = true;
  settings.enableClaude = true;
  settings.enableCodex = true;
  settings.enableGit = true;

  // ── Stage 1: Collect ─────────────────────────────────
  const raw = dataMode === "real" ? await collectRealData(settings) : await collectFixtureData(settings);

  if (stage === "raw") {
    output({ visits: raw.visits, searches: raw.searches, shell: raw.shell, claudeSessions: raw.claudeSessions, gitCommits: raw.gitCommits }, format, outFile);
    return;
  }

  // ── Stage 2: Sanitize + Sensitivity ──────────────────
  const sanitized = sanitizeCollectedData(raw.visits, raw.searches, raw.shell, raw.claudeSessions, raw.gitCommits, {
    enabled: true, level: "standard", excludedDomains: [], redactPaths: false, scrubEmails: true,
  });
  const visitResult = filterSensitiveDomains(sanitized.visits, {
    enabled: true, categories: ["adult", "gambling", "dating"], customDomains: [], action: "exclude",
  });
  const searchResult = filterSensitiveSearches(sanitized.searches, {
    enabled: true, categories: ["adult", "gambling", "dating"], customDomains: [], action: "exclude",
  });

  if (stage === "sanitized") {
    output({ visits: visitResult.kept, searches: searchResult.kept, shell: sanitized.shellCommands, claudeSessions: sanitized.claudeSessions, gitCommits: sanitized.gitCommits, filtered: visitResult.filtered + searchResult.filtered }, format, outFile);
    return;
  }

  // ── Stage 3: Categorize ───────────────────────────────
  const categorized = categorizeVisits(visitResult.kept);

  if (stage === "categorized") {
    const summary: Record<string, number> = {};
    for (const [cat, visits] of Object.entries(categorized)) summary[cat] = visits.length;
    output({ categories: summary, total: visitResult.kept.length }, format, outFile);
    return;
  }

  // ── Stage 4: Prompt ───────────────────────────────────
  if (stage === "prompt") {
    const promptText = buildPrompt(date, categorized, searchResult.kept, sanitized.shellCommands, sanitized.claudeSessions, settings.profile, sanitized.gitCommits, promptsDir);
    output(promptText, "md", outFile);
    return;
  }

  // ── Stage: Rendered (no AI, baseline) ────────────────
  if (stage === "rendered") {
    const md = renderMarkdown(date, visitResult.kept, searchResult.kept, sanitized.shellCommands, sanitized.claudeSessions, sanitized.gitCommits, categorized, null, "none");
    output(md, "md", outFile);
    return;
  }

  console.error(`[inspect] Stage '${stage}' requires --ai-mode real or is not yet implemented. Available now: raw, sanitized, categorized, prompt, rendered`);
  process.exit(1);
}

function output(data: unknown, format: Format, outFile: string | undefined): void {
  let text: string;
  if (format === "json" && typeof data !== "string") {
    text = JSON.stringify(data, null, 2);
  } else if (format === "stats") {
    printStats(data);
    return;
  } else {
    text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  }

  if (outFile) {
    writeFileSync(outFile, text, "utf-8");
    console.error(`[inspect] Written to ${outFile}`);
  } else {
    console.log(text);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
```

**Step 2: Add npm scripts** in `package.json`:

```json
"inspect": "tsx --tsconfig tsconfig.scripts.json scripts/inspect.ts",
"inspect:real": "DATA_MODE=real tsx --tsconfig tsconfig.scripts.json scripts/inspect.ts --data-mode real",
```

**Step 3: Test with real data**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npx tsx --tsconfig tsconfig.scripts.json scripts/inspect.ts --stage raw --format stats --data-mode real 2>&1 | head -30
```

Expected: counts of visits, searches, etc. from your machine.

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npx tsx --tsconfig tsconfig.scripts.json scripts/inspect.ts --stage categorized --format json --data-mode real 2>&1 | head -30
```

Expected: JSON with category → count mapping.

**Step 4: Commit**

```bash
git add scripts/inspect.ts package.json
git commit -m "feat: add pipeline inspector CLI (stages: raw, sanitized, categorized, prompt, rendered)"
```

---

### Task B2: Inspector — AI summary + remaining stages

**Files:**
- Modify: `scripts/inspect.ts`

**Step 1: Wire `classified`, `patterns`, `knowledge`, `summary` stages** — add to `main()` after the categorize block:

```typescript
  // ── Stage: Classify ──────────────────────────────────
  const { classifyEventsRuleOnly } = await import("../src/classify");
  const classification = classifyEventsRuleOnly(
    visitResult.kept, searchResult.kept, sanitized.shellCommands,
    sanitized.claudeSessions, sanitized.gitCommits, categorized
  );

  if (stage === "classified") {
    output({ totalProcessed: classification.totalProcessed, llmClassified: classification.llmClassified, ruleClassified: classification.ruleClassified, eventCount: classification.events.length, sampleEvents: classification.events.slice(0, 5) }, format, outFile);
    return;
  }

  // ── Stage: Patterns ───────────────────────────────────
  const { extractPatterns, buildEmptyTopicHistory } = await import("../src/patterns");
  const patterns = extractPatterns(classification, { enabled: true, cooccurrenceWindow: 30, minClusterSize: 2, trackRecurrence: false }, buildEmptyTopicHistory(), values.date as string);

  if (stage === "patterns") {
    output({ focusScore: patterns.focusScore, clusterCount: patterns.temporalClusters.length, topActivityTypes: patterns.topActivityTypes.slice(0, 5), topicCooccurrences: patterns.topicCooccurrences.slice(0, 5) }, format, outFile);
    return;
  }

  // ── Stage: Knowledge ─────────────────────────────────
  const { generateKnowledgeSections } = await import("../src/knowledge");
  const knowledge = generateKnowledgeSections(patterns);

  if (stage === "knowledge") {
    output({ focusSummary: knowledge.focusSummary, focusScore: knowledge.focusScore, temporalInsights: knowledge.temporalInsights, topicMap: knowledge.topicMap.slice(0, 10), entityGraph: knowledge.entityGraph.slice(0, 5) }, format, outFile);
    return;
  }

  // ── Stage: Summary (AI) ──────────────────────────────
  if (stage === "summary") {
    if (aiMode === "mock") {
      const { getMockSummary } = await import("./lib/mock-ai");
      const mockSummary = getMockSummary();
      output(mockSummary, format, outFile);
    } else {
      // real AI — requires ANTHROPIC_API_KEY or local model running
      const { summarizeDay } = await import("../src/summarize");
      const aiConfig = { provider: "local" as const, anthropicApiKey: "", anthropicModel: "", localEndpoint: settings.localEndpoint, localModel: settings.localModel };
      const summary = await summarizeDay(date, categorized, searchResult.kept, sanitized.shellCommands, sanitized.claudeSessions, settings.profile, sanitized.gitCommits, aiConfig, undefined, undefined, classification, patterns, promptsDir);
      output(summary, format, outFile);
    }
    return;
  }

  // ── Stage: Rendered (with AI) ─────────────────────────
  if (stage === "rendered") {
    // Already handled above without AI; with AI:
    // (future: wire mock/real summary into renderMarkdown)
  }
```

**Step 2: Test the new stages**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npx tsx --tsconfig tsconfig.scripts.json scripts/inspect.ts --stage classified --format stats --data-mode real 2>&1 | head -20
```

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npx tsx --tsconfig tsconfig.scripts.json scripts/inspect.ts --stage knowledge --format json --data-mode real 2>&1 | head -40
```

**Step 3: Commit**

```bash
git add scripts/inspect.ts
git commit -m "feat: add classified/patterns/knowledge/summary stages to inspect.ts"
```

---

### Task B3: Obsidian debug modal

**Files:**
- Create: `src/pipeline-debug.ts`
- Modify: `src/settings.ts` — add `debugMode: boolean`
- Modify: `src/main.ts` — register debug command

**Step 1: Add `debugMode` to settings** in `src/settings.ts`:

```typescript
// In DailyDigestSettings interface:
debugMode: boolean;

// In DEFAULT_SETTINGS:
debugMode: false,
```

Add to the bottom of the settings UI (after other sections):
```typescript
new Setting(containerEl)
  .setName("Debug mode")
  .setDesc("Enables the 'Inspect pipeline' command for per-stage data inspection. For development use.")
  .addToggle(toggle => toggle
    .setValue(this.plugin.settings.debugMode)
    .onChange(async (value) => {
      this.plugin.settings.debugMode = value;
      await this.plugin.saveSettings();
    }));
```

**Step 2: Create `src/pipeline-debug.ts`**

```typescript
import { Modal, App, Setting } from "obsidian";
import type DailyDigestPlugin from "./main";

type Stage = "raw" | "sanitized" | "categorized" | "classified" | "patterns" | "knowledge" | "prompt";

export class PipelineDebugModal extends Modal {
  private plugin: DailyDigestPlugin;
  private selectedDate: string;
  private selectedStage: Stage = "categorized";

  constructor(app: App, plugin: DailyDigestPlugin) {
    super(app);
    this.plugin = plugin;
    const now = new Date();
    this.selectedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  onOpen(): void {
    const { contentEl } = this;
    this.setTitle("Pipeline Inspector (debug)");

    new Setting(contentEl)
      .setName("Date")
      .addText(text => {
        text.inputEl.type = "date";
        text.setValue(this.selectedDate).onChange(v => { this.selectedDate = v; });
      });

    new Setting(contentEl)
      .setName("Stage")
      .addDropdown(drop => drop
        .addOptions({ raw: "raw", sanitized: "sanitized", categorized: "categorized", classified: "classified", patterns: "patterns", knowledge: "knowledge", prompt: "prompt text" })
        .setValue(this.selectedStage)
        .onChange(v => { this.selectedStage = v as Stage; }));

    new Setting(contentEl).addButton(btn =>
      btn.setButtonText("Inspect").setCta().onClick(() => this.runInspection()));
  }

  private async runInspection(): Promise<void> {
    const { contentEl } = this;
    const existingOutput = contentEl.querySelector(".pipeline-debug-output");
    if (existingOutput) existingOutput.remove();

    const out = contentEl.createEl("div", { cls: "pipeline-debug-output" });
    out.style.cssText = "margin-top:1rem; max-height:400px; overflow:auto; background:var(--background-secondary); padding:1rem; border-radius:4px; font-family:monospace; font-size:12px; white-space:pre-wrap;";
    out.setText("Running…");

    try {
      const result = await this.plugin.runPipelineStage(this.selectedDate, this.selectedStage);
      out.setText(JSON.stringify(result, null, 2));
    } catch (e) {
      out.setText(`Error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
```

**Step 3: Add `runPipelineStage` to plugin** in `src/main.ts`:

```typescript
async runPipelineStage(dateStr: string, stage: string): Promise<unknown> {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const since = new Date(date.getTime() - this.settings.lookbackHours * 60 * 60 * 1000);

  const { visits: rawVisits, searches: rawSearches } = await collectBrowserHistory(this.settings, since);
  const rawShell = readShellHistory(this.settings, since);
  const rawClaude = [...readClaudeSessions(this.settings, since), ...readCodexSessions(this.settings, since)];
  const rawGit = readGitHistory(this.settings, since);

  if (stage === "raw") return { visits: rawVisits.length, searches: rawSearches.length, shell: rawShell.length, claude: rawClaude.length, git: rawGit.length };

  const sanitized = sanitizeCollectedData(rawVisits, rawSearches, rawShell, rawClaude, rawGit, { enabled: true, level: "standard", excludedDomains: [], redactPaths: false, scrubEmails: true });
  if (stage === "sanitized") return { visits: sanitized.visits.length, searches: sanitized.searches.length, excluded: sanitized.excludedVisitCount };

  const categorized = categorizeVisits(sanitized.visits);
  if (stage === "categorized") {
    const summary: Record<string, number> = {};
    for (const [cat, vs] of Object.entries(categorized)) summary[cat] = vs.length;
    return summary;
  }

  if (stage === "prompt") {
    return buildPrompt(date, categorized, sanitized.searches, sanitized.shellCommands, sanitized.claudeSessions, this.settings.profile, sanitized.gitCommits, this.settings.promptsDir);
  }

  return { error: `Stage '${stage}' not supported in Obsidian debug modal` };
}
```

**Step 4: Register debug command** in `src/main.ts` inside `onload()`:

```typescript
// Gated debug command
if (this.settings.debugMode) {
  this.addCommand({
    id: "pipeline-inspect",
    name: "Inspect pipeline stage (debug)",
    callback: () => {
      new PipelineDebugModal(this.app, this).open();
    },
  });
}
```

Also import `PipelineDebugModal` at top of `main.ts`:
```typescript
import { PipelineDebugModal } from "./pipeline-debug";
```

**Step 5: Run all unit tests**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npm run test:unit 2>&1 | tail -10
```

Expected: all passing.

**Step 6: Build check**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npm run build 2>&1 | tail -10
```

**Step 7: Commit**

```bash
git add src/pipeline-debug.ts src/settings.ts src/main.ts
git commit -m "feat: add Obsidian debug modal for per-stage pipeline inspection"
```

---

## Phase C — Richer AI Schema + Renderer

### Task C1: Extend AISummary type and update mock

**Files:**
- Modify: `src/types.ts`
- Modify: `scripts/lib/mock-ai.ts`
- Modify: `tests/unit/mock-ai.test.ts`

**Step 1: Add new optional fields to `AISummary`** in `src/types.ts`:

```typescript
export interface AISummary {
  // ... existing fields ...
  /** Observed behavioral patterns, e.g. 'deep 2h focus block on auth', '4 context switches' */
  work_patterns?: string[];
  /** Cross-source narrative connections, e.g. 'Searched OAuth, then committed auth middleware' */
  cross_source_connections?: string[];
}
```

**Step 2: Update mock** in `scripts/lib/mock-ai.ts` — add new fields to the mock summary return value:

```typescript
work_patterns: ["2-hour deep work block on TypeScript implementation", "Frequent context switches between docs and code"],
cross_source_connections: ["Searched for OAuth flows, then committed auth middleware 30min later"],
```

**Step 3: Run mock-ai tests**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npx vitest run tests/unit/mock-ai.test.ts 2>&1 | tail -10
```

**Step 4: Commit**

```bash
git add src/types.ts scripts/lib/mock-ai.ts
git commit -m "feat: add work_patterns and cross_source_connections to AISummary type"
```

---

### Task C2: Update renderer to use Obsidian callouts + tables

**Files:**
- Modify: `src/renderer.ts`
- Modify: `tests/unit/renderer.test.ts` (if it exists) or create it

**Context:** Obsidian callouts use `> [!type]` syntax. They render as styled blocks. Tables use standard markdown. Collapsible sections use HTML `<details>/<summary>` — these render in Obsidian reading view.

**Step 1: Check for existing renderer tests**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && ls tests/unit/renderer* 2>/dev/null || echo "no renderer tests"
```

**Step 2: Write/update renderer tests** for new callout-style output:

```typescript
// In renderer test file:
it("renders headline as a tip callout when aiSummary provided", () => {
  const md = renderMarkdown(testDate, [], [], [], [], [], {}, mockAISummary, "anthropic");
  expect(md).toContain("> [!tip]");
  expect(md).toContain(mockAISummary.headline);
});

it("renders category_summaries as a table", () => {
  const md = renderMarkdown(testDate, [], [], [], [], [], mockCategorized, mockAISummary, "anthropic");
  expect(md).toContain("| Category | Summary |");
});

it("renders work_patterns section when present", () => {
  const summary = { ...mockAISummary, work_patterns: ["Deep focus block on auth"] };
  const md = renderMarkdown(testDate, [], [], [], [], [], {}, summary, "anthropic");
  expect(md).toContain("Work Patterns");
  expect(md).toContain("Deep focus block on auth");
});
```

**Step 3: Update `renderer.ts` — headline callout**

Replace the plain blockquote headline at `renderer.ts:91-94`:
```typescript
// Before:
lines.push(`> **${aiSummary.headline}**`);

// After:
lines.push(`> [!tip] ${aiSummary.headline}`);
```

**Step 4: Update `renderer.ts` — category summaries as table**

Replace the per-category summary blockquotes in the Browser Activity section with a table at the top of that section. Add a summary table before the per-domain detail:

```typescript
// After "## Browser Activity" heading, add summary table if aiSummary available
if (Object.keys(catSums).length > 0) {
  lines.push("| Category | Activity |");
  lines.push("|---|---|");
  for (const [cat, summary] of Object.entries(catSums)) {
    const [emoji, label] = CATEGORY_LABELS[cat] ?? ["🌐", cat];
    lines.push(`| ${emoji} ${label} | ${summary} |`);
  }
  lines.push("");
}
```

**Step 5: Update `renderer.ts` — work patterns section**

Add a new section after Notable, before the existing Knowledge Insights:

```typescript
// After Notable section, before Knowledge Insights:
if (aiSummary?.work_patterns?.length || aiSummary?.cross_source_connections?.length) {
  lines.push("## ⚡ Work Patterns");
  lines.push("");
  if (aiSummary.work_patterns?.length) {
    for (const p of aiSummary.work_patterns) {
      lines.push(`- ${p}`);
    }
    lines.push("");
  }
  if (aiSummary.cross_source_connections?.length) {
    lines.push("### 🔗 Cross-Source Connections");
    lines.push("");
    for (const c of aiSummary.cross_source_connections) {
      lines.push(`> [!note] ${c}`);
      lines.push("");
    }
  }
  lines.push("---");
  lines.push("");
}
```

**Step 6: Update `renderer.ts` — shell section as collapsible**

Replace the shell section's open code block with a collapsible `<details>`:

```typescript
if (shell.length) {
  lines.push("## 💻 Shell");
  lines.push("");
  lines.push(`<details><summary>${shell.length} commands</summary>`);
  lines.push("");
  lines.push("```bash");
  for (const e of shell) {
    const ts = formatTime(e.time) || "     ";
    lines.push(`# ${ts}  ${e.cmd}`);
  }
  lines.push("```");
  lines.push("");
  lines.push("</details>");
  lines.push("");
}
```

**Step 7: Update `renderer.ts` — stats as callout**

Replace the plain italic stats line with a `[!info]` callout:

```typescript
// Replace the plain italic stats line:
lines.push(`> [!info] ${visits.length} visits · ${searches.length} searches · ${shell.length} commands · ${claudeSessions.length} AI prompts · ${gitCommits.length} commits · ${Object.keys(categorized).length} categories`);
lines.push("");
```

**Step 8: Update `renderer.ts` — TL;DR as abstract callout**

```typescript
// Replace plain paragraph tldr with a callout:
lines.push(`> [!abstract] ${aiSummary.tldr}`);
lines.push("");
```

**Step 9: Run all tests**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npm run test:unit 2>&1 | tail -10
```

Fix any snapshot or assertion failures from the changed output format.

**Step 10: Build check**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npm run build 2>&1 | tail -10
```

**Step 11: Smoke test rendering with real data**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npx tsx --tsconfig tsconfig.scripts.json scripts/inspect.ts --stage rendered --format md --data-mode real --out /tmp/digest-preview.md 2>&1
```

Open `/tmp/digest-preview.md` in Obsidian or VS Code to verify callout rendering.

**Step 12: Commit**

```bash
git add src/renderer.ts src/types.ts tests/unit/renderer*
git commit -m "feat: upgrade renderer to callouts, tables, collapsible sections"
```

---

### Task C3: Final integration test + PR

**Step 1: Run full test suite**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npm run test 2>&1 | tail -20
```

Expected: all passing (unit + integration).

**Step 2: Run lint**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npm run lint 2>&1 | tail -10
```

Fix any lint errors.

**Step 3: Run build**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && npm run build 2>&1 | tail -10
```

**Step 4: Run the full matrix with real data to see the new rendering**

```bash
source ~/.nvm/nvm.sh && nvm use --silent && DATA_MODE=real npx tsx --tsconfig tsconfig.scripts.json scripts/inspect.ts --stage rendered --format md --data-mode real --date $(date +%Y-%m-%d) --out /tmp/daily-digest-new.md
```

Open in Obsidian/Preview to validate callout appearance.

**Step 5: Final commit and push**

```bash
git add -A
git status  # verify nothing unexpected
git push -u origin feat/pipeline-inspector
```

**Step 6: Create PR**

```bash
gh pr create \
  --title "feat: pipeline inspector, prompt templates, richer rendering" \
  --body "$(cat <<'EOF'
## Summary

- **Phase A — Prompt templates:** Extracted all 5 LLM prompt builders from `summarize.ts` into editable `prompts/*.txt` template files. Templates use `{{variable}}` placeholders, loaded at runtime from disk with fallback to built-in defaults bundled by esbuild. New `promptsDir` setting in plugin + `--prompts-dir` CLI flag.

- **Phase B — Pipeline inspector:** New `scripts/inspect.ts` CLI runs any pipeline stage (raw → sanitized → categorized → classified → patterns → knowledge → prompt → summary → rendered) against real or fixture data. New `--prompts-dir`, `--ai-mode`, `--date`, `--format`, `--out` flags. `npm run inspect` shortcut. Debug modal in Obsidian (gated behind `settings.debugMode`).

- **Phase C — Richer output:** Extended `AISummary` with `work_patterns` and `cross_source_connections` fields (optional, backward-compatible). Renderer upgraded: headline → `[!tip]` callout, tldr → `[!abstract]` callout, stats → `[!info]` callout, category summaries → markdown table, cross-source connections → `[!note]` callouts, shell commands → `<details>` collapsible block.

## Test plan

- [ ] `npm run test` — all unit + integration tests pass
- [ ] `npm run build` — clean build
- [ ] `npm run lint` — no lint errors
- [ ] `scripts/inspect.ts --stage raw --data-mode real` — returns real browser/shell data
- [ ] `scripts/inspect.ts --stage prompt --data-mode real` — prints prompt with variables filled
- [ ] Prompt edited in `prompts/standard.txt`, inspector shows updated text (no rebuild needed for CLI)
- [ ] Obsidian debug modal: Settings → enable Debug mode → Command palette → "Inspect pipeline stage"
- [ ] Rendered note uses callouts and table for category summaries

🤖 Generated with claude-flow
EOF
)"
```

---

## Notes

- `prompts/*.txt` files are tracked in git — editing them for testing is fine, just don't commit experiments
- The Obsidian debug modal only supports stages up to `prompt` for now (no live LLM calls inside Obsidian via modal)
- The `inspect.ts` `--ai-mode real` path for `summary` stage requires either `ANTHROPIC_API_KEY` env var or a local model running at `localEndpoint`
- Breaking schema changes to `AISummary` are fine (all new fields are optional) — existing notes won't break
- `esbuild.config.mjs` needs the `".txt": "text"` loader for the built-in prompt bundling to work
