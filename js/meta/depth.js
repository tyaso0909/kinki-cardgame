/* 禁域 — js/meta/depth.js
   禁域の深度 (SPEC 難易度：禁域の深度).
   G.Depth.MAX                      10
   G.Depth.table                    [{depth, text}] — SPEC table (JP)
   G.Depth.modifiers(depth)         battle side (consumed by G.AI.enemyPlayerConfig)
   G.Depth.runModifiers(depth)      run side (consumed by G.Run / packs / shop)
   G.Depth.unlocked()               highest selectable depth = min(MAX, maxDepthCleared + 1)
   G.Depth.current()                depth stored in save meta (clamped to unlocked)
   G.Depth.setCurrent(depth)
   G.Depth.describe(depth)          {depth, title, added, lines:[all conditions in force], unlocked}
   G.Depth.conditions(depth)        cumulative condition texts (depth 1..n)
   Each depth keeps every previous depth's condition (SPEC).
*/
(function (G) {
  'use strict';

  const MAX = 10;
  const table = [
    { depth: 0,  text: '通常の難易度' },
    { depth: 1,  text: '通常敵のライフ+25%' },
    { depth: 2,  text: 'エリートが各幕で1回多く出る' },
    { depth: 3,  text: 'ショップの価格+10%、売却価格-10%' },
    { depth: 4,  text: '初期デッキのパック選択で、並ぶパックが3種類から2種類になる' },
    { depth: 5,  text: 'ボスのライフ+50%' },
    { depth: 6,  text: '呪われた遺物を1つ持った状態でランを始める' },
    { depth: 7,  text: '通常敵とエリートが、わざと間違える確率が半分になる' },
    { depth: 8,  text: 'エリートが遺物を2つ持つ' },
    { depth: 9,  text: 'ボスの発狂が、ライフ半分ではなく65%で始まる' },
    { depth: 10, text: 'ボスが遺物をもう1つ持つ。深度10のクリアで「禁域を越えた者」の称号' },
  ];

  function clamp(d) {
    d = Number(d);
    if (!isFinite(d)) return 0;
    return Math.max(0, Math.min(MAX, Math.floor(d)));
  }

  // Battle-side modifiers. Keys match G.AI.defaultDepthModifiers so Object.assign merges cleanly.
  function modifiers(depth) {
    const d = clamp(depth);
    return {
      normalLifeMul: d >= 1 ? 1.25 : 1,
      eliteLifeMul: 1,
      bossLifeMul: d >= 5 ? 1.5 : 1,
      mistakeMul: d >= 7 ? 0.5 : 1,
      eliteRelics: d >= 8 ? 2 : 1,
      enrageThreshold: d >= 9 ? 0.65 : null,
      bossExtraRelics: d >= 10 ? 1 : 0,
    };
  }

  // Run-side modifiers (map / shop / packs / start relics).
  function runModifiers(depth) {
    const d = clamp(depth);
    return {
      eliteExtra: d >= 2 ? 1 : 0,          // per act
      shopPriceMul: d >= 3 ? 1.1 : 1,
      sellMul: d >= 3 ? 0.9 : 1,
      packChoices: d >= 4 ? 2 : 3,
      startCursedRelic: d >= 6,
    };
  }

  function meta() {
    try {
      if (G.Save && typeof G.Save.meta === 'function') return G.Save.meta() || {};
    } catch (e) { /* save unavailable */ }
    return (G.MetaStore && typeof G.MetaStore.get === 'function') ? G.MetaStore.get() : {};
  }
  function maxCleared() {
    const m = meta();
    const v = Number(m && m.maxDepthCleared);
    return isFinite(v) && v >= 0 ? Math.floor(v) : -1; // -1 = never cleared
  }
  function unlocked() { return clamp(maxCleared() + 1); }
  function hasCleared(depth) { return maxCleared() >= clamp(depth); }
  function current() {
    const m = meta();
    const d = clamp(m && m.depth != null ? m.depth : 0);
    return Math.min(d, unlocked());
  }
  function setCurrent(depth) {
    const d = Math.min(clamp(depth), unlocked());
    const fn = function (mm) { mm.depth = d; };
    try {
      if (G.Save && typeof G.Save.updateMeta === 'function') { G.Save.updateMeta(fn); return d; }
    } catch (e) { /* ignore */ }
    if (G.MetaStore && typeof G.MetaStore.update === 'function') G.MetaStore.update(fn);
    return d;
  }

  function conditions(depth) {
    const d = clamp(depth);
    const out = [];
    for (let i = 1; i <= d; i++) out.push(table[i].text);
    return out;
  }
  function describe(depth) {
    const d = clamp(depth);
    return {
      depth: d,
      title: '深度' + d,
      added: table[d].text,
      lines: d === 0 ? [table[0].text] : conditions(d),
      unlocked: d <= unlocked(),
      cleared: hasCleared(d),
      isMax: d === MAX,
    };
  }

  G.Depth = {
    MAX: MAX,
    table: table,
    clamp: clamp,
    modifiers: modifiers,
    runModifiers: runModifiers,
    unlocked: unlocked,
    maxCleared: maxCleared,
    hasCleared: hasCleared,
    current: current,
    setCurrent: setCurrent,
    conditions: conditions,
    describe: describe,
  };
})(globalThis.G = globalThis.G || {});
