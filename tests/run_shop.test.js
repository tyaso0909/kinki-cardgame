'use strict';
// tests/run_shop.test.js — shop inventory, pricing math, selling limits, curse removal, rest, save round-trip.
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  if (!G.Shop || !G.Run || !G.CardDB.has('accel_01')) return;
  G.AI.quiet = true; G.Run.quiet = true;

  function freshRun(seed, depth) {
    G.Save.clearRun();
    G.Run.startNew({ seed: seed || 1, depth: depth || 0 });
    for (let i = 0; i < 6; i++) G.Run.openChosenPack(G.Run.packOffer()[0]);
    G.Run.chooseStarterRelic(G.Run.relicOffer()[0]);
    return G.Run.state;
  }
  function commonId() { return G.CardDB.pool(function (d) { return d.rarity === 'common' && G.Data.isProjectCard(d); })[0].id; }
  function legendId() { return G.CardDB.pool(function (d) { return d.rarity === 'legend' && G.Data.isProjectCard(d); })[0].id; }

  test('shop: inventory shape — 6 cards (no taboo), 2–3 packs, 1–2 relics, prices from the SPEC table', () => {
    const st = freshRun(4);
    for (let i = 0; i < 50; i++) {
      const sh = G.Shop.generate(st, new G.RNG(i));
      eq(sh.cards.length, 6);
      sh.cards.forEach(function (c) { const d = G.CardDB.get(c.defId); ok(d.rarity !== 'taboo', 'no taboo in shop'); eq(c.price, G.Shop.PRICE[d.rarity], 'base price ' + d.rarity); });
      ok(sh.packs.length >= 2 && sh.packs.length <= 3, 'packs ' + sh.packs.length);
      ok(sh.relics.length >= 1 && sh.relics.length <= 2, 'relics');
      sh.relics.forEach(function (r) { const d = G.RelicDB.get(r.id); ok(d.category === 'generic' || d.category === 'lineage'); ok(st.relics.indexOf(r.id) < 0, 'not owned'); });
      ok(typeof sh.line === 'string' && sh.line.length > 0, 'shop line');
    }
    G.Run.abandon();
  });

  test('shop: price math — depth 3 (+10%) × 商人の印章 (-20%) × 店主の休憩 (+50% / -30%); sell -10% at depth 3', () => {
    const st = freshRun(5, 3);
    eq(G.Shop.buyPrice(st, 100), 110, 'depth 3');
    st.relics.push('relic_merchant_seal');
    eq(G.Shop.buyPrice(st, 100), 90, '110 × 0.8 = 88 → 90 (5G steps)');
    st.flags.nextShopPriceMul = 1.5;
    eq(G.Shop.buyPrice(st, 100), 130, '× 1.5 = 132 → 130');
    st.flags.nextShopPriceMul = 0.7;
    eq(G.Shop.buyPrice(st, 100), 60, '× 0.7 = 61.6 → 60');
    const sh = G.Shop.generate(st, new G.RNG(1));
    ok(sh.priceNote, 'discount note'); eq(st.flags.nextShopPriceMul, undefined, 'one-visit flag consumed');
    eq(G.Shop.sellPrice(st, commonId()), 9); eq(G.Shop.sellPrice(st, legendId()), 72);
    const tab = G.Data.tabooCards()[0]; eq(G.Shop.sellPrice(st, tab.id), 135, 'taboo sells for 150 × 0.9');
    st.depth = 0; st.relics = st.relics.filter(function (r) { return r !== 'relic_merchant_seal'; });
    eq(G.Shop.sellPrice(st, commonId()), 10); eq(G.Shop.buyPrice(st, 40), 40);
    G.Run.abandon();
  });

  test('shop: buying / selling / limits — 3 sells per visit, deck never below 20, gold checks', () => {
    const st = freshRun(6);
    const sh = G.Shop.generate(st, new G.RNG(2));
    st.gold = 0;
    eq(G.Shop.buyCard(st, sh, 0).ok, false, 'no gold');
    st.gold = 1000;
    const before = st.deck.length;
    ok(G.Shop.buyCard(st, sh, 0).ok); eq(st.deck.length, before + 1); eq(sh.cards[0].sold, true);
    eq(G.Shop.buyCard(st, sh, 0).ok, false, 'already sold');
    const packRes = G.Shop.buyPack(st, sh, 0, new G.RNG(9)); ok(packRes.ok); eq(packRes.cards.length, 5); eq(st.deck.length, before + 6);
    ok(G.Shop.buyRelic(st, sh, 0).ok); ok(st.relics.indexOf(sh.relics[0].id) >= 0);
    let sold = 0;
    while (G.Shop.canSell(st, sh)) { const g = st.gold; ok(G.Shop.sell(st, sh, st.deck[0]).ok); ok(st.gold > g); sold++; }
    eq(sold, 3, 'three sells');
    eq(G.Shop.sell(st, sh, st.deck[0]).reason, 'limit');
    // deck minimum
    const sh2 = G.Shop.generate(st, new G.RNG(3));
    st.deck = st.deck.slice(0, 20);
    eq(G.Shop.canSell(st, sh2), false); eq(G.Shop.sell(st, sh2, st.deck[0]).reason, 'deckMin');
    G.Run.abandon();
  });

  test('shop: 呪われた遺物 removal costs 75G (× multipliers) and only removes cursed relics', () => {
    const st = freshRun(7);
    st.relics.push('relic_heavy_chain');
    const sh = G.Shop.generate(st, new G.RNG(1));
    eq(sh.removeCursePrice, 75);
    st.gold = 50; eq(G.Shop.removeCurse(st, sh, 'relic_heavy_chain').reason, 'gold');
    st.gold = 100; eq(G.Shop.removeCurse(st, sh, st.relics[0]).reason, 'notCursed');
    ok(G.Shop.removeCurse(st, sh, 'relic_heavy_chain').ok); eq(st.gold, 25); eq(st.relics.indexOf('relic_heavy_chain'), -1);
    G.Run.abandon();
  });

  test('rest: heal 30% of max life, or remove a card (deck ≥ 20); 砕けた砂時計 forbids healing', () => {
    const st = freshRun(8);
    st.life = 10;
    let o = G.Run.restOptions(); eq(o.healAmount, 12); eq(o.canHeal, true);
    st.phase = 'rest';
    eq(G.Run.rest('heal'), 'map'); eq(st.life, 22);
    st.phase = 'rest'; const n = st.deck.length;
    G.Run.rest('remove', st.deck[0]); eq(st.deck.length, n - 1);
    st.relics.push('relic_broken_hourglass'); st.life = 5;
    o = G.Run.restOptions(); eq(o.canHeal, false); eq(o.noRestHeal, true);
    T.throws(function () { G.Run.rest('heal'); }, /砕けた砂時計/);
    G.Run.abandon();
  });

  test('save: meta defaults, updateMeta persists, run round-trip, export/import, wipe', () => {
    G.Save.wipe();
    const m = G.Save.meta();
    eq(m.depth, 0); eq(m.runsStarted, 0); T.deepEq(m.unlockedPacks, []); eq(typeof m.codex.cards, 'object');
    G.Save.updateMeta(function (mm) { mm.depth = 3; mm.codex.cards.accel_01 = true; mm.unlockedPacks.push('gold'); });
    G.Save._reset();
    eq(G.Save.meta().depth, 3); eq(G.Save.meta().codex.cards.accel_01, true);
    // run round trip
    const st = freshRun(9);
    const json = JSON.stringify(st);
    ok(G.Save.hasRun());
    const loaded = G.Save.loadRun();
    eq(JSON.stringify(Object.assign({}, loaded, { savedAt: undefined, version: undefined })), JSON.stringify(Object.assign({}, JSON.parse(json), { savedAt: undefined, version: undefined })));
    // resume restores RNG and screen
    const nextRoll = G.Run.rng().clone().next();
    G.Run.state = null;
    eq(G.Run.resume(), 'map');
    eq(G.Run.rng().next(), nextRoll, 'rng state restored');
    // export / import (G.Meta.onRunStart may clamp depth to what is unlocked, so set both fields)
    G.Save.updateMeta(function (mm) { mm.maxDepthCleared = 2; mm.depth = 3; });
    const exp = G.Save.exportString();
    ok(/^[A-Za-z0-9+/=]+$/.test(exp), 'base64');
    G.Save.wipe();
    eq(G.Save.meta().depth, 0); eq(G.Save.hasRun(), false);
    eq(G.Save.importString(exp).ok, true);
    eq(G.Save.meta().depth, 3); eq(G.Save.hasRun(), true); eq(G.Save.loadRun().seed, st.seed);
    eq(G.Save.importString('garbage!!').ok, false);
    G.Save.settings.set({ anim: 'fast' }); eq(G.Save.settings.get().anim, 'fast');
    G.Save.wipe(); G.Run.state = null;
  });
})(globalThis.G);
