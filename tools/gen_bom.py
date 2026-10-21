"""部品リスト（docs/05-parts-list.md の 5.2 と 5.3 の表）を docs/data/bom.yaml から書き直す。

表は 05 の中の印（<!-- bom:items --> と <!-- /bom:items -->、<!-- bom:tools --> と <!-- /bom:tools -->）の間に書く。
印の外の文（単価の前提など）は手で書く。
gen_nav.py は、05 の表がここで作る表と同じかを点検する（E16）。
届く工程が後で足す段階（build.yaml の phase が later）の品は、合計の下に「後で足す分」として数え、
合計から引いた額を「いまの出費」とする。

使い方:
    python tools/gen_bom.py            # 05 の表を書き直す
    python tools/gen_bom.py --check    # 食い違いがあれば終了コード 1
"""

import re
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
BOM = DOCS / "data" / "bom.yaml"
BUILD = DOCS / "data" / "build.yaml"
PARTS_MD = DOCS / "05-parts-list.md"
LATER = "later"  # 後で足す段階の id（build.yaml の phases）


def load():
    bom = yaml.safe_load(BOM.read_text(encoding="utf-8"))
    build = yaml.safe_load(BUILD.read_text(encoding="utf-8"))
    for i in bom["items"]:
        i.setdefault("status", "未手配")
        i.setdefault("note", "")
        i["amount"] = i["qty"] * i["price"]
    for t in bom["tools"]:
        t.setdefault("have", "未確認")
    return bom, build


def yen(v):
    return f"{v:,}"


def render_items(bom, build):
    names = {t["id"]: t["name"] for t in build["tasks"]}
    rows = [
        "| 品 | 数量 | 単価（円） | 金額（円） | 買う所 | 届く工程 | 出典と注記 |",
        "|------|------|------|------|------|------|------|",
    ]
    for i in bom["items"]:
        src = "、".join(i["src"])
        notes = [x for x in (("仮の値" if i.get("tentative") else ""), i["note"]) if x]
        cell = "。".join([x for x in (src, "。".join(notes)) if x]) or "なし"
        rows.append(f"| {i['name']} | {i['qty']} {i['unit']} | {yen(i['price'])} | {yen(i['amount'])} | "
                    f"{i['shop']}（{i['how']}） | {names.get(i['batch'], i['batch'])} | {cell} |")
    total = sum(i["amount"] for i in bom["items"])
    diff = total - bom["meta"]["budget"]
    rows.append(f"| **合計** |  |  | **{yen(total)}** |  |  |  |")
    rows.append(f"| **10 万円との差** |  |  | **{'+' if diff > 0 else ''}{yen(diff)}** |  |  |  |")
    phase = {t["id"]: t.get("phase") for t in build["tasks"]}
    later = sum(i["amount"] for i in bom["items"] if phase.get(i["batch"]) == LATER)
    if later:
        now = total - later
        ndiff = now - bom["meta"]["budget"]
        rows.append(f"| **後で足す分（後で足す段階で届く品）** |  |  | **{yen(later)}** |  |  |  |")
        rows.append(f"| **いまの出費（合計から後で足す分を引く）** |  |  | **{yen(now)}** |  |  |  |")
        rows.append(f"| **いまの出費と 10 万円との差** |  |  | **{'+' if ndiff > 0 else ''}{yen(ndiff)}** |  |  |  |")
    return "\n".join(rows)


def render_tools(bom, build):
    names = {t["id"]: t["name"] for t in build["tasks"]}
    out = []
    for group, title in (("build", "組むときの道具"), ("bake", "焼くときの道具")):
        out += [f"### {title}", "", "| 道具 | 使いどころ | 最初に使う工程 |", "|------|-----------|-----------|"]
        for t in bom["tools"]:
            if t["group"] != group:
                continue
            use = "、".join(names.get(u, u) for u in t["use"]) or "冬"
            out.append(f"| {t['name']} | {t['purpose']} | {use} |")
        out.append("")
    return "\n".join(out).rstrip("\n")


BLOCK = re.compile(r"(<!-- bom:(items|tools)[^>]*-->\n)(.*?)(\n<!-- /bom:\2 -->)", re.S)


def expected(text, bom, build):
    """05 の印の間を、bom.yaml から作った表に置き換えた文を返す。"""
    body = {"items": render_items(bom, build), "tools": render_tools(bom, build)}
    found = set()

    # 印の行と表のあいだに空行を置く（HTML の注釈に続く行は、空行が無いと表にならない）
    def sub(m):
        found.add(m.group(2))
        return m.group(1) + "\n" + body[m.group(2)] + "\n" + m.group(4)

    new = BLOCK.sub(sub, text)
    missing = {"items", "tools"} - found
    return new, missing


def main():
    bom, build = load()
    text = PARTS_MD.read_text(encoding="utf-8")
    new, missing = expected(text, bom, build)
    if missing:
        print(f"05 に印が無い: {', '.join(sorted(missing))}", file=sys.stderr)
        sys.exit(1)
    if "--check" in sys.argv:
        if new != text:
            print("05 の表が bom.yaml と食い違う。python tools/gen_bom.py を実行する。", file=sys.stderr)
            sys.exit(1)
        print("05 の表は bom.yaml と同じ。")
        return
    if new != text:
        with open(PARTS_MD, "w", encoding="utf-8", newline="\n") as f:
            f.write(new)
        print(f"{PARTS_MD.relative_to(ROOT)} の表を書き直した。")
    else:
        print("05 の表は bom.yaml と同じ。")


if __name__ == "__main__":
    main()
