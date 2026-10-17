"""ナビゲータのデータを作る。

正は次の 4 つ。
- docs/data/model.yaml（部品、系統図、流れ、要求の割り当て）
- docs/01-requirements.md（1.2 の要求の表と、設計点の根拠の読み方）
- docs/data/oven.json（寸法）
- docs/sources.md（出典の表）

点検に落ちたら何も書かずに終了コード 1 で止まる。
出力 docs/navigator/nav.json は生成物なので、リポジトリには入れない（.gitignore）。

使い方:
    python tools/gen_nav.py            # 点検して書く
    python tools/gen_nav.py --check    # 点検だけ
"""

import json
import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
MODEL = DOCS / "data" / "model.yaml"
OVEN = DOCS / "data" / "oven.json"
REQS_MD = DOCS / "01-requirements.md"
SOURCES_MD = DOCS / "sources.md"
VIEWER_JS = DOCS / "viewer" / "main.js"
OUT = DOCS / "navigator" / "nav.json"

SRC_CODE = re.compile(r"\b([PSMF]\d+[a-z]?)\b")
LINK = re.compile(r"\[([^\]]+)\]\([^)]+\)")


def plain(cell):
    """表のセルから Markdown のリンクを外して文字だけにする。"""
    return LINK.sub(r"\1", cell).strip()


def table_rows(lines):
    for line in lines:
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if all(re.fullmatch(r":?-+:?", c) for c in cells if c):
            continue
        yield cells


def section(text, heading):
    """見出し heading から次の同じ深さ以上の見出しまでの行を返す。"""
    lines = text.splitlines()
    level = len(heading) - len(heading.lstrip("#"))
    out, inside = [], False
    for line in lines:
        if line.strip() == heading.strip():
            inside = True
            continue
        if inside and line.startswith("#"):
            lv = len(line) - len(line.lstrip("#"))
            if lv <= level:
                break
        if inside:
            out.append(line)
    return out


def read_reqs():
    text = REQS_MD.read_text(encoding="utf-8")
    lines = section(text, "## 1.2 要求の一覧")
    reqs = []
    header = None
    for cells in table_rows(lines):
        if header is None:
            header = cells
            continue
        if len(cells) < 6 or not re.fullmatch(r"R-\d+[a-z]?", cells[0]):
            continue
        rid = cells[0]
        m = re.fullmatch(r"(R-\d+)([a-z])", rid)
        reqs.append({
            "id": rid,
            "parent": m.group(1) if m else None,
            "text": plain(cells[1]),
            "origin": plain(cells[2]),
            "point": plain(cells[3]),
            "basis": plain(cells[4]),
            "status": plain(cells[5]),
            "note": "",
        })
    # 設計点の根拠の読み方（- R-xx：本文）
    notes = {}
    for line in section(text, "### 設計点の根拠の読み方"):
        m = re.match(r"- (R-\d+[a-z]?)：(.*)", line.strip())
        if m:
            notes[m.group(1)] = plain(m.group(2))
    for r in reqs:
        r["note"] = notes.get(r["id"], "")
    return reqs


def read_sources():
    text = SOURCES_MD.read_text(encoding="utf-8")
    kinds = {"P": "一次", "S": "二次", "M": "販売", "F": "経験則"}
    out = {}
    for cells in table_rows(text.splitlines()):
        if len(cells) < 3 or not re.fullmatch(r"[PSMF]\d+[a-z]?", cells[0]):
            continue
        url = ""
        m = re.search(r"<(https?://[^>]+)>", cells[-1])
        if m:
            url = m.group(1)
        out[cells[0]] = {"title": plain(cells[1]), "url": url, "kind": kinds[cells[0][0]]}
    return out


def viewer_parts():
    text = VIEWER_JS.read_text(encoding="utf-8")
    return re.findall(r"\{ key: '(\w+)', label:", text)


def check_and_build():
    errors, warnings = [], []
    model = yaml.safe_load(MODEL.read_text(encoding="utf-8"))
    oven = json.loads(OVEN.read_text(encoding="utf-8"))
    reqs = read_reqs()
    sources = read_sources()
    params = oven["params"]

    parts = model["parts"]
    nodes = model["nodes"]
    ids = [p["id"] for p in parts] + [n["id"] for n in nodes]
    seen = set()
    for i in ids:
        if i in seen:
            errors.append(f"E1 id が重複している: {i}")
        seen.add(i)
    part_ids = {p["id"] for p in parts}
    all_ids = set(ids)

    vparts = viewer_parts()
    for k in vparts:
        if k not in part_ids:
            errors.append(f"E2 3D の部品 {k} が model.yaml の parts に無い")
    for k in part_ids:
        if k not in vparts:
            errors.append(f"E2 model.yaml の部品 {k} が 3D の PARTS に無い")

    for p in parts:
        for d in p.get("dims", []):
            if d not in params:
                errors.append(f"E3 部品 {p['id']} の寸法 {d} が oven.json に無い")

    media = model["media"]
    cats = model["categories"]
    for k, m in media.items():
        if m["cat"] not in cats:
            errors.append(f"E4 媒体 {k} の線の種類 {m['cat']} が categories に無い")
    for sh in model["sheets"]:
        pos = sh["pos"]
        for k in pos:
            if k not in all_ids:
                errors.append(f"E5 見方 {sh['id']} の位置に未知の id: {k}")
        for f in sh["flows"]:
            a, b, med = f[0], f[1], f[2]
            for e in (a, b):
                if e not in all_ids:
                    errors.append(f"E5 見方 {sh['id']} の流れの端 {e} が parts と nodes に無い")
                elif e not in pos:
                    errors.append(f"E5 見方 {sh['id']} の流れの端 {e} に位置が無い")
            if med not in media:
                errors.append(f"E5 見方 {sh['id']} の流れ {a}→{b} の媒体 {med} が media に無い")

    req_ids = {r["id"] for r in reqs}
    lanes = {l["id"] for l in model["lanes"]}
    step_ids = set()
    cells = set()
    for s in model["steps"]:
        if s["id"] in step_ids:
            errors.append(f"E6 工程 {s['id']} が重複している")
        step_ids.add(s["id"])
        if s["lane"] not in lanes:
            errors.append(f"E6 工程 {s['id']} のレーン {s['lane']} が無い")
        key = (s["lane"], s["col"], s["row"])
        if key in cells:
            errors.append(f"E6 工程 {s['id']} の位置 {key} が他と重なる")
        cells.add(key)
        for p in s.get("parts", []):
            if p not in part_ids:
                errors.append(f"E6 工程 {s['id']} の部品 {p} が無い")
        for r in s.get("reqs", []):
            if r not in req_ids:
                errors.append(f"E6 工程 {s['id']} の要求 {r} が要求の表に無い")
        for c in s.get("src", []):
            if c not in sources:
                errors.append(f"E10 工程 {s['id']} の出典 {c} が sources.md に無い")
    for e in model["edges"]:
        for x in e[:2]:
            if x not in step_ids:
                errors.append(f"E7 流れの矢印の端 {x} が工程に無い")

    alloc = model["alloc"]
    for rid, a in alloc.items():
        if rid not in req_ids:
            errors.append(f"E8 割り当ての要求 {rid} が要求の表に無い")
        for p in a.get("parts", []):
            if p not in part_ids:
                errors.append(f"E8 要求 {rid} の部品 {p} が無い")
        for s in a.get("steps", []):
            if s not in step_ids:
                errors.append(f"E8 要求 {rid} の工程 {s} が無い")
    for rid in req_ids:
        if rid not in alloc:
            errors.append(f"E9 要求 {rid} の割り当てが model.yaml に無い")

    for r in reqs:
        for c in SRC_CODE.findall(r["basis"] + " " + r["note"]):
            if c not in sources:
                warnings.append(f"W1 要求 {r['id']} の出典 {c} が sources.md に無い")

    out_parts = []
    for p in parts:
        dims = []
        for d in p.get("dims", []):
            if d in params:
                q = params[d]
                dims.append({"key": d, "label": q["label"], "v": q["v"], "unit": q["unit"],
                             "status": q["status"], "basis": q["basis"]})
        out_parts.append({**p, "kind": "part", "dims": dims})
    out_nodes = [{**n, "kind": "node"} for n in nodes]

    data = {
        "meta": {**model["meta"], "oven_revision": oven["revision"], "oven_date": oven["date"]},
        "parts": out_parts,
        "nodes": out_nodes,
        "media": media,
        "categories": cats,
        "sheets": model["sheets"],
        "lanes": model["lanes"],
        "steps": model["steps"],
        "edges": model["edges"],
        "reqs": reqs,
        "alloc": alloc,
        "sources": sources,
    }
    return data, errors, warnings


def main():
    check_only = "--check" in sys.argv
    data, errors, warnings = check_and_build()
    for w in warnings:
        print(w)
    if errors:
        for e in errors:
            print(e, file=sys.stderr)
        print(f"点検で {len(errors)} 件の誤り。何も書かない。", file=sys.stderr)
        sys.exit(1)
    if check_only:
        print("点検に通った。")
        return
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{OUT.relative_to(ROOT)} を書いた（要求 {len(data['reqs'])}、部品 {len(data['parts'])}、工程 {len(data['steps'])}）。")


if __name__ == "__main__":
    main()
