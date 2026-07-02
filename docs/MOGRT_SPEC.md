# MOGRT SPEC — Legenda caption templates

The contract between the pre-authored caption template(s) and the plugin's renderer.
The renderer discovers parameters **by exposed display name** (there is no
get-by-name API — see PROJECT_STATUS step-2 record), so the names below are exact
and case-sensitive. Change a name here first, then in the template and the code,
in the same change. Last updated: 2026-07-02.

## Files
| File | Animation | Status |
| --- | --- | --- |
| `mogrt/legenda-fade-v1.mogrt` | Fade | to author (first) |
| `mogrt/legenda-teleprompter-v1.mogrt` | Teleprompter | to author (after fade proves the pipeline) |

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

**No `Background` checkbox.** The probe (2026-07-02) showed a checkbox param
surfaces with an **empty displayName** — unmatchable by our name-based lookup.
So background on/off is encoded the same way as shadow/outline: `Background
Opacity` `0` means off. Template's bg-opacity expression drops the checkbox
factor. (Fold into the next fade export; the current template still works for
everything except driving the checkbox by name.)

### Tier 2 — desired (native EG exposure exists; add after Tier 1 works)
| Display name (exact) | EG control | Maps to StyleDef |
| --- | --- | --- |
| `Font` | font selector (Source Text → Edit Properties) | `typography.fontFamily` + `fontWeight` (style is part of the font selection) |
| `Font Size` | font size (Source Text → Edit Properties) | `typography.fontSize` |
| `Shadow Opacity` | slider 0–100 (Drop Shadow effect's Opacity) | `dropShadow.opacity` (×100); `0` ⇒ `dropShadow.enabled: false` — no separate checkbox |

### Tier 3 — deferred (not in v1; renderer must tolerate their absence)
- `Outline Width` / `Outline Color` (needs text style expressions —
  `setApplyStroke`/`setStrokeWidth` — fragile alongside EG-editable text; width `0`
  ⇒ disabled, no checkbox), `Letter Spacing` (same style-expression route),
  `Line Height` (leading exposure from EG is uncertain), text `Alignment`
  (paragraph alignment is not directly exposable), background `cornerRadius` /
  `paddingX` / `paddingY` (bake preset-typical values into the template),
  shadow blur/distance, per-word italic/color slots (Phase 2, ARCHITECTURE §9),
  `Transition (ms)` as a slider driving animation timing via expressions —
  author fade v1 with a **fixed ≈150 ms (5 frames @ 30 fps)** intro/outro first;
  attempt the expression-driven slider only once the fixed version works end to end.

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
   (own slot) and once as `Row: Top` (next line's slot), with `Row` exposed as
   a dropdown/checkbox. The "push" is a cut masked by the blur-out/blur-in
   ramps at the boundary. Doubles instance count; renderer already knows both
   time ranges.
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

## Open questions still to answer
1. **Set a Capsule param**: read a `ComponentParam` from the Capsule by matching
   `displayName`, then `createSetValueAction(createKeyframe(value))` for text/
   color/number — confirm each type writes. (This is the last unknown before the
   renderer; prototype next.)
2. Plugin-owned track creation without auto-create: check defs for a track-add
   action, or use `createInsertProjectItemAction`'s documented auto-create, or
   insert on the topmost existing track and manage index bookkeeping.
3. Downscale sharpness: insert the UHD template into both a UHD and a 1080
   sequence (scaled to fit) and confirm text renders crisply in each.
