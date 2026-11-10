/* 禁域 — js/ui/screens/shop.js — the shop node */
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const h = ui.h;
  let S = null;

  function render(root) {
    const st = G.Run.state, shop = G.Run.shop();
    ui.clear(root);
    if (!st || !shop) {
      root.appendChild(h('div', { class: 'col' }, h('div', { class: 'stub' }, h('p', null, 'ショップの情報がありません。'), h('button', { class: 'btn', type: 'button', onClick: () => ui.run.go('map') }, 'マップへ'))));
      return;
    }
    const gold = st.gold;
    const col = h('div', { class: 'col' });
    col.appendChild(ui.run.hud());
    col.appendChild(h('div', { class: 'screen-head' }, h('h1', null, 'ショップ')));
    col.appendChild(h('div', { class: 'shop-line' }, h('span', { class: 'keeper', 'aria-hidden': 'true' }, '商'), h('div', { class: 'bubble' }, shop.line, shop.priceNote ? h('small', null, shop.priceNote) : null)));

    // cards
    col.appendChild(h('div', { class: 'run-section' }, h('h2', null, 'カード', h('small', null, '6枚まで並ぶ。禁忌は置いていない')),
      h('div', { class: 'shop-shelf' }, shop.cards.map((it, i) => ui.run.cardPick(it.defId, {
        sold: it.sold, price: it.price, cant: !it.sold && it.price > gold, tag: true,
        onClick: it.sold ? null : () => buyCard(i),
      })))));
    // packs
    col.appendChild(h('div', { class: 'run-section' }, h('h2', null, 'パック', h('small', null, '中身の5枚はすべてデッキに入る')),
      h('div', { class: 'shop-packs' }, shop.packs.map((it, i) => ui.packEl(it.type, { sold: it.sold, price: it.price, cant: !it.sold && it.price > gold, onClick: it.sold ? null : () => buyPack(i) })))));
    // relics
    col.appendChild(h('div', { class: 'run-section' }, h('h2', null, '遺物'),
      h('div', { class: 'relic-list' }, shop.relics.map((it, i) => {
        const t = ui.run.relicTile(it.id, { price: it.price, cant: it.price > gold, onClick: it.sold ? null : () => buyRelic(i) });
        if (it.sold) t.style.opacity = '.35';
        return t;
      }))));
    // services: curse removal
    const cursed = G.Shop.cursedRelics(st);
    if (cursed.length) {
      col.appendChild(h('div', { class: 'run-section' }, h('h2', null, '店主の仕事'),
        h('div', { class: 'shop-service' }, h('span', null, '呪われた遺物を1つ外す'), h('span', { class: 'price' + (shop.removeCursePrice > gold ? ' cant' : '') }, shop.removeCursePrice + 'G'),
          h('button', { class: 'btn sm', type: 'button', disabled: shop.removeCursePrice > gold, onClick: removeCurse }, '頼む'))));
    }
    // sell
    const canSell = G.Shop.canSell(st, shop);
    col.appendChild(h('div', { class: 'run-section' }, h('h2', null, '売却', h('small', null, '1回の来店で3枚まで。デッキは20枚を下回れない')),
      h('div', { class: 'shop-sell-bar' },
        h('span', null, '売った枚数 ' + shop.sells + ' / ' + shop.maxSells + (st.deck.length <= G.Shop.DECK_MIN ? '　デッキが下限' : '')),
        h('button', { class: 'btn sm', type: 'button', disabled: !canSell, onClick: () => { S.sellOpen = !S.sellOpen; render(root); } }, S.sellOpen ? '閉じる' : 'カードを売る')),
      S.sellOpen && canSell ? sellGrid(st) : null));
    col.appendChild(h('div', { class: 'run-foot' }, h('button', { class: 'btn primary lg', type: 'button', onClick: leave }, '店を出る')));
    root.appendChild(col);
  }

  function sellGrid(st) {
    const seen = {};
    const ids = st.deck.filter((id) => { if (seen[id]) return false; seen[id] = true; return true; });
    const order = { accel: 0, cycle: 1, chain: 2, time: 3, copy: 4, doom: 5, generic: 6 };
    ids.sort((a, b) => { const A = G.CardDB.get(a), B = G.CardDB.get(b); return (G.Shop.sellPrice(st, b) - G.Shop.sellPrice(st, a)) || (order[ui.run.lineageOf(A)] - order[ui.run.lineageOf(B)]); });
    return h('div', { class: 'shop-sell-grid' }, ids.map((id) => {
      const n = st.deck.filter((x) => x === id).length;
      const price = G.Shop.sellPrice(st, id);
      const wrap = ui.run.cardPick(id, { tag: false, price, onClick: () => sell(id, price) });
      if (n > 1) wrap.querySelector('.card').appendChild(h('span', { class: 'card-count' }, String(n)));
      return wrap;
    }));
  }

  async function sell(id, price) {
    const def = G.CardDB.get(id);
    const ok = await ui.confirm('《' + def.name + '》を' + price + 'Gで売りますか？', { ok: '売る', cancel: '戻る' });
    if (!ok) return;
    const r = G.Run.sellCard(id);
    if (!r.ok) { ui.toast(r.reason === 'limit' ? 'この店ではもう売れない' : r.reason === 'deckMin' ? 'デッキは20枚を下回れない' : '売れなかった', { kind: 'warn' }); return; }
    ui.toast('+' + r.gold + 'G');
    render(S.root);
  }
  function buyCard(i) {
    const st = G.Run.state, shop = G.Run.shop(); const it = shop.cards[i];
    const def = G.CardDB.get(it.defId);
    if (it.price > st.gold) { ui.toast('ゴールドが足りない', { kind: 'warn' }); return ui.cardDetail(def); }
    ui.modal({ title: def.name, body: h('div', { class: 'card-detail' }, ui.renderCard(def, { size: 'l' }), h('div', { class: 'detail-text' }, def.text)), wide: true,
      buttons: [{ label: '戻る', value: null, ghost: true }, { label: it.price + 'Gで買う', value: 'buy', primary: true }] })
      .then((v) => {
        if (v !== 'buy') return;
        const r = G.Shop.buyCard(st, shop, i);
        if (!r.ok) { ui.toast('買えなかった', { kind: 'warn' }); return; }
        ui.toast('《' + def.name + '》をデッキに加えた');
        G.Run.save(); render(S.root);
      });
  }
  async function buyPack(i) {
    const st = G.Run.state, shop = G.Run.shop(); const it = shop.packs[i];
    const d = G.Packs.def(it.type);
    if (it.price > st.gold) { ui.toast('ゴールドが足りない', { kind: 'warn' }); return; }
    const ok = await ui.confirm(d.name + '（' + d.desc + '）を' + it.price + 'Gで買いますか？\n中身の5枚はすべてデッキに入ります。', { ok: '買う', cancel: '戻る' });
    if (!ok) return;
    const r = G.Shop.buyPack(st, shop, i, G.Run.rng());
    if (!r.ok) { ui.toast('買えなかった', { kind: 'warn' }); return; }
    G.Run.save();
    await showOpened(d.name, r.cards);
    render(S.root);
  }
  function showOpened(title, cards) {
    return ui.modal({ title: title + 'を開けた', wide: true, body: h('div', { class: 'card-row' }, cards.map((id) => ui.run.cardPick(id, { onClick: () => ui.cardDetail(G.CardDB.get(id)) }))), buttons: [{ label: 'デッキに加えた', value: true, primary: true }] });
  }
  ui.showOpenedPack = showOpened;
  async function buyRelic(i) {
    const st = G.Run.state, shop = G.Run.shop(); const it = shop.relics[i];
    const r0 = G.RelicDB.get(it.id);
    if (it.price > st.gold) { ui.toast('ゴールドが足りない', { kind: 'warn' }); return; }
    const ok = await ui.modal({ title: r0.name, body: h('div', { class: 'relic-list' }, ui.run.relicTile(it.id)), buttons: [{ label: '戻る', value: null, ghost: true }, { label: it.price + 'Gで買う', value: 'buy', primary: true }] });
    if (ok !== 'buy') return;
    const r = G.Shop.buyRelic(st, shop, i);
    if (!r.ok) { ui.toast('買えなかった', { kind: 'warn' }); return; }
    ui.toast(r0.name + 'を手に入れた'); G.Run.save(); render(S.root);
  }
  async function removeCurse() {
    const st = G.Run.state, shop = G.Run.shop();
    const cursed = G.Shop.cursedRelics(st);
    let id = cursed[0];
    if (cursed.length > 1) {
      let sel = null;
      const tiles = cursed.map((c) => ui.run.relicTile(c, { onClick: () => { sel = c; tiles.forEach((t, k) => t.classList.toggle('sel', cursed[k] === c)); } }));
      const v = await ui.modal({ title: '外す遺物を選ぶ', body: h('div', { class: 'relic-list' }, tiles), buttons: [{ label: '戻る', value: null, ghost: true }, { label: shop.removeCursePrice + 'Gで外す', value: 'ok', primary: true }] });
      if (v !== 'ok' || !sel) return; id = sel;
    } else {
      const ok = await ui.confirm('「' + G.RelicDB.get(id).name + '」を' + shop.removeCursePrice + 'Gで外しますか？', { ok: '外す', cancel: '戻る' });
      if (!ok) return;
    }
    const r = G.Shop.removeCurse(st, shop, id);
    if (!r.ok) { ui.toast('外せなかった', { kind: 'warn' }); return; }
    ui.toast('呪いが解けた'); G.Run.save(); render(S.root);
  }
  function leave() { ui.run.go(G.Run.leaveShop()); }

  ui.app.register('shop', {
    mount(root) { S = { root, sellOpen: false }; render(root); },
    unmount() { S = null; },
  });
})(globalThis.G = globalThis.G || {});
