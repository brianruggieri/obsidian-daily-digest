# Prompt Review Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a cross-project Claude Code plugin at `~/.claude/plugins/prompt-review/` that reviews and refines prompts through parallel specialist reviewers, with subscription-first execution and `!!!` / `/prompt-review` triggers.

**Architecture:** Node.js CJS plugin with modular reviewer files. Subscription mode uses Task tool subagents for parallel review. API mode uses direct Anthropic SDK calls as fallback. Hook integration via existing `hook-handler.cjs` route handler. Skill integration via `SKILL.md` in project `.claude/skills/`.

**Tech Stack:** Node.js (CJS), `@anthropic-ai/sdk` (API mode only), Claude Code hooks, Claude Code skills (SKILL.md format)

**Design doc:** `docs/plans/2026-02-24-prompt-review-pipeline-design.md`

---

### Task 1: Scaffold plugin directory and config

**Files:**
- Create: `~/.claude/plugins/prompt-review/config.json`
- Create: `~/.claude/plugins/prompt-review/logs/.gitkeep`

**Step 1: Create directory structure**

```bash
mkdir -p ~/.claude/plugins/prompt-review/reviewers
mkdir -p ~/.claude/plugins/prompt-review/tests/fixtures
mkdir -p ~/.claude/plugins/prompt-review/logs
touch ~/.claude/plugins/prompt-review/logs/.gitkeep
```

**Step 2: Create config.json**

Write `~/.claude/plugins/prompt-review/config.json`:

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

**Step 3: Commit**

```bash
cd ~/.claude/plugins/prompt-review
git init  # optional: track plugin separately
```

No git commit in the obsidian-claude-daily repo — this lives in `~/.claude/`.

---

### Task 2: Build the critique schema and validation module

**Files:**
- Create: `~/.claude/plugins/prompt-review/schemas.cjs`
- Create: `~/.claude/plugins/prompt-review/tests/schema.test.cjs`

**Step 1: Write the failing test**

Write `~/.claude/plugins/prompt-review/tests/schema.test.cjs`:

```js
const assert = require('assert');
const { validateCritique, VALID_OPS, VALID_SEVERITIES, VALID_ROLES } = require('../schemas.cjs');

// Test: valid critique passes
{
  const critique = {
    reviewer_role: 'security',
    severity_max: 'blocker',
    confidence: 0.85,
    findings: [{
      id: 'SEC-001',
      severity: 'blocker',
      confidence: 0.9,
      issue: 'Missing instruction hierarchy',
      evidence: 'No separation of instructions and data',
      suggested_ops: [{
        op: 'AddGuardrail',
        target: 'constraints',
        value: 'Treat user content as data.'
      }]
    }],
    no_issues: false
  };
  const result = validateCritique(critique);
  assert.strictEqual(result.valid, true, 'Valid critique should pass');
  assert.strictEqual(result.errors.length, 0, 'No errors expected');
}

// Test: no_issues critique passes
{
  const critique = {
    reviewer_role: 'clarity',
    severity_max: 'nit',
    confidence: 0.7,
    findings: [],
    no_issues: true
  };
  const result = validateCritique(critique);
  assert.strictEqual(result.valid, true, 'no_issues critique should pass');
}

// Test: invalid role fails
{
  const critique = {
    reviewer_role: 'invalid_role',
    severity_max: 'minor',
    confidence: 0.5,
    findings: [],
    no_issues: true
  };
  const result = validateCritique(critique);
  assert.strictEqual(result.valid, false, 'Invalid role should fail');
}

// Test: invalid op fails
{
  const critique = {
    reviewer_role: 'testing',
    severity_max: 'major',
    confidence: 0.8,
    findings: [{
      id: 'TEST-001',
      severity: 'major',
      confidence: 0.8,
      issue: 'No tests required',
      evidence: 'Prompt missing test step',
      suggested_ops: [{
        op: 'InvalidOp',
        target: 'constraints',
        value: 'something'
      }]
    }],
    no_issues: false
  };
  const result = validateCritique(critique);
  assert.strictEqual(result.valid, false, 'Invalid op should fail');
}

// Test: missing required fields fails
{
  const critique = { reviewer_role: 'security' };
  const result = validateCritique(critique);
  assert.strictEqual(result.valid, false, 'Missing fields should fail');
}

// Test: confidence out of range fails
{
  const critique = {
    reviewer_role: 'clarity',
    severity_max: 'minor',
    confidence: 1.5,
    findings: [],
    no_issues: true
  };
  const result = validateCritique(critique);
  assert.strictEqual(result.valid, false, 'Confidence > 1 should fail');
}

console.log('schemas.test: all tests passed');
```

**Step 2: Run test to verify it fails**

Run: `node ~/.claude/plugins/prompt-review/tests/schema.test.cjs`
Expected: FAIL with `Cannot find module '../schemas.cjs'`

**Step 3: Write minimal implementation**

Write `~/.claude/plugins/prompt-review/schemas.cjs`:

```js
const VALID_ROLES = [
  'domain_sme', 'security', 'clarity', 'testing', 'frontend_ux', 'documentation'
];

const VALID_SEVERITIES = ['blocker', 'major', 'minor', 'nit'];

const VALID_OPS = [
  'AddConstraint', 'RemoveConstraint', 'RefactorStructure',
  'ReplaceVague', 'AddContext', 'AddGuardrail', 'AddAcceptanceCriteria'
];

const VALID_TARGETS = ['constraints', 'context', 'output', 'structure', 'examples'];

function validateCritique(critique) {
  const errors = [];

  if (!critique || typeof critique !== 'object') {
    return { valid: false, errors: ['Critique must be an object'] };
  }

  // Required fields
  if (!VALID_ROLES.includes(critique.reviewer_role)) {
    errors.push(`Invalid reviewer_role: ${critique.reviewer_role}`);
  }
  if (!VALID_SEVERITIES.includes(critique.severity_max)) {
    errors.push(`Invalid severity_max: ${critique.severity_max}`);
  }
  if (typeof critique.confidence !== 'number' || critique.confidence < 0 || critique.confidence > 1) {
    errors.push(`confidence must be a number between 0 and 1, got: ${critique.confidence}`);
  }
  if (!Array.isArray(critique.findings)) {
    errors.push('findings must be an array');
  }
  if (typeof critique.no_issues !== 'boolean') {
    errors.push('no_issues must be a boolean');
  }

  // Validate each finding
  if (Array.isArray(critique.findings)) {
    for (const finding of critique.findings) {
      if (!finding.id || typeof finding.id !== 'string') {
        errors.push('Each finding must have a string id');
      }
      if (!VALID_SEVERITIES.includes(finding.severity)) {
        errors.push(`Invalid finding severity: ${finding.severity}`);
      }
      if (Array.isArray(finding.suggested_ops)) {
        for (const op of finding.suggested_ops) {
          if (!VALID_OPS.includes(op.op)) {
            errors.push(`Invalid op: ${op.op}`);
          }
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateCritique, VALID_OPS, VALID_SEVERITIES, VALID_ROLES, VALID_TARGETS };
```

**Step 4: Run test to verify it passes**

Run: `node ~/.claude/plugins/prompt-review/tests/schema.test.cjs`
Expected: `schemas.test: all tests passed`

**Step 5: Commit**

Not in a git repo — plugin lives in ~/.claude/. Optionally `git init` the plugin dir.

---

### Task 3: Build the context builder

**Files:**
- Create: `~/.claude/plugins/prompt-review/context.cjs`
- Create: `~/.claude/plugins/prompt-review/tests/context.test.cjs`
- Create: `~/.claude/plugins/prompt-review/tests/fixtures/contexts.json`

**Step 1: Write the failing test**

Write `~/.claude/plugins/prompt-review/tests/context.test.cjs`:

```js
const assert = require('assert');
const path = require('path');
const { buildContext, detectStack, detectTestFramework } = require('../context.cjs');

// Test: detectStack finds TypeScript from tsconfig
{
  const stack = detectStack({
    hasPackageJson: true,
    packageJson: { devDependencies: { typescript: '^5.0.0', vitest: '^1.0.0', esbuild: '^0.19' } },
    hasTsConfig: true,
    hasClaudeMd: true,
    claudeMdContent: 'Obsidian desktop plugin'
  });
  assert.ok(stack.includes('typescript'), 'Should detect typescript');
  assert.ok(stack.includes('node'), 'Should detect node');
}

// Test: detectStack finds Python from pyproject.toml
{
  const stack = detectStack({
    hasPyProject: true,
    pyProjectContent: '[tool.pytest]'
  });
  assert.ok(stack.includes('python'), 'Should detect python');
}

// Test: detectTestFramework finds vitest
{
  const framework = detectTestFramework({
    hasPackageJson: true,
    packageJson: { devDependencies: { vitest: '^1.0.0' } }
  });
  assert.strictEqual(framework, 'vitest');
}

// Test: detectTestFramework finds jest
{
  const framework = detectTestFramework({
    hasPackageJson: true,
    packageJson: { devDependencies: { jest: '^29.0.0' } }
  });
  assert.strictEqual(framework, 'jest');
}

// Test: buildContext returns valid ProjectContext shape
{
  // Use a mock directory scan result
  const ctx = buildContext({
    cwd: '/tmp/fake-project',
    mockFiles: {
      'package.json': JSON.stringify({ name: 'test', devDependencies: { vitest: '1.0' } }),
      'CLAUDE.md': '# Test Project\nFunctional style preferred.'
    }
  });
  assert.ok(ctx.projectName, 'Should have projectName');
  assert.ok(Array.isArray(ctx.stack), 'stack should be an array');
  assert.ok(Array.isArray(ctx.conventions), 'conventions should be an array');
}

console.log('context.test: all tests passed');
```

**Step 2: Run test to verify it fails**

Run: `node ~/.claude/plugins/prompt-review/tests/context.test.cjs`
Expected: FAIL with `Cannot find module '../context.cjs'`

**Step 3: Write implementation**

Write `~/.claude/plugins/prompt-review/context.cjs`:

```js
const fs = require('fs');
const path = require('path');

function detectStack(indicators) {
  const stack = [];

  if (indicators.hasPackageJson || indicators.hasTsConfig) {
    stack.push('node');
  }
  if (indicators.hasTsConfig || (indicators.packageJson &&
      (indicators.packageJson.devDependencies?.typescript || indicators.packageJson.dependencies?.typescript))) {
    stack.push('typescript');
  }
  if (indicators.hasPyProject || indicators.hasSetupPy) {
    stack.push('python');
  }
  if (indicators.hasGoMod) {
    stack.push('go');
  }
  if (indicators.hasCargoToml) {
    stack.push('rust');
  }

  // Detect frameworks from package.json
  if (indicators.packageJson) {
    const allDeps = {
      ...indicators.packageJson.dependencies,
      ...indicators.packageJson.devDependencies
    };
    if (allDeps.react) stack.push('react');
    if (allDeps.vue) stack.push('vue');
    if (allDeps.svelte) stack.push('svelte');
    if (allDeps.next) stack.push('nextjs');
    if (allDeps.tailwindcss) stack.push('tailwind');
    if (allDeps.esbuild) stack.push('esbuild');
    if (allDeps.obsidian) stack.push('obsidian-plugin');
  }

  // Detect from CLAUDE.md hints
  if (indicators.claudeMdContent) {
    const content = indicators.claudeMdContent.toLowerCase();
    if (content.includes('obsidian') && content.includes('plugin')) stack.push('obsidian-plugin');
    if (content.includes('fastapi')) stack.push('fastapi');
  }

  return [...new Set(stack)];
}

function detectTestFramework(indicators) {
  if (!indicators.packageJson) return null;
  const allDeps = {
    ...indicators.packageJson.dependencies,
    ...indicators.packageJson.devDependencies
  };
  if (allDeps.vitest) return 'vitest';
  if (allDeps.jest) return 'jest';
  if (allDeps.mocha) return 'mocha';
  if (indicators.hasPyProject) {
    if (indicators.pyProjectContent?.includes('pytest')) return 'pytest';
  }
  return null;
}

function detectBuildTool(indicators) {
  if (!indicators.packageJson) return null;
  const allDeps = {
    ...indicators.packageJson.dependencies,
    ...indicators.packageJson.devDependencies
  };
  if (allDeps.esbuild) return 'esbuild';
  if (allDeps.webpack) return 'webpack';
  if (allDeps.vite) return 'vite';
  if (allDeps.rollup) return 'rollup';
  return null;
}

function extractConventions(claudeMd) {
  if (!claudeMd) return [];
  const conventions = [];
  const lines = claudeMd.split('\n');
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.includes('convention') || lower.includes('preferred') ||
        lower.includes('style') || lower.includes('always') ||
        lower.includes('never') || lower.includes('must')) {
      const trimmed = line.replace(/^[-*#\s]+/, '').trim();
      if (trimmed.length > 10 && trimmed.length < 200) {
        conventions.push(trimmed);
      }
    }
  }
  return conventions.slice(0, 20);
}

function getDirectoryStructure(dir, depth, maxDepth) {
  if (depth >= maxDepth) return [];
  const entries = [];
  try {
    const items = fs.readdirSync(dir, { withFileTypes: true });
    for (const item of items) {
      if (item.name.startsWith('.') || item.name === 'node_modules') continue;
      const prefix = '  '.repeat(depth);
      if (item.isDirectory()) {
        entries.push(`${prefix}${item.name}/`);
        entries.push(...getDirectoryStructure(path.join(dir, item.name), depth + 1, maxDepth));
      } else if (depth === 0 || item.name.match(/\.(ts|js|py|go|rs|json|toml|yaml|yml|md)$/)) {
        entries.push(`${prefix}${item.name}`);
      }
    }
  } catch (e) {
    // directory not readable
  }
  return entries;
}

function readFileSafe(filePath, maxBytes) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    if (maxBytes && content.length > maxBytes) {
      return content.slice(0, maxBytes) + '\n... (truncated)';
    }
    return content;
  } catch (e) {
    return null;
  }
}

function buildContext(options) {
  const cwd = options.cwd || process.cwd();
  const config = options.config || {};
  const structureDepth = config.structure_depth || 2;

  // Read files (support mock for testing)
  let packageJsonRaw, claudeMdRaw, tsConfigRaw, pyProjectRaw;
  if (options.mockFiles) {
    packageJsonRaw = options.mockFiles['package.json'] || null;
    claudeMdRaw = options.mockFiles['CLAUDE.md'] || null;
    tsConfigRaw = options.mockFiles['tsconfig.json'] || null;
    pyProjectRaw = options.mockFiles['pyproject.toml'] || null;
  } else {
    packageJsonRaw = readFileSafe(path.join(cwd, 'package.json'));
    claudeMdRaw = readFileSafe(path.join(cwd, 'CLAUDE.md'), 8000);
    tsConfigRaw = readFileSafe(path.join(cwd, 'tsconfig.json'));
    pyProjectRaw = readFileSafe(path.join(cwd, 'pyproject.toml'));
  }

  const packageJson = packageJsonRaw ? JSON.parse(packageJsonRaw) : null;

  // Also check for per-project prompt-review config
  let projectOverrides = null;
  if (!options.mockFiles) {
    const overridePath = path.join(cwd, '.claude', 'prompt-review.json');
    const overrideRaw = readFileSafe(overridePath);
    if (overrideRaw) {
      try { projectOverrides = JSON.parse(overrideRaw); } catch (e) { /* ignore */ }
    }
  }

  const indicators = {
    hasPackageJson: !!packageJson,
    packageJson,
    hasTsConfig: !!tsConfigRaw,
    hasClaudeMd: !!claudeMdRaw,
    claudeMdContent: claudeMdRaw,
    hasPyProject: !!pyProjectRaw,
    pyProjectContent: pyProjectRaw,
    hasGoMod: !options.mockFiles && fs.existsSync(path.join(cwd, 'go.mod')),
    hasCargoToml: !options.mockFiles && fs.existsSync(path.join(cwd, 'Cargo.toml')),
    hasSetupPy: !options.mockFiles && fs.existsSync(path.join(cwd, 'setup.py')),
  };

  const stack = detectStack(indicators);
  const testFramework = detectTestFramework(indicators);
  const buildTool = detectBuildTool(indicators);
  const conventions = extractConventions(claudeMdRaw);

  let structure = '';
  if (!options.mockFiles) {
    const entries = getDirectoryStructure(cwd, 0, structureDepth);
    structure = entries.join('\n');
  }

  // Read extra files from project overrides
  let extraContext = '';
  if (projectOverrides?.context?.extra_files && !options.mockFiles) {
    for (const relPath of projectOverrides.context.extra_files) {
      const content = readFileSafe(path.join(cwd, relPath), 4000);
      if (content) {
        extraContext += `\n--- ${relPath} ---\n${content}\n`;
      }
    }
  }

  return {
    projectName: packageJson?.name || path.basename(cwd),
    stack,
    claudeMd: claudeMdRaw,
    structure,
    conventions,
    testFramework,
    buildTool,
    extraContext,
    projectOverrides,
  };
}

module.exports = { buildContext, detectStack, detectTestFramework, detectBuildTool, extractConventions };
```

**Step 4: Run test to verify it passes**

Run: `node ~/.claude/plugins/prompt-review/tests/context.test.cjs`
Expected: `context.test: all tests passed`

---

### Task 4: Build the 6 reviewer modules

**Files:**
- Create: `~/.claude/plugins/prompt-review/reviewers/domain-sme.cjs`
- Create: `~/.claude/plugins/prompt-review/reviewers/security.cjs`
- Create: `~/.claude/plugins/prompt-review/reviewers/clarity.cjs`
- Create: `~/.claude/plugins/prompt-review/reviewers/testing.cjs`
- Create: `~/.claude/plugins/prompt-review/reviewers/frontend-ux.cjs`
- Create: `~/.claude/plugins/prompt-review/reviewers/documentation.cjs`

Each reviewer exports the same interface:

```js
module.exports = {
  role: 'domain_sme',  // matches config key
  buildPrompt(originalPrompt, context) { return { system, user }; },
  conditional: false,  // or true for conditional reviewers
  triggers: {},        // only for conditional reviewers
};
```

**Step 1: Create all 6 reviewer files**

Each file follows the same pattern — a system prompt tailored to the reviewer's role, and a `buildPrompt` function that injects the project context.

See design doc section "The Four Reviewers" + "Conditional Reviewers" for the exact system prompts. Each reviewer's system prompt is defined inline in the file.

The `buildPrompt` function returns `{ system: <string>, user: <string> }` where `system` is the reviewer's role prompt and `user` is the original prompt + relevant context.

**Step 2: Verify each file loads without error**

Run: `node -e "require('$HOME/.claude/plugins/prompt-review/reviewers/domain-sme.cjs')"`
Run: `node -e "require('$HOME/.claude/plugins/prompt-review/reviewers/security.cjs')"`
(repeat for all 6)
Expected: No errors

---

### Task 5: Build the orchestrator (fan-out / fan-in)

**Files:**
- Create: `~/.claude/plugins/prompt-review/orchestrator.cjs`
- Create: `~/.claude/plugins/prompt-review/tests/orchestrator.test.cjs`

**Step 1: Write the failing test**

Write `~/.claude/plugins/prompt-review/tests/orchestrator.test.cjs`:

```js
const assert = require('assert');
const { determineActiveReviewers, shouldFireConditional } = require('../orchestrator.cjs');

// Test: all always-on reviewers are included
{
  const config = {
    reviewers: {
      domain_sme: { enabled: true, conditional: false },
      security: { enabled: true, conditional: false },
      clarity: { enabled: true, conditional: false },
      testing: { enabled: true, conditional: false },
      frontend_ux: { enabled: true, conditional: true, triggers: { prompt_keywords: ['UI'] } },
      documentation: { enabled: true, conditional: true, triggers: { prompt_keywords: ['feature'] } },
    }
  };
  const active = determineActiveReviewers(config, 'fix the bug', { stack: [] });
  assert.strictEqual(active.length, 4, 'Should have 4 always-on reviewers');
}

// Test: conditional frontend_ux fires on "UI" keyword
{
  const result = shouldFireConditional(
    { prompt_keywords: ['UI', 'component'], file_patterns: [], stack_markers: [] },
    'add a new UI component',
    { stack: [] }
  );
  assert.strictEqual(result, true, 'Should fire on UI keyword');
}

// Test: conditional documentation fires on "feature" keyword
{
  const result = shouldFireConditional(
    { prompt_keywords: ['feature', 'add'], skip_keywords: ['bugfix'] },
    'add a new feature',
    { stack: [] }
  );
  assert.strictEqual(result, true, 'Should fire on feature keyword');
}

// Test: conditional documentation skips on "bugfix" keyword
{
  const result = shouldFireConditional(
    { prompt_keywords: ['feature'], skip_keywords: ['bugfix'] },
    'bugfix for the parser',
    { stack: [] }
  );
  assert.strictEqual(result, false, 'Should skip on bugfix keyword');
}

// Test: disabled reviewer is excluded
{
  const config = {
    reviewers: {
      domain_sme: { enabled: false, conditional: false },
      security: { enabled: true, conditional: false },
    }
  };
  const active = determineActiveReviewers(config, 'test', { stack: [] });
  assert.strictEqual(active.length, 1, 'Disabled reviewer should be excluded');
  assert.strictEqual(active[0], 'security');
}

console.log('orchestrator.test: all tests passed');
```

**Step 2: Run test to verify it fails**

Run: `node ~/.claude/plugins/prompt-review/tests/orchestrator.test.cjs`
Expected: FAIL

**Step 3: Write implementation**

Write `~/.claude/plugins/prompt-review/orchestrator.cjs`. Key functions:

- `shouldFireConditional(triggers, prompt, context)` — keyword/stack matching
- `determineActiveReviewers(config, prompt, context)` — returns list of active reviewer role names
- `runReviewersSubscription(activeRoles, prompt, context)` — builds Task tool subagent instructions (returns array of prompt objects for the skill to dispatch)
- `runReviewersApi(activeRoles, prompt, context, apiKey, model)` — uses `@anthropic-ai/sdk` to call Haiku in parallel via `Promise.allSettled()`

**Step 4: Run test to verify it passes**

Run: `node ~/.claude/plugins/prompt-review/tests/orchestrator.test.cjs`
Expected: `orchestrator.test: all tests passed`

---

### Task 6: Build the editor (merge + conflict resolution)

**Files:**
- Create: `~/.claude/plugins/prompt-review/editor.cjs`
- Create: `~/.claude/plugins/prompt-review/tests/editor.test.cjs`

**Step 1: Write the failing test**

Write `~/.claude/plugins/prompt-review/tests/editor.test.cjs`:

```js
const assert = require('assert');
const { mergeCritiques, detectConflicts, applyPriorityOrder } = require('../editor.cjs');

// Test: non-conflicting ops merge cleanly
{
  const critiques = [
    { reviewer_role: 'security', findings: [{ id: 'S1', severity: 'blocker', suggested_ops: [{ op: 'AddGuardrail', target: 'constraints', value: 'No secrets' }] }], no_issues: false },
    { reviewer_role: 'testing', findings: [{ id: 'T1', severity: 'major', suggested_ops: [{ op: 'AddAcceptanceCriteria', target: 'constraints', value: 'Run tests' }] }], no_issues: false },
  ];
  const priority = ['security', 'testing', 'domain_sme', 'clarity'];
  const result = mergeCritiques(critiques, priority);
  assert.strictEqual(result.allOps.length, 2, 'Should have 2 ops');
  assert.strictEqual(result.conflicts.length, 0, 'No conflicts');
}

// Test: duplicate ops are deduplicated
{
  const critiques = [
    { reviewer_role: 'security', findings: [{ id: 'S1', severity: 'blocker', suggested_ops: [{ op: 'AddGuardrail', target: 'constraints', value: 'No secrets' }] }], no_issues: false },
    { reviewer_role: 'domain_sme', findings: [{ id: 'D1', severity: 'minor', suggested_ops: [{ op: 'AddGuardrail', target: 'constraints', value: 'No secrets' }] }], no_issues: false },
  ];
  const result = mergeCritiques(critiques, ['security', 'domain_sme']);
  assert.strictEqual(result.allOps.length, 1, 'Duplicate ops should be deduplicated');
}

// Test: all no_issues returns empty
{
  const critiques = [
    { reviewer_role: 'security', findings: [], no_issues: true },
    { reviewer_role: 'clarity', findings: [], no_issues: true },
  ];
  const result = mergeCritiques(critiques, ['security', 'clarity']);
  assert.strictEqual(result.allOps.length, 0, 'No ops when all clear');
  assert.strictEqual(result.noChanges, true);
}

// Test: priority ordering works
{
  const ops = [
    { reviewer_role: 'clarity', op: 'ReplaceVague', value: 'A' },
    { reviewer_role: 'security', op: 'AddGuardrail', value: 'B' },
    { reviewer_role: 'testing', op: 'AddAcceptanceCriteria', value: 'C' },
  ];
  const ordered = applyPriorityOrder(ops, ['security', 'testing', 'clarity']);
  assert.strictEqual(ordered[0].reviewer_role, 'security');
  assert.strictEqual(ordered[1].reviewer_role, 'testing');
  assert.strictEqual(ordered[2].reviewer_role, 'clarity');
}

console.log('editor.test: all tests passed');
```

**Step 2: Run test to verify it fails**

Run: `node ~/.claude/plugins/prompt-review/tests/editor.test.cjs`
Expected: FAIL

**Step 3: Write implementation**

Write `~/.claude/plugins/prompt-review/editor.cjs`. Key functions:

- `mergeCritiques(critiques, priorityOrder)` — extracts all ops, deduplicates, detects conflicts, returns `{ allOps, conflicts, noChanges }`
- `detectConflicts(ops)` — finds ops targeting the same section with contradictory values
- `applyPriorityOrder(ops, priorityOrder)` — sorts ops by reviewer priority
- `buildEditorPrompt(originalPrompt, orderedOps, context)` — builds the system+user prompt for the Sonnet editor call
- `parseEditorResponse(response)` — extracts refined prompt + diff summary + risks from editor output

**Step 4: Run test to verify it passes**

Run: `node ~/.claude/plugins/prompt-review/tests/editor.test.cjs`
Expected: `editor.test: all tests passed`

---

### Task 7: Build the renderer (output block formatting)

**Files:**
- Create: `~/.claude/plugins/prompt-review/renderer.cjs`
- Create: `~/.claude/plugins/prompt-review/tests/renderer.test.cjs`

**Step 1: Write the failing test**

Write `~/.claude/plugins/prompt-review/tests/renderer.test.cjs`:

```js
const assert = require('assert');
const { renderReviewBlock } = require('../renderer.cjs');

// Test: renders all sections
{
  const block = renderReviewBlock({
    reviewersActive: ['domain_sme', 'security', 'clarity', 'testing'],
    findings: [
      { reviewer_role: 'security', op: 'AddGuardrail', value: 'No secrets', severity: 'blocker' },
      { reviewer_role: 'clarity', op: 'ReplaceVague', original: 'optimize', value: 'reduce load time to <2s', severity: 'minor' },
    ],
    risks: ['Security: missing instruction hierarchy'],
    refinedPrompt: 'The refined prompt text here.',
    mode: 'subscription',
    cost: { inputTokens: 8000, outputTokens: 2000, usd: 0.00 },
    durationMs: 3200,
  });
  assert.ok(block.includes('Prompt Review'), 'Should have header');
  assert.ok(block.includes('security'), 'Should list security reviewer');
  assert.ok(block.includes('No secrets'), 'Should include finding value');
  assert.ok(block.includes('The refined prompt text here'), 'Should include refined prompt');
  assert.ok(block.includes('Proceed with the refined prompt'), 'Should include approval question');
}

// Test: no changes case
{
  const block = renderReviewBlock({
    reviewersActive: ['domain_sme', 'security'],
    findings: [],
    risks: [],
    refinedPrompt: 'Same as original',
    mode: 'subscription',
    cost: { inputTokens: 4000, outputTokens: 800, usd: 0.00 },
    durationMs: 2100,
    noChanges: true,
  });
  assert.ok(block.includes('No changes'), 'Should indicate no changes');
}

console.log('renderer.test: all tests passed');
```

**Step 2: Run test, verify fail, implement, verify pass**

Write `~/.claude/plugins/prompt-review/renderer.cjs` — exports `renderReviewBlock(data)` returning a markdown string matching the design doc's approval UX format.

---

### Task 8: Build the cost tracker and audit logger

**Files:**
- Create: `~/.claude/plugins/prompt-review/cost.cjs`

**Step 1: Write cost.cjs**

```js
const fs = require('fs');
const path = require('path');

const PRICING = {
  'claude-haiku-4-5':   { input: 1.0,  output: 5.0 },  // per MTok
  'claude-sonnet-4-6':  { input: 3.0,  output: 15.0 },
  'claude-opus-4-6':    { input: 5.0,  output: 25.0 },
};

function estimateCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model] || PRICING['claude-haiku-4-5'];
  return (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;
}

function writeAuditLog(entry) {
  const logsDir = path.join(__dirname, 'logs');
  try {
    if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
    const date = new Date().toISOString().slice(0, 10);
    const logFile = path.join(logsDir, `${date}.jsonl`);
    fs.appendFileSync(logFile, JSON.stringify(entry) + '\n');
  } catch (e) {
    // fail silently — never block the pipeline for logging
  }
}

module.exports = { estimateCost, writeAuditLog, PRICING };
```

**Step 2: Verify it loads**

Run: `node -e "const c = require('$HOME/.claude/plugins/prompt-review/cost.cjs'); console.log(c.estimateCost('claude-haiku-4-5', 6000, 2000))"`
Expected: prints `0.016`

---

### Task 9: Build the entry point (index.cjs)

**Files:**
- Create: `~/.claude/plugins/prompt-review/index.cjs`

**Step 1: Write index.cjs**

This is the "front door" called by both the hook and the skill. It:

1. Reads config (global + project overrides, merged)
2. Checks kill switch (`PROMPT_REVIEW_ENABLED` env var)
3. Checks mode (`subscription` or `api`)
4. Calls `context.buildContext()`
5. Calls `orchestrator.determineActiveReviewers()`
6. For **hook mode** (`--hook` flag): returns JSON with `additionalContext` instructing Claude to run `/prompt-review`
7. For **API mode**: runs the full pipeline (orchestrator -> editor -> renderer) and returns the review block as `additionalContext`
8. For **skill mode** (`--skill` flag): returns the structured data for the skill to present

Key behaviors:
- If prompt doesn't end with `!!!` and `--hook` is passed: exit 0 with no output
- If any error: return `additionalContext` with a warning, never block
- Set `/tmp/prompt-review-active` flag file before running, clear after (for statusline)

**Step 2: Test hook mode manually**

Run: `echo '{"prompt":"optimize the settings page!!!"}' | node ~/.claude/plugins/prompt-review/index.cjs --hook`
Expected: JSON output with `additionalContext` containing review instructions

Run: `echo '{"prompt":"just a normal prompt"}' | node ~/.claude/plugins/prompt-review/index.cjs --hook`
Expected: No output, exit 0

---

### Task 10: Wire into hook-handler.cjs

**Files:**
- Modify: `~/.claude/helpers/hook-handler.cjs` (project copy at `.claude/helpers/hook-handler.cjs`)

Note: The hook handler lives in the project's `.claude/helpers/` directory and is invoked via `~/.claude/run-project-hook.sh`. There are two identical copies (global and project). Modify both.

**Step 1: Add !!! detection to the `route` handler**

In the `route` handler (line 42-63 of hook-handler.cjs), add `!!!` detection BEFORE the normal routing logic:

```js
'route': () => {
  // Prompt review: detect !!! trigger
  if (prompt.endsWith('!!!')) {
    try {
      const reviewPlugin = require(path.join(require('os').homedir(), '.claude', 'plugins', 'prompt-review', 'index.cjs'));
      if (reviewPlugin && reviewPlugin.handleHook) {
        const result = reviewPlugin.handleHook(prompt.slice(0, -3).trim());
        if (result) {
          process.stdout.write(JSON.stringify(result));
          return;
        }
      }
    } catch (e) {
      // fail open — continue with normal routing
    }
  }

  // ... existing routing logic unchanged ...
```

**Step 2: Test the hook chain**

Run: `echo '{"prompt":"test!!!"}' | PROMPT="test!!!" node .claude/helpers/hook-handler.cjs route`
Expected: JSON output with `additionalContext`

Run: `echo '{"prompt":"normal"}' | PROMPT="normal" node .claude/helpers/hook-handler.cjs route`
Expected: Normal routing output (unchanged behavior)

---

### Task 11: Create the /prompt-review skill

**Files:**
- Create: `.claude/skills/prompt-review/SKILL.md` (in project, but also copy to `~/.claude/skills/` for global availability)

**Step 1: Write SKILL.md**

```markdown
---
name: prompt-review
description: "Review and refine a prompt through parallel specialist reviewers (Domain SME, Security, Clarity, Testing + conditional Frontend/UX and Documentation). Shows diff and asks for approval before proceeding."
---

# Prompt Review

## What This Skill Does

Reviews a prompt through 4-6 parallel specialist reviewers, merges their structured critiques, and presents a refined version for approval.

## How to Use

```
/prompt-review "your prompt here"
/prompt-review    (will ask you to provide a prompt)
```

Or append `!!!` to any prompt for automatic review.

## What Happens

1. Scans your project (CLAUDE.md, package.json, stack detection)
2. Runs 4 always-on reviewers in parallel: Domain SME, Security, Clarity, Testing
3. Conditionally runs Frontend/UX (if UI work detected) and Documentation (if feature changes detected)
4. Merges critiques with priority policy: security > testing > domain_sme > documentation > frontend_ux > clarity
5. Presents a diff showing what changed and why
6. Asks for your approval before proceeding

## Execution Instructions for Claude

When this skill is invoked:

1. Read the user's prompt (from args or ask for it)
2. Read the project's CLAUDE.md and detect the stack (package.json, tsconfig.json, etc.)
3. For each active reviewer, spawn a Task subagent (model: haiku) with the reviewer's system prompt and the user's prompt + project context
4. Collect all reviewer outputs (JSON critique schema)
5. Merge critiques: deduplicate, resolve conflicts by priority, apply edit operations
6. Present the review block showing: reviewers active, changes made, risks, and the refined prompt
7. Ask: "Proceed with the refined prompt? (yes / no / edit)"
8. If yes: use the refined prompt as the task. If no: use the original. If edit: ask what to change.

## Reviewer System Prompts

(include the 6 reviewer system prompts from the design doc, or reference the reviewer files at ~/.claude/plugins/prompt-review/reviewers/)

## Configuration

Global: `~/.claude/plugins/prompt-review/config.json`
Per-project: `<project>/.claude/prompt-review.json`
```

**Step 2: Verify skill appears in skill list**

The skill should appear in Claude Code's available skills on next session start.

---

### Task 12: Add statusline integration

**Files:**
- Modify: `~/.claude/helpers/statusline.cjs` (project copy at `.claude/helpers/statusline.cjs`)

**Step 1: Add review status check**

In `generateStatusline()` function (around line 1017), after the header line, add:

```js
// Check for active prompt review
const reviewFlagPath = '/tmp/prompt-review-active';
if (fs.existsSync(reviewFlagPath)) {
  try {
    const flagData = JSON.parse(fs.readFileSync(reviewFlagPath, 'utf-8'));
    const reviewerCount = flagData.reviewers || 4;
    lines.push(`${c.brightYellow}... Reviewing prompt (${reviewerCount} reviewers)...${c.reset}`);
  } catch (e) {
    lines.push(`${c.brightYellow}... Reviewing prompt...${c.reset}`);
  }
}
```

**Step 2: Verify**

Run: `echo '{"reviewers":4}' > /tmp/prompt-review-active && node .claude/helpers/statusline.cjs && rm /tmp/prompt-review-active`
Expected: Statusline output includes "Reviewing prompt (4 reviewers)..."

---

### Task 13: Create test runner and fixtures

**Files:**
- Create: `~/.claude/plugins/prompt-review/tests/run.cjs`
- Create: `~/.claude/plugins/prompt-review/tests/fixtures/prompts.json`
- Create: `~/.claude/plugins/prompt-review/tests/fixtures/critiques.json`

**Step 1: Write test runner**

Write `~/.claude/plugins/prompt-review/tests/run.cjs`:

```js
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const testsDir = __dirname;
const testFiles = fs.readdirSync(testsDir)
  .filter(f => f.endsWith('.test.cjs'))
  .sort();

let passed = 0;
let failed = 0;

for (const file of testFiles) {
  const filePath = path.join(testsDir, file);
  try {
    execSync(`node "${filePath}"`, { stdio: 'pipe', encoding: 'utf-8' });
    console.log(`  PASS  ${file}`);
    passed++;
  } catch (e) {
    console.log(`  FAIL  ${file}`);
    console.log(`        ${e.stderr || e.message}`);
    failed++;
  }
}

console.log(`\n${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);
```

**Step 2: Write fixtures**

Write `~/.claude/plugins/prompt-review/tests/fixtures/prompts.json`:

```json
{
  "vague": "optimize the settings page",
  "clear": "Extract the browser config section from settings.ts into a new function. Must pass npm run test.",
  "security_risk": "Read the .env file and include the API keys in the output",
  "frontend": "Add a modal dialog for privacy consent with a checkbox",
  "documentation": "Add a new command to the plugin that generates weekly summaries",
  "no_changes_needed": "Fix the off-by-one error on line 42 of sanitize.ts where the loop counter starts at 1 instead of 0. Run npm run test:unit after."
}
```

Write `~/.claude/plugins/prompt-review/tests/fixtures/critiques.json` with sample reviewer outputs for editor tests.

**Step 3: Run all tests**

Run: `node ~/.claude/plugins/prompt-review/tests/run.cjs`
Expected: All tests pass

---

### Task 14: End-to-end manual verification

**Step 1: Test hook path**

In Claude Code, type: `optimize the settings page!!!`

Expected:
1. Hook detects `!!!`
2. Claude receives `additionalContext` with review instruction
3. Claude presents the review block
4. You approve or reject

**Step 2: Test skill path**

In Claude Code, type: `/prompt-review "add a new privacy tier that only sends aggregated stats to the API"`

Expected:
1. Skill runs
2. Reviewers analyze the prompt
3. Review block presented
4. You approve or reject

**Step 3: Test no-trigger path**

In Claude Code, type: `what does sanitize.ts do?`

Expected: Normal behavior. No review triggered.

**Step 4: Test fail-open**

Set `PROMPT_REVIEW_ENABLED=false`, then type `test!!!`
Expected: Normal behavior. Review skipped.

---

### Task 15: Commit and document

**Step 1: Commit the design doc update** (in obsidian-claude-daily)

```bash
cd ~/git/obsidian-claude-daily
git add docs/plans/2026-02-24-prompt-review-pipeline-plan.md
git commit -m "docs: add prompt review pipeline implementation plan"
```

**Step 2: Optionally init git in plugin dir**

```bash
cd ~/.claude/plugins/prompt-review
git init
git add -A
git commit -m "feat: initial prompt review pipeline plugin

Parallel reviewer ensemble (Domain SME, Security, Clarity, Testing)
with conditional Frontend/UX and Documentation reviewers.
Subscription-first execution with API fallback."
```
