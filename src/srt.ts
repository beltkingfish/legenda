// SRT (SubRip) parser → internal word model. The fallback ingress
// (SPECIFICATION §8): cue timing is authoritative; word times within a cue
// are interpolated proportionally to word length (ARCHITECTURE §4).

import type { CaptionWord, ImportedCaptions } from "./model";

interface SrtCue {
  startSec: number;
  endSec: number;
  text: string;
}

// 00:01:02,345 --> 00:01:04,000  (comma or dot as millisecond separator)
const TIMECODE_LINE =
  /^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

/** Words ending a sentence get eos (heuristic — SRT carries no sentence data). */
const SENTENCE_END = /[.!?…]["')\]]*$/;

function toSeconds(h: string, m: string, s: string, ms: string): number {
  return (
    Number(h) * 3600 +
    Number(m) * 60 +
    Number(s) +
    Number(ms.padEnd(3, "0")) / 1000
  );
}

/** Strip display markup: <i>…</i>-style tags and {\an8}-style brace codes. */
function cleanCueText(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCues(text: string): SrtCue[] {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const blocks = normalized.split(/\n\s*\n/);
  const cues: SrtCue[] = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (lines.length === 0) {
      continue;
    }
    // Optional numeric cue index line.
    if (/^\d+$/.test(lines[0]) && lines.length > 1) {
      lines.shift();
    }
    const match = lines[0] === undefined ? null : TIMECODE_LINE.exec(lines[0]);
    if (!match) {
      // Tolerate stray non-cue blocks (e.g. metadata some tools prepend).
      continue;
    }
    const startSec = toSeconds(match[1], match[2], match[3], match[4]);
    const endSec = toSeconds(match[5], match[6], match[7], match[8]);
    const cueText = cleanCueText(lines.slice(1).join(" "));
    if (cueText.length === 0 || endSec <= startSec) {
      continue;
    }
    cues.push({ startSec, endSec, text: cueText });
  }

  return cues.sort((a, b) => a.startSec - b.startSec);
}

/**
 * Distribute a cue's duration across its words, weighted by word length, so
 * the same canonical word-timing model holds for both ingress paths.
 */
function cueToWords(cue: SrtCue): CaptionWord[] {
  const tokens = cue.text.split(" ");
  const totalWeight = tokens.reduce((sum, token) => sum + token.length, 0);
  const duration = cue.endSec - cue.startSec;

  const words: CaptionWord[] = [];
  let cursor = cue.startSec;
  tokens.forEach((token, i) => {
    const isLast = i === tokens.length - 1;
    // Last word ends exactly on the cue boundary (avoids float drift).
    const endSec = isLast ? cue.endSec : cursor + (token.length / totalWeight) * duration;
    words.push({
      text: token,
      startSec: cursor,
      endSec,
      ...(SENTENCE_END.test(token) ? { eos: true } : {}),
    });
    cursor = endSec;
  });
  return words;
}

export function parseSrt(text: string, fileName?: string): ImportedCaptions {
  const cues = parseCues(text);
  if (cues.length === 0) {
    throw new Error("No SRT cues found — is this a SubRip (.srt) file?");
  }
  const words = cues.flatMap(cueToWords);
  return {
    meta: {
      kind: "srt",
      ...(fileName !== undefined ? { sourceName: fileName } : {}),
      speakerNames: [],
    },
    words,
  };
}
