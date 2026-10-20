// 図面モード。平面図、正面図、断面図 A-A を、oven.json の寸法から SVG で描く。
// 形の決め方は docs/viewer/main.js の cast（分割のキャスタブルのドーム）と同じ鍵と式を使う（設計の基準の 2.6 と 10 章）。
// 用紙は A3 横（420 x 297、単位は用紙上の mm）、尺度 1:20 なので模型の 1 m は用紙の 50 mm。
// 座標はドームの中心を原点にし、x を左右（右が正）、z を前後（焚き口の向きが正）、y を地面からの高さにとる。
NavApp.register('dwg', (api) => {
  'use strict';

  const S = 50;
  const SW = 420;
  const SH = 297;
  const BOX = [0, 0, SW, SH];
  const DEFAULT_ID = 'BO-DWG-003';
  const ORDER = ['foundation', 'anchor', 'stand', 'slab', 'hearthIns', 'hearth', 'chamber', 'seam', 'band', 'insulation', 'shell', 'vent', 'landing', 'door', 'damper', 'chimney', 'wood', 'person', 'frost'];

  // ---------- 図にだけ使う小さな寸法（設計の基準の 1 章と 10 章の値。oven.json に鍵が無い）

  const COLS = 6; // 炉床のレンガの列（1.2）
  const ROWS = 3; // 炉床のレンガの 1 列の個数（1.2）
  const SILL_COLS = 3; // 敷居と前室の床のレンガの列（1.2）
  const STRIP_L = 0.47; // 縁の帯の長さと、前室の下の断熱の板の幅（1.2、2.6）
  const BOARD_D = 0.24; // 前室の下の断熱の板の奥行（1.2）
  const CHAMFER = 0.12; // 炉床の下の断熱の区画の、外の角を落とす長さ（1.2）
  const LINER = 0.032; // 前室の天井の薄いレンガの厚さ（1.4）
  const GROOVE = 0.025; // ダンパーの溝（L25）の高さ（1.6、2.6）
  const DAMPER_Z0 = 0.48; // ダンパーの溝の後ろの端の z（1.6）
  const FOLD = 0.015; // 前室の天板の水切りの折り下げ（仮）
  const PLUG_W = 0.31; // 差し込みの扉の差し込む部分の幅（1.5）
  const PLUG_H = 0.17; // 同じく高さ（1.5）
  const FACE_W = 0.33; // 差し込みの扉の面の板の幅（1.5）
  const FACE_H = 0.19; // 同じく高さ（1.5）
  const FACE_T = 0.0005; // 同じく厚さ（ステンレス板 0.5 mm）
  const RAIL = 0.025; // 引き戸のレール L25 の辺（1.5）
  const RAIL_T = 0.003; // 同じく厚さ
  const HCAP = 0.18; // H 笠の高さ（1.7）
  const HCAP_W = 0.42; // H 笠の左右の幅（仮）
  const BRACKET_W = 0.02; // 煙突の支持金具の帯の幅（仮）
  const CUT_CLEAR = 0.02; // 前の妻の切り欠きと前室の鋼板のすきま（1.8）
  const CUT_OVER = 0.048; // 前の妻の切り欠きの上の端の、軒からの高さ（1.8）
  const ROOF_T = 0.012; // 波板の山の高さ（仮）
  const VENT_BELOW = 0.13; // ベントの中心の、棟からの下がり（仮）
  const VENT_OUT = 0.07; // ベントのフードの、後ろの妻からの出（仮）
  const PLAN_CUT = 0.03; // 平面図を切る高さの、炉床の面からの上がり
  const ROPE_W = 0.012; // 縄の圧したあとの幅（1.1、仮）
  const EAR_L = 0.03; // 帯の耳の出（仮）
  const SIDE_INSET = 0.01; // 側梁の端の、天板の前と後ろの縁からの下がり（40 角 8.0 m から、仮）
  const GUSSET_L = 0.15; // 交点の当て板 L50 の長さ（1.9）
  const GUSSET_W = 0.05; // 同じく辺
  const SHIM = 0.0128; // 敷き板 3.2 mm を 4 枚重ねた厚さ（1.9）
  const SHIM_W = 0.098; // 敷き板の辺
  const NUT_H = 0.019; // M24 のナットの高さ
  const NUT_R = 0.018; // M24 のナットの二面幅の半分
  const WASH_T = 0.0045; // 座金 26 × 44 × 4.5 の厚さ（1.9）
  const WASH_R = 0.022; // 同じく外の半径
  const SLEEVE_R = 0.017; // さや管 SGP 25A の外の半径（1.9）
  const SLEEVE_L = 0.10; // さや管の長さ
  const ROD_IN = 0.08; // 全ねじの先を据え台の穴に入れる長さ（1.9）
  const HOLE_R = 0.013; // 据え台の穴の半径（径 26 mm、1.10）
  const HOLE_D = 0.10; // 据え台の穴の深さ（1.10）
  const LUG_OFF = 0.03; // 鎖の線の始まりの、脚の中心からの出（2.6）
  const LUG_OUT = 0.06; // 脚の耳（平鋼 6 × 100 を 60 mm に切る）の出（1.9）
  const LUG_H = 0.10; // 同じく高さ
  const LUG_T = 0.006; // 同じく厚さ
  const SLAB_T = 0.06; // 風の留めの平板の厚さ（置いた値、1.11）
  const SLAB_GAP = 0.018; // 平板 2 枚のすきま（10.1）
  const RECV_L = 0.55; // 受け材 L50 の長さ（1.11）
  const RECV = 0.05; // 受け材の辺
  const ROD_PAST = 0.05; // 全ねじの、受け材の下へ出す長さ（仮）
  const TB_L = 0.16; // ターンバックルの長さ（仮）
  const TB_W = 0.025; // ターンバックルの太さ（仮）
  const EYE_R = 0.02; // アイナットの輪の半径（仮）

  // ---------- 小さな道具

  const e = (tag, a, k) => api.el('svg:' + tag, a || {}, [].concat(k || []).flat(Infinity));
  const r2 = (v) => Math.round(v * 100) / 100;
  const mm = (v) => String(Math.round(v * 1000));
  const P2 = (...pts) => pts.map((p) => `${r2(p[0])} ${r2(p[1])}`).join(' ');
  const pathEl = (d, cls) => e('path', { d, class: cls });
  const polyEl = (pts, cls) => pathEl(`M ${P2(...pts)} Z`, cls);
  const lineEl = (x1, y1, x2, y2, cls) => e('line', { x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), class: cls });
  const plineEl = (pts, cls) => pathEl(`M ${P2(...pts)}`, `${cls || ''} fn`);
  const circEl = (cx, cy, r, cls) => e('circle', { cx: r2(cx), cy: r2(cy), r: r2(r), class: cls });
  const rectEl = (xa, ya, xb, yb, cls) => e('rect', {
    x: r2(Math.min(xa, xb)), y: r2(Math.min(ya, yb)), width: r2(Math.abs(xb - xa)), height: r2(Math.abs(yb - ya)), class: cls,
  });
  const hitOf = (el) => { const c = el.cloneNode(false); c.setAttribute('class', 'hit'); return c; };
  // 隠れ線。細い線は押しにくいので、見えない太い線を重ねる。
  const hid = (el) => { el.setAttribute('class', 'hid'); return [el, hitOf(el)]; };
  // 細い線（継ぎ目、鎖、想像線）にも押すための太い線を重ねる。
  const withHit = (el) => [el, hitOf(el)];
  const clipG = (id, kids) => e('g', { 'clip-path': `url(#${id})` }, kids);

  // 3 次元の小さな道具。点と向きは [x, y, z]。
  const add3 = (a, b, k = 1) => [a[0] + k * b[0], a[1] + k * b[1], a[2] + k * b[2]];
  const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]); return [a[0] / l, a[1] / l, a[2] / l]; };
  // 箱の 8 つの角。c は中心、ax は 3 本の向き、h は半分の長さ。
  function boxPts(c, ax, h) {
    const out = [];
    for (const a of [-1, 1]) for (const b of [-1, 1]) for (const d of [-1, 1]) {
      out.push(add3(add3(add3(c, ax[0], a * h[0]), ax[1], b * h[1]), ax[2], d * h[2]));
    }
    return out;
  }
  // 用紙の点の凸包（箱を図に写した外形に使う）
  function hull(pts) {
    const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [];
    for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
    const up = [];
    for (const q of p.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }

  // アーチの半幅。直線の部分の高さ spring より上は、半径 hw の半円。y はドームの足からの高さ。
  const archHalf = (hw, spring, y) => (y <= spring ? hw : Math.sqrt(Math.max(0, hw * hw - (y - spring) * (y - spring))));

  // 長方形 [x0, z0, x1, z1] の辺を隠れ線で引く。同じ線の上で重なる辺は 1 本にまとめる。
  // 破線が 2 本重なると、ずれた破線どうしが実線に見えるため。X と Z は図の座標への写し方。
  // 別の部品の隠れ線と重なっても破線がそろうよう、破線の始まりを用紙の座標に合わせる。
  const DASH = 3; // CSS の .hid の破線（2 と 1）の周期
  const hidLine = (x1, y1, x2, y2) => {
    const [a, b] = (x1 + y1 <= x2 + y2) ? [[x1, y1], [x2, y2]] : [[x2, y2], [x1, y1]];
    const l = lineEl(a[0], a[1], b[0], b[1]);
    l.setAttribute('stroke-dashoffset', r2((a[0] === b[0] ? a[1] : a[0]) % DASH));
    return hid(l);
  };
  function hidRects(rects, X, Z) {
    const hz = new Map();
    const vt = new Map();
    const add = (m, k, a, b) => {
      const key = Math.round(k * 1e5);
      if (!m.has(key)) m.set(key, { k, iv: [] });
      m.get(key).iv.push([Math.min(a, b), Math.max(a, b)]);
    };
    for (const [x0, z0, x1, z1] of rects) {
      add(hz, z0, x0, x1);
      add(hz, z1, x0, x1);
      add(vt, x0, z0, z1);
      add(vt, x1, z0, z1);
    }
    const out = [];
    const merge = (m, mk) => {
      for (const { k, iv } of m.values()) {
        iv.sort((p, q) => p[0] - q[0]);
        let [a, b] = iv[0];
        for (const [c, d] of iv.slice(1)) {
          if (c <= b + 1e-9) b = Math.max(b, d);
          else { out.push(...mk(k, a, b)); [a, b] = [c, d]; }
        }
        out.push(...mk(k, a, b));
      }
    };
    merge(hz, (z, a, b) => hidLine(X(a), Z(z), X(b), Z(z)));
    merge(vt, (x, a, b) => hidLine(X(x), Z(a), X(x), Z(b)));
    return out;
  }

  // ---------- 寸法を読む（viewer/main.js と同じ鍵。式は設計の基準の 2.6）

  function model() {
    const pr = api.oven.params;
    const P = (k) => {
      if (!pr[k] || pr[k].v == null) throw new Error(`oven.json に ${k} がありません`);
      return pr[k].v;
    };
    const DEG = Math.PI / 180;
    const m = {};
    // 高さの基準。炉床の下の断熱と炉床は天板の上面から積み、ドームは縄の厚さだけ上げて載せる。
    m.top = P('table.top');
    m.hi = P('hearth.insulation');
    m.th = P('hearth.firebrick');
    m.yInsTop = m.top + m.hi;
    m.yFloor = m.yInsTop + m.th;
    m.seat = P('dome.seat');
    m.yc = m.yFloor + m.seat; // ドームの足の下の面（ドームの中心の高さ）

    // ドーム、毛布、殻の内外
    m.R = P('dome.inner_diameter') / 2;
    m.H = P('dome.inner_height');
    m.t = P('dome.thickness');
    m.Ro = m.R + m.t;
    m.lat = P('dome.split_lat') * DEG;
    m.step = P('dome.step');
    // 段付きの継ぎ目は、厚さを内と外の dome.step ずつに分け、外の半分を dome.step の長さだけ下げる（長さは図で置いた）。
    m.lap = m.step / (m.R + m.step);
    m.ins = P('insulation.thickness');
    m.Rb = m.Ro + m.ins;
    m.si = m.Rb + P('shell.gap');
    m.sw = P('shell.width') / 2;

    // 焚き口と入口の枠。焚き口の高さはドームの足から測る。
    m.dw = P('door.width') / 2;
    m.dh = P('door.height');
    m.spring = Math.max(0, m.dh - m.dw);
    m.cw = m.dw + m.t;
    m.ch = m.dh + m.t;
    m.zCol = m.Ro + P('collar.depth');

    // 足元の帯（外の半径はドームの外の半径に帯の厚さの半分を足す）
    m.bandW = P('band.width');
    m.bandT = P('band.thickness');
    m.bandR0 = m.Ro - m.bandT / 2;
    m.bandR1 = m.Ro + m.bandT / 2;

    // 炉床、敷居と前室の床、縁の帯、炉床の下の断熱
    m.hw = P('hearth.width') / 2;
    m.hd = P('hearth.depth') / 2;
    m.bw = P('hearth.width') / COLS;
    m.bl = P('hearth.depth') / ROWS;
    m.sillW = (m.bw * SILL_COLS) / 2;
    m.strip = P('hearth.strip');
    m.q = P('hearth.ins_quarter');

    // 前室
    m.lpw = P('landing.width') / 2;
    m.lph = P('landing.height');
    m.lpd = P('landing.depth');
    m.pl = P('landing.plate');
    m.lov = P('landing.overhang');
    m.lo = m.lpw + m.pl;
    m.zLF = m.zCol + m.lpd + m.pl; // 前室の前の面
    // 前室の下の断熱の板。4 区画の前の縁（z = hearth.ins_quarter）から 0.24 m とし、3D とそろえる。
    // 仕様の z = 0.40〜0.64 m は 4 区画と 20 mm 重なるので、大きさを保って前へ 20 mm ずらした（要確認）。
    m.zBoard0 = m.q;
    m.zBoard1 = m.zBoard0 + BOARD_D;
    m.zJoistF = m.zCol + m.lpd; // 前の根太（前室の前の面の下、oven.json の table.joist_n）
    m.yCeil = m.yFloor + m.lph; // 天井の薄いレンガの下の面
    m.yRoofIn = m.yCeil + LINER; // 鋼板の天井の下の面
    m.yRoofTop = m.yRoofIn + m.pl;
    m.apW = P('apron.width') / 2;
    m.apD = P('apron.depth');
    m.apRim = P('apron.rim');

    // 扉。引き戸は前室の口を上と下で同じだけ塞ぐ。レールは引き戸の幅の 2 倍で、右へ開く（向きは仮）。
    m.plug = P('door.plug');
    m.leafW = P('door.leaf_w') / 2;
    m.leafH = P('door.leaf_h');
    m.leafT = P('door.thickness');
    m.stops = P('door.stops');
    m.yLeaf0 = m.yFloor - (m.leafH - m.lph) / 2;
    m.yLeaf1 = m.yLeaf0 + m.leafH;
    m.zLeaf1 = m.zLF + m.leafT;
    m.railX0 = -m.leafW;
    m.railX1 = 3 * m.leafW;

    // ダンパーと煙突
    m.dpw = P('damper.width') / 2;
    m.zDp0 = DAMPER_Z0;
    m.zDp1 = DAMPER_Z0 + P('damper.length');
    m.cr = P('chimney.diameter') / 2;
    m.zCh = P('chimney.z');
    m.yChTop = P('chimney.top');
    m.yChBase = m.yRoofTop + GROOVE;
    m.yCap0 = m.yChTop - HCAP;

    // 殻
    m.eave = P('shell.eave');
    m.pitch = P('shell.pitch') * DEG;
    m.ridge = m.eave + m.sw * Math.tan(m.pitch);
    m.rov = m.sw + P('shell.overhang'); // 屋根の外形の半分
    m.yEdge = m.eave - (m.rov - m.sw) * Math.tan(m.pitch); // 軒の先の高さ
    m.yShell0 = m.top + P('shell.bottom_gap');
    m.cutW = m.lo + CUT_CLEAR;
    m.cutTop = m.eave + CUT_OVER;
    m.cutLowW = STRIP_L / 2;
    m.yBracket = (m.eave + m.ridge) / 2;
    m.vr = P('vent.diameter') / 2;
    m.yVent = m.ridge - VENT_BELOW;

    // 台。天板、根太、側梁、横梁を上から積み、脚は横梁の下に溶接する。
    m.tz = P('table.offset_z');
    m.W = P('table.width');
    m.D = P('table.depth');
    m.zb = m.tz - m.D / 2;
    m.zf = m.tz + m.D / 2;
    m.dk = P('deck.thickness');
    m.jt = P('table.joist');
    m.bm = P('table.beam');
    m.sd = P('table.side');
    m.bx = P('table.beam_x');
    m.fz = P('table.front_z');
    m.rz = P('table.rear_z');
    m.rlx = P('table.rear_leg_x');
    m.yJt = m.top - m.dk; // 根太の上面
    m.yJb = m.yJt - m.jt; // 根太の下面と側梁の上面
    m.ySb = m.yJb - m.sd; // 側梁の下面と横梁の上面
    m.yBb = m.ySb - m.bm; // 横梁の下面（雪を下ろす目安）
    m.rearL = 2 * m.rlx + m.bm;
    m.frontL = 2 * m.bx + m.bm;
    m.sz0 = m.zb + SIDE_INSET;
    m.sz1 = m.zf - SIDE_INSET;
    // 根太は殻の柱の下から等間隔に（table.joist_n から 1 を引いた）本と、前室の下に 1 本（2.6）
    const n = P('table.joist_n');
    m.joistZ = [...Array.from({ length: n - 1 }, (_, i) => -m.sw + (2 * m.sw * i) / (n - 2)), m.zJoistF];

    // 足と据え台
    m.rod = P('foot.rod');
    m.stack = P('foot.stack');
    m.fpl = P('foot.plate');
    m.fpw = P('foot.plate_w');
    m.ps = P('pad.size');
    m.ph = P('pad.height');
    m.yPad = P('pad.top');
    m.pg = P('pad.gravel');
    m.pit = P('pad.pit');
    m.yPlateBot = m.yPad + m.stack;
    m.yLeg = m.yPlateBot + m.fpl;
    m.legs = [
      { x: 0, z: m.fz, front: true },
      { x: -m.rlx, z: m.rz, front: false },
      { x: m.rlx, z: m.rz, front: false },
    ];

    // 風の留め。3 本の脚の中心の重心から各脚へ向かう向きに、水平から anchor.angle で張る（2.6）。
    const ang = P('anchor.angle') * DEG;
    m.angle = ang;
    m.aDepth = P('anchor.depth');
    m.aSlab = P('anchor.slab');
    m.aN = P('anchor.slabs');
    m.lug = P('anchor.lug');
    const cz = m.legs.reduce((s, g) => s + g.z, 0) / m.legs.length;
    const tn = Math.tan(ang);
    m.anchors = m.legs.map((g) => {
      const l = Math.hypot(g.x, g.z - cz);
      const d = [g.x / l, (g.z - cz) / l];
      const at = (s, y) => [g.x + d[0] * s, y, g.z + d[1] * s];
      const dir = norm3([d[0] * Math.cos(ang), -Math.sin(ang), d[1] * Math.cos(ang)]);
      const u = [-d[1], 0, d[0]];
      const v = norm3(cross3(dir, u));
      const sc = at(LUG_OFF + (m.lug + m.aDepth + SLAB_T / 2) / tn, -(m.aDepth + SLAB_T / 2));
      const off = (m.aN - 1) / 2;
      const slabs = Array.from({ length: m.aN }, (_, i) => boxPts(add3(sc, u, (i - off) * (m.aSlab + SLAB_GAP)), [u, v, dir], [m.aSlab / 2, m.aSlab / 2, SLAB_T / 2]));
      const recvC = add3(sc, dir, SLAB_T / 2 + RECV / 2);
      const lugP = at(LUG_OFF, m.lug);
      const gP = at(LUG_OFF + m.lug / tn, 0);
      const tbC = [(lugP[0] + gP[0]) / 2, (lugP[1] + gP[1]) / 2, (lugP[2] + gP[2]) / 2];
      return {
        g, d, dir, u, sc, lugP, gP, slabs,
        recv: boxPts(recvC, [u, v, dir], [RECV_L / 2, RECV / 2, RECV / 2]),
        rodEnd: add3(recvC, dir, RECV / 2 + ROD_PAST),
        upFace: add3(sc, dir, -SLAB_T / 2),
        tb: boxPts(tbC, [dir, u, v], [TB_L / 2, TB_W / 2, TB_W / 2]),
        eye: add3(gP, dir, -EYE_R),
      };
    });
    m.frost = P('frost.depth');
    return m;
  }

  // ---------- 図の部品

  const nameOf = (id) => (api.thing(id) ? api.thing(id).name : id);

  // 部品の形をまとめる。押すと選ぶ。
  function part(L, id, kids) {
    const g = e('g', { 'data-part': id, class: 'pt', tabindex: '0', role: 'button', 'aria-label': nameOf(id) }, kids);
    L.body.append(g);
    return g;
  }

  // 地面の下の据え台と締めた砕石を横から見た長方形 [横 0, y0, 横 1, y1]。c は横の位置。
  const padBelow = (M, c) => [
    [c - M.ps / 2, M.yPad - M.ph, c + M.ps / 2, 0],
    [c - M.pit / 2, M.yPad - M.ph - M.pg, c + M.pit / 2, M.yPad - M.ph],
  ];

  // 足の積み上げを横から見た形。下から敷き板、全ねじ、頭のナット 2 個、ナット B と A、座金、底板。
  // c は横の位置（正面図では x、断面図では z）。rc は図ごとの長方形の描き方。fill は塗り（切った所は鋼の塗り）。
  function footEls(rc, c, M, fill) {
    const yS = M.yPad + SHIM;
    const yW = M.yPlateBot - WASH_T;
    return [
      rc(c - M.rod / 2, yS, c + M.rod / 2, M.yPlateBot, `sh ${fill}`),
      rc(c - SHIM_W / 2, M.yPad, c + SHIM_W / 2, yS, `sh ${fill}`),
      rc(c - NUT_R, yS, c + NUT_R, yS + NUT_H, `sh ${fill}`),
      rc(c - NUT_R, yS + NUT_H, c + NUT_R, yS + 2 * NUT_H, `sh ${fill}`),
      rc(c - NUT_R, yW - 2 * NUT_H, c + NUT_R, yW - NUT_H, `sh ${fill}`),
      rc(c - NUT_R, yW - NUT_H, c + NUT_R, yW, `sh ${fill}`),
      rc(c - WASH_R, yW, c + WASH_R, M.yPlateBot, `sh ${fill}`),
      rc(c - M.fpw / 2, M.yPlateBot, c + M.fpw / 2, M.yLeg, `sh ${fill}`),
    ];
  }

  function text(L, x, y, s, o = {}) {
    let tr = null;
    if (o.rot) tr = `rotate(-90 ${r2(x)} ${r2(y)})`;
    else if (o.deg) tr = `rotate(${r2(o.deg)} ${r2(x)} ${r2(y)})`;
    const t = e('text', {
      x: r2(x), y: r2(y), class: o.cls || 'dt', 'text-anchor': o.anchor || 'middle', transform: tr, text: s,
    });
    (o.to || L.txt).append(t);
    return t;
  }

  function arrow(L, x, y, ang) {
    const len = 2.2;
    const w = 0.65;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    const bx = x - len * dx;
    const by = y - len * dy;
    L.dim.append(pathEl(`M ${P2([x, y], [bx - w * dy, by + w * dx], [bx + w * dy, by - w * dx])} Z`, 'da'));
  }

  // 横の寸法。x1 から x2 まで、用紙の y に引く。o.ext は補助線の始点の y（左右）。
  // o.at は文字の置き方（'right' は右の外、'left' は左の外）。o.tx があれば文字をその x に置く。
  function dimH(L, x1, x2, y, s, o = {}) {
    const lo = Math.min(x1, x2);
    const hi = Math.max(x1, x2);
    const ext = o.ext || [];
    [x1, x2].forEach((x, i) => {
      if (ext[i] == null) return;
      const sg = Math.sign(y - ext[i]) || 1;
      L.dim.append(lineEl(x, ext[i] + sg * 1, x, y + sg * 1.6));
    });
    const small = hi - lo < 7;
    const out = small ? 3.5 : 0;
    L.dim.append(lineEl(lo - out, y, hi + out, y));
    arrow(L, lo, y, small ? 0 : Math.PI);
    arrow(L, hi, y, small ? Math.PI : 0);
    if (o.tx != null) text(L, o.tx, y - 1, s, { anchor: o.anchor || 'middle' });
    else if (o.at === 'right') text(L, hi + out + 1.5, y + 1, s, { anchor: 'start' });
    else if (o.at === 'left') text(L, lo - out - 1.5, y + 1, s, { anchor: 'end' });
    else text(L, (lo + hi) / 2, y - 1, s);
  }

  // 縦の寸法。用紙の y1 から y2 まで、x に引く。o.ext は補助線の始点の x（y1 側、y2 側）。
  // o.at は文字の置き方（'right' は右に横書き、'left' は左に横書き、ほかは線の左に縦書き）。
  function dimV(L, y1, y2, x, s, o = {}) {
    const lo = Math.min(y1, y2);
    const hi = Math.max(y1, y2);
    const ext = o.ext || [];
    [y1, y2].forEach((y, i) => {
      if (ext[i] == null) return;
      const sg = Math.sign(x - ext[i]) || 1;
      L.dim.append(lineEl(ext[i] + sg * 1, y, x + sg * 1.6, y));
    });
    const small = hi - lo < 7;
    const out = small ? 3.5 : 0;
    L.dim.append(lineEl(x, lo - out, x, hi + out));
    arrow(L, x, lo, small ? Math.PI / 2 : -Math.PI / 2);
    arrow(L, x, hi, small ? -Math.PI / 2 : Math.PI / 2);
    const ty = o.ty != null ? o.ty : (lo + hi) / 2 + 1;
    if (o.at === 'right') text(L, x + 1.5, ty, s, { anchor: 'start' });
    else if (o.at === 'left') text(L, x - 1.5, ty, s, { anchor: 'end' });
    else if (o.at === 'rotR') text(L, x + 3.2, (lo + hi) / 2, s, { rot: true });
    else text(L, x - 1, (lo + hi) / 2, s, { rot: true });
  }

  // 直径の寸法。中心 (cx, cy)、半径 r（用紙の mm）、向き ang（ラジアン）。文字は中心から tpos 進めた所に、線に沿って置く。
  function dimDia(L, cx, cy, r, ang, s, tpos) {
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    L.dim.append(lineEl(cx - r * dx, cy - r * dy, cx + r * dx, cy + r * dy));
    arrow(L, cx - r * dx, cy - r * dy, ang + Math.PI);
    arrow(L, cx + r * dx, cy + r * dy, ang);
    text(L, cx + tpos * dx + 1.1 * dy, cy + tpos * dy - 1.1 * dx, s, { deg: (ang * 180) / Math.PI, cls: 'dts' });
  }

  // 角度の寸法。中心 (cx, cy)、半径 r、a0 から a1 まで（用紙の向き、ラジアン）。
  function dimAng(L, cx, cy, r, a0, a1, s, o = {}) {
    const p0 = [cx + r * Math.cos(a0), cy + r * Math.sin(a0)];
    const p1 = [cx + r * Math.cos(a1), cy + r * Math.sin(a1)];
    let da = a1 - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da <= -Math.PI) da += 2 * Math.PI;
    const sweep = da > 0 ? 1 : 0;
    L.dim.append(pathEl(`M ${P2(p0)} A ${r2(r)} ${r2(r)} 0 0 ${sweep} ${P2(p1)}`, 'dl'));
    const am = (a0 + a1) / 2;
    const tr = r + (o.tr || 2.5);
    const [tx, ty] = o.pos || [cx + tr * Math.cos(am), cy + tr * Math.sin(am) + 1];
    text(L, tx, ty, s, { anchor: o.anchor || 'middle' });
  }

  // 引出線。点 (px, py) から文字の位置 (tx, ty) へ。
  function leader(L, px, py, tx, ty, s, anchor = 'end') {
    L.dim.append(lineEl(px, py, tx, ty));
    L.dim.append(circEl(px, py, 0.45, 'da'));
    text(L, tx + (anchor === 'end' ? -0.8 : 0.8), ty + 0.9, s, { anchor, cls: 'dts' });
  }

  // 高さの一覧。x に縦の線を引き、各高さ（用紙の y）に目盛と補助線を付け、右に文字を並べる。
  // 文字が重なるときは上下にずらし、目盛から折れ線でつなぐ。items は [y, 文字, 補助線の始点の x] の列。
  function ladder(L, x, items, gapMin = 3.6) {
    const ys = items.map((it) => it[0]);
    L.dim.append(lineEl(x, Math.min(...ys), x, Math.max(...ys)));
    const order = items.map((it, i) => i).sort((a, b) => items[b][0] - items[a][0]);
    const pos = [];
    let prev = Infinity;
    for (const i of order) {
      const want = items[i][0] + 1;
      const y = Math.min(want, prev - gapMin);
      pos[i] = y;
      prev = y;
    }
    items.forEach(([y, s, ex], i) => {
      L.dim.append(lineEl(x - 1.3, y + 1.3, x + 1.3, y - 1.3));
      if (ex != null) L.dim.append(lineEl(ex + 1, y, x + 2, y));
      const ty = pos[i];
      if (Math.abs(ty - (y + 1)) > 0.2) L.dim.append(plineEl([[x + 2, y], [x + 3.2, ty - 1], [x + 4, ty - 1]]));
      text(L, x + (Math.abs(ty - (y + 1)) > 0.2 ? 4.4 : 3), ty, s, { anchor: 'start' });
    });
  }

  function groundLine(L, x0, x1, y) {
    L.body.append(lineEl(x0, y, x1, y, 'gl'));
    for (let x = x0 + 2; x < x1 - 1; x += 3) L.body.append(lineEl(x, y, x - 2, y + 2, 'gt'));
    text(L, x0 + 1, y - 1.2, 'GL', { cls: 'tx', anchor: 'start' });
  }

  // 帯の形（用紙の点）。中心 c、半径 r0 から r1。gap があれば、z > 0（用紙では下）の |x| < gap を抜く。
  // 抜くときは多角形、抜かないときは 2 つの円を evenodd で塗る。
  function ringEl(cx, cy, r0, r1, gap, cls) {
    if (!gap) {
      const circ = (r) => `M ${r2(cx + r)} ${r2(cy)} A ${r2(r)} ${r2(r)} 0 1 0 ${r2(cx - r)} ${r2(cy)} A ${r2(r)} ${r2(r)} 0 1 0 ${r2(cx + r)} ${r2(cy)} Z`;
      const p = pathEl(`${circ(r1)} ${circ(r0)}`, cls);
      p.setAttribute('fill-rule', 'evenodd');
      return p;
    }
    const N = 96;
    const a1 = Math.acos(Math.min(1, gap / r1));
    const a0 = Math.acos(Math.min(1, gap / r0));
    const pts = [];
    for (let i = 0; i <= N; i++) {
      const a = a1 - (i / N) * (Math.PI + 2 * a1);
      pts.push([cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)]);
    }
    for (let i = 0; i <= N; i++) {
      const a = (-Math.PI - a0) + (i / N) * (Math.PI + 2 * a0);
      pts.push([cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)]);
    }
    return polyEl(pts, cls);
  }

  // ---------- 用紙の枠、表題欄、凡例、注記

  function patterns() {
    const pat = (id, w, h, kids) => e('pattern', { id, width: w, height: h, patternUnits: 'userSpaceOnUse' },
      [e('rect', { width: w, height: h, class: 'pbg' }), ...kids]);
    const dot = (x, y, r) => circEl(x, y, r, 'pd');
    return [
      // キャスタブル: 45 度の交差の斜線
      pat('dwg-p-cast', 1.5, 1.5, [pathEl('M0 1.5 L1.5 0 M0 0 L1.5 1.5', 'pl')]),
      // 耐火レンガ: 45 度の斜線
      pat('dwg-p-brick', 1.4, 1.4, [pathEl('M0 1.4 L1.4 0 M-0.4 0.4 L0.4 -0.4 M1 1.8 L1.8 1', 'pl')]),
      // パーライトとセメント: 細かい点
      pat('dwg-p-perl', 1.3, 1.3, [dot(0.33, 0.33, 0.17), dot(0.98, 0.98, 0.17)]),
      // 毛布: 波の線
      pat('dwg-p-blank', 2.4, 1.1, [pathEl('M0 0.55 Q0.6 0 1.2 0.55 T2.4 0.55', 'pl')]),
      // コンクリート: 点と小さな三角
      pat('dwg-p-conc', 3, 3, [pathEl('M0.4 1.1 L1.3 1.1 L0.85 0.3 Z', 'pl'), dot(2.1, 0.8, 0.2), dot(1.2, 2.2, 0.2), dot(2.5, 2.6, 0.15)]),
    ];
  }

  function frameEls(d) {
    const out = [
      e('rect', { x: 0, y: 0, width: SW, height: SH, class: 'paper' }),
      e('rect', { x: 10, y: 10, width: SW - 20, height: SH - 20, class: 'fr' }),
    ];
    const g = e('g', { class: 'tb' });
    const x0 = 240;
    const y0 = 245;
    const cell = (x, y, label, val, size) => {
      g.append(e('text', { x: x + 1.5, y: y + 2.7, class: 'tl', text: label }));
      g.append(e('text', { x: x + 1.5, y: y + (size > 4 ? 10 : 6.6), class: 'tv', style: `font-size:${size}px`, text: val }));
    };
    g.append(rectEl(x0, y0, x0 + 170, y0 + 42, 'tbl'));
    g.append(lineEl(x0, y0 + 13, x0 + 170, y0 + 13, 'tbl'));
    g.append(lineEl(x0, y0 + 21, x0 + 170, y0 + 21, 'tbl'));
    g.append(lineEl(x0, y0 + 29, x0 + 170, y0 + 29, 'tbl'));
    g.append(lineEl(x0 + 120, y0, x0 + 120, y0 + 13, 'tbl'));
    g.append(lineEl(x0 + 70, y0 + 13, x0 + 70, y0 + 29, 'tbl'));
    g.append(lineEl(x0 + 120, y0 + 13, x0 + 120, y0 + 21, 'tbl'));
    cell(x0, y0, '図名', d.title, 5);
    cell(x0 + 120, y0, '件名', 'パン窯 第一案', 3.2);
    cell(x0, y0 + 13, '図番', d.id, 3.2);
    cell(x0 + 70, y0 + 13, '尺度', '1:20（A3）', 3.2);
    cell(x0 + 120, y0 + 13, '単位', 'mm', 3.2);
    cell(x0, y0 + 21, '改訂', String(api.oven.revision), 3.2);
    cell(x0 + 70, y0 + 21, '日付', String(api.oven.date), 3.2);
    cell(x0, y0 + 29, '注記', '寸法の多くは仮に置いている（oven.json の status を見る）', 3.2);
    out.push(g);
    return out;
  }

  // 右下の凡例。材料の記号は、切り口を塗る図（平面図と断面図）だけに出す。
  function legendEls(withHatch) {
    const g = e('g', { class: 'lg' });
    const x0 = 322;
    let y = withHatch ? 150 : 200;
    const t = (x, yy, s, cls) => g.append(e('text', { x, y: yy, class: cls || 'tx', text: s }));
    t(x0, y, '線の種類', 'tv');
    y += 6;
    const items = [
      ['外形線', 'sh fn'],
      ['隠れ線（台の下、地面の下、切り口より上）', 'hid'],
      ['中心線と想像線（前掛け、凍結深度）', 'ctr'],
      ['継ぎ目と縄', 'sm'],
      ['寸法線と補助線', 'dlk'],
    ];
    for (const [label, cls] of items) {
      g.append(lineEl(x0, y - 1, x0 + 16, y - 1, cls));
      t(x0 + 19, y, label);
      y += 5.2;
    }
    if (withHatch) {
      y += 3;
      t(x0, y, '材料の記号（切り口）', 'tv');
      y += 3;
      const mats = [
        ['fcast', 'キャスタブル（ドーム）'],
        ['fbrick', '耐火レンガ（炉床、敷居、前室）'],
        ['fperl', 'パーライトとセメント（炉床の下）'],
        ['fblank', '毛布（ドームと扉の断熱）'],
        ['fsteel', '鋼（台、天板、殻、前室、扉）'],
        ['fconc', 'コンクリート（据え台と平板）'],
      ];
      for (const [cls, label] of mats) {
        g.append(rectEl(x0, y, x0 + 12, y + 5, `sh ${cls}`));
        t(x0 + 15, y + 3.8, label);
        y += 6.3;
      }
    }
    return g;
  }

  // 右上の注記。1 文を 1 行に書く。
  function notesEl(lines) {
    const g = e('g', { class: 'nt' });
    let y = 22;
    g.append(e('text', { x: 255, y, class: 'tv', text: '注記' }));
    y += 5;
    lines.forEach((s, i) => {
      g.append(e('text', { x: 255, y, class: 'nx', text: `${i + 1}. ${s}` }));
      y += 4.2;
    });
    return g;
  }

  function caption(s) {
    return e('text', { x: 20, y: 272, class: 'cap', text: s });
  }

  // ---------- 平面図 BO-DWG-001（炉床の面から PLAN_CUT だけ上で切り、上から見る）

  function drawPlan(L, M, defs) {
    const ox = 115;
    const oy = 112;
    const X = (x) => ox + x * S;
    const Z = (z) => oy + z * S;
    const rc = (x0, z0, x1, z1, cls) => rectEl(X(x0), Z(z0), X(x1), Z(z1), cls);
    const pz = (p) => [X(p[0]), Z(p[2])]; // 3 次元の点を平面図へ
    const yl = M.yFloor + PLAN_CUT - M.yc; // 切る高さの、ドームの足からの上がり
    const dwc = archHalf(M.dw, M.spring, yl);
    const cwc = archHalf(M.cw, M.spring, yl);

    // 天板の内と外で、台の線を隠れ線と外形線に分ける切り抜き
    const sx0 = X(-M.W / 2);
    const sx1 = X(M.W / 2);
    const sz0 = Z(M.zb);
    const sz1 = Z(M.zf);
    defs.append(e('clipPath', { id: 'dwg-cp-in' }, [e('rect', { x: r2(sx0), y: r2(sz0), width: r2(sx1 - sx0), height: r2(sz1 - sz0) })]));
    defs.append(e('clipPath', { id: 'dwg-cp-out' }, [e('path', {
      d: `M 0 0 H ${SW} V ${SH} H 0 Z M ${r2(sx0)} ${r2(sz0)} H ${r2(sx1)} V ${r2(sz1)} H ${r2(sx0)} Z`, 'clip-rule': 'evenodd',
    })]));
    const sq = (x, z, a) => [x - a / 2, z - a / 2, x + a / 2, z + a / 2];
    const rcA = (r, cls) => rc(r[0], r[1], r[2], r[3], cls);
    // 天板の下にもかかる物。天板の外は外形線、天板の下は隠れ線。
    const underSlab = (rects) => [clipG('dwg-cp-out', rects.map((r) => rcA(r, 'sh fp'))), clipG('dwg-cp-in', hidRects(rects, X, Z))];

    // 地面の下の風の留め（全ねじ、平板、受け材）
    const below = [];
    for (const a of M.anchors) {
      below.push(...hid(plineEl([pz(a.gP), pz(a.rodEnd)])));
      for (const s of a.slabs) below.push(...hid(polyEl(hull(s.map(pz)))));
      below.push(...hid(polyEl(hull(a.recv.map(pz)))));
    }
    part(L, 'anchor', below);
    // 据え台。穴は地面の下（隠れ線）、ピンコロは天板の外なら外形線。
    part(L, 'foundation', [
      ...hidRects(M.legs.map((g) => sq(g.x, g.z, M.pit)), X, Z),
      ...underSlab(M.legs.map((g) => sq(g.x, g.z, M.ps))),
    ]);
    // 脚の底板と、後ろの横梁の天板から出る所、脚の耳
    const lugs = M.anchors.map((a) => {
      const s0 = M.bm / 2;
      const p = (s, w) => [X(a.g.x + a.d[0] * s - a.d[1] * w), Z(a.g.z + a.d[1] * s + a.d[0] * w)];
      return polyEl([p(s0, -LUG_T / 2), p(s0 + LUG_OUT, -LUG_T / 2), p(s0 + LUG_OUT, LUG_T / 2), p(s0, LUG_T / 2)], 'sh fp');
    });
    part(L, 'stand', [
      ...underSlab(M.legs.map((g) => sq(g.x, g.z, M.fpw))),
      clipG('dwg-cp-out', [rc(-M.rearL / 2, M.rz - M.bm / 2, M.rearL / 2, M.rz + M.bm / 2, 'sh fp'), ...lugs]),
    ]);
    // 鎖とターンバックル（地面の上）。天板の下の所は隠れ線。
    const chains = [];
    for (const a of M.anchors) {
      const ln = plineEl([pz(a.lugP), pz(a.gP)], 'sh');
      chains.push(clipG('dwg-cp-out', [ln, hitOf(ln), polyEl(hull(a.tb.map(pz)), 'sh fp'), circEl(...pz(a.eye), EYE_R * S, 'sh fp')]));
      chains.push(clipG('dwg-cp-in', hid(plineEl([pz(a.lugP), pz(a.gP)]))));
    }
    part(L, 'anchor', chains);

    // 天板（継ぎ目は z = 0）
    part(L, 'slab', [rc(-M.W / 2, M.zb, M.W / 2, M.zf, 'sh fp'), lineEl(X(-M.W / 2), Z(0), X(M.W / 2), Z(0), 'sh tn')]);

    // 炉床の下の断熱（4 区画と前室の下の 1 枚）と縁の帯
    const q = M.q;
    const c = CHAMFER;
    const oct = [[-q, -q + c], [-q + c, -q], [q - c, -q], [q, -q + c], [q, q - c], [q - c, q], [-q + c, q], [-q, q - c]];
    const hs = STRIP_L / 2;
    part(L, 'hearthIns', [
      polyEl(oct.map(([x, z]) => [X(x), Z(z)]), 'sh fp'),
      lineEl(X(0), Z(-q), X(0), Z(q), 'sh tn'),
      lineEl(X(-q), Z(0), X(q), Z(0), 'sh tn'),
      rc(-hs, M.zBoard0, hs, M.zBoard1, 'sh fp'),
      rc(-M.hw - M.strip, -hs, -M.hw, hs, 'sh fp'),
      rc(M.hw, -hs, M.hw + M.strip, hs, 'sh fp'),
      rc(-hs, -M.hd - M.strip, hs, -M.hd, 'sh fp'),
      rc(-hs, M.hd, -M.sillW, M.zLF, 'sh fp'),
      rc(M.sillW, M.hd, hs, M.zLF, 'sh fp'),
    ]);
    // 炉床（6 列 × 3 個、列は前後の向き）
    const hearth = [rc(-M.hw, -M.hd, M.hw, M.hd, 'sh fp')];
    for (let i = 1; i < COLS; i++) hearth.push(lineEl(X(-M.hw + i * M.bw), Z(-M.hd), X(-M.hw + i * M.bw), Z(M.hd), 'sh tn'));
    for (let j = 1; j < ROWS; j++) hearth.push(lineEl(X(-M.hw), Z(-M.hd + j * M.bl), X(M.hw), Z(-M.hd + j * M.bl), 'sh tn'));
    part(L, 'hearth', hearth);
    // 敷居と前室の床（丸ごと 3 個と、前室の口の小片 3 個）
    const sill = [rc(-M.sillW, M.hd, M.sillW, M.zLF, 'sh fp')];
    for (let i = 1; i < SILL_COLS; i++) sill.push(lineEl(X(-M.sillW + i * M.bw), Z(M.hd), X(-M.sillW + i * M.bw), Z(M.zLF), 'sh tn'));
    sill.push(lineEl(X(-M.sillW), Z(M.hd + M.bl), X(M.sillW), Z(M.hd + M.bl), 'sh tn'));
    part(L, 'landing', sill);
    // 引き戸の下のレール（切り口より下）
    part(L, 'door', rc(M.railX0, M.zLeaf1 + RAIL_T - RAIL, M.railX1, M.zLeaf1 + RAIL_T, 'sh fp'));

    // 切り口。毛布、帯、ドーム、入口の枠。
    part(L, 'insulation', ringEl(X(0), Z(0), M.Ro * S, M.Rb * S, cwc * S, 'sh fblank'));
    const ears = [-1, 1].map((s) => rc(s * M.bandR1, -M.bandT * 1.5, s * (M.bandR1 + EAR_L), M.bandT * 1.5, 'sh fsteel'));
    part(L, 'band', [ringEl(X(0), Z(0), M.bandR0 * S, M.bandR1 * S, cwc * S, 'sh fsteel'), ...ears]);
    const collar = [-1, 1].map((s) => {
      const pts = [];
      const N = 12;
      for (let i = 0; i <= N; i++) {
        const x = dwc + ((cwc - dwc) * i) / N;
        pts.push([X(s * x), Z(Math.sqrt(Math.max(0, M.Ro * M.Ro - x * x)))]);
      }
      pts.push([X(s * cwc), Z(M.zCol)], [X(s * dwc), Z(M.zCol)]);
      return polyEl(pts, 'sh fcast');
    });
    part(L, 'chamber', [ringEl(X(0), Z(0), M.R * S, M.Ro * S, dwc * S, 'sh fcast'), ...collar]);
    // 継ぎ目。前と後ろの輪の継ぎ目（z = 0）は段付きで、内の半分を z = 0 に置く。入口の枠とドームの外面の継ぎ目。
    const seam = [];
    for (const s of [-1, 1]) {
      const rm = M.R + M.step;
      seam.push(...withHit(plineEl([[X(s * M.R), Z(0)], [X(s * rm), Z(0)], [X(s * rm), Z(-M.step)], [X(s * M.Ro), Z(-M.step)]], 'sm')));
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const x = dwc + ((cwc - dwc) * i) / 8;
        pts.push([X(s * x), Z(Math.sqrt(Math.max(0, M.Ro * M.Ro - x * x)))]);
      }
      seam.push(...withHit(plineEl(pts, 'sm')));
    }
    part(L, 'seam', seam);
    // 扉。差し込みの扉（入口の枠の前の面に面の板）と、前室の口の引き戸（閉）。
    part(L, 'door', [
      rc(-PLUG_W / 2, M.zCol - M.plug + FACE_T, PLUG_W / 2, M.zCol, 'sh fblank'),
      rc(-FACE_W / 2, M.zCol, FACE_W / 2, M.zCol + 0.002, 'sh fsteel'),
      rc(-M.leafW, M.zLF, M.leafW, M.zLeaf1 - M.pl, 'sh fblank'),
      rc(-M.leafW, M.zLeaf1 - M.pl, M.leafW, M.zLeaf1, 'sh fsteel'),
    ]);
    // 前室の袖（切り口）
    part(L, 'landing', [-1, 1].map((s) => rc(s * M.lpw, M.zCol, s * M.lo, M.zLF, 'sh fsteel')));
    // 殻の側と妻（切り口）。前の妻は前室の形に切り欠く。
    part(L, 'shell', [
      rc(-M.sw, -M.sw, M.sw, -M.si, 'sh fsteel'),
      rc(-M.sw, -M.si, -M.si, M.si, 'sh fsteel'),
      rc(M.si, -M.si, M.sw, M.si, 'sh fsteel'),
      rc(-M.sw, M.si, -M.cutW, M.sw, 'sh fsteel'),
      rc(M.cutW, M.si, M.sw, M.sw, 'sh fsteel'),
    ]);

    // 切り口より上にある物（隠れ線）。殻の屋根の外形と棟、ベント、前室の天板、ダンパー、煙突と H 笠。
    part(L, 'shell', [
      ...hidRects([[-M.rov, -M.rov, M.rov, M.rov]], X, Z),
      ...hid(lineEl(X(0), Z(-M.rov), X(0), Z(M.rov))),
    ]);
    part(L, 'vent', hidRects([[-M.vr - 0.03, -M.sw - VENT_OUT, M.vr + 0.03, -M.sw]], X, Z));
    part(L, 'landing', hidRects([[-M.lo, M.zCol, M.lo, M.zLF + M.lov]], X, Z));
    part(L, 'damper', hidRects([[-M.dpw, M.zDp0, M.dpw, M.zDp1]], X, Z));
    part(L, 'chimney', [...hid(circEl(X(0), Z(M.zCh), M.cr * S)), ...hidRects([[-HCAP_W / 2, M.zCh - M.cr, HCAP_W / 2, M.zCh + M.cr]], X, Z)]);

    // 天板の下の台（隠れ線）。側梁、横梁、根太、交点の当て板。脚は横梁の下にあるので、天板の外でも隠れ線。
    const st = [];
    for (const s of [-1, 1]) st.push([s * M.bx - M.sd / 2, M.sz0, s * M.bx + M.sd / 2, M.sz1]);
    st.push([-M.frontL / 2, M.fz - M.bm / 2, M.frontL / 2, M.fz + M.bm / 2]);
    st.push([-M.rearL / 2, M.rz - M.bm / 2, M.rearL / 2, M.rz + M.bm / 2]);
    for (const z of M.joistZ) st.push([-M.W / 2, z - M.jt / 2, M.W / 2, z + M.jt / 2]);
    for (const s of [-1, 1]) {
      const x0 = s * (M.bx - M.sd / 2);
      const x1 = s * (M.bx - M.sd / 2 - GUSSET_W);
      st.push([Math.min(x0, x1), M.fz + M.bm / 2 - GUSSET_L, Math.max(x0, x1), M.fz + M.bm / 2]);
      st.push([Math.min(x0, x1), M.rz - M.bm / 2, Math.max(x0, x1), M.rz - M.bm / 2 + GUSSET_L]);
    }
    part(L, 'stand', [clipG('dwg-cp-in', hidRects(st, X, Z)), ...hidRects(M.legs.map((g) => sq(g.x, g.z, M.bm)), X, Z)]);

    // 前掛け（焚く日だけ掛ける。想像線）
    const ap = rc(-M.apW, M.zf, M.apW, M.zf + M.apD, 'ctr');
    part(L, 'landing', [ap, hitOf(ap)]);

    // 中心線と切断線 A-A（x = 0 で切り、+x を見る）
    L.body.append(lineEl(X(0), Z(-1.28), X(0), Z(1.62), 'ctr'));
    L.body.append(lineEl(X(-0.95), Z(0), X(0.95), Z(0), 'ctr'));
    for (const z of [-1.36, 1.7]) {
      L.body.append(lineEl(X(0), Z(z) - 2, X(0), Z(z) + 2, 'cut'));
      L.body.append(lineEl(X(0), Z(z), X(0) + 4, Z(z), 'cutA'));
      L.dim.append(pathEl(`M ${P2([X(0) + 5.5, Z(z)], [X(0) + 3.2, Z(z) - 0.9], [X(0) + 3.2, Z(z) + 0.9])} Z`, 'da'));
      text(L, X(0) + 7.5, Z(z) + 1.2, 'A', { cls: 'tx', anchor: 'start' });
    }

    // 寸法。上に左右の寸法、左と右に前後の寸法。
    const rl = M.legs.filter((g) => !g.front);
    const fl = M.legs.find((g) => g.front);
    dimH(L, X(-M.hw), X(M.hw), Z(-0.92), `炉床の幅 ${mm(2 * M.hw)}`, { ext: [Z(-M.hd), Z(-M.hd)] });
    dimH(L, X(-M.sw), X(M.sw), Z(-1.02), `殻 ${mm(2 * M.sw)}（幅と奥行）`, { ext: [Z(-M.sw), Z(-M.sw)] });
    dimH(L, X(-M.W / 2), X(M.W / 2), Z(-1.12), `天板の幅 ${mm(M.W)}`, { ext: [Z(M.zb), Z(M.zb)] });
    dimH(L, X(rl[0].x), X(rl[1].x), Z(-1.22), `後ろの脚の間 ${mm(rl[1].x - rl[0].x)}`, { ext: [Z(M.rz), Z(M.rz)] });
    dimV(L, Z(M.zb), Z(M.zf), X(-0.62), `天板の奥行 ${mm(M.D)}`, { ext: [X(-M.W / 2), X(-M.W / 2)] });
    dimV(L, Z(rl[0].z), Z(fl.z), X(-0.74), `前の脚から後ろの脚まで ${mm(fl.z - rl[0].z)}`, { ext: [X(rl[0].x), X(fl.x)] });
    dimV(L, Z(-M.hd), Z(M.hd), X(0.58), `炉床の奥行 ${mm(2 * M.hd)}`, { ext: [X(M.hw), X(M.hw)] });
    dimV(L, Z(0), Z(M.zCh), X(0.70), `煙突の z ${mm(M.zCh)}`, { ext: [X(M.Rb), X(M.cr)] });
    // ドームと毛布の径（向きを変えて重ならないようにする）
    dimH(L, X(-M.R), X(M.R), Z(0), `内径 ${mm(2 * M.R)}`, { tx: X(-0.13) });
    dimDia(L, X(0), Z(0), M.Ro * S, Math.PI / 4, `外径 φ${mm(2 * M.Ro)}`, 7.5);
    dimDia(L, X(0), Z(0), M.Rb * S, -Math.PI / 4, `毛布の外 φ${mm(2 * M.Rb)}`, 10.5);
    // 前の風の留め（脚から外へ、z の向き）
    const fa = M.anchors.find((a) => a.g.front);
    const sGround = fa.gP[2] - fl.z;
    const sSlab = fa.sc[2] - fl.z;
    dimV(L, Z(fl.z), Z(fa.gP[2]), X(0.60), `全ねじが地面に入る所 ${mm(sGround)}（脚から外へ）`, { ext: [X(0.03), X(0.03)], at: 'right' });
    dimV(L, Z(fl.z), Z(fa.sc[2]), X(0.48), `平板 2 枚の中心 ${mm(sSlab)}`, { ext: [X(0.03), X(0.03)], at: 'right', ty: Z(fa.sc[2]) - 1.5 });
    const sl = fa.slabs[fa.slabs.length - 1].map(pz);
    const slx0 = Math.min(...sl.map((p) => p[0]));
    const slx1 = Math.max(...sl.map((p) => p[0]));
    const slz1 = Math.max(...sl.map((p) => p[1]));
    dimH(L, slx0, slx1, slz1 + 5, `平板 ${mm(M.aSlab)} 角（${M.aN} 枚、すきま ${mm(SLAB_GAP)}）`, { ext: [slz1, slz1], at: 'right' });
    L.extra.push(caption(`平面図（炉床の面から ${mm(PLAN_CUT)} mm 上で切る）  S=1:20`));
    L.extra.push(notesEl([
      `炉床の面から ${mm(PLAN_CUT)} mm 上の高さで切り、上から見る。`,
      '殻の屋根、ベント、前室の天板、ダンパー、煙突は切り口より上にあるので、隠れ線で描く。',
      '天板の下の台と、地面の下の据え台と風の留めも、隠れ線で描く。',
      '前掛けは焚く日だけ掛けるので、想像線で描く。',
      '引き戸は閉めた形で描き、レールに沿って右へ開く（開く向きは仮）。',
      `炉床のレンガは切らずに ${COLS} 列 × ${ROWS} 個に並べ、列を前後の向きに通す。`,
      '前と後ろの輪の継ぎ目は段付きで、内の半分を z = 0 に置く（段の向きは図で置いた）。',
      '前の帯は入口の枠の脇で止めて描く（焚き口の床を横切らせない）。',
    ]));
  }

  // ---------- 正面図 BO-DWG-002（前から見る。引き戸は閉めた形）

  function drawElev(L, M) {
    const ox = 115;
    const gy = 150;
    const X = (x) => ox + x * S;
    const Y = (y) => gy - y * S;
    const rc = (x0, y0, x1, y1, cls) => rectEl(X(x0), Y(y0), X(x1), Y(y1), cls);
    const pxy = (p) => [X(p[0]), Y(p[1])];
    const rear = M.legs.filter((g) => !g.front);
    const front = M.legs.find((g) => g.front);
    const ra = M.anchors.filter((a) => !a.g.front);
    const fa = M.anchors.find((a) => a.g.front);

    groundLine(L, X(-2.0), X(2.0), Y(0));
    const fr = lineEl(X(-2.0), Y(-M.frost), X(2.0), Y(-M.frost), 'ctr');
    part(L, 'frost', [fr, hitOf(fr)]);
    text(L, X(-1.98), Y(-M.frost) - 1, `凍結深度 ${mm(M.frost)}（地面から下へ）`, { anchor: 'start', cls: 'dts' });

    // 地面の下（隠れ線）。風の留めの全ねじ、平板、受け材と、据え台と砕石。
    const below = [];
    for (const a of M.anchors) {
      below.push(...hid(plineEl([pxy(a.gP), pxy(a.rodEnd)])));
      for (const s of a.slabs) below.push(...hid(polyEl(hull(s.map(pxy)))));
      below.push(...hid(polyEl(hull(a.recv.map(pxy)))));
    }
    part(L, 'anchor', below);
    part(L, 'foundation', [
      ...M.legs.map((g) => rc(g.x - M.ps / 2, 0, g.x + M.ps / 2, M.yPad, 'sh fp')),
      ...hidRects(M.legs.flatMap((g) => padBelow(M, g.x)), X, Y),
    ]);

    // 奥から手前へ描き、手前の形で奥の形を隠す。後ろの門形（脚 2 本、横梁、足、耳）。
    const back = [];
    for (const g of rear) back.push(...footEls(rc, g.x, M, 'fp'));
    for (const g of rear) back.push(rc(g.x - M.bm / 2, M.yLeg, g.x + M.bm / 2, M.yBb, 'sh fp'));
    back.push(rc(-M.rearL / 2, M.yBb, M.rearL / 2, M.ySb, 'sh fp'));
    for (const a of ra) {
      const s = Math.sign(a.g.x);
      const x0 = a.g.x + s * (M.bm / 2);
      const x1 = x0 + a.d[0] * LUG_OUT;
      back.push(rc(x0, M.lug - LUG_H / 2, x1, M.lug + LUG_H / 2, 'sh fp'));
    }
    part(L, 'stand', back);
    // 後ろの鎖、ターンバックル、アイナット
    const chain = (a) => {
      const ln = plineEl([pxy(a.lugP), pxy(a.gP)], 'sh');
      return [ln, hitOf(ln), polyEl(hull(a.tb.map(pxy)), 'sh fp'), circEl(...pxy(a.eye), EYE_R * S, 'sh fp')];
    };
    part(L, 'anchor', ra.map(chain));
    // 炉床の下の断熱の区画（殻の裾のすきまから見える）
    part(L, 'hearthIns', rc(-M.q, M.top, M.q, M.yInsTop, 'sh fp'));
    // 側梁の小口、前の横梁、根太、天板
    const mid = [];
    for (const s of [-1, 1]) mid.push(rc(s * M.bx - M.sd / 2, M.ySb, s * M.bx + M.sd / 2, M.yJb, 'sh fp'));
    mid.push(rc(-M.frontL / 2, M.yBb, M.frontL / 2, M.ySb, 'sh fp'));
    mid.push(rc(-M.W / 2, M.yJb, M.W / 2, M.yJt, 'sh fp'));
    part(L, 'stand', mid);
    part(L, 'slab', rc(-M.W / 2, M.yJt, M.W / 2, M.top, 'sh fp'));
    // 前の脚、足、耳、鎖
    part(L, 'stand', [
      ...footEls(rc, front.x, M, 'fp'),
      rc(front.x - M.bm / 2, M.yLeg, front.x + M.bm / 2, M.yBb, 'sh fp'),
      rc(front.x - LUG_T / 2, M.lug - LUG_H / 2, front.x + LUG_T / 2, M.lug + LUG_H / 2, 'sh fp'),
    ]);
    part(L, 'anchor', chain(fa));

    // 殻。前の妻（下に前室の形の切り欠き）と、勾配の屋根。
    const sw = M.sw;
    const gable = polyEl([[X(-sw), Y(M.yShell0)], [X(-sw), Y(M.eave)], [X(0), Y(M.ridge)], [X(sw), Y(M.eave)], [X(sw), Y(M.yShell0)]], 'sh fp');
    const notch = plineEl([
      [X(-M.cutLowW), Y(M.yShell0)], [X(-M.cutLowW), Y(M.yFloor)], [X(-M.cutW), Y(M.yFloor)], [X(-M.cutW), Y(M.cutTop)],
      [X(M.cutW), Y(M.cutTop)], [X(M.cutW), Y(M.yFloor)], [X(M.cutLowW), Y(M.yFloor)], [X(M.cutLowW), Y(M.yShell0)],
    ], 'sh tn');
    const dy = ROOF_T / Math.cos(M.pitch);
    const roof = polyEl([
      [X(-M.rov), Y(M.yEdge)], [X(0), Y(M.ridge)], [X(M.rov), Y(M.yEdge)],
      [X(M.rov), Y(M.yEdge + dy)], [X(0), Y(M.ridge + dy)], [X(-M.rov), Y(M.yEdge + dy)],
    ], 'sh fp');
    part(L, 'shell', [gable, notch, roof]);

    // 煙突と H 笠（ひとつの外形）、支持金具の帯
    const cr = M.cr;
    const hx = HCAP_W / 2;
    const yc0 = M.yCap0;
    const ycm0 = yc0 + (HCAP - 2 * cr) / 2;
    const ycm1 = ycm0 + 2 * cr;
    part(L, 'chimney', [
      polyEl([
        [X(-cr), Y(M.yChBase)], [X(-cr), Y(ycm0)], [X(-hx + 2 * cr), Y(ycm0)], [X(-hx + 2 * cr), Y(yc0)], [X(-hx), Y(yc0)],
        [X(-hx), Y(M.yChTop)], [X(-hx + 2 * cr), Y(M.yChTop)], [X(-hx + 2 * cr), Y(ycm1)], [X(hx - 2 * cr), Y(ycm1)],
        [X(hx - 2 * cr), Y(M.yChTop)], [X(hx), Y(M.yChTop)], [X(hx), Y(yc0)], [X(hx - 2 * cr), Y(yc0)], [X(hx - 2 * cr), Y(ycm0)],
        [X(cr), Y(ycm0)], [X(cr), Y(M.yChBase)],
      ], 'sh fp'),
      rc(-cr - 0.004, M.yBracket - BRACKET_W / 2, cr + 0.004, M.yBracket + BRACKET_W / 2, 'sh fp'),
    ]);
    // ダンパーの溝と差し板の小口
    part(L, 'damper', [
      ...[-1, 1].map((s) => rc(s * M.dpw, M.yRoofTop, s * (M.dpw + RAIL), M.yRoofTop + GROOVE, 'sh fp')),
      rc(-M.dpw, M.yRoofTop, M.dpw, M.yRoofTop + 0.0032, 'sh fp'),
    ]);
    // 前室の下の断熱の板、縁の帯、敷居と前室の床の小口
    const hs = STRIP_L / 2;
    part(L, 'hearthIns', [
      rc(-hs, M.top, hs, M.yInsTop, 'sh fp'),
      rc(-hs, M.yInsTop, -M.sillW, M.yFloor, 'sh fp'),
      rc(M.sillW, M.yInsTop, hs, M.yFloor, 'sh fp'),
    ]);
    const sill = [rc(-M.sillW, M.yInsTop, M.sillW, M.yFloor, 'sh fp')];
    for (let i = 1; i < SILL_COLS; i++) sill.push(lineEl(X(-M.sillW + i * M.bw), Y(M.yInsTop), X(-M.sillW + i * M.bw), Y(M.yFloor), 'sh tn'));
    // 前室の箱の前の面
    sill.push(rc(-M.lo, M.yFloor, M.lo, M.yRoofTop, 'sh fp'));
    part(L, 'landing', sill);
    // 引き戸（閉）とレール。焚き口は引き戸の奥にあるので隠れ線。
    const dw = M.dw;
    const yS = M.yc + M.spring;
    const arch = pathEl(`M ${P2([X(-dw), Y(M.yc)], [X(-dw), Y(yS)])} A ${r2(dw * S)} ${r2(dw * S)} 0 0 1 ${P2([X(dw), Y(yS)], [X(dw), Y(M.yc)])}`);
    part(L, 'door', [
      rc(-M.leafW, M.yLeaf0, M.leafW, M.yLeaf1, 'sh fp'),
      rc(M.railX0, M.yLeaf0 - RAIL_T, M.railX1, M.yLeaf0 - RAIL_T + RAIL, 'sh fp'),
      rc(M.railX0, M.yLeaf1 + RAIL_T - RAIL, M.railX1, M.yLeaf1 + RAIL_T, 'sh fp'),
    ]);
    part(L, 'chamber', hid(arch));
    // 前室の天板の水切り（いちばん手前）
    part(L, 'landing', rc(-M.lo, M.yRoofTop - FOLD, M.lo, M.yRoofTop, 'sh fp'));

    // 中心線
    L.body.append(lineEl(X(0), Y(-0.95), X(0), Y(M.yChTop + 0.12), 'ctr'));

    // 寸法。右に GL からの高さ。
    ladder(L, X(1.95), [
      [Y(0), 'GL 0', X(1.85)],
      [Y(M.yBb), `梁の下 GL+${mm(M.yBb)}（雪を下ろす目安）`, X(M.rearL / 2)],
      [Y(M.top), `天板の上面 GL+${mm(M.top)}`, X(M.W / 2)],
      [Y(M.yFloor), `炉床の面 GL+${mm(M.yFloor)}`, X(hs)],
      [Y(M.eave), `殻の軒 GL+${mm(M.eave)}`, X(M.sw)],
      [Y(M.ridge), `殻の棟 GL+${mm(M.ridge)}`, X(cr)],
      [Y(M.yChTop), `煙突の頂 GL+${mm(M.yChTop)}`, X(hx)],
    ]);
    // 地面の下。平板の土かぶり。
    const a1 = ra.find((a) => a.g.x > 0);
    dimV(L, Y(0), Y(-M.aDepth), X(1.95), `平板の土かぶり ${mm(M.aDepth)}`, { ext: [null, X(a1.upFace[0])], at: 'right' });
    // 鎖の角度。図の面に写した線の角度から円弧を描き、文字は鎖の向きの縦の面で測った値を書く。
    const gx = X(a1.gP[0]);
    const gyy = Y(0);
    const lx = X(a1.lugP[0]);
    const ly = Y(a1.lugP[1]);
    const aChain = Math.atan2(ly - gyy, lx - gx);
    dimAng(L, gx, gyy, 7, Math.PI, aChain, `鎖の角度 ${Math.round((M.angle * 180) / Math.PI)}°`, { pos: [gx + 2.5, gyy - 4], anchor: 'start' });
    // 焚き口と引き戸の幅と高さ
    dimH(L, X(-dw), X(dw), Y(M.yc + 0.05), `焚き口 ${mm(2 * dw)}`);
    dimV(L, Y(M.yc + M.dh), Y(M.yc), X(-0.28), `焚き口の高さ ${mm(M.dh)}`, { ext: [X(0), X(-dw)], at: 'left', ty: Y(M.yc + M.dh / 2) });
    dimH(L, X(-M.leafW), X(M.leafW), Y(M.yLeaf1 + 0.075), `引き戸の幅 ${mm(2 * M.leafW)}`, { ext: [Y(M.yLeaf1), Y(M.yLeaf1)], tx: X(-0.48), anchor: 'end' });
    dimV(L, Y(M.yLeaf1), Y(M.yLeaf0), X(-0.36), `引き戸の高さ ${mm(M.leafH)}`, { ext: [X(-M.leafW), X(-M.leafW)], at: 'left', ty: Y(M.yLeaf0) + 0.2 });
    L.extra.push(caption('正面図  S=1:20'));
    const tilt = Math.round((Math.atan2(Math.abs(a1.d[1]), Math.abs(a1.d[0])) * 180) / Math.PI);
    const seen = Math.round((Math.atan2(Math.tan(M.angle), Math.abs(a1.d[0])) * 180) / Math.PI);
    L.extra.push(notesEl([
      '前から見る。引き戸は閉めた形で描く。',
      '焚き口は引き戸の奥にあるので、隠れ線で描く。',
      '地面の下の据え台、砕石、全ねじ、平板、受け材は、隠れ線で描く。',
      `鎖の角度 ${Math.round((M.angle * 180) / Math.PI)}° は、鎖を含む縦の面で測る。`,
      `後ろの鎖はこの図の面から ${tilt}° 傾くので、図の上では ${seen}° に見える。`,
      '前の鎖は手前へ張るので、図の上では脚に重なる縦の線になる。',
    ]));
  }

  // ---------- 断面図 A-A BO-DWG-003（x = 0 の面で切り、+x を見る）

  function drawSect(L, M) {
    const ox = 95;
    const gy = 150;
    const X = (z) => ox + z * S;
    const Y = (y) => gy - y * S;
    const rc = (z0, y0, z1, y1, cls) => rectEl(X(z0), Y(y0), X(z1), Y(y1), cls);
    const pzy = (p) => [X(p[2]), Y(p[1])];
    const { R, H, t, yc } = M;
    // ドームの楕円の点。s は 0（後ろの足）から π（前の足）まで、o は内の面からの厚さの中の位置。
    const E = (o, s) => [X(-(R + o) * Math.cos(s)), Y(yc + (H + o) * Math.sin(s))];
    const arc = (o, s0, s1, n = 40) => Array.from({ length: n + 1 }, (_, i) => E(o, s0 + ((s1 - s0) * i) / n));
    const lat = M.lat;
    const lo = lat - M.lap; // 段の外の半分の緯度
    const st = M.step;
    const sDoorIn = Math.PI - Math.asin(Math.min(1, M.dh / H));
    const sDoorOut = Math.PI - Math.asin(Math.min(1, M.dh / (H + t)));
    const rear = M.legs.find((g) => !g.front && g.x > 0);
    const front = M.legs.find((g) => g.front);
    const ra = M.anchors.find((a) => !a.g.front && a.g.x > 0);
    const fa = M.anchors.find((a) => a.g.front);

    groundLine(L, X(-1.12), X(1.62), Y(0));

    // 風の留め。奥（右の後ろの脚）の物は、地面の上が外形線、地面の下が隠れ線。
    // 前の脚の物はこの面にあり、全ねじは切り口に出る。前の平板 2 枚はこの面をはさんで並ぶので、奥の 1 枚が隠れ線になる。
    const an = [];
    an.push(...hid(plineEl([pzy(ra.gP), pzy(ra.rodEnd)])));
    for (const s of ra.slabs) an.push(...hid(polyEl(hull(s.map(pzy)))));
    an.push(...hid(polyEl(hull(ra.recv.map(pzy)))));
    const farSlab = fa.slabs.reduce((b, s) => (s.reduce((v, p) => v + p[0], 0) > b.reduce((v, p) => v + p[0], 0) ? s : b));
    an.push(...hid(polyEl(hull(farSlab.map(pzy)))));
    an.push(polyEl(hull(fa.recv.map(pzy)), 'sh fsteel'));
    const rodF = plineEl([pzy(fa.gP), pzy(fa.rodEnd)], 'sh');
    an.push(rodF, hitOf(rodF));
    for (const a of [ra, fa]) {
      const ln = plineEl([pzy(a.lugP), pzy(a.gP)], 'sh');
      an.push(ln, hitOf(ln), polyEl(hull(a.tb.map(pzy)), 'sh fp'), circEl(...pzy(a.eye), EYE_R * S, 'sh fp'));
    }
    part(L, 'anchor', an);

    // 据え台。前の脚の物は切り口（穴と全ねじの先も出る）、後ろの脚の物は奥。
    part(L, 'foundation', [
      rc(rear.z - M.ps / 2, 0, rear.z + M.ps / 2, M.yPad, 'sh fp'),
      ...hidRects(padBelow(M, rear.z), X, Y),
      rc(front.z - M.pit / 2, M.yPad - M.ph - M.pg, front.z + M.pit / 2, M.yPad - M.ph, 'sh fn'),
      rc(front.z - M.ps / 2, M.yPad - M.ph, front.z + M.ps / 2, M.yPad, 'sh fconc'),
      rc(front.z - HOLE_R, M.yPad - HOLE_D, front.z + HOLE_R, M.yPad, 'sh fp'),
    ]);
    // 台。奥に見える物（右の後ろの脚と足と耳、右の側梁）を先に描き、切れた物を塗る。
    const sb = [];
    sb.push(rc(M.sz0, M.ySb, M.sz1, M.yJb, 'sh fp'));
    sb.push(...footEls(rc, rear.z, M, 'fp'));
    sb.push(rc(rear.z - M.bm / 2, M.yLeg, rear.z + M.bm / 2, M.yBb, 'sh fp'));
    const lz0 = rear.z + ra.d[1] * (M.bm / 2);
    sb.push(rc(lz0, M.lug - LUG_H / 2, lz0 + ra.d[1] * LUG_OUT, M.lug + LUG_H / 2, 'sh fp'));
    // 切れた物。前の脚と足、前の耳、前と後ろの横梁、根太。
    sb.push(rc(front.z - M.rod / 2, M.yPad - ROD_IN, front.z + M.rod / 2, M.yPad, 'sh fsteel'));
    sb.push(...footEls(rc, front.z, M, 'fsteel'));
    sb.push(rc(front.z - SLEEVE_R, M.yPlateBot, front.z + SLEEVE_R, M.yPlateBot + SLEEVE_L, 'sh fsteel'));
    sb.push(rc(front.z - M.bm / 2, M.yLeg, front.z + M.bm / 2, M.yBb, 'sh fsteel'));
    sb.push(rc(front.z + M.bm / 2, M.lug - LUG_H / 2, front.z + M.bm / 2 + LUG_OUT, M.lug + LUG_H / 2, 'sh fsteel'));
    for (const z of [front.z, M.rz]) sb.push(rc(z - M.bm / 2, M.yBb, z + M.bm / 2, M.ySb, 'sh fsteel'));
    for (const z of M.joistZ) sb.push(rc(z - M.jt / 2, M.yJb, z + M.jt / 2, M.yJt, 'sh fsteel'));
    part(L, 'stand', sb);
    // 天板 2 枚（継ぎ目は z = 0）と不織布
    part(L, 'slab', [
      rc(M.zb, M.yJt, 0, M.top, 'sh fsteel'),
      rc(0, M.yJt, M.zf, M.top, 'sh fsteel'),
      lineEl(X(M.zb), Y(M.top) - 0.25, X(M.zf), Y(M.top) - 0.25, 'sh tn'),
    ]);
    // 炉床の下の断熱（区画の継ぎ目は z = 0）、前室の下の板、後ろの縁の帯
    part(L, 'hearthIns', [
      rc(-M.q, M.top, 0, M.yInsTop, 'sh fperl'),
      rc(0, M.top, M.q, M.yInsTop, 'sh fperl'),
      rc(M.zBoard0, M.top, M.zBoard1, M.yInsTop, 'sh fperl'),
      rc(-M.hd - M.strip, M.yInsTop, -M.hd, M.yFloor, 'sh fperl'),
    ]);
    // 炉床（四角の前後の端、横の継ぎ目）
    const hearth = [rc(-M.hd, M.yInsTop, M.hd, M.yFloor, 'sh fbrick')];
    for (let j = 1; j < ROWS; j++) hearth.push(lineEl(X(-M.hd + j * M.bl), Y(M.yInsTop), X(-M.hd + j * M.bl), Y(M.yFloor), 'sh'));
    part(L, 'hearth', hearth);
    // 前室。奥の袖を先に描き（背景）、敷居と床、天井のレンガ、鋼板の天井と水切りを切り口で描く。
    part(L, 'landing', [
      rc(M.zCol, M.yFloor, M.zLF, M.yRoofTop, 'sh fp'),
      rc(M.hd, M.yInsTop, M.hd + M.bl, M.yFloor, 'sh fbrick'),
      rc(M.hd + M.bl, M.yInsTop, M.zLF, M.yFloor, 'sh fbrick'),
    ]);

    // 殻。奥の屋根の端（けらば）と、前の妻の切り欠きの上の奥に見える所を先に描き、切れた妻と棟を塗る。
    const sw = M.sw;
    const si = M.si;
    const shellK = [];
    for (const s of [-1, 1]) {
      shellK.push(plineEl([[X(s * sw), Y(M.yEdge)], [X(s * M.rov), Y(M.yEdge)], [X(s * M.rov), Y(M.ridge)]], 'sh fn'));
    }
    shellK.push(rc(si, M.yRoofTop, sw, M.cutTop, 'sh fp'));
    shellK.push(rc(-sw, M.yShell0, -si, M.yVent - M.vr, 'sh fsteel'));
    shellK.push(rc(-sw, M.yVent + M.vr, -si, M.ridge, 'sh fsteel'));
    shellK.push(rc(si, M.cutTop, sw, M.ridge, 'sh fsteel'));
    shellK.push(rc(-M.rov, M.ridge, M.rov, M.ridge + ROOF_T, 'sh fsteel'));
    part(L, 'shell', shellK);

    // 毛布（3 層）。後ろは炉床の面まで、前は入口の枠の上で止める。
    const sBo = Math.PI - Math.asin(Math.min(1, M.ch / (H + t + M.ins)));
    const sBi = Math.PI - Math.asin(Math.min(1, M.ch / (H + t)));
    const blanket = [
      [X(-(R + t)), Y(M.yFloor)], [X(-(R + t + M.ins)), Y(M.yFloor)],
      ...arc(t + M.ins, 0, sBo, 60), ...arc(t, sBi, 0, 60),
    ];
    const bl = [polyEl(blanket, 'sh fblank')];
    for (const k of [1, 2]) {
      const o = t + (M.ins * k) / 3;
      const sk = Math.PI - Math.asin(Math.min(1, M.ch / (H + o)));
      bl.push(plineEl([[X(-(R + o)), Y(M.yFloor)], ...arc(o, 0, sk, 60)], 'sh tn'));
    }
    part(L, 'insulation', bl);
    // 後ろの足元の帯
    part(L, 'band', rc(-M.bandR1, yc, -M.bandR0, yc + M.bandW, 'sh fsteel'));

    // ドームの 4 個。後ろの輪、蓋、前の輪（焚き口の上）、入口の枠。
    const backRing = [...arc(0, 0, lat, 30), E(st, lat), ...arc(st, lat, lo, 4), ...arc(t, lo, 0, 30)];
    const cap = [
      ...arc(0, lat, Math.PI - lat, 40), E(st, Math.PI - lat), ...arc(st, Math.PI - lat, Math.PI - lo, 4),
      ...arc(t, Math.PI - lo, lo, 40), E(st, lo), ...arc(st, lo, lat, 4),
    ];
    const frontRing = [...arc(0, sDoorIn, Math.PI - lat, 10), E(st, Math.PI - lat), ...arc(st, Math.PI - lat, Math.PI - lo, 4), ...arc(t, Math.PI - lo, sDoorOut, 10)];
    const zo = (y) => (R + t) * Math.cos(Math.asin(Math.min(1, y / (H + t))));
    const colArc = Array.from({ length: 9 }, (_, i) => {
      const y = M.dh + ((M.ch - M.dh) * i) / 8;
      return [X(zo(y)), Y(yc + y)];
    });
    const collar = [...colArc, [X(M.zCol), Y(yc + M.ch)], [X(M.zCol), Y(yc + M.dh)]];
    // 焚き口の奥の口の縁（右の半分を内から見る）
    const mouth = [];
    for (let i = 0; i <= 24; i++) {
      const f = i / 24;
      const len = M.spring + (Math.PI / 2) * M.dw;
      const sArc = f * len;
      let x;
      let y;
      if (sArc <= M.spring) { x = M.dw; y = sArc; } else { const ph = (sArc - M.spring) / M.dw; x = M.dw * Math.cos(ph); y = M.spring + M.dw * Math.sin(ph); }
      const z = R * Math.sqrt(Math.max(0, 1 - (x * x) / (R * R) - (y * y) / (H * H)));
      mouth.push([X(z), Y(yc + y)]);
    }
    part(L, 'chamber', [
      polyEl(backRing, 'sh fcast'), polyEl(cap, 'sh fcast'), polyEl(frontRing, 'sh fcast'), polyEl(collar, 'sh fcast'),
      plineEl(mouth, 'sh tn'),
    ]);
    // 継ぎ目。輪と蓋の段（前と後ろ）、入口の枠とドームの外面、ドームの足の下の縄、奥の内の面の継ぎ目（z = 0 と緯度の輪）。
    const stepPts = (s0, s1) => [E(0, s0), E(st, s0), ...arc(st, s0, s1, 4), E(t, s1)];
    const yIn = yc + H * Math.sin(lat);
    const zIn = R * Math.cos(lat);
    const seam = [
      ...withHit(plineEl(stepPts(lat, lo), 'sm')),
      ...withHit(plineEl(stepPts(Math.PI - lat, Math.PI - lo), 'sm')),
      ...withHit(plineEl(colArc, 'sm')),
      rc(-(R + t / 2) - ROPE_W / 2, M.yFloor, -(R + t / 2) + ROPE_W / 2, yc, 'smf'),
      ...withHit(lineEl(X(0), Y(yc), X(0), Y(yIn), 'sm tn')),
      ...withHit(lineEl(X(-zIn), Y(yIn), X(zIn), Y(yIn), 'sm tn')),
    ];
    part(L, 'seam', seam);

    // 頂部のベント（後ろの妻の頂、切り口）
    const vz0 = -si;
    const vz1 = -sw - 0.03;
    const vh = M.yVent + M.vr + 0.02;
    part(L, 'vent', [
      rc(vz1, M.yVent - M.vr - 0.002, vz0, M.yVent - M.vr + 0.002, 'sh fsteel'),
      rc(vz1, M.yVent + M.vr - 0.002, vz0, M.yVent + M.vr + 0.002, 'sh fsteel'),
      rc(-sw - VENT_OUT, vh - 0.002, -sw, vh + 0.002, 'sh fsteel'),
      rc(-sw - VENT_OUT, M.yVent - M.vr - 0.03, -sw - VENT_OUT + 0.004, vh + 0.002, 'sh fsteel'),
    ]);

    // 扉。差し込みの扉（毛布とケイカル板、ステンレスの面）と、引き戸（閉）とレール。
    const zr = M.zLeaf1 + RAIL_T;
    part(L, 'door', [
      rc(M.zCol - M.plug + FACE_T, M.yFloor, M.zCol, M.yFloor + PLUG_H, 'sh fblank'),
      rc(M.zCol, M.yFloor, M.zCol + 0.002, M.yFloor + FACE_H, 'sh fsteel'),
      rc(M.zLF, M.yLeaf0, M.zLeaf1 - M.pl, M.yLeaf1, 'sh fblank'),
      rc(M.zLeaf1 - M.pl, M.yLeaf0, M.zLeaf1, M.yLeaf1, 'sh fsteel'),
      polyEl([[X(zr - RAIL), Y(M.yLeaf0)], [X(zr - RAIL_T), Y(M.yLeaf0)], [X(zr - RAIL_T), Y(M.yLeaf0 - RAIL_T + RAIL)], [X(zr), Y(M.yLeaf0 - RAIL_T + RAIL)], [X(zr), Y(M.yLeaf0 - RAIL_T)], [X(zr - RAIL), Y(M.yLeaf0 - RAIL_T)]], 'sh fsteel'),
      polyEl([[X(zr - RAIL), Y(M.yLeaf1)], [X(zr - RAIL_T), Y(M.yLeaf1)], [X(zr - RAIL_T), Y(M.yLeaf1 + RAIL_T - RAIL)], [X(zr), Y(M.yLeaf1 + RAIL_T - RAIL)], [X(zr), Y(M.yLeaf1 + RAIL_T)], [X(zr - RAIL), Y(M.yLeaf1 + RAIL_T)]], 'sh fsteel'),
    ]);
    // 前室の天井（薄いレンガと鋼板。煙突の口を切り欠く）と水切り
    const zh0 = M.zCh - M.cr;
    const zh1 = M.zCh + M.cr;
    const zTop1 = M.zLF + M.lov;
    part(L, 'landing', [
      rc(M.zCol, M.yCeil, zh0, M.yRoofIn, 'sh fbrick'),
      rc(zh1, M.yCeil, M.zLF, M.yRoofIn, 'sh fbrick'),
      rc(M.zCol, M.yRoofIn, zh0, M.yRoofTop, 'sh fsteel'),
      rc(zh1, M.yRoofIn, zTop1, M.yRoofTop, 'sh fsteel'),
      rc(zTop1 - M.pl, M.yRoofTop - FOLD, zTop1, M.yRoofTop, 'sh fsteel'),
    ]);
    // ダンパー。奥の溝（L25）と、切れた差し板。
    part(L, 'damper', [
      rc(M.zDp0, M.yRoofTop, M.zDp1, M.yRoofTop + GROOVE, 'sh fp'),
      rc(M.zDp0, M.yRoofTop, M.zDp1, M.yRoofTop + 0.0032, 'sh fsteel'),
    ]);
    // 煙突。奥の H 笠の縦の管、切れた管の壁と横の管、支持金具。
    const cz = M.zCh;
    const ycm = M.yCap0 + HCAP / 2;
    part(L, 'chimney', [
      rc(cz - M.cr, M.yCap0, cz + M.cr, M.yChTop, 'sh fp'),
      rc(cz - M.cr, M.yChBase, cz + M.cr, ycm - M.cr, 'hitf'),
      rc(cz - M.cr - 0.004, M.yChBase, cz - M.cr, ycm - M.cr, 'fi'),
      rc(cz + M.cr, M.yChBase, cz + M.cr + 0.004, ycm - M.cr, 'fi'),
      circEl(X(cz), Y(ycm), M.cr * S, 'sh fn'),
      rc(sw, M.yBracket - BRACKET_W / 2, cz - M.cr - 0.004, M.yBracket + BRACKET_W / 2, 'sh fsteel'),
    ]);

    // 窯の中心線
    L.body.append(lineEl(X(0), Y(-0.15), X(0), Y(M.ridge + 0.1), 'ctr'));

    // 寸法。ドームの中に内高と、輪と蓋の継ぎ目の高さと緯度。
    const latDeg = Math.round((lat * 180) / Math.PI);
    dimV(L, Y(yc + H), Y(yc), X(0.05), `内高 ${mm(H)}`, { at: 'rotR' });
    dimV(L, Y(yIn), Y(yc), X(0.16), mm(H * Math.sin(lat)), { ext: [X(zIn), null], at: 'right' });
    L.dim.append(lineEl(X(0), Y(yc), ...E(0, lat)));
    dimAng(L, X(0), Y(yc), 0.2 * S, Math.PI, Math.PI + lat, `${latDeg}°`, { pos: [X(-0.125), Y(yc + 0.045)] });
    // 右に高さの連続寸法（台、断熱、炉床）
    const col = X(1.95);
    L.dim.append(lineEl(col, Y(0), col, Y(M.yFloor)));
    const lv = [[0, null, 'GL'], [M.top, X(M.zf), `台 ${mm(M.top)}`], [M.yInsTop, X(M.zBoard1), `断熱 ${mm(M.hi)}`], [M.yFloor, X(M.zLF), `炉床 ${mm(M.th)}`]];
    lv.forEach(([y, ex], i) => {
      L.dim.append(lineEl(col - 1.3, Y(y) + 1.3, col + 1.3, Y(y) - 1.3));
      // 炉床の面の補助線は、前室の高さの一覧の文字を避けてその右から引く。
      if (ex != null) L.dim.append(lineEl((y === M.yFloor ? X(1.25) : ex) + 1, Y(y), col + 2, Y(y)));
      if (i > 0) text(L, col + 3, (Y(lv[i - 1][0]) + Y(y)) / 2 + 1, lv[i][2], { anchor: 'start' });
    });
    // 前室の内のりと扉の高さ（炉床の面からの高さの一覧）
    ladder(L, X(0.86), [
      [Y(M.yFloor), '炉床の面 0', X(M.zLeaf1 + RAIL_T)],
      [Y(M.yFloor + FACE_H), `差し込みの扉の面 ${mm(FACE_H)}`, X(M.zCol + 0.002)],
      [Y(M.yCeil), `内のり ${mm(M.lph)}（薄いレンガの下）`, X(M.zLF)],
      [Y(M.yRoofIn), `鋼板の天井 ${mm(M.yRoofIn - M.yFloor)}`, X(zTop1)],
    ], 3.4);
    dimH(L, X(M.zCol), X(M.zCol + M.lpd), Y(M.yFloor + 0.05), `内のり ${mm(M.lpd)}`, { tx: X(M.zCol + M.lpd / 2) + 0.5 });

    // 引出線。後ろの側（左）に層と台と据え台、前の側（右）に扉と前室と煙突。点の高さの順に並べ、線を交えない。
    const LX = X(-0.66);
    const lead = (p, ty, s) => leader(L, p[0], p[1], LX, ty, s, 'end');
    lead([X(-sw - VENT_OUT + 0.002), Y(M.yVent)], 58, `頂部のベント φ${mm(2 * M.vr)}`);
    lead([X(-sw + 0.005), Y(1.25)], 64, '殻（L25 の枠と塗った鋼板）');
    lead(E(t / 2, 1.15), 70, '蓋（キャスタブル）');
    lead(E(st, lat - M.lap / 2), 76, '輪と蓋の継ぎ目（段付き）');
    lead(E(t + M.ins * 0.5, 0.55), 82, `毛布 ${mm(M.ins)}（25 × 3 層）`);
    lead(E(t / 2, 0.3), 88, `後ろの輪（キャスタブル、厚さ ${mm(t)}）`);
    lead([X(-(M.Rb + M.si) / 2), Y(yc + 0.02)], 94, `すきま ${mm(M.si - M.Rb)}`);
    lead([X(-M.bandR1 + 0.001), Y(yc + M.bandW / 2)], 100, '足元の帯（平鋼 3 × 40）');
    lead([X(-(R + t / 2)), Y(M.yFloor + M.seat / 2)], 106, `縄（圧して ${mm(M.seat)}）`);
    lead([X(-M.hd - M.strip / 2), Y(M.yInsTop + M.th / 2)], 112, `縁の帯 ${mm(M.th)}（パーライトとセメント）`);
    lead([X(-0.21), Y(M.top + M.hi / 2)], 118, '断熱の板（セメントとパーライト 1:5）');
    lead([X(-0.45), Y(M.top) - 0.25], 124, `不織布と天板（鋼板 ${(M.dk * 1000).toFixed(1)}）`);
    lead([X(M.rz), Y((M.yBb + M.ySb) / 2)], 130, `台（${mm(M.bm)} 角と ${mm(M.jt)} 角）`);
    lead([X(rear.z), Y(M.yPlateBot - 0.05)], 136, `足（全ねじ M${mm(M.rod)}）`);
    lead([X(rear.z), Y(M.yPad - 0.02)], 142, `据え台（ピンコロ ${mm(M.ps)} 角）`);
    const RX = X(1.02);
    const leadR = (p, ty, s) => leader(L, p[0], p[1], RX, ty, s, 'start');
    const sFr = Math.PI - (lo + Math.asin(Math.min(1, M.dh / (H + t / 2)))) / 2;
    leadR([X(cz + M.cr), Y(M.yChTop - 0.03)], 40, 'H 笠（中に火の粉止め）');
    leadR([X(cz + M.cr + 0.002), Y(1.70)], 47, `煙突 φ${mm(2 * M.cr)}`);
    leadR([X((sw + cz - M.cr) / 2), Y(M.yBracket)], 54, '支持金具（殻の前の妻の枠に留める）');
    leadR([X(M.zDp1 - 0.02), Y(M.yRoofTop + 0.002)], 61, 'ダンパー（差し板、前へ引いて開ける）');
    leadR([X(M.zCol + 0.03), Y((M.yCeil + M.yRoofIn) / 2)], 68, `天井の薄いレンガ ${mm(LINER)}、縞鋼板 ${(M.pl * 1000).toFixed(1)}`);
    leadR(E(t / 2, sFr), 75, '前の輪（キャスタブル）');
    leadR([X((zo(M.ch) + M.zCol) / 2), Y(yc + (M.dh + M.ch) / 2)], 82, '入口の枠（キャスタブル）');
    leadR([X(M.zLeaf1 - 0.01), Y(M.yLeaf0 + 0.04)], 116, `引き戸（閉と ${M.stops} 段で止める）`);
    leadR([X(zr - 0.005), Y(M.yLeaf0 - 0.01)], 122, 'レール L25（上と下）');
    leadR([X(M.zLF - 0.04), Y(M.yInsTop + 0.02)], 128, '敷居と前室の床（耐火レンガ）');
    leadR([X(M.zCol - M.plug / 2), Y(M.yFloor + 0.03)], 134, '差し込みの扉（焼くときに閉める）');
    leadR([X(fa.sc[2]), Y(fa.sc[1])], 165, `風の留め（平板 ${mm(M.aSlab)} 角 ${M.aN} 枚、全ねじ M16、鎖 ${Math.round((M.angle * 180) / Math.PI)}°）`);
    L.extra.push(caption('断面図 A-A（x = 0）  S=1:20'));
    L.extra.push(notesEl([
      'x = 0 の面（焚き口の軸）で切り、+x の向きを見る。',
      'ドームは 4 個（後ろの輪、前の輪、蓋、入口の枠）に分けて流し、まとめてドームとして選ぶ。',
      `輪と蓋の継ぎ目は段付きで、内の半分を緯度 ${latDeg}° に置き、外の半分を ${mm(st)} mm 下げる（下げる長さは図で置いた）。`,
      '奥の内の面に見える赤の線は、前と後ろの輪の継ぎ目（z = 0）と、輪と蓋の継ぎ目である。',
      '前の帯は焚き口を横切らないので、この面には出ない。',
      '前の風の留めの平板 2 枚はこの面をはさんで左右に並ぶので、奥の 1 枚を隠れ線で描く。',
      '地面の下で切り口より奥にある物は、隠れ線で描く。',
    ]));
  }

  const DRAWINGS = [
    { id: 'BO-DWG-001', name: '平面図', title: '平面図', draw: drawPlan, hatch: true },
    { id: 'BO-DWG-002', name: '正面図', title: '正面図', draw: drawElev, hatch: false },
    { id: 'BO-DWG-003', name: '断面図 A-A', title: '断面図 A-A', draw: drawSect, hatch: true },
  ];

  // ---------- 画面

  const CSS = `
#mode-dwg .stage { background: var(--paper-2); }
#mode-dwg svg .paper { fill: var(--dwg-paper); }
#mode-dwg svg .fr { fill: none; stroke: var(--dwg-ink); stroke-width: .5; }
#mode-dwg svg .sh { stroke: var(--dwg-ink); stroke-width: .35; stroke-linejoin: round; }
#mode-dwg svg .tn { stroke-width: .15; }
#mode-dwg svg .hid { stroke: var(--dwg-ink); stroke-width: .2; stroke-dasharray: 2 1; fill: none; pointer-events: none; }
#mode-dwg svg .ctr { stroke: var(--dwg-ink); stroke-width: .18; stroke-dasharray: 8 1.2 1.2 1.2; fill: none; pointer-events: none; }
#mode-dwg svg .cut { stroke: var(--dwg-ink); stroke-width: .7; }
#mode-dwg svg .cutA { stroke: var(--dwg-dim); stroke-width: .25; }
#mode-dwg svg .sm { stroke: var(--line-heat); stroke-width: .35; fill: none; }
#mode-dwg svg .sm.tn { stroke-width: .2; }
#mode-dwg svg .smf { fill: var(--line-heat); stroke: none; }
#mode-dwg svg .hit { fill: none; stroke: transparent; stroke-width: 2.4; pointer-events: stroke; }
#mode-dwg svg .gl { stroke: var(--dwg-ink); stroke-width: .7; }
#mode-dwg svg .gt { stroke: var(--dwg-ink); stroke-width: .18; }
#mode-dwg svg .dl { stroke: var(--dwg-dim); stroke-width: .16; fill: none; pointer-events: none; }
#mode-dwg svg .dlk { stroke: var(--dwg-dim); stroke-width: .16; fill: none; }
#mode-dwg svg .da { fill: var(--dwg-dim); stroke: none; }
#mode-dwg svg .dt, #mode-dwg svg .dts { fill: var(--dwg-dim); font-size: 2.8px; stroke: var(--dwg-paper); stroke-width: .8px; paint-order: stroke; stroke-linejoin: round; pointer-events: none; }
#mode-dwg svg .dts { font-size: 2.4px; stroke-width: .7px; }
#mode-dwg svg .tx { fill: var(--dwg-ink); font-size: 2.8px; pointer-events: none; }
#mode-dwg svg .nx { fill: var(--dwg-ink); font-size: 2.6px; pointer-events: none; }
#mode-dwg svg .tl { fill: var(--dwg-ink); font-size: 2px; opacity: .7; }
#mode-dwg svg .tv { fill: var(--dwg-ink); font-size: 3.2px; }
#mode-dwg svg .cap { fill: var(--dwg-ink); font-size: 5px; font-weight: 700; }
#mode-dwg svg .tbl { fill: none; stroke: var(--dwg-ink); stroke-width: .35; }
#mode-dwg svg .fp { fill: var(--dwg-paper); }
#mode-dwg svg .fn { fill: none; }
#mode-dwg svg .fi { fill: var(--dwg-ink); stroke: none; }
#mode-dwg svg .hitf { fill: transparent; stroke: none; }
#mode-dwg svg .fsteel { fill: var(--dwg-ink); fill-opacity: .5; }
#mode-dwg svg .fcast { fill: url(#dwg-p-cast); }
#mode-dwg svg .fbrick { fill: url(#dwg-p-brick); }
#mode-dwg svg .fperl { fill: url(#dwg-p-perl); }
#mode-dwg svg .fblank { fill: url(#dwg-p-blank); }
#mode-dwg svg .fconc { fill: url(#dwg-p-conc); }
#mode-dwg svg .pbg { fill: var(--dwg-paper); }
#mode-dwg svg .pl { stroke: var(--dwg-ink); stroke-width: .12; fill: none; }
#mode-dwg svg .pd { fill: var(--dwg-ink); stroke: none; }
#mode-dwg svg .hl { stroke-width: 1px; }
#mode-dwg svg g.pt:focus-visible { outline: none; }
#mode-dwg svg g.pt:focus-visible .sh, #mode-dwg svg g.pt:focus-visible .hid, #mode-dwg svg g.pt:focus-visible .sm { stroke: var(--hl); stroke-width: 1px; }
#mode-dwg .note-sw { display: inline-block; width: 14px; height: 10px; border: 1px solid var(--rule); vertical-align: middle; margin-right: 6px; }
`;

  const side = api.$('#dwg-side');
  const stage = api.$('#dwg-stage');
  const noteEl = api.$('#dwg-note');
  noteEl.textContent = '寸法は oven.json から描く。値の多くは仮に置いている。A3 に印刷したときの尺度は 1:20 になる。';
  document.head.append(api.el('style', { text: CSS }));

  let M;
  try { M = model(); } catch (err) { console.error(err); return null; }

  const svg = e('svg', { viewBox: BOX.join(' '), role: 'img', 'aria-label': '図面' });
  stage.append(svg);
  let pz = null;
  let cur = DEFAULT_ID;
  let built = null;
  let shown = [];

  function build(id) {
    const d = DRAWINGS.find((x) => x.id === id) || DRAWINGS[2];
    cur = d.id;
    const L = { body: e('g'), dim: e('g', { class: 'dl' }), txt: e('g'), extra: [] };
    const defs = e('defs', {}, patterns());
    d.draw(L, M, defs);
    const frame = frameEls(d);
    svg.setAttribute('aria-label', `${d.id} ${d.title}`);
    svg.replaceChildren(defs, frame[0], frame[1], L.body, L.dim, L.txt, ...L.extra, legendEls(d.hatch), frame[2]);
    shown = ORDER.filter((p) => svg.querySelector(`[data-part="${p}"]`));
    if (pz) pz.reset(BOX);
    else pz = api.panZoom(svg, stage, BOX);
    built = d.id;
    renderSide();
    paint(api.sel, {});
  }

  function renderSide() {
    const kids = [api.el('h2', { text: '図面' })];
    for (const d of DRAWINGS) {
      const b = api.el('button', { type: 'button', class: 'row', 'aria-pressed': String(d.id === cur), 'data-d': d.id }, [
        api.el('span', { class: 'code', text: d.id }),
        api.el('span', { text: d.name }),
      ]);
      b.onclick = () => {
        if (d.id === cur) return;
        build(d.id);
        api.writeUrl(true);
      };
      kids.push(b);
    }
    kids.push(api.el('h2', { text: 'この図に出る部品' }));
    for (const id of shown) {
      const b = api.el('button', { type: 'button', class: 'row', 'data-pid': id, text: nameOf(id) });
      b.onclick = () => api.select('part', id, { push: true, reveal: true });
      kids.push(b);
    }
    side.replaceChildren(...kids);
  }

  // 選んだものに関係する部品の形を光らせ、ほかを薄くする。
  function paint(sel, opts) {
    if (!built) return;
    const rel = api.related(sel);
    const on = !!(sel && sel.kind);
    const groups = [...svg.querySelectorAll('g[data-part]')];
    const any = on && groups.some((g) => rel.parts.has(g.dataset.part));
    for (const g of groups) {
      const hit = on && rel.parts.has(g.dataset.part);
      g.classList.toggle('dim', any && !hit);
      g.querySelectorAll('.sh, .hid, .sm, .smf, .fi, .ctr').forEach((n) => n.classList.toggle('hl', hit));
    }
    side.querySelectorAll('[data-pid]').forEach((b) => {
      const hit = on && rel.parts.has(b.dataset.pid);
      b.classList.toggle('sel', hit);
      b.classList.toggle('dim', any && !hit);
    });
    if (opts && opts.reveal && any && pz) {
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const g of groups) {
        if (!rel.parts.has(g.dataset.part)) continue;
        const b = g.getBBox();
        if (!b.width && !b.height) continue;
        x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height);
      }
      if (x0 < Infinity) pz.reveal(x0, y0, x1 - x0, y1 - y0, false);
    }
  }

  svg.addEventListener('click', (ev) => {
    const g = ev.target.closest('[data-part]');
    if (g) api.select('part', g.dataset.part, { push: true });
  });
  svg.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const g = ev.target.closest && ev.target.closest('[data-part]');
    if (!g) return;
    ev.preventDefault();
    api.select('part', g.dataset.part, { push: true });
  });
  svg.addEventListener('pointermove', (ev) => {
    const g = ev.target.closest && ev.target.closest('[data-part]');
    api.tip(g ? nameOf(g.dataset.part) : null, ev.clientX, ev.clientY);
  });
  svg.addEventListener('pointerleave', () => api.tip(null));

  return {
    enter(params) {
      const want = params && DRAWINGS.some((d) => d.id === params.d) ? params.d : null;
      if (!built || (want && want !== cur)) build(want || cur);
    },
    leave() { api.tip(null); },
    params() { return { d: cur }; },
    highlight(sel, opts) { paint(sel, opts); },
    escape() { return false; },
  };
});
