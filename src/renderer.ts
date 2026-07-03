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
import { applyOverrideToValues, styleToTemplateValues, type StyleDef } from "./style";
import { applyTimingToLines, type TimingSettings } from "./timing";
import {
  planFrameTimings,
  PREMIERE_TICKS_PER_SECOND,
  sanitizeLineTimings,
  type CaptionLine,
  type FramePlanEntry,
} from "./wrap";

/** Presets are 1080-referenced; the template comp is UHD (MOGRT_SPEC). */
const DESIGN_SCALE = TEMPLATE_HEIGHT_PX / 1080;

const TEMPLATE_PLUGIN_PATH = "mogrt/legenda-fade-v1.mogrt";

let cachedTemplate: MogrtTemplate | null = null;

async function getTemplate(): Promise<MogrtTemplate> {
  if (!cachedTemplate) {
    cachedTemplate = loadTemplate(await readPluginFile(TEMPLATE_PLUGIN_PATH));
  }
  return cachedTemplate;
}

/** Track index the last generate used; Clear operates on it. */
let pluginTrackIndex: number | null = null;

/**
 * The plugin-owned track: the topmost video track, which must be free of
 * clips on first use. `insertMogrtFromPath` cannot create tracks (step-6
 * finding), and manufacturing one via insert-tricks risks shifting user
 * audio — so v1 asks the user to add an empty track instead of guessing.
 */
async function ensurePluginTrackIndex(sequence: {
  getVideoTrackCount(): Promise<number>;
  getVideoTrack(index: number): Promise<unknown>;
}): Promise<number> {
  const count = await sequence.getVideoTrackCount();
  const topIndex = count - 1;
  if (pluginTrackIndex === topIndex) {
    return topIndex; // our track from a previous generate (about to be cleared)
  }
  const top = (await sequence.getVideoTrack(topIndex)) as {
    getTrackItems(type: unknown, includeEmpty: boolean): Promise<unknown[]> | unknown[];
  };
  const items = await top.getTrackItems(ppro.Constants.TrackItemType.CLIP, false);
  if ((items as unknown[]).length > 0) {
    throw new Error(
      "The topmost video track has clips on it. Add an empty video track " +
        "above it (right-click a track header → Add Track), then Generate again."
    );
  }
  return topIndex;
}

export interface GenerateResult {
  inserted: number;
  cleared: number;
  trackIndex: number;
  scalePct: number;
  /** Lines dropped by timing sanitation (zero duration after clamping). */
  droppedLines: number;
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

/** Public: clear the plugin track (used by the Clear button). */
export async function clearCaptions(): Promise<number> {
  const { project, sequence } = await getActiveContext();
  if (!project || !sequence) {
    throw new Error("Open a project with an active sequence first.");
  }
  if (pluginTrackIndex === null) {
    // Fall back to the topmost track — that is where generates go.
    pluginTrackIndex = (await sequence.getVideoTrackCount()) - 1;
  }
  return clearPluginTrack(
    project as unknown as ProjectTxn,
    sequence,
    pluginTrackIndex
  );
}

export async function generateCaptions(
  lines: CaptionLine[],
  style: StyleDef,
  timing: TimingSettings,
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

  const txn = project as unknown as ProjectTxn;
  const template = await getTemplate();
  const styleValues = styleToTemplateValues(style, DESIGN_SCALE);
  const frame = await sequence.getFrameSize();
  const trackIndex = await ensurePluginTrackIndex(sequence);

  // Regeneration over mutation: clear our previous instances first.
  const cleared = await clearPluginTrack(txn, sequence, trackIndex);

  const editor = ppro.SequenceEditor.getEditor(sequence);
  let inserted = 0;
  let scalePct = 100;

  for (const [i, line] of plan.entries()) {
    const label = `Legenda ${String(i + 1).padStart(3, "0")}`;
    const patched = patchTemplate(template, {
      text: line.text,
      label,
      style: applyOverrideToValues(styleValues, line.override),
    });
    const path = await writeTempFile(`legenda-line-${i + 1}.mogrt`, patched);

    let items: unknown[] = [];
    txn.lockedAccess(() => {
      items =
        editor.insertMogrtFromPath(
          path,
          ppro.TickTime.createWithTicks(line.startTicks) as never,
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
        `Insert failed at line ${i + 1} of ${plan.length} ("${line.text}") — ` +
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
          item.createSetEndAction(ppro.TickTime.createWithTicks(line.endTicks))
        );
        if (timeVarying) {
          ca.addAction(scaleParam.param.createSetTimeVaryingAction(false));
        }
        ca.addAction(scaleParam.param.createSetValueAction(keyframe, true));
      }, `Legenda: caption ${i + 1}`);
    });

    inserted++;
    onProgress?.(inserted, plan.length);
  }

  pluginTrackIndex = trackIndex;
  return { inserted, cleared, trackIndex, scalePct, droppedLines };
}
