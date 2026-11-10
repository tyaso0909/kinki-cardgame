'use strict';
// tests/cards_chain.test.js — 連鎖系統 chain_01..25: smoke test + targeted tests + SPEC combos.
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const Fx = G.Fx, DB = G.CardDB;
  function reg(def) { if (!DB.has(def.id)) DB.register(def); return def; }
  // helpers shared by Cards-B test files (test-only ids prefixed tb_)
  reg({ id: 'tb_vanilla', name: 'B兵', type: 'monster', cost: 1, atk: 2, hp: 3, effects: {} });
  reg({ id: 'tb_spark', name: 'B火種', type: 'spell', cost: 0, effects: { onPlay: Fx.gainMana(1) } });
  reg({ id: 'tb_zero', name: 'B無', type: 'spell', cost: 0, effects: {} });
  reg({ id: 'tb_book', name: 'B永劫', type: 'crest', cost: 0, effects: { grants: [{ key: 'spellsReturnToHand', value: true }] } });
  reg({ id: 'tb_crucible', name: 'B坩堝', type: 'spell', cost: 0, effects: { onPlay: Fx.statusThisTurn('allCostsZero', true) } });

  const BOOK = DB.has('cycle_21') ? 'cycle_21' : 'tb_book';
  const CRUCIBLE = DB.has('accel_18') ? 'accel_18' : 'tb_crucible';

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

  const IDS = []; for (let i = 1; i <= 25; i++) IDS.push('chain_' + (i < 10 ? '0' : '') + i);

  test('chain: all 25 cards registered with SPEC metadata', function () {
    const names = ['雷鳴の子狐', '放電する精霊', '帯電の騎士', '嵐を呼ぶ巫女', '火花', '静電気', '雷撃の連打', '迅雷の閃き', '稲光の導線', '避雷針',
      '雷雲の封印', '雷紋の印', '嵐の蓄電器', '雷鳴の大鷲', '嵐の大精霊', '閃光の双刃', '天雷の裁き', '逆流する稲妻', '雷神の太鼓', '雷鳴の高原',
      '嵐の写し身', '雷帝', '終わらぬ雷雲', '万雷の巫女', '世界を貫く雷'];
    const costs = [0, 1, 3, 2, 0, 0, 1, 0, 1, 2, 2, 2, 1, 4, 5, 2, 3, 2, 3, 2, 2, 6, 4, 3, 6];
    const rar = ['common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common', 'common',
      'rare', 'rare', 'rare', 'rare', 'rare', 'rare', 'rare', 'legend', 'legend', 'legend', 'legend', 'taboo'];
    IDS.forEach(function (id, i) {
      const d = DB.get(id);
      eq(d.name, names[i], id); eq(d.cost, costs[i], id + ' cost'); eq(d.rarity, rar[i], id + ' rarity'); eq(d.lineage, 'chain');
      ok(d.text.length > 0, id + ' text');
    });
    const types = { monster: 0, spell: 0, crest: 0, field: 0 };
    IDS.forEach(function (id) { types[DB.get(id).type]++; });
    eq(types.monster, 9); eq(types.spell, 10); eq(types.crest, 5); eq(types.field, 1);
    ok(DB.get('chain_10').reserve && DB.get('chain_11').reserve);
    ok(DB.get('chain_19').tags.indexOf('extraTurn') >= 0);
  });

  test('chain: smoke — every card plays without throwing', async function () {
    for (let i = 0; i < IDS.length; i++) {
      const id = IDS[i];
      const g = await T.sandbox({ p0: { hand: [id, 'tb_spark', 'tb_spark'], board: ['tb_vanilla'], grave: ['chain_05', 'chain_07'], mana: 12, deck: deck(8) },
        p1: { board: ['tb_vanilla', 'tb_vanilla'], deck: deck(8) } });
      await play(g, 0, 'tb_spark'); await play(g, 0, 'tb_spark');
      await play(g, 0, id);
      ok(g.players[0].hand.indexOf(byDef(g.players[0].hand, id)) < 0 || DB.get(id).type === 'spell', id + ' left hand');
      await g.endTurn(0);
      ok(g.winner === null || g.winner === 0, id + ' no self-loss');
    }
  });

  test('子狐/静電気/巫女/雷撃: chain thresholds', async function () {
    const g = await T.sandbox({ p0: { hand: ['chain_06', 'chain_01', 'chain_06', 'chain_04', 'chain_07'], mana: 10, deck: deck(6) }, p1: { deck: deck(3) } });
    await play(g, 0, 'chain_06'); eq(g.players[0].mana, 11, '+1 only (chain 1)');
    await play(g, 0, 'chain_01'); eq(g.players[0].mana, 11, 'chain 2 <3 → no mana');
    g.players[0].chain = 4;
    await play(g, 0, 'chain_06'); eq(g.players[0].mana, 14, 'chain 5 → +1+2');
    await play(g, 0, 'chain_04'); eq(g.players[0].hand.length, 3, 'drew 2 (chain 6)');
    await play(g, 0, 'chain_07'); eq(g.players[1].life, 33, 'chain 7 damage');
  });

  test('火花/迅雷の閃き/稲光の導線', async function () {
    const g = await T.sandbox({ p0: { hand: ['chain_05', 'chain_08', 'chain_07', 'chain_09'], mana: 5, deck: deck(4) }, p1: { deck: deck(3) } });
    await play(g, 0, 'chain_05'); eq(g.players[1].life, 39); eq(g.players[0].hand.length, 4);
    await play(g, 0, 'chain_08'); eq(g.players[0].hand.length, 4);
    eq(g.costOf(0, byDef(g.players[0].hand, 'chain_07')), 0, 'next spell -1');
    await play(g, 0, 'chain_09'); eq(g.players[0].chain, 6, '3 plays + 3');
    eq(g.costOf(0, byDef(g.players[0].hand, 'chain_07')), 1, 'discount consumed by 導線');
  });

  test('放電する精霊: 1 dmg per card played; 嵐の大精霊: +1 mana per card', async function () {
    const g = await T.sandbox({ p0: { hand: ['tb_zero', 'tb_zero', 'tb_zero'], board: ['chain_02', 'chain_15'], mana: 3 } });
    await play(g, 0, 'tb_zero'); await play(g, 0, 'tb_zero'); await play(g, 0, 'tb_zero');
    eq(g.players[1].life, 37); eq(g.players[0].mana, 6);
  });

  test('帯電の騎士: atk +chain during its turn', async function () {
    const g = await T.sandbox({ p0: { hand: ['tb_zero', 'chain_03', 'tb_zero'], mana: 10 } });
    await play(g, 0, 'tb_zero'); await play(g, 0, 'chain_03');
    const k = g.players[0].board[0];
    eq(g.atkOf(k), 4, '2 + chain 2');
    await play(g, 0, 'tb_zero'); eq(g.atkOf(k), 5);
    await g.endTurn(0); eq(g.atkOf(k), 2, 'buff gone at end of turn');
  });

  test('避雷針 halves chain; 雷雲の封印 +3 cost from 6th card', async function () {
    const g = await T.sandbox({ p0: { hand: ['chain_10', 'chain_11'], mana: 5, deck: deck(2) }, p1: { hand: ['tb_zero', 'tb_zero', 'tb_zero', 'tb_zero', 'tb_zero', 'chain_07', 'chain_07'], deck: deck(3) } });
    await play(g, 0, 'chain_10'); await play(g, 0, 'chain_11'); await g.endTurn(0);
    g.players[1].mana = 10;
    for (let i = 0; i < 5; i++) await play(g, 1, 'tb_zero');
    eq(g.players[1].chain, 5); eq(g.chainOf(1), 2, 'halved, floor');
    const bolt = byDef(g.players[1].hand, 'chain_07');
    eq(g.costOf(1, bolt), 4, '6th card +3');
    await play(g, 1, 'chain_07'); eq(g.players[0].life, 37, 'chain 6 → 3 dmg');
    await g.endTurn(1);
    eq(g.players[1].reserves.length, 0, 'reserves expired');
  });

  test('雷紋の印: 5th card fires twice (spell and monster), not 4th/6th', async function () {
    const g = await T.sandbox({ p0: { hand: ['tb_zero', 'tb_zero', 'tb_zero', 'tb_zero', 'chain_07', 'chain_07'], crests: ['chain_12'], mana: 10 } });
    for (let i = 0; i < 4; i++) await play(g, 0, 'tb_zero');
    await play(g, 0, 'chain_07'); eq(g.players[1].life, 30, '5th: chain 5 × 2 times');
    await play(g, 0, 'chain_07'); eq(g.players[1].life, 24, '6th: once');
    const g2 = await T.sandbox({ p0: { hand: ['tb_zero', 'tb_zero', 'tb_zero', 'tb_zero', 'chain_01'], crests: ['chain_12'], mana: 10 } });
    for (let i = 0; i < 4; i++) await play(g2, 0, 'tb_zero');
    await play(g2, 0, 'chain_01'); eq(g2.players[0].mana, 14, 'onSummon ×2 → +4');
  });

  test('嵐の蓄電器: draw 2 at end of turn when chain ≥10', async function () {
    const g = await T.sandbox({ p0: { crests: ['chain_13'], chain: 10, deck: deck(4) }, p1: { deck: deck(2) } });
    await g.endTurn(0); eq(g.players[0].hand.length, 2);
    const g2 = await T.sandbox({ p0: { crests: ['chain_13'], chain: 9, deck: deck(4) }, p1: { deck: deck(2) } });
    await g2.endTurn(0); eq(g2.players[0].hand.length, 0);
  });

  test('雷鳴の大鷲 pings an enemy monster per card played', async function () {
    const g = await T.sandbox({ p0: { hand: ['tb_zero', 'tb_zero', 'tb_zero'], board: ['chain_14'], mana: 3 }, p1: { board: ['tb_vanilla'] } });
    await play(g, 0, 'tb_zero'); await play(g, 0, 'tb_zero');
    eq(g.players[1].board[0].damage, 2);
    await play(g, 0, 'tb_zero'); eq(g.players[1].board.length, 0, '3 hp monster dies');
  });

  test('閃光の双刃: two attacks when chain ≥5', async function () {
    const g = await T.sandbox({ p0: { hand: ['chain_16'], mana: 10, chain: 4 } });
    await play(g, 0, 'chain_16');
    const b = g.players[0].board[0];
    eq(b.attacksLeft, 2);
    await g.attack(0, b.uid, 'face'); await g.attack(0, b.uid, 'face');
    eq(g.players[1].life, 36);
    const g2 = await T.sandbox({ p0: { hand: ['chain_16', 'tb_zero'], mana: 10, chain: 3 } });
    await play(g2, 0, 'chain_16'); eq(g2.players[0].board[0].attacksLeft, 1);
    await play(g2, 0, 'tb_zero'); eq(g2.players[0].board[0].attacksLeft, 2, 'granted when chain reaches 5 later');
  });

  test('逆流する稲妻 returns 3 spells played this turn', async function () {
    const g = await T.sandbox({ p0: { hand: ['tb_zero', 'tb_zero', 'tb_zero', 'tb_zero', 'chain_18'], grave: ['chain_07'], mana: 10 } });
    for (let i = 0; i < 4; i++) await play(g, 0, 'tb_zero');
    await play(g, 0, 'chain_18');
    eq(g.players[0].hand.length, 3); eq(g.players[0].hand.filter(function (c) { return c.defId === 'tb_zero'; }).length, 3);
    ok(byDef(g.players[0].grave, 'chain_07'), 'spell not played this turn stays');
  });

  test('雷帝: chain×2 to face and all enemy monsters', async function () {
    const g = await T.sandbox({ p0: { hand: ['chain_22'], mana: 10, chain: 2 }, p1: { board: ['tb_vanilla', 'tb_vanilla'], phantoms: ['tb_vanilla'] } });
    await play(g, 0, 'chain_22');
    eq(g.players[1].life, 34, 'chain 3 ×2 = 6'); eq(g.players[1].board.length, 0); eq(g.players[1].phantoms.length, 0);
  });

  test('終わらぬ雷雲: choose mana or draw per card', async function () {
    const g = await T.sandbox({ p0: { hand: ['tb_zero', 'tb_zero'], crests: ['chain_23'], mana: 0, deck: deck(3), chooser: T.lastChooser } });
    await play(g, 0, 'tb_zero'); eq(g.players[0].hand.length, 2, 'last option = draw');
    g.players[0].chooser = null;
    await play(g, 0, 'tb_zero'); eq(g.players[0].mana, 1, 'first option = mana');
  });

  test('雷鳴の高原: -1 cost for both when chain ≥5; 展開時 chain+3', async function () {
    const g = await T.sandbox({ p0: { hand: ['chain_20', 'tb_zero', 'chain_07'], mana: 10 }, p1: { hand: ['chain_07'] } });
    await play(g, 0, 'chain_20'); eq(g.players[0].chain, 4);
    eq(g.costOf(0, byDef(g.players[0].hand, 'chain_07')), 1);
    await play(g, 0, 'tb_zero'); eq(g.players[0].chain, 5);
    eq(g.costOf(0, byDef(g.players[0].hand, 'chain_07')), 0, 'discounted');
    eq(g.costOf(1, byDef(g.players[1].hand, 'chain_07')), 1, 'opponent chain 0 → no discount');
  });

  test('世界を貫く雷: chain persists across turns', async function () {
    const g = await T.sandbox({ p0: { hand: ['tb_zero', 'tb_zero'], crests: ['chain_25'], mana: 5, deck: deck(3) }, p1: { deck: deck(3) } });
    await play(g, 0, 'tb_zero'); await play(g, 0, 'tb_zero'); await g.endTurn(0);
    eq(g.players[0].chain, 2); await g.endTurn(1); eq(g.players[0].chain, 2, 'still 2 at my next turn start');
  });

  // ---- SPEC combos ----
  test('コンボ 永劫の書と放電: spell returns to hand, each play deals 1 → runLoop to win', async function () {
    const g = await T.sandbox({ p0: { hand: ['tb_zero'], board: ['chain_02'], crests: [BOOK], mana: 0, life: 40 }, p1: { life: 12 } });
    for (let i = 0; i < 3; i++) await play(g, 0, 'tb_zero');
    eq(g.players[1].life, 9); ok(g.loop.detected, 'loop detected');
    const res = await g.runLoop(0, 'inf');
    eq(g.winner, 0); eq(res.reason, 'win');
  });

  test('コンボ 坩堝で全開放: all costs 0 → dump hand → 天雷の裁き', async function () {
    const g = await T.sandbox({ p0: { hand: [CRUCIBLE, 'chain_17', 'chain_22', 'chain_15', 'chain_14', 'chain_04', 'chain_16'], mana: 5, deck: deck(4) } });
    await play(g, 0, CRUCIBLE);
    ['chain_22', 'chain_15', 'chain_14', 'chain_04', 'chain_16'].forEach(function (id) { eq(g.costOf(0, byDef(g.players[0].hand, id)), 0, id + ' free'); });
    await play(g, 0, 'chain_04'); await play(g, 0, 'chain_16'); await play(g, 0, 'chain_15'); await play(g, 0, 'chain_14');
    await play(g, 0, 'chain_22'); // chain 6 → 12 face dmg
    eq(g.players[1].life, 28);
    await play(g, 0, 'chain_17'); // chain 7 → 21
    eq(g.players[1].life, 7);
  });

  test('コンボ 巫女と写し身: chain doubled, 嵐の写し身 makes 天雷の裁き fire chainOf times', async function () {
    const hand = ['chain_21', 'chain_17'];
    const g = await T.sandbox({ p0: { hand: hand, board: ['chain_24'], mana: 10, chain: 2 }, p1: { life: 300 } });
    await play(g, 0, 'chain_21'); // chain 3 → effective 6 → next spell ×6
    eq(g.players[0].nextSpellTimes, 6);
    await play(g, 0, 'chain_17'); // chain 4 → effective 8 → 24 dmg × 6 = 144
    eq(g.players[1].life, 156);
  });

  test('コンボ 太鼓で追加ターン: chain 10 → extra turn, streak 2, once per turn', async function () {
    const g = await T.sandbox({ p0: { hand: new Array(11).fill('tb_zero'), crests: ['chain_19'], mana: 0, deck: deck(3) }, p1: { deck: deck(3) } });
    for (let i = 0; i < 9; i++) await play(g, 0, 'tb_zero');
    eq(g.players[0].extraTurns, 0);
    await play(g, 0, 'tb_zero'); eq(g.players[0].extraTurns, 1);
    await play(g, 0, 'tb_zero'); eq(g.players[0].extraTurns, 1, 'once per turn');
    await g.endTurn(0);
    eq(g.active, 0); eq(g.streak, 2);
    // with 万雷の巫女 only 5 plays are needed
    const g2 = await T.sandbox({ p0: { hand: new Array(5).fill('tb_zero'), board: ['chain_24'], crests: ['chain_19'], mana: 0 } });
    for (let i = 0; i < 5; i++) await play(g2, 0, 'tb_zero');
    eq(g2.players[0].extraTurns, 1);
  });

  test('コンボ 重ねがけ: spellMultiplier doubles effect but not chain', async function () {
    const g = await T.sandbox({ p0: { hand: ['chain_07'], mana: 5, chain: 2, statuses: { spellMultiplier: 2 } } });
    await play(g, 0, 'chain_07');
    eq(g.players[0].chain, 3); eq(g.players[1].life, 34, '3 dmg × 2');
  });
})(globalThis.G);
