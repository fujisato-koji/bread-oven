// 調達モード。部品リスト（10 万円に含める品）と道具を、届く工程と使う工程の日付と一緒に表で見せる。
// データは nav.json の bom（meta、categories、items、tools）。日付は外枠の日程（api.plan）から出し、タイムラインと同じ日程を使う。
// 品の正は docs/data/bom.yaml で、部品リスト（05 の表）も同じところから作る。
NavApp.register('proc', (api) => {
  'use strict';

  const BOM = api.data.bom;
  if (!BOM || !BOM.items.length) return null;
  const { el, esc } = api;
  const B = api.data.build;

  // ---------- この表だけの CSS（#mode-proc で始める）
  const css = `
#mode-proc .stage { overflow: auto; }
#mode-proc .pc-wrap { padding: 16px 20px 40px; max-width: 1180px; }
#mode-proc .pc-cost { background: var(--card); border: 1px solid var(--rule); border-radius: 10px; padding: 12px 14px; margin-bottom: 16px; }
#mode-proc .pc-cost h2 { font-size: 14px; margin: 0 0 6px; }
#mode-proc .pc-bar { position: relative; display: flex; height: 26px; margin: 26px 0 4px; background: var(--paper-2); border-radius: 4px; }
#mode-proc .pc-bar .seg { height: 100%; cursor: pointer; border-right: 1px solid var(--card); }
#mode-proc .pc-bar .seg:first-child { border-radius: 4px 0 0 4px; }
#mode-proc .pc-bar .seg.dim { opacity: .3; }
#mode-proc .pc-bar .bud { position: absolute; top: -8px; bottom: -6px; width: 0; border-left: 2px dashed var(--ink); }
#mode-proc .pc-bar .bud span { position: absolute; bottom: 100%; right: 4px; white-space: nowrap; font-size: 12px; color: var(--ink); }
#mode-proc .pc-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; margin-top: 6px; }
#mode-proc .pc-legend .sw { display: inline-block; width: 12px; height: 12px; border-radius: 2px; vertical-align: -2px; margin-right: 4px; }
#mode-proc .c0 { fill: var(--accent); background: var(--accent); }
#mode-proc .c1 { fill: var(--line-loss); background: var(--line-loss); }
#mode-proc .c2 { fill: var(--line-smoke); background: var(--line-smoke); }
#mode-proc .c3 { fill: var(--line-heat); background: var(--line-heat); }
#mode-proc .c4 { fill: var(--line-steam); background: var(--line-steam); }
#mode-proc .c5 { fill: var(--line-air); background: var(--line-air); }
#mode-proc .c6 { fill: var(--node-stroke); background: var(--node-stroke); }
#mode-proc .pc-group { margin: 18px 0 6px; display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px; }
#mode-proc .pc-group h2 { font-size: 15px; margin: 0; }
#mode-proc .pc-group .meta { font-size: 12px; color: var(--muted); }
#mode-proc .pc-group .meta b { color: var(--ink); font-variant-numeric: tabular-nums; }
#mode-proc .pc-group button.go { font: inherit; font-size: 12px; border: 1px solid var(--rule); background: var(--card); color: var(--link); border-radius: 6px; padding: 1px 8px; cursor: pointer; }
#mode-proc table.pc { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--rule); font-size: 13px; }
#mode-proc table.pc { min-width: 780px; }
#mode-proc table.pc td:first-child { min-width: 180px; }
@media (max-width: 899px) { #mode-proc .pc-wrap { padding: 12px 12px 32px; } }
#mode-proc table.pc th { text-align: left; font-weight: 600; color: var(--muted); font-size: 12px; background: var(--paper-2); padding: 5px 8px; border-bottom: 1px solid var(--rule); white-space: nowrap; }
#mode-proc table.pc td { padding: 5px 8px; border-bottom: 1px solid var(--rule); vertical-align: top; }
#mode-proc table.pc td.num, #mode-proc table.pc th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
#mode-proc table.pc td.when, #mode-proc table.pc td.shop { white-space: nowrap; font-variant-numeric: tabular-nums; }
#mode-proc table.pc tr.row { cursor: pointer; }
#mode-proc table.pc tr.row:hover td { background: var(--paper-2); }
#mode-proc table.pc tr.row.sel td { background: var(--accent-tint); }
#mode-proc table.pc tr.row.me td { background: var(--hl-fill); }
#mode-proc table.pc tr.row.me td:first-child { box-shadow: inset 3px 0 0 var(--hl); }
#mode-proc table.pc tr.row.dim { opacity: .4; }
#mode-proc table.pc tr.sum td { font-weight: 700; background: var(--paper); }
#mode-proc table.pc .sub { color: var(--muted); font-size: 12px; }
#mode-proc .st { display: inline-block; padding: 0 7px; border-radius: 9px; font-size: 11px; color: var(--chip-ink); white-space: nowrap; }
#mode-proc .st.s0 { background: var(--chip-undef); }
#mode-proc .st.s1 { background: var(--chip-tmp); }
#mode-proc .st.s2 { background: var(--chip-fix); }
#mode-proc .st.tent { background: var(--chip-ref); }
#mode-proc .side .seg2 { display: flex; margin: 0 16px; border: 1px solid var(--rule); border-radius: 8px; overflow: hidden; }
#mode-proc .side .seg2 button { flex: 1; border: 0; background: var(--card); color: var(--ink); font: inherit; font-size: 13px; padding: 5px 4px; cursor: pointer; }
#mode-proc .side .seg2 button + button { border-left: 1px solid var(--rule); }
#mode-proc .side .seg2 button[aria-pressed="true"] { background: var(--accent-tint); font-weight: 700; }
#mode-proc .side input[type="date"] { margin: 0 16px; padding: 4px 8px; border: 1px solid var(--rule); border-radius: 6px; background: var(--paper); color: var(--ink); font: inherit; }
#mode-proc .side .sum { padding: 2px 16px; font-size: 13px; line-height: 1.7; }
#mode-proc .side .sum b { font-variant-numeric: tabular-nums; }
#mode-proc .side .sum .over { color: var(--accent); }
#mode-proc .side .note { padding: 2px 16px; margin: 4px 0; font-size: 12px; color: var(--muted); }
`;
  document.head.append(el('style', { 'data-mode': 'proc', text: css }));

  // ---------- 索引
  const items = BOM.items;
  const tools = BOM.tools;
  const catIx = Object.fromEntries(BOM.categories.map((c, i) => [c.id, i]));
  const taskName = (id) => (api.task(id) ? api.task(id).name : id);
  const STATUS = ['未手配', '注文済み', '入手済み'];
  const yenN = (v) => Number(v).toLocaleString('ja-JP');

  // ---------- 状態
  let view = 'items'; // items は部品リスト、tools は道具
  let group = 'batch'; // batch は届く工程ごと、cat は費用の分け方ごと、shop は買う所ごと
  let entered = false;
  let dirty = false;
  let rowEls = new Map();
  let segEls = [];

  const stage = api.$('#proc-stage');
  const side = api.$('#proc-side');
  api.$('#proc-note').textContent = '部品リスト（10 万円に含める品）と道具。日付はタイムラインと同じ日程から出す。正は docs/data/bom.yaml。';

  // 日程から、工程の始まりと終わりの日を出す
  function dates() {
    const p = api.plan();
    const s = (tid) => (p.out.has(tid) ? p.out.get(tid).s : null);
    const e = (tid) => (p.out.has(tid) ? p.out.get(tid).e : null);
    const firstUse = (x) => {
      const ds = (x.use || []).map(s).filter((v) => v != null);
      return ds.length ? Math.min(...ds) : null;
    };
    return { s, e, firstUse };
  }
  const when = (d) => (d == null ? '' : api.mdw(api.planDay(d)));

  // ---------- 費用の内訳（積み上げの棒と 10 万円の線）。文字が伸びないよう HTML で描く
  function costBox() {
    const total = items.reduce((a, x) => a + x.amount, 0);
    const budget = BOM.meta.budget;
    const max = Math.max(total, budget) * 1.04;
    const pct = (v) => `${((v / max) * 100).toFixed(2)}%`;
    const sums = BOM.categories.map((c) => ({ c, v: items.filter((x) => x.cat === c.id).reduce((a, x) => a + x.amount, 0) }));
    const bar = el('div', { class: 'pc-bar', role: 'img', 'aria-label': `費用の内訳。合計 ${yenN(total)} 円、予算 ${yenN(budget)} 円` });
    segEls = [];
    for (const { c, v } of sums) {
      if (!v) continue;
      const d = el('div', { class: `seg c${catIx[c.id]}`, title: `${c.name} ${yenN(v)} 円`, 'data-cat': c.id });
      d.style.width = pct(v);
      d.addEventListener('click', () => { group = 'cat'; view = 'items'; renderAll(); api.writeUrl(true); });
      bar.append(d);
      segEls.push({ cat: c.id, r: d });
    }
    const bud = el('div', { class: 'bud' }, [el('span', { text: `予算 ${yenN(budget)} 円` })]);
    bud.style.left = pct(budget);
    bar.append(bud);
    const legend = el('div', { class: 'pc-legend' }, sums.filter((x) => x.v).map(({ c, v }) => el('span', {}, [
      el('span', { class: `sw c${catIx[c.id]}` }), `${c.name} ${yenN(v)} 円（${Math.round((v / total) * 100)}%）`,
    ])));
    const diff = total - budget;
    return el('div', { class: 'pc-cost' }, [
      el('h2', { text: `合計 ${yenN(total)} 円（予算との差 ${diff > 0 ? '+' : ''}${yenN(diff)} 円）` }),
      bar, legend,
    ]);
  }

  // ---------- 品の表
  function statusChip(x) {
    const k = STATUS.indexOf(x.status);
    return `<span class="st s${k < 0 ? 0 : k}">${esc(x.status)}</span>${x.tentative ? ' <span class="st tent">値段は仮</span>' : ''}`;
  }

  function itemRows(list, dt) {
    const head = el('tr', {});
    head.innerHTML = '<th>品</th><th class="num">数量</th><th class="num">単価</th><th class="num">金額</th><th>買う所</th><th>届く日</th><th>最初に使う日</th><th class="num">余裕</th><th>状態</th>';
    const tbl = el('table', { class: 'pc' }, [el('thead', {}, [head])]);
    const body = el('tbody');
    for (const x of list) {
      const arrive = dt.e(x.batch);
      const use = dt.firstUse(x);
      const slack = arrive != null && use != null ? use - arrive : null;
      const tr = el('tr', { class: 'row', 'data-item': x.id, tabindex: 0 });
      tr.innerHTML = `<td>${esc(x.name)}${x.note ? `<div class="sub">${esc(x.note)}</div>` : ''}</td>
        <td class="num">${esc(x.qty)} ${esc(x.unit)}</td><td class="num">${yenN(x.price)}</td><td class="num">${yenN(x.amount)}</td>
        <td class="shop">${esc(x.shop)}（${esc(x.how)}）</td>
        <td class="when">${esc(arrive != null ? when(Math.max(0, arrive - 1)) : '')}</td>
        <td class="when">${esc(use != null ? when(use) : '')}</td>
        <td class="num">${slack != null ? `${slack} 日` : ''}</td>
        <td>${statusChip(x)}</td>`;
      tr.addEventListener('click', () => api.select('item', x.id, { push: true }));
      tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') api.select('item', x.id, { push: true }); });
      body.append(tr);
      rowEls.set(x.id, tr);
    }
    const sum = list.reduce((a, x) => a + x.amount, 0);
    const st = el('tr', { class: 'sum' });
    st.innerHTML = `<td>小計（${list.length} 品）</td><td></td><td></td><td class="num">${yenN(sum)}</td><td colspan="5"></td>`;
    body.append(st);
    tbl.append(body);
    return { tbl, sum };
  }

  function groupsOf() {
    if (group === 'cat') {
      return BOM.categories.map((c) => ({ key: c.id, title: c.name, list: items.filter((x) => x.cat === c.id) }));
    }
    if (group === 'shop') {
      const keys = [...new Set(items.map((x) => `${x.shop}（${x.how}）`))];
      return keys.map((k) => ({ key: k, title: k, list: items.filter((x) => `${x.shop}（${x.how}）` === k) }));
    }
    // 届く工程ごと。工程の書いた順に並べる
    const order = B.tasks.map((t) => t.id).filter((id) => items.some((x) => x.batch === id));
    return order.map((id) => ({ key: id, title: taskName(id), task: id, list: items.filter((x) => x.batch === id) }));
  }

  function renderItems(wrap, dt) {
    for (const g of groupsOf()) {
      if (!g.list.length) continue;
      const { tbl, sum } = itemRows(g.list, dt);
      const meta = [`<b>${yenN(sum)}</b> 円`];
      if (g.task) {
        const t = api.task(g.task);
        const s = dt.s(g.task);
        const e = dt.e(g.task);
        meta.push(t.kind === 'wait' ? `頼む日 ${esc(when(s))}、届く日 ${esc(when(Math.max(s, e - 1)))}` : `買いに行く日 ${esc(when(s))}`);
      }
      const head = el('div', { class: 'pc-group' }, [el('h2', { text: g.title })]);
      const m = el('span', { class: 'meta' });
      m.innerHTML = meta.join('、');
      head.append(m);
      if (g.task) {
        const b = el('button', { type: 'button', class: 'go', text: 'タイムラインで見る' });
        b.addEventListener('click', () => { api.select('task', g.task, { push: false }); api.goto('tl', {}); });
        head.append(b);
      }
      wrap.append(head, tbl);
    }
  }

  function renderTools(wrap, dt) {
    for (const [gk, title] of [['build', '組むときの道具'], ['bake', '焼くときの道具']]) {
      const list = tools.filter((t) => t.group === gk);
      const head = el('tr', {});
      head.innerHTML = '<th>道具</th><th>使いどころ</th><th>最初に使う工程</th><th>要る日</th><th>手持ち</th>';
      const tbl = el('table', { class: 'pc' }, [el('thead', {}, [head])]);
      const body = el('tbody');
      for (const t of list) {
        const use = dt.firstUse(t);
        const first = (t.use || []).find((u) => dt.s(u) === use);
        const tr = el('tr', { class: 'row', 'data-item': t.id, tabindex: 0 });
        tr.innerHTML = `<td>${esc(t.name)}</td><td>${esc(t.purpose)}</td><td>${esc(first ? taskName(first) : '冬')}</td>
          <td class="when">${esc(use != null ? when(use) : '')}</td><td>${esc(t.have)}</td>`;
        tr.addEventListener('click', () => api.select('item', t.id, { push: true }));
        tr.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') api.select('item', t.id, { push: true }); });
        body.append(tr);
        rowEls.set(t.id, tr);
      }
      tbl.append(body);
      wrap.append(el('div', { class: 'pc-group' }, [el('h2', { text: title }), el('span', { class: 'meta', text: '10 万円の外。値段は書かない' })]), tbl);
    }
  }

  // ---------- 左の欄
  function renderSide() {
    const kids = [];
    const total = items.reduce((a, x) => a + x.amount, 0);
    const budget = BOM.meta.budget;
    const by = (st) => items.filter((x) => x.status === st);
    const paid = items.filter((x) => x.paid != null).reduce((a, x) => a + x.paid, 0);
    const sum = el('div', { class: 'sum' });
    sum.innerHTML = [
      `合計 <b>${yenN(total)}</b> 円`,
      `予算 <b>${yenN(budget)}</b> 円、差 <b class="${total > budget ? 'over' : ''}">${total > budget ? '+' : ''}${yenN(total - budget)}</b> 円`,
      ...STATUS.map((st) => `${st} <b>${by(st).length}</b> 品（${yenN(by(st).reduce((a, x) => a + x.amount, 0))} 円）`),
      paid ? `払った額 <b>${yenN(paid)}</b> 円` : '',
    ].filter(Boolean).join('<br>');
    kids.push(el('h2', { text: '要約' }), sum);

    const seg = (label, opts, cur, set) => {
      const box = el('div', { class: 'seg2', role: 'group', 'aria-label': label });
      for (const [k, text] of opts) {
        const b = el('button', { type: 'button', 'aria-pressed': String(cur === k), text });
        b.addEventListener('click', () => set(k));
        box.append(b);
      }
      return box;
    };
    kids.push(el('h2', { text: '見る物' }), seg('見る物', [['items', '部品リスト'], ['tools', '道具']], view, (k) => {
      if (view !== k) { view = k; renderAll(); api.writeUrl(true); }
    }));
    if (view === 'items') {
      kids.push(el('h2', { text: '分け方' }), seg('分け方', [['batch', '届く工程'], ['cat', '費用'], ['shop', '買う所']], group, (k) => {
        if (group !== k) { group = k; renderAll(); api.writeUrl(true); }
      }));
    }
    kids.push(el('h2', { text: '日程（タイムラインと同じ）' }), seg('作業する日', [['all', '毎日'], ['we', '土日だけ']], api.planOpts.pattern, (k) => api.setPlanOpts({ pattern: k })));
    const inp = el('input', { type: 'date', value: api.planOpts.start, 'aria-label': '始める日' });
    inp.addEventListener('change', () => { if (api.parseDate(inp.value)) api.setPlanOpts({ start: inp.value }); });
    kids.push(el('h2', { text: '始める日' }), inp);
    kids.push(el('p', { class: 'note', text: '「余裕」は、届いてから最初に使うまでの日数。状態と払った額は bom.yaml に書く。' }));
    side.replaceChildren(...kids);
  }

  function renderAll() {
    const dt = dates();
    rowEls = new Map();
    const wrap = el('div', { class: 'pc-wrap' }, [costBox()]);
    if (view === 'items') renderItems(wrap, dt);
    else renderTools(wrap, dt);
    stage.replaceChildren(wrap);
    renderSide();
    dirty = false;
    highlight(api.sel, {});
  }

  // ---------- 選択の反映
  function highlight(sel, opts = {}) {
    if (!entered && !rowEls.size) return;
    const rel = api.related(sel);
    const lit = rel.items;
    const isItem = sel && sel.kind === 'item';
    const active = !!(sel && sel.kind) && lit.size > 0;
    for (const [id, tr] of rowEls) {
      tr.classList.toggle('sel', lit.has(id));
      tr.classList.toggle('me', isItem && sel.id === id);
      tr.classList.toggle('dim', active && !lit.has(id));
    }
    const litCats = new Set([...lit].map((id) => api.item(id)).filter((x) => x && x.cat).map((x) => x.cat));
    for (const s of segEls) s.r.classList.toggle('dim', active && litCats.size > 0 && !litCats.has(s.cat));
    if (opts.reveal && active) {
      const first = [...rowEls.entries()].find(([id]) => lit.has(id));
      if (first) first[1].scrollIntoView({ block: 'nearest' });
    }
  }

  return {
    enter(params) {
      let changed = false;
      // URL から来たとき（m がある）は URL のとおりにし、タブで戻ったときは前の状態を残す
      if ('m' in params) {
        const v = params.t === 'tools' ? 'tools' : 'items';
        const g = ['cat', 'shop'].includes(params.g) ? params.g : 'batch';
        if (v !== view || g !== group) { view = v; group = g; changed = true; }
      }
      // 選んだものが道具なら道具の表を、品なら部品リストを開く
      const x = api.sel && api.sel.kind === 'item' ? api.item(api.sel.id) : null;
      if (x) {
        const v = api.isTool(x) ? 'tools' : 'items';
        if (v !== view) { view = v; changed = true; }
      }
      entered = true;
      if (changed || dirty || !rowEls.size) renderAll();
    },
    planChanged() {
      if (api.mode === 'proc' && entered) renderAll();
      else dirty = true;
    },
    leave() {},
    params() {
      return { t: view === 'tools' ? 'tools' : '', g: view === 'items' && group !== 'batch' ? group : '' };
    },
    highlight,
    escape() { return false; },
  };
});
