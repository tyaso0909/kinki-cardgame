/* 禁域 — js/ui/screens/title.js */
(function (G) {
  'use strict';
  const ui = G.ui;
  const h = ui.h;

  const FALLBACK_GRAFFITI = [
    'ここで無限を見た者、手を挙げろ',
    '祭壇は売るな。買え。',
    '三周目で止めろ。四周目は向こうが止める。',
    '鏡の奥の奴、先に砂時計を使った',
    '禁忌は捨てたんじゃない。ここに置いたんだ。',
  ];

  function pickGraffiti() {
    let pool = null;
    if (G.Texts && Array.isArray(G.Texts.graffiti) && G.Texts.graffiti.length) pool = G.Texts.graffiti;
    else pool = FALLBACK_GRAFFITI;
    const i = Math.floor(Math.random() * pool.length);
    const g = pool[i];
    return typeof g === 'string' ? g : (g && g.text) || '';
  }

  function sky() {
    const wrap = h('div', { class: 'title-sky', 'aria-hidden': 'true' });
    const lins = ui.LINEAGES;
    const N = 14;
    for (let i = 0; i < N; i++) {
      const lin = lins[i % lins.length];
      const d = h('span', {
        class: 'drift lin-' + lin,
        style: {
          '--x': (6 + ((i * 37) % 88)) + '%',
          '--dur': (18 + ((i * 7) % 16)) + 's',
          '--delay': (-(i * 3.1) % 24) + 's',
          fontSize: (18 + ((i * 11) % 26)) + 'px',
        },
      }, ui.lineageGlyph(lin));
      wrap.appendChild(d);
    }
    wrap.appendChild(h('div', { class: 'veil' }));
    return wrap;
  }

  let started = false;
  function go() {
    if (started) return;
    started = true;
    ui.app.show('menu', null, { transition: 'fade' });
  }

  ui.app.register('title', {
    transition: 'fade',
    mount(root) {
      started = false;
      root.appendChild(sky());
      root.appendChild(h('div', { class: 'title-version' }, 'prototype'));
      const body = h('div', { class: 'title-body' },
        h('h1', { class: 'logo', 'aria-label': '禁域' }, h('span', { class: 'kanji' }, '禁'), h('span', { class: 'kanji' }, '域')),
        h('p', { class: 'subtitle' }, '―― 強すぎる力が捨てられる場所 ――'),
        h('button', { class: 'title-tap', type: 'button', onClick: go }, 'タップして開始'),
      );
      root.appendChild(body);
      root.appendChild(h('div', { class: 'title-graffiti' }, pickGraffiti()));
      root.addEventListener('click', go);
      root.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') go(); });
      root.tabIndex = -1;
      setTimeout(() => root.focus({ preventScroll: true }), 50);
    },
    unmount() {},
  });
})(globalThis.G = globalThis.G || {});
