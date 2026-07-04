// Custom-styles unit tests: identity slugging, upsert/remove, and the
// tolerant file parse (one bad entry must never lose the collection).
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CUSTOM_STYLES_VERSION,
  exportStyleFile,
  makeCustomStyle,
  parseCustomStylesFile,
  removeCustomStyle,
  serializeCustomStyles,
  styleIdFromName,
  upsertCustomStyle,
  type CustomStyle,
} from "../src/customStyles";
import { getPreset } from "../src/style";

test("styleIdFromName slugs case, spaces, and punctuation", () => {
  assert.equal(styleIdFromName("My Style!"), "my-style");
  assert.equal(styleIdFromName("  Interview — Warm  "), "interview-warm");
  assert.equal(styleIdFromName("UPPER lower 123"), "upper-lower-123");
});

test("upsert adds a new style with a deep-cloned definition", () => {
  const working = getPreset("clean");
  const { styles, saved, updated } = upsertCustomStyle([], "Docu Look", working);
  assert.equal(updated, false);
  assert.equal(styles.length, 1);
  assert.equal(saved.id, "docu-look");
  assert.equal(saved.name, "Docu Look");
  // Deep clone: mutating the working style must not touch the saved entry.
  working.textColor = "#123456";
  assert.notEqual(styles[0].textColor, "#123456");
});

test("upsert under an existing name updates in place (identity = slug)", () => {
  const first = upsertCustomStyle([], "Docu Look", getPreset("clean")).styles;
  const boldDef = getPreset("bold");
  const { styles, updated, saved } = upsertCustomStyle(first, "docu   LOOK!", boldDef);
  assert.equal(updated, true);
  assert.equal(styles.length, 1);
  assert.equal(styles[0].textColor, boldDef.textColor);
  assert.equal(saved.name, "docu   LOOK!"); // latest spelling wins
});

test("upsert rejects empty and slug-empty names", () => {
  assert.throws(() => upsertCustomStyle([], "   ", getPreset("clean")), /needs a name/);
  assert.throws(() => upsertCustomStyle([], "!!!", getPreset("clean")), /needs a name/);
});

test("removeCustomStyle drops exactly the given id", () => {
  let styles = upsertCustomStyle([], "One", getPreset("clean")).styles;
  styles = upsertCustomStyle(styles, "Two", getPreset("bold")).styles;
  const after = removeCustomStyle(styles, "one");
  assert.deepEqual(after.map((s) => s.id), ["two"]);
});

test("serialize/parse round-trips the collection with the version field", () => {
  let styles = upsertCustomStyle([], "One", getPreset("clean")).styles;
  styles = upsertCustomStyle(styles, "Two", getPreset("minimal")).styles;
  const json = serializeCustomStyles(styles);
  assert.equal((JSON.parse(json) as { version: number }).version, CUSTOM_STYLES_VERSION);
  const { styles: parsed, skipped } = parseCustomStylesFile(json);
  assert.equal(skipped, 0);
  assert.deepEqual(parsed, styles);
});

test("parse skips malformed entries but keeps the rest", () => {
  const good = upsertCustomStyle([], "Keeper", getPreset("clean")).styles[0];
  const json = JSON.stringify({
    version: 1,
    styles: [good, { name: "no body" }, 42, null],
  });
  const { styles, skipped } = parseCustomStylesFile(json);
  assert.equal(styles.length, 1);
  assert.equal(styles[0].name, "Keeper");
  assert.equal(skipped, 3);
});

test("parse refills a missing id from the name", () => {
  const entry = { ...upsertCustomStyle([], "Named", getPreset("clean")).styles[0] } as
    Partial<CustomStyle>;
  delete entry.id;
  const { styles } = parseCustomStylesFile(JSON.stringify({ version: 1, styles: [entry] }));
  assert.equal(styles[0].id, "named");
});

test("parse of a shapeless document yields an empty collection", () => {
  assert.deepEqual(parseCustomStylesFile("{}"), { styles: [], skipped: 0 });
  assert.deepEqual(parseCustomStylesFile("[1,2]"), { styles: [], skipped: 0 });
});

test("parse throws on unreadable JSON (caller starts empty, loudly)", () => {
  assert.throws(() => parseCustomStylesFile("not json {"));
});

test("saves and exports carry no catalog metadata from presets", () => {
  // getPreset must return a pure StyleDef (no id/name/description)…
  const working = getPreset("minimal") as Record<string, unknown>;
  assert.equal(working.id, undefined);
  assert.equal(working.name, undefined);
  assert.equal(working.description, undefined);
  // …and makeCustomStyle strips leftovers from styles saved before the fix
  // (found live 2026-07-03: an exported style carried Minimal's description).
  const legacy = { ...getPreset("minimal"), description: "stale preset text" };
  const saved = makeCustomStyle("Clean Export", legacy) as Record<string, unknown>;
  assert.equal(saved.description, undefined);
  assert.equal(saved.name, "Clean Export");
});

test("an exported style file imports back as the same entry (§10 round trip)", () => {
  const json = exportStyleFile("Shared Look", getPreset("bold"));
  const { styles, skipped } = parseCustomStylesFile(json);
  assert.equal(skipped, 0);
  assert.deepEqual(styles, [makeCustomStyle("Shared Look", getPreset("bold"))]);
});

test("an exported file merges into a collection with save semantics", () => {
  const existing = upsertCustomStyle([], "Shared Look", getPreset("clean")).styles;
  const { styles: incoming } = parseCustomStylesFile(
    exportStyleFile("shared look", getPreset("minimal"))
  );
  const merged = upsertCustomStyle(existing, incoming[0].name, incoming[0]).styles;
  assert.equal(merged.length, 1); // same slug → updated, not duplicated
  assert.equal(merged[0].textColor, getPreset("minimal").textColor);
});
