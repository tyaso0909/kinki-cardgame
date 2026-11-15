(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // js/run/twopick.js — G.TwoPick: 2pick mode (initial deck by drafting pairs, after Shadowverse 2pick).
  //   15 picks × 2 cards = 30-card deck. Each pick shows 4 different lineages (from accel/cycle/copy/chain/time/doom/generic),
  //   each with a pair of 2 different cards of that lineage. The player takes one pair.
  //   Rarity schedule (pick no. is 1-based):
  //     odd picks          → common + common
  //     even picks         → rare + rare
  //     picks 5 and 15     → common + legend
  //   Every card independently has a one-step upgrade chance: common→rare 10%, rare→legend 6%, legend→taboo 1%.
  //   Rerolls: 3 per draft (redraws all 4 pairs with the same schedule).
  //   G.TwoPick.schedule(pickNo) → ['common','common'] …
  //   G.TwoPick.upgrade(rarity, rng) → rarity (maybe one step up)
  //   G.TwoPick.offer(rng, pickNo) → [{lineage, cards:[id,id], rarities:[r,r]} ×4]
  // ---------------------------------------------------------------
  const LINEAGES = ['accel', 'cycle', 'copy', 'chain', 'time', 'doom', 'generic'];
  const PICKS = 15;
  const REROLLS = 3;
  const CHOICES = 4;
  const UPGRADE = { common: 0.10, rare: 0.06, legend: 0.01 };
  const NEXT = { common: 'rare', rare: 'legend', legend: 'taboo' };
  const ORDER = ['common', 'rare', 'legend', 'taboo'];

  function schedule(pickNo) {
    if (pickNo === 5 || pickNo === 15) return ['common', 'legend'];
    return pickNo % 2 === 0 ? ['rare', 'rare'] : ['common', 'common'];
  }
  function upgrade(rarity, rng) {
    const p = UPGRADE[rarity];
    return p && rng.next() < p ? NEXT[rarity] : rarity;
  }
  function pool(lineage, rarity) {
    return G.CardDB.pool(function (d) { return G.Data.isProjectCard(d) && d.lineage === lineage && d.rarity === rarity; });
  }
  // One card of the lineage at the rarity; falls back one rarity step down (then any rarity) when the pool runs dry.
  function drawCard(rng, lineage, rarity, exclude) {
    let r = ORDER.indexOf(rarity);
    while (r >= 0) {
      const cards = pool(lineage, ORDER[r]).filter(function (d) { return exclude.indexOf(d.id) < 0; });
      if (cards.length) return rng.pick(cards).id;
      r--;
    }
    const any = G.CardDB.pool(function (d) { return G.Data.isProjectCard(d) && d.lineage === lineage && exclude.indexOf(d.id) < 0; });
    return any.length ? rng.pick(any).id : 'basic_01';
  }
  function pair(rng, lineage, pickNo) {
    const rar = schedule(pickNo).map(function (r) { return upgrade(r, rng); });
    const a = drawCard(rng, lineage, rar[0], []);
    const b = drawCard(rng, lineage, rar[1], [a]);
    const cards = [a, b];
    return { lineage: lineage, cards: cards, rarities: cards.map(function (id) { return G.CardDB.get(id).rarity; }) };
  }
  function offer(rng, pickNo) {
    const lins = rng.shuffle(LINEAGES.slice()).slice(0, CHOICES);
    return lins.map(function (l) { return pair(rng, l, pickNo); });
  }
  // Lineage weights for the starter relic offer (generic picks don't count).
  function lineageTypes(picks) {
    return (picks || []).map(function (p) { return p.lineage; }).filter(function (l) { return l && l !== 'generic'; });
  }

  G.TwoPick = {
    LINEAGES: LINEAGES, PICKS: PICKS, REROLLS: REROLLS, CHOICES: CHOICES, UPGRADE: UPGRADE,
    schedule: schedule, upgrade: upgrade, offer: offer, pair: pair, lineageTypes: lineageTypes
  };
})(globalThis.G = globalThis.G || {});
