/* 禁域 — js/ui/dom.js
   Tiny DOM helpers shared by every screen.
   G.ui.h(tag, attrs, ...children)   create element
   G.ui.clear(el)                     remove children
   G.ui.modal({title, body, buttons, wide, dismissable}) → Promise<value>
   G.ui.confirm(message, {ok, cancel, danger}) → Promise<bool>
   G.ui.toast(msg, {kind, ms})
   G.ui.sleep(ms)                     respects animation speed setting
   G.ui.animate(el, className, ms)    add class, remove after ms → Promise
   G.ui.icon(name)                    inline SVG element
*/
(function (G) {
  'use strict';

  const ui = (G.ui = G.ui || {});

  // ---------- element factory ----------
  function h(tag, attrs, ...children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class' || k === 'className') el.className = v;
        else if (k === 'style' && typeof v === 'object') {
          for (const sk of Object.keys(v)) {
            if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]);
            else el.style[sk] = v[sk];
          }
        }
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
        else if (k === 'html') el.innerHTML = v;
        else if (k === 'text') el.textContent = v;
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, String(v));
      }
    }
    append(el, children);
    return el;
  }
  function append(el, children) {
    for (const c of children) {
      if (c == null || c === false) continue;
      if (Array.isArray(c)) append(el, c);
      else if (c instanceof Node) el.appendChild(c);
      else el.appendChild(document.createTextNode(String(c)));
    }
    return el;
  }
  function clear(el) {
    while (el && el.firstChild) el.removeChild(el.firstChild);
    return el;
  }

  // ---------- inline icons ----------
  const ICONS = {
    back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    gear: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    check: '<path d="M5 12l5 5L20 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    chevron: '<path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  };
  function icon(name, attrs) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (attrs) for (const k of Object.keys(attrs)) svg.setAttribute(k, attrs[k]);
    svg.innerHTML = ICONS[name] || '';
    return svg;
  }

  // ---------- timing ----------
  function animScale() {
    const a = document.documentElement.dataset.anim;
    if (a === 'none') return 0;
    if (a === 'slow') return 1.6;
    if (a === 'fast') return 0.55;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return 0;
    return 1;
  }
  function sleep(ms) {
    const t = Math.round(ms * animScale());
    return new Promise((r) => setTimeout(r, t));
  }
  function animate(el, className, ms) {
    if (!el) return Promise.resolve();
    el.classList.remove(className);
    void el.offsetWidth; // restart animation
    el.classList.add(className);
    return sleep(ms == null ? 400 : ms).then(() => el.classList.remove(className));
  }

  // ---------- overlay root ----------
  function overlay() {
    let o = document.getElementById('overlay');
    if (!o) {
      o = h('div', { id: 'overlay' });
      document.body.appendChild(o);
    }
    return o;
  }

  // ---------- toast ----------
  let toastWrap = null;
  function toast(msg, opts) {
    opts = opts || {};
    if (!toastWrap || !toastWrap.isConnected) {
      toastWrap = h('div', { class: 'toast-wrap', role: 'status', 'aria-live': 'polite' });
      overlay().appendChild(toastWrap);
    }
    const el = h('div', { class: 'toast' + (opts.kind ? ' ' + opts.kind : '') }, msg);
    toastWrap.appendChild(el);
    while (toastWrap.children.length > 3) toastWrap.removeChild(toastWrap.firstChild);
    const ms = opts.ms || 2200;
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 300);
    }, ms);
    return el;
  }

  // ---------- modal ----------
  /**
   * modal({ title, body, buttons: [{label, value, primary, danger, ghost}], wide, dismissable })
   * body: string | Node | Node[]
   * Resolves with the chosen button's value (or `undefined` when dismissed).
   */
  function modal(opts) {
    opts = opts || {};
    return new Promise((resolve) => {
      let done = false;
      const box = h('div', { class: 'modal' + (opts.wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true' });
      const backdrop = h('div', { class: 'modal-backdrop' }, box);

      function close(value) {
        if (done) return;
        done = true;
        backdrop.classList.add('closing');
        document.removeEventListener('keydown', onKey);
        setTimeout(() => backdrop.remove(), Math.round(160 * animScale()) + 10);
        resolve(value);
      }
      function onKey(e) {
        if (e.key === 'Escape' && opts.dismissable !== false) close(undefined);
      }

      if (opts.title) box.appendChild(h('div', { class: 'modal-title' }, opts.title));
      const bodyEl = h('div', { class: 'modal-body' });
      if (typeof opts.body === 'string') {
        opts.body.split('\n').forEach((line) => bodyEl.appendChild(h('p', null, line)));
      } else if (opts.body) {
        append(bodyEl, [opts.body]);
      }
      box.appendChild(bodyEl);

      const buttons = opts.buttons || [{ label: '閉じる', value: true }];
      if (buttons.length) {
        const bar = h('div', { class: 'modal-buttons' + (buttons.length > 2 ? ' stack' : '') });
        buttons.forEach((b) => {
          const cls = ['btn'];
          if (b.primary) cls.push('primary');
          if (b.danger) cls.push('danger');
          if (b.ghost) cls.push('ghost');
          bar.appendChild(h('button', { class: cls.join(' '), type: 'button', onClick: () => close(b.value) }, b.label));
        });
        box.appendChild(bar);
      }

      if (opts.dismissable !== false) {
        backdrop.addEventListener('click', (e) => {
          if (e.target === backdrop) close(undefined);
        });
      }
      document.addEventListener('keydown', onKey);
      overlay().appendChild(backdrop);
      box.__close = close;
      // Keyboard users get focus on the dialog itself (Esc / Tab work); no visible ring on touch.
      box.tabIndex = -1;
      setTimeout(() => box.focus({ preventScroll: true }), 30);
    });
  }

  function confirm(message, opts) {
    opts = opts || {};
    return modal({
      title: opts.title,
      body: message,
      buttons: [
        { label: opts.cancel || 'やめる', value: false, ghost: true },
        { label: opts.ok || 'はい', value: true, primary: !opts.danger, danger: !!opts.danger },
      ],
    }).then((v) => v === true);
  }

  // ---------- misc ----------
  function fmtNum(n) {
    return typeof n === 'number' ? n.toLocaleString('ja-JP') : String(n);
  }
  function stopScroll(el) {
    el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  ui.h = h;
  ui.append = append;
  ui.clear = clear;
  ui.icon = icon;
  ui.sleep = sleep;
  ui.animate = animate;
  ui.animScale = animScale;
  ui.toast = toast;
  ui.modal = modal;
  ui.confirm = confirm;
  ui.fmtNum = fmtNum;
  ui.stopScroll = stopScroll;
  ui.overlay = overlay;

  // Screens load before app.js (ARCHITECTURE §9). Queue registrations until the router exists.
  if (!ui.app) {
    const pending = Object.create(null);
    ui.app = {
      _pending: pending,
      register(name, def) { pending[name] = def; },
      has(name) { return !!pending[name]; },
      show() { return Promise.resolve(false); },
    };
  }

  // Settings access with a localStorage fallback (used by settings screen & boot).
  const SETTINGS_KEY = 'kinki.settings';
  const DEFAULTS = { anim: 'normal', autoFast: false, sound: true, soundVol: 0.6, theme: 'dark' };
  function settingsGet() {
    try {
      if (G.Save && G.Save.settings && typeof G.Save.settings.get === 'function') {
        return Object.assign({}, DEFAULTS, G.Save.settings.get() || {});
      }
      const raw = localStorage.getItem(SETTINGS_KEY);
      return Object.assign({}, DEFAULTS, raw ? JSON.parse(raw) : {});
    } catch (e) { return Object.assign({}, DEFAULTS); }
  }
  function settingsSet(patch) {
    const next = Object.assign(settingsGet(), patch);
    try {
      if (G.Save && G.Save.settings && typeof G.Save.settings.set === 'function') G.Save.settings.set(next);
      else localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch (e) { /* storage unavailable */ }
    applySettings(next);
    return next;
  }
  function applySettings(s) {
    s = s || settingsGet();
    const root = document.documentElement;
    root.dataset.theme = s.theme === 'light' ? 'light' : 'dark';
    const map = { slow: 'slow', normal: 'normal', fast: 'fast', none: 'none' };
    root.dataset.anim = map[s.anim] || 'normal';
    return s;
  }
  ui.settings = { get: settingsGet, set: settingsSet, apply: applySettings, defaults: DEFAULTS };
})(globalThis.G = globalThis.G || {});
