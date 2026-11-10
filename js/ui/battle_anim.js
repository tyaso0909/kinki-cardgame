/* 禁域 — js/ui/battle_anim.js
   Animation primitives for the battle screen. Everything is DOM-only,
   respects G.ui.animScale() (settings + prefers-reduced-motion) and the
   battle's own speed factor (autoFast / tap-to-skip).

   const A = G.ui.battleAnim.create(rootEl)
   A.speed = 1                                    multiplier (0 = instant)
   A.wait(ms)                                     scaled sleep (resolves immediately when skipping)
   A.skip()                                       fast-forward everything currently queued
   A.flyCard(defOrInst, fromRect, toRect|el, {size, hold})   ghost card flight → Promise
   A.showCard(defOrInst, {ms})                    card held in the centre (play reveal)
   A.number(targetEl, text, kind)                 floating damage/heal number
   A.pulse(el, cls, ms) / A.shake(el)
   A.banner({title, sub, kind, ms, buttons})       full-width ribbon → Promise<buttonValue|undefined>
   A.sticky(id, {title, sub, kind})               persistent overlay (loop progress); A.unsticky(id)
   A.overlayTurn(text)                            enemy-turn veil; returns remove()
*/
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const h = ui.h;

  function create(root) {
    const layer = h('div', { class: 'ba-layer', 'aria-hidden': 'true' });
    root.appendChild(layer);
    const A = { speed: 1, skipping: false, layer };
    let pending = [];

    function scale() { return ui.animScale() * (A.skipping ? 0 : A.speed); }
    A.wait = function (ms) {
      const t = Math.round(ms * scale());
      if (t <= 0) return Promise.resolve();
      return new Promise((res) => {
        const timer = setTimeout(() => { pending = pending.filter((p) => p !== done); res(); }, t);
        const done = () => { clearTimeout(timer); res(); };
        pending.push(done);
      });
    };
    A.skip = function () {
      A.skipping = true;
      const list = pending; pending = [];
      list.forEach((fn) => fn());
      setTimeout(() => { A.skipping = false; }, 0);
    };
    A.destroy = function () { pending.forEach((fn) => fn()); pending = []; layer.remove(); };

    function rectOf(x) {
      if (!x) return null;
      if (typeof x.getBoundingClientRect === 'function') return x.getBoundingClientRect();
      return x;
    }
    function rootRect() { return root.getBoundingClientRect(); }
    function place(el, r) {
      const rr = rootRect();
      el.style.left = (r.left - rr.left) + 'px';
      el.style.top = (r.top - rr.top) + 'px';
      if (r.width) el.style.width = r.width + 'px';
      if (r.height) el.style.height = r.height + 'px';
    }
    function centreRect(w, hgt) {
      const rr = rootRect();
      return { left: rr.left + (rr.width - w) / 2, top: rr.top + (rr.height - hgt) / 2 - 20, width: w, height: hgt };
    }

    // ghost card: render the card at `size`, scale it to a rect
    function ghost(card, size) {
      const g = h('div', { class: 'ba-ghost' });
      const c = ui.renderCard(card, { size: size || 'm', fit: false });
      g.appendChild(c);
      layer.appendChild(g);
      return g;
    }

    A.flyCard = async function (card, from, to, opts) {
      opts = opts || {};
      if (scale() === 0) return;
      const fromR = rectOf(from) || centreRect(120, 168);
      const toR = rectOf(to) || centreRect(120, 168);
      const g = ghost(card, opts.size || 'm');
      const cw = g.firstChild.getBoundingClientRect();
      const w = cw.width || 120, hh = cw.height || 168;
      const sx = fromR.width ? fromR.width / w : 0.6;
      const sy = fromR.height ? fromR.height / hh : 0.6;
      const s0 = Math.min(sx, sy) || 0.6;
      const tx = toR.width ? Math.min(toR.width / w, toR.height / hh) : 0.6;
      place(g, { left: fromR.left + (fromR.width - w) / 2, top: fromR.top + (fromR.height - hh) / 2 });
      g.style.transform = 'scale(' + s0 + ')';
      g.style.opacity = '0.9';
      void g.offsetWidth;
      const dur = (opts.ms || 420) * scale();
      g.style.transition = 'transform ' + dur + 'ms cubic-bezier(.2,.7,.2,1), left ' + dur + 'ms cubic-bezier(.2,.7,.2,1), top ' + dur + 'ms cubic-bezier(.2,.7,.2,1), opacity ' + dur + 'ms';
      place(g, { left: toR.left + (toR.width - w) / 2, top: toR.top + (toR.height - hh) / 2 });
      g.style.transform = 'scale(' + tx + ')';
      await A.wait(opts.ms || 420);
      if (opts.hold) await A.wait(opts.hold);
      g.style.opacity = '0';
      await A.wait(120);
      g.remove();
    };

    // reveal a played card in the centre
    A.showCard = async function (card, opts) {
      opts = opts || {};
      if (scale() === 0) return;
      const g = ghost(card, 'm');
      g.classList.add('reveal');
      const cw = g.firstChild.getBoundingClientRect();
      const r = centreRect(cw.width || 120, cw.height || 168);
      place(g, r);
      await A.wait(opts.ms || 520);
      g.classList.add('out');
      await A.wait(160);
      g.remove();
    };

    A.number = function (target, text, kind) {
      const r = rectOf(target);
      if (!r || scale() === 0) return;
      const el = h('div', { class: 'ba-num ' + (kind || 'dmg') }, text);
      layer.appendChild(el);
      place(el, { left: r.left + r.width / 2 - 30 + (Math.random() * 16 - 8), top: r.top + r.height / 2 - 20 });
      el.style.setProperty('--dur', Math.round(900 * scale()) + 'ms');
      setTimeout(() => el.remove(), 950 * scale() + 50);
    };

    A.pulse = function (el, cls, ms) { return ui.animate(el, cls || 'anim-flash', ms || 450); };
    A.shake = function (el) { return ui.animate(el, 'anim-shake', 400); };

    // banner with optional buttons; resolves with the button value (or undefined after ms)
    A.banner = function (opts) {
      opts = opts || {};
      return new Promise((resolve) => {
        let done = false;
        const el = h('div', { class: 'ba-banner ' + (opts.kind || ''), role: opts.buttons ? 'dialog' : 'status' },
          h('div', { class: 'ba-banner-in' },
            opts.eyebrow ? h('span', { class: 'ba-eyebrow' }, opts.eyebrow) : null,
            h('div', { class: 'ba-title' }, opts.title || ''),
            opts.sub ? h('div', { class: 'ba-sub' }, opts.sub) : null,
            opts.buttons ? h('div', { class: 'ba-btns' }, opts.buttons.map((b) =>
              h('button', { class: 'btn ' + (b.primary ? 'primary' : b.ghost ? 'ghost' : ''), type: 'button', onClick: () => finish(b.value) }, b.label))) : null));
        if (opts.buttons) { el.style.pointerEvents = 'auto'; layer.removeAttribute('aria-hidden'); } // QA: the loop offer's buttons lived inside aria-hidden
        layer.appendChild(el);
        function finish(v) {
          if (done) return; done = true;
          if (opts.buttons) layer.setAttribute('aria-hidden', 'true');
          el.classList.add('out');
          setTimeout(() => el.remove(), Math.max(10, 240 * ui.animScale()));
          resolve(v);
        }
        if (!opts.buttons) {
          const ms = opts.ms == null ? 1400 : opts.ms;
          A.wait(ms).then(() => finish(undefined));
        }
        el.__finish = finish;
      });
    };

    const stickies = Object.create(null);
    A.sticky = function (id, opts) {
      let el = stickies[id];
      if (!el) {
        el = h('div', { class: 'ba-sticky ' + (opts.kind || '') },
          h('div', { class: 'ba-title' }), h('div', { class: 'ba-sub' }));
        layer.appendChild(el);
        stickies[id] = el;
      }
      el.querySelector('.ba-title').textContent = opts.title || '';
      el.querySelector('.ba-sub').textContent = opts.sub || '';
      return el;
    };
    A.unsticky = function (id) {
      const el = stickies[id];
      if (!el) return;
      delete stickies[id];
      el.classList.add('out');
      setTimeout(() => el.remove(), Math.max(10, 240 * ui.animScale()));
    };

    A.overlayTurn = function (text) {
      const el = h('div', { class: 'ba-veil' }, h('span', null, text));
      layer.appendChild(el);
      return () => { el.classList.add('out'); setTimeout(() => el.remove(), Math.max(10, 300 * ui.animScale())); };
    };

    return A;
  }

  ui.battleAnim = { create };
})(globalThis.G = globalThis.G || {});
