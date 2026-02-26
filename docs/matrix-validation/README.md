# Matrix Validation

Real-world decision scenarios backed by data: Cost analysis, privacy audits, quality regression detection, and persona-specific quality assurance.

## Quick Commands

### Cost Analysis
Compare provider costs across different time horizons:
```bash
npm run matrix:cost-analysis
```

**Output:** Per-run, daily, monthly, and annual cost projections for each provider with recommendations.

### Privacy Audit
Validate privacy compliance across all tiers:
```bash
npm run matrix:scenario:privacy-audit
```

**Output:** Privacy violation report with tier-specific status and leak counts.

### Regression Detection
Check for quality regressions since last release:
```bash
npm run matrix:scenario:regression
```

**Output:** Quality delta analysis with decision (approve/block-merge).

### CI Gate Check
Automated validation gate for merge pipelines:
```bash
npm run matrix:ci-gate
```

**Output:** Pass/fail status for privacy, quality, and compliance checks. Exit code 0 = pass, 1 = fail.

### Cost-Benefit Analysis
Should we use Claude instead of local LLM?
```bash
npm run matrix:scenario:cost-benefit
```

**Output:** Recommendation with quality gap, cost difference, and risk/benefit analysis.

## Real-World Scenarios

Matrix validation generates actionable reports for 4 key decision points:

1. **Cost-Benefit Analysis** — "Is Claude worth $0.04/day vs. local LLM?"
   - Quality gap analysis
   - Cost-per-quality-point calculation
   - Risk/benefit summary
   - Recommended tier selection

2. **Privacy Audit** — "Do we comply with privacy requirements?"
   - Tier 1 & Tier 4 compliance status
   - Leak count per tier
   - Regulatory risk assessment
   - Safe-for-release decision

3. **Quality Regression** — "Has quality dropped since last release?"
   - Current vs. previous quality comparison
   - Quality delta with 5% threshold
   - Block/approve decision
   - Investigation recommendations

4. **Persona-Specific Quality** — "Does each user type get appropriate quality?"
   - Per-persona quality thresholds
   - Engineer (≥85%), others (≥75%)
   - Segment-specific experience assessment
   - Prompt adjustment recommendations

## Integration

### GitHub Actions CI/CD
Add to `.github/workflows/test.yml`:
```yaml
- name: Matrix validation gate
  run: npm run matrix:ci-gate
```

Blocks merges if privacy leaks, quality drops, or compliance fails.

### Release Notes
Validation metrics are automatically included in release notes, showing:
- Quality improvements from last release
- Cost-effectiveness data
- Privacy compliance verification
- Persona coverage across user segments

## Environment Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ANTHROPIC_API_KEY` | string | — | API key for Claude Haiku |
| `SCENARIO` | string | — | Specific scenario to run (cost-benefit, privacy-audit, regression) |

## See Also

- `SCENARIOS.md` — Detailed scenario definitions and metrics
- `SETTINGS-UI-TEMPLATE.html` — UI template for settings integration
- `.claude/MATRIX_VALIDATOR_USAGE.md` — Complete Matrix Validator guide
