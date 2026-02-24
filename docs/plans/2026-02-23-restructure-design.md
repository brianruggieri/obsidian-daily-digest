# Repo Restructure Design

**Date:** 2026-02-23
**Updated:** 2026-02-24 (post-shell-removal sync)
**Status:** Approved

## Problem

All 23 source files live flat in `src/`. There is no directory structure that reflects the 9-stage processing pipeline. Key pain points:

- Finding a file requires knowing the codebase — the tree tells no story
- `settings.ts` (1,330 lines) mixes settings interfaces/defaults with a 1,200-line Obsidian settings UI class
- `collectors.ts` (692 lines) bundles 4 completely independent data source collectors (browser, Claude, Codex, git)

## Goals

- **Discoverability first:** the directory tree should read like the pipeline — open a folder, see what it does
- **Reasonable file sizes:** split the two monster files where size is genuinely harmful
- **Zero logic changes:** pure structural movement, no behavior changes

## New Directory Structure

```
src/
  collect/
    browser-profiles.ts     moved as-is
    browser.ts              split from collectors.ts
    claude.ts               split from collectors.ts
    codex.ts                split from collectors.ts
    git.ts                  split from collectors.ts
  filter/
    sanitize.ts             moved as-is
    sensitivity.ts          moved as-is
    categorize.ts           moved as-is
    classify.ts             moved as-is
  analyze/
    patterns.ts             moved as-is
    knowledge.ts            moved as-is
  summarize/
    ai-client.ts            moved as-is
    compress.ts             moved as-is
    chunker.ts              moved as-is
    embeddings.ts           moved as-is
    prompt-templates.ts     moved as-is
    summarize.ts            moved as-is
  render/
    renderer.ts             moved as-is
    merge.ts                moved as-is
  plugin/
    main.ts                 moved as-is
    privacy.ts              moved as-is
    pipeline-debug.ts       moved as-is
    log.ts                  moved as-is
  settings/
    types.ts                split from settings.ts: DailyDigestSettings, DEFAULT_SETTINGS, AIProvider, SECRET_ID
    ui.ts                   split from settings.ts: DailyDigestSettingTab class
  types.ts                  stays at root — shared cross-cutting types
  txt.d.ts                  stays at root
```

## Stage-to-Directory Mapping

| Pipeline stage       | Directory      | Files                                                        |
|----------------------|----------------|--------------------------------------------------------------|
| 1. Collection        | `collect/`     | browser.ts, claude.ts, codex.ts, git.ts, browser-profiles.ts |
| 2–4. Filter/sanitize | `filter/`      | sanitize.ts, sensitivity.ts, categorize.ts                   |
| 5. Classification    | `filter/`      | classify.ts (optional enrichment, pre-analysis)              |
| 6. Pattern analysis  | `analyze/`     | patterns.ts, knowledge.ts                                    |
| 7. Summarization     | `summarize/`   | ai-client.ts, compress.ts, chunker.ts, embeddings.ts, prompt-templates.ts, summarize.ts |
| 8–9. Output          | `render/`      | renderer.ts, merge.ts                                        |
| Plugin shell         | `plugin/`      | main.ts, privacy.ts, pipeline-debug.ts, log.ts               |
| Settings             | `settings/`    | types.ts, ui.ts                                              |

## File Splits

### `collectors.ts` → 4 files in `collect/`

| New file             | Contents from `collectors.ts`                          |
|----------------------|--------------------------------------------------------|
| `collect/browser.ts` | `collectBrowserHistory()`, `unwrapGoogleRedirect()`, SQLite/profile helpers |
| `collect/claude.ts`  | `readClaudeSessions()`                                 |
| `collect/codex.ts`   | `readCodexSessions()`                                  |
| `collect/git.ts`     | `readGitHistory()`, `parseGitLogOutput()`              |

No logic changes. Each file is a direct extraction. (`readShellHistory` was removed from the codebase prior to this refactor — there is no shell collector to split out.)

### `settings.ts` → 2 files in `settings/`

| New file             | Contents from `settings.ts`                            |
|----------------------|--------------------------------------------------------|
| `settings/types.ts`  | `SECRET_ID`, `AIProvider`, `DailyDigestSettings`, `DEFAULT_SETTINGS` (~100 lines) |
| `settings/ui.ts`     | `DailyDigestSettingTab` class (~1,230 lines)           |

## Import Strategy

- No barrel/index.ts files — direct imports only (per project convention)
- `main.ts` gains 4 import lines (one per collector) instead of one combined line — verbose but explicit
- All files that import from `./settings` update to `./settings/types` or `./settings/ui` as appropriate

## Test File Structure

Tests mirror `src/` layout:

```
tests/unit/
  collect/
    browser.test.ts         split from collectors.test.ts (tests unwrapGoogleRedirect)
    claude.test.ts          (no existing test — create stub if desired, or skip)
    codex.test.ts           was codex-collector.test.ts
    git.test.ts             was git-collector.test.ts
    browser-profiles.test.ts  moved
  filter/
    sanitize.test.ts
    sensitivity.test.ts
    categorize.test.ts
    classify.test.ts
  analyze/
    patterns.test.ts
    knowledge.test.ts
  summarize/
    ai-client.test.ts       was mock-ai.test.ts
    compress.test.ts
    prompt-templates.test.ts
    summarize.test.ts
  render/
    renderer.test.ts
    merge.test.ts
  settings/
    settings-git-ui.test.ts
    presets.test.ts
  assertions.test.ts        stays flat — cross-cutting
  collector-shim.test.ts    stays flat — scripts/ helper
  secret-storage.test.ts    stays flat — Obsidian API concern
  prompt-logger.test.ts     stays flat — scripts/ helper
```

Integration and eval tests are unaffected structurally; only import paths update.

## Scope of Changes

| Category                     | Action                                      | Estimated files |
|------------------------------|---------------------------------------------|-----------------|
| `collectors.ts`              | Split into 4 new files in `collect/`        | ~7              |
| `settings.ts`                | Split into `settings/types.ts` + `settings/ui.ts` | ~12       |
| All other `src/*.ts`         | Move to subdirectory, update import paths   | ~15             |
| `tests/unit/*.test.ts`       | Move/rename to mirror new src structure     | ~19             |
| `scripts/`                   | Import path updates only                    | ~5              |

**Total: ~58 files touched. Zero logic changes.**

## Non-Goals

- Moving types out of `types.ts` into their domain modules (separate refactor)
- Any logic, API, or behavior changes
- Changing the build system itself (esbuild stays; the entry point path does change from `src/main.ts` to `src/plugin/main.ts` as part of the plugin/ move in Task 7)
