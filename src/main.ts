// Panel entry point. Bundled by esbuild into dist/main.js (IIFE) — see
// package.json "bundle". Sections follow UI_COMPONENTS.md.

import type { ImportedCaptions } from "./model";
import {
  exportTranscriptJson,
  findTranscribedClips,
  getActiveContext,
  type TranscribedClip,
} from "./premiere";
import ppro from "./ppro";
import { parseTranscriptJson } from "./transcript";

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const sourceStatus = el<HTMLElement>("source-status");
const sourceResult = el<HTMLElement>("source-result");
const importTranscriptButton = el<HTMLButtonElement>("import-transcript-button");
const importSrtButton = el<HTMLButtonElement>("import-srt-button");
const rescanButton = el<HTMLButtonElement>("rescan-button");
const probeButton = el<HTMLButtonElement>("probe-button");
const probeOutput = el<HTMLElement>("probe-output");

// ---------------------------------------------------------------------------
// Source section (UI_COMPONENTS.md §1)

/** Candidates found by the last scan; import uses the first one. */
let transcribedClips: TranscribedClip[] = [];
/** The imported word model — single source of truth for later steps. */
let imported: ImportedCaptions | null = null;

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function scanForTranscript(): Promise<void> {
  transcribedClips = [];
  importTranscriptButton.disabled = true;
  sourceStatus.className = "hint";
  sourceStatus.textContent = "Scanning for a transcript…";
  try {
    const { project, sequence } = await getActiveContext();
    if (!project) {
      sourceStatus.textContent = "No project is open. Open a project, then Rescan.";
      return;
    }
    if (!sequence) {
      sourceStatus.textContent = "No active sequence. Open a sequence, then Rescan.";
      return;
    }
    transcribedClips = await findTranscribedClips(sequence);
    if (transcribedClips.length > 0) {
      const first = transcribedClips[0];
      const extra =
        transcribedClips.length > 1 ? ` (+${transcribedClips.length - 1} more)` : "";
      sourceStatus.textContent = `Transcript found in this sequence. Clip: ${first.name}${extra}`;
      importTranscriptButton.disabled = false;
    } else {
      sourceStatus.textContent =
        "Tip: transcribe in Premiere's Text panel first for word-level timing, then import here.";
    }
  } catch (err) {
    sourceStatus.className = "hint is-error";
    sourceStatus.textContent = `Scan failed: ${errorText(err)}`;
  }
}

async function importTranscript(): Promise<void> {
  const candidate = transcribedClips[0];
  if (!candidate) {
    return;
  }
  importTranscriptButton.disabled = true;
  sourceResult.className = "hint";
  sourceResult.textContent = "Importing…";
  try {
    const json = await exportTranscriptJson(candidate.clip);
    imported = parseTranscriptJson(json, candidate.name);
    const { words, meta } = imported;
    const speakers = meta.speakerNames.length;
    sourceResult.className = "source-result";
    sourceResult.textContent =
      `Imported transcript · ${words.length} words · ` +
      `${speakers} speaker${speakers === 1 ? "" : "s"}` +
      (meta.language ? ` · ${meta.language}` : "") +
      " · lines: pending wrapper (step 5)";
  } catch (err) {
    imported = null;
    sourceResult.className = "hint is-error";
    sourceResult.textContent = `Import failed: ${errorText(err)}`;
  } finally {
    importTranscriptButton.disabled = transcribedClips.length === 0;
  }
}

rescanButton.addEventListener("click", () => {
  void scanForTranscript();
});
importTranscriptButton.addEventListener("click", () => {
  void importTranscript();
});
// SRT ingress arrives in step 4 (PROJECT_STATUS build order).
importSrtButton.disabled = true;

// Scan once on panel load; Premiere may not have a project open yet, which
// the scan reports gracefully.
void scanForTranscript();

// ---------------------------------------------------------------------------
// Dev probe (step 1): confirms panel ↔ Premiere API wiring.

async function runProbe(): Promise<string> {
  const project = await ppro.Project.getActiveProject();
  if (!project) {
    return "No project is open.";
  }
  const sequence = await project.getActiveSequence();
  if (!sequence) {
    return `Project: ${project.name}\nNo active sequence.`;
  }
  return `Project: ${project.name}\nSequence: ${sequence.name}`;
}

async function onProbeClick(): Promise<void> {
  probeButton.disabled = true;
  // className, not classList: UXP's type defs don't declare classList.
  probeOutput.className = "probe-output";
  probeOutput.textContent = "Checking…";
  try {
    probeOutput.textContent = await runProbe();
  } catch (err) {
    probeOutput.className = "probe-output is-error";
    probeOutput.textContent = `Premiere API error: ${errorText(err)}`;
  } finally {
    probeButton.disabled = false;
  }
}

probeButton.addEventListener("click", () => {
  void onProbeClick();
});
