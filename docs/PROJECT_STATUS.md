# PROJECT STATUS — Legenda

Update this at the end of any session with meaningful changes (see CLAUDE.md → Update ritual).

Current phase: **Phase 1 — step 6 in progress: fade template authored; param surface
confirmed reachable via probe. Next: prototype setting a param, then step 7 renderer.**
Last updated: 2026-07-02.

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

## In progress
- **Maintainer action**: author `mogrt/legenda-fade-v1.mogrt` per docs/MOGRT_SPEC.md
  (Tier 1 params minimum, UHD comp), then run the panel's MOGRT probe on it and paste
  the dump here. Any installed/stock .mogrt can exercise the probe sooner to answer
  the auto-create-track and param-surface questions. Also check downscale sharpness:
  insert the UHD template into a UHD and a 1080 sequence and confirm crisp text.

## Open questions for the MOGRT prototype (step 6 — verify live)
- No explicit "add track" API found. `createInsertProjectItemAction` docs: an
  out-of-range track index creates a new track. Whether `insertMogrtFromPath` behaves
  the same is unverified — decide how the plugin-owned track gets created.
- How a MOGRT's exposed params (esp. the text field) surface in the component chain
  (component matchName, param displayName, value type for text) — needs a real MOGRT.
- Whether params on items returned by `insertMogrtFromPath` are settable immediately
  after insert within the same lockedAccess scope.

## Next (Phase 1 build order)
5. Line wrapper (screen-real-estate setting → derived lines).
6. Author/obtain Phase 1 MOGRT template(s) for teleprompter + fade with exposed params;
   document the exposed param names here.
7. Renderer: lay MOGRT instances per line at timecodes; set exposed params; regenerate on change.
8. Style panel (Clean/Bold/Minimal) + global "apply to all".
9. Timing panel with non-blocking WCAG warnings.
10. Line-level color/italic override.

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
- **Contingency sketch (only if text proves API-unreachable):** per-line .mogrt
  patching — a .mogrt is a zip whose definition JSON carries capsule param
  DEFAULTS incl. source text; plugin writes a patched copy per line and inserts
  that, style params still set via API. Costs a small zip dep (e.g. fflate) +
  temp-file churn; regeneration-over-mutation model absorbs it. NOT designing this
  until the forensic run says text is closed.

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
- UXP CSS (observed in Premiere 26.3, live): flexbox `gap` is ignored — use margins
  (fix confirmed live). Header/footer content rendered centered; `align-items: stretch`
  did NOT fix it (disproved live) — current fix sets `text-align: left`,
  `justify-content: flex-start`, and explicit `display` on semantic elements, all at
  once; exact culprit not isolated. `<button>` keeps a native grey background — our
  `background-color` on `.button-primary` was not applied (cosmetic; investigate in the
  style-panel pass, possibly by switching to `sp-button` if it renders).