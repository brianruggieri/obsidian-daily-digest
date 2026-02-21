# Settings-Matrix Daily Note Generation Pipeline — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a CLI script that runs 12 curated settings presets through the full plugin pipeline, writes one `.md` per preset to `~/obsidian-vaults/daily-digest-test/YYYY-MM-DD/`, includes collapsible prompt-visibility blocks in each note, and scaffolds structural/quality assertions.

**Architecture:** A standalone `scripts/daily-matrix.ts` entry point (driven by env vars) orchestrates preset configs through the existing `src/` pipeline functions (sanitize → categorize → classify → patterns → summarize → render), writing output to a local test vault. A `PromptLog` object is threaded through the pipeline and injected as `<details>` blocks in the rendered markdown. Assertions run post-generation when `MATRIX_ASSERT=true`.

**Tech Stack:** TypeScript, `tsx` (script runner), existing `src/` pipeline modules, `@faker-js/faker` (Phase 2 only — not installed now), macOS `launchd` for scheduling.

---

## Pre-flight Checks

Before starting, verify you are on branch `feat/full-day-collection` and tests pass:

```bash
source ~/.nvm/nvm.sh && nvm use
git status
npm run test:unit
```

---

## Task 1: Create Test Vault

**Files:**
- Create: `~/obsidian-vaults/daily-digest-test/.obsidian/app.json`

**Step 1: Create vault directory and minimal Obsidian config**

```bash
mkdir -p ~/obsidian-vaults/daily-digest-test/.obsidian
```

```json
// ~/obsidian-vaults/daily-digest-test/.obsidian/app.json
{
  "alwaysUpdateLinks": true,
  "newFileLocation": "current",
  "promptDelete": false
}
```

This is the minimum required for Obsidian to recognize the folder as a vault. No plugins needed.

**Step 2: Verify Obsidian can open it**

Open Obsidian → "Open folder as vault" → select `~/obsidian-vaults/daily-digest-test`. Confirm it opens cleanly with an empty vault. Close Obsidian.

**Step 3: Commit**

```bash
# Nothing to commit in the repo — vault lives outside the repo.
# Just confirm the path exists:
ls ~/obsidian-vaults/daily-digest-test/.obsidian/app.json
```

---

## Task 2: Add `tsx` Dev Dependency

**Files:**
- Modify: `package.json`

`tsx` is a zero-config TypeScript script runner. It replaces ts-node with faster startup and full ESM/CJS support. No tsconfig changes needed.

**Step 1: Install**

```bash
source ~/.nvm/nvm.sh && nvm use
npm install --save-dev tsx
```

**Step 2: Verify**

```bash
source ~/.nvm/nvm.sh && nvm use && npx tsx --version
```

Expected: prints a version like `4.x.x`.

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add tsx for running matrix scripts"
```

---

## Task 3: Implement PromptLogger

**Files:**
- Create: `scripts/lib/prompt-logger.ts`
- Create: `tests/unit/prompt-logger.test.ts`

The prompt logger accumulates entries for each AI-touching stage of the pipeline. It is passed through the pipeline and later rendered as `<details>` blocks by the renderer.

**Step 1: Write the failing test**

```typescript
// tests/unit/prompt-logger.test.ts
import { describe, it, expect } from "vitest";
import { createPromptLog, appendPromptEntry, formatDetailsBlock } from "../../scripts/lib/prompt-logger";

describe("PromptLogger", () => {
  it("starts empty", () => {
    const log = createPromptLog();
    expect(log).toEqual([]);
  });

  it("appends entries", () => {
    const log = createPromptLog();
    appendPromptEntry(log, {
      stage: "summarize",
      model: "claude-haiku-4-5-20251001",
      tokenCount: 1200,
      privacyTier: 1,
      prompt: "You are a productivity assistant...",
    });
    expect(log).toHaveLength(1);
    expect(log[0].stage).toBe("summarize");
  });

  it("formats a details block with token count and model in summary line", () => {
    const log = createPromptLog();
    appendPromptEntry(log, {
      stage: "summarize",
      model: "claude-haiku-4-5-20251001",
      tokenCount: 842,
      privacyTier: 2,
      prompt: "Hello world",
    });
    const block = formatDetailsBlock(log[0]);
    expect(block).toContain("<details>");
    expect(block).toContain("claude-haiku-4-5-20251001");
    expect(block).toContain("842 tokens");
    expect(block).toContain("Tier 2");
    expect(block).toContain("Hello world");
    expect(block).toContain("</details>");
  });

  it("estimates token count at ~4 chars per token", () => {
    const log = createPromptLog();
    appendPromptEntry(log, {
      stage: "classify",
      model: "local",
      tokenCount: estimateTokens("abcdefgh"), // 8 chars = ~2 tokens
      prompt: "abcdefgh",
    });
    expect(log[0].tokenCount).toBe(2);
  });
});

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
```

**Step 2: Run test to verify it fails**

```bash
source ~/.nvm/nvm.sh && nvm use
npx vitest run tests/unit/prompt-logger.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement**

```typescript
// scripts/lib/prompt-logger.ts

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
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/prompt-logger.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/lib/prompt-logger.ts tests/unit/prompt-logger.test.ts
git commit -m "feat: add PromptLogger for matrix pipeline prompt visibility"
```

---

## Task 4: Export `buildPrompt` from `summarize.ts`

**Files:**
- Modify: `src/summarize.ts`

`buildPrompt` is currently an unexported internal function. The matrix runner needs to call it directly to capture the exact prompt text before sending it to the AI. This is the only change to `src/`.

**Step 1: Add the export keyword**

In `src/summarize.ts`, find line ~12:
```typescript
function buildPrompt(
```

Change to:
```typescript
export function buildPrompt(
```

**Step 2: Verify no tests break**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run test:unit
```

Expected: all existing tests still pass. No new test needed — `buildPrompt` is already exercised indirectly through `summarizeDay` tests.

**Step 3: Commit**

```bash
git add src/summarize.ts
git commit -m "refactor: export buildPrompt from summarize for matrix runner"
```

---

## Task 5: Update Renderer to Inject Prompt Log Blocks

**Files:**
- Modify: `src/renderer.ts`
- Modify: `tests/unit/renderer.test.ts`

Add an optional `promptLog` parameter to `renderMarkdown`. When provided and non-empty, inject one `<details>` block per entry immediately after the AI Summary section.

**Step 1: Write the failing test**

Add to `tests/unit/renderer.test.ts`:

```typescript
import { createPromptLog, appendPromptEntry } from "../../scripts/lib/prompt-logger";

it("injects prompt details block after AI summary when promptLog provided", () => {
  const log = createPromptLog();
  appendPromptEntry(log, {
    stage: "summarize",
    model: "claude-haiku-4-5-20251001",
    tokenCount: 500,
    privacyTier: 1,
    prompt: "Test prompt text",
  });

  const md = renderMarkdown(
    new Date("2026-02-21"),
    [], [], [], [], [],
    { dev: [], work: [], finance: [], social: [], news: [], media: [], shopping: [], health: [], other: [] },
    { headline: "Test", tldr: "Summary", themes: [], category_summaries: {}, notable: [], questions: [] },
    "anthropic",
    undefined,
    log  // new parameter
  );

  expect(md).toContain("<details>");
  expect(md).toContain("claude-haiku-4-5-20251001");
  expect(md).toContain("Test prompt text");
  expect(md).toContain("</details>");
});

it("renders cleanly with no promptLog (backwards compatible)", () => {
  const md = renderMarkdown(
    new Date("2026-02-21"),
    [], [], [], [], [],
    { dev: [], work: [], finance: [], social: [], news: [], media: [], shopping: [], health: [], other: [] },
    null,
    "none"
    // no promptLog argument
  );
  expect(md).not.toContain("<details>");
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/renderer.test.ts
```

Expected: FAIL — renderMarkdown doesn't accept promptLog yet.

**Step 3: Implement**

In `src/renderer.ts`, update the `renderMarkdown` signature:

```typescript
import { PromptLog, formatDetailsBlock } from "../scripts/lib/prompt-logger";

export function renderMarkdown(
  date: Date,
  visits: BrowserVisit[],
  searches: SearchQuery[],
  shell: ShellCommand[],
  claudeSessions: ClaudeSession[],
  gitCommits: GitCommit[],
  categorized: CategorizedVisits,
  aiSummary: AISummary | null,
  aiProviderUsed: AIProvider | "none" = "none",
  knowledge?: KnowledgeSections,
  promptLog?: PromptLog   // ← new optional param
): string {
```

Then, immediately after the block that renders the AI Summary section (search for where `aiSummary.tldr` is rendered, around line 100–130), add:

```typescript
  // Inject prompt visibility blocks if log provided
  if (promptLog && promptLog.length > 0) {
    for (const entry of promptLog) {
      lines.push("");
      lines.push(formatDetailsBlock(entry));
    }
  }
```

**Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/unit/renderer.test.ts
```

Expected: PASS including new tests.

**Step 5: Run full unit suite to check for regressions**

```bash
npm run test:unit
```

Expected: all pass.

**Step 6: Commit**

```bash
git add src/renderer.ts tests/unit/renderer.test.ts
git commit -m "feat: inject collapsible prompt-log blocks into rendered markdown"
```

---

## Task 6: Define Preset Configs

**Files:**
- Create: `scripts/presets.ts`

Each preset is a partial `DailyDigestSettings` merged over a base config at runtime. It also carries a display `id` and `description`.

**Step 1: Write a validation test**

```typescript
// tests/unit/presets.test.ts
import { describe, it, expect } from "vitest";
import { PRESETS, BASE_SETTINGS } from "../../scripts/presets";

describe("Presets", () => {
  it("exports exactly 12 presets", () => {
    expect(PRESETS).toHaveLength(12);
  });

  it("every preset has a unique id", () => {
    const ids = PRESETS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every preset has id, description, and settings", () => {
    for (const preset of PRESETS) {
      expect(preset.id).toBeTruthy();
      expect(preset.description).toBeTruthy();
      expect(preset.settings).toBeDefined();
    }
  });

  it("BASE_SETTINGS has all required fields", () => {
    expect(BASE_SETTINGS.enableBrowser).toBeDefined();
    expect(BASE_SETTINGS.aiProvider).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/presets.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement**

```typescript
// scripts/presets.ts
import { DailyDigestSettings } from "../src/settings";

// Re-export the type we need
export type PresetOverride = Partial<DailyDigestSettings>;

export interface Preset {
  id: string;
  description: string;
  settings: PresetOverride;
}

// Sensible base — all sources on, no AI, standard privacy, complete mode
export const BASE_SETTINGS: DailyDigestSettings = {
  // General
  dailyFolder: "",
  filenameTemplate: "{{date}}",
  lookbackHours: 24,
  // Data sources
  enableBrowser: true,
  browserConfigs: [],
  maxBrowserVisits: 500,
  maxSearches: 100,
  enableShell: true,
  maxShellCommands: 200,
  enableClaude: true,
  claudeSessionsDir: "~/.claude/projects",
  maxClaudeSessions: 20,
  enableGit: true,
  gitParentDir: "~/git",
  maxGitCommits: 100,
  collectionMode: "complete",
  promptBudget: 4000,
  // Privacy
  enableSanitization: true,
  sanitizationLevel: "standard",
  excludedDomains: [],
  redactPaths: false,
  scrubEmails: true,
  enableSensitivityFilter: true,
  sensitivityAction: "exclude",
  sensitivityCategories: ["adult", "gambling", "dating"],
  sensitivityCustomDomains: [],
  // AI
  enableAI: false,
  profile: "",
  aiProvider: "none",
  localEndpoint: "http://localhost:11434",
  localModel: "llama3.2",
  aiModel: "claude-haiku-4-5-20251001",
  // Advanced AI
  enableRAG: false,
  embeddingModel: "nomic-embed-text",
  ragTopK: 8,
  enableClassification: false,
  classificationModel: "llama3.2",
  classificationBatchSize: 8,
  enablePatterns: true,
  patternCooccurrenceWindow: 30,
  patternMinClusterSize: 3,
  trackRecurrence: false,
  // Meta
  hasCompletedOnboarding: true,
  privacyConsentVersion: 1,
};

export const PRESETS: Preset[] = [
  {
    id: "no-ai-minimal",
    description: "Browser only, no AI, no patterns — minimum viable note",
    settings: {
      enableShell: false,
      enableClaude: false,
      enableGit: false,
      enableAI: false,
      aiProvider: "none",
      enablePatterns: false,
      collectionMode: "limited",
    },
  },
  {
    id: "no-ai-full",
    description: "All 4 sources, no AI, patterns enabled",
    settings: {
      enableAI: false,
      aiProvider: "none",
      enablePatterns: true,
    },
  },
  {
    id: "local-llm-basic",
    description: "All sources, local model, no RAG or classification",
    settings: {
      enableAI: true,
      aiProvider: "local",
      enableRAG: false,
      enableClassification: false,
    },
  },
  {
    id: "local-llm-rag",
    description: "All sources, local model + RAG",
    settings: {
      enableAI: true,
      aiProvider: "local",
      enableRAG: true,
      enableClassification: false,
    },
  },
  {
    id: "local-llm-classified",
    description: "All sources, local model + classification (no RAG)",
    settings: {
      enableAI: true,
      aiProvider: "local",
      enableRAG: false,
      enableClassification: true,
    },
  },
  {
    id: "cloud-haiku-tier1",
    description: "Anthropic Haiku, full sanitized context (Tier 1)",
    settings: {
      enableAI: true,
      aiProvider: "anthropic",
      aiModel: "claude-haiku-4-5-20251001",
      enableRAG: false,
      enableClassification: false,
    },
  },
  {
    id: "cloud-haiku-tier2",
    description: "Anthropic Haiku, RAG chunks only (Tier 2)",
    settings: {
      enableAI: true,
      aiProvider: "anthropic",
      aiModel: "claude-haiku-4-5-20251001",
      enableRAG: true,
      enableClassification: false,
    },
  },
  {
    id: "cloud-sonnet-tier1",
    description: "Anthropic Sonnet, full sanitized context (Tier 1)",
    settings: {
      enableAI: true,
      aiProvider: "anthropic",
      aiModel: "claude-sonnet-4-6",
      enableRAG: false,
      enableClassification: false,
    },
  },
  {
    id: "cloud-sonnet-tier3",
    description: "Anthropic Sonnet, classified abstractions only (Tier 3)",
    settings: {
      enableAI: true,
      aiProvider: "anthropic",
      aiModel: "claude-sonnet-4-6",
      enableClassification: true,
      enableRAG: false,
    },
  },
  {
    id: "cloud-tier4-stats",
    description: "Anthropic Haiku, aggregated statistics only (Tier 4)",
    settings: {
      enableAI: true,
      aiProvider: "anthropic",
      aiModel: "claude-haiku-4-5-20251001",
      enableClassification: true,
      enableRAG: false,
      enablePatterns: true,
      sanitizationLevel: "aggressive",
    },
  },
  {
    id: "privacy-aggressive",
    description: "All sources, Sonnet, aggressive sanitization + all sensitivity categories",
    settings: {
      enableAI: true,
      aiProvider: "anthropic",
      aiModel: "claude-sonnet-4-6",
      sanitizationLevel: "aggressive",
      sensitivityCategories: [
        "adult", "gambling", "dating", "health", "drugs",
        "politics", "religion", "finance", "legal", "social", "news",
      ],
      sensitivityAction: "redact",
    },
  },
  {
    id: "compression-limited",
    description: "All sources, Haiku, limited collection mode (fixed caps)",
    settings: {
      enableAI: true,
      aiProvider: "anthropic",
      aiModel: "claude-haiku-4-5-20251001",
      collectionMode: "limited",
      maxBrowserVisits: 100,
      maxShellCommands: 50,
    },
  },
];

export function resolvePreset(preset: Preset): DailyDigestSettings {
  return { ...BASE_SETTINGS, ...preset.settings };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/presets.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/presets.ts tests/unit/presets.test.ts
git commit -m "feat: add 12 curated preset configs for matrix pipeline"
```

---

## Task 7: Implement Mock AI

**Files:**
- Create: `scripts/lib/mock-ai.ts`
- Create: `tests/unit/mock-ai.test.ts`

When `AI_MODE=mock`, the matrix runner uses this instead of calling real APIs. Returns a deterministic canned `AISummary` based on the preset id.

**Step 1: Write the failing test**

```typescript
// tests/unit/mock-ai.test.ts
import { describe, it, expect } from "vitest";
import { getMockSummary } from "../../scripts/lib/mock-ai";

describe("MockAI", () => {
  it("returns a valid AISummary shape", () => {
    const summary = getMockSummary("cloud-haiku-tier1");
    expect(summary.headline).toBeTruthy();
    expect(summary.tldr).toBeTruthy();
    expect(Array.isArray(summary.themes)).toBe(true);
    expect(Array.isArray(summary.notable)).toBe(true);
    expect(Array.isArray(summary.questions)).toBe(true);
  });

  it("embeds the preset id in the headline so outputs are distinguishable", () => {
    const summary = getMockSummary("cloud-sonnet-tier3");
    expect(summary.headline).toContain("cloud-sonnet-tier3");
  });

  it("returns null for no-ai presets", () => {
    expect(getMockSummary("no-ai-minimal")).toBeNull();
    expect(getMockSummary("no-ai-full")).toBeNull();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/mock-ai.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement**

```typescript
// scripts/lib/mock-ai.ts
import { AISummary } from "../../src/types";

const NO_AI_PRESETS = new Set(["no-ai-minimal", "no-ai-full"]);

export function getMockSummary(presetId: string): AISummary | null {
  if (NO_AI_PRESETS.has(presetId)) return null;

  return {
    headline: `[MOCK ${presetId}] Deep focus engineering day with active development sessions`,
    tldr: `This is a mock summary generated for preset "${presetId}". In a real run, this would contain an AI-generated summary of the day's activity based on collected browser, shell, git, and Claude session data.`,
    themes: ["software-development", "mock-output", presetId],
    category_summaries: {
      dev: `Mock category summary for preset ${presetId}: development activity detected.`,
    },
    notable: [
      `Mock insight 1 for ${presetId}: this note was generated without real AI.`,
      `Mock insight 2 for ${presetId}: prompt log below shows what would be sent.`,
    ],
    questions: [
      `What would real AI output look like for preset ${presetId}?`,
      "Run with AI_MODE=real to find out.",
    ],
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/mock-ai.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/lib/mock-ai.ts tests/unit/mock-ai.test.ts
git commit -m "feat: add mock AI for matrix pipeline dry runs"
```

---

## Task 8: Implement Collector Shim

**Files:**
- Create: `scripts/lib/collector-shim.ts`
- Create: `tests/unit/collector-shim.test.ts`

The shim calls the real collectors from `src/collectors.ts`. They don't use Obsidian APIs — they just need `DailyDigestSettings` and a `since: Date`. For `DATA_MODE=fixtures`, it returns data from the test personas.

**Step 1: Write the failing test**

```typescript
// tests/unit/collector-shim.test.ts
import { describe, it, expect } from "vitest";
import { collectFixtureData, CollectedData } from "../../scripts/lib/collector-shim";
import { BASE_SETTINGS } from "../../scripts/presets";

describe("CollectorShim (fixtures mode)", () => {
  it("returns CollectedData with all four arrays", async () => {
    const data: CollectedData = await collectFixtureData(BASE_SETTINGS);
    expect(Array.isArray(data.visits)).toBe(true);
    expect(Array.isArray(data.searches)).toBe(true);
    expect(Array.isArray(data.shell)).toBe(true);
    expect(Array.isArray(data.claudeSessions)).toBe(true);
    expect(Array.isArray(data.gitCommits)).toBe(true);
  });

  it("returns non-empty data for a fully-enabled settings object", async () => {
    const data = await collectFixtureData(BASE_SETTINGS);
    const total = data.visits.length + data.shell.length + data.claudeSessions.length + data.gitCommits.length;
    expect(total).toBeGreaterThan(0);
  });

  it("returns empty arrays when sources are disabled", async () => {
    const settings = { ...BASE_SETTINGS, enableBrowser: false, enableShell: false, enableClaude: false, enableGit: false };
    const data = await collectFixtureData(settings);
    expect(data.visits).toHaveLength(0);
    expect(data.shell).toHaveLength(0);
    expect(data.claudeSessions).toHaveLength(0);
    expect(data.gitCommits).toHaveLength(0);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/collector-shim.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement**

```typescript
// scripts/lib/collector-shim.ts
import { DailyDigestSettings } from "../../src/settings";
import { BrowserVisit, SearchQuery, ShellCommand, ClaudeSession, GitCommit } from "../../src/types";
import { readShellHistory, readClaudeSessions, readGitHistory } from "../../src/collectors";
// Browser collector uses WASM — imported only in real mode at runtime
import { generateSoftwareEngineerPersona } from "../../tests/fixtures/personas";

export interface CollectedData {
  visits: BrowserVisit[];
  searches: SearchQuery[];
  shell: ShellCommand[];
  claudeSessions: ClaudeSession[];
  gitCommits: GitCommit[];
}

/** Fixture mode: use the software engineer test persona as input data. */
export async function collectFixtureData(settings: DailyDigestSettings): Promise<CollectedData> {
  const persona = generateSoftwareEngineerPersona();

  return {
    visits: settings.enableBrowser ? persona.visits : [],
    searches: settings.enableBrowser ? persona.searches : [],
    shell: settings.enableShell ? persona.shellCommands : [],
    claudeSessions: settings.enableClaude ? persona.claudeSessions : [],
    gitCommits: settings.enableGit ? persona.gitCommits : [],
  };
}

/** Real mode: call the actual collectors against live local data. */
export async function collectRealData(settings: DailyDigestSettings): Promise<CollectedData> {
  const since = new Date();
  since.setHours(since.getHours() - settings.lookbackHours);

  // Browser uses WASM — dynamic import to avoid loading WASM in fixture mode
  let visits: BrowserVisit[] = [];
  let searches: SearchQuery[] = [];
  if (settings.enableBrowser) {
    const { collectBrowserHistory } = await import("../../src/collectors");
    const result = await collectBrowserHistory(settings, since);
    visits = result.visits;
    searches = result.searches;
  }

  return {
    visits,
    searches,
    shell: readShellHistory(settings, since),
    claudeSessions: readClaudeSessions(settings, since),
    gitCommits: readGitHistory(settings, since),
  };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/collector-shim.test.ts
```

Expected: PASS. If the fixture persona generators don't export `gitCommits`, check `tests/fixtures/personas.ts` — the git collector was recently added and the persona may need a `gitCommits` field added. Add it with `[]` as a fallback if missing.

**Step 5: Run full unit tests**

```bash
npm run test:unit
```

Expected: all pass.

**Step 6: Commit**

```bash
git add scripts/lib/collector-shim.ts tests/unit/collector-shim.test.ts
git commit -m "feat: add collector shim for matrix pipeline (fixture + real modes)"
```

---

## Task 9: Implement Assertions

**Files:**
- Create: `scripts/lib/assertions.ts`
- Create: `tests/unit/assertions.test.ts`

These are pure functions: they take a rendered markdown string and return pass/fail with a list of failure messages.

**Step 1: Write the failing tests**

```typescript
// tests/unit/assertions.test.ts
import { describe, it, expect } from "vitest";
import { runStructuralAssertions, runQualityAssertions, AssertionResult } from "../../scripts/lib/assertions";

const VALID_MD = `---
date: 2026-02-21
day: Saturday
tags: [daily, daily-digest]
focus_score: 0.74
generated: 2026-02-21 07:00
categories: [dev]
---

# Saturday, February 21

> AI summary here with enough content to pass length checks.

This is content for the dev section and it has enough characters to be valid.
`;

describe("Structural assertions", () => {
  it("passes for valid markdown", () => {
    const result = runStructuralAssertions(VALID_MD);
    expect(result.passed).toBe(true);
    expect(result.failures).toHaveLength(0);
  });

  it("fails when frontmatter is missing required field", () => {
    const bad = VALID_MD.replace("focus_score: 0.74\n", "");
    const result = runStructuralAssertions(bad);
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes("focus_score"))).toBe(true);
  });

  it("fails when file is too short", () => {
    const result = runStructuralAssertions("---\ndate: 2026-02-21\n---\nhi");
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes("too short"))).toBe(true);
  });

  it("fails when placeholder strings are present", () => {
    const bad = VALID_MD + "\n[object Object]\n";
    const result = runStructuralAssertions(bad);
    expect(result.passed).toBe(false);
  });
});

describe("Quality assertions", () => {
  it("passes for valid markdown with AI output", () => {
    const withAI = VALID_MD + "\n## AI Summary\n\nReal headline here\n";
    const result = runQualityAssertions(withAI, { aiEnabled: true });
    expect(result.passed).toBe(true);
  });

  it("passes when AI is disabled and no headline present", () => {
    const result = runQualityAssertions(VALID_MD, { aiEnabled: false });
    expect(result.passed).toBe(true);
  });

  it("fails when focus_score is out of range", () => {
    const bad = VALID_MD.replace("focus_score: 0.74", "focus_score: 1.5");
    const result = runQualityAssertions(bad, { aiEnabled: false });
    expect(result.passed).toBe(false);
    expect(result.failures.some((f) => f.includes("focus_score"))).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/unit/assertions.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement**

```typescript
// scripts/lib/assertions.ts

export interface AssertionResult {
  passed: boolean;
  failures: string[];
}

const REQUIRED_FRONTMATTER = ["date", "tags", "focus_score"];
const PLACEHOLDER_STRINGS = ["[object Object]", "undefined", "NaN", "null"];
const MIN_FILE_SIZE = 500;

export function runStructuralAssertions(md: string): AssertionResult {
  const failures: string[] = [];

  // File size
  if (md.length < MIN_FILE_SIZE) {
    failures.push(`File too short: ${md.length} bytes (minimum ${MIN_FILE_SIZE})`);
  }

  // Frontmatter presence
  const fmMatch = md.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) {
    failures.push("No frontmatter found");
  } else {
    for (const field of REQUIRED_FRONTMATTER) {
      if (!fmMatch[1].includes(`${field}:`)) {
        failures.push(`Frontmatter missing required field: ${field}`);
      }
    }
  }

  // Placeholder strings
  for (const placeholder of PLACEHOLDER_STRINGS) {
    if (md.includes(placeholder)) {
      failures.push(`Contains placeholder string: "${placeholder}"`);
    }
  }

  return { passed: failures.length === 0, failures };
}

export function runQualityAssertions(
  md: string,
  options: { aiEnabled: boolean }
): AssertionResult {
  const failures: string[] = [];

  // Focus score range
  const fsMatch = md.match(/focus_score:\s*([\d.]+)/);
  if (fsMatch) {
    const score = parseFloat(fsMatch[1]);
    if (isNaN(score) || score < 0 || score > 1) {
      failures.push(`focus_score out of range [0,1]: ${fsMatch[1]}`);
    }
  }

  // Headline present when AI enabled
  if (options.aiEnabled) {
    const hasHeadline = /## AI Summary/.test(md) || /^> .+/m.test(md);
    if (!hasHeadline) {
      failures.push("AI enabled but no headline or summary block found");
    }
  }

  return { passed: failures.length === 0, failures };
}
```

**Step 4: Run test to verify it passes**

```bash
npx vitest run tests/unit/assertions.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add scripts/lib/assertions.ts tests/unit/assertions.test.ts
git commit -m "feat: scaffold structural and quality assertions for matrix pipeline"
```

---

## Task 10: Implement Assertion Runner

**Files:**
- Create: `scripts/lib/assertion-runner.ts`

Runs all assertions against every generated note, writes `matrix-report.json`.

**Step 1: Implement** (no separate test — covered by integration via matrix runner)

```typescript
// scripts/lib/assertion-runner.ts
import { writeFileSync } from "fs";
import { join } from "path";
import { runStructuralAssertions, runQualityAssertions } from "./assertions";

export interface PresetReport {
  preset: string;
  passed: boolean;
  durationMs: number;
  filePath: string;
  checks: {
    structural: { passed: boolean; failures: string[] };
    quality: { passed: boolean; failures: string[] };
    llmJudge: null; // Phase 2
  };
}

export interface MatrixReport {
  date: string;
  aiMode: string;
  dataMode: string;
  totalPresets: number;
  passed: number;
  failed: number;
  results: PresetReport[];
}

export function runAssertions(
  md: string,
  presetId: string,
  filePath: string,
  durationMs: number,
  options: { aiEnabled: boolean }
): PresetReport {
  const structural = runStructuralAssertions(md);
  const quality = runQualityAssertions(md, options);
  const passed = structural.passed && quality.passed;

  return {
    preset: presetId,
    passed,
    durationMs,
    filePath,
    checks: { structural, quality, llmJudge: null },
  };
}

export function writeReport(
  outputDir: string,
  report: MatrixReport
): void {
  const reportPath = join(outputDir, "matrix-report.json");
  writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf-8");
  console.log(`\nMatrix report written to ${reportPath}`);
  console.log(`Results: ${report.passed}/${report.totalPresets} passed`);
  if (report.failed > 0) {
    console.error(`${report.failed} preset(s) failed assertions — see matrix-report.json`);
  }
}
```

**Step 2: Commit**

```bash
git add scripts/lib/assertion-runner.ts
git commit -m "feat: add assertion runner and matrix report writer"
```

---

## Task 11: Implement CLI Entry Point

**Files:**
- Create: `scripts/daily-matrix.ts`

This is the main script. It reads env vars, resolves presets, runs the full pipeline per preset, writes output files, and optionally asserts.

**Step 1: Implement**

```typescript
// scripts/daily-matrix.ts
import { mkdirSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

import { PRESETS, resolvePreset } from "./presets";
import { collectFixtureData, collectRealData } from "./lib/collector-shim";
import { getMockSummary } from "./lib/mock-ai";
import { createPromptLog, appendPromptEntry, estimateTokens } from "./lib/prompt-logger";
import { runAssertions, writeReport, MatrixReport } from "./lib/assertion-runner";

import { scrubSecrets } from "../src/sanitize";
import { filterSensitiveDomains } from "../src/sensitivity";
import { categorizeDomains } from "../src/categorize";
import { classifyEvents } from "../src/classify";
import { extractPatterns } from "../src/patterns";
import { generateKnowledgeSections } from "../src/knowledge";
import { summarizeDay } from "../src/summarize";
import { renderMarkdown } from "../src/renderer";
import { buildPrompt, buildClassifiedPrompt, buildDeidentifiedPrompt } from "../src/summarize";
import { PromptLog } from "./lib/prompt-logger";

// ── Env vars ──────────────────────────────────────────────
const AI_MODE = (process.env.AI_MODE ?? "mock") as "real" | "mock";
const DATA_MODE = (process.env.DATA_MODE ?? "fixtures") as "real" | "fixtures";
const PRESET_FILTER = process.env.PRESET ?? "all";
const DATE_STR = process.env.DATE ?? new Date().toISOString().slice(0, 10);
const ASSERT = process.env.MATRIX_ASSERT === "true";

const VAULT_ROOT = join(homedir(), "obsidian-vaults", "daily-digest-test");

async function runPreset(presetId: string, date: Date, outputDir: string): Promise<void> {
  const preset = PRESETS.find((p) => p.id === presetId)!;
  const settings = resolvePreset(preset);
  const start = Date.now();

  console.log(`\n▶ ${presetId} [data:${DATA_MODE} ai:${AI_MODE}]`);

  // 1. Collect
  const raw = DATA_MODE === "real"
    ? await collectRealData(settings)
    : await collectFixtureData(settings);

  // 2. Sanitize
  const sanitized = {
    visits: scrubSecrets(raw.visits, settings),
    searches: raw.searches,
    shell: raw.shell,
    claudeSessions: raw.claudeSessions,
    gitCommits: raw.gitCommits,
  };

  // 3. Sensitivity filter
  const filtered = filterSensitiveDomains(sanitized.visits, settings);

  // 4. Categorize
  const categorized = categorizeDomains(filtered);

  // 5. Classify (optional)
  const classification = settings.enableClassification
    ? await classifyEvents(sanitized.visits, sanitized.searches, settings)
    : undefined;

  // 6. Patterns (optional)
  const patterns = settings.enablePatterns
    ? extractPatterns(sanitized.visits, sanitized.shell, sanitized.claudeSessions, sanitized.gitCommits)
    : undefined;

  // 7. Knowledge (optional)
  const knowledge = patterns
    ? generateKnowledgeSections(patterns, sanitized.visits)
    : undefined;

  // 8. Build prompt log + get AI summary
  const promptLog: PromptLog = createPromptLog();
  let aiSummary = null;

  if (settings.enableAI && settings.aiProvider !== "none") {
    if (AI_MODE === "mock") {
      // Build what the prompt WOULD be, log it, return mock summary
      const promptText = buildPrompt(date, categorized, sanitized.searches, sanitized.shell, sanitized.claudeSessions, settings.profile);
      appendPromptEntry(promptLog, {
        stage: "summarize",
        model: settings.aiProvider === "anthropic" ? settings.aiModel : settings.localModel,
        tokenCount: estimateTokens(promptText),
        privacyTier: 1,
        prompt: promptText,
      });
      aiSummary = getMockSummary(presetId);
    } else {
      // Real AI call — summarizeDay handles provider routing
      const config = {
        provider: settings.aiProvider,
        model: settings.aiProvider === "anthropic" ? settings.aiModel : settings.localModel,
        endpoint: settings.localEndpoint,
        apiKey: process.env.ANTHROPIC_API_KEY ?? "",
      };
      aiSummary = await summarizeDay(
        date, categorized, sanitized.searches, sanitized.shell,
        sanitized.claudeSessions, config, settings.profile,
        settings.enableRAG ? { topK: settings.ragTopK, model: settings.embeddingModel } : undefined,
        classification,
        patterns
      );
    }
  }

  // 9. Render
  const aiProviderUsed = settings.enableAI ? settings.aiProvider : "none";
  const md = renderMarkdown(
    date,
    sanitized.visits,
    sanitized.searches,
    sanitized.shell,
    sanitized.claudeSessions,
    sanitized.gitCommits,
    categorized,
    aiSummary,
    aiProviderUsed as any,
    knowledge,
    promptLog
  );

  // 10. Write
  const filePath = join(outputDir, `${presetId}.md`);
  writeFileSync(filePath, md, "utf-8");
  console.log(`   ✓ Wrote ${filePath}`);

  // 11. Assert (optional)
  if (ASSERT) {
    const report = runAssertions(md, presetId, filePath, Date.now() - start, {
      aiEnabled: settings.enableAI && settings.aiProvider !== "none",
    });
    const status = report.passed ? "✓ PASS" : "✗ FAIL";
    console.log(`   ${status} assertions`);
    if (!report.passed) {
      for (const f of [...report.checks.structural.failures, ...report.checks.quality.failures]) {
        console.error(`     - ${f}`);
      }
    }
    return; // caller collects reports separately if needed
  }
}

async function main() {
  const date = new Date(DATE_STR);
  const dateLabel = DATE_STR;

  const outputDir = join(VAULT_ROOT, dateLabel);
  mkdirSync(outputDir, { recursive: true });

  const targets = PRESET_FILTER === "all"
    ? PRESETS.map((p) => p.id)
    : [PRESET_FILTER];

  console.log(`Daily Matrix — ${dateLabel}`);
  console.log(`Presets: ${targets.join(", ")}`);
  console.log(`Output: ${outputDir}`);

  const reports: any[] = [];

  for (const id of targets) {
    if (!PRESETS.find((p) => p.id === id)) {
      console.error(`Unknown preset: ${id}`);
      process.exit(1);
    }
    await runPreset(id, date, outputDir);
  }

  if (ASSERT && reports.length > 0) {
    const passed = reports.filter((r) => r.passed).length;
    const matrixReport: MatrixReport = {
      date: dateLabel,
      aiMode: AI_MODE,
      dataMode: DATA_MODE,
      totalPresets: reports.length,
      passed,
      failed: reports.length - passed,
      results: reports,
    };
    writeReport(outputDir, matrixReport);
  }

  console.log(`\nDone. Open ${VAULT_ROOT} in Obsidian to review.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

**Step 2: Smoke test — run one preset in mock mode**

```bash
source ~/.nvm/nvm.sh && nvm use
PRESET=no-ai-minimal npx tsx scripts/daily-matrix.ts
```

Expected output:
```
Daily Matrix — 2026-02-21
Presets: no-ai-minimal
Output: ~/obsidian-vaults/daily-digest-test/2026-02-21
▶ no-ai-minimal [data:fixtures ai:mock]
   ✓ Wrote ~/obsidian-vaults/daily-digest-test/2026-02-21/no-ai-minimal.md
Done. Open ~/obsidian-vaults/daily-digest-test in Obsidian to review.
```

**Step 3: Verify the file was written**

```bash
ls ~/obsidian-vaults/daily-digest-test/2026-02-21/
head -20 ~/obsidian-vaults/daily-digest-test/2026-02-21/no-ai-minimal.md
```

Expected: frontmatter + title visible.

**Step 4: Run a mock AI preset**

```bash
PRESET=cloud-haiku-tier1 npx tsx scripts/daily-matrix.ts
```

Expected: file written with `<details>` block containing the prompt.

**Step 5: Run all presets (mock)**

```bash
npx tsx scripts/daily-matrix.ts
```

Expected: 12 files written to the output directory.

**Step 6: Commit**

```bash
git add scripts/daily-matrix.ts
git commit -m "feat: implement daily-matrix CLI entry point"
```

---

## Task 12: Add npm Scripts

**Files:**
- Modify: `package.json`

**Step 1: Add scripts**

In `package.json`, add to the `"scripts"` block:

```json
"matrix":        "tsx scripts/daily-matrix.ts",
"matrix:real":   "AI_MODE=real DATA_MODE=real tsx scripts/daily-matrix.ts",
"matrix:assert": "MATRIX_ASSERT=true tsx scripts/daily-matrix.ts"
```

**Step 2: Verify**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run matrix -- 2>&1 | head -5
```

Expected: first few lines of matrix output.

**Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add matrix npm scripts"
```

---

## Task 13: Create launchd Install Script

**Files:**
- Create: `scripts/install-launchd.sh`

**Step 1: Implement**

```bash
#!/usr/bin/env bash
# scripts/install-launchd.sh
# Usage:
#   bash scripts/install-launchd.sh install          # Install, runs at 07:00
#   MATRIX_HOUR=22 bash scripts/install-launchd.sh install  # Custom hour
#   bash scripts/install-launchd.sh uninstall

set -e

LABEL="com.brianruggieri.daily-matrix"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
HOUR="${MATRIX_HOUR:-7}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="$HOME/Library/Logs/daily-matrix.log"
NVM_DIR="${NVM_DIR:-$HOME/.nvm}"

action="${1:-install}"

if [[ "$action" == "uninstall" ]]; then
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  echo "Uninstalled $LABEL"
  exit 0
fi

if [[ "$action" != "install" ]]; then
  echo "Usage: $0 [install|uninstall]"
  exit 1
fi

mkdir -p "$HOME/Library/LaunchAgents"
mkdir -p "$HOME/Library/Logs"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>source ${NVM_DIR}/nvm.sh &amp;&amp; nvm use &amp;&amp; cd ${REPO_DIR} &amp;&amp; npm run matrix</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${HOUR}</integer>
    <key>Minute</key>
    <integer>0</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${LOG_FILE}</string>
  <key>StandardErrorPath</key>
  <string>${LOG_FILE}</string>
  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "Installed $LABEL — runs daily at ${HOUR}:00"
echo "Log: $LOG_FILE"
echo "To uninstall: bash scripts/install-launchd.sh uninstall"
```

**Step 2: Make it executable**

```bash
chmod +x scripts/install-launchd.sh
```

**Step 3: Test installation (optional — installs for real)**

```bash
bash scripts/install-launchd.sh install
launchctl list | grep brianruggieri
```

Expected: entry visible in launchctl list.

**Step 4: Commit**

```bash
git add scripts/install-launchd.sh
git commit -m "feat: add launchd install script for daily matrix automation"
```

---

## Task 14: Run Full Test Suite and Final Verification

**Step 1: Run all unit tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run test:unit
```

Expected: all pass including the new tests for prompt-logger, presets, mock-ai, collector-shim, assertions.

**Step 2: Run full matrix in mock mode**

```bash
npm run matrix
```

Expected: 12 files written, no errors.

**Step 3: Run single preset with assertions**

```bash
PRESET=cloud-haiku-tier1 MATRIX_ASSERT=true npm run matrix
```

Expected: assertions pass, no failures.

**Step 4: Verify files in Obsidian**

Open `~/obsidian-vaults/daily-digest-test` in Obsidian. Confirm:
- 12 files visible in today's folder
- Click into `cloud-haiku-tier1.md` → reading mode → `<details>` block is collapsed and expandable
- `no-ai-minimal.md` has no `<details>` block

**Step 5: Final commit and push to branch**

```bash
npm run build  # ensure no TypeScript errors
git log --oneline -15
```

---

## Phase 2 Tracking (Out of Scope for This Plan)

The following are documented here for future planning:

- **Realistic persona enhancement** (`@faker-js/faker`-seeded browser, shell, git, Claude data generators)
- **LLM-as-judge assertions** (`MATRIX_JUDGE=true`, hooks into `tests/eval/`)
- **Day-over-day diffing** (`scripts/diff-matrix.ts`)
- **`matrix:real` smoke test** against live data (requires verifying collector WASM in script context)

---

## Troubleshooting

**`tsx` can't find Obsidian types**
The `obsidian` package is a type-only dependency in scripts. If tsx complains, add `/// <reference types="obsidian" />` at the top of the script, or add `"skipLibCheck": true` to tsconfig.json.

**Collector WASM fails in script context**
`sql.js` loads a `.wasm` binary that esbuild normally inlines. Outside of esbuild, use: `initSqlJs({ locateFile: () => require.resolve('sql.js/dist/sql-wasm.wasm') })`. The collector shim's `collectRealData` will need this fix if browser history WASM errors occur.

**`buildPrompt` not exported**
If the export in Task 4 causes a lint error, check that `buildPrompt` is not a duplicate export. The function is declared once around line 12 of `summarize.ts`.

**launchd not running**
Check `~/Library/Logs/daily-matrix.log`. Common causes: nvm not sourced (plist sources with `-lc` flag), wrong repo path in plist, or `npm run matrix` exits non-zero (check logs).
