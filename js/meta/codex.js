/* 禁域 — js/meta/codex.js
   図鑑 (SPEC 図鑑). Registers seen cards / relics / enemies / diary in save meta and computes completion.
   G.Codex.register(kind, id)        kind: 'cards'|'relics'|'enemies'|'diary' → true if newly registered
   G.Codex.has(kind, id)
   G.Codex.ids(kind)                 registered ids in registration order
   G.Codex.totals()                  {cards, relics, enemies, diary}
   G.Codex.completion()              {cards:{have,total,pct}, relics, enemies, diary, total:{have,total,pct}}
   G.Codex.cosmetics()               [{id, pct, name, kind:'back'|'foil', text, unlocked}] (25/50/75/100%)
   G.Codex.activeCardBack()          id of the best unlocked card back (or null)
   G.Codex.foilLevel()               0 none / 1 rare+ foil / 2 all foil
   G.Codex.secretGraffitiUnlocked()  all 30 base diary fragments collected
   G.Codex.diaryList({sort})         sort 'found' (default) | 'day'  → [{id, text, day, boss, index}]
   G.Codex.enemyEntry(enemyId)       {def, seen, trumps:[CardDef]} (trumps only when seen)
   G.Codex.cardPool()                codex card list (player-obtainable incl. boss aux cards; hidden/test cards excluded)
   G.Codex.relicPool()               visible relics
   Works without G.Save (in-memory fallback through G.MetaStore).
*/
(function (G) {
  'use strict';

  // ---- shared in-memory meta fallback (idempotent across meta files) ----
  const Store = G.MetaStore || (G.MetaStore = (function () {
    let mem = null;
    function blank() {
      return { depth: 0, maxDepthCleared: -1, runsStarted: 0, runsCleared: 0, lineageClears: {},
        codex: { cards: {}, relics: {}, enemies: {}, diary: {} }, achievements: {},
        records: { maxDamageOneTurn: 0, maxChain: 0, longestLoop: 0, maxDepth: -1, lineageUse: {}, cardUse: {} },
        graffitiCard: null, lastRunDeck: [], unlockedPacks: [], festivalRecords: {} };
    }
    function get() {
      try { if (G.Save && typeof G.Save.meta === 'function') { const m = G.Save.meta(); if (m) return m; } } catch (e) { /* fall through */ }
      return mem || (mem = blank());
    }
    function update(fn) {
      try {
        if (G.Save && typeof G.Save.updateMeta === 'function') { G.Save.updateMeta(fn); return get(); }
      } catch (e) { /* fall through */ }
      const m = get(); fn(m); return m;
    }
    function reset() { mem = null; }
    return { get: get, update: update, blank: blank, reset: reset };
  })());

  const KINDS = ['cards', 'relics', 'enemies', 'diary'];

  function codexOf(m) {
    if (!m.codex) m.codex = {};
    KINDS.forEach(function (k) { if (!m.codex[k]) m.codex[k] = {}; });
    return m.codex;
  }

  function register(kind, id) {
    if (KINDS.indexOf(kind) < 0 || !id) return false;
    let fresh = false;
    Store.update(function (m) {
      const c = codexOf(m);
      if (!c[kind][id]) { c[kind][id] = true; fresh = true; }
    });
    return fresh;
  }
  function has(kind, id) {
    const c = codexOf(Store.get());
    return !!(c[kind] && c[kind][id]);
  }
  function ids(kind) { return Object.keys(codexOf(Store.get())[kind] || {}); }

  // ---- pools ----
  function isProjectCard(d) {
    if (G.Data && typeof G.Data.isProjectCard === 'function') return G.Data.isProjectCard(d);
    return !/^(t|ta|tb|tc|demo)_/.test(d.id);
  }
  function cardPool() {
    try {
      if (!G.CardDB) return [];
      return G.CardDB.all().filter(function (d) { return d && !d.bossOnly && !d.hidden && isProjectCard(d); });
    } catch (e) { return []; }
  }
  function relicVisible(r) {
    return r && !r.hidden && !r.enemyOnly && r.category !== 'hidden' && r.category !== 'enemy' && r.id.indexOf('relic_') === 0 && !/^relic_(boss|elite)\d/.test(r.id);
  }
  function relicPool() {
    try { return G.RelicDB ? G.RelicDB.all().filter(relicVisible) : []; } catch (e) { return []; }
  }
  function enemyPool() {
    try { return G.EnemyDB ? G.EnemyDB.all().filter(function (e) { return e && !e.hidden && /^(enemy|elite|boss)_/.test(e.id); }) : []; } catch (e) { return []; }
  }
  function diaryPool() {
    try { return G.Texts && typeof G.Texts.allDiary === 'function' ? G.Texts.allDiary() : (G.Texts && G.Texts.diary) || []; } catch (e) { return []; }
  }

  function totals() {
    return { cards: cardPool().length, relics: relicPool().length, enemies: enemyPool().length, diary: diaryPool().length };
  }
  function pct(have, total) { return total > 0 ? Math.min(100, Math.floor((have / total) * 100)) : 0; }
  function completion() {
    const t = totals();
    const c = codexOf(Store.get());
    const out = {};
    let have = 0, total = 0;
    // Count only ids that still exist in the pools (stale ids after data changes do not inflate the number).
    const pools = { cards: cardPool(), relics: relicPool(), enemies: enemyPool(), diary: diaryPool() };
    KINDS.forEach(function (k) {
      const seen = c[k] || {};
      const n = pools[k].filter(function (d) { return !!seen[d.id]; }).length;
      out[k] = { have: n, total: t[k], pct: pct(n, t[k]) };
      have += n; total += t[k];
    });
    out.total = { have: have, total: total, pct: pct(have, total) };
    return out;
  }

  // ---- cosmetics (SPEC: 達成率に応じて裏面デザイン / 箔押し) ----
  const COSMETICS = [
    { id: 'back_scorched', pct: 25,  kind: 'back', name: '裏面：焦げた紙',   text: '焚べ火で炙った紙の裏面。' },
    { id: 'back_mirror',   pct: 50,  kind: 'back', name: '裏面：合わせ鏡',   text: '向こう側の自分が透けて見える裏面。' },
    { id: 'foil_rare',     pct: 75,  kind: 'foil', name: '箔押し：レア以上', text: 'レア以上のカードが光る加工になる。' },
    { id: 'foil_all',      pct: 100, kind: 'foil', name: '箔押し：全カード', text: 'すべてのカードが光り、裏面に金の封印が入る。' },
  ];
  function cosmetics() {
    const p = completion().total.pct;
    return COSMETICS.map(function (c) { return Object.assign({}, c, { unlocked: p >= c.pct }); });
  }
  function activeCardBack() {
    const list = cosmetics().filter(function (c) { return c.kind === 'back' && c.unlocked; });
    if (completion().total.pct >= 100) return 'back_gold';
    return list.length ? list[list.length - 1].id : null;
  }
  function foilLevel() {
    const p = completion().total.pct;
    return p >= 100 ? 2 : p >= 75 ? 1 : 0;
  }

  // ---- diary ----
  function baseDiaryIds() {
    const base = (G.Texts && G.Texts.diary) || [];
    return base.map(function (d) { return d.id; });
  }
  function secretGraffitiUnlocked() {
    const idsBase = baseDiaryIds();
    if (!idsBase.length) return false;
    const seen = codexOf(Store.get()).diary;
    return idsBase.every(function (id) { return !!seen[id]; });
  }
  function diaryList(opts) {
    opts = opts || {};
    const seen = codexOf(Store.get()).diary;
    const order = Object.keys(seen);
    const all = diaryPool();
    const list = all.filter(function (d) { return !!seen[d.id]; }).map(function (d) {
      return Object.assign({}, d, { index: order.indexOf(d.id) });
    });
    if (opts.sort === 'day') {
      list.sort(function (a, b) {
        const ad = a.day == null ? Infinity : a.day, bd = b.day == null ? Infinity : b.day;
        if (ad !== bd) return ad - bd;
        // undated: boss fragments after the undated base ones, torn last
        if (!!a.torn !== !!b.torn) return a.torn ? 1 : -1;
        if (!!a.boss !== !!b.boss) return a.boss ? 1 : -1;
        return a.index - b.index;
      });
    } else {
      list.sort(function (a, b) { return a.index - b.index; });
    }
    return list;
  }

  // ---- enemies ----
  function enemyEntry(enemyId) {
    let def = null;
    try { def = G.EnemyDB && G.EnemyDB.tryGet ? G.EnemyDB.tryGet(enemyId) : (G.EnemyDB ? G.EnemyDB.get(enemyId) : null); } catch (e) { def = null; }
    if (!def) return null;
    const seen = has('enemies', enemyId);
    let trumps = [];
    if (seen && Array.isArray(def.trumps) && G.CardDB) {
      trumps = def.trumps.map(function (n) {
        try {
          if (G.CardDB.has && G.CardDB.has(n)) return G.CardDB.get(n);
          return G.CardDB.all().find(function (d) { return d.name === n; }) || null;
        } catch (e) { return null; }
      }).filter(Boolean);
    }
    return { def: def, seen: seen, trumps: trumps };
  }

  G.Codex = {
    KINDS: KINDS,
    COSMETICS: COSMETICS,
    register: register,
    has: has,
    ids: ids,
    totals: totals,
    completion: completion,
    cosmetics: cosmetics,
    activeCardBack: activeCardBack,
    foilLevel: foilLevel,
    secretGraffitiUnlocked: secretGraffitiUnlocked,
    diaryList: diaryList,
    enemyEntry: enemyEntry,
    cardPool: cardPool,
    relicPool: relicPool,
    enemyPool: enemyPool,
    diaryPool: diaryPool,
  };
})(globalThis.G = globalThis.G || {});
