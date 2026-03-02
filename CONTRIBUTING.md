# Contributing to Daily Digest

Thanks for your interest in contributing. This document covers everything you need to get a working dev environment, run the tests, understand the codebase, and submit a pull request.

## Table of contents

- [Getting help](#getting-help)
- [Reporting bugs](#reporting-bugs)
- [Requesting features](#requesting-features)
- [Development setup](#development-setup)
- [Project structure](#project-structure)
- [Scripts reference](#scripts-reference)
- [Testing](#testing)
- [Screenshot automation](#screenshot-automation)
- [Matrix validation](#matrix-validation)
- [Submitting a pull request](#submitting-a-pull-request)
- [AI-assisted contributions](#ai-assisted-contributions)
- [Commit conventions](#commit-conventions)

---

## Getting help

Open a [GitHub Discussion](https://github.com/brianruggieri/obsidian-daily-digest/discussions) or [file an issue](https://github.com/brianruggieri/obsidian-daily-digest/issues) if you're stuck. For quick questions, check the [FAQ in the README](README.md#faq) first.

---

## Reporting bugs

Before filing a bug, search [existing issues](https://github.com/brianruggieri/obsidian-daily-digest/issues) — it may already be tracked.

A useful bug report includes:
- Obsidian version and OS
- Plugin version (visible in Settings > Community plugins)
- What you did, what you expected, and what actually happened
- Any error messages from the developer console (Ctrl/Cmd+Shift+I → Console tab)

Security issues — especially anything that could expose personal data — should be reported privately via [GitHub's security advisory](https://github.com/brianruggieri/obsidian-daily-digest/security/advisories/new) rather than a public issue.

---

## Requesting features

Open an issue with the `enhancement` label. For larger changes (new data sources, architecture changes, new privacy implications), open an issue first to discuss the approach before writing code. This saves everyone time if the direction isn't quite right.

---

## Development setup

### Prerequisites

- Node.js 22+ (the repo includes `.nvmrc` — run `nvm use` to switch automatically)
- npm 10+
- An Obsidian vault for manual testing

### Setup

```bash
git clone https://github.com/brianruggieri/obsidian-daily-digest.git
cd obsidian-daily-digest
npm install
```

### Deploy to your vault

Set the `OBSIDIAN_PLUGIN_DIR` environment variable to your vault's plugin directory, then:

```bash
npm run deploy       # Full build + copy
npm run deploy:dev   # Quick copy without rebuilding (useful during iteration)
```

For watch mode with hot reload:

```bash
npm run dev
```

### Environment file

Copy `.env.example` to `.env` for AI eval tests:

```bash
cp .env.example .env
# Edit .env with your API key or local model settings
```

---

## Project structure

```
src/
  types.ts              Shared TypeScript interfaces and constants
  plugin/
    main.ts             Plugin entry point, commands, vault integration
    privacy.ts          Consent modals and onboarding flow
    log.ts              Logging utilities
    pipeline-debug.ts   Debug pipeline inspector modal
  settings/
    types.ts            Settings interface, defaults, constants
    ui.ts               Settings tab UI (~1,100 lines)
  collect/
    browser.ts          Browser history via sql.js (WASM SQLite)
    browser-profiles.ts Multi-browser, multi-profile detection
    claude.ts           Claude Code session reading
    codex.ts            Codex CLI session reading
    git.ts              Git commit history collection
  filter/
    sanitize.ts         Defense-in-depth secret scrubbing (20 patterns)
    sensitivity.ts      419-domain sensitivity filter, 11 categories
    categorize.ts       Rule-based domain → category mapping
    classify.ts         Optional local LLM event classification
  analyze/
    patterns.ts         Statistical pattern extraction (no LLM calls)
    knowledge.ts        Knowledge section generation from patterns
  summarize/
    summarize.ts        AI prompt building and privacy tier routing
    prompt-templates.ts Prompt template loading (.txt files)
    prose-parser.ts     Prose output parsing utilities
    ai-client.ts        Anthropic + local model provider abstraction
    compress.ts         Token-budget-aware activity compression
    chunker.ts          Token estimation utility
  render/
    renderer.ts         Markdown note generation with frontmatter
    merge.ts            Safe content merging with timestamped backups
tests/
  unit/                 Unit tests mirroring src/ layout
  integration/          Full pipeline, privacy escalation, merge safety tests
  eval/                 LLM-as-judge evaluation tests (require API key or local model)
  fixtures/             Test data generators and persona definitions
  mocks/obsidian.ts     Obsidian API mock
scripts/
  daily-matrix.ts       Dev script: full pipeline run outside Obsidian
  inspector.ts          Dev script: step-by-step pipeline inspector
  presets.ts            Shared settings presets for scripts
  etl/                  Build-time domain list processing tools
```

**Key invariants to maintain:**
- `scripts/daily-matrix.ts` must mirror `src/plugin/main.ts` stage-for-stage. Update both when changing the pipeline.
- `src/settings-registry.ts` must stay in sync with `DailyDigestSettings` in `src/settings/types.ts`. A check script enforces this: `scripts/check-settings-registry.ts`.
- Sanitization always runs before any data touches AI or the vault.

---

## Scripts reference

```bash
npm run dev              # Watch mode with hot reload
npm run build            # Type-check + production build (minified)
npm run lint             # ESLint
npm test                 # All tests (unit + integration)
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests only
npm run test:eval        # AI evaluation tests (requires .env)
npm run test:eval:local  # AI eval tests against local model
npm run test:coverage    # Coverage report (v8)
npm run deploy           # Build and copy to Obsidian vault
npm run deploy:dev       # Quick deploy without full rebuild
npm run screenshots      # Capture all screenshot scenarios
npm run build:analyze    # Bundle composition report (esbuild metafile)
```

The production bundle must stay under **600 KB** — the build will fail with a clear error if it exceeds this. Run `npm run build:analyze` to see what's contributing to bundle size.

---

## Testing

### Test types

| Suite | Command | What it covers |
|-------|---------|---------------|
| Unit | `npm run test:unit` | Individual modules: sanitize, categorize, classify, patterns, knowledge, renderer, merge, browser profiles, secret storage, prompt templates, presets |
| Integration | `npm run test:integration` | Full pipeline with 6 realistic personas, privacy escalation chain, merge safety, multi-day topic recurrence |
| AI eval | `npm run test:eval` | LLM-as-judge: summary quality, privacy leak detection, prompt injection resistance, knowledge value |

### Running AI eval tests

Eval tests are gated behind `DAILY_DIGEST_AI_EVAL=true` and require a configured provider in `.env`. They use real API calls (or a local model) and cost a small amount to run.

```bash
cp .env.example .env
# Configure ANTHROPIC_API_KEY or LOCAL_MODEL_ENDPOINT
npm run test:eval
```

### Writing tests

- Tests live in `tests/` mirroring the `src/` layout (e.g., `src/filter/sanitize.ts` → `tests/unit/filter/sanitize.test.ts`)
- Use realistic data from `tests/fixtures/` — avoid toy inputs that don't surface real edge cases
- Privacy-sensitive behaviour (sanitization, tier routing, sensitivity filtering) needs explicit test coverage

---

## Screenshot automation

The screenshot suite uses [wdio-obsidian-service](https://github.com/obsidianmd/wdio-obsidian-service) to launch a sandboxed Obsidian instance, install the plugin, and capture UI screenshots used in the README.

```bash
npm run build        # Build main.js first
npm run screenshots  # Launch Obsidian sandbox + capture scenarios
```

Screenshots are saved to `tests/screenshots/output/`. Committed baselines live in `tests/screenshots/baseline/`. CI runs this on every push to `main` and uploads diffs as artifacts on failure — so the baseline images stay fresh.

---

## Matrix validation

Before releasing, the matrix validator measures real-world cost, quality, and privacy trade-offs across all 4 privacy tiers and multiple personas. It's also useful when evaluating whether a new model or provider is worth adopting.

```bash
npm run matrix:validate:phase1   # Tier 4 only, free, ~2 minutes
npm run matrix:validate          # All 4 tiers, ~10 minutes, ~$0.04
npm run matrix:cost-analysis     # Monthly/annual cost projections
npm run matrix:ci-gate           # Pass/fail gate used in CI
```

Reports are written to `docs/matrix-validation/results/` in JSON, Markdown, and HTML. See [`docs/matrix-validation/README.md`](docs/matrix-validation/README.md) for details on interpreting results.

---

## Submitting a pull request

1. **Open an issue first** for anything beyond a small bugfix — it's worth aligning on approach before writing code
2. Fork the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/my-feature
   ```
3. Make your changes with tests. The rule: if it touches behaviour, it needs a test
4. Run the full pre-commit suite before pushing:
   ```bash
   npm run lint && npm run build && npm test
   ```
5. Open a pull request against `main`. Include a summary of what changed and why, and a brief test plan

**Privacy changes** (new data sources, new sanitization paths, tier routing changes) need particular care. The integration test suite in `tests/integration/privacy-prompt-audit.test.ts` runs adversary personas designed to catch leaks — make sure they still pass.

---

## AI-assisted contributions

AI-assisted contributions are welcome. If you used AI tools (Copilot, Claude, Codex, etc.), mention it in your PR description with a brief note on scope — e.g., "Claude helped draft the regex" or "Copilot generated initial test scaffolding." No need to disclose trivial autocomplete.

What matters is that you understand the code you're submitting and can explain your changes during review.

---

## Commit conventions

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add unified timeline section
fix: preserve custom sections during regeneration
refactor: simplify privacy tier resolution
test: add adversary persona for API key injection
docs: update settings reference for PR #89
chore: bump esbuild to 0.25
```

Keep commits focused on a single concern. Avoid mixing refactoring with behaviour changes in the same commit — it makes review and bisecting harder.
