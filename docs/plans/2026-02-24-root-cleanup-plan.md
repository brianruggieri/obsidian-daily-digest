# Root Directory Cleanup Plan

> **Status:** Completed. Implementation merged to main.

**Date:** 2026-02-24
**Goal:** Reduce top-level clutter — 40 items → ~25 — by moving loose scripts, test infrastructure, and documentation into their natural homes.

---

## Current Clutter Inventory

```
root/
  esbuild.config.mjs      ← build script (not a config that tools autodiscover)
  deploy.mjs              ← deploy script
  version-bump.mjs        ← release utility script
  tsconfig.scripts.json   ← TS config for scripts/ (extends root tsconfig)
  tsconfig.test.json      ← TS config for tests/ (extends root tsconfig)
  prompts/                ← USER DATA (personal prompt overrides, not source)
  screenshots/            ← WebdriverIO e2e test suite (full test infra)
  examples/               ← example output notes + screenshot guide
```

**Must stay at root** (Obsidian plugin requirements):
- `main.js`, `manifest.json`, `styles.css`, `versions.json`

**Should stay at root** (tooling convention):
- `package.json`, `tsconfig.json`, `eslint.config.mjs`, `vitest.config.ts`, `.nvmrc`
- `CLAUDE.md`, `README.md`, `LICENSE`

---

## Proposed Changes

### 1. Move loose release/deploy scripts → `scripts/`

`esbuild.config.mjs` stays at root (build config convention).

| From | To |
|------|----|
| `deploy.mjs` | `scripts/deploy.mjs` |
| `version-bump.mjs` | `scripts/version-bump.mjs` |

Update `package.json` references:
- `"deploy": "npm run build && node scripts/deploy.mjs"`
- `"deploy:dev": "node esbuild.config.mjs production && node scripts/deploy.mjs"`
- `"version": "node scripts/version-bump.mjs && git add manifest.json versions.json"`

**Impact:** Low risk. Pure path updates.

---

### 2. Consolidate tsconfig files → into their scope directories

| From | To | `extends` update |
|------|----|-----------------|
| `tsconfig.scripts.json` | `scripts/tsconfig.json` | `"extends": "../tsconfig.json"` |
| `tsconfig.test.json` | `tests/tsconfig.json` | `"extends": "../tsconfig.json"` |

Update `package.json` references:
- 6 `--tsconfig tsconfig.scripts.json` → `--tsconfig scripts/tsconfig.json`
- 1 `-p tsconfig.test.json` → `-p tests/tsconfig.json`

Update `vitest.config.ts` if it references `tsconfig.test.json` directly.

**Impact:** Straightforward. Co-locates each tsconfig with the code it covers.

---

### 3. Move `screenshots/` → `tests/screenshots/`

`screenshots/` is a full WebdriverIO e2e test suite:
```
screenshots/
  wdio.conf.ts     ← WebdriverIO config
  tsconfig.json    ← its own tsconfig (inline, not root-extending)
  setup.sh         ← test setup script
  specs/           ← test specs
  helpers/         ← test helpers
  baseline/        ← baseline images
  output/          ← screenshot output
  vault/           ← test vault
```

Move entire directory to `tests/screenshots/` so all test infrastructure lives under `tests/`.

Update `package.json`:
- `"screenshots:setup": "bash tests/screenshots/setup.sh"`
- `"screenshots": "npm run screenshots:setup && npx wdio run tests/screenshots/wdio.conf.ts"`

`.gitignore` already has `screenshots/vault/` — update to `tests/screenshots/vault/`.

**Impact:** Medium. Internal paths in `wdio.conf.ts` are relative so they're unaffected by the move; just the `package.json` entry points change.

---

### 4. Move `examples/` → `docs/examples/`

`examples/` contains documentation artifacts:
- `2025-06-18.md`, `2025-06-19.md`, `2025-06-20-no-ai.md` — sample daily notes for README/docs
- `SCREENSHOT-GUIDE.md` — guide for taking screenshots
- `screenshots/` — sample images used in documentation

Move to `docs/examples/`. Update any README links.

**Impact:** Low. No code references `examples/` — it's pure documentation content.

---

### 5. `prompts/` — no action

Keep tracked as-is. The files serve as useful reference/example prompt templates. The `promptsDir` setting is empty by default so they don't auto-load for anyone — they're reference material, not defaults. Gitignoring would require `git rm --cached prompts/` to untrack already-committed files, which isn't worth the disruption.

---

## Resulting Root (after all changes)

```
root/
  .claude/              (gitignored)
  .github/
  .git/
  .gitignore
  .nvmrc
  CLAUDE.md
  LICENSE
  README.md
  docs/
    examples/           ← moved from root
    pipeline-data-flow.md
    pipeline-diagrams.md
    plans/
  esbuild.config.mjs    (stays — build config convention)
  eslint.config.mjs
  main.js               (gitignored, Obsidian required at root)
  manifest.json         (Obsidian required)
  node_modules/         (gitignored)
  package.json
  package-lock.json
  prompts/              (stays — reference templates)
  scripts/
    deploy.mjs          ← moved from root
    version-bump.mjs    ← moved from root
    tsconfig.json       ← was tsconfig.scripts.json
    daily-matrix.ts
    inspect.ts
    ...
  src/                  (already organized)
  styles.css            (Obsidian required)
  tests/
    screenshots/        ← was screenshots/ at root
    tsconfig.json       ← was tsconfig.test.json
    unit/
    integration/
    eval/
    ...
  tsconfig.json
  versions.json         (Obsidian required)
  vitest.config.ts
```

Items removed from root: **deploy.mjs, version-bump.mjs, tsconfig.scripts.json, tsconfig.test.json, screenshots/, examples/** (6 items)

---

## Implementation Order

Each step is independently safe to commit:

1. **scripts/ consolidation** (esbuild.config, deploy, version-bump) — low risk, immediate value
2. **tsconfig consolidation** — low risk, tidy
3. **`screenshots/` → `tests/e2e/`** — medium, needs wdio path check
4. **`examples/` → `docs/examples/`** — low risk
5. **`prompts/` decision** — depends on answer to "defaults vs personal?"

---

## Decisions

1. **`prompts/`** — keep tracked as reference templates. No action.
2. **`esbuild.config.mjs`** — stays at root (build config convention).
3. **`screenshots/` → `tests/screenshots/`** — preferred name confirmed.
