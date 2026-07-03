// Line wrapper: canonical words → derived caption lines (ARCHITECTURE §4–5).
// Greedy wrap by word; never splits a word. Lines are cheap to re-derive, so
// changing any wrap option re-wraps without re-importing.
//
// Break rules, in order, when considering the next word:
//   1. speaker change        — captioning convention: new speaker, new caption
//   2. long silence          — a pause > pauseBreakSec must not sit inside a line
//   3. character budget      — adding the word would exceed targetLineChars
//   4. duration budget       — line would exceed maxLineSec on screen (WCAG max
//                              is warn-only for *user timing*; the wrapper just
//                              avoids manufacturing over-long lines)
// After adding a word: prefer ending the line at a sentence boundary (eos) once
// the line is reasonably full (EOS_BREAK_FILL of the character budget).

import type { CaptionWord } from "./model";

export interface WrapOptions {
  /** Screen-real-estate setting: target maximum characters per line. */
  targetLineChars: number;
  /** Break rather than let one line span longer than this on screen. */
  maxLineSec?: number;
  /** A silent gap between words longer than this starts a new line. */
  pauseBreakSec?: number;
}

export interface CaptionLine {
  /** Words joined with single spaces. */
  text: string;
  startSec: number;
  endSec: number;
  /** Contiguous range [firstWord, lastWord] into the canonical word list. */
  firstWord: number;
  lastWord: number;
  /** Speaker of the line's words, when the source attributes one. */
  speaker?: string;
}

/** Fraction of the char budget after which an eos word may end the line. */
const EOS_BREAK_FILL = 0.6;
const DEFAULT_MAX_LINE_SEC = 7; // WCAG ceiling (SPECIFICATION §9)
const DEFAULT_PAUSE_BREAK_SEC = 1.5;

/**
 * Renderer-facing guarantee: monotonic, non-overlapping, positive-duration
 * line timings. Word times CAN overlap (punctuation-merge extensions,
 * crosstalk in real transcripts), and inserting a MOGRT inside an existing
 * instance SPLITS it — cascading ~1-frame debris clips down the track
 * (found live 2026-07-03: 18 slivers from a 38-line generate). Each line's
 * end is clamped to the next line's start; empty lines are dropped.
 */
export function sanitizeLineTimings(lines: CaptionLine[]): CaptionLine[] {
  const out: CaptionLine[] = [];
  for (let i = 0; i < lines.length; i++) {
    const next = lines[i + 1];
    const endSec = next ? Math.min(lines[i].endSec, next.startSec) : lines[i].endSec;
    if (endSec > lines[i].startSec) {
      out.push({ ...lines[i], endSec });
    }
  }
  return out;
}

/** Premiere's fixed tick rate (ticks per second). */
export const PREMIERE_TICKS_PER_SECOND = 254016000000;

export interface FramePlanEntry {
  text: string;
  /** Frame-aligned boundaries as tick strings for TickTime.createWithTicks. */
  startTicks: string;
  endTicks: string;
}

/**
 * Quantize line boundaries to the sequence's frame grid (integer tick math).
 * Seconds-level sanitation is not enough: Premiere snaps item edges to
 * frames, so a sub-frame overlap re-emerges after insertion and splits the
 * previous instance (live find 2026-07-03: half-frame sliver clips carrying
 * real caption text). With every boundary ON the grid, and ends clamped to
 * the next start in frame space, overlap is impossible on the grid Premiere
 * snaps to. `ticksPerFrame` comes from Sequence.getTimebase().
 */
export function planFrameTimings(
  lines: CaptionLine[],
  ticksPerFrame: number
): FramePlanEntry[] {
  const toFrame = (seconds: number): number =>
    Math.floor((seconds * PREMIERE_TICKS_PER_SECOND) / ticksPerFrame + 1e-9);

  const out: FramePlanEntry[] = [];
  let previousEndFrame = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < lines.length; i++) {
    const startFrame = Math.max(toFrame(lines[i].startSec), previousEndFrame);
    const next = lines[i + 1];
    let endFrame = toFrame(lines[i].endSec);
    if (next) {
      endFrame = Math.min(endFrame, toFrame(next.startSec));
    }
    if (endFrame <= startFrame) {
      continue; // shorter than a frame after quantization
    }
    previousEndFrame = endFrame;
    out.push({
      text: lines[i].text,
      startTicks: String(startFrame * ticksPerFrame),
      endTicks: String(endFrame * ticksPerFrame),
    });
  }
  return out;
}

export function wrapWords(words: CaptionWord[], options: WrapOptions): CaptionLine[] {
  const targetChars = Math.max(1, Math.floor(options.targetLineChars));
  const maxLineSec = options.maxLineSec ?? DEFAULT_MAX_LINE_SEC;
  const pauseBreakSec = options.pauseBreakSec ?? DEFAULT_PAUSE_BREAK_SEC;

  const lines: CaptionLine[] = [];
  let first = -1; // index of the current line's first word, -1 = no open line
  let text = "";

  const closeLine = (last: number) => {
    lines.push({
      text,
      startSec: words[first].startSec,
      endSec: words[last].endSec,
      firstWord: first,
      lastWord: last,
      ...(words[first].speaker !== undefined ? { speaker: words[first].speaker } : {}),
    });
    first = -1;
    text = "";
  };

  words.forEach((word, i) => {
    if (first !== -1) {
      const previous = words[i - 1];
      const speakerChanged =
        word.speaker !== undefined &&
        previous.speaker !== undefined &&
        word.speaker !== previous.speaker;
      const longPause = word.startSec - previous.endSec > pauseBreakSec;
      const overChars = text.length + 1 + word.text.length > targetChars;
      const overTime = word.endSec - words[first].startSec > maxLineSec;
      if (speakerChanged || longPause || overChars || overTime) {
        closeLine(i - 1);
      }
    }

    if (first === -1) {
      // A single word longer than the budget still gets its own (long) line.
      first = i;
      text = word.text;
    } else {
      text += " " + word.text;
    }

    if (word.eos === true && text.length >= EOS_BREAK_FILL * targetChars) {
      closeLine(i);
    }
  });

  if (first !== -1) {
    closeLine(words.length - 1);
  }

  return lines;
}
