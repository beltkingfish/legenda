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

interface StrDbEntry {
  localeString?: string;
  str?: string;
}

interface ClientControl {
  uiName?: { strDB?: StrDbEntry[] };
  value?: { strDB?: StrDbEntry[] };
}

interface DefinitionJson {
  capsuleID?: string;
  capsuleName?: string;
  capsuleNameLocalized?: { strDB?: StrDbEntry[] };
  clientControls?: ClientControl[];
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

/** Find the Line Text control's current value — also a contract check. */
function findDefaultText(definition: DefinitionJson): string {
  for (const control of definition.clientControls ?? []) {
    const names = (control.uiName?.strDB ?? []).map((s) => s.str);
    if (names.includes(LINE_TEXT)) {
      const value = (control.value?.strDB ?? [])[0]?.str;
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

/**
 * Produce a patched .mogrt (as zip bytes) whose caption text is `text`.
 * `label` becomes the capsule name shown in Premiere's project panel.
 */
export function patchTemplateText(
  template: MogrtTemplate,
  text: string,
  label: string
): Uint8Array {
  let definition = decodeJson(template.entries[DEFINITION]);
  definition = replaceEverywhere(definition, template.defaultText, text) as DefinitionJson;
  definition.capsuleID = crypto.randomUUID();
  definition.capsuleName = label;
  for (const entry of definition.capsuleNameLocalized?.strDB ?? []) {
    entry.str = label;
  }

  const entries: Record<string, Uint8Array> = { ...template.entries };
  entries[DEFINITION] = strToU8(JSON.stringify(definition));
  return zipSync(entries, { level: 6 });
}
