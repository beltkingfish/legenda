// Style model tests: hex conversion, font naming, and the StyleDef →
// template-unit mapping for all three shipped presets.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  getPreset,
  hexToRgba,
  isValidHexColor,
  styleToTemplateValues,
  toFontName,
} from "../src/style";

test("hexToRgba converts to 0–1 floats", () => {
  assert.deepEqual(hexToRgba("#FFFFFF"), [1, 1, 1, 1]);
  assert.deepEqual(hexToRgba("000000"), [0, 0, 0, 1]);
  const [r, g, b, a] = hexToRgba("#FFE94A");
  assert.equal(r, 1);
  assert.ok(Math.abs(g - 0x0e9 / 255) < 1e-9);
  assert.ok(Math.abs(b - 0x4a / 255) < 1e-9);
  assert.equal(a, 1);
});

test("hexToRgba rejects malformed input", () => {
  assert.throws(() => hexToRgba("#FFF"));
  assert.throws(() => hexToRgba("red"));
  assert.equal(isValidHexColor("#12ab34"), true);
  assert.equal(isValidHexColor("#12ab3"), false);
});

test("toFontName builds PostScript-style names", () => {
  assert.equal(toFontName("Montserrat", "ExtraBold"), "Montserrat-ExtraBold");
  assert.equal(toFontName("Source Sans Pro", "Semi Bold"), "SourceSansPro-SemiBold");
});

test("Clean preset maps to template units at UHD scale", () => {
  const v = styleToTemplateValues(getPreset("clean"), 2);
  assert.equal(v.fontName, "Montserrat-Bold");
  assert.equal(v.fontSize, 96); // 48 × 2
  assert.deepEqual(v.textColor, [1, 1, 1, 1]);
  assert.equal(v.backgroundEnabled, true);
  assert.equal(v.backgroundOpacity, 60);
  assert.equal(v.shadowOpacity, 0); // Clean has no shadow
  assert.equal(v.outlineWidth, 0); // Clean has no outline (spec: 0 means off)
});

test("Bold preset maps accent color, weight, and shadow", () => {
  const v = styleToTemplateValues(getPreset("bold"), 2);
  assert.equal(v.fontName, "Montserrat-ExtraBold");
  assert.equal(v.fontSize, 120); // 60 × 2
  assert.equal(v.backgroundOpacity, 85);
  assert.equal(v.shadowOpacity, 60);
});

test("Minimal preset: disabled background ⇒ opacity 0 (spec: 0 means off)", () => {
  const v = styleToTemplateValues(getPreset("minimal"), 2);
  assert.equal(v.backgroundEnabled, false);
  assert.equal(v.backgroundOpacity, 0);
  assert.equal(v.shadowOpacity, 55);
  assert.equal(v.outlineWidth, 4); // 2 × designScale — Minimal's outline is live
  assert.deepEqual(v.outlineColor, [0, 0, 0, 1]);
});

test("presets are deep-cloned — mutating one does not leak", () => {
  const a = getPreset("clean");
  a.textColor = "#123456";
  assert.equal(getPreset("clean").textColor, "#FFFFFF");
});
