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
| `Legenda Version` | text | — | Literal `"1"`. Renderer checks presence to confirm the template is ours. |
| `Line Text` | text (source text) | — | The caption line. |
| `Text Color` | color | `textColor` | |
| `Background` | checkbox | `background.enabled` | |
| `Background Color` | color | `background.color` | |
| `Background Opacity` | slider 0–100 | `background.opacity` (×100) | |

### Tier 2 — desired (verify each is exposable from AE Essential Graphics; drop to
### Tier 3 with a note if not)
| Display name (exact) | EG control | Maps to StyleDef |
| --- | --- | --- |
| `Font` | font selector | `typography.fontFamily` + `fontWeight` (style is part of the font selection) |
| `Font Size` | slider 8–200 | `typography.fontSize` |
| `Letter Spacing` | slider −100–400 | `typography.letterSpacing` |
| `Outline` | checkbox | `outline.enabled` |
| `Outline Color` | color | `outline.color` |
| `Outline Width` | slider 0–20 | `outline.width` |
| `Shadow` | checkbox | `dropShadow.enabled` |
| `Shadow Opacity` | slider 0–100 | `dropShadow.opacity` (×100) |

### Tier 3 — deferred (not in v1; renderer must tolerate their absence)
- `Line Height` (leading exposure from EG is uncertain), text `Alignment`
  (paragraph alignment is not directly exposable), background `cornerRadius` /
  `paddingX` / `paddingY` (bake preset-typical values into the template),
  shadow blur/distance, per-word italic/color slots (Phase 2, ARCHITECTURE §9),
  `Transition (ms)` as a slider driving animation timing via expressions —
  author fade v1 with a **fixed 150 ms** intro/outro first; attempt the
  expression-driven slider only once the fixed version works end to end.

## Animation behavior

### Fade (`legenda-fade-v1`)
- Intro: opacity 0 → 100 over 150 ms. Outro: 100 → 0 over 150 ms.
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
1. Comp 1920×1080, 30 fps (MOGRTs scale; keep square pixels).
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

## Open questions the probe answers (from step-2 record)
1. Does `insertMogrtFromPath` auto-create a track when given an out-of-range
   video track index?
2. Under which component (matchName) do EG params surface, with which
   `displayName`s and value types?
3. Can params be set immediately after insert in the same/next lockedAccess?
   (Answered once a text param exists to set — our template's `Line Text`.)
