// Dev probe for step 6 (docs/MOGRT_SPEC.md): inserts a .mogrt into the active
// sequence and dumps every component's matchName/displayName and each param's
// displayName — the ground truth the renderer's name-matching relies on.
// Read-only besides the insert itself (undoable in Premiere).
//
// Deliberately probes the step-2 open questions:
//   - tries an out-of-range video track index first (auto-create?), then falls
//     back to existing tracks, reporting every attempt
//   - reveals how Essential Graphics params surface in the component chain
//
// The probe never hides partial progress: whatever stage fails, everything
// learned up to that point is still reported.

import ppro from "./ppro";
import { getActiveContext } from "./premiere";

type ParamValue = string | number | boolean | object;

interface ParamLike {
  displayName: string;
  isTimeVarying(): boolean;
  createKeyframe(value: ParamValue): unknown;
  createSetTimeVaryingAction(timeVarying: boolean): unknown;
  createSetValueAction(keyframe: unknown, safeForPlayback?: boolean): unknown;
  getValueAtTime(time: unknown): Promise<unknown>;
}

interface ComponentLike {
  getMatchName(): Promise<string>;
  getDisplayName(): Promise<string>;
  getParamCount(): number;
  getParam(index: number): ParamLike;
}

interface ChainLike {
  getComponentCount(): number;
  getComponentAtIndex(index: number): ComponentLike;
}

interface InsertedItemLike {
  getName(): Promise<string>;
  getDuration(): Promise<{ seconds: number }>;
  getComponentChain(): Promise<ChainLike>;
}

interface ProjectTxn {
  lockedAccess(callback: () => void): void;
  executeTransaction(
    callback: (compoundAction: { addAction(action: unknown): boolean }) => void,
    undoLabel?: string
  ): boolean;
}

/** The Graphic Parameters component that holds a MOGRT's exposed params. */
const CAPSULE_MATCH_NAME = "AE.ADBE Capsule";

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function describeValue(value: unknown): string {
  if (value && typeof value === "object") {
    const c = value as { red?: number; green?: number; blue?: number; alpha?: number };
    if (typeof c.red === "number") {
      return `rgba(${c.red}, ${c.green}, ${c.blue}, ${c.alpha})`;
    }
    return JSON.stringify(value);
  }
  return String(value);
}

/** Shared chain dump for one track item; appends findings to `out`. */
async function dumpItem(
  project: { lockedAccess(cb: () => void): void },
  rawItem: unknown,
  out: string[]
): Promise<void> {
  const item = rawItem as InsertedItemLike;
  if (typeof item.getComponentChain !== "function") {
    return;
  }
  try {
    const name = await item.getName();
    const duration = (await item.getDuration()).seconds;
    out.push("");
    out.push(`item "${name}" · duration ${duration.toFixed(2)}s`);

    const chain = await item.getComponentChain();
    // Chain reads need lockedAccess (step-2 record); its callback is sync,
    // so collect refs inside and await the async names outside.
    const collected: { component: ComponentLike; params: string[] }[] = [];
    project.lockedAccess(() => {
      const count = chain.getComponentCount();
      for (let i = 0; i < count; i++) {
        const component = chain.getComponentAtIndex(i);
        const params: string[] = [];
        for (let j = 0; j < component.getParamCount(); j++) {
          params.push(component.getParam(j).displayName);
        }
        collected.push({ component, params });
      }
    });

    for (const { component, params } of collected) {
      const matchName = await component.getMatchName();
      const displayName = await component.getDisplayName();
      out.push(`  component "${displayName}" (matchName: ${matchName})`);
      for (const param of params) {
        out.push(`    param "${param}"`);
      }
    }
  } catch (err) {
    out.push(`  ✖ dump failed on this item: ${message(err)}`);
  }
}

/**
 * Dump the component chain of the track item(s) currently selected in the
 * timeline — distinguishes "MOGRT params surface after the clip loads" from
 * "MOGRT params never surface through the chain".
 */
export async function probeSelection(): Promise<string> {
  const { project, sequence } = await getActiveContext();
  if (!project || !sequence) {
    throw new Error("Open a project with an active sequence first.");
  }
  const selection = await sequence.getSelection();
  const items = await selection.getTrackItems();
  if (items.length === 0) {
    throw new Error("Select a clip in the timeline first (e.g. the inserted MOGRT).");
  }
  const out: string[] = [`selected item(s): ${items.length}`];
  for (const item of items) {
    await dumpItem(project, item, out);
  }
  const report = out.join("\n");
  console.log(report);
  return report;
}

/** Locate the Graphic Parameters capsule on a track item's chain, if present. */
async function findCapsule(
  project: ProjectTxn,
  item: InsertedItemLike
): Promise<{ param: ParamLike; name: string }[] | null> {
  const chain = await item.getComponentChain();
  const components: ComponentLike[] = [];
  project.lockedAccess(() => {
    const count = chain.getComponentCount();
    for (let i = 0; i < count; i++) {
      components.push(chain.getComponentAtIndex(i));
    }
  });

  let capsule: ComponentLike | null = null;
  for (const component of components) {
    if ((await component.getMatchName()) === CAPSULE_MATCH_NAME) {
      capsule = component;
      break;
    }
  }
  if (!capsule) {
    return null;
  }

  const params: { param: ParamLike; name: string }[] = [];
  project.lockedAccess(() => {
    const count = capsule.getParamCount();
    for (let i = 0; i < count; i++) {
      const param = capsule.getParam(i);
      params.push({ param, name: param.displayName });
    }
  });
  return params;
}

/**
 * Write-path prototype (step 6, open question #1): set one exposed param of
 * each value type — string, number, color — on the selected MOGRT, then read
 * each back. Proves the renderer can drive the template before step 7.
 */
export async function writeTestOnSelection(): Promise<string> {
  const { project, sequence } = await getActiveContext();
  if (!project || !sequence) {
    throw new Error("Open a project with an active sequence first.");
  }
  const selection = await sequence.getSelection();
  const items = (await selection.getTrackItems()) as unknown as InsertedItemLike[];
  if (items.length === 0) {
    throw new Error("Select the inserted MOGRT clip in the timeline first.");
  }

  const txn = project as unknown as ProjectTxn;
  const params = await findCapsule(txn, items[0]);
  if (!params) {
    throw new Error(
      `No "${CAPSULE_MATCH_NAME}" component on the selected clip — ` +
        "is it a loaded Legenda MOGRT?"
    );
  }

  // One representative write per value type the renderer needs.
  // Color range is assumed 0–1 float (AE convention); readback confirms.
  const targets: { name: string; value: ParamValue; note?: string }[] = [
    { name: "Line Text", value: "LEGENDA WRITE ✓" },
    { name: "Background Opacity", value: 100 },
    { name: "Text Color", value: ppro.Color(1, 0, 0, 1), note: "assuming 0–1 float RGBA" },
  ];

  const out: string[] = [`capsule params: ${params.map((p) => p.name).join(", ")}`, ""];

  for (const target of targets) {
    const match = params.find((p) => p.name === target.name);
    if (!match) {
      out.push(`• ${target.name}: not found on this template — skipped`);
      continue;
    }
    try {
      txn.lockedAccess(() => {
        if (match.param.isTimeVarying()) {
          txn.executeTransaction(
            (ca) => ca.addAction(match.param.createSetTimeVaryingAction(false)),
            `Legenda: ${target.name} static`
          );
        }
        const keyframe = match.param.createKeyframe(target.value);
        txn.executeTransaction(
          (ca) => ca.addAction(match.param.createSetValueAction(keyframe, true)),
          `Legenda: set ${target.name}`
        );
      });
      let readback = "(read failed)";
      try {
        readback = describeValue(await match.param.getValueAtTime(ppro.TickTime.TIME_ZERO));
      } catch {
        // readback is best-effort; the write is what matters
      }
      out.push(
        `• ${target.name}: set ✓ → readback ${readback}` +
          (target.note ? ` (${target.note})` : "")
      );
    } catch (err) {
      out.push(`• ${target.name}: write FAILED — ${message(err)}`);
    }
  }

  out.push("");
  out.push("Check the Program monitor: the caption should read the test text.");
  const report = out.join("\n");
  console.log(report);
  return report;
}

export async function probeMogrt(path: string): Promise<string> {
  const { project, sequence } = await getActiveContext();
  if (!project || !sequence) {
    throw new Error("Open a project with an active sequence first.");
  }

  const out: string[] = [];
  out.push(`file: ${path}`);

  const tracksBefore = await sequence.getVideoTrackCount();
  const editor = ppro.SequenceEditor.getEditor(sequence);

  // Attempt out-of-range first (answers auto-create), then existing tracks.
  const candidates = [...new Set([tracksBefore, Math.max(0, tracksBefore - 1)])];
  let inserted: unknown[] = [];
  let usedIndex = -1;
  for (const index of candidates) {
    try {
      let result: unknown[] = [];
      project.lockedAccess(() => {
        result = editor.insertMogrtFromPath(path, ppro.TickTime.TIME_ZERO, index, 0) ?? [];
      });
      if (result.length > 0) {
        inserted = result;
        usedIndex = index;
        out.push(`insert at video track index ${index}: ${result.length} item(s) ✓`);
        break;
      }
      out.push(`insert at video track index ${index}: returned no items`);
    } catch (err) {
      out.push(`insert at video track index ${index}: threw "${message(err)}"`);
    }
  }

  if (usedIndex === -1) {
    out.push("");
    out.push("✖ No insert attempt succeeded — see attempts above.");
    const report = out.join("\n");
    console.log(report);
    return report;
  }

  const tracksAfter = await sequence.getVideoTrackCount();
  out.push(
    `video tracks ${tracksBefore} → ${tracksAfter}` +
      (usedIndex === tracksBefore
        ? tracksAfter > tracksBefore
          ? " (out-of-range index auto-created a track ✓)"
          : " (out-of-range index accepted but no new track?)"
        : " (inserted on an existing track — out-of-range was rejected)")
  );

  for (const rawItem of inserted) {
    await dumpItem(project, rawItem, out);
  }

  const report = out.join("\n");
  console.log(report); // also visible in UDT's debug console for copy/paste
  return report;
}
