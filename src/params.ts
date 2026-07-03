// Shared ComponentParam access layer — the verified API recipes from step 6
// (docs/MOGRT_SPEC.md "Value read/write recipes"), used by both the renderer
// and the dev probes. Types are structural because @adobe/premierepro's
// declared types don't cover the runtime shapes we confirmed live.

import ppro from "./ppro";

export type ParamValue = string | number | boolean | object;

export interface KeyframeLike {
  value: { value: unknown };
  position: unknown;
}

export interface ParamLike {
  displayName: string;
  isTimeVarying(): boolean;
  areKeyframesSupported(): Promise<boolean>;
  createKeyframe(value: ParamValue): unknown;
  createSetTimeVaryingAction(timeVarying: boolean): unknown;
  createSetValueAction(keyframe: unknown, safeForPlayback?: boolean): unknown;
  getValueAtTime(time: unknown): Promise<unknown>;
  getKeyframePtr(time?: unknown): KeyframeLike | null | undefined;
  /** Static-value keyframe — the companion of createSetValueAction. */
  getStartValue(): Promise<KeyframeLike>;
}

export interface ComponentLike {
  getMatchName(): Promise<string>;
  getDisplayName(): Promise<string>;
  getParamCount(): number;
  getParam(index: number): ParamLike;
}

export interface ChainLike {
  getComponentCount(): number;
  getComponentAtIndex(index: number): ComponentLike;
}

export interface TrackItemLike {
  getName(): Promise<string>;
  getDuration(): Promise<{ seconds: number }>;
  getComponentChain(): Promise<ChainLike>;
  createSetEndAction(tickTime: unknown): unknown;
}

export interface ProjectTxn {
  lockedAccess(callback: () => void): void;
  executeTransaction(
    callback: (compoundAction: { addAction(action: unknown): boolean }) => void,
    undoLabel?: string
  ): boolean;
}

/** The Graphic Parameters component that holds a MOGRT's exposed params. */
export const CAPSULE_MATCH_NAME = "AE.ADBE Capsule";
/** Intrinsic Motion component (Position/Scale/…) present from insert time. */
export const MOTION_MATCH_NAME = "AE.ADBE Motion";
/** Templates are authored at UHD (MOGRT_SPEC); scale down per sequence. */
export const TEMPLATE_HEIGHT_PX = 2160;

/** Locate a component by matchName on a track item's chain; return its params. */
export async function findComponentParams(
  project: ProjectTxn,
  item: TrackItemLike,
  matchName: string
): Promise<{ param: ParamLike; name: string }[] | null> {
  const chain = await item.getComponentChain();
  const components: ComponentLike[] = [];
  project.lockedAccess(() => {
    const count = chain.getComponentCount();
    for (let i = 0; i < count; i++) {
      components.push(chain.getComponentAtIndex(i));
    }
  });

  let target: ComponentLike | null = null;
  for (const component of components) {
    if ((await component.getMatchName()) === matchName) {
      target = component;
      break;
    }
  }
  if (!target) {
    return null;
  }

  const params: { param: ParamLike; name: string }[] = [];
  project.lockedAccess(() => {
    const count = target.getParamCount();
    for (let i = 0; i < count; i++) {
      const param = target.getParam(i);
      params.push({ param, name: param.displayName });
    }
  });
  return params;
}

/** Locate the Graphic Parameters capsule on a track item's chain, if present. */
export async function findCapsule(
  project: ProjectTxn,
  item: TrackItemLike
): Promise<{ param: ParamLike; name: string }[] | null> {
  return findComponentParams(project, item, CAPSULE_MATCH_NAME);
}

/** Set a numeric param via the verified write path. */
export function setNumberParam(
  txn: ProjectTxn,
  param: ParamLike,
  value: number,
  undoLabel: string
): void {
  txn.lockedAccess(() => {
    if (param.isTimeVarying()) {
      txn.executeTransaction(
        (ca) => ca.addAction(param.createSetTimeVaryingAction(false)),
        `${undoLabel} (static)`
      );
    }
    const keyframe = param.createKeyframe(value);
    txn.executeTransaction(
      (ca) => ca.addAction(param.createSetValueAction(keyframe, true)),
      undoLabel
    );
  });
}

/**
 * Scale a freshly inserted (UHD-authored) instance down to the sequence frame
 * via the intrinsic Motion component. Returns the applied percentage.
 */
export async function scaleItemToSequence(
  txn: ProjectTxn,
  item: TrackItemLike,
  sequenceFrameHeight: number
): Promise<number> {
  const scalePct = (sequenceFrameHeight / TEMPLATE_HEIGHT_PX) * 100;
  const motionParams = await findComponentParams(txn, item, MOTION_MATCH_NAME);
  const scaleParam = motionParams?.find((p) => p.name === "Scale");
  if (!scaleParam) {
    throw new Error("Motion → Scale param not found on inserted item");
  }
  setNumberParam(txn, scaleParam.param, scalePct, "Legenda: scale caption");
  return scalePct;
}

export function ticks(seconds: number): unknown {
  return ppro.TickTime.createWithSeconds(seconds);
}
