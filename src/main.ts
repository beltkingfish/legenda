// Panel entry point. Bundled by esbuild into dist/main.js (IIFE) — see
// package.json "bundle". Sections follow UI_COMPONENTS.md.

import presets from "../presets/style-presets.json";
import { pickMogrtFile, pickSrtFile } from "./files";
import type { ImportedCaptions } from "./model";
import {
  inspectCapsuleValues,
  probeMogrt,
  probeSelection,
  roundTripLineText,
  writeTestOnSelection,
} from "./mogrtProbe";
import {
  exportTranscriptJson,
  findTranscribedClips,
  getActiveContext,
  type TranscribedClip,
} from "./premiere";
import ppro from "./ppro";
import { parseSrt } from "./srt";
import { parseTranscriptJson } from "./transcript";
import { wrapWords, type CaptionLine } from "./wrap";

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const sourceStatus = el<HTMLElement>("source-status");
const sourceResult = el<HTMLElement>("source-result");
const importTranscriptButton = el<HTMLButtonElement>("import-transcript-button");
const importSrtButton = el<HTMLButtonElement>("import-srt-button");
const rescanButton = el<HTMLButtonElement>("rescan-button");
const lineLengthInput = el<HTMLInputElement>("line-length-input");
const linePreview = el<HTMLElement>("line-preview");
const mogrtProbeButton = el<HTMLButtonElement>("mogrt-probe-button");
const selectionProbeButton = el<HTMLButtonElement>("selection-probe-button");
const inspectValuesButton = el<HTMLButtonElement>("inspect-values-button");
const roundtripButton = el<HTMLButtonElement>("roundtrip-button");
const writeTestButton = el<HTMLButtonElement>("write-test-button");
const mogrtProbeOutput = el<HTMLElement>("mogrt-probe-output");
const probeButton = el<HTMLButtonElement>("probe-button");
const probeOutput = el<HTMLElement>("probe-output");

// ---------------------------------------------------------------------------
// Source section (UI_COMPONENTS.md §1)

/** Candidates found by the last scan; import uses the first one. */
let transcribedClips: TranscribedClip[] = [];

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

// Imported words (canonical) and the lines derived from them by the wrapper.
// Later sections (styling, renderer) consume this state.
let imported: ImportedCaptions | null = null;
let lines: CaptionLine[] = [];

function currentTargetLineChars(): number {
  const parsed = Number.parseInt(lineLengthInput.value, 10);
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : presets.defaults.wrapping.targetLineChars;
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = (sec % 60).toFixed(1).padStart(4, "0");
  return `${m}:${s}`;
}

function renderLines(): void {
  if (!imported) {
    return;
  }
  lines = wrapWords(imported.words, { targetLineChars: currentTargetLineChars() });

  const { words, meta } = imported;
  const speakers = meta.speakerNames.length;
  sourceResult.className = "source-result";
  sourceResult.textContent =
    `Imported ${meta.kind} · ${words.length} words · ${lines.length} lines` +
    (meta.kind === "transcript"
      ? ` · ${speakers} speaker${speakers === 1 ? "" : "s"}`
      : "") +
    (meta.language ? ` · ${meta.language}` : "") +
    (meta.kind === "srt" && meta.sourceName ? ` · ${meta.sourceName}` : "");

  // Read-only preview; the editable per-caption list is a later step.
  linePreview.textContent = "";
  for (const line of lines) {
    const item = document.createElement("li");
    const time = document.createElement("span");
    time.className = "line-time";
    time.textContent = `${formatTime(line.startSec)}–${formatTime(line.endSec)}`;
    const text = document.createElement("span");
    text.className = "line-text";
    text.textContent = line.text;
    item.appendChild(time);
    item.appendChild(text);
    linePreview.appendChild(item);
  }
}

function showImported(result: ImportedCaptions): void {
  imported = result;
  renderLines();
}

function showImportError(err: unknown): void {
  imported = null;
  lines = [];
  linePreview.textContent = "";
  sourceResult.className = "hint is-error";
  sourceResult.textContent = `Import failed: ${errorText(err)}`;
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
    showImported(parseTranscriptJson(json, candidate.name));
  } catch (err) {
    showImportError(err);
  } finally {
    importTranscriptButton.disabled = transcribedClips.length === 0;
  }
}

async function importSrt(): Promise<void> {
  try {
    const picked = await pickSrtFile();
    if (!picked) {
      return; // user cancelled the picker
    }
    sourceResult.className = "hint";
    sourceResult.textContent = "Importing…";
    showImported(parseSrt(picked.text, picked.name));
  } catch (err) {
    showImportError(err);
  }
}

rescanButton.addEventListener("click", () => {
  void scanForTranscript();
});
importTranscriptButton.addEventListener("click", () => {
  void importTranscript();
});
importSrtButton.addEventListener("click", () => {
  void importSrt();
});
// Lines are cheap derived data — re-wrap live as the setting changes.
lineLengthInput.addEventListener("input", () => {
  renderLines();
});

// Scan once on panel load; Premiere may not have a project open yet, which
// the scan reports gracefully.
void scanForTranscript();

// ---------------------------------------------------------------------------
// Dev probe (step 6): MOGRT insert + param discovery (docs/MOGRT_SPEC.md).

async function onMogrtProbeClick(): Promise<void> {
  try {
    const picked = await pickMogrtFile();
    if (!picked) {
      return; // picker cancelled
    }
    mogrtProbeButton.disabled = true;
    mogrtProbeOutput.className = "probe-output";
    mogrtProbeOutput.textContent = `Inserting ${picked.name}…`;
    mogrtProbeOutput.textContent = await probeMogrt(picked.path);
  } catch (err) {
    mogrtProbeOutput.className = "probe-output is-error";
    mogrtProbeOutput.textContent = `MOGRT probe failed: ${errorText(err)}`;
  } finally {
    mogrtProbeButton.disabled = false;
  }
}

mogrtProbeButton.addEventListener("click", () => {
  void onMogrtProbeClick();
});

async function onSelectionProbeClick(): Promise<void> {
  selectionProbeButton.disabled = true;
  mogrtProbeOutput.className = "probe-output";
  mogrtProbeOutput.textContent = "Dumping selected clip…";
  try {
    mogrtProbeOutput.textContent = await probeSelection();
  } catch (err) {
    mogrtProbeOutput.className = "probe-output is-error";
    mogrtProbeOutput.textContent = `Selection probe failed: ${errorText(err)}`;
  } finally {
    selectionProbeButton.disabled = false;
  }
}

selectionProbeButton.addEventListener("click", () => {
  void onSelectionProbeClick();
});

async function onInspectValuesClick(): Promise<void> {
  inspectValuesButton.disabled = true;
  mogrtProbeOutput.className = "probe-output";
  mogrtProbeOutput.textContent = "Reading param values…";
  try {
    mogrtProbeOutput.textContent = await inspectCapsuleValues();
  } catch (err) {
    mogrtProbeOutput.className = "probe-output is-error";
    mogrtProbeOutput.textContent = `Read values failed: ${errorText(err)}`;
  } finally {
    inspectValuesButton.disabled = false;
  }
}

inspectValuesButton.addEventListener("click", () => {
  void onInspectValuesClick();
});

async function onRoundtripClick(): Promise<void> {
  roundtripButton.disabled = true;
  mogrtProbeOutput.className = "probe-output";
  mogrtProbeOutput.textContent = "Round-tripping Line Text…";
  try {
    mogrtProbeOutput.textContent = await roundTripLineText();
  } catch (err) {
    mogrtProbeOutput.className = "probe-output is-error";
    mogrtProbeOutput.textContent = `Round-trip failed: ${errorText(err)}`;
  } finally {
    roundtripButton.disabled = false;
  }
}

roundtripButton.addEventListener("click", () => {
  void onRoundtripClick();
});

async function onWriteTestClick(): Promise<void> {
  writeTestButton.disabled = true;
  mogrtProbeOutput.className = "probe-output";
  mogrtProbeOutput.textContent = "Writing test values…";
  try {
    mogrtProbeOutput.textContent = await writeTestOnSelection();
  } catch (err) {
    mogrtProbeOutput.className = "probe-output is-error";
    mogrtProbeOutput.textContent = `Write test failed: ${errorText(err)}`;
  } finally {
    writeTestButton.disabled = false;
  }
}

writeTestButton.addEventListener("click", () => {
  void onWriteTestClick();
});

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
