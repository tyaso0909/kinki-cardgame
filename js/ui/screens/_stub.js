/* 禁域 — js/ui/screens/_stub.js
   Placeholder screens so navigation never crashes. A later file that
   registers the same name simply overwrites the stub (last registration wins).
   Load this BEFORE the real screen files. */
(function (G) {
  'use strict';
  const ui = G.ui;
  const h = ui.h;

  const STUBS = {
    packopen: 'パック開封',
    map: 'マップ',
    battle: '戦闘',
    shop: 'ショップ',
    rest: '休憩',
    event: 'イベント',
    reward: '報酬',
    runend: 'ランの結果',
    codex: '図鑑',
    records: '記録',
    festival: 'お祭りラン',
  };

  Object.keys(STUBS).forEach((name) => {
    if (ui.app.has(name)) return;
    ui.app.register(name, {
      mount(root, params) {
        root.appendChild(h('div', { class: 'col' },
          h('div', { class: 'screen-head' },
            h('button', { class: 'btn-icon', type: 'button', 'aria-label': '戻る', onClick: () => ui.app.back('menu') }, ui.icon('back')),
            h('h1', null, STUBS[name])),
          h('div', { class: 'stub' },
            h('div', { class: 'stub-mark' }, '準備中'),
            h('p', null, 'この画面はまだ作られていません。'),
            h('code', null, 'screen: ' + name + (params && Object.keys(params).length ? ' ' + JSON.stringify(params) : '')),
            h('button', { class: 'btn', type: 'button', onClick: () => ui.app.show('menu', null, { replace: true }) }, 'メニューへ'))));
      },
      unmount() {},
    });
  });
})(globalThis.G = globalThis.G || {});
