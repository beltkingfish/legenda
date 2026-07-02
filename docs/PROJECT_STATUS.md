# PROJECT STATUS — Legenda

Update this at the end of any session with meaningful changes (see CLAUDE.md → Update ritual).

Current phase: **Phase 1 — step 4 built; awaiting live check with a real .srt file.**
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

## In progress
- Manual check (needs Premiere): click "Import SRT file…", pick any .srt → counts line
  shows "Imported srt · N words · file name". First use of the localFileSystem
  permission ("request" mode) — note whether Premiere/UXP shows a permission prompt.

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