# MOGRT AUTHORING — step-by-step recipes

Companion to MOGRT_SPEC.md (the contract). Hands-on After Effects recipes.
Written for AE 2024+; expressions use the JavaScript engine.
Last updated: 2026-07-03.

Recipes in build order:
- **§A** `legenda-fade-COLORTEST` — 5-minute throwaway experiment (per-word
  color gate). **DONE + ANSWERED 2026-07-03: route closed** (see §A verdict);
  per-word color moved into §B as emphasis slots (§B3).
- **§B** `legenda-fade-v2` — transition ramp (makes the Timing field live),
  outline, faux styles. Start from the v1 project.
- **§C** `legenda-teleprompter-v1` — the second animation style
  (MOGRT_SPEC strategy 1: two instances per line).
- **§1–9 below** — the original fade v1 recipe (kept for reference; v2 builds
  on this comp).

---

## §A. legenda-fade-COLORTEST (5 minutes, throwaway)

**Question it answers:** does AE's MOGRT exporter emit a per-text-run COLOR
field in definition.json when the authored text mixes fill colors? (The
shipped template's serialization has none — MOGRT_SPEC "Per-text-run
styling".) Yes ⇒ per-word color patches like per-word italic. No ⇒ the patch
route for per-word color is closed and we make a spec call.

1. Open `mogrt_build.aep`. **File → Save As** → `mogrt_colortest.aep`
   (protect the v1 source — do not export over `mogrt/legenda-fade-v1.mogrt`).
2. In the comp, select **Caption Text**. With the **Type tool, double-click
   the middle word only** (`text` in "Line text goes here") so just that word
   is highlighted.
3. Character panel → set the **fill color to pure red `FF0000`** for that
   selection. Deselect. (The Premiere render would still look white — the
   Fill effect flattens glyph color — that's fine; only the exported JSON
   matters here.)
4. Essential Graphics panel → **Export Motion Graphics Template…** →
   Local Drive → **Desktop** → name `legenda-fade-COLORTEST`.
5. Drop the file path in chat. The diff against v1's definition.json is the
   verdict; the .aep and .mogrt can be deleted afterwards.

**VERDICT (run 2026-07-03): route closed.** The export carried the red word
(embedded .aep differs from v1) yet definition.json gained NO new keys and
`capPropTextRunCount` stayed 1 — fill color doesn't even create a run
boundary; the serialization tracks font-edit properties only. Per-word color
therefore renders via text-animator **emphasis slots** (§B3), which use only
proven patch primitives (sliders + color controls).

---

## §B. legenda-fade-v2 (start from the v1 project)

Goals: (1) `Transition (ms)` slider driving the fade ramps — turns the
panel's inert Transition duration field live, and doubles as EXPERIMENTS
EXP-001's gate (an expression-driven exposed param changing animation
timing); (2) outline via layer-style Stroke (needed by the Minimal preset);
(3) per-word color **emphasis slots** (§A closed the patch route, so color
renders via text animators driven by exposed sliders/colors — §B3); (4) faux
styles enabled at author time. **Deliberately NOT in v2:**
- *Line height* — one instance renders ONE line; leading has no visible
  effect on single-line point text. Carried in StyleDef for a multi-line
  future, meaningless to expose now.
- *Letter spacing* — the only route is a text-style expression on Source
  Text, and a returned style applies to the WHOLE text: it would flatten the
  per-run arrays that make per-word italic work (proven live 2026-07-03).
  Not worth trading a shipped feature for. Stays deferred.
- *Alignment* — all three presets are centered and paragraph alignment is
  not expression-drivable. Stays deferred.

### B0. Setup
- Open `mogrt_build.aep` → **File → Save As** → `mogrt_build_v2.aep` (commit
  this alongside the export; v1's source stays untouched).
- Rename the comp **"Legenda Fade v2"** (Project panel → Enter). The EG
  panel's Name field should read `Legenda Fade v2` too.
- On the **Controls** layer, set the `Legenda Version` slider to **2**.

### B1. Transition slider + expression-driven fade
**REVISED 2026-07-03 after the live time-stretch finding (ARCHITECTURE hard
constraint #8): Premiere uniformly stretches the comp onto the clip and does
NOT honor protected regions on our instances — expressions must invert the
stretch using the patched real duration.**
1. On **Controls**, add TWO **Slider Controls**, renamed exactly:
   **`Transition (ms)`** value **150**, and **`Duration (ms)`** value **4000**
   (= the comp length, so AE preview is 1:1; the patcher writes each line's
   real duration at generate time).
2. On **Caption Text → Transform → Opacity**: **delete all four keyframes**,
   then Alt-click the stopwatch and paste:
   ```js
   const ms = thisComp.layer("Controls").effect("Transition (ms)")("Slider");
   const durS = thisComp.layer("Controls").effect("Duration (ms)")("Slider") / 1000;
   const t = time * durS / thisComp.duration; // invert Premiere's uniform stretch
   const d = Math.max(ms / 1000, 0.001);
   const fadeIn = linear(t, 0, d, 0, 100);
   const fadeOut = linear(t, durS - d, durS, 100, 0);
   Math.min(fadeIn, fadeOut)
   ```
   (The background bar needs no change — its opacity expression already
   follows the text layer's post-expression opacity.)
3. Protected regions: leave them as authored — they are NOT honored on
   API-inserted instances (constraint #8), so they no longer carry the ramps;
   the inversion above does.
4. Scrub in AE: with `Duration (ms)` at 4000 the preview behaves 1:1 — the
   fade ramps ~5 frames at slider 150 and widens at 500. Set both sliders
   back to their defaults (150 / 4000) before export.

### B2. Outline (layer-style Stroke — no text-style expressions, so per-run
### italic styling is untouched)
1. On **Controls**, add: **Slider Control** → rename **`Outline Width`**,
   value **0** (0 = off — same no-checkbox pattern as the opacities; range
   0–32); **Color Control** → rename **`Outline Color`**, black.
2. Select **Caption Text** → **Layer → Layer Styles → Stroke**. In the
   layer's Layer Styles → Stroke: set **Position: Outside**, then Alt-click
   the stopwatches and paste:
   - **Size**: `thisComp.layer("Controls").effect("Outline Width")("Slider")`
   - **Color**: `thisComp.layer("Controls").effect("Outline Color")("Color")`
   (Layer styles render AFTER effects, so the Fill effect's flat text color
   stays inside the stroke. AE px are UHD: preset width 2 patches as 4.)
3. Set `Outline Width` to 4 to eyeball it, then back to **0**.
4. **Checkpoint** — if a layer-style property refuses an expression or the
   stroke misrenders, stop here and report; the fallback design changes and
   guessing wastes an export cycle.

### B3. Per-word color — emphasis slots (replaces the Fill effect)
Text animators recolor character RANGES at render time without touching the
text document (per-run italic untouched); their ranges/colors are driven by
exposed sliders/color controls — the proven patch primitives. Base color
must move off the Fill effect first: the effect flattens ALL glyph color and
would paint over the animators.
1. **Delete the Fill effect** from Caption Text (Effect Controls → Fill →
   delete). Its EG entry (`Text Color`) drops out of the panel — re-added
   from Controls in §B5.
2. On **Controls**, add and rename:
   - **Color Control** → **`Text Color`**, white.
   - **Slider Control** ×4 → **`Emphasis 1 Start`**, **`Emphasis 1 End`**,
     **`Emphasis 2 Start`**, **`Emphasis 2 End`** — all **0**
     (Start = End ⇒ slot inactive).
   - **Color Control** ×2 → **`Emphasis 1 Color`**, **`Emphasis 2 Color`**.
3. **Base animator**: select Caption Text → in the timeline, Text →
   **Animate ▸ Fill Color ▸ RGB** → rename the animator **"Base Color"**.
   No range selector changes (default = whole text). Alt-click its
   **Fill Color** stopwatch:
   ```js
   thisComp.layer("Controls").effect("Text Color")("Color")
   ```
   The text renders white again — now via the animator.
4. **Emphasis animators** (twice — slot 1 shown): **Animate ▸ Fill Color ▸
   RGB** → rename **"Emphasis 1"**. Open its **Range Selector 1 →
   Advanced**: **Units: Index**, **Based On: Characters**, **Shape: Square**,
   **Smoothness: 0%** (crisp word edges). Alt-click and paste:
   - **Start**: `thisComp.layer("Controls").effect("Emphasis 1 Start")("Slider")`
   - **End**: `thisComp.layer("Controls").effect("Emphasis 1 End")("Slider")`
   - animator's **Fill Color**: `thisComp.layer("Controls").effect("Emphasis 1 Color")("Color")`
   Repeat as **"Emphasis 2"** wired to the slot-2 controls.
5. Timeline order must read **Base Color → Emphasis 1 → Emphasis 2** (later
   animators win inside their ranges).
6. Sanity check: set `Emphasis 1 Start` **5**, `End` **9** → exactly the word
   "text" ("Line text goes here", 0-based, end-exclusive) renders in the
   emphasis color. Reset both to **0**.

### B4. Faux styles at author time
- In the EG panel select **Line Text** → **Edit Properties…** → alongside
  Custom Font Selection + Font Size Adjustment, also check **Faux Styles**
  (exports `capPropFontFauxStyleEdit: true`, so the patcher's gate flip
  becomes belt-and-braces rather than load-bearing).

### B5. EG panel additions and export
- Add to the panel (drag → rename to the EXACT name):
  | Drag this | Rename EG entry to |
  | --- | --- |
  | Controls → Transition (ms) (slider) | `Transition (ms)` |
  | Controls → Duration (ms) (slider) | `Duration (ms)` |
  | Controls → Outline Width (slider) | `Outline Width` |
  | Controls → Outline Color (color) | `Outline Color` |
  | Controls → Text Color (color) | `Text Color` (replaces the Fill-effect entry deleted in §B3) |
  | Controls → Emphasis 1 Start (slider) | `Emphasis 1 Start` |
  | Controls → Emphasis 1 End (slider) | `Emphasis 1 End` |
  | Controls → Emphasis 1 Color (color) | `Emphasis 1 Color` |
  | Controls → Emphasis 2 Start (slider) | `Emphasis 2 Start` |
  | Controls → Emphasis 2 End (slider) | `Emphasis 2 End` |
  | Controls → Emphasis 2 Color (color) | `Emphasis 2 Color` |
- Keep every v1 entry (including the `Background` checkbox — the patch
  channel drives checkboxes, the old drop-decision is cancelled; see
  MOGRT_SPEC). Keep `Legenda Version` last. Slider ranges: Transition (ms)
  0–1000, Duration (ms) 0–60000, Outline Width 0–32, Emphasis Start/End 0–200.
- Export → Local Drive → this repo's `mogrt/` → **`legenda-fade-v2`**.
  Commit `legenda-fade-v2.mogrt` + `mogrt_build_v2.aep`; v1 stays shipped
  until v2 passes live checks (renderer keeps pointing at v1 until the
  plugin work lands).

### B6. Live checks (with the plugin, after my renderer/patcher update)
- Transition 150 vs 500 ms visibly differ on generated captions (EXP-001
  gate ✓/✗). Minimal preset renders its 2 px outline. Per-word italic still
  renders (nothing regressed the run arrays). A per-word color override
  renders via an emphasis slot; base `Text Color` still patches (animator
  route, same exposed name).

---

## §C. legenda-teleprompter-v1 (strategy 1: two instances per line)

Spec behavior (SPECIFICATION §4): two lines visible; a new line blurs in at
the bottom; the previous line sits above it; the line leaving the top blurs +
fades out. Strategy 1 (MOGRT_SPEC): **each caption line gets TWO instances**
— `Top Row` unchecked during its own slot (bottom position), checked during
the NEXT line's slot (top position). The "push" is a cut at the slot
boundary, masked because EVERY instance blurs in and blurs out. Renderer
note (plugin side, not yours): top-row instances overlap bottom-row ones in
time, so they land on a SECOND plugin-owned track.

### C0. Comp
- In `mogrt_build_v2.aep` (after §B): duplicate the **Legenda Fade v2** comp
  (Project panel → Ctrl/Cmd+D), rename **"Legenda Teleprompter v1"**. Keep
  everything — the rig below edits the copy. Set `Legenda Version` to **1**
  (it versions THIS template). EG panel: point it at the new comp, Name
  `Legenda Teleprompter v1`.

### C1. Row switch
- On **Controls**, add a **Checkbox Control** → rename **`Top Row`**,
  unchecked.

### C2. Position by row
- **Caption Text → Transform → Position**, Alt-click stopwatch:
  ```js
  const top = thisComp.layer("Controls").effect("Top Row")("Checkbox");
  top == 1 ? [1920, 1710] : [1920, 1880]
  ```
  (170 UHD px of row spacing keeps the two background bars from overlapping
  at 96 px type; tune to taste after a render. The bar follows automatically
  — its position expression tracks the text layer.)

### C3. Blur ramps (the push mask + the spec's blur in/out)
**REVISED 2026-07-03 for the time-stretch inversion (constraint #8) — needs
the `Duration (ms)` slider on Controls (§B1 step 1; the §C0 duplicate carries
it).**
- **Caption Text** → Effect → Blur & Sharpen → **Gaussian Blur** (NOT the
  Legacy one under Obsolete); check **Repeat Edge Pixels**. Alt-click
  **Blurriness**:
  ```js
  const durS = thisComp.layer("Controls").effect("Duration (ms)")("Slider") / 1000;
  const t = time * durS / thisComp.duration; // invert Premiere's uniform stretch
  const B = 32;
  const f = 0.15;
  const blurIn = linear(t, 0, f, B, 0);
  const blurOut = linear(t, durS - f, durS, 0, B);
  Math.max(blurIn, blurOut)
  ```
  Identical for both rows on purpose: bottom-instance blur-out + top-instance
  blur-in together mask the boundary cut; bottom blur-in = the incoming line
  resolving into focus; top blur-out = the leaving line defocusing.

### C4. Opacity by row (replace the §B expression on this comp)
- **Caption Text → Transform → Opacity** — replace the expression with:
  ```js
  const top = thisComp.layer("Controls").effect("Top Row")("Checkbox");
  const durS = thisComp.layer("Controls").effect("Duration (ms)")("Slider") / 1000;
  const t = time * durS / thisComp.duration;
  const f = 0.15;
  const fadeIn = top == 1 ? 100 : linear(t, 0, f, 0, 100);
  const fadeOut = top == 1 ? linear(t, durS - f, durS, 100, 0) : 100;
  Math.min(fadeIn, fadeOut)
  ```
  Bottom instances fade IN only (the line "continues" upward, so no fade-out
  at the cut); top instances fade OUT only. Fixed 150 ms masks in this v1 —
  no `Transition (ms)` here yet; keep that slider out of the EG panel for
  this template.

### C5. EG + export
- Protected regions: leave as-is — not honored on API-inserted instances
  (constraint #8); the inversion carries the timing.
- EG panel entries = the v1 Tier-1/2 set (Line Text, Text Color, Background,
  Background Color, Background Opacity, Shadow Opacity, Legenda Version)
  **plus `Top Row`** (checkbox) **and `Duration (ms)`** (slider, range
  0–60000, default 4000 — exact names). Faux Styles checked on Line Text as
  in §B4. No Transition, Outline, or Emphasis controls in this template's v1
  (the §C0 duplicate carries them — remove those EG entries and keep the
  comp's extra Controls effects unexposed; they're inert).
- Export → `mogrt/legenda-teleprompter-v1.mogrt`; commit with the .aep.

### C6. What "good" looks like (eyeball in AE before exporting)
- Preview with `Top Row` OFF: line blurs in at the bottom, sits sharp,
  defocuses at the end without fading.
- Toggle `Top Row` ON: line sits sharp at the upper position, then blurs AND
  fades out at the end.
- Imagine them butted at a cut: defocus-at-bottom → refocus-at-top reads as
  the push. If it reads as a flicker instead, the fallback is strategy 2
  (MOGRT_SPEC) — report before re-rigging.

---

## 0. Prerequisites
- Activate **Montserrat** (Bold; also ExtraBold + SemiBold for the other presets)
  via Creative Cloud → Manage Fonts (Adobe Fonts), so it's available in AE and
  auto-activates on end-user machines.

## 1. Composition
- New Composition: **"Legenda Fade v1"**, **3840×2160 (UHD)**, **30 fps**, square
  pixels, duration **4:00** (120 frames), background transparent (toggle
  transparency in preview to check).
- **Why UHD**: a MOGRT comp has fixed pixel dimensions and Premiere places AE
  templates at native size. The renderer scales each instance DOWN to the
  sequence frame (`Sequence.getFrameSize()` → clip Motion → Scale); AE-rendered
  graphics downscale crisply but upscale soft, so author at the largest target.
  All pixel values in this recipe are therefore 2× the 1080-referenced preset
  values in `presets/style-presets.json`.

## 2. Controls layer
- Layer → New → **Null Object**, rename the layer **"Controls"**.
- With it selected, add three Expression Controls effects (Effect → Expression
  Controls) and rename each **effect instance** (select effect name, Enter):
  1. **Slider Control** → rename `Legenda Version`, set value **1**.
  2. **Checkbox Control** → rename `Background`, leave **checked**.
  3. **Slider Control** → rename `Background Opacity`, set value **60**.
- The renames matter: expressions below reference these exact effect names.

## 3. Text layer
- Type tool → click (POINT text — do **not** drag a box; the auto-size rig needs
  point text) → type `Line text goes here`. Rename layer **"Caption Text"**.
- Character panel: **Montserrat Bold, 96 px** (= preset `fontSize: 48` at the
  1080 reference), fill white. Paragraph panel: **Center text**.
- Position ≈ **(1920, 1880)** — lower third, centered.
- Effect → Generate → **Fill**, color white. (This effect's Color becomes the
  exposed `Text Color`; it flattens glyph color, which is fine until Phase 2.)
- Effect → Perspective → **Drop Shadow**: Opacity **0%** (off by default),
  Direction 135°, Distance 8, Softness 16. (Its Opacity becomes `Shadow
  Opacity`; 0 means disabled — no separate checkbox.)

## 4. Background layer (auto-sizing bar)
- Layer → New → **Shape Layer**, rename **"Background"**, drag **below** the text
  layer. In Contents: Add → Rectangle, Add → Fill (no stroke).
- **Fill Color**: #000000. (Exposed later as `Background Color`.)
- **Rectangle Path 1 → Roundness**: 16.
- Alt-click the stopwatch on each property below and paste:
  - Rectangle Path 1 → **Size**:
    ```js
    const r = thisComp.layer("Caption Text").sourceRectAtTime(time, false);
    [r.width + 96, r.height + 48]
    ```
  - Rectangle Path 1 → **Position**:
    ```js
    const r = thisComp.layer("Caption Text").sourceRectAtTime(time, false);
    [r.left + r.width / 2, r.top + r.height / 2]
    ```
  - Transform (layer) → **Position**:
    ```js
    thisComp.layer("Caption Text").transform.position
    ```
  - Transform (layer) → **Opacity** (background toggle × opacity × fade):
    ```js
    const on = thisComp.layer("Controls").effect("Background")("Checkbox");
    const op = thisComp.layer("Controls").effect("Background Opacity")("Slider");
    const fade = thisComp.layer("Caption Text").transform.opacity;
    on * (op / 100) * fade
    ```
- Type in the text layer to confirm the bar hugs the text with 48 px side /
  24 px top-bottom padding (UHD px = the Clean preset's 24/12 at the 1080
  reference).

## 5. Fade animation (≈150 ms = 5 frames)
- On **Caption Text → Transform → Opacity**: keyframes
  **0% @ frame 0**, **100% @ frame 5**, **100% @ frame 114**, **0% @ frame 119**.
  Easy Ease (F9) optional. The background inherits the fade via its Opacity
  expression — do not keyframe the shape layer.

## 6. Protected regions (so trimming never eats the ramps)
- Composition → **Responsive Design – Time → Create Intro**; drag the region's
  right edge to **frame 5**.
- Composition → **Responsive Design – Time → Create Outro**; drag its left edge
  to **frame 114**.
- In Premiere, trimming the instance now stretches only the middle.

## 7. Essential Graphics panel (names are the API contract — copy exactly)
- Window → **Essential Graphics**. Primary composition: **Legenda Fade v1**.
  Template name: `Legenda Fade v1`.
- Add properties (drag from timeline into the panel, or Add Property), then
  rename each EG entry to the **exact** MOGRT_SPEC name:
  | Drag this | Rename EG entry to |
  | --- | --- |
  | Caption Text → Text → Source Text | `Line Text` |
  | Caption Text → Effects → Fill → Color | `Text Color` |
  | Controls → Background (checkbox) | `Background` |
  | Background → Contents → Fill → Color | `Background Color` |
  | Controls → Background Opacity (slider) | `Background Opacity` |
  | Caption Text → Effects → Drop Shadow → Opacity | `Shadow Opacity` |
  | Controls → Legenda Version (slider) | `Legenda Version` (keep last) |
- Select the `Line Text` entry → **Edit Properties…** → enable
  **Custom Font Selection** and **Font Size Adjustment** (Tier 2 `Font` /
  `Font Size`). How these surface to the UXP API is unknown until the probe
  dump — that's expected.
- Set slider ranges where offered: Background Opacity 0–100, Shadow Opacity
  0–100, Legenda Version 1–1.

## 8. Export
- EG panel → **Export Motion Graphics Template…** → Destination **Local Drive**
  → this repo's `mogrt/` folder → filename `legenda-fade-v1`.
- Accept the font prompt defaults (Adobe Fonts auto-activate on user machines;
  they are not embedded).

## 9. Verify against the contract
- In Premiere: `npm run build`, reload the Legenda panel, open a scratch
  sequence → **MOGRT probe (dev)** → pick the exported file.
- Paste the dumped component/param list into PROJECT_STATUS's step-6 record.
  Param names must match MOGRT_SPEC Tier 1 exactly; mismatches get fixed by
  renaming in the EG panel and re-exporting.

## Known sharp edges
- Point text only — the sourceRect rig misbehaves with paragraph (box) text.
- Rename *effect instances* on Controls before writing expressions; renaming
  afterwards breaks `effect("…")` references.
- Do not add a stroke to the background Fill; a second Fill/Stroke in the shape
  group changes the property paths used above.
- Keep the comp free of any other layers; stray layers export into the MOGRT.
