# Claude Code — Legenda kickoff prompt (Phase 1)

Paste the block below as your first message to Claude Code, run from the repo root.
It assumes CLAUDE.md and the docs/ + presets/ files already exist in the repo.

---

You are building **Legenda**, a UXP plugin panel for Adobe Premiere (2026, v25.6+) that
generates expressive animated captions. Before doing anything else, read these files and
treat them as the single source of truth for the whole project:
`CLAUDE.md`, `docs/SPECIFICATION.md`, `docs/ARCHITECTURE.md`, `docs/PROJECT_STATUS.md`,
`docs/UI_COMPONENTS.md`, and `presets/style-presets.json`. Do not restate them back to me;
just internalize them and follow them.

**Platform rules you must respect (details in ARCHITECTURE.md):**
- Target **UXP**, not CEP/ExtendScript. Entry point `require("premierepro")`. Await async calls.
- **Verify every Premiere API method before you use it** against the `@adobe/premierepro`
  TypeScript definitions, the reference at developer.adobe.com/premiere-pro/uxp, and the
  AdobeDocs/uxp-premiere-pro-samples repo. If you cannot verify a method exists with the
  signature you need, stop and tell me — do not guess or hallucinate the API.
- Rendering is **MOGRT-driven**: the animation lives in pre-authored MOGRT template(s); the
  plugin inserts instances at timecodes and sets only **exposed** params. Do not script
  keyframe stacks or touch non-exposed MOGRT params.
- Ingress is the **Transcript API** (read `transcript_format_spec.json` from the Adobe
  samples repo; never invent the schema) with **SRT import** as the fallback path.
- WCAG timing = **warn, never block**. No network/transcription APIs in Phase 1.

**What to actually do in this first session (Phase 1, step 1 only — do not build ahead):**
1. Scaffold the UXP plugin. A starter `manifest.json` and `.gitignore` already exist at the
   repo root — verify/adapt the manifest (panel entrypoint, localFileSystem permission, host
   minVersion) rather than recreating it. Add a panel HTML/CSS shell
   themed to Premiere's dark UI, and a TypeScript setup with `@adobe/premierepro` types and
   `@adobe/eslint-plugin-premierepro`. Keep the file/folder layout clean under `src/`.
2. Add a tiny "hello sequence" probe that, on a button click, gets the active project and
   active sequence and prints their names to the panel — purely to confirm the API wiring
   and that the panel loads via UDT under Window → UXP Plugins.
3. Do **not** implement import, wrapping, MOGRT insertion, or styling yet. Those are later
   steps in PROJECT_STATUS.md.

**Working method I expect from you:**
- Before writing code that calls the Premiere API, briefly confirm the method exists in the
  type defs / samples and tell me what you verified.
- Make small, reviewable commits. Explain any deviation from the docs and update the docs in
  the same change if scope or a constraint shifts.
- When you finish this session's work, update `docs/PROJECT_STATUS.md`: move step 1 to Done,
  note what you verified about the API, and list exactly what's next.

Start by reading the source-of-truth files, then confirm your understanding of the Phase 1
step-1 scope in 3–4 bullets, then begin the scaffold.