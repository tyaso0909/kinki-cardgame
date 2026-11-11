'use strict';
// tests/cards_boss.test.js — ボス切り札・補助カード・エリート切り札（tc_ test cards are registered in cards_generic.test.js)
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const DB = G.CardDB;
  if (!G.Data || !G.Data.validateAll) require(require('path').join(T.root(), 'js/data/_index.js'));
  function byDef(arr, id) { return arr.find(function (c) { return c.defId === id; }); }
  async function play(g, i, defId, choices) {
    const c = byDef(g.players[i].hand, defId) || byDef(g.players[i].grave, defId);
    ok(c, 'card ' + defId + ' available');
    const r = await g.playCard(i, c.uid, { choices: choices });
    ok(r.ok, defId + ' play ok (' + r.reason + ')');
    return r;
  }
  function deck(n, id) { return new Array(n).fill(id || 'tc_vanilla'); }
  const TRUMPS = ['boss1_01', 'boss1_02', 'boss1_03', 'boss2_01', 'boss2_02', 'boss2_03', 'boss3_01', 'boss3_02', 'boss3_03', 'boss3_04',
    'boss4_01', 'boss4_02', 'boss4_03', 'boss4_04', 'boss5_01', 'boss5_02', 'boss5_03', 'boss5_04',
    'elite1_01', 'elite2_01', 'elite3_01', 'elite4_01', 'elite5_01', 'elite6_01'];
  const AUX = ['boss1_04', 'boss1_05', 'boss2_04', 'boss2_05', 'boss3_05', 'boss3_06', 'boss4_05', 'boss4_06', 'boss5_05'];

  test('boss: trumps are bossOnly/rarity boss, aux are rarity boss + bossAux tag, none in pool', function () {
    TRUMPS.forEach(function (id) { const d = DB.get(id); ok(d.bossOnly, id + ' bossOnly'); eq(d.rarity, 'boss', id); ok(d.text.length > 0); });
    AUX.forEach(function (id) { const d = DB.get(id); ok(!d.bossOnly, id); eq(d.rarity, 'boss'); ok(d.tags.indexOf('bossAux') >= 0, id + ' tag'); });
    const pool = DB.pool().map(function (d) { return d.id; });
    TRUMPS.concat(AUX).forEach(function (id) { ok(pool.indexOf(id) < 0, id + ' not in pool'); });
    eq(DB.get('boss4_01').key, 'wild');
    eq(DB.get('boss1_01').lineage, 'accel'); eq(DB.get('boss2_01').lineage, 'chain'); eq(DB.get('boss3_01').lineage, 'time'); eq(DB.get('boss4_01').lineage, 'doom'); eq(DB.get('boss5_01').lineage, 'copy');
  });

  test('boss smoke: every boss/elite card can be played without throwing', async function () {
    const all = TRUMPS.concat(AUX);
    for (let k = 0; k < all.length; k++) {
      const id = all[k]; const def = DB.get(id);
      const g = await T.sandbox({
        p0: { hand: [id], mana: 10, deck: deck(8), board: ['tc_vanilla'], grave: ['tc_bolt', 'tc_phoenix'], exile: ['tc_altar'], timed: [{ id: 'tc_bomb', count: 2 }], chain: 3 },
        p1: { board: ['tc_big'], hand: ['tc_bolt', 'tc_spark'], grave: ['tc_bolt', 'tc_key1'], deck: deck(8), seals: ['tc_key1'] }
      });
      const choices = {};
      if (def.targets) { const cands = g.makeCtx(0, null).candidatesFor(def.targets); if (cands.length) choices.targets = [cands[0].uid]; }
      await play(g, 0, id, choices);
    }
  });

  // ---- ボス1 ----
  test('ぜんまい仕掛けの不死鳥 + 祭壇 loops; 最後の一周 deals manaGained; 巨兵 deals returns×3', async function () {
    const g = await T.sandbox({ p0: { hand: ['boss1_01', 'boss1_02', 'boss1_03'], crests: ['tc_altar'], mana: 0, deck: deck(3) }, p1: { life: 100 } });
    for (let i = 0; i < 4; i++) { await play(g, 0, 'boss1_01'); const ab = g.getAbilities(0); await g.useAbility(0, ab[0].uid, ab[0].targets); }
    eq(g.players[0].mana, 4); eq(g.players[0].returnedToHandThisTurn, 4);
    ok(g.loop.detected, 'loop detected');
    g.players[0].mana = 10; g.players[0].manaGainedThisTurn = 12;
    await play(g, 0, 'boss1_02'); eq(g.players[1].life, 88);
    await play(g, 0, 'boss1_03'); eq(g.players[1].life, 76, '4 returns ×3'); ok(g.getAttackers(0).length === 1, 'rush');
  });

  test('職人の予備部品 recovers a loop part from grave or exile; からくり人形 gives mana on death', async function () {
    const g = await T.sandbox({ p0: { hand: ['boss1_04', 'boss1_04'], mana: 5, exile: ['boss1_01'], grave: ['tc_bolt', 'tc_altar'], board: ['boss1_05'] } });
    await play(g, 0, 'boss1_04');
    ok(byDef(g.players[0].hand, 'boss1_01') || byDef(g.players[0].hand, 'tc_altar'), 'a loop part returned');
    const before = g.players[0].mana;
    await g.makeCtx(0, null).destroy(g.players[0].board[0]);
    eq(g.players[0].mana, before + 1);
  });

  // ---- ボス2 ----
  test('嵐の指揮者 doubles chain and resets chain on death; 終曲・万雷 deals chain×3 and wipes at 20+', async function () {
    const g = await T.sandbox({ p0: { board: ['boss2_01'], hand: ['boss2_02'], mana: 5, chain: 7 }, p1: { board: ['tc_big', 'tc_vanilla'], life: 200 } });
    eq(g.chainOf(0), 14);
    await play(g, 0, 'boss2_02');
    eq(g.players[1].life, 200 - 16 * 3, 'chain became 8 (play) → 16 ×3');
    eq(g.players[1].board.length, 2, 'under 20: no wipe');
    g.players[0].chain = 10; g.players[0].mana = 5; g.addCard(0, 'boss2_02', 'hand');
    await play(g, 0, 'boss2_02');
    eq(g.players[1].board.length, 0, 'wiped at 22');
    await g.makeCtx(1, null).destroy(g.players[0].board[0]);
    eq(g.players[0].chain, 0, 'chain reset on conductor death');
  });

  test('嵐の化身 is X/X by chain with rush; 前奏曲 +2 chain & draw; 楽団員 +1 chain, draws on death', async function () {
    const g = await T.sandbox({ p0: { hand: ['boss2_04', 'boss2_05', 'boss2_03'], mana: 10, deck: deck(5) } });
    await play(g, 0, 'boss2_04'); eq(g.players[0].chain, 3); eq(g.players[0].hand.length, 3);
    await play(g, 0, 'boss2_05'); eq(g.players[0].chain, 5);
    await play(g, 0, 'boss2_03');
    const av = byDef(g.players[0].board, 'boss2_03'); eq(g.atkOf(av), 6); eq(g.hpOf(av), 6);
    ok(g.getAttackers(0).some(function (a) { return a.uid === av.uid; }), 'rush');
    const h = g.players[0].hand.length;
    await g.makeCtx(0, null).destroy(byDef(g.players[0].board, 'boss2_05'));
    eq(g.players[0].hand.length, h + 1);
  });

  // ---- ボス3 ----
  test('時盗みの魔女 + 奪われた砂時計: extra turn, opponent draws 0, witch recovers spell; witch death skips turn', async function () {
    const g = await T.sandbox({ p0: { board: ['boss3_01'], hand: ['boss3_02'], mana: 10, deck: deck(10) }, p1: { deck: deck(5) } });
    await play(g, 0, 'boss3_02');
    eq(g.players[0].extraTurns, 1);
    await g.endTurn(0);
    eq(g.active, 0); eq(g.streak, 2);
    ok(byDef(g.players[0].hand, 'boss3_02'), 'witch recovered the hourglass');
    await g.endTurn(0);
    eq(g.active, 1); eq(g.players[1].hand.length, 0, 'opponent drew 0');
    await g.endTurn(1);
    await g.makeCtx(1, null).destroy(g.players[0].board[0]);
    ok(g.players[0].skipNextTurn, 'skip flagged (the witch\'s owner)');
    await g.endTurn(0); eq(g.active, 1);
    await g.endTurn(1);
    eq(g.active, 1, 'P0 turn skipped'); eq(g.streak, 2);
  });

  test('刻限の処刑 deals streak×8; 時を喰らう獣 grows +3/+3 per consecutive turn', async function () {
    const g = await T.sandbox({ p0: { hand: ['boss3_03', 'boss3_04', 'tc_extra', 'tc_extra'], mana: 20, deck: deck(10) }, p1: { life: 100, deck: deck(5) } });
    await play(g, 0, 'boss3_04');
    await play(g, 0, 'tc_extra'); await g.endTurn(0);
    eq(g.streak, 2);
    const beast = byDef(g.players[0].board, 'boss3_04'); eq(g.atkOf(beast), 6); eq(g.hpOf(beast), 6);
    g.players[0].mana = 10;
    await play(g, 0, 'tc_extra'); await g.endTurn(0);
    eq(g.streak, 3); eq(g.atkOf(beast), 9);
    g.players[0].mana = 10;
    await play(g, 0, 'boss3_03'); eq(g.players[1].life, 100 - 24);
  });

  test('くすねた一秒 and 影の掏摸', async function () {
    const g = await T.sandbox({ p0: { hand: ['boss3_05', 'boss3_06'], mana: 3, timed: [{ id: 'tc_bomb', count: 3 }] }, p1: { hand: ['tc_bolt'] } });
    await play(g, 0, 'boss3_05'); eq(g.players[0].mana, 4); eq(g.players[0].timed[0].timedCount, 1, '3 → turn-start tick 2 → -1 = 1');
    const rec = T.record(g, ['reveal']);
    await play(g, 0, 'boss3_06');
    eq(rec.count('reveal'), 1);
    eq(g.costOf(1, g.players[1].hand[0]), 2, 'spell cost +2 for the battle');
  });

  // ---- ボス4 ----
  test('陳列棚の鍵 is a wild key; 最後の展示 wins at 4 kinds; 蒐集の目録 fetches a key at turn start', async function () {
    const g = await T.sandbox({ p0: { hand: ['boss4_01', 'boss4_03'], crests: ['boss4_02'], seals: ['tc_key1', 'tc_key2'], mana: 10, deck: ['tc_vanilla', 'tc_key3', 'tc_vanilla'] }, p1: { deck: deck(3) } });
    await play(g, 0, 'boss4_01'); eq(g.distinctKeys(0), 3);
    await play(g, 0, 'boss4_03'); eq(g.winner, null, '3 kinds: not yet');
    await g.endTurn(0); await g.endTurn(1);
    ok(byDef(g.players[0].hand, 'tc_key3'), '目録 fetched the key from deck');
    g.players[0].mana = 10; g.addCard(0, 'boss4_03', 'hand');
    await play(g, 0, 'tc_key3'); eq(g.distinctKeys(0), 4);
    await play(g, 0, 'boss4_03'); eq(g.winner, 0); eq(g.winReason, 'seals');
  });

  test('標本の巨人 is X/X = vault×2; 蒐集家の網 and ガラス瓶の妖精 vault-steal; restoreVault returns them', async function () {
    const g = await T.sandbox({ p0: { hand: ['boss4_05', 'boss4_04'], board: ['boss4_06'], mana: 10 }, p1: { board: ['tc_big'], grave: ['tc_bolt'], hand: ['tc_spark', 'tc_heal'] } });
    await play(g, 0, 'boss4_05');
    eq(g.players[0].vault.length, 1); eq(g.players[0].vault[0].stolenFrom, 1);
    await g.makeCtx(1, null).destroy(g.players[0].board[0]);
    eq(g.players[0].vault.length, 2); eq(g.players[1].hand.length, 1);
    await play(g, 0, 'boss4_04');
    const giant = byDef(g.players[0].board, 'boss4_04'); eq(g.atkOf(giant), 4); eq(g.hpOf(giant), 4);
    const restored = G.Data.restoreVault(g);
    eq(restored[1].length, 2); eq(restored[0].length, 0);
    eq(g.players[0].vault.length, 0);
    ok(restored[1].indexOf('tc_big') >= 0 || restored[1].indexOf('tc_bolt') >= 0);
  });

  // ---- ボス5 ----
  test('鏡像の写し replays the opponent\'s last-turn plays in order as free copies (attacks skipped)', async function () {
    const g = await T.sandbox({ p0: { hand: ['tc_spark', 'tc_bolt', 'tc_sprite'], board: ['tc_vanilla'], mana: 10, deck: deck(5), life: 50 }, p1: { hand: ['boss5_01'], deck: deck(5), life: 50 } });
    await play(g, 0, 'tc_spark'); await play(g, 0, 'tc_bolt'); await play(g, 0, 'tc_sprite');
    await g.attack(0, g.players[0].board[0].uid, 'face');
    eq(g.players[1].life, 50 - 4 - 2);
    await g.endTurn(0);
    g.players[1].mana = 5;
    const h0 = g.players[1].hand.length, m0 = g.players[1].mana;
    const order = [];
    g.on('cardPlayed', function (ev) { if (ev.who === 1 && ev.isCopy) order.push(ev.defId); });
    await play(g, 1, 'boss5_01');
    T.deepEq(order, ['tc_spark', 'tc_bolt', 'tc_sprite']);
    eq(g.players[0].life, 50 - 4, 'bolt copy hit P0');
    eq(g.players[1].mana, m0 - 2 + 1 + 2, 'paid 2, spark +1, sprite +2 (copies cast free)');
    eq(g.players[1].hand.length, h0 - 1 + 1, 'spark copy drew 1');
    eq(g.players[1].board.length, 1, 'sprite copy summoned');
    eq(g.players[1].chain, 1, 'copies do not count toward chain');
    eq(g.players[1].life, 44, 'no attack replayed');
  });

  test('裏返った姿見: opponent takes half of damage they deal; 終わりの自画像 copies max single hit', async function () {
    const g = await T.sandbox({ p0: { hand: ['tc_bolt', 'tc_bolt'], mana: 5, deck: deck(3), life: 50 }, p1: { crests: ['boss5_02'], hand: ['boss5_03'], life: 50, deck: deck(3) } });
    await play(g, 0, 'tc_bolt');
    eq(g.players[1].life, 46); eq(g.players[0].life, 48, 'half reflected');
    eq(g.players[0].maxDamageDealtOnce, 4);
    await g.endTurn(0); g.players[1].mana = 5;
    await play(g, 1, 'boss5_03');
    eq(g.players[0].life, 44, 'self-portrait dealt 4'); eq(g.players[1].life, 46, 'own damage not mirrored');
  });

  test('もう一人の挑戦者 becomes a rush copy of the strongest enemy monster with its effects', async function () {
    const g = await T.sandbox({ p0: { hand: ['boss5_04'], mana: 10 }, p1: { board: ['tc_vanilla', 'tc_sprite', { id: 'tc_big', atk: 7 }] } });
    const manaBefore = g.players[0].mana - 6;
    await play(g, 0, 'boss5_04');
    eq(g.players[0].board.length, 1);
    const c = g.players[0].board[0];
    eq(c.defId, 'tc_big'); eq(g.atkOf(c), 7); eq(g.hpOf(c), 5); ok(c.isCopy); ok(c.keywords.indexOf('rush') >= 0);
    ok(g.getAttackers(0).length === 1);
    eq(g.players[0].mana, manaBefore);
    ok(byDef(g.players[0].grave, 'boss5_04'), 'the card itself went to grave');
    // copies an effect-bearing monster: onSummon fires
    const g2 = await T.sandbox({ p0: { hand: ['boss5_04'], mana: 6 }, p1: { board: ['tc_sprite'] } });
    await play(g2, 0, 'boss5_04'); eq(g2.players[0].mana, 2, 'sprite onSummon +2');
  });

  test('ひび割れた手鏡 makes 1 phantom and draws', async function () {
    const g = await T.sandbox({ p0: { hand: ['boss5_05'], board: ['tc_big'], mana: 3, deck: deck(3) } });
    await play(g, 0, 'boss5_05', { targets: [g.players[0].board[0].uid] });
    eq(g.players[0].phantoms.length, 1); eq(g.players[0].hand.length, 1);
  });

  // ---- エリート ----
  test('elite trumps: 溶けた心臓, 禁書の頁, 二つ首の咆哮, 呪いの人形箱, 緊急停止 (once), 千の仮面', async function () {
    const g = await T.sandbox({ p0: { crests: ['elite1_01', 'elite4_01'], hand: ['tc_spark', 'elite2_01', 'elite3_01'], mana: 10, chain: 2, deck: deck(5) }, p1: { hand: ['tc_bolt', 'tc_bolt', 'tc_heal', 'tc_heal'], deck: deck(5), life: 100 } });
    await play(g, 0, 'tc_spark'); eq(g.players[1].life, 99, 'melted heart 1 dmg per mana gain');
    await play(g, 0, 'elite2_01'); eq(g.players[1].hand.length, 3); eq(g.players[1].deck.length, 6);
    await play(g, 0, 'elite3_01'); eq(g.players[1].life, 99 - 2 * 5 * 2, 'chain 5 → ×2 twice');
    await g.endTurn(0); await g.endTurn(1);
    eq(g.players[1].curse, 4, 'doll box at each P0 turn start (sandbox turn 1 + turn 3)');

    const g2 = await T.sandbox({ p0: { hand: ['elite5_01', 'elite5_01'], mana: 10, deck: deck(5) }, p1: { deck: deck(5) } });
    await play(g2, 0, 'elite5_01');
    eq(g2.getPlayable(0).length, 0, 'once per battle');
    await g2.endTurn(0);
    eq(g2.active, 0, 'opponent turn skipped'); eq(g2.streak, 2);
    const g3 = await T.sandbox({ p0: { hand: ['elite5_01'], mana: 10, deck: deck(5) }, p1: { crests: ['gen_14'], deck: deck(5) } });
    await play(g3, 0, 'elite5_01'); await g3.endTurn(0); eq(g3.active, 1, '反魔の護符 blocks 緊急停止');

    const g4 = await T.sandbox({ p0: { hand: ['elite6_01'], board: ['tc_sprite', 'tc_vanilla'], mana: 4, deck: ['basic_01', 'basic_01', 'basic_01'] }, p1: { deck: ['basic_01', 'basic_01', 'basic_01'] } });
    await play(g4, 0, 'elite6_01');
    eq(g4.players[0].phantoms.length, 4); eq(g4.players[0].mana, 4, 'two sprite phantoms fired onSummon (+2 each)');
    await g4.endTurn(0); eq(g4.players[0].phantoms.length, 4, 'phantoms stand through the opponent turn');
    await g4.endTurn(1); eq(g4.players[0].phantoms.length, 0);
  });
})(globalThis.G = globalThis.G || {});
