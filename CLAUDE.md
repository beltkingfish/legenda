# CLAUDE.md — Legenda

> Working name: **Legenda** (a UXP captions plugin for Adobe Premiere). Rename freely.
> This file is loaded at the start of every Claude Code session. Keep it under ~200 lines.

## What this project is
A Premiere **UXP** panel plugin that turns a transcript (or SRT) into expressive,
animated captions rendered on the timeline via pre-authored Motion Graphics Templates
(MOGRTs). It gives editors far more control than Premiere's built-in caption styles:
per-line reveal, a teleprompter push/blur animation, simple fade, three built-in style
presets plus custom styles, per-word emphasis (later phase), and WCAG-aware timing
warnings that never block the user.

## Read these before writing any code (single source of truth)
1. `docs/SPECIFICATION.md` — locked product scope. Do not add features not listed here
   without the maintainer's say-so. If scope changes, update the spec first, then build.
2. `docs/ARCHITECTURE.md` — the technical design and, critically, the **platform
   constraints** that dictate *how* we render captions. Read the "Hard constraints" section.
3. `docs/PROJECT_STATUS.md` — the current phase and what is/isn't done.
4. `docs/UI_COMPONENTS.md` — panel layout, exact labels, and warning copy.
5. `presets/style-presets.json` — the three preset definitions with exact values.
6. `docs/MOGRT_SPEC.md` — the exposed-parameter contract between the caption
   template(s) and the renderer (names are matched literally at runtime).

## Non-negotiable technical rules
- **Target UXP, not CEP/ExtendScript.** Premiere 2026 (v25.6+) ships UXP as standard.
  Entry point is `require("premierepro")`. Most Premiere API calls are async — `await` them.
- **Do NOT invent the Premiere API surface.** The API is young and changes per release.
  Before using any Premiere UXP method, verify it against the official TypeScript defs
  (`@adobe/premierepro`), the reference at developer.adobe.com/premiere-pro/uxp, and the
  AdobeDocs/uxp-premiere-pro-samples repo. If you cannot verify a method exists, stop and
  flag it rather than guessing.
- **Do NOT invent the transcript JSON schema.** It is documented at
  `sample-panels/premiere-api/assets/transcript_format_spec.json` in the Adobe samples repo.
  Read that spec and code against it. If unavailable, fall back to the SRT path.
- **Rendering is MOGRT-driven, not keyframe-synthesized.** The animation lives inside
  pre-authored MOGRT template(s). The plugin inserts instances at timecodes and sets only
  **exposed** parameters. Do not attempt to drive non-exposed MOGRT params or hand-build
  keyframe stacks — both are unsupported/unstable in the current API (see ARCHITECTURE.md).
- **WCAG timing = warn, never block.** Surface warnings; always let the user override.
- **Child-safe, dependency-light.** No transcription API / network calls in Phase 1.

## Update ritual (prevent drift)
At the end of any session where you complete or change something meaningful:
1. Update `docs/PROJECT_STATUS.md` — move items between "Done / In progress / Next",
   note the date, and record any decisions or discovered API limitations.
2. If you learned a real platform constraint, add it to ARCHITECTURE.md → "Hard constraints."
3. If scope changed, reflect it in SPECIFICATION.md in the same session.
4. Keep these files factual and terse. They are a contract, not a changelog essay.

## Build / run (fill in as established)
- Package manager, build command, and lint command: _to be set on first setup_.
- Recommended: TypeScript + `@adobe/premierepro` types + `@adobe/eslint-plugin-premierepro`.
- Load/debug/package via UXP Developer Tool (UDT) v2.2.1+; Developer Mode on in Premiere.

## Style
- Match Premiere's native panel look (dark theme, Spectrum-styled `sp-` elements where
  supported). Prefer clarity over cleverness. Small, reviewable commits.