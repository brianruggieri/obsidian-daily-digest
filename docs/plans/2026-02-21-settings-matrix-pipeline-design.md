# Settings-Matrix Daily Note Generation Pipeline

**Date:** 2026-02-21
**Branch:** feat/full-day-collection
**Status:** Approved — ready for implementation planning

---

## Problem

The plugin supports dozens of configuration combinations (data sources, AI providers, privacy tiers, collection modes, pattern extraction, RAG, classification). There is no way today to verify that all settings produce correct, readable output — or to catch regressions when pipeline code changes. Reviews happen manually and infrequently.

## Goal

A scriptable pipeline that runs every combination of curated settings presets once per day, writes one Markdown note per preset to a local test vault, and makes it trivial to review plugin output at every level of data and AI abstraction. Automated structural and quality assertions scaffold in from the start, with LLM-as-judge as an opt-in layer.

---

## Architecture

### Directory Layout

```
scripts/
  presets.ts              ← Named preset config objects
  daily-matrix.ts         ← CLI entry point (env-var driven)
  install-launchd.sh      ← Installs/removes macOS automation
  lib/
    collector-shim.ts     ← Wraps real collectors for script context
    mock-ai.ts            ← Canned Anthropic responses for mock mode
    prompt-logger.ts      ← Accumulates prompt log through pipeline stages
    assertions.ts         ← Structural + quality assertion definitions
    assertion-runner.ts   ← Runs assertions, writes matrix-report.json
~/Library/LaunchAgents/
  com.brianruggieri.daily-matrix.plist  ← Installed by install-launchd.sh
~/obsidian-vaults/
  daily-digest-test/
    .obsidian/            ← Minimal vault config (created on first run)
    2026-02-21/
      no-ai-minimal.md
      local-llm-full.md
      cloud-haiku-tier1.md
      ...                 ← One file per preset
      matrix-report.json  ← Written when MATRIX_ASSERT=true
```

### Data Flow (per preset)

```
[Preset Config] + [Input Data (real | fixtures)]
        │
        ▼
  Sanitize  ──────────────────────────────────┐
        │                                     │
        ▼                                 PromptLog
  Sensitivity Filter                          │
        │                                     │
        ▼                                     │
  Categorize                                  │
        │                                     │
        ▼                                     │
  Classify? ──── prompt appended to log ──────┤
        │                                     │
        ▼                                     │
  Extract Patterns?                           │
        │                                     │
        ▼                                     │
  Summarize? ─── prompt appended to log ──────┤
        │                                     │
        ▼                                     │
  Render Markdown ◄────────── PromptLog injected as <details> blocks
        │
        ▼
  Write to vault/YYYY-MM-DD/<preset>.md
        │
        ▼
  Assert? → Write vault/YYYY-MM-DD/matrix-report.json
```

---

## Presets (the matrix)

12 curated named configs covering every major dimension. Each is a full `DailyDigestSettings`-compatible object with a short `id` and human-readable `description`.

| id | Sources | AI | Collection | Privacy |
|---|---|---|---|---|
| `no-ai-minimal` | browser only | none | limited | standard |
| `no-ai-full` | all 4 | none | complete | standard |
| `local-llm-basic` | all 4 | local | complete | standard |
| `local-llm-rag` | all 4 | local + RAG | complete | standard |
| `local-llm-classified` | all 4 | local + classify | complete | standard |
| `cloud-haiku-tier1` | all 4 | Haiku | complete | Tier 1 (full context) |
| `cloud-haiku-tier2` | all 4 | Haiku | complete | Tier 2 (RAG chunks only) |
| `cloud-sonnet-tier1` | all 4 | Sonnet | complete | Tier 1 |
| `cloud-sonnet-tier3` | all 4 | Sonnet | complete | Tier 3 (abstractions) |
| `cloud-tier4-stats` | all 4 | Haiku | complete | Tier 4 (stats only) |
| `privacy-aggressive` | all 4 | Sonnet | complete | aggressive sanitization |
| `compression-limited` | all 4 | Haiku | limited | standard |

---

## CLI Interface

### Environment Variables

| Variable | Values | Default | Purpose |
|---|---|---|---|
| `AI_MODE` | `real` \| `mock` | `mock` | Use real APIs or canned responses |
| `DATA_MODE` | `real` \| `fixtures` | `fixtures` | Live collection or test personas |
| `PRESET` | `all` \| `<id>` | `all` | Run all presets or one by name |
| `DATE` | `YYYY-MM-DD` | today | Date label for vault subfolder |
| `MATRIX_ASSERT` | `true` \| `false` | `false` | Run structural + quality checks |
| `MATRIX_JUDGE` | `true` \| `false` | `false` | Run LLM-as-judge assertions |

### npm Scripts

```json
"matrix":        "ts-node scripts/daily-matrix.ts",
"matrix:real":   "AI_MODE=real DATA_MODE=real ts-node scripts/daily-matrix.ts",
"matrix:one":    "ts-node scripts/daily-matrix.ts"
```

Usage examples:

```bash
npm run matrix                              # fixtures + mock AI, all presets
npm run matrix:real                         # live data + real APIs
PRESET=cloud-haiku-tier1 npm run matrix     # single preset, mock
PRESET=cloud-haiku-tier1 npm run matrix:real  # single preset, real API
MATRIX_ASSERT=true npm run matrix           # run assertions after generation
```

---

## Prompt Visibility

Every pipeline stage that sends a prompt to an AI or local model appends to a `PromptLog` object passed through the pipeline. The renderer injects each entry as a collapsed `<details>` block immediately after the relevant section.

### Format in the generated Markdown

```markdown
## AI Summary

Your day centered on OAuth PKCE implementation and code review sessions...

<details>
<summary>Prompt sent to claude-haiku-4-5 · 1,842 tokens · Tier 1</summary>

```
You are a productivity assistant summarizing a developer's day.
Return valid JSON matching the AISummary schema.

## Browser Activity (sanitized)
- github.com — 14 visits
- docs.anthropic.com — 8 visits
...
```

</details>
```

### PromptLog schema

```typescript
interface PromptLogEntry {
  stage: "classify" | "embed" | "summarize";
  model: string;
  tokenCount: number;
  privacyTier?: 1 | 2 | 3 | 4;
  prompt: string;
}

type PromptLog = PromptLogEntry[];
```

### Stages that emit prompt log entries

- **classify** — classification prompt + batch configuration
- **embed** — RAG embedding query (if RAG enabled)
- **summarize** — full prompt post-sanitization, post-RAG selection

The `<details>` blocks are collapsed by default in Obsidian reading view. Token counts and model name appear in the summary line so you can scan cost at a glance without expanding.

---

## Assertion Scaffold

Assertions are tiered by cost and enabled via env vars. All three tiers are scaffolded on day one; only Structural runs automatically.

### Tier 1: Structural (always runs when `MATRIX_ASSERT=true`, no AI cost)

- Frontmatter parses as valid YAML
- Required frontmatter fields present: `date`, `tags`, `focus_score`
- Required sections present: title + at least one content section
- No section is empty (minimum 10 characters of content)
- File size > 500 bytes
- No placeholder strings (`[object Object]`, `undefined`, `NaN`)

### Tier 2: Quality (heuristic, no AI cost)

- Headline non-empty when `aiProvider !== "none"`
- Focus score is a float in `[0, 1]`
- Themes list non-empty when AI is enabled
- Privacy: run sanitizer over rendered output — no secrets survive into the note
- `<details>` blocks present when AI enabled (prompt log was captured)

### Tier 3: LLM-as-Judge (`MATRIX_JUDGE=true`, costs tokens)

- Hooks into the existing `tests/eval/` framework
- Reuses summary quality and privacy audit evals already defined there
- Each generated note is passed through the judge
- Results merged into `matrix-report.json`

### Report Format

Written to `vault/YYYY-MM-DD/matrix-report.json`:

```json
{
  "date": "2026-02-21",
  "aiMode": "mock",
  "dataMode": "fixtures",
  "results": [
    {
      "preset": "cloud-haiku-tier1",
      "passed": true,
      "durationMs": 1240,
      "checks": {
        "structural": { "passed": true, "failures": [] },
        "quality": { "passed": true, "focusScore": 0.74, "failures": [] },
        "llmJudge": null
      }
    }
  ]
}
```

---

## macOS Automation

A `launchd` plist runs `npm run matrix` daily at a configurable hour (default 07:00). The script `scripts/install-launchd.sh` installs or removes it without manually editing XML.

```bash
# Install (runs daily at 7am)
bash scripts/install-launchd.sh install

# Install at a custom hour
MATRIX_HOUR=22 bash scripts/install-launchd.sh install

# Remove
bash scripts/install-launchd.sh uninstall
```

Log output: `~/Library/Logs/daily-matrix.log`

The plist sources nvm before running so the correct Node version is used.

---

## Test Vault Setup

The test vault at `~/obsidian-vaults/daily-digest-test/` is created on first run with a minimal `.obsidian/` config: no community plugins required, core plugins only (Daily Notes off — we manage files ourselves). The vault is never committed to the repo.

---

## Phase 2: Realistic Persona Enhancement

The current 6 test personas in `tests/fixtures/personas.ts` use static data arrays. Phase 2 replaces them with `@faker-js/faker`-seeded generators that produce human-feeling activity distributions:

- **Browser**: URL pools weighted by category (dev-heavy for engineer, academic for researcher), timestamps clustered into realistic work sessions with gaps
- **Shell**: developer command sequences (git flow, npm lifecycle, docker ops) in plausible temporal order
- **Git**: conventional commit messages with realistic branch names and file paths
- **Claude prompts**: curated prompt pattern pools per persona type, drawn from LMSYS Chat-1M distribution patterns

Reference datasets for calibrating distributions:
- Browser: [Synthetic Browsing Histories (Nature, 2025)](https://www.nature.com/articles/s41597-025-04407-z) — 500 validated 1-month histories
- Shell: [Cybersecurity Training Shell Commands Dataset](https://www.sciencedirect.com/science/article/pii/S2352340921006806) — 13,446 annotated bash/zsh commands
- Claude prompts: [LMSYS Chat-1M](https://huggingface.co/datasets/lmsys/lmsys-chat-1m)

Phase 2 is tracked separately and does not block Phase 1 delivery.

---

## Out of Scope

- Diffing note output across days (future: `scripts/diff-matrix.ts`)
- Obsidian plugin integration for in-vault report UI
- Windows/Linux automation (launchd is macOS-only; cron instructions can be added later)
- Automatic PR comments or Slack notifications on assertion failure
