// Per-line MOGRT text patching (ARCHITECTURE §3). TypeScript port of the
// step-6-verified recipe (reference: scripts/patch-mogrt-text.py):
//   - a .mogrt is a zip; the render-driving text default lives in
//     definition.json in THREE string fields — the Line Text clientControl's
//     value plus capsuleparams.capParams[] capPropDefault/textEditValue —
//     covered here by replacing every string field equal to the current
//     default (all locales included);
//   - each variant gets a fresh capsuleID (and a distinct capsuleName) so
//     Premiere treats it as a distinct template;
//   - the embedded AE project needs NO changes (confirmed live).
// Pure logic — no Premiere APIs — so it is unit-tested in tests/.

// strToU8/strFromU8: Premiere's UXP runtime has no TextEncoder/TextDecoder
// globals (confirmed live 2026-07-02) — fflate's helpers cover UTF-8.
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import type { Rgba, StyleRun, TemplateStyleValues } from "./style";

interface StrDbEntry {
  localeString?: string;
  str?: string;
}

interface FontEditInfo {
  fontEditValue?: string;
  fontSizeEditValue?: number;
  fontFSItalicValue?: boolean;
  /** Gate: faux-style flags are ignored while this is false (found live). */
  capPropFontFauxStyleEdit?: boolean;
  [key: string]: unknown;
}

interface ClientControl {
  id?: string;
  uiName?: { strDB?: StrDbEntry[] };
  value?: { strDB?: StrDbEntry[] } | number | boolean | number[];
  fonteditinfo?: FontEditInfo;
}

interface CapParam {
  capPropMatchName?: string;
  capPropUIName?: string;
  capPropDefault?: unknown;
  capPropFontFauxStyleEdit?: boolean;
  /** Number of text runs — must equal the per-run arrays' length. */
  capPropTextRunCount?: number;
  /** Per-text-run PARALLEL arrays on the text param (one entry per run). */
  fontEditValue?: string[];
  fontSizeEditValue?: number[];
  fontFSItalicValue?: boolean[];
  fontFSBoldValue?: boolean[];
  fontFSAllCapsValue?: boolean[];
  fontFSSmallCapsValue?: boolean[];
  /** Characters covered by each style run — MUST match the patched text
      length, or trailing characters render with fallback styling
      (found live 2026-07-03: mixed-weight captions past char 19). */
  fontTextRunLength?: number[];
  textEditValue?: unknown;
  [key: string]: unknown;
}

interface DefinitionJson {
  capsuleID?: string;
  capsuleName?: string;
  capsuleNameLocalized?: { strDB?: StrDbEntry[] };
  clientControls?: ClientControl[];
  sourceInfoLocalized?: Record<string, { capsuleparams?: { capParams?: CapParam[] } }>;
  [key: string]: unknown;
}

export interface MogrtTemplate {
  /** Zip entries; definition.json is re-derived per patch. */
  entries: Record<string, Uint8Array>;
  /** The template's current Line Text default — the patch anchor. */
  defaultText: string;
}

const DEFINITION = "definition.json";
const LINE_TEXT = "Line Text";

function decodeJson(bytes: Uint8Array): DefinitionJson {
  return JSON.parse(strFromU8(bytes)) as DefinitionJson;
}

function controlName(control: ClientControl): string | undefined {
  return (control.uiName?.strDB ?? [])[0]?.str;
}

function textValueOf(control: ClientControl): string | undefined {
  const value = control.value;
  if (value && typeof value === "object" && !Array.isArray(value) && "strDB" in value) {
    return value.strDB?.[0]?.str;
  }
  return undefined;
}

/** Find the Line Text control's current value — also a contract check. */
function findDefaultText(definition: DefinitionJson): string {
  for (const control of definition.clientControls ?? []) {
    if (controlName(control) === LINE_TEXT) {
      const value = textValueOf(control);
      if (typeof value === "string" && value.length > 0) {
        return value;
      }
    }
  }
  throw new Error(
    `Template has no "${LINE_TEXT}" control with a text default — ` +
      "not a Legenda caption template? (see docs/MOGRT_SPEC.md)"
  );
}

function findControl(definition: DefinitionJson, uiName: string): ClientControl | undefined {
  return (definition.clientControls ?? []).find((c) => controlName(c) === uiName);
}

/** Every capParam (any locale) belonging to the named control. */
function capParamsOf(definition: DefinitionJson, uiName: string): CapParam[] {
  const id = findControl(definition, uiName)?.id;
  const found: CapParam[] = [];
  for (const locale of Object.values(definition.sourceInfoLocalized ?? {})) {
    for (const param of locale.capsuleparams?.capParams ?? []) {
      if (param.capPropUIName === uiName || (id && param.capPropMatchName === id)) {
        found.push(param);
      }
    }
  }
  return found;
}

/** Set a simple-valued control (color array / number / boolean) everywhere. */
function setSimpleControl(
  definition: DefinitionJson,
  uiName: string,
  value: number | boolean | number[]
): void {
  const control = findControl(definition, uiName);
  if (control) {
    control.value = Array.isArray(value) ? [...value] : value;
  }
  for (const param of capParamsOf(definition, uiName)) {
    param.capPropDefault = Array.isArray(value) ? [...value] : value;
  }
}

/**
 * Apply template-unit style values (docs/MOGRT_SPEC.md). Colors/numbers/
 * booleans go to the control value + capPropDefault; font family/size go to
 * the Line Text control's fonteditinfo (string/number) and its capParam's
 * per-text-run arrays.
 */
function applyStyle(definition: DefinitionJson, style: TemplateStyleValues): void {
  setSimpleControl(definition, "Text Color", style.textColor);
  setSimpleControl(definition, "Background", style.backgroundEnabled);
  setSimpleControl(definition, "Background Color", style.backgroundColor);
  setSimpleControl(definition, "Background Opacity", style.backgroundOpacity);
  setSimpleControl(definition, "Shadow Opacity", style.shadowOpacity);
  // v2 exposures; setSimpleControl no-ops on templates without them (v1).
  setSimpleControl(definition, "Outline Width", style.outlineWidth);
  setSimpleControl(definition, "Outline Color", style.outlineColor);

  const lineText = findControl(definition, LINE_TEXT);
  const italic = style.italic ?? false;
  if (lineText?.fonteditinfo) {
    lineText.fonteditinfo.fontEditValue = style.fontName;
    lineText.fonteditinfo.fontSizeEditValue = style.fontSize;
    lineText.fonteditinfo.fontFSItalicValue = italic;
    if (italic) {
      // The template was authored with faux-style editing disabled, which
      // gates fontFSItalicValue (confirmed live: flag alone did not render).
      // The gate is just another definition.json field — open it when needed.
      lineText.fonteditinfo.capPropFontFauxStyleEdit = true;
    }
  }
  for (const param of capParamsOf(definition, LINE_TEXT)) {
    if (Array.isArray(param.fontEditValue)) {
      param.fontEditValue = param.fontEditValue.map(() => style.fontName);
    }
    if (Array.isArray(param.fontSizeEditValue)) {
      param.fontSizeEditValue = param.fontSizeEditValue.map(() => style.fontSize);
    }
    if (Array.isArray(param.fontFSItalicValue)) {
      param.fontFSItalicValue = param.fontFSItalicValue.map(() => italic);
    }
    if (italic && param.capPropFontFauxStyleEdit !== undefined) {
      param.capPropFontFauxStyleEdit = true;
    }
  }
}

/**
 * Arrays that carry ONE value for the whole caption but must stay parallel
 * to fontTextRunLength — expanded to the run count by repeating their first
 * entry. (fontTextRunLength and fontFSItalicValue are written per run.)
 */
const PER_RUN_CARRY_KEYS = [
  "fontEditValue",
  "fontSizeEditValue",
  "fontFSBoldValue",
  "fontFSAllCapsValue",
  "fontFSSmallCapsValue",
] as const;

/**
 * Write per-text-run styling (docs/MOGRT_SPEC.md "Per-text-run styling"):
 * run boundaries + per-run italic; every other per-run array is expanded to
 * the run count so the arrays stay parallel. Call AFTER applyStyle so the
 * expansion picks up style-written values.
 */
function applyRuns(definition: DefinitionJson, runs: StyleRun[]): void {
  const anyItalic = runs.some((run) => run.italic);
  const lineText = findControl(definition, LINE_TEXT);
  if (lineText?.fonteditinfo) {
    // The scalar mirrors the whole-text value; only uniform italics map to it.
    lineText.fonteditinfo.fontFSItalicValue = runs.every((run) => run.italic);
    if (anyItalic) {
      lineText.fonteditinfo.capPropFontFauxStyleEdit = true;
    }
  }
  for (const param of capParamsOf(definition, LINE_TEXT)) {
    if (typeof param.capPropTextRunCount === "number") {
      param.capPropTextRunCount = runs.length;
    }
    if (Array.isArray(param.fontTextRunLength)) {
      param.fontTextRunLength = runs.map((run) => run.length);
    }
    if (Array.isArray(param.fontFSItalicValue)) {
      param.fontFSItalicValue = runs.map((run) => run.italic);
    }
    for (const key of PER_RUN_CARRY_KEYS) {
      const values = (param as Record<string, unknown>)[key];
      if (Array.isArray(values) && values.length > 0) {
        (param as Record<string, unknown>)[key] = runs.map(() => values[0] as unknown);
      }
    }
    if (anyItalic && param.capPropFontFauxStyleEdit !== undefined) {
      param.capPropFontFauxStyleEdit = true;
    }
  }
}

/** Load and validate a .mogrt template from raw bytes. */
export function loadTemplate(bytes: Uint8Array): MogrtTemplate {
  const entries = unzipSync(bytes);
  if (!entries[DEFINITION]) {
    throw new Error("Not a .mogrt: missing definition.json");
  }
  return { entries, defaultText: findDefaultText(decodeJson(entries[DEFINITION])) };
}

/** Replace every string field equal to `oldText` anywhere in the tree. */
function replaceEverywhere(node: unknown, oldText: string, newText: string): unknown {
  if (Array.isArray(node)) {
    return node.map((child) => replaceEverywhere(child, oldText, newText));
  }
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node)) {
      out[key] = replaceEverywhere(value, oldText, newText);
    }
    return out;
  }
  return node === oldText ? newText : node;
}

export interface PatchOptions {
  /** The caption line. */
  text: string;
  /** Capsule name shown in Premiere's project panel. */
  label: string;
  /** Template-unit style values; omit to keep the authored defaults. */
  style?: TemplateStyleValues;
  /**
   * Per-word emphasis as text runs (src/emphasis.ts). When present, the runs
   * are authoritative for the line's italics (line-level italic is folded in
   * by the builder); lengths must sum exactly to `text.length`.
   */
  runs?: StyleRun[];
  /** Fade ramp duration — the `Transition (ms)` control (template v2). */
  transitionMs?: number;
  /**
   * The line's exact display duration — the `Duration (ms)` control.
   * Premiere uniformly time-stretches the comp onto the clip (ARCHITECTURE
   * hard constraint #8); template expressions use this to invert the stretch
   * and place intro/outro ramps in real clip time.
   */
  durationMs?: number;
  /**
   * Per-word color ranges in template units (0-based char start, exclusive
   * end, [r,g,b,a] color). Max TWO — the template's slot count; the caller
   * truncates and reports overflow.
   */
  emphasis?: { start: number; end: number; color: Rgba }[];
}

/** Produce a patched .mogrt (as zip bytes) for one caption line. */
export function patchTemplate(
  template: MogrtTemplate,
  options: PatchOptions
): Uint8Array {
  let definition = decodeJson(template.entries[DEFINITION]);
  definition = replaceEverywhere(
    definition,
    template.defaultText,
    options.text
  ) as DefinitionJson;
  definition.capsuleID = crypto.randomUUID();
  definition.capsuleName = options.label;
  for (const entry of definition.capsuleNameLocalized?.strDB ?? []) {
    entry.str = options.label;
  }
  // The single style run must span the whole new text (see CapParam note).
  for (const param of capParamsOf(definition, LINE_TEXT)) {
    if (Array.isArray(param.fontTextRunLength)) {
      param.fontTextRunLength = [options.text.length];
    }
  }
  if (options.style) {
    applyStyle(definition, options.style);
  }
  if (options.transitionMs !== undefined) {
    setSimpleControl(definition, "Transition (ms)", options.transitionMs);
  }
  if (options.durationMs !== undefined) {
    setSimpleControl(definition, "Duration (ms)", options.durationMs);
  }
  if (options.emphasis) {
    if (options.emphasis.length > 2) {
      throw new Error("The template has two emphasis slots — truncate before patching.");
    }
    options.emphasis.forEach((slot, i) => {
      setSimpleControl(definition, `Emphasis ${i + 1} Start`, slot.start);
      setSimpleControl(definition, `Emphasis ${i + 1} End`, slot.end);
      setSimpleControl(definition, `Emphasis ${i + 1} Color`, slot.color);
    });
  }
  if (options.runs) {
    const covered = options.runs.reduce((sum, run) => sum + run.length, 0);
    if (covered !== options.text.length) {
      throw new Error(
        `Style runs cover ${covered} of ${options.text.length} characters — ` +
          "runs must span the caption text exactly."
      );
    }
    applyRuns(definition, options.runs);
  }

  const entries: Record<string, Uint8Array> = { ...template.entries };
  entries[DEFINITION] = strToU8(JSON.stringify(definition));
  return zipSync(entries, { level: 6 });
}
