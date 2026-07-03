// Per-line override store: word-range keying, reconcile-on-rewrap semantics,
// attachment for the renderer, and the style-value merge.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  attachOverrides,
  overrideKey,
  reconcileOverrides,
  type OverrideMap,
} from "../src/overrides";
import { applyOverrideToValues, type TemplateStyleValues } from "../src/style";
import type { CaptionLine } from "../src/wrap";

function makeLine(firstWord: number, lastWord: number, text = "x"): CaptionLine {
  return { text, startSec: firstWord, endSec: firstWord + 1, firstWord, lastWord };
}

test("overrides survive a re-wrap when the word range is unchanged", () => {
  const store: OverrideMap = new Map([["0:4", { color: "#FF0000" }]]);
  const rewrapped = [makeLine(0, 4), makeLine(5, 9)];
  const reconciled = reconcileOverrides(store, rewrapped);
  assert.deepEqual(reconciled.get("0:4"), { color: "#FF0000" });
});

test("overrides drop when the line's word range no longer exists", () => {
  const store: OverrideMap = new Map([["0:4", { italic: true }]]);
  // Narrower wrap: the words split 0:2 / 3:4 — range 0:4 is gone.
  const reconciled = reconcileOverrides(store, [makeLine(0, 2), makeLine(3, 4)]);
  assert.equal(reconciled.size, 0);
});

test("empty override entries are pruned during reconcile", () => {
  const store: OverrideMap = new Map([["0:4", {}]]);
  const reconciled = reconcileOverrides(store, [makeLine(0, 4)]);
  assert.equal(reconciled.size, 0);
});

test("attachOverrides decorates matching lines and leaves others untouched", () => {
  const store: OverrideMap = new Map([["5:9", { color: "#00FF00", italic: true }]]);
  const lines = attachOverrides([makeLine(0, 4), makeLine(5, 9)], store);
  assert.equal(lines[0].override, undefined);
  assert.deepEqual(lines[1].override, { color: "#00FF00", italic: true });
});

test("overrideKey is the word range", () => {
  assert.equal(overrideKey(makeLine(12, 17)), "12:17");
});

const BASE: TemplateStyleValues = {
  fontName: "Montserrat-Bold",
  fontSize: 96,
  textColor: [1, 1, 1, 1],
  backgroundEnabled: true,
  backgroundColor: [0, 0, 0, 1],
  backgroundOpacity: 60,
  shadowOpacity: 0,
};

test("applyOverrideToValues merges color and italic without touching the base", () => {
  const merged = applyOverrideToValues(BASE, { color: "#FF0000", italic: true });
  assert.deepEqual(merged.textColor, [1, 0, 0, 1]);
  assert.equal(merged.italic, true);
  assert.equal(merged.fontName, "Montserrat-Bold");
  assert.deepEqual(BASE.textColor, [1, 1, 1, 1]); // base untouched
  assert.equal(BASE.italic, undefined);
});

test("applyOverrideToValues passes through when there is no override", () => {
  assert.equal(applyOverrideToValues(BASE, undefined), BASE);
});
