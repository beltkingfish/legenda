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
   from browsers (observed 26.3): flexbox `gap` ignored (use margins, confirmed live);
   header/footer content rendered centered — `align-items: stretch` alone did NOT fix
   it, so set `text-align`, `justify-content`, and `display` explicitly and never rely
   on UA defaults (semantic elements may be treated as unknown/inline); `<button>`
   background-color is not applied over the native styling.
5. **All timeline mutations are Action objects run in a transaction.** Nothing mutates
   directly: create `Action`s (createSet*/createInsert*/createRemove*), then execute via
   `project.lockedAccess(() => project.executeTransaction(ca => ca.addAction(a), "label"))`.
   Component-chain reads (getComponentAtIndex/getParam) also require lockedAccess.
   `insertMogrtFromPath` is the exception: called inside lockedAccess, no transaction
   (per the premiere-api sample), returning inserted track items synchronously.
6. **MOGRT exposed params populate LAZILY after insert** (confirmed 26.3, step-6 probe).
   Right after `insertMogrtFromPath` the item's component chain has only intrinsic
   `AE.ADBE Opacity` + `AE.ADBE Motion`; the `Graphic Parameters` component
   (matchName `AE.ADBE Capsule`) carrying the exposed params appears a moment later.
   => The renderer must **insert, then poll the chain for `AE.ADBE Capsule`** (bounded
   retries with a short delay) before reading/writing exposed params. Params match by
   exposed `displayName`; **checkbox params report an empty displayName** — encode
   booleans as a 0/max numeric param instead (see docs/MOGRT_SPEC.md).
7. **Exposed TEXT params are NOT reachable via ComponentParam** (confirmed 26.3,
   step-6 probe run #5): a source-text param reports `areKeyframesSupported: false`,
   `getValueAtTime` throws, and `getStartValue`/`getKeyframePtr` return null — the
   entire keyframe-based value surface is closed for text. Numbers/booleans work via
   `getValueAtTime` + `createKeyframe`/`createSetValueAction`; **colors** read via
   `getStartValue()` which returns the `Color` object itself (not a keyframe
   wrapper) and write via `createKeyframe(Color)`. Caption text therefore cannot be
   set on an inserted instance through the current API — see PROJECT_STATUS step-6
   record for the per-line template-patching contingency (maintainer decision).
8. **MOGRT instances are UNIFORMLY TIME-STRETCHED to the clip length** (measured
   live 2026-07-03): comp-time = clip-time × (compDuration / clipLength), so a
   4 s comp squeezed into a 1.3 s caption plays ~3× fast — authored animation
   timing compresses/dilates proportionally, and **responsive-design-time
   protected regions are NOT honored** on instances placed via
   `insertMogrtFromPath` (razor cuts window the clip without remapping,
   confirming a fixed linear mapping). Consequence: neither keyframed nor
   naive expression-driven intro/outro timing survives trimming — v1's
   keyframed fades were invisibly compressed all through Phase 1.
   **Adopted countermeasure**: templates expose a `Duration (ms)` slider the
   patcher fills with the line's exact duration; time expressions invert the
   stretch (`t = time × durS / thisComp.duration`) and place ramps in real
   clip time. Templates must not rely on protected regions for anything
   timing-critical.

## 3. Rendering model (MOGRT-driven, per-line template patching for text)
- Ship one or more **pre-authored MOGRT templates** (After Effects, UHD comp) with the
  exposed parameters defined in **docs/MOGRT_SPEC.md** (matched by display name at
  runtime; template and code must both follow it).
- **Caption text cannot be set via the API** (hard constraint #7). Adopted mechanism
  (decision 2026-07-02, verified live): for each line, the plugin writes a **patched
  copy of the template** to the UXP temporary folder — rewriting `definition.json`
  inside the zip (the three text fields + a fresh `capsuleID`; see MOGRT_SPEC "Value
  read/write recipes" and scripts/patch-mogrt-text.py) — and inserts that copy.
  Style params (colors, opacities, size) are still set via ComponentParam after the
  capsule populates. Zip handling uses fflate (bundled).
- Pipeline: import → normalize to internal model (§4) → wrap into lines (§5) → ensure
  the **plugin-owned track** → per line, IN CHRONOLOGICAL ORDER: patch a template copy
  with the line's text → `insertMogrtFromPath` at the line's start on the plugin track
  → immediately trim to the line's duration (before the next insert, so insert-shift
  semantics never touch a previous instance) → set Motion Scale to
  `frameHeight / templateHeight × 100` → (step 8+) set style params.
- **Plugin-owned track**: `insertMogrtFromPath` cannot create tracks. Strategy: use the
  topmost video track if it has no clips; otherwise manufacture a new top track with
  `createInsertProjectItemAction` at an out-of-range index (documented auto-create)
  using any sequence clip's project item, then remove the placeholder item — leaving
  an empty new track. All caption instances live on that one track.
- **Regeneration over mutation**: style/timing/wrap changes clear the plugin track
  (TrackItemSelection.createEmptySelection + addItem + createRemoveItemsAction) and
  re-lay. Clearing removes ALL clip items on the plugin-owned track — never place
  user content there.

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