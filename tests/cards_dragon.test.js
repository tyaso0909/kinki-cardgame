'use strict';
// tests/cards_dragon.test.js — 竜カード20枚と禁忌の竜6体（2026-11）。
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const DB = G.CardDB;

  function byDef(arr, id) { return arr.find(function (c) { return c.defId === id; }); }
  async function play(g, i, defId, choices) {
    const c = byDef(g.players[i].hand, defId);
    ok(c, 'card ' + defId + ' in hand');
    const r = await g.playCard(i, c.uid, { choices: choices || {} });
    ok(r.ok, 'play ' + defId + ' failed: ' + r.reason);
    return r;
  }
  if (!DB.has('tx_vanilla')) DB.register({ id: 'tx_vanilla', name: 'テスト用の兵士', type: 'monster', lineage: 'generic', role: 'fuel', rarity: 'common', cost: 1, atk: 2, hp: 3, text: '2/3', effects: {} });
  const filler = function (n, id) { return new Array(n).fill(id || 'basic_01'); };
  const mon = function (g, i, id) { return byDef(g.monstersOf(i), id); };
  const DRAGONS = ['accel_36', 'accel_37', 'accel_38', 'cycle_31', 'cycle_32', 'cycle_33', 'chain_32', 'chain_33', 'chain_34', 'time_32', 'time_33', 'time_34', 'copy_32', 'copy_33', 'copy_34', 'doom_33', 'doom_34', 'doom_35', 'gen_44', 'gen_45'];
  const TABOO = ['accel_39', 'cycle_34', 'chain_35', 'time_35', 'copy_35', 'doom_36'];

  test('dragon set: 26 cards, taboo dragons are uncastable 禁忌 dragons named 禁忌の〇〇竜', function () {
    eq(DRAGONS.length + TABOO.length, 26);
    DRAGONS.concat(TABOO).forEach(function (id) { ok(DB.has(id), id); ok(G.Data.isProjectCard(DB.get(id)), id); });
    TABOO.forEach(function (id) {
      const d = DB.get(id);
      eq(d.rarity, 'taboo', id); ok(d.uncastable, id); ok(d.tags.indexOf('dragon') >= 0, id);
      ok(/^禁忌の.+竜$/.test(d.name), d.name); ok(d.effects.handAbility, id);
    });
    eq(new Set(TABOO.map(function (id) { return DB.get(id).lineage; })).size, 6, 'one per lineage');
    ok(G.Data.validateAll().ok);
  });

  // ---------------------------------------------------------------- 禁忌の竜: hand ability
  test('禁忌の竜: cannot be played; hand ability needs 4 same-lineage monsters (either side, phantoms, 加護 too)', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_35'], board: ['copy_03'], phantoms: ['copy_02'], mana: 99, deck: filler(5) }, p1: { board: ['copy_03', 'gen_31'], deck: filler(5) } });
    const card = byDef(g.players[0].hand, 'copy_35');
    eq(g.canPlayCard(0, card).reason, 'uncastable');
    ok(!g.getAbilities(0).some(function (a) { return a.uid === card.uid; }), 'only 3 copy monsters → not yet');
    // a warded copy monster on the enemy side counts too
    const c1 = g.makeCtx(1, null);
    const w = g.addCard(1, 'copy_03', 'board'); w.keywords.push('ward');
    const ab = g.getAbilities(0).find(function (a) { return a.uid === card.uid; });
    ok(ab, 'ability available with 4 (incl. a phantom and a warded enemy)');
    const r = await g.useAbility(0, card.uid, []);
    ok(r.ok, r.reason);
    eq(g.players[1].board.filter(function (m) { return m.defId === 'copy_03'; }).length, 0, 'enemy copy monsters destroyed');
    const drag = g.players[0].board.find(function (m) { return m.defId === 'copy_35'; });
    ok(drag && drag.oboro, '朧 copy on the field');
    ok(byDef(g.players[0].hand, 'copy_35'), 'the card stays in hand');
    ok(!g.getAbilities(0).some(function (a) { return a.uid === card.uid; }), 'once per turn');
    void c1;
  });

  test('禁忌の劫火竜: refill mana, damage = mana gained; 15/15 rush pierce', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_39'], board: ['accel_01', 'accel_01', 'accel_01', 'accel_01'], mana: 2, maxMana: 10, deck: filler(5) } });
    const card = byDef(g.players[0].hand, 'accel_39');
    await g.useAbility(0, card.uid, []);
    const d = mon(g, 0, 'accel_39');
    ok(d && d.oboro); eq(g.players[0].mana, 10);
    eq(g.players[1].life, 40 - g.players[0].manaGainedThisTurn);
    ok(g.canAttackWith(0, d), 'rush');
  });

  test('禁忌の万巻竜: draw 5, mill hand×3', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_34'], board: ['cycle_02', 'cycle_02', 'cycle_02', 'cycle_02'], deck: filler(10) }, p1: { deck: filler(40) } });
    await g.useAbility(0, byDef(g.players[0].hand, 'cycle_34').uid, []);
    const hand = g.players[0].hand.length;
    eq(hand, 1 + 5);
    eq(g.players[1].deck.length, 40 - hand * 3);
  });

  test('禁忌の天雷竜: chain +10 then that much to the player and every enemy monster', async function () {
    const g = await T.sandbox({ p0: { hand: ['chain_35'], board: ['chain_01', 'chain_01', 'chain_01'], deck: filler(5) }, p1: { board: ['chain_01', 'gen_31'], deck: filler(5) } });
    g.players[0].chain = 2;
    await g.useAbility(0, byDef(g.players[0].hand, 'chain_35').uid, []);
    eq(g.players[0].chain, 12); eq(g.players[1].life, 40 - 12);
    eq(g.players[1].board.length, 0, 'the enemy chain monster was fodder; the 9/9 takes 12 and dies');
  });

  test('禁忌の永劫竜: two extra turns, fires my timed cards now', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_35'], board: ['time_01', 'time_01', 'time_01', 'time_01'], timed: [{ id: 'time_07', count: 5 }], deck: filler(8) }, p1: { deck: filler(8) } });
    await g.useAbility(0, byDef(g.players[0].hand, 'time_35').uid, []);
    eq(g.players[0].extraTurns, 2); eq(g.players[0].timed.length, 0); eq(g.players[1].life, 30);
    await g.endTurn(0); eq(g.active, 0); await g.endTurn(0); eq(g.active, 0); await g.endTurn(0); eq(g.active, 1);
  });

  test('禁忌の万華竜: five phantoms; my phantoms have 速攻 (and 連撃 from the copy)', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_35'], board: ['copy_03', 'copy_03', 'copy_03', 'copy_03'], deck: filler(5) }, p1: { deck: filler(5) } });
    await g.useAbility(0, byDef(g.players[0].hand, 'copy_35').uid, []);
    eq(g.players[0].phantoms.length, 5);
    const ph = g.players[0].phantoms[0];
    ok(g.hasKeyword(ph, 'rush') && g.canAttackWith(0, ph), 'phantom rush');
    eq(ph.attacksLeft, 2, '連撃 copied');
  });

  test('禁忌の黄泉竜: curse 10; +3 curse per enemy monster destroyed', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_36'], board: ['doom_01', 'doom_01', 'doom_01', 'doom_01'], deck: filler(5) }, p1: { board: ['tx_vanilla'], deck: filler(5) }, });
    await g.useAbility(0, byDef(g.players[0].hand, 'doom_36').uid, []);
    // 4 骸骨兵 died: each curses the enemy 1 (their own death effect)
    const c0 = g.players[1].curse;
    ok(c0 >= 10);
    await g.makeCtx(0, null).destroy(g.players[1].board[0]);
    eq(g.players[1].curse, c0 + 3);
  });

  // ---------------------------------------------------------------- 20 dragon cards
  test('加速: 炎竜の幼体 (hand dragon −2) / 竜の咆哮 (3 per dragon) / 原初の焔竜 (others rush +3/+3)', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_36', 'accel_14', 'accel_37', 'accel_38'], board: ['accel_36'], mana: 30, deck: filler(5) }, p1: { deck: filler(5) } });
    const drake = byDef(g.players[0].hand, 'accel_14'); const c0 = g.costOf(0, drake);
    await play(g, 0, 'accel_36'); eq(g.costOf(0, drake), c0 - 2);
    await play(g, 0, 'accel_38');
    const pup = g.players[0].board.find(function (m) { return m.defId === 'accel_36' && m.summonedTurn === g.turn; });
    ok(g.hasKeyword(pup, 'rush')); eq(g.atkOf(pup), 4);
    await play(g, 0, 'accel_37');
    eq(g.players[1].life, 40 - 3 * 3);
  });

  test('循環: 潮騒の子竜 (tutor a dragon) / 竜の書庫 (draw 2 per dragon) / 大渦の古竜 (grave dragons to hand)', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_31', 'cycle_33'], crests: ['cycle_32'], grave: ['accel_36', 'accel_14', 'tx_vanilla'], mana: 30, deck: ['basic_01', 'basic_01', 'basic_01', 'accel_24', 'basic_01', 'basic_01'] } });
    const before = g.players[0].hand.length;
    await play(g, 0, 'cycle_31');
    ok(byDef(g.players[0].hand, 'accel_24'), 'tutored 焔帝竜');
    eq(g.players[0].hand.length, before - 1 + 1 + 2, '+1 tutor +2 書庫');
    await play(g, 0, 'cycle_33');
    ok(byDef(g.players[0].hand, 'accel_36') && byDef(g.players[0].hand, 'accel_14'), 'grave dragons returned');
    ok(byDef(g.players[0].grave, 'tx_vanilla'), 'non-dragon stays');
  });

  test('連鎖: 雷竜の雛 (charge, chain+1) / 迅雷の竜翼 (rush+double this turn) / 万雷の竜神', async function () {
    const g = await T.sandbox({ p0: { hand: ['chain_32', 'chain_33', 'chain_34'], board: ['accel_36'], mana: 30, deck: filler(5) }, p1: { board: [{ id: 'tx_vanilla', hp: 3 }], deck: filler(5) } });
    await play(g, 0, 'chain_32');
    const hatch = mon(g, 0, 'chain_32');
    ok(g.hasKeyword(hatch, 'charge'));
    await play(g, 0, 'chain_33');
    ok(g.hasKeyword(hatch, 'rush') && g.hasKeyword(hatch, 'double')); eq(hatch.attacksLeft, 2);
    await play(g, 0, 'chain_34');
    const n = g.players[0].chain;
    eq(g.players[1].life, 40 - n);
    await g.endTurn(0);
    ok(!g.hasKeyword(hatch, 'double'), 'expired');
  });

  test('時間: 眠る時竜 (+2/+2 each turn) / 竜の刻 (free dragon) / 永劫の時竜 (extra turn, a dragon costs 0)', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_33', 'time_34', 'accel_24', 'accel_39'], board: ['time_32'], mana: 30, deck: filler(8) }, p1: { deck: filler(8) } });
    const sleeper = mon(g, 0, 'time_32');
    const a0 = g.atkOf(sleeper);
    await play(g, 0, 'time_34');
    eq(g.players[0].extraTurns, 1);
    await g.endTurn(0); // extra turn starts: 焔帝竜 cost → 0 (禁忌 skipped)
    eq(g.costOf(0, byDef(g.players[0].hand, 'accel_24')), 0);
    eq(g.atkOf(sleeper), a0 + 2, '眠る時竜 grew on my turn start');
    await play(g, 0, 'time_33');
    await g.endTurn(0); await g.endTurn(1);
    ok(mon(g, 0, 'accel_24'), '竜の刻 put 焔帝竜 out');
    ok(byDef(g.players[0].hand, 'accel_39'), '禁忌の竜 never put out for free');
  });

  test('複製: 鏡鱗の子竜 / 竜の映し身 / 千鏡の幻竜', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_32', 'copy_33', 'copy_34'], mana: 30, deck: filler(5) } });
    await play(g, 0, 'copy_32');
    eq(g.players[0].phantoms.length, 2); ok(g.isDragon(g.players[0].phantoms[0]), 'phantoms are dragons');
    await play(g, 0, 'copy_33', { targets: [mon(g, 0, 'copy_32').uid] });
    eq(g.players[0].phantoms.length, 5);
    await play(g, 0, 'copy_34');
    eq(g.players[0].phantoms.length, 5 + 7, 'one per dragon (1 + 5 phantoms + itself)');
  });

  test('終焉: 骨竜の幼体 / 竜葬の儀 / 封じられし古竜 (attacks only with 3 kinds of keys)', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_34', 'accel_14'], board: ['doom_33', { id: 'doom_35', summonedTurn: 0 }], mana: 30, deck: filler(5) }, p1: { deck: filler(5) } });
    const drake = byDef(g.players[0].hand, 'accel_14'); const c0 = g.costOf(0, drake);
    const old = mon(g, 0, 'doom_35');
    ok(!g.canAttackWith(0, old), 'sealed');
    await g.makeCtx(0, null).destroy(mon(g, 0, 'doom_33'));
    eq(g.costOf(0, drake), c0 - 2);
    await play(g, 0, 'doom_34', { targets: [old.uid] });
    eq(g.players[1].curse, 12);
    const g2 = await T.sandbox({ p0: { board: [{ id: 'doom_35', summonedTurn: 0 }], seals: ['doom_05', 'doom_06', 'doom_07'], deck: filler(5) } });
    ok(g2.canAttackWith(0, mon(g2, 0, 'doom_35')), 'three kinds of keys → can attack');
  });

  test('汎用: 竜狩りの大弩 (destroy a dragon) / 竜の盟約 (my dragons have 加護)', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_44'], mana: 10, deck: filler(5) }, p1: { board: ['accel_36', 'tx_vanilla'], crests: [], deck: filler(5) } });
    const cands = g.makeCtx(0, null).candidatesFor(DB.get('gen_44').targets).map(function (m) { return m.defId; });
    eq(cands.join(), 'accel_36', 'only dragons');
    await play(g, 0, 'gen_44', { targets: [mon(g, 1, 'accel_36').uid] });
    eq(g.players[1].board.length, 1);
    const g2 = await T.sandbox({ p0: { hand: ['gen_44'], mana: 10, deck: filler(5) }, p1: { board: ['accel_36'], crests: ['gen_45'], deck: filler(5) } });
    ok(g2.hasKeyword(mon(g2, 1, 'accel_36'), 'ward'));
    eq(g2.makeCtx(0, null).candidatesFor(DB.get('gen_44').targets).length, 0, '盟約: warded from 大弩');
  });
})(globalThis.G = globalThis.G || {});
