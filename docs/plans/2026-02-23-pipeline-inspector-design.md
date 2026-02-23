# Pipeline Inspector — Design

**Date:** 2026-02-23
**Status:** Approved — ready for implementation planning

---

## Goal

A local dev server (`scripts/inspector.ts`) that lets you run the 9-stage pipeline against a chosen date and preset, watching each stage fire in real time, with optional step-through mode (pause between stages and advance with "Next Stage →").

---

## Architecture

**One new file:** `scripts/inspector.ts`
**One new npm script:** `"inspect": "tsx --tsconfig tsconfig.scripts.json scripts/inspector.ts"`

Server uses Node's native `http` module (zero new npm deps). Serves on port `3747`. HTML is an inline template string in `inspector.ts` — no separate HTML file.

### Routes

| Method | Path          | Description                                                   |
|--------|---------------|---------------------------------------------------------------|
| GET    | `/`           | Serves the inline HTML page                                   |
| GET    | `/api/presets`| Returns `[{ id, description }]` from `PRESETS` array          |
| POST   | `/api/run`    | SSE endpoint — starts pipeline, streams events, closes on done|
| POST   | `/api/next`   | Advances a paused (step-mode) pipeline to the next stage      |

### Pipeline Execution

Stages are run **inline** (same imports as `daily-matrix.ts`) inside the `/api/run` handler — no subprocess. One preset at a time. Output is not written to disk; it lives only in the browser.

---

## SSE Protocol

All events are `data: <JSON>\n\n` on the response stream (`Content-Type: text/event-stream`).

```
data: {"type":"stage","name":"collect","status":"running"}
data: {"type":"stage","name":"collect","status":"done","durationMs":42,"detail":"47 visits, 12 searches"}
data: {"type":"waiting","nextStage":"sanitize"}
                                                 ← POST /api/next (client clicks Next)
data: {"type":"stage","name":"sanitize","status":"running"}
data: {"type":"stage","name":"sanitize","status":"done","durationMs":8,"detail":"0 secrets removed"}
...
data: {"type":"complete","markdown":"# 2026-02-23\n..."}
data: {"type":"error","message":"ANTHROPIC_API_KEY missing"}
```

**Stage statuses:** `running` | `done` | `skipped`

**Step mode guard:** if the browser closes while the server is paused waiting for `/api/next`, a 60-second timeout auto-cancels the run to prevent the server from hanging.

**In-memory run state:**
```ts
interface RunState {
  advance: () => void;   // resolves the between-stage Promise
  timeoutId: ReturnType<typeof setTimeout>;
}
let currentRun: RunState | null = null;
```

---

## UI Layout

```
┌─────────────────────────────────────────────────────────────┐
│  Pipeline Inspector                                          │
├──────────────┬──────────────────────────────────────────────┤
│  CONTROLS    │  STAGE LOG                                    │
│              │  ● collect      42ms   47 visits, 12 searches│
│  Date        │  ● sanitize     8ms    0 secrets removed     │
│  [2026-02-23]│  ● sensitivity  3ms    2 domains excluded    │
│              │  ● categorize   2ms                          │
│  Preset      │  ○ classify     skipped                      │
│  [no-ai-min▼]│  ● patterns     11ms   focus=72%            │
│              │  ○ knowledge    skipped                      │
│  Data        │  ● summarize    —      mock                  │
│  ○ fixtures  │  ● render       4ms                          │
│  ● real      ├──────────────────────────────────────────────┤
│              │  OUTPUT                                       │
│  AI          │  (rendered markdown via CDN marked.js)        │
│  ● mock      │                                              │
│  ○ real      │                                              │
│              │                                              │
│  [ Step ]    │                                              │
│  [ Run All ] │                                              │
│              │                                              │
│  [Next Stage]│  ← activates after each stage in step mode  │
└──────────────┴──────────────────────────────────────────────┘
```

### Controls

- **Date picker** — defaults to today (`YYYY-MM-DD`)
- **Preset selector** — populated from `/api/presets` on page load
- **Data mode** — radio: `fixtures` | `real`
- **AI mode** — radio: `mock` | `real` (real reads `ANTHROPIC_API_KEY` from env)
- **Step button** — starts run in step-through mode
- **Run All button** — starts run, no pausing between stages
- **Next Stage → button** — disabled until server sends `type:"waiting"`; clicking sends `POST /api/next`

### Stage Log

Each stage row appears as its SSE event fires:
- `●` filled dot = done
- `○` empty dot = skipped
- spinner = currently running

### Output Panel

Rendered via CDN `marked.js` (`<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js">`). Populated when `type:"complete"` arrives. Raw markdown shown in a `<details>` toggle below for copy-paste.

---

## Error Handling

- Each pipeline stage wrapped in try/catch — emits `type:"error"` SSE event and closes stream; server stays alive for re-runs
- Real AI mode with missing `ANTHROPIC_API_KEY`: emits error before running, no partial state
- Only one run at a time — "Step" and "Run All" buttons disabled while a run is active

---

## Files Changed

| File                      | Change                          |
|---------------------------|---------------------------------|
| `scripts/inspector.ts`    | New file                        |
| `package.json`            | Add `"inspect"` script          |
