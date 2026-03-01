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
         └─ else (Tier 2 or 1)
                   │
                   └─ buildProsePrompt()
                      Tier 2: budget-compressed domains/titles
                      Tier 1: raw sanitized arrays (full granularity)

Notes:
  - Anthropic privacy tiers: 4 (stats) > 3 (abstractions) > 2 (compressed) > 1 (full).
  - Tier is set by user in settings (default: 4 for Anthropic, 1 for local).
  - "compressed" is always built when AI is enabled, using the
    promptBudget setting.
  - Local provider always uses Tier 1 — data stays on device.
```

---

## 2. What Each Prompt Tier Sends to the LLM

What data is present (✓) or absent (✗) at each privacy tier.

```
                          Tier 1      Tier 2      Tier 3      Tier 4
                         standard   compressed  classified  deidentified
                        ─────────  ──────────  ──────────  ────────────
Raw URLs                    ✓           ✓           ✗           ✗
Page titles                 ✓           ✓           ✗           ✗
Domain names                ✓           ✓           ✗           ✗
Search query text           ✓           ✓           ✗           ✗
Claude prompt text          ✓           ✓           ✗           ✗
Git commit messages         ✓           ✓           ✗           ✗
Rule-based summary text     ✓ (raw)     ✓ (raw)     ✗ (*)       ✗
Per-event summaries         ✗           ✗           ✓ (*)       ✗
Per-event topics            ✗           ✗           ✓           ✗
Per-event entities          ✗           ✗           ✓           ✗
Activity type labels        ✗           ✗           ✓           ✓ (counts)
Topic frequency dist.       ✗           ✗           ✗           ✓
Temporal cluster labels     ✗           ✗           ✗           ✓ (**)
Entity co-occurrences       ✗           ✗           ✗           ✓
Focus score                 ✗           ✗           ✗           ✓
Recurrence trends           ✗           ✗           ✗           ✓
Knowledge delta counts      ✗           ✗           ✗           ✓
```

(*) Tier 3 per-event summaries are semantically abstracted:
- With LLM classification: AI-generated 1-liners (no raw URLs or titles)
- With rule-based classification (no local model): category-based descriptions
  e.g., "Browsing social media", "Searched for fashion", "Committed authentication changes"
- Raw domain+title strings ("airbnb.com - Your trips - Airbnb") are NOT exposed at Tier 3

(**) Tier 4 temporal cluster topic labels are filtered to remove page-title fragments.
Only semantic vocabulary labels pass through (e.g., "authentication", "job-search",
"software development"). Raw company names and page-title word fragments are blocked
by `filterClusterTopics()` in `patterns.ts`.

**Tier caps (Tier 1/standard):**
- Browser: top 8 domains per category, top 5 titles each
- Searches: top 20 queries
- Claude prompts: top 10, truncated to 120 chars
- Git commits: top 20, truncated to 80 chars

---

## 3. Renderer Output Map — Three-Layer Layout

The note is organized into three visual layers for progressive disclosure.

```
INPUT                                  OUTPUT IN NOTE
══════════════════════════════════════════════════════════════════════════════
                               LAYER 1 — "10-second glance" (always visible)
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
AISummary.tldr (no work_story)    ──►  plain paragraph (fallback)
AISummary.work_story              ──►  plain paragraph (primary)
AISummary.themes                  ──►  **Themes:** `chip` · `chip`

AISummary.notable[]               ──►  ## ✨ Notable
                                       - item

PromptLog[]                       ──►  > [!example]- prompt details (collapsed)

                               LAYER 2 — "Curated insights + actionables"
──────────────────────────────────────────────────────────────────────────────
AISummary.category_summaries      ──►  > [!abstract]- Activity Overview
                                       > | Category | Activity |

AISummary.work_patterns[]         ──►  > [!info]- ⚡ Work Patterns
AISummary.cross_source_connections[] ► > **🔗 Cross-Source Connections**

AISummary.focus_narrative         ──►  > [!example]- 🔭 Cognitive Patterns
AISummary.meta_insights[]         ──►  > **Insights**  - item
AISummary.quirky_signals[]        ──►  > **🔎 Unusual Signals**  - item

KnowledgeSections (AI-on)         ──►  > [!info]- 🧠 Knowledge Insights
                                       > **⏰ Activity Clusters**  - item
                                       > **🗺️ Topic Map**  - item
                                       > **🔗 Entity Relations**  - item
                                       > **🔄 Recurrence Patterns**  - item
                                       > **💡 Knowledge Delta**  - item

AISummary.learnings[]             ──►  > [!todo]- 📚 Learnings
AISummary.remember[]              ──►  > [!todo]- 🗒️ Remember
AISummary.note_seeds[]            ──►  > [!tip]- 🌱 Note Seeds

AISummary.prompts[]               ──►  ## 🪞 Reflection  (open, Dataview fields)
                                       ### Question text
                                       answer_slug::

                               LAYER 3 — "Archive" (raw data, collapsed)
──────────────────────────────────────────────────────────────────────────────
SearchQuery[]                     ──►  > [!info]- 🔍 Searches (N)
                                       > - `engine` **query** — HH:MM

articleClusters                   ──►  > [!info]- 📖 Today I Read About
commitWorkUnits                   ──►  > [!info]- 🔨 Today I Worked On
claudeTaskSessions                ──►  > [!info]- 🤖 Today I Asked Claude About

ClaudeSession[]                   ──►  > [!info]- 🤖 Claude Code / AI Work (N)
                                       > - `project` prompt — HH:MM

CategorizedVisits                 ──►  > [!info]- 🌐 Browser Activity (N visits, M cats)
                                       > - emoji **Category** (N) — top domains
                                       > > [!info]- emoji Category (N)
                                       > > **domain** (N)
                                       > >   - [title](url) — HH:MM

GitCommit[]                       ──►  > [!info]- 📦 Git Activity (N commits)
                                       > **repo** (N commits)
                                       > - `hash` message (+ins/-del) — HH:MM

KnowledgeSections (no-AI)         ──►  ## 🧠 Knowledge Insights (open headings)

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
  Searches, Today I Read About, Today I Worked On,
  Today I Asked Claude About, Task Sessions,
  Claude Code / AI Work, Browser Activity,
  Git Activity, Learnings, Remember, Note Seeds,
  Reflection, Notes

Most sections are now collapsed callouts (no ## heading),
but the set is kept for backward compat with older notes.

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
                              → buildProsePrompt() uses compressed data at Tier 2
                              → buildTierFilteredOptions() selects data per tier

enableClassification    ──► Stage 4: classify.ts LLM enrichment
= false                      → Rule-based classification still runs
                                (classifyEventsRuleOnly produces basic events)
                              → LLM-enriched classification is unavailable
                              → Tier 3 uses rule-based abstractions instead

(patterns always run)   ──► Stage 5+6: patterns.ts + knowledge.ts are invoked
                              → PatternAnalysis populated when there is activity to analyze
                              → Knowledge sections added to notes when patterns produce output
                              → Privacy tier controls what reaches AI prompt

enableAI = false        ──► summarizeDay() not called
                             → AISummary is null
                             → headline, tldr, themes, notable, category
                               summaries, work patterns, reflection all absent

provider = "anthropic"  ──► Privacy tier chain active
                             → Tier resolved by resolvePrivacyTier()
                             → Sanitization always strips to domain+path
provider = "local"      ──► Uses unified prompt with ALL data layers
                             → No privacy escalation — data stays on device
                             → buildUnifiedPrompt() merges raw + classified
                               + patterns into a single prompt

privacyTier             ──► Explicit tier selection in resolvePrivacyTier()
= null (default)             → null: defaults to Tier 4 for Anthropic
= 4                          → Aggregated statistics only
= 3                          → Classified abstractions
= 2                          → Budget-compressed data
= 1                          → Full sanitized context
                             → Clamped to 1–4 range
```
