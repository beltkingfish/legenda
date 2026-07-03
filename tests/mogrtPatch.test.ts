// Unit tests for the per-line MOGRT text patcher. The synthetic template
// mirrors the real definition.json structures the recipe touches: the
// clientControls Line Text value AND sourceInfoLocalized capsuleparams
// (capPropDefault/textEditValue) — the two fields the step-6 saga was about.
import assert from "node:assert/strict";
import { test } from "node:test";
import { strFromU8, unzipSync, zipSync } from "fflate";

import { loadTemplate, patchTemplateText } from "../src/mogrtPatch";

const DEFAULT_TEXT = "Line text goes here";

function makeDefinition(): object {
  return {
    capsuleID: "cf38bb48-f937-449a-9c21-282f76b68d12",
    capsuleName: "Legenda Fade v1",
    capsuleNameLocalized: { strDB: [{ localeString: "en_US", str: "Legenda Fade v1" }] },
    clientControls: [
      {
        uiName: { strDB: [{ localeString: "en_US", str: "Line Text" }] },
        value: { strDB: [{ localeString: "en_US", str: DEFAULT_TEXT }] },
      },
      {
        uiName: { strDB: [{ localeString: "en_US", str: "Text Color" }] },
        value: { color: [1, 1, 1, 1] },
      },
    ],
    sourceInfoLocalized: {
      en_US: {
        capsuleparams: {
          capParams: [
            { capPropDefault: DEFAULT_TEXT, textEditValue: DEFAULT_TEXT, type: 6 },
            { capPropDefault: 60, type: 4 },
          ],
        },
      },
    },
  };
}

function makeMogrt(definition: object = makeDefinition()): Uint8Array {
  return zipSync({
    "definition.json": new TextEncoder().encode(JSON.stringify(definition)),
    "project.aegraphic": new Uint8Array([1, 2, 3, 4, 5]),
    "thumb.png": new Uint8Array([9, 8, 7]),
  });
}

test("loadTemplate finds the Line Text default", () => {
  const template = loadTemplate(makeMogrt());
  assert.equal(template.defaultText, DEFAULT_TEXT);
});

test("loadTemplate rejects a template without a Line Text control", () => {
  const definition = makeDefinition() as { clientControls: unknown[] };
  definition.clientControls = [];
  assert.throws(() => loadTemplate(makeMogrt(definition)), /Line Text/);
});

test("loadTemplate rejects a zip without definition.json", () => {
  const zip = zipSync({ "other.txt": new Uint8Array([1]) });
  assert.throws(() => loadTemplate(zip), /definition\.json/);
});

function patchAndParse(text: string, label = "Legenda 001") {
  const template = loadTemplate(makeMogrt());
  const patched = patchTemplateText(template, text, label);
  const entries = unzipSync(patched);
  return {
    entries,
    definition: JSON.parse(strFromU8(entries["definition.json"])) as ReturnType<
      typeof makeDefinition
    > & {
      capsuleID: string;
      capsuleName: string;
      clientControls: { value?: { strDB?: { str: string }[] } }[];
      sourceInfoLocalized: {
        en_US: { capsuleparams: { capParams: { capPropDefault?: unknown; textEditValue?: unknown }[] } };
      };
    },
  };
}

test("patches all three text fields", () => {
  const { definition } = patchAndParse("Hello world");
  assert.equal(definition.clientControls[0].value?.strDB?.[0].str, "Hello world");
  const param = definition.sourceInfoLocalized.en_US.capsuleparams.capParams[0];
  assert.equal(param.capPropDefault, "Hello world");
  assert.equal(param.textEditValue, "Hello world");
});

test("leaves non-text fields and other entries untouched", () => {
  const { definition, entries } = patchAndParse("Hello world");
  const numericParam = definition.sourceInfoLocalized.en_US.capsuleparams.capParams[1];
  assert.equal(numericParam.capPropDefault, 60);
  assert.deepEqual([...entries["project.aegraphic"]], [1, 2, 3, 4, 5]);
  assert.deepEqual([...entries["thumb.png"]], [9, 8, 7]);
});

test("assigns a fresh capsuleID and the given label", () => {
  const { definition } = patchAndParse("Hello", "Legenda 042");
  assert.notEqual(definition.capsuleID, "cf38bb48-f937-449a-9c21-282f76b68d12");
  assert.match(definition.capsuleID, /^[0-9a-f-]{36}$/);
  assert.equal(definition.capsuleName, "Legenda 042");
});

test("two patches from one template get distinct capsuleIDs", () => {
  const template = loadTemplate(makeMogrt());
  const a = unzipSync(patchTemplateText(template, "A", "L1"));
  const b = unzipSync(patchTemplateText(template, "B", "L2"));
  const idA = (JSON.parse(strFromU8(a["definition.json"])) as { capsuleID: string }).capsuleID;
  const idB = (JSON.parse(strFromU8(b["definition.json"])) as { capsuleID: string }).capsuleID;
  assert.notEqual(idA, idB);
});

test("patching does not mutate the loaded template", () => {
  const template = loadTemplate(makeMogrt());
  patchTemplateText(template, "Mutation check", "L1");
  const definition = JSON.parse(strFromU8(template.entries["definition.json"])) as {
    clientControls: { value?: { strDB?: { str: string }[] } }[];
  };
  assert.equal(definition.clientControls[0].value?.strDB?.[0].str, DEFAULT_TEXT);
  assert.equal(template.defaultText, DEFAULT_TEXT);
});
