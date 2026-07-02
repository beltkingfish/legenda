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

interface ParamLike {
  displayName: string;
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

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
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
    const item = rawItem as InsertedItemLike;
    if (typeof item.getComponentChain !== "function") {
      continue;
    }
    try {
      const name = await item.getName();
      const duration = (await item.getDuration()).seconds;
      out.push("");
      out.push(`item "${name}" · default duration ${duration.toFixed(2)}s`);

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

  const report = out.join("\n");
  console.log(report); // also visible in UDT's debug console for copy/paste
  return report;
}
