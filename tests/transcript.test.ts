// Transcript parser unit tests. The valid sample mirrors the example in
// Adobe's transcript_format_spec.json; the malformed cases mirror REAL
// Premiere exports (observed 2026-07-02: a word token with no 'text' at all).
import assert from "node:assert/strict";
import { test } from "node:test";

import { parseTranscriptJson } from "../src/transcript";

const SPEAKER = "631fbbc0-9c02-47c4-bb8c-732c020fa24f";

function makeTranscript(words: object[], extra: object = {}): string {
  return JSON.stringify({
    language: "en-us",
    segments: [{ duration: 5, language: "en-us", speaker: SPEAKER, start: 1, words }],
    speakers: [{ id: SPEAKER, name: "Jane Doe" }],
    ...extra,
  });
}

const word = (text: string, start: number, over: object = {}) => ({
  confidence: 1,
  duration: 0.5,
  eos: false,
  start,
  tags: [],
  text,
  type: "word",
  ...over,
});

test("parses the spec's canonical shape", () => {
  const { words, meta } = parseTranscriptJson(
    makeTranscript([word("Hello", 1), word("world.", 1.6, { eos: true })]),
    "clip.mov"
  );
  assert.equal(words.length, 2);
  assert.equal(words[0].text, "Hello");
  assert.equal(words[0].speaker, "Jane Doe");
  assert.equal(words[1].eos, true);
  assert.equal(meta.language, "en-us");
  assert.equal(meta.sourceName, "clip.mov");
  assert.equal(meta.skippedTokens, undefined);
});

test("skips tokens with no 'text' (real Premiere exports have them)", () => {
  const { words, meta } = parseTranscriptJson(
    makeTranscript([
      word("Hello", 1),
      { confidence: 1, duration: 0.2, eos: false, start: 1.4, tags: [], type: "word" },
      word("there", 1.8),
    ])
  );
  assert.equal(words.length, 2);
  assert.deepEqual(words.map((w) => w.text), ["Hello", "there"]);
  assert.equal(meta.skippedTokens, 1);
});

test("skips tokens with broken timing", () => {
  const { words, meta } = parseTranscriptJson(
    makeTranscript([word("ok", 1), word("bad", Number.NaN), word("fine", 2)])
  );
  assert.deepEqual(words.map((w) => w.text), ["ok", "fine"]);
  assert.equal(meta.skippedTokens, 1);
});

test("merges standalone punctuation into the preceding word", () => {
  const { words } = parseTranscriptJson(
    makeTranscript([
      word("Hello", 1),
      word(".", 1.5, { type: "punctuation", eos: true, duration: 0 }),
      word("Next", 2),
    ])
  );
  assert.equal(words.length, 2);
  assert.equal(words[0].text, "Hello.");
  assert.equal(words[0].eos, true);
});

test("fails when nothing usable remains", () => {
  assert.throws(() =>
    parseTranscriptJson(
      makeTranscript([{ confidence: 1, duration: 0.2, start: 1, tags: [], type: "word" }])
    )
  );
});

test("fails on structural breakage", () => {
  assert.throws(() => parseTranscriptJson("[]"));
  assert.throws(() => parseTranscriptJson(JSON.stringify({ segments: [] })));
  assert.throws(() => parseTranscriptJson("not json"));
});
