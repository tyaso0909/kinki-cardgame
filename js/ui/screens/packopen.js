/* 禁域 — js/ui/screens/packopen.js
   Run start: choose and open 6 packs (30 cards = the deck), then pick a starter relic.
   Drives G.Run (startNew when no run is in its pack-opening phase; resumes mid-way otherwise). */
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const h = ui.h;
  const COUNT_JP = ['一', '二', '三', '四', '五', '六'];

  let S = null;

  function packEl(type, opts) {
    opts = opts || {};
    const d = G.Packs.def(type);
    const cls = ['pack', d.kind === 'lineage' ? 'lin-' + d.lineage : d.kind];
    if (opts.sold) cls.push('sold');
    const glyphLin = d.lineage && d.lineage !== 'generic' ? d.lineage : d.kind === 'disrupt' ? 'generic' : d.kind === 'taboo' ? 'boss' : null;
    const el = h('button', { class: cls.join(' '), type: 'button', onClick: opts.onClick, 'aria-label': d.name, disabled: !!opts.disabled },
      h('span', { class: 'seal' }, glyphLin ? ui.lineageGlyph(glyphLin) : h('span', { style: { fontFamily: 'var(--font-title)', fontSize: '14px', fontWeight: 700 } }, d.kind === 'chaos' ? '混' : d.kind === 'gold' ? '金' : '双')),
      h('span', { class: 'glyph' }, glyphLin ? ui.lineageGlyph(glyphLin) : null),
      h('span', { class: 'pn' }, d.name),
      opts.price != null ? h('span', { class: 'pprice' + (opts.cant ? ' cant' : '') }, opts.price + 'G') : null,
      h('span', { class: 'ph' }, d.hint),
      h('span', { class: 'pd' }, d.desc));
    if (opts.caption) return h('div', { class: 'pack-wrap', style: { '--lc': glyphLin ? 'var(--' + glyphLin + ')' : (d.kind === 'chaos' ? 'var(--focus)' : 'var(--gold)') } }, el, h('span', { class: 'pack-cap' }, h('b', null, d.hint), d.desc));
    return el;
  }
  ui.packEl = packEl;

  function steps(step) {
    return h('div', { class: 'po-steps', 'aria-label': step + ' / 6' }, [0, 1, 2, 3, 4, 5].map((i) => h('i', { class: i < step ? 'done' : i === step ? 'now' : '' })));
  }

  function renderChoice(root) {
    const st = G.Run.state, po = st.packopen;
    const offer = G.Run.packOffer();
    ui.clear(root);
    const col = h('div', { class: 'col' },
      h('div', { class: 'po-head' }, h('h1', null, COUNT_JP[po.step] + '袋目'), steps(po.step)),
      h('p', { class: 'po-lead' }, po.step === 0 ? '六つの袋を開けて、出た三十枚がそのまま初期デッキになる。選んで抜くことはできない。' : '前の袋の中身を見ながら、次を選べる。同じ系統を重ねれば安定し、混ぜれば思わぬ組み合わせが生まれる。'),
      h('div', { class: 'po-packs' + (offer.length === 2 ? ' two' : offer.length === 1 ? ' one' : '') }, offer.map((t) => packEl(t, { caption: true, onClick: (e) => choose(t, e.currentTarget) }))),
      h('div', { class: 'run-section' }, h('h2', null, 'いまのデッキ', h('small', null, st.deck.length + '枚')), ui.run.tally(st.deck)),
    );
    root.appendChild(col);
  }

  async function choose(type, btn) {
    if (S.busy) return;
    S.busy = true;
    try {
      S.root.querySelectorAll('.pack').forEach((p) => { if (p !== btn) p.style.opacity = '.25'; p.disabled = true; });
      btn.classList.add('chosen');
      await ui.sleep(480);
      const r = G.Run.openChosenPack(type);
      await renderReveal(S.root, type, r);
    } catch (e) {
      console.error(e); ui.toast('パックを開けられなかった: ' + e.message, { kind: 'bad' });
    } finally { S.busy = false; }
  }

  async function renderReveal(root, type, r) {
    const st = G.Run.state, po = st.packopen;
    const d = G.Packs.def(type);
    ui.clear(root);
    const slots = r.cards.map((id) => {
      const def = G.CardDB.get(id);
      const slot = h('div', { class: 'slot rare-' + def.rarity },
        h('div', { class: 'flip' },
          h('div', { class: 'face' }, ui.renderCard(def, { size: 'm', onClick: () => ui.cardDetail(def) })),
          h('div', { class: 'back' }, ui.renderCard(def, { size: 'm', faceDown: true }))));
      return slot;
    });
    const hasTaboo = r.cards.some((id) => G.CardDB.get(id).rarity === 'taboo');
    const reveal = h('div', { class: 'po-reveal' },
      h('div', { class: 'title' }, d.name + 'を開けた'),
      h('div', { class: 'po-cards' }, slots),
      hasTaboo ? h('div', { class: 'po-taboo-banner', hidden: true }, '神引き　禁忌') : null,
      r.guaranteed ? h('div', { class: 'po-guarantee' }, '出口のカードが1枚、確定で入っている') : null,
    );
    const next = h('button', { class: 'btn primary lg block', type: 'button', disabled: true, onClick: () => { if (r.done) renderRelics(root); else renderChoice(root); } }, r.done ? '初期遺物を選ぶ' : '次の袋へ');
    const col = h('div', { class: 'col' },
      h('div', { class: 'po-head' }, h('h1', null, COUNT_JP[po.step - 1] + '袋目'), steps(po.step)),
      reveal,
      h('div', { class: 'run-section' }, h('h2', null, 'いまのデッキ', h('small', null, st.deck.length + '枚')), ui.run.tally(st.deck)),
      h('div', { class: 'run-foot' }, next));
    root.appendChild(col);
    for (let i = 0; i < slots.length; i++) {
      await ui.sleep(i === 0 ? 250 : 320);
      slots[i].classList.add('shown');
      const def = G.CardDB.get(r.cards[i]);
      if (ui.sfx) ui.sfx.play({ taboo: 'revTaboo', legend: 'revLegend', rare: 'revRare' }[def.rarity] || 'revCommon');
      if (def.rarity === 'taboo') { await ui.sleep(300); const b = reveal.querySelector('.po-taboo-banner'); if (b) b.hidden = false; await ui.sleep(900); }
      else if (def.rarity === 'legend') await ui.sleep(260);
    }
    await ui.sleep(200);
    next.disabled = false;
  }

  function renderRelics(root) {
    const offer = G.Run.relicOffer();
    ui.clear(root);
    let chosen = null;
    const tiles = offer.map((id) => ui.run.relicTile(id, { onClick: () => { chosen = id; tiles.forEach((t) => t.classList.toggle('sel', t === tile(id))); ok.disabled = false; } }));
    const tile = (id) => tiles[offer.indexOf(id)];
    const ok = h('button', { class: 'btn primary lg block', type: 'button', disabled: true, onClick: async () => {
      if (!chosen || S.busy) return;
      S.busy = true;
      try { const next = G.Run.chooseStarterRelic(chosen); ui.toast(G.RelicDB.get(chosen).name + 'を手に入れた'); await ui.run.go(next); }
      catch (e) { console.error(e); ui.toast(e.message, { kind: 'bad' }); S.busy = false; }
    } }, '出発する');
    root.appendChild(h('div', { class: 'col' },
      h('div', { class: 'po-head' }, h('h1', null, '初期遺物'), steps(6)),
      h('p', { class: 'po-lead' }, '開けた袋の系統に合わせて三つ。ひとつだけ持っていける。'),
      h('div', { class: 'po-relics' }, tiles),
      h('div', { class: 'run-section' }, h('h2', null, 'デッキ', h('small', null, G.Run.state.deck.length + '枚')), ui.run.tally(G.Run.state.deck),
        h('div', { style: { textAlign: 'center', marginTop: '8px' } }, h('button', { class: 'btn sm ghost', type: 'button', onClick: () => ui.run.deckModal() }, 'デッキを見る'))),
      h('div', { class: 'run-foot' }, ok)));
  }

  ui.app.register('packopen', {
    transition: 'fade',
    mount(root, params) {
      params = params || {};
      S = { root, busy: false };
      const st = G.Run.state;
      if (!st || st.phase !== 'packopen') {
        try { G.Run.startNew({ depth: params.depth, festival: params.festival, seed: params.seed }); }
        catch (e) { console.error(e); root.appendChild(h('div', { class: 'col' }, h('div', { class: 'stub' }, h('div', { class: 'stub-mark' }, '異常'), h('p', null, 'ランを始められませんでした。'), h('code', null, String(e.message))))); return; }
      }
      const po = G.Run.state.packopen;
      if (po.relicOffer && !po.chosenRelic) renderRelics(root);
      else renderChoice(root);
      ui.app.setMenuButton(async () => {
        const ok = await ui.confirm('パック開封を中断してメニューへ戻りますか？\n進み具合は保存されます。', { ok: 'メニューへ', cancel: '続ける' });
        if (ok) { G.Run.save(); ui.app.show('menu', null, { replace: true, transition: 'fade' }); }
      });
    },
    unmount() { S = null; ui.app.setMenuButton(null); },
  });
})(globalThis.G = globalThis.G || {});
