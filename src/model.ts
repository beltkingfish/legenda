// Internal, source-agnostic caption model (ARCHITECTURE.md §4).
// The word list is canonical; lines are derived later by the wrapper (step 5).

/** One timed word — the canonical unit of the internal model. */
export interface CaptionWord {
  /** Word text as transcribed, including attached punctuation. */
  text: string;
  startSec: number;
  endSec: number;
  /** Resolved speaker name, when the source provides one. */
  speaker?: string;
  /** True when the source marks this word as ending a sentence
      (the wrapper prefers line breaks here). */
  eos?: boolean;
}

export interface CaptionSourceMeta {
  kind: "transcript" | "srt";
  /** BCP-47-ish code as reported by the source (e.g. "en-us"). */
  language?: string;
  /** Name of the clip the transcript came from (transcript sources only). */
  clipName?: string;
  speakerNames: string[];
}

/** Result of a successful import, before line wrapping. */
export interface ImportedCaptions {
  meta: CaptionSourceMeta;
  words: CaptionWord[];
}
