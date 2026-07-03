// Parses Premiere's transcript JSON (from ppro.Transcript.exportToJSON) into
// the internal word model. The format is Adobe's published schema:
//   sample-panels/premiere-api/assets/transcript_format_spec.json
//   (AdobeDocs/uxp-premiere-pro-samples)
// Fields used here are exactly the ones that schema defines — do not extend
// this file from guesswork if Premiere emits something unexpected; update it
// from the schema.

import type { CaptionWord, ImportedCaptions } from "./model";

interface SpecWord {
  confidence: number;
  duration: number;
  eos: boolean;
  start: number;
  tags: string[];
  text: string;
  type: "word" | "punctuation";
}

interface SpecSegment {
  duration: number;
  language: string;
  speaker: string; // UUID into speakers[]
  start: number;
  words: SpecWord[];
}

interface SpecSpeaker {
  id: string;
  name: string;
}

interface SpecTranscript {
  language: string;
  segments: SpecSegment[];
  speakers: SpecSpeaker[];
}

function fail(where: string, why: string): never {
  throw new Error(`Transcript JSON ${where}: ${why}`);
}

function isFiniteNonNegative(n: unknown): n is number {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

/** Structural check of the bits we rely on; tolerant of extra fields.
    NOTE: real Premiere exports include tokens that violate the published
    spec (observed 2026-07-02: a word with no 'text' field at all). Malformed
    tokens are the caller's problem to SKIP, not a reason to fail the import —
    only structural breakage (no segments / no words arrays) fails here. */
function validate(root: unknown): SpecTranscript {
  if (typeof root !== "object" || root === null) {
    fail("root", "not an object");
  }
  const t = root as Partial<SpecTranscript>;
  if (!Array.isArray(t.segments) || t.segments.length === 0) {
    fail("root", "missing non-empty 'segments' array");
  }
  t.segments.forEach((segment, s) => {
    if (typeof segment !== "object" || segment === null) {
      fail(`segments[${s}]`, "not an object");
    }
    if (!Array.isArray(segment.words)) {
      fail(`segments[${s}]`, "missing 'words' array");
    }
  });
  return t as SpecTranscript;
}

/** A token the parser can actually use: non-empty text + sane timing. */
function isUsableWord(word: Partial<SpecWord>): word is SpecWord {
  return (
    typeof word.text === "string" &&
    word.text.length > 0 &&
    isFiniteNonNegative(word.start) &&
    isFiniteNonNegative(word.duration)
  );
}

export function parseTranscriptJson(json: string, clipName?: string): ImportedCaptions {
  let root: unknown;
  try {
    root = JSON.parse(json);
  } catch (err) {
    fail("document", `not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
  const transcript = validate(root);

  const speakerById = new Map<string, string>();
  for (const speaker of Array.isArray(transcript.speakers) ? transcript.speakers : []) {
    if (typeof speaker?.id === "string" && typeof speaker?.name === "string") {
      speakerById.set(speaker.id, speaker.name);
    }
  }

  const words: CaptionWord[] = [];
  // Punctuation tokens that arrive before any word attach to the next word.
  let pendingPrefix = "";
  // Tokens violating the spec (missing text/timing) are skipped, not fatal.
  let skippedTokens = 0;

  const segments = [...transcript.segments].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
  for (const segment of segments) {
    const speaker = speakerById.get(segment.speaker);
    const usable = segment.words.filter((word) => {
      if (isUsableWord(word)) {
        return true;
      }
      skippedTokens++;
      return false;
    });
    const segmentWords = usable.sort((a, b) => a.start - b.start);
    for (const word of segmentWords) {
      if (word.type === "punctuation") {
        const previous = words[words.length - 1];
        if (previous) {
          // Merge standalone punctuation into the preceding word: it is not
          // a wrappable unit and usually carries ~zero duration.
          previous.text += word.text;
          previous.endSec = Math.max(previous.endSec, word.start + word.duration);
          if (word.eos === true) {
            previous.eos = true;
          }
        } else {
          pendingPrefix += word.text;
        }
        continue;
      }
      words.push({
        text: pendingPrefix + word.text,
        startSec: word.start,
        endSec: word.start + word.duration,
        ...(speaker !== undefined ? { speaker } : {}),
        ...(word.eos === true ? { eos: true } : {}),
      });
      pendingPrefix = "";
    }
  }

  if (words.length === 0) {
    fail("document", "contains no usable words");
  }

  return {
    meta: {
      kind: "transcript",
      ...(typeof transcript.language === "string" ? { language: transcript.language } : {}),
      ...(clipName !== undefined ? { sourceName: clipName } : {}),
      speakerNames: [...speakerById.values()],
      ...(skippedTokens > 0 ? { skippedTokens } : {}),
    },
    words,
  };
}
