// Dev probe for step 6 (docs/MOGRT_SPEC.md): inserts a .mogrt into the active
// sequence and dumps every component's matchName/displayName and each param's
// displayName — the ground truth the renderer's name-matching relies on.
// Read-only besides the insert itself (undoable in Premiere).
//
// Deliberately probes the step-2 open questions:
//   - passes an out-of-range video track index to see if a track is created
//   - reveals how Essential Graphics params surface in the component chain

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

export async function probeMogrt(path: string): Promise<string> {
  const { project, sequence } = await getActiveContext();
  if (!project || !sequence) {
    throw new Error("Open a project with an active sequence first.");
  }

  const tracksBefore = await sequence.getVideoTrackCount();
  const editor = ppro.SequenceEditor.getEditor(sequence);

  // Out-of-range index on purpose — answers open question #1 (auto-create).
  let inserted: unknown[] = [];
  project.lockedAccess(() => {
    inserted = editor.insertMogrtFromPath(
      path,
      ppro.TickTime.TIME_ZERO,
      tracksBefore,
      0
    );
  });

  const tracksAfter = await sequence.getVideoTrackCount();
  const out: string[] = [];
  out.push(`Inserted ${inserted.length} track item(s) at 0:00, video track index ${tracksBefore}.`);
  out.push(
    `Video tracks ${tracksBefore} → ${tracksAfter}: ` +
      (tracksAfter > tracksBefore ? "track auto-created ✓" : "no new track")
  );

  for (const rawItem of inserted) {
    const item = rawItem as InsertedItemLike;
    if (typeof item.getComponentChain !== "function") {
      continue;
    }
    const name = await item.getName();
    const duration = (await item.getDuration()).seconds;
    out.push("");
    out.push(`item "${name}" · default duration ${duration.toFixed(2)}s`);

    const chain = await item.getComponentChain();
    // Chain reads need lockedAccess (step-2 record); its callback is sync, so
    // collect refs inside and await the async names outside.
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
  }

  const report = out.join("\n");
  console.log(report); // also visible in UDT's debug console for copy/paste
  return report;
}
