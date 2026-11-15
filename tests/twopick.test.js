'use strict';
// tests/twopick.test.js — 2pick mode: rarity schedule, upgrade odds, offers, draft flow, rerolls, separate records.
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert, deepEq = T.deepEq;
  if (!G.TwoPick || !G.Run || !G.CardDB.has('accel_01')) return;
  const path = require('path');
  ['js/data/texts.js', 'js/meta/depth.js', 'js/meta/codex.js', 'js/meta/achievements.js', 'js/meta/records.js', 'js/meta/festival.js', 'js/meta/meta.js']
    .forEach(function (f) { require(path.join(T.root(), f)); });
  G.AI.quiet = true; G.Run.quiet = true;
  const TP = G.TwoPick;

  // run fn with an in-memory meta (no G.Save)
  function withMemMeta(fn) {
    const hadSave = G.Save;
    G.Save = undefined; G.MetaStore.reset();
    try { return fn(G.MetaStore.get()); } finally { G.Save = hadSave; G.MetaStore.reset(); G.Run.state = null; }
  }
  function draftAll(pickIdx) {
    let r;
    for (let i = 0; i < TP.PICKS; i++) r = G.Run.draftPick(pickIdx == null ? 0 : pickIdx(i));
    return r;
  }

  test('2pick: rarity schedule (odd C+C, even R+R, 5th/15th C+L)', () => {
    for (let n = 1; n <= 15; n++) {
      const s = TP.schedule(n);
      if (n === 5 || n === 15) deepEq(s, ['common', 'legend'], 'pick ' + n);
      else if (n % 2 === 0) deepEq(s, ['rare', 'rare'], 'pick ' + n);
      else deepEq(s, ['common', 'common'], 'pick ' + n);
    }
    eq(TP.PICKS, 15); eq(TP.REROLLS, 3); eq(TP.CHOICES, 4);
  });

  test('2pick: one-step upgrade odds ≈ 10% / 6% / 1% (seeded, 40k rolls each)', () => {
    const rng = new G.RNG(77), N = 40000;
    const up = { common: 0, rare: 0, legend: 0 };
    for (let i = 0; i < N; i++) {
      if (TP.upgrade('common', rng) === 'rare') up.common++;
      if (TP.upgrade('rare', rng) === 'legend') up.rare++;
      if (TP.upgrade('legend', rng) === 'taboo') up.legend++;
    }
    ok(Math.abs(up.common / N - 0.10) < 0.01, 'common→rare ' + up.common / N);
    ok(Math.abs(up.rare / N - 0.06) < 0.008, 'rare→legend ' + up.rare / N);
    ok(Math.abs(up.legend / N - 0.01) < 0.003, 'legend→taboo ' + up.legend / N);
    eq(TP.upgrade('taboo', rng), 'taboo', 'taboo never goes further');
  });

  test('2pick: an offer is 4 different lineages, each a pair of 2 different cards of that lineage (2k offers)', () => {
    const rng = new G.RNG(5);
    const seenLin = {};
    for (let i = 0; i < 2000; i++) {
      const pick = (i % 15) + 1;
      const off = TP.offer(rng, pick);
      eq(off.length, 4);
      const lins = off.map((p) => p.lineage);
      eq(new Set(lins).size, 4, 'no duplicate lineage in one pick');
      off.forEach((p) => {
        seenLin[p.lineage] = true;
        eq(p.cards.length, 2);
        ok(p.cards[0] !== p.cards[1], 'two different cards');
        p.cards.forEach((id, k) => {
          const d = G.CardDB.get(id);
          eq(d.lineage, p.lineage, id + ' lineage');
          ok(G.Data.isProjectCard(d) && !d.bossOnly && d.rarity !== 'boss', id + ' is a player card');
          eq(d.rarity, p.rarities[k]);
          // rarity is the scheduled one or exactly one step above
          const order = ['common', 'rare', 'legend', 'taboo'];
          const base = order.indexOf(TP.schedule(pick)[k]), got = order.indexOf(d.rarity);
          ok(got === base || got === base + 1, id + ' rarity ' + d.rarity + ' at pick ' + pick);
        });
      });
    }
    deepEq(Object.keys(seenLin).sort(), TP.LINEAGES.slice().sort(), 'all 7 lineages incl. generic appear');
  });

  test('2pick: taboo shows up rarely (only via legend upgrade)', () => {
    const rng = new G.RNG(9);
    let taboo = 0, legendSlots = 0;
    for (let i = 0; i < 20000; i++) {
      const off = TP.offer(rng, 5);   // C+L pick
      off.forEach((p) => { legendSlots++; if (p.rarities[1] === 'taboo') taboo++; });
    }
    ok(taboo / legendSlots > 0.006 && taboo / legendSlots < 0.015, 'taboo rate in the legend slot ' + taboo / legendSlots);
  });

  test('2pick: draft flow — 15 picks make a 30-card deck, then the starter relic choice', () => withMemMeta(() => {
    eq(G.Run.startNew({ mode: 'twopick', seed: 1234, depth: 0 }), 'draft');
    const st = G.Run.state;
    eq(st.mode, 'twopick'); eq(st.phase, 'draft'); eq(G.Run.nextScreen(), 'draft');
    eq(st.deck.length, 0); eq(st.draft.pick, 1); eq(st.draft.rerolls, 3); eq(st.draft.offer.length, 4);
    ok(G.Run.isTwoPick());
    let last;
    for (let i = 0; i < 15; i++) {
      const pair = st.draft.offer[i % 4];
      last = G.Run.draftPick(i % 4);
      deepEq(last.cards, pair.cards);
      eq(st.deck.length, (i + 1) * 2);
      if (i < 14) { eq(last.done, false); eq(st.draft.pick, i + 2); }
    }
    eq(last.done, true); eq(st.deck.length, 30); eq(st.draft.picks.length, 15);
    eq(st.phase, 'packopen'); eq(G.Run.nextScreen(), 'packopen');
    const offer = G.Run.relicOffer();
    eq(offer.length, 3);
    T.throws(() => G.Run.draftPick(0), /not drafting/);
    eq(G.Run.chooseStarterRelic(offer[0]), 'map');
    ok(st.relics.indexOf(offer[0]) >= 0);
    eq(st.phase, 'map');
  }));

  test('2pick: starter relics lean towards the drafted lineages', () => withMemMeta(() => {
    G.Run.startNew({ mode: 'twopick', seed: 99, depth: 0 });
    const st = G.Run.state;
    for (let i = 0; i < 15; i++) {
      // always take the time pair when offered, else the first non-generic pair
      let idx = st.draft.offer.findIndex((p) => p.lineage === 'time');
      if (idx < 0) idx = Math.max(0, st.draft.offer.findIndex((p) => p.lineage !== 'generic'));
      G.Run.draftPick(idx);
    }
    const lins = G.Run.relicOffer().map((id) => G.RelicDB.get(id).lineage);
    ok(lins[0] === 'time', 'top relic is time: ' + lins.join(','));
  }));

  test('2pick: rerolls redraw all 4 pairs and are limited to 3', () => withMemMeta(() => {
    G.Run.startNew({ mode: 'twopick', seed: 7, depth: 0 });
    const st = G.Run.state;
    const before = JSON.stringify(st.draft.offer);
    G.Run.draftReroll();
    eq(st.draft.rerolls, 2); eq(st.draft.offer.length, 4); eq(st.draft.pick, 1);
    ok(JSON.stringify(st.draft.offer) !== before, 'offer changed');
    G.Run.draftPick(0);
    G.Run.draftReroll(); G.Run.draftReroll();
    eq(st.draft.rerolls, 0);
    T.throws(() => G.Run.draftReroll(), /no rerolls/);
    eq(st.deck.length, 2, 'rerolls do not add cards');
    eq(st.draft.pick, 2);
  }));

  test('2pick: normal runs are unchanged (packopen, no draft state)', () => withMemMeta(() => {
    eq(G.Run.startNew({ seed: 3, depth: 0 }), 'packopen');
    eq(G.Run.state.mode, 'normal'); ok(!G.Run.state.draft); ok(!G.Run.isTwoPick());
  }));

  test('2pick: records go to meta.twoPick; normal depth / clears / lineage clears / pack unlocks stay put', () => withMemMeta((m) => {
    m.depth = 2; m.maxDepthCleared = 1; m.runsCleared = 3; m.lineageClears = { accel: 1 }; m.unlockedPacks = ['gold'];
    G.Run.startNew({ mode: 'twopick', seed: 11, depth: 2 });
    draftAll();
    G.Run.chooseStarterRelic(G.Run.relicOffer()[0]);
    const st = G.Run.state; st.act = 3;
    const runsStartedBefore = G.MetaStore.get().runsStarted;
    const sum = G.Run.endRun({ won: true });
    eq(sum.mode, 'twopick');
    const mm = G.MetaStore.get();
    eq(mm.depth, 2, 'depth not advanced'); eq(mm.maxDepthCleared, 1); eq(mm.runsCleared, 3);
    deepEq(mm.lineageClears, { accel: 1 }); deepEq(mm.unlockedPacks, ['gold']);
    eq(mm.runsStarted, runsStartedBefore, 'normal run count untouched');
    eq(mm.twoPick.runs, 1); eq(mm.twoPick.clears, 1); eq(mm.twoPick.bestAct, 4); eq(mm.twoPick.maxDepthCleared, 2);
    eq(mm.twoPick.lastDeck.length, 30);
    ok(sum.meta && sum.meta.twoPick && sum.meta.twoPick.clears === 1);
    eq(sum.meta.depthUnlocked, null, 'no depth unlock banner');
    // a loss in act 2 keeps the best act
    G.Run.startNew({ mode: 'twopick', seed: 12, depth: 0 });
    draftAll(); G.Run.chooseStarterRelic(G.Run.relicOffer()[0]);
    G.Run.state.act = 2;
    G.Run.endRun({ won: false });
    const t = G.MetaStore.get().twoPick;
    eq(t.runs, 2); eq(t.clears, 1); eq(t.bestAct, 4); eq(t.maxDepthCleared, 2);
    eq(G.Meta.summary().twoPick.runs, 2);
  }));
})(globalThis.G = globalThis.G || {});
