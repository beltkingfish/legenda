// Timing settings + WCAG-aware warnings (SPECIFICATION §9, UI_COMPONENTS §4).
// Warnings NEVER block: the user's values always apply; leaving the safe zone
// only surfaces the exact copy below. Defaults come from
// presets/style-presets.json → defaults.timing.

import presetsJson from "../presets/style-presets.json";
import type { CaptionLine } from "./wrap";

export interface TimingSettings {
  /** Minimum display time per line, seconds (WCAG floor: 1.33). */
  minSec: number;
  /** Maximum display time per line, seconds (WCAG ceiling: 7). */
  maxSec: number;
  /** Transition duration, ms (recommended 100–200). */
  transitionMs: number;
  /** Gap between consecutive captions, ms (recommended 0–200). */
  gapMs: number;
}

export function defaultTiming(): TimingSettings {
  return { ...presetsJson.defaults.timing };
}

/** WCAG/recommended thresholds (SPECIFICATION §9). */
export const WCAG = {
  minSec: 1.33,
  maxSec: 7,
  transitionMs: 100,
  gapMs: 200,
} as const;

export type TimingField = keyof TimingSettings;

export interface TimingWarning {
  field: TimingField;
  /** Exact copy from UI_COMPONENTS.md §Warning copy. */
  message: string;
}

/** Non-blocking warnings for the CURRENT settings values. */
export function evaluateTimingWarnings(settings: TimingSettings): TimingWarning[] {
  const warnings: TimingWarning[] = [];
  if (settings.minSec < WCAG.minSec) {
    warnings.push({
      field: "minSec",
      message: "Below accessibility standard (min 1.33s). Applied anyway.",
    });
  }
  if (settings.maxSec > WCAG.maxSec) {
    warnings.push({
      field: "maxSec",
      message: "Above accessibility standard (max 7s). Applied anyway.",
    });
  }
  if (settings.transitionMs < WCAG.transitionMs) {
    warnings.push({
      field: "transitionMs",
      message: "Faster than recommended (100ms). Applied anyway.",
    });
  }
  if (settings.gapMs > WCAG.gapMs) {
    warnings.push({
      field: "gapMs",
      message:
        "Gap larger than recommended (200ms) — may cause flicker between captions.",
    });
  }
  return warnings;
}

/**
 * Apply the timing settings to line display windows, in priority order:
 *   1. never overlap the next caption (hard constraint — sliver debris),
 *   2. extend short lines toward minSec / cap long lines at maxSec,
 *   3. keep gapMs of air before the next caption when it fits.
 * Word-derived start times are authoritative (SPECIFICATION §9); only the
 * display END moves. The last line may extend freely (nothing follows it).
 */
export function applyTimingToLines(
  lines: CaptionLine[],
  settings: TimingSettings
): CaptionLine[] {
  const gapSec = Math.max(0, settings.gapMs / 1000);
  return lines.map((line, i) => {
    const next = lines[i + 1];
    let endSec = line.endSec;
    endSec = Math.max(endSec, line.startSec + settings.minSec); // extend short
    endSec = Math.min(endSec, line.startSec + settings.maxSec); // cap long
    if (next) {
      const gapped = next.startSec - gapSec;
      // Prefer honoring the gap; if the gap cannot fit at all, fall back to
      // the hard no-overlap bound.
      endSec = Math.min(endSec, gapped > line.startSec ? gapped : next.startSec);
    }
    return endSec === line.endSec ? line : { ...line, endSec };
  });
}
