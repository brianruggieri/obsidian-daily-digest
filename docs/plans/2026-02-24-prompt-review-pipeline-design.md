# Prompt Review Pipeline — Design Document

**Date:** 2026-02-24
**Status:** Approved
**Scope:** Cross-project Claude Code plugin

## Overview

A Claude Code plugin that reviews and refines prompts before execution through parallel specialist reviewers. The pipeline fans out to domain-aware LLM reviewers, merges their structured critiques via a deterministic editor, and presents the refined prompt as a diff for user approval.

Runs on the user's existing Claude subscription (zero additional cost). API mode available as a fallback for CI/headless use.

```
Trigger (!!!  or /prompt-review)
    |
    v
Context Builder --- reads CLAUDE.md, package.json, stack detection
    |
    v
Reviewer Ensemble --- 4 always-on + 2 conditional (parallel)
    |
    v
Editor / Aggregator --- merge critiques, resolve conflicts, produce diff
    |
    v
Approval Gate --- user sees diff, approves / rejects / edits
```

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Location | `~/.claude/plugins/prompt-review/` | Cross-project, lives in user's Claude infra |
| Language | Node.js (CJS) | Matches existing hooks/helpers infrastructure |
| Triggers | `!!!` suffix (hook) + `/prompt-review` (skill) | Fast path + deliberate path |
| Execution mode | Subscription-first, API fallback | Zero cost on Pro/Max plan |
| Always-on reviewers | Domain SME, Security, Clarity, Testing | Highest-value failure modes |
| Conditional reviewers | Frontend/UX, Documentation | Fire only when relevant |
| Models (API mode) | Haiku for reviewers, Sonnet for editor | Cost-effective tiering |
| Models (subscription) | Haiku subagents for reviewers, main session for editor | Included in subscription |
| Output UX | Show diff + require approval | Maximum user control |
| Visuals | Rich review output block + statusline integration | High value, low complexity |

## Architecture

### Two Trigger Paths, Same Pipeline

**Path 1: `!!!` suffix (hook)**

1. User types `do something complex!!!`
2. `UserPromptSubmit` fires -> `hook-handler.cjs` detects `!!!` -> returns `additionalContext`
3. `additionalContext` instructs Claude to invoke `/prompt-review` skill with the stripped prompt
4. Skill runs pipeline (subscription mode: Task subagents; API mode: direct calls)
5. Claude presents diff, asks "proceed with refined version?"
6. User approves -> Claude executes refined prompt. Rejects -> executes original.

**Path 2: `/prompt-review` skill**

1. User invokes `/prompt-review "your prompt here"`
2. Skill runs the same pipeline directly
3. Presents diff and asks for approval
4. User approves -> skill outputs refined prompt as `additionalContext` for next turn

### Execution Modes

```
Subscription Mode (default)           API Mode (fallback)
--------------------------            -------------------
Hook injects instruction              Node.js script calls
Claude runs /prompt-review            Anthropic API directly
Task tool subagents as reviewers      Parallel HTTP calls
Claude merges in main session         Sonnet API call merges
$0 cost (included)                    ~$0.04/review
~5-10s latency                        ~2-4s latency
Requires Claude Code session          Works headless/CI
```

Config: `"mode": "subscription"` (default) or `"mode": "api"`.

## Context Builder

Runs before reviewers. Produces a `ProjectContext` object:

```
ProjectContext {
  projectName: string        -- from package.json, CLAUDE.md, or dir name
  stack: string[]            -- ["typescript", "node", "obsidian-plugin", "esbuild"]
  claudeMd: string | null    -- CLAUDE.md content (truncated ~2000 tokens)
  structure: string          -- key file listing (src/, tests/, config files)
  conventions: string[]      -- extracted from CLAUDE.md
  testFramework: string | null  -- "vitest", "jest", "pytest", etc.
  buildTool: string | null   -- "esbuild", "webpack", "vite", etc.
}
```

Detection sources:
- `package.json` -> Node/TS stack, test framework, build tool, dependencies
- `tsconfig.json` -> TypeScript confirmation + compiler target
- `pyproject.toml` / `setup.py` -> Python stack
- `go.mod` -> Go stack
- `Cargo.toml` -> Rust stack
- `CLAUDE.md` -> project-specific conventions, architecture, gotchas
- Directory listing -> src/, tests/, lib/ structure

## Reviewer Architecture

### Critique Schema (shared by all reviewers)

```json
{
  "reviewer_role": "domain_sme | security | clarity | testing | frontend_ux | documentation",
  "severity_max": "blocker | major | minor | nit",
  "confidence": 0.0,
  "findings": [
    {
      "id": "SEC-001",
      "severity": "blocker | major | minor | nit",
      "confidence": 0.85,
      "issue": "Short description of the problem",
      "evidence": "What in the prompt caused this finding",
      "suggested_ops": [
        {
          "op": "AddConstraint | RemoveConstraint | RefactorStructure | ReplaceVague | AddContext | AddGuardrail | AddAcceptanceCriteria",
          "target": "constraints | context | output | structure | examples",
          "value": "The actual text to add/change"
        }
      ]
    }
  ],
  "no_issues": false
}
```

### Edit Operations (bounded set)

| Operation | What it does |
|---|---|
| `AddConstraint` | Insert a requirement the prompt is missing |
| `RemoveConstraint` | Flag a constraint as contradictory or harmful |
| `RefactorStructure` | Reorganize prompt into clear sections |
| `ReplaceVague` | Swap vague verbs for measurable objectives |
| `AddContext` | Require specific files/context be included |
| `AddGuardrail` | Security/safety boundary |
| `AddAcceptanceCriteria` | Testable success condition |

### Always-On Reviewers (4)

**Domain SME** — Checks stack assumptions, project conventions, missing context, architectural conflicts. Uses AddConstraint, AddContext, ReplaceVague ops.

**Security** — Checks injection risk, secret leakage, unsafe tool use, instruction hierarchy. Uses AddGuardrail, AddConstraint ops. Findings are blocker or major severity only.

**Clarity/Structure** — Checks vague verbs, missing output format, ambiguous scope, multiple unrelated requests, missing success criteria. Uses ReplaceVague, RefactorStructure, AddConstraint ops.

**Testing** — Checks for test requirements, acceptance criteria, existing test preservation, test strategy. Uses AddAcceptanceCriteria, AddConstraint ops.

### Conditional Reviewers (2)

**Frontend/UX** — Fires when prompt or project involves UI work. Checks accessibility, responsive/layout constraints, design system, interaction states, theme compatibility.

Triggers:
- Prompt keywords: "component", "modal", "CSS", "style", "layout", "form", "button", "a11y", "accessibility", "responsive", "UI", "UX", "settings tab"
- File patterns: *.css, *.scss, *.tsx, *.vue, *.svelte, settings.ts, styles.css
- Stack markers: react, vue, svelte, nextjs, tailwind, obsidian-plugin

**Documentation** — Fires when changes likely need doc/screenshot updates. Checks README, CHANGELOG, living docs, screenshot baselines, CLAUDE.md structure section.

Triggers:
- Prompt keywords: "feature", "add", "new", "remove", "change", "refactor", "setting", "command", "API"
- Project markers: docs/, screenshots/, CHANGELOG, README
- Skip keywords: "bugfix", "typo", "lint", "format"

### Future: Domain SME Specialization

The Domain SME reviewer can be split into stack-specific specialists in v2:

```
reviewers/
  domain-sme/
    index.cjs              -- router: detects stack -> picks specialist(s)
    typescript-node.cjs
    obsidian-plugin.cjs
    react.cjs
    python-fastapi.cjs
    rust.cjs
    generic.cjs            -- fallback
```

Same interface, same critique schema. The split is internal to the domain-sme module.

## Editor / Aggregator

Runs after all reviewers complete. In subscription mode, Claude does this in the main conversation. In API mode, one Sonnet call.

### Merge Pipeline

```
Critiques -> Schema validate -> Conflict detect -> Apply ops in priority -> Generate refined prompt -> Produce diff
```

### Priority Order

1. Security (blockers always win)
2. Testing (acceptance criteria)
3. Domain SME (project correctness)
4. Documentation (keep docs in sync)
5. Frontend/UX (design quality)
6. Clarity (polish)

### Conflict Rules

- Security says "don't do X" + Clarity says "be helpful about X" -> Security wins
- Two reviewers propose the same edit -> Dedupe, keep higher-severity version
- Non-overlapping additions -> Both apply
- True contradiction with no priority resolution -> Include as "REVIEWER DISAGREEMENT" in audit summary

### Editor Behavior

- Apply only what reviewers proposed. No additional edits.
- Do not remove content unless a reviewer explicitly proposed RemoveConstraint.
- Temperature: 0 (deterministic).

## Approval UX

### Review Output Block

```
+-- Prompt Review -------------------------------------------+
|                                                            |
| Reviewers: Domain SME ok  Security ok  Clarity ok  Testing ok |
| Cost: $0.00 (subscription) | 2.8K tokens                 |
|                                                            |
| -- Changes (4) ------------------------------------------  |
|                                                            |
| + [Domain SME] Added: "Follow existing functional style    |
|   in src/ -- pure functions, named exports, no classes"    |
|                                                            |
| + [Security] Added: "Never commit .env or expose           |
|   ANTHROPIC_API_KEY in generated code"                     |
|                                                            |
| ~ [Clarity] Replaced: "optimize the settings" ->           |
|   "Reduce settings.ts render time by extracting the        |
|   browser config section into a separate component"        |
|                                                            |
| + [Testing] Added: "Run npm run test after changes.        |
|   All existing tests must pass."                           |
|                                                            |
| -- Refined Prompt ---------------------------------------- |
|                                                            |
| <full refined prompt text>                                 |
|                                                            |
+------------------------------------------------------------+

Proceed with the refined prompt? (yes / no / edit)
```

**Responses:** yes -> execute refined. no -> execute original. edit -> user adjusts.

### Statusline Integration

```
Normal:         ok obsidian-claude-daily | main | 3 tasks
During review:  ... Reviewing prompt (4 reviewers)...
After review:   ok Review complete | 4 findings
```

### Failure Modes (fail-open)

| Failure | Behavior |
|---|---|
| API key not set (API mode) | Falls back to subscription mode |
| API rate limit / timeout | Log error, proceed with original prompt |
| One reviewer fails | Other results used. Editor notes "1 reviewer unavailable." |
| All reviewers fail | Warning shown. Original prompt proceeds. |
| Editor fails | Raw critiques shown as bullet points |
| Malformed critique JSON | Schema validation drops it. Reviewer skipped. |
| Hook exceeds timeout | Claude Code kills hook. Original proceeds. |

## Configuration

### Global Config: `~/.claude/plugins/prompt-review/config.json`

```json
{
  "mode": "subscription",
  "api_fallback": true,

  "models": {
    "reviewer": "claude-haiku-4-5",
    "editor": "claude-sonnet-4-6"
  },

  "reviewers": {
    "domain_sme":    { "enabled": true,  "conditional": false },
    "security":      { "enabled": true,  "conditional": false },
    "clarity":       { "enabled": true,  "conditional": false },
    "testing":       { "enabled": true,  "conditional": false },
    "frontend_ux":   { "enabled": true,  "conditional": true,
      "triggers": {
        "prompt_keywords": ["component", "modal", "CSS", "style", "layout",
                            "form", "button", "a11y", "accessibility",
                            "responsive", "UI", "UX", "settings tab"],
        "file_patterns": ["*.css", "*.scss", "*.tsx", "*.vue", "*.svelte",
                          "settings.ts", "styles.css"],
        "stack_markers": ["react", "vue", "svelte", "nextjs", "tailwind",
                          "obsidian-plugin"]
      }
    },
    "documentation": { "enabled": true,  "conditional": true,
      "triggers": {
        "prompt_keywords": ["feature", "add", "new", "remove", "change",
                            "refactor", "setting", "command", "API"],
        "project_markers": ["docs/", "screenshots/", "CHANGELOG", "README"],
        "skip_keywords": ["bugfix", "typo", "lint", "format"]
      }
    }
  },

  "editor": {
    "priority_order": ["security", "testing", "domain_sme", "documentation",
                        "frontend_ux", "clarity"],
    "temperature": 0,
    "max_retries": 1
  },

  "context": {
    "max_tokens": 2000,
    "include_claude_md": true,
    "include_package_json": true,
    "include_structure": true,
    "structure_depth": 2
  },

  "budget": {
    "max_reviewers_per_call": 6,
    "timeout_ms": 8000,
    "log_costs": true
  }
}
```

### Per-Project Overrides: `<project>/.claude/prompt-review.json`

Deep-merged over global config at runtime.

```json
{
  "reviewers": {
    "frontend_ux": {
      "triggers": {
        "file_patterns": ["settings.ts", "styles.css", "privacy.ts"],
        "stack_markers": ["obsidian-plugin"]
      }
    }
  },
  "context": {
    "extra_files": ["docs/pipeline-data-flow.md", "docs/pipeline-diagrams.md"]
  }
}
```

### Environment Variable Overrides

```
PROMPT_REVIEW_ENABLED=false          # kill switch
PROMPT_REVIEW_MODE=api               # force API mode
PROMPT_REVIEW_REVIEWER_MODEL=...     # override reviewer model
PROMPT_REVIEW_EDITOR_MODEL=...       # override editor model
PROMPT_REVIEW_TIMEOUT=5000           # override timeout
```

## Audit Logging

Every review writes a JSONL entry to `~/.claude/plugins/prompt-review/logs/`.
Date-rotated files (e.g. `2026-02-24.jsonl`). No prompt content logged -- only hashes and metadata.

```json
{
  "timestamp": "2026-02-24T14:32:01Z",
  "project": "obsidian-claude-daily",
  "trigger": "!!!",
  "mode": "subscription",
  "original_prompt_hash": "a3f8c2...",
  "reviewers_active": ["domain_sme", "security", "clarity", "testing"],
  "findings_count": 4,
  "severity_max": "minor",
  "conflicts": 0,
  "outcome": "approved",
  "cost": {
    "input_tokens": 8240,
    "output_tokens": 2100,
    "usd": 0.00
  },
  "duration_ms": 6200
}
```

## File Structure

```
~/.claude/
  plugins/
    prompt-review/
      index.cjs                 # Entry point (called by hook + skill)
      config.json               # Global config
      context.cjs               # Project scanner
      orchestrator.cjs          # Fan-out to reviewers, collect results
      editor.cjs                # Aggregation, conflict resolution, diff
      schemas.cjs               # Critique JSON schema + validation
      renderer.cjs              # Formats review output block
      cost.cjs                  # Token counting, cost estimation (API mode)
      reviewers/
        domain-sme.cjs          # Always-on
        security.cjs            # Always-on
        clarity.cjs             # Always-on
        testing.cjs             # Always-on
        frontend-ux.cjs         # Conditional
        documentation.cjs       # Conditional
      logs/                     # Audit JSONL (auto-created)
      tests/
        run.cjs                 # Test runner
        schema.test.cjs
        context.test.cjs
        orchestrator.test.cjs
        editor.test.cjs
        renderer.test.cjs
        fixtures/
          prompts.json
          critiques.json
          contexts.json
  helpers/
    hook-handler.cjs            # MODIFIED: add !!! detection in route handler
    statusline.cjs              # MODIFIED: add review status flag
  skills/
    prompt-review/              # NEW: skill YAML + wrapper
```

### Existing File Changes

**`~/.claude/helpers/hook-handler.cjs`** -- add `!!!` detection to the `route` handler:
```js
if (prompt.endsWith('!!!')) {
  // delegate to prompt-review plugin
  // returns additionalContext instructing Claude to invoke /prompt-review
}
```

**`~/.claude/helpers/statusline.cjs`** -- check flag file, show review status (~5 lines).

## Testing

### Unit Tests (no API calls)

| Test | Coverage |
|---|---|
| schema.test.cjs | Well-formed critiques pass, malformed caught. Every severity, every op type, no_issues case. |
| context.test.cjs | Stack detection from mock package.json, pyproject.toml, Cargo.toml. CLAUDE.md parsing. Missing files. |
| editor.test.cjs | Priority ordering. Conflict resolution. Deduplication. All-no_issues produces "no changes." |
| renderer.test.cjs | Output block has all sections. Zero-finding case. Cost formatting. |
| orchestrator.test.cjs | Conditional triggers fire correctly. Timeout handling. Partial failure. |

### Integration Test (real calls)

`tests/integration.cjs` -- sends a deliberately vague prompt through the full pipeline.
Run manually: `ANTHROPIC_API_KEY=... node tests/integration.cjs`

### Manual Verification

```bash
# Simulate hook
echo '{"prompt":"optimize the settings page!!!"}' | node ~/.claude/plugins/prompt-review/index.cjs --hook

# Real test in Claude Code
claude "optimize the settings page!!!"
```

## Cost Summary

| Mode | Per review | Per day (20 reviews) | Per month |
|---|---|---|---|
| Subscription | $0.00 | $0.00 | $0.00 |
| API | ~$0.04 | ~$0.80 | ~$24 |

## Future Extensions

- `/prompt-review-stats` -- history dashboard reading audit logs
- Domain SME specialization (typescript-node, obsidian-plugin, react, python, rust)
- Per-project reviewer presets
- Review caching (skip re-review for identical prompts)
- CI integration (API mode for automated prompt quality gates)
