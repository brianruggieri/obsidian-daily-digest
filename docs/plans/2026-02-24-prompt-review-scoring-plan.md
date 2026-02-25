# Prompt Review Scoring & Metrics Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-review prompt quality scoring (0-10) and a historical metrics dashboard to the prompt-review plugin

**Architecture:** Each reviewer returns an optional `score` field alongside its critique. The editor computes a weighted composite. Scores are logged in the existing JSONL audit trail. A new `stats.cjs` module reads logs and renders trend dashboards. Two toggles control behavior: `scoring.enabled` (calculate+log) and `scoring.display` (render in output).

**Tech Stack:** Node.js CJS modules, JSONL files for storage, no new dependencies

**Design doc:** `docs/plans/2026-02-24-prompt-review-scoring-design.md`

**Test command:** `node <test-file-path>` (no npm, no vitest)

**Important:** All files live under `~/.claude/plugins/prompt-review/`. Do NOT modify any `src/` files in the repo. Do NOT run `npm` commands.

---

### Task 1: Add scoring config to config.json

**Files:**
- Modify: `~/.claude/plugins/prompt-review/config.json`

**Step 1: Add the scoring section**

Open `config.json` and add the `scoring` key after the `budget` section (after line 50):

```json
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
```

**Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.claude/plugins/prompt-review/config.json','utf-8')); console.log('valid JSON')"`
Expected: `valid JSON`

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(prompt-review): add scoring config section"
```

---

### Task 2: Add score validation to schemas.cjs

**Files:**
- Modify: `~/.claude/plugins/prompt-review/schemas.cjs:14-57`
- Modify: `~/.claude/plugins/prompt-review/tests/schema.test.cjs`

**Step 1: Write the failing tests**

Append these tests to `tests/schema.test.cjs`, before the final `console.log`:

```js
// Test: valid score passes
{
  const critique = {
    reviewer_role: 'clarity',
    severity_max: 'minor',
    confidence: 0.8,
    findings: [],
    no_issues: true,
    score: 7.5
  };
  const result = validateCritique(critique);
  assert.strictEqual(result.valid, true, 'Valid score should pass');
}

// Test: score out of range fails
{
  const critique = {
    reviewer_role: 'clarity',
    severity_max: 'minor',
    confidence: 0.8,
    findings: [],
    no_issues: true,
    score: 11.0
  };
  const result = validateCritique(critique);
  assert.strictEqual(result.valid, false, 'Score > 10 should fail');
}

// Test: negative score fails
{
  const critique = {
    reviewer_role: 'clarity',
    severity_max: 'minor',
    confidence: 0.8,
    findings: [],
    no_issues: true,
    score: -1
  };
  const result = validateCritique(critique);
  assert.strictEqual(result.valid, false, 'Negative score should fail');
}

// Test: non-number score fails
{
  const critique = {
    reviewer_role: 'clarity',
    severity_max: 'minor',
    confidence: 0.8,
    findings: [],
    no_issues: true,
    score: 'high'
  };
  const result = validateCritique(critique);
  assert.strictEqual(result.valid, false, 'Non-number score should fail');
}

// Test: missing score still passes (backward compat)
{
  const critique = {
    reviewer_role: 'security',
    severity_max: 'nit',
    confidence: 0.8,
    findings: [],
    no_issues: true
  };
  const result = validateCritique(critique);
  assert.strictEqual(result.valid, true, 'Missing score should still pass');
}
```

**Step 2: Run tests to verify they fail**

Run: `node ~/.claude/plugins/prompt-review/tests/schema.test.cjs`
Expected: First new test passes (no validation yet, score is just ignored). Tests 2-4 should PASS (false positive — the invalid scores aren't caught yet, so `valid` will be `true` instead of `false`). So actually, tests 2-4 will FAIL with assertion errors. Good.

**Step 3: Add score validation to schemas.cjs**

In `schemas.cjs`, add this block after the `no_issues` check (after line 36, before the findings validation loop):

```js
  // Optional score field (0-10)
  if (critique.score !== undefined) {
    if (typeof critique.score !== 'number' || critique.score < 0 || critique.score > 10) {
      errors.push(`score must be a number between 0 and 10, got: ${critique.score}`);
    }
  }
```

**Step 4: Run tests to verify they pass**

Run: `node ~/.claude/plugins/prompt-review/tests/schema.test.cjs`
Expected: `schemas.test: all tests passed`

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(prompt-review): add optional score field validation to schema"
```

---

### Task 3: Add score instruction to all 6 reviewer system prompts

**Files:**
- Modify: `~/.claude/plugins/prompt-review/reviewers/domain-sme.cjs:30-54`
- Modify: `~/.claude/plugins/prompt-review/reviewers/security.cjs:28-53`
- Modify: `~/.claude/plugins/prompt-review/reviewers/clarity.cjs:28-54`
- Modify: `~/.claude/plugins/prompt-review/reviewers/testing.cjs:28-54`
- Modify: `~/.claude/plugins/prompt-review/reviewers/frontend-ux.cjs:28-54`
- Modify: `~/.claude/plugins/prompt-review/reviewers/documentation.cjs:28-54`

Each reviewer has a `SYSTEM_PROMPT` template string. The JSON output format section shows the example schema. We need to add `"score"` to the example JSON AND add a scoring instruction paragraph.

**Step 1: Add score field to each reviewer's JSON example and add scoring instructions**

For EACH of the 6 reviewer files, make two changes inside the `SYSTEM_PROMPT` string:

**a) Add `"score": 0.0-10.0` to the main JSON example** (the one with findings). Add it as the last field, after `"no_issues": false`:

Before:
```
  "no_issues": false
}
```

After:
```
  "no_issues": false,
  "score": 0.0-10.0
}
```

**b) Add `"score": 0.0-10.0` to the no-issues JSON example** too:

Before (example for domain_sme):
```
{ "reviewer_role": "domain_sme", "severity_max": "nit", "confidence": 0.7, "findings": [], "no_issues": true }
```

After:
```
{ "reviewer_role": "domain_sme", "severity_max": "nit", "confidence": 0.7, "findings": [], "no_issues": true, "score": 0.0-10.0 }
```

**c) Add scoring instruction paragraph** AFTER the no-issues JSON block, before the closing backtick-semicolon. Add this text to all 6 reviewers:

```
Additionally, include a "score" field (0-10) rating the prompt's quality for your review dimension:
- 10: Excellent — no issues, explicit best practices included
- 7-9: Good — minor improvements possible
- 4-6: Needs work — significant gaps that would affect output quality
- 0-3: Poor — fundamental problems that would likely cause failure

The score reflects the ORIGINAL prompt's quality, not the quality after your suggested fixes.
```

The score semantics per reviewer are:
- **domain-sme.cjs**: "Score measures: stack/convention alignment"
- **security.cjs**: "Score measures: safety posture"
- **clarity.cjs**: "Score measures: specificity and structure"
- **testing.cjs**: "Score measures: test coverage intent"
- **frontend-ux.cjs**: "Score measures: UI quality intent"
- **documentation.cjs**: "Score measures: doc coverage intent"

Add the reviewer-specific line before the generic scale. For example, for domain-sme.cjs:

```
Additionally, include a "score" field (0-10) rating the prompt's stack/convention alignment:
- 10: Excellent — prompt perfectly accounts for project specifics
- 7-9: Good — minor improvements possible
- 4-6: Needs work — significant gaps that would affect output quality
- 0-3: Poor — prompt ignores or contradicts project architecture

The score reflects the ORIGINAL prompt's quality, not the quality after your suggested fixes.
```

For security.cjs:
```
Additionally, include a "score" field (0-10) rating the prompt's safety posture:
- 10: Excellent — no security concerns, explicit guardrails present
- 7-9: Good — minor improvements possible
- 4-6: Needs work — significant gaps in safety boundaries
- 0-3: Poor — active risk of secret exposure or injection

The score reflects the ORIGINAL prompt's quality, not the quality after your suggested fixes.
```

For clarity.cjs:
```
Additionally, include a "score" field (0-10) rating the prompt's specificity and structure:
- 10: Excellent — precise verbs, clear scope, output format specified
- 7-9: Good — minor improvements possible
- 4-6: Needs work — significant ambiguity that would affect output quality
- 0-3: Poor — entirely vague, ambiguous scope, no success criteria

The score reflects the ORIGINAL prompt's quality, not the quality after your suggested fixes.
```

For testing.cjs:
```
Additionally, include a "score" field (0-10) rating the prompt's test coverage intent:
- 10: Excellent — explicit test command, acceptance criteria, edge cases
- 7-9: Good — minor improvements possible
- 4-6: Needs work — significant gaps in test requirements
- 0-3: Poor — zero mention of tests for a code change

The score reflects the ORIGINAL prompt's quality, not the quality after your suggested fixes.
```

For frontend-ux.cjs:
```
Additionally, include a "score" field (0-10) rating the prompt's UI quality intent:
- 10: Excellent — a11y, responsive, theme, interaction states covered
- 7-9: Good — minor improvements possible
- 4-6: Needs work — significant UI considerations missing
- 0-3: Poor — UI change with no design considerations

The score reflects the ORIGINAL prompt's quality, not the quality after your suggested fixes.
```

For documentation.cjs:
```
Additionally, include a "score" field (0-10) rating the prompt's documentation coverage intent:
- 10: Excellent — all affected docs identified, update plan included
- 7-9: Good — minor improvements possible
- 4-6: Needs work — significant doc gaps for this change
- 0-3: Poor — feature change with zero doc mention

The score reflects the ORIGINAL prompt's quality, not the quality after your suggested fixes.
```

**Step 2: Verify each reviewer file is valid JS**

Run for each:
```bash
node -e "require(require('os').homedir()+'/.claude/plugins/prompt-review/reviewers/domain-sme.cjs'); console.log('ok')"
node -e "require(require('os').homedir()+'/.claude/plugins/prompt-review/reviewers/security.cjs'); console.log('ok')"
node -e "require(require('os').homedir()+'/.claude/plugins/prompt-review/reviewers/clarity.cjs'); console.log('ok')"
node -e "require(require('os').homedir()+'/.claude/plugins/prompt-review/reviewers/testing.cjs'); console.log('ok')"
node -e "require(require('os').homedir()+'/.claude/plugins/prompt-review/reviewers/frontend-ux.cjs'); console.log('ok')"
node -e "require(require('os').homedir()+'/.claude/plugins/prompt-review/reviewers/documentation.cjs'); console.log('ok')"
```
Expected: all print `ok`

**Step 3: Run existing orchestrator tests to verify nothing broke**

Run: `node ~/.claude/plugins/prompt-review/tests/orchestrator.test.cjs`
Expected: `orchestrator.test: all tests passed`

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(prompt-review): add scoring instructions to all 6 reviewer prompts"
```

---

### Task 4: Add composite score computation to editor.cjs

**Files:**
- Modify: `~/.claude/plugins/prompt-review/editor.cjs`
- Modify: `~/.claude/plugins/prompt-review/tests/editor.test.cjs`

**Step 1: Write the failing tests**

Append to `tests/editor.test.cjs`, before the final `console.log`:

```js
const { computeCompositeScore } = require('../editor.cjs');

// Test: composite score with 4 reviewers
{
  const critiques = [
    { reviewer_role: 'security', score: 8.0 },
    { reviewer_role: 'testing', score: 5.0 },
    { reviewer_role: 'domain_sme', score: 7.0 },
    { reviewer_role: 'clarity', score: 6.0 },
  ];
  const weights = { security: 2.0, testing: 1.5, domain_sme: 1.5, clarity: 1.0 };
  const result = computeCompositeScore(critiques, weights);
  // Numerator: 8*2.0 + 5*1.5 + 7*1.5 + 6*1.0 = 16+7.5+10.5+6 = 40
  // Denominator: 2.0+1.5+1.5+1.0 = 6.0
  // Composite: 40/6.0 = 6.666...
  assert.ok(Math.abs(result.composite - 6.67) < 0.01, `Expected ~6.67, got ${result.composite}`);
  assert.strictEqual(Object.keys(result.scores).length, 4);
}

// Test: composite score with missing scores (some reviewers didn't return score)
{
  const critiques = [
    { reviewer_role: 'security', score: 9.0 },
    { reviewer_role: 'testing' },  // no score
    { reviewer_role: 'clarity', score: 7.0 },
  ];
  const weights = { security: 2.0, testing: 1.5, clarity: 1.0 };
  const result = computeCompositeScore(critiques, weights);
  // Only security and clarity contribute
  // Numerator: 9*2.0 + 7*1.0 = 18+7 = 25
  // Denominator: 2.0+1.0 = 3.0
  // Composite: 25/3.0 = 8.33
  assert.ok(Math.abs(result.composite - 8.33) < 0.01, `Expected ~8.33, got ${result.composite}`);
  assert.strictEqual(Object.keys(result.scores).length, 2, 'Only 2 reviewers with scores');
}

// Test: no scores at all returns null composite
{
  const critiques = [
    { reviewer_role: 'security' },
    { reviewer_role: 'testing' },
  ];
  const weights = { security: 2.0, testing: 1.5 };
  const result = computeCompositeScore(critiques, weights);
  assert.strictEqual(result.composite, null, 'No scores should return null');
  assert.strictEqual(Object.keys(result.scores).length, 0);
}

// Test: default weights used when reviewer has no weight entry
{
  const critiques = [
    { reviewer_role: 'security', score: 8.0 },
    { reviewer_role: 'frontend_ux', score: 6.0 },
  ];
  const weights = { security: 2.0 };  // no frontend_ux weight
  const result = computeCompositeScore(critiques, weights);
  // frontend_ux defaults to 1.0
  // Numerator: 8*2.0 + 6*1.0 = 22
  // Denominator: 2.0+1.0 = 3.0
  // Composite: 22/3.0 = 7.33
  assert.ok(Math.abs(result.composite - 7.33) < 0.01, `Expected ~7.33, got ${result.composite}`);
}
```

**Step 2: Run tests to verify they fail**

Run: `node ~/.claude/plugins/prompt-review/tests/editor.test.cjs`
Expected: FAIL with `computeCompositeScore is not a function`

**Step 3: Implement computeCompositeScore in editor.cjs**

Add this function before the `module.exports` line in `editor.cjs`:

```js
function computeCompositeScore(critiques, weights) {
  const scores = {};
  let numerator = 0;
  let denominator = 0;

  for (const critique of critiques) {
    if (critique.score === undefined || critique.score === null) continue;
    if (typeof critique.score !== 'number') continue;

    const role = critique.reviewer_role;
    const weight = (weights && weights[role]) || 1.0;
    scores[role] = critique.score;
    numerator += critique.score * weight;
    denominator += weight;
  }

  const composite = denominator > 0
    ? Math.round((numerator / denominator) * 100) / 100
    : null;

  return { composite, scores };
}
```

Add `computeCompositeScore` to `module.exports`.

**Step 4: Run tests to verify they pass**

Run: `node ~/.claude/plugins/prompt-review/tests/editor.test.cjs`
Expected: `editor.test: all tests passed`

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(prompt-review): add composite score computation"
```

---

### Task 5: Add score line and rationale to renderer.cjs

**Files:**
- Modify: `~/.claude/plugins/prompt-review/renderer.cjs`
- Modify: `~/.claude/plugins/prompt-review/tests/renderer.test.cjs`

**Step 1: Write the failing tests**

Append to `tests/renderer.test.cjs`, before the final `console.log`:

```js
// Test: score line present when scoring.display is true
{
  const block = renderReviewBlock({
    reviewersActive: ['domain_sme', 'security', 'clarity', 'testing'],
    findings: [
      { reviewer_role: 'security', op: 'AddGuardrail', value: 'No secrets', severity: 'blocker', issue: 'Prompt risks secret exposure' },
    ],
    risks: [],
    refinedPrompt: 'The refined prompt.',
    mode: 'subscription',
    cost: { inputTokens: 4000, outputTokens: 1000, usd: 0.00 },
    durationMs: 2000,
    scoring: {
      display: true,
      composite: 6.7,
      scores: { security: 8.5, testing: 5.0, domain_sme: 7.0, clarity: 6.5 },
    },
  });
  assert.ok(block.includes('Score: 6.7 / 10'), `Should include composite score line, got:\n${block}`);
  assert.ok(block.includes('Security 8.5'), 'Should include security subscore');
  assert.ok(block.includes('Testing 5.0'), 'Should include testing subscore');
}

// Test: score line absent when scoring.display is false
{
  const block = renderReviewBlock({
    reviewersActive: ['domain_sme', 'security'],
    findings: [],
    risks: [],
    refinedPrompt: 'Same prompt.',
    mode: 'subscription',
    cost: { inputTokens: 2000, outputTokens: 500, usd: 0.00 },
    durationMs: 1500,
    noChanges: true,
    scoring: {
      display: false,
      composite: 8.0,
      scores: { security: 9.0, domain_sme: 7.0 },
    },
  });
  assert.ok(!block.includes('Score:'), 'Score line should be absent when display=false');
}

// Test: score line absent when no scoring data
{
  const block = renderReviewBlock({
    reviewersActive: ['domain_sme', 'security'],
    findings: [],
    risks: [],
    refinedPrompt: 'Same prompt.',
    mode: 'subscription',
    cost: { inputTokens: 2000, outputTokens: 500, usd: 0.00 },
    durationMs: 1500,
    noChanges: true,
  });
  assert.ok(!block.includes('Score:'), 'Score line should be absent when no scoring data');
}

// Test: rationale (Why) lines present on findings
{
  const block = renderReviewBlock({
    reviewersActive: ['security', 'clarity'],
    findings: [
      { reviewer_role: 'security', op: 'AddGuardrail', value: 'No secrets', severity: 'blocker', issue: 'Prompt risks exposing API keys' },
      { reviewer_role: 'clarity', op: 'ReplaceVague', original: 'optimize', value: 'reduce load time', severity: 'minor', issue: 'Vague verb without criteria' },
    ],
    risks: [],
    refinedPrompt: 'Refined.',
    mode: 'subscription',
    cost: { inputTokens: 4000, outputTokens: 1000, usd: 0.00 },
    durationMs: 2500,
  });
  assert.ok(block.includes('Why: Prompt risks exposing API keys'), 'Should include security rationale');
  assert.ok(block.includes('Why: Vague verb without criteria'), 'Should include clarity rationale');
}
```

**Step 2: Run tests to verify they fail**

Run: `node ~/.claude/plugins/prompt-review/tests/renderer.test.cjs`
Expected: FAIL — score line not present, Why lines not present

**Step 3: Modify renderer.cjs — add score line**

In `renderReviewBlock`, add the score line after the reviewer status line (after the `lines.push` for Reviewers, before the Cost line). Insert this:

```js
  // Score line (when scoring data present and display enabled)
  if (data.scoring && data.scoring.display && data.scoring.composite !== null) {
    const subscores = Object.entries(data.scoring.scores)
      .map(([role, score]) => `${ROLE_LABELS[role] || role} ${score}`)
      .join('  ');
    lines.push(`| Score: ${data.scoring.composite} / 10  (${subscores})`);
  }
```

**Step 4: Modify renderer.cjs — add rationale to renderFinding**

In `renderFinding`, add a `↳ Why:` line at the end of the function, before the `return line;`:

Replace the `return line;` at the end of `renderFinding` with:

```js
  if (finding.issue) {
    line += `\n  ↳ Why: ${finding.issue}`;
  }

  return line;
```

**Step 5: Run tests to verify they pass**

Run: `node ~/.claude/plugins/prompt-review/tests/renderer.test.cjs`
Expected: `renderer.test: all tests passed`

**Step 6: Commit**

```bash
git add -A && git commit -m "feat(prompt-review): add score line and rationale to review block"
```

---

### Task 6: Wire scoring through index.cjs pipeline

**Files:**
- Modify: `~/.claude/plugins/prompt-review/index.cjs`

This task wires the scoring config through the hook, skill, and API pipeline paths so composite scores are calculated, logged, and passed to the renderer.

**Step 1: Add computeCompositeScore import**

At the top of `index.cjs`, change the editor import (line 7) from:

```js
const { mergeCritiques, buildEditorPrompt, parseEditorResponse } = require('./editor.cjs');
```

to:

```js
const { mergeCritiques, buildEditorPrompt, parseEditorResponse, computeCompositeScore } = require('./editor.cjs');
```

**Step 2: Add scoring to the API pipeline (runFullPipeline)**

In `runFullPipeline`, after `const validCritiques = ...` and before `const merged = mergeCritiques(...)`:

```js
    // Compute scores if enabled
    let scoringResult = null;
    if (config.scoring && config.scoring.enabled) {
      scoringResult = computeCompositeScore(validCritiques, config.scoring.weights);
    }
```

Then in both render calls (the `noChanges` path and the main path), add the `scoring` field to the `renderReviewBlock` data object:

```js
    scoring: scoringResult && config.scoring ? {
      display: config.scoring.display !== false,
      composite: scoringResult.composite,
      scores: scoringResult.scores,
    } : undefined,
```

**Step 3: Add scores to audit log entries**

In the `logAudit` function, add two new parameters `scores` and `compositeScore` and include them in the log entry:

Change the `logAudit` function signature from:

```js
function logAudit(prompt, cwd, reviewersActive, findingsCount, severityMax, conflicts, mode, inputTokens, outputTokens, durationMs) {
```

to:

```js
function logAudit(prompt, cwd, reviewersActive, findingsCount, severityMax, conflicts, mode, inputTokens, outputTokens, durationMs, scores, compositeScore) {
```

And add these fields to the `writeAuditLog` object:

```js
    scores: scores || {},
    composite_score: compositeScore || null,
```

Update both `logAudit` call sites in `runFullPipeline` to pass the scoring data:

For the `noChanges` path:
```js
logAudit(prompt, cwd, activeReviewers, 0, 'nit', 0, 'subscription', totalInput, totalOutput, durationMs,
  scoringResult ? scoringResult.scores : {}, scoringResult ? scoringResult.composite : null);
```

For the main path:
```js
logAudit(prompt, cwd, activeReviewers, merged.allOps.length, merged.severityMax, merged.conflicts.length, config.mode, totalInput, totalOutput, durationMs,
  scoringResult ? scoringResult.scores : {}, scoringResult ? scoringResult.composite : null);
```

**Step 4: Add scoring instructions to subscription context**

In `buildSubscriptionContext`, add a note about scoring to the instructions string. After the existing Critique Schema section, add:

```js
  if (config.scoring && config.scoring.enabled) {
    instructions += `\n## Scoring\n\nEach reviewer will also return a "score" field (0-10). After collecting all scores, compute a weighted composite:\n`;
    instructions += `Weights: ${JSON.stringify(config.scoring.weights)}\n`;
    instructions += `Composite = sum(score * weight) / sum(weight) for active reviewers that returned scores.\n`;
    if (config.scoring.display) {
      instructions += `Display the composite score and subscores in the review block.\n`;
    } else {
      instructions += `Log scores but do not display them in the review block.\n`;
    }
  }
```

**Step 5: Verify existing tests still pass**

Run: `node ~/.claude/plugins/prompt-review/tests/schema.test.cjs && node ~/.claude/plugins/prompt-review/tests/editor.test.cjs && node ~/.claude/plugins/prompt-review/tests/renderer.test.cjs && node ~/.claude/plugins/prompt-review/tests/orchestrator.test.cjs`
Expected: All pass

**Step 6: Commit**

```bash
git add -A && git commit -m "feat(prompt-review): wire scoring through pipeline, audit logs, and subscription context"
```

---

### Task 7: Create stats.cjs — log reading and trend computation

**Files:**
- Create: `~/.claude/plugins/prompt-review/stats.cjs`
- Create: `~/.claude/plugins/prompt-review/tests/stats.test.cjs`

**Step 1: Write the failing tests**

Create `tests/stats.test.cjs`:

```js
const assert = require('assert');
const { readAuditLogs, computeScoreTrend, computeOutcomes, computeSeverityTrend, computeTopPatterns } = require('../stats.cjs');

// Test: readAuditLogs parses JSONL entries
{
  const lines = [
    '{"timestamp":"2026-02-20T10:00:00Z","project":"test","composite_score":7.0,"severity_max":"minor","findings_count":2,"outcome":"approved","scores":{"security":8.0,"clarity":6.0}}',
    '{"timestamp":"2026-02-21T10:00:00Z","project":"test","composite_score":8.0,"severity_max":"nit","findings_count":0,"outcome":"approved","scores":{"security":9.0,"clarity":7.0}}',
  ];
  // readAuditLogs takes an array of JSONL strings (one per line)
  const entries = readAuditLogs(lines);
  assert.strictEqual(entries.length, 2, 'Should parse 2 entries');
  assert.strictEqual(entries[0].composite_score, 7.0);
  assert.strictEqual(entries[1].composite_score, 8.0);
}

// Test: readAuditLogs skips malformed lines
{
  const lines = [
    '{"timestamp":"2026-02-20T10:00:00Z","composite_score":7.0}',
    'not json',
    '',
    '{"timestamp":"2026-02-21T10:00:00Z","composite_score":8.0}',
  ];
  const entries = readAuditLogs(lines);
  assert.strictEqual(entries.length, 2, 'Should skip malformed lines');
}

// Test: computeScoreTrend groups by week
{
  const entries = [
    { timestamp: '2026-02-03T10:00:00Z', composite_score: 5.0 },
    { timestamp: '2026-02-04T10:00:00Z', composite_score: 6.0 },
    { timestamp: '2026-02-10T10:00:00Z', composite_score: 7.0 },
    { timestamp: '2026-02-17T10:00:00Z', composite_score: 8.0 },
  ];
  const trend = computeScoreTrend(entries);
  assert.ok(trend.length >= 2, 'Should have multiple weeks');
  // First week avg should be 5.5
  assert.ok(Math.abs(trend[0].avg - 5.5) < 0.01, `Week 1 avg should be ~5.5, got ${trend[0].avg}`);
}

// Test: computeOutcomes counts correctly
{
  const entries = [
    { outcome: 'approved' },
    { outcome: 'approved' },
    { outcome: 'edited' },
    { outcome: 'rejected' },
    { outcome: 'pending' },
  ];
  const outcomes = computeOutcomes(entries);
  assert.strictEqual(outcomes.approved, 2);
  assert.strictEqual(outcomes.edited, 1);
  assert.strictEqual(outcomes.rejected, 1);
  assert.strictEqual(outcomes.pending, 1);
  assert.strictEqual(outcomes.total, 5);
}

// Test: computeTopPatterns counts finding issues
{
  const entries = [
    { findings_detail: [{ issue: 'Missing test command' }, { issue: 'Vague verb' }] },
    { findings_detail: [{ issue: 'Missing test command' }, { issue: 'No .env guardrail' }] },
    { findings_detail: [{ issue: 'Missing test command' }] },
  ];
  const patterns = computeTopPatterns(entries);
  assert.strictEqual(patterns[0].issue, 'Missing test command');
  assert.strictEqual(patterns[0].count, 3);
}

// Test: empty entries returns empty results
{
  const entries = [];
  const trend = computeScoreTrend(entries);
  const outcomes = computeOutcomes(entries);
  assert.strictEqual(trend.length, 0);
  assert.strictEqual(outcomes.total, 0);
}

console.log('stats.test: all tests passed');
```

**Step 2: Run tests to verify they fail**

Run: `node ~/.claude/plugins/prompt-review/tests/stats.test.cjs`
Expected: FAIL with `Cannot find module '../stats.cjs'`

**Step 3: Implement stats.cjs**

Create `~/.claude/plugins/prompt-review/stats.cjs`:

```js
const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, 'logs');

function readAuditLogs(lines) {
  const entries = [];
  for (const line of lines) {
    if (!line || !line.trim()) continue;
    try {
      entries.push(JSON.parse(line.trim()));
    } catch (e) {
      // skip malformed lines
    }
  }
  return entries;
}

function loadLogsFromDisk(days) {
  const entries = [];
  if (!fs.existsSync(LOGS_DIR)) return entries;

  const cutoff = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
  const files = fs.readdirSync(LOGS_DIR).filter(f => f.endsWith('.jsonl')).sort();

  for (const file of files) {
    // File name is YYYY-MM-DD.jsonl — quick date check
    if (cutoff) {
      const fileDate = file.replace('.jsonl', '');
      if (new Date(fileDate) < cutoff) continue;
    }

    const content = fs.readFileSync(path.join(LOGS_DIR, file), 'utf-8');
    const lines = content.split('\n');
    const parsed = readAuditLogs(lines);

    for (const entry of parsed) {
      if (cutoff && new Date(entry.timestamp) < cutoff) continue;
      entries.push(entry);
    }
  }

  return entries;
}

function computeScoreTrend(entries) {
  if (entries.length === 0) return [];

  // Group by ISO week
  const weeks = new Map();
  for (const entry of entries) {
    if (entry.composite_score === null || entry.composite_score === undefined) continue;
    const date = new Date(entry.timestamp);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    const weekKey = weekStart.toISOString().slice(0, 10);

    if (!weeks.has(weekKey)) weeks.set(weekKey, []);
    weeks.get(weekKey).push(entry.composite_score);
  }

  const trend = [];
  for (const [weekKey, scores] of [...weeks].sort((a, b) => a[0].localeCompare(b[0]))) {
    const avg = Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) / 100;
    trend.push({ week: weekKey, avg, count: scores.length });
  }

  return trend;
}

function computeSubscoreTrend(entries) {
  const roleScores = {};

  for (const entry of entries) {
    if (!entry.scores) continue;
    for (const [role, score] of Object.entries(entry.scores)) {
      if (!roleScores[role]) roleScores[role] = [];
      roleScores[role].push(score);
    }
  }

  const result = {};
  for (const [role, scores] of Object.entries(roleScores)) {
    result[role] = Math.round((scores.reduce((s, v) => s + v, 0) / scores.length) * 100) / 100;
  }

  return result;
}

function computeOutcomes(entries) {
  const counts = { approved: 0, edited: 0, rejected: 0, pending: 0 };
  for (const entry of entries) {
    const outcome = entry.outcome || 'pending';
    if (counts[outcome] !== undefined) {
      counts[outcome]++;
    }
  }
  counts.total = entries.length;
  return counts;
}

function computeSeverityTrend(entries) {
  const counts = { blocker: 0, major: 0, minor: 0, nit: 0 };
  for (const entry of entries) {
    const sev = entry.severity_max || 'nit';
    if (counts[sev] !== undefined) counts[sev]++;
  }
  const total = entries.length || 1;
  return {
    blocker: Math.round((counts.blocker / total) * 100),
    major: Math.round((counts.major / total) * 100),
    minor: Math.round((counts.minor / total) * 100),
    nit: Math.round((counts.nit / total) * 100),
  };
}

function computeTopPatterns(entries) {
  const issueCounts = new Map();

  for (const entry of entries) {
    if (!entry.findings_detail || !Array.isArray(entry.findings_detail)) continue;
    for (const finding of entry.findings_detail) {
      if (!finding.issue) continue;
      issueCounts.set(finding.issue, (issueCounts.get(finding.issue) || 0) + 1);
    }
  }

  return [...issueCounts.entries()]
    .map(([issue, count]) => ({ issue, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

function renderBar(value, max) {
  const width = 10;
  const filled = Math.round((value / max) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

function scoreLabel(score) {
  if (score >= 8) return 'strong';
  if (score >= 6) return 'good';
  if (score >= 4) return 'needs work';
  return 'poor';
}

function renderDashboard(stats, days) {
  const lines = [];
  const label = days === 'all' ? 'all time' : `last ${days} days`;
  lines.push(`Prompt Review Stats (${label})`);
  lines.push('\u2550'.repeat(35));
  lines.push('');

  // Reviews
  lines.push(`Reviews:       ${stats.outcomes.total} total`);

  // Outcomes
  const { approved, edited, rejected, total } = stats.outcomes;
  if (total > 0) {
    const pctApproved = Math.round((approved / total) * 100);
    const pctEdited = Math.round((edited / total) * 100);
    const pctRejected = Math.round((rejected / total) * 100);
    lines.push(`Outcomes:      ${approved} approved (${pctApproved}%)  ${edited} edited (${pctEdited}%)  ${rejected} rejected (${pctRejected}%)`);
  }
  lines.push('');

  // Score Trend
  if (stats.scoreTrend && stats.scoreTrend.length > 0) {
    lines.push('Score Trend');
    for (let i = 0; i < stats.scoreTrend.length; i++) {
      const { week, avg } = stats.scoreTrend[i];
      lines.push(`  Week ${i + 1}:     ${avg.toFixed(1)} avg  ${renderBar(avg, 10)}`);
    }
    lines.push('');
  }

  // Subscores
  if (stats.subscores && Object.keys(stats.subscores).length > 0) {
    lines.push('Subscores (current period avg)');

    const ROLE_LABELS = {
      domain_sme: 'Convention',
      security: 'Security',
      clarity: 'Specificity',
      testing: 'Testability',
      frontend_ux: 'UX',
      documentation: 'Docs',
    };

    // Find weakest for annotation
    let weakest = null;
    let weakestScore = Infinity;

    const entries = Object.entries(stats.subscores)
      .sort((a, b) => b[1] - a[1]); // Sort descending

    for (const [role, score] of entries) {
      if (score < weakestScore) {
        weakestScore = score;
        weakest = role;
      }
    }

    for (const [role, score] of entries) {
      const label = ROLE_LABELS[role] || role;
      const padded = (label + ':').padEnd(14);
      const bar = renderBar(score, 10);
      const tag = scoreLabel(score);
      const suffix = role === weakest ? '  \u2190 weakest' : '';
      lines.push(`  ${padded}${score.toFixed(1)}  ${bar}  ${tag}${suffix}`);
    }
    lines.push('');
  }

  // Severity Trend
  if (stats.severityTrend) {
    lines.push('Severity Distribution');
    const { blocker, major, minor, nit } = stats.severityTrend;
    lines.push(`  Blockers:    ${blocker}%`);
    lines.push(`  Major:       ${major}%`);
    lines.push(`  Minor:       ${minor}%`);
    lines.push(`  Nit:         ${nit}%`);
    lines.push('');
  }

  // Top Patterns
  if (stats.topPatterns && stats.topPatterns.length > 0) {
    lines.push('Top Patterns');
    for (let i = 0; i < Math.min(5, stats.topPatterns.length); i++) {
      const { issue, count } = stats.topPatterns[i];
      lines.push(`  ${i + 1}. ${issue.padEnd(35)} (${count} occurrences)`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function renderDashboardJson(stats) {
  return JSON.stringify(stats, null, 2);
}

function generateStats(days) {
  const numDays = days === 'all' ? null : (parseInt(days) || 30);
  const entries = loadLogsFromDisk(numDays);

  const stats = {
    period: days === 'all' ? 'all' : `${numDays}d`,
    outcomes: computeOutcomes(entries),
    scoreTrend: computeScoreTrend(entries),
    subscores: computeSubscoreTrend(entries),
    severityTrend: computeSeverityTrend(entries),
    topPatterns: computeTopPatterns(entries),
  };

  return stats;
}

module.exports = {
  readAuditLogs,
  loadLogsFromDisk,
  computeScoreTrend,
  computeSubscoreTrend,
  computeOutcomes,
  computeSeverityTrend,
  computeTopPatterns,
  renderDashboard,
  renderDashboardJson,
  generateStats,
};
```

**Step 4: Run tests to verify they pass**

Run: `node ~/.claude/plugins/prompt-review/tests/stats.test.cjs`
Expected: `stats.test: all tests passed`

**Step 5: Commit**

```bash
git add -A && git commit -m "feat(prompt-review): add stats module for metrics dashboard"
```

---

### Task 8: Add --stats CLI flag to index.cjs

**Files:**
- Modify: `~/.claude/plugins/prompt-review/index.cjs`

**Step 1: Add stats import**

At the top of `index.cjs`, add after the cost import:

```js
const { generateStats, renderDashboard, renderDashboardJson } = require('./stats.cjs');
```

**Step 2: Add --stats handling to CLI block**

In the `if (require.main === module)` block, add a `--stats` check BEFORE the `--hook` / `--skill` checks (after `const isSkill = args.includes('--skill');`):

```js
  const isStats = args.includes('--stats');
```

Then add this block before `try { let inputData = ... }`:

```js
  if (isStats) {
    const daysArg = args.find(a => a.startsWith('--days'));
    const days = daysArg ? daysArg.split('=')[1] || args[args.indexOf(daysArg) + 1] : '30';
    const isJson = args.includes('--json');
    const stats = generateStats(days);
    if (isJson) {
      console.log(renderDashboardJson(stats));
    } else {
      console.log(renderDashboard(stats, days));
    }
    process.exit(0);
  }
```

**Step 3: Verify --stats flag works**

Run: `node ~/.claude/plugins/prompt-review/index.cjs --stats`
Expected: Dashboard output (will show 0 reviews if no logs yet)

Run: `node ~/.claude/plugins/prompt-review/index.cjs --stats --json`
Expected: JSON output with stats structure

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(prompt-review): add --stats CLI flag for metrics dashboard"
```

---

### Task 9: Create /prompt-review-stats skill

**Files:**
- Create: `~/.claude/skills/prompt-review-stats/SKILL.md`

**Step 1: Create the skill file**

Create `~/.claude/skills/prompt-review-stats/SKILL.md`:

```markdown
---
name: prompt-review-stats
description: Show prompt review quality trends and metrics
user_invocable: true
---

# Prompt Review Stats

Show historical prompt review quality metrics.

## Usage

```
/prompt-review-stats              # last 30 days
/prompt-review-stats 7            # last 7 days
/prompt-review-stats all          # all time
```

## Instructions

1. Determine the time window from the user's argument (default: 30 days)
2. Run the stats CLI:

```bash
node ~/.claude/plugins/prompt-review/index.cjs --stats --days <N>
```

Or for all-time:
```bash
node ~/.claude/plugins/prompt-review/index.cjs --stats --days all
```

For machine-readable output add `--json`.

3. Present the dashboard output to the user
4. If requested, offer insights on:
   - Which review dimensions are improving vs. stagnating
   - Whether the weakest subscore is trending up
   - Most frequent finding patterns (prompt-writing habits to improve)
```

**Step 2: Verify skill file exists and has valid frontmatter**

Run: `node -e "const fs=require('fs'); const c=fs.readFileSync(require('os').homedir()+'/.claude/skills/prompt-review-stats/SKILL.md','utf-8'); console.log(c.startsWith('---') ? 'valid frontmatter' : 'MISSING frontmatter')"`
Expected: `valid frontmatter`

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(prompt-review): add /prompt-review-stats skill"
```

---

### Task 10: Update subscription context to include scoring in critique schema

**Files:**
- Modify: `~/.claude/plugins/prompt-review/index.cjs`

The subscription context (in `buildSubscriptionContext`) includes a Critique Schema section that shows the JSON format. We need to add the `score` field to this schema example so Claude knows to collect it.

**Step 1: Update the critique schema in subscription context**

In `buildSubscriptionContext`, find the JSON schema block and add `"score": 0.0-10.0` to the schema:

Change:
```
  "no_issues": false
}
```

to:
```
  "no_issues": false,
  "score": 0.0-10.0
}
```

**Step 2: Verify hook output includes score field**

Run:
```bash
echo '{"prompt":"test the settings!!!"}' > /tmp/pr-score-test.json
node ~/.claude/plugins/prompt-review/index.cjs --hook < /tmp/pr-score-test.json > /tmp/pr-score-out.json 2>&1
node -e "const d=require('fs').readFileSync('/tmp/pr-score-out.json','utf-8'); const j=JSON.parse(d); console.log(j.additionalContext.includes('score') ? 'score in schema' : 'MISSING score')"
```
Expected: `score in schema`

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(prompt-review): add score field to subscription critique schema"
```

---

### Task 11: Add outcome update support to index.cjs

**Files:**
- Modify: `~/.claude/plugins/prompt-review/index.cjs`
- Modify: `~/.claude/plugins/prompt-review/cost.cjs`

The design doc specifies an `updateAuditOutcome` function that lets the skill update the `outcome` field from `pending` to `approved`/`rejected`/`edited` after the user responds.

**Step 1: Add updateAuditOutcome to cost.cjs**

Add this function to `cost.cjs` before `module.exports`:

```js
function updateAuditOutcome(logDate, promptHash, outcome) {
  const logFile = path.join(__dirname, 'logs', `${logDate}.jsonl`);
  if (!fs.existsSync(logFile)) return false;

  const content = fs.readFileSync(logFile, 'utf-8');
  const lines = content.split('\n');
  let updated = false;

  const newLines = lines.map(line => {
    if (!line.trim()) return line;
    try {
      const entry = JSON.parse(line);
      if (entry.original_prompt_hash === promptHash && entry.outcome === 'pending') {
        entry.outcome = outcome;
        updated = true;
        return JSON.stringify(entry);
      }
    } catch (e) {
      // keep line as-is
    }
    return line;
  });

  if (updated) {
    fs.writeFileSync(logFile, newLines.join('\n'));
  }
  return updated;
}
```

Add `updateAuditOutcome` to `module.exports`.

**Step 2: Export updateOutcome from index.cjs**

Add this function before `module.exports` in `index.cjs`:

```js
function updateOutcome(promptHash, outcome) {
  const { updateAuditOutcome } = require('./cost.cjs');
  const today = new Date().toISOString().slice(0, 10);
  return updateAuditOutcome(today, promptHash, outcome);
}
```

Add `updateOutcome` to `module.exports`.

**Step 3: Verify the module loads**

Run: `node -e "const m = require(require('os').homedir()+'/.claude/plugins/prompt-review/index.cjs'); console.log(typeof m.updateOutcome === 'function' ? 'ok' : 'MISSING')"`
Expected: `ok`

**Step 4: Commit**

```bash
git add -A && git commit -m "feat(prompt-review): add outcome update support for audit log feedback loop"
```

---

### Task 12: Update test fixtures with score fields

**Files:**
- Modify: `~/.claude/plugins/prompt-review/tests/fixtures/critiques.json`

**Step 1: Add score fields to existing fixture critiques**

Update each critique in `critiques.json` to include a `score` field:

- `security_blocker`: add `"score": 2.0` (poor — active risk)
- `clarity_vague`: add `"score": 4.0` (needs work — vague)
- `testing_missing`: add `"score": 3.5` (poor — no tests)
- `domain_sme_clean`: add `"score": 8.5` (good — clean)
- Each entry in `all_clean` array: add `"score": 9.0` (excellent — no issues)

**Step 2: Verify fixtures are valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync(require('os').homedir()+'/.claude/plugins/prompt-review/tests/fixtures/critiques.json','utf-8')); console.log('valid JSON')"`
Expected: `valid JSON`

**Step 3: Commit**

```bash
git add -A && git commit -m "feat(prompt-review): add score fields to test fixture critiques"
```

---

### Task 13: Full test suite run

**Files:** (none — verification only)

**Step 1: Run all test files**

```bash
node ~/.claude/plugins/prompt-review/tests/schema.test.cjs
node ~/.claude/plugins/prompt-review/tests/context.test.cjs
node ~/.claude/plugins/prompt-review/tests/orchestrator.test.cjs
node ~/.claude/plugins/prompt-review/tests/editor.test.cjs
node ~/.claude/plugins/prompt-review/tests/renderer.test.cjs
node ~/.claude/plugins/prompt-review/tests/stats.test.cjs
```

Expected: All 6 test files pass.

**Step 2: Run the test runner**

Run: `node ~/.claude/plugins/prompt-review/tests/run.cjs`
Expected: All test files discovered and passing.

**Step 3: Verify hook path still works end-to-end**

```bash
echo '{"prompt":"test the settings!!!"}' > /tmp/pr-e2e-score.json
node ~/.claude/plugins/prompt-review/index.cjs --hook < /tmp/pr-e2e-score.json > /tmp/pr-e2e-score-out.json 2>&1
node -e "const d=require('fs').readFileSync('/tmp/pr-e2e-score-out.json','utf-8'); const j=JSON.parse(d); console.log('Hook output bytes:', d.length); console.log('Has additionalContext:', !!j.additionalContext); console.log('Has score in schema:', j.additionalContext.includes('score')); console.log('Has scoring section:', j.additionalContext.includes('Scoring'))"
```

Expected:
```
Hook output bytes: ~30000+
Has additionalContext: true
Has score in schema: true
Has scoring section: true
```

**Step 4: Verify stats CLI works**

Run: `node ~/.claude/plugins/prompt-review/index.cjs --stats --days 30`
Expected: Dashboard output (may show 0 reviews)

Run: `node ~/.claude/plugins/prompt-review/index.cjs --stats --json`
Expected: JSON output with stats structure

---

### Task 14: Final commit and summary

**Step 1: Check for any uncommitted changes**

Run: `git status`

If any unstaged changes remain, commit them:

```bash
git add -A && git commit -m "feat(prompt-review): complete scoring and metrics implementation"
```

**Step 2: Summary of all changes**

Files modified:
- `~/.claude/plugins/prompt-review/config.json` — added `scoring` section
- `~/.claude/plugins/prompt-review/schemas.cjs` — optional score field validation (0-10)
- `~/.claude/plugins/prompt-review/reviewers/*.cjs` (all 6) — scoring instructions in system prompts
- `~/.claude/plugins/prompt-review/editor.cjs` — `computeCompositeScore()` function
- `~/.claude/plugins/prompt-review/renderer.cjs` — score line + `↳ Why:` rationale lines
- `~/.claude/plugins/prompt-review/index.cjs` — scoring wiring, `--stats` CLI, `updateOutcome` export, subscription schema update
- `~/.claude/plugins/prompt-review/cost.cjs` — `updateAuditOutcome()` function
- `~/.claude/plugins/prompt-review/tests/fixtures/critiques.json` — score fields in fixtures

Files created:
- `~/.claude/plugins/prompt-review/stats.cjs` — metrics computation + dashboard rendering
- `~/.claude/plugins/prompt-review/tests/stats.test.cjs` — stats module tests
- `~/.claude/skills/prompt-review-stats/SKILL.md` — `/prompt-review-stats` skill
