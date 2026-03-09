---
name: "🏆 Track Longest AI Agent Sessions"
about: "Marathon Coder Awards — celebrate your longest coding sessions with AI"
title: "feat: 🏆 Track Longest AI Agent Sessions — Marathon Coder Awards"
labels: enhancement, fun-feedback
---

## 🏆 Marathon Coder Awards — Track Longest AI Agent Sessions

### The Idea

We already collect Claude Code and Codex CLI sessions with turn counts and timestamps. Let's turn that data into something **fun and motivating** — tracking your longest AI pair-programming marathons and celebrating them in your daily digest.

Think of it like fitness tracking, but for coding. "You spent 3h47m debugging auth middleware with Claude today. New personal record! 🎉"

### Proposed Features

#### 1. Session Duration Tracking
- Calculate duration from first to last turn in each conversation file
- Track **wall-clock time** (first prompt → last prompt timestamp)
- Track **turn count** (total back-and-forth exchanges)
- Track **active time** (estimated by gaps between turns — exclude idle periods >15min)

#### 2. Daily Records in the Digest Note
Add a new **"Marathon Sessions"** callout in the Cognitive Patterns layer:

```markdown
> [!trophy] Marathon Sessions
> 🥇 **Longest today:** 2h 14m on `obsidian-daily-digest` (47 turns)
> 🥈 **Runner up:** 58m on `api-gateway` (23 turns)
> ⏱️ **Total AI pair-programming:** 4h 32m across 6 sessions
> 🔥 **Streak:** 5 days in a row with 1h+ sessions
```

#### 3. Personal Records (All-Time Stats)
Track personal bests in frontmatter or a separate stats file:
- **Longest single session** (duration + date + project)
- **Most turns in one conversation**
- **Most sessions in a single day**
- **Longest daily streak** of 1h+ AI sessions
- **Total lifetime AI pair-programming hours**

When a record is broken, add a celebration to the digest:
```markdown
> [!success] 🎊 NEW PERSONAL RECORD!
> Your 3h 47m Claude session on `auth-service` beats your previous
> record of 3h 12m set on 2025-12-03. That's dedication! 💪
```

#### 4. Fun Badges & Achievements
Award tongue-in-cheek badges based on session patterns:

| Badge | Criteria | Emoji |
|-------|----------|-------|
| **Night Owl** | 2h+ session after midnight | 🦉 |
| **Early Bird** | 1h+ session before 7am | 🐦 |
| **Marathon Runner** | 3h+ continuous session | 🏃 |
| **Ultramarathoner** | 5h+ continuous session | 🦸 |
| **Speed Round** | 20+ turns in under 10 minutes | ⚡ |
| **Deep Diver** | 100+ turns in one conversation | 🤿 |
| **Multi-tasker** | 5+ concurrent projects in one day | 🎪 |
| **Pair Programming Pro** | 30 days total AI pair-programming | 👯 |
| **Centurion** | 100 days of AI pair-programming | 💯 |
| **The Negotiator** | Session with 50+ turns that changed approach 3+ times | 🤝 |

#### 5. Weekly/Monthly Rollups
For weekly digest notes (future feature), aggregate:
- Total AI hours this week vs last week
- Session count trend (are you using AI more or less?)
- Average session length trend
- Projects that got the most AI attention

### Where This Fits in the Pipeline

- **Collection** (`claude.ts`, `codex.ts`): Already captures `conversationTurnCount` and timestamps. Need to add duration calculation.
- **Types** (`types.ts`): Add `SessionDuration` interface, `PersonalRecord` tracking type.
- **Patterns** (`patterns.ts`): New `extractSessionMarathons()` function.
- **Knowledge** (`knowledge.ts`): New `buildMarathonSection()` for callout rendering.
- **Renderer** (`renderer.ts`): Add Marathon Sessions callout to Layer 2.
- **Frontmatter**: Add `longest_session`, `total_ai_time`, `session_count` fields.

### Data Already Available

From `ClaudeSession`:
- `time` — timestamp of each prompt
- `conversationFile` — groups turns into conversations
- `conversationTurnCount` — total turns per conversation
- `project` — which project the session was in

We'd need to add:
- `sessionDurationMs` — calculated from first/last turn timestamps
- `activeTimeMs` — excluding idle gaps
- `isPersonalRecord` — computed against stored history

### Fun Expansion Ideas

- **"AI Buddy" stats**: "You and Claude discussed 47 different topics today"
- **Session mood detection**: Based on prompt length/frequency patterns — "frustrated debugging" vs "calm architecture exploration"
- **Project loyalty score**: "You spent 80% of your AI time on one project today — laser focus!"
- **Conversation style stats**: Average prompt length, question-to-statement ratio
- **"Time well spent" correlations**: Sessions that led to commits within 30 minutes

### Settings

```typescript
interface MarathonTrackingConfig {
  enableMarathonTracking: boolean;  // default: true
  idleThresholdMinutes: number;     // default: 15
  celebrateRecords: boolean;        // default: true
  enableBadges: boolean;            // default: true
  minimumSessionMinutes: number;    // default: 5 (ignore tiny sessions)
}
```
