'use strict';
// tests/engine_edge.test.js — edge mechanics: statuses switchboard, extra-turn loops, replay by defId,
// invert/reflect, abilities, hooks on deserialized games, random full games (crash check).
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const Fx = G.Fx, DB = G.CardDB;
  function reg(def) { if (!DB.has(def.id)) DB.register(def); return def; }

  reg({ id: 't_e_witch', name: 'テスト魔女', type: 'monster', cost: 4, atk: 2, hp: 3,
    effects: { onExtraTurnStart: Fx.recoverFromGrave(function (inst, def) { return def.type === 'spell'; }) } });
  reg({ id: 't_e_hourglass', name: 'テスト時喰い', type: 'spell', cost: 1, effects: { onPlay: Fx.extraTurn() } });
  reg({ id: 't_e_reflect', name: 'テスト鏡盾', type: 'spell', cost: 0, effects: { onPlay: Fx.statusOppNextTurn('reflectFirstDamage', true) } });
  reg({ id: 't_e_invert', name: 'テスト全反転', type: 'spell', cost: 0, effects: { onPlay: Fx.statusOppNextTurn('invertEffects', true) } });
  reg({ id: 't_e_bolt', name: 'テスト稲妻2', type: 'spell', cost: 0, effects: { onPlay: Fx.dmgOpp(4) } });
  reg({ id: 't_e_heal', name: 'テスト手当', type: 'spell', cost: 0, effects: { onPlay: Fx.heal(5) } });
  reg({ id: 't_e_negate', name: 'テスト封言', type: 'spell', cost: 0, effects: { onPlay: Fx.statusOppNextTurn('firstSpellNegated', true) } });
  reg({ id: 't_e_bell', name: 'テスト鐘', type: 'crest', cost: 0, effects: {
    ability: { label: '巻き戻し', oncePerTurn: true, use: async function (ctx) {
      const snap = ctx.game.turnSnapshotOf(ctx.me.idx, 0);
      ctx.game.restore(snap.state, { keepHandOf: ctx.me.idx });
      const bell = ctx.game.players[ctx.me.idx].crests.find(function (c) { return c.defId === 't_e_bell'; });
      if (bell) bell.flags.abilityUsedTurn = ctx.game.turn;
    } } } });
  reg({ id: 't_e_chainbolt', name: 'テスト連打', type: 'spell', cost: 0, effects: { onPlay: Fx.dmgOpp(Fx.chain()) } });
  reg({ id: 't_e_shrine', name: 'テスト巫女', type: 'monster', cost: 1, atk: 1, hp: 3, effects: { grants: [{ key: 'chainMultiplier', value: 2 }] } });
  reg({ id: 't_e_rod', name: 'テスト避雷針', type: 'spell', cost: 0, reserve: true, effects: {},
    reserveHooks: { modChain: function (ctx, ev) { return Math.floor(ev.chain / 2); } } });
  reg({ id: 't_e_storm', name: 'テスト放電', type: 'monster', cost: 1, atk: 1, hp: 1, effects: { onCardPlayed: Fx.dmgOpp(1) } });
  reg({ id: 't_e_bat', name: 'テスト蝙蝠', type: 'monster', cost: 1, atk: 1, hp: 2, effects: { scope: 'any',
    onCardPlayed: async function (ctx, ev) { if (ev.who !== ctx.owner.idx) ctx.owner.flags.bonusMana = (ctx.owner.flags.bonusMana || 0) + 1; } } });
  reg({ id: 't_e_eater', name: 'テスト呪詛喰らい', type: 'monster', cost: 1, atk: 2, hp: 3, effects: {
    onSummon: async function (ctx) { ctx.setStatus(ctx.me, 'curseRedirectToMonsterUid', ctx.card.uid, { sourceUid: ctx.card.uid }); },
    onLeave: async function (ctx) { if (ctx.game.explicitStatus(ctx.me, 'curseRedirectToMonsterUid') === ctx.card.uid) ctx.clearStatus(ctx.me, 'curseRedirectToMonsterUid'); } } });
  reg({ id: 't_e_recreate', name: 'テスト再創造', type: 'spell', cost: 0, effects: { onPlay: async function (ctx) {
    for (let i = 0; i < 2; i++) {
      const p = ctx.game.players[i];
      const all = p.board.concat(p.phantoms, p.crests, p.hand, p.grave);
      for (let k = 0; k < all.length; k++) await ctx.exile(all[k]);
      p.maxMana = 5;
    }
    if (ctx.game.field) await ctx.exile(ctx.game.field);
    await ctx.exile(ctx.card); // the resolving card itself is in limbo, so exile it explicitly
    await ctx.draw(5, ctx.me); await ctx.draw(5, ctx.opp);
  } } });

  function byDef(arr, id) { return arr.find(function (c) { return c.defId === id; }); }
  async function play(g, i, defId, choices) {
    const p = g.players[i];
    const c = byDef(p.hand, defId) || byDef(p.grave, defId);
    ok(c, 'card ' + defId + ' available');
    return g.playCard(i, c.uid, { choices: choices });
  }

  test('extra-turn loop (witch + hourglass) is detected at turn end and runLoop advances to deck-out win', async function () {
    const deck0 = new Array(30).fill('t_vanilla');
    const g = await T.sandbox({ p0: { hand: ['t_e_hourglass'], board: ['t_e_witch'], mana: 10, deck: deck0 }, p1: { deck: ['t_vanilla', 't_vanilla'] } });
    const rec = T.record(g, ['loopDetected', 'loopIteration']);
    // turn A: play hourglass → extra turn. turn B (extra): witch returns it, play again → extra turn. turn C same → loop
    await play(g, 0, 't_e_hourglass'); await g.endTurn(0);
    eq(g.streak, 2); ok(byDef(g.players[0].hand, 't_e_hourglass'), 'witch recovered it');
    await play(g, 0, 't_e_hourglass'); await g.endTurn(0);
    eq(g.streak, 3);
    eq(rec.count('loopDetected'), 1, 'two identical consecutive extra turns → loop');
    eq(g.loop.detected.kind, 'turn');
    // the cycle is [play hourglass, endTurn]; run until P0 decks out?? no — P0 draws each turn, so this loop kills P0.
    const res = await g.runLoop(0, 'inf');
    eq(g.winner, 1); eq(g.winReason, 'deckout');
    ok(res.iterations > 20, 'ran many turns: ' + res.iterations);
    ok(g.streak > 20);
  });

  test('loop replay re-resolves uids by defId (fresh phoenix uid each time)', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_phoenix'], crests: ['t_crest_altar'], mana: 0 } });
    const uids = new Set();
    for (let i = 0; i < 3; i++) {
      const ph = byDef(g.players[0].hand, 't_phoenix');
      uids.add(ph.uid);
      await g.playCard(0, ph.uid);
      const ab = g.getAbilities(0); await g.useAbility(0, ab[0].uid, ab[0].targets);
    }
    eq(uids.size, 1, 'same physical card so far');
    // swap in a different phoenix instance: replay must still work via defId
    const old = byDef(g.players[0].hand, 't_phoenix');
    g.removeFromZone(old); old.zone = 'void';
    g.addCard(0, 't_phoenix', 'hand');
    const res = await g.runLoop(0, 3);
    eq(res.iterations, 3);
    eq(g.players[0].mana, 6);
  });

  test('loop with a targeted spell (生け贄→不死鳥) replays targets by defId', async function () {
    reg({ id: 't_e_sac', name: 'テスト生け贄2', type: 'spell', cost: 0, targets: Fx.T.allyBoardMonster,
      effects: { onPlay: Fx.seq(Fx.destroyTarget(), Fx.gainMana(1)), returnsToHand: true } });
    const g = await T.sandbox({ p0: { hand: ['t_phoenix', 't_e_sac'], crests: ['t_crest_gate'], mana: 0 } });
    for (let i = 0; i < 3; i++) {
      await play(g, 0, 't_phoenix');
      const ph = g.players[0].board[0];
      await g.playCard(0, byDef(g.players[0].hand, 't_e_sac').uid, { choices: { targets: [ph.uid] } });
    }
    ok(g.loop.detected, 'detected');
    eq(g.loop.detected.cycle[1].targetDefs[0].defId, 't_phoenix');
    const res = await g.runLoop(0, 4);
    eq(res.iterations, 4);
    eq(g.players[1].curse, 14);
  });

  test('reflectFirstDamage: first damage dealt by opponent hits themselves, once', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_e_reflect'], mana: 5, deck: ['t_vanilla'] }, p1: { hand: ['t_e_bolt', 't_e_bolt'], deck: ['t_vanilla', 't_vanilla'] } });
    await play(g, 0, 't_e_reflect'); await g.endTurn(0);
    g.players[1].mana = 5;
    await play(g, 1, 't_e_bolt');
    eq(g.players[1].life, 36, 'reflected'); eq(g.players[0].life, 40);
    await play(g, 1, 't_e_bolt');
    eq(g.players[0].life, 36, 'second one goes through');
  });

  test('invertEffects: ctx.me/opp swapped for the affected player\'s card effects', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_e_invert'], mana: 5, life: 30, deck: ['t_vanilla'] }, p1: { hand: ['t_e_bolt', 't_e_heal'], life: 30, deck: ['t_vanilla', 't_vanilla'] } });
    g.players[0].maxLife = 40;
    await play(g, 0, 't_e_invert'); await g.endTurn(0);
    g.players[1].mana = 5;
    await play(g, 1, 't_e_bolt');
    eq(g.players[1].life, 26, 'bolt hits its caster'); eq(g.players[0].life, 30);
    await play(g, 1, 't_e_heal');
    eq(g.players[0].life, 35, 'heal goes to the other side');
  });

  test('firstSpellNegated negates only the first spell', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_e_negate'], mana: 5, deck: ['t_vanilla'] }, p1: { hand: ['t_e_bolt', 't_e_bolt'], deck: ['t_vanilla', 't_vanilla'] } });
    await play(g, 0, 't_e_negate'); await g.endTurn(0);
    g.players[1].mana = 5;
    await play(g, 1, 't_e_bolt'); eq(g.players[0].life, 40);
    await play(g, 1, 't_e_bolt'); eq(g.players[0].life, 36);
    eq(g.players[1].grave.length, 2, 'negated spell still goes to grave');
  });

  test('chain: multiplier grant, reserve modChain halves, chain spells, chainPersists', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_spark', 't_spark', 't_e_chainbolt'], board: ['t_e_shrine'], mana: 5, deck: ['t_vanilla', 't_vanilla'] } });
    await play(g, 0, 't_spark'); await play(g, 0, 't_spark');
    eq(g.players[0].chain, 2); eq(g.chainOf(0), 4, 'doubled by 巫女');
    await play(g, 0, 't_e_chainbolt'); // chain 3 → 6 dmg
    eq(g.players[1].life, 34);
    g.setStatus(0, 'chainPersists', true);
    await g.endTurn(0);
    eq(g.players[0].chain, 3, 'persists');
    const g2 = await T.sandbox({ p0: { hand: ['t_e_rod'], mana: 5, deck: ['t_vanilla'] }, p1: { hand: ['t_spark', 't_spark', 't_spark', 't_e_chainbolt'], deck: ['t_vanilla', 't_vanilla', 't_vanilla', 't_vanilla'] } });
    await play(g2, 0, 't_e_rod'); await g2.endTurn(0);
    g2.players[1].mana = 5;
    await play(g2, 1, 't_spark'); await play(g2, 1, 't_spark'); await play(g2, 1, 't_spark');
    eq(g2.chainOf(1), 1, '3 halved → 1');
    await play(g2, 1, 't_e_chainbolt'); eq(g2.players[0].life, 38);
  });

  test('onCardPlayed passive (放電) fires per real play and per copy; scope any sees opponent plays (蝙蝠)', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_spark', 't_spark'], board: ['t_e_storm'], mana: 5, deck: ['t_vanilla', 't_vanilla'] }, p1: { board: ['t_e_bat'], deck: ['t_vanilla'] } });
    await play(g, 0, 't_spark'); await play(g, 0, 't_spark');
    eq(g.players[1].life, 38);
    eq(g.players[1].flags.bonusMana, 2, 'bat counted both plays by the opponent');
    await g.makeCtx(0, null).cast('t_bolt', 0, { copy: true });
    eq(g.players[1].life, 34, 'copy triggered 放電 (3) + bolt 3... wait: 38-1-3');
  });

  test('curseRedirectToMonsterUid (呪詛喰らい): curse becomes damage on the monster; cleared when it leaves', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_e_eater'], mana: 5 }, p1: { hand: ['t_curse2', 't_curse2', 't_curse2'], mana: 5, deck: ['t_vanilla', 't_vanilla'] } });
    await play(g, 0, 't_e_eater'); await g.endTurn(0);
    g.players[1].mana = 5;
    await play(g, 1, 't_curse2');
    eq(g.players[0].curse, 0); eq(g.players[0].board[0].damage, 2);
    await play(g, 1, 't_curse2');
    eq(g.players[0].board.length, 0, 'eater died (3 hp, 4 dmg)');
    await play(g, 1, 't_curse2');
    eq(g.players[0].curse, 2, 'redirect cleared');
  });

  test('巻き戻しの鐘 ability: restore to turn start keeping hand, once per turn', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_bolt', 't_bolt'], crests: ['t_e_bell'], mana: 5, deck: ['t_vanilla', 't_vanilla'] }, p1: { deck: ['t_vanilla'] } });
    await play(g, 0, 't_bolt');
    eq(g.players[1].life, 37);
    let ab = g.getAbilities(0); eq(ab.length, 1);
    await g.useAbility(0, ab[0].uid, []);
    eq(g.players[1].life, 40, 'damage undone');
    eq(g.players[0].hand.length, 1, 'hand stays as it is now (bolt spent)');
    eq(g.players[0].grave.length, 0, 'grave restored: the spent bolt is simply gone (hand kept, grave reverted)');
    ab = g.getAbilities(0); eq(ab.length, 0, 'once per turn');
  });

  test('世界の再創造-style mass exile keeps life/curse and resets max mana', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_e_recreate', 't_bolt'], board: ['t_big'], crests: ['t_crest_a'], grave: ['t_spark'], mana: 9, deck: new Array(6).fill('t_vanilla'), curse: 3 }, p1: { board: ['t_guard'], hand: ['t_bolt'], deck: new Array(6).fill('t_vanilla') }, field: 't_field_plain' });
    await play(g, 0, 't_e_recreate');
    eq(g.players[0].board.length, 0); eq(g.players[0].crests.length, 0); eq(g.players[0].grave.length, 0, 'the spell itself exiled too');
    eq(g.players[1].board.length, 0); eq(g.field, null);
    eq(g.players[0].hand.length, 5); eq(g.players[1].hand.length, 5);
    eq(g.players[0].maxMana, 5); eq(g.players[0].curse, 3);
    ok(g.players[0].exile.length >= 4);
  });

  test('getPlayable reports X cards and target needs; default X = all mana', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_xbolt', 't_kill'], mana: 3 }, p1: { board: ['t_vanilla'] } });
    const pl = g.getPlayable(0);
    const x = pl.find(function (p) { return p.defId === 't_xbolt'; });
    ok(x.needsX); eq(x.cost, 0);
    const k = pl.find(function (p) { return p.defId === 't_kill'; });
    ok(k.needsTarget); eq(k.targets.kind, 'monster');
    await g.playCard(0, x.uid);
    eq(g.players[0].mana, 0); eq(g.players[1].life, 37);
  });

  test('canPlay hook and costMod self hook', async function () {
    reg({ id: 't_e_lastresort', name: 'テスト逆転', type: 'spell', cost: 0, effects: { canPlay: function (ctx) { return ctx.me.life <= 10; }, onPlay: Fx.draw(1) } });
    reg({ id: 't_e_dragon', name: 'テスト火喰い', type: 'monster', cost: 7, atk: 5, hp: 5, effects: { costMod: function (ctx) { return -ctx.me.manaGainedThisTurn; } } });
    const g = await T.sandbox({ p0: { hand: ['t_e_lastresort', 't_e_dragon', 't_spark'], mana: 3, deck: ['t_vanilla', 't_vanilla'] } });
    eq(g.getPlayable(0).some(function (p) { return p.defId === 't_e_lastresort'; }), false);
    g.players[0].life = 8;
    eq(g.getPlayable(0).some(function (p) { return p.defId === 't_e_lastresort'; }), true);
    eq(g.costOf(0, byDef(g.players[0].hand, 't_e_dragon')), 7);
    await play(g, 0, 't_spark');
    eq(g.costOf(0, byDef(g.players[0].hand, 't_e_dragon')), 6);
  });

  test('timed tick rate 2 (永遠の午後) and timedFrozen (足止めの砂)', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_timed_bomb'], mana: 5, deck: ['t_vanilla', 't_vanilla', 't_vanilla'], statuses: { timedTickRate: 2 } }, p1: { deck: ['t_vanilla', 't_vanilla', 't_vanilla'] } });
    await play(g, 0, 't_timed_bomb');
    await g.endTurn(0); await g.endTurn(1);
    eq(g.players[1].life, 30, 'ticked 2 at once → fired');
    const g2 = await T.sandbox({ p0: { hand: ['t_timed_bomb'], mana: 5, deck: ['t_vanilla', 't_vanilla', 't_vanilla'] }, p1: { deck: ['t_vanilla', 't_vanilla', 't_vanilla'] } });
    await play(g2, 0, 't_timed_bomb');
    g2.setStatus(0, 'timedFrozen', true, { untilEndOfTurnOf: 0, turns: 2 }); // lasts through P0's next turn
    await g2.endTurn(0); await g2.endTurn(1);
    eq(g2.players[0].timed[0].timedCount, 2, 'frozen');
    await g2.endTurn(0); await g2.endTurn(1);
    eq(g2.players[0].timed[0].timedCount, 1, 'thawed');
  });

  test('hooks keep working on a deserialized game mid-loop (phoenix/altar)', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_phoenix'], crests: ['t_crest_altar', 't_crest_gate'], mana: 0 } });
    for (let i = 0; i < 3; i++) {
      await play(g, 0, 't_phoenix');
      const ab = g.getAbilities(0); await g.useAbility(0, ab[0].uid, ab[0].targets);
    }
    const g2 = G.Engine.deserialize(JSON.stringify(g.serialize()));
    ok(g2.loop.detected, 'loop state survives serialization');
    const res = await g2.runLoop(0, 'inf');
    eq(g2.winner, 0); eq(res.reason, 'win');
    eq(g.winner, null, 'original untouched');
  });

  test('random AI-vs-AI games with the default chooser do not crash and terminate', async function () {
    const pool = ['t_vanilla', 't_big', 't_rush', 't_guard', 't_sprite', 't_phoenix', 't_skel', 't_twins', 't_spark', 't_bolt', 't_xbolt',
      't_draw2', 't_reprise', 't_curse2', 't_extra', 't_reserve_half', 't_timed_bomb', 't_crest_mana', 't_crest_core', 't_field_volcano', 't_key1', 't_key2'];
    for (let seed = 1; seed <= 6; seed++) {
      const rng = new G.RNG(seed);
      const deck = function () { const d = []; for (let i = 0; i < 20; i++) d.push(rng.pick(pool)); return d; };
      const g = G.Engine.createGame({ seed: seed, players: [{ deck: deck() }, { deck: deck() }], turnLimit: 40 });
      await g.start();
      let guard = 0;
      while (g.winner === null && guard++ < 2000) {
        const me = g.active;
        const pl = g.getPlayable(me).filter(function (p) { return !p.needsTarget || true; });
        if (pl.length && g.rng.chance(0.8)) {
          const pick = g.rng.pick(pl);
          const choices = {};
          if (pick.needsTarget) {
            const cands = g.makeCtx(me, null).candidatesFor(pick.targets);
            if (!cands.length) { await g.endTurn(me); continue; }
            choices.targets = [cands[0].uid];
          }
          if (pick.needsX) choices.x = g.players[me].mana;
          const r = await g.playCard(me, pick.uid, { choices: choices });
          ok(r.ok || r.reason, 'play returned a result');
          continue;
        }
        const atk = g.getAttackers(me);
        if (atk.length) { await g.attack(me, atk[0].uid, atk[0].targets[atk[0].targets.length - 1]); continue; }
        await g.endTurn(me);
      }
      ok(g.winner !== null || g.winReason === 'turnLimit' || g.phase === 'over', 'seed ' + seed + ' terminated (turn ' + g.turn + ')');
    }
  });

  // ---- QA regressions --------------------------------------------------------------------------
  test('QA: attacking face with several identical phantoms is not detected as a loop', async function () {
    const g = await T.sandbox({ p0: { board: [{ id: 't_vanilla', summonedTurn: -1 }], phantoms: ['t_vanilla', 't_vanilla', 't_vanilla', 't_vanilla'], deck: ['t_vanilla'] }, p1: { life: 40, deck: ['t_vanilla'] } });
    g.players[0].phantoms.forEach(function (ph) { ph.summonedTurn = -1; ph.attacksLeft = 1; });
    const rec = T.record(g, ['loopDetected']);
    let n = 0;
    while (g.getAttackers(0).length && n++ < 10) await g.attack(0, g.getAttackers(0)[0].uid, 'face');
    ok(n >= 4, 'all phantoms attacked (' + n + ')');
    eq(rec.count('loopDetected'), 0, 'no false loop detection');
    ok(!g.loop.detected, 'loop.detected stays null');
  });
})(globalThis.G);
