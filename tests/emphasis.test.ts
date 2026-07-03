// Per-word emphasis unit tests: reconcile guards and run building. The
// invariant that matters downstream: run lengths sum EXACTLY to the line
// text (words joined with single spaces) — the patcher rejects anything else.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildLineRuns,
  lineHasWordEmphasis,
  reconcileWordEmphasis,
  type WordEmphasisMap,
} from "../src/emphasis";
import type { CaptionWord } from "../src/model";

function makeWords(texts: string[]): CaptionWord[] {
  return texts.map((text, i) => ({ text, startSec: i, endSec: i + 0.5 }));
}

function emphasis(entries: [number, string][]): WordEmphasisMap {
  return new Map(entries.map(([index, text]) => [index, { text, italic: true }]));
}

test("reconcile keeps entries whose word index and text still match", () => {
  const words = makeWords(["the", "quick", "fox"]);
  const map = reconcileWordEmphasis(emphasis([[1, "quick"]]), words);
  assert.deepEqual([...map.keys()], [1]);
});

test("reconcile drops entries whose word text changed (never restyle a different word)", () => {
  const words = makeWords(["the", "quick", "fox"]);
  const map = reconcileWordEmphasis(emphasis([[1, "slow"]]), words);
  assert.equal(map.size, 0);
});

test("reconcile drops out-of-range and style-less entries", () => {
  const words = makeWords(["one"]);
  const map: WordEmphasisMap = new Map([
    [5, { text: "gone", italic: true }],
    [0, { text: "one" }], // no styling left
  ]);
  assert.equal(reconcileWordEmphasis(map, words).size, 0);
});

test("lineHasWordEmphasis only sees the line's own range", () => {
  const map = emphasis([[4, "word"]]);
  assert.equal(lineHasWordEmphasis({ firstWord: 0, lastWord: 3 }, map), false);
  assert.equal(lineHasWordEmphasis({ firstWord: 4, lastWord: 6 }, map), true);
});

test("no emphasis in range yields undefined (uniform patch path)", () => {
  const words = makeWords(["a", "b", "c"]);
  assert.equal(buildLineRuns({ firstWord: 0, lastWord: 2 }, words, new Map()), undefined);
  // A line-level italic override alone does NOT need runs either.
  assert.equal(
    buildLineRuns(
      { firstWord: 0, lastWord: 2, override: { italic: true } },
      words,
      new Map()
    ),
    undefined
  );
});

test("a middle emphasized word yields three runs covering the text exactly", () => {
  const words = makeWords(["the", "quick", "fox"]); // "the quick fox" = 13 chars
  const runs = buildLineRuns(
    { firstWord: 0, lastWord: 2 },
    words,
    emphasis([[1, "quick"]])
  );
  // Spaces belong to the run of the word BEFORE them: "the " | "quick " | "fox"
  assert.deepEqual(runs, [
    { length: 4, italic: false },
    { length: 6, italic: true },
    { length: 3, italic: false },
  ]);
  assert.equal(
    runs!.reduce((sum, r) => sum + r.length, 0),
    "the quick fox".length
  );
});

test("adjacent emphasized words merge into one run", () => {
  const words = makeWords(["the", "quick", "fox"]);
  const runs = buildLineRuns(
    { firstWord: 0, lastWord: 2 },
    words,
    emphasis([[0, "the"], [1, "quick"]])
  );
  assert.deepEqual(runs, [
    { length: 10, italic: true }, // "the quick "
    { length: 3, italic: false },
  ]);
});

test("an emphasized last word gets no trailing space", () => {
  const words = makeWords(["a", "b"]); // "a b"
  const runs = buildLineRuns({ firstWord: 0, lastWord: 1 }, words, emphasis([[1, "b"]]));
  assert.deepEqual(runs, [
    { length: 2, italic: false }, // "a "
    { length: 1, italic: true }, // "b"
  ]);
});

test("line-level italic override folds in as the base", () => {
  const words = makeWords(["the", "quick", "fox"]);
  const runs = buildLineRuns(
    { firstWord: 0, lastWord: 2, override: { italic: true } },
    words,
    emphasis([[1, "quick"]])
  );
  // Everything italic → merges to a single run spanning the whole text.
  assert.deepEqual(runs, [{ length: 13, italic: true }]);
});

test("word indices are line-relative to the canonical list, not the line", () => {
  const words = makeWords(["zero", "one", "two", "three", "four"]);
  const runs = buildLineRuns(
    { firstWord: 3, lastWord: 4 }, // "three four"
    words,
    emphasis([[4, "four"]])
  );
  assert.deepEqual(runs, [
    { length: 6, italic: false }, // "three "
    { length: 4, italic: true }, // "four"
  ]);
});

test("a single fully-emphasized word line yields one italic run", () => {
  const words = makeWords(["supercalifragilistic"]);
  const runs = buildLineRuns(
    { firstWord: 0, lastWord: 0 },
    words,
    emphasis([[0, "supercalifragilistic"]])
  );
  assert.deepEqual(runs, [{ length: 20, italic: true }]);
});
