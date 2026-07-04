# PROJECT STATUS — Legenda

Update this at the end of any session with meaningful changes (see CLAUDE.md → Update ritual).

Current phase: **Phase 2 — steps 1/3/4 verified live; template v2 authored and
its mechanisms live-verified; step 2 (per-word color) + v2 wiring BUILT,
awaiting live verify. Phase 1 close item still open: teleprompter template
(recipe ready, MOGRT_AUTHORING §C).**
Last updated: 2026-07-03.

## Done
- Product scope locked (SPECIFICATION.md).
- Architecture + hard platform constraints documented (ARCHITECTURE.md).
- Three style presets defined (presets/style-presets.json).
- UI layout, labels, and warning copy defined (UI_COMPONENTS.md).
- 2026-07-02 — Step 1 scaffold: TypeScript + ESLint tooling, adapted manifest (size hints
  from the AdobeDocs sample; host `premierepro`, minVersion 25.6.0, localFileSystem
  "request"), dark panel shell (index.html + src/panel.css), hello-sequence probe
  (src/main.ts). Builds (`npm run build`) and lints (`npm run lint`) clean.
- 2026-07-02 — API surface verified for the probe, against `@adobe/premierepro@26.3.0`
  type defs: `Project.getActiveProject(): Promise<Project>` (static),
  `Project#getActiveSequence(): Promise<Sequence>`, readonly `name: string` on both
  Project and Sequence. Consumption pattern per the package README:
  `const ppro = require("premierepro") as premierepro` with type-only imports.
- 2026-07-02 — Confirmed `sample-panels/premiere-api/assets/transcript_format_spec.json`
  exists at that path in AdobeDocs/uxp-premiere-pro-samples (needed for step 3).
- 2026-07-02 — Step 1 verified live: panel loads via UDT into Premiere 26.3.0 (after
  Settings → Plugins → Enable developer mode + restart). Probe returns the project name;
  the no-active-sequence path degrades gracefully. Dev machine runs Premiere 26.3.0 —
  matches our pinned type defs exactly.

- 2026-07-02 — Step 2: API surface verified against `@adobe/premierepro@26.3.0` defs AND
  live usage in the AdobeDocs `premiere-api` sample. Everything the architecture needs
  exists. Verified signatures:
  - **MOGRT insert**: `ppro.SequenceEditor.getEditor(sequence)` →
    `editor.insertMogrtFromPath(path, tickTime, videoTrackIdx, audioTrackIdx)` returns
    `Array<VideoClipTrackItem|AudioClipTrackItem>` synchronously; sample calls it inside
    `project.lockedAccess()` (no executeTransaction). Also `insertMogrtFromLibrary(...)`
    and `SequenceEditor.getInstalledMogrtPath()`.
  - **Transaction idiom** (all timeline mutations): build Action objects, then
    `project.lockedAccess(() => project.executeTransaction(ca => ca.addAction(a), "undo label"))`.
  - **ComponentParam**: `sequence.getVideoTrack(i)` →
    `track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false)` →
    `item.getComponentChain()` → (inside lockedAccess) `chain.getComponentAtIndex(i)` /
    `getComponentCount()` → `component.getParam(idx)` / `getParamCount()` /
    `getMatchName()`. Writes: `param.createSetTimeVaryingAction(false)` then
    `param.createKeyframe(value)` + `param.createSetValueAction(keyframe, true)`, executed
    via the transaction idiom. Reads: `getValueAtTime(t)`, `getStartValue()`.
    **No get-by-name API** — iterate and match `param.displayName` /
    `component.getMatchName()`; we control exposed names in our own MOGRT.
    (`getMGTComponent` from ExtendScript does not exist in UXP.)
  - **Transcript export**: `ppro.ClipProjectItem.cast(projectItem)` →
    `ppro.Transcript.hasTranscript(clip)` (sync bool) →
    `await ppro.Transcript.exportToJSON(clip)` → JSON string. (Import direction also
    exists: `importFromJSON` + `createImportTextSegmentsAction`.)
  - **Timing/trim** (for the renderer): `ppro.TickTime.createWithSeconds(s)` /
    `createWithTicks(str)` / `TIME_ZERO`; on track items `createSetStartAction`,
    `createSetEndAction`, `createSetInPoint/OutPointAction`, `createMoveAction`,
    `getStartTime/getEndTime/getDuration`.
  - **Plugin-track cleanup** (regeneration): `ppro.TrackItemSelection.createEmptySelection(cb)`
    → `selection.addItem(item)` → `sequenceEditor.createRemoveItemsAction(selection,
    ripple, mediaType)` — programmatic clear without touching user selection.

- 2026-07-02 — Step 3 built: transcript import → internal word model. Read Adobe's
  `transcript_format_spec.json` (JSON Schema; root = `language`, `segments[]`,
  `speakers[]`; segment = `start`/`duration`/`speaker`-uuid/`words[]`; word =
  `text`/`start`/`duration`/`eos`/`type`(word|punctuation)/`confidence`/`tags`, times in
  seconds). Parser in `src/transcript.ts`; Premiere glue (scan sequence clips for
  transcripts, export JSON) in `src/premiere.ts`; internal model in `src/model.ts`
  (per ARCHITECTURE §4, plus optional `eos` for the step-5 wrapper). Source section
  wired in the panel (auto-scan on load, Rescan, Import; SRT button present, disabled
  until step 4). Builds + lints clean.
- 2026-07-02 — Tooling: switched to esbuild bundling (src/main.ts → dist/main.js as
  IIFE, host modules external so `require("premierepro")` stays a runtime call).
  Needed for multi-file src/; tsc is typecheck-only now.

- 2026-07-02 — Step 3 verified live (Premiere 26.3.0): Source scan found the transcript
  on a Text-panel-transcribed sequence; import reported 203 words · 1 speaker · en-us.
  **Answered**: sequence transcription DOES surface as clip-level transcripts —
  `Transcript.hasTranscript` is true on the sequence's clip project items, so the
  clip-scan ingress design holds. Parser accepted Premiere's real export unchanged
  (spec-conformant).

- 2026-07-02 — Step 4 built: SRT parser → internal word model (`src/srt.ts`), file
  picker via UXP `storage.localFileSystem.getFileForOpening` (`src/files.ts`; API
  verified in cc-ext-uxp-types), panel wiring ("Import SRT file…" now live). Word
  timing interpolated within each cue proportionally to word length; last word snaps
  to the cue boundary. Tolerates BOM/CRLF, dot-ms separators, missing indices, stray
  metadata blocks; strips `<tag>` and `{code}` markup. Parser smoke-tested in Node
  (11 assertions incl. failure mode).

- 2026-07-02 — Step 4 verified live (Premiere 26.3.0): picker opened, a
  Premiere-exported .srt imported as 203 words — identical count to the transcript
  import of the same content, cross-validating both parsers. localFileSystem access
  worked without issues.

- 2026-07-02 — Step 5 built: line wrapper (`src/wrap.ts`). Greedy wrap by word, never
  splits a word; breaks on speaker change, silences > 1.5s, the character budget, and
  a max on-screen duration (default 7s); prefers ending lines at sentence boundaries
  (`eos`) once ≥ 60% full. Panel: "Target line length" field (default from
  presets/style-presets.json via build-time JSON import), live re-wrap on change,
  read-only line preview with timecodes, counts line now includes lines.
- 2026-07-02 — Tests promoted into the repo: `npm test` (esbuild → node:test, zero new
  deps). 19 tests: 11 wrapper + 8 SRT (ported from the step-4 scratchpad smoke test).
  Test files are esbuild-compiled only (not tsc-typechecked — they'd need @types/node,
  which conflicts with our restricted `types: ["uxp"]` setup).

- 2026-07-02 — Step 5 verified live (Premiere 26.3.0): 203 words → 38 lines at the
  default width; breaks read sentence-shaped; changing "Target line length" re-wraps
  the preview live. UXP quirk noted: `<input type="number">` works but renders rough
  (value display/styling) — revisit in the style-panel pass.

- 2026-07-02 — Step 6 groundwork: `docs/MOGRT_SPEC.md` written (exposed-param contract,
  tiered required/desired/deferred; fade behavior spec; two candidate teleprompter
  strategies with prototype order; AE authoring workflow). Panel gained a dev **MOGRT
  probe**: pick a .mogrt → insert at 0:00 with an out-of-range track index → dump every
  component matchName/displayName and param displayName. Answers step-2 open questions
  1–2 with *any* .mogrt; question 3 (setting params post-insert) needs our template's
  `Line Text` param.

- 2026-07-02 — Step 7 built: the renderer (`src/renderer.ts`). Per line, in
  chronological order: patch a template copy (`src/mogrtPatch.ts`, fflate; TS port of
  scripts/patch-mogrt-text.py, 8 unit tests) → write to the UXP temp folder →
  `insertMogrtFromPath` at the line's start on the plugin track → trim immediately
  (`createSetEndAction`) → scale to the sequence frame. Regeneration clears the
  plugin track first. Shared param helpers extracted to `src/params.ts` (probe +
  renderer both use them). Panel gained the Generate section (UI_COMPONENTS §6):
  Generate with per-line progress, Clear with a two-step confirm.
- (Step-6 open questions all resolved — see the step-6 findings sections above and
  MOGRT_SPEC "Runtime facts" / "Value read/write recipes".)

- 2026-07-02 — **Step 7 verified live (first generate)**: 85 captions laid on video
  track 3 at 50.0% scale from the interview transcript; monitor shows the correct
  line at the correct time (spot-checked); per-line trims correct, no overlaps;
  user video/audio untouched. Confirms: per-line patch+insert loop works at real
  scale; `createSetEndAction` is sequence-time based.

- 2026-07-02 — Performance confirmed: the 85-line generate (85 patched temp files +
  inserts + trims + scales) completes near-instantly. No optimization needed.
- 2026-07-02 — **Clear bug found & fixed**: using the selection outside
  `TrackItemSelection.createEmptySelection`'s callback → "The script object is no
  longer valid" — the selection object's lifetime is scoped to the callback. All
  selection work (addItem + remove action + transaction) now runs inside the
  callback under one lock. (Now a discovered-limitations entry.)

- 2026-07-02 — **Step 7 fully verified**: Clear removed 125 items (the 85 captions
  plus accumulated probe-test debris on the track — confirming clear sweeps the
  whole plugin track). Regeneration shares this code path with the verified
  generate. The callback-scoped-selection fix works.

- 2026-07-03 — Step 8 built: style panel. Full definition.json structure dumped
  first (lesson applied): colors are `[r,g,b,a]` 0–1 arrays; checkbox drivable at
  patch time; **font family/size patchable via fonteditinfo** (no API needed) —
  and `fontFSItalicValue` gives step 10 its italic route. `src/style.ts` (StyleDef
  mirrors presets/style-presets.json; hex→float; PostScript font naming; template-
  unit mapping with designHeight/1080 scaling), patcher applies style to controls +
  capParams, renderer takes the working style, panel gains the Caption Style
  section (presets Clean/Bold/Minimal, editable controls flip to Custom, "Apply to
  all" = regenerate per ARCHITECTURE §6). Template-v2 items (line height, letter
  spacing, alignment, outline) shown as a note, not dead controls. 43 tests.

- 2026-07-03 — Live check #1 found the **text-run bug**: captions longer than the
  authored default's 19 chars rendered the tail in fallback styling ("So from what
  it was |gathered," split mid-line). Cause: `fontTextRunLength: [19]` in the text
  capParam — the style run spans the AUTHORED text length. Fixed: patcher sets it
  to `[newText.length]` on every patch. MOGRT_SPEC recipe updated.
- 2026-07-03 — **Premiere crashed once** while the maintainer was changing style
  settings (Adobe crash-report dialog). Trigger unknown; not yet reproduced.
  Watch for a pattern (suspects: rapid regenerates, undo-stack pressure from
  85-item insert/remove cycles, panel input handling). Collect exact steps if it
  recurs.

- 2026-07-03 — **Run-length fix verified live**: Bold/Minimal apply uniformly across
  entire lines (screenshots). Regeneration reported "(cleared 56 previous)" ✓;
  checkbox/select controls render fine; swatch wrap is a cosmetic nit.
- 2026-07-03 — **Debris bug found & fixed**: ~1-frame sliver clips accumulated on the
  caption track (clear counted 56 items for a 38-line generate ⇒ 18 slivers; sequence
  end stretched past footage). Cause: line times can OVERLAP (punctuation-merge can
  extend a word's end past the next word's start; crosstalk), and insert semantics
  SPLIT any instance spanning the insert point — the split tail then cascades right
  with every subsequent insert. Fix: `sanitizeLineTimings` (pure, tested) clamps each
  line's end to the next line's start and drops emptied lines before insertion;
  Generate reports skipped zero-length lines.

- 2026-07-03 — **Slivers persisted after the seconds-level fix** (some carrying real
  caption text — split tails keep their parent's properties). Deeper cause: Premiere
  snaps item edges to the FRAME grid, so sub-frame overlaps re-emerge after insertion
  no matter how clean the seconds are. Fix: `planFrameTimings` — all boundaries
  quantized to the sequence's own grid (`Sequence.getTimebase()` ticks-per-frame ×
  integer frame math via `TickTime.createWithTicks`), ends clamped to next starts in
  frame space, sub-frame lines dropped. Overlap is now impossible on the grid
  Premiere snaps to. (Maintainer confirmed their test ritual always stops+reloads
  the plugin in UDT — the sliver test WAS running the seconds-level fix, so frame
  snapping is confirmed as the real mechanism, not stale-build noise.)

- 2026-07-03 — **Step 8 stress-verified**: after the frame-grid fix, a dozen
  consecutive style-change + Apply-to-all regeneration cycles succeeded with no
  sliver recurrence reported.
- 2026-07-03 — **Crash #2** (suspected near "Apply to all", but the 12× stress test
  afterwards passed — not reproducible on demand). Maintainer will capture the macOS
  crash report file on the next occurrence; the crashed-thread stack will
  distinguish our-API-usage from Premiere-internal causes.
- 2026-07-03 — **Crash dumps analyzed (both crashes).** Sentry minidumps recovered
  from `~/Library/Caches/Adobe/Premiere Pro/26.0/SentryIO-db/completed/` (copies in
  gitignored `crash-reports/`; custom minidump parser in the session scratchpad).
  Findings: BOTH crashes are EXC_BAD_ACCESS at the **identical instruction**
  (`Adobe Premiere Pro 2026 +0xaa692cc`), reached from JavaScript through
  `libdynamic-napi` (UXP's JS↔native bridge; second dump also via
  `dynamic-torqnative`, the UXP runtime) into Premiere's UXP host-API
  implementation cluster. Verdict: **a deterministic Adobe bug in the UXP API
  layer**, triggered by documented API usage under our workload; which specific
  call cannot be named without symbols. Strong escalation package (2 dumps +
  repro workload). Mitigation applied: per-line trim+scale batched into ONE
  transaction (~3× fewer host-API round-trips per generate).

- 2026-07-03 — Step 9 built: Timing section (UI_COMPONENTS §4) with the exact field
  labels and warning copy; warnings render amber inline and NEVER block. The
  settings genuinely apply: `minSec` extends short captions (bounded by the next
  caption minus gap), `maxSec` caps display AND feeds the wrapper's duration
  budget (re-wraps live), `gapMs` trims breathing room between contiguous
  captions, `transitionMs` is stored + warned but inert until template v2 exposes
  the ramp (disclosed in the panel). Line preview marks WCAG-out-of-bounds
  timecodes amber. Pure logic in `src/timing.ts`; 8 new tests (59 total).

- 2026-07-03 — Timing-panel warnings confirmed live (transition 0 → exact amber
  copy, applied anyway). Yesterday's batching mitigation broke a scoping rule:
  Actions created before the executeTransaction callback (even inside the same
  lockedAccess) go stale intermittently — generate died at ~7/38 with "script
  object is no longer valid". Fixed: actions created in-callback; batching kept.
- Maintainer reminder: the Transition duration field is INERT with template v1
  (fixed ≈150ms authored fade; disclosed under the field) — it starts driving the
  animation when template v2 exposes the ramp.

- 2026-07-03 — **Step 9 verified live** after the action-scoping fix: full generate
  completes again; timing warnings show exact copy and never block; settings apply.

- 2026-07-03 — Step 10 built: per-line overrides (UI_COMPONENTS §5). The line
  preview is now the per-caption editor: click a line → color override (hex) +
  italic toggle + "Clear overrides on this line" (exact copy); overridden lines get
  an accent marker. Overrides live OFF the derived lines in a store keyed by word
  range (`src/overrides.ts`): they survive re-wraps when the line's word range is
  unchanged, drop otherwise (never restyle different words), and are re-applied on
  every regenerate — persisting through global style changes per SPECIFICATION §7.
  Color rides the per-line patch (override merged into template values); italic
  writes `fontFSItalicValue` (control + per-run capParam array). 69 tests.

- 2026-07-03 — **CORRECTION + live results.** Color override verified live: lands on
  the exact selected line (Line 11, #BBBBBB over the Bold preset). The earlier
  "italic renders" claim was WRONG — that slant was the maintainer's own
  Properties-panel hand-edit (font size 88 gave it away), not our flag. Our
  `fontFSItalicValue` patch is inert, gated by the authored
  `capPropFontFauxStyleEdit: false` — exactly as pre-flagged. Attempted fix before
  resorting to an AE re-export: the gate is itself a definition.json field, so the
  patcher now sets `capPropFontFauxStyleEdit: true` (fonteditinfo + capParam) on
  italic lines. If the gate flip doesn't render either → fall back to the
  5-minute AE re-export with "Enable Faux Styles" checked.
- 2026-07-03 — **Scope decision (SPECIFICATION §7 updated first)**: Premiere's
  Properties panel is the official per-instance *finishing pass* — it can hand-tune
  fonts/sizes/colors/text on individual instances because we exposed the params.
  Plugin owns everything that must survive regeneration; regenerate DISCARDS
  Properties hand-edits (documented). The plugin deliberately will not grow
  per-caption font/size/bg/text-editing UI. (Possible future EXPERIMENTS idea:
  harvesting hand-edited color/number values back into the override store before
  regenerate — text/font not readable via API, so it would be partial.)

- 2026-07-03 — **Step 10 fully verified live**: Line 11 renders in the override
  color AND italic after the gate flip — `capPropFontFauxStyleEdit: true` patched
  per italic line works; NO template re-export needed. Overrides land on the
  exact selected line.

- 2026-07-03 — **Phase 2 opened. Per-run capability findings** (full key sweep of
  the shipped template's definition.json): the text capParam's arrays are PARALLEL
  per-text-run arrays — `fontTextRunLength` + `capPropTextRunCount` split the text
  into runs; `fontEditValue`/`fontSizeEditValue`/`fontFSItalicValue` and (newly
  found) `fontFSBoldValue`/`fontFSAllCapsValue`/`fontFSSmallCapsValue` carry one
  entry per run. **Per-word italic is patchable with the current template.**
  **NO per-run color field exists** in the serialization — `Text Color` is
  whole-caption; per-word color is GATED on an AE experiment (see Next).
  MOGRT_SPEC "Per-text-run styling" documents the recipe.
- 2026-07-03 — Phase 2 step 1 built: per-word italic emphasis (UI_COMPONENTS §5).
  `src/emphasis.ts`: store keyed by canonical WORD INDEX (stable across re-wraps
  by construction), each entry remembers the word's text so reconcile never
  restyles a different word; `buildLineRuns` folds the line-level italic override
  in and merges adjacent same-style runs (spaces belong to the preceding word's
  run). Patcher `applyRuns`: run boundaries + per-run italics, carry arrays
  expanded in parallel, faux-style gate flipped when any run is italic, rejects
  runs that don't span the text exactly. Plan/renderer pass runs through to the
  patch. Panel: the selected line's words render as clickable chips — click to
  toggle italic on just that word; "Clear overrides on this line" clears word
  emphasis too. 85 tests.

- 2026-07-03 — **Phase 2 step 1 verified live: MULTI-RUN RENDERING CONFIRMED.**
  Line 11 "of 26 projects across the" with words "26" + "projects" emphasized
  renders exactly "of *26 projects* across the" — italic mid-line, rest upright.
  Premiere honors `capPropTextRunCount` > 1 with parallel per-run arrays patched
  into definition.json (all Phase-1 patches were single-run). The test also
  exercised the run-merge path: two adjacent emphasized words shipped as ONE
  italic run between two upright runs. Per-text-run styling is now a proven
  capability of the patch channel.

- 2026-07-03 — Phase 2 step 3 built (step 2 leapfrogged — it waits on the AE
  recolor experiment): custom style save/load (SPECIFICATION §6, UI_COMPONENTS
  §2). `src/customStyles.ts`: a saved style is a StyleDef + id + name — the
  exact presets/style-presets.json entry shape; identity = slugified name (so
  re-saving a name updates in place); tolerant parse skips bad entries without
  losing the collection; file shape = presets schema + version (the §10
  export/import shape, on purpose). Persistence via UXP
  `localFileSystem.getDataFolder()` (verified in cc-ext-uxp-types) as
  custom-styles.json — plugin-level, survives projects. Panel: "Save as custom
  style…" reveals an inline name row; "My styles" dropdown (visible once one
  exists) loads into the working controls; Delete uses confirm-once. Editing
  any control deselects the loaded style (working style diverged). 95 tests.

- 2026-07-03 — **Step 3 verified live, full loop**: style "orioles" saved →
  plugin stopped + reloaded in UDT → style still listed → loaded → cleared +
  regenerated → renders the saved look (orange bar, 80% opacity). **Platform
  gate passed: `getDataFolder()` write/read works in Premiere's UXP runtime**
  — persistent plugin-level storage is now a proven capability (also
  de-risks step 4 export/import, which uses the same file shape).

- 2026-07-03 — Phase 2 step 4 built: style export/import (SPECIFICATION §10).
  Export writes the current working style (named after the loaded saved style,
  else the active preset) via `getFileForSaving` (verified in cc-ext-uxp-types)
  as a single-entry custom-styles.json-shaped file — so import needs no second
  parser. Import merges with save semantics (same slug updates in place; a
  multi-style file works too), auto-loads single-style files into the working
  controls, and reports skipped unreadable entries. 97 tests.

- 2026-07-03 — **Step 4 verified live, full round trip**: "orioles" exported →
  deleted from My styles → imported back → loads and renders. **Platform gate
  passed: `getFileForSaving` works in Premiere's UXP runtime** — every file API
  the plugin uses is now live-proven. Byte-audit of the exported artifact found
  one leak: the working style carried the source PRESET's `description` (e.g.
  Minimal's text on an orange style) into saves/exports, because `getPreset`
  returned the whole catalog entry. Fixed at both choke points: `getPreset`
  strips id/name/description; `makeCustomStyle` strips leftovers from styles
  saved before the fix. 98 tests.

- 2026-07-03 — **COLORTEST experiment ANSWERED: per-word color patch route
  CLOSED.** The maintainer authored a red middle word and exported; the
  embedded .aep differs from v1 (change landed) yet definition.json gained no
  new keys and `capPropTextRunCount` stayed 1 — fill color doesn't even
  create a run boundary; the serialization tracks font-edit properties only.
  **Route decided instead: emphasis slots** — text animators whose range
  (character indices) and color are driven by exposed sliders/color controls,
  i.e. proven patch primitives; requires moving base `Text Color` from the
  Fill effect to a base animator (same exposed name + value shape ⇒ no
  patcher change for base color). Two slots ⇒ up to two colored word-groups
  per line (documented limit). Folded into the fade v2 recipe
  (MOGRT_AUTHORING §B3); contract in MOGRT_SPEC "Fade v2 exposures".
  Plugin-side work (word→char-range mapping, slot patching, editor color per
  word) follows once v2 is exported and the animator route passes its live
  gate.

- 2026-07-03 — **Crash #3 analyzed: identical signature, third confirmation.**
  New Sentry dump (preserved in crash-reports/) parsed with the rebuilt
  minidump parser (now committed: `scripts/parse-minidump.py` — the scratchpad
  copy had the pre-fix THREAD offsets). Backtrace matches crashes #1–2
  FRAME-FOR-FRAME (module-relative): JS → libdynamic-napi → the same Premiere
  UXP host-API cluster (`+0xaa5f874 → +0xaa575ec → +0xaa58d38 → +0xaa69b1c…`).
  Only the garbage pointer differs (near-NULL 0x11 vs in-image address) —
  consistent with a use-after-free at one code site. Escalation package is now
  three dumps, one deterministic signature. **Action at time of crash, all
  three: the generate workload** (#1 style changes + regenerates, #2 near
  Apply-to-all, #3 right after Generate following a probe insert of v2) —
  never panel-idle work. Consistent with the insert → lazy-capsule-poll →
  transaction loop stressing the buggy host-API path.

- 2026-07-03 — **Template v2 authored (maintainer AE session, guided) and its
  three unproven mechanisms LIVE-VERIFIED in Premiere** via probe insert +
  Properties-panel drive: (1) expression-driven `Transition (ms)` visibly
  changes the fade — **EXPERIMENTS EXP-001 gate PASSED**; (2) emphasis-slot
  animators recolor exact char ranges — per-word color route proven; (3)
  layer-style Stroke outline renders. Contract byte-verified before Premiere
  (all 16 names/shapes/ranges/defaults). v2 committed with AE source.
- 2026-07-03 — Phase 2 step 2 + v2 wiring built: renderer ships
  legenda-fade-v2; Timing's Transition field now LIVE (patched per line);
  Outline controls added to Caption Style (Minimal's authored outline finally
  renders); word editor redesigned select-then-edit (click chip → italic
  checkbox + word color field; chips tint in their color); word colors map to
  emphasis slots via `buildEmphasisSlots` (char ranges, adjacent same-color
  merge, 2-slot truncation reported in the generate status). SPECIFICATION §7
  records the 2-slot limit. 113 tests.

## In progress
- **Step 2 / v2-wiring live checks**: (a) Transition duration field changes
  generated fades (150 vs 500); (b) Minimal preset renders its outline; (c)
  word color override renders on the exact word; (d) per-word italic still
  renders (no run-array regression); (e) 3+ colored word-groups on one line →
  status reports the skip.

## Next (Phase 2 build order)
1. ~~Per-word italic emphasis~~ — done, verified live.
2. Per-word color — built on the v2 emphasis slots; live verify pending
   (see In progress).
3. ~~Custom style save/load~~ — done, verified live (incl. persistence across
   plugin restart).
4. ~~Style export/import~~ — done, verified live (full round trip).
5. Additional animations/presets — after the Phase 1 close items: teleprompter
   template (MOGRT_SPEC strategies) + template v2 exposures (transition ramp,
   line height, letter spacing, alignment, outline).
- Still queued: Adobe escalation (text API + UXP crash package), custom track
  auto-creation, clip-offset time base.
- Side quests / unproven ideas live in `docs/EXPERIMENTS.md` (currently:
  EXP-001 curve-easing spike — sequenced after template v2).

## Decisions log
- 2026-07-02: Target UXP (not CEP/ExtendScript). Render via MOGRT (not scripted keyframes).
  Ingress via Transcript API (not caption-track API) + SRT fallback. Rationale in ARCHITECTURE.md.
- 2026-07-02: Plugin root = repo root; UDT loads /manifest.json. tsc emits src/ → dist/
  (gitignored); index.html references dist/main.js + src/panel.css directly (no bundler).
- 2026-07-02: Panel scripts are classic scripts (no top-level import/export;
  `moduleDetection: "legacy"`), because UXP `<script>` tags provide no CommonJS wrapper —
  a tsc module wrapper (`exports.__esModule`) would throw at runtime.
- 2026-07-02: Plain HTML controls (dark-themed) in step 1; adopt `sp-` elements per
  control only after confirming they render in the live Premiere panel.
- 2026-07-02: Standalone punctuation tokens (`type: "punctuation"`) merge into the
  preceding word (text + endSec + eos); leading punctuation prefixes the next word.
  Punctuation is never a wrappable unit. `eos` is kept on the internal word so the
  wrapper can prefer sentence-boundary breaks.
- 2026-07-02: Adobe's transcript spec is NOT vendored into this repo (licensing
  unclear); fetch it from the samples repo when needed. Key shape recorded above.
- 2026-07-02: SRT policies — display markup (`<i>`, `{\an8}`, …) is stripped; cue-internal
  line breaks are ignored (our wrapper re-wraps); `eos` is inferred from terminal
  punctuation (.!?…) since SRT carries no sentence data; word timing weights = character
  count. `meta.clipName` renamed `sourceName` (clip for transcripts, file for SRT).
- 2026-07-02: MOGRT templates are authored at **UHD 3840×2160** (fixed comp pixel
  dimensions; Premiere places AE templates at native size; downscale crisp, upscale
  soft). The renderer scales instances down per sequence via `Sequence.getFrameSize()`
  (verified in 26.3.0 defs, ~line 3183) + clip Motion → Scale (clip-intrinsic
  ComponentParam, not a MOGRT-internal param). StyleDef sizes stay 1080-referenced;
  size-like params are multiplied by designHeight/1080 when written to the template.
- 2026-07-02: Plugin-owned track v1 = the topmost video track, which must be EMPTY on
  first generate (clear message otherwise). Auto-manufacturing a track via
  `createInsertProjectItemAction`'s out-of-range auto-create is deferred: an AV donor
  clip would also create/shift AUDIO tracks — not worth the risk in v1.
- 2026-07-02: Caption/word times are assumed relative to sequence start (true when
  the transcribed clip sits at 0). Clip-offset handling is a known Phase-1 limitation
  to revisit with the timing panel (step 9).
- 2026-07-02: Wrapper policies — speaker changes and silences > 1.5s always break
  (captioning convention / no pause inside a line); sentence-boundary breaks kick in at
  ≥ 60% of the char budget; a line never exceeds 7s on screen by construction (distinct
  from the warn-only WCAG checks on *user-chosen* timing, which still never block).
  Lines store contiguous word ranges (`firstWord`/`lastWord`) rather than an index
  array — same meaning as ARCHITECTURE §4's `wordRefs[]`, cheaper to hold.

## Step 6 probe findings (2026-07-02, Premiere 26.3.0, legenda-fade-v1.mogrt)
- **Q1 answered — no auto-create.** `insertMogrtFromPath` REJECTS an out-of-range
  video track index ("Invalid parameter."); insert succeeded on an existing track.
  Renderer needs another way to obtain the plugin-owned track (re-scan defs for a
  track-add action; or `createInsertProjectItemAction`'s documented auto-create; or
  insert on the topmost existing track).
- **Q2 RESOLVED — exposed params ARE reachable, but populate lazily.** The
  insert-time dump showed ONLY intrinsic Opacity + Motion (initially alarming). The
  "Dump selected clip" probe on the now-loaded instance showed the full picture:
  a **`Graphic Parameters` component (matchName `AE.ADBE Capsule`)** with every
  exposed param present by exact display name — `Line Text`, `Text Color`,
  `Background Color`, `Background Opacity`, `Shadow Opacity`, `Legenda Version`.
  So the graphics component is appended AFTER the clip finishes loading. Renderer:
  insert → poll chain for `AE.ADBE Capsule` → then set params. (Now ARCHITECTURE
  hard constraint #6.)
- **Checkbox anomaly**: the `Background` checkbox surfaced with an EMPTY displayName
  (the `param ""` between Text Color and Background Color) — unmatchable by name.
  Decision: drop the checkbox; encode background on/off via `Background Opacity` 0,
  matching the shadow/outline pattern. Fold into the next fade export; current
  template is otherwise fully usable. MOGRT_SPEC Tier 1 updated.
- Confirmed the UHD downscale path: Motion component exposes `Scale`. Item duration
  3.97s ≈ the 4s comp.
- **Write prototype run (2026-07-02, first results):**
  - **Number WORKS** — `Background Opacity` = 100 set and read back. `getValueAtTime`
    returns a `{ value: X }` wrapper (matches `Keyframe.value` shape in defs).
  - **Color** — set did not throw; readback threw (readback since hardened to report
    why). Inconclusive; range still unconfirmed.
  - **`Line Text` (bare string): rejected — "Illegal Parameter type".** A source-text
    capsule param is not plain-string type (defs: createKeyframe throws when value
    type ≠ param type). **Scoped, cornered unknown — NOT a threat to the render
    design (§3):** the capsule is provably writable (number landed), and setting text
    is one experiment from resolved. Fix is almost certainly read-native-structure →
    swap the text field → write back.
  - Confirmed via grep: no text-specific value type or setter in the defs (only
    transcript `TextSegments`) — source text goes through the generic
    createKeyframe/createSetValueAction path with the correct value structure.
- **Diagnostics run #2 (2026-07-02) — Premiere's error message IS the documentation:**
  `getValueAtTime` throws for text/color params with "getValueAtTime is not supported
  for these value types. Use GetKeyframeAtTime to get a keyframe object at time. The
  value can be extracted from the keyframe object." ⇒ text/color are read via
  `getKeyframePtr(time)` → `keyframe.value.value`, and (hypothesis, matching why
  `createKeyframe(string)` threw) written by MUTATING the typed keyframe's
  `value.value` and passing it to `createSetValueAction`. Also learned: the unnamed
  checkbox param reads as plain `boolean` (outer `{"value":true}`); number params
  read fine via getValueAtTime; the earlier `Background Opacity` write persisted.
- **Run #3 (2026-07-02): `getKeyframePtr(TIME_ZERO)` returns NOTHING for the static
  text/color params** — they have no keyframe at any *time* (not time-varying), so
  the "at time" door is the wrong one. Numbers/boolean still read via getValueAtTime.
- **Run #4 (2026-07-02): split verdict.** COLORS: `getStartValue()` returns a
  keyframe ✓ but our `keyframe.value.value` extraction found `undefined` — value is
  behind a different shape (host getters / possibly `keyframe.value` IS the Color).
  TEXT: all three doors empty (`getStartValue`, `getKeyframePtr()` bare and with
  TIME_ZERO) — text params differ in kind, not just shape.
- **Probes upgraded (awaiting run #5): forensic inspector.** For any param that
  fails the simple read: per-door outcome (thrown-with-message vs returned-falsy,
  separately), `isTimeVarying` + `areKeyframesSupported`, and a deep dump of any
  obtained keyframe — own AND prototype property names (host objects hide fields
  behind non-enumerable getters), `.value` shape, and probes of likely fields
  (`.value.value`, color channels, `.text`). Output pinpoints where color values
  live and whether text is API-reachable at all.
- **Run #5 (2026-07-02) — VERDICT.** Text: `areKeyframesSupported: false` on
  `Line Text` (true on colors), all doors null ⇒ **source text is not reachable via
  ComponentParam in 26.3** (now ARCHITECTURE hard constraint #7). Colors:
  `getStartValue()` returns the `Color` object ITSELF (keys red/green/blue/alpha/
  equals) — read shape solved; channel numbers (range 0–1 vs 255) print on the next
  inspector run after the probe fix.
- **Contingency VERIFIED statically (same day):** the .mogrt is a plain zip
  (deflate-compressed entries — runtime needs a small zip lib, e.g. fflate);
  `definition.json` → `clientControls[]` → `Line Text` control → `value.strDB[].str`
  holds the text default in plain JSON. Patched a copy via script
  (`mogrt/legenda-fade-v1-PATCHTEST.mogrt`, gitignored) swapping the default to
  "PATCHED BY LEGENDA OK". **Live test pending**: insert the PATCHTEST file via the
  probe's file picker — if the Program monitor shows the patched text, per-line text
  via template patching is proven end to end.
- **Run #6 (2026-07-02): color range ANSWERED + blank-monitor explained.**
  Color channels read as **0–1 floats** (white text 1,1,1; black bg 0,0,0). Alpha
  reads exactly 1/255 (0.00392…) — semantics unclear, flagged, likely unused by the
  Fill effect. The PATCHTEST insert showed NO text in the monitor — almost certainly
  NOT a patch failure: the probe inserted the UHD-native template unscaled into a
  ~1080 sequence, so the lower-third caption (comp y≈1880) sits below the visible
  center-crop (rows 540–1620). Probe now auto-scales inserted items
  (Motion → Scale = frameHeight/2160 × 100 via the proven number path).
  **Pending re-check**: manual Scale=50 on the existing PATCHTEST clip, or re-insert
  after reload — confirm "PATCHED BY LEGENDA OK" renders.
- **Run #7 (2026-07-02): Scale=50 confirmed the UHD pipeline** — caption renders
  crisp in the lower third. But it shows the AUTHORED default ("Line text goes
  here"), not the PATCHTEST string — either that clip came from the original file,
  or definition.json isn't what the renderer reads, or Premiere deduped by
  capsuleID (PATCHTEST kept the original's ID). **Structure finding**:
  `project.aegraphic` is a nested zip holding the full AE project
  (`mogrt_build.aep`, RIFX binary); the text default lives THERE (6× utf-8, 1×
  utf-16be occurrences) — definition.json may be EG-panel metadata only.
- **Experiment matrix built (PT2/PT3, gitignored):**
  - `…-PATCHTEST2.mogrt`: JSON text patched + FRESH capsuleID + name "…PT2"
    (controls the dedupe variable; tests whether definition.json drives render).
  - `…-PATCHTEST3.mogrt`: same as PT2 PLUS same-length byte-swap of the text in
    the binary .aep ("LEGENDA AEP PATCHED", RIFX chunk sizes preserved) + name
    "…PT3".
  - Insert BOTH via the probe (auto-scales now); the label+text combination
    observed decides the text-patching mechanism:
    PT2 patched-text ⇒ JSON drives render (dedupe was the earlier issue);
    PT2 default + PT3 patched ⇒ renderer reads the .aep → contingency must
    patch RIFX (same-length swap works; variable-length needs chunk rewriting);
    both default ⇒ patching route closed → escalate to Adobe, Phase 1 rethink.

## Step 6 — text-patching ROOT CAUSE FOUND (2026-07-02, late evening)
- After reboot + cache purge + renaming the authoring .aep all failed to change the
  render, a byte-level audit of the PT3 artifact found the answer: **PT3's
  definition.json still contained the original text** in a structure the patch
  never walked — `sourceInfoLocalized.<locale>.capsuleparams.capParams[]`, fields
  **`capPropDefault` and `textEditValue`** (the ExtendScript-era field name for
  MOGRT text values). Every environmental theory (extraction cache, dynamic-link
  to the authoring project, RIFX internals) was wrong; the patch was incomplete.
  PT1–PT3 results are all explained by these two unpatched fields.
- Environment eliminations weren't wasted: they proved the source had to be inside
  the file. `mogrt_build.aep.bak` can be restored to `mogrt_build.aep` (and should
  be committed — it's the template's source).
- **RESOLVED (run #8, 2026-07-02): PT4 renders the patched text.** JSON-only
  patching drives the render — the runtime patcher needs exactly one edit:
  `definition.json` inside the outer zip (three string fields: the
  `clientControls[]` value + `capsuleparams.capParams[]` `capPropDefault` and
  `textEditValue`; plus a fresh `capsuleID`/name per variant). No RIFX or
  inner-zip surgery. Premiere's Properties panel shows the full param set on the
  inserted instance working per spec (Line Text editable, Font/Font Size from the
  Tier-2 exposure, colors, opacities, Legenda Version).
- **Step-6 verified capability matrix — COMPLETE:** insert ✓ · lazy-capsule
  polling ✓ · param discovery by displayName ✓ · number write ✓ · color
  read/write (0–1 floats) ✓ · auto-scale to sequence via getFrameSize ✓ ·
  per-line text via definition.json patching ✓. Nothing about the renderer
  remains unverified.
- Transcript parser fix verified live on real footage: 501 words · 85 lines ·
  10 malformed tokens skipped.
- `getFrameSize()` vindicated: read 3840×2160 and 1920×1080 correctly on the two
  new sequences (the earlier 1182×665 was that sequence's real size).

## Discovered API limitations (append as found)
- Caption-track text read/write: not available (as of research date).
- Multi-keyframe ComponentParam writes: reported unreliable in current UXP builds.
- Non-exposed MOGRT params: not drivable.
- `@adobe/premierepro` type defs: no 25.x versions published (earliest is 26.2.0). We pin
  ~26.3.0 (what the ESLint plugin peers with) while manifest minVersion stays 25.6.0 —
  runtime-guard any API newer than the 25.6 floor.
- `@adobe/cc-ext-uxp-types` gaps: global `require` not declared (we declare it in
  src/globals.d.ts); `Element#classList` missing from defs (use `className`); standard
  "DOM" lib must be excluded to avoid conflicts (per its README).
- Premiere's transcript export violates its own published spec: real exports contain
  word tokens with NO `text` field (observed segments[0].words[44] on an interview
  transcript, 2026-07-02). Parser skips such tokens and reports a count
  (`meta.skippedTokens`) instead of failing the import.
- Premiere's UXP runtime has NO `TextEncoder`/`TextDecoder` globals (confirmed live:
  "TextDecoder is not defined"). Use fflate's `strToU8`/`strFromU8` for UTF-8.
- Callback-style host APIs (`TrackItemSelection.createEmptySelection`) scope the
  provided object's validity to the callback — using it afterwards throws "The
  script object is no longer valid". Do all work inside the callback.
- The same scoping applies to **Action objects**: create them INSIDE the
  `executeTransaction` callback that consumes them (creating them earlier — even
  within the same lockedAccess — intermittently throws "The script object is no
  longer valid" mid-generate; found live 2026-07-03 when batching broke this
  rule). Keyframes MAY be created outside the callback.
  Nuance for the defs-gap list above: cc-ext-uxp-types omissions are sometimes
  accurate about the runtime (this case) and sometimes not (`require`, `console`,
  `classList`) — verify live before declaring a global in globals.d.ts.
- UXP CSS (observed in Premiere 26.3, live): flexbox `gap` is ignored — use margins
  (fix confirmed live). Header/footer content rendered centered; `align-items: stretch`
  did NOT fix it (disproved live) — current fix sets `text-align: left`,
  `justify-content: flex-start`, and explicit `display` on semantic elements, all at
  once; exact culprit not isolated. `<button>` keeps a native grey background — our
  `background-color` on `.button-primary` was not applied (cosmetic; investigate in the
  style-panel pass, possibly by switching to `sp-button` if it renders).