# Prompt Review Scoring & Metrics — Design Document

**Date:** 2026-02-24
**Status:** Approved
**Scope:** Extension to `~/.claude/plugins/prompt-review/`
**Depends on:** Prompt review pipeline (built 2026-02-24)

## Overview

Add per-review prompt quality scoring and a historical metrics dashboard to the prompt-review plugin. Scoring gives each reviewed prompt a composite 0-10 quality number. Metrics reads the existing audit JSONL logs and surfaces trends over time.

The goal: answer "is this plugin worth running?" with data, and identify which prompt-writing habits are improving vs. still weak.

```
Existing Pipeline                    New Additions
──────────────                       ──────────────
Reviewers → Critiques → Editor       Each reviewer also returns a 0-10 subscore
                ↓                                    ↓
         Audit JSONL log             Composite score logged alongside findings
                                                     ↓
                                     /prompt-review-stats reads logs, shows trends
```

## Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Score range | 0-10 per reviewer | Simple, human-readable, maps to school grading intuition |
| Composite | Weighted average by priority | Security/testing weight more than clarity/nits |
| Toggle | `scoring.enabled` + `scoring.display` | Scores always logged when enabled, display is separate |
| Dashboard | CLI + skill | `--stats` flag on index.cjs + `/prompt-review-stats` skill |
| Storage | Existing JSONL audit logs | No new storage — scores added to existing log entries |
| Trendline window | 7d / 30d / all-time | Three windows, default 30d |

## Scoring Architecture

### Reviewer Subscores

Each reviewer returns an additional `score` field (0-10) in its critique JSON:

```json
{
  "reviewer_role": "clarity",
  "severity_max": "minor",
  "confidence": 0.85,
  "findings": [...],
  "no_issues": false,
  "score": 6.5
}
```

Score semantics per reviewer:

| Reviewer | Score measures | 10 = | 0 = |
|---|---|---|---|
| Domain SME | Stack/convention alignment | Prompt perfectly accounts for project specifics | Prompt ignores or contradicts project architecture |
| Security | Safety posture | No security concerns, explicit guardrails present | Active risk of secret exposure or injection |
| Clarity | Specificity & structure | Precise verbs, clear scope, output format specified | Entirely vague, ambiguous scope, no success criteria |
| Testing | Test coverage intent | Explicit test command, acceptance criteria, edge cases | Zero mention of tests for a code change |
| Frontend/UX | UI quality intent | A11y, responsive, theme, interaction states covered | UI change with no design considerations |
| Documentation | Doc coverage intent | All affected docs identified, update plan included | Feature change with zero doc mention |

### Composite Score

Weighted average using priority weights:

```
security:      weight 2.0   (most critical)
testing:       weight 1.5
domain_sme:    weight 1.5
documentation: weight 1.0
frontend_ux:   weight 1.0
clarity:       weight 1.0
```

Only active reviewers contribute. Composite = sum(score * weight) / sum(weight).

Example: 4 reviewers active (security=8, testing=5, domain_sme=7, clarity=6):
- Numerator: 8*2.0 + 5*1.5 + 7*1.5 + 6*1.0 = 16 + 7.5 + 10.5 + 6 = 40
- Denominator: 2.0 + 1.5 + 1.5 + 1.0 = 6.0
- Composite: 40 / 6.0 = 6.7

### Schema Update

Add to `schemas.cjs`:

```js
// In validateCritique():
if (critique.score !== undefined) {
  if (typeof critique.score !== 'number' || critique.score < 0 || critique.score > 10) {
    errors.push(`score must be a number between 0 and 10, got: ${critique.score}`);
  }
}
```

Score field is optional — validation passes without it (backward compat with non-scoring mode).

### Audit Log Update

Existing JSONL entry gets two new fields:

```json
{
  "timestamp": "2026-02-24T14:32:01Z",
  "project": "obsidian-claude-daily",
  "...existing fields...",
  "scores": {
    "domain_sme": 7.0,
    "security": 8.5,
    "clarity": 6.5,
    "testing": 5.0
  },
  "composite_score": 6.7
}
```

## Config

Add to `config.json`:

```json
{
  "scoring": {
    "enabled": true,
    "display": true,
    "weights": {
      "security": 2.0,
      "testing": 1.5,
      "domain_sme": 1.5,
      "documentation": 1.0,
      "frontend_ux": 1.0,
      "clarity": 1.0
    }
  }
}
```

- `scoring.enabled: false` — reviewers skip score field, no score in logs
- `scoring.display: false` — scores calculated and logged, but not shown in review block
- `scoring.weights` — customizable per-reviewer weights

## Review Block Changes

When `scoring.display: true`, add score line after reviewer status:

```
+-- Prompt Review -------------------------------------------+
|                                                            |
| Reviewers: Domain SME ok  Security ok  Clarity ok  Testing ok
| Score: 6.7 / 10  (Security 8.5  Testing 5.0  SME 7.0  Clarity 6.5)
| Cost: $0.00 (subscription) | 2.8K tokens                  |
|                                                            |
| -- Changes (3) ------------------------------------------  |
...
```

When `scoring.display: false`, the Score line is simply omitted (everything else unchanged).

Also add `↳ Why:` rationale lines to each finding:

```
| + [Security minor] Added: "Never commit .env or expose
|   API keys in generated code"
|   ↳ Why: Prompt doesn't separate instructions from data
```

## Metrics Dashboard

### Invocation

```
/prompt-review-stats              # skill (last 30 days)
/prompt-review-stats 7            # last 7 days
/prompt-review-stats all          # all time

node ~/.claude/plugins/prompt-review/index.cjs --stats         # CLI
node ~/.claude/plugins/prompt-review/index.cjs --stats --days 7
node ~/.claude/plugins/prompt-review/index.cjs --stats --json  # machine-readable
```

### Dashboard Output

```
Prompt Review Stats (last 30 days)
═══════════════════════════════════

Reviews:       47 total
Outcomes:      38 approved (81%)  6 edited (13%)  3 rejected (6%)

Score Trend
  Week 1:     5.8 avg  ██████░░░░
  Week 2:     6.4 avg  ██████▒░░░
  Week 3:     7.0 avg  ███████░░░
  Week 4:     7.2 avg  ███████▒░░

Subscores (current week avg)
  Security:    8.9  █████████░  strong
  Specificity: 7.8  ████████░░  good
  Convention:  7.2  ███████░░░  good
  Testability: 6.1  ██████░░░░  needs work  ← weakest
  Docs:        6.8  ███████░░░  good
  UX:          7.0  ███████░░░  good

Findings Trend
  Blockers:    2% → 0%   ↓
  Major:       34% → 18% ↓
  Minor:       52% → 64% ↑ (more polish, fewer blockers)
  Nit:         12% → 18% ↑

Top Patterns
  1. Missing test command        (23 occurrences)
  2. Vague verb without criteria (18 occurrences)
  3. No .env guardrail           (12 occurrences)

Cost:          $0.00 (subscription mode)
```

### Stats Module

New file: `~/.claude/plugins/prompt-review/stats.cjs`

Functions:
- `readAuditLogs(days)` — reads JSONL files, filters by date window
- `computeScoreTrend(entries, windowDays)` — weekly score averages
- `computeOutcomes(entries)` — approved/edited/rejected counts
- `computeSeverityTrend(entries)` — blocker/major/minor/nit percentages over time
- `computeTopPatterns(entries)` — most frequent finding issues
- `renderDashboard(stats)` — formatted text output
- `renderDashboardJson(stats)` — machine-readable output

## Reviewer Prompt Updates

Each reviewer's system prompt gets this addition at the end of the Output Format section:

```
Additionally, include a "score" field (0-10) rating the prompt's quality
for your review dimension:
- 10: Excellent — no issues, explicit best practices included
- 7-9: Good — minor improvements possible
- 4-6: Needs work — significant gaps that would affect output quality
- 0-3: Poor — fundamental problems that would likely cause failure

The score should reflect the ORIGINAL prompt's quality, not the quality
after your suggested fixes are applied.
```

This is critical: the score measures the **input** prompt, not the output. This way the score trends over time reflect the user's improving prompt-writing skill.

## Outcome Tracking

The audit log currently records `"outcome": "pending"`. To complete the feedback loop, the skill needs to update the log entry after the user approves/rejects/edits:

1. `handleHook` / skill writes initial entry with `outcome: "pending"`
2. After user responds, update the last entry's outcome field
3. `updateAuditOutcome(logDate, promptHash, outcome)` — finds entry by hash, updates outcome

This requires a small addition to `index.cjs` — an `updateOutcome()` export that the skill calls after the user responds.

## File Changes

```
~/.claude/plugins/prompt-review/
  config.json                    MODIFY: add scoring section
  schemas.cjs                    MODIFY: validate optional score field
  reviewers/*.cjs (all 6)        MODIFY: add score instruction to system prompts
  orchestrator.cjs               MODIFY: extract scores from critiques
  editor.cjs                     MODIFY: compute composite score
  renderer.cjs                   MODIFY: render score line + ↳ Why rationale
  index.cjs                      MODIFY: pass scoring config, add --stats CLI, add updateOutcome
  cost.cjs                       MODIFY: log scores in audit entries
  stats.cjs                      NEW: metrics computation + dashboard rendering
  tests/
    schema.test.cjs              MODIFY: add score validation tests
    editor.test.cjs              MODIFY: add composite score tests
    renderer.test.cjs            MODIFY: add score display + toggle tests
    stats.test.cjs               NEW: metrics computation tests

.claude/skills/prompt-review-stats/
  SKILL.md                       NEW: /prompt-review-stats skill
```

## Testing

| Test | Coverage |
|---|---|
| schema.test.cjs | Score field validation: valid range, missing (optional), out of range |
| editor.test.cjs | Composite score calculation, weighted average, missing scores handled |
| renderer.test.cjs | Score line present when display=true, absent when display=false, ↳ Why lines |
| stats.test.cjs | Log parsing, trend computation, outcome counting, empty logs, partial data |

## Non-Goals

- **No execution-based evaluation.** We don't run prompts to compare outputs. Scores are reviewer judgments of the prompt text.
- **No cross-user benchmarking.** This is personal metrics only.
- **No prompt caching.** Same prompt reviewed twice gets two separate scores (the project context may differ).
- **No real-time dashboard.** Stats are computed on demand, not streamed.
