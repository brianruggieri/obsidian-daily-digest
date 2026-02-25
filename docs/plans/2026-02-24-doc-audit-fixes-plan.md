# Documentation Audit Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all findings from the documentation audit — one code bug and 12 documentation mismatches.

**Architecture:** 7 independent tasks, each touching a single file (or tight cluster). All are parallelizable. Task 1 is the only code change (merge.ts bug); Tasks 2-7 are documentation-only edits.

**Tech Stack:** TypeScript, Vitest, Markdown

---

### Task 1: Fix merge.ts — Add "Git Activity" to GENERATED_HEADINGS

**Severity:** BLOCKER — Without this, regenerating a note corrupts user content placed after the Git Activity section.

**Files:**
- Modify: `src/render/merge.ts:17-26`
- Modify: `tests/unit/render/merge.test.ts`
- Modify: `docs/pipeline-diagrams.md:247-250`

**Step 1: Write the failing test**

In `tests/unit/render/merge.test.ts`, add a test that proves Git Activity is treated as a generated heading. Find the existing test section that tests `extractUserContent` and add:

```typescript
it("treats Git Activity as a generated heading (not user content)", () => {
	const note = [
		"## 📦 Git Activity",
		"### my-repo (3 commits)",
		"- `abc1234` fix auth bug (+10/-2) — 14:30",
		"",
		"## 📝 Notes",
		"> _Add your reflections here_",
	].join("\n");

	const result = extractUserContent(note);
	expect(result.customSections).toHaveLength(0);
});
```

**Step 2: Run test to verify it fails**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/unit/render/merge.test.ts --reporter verbose 2>&1 | tail -20`
Expected: FAIL — Git Activity is not in GENERATED_HEADINGS, so it's treated as user content.

**Step 3: Add "Git Activity" to GENERATED_HEADINGS**

In `src/render/merge.ts:17-26`, add `"Git Activity"` to the set:

```typescript
const GENERATED_HEADINGS = new Set([
	"Notable",
	"Cognitive Patterns",
	"Knowledge Insights",
	"Searches",
	"Claude Code / AI Work",
	"Browser Activity",
	"Git Activity",
	"Reflection",
	"Notes",
]);
```

**Step 4: Run test to verify it passes**

Run: `source ~/.nvm/nvm.sh && nvm use && npx vitest run tests/unit/render/merge.test.ts --reporter verbose 2>&1 | tail -20`
Expected: PASS

**Step 5: Run full test suite**

Run: `source ~/.nvm/nvm.sh && nvm use && npm test 2>&1 | tail -20`
Expected: All tests pass.

**Step 6: Update pipeline-diagrams.md**

In `docs/pipeline-diagrams.md:247-250`, update the generated headings list:

Replace:
```
Generated headings (never treated as user content):
  Notable, Cognitive Patterns, Knowledge Insights,
  Searches, Claude Code / AI Work, Browser Activity,
  Reflection, Notes
```

With:
```
Generated headings (never treated as user content):
  Notable, Cognitive Patterns, Knowledge Insights,
  Searches, Claude Code / AI Work, Browser Activity,
  Git Activity, Reflection, Notes
```

---

### Task 2: Rewrite CLAUDE.md Project Structure + Stage Count

**Severity:** BLOCKER (structure) + MAJOR (stage count)

**Files:**
- Modify: `CLAUDE.md:23-51` (Project Structure)
- Modify: `CLAUDE.md:82-92` (Architecture section)

**Step 1: Replace Project Structure section (lines 23-51)**

Replace the flat file listing with the actual subdirectory layout:

```markdown
## Project Structure

` ` `
src/
  types.ts              All TypeScript interfaces and type definitions
  plugin/
    main.ts             Plugin entry point, commands, vault integration
    privacy.ts          Consent modals and onboarding flow
    log.ts              Logging utilities
    pipeline-debug.ts   Debug output helpers
  settings/
    types.ts            Settings interface, defaults, constants
    ui.ts               Settings tab UI (~1,000 lines)
  collect/
    browser.ts          Browser history collection via sql.js
    browser-profiles.ts Cross-platform browser profile detection
    claude.ts           Claude Code session reading
    codex.ts            Codex CLI session reading
    git.ts              Git commit history collection
  filter/
    sanitize.ts         Secret scrubbing (15+ regex patterns)
    sensitivity.ts      419-domain privacy filter with 11 categories
    categorize.ts       Rule-based domain → category mapping
    classify.ts         Optional local LLM event classification
  analyze/
    patterns.ts         Statistical pattern extraction (no LLM calls)
    knowledge.ts        Knowledge section generation from patterns
  summarize/
    summarize.ts        AI prompt building and privacy tier routing
    prompt-templates.ts Prompt templates loaded from .txt files
    ai-client.ts        Anthropic + local model provider abstraction
    compress.ts         Token-budget-aware activity compression
    chunker.ts          RAG chunking pipeline
    embeddings.ts       Vector embeddings and similarity search
  render/
    renderer.ts         Markdown note generation with frontmatter
    merge.ts            Safe content merging and timestamped backups
tests/
  unit/                 Unit tests mirroring src/ layout
  integration/          Full pipeline, privacy escalation, merge safety tests
  eval/                 LLM-as-judge evaluation tests (require API key or local model)
  fixtures/             Test data generators, personas, scenarios
  mocks/obsidian.ts     Obsidian API mock
` ` `
```

(Remove backtick spaces above — formatting workaround for nested code blocks.)

**Step 2: Update Architecture section (lines 82-92)**

Replace:
```markdown
## Architecture: 9-Stage Processing Pipeline

1. **Collection** — Read from browser SQLite, Claude JSONL logs, Codex CLI JSONL logs
2. **Sanitization** — Scrub secrets (15+ regex patterns for API keys, tokens, JWTs, etc.)
3. **Sensitivity Filtering** — Remove/redact visits to private domains (419 built-in + custom)
4. **Categorization** — Rule-based domain grouping (10 categories)
5. **Classification** — Optional local LLM structuring (activity types, intents, topics)
6. **Pattern Extraction** — Statistical analysis: temporal clusters, co-occurrence, focus score
7. **Summarization** — AI generation via local or cloud provider with privacy tier routing
8. **Rendering** — Markdown generation with frontmatter, Dataview fields, structured sections
9. **Merge** — Safe regeneration preserving user-authored content with backups
```

With:
```markdown
## Architecture: 10-Stage Processing Pipeline

1. **Collection** — Read from browser SQLite, Claude JSONL, Codex CLI JSONL, git log
2. **Sanitization** — Scrub secrets (15+ regex patterns for API keys, tokens, JWTs, etc.)
3. **Sensitivity Filtering** — Remove/redact visits to private domains (419 built-in + custom)
4. **Categorization** — Rule-based domain grouping (10 categories)
5. **Classification** — Optional local LLM structuring (activity types, intents, topics)
6. **Pattern Extraction** — Statistical analysis: temporal clusters, co-occurrence, focus score
7. **Knowledge** — Convert patterns into human-readable text sections
8. **Summarization** — AI prompt building and privacy tier routing, then LLM call
9. **Rendering** — Markdown generation with frontmatter, Dataview fields, structured sections
10. **Merge** — Safe regeneration preserving user-authored content with backups
```

---

### Task 3: Update README Data Sources, Project Structure, and Roadmap

**Severity:** MAJOR

**Files:**
- Modify: `README.md:3` (opening line)
- Modify: `README.md:21` (What it does)
- Modify: `README.md:33-37` (Data sources table)
- Modify: `README.md:64-68` (Files accessed table)
- Modify: `README.md:348-370` (Project structure)
- Modify: `README.md:383` (Platform support table)
- Modify: `README.md:408-416` (Roadmap)

**Step 1: Update opening line (line 3)**

Replace:
```
**Your day, distilled.** Daily Digest reads your browser history, search queries, and Claude Code sessions, then compiles everything into a single, AI-summarized daily note in your Obsidian vault.
```

With:
```
**Your day, distilled.** Daily Digest reads your browser history, search queries, Claude Code sessions, Codex CLI sessions, and git commits, then compiles everything into a single, AI-summarized daily note in your Obsidian vault.
```

**Step 2: Update "What it does" list item (line 21)**

Replace:
```
1. **Collects** your browser history, search queries, and [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions
```

With:
```
1. **Collects** your browser history, search queries, [Claude Code](https://docs.anthropic.com/en/docs/claude-code) sessions, [Codex CLI](https://github.com/openai/codex) sessions, and git commits
```

**Step 3: Add Git and Codex to data sources table (after line 37)**

Add two rows after the Claude Code row:

```markdown
| **Codex CLI sessions** | Your prompts to Codex CLI (not responses) | `~/.codex/history/*.jsonl` |
| **Git commits** | Commit messages, timestamps, file change stats | Local `.git` directories under a configurable parent folder |
```

**Step 4: Add Git and Codex to files accessed table (after line 67)**

Add two rows:

```markdown
| **Codex CLI sessions** | `~/.codex/history/*.jsonl` | To include your Codex CLI prompts |
| **Git commits** | `.git/` directories under a configurable parent folder | To include commit messages and file change statistics |
```

**Step 5: Update project structure (lines 348-370)**

Replace the flat listing with the actual subdirectory layout (same content as CLAUDE.md Task 2 Step 1, but with the comment-style descriptions used in README).

**Step 6: Add Git and Codex to platform support table (after line 383)**

Add rows:
```markdown
| Codex CLI sessions | ✓ | ✓ | ✓ |
| Git commits | ✓ | ✓ | ✓ |
```

**Step 7: Update roadmap (lines 408-416)**

Replace:
```markdown
## Roadmap

Features already shipped are in the current release. The following are planned but **not yet implemented**:

**Phase 3 — Cross-day embeddings** (`embeddings.ts`)
- `persistDayIndex` — save each day's embedding index to `.daily-digest/embeddings/YYYY-MM-DD.json`
- `queryAcrossDays` — semantic search across a date range using persisted indices

These stubs exist in the codebase and return gracefully (no-op / empty array). They are intentionally excluded from the current feature set.

**Platform expansion**
```

With:
```markdown
## Roadmap

Features already shipped are in the current release. The following are planned but **not yet implemented**:

**Cross-day embeddings**
- Persist each day's embedding index and enable semantic search across a date range
- Previously stubbed in `embeddings.ts`; stubs have been removed. Will be re-implemented when ready.

**Platform expansion**
```

---

### Task 4: Standardize Privacy Tier Numbering in pipeline-diagrams.md

**Severity:** BLOCKER

**Files:**
- Modify: `docs/pipeline-diagrams.md:11-78` (Tier decision tree)

**Step 1: Renumber tiers consistently**

The README uses Tier 4 = most private, Tier 1 = least private. The pipeline-diagrams.md reverses this and uses 5 tiers. Standardize to match README's 1-4 scheme with Tier 4 = most private.

In `docs/pipeline-diagrams.md`, update the decision tree tier labels:

- `Tier 5: deidentified` → `Tier 4: deidentified`
- `Tier 4: classified` → `Tier 3: classified`
- `Tier 3: rag` → keep as `RAG` (not part of numbered escalation chain)
- `Tier 2: compressed` → keep as `Compressed` (not part of numbered escalation chain)
- `Tier 1: standard` → `Tier 1: standard`

In the decision tree (lines 16-17): `Tier 5: deidentified` → `Tier 4: deidentified`
In the decision tree (lines 26-27): `Tier 4: classified` → `Tier 3: classified`
In the decision tree (lines 53): `Tier 3: rag` → `RAG tier`
In the decision tree (lines 66): `Tier 2: compressed` → `Tier 2: compressed`
In the notes (line 71): `Tier 5 > Tier 4` → `Tier 4 > Tier 3`

**Step 2: Update the data presence grid (lines 86-106)**

Renumber column headers from `Tier 1...Tier 5` to match new scheme. RAG and compressed are not numbered in the escalation chain but still appear as columns for completeness.

---

### Task 5: Standardize Privacy Tier Numbering in pipeline-data-flow.md

**Severity:** BLOCKER

**Files:**
- Modify: `docs/pipeline-data-flow.md:76-80`

**Step 1: Update tier labels in Stage 7**

In lines 76-80, change:
```
Tier 1: standard — full sanitized data
Tier 2: compressed — token-limited
Tier 3: rag — top-K embedded chunks only
Tier 4: classified — abstracted event types
Tier 5: deidentified — stats only, no raw data
```

To match the standardized numbering:
```
Tier 1: standard — full sanitized data
Tier 2: compressed — token-budget-proportional
RAG: top-K embedded chunks only (opt-in, not part of escalation chain)
Tier 3: classified — abstracted event types only
Tier 4: deidentified — aggregated statistics only, no per-event data
```

---

### Task 6: Update pipeline-diagrams.md Settings Map + Module Paths

**Severity:** MAJOR (settings map) + MINOR (paths)

**Files:**
- Modify: `docs/pipeline-diagrams.md:9` (module reference)
- Modify: `docs/pipeline-diagrams.md:197` (module reference)
- Modify: `docs/pipeline-diagrams.md:247` (module reference)
- Verify: `docs/pipeline-diagrams.md:262-319` (settings map — enableCodex and enableGit already present)

**Step 1: Update module path references**

Line 9: `summarize.ts` → `src/summarize/summarize.ts`
Line 197: `main.ts` → `src/plugin/main.ts`

**Step 2: Verify settings map completeness**

The audit flagged enableCodex and enableGit as missing, but reading the actual file shows they ARE present at lines 269-273. Verify this is accurate and no changes needed.

---

### Task 7: Add Completion Dates to Finished Plan Files

**Severity:** MINOR

**Files:**
- Modify: `docs/plans/2026-02-23-restructure-plan.md` (add completion note)
- Modify: `docs/plans/2026-02-24-root-cleanup-plan.md` (add completion note)
- Modify: `docs/plans/2026-02-23-pipeline-inspector-plan.md` (add completion note)
- Modify: `docs/plans/2026-02-24-prompt-review-pipeline-plan.md` (add completion note)
- Modify: `docs/plans/2026-02-24-prompt-review-scoring-plan.md` (add completion note)
- Delete: `docs/plans/2026-02-23-pipeline-inspector.md` (duplicate of pipeline-inspector-plan.md)

**Step 1: Add status header to each completed plan**

At the top of each file (after the `#` title), add:

```markdown
> **Status:** Completed. Implementation merged to main.
```

For the pipeline inspector plan, use:
```markdown
> **Status:** Implementation complete. Integration test (`inspector-step-mode.test.ts`) has a server startup timeout issue — tracked separately.
```

**Step 2: Remove duplicate plan file**

Delete `docs/plans/2026-02-23-pipeline-inspector.md` — it duplicates `2026-02-23-pipeline-inspector-plan.md`.
