# Pipeline Diagrams

Supplementary diagrams for `pipeline-data-flow.md`.

---

## 1. Privacy Tier Decision Tree

How `summarizeDay()` in `src/summarize/summarize.ts` selects which prompt to build.

```
summarizeDay() called
         │
         ├─ patterns available AND provider === "anthropic"?
         │         │
         │         ├─ YES ──► Tier 4: deidentified
         │         │          buildDeidentifiedPrompt()
         │         │          Aggregated stats only.
         │         │          maxTokens = 1500
         │         │
         │         └─ NO
         │
         ├─ classification available (events.length > 0)
         │  AND provider === "anthropic"?
         │         │
         │         ├─ YES ──► Tier 3: classified
         │         │          buildClassifiedPrompt()
         │         │          Per-event abstractions only.
         │         │
         │         └─ NO
         │
         ├─ provider === "local"?
         │         │
         │         ├─ YES ──► Local: unified
         │         │          buildUnifiedPrompt()
         │         │          All available data layers combined.
         │         │          No privacy escalation — data stays on device.
         │         │          maxTokens = 1500 if patterns available
         │         │
         │         └─ NO
         │
         ├─ ragConfig.enabled?
         │         │
         │         ├─ YES ── chunks > 2 AND totalTokens > 500?
         │         │                │
         │         │         ┌─ YES ┴── NO ───────────┐
         │         │         │                         │
         │         │  retrieveRelevantChunks()    standardPrompt()
         │         │  succeeds?                        │
         │         │         │                         │
         │         │  ┌─ YES ┴── NO (error) ──┐       │
         │         │  │                       │       │
         │         │  RAG               standardPrompt()
         │         │  buildRAGPrompt()                │
         │         │  Top-K chunks only.              │
         │         │                                   │
         │         └─ NO ─────────────────────────────┘
         │
         └─ else (fallback)
                   │
                   └─ standardPrompt()
                      compressed data available?
                             │
                      ┌─ YES ┴── NO ──────────┐
                      │                        │
               Tier 2: compressed       Tier 1: standard
               buildCompressedPrompt()  buildPrompt()
               Budget-proportional.     Fixed-cap slicing.

Notes:
  - Anthropic privacy escalation: Tier 4 > Tier 3 > (RAG or standard).
    RAG is NOT part of the Anthropic escalation chain — it is a
    separate opt-in path that applies when neither patterns nor
    classification are available.
  - "compressed" is always built when AI is enabled, using the
    promptBudget setting. standardPrompt() prefers it when available.
  - Local provider receives ALL data layers in a single unified prompt.
```

---

## 2. What Each Prompt Tier Sends to the LLM

What data is present (✓) or absent (✗) at each privacy tier.

```
                          Tier 1      Tier 2       RAG        Tier 3      Tier 4
                         standard   compressed     rag       classified  deidentified
                        ─────────  ──────────  ──────────  ──────────  ────────────
Raw URLs                    ✓           ✓           ✓           ✗           ✗
Page titles                 ✓           ✓           ✓           ✗           ✗
Domain names                ✓           ✓           ✓           ✗           ✗
Search query text           ✓           ✓           ✓           ✗           ✗
Claude prompt text          ✓           ✓           ✓           ✗           ✗
Git commit messages         ✓           ✓           ✓           ✗           ✗
Per-event summaries         ✗           ✗           ✗           ✓           ✗
Per-event topics            ✗           ✗           ✗           ✓           ✗
Per-event entities          ✗           ✗           ✗           ✓           ✗
Activity type labels        ✗           ✗           ✗           ✓           ✓ (counts)
Topic frequency dist.       ✗           ✗           ✗           ✗           ✓
Temporal cluster labels     ✗           ✗           ✗           ✗           ✓
Entity co-occurrences       ✗           ✗           ✗           ✗           ✓
Focus score                 ✗           ✗           ✗           ✗           ✓
Recurrence trends           ✗           ✗           ✗           ✗           ✓
Knowledge delta counts      ✗           ✗           ✗           ✗           ✓
```

**Tier caps (Tier 1/standard):**
- Browser: top 8 domains per category, top 5 titles each
- Searches: top 20 queries
- Claude prompts: top 10, truncated to 120 chars
- Git commits: top 20, truncated to 80 chars

---

## 3. Renderer Output Map

What each input produces in the final Obsidian note. Order matches document order top-to-bottom.

```
INPUT                                  OUTPUT IN NOTE
──────────────────────────────────────────────────────────────────────────────
date                              ──►  frontmatter: date, day
CategorizedVisits (keys)          ──►  frontmatter: categories[], tags[]
AISummary.themes                  ──►  frontmatter: themes[], tags[]
KnowledgeSections.tags            ──►  frontmatter: tags[]
AISummary.prompts                 ──►  frontmatter: prompts[]
KnowledgeSections.focusScore      ──►  frontmatter: focus_score
gitCommits.length                 ──►  frontmatter: git-commits

date                              ──►  # 📅 Monday, February 23, 2026  (title)

visits.length                     ──►  ┐
searches.length                   ──►  ├─  > [!info] N visits · N searches · …
claudeSessions.length             ──►  │
gitCommits.length                 ──►  │
categorized key count             ──►  ┘

AISummary.headline                ──►  > [!tip] headline
AISummary.tldr                    ──►  > [!abstract] tldr
AISummary.themes                  ──►  **Themes:** `chip` · `chip`

AISummary.notable[]               ──►  ## ✨ Notable
                                       - item

AISummary.category_summaries      ──►  | Category | Activity |
                                       | --- | --- |
                                       | label | summary |

AISummary.work_patterns[]         ──►  ## ⚡ Work Patterns
                                       - pattern

AISummary.cross_source_connections[] ► ### 🔗 Cross-Source Connections
                                       > [!note] connection

AISummary.focus_narrative         ──►  ## 🔭 Cognitive Patterns
AISummary.meta_insights[]         ──►    ### Insights  - item
AISummary.quirky_signals[]        ──►    ### 🔎 Unusual Signals  - item

KnowledgeSections.focusSummary    ──►  ## 🧠 Knowledge Insights
KnowledgeSections.temporalInsights ─►    ### ⏰ Activity Clusters  - item
KnowledgeSections.topicMap        ──►    ### 🗺️ Topic Map  - item
KnowledgeSections.entityGraph     ──►    ### 🔗 Entity Relations  - item
KnowledgeSections.recurrenceNotes ──►    ### 🔄 Recurrence Patterns  - item
KnowledgeSections.knowledgeDeltaLines ►  ### 💡 Knowledge Delta  - item

SearchQuery[]                     ──►  ## 🔍 Searches
                                       - `engine` **query** — HH:MM

ClaudeSession[]                   ──►  ## 🤖 Claude Code / AI Work
                                       - `project` prompt — HH:MM

CategorizedVisits                 ──►  ## 🌐 Browser Activity
                                       ### emoji Category (N)
                                       **domain** (N)
                                         - [title](url) — HH:MM

GitCommit[]                       ──►  ## 📦 Git Activity
                                       ### repo (N commits)
                                       - `hash` message (+ins/-del) — HH:MM

AISummary.prompts[]               ──►  ## 🪞 Reflection
                                       ### Question text
                                       answer_slug::

(static)                          ──►  ## 📝 Notes
                                       > _Add your reflections here_

aiProviderUsed                    ──►  *Generated by Daily Digest. AI by Anthropic…*
                                            (or "processed locally" / "no data sent")
```

---

## 4. Merge Safety Flow

What happens when `src/plugin/main.ts` writes a note to the vault.

```
Write note for date X
         │
         ▼
Does note already exist at path?
         │
    NO ──┴── YES
    │         │
    │         ▼
    │    createBackup()
    │    Writes original to:
    │    .daily-digest-backup/
    │      YYYY-MM-DD.TIMESTAMP.bak.md
    │         │
    │         ▼
    │    extractUserContent(existingNote)
    │         │
    │    ┌────┴────────────────┐
    │  Parse                Parse
    │  succeeded             failed
    │    │                    │
    │    ▼                    ▼
    │  structuredMerge()   fallbackMerge()
    │         │            Appends full old file
    │         │            under:
    │         │            ## Previous Content (preserved)
    │         │            > The previous version could not
    │         │            > be automatically merged…
    │         │
    │    Has notesText?
    │    ─ YES → replace NOTES_PLACEHOLDER with notesText
    │
    │    Has reflectionAnswers?
    │    ─ YES → scan new note line by line
    │            match answer_<id>:: fields
    │            fill saved values in place
    │
    │    Has customSections?
    │    ─ YES → find last "---" in new note
    │            insert custom sections before it
    │            (or append if no footer found)
    │
    ├────────────────────────────────────────┘
    │
    ▼
Write merged (or new) note to vault

─────────────────────────────────────────────────────────
Generated headings (never treated as user content):
  Notable, Cognitive Patterns, Knowledge Insights,
  Searches, Claude Code / AI Work, Browser Activity,
  Git Activity, Reflection, Notes

Any ## heading NOT in the above set → treated as
user-authored custom section and preserved.
```

---

## 5. Settings → Pipeline Stage Enable Map

Which settings gate which pipeline stages. Disabled stages are skipped entirely; downstream stages that depend on them receive `undefined` or empty collections.

```
SETTING                     GATES
────────────────────────────────────────────────────────────────────────────
enableBrowser = false   ──► BrowserVisit[] is empty → no categorized data
                             → no browser section in note
                             → no browser-based classification events

enableClaude = false    ──► ClaudeSession[] is empty → no AI Work section
enableCodex = false     ──► (same — both feed ClaudeSession[])

enableGit = false       ──► GitCommit[] is empty → no Git Activity section
                             → git not included in prompt

enableSanitization      ──► Stage 2: sanitize.ts scrubs secrets
= false                      ⚠ Raw secrets may reach AI prompt if disabled

enableSensitivity       ──► Stage 2: sensitivity.ts domain filter
Filter = false               ⚠ Private domains may reach AI prompt if disabled

promptBudget            ──► Controls token budget for compressActivity()
= 3000 (default)             → CompressedActivity always built when AI enabled
                              → standardPrompt() uses compressed if available
                                (Tier 2: buildCompressedPrompt())
                              → Falls back to buildPrompt() if compressed absent
                                (Tier 1: fixed-cap slicing)

enableClassification    ──► Stage 4: classify.ts runs
= false                      → ClassificationResult is undefined
                              → Tier 3 (classified prompt) is unavailable
                              → Anthropic falls back to standard (not RAG)

enablePatterns          ──► Stage 5+6: patterns.ts + knowledge.ts run
= false                      → PatternAnalysis is undefined
                              → Tier 4 (deidentified prompt) is unavailable
                              → Knowledge Insights section absent from note
                              → focus_score absent from frontmatter
                              → Anthropic falls back to classified or standard

enableRAG = false       ──► RAG path skipped in summarize.ts
                             → even if chunks available, standard used
                             → NOTE: RAG is independent of Anthropic
                               escalation chain — it applies only when
                               neither patterns nor classification matched

enableAI = false        ──► summarizeDay() not called
                             → AISummary is null
                             → headline, tldr, themes, notable, category
                               summaries, work patterns, reflection all absent

provider = "anthropic"  ──► Privacy escalation chain active
                             → deidentified > classified > standard
                             → RAG is NOT part of this chain; it is a
                               separate opt-in path below classified
provider = "local"      ──► Uses unified prompt with ALL data layers
                             → No privacy escalation — data stays on device
                             → buildUnifiedPrompt() merges raw + classified
                               + patterns into a single prompt
```
