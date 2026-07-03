// Dev probes for step 6 (docs/MOGRT_SPEC.md). The step-6 investigation is
// complete — its findings live in MOGRT_SPEC "Runtime facts" and "Value
// read/write recipes" — but these probes stay: they are the fastest way to
// validate a re-exported template against the contract, and they document
// the working API recipes the step-7 renderer builds on.
//
// All probes report partial progress: whatever stage fails, everything
// learned up to that point is still shown.

import {
  CAPSULE_MATCH_NAME,
  findCapsule,
  scaleItemToSequence,
  type ComponentLike,
  type KeyframeLike,
  type ParamLike,
  type ParamValue,
  type ProjectTxn,
  type TrackItemLike,
} from "./params";
import ppro from "./ppro";
import { getActiveContext } from "./premiere";

/** Own + prototype property names (host objects hide fields behind getters). */
function allKeys(obj: unknown): string[] {
  if (!obj || (typeof obj !== "object" && typeof obj !== "function")) {
    return [];
  }
  const keys = new Set<string>(Object.getOwnPropertyNames(obj));
  const proto = Object.getPrototypeOf(obj) as object | null;
  if (proto && proto !== Object.prototype) {
    for (const key of Object.getOwnPropertyNames(proto)) {
      if (key !== "constructor") {
        keys.add(key);
      }
    }
  }
  return [...keys];
}

function tryGet(obj: unknown, key: string): unknown {
  try {
    return (obj as Record<string, unknown>)[key];
  } catch {
    return "(getter threw)";
  }
}

/** Deep-describe a keyframe host object: keys, value shape, likely fields. */
function describeKeyframeDeep(keyframe: KeyframeLike, out: string[]): void {
  out.push(`      keyframe keys: [${allKeys(keyframe).join(", ")}]`);
  // Run #5: for color params getStartValue returns the Color object ITSELF
  // (keys red/green/blue/alpha/equals) — probe value fields directly on it.
  for (const path of ["red", "green", "blue", "alpha", "text"]) {
    const direct = tryGet(keyframe, path);
    if (direct !== undefined) {
      out.push(`      .${path}: ${formatScalar(direct)}`);
    }
  }
  const value = tryGet(keyframe, "value");
  out.push(`      .value: ${typeof value}, keys [${allKeys(value).join(", ")}]`);
  for (const path of ["value", "red", "green", "blue", "alpha", "text"]) {
    const nested = value && typeof value === "object" ? tryGet(value, path) : undefined;
    if (nested !== undefined) {
      out.push(`      .value.${path}: ${formatScalar(nested)}`);
    }
  }
  const inner = value && typeof value === "object" ? tryGet(value, "value") : undefined;
  if (inner && typeof inner === "object") {
    out.push(`      .value.value keys: [${allKeys(inner).join(", ")}]`);
    for (const path of ["red", "green", "blue", "alpha", "text"]) {
      const nested = tryGet(inner, path);
      if (nested !== undefined) {
        out.push(`      .value.value.${path}: ${formatScalar(nested)}`);
      }
    }
  }
}

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function formatScalar(value: unknown): string {
  if (value && typeof value === "object") {
    const c = value as { red?: number; green?: number; blue?: number; alpha?: number };
    if (typeof c.red === "number") {
      return `Color(${c.red}, ${c.green}, ${c.blue}, ${c.alpha})`;
    }
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return `${typeof value}:${String(value)}`;
}

/**
 * Get a param's typed keyframe. Static params (our MOGRT's) have no keyframe
 * at any *time*, so getKeyframePtr(TIME_ZERO) returns nothing (run #3 finding);
 * getStartValue() is the defs' method for exactly this: "the start value
 * (keyframe) of the component param" — companion of createSetValueAction.
 */
async function getTypedKeyframe(
  param: ParamLike
): Promise<{ keyframe: KeyframeLike; via: string } | null> {
  try {
    const fromStart = await param.getStartValue();
    if (fromStart) {
      return { keyframe: fromStart, via: "getStartValue" };
    }
  } catch {
    // fall through
  }
  try {
    const noArg = param.getKeyframePtr();
    if (noArg) {
      return { keyframe: noArg, via: "getKeyframePtr()" };
    }
  } catch {
    // fall through
  }
  try {
    const atZero = param.getKeyframePtr(ppro.TickTime.TIME_ZERO);
    if (atZero) {
      return { keyframe: atZero, via: "getKeyframePtr(TIME_ZERO)" };
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Read a param's inner value. getValueAtTime works for simple types; for
 * text/color params Premiere throws and instructs going through a keyframe
 * object instead (its error message names GetKeyframeAtTime; for static
 * params the working door is getStartValue — run #3).
 */
async function readParamInner(
  param: ParamLike
): Promise<{ inner: unknown; via: string }> {
  try {
    const raw = await param.getValueAtTime(ppro.TickTime.TIME_ZERO);
    const inner =
      raw && typeof raw === "object" && "value" in raw
        ? (raw as { value: unknown }).value
        : raw;
    return { inner, via: "getValueAtTime" };
  } catch {
    const typed = await getTypedKeyframe(param);
    if (!typed) {
      throw new Error(
        "getValueAtTime unsupported; getStartValue/getKeyframePtr returned nothing"
      );
    }
    return { inner: typed.keyframe.value?.value, via: typed.via };
  }
}

/** Shared chain dump for one track item; appends findings to `out`. */
async function dumpItem(
  project: { lockedAccess(cb: () => void): void },
  rawItem: unknown,
  out: string[]
): Promise<void> {
  const item = rawItem as TrackItemLike;
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

/**
 * Read-only: dump each capsule param's CURRENT value and its raw shape. The
 * native shape of "Line Text" tells us what type createKeyframe expects (a
 * plain string was rejected — "Illegal Parameter type"), and the color params'
 * numbers reveal the value range (0–1 vs 0–255).
 */
export async function inspectCapsuleValues(): Promise<string> {
  const { project, sequence } = await getActiveContext();
  if (!project || !sequence) {
    throw new Error("Open a project with an active sequence first.");
  }
  const selection = await sequence.getSelection();
  const items = (await selection.getTrackItems()) as unknown as TrackItemLike[];
  if (items.length === 0) {
    throw new Error("Select the inserted MOGRT clip in the timeline first.");
  }
  const params = await findCapsule(project as unknown as ProjectTxn, items[0]);
  if (!params) {
    throw new Error(`No "${CAPSULE_MATCH_NAME}" component on the selected clip.`);
  }

  const out: string[] = ["current capsule param values (name → raw shape):", ""];
  for (const { param, name } of params) {
    const label = name === "" ? "(empty displayName)" : name;

    // Simple path first.
    try {
      const raw = await param.getValueAtTime(ppro.TickTime.TIME_ZERO);
      const inner =
        raw && typeof raw === "object" && "value" in raw
          ? (raw as { value: unknown }).value
          : raw;
      out.push(`• ${label}: ${formatScalar(inner)} (via getValueAtTime)`);
      continue;
    } catch {
      out.push(`• ${label}: getValueAtTime unsupported — door-by-door forensics:`);
    }

    try {
      out.push(`      isTimeVarying: ${param.isTimeVarying()}`);
    } catch (err) {
      out.push(`      isTimeVarying threw: ${message(err)}`);
    }
    try {
      out.push(`      areKeyframesSupported: ${await param.areKeyframesSupported()}`);
    } catch (err) {
      out.push(`      areKeyframesSupported threw: ${message(err)}`);
    }

    const doors: [string, () => Promise<unknown> | unknown][] = [
      ["getStartValue()", () => param.getStartValue()],
      ["getKeyframePtr()", () => param.getKeyframePtr()],
      ["getKeyframePtr(TIME_ZERO)", () => param.getKeyframePtr(ppro.TickTime.TIME_ZERO)],
    ];
    for (const [doorName, open] of doors) {
      try {
        const result = await open();
        if (!result) {
          out.push(`      ${doorName}: returned ${String(result)}`);
          continue;
        }
        out.push(`      ${doorName}: keyframe ✓`);
        describeKeyframeDeep(result as KeyframeLike, out);
        break; // one deep dump is enough
      } catch (err) {
        out.push(`      ${doorName}: threw — ${message(err)}`);
      }
    }
  }
  const report = out.join("\n");
  console.log(report);
  return report;
}

/**
 * Write-path check: set one exposed param of each API-writable value type —
 * number and color — on the selected MOGRT, then read each back. (Text is NOT
 * API-writable; it goes through template patching — see MOGRT_SPEC "Value
 * read/write recipes".)
 */
export async function writeTestOnSelection(): Promise<string> {
  const { project, sequence } = await getActiveContext();
  if (!project || !sequence) {
    throw new Error("Open a project with an active sequence first.");
  }
  const selection = await sequence.getSelection();
  const items = (await selection.getTrackItems()) as unknown as TrackItemLike[];
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

  // One representative write per API-writable value type (confirmed live:
  // colors are 0–1 floats).
  const targets: { name: string; value: ParamValue; note?: string }[] = [
    { name: "Background Opacity", value: 100 },
    { name: "Text Color", value: ppro.Color(1, 0, 0, 1), note: "0–1 float RGBA" },
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
      let readback: string;
      try {
        const { inner, via } = await readParamInner(match.param);
        readback = `${formatScalar(inner)} (via ${via})`;
      } catch (readErr) {
        readback = `(read threw: ${message(readErr)})`;
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

  // Scale the native-size UHD instance down to the sequence frame — without
  // this, the lower-third caption sits below the visible crop (run #6 finding:
  // an unscaled 2160p template in a 1080 sequence shows no text at all).
  try {
    const frame = await sequence.getFrameSize();
    const txn = project as unknown as ProjectTxn;
    let scaled = 0;
    let scalePct = 100;
    for (const rawItem of inserted) {
      const item = rawItem as TrackItemLike;
      if (typeof item.getComponentChain !== "function") {
        continue;
      }
      scalePct = await scaleItemToSequence(txn, item, frame.height);
      scaled++;
    }
    out.push(
      `scaled ${scaled} item(s) to ${scalePct.toFixed(1)}% ` +
        `(sequence ${frame.width}×${frame.height})`
    );
  } catch (err) {
    out.push(`scale-down failed: ${message(err)}`);
  }

  for (const rawItem of inserted) {
    await dumpItem(project, rawItem, out);
  }

  const report = out.join("\n");
  console.log(report); // also visible in UDT's debug console for copy/paste
  return report;
}
