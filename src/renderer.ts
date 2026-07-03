// The step-7 renderer (ARCHITECTURE §3): lays one caption instance per line
// on the plugin-owned track. Per line, in chronological order: patch a
// template copy with the line's text → insert → trim to the line's duration
// (immediately, so insert-shift semantics never touch a previous instance) →
// scale to the sequence frame. Regeneration clears the plugin track and
// re-lays.

import { readPluginFile, writeTempFile } from "./files";
import { loadTemplate, patchTemplateText, type MogrtTemplate } from "./mogrtPatch";
import {
  scaleItemToSequence,
  ticks,
  type ProjectTxn,
  type TrackItemLike,
} from "./params";
import ppro from "./ppro";
import { getActiveContext } from "./premiere";
import type { CaptionLine } from "./wrap";

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

  let selection: { addItem(item: unknown, skipDup?: boolean): boolean } | null = null;
  ppro.TrackItemSelection.createEmptySelection((created: unknown) => {
    selection = created as typeof selection;
  });
  if (!selection) {
    throw new Error("Could not create a track item selection for cleanup.");
  }
  const captured = selection as { addItem(item: unknown, skipDup?: boolean): boolean };
  for (const item of items) {
    captured.addItem(item, true);
  }

  const editor = ppro.SequenceEditor.getEditor(
    sequence as Parameters<typeof ppro.SequenceEditor.getEditor>[0]
  );
  project.lockedAccess(() => {
    project.executeTransaction((ca) => {
      ca.addAction(
        (editor as unknown as {
          createRemoveItemsAction(sel: unknown, ripple: boolean, mediaType: unknown): unknown;
        }).createRemoveItemsAction(captured, false, ppro.Constants.MediaType.VIDEO)
      );
    }, "Legenda: clear captions");
  });
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
  onProgress?: (done: number, total: number) => void
): Promise<GenerateResult> {
  if (lines.length === 0) {
    throw new Error("Nothing to generate — import a transcript or SRT first.");
  }
  const { project, sequence } = await getActiveContext();
  if (!project || !sequence) {
    throw new Error("Open a project with an active sequence first.");
  }
  const txn = project as unknown as ProjectTxn;
  const template = await getTemplate();
  const frame = await sequence.getFrameSize();
  const trackIndex = await ensurePluginTrackIndex(sequence);

  // Regeneration over mutation: clear our previous instances first.
  const cleared = await clearPluginTrack(txn, sequence, trackIndex);

  const editor = ppro.SequenceEditor.getEditor(sequence);
  let inserted = 0;
  let scalePct = 100;

  for (const [i, line] of lines.entries()) {
    const label = `Legenda ${String(i + 1).padStart(3, "0")}`;
    const patched = patchTemplateText(template, line.text, label);
    const path = await writeTempFile(`legenda-line-${i + 1}.mogrt`, patched);

    let items: unknown[] = [];
    txn.lockedAccess(() => {
      items =
        editor.insertMogrtFromPath(path, ticks(line.startSec) as never, trackIndex, 0) ??
        [];
    });
    const item = items.find(
      (candidate) =>
        typeof (candidate as TrackItemLike).getComponentChain === "function"
    ) as TrackItemLike | undefined;
    if (!item) {
      throw new Error(
        `Insert failed at line ${i + 1} of ${lines.length} ("${line.text}") — ` +
          `${inserted} caption(s) were inserted before the failure.`
      );
    }

    // Trim before the next insert so the default ~4s duration never overlaps
    // the next line's insert point (insert semantics split/shift at that time).
    txn.lockedAccess(() => {
      txn.executeTransaction((ca) => {
        ca.addAction(item.createSetEndAction(ticks(line.endSec)));
      }, "Legenda: trim caption");
    });

    scalePct = await scaleItemToSequence(txn, item, frame.height);
    inserted++;
    onProgress?.(inserted, lines.length);
  }

  pluginTrackIndex = trackIndex;
  return { inserted, cleared, trackIndex, scalePct };
}
