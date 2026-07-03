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

import type { TemplateStyleValues } from "./style";

interface StrDbEntry {
  localeString?: string;
  str?: string;
}

interface FontEditInfo {
  fontEditValue?: string;
  fontSizeEditValue?: number;
  fontFSItalicValue?: boolean;
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
  /** Per-text-run arrays on the text param. */
  fontEditValue?: string[];
  fontSizeEditValue?: number[];
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

  const lineText = findControl(definition, LINE_TEXT);
  if (lineText?.fonteditinfo) {
    lineText.fonteditinfo.fontEditValue = style.fontName;
    lineText.fonteditinfo.fontSizeEditValue = style.fontSize;
  }
  for (const param of capParamsOf(definition, LINE_TEXT)) {
    if (Array.isArray(param.fontEditValue)) {
      param.fontEditValue = param.fontEditValue.map(() => style.fontName);
    }
    if (Array.isArray(param.fontSizeEditValue)) {
      param.fontSizeEditValue = param.fontSizeEditValue.map(() => style.fontSize);
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

  const entries: Record<string, Uint8Array> = { ...template.entries };
  entries[DEFINITION] = strToU8(JSON.stringify(definition));
  return zipSync(entries, { level: 6 });
}
