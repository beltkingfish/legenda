# EXPERIMENTS — Legenda side quests

The airlock between ideas and the locked spec. SPECIFICATION.md is a contract
(CLAUDE.md: no unlisted features), so unproven ideas live HERE with a
hypothesis, a falsifiable gate, and a status — documented enough to survive
sessions, explicitly out of scope until they graduate. Last updated: 2026-07-03.

## Rules
1. A spike answers ONE falsifiable question. Throwaway quality is fine;
   polishing an unproven idea is not.
2. Spikes never block the trunk. Branch `spike/<name>`, rebased on main.
3. **Graduation is spec-first**: gate goes green → the feature moves into
   SPECIFICATION (and MOGRT_SPEC if it touches the template contract) →
   normal numbered build step. Entry moves to the log below.
4. Dead ends are recorded, not deleted — the negative result is the value.

---

## EXP-001 · Curve editor for caption transition easing

**Status: proposed** (2026-07-03) · Branch: `spike/curve-easing` (not yet cut)
· Sequencing: after step 10 and alongside the template-v2 authoring wave.

**Idea.** A panel curve editor (style-level, saved like any style property)
that shapes the timing/easing of caption enter/exit animation. A plain easing
dropdown (Linear/Ease/In/Out/InOut) is the cheap 90% fallback tier.

**Architectural stance.** The editor CONFIGURES animation; it never performs
it. Animation stays inside the template (ARCHITECTURE hard constraint #3).
The widget's output is a handful of numbers (durations + easing handles)
delivered through the proven definition.json patch channel — the same slot
the currently-inert "Transition duration" field already occupies.

**Explicit non-goals, any tier:** scripting keyframes via ComponentParam
(constraint #3; and the open UXP-layer crash makes its fragile corner worse),
and patching animation data inside the RIFX .aep binary (step-6 forensics:
dragons; deliberately never needed).

**Load-bearing unknown** (the ONLY thing the spike proves): can an AE
template reconstruct its fade from **expression-driven exposed params**, and
does a value set through our patch channel actually drive that expression at
render time? This is primarily an AE-authoring question — maintainer-side
work — with a small plugin probe alongside. Neither half proves anything
alone. (MOGRT_SPEC already tags expression-driven params Tier 3 /
attempt-later; this spike is that attempt, minimized.)

**Feasibility gate (falsifiable):** a single expression-driven exposed param
("Transition In (ms)"), set via the patch channel, visibly changes the fade
duration of an inserted caption on the timeline.

**First probe (paired, one session):**
1. Maintainer: re-export the fade template (or a scratch copy) with one new
   exposed slider `Transition In (ms)`, and the text layer's opacity intro
   keyed off it via an expression instead of fixed keyframes.
2. Plugin: patch the param per line (existing number-patch path — minutes of
   work), generate two captions with different values, eyeball the fades.
3. Bonus reading if green: whether the expression evaluates per-instance with
   protected-region trimming intact.

**Graduation checklist:**
- [ ] Gate green (screenshot in PROJECT_STATUS)
- [ ] Easing approach chosen: dropdown presets vs full curve widget (SVG +
      pointer events — verified-available DOM surface; avoid canvas)
- [ ] SPECIFICATION §12 gains the feature; MOGRT_SPEC gains the param contract
- [ ] Timing panel's "Transition duration" field wired to the real ramp
- [ ] Entry moved to the log below; spike branch folded into a numbered step

---

## Log

### Graduated
- (none yet)

### Dead ends
- (none yet)
