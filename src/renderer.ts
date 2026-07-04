// The step-7 renderer (ARCHITECTURE §3): lays one caption instance per line
// on the plugin-owned track. Per line, in chronological order: patch a
// template copy with the line's text → insert → trim to the line's duration
// (immediately, so insert-shift semantics never touch a previous instance) →
// scale to the sequence frame. Regeneration clears the plugin track and
// re-lays.

import { readPluginFile, writeTempFile } from "./files";
import { loadTemplate, patchTemplate, type MogrtTemplate } from "./mogrtPatch";
import {
  findComponentParams,
  MOTION_MATCH_NAME,
  TEMPLATE_HEIGHT_PX,
  type ProjectTxn,
  type TrackItemLike,
} from "./params";
import ppro from "./ppro";
import { getActiveContext } from "./premiere";
import {
  applyOverrideToValues,
  hexToRgba,
  styleToTemplateValues,
  type StyleDef,
} from "./style";
import { applyTimingToLines, type TimingSettings } from "./timing";
import {
  planFrameTimings,
  planTeleprompterInstances,
  PREMIERE_TICKS_PER_SECOND,
  sanitizeLineTimings,
  type CaptionLine,
  type FramePlanEntry,
} from "./wrap";

/** Presets are 1080-referenced; the template comp is UHD (MOGRT_SPEC). */
const DESIGN_SCALE = TEMPLATE_HEIGHT_PX / 1080;

/** Animation styles (SPECIFICATION §4) and their template files. */
export type AnimationId = "fade" | "teleprompter";

const TEMPLATE_PATHS: Record<AnimationId, string> = {
  fade: "mogrt/legenda-fade-v2.mogrt",
  teleprompter: "mogrt/legenda-teleprompter-v1.mogrt",
};

/** The fade template exposes two per-word color slots (MOGRT_SPEC).
    Teleprompter v1 has none — word colors are fade-only for now. */
const EMPHASIS_SLOT_COUNT = 2;

const templateCache = new Map<AnimationId, MogrtTemplate>();

async function getTemplate(animation: AnimationId): Promise<MogrtTemplate> {
  let template = templateCache.get(animation);
  if (!template) {
    template = loadTemplate(await readPluginFile(TEMPLATE_PATHS[animation]));
    templateCache.set(animation, template);
  }
  return template;
}

/** Track indexes the last generate used (bottom→top); Clear sweeps them. */
let pluginTracks: number[] | null = null;

/**
 * The plugin-owned tracks: the topmost `count` video tracks (fade = 1;
 * teleprompter = 2, because top-row instances overlap bottom-row ones in
 * time and insert-splitting forbids sharing a track). Each must be free of
 * clips on first use. `insertMogrtFromPath` cannot create tracks (step-6
 * finding), and manufacturing one via insert-tricks risks shifting user
 * audio — so v1 asks the user to add empty tracks instead of guessing.
 */
async function ensurePluginTracks(
  sequence: {
    getVideoTrackCount(): Promise<number>;
    getVideoTrack(index: number): Promise<unknown>;
  },
  count: number
): Promise<number[]> {
  const total = await sequence.getVideoTrackCount();
  if (total < count) {
    throw new Error(
      `This animation needs ${count} empty video tracks on top — add tracks ` +
        "(right-click a track header → Add Track), then Generate again."
    );
  }
  const wanted: number[] = [];
  for (let index = total - count; index < total; index++) {
    wanted.push(index);
  }
  for (const index of wanted) {
    if (pluginTracks?.includes(index)) {
      continue; // ours from a previous generate (about to be cleared)
    }
    const track = (await sequence.getVideoTrack(index)) as {
      getTrackItems(type: unknown, includeEmpty: boolean): Promise<unknown[]> | unknown[];
    };
    const items = await track.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
    if ((items as unknown[]).length > 0) {
      throw new Error(
        `The topmost ${count === 1 ? "video track" : `${count} video tracks`} must ` +
          "be empty for captions. Add empty video track(s) above your footage " +
          "(right-click a track header → Add Track), then Generate again."
      );
    }
  }
  return wanted;
}

export interface GenerateResult {
  inserted: number;
  cleared: number;
  /** Plugin-owned track indexes used (bottom→top). */
  trackIndexes: number[];
  scalePct: number;
  /** Lines dropped by timing sanitation (zero duration after clamping). */
  droppedLines: number;
  /** Word-color ranges beyond the template's two slots (skipped). */
  emphasisOverflow: number;
}

/** Remove every clip item on the plugin-owned track. Returns removed count. */
async function clearPluginTrack(
  project: ProjectTxn,
  sequence: {
    getVideoTrackCount(): Promise<number>;
    getVideoTrack(index: number): Promise<unknown>;
  },
  trackIndex: number
): Promise<number> {
  const count = await sequence.getVideoTrackCount();
  if (trackIndex >= count) {
    return 0;
  }
  const track = (await sequence.getVideoTrack(trackIndex)) as {
    getTrackItems(type: unknown, includeEmpty: boolean): Promise<unknown[]> | unknown[];
  };
  const items = (await track.getTrackItems(
    ppro.Constants.TrackItemType.CLIP,
    false
  )) as unknown[];
  if (items.length === 0) {
    return 0;
  }

  const editor = ppro.SequenceEditor.getEditor(
    sequence as Parameters<typeof ppro.SequenceEditor.getEditor>[0]
  ) as unknown as {
    createRemoveItemsAction(sel: unknown, ripple: boolean, mediaType: unknown): unknown;
  };

  // The selection object is only valid INSIDE createEmptySelection's callback
  // (confirmed live: using it afterwards → "The script object is no longer
  // valid."). Do everything — addItem, action, transaction — in the callback,
  // under one lock.
  let ran = false;
  project.lockedAccess(() => {
    ppro.TrackItemSelection.createEmptySelection((created: unknown) => {
      const selection = created as { addItem(item: unknown, skipDup?: boolean): boolean };
      for (const item of items) {
        selection.addItem(item, true);
      }
      project.executeTransaction((ca) => {
        ca.addAction(
          editor.createRemoveItemsAction(selection, false, ppro.Constants.MediaType.VIDEO)
        );
      }, "Legenda: clear captions");
      ran = true;
    });
  });
  if (!ran) {
    throw new Error(
      "createEmptySelection did not run its callback synchronously — report this."
    );
  }
  return items.length;
}

/** Public: clear the plugin track(s) (used by the Clear button). */
export async function clearCaptions(): Promise<number> {
  const { project, sequence } = await getActiveContext();
  if (!project || !sequence) {
    throw new Error("Open a project with an active sequence first.");
  }
  // Fall back to the topmost track — that is where generates go. (After a
  // plugin reload, a previous teleprompter generate's SECOND track is
  // unknown; regenerating with Teleprompter re-establishes both.)
  const tracks = pluginTracks ?? [(await sequence.getVideoTrackCount()) - 1];
  const txn = project as unknown as ProjectTxn;
  let removed = 0;
  for (const trackIndex of tracks) {
    removed += await clearPluginTrack(txn, sequence, trackIndex);
  }
  return removed;
}

export async function generateCaptions(
  lines: CaptionLine[],
  style: StyleDef,
  timing: TimingSettings,
  animation: AnimationId,
  onProgress?: (done: number, total: number) => void
): Promise<GenerateResult> {
  if (lines.length === 0) {
    throw new Error("Nothing to generate — import a transcript or SRT first.");
  }
  const { project, sequence } = await getActiveContext();
  if (!project || !sequence) {
    throw new Error("Open a project with an active sequence first.");
  }
  // Overlapping boundaries make inserts SPLIT earlier instances into sliver
  // debris — and Premiere snaps item edges to the FRAME grid, so the plan
  // must be frame-quantized, not just seconds-sanitized (see planFrameTimings).
  let ticksPerFrame = Number.parseInt(await sequence.getTimebase(), 10);
  if (!Number.isFinite(ticksPerFrame) || ticksPerFrame <= 0) {
    console.warn("Legenda: unreadable sequence timebase; assuming 30 fps grid");
    ticksPerFrame = PREMIERE_TICKS_PER_SECOND / 30;
  }
  // Timing settings shape the display windows (min/max/gap — warn-only
  // settings, always applied), then hard timing hygiene runs on the result.
  const timed = applyTimingToLines(lines, timing);
  const plan: FramePlanEntry[] = planFrameTimings(sanitizeLineTimings(timed), ticksPerFrame);
  const droppedLines = lines.length - plan.length;
  // Teleprompter (MOGRT_SPEC strategy 1): two instances per line on two
  // tracks; small gaps bridge (the line holds until the push), long gaps
  // break the chain.
  const instances: (FramePlanEntry & { topRow?: boolean })[] =
    animation === "teleprompter" ? planTeleprompterInstances(plan) : plan;

  const txn = project as unknown as ProjectTxn;
  const template = await getTemplate(animation);
  const styleValues = styleToTemplateValues(style, DESIGN_SCALE);
  const frame = await sequence.getFrameSize();
  const tracks = await ensurePluginTracks(sequence, animation === "teleprompter" ? 2 : 1);

  // Regeneration over mutation: clear our previous instances first —
  // including tracks a previous generate used that this one won't (e.g.
  // teleprompter's second track after switching back to fade).
  let cleared = 0;
  for (const trackIndex of tracks) {
    cleared += await clearPluginTrack(txn, sequence, trackIndex);
  }
  for (const trackIndex of pluginTracks ?? []) {
    if (!tracks.includes(trackIndex)) {
      cleared += await clearPluginTrack(txn, sequence, trackIndex);
    }
  }

  const editor = ppro.SequenceEditor.getEditor(sequence);
  let inserted = 0;
  let scalePct = 100;
  let emphasisOverflow = 0;

  for (const [i, entry] of instances.entries()) {
    const label = `Legenda ${String(i + 1).padStart(3, "0")}`;
    // Per-word color rides the fade template's emphasis slots; teleprompter
    // v1 has none (disclosed in the panel), so skip the mapping there.
    const slots = animation === "fade" ? entry.emphasisSlots ?? [] : [];
    emphasisOverflow += Math.max(0, slots.length - EMPHASIS_SLOT_COUNT);
    const emphasis = slots.slice(0, EMPHASIS_SLOT_COUNT).map((slot) => ({
      start: slot.startChar,
      end: slot.endChar,
      color: hexToRgba(slot.color),
    }));
    // Real display duration — the template's time-stretch inversion anchor
    // (ARCHITECTURE hard constraint #8). Tick math stays in Number range.
    const durationMs = Math.round(
      ((Number(entry.endTicks) - Number(entry.startTicks)) /
        PREMIERE_TICKS_PER_SECOND) *
        1000
    );
    const patched = patchTemplate(template, {
      text: entry.text,
      label,
      style: applyOverrideToValues(styleValues, entry.override),
      transitionMs: timing.transitionMs,
      durationMs,
      ...(entry.topRow !== undefined ? { topRow: entry.topRow } : {}),
      ...(entry.runs ? { runs: entry.runs } : {}),
      ...(emphasis.length > 0 ? { emphasis } : {}),
    });
    const path = await writeTempFile(`legenda-line-${i + 1}.mogrt`, patched);

    // Bottom row (and fade) on the lowest plugin track; top row on the topmost.
    const trackIndex = entry.topRow === true ? tracks[tracks.length - 1] : tracks[0];
    let items: unknown[] = [];
    txn.lockedAccess(() => {
      items =
        editor.insertMogrtFromPath(
          path,
          ppro.TickTime.createWithTicks(entry.startTicks) as never,
          trackIndex,
          0
        ) ?? [];
    });
    const item = items.find(
      (candidate) =>
        typeof (candidate as TrackItemLike).getComponentChain === "function"
    ) as TrackItemLike | undefined;
    if (!item) {
      throw new Error(
        `Insert failed at caption ${i + 1} of ${instances.length} ("${entry.text}") — ` +
          `${inserted} caption(s) were inserted before the failure.`
      );
    }

    // One transaction per line: trim (must land before the next insert, or
    // the default ~4s duration overlaps the next insert point) + scale.
    // Batching also cuts UXP host-API round-trips ~3× — a mitigation for the
    // crash both dumps place inside Premiere's UXP API layer (2026-07-03).
    scalePct = (frame.height / TEMPLATE_HEIGHT_PX) * 100;
    const motionParams = await findComponentParams(txn, item, MOTION_MATCH_NAME);
    const scaleParam = motionParams?.find((p) => p.name === "Scale");
    if (!scaleParam) {
      throw new Error(`Motion → Scale param not found on caption ${i + 1}`);
    }
    txn.lockedAccess(() => {
      // Keyframes may be created outside the transaction callback; ACTIONS
      // may not — like createEmptySelection's selection, an Action is scoped
      // to the callback that consumes it ("The script object is no longer
      // valid" mid-generate, found live 2026-07-03).
      const keyframe = scaleParam.param.createKeyframe(scalePct);
      const timeVarying = scaleParam.param.isTimeVarying();
      txn.executeTransaction((ca) => {
        ca.addAction(
          item.createSetEndAction(ppro.TickTime.createWithTicks(entry.endTicks))
        );
        if (timeVarying) {
          ca.addAction(scaleParam.param.createSetTimeVaryingAction(false));
        }
        ca.addAction(scaleParam.param.createSetValueAction(keyframe, true));
      }, `Legenda: caption ${i + 1}`);
    });

    inserted++;
    onProgress?.(inserted, instances.length);
  }

  pluginTracks = tracks;
  return { inserted, cleared, trackIndexes: tracks, scalePct, droppedLines, emphasisOverflow };
}
