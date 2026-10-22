// 3D モード。docs/viewer/ を iframe で開き、postMessage で部品を光らせる。
// 帯のボタンで、煙突を足した形、断面、見る向き、まわりを透かす、空気の流れの場面を 3D の図へ伝える。
// 既定は初めの形（煙突と垂れ壁は後で足す、施主の決定 2026-10-21）で、「煙突を足した形」を押すと URL に chim=1 を載せる。
// 左の欄（開け閉めできる）で、部品ごとに表示と非表示を切り替える。隠した部品は URL の hide=id,id に残す。
// 帯の「温度」で、工程ごとの温度の分布を 3D の図に塗らせ、帯の下に時刻の帯（docs/viewer/tbar.js）を出す。
// 時刻の帯の中身は 3D の図が v3d:tinfo で渡し、日と時刻は v3d:temp で 3D の図へ伝える。URL には temp=1、tday、tmin、t2d を残す。
NavApp.register('v3d', (api) => {
  'use strict';

  const stage = api.$('#v3d-stage');
  const note = api.$('#v3d-note');
  const bar = api.$('#mode-v3d .modebar');
  if (!stage || !bar) return null;
  if (note) note.textContent = '部品を選ぶと 3D でも光る。3D で部品を押すと選ばれ、何もない所を押すと選択が外れる。空気の流れの場面を選ぶと、流れを矢印で描く。左の欄で部品を隠せる。図は初めの形（煙突と垂れ壁なし）で、「煙突を足した形」で後で足したあとの形に替わる。「温度」で工程ごとの温度の分布を色で塗る。';

  const style = document.createElement('style');
  style.textContent = `
    #mode-v3d .v3d-frame { display: block; width: 100%; height: 100%; border: 0; background: var(--paper); }
    #mode-v3d .v3dbar { margin-left: auto; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    #mode-v3d .v3dbar .sep { width: 1px; height: 20px; background: var(--rule); margin: 0 4px; }
    #mode-v3d .v3dbar button {
      border: 1px solid var(--rule); background: var(--card); color: var(--ink); border-radius: 6px;
      padding: 2px 10px; font: inherit; font-size: 12px; cursor: pointer;
    }
    #mode-v3d .v3dbar button:hover { border-color: var(--accent); }
    #mode-v3d .v3dbar button[aria-pressed="true"] { background: var(--accent-tint); border-color: var(--accent); font-weight: 700; }
    #mode-v3d .v3dbar label { font-size: 12px; display: flex; gap: 4px; align-items: center; }
    #mode-v3d .v3dbar select {
      border: 1px solid var(--rule); background: var(--card); color: var(--ink); border-radius: 6px;
      padding: 1px 6px; font: inherit; font-size: 12px;
    }
    #mode-v3d .v3d-side[hidden] { display: none; }
    #mode-v3d .v3d-trow { flex: none; padding: 6px 16px 8px; border-bottom: 1px solid var(--rule); background: var(--card); }
    #mode-v3d .v3d-trow[hidden] { display: none; }
    #mode-v3d .v3d-side .tools { flex-direction: row; flex-wrap: wrap; }
    #mode-v3d .v3d-side .tools button {
      border: 1px solid var(--rule); background: var(--paper); color: var(--ink); border-radius: 6px;
      padding: 2px 10px; font: inherit; font-size: 12px; cursor: pointer;
    }
    #mode-v3d .v3d-side .tools button:hover { border-color: var(--accent); }
    #mode-v3d .v3d-side .row { align-items: center; padding-top: 3px; padding-bottom: 3px; }
    #mode-v3d .v3d-side .row input { margin: 0; flex: none; accent-color: var(--accent); }
    #mode-v3d .v3d-side .row.off .nm { color: var(--muted); text-decoration: line-through; }
    #mode-v3d .v3d-side .row.lit { box-shadow: inset 3px 0 0 var(--hl); }
    #mode-v3d .v3d-side .sw { width: 12px; height: 12px; border-radius: 3px; border: 1px solid var(--rule); flex: none; }
    #mode-v3d .v3d-side .row.off .sw { opacity: .35; }
    #mode-v3d .v3d-side .cnt { padding: 0 16px 4px; font-size: 12px; color: var(--muted); }
    #mode-v3d .v3d-side .msg { margin: 8px 16px 0; font-size: 12px; color: var(--muted); }
    #mode-v3d .v3d-side .msg:empty { display: none; }
    @media (max-width: 899px) {
      #mode-v3d .modebar { flex-wrap: wrap; }
      /* 狭い画面では、見出しを省き、一覧を 2 列以上に並べて、3D の図の上に多くの部品を出す */
      #mode-v3d .v3d-side { max-height: 50%; padding: 4px 0 8px; }
      #mode-v3d .v3d-side h2 { display: none; }
      #mode-v3d .v3d-side .tools { align-items: center; }
      #mode-v3d .v3d-side .cnt { padding-top: 0; }
      #mode-v3d .v3d-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); }
      #mode-v3d .v3d-side .row { padding-left: 12px; padding-right: 8px; }
    }
  `;
  document.head.append(style);

  // 帯のボタン
  const tools = api.el('div', { class: 'v3dbar', role: 'toolbar', 'aria-label': '3D の見方' });
  const btnChim = api.el('button', { type: 'button', 'aria-pressed': 'false', text: '煙突を足した形', title: '初めの形（煙突と垂れ壁なし）と、煙突と垂れ壁を後で足した形を切り替える' });
  const btnCut = api.el('button', { type: 'button', 'aria-pressed': 'false', text: '断面' });
  const btnFade = api.el('button', { type: 'button', 'aria-pressed': 'false', text: 'まわりを透かす' });
  const views = [['iso', '斜め'], ['front', '正面'], ['side', '側面'], ['top', '上']].map(([v, t]) =>
    api.el('button', { type: 'button', 'data-view': v, text: t }));
  // 空気の流れの場面（3D の図の FLOW_SCENES と同じ名にする）
  const AIR = [['', 'なし'], ['fire', '焚く'], ['bake', '焼く'], ['cool', '温度を下げる'], ['shell', '殻の換気']];
  const selAir = api.el('select', { 'aria-label': '空気の流れの場面' });
  for (const [v, t] of AIR) selAir.append(api.el('option', { value: v, text: t }));
  const airLabel = api.el('label', { text: '空気の流れ' });
  airLabel.append(selAir);
  const btnSide = api.el('button', { type: 'button', 'aria-controls': 'v3d-side', text: '部品の表示' });
  const btnTemp = api.el('button', { type: 'button', 'aria-pressed': 'false', 'aria-controls': 'v3d-trow', text: '温度', title: '工程ごとの温度の分布を色で塗り、帯の下に時刻の帯を出す' });
  tools.append(btnSide, api.el('span', { class: 'sep', 'aria-hidden': 'true' }), btnChim,
    api.el('span', { class: 'sep', 'aria-hidden': 'true' }), btnCut, btnFade,
    api.el('span', { class: 'sep', 'aria-hidden': 'true' }), ...views,
    api.el('span', { class: 'sep', 'aria-hidden': 'true' }), airLabel,
    api.el('span', { class: 'sep', 'aria-hidden': 'true' }), btnTemp);
  bar.append(tools);

  // 時刻の帯の行（温度を塗るときだけ出す）。帯は 3D の図から中身が届いてから作る。
  const trow = api.el('div', { class: 'v3d-trow', id: 'v3d-trow', role: 'group', 'aria-label': '温度の時刻' });
  trow.hidden = true;
  bar.after(trow);

  // 部品の表示の欄。部品の一覧は 3D の図が v3d:ready で渡す（id、名、色）。届くまでは model.yaml の部品で作る。
  const side = api.el('aside', { class: 'side v3d-side', id: 'v3d-side', 'aria-label': '部品の表示' });
  const btnAll = api.el('button', { type: 'button', text: '全部表示' });
  const btnNone = api.el('button', { type: 'button', text: '全部隠す' });
  const sideTools = api.el('div', { class: 'tools' });
  sideTools.append(btnAll, btnNone);
  const cnt = api.el('div', { class: 'cnt' });
  const list = api.el('div', { class: 'v3d-list' });
  const msg = api.el('p', { class: 'msg', 'aria-live': 'polite' });
  side.append(api.el('h2', { text: '部品の表示' }), sideTools, cnt, list, msg);
  stage.before(side);

  function setSide(open) {
    side.hidden = !open;
    btnSide.setAttribute('aria-expanded', String(open));
    btnSide.setAttribute('aria-pressed', String(open));
  }
  // 広い画面では開いておき、狭い画面では閉じておく。
  setSide(!window.matchMedia || window.matchMedia('(min-width: 900px)').matches);
  btnSide.addEventListener('click', () => setSide(side.hidden));

  let frame = null;
  let ready = false;
  let pending = [];
  let section = false;
  let fade = false;
  let chim = false;            // 煙突と垂れ壁を足した形を見せるか（既定は初めの形）
  let air = '';
  let hidden = new Set();      // 隠した部品の id
  let parts = null;            // 3D の図から届いた部品の一覧 [{ id, label, color }]
  let lastSel = '';            // 最後に見た選択（種類:id）
  let adopt = true;            // 次の選択は URL から来たもので、隠した部品を戻さない
  const temp = { on: false, day: '', t: null, h2d: false };   // 温度の分布（日の名、6:00 に火を付けてからの分、炉床を 2 次元で）
  let tbar = null;             // 時刻の帯（docs/viewer/tbar.js）

  const PART_IDS = api.data.parts.map((p) => p.id);
  const known = (id) => PART_IDS.includes(id);
  const hideOrder = () => PART_IDS.filter((id) => hidden.has(id));
  const parseHide = (v) => new Set(String(v || '').split(',').map((x) => x.trim()).filter(known));

  function send(msg) {
    if (!frame || !frame.contentWindow || !ready) return;
    frame.contentWindow.postMessage(msg, location.origin);
  }

  function partsOf(sel) {
    if (!sel || !sel.kind) return [];
    return [...api.related(sel).parts].filter((id) => {
      const t = api.thing(id);
      return t && t.kind === 'part';
    });
  }

  function listParts() {
    return parts || api.data.parts.map((p) => ({ id: p.id, label: p.name, color: null }));
  }

  function renderList() {
    list.replaceChildren();
    for (const p of listParts()) {
      const row = api.el('label', { class: 'row', 'data-part': p.id });
      const box = api.el('input', { type: 'checkbox', 'aria-label': `${p.label}を表示する` });
      box.dataset.part = p.id;
      const sw = api.el('span', { class: 'sw', 'aria-hidden': 'true' });
      if (p.color) sw.style.background = p.color;   // 3D の図の部品の色（データ）
      row.append(box, sw, api.el('span', { class: 'nm', text: p.label }));
      list.append(row);
    }
    syncList();
  }

  function syncList() {
    const lit = new Set(pending);
    for (const row of list.querySelectorAll('.row')) {
      const id = row.dataset.part;
      const off = hidden.has(id);
      row.querySelector('input').checked = !off;
      row.classList.toggle('off', off);
      row.classList.toggle('lit', lit.has(id));
    }
    const n = listParts().filter((p) => hidden.has(p.id)).length;
    cnt.textContent = n ? `${n} 個を隠している` : 'すべて表示している';
  }

  function setHidden(next, opts = {}) {
    hidden = new Set([...next].filter(known));
    syncList();
    send({ type: 'v3d:visible', hidden: hideOrder() });
    if (opts.url !== false) api.writeUrl(false);
  }

  list.addEventListener('change', (e) => {
    const id = e.target.dataset && e.target.dataset.part;
    if (!id) return;
    const next = new Set(hidden);
    if (e.target.checked) next.delete(id); else next.add(id);
    msg.textContent = '';
    setHidden(next);
  });
  btnAll.addEventListener('click', () => { msg.textContent = ''; setHidden([]); });
  btnNone.addEventListener('click', () => { msg.textContent = ''; setHidden(listParts().map((p) => p.id)); });

  function syncButtons() {
    btnChim.setAttribute('aria-pressed', String(chim));
    btnCut.setAttribute('aria-pressed', String(section));
    btnFade.setAttribute('aria-pressed', String(fade));
    btnTemp.setAttribute('aria-pressed', String(temp.on));
    btnTemp.setAttribute('aria-expanded', String(temp.on));
  }

  function sendTemp() {
    const m = { type: 'v3d:temp', on: temp.on, h2d: temp.h2d };
    if (temp.day) m.day = temp.day;
    if (temp.t != null) m.t = temp.t;
    send(m);
  }
  function makeBar() {
    if (tbar) return;
    if (!window.ThermBar) {
      trow.textContent = '時刻の帯を読めない（docs/viewer/tbar.js）。';
      return;
    }
    tbar = window.ThermBar.mount(trow, {
      onChange(s, final) {
        Object.assign(temp, { day: s.day, t: s.t, h2d: s.h2d });
        sendTemp();
        if (final) api.writeUrl(false);
      },
    });
  }
  function setTemp(on) {
    temp.on = !!on;
    trow.hidden = !temp.on;
    if (temp.on) makeBar();
    else if (tbar) tbar.stop();
    syncButtons();
    sendTemp();
  }
  btnTemp.addEventListener('click', () => {
    setTemp(!temp.on);
    api.writeUrl(false);
  });

  btnChim.addEventListener('click', () => {
    chim = !chim;
    syncButtons();
    send({ type: 'v3d:chimney', on: chim });
    api.writeUrl(false);
  });

  btnCut.addEventListener('click', () => {
    section = !section;
    syncButtons();
    send({ type: 'v3d:section', on: section });
    api.writeUrl(false);
  });
  btnFade.addEventListener('click', () => {
    fade = !fade;
    syncButtons();
    send({ type: 'v3d:fade', on: fade });
  });
  for (const b of views) b.addEventListener('click', () => send({ type: 'v3d:view', view: b.dataset.view }));
  selAir.addEventListener('change', () => {
    air = AIR.some(([v]) => v === selAir.value) ? selAir.value : '';
    send({ type: 'v3d:flow', scene: air || 'none' });
    api.writeUrl(false);
  });

  function onMessage(e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'v3d:ready') {
      ready = true;
      if (Array.isArray(m.parts)) {
        const got = m.parts.filter((p) => p && typeof p.id === 'string' && known(p.id))
          .map((p) => ({ id: p.id, label: typeof p.label === 'string' ? p.label : p.id, color: /^#[0-9a-f]{6}$/i.test(p.color) ? p.color : null }));
        if (got.length) { parts = got; renderList(); }
      }
      if (hidden.size) send({ type: 'v3d:visible', hidden: hideOrder() });
      if (chim) send({ type: 'v3d:chimney', on: true });
      if (section) send({ type: 'v3d:section', on: true });
      if (fade) send({ type: 'v3d:fade', on: true });
      if (air) send({ type: 'v3d:flow', scene: air });
      if (temp.on) sendTemp();
      send({ type: 'v3d:focus', parts: pending });
    } else if (m.type === 'v3d:tinfo') {
      // 3D の図が温度のデータを読んだ。帯を作り、3D の図がそろえた日と時刻に合わせる。
      makeBar();
      if (!tbar) return;
      if (m.error || !m.info) {
        tbar.setInfo(null);
        tbar.message(m.error || '温度のデータを読んでいる。');
        return;
      }
      tbar.setInfo(m.info);
      const s = m.state && typeof m.state === 'object' ? m.state : {};
      tbar.set({ day: temp.day || s.day, t: temp.t != null ? temp.t : s.t, h2d: temp.h2d });
      const g = tbar.get();
      const moved = g.day !== temp.day || g.t !== temp.t || g.h2d !== temp.h2d;
      Object.assign(temp, { day: g.day, t: g.t, h2d: g.h2d });
      if (moved) { sendTemp(); api.writeUrl(false); }
    } else if (m.type === 'v3d:pick') {
      if (m.part == null) api.select(null, null, { push: true });
      else if (typeof m.part === 'string' && api.thing(m.part)) api.select('part', m.part, { push: true });
    }
  }

  function make() {
    if (frame) return;
    frame = document.createElement('iframe');
    frame.className = 'v3d-frame';
    frame.src = '../viewer/?embed=1';
    frame.title = 'パン窯 3D モデル';
    stage.append(frame);
    window.addEventListener('message', onMessage);
  }

  // 選択が変わり、光らせる部品に隠した部品があれば、表示に戻す（選んだものが見えるように）。
  // URL から開いたときの選択（hide と同じ URL にある）は戻さず、URL のとおりにする。
  // URL は外枠が選択のあとで書くので、ここでは書かない（書くと選択の履歴が積まれない）。
  function highlight(sel) {
    pending = partsOf(sel);
    const key = sel && sel.kind ? `${sel.kind}:${sel.id}` : '';
    if (adopt) {
      adopt = false;
    } else if (key !== lastSel) {
      const back = pending.filter((id) => hidden.has(id));
      if (back.length) {
        const next = new Set(hidden);
        for (const id of back) next.delete(id);
        const names = back.map((id) => { const p = listParts().find((x) => x.id === id); return p ? p.label : id; });
        msg.textContent = `選んだものに関係する部品（${names.join('、')}）を表示に戻した。`;
        setHidden(next, { url: false });
      } else if (key) {
        msg.textContent = '';
      }
    }
    lastSel = key;
    syncList();
    send({ type: 'v3d:focus', parts: pending });
  }

  renderList();

  return {
    enter(params) {
      if (params && params.chim === '1' && !chim) {
        chim = true;
        syncButtons();
        send({ type: 'v3d:chimney', on: true });
      }
      if (params && params.cut === '1' && !section) {
        section = true;
        syncButtons();
        send({ type: 'v3d:section', on: true });
      }
      // 温度の分布（temp=1）と、日（tday）、時刻（tmin、分）、炉床を 2 次元で（t2d=1）
      if (params && params.temp === '1') {
        if (params.tday) temp.day = params.tday;
        if (params.tmin && Number.isFinite(Number(params.tmin))) temp.t = Number(params.tmin);
        if (params.t2d === '1') temp.h2d = true;
        if (tbar) tbar.set({ day: temp.day || undefined, t: temp.t != null ? temp.t : undefined, h2d: temp.h2d });
        if (!temp.on) setTemp(true); else sendTemp();
      }
      if (params && params.air && params.air !== air && AIR.some(([v]) => v === params.air)) {
        air = params.air;
        selAir.value = air;
        send({ type: 'v3d:flow', scene: air });
      }
      // hide が URL にあれば、そのとおりに隠す（無ければ今のまま）。同じ URL の選択では隠した部品を戻さない。
      if (params && typeof params.hide === 'string') {
        const h = parseHide(params.hide);
        adopt = true;
        if (h.size !== hidden.size || [...h].some((id) => !hidden.has(id))) setHidden(h, { url: false });
      }
      make();
    },
    leave() { if (tbar) tbar.stop(); },
    params() {
      const tp = temp.on ? {
        temp: '1', tday: temp.day && temp.day !== 'normal' ? temp.day : '',
        tmin: temp.t != null ? String(Math.round(temp.t)) : '', t2d: temp.h2d ? '1' : '',
      } : {};
      return { chim: chim ? '1' : '', cut: section ? '1' : '', air, hide: hideOrder().join(','), ...tp };
    },
    highlight,
    escape() { return false; },
  };
});
