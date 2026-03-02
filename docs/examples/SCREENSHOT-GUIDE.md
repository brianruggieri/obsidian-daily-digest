# Screenshot Capture Guide

Screenshots are **fully automated** via WebDriverIO + wdio-obsidian-service.
No manual capture is needed — run the suite and baseline PNGs are regenerated.

## Quick Start

```bash
npm run screenshots:setup   # symlink examples into test vault
npm run screenshots         # run WDIO suite (setup + capture)
```

Output: `tests/screenshots/output/actual/*.png`
Baseline: `tests/screenshots/baseline/*.png`

## Regenerating Example Notes

The 3 example markdown files are generated from persona fixtures via the
real pipeline + renderer. Re-run after any renderer change:

```bash
npm run generate:examples
```

This produces:
- `docs/examples/2025-06-18.md` — deep-focus dev day (with AI)
- `docs/examples/2025-06-19.md` — meeting-heavy PM day (with AI)
- `docs/examples/2025-06-20-no-ai.md` — freelancer day (no AI)

## Screenshot Inventory

### Digest Note Screenshots (5)

| File | Source Note | What It Shows |
|---|---|---|
| `digest-hero.png` | 2025-06-18 | Title + AI summary + notable items |
| `digest-searches-claude.png` | 2025-06-18 | Searches + Claude sessions (expanded) |
| `digest-browser.png` | 2025-06-18 | Browser Activity + Dev & Engineering (expanded) |
| `digest-meeting-day.png` | 2025-06-19 | Meeting-heavy day overview |
| `digest-no-ai.png` | 2025-06-20 | No-AI mode output |

### Settings Panel Screenshots (9)

| File | Preset | What It Shows |
|---|---|---|
| `settings-default.png` | default | First-run / factory state |
| `settings-sources.png` | sourcesExpanded | All data sources enabled |
| `settings-browser-profiles.png` | browserProfiles | Detected browser profiles |
| `settings-privacy-warn.png` | privacyWarn | Privacy warning (Anthropic + all sources) |
| `settings-sanitization.png` | sanitizationExpanded | Privacy section |
| `settings-sensitivity.png` | sensitivityRecommended | Sensitivity filter categories |
| `settings-ai-local.png` | aiLocal | AI with local provider (Ollama) |
| `settings-ai-anthropic.png` | aiAnthropic | AI with Anthropic provider |
| `settings-advanced-ai.png` | advancedPipeline | Advanced section (classification + patterns) |

### Privacy Screenshots (1)

| File | What It Shows |
|---|---|
| `privacy-onboarding.png` | First-run consent modal |

## Architecture

```
tests/screenshots/
├── helpers/
│   ├── screenshot.ts        # capture utilities (scroll, expand, capture)
│   └── settings-presets.ts  # preset configs for settings screenshots
├── specs/
│   ├── privacy.screenshot.ts   # onboarding modal
│   ├── digest.screenshot.ts    # digest note scenarios
│   └── settings.screenshot.ts  # settings panel scenarios
├── baseline/                # committed reference PNGs
├── output/actual/           # latest capture (gitignored)
├── vault/                   # test vault (gitignored, built by setup.sh)
├── setup.sh                 # vault setup + symlinks
└── wdio.conf.ts             # WDIO configuration
```

## Updating Baselines

After verifying new screenshots look correct:

```bash
cp tests/screenshots/output/actual/*.png tests/screenshots/baseline/
```
