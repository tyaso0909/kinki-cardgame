'use strict';
// tests/engine.test.js — engine behaviour tests using test-only card defs (ids prefixed t_).
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const Fx = G.Fx;
  const DB = G.CardDB;

  // ---------------------------------------------------------------------
  // Test-only card definitions
  // ---------------------------------------------------------------------
  function reg(def) { if (!DB.has(def.id)) DB.register(def); return def; }
  reg({ id: 't_vanilla', name: 'テスト兵', type: 'monster', cost: 1, atk: 2, hp: 3, effects: {} });
  reg({ id: 't_big', name: 'テスト巨人', type: 'monster', cost: 3, atk: 5, hp: 5, effects: {} });
  reg({ id: 't_rush', name: 'テスト速攻', type: 'monster', cost: 1, atk: 2, hp: 1, keywords: ['rush'], effects: {} });
  reg({ id: 't_guard', name: 'テスト守護', type: 'monster', cost: 1, atk: 1, hp: 4, keywords: ['guard'], effects: {} });
  reg({ id: 't_sprite', name: 'テスト妖精', type: 'monster', cost: 0, atk: 1, hp: 1, effects: { onSummon: Fx.gainMana(1) } });
  reg({ id: 't_phoenix', name: 'テスト不死鳥', type: 'monster', cost: 0, atk: 1, hp: 1,
    effects: { onSummon: Fx.gainMana(1), onLeave: async function (ctx) { await ctx.returnToHand(ctx.card); } } });
  reg({ id: 't_skel', name: 'テスト骸骨', type: 'monster', cost: 1, atk: 1, hp: 1, effects: { onDeath: Fx.curse(1) } });
  reg({ id: 't_twins', name: 'テスト双子', type: 'monster', cost: 2, atk: 1, hp: 1, effects: { onSummon: Fx.phantomOfSelf(1) } });
  reg({ id: 't_spark', name: 'テスト火種', type: 'spell', cost: 0, effects: { onPlay: Fx.seq(Fx.gainMana(1), Fx.draw(1)) } });
  reg({ id: 't_bolt', name: 'テスト稲妻', type: 'spell', cost: 1, effects: { onPlay: Fx.dmgOpp(3) } });
  reg({ id: 't_xbolt', name: 'テストX砲', type: 'spell', cost: 'X', effects: { onPlay: Fx.dmgOpp(Fx.xValue()) } });
  reg({ id: 't_kill', name: 'テスト除去', type: 'spell', cost: 1, targets: Fx.T.anyMonster, effects: { onPlay: Fx.destroyTarget() } });
  reg({ id: 't_exile', name: 'テスト消滅', type: 'spell', cost: 1, targets: Fx.T.anyMonster, effects: { onPlay: Fx.exileTarget() } });
  reg({ id: 't_bounce', name: 'テスト帰還', type: 'spell', cost: 0, targets: Fx.T.allyBoardMonster, effects: { onPlay: Fx.seq(Fx.bounceTarget(), Fx.gainMana(1)) } });
  reg({ id: 't_draw2', name: 'テスト泉', type: 'spell', cost: 1, effects: { onPlay: Fx.draw(2) } });
  reg({ id: 't_reprise', name: 'テスト泡沫', type: 'spell', cost: 0, reprise: 0, effects: { onPlay: Fx.draw(1) } });
  reg({ id: 't_curse2', name: 'テスト呪詛', type: 'spell', cost: 0, effects: { onPlay: Fx.curse(2) } });
  reg({ id: 't_extra', name: 'テスト砂時計', type: 'spell', cost: 2, effects: { onPlay: Fx.extraTurn() } });
  reg({ id: 't_reserve_half', name: 'テストマナ封鎖', type: 'spell', cost: 1, reserve: true, effects: {},
    reserveHooks: { grants: [{ key: 'manaGainHalved', value: true, side: 'ally' }] } });
  reg({ id: 't_reserve_cost', name: 'テスト重圧', type: 'spell', cost: 1, reserve: true, effects: {},
    reserveHooks: { modCost: function (ctx, ev) { return ev.cost + 1; } } });
  reg({ id: 't_reserve_discard', name: 'テスト忘却', type: 'spell', cost: 1, reserve: true, effects: {},
    reserveHooks: { onActivate: async function (ctx, ev) { await ctx.discard(1, ctx.game.players[ev.who]); } } });
  reg({ id: 't_timed_bomb', name: 'テスト時限爆弾', type: 'spell', cost: 1, timed: 2, effects: { onTimed: Fx.dmgOpp(10) } });
  reg({ id: 't_timed_hero', name: 'テスト未来英雄', type: 'monster', cost: 0, atk: 4, hp: 4, keywords: ['rush'], timed: 3, effects: {} });
  reg({ id: 't_gear', name: 'テスト歯車', type: 'spell', cost: 0, effects: { onPlay: async function (ctx) { await ctx.adjustTimed(ctx.me.timed.slice(), -1); } } });
  reg({ id: 't_crest_mana', name: 'テスト泉紋章', type: 'crest', cost: 1, effects: { onTurnStart: Fx.gainMana(1) } });
  reg({ id: 't_crest_core', name: 'テスト炉心', type: 'crest', cost: 1, effects: { onManaGained: Fx.gainMana(1) } });
  reg({ id: 't_crest_place', name: 'テスト展開紋章', type: 'crest', cost: 0, effects: { onPlace: Fx.draw(1) } });
  reg({ id: 't_crest_a', name: '紋章A', type: 'crest', cost: 0, effects: {} });
  reg({ id: 't_crest_b', name: '紋章B', type: 'crest', cost: 0, effects: {} });
  reg({ id: 't_crest_c', name: '紋章C', type: 'crest', cost: 0, effects: {} });
  reg({ id: 't_crest_d', name: '紋章D', type: 'crest', cost: 0, effects: {} });
  reg({ id: 't_crest_e', name: '紋章E', type: 'crest', cost: 0, effects: {} });
  reg({ id: 't_crest_altar', name: 'テスト祭壇', type: 'crest', cost: 1, effects: {
    ability: { label: '破壊', targets: { kind: 'boardMonster', side: 'ally', count: 1 }, use: async function (ctx) { await ctx.destroy(ctx.targets[0]); } } } });
  reg({ id: 't_crest_gate', name: 'テスト門番紋章', type: 'crest', cost: 0, effects: { onMonsterDestroyed: Fx.curse(2) } });
  reg({ id: 't_crest_persist', name: 'テスト残像', type: 'crest', cost: 0, effects: { grants: [{ key: 'phantomsPersist', value: true }] } });
  reg({ id: 't_crest_queen', name: 'テスト女王紋章', type: 'crest', cost: 0, effects: { grants: [{ key: 'phantomSummonEffects', value: true }] } });
  reg({ id: 't_crest_mirror', name: 'テスト双面', type: 'crest', cost: 0, effects: { grants: [{ key: 'spellMultiplier', value: 2 }] } });
  reg({ id: 't_crest_book', name: 'テスト永劫', type: 'crest', cost: 0, effects: { grants: [{ key: 'spellsReturnToHand', value: true }] } });
  reg({ id: 't_field_volcano', name: 'テスト火山', type: 'field', cost: 2, effects: { scope: 'any', onManaGained: Fx.gainMana(1), onPlace: Fx.gainMana(2) } });
  reg({ id: 't_field_plain', name: 'テスト草原', type: 'field', cost: 1, effects: { onPlace: Fx.draw(1) } });
  reg({ id: 't_field_temple', name: 'テスト神殿', type: 'field', cost: 2, effects: { grants: [{ key: 'cardsPerTurnLimit', value: 2, side: 'any' }] } });
  reg({ id: 't_field_zero', name: 'テスト零域', type: 'field', cost: 2, effects: { grants: [{ key: 'loopSecondIterationVoid', value: true, side: 'any' }] } });
  reg({ id: 't_key1', name: 'テスト鍵一', type: 'spell', cost: 0, key: 1, effects: { onPlay: Fx.seal() } });
  reg({ id: 't_key2', name: 'テスト鍵二', type: 'spell', cost: 0, key: 2, effects: { onPlay: Fx.seal() } });
  reg({ id: 't_key3', name: 'テスト鍵三', type: 'spell', cost: 0, key: 3, effects: { onPlay: Fx.seal() } });
  reg({ id: 't_key4', name: 'テスト鍵四', type: 'spell', cost: 0, key: 4, effects: { onPlay: Fx.seal() } });
  reg({ id: 't_keyw', name: 'テスト万能鍵', type: 'spell', cost: 0, key: 'wild', effects: { onPlay: Fx.seal() } });
  reg({ id: 't_status_cannot', name: 'テスト時間停止', type: 'spell', cost: 0, effects: { onPlay: Fx.statusOppNextTurn('cannotAttack', true) } });
  reg({ id: 't_relicless', name: 'テスト0', type: 'spell', cost: 0, effects: {} });
  reg({ id: 't_prophecy', name: 'テスト預言書', type: 'crest', cost: 0, rarity: 'taboo', timed: 2, effects: { fixedTimer: true, indestructible: true, onTimed: async function (ctx) { ctx.specialWin(ctx.me, 'prophecy'); } } });
  reg({ id: 't_sacrifice', name: 'テスト生け贄', type: 'spell', cost: 0, targets: Fx.T.allyBoardMonster, effects: { onPlay: Fx.seq(Fx.destroyTarget(), Fx.gainMana(2)) } });

  if (!G.RelicDB.has('t_relic_ember')) {
    G.RelicDB.register({ id: 't_relic_ember', name: 'テスト種火', effects: { onBattleStart: Fx.gainMaxMana(1) } });
    G.RelicDB.register({ id: 't_relic_core', name: 'テスト遺物炉心', effects: { onManaGained: Fx.gainMana(1) } });
    G.RelicDB.register({ id: 't_relic_cheap', name: 'テスト聖杯', effects: { modCost: function (ctx, ev) { return G.CardDB.get(ev.card.defId).type === 'spell' ? ev.cost - 1 : ev.cost; } } });
  }

  function hand(g, i) { return g.players[i].hand; }
  function byDef(arr, id) { return arr.find(function (c) { return c.defId === id; }); }
  async function play(g, i, defId, choices) {
    const p = g.players[i];
    const c = byDef(p.hand, defId) || byDef(p.grave, defId);
    ok(c, 'card ' + defId + ' available');
    return g.playCard(i, c.uid, { choices: choices });
  }

  // ---------------------------------------------------------------------
  test('coin toss: first player gets no draw on turn 1, maxMana 1 for both after their first turn', async function () {
    const deck = ['t_vanilla', 't_vanilla', 't_vanilla', 't_vanilla', 't_vanilla', 't_vanilla', 't_vanilla', 't_vanilla'];
    const g = G.Engine.createGame({ seed: 7, players: [{ deck: deck }, { deck: deck }], options: { firstPlayer: 1 } });
    await g.start();
    eq(g.first, 1); eq(g.active, 1); eq(g.turn, 1);
    eq(hand(g, 1).length, 5, 'first player keeps 5');
    eq(hand(g, 0).length, 5);
    eq(g.players[1].maxMana, 1); eq(g.players[1].mana, 1);
    await g.endTurn(1);
    eq(g.active, 0); eq(g.turn, 2);
    eq(hand(g, 0).length, 6, 'second player draws');
    eq(g.players[0].maxMana, 1);
    eq(g.players[1].mana, 0, 'mana cleared at end');
    await g.endTurn(0);
    eq(g.players[1].maxMana, 2); eq(g.players[1].mana, 2);
    eq(hand(g, 1).length, 6);
  });

  test('coin toss is seeded/deterministic and random without firstPlayer option', async function () {
    const deck = ['t_vanilla', 't_vanilla', 't_vanilla', 't_vanilla', 't_vanilla', 't_vanilla'];
    const a = G.Engine.createGame({ seed: 11, players: [{ deck: deck }, { deck: deck }] });
    const b = G.Engine.createGame({ seed: 11, players: [{ deck: deck }, { deck: deck }] });
    await a.start(); await b.start();
    eq(a.first, b.first);
    ok(a.first === 0 || a.first === 1);
  });

  test('turn flow: phases, endTurn by wrong player refused, counters reset', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_spark'], deck: ['t_vanilla', 't_vanilla'] }, p1: { deck: ['t_vanilla', 't_vanilla'] } });
    eq(g.phase, 'main');
    const r = await g.endTurn(1); eq(r.ok, false);
    await play(g, 0, 't_spark');
    eq(g.players[0].playedThisTurn.length, 1); eq(g.players[0].chain, 1);
    await g.endTurn(0);
    eq(g.players[0].chain, 0);
    eq(g.players[0].playedThisTurn.length, 1, 'playedThisTurn is reset at that player\'s next turn start');
    eq(g.active, 1); eq(g.phase, 'main');
    await g.endTurn(1);
    eq(g.players[0].playedThisTurn.length, 0);
    eq(g.players[0].prevTurnPlayed[0], 't_spark');
  });

  test('mana: gain routes through hooks (crest onManaGained, field any-scope, relic)', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_spark', 't_spark'], crests: ['t_crest_core'], mana: 0, deck: ['t_vanilla', 't_vanilla'] } });
    await play(g, 0, 't_spark'); // +1, core +1 (core doesn't retrigger itself)
    eq(g.players[0].mana, 2);
    eq(g.players[0].manaGainedThisTurn, 2);
    const g2 = await T.sandbox({ field: 't_field_volcano', p0: { hand: ['t_spark'], mana: 0, deck: ['t_vanilla'] }, p1: { hand: ['t_spark'], deck: ['t_vanilla', 't_vanilla'] } });
    await play(g2, 0, 't_spark'); eq(g2.players[0].mana, 2, 'volcano +1 for owner');
    await g2.endTurn(0);
    g2.players[1].mana = 0;
    await play(g2, 1, 't_spark'); eq(g2.players[1].mana, 2, 'volcano is scope any: +1 for opponent too');
    const g3 = await T.sandbox({ p0: { hand: ['t_spark'], relics: ['t_relic_core'], mana: 0, deck: ['t_vanilla'] } });
    await play(g3, 0, 't_spark'); eq(g3.players[0].mana, 2, 'relic hook fires like a crest');
  });

  test('relic onBattleStart fires; relic modCost applies', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_bolt'], relics: ['t_relic_ember', 't_relic_cheap'], mana: 0 } });
    eq(g.players[0].maxMana, 10, 'sandbox sets maxMana after start');
    // in a real game ember shows up as maxMana 2 on turn 1
    const g2 = G.Engine.createGame({ seed: 1, players: [{ deck: ['t_vanilla'], relics: ['t_relic_ember'] }, { deck: ['t_vanilla'] }], options: { firstPlayer: 0, initialHand: 0 } });
    await g2.start();
    eq(g2.players[0].maxMana, 2, 'ember: +1 max mana before first turn → 2 at turn 1');
    const bolt = byDef(hand(g, 0), 't_bolt');
    eq(g.costOf(0, bolt), 0, 'relic -1 on spells');
    eq(g.getPlayable(0).length, 1, 'cost 0 → playable with 0 mana');
  });

  test('costs & modifiers: X cost, costMod self, reserve +1, cannot afford', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_xbolt', 't_bolt'], mana: 5 } });
    const x = byDef(hand(g, 0), 't_xbolt');
    eq(g.costOf(0, x, { choices: { x: 4 } }), 4);
    await g.playCard(0, x.uid, { choices: { x: 4 } });
    eq(g.players[1].life, 36); eq(g.players[0].mana, 1);
    const b = byDef(hand(g, 0), 't_bolt');
    g.players[0].mana = 0;
    const r = await g.playCard(0, b.uid); eq(r.ok, false); eq(r.reason, 'mana');
  });

  test('summon, attack, guard, rush, damage persistence, simultaneous damage', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_vanilla', 't_rush'], board: ['t_big'], mana: 5 }, p1: { board: ['t_guard', 't_vanilla'] } });
    await play(g, 0, 't_vanilla');
    const v = byDef(g.players[0].board, 't_vanilla');
    ok(!g.canAttackWith(0, v), 'summoning sick');
    await play(g, 0, 't_rush');
    const r = byDef(g.players[0].board, 't_rush');
    ok(g.canAttackWith(0, r), 'rush can attack');
    const big = byDef(g.players[0].board, 't_big');
    const guard = byDef(g.players[1].board, 't_guard');
    const atks = g.getAttackers(0);
    eq(atks.length, 2);
    T.deepEq(atks[0].targets, [guard.uid], 'guard must be attacked first');
    const bad = await g.attack(0, big.uid, 'face'); eq(bad.ok, false);
    await g.attack(0, big.uid, guard.uid);
    eq(guard.zone, 'grave', 'guard destroyed');
    eq(g.players[1].board.length, 1); eq(big.damage, 1, 'guard dealt 1 back');
    ok(!g.canAttackWith(0, big), 'one attack per turn');
    await g.attack(0, r.uid, 'face');
    eq(g.players[1].life, 38);
    await g.endTurn(0); await g.endTurn(1);
    eq(big.damage, 1, 'damage persists across turns');
    eq(g.players[1].grave.length, 1, 'destroyed monster to grave');
  });

  test('spells: resolve → grave, onSpellToGrave, spellMultiplier doubles, spellsReturnToHand', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_bolt', 't_bolt'], crests: ['t_crest_mirror'], mana: 5 } });
    await play(g, 0, 't_bolt');
    eq(g.players[1].life, 34, 'doubled');
    eq(g.players[0].grave.length, 1);
    const g2 = await T.sandbox({ p0: { hand: ['t_bolt'], crests: ['t_crest_book'], mana: 5 } });
    await play(g2, 0, 't_bolt');
    eq(g2.players[0].grave.length, 0); eq(hand(g2, 0).length, 1, 'returned to hand');
    eq(g2.players[0].chain, 1);
  });

  test('reserve spells: active only during opponent next turn, then expire to grave; immuneReserve blocks', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_reserve_half', 't_reserve_cost', 't_spark'], mana: 5, deck: ['t_vanilla'] }, p1: { hand: ['t_spark', 't_bolt'], deck: ['t_vanilla', 't_vanilla'] } });
    await play(g, 0, 't_reserve_half');
    await play(g, 0, 't_reserve_cost');
    eq(g.players[1].reserves.length, 2);
    eq(g.players[0].grave.length, 0, 'reserve card is held, not in grave');
    // not active on own turn
    const sparkMine = byDef(hand(g, 0), 't_spark');
    eq(g.costOf(0, sparkMine), 0, 'reserve cost mod does not hit its owner');
    g.players[0].mana = 0;
    await g.playCard(0, sparkMine.uid); eq(g.players[0].mana, 1, 'not halved for owner');
    await g.endTurn(0);
    // opponent's turn: active
    const bolt = byDef(hand(g, 1), 't_bolt');
    eq(g.costOf(1, bolt), 2, '+1 during opponent turn');
    g.players[1].mana = 5;
    const sp = byDef(hand(g, 1), 't_spark');
    await g.playCard(1, sp.uid);
    eq(g.players[1].mana, 4, 'spark costs 0+1 under 重圧, gain 1 halved → 0');
    await g.endTurn(1);
    eq(g.players[1].reserves.length, 0, 'expired');
    eq(g.players[0].grave.length, 3, 'two reserve cards + the spark go to owner grave');
    // next own turn: no longer active
    eq(g.costOf(0, byDef(hand(g, 0), 't_spark') || g.createCardInst('t_spark', 0)), 0);
    // immuneReserve
    const g2 = await T.sandbox({ p0: { hand: ['t_reserve_half'], mana: 5 }, p1: { statuses: { immuneReserve: true } } });
    await play(g2, 0, 't_reserve_half');
    eq(g2.players[1].reserves.length, 0); eq(g2.players[0].grave.length, 1);
  });

  test('reserve onActivate fires at the start of target turn', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_reserve_discard'], mana: 5, deck: ['t_vanilla'] }, p1: { hand: ['t_vanilla', 't_vanilla'], deck: ['t_vanilla', 't_vanilla'] } });
    await play(g, 0, 't_reserve_discard');
    await g.endTurn(0);
    eq(hand(g, 1).length, 2, 'drew 1 then discarded 1 → 3-1=2');
    eq(g.players[1].grave.length, 1);
  });

  test('timed cards: tick at own turn start, fire at 0, manual adjust, timed monster enters board', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_timed_bomb', 't_timed_hero', 't_gear'], mana: 5, deck: ['t_vanilla', 't_vanilla', 't_vanilla'] }, p1: { deck: ['t_vanilla', 't_vanilla', 't_vanilla'] } });
    await play(g, 0, 't_timed_bomb');
    await play(g, 0, 't_timed_hero');
    eq(g.players[0].timed.length, 2);
    eq(g.players[0].board.length, 0, 'timed monster not on board yet');
    await play(g, 0, 't_gear'); // bomb 2→1, hero 3→2
    eq(byDef(g.players[0].timed, 't_timed_bomb').timedCount, 1);
    await g.endTurn(0); await g.endTurn(1); // P0 turn start: bomb 0 → fires 10, hero 1
    eq(g.players[1].life, 30);
    eq(g.players[0].timed.length, 1);
    eq(g.players[0].grave.length, 2, 'bomb and gear in grave');
    await g.endTurn(0); await g.endTurn(1);
    eq(g.players[0].board.length, 1, 'hero summoned');
    eq(g.players[0].timed.length, 0);
  });

  test('crest placement: dup refused (card stays in hand), 6th swaps via pick, onPlace fires', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_crest_a', 't_crest_place', 't_crest_a'], crests: ['t_crest_b', 't_crest_c', 't_crest_d', 't_crest_e'], mana: 5, deck: ['t_vanilla', 't_vanilla'], chooser: T.lastChooser } });
    await play(g, 0, 't_crest_a');
    eq(g.players[0].crests.length, 5);
    const dup = byDef(hand(g, 0), 't_crest_a');
    const r = await g.playCard(0, dup.uid);
    eq(r.ok, false); eq(r.reason, 'duplicateCrest');
    eq(hand(g, 0).length, 2);
    eq(g.getPlayable(0).length, 1, 'only the place crest is playable');
    await play(g, 0, 't_crest_place'); // 6th → swap (lastChooser picks the last crest = t_crest_a)
    eq(g.players[0].crests.length, 5);
    ok(!byDef(g.players[0].crests, 't_crest_a'), 'swapped out crest gone');
    eq(g.players[0].grave.length, 1);
    eq(hand(g, 0).length, 2, 'onPlace drew 1 (1 left + 1 drawn)');
  });

  test('field replacement: old → owner grave; 展開時 only for the one who placed it', async function () {
    const g = await T.sandbox({ field: 't_field_plain', fieldOwner: 1, p0: { hand: ['t_field_volcano'], mana: 5, deck: ['t_vanilla'] }, p1: { deck: ['t_vanilla'] } });
    const before = g.players[0].mana;
    await play(g, 0, 't_field_volcano');
    eq(g.field.defId, 't_field_volcano'); eq(g.fieldOwner, 0);
    eq(g.players[1].grave.length, 1, 'old field to its owner grave');
    eq(g.players[0].mana, before - 2 + 3, 'onPlace +2 then volcano +1 on that gain');
    eq(g.players[1].mana, 0, 'opponent gets no 展開時');
  });

  test('phantoms: cap 30, vanish at end of turn, no onSummon by default, phantomSummonEffects enables it, persist', async function () {
    const g = await T.sandbox({ p0: { board: ['t_sprite'], mana: 0 } });
    const ctx = g.makeCtx(0, null);
    const sprite = g.players[0].board[0];
    const made = await ctx.createPhantom(sprite, 0, { count: 40 });
    eq(made.length, 30); eq(g.players[0].phantoms.length, 30);
    eq(g.players[0].mana, 0, 'no onSummon for phantoms');
    eq(g.monstersOf(0).length, 31);
    await g.endTurn(0);
    eq(g.players[0].phantoms.length, 0, 'vanished');
    eq(g.players[0].grave.length, 0, 'phantoms leave no grave');
    const g2 = await T.sandbox({ p0: { hand: ['t_twins'], crests: ['t_crest_persist'], mana: 5 } });
    await play(g2, 0, 't_twins');
    eq(g2.players[0].phantoms.length, 1, 'twins makes one phantom; the phantom has no onSummon');
    await g2.endTurn(0);
    eq(g2.players[0].phantoms.length, 1, 'phantoms persist with 残像');
    ok(g2.players[0].phantoms[0].persistent);
  });

  test('phantom queen recursion hits cap 30 and does not overflow the stack', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_twins'], crests: ['t_crest_queen'], mana: 5 } });
    await play(g, 0, 't_twins');
    eq(g.players[0].phantoms.length, 30);
  });

  test('destroyed phantoms fire onMonsterDestroyed (門番) but go nowhere', async function () {
    const g = await T.sandbox({ p0: { board: ['t_vanilla'], phantoms: ['t_vanilla'], crests: ['t_crest_gate'], mana: 5 } });
    const ctx = g.makeCtx(0, null);
    await ctx.destroy(g.players[0].phantoms[0]);
    eq(g.players[1].curse, 2);
    eq(g.players[0].grave.length, 0);
  });

  test('curse win at 20 (curseLimit respected)', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_curse2'], mana: 5 }, p1: { curse: 18 } });
    await play(g, 0, 't_curse2');
    eq(g.winner, 0); eq(g.winReason, 'curse');
    const g2 = await T.sandbox({ p0: { hand: ['t_curse2'], mana: 5 }, p1: { curse: 13, curseLimit: 15 } });
    await play(g2, 0, 't_curse2');
    eq(g2.winner, 0);
  });

  test('seals win: 5 distinct keys incl. wild; duplicates count once; noSpecialWin blocks', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_key1', 't_key1', 't_key2', 't_key3', 't_key4', 't_keyw'], mana: 5 } });
    await play(g, 0, 't_key1'); await play(g, 0, 't_key1');
    eq(g.distinctKeys(0), 1);
    await play(g, 0, 't_key2'); await play(g, 0, 't_key3'); await play(g, 0, 't_key4');
    eq(g.distinctKeys(0), 4); eq(g.winner, null);
    await play(g, 0, 't_keyw');
    eq(g.winner, 0); eq(g.winReason, 'seals');
    eq(g.players[0].seals.length, 6);
    const g2 = await T.sandbox({ p0: { hand: ['t_keyw'], seals: ['t_key1', 't_key2', 't_key3', 't_key4'], mana: 5, statuses: { noSpecialWin: true } } });
    await play(g2, 0, 't_keyw');
    eq(g2.winner, null);
  });

  test('deck-out: drawing from an empty deck loses', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_draw2'], deck: ['t_vanilla'], mana: 5 } });
    await play(g, 0, 't_draw2');
    eq(g.winner, 1); eq(g.winReason, 'deckout');
  });

  test('hand limit 6 enforced at end of turn via pick', async function () {
    const many = ['t_vanilla', 't_vanilla', 't_vanilla', 't_vanilla', 't_vanilla', 't_vanilla', 't_spark', 't_bolt'];
    const g = await T.sandbox({ p0: { hand: many, chooser: T.lastChooser }, p1: { deck: ['t_vanilla'] } });
    await g.endTurn(0);
    eq(hand(g, 0).length, 6);
    eq(g.players[0].grave.length, 2);
    ok(byDef(hand(g, 0), 't_bolt'), 'lastChooser kept the last 6');
    ok(!byDef(hand(g, 0), 't_vanilla') || hand(g, 0).filter(function (c) { return c.defId === 't_vanilla'; }).length === 4);
  });

  test('extra turns + streak; noExtraTurn blocks', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_extra', 't_extra'], mana: 10, deck: ['t_vanilla', 't_vanilla', 't_vanilla'] }, p1: { deck: ['t_vanilla'] } });
    await play(g, 0, 't_extra');
    eq(g.players[0].extraTurns, 1);
    await g.endTurn(0);
    eq(g.active, 0); eq(g.streak, 2); eq(g.turn, 2);
    eq(g.players[0].maxMana, 11, 'extra turn is a full turn: maxMana+1');
    eq(hand(g, 0).length, 2, 'drew');
    await g.endTurn(0);
    eq(g.active, 1); eq(g.streak, 1);
    const g2 = await T.sandbox({ p0: { hand: ['t_extra'], mana: 10, statuses: { noExtraTurn: true } } });
    await play(g2, 0, 't_extra');
    eq(g2.players[0].extraTurns, 0);
  });

  test('exile vs grave: exiled card never returns (phoenix onLeave ignored), destroy → grave', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_kill', 't_exile'], mana: 5 }, p1: { board: ['t_phoenix', 't_vanilla'] } });
    const ph = byDef(g.players[1].board, 't_phoenix');
    const van = byDef(g.players[1].board, 't_vanilla');
    await g.playCard(0, byDef(hand(g, 0), 't_kill').uid, { choices: { targets: [ph.uid] } });
    eq(hand(g, 1).length, 1, 'phoenix returned to hand on destroy');
    eq(g.players[1].grave.length, 0);
    eq(g.players[0].grave.length, 1, 'the spell itself went to grave');
    await g.playCard(0, byDef(hand(g, 0), 't_exile').uid, { choices: { targets: [van.uid] } });
    eq(g.players[1].exile.length, 1); eq(g.players[1].grave.length, 0);
    // exile a phoenix: onLeave fires but card is in exile
    const g2 = await T.sandbox({ p0: { hand: ['t_exile'], mana: 5 }, p1: { board: ['t_phoenix'] } });
    await g2.playCard(0, hand(g2, 0)[0].uid, { choices: { targets: [g2.players[1].board[0].uid] } });
    eq(g2.players[1].exile.length, 1); eq(hand(g2, 1).length, 0);
  });

  test('reprise: play from grave for reprise cost, then exiled; noGravePlay blocks', async function () {
    const g = await T.sandbox({ p0: { grave: ['t_reprise'], deck: ['t_vanilla', 't_vanilla'], mana: 5 } });
    const pl = g.getPlayable(0);
    eq(pl.length, 1); eq(pl[0].from, 'grave'); eq(pl[0].cost, 0);
    await g.playCard(0, pl[0].uid);
    eq(hand(g, 0).length, 1); eq(g.players[0].exile.length, 1); eq(g.players[0].grave.length, 0);
    eq(g.players[0].chain, 1, 'reprise counts toward chain');
    const g2 = await T.sandbox({ p0: { grave: ['t_reprise'], mana: 5, statuses: { noGravePlay: true } } });
    eq(g2.getPlayable(0).length, 0);
  });

  test('loop detection fires on a 2-card loop (altar + phoenix) and runLoop(10)', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_phoenix'], crests: ['t_crest_altar', 't_crest_gate'], mana: 0 }, p1: { life: 40 } });
    const rec = T.record(g, ['loopDetected']);
    for (let i = 0; i < 3; i++) {
      await play(g, 0, 't_phoenix');
      const ab = g.getAbilities(0);
      eq(ab.length, 1);
      await g.useAbility(0, ab[0].uid, ab[0].targets);
    }
    eq(rec.count('loopDetected'), 1, 'detected after 3rd repeat');
    ok(g.loop.detected); eq(g.loop.detected.cycle.length, 2);
    const curseBefore = g.players[1].curse;
    eq(curseBefore, 6);
    const res = await g.runLoop(0, 5);
    eq(res.iterations, 5);
    eq(g.players[1].curse, 16);
    eq(g.players[0].mana, 3 + 5, 'mana +1 per iteration');
  });

  test('runLoop("inf") ends at win and emits loopIteration', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_phoenix'], crests: ['t_crest_altar', 't_crest_gate'], mana: 0 } });
    const rec = T.record(g, ['loopIteration', 'win']);
    for (let i = 0; i < 3; i++) {
      await play(g, 0, 't_phoenix');
      const ab = g.getAbilities(0);
      await g.useAbility(0, ab[0].uid, ab[0].targets);
    }
    const res = await g.runLoop(0, 'inf');
    eq(g.winner, 0); eq(g.winReason, 'curse');
    eq(res.reason, 'win');
    eq(rec.count('loopIteration'), res.iterations);
    ok(res.iterations === 7, 'needs 7 more iterations (6 + 14 = 20): got ' + res.iterations);
  });

  test('runLoop("inf") with no win condition stops with overflow at 999', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_phoenix'], crests: ['t_crest_altar'], mana: 0 } });
    const rec = T.record(g, ['overflow']);
    for (let i = 0; i < 3; i++) {
      await play(g, 0, 't_phoenix');
      const ab = g.getAbilities(0);
      await g.useAbility(0, ab[0].uid, ab[0].targets);
    }
    const res = await g.runLoop(0, 'inf');
    eq(res.reason, 'overflow'); eq(res.iterations, 999); eq(rec.count('overflow'), 1);
    eq(g.winner, null);
    g.declareLoopWin(0); eq(g.winReason, 'loopInfinite');
  });

  test('loopSecondIterationVoid (零の聖域) stops a loop after 1 iteration', async function () {
    const g = await T.sandbox({ field: 't_field_zero', p0: { hand: ['t_phoenix'], crests: ['t_crest_altar'], mana: 0 } });
    for (let i = 0; i < 3; i++) {
      await play(g, 0, 't_phoenix');
      const ab = g.getAbilities(0);
      await g.useAbility(0, ab[0].uid, ab[0].targets);
    }
    const res = await g.runLoop(0, 10);
    eq(res.iterations, 1); eq(res.reason, 'void');
  });

  test('cardsPerTurnLimit (神殿) blocks plays; sameNamePerTurnLimit blocks loop', async function () {
    const g = await T.sandbox({ field: 't_field_temple', p0: { hand: ['t_spark', 't_spark', 't_spark'], mana: 5, deck: ['t_vanilla', 't_vanilla', 't_vanilla'] } });
    await play(g, 0, 't_spark'); await play(g, 0, 't_spark');
    const r = await play(g, 0, 't_spark');
    eq(r.ok, false); eq(r.reason, 'cardsPerTurnLimit');
    const g2 = await T.sandbox({ p0: { hand: ['t_phoenix'], crests: ['t_crest_altar'], mana: 0, statuses: { sameNamePerTurnLimit: 1 } } });
    await play(g2, 0, 't_phoenix');
    const ab = g2.getAbilities(0); await g2.useAbility(0, ab[0].uid, ab[0].targets);
    eq(g2.getPlayable(0).length, 0, 'second phoenix play refused');
  });

  test('statuses: expiry at end of the bound turn (cannotAttack during opponent next turn)', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_status_cannot'], mana: 5, deck: ['t_vanilla', 't_vanilla'] }, p1: { board: ['t_vanilla'], deck: ['t_vanilla', 't_vanilla'] } });
    await play(g, 0, 't_status_cannot');
    ok(g.players[1].statuses.cannotAttack);
    await g.endTurn(0);
    eq(g.getAttackers(1).length, 0, 'cannot attack');
    await g.endTurn(1);
    ok(!g.players[1].statuses.cannotAttack, 'expired');
    await g.endTurn(0);
    eq(g.getAttackers(1).length, 1);
  });

  test('setStatus thisTurn expires at own turn end; effectTimes via statuses.allEffectsMultiplier', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_sprite'], mana: 5, statuses: { allEffectsMultiplier: 2 } } });
    const m0 = g.players[0].mana;
    await play(g, 0, 't_sprite');
    eq(g.players[0].mana, m0 + 2, 'onSummon fired twice');
    g.setStatus(0, 'foo', 1, { untilEndOfTurnOf: 'thisTurn' });
    await g.endTurn(0);
    ok(!g.players[0].statuses.foo);
  });

  test('snapshot/restore: turnSnapshots keep last 3; restore with keepHandOf', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_bolt', 't_spark'], mana: 5, deck: ['t_vanilla', 't_vanilla', 't_vanilla', 't_vanilla'] }, p1: { deck: ['t_vanilla', 't_vanilla', 't_vanilla', 't_vanilla'] } });
    eq(g.turnSnapshots.length, 1);
    g.snapshot('tag');
    await play(g, 0, 't_bolt');
    eq(g.players[1].life, 37);
    await play(g, 0, 't_spark');
    const handNow = hand(g, 0).map(function (c) { return c.uid; });
    g.restore('tag', { keepHandOf: 0 });
    eq(g.players[1].life, 40, 'life restored');
    eq(g.players[0].grave.length, 0, 'grave restored (empty)');
    T.deepEq(hand(g, 0).map(function (c) { return c.uid; }), handNow, 'hand kept as it is now');
    eq(g.players[0].deck.length, 3, 'deck as in snapshot minus nothing… drawn card is in kept hand, removed from deck');
    // kept hand card must not be duplicated anywhere
    const uids = {};
    g.players[0].deck.concat(g.players[0].hand, g.players[0].grave).forEach(function (c) { ok(!uids[c.uid], 'dup uid ' + c.uid); uids[c.uid] = true; });
    for (let i = 0; i < 4; i++) { await g.endTurn(g.active); }
    eq(g.turnSnapshots.length, 3);
    const s = g.turnSnapshotOf(0, 1);
    ok(s && s.player === 0);
  });

  test('restore from turnSnapshot (巻き戻しの鐘) resets mana but keeps hand', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_spark', 't_spark'], mana: 2, deck: ['t_vanilla', 't_vanilla'] } });
    await play(g, 0, 't_spark'); await play(g, 0, 't_spark');
    eq(g.players[0].mana, 4); eq(hand(g, 0).length, 2);
    g.restore(g.turnSnapshotOf(0, 0).state, { keepHandOf: 0 });
    eq(g.players[0].mana, 1, 'turn-start mana (engine turn-1 value; sandbox override came after the snapshot)');
    eq(hand(g, 0).length, 2, 'hand kept');
    eq(g.players[0].grave.length, 0);
    eq(g.players[0].deck.length, 0, 'drawn cards stay in hand, not duplicated in deck');
  });

  test('clone independence and serialize round trip', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_bolt', 't_vanilla'], board: ['t_big'], crests: ['t_crest_mana'], mana: 5, maxMana: 11, deck: ['t_vanilla', 't_vanilla'] }, p1: { board: ['t_guard'], deck: ['t_vanilla'] } });
    const c = g.clone();
    eq(c.log.length, 0, 'clone has no log');
    await c.playCard(0, byDef(c.players[0].hand, 't_bolt').uid);
    eq(c.players[1].life, 37); eq(g.players[1].life, 40, 'original untouched');
    eq(c.players[0].hand.length, 1); eq(g.players[0].hand.length, 2);
    c.rng.next();
    T.neq(c.rng.state().s, g.rng.state().s);
    const json = JSON.stringify(g.serialize());
    const g2 = G.Engine.deserialize(JSON.parse(json));
    eq(JSON.stringify(g2.serialize()), json, 'round trip stable');
    eq(g2.players[0].hand.length, 2);
    await g2.playCard(0, byDef(g2.players[0].hand, 't_bolt').uid);
    eq(g2.players[1].life, 37);
    // hooks still work after deserialize (crest onTurnStart)
    await g2.endTurn(0); await g2.endTurn(1);
    eq(g2.players[0].mana, 13, 'maxMana 11+1 and crest +1');
  });

  test('serialize performance: 200 clones under 1s', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_bolt', 't_vanilla', 't_spark', 't_spark', 't_spark'], board: ['t_big', 't_vanilla'], crests: ['t_crest_mana', 't_crest_a'], deck: new Array(25).fill('t_vanilla') }, p1: { board: ['t_guard'], deck: new Array(25).fill('t_vanilla') } });
    const t0 = Date.now();
    for (let i = 0; i < 200; i++) g.clone();
    ok(Date.now() - t0 < 1000, 'clone too slow: ' + (Date.now() - t0) + 'ms');
  });

  test('log is capped at 300 entries', async function () {
    const g = await T.sandbox({ p0: {} });
    for (let i = 0; i < 400; i++) g.addLog('x' + i);
    eq(g.log.length, 300);
  });

  test('pick: chooser receives spec and candidates; cast() copies do not add chain; copiesCountChain flips', async function () {
    let seen = null;
    const g = await T.sandbox({ p0: { board: ['t_vanilla', 't_big'], mana: 5, chooser: function (spec, cands) { seen = { spec: spec, n: cands.length }; return [cands[1]]; } } });
    const ctx = g.makeCtx(0, null);
    const picked = await ctx.pick({ kind: 'monster', side: 'ally', count: 1, prompt: 'x' });
    eq(picked[0].defId, 't_big'); eq(seen.n, 2); eq(seen.spec.prompt, 'x');
    await ctx.cast('t_bolt', 0, { copy: true });
    eq(g.players[1].life, 37); eq(g.players[0].chain, 0, 'copy does not count');
    eq(g.players[0].grave.length, 0, 'copies vanish');
    g.setStatus(0, 'copiesCountChain', true);
    await ctx.cast('t_bolt', 0, { copy: true });
    eq(g.players[0].chain, 1);
  });

  test('summon via ctx refuses when board full; maxBoard status raises cap', async function () {
    const g = await T.sandbox({ p0: { board: ['t_vanilla', 't_vanilla', 't_vanilla', 't_vanilla', 't_vanilla'], hand: ['t_vanilla'], mana: 5 } });
    eq(g.getPlayable(0).length, 0, 'board full');
    g.setStatus(0, 'maxBoard', 10);
    eq(g.getPlayable(0).length, 1);
    const ctx = g.makeCtx(0, null);
    const s = await ctx.summon('t_vanilla', 0);
    ok(s); eq(g.players[0].board.length, 6);
  });

  test('onDeath + steal + vault + moveCurse + extra ctx helpers', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_sacrifice'], board: ['t_skel'], mana: 5, curse: 3 }, p1: { board: ['t_big'], hand: ['t_vanilla'] } });
    await g.playCard(0, hand(g, 0)[0].uid, { choices: { targets: [g.players[0].board[0].uid] } });
    eq(g.players[1].curse, 1, 'onDeath curse');
    const ctx = g.makeCtx(0, null);
    const stolen = await ctx.steal(g.players[1].board[0], 0);
    ok(stolen); eq(g.players[0].board.length, 1); eq(stolen.stolenFrom, 1);
    await ctx.vaultSteal(g.players[1].hand[0], 0);
    eq(g.players[0].vault.length, 1); eq(hand(g, 1).length, 0);
    await ctx.moveCurse(0, 1);
    eq(g.players[0].curse, 0); eq(g.players[1].curse, 4);
  });

  test('prophecy crest: fixed timer ignores manual adjust, fires special win; taboo crest cannot be removed', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_prophecy', 't_gear'], mana: 5, deck: ['t_vanilla', 't_vanilla', 't_vanilla'] }, p1: { deck: ['t_vanilla', 't_vanilla', 't_vanilla'] } });
    await play(g, 0, 't_prophecy');
    eq(g.players[0].crests.length, 1, 'timed crest stays in the crest zone with a timer');
    const pr = g.players[0].crests[0];
    eq(pr.timedCount, 2);
    await play(g, 0, 't_gear');
    await g.makeCtx(0, null).adjustTimed([pr], -1);
    eq(pr.timedCount, 2, 'fixed timer unchanged');
    await g.endTurn(0); await g.endTurn(1); // tick → 1
    eq(pr.timedCount, 1);
    await g.endTurn(0); await g.endTurn(1); // → 0 fires
    eq(g.winner, 0); eq(g.winReason, 'prophecy');
    const g2 = await T.sandbox({ p0: { crests: ['t_prophecy'] } });
    const ok2 = await g2.makeCtx(1, null).removeCrest(g2.players[0].crests[0]);
    eq(ok2, false);
  });

  test('hazard & forecast: hazard() sums weights of passing tests; setForecast emits and auto-cancels', async function () {
    const tests = [
      { test: function (game, me) { return me.crests.length > 0; }, weight: 60 },
      { test: function (game, me) { return me.hand.some(function (c) { return c.defId === 't_bolt'; }); }, weight: 40 }
    ];
    const g = await T.sandbox({ p0: { hand: ['t_kill'], mana: 5 }, p1: { hazardTests: tests, crests: ['t_crest_a'], hand: ['t_bolt'], board: ['t_vanilla'] } });
    eq(g.hazard(1), 100);
    const rec = T.record(g, ['forecast', 'forecastCancelled']);
    g.setForecast(1, true, '次のターン、嵐が来る');
    ok(g.isForecasted(1)); eq(rec.count('forecast'), 1);
    // P0 removes the bolt from P1's hand → hazard drops → forecast cancelled on P0's action
    await g.makeCtx(0, null).discard(hand(g, 1), 1);
    eq(g.hazard(1), 60);
    await g.playCard(0, hand(g, 0)[0].uid, { choices: { targets: [g.players[1].board[0].uid] } });
    ok(!g.isForecasted(1)); eq(rec.count('forecastCancelled'), 1);
    ok(g.players[1].forecastCancelled);
  });

  test('defs: duplicate id and missing fields throw', function () {
    T.throws(function () { DB.register({ id: 't_vanilla', name: 'x', type: 'monster', cost: 1, atk: 1, hp: 1 }); }, /duplicate/);
    T.throws(function () { DB.register({ id: 't_bad1', name: 'x', type: 'spell' }); }, /cost/);
    T.throws(function () { DB.register({ id: 't_bad2', name: 'x', type: 'monster', cost: 1 }); }, /atk/);
    T.throws(function () { DB.register({ id: 't_bad3', type: 'spell', cost: 1 }); }, /name/);
    T.throws(function () { DB.register({ id: 't_bad4', name: 'x', type: 'trap', cost: 1 }); }, /type/);
    T.throws(function () { G.EnemyDB.register({ id: 't_e', name: 'x', life: 10, deck: [], hazard: [{ weight: 10 }] }); }, /hazard/);
    ok(!DB.has('t_bad1'));
  });

  test('RNG: seedable, state/restore reproduces sequence', function () {
    const a = new G.RNG(42), b = new G.RNG(42);
    for (let i = 0; i < 5; i++) eq(a.next(), b.next());
    const st = a.state();
    const x = a.next();
    a.restore(st);
    eq(a.next(), x);
    const arr = [1, 2, 3, 4, 5];
    a.shuffle(arr); eq(arr.length, 5);
    ok(a.int(10) < 10);
  });

  test('events: cardPlayed/summon/damage/turnStart emitted with uids/defIds', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_vanilla', 't_bolt'], mana: 5 }, p1: { deck: ['t_vanilla'] } });
    const rec = T.record(g);
    await play(g, 0, 't_vanilla');
    await play(g, 0, 't_bolt');
    eq(rec.count('cardPlayed'), 2); eq(rec.count('summon'), 1); eq(rec.count('damage'), 1);
    eq(rec.last('damage').amount, 3);
    await g.endTurn(0);
    eq(rec.count('turnEnd'), 1); eq(rec.count('turnStart'), 1);
    eq(rec.last('turnStart').who, 1);
  });

  test('replayable action descriptors are recorded with defIds', async function () {
    const g = await T.sandbox({ p0: { hand: ['t_rush'], board: ['t_big'], mana: 5 }, p1: { board: ['t_vanilla'] } });
    await play(g, 0, 't_rush');
    await g.attack(0, byDef(g.players[0].board, 't_big').uid, g.players[1].board[0].uid);
    eq(g.turnActions.length, 2);
    eq(g.turnActions[0].type, 'play'); eq(g.turnActions[0].defId, 't_rush'); eq(g.turnActions[0].from, 'hand');
    eq(g.turnActions[1].type, 'attack'); eq(g.turnActions[1].attackerDefId, 't_big'); eq(g.turnActions[1].target.defId, 't_vanilla');
    await g.endTurn(0);
    eq(g.prevTurnActions.length, 2); eq(g.turnActions.length, 0);
    ok(g.prevTurnActionSnapshots.length === 2, 'per-action pre-snapshots kept for previous turn');
  });
})(globalThis.G);
