// フローモード。焚き方と焼き方の手順を、レーン（窯と生地）に分けた流れ図で見せる。
// データは nav.json の lanes、steps、edges。配置は列と段の番号から計算する。
NavApp.register('flow', (api) => {
  'use strict';

  const D = api.data;
  const { el, esc } = api;

  // ---------- 配置の寸法（SVG の座標）
  const HEAD_W = 110; // レーン見出しの帯の幅
  const COL_W = 180; // 列の幅
  const ROW_H = 120; // 段の高さ
  const STEP_W = 150;
  const STEP_H = 58;
  const GATE_W = 130;
  const GATE_H = 74;
  const DETOUR = 26; // 下を回る道の深さ
  const SHIFT = 14; // 同じ列の往復をずらす幅
  const START_W = 860; // 最初に見せる横幅（全体は 2000 を超え、文字が読めなくなるため）

  // ---------- この図だけの CSS（#mode-flow で始める）
  const css = `
#mode-flow .fl-head { fill: var(--card); }
#mode-flow .fl-band0 { fill: var(--paper); }
#mode-flow .fl-band1 { fill: var(--paper-2); }
#mode-flow .fl-sep { stroke: var(--rule); stroke-width: 1; fill: none; }
#mode-flow .fl-lane { font-size: 20px; font-weight: 700; fill: var(--ink); writing-mode: vertical-rl; text-orientation: upright; letter-spacing: 2px; }
#mode-flow .fl-shape { fill: var(--node); stroke: var(--node-stroke); stroke-width: 1.6; }
#mode-flow .fl-shape.gate { fill: var(--gate); }
#mode-flow .fl-name { font-size: 13px; fill: var(--ink); pointer-events: none; }
#mode-flow .fl-step { cursor: pointer; }
#mode-flow .fl-edge .ln { fill: none; stroke: var(--muted); stroke-width: 2; }
#mode-flow .fl-edge.no .ln { stroke: var(--accent); }
#mode-flow .fl-edge.once .ln { stroke-dasharray: 7 5; }
#mode-flow .fl-edge, #mode-flow .fl-label { pointer-events: none; }
#mode-flow marker path { fill: var(--muted); stroke: none; }
#mode-flow marker.no path { fill: var(--accent); }
#mode-flow .fl-label rect { fill: var(--card); stroke: var(--rule); stroke-width: 1; }
#mode-flow .fl-label text { font-size: 11px; fill: var(--ink); }
#mode-flow .fl-label.no text { fill: var(--accent); font-weight: 700; }
#mode-flow .dim { opacity: .22; }
#mode-flow .side .row .mark { color: var(--muted); }
`;
  document.head.append(el('style', { 'data-mode': 'flow', text: css }));

  // ---------- 索引と座標
  const steps = D.steps;
  const byId = new Map(steps.map((s) => [s.id, s]));
  const lanes = D.lanes;
  const rowsOf = {};
  for (const l of lanes) rowsOf[l.id] = 1;
  for (const s of steps) rowsOf[s.lane] = Math.max(rowsOf[s.lane], s.row + 1);
  const laneTop = {};
  let H = 0;
  for (const l of lanes) { laneTop[l.id] = H; H += rowsOf[l.id] * ROW_H; }
  const maxCol = Math.max(...steps.map((s) => s.col));
  const W = HEAD_W + (maxCol + 1) * COL_W;

  const isGate = (s) => s.kind === 'gate';
  const half = (s) => (isGate(s) ? { w: GATE_W / 2, h: GATE_H / 2 } : { w: STEP_W / 2, h: STEP_H / 2 });
  const cpos = (s) => ({ x: HEAD_W + s.col * COL_W + COL_W / 2, y: laneTop[s.lane] + s.row * ROW_H + ROW_H / 2 });

  // 日本語の文字幅のおおよそ（em）。折り返しと札の幅に使う。
  function emWidth(str) {
    let w = 0;
    for (const ch of str) w += /[ -~]/.test(ch) ? (ch === ' ' ? 0.3 : 0.58) : 1;
    return w;
  }
  function wrap(name, maxEm) {
    const lines = [''];
    for (const ch of name) {
      const cur = lines[lines.length - 1];
      if (emWidth(cur + ch) > maxEm && cur) lines.push(ch);
      else lines[lines.length - 1] = cur + ch;
    }
    if (lines.length > 2) {
      lines.length = 2;
      lines[1] = lines[1].slice(0, -1) + '…';
    }
    return lines;
  }

  // ---------- 矢印の道筋
  function stepsBetween(a, b) {
    return steps.some((s) => s !== a && s !== b && s.lane === a.lane && s.row === a.row
      && s.col > Math.min(a.col, b.col) && s.col < Math.max(a.col, b.col));
  }
  // 同じ列で上下に並ぶ 2 つの間は、ひし形の辺に沿って縁の高さが変わる。
  function edgeHalfAt(s, dx) {
    const h = half(s);
    return isGate(s) ? h.h * (1 - Math.abs(dx) / h.w) : h.h;
  }

  function route(e) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    const A = cpos(a);
    const B = cpos(b);
    const ha = half(a);
    const hb = half(b);
    const sameCell = a.lane === b.lane && a.row === b.row;
    let pts;
    let kind;
    if (sameCell && b.col > a.col && !stepsBetween(a, b)) {
      pts = [[A.x + ha.w, A.y], [B.x - hb.w, B.y]];
      kind = 'straight';
    } else if (sameCell) {
      // 戻る、または間に工程がある道は、両方の下を回る。
      const y0 = A.y + ha.h;
      const y1 = B.y + hb.h;
      const yb = Math.max(y0, y1) + DETOUR;
      pts = [[A.x, y0], [A.x, yb], [B.x, yb], [B.x, y1]];
      kind = 'under';
    } else if (a.col === b.col) {
      const dir = B.y > A.y ? 1 : -1;
      const x = A.x + dir * SHIFT;
      pts = [[x, A.y + dir * edgeHalfAt(a, SHIFT)], [x, B.y - dir * edgeHalfAt(b, SHIFT)]];
      kind = 'column';
    } else {
      const endY = B.y < A.y ? B.y + hb.h : B.y - hb.h;
      pts = [[A.x + ha.w, A.y], [B.x, A.y], [B.x, endY]];
      kind = 'elbow';
    }
    return { pts, kind, a, b, A, B, ha, hb };
  }

  function longestSeg(pts) {
    let best = null;
    for (let i = 0; i < pts.length - 1; i++) {
      const len = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      if (!best || len > best.len) best = { len, i };
    }
    const p = pts[best.i];
    const q = pts[best.i + 1];
    return { x: (p[0] + q[0]) / 2, y: (p[1] + q[1]) / 2, len: best.len };
  }

  // ---------- 図を組む
  const svg = el('svg:svg', { xmlns: 'http://www.w3.org/2000/svg', role: 'img', 'aria-label': '焚き方と焼き方の流れ図', preserveAspectRatio: 'xMidYMid meet' });
  const mk = (id, cls) => el('svg:marker', { id, class: cls, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 9, markerHeight: 9, markerUnits: 'userSpaceOnUse', orient: 'auto' },
    [el('svg:path', { d: 'M0,0.5 L10,5 L0,9.5 z' })]);
  svg.append(el('svg:defs', {}, [mk('fl-arrow', ''), mk('fl-arrow-no', 'no')]));

  const gBands = el('svg:g');
  const gEdges = el('svg:g');
  const gNodes = el('svg:g');
  const gLabels = el('svg:g');
  svg.append(gBands, gEdges, gNodes, gLabels);

  // レーンの背景と見出し
  lanes.forEach((l, i) => {
    const y = laneTop[l.id];
    const h = rowsOf[l.id] * ROW_H;
    gBands.append(
      el('svg:rect', { x: 0, y, width: W, height: h, class: `fl-band${i % 2}` }),
      el('svg:rect', { x: 0, y, width: HEAD_W, height: h, class: 'fl-head' }),
      el('svg:line', { x1: 0, y1: y, x2: W, y2: y, class: 'fl-sep' }),
      el('svg:line', { x1: HEAD_W, y1: y, x2: HEAD_W, y2: y + h, class: 'fl-sep' }),
      el('svg:text', { x: HEAD_W / 2, y: y + h / 2, class: 'fl-lane', 'text-anchor': 'middle', text: l.name }),
    );
  });
  gBands.append(el('svg:line', { x1: 0, y1: H, x2: W, y2: H, class: 'fl-sep' }));

  // 矢印
  const edgeEls = [];
  for (const e of D.edges.map((x) => ({ from: x[0], to: x[1], label: x[2] || '' }))) {
    const r = route(e);
    const no = e.label === 'いいえ';
    const once = e.label === '初回だけ';
    const d = r.pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
    const g = el('svg:g', { class: `fl-edge${no ? ' no' : ''}${once ? ' once' : ''}`, 'data-from': e.from, 'data-to': e.to },
      [el('svg:path', { d, class: 'ln', 'marker-end': `url(#${no ? 'fl-arrow-no' : 'fl-arrow'})` })]);
    gEdges.append(g);
    let lab = null;
    if (e.label) {
      const tw = emWidth(e.label) * 11 + 10;
      const th = 16;
      const seg = longestSeg(r.pts);
      let lx = seg.x;
      let ly = seg.y;
      if (r.kind === 'straight') {
        // 短い線では、線の上、さらに狭ければ工程の上に逃がす。
        if (seg.len >= tw + 24) ly = seg.y;
        else if (seg.len >= tw + 4) ly = seg.y - th / 2 - 3;
        else ly = r.A.y - Math.max(r.ha.h, r.hb.h) - th / 2 - 4;
      }
      lab = el('svg:g', { class: `fl-label${no ? ' no' : ''}` }, [
        el('svg:rect', { x: (lx - tw / 2).toFixed(1), y: (ly - th / 2).toFixed(1), width: tw.toFixed(1), height: th, rx: 4 }),
        el('svg:text', { x: lx.toFixed(1), y: ly.toFixed(1), 'text-anchor': 'middle', 'dominant-baseline': 'central', text: e.label }),
      ]);
      gLabels.append(lab);
    }
    edgeEls.push({ from: e.from, to: e.to, nodes: lab ? [g, lab] : [g] });
  }

  // 工程と判断
  const stepEls = new Map();
  for (const s of steps) {
    const c = cpos(s);
    const h = half(s);
    const shape = isGate(s)
      ? el('svg:polygon', { class: 'fl-shape gate', points: `${c.x},${c.y - h.h} ${c.x + h.w},${c.y} ${c.x},${c.y + h.h} ${c.x - h.w},${c.y}` })
      : el('svg:rect', { class: 'fl-shape', x: c.x - h.w, y: c.y - h.h, width: STEP_W, height: STEP_H, rx: 10 });
    const lines = wrap(s.name, isGate(s) ? 6.4 : 10);
    const text = el('svg:text', { class: 'fl-name', 'text-anchor': 'middle', x: c.x, y: c.y + (lines.length === 1 ? 0 : -8), 'dominant-baseline': 'central' });
    lines.forEach((ln, i) => text.append(el('svg:tspan', { x: c.x, dy: i ? 17 : 0, text: ln })));
    const g = el('svg:g', { class: 'fl-step', 'data-step': s.id, tabindex: 0, role: 'button', 'aria-label': `${isGate(s) ? '判断 ' : ''}${s.name}` }, [shape, text]);
    g.addEventListener('click', () => api.select('step', s.id, { push: true }));
    g.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); api.select('step', s.id, { push: true }); }
    });
    const showTip = (ev) => api.tip(`<b>${esc(s.name)}</b><br>${esc(s.desc || '')}`, ev.clientX, ev.clientY);
    g.addEventListener('mouseenter', showTip);
    g.addEventListener('mousemove', showTip);
    g.addEventListener('mouseleave', () => api.tip(null));
    gNodes.append(g);
    stepEls.set(s.id, { g, shape });
  }

  // ---------- 置き場
  const stage = api.$('#flow-stage');
  const side = api.$('#flow-side');
  api.$('#flow-note').textContent = '付録 焚き方と焼き方の手順を図にしたもの。◇ は判断。破線は初回だけ。';
  stage.append(svg);
  const pz = api.panZoom(svg, stage, [0, 0, W, H], [0, 0, Math.min(W, START_W), H]);

  // 左の一覧
  const rowEls = new Map();
  for (const l of D.lanes) {
    side.append(el('h2', { text: l.name }));
    const list = steps.filter((s) => s.lane === l.id).sort((p, q) => p.col - q.col || p.row - q.row);
    for (const s of list) {
      const b = el('button', { type: 'button', class: 'row', 'aria-pressed': 'false', 'data-id': s.id }, [
        isGate(s) ? el('span', { class: 'mark', text: '◇' }) : null,
        el('span', { text: s.name }),
      ]);
      b.addEventListener('click', () => api.select('step', s.id, { push: true, reveal: true }));
      side.append(b);
      rowEls.set(s.id, b);
    }
  }

  // ---------- 選択の反映
  function highlight(sel, opts = {}) {
    const rel = api.related(sel);
    const active = !!(sel && sel.kind) && rel.steps.size > 0;
    const isStep = sel && sel.kind === 'step';
    // 工程を選んだときは、前後の工程と矢印を薄くしない（流れが読めるように）。
    const near = new Set(rel.steps);
    if (isStep) {
      for (const [a, b] of api.data.edges) {
        if (a === sel.id) near.add(b);
        if (b === sel.id) near.add(a);
      }
    }
    for (const [id, o] of stepEls) {
      const on = rel.steps.has(id);
      o.shape.classList.toggle('hl', on);
      o.shape.classList.toggle('hlfill', isStep && sel.id === id);
      o.g.classList.toggle('dim', active && !near.has(id));
      const row = rowEls.get(id);
      const isSel = isStep && sel.id === id;
      row.classList.toggle('sel', on);
      row.classList.toggle('dim', active && !near.has(id));
      row.setAttribute('aria-pressed', String(isSel));
    }
    for (const e of edgeEls) {
      const lit = (rel.steps.has(e.from) && rel.steps.has(e.to))
        || (isStep && (e.from === sel.id || e.to === sel.id));
      for (const n of e.nodes) n.classList.toggle('dim', active && !lit);
    }
    if (opts.reveal && active) {
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      for (const id of rel.steps) {
        const s = byId.get(id);
        if (!s) continue;
        const c = cpos(s);
        const h = half(s);
        x0 = Math.min(x0, c.x - h.w); y0 = Math.min(y0, c.y - h.h);
        x1 = Math.max(x1, c.x + h.w); y1 = Math.max(y1, c.y + h.h);
      }
      if (x0 < Infinity) pz.reveal(x0, y0, x1 - x0, y1 - y0, false);
    }
  }

  return {
    enter() { /* 図は組み済み。選択の反映は外枠が highlight で呼ぶ。 */ },
    leave() { api.tip(null); },
    params() { return {}; },
    highlight,
    escape() { return false; },
  };
});
