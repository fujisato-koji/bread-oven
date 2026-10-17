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
  const ORDER = ['foundation', 'stand', 'slab', 'hearthIns', 'hearth', 'chamber', 'mass', 'insulation', 'shell', 'landing', 'door', 'chimney', 'roof', 'wood'];

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

  // ---------- 寸法を読む（viewer/main.js の build() と同じ式）

  function model() {
    const pr = api.oven.params;
    const P = (k) => {
      if (!pr[k] || pr[k].v == null) throw new Error(`oven.json に ${k} がありません`);
      return pr[k].v;
    };
    const m = {};
    m.yFt = P('foundation.top');
    m.yFb = m.yFt - P('foundation.thickness');
    m.yStandTop = m.yFt + P('stand.height');
    m.ySlabTop = m.yStandTop + P('hearth.slab');
    m.yInsTop = m.ySlabTop + P('hearth.insulation');
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
    m.hi = P('hearth.insulation');
    m.hs = P('hearth.slab');

    m.mg = P('stand.margin');
    m.sw = 2 * (m.Ro + m.mg);
    m.sd = m.zFront - m.zBack + 2 * m.mg;
    m.sz = (m.zBack + m.zFront) / 2;
    m.wt = P('stand.wall');
    m.sh2 = P('stand.height');
    m.fm = P('foundation.margin');
    m.fw = m.sw + 2 * m.fm;
    m.fd = m.sd + 2 * m.fm;

    m.logR = 0.05;
    m.innerW = m.sw - 2 * m.wt;
    m.nPer = Math.max(1, Math.floor((m.innerW - 0.04) / (2 * m.logR)));
    m.logLen = Math.min(0.45, m.sd - m.wt - 0.1);

    m.po = P('roof.post_offset');
    m.px = m.Ro + m.mg + m.po;
    m.pz0 = m.zBack - m.mg - m.po;
    m.pz1 = m.zFront + m.mg + m.po;
    m.eave = P('roof.eave');
    m.ridge = P('roof.ridge');
    m.oh = P('roof.overhang');
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
      // コンクリート: 斜線と粗い点
      pat('dwg-p-conc', 8, [pathEl('M0 8 L8 0 M-1 1 L1 -1 M7 9 L9 7', 'pl'), dot(2, 2, 0.5), dot(6, 6, 0.5)]),
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
      const mats = [['fconc', 'コンクリート'], ['fperl', 'パーライト（断熱）'], ['fbrick', '耐火レンガ'], ['fclay', '粘土と砂'], ['fshell', '外殻'], ['fdoor', '扉']];
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
    const { sz, sd, sw, fw, fd, Ro, R, zBack, zFront } = M;

    part(L, 'foundation', rc(-fw / 2, sz - fd / 2, fw / 2, sz + fd / 2, 'sh fp'));
    part(L, 'slab', rc(-sw / 2, sz - sd / 2, sw / 2, sz + sd / 2, 'sh fp'));
    part(L, 'hearthIns', rc(-Ro, zBack, Ro, zFront, 'sh fp'));
    part(L, 'shell', circEl(X(0), Z(0), Ro * S, 'sh fp'));
    // ドームの各層の境（上からは隠れる）
    const ring = (r) => hid(circEl(X(0), Z(0), r * S));
    part(L, 'chamber', [ring(R), ring(R + M.offs[1])]);
    part(L, 'mass', ring(R + M.offs[2]));
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

    // 薪置きと台の内側（床版の下で隠れる）
    const wz1 = sz + sd / 2 - 0.05;
    part(L, 'wood', hid(rc(-M.innerW / 2 + 0.02, wz1 - M.logLen, M.innerW / 2 - 0.02, wz1)));
    const ux = sw / 2 - M.wt;
    part(L, 'stand', hid(pathEl(`M ${P2([X(-ux), Z(sz + sd / 2)], [X(-ux), Z(sz - sd / 2 + M.wt)], [X(ux), Z(sz - sd / 2 + M.wt)], [X(ux), Z(sz + sd / 2)])}`)));

    // 屋根と柱
    const roofKids = [];
    const rfRect = rc(-M.run, M.pz0 - M.oh, M.run, M.pz1 + M.oh, 'rf');
    roofKids.push(rfRect, hitOf(rfRect), lineEl(X(0), Z(M.pz0 - M.oh), X(0), Z(M.pz1 + M.oh), 'rf'));
    for (const x of [-M.px, M.px]) {
      for (const z of [M.pz0, M.pz1]) roofKids.push(rc(x - M.post / 2, z - M.post / 2, x + M.post / 2, z + M.post / 2, 'sh fp'));
    }
    part(L, 'roof', roofKids);

    // 中心線
    L.body.append(lineEl(X(0), Z(-1.68), X(0), Z(2.02), 'ctr'));
    L.body.append(lineEl(X(-1.15), Z(0), X(1.15), Z(0), 'ctr'));

    // 寸法
    dimH(L, X(-R), X(R), Z(0), `内径 ${mm(2 * R)}`);
    dimH(L, X(-Ro), X(Ro), Z(0.27), `外径 ${mm(2 * Ro)}`, { ext: [Z(0), Z(0)] });
    dimH(L, X(-sw / 2), X(sw / 2), Z(-1.2), `台の幅 ${mm(sw)}`, { ext: [Z(sz - sd / 2), Z(sz - sd / 2)] });
    dimH(L, X(-M.px), X(M.px), Z(-1.75), `柱の間隔 ${mm(2 * M.px)}`, { ext: [Z(M.pz0), Z(M.pz0)] });
    dimV(L, Z(Ro), Z(zFront), X(1.75), `前室の奥行 ${mm(zFront - Ro)}`, { ext: [X(hw), X(hw)] });
    dimV(L, Z(sz - sd / 2), Z(sz + sd / 2), X(1.95), `台の奥行 ${mm(sd)}`, { ext: [X(sw / 2), X(sw / 2)] });
    dimV(L, Z(M.pz0), Z(M.pz1), X(2.15), `柱の間隔 ${mm(M.pz1 - M.pz0)}`, { ext: [X(M.px), X(M.px)] });
    L.extra.push(caption('平面図  S=1:20'));
  }

  // ---------- 正面図 BO-DWG-002

  function drawElev(L, M) {
    const ox = 102.5;
    const gy = 195;
    const X = (x) => ox + x * S;
    const Y = (y) => gy - y * S;
    const rc = (x0, y0, x1, y1, cls) => rectEl(X(x0), Y(y0), X(x1), Y(y1), cls);
    const { sw, fw, Ro, R, H, yFt, yFb, yStandTop, ySlabTop, yInsTop, yFloor } = M;
    const top = M.outerTop;

    groundLine(L, X(-2.0), X(2.0), Y(0));

    // 基礎。地面の下は隠れ線。
    part(L, 'foundation', [rc(-fw / 2, 0, fw / 2, yFt, 'sh fp'), ...hid(rc(-fw / 2, yFb, fw / 2, 0))]);
    // 台。前は薪置きの開口。
    const ux = sw / 2 - M.wt;
    part(L, 'stand', [rc(-sw / 2, yFt, sw / 2, yStandTop, 'sh fp'), rc(-ux, yFt, ux, yStandTop, 'sh fo')]);
    const logs = [];
    for (let row = 0; row < 3; row++) {
      for (let i = 0; i < M.nPer - (row % 2); i++) {
        const x0 = -M.innerW / 2 + 0.02 + M.logR + (row % 2) * M.logR;
        logs.push(circEl(X(x0 + i * 2 * M.logR), Y(yFt + M.logR + row * M.logR * 1.75), M.logR * S, 'sh fw'));
      }
    }
    part(L, 'wood', logs);
    part(L, 'slab', rc(-sw / 2, yStandTop, sw / 2, ySlabTop, 'sh fp'));
    part(L, 'hearthIns', rc(-Ro, ySlabTop, Ro, yInsTop, 'sh fp'));

    // ドーム。外形は外殻の半楕円。内側の層は前室の後ろに隠れる。
    const arc = (r, h) => hid(pathEl(`M ${P2([X(-r), Y(yFloor)])} ${halfArc(X(-r), X(r), Y(yFloor), r * S, h * S, 1)}`));
    part(L, 'hearth', hid(rc(-R, yInsTop, R, yFloor)));
    part(L, 'chamber', [...arc(R, H), ...arc(R + M.offs[1], H + M.offs[1])]);
    part(L, 'mass', arc(R + M.offs[2], H + M.offs[2]));
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

    // 屋根と柱
    const roofKids = [];
    const rfPath = pathEl(`M ${P2([X(-M.run), Y(M.eave)], [X(0), Y(M.ridge)], [X(M.run), Y(M.eave)])}`, 'rf');
    roofKids.push(rfPath, hitOf(rfPath));
    for (const x of [-M.px, M.px]) {
      roofKids.push(rc(x - M.post / 2, 0, x + M.post / 2, M.eave, 'sh fp'));
    }
    part(L, 'roof', roofKids);

    // 中心線
    L.body.append(lineEl(X(0), Y(-0.1), X(0), Y(M.ridge + 0.15), 'ctr'));

    // 寸法。右に GL からの高さ。
    const cx = X(1.85);
    const ys = [Y(0), Y(yFt), Y(yStandTop), Y(yFloor), Y(top), Y(M.yChimTop)];
    L.dim.append(lineEl(cx, ys[0], cx, ys[5]));
    const lv = [
      [0, 'GL 0', null, 2.8],
      [yFt, `基礎の天端 GL+${mm(yFt)}`, X(fw / 2), 0.8],
      [yStandTop, `台の天端 GL+${mm(yStandTop)}`, X(sw / 2), 1],
      [yFloor, `炉床の面 GL+${mm(yFloor)}`, X(hw), 1],
      [top, `ドームの頂 GL+${mm(top)}`, X(0.09), 1],
      [M.yChimTop, `煙突の頂 GL+${mm(M.yChimTop)}`, X(M.rc), 1],
    ];
    for (const [y, s, ex, dy] of lv) {
      L.dim.append(lineEl(cx - 1.3, Y(y) + 1.3, cx + 1.3, Y(y) - 1.3));
      if (ex != null) L.dim.append(lineEl(ex + 1, Y(y), cx + 2, Y(y)));
      text(L, cx + 3, Y(y) + dy, s, { anchor: 'start' });
    }
    dimH(L, X(-sw / 2), X(sw / 2), Y(-0.34), `台の幅 ${mm(sw)}`, { ext: [Y(-0.12), Y(-0.12)] });
    dimH(L, X(-fw / 2), X(fw / 2), Y(-0.52), `基礎の幅 ${mm(fw)}`, { ext: [Y(yFb), Y(yFb)] });
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
    const { R, H, sz, sd, fd, Ro, zBack, zFront, yFt, yFb, yStandTop, ySlabTop, yInsTop, yFloor } = M;
    const zb = sz - sd / 2;
    const zf = sz + sd / 2;
    const hd = M.door.hd;

    // 焚き口の穴の外では層を切らないための切り抜き（穴は z > 0 で、窯の床から焚き口の高さまで）
    defs.append(e('clipPath', { id: 'dwg-cp-door' }, [
      e('path', {
        d: `M 0 0 H ${SW} V ${SH} H 0 Z M ${P2([X(0), Y(yFloor + hd)], [X(zFront + 0.3), Y(yFloor + hd)], [X(zFront + 0.3), Y(yInsTop - 0.02)], [X(0), Y(yInsTop - 0.02)])} Z`,
        'clip-rule': 'evenodd',
      }),
    ]));

    groundLine(L, X(-1.9), X(2.0), Y(0));

    part(L, 'foundation', rc(sz - fd / 2, yFb, sz + fd / 2, yFt, 'sh fconc'));
    // 台。奥の壁は切った面、手前に見える側の壁は面のまま。前は開いている。
    part(L, 'stand', [rc(zb, yFt, zf, yStandTop, 'sh fo'), rc(zb, yFt, zb + M.wt, yStandTop, 'sh fconc')]);
    const logs = [];
    const wz1 = zf - 0.05;
    for (let row = 0; row < 3; row++) {
      logs.push(rc(wz1 - M.logLen, yFt + row * M.logR * 1.75, wz1, yFt + 2 * M.logR + row * M.logR * 1.75, 'sh fw'));
    }
    part(L, 'wood', logs);
    part(L, 'slab', rc(zb, yStandTop, zf, ySlabTop, 'sh fconc'));
    part(L, 'hearthIns', rc(zBack, ySlabTop, zFront, yInsTop, 'sh fperl'));

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

    // 屋根と柱（手前の側面の柱と梁。切っていないので面のまま）
    const roofKids = [];
    const rfRect = rc(M.pz0 - M.oh, M.eave, M.pz1 + M.oh, M.ridge, 'rf');
    roofKids.push(rfRect, hitOf(rfRect));
    for (const z of [M.pz0, M.pz1]) roofKids.push(rc(z - M.post / 2, 0, z + M.post / 2, M.eave, 'sh fp'));
    roofKids.push(rc(M.pz0 - M.post / 2, M.eave - M.post, M.pz1 + M.post / 2, M.eave, 'sh fp'));
    part(L, 'roof', roofKids);

    // 窯の中心線
    L.body.append(lineEl(X(0), Y(-0.1), X(0), Y(M.ridge + 0.1), 'ctr'));

    // 寸法
    dimV(L, Y(yFloor + H), Y(yFloor), X(0), `内高 ${mm(H)}`);
    dimH(L, X(-R), X(R), Y(yFloor + 0.06), `内径 ${mm(2 * R)}`, { at: 'startRight' });
    // 炉床の面の高さ（GL から）
    dimV(L, Y(yFloor), Y(0), X(-1.05), `炉床の面 GL+${mm(yFloor)}`, { ext: [X(-Ro), null] });
    // 前室の奥行
    dimH(L, X(Ro), X(zFront), Y(1.68), `前室奥行 ${mm(zFront - Ro)}`, { ext: [Y(yFloor + hd), Y(yFloor + M.tunH)], at: 'right' });
    // 右の連続寸法（厚さと高さ）。柱の外に出す。
    const col = X(1.8);
    const lv = [yFb, yFt, yStandTop, ySlabTop, yInsTop, yFloor, yFloor + hd];
    const ex = [X(sz + fd / 2), X(sz + fd / 2), X(zf), X(zf), X(zFront), X(zFront), X(zFront)];
    chainV(L, col, lv.map(Y), [
      `基礎 ${mm(yFt - yFb)}`, `台 ${mm(M.sh2)}`, `床版 ${mm(M.hs)}`, `炉床の断熱 ${mm(M.hi)}`, `炉床 ${mm(M.th)}`, `焚き口の高さ ${mm(hd)}`,
    ], ex);
    // 層の厚さの引出線
    const lay = [
      [3, 4, 55, 1.92, `外殻 ${mm(M.shT)}`],
      [2, 3, 45, 1.77, `断熱 ${mm(M.ins)}`],
      [1, 2, 35, 1.62, `粘土と砂 ${mm(M.ms)}`],
      [0, 1, 25, 1.47, `耐火レンガ ${mm(M.t)}`],
    ];
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
#mode-dwg svg .fconc { fill: url(#dwg-p-conc); }
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
