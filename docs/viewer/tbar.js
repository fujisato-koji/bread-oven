// 温度の時刻の帯。3D の図（docs/viewer/）と、ナビゲータの 3D の帯（docs/navigator/v3d.js）が同じものを使う。
// 帯は、日の切り替え、再生と一時停止、時刻のつまみと工程の区切り、工程の名の札、炉床の 2 次元の切り替えを持つ。
// 中身（工程の名と時刻、窯入れの時刻、2 次元の主な時刻）は、3D の図が docs/data/thermal.json から作って渡す（info）。
// 時刻 t は 6:00 に火を付けてからの分である。
// つまみの位置は、焼き終わりまでを帯の 8 割に時刻のとおりに置き、冷めるまでを残りの 2 割に平方根で縮めて置く。
// 冷めるまでの 40 時間を帯に収め、焼き終わりのすぐあとを広く見せるためである。
// 2 次元の切り替えを入れると、つまみは 2 次元の主な時刻だけに止まる。
(function () {
  'use strict';
  if (window.ThermBar) return;

  const FIRE = 0.8;     // 焼き終わりまでに使う帯の割合
  const PLAY_S = 60;    // 帯の端から端までを再生する秒
  const SNAP_S = 1.2;   // 2 次元の主な時刻を 1 つ進める秒

  // 色は置き場（3D の図とナビゲータ）の :root の変数を使う。名の違う変数は、もう一方の名を代わりに読む。
  const CSS = `
  .tb { font-size: 12px; color: var(--ink); display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .tb-row { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
  .tb button { font: inherit; font-size: 12px; color: var(--ink); background: transparent; border: 0; padding: 1px 10px; cursor: pointer; }
  .tb-days { display: inline-flex; border: 1px solid var(--line, var(--rule)); border-radius: 6px; overflow: hidden; }
  .tb-days button + button { border-left: 1px solid var(--line, var(--rule)); }
  .tb-days button[aria-pressed="true"] { background: var(--accent); color: var(--accent-ink); }
  .tb .tb-play { border: 1px solid var(--line, var(--rule)); border-radius: 6px; min-width: 76px; }
  .tb .tb-play[aria-pressed="true"] { border-color: var(--accent); }
  .tb-now { font-variant-numeric: tabular-nums; font-weight: 600; }
  .tb-2d { display: inline-flex; align-items: center; gap: 4px; cursor: pointer; color: var(--muted); }
  .tb-2d input { margin: 0; accent-color: var(--accent); }
  .tb-track { position: relative; height: 26px; margin: 0 8px; cursor: pointer; touch-action: none; outline: none; }
  .tb-track:focus-visible { box-shadow: 0 0 0 2px var(--accent); border-radius: 4px; }
  .tb-seg { position: absolute; top: 9px; height: 12px; box-shadow: inset -1px 0 0 var(--panel, var(--card)); background: color-mix(in srgb, var(--muted) 24%, transparent); }
  .tb-seg.alt { background: color-mix(in srgb, var(--muted) 40%, transparent); }
  .tb-seg.on { background: color-mix(in srgb, var(--accent) 50%, transparent); }
  .tb-mk { position: absolute; top: 0; transform: translateX(-50%); font-size: 9.5px; line-height: 9px; color: var(--muted); pointer-events: none; white-space: nowrap; }
  .tb-snap { position: absolute; top: 12px; width: 6px; height: 6px; margin-left: -3px; border-radius: 50%; background: var(--ink); opacity: .6; pointer-events: none; }
  .tb-thumb { position: absolute; top: 5px; width: 4px; margin-left: -2px; height: 20px; border-radius: 2px; background: var(--ink); pointer-events: none; box-shadow: 0 0 0 2px var(--panel, var(--card)); }
  .tb-ticks { position: relative; height: 14px; margin: 0 8px; color: var(--muted); font-size: 10.5px; line-height: 14px; }
  .tb-tick { position: absolute; transform: translateX(-50%); white-space: nowrap; }
  .tb-phs { display: flex; flex-wrap: wrap; gap: 3px; }
  .tb .tb-phs button { border: 1px solid var(--line, var(--rule)); border-radius: 10px; padding: 0 8px; font-size: 11.5px; line-height: 1.6; }
  .tb .tb-phs button[aria-pressed="true"] { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 20%, transparent); font-weight: 600; }
  .tb-msg { color: var(--muted); }
  `;

  function addStyle() {
    if (document.getElementById('thermbar-style')) return;
    const s = document.createElement('style');
    s.id = 'thermbar-style';
    s.textContent = CSS;
    document.head.append(s);
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // 帯の位置 u（0〜1）と時刻 t（分）の行き来
  function uOf(day, t) {
    const tb = day.bakeEnd;
    if (t <= tb) return FIRE * clamp(t, 0, tb) / tb;
    return FIRE + (1 - FIRE) * Math.sqrt(clamp((t - tb) / (day.tmax - tb), 0, 1));
  }
  function tOf(day, u) {
    const tb = day.bakeEnd;
    if (u <= FIRE) return tb * clamp(u, 0, FIRE) / FIRE;
    const s = clamp((u - FIRE) / (1 - FIRE), 0, 1);
    return tb + s * s * (day.tmax - tb);
  }

  // 時計の時刻（火を付けたのが start 分、既定は 6:00）。翌日より先は日を前に書く。
  function clock(t, start = 360) {
    const m = Math.round(start + t);
    const d = Math.floor(m / 1440);
    const r = ((m % 1440) + 1440) % 1440;
    const s = `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`;
    return d === 0 ? s : d === 1 ? `翌日 ${s}` : d === 2 ? `翌々日 ${s}` : `${d} 日後 ${s}`;
  }
  function elapsed(t) {
    const m = Math.round(t);
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (!h) return `火を付けて ${r} 分`;
    return r ? `火を付けて ${h} 時間 ${r} 分` : `火を付けて ${h} 時間`;
  }
  // 時刻の工程。工程は [始め, 終わり) で持ち、最後の工程だけ終わりを含める。
  function phaseAt(day, t) {
    const ps = day.phases;
    for (let i = 0; i < ps.length; i++) {
      if (t < ps[i].t[1] || i === ps.length - 1) return i;
    }
    return ps.length - 1;
  }

  function mount(root, opts = {}) {
    addStyle();
    const onChange = typeof opts.onChange === 'function' ? opts.onChange : () => {};
    const st = { day: 'normal', t: 0, h2d: false };
    let info = null;
    let playing = false;
    let raf = 0;
    let last = 0;
    let acc = 0;

    const el = (tag, cls, text) => {
      const e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text != null) e.textContent = text;
      return e;
    };
    const wrap = el('div', 'tb');
    const row = el('div', 'tb-row');
    const days = el('div', 'tb-days');
    days.setAttribute('role', 'group');
    days.setAttribute('aria-label', '日');
    const play = el('button', 'tb-play', '再生');
    play.type = 'button';
    play.setAttribute('aria-pressed', 'false');
    const now = el('output', 'tb-now');
    now.setAttribute('aria-live', 'off');
    const l2d = el('label', 'tb-2d');
    const c2d = document.createElement('input');
    c2d.type = 'checkbox';
    l2d.append(c2d, document.createTextNode('炉床を 2 次元で（主な時刻）'));
    l2d.title = '炉床とドームの足の 2 次元の計算で炉床を塗る。つまみは 2 次元の主な時刻だけに止まる';
    row.append(days, play, now, l2d);
    const track = el('div', 'tb-track');
    track.tabIndex = 0;
    track.setAttribute('role', 'slider');
    track.setAttribute('aria-label', '時刻');
    const ticks = el('div', 'tb-ticks');
    ticks.setAttribute('aria-hidden', 'true');
    const phs = el('div', 'tb-phs');
    phs.setAttribute('role', 'group');
    phs.setAttribute('aria-label', '工程');
    const msg = el('p', 'tb-msg', '温度のデータを読んでいる。');
    msg.style.margin = '0';
    wrap.append(row, track, ticks, phs, msg);
    root.append(wrap);
    for (const e of [row, track, ticks, phs]) e.hidden = true;

    const D = () => (info ? info.days[st.day] : null);
    const snaps = () => (st.h2d && D() ? D().snaps : null);

    function nearestSnap(day, t) {
      let best = null;
      for (const s of day.snaps) if (!best || Math.abs(s.t - t) < Math.abs(best.t - t)) best = s;
      return best;
    }
    function norm() {
      const d = D();
      if (!d) return;
      st.t = clamp(Number.isFinite(st.t) ? st.t : 0, 0, d.tmax);
      if (st.h2d && d.snaps.length) st.t = nearestSnap(d, st.t).t;
    }

    function emit(final) { onChange({ ...st }, final); }

    // ---------- 描く
    function renderStatic() {
      const d = D();
      if (!d) return;
      days.replaceChildren(...info.order.map((k) => {
        const b = el('button', null, info.days[k].label);
        b.type = 'button';
        b.dataset.day = k;
        b.title = info.days[k].cond || '';
        return b;
      }));
      track.querySelectorAll('.tb-seg, .tb-mk, .tb-snap, .tb-thumb').forEach((e) => e.remove());
      d.phases.forEach((p, i) => {
        const s = el('div', `tb-seg${i % 2 ? ' alt' : ''}`);
        const a = uOf(d, p.t[0]);
        const b = uOf(d, p.t[1]);
        s.style.left = `${a * 100}%`;
        s.style.width = `${(b - a) * 100}%`;
        s.dataset.i = String(i);
        s.title = `${p.name}（${clock(p.t[0], info.clockStart)}〜${clock(p.t[1], info.clockStart)}）`;
        track.append(s);
      });
      (d.loads || []).forEach((t, i) => {
        const m = el('div', 'tb-mk', `▼${i + 1}`);
        m.style.left = `${uOf(d, t) * 100}%`;
        track.append(m);
      });
      if (st.h2d) {
        for (const s of d.snaps) {
          const m = el('div', 'tb-snap');
          m.style.left = `${uOf(d, s.t) * 100}%`;
          track.append(m);
        }
      }
      track.append(el('div', 'tb-thumb'));
      phs.replaceChildren(...d.phases.map((p, i) => {
        const b = el('button', null, p.name);
        b.type = 'button';
        b.dataset.i = String(i);
        b.title = `${clock(p.t[0], info.clockStart)}〜${clock(p.t[1], info.clockStart)}`;
        return b;
      }));
      renderTicks();
    }

    // 時計の目盛。焼き終わりまでは 2 時間ごと、冷めるまでは 18:00、0:00、6:00 に置く。
    // 終わりの目盛を先に置き、ほかは前の目盛と重なるものを省く。
    function renderTicks() {
      const d = D();
      if (!d) return;
      const w = ticks.clientWidth || 600;
      const cs = info.clockStart;
      const list = [];
      for (let t = 0; t <= d.bakeEnd; t += 120) list.push(t);
      for (let m = 1080; m - cs < d.tmax; m += 360) {
        const t = m - cs;
        if (t > d.bakeEnd + 60 && m % 1440 !== 720) list.push(t);
      }
      const short = (t) => clock(t, cs).replace('翌々日 ', '翌々 ').replace('翌日 ', '翌 ');
      const endX = w;
      let lastX = -1e9;
      const out = [];
      for (const t of list) {
        const x = uOf(d, t) * w;
        if (x - lastX < 50 || endX - x < 64) continue;
        const e = el('span', 'tb-tick', short(t));
        e.style.left = `${(x / w) * 100}%`;
        out.push(e);
        lastX = x;
      }
      const e = el('span', 'tb-tick', short(d.tmax));
      e.style.left = '100%';
      e.style.transform = 'translateX(-100%)';
      out.push(e);
      ticks.replaceChildren(...out);
    }

    function renderDyn() {
      const d = D();
      if (!d) return;
      for (const b of days.querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.day === st.day));
      c2d.checked = st.h2d;
      const i = phaseAt(d, st.t);
      for (const s of track.querySelectorAll('.tb-seg')) s.classList.toggle('on', Number(s.dataset.i) === i);
      for (const b of phs.querySelectorAll('button')) b.setAttribute('aria-pressed', String(Number(b.dataset.i) === i));
      const th = track.querySelector('.tb-thumb');
      if (th) th.style.left = `${uOf(d, st.t) * 100}%`;
      const sn = st.h2d ? nearestSnap(d, st.t) : null;
      const label = `${clock(st.t, info.clockStart)}（${elapsed(st.t)}）${d.phases[i].name}`;
      now.textContent = sn ? `${label}、2 次元は「${sn.label}」` : label;
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', String(d.tmax));
      track.setAttribute('aria-valuenow', String(Math.round(st.t)));
      track.setAttribute('aria-valuetext', label);
      play.textContent = playing ? '一時停止' : '再生';
      play.setAttribute('aria-pressed', String(playing));
    }

    // ---------- 動かす
    function setT(t, final) {
      st.t = t;
      norm();
      renderDyn();
      emit(final);
    }

    function fromX(clientX) {
      const r = track.getBoundingClientRect();
      const u = clamp((clientX - r.left) / Math.max(r.width, 1), 0, 1);
      const t = tOf(D(), u);
      return D().bakeEnd >= t ? Math.round(t) : Math.round(t / 5) * 5;
    }
    let dragging = false;
    track.addEventListener('pointerdown', (e) => {
      if (!D()) return;
      dragging = true;
      track.setPointerCapture(e.pointerId);
      pause(false);
      setT(fromX(e.clientX), false);
    });
    track.addEventListener('pointermove', (e) => { if (dragging) setT(fromX(e.clientX), false); });
    const endDrag = () => { if (dragging) { dragging = false; emit(true); } };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);

    function stepSnap(dir) {
      const s = snaps();
      const i = s.indexOf(nearestSnap(D(), st.t));
      return s[clamp(i + dir, 0, s.length - 1)].t;
    }
    track.addEventListener('keydown', (e) => {
      const d = D();
      if (!d) return;
      let t = null;
      const big = e.shiftKey ? 6 : 1;
      const step = st.t < d.bakeEnd ? 5 : 30;
      const pi = phaseAt(d, st.t);
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') t = snaps() ? stepSnap(1) : st.t + step * big;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') t = snaps() ? stepSnap(-1) : st.t - step * big;
      else if (e.key === 'PageUp') t = d.phases[Math.min(pi + 1, d.phases.length - 1)].t[0];
      else if (e.key === 'PageDown') t = d.phases[st.t > d.phases[pi].t[0] ? pi : Math.max(pi - 1, 0)].t[0];
      else if (e.key === 'Home') t = 0;
      else if (e.key === 'End') t = d.tmax;
      if (t == null) return;
      e.preventDefault();
      pause(false);
      setT(t, true);
    });

    days.addEventListener('click', (e) => {
      const k = e.target.dataset && e.target.dataset.day;
      if (!k || k === st.day || !info.days[k]) return;
      const a = D();
      const b = info.days[k];
      // 同じ工程の同じ割合の時刻へ移る（2 次元では同じ主な時刻へ移る）。
      let t;
      if (st.h2d) {
        const s = nearestSnap(a, st.t);
        const o = b.snaps.find((x) => x.id === s.id);
        t = o ? o.t : st.t;
      } else {
        const i = phaseAt(a, st.t);
        const p = a.phases[i];
        const q = b.phases.find((x) => x.id === p.id) || b.phases[Math.min(i, b.phases.length - 1)];
        const f = (st.t - p.t[0]) / Math.max(p.t[1] - p.t[0], 1e-9);
        t = Math.round(q.t[0] + clamp(f, 0, 1) * (q.t[1] - q.t[0]));
      }
      st.day = k;
      st.t = t;
      norm();
      renderStatic();
      renderDyn();
      emit(true);
    });

    phs.addEventListener('click', (e) => {
      const i = e.target.dataset && e.target.dataset.i;
      if (i == null || !D()) return;
      const p = D().phases[Number(i)];
      let t = p.t[0];
      if (snaps()) {
        const inside = snaps().find((s) => s.t >= p.t[0] && s.t < p.t[1]);
        if (inside) t = inside.t;
      }
      pause(false);
      setT(t, true);
    });

    c2d.addEventListener('change', () => {
      st.h2d = c2d.checked && !!D() && D().snaps.length > 0;
      pause(false);
      norm();
      renderStatic();
      renderDyn();
      emit(true);
    });

    function frame(ts) {
      if (!playing) return;
      const d = D();
      const dt = Math.min((ts - last) / 1000, 0.25);
      last = ts;
      if (snaps()) {
        acc += dt;
        if (acc >= SNAP_S) {
          acc = 0;
          const s = snaps();
          const i = s.indexOf(nearestSnap(d, st.t));
          if (i >= s.length - 1) { pause(true); return; }
          setT(s[i + 1].t, false);
        }
      } else {
        const u = uOf(d, st.t) + dt / PLAY_S;
        if (u >= 1) { st.t = d.tmax; pause(true); return; }
        setT(tOf(d, u), false);
      }
      raf = requestAnimationFrame(frame);
    }
    function start() {
      const d = D();
      if (!d || playing) return;
      if (st.t >= d.tmax - 1e-6) st.t = 0;
      if (snaps() && st.t >= snaps()[snaps().length - 1].t) st.t = snaps()[0].t;
      playing = true;
      last = performance.now();
      acc = 0;
      renderDyn();
      raf = requestAnimationFrame(frame);
    }
    function pause(final) {
      if (!playing) return;
      playing = false;
      cancelAnimationFrame(raf);
      if (D()) st.t = Math.round(st.t);
      renderDyn();
      if (final) emit(true);
    }
    play.addEventListener('click', () => (playing ? pause(true) : start()));

    if (typeof ResizeObserver === 'function') new ResizeObserver(() => renderTicks()).observe(ticks);

    return {
      el: wrap,
      // info は { order, clockStart, days: { 日: { label, cond, tmax, bakeEnd, phases, loads, snaps } } }
      setInfo(next) {
        info = next && next.days && next.order && next.order.length ? next : null;
        msg.hidden = !!info;
        for (const e of [row, track, ticks, phs]) e.hidden = !info;
        if (!info) return;
        if (!info.days[st.day]) st.day = info.order[0];
        if (!D().snaps.length) st.h2d = false;
        l2d.hidden = !info.order.some((k) => info.days[k].snaps.length);
        norm();
        renderStatic();
        renderDyn();
      },
      // 外から時刻と日と 2 次元をそろえる（onChange は呼ばない）。そろえたあとの値は get で読む。
      set(s) {
        if (s && typeof s.day === 'string' && (!info || info.days[s.day])) st.day = s.day;
        if (s && Number.isFinite(s.t)) st.t = s.t;
        if (s && typeof s.h2d === 'boolean') st.h2d = s.h2d;
        if (!info) return;
        if (!D().snaps.length) st.h2d = false;
        norm();
        renderStatic();
        renderDyn();
      },
      get() { return { ...st }; },
      message(text) {
        msg.textContent = text;
        msg.hidden = !text;
      },
      stop() { pause(false); },
    };
  }

  window.ThermBar = { mount, clock, elapsed, phaseAt, uOf, tOf };
})();
