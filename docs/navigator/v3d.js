// 3D モード。docs/viewer/ を iframe で開き、postMessage で部品を光らせる。
// 帯のボタンで、断面、見る向き、まわりを透かすを 3D の図へ伝える。
NavApp.register('v3d', (api) => {
  'use strict';

  const stage = api.$('#v3d-stage');
  const note = api.$('#v3d-note');
  const bar = api.$('#mode-v3d .modebar');
  if (!stage || !bar) return null;
  if (note) note.textContent = '部品を選ぶと 3D でも光る。3D で部品を押すと選ばれ、何もない所を押すと選択が外れる。';

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
    @media (max-width: 899px) { #mode-v3d .modebar { flex-wrap: wrap; } }
  `;
  document.head.append(style);

  // 帯のボタン
  const tools = api.el('div', { class: 'v3dbar', role: 'toolbar', 'aria-label': '3D の見方' });
  const btnCut = api.el('button', { type: 'button', 'aria-pressed': 'false', text: '断面' });
  const btnFade = api.el('button', { type: 'button', 'aria-pressed': 'false', text: 'まわりを透かす' });
  const views = [['iso', '斜め'], ['front', '正面'], ['side', '側面'], ['top', '上']].map(([v, t]) =>
    api.el('button', { type: 'button', 'data-view': v, text: t }));
  tools.append(btnCut, btnFade, api.el('span', { class: 'sep', 'aria-hidden': 'true' }), ...views);
  bar.append(tools);

  let frame = null;
  let ready = false;
  let pending = [];
  let section = false;
  let fade = false;

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

  function syncButtons() {
    btnCut.setAttribute('aria-pressed', String(section));
    btnFade.setAttribute('aria-pressed', String(fade));
  }

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

  function onMessage(e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'v3d:ready') {
      ready = true;
      if (section) send({ type: 'v3d:section', on: true });
      if (fade) send({ type: 'v3d:fade', on: true });
      send({ type: 'v3d:focus', parts: pending });
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

  function highlight(sel) {
    pending = partsOf(sel);
    send({ type: 'v3d:focus', parts: pending });
  }

  return {
    enter(params) {
      if (params && params.cut === '1' && !section) {
        section = true;
        syncButtons();
        send({ type: 'v3d:section', on: true });
      }
      make();
    },
    leave() {},
    params() { return { cut: section ? '1' : '' }; },
    highlight,
    escape() { return false; },
  };
});
