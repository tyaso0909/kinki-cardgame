/* 禁域 — js/ui/screens/rest.js — the rest node: heal 30% of max life, or remove one card */
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const h = ui.h;

  function render(root) {
    const st = G.Run.state;
    ui.clear(root);
    if (!st) { root.appendChild(h('div', { class: 'col' }, h('div', { class: 'stub' }, h('p', null, '進行中のランがありません。'), h('button', { class: 'btn', type: 'button', onClick: () => ui.app.show('menu', null, { replace: true }) }, 'メニューへ')))); return; }
    const o = G.Run.restOptions();
    const col = h('div', { class: 'col' });
    col.appendChild(ui.run.hud());
    col.appendChild(h('div', { class: 'screen-head' }, h('h1', null, '休憩')));
    col.appendChild(h('div', { class: 'rest-fire', 'aria-hidden': 'true' }, h('div', { class: 'glow' }), h('div', { class: 'flame' }), h('div', { class: 'flame b' }), h('div', { class: 'flame c' }), h('div', { class: 'logs' })));
    col.appendChild(h('p', { class: 'rest-text' }, '火を起こした。誰も頼んでいないのに、火は三回灯った。\nここでできることは、ひとつだけ。'));
    const heal = h('button', { class: 'rest-opt', type: 'button', disabled: !o.canHeal, onClick: () => doHeal(o) },
      h('span', { class: 'ro-t' }, '回復'),
      h('span', { class: 'ro-n' }, '+' + o.healAmount),
      h('span', { class: 'ro-d' }, o.noRestHeal ? '砕けた砂時計のせいで、ここでは休めない' : st.life >= st.maxLife ? 'ライフは満タン' : '最大ライフの30%を回復する'));
    const remove = h('button', { class: 'rest-opt remove', type: 'button', disabled: !o.canRemove, onClick: doRemove },
      h('span', { class: 'ro-t' }, '削除'),
      h('span', { class: 'ro-n' }, '1枚'),
      h('span', { class: 'ro-d' }, o.canRemove ? 'デッキからカードを1枚消す。ゴールドにはならない' : 'デッキは20枚を下回れない'));
    col.appendChild(h('div', { class: 'rest-opts' }, heal, remove));
    col.appendChild(h('div', { class: 'run-foot' }, h('button', { class: 'btn ghost', type: 'button', onClick: () => ui.run.go(G.Run.rest('skip')) }, '何もせず進む')));
    root.appendChild(col);
  }
  function doHeal(o) {
    const before = G.Run.state.life;
    const next = G.Run.rest('heal');
    ui.toast('ライフ ' + before + ' → ' + G.Run.state.life);
    ui.run.go(next);
  }
  function doRemove() {
    ui.run.deckModal({ title: '削除するカードを選ぶ', prompt: '1枚だけ消える', okLabel: '削除する', onPick: (id) => {
      const next = G.Run.rest('remove', id);
      ui.toast('《' + G.CardDB.get(id).name + '》を火にくべた');
      ui.run.go(next);
    } });
  }

  ui.app.register('rest', { mount(root) { render(root); }, unmount() {} });
})(globalThis.G = globalThis.G || {});
