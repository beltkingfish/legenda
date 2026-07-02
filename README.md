# Legenda

> Working name — rename freely.

A UXP plugin panel for **Adobe Premiere (2026, v25.6+)** that turns a transcript or SRT into
expressive, animated captions rendered on the timeline — going well beyond Premiere's
built-in caption styles.

## What it does
- **Per-line reveal** captions, wrapped to the screen real estate you choose.
- Two animation styles: **Teleprompter** (two lines visible; new line pushes up, the exiting
  line blurs/fades, the incoming line resolves out of blur) and **Fade**.
- Three built-in style presets — **Clean**, **Bold**, **Minimal** — plus custom styles.
- **Global styling** with one-click *apply to all*, and **per-caption overrides** (color,
  italics) — line-level in Phase 1, per-word in a later phase.
- **WCAG-aware timing** warnings (min 1.33s, max 7s, 100–200ms transitions, 0–200ms gaps)
  that inform but never block.

## How it works (short version)
Captions render through pre-authored **Motion Graphics Templates (MOGRTs)**; the plugin
imports text + word-level timing (from Premiere's **Transcript API**, or an **SRT** file),
wraps it into lines, and lays MOGRT instances at the right timecodes with the active style
applied. The native caption-track text API isn't available yet, and scripted keyframe
animation is currently unreliable — so the animation lives in the templates and the plugin
drives their exposed parameters. See `docs/ARCHITECTURE.md`.

## Repo layout
```
legenda/
├── CLAUDE.md                 # Claude Code behavioral contract (auto-loaded each session)
├── README.md
├── .claude/
│   └── settings.json         # permissions + update-ritual hook
├── docs/
│   ├── SPECIFICATION.md      # locked product scope
│   ├── ARCHITECTURE.md       # technical design + hard platform constraints
│   ├── PROJECT_STATUS.md     # phase tracker (kept current each session)
│   ├── UI_COMPONENTS.md      # panel layout, labels, warning copy
│   └── CLAUDE_CODE_KICKOFF_PROMPT.md
├── presets/
│   └── style-presets.json    # Clean / Bold / Minimal definitions (shared StyleDef shape)
└── src/                      # created during Phase 1
```

## Getting started (development)
1. Install the **UXP Developer Tool (UDT) v2.2.1+** (via Creative Cloud Desktop) and enable
   Developer Mode in Premiere; restart Premiere.
2. From the repo root, open Claude Code and paste `docs/CLAUDE_CODE_KICKOFF_PROMPT.md`.
3. Load the built plugin's `manifest.json` in UDT → the panel appears under
   **Window → UXP Plugins**.

## Status
Phase 1, scaffolding stage. See `docs/PROJECT_STATUS.md`.