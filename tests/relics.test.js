'use strict';
// tests/relics.test.js — 遺物 44 + 敵専用遺物 15。各遺物のフックが最低1回は発火することを確認。
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const DB = G.CardDB, R = G.RelicDB;
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
  // full game (not sandbox) so onBattleStart / initial hands behave as in a real battle
  async function battle(relics0, relics1, deck0, deck1, opts) {
    const g = G.Engine.createGame({ seed: 3, players: [{ deck: deck0 || deck(12), relics: relics0 || [] }, { deck: deck1 || deck(12), relics: relics1 || [], isAI: true }],
      options: Object.assign({ firstPlayer: 0, noShuffle: true }, opts || {}) });
    await g.start();
    return g;
  }

  test('relics: 44 player relics + 15 enemy-only relics registered with SPEC names', function () {
    const players = G.Data.relicsBy('player').filter(function (r) { return r.id.indexOf('relic_') === 0; }), enemies = R.filter(function (r) { return r.enemyOnly; });
    eq(players.length, 44, 'player relics'); ok(enemies.length >= 15, 'enemy relics: ' + enemies.length);
    eq(G.Data.relicsBy('start').length, 6); eq(G.Data.relicsBy('boss').length, 6); eq(G.Data.relicsBy('cursed').length, 4);
    eq(G.Data.relicsBy('accel').length, 4, '火種の袋・竜の心臓・原初の炉＋燃える種火');
    function mine(list) { return list.filter(function (r) { return r.id.indexOf('relic_') === 0; }); } // ignore t_ test relics from engine tests
    eq(mine(G.Data.relicsBy('common')).length, 10, '4 generic + 6 lineage commons');
    eq(mine(G.Data.relicsBy('legend')).length, 9);
    G.Data.SPEC_RELIC_NAMES.forEach(function (n) { ok(G.Data.relicIdByName(n), 'relic ' + n); });
    R.all().filter(function (r) { return r.id.indexOf('relic_') === 0; }).forEach(function (r) { ok(r.text.length > 0, r.id + ' text'); });
    G.Data.relicsBy('boss').forEach(function (r) { ok(r.drawback, r.id + ' drawback'); });
    T.deepEq(G.Data.runEffectsOf(['relic_merchant_seal', 'relic_compass', 'relic_liar_map']), { shopDiscount: 0.2, hazardEarly: true, revealEnemyHand: 1, mapFog: true });
  });

  test('初期遺物: 種火, 栞, 雷の欠片, 懐中時計, 欠けた手鏡, 骨の指輪', async function () {
    const g = await battle(['relic_ember', 'relic_old_bookmark', 'relic_thunder_shard', 'relic_bone_ring'], []);
    eq(g.players[0].maxMana, 1, 'max mana starts at 1'); eq(g.players[0].mana, 2, 'ember: +1 mana on the first turn only');
    eq(g.players[0].hand.length, 6, 'bookmark: 5+1'); eq(g.players[1].hand.length, 5);
    eq(g.players[0].chain, 1, 'thunder shard'); eq(g.players[1].curse, 1, 'bone ring');
    await g.endTurn(0); eq(g.players[1].chain, 0); await g.endTurn(1); eq(g.players[0].chain, 1);
    const g2 = await T.sandbox({ p0: { hand: ['tc_bomb', 'tc_bomb', 'tc_bolt', 'tc_bolt'], mana: 5, relics: ['relic_mad_watch', 'relic_chipped_mirror'], deck: deck(3) }, p1: { life: 50 } });
    await g2.fireBattleStart();
    await play(g2, 0, 'tc_bomb'); eq(g2.players[0].timed[0].timedCount, 1, 'first timed -1');
    await play(g2, 0, 'tc_bomb'); eq(g2.players[0].timed[1].timedCount, 2);
    await play(g2, 0, 'tc_bolt'); eq(g2.players[1].life, 42, 'first real spell fires twice (bomb was a timed set, not a cast)');
    await play(g2, 0, 'tc_bolt'); eq(g2.players[1].life, 38);
  });

  test('汎用遺物: 小箱, 頑丈な盾, 二枚舌の仮面, シャベル, 王冠の破片, 巾着, 螺子', async function () {
    const g = await battle(['relic_fortune_box', 'relic_sturdy_shield', 'relic_shovel'], [], ['tc_vanilla', 'tc_vanilla', 'tc_vanilla', 'tc_vanilla', 'tc_vanilla', 'tc_spark', 'tc_bolt', 'tc_big', 'tc_vanilla', 'tc_vanilla'], deck(10, 'tc_bolt'));
    ok(byDef(g.players[0].hand, 'tc_spark') || byDef(g.players[0].hand, 'tc_bolt'), 'shovel tutored a cost-0 card');
    eq(g.players[0].hand.length, 7, '5 + shovel + fortune box on turn 1 (first player skips the normal draw, box still looks)');
    await g.endTurn(0);
    g.players[1].mana = 5; await play(g, 1, 'tc_bolt'); eq(g.players[0].life, 38, 'shield -2 in first 3 turns');
    const deckBefore = g.players[0].deck.length;
    await g.endTurn(1);
    eq(g.players[0].hand.length, 6 + 1 + 1, 'box: drew exactly 1 (+ normal draw; hand trimmed to 6 at end of turn)'); eq(g.players[0].deck.length, deckBefore - 2);
    const gb = await T.sandbox({ p0: { relics: ['relic_fortune_box'], deck: ['tc_vanilla', 'tc_spark', 'tc_big', 'tc_bolt'] }, p1: { deck: deck(3) } });
    eq(gb.players[0].hand.length, 1, 'sandbox turn 1: box drew 1 (vanilla), spark to bottom');
    eq(gb.players[0].deck.map(function (c) { return c.defId; }).join(','), 'tc_big,tc_bolt,tc_spark');
    await gb.endTurn(0); await gb.endTurn(1);
    eq(gb.players[0].hand.length, 3, 'normal draw + box draw');
    ok(byDef(gb.players[0].hand, 'tc_big') && byDef(gb.players[0].hand, 'tc_bolt'), 'top card drawn normally, box picked the first of the next two');
    eq(gb.players[0].deck.map(function (c) { return c.defId; }).join(','), 'tc_spark', 'other card to bottom');
    g.players[0].turnsTaken = 4; await g.endTurn(0); g.players[1].mana = 5; await play(g, 1, 'tc_bolt'); eq(g.players[0].life, 34, 'shield off after turn 3');

    const g2 = await T.sandbox({ p0: { hand: ['gen_08'], mana: 5, relics: ['relic_two_tongue_mask'], deck: deck(5) }, p1: { hand: ['tc_vanilla'], deck: deck(5) } });
    await play(g2, 0, 'gen_08'); await g2.endTurn(0);
    eq(g2.costOf(1, g2.players[1].hand[0]), 2); await g2.endTurn(1); await g2.endTurn(0);
    eq(g2.costOf(1, byDef(g2.players[1].hand, 'tc_vanilla')), 2, 'reserve lasts 2 turns'); await g2.endTurn(1); await g2.endTurn(0);
    eq(g2.costOf(1, byDef(g2.players[1].hand, 'tc_vanilla')), 1, 'expired');

    const g3 = await T.sandbox({ p0: { life: 3, relics: ['relic_crown_shard'] }, p1: { hand: ['tc_bolt', 'tc_bolt'], deck: deck(3) } });
    await g3.endTurn(0); g3.players[1].mana = 5;
    await play(g3, 1, 'tc_bolt'); eq(g3.players[0].life, 10, 'revived at 10'); eq(g3.winner, null);
    g3.players[0].life = 3; await play(g3, 1, 'tc_bolt'); eq(g3.winner, 1, 'only once');

    const g4 = await T.sandbox({ p0: { hand: ['tc_big', 'tc_big'], mana: 2, relics: ['relic_infinite_pouch'] } });
    const abil = G.Data.relicAbilities(g4, 0); eq(abil.length, 1); eq(abil[0].targets.length, 2);
    const r = await G.Data.useRelicAbility(g4, 0, 'relic_infinite_pouch', [abil[0].targets[0]]); ok(r.ok);
    eq(g4.costOf(0, g4.players[0].hand[0]), 1); eq(G.Data.relicAbilities(g4, 0).length, 0, 'once per turn');
    await play(g4, 0, 'tc_big');

    const g5 = await T.sandbox({ p0: { hand: ['tc_phoenix'], crests: ['tc_altar'], mana: 0, relics: ['relic_loop_screw'] } });
    for (let i = 0; i < 3; i++) { await play(g5, 0, 'tc_phoenix'); const ab = g5.getAbilities(0); await g5.useAbility(0, ab[0].uid, ab[0].targets); }
    const res = await g5.runLoop(0, 4); eq(res.iterations, 4); eq(g5.players[0].mana, 3 + 4 + 4, 'phoenix +1 and screw +1 per iteration');
  });

  test('加速遺物: 火種の袋, 竜の心臓, 原初の炉', async function () {
    const g = await battle(['relic_tinder_bag', 'relic_dragon_heart', 'relic_primal_furnace'], []);
    ok(byDef(g.players[0].hand, 'accel_06'), '火種 added');
    eq(g.players[0].maxMana, 1, 'dragon heart: first turn still starts at 1');
    await g.endTurn(0); await g.endTurn(1); eq(g.players[0].maxMana, 3, 'dragon heart: +2 from turn 2');
    eq(G.Data.relicAbilities(g, 0).length, 1);
    await G.Data.useRelicAbility(g, 0, 'relic_primal_furnace'); eq(g.players[0].mana, 10);
    eq(G.Data.relicAbilities(g, 0).length, 0, 'once per battle');
  });

  test('循環遺物: 湿った栞, 人魚の涙, 無限書架の鍵', async function () {
    const g = await battle(['relic_damp_bookmark'], [], ['tc_vanilla', 'tc_vanilla', 'tc_vanilla', 'tc_vanilla', 'tc_vanilla', 'tc_bolt', 'tc_spark', 'tc_big', 'tc_heal', 'tc_skel', 'tc_vanilla'], deck(10));
    eq(g.players[0].deck.length, 6);
    eq(g.players[0].deck.slice(0, 5).map(function (c) { return c.defId; }).join(','), 'tc_bolt,tc_spark,tc_big,tc_heal,tc_skel', 'default chooser keeps order');
    const g2 = await T.sandbox({ p0: { hand: ['tc_big', 'tc_big'], grave: [], mana: 5, relics: ['relic_mermaid_tear'] } });
    await g2.fireBattleStart();
    const ctx = g2.makeCtx(0, null);
    const c = g2.players[0].hand[0]; await ctx.discard([c], 0); eq(g2.players[0].grave.length, 1);
    await ctx.addToHand(c, 0);
    eq(g2.costOf(0, c), 0, 'recovered card costs 0'); eq(g2.costOf(0, g2.players[0].hand[0]), 3);
    await g2.playCard(0, c.uid); eq(g2.players[0].mana, 5, 'free');
    const g3 = await T.sandbox({ p0: { hand: ['tc_bolt'], mana: 5, relics: ['relic_infinite_shelf_key'], deck: deck(8) }, p1: { life: 50 } });
    await play(g3, 0, 'tc_bolt'); eq(g3.players[0].hand.length, 3, 'hand empty → draw 3');
    const ctx3 = g3.makeCtx(0, null); await ctx3.discard(g3.players[0].hand.slice(), 0); eq(g3.players[0].hand.length, 0, 'once per turn');
  });

  test('連鎖遺物: 避雷の腕輪, 雷鼓の撥, 永雷の宝珠', async function () {
    const g = await T.sandbox({ p0: { hand: deck(12, 'tc_spark'), mana: 20, life: 30, relics: ['relic_lightning_bracelet', 'relic_thunder_drumstick', 'relic_eternal_thunder_orb'], deck: deck(20) } });
    g.players[0].maxLife = 40;
    for (let i = 0; i < 10; i++) await play(g, 0, 'tc_spark');
    eq(g.players[0].life, 33, 'bracelet at 10'); eq(g.players[0].hand.length, 2 + 10 + 2, '10 spark draws + drumstick at 5 and 10');
    const ctx = g.makeCtx(0, null); await ctx.cast('tc_bolt', 0, { copy: true });
    eq(g.players[0].chain, 11, 'orb: copies count');
  });

  test('時間遺物: 古い砂袋, 時計職人の工具, 永遠の振り子', async function () {
    const g = await T.sandbox({ p0: { hand: ['tc_bomb'], mana: 5, relics: ['relic_old_sandbag', 'relic_clockmaker_tools', 'relic_eternal_pendulum'], deck: deck(8) }, p1: { life: 50, deck: deck(5) } });
    await play(g, 0, 'tc_bomb'); eq(g.players[0].hand.length, 1, 'sandbag draw');
    await g.endTurn(0);
    eq(g.active, 0, 'pendulum extra turn'); eq(g.streak, 2); eq(g.players[0].timed[0].timedCount, 1);
    await g.endTurn(0); eq(g.active, 1, 'pendulum only once'); await g.endTurn(1);
    eq(g.players[1].life, 40, 'bomb fired'); eq(g.players[0].timed.length, 1, 'tools: returned once'); eq(g.players[0].timed[0].timedCount, 2);
    await g.endTurn(0); await g.endTurn(1); await g.endTurn(0); await g.endTurn(1);
    eq(g.players[1].life, 30); eq(g.players[0].timed.length, 0, 'second time it stays in the grave');
  });

  test('複製遺物: 霧の小瓶, 鏡の冠, 双子星の首飾り', async function () {
    const g = await battle(['relic_fog_vial'], []);
    ok(byDef(g.players[0].hand, 'copy_06'), '幻灯の呪文 added');
    const g2 = await T.sandbox({ p0: { phantoms: ['tc_vanilla'], hand: ['tc_bolt', 'tc_bolt', 'tc_sprite'], mana: 5, relics: ['relic_mirror_crown', 'relic_twin_star_necklace'], deck: deck(3) }, p1: { life: 50, deck: deck(3) } });
    eq(g2.atkOf(g2.players[0].phantoms[0]), 3, 'crown +1');
    await play(g2, 0, 'tc_bolt'); eq(g2.players[1].life, 42, 'first card twice');
    await play(g2, 0, 'tc_bolt'); eq(g2.players[1].life, 38);
    await g2.endTurn(0); await g2.endTurn(1); g2.players[0].mana = 5;
    await play(g2, 0, 'tc_sprite'); eq(g2.players[0].mana, 9, 'first card of a new turn: monster onSummon twice');
  });

  test('終焉遺物: 骸骨の鍵束, 黒い蝋燭, 冥府の契約書', async function () {
    const g = await battle(['relic_skeleton_keys', 'relic_black_candle', 'relic_underworld_contract'], [], deck(7).concat(['tc_key2', 'tc_vanilla']), deck(8));
    ok(byDef(g.players[0].hand, 'tc_key2'), 'key tutored');
    eq(g.players[1].curseLimit, 15); eq(g.players[0].curseLimit, 20);
    const ctx = g.makeCtx(0, null); await ctx.loseLife(0, 4); eq(g.players[1].curse, 4, 'contract');
    await ctx.addCurse(1, 11); eq(g.winner, 0); eq(g.winReason, 'curse');
  });

  test('ボス遺物: 心臓, 眼帯, 鎖の王冠, 砕けた砂時計, 聖杯, 狂王の指輪', async function () {
    const g = await battle(['relic_raging_heart', 'relic_blind_prophet_eyepatch', 'relic_chain_crown', 'relic_cursed_chalice', 'relic_mad_king_ring'], [], deck(20), deck(20));
    eq(g.players[0].mana, 4, 'heart +3 on turn 1'); eq(g.players[0].curse, 5, 'chalice curse');
    ok(g.players[0].hand.some(function (c) { return DB.get(c.defId).rarity === 'taboo'; }), 'chain crown gave a taboo');
    eq(g.players[0].hand.length, 6, '5 + taboo (first player no draw)');
    eq(g.status(0, 'maxBoard'), 10); eq(g.status(1, 'maxBoard'), 10, 'both sides');
    g.addCard(0, 'tc_bolt', 'hand'); eq(g.costOf(0, byDef(g.players[0].hand, 'tc_bolt')), 0, 'chalice -1 (bolt is cost 0 already → max 0)');
    g.addCard(0, 'tc_big', 'hand'); eq(g.costOf(0, byDef(g.players[0].hand, 'tc_big')), 3, 'monsters unaffected');
    await g.endTurn(0); eq(g.players[0].life, 38, 'heart drawback');
    await g.endTurn(1); eq(g.players[0].hand.length, 6 + 3, 'eyepatch: 3 draws (hand limit trimmed to 6 at end of turn)');
    const g2 = await battle(['relic_broken_hourglass'], [], deck(20), deck(20));
    await g2.endTurn(0); await g2.endTurn(1); await g2.endTurn(0); await g2.endTurn(1);
    eq(g2.players[0].turnsTaken, 3);
    await g2.endTurn(0); eq(g2.active, 0, 'extra turn after 3rd turn'); eq(g2.streak, 2);
    await g2.endTurn(0); eq(g2.active, 1);
  });

  test('呪われた遺物: 重い鎖, 腐った林檎, 泣き叫ぶ人形', async function () {
    const g = await battle(['relic_heavy_chain', 'relic_rotten_apple', 'relic_crying_doll'], [], deck(20), deck(20));
    eq(g.players[0].life, 35); eq(g.status(0, 'cardsPerTurnLimit'), 8);
    await g.endTurn(0); eq(g.players[1].hand.length, 8, 'enemy first turn: 1 + 2');
    await g.endTurn(1); await g.endTurn(0); eq(g.players[1].hand.length, 7, 'normal draw afterwards (hand limit 6 + 1)');
  });

  test('ボスの遺物: 作業台, 欠けた歯車, 指揮棒, 嵐の目, 手袋, 狂った砂時計, ルーペ, 鍵束, 姿見', async function () {
    const g = await battle([], ['relic_artisan_workbench', 'relic_missing_gear', 'relic_thunder_baton', 'relic_eye_of_storm'], deck(12), deck(6).concat(['boss1_01']).concat(deck(8)));
    ok(byDef(g.players[1].hand, 'boss1_01'), 'workbench fetched the phoenix');
    await g.endTurn(0);
    eq(g.players[1].chain, 2, 'baton');
    const ph = byDef(g.players[1].hand, 'boss1_01');
    const ctx = g.makeCtx(1, null); await ctx.exile(ph); eq(g.players[1].exile.length, 1);
    g.players[1].mana = 5; g.addCard(1, 'tc_spark', 'hand'); await play(g, 1, 'tc_spark');
    eq(g.players[1].exile.length, 0, 'missing gear returned the phoenix to deck'); ok(byDef(g.players[1].deck, 'boss1_01') || byDef(g.players[1].hand, 'boss1_01'), 'phoenix back in deck (or drawn by the spark)');
    ok(g.players[1].flags.missingGearUsed);
    g.players[1].hand.length = 0; g.players[1].chain = 9; g.addCard(1, 'tc_spark', 'hand'); await play(g, 1, 'tc_spark');
    eq(g.players[1].hand.length, 6, 'eye of storm drew to 5 at chain 10, then the spark itself drew 1');

    const g2 = await battle([], ['relic_thief_gloves', 'relic_mad_hourglass', 'relic_appraiser_loupe', 'relic_dusty_keyring', 'relic_fogged_mirror'],
      deck(5).concat(['gen_04', 'tc_vanilla', 'tc_vanilla', 'tc_vanilla', 'tc_vanilla']), deck(12));
    eq(g2.players[0].hand.length, 4, 'gloves stole 1'); eq(g2.players[1].hand.length, 5 + 1 + 1, 'stolen + mirror copy');
    eq(g2.players[1].vault.length, 1); eq(g2.players[1].vault[0].defId, 'gen_04', 'loupe prefers the disrupt card');
    eq(g2.players[1].seals.length, 1); eq(g2.players[1].seals[0].defId, 'doom_05');
    ok(g2.players[1].hand.some(function (c) { return c.isCopy; }), 'fogged mirror copy');
    await g2.endTurn(0); await g2.endTurn(1); await g2.endTurn(0); await g2.endTurn(1); await g2.endTurn(0);
    eq(g2.players[1].turnsTaken, 3); eq(g2.players[1].extraTurns, 1, 'mad hourglass on 3rd turn');
    const restored = G.Data.restoreVault(g2);
    eq(restored[0].length, 2, 'vault card + glove-stolen card return to P0'); ok(restored[0].indexOf('gen_04') >= 0);
  });

  test('エリートの遺物: 鱗, 封じ紐, 角, 胴, 予備の歯車, 仮面の山', async function () {
    const g = await battle([], ['relic_dragon_scale', 'relic_binding_bookmark', 'relic_charged_horn', 'relic_stuffing_torso', 'relic_spare_gear', 'relic_mask_pile'], deck(12, 'tc_bolt'), deck(12));
    eq(g.players[0].hand.length, 4, 'binding bookmark'); eq(g.players[1].hand.length, 5);
    eq(g.players[1].maxMana, 0, 'spare gear does not raise max mana');
    await g.endTurn(0); eq(g.players[1].maxMana, 1); eq(g.players[1].mana, 3, 'spare gear: +2 mana on the first turn'); eq(g.players[1].chain, 1, 'horn'); await g.endTurn(1);
    await g.endTurn(0); eq(g.players[1].maxMana, 2); eq(g.players[1].mana, 2, 'bonus was one-time'); await g.endTurn(1);
    g.players[0].mana = 10; await play(g, 0, 'tc_bolt'); eq(g.players[1].life, 37, 'scale -1');
    const ctx = g.makeCtx(0, null); await ctx.damage(1, 12); eq(g.players[0].curse, 1, 'torso'); eq(g.players[1].life, 37 - 11);
    const ph = await g.makeCtx(1, null).createPhantom('tc_vanilla', 1, { count: 1 }); eq(g.hpOf(ph[0]), 4, 'mask pile +1 hp');
  });
})(globalThis.G = globalThis.G || {});
