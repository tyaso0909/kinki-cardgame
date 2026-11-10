'use strict';
// tests/cards_time.test.js — 時間系統 time_01..25: smoke + targeted + SPEC combos.
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const Fx = G.Fx, DB = G.CardDB;
  function reg(def) { if (!DB.has(def.id)) DB.register(def); return def; }
  reg({ id: 'tb_vanilla', name: 'B兵', type: 'monster', cost: 1, atk: 2, hp: 3, effects: {} });
  reg({ id: 'tb_zero', name: 'B無', type: 'spell', cost: 0, effects: {} });
  reg({ id: 'tb_bolt', name: 'B稲妻', type: 'spell', cost: 0, effects: { onPlay: Fx.dmgOpp(5) } });
  reg({ id: 'tb_curse3', name: 'B呪詛3', type: 'spell', cost: 0, effects: { onPlay: Fx.curse(3) } });
  reg({ id: 'tb_rush', name: 'B速攻', type: 'monster', cost: 0, atk: 2, hp: 2, keywords: ['rush'], effects: {} });
  reg({ id: 'tb_manaburst', name: 'Bマナ爆発', type: 'spell', cost: 0, effects: { onPlay: Fx.gainMana(5) } });

  function byDef(arr, id) { return arr.find(function (c) { return c.defId === id; }); }
  async function play(g, i, defId, choices) {
    const p = g.players[i];
    const c = byDef(p.hand, defId) || byDef(p.grave, defId);
    ok(c, 'card ' + defId + ' available');
    const r = await g.playCard(i, c.uid, { choices: choices });
    ok(r.ok, 'play ' + defId + ' ok: ' + (r.reason || ''));
    return r;
  }
  const deck = function (n) { return new Array(n || 10).fill('tb_vanilla'); };
  const IDS = []; for (let i = 1; i <= 25; i++) IDS.push('time_' + (i < 10 ? '0' : '') + i);

  test('time: all 25 cards registered with SPEC metadata', function () {
    const names = ['時計仕掛けの小鳥', '砂時計の番人', '未来視の梟', '過去からの来訪者', '時の歯車', '時の前借り', '時限爆弾', '未来の手紙', '一瞬の永遠', '時間停止',
      '足止めの砂', '刻む時の紋章', '小さな巻き戻し', '時喰いの砂時計', '刻を統べる竜', '未来から来た英雄', '巻き戻しの鐘', '永遠の午後', '時渡りの剣士', '歴史改変',
      '時の王冠', '時を巡る魔女', '時の果て', '時間逆行', '止まった世界'];
    const costs = [1, 3, 2, 2, 0, 0, 1, 0, 2, 3, 2, 2, 1, 4, 7, 0, 3, 3, 3, 3, 5, 4, 5, 3, 8];
    const rar = ['common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common',
      'rare', 'rare', 'rare', 'rare', 'rare', 'rare', 'rare', 'legend', 'legend', 'legend', 'legend', 'taboo'];
    IDS.forEach(function (id, i) {
      const d = DB.get(id);
      eq(d.name, names[i], id); eq(d.cost, costs[i], id + ' cost'); eq(d.rarity, rar[i], id + ' rarity'); eq(d.lineage, 'time');
    });
    const types = { monster: 0, spell: 0, crest: 0, field: 0 };
    IDS.forEach(function (id) { types[DB.get(id).type]++; });
    eq(types.monster, 8); eq(types.spell, 12); eq(types.crest, 4); eq(types.field, 1);
    ok(DB.get('time_14').tags.indexOf('hourglass') >= 0);
    eq(DB.get('time_07').timed, 2); eq(DB.get('time_16').timed, 3); eq(DB.get('time_23').timed, 3);
    ok(DB.get('time_10').reserve && DB.get('time_11').reserve);
  });

  test('time: smoke — every card plays without throwing', async function () {
    for (let i = 0; i < IDS.length; i++) {
      const id = IDS[i];
      const g = await T.sandbox({ p0: { hand: [id, 'tb_zero'], board: ['tb_vanilla'], grave: ['tb_bolt', 'tb_vanilla'], timed: [{ id: 'time_07', count: 2 }], mana: 12, deck: deck(8) },
        p1: { board: ['tb_vanilla'], deck: deck(8) } });
      await play(g, 0, 'tb_zero');
      await play(g, 0, id);
      await g.endTurn(0);
      if (g.winner === null && g.active === 1) await g.endTurn(1);
      ok(g.winner === null || g.winner === 0, id + ' no self-loss');
    }
  });

  test('小鳥/番人/歯車/刻む時の紋章: count manipulation', async function () {
    // sandbox turn-1 start ticks once (and 刻む時の紋章 ticks one more): 5/5 → bomb 3, hero 4
    const g = await T.sandbox({ p0: { hand: ['time_01', 'time_05'], board: ['time_02'], crests: ['time_12'], timed: [{ id: 'time_07', count: 5 }, { id: 'time_16', count: 5 }], mana: 10, deck: deck(4) }, p1: { deck: deck(4) } });
    eq(g.players[0].timed[0].timedCount, 3, '刻む時の紋章 ticked the first card once more'); eq(g.players[0].timed[1].timedCount, 4);
    await play(g, 0, 'time_01'); eq(g.players[0].timed[0].timedCount, 2, 'first timed card -1');
    await play(g, 0, 'time_05'); eq(g.players[0].timed[0].timedCount, 1); eq(g.players[0].timed[1].timedCount, 3);
    const guard = byDef(g.players[0].board, 'time_02');
    await g.makeCtx(0, null).destroy(guard);
    // bomb reached 0 on 番人 death → fired 10
    eq(g.players[1].life, 30, 'bomb fired');
    eq(g.players[0].timed.length, 1); eq(g.players[0].timed[0].timedCount, 2, 'hero 3→2');
    await g.endTurn(0); await g.endTurn(1);
    // my turn start: natural tick -1 and 刻む時の紋章 -1 → 0 → hero summoned
    ok(byDef(g.players[0].board, 'time_16'), 'hero arrived'); eq(g.players[0].timed.length, 0);
  });

  test('未来視の梟 / 未来の手紙 / 時限爆弾: timed draws & damage', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_03', 'time_08', 'time_07'], mana: 10, deck: deck(8) }, p1: { deck: deck(4) } });
    await play(g, 0, 'time_03'); await play(g, 0, 'time_08'); await play(g, 0, 'time_07');
    eq(g.players[0].timed.length, 3);
    await g.endTurn(0); await g.endTurn(1);
    eq(g.players[0].hand.length, 6, 'turn draw 1 + owl 2 + letter 3');
    eq(g.players[0].timed.length, 1); eq(g.players[1].life, 40);
    await g.endTurn(0); await g.endTurn(1);
    eq(g.players[1].life, 30, 'bomb');
    eq(g.players[0].grave.filter(function (c) { return c.defId === 'time_03'; }).length, 0, 'owl timed token was a copy, not a real card');
  });

  test('過去からの来訪者 recovers a spell played last turn', async function () {
    const g = await T.sandbox({ p0: { hand: ['tb_bolt', 'time_04'], mana: 10, deck: deck(4) }, p1: { deck: deck(4) } });
    await play(g, 0, 'tb_bolt'); await g.endTurn(0); await g.endTurn(1);
    g.players[0].mana = 5;
    await play(g, 0, 'time_04');
    ok(byDef(g.players[0].hand, 'tb_bolt'), 'recovered');
  });

  test('時の前借り: +3 now, max mana -2 next turn', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_06'], mana: 2, maxMana: 5, deck: deck(4) }, p1: { deck: deck(4) } });
    await play(g, 0, 'time_06'); eq(g.players[0].mana, 5);
    await g.endTurn(0); await g.endTurn(1);
    eq(g.players[0].maxMana, 4, '5 +1 -2');
  });

  test('一瞬の永遠: monsters attack twice this turn', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_09'], board: ['tb_vanilla'], mana: 5 } });
    await play(g, 0, 'time_09');
    const m = g.players[0].board[0];
    await g.attack(0, m.uid, 'face'); eq(m.attacksLeft, 1);
    await g.attack(0, m.uid, 'face'); eq(g.players[1].life, 36);
    eq(g.getAttackers(0).length, 0);
  });

  test('時間停止: opponent cannot attack next turn; 足止めの砂: frozen timers + no extra turn', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_10', 'time_11'], mana: 10, deck: deck(3) }, p1: { hand: ['time_14'], board: ['tb_vanilla'], timed: [{ id: 'time_07', count: 2 }], deck: deck(3) } });
    await play(g, 0, 'time_10'); await play(g, 0, 'time_11'); await g.endTurn(0);
    eq(g.active, 1);
    eq(g.getAttackers(1).length, 0, 'cannot attack');
    eq(g.players[1].timed[0].timedCount, 2, 'timer frozen');
    g.players[1].mana = 10;
    await play(g, 1, 'time_14');
    eq(g.players[1].extraTurns, 0, 'extra turn negated');
    await g.endTurn(1);
    eq(g.active, 0, 'no extra turn happened');
    await g.endTurn(0);
    eq(g.players[1].timed[0].timedCount, 1, 'thawed next turn');
    ok(g.getAttackers(1).length >= 1, 'can attack again');
  });

  test('小さな巻き戻し revives a monster destroyed this turn', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_13'], board: ['tb_vanilla'], grave: ['tb_rush'], mana: 5 } });
    await g.makeCtx(0, null).destroy(g.players[0].board[0]);
    eq(g.players[0].board.length, 0);
    await play(g, 0, 'time_13');
    eq(g.players[0].board.length, 1); eq(g.players[0].board[0].defId, 'tb_vanilla', 'only the one destroyed this turn');
  });

  test('時喰いの砂時計: extra turn; returns to hand with 3+ in grave', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_14'], grave: ['time_14', 'time_14'], mana: 10, deck: deck(3) }, p1: { deck: deck(3) } });
    await play(g, 0, 'time_14');
    eq(g.players[0].extraTurns, 1); eq(g.players[0].grave.length, 3); eq(g.players[0].hand.length, 0, 'only 2 were in grave before');
    const g2 = await T.sandbox({ p0: { hand: ['time_14'], grave: ['time_14', 'time_14', 'time_14'], mana: 10 } });
    await play(g2, 0, 'time_14');
    ok(byDef(g2.players[0].hand, 'time_14'), 'returned to hand');
  });

  test('未来から来た英雄: timed 3 then summoned', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_16'], mana: 0, deck: deck(6) }, p1: { deck: deck(6) } });
    await play(g, 0, 'time_16');
    eq(g.players[0].timed.length, 1); eq(g.players[0].timed[0].timedCount, 3);
    for (let i = 0; i < 3; i++) { await g.endTurn(0); await g.endTurn(1); }
    eq(g.players[0].board.length, 1); eq(g.players[0].board[0].defId, 'time_16');
  });

  test('永遠の午後: tick 2 for both; 展開時 draw', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_18'], timed: [{ id: 'time_07', count: 2 }], mana: 5, deck: deck(4) }, p1: { timed: [{ id: 'time_07', count: 2 }], deck: deck(4) } });
    await play(g, 0, 'time_18'); eq(g.players[0].hand.length, 1);
    await g.endTurn(0); eq(g.players[0].life, 30, 'enemy bomb ticked 2 → fired');
    await g.endTurn(1); eq(g.players[1].life, 30);
  });

  test('時渡りの剣士: +3 atk only during extra turns', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_19', 'time_14'], mana: 10, deck: deck(4) }, p1: { deck: deck(4) } });
    await play(g, 0, 'time_19'); eq(g.atkOf(g.players[0].board[0]), 3);
    await play(g, 0, 'time_14'); await g.endTurn(0);
    eq(g.streak, 2); eq(g.atkOf(g.players[0].board[0]), 6, 'extra turn → +3');
    await g.endTurn(0); await g.endTurn(1);
    eq(g.atkOf(g.players[0].board[0]), 3, 'normal turn → 3');
  });

  test('時の果て: life to 1 (non-boss); boss → half', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_23'], mana: 10, deck: deck(8) }, p1: { life: 200, deck: deck(8) } });
    await play(g, 0, 'time_23');
    for (let i = 0; i < 3; i++) { await g.endTurn(0); await g.endTurn(1); }
    eq(g.players[1].life, 1);
    if (!G.EnemyDB.has('tb_boss')) G.EnemyDB.register({ id: 'tb_boss', name: 'Bボス', life: 200, deck: [], kind: 'boss', isBoss: true });
    const g2 = await T.sandbox({ p0: { hand: ['time_23', 'time_15'], mana: 20 }, p1: { life: 200 } });
    g2.players[1].enemyDefId = 'tb_boss';
    await play(g2, 0, 'time_23'); await play(g2, 0, 'time_15'); // dragon fires it now
    eq(g2.players[1].life, 100, 'boss resists: halved');
  });

  test('止まった世界: opponent never gets a turn; I lose 5 each turn start', async function () {
    const g = await T.sandbox({ p0: { crests: ['time_25'], mana: 5, deck: deck(6), life: 40 }, p1: { deck: deck(6) } });
    await g.endTurn(0);
    eq(g.active, 0); eq(g.streak, 2); eq(g.players[0].life, 35);
    await g.endTurn(0);
    eq(g.active, 0); eq(g.players[0].life, 30);
  });

  // ---- SPEC combos ----
  test('コンボ 魔女と砂時計: infinite turns → loop detected at endTurn → runLoop ends the game', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_14'], board: ['time_22'], mana: 10, deck: deck(30) }, p1: { life: 40, deck: deck(2) } });
    // give the witch something to hit so the loop ends with a win (sandbox pre-placed monster may attack)
    const rec = T.record(g, ['loopDetected']);
    await play(g, 0, 'time_14'); await g.endTurn(0);
    eq(g.streak, 2); ok(byDef(g.players[0].hand, 'time_14'), 'witch recovered the hourglass');
    await play(g, 0, 'time_14'); await g.endTurn(0);
    eq(g.streak, 3); eq(rec.count('loopDetected'), 1); eq(g.loop.detected.kind, 'turn');
    const res = await g.runLoop(0, 'inf');
    ok(g.winner !== null, 'game ended'); ok(res.iterations > 5, 'ran ' + res.iterations + ' turns');
  });

  test('コンボ 王冠と連鎖: 5 cards in a turn → extra turn (once per turn)', async function () {
    const g = await T.sandbox({ p0: { hand: ['tb_zero', 'tb_zero', 'tb_zero', 'tb_zero', 'tb_zero'], crests: ['time_21'], mana: 0, deck: deck(4) }, p1: { deck: deck(3) } });
    for (let i = 0; i < 5; i++) await play(g, 0, 'tb_zero');
    await g.endTurn(0);
    eq(g.active, 0); eq(g.streak, 2);
    await g.endTurn(0); eq(g.active, 1, 'only 1 card... 0 played → no extra');
    const g2 = await T.sandbox({ p0: { hand: ['tb_zero', 'tb_zero', 'tb_zero', 'tb_zero'], crests: ['time_21'], mana: 0, deck: deck(4) }, p1: { deck: deck(3) } });
    for (let i = 0; i < 4; i++) await play(g2, 0, 'tb_zero');
    await g2.endTurn(0); eq(g2.active, 1, '4 cards is not enough');
  });

  test('コンボ 時限爆弾の一斉起爆: 刻を統べる竜 fires all timed cards now', async function () {
    // (the sandbox's own turn-1 start already ticks each timer once, so counts are chosen ≥2)
    const g = await T.sandbox({ p0: { hand: ['time_15'], timed: [{ id: 'time_07', count: 3 }, { id: 'time_07', count: 2 }, { id: 'time_16', count: 4 }], mana: 10 }, p1: { life: 40 } });
    eq(g.players[0].timed.length, 3); eq(g.players[1].life, 40);
    await play(g, 0, 'time_15');
    eq(g.players[1].life, 20); eq(g.players[0].timed.length, 0);
    eq(g.players[0].board.length, 2, 'dragon + hero');
  });

  test('コンボ 鐘でマナ爆発を2回: rewind to turn start keeping hand', async function () {
    const g = await T.sandbox({ p0: { hand: ['tb_manaburst', 'tb_bolt'], crests: ['time_17'], mana: 3, deck: deck(4) }, p1: { deck: deck(4) } });
    // move past the sandbox turn so a real turn snapshot (with mana) exists
    await g.endTurn(0); await g.endTurn(1);
    const startMana = g.players[0].mana;
    await play(g, 0, 'tb_manaburst'); await play(g, 0, 'tb_bolt');
    eq(g.players[1].life, 35); eq(g.players[0].mana, startMana + 5);
    const ab = g.getAbilities(0); eq(ab.length, 1, 'bell available');
    await g.useAbility(0, ab[0].uid, []);
    eq(g.players[1].life, 40, 'damage undone'); eq(g.players[0].mana, startMana, 'mana back to turn start');
    eq(g.players[0].hand.length, 1, 'hand kept as it is now (spells spent)');
    eq(g.getAbilities(0).length, 0, 'once per turn');
    // 2回目: 坩堝などで再度爆発できる（手札に残っていれば）
  });

  test('コンボ 時間逆行: back to my turn start 2 turns ago, hand+grave kept, card exiled', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_24', 'tb_zero'], mana: 10, deck: deck(6), life: 40 }, p1: { hand: ['tb_bolt', 'tb_bolt', 'tb_curse3'], deck: deck(6) } });
    await g.endTurn(0);                         // T2: P1
    g.players[1].mana = 5; await play(g, 1, 'tb_bolt'); await g.endTurn(1);
    await g.endTurn(0);                         // T3: P0 (snapshot A), T4: P1
    g.players[1].mana = 5; await play(g, 1, 'tb_bolt'); await play(g, 1, 'tb_curse3'); await g.endTurn(1);
    // T5: P0. life 30, curse 3.
    eq(g.players[0].life, 30); eq(g.players[0].curse, 3);
    await play(g, 0, 'tb_zero');
    g.players[0].mana = 10;
    await play(g, 0, 'time_24');
    eq(g.players[0].life, 35, 'back to turn 3 start (after the first bolt)'); eq(g.players[0].curse, 0);
    eq(g.players[0].exile.length, 1); eq(g.players[0].exile[0].defId, 'time_24', 'exiled');
    ok(byDef(g.players[0].grave, 'tb_zero'), 'grave kept');
    ok(!byDef(g.players[0].hand, 'time_24'), 'not back in hand');
    ok(byDef(g.players[1].hand, 'tb_curse3') && byDef(g.players[1].hand, 'tb_bolt'), 'opponent hand restored (second bolt + curse back in hand)');
    eq(g.players[1].grave.length, 1, 'only the first bolt is in the opponent grave');
    eq(g.turn, 3); eq(g.active, 0);
  });

  test('コンボ 歴史改変: undo one opponent play from the previous turn (damage back, monsters gone)', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_20'], mana: 10, deck: deck(6), chooser: T.lastChooser }, p1: { hand: ['tb_bolt', 'tb_rush'], deck: deck(6) } });
    await g.endTurn(0);
    g.players[1].mana = 5;
    await play(g, 1, 'tb_bolt'); await play(g, 1, 'tb_rush');
    await g.endTurn(1);
    eq(g.players[0].life, 35); eq(g.players[1].board.length, 1);
    // lastChooser picks the last option = tb_rush → its monster vanishes
    g.players[0].mana = 10;
    await play(g, 0, 'time_20');
    eq(g.players[1].board.length, 0, 'summoned monster removed'); eq(g.players[0].life, 35, 'bolt untouched');
    // second game: pick the bolt (default chooser = first option)
    const g2 = await T.sandbox({ p0: { hand: ['time_20'], mana: 10, deck: deck(6) }, p1: { hand: ['tb_bolt', 'tb_rush'], deck: deck(6) } });
    await g2.endTurn(0); g2.players[1].mana = 5;
    await play(g2, 1, 'tb_bolt'); await play(g2, 1, 'tb_rush'); await g2.endTurn(1);
    g2.players[0].mana = 10;
    await play(g2, 0, 'time_20');
    eq(g2.players[0].life, 40, 'damage reverted'); eq(g2.players[1].board.length, 1, 'monster stays');
  });
})(globalThis.G);
