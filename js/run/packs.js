(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // js/run/packs.js — G.Packs: pack definitions, opening, initial deck procedure, starter relic offer.
  //   G.Packs.TYPES / G.Packs.def(type) / G.Packs.available(meta, festival) → [types]
  //   G.Packs.rollRarity(rng) → 'rare'|'legend'|'taboo'  (85/14/1)
  //   G.Packs.openPack(type, rng, opts) → [defIds×5]   (opts.guaranteeFinisher)
  //   G.Packs.offer(rng, {count, festival, meta}) → [types]  (the 3 (or 2) packs shown)
  //   G.Packs.starterRelicOffer(openedTypes, rng) → [relicIds×3]
  //   G.Packs.price(type) — SPEC 価格の目安 (unlockable packs: see docs/DEVIATIONS.md Run)
  // ---------------------------------------------------------------
  const LINEAGES = ['accel', 'cycle', 'chain', 'time', 'copy', 'doom'];

  // ---- shared run helpers (packs.js is the first run file to load) -------------------------------
  // Depth modifiers for the run layer (SPEC 深度 table). G.Depth.runModifiers(depth) (meta agent) overrides.
  G.RunCommon = G.RunCommon || {};
  G.RunCommon.depthMods = function (depth) {
    depth = depth || 0;
    const base = {
      normalLifeMul: depth >= 1 ? 1.1 : 1, eliteExtra: depth >= 2 ? 1 : 0,
      shopPriceMul: depth >= 3 ? 1.1 : 1, sellMul: depth >= 3 ? 0.9 : 1,
      packChoices: depth >= 4 ? 2 : 3, bossLifeMul: depth >= 5 ? 1.15 : 1,
      startCursedRelic: depth >= 6, mistakeMul: depth >= 7 ? 0.5 : 1,
      eliteRelics: depth >= 8 ? 2 : 1, enrageThreshold: depth >= 9 ? 0.65 : null, bossExtraRelics: depth >= 10 ? 1 : 0
    };
    if (G.Depth && typeof G.Depth.runModifiers === 'function') {
      try { return Object.assign(base, G.Depth.runModifiers(depth) || {}); } catch (e) { /* fall through */ }
    }
    return base;
  };

  const DEFS = {
    accel: { id: 'accel', name: '加速パック', lineage: 'accel', kind: 'lineage', price: 100, desc: '加速のコモン3枚＋加速のレア以上1枚＋汎用コモン1枚', hint: '系統を決め打ちしたい' },
    cycle: { id: 'cycle', name: '循環パック', lineage: 'cycle', kind: 'lineage', price: 100, desc: '循環のコモン3枚＋循環のレア以上1枚＋汎用コモン1枚', hint: '系統を決め打ちしたい' },
    chain: { id: 'chain', name: '連鎖パック', lineage: 'chain', kind: 'lineage', price: 100, desc: '連鎖のコモン3枚＋連鎖のレア以上1枚＋汎用コモン1枚', hint: '系統を決め打ちしたい' },
    time: { id: 'time', name: '時間パック', lineage: 'time', kind: 'lineage', price: 100, desc: '時間のコモン3枚＋時間のレア以上1枚＋汎用コモン1枚', hint: '系統を決め打ちしたい' },
    copy: { id: 'copy', name: '複製パック', lineage: 'copy', kind: 'lineage', price: 100, desc: '複製のコモン3枚＋複製のレア以上1枚＋汎用コモン1枚', hint: '系統を決め打ちしたい' },
    doom: { id: 'doom', name: '終焉パック', lineage: 'doom', kind: 'lineage', price: 100, desc: '終焉のコモン3枚＋終焉のレア以上1枚＋汎用コモン1枚', hint: '系統を決め打ちしたい' },
    chaos: { id: 'chaos', name: '混沌パック', lineage: null, kind: 'chaos', price: 150, desc: '全系統と汎用からランダムに5枚。うち2枚はレア以上が確定', hint: '一発逆転を狙いたい' },
    disrupt: { id: 'disrupt', name: '妨害パック', lineage: 'generic', kind: 'disrupt', price: 80, desc: '汎用・妨害カード5枚。うち1枚はレア以上', hint: '敵のコンボを止めたい' },
    // unlockable (SPEC パックの解放)
    gold: { id: 'gold', name: '黄金パック', lineage: null, kind: 'gold', price: 200, desc: '5枚のうち1枚は伝説が確定', hint: '初クリアで解放', unlock: 'gold' },
    dual: { id: 'dual', name: '二重系統パック', lineage: null, kind: 'dual', price: 120, desc: '2つの系統から半分ずつ。系統をまたぐコンボが組みやすい', hint: '3系統クリアで解放', unlock: 'dual' },
    taboo: { id: 'taboo', name: '禁忌パック', lineage: null, kind: 'taboo', price: 250, desc: '5枚のうち1枚は禁忌が確定。代わりに呪われた遺物を1つ押し付けられる', hint: '深度5クリアで解放', unlock: 'taboo' }
  };
  const BASE_TYPES = ['accel', 'cycle', 'chain', 'time', 'copy', 'doom', 'chaos', 'disrupt'];
  const SHOP_TYPES = BASE_TYPES.slice();

  function def(type) { const d = DEFS[type]; if (!d) throw new Error('Packs: unknown pack type ' + type); return d; }

  function available(meta, festival) {
    if (festival && festival.rules && festival.rules.allChaosPacks) return ['chaos'];
    const unlocked = (meta && meta.unlockedPacks) || [];
    return BASE_TYPES.concat(['gold', 'dual', 'taboo'].filter(function (t) { return unlocked.indexOf(t) >= 0; }));
  }

  // ---- pools --------------------------------------------------------------------------------
  function pool(pred) { return G.CardDB.pool(function (d) { return G.Data.isProjectCard(d) && pred(d); }); }
  function rollRarity(rng) {
    const r = rng.next() * 100;
    return r < 85 ? 'rare' : r < 99 ? 'legend' : 'taboo';
  }
  function pickFrom(rng, cards, fallbackPred) {
    if (cards.length) return rng.pick(cards).id;
    const fb = pool(fallbackPred || function () { return true; });
    return fb.length ? rng.pick(fb).id : 'basic_01';
  }
  function common(rng, lineage) { return pickFrom(rng, pool(function (d) { return d.rarity === 'common' && (lineage == null || d.lineage === lineage); })); }
  function rarePlus(rng, lineage, rarity) {
    rarity = rarity || rollRarity(rng);
    let cards = pool(function (d) { return d.rarity === rarity && (lineage == null || d.lineage === lineage); });
    if (!cards.length) cards = pool(function (d) { return d.rarity === 'rare' && (lineage == null || d.lineage === lineage); });
    return pickFrom(rng, cards);
  }
  // Chaos-style random slot: common 70 / rare 22 / legend 7 / taboo 1 across all lineages + generic.
  function anySlot(rng) {
    const r = rng.next() * 100;
    const rarity = r < 70 ? 'common' : r < 92 ? 'rare' : r < 99 ? 'legend' : 'taboo';
    return pickFrom(rng, pool(function (d) { return d.rarity === rarity; }));
  }

  // ---- opening ----------------------------------------------------------------------------------
  function openPack(type, rng, opts) {
    opts = opts || {};
    const d = def(type);
    let out = [];
    if (d.kind === 'lineage') {
      out = [common(rng, d.lineage), common(rng, d.lineage), common(rng, d.lineage), rarePlus(rng, d.lineage), common(rng, 'generic')];
    } else if (d.kind === 'chaos') {
      out = [rarePlus(rng, null), rarePlus(rng, null), anySlot(rng), anySlot(rng), anySlot(rng)];
    } else if (d.kind === 'disrupt') {
      out = [rarePlus(rng, 'generic'), common(rng, 'generic'), common(rng, 'generic'), common(rng, 'generic'), common(rng, 'generic')];
    } else if (d.kind === 'gold') {
      out = [rarePlus(rng, null, 'legend'), anySlot(rng), anySlot(rng), anySlot(rng), anySlot(rng)];
    } else if (d.kind === 'dual') {
      const a = rng.pick(LINEAGES); let b = rng.pick(LINEAGES); while (b === a) b = rng.pick(LINEAGES);
      out = [common(rng, a), common(rng, a), common(rng, b), common(rng, b), rarePlus(rng, rng.chance(0.5) ? a : b)];
      out.lineages = [a, b];
    } else if (d.kind === 'taboo') {
      out = [rarePlus(rng, null, 'taboo'), anySlot(rng), anySlot(rng), anySlot(rng), anySlot(rng)];
    }
    out = rng.shuffle(out.slice(0, 5));
    if (opts.guaranteeFinisher && !out.some(function (id) { return isFinisher(id); })) {
      const lin = d.lineage && d.lineage !== 'generic' ? d.lineage : null;
      let fin = pool(function (c) { return c.role === 'finisher' && c.rarity !== 'taboo' && (lin == null || c.lineage === lin); });
      if (!fin.length) fin = pool(function (c) { return c.role === 'finisher' && c.rarity !== 'taboo'; });
      if (fin.length) {
        // replace a common (keep the rare slot), else the last card
        let idx = out.findIndex(function (id) { return G.CardDB.get(id).rarity === 'common'; });
        if (idx < 0) idx = out.length - 1;
        out[idx] = rng.pick(fin).id;
      }
    }
    return out;
  }
  function isFinisher(defId) {
    const d = G.CardDB.tryGet(defId);
    return !!d && (d.role === 'finisher' || (d.tags || []).indexOf('finisher') >= 0);
  }
  function hasFinisher(ids) { return (ids || []).some(isFinisher); }

  // The packs shown for one choice (3 by default; depth 4+ → 2; festival allChaosPacks → ['chaos']).
  function offer(rng, opts) {
    opts = opts || {};
    const types = available(opts.meta, opts.festival);
    if (types.length === 1) return types.slice();
    const n = Math.max(1, Math.min(opts.count || 3, types.length));
    return rng.shuffle(types.slice()).slice(0, n);
  }

  // ---- starter relic offer ---------------------------------------------------------------------------
  function starterRelicOffer(openedTypes, rng) {
    const starters = G.Data.relicsBy('starter');
    const score = {};
    (openedTypes || []).forEach(function (t) {
      const d = DEFS[t]; if (!d) return;
      if (d.lineage && d.lineage !== 'generic') score[d.lineage] = (score[d.lineage] || 0) + 1;
    });
    const ranked = starters.map(function (r) { return { r: r, s: (score[r.lineage] || 0) + rng.next() * 0.5 }; })
      .sort(function (a, b) { return b.s - a.s; });
    return ranked.slice(0, 3).map(function (x) { return x.r.id; });
  }

  function price(type) { return def(type).price; }
  function lineagesOf(type) {
    const d = DEFS[type];
    if (!d) return [];
    return d.lineage && d.lineage !== 'generic' ? [d.lineage] : [];
  }

  G.Packs = {
    DEFS: DEFS, TYPES: Object.keys(DEFS), BASE_TYPES: BASE_TYPES, SHOP_TYPES: SHOP_TYPES, LINEAGES: LINEAGES,
    def: def, available: available, rollRarity: rollRarity, openPack: openPack, offer: offer,
    isFinisher: isFinisher, hasFinisher: hasFinisher, starterRelicOffer: starterRelicOffer, price: price, lineagesOf: lineagesOf,
    INITIAL_PACKS: 6
  };
})(globalThis.G = globalThis.G || {});
