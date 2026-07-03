// Unit tests for the per-line MOGRT patcher. The synthetic template mirrors
// the REAL definition.json structure (dumped from the shipped template):
// clientControls with type-dependent value shapes + fonteditinfo, and
// capsuleparams.capParams linked by capPropMatchName, with per-text-run
// arrays for font values.
import assert from "node:assert/strict";
import { test } from "node:test";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import { loadTemplate, patchTemplate } from "../src/mogrtPatch";
import type { TemplateStyleValues } from "../src/style";

const DEFAULT_TEXT = "Line text goes here";

function makeDefinition() {
  return {
    capsuleID: "cf38bb48-f937-449a-9c21-282f76b68d12",
    capsuleName: "Legenda Fade v1",
    capsuleNameLocalized: { strDB: [{ localeString: "en_US", str: "Legenda Fade v1" }] },
    clientControls: [
      {
        id: "id-text",
        uiName: { strDB: [{ localeString: "en_US", str: "Line Text" }] },
        value: { strDB: [{ localeString: "en_US", str: DEFAULT_TEXT }] },
        fonteditinfo: {
          capPropFontEdit: true,
          capPropFontFauxStyleEdit: false,
          fontEditValue: "Montserrat-Bold",
          fontSizeEditValue: 96,
          fontFSItalicValue: false,
        },
        // (real template also carries fontFSItalicValue in the capParam —
        // added below)
      },
      { id: "id-tc", uiName: { strDB: [{ str: "Text Color" }] }, value: [1, 1, 1, 1] },
      { id: "id-bg", uiName: { strDB: [{ str: "Background" }] }, value: true },
      { id: "id-bgc", uiName: { strDB: [{ str: "Background Color" }] }, value: [0, 0, 0, 1] },
      { id: "id-bgo", uiName: { strDB: [{ str: "Background Opacity" }] }, value: 60 },
      { id: "id-so", uiName: { strDB: [{ str: "Shadow Opacity" }] }, value: 0 },
      { id: "id-ver", uiName: { strDB: [{ str: "Legenda Version" }] }, value: 1 },
    ],
    sourceInfoLocalized: {
      en_US: {
        capsuleparams: {
          capParams: [
            {
              capPropMatchName: "id-text",
              capPropUIName: "Line Text",
              capPropDefault: DEFAULT_TEXT,
              textEditValue: DEFAULT_TEXT,
              capPropFontFauxStyleEdit: false,
              capPropTextRunCount: 1,
              fontEditValue: ["Montserrat-Bold"],
              fontSizeEditValue: [96],
              fontFSItalicValue: [false],
              fontFSBoldValue: [false],
              fontFSAllCapsValue: [false],
              fontFSSmallCapsValue: [false],
              fontTextRunLength: [DEFAULT_TEXT.length],
            },
            { capPropMatchName: "id-tc", capPropUIName: "Text Color", capPropDefault: [1, 1, 1, 1] },
            { capPropMatchName: "id-bg", capPropUIName: "Background", capPropDefault: true },
            { capPropMatchName: "id-bgc", capPropUIName: "Background Color", capPropDefault: [0, 0, 0, 1] },
            { capPropMatchName: "id-bgo", capPropUIName: "Background Opacity", capPropDefault: 60 },
            { capPropMatchName: "id-so", capPropUIName: "Shadow Opacity", capPropDefault: 0 },
          ],
        },
      },
    },
  };
}

type Definition = ReturnType<typeof makeDefinition>;

function makeMogrt(definition: object = makeDefinition()): Uint8Array {
  return zipSync({
    "definition.json": strToU8(JSON.stringify(definition)),
    "project.aegraphic": new Uint8Array([1, 2, 3, 4, 5]),
    "thumb.png": new Uint8Array([9, 8, 7]),
  });
}

const TEST_STYLE: TemplateStyleValues = {
  fontName: "Montserrat-ExtraBold",
  fontSize: 120,
  textColor: [1, 0.914, 0.29, 1],
  backgroundEnabled: false,
  backgroundColor: [0.06, 0.06, 0.06, 1],
  backgroundOpacity: 0,
  shadowOpacity: 60,
};

function parseResult(patched: Uint8Array) {
  const entries = unzipSync(patched);
  return {
    entries,
    definition: JSON.parse(strFromU8(entries["definition.json"])) as Definition,
  };
}

test("loadTemplate finds the Line Text default", () => {
  assert.equal(loadTemplate(makeMogrt()).defaultText, DEFAULT_TEXT);
});

test("loadTemplate rejects a template without a Line Text control", () => {
  const definition = makeDefinition() as unknown as { clientControls: unknown[] };
  definition.clientControls = [];
  assert.throws(() => loadTemplate(makeMogrt(definition)), /Line Text/);
});

test("loadTemplate rejects a zip without definition.json", () => {
  assert.throws(() => loadTemplate(zipSync({ "other.txt": new Uint8Array([1]) })), /definition\.json/);
});

test("patches the three text fields", () => {
  const { definition } = parseResult(
    patchTemplate(loadTemplate(makeMogrt()), { text: "Hello world", label: "L1" })
  );
  assert.equal(definition.clientControls[0].value && typeof definition.clientControls[0].value === "object"
    ? (definition.clientControls[0].value as { strDB: { str: string }[] }).strDB[0].str
    : undefined, "Hello world");
  const param = definition.sourceInfoLocalized.en_US.capsuleparams.capParams[0];
  assert.equal(param.capPropDefault, "Hello world");
  assert.equal(param.textEditValue, "Hello world");
});

test("style application writes controls AND capParams", () => {
  const { definition } = parseResult(
    patchTemplate(loadTemplate(makeMogrt()), { text: "Hi", label: "L1", style: TEST_STYLE })
  );
  const controls = definition.clientControls;
  const params = definition.sourceInfoLocalized.en_US.capsuleparams.capParams;

  assert.deepEqual(controls[1].value, [1, 0.914, 0.29, 1]); // Text Color
  assert.deepEqual(params[1].capPropDefault, [1, 0.914, 0.29, 1]);
  assert.equal(controls[2].value, false); // Background checkbox
  assert.equal(params[2].capPropDefault, false);
  assert.deepEqual(controls[3].value, [0.06, 0.06, 0.06, 1]);
  assert.equal(controls[4].value, 0); // Background Opacity
  assert.equal(params[4].capPropDefault, 0);
  assert.equal(controls[5].value, 60); // Shadow Opacity
  assert.equal(params[5].capPropDefault, 60);
});

test("style run length follows the patched text (found live: mixed styling past char 19)", () => {
  const longText = "So from what it was gathered, this is a much longer caption line";
  const { definition } = parseResult(
    patchTemplate(loadTemplate(makeMogrt()), { text: longText, label: "L1" })
  );
  const textParam = definition.sourceInfoLocalized.en_US.capsuleparams.capParams[0];
  assert.deepEqual(textParam.fontTextRunLength, [longText.length]);
});

test("italic override writes the flag AND opens the faux-style gate", () => {
  const { definition } = parseResult(
    patchTemplate(loadTemplate(makeMogrt()), {
      text: "Hi",
      label: "L1",
      style: { ...TEST_STYLE, italic: true },
    })
  );
  const info = definition.clientControls[0].fonteditinfo;
  assert.equal(info?.fontFSItalicValue, true);
  assert.equal(info?.capPropFontFauxStyleEdit, true); // gate opened
  const textParam = definition.sourceInfoLocalized.en_US.capsuleparams.capParams[0];
  assert.deepEqual(textParam.fontFSItalicValue, [true]);
  assert.equal(textParam.capPropFontFauxStyleEdit, true);
});

test("style without italic writes explicit false and leaves the gate authored", () => {
  const { definition } = parseResult(
    patchTemplate(loadTemplate(makeMogrt()), { text: "Hi", label: "L1", style: TEST_STYLE })
  );
  const info = definition.clientControls[0].fonteditinfo;
  assert.equal(info?.fontFSItalicValue, false);
  assert.equal(info?.capPropFontFauxStyleEdit, false); // untouched
  const textParam = definition.sourceInfoLocalized.en_US.capsuleparams.capParams[0];
  assert.deepEqual(textParam.fontFSItalicValue, [false]);
  assert.equal(textParam.capPropFontFauxStyleEdit, false);
});

test("style application writes fonteditinfo and per-run font arrays", () => {
  const { definition } = parseResult(
    patchTemplate(loadTemplate(makeMogrt()), { text: "Hi", label: "L1", style: TEST_STYLE })
  );
  const info = definition.clientControls[0].fonteditinfo;
  assert.equal(info?.fontEditValue, "Montserrat-ExtraBold");
  assert.equal(info?.fontSizeEditValue, 120);
  const textParam = definition.sourceInfoLocalized.en_US.capsuleparams.capParams[0];
  assert.deepEqual(textParam.fontEditValue, ["Montserrat-ExtraBold"]);
  assert.deepEqual(textParam.fontSizeEditValue, [120]);
});

test("multi-run patch writes boundaries, per-run italics, and opens the gate", () => {
  const text = "the quick fox"; // runs: "the " | "quick " | "fox"
  const { definition } = parseResult(
    patchTemplate(loadTemplate(makeMogrt()), {
      text,
      label: "L1",
      style: TEST_STYLE,
      runs: [
        { length: 4, italic: false },
        { length: 6, italic: true },
        { length: 3, italic: false },
      ],
    })
  );
  const param = definition.sourceInfoLocalized.en_US.capsuleparams.capParams[0];
  assert.equal(param.capPropTextRunCount, 3);
  assert.deepEqual(param.fontTextRunLength, [4, 6, 3]);
  assert.deepEqual(param.fontFSItalicValue, [false, true, false]);
  // Carry arrays expand to the run count with the style-written value.
  assert.deepEqual(param.fontEditValue, [
    "Montserrat-ExtraBold",
    "Montserrat-ExtraBold",
    "Montserrat-ExtraBold",
  ]);
  assert.deepEqual(param.fontSizeEditValue, [120, 120, 120]);
  assert.deepEqual(param.fontFSBoldValue, [false, false, false]);
  assert.equal(param.capPropFontFauxStyleEdit, true); // gate opened
  const info = definition.clientControls[0].fonteditinfo;
  assert.equal(info?.capPropFontFauxStyleEdit, true);
  // Mixed runs → the whole-text scalar is NOT italic.
  assert.equal(info?.fontFSItalicValue, false);
});

test("uniformly italic runs set the whole-text scalar too", () => {
  const { definition } = parseResult(
    patchTemplate(loadTemplate(makeMogrt()), {
      text: "Hi yo",
      label: "L1",
      runs: [
        { length: 3, italic: true },
        { length: 2, italic: true },
      ],
    })
  );
  assert.equal(definition.clientControls[0].fonteditinfo?.fontFSItalicValue, true);
  const param = definition.sourceInfoLocalized.en_US.capsuleparams.capParams[0];
  assert.deepEqual(param.fontFSItalicValue, [true, true]);
});

test("runs without style expand the authored carry values", () => {
  const { definition } = parseResult(
    patchTemplate(loadTemplate(makeMogrt()), {
      text: "Hi yo",
      label: "L1",
      runs: [
        { length: 3, italic: false },
        { length: 2, italic: true },
      ],
    })
  );
  const param = definition.sourceInfoLocalized.en_US.capsuleparams.capParams[0];
  assert.deepEqual(param.fontEditValue, ["Montserrat-Bold", "Montserrat-Bold"]);
  assert.deepEqual(param.fontSizeEditValue, [96, 96]);
});

test("runs that do not span the text exactly are rejected", () => {
  assert.throws(
    () =>
      patchTemplate(loadTemplate(makeMogrt()), {
        text: "Hello world",
        label: "L1",
        runs: [{ length: 5, italic: true }],
      }),
    /span the caption text exactly/
  );
});

test("without style, authored defaults stay untouched", () => {
  const { definition } = parseResult(
    patchTemplate(loadTemplate(makeMogrt()), { text: "Hi", label: "L1" })
  );
  assert.deepEqual(definition.clientControls[1].value, [1, 1, 1, 1]);
  assert.equal(definition.clientControls[0].fonteditinfo?.fontEditValue, "Montserrat-Bold");
});

test("Legenda Version and non-style entries stay untouched by style", () => {
  const { definition, entries } = parseResult(
    patchTemplate(loadTemplate(makeMogrt()), { text: "Hi", label: "L1", style: TEST_STYLE })
  );
  assert.equal(definition.clientControls[6].value, 1);
  assert.deepEqual([...entries["project.aegraphic"]], [1, 2, 3, 4, 5]);
  assert.deepEqual([...entries["thumb.png"]], [9, 8, 7]);
});

test("assigns a fresh capsuleID and the given label", () => {
  const { definition } = parseResult(
    patchTemplate(loadTemplate(makeMogrt()), { text: "Hi", label: "Legenda 042" })
  );
  assert.notEqual(definition.capsuleID, "cf38bb48-f937-449a-9c21-282f76b68d12");
  assert.match(definition.capsuleID, /^[0-9a-f-]{36}$/);
  assert.equal(definition.capsuleName, "Legenda 042");
});

test("two patches from one template get distinct capsuleIDs", () => {
  const template = loadTemplate(makeMogrt());
  const a = parseResult(patchTemplate(template, { text: "A", label: "L1" }));
  const b = parseResult(patchTemplate(template, { text: "B", label: "L2" }));
  assert.notEqual(a.definition.capsuleID, b.definition.capsuleID);
});

test("patching does not mutate the loaded template", () => {
  const template = loadTemplate(makeMogrt());
  patchTemplate(template, { text: "Mutation check", label: "L1", style: TEST_STYLE });
  const definition = JSON.parse(strFromU8(template.entries["definition.json"])) as Definition;
  assert.deepEqual(definition.clientControls[1].value, [1, 1, 1, 1]);
  assert.equal(definition.clientControls[0].fonteditinfo?.fontEditValue, "Montserrat-Bold");
  assert.equal(template.defaultText, DEFAULT_TEXT);
});
