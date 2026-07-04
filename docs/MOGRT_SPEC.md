# MOGRT SPEC — Legenda caption templates

The contract between the pre-authored caption template(s) and the plugin's renderer.
The renderer discovers parameters **by exposed display name** (there is no
get-by-name API — see PROJECT_STATUS step-2 record), so the names below are exact
and case-sensitive. Change a name here first, then in the template and the code,
in the same change. Last updated: 2026-07-02.

## Files
| File | Animation | Status |
| --- | --- | --- |
| `mogrt/legenda-fade-v1.mogrt` | Fade | shipped (superseded; kept for reference) |
| `mogrt/legenda-fade-v2.mogrt` | Fade + transition ramp + outline + emphasis slots | **shipped — renderer default** (live-verified 2026-07-03) |
| `mogrt/legenda-teleprompter-v1.mogrt` | Teleprompter (strategy 1: `Top Row` two-instance) | **authored + contract-verified** (2026-07-03); renderer support pending |

One MOGRT instance renders **one caption line**. The plugin inserts an instance per
line on the plugin-owned track, trims it to the line's duration, and sets the
exposed parameters. All animation lives inside the template (ARCHITECTURE §2.3).

## Exposed parameters

### Tier 1 — required (fade v1 must ship with all of these)
| Display name (exact) | EG control | Maps to StyleDef | Notes |
| --- | --- | --- | --- |
| `Legenda Version` | slider, value `1` | — | Renderer checks presence/value to confirm the template is ours. |
| `Line Text` | text (source text) | — | The caption line. |
| `Text Color` | color (Fill effect) | `textColor` | Fill effect flattens per-glyph color — fine until Phase 2 per-word color. |
| `Background Color` | color (shape fill) | `background.color` | |
| `Background Opacity` | slider 0–100 | `background.opacity` (×100); `0` ⇒ `background.enabled: false` — **no checkbox** | See note below. |

**`Background` checkbox — decision reversed (2026-07-03).** The probe
(2026-07-02) showed checkbox params surface with an empty displayName —
unmatchable via the ComponentParam API — and we planned to drop the checkbox.
The PATCH channel made that moot: checkboxes are matched by `uiName` in
definition.json and drivable at patch time (proven live, step 8). The shipped
v1 kept the checkbox and the renderer drives it; **v2 keeps it too**. (The
empty-displayName limitation still holds for any future ComponentParam-path
work — recorded here for that case.)

### Tier 2 — desired (native EG exposure exists; add after Tier 1 works)
| Display name (exact) | EG control | Maps to StyleDef |
| --- | --- | --- |
| `Font` | font selector (Source Text → Edit Properties) | `typography.fontFamily` + `fontWeight` (style is part of the font selection) |
| `Font Size` | font size (Source Text → Edit Properties) | `typography.fontSize` |
| `Shadow Opacity` | slider 0–100 (Drop Shadow effect's Opacity) | `dropShadow.opacity` (×100); `0` ⇒ `dropShadow.enabled: false` — no separate checkbox |

### Fade v2 exposures (recipe: MOGRT_AUTHORING §B; renderer must tolerate absence on v1)
| Display name (exact) | EG control | Maps to | Notes |
| --- | --- | --- | --- |
| `Transition (ms)` | slider 0–1000, default 150 | `TimingSettings.transitionMs` | Expression-driven opacity ramps; protected regions widened to 500 ms each, so >500 ms ramps render time-stretched. This IS the EXPERIMENTS EXP-001 gate. |
| `Outline Width` | slider 0–32, default 0 | `outline.width` (×designScale); `0` ⇒ `outline.enabled: false` — no checkbox | Layer-style Stroke (Outside), NOT text-style expressions — a returned text style would flatten the per-run arrays that per-word italic rides. |
| `Outline Color` | color control | `outline.color` | |
| `Emphasis 1 Start` / `Emphasis 1 End` | sliders 0–200, default 0 | per-word color override (char range) | Character indices, 0-based start / exclusive end; Start = End ⇒ slot inactive. Drive a text animator's range selector. |
| `Emphasis 1 Color` | color control | per-word color override | |
| `Emphasis 2 Start` / `Emphasis 2 End` / `Emphasis 2 Color` | as slot 1 | second colored range | Two slots ⇒ up to two independently colored word-groups per line (adjacent emphasized words merge into one range; a third disjoint group is a known limit). |
| `Duration (ms)` | slider 0–60000, default 4000 | the line's exact display duration | **Time-stretch inversion** (ARCHITECTURE hard constraint #8): Premiere uniformly stretches the comp onto the clip, so time expressions recover real clip time via `t = time × durS / thisComp.duration`. Patched on every line; default 4000 = the comp length, so AE preview behaves 1:1. Also required by the teleprompter template (blur + opacity masks). |
| `Legenda Version` | slider, value **2** | — | |

**`Text Color` mechanism change in v2 (name and value shape UNCHANGED).** The
v1 Fill *effect* flattens all glyph color and would paint over emphasis
animators, so v2 deletes it; base color becomes a Color Control driving a
whole-text base animator. The exposed control still serializes as a color
clientControl named `Text Color` — the patcher needs no change for base color.
Emphasis animators sit after the base animator and override it inside their
ranges without touching the text document (per-run italic unaffected).

Also authored into v2: **Faux Styles enabled** on Line Text's EG properties
(exports `capPropFontFauxStyleEdit: true`; the patcher's per-line gate flip
becomes redundant-but-harmless).

**Deliberately NOT in v2** (decided 2026-07-03): `Line Height` — one instance
renders one line; leading has no visible effect on single-line point text
(StyleDef carries it for a multi-line future). `Letter Spacing` — only
reachable via a text-style expression on Source Text, which applies one style
to the whole text and would flatten per-run italic (a shipped feature); stays
deferred. `Alignment` — all presets center; paragraph alignment is not
expression-drivable; stays deferred.

### Tier 3 — still deferred
- Background `cornerRadius` / `paddingX` / `paddingY` (preset-typical values
  baked into the template), shadow blur/distance, a third+ emphasis slot
  (two ship in v2 — see the fade v2 table).

## Animation behavior

### Fade (`legenda-fade-v1`)
- Intro: opacity 0 → 100 over ≈150 ms (5 frames @ 30 fps). Outro: mirror of intro.
- Author intro/outro as **protected regions** (responsive design – time) so
  trimming the instance to any line duration ≥ ~500 ms keeps both ramps intact.
- Text: single line, centered on screen-bottom third, anchor centered so
  `Font Size` changes grow from the center. Background: rounded rect sized to
  text (auto-size with padding baked per the Clean preset values).

### Teleprompter (`legenda-teleprompter-v1`) — prototype before polishing
Spec behavior (SPECIFICATION §4): two lines visible; new line enters at the
bottom; existing line pushes up; the line leaving the top blurs + fades out;
the incoming line resolves out of blur into focus.

The hard problem: a line is on screen across *two* consecutive line-slots
(bottom during its own, top during the next), and slot lengths vary — a single
instance cannot key the push at a fixed offset from its in/out points.
Candidate strategies, to be prototyped in this order:
1. **Two instances per line** — same text inserted twice: once as `Row: Bottom`
   (own slot) and once as `Row: Top` (next line's slot), with **`Top Row`
   exposed as a checkbox** (exact name; patch channel drives checkboxes). The
   "push" is a cut masked by the blur-out/blur-in ramps at the boundary
   (recipe: MOGRT_AUTHORING §C). Doubles instance count; renderer already
   knows both time ranges. **Renderer consequence: top-row instances overlap
   bottom-row ones in time ⇒ a SECOND plugin-owned track** (insert-split
   semantics forbid overlap on one track).
2. **Single instance spanning two slots** with the push authored at the start
   of the outro protected region. Only works if the outro can carry the
   full push+top+exit phase with acceptable distortion under time-stretch.
If both fail visually, fall back: ship fade only in Phase 1 and record the
constraint (WCAG warn-never-block philosophy does not apply here — this is a
scope call, update SPECIFICATION.md if taken).

## Authoring workflow (After Effects)
1. Comp **3840×2160 (UHD)**, 30 fps, square pixels. A MOGRT comp has fixed pixel
   dimensions and Premiere places AE templates at native size; the renderer
   scales instances **down** to the sequence frame (`Sequence.getFrameSize()` →
   clip Motion → Scale — clip-intrinsic ComponentParam surface, so the
   exposed-params-only constraint is not violated). Downscale is crisp,
   upscale is soft — author at the largest target.
   **StyleDef sizes stay 1080-referenced**: the renderer multiplies size-like
   params by `designHeight / 1080` when writing them into the template
   (e.g. `fontSize: 48` → `Font Size` 96 in the UHD comp).
2. Text layer + shape-layer background; effects for outline (stroke) and
   drop shadow; blur only in the teleprompter template.
3. Expose properties via the Essential Graphics panel using the **exact names
   above**; set slider ranges as listed.
4. Add the `Legenda Version` text property (value `1`), keep it collapsed/last.
5. Export → `mogrt/` in this repo (binary committed; keep under ~2 MB, no
   external footage/fonts beyond system-safe Montserrat — note: user machines
   without Montserrat fall back per Premiere's font substitution).
6. Drop the file on the panel's **MOGRT probe** (dev section) and compare the
   dumped component/param names against this spec; paste the dump into
   PROJECT_STATUS's step-6 record.

## Runtime facts (confirmed by the step-6 probe, 2026-07-02, Premiere 26.3.0)
- **Exposed params live in a `Graphic Parameters` component, matchName
  `AE.ADBE Capsule`**, appended after the intrinsic `AE.ADBE Opacity` and
  `AE.ADBE Motion` components in the track item's component chain.
- **The Capsule component populates LAZILY.** Immediately after
  `insertMogrtFromPath`, the chain has ONLY Opacity + Motion. On the loaded clip
  (dumped from a timeline selection moments later) the Capsule and all params are
  present. **Renderer must insert, then poll the chain for `AE.ADBE Capsule`
  before setting params** (bounded retry — see ARCHITECTURE hard constraint).
- All exposed params surface with their **exact EG display names** (`Line Text`,
  `Text Color`, `Background Color`, `Background Opacity`, `Shadow Opacity`,
  `Legenda Version`) — name-based matching is viable. Exception: checkboxes
  (empty displayName — see Tier 1 note).
- `insertMogrtFromPath` **rejects out-of-range track indices** ("Invalid
  parameter."); it does NOT auto-create a track (open question #1 = no).

## Value read/write recipes (all confirmed live, 2026-07-02)
- **Numbers**: read `getValueAtTime` (returns `{value:N}` wrapper); write
  `createKeyframe(n)` + `createSetValueAction` in the transaction idiom.
- **Colors**: read `getStartValue()` — returns the `Color` object ITSELF
  (`red/green/blue/alpha`, **0–1 floats**; alpha semantics unclear, reads 1/255);
  write `createKeyframe(ppro.Color(r,g,b,a))` + `createSetValueAction`.
- **Booleans (checkboxes)**: readable via `getValueAtTime`, but the param's
  displayName is EMPTY — unmatchable; do not expose checkboxes (see Tier 1 note).
- **TEXT: not reachable via ComponentParam** (`areKeyframesSupported: false`,
  every read door null). **Recipe: per-line template patching** — rewrite
  `definition.json` inside the .mogrt zip: set the text in the `clientControls[]`
  value AND `sourceInfoLocalized.<locale>.capsuleparams.capParams[]`
  (`capPropDefault` + `textEditValue`), **set `fontTextRunLength` to
  `[newText.length]`** (the style run must span the whole new text — otherwise
  characters beyond the authored length render with fallback styling; found live
  2026-07-03), give each variant a fresh `capsuleID`, re-zip,
  `insertMogrtFromPath`. Confirmed: JSON-only patch changes the render; the
  embedded AE project does not need touching.
- **Scale-to-sequence**: intrinsic `AE.ADBE Motion` → `Scale` (number write) =
  `sequence.getFrameSize().height / 2160 × 100`, applied right after insert.
- **Styles at patch time (adopted, step 8)**: every Tier-1/2 style value is ALSO
  patchable in `definition.json` — set the control's `value` (color = `[r,g,b,a]`
  0–1 floats, slider = number, checkbox = boolean, matched by `uiName`) AND its
  capParam's `capPropDefault` (matched by `capPropMatchName` = control `id`, all
  locales). **Font family/size**: the Line Text control's `fonteditinfo`
  (`fontEditValue` PostScript-style string, `fontSizeEditValue` number in template
  px) plus the text capParam's per-text-run arrays (`fontEditValue: [name]`,
  `fontSizeEditValue: [px]`). Since "Apply to all" = regeneration (ARCHITECTURE
  §6), the patch channel is the style channel — no capsule polling needed.
  `fonteditinfo.fontFSItalicValue` is the Phase-1 route to per-line italics
  (step 10). The Background checkbox, unmatchable via the API, IS drivable here.
- **Per-text-run styling (Phase 2 route to per-word emphasis)**: the text
  capParam's arrays are PARALLEL per-run arrays — `fontTextRunLength: [n, …]`
  splits the text into runs (character counts, must sum to the text length),
  and `fontEditValue` / `fontSizeEditValue` / `fontFSItalicValue` /
  `fontFSBoldValue` / `fontFSAllCapsValue` / `fontFSSmallCapsValue` hold one
  entry per run; `capPropTextRunCount` is the run count. Faux-style values
  are gated by `capPropFontFauxStyleEdit` (flip true when any run uses one —
  confirmed live for italic, step 10). **There is NO per-run color field** in
  this serialization (full key sweep of the shipped template, 2026-07-03).
  **COLORTEST experiment ANSWERED (2026-07-03): route closed.** A template
  authored with a red middle word exported with NO new keys and
  `capPropTextRunCount` still 1 — fill color does not even create a run
  boundary; the serialization tracks font-edit properties only, and the color
  lives solely in the binary .aep (not patchable). Per-word color therefore
  goes through **emphasis slots** (text animators; see "Fade v2 exposures"),
  not the run arrays.

## Open questions still to answer
1. Plugin-owned track creation without auto-create: check defs for a track-add
   action, or use `createInsertProjectItemAction`'s documented auto-create, or
   insert on the topmost existing track and manage index bookkeeping.
2. Downscale sharpness at typical viewing sizes (informally looked fine at 50%
   and 30.8%; eyeball once more during step-7 verification).
