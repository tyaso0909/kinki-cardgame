'use strict';
// tests/run_sim.test.js — headless full-run simulation driving G.Run without UI.
// Packs auto-chosen, map walked randomly, events resolved with the first available option,
// every battle fought AI vs AI (human side: makeChooser('assemble')), rewards taken.
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  if (!G.Run || !G.AI || !G.CardDB.has('accel_01') || !G.EnemyDB.has('boss_mirror_lord')) return;
  G.AI.quiet = true; G.Run.quiet = true;

  function check(st, where) {
    ok(st.deck.length >= 20, where + ': deck >= 20 (' + st.deck.length + ')');
    ok(st.gold >= 0, where + ': gold >= 0');
    ok(st.life >= 0 && st.life <= st.maxLife, where + ': life in range');
    ok(st.deck.every(function (id) { return G.CardDB.has(id) && !G.CardDB.get(id).bossOnly; }), where + ': deck ids valid, no bossOnly');
    ok(st.relics.every(function (id) { return G.RelicDB.has(id); }), where + ': relic ids valid');
    ok(['packopen', 'map', 'battle', 'reward', 'shop', 'event', 'rest', 'runend'].indexOf(st.phase) >= 0, where + ': phase ' + st.phase);
  }

  // Drives a run to its end (or until `maxSteps`). Returns { summary, reachedAct3Boss, battles, log }
  async function simulate(seed, opts) {
    opts = opts || {};
    const rng = new G.RNG(seed * 7919 + 13);
    const log = [];
    let reachedAct3Boss = false, battles = 0;
    try { G.Save.clearRun(); } catch (e) { /* ignore */ }
    let screen = G.Run.startNew({ seed: seed, depth: opts.depth || 0, festival: opts.festival || null });
    eq(screen, 'packopen');
    if (opts.godMode) { G.Run.state.maxLife = 999; G.Run.state.life = 999; }
    // packs
    for (let i = 0; i < 6; i++) {
      const offer = G.Run.packOffer(); ok(offer.length >= 1 && offer.length <= 3, 'pack offer size');
      const r = G.Run.openChosenPack(rng.pick(offer));
      eq(r.cards.length, 5, 'pack gives 5 cards');
    }
    eq(G.Run.state.deck.length, 30 + ((opts.festival && opts.festival.rules && opts.festival.rules.startTaboo) ? 1 : 0), 'initial deck 30');
    ok(G.Packs.hasFinisher(G.Run.state.deck), 'finisher present after 6 packs');
    const relics = G.Run.relicOffer(); eq(relics.length, 3, 'starter relic offer');
    screen = G.Run.chooseStarterRelic(rng.pick(relics));
    eq(screen, 'map');
    let steps = 0, summary = null;
    while (steps++ < (opts.maxSteps || 400)) {
      const st = G.Run.state;
      check(st, 'step ' + steps + ' (' + screen + ')');
      eq(G.Run.nextScreen(), screen, 'nextScreen agrees with returned screen');
      if (screen === 'map') {
        const avail = G.Run.availableNodes(); ok(avail.length > 0, 'map has available nodes');
        avail.forEach(function (id) { const info = G.Run.nodeInfo(id); ok(info.label, 'node info label'); });
        screen = G.Run.goTo(rng.pick(avail));
        log.push(G.Run.currentNode().type);
      } else if (screen === 'battle') {
        const pb = G.Run.pendingBattle(); ok(pb && pb.enemyId, 'pending battle');
        if (pb.boss && st.act === 3) reachedAct3Boss = true;
        const b = G.Run.beginBattle(pb.enemyId, { turnLimit: 60 });
        const game = b.game; ok(game && b.enemyDef, 'beginBattle returns game + enemyDef');
        eq(game.players[0].name, 'あなた');
        game.players[0].chooser = G.AI.makeChooser('assemble');
        await game.start();
        let guard = 0;
        while (game.winner === null && game.phase !== 'over' && guard++ < 200) await G.AI.takeTurn(game, game.active, { style: game.active === 0 ? 'assemble' : undefined });
        if (opts.godMode) { game.players[0].life = Math.max(game.players[0].life, 500); if (game.winner === 1) { game.winner = 0; game.winReason = 'life'; } if (game.winner === null) { game.winner = 0; game.winReason = 'life'; } }
        const result = { won: game.winner === 0, winner: game.winner, reason: game.winReason, turns: game.turn, stats: game.stats, game: game };
        battles++;
        screen = G.Run.finishBattle(result);
        log.push(result.won ? 'win' : 'lose:' + result.reason);
      } else if (screen === 'reward') {
        const r = G.Run.reward(); ok(r, 'reward present');
        ok(typeof r.gold === 'number' && r.gold >= 0, 'reward gold');
        G.Run.takeRewardGold();
        if (r.cards) { eq(r.cards.length, 3 + (G.Run.runEffects().rewardChoices || 0), 'card choices'); G.Run.takeRewardCard(r.cards[0]); }
        if (r.packs) { ok(r.packs.length >= 1, 'pack choices'); G.Run.takeRewardPack(r.packs[0]); }
        if (r.relic) G.Run.takeRewardRelic();
        if (r.bossRelics) { ok(r.bossRelics.length === 3, 'boss relic 3 choices'); G.Run.takeBossRelic(r.bossRelics[0]); }
        if (r.taboo) { ok(r.taboo.length >= 3, 'taboo choices'); G.Run.takeTaboo(r.taboo[0]); }
        if (r.auxCard) G.Run.takeAux(true);
        screen = G.Run.finishReward();
      } else if (screen === 'shop') {
        const sh = G.Run.shop(); ok(sh && sh.cards.length === 6, 'shop has 6 cards');
        const idx = sh.cards.findIndex(function (c) { return !c.sold && c.price <= st.gold; });
        if (idx >= 0) ok(G.Shop.buyCard(st, sh, idx).ok, 'buy card');
        if (G.Shop.canSell(st, sh)) ok(G.Shop.sell(st, sh, st.deck[0]).ok, 'sell card');
        const pk = sh.packs.findIndex(function (p) { return !p.sold && p.price <= st.gold; });
        if (pk >= 0) ok(G.Shop.buyPack(st, sh, pk, rng).ok, 'buy pack');
        screen = G.Run.leaveShop();
      } else if (screen === 'rest') {
        const o = G.Run.restOptions();
        screen = o.canHeal ? G.Run.rest('heal') : o.canRemove ? G.Run.rest('remove', st.deck[0]) : G.Run.rest('skip');
      } else if (screen === 'event') {
        const ev = G.Run.event(); ok(ev, 'event present');
        let guard = 0, res = null;
        do {
          const opts2 = G.Run.eventOptions();
          if (!ev.def) { res = G.Run.resolveEvent(0); break; }
          const first = opts2.find(function (o) { return o.available; }); ok(first, 'event has an available option: ' + ev.def.id);
          const choice = G.Events.firstChoice(st, ev.def.id, first.index);
          res = G.Run.resolveEvent(first.index, choice);
          ok(typeof res.text === 'string', 'event result text');
        } while (res.again && guard++ < 5);
        log.push('event:' + (ev.def ? ev.def.id : 'none'));
        screen = res.next === 'battle' ? 'battle' : G.Run.leaveEvent();
      } else if (screen === 'runend') {
        const end = G.Run.pendingEnd(); ok(end, 'pending end');
        summary = G.Run.endRun();
        ok(summary && typeof summary.won === 'boolean', 'summary');
        eq(G.Run.state, null, 'state cleared after endRun');
        break;
      } else throw new Error('unknown screen ' + screen);
    }
    ok(summary, 'run ended within step budget (seed ' + seed + ') log: ' + log.slice(-10).join(' '));
    return { summary: summary, reachedAct3Boss: reachedAct3Boss, battles: battles, log: log };
  }

  test('headless full-run simulation: 5 seeds, no throw, consistent state (losses allowed)', async () => {
    for (let seed = 1; seed <= 5; seed++) {
      const r = await simulate(seed, {});
      ok(r.battles >= 1, 'seed ' + seed + ' fought at least one battle');
      if (process.env.SIM_LOG) console.log('seed', seed, 'battles', r.battles, 'won', r.summary.won, 'act', r.summary.act, r.log.join(' '));
      ok(!G.Save.hasRun(), 'run save cleared');
    }
  });

  test('headless simulation (god mode life): reaches and clears the act-3 boss 鏡の主', async () => {
    const r = await simulate(42, { godMode: true, maxSteps: 400 });
    ok(r.reachedAct3Boss, 'reached act-3 boss; log: ' + r.log.join(' '));
    eq(r.summary.won, true, 'run cleared');
    eq(r.summary.act, 3);
    const m = G.Save.meta();
    ok(m.unlockedPacks.indexOf('gold') >= 0 || G.Meta, '黄金パック unlocked on first clear (when no meta module)');
    ok(m.lastRunDeck.length >= 20 || G.Meta, 'lastRunDeck recorded');
  });

  test('festival rules: allChaosPacks / startTaboo / allCostZero / doubleLife run without throwing', async () => {
    const fest = { id: 'test', name: 'テスト祭', seed: 99, rules: { allChaosPacks: true, startTaboo: true, allCostZero: true, doubleLife: true } };
    G.Save.clearRun();
    G.Run.startNew({ festival: fest });
    eq(G.Run.state.maxLife, 80, 'double life');
    eq(G.Run.packOffer().length, 1); eq(G.Run.packOffer()[0], 'chaos');
    ok(G.Run.state.deck.some(function (id) { return G.CardDB.get(id).rarity === 'taboo'; }), 'starts with a taboo');
    for (let i = 0; i < 6; i++) G.Run.openChosenPack('chaos');
    G.Run.chooseStarterRelic(G.Run.relicOffer()[0]);
    const node = G.Run.availableNodes()[0];
    G.Run.goTo(node);
    const b = G.Run.beginBattle(G.Run.pendingBattle().enemyId, { turnLimit: 20 });
    await b.game.start();
    ok(b.game.status(0, 'allCostsZero') === true, 'all costs zero');
    eq(b.game.players[1].relics.indexOf('_fx_festival_double_damage') >= 0, true, 'double damage relic installed');
    G.Run.abandon();
  });
})(globalThis.G);
