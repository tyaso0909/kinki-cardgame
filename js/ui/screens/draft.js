/* 禁域 — js/ui/screens/draft.js
   2pick mode: 15 picks. Each pick shows 4 lineages × a pair of 2 cards; taking a pair adds both to the deck.
   Rerolls (3 per draft) redraw all 4 pairs. After pick 15 → packopen screen (starter relic choice).
   Drives G.Run (startNew({mode:'twopick'}) when no draft is in progress). */
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const h = ui.h;
  let S = null;

  function lin(l) { return ui.labels.LINEAGE[l] ? l : 'generic'; }
  function linName(l) { return (ui.labels.LINEAGE[lin(l)] || {}).name || l; }
  function rarityName(r) { return ui.labels.RARITY[r] || r; }

  // cost curve of the current deck (0 … 7+)
  function curve(deck) {
    const bins = [0, 0, 0, 0, 0, 0, 0, 0];
    deck.forEach((id) => { const d = G.CardDB.tryGet(id); if (!d) return; const c = Math.max(0, Math.min(7, Number(d.cost) || 0)); bins[c]++; });
    const max = Math.max(4, ...bins);
    return h('div', { class: 'tp-curve', role: 'img', 'aria-label': 'コスト分布 ' + bins.map((n, i) => (i === 7 ? '7以上' : i) + 'コスト' + n + '枚').join('、') },
      bins.map((n, i) => h('div', { class: 'col' + (n ? '' : ' zero') },
        h('span', { class: 'n' }, n ? String(n) : ''),
        h('i', { style: { height: Math.round((n / max) * 100) + '%' } }),
        h('span', { class: 'c' }, i === 7 ? '7+' : String(i)))));
  }

  function progress(pickNo) {
    const P = G.TwoPick.PICKS;
    return h('div', { class: 'tp-progress', 'aria-label': pickNo + ' / ' + P },
      h('i', { style: { width: Math.round(((pickNo - 1) / P) * 100) + '%' } }));
  }

  function pairEl(pair, idx) {
    const l = lin(pair.lineage);
    const cards = pair.cards.map((id) => {
      const def = G.CardDB.get(id);
      const c = ui.renderCard(def, { size: 'm', onClick: () => ui.cardDetail(def) });
      return h('div', { class: 'tp-card rare-' + def.rarity }, c);
    });
    const special = pair.rarities.some((r) => r === 'taboo') ? 'taboo' : pair.rarities.some((r) => r === 'legend') ? 'legend' : null;
    return h('div', { class: 'tp-pair' + (special ? ' has-' + special : ''), style: { '--lc': 'var(--' + l + ')' } },
      h('div', { class: 'tp-pair-head' },
        h('span', { class: 'lin' }, ui.lineageGlyph(l), linName(l)),
        h('span', { class: 'rar' }, pair.rarities.map((r) => h('b', { class: 'r-' + r }, rarityName(r))))),
      h('div', { class: 'tp-cards' }, cards),
      h('button', { class: 'btn block tp-take', type: 'button', onClick: (e) => take(idx, e.currentTarget) }, 'この2枚を取る'));
  }

  function render() {
    const root = S.root, st = G.Run.state, dr = st.draft;
    ui.clear(root);
    const P = G.TwoPick.PICKS;
    const sched = G.TwoPick.schedule(dr.pick);
    const schedText = sched[0] === sched[1] ? rarityName(sched[0]) + '2枚' : rarityName(sched[0]) + '＋' + rarityName(sched[1]);
    const reroll = h('button', { class: 'btn sm', type: 'button', disabled: dr.rerolls <= 0, onClick: doReroll }, '引き直す', h('small', { class: 'tp-rr' }, '残り' + dr.rerolls));
    root.appendChild(h('div', { class: 'col tp' },
      h('div', { class: 'po-head' }, h('h1', null, '2pick'), h('span', { class: 'tp-count t-num' }, h('b', null, String(dr.pick)), ' / ' + P)),
      progress(dr.pick),
      h('p', { class: 'po-lead' }, dr.pick === 1
        ? '四つの系統から、2枚ひと組を選んで取る。これを15回くり返して30枚のデッキを作る。カードを押すと効果が読める。'
        : '今回の組：' + schedText + '（ときどき一段上のレア度になる）'),
      h('div', { class: 'tp-tools' }, reroll, h('button', { class: 'btn sm ghost', type: 'button', onClick: () => ui.run.deckModal(), disabled: !st.deck.length }, 'デッキ ' + st.deck.length + '枚')),
      h('div', { class: 'tp-pairs' }, dr.offer.map(pairEl)),
      h('div', { class: 'run-section' }, h('h2', null, 'コスト分布', h('small', null, st.deck.length + ' / 30枚')), curve(st.deck)),
      h('div', { class: 'run-section' }, h('h2', null, '系統'), ui.run.tally(st.deck)),
    ));
  }

  async function take(idx, btn) {
    if (S.busy) return;
    S.busy = true;
    try {
      const pairs = Array.from(S.root.querySelectorAll('.tp-pair'));
      pairs.forEach((p, i) => { if (i !== idx) p.classList.add('dim'); else p.classList.add('chosen'); });
      S.root.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      if (ui.sfx) ui.sfx.play('revRare');
      await ui.sleep(380);
      const r = G.Run.draftPick(idx);
      const names = r.cards.map((id) => G.CardDB.get(id).name).join('・');
      ui.toast(names + 'を取った');
      if (r.done) { S.busy = false; await ui.run.go('packopen'); return; }
      render();
      const top = S.root.querySelector('.tp');
      if (top && top.scrollIntoView) top.scrollIntoView({ block: 'start' });
    } catch (e) {
      console.error(e); ui.toast('選べなかった: ' + e.message, { kind: 'bad' });
      if (btn) btn.disabled = false;
    } finally { if (S) S.busy = false; }
  }

  async function doReroll() {
    if (S.busy) return;
    const dr = G.Run.state.draft;
    if (!dr || dr.rerolls <= 0) return;
    const ok = await ui.confirm('四組すべてを引き直しますか？\n（残り' + dr.rerolls + '回）', { ok: '引き直す', cancel: 'やめる' });
    if (!ok || !S) return;
    try { G.Run.draftReroll(); render(); ui.toast('引き直した（残り' + G.Run.state.draft.rerolls + '回）'); }
    catch (e) { console.error(e); ui.toast(e.message, { kind: 'bad' }); }
  }

  ui.app.register('draft', {
    transition: 'fade',
    mount(root, params) {
      params = params || {};
      S = { root, busy: false };
      const st = G.Run.state;
      if (!st || st.phase !== 'draft') {
        try { G.Run.startNew({ mode: 'twopick', depth: params.depth, seed: params.seed }); }
        catch (e) { console.error(e); root.appendChild(h('div', { class: 'col' }, h('div', { class: 'stub' }, h('div', { class: 'stub-mark' }, '異常'), h('p', null, 'ランを始められませんでした。'), h('code', null, String(e.message))))); return; }
      }
      render();
      ui.app.setMenuButton(async () => {
        const ok = await ui.confirm('2pickを中断してメニューへ戻りますか？\n進み具合は保存されます。', { ok: 'メニューへ', cancel: '続ける' });
        if (ok) { G.Run.save(); ui.app.show('menu', null, { replace: true, transition: 'fade' }); }
      });
    },
    unmount() { S = null; ui.app.setMenuButton(null); },
  });
})(globalThis.G = globalThis.G || {});
