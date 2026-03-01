# Pipeline Data Flow

End-to-end data flow from raw collection through Obsidian note rendering.

## Stage Flow

```
╔══════════════════════════════════════════════════════════════════╗
║  SOURCES                                                         ║
║  Browser SQLite ─┐                                               ║
║  Claude JSONL   ─┤  collect/*.ts                                 ║
║  Codex JSONL    ─┤  collectBrowserHistory()                      ║
║  Git log        ─┘  readClaudeSessions() / readCodexSessions()   ║
╚══════════╤═══════════════════════════════════════════════════════╝
           │
           │  BrowserVisit[], SearchQuery[],
           │  ClaudeSession[], GitCommit[]
           ▼
╔══════════════════════════════════════════════════════════════════╗
║  STAGE 1 — raw                                                   ║
╚══════════╤═══════════════════════════════════════════════════════╝
           │  same types
           ▼
╔══════════════════════════════════════════════════════════════════╗
║  STAGE 2 — sanitized                           sanitize.ts       ║
║  • 15+ regex patterns scrub API keys, JWTs,    sensitivity.ts    ║
║    tokens, emails from URLs/titles/commands                      ║
║  • 419-domain sensitivity filter removes or                      ║
║    redacts adult, gambling, health, etc.                         ║
╚══════════╤═══════════════════════════════════════════════════════╝
           │  BrowserVisit[], SearchQuery[],
           │  ClaudeSession[], GitCommit[]
           │  + filtered: number
           ▼
╔══════════════════════════════════════════════════════════════════╗
║  STAGE 3 — categorized                         categorize.ts     ║
║  • Rule-based domain → category mapping                          ║
║    (work, dev, social, news, shopping, …)                        ║
╚══════════╤═══════════════════════════════════════════════════════╝
           │  CategorizedVisits  (Record<string, BrowserVisit[]>)
           │  + SearchQuery[], etc. pass through
           ▼
╔══════════════════════════════════════════════════════════════════╗
║  STAGE 4 — classified                          classify.ts       ║
║  • Rule-based (always) + optional local LLM                      ║
║  • Each event → activityType, topics[],                          ║
║    entities[], intent, confidence                                ║
╚══════════╤═══════════════════════════════════════════════════════╝
           │  ClassificationResult
           │  { events: StructuredEvent[], totalProcessed,
           │    llmClassified, ruleClassified }
           ▼
╔══════════════════════════════════════════════════════════════════╗
║  STAGE 5 — patterns                            patterns.ts       ║
║  • Statistical analysis — no LLM calls                           ║
║  • Temporal clusters, topic co-occurrence,                       ║
║    entity relations, focus score, peak hours                     ║
╚══════════╤═══════════════════════════════════════════════════════╝
           │  PatternAnalysis
           │  { temporalClusters[], topicCooccurrences[],
           │    entityRelations[], focusScore, peakHours[], … }
           ▼
╔══════════════════════════════════════════════════════════════════╗
║  STAGE 6 — knowledge                           knowledge.ts      ║
║  • Converts patterns into human-readable text                    ║
║  • focusSummary, temporalInsights, topicMap,                     ║
║    entityGraph, recurrenceNotes                                  ║
╚══════════╤═══════════════════════════════════════════════════════╝
           │  KnowledgeSections  (text + structured arrays)
           │
     ┌─────┴──────────────────────────────────────────────┐
     │                                                     │
     ▼   (tier routing based on privacy settings)          │
╔══════════════════════════════════════════════════════════╗│
║  STAGE 7 — prompt                    summarize.ts        ║│
║  Tier 1: standard — full sanitized data                  ║│
║  Tier 2: compressed — token-budget-proportional          ║│
║  Tier 3: classified — abstracted event types only        ║│
║  Tier 4: deidentified — aggregated statistics only,      ║│
║          no per-event data                               ║│
║                                                          ║│
║  prompts/*.txt templates + fillTemplate()                ║│
╚══════════╤═══════════════════════════════════════════════╝│
           │  string (prompt text)                          │
           ▼                                                │
╔══════════════════════════════════════════════════════════╗│
║  STAGE 8 — summary                   ai-client.ts        ║│
║  • Anthropic API  (requestUrl)                           ║│
║  • Local model    (fetch to localhost)                   ║│
║  → JSON parsed into AISummary                            ║│
╚══════════╤═══════════════════════════════════════════════╝│
           │  AISummary                                     │
           │  { headline, tldr, themes[], notable[],        │
           │    category_summaries, questions[],            │
           │    work_patterns?, cross_source_connections? } │
           │                                                │
           └──────────────────────┐◄────────────────────────┘
                                  │ (or null if no AI)
                                  ▼
╔══════════════════════════════════════════════════════════════════╗
║  STAGE 9 — rendered                            renderer.ts       ║
║  • Frontmatter + Dataview fields                                 ║
║  • [!tip] headline callout                                       ║
║  • [!abstract] TL;DR callout                                     ║
║  • Category summary table                                        ║
║  • Browser / search / Claude / git sections                      ║
║  • Work patterns + cross-source connections                      ║
║  • Knowledge insights section                                    ║
╚══════════╤═══════════════════════════════════════════════════════╝
           │  string (Markdown)
           ▼
╔══════════════════════════════════════════════════════════════════╗
║  STAGE 10 — merge                              merge.ts          ║
║  • Safe write to Obsidian vault                                  ║
║  • Timestamped backup if note already exists                     ║
║  • Preserves user-authored content blocks                        ║
╚══════════════════════════════════════════════════════════════════╝
```

## Inspect CLI

Any stage above can be observed with the pipeline inspector:

```bash
cd .worktrees/feat-pipeline-inspector
npx tsx --tsconfig tsconfig.scripts.json scripts/inspect.ts \
  --stage <name> \
  --format json|md|stats \
  --data-mode real|fixtures \
  --date YYYY-MM-DD \
  --out <file>
```

Available stages: `raw`, `sanitized`, `categorized`, `classified`, `patterns`, `knowledge`, `prompt`, `summary`, `rendered`
