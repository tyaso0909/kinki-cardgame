'use strict';
// tests/cards_doom.test.js — 終焉系統 doom_01..25: smoke + targeted + SPEC combos.
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const Fx = G.Fx, DB = G.CardDB;
  function reg(def) { if (!DB.has(def.id)) DB.register(def); return def; }
  reg({ id: 'tb_vanilla', name: 'B兵', type: 'monster', cost: 1, atk: 2, hp: 3, effects: {} });
  reg({ id: 'tb_zero', name: 'B無', type: 'spell', cost: 0, effects: {} });
  reg({ id: 'tb_bolt', name: 'B稲妻', type: 'spell', cost: 0, effects: { onPlay: Fx.dmgOpp(5) } });
  reg({ id: 'tb_cheap', name: 'B小兵', type: 'monster', cost: 2, atk: 1, hp: 1, effects: {} });
  reg({ id: 'tb_phoenix', name: 'B不死鳥', type: 'monster', cost: 0, atk: 1, hp: 1,
    effects: { onSummon: Fx.gainMana(1), onLeave: async function (ctx) { await ctx.returnToHand(ctx.card); } } });
  reg({ id: 'tb_altar', name: 'B祭壇', type: 'crest', cost: 1, effects: {
    ability: { label: '破壊', targets: { kind: 'boardMonster', side: 'ally', count: 1 }, use: async function (ctx) { await ctx.destroy(ctx.targets[0]); } } } });
  reg({ id: 'tb_slime', name: 'B粘体', type: 'monster', cost: 2, atk: 1, hp: 1, effects: { onDeath: Fx.phantomOfSelf(2) } });
  reg({ id: 'tb_extra', name: 'B砂時計', type: 'spell', cost: 0, effects: { onPlay: Fx.extraTurn() } });

  const PHOENIX = DB.has('accel_23') ? 'accel_23' : 'tb_phoenix';
  const ALTAR = DB.has('accel_13') ? 'accel_13' : 'tb_altar';
  const SLIME = DB.has('copy_16') ? 'copy_16' : 'tb_slime';
  const HOURGLASS = DB.has('time_14') ? 'time_14' : 'tb_extra';

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
  const IDS = []; for (let i = 1; i <= 25; i++) IDS.push('doom_' + (i < 10 ? '0' : '') + i);

  test('doom: all 25 cards registered with SPEC metadata', function () {
    const names = ['墓場の骸骨兵', '呪いを運ぶ鴉', '墓守の死霊術師', '骨の祭司', '終末の鍵・第一', '終末の鍵・第二', '終末の鍵・第三', '呪詛の囁き', '生け贄の儀', '血の契約',
      '封印破り', '呪いの刻印', '死者の行進', '終末の鍵・第四', '蘇りし不死の王', '呪詛の爆発', '屍山の巨人', '古の封印庫', '死者の国', '呪詛返し',
      '終末の鍵・第五', '封印の解放者', '冥王の宣告', '冥界の門番', '終末の預言書'];
    const costs = [1, 2, 3, 2, 1, 2, 2, 0, 0, 0, 2, 2, 1, 3, 5, 3, 6, 3, 3, 1, 4, 4, 5, 7, 9];
    const rar = ['common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common',
      'rare', 'rare', 'rare', 'rare', 'rare', 'rare', 'rare', 'legend', 'legend', 'legend', 'legend', 'taboo'];
    IDS.forEach(function (id, i) {
      const d = DB.get(id);
      eq(d.name, names[i], id); eq(d.cost, costs[i], id + ' cost'); eq(d.rarity, rar[i], id + ' rarity'); eq(d.lineage, 'doom');
    });
    const types = { monster: 0, spell: 0, crest: 0, field: 0 };
    IDS.forEach(function (id) { types[DB.get(id).type]++; });
    eq(types.monster, 8); eq(types.spell, 12); eq(types.crest, 4); eq(types.field, 1);
    eq(DB.get('doom_05').key, 1); eq(DB.get('doom_06').key, 2); eq(DB.get('doom_07').key, 3); eq(DB.get('doom_14').key, 4); eq(DB.get('doom_21').key, 5);
    ['doom_05', 'doom_06', 'doom_07', 'doom_14', 'doom_21'].forEach(function (id) { ok(DB.get(id).tags.indexOf('key') >= 0, id + ' tag key'); });
    ok(DB.get('doom_22').tags.indexOf('wild') >= 0);
    eq(DB.get('doom_25').timed, 3); ok(DB.get('doom_25').effects.fixedTimer && DB.get('doom_25').effects.indestructible);
  });

  test('doom: smoke — every card plays without throwing', async function () {
    for (let i = 0; i < IDS.length; i++) {
      const id = IDS[i];
      const g = await T.sandbox({ p0: { hand: [id], board: ['tb_vanilla'], grave: ['tb_cheap', 'doom_05', 'tb_bolt'], seals: ['doom_05'], mana: 12, deck: ['doom_06'].concat(deck(6)), curse: 2, life: 40 },
        p1: { board: ['tb_vanilla'], seals: ['doom_05'], deck: deck(8), curse: 2 } });
      const choices = {};
      const def = DB.get(id);
      if (def.targets) { const cands = g.makeCtx(0, null).candidatesFor(def.targets); ok(cands.length, id + ' has targets'); choices.targets = [cands[0].uid]; }
      await play(g, 0, id, choices);
      await g.endTurn(0);
      ok(g.winner === null || g.winner === 0, id + ' no self-loss');
    }
  });

  test('骸骨兵/鴉/刻印/囁き: curse sources', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_08'], board: ['doom_01', 'doom_02'], crests: ['doom_12'], mana: 5, deck: deck(3) }, p1: { hand: ['tb_zero', 'tb_zero'], deck: deck(3) } });
    eq(g.players[1].curse, 1, '刻印 already ticked at the sandbox turn start');
    await play(g, 0, 'doom_08'); eq(g.players[1].curse, 3);
    await g.makeCtx(0, null).destroy(byDef(g.players[0].board, 'doom_01')); eq(g.players[1].curse, 4);
    await g.endTurn(0);
    g.players[1].mana = 5;
    await play(g, 1, 'tb_zero'); await play(g, 1, 'tb_zero'); eq(g.players[1].curse, 6, '鴉: +1 per enemy spell');
    eq(g.players[0].curse, 0, 'my own spells do not trigger my 鴉');
    await g.endTurn(1); eq(g.players[1].curse, 7, '刻印 at my turn start');
  });

  test('死霊術師 / 第三の鍵 / 死者の国 revive; 骨の祭司 & 封印庫 tutor keys', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_03', 'doom_04'], grave: ['tb_vanilla', 'tb_cheap'], mana: 10, deck: ['tb_vanilla', 'doom_14', 'tb_vanilla'] } });
    await play(g, 0, 'doom_03');
    eq(g.players[0].board.length, 2); ok(byDef(g.players[0].board, 'tb_cheap') || byDef(g.players[0].board, 'tb_vanilla'), 'cost ≤2 monster revived');
    await play(g, 0, 'doom_04');
    eq(g.players[0].life, 37); ok(byDef(g.players[0].hand, 'doom_14'), 'key tutored');
    const g2 = await T.sandbox({ p0: { crests: ['doom_18'], deck: ['tb_vanilla', 'doom_05'] }, p1: { deck: deck(2) } });
    await g2.endTurn(0); await g2.endTurn(1);
    ok(byDef(g2.players[0].hand, 'doom_05'), '封印庫 tutors at turn start');
  });

  test('生け贄の儀 / 血の契約 / 死者の行進', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_09', 'doom_10'], board: ['tb_vanilla'], crests: ['doom_13'], mana: 0, deck: deck(5) } });
    await play(g, 0, 'doom_09', { targets: [g.players[0].board[0].uid] });
    eq(g.players[0].board.length, 0); eq(g.players[0].mana, 3, '+2 +1 (行進)'); eq(g.players[0].hand.length, 2);
    await play(g, 0, 'doom_10'); eq(g.players[0].life, 36); eq(g.players[0].hand.length, 3);
  });

  test('封印破り removes an enemy seal; sealsProtected blocks', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_11', 'doom_11'], mana: 10 }, p1: { seals: ['doom_05', 'doom_06'] } });
    const t = g.players[1].seals[0];
    await play(g, 0, 'doom_11', { targets: [t.uid] });
    eq(g.players[1].seals.length, 1); eq(g.distinctKeys(1), 1); eq(g.players[1].grave.length, 1);
    g.setStatus(1, 'sealsProtected', true);
    await play(g, 0, 'doom_11', { targets: [g.players[1].seals[0].uid] });
    eq(g.players[1].seals.length, 1, 'protected');
  });

  test('第四の鍵 recovers a key from grave; 第五の鍵 casts a key from deck for free', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_14'], grave: ['doom_05', 'tb_zero'], mana: 10 } });
    await play(g, 0, 'doom_14');
    eq(g.distinctKeys(0), 1); ok(byDef(g.players[0].hand, 'doom_05'));
    const g2 = await T.sandbox({ p0: { hand: ['doom_21'], deck: ['tb_vanilla', 'doom_06', 'tb_vanilla'], mana: 4 } });
    await play(g2, 0, 'doom_21');
    eq(g2.distinctKeys(0), 2, 'fifth + second'); eq(g2.players[0].mana, 0); eq(g2.players[1].curse, 2, 'the free key resolved');
    eq(g2.players[0].chain, 2, 'free cast of a real card counts as a play');
  });

  test('蘇りし不死の王 returns for 5 life (chooser agrees); not when life ≤5', async function () {
    const g = await T.sandbox({ p0: { board: ['doom_15'], life: 20 } });
    await g.makeCtx(0, null).destroy(g.players[0].board[0]);
    eq(g.players[0].board.length, 1); eq(g.players[0].life, 15);
    const g2 = await T.sandbox({ p0: { board: ['doom_15'], life: 5 } });
    await g2.makeCtx(0, null).destroy(g2.players[0].board[0]);
    eq(g2.players[0].board.length, 0); eq(g2.players[0].life, 5);
  });

  test('呪詛の爆発 / 呪詛返し / 冥王の宣告', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_16', 'doom_20', 'doom_23'], mana: 10, curse: 4 }, p1: { curse: 3 } });
    await play(g, 0, 'doom_16'); eq(g.players[1].life, 34);
    await play(g, 0, 'doom_20'); eq(g.players[0].curse, 0); eq(g.players[1].curse, 7);
    await play(g, 0, 'doom_23'); eq(g.players[1].curse, 14);
  });

  test('屍山の巨人: X = grave monsters ×2; dies at 0', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_17'], grave: ['tb_vanilla', 'tb_vanilla', 'tb_cheap', 'tb_zero'], mana: 10 } });
    await play(g, 0, 'doom_17');
    const giant = g.players[0].board[0];
    eq(g.atkOf(giant), 6); eq(g.hpOf(giant), 6);
    await g.attack(0, giant.uid, 'face'); eq(g.players[1].life, 34, 'rush');
    const g2 = await T.sandbox({ p0: { hand: ['doom_17'], mana: 10 } });
    await play(g2, 0, 'doom_17'); eq(g2.players[0].board.length, 0, '0/0 dies');
  });

  test('死者の国: destroyed monsters return at owner next turn start (both sides)', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_19'], board: ['tb_vanilla'], grave: ['tb_cheap'], mana: 10, deck: deck(4) }, p1: { board: ['tb_vanilla'], deck: deck(4) } });
    await play(g, 0, 'doom_19');
    eq(g.players[0].board.length, 2, '展開時 revive');
    const ctx = g.makeCtx(0, null);
    await ctx.destroy(byDef(g.players[0].board, 'tb_vanilla'));
    await ctx.destroy(g.players[1].board[0]);
    eq(g.players[0].board.length, 1); eq(g.players[1].board.length, 0);
    await g.endTurn(0);
    eq(g.players[1].board.length, 1, 'enemy monster returned at their turn start');
    eq(g.players[0].board.length, 1, 'mine not yet');
    await g.endTurn(1);
    eq(g.players[0].board.length, 2, 'mine returned');
  });

  test('封印の解放者: one seal counts as a missing key (4 kinds → win); none without seals', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_14'], board: ['doom_22'], seals: ['doom_05', 'doom_06', 'doom_07'], mana: 10 } });
    eq(g.distinctKeys(0), 4);
    await play(g, 0, 'doom_14');
    eq(g.winner, 0); eq(g.winReason, 'seals');
    const g2 = await T.sandbox({ p0: { board: ['doom_22'] } });
    eq(g2.distinctKeys(0), 0, 'no seals → no wild');
    const g3 = await T.sandbox({ p0: { hand: ['doom_22'], seals: ['doom_05', 'doom_06', 'doom_07', 'doom_14'], mana: 10 } });
    await play(g3, 0, 'doom_22'); eq(g3.winner, 0, 'summoning the liberator with 4 keys wins immediately');
  });

  test('冥界の門番: curse 2 per destroyed ally incl. phantoms', async function () {
    const g = await T.sandbox({ p0: { board: ['doom_24', 'tb_vanilla'], phantoms: ['tb_vanilla'] } });
    const ctx = g.makeCtx(0, null);
    await ctx.destroy(byDef(g.players[0].board, 'tb_vanilla')); eq(g.players[1].curse, 2);
    await ctx.destroy(g.players[0].phantoms[0]); eq(g.players[1].curse, 4);
    ctx.vanishPhantom(g.players[0].phantoms[0] || { zone: 'x' });
  });

  test('終末の預言書: fixed timer, indestructible, wins after 3 own turn starts', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_25', 'time_05'], mana: 10, deck: deck(8) }, p1: { deck: deck(8) } });
    await play(g, 0, 'doom_25');
    const book = g.players[0].crests[0]; eq(book.timedCount, 3);
    await play(g, 0, 'time_05'); eq(book.timedCount, 3, 'count manipulation ignored');
    ok(!(await g.makeCtx(1, null).removeCrest(book)), 'cannot be removed');
    await g.endTurn(0); await g.endTurn(1); eq(book.timedCount, 2); eq(g.winner, null);
    await g.endTurn(0); await g.endTurn(1); eq(book.timedCount, 1);
    await g.endTurn(0); await g.endTurn(1);
    eq(g.winner, 0); eq(g.winReason, 'prophecy');
  });

  // ---- SPEC combos ----
  test('コンボ 不死鳥と門番（無限呪詛）: altar destroys phoenix → gatekeeper curse 2 → loop → win', async function () {
    const g = await T.sandbox({ p0: { hand: [PHOENIX], board: ['doom_24'], crests: [ALTAR], mana: 0 } });
    for (let i = 0; i < 3; i++) {
      await play(g, 0, PHOENIX);
      const ab = g.getAbilities(0).find(function (a) { return a.defId === ALTAR; });
      ok(ab, 'altar ability available');
      const target = ab.targets.find(function (u) { return g.findCard(u).defId === PHOENIX; });
      await g.useAbility(0, ab.uid, [target]);
    }
    eq(g.players[1].curse, 6); ok(byDef(g.players[0].hand, PHOENIX), 'phoenix back in hand');
    ok(g.loop.detected, 'loop detected');
    const res = await g.runLoop(0, 'inf');
    eq(g.winner, 0); eq(g.winReason, 'curse'); eq(res.reason, 'win');
    eq(g.players[1].curse, 20);
  });

  test('コンボ 粘体と門番: phantoms destroyed also add curse', async function () {
    const g = await T.sandbox({ p0: { hand: [SLIME], board: ['doom_24'], crests: [ALTAR], mana: 10 } });
    await play(g, 0, SLIME);
    const slime = byDef(g.players[0].board, SLIME);
    let ab = g.getAbilities(0).find(function (a) { return a.defId === ALTAR; });
    await g.useAbility(0, ab.uid, [slime.uid]);
    eq(g.players[1].curse, 2); ok(g.players[0].phantoms.length >= 1, 'phantoms spawned');
    const ph = g.players[0].phantoms[0];
    ab = g.getAbilities(0).find(function (a) { return a.defId === ALTAR; });
    if (ab && ab.targets.indexOf(ph.uid) >= 0) { await g.useAbility(0, ab.uid, [ph.uid]); eq(g.players[1].curse, 4, 'phantom death counted'); }
    else { await g.makeCtx(0, null).destroy(ph); eq(g.players[1].curse, 4, 'phantom death counted'); }
  });

  test('コンボ 鍵の一気集め: 5 distinct keys → seals win; 第五 pulls the last one', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_05', 'doom_06', 'doom_07', 'doom_21'], deck: ['tb_vanilla', 'doom_14'], mana: 20 } });
    await play(g, 0, 'doom_05'); await play(g, 0, 'doom_06'); await play(g, 0, 'doom_07');
    eq(g.distinctKeys(0), 3); eq(g.winner, null);
    await play(g, 0, 'doom_21');
    eq(g.winner, 0); eq(g.winReason, 'seals'); eq(g.players[0].seals.length, 5);
    // duplicates count once
    const g2 = await T.sandbox({ p0: { seals: ['doom_05', 'doom_05', 'doom_06'] } });
    eq(g2.distinctKeys(0), 2);
  });

  test('コンボ 呪詛の倍々: curse 10 → 冥王の宣告 → 20 → win', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_23'], mana: 10 }, p1: { curse: 10 } });
    await play(g, 0, 'doom_23');
    eq(g.players[1].curse, 20); eq(g.winner, 0); eq(g.winReason, 'curse');
    const g3 = await T.sandbox({ p0: { hand: ['doom_23'], mana: 10 }, p1: { curse: 0 } });
    await play(g3, 0, 'doom_23'); eq(g3.players[1].curse, 0, 'nothing to double');
  });

  test('コンボ 預言を早める: extra turns bring the prophecy sooner', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_25', HOURGLASS, HOURGLASS], crests: DB.has('time_21') ? ['time_21'] : [], mana: 20, deck: deck(8) }, p1: { deck: deck(8) } });
    await play(g, 0, 'doom_25');
    const book = byDef(g.players[0].crests, 'doom_25');
    await play(g, 0, HOURGLASS); await g.endTurn(0);          // extra turn 1 → count 2
    eq(g.active, 0); eq(book.timedCount, 2);
    g.players[0].mana = 10;
    await play(g, 0, HOURGLASS); await g.endTurn(0);          // extra turn 2 → count 1
    eq(g.active, 0); eq(book.timedCount, 1);
    await g.endTurn(0); eq(g.active, 1); eq(g.winner, null);  // opponent gets one turn
    await g.endTurn(1);                                        // my turn start → 0 → win
    eq(g.winner, 0); eq(g.winReason, 'prophecy');
    eq(g.turn, 5, 'won on turn 5 instead of turn 7');
  });
})(globalThis.G);
