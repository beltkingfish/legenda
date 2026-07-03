// Per-line overrides (SPECIFICATION §7, ARCHITECTURE §6): stored OFF the
// derived lines, keyed by the line's underlying word range, and re-applied
// after every regeneration — so they persist through global style/timing
// changes unless explicitly cleared.
//
// Keying policy: a line's identity is its word range `${firstWord}:${lastWord}`.
// Re-wrapping regenerates lines; overrides survive exactly when a line with
// the same word range still exists (same text, same span). Ranges that no
// longer exist are dropped by reconcile — an override never silently lands on
// different words than the user styled.

import type { CaptionLine } from "./wrap";

export interface LineOverride {
  /** #RRGGBB — overrides the style's text color for this line only. */
  color?: string;
  italic?: boolean;
}

export type OverrideMap = Map<string, LineOverride>;

export function overrideKey(line: Pick<CaptionLine, "firstWord" | "lastWord">): string {
  return `${line.firstWord}:${line.lastWord}`;
}

/** Drop overrides whose word range no longer matches any current line. */
export function reconcileOverrides(map: OverrideMap, lines: CaptionLine[]): OverrideMap {
  const valid = new Set(lines.map(overrideKey));
  const out: OverrideMap = new Map();
  for (const [key, override] of map) {
    if (valid.has(key) && (override.color !== undefined || override.italic !== undefined)) {
      out.set(key, override);
    }
  }
  return out;
}

/** Return lines with their override (if any) attached for the renderer. */
export function attachOverrides(lines: CaptionLine[], map: OverrideMap): CaptionLine[] {
  return lines.map((line) => {
    const override = map.get(overrideKey(line));
    return override ? { ...line, override } : line;
  });
}
