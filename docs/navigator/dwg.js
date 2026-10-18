// 図面モード。平面図、正面図、断面図を、oven.json の寸法から SVG で描く。
// 形の決め方は docs/viewer/main.js の build() と同じ式を使う（dome だけ）。
// 用紙は A3 横（420 x 297、単位は用紙上の mm）、尺度 1:20 なので模型の 1 m は用紙の 50 mm。
NavApp.register('dwg', (api) => {
  'use strict';

  const S = 50;
  const SW = 420;
  const SH = 297;
  const BOX = [0, 0, SW, SH];
  const DEFAULT_ID = 'BO-DWG-003';
  const ORDER = ['foundation', 'stand', 'slab', 'hearthIns', 'hearth', 'chamber', 'mass', 'insulation', 'shell', 'landing', 'door', 'chimney', 'hood', 'vent', 'roof', 'wood'];

  // ---------- 小さな道具

  const e = (tag, a, k) => api.el('svg:' + tag, a || {}, k || []);
  const r2 = (v) => Math.round(v * 100) / 100;
  const mm = (v) => String(Math.round(v * 1000));
  const P2 = (...pts) => pts.map((p) => `${r2(p[0])} ${r2(p[1])}`).join(' ');

  // 半楕円の弧。始点と終点が同じ高さなので、頂を通る 2 つの 4 分弧に分けて向きの曖昧さをなくす。
  // 左から右へ（sweep 1）か右から左へ（sweep 0）。(xa, y) から (xb, y) まで、半径 rx、ry（用紙の mm）。
  const halfArc = (xa, xb, y, rx, ry, sweep) => {
    const xm = (xa + xb) / 2;
    return `A ${r2(rx)} ${r2(ry)} 0 0 ${sweep} ${P2([xm, y - ry])} A ${r2(rx)} ${r2(ry)} 0 0 ${sweep} ${P2([xb, y])}`;
  };
  const pathEl = (d, cls) => e('path', { d, class: cls });
  const lineEl = (x1, y1, x2, y2, cls) => e('line', { x1: r2(x1), y1: r2(y1), x2: r2(x2), y2: r2(y2), class: cls });
  const circEl = (cx, cy, r, cls) => e('circle', { cx: r2(cx), cy: r2(cy), r: r2(r), class: cls });
  const rectEl = (xa, ya, xb, yb, cls) => e('rect', {
    x: r2(Math.min(xa, xb)), y: r2(Math.min(ya, yb)), width: r2(Math.abs(xb - xa)), height: r2(Math.abs(yb - ya)), class: cls,
  });
  const hitOf = (el) => { const c = el.cloneNode(false); c.setAttribute('class', 'hit'); return c; };
  // 隠れ線。細い線は押しにくいので、見えない太い線を重ねる。
  const hid = (el) => { el.setAttribute('class', 'hid'); return [el, hitOf(el)]; };

  // ---------- 図にだけ使う小さな寸法（構造設計の部材の表の値。oven.json に鍵が無い）

  const DECK_COLS = 3; // 天板の縞鋼板を左右に並べる枚数
  const DECK_ROWS = 2; // 天板の縞鋼板を前後に並べる枚数
  const DECK_GAP = 0.002; // 縞鋼板どうしのすきま
  const SHIM = 0.0128; // 敷き板 3.2 mm を 4 枚重ねた厚さ
  const SHIM_W = 0.098; // 敷き板の辺
  const NUT_H = 0.016; // M20 のナットの高さ
  const NUT_R = 0.017; // M20 のナットの半径
  const PL = 0.006; // 方杖の上の板、当て板、吊り板の厚さ
  const BR_PLATE_W = 0.10; // 方杖の上の板の左右の幅
  const BR_PLATE_D = 0.12; // 方杖の上の板の前後の長さ
  const TAB_W = 0.13; // 当て板の左右の幅
  const HANG_W = 0.10; // 吊り板の左右の幅
  const HANG_BELOW = 0.045; // ピンの中心から吊り板の下端まで
  const STOP_W = 0.10; // 止めの左右の幅
  const SLEEVE_R = 0.0136; // ピンのさや管の半径（SGP 20A）
  const SLEEVE_L = 0.060; // ピンのさや管の長さ
  const PIN_R = 0.010; // ピン（M20）の半径
  const PIN_L = 0.10; // ピンの長さ
  const WOOD_TOP = 0.40; // 薪を積む高さの上限

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

  // ---------- 寸法を読む（viewer/main.js の build() と同じ式）

  function model() {
    const pr = api.oven.params;
    const P = (k) => {
      if (!pr[k] || pr[k].v == null) throw new Error(`oven.json に ${k} がありません`);
      return pr[k].v;
    };
    const m = {};
    // 高さの基準。炉床の断熱、炉床、ドームは天板の上面から積む。
    m.yInsBase = P('table.top');
    m.hi = P('hearth.insulation');
    m.yInsTop = m.yInsBase + m.hi;
    m.th = P('hearth.firebrick');
    m.yFloor = m.yInsTop + m.th;
    m.t = P('wall.firebrick');
    m.ins = P('insulation.thickness');
    m.shT = P('shell.thickness');
    m.lw = P('landing.wall');
    m.landingDepth = P('landing.depth');
    m.R = P('dome.inner_diameter') / 2;
    m.H = P('dome.inner_height');
    m.ms = P('dome.mass');
    m.offs = [0, m.t, m.t + m.ms, m.t + m.ms + m.ins, m.t + m.ms + m.ins + m.shT];
    m.Ro = m.R + m.offs[4];
    m.zBack = -m.Ro;
    m.outerTop = m.yFloor + m.H + m.offs[4];

    const hd = P('door.height_ratio') * m.H;
    const halfW = P('door.width') / 2;
    m.door = { halfW, hd, spring: Math.max(0, hd - halfW) };
    let zin = m.R;
    for (let i = 0; i <= 32; i++) {
      const a = (i / 32) * Math.PI;
      const pts = [[halfW, m.door.spring * (i / 32)], [halfW * Math.cos(a), m.door.spring + halfW * Math.sin(a)]];
      for (const [x, y] of pts) {
        const z2 = m.R * m.R - x * x - ((m.R * m.R) / (m.H * m.H)) * y * y;
        zin = Math.min(zin, Math.sqrt(Math.max(z2, 0)));
      }
    }
    m.zDoorIn = zin;
    m.zFront = m.Ro + m.landingDepth;
    m.tunW = 2 * (halfW + m.lw);
    m.tunH = hd + m.lw;
    m.dt = P('door.thickness');
    m.rc = P('chimney.diameter') / 2 + 0.004;
    m.yChimBase = m.yFloor + m.tunH;
    m.yChimTop = P('chimney.top');
    m.zChim = m.zFront - m.landingDepth / 2;
    // 焚き口のひさしと頂部のベント（viewer/main.js と同じ置き方）
    m.hoodD = P('hood.depth');
    m.hoodW = m.tunW + 0.06;
    m.hoodTilt = 0.25;
    m.yHood = m.yFloor + m.tunH - 0.01;
    m.vr = P('vent.diameter') / 2;

    // 鉄のテーブル。後ろの 2 本の脚は天秤で受け、ピン 1 本で枠に留めて 3 点で支える。
    m.tz = P('table.offset_z');
    m.W = P('table.width');
    m.D = P('table.depth');
    m.ov = P('table.overhang');
    m.dk = P('deck.thickness');
    m.jt = P('table.joist');
    m.bh = P('table.beam_h');
    m.bw = P('table.beam_w');
    m.bx = P('table.beam_x');
    m.fz = P('table.front_z');
    m.lg = P('table.leg');
    m.flx = P('table.front_leg_x');
    m.brz = P('table.brace_z');
    m.rz = P('table.rear_z');
    m.rlen = P('table.rear_len');
    m.rl = P('table.rear_leg');
    m.rlx = P('table.rear_leg_x');
    m.rgap = P('table.rear_gap');
    m.stx = P('table.stop_x');
    m.sgap = P('table.stop_gap');
    m.zb = m.tz - m.D / 2;
    m.zf = m.tz + m.D / 2;
    m.yJt = m.yInsBase - m.dk; // 根太の上面
    m.yJb = m.yJt - m.jt; // 根太の下面と側梁の上面
    m.ySb = m.yJb - m.bh; // 側梁の下面と横梁の上面
    m.yFxB = m.ySb - m.lg; // 前の横梁の下面
    m.yRxB = m.ySb - m.bh; // 後ろの横梁の下面
    m.yBt = m.yRxB - m.rgap; // 天秤の上面
    m.yBb = m.yBt - m.bh; // 天秤の下面
    m.yPin = m.yBb + m.bh / 2; // ピンの中心
    m.yStopTop = m.yBt + m.rgap - m.sgap; // 止めの上面
    m.yHang = m.yPin - HANG_BELOW; // 吊り板の下端

    // 部材の長さと位置
    m.jl = m.W - 2 * m.ov - 0.002; // 根太の長さ
    m.sbz0 = m.zb + m.ov; // 側梁の後ろの端
    m.sbz1 = m.zf - m.ov; // 側梁の前の端
    m.fxl = 2 * m.flx + m.lg; // 前の横梁の長さ
    m.balL = 2 * m.rlx + m.rl; // 天秤の長さ
    m.brx = m.flx - m.lg; // 方杖の中心の左右の位置
    // 方杖は 45 度。上の端は板の下面で水平に切り、下の端は前の脚の所で縦に切る。
    m.brTop = m.ySb - PL;
    m.brZt0 = m.brz - m.lg / Math.SQRT2;
    m.brZt1 = m.brz + m.lg / Math.SQRT2;
    m.brZb = m.fz + 0.025;
    m.brYb0 = m.brTop - (m.brZb - m.brZt0); // 下の端の下の角
    m.brYb1 = m.brTop - (m.brZb - m.brZt1); // 下の端の上の角

    // 根太。天板の前後 2 段に 5 本ずつ、各段で等間隔に置く。
    const nb = Math.floor(P('table.joist_n') / 2);
    const nf = P('table.joist_n') - nb;
    const row = (z0, z1, n) => Array.from({ length: n }, (_, i) => (n > 1 ? z0 + ((z1 - z0) * i) / (n - 1) : (z0 + z1) / 2));
    m.joistZ = [
      ...row(m.zb + m.ov + m.jt / 2, m.tz - m.jt / 2, nb),
      ...row(m.tz + m.jt / 2, m.zf - m.ov - m.jt / 2, nf),
    ];

    // 天板の縞鋼板の継ぎ目
    const pw = (m.W - (DECK_COLS - 1) * DECK_GAP) / DECK_COLS;
    const pd = (m.D - (DECK_ROWS - 1) * DECK_GAP) / DECK_ROWS;
    m.seamX = Array.from({ length: DECK_COLS - 1 }, (_, i) => -m.W / 2 + (i + 1) * (pw + DECK_GAP) - DECK_GAP / 2);
    m.plateZ = Array.from({ length: DECK_ROWS }, (_, i) => [m.zb + i * (pd + DECK_GAP), m.zb + i * (pd + DECK_GAP) + pd]);
    m.seamZ = m.plateZ.slice(1).map(([z0]) => z0 - DECK_GAP / 2);

    // 据え台と足
    m.ps = P('pad.size');
    m.ph = P('pad.height');
    m.pg = P('pad.gravel');
    m.pit = P('pad.pit');
    m.yPad = P('pad.top');
    m.rod = P('foot.rod');
    m.yPlateBot = m.yPad + P('foot.stack'); // 底板の下面
    m.fpl = P('foot.plate');
    m.fpw = P('foot.plate_w');
    m.yLeg = m.yPlateBot + m.fpl; // 脚の下端
    m.feet = [
      { x: -m.flx, z: m.fz, front: true }, { x: m.flx, z: m.fz, front: true },
      { x: -m.rlx, z: m.rz, front: false }, { x: m.rlx, z: m.rz, front: false },
    ];

    // 薪置き。テーブルの下で、方杖の内に 3 段に積む。
    m.logR = WOOD_TOP / 5.5;
    m.wx = m.flx - 1.5 * m.lg - 0.02;
    m.nPer = Math.max(1, Math.floor((2 * m.wx) / (2 * m.logR)));
    m.wz1 = m.fz - 0.05;
    m.wz0 = m.wz1 - 0.45;

    // 屋根の柱は 3D と同じ置き方（stand.margin を使う）
    m.mg = P('stand.margin');
    m.po = P('roof.post_offset');
    m.px = m.Ro + m.mg + m.po;
    m.pz0 = m.zBack - m.mg - m.po;
    m.pz1 = m.zFront + m.mg + m.po;
    m.eave = P('roof.eave');
    m.ridge = P('roof.ridge');
    m.oh = P('roof.overhang');
    m.roofUse = !!P('roof.use');
    m.run = m.px + m.oh;
    m.post = 0.105;
    return m;
  }

  // ---------- 図の部品

  const nameOf = (id) => (api.thing(id) ? api.thing(id).name : id);

  // 部品の形をまとめる。押すと選ぶ。
  function part(L, id, kids) {
    const g = e('g', { 'data-part': id, class: 'pt', tabindex: '0', role: 'button', 'aria-label': nameOf(id) });
    for (const k of [].concat(kids)) if (k) g.append(...[].concat(k));
    L.body.append(g);
    return g;
  }

  // 地面の下の据え台と締めた砕石を横から見た長方形 [横 0, y0, 横 1, y1]。c は横の位置。
  const padBelow = (M, c) => [
    [c - M.ps / 2, M.yPad - M.ph, c + M.ps / 2, 0],
    [c - M.pit / 2, M.yPad - M.ph - M.pg, c + M.pit / 2, M.yPad - M.ph],
  ];

  // 足の積み上げを横から見た形。下から敷き板、全ねじ、頭のナット 2 個、ナット B と A、底板。
  // c は横の位置（正面図では x、断面図では z）。rc は図ごとの長方形の描き方。
  function footEls(rc, c, M) {
    const yS = M.yPad + SHIM;
    return [
      rc(c - M.rod / 2, yS, c + M.rod / 2, M.yPlateBot, 'sh fp'),
      rc(c - SHIM_W / 2, M.yPad, c + SHIM_W / 2, yS, 'sh fp'),
      rc(c - NUT_R, yS, c + NUT_R, yS + NUT_H, 'sh fp'),
      rc(c - NUT_R, yS + NUT_H, c + NUT_R, yS + 2 * NUT_H, 'sh fp'),
      rc(c - NUT_R, M.yPlateBot - 2 * NUT_H, c + NUT_R, M.yPlateBot - NUT_H, 'sh fp'),
      rc(c - NUT_R, M.yPlateBot - NUT_H, c + NUT_R, M.yPlateBot, 'sh fp'),
      rc(c - M.fpw / 2, M.yPlateBot, c + M.fpw / 2, M.yLeg, 'sh fp'),
    ];
  }

  function text(L, x, y, s, o = {}) {
    const t = e('text', {
      x: r2(x), y: r2(y), class: o.cls || 'dt', 'text-anchor': o.anchor || 'middle',
      transform: o.rot ? `rotate(-90 ${r2(x)} ${r2(y)})` : null, text: s,
    });
    L.txt.append(t);
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

  // 横の寸法。x1 から x2 まで、用紙の y に引く。o.ext は補助線の始点の y（左右）。o.at は文字の置き方。
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
    if (o.at === 'right') text(L, hi + out + 1.5, y + 1, s, { anchor: 'start' });
    else if (o.at === 'startRight') text(L, (lo + hi) / 2 + 1.5, y - 1, s, { anchor: 'start' });
    else text(L, (lo + hi) / 2, y - 1, s);
  }

  // 縦の寸法。用紙の y1 から y2 まで、x に引く。o.ext は補助線の始点の x（y1 側、y2 側）。
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
    if (o.at === 'right') text(L, x + 3, (lo + hi) / 2 + 1, s, { anchor: 'start' });
    else if (o.at === 'rotR') text(L, x + 4, (lo + hi) / 2, s, { rot: true });
    else text(L, x - 1, (lo + hi) / 2, s, { rot: true });
  }

  // 引出線。点 (px, py) から文字の位置 (tx, ty) へ。
  function leader(L, px, py, tx, ty, s, anchor = 'end') {
    L.dim.append(lineEl(px, py, tx, ty));
    L.dim.append(circEl(px, py, 0.55, 'da'));
    text(L, tx + (anchor === 'end' ? -1 : 1), ty + 1, s, { anchor });
  }

  // 高さの連続寸法。x に線を引き、境の y（用紙）ごとに目盛と補助線、区間ごとに文字を置く。
  function chainV(L, x, ys, labels, exts) {
    L.dim.append(lineEl(x, Math.min(...ys), x, Math.max(...ys)));
    ys.forEach((y, i) => {
      L.dim.append(lineEl(x - 1.3, y + 1.3, x + 1.3, y - 1.3));
      if (exts[i] != null) L.dim.append(lineEl(exts[i] + 1, y, x + 2, y));
    });
    labels.forEach((s, i) => {
      if (s) text(L, x + 3, (ys[i] + ys[i + 1]) / 2 + 1, s, { anchor: 'start' });
    });
  }

  function groundLine(L, x0, x1, y) {
    L.body.append(lineEl(x0, y, x1, y, 'gl'));
    for (let x = x0 + 2; x < x1 - 1; x += 3) L.body.append(lineEl(x, y, x - 2, y + 2, 'gt'));
    text(L, x0 + 1, y - 1.2, 'GL', { cls: 'tx', anchor: 'start' });
  }

  // ---------- 用紙の枠、表題欄、凡例

  function patterns() {
    const pat = (id, s, kids) => e('pattern', { id, width: s, height: s, patternUnits: 'userSpaceOnUse' },
      [e('rect', { width: s, height: s, class: 'pbg' }), ...kids]);
    const dot = (x, y, r) => circEl(x, y, r, 'pd');
    return [
      // パーライト: 細かい点
      pat('dwg-p-perl', 2.4, [dot(0.6, 0.6, 0.2), dot(1.8, 1.8, 0.2)]),
      // 耐火レンガ: 45 度の斜線
      pat('dwg-p-brick', 2.2, [pathEl('M0 2.2 L2.2 0 M-0.5 0.5 L0.5 -0.5 M1.7 2.7 L2.7 1.7', 'pl')]),
      // 粘土と砂: 密な点
      pat('dwg-p-clay', 1.6, [dot(0.4, 0.4, 0.2), dot(1.2, 1.2, 0.2), dot(0.4, 1.2, 0.2)]),
      // 扉: 交差の斜線
      pat('dwg-p-door', 2.6, [pathEl('M0 2.6 L2.6 0 M-0.5 0.5 L0.5 -0.5 M2.1 3.1 L3.1 2.1 M0 0 L2.6 2.6', 'pl')]),
    ];
  }

  function frameEls(d, M) {
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
    cell(x0, y0 + 29, '注記', '寸法は仮置き（oven.json の status を参照）', 3.2);
    out.push(g);
    return out;
  }

  // 右上の凡例。断面図では材料の記号も出す。
  function legendEls(withHatch) {
    const g = e('g', { class: 'lg' });
    const x0 = 255;
    let y = 28;
    const t = (x, yy, s, cls) => g.append(e('text', { x, y: yy, class: cls || 'tx', text: s }));
    t(x0, y, '線の種類', 'tv');
    y += 7;
    const items = [['外形線', 'sh fn'], ['隠れ線', 'hid'], ['中心線と屋根の外形', 'ctr'], ['寸法線と補助線', 'dlk']];
    for (const [label, cls] of items) {
      g.append(lineEl(x0, y - 1, x0 + 22, y - 1, cls));
      t(x0 + 26, y, label);
      y += 6;
    }
    if (withHatch) {
      y += 4;
      t(x0, y, '材料の記号', 'tv');
      y += 4;
      const mats = [['fsteel', '鋼（角パイプと鋼板）'], ['fperl', 'パーライト（断熱）'], ['fbrick', '耐火レンガ'], ['fclay', '粘土と砂'], ['fshell', '外殻'], ['fdoor', '扉']];
      for (const [cls, label] of mats) {
        g.append(rectEl(x0, y, x0 + 14, y + 6, `sh ${cls}`));
        t(x0 + 18, y + 4.3, label);
        y += 8;
      }
    }
    return g;
  }

  function caption(s) {
    return e('text', { x: 20, y: 272, class: 'cap', text: s });
  }

  // ---------- 平面図 BO-DWG-001

  function drawPlan(L, M) {
    const ox = 102.5;
    const oy = 135;
    const X = (x) => ox + x * S;
    const Z = (z) => oy + z * S;
    const rc = (x0, z0, x1, z1, cls) => rectEl(X(x0), Z(z0), X(x1), Z(z1), cls);
    const { W, D, zb, zf, Ro, R, zBack, zFront } = M;
    const sq = (x, z, a, cls) => rc(x - a / 2, z - a / 2, x + a / 2, z + a / 2, cls);

    // 据え台。天板より外へ出る所だけが見える（天板の下の所は、あとで隠れ線を重ねる）。
    part(L, 'foundation', M.feet.map((f) => sq(f.x, f.z, M.ps, 'sh fp')));
    // 天板。縞鋼板 6 枚の継ぎ目を細線で描く（炉床の断熱の下は隠れる）。
    part(L, 'slab', [
      rc(-W / 2, zb, W / 2, zf, 'sh fp'),
      ...M.seamX.map((x) => lineEl(X(x), Z(zb), X(x), Z(zf), 'sh tn')),
      ...M.seamZ.map((z) => lineEl(X(-W / 2), Z(z), X(W / 2), Z(z), 'sh tn')),
    ]);
    part(L, 'hearthIns', rc(-Ro, zBack, Ro, zFront, 'sh fp'));
    part(L, 'shell', circEl(X(0), Z(0), Ro * S, 'sh fp'));
    // ドームの各層の境（上からは隠れる）
    const ring = (r) => hid(circEl(X(0), Z(0), r * S));
    part(L, 'chamber', [ring(R), ring(R + M.offs[1])]);
    if (M.ms > 0) part(L, 'mass', ring(R + M.offs[2]));
    part(L, 'insulation', ring(R + M.offs[3]));

    // 前室。ドームの面が前室の高さに下がる所から外へ出る。
    const rex = Ro * Math.sqrt(Math.max(0, 1 - Math.pow(M.tunH / (M.H + M.offs[4]), 2)));
    const zc = Math.sqrt(Math.max(0, rex * rex - Math.pow(M.tunW / 2, 2)));
    const hw = M.tunW / 2;
    const landing = [pathEl(`M ${P2([X(-hw), Z(zc)], [X(-hw), Z(zFront)], [X(hw), Z(zFront)], [X(hw), Z(zc)])} A ${r2(rex * S)} ${r2(rex * S)} 0 0 1 ${P2([X(-hw), Z(zc)])} Z`, 'sh fp')];
    landing.push(...hid(rc(-M.door.halfW, M.zDoorIn, M.door.halfW, zFront)));
    part(L, 'landing', landing);
    part(L, 'door', hid(rc(-M.door.halfW, Ro - M.dt, M.door.halfW, Ro)));
    part(L, 'chimney', circEl(X(0), Z(M.zChim), M.rc * S, 'sh fp'));
    part(L, 'hood', rc(-M.hoodW / 2, zFront, M.hoodW / 2, zFront + M.hoodD * Math.cos(M.hoodTilt), 'sh fp'));
    part(L, 'vent', [circEl(X(0), Z(0), (M.vr + 0.03) * S, 'sh fp'), circEl(X(0), Z(0), M.vr * S, 'sh')]);

    // 天板の下に隠れる薪置き、鉄のテーブル、据え台
    part(L, 'wood', hidRects([[-M.wx, M.wz0, M.wx, M.wz1]], X, Z));
    const st = M.joistZ.map((z) => [-M.jl / 2, z - M.jt / 2, M.jl / 2, z + M.jt / 2]); // 根太
    for (const s of [-1, 1]) {
      st.push([s * M.bx - M.bw / 2, M.sbz0, s * M.bx + M.bw / 2, M.sbz1]); // 側梁
      st.push([s * M.brx - M.lg / 2, M.brZt0, s * M.brx + M.lg / 2, M.brZb]); // 方杖
    }
    st.push([-M.fxl / 2, M.fz - M.lg / 2, M.fxl / 2, M.fz + M.lg / 2]); // 前の横梁
    st.push([-M.rlen / 2, M.rz - M.bw / 2, M.rlen / 2, M.rz + M.bw / 2]); // 後ろの横梁
    st.push([-M.balL / 2, M.rz - M.bw / 2, M.balL / 2, M.rz + M.bw / 2]); // 天秤
    part(L, 'stand', hidRects(st, X, Z));
    // 据え台の天板の下の所と、地面の下の穴
    const sqR = (f, a) => [f.x - a / 2, f.z - a / 2, f.x + a / 2, f.z + a / 2];
    part(L, 'foundation', hidRects(M.feet.flatMap((f) => [sqR(f, M.ps), sqR(f, M.pit)]), X, Z));

    // 屋根と柱（roof.use が 0 なら描かない）
    if (M.roofUse) {
      const roofKids = [];
      const rfRect = rc(-M.run, M.pz0 - M.oh, M.run, M.pz1 + M.oh, 'rf');
      roofKids.push(rfRect, hitOf(rfRect), lineEl(X(0), Z(M.pz0 - M.oh), X(0), Z(M.pz1 + M.oh), 'rf'));
      for (const x of [-M.px, M.px]) {
        for (const z of [M.pz0, M.pz1]) roofKids.push(rc(x - M.post / 2, z - M.post / 2, x + M.post / 2, z + M.post / 2, 'sh fp'));
      }
      part(L, 'roof', roofKids);
    }

    // 中心線
    L.body.append(lineEl(X(0), Z(-1.68), X(0), Z(2.02), 'ctr'));
    L.body.append(lineEl(X(-1.15), Z(0), X(1.15), Z(0), 'ctr'));

    // 寸法
    dimH(L, X(-R), X(R), Z(0), `内径 ${mm(2 * R)}`);
    dimH(L, X(-Ro), X(Ro), Z(0.27), `外径 ${mm(2 * Ro)}`, { ext: [Z(0), Z(0)] });
    dimH(L, X(-W / 2), X(W / 2), Z(-1.2), `天板の幅 ${mm(W)}`, { ext: [Z(zb), Z(zb)] });
    if (M.roofUse) dimH(L, X(-M.px), X(M.px), Z(-1.75), `柱の間隔 ${mm(2 * M.px)}`, { ext: [Z(M.pz0), Z(M.pz0)] });
    dimV(L, Z(Ro), Z(zFront), X(1.75), `前室の奥行 ${mm(zFront - Ro)}`, { ext: [X(hw), X(hw)] });
    dimV(L, Z(zb), Z(zf), X(1.95), `天板の奥行 ${mm(D)}`, { ext: [X(W / 2), X(W / 2)] });
    if (M.roofUse) dimV(L, Z(M.pz0), Z(M.pz1), X(2.15), `柱の間隔 ${mm(M.pz1 - M.pz0)}`, { ext: [X(M.px), X(M.px)] });
    L.extra.push(caption('平面図  S=1:20'));
  }

  // ---------- 正面図 BO-DWG-002

  function drawElev(L, M) {
    const ox = 102.5;
    const gy = 195;
    const X = (x) => ox + x * S;
    const Y = (y) => gy - y * S;
    const rc = (x0, y0, x1, y1, cls) => rectEl(X(x0), Y(y0), X(x1), Y(y1), cls);
    const { W, Ro, R, H, yInsBase, yInsTop, yFloor } = M;
    const top = M.outerTop;
    const front = M.feet.filter((f) => f.front);
    const rear = M.feet.filter((f) => !f.front);

    groundLine(L, X(-2.0), X(2.0), Y(0));

    // 奥から手前へ描き、手前の面で奥の形を隠す。
    // 後ろの据え台（地面より上の所）
    part(L, 'foundation', rear.map((f) => rc(f.x - M.ps / 2, 0, f.x + M.ps / 2, M.yPad, 'sh fp')));
    // 後ろの組。後ろの横梁、天秤、止め、天秤の脚、足、当て板、吊り板。
    const back = [
      rc(-M.rlen / 2, M.yRxB, M.rlen / 2, M.ySb, 'sh fp'),
      rc(-M.balL / 2, M.yBb, M.balL / 2, M.yBt, 'sh fp'),
    ];
    for (const s of [-1, 1]) {
      back.push(rc(s * M.stx - STOP_W / 2, M.yBt, s * M.stx + STOP_W / 2, M.yStopTop, 'sh fp'));
      back.push(rc(s * M.rlx - M.rl / 2, M.yLeg, s * M.rlx + M.rl / 2, M.yBb, 'sh fp'));
    }
    for (const f of rear) back.push(...footEls(rc, f.x, M));
    back.push(rc(-TAB_W / 2, M.yRxB, TAB_W / 2, M.ySb, 'sh fp'));
    back.push(rc(-HANG_W / 2, M.yHang, HANG_W / 2, M.ySb, 'sh fp'));
    part(L, 'stand', back);
    // 薪置き
    const logs = [];
    for (let row = 0; row < 3; row++) {
      const n = M.nPer - (row % 2);
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * 2 * M.logR;
        logs.push(circEl(X(x), Y(M.logR + row * M.logR * 1.75), M.logR * S, 'sh fw'));
      }
    }
    part(L, 'wood', logs);
    // 前の据え台。地面の下の据え台と締めた砕石は隠れ線。
    part(L, 'foundation', [
      ...front.map((f) => rc(f.x - M.ps / 2, 0, f.x + M.ps / 2, M.yPad, 'sh fp')),
      ...hidRects(front.flatMap((f) => padBelow(M, f.x)), X, Y),
    ]);
    // 手前の組。方杖、前の足、前の門形（横梁と脚 2 本）、側梁の小口、根太。天秤は隠れ線。
    const fr = [];
    for (const s of [-1, 1]) fr.push(rc(s * M.brx - M.lg / 2, M.brYb0, s * M.brx + M.lg / 2, M.brTop, 'sh fp'));
    for (const f of front) fr.push(...footEls(rc, f.x, M));
    for (const s of [-1, 1]) fr.push(rc(s * M.flx - M.lg / 2, M.yLeg, s * M.flx + M.lg / 2, M.yFxB, 'sh fp'));
    fr.push(rc(-M.fxl / 2, M.yFxB, M.fxl / 2, M.ySb, 'sh fp'));
    for (const s of [-1, 1]) fr.push(rc(s * M.bx - M.bw / 2, M.ySb, s * M.bx + M.bw / 2, M.yJb, 'sh fp'));
    fr.push(rc(-M.jl / 2, M.yJb, M.jl / 2, M.yJt, 'sh fp'));
    fr.push(...hid(rc(-M.balL / 2, M.yBb, M.balL / 2, M.yBt)));
    part(L, 'stand', fr);
    part(L, 'slab', rc(-W / 2, M.yJt, W / 2, yInsBase, 'sh fp'));
    part(L, 'hearthIns', rc(-Ro, yInsBase, Ro, yInsTop, 'sh fp'));

    // ドーム。外形は外殻の半楕円。内側の層は前室の後ろに隠れる。
    const arc = (r, h) => hid(pathEl(`M ${P2([X(-r), Y(yFloor)])} ${halfArc(X(-r), X(r), Y(yFloor), r * S, h * S, 1)}`));
    part(L, 'hearth', hid(rc(-R, yInsTop, R, yFloor)));
    part(L, 'chamber', [...arc(R, H), ...arc(R + M.offs[1], H + M.offs[1])]);
    if (M.ms > 0) part(L, 'mass', arc(R + M.offs[2], H + M.offs[2]));
    part(L, 'insulation', arc(R + M.offs[3], H + M.offs[3]));
    part(L, 'shell', pathEl(`M ${P2([X(-Ro), Y(yInsTop)], [X(-Ro), Y(yFloor)])} ${halfArc(X(-Ro), X(Ro), Y(yFloor), Ro * S, (H + M.offs[4]) * S, 1)} L ${P2([X(Ro), Y(yInsTop)])} Z`, 'sh fp'));

    // 前室の前面と焚き口のアーチ（その奥に扉）
    const hw = M.tunW / 2;
    part(L, 'landing', rc(-hw, yInsTop, hw, yFloor + M.tunH, 'sh fp'));
    const dw = M.door.halfW;
    const sp = yFloor + M.door.spring;
    part(L, 'door', pathEl(`M ${P2([X(-dw), Y(yFloor)], [X(-dw), Y(sp)])} A ${r2(dw * S)} ${r2(dw * S)} 0 0 1 ${P2([X(dw), Y(sp)], [X(dw), Y(yFloor)])} Z`, 'sh fo'));

    // 煙突
    part(L, 'chimney', [rc(-M.rc, M.yChimBase, M.rc, M.yChimTop, 'sh fp'), lineEl(X(-M.rc - 0.02), Y(M.yChimTop), X(M.rc + 0.02), Y(M.yChimTop), 'sh')]);

    // 焚き口のひさしと頂部のベント
    part(L, 'hood', rc(-M.hoodW / 2, M.yHood - M.hoodD * Math.sin(M.hoodTilt), M.hoodW / 2, M.yHood, 'sh fp'));
    part(L, 'vent', [
      rc(-M.vr, M.outerTop - 0.03, M.vr, M.outerTop + 0.07, 'sh fp'),
      rc(-M.vr - 0.03, M.outerTop + 0.084, M.vr + 0.03, M.outerTop + 0.096, 'sh fp'),
    ]);

    // 屋根と柱（roof.use が 0 なら描かない）
    if (M.roofUse) {
      const roofKids = [];
      const rfPath = pathEl(`M ${P2([X(-M.run), Y(M.eave)], [X(0), Y(M.ridge)], [X(M.run), Y(M.eave)])}`, 'rf');
      roofKids.push(rfPath, hitOf(rfPath));
      for (const x of [-M.px, M.px]) {
        roofKids.push(rc(x - M.post / 2, 0, x + M.post / 2, M.eave, 'sh fp'));
      }
      part(L, 'roof', roofKids);
    }

    // 中心線
    L.body.append(lineEl(X(0), Y(-0.1), X(0), Y((M.roofUse ? M.ridge : M.yChimTop) + 0.15), 'ctr'));

    // 寸法。右に GL からの高さ。
    const cx = X(1.85);
    L.dim.append(lineEl(cx, Y(0), cx, Y(M.yChimTop)));
    const padOut = Math.max(...M.feet.map((f) => Math.abs(f.x))) + M.ps / 2;
    const lv = [
      [0, 'GL 0', null, 2.8],
      [M.yPad, `据え台の上面 GL+${mm(M.yPad)}`, X(padOut), 0.8],
      [yInsBase, `天板の上面 GL+${mm(yInsBase)}`, X(W / 2), 1],
      [yFloor, `炉床の面 GL+${mm(yFloor)}`, X(hw), 1],
      [top, `ドームの頂 GL+${mm(top)}`, X(0.09), 1],
      [M.yChimTop, `煙突の頂 GL+${mm(M.yChimTop)}`, X(M.rc), 1],
    ];
    for (const [y, s, ex, dy] of lv) {
      L.dim.append(lineEl(cx - 1.3, Y(y) + 1.3, cx + 1.3, Y(y) - 1.3));
      if (ex != null) L.dim.append(lineEl(ex + 1, Y(y), cx + 2, Y(y)));
      text(L, cx + 3, Y(y) + dy, s, { anchor: 'start' });
    }
    // 足の間は全ねじの中心で測る。
    dimH(L, X(-M.rlx), X(M.rlx), Y(-0.40), `足の間 ${mm(2 * M.rlx)}（後ろ）`, { ext: [Y(M.yPad), Y(M.yPad)] });
    dimH(L, X(-M.flx), X(M.flx), Y(-0.50), `足の間 ${mm(2 * M.flx)}（前）`, { ext: [Y(M.yPad), Y(M.yPad)] });
    dimH(L, X(-W / 2), X(W / 2), Y(-0.60), `天板の幅 ${mm(W)}`, { ext: [Y(M.yJt), Y(M.yJt)] });
    // 焚き口の幅と高さ
    dimH(L, X(-dw), X(dw), Y(yFloor + 0.07), `焚き口の幅 ${mm(2 * dw)}`, { at: 'right' });
    dimV(L, Y(yFloor + M.door.hd), Y(yFloor), X(-0.52), `焚き口の高さ ${mm(M.door.hd)}`, { ext: [X(0), X(-dw)] });
    L.extra.push(caption('正面図  S=1:20'));
  }

  // ---------- 断面図 A-A BO-DWG-003

  function drawSect(L, M, defs) {
    const ox = 110;
    const gy = 195;
    const X = (z) => ox + z * S;
    const Y = (y) => gy - y * S;
    const rc = (z0, y0, z1, y1, cls) => rectEl(X(z0), Y(y0), X(z1), Y(y1), cls);
    const { R, H, zf, Ro, zBack, zFront, yInsBase, yInsTop, yFloor } = M;
    const hd = M.door.hd;

    // 焚き口の穴の外では層を切らないための切り抜き（穴は z > 0 で、窯の床から焚き口の高さまで）
    defs.append(e('clipPath', { id: 'dwg-cp-door' }, [
      e('path', {
        d: `M 0 0 H ${SW} V ${SH} H 0 Z M ${P2([X(0), Y(yFloor + hd)], [X(zFront + 0.3), Y(yFloor + hd)], [X(zFront + 0.3), Y(yInsTop - 0.02)], [X(0), Y(yInsTop - 0.02)])} Z`,
        'clip-rule': 'evenodd',
      }),
    ]));

    groundLine(L, X(-1.9), X(2.0), Y(0));

    // 切り口は x = 0（方杖と方杖の上の板だけは x = 0.495）。角パイプと鋼板は、切れた所を塗り、奥に見える所を外形線で描く。
    // 据え台は切り口より奥にあるので、地面より上は外形線、地面の下は隠れ線。左右の 2 つは重なる。
    part(L, 'foundation', [
      ...[M.rz, M.fz].map((z) => rc(z - M.ps / 2, 0, z + M.ps / 2, M.yPad, 'sh fp')),
      ...hidRects([M.rz, M.fz].flatMap((z) => padBelow(M, z)), X, Y),
    ]);
    // 薪置き（x = 0 で切れる）
    const logs = [];
    for (let row = 0; row < 3; row++) {
      logs.push(rc(M.wz0, row * M.logR * 1.75, M.wz1, 2 * M.logR + row * M.logR * 1.75, 'sh fw'));
    }
    part(L, 'wood', logs);
    // 鉄のテーブル
    const st = [];
    // 切り口より奥に見える所。側梁、足、前の脚、天秤の脚、止め。
    st.push(rc(M.sbz0, M.ySb, M.sbz1, M.yJb, 'sh fp'));
    for (const z of [M.rz, M.fz]) st.push(...footEls(rc, z, M));
    st.push(rc(M.fz - M.lg / 2, M.yLeg, M.fz + M.lg / 2, M.yFxB, 'sh fp'));
    st.push(rc(M.rz - M.rl / 2, M.yLeg, M.rz + M.rl / 2, M.yBb, 'sh fp'));
    st.push(rc(M.rz - M.bw / 2, M.yBt, M.rz + M.bw / 2, M.yStopTop, 'sh fp'));
    // 切れた所。方杖と上の板、前の横梁、後ろの横梁、当て板、吊り板、天秤、ピンのさや管、根太。
    st.push(pathEl(`M ${P2([X(M.brZt0), Y(M.brTop)], [X(M.brZt1), Y(M.brTop)], [X(M.brZb), Y(M.brYb1)], [X(M.brZb), Y(M.brYb0)])} Z`, 'sh fsteel'));
    st.push(rc(M.brz - 0.015 - BR_PLATE_D / 2, M.brTop, M.brz - 0.015 + BR_PLATE_D / 2, M.ySb, 'sh fsteel'));
    st.push(rc(M.fz - M.lg / 2, M.yFxB, M.fz + M.lg / 2, M.ySb, 'sh fsteel'));
    st.push(rc(M.rz - M.bw / 2, M.yRxB, M.rz + M.bw / 2, M.ySb, 'sh fsteel'));
    for (const s of [-1, 1]) {
      const z0 = M.rz + s * (M.bw / 2);
      st.push(rc(z0, M.yRxB, z0 + s * PL, M.ySb, 'sh fsteel'));
      st.push(rc(z0 + s * PL, M.yHang, z0 + s * 2 * PL, M.ySb, 'sh fsteel'));
    }
    st.push(rc(M.rz - M.bw / 2, M.yBb, M.rz + M.bw / 2, M.yBt, 'sh fsteel'));
    st.push(rc(M.rz - SLEEVE_L / 2, M.yPin - SLEEVE_R, M.rz + SLEEVE_L / 2, M.yPin + SLEEVE_R, 'sh fsteel'));
    // ピンは長手の向きに切らずに外形で描く。
    st.push(rc(M.rz - PIN_L / 2, M.yPin - PIN_R, M.rz + PIN_L / 2, M.yPin + PIN_R, 'sh fp'));
    for (const z of M.joistZ) st.push(rc(z - M.jt / 2, M.yJb, z + M.jt / 2, M.yJt, 'sh fsteel'));
    part(L, 'stand', st);
    // 天板（縞鋼板の 2 段が切れる）
    part(L, 'slab', M.plateZ.map(([z0, z1]) => rc(z0, M.yJt, z1, yInsBase, 'sh fsteel')));
    part(L, 'hearthIns', rc(zBack, yInsBase, zFront, yInsTop, 'sh fperl'));

    // ドームの層。外側から内側へ、半楕円の輪。
    const ringD = (a, b) => {
      const ro = R + b;
      const ri = R + a;
      const ho = H + b;
      const hi = H + a;
      return `M ${P2([X(-ro), Y(yInsTop)], [X(-ro), Y(yFloor)])} ${halfArc(X(-ro), X(ro), Y(yFloor), ro * S, ho * S, 1)} L ${P2([X(ro), Y(yInsTop)], [X(ri), Y(yInsTop)], [X(ri), Y(yFloor)])} ${halfArc(X(ri), X(-ri), Y(yFloor), ri * S, hi * S, 0)} L ${P2([X(-ri), Y(yInsTop)])} Z`;
    };
    const layers = [['chamber', 0, 1, 'fbrick'], ['mass', 1, 2, 'fclay'], ['insulation', 2, 3, 'fperl'], ['shell', 3, 4, 'fshell']];
    for (const [id, i0, i1, fill] of layers) {
      if (M.offs[i1] - M.offs[i0] <= 0) continue;
      const p = pathEl(ringD(M.offs[i0], M.offs[i1]), `sh ${fill}`);
      p.setAttribute('clip-path', 'url(#dwg-cp-door)');
      part(L, id, p);
    }

    // 炉床と前室の床
    part(L, 'hearth', rc(-R, yInsTop, R, yFloor, 'sh fbrick'));
    part(L, 'landing', [
      rc(R, yInsTop, zFront, yFloor, 'sh fbrick'),
      rc(M.zDoorIn, yFloor + hd, zFront, yFloor + M.tunH, 'sh fbrick'),
    ]);
    // 扉は焼き室と前室の境（外殻の前面に接する）
    part(L, 'door', rc(Ro - M.dt, yFloor, Ro, yFloor + hd, 'sh fdoor'));

    // 煙突（管の壁を細い帯で）
    const cz = M.zChim;
    part(L, 'chimney', [
      rc(cz - M.rc, M.yChimBase, cz + M.rc, M.yChimTop, 'hitf'),
      rc(cz - M.rc - 0.006, M.yChimBase, cz - M.rc + 0.006, M.yChimTop, 'fi'),
      rc(cz + M.rc - 0.006, M.yChimBase, cz + M.rc + 0.006, M.yChimTop, 'fi'),
    ]);

    // 焚き口のひさし（先を下げて水を切る）と頂部のベント（管の壁と笠）
    const hoodPath = pathEl(`M ${P2([X(zFront), Y(M.yHood)], [X(zFront + M.hoodD * Math.cos(M.hoodTilt)), Y(M.yHood - M.hoodD * Math.sin(M.hoodTilt))])}`, 'sh');
    part(L, 'hood', [hoodPath, hitOf(hoodPath)]);
    part(L, 'vent', [
      rc(-M.vr, M.outerTop - 0.03, M.vr, M.outerTop + 0.07, 'hitf'),
      rc(-M.vr - 0.004, M.outerTop - 0.03, -M.vr + 0.004, M.outerTop + 0.07, 'fi'),
      rc(M.vr - 0.004, M.outerTop - 0.03, M.vr + 0.004, M.outerTop + 0.07, 'fi'),
      rc(-M.vr - 0.03, M.outerTop + 0.084, M.vr + 0.03, M.outerTop + 0.096, 'fi'),
    ]);

    // 屋根と柱（手前の側面の柱と梁。切っていないので面のまま。roof.use が 0 なら描かない）
    if (M.roofUse) {
      const roofKids = [];
      const rfRect = rc(M.pz0 - M.oh, M.eave, M.pz1 + M.oh, M.ridge, 'rf');
      roofKids.push(rfRect, hitOf(rfRect));
      for (const z of [M.pz0, M.pz1]) roofKids.push(rc(z - M.post / 2, 0, z + M.post / 2, M.eave, 'sh fp'));
      roofKids.push(rc(M.pz0 - M.post / 2, M.eave - M.post, M.pz1 + M.post / 2, M.eave, 'sh fp'));
      part(L, 'roof', roofKids);
    }

    // 窯の中心線
    L.body.append(lineEl(X(0), Y(-0.1), X(0), Y((M.roofUse ? M.ridge : M.yChimTop) + 0.1), 'ctr'));

    // 寸法
    dimV(L, Y(yFloor + H), Y(yFloor), X(0), `内高 ${mm(H)}`);
    dimH(L, X(-R), X(R), Y(yFloor + 0.06), `内径 ${mm(2 * R)}`, { at: 'startRight' });
    // 炉床の面の高さ（GL から）
    dimV(L, Y(yFloor), Y(0), X(-1.05), `炉床の面 GL+${mm(yFloor)}`, { ext: [X(-Ro), null] });
    // 前室の奥行
    dimH(L, X(Ro), X(zFront), Y(1.68), `前室奥行 ${mm(zFront - Ro)}`, { ext: [Y(yFloor + hd), Y(yFloor + M.tunH)], at: 'right' });
    // 右の連続寸法（厚さと高さ）。柱の外に出す。
    const col = X(1.8);
    const padF = M.fz + M.ps / 2;
    const lv = [M.yPad - M.ph, M.yPad, yInsBase, yInsTop, yFloor, yFloor + hd];
    const ex = [X(padF), X(padF), X(zf), X(zFront), X(zFront), X(zFront)];
    chainV(L, col, lv.map(Y), [
      `据え台 ${mm(M.ph)}`, `テーブル ${mm(yInsBase - M.yPad)}`, `炉床の断熱 ${mm(M.hi)}`, `炉床 ${mm(M.th)}`, `焚き口の高さ ${mm(hd)}`,
    ], ex);
    // 層の厚さの引出線
    const lay = [
      [3, 4, 55, 1.92, `外殻 ${mm(M.shT)}`],
      [2, 3, 45, 1.77, `断熱 ${mm(M.ins)}`],
      [1, 2, 35, 1.62, `粘土と砂 ${mm(M.ms)}`],
      [0, 1, 25, 1.47, `耐火レンガ ${mm(M.t)}`],
    ].filter(([i0, i1]) => M.offs[i1] - M.offs[i0] > 0);
    for (const [i0, i1, deg, ty, s] of lay) {
      const mid = (M.offs[i0] + M.offs[i1]) / 2;
      const a = (deg * Math.PI) / 180;
      const pz = -(R + mid) * Math.cos(a);
      const py = yFloor + (H + mid) * Math.sin(a);
      leader(L, X(pz), Y(py), X(-0.76), Y(ty), s, 'end');
    }
    L.extra.push(caption('断面図 A-A  S=1:20'));
  }

  const DRAWINGS = [
    { id: 'BO-DWG-001', name: '平面図', title: '平面図', draw: drawPlan },
    { id: 'BO-DWG-002', name: '正面図', title: '正面図', draw: drawElev },
    { id: 'BO-DWG-003', name: '断面図 A-A', title: '断面図 A-A', draw: drawSect },
  ];

  // ---------- 画面

  const CSS = `
#mode-dwg .stage { background: var(--paper-2); }
#mode-dwg svg .paper { fill: var(--dwg-paper); }
#mode-dwg svg .fr { fill: none; stroke: var(--dwg-ink); stroke-width: .5; }
#mode-dwg svg .sh { stroke: var(--dwg-ink); stroke-width: .5; stroke-linejoin: round; }
#mode-dwg svg .tn { stroke-width: .2; }
#mode-dwg svg .hid { stroke: var(--dwg-ink); stroke-width: .25; stroke-dasharray: 2 1; fill: none; pointer-events: none; }
#mode-dwg svg .ctr, #mode-dwg svg .rf { stroke: var(--dwg-ink); stroke-width: .18; stroke-dasharray: 8 1.2 1.2 1.2; fill: none; pointer-events: none; }
#mode-dwg svg .rf { stroke-width: .25; }
#mode-dwg svg .hit { fill: none; stroke: transparent; stroke-width: 2.4; pointer-events: stroke; }
#mode-dwg svg .gl { stroke: var(--dwg-ink); stroke-width: .7; }
#mode-dwg svg .gt { stroke: var(--dwg-ink); stroke-width: .18; }
#mode-dwg svg .dl { stroke: var(--dwg-dim); stroke-width: .18; fill: none; pointer-events: none; }
#mode-dwg svg .dlk { stroke: var(--dwg-dim); stroke-width: .18; fill: none; }
#mode-dwg svg .da { fill: var(--dwg-dim); stroke: none; }
#mode-dwg svg .dt { fill: var(--dwg-dim); font-size: 3px; stroke: var(--dwg-paper); stroke-width: .9px; paint-order: stroke; stroke-linejoin: round; pointer-events: none; }
#mode-dwg svg .tx { fill: var(--dwg-ink); font-size: 3px; pointer-events: none; }
#mode-dwg svg .tl { fill: var(--dwg-ink); font-size: 2px; opacity: .7; }
#mode-dwg svg .tv { fill: var(--dwg-ink); font-size: 3.2px; }
#mode-dwg svg .cap { fill: var(--dwg-ink); font-size: 5px; font-weight: 700; }
#mode-dwg svg .tbl { fill: none; stroke: var(--dwg-ink); stroke-width: .35; }
#mode-dwg svg .fp { fill: var(--dwg-paper); }
#mode-dwg svg .fo { fill: var(--paper-2); }
#mode-dwg svg .fn { fill: none; }
#mode-dwg svg .fw { fill: var(--dwg-paper); }
#mode-dwg svg .fi { fill: var(--dwg-ink); stroke: none; }
#mode-dwg svg .hitf { fill: transparent; stroke: none; }
#mode-dwg svg .fsteel { fill: var(--dwg-ink); fill-opacity: .5; }
#mode-dwg svg .fperl { fill: url(#dwg-p-perl); }
#mode-dwg svg .fbrick { fill: url(#dwg-p-brick); }
#mode-dwg svg .fclay { fill: url(#dwg-p-clay); }
#mode-dwg svg .fdoor { fill: url(#dwg-p-door); }
#mode-dwg svg .fshell { fill: var(--dwg-ink); }
#mode-dwg svg .pbg { fill: var(--dwg-paper); }
#mode-dwg svg .pl { stroke: var(--dwg-ink); stroke-width: .18; fill: none; }
#mode-dwg svg .pd { fill: var(--dwg-ink); stroke: none; }
#mode-dwg svg .hl { stroke-width: 1.1px; }
#mode-dwg svg g.pt:focus-visible { outline: none; }
#mode-dwg svg g.pt:focus-visible .sh, #mode-dwg svg g.pt:focus-visible .hid, #mode-dwg svg g.pt:focus-visible .rf { stroke: var(--hl); stroke-width: 1px; }
#mode-dwg .note-sw { display: inline-block; width: 14px; height: 10px; border: 1px solid var(--rule); vertical-align: middle; margin-right: 6px; }
`;

  const side = api.$('#dwg-side');
  const stage = api.$('#dwg-stage');
  const noteEl = api.$('#dwg-note');
  noteEl.textContent = '寸法は oven.json から描く。値の多くは仮。尺度は A3 に印刷したとき 1:20。';
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
    const frame = frameEls(d, M);
    svg.setAttribute('aria-label', `${d.id} ${d.title}`);
    svg.replaceChildren(defs, frame[0], frame[1], L.body, L.dim, L.txt, ...L.extra, legendEls(d.id === 'BO-DWG-003'), frame[2]);
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
      g.querySelectorAll('.sh, .hid, .rf').forEach((n) => n.classList.toggle('hl', hit));
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
