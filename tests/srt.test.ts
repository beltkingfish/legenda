// SRT parser unit tests (promoted from the step-4 smoke test).
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSrt } from "../src/srt";

// Deliberately messy: BOM, CRLF, dot-ms separator, italic tags, {\an8},
// missing index on cue 3, stray metadata block, out-of-order cues.
const sample =
  "﻿" +
  [
    "NOTE some tools prepend metadata blocks",
    "",
    "2",
    "00:00:05,500 --> 00:00:07.250",
    "<i>Second cue</i> with {\\an8}tags stripped.",
    "",
    "1",
    "00:00:01,000 --> 00:00:03,000",
    "Hello world, this is",
    "a two-line cue!",
    "",
    "00:00:08,000 --> 00:00:09,000",
    "Indexless cue?",
    "",
  ].join("\r\n");

test("parses a messy but valid SRT", () => {
  const { words, meta } = parseSrt(sample, "test.srt");
  assert.equal(meta.kind, "srt");
  assert.equal(meta.sourceName, "test.srt");
  assert.equal(words.length, 14);
});

test("sorts cues by start time", () => {
  const { words } = parseSrt(sample);
  assert.equal(words[0].text, "Hello");
  assert.equal(words[0].startSec, 1);
});

test("last word of a cue ends exactly on the cue boundary", () => {
  const { words } = parseSrt(sample);
  assert.equal(words[6].text, "cue!");
  assert.ok(Math.abs(words[6].endSec - 3) < 1e-9);
});

test("strips tag and brace markup; accepts dot-ms separators", () => {
  const { words } = parseSrt(sample);
  assert.equal(words[7].text, "Second");
  assert.ok(Math.abs(words[7].startSec - 5.5) < 1e-9);
  assert.equal(words[11].text, "stripped.");
});

test("infers eos from terminal punctuation", () => {
  const { words } = parseSrt(sample);
  assert.equal(words[6].eos, true); // "cue!"
  assert.equal(words[11].eos, true); // "stripped."
  assert.equal(words[13].eos, true); // "cue?"
  assert.equal(words[0].eos, undefined); // "Hello"
});

test("parses indexless cues", () => {
  const { words } = parseSrt(sample);
  assert.equal(words[12].text, "Indexless");
  assert.equal(words[12].startSec, 8);
});

test("word timing is monotonic and stays inside its cue", () => {
  const { words } = parseSrt(sample);
  words.forEach((w, i) => {
    assert.ok(w.endSec > w.startSec);
    if (i > 0) assert.ok(w.startSec >= words[i - 1].startSec - 1e-9);
  });
  for (const w of words.slice(0, 7)) {
    assert.ok(w.startSec >= 1 && w.endSec <= 3 + 1e-9);
  }
});

test("throws on input with no cues", () => {
  assert.throws(() => parseSrt("not an srt at all"));
});
