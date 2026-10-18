// パン窯ナビゲータの外枠。
// モードの切り替え、URL の状態、選んだものの札、図の拡大縮小を受け持つ。
// 各モード（req.js、flow.js、sys.js、dwg.js、v3d.js、tl.js、proc.js）は NavApp.register(名前, 作る関数) で登録し、
// 作る関数は api を受け取って { enter(params), leave(), params(), highlight(sel), escape() } を返す。
// 決まりごとは NAVIGATOR.md に書く。
(function () {
  'use strict';

  const MODES = ['req', 'flow', 'sys', 'dwg', 'v3d', 'tl', 'proc'];
  const KIND = { part: '部品', node: '系統図の要素', req: '要求', step: '工程', flow: '流れ', task: '製作の工程', item: '品と道具' };
  const THEME_KEY = 'bread-nav-theme';
  const WIDTH_KEY = 'bread-nav-widths';

  const factories = {};
  const mods = {};
  let D = null;
  let OVEN = null;
  let mode = null;
  let sel = { kind: null, id: null };
  const IX = { thing: new Map(), req: new Map(), step: new Map(), flow: new Map(), task: new Map(), item: new Map(), kids: new Map() };

  // ---------- 小さな道具

  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const SVGNS = 'http://www.w3.org/2000/svg';

  // el('div', {class: 'x'}, [子]) か el('svg:rect', {...})。属性の値が null なら付けない。
  function el(tag, attrs = {}, kids = []) {
    const svg = tag.startsWith('svg:');
    const n = svg ? document.createElementNS(SVGNS, tag.slice(4)) : document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'text') n.textContent = v;
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const c of [].concat(kids)) if (c != null) n.append(c);
    return n;
  }

  function statusClass(s) {
    if (!s) return '';
    if (s.startsWith('決定') || s.startsWith('確定')) return 's-fix';
    if (s.startsWith('仮')) return 's-tmp';
    if (s.startsWith('未') || s.includes('待ち')) return 's-undef';
    return '';
  }
  const chip = (s) => `<span class="chip ${statusClass(s)}">${esc(s)}</span>`;

  // 出典の記号（P7、F15 など）に、題を出すリンクを付ける。
  function srcHtml(text) {
    const t = esc(text);
    if (!D) return t;
    return t.replace(/\b([PSMF]\d+[a-z]?)\b/g, (m) => {
      const s = D.sources[m];
      if (!s) return m;
      const title = esc(`${s.title}（${s.kind}）`);
      return s.url
        ? `<a class="src" href="${esc(s.url)}" target="_blank" rel="noopener" title="${title}">${m}</a>`
        : `<span class="src" title="${title}">${m}</span>`;
    });
  }

  // 設計書の文書へのリンク。MkDocs はディレクトリの URL を使う。
  function docHref(path) {
    if (!path) return null;
    const [file, hash] = path.split('#');
    const base = file === 'index.md' ? '../' : `../${file.replace(/\.md$/, '')}/`;
    return hash ? `${base}#${hash}` : base;
  }

  // ---------- 索引

  function index() {
    for (const p of D.parts) IX.thing.set(p.id, p);
    for (const n of D.nodes) IX.thing.set(n.id, n);
    for (const r of D.reqs) {
      IX.req.set(r.id, r);
      if (r.parent) {
        if (!IX.kids.has(r.parent)) IX.kids.set(r.parent, []);
        IX.kids.get(r.parent).push(r.id);
      }
    }
    for (const s of D.steps) IX.step.set(s.id, s);
    for (const t of (D.build ? D.build.tasks : [])) IX.task.set(t.id, t);
    for (const x of (D.bom ? [...D.bom.items, ...D.bom.tools] : [])) IX.item.set(x.id, x);
    planOpts.start = defaultStart();
    for (const sh of D.sheets) {
      sh.flows.forEach((f, i) => {
        const id = `${sh.id}:${i}`;
        IX.flow.set(id, { id, sheet: sh.id, from: f[0], to: f[1], media: f[2], note: f[3] || '' });
      });
    }
  }

  const thing = (id) => IX.thing.get(id);
  const req = (id) => IX.req.get(id);
  const step = (id) => IX.step.get(id);
  const flow = (id) => IX.flow.get(id);
  const task = (id) => IX.task.get(id);
  const item = (id) => IX.item.get(id);
  const isTool = (x) => !!x && 'group' in x;
  const kidsOf = (rid) => IX.kids.get(rid) || [];
  const allocOf = (rid) => D.alloc[rid] || { parts: [], steps: [] };

  function reqsOfPart(pid) {
    return D.reqs.filter((r) => allocOf(r.id).parts.includes(pid)).map((r) => r.id);
  }
  function stepsOfPart(pid) {
    return D.steps.filter((s) => (s.parts || []).includes(pid)).map((s) => s.id);
  }
  function reqsOfStep(sid) {
    const s = step(sid);
    const set = new Set(s ? s.reqs || [] : []);
    for (const r of D.reqs) if (allocOf(r.id).steps.includes(sid)) set.add(r.id);
    return [...set];
  }
  function tasksOfPart(pid) {
    return [...IX.task.values()].filter((t) => (t.parts || []).includes(pid)).map((t) => t.id);
  }
  function tasksOfReq(rid) {
    return [...IX.task.values()].filter((t) => (t.reqs || []).includes(rid)).map((t) => t.id);
  }
  // 品と道具のつながり。届く工程（batch）と使う工程（use）
  function itemsOfPart(pid) {
    return [...IX.item.values()].filter((x) => (x.parts || []).includes(pid)).map((x) => x.id);
  }
  function itemsOfTask(tid) {
    return [...IX.item.values()].filter((x) => x.batch === tid || (x.use || []).includes(tid)).map((x) => x.id);
  }
  function flowsOf(id) {
    return [...IX.flow.values()].filter((f) => f.from === id || f.to === id);
  }
  function sheetsOf(id) {
    return D.sheets.filter((sh) => id in sh.pos).map((sh) => sh.id);
  }

  // 選んだものに関係する部品、工程、要求、流れ、製作の工程。各モードはこれで光らせる。
  function related(s = sel) {
    const out = { parts: new Set(), steps: new Set(), reqs: new Set(), flows: new Set(), tasks: new Set(), items: new Set() };
    if (!s || !s.kind) return out;
    const addReq = (rid) => {
      out.reqs.add(rid);
      const a = allocOf(rid);
      a.parts.forEach((p) => out.parts.add(p));
      a.steps.forEach((x) => out.steps.add(x));
      tasksOfReq(rid).forEach((x) => out.tasks.add(x));
    };
    if (s.kind === 'part' || s.kind === 'node') {
      out.parts.add(s.id);
      stepsOfPart(s.id).forEach((x) => out.steps.add(x));
      reqsOfPart(s.id).forEach((r) => out.reqs.add(r));
      flowsOf(s.id).forEach((f) => out.flows.add(f.id));
      tasksOfPart(s.id).forEach((x) => out.tasks.add(x));
      itemsOfPart(s.id).forEach((x) => out.items.add(x));
    } else if (s.kind === 'req') {
      addReq(s.id);
      kidsOf(s.id).forEach(addReq);
    } else if (s.kind === 'step') {
      out.steps.add(s.id);
      const st = step(s.id);
      (st ? st.parts || [] : []).forEach((p) => out.parts.add(p));
      reqsOfStep(s.id).forEach((r) => out.reqs.add(r));
    } else if (s.kind === 'flow') {
      const f = flow(s.id);
      if (f) {
        out.flows.add(f.id);
        out.parts.add(f.from);
        out.parts.add(f.to);
      }
    } else if (s.kind === 'task') {
      out.tasks.add(s.id);
      const t = task(s.id);
      (t ? t.parts || [] : []).forEach((p) => out.parts.add(p));
      (t ? t.reqs || [] : []).forEach((r) => out.reqs.add(r));
      itemsOfTask(s.id).forEach((x) => out.items.add(x));
    } else if (s.kind === 'item') {
      out.items.add(s.id);
      const x = item(s.id);
      if (x) {
        (x.parts || []).forEach((p) => out.parts.add(p));
        if (x.batch) out.tasks.add(x.batch);
        (x.use || []).forEach((u) => out.tasks.add(u));
      }
    }
    return out;
  }

  // ---------- 製作の日程（タイムラインと調達が同じものを使う）
  // 作業（work）は作業する日で数え、1 人で行うので同じ日に 2 つの作業は入れない。
  // 待ち（wait）は暦日で数え、人の手を使わないので、その間にほかの作業を入れられる。
  // 前の工程がそろったものから、主の流れの工程を書いた順に、合間の作業（side）はそのあとに日を割り当てる。
  // 始める日と作業する日の決め方（毎日か土日だけか）は全モードで共有し、既定と違えば URL の w と s に載せる。
  const DAY = 86400000;
  const WD = '日月火水木金土';
  const planOpts = { pattern: 'all', start: null };
  let planCache = null;
  function parseDate(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  }
  const defaultStart = () => (D && D.build ? D.build.meta.start : '2027-05-01');
  const planDay = (i) => new Date(parseDate(planOpts.start || defaultStart()).getTime() + i * DAY);
  const md = (dt) => `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`;
  const mdw = (dt) => `${md(dt)}（${WD[dt.getUTCDay()]}）`;

  function schedule() {
    const tasks = D.build ? D.build.tasks : [];
    const isWorkday = (i) => planOpts.pattern === 'all' || [0, 6].includes(planDay(i).getUTCDay());
    const out = new Map();
    const busy = new Set();
    const left = new Set(tasks.map((t) => t.id));
    const ready = (t) => left.has(t.id) && (t.after || []).every((a) => out.has(a));
    while (left.size) {
      const t = tasks.find((x) => ready(x) && !x.side) || tasks.find((x) => ready(x));
      if (!t) break; // 輪になっていれば gen_nav が止めるので、ここには来ない
      left.delete(t.id);
      let es = 0;
      let drive = null;
      for (const a of t.after || []) {
        const e = out.get(a).e;
        if (e >= es) { es = e; drive = a; }
      }
      let s;
      let e;
      let segs;
      if (t.kind === 'mile') {
        s = es; e = es; segs = [];
      } else if (t.kind === 'wait') {
        s = es; e = es + t.days; segs = [[s, e]];
      } else if (t.cont) {
        // 続けて行う作業。作業できる日に始め、暦日で続ける。その間は人の手がふさがる。
        let d = es;
        const free = (x) => { for (let k = 0; k < t.days; k++) if (busy.has(x + k)) return false; return true; };
        while (!(isWorkday(d) && free(d))) d++;
        for (let k = 0; k < t.days; k++) busy.add(d + k);
        s = d; e = d + t.days; segs = [[s, e]];
      } else {
        // 作業。作業できる日で、ほかの作業に使っていない日を days 日とる。
        const used = [];
        for (let d = es; used.length < t.days; d++) {
          if (isWorkday(d) && !busy.has(d)) { used.push(d); busy.add(d); }
        }
        s = used[0]; e = used[used.length - 1] + 1;
        segs = [];
        for (const d of used) {
          const last = segs[segs.length - 1];
          if (last && last[1] === d) last[1] = d + 1;
          else segs.push([d, d + 1]);
        }
      }
      out.set(t.id, { s, e, segs, drive });
    }
    // 終わりから、日を決めた前の工程をたどる（日程を決めている流れ）
    let end = 0;
    let last = null;
    for (const [id, p] of out) if (p.e >= end) { end = p.e; last = id; }
    const crit = new Set();
    for (let id = last; id; id = out.get(id).drive) crit.add(id);
    return { out, end, crit, workDays: busy.size };
  }
  function plan() {
    if (!planCache) planCache = schedule();
    return planCache;
  }
  function setPlanOpts(o, push = true) {
    const next = { ...planOpts, ...o };
    if (next.pattern === planOpts.pattern && next.start === planOpts.start) return;
    Object.assign(planOpts, next);
    planCache = null;
    for (const m of Object.values(mods)) if (m && m.planChanged) m.planChanged();
    writeUrl(push);
  }

  // ---------- 図の拡大縮小（viewBox を動かす）

  // svg を stage に置いたあとに呼ぶ。box は「全体を収める」の範囲 [x, y, w, h]。
  // init を渡すと、最初の表示はその範囲にする（横に長い図で、最初は読める大きさで出すため）。
  // onChange(f) で、viewBox が変わるたびに f(vb) を呼ぶ（行の見出しを固定して見せるときに使う）。
  function panZoom(svg, stage, box, init) {
    let vb = (init || box).slice();
    let base = box.slice();
    const subs = [];
    const set = () => {
      svg.setAttribute('viewBox', vb.map((v) => v.toFixed(2)).join(' '));
      for (const f of subs) f(vb.slice());
    };
    const toSvg = (cx, cy) => {
      const r = svg.getBoundingClientRect();
      const s = Math.max(vb[2] / r.width, vb[3] / r.height);
      const ox = vb[0] + (vb[2] - r.width * s) / 2;
      const oy = vb[1] + (vb[3] - r.height * s) / 2;
      return [ox + (cx - r.left) * s, oy + (cy - r.top) * s, s];
    };
    function zoomAt(cx, cy, f) {
      const [x, y] = toSvg(cx, cy);
      const nw = Math.min(Math.max(vb[2] * f, base[2] / 24), base[2] * 4);
      const k = nw / vb[2];
      vb = [x - (x - vb[0]) * k, y - (y - vb[1]) * k, vb[2] * k, vb[3] * k];
      set();
    }
    svg.addEventListener('wheel', (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, e.deltaY > 0 ? 1.15 : 1 / 1.15);
    }, { passive: false });
    let drag = null;
    let moved = false;
    svg.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { x: e.clientX, y: e.clientY, vb: vb.slice() };
      moved = false;
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      if (!moved && Math.hypot(dx, dy) < 4) return;
      if (!moved) svg.setPointerCapture?.(e.pointerId);
      moved = true;
      const [, , s] = toSvg(e.clientX, e.clientY);
      vb = [drag.vb[0] - dx * s, drag.vb[1] - dy * s, vb[2], vb[3]];
      set();
    });
    window.addEventListener('pointerup', (e) => {
      if (drag && moved && !svg.contains(e.target)) moved = false;
      drag = null;
    });
    // ドラッグの後のクリックは選択にしない。
    svg.addEventListener('click', (e) => {
      if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; }
    }, true);
    const ctl = el('div', { class: 'zoomctl' }, [
      el('button', { type: 'button', 'aria-label': '拡大', text: '＋' }),
      el('button', { type: 'button', 'aria-label': '縮小', text: '−' }),
      el('button', { type: 'button', 'aria-label': '全体を収める', text: '□' }),
    ]);
    const [bin, bout, bfit] = ctl.children;
    const center = () => {
      const r = svg.getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    };
    bin.onclick = () => zoomAt(...center(), 1 / 1.3);
    bout.onclick = () => zoomAt(...center(), 1.3);
    bfit.onclick = () => fit();
    stage.append(ctl);
    function fit() { vb = base.slice(); set(); }
    // 範囲 [x, y, w, h] が見えるように寄せる。いまの倍率で入るなら動かすだけ。
    function reveal(x, y, w, h, zoom = false) {
      const pad = 40;
      if (zoom) {
        const nw = Math.max(w + pad * 2, base[2] / 6);
        const nh = Math.max(h + pad * 2, base[3] / 6);
        const k = Math.max(nw / vb[2], nh / vb[3]);
        vb = [x + w / 2 - (vb[2] * k) / 2, y + h / 2 - (vb[3] * k) / 2, vb[2] * k, vb[3] * k];
      } else {
        const inside = x >= vb[0] && y >= vb[1] && x + w <= vb[0] + vb[2] && y + h <= vb[1] + vb[3];
        if (!inside) vb = [x + w / 2 - vb[2] / 2, y + h / 2 - vb[3] / 2, vb[2], vb[3]];
      }
      set();
    }
    function reset(newBox, newInit) { base = newBox.slice(); vb = (newInit || newBox).slice(); set(); }
    set();
    return { fit, reveal, reset, zoomAt, onChange(f) { subs.push(f); f(vb.slice()); } };
  }

  // ---------- 選んだものの札

  function pillsHtml(kind, ids, nameOf) {
    if (!ids.length) return '<p class="muted">なし</p>';
    return ids.map((id) => `<button type="button" class="pill" data-sel="${kind}:${esc(id)}">${esc(nameOf(id))}</button>`).join('');
  }
  const partName = (id) => (thing(id) ? thing(id).name : id);
  const reqName = (id) => `${id} ${req(id) ? req(id).text : ''}`.trim();
  const stepName = (id) => (step(id) ? step(id).name : id);
  const taskName = (id) => (task(id) ? task(id).name : id);
  const itemName = (id) => (item(id) ? item(id).name : id);
  const yen = (v) => `${Number(v).toLocaleString('ja-JP')} 円`;

  function goButtons(kind, id) {
    const b = [];
    const go = (m, label) => b.push(`<button type="button" data-goto="${m}" data-sel="${kind}:${esc(id)}">${label}</button>`);
    if (kind === 'part') {
      go('req', '要求で見る');
      if (stepsOfPart(id).length) go('flow', 'フローで見る');
      if (sheetsOf(id).length) go('sys', '系統図で見る');
      go('dwg', '図面で見る');
      go('v3d', '3D で見る');
      if (tasksOfPart(id).length) go('tl', 'タイムラインで見る');
      if (itemsOfPart(id).length) go('proc', '調達で見る');
      const p = thing(id);
      if (p && p.doc) b.push(`<a href="${esc(docHref(p.doc))}" target="_blank" rel="noopener">設計書で読む</a>`);
    } else if (kind === 'node') {
      go('sys', '系統図で見る');
    } else if (kind === 'req') {
      go('req', '要求で見る');
      if (allocOf(id).steps.length) go('flow', 'フローで見る');
      if (allocOf(id).parts.length) { go('dwg', '図面で見る'); go('v3d', '3D で見る'); }
      b.push(`<a href="${esc(docHref('01-requirements.md'))}" target="_blank" rel="noopener">要求の表で読む</a>`);
    } else if (kind === 'step') {
      go('flow', 'フローで見る');
      b.push(`<a href="${esc(docHref('06-operation.md'))}" target="_blank" rel="noopener">手順を読む</a>`);
    } else if (kind === 'flow') {
      go('sys', '系統図で見る');
    } else if (kind === 'task') {
      go('tl', 'タイムラインで見る');
      if (itemsOfTask(id).length) go('proc', '調達で見る');
      if ((task(id).parts || []).length) go('v3d', '3D で見る');
      b.push(`<a href="${esc(docHref('07-build.md'))}" target="_blank" rel="noopener">製作の手順を読む</a>`);
    } else if (kind === 'item') {
      go('proc', '調達で見る');
      go('tl', 'タイムラインで見る');
      if ((item(id).parts || []).length) go('v3d', '3D で見る');
      b.push(`<a href="${esc(docHref('05-parts-list.md'))}" target="_blank" rel="noopener">部品リストで読む</a>`);
    }
    return `<div class="go">${b.join('')}</div>`;
  }

  function detailHtml(s) {
    if (s.kind === 'part') {
      const p = thing(s.id);
      const dims = p.dims.length
        ? `<table>${p.dims.map((d) => `<tr><td>${esc(d.label)}</td><td class="num">${d.v == null ? '未定' : esc(d.v + (d.unit ? ' ' + d.unit : ''))}</td><td>${chip(d.status)}</td></tr>`).join('')}</table>`
        : '<p class="muted">寸法なし</p>';
      return `<h2>${esc(p.name)}</h2><p>${esc(p.mat)}</p>
        <h3>寸法（oven.json）</h3>${dims}
        <h3>この部品で満たす要求</h3>${pillsHtml('req', reqsOfPart(s.id), reqName)}
        <h3>この部品を使う工程</h3>${pillsHtml('step', stepsOfPart(s.id), stepName)}
        <h3>この部品を作る製作の工程</h3>${pillsHtml('task', tasksOfPart(s.id), taskName)}
        <h3>この部品の材料（調達）</h3>${pillsHtml('item', itemsOfPart(s.id), itemName)}
        ${goButtons('part', s.id)}`;
    }
    if (s.kind === 'node') {
      const n = thing(s.id);
      const fl = flowsOf(s.id);
      const rows = fl.map((f) => `<button type="button" class="pill" data-sel="flow:${esc(f.id)}">${esc(partName(f.from))} → ${esc(partName(f.to))}（${esc(D.media[f.media].name)}）</button>`).join('') || '<p class="muted">なし</p>';
      return `<h2>${esc(n.name)}</h2><p class="muted">物ではなく、系統図で熱や煙の流れを示すための要素。</p><h3>出入りする流れ</h3>${rows}${goButtons('node', s.id)}`;
    }
    if (s.kind === 'req') {
      const r = req(s.id);
      const a = allocOf(s.id);
      const kids = kidsOf(s.id);
      return `<h2>${esc(r.id)} ${esc(r.text)}</h2>
        <p>${chip(r.status)} <span class="muted">由来: ${esc(r.origin)}</span></p>
        <h3>設計点</h3><p>${srcHtml(r.point)}</p>
        ${r.basis ? `<h3>根拠</h3><p>${srcHtml(r.basis)}</p>` : ''}
        ${r.note ? `<h3>根拠の読み方</h3><p>${srcHtml(r.note)}</p>` : ''}
        ${r.parent ? `<h3>上位</h3>${pillsHtml('req', [r.parent], reqName)}` : ''}
        ${kids.length ? `<h3>下位</h3>${pillsHtml('req', kids, reqName)}` : ''}
        <h3>満たす部品</h3>${pillsHtml('part', a.parts, partName)}
        <h3>関わる工程</h3>${pillsHtml('step', a.steps, stepName)}
        ${goButtons('req', s.id)}`;
    }
    if (s.kind === 'step') {
      const st = step(s.id);
      const lane = D.lanes.find((l) => l.id === st.lane);
      return `<h2>${esc(st.name)}</h2><p class="muted">${esc(lane ? lane.name : '')}${st.kind === 'gate' ? '、判断' : ''}</p>
        <p>${srcHtml(st.desc)}</p>
        <h3>使う部品</h3>${pillsHtml('part', st.parts || [], partName)}
        <h3>関わる要求</h3>${pillsHtml('req', reqsOfStep(s.id), reqName)}
        <h3>出典</h3><p>${(st.src || []).map((c) => srcHtml(c)).join('、') || 'なし'}</p>
        ${goButtons('step', s.id)}`;
    }
    if (s.kind === 'task') {
      const t = task(s.id);
      const ph = D.build.phases.find((x) => x.id === t.phase);
      const kindText = t.kind === 'mile' ? '節目' : t.kind === 'wait' ? `待ち ${t.days} 日（暦日）`
        : `作業 ${t.days} 日${t.cont ? '（続けて行う）' : ''}${t.side ? '、合間の作業' : ''}`;
      const next = D.build.tasks.filter((x) => (x.after || []).includes(t.id)).map((x) => x.id);
      return `<h2>${esc(t.name)}</h2><p class="muted">${esc(ph ? ph.name : '')}、${esc(kindText)}${t.temp ? `、${t.temp}℃ 以上の日に行う` : ''}</p>
        <p>${srcHtml(t.desc || '')}</p>
        <h3>前の工程</h3>${pillsHtml('task', t.after || [], taskName)}
        <h3>次の工程</h3>${pillsHtml('task', next, taskName)}
        <h3>作る部品</h3>${pillsHtml('part', t.parts || [], partName)}
        ${(t.reqs || []).length ? `<h3>関わる要求</h3>${pillsHtml('req', t.reqs, reqName)}` : ''}
        ${itemsOfTask(s.id).length ? `<h3>この工程で届く品、使う品と道具</h3>${pillsHtml('item', itemsOfTask(s.id), itemName)}` : ''}
        <h3>出典</h3><p>${(t.src || []).map((c) => srcHtml(c)).join('、') || 'なし'}</p>
        ${goButtons('task', s.id)}`;
    }
    if (s.kind === 'item') {
      const x = item(s.id);
      const p = plan();
      const when = (tid) => (p.out.has(tid) ? mdw(planDay(p.out.get(tid).s)) : '');
      const uses = (x.use || []).filter((u) => p.out.has(u));
      const firstUse = uses.length ? uses.reduce((a, b) => (p.out.get(a).s <= p.out.get(b).s ? a : b)) : null;
      if (isTool(x)) {
        return `<h2>${esc(x.name)}</h2><p class="muted">道具（10 万円の外）、${x.group === 'build' ? '組むとき' : '焼くとき'}、${esc(x.have)}</p>
          <p>${srcHtml(x.purpose)}</p>
          <h3>最初に使う工程</h3>${firstUse ? `${pillsHtml('task', [firstUse], taskName)}<p class="muted">${esc(when(firstUse))}</p>` : '<p class="muted">冬（工程の外）</p>'}
          ${goButtons('item', s.id)}`;
      }
      const cat = D.bom.categories.find((c) => c.id === x.cat);
      const arrive = p.out.has(x.batch) ? p.out.get(x.batch).e : null;
      const slack = firstUse != null && arrive != null ? p.out.get(firstUse).s - arrive : null;
      return `<h2>${esc(x.name)}</h2><p class="muted">${esc(cat ? cat.name : '')}、${esc(x.status)}${x.tentative ? '、値段は仮' : ''}</p>
        <table>
          <tr><td>数量</td><td class="num">${esc(x.qty)} ${esc(x.unit)}</td></tr>
          <tr><td>単価</td><td class="num">${yen(x.price)}</td></tr>
          <tr><td>金額</td><td class="num">${yen(x.amount)}</td></tr>
          ${x.paid != null ? `<tr><td>払った額</td><td class="num">${yen(x.paid)}</td></tr>` : ''}
          <tr><td>買う所</td><td>${esc(x.shop)}（${esc(x.how)}）</td></tr>
        </table>
        ${x.note ? `<p>${srcHtml(x.note)}</p>` : ''}
        <h3>届く工程</h3>${pillsHtml('task', [x.batch], taskName)}<p class="muted">${arrive != null ? `届く日 ${esc(mdw(planDay(Math.max(0, arrive - 1))))}` : ''}</p>
        <h3>使う工程</h3>${pillsHtml('task', x.use || [], taskName)}${firstUse ? `<p class="muted">最初に使う日 ${esc(when(firstUse))}${slack != null ? `、届いてから ${slack} 日` : ''}</p>` : ''}
        <h3>使う部品</h3>${pillsHtml('part', x.parts || [], partName)}
        <h3>出典</h3><p>${(x.src || []).map((c) => srcHtml(c)).join('、') || 'なし'}</p>
        ${goButtons('item', s.id)}`;
    }
    if (s.kind === 'flow') {
      const f = flow(s.id);
      const sh = D.sheets.find((x) => x.id === f.sheet);
      return `<h2>${esc(partName(f.from))} → ${esc(partName(f.to))}</h2>
        <p>${esc(D.media[f.media].name)} <span class="muted">（${esc(sh.title)}）</span></p>
        ${f.note ? `<p>${srcHtml(f.note)}</p>` : ''}
        <h3>両端</h3>${pillsHtml(thing(f.from).kind === 'part' ? 'part' : 'node', [f.from], partName)}${pillsHtml(thing(f.to).kind === 'part' ? 'part' : 'node', [f.to], partName)}
        ${goButtons('flow', s.id)}`;
    }
    return '';
  }

  function renderDetail() {
    const box = $('#detail');
    if (!sel.kind) {
      box.classList.add('empty');
      $('#dkind').textContent = '';
      $('#dbody').innerHTML = '<p class="muted">図や一覧の要素を選ぶと、ここに中身と、ほかのモードへの行き先が出ます。</p>';
      return;
    }
    box.classList.remove('empty');
    $('#dkind').textContent = KIND[sel.kind] || '';
    $('#dbody').innerHTML = detailHtml(sel);
  }

  // ---------- 選択とモード

  function select(kind, id, opts = {}) {
    const valid = kind && ((kind === 'part' || kind === 'node') ? thing(id) && thing(id).kind === kind
      : kind === 'req' ? req(id) : kind === 'step' ? step(id) : kind === 'flow' ? flow(id) : kind === 'task' ? task(id)
        : kind === 'item' ? item(id) : false);
    sel = valid ? { kind, id } : { kind: null, id: null };
    renderDetail();
    for (const m of Object.values(mods)) if (m && m.highlight) m.highlight(sel, opts);
    writeUrl(!!opts.push);
  }

  function initMode(m) {
    if (m in mods) return mods[m];
    try {
      mods[m] = factories[m] ? factories[m](api) : null;
    } catch (e) {
      console.error(e);
      mods[m] = null;
    }
    if (!mods[m]) {
      const tab = $(`#tab-${m}`);
      if (tab) tab.hidden = true;
    }
    return mods[m];
  }

  function setMode(m, opts = {}) {
    if (!MODES.includes(m)) m = 'req';
    const mod = initMode(m);
    if (!mod) {
      const first = MODES.find((x) => x !== m && initMode(x));
      if (first && first !== m) return setMode(first, opts);
      return;
    }
    if (mode && mode !== m && mods[mode] && mods[mode].leave) mods[mode].leave();
    mode = m;
    for (const x of MODES) {
      const on = x === m;
      $(`#mode-${x}`).classList.toggle('on', on);
      const tab = $(`#tab-${x}`);
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    }
    mod.enter(opts.params || {});
    if (mod.highlight) mod.highlight(sel, { reveal: true });
    writeUrl(!!opts.push);
  }

  function goto(m, params = {}) { setMode(m, { push: true, params }); }

  // ---------- URL（#/?m=モード&k=種類&i=id と、モードごとの引数）

  function hashOf() {
    const sp = new URLSearchParams();
    if (mode) sp.set('m', mode);
    if (sel.kind) { sp.set('k', sel.kind); sp.set('i', sel.id); }
    if (planOpts.pattern === 'we') sp.set('w', 'we');
    if (planOpts.start && planOpts.start !== defaultStart()) sp.set('s', planOpts.start);
    const mod = mode && mods[mode];
    if (mod && mod.params) for (const [k, v] of Object.entries(mod.params() || {})) if (v != null && v !== '') sp.set(k, v);
    return '#/?' + sp.toString();
  }
  let writing = false;
  function writeUrl(push) {
    if (writing) return;
    const h = hashOf();
    if (h === location.hash) return;
    if (push) history.pushState(null, '', h);
    else history.replaceState(null, '', h);
  }
  function readUrl() {
    const q = location.hash.replace(/^#\/?\??/, '');
    const sp = new URLSearchParams(q);
    const params = Object.fromEntries(sp.entries());
    writing = true;
    try {
      if (params.k && params.i) {
        const valid = (params.k === 'part' || params.k === 'node') ? thing(params.i) : params.k === 'req' ? req(params.i)
          : params.k === 'step' ? step(params.i) : params.k === 'flow' ? flow(params.i) : params.k === 'task' ? task(params.i)
            : params.k === 'item' ? item(params.i) : null;
        sel = valid ? { kind: params.k, id: params.i } : { kind: null, id: null };
      } else {
        sel = { kind: null, id: null };
      }
      // 日程の決め方は URL のとおりにする（既定なら載っていない）
      const w = params.w === 'we' ? 'we' : 'all';
      const st = parseDate(params.s) ? params.s : defaultStart();
      if (w !== planOpts.pattern || st !== planOpts.start) {
        Object.assign(planOpts, { pattern: w, start: st });
        planCache = null;
        for (const m of Object.values(mods)) if (m && m.planChanged) m.planChanged();
      }
      renderDetail();
      setMode(params.m || 'req', { params });
      for (const m of Object.values(mods)) if (m && m.highlight) m.highlight(sel, { reveal: true });
    } finally {
      writing = false;
    }
    writeUrl(false);
  }

  // ---------- 明暗

  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  function initTheme() {
    let t = null;
    try { t = localStorage.getItem(THEME_KEY); } catch (e) { /* 保存できなくても動く */ }
    applyTheme(t);
    $('#theme').onclick = () => {
      const cur = document.documentElement.getAttribute('data-theme');
      const dark = cur ? cur === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      const next = dark ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(THEME_KEY, next); } catch (e) { /* 保存できなくても動く */ }
      for (const m of Object.values(mods)) if (m && m.theme) m.theme();
    };
  }

  // ---------- 幅を変える仕切り

  // 左の一覧（--side-w）と右の札（--detail-w）の幅。localStorage に覚える。
  const WIDTHS = {
    side: { prop: '--side-w', def: 272, min: 180, max: 560, label: '一覧の幅を変える' },
    detail: { prop: '--detail-w', def: 340, min: 240, max: 720, label: '札の幅を変える' },
  };
  function loadWidths() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(WIDTH_KEY) || '{}'); } catch (e) { /* 保存できなくても動く */ }
    for (const [k, w] of Object.entries(WIDTHS)) {
      const v = Number(saved[k]);
      if (v >= w.min && v <= w.max) document.documentElement.style.setProperty(w.prop, `${v}px`);
    }
  }
  function curWidth(k) {
    const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue(WIDTHS[k].prop));
    return Number.isFinite(v) ? v : WIDTHS[k].def;
  }
  function setWidth(k, v, save = true) {
    const w = WIDTHS[k];
    const x = Math.round(Math.min(Math.max(v, w.min), w.max));
    document.documentElement.style.setProperty(w.prop, `${x}px`);
    document.querySelectorAll(`.splitter[data-w="${k}"]`).forEach((s) => s.setAttribute('aria-valuenow', String(x)));
    if (save) {
      try {
        const saved = JSON.parse(localStorage.getItem(WIDTH_KEY) || '{}');
        saved[k] = x;
        localStorage.setItem(WIDTH_KEY, JSON.stringify(saved));
      } catch (e) { /* 保存できなくても動く */ }
    }
  }
  function makeSplitter(k, measure) {
    const w = WIDTHS[k];
    const s = el('div', {
      class: 'splitter', role: 'separator', 'aria-orientation': 'vertical', tabindex: '0', 'data-w': k,
      'aria-label': w.label, 'aria-valuemin': String(w.min), 'aria-valuemax': String(w.max),
      'aria-valuenow': String(curWidth(k)), title: `${w.label}（ダブルクリックで元に戻す）`,
    });
    s.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      s.setPointerCapture(e.pointerId);
      s.classList.add('drag');
      document.body.classList.add('resizing');
      const move = (ev) => setWidth(k, measure(ev.clientX), false);
      const up = (ev) => {
        s.releasePointerCapture(ev.pointerId);
        s.classList.remove('drag');
        document.body.classList.remove('resizing');
        s.removeEventListener('pointermove', move);
        s.removeEventListener('pointerup', up);
        setWidth(k, curWidth(k), true);
      };
      s.addEventListener('pointermove', move);
      s.addEventListener('pointerup', up);
    });
    s.addEventListener('dblclick', () => setWidth(k, w.def));
    s.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 64 : 16;
      const sign = k === 'side' ? 1 : -1; // 右の札は左へ広げる
      if (e.key === 'ArrowRight') setWidth(k, curWidth(k) + step * sign);
      else if (e.key === 'ArrowLeft') setWidth(k, curWidth(k) - step * sign);
      else if (e.key === 'Home') setWidth(k, w.min);
      else if (e.key === 'End') setWidth(k, w.max);
      else if (e.key === 'Enter') setWidth(k, w.def);
      else return;
      e.preventDefault();
    });
    return s;
  }
  function initSplitters() {
    loadWidths();
    document.querySelectorAll('.work').forEach((work) => {
      const side = work.querySelector(':scope > .side');
      if (!side) return;
      side.after(makeSplitter('side', (x) => x - side.getBoundingClientRect().left));
    });
    const detail = $('#detail');
    detail.before(makeSplitter('detail', (x) => detail.getBoundingClientRect().right - x));
  }

  // ---------- 起動

  function fail(msg) {
    const f = $('#fail');
    f.hidden = false;
    f.textContent = msg;
  }

  async function boot() {
    initTheme();
    initSplitters();
    try {
      const [a, b] = await Promise.all([
        fetch('nav.json', { cache: 'no-cache' }),
        fetch('../data/oven.json', { cache: 'no-cache' }),
      ]);
      if (!a.ok) throw new Error(`nav.json を読めません（${a.status}）。tools/gen_nav.py を実行してください。`);
      if (!b.ok) throw new Error(`oven.json を読めません（${b.status}）。`);
      D = await a.json();
      OVEN = await b.json();
    } catch (e) {
      fail(String(e.message || e));
      return;
    }
    index();
    $('#rev').textContent = `改訂 ${D.meta.rev}、寸法 ${D.meta.oven_revision}（${D.meta.oven_date}）`;

    document.addEventListener('click', (e) => {
      const t = e.target.closest('[data-sel], [data-goto]');
      if (!t || !t.closest('#detail, .side, .stage')) return;
      if (t.closest('.stage svg')) return; // 図の中のクリックは各モードが扱う
      e.preventDefault();
      const [k, i] = (t.dataset.sel || ':').split(/:(.*)/s);
      if (t.dataset.goto) {
        if (k) select(k, i, { push: false });
        goto(t.dataset.goto, {});
      } else if (k) {
        select(k, i, { push: true, reveal: true });
      }
    });
    $('#dclose').onclick = () => select(null, null, { push: true });
    const tabs = [...document.querySelectorAll('#modes [role=tab]')];
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => goto(tab.dataset.mode));
      tab.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const vis = tabs.filter((x) => !x.hidden);
        const i = vis.indexOf(tab);
        const n = vis[(i + (e.key === 'ArrowRight' ? 1 : vis.length - 1)) % vis.length];
        n.focus();
        n.click();
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      const mod = mods[mode];
      if (mod && mod.escape && mod.escape()) return;
      if (sel.kind) select(null, null, { push: true });
    });
    window.addEventListener('popstate', readUrl);
    readUrl();
  }

  // ---------- 各モードへの口

  const api = {
    get data() { return D; },
    get oven() { return OVEN; },
    get sel() { return sel; },
    get mode() { return mode; },
    $, el, esc, chip, statusClass, srcHtml, docHref,
    thing, req, step, flow, task, item, isTool, kidsOf, allocOf,
    reqsOfPart, stepsOfPart, reqsOfStep, flowsOf, sheetsOf, tasksOfPart, itemsOfPart, itemsOfTask, related,
    plan, setPlanOpts, planDay, parseDate, md, mdw, yen,
    get planOpts() { return { ...planOpts }; },
    select, goto, writeUrl, panZoom,
    tip(html, x, y) {
      const t = $('#tip');
      if (!html) { t.hidden = true; return; }
      t.innerHTML = html;
      t.hidden = false;
      t.style.left = `${x + 12}px`;
      t.style.top = `${y + 12}px`;
    },
  };

  window.NavApp = {
    register(name, factory) { factories[name] = factory; },
    boot,
    api,
  };
})();
