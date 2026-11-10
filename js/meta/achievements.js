/* 禁域 — js/meta/achievements.js
   挑戦（実績） (SPEC 挑戦). Eight challenges + the depth-10 title.
   G.Achievements.list()                 [{id, name, title, description, kind:'battle'|'run', check(ctx), unlockedAt}]
   G.Achievements.unlocked()             [{id, ..., unlockedAt}]
   G.Achievements.isUnlocked(id)
   G.Achievements.award(id, when?)       → true if newly awarded
   G.Achievements.evaluate(ctx)          runs every check against ctx, awards matches → [ids newly awarded]
   G.Achievements.titles()               unlocked 称号 strings
   ctx shapes (built by G.Meta):
     battle: { type:'battle', result, game, stats, enemyDef, isBoss, run, playerIdx:0 }
     run:    { type:'run', won, run, deck:[defIds], depth }
   Each check is defensive: missing fields → false, never throws.
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

  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function stat(ctx, key) {
    if (!ctx) return 0;
    const s = ctx.stats || (ctx.result && ctx.result.stats) || (ctx.game && ctx.game.stats) || {};
    return num(s[key]);
  }
  function won(ctx) { return !!(ctx && (ctx.result ? ctx.result.won : ctx.won)); }
  function reason(ctx) { return (ctx && ctx.result && ctx.result.reason) || (ctx && ctx.game && ctx.game.winReason) || null; }
  function isBoss(ctx) {
    if (!ctx) return false;
    if (ctx.isBoss) return true;
    const e = ctx.enemyDef;
    return !!(e && (e.isBoss || e.kind === 'boss' || e.tier === 'boss'));
  }
  function player(ctx) { return ctx && ctx.game && ctx.game.players ? ctx.game.players[ctx.playerIdx || 0] : null; }
  function enemy(ctx) { return ctx && ctx.game && ctx.game.players ? ctx.game.players[1 - (ctx.playerIdx || 0)] : null; }
  function defName(defId) {
    try { const d = G.CardDB.get(defId); return d ? d.name : ''; } catch (e) { return ''; }
  }
  function allInsts(p) {
    if (!p) return [];
    const zones = ['deck', 'hand', 'board', 'phantoms', 'crests', 'grave', 'exile', 'timed', 'seals', 'vault'];
    let out = [];
    zones.forEach(function (z) { if (Array.isArray(p[z])) out = out.concat(p[z]); });
    if (Array.isArray(p.reserves)) p.reserves.forEach(function (r) { if (r && r.card) out.push(r.card); });
    return out;
  }
  function deckOf(ctx) {
    if (!ctx) return [];
    if (Array.isArray(ctx.deck)) return ctx.deck;
    const r = ctx.run;
    if (r && Array.isArray(r.deck)) return r.deck.map(function (c) { return typeof c === 'string' ? c : (c && (c.defId || c.id)); }).filter(Boolean);
    return [];
  }
  function flag(ctx, names) {
    const srcs = [ctx && ctx.stats, ctx && ctx.result && ctx.result.stats, ctx && ctx.result, ctx && ctx.run && ctx.run.flags, ctx && ctx.run];
    for (let i = 0; i < srcs.length; i++) {
      const s = srcs[i]; if (!s) continue;
      for (let j = 0; j < names.length; j++) if (s[names[j]]) return s[names[j]];
    }
    return null;
  }

  const DEFS = [
    { id: 'ach_hundred_damage', name: '1ターンで100ダメージを与える', title: '百雷', kind: 'battle',
      description: '自分の1ターンの合計ダメージが100以上になる。',
      check: function (ctx) { return ctx.type === 'battle' && stat(ctx, 'maxDamageOneTurn') >= 100; } },

    { id: 'ach_chain_50', name: '連鎖数50を達成する', title: '嵐を呼ぶ者', kind: 'battle',
      description: '1ターンに50枚のカードを使う。',
      check: function (ctx) {
        if (ctx.type !== 'battle') return false;
        const p = player(ctx);
        const mine = p && p.stats ? num(p.stats.maxChain) : 0;
        return Math.max(mine, mine ? 0 : stat(ctx, 'maxChain')) >= 50;
      } },

    { id: 'ach_infinite_loop', name: '無限ループで勝利する', title: '永久機関', kind: 'battle',
      description: '止められない無限ループ（∞）で決着をつける。',
      check: function (ctx) { return ctx.type === 'battle' && won(ctx) && reason(ctx) === 'loopInfinite'; } },

    { id: 'ach_special_win_boss', name: '特殊勝利でボスを倒す', title: '封印の主', kind: 'battle',
      description: '封印の鍵5種、または預言でボスに勝つ。',
      check: function (ctx) {
        if (ctx.type !== 'battle' || !won(ctx) || !isBoss(ctx)) return false;
        const r = reason(ctx);
        return r === 'seals' || r === 'prophecy' || r === 'special';
      } },

    { id: 'ach_mirror_return', name: '全反転の大鏡で、ボスの決着コンボを返して勝つ', title: '鏡返し', kind: 'battle',
      description: 'ボスのターン中、全反転の大鏡の効果でボスが自滅する。',
      check: function (ctx) {
        if (ctx.type !== 'battle' || !won(ctx) || !isBoss(ctx)) return false;
        if (flag(ctx, ['mirrorReturnWin', 'mirrorReturn'])) return true;
        const g = ctx.game; if (!g) return false;
        const me = ctx.playerIdx || 0;
        if (g.active !== 1 - me) return false;            // the kill happened on the boss's turn
        try { return !!g.status(1 - me, 'invertEffects'); } catch (e) { return false; }
      } },

    { id: 'ach_unreflected', name: '鏡の主を、自分の前のターンを映される前に倒す', title: '映らぬ者', kind: 'battle',
      description: '鏡の主が《鏡像の写し》を一度も使う前に倒す。',
      check: function (ctx) {
        if (ctx.type !== 'battle' || !won(ctx)) return false;
        const e = ctx.enemyDef;
        const isMirror = e && (e.id === 'boss_mirror_lord' || /mirror/.test(e.id || '') || e.name === '鏡の主');
        if (!isMirror) return false;
        if (flag(ctx, ['mirrorBeatenBeforeReflect', 'beatenBeforeReflect'])) return true;
        const en = enemy(ctx); if (!en) return false;
        const insts = allInsts(en).filter(function (c) { return defName(c.defId) === '鏡像の写し'; });
        if (!insts.length) return false;                   // no copy in the deck at all → cannot judge
        return insts.every(function (c) { return c.zone === 'deck' || c.zone === 'hand'; });
      } },

    { id: 'ach_taboo_collector', name: '禁忌カードを3枚持った状態でランをクリアする', title: '禁忌の蒐集家', kind: 'run',
      description: 'デッキに禁忌カードを3枚以上入れたままランをクリアする。',
      check: function (ctx) {
        if (ctx.type !== 'run' || !won(ctx)) return false;
        const deck = deckOf(ctx);
        let n = 0;
        deck.forEach(function (id) { try { const d = G.CardDB.get(id); if (d && d.rarity === 'taboo') n++; } catch (e) { /* ignore */ } });
        return n >= 3;
      } },

    { id: 'ach_entrusted', name: '壁の落書きで受け取ったカードを使って勝つ', title: '託された者', kind: 'battle',
      description: '前の挑戦者（自分）が壁に残したカードを、戦闘で使って勝つ。',
      check: function (ctx) {
        if (ctx.type !== 'battle' || !won(ctx)) return false;
        const got = flag(ctx, ['graffitiReceived', 'receivedGraffitiCard', 'graffitiCardReceived', 'entrustedCard']);
        if (!got) return false;
        const ids = Array.isArray(got) ? got : [got];
        const p = player(ctx); if (!p) return false;
        return allInsts(p).some(function (c) {
          return ids.indexOf(c.defId) >= 0 && c.zone !== 'deck' && c.zone !== 'hand';
        });
      } },

    { id: 'ach_depth_10', name: '深度10をクリアする', title: '禁域を越えた者', kind: 'run',
      description: 'すべての条件を背負ったまま、ランをクリアする。',
      check: function (ctx) { return ctx.type === 'run' && won(ctx) && num(ctx.depth) >= 10; } },
  ];

  function achMap(m) { if (!m.achievements) m.achievements = {}; return m.achievements; }
  function isUnlocked(id) { return !!achMap(Store.get())[id]; }
  function award(id, when) {
    if (!DEFS.some(function (d) { return d.id === id; })) return false;
    let fresh = false;
    Store.update(function (m) {
      const a = achMap(m);
      if (!a[id]) { a[id] = when || new Date().toISOString(); fresh = true; }
    });
    return fresh;
  }
  function list() {
    const a = achMap(Store.get());
    return DEFS.map(function (d) { return Object.assign({}, d, { unlockedAt: a[d.id] || null }); });
  }
  function unlocked() { return list().filter(function (d) { return !!d.unlockedAt; }); }
  function titles() { return unlocked().map(function (d) { return d.title; }); }
  function evaluate(ctx) {
    const out = [];
    if (!ctx) return out;
    DEFS.forEach(function (d) {
      let ok = false;
      try { ok = !!d.check(ctx); } catch (e) { ok = false; }
      if (ok && award(d.id)) out.push(d.id);
    });
    return out;
  }
  function get(id) { return list().find(function (d) { return d.id === id; }) || null; }

  G.Achievements = { DEFS: DEFS, list: list, get: get, unlocked: unlocked, isUnlocked: isUnlocked, award: award, evaluate: evaluate, titles: titles };
})(globalThis.G = globalThis.G || {});
