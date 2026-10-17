// 系統図モード。熱、煙、蒸気の流れを、見方（sheets）ごとに描く。
// 要素は pos を中心に置き、流れは要素の辺から辺へ、角を曲がる道でつなぐ。
NavApp.register('sys', (api) => {
  'use strict';

  const D = api.data;
  const { el, esc } = api;
  const $side = api.$('#sys-side');
  const $stage = api.$('#sys-stage');
  const $note = api.$('#sys-note');

  const W = 136;
  const H = 48;
  const HW = W / 2;
  const HH = H / 2;
  const PORT = 12; // 同じ辺に複数の線が出入りするときの間隔

  const sheetOf = (id) => D.sheets.find((s) => s.id === id);
  let cur = D.sheets[0] ? (sheetOf('bake') || D.sheets[0]).id : null;
  if (!cur) return null;
  let active = false;
  let svg = null;
  let pz = null;
  let curSel = { kind: null, id: null };

  // ---------- 独自の CSS
  const style = document.createElement('style');
  style.textContent = `
    #mode-sys .el rect { fill: var(--node); stroke: var(--node-stroke); stroke-width: 1.6; }
    #mode-sys .el.node rect { stroke-dasharray: 6 4; }
    #mode-sys .el text { font-size: 13px; text-anchor: middle; pointer-events: none; }
    #mode-sys .el.sel rect { stroke-width: 3.5; }
    #mode-sys .lbl { font-size: 11px; fill: var(--muted); paint-order: stroke; stroke: var(--paper); stroke-width: 4px; stroke-linejoin: round; pointer-events: none; }
    #mode-sys .edge .ln { transition: stroke-width .1s; }
    #mode-sys .edge.hl .ln { stroke-width: 4.2; }
    #mode-sys .el:focus-visible, #mode-sys .edge:focus-visible { outline: none; }
    #mode-sys .el:focus-visible rect { stroke: var(--focus-2); stroke-width: 3.5; }
    #mode-sys .edge:focus-visible .hit { stroke: var(--focus-1); stroke-opacity: .6; }
    #mode-sys .side .row .tag { margin-left: auto; font-size: 11px; color: var(--muted); white-space: nowrap; }
    #mode-sys .side .row .ln { display: none; }
  `;
  document.head.append(style);

  // ---------- 経路
  const CATCOLOR = (c) => `var(--line-${c})`;
  const catOfFlow = (f) => D.media[f.media].cat;

  // 名前を最大 2 行に分ける。
  function wrapName(name) {
    const i = name.indexOf('（');
    if (i > 0) return [name.slice(0, i), name.slice(i)];
    if (name.length > 9) {
      const h = Math.ceil(name.length / 2);
      return [name.slice(0, h), name.slice(h)];
    }
    return [name];
  }

  // 1 本の流れの種類と、出る辺、入る辺を決める。辺は R L T B。
  function plan(a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    let horiz = Math.abs(dx) >= Math.abs(dy);
    if (horiz && Math.abs(dx) < W + 14) horiz = false;
    if (!horiz && Math.abs(dy) < H + 14 && Math.abs(dx) >= W + 14) horiz = true;
    if (horiz) {
      const sa = dx > 0 ? 'R' : 'L';
      if (Math.abs(dy) >= H - 8) return { kind: 'hL', sa, sb: dy > 0 ? 'T' : 'B' };
      return { kind: 'hZ', sa, sb: dx > 0 ? 'L' : 'R' };
    }
    const sa = dy > 0 ? 'B' : 'T';
    if (Math.abs(dx) >= HW + 14) return { kind: 'vL', sa, sb: dx > 0 ? 'L' : 'R' };
    return { kind: 'vZ', sa, sb: dy > 0 ? 'T' : 'B' };
  }

  function routes(sh) {
    const list = sh.flows.map((f, i) => {
      const a = sh.pos[f[0]];
      const b = sh.pos[f[1]];
      return { i, id: `${sh.id}:${i}`, f, a, b, ...plan(a, b), oa: 0, ob: 0 };
    });
    // 同じ要素の同じ辺を使う線は、辺に沿って並べる。
    const groups = new Map();
    const add = (key, e, end, other) => {
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ e, end, other });
    };
    for (const e of list) {
      add(e.f[0] + '/' + e.sa, e, 'oa', e.b);
      add(e.f[1] + '/' + e.sb, e, 'ob', e.a);
    }
    for (const [key, g] of groups) {
      const side = key.split('/')[1];
      const axis = side === 'R' || side === 'L' ? 1 : 0;
      g.sort((p, q) => p.other[axis] - q.other[axis] || p.e.i - q.e.i);
      g.forEach((m, k) => { m.e[m.end] = (k - (g.length - 1) / 2) * PORT; });
    }
    for (const e of list) {
      const [ax, ay] = e.a;
      const [bx, by] = e.b;
      const sx = bx > ax ? 1 : -1;
      const sy = by > ay ? 1 : -1;
      let pts;
      if (e.kind === 'hL') {
        pts = [[ax + sx * HW, ay + e.oa], [bx + e.ob, ay + e.oa], [bx + e.ob, by - sy * HH]];
      } else if (e.kind === 'vL') {
        pts = [[ax + e.oa, ay + sy * HH], [ax + e.oa, by + e.ob], [bx - sx * HW, by + e.ob]];
      } else if (e.kind === 'hZ') {
        const x1 = ax + sx * HW;
        const x2 = bx - sx * HW;
        const m = (x1 + x2) / 2;
        pts = [[x1, ay + e.oa], [m, ay + e.oa], [m, by + e.ob], [x2, by + e.ob]];
      } else {
        const y1 = ay + sy * HH;
        const y2 = by - sy * HH;
        const m = (y1 + y2) / 2;
        pts = [[ax + e.oa, y1], [ax + e.oa, m], [bx + e.ob, m], [bx + e.ob, y2]];
      }
      // 一直線にそろった点は 1 本にまとめる。
      const out = [pts[0]];
      for (let k = 1; k < pts.length; k++) {
        const p = pts[k];
        const q = out[out.length - 1];
        if (Math.abs(p[0] - q[0]) < 0.5 && Math.abs(p[1] - q[1]) < 0.5) continue;
        out.push(p);
      }
      e.pts = out;
    }
    return list;
  }

  // 一番長い線分の中ほどに名前の置き場所を決める。置けなければ null。
  function labelSpot(pts, text) {
    let best = null;
    for (let k = 1; k < pts.length; k++) {
      const [x1, y1] = pts[k - 1];
      const [x2, y2] = pts[k];
      const len = Math.abs(x2 - x1) + Math.abs(y2 - y1);
      if (!best || len > best.len) best = { len, x1, y1, x2, y2, horiz: Math.abs(y2 - y1) < Math.abs(x2 - x1) };
    }
    if (!best) return null;
    const tw = text.length * 11 + 6;
    const mx = (best.x1 + best.x2) / 2;
    const my = (best.y1 + best.y2) / 2;
    if (best.horiz) {
      if (best.len < tw + 14) return null;
      return { x: mx, y: my - 6, anchor: 'middle' };
    }
    if (best.len < 30) return null;
    return { x: mx + 7, y: my + 4, anchor: 'start' };
  }

  // ---------- 描画
  function ensureSvg() {
    if (svg) return;
    svg = el('svg:svg', { role: 'group', 'aria-label': '系統図' });
    $stage.append(svg);
    pz = api.panZoom(svg, $stage, [0, 0, 1000, 500]);
    svg.addEventListener('click', onClick);
    svg.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      if (!e.target.closest) return;
      e.preventDefault();
      onClick(e);
    });
    svg.addEventListener('mousemove', onMove);
    svg.addEventListener('mouseleave', () => api.tip(null));
  }

  function onClick(e) {
    const fl = e.target.closest('[data-flow]');
    if (fl) { api.select('flow', fl.dataset.flow, { push: true }); return; }
    const p = e.target.closest('[data-part]');
    if (p) {
      const t = api.thing(p.dataset.part);
      if (t) api.select(t.kind, t.id, { push: true });
    }
  }

  function onMove(e) {
    const g = e.target.closest ? e.target.closest('[data-flow]') : null;
    if (!g) { api.tip(null); return; }
    const f = api.flow(g.dataset.flow);
    if (!f) { api.tip(null); return; }
    const m = D.media[f.media];
    api.tip(`<b>${esc(m.name)}</b>${f.note ? '<br>' + api.srcHtml(f.note) : ''}`, e.clientX, e.clientY);
  }

  function render() {
    const sh = sheetOf(cur);
    ensureSvg();
    svg.setAttribute('aria-label', sh.title);
    svg.replaceChildren();

    const defs = el('svg:defs');
    for (const c of Object.keys(D.categories)) {
      const mk = el('svg:marker', {
        id: `sys-ar-${c}`, markerWidth: 10, markerHeight: 8, refX: 9, refY: 4, orient: 'auto', markerUnits: 'userSpaceOnUse',
      }, [el('svg:path', { d: 'M0,0 L10,4 L0,8 z', style: `fill:${CATCOLOR(c)}` })]);
      defs.append(mk);
    }
    svg.append(defs);

    const edges = el('svg:g', { class: 'edges' });
    for (const r of routes(sh)) {
      const f = api.flow(r.id);
      const cat = catOfFlow(f);
      const m = D.media[f.media];
      const d = r.pts.map((p, k) => `${k ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      const g = el('svg:g', {
        class: `edge cat-${cat}`, 'data-flow': r.id, tabindex: 0, role: 'button',
        'aria-label': `${api.thing(f.from).name}から${api.thing(f.to).name}へ、${m.name}`,
      }, [
        el('svg:path', { class: 'hit', d }),
        el('svg:path', { class: 'ln', d, 'marker-end': `url(#sys-ar-${cat})` }),
      ]);
      const spot = labelSpot(r.pts, m.name);
      if (spot) g.append(el('svg:text', { class: 'lbl', x: spot.x.toFixed(1), y: spot.y.toFixed(1), 'text-anchor': spot.anchor, text: m.name }));
      edges.append(g);
    }
    svg.append(edges);

    const els = el('svg:g', { class: 'els' });
    for (const [id, [x, y]] of Object.entries(sh.pos)) {
      const t = api.thing(id);
      if (!t) continue;
      const isNode = t.kind === 'node';
      const lines = wrapName(t.name);
      const g = el('svg:g', {
        class: `el ${t.kind}`, 'data-part': id, tabindex: 0, role: 'button', 'aria-label': t.name,
      }, [el('svg:rect', { x: x - HW, y: y - HH, width: W, height: H, rx: isNode ? 24 : 8 })]);
      const text = el('svg:text', {});
      lines.forEach((ln, k) => {
        const dy = lines.length === 1 ? 5 : (k === 0 ? -2 : 13);
        text.append(el('svg:tspan', { x, y: y + dy, text: ln, style: lines.length > 1 && k === 1 ? 'font-size:11px' : null }));
      });
      g.append(text);
      els.append(g);
    }
    svg.append(els);

    // 要素の外接の箱に余白をつけた範囲に収める。
    const ps = Object.values(sh.pos);
    const pad = 36;
    const bx0 = Math.min(...ps.map((p) => p[0])) - HW - pad;
    const bx1 = Math.max(...ps.map((p) => p[0])) + HW + pad;
    const by0 = Math.min(...ps.map((p) => p[1])) - HH - pad;
    const by1 = Math.max(...ps.map((p) => p[1])) + HH + pad;
    pz.reset([bx0, by0, bx1 - bx0, by1 - by0]);
    $note.textContent = sh.caption;
    renderSide();
    paint(false);
  }

  function renderSide() {
    const sh = sheetOf(cur);
    const box = el('div', {});
    box.append(el('h2', { text: '見方' }));
    for (const s of D.sheets) {
      const b = el('button', { type: 'button', class: 'row', 'aria-pressed': String(s.id === cur), 'data-view': s.id, text: s.title });
      box.append(b);
    }
    box.append(el('h2', { text: '凡例' }));
    const lg = el('div', { class: 'legend' });
    for (const [c, v] of Object.entries(D.categories)) {
      lg.append(el('div', {}, [el('span', { class: `ln cat-${c}` }), v.name]));
    }
    box.append(lg);
    box.append(el('h2', { text: 'この見方に出る要素' }));
    for (const id of Object.keys(sh.pos)) {
      const t = api.thing(id);
      if (!t) continue;
      box.append(el('button', {
        type: 'button', class: 'row', 'data-sel': `${t.kind}:${id}`, 'data-id': id,
        'aria-pressed': 'false',
      }, [t.name, t.kind === 'node' ? el('span', { class: 'tag', text: '要素' }) : null]));
    }
    $side.replaceChildren(box);
  }

  // ---------- 光らせる
  function paint(reveal) {
    if (!svg || !active) return;
    const sh = sheetOf(cur);
    const has = !!curSel.kind;
    const rel = api.related(curSel);
    const ends = new Set();
    const flowsHere = [];
    if (has) {
      sh.flows.forEach((f, i) => {
        const id = `${sh.id}:${i}`;
        if (rel.flows.has(id)) { flowsHere.push(id); ends.add(f[0]); ends.add(f[1]); }
      });
    }
    const partsHere = [...rel.parts].filter((p) => p in sh.pos);
    const dimOn = has && (partsHere.length > 0 || flowsHere.length > 0);
    const keep = new Set([...partsHere, ...ends]);
    const isEl = curSel.kind === 'part' || curSel.kind === 'node';

    svg.querySelectorAll('[data-part]').forEach((g) => {
      const id = g.dataset.part;
      const r = g.querySelector('rect');
      const on = rel.parts.has(id);
      const me = isEl && curSel.id === id;
      g.classList.toggle('dim', dimOn && !keep.has(id));
      g.classList.toggle('sel', me);
      r.classList.toggle('hl', on);
      r.classList.toggle('hlfill', me);
      g.setAttribute('aria-pressed', String(me));
    });
    svg.querySelectorAll('[data-flow]').forEach((g) => {
      const on = rel.flows.has(g.dataset.flow);
      g.classList.toggle('hl', on);
      g.querySelector('.ln').classList.toggle('hl', on);
      g.classList.toggle('dim', dimOn && !on);
      g.setAttribute('aria-pressed', String(curSel.kind === 'flow' && curSel.id === g.dataset.flow));
    });
    $side.querySelectorAll('.row[data-id]').forEach((b) => {
      const id = b.dataset.id;
      const me = isEl && curSel.id === id;
      b.classList.toggle('sel', me);
      b.classList.toggle('dim', dimOn && !keep.has(id));
      b.setAttribute('aria-pressed', String(me));
    });

    if (reveal && has) {
      let target = null;
      if (isEl && curSel.id in sh.pos) target = [curSel.id];
      else if (curSel.kind === 'flow') {
        const f = api.flow(curSel.id);
        if (f && f.sheet === cur) target = [f.from, f.to];
      }
      if (target) {
        const xs = target.map((id) => sh.pos[id]);
        const x0 = Math.min(...xs.map((p) => p[0])) - HW;
        const x1 = Math.max(...xs.map((p) => p[0])) + HW;
        const y0 = Math.min(...xs.map((p) => p[1])) - HH;
        const y1 = Math.max(...xs.map((p) => p[1])) + HH;
        pz.reveal(x0, y0, x1 - x0, y1 - y0, false);
      }
    }
  }

  function setView(id) {
    if (!sheetOf(id)) return false;
    const changed = id !== cur;
    cur = id;
    if (active && changed) render();
    return changed;
  }

  $side.addEventListener('click', (e) => {
    const b = e.target.closest('[data-view]');
    if (!b) return;
    if (setView(b.dataset.view)) {
      paint(true);
      api.writeUrl(true);
    }
  });

  return {
    enter(params) {
      if (params && params.v && sheetOf(params.v)) cur = params.v;
      active = true;
      render();
    },
    leave() {
      active = false;
      api.tip(null);
    },
    params() { return { v: cur }; },
    highlight(sel, opts = {}) {
      curSel = sel && sel.kind ? { kind: sel.kind, id: sel.id } : { kind: null, id: null };
      let moved = false;
      if (curSel.kind === 'flow') {
        const f = api.flow(curSel.id);
        if (f && f.sheet !== cur) moved = setView(f.sheet);
      } else if ((curSel.kind === 'part' || curSel.kind === 'node') && opts.reveal) {
        if (!(curSel.id in sheetOf(cur).pos)) {
          const to = api.sheetsOf(curSel.id)[0];
          if (to) moved = setView(to);
        }
      }
      paint(!!opts.reveal || moved);
    },
    escape() { return false; },
  };
});
