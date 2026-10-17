// 3D モード。docs/viewer/ を iframe で開き、postMessage で部品を光らせる。
NavApp.register('v3d', (api) => {
  'use strict';

  const stage = api.$('#v3d-stage');
  const note = api.$('#v3d-note');
  if (!stage) return null;
  if (note) note.textContent = '部品を選ぶと 3D でも光る。3D で部品を押すと、ナビゲータでも選ばれる。';

  const style = document.createElement('style');
  style.textContent = `
    #mode-v3d .v3d-frame { display: block; width: 100%; height: 100%; border: 0; background: var(--paper); }
  `;
  document.head.append(style);

  let frame = null;
  let ready = false;
  let pending = [];

  function post(parts) {
    if (!frame || !frame.contentWindow) return;
    frame.contentWindow.postMessage({ type: 'v3d:focus', parts }, location.origin);
  }

  function partsOf(sel) {
    if (!sel || !sel.kind) return [];
    return [...api.related(sel).parts].filter((id) => {
      const t = api.thing(id);
      return t && t.kind === 'part';
    });
  }

  function onMessage(e) {
    if (!frame || e.source !== frame.contentWindow || e.origin !== location.origin) return;
    const m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.type === 'v3d:ready') {
      ready = true;
      post(pending);
    } else if (m.type === 'v3d:pick') {
      if (typeof m.part === 'string' && api.thing(m.part)) api.select('part', m.part, { push: true });
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
    if (ready) post(pending);
  }

  return {
    enter() {
      make();
    },
    leave() {},
    params() { return {}; },
    highlight,
    escape() { return false; },
  };
});
