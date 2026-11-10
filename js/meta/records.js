/* 禁域 — js/meta/records.js
   自分の記録 (SPEC 自分の記録): per-player best records.
   G.Records.get()                       {maxDamageOneTurn, maxChain, longestLoop, maxDepth, lineageUse:{}, cardUse:{}}
   G.Records.updateFromBattle(result, {game, playerIdx})  → {changed:[keys], battle:{maxDamageOneTurn, maxChain, longestLoop, cardUse}}
   G.Records.noteDepthCleared(depth)
   G.Records.topCards(n)                 [{defId, count, def}]
   G.Records.topLineage()                {lineage, count} | null
   G.Records.summary()                   display-ready rows [{key, label, value, sub?}]
   Battle statistics helpers (also used by G.Meta):
   G.Records.attachGame(game, playerIdx) subscribes to 'damage' / 'cardPlayed' events and keeps
                                         game.stats.maxDamageOneTurn / game.stats.cardUse[pIdx] up to date
   G.Records.battleStats(result, {game, playerIdx})  derives {maxDamageOneTurn, maxChain, longestLoop, cardUse}
                                         from attached counters, else from game.log / zones (fallback)
   Note: the engine itself tracks only `maxDamageDealtOnce` (single hit) and `stats.maxChain/longestLoop`;
   maxDamageOneTurn is computed here (see docs/DEVIATIONS.md "Meta").
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
  function recOf(m) {
    if (!m.records) m.records = {};
    const r = m.records;
    if (r.maxDamageOneTurn == null) r.maxDamageOneTurn = 0;
    if (r.maxChain == null) r.maxChain = 0;
    if (r.longestLoop == null) r.longestLoop = 0;
    if (r.maxDepth == null) r.maxDepth = -1;
    if (!r.lineageUse) r.lineageUse = {};
    if (!r.cardUse) r.cardUse = {};
    return r;
  }
  function get() { return recOf(Store.get()); }

  // ---- live tracking -------------------------------------------------------
  function attachGame(game, playerIdx) {
    if (!game || typeof game.on !== 'function') return false;
    const me = playerIdx == null ? 0 : playerIdx;
    if (!game.stats) game.stats = {};
    const st = game.stats;
    if (st._metaAttached) return true;
    st._metaAttached = true;
    if (st.maxDamageOneTurn == null) st.maxDamageOneTurn = 0;
    if (!st.cardUse) st.cardUse = {};
    if (!st.cardUse[me]) st.cardUse[me] = {};
    let turnKey = null, turnDmg = 0;
    game.on('damage', function (ev) {
      if (!ev || ev.sourceOwner !== me || ev.target !== 'player' || ev.who !== 1 - me) return;
      const key = game.turn;
      if (key !== turnKey) { turnKey = key; turnDmg = 0; }
      turnDmg += num(ev.amount);
      if (turnDmg > st.maxDamageOneTurn) st.maxDamageOneTurn = turnDmg;
    });
    game.on('cardPlayed', function (ev) {
      if (!ev || ev.who !== me || ev.isCopy) return;
      const u = st.cardUse[me];
      u[ev.defId] = (u[ev.defId] || 0) + 1;
    });
    return true;
  }

  // Fallback: parse the capped battle log for 「<enemy>にNダメージ（残り…）」 lines grouped by turn.
  function damageFromLog(game, me) {
    if (!game || !Array.isArray(game.log)) return 0;
    const enemy = game.players && game.players[1 - me];
    const ename = enemy ? enemy.name : null;
    const perTurn = {};
    const re = /^(.+?)に(\d+)ダメージ（残り/;
    game.log.forEach(function (e) {
      if (!e || typeof e.msg !== 'string' || e.who !== me) return;
      const mt = re.exec(e.msg);
      if (!mt) return;
      if (ename && mt[1] !== ename) return;
      perTurn[e.turn] = (perTurn[e.turn] || 0) + num(mt[2]);
    });
    let best = 0;
    Object.keys(perTurn).forEach(function (k) { if (perTurn[k] > best) best = perTurn[k]; });
    return best;
  }
  // Fallback: cards that left the player's deck/hand count as "used" once each.
  function cardUseFromZones(game, me) {
    const out = {};
    const p = game && game.players && game.players[me];
    if (!p) return out;
    ['board', 'crests', 'grave', 'exile', 'timed', 'seals'].forEach(function (z) {
      (p[z] || []).forEach(function (c) { if (c && !c.isCopy && !c.isPhantom && c.defId) out[c.defId] = (out[c.defId] || 0) + 1; });
    });
    (p.reserves || []).forEach(function (r) { if (r && r.card && r.card.defId) out[r.card.defId] = (out[r.card.defId] || 0) + 1; });
    if (game.field && game.field.owner === me && game.field.defId) out[game.field.defId] = (out[game.field.defId] || 0) + 1;
    return out;
  }

  function battleStats(result, opts) {
    opts = opts || {};
    const game = opts.game || (result && result.game) || null;
    const me = opts.playerIdx == null ? 0 : opts.playerIdx;
    const rs = (result && result.stats) || (game && game.stats) || {};
    const p = game && game.players ? game.players[me] : null;
    let maxDamageOneTurn = num(rs.maxDamageOneTurn);
    if (!maxDamageOneTurn && game && game.stats && game.stats._metaAttached) maxDamageOneTurn = num(game.stats.maxDamageOneTurn);
    if (!maxDamageOneTurn) maxDamageOneTurn = damageFromLog(game, me);
    if (!maxDamageOneTurn && p) maxDamageOneTurn = num(p.maxDamageDealtOnce); // single hit is a lower bound
    const maxChain = p && p.stats && p.stats.maxChain != null ? num(p.stats.maxChain) : num(rs.maxChain);
    const longestLoop = num(rs.longestLoop || (game && game.stats && game.stats.longestLoop));
    let cardUse = null;
    if (game && game.stats && game.stats.cardUse && game.stats.cardUse[me] && Object.keys(game.stats.cardUse[me]).length) cardUse = game.stats.cardUse[me];
    else if (rs.cardUse && !Array.isArray(rs.cardUse) && Object.keys(rs.cardUse).length && typeof Object.values(rs.cardUse)[0] === 'number') cardUse = rs.cardUse;
    else cardUse = cardUseFromZones(game, me);
    return { maxDamageOneTurn: maxDamageOneTurn, maxChain: maxChain, longestLoop: longestLoop, cardUse: cardUse };
  }

  function lineageOf(defId) {
    try { const d = G.CardDB.get(defId); return d ? (d.lineage || 'generic') : null; } catch (e) { return null; }
  }

  function addUse(r, map) {
    let added = 0;
    Object.keys(map || {}).forEach(function (id) {
      const n = num(map[id]); if (n <= 0) return;
      r.cardUse[id] = (r.cardUse[id] || 0) + n;
      const lin = lineageOf(id);
      if (lin && lin !== 'generic') r.lineageUse[lin] = (r.lineageUse[lin] || 0) + n;
      added += n;
    });
    return added;
  }
  // Add a {defId: count} map (e.g. the run's cumulative card use) to the lifetime counters.
  function addCardUse(map) {
    let added = 0;
    Store.update(function (m) { added = addUse(recOf(m), map); });
    return added;
  }

  function updateFromBattle(result, opts) {
    opts = opts || {};
    const b = battleStats(result, opts);
    const changed = [];
    Store.update(function (m) {
      const r = recOf(m);
      if (b.maxDamageOneTurn > r.maxDamageOneTurn) { r.maxDamageOneTurn = b.maxDamageOneTurn; changed.push('maxDamageOneTurn'); }
      if (b.maxChain > r.maxChain) { r.maxChain = b.maxChain; changed.push('maxChain'); }
      if (b.longestLoop > r.longestLoop) { r.longestLoop = b.longestLoop; changed.push('longestLoop'); }
      if (!opts.skipCardUse && addUse(r, b.cardUse)) changed.push('cardUse');
    });
    return { changed: changed, battle: b };
  }

  function noteDepthCleared(depth) {
    const d = num(depth);
    let changed = false;
    Store.update(function (m) {
      const r = recOf(m);
      if (d > r.maxDepth) { r.maxDepth = d; changed = true; }
    });
    return changed;
  }

  function topCards(n) {
    const r = get();
    const rows = Object.keys(r.cardUse).map(function (id) {
      let def = null; try { def = G.CardDB.tryGet ? G.CardDB.tryGet(id) : G.CardDB.get(id); } catch (e) { def = null; }
      return { defId: id, count: num(r.cardUse[id]), def: def };
    }).filter(function (x) { return x.count > 0; });
    rows.sort(function (a, b) { return b.count - a.count || (a.defId < b.defId ? -1 : 1); });
    return rows.slice(0, n == null ? 5 : n);
  }
  function topLineage() {
    const r = get();
    let best = null;
    Object.keys(r.lineageUse).forEach(function (k) {
      const c = num(r.lineageUse[k]);
      if (c > 0 && (!best || c > best.count)) best = { lineage: k, count: c };
    });
    return best;
  }

  // The save's default records.maxDepth is 0, so "depth 0 cleared" is told apart by meta.maxDepthCleared / runsCleared.
  function maxDepthShown(r) {
    const m = Store.get();
    const mc = m.maxDepthCleared == null ? -1 : num(m.maxDepthCleared);
    if (mc >= 0) return Math.max(mc, num(r.maxDepth));
    if (num(m.runsCleared) > 0) return num(r.maxDepth);
    return null;
  }
  const LIN_JP = { accel: '加速', cycle: '循環', chain: '連鎖', time: '時間', copy: '複製', doom: '終焉', generic: '汎用' };
  function summary() {
    const r = get();
    const top = topCards(1)[0] || null;
    const lin = topLineage();
    return [
      { key: 'maxDamageOneTurn', label: '1ターンの最大ダメージ', value: r.maxDamageOneTurn },
      { key: 'maxChain', label: '最大連鎖数', value: r.maxChain },
      { key: 'longestLoop', label: '一番長く回したループ', value: r.longestLoop, unit: '周' },
      { key: 'maxDepth', label: '最高クリア深度', value: maxDepthShown(r), empty: '未クリア' },
      { key: 'lineageUse', label: '一番多く使った系統', value: lin ? (LIN_JP[lin.lineage] || lin.lineage) : null, sub: lin ? lin.count + '回' : null, lineage: lin ? lin.lineage : null, empty: '—' },
      { key: 'cardUse', label: '一番多く使ったカード', value: top ? (top.def ? top.def.name : top.defId) : null, sub: top ? top.count + '回' : null, defId: top ? top.defId : null, empty: '—' },
    ];
  }

  G.Records = {
    get: get,
    attachGame: attachGame,
    battleStats: battleStats,
    updateFromBattle: updateFromBattle,
    addCardUse: addCardUse,
    noteDepthCleared: noteDepthCleared,
    topCards: topCards,
    topLineage: topLineage,
    summary: summary,
    LIN_JP: LIN_JP,
  };
})(globalThis.G = globalThis.G || {});
