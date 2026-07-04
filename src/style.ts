// Style model (SPECIFICATION §2/§5/§6): StyleDef mirrors the shape of
// presets/style-presets.json — presets and custom styles are the same data.
// Styles are applied at PATCH time (ARCHITECTURE §3/§6): every property maps
// to definition.json fields, so "Apply to all" = regenerate.

import presetsJson from "../presets/style-presets.json";

export interface StyleDef {
  typography: {
    fontFamily: string;
    fontWeight: string;
    fontSize: number; // 1080-referenced design units (presets schema note)
    lineHeight: number; // template v2 — carried, not yet renderable
    letterSpacing: number; // template v2 — carried, not yet renderable
    alignment: string; // template v2 — carried, not yet renderable
  };
  textColor: string; // #RRGGBB
  background: {
    enabled: boolean;
    color: string;
    opacity: number; // 0–1 (presets schema)
    cornerRadius: number; // baked into the template (template v2)
    paddingX: number;
    paddingY: number;
  };
  outline: { enabled: boolean; width: number; color: string }; // template v2
  dropShadow: {
    enabled: boolean;
    color: string; // baked into the template for now
    opacity: number; // 0–1
    blur: number;
    distance: number;
  };
}

export type PresetId = "clean" | "bold" | "minimal";

const presets = presetsJson.presets as unknown as (StyleDef & {
  id: PresetId;
  name: string;
  description?: string;
})[];

export function presetIds(): { id: PresetId; name: string }[] {
  return presets.map((p) => ({ id: p.id, name: p.name }));
}

/**
 * Deep-cloned preset — safe to mutate as the working style. Catalog metadata
 * (id/name/description) is stripped: the working style is a pure StyleDef,
 * so it can't leak another style's description into saves/exports (found in
 * a live-exported file, 2026-07-03).
 */
export function getPreset(id: PresetId): StyleDef {
  const preset = presets.find((p) => p.id === id);
  if (!preset) {
    throw new Error(`Unknown preset "${id}"`);
  }
  const clone = JSON.parse(JSON.stringify(preset)) as Partial<(typeof presets)[number]>;
  delete clone.id;
  delete clone.name;
  delete clone.description;
  return clone as StyleDef;
}

export type Rgba = [number, number, number, number];

/** "#RRGGBB" (leading # optional) → 0–1 float RGBA (the template's format). */
export function hexToRgba(hex: string, alpha = 1): Rgba {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) {
    throw new Error(`Not a #RRGGBB color: "${hex}"`);
  }
  const n = Number.parseInt(match[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, alpha];
}

export function isValidHexColor(hex: string): boolean {
  return /^#?[0-9a-fA-F]{6}$/.test(hex.trim());
}

/**
 * PostScript-style font name the template's fonteditinfo expects,
 * e.g. ("Montserrat", "ExtraBold") → "Montserrat-ExtraBold".
 */
export function toFontName(family: string, weight: string): string {
  const cleanFamily = family.trim().replace(/\s+/g, "");
  const cleanWeight = weight.trim().replace(/\s+/g, "");
  return cleanWeight ? `${cleanFamily}-${cleanWeight}` : cleanFamily;
}

/**
 * One per-text-run styling span (the patch channel's unit of per-word
 * emphasis — docs/MOGRT_SPEC.md "Per-text-run styling"). Runs partition the
 * caption text: lengths must sum exactly to the text length.
 */
export interface StyleRun {
  /** Characters covered, including the space after the run's last word. */
  length: number;
  italic: boolean;
}

/**
 * One per-word color range (template v2 emphasis slots — MOGRT_SPEC "Fade v2
 * exposures"). Character indices into the line text: 0-based start,
 * exclusive end. The template exposes TWO slots; the renderer takes the
 * first two ranges and reports any overflow.
 */
export interface EmphasisSlot {
  startChar: number;
  endChar: number;
  /** #RRGGBB */
  color: string;
}

/** The template-unit values the patcher writes (docs/MOGRT_SPEC.md). */
export interface TemplateStyleValues {
  fontName: string;
  fontSize: number; // template px (design units × designScale)
  textColor: Rgba;
  backgroundEnabled: boolean;
  backgroundColor: Rgba;
  backgroundOpacity: number; // 0–100; 0 when disabled (spec: 0 ⇒ off)
  shadowOpacity: number; // 0–100; 0 when disabled
  outlineWidth: number; // template px; 0 when disabled (spec: 0 ⇒ off)
  outlineColor: Rgba;
  /** Faux italic (fonteditinfo fontFSItalicValue) — per-line override channel. */
  italic?: boolean;
}

/** Merge a per-line override into base template values (renderer path). */
export function applyOverrideToValues(
  base: TemplateStyleValues,
  override: { color?: string; italic?: boolean } | undefined
): TemplateStyleValues {
  if (!override) {
    return base;
  }
  return {
    ...base,
    ...(override.color !== undefined ? { textColor: hexToRgba(override.color) } : {}),
    ...(override.italic !== undefined ? { italic: override.italic } : {}),
  };
}

/**
 * Map a StyleDef to template units. `designScale` converts 1080-referenced
 * sizes to the template comp (UHD template ⇒ 2160/1080 = 2).
 */
export function styleToTemplateValues(
  style: StyleDef,
  designScale: number
): TemplateStyleValues {
  return {
    fontName: toFontName(style.typography.fontFamily, style.typography.fontWeight),
    fontSize: Math.round(style.typography.fontSize * designScale),
    textColor: hexToRgba(style.textColor),
    backgroundEnabled: style.background.enabled,
    backgroundColor: hexToRgba(style.background.color),
    backgroundOpacity: style.background.enabled
      ? Math.round(style.background.opacity * 100)
      : 0,
    shadowOpacity: style.dropShadow.enabled
      ? Math.round(style.dropShadow.opacity * 100)
      : 0,
    outlineWidth: style.outline.enabled
      ? Math.round(style.outline.width * designScale)
      : 0,
    outlineColor: hexToRgba(style.outline.color),
  };
}
