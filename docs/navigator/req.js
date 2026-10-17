// 要求モード。左に要求の木、中央に要求と部品と工程の追跡の表を置く。
// 割り当ての正は 01-requirements.md の 1.2 と model.yaml の alloc。
NavApp.register('req', (api) => {
  const { el, data: D } = api;
  const side = api.$('#req-side');
  const stage = api.$('#req-stage');
  const note = api.$('#req-note');
  stage.classList.add('scroll');

  const CSS = `
#mode-req .side .row .tx { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#mode-req .side .row .chip { flex: none; }
#mode-req .side .row.off, #mode-req .off { display: none !important; }
#mode-req .side .lead { margin: 0; padding: 0 16px 6px; color: var(--muted); font-size: 12px; }
#mode-req .side .empty { padding: 8px 16px; color: var(--muted); font-size: 12px; }
#mode-req .side .filters label { padding: 0 6px 0 0; }
#mode-req table.trace { border-collapse: separate; border-spacing: 0; table-layout: fixed; font-size: 12.5px; }
#mode-req table.trace th, #mode-req table.trace td { border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); padding: 0; background: var(--paper); }
#mode-req table.trace thead th { background: var(--paper-2); position: sticky; z-index: 3; font-weight: 600; color: var(--ink); }
#mode-req table.trace thead tr.g1 th { top: 0; height: 24px; text-align: center; font-size: 12px; }
#mode-req table.trace thead tr.g2 th { top: 24px; height: 150px; vertical-align: bottom; }
#mode-req table.trace thead th.corner { top: 0; left: 0; z-index: 5; text-align: left; padding: 0 12px; vertical-align: bottom; }
#mode-req table.trace thead th.stc { top: 0; z-index: 4; vertical-align: bottom; text-align: center; }
#mode-req table.trace th.sepc, #mode-req table.trace td.sepc { width: 12px; background: var(--paper-2); }
#mode-req table.trace thead th.sepc { background: var(--paper-2); }
#mode-req table.trace .lane0 { border-left: 2px solid var(--rule); }
#mode-req .colbtn {
  display: block; width: 100%; height: 100%; border: 0; background: transparent; color: var(--ink); font: inherit; font-size: 12px;
  writing-mode: vertical-rl; text-align: left; padding: 6px 0; cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
}
#mode-req .colbtn:hover, #mode-req .rowbtn:hover { background: var(--accent-tint); }
#mode-req tbody th.rh { position: sticky; left: 0; z-index: 2; background: var(--card); text-align: left; font-weight: 400; }
#mode-req .rowbtn {
  display: flex; gap: 8px; align-items: baseline; width: 100%; border: 0; background: transparent; color: var(--ink); font: inherit;
  padding: 3px 8px 3px 12px; cursor: pointer; text-align: left; height: 28px;
}
#mode-req tr.child .rowbtn { padding-left: 28px; }
#mode-req .rowbtn .code { color: var(--muted); font-size: 12px; white-space: nowrap; font-variant-numeric: tabular-nums; }
#mode-req .rowbtn .tx { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#mode-req td.c { text-align: center; cursor: pointer; height: 28px; }
#mode-req td.c .dot { color: var(--accent); font-size: 13px; line-height: 1; }
#mode-req td.st { text-align: center; cursor: pointer; }
#mode-req tbody tr:hover td, #mode-req tbody tr:hover th.rh { background: var(--paper-2); }
#mode-req tr.hl > th.rh, #mode-req tr.hl > td { background: var(--hl-fill); }
#mode-req tr.hl > th.rh .rowbtn, #mode-req tr.hl > td { color: var(--ink); }
#mode-req tr.sel > th.rh { box-shadow: inset 4px 0 0 var(--accent); }
#mode-req tr.sel > td, #mode-req tr.sel > th.rh { font-weight: 700; }
#mode-req .hlc { background: var(--hl-fill) !important; }
#mode-req thead th.hlc { box-shadow: inset 0 -3px 0 var(--accent); }
#mode-req tr.dim > * > * { opacity: .35; }
`;
  document.head.append(el('style', { 'data-mode': 'req', text: CSS }));

  const reqs = D.reqs;
  const parts = D.parts.filter((p) => p.kind === 'part');
  const steps = D.steps;
  const lanes = D.lanes;

  // 木の順（上位の直後に下位）。
  const order = [];
  for (const r of reqs.filter((x) => !x.parent)) {
    order.push(r);
    for (const k of reqs.filter((x) => x.parent === r.id)) order.push(k);
  }
  for (const r of reqs) if (!order.includes(r)) order.push(r);

  const STAT = [
    { key: 's-fix', label: '確定' },
    { key: 's-tmp', label: '仮' },
    { key: 's-undef', label: '未定' },
    { key: 'other', label: 'その他' },
  ];
  const statKey = (r) => api.statusClass(r.status) || 'other';

  // ---------- 左
  const search = el('input', { type: 'search', placeholder: 'id か本文で絞る', 'aria-label': '要求を検索' });
  const checks = {};
  const filters = el('div', { class: 'filters', role: 'group', 'aria-label': '状態で絞る' });
  for (const s of STAT) {
    const cb = el('input', { type: 'checkbox', checked: true });
    checks[s.key] = cb;
    const lab = el('label', {}, [cb]);
    lab.insertAdjacentHTML('beforeend', api.chip(s.label));
    filters.append(lab);
  }
  const tools = el('div', { class: 'tools' }, [search, filters]);
  const treeRows = new Map();
  const tree = el('div', { class: 'tree' });
  for (const r of order) {
    const b = el('button', { type: 'button', class: 'row' + (r.parent ? ' child' : ''), 'data-r': r.id, title: `${r.id} ${r.text}` });
    b.append(el('span', { class: 'code', text: r.id }), el('span', { class: 'tx', text: r.text }));
    b.insertAdjacentHTML('beforeend', api.chip(r.status));
    treeRows.set(r.id, b);
    tree.append(b);
  }
  const none = el('p', { class: 'empty off', text: '該当する要求がありません。' });
  side.append(
    el('h2', { text: '絞り込み' }), tools,
    el('h2', { text: '要求の木' }), tree, none
  );

  // ---------- 中央の表
  const table = el('table', { class: 'trace' });
  const colCells = new Map(); // 'p:id' か 's:id' から、その列のセル
  const rowEls = new Map(); // 要求の id から tr
  const keyOf = (t, id) => `${t}:${id}`;
  const addCol = (k, c) => { if (!colCells.has(k)) colCells.set(k, []); colCells.get(k).push(c); };

  // 列の幅は colgroup で決める。
  const cg = el('colgroup');
  cg.append(el('col', { style: 'width:268px' }), el('col', { style: 'width:64px' }));
  parts.forEach(() => cg.append(el('col', { style: 'width:30px' })));
  cg.append(el('col', { style: 'width:12px' }));
  steps.forEach(() => cg.append(el('col', { style: 'width:30px' })));
  table.append(cg);

  const g1 = el('tr', { class: 'g1' });
  g1.append(el('th', { class: 'corner', rowspan: 2, scope: 'col', text: '要求' }));
  g1.append(el('th', { class: 'stc', rowspan: 2, scope: 'col', text: '状態' }));
  g1.append(el('th', { colspan: parts.length, scope: 'colgroup', text: '部品' }));
  g1.append(el('th', { class: 'sepc', rowspan: 2 }));
  const laneSpans = lanes.map((l) => ({ l, n: steps.filter((s) => s.lane === l.id).length })).filter((x) => x.n);
  for (const x of laneSpans) g1.append(el('th', { colspan: x.n, scope: 'colgroup', class: 'lane0', text: `工程 ${x.l.name}` }));

  const g2 = el('tr', { class: 'g2' });
  for (const p of parts) {
    const th = el('th', { scope: 'col' });
    th.append(el('button', { type: 'button', class: 'colbtn', 'data-p': p.id, text: p.name, title: p.name }));
    g2.append(th);
    addCol(keyOf('p', p.id), th);
  }
  // 工程は、レーンごとに data.steps の順に並べ直す。
  const stepOrder = [];
  for (const x of laneSpans) {
    steps.filter((s) => s.lane === x.l.id).forEach((s, i) => stepOrder.push({ s, first: i === 0 }));
  }
  for (const { s, first } of stepOrder) {
    const th = el('th', { scope: 'col', class: first ? 'lane0' : null });
    th.append(el('button', { type: 'button', class: 'colbtn', 'data-s': s.id, text: (s.kind === 'gate' ? '判断 ' : '') + s.name, title: s.name }));
    g2.append(th);
    addCol(keyOf('s', s.id), th);
  }
  table.append(el('thead', {}, [g1, g2]));

  const tbody = el('tbody');
  for (const r of order) {
    const a = api.allocOf(r.id);
    const tr = el('tr', { class: r.parent ? 'child' : null, 'data-row': r.id });
    const rh = el('th', { class: 'rh', scope: 'row' });
    const rb = el('button', { type: 'button', class: 'rowbtn', 'data-r': r.id, title: `${r.id} ${r.text}` });
    rb.append(el('span', { class: 'code', text: r.id }), el('span', { class: 'tx', text: r.text }));
    rh.append(rb);
    tr.append(rh);
    const st = el('td', { class: 'st', 'data-r': r.id });
    st.innerHTML = api.chip(r.status);
    tr.append(st);
    for (const p of parts) {
      const on = a.parts.includes(p.id);
      const td = el('td', { class: 'c', 'data-r': r.id, title: on ? `${r.id} と ${p.name}` : null });
      if (on) td.append(el('span', { class: 'dot', text: '●', 'aria-label': '割り当てあり' }));
      tr.append(td);
      addCol(keyOf('p', p.id), td);
    }
    tr.append(el('td', { class: 'sepc' }));
    for (const { s, first } of stepOrder) {
      const on = a.steps.includes(s.id);
      const td = el('td', { class: 'c' + (first ? ' lane0' : ''), 'data-r': r.id, title: on ? `${r.id} と ${s.name}` : null });
      if (on) td.append(el('span', { class: 'dot', text: '●', 'aria-label': '割り当てあり' }));
      tr.append(td);
      addCol(keyOf('s', s.id), td);
    }
    rowEls.set(r.id, tr);
    tbody.append(tr);
  }
  table.append(tbody);
  stage.append(table);

  // ---------- 絞り込み
  function matches(r) {
    const q = search.value.trim().toLowerCase();
    if (!checks[statKey(r)].checked) return false;
    if (!q) return true;
    return `${r.id} ${r.text}`.toLowerCase().includes(q);
  }
  let shown = reqs.length;
  function applyFilter() {
    const ok = new Set();
    for (const r of order) {
      if (!matches(r)) continue;
      ok.add(r.id);
      if (r.parent) ok.add(r.parent); // 下位が合えば、上位も出して木を保つ
    }
    shown = 0;
    for (const r of order) {
      const vis = ok.has(r.id);
      if (vis) shown++;
      treeRows.get(r.id).classList.toggle('off', !vis);
      rowEls.get(r.id).classList.toggle('off', !vis);
    }
    none.classList.toggle('off', shown > 0);
    const top = order.filter((r) => !r.parent).length;
    note.textContent = `要求 ${reqs.length} 件（上位 ${top}、下位 ${reqs.length - top}）のうち ${shown} 件を表示。正は 01-requirements.md の 1.2 と model.yaml の alloc。`;
  }
  search.addEventListener('input', applyFilter);
  for (const c of Object.values(checks)) c.addEventListener('change', applyFilter);

  // ---------- 選択
  const pick = (kind, id) => api.select(kind, id, { push: true });
  side.addEventListener('click', (e) => {
    const b = e.target.closest('[data-r]');
    if (b) pick('req', b.dataset.r);
  });
  stage.addEventListener('click', (e) => {
    const b = e.target.closest('[data-p], [data-s], [data-r]');
    if (!b) return;
    if (b.dataset.p) pick('part', b.dataset.p);
    else if (b.dataset.s) pick('step', b.dataset.s);
    else pick('req', b.dataset.r);
  });

  function clearMarks() {
    for (const tr of rowEls.values()) tr.classList.remove('hl', 'sel', 'dim');
    for (const b of treeRows.values()) b.classList.remove('sel', 'dim');
    for (const cs of colCells.values()) for (const c of cs) c.classList.remove('hlc');
    for (const b of treeRows.values()) b.removeAttribute('aria-pressed');
  }

  // 見出しの固定部に隠れないよう、行と列を見える所へ寄せる。
  function revealEls(tr, th) {
    if (!stage.offsetParent) return;
    const sr = stage.getBoundingClientRect();
    const head = table.tHead.offsetHeight;
    const left = table.tHead.rows[0].cells[0].offsetWidth;
    if (tr) {
      const r = tr.getBoundingClientRect();
      if (r.top < sr.top + head) stage.scrollTop -= sr.top + head - r.top + 4;
      else if (r.bottom > sr.bottom) stage.scrollTop += r.bottom - sr.bottom + 4;
    }
    if (th) {
      const c = th.getBoundingClientRect();
      if (c.left < sr.left + left) stage.scrollLeft -= sr.left + left - c.left + 4;
      else if (c.right > sr.right) stage.scrollLeft += c.right - sr.right + 4;
    }
  }

  function highlight(sel, opts = {}) {
    clearMarks();
    if (!sel || !sel.kind) return;
    const rel = api.related(sel);
    const rowsOn = sel.kind === 'req' || rel.reqs.size > 0;
    for (const r of order) {
      const tr = rowEls.get(r.id);
      const b = treeRows.get(r.id);
      const isSel = sel.kind === 'req' && sel.id === r.id;
      const on = rel.reqs.has(r.id);
      if (on) tr.classList.add('hl');
      if (isSel) {
        tr.classList.add('sel');
        b.classList.add('sel');
        b.setAttribute('aria-pressed', 'true');
      }
      if (rowsOn && !on) { tr.classList.add('dim'); b.classList.add('dim'); }
    }
    const mark = (t, ids) => {
      for (const id of ids) for (const c of colCells.get(keyOf(t, id)) || []) c.classList.add('hlc');
    };
    mark('p', rel.parts);
    mark('s', rel.steps);
    if (opts.reveal) {
      const firstRow = order.find((r) => rel.reqs.has(r.id));
      const tr = firstRow ? rowEls.get(firstRow.id) : null;
      if (sel.kind === 'req') revealEls(tr, null);
      else if (sel.kind === 'part' || sel.kind === 'step') {
        const c = colCells.get(keyOf(sel.kind === 'part' ? 'p' : 's', sel.id));
        revealEls(tr, c ? c[0] : null);
      }
      const sb = sel.kind === 'req' ? treeRows.get(sel.id) : null;
      if (sb && !sb.classList.contains('off')) sb.scrollIntoView({ block: 'nearest' });
    }
  }

  applyFilter();

  return {
    enter() { applyFilter(); },
    leave() { api.tip(null); },
    params() { return {}; },
    highlight,
    escape() {
      if (!search.value) return false;
      search.value = '';
      applyFilter();
      return true;
    },
  };
});
