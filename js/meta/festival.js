/* 禁域 — js/meta/festival.js
   お祭りラン（日替わり・週替わり） (SPEC お祭りラン).
   G.Festival.RULES                       {key: {key, name, description, side:'battle'|'run'|'both'}}
   G.Festival.today(date?)                {id, kind:'daily', dateKey, seed, name, description, rules:{...}, ruleList:[...]}
   G.Festival.thisWeek(date?)             {id, kind:'weekly', dateKey:'YYYY-Www', seed, ...} — two rules
   G.Festival.forId(id)                   rebuild a festival descriptor from its id ('daily:2026-11-09' / 'weekly:2026-W46')
   G.Festival.applyToGame(game, rules, {playerIdx})   battle-side rules (call after createGame, before/after start)
   G.Festival.runOptions(rules)           run-side hints {packsOverride:'chaos'|null, startTabooCount:0|1}
   G.Festival.startDeckExtras(rules, rng) extra defIds for the starting deck (禁忌1枚)
   G.Festival.recordRun({festival|festivalId, won, turns, maxDamageOneTurn, maxChain, depth})  local leaderboard (no server)
   G.Festival.records(festivalId)         [{date, won, turns, maxDamageOneTurn, maxChain}] best first (max 10)
   G.Festival.best(festivalId)            best entry | null
   G.Festival.allRecords()                [{id, name, kind, dateKey, best, count}] newest first
   Determinism: the seed is FNV-1a of the festival id — same date → same seed on every device.
*/
(function (G) {
  'use strict';

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
      try { if (G.Save && typeof G.Save.updateMeta === 'function') { G.Save.updateMeta(fn); return get(); } } catch (e) { /* fall through */ }
      const m = get(); fn(m); return m;
    }
    function reset() { mem = null; }
    return { get: get, update: update, blank: blank, reset: reset };
  })());

  // ---- rules ---------------------------------------------------------------
  const RULES = {
    allCostZero: { key: 'allCostZero', side: 'battle', name: 'ただの日',
      description: 'すべてのカードのコストが0', detail: '敵も味方も、手札はぜんぶタダ。先に出口を引いた方が勝つ。' },
    twoFields: { key: 'twoFields', side: 'battle', name: '動かぬ地の日',
      description: 'フィールドは上書きされない（先に置いた方が残る）',
      detail: 'エンジンの都合でフィールドは1枚のまま。代わりに、先に展開したフィールドが戦闘の最後まで残る。' },
    startTaboo: { key: 'startTaboo', side: 'run', name: '神引きの日',
      description: '禁忌カード1枚を持ってランを始める', detail: '初期デッキに、ランダムな禁忌カードが1枚加わる。' },
    doubleLife: { key: 'doubleLife', side: 'battle', name: '倍々の日',
      description: '敵も味方もライフが2倍、ダメージも2倍', detail: '長引くようで、長引かない。' },
    allChaosPacks: { key: 'allChaosPacks', side: 'run', name: '混沌の日',
      description: 'パックの中身がすべて混沌パック', detail: '系統を選べない。出たもので戦う。' },
  };
  const RULE_KEYS = ['allCostZero', 'twoFields', 'startTaboo', 'doubleLife', 'allChaosPacks'];

  // ---- deterministic seed ----------------------------------------------------
  function fnv(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return h >>> 0;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dateKeyOf(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  // ISO-8601 week (Monday first). Uses local date so "today" matches the player's clock.
  function weekKeyOf(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t - yStart) / 86400000 + 1) / 7);
    return t.getUTCFullYear() + '-W' + pad(week);
  }

  function build(kind, dateKey) {
    const id = kind + ':' + dateKey;
    const seed = fnv('kinki:' + id);
    const count = kind === 'weekly' ? 2 : 1;
    // pick `count` distinct rules from the seed (small LCG so no G.RNG dependency)
    let s = seed || 1;
    function next() { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s; }
    const pool = RULE_KEYS.slice();
    const picked = [];
    for (let i = 0; i < count && pool.length; i++) picked.push(pool.splice(next() % pool.length, 1)[0]);
    const rules = {};
    RULE_KEYS.forEach(function (k) { rules[k] = picked.indexOf(k) >= 0; });
    const ruleList = picked.map(function (k) { return RULES[k]; });
    const name = ruleList.map(function (r) { return r.name; }).join('と');
    return {
      id: id, kind: kind, dateKey: dateKey, seed: seed,
      name: name,
      label: kind === 'weekly' ? '週替わり' : '日替わり',
      description: ruleList.map(function (r) { return r.description; }).join('。') + '。',
      rules: rules, ruleList: ruleList,
    };
  }
  function today(date) { return build('daily', dateKeyOf(date || new Date())); }
  function thisWeek(date) { return build('weekly', weekKeyOf(date || new Date())); }
  function forId(id) {
    if (typeof id !== 'string') return null;
    const i = id.indexOf(':');
    if (i < 0) return null;
    const kind = id.slice(0, i), key = id.slice(i + 1);
    if (kind !== 'daily' && kind !== 'weekly') return null;
    return build(kind, key);
  }

  // ---- battle-side application ------------------------------------------------
  const DOUBLE_RELIC = 'relic_festival_double';
  function ensureRelics() {
    try {
      if (!G.RelicDB || (G.RelicDB.has && G.RelicDB.has(DOUBLE_RELIC))) return;
      G.RelicDB.register({ id: DOUBLE_RELIC, name: '祭りの太鼓', rarity: 'common', category: 'hidden', hidden: true, enemyOnly: false,
        text: 'お祭りルール：ダメージはすべて2倍',
        effects: { scope: 'any', modDamage: function (ctx, ev) { return (ev.amount || 0) * 2; } } });
    } catch (e) { /* RelicDB missing (texts-only load) */ }
  }
  function setStatus(game, pIdx, key, value) {
    const p = game.players[pIdx];
    try { if (typeof game.setStatus === 'function') { game.setStatus(p, key, value, {}); return; } } catch (e) { /* fall back */ }
    p.statuses = p.statuses || {};
    p.statuses[key] = { value: value, until: null, sourceUid: null };
  }
  function applyToGame(game, rules, opts) {
    opts = opts || {};
    const applied = [];
    if (!game || !rules || !game.players) return applied;
    const me = opts.playerIdx == null ? 0 : opts.playerIdx;
    game.options = game.options || {};
    game.options.festival = Object.assign({}, rules);
    if (rules.allCostZero) {
      for (let i = 0; i < 2; i++) setStatus(game, i, 'allCostsZero', true);
      applied.push('allCostZero');
    }
    if (rules.doubleLife) {
      for (let i = 0; i < 2; i++) { const p = game.players[i]; p.life *= 2; if (p.maxLife != null) p.maxLife *= 2; }
      ensureRelics();
      const p = game.players[me];
      if (Array.isArray(p.relics) && p.relics.indexOf(DOUBLE_RELIC) < 0) p.relics.push(DOUBLE_RELIC);
      applied.push('doubleLife');
    }
    if (rules.twoFields) {
      // Engine has a single shared field; the substitute rule keeps the first field (see DEVIATIONS "Meta").
      if (!game._festivalKeepField && typeof game.makeCtx === 'function') {
        game._festivalKeepField = true;
        const orig = game.makeCtx;
        game.makeCtx = function () {
          const ctx = orig.apply(this, arguments);
          const g = this;
          const origSet = ctx.setField;
          ctx.setField = async function (inst, who, o) {
            if (g.field && g.field !== inst) {
              if (typeof ctx.log === 'function') ctx.log('お祭りルール：フィールドは上書きされない');
              if (typeof ctx.toGrave === 'function') await ctx.toGrave(inst, { reason: 'fieldLocked' });
              return false;
            }
            return origSet.call(ctx, inst, who, o);
          };
          return ctx;
        };
      }
      applied.push('twoFields');
    }
    return applied;
  }

  // ---- run-side hints ------------------------------------------------------------
  function runOptions(rules) {
    rules = rules || {};
    return { packsOverride: rules.allChaosPacks ? 'chaos' : null, startTabooCount: rules.startTaboo ? 1 : 0, festival: Object.assign({}, rules) };
  }
  function startDeckExtras(rules, rng) {
    if (!rules || !rules.startTaboo) return [];
    let pool = [];
    try { pool = G.Data && G.Data.tabooCards ? G.Data.tabooCards() : G.CardDB.all().filter(function (d) { return d.rarity === 'taboo' && !d.bossOnly; }); } catch (e) { pool = []; }
    if (!pool.length) return [];
    const i = rng && typeof rng.int === 'function' ? rng.int(pool.length) : 0;
    return [pool[i].id];
  }

  // ---- local leaderboard ------------------------------------------------------------
  const MAX_ENTRIES = 10;
  function recsOf(m) { if (!m.festivalRecords) m.festivalRecords = {}; return m.festivalRecords; }
  function cmp(a, b) {
    if (!!a.won !== !!b.won) return a.won ? -1 : 1;
    if (a.won && a.turns !== b.turns) return (a.turns || 0) - (b.turns || 0);
    if ((b.maxDamageOneTurn || 0) !== (a.maxDamageOneTurn || 0)) return (b.maxDamageOneTurn || 0) - (a.maxDamageOneTurn || 0);
    return (b.maxChain || 0) - (a.maxChain || 0);
  }
  function recordRun(e) {
    if (!e) return null;
    const f = e.festival || forId(e.festivalId);
    if (!f) return null;
    const entry = {
      date: e.date || new Date().toISOString(), won: !!e.won,
      turns: Number(e.turns) || 0, maxDamageOneTurn: Number(e.maxDamageOneTurn) || 0, maxChain: Number(e.maxChain) || 0,
      depth: e.depth == null ? null : Number(e.depth),
    };
    Store.update(function (m) {
      const all = recsOf(m);
      const slot = all[f.id] || (all[f.id] = { id: f.id, name: f.name, kind: f.kind, dateKey: f.dateKey, entries: [] });
      slot.name = f.name;
      slot.entries.push(entry);
      slot.entries.sort(cmp);
      if (slot.entries.length > MAX_ENTRIES) slot.entries.length = MAX_ENTRIES;
      slot.count = (slot.count || 0) + 1;
    });
    return entry;
  }
  function records(festivalId) {
    const slot = recsOf(Store.get())[festivalId];
    return slot ? slot.entries.slice() : [];
  }
  function best(festivalId) { const r = records(festivalId); return r.length ? r[0] : null; }
  function allRecords() {
    const all = recsOf(Store.get());
    return Object.keys(all).map(function (id) {
      const s = all[id];
      return { id: id, name: s.name, kind: s.kind, dateKey: s.dateKey, best: s.entries && s.entries.length ? s.entries[0] : null, count: s.count || (s.entries ? s.entries.length : 0) };
    }).sort(function (a, b) { return a.dateKey < b.dateKey ? 1 : a.dateKey > b.dateKey ? -1 : (a.kind === 'weekly' ? 1 : -1); });
  }

  G.Festival = {
    RULES: RULES, RULE_KEYS: RULE_KEYS, DOUBLE_RELIC: DOUBLE_RELIC,
    today: today, thisWeek: thisWeek, forId: forId, build: build,
    dateKeyOf: dateKeyOf, weekKeyOf: weekKeyOf, seedOf: function (id) { return fnv('kinki:' + id); },
    applyToGame: applyToGame, runOptions: runOptions, startDeckExtras: startDeckExtras, ensureRelics: ensureRelics,
    recordRun: recordRun, records: records, best: best, allRecords: allRecords,
  };
})(globalThis.G = globalThis.G || {});
