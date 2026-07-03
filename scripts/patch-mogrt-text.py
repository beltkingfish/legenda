#!/usr/bin/env python3
"""Patch the Line Text default inside a Legenda .mogrt (reference implementation).

This is the verified recipe from the step-6 investigation (2026-07-02), kept as
executable documentation for the step-7 renderer's TypeScript port:

  - A .mogrt is a zip; the render-driving text default lives in definition.json
    in THREE string fields: clientControls[].value.strDB[].str plus
    sourceInfoLocalized.<locale>.capsuleparams.capParams[] capPropDefault and
    textEditValue. Patching all string fields via a tree walk covers every
    locale and both structures.
  - Each patched variant needs a fresh capsuleID (and ideally a distinct
    capsuleName) so Premiere treats it as a distinct template.
  - The embedded AE project (project.aegraphic) does NOT need touching —
    confirmed live: a JSON-only patch changes the render.

Usage:
  scripts/patch-mogrt-text.py SRC.mogrt OUT.mogrt "New caption text" [--name LABEL]
"""

import argparse
import io
import json
import sys
import uuid
import zipfile

OLD_TEXT_FIELDS = ("capPropDefault", "textEditValue")  # documented for the port


def patch_definition(data: bytes, new_text: str, label: str | None) -> bytes:
    d = json.loads(data)
    d["capsuleID"] = str(uuid.uuid4())
    if label:
        d["capsuleName"] = label
        for s in d.get("capsuleNameLocalized", {}).get("strDB", []):
            s["str"] = label

    # Find the current text default (the Line Text control's value), then
    # replace every string field equal to it anywhere in the tree.
    old = None
    for control in d.get("clientControls", []):
        names = [s.get("str") for s in control.get("uiName", {}).get("strDB", [])]
        if "Line Text" in names:
            for s in control.get("value", {}).get("strDB", []):
                old = s.get("str")
    if not old:
        sys.exit("could not locate the Line Text control's current value")

    replaced = 0

    def walk(obj):
        nonlocal replaced
        if isinstance(obj, dict):
            return {k: walk(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [walk(v) for v in obj]
        if isinstance(obj, str) and obj == old:
            replaced += 1
            return new_text
        return obj

    d = walk(d)

    # The single style run must span the new text, or characters beyond the
    # authored length render with fallback styling (found live 2026-07-03).
    for info in d.get("sourceInfoLocalized", {}).values():
        for p in info.get("capsuleparams", {}).get("capParams", []):
            if isinstance(p.get("fontTextRunLength"), list):
                p["fontTextRunLength"] = [len(new_text)]

    print(f"replaced {replaced} field(s) holding {old!r}")
    return json.dumps(d, ensure_ascii=False).encode("utf-8")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("text")
    ap.add_argument("--name", help="capsule display name for the variant")
    args = ap.parse_args()

    with zipfile.ZipFile(args.src) as zin:
        infos = zin.infolist()
        entries = {i.filename: zin.read(i.filename) for i in infos}

    entries["definition.json"] = patch_definition(
        entries["definition.json"], args.text, args.name
    )

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zout:
        for i in infos:
            zout.writestr(i.filename, entries[i.filename], compress_type=i.compress_type)
    with open(args.out, "wb") as f:
        f.write(buf.getvalue())
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
