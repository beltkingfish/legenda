// Timing settings: warning thresholds (exact UI_COMPONENTS copy) and the
// display-window application (extend/cap/gap with the no-overlap guarantee).
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyTimingToLines,
  defaultTiming,
  evaluateTimingWarnings,
} from "../src/timing";
import type { CaptionLine } from "../src/wrap";

function makeLine(startSec: number, endSec: number, text = "x"): CaptionLine {
  return { text, startSec, endSec, firstWord: 0, lastWord: 0 };
}

test("defaults sit inside the safe zone — no warnings", () => {
  const d = defaultTiming();
  assert.deepEqual(d, { minSec: 1.33, maxSec: 7.0, transitionMs: 150, gapMs: 100 });
  assert.deepEqual(evaluateTimingWarnings(d), []);
});

test("each threshold produces its exact warning copy", () => {
  const warnings = evaluateTimingWarnings({
    minSec: 1.0,
    maxSec: 9,
    transitionMs: 50,
    gapMs: 400,
  });
  assert.deepEqual(
    warnings.map((w) => [w.field, w.message]),
    [
      ["minSec", "Below accessibility standard (min 1.33s). Applied anyway."],
      ["maxSec", "Above accessibility standard (max 7s). Applied anyway."],
      ["transitionMs", "Faster than recommended (100ms). Applied anyway."],
      [
        "gapMs",
        "Gap larger than recommended (200ms) — may cause flicker between captions.",
      ],
    ]
  );
});

test("boundary values do not warn", () => {
  assert.deepEqual(
    evaluateTimingWarnings({ minSec: 1.33, maxSec: 7, transitionMs: 100, gapMs: 200 }),
    []
  );
});

test("short lines extend toward minSec, bounded by the next caption minus gap", () => {
  const lines = [makeLine(0, 0.5), makeLine(2.0, 4)];
  const timed = applyTimingToLines(lines, {
    minSec: 1.33,
    maxSec: 7,
    transitionMs: 150,
    gapMs: 100,
  });
  assert.equal(timed[0].endSec, 1.33); // room to extend fully
  const cramped = applyTimingToLines([makeLine(0, 0.5), makeLine(1.0, 3)], {
    minSec: 1.33,
    maxSec: 7,
    transitionMs: 150,
    gapMs: 100,
  });
  assert.equal(cramped[0].endSec, 0.9); // next.start (1.0) − gap (0.1)
});

test("the last line extends freely (nothing follows it)", () => {
  const timed = applyTimingToLines([makeLine(10, 10.4)], defaultTiming());
  assert.equal(timed[0].endSec, 11.33);
});

test("long lines cap at maxSec", () => {
  const timed = applyTimingToLines([makeLine(0, 12)], defaultTiming());
  assert.equal(timed[0].endSec, 7);
});

test("gap that cannot fit falls back to the no-overlap bound", () => {
  // Next caption starts only 50ms after this one starts; a 100ms gap is
  // impossible — end clamps to next.start instead of going non-positive.
  const timed = applyTimingToLines([makeLine(1.0, 1.4), makeLine(1.05, 3)], {
    minSec: 1.33,
    maxSec: 7,
    transitionMs: 150,
    gapMs: 100,
  });
  assert.equal(timed[0].endSec, 1.05);
});

test("lines already inside all bounds pass through unchanged", () => {
  const lines = [makeLine(0, 2), makeLine(2.5, 5)];
  const timed = applyTimingToLines(lines, defaultTiming());
  assert.equal(timed[0].endSec, 2);
  assert.equal(timed[1].endSec, 5);
});
