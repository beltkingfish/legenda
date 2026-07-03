// Custom styles (SPECIFICATION §6): presets and custom styles are the same
// data shape — a saved style is a StyleDef plus id + name, exactly like the
// entries in presets/style-presets.json. The collection persists in the
// plugin data folder as custom-styles.json using the presets schema plus a
// version field — the same shape SPECIFICATION §10's export/import will use.
// Pure logic — storage I/O lives in src/files.ts, wiring in src/main.ts.

import type { StyleDef } from "./style";

export interface CustomStyle extends StyleDef {
  id: string;
  name: string;
}

export const CUSTOM_STYLES_FILE = "custom-styles.json";
export const CUSTOM_STYLES_VERSION = 1;

/**
 * Identity rule: a style's id is its slugified name, so saving under an
 * existing name (case/punctuation-insensitively) UPDATES that style rather
 * than accumulating near-duplicates.
 */
export function styleIdFromName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** A catalog entry from a working StyleDef — deep-cloned, named, slugged. */
export function makeCustomStyle(name: string, style: StyleDef): CustomStyle {
  const trimmed = name.trim();
  const id = styleIdFromName(trimmed);
  if (trimmed === "" || id === "") {
    throw new Error("A custom style needs a name.");
  }
  return {
    ...(JSON.parse(JSON.stringify(style)) as StyleDef),
    id,
    name: trimmed,
  };
}

/**
 * Add or update a style. Returns the new list (input untouched) and whether
 * an existing entry was replaced (drives the "Saved" vs "Updated" copy).
 * The style is deep-cloned so later edits to the working style cannot
 * mutate the saved entry.
 */
export function upsertCustomStyle(
  styles: CustomStyle[],
  name: string,
  style: StyleDef
): { styles: CustomStyle[]; saved: CustomStyle; updated: boolean } {
  const saved = makeCustomStyle(name, style);
  const { id } = saved;
  const index = styles.findIndex((s) => s.id === id);
  if (index >= 0) {
    const next = [...styles];
    next[index] = saved;
    return { styles: next, saved, updated: true };
  }
  return { styles: [...styles, saved], saved, updated: false };
}

export function removeCustomStyle(styles: CustomStyle[], id: string): CustomStyle[] {
  return styles.filter((s) => s.id !== id);
}

/** The on-disk / export shape (presets schema + version). */
export function serializeCustomStyles(styles: CustomStyle[]): string {
  return JSON.stringify({ version: CUSTOM_STYLES_VERSION, styles }, null, 2);
}

/**
 * A shareable single-style file (SPECIFICATION §10) — exactly the
 * custom-styles.json shape with one entry, so import needs no second parser.
 */
export function exportStyleFile(name: string, style: StyleDef): string {
  return serializeCustomStyles([makeCustomStyle(name, style)]);
}

/** Pragmatic shape guard — enough structure for the panel + patcher to use. */
function isCustomStyleLike(value: unknown): value is CustomStyle {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const style = value as Record<string, unknown>;
  const typography = style.typography as Record<string, unknown> | undefined;
  return (
    typeof style.name === "string" &&
    style.name.trim() !== "" &&
    typeof typography === "object" &&
    typography !== null &&
    typeof typography.fontFamily === "string" &&
    typeof typography.fontSize === "number" &&
    typeof style.textColor === "string" &&
    typeof style.background === "object" &&
    style.background !== null &&
    typeof style.dropShadow === "object" &&
    style.dropShadow !== null
  );
}

/**
 * Parse a custom-styles file tolerantly: entries that don't look like a
 * style are skipped and counted (never fail the whole collection over one
 * bad entry); a missing id is refilled from the name. Throws only when the
 * JSON itself is unreadable — the caller decides how loudly to start empty.
 */
export function parseCustomStylesFile(json: string): {
  styles: CustomStyle[];
  skipped: number;
} {
  const parsed: unknown = JSON.parse(json);
  const rawStyles =
    typeof parsed === "object" && parsed !== null
      ? (parsed as { styles?: unknown }).styles
      : undefined;
  if (!Array.isArray(rawStyles)) {
    return { styles: [], skipped: 0 };
  }
  const styles: CustomStyle[] = [];
  let skipped = 0;
  for (const entry of rawStyles) {
    if (isCustomStyleLike(entry)) {
      const id =
        typeof entry.id === "string" && entry.id !== ""
          ? entry.id
          : styleIdFromName(entry.name);
      styles.push({ ...entry, id });
    } else {
      skipped++;
    }
  }
  return { styles, skipped };
}
