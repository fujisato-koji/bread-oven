// タイムラインモード。製作の工程を、前後の関係と待ち（養生、乾燥）から日程に組み、横棒の図で見せる。
// データは nav.json の build（meta、phases、tasks）。日程はこの JS が、始める日と作業する日の決め方から組む。
// 日程の組み方は外枠（app.js の schedule）にあり、調達モードと同じ日程を使う。
// 左の工程名と上の日付は、図を動かしても見えるように、図の上に重ねた別の SVG で描く（クリックは下の図が受ける）。
NavApp.register('tl', (api) => {
  'use strict';

  const B = api.data.build;
  if (!B || !B.tasks.length) return null;
  const { el, esc } = api;

  // ---------- 配置の寸法（SVG の座標）
  const LABEL_W = 270; // 左の工程名の帯
  const DAY_W = 12; // 1 日の幅
  const HEAD_H = 52; // 月と日付の帯
  const PH_H = 30; // 段階の見出しの行
  const ROW_H = 28;
  const BAR_H = 14;
  const PAD_R = 130; // 右の余白（日数の札）
  const START_DAYS = 56; // 最初に見せる日数（全体だと文字が読めなくなるため）

  // ---------- この図だけの CSS（#mode-tl で始める）
  const css = `
#mode-tl .tl-bg { fill: var(--card); }
#mode-tl .tl-we { fill: var(--paper-2); }
#mode-tl .tl-ph { fill: var(--paper-2); }
#mode-tl .tl-sep { stroke: var(--rule); stroke-width: 1; }
#mode-tl .tl-tick { stroke: var(--rule); stroke-width: 1; }
#mode-tl .tl-month { font-size: 12px; font-weight: 700; fill: var(--ink); }
#mode-tl .tl-date { font-size: 11px; fill: var(--muted); }
#mode-tl .tl-phname { font-size: 14px; font-weight: 700; fill: var(--ink); }
#mode-tl .tl-name { font-size: 13px; fill: var(--ink); }
#mode-tl .tl-days { font-size: 11px; fill: var(--muted); }
#mode-tl .tl-row { cursor: pointer; }
#mode-tl .tl-hit { fill: transparent; }
#mode-tl .tl-row:hover .tl-hit { fill: var(--accent-tint); }
#mode-tl .tl-work { fill: var(--accent); stroke: var(--accent); stroke-width: 1; }
#mode-tl .tl-wait { fill: url(#tl-hatch); stroke: var(--node-stroke); stroke-width: 1; stroke-dasharray: 4 3; }
#mode-tl .tl-mile { fill: var(--gate); stroke: var(--node-stroke); stroke-width: 1.6; }
#mode-tl .tl-span { stroke: var(--node-stroke); stroke-width: 2; }
#mode-tl .tl-gap { stroke: var(--accent); stroke-width: 1.5; stroke-dasharray: 2 3; }
#mode-tl .crit .tl-work, #mode-tl .crit .tl-wait, #mode-tl .crit .tl-mile { stroke: var(--ink); stroke-width: 2.4; stroke-dasharray: none; }
#mode-tl .tl-dep { fill: none; stroke: var(--muted); stroke-width: 1; opacity: .45; }
#mode-tl .tl-dep.on { stroke: var(--hl); stroke-width: 2.2; opacity: 1; }
#mode-tl marker path { fill: var(--muted); }
#mode-tl #tl-hatch path { stroke: var(--node-stroke); stroke-width: 1; }
#mode-tl #tl-hatch rect { fill: var(--card); }
#mode-tl .lit .tl-work, #mode-tl .lit .tl-wait, #mode-tl .lit .tl-mile { stroke: var(--hl); stroke-width: 3; stroke-dasharray: none; }
#mode-tl .lit .tl-name { font-weight: 700; }
#mode-tl .me .tl-hit, #mode-tl .me .tl-labbg { fill: var(--hl-fill); }
#mode-tl .tl-labbg { fill: transparent; }
#mode-tl .tl-ov { position: absolute; pointer-events: none; overflow: hidden; }
#mode-tl .zoomctl { z-index: 3; }
#mode-tl .side .seg2 { display: flex; margin: 0 16px; border: 1px solid var(--rule); border-radius: 8px; overflow: hidden; }
#mode-tl .side .seg2 button { flex: 1; border: 0; background: var(--card); color: var(--ink); font: inherit; padding: 5px 4px; cursor: pointer; }
#mode-tl .side .seg2 button + button { border-left: 1px solid var(--rule); }
#mode-tl .side .seg2 button[aria-pressed="true"] { background: var(--accent-tint); font-weight: 700; }
#mode-tl .side input[type="date"] { margin: 0 16px; padding: 4px 8px; border: 1px solid var(--rule); border-radius: 6px; background: var(--paper); color: var(--ink); font: inherit; }
#mode-tl .side .sum { padding: 2px 16px; font-size: 13px; line-height: 1.6; }
#mode-tl .side .sum b { font-variant-numeric: tabular-nums; }
#mode-tl .side .note { padding: 2px 16px; margin: 4px 0; font-size: 12px; color: var(--muted); }
#mode-tl .side .row .code { margin-left: auto; }
#mode-tl .legend .bx { display: inline-block; width: 24px; height: 10px; vertical-align: middle; margin-right: 6px; border: 1px solid var(--node-stroke); }
#mode-tl .legend .bx.work { background: var(--accent); border-color: var(--accent); }
#mode-tl .legend .bx.wait { background: repeating-linear-gradient(45deg, var(--card) 0 3px, var(--node-stroke) 3px 4px); border-style: dashed; }
#mode-tl .legend .bx.crit { background: var(--accent); border: 2px solid var(--ink); }
#mode-tl .legend .bx.mile { width: 10px; height: 10px; transform: rotate(45deg); background: var(--gate); margin: 0 13px 0 7px; }
`;
  document.head.append(el('style', { 'data-mode': 'tl', text: css }));

  // ---------- 索引
  const tasks = B.tasks;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const succOf = new Map(tasks.map((t) => [t.id, []]));
  for (const t of tasks) for (const a of t.after || []) succOf.get(a).push(t.id);

  // ---------- 状態（始める日と作業する日の決め方は外枠が持ち、調達モードと共有する）
  let showCrit = true;
  let plan = null;
  let entered = false;
  let dirty = false;

  // ---------- 日付（外枠の日程と同じ数え方）
  const dayAt = (i) => api.planDay(i);
  const { md, mdw } = api;
  const isWeekend = (i) => [0, 6].includes(dayAt(i).getUTCDay());

  // ---------- 行の並び。段階の見出しのあとに、その段階の工程を書いた順に置く。
  const rows = [];
  let yy = HEAD_H;
  for (const ph of B.phases) {
    rows.push({ kind: 'phase', ph, y: yy });
    yy += PH_H;
    for (const t of tasks.filter((x) => x.phase === ph.id)) {
      rows.push({ kind: 'task', t, y: yy });
      yy += ROW_H;
    }
  }
  const H = yy + 8;
  const rowY = new Map(rows.filter((r) => r.kind === 'task').map((r) => [r.t.id, r.y + ROW_H / 2]));
  const X = (d) => LABEL_W + d * DAY_W;

  function daysLabel(t) {
    if (t.kind === 'mile') return '';
    const n = `${t.days} 日`;
    const kind = t.kind === 'wait' ? `待ち ${n}` : t.cont ? `続けて ${n}` : n;
    return `${kind}${t.temp ? `　${t.temp}℃ 以上` : ''}`;
  }

  // ---------- 置き場と、重ねる SVG
  const stage = api.$('#tl-stage');
  const side = api.$('#tl-side');
  api.$('#tl-note').textContent = B.meta.note || '';
  const svgAttrs = (label) => ({ xmlns: 'http://www.w3.org/2000/svg', role: 'img', 'aria-label': label, preserveAspectRatio: 'xMidYMid meet' });
  const svg = el('svg:svg', svgAttrs('製作の日程の横棒の図'));
  const ovTop = el('svg:svg', { ...svgAttrs('日付'), class: 'tl-ov', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  const ovLeft = el('svg:svg', { ...svgAttrs('工程名'), class: 'tl-ov', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  const ovCorner = el('svg:svg', { ...svgAttrs('見出し'), class: 'tl-ov', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  stage.append(svg, ovTop, ovLeft, ovCorner);

  let W = 0;
  let days = 0;
  let rowEls = new Map(); // 工程の id から、図の行と重ねた工程名の行
  let sideRows = new Map();
  let depEls = [];
  let pz = null;

  // 上の日付の帯（図と、上に重ねる SVG の両方に描く）
  function headNodes() {
    const out = [el('svg:rect', { x: 0, y: 0, width: W, height: HEAD_H, class: 'tl-bg' })];
    let prevMonth = -1;
    for (let i = 0; i < days; i++) {
      const dt = dayAt(i);
      if (dt.getUTCMonth() !== prevMonth) {
        prevMonth = dt.getUTCMonth();
        out.push(
          el('svg:line', { x1: X(i), y1: 4, x2: X(i), y2: HEAD_H, class: 'tl-tick' }),
          el('svg:text', { x: X(i) + 4, y: 18, class: 'tl-month', text: `${dt.getUTCFullYear()} 年 ${dt.getUTCMonth() + 1} 月` }),
        );
      }
      if (dt.getUTCDay() === 1) {
        out.push(
          el('svg:line', { x1: X(i), y1: 28, x2: X(i), y2: HEAD_H, class: 'tl-tick' }),
          el('svg:text', { x: X(i) + 3, y: 44, class: 'tl-date', text: md(dt) }),
        );
      }
    }
    out.push(el('svg:line', { x1: 0, y1: HEAD_H, x2: W, y2: HEAD_H, class: 'tl-sep' }));
    return out;
  }

  // 工程名が帯に入らないときは、末尾を「…」にして帯の幅に収める（選んで太字になっても収まるよう太字で測る。全文は札と右の欄に出す）。
  const NAME_MAX_W = LABEL_W - 24 - 10;
  const measureCtx = document.createElement('canvas').getContext('2d');
  function fitName(name) {
    if (!measureCtx) return name;
    measureCtx.font = `700 13px ${getComputedStyle(document.body).getPropertyValue('--font') || 'sans-serif'}`;
    if (measureCtx.measureText(name).width <= NAME_MAX_W) return name;
    let n = name.length - 1;
    while (n > 1 && measureCtx.measureText(`${name.slice(0, n)}…`).width > NAME_MAX_W) n--;
    return `${name.slice(0, n)}…`;
  }

  // 左の工程名の帯（図と、左に重ねる SVG の両方に描く）
  function labelNodes(collect) {
    const out = [el('svg:rect', { x: 0, y: 0, width: LABEL_W, height: H, class: 'tl-bg' })];
    for (const r of rows) {
      if (r.kind === 'phase') {
        out.push(
          el('svg:rect', { x: 0, y: r.y, width: LABEL_W, height: PH_H, class: 'tl-ph' }),
          el('svg:text', { x: 12, y: r.y + PH_H / 2, class: 'tl-phname', 'dominant-baseline': 'central', text: r.ph.name }),
        );
      } else {
        const g = el('svg:g', { 'data-task': r.t.id }, [
          el('svg:rect', { x: 0, y: r.y, width: LABEL_W, height: ROW_H, class: 'tl-labbg' }),
          el('svg:text', { x: 24, y: r.y + ROW_H / 2, class: 'tl-name', 'dominant-baseline': 'central', text: fitName(r.t.name) }, [
            el('svg:title', { text: r.t.name }),
          ]),
        ]);
        out.push(g);
        collect(r.t.id, g);
      }
    }
    out.push(el('svg:line', { x1: LABEL_W, y1: 0, x2: LABEL_W, y2: H, class: 'tl-sep' }));
    return out;
  }

  function cornerNodes() {
    return [
      el('svg:rect', { x: 0, y: 0, width: LABEL_W, height: HEAD_H, class: 'tl-bg' }),
      el('svg:text', { x: 12, y: 32, class: 'tl-phname', text: '工程' }),
      el('svg:line', { x1: 0, y1: HEAD_H, x2: LABEL_W, y2: HEAD_H, class: 'tl-sep' }),
      el('svg:line', { x1: LABEL_W, y1: 0, x2: LABEL_W, y2: HEAD_H, class: 'tl-sep' }),
    ];
  }

  function render() {
    plan = api.plan();
    dirty = false;
    days = plan.end + 10;
    W = X(days) + PAD_R;
    rowEls = new Map(tasks.map((t) => [t.id, []]));
    const collect = (id, g) => rowEls.get(id).push(g);

    const defs = el('svg:defs', {}, [
      el('svg:pattern', { id: 'tl-hatch', width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, [
        el('svg:rect', { width: 6, height: 6 }),
        el('svg:path', { d: 'M0,0 V6' }),
      ]),
      el('svg:marker', { id: 'tl-arrow', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, markerUnits: 'userSpaceOnUse', orient: 'auto' },
        [el('svg:path', { d: 'M0,0.5 L10,5 L0,9.5 z' })]),
    ]);

    // 背景: 土日の帯、段階の見出しの帯、月曜の線
    const gBack = el('svg:g', {}, [el('svg:rect', { x: 0, y: 0, width: W, height: H, class: 'tl-bg' })]);
    for (let i = 0; i < days; i++) {
      if (isWeekend(i)) gBack.append(el('svg:rect', { x: X(i), y: HEAD_H, width: DAY_W, height: H - HEAD_H, class: 'tl-we' }));
      if (dayAt(i).getUTCDay() === 1) gBack.append(el('svg:line', { x1: X(i), y1: HEAD_H, x2: X(i), y2: H, class: 'tl-tick' }));
    }
    for (const r of rows) {
      if (r.kind === 'phase') gBack.append(el('svg:rect', { x: 0, y: r.y, width: W, height: PH_H, class: 'tl-ph' }));
    }

    // 前後の矢印
    const gDeps = el('svg:g');
    depEls = [];
    for (const t of tasks) {
      const p = plan.out.get(t.id);
      for (const a of t.after || []) {
        const q = plan.out.get(a);
        const x1 = X(q.e);
        const y1 = rowY.get(a);
        const x2 = X(p.s) - (t.kind === 'mile' ? 8 : 0);
        const y2 = rowY.get(t.id);
        const xv = Math.min(x1 + 5, x2);
        const into = x2 > xv + 1;
        const yEnd = into ? y2 : y2 + (y2 > y1 ? -BAR_H / 2 : BAR_H / 2);
        const d = `M${x1},${y1} L${xv},${y1} L${xv},${yEnd}${into ? ` L${x2},${y2}` : ''}`;
        const path = el('svg:path', { d, class: 'tl-dep', 'marker-end': 'url(#tl-arrow)' });
        gDeps.append(path);
        depEls.push({ from: a, to: t.id, path });
      }
    }

    // 段階の期間と、工程の行
    const gRows = el('svg:g');
    for (const r of rows) {
      if (r.kind === 'phase') {
        const ts = tasks.filter((x) => x.phase === r.ph.id).map((x) => plan.out.get(x.id));
        const s0 = Math.min(...ts.map((p) => p.s));
        const e0 = Math.max(...ts.map((p) => p.e));
        gRows.append(
          el('svg:line', { x1: X(s0), y1: r.y + PH_H / 2, x2: X(e0), y2: r.y + PH_H / 2, class: 'tl-span' }),
          el('svg:text', { x: X(e0) + 6, y: r.y + PH_H / 2, class: 'tl-days', 'dominant-baseline': 'central', text: `${mdw(dayAt(s0))}〜${mdw(dayAt(Math.max(s0, e0 - 1)))}` }),
        );
        continue;
      }
      const t = r.t;
      const p = plan.out.get(t.id);
      const cy = r.y + ROW_H / 2;
      const kids = [el('svg:rect', { x: 0, y: r.y, width: W, height: ROW_H, class: 'tl-hit' })];
      if (t.kind === 'mile') {
        const x = X(p.s);
        kids.push(el('svg:polygon', { class: 'tl-mile', points: `${x},${cy - 8} ${x + 8},${cy} ${x},${cy + 8} ${x - 8},${cy}` }));
        kids.push(el('svg:text', { x: x + 12, y: cy, class: 'tl-days', 'dominant-baseline': 'central', text: mdw(dayAt(p.s)) }));
      } else {
        const cls = t.kind === 'wait' ? 'tl-wait' : 'tl-work';
        for (let k = 0; k < p.segs.length; k++) {
          const [a, b] = p.segs[k];
          if (k) kids.push(el('svg:line', { x1: X(p.segs[k - 1][1]), y1: cy, x2: X(a), y2: cy, class: 'tl-gap' }));
          kids.push(el('svg:rect', { x: X(a), y: cy - BAR_H / 2, width: (b - a) * DAY_W, height: BAR_H, rx: 2, class: cls }));
        }
        kids.push(el('svg:text', { x: X(p.e) + 6, y: cy, class: 'tl-days', 'dominant-baseline': 'central', text: daysLabel(t) }));
      }
      const g = el('svg:g', { class: `tl-row${showCrit && plan.crit.has(t.id) ? ' crit' : ''}`, 'data-task': t.id, tabindex: 0, role: 'button', 'aria-label': `${t.name} ${daysLabel(t)}` }, kids);
      g.addEventListener('click', () => api.select('task', t.id, { push: true }));
      g.addEventListener('keydown', (ev) => {
        if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); api.select('task', t.id, { push: true }); }
      });
      const showTip = (ev) => {
        const when = t.kind === 'mile' ? mdw(dayAt(p.s)) : `${mdw(dayAt(p.s))}〜${mdw(dayAt(p.e - 1))}`;
        api.tip(`<b>${esc(t.name)}</b><br>${esc(when)}　${esc(daysLabel(t))}<br>${esc(t.desc || '')}`, ev.clientX, ev.clientY);
      };
      g.addEventListener('mouseenter', showTip);
      g.addEventListener('mousemove', showTip);
      g.addEventListener('mouseleave', () => api.tip(null));
      gRows.append(g);
      collect(t.id, g);
    }

    svg.replaceChildren(defs, gBack, gDeps, gRows, el('svg:g', {}, headNodes()), el('svg:g', {}, labelNodes(collect)), el('svg:g', {}, cornerNodes()));
    ovTop.replaceChildren(...headNodes());
    ovLeft.replaceChildren(...labelNodes(collect));
    ovCorner.replaceChildren(...cornerNodes());

    const box = [0, 0, W, H];
    initVb = initBox();
    if (pz) pz.reset(box, initVb);
    else {
      pz = api.panZoom(svg, stage, box, initVb);
      pz.onChange(placeOverlays);
      // 置き場の大きさが変わったとき、まだ動かしていなければ最初の範囲を取り直す
      new ResizeObserver(() => {
        const same = lastVb && initVb && lastVb.every((v, i) => Math.abs(v - initVb[i]) < 0.5);
        if (same && stage.clientWidth && stage.clientHeight) {
          initVb = initBox();
          pz.reset([0, 0, W, H], initVb);
        } else {
          placeOverlays();
        }
      }).observe(stage);
    }
    renderSide();
    highlight(api.sel, {});
  }

  // 重ねた SVG を、図の見えている範囲に合わせて置く。panZoom と同じく xMidYMid meet で計算する。
  let lastVb = null;
  let initVb = null;
  function placeOverlays(vb) {
    if (vb) lastVb = vb;
    if (!lastVb) return;
    const r = svg.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const [vx, vy, vw, vh] = lastVb;
    const s = Math.max(vw / r.width, vh / r.height); // 1 px あたりの座標
    const ox = vx + (vw - r.width * s) / 2;
    const oy = vy + (vh - r.height * s) / 2;
    const left = Math.max(0, -ox / s);
    const top = Math.max(0, -oy / s);
    const lw = LABEL_W / s;
    const th = HEAD_H / s;
    const put = (o, x, y, w, h, viewBox) => {
      Object.assign(o.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
      o.setAttribute('viewBox', viewBox.map((v) => v.toFixed(2)).join(' '));
    };
    const visH = r.height - top;
    const visW = r.width - left;
    put(ovLeft, left, top, lw, visH, [0, oy + top * s, LABEL_W, visH * s]);
    put(ovTop, left, top, visW, th, [ox + left * s, 0, visW * s, HEAD_H]);
    put(ovCorner, left, top, lw, th, [0, 0, LABEL_W, HEAD_H]);
  }

  // 最初に見せる範囲。横は START_DAYS 日、縦は置き場の縦横比に合わせる。
  function initBox() {
    const w = Math.min(W, X(START_DAYS));
    const sw = stage.clientWidth;
    const sh = stage.clientHeight;
    const h = sw && sh ? Math.min(H, (w * sh) / sw) : H;
    return [0, 0, w, h];
  }

  // ---------- 左の一覧
  function renderSide() {
    const kids = [];
    kids.push(el('h2', { text: '作業する日' }));
    const seg = el('div', { class: 'seg2', role: 'group', 'aria-label': '作業する日' });
    for (const [k, label] of [['all', '毎日'], ['we', '土日だけ']]) {
      const b = el('button', { type: 'button', 'aria-pressed': String(api.planOpts.pattern === k), text: label });
      b.addEventListener('click', () => api.setPlanOpts({ pattern: k }));
      seg.append(b);
    }
    kids.push(seg);
    kids.push(el('h2', { text: '始める日' }));
    const inp = el('input', { type: 'date', value: api.planOpts.start, 'aria-label': '始める日' });
    inp.addEventListener('change', () => {
      if (api.parseDate(inp.value)) api.setPlanOpts({ start: inp.value });
    });
    kids.push(inp);
    if (B.meta.start_note) kids.push(el('p', { class: 'note', text: B.meta.start_note }));

    const first = byId.get(B.meta.first_bake);
    const sum = el('div', { class: 'sum' });
    sum.innerHTML = [
      `期間 <b>${plan.end}</b> 日（約 ${Math.ceil(plan.end / 7)} 週）`,
      `人の手が要る日 <b>${plan.workDays}</b> 日`,
      first ? `${esc(first.name)}日 <b>${mdw(dayAt(plan.out.get(first.id).s))}</b>` : '',
      `終わる日 <b>${mdw(dayAt(Math.max(0, plan.end - 1)))}</b>`,
    ].filter(Boolean).join('<br>');
    kids.push(el('h2', { text: '要約' }), sum);
    if (B.meta.temp_note) kids.push(el('p', { class: 'note', text: B.meta.temp_note }));

    const cb = el('input', { type: 'checkbox' });
    cb.checked = showCrit;
    cb.addEventListener('change', () => { showCrit = cb.checked; render(); api.writeUrl(false); });
    kids.push(el('h2', { text: '凡例' }), el('div', { class: 'legend' }, [
      el('span', {}, [el('span', { class: 'bx work' }), '作業（作業する日で数える）']),
      el('span', {}, [el('span', { class: 'bx wait' }), '待ち（養生、乾燥。暦日で数える）']),
      el('span', {}, [el('span', { class: 'bx mile' }), '節目']),
      el('label', {}, [cb, el('span', { class: 'bx crit' }), '日程を決めている流れ']),
      el('span', { text: '5℃ 以上など：その気温以上の日に行う' }),
      el('span', { text: '灰色の縦の帯は土日' }),
    ]));

    sideRows = new Map();
    for (const ph of B.phases) {
      kids.push(el('h2', { text: ph.name }));
      for (const t of tasks.filter((x) => x.phase === ph.id)) {
        const p = plan.out.get(t.id);
        const b = el('button', { type: 'button', class: 'row', 'aria-pressed': 'false', 'data-id': t.id }, [
          el('span', { text: t.name }),
          el('span', { class: 'code', text: md(dayAt(p.s)) }),
        ]);
        b.addEventListener('click', () => api.select('task', t.id, { push: true, reveal: true }));
        kids.push(b);
        sideRows.set(t.id, b);
      }
    }
    side.replaceChildren(...kids);
  }

  // ---------- 選択の反映
  function highlight(sel, opts = {}) {
    if (!plan) return;
    const rel = api.related(sel);
    const isTask = sel && sel.kind === 'task';
    const lit = new Set(rel.tasks);
    const near = new Set(lit);
    if (isTask) {
      for (const a of byId.get(sel.id).after || []) near.add(a);
      for (const b of succOf.get(sel.id)) near.add(b);
    }
    const active = !!(sel && sel.kind) && lit.size > 0;
    for (const [id, gs] of rowEls) {
      for (const g of gs) {
        g.classList.toggle('lit', lit.has(id));
        g.classList.toggle('me', isTask && sel.id === id);
        g.classList.toggle('dim', active && !near.has(id));
      }
      const b = sideRows.get(id);
      if (b) {
        b.classList.toggle('sel', lit.has(id));
        b.classList.toggle('dim', active && !near.has(id));
        b.setAttribute('aria-pressed', String(isTask && sel.id === id));
      }
    }
    for (const d of depEls) {
      const on = isTask && (d.from === sel.id || d.to === sel.id);
      d.path.classList.toggle('on', on);
      d.path.classList.toggle('dim', active && !on);
    }
    if (opts.reveal && active && pz) {
      let x0 = Infinity; let x1 = -Infinity; let y0 = Infinity; let y1 = -Infinity;
      for (const id of lit) {
        const p = plan.out.get(id);
        if (!p) continue;
        x0 = Math.min(x0, X(p.s)); x1 = Math.max(x1, X(p.e) + 60);
        y0 = Math.min(y0, rowY.get(id) - ROW_H); y1 = Math.max(y1, rowY.get(id) + ROW_H);
      }
      // 左の工程名と上の日付に隠れない所へ寄せる
      if (x0 < Infinity) {
        pz.reveal(x0 - LABEL_W - 10, y0 - HEAD_H, x1 - x0 + LABEL_W + 10, y1 - y0 + HEAD_H, false);
        // 寄せた結果が図の左や上の外へはみ出したら、端に合わせる
        if (lastVb && (lastVb[0] < 0 || lastVb[1] < 0)) {
          pz.reset([0, 0, W, H], [Math.max(0, lastVb[0]), Math.max(0, lastVb[1]), lastVb[2], lastVb[3]]);
        }
      }
    }
  }

  return {
    enter(params) {
      let changed = false;
      // URL から来たとき（m がある）は URL のとおりにし、タブで戻ったときは前の状態を残す
      if ('m' in params) {
        const cp = params.cp !== '0';
        if (cp !== showCrit) { showCrit = cp; changed = true; }
      }
      // 置き場が見えてから最初の範囲を決める（隠れている間は大きさが 0 のため）
      if (changed || dirty || !entered) render();
      else placeOverlays();
      entered = true;
    },
    // 始める日か作業する日の決め方が変わった。見えていれば組み直し、隠れていれば入るときに組み直す。
    planChanged() {
      if (api.mode === 'tl' && entered) render();
      else dirty = true;
    },
    leave() { api.tip(null); },
    params() {
      return { cp: showCrit ? '' : '0' };
    },
    highlight,
    escape() { return false; },
  };
});
