'use strict';
// tests/cards_generic.test.js — 汎用・妨害カード gen_01..30
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const Fx = G.Fx, DB = G.CardDB;
  if (!G.Data || !G.Data.validateAll) require(require('path').join(T.root(), 'js/data/_index.js'));
  function reg(def) { if (!DB.has(def.id)) DB.register(def); return def; }
  // test-only helpers (shared with other C tests via tc_ prefix)
  reg({ id: 'tc_vanilla', name: 'C兵', type: 'monster', cost: 1, atk: 2, hp: 3, effects: {} });
  reg({ id: 'tc_big', name: 'C巨人', type: 'monster', cost: 3, atk: 5, hp: 5, effects: {} });
  reg({ id: 'tc_bolt', name: 'C稲妻', type: 'spell', cost: 0, effects: { onPlay: Fx.dmgOpp(4) } });
  reg({ id: 'tc_heal', name: 'C手当', type: 'spell', cost: 0, effects: { onPlay: Fx.heal(5) } });
  reg({ id: 'tc_spark', name: 'C火種', type: 'spell', cost: 0, effects: { onPlay: Fx.seq(Fx.gainMana(1), Fx.draw(1)) } });
  reg({ id: 'tc_phoenix', name: 'C不死鳥', type: 'monster', cost: 0, atk: 1, hp: 1, tags: ['loopPart'],
    effects: { onSummon: Fx.gainMana(1), onLeave: async function (ctx) { await ctx.returnToHand(ctx.card); } } });
  reg({ id: 'tc_altar', name: 'C祭壇', type: 'crest', cost: 1, tags: ['loopPart'], effects: {
    ability: { label: '破壊', targets: { kind: 'boardMonster', side: 'ally', count: 1 }, use: async function (ctx) { await ctx.destroy(ctx.targets[0]); } } } });
  reg({ id: 'tc_gate', name: 'C門番', type: 'crest', cost: 0, effects: { onMonsterDestroyed: Fx.curse(2) } });
  reg({ id: 'tc_taboo_crest', name: 'C禁忌紋章', type: 'crest', cost: 0, rarity: 'taboo', effects: {} });
  reg({ id: 'tc_crest', name: 'C紋章', type: 'crest', cost: 0, effects: {} });
  reg({ id: 'tc_reprise', name: 'C泡沫', type: 'spell', cost: 0, reprise: 0, effects: { onPlay: Fx.draw(1) } });
  reg({ id: 'tc_extra', name: 'C砂時計', type: 'spell', cost: 1, effects: { onPlay: Fx.extraTurn() } });
  reg({ id: 'tc_bomb', name: 'C爆弾', type: 'spell', cost: 1, timed: 2, effects: { onTimed: Fx.dmgOpp(10) } });
  reg({ id: 'tc_curse2', name: 'C呪詛', type: 'spell', cost: 0, effects: { onPlay: Fx.curse(2) } });
  reg({ id: 'tc_skel', name: 'C骸骨', type: 'monster', cost: 1, atk: 1, hp: 1, effects: { onDeath: Fx.curse(1) } });
  reg({ id: 'tc_sprite', name: 'C妖精', type: 'monster', cost: 0, atk: 1, hp: 1, effects: { onSummon: Fx.gainMana(2) } });
  reg({ id: 'tc_key1', name: 'C鍵一', type: 'spell', cost: 0, key: 1, effects: { onPlay: Fx.seal() } });
  reg({ id: 'tc_key2', name: 'C鍵二', type: 'spell', cost: 0, key: 2, effects: { onPlay: Fx.seal() } });
  reg({ id: 'tc_key3', name: 'C鍵三', type: 'spell', cost: 0, key: 3, effects: { onPlay: Fx.seal() } });
  reg({ id: 'tc_key4', name: 'C鍵四', type: 'spell', cost: 0, key: 4, effects: { onPlay: Fx.seal() } });
  reg({ id: 'tc_phantomize', name: 'C幻灯', type: 'spell', cost: 0, targets: Fx.T.allyBoardMonster, effects: { onPlay: Fx.phantomOfTarget(2) } });

  function byDef(arr, id) { return arr.find(function (c) { return c.defId === id; }); }
  async function play(g, i, defId, choices) {
    const c = byDef(g.players[i].hand, defId) || byDef(g.players[i].grave, defId);
    ok(c, 'card ' + defId + ' available');
    const r = await g.playCard(i, c.uid, { choices: choices });
    ok(r.ok, defId + ' play ok (' + r.reason + ')');
    return r;
  }
  function deck(n, id) { return new Array(n).fill(id || 'tc_vanilla'); }

  test('gen: all 30 cards registered with SPEC texts and ids', function () {
    for (let i = 1; i <= 30; i++) { const id = 'gen_' + (i < 10 ? '0' + i : i); ok(DB.has(id), id); ok(DB.get(id).text.length > 0); eq(DB.get(id).lineage, 'generic'); }
    eq(DB.get('gen_30').rarity, 'taboo'); eq(DB.get('gen_28').type, 'field'); eq(DB.get('gen_16').reserve, true);
  });

  test('gen smoke: every generic card can be played without throwing', async function () {
    for (let i = 1; i <= 30; i++) {
      const id = 'gen_' + (i < 10 ? '0' + i : i);
      const def = DB.get(id);
      const g = await T.sandbox({
        p0: { hand: [id], mana: 10, life: def.id === 'gen_24' ? 8 : 40, deck: deck(8), board: ['tc_vanilla'], curse: 3 },
        p1: { board: ['tc_big', 'tc_skel'], hand: ['tc_bolt', 'tc_spark'], grave: ['tc_bolt'], crests: ['tc_crest'], deck: deck(8), timed: [{ id: 'tc_bomb', count: 2 }], seals: ['tc_key1'] }
      });
      const choices = {};
      if (def.targets) { const cands = g.makeCtx(0, null).candidatesFor(def.targets); ok(cands.length, id + ' has targets'); choices.targets = [cands[0].uid]; }
      await play(g, 0, id, choices);
      ok(g.winner === null || id === 'gen_30', id + ' did not end the game');
    }
  });

  test('封じの番兵: opponent cannot play from grave while it is on board', async function () {
    const g = await T.sandbox({ p0: { board: ['gen_01'] }, p1: { grave: ['tc_reprise'], deck: deck(3) } });
    await g.endTurn(0);
    eq(g.getPlayable(1).filter(function (x) { return x.from === 'grave'; }).length, 0, 'reprise blocked');
    const g2 = await T.sandbox({ p1: { grave: ['tc_reprise'], deck: deck(3) } });
    await g2.endTurn(0); eq(g2.getPlayable(1).filter(function (x) { return x.from === 'grave'; }).length, 1);
  });

  test('結界の僧兵: opponent limited to 10 cards per turn', async function () {
    const g = await T.sandbox({ p0: { board: ['gen_02'] }, p1: { hand: deck(12, 'tc_spark'), deck: deck(20) } });
    await g.endTurn(0);
    g.players[1].mana = 20;
    let n = 0;
    for (let i = 0; i < 12; i++) { const c = byDef(g.players[1].hand, 'tc_spark'); const r = await g.playCard(1, c.uid); if (r.ok) n++; else { eq(r.reason, 'cardsPerTurnLimit'); break; } }
    eq(n, 10);
  });

  test('魔封じの猫: reveals hand (event + handRevealed status)', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_03'], mana: 3 }, p1: { hand: ['tc_bolt', 'tc_spark'] } });
    const rec = T.record(g, ['reveal']);
    await play(g, 0, 'gen_03');
    eq(rec.count('reveal'), 1); eq(rec.last('reveal').uids.length, 2); eq(rec.last('reveal').who, 1);
    eq(g.status(1, 'handRevealed'), true);
  });

  test('消滅の光 exiles a phoenix for good (no return to hand); 墓地清め exiles grave', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_04', 'gen_05'], mana: 5 }, p1: { board: ['tc_phoenix'], grave: ['tc_bolt', 'tc_spark'] } });
    await play(g, 0, 'gen_04', { targets: [g.players[1].board[0].uid] });
    eq(g.players[1].board.length, 0); eq(g.players[1].hand.length, 0, 'onLeave return beaten by exile'); eq(g.players[1].exile.length, 1);
    await play(g, 0, 'gen_05');
    eq(g.players[1].grave.length, 0); eq(g.players[1].exile.length, 3);
  });

  test('霧払いの風 clears phantoms only', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_06'], mana: 5 }, p1: { board: ['tc_vanilla'], phantoms: ['tc_vanilla', 'tc_vanilla'] } });
    await play(g, 0, 'gen_06');
    eq(g.players[1].phantoms.length, 0); eq(g.players[1].board.length, 1);
  });

  test('封言の呪文 negates first spell next turn; 重圧の呪文 adds +1 cost', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_07', 'gen_08'], mana: 5, deck: deck(3) }, p1: { hand: ['tc_bolt', 'tc_bolt', 'tc_vanilla'], deck: deck(3) } });
    await play(g, 0, 'gen_07'); await play(g, 0, 'gen_08');
    eq(g.players[1].reserves.length, 2);
    await g.endTurn(0);
    g.players[1].mana = 5;
    eq(g.costOf(1, byDef(g.players[1].hand, 'tc_vanilla')), 2, 'cost +1');
    eq(g.costOf(1, byDef(g.players[1].hand, 'tc_bolt')), 1);
    await play(g, 1, 'tc_bolt'); eq(g.players[0].life, 40, 'negated');
    await play(g, 1, 'tc_bolt'); eq(g.players[0].life, 36);
    await g.endTurn(1);
    eq(g.players[1].reserves.length, 0); eq(g.players[0].grave.length, 2, 'reserve cards to grave after expiry');
    await g.endTurn(0);
    eq(g.costOf(1, byDef(g.players[1].hand, 'tc_vanilla')), 1, 'expired');
  });

  test('手札崩し discards 2; 時計止め delays timed by 2; 浄化の聖水 cleanses and draws', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_09', 'gen_10', 'gen_11'], mana: 9, curse: 7, deck: deck(3) }, p1: { hand: ['tc_bolt', 'tc_bolt', 'tc_bolt'], timed: [{ id: 'tc_bomb', count: 2 }] } });
    await play(g, 0, 'gen_09'); eq(g.players[1].hand.length, 1); eq(g.players[1].grave.length, 2);
    await play(g, 0, 'gen_10'); eq(g.players[1].timed[0].timedCount, 4);
    await play(g, 0, 'gen_11'); eq(g.players[0].curse, 0); eq(g.players[0].hand.length, 1);
  });

  test('静寂の神殿 limits both to 5 cards and draws on place; ただの草原 overwrites and draws', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_12', 'gen_13'].concat(deck(6, 'tc_spark')), mana: 20, deck: deck(10) } });
    await play(g, 0, 'gen_12');
    eq(g.field.defId, 'gen_12'); eq(g.status(0, 'cardsPerTurnLimit'), 5); eq(g.status(1, 'cardsPerTurnLimit'), 5);
    eq(g.players[0].drawnThisTurn, 1);
    await play(g, 0, 'gen_13');
    eq(g.field.defId, 'gen_13'); eq(g.players[0].grave.length, 1, 'old field to grave');
    eq(g.status(0, 'cardsPerTurnLimit'), Infinity);
  });

  test('反魔の護符 blocks reserve spells', async function () {
    const g = await T.sandbox({ p0: { crests: ['gen_14'] }, p1: { hand: ['gen_16'], deck: deck(3) } });
    await g.endTurn(0); g.players[1].mana = 5;
    await play(g, 1, 'gen_16');
    eq(g.players[0].reserves.length, 0); eq(g.players[1].grave.length, 1, 'blocked reserve goes to grave');
  });

  test('応急手当 heals 8 up to max', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_15', 'gen_15'], mana: 5, life: 30 } });
    g.players[0].maxLife = 40;
    await play(g, 0, 'gen_15'); eq(g.players[0].life, 38);
    await play(g, 0, 'gen_15'); eq(g.players[0].life, 40);
  });

  test('ループ断ちの鎖: opponent cannot play the same name twice (phoenix loop stops)', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_16'], mana: 5 }, p1: { hand: ['tc_phoenix'], crests: ['tc_altar'], deck: deck(3) } });
    await play(g, 0, 'gen_16'); await g.endTurn(0);
    g.players[1].mana = 5;
    await play(g, 1, 'tc_phoenix');
    const ab = g.getAbilities(1); await g.useAbility(1, ab[0].uid, ab[0].targets);
    ok(byDef(g.players[1].hand, 'tc_phoenix'), 'phoenix back in hand');
    eq(g.getPlayable(1).filter(function (x) { return x.defId === 'tc_phoenix'; }).length, 0, 'second play refused');
  });

  test('反射の鏡盾: first damage next turn hits the opponent themselves', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_17'], mana: 5 }, p1: { hand: ['tc_bolt', 'tc_bolt'], deck: deck(3) } });
    await play(g, 0, 'gen_17'); await g.endTurn(0);
    g.players[1].mana = 5;
    await play(g, 1, 'tc_bolt'); eq(g.players[1].life, 36); eq(g.players[0].life, 40);
    await play(g, 1, 'tc_bolt'); eq(g.players[0].life, 36);
  });

  test('簒奪の儀 steals an enemy monster (incl. bossOnly) and it can attack next turn', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_18'], mana: 5, deck: deck(3) }, p1: { board: ['boss1_01'], deck: deck(3) } });
    await play(g, 0, 'gen_18', { targets: [g.players[1].board[0].uid] });
    eq(g.players[0].board.length, 1); eq(g.players[1].board.length, 0);
    eq(g.players[0].board[0].defId, 'boss1_01'); eq(g.players[0].board[0].stolenFrom, 1);
    await g.endTurn(0); await g.endTurn(1);
    ok(g.getAttackers(0).length === 1, 'stolen monster can attack');
  });

  test('封印の鎖 removes a crest but cannot target taboo; 禁呪の封印 removes all incl. taboo', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_19', 'gen_27'], mana: 10 }, p1: { crests: ['tc_crest', 'tc_taboo_crest'] } });
    const def = DB.get('gen_19');
    const cands = g.makeCtx(0, null).candidatesFor(def.targets);
    eq(cands.length, 1); eq(cands[0].defId, 'tc_crest');
    await play(g, 0, 'gen_19', { targets: [cands[0].uid] });
    eq(g.players[1].crests.length, 1); eq(g.players[1].crests[0].defId, 'tc_taboo_crest');
    await play(g, 0, 'gen_27');
    eq(g.players[1].crests.length, 0);
  });

  test('封魔の大司教 suppresses enemy onSummon/onDeath; 時空の錨 blocks extra turns', async function () {
    const g = await T.sandbox({ p0: { board: ['gen_20'], crests: ['gen_21'] }, p1: { hand: ['tc_sprite', 'tc_extra', 'tc_skel'], board: ['tc_skel'], deck: deck(3) } });
    await g.endTurn(0);
    g.players[1].mana = 0;
    await play(g, 1, 'tc_sprite'); eq(g.players[1].mana, 0, 'no onSummon mana');
    g.players[1].mana = 5;
    await play(g, 1, 'tc_extra'); eq(g.players[1].extraTurns, 0, 'no extra turn');
    const ctx = g.makeCtx(1, null); await ctx.destroy(g.players[1].board[0]);
    eq(g.players[0].curse, 0, 'no onDeath curse');
  });

  test('呪詛喰らい: curse redirected as damage to it; dies and redirect ends', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_22'], mana: 5 }, p1: { hand: ['tc_curse2', 'tc_curse2'], deck: deck(3) } });
    await play(g, 0, 'gen_22'); await g.endTurn(0);
    g.players[1].mana = 5;
    await play(g, 1, 'tc_curse2');
    eq(g.players[0].curse, 0); eq(g.players[0].board[0].damage, 2, 'takes damage instead (engine applies n damage)');
    await play(g, 1, 'tc_curse2');
    eq(g.players[0].board.length, 0, 'eater died'); eq(g.players[0].curse, 0);
    const ctx = g.makeCtx(1, null); await ctx.addCurse(0, 1);
    eq(g.players[0].curse, 1, 'redirect gone after death');
  });

  test('先読みの賢者 looks at hand + top 5 and exiles one (scripted pick from deck)', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_23'], mana: 5, chooser: T.lastChooser }, p1: { hand: ['tc_bolt'], deck: deck(7, 'tc_spark') } });
    const rec = T.record(g, ['reveal']);
    await play(g, 0, 'gen_23');
    eq(rec.count('reveal'), 2);
    eq(g.players[1].exile.length, 1); eq(g.players[1].exile[0].defId, 'tc_spark'); eq(g.players[1].deck.length, 6);
    eq(g.players[1].hand.length, 1);
  });

  test('逆転の一手 only playable at life ≤ 10', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_24'], mana: 0, life: 11, deck: deck(5) } });
    eq(g.getPlayable(0).length, 0);
    g.players[0].life = 10;
    eq(g.getPlayable(0).length, 1);
    await play(g, 0, 'gen_24'); eq(g.players[0].hand.length, 3); eq(g.players[0].mana, 3);
  });

  test('全反転の大鏡 reflects a finisher onto its caster and heals go to us', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_25'], mana: 5, life: 30, deck: deck(3) }, p1: { hand: ['boss1_02', 'tc_spark', 'tc_heal'], life: 30, deck: deck(5) } });
    g.players[0].maxLife = 40;
    await play(g, 0, 'gen_25'); await g.endTurn(0);
    g.players[1].mana = 5; g.players[1].manaGainedThisTurn = 0;
    await play(g, 1, 'tc_spark');
    eq(g.players[0].mana, 1, 'mana gain inverted to us'); eq(g.players[0].hand.length, 1, 'draw inverted to us');
    g.players[1].manaGainedThisTurn = 7;
    await play(g, 1, 'boss1_02');
    eq(g.players[1].life, 23, 'finisher hit its caster'); eq(g.players[0].life, 30);
    await play(g, 1, 'tc_heal'); eq(g.players[0].life, 35);
  });

  test('虚無の顎 exiles 3 cards across board/hand/grave', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_26'], mana: 6 }, p1: { board: ['tc_big'], hand: ['tc_bolt'], grave: ['tc_spark'] } });
    await play(g, 0, 'gen_26');
    eq(g.players[1].exile.length, 3); eq(g.players[1].board.length, 0); eq(g.players[1].hand.length, 0); eq(g.players[1].grave.length, 0);
    const g2 = await T.sandbox({ p0: { hand: ['gen_26'], mana: 6 }, p1: { hand: ['tc_bolt'] } });
    await play(g2, 0, 'gen_26'); eq(g2.players[1].exile.length, 1, 'stops when nothing left');
  });

  test('零の聖域 stops a 2-card loop at iteration 2 and draws on place', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_28', 'tc_phoenix'], crests: ['tc_altar', 'tc_gate'], mana: 4, deck: deck(3) } });
    await play(g, 0, 'gen_28');
    eq(g.players[0].hand.length, 2, 'drew 1 (phoenix + drawn)');
    const rec = T.record(g, ['loopDetected', 'loopVoid']);
    for (let i = 0; i < 3; i++) { await play(g, 0, 'tc_phoenix'); const ab = g.getAbilities(0); await g.useAbility(0, ab[0].uid, ab[0].targets); }
    eq(rec.count('loopDetected'), 1);
    const res = await g.runLoop(0, 'inf');
    eq(res.iterations, 1); eq(res.reason, 'void'); eq(rec.count('loopVoid'), 1);
    eq(g.players[1].curse, 8, '3 manual + 1 loop iteration');
    // the opponent's loop is stopped as well (field is shared)
    const g2 = await T.sandbox({ field: 'gen_28', p1: { hand: ['tc_phoenix'], crests: ['tc_altar'], deck: deck(3) } });
    await g2.endTurn(0); g2.players[1].mana = 0;
    for (let i = 0; i < 3; i++) { await play(g2, 1, 'tc_phoenix'); const ab = g2.getAbilities(1); await g2.useAbility(1, ab[0].uid, ab[0].targets); }
    const res2 = await g2.runLoop(1, 10); eq(res2.reason, 'void');
  });

  test('因果の断絶: opponent cannot special-win this battle; seals cleared', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_29'], mana: 5 }, p1: { seals: ['tc_key1', 'tc_key2', 'tc_key3', 'tc_key4'], hand: ['boss4_01', 'boss4_03'], deck: deck(3) } });
    await play(g, 0, 'gen_29');
    eq(g.players[1].seals.length, 0); eq(g.players[1].grave.length, 4);
    await g.endTurn(0);
    g.players[1].mana = 10;
    for (let i = 0; i < 4; i++) g.addCard(1, 'tc_key' + (i + 1), 'seals');
    await play(g, 1, 'boss4_01');
    eq(g.distinctKeys(1), 5); eq(g.winner, null, 'noSpecialWin blocks 5 keys');
    await play(g, 1, 'boss4_03'); eq(g.winner, null, '最後の展示 blocked too');
    await g.endTurn(1); await g.endTurn(0);
    eq(g.status(1, 'noSpecialWin'), true, 'lasts the whole battle');
  });

  test('世界の再創造 resets board/hand/grave/crests/field for both; life & curse unchanged; maxMana 5; 5 cards each', async function () {
    const g = await T.sandbox({ field: 'gen_12', fieldOwner: 1,
      p0: { hand: ['gen_30', 'tc_bolt'], board: ['tc_vanilla'], crests: ['tc_crest'], grave: ['tc_spark'], mana: 12, maxMana: 12, life: 25, curse: 4, deck: deck(8) },
      p1: { hand: ['tc_bolt'], board: ['tc_phoenix'], phantoms: ['tc_vanilla'], crests: ['tc_taboo_crest'], grave: ['tc_spark', 'tc_spark'], life: 100, curse: 9, deck: deck(8) } });
    g.players[1].maxMana = 9;
    await play(g, 0, 'gen_30');
    [0, 1].forEach(function (i) {
      const p = g.players[i];
      eq(p.board.length, 0, 'board ' + i); eq(p.phantoms.length, 0); eq(p.crests.length, 0, 'crests ' + i); eq(p.grave.length, 0, 'grave ' + i);
      eq(p.hand.length, 5, 'hand ' + i); eq(p.maxMana, 5, 'maxMana ' + i); eq(p.deck.length, 3);
    });
    eq(g.field, null);
    eq(g.players[0].life, 25); eq(g.players[1].life, 100); eq(g.players[0].curse, 4); eq(g.players[1].curse, 9);
    eq(g.players[0].mana, 5, 'current mana capped at 5');
    ok(g.players[0].exile.length >= 5, 'own cards exiled incl. the spell itself: ' + g.players[0].exile.length);
    ok(byDef(g.players[0].exile, 'gen_30'), 'spell itself exiled');
    ok(byDef(g.players[1].exile, 'tc_phoenix') && !byDef(g.players[1].hand, 'tc_phoenix'), 'phoenix exiled, not returned');
    ok(byDef(g.players[1].exile, 'tc_taboo_crest'), 'taboo crest exiled');
  });
})(globalThis.G = globalThis.G || {});
