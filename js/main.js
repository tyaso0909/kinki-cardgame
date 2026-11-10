/* 禁域 — js/main.js — boot */
(function (G) {
  'use strict';

  function boot() {
    const ui = G.ui;
    if (!ui || !ui.app || typeof ui.app.boot !== 'function') {
      console.error('UI not loaded');
      return;
    }
    try { ui.settings.apply(); } catch (e) { console.warn(e); }

    // Let data/meta layers initialise if they exist.
    try { if (G.Save && typeof G.Save.load === 'function') G.Save.load(); } catch (e) { console.warn('Save.load failed', e); }

    ui.app.boot();

    // Global error surface (dev aid; never blocks play).
    window.addEventListener('error', (e) => {
      if (ui.toast) ui.toast('エラー: ' + (e.message || '不明'), { kind: 'bad', ms: 3500 });
    });
    window.addEventListener('unhandledrejection', (e) => {
      const msg = e && e.reason && (e.reason.message || String(e.reason));
      if (ui.toast) ui.toast('エラー: ' + (msg || '不明'), { kind: 'bad', ms: 3500 });
    });

    const params = new URLSearchParams(location.search);
    const first = params.get('screen');
    ui.app.show(first && ui.app.has(first) ? first : 'title', null, { transition: 'fade' }).then(() => {
      const loading = document.getElementById('loading');
      if (loading) {
        loading.classList.add('done');
        setTimeout(() => loading.remove(), 700);
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(globalThis.G = globalThis.G || {});
