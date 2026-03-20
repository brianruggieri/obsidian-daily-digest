---
name: "📊 Common Misspellings Tracker — Personal Typo Dashboard"
about: "Track your recurring typos over time and watch yourself improve (or not)"
title: "feat: 📊 Common Misspellings Tracker — Personal Typo Dashboard"
labels: enhancement, fun-feedback
---

## 📊 Common Misspellings Tracker — Your Personal Typo Dashboard

### The Idea

While the [Blooper Reel](#funny-misspellings) captures the *funniest* typos, this feature is the analytical counterpart — a **longitudinal tracker** of your most persistent misspellings. Think of it as a typing fitness tracker that shows your patterns, progress, and persistent blind spots over weeks and months.

Everyone has "that one word" they can never type correctly. Let's find yours.

### What This Tracks

#### 1. Recurring Misspelling Patterns
Track specific words you consistently misspell:

```markdown
> [!bar-chart] 📊 Your Typo Tendencies
>
> | Word | Your Versions | Occurrences | Streak |
> |------|--------------|-------------|--------|
> | authentication | `athentication`, `autentication`, `authenticaiton` | 23 times | 12 days |
> | asynchronous | `asynchornous`, `asychronous`, `asyncronous` | 18 times | 8 days |
> | dependency | `depenency`, `dependancy`, `dependecy` | 15 times | ongoing |
> | environment | `enviroment`, `enviornment` | 12 times | 6 days |
> | middleware | `middlewear`, `midleware` | 9 times | 4 days |
```

#### 2. Typo Categories — Your Typing Fingerprint 🔍
Classify your misspellings into pattern types to reveal your "typing fingerprint":

- **Transpositions** (swapping adjacent letters): `teh` → `the`, `adn` → `and`
- **Omissions** (dropping a letter): `enviroment` → `environment`, `depenency` → `dependency`
- **Insertions** (extra letter): `dependeency`, `autthentication`
- **Substitutions** (wrong letter): `dependancy` → `dependency` (a→e)
- **Phonetic** (spelling by sound): `asyncronous` → `asynchronous`, `autentication` → `authentication`
- **Double-letter confusion**: `occurence` vs `occurrence`, `refering` vs `referring`

Show a breakdown:
```markdown
> [!info] Your Typing Fingerprint
> 🔀 Transpositions: 34% — your fingers are faster than your brain
> ✂️ Omissions: 28% — you're an efficient (too efficient) typist
> 🔤 Phonetic: 22% — you spell how you speak
> ➕ Insertions: 10% — occasionally enthusiastic
> 🔁 Double-letter: 6% — English is hard, honestly
```

#### 3. Progress Tracking — Are You Getting Better?
Track improvement (or regression!) over time:

```markdown
> [!success] Typing Progress Report
> ✅ **Conquered:** You haven't misspelled "response" in 14 days! 🎉
> 📈 **Improving:** "kubernetes" — down from 5/week to 1/week
> 📊 **Stable:** "authentication" — still averaging 2 typos/day
> 📉 **Regressing:** "asynchronous" — getting worse? Take a breath! 😅
> 🆕 **New struggle:** "serialization" appeared 4 times this week
```

#### 4. Time-of-Day & Fatigue Correlation
Cross-reference typo frequency with time of day:

```markdown
> [!warning] Typo Fatigue Analysis
> Your typo rate increases 340% after 10pm! 🌙
>
> ⏰ Peak accuracy: 10am - 12pm (1.2 typos/hour)
> 😴 Peak sloppiness: 11pm - 1am (5.3 typos/hour)
>
> 💡 Suggestion: Maybe stop coding after midnight?
>   (We both know you won't, but we tried.)
```

#### 5. Source-Specific Patterns
Different contexts trigger different typos:

```markdown
> [!note] Where You Typo Most
> 🔍 Search queries: 4.2% error rate (you type fast when frustrated)
> 🤖 AI prompts: 2.8% error rate (you're slightly more careful)
> 📦 Commit messages: 6.1% error rate (you just want to ship it)
```

### Implementation Architecture

#### New Module: `src/analyze/typo-tracker.ts`

```typescript
interface TypoRecord {
  intended: string;           // The word they meant
  actual: string;            // What they typed
  source: 'search' | 'ai' | 'git';
  timestamp: number;
  category: TypoCategory;
}

type TypoCategory =
  | 'transposition'    // adjacent letter swap
  | 'omission'        // missing letter
  | 'insertion'       // extra letter
  | 'substitution'    // wrong letter
  | 'phonetic'        // spelled by sound
  | 'double-letter'   // double/single confusion
  | 'unknown';

interface TypoProfile {
  topMisspelledWords: MisspelledWord[];
  typingFingerprint: Record<TypoCategory, number>;  // percentage breakdown
  dailyRate: number;           // typos per day
  hourlyDistribution: number[]; // 24 slots, typo count per hour
  conqueredWords: string[];     // words not misspelled in 14+ days
  newStruggles: string[];       // words appearing in last 7 days
  fatigueCorrelation: number;   // how much worse after 10pm
  sourceBreakdown: Record<string, number>;
}

interface MisspelledWord {
  word: string;
  variants: string[];          // all the ways you've misspelled it
  totalOccurrences: number;
  firstSeen: string;           // ISO date
  lastSeen: string;
  trend: 'improving' | 'stable' | 'regressing' | 'conquered' | 'new';
  streakDays: number;          // consecutive days with this typo
}
```

#### Persistence: `typo-history.json`
Store historical typo data in the plugin's data directory:
```json
{
  "version": 1,
  "words": {
    "authentication": {
      "variants": ["athentication", "autentication", "authenticaiton"],
      "occurrences": [
        { "date": "2025-03-01", "count": 3, "variant": "athentication" },
        { "date": "2025-03-02", "count": 1, "variant": "autentication" }
      ],
      "firstSeen": "2025-01-15",
      "conqueredDate": null
    }
  },
  "dailyStats": {
    "2025-03-09": {
      "totalTypos": 12,
      "hourlyDistribution": [0,0,0,0,0,0,0,1,2,3,2,1,0,1,0,0,0,0,1,0,1,0,0,0],
      "sourceBreakdown": { "search": 5, "ai": 4, "git": 3 }
    }
  }
}
```

### The Dev-Aware Dictionary

A critical component shared with the Blooper Reel feature:

**Sources to build from:**
1. **Base English dictionary** — standard ~50k common English words
2. **Programming terms** — curated list of 500+ dev terms (async, middleware, kubernetes, serialization, etc.)
3. **Framework/tool names** — React, Vue, Angular, Docker, Terraform, etc.
4. **Abbreviations allowlist** — npm, api, css, html, etc. (not typos!)
5. **User's custom allowlist** — words specific to their projects/domain

**Lightweight approach (recommended):**
- Ship a curated list of ~200 "commonly misspelled programming words" with their known variants
- Match against this list first (fast, high precision)
- For unknown words, use simple edit-distance against the dev dictionary
- No heavy NLP library needed — just Levenshtein distance + the curated list

### Rendering in the Digest

Two modes depending on available data:

**Daily mode** (in each digest):
```markdown
> [!bar-chart]- 📊 Typo Dashboard
> *Today's typing report*
>
> **Top typos today:**
> - "athentication" ×3 (you've done this 23 times total 🏅)
> - "depenency" ×2 (your oldest nemesis — 47 days and counting)
>
> **Typo rate:** 3.1% (slightly better than your average of 3.4%!)
> **Best hour:** 10am (zero typos for 90 minutes — nice!)
> **Worst hour:** 11pm (4 typos in 20 minutes — go to bed! 😴)
```

**Weekly/monthly mode** (for periodic rollups):
```markdown
## 📊 Weekly Typo Report

### Conquests 🎉
- ✅ "response" — not misspelled once this week!
- ✅ "deployment" — finally mastered after 3 weeks

### Hall of Persistence 😅
- 🔁 "authentication" — 14 misspellings this week (new record?)
- 🔁 "asynchronous" — 8 misspellings, stable

### New Arrivals
- 🆕 "serialization" — appeared 6 times this week
- 🆕 "concatenation" — 4 times (who can blame you)

### Your Trend
📈 Overall accuracy improved 0.3% this week!
🏆 You've conquered 12 words total since tracking began.
```

### Fun Expansion Ideas

- **"Word of the Week" challenge**: Highlight one word to focus on not misspelling
- **Typing games integration**: Link to typing practice for your specific problem words
- **"Misspelling DNA"**: Unique visual fingerprint of your typo patterns (could be a fun ASCII art)
- **Cross-device comparison**: If you use multiple machines, compare typo rates
- **"The Typo That Got Away"**: When a misspelling makes it into a commit that gets merged to main
- **Collaborative mode** (very future): Anonymous team typo leaderboard — "Your team's most misspelled word this sprint is 'authentication' (47 total instances)"
- **Autocorrect suggestions**: Generate a personal autocorrect dictionary from your patterns — export to your IDE/OS
- **Achievement system**: "Conquered 10 words!", "30-day streak of improving accuracy!", "Zero typos in commit messages today!"
- **Developer vocabulary growth**: Track new technical terms you start using (not just typos) — shows learning over time
- **The "Typo Twins" wall**: Words you mix up with each other (`affect` vs `effect`, `than` vs `then`)

### Relationship to Blooper Reel

This feature and the [Blooper Reel](funny-misspellings.md) are complementary:

| | Blooper Reel 🤣 | Typo Dashboard 📊 |
|---|---|---|
| **Focus** | Entertainment | Self-improvement |
| **Timeframe** | Today's funniest | Longitudinal trends |
| **Selection** | Comedy score | Frequency & persistence |
| **Tone** | "LOL look at this" | "Here's your pattern" |
| **Data** | One-off gems | Recurring struggles |

They share the **same detection engine** (`typo-detector.ts`) but differ in what they surface and why. The Blooper Reel is the dessert; the Typo Dashboard is the nutritional label.

### Settings

```typescript
interface TypoDashboardConfig {
  enableTypoDashboard: boolean;    // default: true
  trackHistory: boolean;           // default: true (persist across days)
  conqueredThresholdDays: number;  // default: 14 (days without typo = conquered)
  showFatigueAnalysis: boolean;    // default: true
  showProgressTracking: boolean;   // default: true
  customAllowlistPath?: string;    // user's domain-specific words
  minOccurrencesToTrack: number;   // default: 2 (ignore one-offs)
}
```

### Privacy Note

Like the Blooper Reel, this feature:
- Uses **only data already collected** by existing sources
- Runs **100% locally** — no typo data sent to any API
- Stores history in the plugin's local data directory
- Can be fully disabled in settings
- Custom allowlist lets users mark domain-specific terms as "not typos"
