# PROJECT STATUS — Legenda

Update this at the end of any session with meaningful changes (see CLAUDE.md → Update ritual).

Current phase: **Phase 1 — not started (scaffolding stage).**
Last updated: 2026-07-02.

## Done
- Product scope locked (SPECIFICATION.md).
- Architecture + hard platform constraints documented (ARCHITECTURE.md).
- Three style presets defined (presets/style-presets.json).
- UI layout, labels, and warning copy defined (UI_COMPONENTS.md).

## In progress
- (none yet)

## Next (Phase 1 build order)
1. UXP panel scaffold: manifest.json (permissions), panel entry, dark Premiere-themed shell.
   Confirm it loads via UDT and appears under Window → UXP Plugins.
2. Verify the Premiere API surface: confirm actual method names/signatures for active
   sequence, MOGRT insert, ComponentParam get/set, and transcript export — against the
   `@adobe/premierepro` TS defs and the AdobeDocs samples. Record findings here.
3. Read `transcript_format_spec.json` from the Adobe samples repo; implement transcript
   import → internal word model.
4. SRT parser → internal word model (interpolate word timing within cues).
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

## Discovered API limitations (append as found)
- Caption-track text read/write: not available (as of research date).
- Multi-keyframe ComponentParam writes: reported unreliable in current UXP builds.
- Non-exposed MOGRT params: not drivable.