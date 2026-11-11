(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // tests/harness.js — tiny test framework + sandbox helpers.
  //   G.Test.test(name, async fn)   register a test
  //   G.Test.assert / eq / deepEq / throws / rejects
  //   G.Test.sandbox(cfg)            build a started game with given zones
  //   G.Test.loadAll()               require all logic files (Node only)
  //   G.Test.run()                   run registered tests → {passed, failed}
  // ---------------------------------------------------------------
  const path = typeof require === 'function' ? require('path') : null;
  const fs = typeof require === 'function' ? require('fs') : null;

  const Test = { tests: [], currentFile: null };

  Test.test = function (name, fn) { Test.tests.push({ name: name, fn: fn, file: Test.currentFile }); };

  function fail(msg) { const e = new Error(msg); e.isAssertion = true; throw e; }

  Test.assert = function (cond, msg) { if (!cond) fail(msg || 'assertion failed'); };
  Test.eq = function (actual, expected, msg) {
    if (actual !== expected) fail((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(expected) + ' but got ' + JSON.stringify(actual));
  };
  Test.neq = function (actual, expected, msg) {
    if (actual === expected) fail((msg ? msg + ': ' : '') + 'expected something other than ' + JSON.stringify(expected));
  };
  Test.deepEq = function (actual, expected, msg) {
    const a = JSON.stringify(actual), b = JSON.stringify(expected);
    if (a !== b) fail((msg ? msg + ': ' : '') + 'expected ' + b + ' but got ' + a);
  };
  Test.ok = Test.assert;
  Test.throws = function (fn, re, msg) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; if (re && !re.test(String(e.message))) fail((msg || '') + ' wrong error: ' + e.message); }
    if (!threw) fail(msg || 'expected function to throw');
  };
  Test.rejects = async function (p, re, msg) {
    let threw = false;
    try { await (typeof p === 'function' ? p() : p); } catch (e) { threw = true; if (re && !re.test(String(e.message))) fail((msg || '') + ' wrong error: ' + e.message); }
    if (!threw) fail(msg || 'expected promise to reject');
  };

  // Files in ARCHITECTURE §9 order (logic only, no ui). Missing files are tolerated.
  Test.LOGIC_FILES = [
    'js/core/util.js', 'js/core/events.js',
    'js/engine/defs.js', 'js/engine/fx.js', 'js/engine/state.js', 'js/engine/rules.js', 'js/engine/actions.js',
    'js/engine/play.js', 'js/engine/turn.js', 'js/engine/loop.js', 'js/engine/game.js',
    'js/data/cards_basic.js', 'js/data/cards_accel.js', 'js/data/cards_cycle.js', 'js/data/cards_copy.js', 'js/data/cards_chain.js',
    'js/data/cards_time.js', 'js/data/cards_doom.js', 'js/data/cards_generic.js', 'js/data/cards_boss.js', 'js/data/cards_ext.js', 'js/data/cards_dragon.js',
    'js/data/relics.js', 'js/data/_index.js', 'js/data/enemies.js', 'js/data/events.js', 'js/data/texts.js',
    'js/ai/chooser.js', 'js/ai/combos.js', 'js/ai/ai.js',
    'js/run/packs.js', 'js/run/map.js', 'js/run/shop.js', 'js/run/run.js', 'js/run/rewards.js',
    'js/meta/save.js', 'js/meta/codex.js', 'js/meta/achievements.js', 'js/meta/depth.js', 'js/meta/festival.js', 'js/meta/records.js', 'js/meta/meta.js'
  ];

  Test.root = function () { return path.resolve(__dirname, '..'); };

  Test.loadAll = function () {
    if (!path) throw new Error('loadAll only works in Node');
    const root = Test.root();
    const loaded = [], missing = [];
    Test.LOGIC_FILES.forEach(function (rel) {
      const abs = path.join(root, rel);
      if (fs.existsSync(abs)) { require(abs); loaded.push(rel); } else missing.push(rel);
    });
    return { loaded: loaded, missing: missing };
  };

  // ---- sandbox ----
  // cfg: { seed, field: defId, fieldOwner, first: 0|1, turn, options,
  //        p0: { hand:[defIds], board:[defIds|{id,damage,atk}], phantoms:[], crests:[], grave:[], deck:[], timed:[{id,count}],
  //              seals:[], exile:[], mana, maxMana, life, curse, relics:[], statuses:{}, chooser, chain },
  //        p1: {...} }
  // The game is started (coin toss fixed to cfg.first, default 0) with NO initial hand draw and NO turn-1 draw,
  // the active player's turn-1 mana set to cfg.pX.mana (default = maxMana or 10).
  Test.sandbox = async function (cfg) {
    cfg = cfg || {};
    const first = cfg.first != null ? cfg.first : 0;
    const game = G.Engine.createGame({
      seed: cfg.seed != null ? cfg.seed : 1,
      players: [
        { name: 'P0', deck: [], life: (cfg.p0 && cfg.p0.life) || 40, relics: (cfg.p0 && cfg.p0.relics) || [], chooser: cfg.p0 && cfg.p0.chooser, isAI: false },
        { name: 'P1', deck: [], life: (cfg.p1 && cfg.p1.life) || 40, relics: (cfg.p1 && cfg.p1.relics) || [], chooser: cfg.p1 && cfg.p1.chooser, isAI: true }
      ],
      field: null,
      options: Object.assign({ firstPlayer: first, initialHand: 0, noShuffle: true }, cfg.options || {})
    });
    function fill(idx, pc) {
      pc = pc || {};
      const p = game.players[idx];
      (pc.deck || []).forEach(function (id) { game.addCard(idx, id, 'deck'); });
      (pc.hand || []).forEach(function (id) { game.addCard(idx, id, 'hand'); });
      (pc.board || []).forEach(function (b) {
        const id = typeof b === 'string' ? b : b.id;
        const inst = game.addCard(idx, id, 'board', { damage: b.damage || 0 });
        if (typeof b === 'object') { if (b.atk != null) inst.atk = b.atk; if (b.hp != null) { inst.hp = b.hp; inst.maxHp = b.hp; } if (b.summonedTurn != null) inst.summonedTurn = b.summonedTurn; if (b.attacksLeft != null) inst.attacksLeft = b.attacksLeft; }
      });
      (pc.phantoms || []).forEach(function (id) { game.addCard(idx, id, 'phantoms', { isPhantom: true, isCopy: true }); });
      (pc.crests || []).forEach(function (id) { game.addCard(idx, id, 'crests'); });
      (pc.grave || []).forEach(function (id) { game.addCard(idx, id, 'grave'); });
      (pc.exile || []).forEach(function (id) { game.addCard(idx, id, 'exile'); });
      (pc.seals || []).forEach(function (id) { game.addCard(idx, id, 'seals'); });
      (pc.timed || []).forEach(function (t) { game.addCard(idx, typeof t === 'string' ? t : t.id, 'timed', { timedCount: typeof t === 'string' ? undefined : t.count }); });
      if (pc.curse != null) p.curse = pc.curse;
      if (pc.curseLimit != null) p.curseLimit = pc.curseLimit;
      if (pc.statuses) Object.keys(pc.statuses).forEach(function (k) { game.setStatus(idx, k, pc.statuses[k]); });
      if (pc.hazardTests) p.hazardTests = pc.hazardTests;
      if (pc.flags) Object.assign(p.flags, pc.flags);
    }
    fill(0, cfg.p0); fill(1, cfg.p1);
    if (cfg.field) {
      const owner = cfg.fieldOwner != null ? cfg.fieldOwner : 0;
      const f = game.createCardInst(cfg.field, owner);
      game.placeInZone(f, owner, 'field');
    }
    // start: no hands (initialHand 0); beginTurn gives first player maxMana 1 and no draw
    await game.start();
    // Apply requested mana / life after start so sandbox values win.
    [0, 1].forEach(function (idx) {
      const pc = (idx === 0 ? cfg.p0 : cfg.p1) || {};
      const p = game.players[idx];
      const maxMana = pc.maxMana != null ? pc.maxMana : Math.max(10, pc.mana || 0);
      p.maxMana = maxMana;
      p.mana = idx === game.active ? (pc.mana != null ? pc.mana : maxMana) : 0;
      if (pc.chain != null) p.chain = pc.chain;
      if (pc.life != null) { p.life = pc.life; p.maxLife = Math.max(p.maxLife, pc.life); }
    });
    if (cfg.turn != null) game.turn = cfg.turn;
    game.monstersOf(game.active).forEach(function (m) { m.attacksLeft = game.attacksPerTurn(m); });
    game.loop.history = [];
    return game;
  };

  // Chooser that always picks the LAST candidate (useful to test pick plumbing).
  Test.lastChooser = function (spec, cands) {
    if (spec.kind === 'option') return cands[cands.length - 1].id;
    const n = spec.count || 1;
    return cands.slice(Math.max(0, cands.length - n));
  };
  // Chooser driven by a queue of functions: pickers.shift()(spec, cands) each call; falls back to default.
  Test.scriptedChooser = function (steps) {
    return function (spec, cands, game, ctx) {
      const s = steps.shift();
      if (s) return s(spec, cands, game, ctx);
      return G.Engine.defaultChooser(spec, cands, game);
    };
  };
  // Collect emitted events of the given types: const ev = Test.record(game, ['damage']); ... ev.list
  Test.record = function (game, types) {
    const rec = { list: [] };
    game.on('*', function (payload, type) { if (!types || types.indexOf(type) >= 0) rec.list.push({ type: type, payload: payload }); });
    rec.count = function (type) { return rec.list.filter(function (e) { return e.type === type; }).length; };
    rec.last = function (type) { const l = rec.list.filter(function (e) { return e.type === type; }); return l.length ? l[l.length - 1].payload : null; };
    return rec;
  };
  Test.names = function (arr) { return arr.map(function (c) { return c.defId; }); };

  Test.run = async function (opts) {
    opts = opts || {};
    const filter = opts.filter || null;
    let passed = 0, failed = 0;
    const failures = [];
    for (let i = 0; i < Test.tests.length; i++) {
      const t = Test.tests[i];
      if (filter && t.name.indexOf(filter) < 0 && (!t.file || t.file.indexOf(filter) < 0)) continue;
      let timer = null;
      try {
        const tm = new Promise(function (_, rej) { timer = setTimeout(function () { rej(new Error('timeout (' + (opts.timeoutMs || 10000) + 'ms)')); }, opts.timeoutMs || 10000); });
        await Promise.race([Promise.resolve().then(t.fn), tm]);
        clearTimeout(timer);
        passed++;
        if (opts.verbose) console.log('  ok   ' + t.name);
      } catch (e) {
        if (timer) clearTimeout(timer);
        failed++;
        failures.push({ name: t.name, file: t.file, error: e });
        console.log('  FAIL ' + (t.file ? '[' + t.file + '] ' : '') + t.name + '\n       ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n       ') : e));
      }
    }
    return { passed: passed, failed: failed, failures: failures };
  };

  G.Test = Test;
  if (typeof module !== 'undefined' && module.exports) module.exports = Test;
})(globalThis.G = globalThis.G || {});
