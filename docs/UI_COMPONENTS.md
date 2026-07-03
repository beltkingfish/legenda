# UI COMPONENTS — Legenda

The panel should read as a native Premiere panel: dark theme, compact controls, `sp-`
elements where supported. One persistent panel, vertically sectioned. Last updated: 2026-07-02.

## Panel sections (top to bottom)

### 1. Source
- Heading: "Source"
- State A (transcript detected): text — "Transcript found in this sequence." Button:
  **Import transcript**. Secondary link: "Use an SRT file instead".
- State B (no transcript): button **Import SRT file…**; helper text — "Tip: transcribe in
  Premiere's Text panel first for word-level timing, then import here."
- After import: show source type + word/line counts.

### 2. Caption Style
- Preset selector (segmented or dropdown): Clean · Bold · Minimal · Custom
- Typography: Font family, Weight, Size, Line height, Letter spacing, Alignment
- Color: Text color swatch
- Background: toggle **Background** (on/off) → Color swatch, Opacity slider
- Contrast: Outline width + color; Drop shadow toggle
- Row of actions: **Save as custom style…**, **Apply to all**
- **Save as custom style… (Phase 2)**: reveals an inline row — name field
  (placeholder "Style name") + **Save** + **Cancel**. Saving under an existing
  style's name updates that style (identity = slugified name). Status text
  confirms: `Saved "Name".` / `Updated "Name".`
- **My styles (Phase 2)**: dropdown labeled "My styles" (placeholder option
  "Load a saved style…"), shown only when at least one saved style exists.
  Selecting one loads it into the working style controls; applying still goes
  through Generate / Apply to all. **Delete** beside it uses the confirm-once
  pattern (`Really delete "Name"?`).
- Custom styles persist in the plugin's data folder (`custom-styles.json`,
  presets schema + `version` field — the same shape §10 export/import uses).

### 3. Animation
- Animation selector: **Teleprompter** · **Fade**
- Transition duration (ms) field (shared with Timing warnings)
- (Teleprompter) Lines visible: fixed 2 in Phase 1 (shown, disabled)

### 4. Timing (WCAG-aware; warnings never block)
- Field "Minimum display time (WCAG: 1.33s)" → warn if below.
- Field "Maximum display time (WCAG: 7s)" → warn if above.
- Field "Transition duration (rec: 100–200ms)" → warn if below ~100ms.
- Field "Gap between captions (rec: 0–200ms)" → warn if above.
- Warning affordance: small amber icon + inline text; value still applies.

### 5. Per-caption editor
- List/scrubbable list of lines with their in/out times.
- Selecting a line reveals: color override swatch, italic toggle.
- **Word emphasis (Phase 2)**: the selected line's words render as clickable chips
  under the label "Word emphasis"; clicking a word toggles italic on just that word.
  Emphasized chips render italic with an accent border. Helper text: "Click a word
  to italicize just that word." (Per-word *recolor* is pending the per-run color
  channel investigation — see PROJECT_STATUS.)
- "Clear overrides on this line" (also clears word emphasis within the line).

### 6. Generate / regenerate
- Primary button: **Generate captions** (lays MOGRT instances on the plugin track).
- Secondary: **Regenerate** (clears the plugin track and re-lays). Note: global style/
  timing changes require regenerate.

## Warning copy (exact strings)
- Below min: "Below accessibility standard (min 1.33s). Applied anyway."
- Above max: "Above accessibility standard (max 7s). Applied anyway."
- Fast transition: "Faster than recommended (100ms). Applied anyway."
- Large gap: "Gap larger than recommended (200ms) — may cause flicker between captions."

## Interaction principles
- Never modal-block on a warning. Warnings are inline and dismissible by ignoring.
- Destructive actions (Regenerate clears the track) confirm once.
- Match Premiere control sizing/spacing; avoid custom-looking widgets where an `sp-` element exists.