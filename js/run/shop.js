(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // js/run/shop.js — G.Shop: shop inventory, pricing, selling, curse removal (SPEC ラン中のデッキ作り).
  //   G.Shop.generate(run, rng) → shop state (JSON, stored in run.pending)
  //   G.Shop.priceMul(run) / buyPrice(run, base) / sellPrice(run, defId) / canSell(run, shop)
  //   G.Shop.buyCard(run, shop, idx) / buyPack(run, shop, idx) → defIds / buyRelic(run, shop, idx)
  //   G.Shop.sell(run, shop, defId) / removeCurse(run, shop, relicId)
  //   `run` is the G.Run state object (deck, relics, gold, depth, flags).
  // ---------------------------------------------------------------
  const PRICE = { common: 40, rare: 100, legend: 250 };
  const SELL = { common: 10, rare: 30, legend: 80, taboo: 150, boss: 80 };
  const MAX_SELLS = 3;
  const DECK_MIN = 20;
  const CURSE_REMOVAL = 75;
  const FALLBACK_LINES = ['いらっしゃい。壊れたものばかりだが、よく回るよ。', '返品は受け付けない。禁域の外まで持って帰れたら、の話だがね。', '前の客は、同じ顔をしていたな。', '値札は飾りだ。払えるなら持っていけ。'];

  function round5(n) { return Math.max(5, Math.round(n / 5) * 5); }
  function runEffects(run) { return G.Data.runEffectsOf(run.relics || []); }
  function depthMods(run) { return G.RunCommon.depthMods(run.depth || 0); }

  function priceMul(run) {
    const fx = runEffects(run);
    let mul = depthMods(run).shopPriceMul || 1;
    mul *= Math.max(0, 1 - (fx.shopDiscount || 0));
    mul *= run.flags && run.flags.nextShopPriceMul ? run.flags.nextShopPriceMul : 1;
    return mul;
  }
  function buyPrice(run, base) { return round5(base * priceMul(run)); }
  function cardBasePrice(defId) { const d = G.CardDB.get(defId); return PRICE[d.rarity] || PRICE.common; }
  function relicBasePrice(relicId) { const r = G.RelicDB.get(relicId); return r.rarity === 'legend' ? 300 : r.rarity === 'rare' ? 180 : 120; }
  function sellPrice(run, defId) {
    const d = G.CardDB.get(defId);
    const base = SELL[d.rarity] || SELL.common;
    return Math.max(1, Math.round(base * (depthMods(run).sellMul || 1)));
  }

  // SPEC rarity weights (common 50 / rare 30 / legend 15; taboo never in shops) renormalised.
  function rollShopRarity(rng) { const r = rng.next() * 95; return r < 50 ? 'common' : r < 80 ? 'rare' : 'legend'; }

  function generate(run, rng, opts) {
    opts = opts || {};
    const pool = G.CardDB.pool(function (d) { return G.Data.isProjectCard(d) && d.rarity !== 'taboo'; });
    const cards = [];
    const used = {};
    for (let i = 0; i < 6 && pool.length; i++) {
      const rar = rollShopRarity(rng);
      let cands = pool.filter(function (d) { return d.rarity === rar && !used[d.id]; });
      if (!cands.length) cands = pool.filter(function (d) { return !used[d.id]; });
      const d = rng.pick(cands); used[d.id] = true;
      cards.push({ defId: d.id, price: buyPrice(run, cardBasePrice(d.id)), sold: false });
    }
    const types = G.Packs.available(G.Save && G.Save.meta ? G.Save.meta() : null, run.festival);
    const packTypes = rng.shuffle(types.slice()).slice(0, 2 + rng.int(2));
    const packs = packTypes.map(function (t) { return { type: t, price: buyPrice(run, G.Packs.price(t)), sold: false }; });
    const relicPool = G.Data.relicsBy('player').filter(function (r) {
      return (r.category === 'generic' || r.category === 'lineage') && (run.relics || []).indexOf(r.id) < 0 && (r.rarity !== 'legend' || rng.chance(0.25));
    });
    const relics = [];
    const nRelics = 1 + rng.int(2);
    for (let i = 0; i < nRelics && relicPool.length; i++) {
      const r = relicPool.splice(rng.int(relicPool.length), 1)[0];
      relics.push({ id: r.id, price: buyPrice(run, relicBasePrice(r.id)), sold: false });
    }
    const lines = (G.Texts && Array.isArray(G.Texts.shopLines) && G.Texts.shopLines.length) ? G.Texts.shopLines : FALLBACK_LINES;
    const shop = {
      cards: cards, packs: packs, relics: relics,
      removeCursePrice: buyPrice(run, CURSE_REMOVAL), sells: 0, maxSells: MAX_SELLS,
      line: rng.pick(lines), priceMul: priceMul(run), freeCardTaken: false
    };
    // 店主の休憩 penalty / discount applies to one visit only
    if (!opts.preview && run.flags && run.flags.nextShopPriceMul) { shop.priceNote = run.flags.nextShopPriceMul > 1 ? '店主はあなたを覚えていた。値札が書き換えられている。' : '代金を置いていった客への、ささやかな割引。'; delete run.flags.nextShopPriceMul; }
    return shop;
  }

  function spend(run, n) { if (run.gold < n) return false; run.gold -= n; return true; }

  function buyCard(run, shop, idx) {
    const it = shop.cards[idx];
    if (!it || it.sold) return { ok: false, reason: 'gone' };
    if (!spend(run, it.price)) return { ok: false, reason: 'gold' };
    it.sold = true; G.Run.addCard(it.defId, { source: 'shop' });
    return { ok: true, defId: it.defId };
  }
  function buyPack(run, shop, idx, rng) {
    const it = shop.packs[idx];
    if (!it || it.sold) return { ok: false, reason: 'gone' };
    if (!spend(run, it.price)) return { ok: false, reason: 'gold' };
    it.sold = true;
    const ids = G.Run.openPackIntoDeck(it.type, rng);
    return { ok: true, type: it.type, cards: ids };
  }
  function buyRelic(run, shop, idx) {
    const it = shop.relics[idx];
    if (!it || it.sold) return { ok: false, reason: 'gone' };
    if (!spend(run, it.price)) return { ok: false, reason: 'gold' };
    it.sold = true; G.Run.addRelic(it.id, { source: 'shop' });
    return { ok: true, id: it.id };
  }
  function canSell(run, shop) { return shop.sells < shop.maxSells && run.deck.length > DECK_MIN; }
  function sell(run, shop, defId) {
    if (!canSell(run, shop)) return { ok: false, reason: shop.sells >= shop.maxSells ? 'limit' : 'deckMin' };
    if (run.deck.indexOf(defId) < 0) return { ok: false, reason: 'notInDeck' };
    const price = sellPrice(run, defId);
    G.Run.removeCard(defId, { reason: 'sell' });
    run.gold += price; shop.sells++;
    return { ok: true, gold: price };
  }
  function cursedRelics(run) { return (run.relics || []).filter(function (id) { const r = G.RelicDB.tryGet(id); return r && r.category === 'cursed'; }); }
  function removeCurse(run, shop, relicId) {
    if (cursedRelics(run).indexOf(relicId) < 0) return { ok: false, reason: 'notCursed' };
    if (!spend(run, shop.removeCursePrice)) return { ok: false, reason: 'gold' };
    G.Run.removeRelic(relicId);
    return { ok: true };
  }
  // 店主の休憩 ①: take any card from a freshly generated shelf for free.
  function freeShelf(run, rng) { return generate(run, rng, { preview: true }).cards.map(function (c) { return c.defId; }); }

  G.Shop = {
    PRICE: PRICE, SELL: SELL, MAX_SELLS: MAX_SELLS, DECK_MIN: DECK_MIN, CURSE_REMOVAL: CURSE_REMOVAL,
    generate: generate, priceMul: priceMul, buyPrice: buyPrice, sellPrice: sellPrice, cardBasePrice: cardBasePrice, relicBasePrice: relicBasePrice,
    buyCard: buyCard, buyPack: buyPack, buyRelic: buyRelic, canSell: canSell, sell: sell, cursedRelics: cursedRelics, removeCurse: removeCurse, freeShelf: freeShelf
  };
})(globalThis.G = globalThis.G || {});
