# Scenario Definitions

## Scenario 1: Cost-Benefit Analysis

**Question:** "Should we use Claude instead of local LLM?"

**Triggered by:** `npm run matrix:scenario:cost-benefit`

### Metrics Generated

| Metric | Calculation | Example |
|--------|-------------|---------|
| Local Quality | Baseline quality score | 87% |
| Claude Quality | Quality with Claude Haiku | 98% |
| Quality Gap | `(Claude - Local) * 100` | +11% |
| Cost Difference | `Claude cost - Local cost` | $0.0012/day |
| Cost per 1% Quality | `Cost / Quality gap` | $0.0001 per 1% gain |

### Decision Logic

- **Recommend Claude** if quality gap > 10%
  - Benefits: Higher summary quality, better work pattern detection, cross-source connections
  - Risks: Ongoing API costs, rate limit dependency

- **Local LLM Sufficient** if quality gap ≤ 10%
  - Benefits: Zero cost, instant processing, on-device privacy
  - Risks: Lower quality summaries, missing subtle patterns

### Audience

- **Product teams** deciding tier inclusion (standard vs. premium)
- **Cost analysts** budgeting for API expenses
- **Privacy-conscious users** choosing local-only mode

---

## Scenario 2: Privacy Audit

**Question:** "Do we comply with privacy requirements for each tier?"

**Triggered by:** `npm run matrix:scenario:privacy-audit`

### Metrics Generated

| Metric | Validation | Pass/Fail |
|--------|-----------|-----------|
| Tier 4 Compliance | No leaks in deidentified output | ✓/✗ |
| Tier 1 Compliance | Sanitization rules applied | ✓/✗ |
| Tier 4 Leak Count | Detected secrets, URLs, commands | 0 |
| Tier 1 Leak Count | Detected forbidden patterns | 0 |

### Decision Logic

- **Pass** if both Tier 4 and Tier 1 are compliant
  - All privacy tiers pass validation
  - Safe for release

- **Fail** if any tier has violations
  - Data exposure risk
  - Regulatory violation potential
  - Block release until fixed

### Leak Detection

Detects:
- **Secrets:** API keys, tokens, JWT patterns
- **URLs:** HTTP(S) links in tier-4-deidentified output
- **Commands:** Shell commands, paths
- **Personal Data:** Unexpected direct identifiers in restricted tiers

### Audience

- **Security teams** validating compliance
- **Legal/compliance** verifying regulations
- **Release managers** preventing data leaks

---

## Scenario 3: Quality Regression Detection

**Question:** "Has quality dropped since last release?"

**Triggered by:** `npm run matrix:scenario:regression`

### Metrics Generated

| Metric | Calculation | Threshold |
|--------|-------------|-----------|
| Previous Quality | Last release baseline | 95% |
| Current Quality | Current run result | 92% |
| Change | `Current - Previous` | -3% |
| Regression Threshold | Acceptable variance | -5% |

### Decision Logic

- **Approve** if `Current > (Previous * 0.95)`
  - Quality within 5% of previous release
  - Safe to merge

- **Block Merge** if `Current < (Previous * 0.95)`
  - Quality regression detected
  - Investigate before release
  - Prevents user experience degradation

### Audience

- **QA teams** monitoring quality trends
- **Release managers** blocking regressions
- **Development leads** tracking quality metrics

---

## Scenario 4: Persona-Specific Quality

**Question:** "Does each user type get appropriate quality?"

**Triggered by:** `npm run matrix:scenario:cost-benefit` (included in results)

### Persona Thresholds

| Persona | Quality Threshold | Rationale |
|---------|------------------|-----------|
| Engineer | ≥85% | Complex work patterns require high accuracy |
| Researcher | ≥75% | Focused research analysis |
| Product Manager | ≥75% | Strategic decision support |
| Student | ≥75% | Learning support |

### Metrics Generated

```
Engineer Quality:   87% ✓ (exceeds 85% threshold)
Researcher Quality: 76% ✓ (meets 75% threshold)
PM Quality:         73% ✗ (below 75% threshold)
Student Quality:    82% ✓ (exceeds 75% threshold)
```

### Decision Logic

- **Approve** if all personas meet their thresholds
  - Tailored user experience confirmed
  - Quality assurance per segment

- **Investigate** if any persona below threshold
  - Poor experience for that user type
  - Prompt adjustments needed
  - Specific patterns to improve

### Customization

Thresholds can be adjusted per deployment:
- Higher for mission-critical personas
- Lower for non-essential use cases
- Adjusted based on user satisfaction feedback

### Audience

- **Product teams** ensuring segment coverage
- **UX teams** verifying user experience quality
- **Data scientists** analyzing persona-specific patterns

---

## Scenario Integration

### Sequential Workflow

1. **Run cost-benefit analysis** → decide if Claude is worth it
2. **Run privacy audit** → ensure data protection
3. **Run regression detection** → verify quality stability
4. **Check persona quality** → ensure all segments served

### CI/CD Integration

All scenarios run automatically in merge gates:

```bash
npm run matrix:ci-gate  # Runs privacy + quality + compliance checks
```

Exit code 0 = all gates pass, proceed to merge
Exit code 1 = gates failed, block merge

### Output Format

Each scenario generates:
- **Decision** — Action to take (recommend, pass/fail, approve/block)
- **Metrics** — Quantitative data supporting the decision
- **Benefits** — Positive impacts of the recommendation
- **Risks** — Potential downsides to consider

---

## Extending Scenarios

New scenarios can be added to `ScenarioReporter` class:

```typescript
generateCustomScenario(results: any[]): ScenarioReport {
  // 1. Extract relevant metrics
  // 2. Apply decision logic
  // 3. Return ScenarioReport with scenario, decision, recommendation, metrics, benefits, risks
}
```

Each scenario should answer a specific business or technical question and provide actionable recommendations.
