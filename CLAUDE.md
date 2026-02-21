# CLAUDE.md

## Project Overview

Daily Digest is an Obsidian desktop plugin that compiles browser history, search queries, shell commands, and Claude Code sessions into AI-summarized daily notes. Privacy-first architecture with a 4-tier escalation chain controlling what data reaches cloud APIs.

- **Plugin ID:** `daily-digest`
- **Author:** Brian Ruggieri
- **License:** MIT
- **Desktop only** (reads local SQLite databases, shell history, and filesystem)

## Tech Stack

- TypeScript (strict mode) targeting ES6
- Obsidian Plugin API (1.12.2), minimum app version 1.11.0
- esbuild for bundling (CommonJS output)
- sql.js (WASM) for reading browser SQLite databases — no native binaries
- Vitest for testing, ESLint for linting
- Node >= 22, npm >= 10

## Project Structure

```
src/
  main.ts           - Plugin entry point, commands, vault integration
  types.ts          - All TypeScript interfaces and type definitions
  settings.ts       - Settings UI (largest file ~1,350 lines)
  collectors.ts     - Data collection from browsers, shell, Claude sessions
  sanitize.ts       - Secret scrubbing (API keys, tokens, credentials)
  sensitivity.ts    - 419-domain privacy filter with 11 categories
  categorize.ts     - Rule-based domain → category mapping
  browser-profiles.ts - Cross-platform browser profile detection
  classify.ts       - Optional local LLM event classification
  patterns.ts       - Statistical pattern extraction (no LLM calls)
  knowledge.ts      - Knowledge section generation from patterns
  privacy.ts        - Consent modals and onboarding flow
  summarize.ts      - AI prompt building and privacy tier routing
  ai-client.ts      - Anthropic + local model provider abstraction
  chunker.ts        - RAG chunking pipeline
  embeddings.ts     - Vector embeddings and similarity search
  renderer.ts       - Markdown note generation with frontmatter
  merge.ts          - Safe content merging and timestamped backups
tests/
  unit/             - Unit tests (sanitize, categorize, classify, patterns, etc.)
  integration/      - Full pipeline, privacy escalation, merge safety tests
  eval/             - LLM-as-judge evaluation tests (require API key or local model)
  fixtures/         - Test data generators, personas, scenarios
  mocks/obsidian.ts - Obsidian API mock
```

## Development Commands

```bash
npm run dev            # Watch mode with hot reload
npm run build          # Type-check + production build (minified)
npm run lint           # ESLint
npm run test           # All tests (unit + integration)
npm run test:unit      # Unit tests only
npm run test:integration  # Integration tests only
npm run test:eval      # AI eval tests (needs ANTHROPIC_API_KEY in .env)
npm run test:eval:local   # AI eval tests against local model
npm run test:coverage  # Coverage report (v8)
npm run deploy         # Build and copy to Obsidian vault
npm run deploy:dev     # Quick deploy without full rebuild
```

## Code Conventions

- One module per domain concern — no barrel exports, direct imports only
- Functional style preferred: pure functions, immutable data, named exports
- Interfaces: PascalCase with descriptive suffixes (`*Config`, `*Result`, `*Analysis`)
- Functions: camelCase, descriptive (`extractTemporalClusters`, `buildFocusSummary`)
- Constants: UPPER_SNAKE_CASE
- Flags: `enable*`, `is*`, `has*` conventions
- Unused parameters: prefix with `_`
- No `console.log` in plugin code — use Obsidian's `Notice` class or status bar
- Error handling: try/catch with graceful degradation, never crash the plugin
- Template strings for multi-line content generation

## Architecture: 9-Stage Processing Pipeline

1. **Collection** — Read from browser SQLite, shell history, Claude JSONL logs
2. **Sanitization** — Scrub secrets (15+ regex patterns for API keys, tokens, JWTs, etc.)
3. **Sensitivity Filtering** — Remove/redact visits to private domains (419 built-in + custom)
4. **Categorization** — Rule-based domain grouping (10 categories)
5. **Classification** — Optional local LLM structuring (activity types, intents, topics)
6. **Pattern Extraction** — Statistical analysis: temporal clusters, co-occurrence, focus score
7. **Summarization** — AI generation via local or cloud provider with privacy tier routing
8. **Rendering** — Markdown generation with frontmatter, Dataview fields, structured sections
9. **Merge** — Safe regeneration preserving user-authored content with backups

## Privacy Architecture (Critical)

This plugin handles sensitive personal data. Always maintain these invariants:

- **All data sources are opt-in** (disabled by default)
- **Sanitization runs before any processing** — never pass raw collected data to AI
- **4-tier privacy escalation chain** for Anthropic API calls:
  - Tier 1: Standard with full sanitized context
  - Tier 2: RAG-selected chunks only
  - Tier 3: Classified abstractions (no raw URLs)
  - Tier 4: Aggregated statistics only
- **Never store API keys in plugin settings** — use Obsidian's SecretStorage API (`SECRET_ID`)
- **Never add telemetry or analytics**
- Sensitivity filter actions: "exclude" (remove entirely) or "redact" (replace with category label)

## Testing

- Vitest with globals enabled, Obsidian API mocked via path alias in `vitest.config.ts`
- Unit tests cover all processing modules (sanitize, categorize, classify, patterns, merge, renderer, knowledge, browser-profiles, summarize, secret-storage)
- Integration tests verify full pipeline with 6 realistic personas, privacy escalation chain, merge safety, and topic recurrence
- Eval tests use LLM-as-judge (summary quality, privacy audit, prompt injection resistance, knowledge value)
- Test fixtures use faker-style generators in `tests/fixtures/`
- Eval tests gated behind `DAILY_DIGEST_AI_EVAL=true` env var

## Important Gotchas

- `settings.ts` is the largest file (~1,350 lines) — changes here need care
- Browser history is read from **locked SQLite databases** via sql.js WASM — the plugin copies the DB file before reading to avoid lock conflicts
- The `styles.css` uses Obsidian CSS custom properties for theme compatibility
- `main.js` is **gitignored** — it is built locally for development (`npm run build`) and attached to GitHub Releases by the release workflow. Do not edit or commit it directly
- Obsidian's `requestUrl` is used for cloud API calls; native `fetch` is used for localhost (CORS bypass)
- The merge system (`merge.ts`) must preserve user-authored content across regenerations — always create timestamped backups before modifying existing notes
- Privacy consent is version-controlled (`CURRENT_PRIVACY_VERSION`) — bumping it re-triggers the onboarding modal
- Cross-platform paths: use `process.platform` checks for `darwin`, `win32`, `linux`

## Git Conventions

- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`
- Keep commits focused on a single concern
- Run `npm run test` and `npm run build` before committing
- Never commit `.env` or API keys
- `main.js` is delivered via GitHub Releases (not committed) — the release workflow builds, tests, and uploads it as a release asset

## Branching Conventions

- **One feature per branch**, branched from `main` at the start of work
- Branch naming: `feat/<short-name>`, `fix/<short-name>`, `chore/<short-name>`
- Use the `superpowers:using-git-worktrees` skill at the start of every new feature session to create an isolated worktree
- PRs merged to `main` only when the feature is complete and all tests pass
- Never let two unrelated features accumulate on the same branch
