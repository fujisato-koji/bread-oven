# ナビゲータの決まりごと

`docs/navigator/` は、設計の中身を 5 つのモード（要求、フロー、系統図、図面、3D）で見るための 1 枚の HTML である。
LC-Core のナビゲータと同じ骨格にしている。

## データ

正は次の 4 つで、`tools/gen_nav.py` が点検してから `docs/navigator/nav.json` を作る。
`nav.json` は生成物なのでリポジトリに入れない。

| 正 | 中身 |
|----|------|
| `docs/data/model.yaml` | 部品、系統図の要素と流れ、焚き方の工程と矢印、要求の割り当て |
| `docs/01-requirements.md` | 1.2 の要求の表と、設計点の根拠の読み方 |
| `docs/data/oven.json` | 寸法（3D の図と図面が読む） |
| `docs/sources.md` | 出典の表 |

```bash
python tools/gen_nav.py          # 点検して nav.json を書く
python tools/gen_nav.py --check  # 点検だけ
```

点検で落ちるもの（E 番号）は、id の重複、3D の部品と model.yaml の部品の食い違い、寸法の鍵の参照切れ、系統図の流れの端や媒体の参照切れ、工程の位置の重なり、矢印の端の参照切れ、要求の割り当ての参照切れと抜け、出典の参照切れである。

## 共通の鍵

部品の id（`hearth`、`door` など）が、全モードを串刺しにする鍵である。
3D の図（`docs/viewer/main.js` の `PARTS`）、図面の SVG の `data-part`、系統図の要素、工程の `parts`、要求の割り当ての `parts` が、同じ id を使う。

## 外枠（app.js）

- モードは `NavApp.register(名前, 作る関数)` で登録する。作る関数は `api` を受け取り、次を持つ物を返す。起動に失敗したモードはタブを隠し、ほかは動かす。
  - `enter(params)`：モードに入るとき。`params` は URL の引数（モード独自の鍵を含む）。
  - `leave()`：ほかのモードへ移るとき。
  - `params()`：URL に載せるモード独自の引数（例 `{ v: 'bake' }`）。
  - `highlight(sel, opts)`：選択が変わったとき。`api.related(sel)` で関係する部品、工程、要求、流れの集合が得られる。`opts.reveal` が真なら、選んだものが見えるように寄せる。
  - `escape()`：Esc を押したとき。処理したら真を返す。
  - `theme()`：明暗を切り替えたとき（任意）。
- 選択は `api.select(種類, id, opts)`。種類は `part`、`node`、`req`、`step`、`flow`。流れの id は `見方の id:番号`。
- モードの移動は `api.goto(モード, params)`。
- URL は `#/?m=モード&k=種類&i=id` に、モード独自の引数を足した形。
- 右の札（選んだものの中身と、ほかのモードへの行き先）は外枠が描く。各モードは描かない。
- 図の拡大縮小は `api.panZoom(svg, stage, [x, y, w, h])`。戻り値の `reveal(x, y, w, h, zoom)` で寄せる。
- 図の中の要素には `data-part`、`data-step`、`data-flow` を付け、クリックで `api.select` を呼ぶ。光らせるときは `hl`（線）と `hlfill`（塗り）の class、関係しないものは `dim` を付ける（navigator.css）。
- 色は navigator.css の `:root` の変数だけを使う。モード独自の CSS は、そのモードの JS が `#mode-名前` で始まる規則を `<style>` に入れる。

## モード

| モード | ファイル | 中身 |
|--------|---------|------|
| 要求 | `req.js` | 要求の木（上位と下位）と、要求と部品と工程の追跡の表 |
| フロー | `flow.js` | 焚き方と焼き方の流れ図。窯と生地の 2 つのレーン |
| 系統図 | `sys.js` | 熱、煙、蒸気の流れ。見方は焼いている間、焚く間、蒸気の通り道 |
| 図面 | `dwg.js` | 平面図、正面図、断面図。寸法は oven.json から描く |
| 3D | `v3d.js` | `docs/viewer/` を iframe で開き、postMessage で部品を光らせる |

3D とのやり取りは同じ生成元に限り、次の伝言を使う。

| 向き | 伝言 |
|------|------|
| ナビゲータから 3D | `{ type: 'v3d:focus', parts: [部品の id] }`（空なら光らせない） |
| 3D からナビゲータ | `{ type: 'v3d:ready' }`、`{ type: 'v3d:pick', part: 部品の id }` |
