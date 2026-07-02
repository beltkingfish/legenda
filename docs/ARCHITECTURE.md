# ARCHITECTURE — Legenda

Last updated: 2026-07-02. Read the **Hard constraints** section before designing anything.

## 1. Platform
- **UXP** (Unified Extensibility Platform), the standard extensibility path in Premiere
  2026 (v25.6+). CEP/ExtendScript is legacy (ExtendScript supported only through ~Sept
  2026 with no new development). Build UXP-first.
- Single unified JS/TS runtime. UI (HTML/CSS) and host calls (`require("premierepro")`)
  live in the same environment. Most Premiere API methods are **async** — always `await`.
- Version awareness: Premiere version gates the Premiere DOM API; the bundled UXP version
  gates UXP core APIs. Target APIs common to the supported floor; guard newer calls.

## 2. Hard constraints (these shape the whole design — do not fight them)
1. **No caption-track text API yet.** You can get a sequence's caption track and its track
   items, but reading/modifying caption *text and properties* is not exposed. => We do not
   render into, or read from, the native caption track.
2. **Transcript API is the real ingress.** A clip project item's transcript can be exported
   as JSON (word-level timing) and external transcripts can be imported. The transcript
   JSON format is documented in the Adobe samples repo
   (`sample-panels/premiere-api/assets/transcript_format_spec.json`). **Code against that
   spec; never invent it.**
3. **Arbitrary keyframe animation via the API is immature.** Multi-keyframe ComponentParam
   writes have been reported buggy/unreliable in current UXP builds. Non-exposed MOGRT
   params cannot be driven (historically crash-prone). => We do **not** synthesize the
   animation by scripting keyframes. The animation is authored into MOGRT template(s); the
   plugin only inserts instances and sets **exposed** params + timing.
4. **Spectrum Web Components are not fully supported** in Premiere UXP yet. Use supported
   `sp-` elements and standard HTML/CSS themed to Premiere's dark UI. UXP CSS deviates
   from browsers (observed 26.3): flexbox `gap` ignored (use margins); flex children
   were centered until `align-items` was set explicitly; `<button>` background-color
   is not applied over the native styling.

## 3. Rendering model (MOGRT-driven)
- Ship one or more **pre-authored MOGRT templates** (built in Premiere's graphics tools or
  After Effects) that contain the teleprompter and fade behaviors, with a small set of
  **exposed editable parameters**: line text, text color, background on/off, background
  color/opacity, and (where feasible) an italic/emphasis flag.
- Pipeline: import → normalize to internal model (§4) → wrap into lines by screen-real-
  estate setting → for each line, insert a MOGRT instance on a dedicated video track at the
  line's start time, trim to its duration → set exposed params from the active style →
  apply per-line overrides.
- Insertion uses the documented MOGRT insert methods (verify exact names/signatures against
  the current TS defs before use). Keep all instances on one plugin-owned track for easy
  cleanup/regeneration.
- **Regeneration over mutation**: when the user changes global style/timing, clear the
  plugin's track and re-lay instances rather than trying to mutate each in place.

## 4. Internal data model (plugin-owned, source-agnostic)
```
CaptionProject {
  source: "transcript" | "srt",
  words: [ { text, startSec, endSec, speaker? } ],   // canonical timing
  lines: [ { text, startSec, endSec, wordRefs[],      // derived by wrapper
             overrides?: { color?, italicRanges?[] } } ],
  style: StyleDef,            // see presets/style-presets.json shape
  animation: "teleprompter" | "fade",
  timing: { minSec, maxSec, transitionMs, gapMs },    // WCAG-aware, user-editable
}
```
- The **word list is canonical**; **lines are derived** and can be re-wrapped when the
  screen-real-estate setting changes without re-importing.
- SRT import yields cue-level timing; interpolate word times within a cue proportionally to
  word length so the same model shape holds.

## 5. Line wrapping
- Inputs: target line length (characters) or a safe-area width + font metrics; max lines
  visible (2 for teleprompter).
- Greedy wrap by word, respecting min/max on-screen time; never split a word.

## 6. Style + override application
- A `StyleDef` maps 1:1 to exposed MOGRT params. Global edits mutate `style`; "apply to all"
  triggers regeneration. Per-line overrides are stored on the line and re-applied after any
  global regeneration. Per-word (italic/color) is Phase 2 and depends on the MOGRT exposing
  per-word slots or a future rich-text/text-run API.

## 7. Persistence
- Styles/presets are JSON on disk (localFileSystem permission). Project state can be kept in
  panel state and optionally serialized next to the project. No browser storage APIs.

## 8. Tooling
- TypeScript recommended; pull `@adobe/premierepro` type defs; lint with
  `@adobe/eslint-plugin-premierepro`.
- Type defs are versioned to Premiere releases and start at 26.2.0 — there are no defs
  for the 25.6 floor. Defs describe the newest API; runtime-guard anything not certain
  to exist in 25.6. UXP DOM types come from `@adobe/cc-ext-uxp-types` (exclude lib
  "DOM"); it omits some real runtime surface (global `require`, `classList`).
- Load/debug/package with UXP Developer Tool (UDT) v2.2.1+. Enable Developer Mode in
  Premiere and restart. `manifest.json` must declare permissions (localFileSystem for
  SRT/preset I/O). No network permission needed in Phase 1.
- The AdobeDocs `premiere-api` sample panel is the reference for how each API behaves —
  consult it when unsure.

## 9. Known risks / open questions (keep current)
- Exact insert/param/timing method signatures must be confirmed against live TS defs.
- Feasibility of an exposed per-word italic/color slot in a single MOGRT text field is
  uncertain — prototype early; fall back to line-level if blocked.
- Keyframe API maturity may improve; revisit whether any secondary polish can be scripted.