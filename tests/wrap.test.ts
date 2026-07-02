// Wrapper unit tests. Run with `npm test` (esbuild → node --test); these
// exercise pure logic only — no Premiere APIs involved.
import assert from "node:assert/strict";
import { test } from "node:test";

import type { CaptionWord } from "../src/model";
import { wrapWords } from "../src/wrap";

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
