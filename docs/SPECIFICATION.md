# SPECIFICATION — Legenda

Status: **Locked for Phase 1.** Changes require updating this file before implementation.
Last updated: 2026-07-02.

## 1. Purpose
Give Premiere editors expressive, animated captions that go well beyond the built-in
caption styles, driven from a transcript or SRT, with accessibility-aware timing.

## 2. Core concepts (two independent axes)
- **Caption Style** = the *look*: font family, weight, size, color, line height, letter
  spacing, alignment, background (on/off + color + opacity), outline/drop shadow.
- **Animation Style** = the *behavior*: how a caption enters and exits.
These are chosen independently and mixed freely (e.g. "Clean" look + teleprompter motion).

## 3. Reveal model
- **Per-line reveal** (Phase 1 primary). Text is wrapped into lines based on a
  user-configured screen-real-estate setting (target line length / max characters or a
  safe-area width). Each line animates in as a discrete unit.
- Word-level timing from the source is used to time line reveals accurately.
- **Per-word reveal** is a later phase built on the same pipeline (see §9).

## 4. Animation styles (Phase 1)
1. **Teleprompter** — two lines visible; when a new line arrives, existing lines push up;
   the line leaving the top blurs + fades out; the incoming line blurs in and resolves
   out of blur into focus.
2. **Fade** — simple fade in / fade out per line.
The animation itself is authored into pre-built MOGRT template(s); the plugin drives the
exposed parameters and timing (see ARCHITECTURE.md).

## 5. Built-in style presets (starting points, not a cage)
1. **Clean** — white Montserrat Bold, solid dark semi-transparent background bar; minimal,
   highly readable. Interviews / narrative.
2. **Bold** — high-contrast accent color, heavier weight, centered block, small solid
   background; energetic without chaos. Promo / fast-paced.
3. **Minimal** — text only, no background, thin outline or drop shadow for contrast;
   maximum transparency. Cinematic / visual-heavy.
Exact values live in `presets/style-presets.json`.

## 6. Custom styles
- Users can create their own styles by dialing in any Caption Style property and saving it
  under a name for reuse across projects.
- Presets and custom styles are the same data shape.

## 7. Editing model
- **Global styling** applies to all captions in the current style being built; an
  "Apply to all" action batch-updates every caption so the user need not touch each one.
- **Per-caption / per-word overrides**: the user can override color and toggle italics on
  individual words for emphasis (e.g. an interviewee stressing a word). Phase 1 targets
  line-level override reliably; per-word override is staged (see §9). Overrides persist
  through global updates unless explicitly cleared.

## 8. Input / import
- **Primary ingress: Premiere transcript.** The user transcribes in Premiere's Text panel,
  cleans up speech-to-text errors there, then launches the plugin. The plugin detects an
  available transcript and offers to import its text + word-level timing.
- **Fallback ingress: SRT file.** The user selects an .srt; the plugin parses cues and
  timecodes. (SRT is phrase-level; word timing within a cue is interpolated.)
- After import, the plugin panel is the single source of truth for styling. No round-trip
  syncing back to Premiere's transcript is required.

## 9. Accessibility timing (warn, never block)
Show the standard alongside each field; warn (non-blocking) when a value leaves the safe
zone; always honor the user's chosen value.
- Minimum on-screen time per line: **1.33 s** (warn below).
- Maximum on-screen time per line: **7 s** (warn above).
- Transition (fade/anim) duration: **100–200 ms** recommended (warn below ~100 ms).
- Gap between consecutive captions: **0–200 ms** (warn above; avoids "blink").
Line-level timing comes from the imported source and is authoritative once loaded.

## 10. Style sharing (later phase)
Export a style (preset or custom) as a JSON file; import a shared style file back into the
plugin. Same schema as `presets/style-presets.json` plus a version field.

## 11. UI surface
- Persistent **UXP panel** (sidebar), styled to feel native to Premiere.
- Sections: Source/Import, Caption Style, Animation, Timing, Per-caption editor, Presets.
- See UI_COMPONENTS.md for layout, labels, and warning copy.

## 12. Phasing
- **Phase 1**: UXP panel scaffold; transcript + SRT import; per-line wrapping; Clean/Bold/
  Minimal presets; teleprompter + fade via MOGRT; global styling + "apply to all";
  line-level color/italic override; WCAG timing warnings.
- **Phase 2+**: per-word emphasis (italic/color); custom style save/load; style export/
  import; additional animations; additional presets.
- **Explicitly out of scope for now**: cloud transcription APIs / API-key handling; native
  Premiere caption-track text read/write (API not available — see ARCHITECTURE.md).

## Non-goals
- Not a subtitle-standards export tool (captions render as graphics, not the native
  caption track).
- No AI/transcription service dependency in Phase 1.