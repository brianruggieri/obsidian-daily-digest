# Repo Restructure Implementation Plan

> **Status:** Completed. Implementation merged to main.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reorganize `src/` from 23 flat files into pipeline-stage directories (`collect/`, `filter/`, `analyze/`, `summarize/`, `render/`, `plugin/`, `settings/`) and split the two monster files (`settings.ts` and `collectors.ts`) for maximum discoverability.

**Architecture:** Pure structural movement — no logic changes. Each task moves a group of related files, updates all import paths, and verifies the build and tests still pass. The result is a tree where you can navigate to any file by thinking about what stage it belongs to.

**Tech Stack:** TypeScript, esbuild, Vitest, Node 22 (nvm). Run all commands with `source ~/.nvm/nvm.sh && nvm use` prepended.

---

## Before You Begin

This work happens on its own branch. Create a worktree:

```bash
git worktree add .worktrees/refactor-structure feat/restructure-src
cd .worktrees/refactor-structure
```

All steps below assume you are in `.worktrees/refactor-structure`.

**Verification commands used throughout:**
- Type-check: `source ~/.nvm/nvm.sh && nvm use && npm run build`
- Unit tests: `source ~/.nvm/nvm.sh && nvm use && npm run test:unit`

---

## Task 1: Split `settings.ts` → `settings/types.ts` + `settings/ui.ts`

**Files:**
- Create: `src/settings/types.ts`
- Create: `src/settings/ui.ts`
- Delete: `src/settings.ts`
- Modify (import path updates): `src/ai-client.ts`, `src/collectors.ts`, `src/privacy.ts`, `src/renderer.ts`, `src/main.ts`, `scripts/lib/collector-shim.ts`, `scripts/presets.ts`, `tests/unit/codex-collector.test.ts`, `tests/unit/git-collector.test.ts`, `tests/unit/secret-storage.test.ts`

**Step 1: Create `src/settings/` directory**

```bash
mkdir src/settings
```

**Step 2: Create `src/settings/types.ts`**

Copy the following content from `src/settings.ts` — these are the first ~100 lines (everything before the `DailyDigestSettingTab` class):

```typescript
export const SECRET_ID = "anthropic-api-key";

export type AIProvider = "none" | "local" | "anthropic";

export interface DailyDigestSettings {
  // ... (copy the full DailyDigestSettings interface verbatim)
}

export const DEFAULT_SETTINGS: DailyDigestSettings = {
  // ... (copy DEFAULT_SETTINGS verbatim)
};
```

Read `src/settings.ts` and copy exactly — do not paraphrase. The file contains `SECRET_ID`, `AIProvider` type, `DailyDigestSettings` interface, and `DEFAULT_SETTINGS` constant. Those four things go into `settings/types.ts`. Nothing else.

**Step 3: Create `src/settings/ui.ts`**

Start the file with updated import paths (settings.ts currently imports these — update each path):

```typescript
import { App, PluginSettingTab, /* ... all obsidian imports ... */ } from "obsidian";
import type DailyDigestPlugin from "../plugin/main";         // was: "./main"
import { PRIVACY_DESCRIPTIONS } from "../plugin/privacy";    // was: "./privacy"
import { BrowserInstallConfig, SanitizationLevel, SensitivityCategory } from "../types"; // was: "./types"
import { getCategoryInfo, getTotalBuiltinDomains } from "../filter/sensitivity"; // was: "./sensitivity"
import { detectAllBrowsers, mergeDetectedWithExisting, BROWSER_DISPLAY_NAMES } from "../collect/browser-profiles"; // was: "./browser-profiles"
import * as log from "../plugin/log";                        // was: "./log"
import { DailyDigestSettings, DEFAULT_SETTINGS, AIProvider, SECRET_ID } from "./types"; // NEW: pulls from sibling
```

Then copy the entire `DailyDigestSettingTab` class body verbatim from `src/settings.ts`.

**Step 4: Update imports in files that imported from `./settings`**

Each file below imports from `./settings` or `../src/settings`. Update to the correct new path:

| File | Old import | New import |
|------|-----------|-----------|
| `src/ai-client.ts:2` | `from "./settings"` → `AIProvider` | `from "../settings/types"` |
| `src/collectors.ts:7` | `from "./settings"` → `DailyDigestSettings` | `from "../settings/types"` |
| `src/privacy.ts:2` | `from "./settings"` → `DailyDigestSettings` | `from "../settings/types"` |
| `src/renderer.ts:12` | `from "./settings"` → `AIProvider` | `from "../settings/types"` |
| `src/main.ts:2` | `from "./settings"` → `DailyDigestSettings, DailyDigestSettingTab, DEFAULT_SETTINGS, SECRET_ID` | Split: `from "./settings/types"` for the types/defaults, `from "./settings/ui"` for `DailyDigestSettingTab` |
| `scripts/lib/collector-shim.ts:1` | `from "../../src/settings"` | `from "../../src/settings/types"` |
| `scripts/presets.ts:1` | `from "../src/settings"` | `from "../src/settings/types"` |
| `tests/unit/codex-collector.test.ts:6` | `from "../../src/settings"` | `from "../../src/settings/types"` |
| `tests/unit/git-collector.test.ts:3` | `from "../../src/settings"` | `from "../../src/settings/types"` |
| `tests/unit/secret-storage.test.ts:2` | `from "../../src/settings"` | `from "../../src/settings/types"` |

Note for `src/main.ts`: the import line currently is:
```typescript
import { DailyDigestSettings, DailyDigestSettingTab, DEFAULT_SETTINGS, SECRET_ID } from "./settings";
```
Replace with two lines:
```typescript
import { DailyDigestSettings, DEFAULT_SETTINGS, SECRET_ID } from "./settings/types";
import { DailyDigestSettingTab } from "./settings/ui";
```

**Step 5: Delete `src/settings.ts`**

```bash
git rm src/settings.ts
git add src/settings/types.ts src/settings/ui.ts
```

**Step 6: Verify no stale settings imports remain**

```bash
grep -r 'from "\./settings"' src/ scripts/ tests/
grep -r 'from ".*\/src\/settings"' scripts/ tests/
```

Both should return empty. Any hits are import paths still pointing at the deleted file.

**Step 7: Verify build passes**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
```

Expected: build completes with no TypeScript errors.

**Step 8: Run tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run test:unit
```

Expected: all tests pass.

**Step 9: Commit**

```bash
git add -A
git commit -m "refactor: split settings.ts into settings/types.ts and settings/ui.ts"
```

---

## Task 2: Split `collectors.ts` + move `browser-profiles.ts` → `collect/`

> **Note on shell:** `readShellHistory` was removed from `collectors.ts` prior to this refactor. There is no `collect/shell.ts` to create.

**Files:**
- Create: `src/collect/browser.ts`, `src/collect/claude.ts`, `src/collect/codex.ts`, `src/collect/git.ts`
- Move: `src/browser-profiles.ts` → `src/collect/browser-profiles.ts`
- Delete: `src/collectors.ts`
- Modify (import path updates): `src/main.ts`, `src/settings/ui.ts` (verify), `scripts/inspect.ts` (browser-profiles path only), `tests/unit/collectors.test.ts`, `tests/unit/codex-collector.test.ts`, `tests/unit/git-collector.test.ts`, `tests/unit/browser-profiles.test.ts`

**Step 1: Create `src/collect/` directory**

```bash
mkdir src/collect
```

**Step 2: Move `browser-profiles.ts`**

```bash
git mv src/browser-profiles.ts src/collect/browser-profiles.ts
```

Update the one import inside `src/collect/browser-profiles.ts` itself:
```typescript
// was: import { ... } from "./types";
import { ... } from "../types";
```

**Step 3: Create `src/collect/browser.ts`**

Read `src/collectors.ts`. Extract everything related to browser collection:
- The `unwrapGoogleRedirect` function
- All private helper functions that `collectBrowserHistory` calls (SQLite reading, URL parsing, etc.)
- The `collectBrowserHistory` export

Update imports at the top:
```typescript
import { DailyDigestSettings } from "../settings/types";  // was: "./settings"
import { scrubSecrets } from "../filter/sanitize";         // was: "./sanitize"
import { warn } from "../plugin/log";                      // was: "./log"
// ... plus all node/sql.js imports (unchanged)
```

**Step 4: Create `src/collect/claude.ts`**

Extract `readClaudeSessions`. Update imports:
```typescript
import { DailyDigestSettings } from "../settings/types";
import { warn } from "../plugin/log";
```

**Step 5: Create `src/collect/codex.ts`**

Extract `readCodexSessions`. Update imports:
```typescript
import { DailyDigestSettings } from "../settings/types";
import { warn } from "../plugin/log";
```

**Step 6: Create `src/collect/git.ts`**

Extract `readGitHistory` and `parseGitLogOutput`. Update imports:
```typescript
import { DailyDigestSettings } from "../settings/types";
import { warn } from "../plugin/log";
```

**Step 7: Delete `src/collectors.ts`**

```bash
git rm src/collectors.ts
git add src/collect/
```

**Step 8: Update imports in files that imported `./collectors`**

`src/main.ts` — replace the single collectors import with four:
```typescript
// was:
import { collectBrowserHistory, readClaudeSessions, readCodexSessions, readGitHistory } from "./collectors";
// becomes:
import { collectBrowserHistory } from "./collect/browser";
import { readClaudeSessions } from "./collect/claude";
import { readCodexSessions } from "./collect/codex";
import { readGitHistory } from "./collect/git";
```

`src/settings/ui.ts` — the browser-profiles import was already written with the new path in Task 1. Verify:
```typescript
// should already be: from "../collect/browser-profiles"
// relative path from src/settings/ui.ts to src/collect/browser-profiles.ts is: ../collect/browser-profiles ✓
```

`scripts/inspect.ts` — imports `detectAllBrowsers` directly from `../src/browser-profiles`. Update:
```typescript
// was: from "../src/browser-profiles"
// becomes: from "../src/collect/browser-profiles"
```

**Note:** `scripts/inspector.ts`, `scripts/daily-matrix.ts` do NOT import from `../src/collectors` or `../src/browser-profiles` — they route collection through `scripts/lib/collector-shim`. No changes needed in those files for this task (they will need updates in Tasks 3–6 for the filter/analyze/etc. moves).

Tests that import from collectors:
- `tests/unit/collectors.test.ts`: imports `unwrapGoogleRedirect` from `../../src/collectors` → `../../src/collect/browser`
- `tests/unit/codex-collector.test.ts:5`: `from "../../src/collectors"` → `from "../../src/collect/codex"`
- `tests/unit/git-collector.test.ts:2`: `from "../../src/collectors"` → `from "../../src/collect/git"`
- `tests/unit/browser-profiles.test.ts`: any `../../src/browser-profiles` imports → `../../src/collect/browser-profiles`

**Step 9: Verify no stale collectors/browser-profiles imports remain**

```bash
grep -r 'from "\./collectors"' src/ scripts/ tests/
grep -r 'from ".*\/src\/collectors"' scripts/ tests/
grep -r 'from ".*browser-profiles"' src/ scripts/ tests/
```

All `browser-profiles` hits should now point at `collect/browser-profiles`.

**Step 10: Verify build passes**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
```

**Step 11: Run tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run test:unit
```

**Step 12: Commit**

```bash
git add -A
git commit -m "refactor: split collectors.ts into collect/ and move browser-profiles.ts"
```

---

## Task 3: Move `filter/` group (sanitize, sensitivity, categorize, classify)

**Files:**
- Move: `src/sanitize.ts` → `src/filter/sanitize.ts`
- Move: `src/sensitivity.ts` → `src/filter/sensitivity.ts`
- Move: `src/categorize.ts` → `src/filter/categorize.ts`
- Move: `src/classify.ts` → `src/filter/classify.ts`
- Modify (import paths inside moved files + all importers)

**Step 1: Create directory and move files**

```bash
mkdir src/filter
git mv src/sanitize.ts src/filter/sanitize.ts
git mv src/sensitivity.ts src/filter/sensitivity.ts
git mv src/categorize.ts src/filter/categorize.ts
git mv src/classify.ts src/filter/classify.ts
```

**Step 2: Update imports inside moved files**

`src/filter/sanitize.ts` — check its imports (likely imports from `./types`):
```typescript
// was: from "./types"
// becomes: from "../types"
```

`src/filter/sensitivity.ts`:
```typescript
// was: from "./types"
// becomes: from "../types"
```

`src/filter/categorize.ts`:
```typescript
// was: from "./types"
// becomes: from "../types"
```

`src/filter/classify.ts`:
```typescript
// was: from "./ai-client"  → from "../summarize/ai-client"
// was: from "./categorize" → from "./categorize"    (same dir, unchanged)
// was: from "./log"        → from "../plugin/log"
```

**Step 3: Update all files that import from these modules**

Files importing from `./sanitize` or `../../src/sanitize`:

| Importer | Old path | New path |
|----------|----------|----------|
| `src/collect/browser.ts` | `../filter/sanitize` | already set in Task 2 |
| `src/main.ts:16` | `./sanitize` | `./filter/sanitize` |
| `scripts/daily-matrix.ts` | `../src/sanitize` | `../src/filter/sanitize` |
| `scripts/inspect.ts` | `../src/sanitize` | `../src/filter/sanitize` |
| `scripts/inspector.ts` | `../src/sanitize` | `../src/filter/sanitize` |
| `tests/unit/sanitize.test.ts` | `../../src/sanitize` (check) | `../../src/filter/sanitize` |
| `tests/integration/pipeline.test.ts:3` | `../../src/sanitize` | `../../src/filter/sanitize` |
| `tests/eval/knowledge-value.eval.ts:17` | `../../src/sanitize` | `../../src/filter/sanitize` |
| `tests/eval/privacy-audit.eval.ts:16` | `../../src/sanitize` | `../../src/filter/sanitize` |
| `tests/eval/prompt-safety.eval.ts:17` | `../../src/sanitize` | `../../src/filter/sanitize` |
| `tests/eval/summary-quality.eval.ts:16` | `../../src/sanitize` | `../../src/filter/sanitize` |

> **Note:** `src/compress.ts` and `src/summarize.ts` do **not** import `sanitize` — those imports were removed. Do not add them.

Files importing from `./sensitivity`:

| Importer | Old path | New path |
|----------|----------|----------|
| `src/settings/ui.ts:5` | `../filter/sensitivity` | already set in Task 1 |
| `src/main.ts:18` | `./sensitivity` | `./filter/sensitivity` |
| `scripts/daily-matrix.ts` | `../src/sensitivity` | `../src/filter/sensitivity` |
| `scripts/inspect.ts` | `../src/sensitivity` | `../src/filter/sensitivity` |
| `scripts/inspector.ts` | (check) | `../src/filter/sensitivity` |
| `tests/unit/sensitivity.test.ts` | (check) | `../../src/filter/sensitivity` |

Files importing from `./categorize`:

| Importer | Old path | New path |
|----------|----------|----------|
| `src/compress.ts` | `./categorize` | `./filter/categorize` |
| `src/chunker.ts` | `./categorize` | `./filter/categorize` |
| `src/summarize.ts` | `./categorize` | `./filter/categorize` |
| `src/renderer.ts` | `./categorize` | `./filter/categorize` |
| `src/main.ts:4` | `./categorize` | `./filter/categorize` |
| `scripts/daily-matrix.ts` | `../src/categorize` | `../src/filter/categorize` |
| `scripts/inspect.ts` | `../src/categorize` | `../src/filter/categorize` |
| `scripts/inspector.ts` | `../src/categorize` | `../src/filter/categorize` |
| `tests/unit/categorize.test.ts` | (check) | `../../src/filter/categorize` |
| `tests/integration/pipeline.test.ts:2` | `../../src/categorize` | `../../src/filter/categorize` |
| `tests/eval/*.eval.ts` | `../../src/categorize` | `../../src/filter/categorize` |
| `tests/unit/compress.test.ts:4` | `../../src/categorize` | `../../src/filter/categorize` |

Files importing from `./classify`:

| Importer | Old path | New path |
|----------|----------|----------|
| `src/main.ts:17` | `./classify` | `./filter/classify` |
| `scripts/daily-matrix.ts` | `../src/classify` | `../src/filter/classify` |
| `scripts/inspect.ts` | `../src/classify` | `../src/filter/classify` |
| `scripts/inspector.ts` | `../src/classify` | `../src/filter/classify` |
| `tests/unit/classify.test.ts` | (check) | `../../src/filter/classify` |
| `tests/integration/pipeline.test.ts:4` | `../../src/classify` | `../../src/filter/classify` |
| `tests/eval/*.eval.ts` | `../../src/classify` | `../../src/filter/classify` |

**Step 4: Verify build passes**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
```

**Step 5: Run tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run test:unit
```

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move filter stage files into src/filter/"
```

---

## Task 4: Move `analyze/` group (patterns, knowledge)

**Files:**
- Move: `src/patterns.ts` → `src/analyze/patterns.ts`
- Move: `src/knowledge.ts` → `src/analyze/knowledge.ts`

**Step 1: Create directory and move files**

```bash
mkdir src/analyze
git mv src/patterns.ts src/analyze/patterns.ts
git mv src/knowledge.ts src/analyze/knowledge.ts
```

**Step 2: Update imports inside moved files**

Read both files and update any `./types`, `./log`, or cross-module imports to use `../`:

`src/analyze/patterns.ts` — likely imports from `./types`:
```typescript
// was: from "./types"  → from "../types"
// was: from "./log"    → from "../plugin/log"
```

`src/analyze/knowledge.ts` — likely imports from `./types` or `./patterns`:
```typescript
// was: from "./types"    → from "../types"
// was: from "./patterns" → from "./patterns"   (same dir, unchanged)
```

**Step 3: Update all importers**

Files importing from `./patterns`:

| Importer | New path |
|----------|----------|
| `src/main.ts:19` | `./analyze/patterns` |
| `scripts/daily-matrix.ts` | `../src/analyze/patterns` |
| `scripts/inspect.ts` | `../src/analyze/patterns` |
| `scripts/inspector.ts` | `../src/analyze/patterns` |
| `tests/unit/patterns.test.ts` | `../../src/analyze/patterns` |
| `tests/integration/pipeline.test.ts:5` | `../../src/analyze/patterns` |
| `tests/eval/*.eval.ts` | `../../src/analyze/patterns` |

Files importing from `./knowledge`:

| Importer | New path |
|----------|----------|
| `src/main.ts:20` | `./analyze/knowledge` |
| `src/renderer.ts` | `./analyze/knowledge` |
| `scripts/daily-matrix.ts` | `../src/analyze/knowledge` |
| `scripts/inspect.ts` | `../src/analyze/knowledge` |
| `scripts/inspector.ts` | `../src/analyze/knowledge` |
| `tests/unit/knowledge.test.ts` | `../../src/analyze/knowledge` |
| `tests/integration/pipeline.test.ts:6` | `../../src/analyze/knowledge` |
| `tests/eval/knowledge-value.eval.ts:15` | `../../src/analyze/knowledge` |

**Step 4: Verify build**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
```

**Step 5: Run tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run test:unit
```

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move analyze stage files into src/analyze/"
```

---

## Task 5: Move `summarize/` group (ai-client, compress, chunker, embeddings, prompt-templates, summarize)

> **Note on naming:** `src/summarize.ts` moves to `src/summarize/summarize.ts` — directory and file share the same stem. TypeScript and esbuild handle this fine; just be precise with the path.

**Files:**
- Move: `src/ai-client.ts` → `src/summarize/ai-client.ts`
- Move: `src/compress.ts` → `src/summarize/compress.ts`
- Move: `src/chunker.ts` → `src/summarize/chunker.ts`
- Move: `src/embeddings.ts` → `src/summarize/embeddings.ts`
- Move: `src/prompt-templates.ts` → `src/summarize/prompt-templates.ts`
- Move: `src/summarize.ts` → `src/summarize/summarize.ts`

**Step 1: Create directory and move files**

```bash
mkdir src/summarize
git mv src/ai-client.ts src/summarize/ai-client.ts
git mv src/compress.ts src/summarize/compress.ts
git mv src/chunker.ts src/summarize/chunker.ts
git mv src/embeddings.ts src/summarize/embeddings.ts
git mv src/prompt-templates.ts src/summarize/prompt-templates.ts
git mv src/summarize.ts src/summarize/summarize.ts
```

**Step 2: Update imports inside moved files**

All six files are now in `src/summarize/`. Imports between them stay as `./something` (same dir). Imports to outside go `../something`.

`src/summarize/ai-client.ts`:
```typescript
// was: from "./settings"        → from "../settings/types"
```

`src/summarize/compress.ts`:
```typescript
// was: from "./categorize"  → from "../filter/categorize"
// was: from "./chunker"     → from "./chunker"    (same dir, unchanged)
// Note: scrubSecrets import was already removed — do not add it back
```

`src/summarize/chunker.ts`:
```typescript
// was: from "./categorize"  → from "../filter/categorize"
```

`src/summarize/embeddings.ts`:
```typescript
// was: from "./types"  → from "../types"
// was: from "./log"    → from "../plugin/log"
```

`src/summarize/prompt-templates.ts`:
```typescript
// Check its imports — any process.cwd() or similar runtime path references need no change
```

`src/summarize/summarize.ts`:
```typescript
// was: from "./categorize"      → from "../filter/categorize"
// was: from "./chunker"         → from "./chunker"          (same dir)
// was: from "./embeddings"      → from "./embeddings"       (same dir)
// was: from "./compress"        → from "./compress"         (same dir)
// was: from "./types"           → from "../types"
// was: from "./ai-client"       → from "./ai-client"        (same dir)
// was: from "./prompt-templates"→ from "./prompt-templates" (same dir)
// was: from "./log"             → from "../plugin/log"
// Note: scrubSecrets import was already removed — do not add it back
```

**Step 3: Update all importers**

Files importing from `./ai-client`:

| Importer | New path |
|----------|----------|
| `src/filter/classify.ts` | `../summarize/ai-client` |
| `src/main.ts:8` | `./summarize/ai-client` |
| `scripts/daily-matrix.ts` (type import) | `../src/summarize/ai-client` |
| `scripts/inspector.ts` (type import) | `../src/summarize/ai-client` |

Files importing from `./compress` or `../../src/compress`:

| Importer | New path |
|----------|----------|
| `src/summarize/summarize.ts` | `./compress` (same dir, done above) |
| `src/main.ts:5` | `./summarize/compress` |
| `tests/unit/compress.test.ts:2` | `../../src/summarize/compress` |
| `tests/unit/compress.test.ts:3` (chunker) | `../../src/summarize/chunker` |

Files importing from `./summarize`:

| Importer | New path |
|----------|----------|
| `src/main.ts:6` | `./summarize/summarize` |
| `scripts/daily-matrix.ts` | `../src/summarize/summarize` |
| `scripts/inspect.ts` | `../src/summarize/summarize` |
| `scripts/inspector.ts` | `../src/summarize/summarize` |
| `tests/unit/summarize.test.ts` | `../../src/summarize/summarize` |
| `tests/integration/privacy-escalation.test.ts:2` | `../../src/summarize/summarize` |
| `tests/eval/*.eval.ts` | `../../src/summarize/summarize` |

Files importing from `./prompt-templates`:

| Importer | New path |
|----------|----------|
| `tests/unit/prompt-templates.test.ts:3` | `../../src/summarize/prompt-templates` |

**Step 4: Verify build**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
```

**Step 5: Run tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run test:unit
```

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move summarize stage files into src/summarize/"
```

---

## Task 6: Move `render/` group (renderer, merge)

**Files:**
- Move: `src/renderer.ts` → `src/render/renderer.ts`
- Move: `src/merge.ts` → `src/render/merge.ts`

**Step 1: Create directory and move files**

```bash
mkdir src/render
git mv src/renderer.ts src/render/renderer.ts
git mv src/merge.ts src/render/merge.ts
```

**Step 2: Update imports inside moved files**

`src/render/renderer.ts`:
```typescript
// was: from "./categorize" → from "../filter/categorize"
// was: from "./settings"   → from "../settings/types"    (AIProvider)
// was: from "./knowledge"  → from "../analyze/knowledge"
// was: from "./types"      → from "../types"
```

`src/render/merge.ts` — check its imports. Likely imports from `./types`:
```typescript
// was: from "./types"  → from "../types"
// was: from "./log"    → from "../plugin/log"  (if it uses log)
```

**Step 3: Update all importers**

Files importing from `./renderer`:

| Importer | New path |
|----------|----------|
| `src/main.ts:9` | `./render/renderer` |
| `scripts/daily-matrix.ts` | `../src/render/renderer` |
| `scripts/inspect.ts` | `../src/render/renderer` |
| `scripts/inspector.ts` | `../src/render/renderer` |
| `tests/unit/renderer.test.ts:2` | `../../src/render/renderer` |
| `tests/unit/merge.test.ts:10` | `../../src/render/renderer` |
| `tests/integration/merge-safety.test.ts:11` | `../../src/render/renderer` |
| `tests/integration/pipeline.test.ts:7` | `../../src/render/renderer` |
| `tests/eval/knowledge-value.eval.ts:16` | `../../src/render/renderer` |

Files importing from `./merge`:

| Importer | New path |
|----------|----------|
| `src/main.ts:21` | `./render/merge` |
| `tests/unit/merge.test.ts` (check) | `../../src/render/merge` |

**Step 4: Verify build**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
```

**Step 5: Run tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run test:unit
```

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move render stage files into src/render/"
```

---

## Task 7: Move `plugin/` group (main, privacy, pipeline-debug, log) + update esbuild

This task moves `main.ts` — the esbuild entry point. Update `esbuild.config.mjs` in the same commit.

**Files:**
- Move: `src/main.ts` → `src/plugin/main.ts`
- Move: `src/privacy.ts` → `src/plugin/privacy.ts`
- Move: `src/pipeline-debug.ts` → `src/plugin/pipeline-debug.ts`
- Move: `src/log.ts` → `src/plugin/log.ts`
- Modify: `esbuild.config.mjs` (entry point)

**Step 1: Create directory and move files**

```bash
mkdir src/plugin
git mv src/main.ts src/plugin/main.ts
git mv src/privacy.ts src/plugin/privacy.ts
git mv src/pipeline-debug.ts src/plugin/pipeline-debug.ts
git mv src/log.ts src/plugin/log.ts
```

**Step 2: Update imports inside moved files**

`src/plugin/main.ts` — all the paths set up in Tasks 1–6 assumed main.ts was still at `src/main.ts`. Now it moves to `src/plugin/main.ts`. Update every import:

```typescript
// settings/types and settings/ui: was "./settings/types" → "../settings/types"
//                                   was "./settings/ui"   → "../settings/ui"
// collect/*:     was "./collect/browser" → "../collect/browser"  (and claude, codex, git)
// filter/*:      was "./filter/categorize" → "../filter/categorize"
//                was "./filter/sanitize"   → "../filter/sanitize"
//                was "./filter/classify"   → "../filter/classify"
//                was "./filter/sensitivity"→ "../filter/sensitivity"
// analyze/*:     was "./analyze/patterns"  → "../analyze/patterns"
//                was "./analyze/knowledge" → "../analyze/knowledge"
// summarize/*:   was "./summarize/compress"  → "../summarize/compress"
//                was "./summarize/summarize" → "../summarize/summarize"
//                was "./summarize/ai-client" → "../summarize/ai-client"
// render/*:      was "./render/renderer" → "../render/renderer"
//                was "./render/merge"    → "../render/merge"
// plugin/*:      was "./pipeline-debug"  → "./pipeline-debug"  (same dir)
//                was "./privacy"         → "./privacy"          (same dir)
//                was "./log"             → "./log"              (same dir)
// types:         was "./types"           → "../types"
```

`src/plugin/privacy.ts`:
```typescript
// was: from "./settings"        → from "../settings/types"
```

`src/plugin/pipeline-debug.ts`:
```typescript
// was: import type DailyDigestPlugin from "./main"  → "./main"  (same dir, unchanged)
```

`src/plugin/log.ts`:
```typescript
// (check — likely no local imports)
```

`src/settings/ui.ts` — it imports from `"../plugin/main"` and `"../plugin/privacy"` (already set in Task 1 — verify these are correct).

**Step 3: Update `esbuild.config.mjs`**

Line 17: `entryPoints: ["src/main.ts"]` → `entryPoints: ["src/plugin/main.ts"]`

**Step 4: Update any remaining importers**

Check if `tests/unit/settings-git-ui.test.ts` imports from privacy:
```typescript
// was: from "../../src/privacy"  → from "../../src/plugin/privacy"
```

**Step 5: Verify build**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
```

Expected: esbuild picks up `src/plugin/main.ts` and builds successfully.

**Step 6: Run tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run test:unit
```

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor: move plugin files into src/plugin/, update esbuild entry point"
```

---

## Task 8: Move unit test files to mirror new src/ structure

The existing flat `tests/unit/*.test.ts` files should mirror the new subdirectory layout.

**Step 1: Create test subdirectories**

```bash
mkdir -p tests/unit/collect
mkdir -p tests/unit/filter
mkdir -p tests/unit/analyze
mkdir -p tests/unit/summarize
mkdir -p tests/unit/render
mkdir -p tests/unit/plugin
mkdir -p tests/unit/settings
```

**Step 2: Move test files**

```bash
# collect/
git mv tests/unit/browser-profiles.test.ts tests/unit/collect/browser-profiles.test.ts
git mv tests/unit/collectors.test.ts tests/unit/collect/browser.test.ts
git mv tests/unit/codex-collector.test.ts tests/unit/collect/codex.test.ts
git mv tests/unit/git-collector.test.ts tests/unit/collect/git.test.ts

# filter/
git mv tests/unit/sanitize.test.ts tests/unit/filter/sanitize.test.ts
git mv tests/unit/sensitivity.test.ts tests/unit/filter/sensitivity.test.ts
git mv tests/unit/categorize.test.ts tests/unit/filter/categorize.test.ts
git mv tests/unit/classify.test.ts tests/unit/filter/classify.test.ts

# analyze/
git mv tests/unit/patterns.test.ts tests/unit/analyze/patterns.test.ts
git mv tests/unit/knowledge.test.ts tests/unit/analyze/knowledge.test.ts

# summarize/
git mv tests/unit/mock-ai.test.ts tests/unit/summarize/ai-client.test.ts
git mv tests/unit/compress.test.ts tests/unit/summarize/compress.test.ts
git mv tests/unit/prompt-templates.test.ts tests/unit/summarize/prompt-templates.test.ts
git mv tests/unit/summarize.test.ts tests/unit/summarize/summarize.test.ts

# render/
git mv tests/unit/renderer.test.ts tests/unit/render/renderer.test.ts
git mv tests/unit/merge.test.ts tests/unit/render/merge.test.ts

# settings/
git mv tests/unit/settings-git-ui.test.ts tests/unit/settings/settings-git-ui.test.ts
git mv tests/unit/presets.test.ts tests/unit/settings/presets.test.ts
```

Files that stay flat (cross-cutting or scripts-level concerns):
- `tests/unit/assertions.test.ts` — stays
- `tests/unit/collector-shim.test.ts` — stays
- `tests/unit/secret-storage.test.ts` — stays
- `tests/unit/prompt-logger.test.ts` — stays

**Step 3: Update imports inside renamed/moved test files**

Each moved test file has imports to `../../src/...` — with the added subdirectory level they now need `../../../src/...`. Go through each moved test file and update the depth of the relative path.

For example, `tests/unit/collect/browser.test.ts` (was `tests/unit/collectors.test.ts`):
```typescript
// was: from "../../src/collectors"  → from "../../../src/collect/browser"
```

Pattern: files that moved one level deeper (`tests/unit/X/foo.test.ts`) replace `../../` with `../../../` for all `../../src/` imports.

**Step 4: Run tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run test:unit
```

Expected: all tests pass. The vitest config `tests/unit/**/*.test.ts` glob already covers subdirectories.

**Step 5: Run integration tests**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run test:integration
```

**Step 6: Full build**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build
```

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor: reorganize tests/unit/ to mirror new src/ structure"
```

---

## Task 9: Final verification + PR

**Step 1: Run the full test suite**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run test
```

Expected: all unit + integration tests pass.

**Step 2: Production build**

```bash
source ~/.nvm/nvm.sh && nvm use && npm run build -- production
```

Expected: `main.js` produced with no errors.

**Step 3: Verify the tree looks right**

```bash
find src -type f -name "*.ts" | sort
```

Expected output (27 files, organized in subdirectories):
```
src/collect/browser-profiles.ts
src/collect/browser.ts
src/collect/claude.ts
src/collect/codex.ts
src/collect/git.ts
src/filter/categorize.ts
src/filter/classify.ts
src/filter/sanitize.ts
src/filter/sensitivity.ts
src/analyze/knowledge.ts
src/analyze/patterns.ts
src/summarize/ai-client.ts
src/summarize/chunker.ts
src/summarize/compress.ts
src/summarize/embeddings.ts
src/summarize/prompt-templates.ts
src/summarize/summarize.ts
src/render/merge.ts
src/render/renderer.ts
src/plugin/log.ts
src/plugin/main.ts
src/plugin/pipeline-debug.ts
src/plugin/privacy.ts
src/settings/types.ts
src/settings/ui.ts
src/types.ts
src/txt.d.ts
```

**Step 4: Push and open PR**

```bash
git push -u origin feat/restructure-src
gh pr create \
  --title "refactor: reorganize src/ into pipeline-stage directories" \
  --body "$(cat <<'EOF'
## Summary

- Groups 23 flat `src/` files into 6 pipeline-stage directories: `collect/`, `filter/`, `analyze/`, `summarize/`, `render/`, `plugin/`
- Splits `settings.ts` (1,330 lines) into `settings/types.ts` (~100 lines) and `settings/ui.ts` (~1,230 lines)
- Splits `collectors.ts` (692 lines) into one file per data source: `collect/browser.ts`, `claude.ts`, `codex.ts`, `git.ts`
- Reorganizes `tests/unit/` to mirror the new `src/` layout
- Zero logic changes — pure structural movement

## Test Plan
- [ ] `npm run build` passes (production mode)
- [ ] `npm run test:unit` passes
- [ ] `npm run test:integration` passes
- [ ] `find src -type f | sort` matches expected 27-file tree
EOF
)"
```

---

## Quick Reference: New Import Depth Rules

| File location | Import to `src/types.ts` | Import to `src/filter/sanitize.ts` |
|---------------|--------------------------|-------------------------------------|
| `src/plugin/main.ts` | `../types` | `../filter/sanitize` |
| `src/summarize/summarize.ts` | `../types` | `../filter/sanitize` |
| `src/filter/classify.ts` | `../types` | `./sanitize` |
| `tests/unit/render/renderer.test.ts` | `../../../src/types` | `../../../src/filter/sanitize` |
| `tests/unit/sanitize.test.ts` (flat) | `../../src/types` | `../../src/filter/sanitize` |
