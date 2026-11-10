/* 禁域 — js/meta/meta.js
   G.Meta — hooks the run calls (docs/INTEGRATION_NOTES.md). Every hook is safe to call with or without G.Save.
   G.Meta.onRunStart({seed, packs, relic, depth, festival})
   G.Meta.onBattleStart(game, {enemyDef})            optional: live tracking of 1ターン最大ダメージ / card use (fallbacks exist)
   G.Meta.onCardObtained(defId) / onRelicObtained(relicId) / onDiaryFound(diaryId)
   G.Meta.onBattleEnd(result, {enemyDef, act, run})  → {won, newAchievements:[ids], diaryId|null, recordsChanged:[keys], battle:{...}}
   G.Meta.onRunEnd({won, run})                        → {won, lineage, newAchievements, newPacks, depthCleared, depthUnlocked, festivalEntry}
   G.Meta.pickDiary(rng)                              uncollected base fragment (for イベント 10%) | null
   G.Meta.runLineage(deckDefIds)                      most common lineage of a deck ('accel'…) | null
   G.Meta.unlockedPacks()                             ['gold','dual','taboo'] subset
   G.Meta.summary()                                   for the menu / records screens
   Pack unlocks (SPEC パックの解放): gold = first clear, dual = 3 lineages cleared, taboo = depth 5 cleared.
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

  const LINEAGES = ['accel', 'cycle', 'chain', 'time', 'copy', 'doom'];
  const PACKS = ['gold', 'dual', 'taboo'];
  const S = { run: null }; // in-memory context of the current run (not persisted; run state is the run agent's)

  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function safe(fn, fallback) { try { return fn(); } catch (e) { if (typeof console !== 'undefined' && console.warn) console.warn('[Meta]', e); return fallback; } }
  function deckIds(deck) {
    if (!Array.isArray(deck)) return [];
    return deck.map(function (c) { return typeof c === 'string' ? c : (c && (c.defId || c.id)); }).filter(Boolean);
  }
  function runDeck(run) { return deckIds(run && (run.deck || (run.state && run.state.deck))); }
  function runRelics(run) {
    const r = run && (run.relics || (run.state && run.state.relics));
    return Array.isArray(r) ? r.map(function (x) { return typeof x === 'string' ? x : (x && x.id); }).filter(Boolean) : [];
  }
  function runDepth(run, fallback) {
    if (run && run.depth != null) return num(run.depth);
    if (run && run.state && run.state.depth != null) return num(run.state.depth);
    if (S.run && S.run.depth != null) return S.run.depth;
    return fallback == null ? (G.Depth ? G.Depth.current() : 0) : fallback;
  }
  function runFestival(run) {
    const f = (run && (run.festival || (run.state && run.state.festival))) || (S.run && S.run.festival) || null;
    if (!f) return null;
    if (typeof f === 'string') return G.Festival && G.Festival.forId ? G.Festival.forId(f) : null;
    if (f.id && !f.rules && G.Festival && G.Festival.forId) return G.Festival.forId(f.id) || f;
    return f;
  }

  // ---- codex registrations ----
  function onCardObtained(defId) {
    if (!defId || !G.Codex) return false;
    return safe(function () { return G.Codex.register('cards', defId); }, false);
  }
  function onRelicObtained(relicId) {
    if (!relicId || !G.Codex) return false;
    return safe(function () {
      const def = G.RelicDB && G.RelicDB.tryGet ? G.RelicDB.tryGet(relicId) : null;
      if (def && (def.hidden || def.enemyOnly || def.category === 'hidden' || def.category === 'enemy')) return false;
      return G.Codex.register('relics', relicId);
    }, false);
  }
  function onDiaryFound(diaryId) {
    if (!diaryId || !G.Codex) return { fresh: false, text: null, secretUnlocked: false };
    return safe(function () {
      const fresh = G.Codex.register('diary', diaryId);
      const d = G.Texts && G.Texts.diaryById ? G.Texts.diaryById(diaryId) : null;
      return { fresh: fresh, id: diaryId, text: d ? d.text : null, day: d ? d.day : null, secretUnlocked: G.Codex.secretGraffitiUnlocked() };
    }, { fresh: false, text: null, secretUnlocked: false });
  }
  // An uncollected base fragment for イベント drops (SPEC: まだ持っていない切れ端だけが出る。全部そろうと出なくなる).
  function pickDiary(rng) {
    return safe(function () {
      const base = (G.Texts && G.Texts.diary) || [];
      const left = base.filter(function (d) { return !G.Codex.has('diary', d.id); });
      if (!left.length) return null;
      const i = rng && typeof rng.int === 'function' ? rng.int(left.length) : 0;
      return left[i].id;
    }, null);
  }

  // ---- lineage of a run = most common lineage in the final deck ----
  function runLineage(deck) {
    const ids = deckIds(deck);
    const count = {};
    ids.forEach(function (id) {
      let d = null; try { d = G.CardDB.tryGet ? G.CardDB.tryGet(id) : G.CardDB.get(id); } catch (e) { d = null; }
      const lin = d && d.lineage;
      if (lin && LINEAGES.indexOf(lin) >= 0) count[lin] = (count[lin] || 0) + 1;
    });
    let best = null;
    LINEAGES.forEach(function (l) { if (count[l] && (!best || count[l] > count[best])) best = l; });
    return best;
  }

  function unlockedPacks() {
    const m = Store.get();
    return Array.isArray(m.unlockedPacks) ? m.unlockedPacks.filter(function (p) { return PACKS.indexOf(p) >= 0; }) : [];
  }
  function computePackUnlocks(m) {
    const have = Array.isArray(m.unlockedPacks) ? m.unlockedPacks : (m.unlockedPacks = []);
    const fresh = [];
    function add(p) { if (have.indexOf(p) < 0) { have.push(p); fresh.push(p); } }
    if (num(m.runsCleared) >= 1) add('gold');
    const lins = Object.keys(m.lineageClears || {}).filter(function (k) { return num(m.lineageClears[k]) > 0; });
    if (lins.length >= 3) add('dual');
    if (num(m.maxDepthCleared) >= 5) add('taboo');
    return fresh;
  }

  // ---- hooks ----
  function onRunStart(info) {
    info = info || {};
    const depth = G.Depth ? G.Depth.clamp(info.depth == null ? G.Depth.current() : info.depth) : num(info.depth);
    const festival = info.festival ? (typeof info.festival === 'string' && G.Festival ? G.Festival.forId(info.festival) : info.festival) : null;
    S.run = { depth: depth, festival: festival, seed: info.seed, startedAt: new Date().toISOString(), packs: info.packs || [], relic: info.relic || null };
    // meta.depth (the selected depth) is owned by the depth picker (G.Depth.setCurrent); not touched here.
    Store.update(function (m) { m.runsStarted = num(m.runsStarted) + 1; });
    if (info.relic) onRelicObtained(typeof info.relic === 'string' ? info.relic : info.relic.id);
    return S.run;
  }

  function onBattleStart(game, info) {
    info = info || {};
    if (G.Records && typeof G.Records.attachGame === 'function') safe(function () { G.Records.attachGame(game, info.playerIdx == null ? 0 : info.playerIdx); });
    return true;
  }

  function onBattleEnd(result, info) {
    info = info || {};
    const out = { won: !!(result && result.won), newAchievements: [], diaryId: null, recordsChanged: [], battle: null };
    if (!result) return out;
    const game = result.game || info.game || null;
    const enemyDef = info.enemyDef || (game && game.players && game.players[1] && game.players[1].enemyDefId && G.EnemyDB && G.EnemyDB.tryGet ? G.EnemyDB.tryGet(game.players[1].enemyDefId) : null);
    // records (card use is counted per battle only when the game is available; otherwise once at run end
    // from run.stats.cardUse — never both)
    if (G.Records) safe(function () {
      const r = G.Records.updateFromBattle(result, { game: game, playerIdx: 0, skipCardUse: !game });
      out.recordsChanged = r.changed; out.battle = r.battle;
      if (game && r.battle && Object.keys(r.battle.cardUse || {}).length) { S.run = S.run || {}; S.run.cardUseCounted = true; }
    });
    if (out.won && enemyDef) {
      if (G.Codex) safe(function () { G.Codex.register('enemies', enemyDef.id); });
      const isBoss = !!(enemyDef.isBoss || enemyDef.kind === 'boss' || enemyDef.tier === 'boss');
      if (isBoss && enemyDef.diary) {
        const id = 'diary_' + enemyDef.id;
        const d = onDiaryFound(id);
        out.diaryId = id; out.diaryFresh = !!d.fresh; out.diaryText = enemyDef.diary;
      }
    }
    if (G.Achievements) safe(function () {
      const stats = Object.assign({}, (game && game.stats) || {}, result.stats || {}, out.battle || {});
      out.newAchievements = G.Achievements.evaluate({
        type: 'battle', result: result, game: game, stats: stats, enemyDef: enemyDef,
        isBoss: !!(enemyDef && (enemyDef.isBoss || enemyDef.kind === 'boss' || enemyDef.tier === 'boss')),
        run: info.run || null, act: info.act, playerIdx: 0,
      });
    });
    return out;
  }

  function onRunEnd(info) {
    info = info || {};
    const run = info.run || (G.Run && G.Run.state) || null;
    const won = !!info.won;
    const deck = runDeck(run);
    const relics = runRelics(run);
    const depth = runDepth(run);
    const festival = runFestival(run);
    const lineage = runLineage(deck);
    const out = { won: won, lineage: lineage, depth: depth, newAchievements: [], newPacks: [], depthCleared: false, depthUnlocked: null, festivalEntry: null };

    // codex: everything the deck ended with counts as obtained
    deck.forEach(onCardObtained);
    relics.forEach(onRelicObtained);

    Store.update(function (m) {
      m.lastRunDeck = deck.slice();
      if (won) {
        m.runsCleared = num(m.runsCleared) + 1;
        if (lineage) { m.lineageClears = m.lineageClears || {}; m.lineageClears[lineage] = num(m.lineageClears[lineage]) + 1; }
        if (!festival) {
          const prev = m.maxDepthCleared == null ? -1 : num(m.maxDepthCleared);
          if (depth > prev) { m.maxDepthCleared = depth; out.depthCleared = true; }
          // auto-advance the selected depth so the next run offers the new one
          if (G.Depth && depth >= num(m.depth) && depth < G.Depth.MAX) m.depth = depth + 1;
        }
      }
      out.newPacks = computePackUnlocks(m);
    });
    if (won && !festival && G.Records) safe(function () { G.Records.noteDepthCleared(depth); });
    // lifetime card / lineage use from the run's own counters (when battles were reported without a game)
    if (G.Records && !(S.run && S.run.cardUseCounted)) safe(function () {
      const st = (run && (run.stats || (run.state && run.state.stats))) || {};
      if (st.cardUse && typeof st.cardUse === 'object') G.Records.addCardUse(st.cardUse);
    });
    // lifetime bests from run-level stats too (covers battles reported without a game)
    if (G.Records) safe(function () {
      const st = (run && (run.stats || (run.state && run.state.stats))) || {};
      G.Records.updateFromBattle({ stats: { maxDamageOneTurn: st.maxDamageOneTurn, maxChain: st.maxChain, longestLoop: st.longestLoop } }, { skipCardUse: true });
    });
    if (G.Depth) out.depthUnlocked = G.Depth.unlocked();

    if (G.Achievements) safe(function () {
      out.newAchievements = G.Achievements.evaluate({ type: 'run', won: won, run: run, deck: deck, depth: depth, festival: festival });
    });
    if (festival && G.Festival) safe(function () {
      const st = (run && (run.stats || (run.state && run.state.stats))) || {};
      out.festivalEntry = G.Festival.recordRun({
        festival: festival, won: won,
        turns: num(st.turns || st.totalTurns || (run && run.turns)),
        maxDamageOneTurn: num(st.maxDamageOneTurn), maxChain: num(st.maxChain), depth: depth,
      });
    });
    S.run = null;
    return out;
  }

  function summary() {
    const m = Store.get();
    const comp = G.Codex ? safe(function () { return G.Codex.completion(); }, null) : null;
    return {
      depth: G.Depth ? G.Depth.current() : num(m.depth),
      depthUnlocked: G.Depth ? G.Depth.unlocked() : 0,
      maxDepthCleared: m.maxDepthCleared == null ? -1 : num(m.maxDepthCleared),
      runsStarted: num(m.runsStarted), runsCleared: num(m.runsCleared),
      lineageClears: Object.assign({}, m.lineageClears || {}),
      completion: comp ? comp.total.pct : 0,
      achievements: G.Achievements ? safe(function () { return G.Achievements.unlocked().length; }, 0) : 0,
      achievementsTotal: G.Achievements ? G.Achievements.DEFS.length : 0,
      titles: G.Achievements ? safe(function () { return G.Achievements.titles(); }, []) : [],
      unlockedPacks: unlockedPacks(),
      secretGraffiti: G.Codex ? safe(function () { return G.Codex.secretGraffitiUnlocked(); }, false) : false,
      festivalToday: G.Festival ? safe(function () { return G.Festival.today(); }, null) : null,
      lastRunDeck: Array.isArray(m.lastRunDeck) ? m.lastRunDeck.slice() : [],
    };
  }

  G.Meta = {
    onRunStart: onRunStart,
    onBattleStart: onBattleStart,
    onCardObtained: onCardObtained,
    onRelicObtained: onRelicObtained,
    onDiaryFound: onDiaryFound,
    onBattleEnd: onBattleEnd,
    onRunEnd: onRunEnd,
    pickDiary: pickDiary,
    runLineage: runLineage,
    unlockedPacks: unlockedPacks,
    summary: summary,
    current: function () { return S.run; },
    PACKS: PACKS,
  };
})(globalThis.G = globalThis.G || {});
