/* 禁域 — js/ui/app.js
   Screen router.
   G.ui.app.register(name, { mount(container, params), unmount(), transition?: 'slide'|'fade', menuButton?: bool })
   G.ui.app.show(name, params, { transition }) → Promise
   G.ui.app.has(name), G.ui.app.current(), G.ui.app.back()
   G.ui.app.setMenuButton(fn | null)   — global pause/menu overlay slot
   G.ui.app.boot()                     — creates the shell inside #app

   Screens may be registered before this file loads: dom.js installs a
   queueing shim (G.ui.app.register) that we drain here.
*/
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const h = ui.h;

  const screens = Object.create(null);
  const pending = (ui.app && ui.app._pending) || null;

  let stage = null;
  let menuSlot = null;
  let currentName = null;
  let currentEl = null;
  let currentDef = null;
  let history = [];
  let navToken = 0;

  function register(name, def) {
    if (!def || typeof def.mount !== 'function') throw new Error('screen "' + name + '" needs mount()');
    screens[name] = def;
  }
  function has(name) {
    return !!screens[name];
  }

  function boot() {
    const root = document.getElementById('app') || document.body.appendChild(h('div', { id: 'app' }));
    ui.clear(root);
    stage = h('div', { class: 'stage' });
    root.appendChild(stage);
    menuSlot = h('div', { id: 'menu-slot', hidden: true });
    root.appendChild(menuSlot);
    ui.overlay();
  }

  function setMenuButton(fn, opts) {
    if (!menuSlot) return;
    ui.clear(menuSlot);
    if (!fn) {
      menuSlot.hidden = true;
      return;
    }
    opts = opts || {};
    menuSlot.hidden = false;
    menuSlot.appendChild(h('button', { class: 'btn-icon', type: 'button', 'aria-label': opts.label || 'メニュー', onClick: fn }, ui.icon(opts.icon || 'menu')));
  }

  async function show(name, params, opts) {
    opts = opts || {};
    if (!stage) boot();
    const def = screens[name];
    if (!def) {
      ui.toast('画面「' + name + '」は準備中', { kind: 'warn' });
      return false;
    }
    const token = ++navToken;
    const transition = opts.transition || def.transition || 'slide';

    // unmount previous
    const prevEl = currentEl;
    const prevDef = currentDef;
    if (prevDef && typeof prevDef.unmount === 'function') {
      try { prevDef.unmount(); } catch (e) { console.error(e); }
    }
    setMenuButton(null);

    if (!opts.replace && currentName && currentName !== name) history.push({ name: currentName, params: currentParams });
    if (history.length > 20) history.shift();

    const el = h('section', { class: 'screen scr-' + name + ' enter' + (transition === 'fade' ? ' fade' : ''), 'data-screen': name });
    currentName = name;
    currentParams = params;
    currentEl = el;
    currentDef = def;
    stage.appendChild(el);
    document.documentElement.dataset.screen = name;

    try {
      await def.mount(el, params || {});
    } catch (e) {
      console.error('mount failed', name, e);
      ui.clear(el);
      el.appendChild(h('div', { class: 'col' }, h('div', { class: 'stub' },
        h('div', { class: 'stub-mark' }, '異常'),
        h('p', null, '画面の表示に失敗しました。'),
        h('code', null, String(e && e.message || e)),
        h('button', { class: 'btn', type: 'button', onClick: () => show('menu', null, { replace: true }) }, 'メニューへ'))));
    }
    if (token !== navToken) return true; // superseded

    if (prevEl) {
      prevEl.classList.remove('enter');
      prevEl.classList.add('leave');
      if (transition === 'fade') prevEl.classList.add('fade');
      await ui.sleep(260);
      prevEl.remove();
    }
    if (token === navToken) el.classList.remove('enter');
    return true;
  }
  let currentParams = null;

  function back(fallback) {
    const prev = history.pop();
    if (prev) return show(prev.name, prev.params, { replace: true });
    return show(fallback || 'menu', null, { replace: true });
  }

  ui.app = {
    register,
    has,
    show,
    back,
    boot,
    setMenuButton,
    current: () => currentName,
    screens: () => Object.keys(screens),
    stageEl: () => stage,
  };

  // Drain screens registered before this file loaded.
  if (pending) for (const k of Object.keys(pending)) register(k, pending[k]);
})(globalThis.G = globalThis.G || {});
