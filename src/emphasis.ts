// Per-word emphasis (SPECIFICATION §7/§12 Phase 2, UI_COMPONENTS §5): stored
// OFF the derived lines, keyed by the word's INDEX into the canonical word
// list — stable across re-wraps by construction (lines re-derive; the word
// list doesn't change until re-import). Each entry remembers the word's text:
// reconcile drops any entry whose canonical word changed, so emphasis never
// silently lands on a different word after a re-import.
//
// Render channel: per-word italic becomes per-text-run styling in the patched
// definition.json (fontTextRunLength / fontFSItalicValue parallel arrays +
// capPropTextRunCount — docs/MOGRT_SPEC.md). buildLineRuns folds the
// line-level italic override in as the base, so when runs are present they
// are the single source of truth for the line's italics.

import type { CaptionWord } from "./model";
import type { StyleRun } from "./style";
import type { CaptionLine } from "./wrap";

export interface WordEmphasis {
  /** The canonical word's text at emphasis time — the reconcile guard. */
  text: string;
  italic?: boolean;
}

/** Keyed by index into the canonical word list. */
export type WordEmphasisMap = Map<number, WordEmphasis>;

/** Drop entries whose word no longer exists / no longer matches its text. */
export function reconcileWordEmphasis(
  map: WordEmphasisMap,
  words: CaptionWord[]
): WordEmphasisMap {
  const out: WordEmphasisMap = new Map();
  for (const [index, entry] of map) {
    if (words[index]?.text === entry.text && entry.italic === true) {
      out.set(index, entry);
    }
  }
  return out;
}

/** True when any word in the line's range carries emphasis. */
export function lineHasWordEmphasis(
  line: Pick<CaptionLine, "firstWord" | "lastWord">,
  map: WordEmphasisMap
): boolean {
  for (let w = line.firstWord; w <= line.lastWord; w++) {
    if (map.get(w)?.italic === true) {
      return true;
    }
  }
  return false;
}

/**
 * Per-text-run styling for one line, or undefined when no word in the range
 * is emphasized (the uniform patch path already handles that case). Runs
 * cover the line text exactly as the wrapper built it (words joined with
 * single spaces); the space between two words belongs to the run of the word
 * BEFORE it. Adjacent same-style runs merge.
 */
export function buildLineRuns(
  line: Pick<CaptionLine, "firstWord" | "lastWord" | "override">,
  words: CaptionWord[],
  map: WordEmphasisMap
): StyleRun[] | undefined {
  if (!lineHasWordEmphasis(line, map)) {
    return undefined;
  }
  const base = line.override?.italic === true;
  const runs: StyleRun[] = [];
  for (let w = line.firstWord; w <= line.lastWord; w++) {
    const italic = base || map.get(w)?.italic === true;
    const length = words[w].text.length + (w < line.lastWord ? 1 : 0);
    const previous = runs[runs.length - 1];
    if (previous && previous.italic === italic) {
      previous.length += length;
    } else {
      runs.push({ length, italic });
    }
  }
  return runs;
}
