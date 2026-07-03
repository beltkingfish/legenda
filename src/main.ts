// Panel entry point. Bundled by esbuild into dist/main.js (IIFE) — see
// package.json "bundle". Sections follow UI_COMPONENTS.md.

import presets from "../presets/style-presets.json";
import {
  buildLineRuns,
  reconcileWordEmphasis,
  type WordEmphasisMap,
} from "./emphasis";
import { pickMogrtFile, pickSrtFile } from "./files";
import type { ImportedCaptions } from "./model";
import {
  inspectCapsuleValues,
  probeMogrt,
  probeSelection,
  writeTestOnSelection,
} from "./mogrtProbe";
import {
  attachOverrides,
  overrideKey,
  reconcileOverrides,
  type OverrideMap,
} from "./overrides";
import {
  exportTranscriptJson,
  findTranscribedClips,
  getActiveContext,
  type TranscribedClip,
} from "./premiere";
import ppro from "./ppro";
import { clearCaptions, generateCaptions } from "./renderer";
import { parseSrt } from "./srt";
import {
  getPreset,
  isValidHexColor,
  type PresetId,
  type StyleDef,
} from "./style";
import {
  defaultTiming,
  evaluateTimingWarnings,
  WCAG,
  type TimingField,
  type TimingSettings,
} from "./timing";
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
const overrideEditor = el<HTMLElement>("override-editor");
const overrideLineLabel = el<HTMLElement>("override-line-label");
const overrideColorInput = el<HTMLInputElement>("override-color-input");
const overrideColorSwatch = el<HTMLElement>("override-color-swatch");
const overrideItalicInput = el<HTMLInputElement>("override-italic-input");
const overrideWordChips = el<HTMLElement>("override-word-chips");
const clearOverrideButton = el<HTMLButtonElement>("clear-override-button");
const generateButton = el<HTMLButtonElement>("generate-button");
const clearButton = el<HTMLButtonElement>("clear-button");
const generateStatus = el<HTMLElement>("generate-status");
const customIndicator = el<HTMLElement>("custom-indicator");
const fontFamilyInput = el<HTMLInputElement>("font-family-input");
const fontWeightSelect = el<HTMLSelectElement>("font-weight-select");
const fontSizeInput = el<HTMLInputElement>("font-size-input");
const textColorInput = el<HTMLInputElement>("text-color-input");
const textColorSwatch = el<HTMLElement>("text-color-swatch");
const bgEnabledInput = el<HTMLInputElement>("bg-enabled-input");
const bgColorInput = el<HTMLInputElement>("bg-color-input");
const bgColorSwatch = el<HTMLElement>("bg-color-swatch");
const bgOpacityInput = el<HTMLInputElement>("bg-opacity-input");
const shadowEnabledInput = el<HTMLInputElement>("shadow-enabled-input");
const shadowOpacityInput = el<HTMLInputElement>("shadow-opacity-input");
const applyStyleButton = el<HTMLButtonElement>("apply-style-button");
const minDisplayInput = el<HTMLInputElement>("min-display-input");
const maxDisplayInput = el<HTMLInputElement>("max-display-input");
const transitionInput = el<HTMLInputElement>("transition-input");
const gapInput = el<HTMLInputElement>("gap-input");
const timingWarningEls: Record<TimingField, HTMLElement> = {
  minSec: el<HTMLElement>("min-display-warning"),
  maxSec: el<HTMLElement>("max-display-warning"),
  transitionMs: el<HTMLElement>("transition-warning"),
  gapMs: el<HTMLElement>("gap-warning"),
};
const mogrtProbeButton = el<HTMLButtonElement>("mogrt-probe-button");
const selectionProbeButton = el<HTMLButtonElement>("selection-probe-button");
const inspectValuesButton = el<HTMLButtonElement>("inspect-values-button");
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
/** Per-line overrides keyed by word range (src/overrides.ts). */
let overrideStore: OverrideMap = new Map();
/** Per-word emphasis keyed by canonical word index (src/emphasis.ts). */
let wordEmphasisStore: WordEmphasisMap = new Map();
let selectedLineIndex: number | null = null;
/** Guards against the editor clobbering its own inputs mid-keystroke. */
let suppressEditorRender = false;

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
  const words = imported.words;
  const wrapped = wrapWords(words, {
    targetLineChars: currentTargetLineChars(),
    maxLineSec: currentTiming.maxSec,
  });
  // Overrides are keyed by word range: reconcile against the new wrap (stale
  // ranges drop — never silently restyle different words), then attach for
  // the renderer (ARCHITECTURE §6: re-applied after every regeneration).
  // Word emphasis reconciles against the canonical words (index + text must
  // still match) and rides each line as per-text-run styling.
  overrideStore = reconcileOverrides(overrideStore, wrapped);
  wordEmphasisStore = reconcileWordEmphasis(wordEmphasisStore, words);
  lines = attachOverrides(wrapped, overrideStore).map((line) => {
    const runs = buildLineRuns(line, words, wordEmphasisStore);
    return runs ? { ...line, runs } : line;
  });
  if (selectedLineIndex !== null && selectedLineIndex >= lines.length) {
    selectedLineIndex = null;
  }
  generateButton.disabled = lines.length === 0;
  applyStyleButton.disabled = lines.length === 0;

  const { meta } = imported;
  const speakers = meta.speakerNames.length;
  sourceResult.className = "source-result";
  sourceResult.textContent =
    `Imported ${meta.kind} · ${words.length} words · ${lines.length} lines` +
    (meta.kind === "transcript"
      ? ` · ${speakers} speaker${speakers === 1 ? "" : "s"}`
      : "") +
    (meta.language ? ` · ${meta.language}` : "") +
    (meta.kind === "srt" && meta.sourceName ? ` · ${meta.sourceName}` : "") +
    (meta.skippedTokens ? ` · ${meta.skippedTokens} malformed token(s) skipped` : "");

  // Per-caption list (UI_COMPONENTS §5): click a line to edit its overrides.
  linePreview.textContent = "";
  lines.forEach((line, index) => {
    const item = document.createElement("li");
    item.className =
      (index === selectedLineIndex ? "is-selected " : "") +
      (line.override || line.runs ? "has-override" : "");
    const time = document.createElement("span");
    // Amber timecode when the line leaves the WCAG safe zone (informational
    // only — generation still runs; SPECIFICATION §9).
    const duration = line.endSec - line.startSec;
    time.className =
      duration < WCAG.minSec || duration > WCAG.maxSec
        ? "line-time is-out-of-bounds"
        : "line-time";
    time.textContent = `${formatTime(line.startSec)}–${formatTime(line.endSec)}`;
    const text = document.createElement("span");
    text.className = "line-text";
    text.textContent = line.text;
    item.appendChild(time);
    item.appendChild(text);
    item.addEventListener("click", () => {
      selectedLineIndex = index === selectedLineIndex ? null : index;
      renderLines();
    });
    linePreview.appendChild(item);
  });
  if (!suppressEditorRender) {
    renderOverrideEditor();
  }
}

function renderOverrideEditor(): void {
  const line = selectedLineIndex !== null ? lines[selectedLineIndex] : undefined;
  if (!line) {
    overrideEditor.className = "override-editor";
    return;
  }
  overrideEditor.className = "override-editor is-visible";
  const shortText = line.text.length > 40 ? `${line.text.slice(0, 40)}…` : line.text;
  overrideLineLabel.textContent =
    `Line ${(selectedLineIndex ?? 0) + 1} · “${shortText}”`;
  const override = overrideStore.get(overrideKey(line));
  overrideColorInput.value = override?.color ?? "";
  overrideItalicInput.checked = override?.italic === true;
  setSwatch(overrideColorSwatch, override?.color ?? "");

  // Word-emphasis chips (UI_COMPONENTS §5): one chip per word in the line;
  // click toggles italic on just that word.
  overrideWordChips.textContent = "";
  if (!imported) {
    return;
  }
  for (let w = line.firstWord; w <= line.lastWord; w++) {
    const chip = document.createElement("span");
    chip.className =
      wordEmphasisStore.get(w)?.italic === true ? "word-chip is-italic" : "word-chip";
    chip.textContent = imported.words[w].text;
    const index = w;
    chip.addEventListener("click", () => {
      toggleWordEmphasis(index);
    });
    overrideWordChips.appendChild(chip);
  }
}

function toggleWordEmphasis(index: number): void {
  if (!imported) {
    return;
  }
  if (wordEmphasisStore.get(index)?.italic === true) {
    wordEmphasisStore.delete(index);
  } else {
    wordEmphasisStore.set(index, { text: imported.words[index].text, italic: true });
  }
  renderLines(); // re-attaches runs and re-renders the editor's chips
}

function readOverrideEditor(): void {
  const line = selectedLineIndex !== null ? lines[selectedLineIndex] : undefined;
  if (!line) {
    return;
  }
  const key = overrideKey(line);
  const colorRaw = overrideColorInput.value.trim();
  const override: { color?: string; italic?: boolean } = {};
  if (colorRaw !== "" && isValidHexColor(colorRaw)) {
    override.color = colorRaw.startsWith("#") ? colorRaw : `#${colorRaw}`;
  }
  if (overrideItalicInput.checked) {
    override.italic = true;
  }
  if (override.color !== undefined || override.italic !== undefined) {
    overrideStore.set(key, override);
  } else {
    overrideStore.delete(key);
  }
  setSwatch(overrideColorSwatch, override.color ?? "");
  suppressEditorRender = true;
  renderLines();
  suppressEditorRender = false;
}

overrideColorInput.addEventListener("input", () => {
  readOverrideEditor();
});
overrideItalicInput.addEventListener("change", () => {
  readOverrideEditor();
});
clearOverrideButton.addEventListener("click", () => {
  const line = selectedLineIndex !== null ? lines[selectedLineIndex] : undefined;
  if (!line) {
    return;
  }
  overrideStore.delete(overrideKey(line));
  for (let w = line.firstWord; w <= line.lastWord; w++) {
    wordEmphasisStore.delete(w);
  }
  renderLines();
});

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

// ---------------------------------------------------------------------------
// Caption Style section (UI_COMPONENTS.md §2). The working style is applied
// at patch time; "Apply to all" = regenerate (ARCHITECTURE §6).

let currentStyle: StyleDef = getPreset("clean");
let currentPresetId: PresetId | "custom" = "clean";

// Explicit ids rather than querySelectorAll — UXP NodeList iterability is
// unverified, and these three are fixed.
const presetButtons: { id: PresetId; button: HTMLButtonElement }[] = (
  ["clean", "bold", "minimal"] as PresetId[]
).map((id) => ({ id, button: el<HTMLButtonElement>(`preset-${id}`) }));

function setSwatch(swatch: HTMLElement, hex: string): void {
  try {
    (swatch as unknown as { style: { backgroundColor: string } }).style.backgroundColor =
      isValidHexColor(hex) ? (hex.startsWith("#") ? hex : `#${hex}`) : "transparent";
  } catch {
    // swatches are cosmetic; ignore styling failures
  }
}

function renderStyleControls(): void {
  fontFamilyInput.value = currentStyle.typography.fontFamily;
  fontWeightSelect.value = currentStyle.typography.fontWeight;
  fontSizeInput.value = String(currentStyle.typography.fontSize);
  textColorInput.value = currentStyle.textColor;
  bgEnabledInput.checked = currentStyle.background.enabled;
  bgColorInput.value = currentStyle.background.color;
  bgOpacityInput.value = String(Math.round(currentStyle.background.opacity * 100));
  shadowEnabledInput.checked = currentStyle.dropShadow.enabled;
  shadowOpacityInput.value = String(Math.round(currentStyle.dropShadow.opacity * 100));
  setSwatch(textColorSwatch, currentStyle.textColor);
  setSwatch(bgColorSwatch, currentStyle.background.color);
  for (const { id, button } of presetButtons) {
    button.className =
      id === currentPresetId ? "button preset-button is-active" : "button preset-button";
  }
  customIndicator.className =
    currentPresetId === "custom" ? "custom-indicator is-visible" : "custom-indicator";
}

function parseOpacityInput(input: HTMLInputElement, fallback: number): number {
  const parsed = Number.parseInt(input.value, 10);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) / 100 : fallback;
}

function readStyleControls(): void {
  const t = currentStyle.typography;
  t.fontFamily = fontFamilyInput.value.trim() || t.fontFamily;
  t.fontWeight = fontWeightSelect.value || t.fontWeight;
  const size = Number.parseInt(fontSizeInput.value, 10);
  if (Number.isFinite(size) && size > 0) {
    t.fontSize = size;
  }
  if (isValidHexColor(textColorInput.value)) {
    currentStyle.textColor = textColorInput.value.startsWith("#")
      ? textColorInput.value
      : `#${textColorInput.value}`;
  }
  currentStyle.background.enabled = bgEnabledInput.checked;
  if (isValidHexColor(bgColorInput.value)) {
    currentStyle.background.color = bgColorInput.value.startsWith("#")
      ? bgColorInput.value
      : `#${bgColorInput.value}`;
  }
  currentStyle.background.opacity = parseOpacityInput(
    bgOpacityInput,
    currentStyle.background.opacity
  );
  currentStyle.dropShadow.enabled = shadowEnabledInput.checked;
  currentStyle.dropShadow.opacity = parseOpacityInput(
    shadowOpacityInput,
    currentStyle.dropShadow.opacity
  );
  currentPresetId = "custom";
  setSwatch(textColorSwatch, currentStyle.textColor);
  setSwatch(bgColorSwatch, currentStyle.background.color);
  for (const { button } of presetButtons) {
    button.className = "button preset-button";
  }
  customIndicator.className = "custom-indicator is-visible";
}

for (const { id, button } of presetButtons) {
  button.addEventListener("click", () => {
    currentStyle = getPreset(id);
    currentPresetId = id;
    renderStyleControls();
  });
}
for (const input of [fontFamilyInput, fontSizeInput, textColorInput, bgColorInput, bgOpacityInput, shadowOpacityInput]) {
  input.addEventListener("input", () => {
    readStyleControls();
  });
}
for (const input of [fontWeightSelect, bgEnabledInput, shadowEnabledInput]) {
  input.addEventListener("change", () => {
    readStyleControls();
  });
}

renderStyleControls();

// ---------------------------------------------------------------------------
// Timing section (UI_COMPONENTS.md §4). Values always apply; leaving the safe
// zone only shows the exact warning copy — never blocks.

let currentTiming: TimingSettings = defaultTiming();

function renderTimingWarnings(): void {
  const warnings = evaluateTimingWarnings(currentTiming);
  for (const field of Object.keys(timingWarningEls) as TimingField[]) {
    const warning = warnings.find((w) => w.field === field);
    const elWarning = timingWarningEls[field];
    if (warning) {
      elWarning.textContent = `⚠ ${warning.message}`;
      elWarning.className = "timing-warning is-visible";
    } else {
      elWarning.textContent = "";
      elWarning.className = "timing-warning";
    }
  }
}

function renderTimingControls(): void {
  minDisplayInput.value = String(currentTiming.minSec);
  maxDisplayInput.value = String(currentTiming.maxSec);
  transitionInput.value = String(currentTiming.transitionMs);
  gapInput.value = String(currentTiming.gapMs);
  renderTimingWarnings();
}

function readTimingControls(): void {
  const read = (input: HTMLInputElement, fallback: number): number => {
    const parsed = Number.parseFloat(input.value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
  };
  currentTiming = {
    minSec: read(minDisplayInput, currentTiming.minSec),
    maxSec: Math.max(0.1, read(maxDisplayInput, currentTiming.maxSec)),
    transitionMs: read(transitionInput, currentTiming.transitionMs),
    gapMs: read(gapInput, currentTiming.gapMs),
  };
  renderTimingWarnings();
  renderLines(); // maxSec feeds the wrapper; preview bounds marking updates too
}

for (const input of [minDisplayInput, maxDisplayInput, transitionInput, gapInput]) {
  input.addEventListener("input", () => {
    readTimingControls();
  });
}

renderTimingControls();

// ---------------------------------------------------------------------------
// Generate section (UI_COMPONENTS.md §6)

async function onGenerateClick(): Promise<void> {
  generateButton.disabled = true;
  clearButton.disabled = true;
  applyStyleButton.disabled = true;
  generateStatus.className = "hint";
  generateStatus.textContent = "Generating…";
  try {
    const result = await generateCaptions(lines, currentStyle, currentTiming, (done, total) => {
      generateStatus.textContent = `Inserting caption ${done}/${total}…`;
    });
    generateStatus.className = "source-result";
    generateStatus.textContent =
      `Generated ${result.inserted} caption(s) on video track ${result.trackIndex + 1}` +
      (result.cleared > 0 ? ` (cleared ${result.cleared} previous)` : "") +
      ` · scaled to ${result.scalePct.toFixed(1)}%` +
      (result.droppedLines > 0
        ? ` · ${result.droppedLines} zero-length line(s) skipped`
        : "");
  } catch (err) {
    generateStatus.className = "hint is-error";
    generateStatus.textContent = `Generate failed: ${errorText(err)}`;
  } finally {
    generateButton.disabled = lines.length === 0;
    applyStyleButton.disabled = lines.length === 0;
    clearButton.disabled = false;
  }
}

// Destructive: clears every clip on the plugin track — confirm once
// (UI_COMPONENTS "Interaction principles") via a two-step button.
let clearArmed = false;

async function onClearClick(): Promise<void> {
  if (!clearArmed) {
    clearArmed = true;
    clearButton.textContent = "Really clear the caption track?";
    return;
  }
  clearArmed = false;
  clearButton.textContent = "Clear captions";
  clearButton.disabled = true;
  try {
    const removed = await clearCaptions();
    generateStatus.className = "hint";
    generateStatus.textContent =
      removed > 0 ? `Removed ${removed} caption(s).` : "Nothing to clear.";
  } catch (err) {
    generateStatus.className = "hint is-error";
    generateStatus.textContent = `Clear failed: ${errorText(err)}`;
  } finally {
    clearButton.disabled = false;
  }
}

generateButton.addEventListener("click", () => {
  void onGenerateClick();
});
clearButton.addEventListener("click", () => {
  void onClearClick();
});
// "Apply to all" = regenerate with the current style (ARCHITECTURE §6).
applyStyleButton.addEventListener("click", () => {
  void onGenerateClick();
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
