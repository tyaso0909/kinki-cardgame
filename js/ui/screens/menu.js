/* 禁域 — js/ui/screens/menu.js — the hub */
(function (G) {
  'use strict';
  const ui = G.ui;
  const h = ui.h;

  function safeDepth() {
    try {
      if (G.Save && typeof G.Save.meta === 'function') {
        const m = G.Save.meta();
        if (m && typeof m.depth === 'number') return m.depth;
      }
    } catch (e) { /* ignore */ }
    return null;
  }
  function hasRun() {
    try { return !!(G.Save && typeof G.Save.hasRun === 'function' && G.Save.hasRun()); } catch (e) { return false; }
  }

  function crest() {
    const wrap = h('div', { class: 'hub-crest', 'aria-hidden': 'true' });
    wrap.appendChild(h('div', { class: 'ring' }));
    ui.LINEAGES.forEach((lin, i) => {
      wrap.appendChild(h('span', { class: 'glyph lin-' + lin, style: { '--a': (i * 60) + 'deg' } }, ui.lineageGlyph(lin)));
    });
    wrap.appendChild(h('div', { class: 'core' }, '禁'));
    return wrap;
  }

  function nav(name, params) {
    return () => {
      if (ui.app.has(name)) ui.app.show(name, params);
      else ui.toast('準備中');
    };
  }
  function notReady() { ui.toast('準備中'); }

  // 深度を選んでから出発（G.ui.depthPicker は screens/codex.js が提供。無ければそのまま進む）
  function pickDepthThenGo() {
    if (typeof ui.depthPicker !== 'function') { nav('packopen')(); return; }
    ui.depthPicker().then((d) => {
      if (d === undefined) return;
      const el = document.querySelector('.hub-depth b');
      if (el) el.textContent = String(d);
      nav('packopen')();
    });
  }
  function startRun() {
    if (hasRun()) {
      ui.confirm('進行中のランがあります。\n新しく始めると、今のランは消えます。', { ok: '新しく始める', cancel: '戻る', danger: true })
        .then((ok) => { if (ok) { if (G.Run && typeof G.Run.abandon === 'function') G.Run.abandon(); pickDepthThenGo(); } });
      return;
    }
    if (G.Run && G.Run.state && typeof G.Run.abandon === 'function') G.Run.abandon();
    pickDepthThenGo();
  }
  function continueRun() {
    if (!hasRun()) { ui.toast('続きはありません'); return; }
    if (G.Run && typeof G.Run.resume === 'function') {
      try {
        const next = G.Run.resume();
        if (typeof next === 'string' && ui.run && typeof ui.run.go === 'function') { ui.run.go(next); return; }
        if (typeof next === 'string' && ui.app.has(next)) { ui.app.show(next); return; }
      } catch (e) { console.error(e); }
    }
    nav('map')();
  }

  function btn(label, sub, onClick, cls) {
    return h('button', { class: 'btn ' + (cls || ''), type: 'button', onClick },
      h('span', null, label), sub ? h('span', { class: 'btn-sub' }, sub) : null);
  }

  ui.app.register('menu', {
    transition: 'fade',
    mount(root) {
      const depth = safeDepth();
      const canContinue = hasRun();
      const col = h('div', { class: 'col' },
        h('div', { class: 'hub' },
          crest(),
          h('div', { class: 'hub-depth' }, '禁域の深度', h('b', null, depth == null ? '0' : String(depth))),
          h('div', { class: 'hub-menu' },
            btn('ランを始める', 'パックを開けて出発', startRun, 'primary'),
            btn('続きから', canContinue ? '進行中のラン' : '', continueRun, canContinue ? '' : 'ghost'),
            btn('お祭りラン', '日替わりの特別ルール', nav('festival')),
            h('div', { class: 'pair' },
              btn('図鑑', null, nav('codex')),
              btn('記録', null, nav('records')),
            ),
            h('div', { class: 'pair' },
              btn('設定', null, nav('settings')),
              btn('タイトルへ', null, () => ui.app.show('title', null, { transition: 'fade', replace: true }), 'ghost'),
            ),
          ),
        ),
      );
      const cont = col.querySelector('.hub-menu .btn:nth-child(2)');
      if (cont && !canContinue) cont.disabled = true;
      root.appendChild(col);
    },
    unmount() {},
  });

  ui.menuNav = nav;
  ui.notReady = notReady;
})(globalThis.G = globalThis.G || {});
