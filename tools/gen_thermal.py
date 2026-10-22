"""焼く日の温度の場（docs/data/thermal.json）を、熱の模型（tools/thermal_model.py）から作る。

ふつうの日と寒い日の 1 日（6:00 に火を付けてから 48 時間）を回し、次を書き出す。

- ドームの壁の厚さの向きの温度（キャスタブル 40 mm と毛布 3 層の 5 mm ごと、内面と外面を含む）。
- 炉床の縦の向きの温度（レンガ 65 mm とパーライトとセメント 75 mm の 5 mm ごと、炉床の面と天板の上の面を含む）。
  パンを置く所と空いた所の 2 つの列がある。
- 焼き室の空気（閉じているときの 1 点の温度）と、内面の面積で均した温度（見かけの温度）。
- 殻の外面（毛布の外面の値。殻の抵抗と空気層を 0 と置いたので上の限り）。
- 前室の箱の天板と袖と内張り（前室の 2 層の模型の定常の値を、焚く段と冷める速さで工程に当てた推定）。
- 炉床の (r, z) の場（2 次元の模型の主な時刻）。

ドームのまわりの向き（方位）と高さ（緯度）では同じ温度と置いている（軸対称）。
焚き口と火の位置の片寄りは入れていない。

書き出す前に、寸法を oven.json と、工程の id を model.yaml と突き合わせる。
模型の値を 03 の 3.2 と 06 の焚き方の表の値と突き合わせ、1 K（時刻は 1 分）を超えて違えば止める。

--check は、thermal.json が書き出す文と同じかを見る。
文が違うときは、温度の並び（鍵 T の下）と突き合わせ（鍵 check の下）の数だけ、丸めの 1 桁（0.1）の違いを許す。
計算機ごとの数の最後の桁の違いで、丸めの境の値が 1 桁動くことがあるためである。
numpy は使わず、requirements.txt の PyYAML だけで動く（2 日分で 20 秒前後）。

使い方:
    python tools/gen_thermal.py            # thermal.json を書き直す
    python tools/gen_thermal.py --check    # 食い違いがあれば終了コード 1
"""

import json
import math
import sys
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent))
import thermal_model as TM  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
OVEN = DOCS / "data" / "oven.json"
MODEL = DOCS / "data" / "model.yaml"
OUT = DOCS / "data" / "thermal.json"

T_END_MIN = 48 * 60  # 冷めるまでを見る長さ（6:00 に火を付けてから）
DT = 4.0
TOL_K = 1.0
TOL_MIN = 1.0

# ---------------------------------------------------------------- 文書の値（突き合わせの基準）

DOC = {
    "normal": [
        ("焚き終わり", "min", 240, "06 の焼く日の時刻表（6:00〜10:00）"),
        ("内面が 380℃に届く（上げるだけの時間 3.7 時間）", "min", 222, "03 の 3.2.3"),
        ("1 回目の窯入れ", "min", 260, "06 の焼く日の時刻表（10:20）"),
        ("1 回目の炉床", "K", 317, "03 の 3.2.4"),
        ("2 回目の窯入れ", "min", 320, "06 の焼く日の時刻表（11:20）"),
        ("2 回目のパンの真下", "K", 270, "03 の 3.2.4"),
        ("焚き直しの始め", "min", 380, "06 の焼く日の時刻表（12:20）"),
        ("焚き直しの終わり", "min", 425, "06 の焼く日の時刻表（13:05）"),
        ("3 回目の窯入れ", "min", 445, "06 の焼く日の時刻表（13:25）"),
        ("3 回目の炉床", "K", 268, "03 の 3.2.4"),
        ("焼き終わり", "min", 505, "06 の焼く日の時刻表（14:25）"),
        ("15 分のドームの最低", "K", 266, "03 の 3.2.4"),
        ("60 分のあいだのドームの最低", "K", 249, "03 の 3.2.4"),
        ("15〜45 分の下がりの最大", "K", 16, "03 の 3.2.4"),
        ("回のあいだの下がり（均し）", "K", 40, "03 の 3.2.4"),
        ("回のあいだの下がり（パンの真下）", "K", 48, "03 の 3.2.4"),
        ("毛布の外面の最大", "K", 22.5, "03 の 3.4"),
        ("炉床の下の面（天板の上面）の最大", "K", 30.8, "03 の 3.4"),
        ("毛布の 1 層目の外（65 mm）の最大", "K", 236, "03 の 3.4 の毛布の層の表"),
        ("毛布の 2 層目の外（90 mm）の最大", "K", 131, "03 の 3.4 の毛布の層の表"),
        ("毛布の 3 層目の外の最大（表の値は最後の格子の中心 112.5 mm）", "K", 34, "03 の 3.4 の毛布の層の表"),
        ("ドームの内面の最大（内の格子の中心 2.5 mm）", "K", 376, "03 の 3.4 の毛布の層の表"),
        ("2 次元：1 回目までの待ち", "min", 22, "03 の 3.2.5（四角、縄）"),
        ("2 次元：2 回目のパンの真下", "K", 270, "03 の 3.2.5（四角、縄）"),
        ("2 次元：3 回目", "K", 266, "03 の 3.2.5（四角、縄）"),
        ("2 次元：1 回目の中央と壁から 5 cm の差", "K", 15, "03 の 3.2.5（四角、縄）"),
        ("2 次元：1 回目の中央と壁から 2.5 cm の差", "K", 29, "03 の 3.2.5（四角、縄）"),
        ("2 次元：2 回目のパンの外の縁（壁から 3.5 cm）", "K", 256, "03 の 3.2.5（四角、縄）。0.25 m と 0.275 m の値から直線で読む"),
    ],
    "cold": [
        ("焚き終わり", "min", 285, "06 の焼く日の時刻表（6:00〜10:45）"),
        ("内面が 380℃に届く（上げるだけの時間 4.3 時間）", "min", 260, "03 の 3.2.3"),
        ("1 回目の窯入れ", "min", 305, "06 の焼く日の時刻表（11:05）"),
        ("1 回目の炉床", "K", 320, "03 の 3.2.4"),
        ("2 回目の窯入れ", "min", 365, "06 の焼く日の時刻表（12:05）"),
        ("2 回目のパンの真下", "K", 264, "03 の 3.2.4"),
        ("焚き直しの始め", "min", 425, "06 の焼く日の時刻表（13:05）"),
        ("焚き直しの終わり", "min", 485, "06 の焼く日の時刻表（14:05）"),
        ("3 回目の窯入れ", "min", 505, "06 の焼く日の時刻表（14:25）"),
        ("3 回目の炉床", "K", 270, "03 の 3.2.4"),
        ("焼き終わり", "min", 565, "06 の焼く日の時刻表（15:25）"),
        ("15 分のドームの最低", "K", 265, "03 の 3.2.4"),
        ("60 分のあいだのドームの最低", "K", 247, "03 の 3.2.4"),
        ("15〜45 分の下がりの最大", "K", 15, "03 の 3.2.4"),
        ("回のあいだの下がり（均し）", "K", 46, "03 の 3.2.4"),
        ("回のあいだの下がり（パンの真下）", "K", 55, "03 の 3.2.4"),
        ("2 次元：1 回目までの待ち", "min", 25, "03 の 3.2.5（四角、縄）"),
        ("2 次元：2 回目のパンの真下", "K", 265, "03 の 3.2.5（四角、縄）"),
        ("2 次元：3 回目", "K", 268, "03 の 3.2.5（四角、縄）"),
        ("2 次元：2 回目のパンの外の縁（壁から 3.5 cm）", "K", 253, "03 の 3.2.5（四角、縄）。0.25 m と 0.275 m の値から直線で読む"),
    ],
}

# 突き合わせるが、違っても止めない値（違う理由を書く）
DOC_REF = {
    "cold": [
        ("毛布の 1 層目の外（65 mm）の最大", 222, "03 の 3.4 の毛布の層の表",
         "表の寒い日の行は、焚く時間を 4.5 時間とした焚き方の値で、その焚き方で回すと 223、113、10、375℃になり、表と 1 K 以内で合う（計算）。時刻表の寒い日は 4.75 時間なので、毛布の層は表より 2〜11 K 高い。"),
        ("毛布の 2 層目の外（90 mm）の最大", 113, "03 の 3.4 の毛布の層の表",
         "表の寒い日の行は、焚く時間を 4.5 時間とした焚き方の値である（計算）。"),
        ("毛布の 3 層目の外の最大（表の値は最後の格子の中心 112.5 mm）", 10, "03 の 3.4 の毛布の層の表",
         "表の寒い日の行は、焚く時間を 4.5 時間とした焚き方の値である（計算）。"),
        ("ドームの内面の最大（内の格子の中心 2.5 mm）", 375, "03 の 3.4 の毛布の層の表",
         "表の寒い日の行は、焚く時間を 4.5 時間とした焚き方の値である（計算）。"),
    ],
}

# ---------------------------------------------------------------- 前室の箱（推定）
# 前室の 2 層の模型の定常の値（F0、煙突と垂れ壁なし）。外気 10℃は 03 の 3.9.8 の表、外気 −10℃は同じ計算の値（文書には載せていない）。
# 段：窯から出るガスが 200℃（焚き始め）、400℃（半ば）、550℃（温めきったあと）。
LANDING_KEYS = ("lining", "top", "side_hot", "side_cold")
LANDING_LABEL = dict(lining="天井の内張りの内の面", top="天板の鋼板", side_hot="袖の上（熱い層）", side_cold="袖の下（冷たい層）")
LANDING_ANCHOR = {
    10.0: ((200.0, (105, 79, 91, 47)), (400.0, (219, 149, 178, 90)), (550.0, (304, 195, 238, 118))),
    -10.0: ((200.0, (96, 68, 82, 29)), (400.0, (212, 140, 171, 75)), (550.0, (298, 187, 232, 104))),
}
GAS_OVER_FACE = 170.0  # 窯から出るガスを、ドームの内面に足して見る差（K、推定）
LANDING_TAU_H = dict(lining=0.8, top=0.8, side_hot=0.1, side_cold=0.1)  # 時定数（時間、推定）

# ---------------------------------------------------------------- 工程（model.yaml の steps の id）

PHASES = [
    ("heat", "焚き始め", ["burn"]),
    ("hold", "温めきる", ["burn", "spread"]),
    ("soak1", "ならし", ["rake", "soak", "measure"]),
    ("bake1", "1 回目の窯入れ", ["load1", "bake1", "rest", "check2"]),
    ("bake2", "2 回目", ["load2"]),
    ("refire", "焚き直し", ["refire"]),
    ("soak2", "ならし（焚き直しのあと）", ["check3"]),
    ("bake3", "3 回目", ["load3"]),
    ("cool", "冷めるまで", ["after", "cover"]),
]


def r1(v):
    """0.1 K に丸める（−0.0 は 0.0 にする）。"""
    if v is None:
        return None
    x = round(v, 1)
    return 0.0 if x == 0 else x


def lerp(x, pts):
    """pts は (x, 値の並び) の昇順。外は端の値。"""
    if x <= pts[0][0]:
        return list(pts[0][1])
    for (x0, v0), (x1, v1) in zip(pts, pts[1:]):
        if x <= x1:
            f = (x - x0) / (x1 - x0)
            return [a + (b - a) * f for a, b in zip(v0, v1)]
    return list(pts[-1][1])


def interp1(x, xs, ys):
    for i in range(len(xs) - 1):
        if xs[i] <= x <= xs[i + 1]:
            return ys[i] + (ys[i + 1] - ys[i]) * (x - xs[i]) / (xs[i + 1] - xs[i])
    raise ValueError(x)


# ---------------------------------------------------------------- 寸法と工程の突き合わせ

def check_inputs():
    errors = []
    oven = json.loads(OVEN.read_text(encoding="utf-8"))["params"]

    def P(k):
        return oven[k]["v"]

    pairs = [("dome.inner_diameter", P("dome.inner_diameter") / 2, TM.R_IN, "ドームの内の半径"),
             ("dome.thickness", P("dome.thickness"), TM.T_CAST, "キャスタブルの厚さ"),
             ("insulation.thickness", P("insulation.thickness"), TM.T_BL, "毛布の厚さ"),
             ("hearth.firebrick", P("hearth.firebrick"), TM.T_BRICK, "炉床のレンガの厚さ"),
             ("hearth.insulation", P("hearth.insulation"), TM.T_PERL, "炉床の下の断熱の厚さ"),
             ("dome.seat", P("dome.seat"), TM.SEAT_R * 0.08, "ドームの足の下の縄の厚さ"),
             ("door.width", P("door.width"), TM.door_for(TM.R_IN)[0], "焚き口の幅"),
             ("door.height", P("door.height"), TM.door_for(TM.R_IN)[1], "焚き口の高さ")]
    for key, v, m, label in pairs:
        if abs(v - m) > 1e-9:
            errors.append(f"T1 {label}：oven.json の {key} から {v} m、模型は {m} m")
    r_eq = math.sqrt(P("hearth.width") * P("hearth.depth") / math.pi)
    if abs(r_eq - TM.R_BRICK) > 0.001:
        errors.append(f"T1 炉床の四角と同じ面積の円の半径：oven.json から {r_eq:.4f} m、模型は {TM.R_BRICK} m（1 mm を超えて違う）")
    model = yaml.safe_load(MODEL.read_text(encoding="utf-8"))
    steps = {s["id"] for s in model["steps"]}
    parts = {p["id"] for p in model["parts"]}
    for pid, _, sids in PHASES:
        for s in sids:
            if s not in steps:
                errors.append(f"T2 工程 {pid} の {s} が model.yaml の steps に無い")
    for p in ("chamber", "insulation", "hearth", "hearthIns", "shell", "landing", "slab"):
        if p not in parts:
            errors.append(f"T2 部品 {p} が model.yaml の parts に無い")
    geo = dict(y_hearth=P("table.top") + P("hearth.insulation") + P("hearth.firebrick"), seat=P("dome.seat"),
               r_eq=r_eq, hearth_w=P("hearth.width"), hearth_d=P("hearth.depth"))
    return errors, geo


# ---------------------------------------------------------------- 1 次元の 1 日

def day_events(st, rec, name):
    d = TM.DAYS[name]
    L = [x["t_s"] / 60 for x in rec["loads"]]
    ev = dict(t380=round((TM.T_TOP - d["cond"]["Ta"]) / d["rate"] * 60, 3), fire_end=rec["t_fire_end"] / 60,
              loads=L, refire=[rec["t_refire_start"] / 60, rec["t_refire_end"] / 60], bake_end=L[2] + 60)
    for k in ("t380", "fire_end", "bake_end"):
        ev[k] = int(round(ev[k]))
    ev["loads"] = [int(round(x)) for x in L]
    ev["refire"] = [int(round(x)) for x in ev["refire"]]
    ev["spread"] = [ev["fire_end"] - 30, ev["fire_end"]]
    ev["door_open"] = [[x + a, x + a + 2] for x in ev["loads"] for a in (0, 45)]
    return ev


def phase_bounds(ev):
    L1, L2, L3 = ev["loads"]
    R0, R1 = ev["refire"]
    b = [0, ev["t380"], ev["fire_end"], L1, L2, R0, R1, L3, ev["bake_end"], T_END_MIN]
    return [(b[i], b[i + 1]) for i in range(len(PHASES))]


def phase_desc(name, ev):
    d = TM.DAYS[name]
    return dict(
        heat=f"内面を 1 時間に {d['rate']:.0f}℃以下で {TM.T_TOP:.0f}℃まで上げる。",
        hold=f"内面を {TM.T_TOP:.0f}℃に保つ。焚く時間の終わりの 30 分（{ev['spread'][0]}〜{ev['spread'][1]} 分）は熾火を炉床全体に広げる。",
        soak1="熾火を掻き出して炉床を掃き、差し込みの扉を閉めて 20 分置く。",
        bake1="2 個を入れ、扉を閉めたまま焼く（入れるときと出すときに 2 分ずつ開ける）。",
        bake2="焚き直さずに 2 個を入れ、扉を閉めたまま焼く。",
        refire=f"2 回目を出したら {d['tref']} 時間焚き直す（1 時間に {d['rate']:.0f}℃以下、{TM.T_TOP:.0f}℃で止める）。",
        soak2="熾火を出し、扉を閉めて 20 分以上置く。",
        bake3="3 回目を入れ、扉を閉めたまま焼く。焼き終わりにドームを下げる段は使わない。",
        cool="扉を閉めたまま冷ます。",
    )


def sample_minutes(ev):
    L1, L2, L3 = ev["loads"]
    R0, R1 = ev["refire"]
    end = ev["bake_end"]
    S = set(range(0, end + 1, 5))
    for L in ev["loads"]:
        S |= set(range(L, L + 21))
        S |= set(range(L + 20, L + 61, 2))
    S |= set(range(ev["fire_end"], L1 + 1))
    S |= set(range(R1, L3 + 1))
    S |= {ev["t380"], ev["fire_end"], R0, R1, end}
    h = int(math.ceil((end + 120) / 60.0)) * 60
    S |= set(range(end, h + 1, 10))
    S |= set(range(h, T_END_MIN + 1, 30))
    return sorted(x for x in S if 0 <= x <= T_END_MIN)


def landing_series(st, cond, minutes):
    """前室の箱の温度（推定）。焚く間は、ドームの内面に GAS_OVER_FACE を足した窯から出るガスの温度で定常の値を読み、
    扉を閉めているあいだは外気へ向かう。どちらも時定数 LANDING_TAU_H の 1 次の遅れで追う。"""
    Ta = cond["Ta"]
    pts = [(Ta, (Ta,) * 4)] + list(LANDING_ANCHOR[Ta])
    tau = [LANDING_TAU_H[k] * 60 for k in LANDING_KEYS]
    by_min = {}
    cur = [Ta] * 4
    by_min[0] = list(cur)
    for e in st.log:
        m = int(round(e["t"] / 60))
        firing = e["mode"] in ("fire", "refire")
        if firing:
            tgt = lerp(e["face"][st.ic] + GAS_OVER_FACE, pts)
        else:
            tgt = [Ta] * 4
        cur = [c + (g - c) * (1 - math.exp(-1.0 / tt)) for c, g, tt in zip(cur, tgt, tau)]
        by_min[m] = list(cur)
    return {k: [r1(by_min[m][i]) for m in minutes] for i, k in enumerate(LANDING_KEYS)}


def run_1d(name):
    st, rec = TM.run_day(name, dt=DT, t_cool_h=T_END_MIN / 60)
    ev = day_events(st, rec, name)
    minutes = sample_minutes(ev)
    logs = {int(round(e["t"] / 60)): e for e in st.log}
    Ta = st.Ta
    init = dict(t=0.0, mode="fire", Tn=None, face=[Ta] * 3, T=[[Ta] * c.N for c in st.comps])
    logs[0] = init
    A = [c.A_in for c in st.comps]
    out = dict(dome=[], hearth_loaf=[], hearth_open=[], air=[], surf=[], shell=[])
    for m in minutes:
        e = logs[m]
        prof = [st.profile(i, T=e["T"][i], face=e["face"][i]) for i in range(3)]
        out["hearth_loaf"].append([r1(v) for v in prof[st.ih]])
        out["dome"].append([r1(v) for v in prof[st.ic]])
        out["hearth_open"].append([r1(v) for v in prof[st.iho]])
        out["air"].append(r1(e["Tn"]))
        out["surf"].append(r1(sum(f * a for f, a in zip(e["face"], A)) / sum(A)))
        out["shell"].append(r1(prof[st.ic][-1]))
    out["landing"] = landing_series(st, TM.DAYS[name]["cond"], minutes)
    # 突き合わせに使う値
    Lr = rec["loads"]
    dome = st.comps[st.ic]
    mx = dict(fa=-1e9, fb=-1e9, last=-1e9, inner=-1e9)
    for e in st.log:
        T = e["T"][st.ic]
        p = st.profile(st.ic, T=T, face=e["face"][st.ic])
        mx["fa"] = max(mx["fa"], p[dome.xface.index(min(dome.xface, key=lambda x: abs(x - 0.065))) + 1])
        mx["fb"] = max(mx["fb"], p[dome.xface.index(min(dome.xface, key=lambda x: abs(x - 0.090))) + 1])
        mx["last"] = max(mx["last"], T[-1])
        mx["inner"] = max(mx["inner"], T[0])
    vals = {
        "焚き終わり": ev["fire_end"],
        "内面が 380℃に届く": first_min_at(st, 380.0),
        "1 回目の窯入れ": ev["loads"][0], "2 回目の窯入れ": ev["loads"][1], "3 回目の窯入れ": ev["loads"][2],
        "1 回目の炉床": Lr[0]["hearth"], "2 回目のパンの真下": Lr[1]["hearth"], "3 回目の炉床": Lr[2]["hearth"],
        "焚き直しの始め": ev["refire"][0], "焚き直しの終わり": ev["refire"][1], "焼き終わり": ev["bake_end"],
        "15 分のドームの最低": min(x["ceil_15"] for x in Lr),
        "60 分のあいだのドームの最低": min(x["ceil_min60"] for x in Lr),
        "15〜45 分の下がりの最大": max(x["ceil_15"] - x["ceil_45"] for x in Lr),
        "回のあいだの下がり（均し）": Lr[0]["havg"] - Lr[1]["havg"],
        "回のあいだの下がり（パンの真下）": Lr[0]["hearth"] - Lr[1]["hearth"],
        "毛布の外面の最大": rec["Ts_max"]["dome"], "炉床の下の面（天板の上面）の最大": rec["Ts_max"]["hearth"],
        "毛布の 1 層目の外（65 mm）の最大": mx["fa"], "毛布の 2 層目の外（90 mm）の最大": mx["fb"],
        "毛布の 3 層目の外の最大（表の値は最後の格子の中心 112.5 mm）": mx["last"],
        "ドームの内面の最大（内の格子の中心 2.5 mm）": mx["inner"],
    }
    return st, rec, ev, minutes, out, vals


def first_min_at(st, T):
    for e in st.log:
        if e["mode"] == "fire" and e["face"][st.ic] >= T - 1e-6:
            return int(round(e["t"] / 60))
    return None


def wall_nodes(c, parts_layers):
    x = [0.0] + list(c.xface) + [c.L]
    return dict(x=[round(v, 4) for v in x], layers=parts_layers)


# ---------------------------------------------------------------- 2 次元の主な時刻

SNAP_LABEL = dict(h1="火を付けて 1 時間", h2="火を付けて 2 時間", h3="火を付けて 3 時間", t380="内面が 380℃に届く",
                  fire_end="焚き終わり（熾火を掻き出す）", L1="1 回目の窯入れ", L1_30="1 回目から 30 分", L2="2 回目の窯入れ",
                  R0="焚き直しの始め（2 回目を出す）", R1="焚き直しの終わり", L3="3 回目の窯入れ", L3_30="3 回目から 30 分",
                  end="焼き終わり（3 回目を出す）")


def run_2d(name):
    d = TM.DAYS[name]
    t380 = round((TM.T_TOP - d["cond"]["Ta"]) / d["rate"] * 3600 / DT) * DT
    marks = {}

    def keep(t, phase, loads, rec):
        lab = None
        if t in (3600.0, 7200.0, 10800.0):
            lab = "h%d" % int(t // 3600)
        elif t == t380:
            lab = "t380"
        elif t == rec.get("t_fire_end"):
            lab = "fire_end"
        elif loads and t == loads[-1]:
            lab = "L%d" % len(loads)
        elif len(loads) >= 1 and t == loads[0] + 1800:
            lab = "L1_30"
        elif t == rec.get("t_refire_start"):
            lab = "R0"
        elif t == rec.get("t_refire_end"):
            lab = "R1"
        elif len(loads) == 3 and t == loads[2] + 1800:
            lab = "L3_30"
        elif len(loads) == 3 and t == loads[2] + 3600:
            lab = "end"
        if lab and lab not in marks:
            marks[lab] = t
            return lab
        return None

    rec, snaps, g = TM.run_2d(name, dt=DT, t_after=3600.0, keep=keep)
    idx = list(range(0, g["nr"], 2))
    if idx[-1] != g["nr"] - 1:
        idx.append(g["nr"] - 1)
    rc, dz, nzb = g["rc"], g["dz"], g["nzb"]
    z = []
    acc = 0.0
    for v in dz:
        z.append(round(acc + v / 2, 5))
        acc += v
    order = ["h1", "h2", "h3", "t380", "fire_end", "L1", "L1_30", "L2", "R0", "R1", "L3", "L3_30", "end"]
    by = {s["label"]: s for s in snaps}
    out = []
    for lab in order:
        s = by[lab]
        rows = []
        for j, row in enumerate(s["T"]):
            rows.append([None if (j < nzb and g["void"][i]) else r1(row[i]) for i in idx])
        out.append(dict(id=lab, label=SNAP_LABEL[lab], t=round(s["t"] / 60, 2), T=rows))
    # 突き合わせに使う値
    top = {s["label"]: s["T"][0] for s in snaps}

    def at(lab, r):
        return interp1(r, rc, top[lab])

    def centre(lab):
        num = sum(x * a for x, a, rr in zip(top[lab], g["Atop"], rc) if rr < 0.08)
        den = sum(a for a, rr in zip(g["Atop"], rc) if rr < 0.08)
        return num / den

    L = rec["loads"]
    vals = {
        "2 次元：1 回目までの待ち": rec["wait"],
        "2 次元：2 回目のパンの真下": L[1]["under"],
        "2 次元：3 回目": L[2]["under"],
        "2 次元：1 回目の中央と壁から 5 cm の差": centre("L1") - at("L1", 0.25),
        "2 次元：1 回目の中央と壁から 2.5 cm の差": centre("L1") - at("L1", 0.275),
        "2 次元：2 回目のパンの外の縁（壁から 3.5 cm）": at("L2", 0.25) + (at("L2", 0.275) - at("L2", 0.25)) * 0.6,
    }
    res = dict(
        r=[round(rc[i], 4) for i in idx],
        z=z,
        regions=[
            dict(part="hearth", name="耐火レンガ", r=[0.0, TM.R_BRICK], z=[0.0, 0.065]),
            dict(part="hearthIns", name="縁の帯（パーライトとセメント）", r=[TM.R_BRICK, 0.415], z=[0.0, 0.065]),
            dict(part=None, name="無い所（値は null）", r=[0.415, round(math.sqrt(0.6606 / math.pi), 4)], z=[0.0, 0.065]),
            dict(part="hearthIns", name="炉床の下の板（パーライトとセメント）", r=[0.0, round(math.sqrt(0.6606 / math.pi), 4)], z=[0.065, 0.140]),
        ],
        top=[
            dict(name="焼き室（窯の中の空気と熱をやり取りする）", r=[0.0, 0.300]),
            dict(name="ドームの足（縄 6 mm を挟む）", r=[0.300, 0.340]),
            dict(name="毛布 75 mm で覆う", r=[0.340, 0.415]),
            dict(name="殻の中の空気に出る", r=[0.415, round(math.sqrt(0.6606 / math.pi), 4)]),
        ],
        events=dict(fire_end=round(rec["t_fire_end"] / 60, 2), loads=[round(x["t"] / 60, 2) for x in L],
                    refire=[round(rec["t_refire_start"] / 60, 2), round(rec["t_refire_end"] / 60, 2)]),
        snaps=out,
    )
    return res, vals


# ---------------------------------------------------------------- 突き合わせ

def compare(name, vals):
    rows, errors = [], []
    for item, unit, doc, sec in DOC[name]:
        key = item if item in vals else item.split("（")[0]
        v = vals[key]
        tol = TOL_MIN if unit == "min" else TOL_K
        diff = v - doc
        ok = abs(diff) <= tol + 1e-9
        rows.append(dict(item=item, unit="分" if unit == "min" else "℃（差は K）", doc=doc, model=round(v, 1), diff=round(diff, 1),
                         where=sec, ok=ok))
        if not ok:
            errors.append(f"T3 {TM.DAYS[name]['label']}の「{item}」：文書 {doc}、模型 {v:.1f}（{sec}）")
    for item, doc, sec, why in DOC_REF.get(name, []):
        v = vals[item]
        rows.append(dict(item=item, unit="℃（差は K）", doc=doc, model=round(v, 1), diff=round(v - doc, 1), where=sec,
                         ok=abs(v - doc) <= TOL_K, note=why))
    return rows, errors


# ---------------------------------------------------------------- 組み立て

def build():
    errors, geo = check_inputs()
    if errors:
        return None, errors
    days = {}
    nodes = None
    for name in ("normal", "cold"):
        st, rec, ev, minutes, ser, vals = run_1d(name)
        h2d, vals2 = run_2d(name)
        vals.update(vals2)
        chk, errs = compare(name, vals)
        errors += errs
        bounds = phase_bounds(ev)
        desc = phase_desc(name, ev)
        phases = [dict(id=pid, name=nm, steps=sids, t=list(b), desc=desc[pid]) for (pid, nm, sids), b in zip(PHASES, bounds)]
        pidx = []
        for m in minutes:
            k = next(i for i, (a, b) in enumerate(bounds) if a <= m < b) if m < T_END_MIN else len(bounds) - 1
            pidx.append(k)
        cond = TM.DAYS[name]["cond"]
        days[name] = dict(
            label=TM.DAYS[name]["label"],
            cond=dict(Ta=cond["Ta"], hc=cond["hc"], k_brick=cond["kf"], k_castable=cond["kc"], q_dough=cond["qd"],
                      fire_h=TM.DAYS[name]["tf"], refire_h=TM.DAYS[name]["tref"], rate_Kph=TM.DAYS[name]["rate"]),
            events=ev,
            phases=phases,
            t=minutes,
            phase=pidx,
            T=dict(dome=ser["dome"], hearth_loaf=ser["hearth_loaf"], hearth_open=ser["hearth_open"], air=ser["air"],
                   surf=ser["surf"], shell=ser["shell"], landing=ser["landing"]),
            hearth2d=h2d,
            check=chk,
        )
        if nodes is None:
            d, h = st.comps[st.ic], st.comps[st.ih]
            nodes = dict(
                dome=dict(wall_nodes(d, [
                    dict(part="chamber", name="キャスタブル", x=[0.0, 0.040]),
                    dict(part="insulation", name="毛布 1 層目", x=[0.040, 0.065]),
                    dict(part="insulation", name="毛布 2 層目", x=[0.065, 0.090]),
                    dict(part="insulation", name="毛布 3 層目", x=[0.090, 0.115]),
                ]), r_in=TM.R_IN, x_from="ドームの内面から外へ（球の半径の向き、r = r_in + x）",
                    ends=["内面（焚く間は保った温度、閉じているときは内の格子の温度）", "毛布の外面（殻の内の面とみる）"]),
                hearth=dict(wall_nodes(h, [
                    dict(part="hearth", name="耐火レンガ", x=[0.0, 0.065]),
                    dict(part="hearthIns", name="パーライトとセメント", x=[0.065, 0.140]),
                ]), x_from="炉床の面から下へ（y = y_hearth − x）", ends=["炉床の面", "天板の上の面"],
                    columns=dict(hearth_loaf=dict(name="パンを置く所", area_share=round(st.oven["f_spot"], 3)),
                                 hearth_open=dict(name="空いた所", area_share=round(1 - st.oven["f_spot"], 3)))),
            )
    if errors:
        return None, errors
    data = dict(
        meta=dict(
            title="焼く日の温度の場",
            generator="tools/gen_thermal.py（模型は tools/thermal_model.py）",
            units=dict(T="℃", t="分（6:00 に火を付けてからの時間）", x="m", r="m", z="m（炉床の面から下へ）"),
            clock_start="06:00",
            axisymmetric=("ドームのまわりの向き（方位）と高さ（緯度）では同じ温度と置いた（軸対称）。"
                          "焚き口と火の位置の片寄りは入れていない。"),
            notes=[
                "値は 1 次元と 2 次元の計算の値で、測った値ではない。",
                "ドームの壁は、どの緯度もどの方位も dome の同じ列の値で塗る。",
                "炉床は、パンを置く所（hearth_loaf）と空いた所（hearth_open）の 2 つの 1 次元の列で数えた。横の向きの違いは hearth2d の主な時刻で見る。",
                "炉床の 2 次元は、四角の炉床（0.684 × 0.69 m）を同じ面積の円（半径 0.3874 m）に置き換えた軸対称の値である。四角に当てるときは中心からの距離 r で読み、r が板の外の半径を超える隅は端の値で読む（推定）。",
                "焼き終わりにドームを下げる段は使わず、扉はその日ずっと閉じたままにした基準の日である（入れるときと出すときに 2 分ずつ開ける）。",
                "air は扉を閉めているときの窯の中の空気（1 点、熱容量なし）で、焚く間は null にした。焚く間の炎とガスの温度は模型に無い。",
                "surf は 3 つの内面（パンを置く炉床、空いた炉床、ドーム）の面積で均した温度で、窯の中の見かけの温度として使う。",
                "shell は毛布の外面の値である。殻の抵抗と空気層を 0 と置いたので、殻の外面はこれより低い見込みである（推定）。",
                "landing は前室の箱の推定である。焚く間は、前室の 2 層の模型の定常の値（03 の 3.9.8 の箱と内張りの表）を、窯から出るガスの温度で読んで当てた。",
                "前室の箱の焼くあいだは差し込みの扉の外にあるので、外気へ向かって冷めるとした。床のレンガと扉の面から入る熱は入れていない（推定）。",
            ],
        ),
        geometry=dict(
            source="docs/data/oven.json",
            y_hearth=round(geo["y_hearth"], 4),
            y_dome_base=round(geo["y_hearth"] + geo["seat"], 4),
            dome_r_in=TM.R_IN,
            hearth_square=[geo["hearth_w"], geo["hearth_d"]],
            hearth_r_eq_model=TM.R_BRICK,
            note="y は地面からの高さ（3D の図と同じ置き方）。ドームの球の中心は y_dome_base の面の上にある。",
        ),
        nodes=nodes,
        series_keys=dict(
            dome="ドームの壁（nodes.dome.x の各点）",
            hearth_loaf="炉床のパンを置く所（nodes.hearth.x の各点）",
            hearth_open="炉床の空いた所（nodes.hearth.x の各点）",
            air="焼き室の空気（閉じているときだけ）",
            surf="内面の面積で均した温度（見かけの温度）",
            shell="殻の外面（毛布の外面の値、上の限り）",
            landing={k: LANDING_LABEL[k] for k in LANDING_KEYS},
        ),
        days=days,
        source=dict(
            models=[
                "1 次元の焚き方と焼き方の模型（oven_rt.py、light_ovens.py、drum_cases_rt.py、fire_sim.py、nb_fire.py、common.py）を tools/thermal_model.py に写した。",
                "炉床の 2 次元の模型（f2_hearth2d.py、四角、縄 6 mm の基本の形）を tools/thermal_model.py に写した。3 回目のあとも同じ式で 60 分回した。",
                "前室の箱は、前室の 2 層の模型（煙突と垂れ壁なしの F0）の定常の値を写した。",
                "写した模型は、元の numpy の模型と 0.01 K 未満で同じ値を返すことを確かめた（2026-10-22）。",
            ],
            assumed=[
                "条件（仮）：ふつうの日は外気 10℃、外の対流 8 W/(m² K)、レンガ 1.1 W/(m K)、キャスタブル 0.9 W/(m K)、生地 0.50 MJ/kg とした。寒い日は外気 −10℃、15 W/(m² K)、1.0 W/(m K)、0.8 W/(m K)、0.63 MJ/kg で、窯も −10℃から始める。",
                "焚き方：ふつうの日は 100℃/時で 380℃まで上げて 4.0 時間焚き、焚き直しを 0.75 時間とした。寒い日は 90℃/時で上げて 4.75 時間焚き、焚き直しを 1.0 時間とした（03 の 3.2.3）。",
                "継ぎ目の漏れを 0.5 W/K（仮）、閉じた扉を 6 W/(m² K) とし、入れるときと出すときに 2 分ずつ開けた口を 30 W/(m² K)（仮）とした。",
                "キャスタブルの物性（仮、CA-13T の値は未確認）と毛布の熱伝導率（仮）を置き、殻の抵抗と熱容量を 0（仮）とした。",
                "生地は 1 回 2 個（1 kg ずつ）で、熱の半分を炉床のパンを置く所から、半分を窯の中から取る（仮）。",
                f"前室の箱：窯から出るガスの温度を、ドームの内面に {GAS_OVER_FACE:.0f} K 足して見た（推定、焚き始め 200℃、半ば 400℃、温めきったあと 550℃の段に合わせた）。",
                "前室の箱の温まり方と冷め方は 1 次の遅れとし、時定数を袖 0.1 時間、天板と内張り 0.8 時間とした（推定、03 の 3.9.4 の、焚き終えてから 60℃を下回るまでの袖 0.07〜0.25 時間、天井の外 0.4〜1.7 時間から置いた）。",
                "2 次元の炉床：ドームの足の下の縄を 6 mm、0.08 W/(m K)（仮）とした。足は、キャスタブル 20 mm を通してドームのキャスタブルの層の平均の温度とつなぐ（仮）。",
            ],
            unverified=[
                "どの値も測っていない（未確認）。初めての焼成で、炉床の 5 点とドームの内面を放射温度計で測って比べる。",
                "焚き口と火の位置の片寄り（焚き口の側の炉床が燃やす空気で冷える、火を寄せた側が熱い）は入れていない。焚き口の側の縁は中央より 38 K まで低くなりうる（03 の 3.2.5、未確認）。",
                "ドームの緯度ごとの違い（頂が熱い、足元が冷える）は模型に無い（未確認）。",
                "前室の箱の値は定常の値を工程に当てた推定で、時定数と、焼くあいだに床のレンガから入る熱は確かめていない（未確認）。",
                "殻の外面の値は上の限りで、殻の板と空気層を入れた温度は計算していない（未確認）。",
                "継ぎ目の漏れの値は確かめていない（未確認）。",
            ],
        ),
    )
    return data, []


# ---------------------------------------------------------------- 書き出し（数の並びは 1 行に）

def _scalar(v):
    return json.dumps(v, ensure_ascii=False)


def _is_scalar(v):
    return v is None or isinstance(v, (bool, int, float, str))


def dumps(o, ind=0):
    pad = " " * ind
    if isinstance(o, dict):
        if not o:
            return "{}"
        items = [f'{pad} {_scalar(k)}: {dumps(v, ind + 1)}' for k, v in o.items()]
        return "{\n" + ",\n".join(items) + "\n" + pad + "}"
    if isinstance(o, list):
        if all(_is_scalar(v) and not isinstance(v, str) for v in o) or (
                all(isinstance(v, str) for v in o) and sum(len(v) for v in o) < 60):
            return "[" + ",".join(_scalar(v) for v in o) + "]"
        items = [pad + " " + dumps(v, ind + 1) for v in o]
        return "[\n" + ",\n".join(items) + "\n" + pad + "]"
    return _scalar(o)


def same(a, b, path="", loose=False, tol=0.1 + 1e-9):
    """a と b が同じか。温度の並び（鍵 T の下）と突き合わせ（鍵 check の下）の数だけは、丸めの 1 桁（0.1）までの違いを許す。
    違う所を返す。"""
    if isinstance(a, bool) or isinstance(b, bool) or a is None or b is None or isinstance(a, str) or isinstance(b, str):
        return None if a == b else path
    if isinstance(a, (int, float)) and isinstance(b, (int, float)):
        return None if (abs(a - b) <= tol if loose else a == b) else path
    if isinstance(a, dict) and isinstance(b, dict):
        if list(a) != list(b):
            return path + "（鍵）"
        for k in a:
            r = same(a[k], b[k], f"{path}.{k}", loose or k in ("T", "check"), tol)
            if r:
                return r
        return None
    if isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            return path + "（長さ）"
        for i, (x, y) in enumerate(zip(a, b)):
            r = same(x, y, f"{path}[{i}]", loose, tol)
            if r:
                return r
        return None
    return path


def main():
    data, errors = build()
    if errors:
        for e in errors:
            print(e, file=sys.stderr)
        sys.exit(1)
    text = dumps(data) + "\n"
    if "--check" in sys.argv:
        if not OUT.exists():
            print(f"{OUT.relative_to(ROOT)} が無い。python tools/gen_thermal.py を実行する。", file=sys.stderr)
            sys.exit(1)
        old = OUT.read_text(encoding="utf-8")
        if old == text:
            print("thermal.json は模型の出力と同じ。")
            return
        where = same(json.loads(old), json.loads(text))
        if where is None:
            print("thermal.json は模型の出力と、温度の丸めの 1 桁（0.1）の違いを除いて同じ。")
            return
        print(f"thermal.json が模型の出力と食い違う（{where}）。python tools/gen_thermal.py を実行する。", file=sys.stderr)
        sys.exit(1)
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    n = sum(len(d["t"]) for d in data["days"].values())
    print(f"{OUT.relative_to(ROOT)} を書いた（{OUT.stat().st_size / 1024:.0f} KB、時刻 {n}、2 次元の時刻 "
          f"{sum(len(d['hearth2d']['snaps']) for d in data['days'].values())}）。")


if __name__ == "__main__":
    main()
