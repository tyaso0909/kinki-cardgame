'use strict';
// tests/run_packs.test.js — pack definitions, rarity distribution, initial deck procedure, starter relics.
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  if (!G.Packs || !G.CardDB.has('accel_01') || !G.CardDB.has('gen_01')) return;
  G.AI.quiet = true; G.Run.quiet = true;

  test('packs: 8 base types + 3 unlockable; availability follows unlockedPacks and allChaosPacks', () => {
    eq(G.Packs.BASE_TYPES.length, 8);
    eq(G.Packs.TYPES.length, 11);
    eq(G.Packs.available({ unlockedPacks: [] }).length, 8);
    eq(G.Packs.available({ unlockedPacks: ['gold', 'taboo'] }).length, 10);
    T.deepEq(G.Packs.available({ unlockedPacks: ['gold'] }, { rules: { allChaosPacks: true } }), ['chaos']);
    eq(G.Packs.price('accel'), 100); eq(G.Packs.price('chaos'), 150); eq(G.Packs.price('disrupt'), 80);
  });

  test('packs: rare-slot distribution over 10k rolls ≈ 85/14/1', () => {
    const rng = new G.RNG(3), c = { rare: 0, legend: 0, taboo: 0};
    for (let i = 0; i < 10000; i++) c[G.Packs.rollRarity(rng)]++;
    ok(c.rare > 8300 && c.rare < 8700, 'rare ' + c.rare);
    ok(c.legend > 1200 && c.legend < 1600, 'legend ' + c.legend);
    ok(c.taboo > 50 && c.taboo < 160, 'taboo ' + c.taboo);
  });

  test('packs: lineage pack = 3 lineage commons + 1 lineage rare+ + 1 generic common (10k packs)', () => {
    const rng = new G.RNG(11);
    const rarePlus = { rare: 0, legend: 0, taboo: 0 };
    for (let i = 0; i < 10000; i++) {
      const lin = G.Packs.LINEAGES[i % 6];
      const ids = G.Packs.openPack(lin, rng);
      eq(ids.length, 5);
      const defs = ids.map(function (id) { return G.CardDB.get(id); });
      const linCommons = defs.filter(function (d) { return d.lineage === lin && d.rarity === 'common'; }).length;
      const linRare = defs.filter(function (d) { return d.lineage === lin && d.rarity !== 'common'; });
      const genCommons = defs.filter(function (d) { return d.lineage === 'generic' && d.rarity === 'common'; }).length;
      eq(linCommons, 3, 'lineage commons'); eq(linRare.length, 1, 'lineage rare+'); eq(genCommons, 1, 'generic common');
      rarePlus[linRare[0].rarity]++;
      ok(defs.every(function (d) { return !d.bossOnly && d.rarity !== 'boss'; }), 'no boss cards');
    }
    ok(rarePlus.rare > 8300 && rarePlus.legend > 1200 && rarePlus.taboo > 50, JSON.stringify(rarePlus));
  });

  test('packs: 混沌 has ≥2 rare+; 妨害 is 5 generic with ≥1 rare+; 黄金 has a legend; 禁忌 has a taboo', () => {
    const rng = new G.RNG(5);
    for (let i = 0; i < 300; i++) {
      const chaos = G.Packs.openPack('chaos', rng).map(function (id) { return G.CardDB.get(id); });
      ok(chaos.filter(function (d) { return d.rarity !== 'common'; }).length >= 2, 'chaos rare+ ≥ 2');
      const dis = G.Packs.openPack('disrupt', rng).map(function (id) { return G.CardDB.get(id); });
      ok(dis.every(function (d) { return d.lineage === 'generic'; }), 'disrupt all generic');
      ok(dis.some(function (d) { return d.rarity !== 'common'; }), 'disrupt has rare+');
      const gold = G.Packs.openPack('gold', rng).map(function (id) { return G.CardDB.get(id); });
      ok(gold.some(function (d) { return d.rarity === 'legend'; }), 'gold has legend');
      const taboo = G.Packs.openPack('taboo', rng).map(function (id) { return G.CardDB.get(id); });
      ok(taboo.some(function (d) { return d.rarity === 'taboo'; }), 'taboo pack has taboo');
      const dual = G.Packs.openPack('dual', rng).map(function (id) { return G.CardDB.get(id); });
      eq(new Set(dual.map(function (d) { return d.lineage; })).size <= 2, true, 'dual uses two lineages');
    }
  });

  test('packs: finisher guarantee replaces a card when requested and none rolled', () => {
    const rng = new G.RNG(8);
    let guaranteedHits = 0;
    for (let i = 0; i < 200; i++) {
      const ids = G.Packs.openPack('disrupt', rng, { guaranteeFinisher: true });
      eq(ids.length, 5);
      ok(G.Packs.hasFinisher(ids), 'finisher present');
      guaranteedHits++;
    }
    eq(guaranteedHits, 200);
  });

  test('run: initial deck is exactly 30 cards with a finisher for 50 seeds; offer honours depth 4 (2 packs)', () => {
    for (let seed = 1; seed <= 50; seed++) {
      G.Save.clearRun();
      G.Run.startNew({ seed: seed, depth: seed % 2 ? 0 : 4 });
      for (let i = 0; i < 6; i++) {
        const offer = G.Run.packOffer();
        eq(offer.length, seed % 2 ? 3 : 2, 'offer size by depth');
        eq(new Set(offer).size, offer.length, 'distinct offer');
        G.Run.openChosenPack(offer[seed % offer.length]);
      }
      eq(G.Run.state.deck.length, 30, 'seed ' + seed);
      ok(G.Packs.hasFinisher(G.Run.state.deck), 'finisher guaranteed seed ' + seed);
      eq(G.Run.packOffer().length, 0, 'no more offers');
      const relics = G.Run.relicOffer();
      eq(relics.length, 3);
      relics.forEach(function (id) { eq(G.RelicDB.get(id).category, 'starter'); });
      G.Run.abandon();
    }
  });

  test('packs: starter relic offer is biased toward opened lineages', () => {
    const rng = new G.RNG(2);
    const offer = G.Packs.starterRelicOffer(['accel', 'accel', 'accel', 'cycle', 'cycle', 'disrupt'], rng);
    eq(offer.length, 3);
    ok(offer.indexOf('relic_ember') >= 0, '加速 starter offered');
    ok(offer.indexOf('relic_old_bookmark') >= 0, '循環 starter offered');
  });

  test('run: opening a 禁忌パック attaches a cursed relic', () => {
    G.Save.clearRun();
    G.Run.startNew({ seed: 3 });
    G.Run.state.packopen.offer = ['taboo'];
    G.Run.openChosenPack('taboo');
    ok(G.Run.state.relics.some(function (id) { return G.RelicDB.get(id).category === 'cursed'; }));
    G.Run.abandon();
  });
})(globalThis.G);
