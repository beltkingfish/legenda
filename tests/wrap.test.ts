// Wrapper unit tests. Run with `npm test` (esbuild → node --test); these
// exercise pure logic only — no Premiere APIs involved.
import assert from "node:assert/strict";
import { test } from "node:test";

import type { CaptionWord } from "../src/model";
import {
  planFrameTimings,
  PREMIERE_TICKS_PER_SECOND,
  sanitizeLineTimings,
  wrapWords,
  type CaptionLine,
} from "../src/wrap";

/** Word builder: sequential timing, 0.3s per word, 0.1s gap by default. */
function makeWords(
  texts: string[],
  overrides: Partial<CaptionWord>[] = []
): CaptionWord[] {
  return texts.map((text, i) => ({
    text,
    startSec: i * 0.4,
    endSec: i * 0.4 + 0.3,
    ...overrides[i],
  }));
}

test("respects the character budget and never splits words", () => {
  const words = makeWords("the quick brown fox jumps over the lazy dog".split(" "));
  const lines = wrapWords(words, { targetLineChars: 15 });
  for (const line of lines) {
    assert.ok(line.text.length <= 15, `"${line.text}" exceeds budget`);
    for (const token of line.text.split(" ")) {
      assert.ok(words.some((w) => w.text === token), `token "${token}" is a whole word`);
    }
  }
});

test("covers all words contiguously, in order", () => {
  const words = makeWords("a b c d e f g h i j k l m n o p".split(" "));
  const lines = wrapWords(words, { targetLineChars: 8 });
  let next = 0;
  for (const line of lines) {
    assert.equal(line.firstWord, next, "ranges are contiguous");
    assert.ok(line.lastWord >= line.firstWord);
    next = line.lastWord + 1;
  }
  assert.equal(next, words.length, "every word is covered");
});

test("line timing comes from its boundary words", () => {
  const words = makeWords(["alpha", "beta", "gamma"]);
  const [line] = wrapWords(words, { targetLineChars: 100 });
  assert.equal(line.startSec, words[0].startSec);
  assert.equal(line.endSec, words[2].endSec);
});

test("prefers breaking after a sentence end once reasonably full", () => {
  const words = makeWords(["This", "is", "a", "sentence.", "Next", "one", "here."], [
    {}, {}, {}, { eos: true }, {}, {}, { eos: true },
  ]);
  const lines = wrapWords(words, { targetLineChars: 22 });
  assert.equal(lines[0].text, "This is a sentence.");
  assert.equal(lines[1].text, "Next one here.");
});

test("ignores a sentence end when the line is still mostly empty", () => {
  const words = makeWords(["No.", "But", "this", "continues", "on"], [
    { eos: true },
  ]);
  const lines = wrapWords(words, { targetLineChars: 30 });
  assert.equal(lines.length, 1, "eos on a nearly-empty line does not break");
});

test("speaker change starts a new line", () => {
  const words = makeWords(["Hi", "there", "Hello", "back"], [
    { speaker: "A" }, { speaker: "A" }, { speaker: "B" }, { speaker: "B" },
  ]);
  const lines = wrapWords(words, { targetLineChars: 50 });
  assert.equal(lines.length, 2);
  assert.equal(lines[0].speaker, "A");
  assert.equal(lines[1].speaker, "B");
});

test("a long silence starts a new line", () => {
  const words: CaptionWord[] = [
    { text: "before", startSec: 0, endSec: 0.5 },
    { text: "after", startSec: 5, endSec: 5.5 }, // 4.5s pause
  ];
  const lines = wrapWords(words, { targetLineChars: 50 });
  assert.equal(lines.length, 2);
});

test("breaks before exceeding the max on-screen duration", () => {
  // 20 short words, 0.5s apart: one line would span ~10s.
  const words = makeWords(Array.from({ length: 20 }, (_, i) => `w${i}`));
  const lines = wrapWords(words, { targetLineChars: 500, maxLineSec: 3 });
  for (const line of lines) {
    assert.ok(line.endSec - line.startSec <= 3 + 1e-9, "line within duration budget");
  }
  assert.ok(lines.length > 1);
});

test("a single word longer than the budget gets its own line", () => {
  const words = makeWords(["hi", "supercalifragilistic", "yo"]);
  const lines = wrapWords(words, { targetLineChars: 10 });
  assert.ok(lines.some((l) => l.text === "supercalifragilistic"));
});

test("re-wrapping with a wider budget yields fewer lines", () => {
  const words = makeWords("one two three four five six seven eight nine ten".split(" "));
  const narrow = wrapWords(words, { targetLineChars: 10 });
  const wide = wrapWords(words, { targetLineChars: 40 });
  assert.ok(wide.length < narrow.length);
});

test("empty input yields no lines", () => {
  assert.deepEqual(wrapWords([], { targetLineChars: 32 }), []);
});

function makeLine(startSec: number, endSec: number, text = "x"): CaptionLine {
  return { text, startSec, endSec, firstWord: 0, lastWord: 0 };
}

test("sanitizeLineTimings clamps overlaps to the next line's start", () => {
  const lines = [makeLine(0, 2.5), makeLine(2.0, 4)]; // 0.5s overlap
  const sane = sanitizeLineTimings(lines);
  assert.equal(sane.length, 2);
  assert.equal(sane[0].endSec, 2.0);
  assert.equal(sane[1].endSec, 4);
});

test("sanitizeLineTimings drops lines emptied by clamping", () => {
  const lines = [makeLine(1.0, 3.0), makeLine(1.0, 2.0)]; // second starts at first's start
  const sane = sanitizeLineTimings(lines);
  assert.deepEqual(
    sane.map((l) => [l.startSec, l.endSec]),
    [[1.0, 2.0]]
  );
});

test("sanitizeLineTimings passes clean timings through untouched", () => {
  const lines = [makeLine(0, 1.5), makeLine(1.5, 3), makeLine(3.2, 7)];
  assert.deepEqual(sanitizeLineTimings(lines), lines);
});

// 30 fps grid: 254016000000 / 30 ticks per frame.
const TPF_30 = PREMIERE_TICKS_PER_SECOND / 30;

test("planFrameTimings puts every boundary exactly on the frame grid", () => {
  const plan = planFrameTimings([makeLine(0.5, 1.8), makeLine(2.0, 3.31)], TPF_30);
  for (const entry of plan) {
    assert.equal(Number(entry.startTicks) % TPF_30, 0);
    assert.equal(Number(entry.endTicks) % TPF_30, 0);
  }
  assert.equal(plan[0].startTicks, String(15 * TPF_30)); // 0.5s @30fps = frame 15
  assert.equal(plan[0].endTicks, String(54 * TPF_30)); // 1.8s = frame 54
});

test("planFrameTimings kills sub-frame overlaps that seconds-sanitation misses", () => {
  // Line 1 ends 2.02s (inside frame 60); line 2 starts 2.0s (frame 60 edge).
  const plan = planFrameTimings([makeLine(0, 2.02), makeLine(2.0, 4)], TPF_30);
  assert.equal(plan.length, 2);
  assert.equal(plan[0].endTicks, plan[1].startTicks); // met exactly on the grid
  assert.ok(Number(plan[0].endTicks) <= Number(plan[1].startTicks));
});

test("planFrameTimings drops lines shorter than one frame", () => {
  const plan = planFrameTimings(
    [makeLine(1.0, 1.01), makeLine(1.5, 2.5)],
    TPF_30
  );
  assert.equal(plan.length, 1);
  assert.equal(plan[0].text, "x");
  assert.equal(plan[0].startTicks, String(45 * TPF_30));
});

test("planFrameTimings carries per-line overrides through to the plan", () => {
  const lines = [
    { ...makeLine(0, 1.5), override: { color: "#FF0000", italic: true } },
    makeLine(2, 3),
  ];
  const plan = planFrameTimings(lines, TPF_30);
  assert.deepEqual(plan[0].override, { color: "#FF0000", italic: true });
  assert.equal(plan[1].override, undefined);
});

test("planFrameTimings carries per-line style runs through to the plan", () => {
  const runs = [
    { length: 4, italic: false },
    { length: 5, italic: true },
  ];
  const plan = planFrameTimings([{ ...makeLine(0, 1.5), runs }, makeLine(2, 3)], TPF_30);
  assert.deepEqual(plan[0].runs, runs);
  assert.equal(plan[1].runs, undefined);
});

test("planFrameTimings keeps starts monotonic after clamping", () => {
  // Second line starts inside the first's final frame.
  const plan = planFrameTimings([makeLine(0, 1.999), makeLine(1.98, 3)], TPF_30);
  assert.equal(plan.length, 2);
  assert.ok(Number(plan[1].startTicks) >= Number(plan[0].endTicks));
});
