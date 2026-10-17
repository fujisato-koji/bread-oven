# パン窯の設計検討

自宅の庭に据えるパン窯を、自分で組むための設計検討。
個人用のリポジトリで、射場の仕事とは関係しない。

設計書は GitHub Pages で読める。
<https://fujisato-koji.github.io/bread-oven/>

## 構成

| 場所 | 中身 |
|------|------|
| `docs/` | 設計書の本文（MkDocs） |
| `docs/data/oven.json` | 寸法の正。3D の図と設計書はここを読む |
| `docs/viewer/` | three.js の 3D の図 |
| `docs/navigator/` | ナビゲータ（要求、フロー、系統図、図面、3D）。決まりごとは `NAVIGATOR.md` |
| `docs/data/model.yaml` | ナビゲータのモデルの正（部品、系統図、工程、要求の割り当て） |
| `tools/gen_nav.py` | ナビゲータのデータを点検して作る。生成物 `docs/navigator/nav.json` はコミットしない |
| `.github/workflows/pages.yml` | main に push すると Pages へ配る |

## 手元で見る

```bash
pip install -r requirements.txt
python tools/gen_nav.py
mkdocs serve
```

## 公開について

このリポジトリと Pages は公開している。
据える地点の地名や住所など、自宅を特定できる情報は書かない。
凍結深度や積雪のような値だけを書き、地点は伏せる。
