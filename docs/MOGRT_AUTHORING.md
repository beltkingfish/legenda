# MOGRT AUTHORING — step-by-step recipe (fade v1)

Companion to MOGRT_SPEC.md (the contract). This is the hands-on After Effects
recipe for `mogrt/legenda-fade-v1.mogrt`. Written for AE 2024+; expressions use
the JavaScript engine. Last updated: 2026-07-02.

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
