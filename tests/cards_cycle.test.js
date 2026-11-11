'use strict';
// tests/cards_cycle.test.js — 循環系統 cycle_01..25 smoke + targeted + combo tests.
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const DB = G.CardDB;

  function byDef(arr, id) { return arr.find(function (c) { return c.defId === id; }); }
  async function play(g, i, defId, choices) {
    const p = g.players[i];
    const c = byDef(p.hand, defId) || byDef(p.grave, defId);
    ok(c, 'card ' + defId + ' available');
    const r = await g.playCard(i, c.uid, { choices: choices });
    ok(r.ok, 'play ' + defId + ' failed: ' + r.reason);
    return r;
  }
  const filler = function (n, id) { return new Array(n).fill(id || 'cycle_01'); };

  test('cycle: all 25 cards registered with SPEC names/costs/rarities', function () {
    const spec = [
      ['書庫の小人', 1, 'common', 'monster'], ['潮騒の人魚', 2, 'common', 'monster'], ['渦潮の番人', 2, 'common', 'monster'],
      ['写本の精霊', 0, 'common', 'monster'], ['知識の泉水', 1, 'common', 'spell'], ['潮の満ち引き', 0, 'common', 'spell'],
      ['古文書の発掘', 1, 'common', 'spell'], ['水鏡の占い', 0, 'common', 'spell'], ['泡沫の呪文', 0, 'common', 'spell'],
      ['忘却の波', 2, 'common', 'spell'], ['深淵の問い', 1, 'common', 'spell'], ['言霊の洪水', 0, 'common', 'spell'],
      ['満ちる書架', 2, 'common', 'crest'], ['大図書館の司書長', 4, 'rare', 'monster'], ['流転の水竜', 6, 'rare', 'monster'],
      ['巻き戻しの泉', 2, 'rare', 'spell'], ['溢れ出す記憶', 3, 'rare', 'spell'], ['沈む書庫', 3, 'rare', 'crest'],
      ['底なしの湖', 2, 'rare', 'field'], ['逆巻く大海嘯', 4, 'rare', 'spell'], ['永劫の書', 4, 'legend', 'crest'],
      ['時を綴る大賢者', 5, 'legend', 'monster'], ['書喰らいの海魔', 8, 'legend', 'monster'], ['全知の雫', 3, 'legend', 'spell'],
      ['終わりなき頁', 6, 'taboo', 'crest']
    ];
    spec.forEach(function (s, i) {
      const id = 'cycle_' + String(i + 1).padStart(2, '0');
      const d = DB.get(id);
      eq(d.name, s[0], id); eq(d.cost, s[1], id + ' cost'); eq(d.rarity, s[2], id + ' rarity'); eq(d.type, s[3], id + ' type');
      eq(d.lineage, 'cycle'); ok(d.text.length > 0, id + ' text');
    });
    eq(DB.get('cycle_09').reprise, 0); ok(DB.get('cycle_10').reserve); ok(DB.get('cycle_03').keywords.indexOf('guard') >= 0);
  });

  test('cycle: smoke — every card can be played without throwing', async function () {
    const ids = DB.filter(function (d) { return d.lineage === 'cycle' && d.set !== 'dragon'; }).map(function (d) { return d.id; });
    for (let k = 0; k < ids.length; k++) {
      const id = ids[k];
      const g = await T.sandbox({
        p0: { hand: [id, 'cycle_01', 'cycle_05'], board: ['cycle_01'], mana: 20, deck: filler(8), grave: ['cycle_05', 'cycle_01', 'cycle_06'] },
        p1: { board: ['cycle_01'], hand: ['cycle_05', 'cycle_01'], deck: filler(8), grave: ['cycle_05'] }
      });
      const c = byDef(g.players[0].hand, id);
      const def = DB.get(id);
      const choices = {};
      if (def.targets) {
        const cands = g.makeCtx(0, c).candidatesFor(def.targets).filter(function (t) { return t.uid !== c.uid; });
        ok(cands.length, id + ' has targets'); choices.targets = [cands[0].uid];
      }
      const r = await g.playCard(0, c.uid, { choices: choices });
      ok(r.ok, id + ' play failed: ' + r.reason);
      await g.endTurn(0);
      if (g.winner === null) await g.endTurn(1);
    }
  });

  // ---- targeted --------------------------------------------------------------
  test('書庫の小人 / 渦潮の番人: draw on summon / on death; guard', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_01', 'cycle_03'], mana: 5, deck: filler(5) }, p1: { board: ['cycle_01'] } });
    await play(g, 0, 'cycle_01'); eq(g.players[0].hand.length, 2);
    await play(g, 0, 'cycle_03'); eq(g.players[0].hand.length, 1);
    await g.makeCtx(0, null).destroy(byDef(g.players[0].board, 'cycle_03'));
    eq(g.players[0].hand.length, 3, '+2 on death');
    await g.endTurn(0);
    const g2 = await T.sandbox({ p0: { board: ['cycle_03', 'cycle_01'] }, p1: { board: ['cycle_01'] } });
    eq(g2.attackTargetsFor(1).length, 1, 'guard must be attacked first');
  });

  test('潮騒の人魚: returns a spell from grave', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_02'], grave: ['cycle_01', 'cycle_05'], mana: 5 } });
    await play(g, 0, 'cycle_02');
    ok(byDef(g.players[0].hand, 'cycle_05')); eq(g.players[0].grave.length, 1);
  });

  test('写本の精霊: look at top 3 and reorder (lastChooser reverses)', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_04'], mana: 1, deck: ['cycle_05', 'cycle_06', 'cycle_07', 'cycle_08'], chooser: T.lastChooser } });
    await play(g, 0, 'cycle_04');
    eq(g.players[0].deck.length, 4);
    eq(T.names(g.players[0].deck).join(','), 'cycle_07,cycle_06,cycle_05,cycle_08');
  });

  test('知識の泉水 / 潮の満ち引き / 溢れ出す記憶', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_05', 'cycle_06', 'cycle_17', 'cycle_01'], mana: 10, deck: filler(12) } });
    await play(g, 0, 'cycle_05'); eq(g.players[0].hand.length, 5);
    await play(g, 0, 'cycle_06'); eq(g.players[0].hand.length, 4, 'returned 4, drew 4');
    eq(g.players[0].deck.length, 10 + 4 - 4);
    const g2 = await T.sandbox({ p0: { hand: ['cycle_17', 'cycle_01'], mana: 3, deck: filler(12) } });
    await play(g2, 0, 'cycle_17'); eq(g2.players[0].hand.length, 7);
  });

  test('古文書の発掘 / 水鏡の占い', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_07'], grave: ['cycle_01', 'cycle_02', 'cycle_03'], mana: 1 } });
    await play(g, 0, 'cycle_07'); eq(g.players[0].hand.length, 2); eq(g.players[0].grave.length, 2);
    const g2 = await T.sandbox({ p0: { hand: ['cycle_08'], mana: 1, deck: ['cycle_01', 'cycle_02', 'cycle_03', 'cycle_04', 'cycle_05', 'cycle_06'] } });
    await play(g2, 0, 'cycle_08');
    eq(g2.players[0].hand.length, 1); eq(g2.players[0].hand[0].defId, 'cycle_01');
    eq(g2.players[0].grave.length, 5, '4 milled + 占い itself'); eq(g2.players[0].deck.length, 1);
  });

  test('泡沫の呪文: reprise from grave, then exiled', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_09'], mana: 0, deck: filler(3) } });
    await play(g, 0, 'cycle_09'); eq(g.players[0].hand.length, 1); eq(g.players[0].grave.length, 1);
    await play(g, 0, 'cycle_09'); eq(g.players[0].hand.length, 2); eq(g.players[0].exile.length, 1); eq(g.players[0].grave.length, 0);
  });

  test('忘却の波: at opponent turn start they put 2 hand cards on the bottom of deck', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_10'], mana: 5, deck: filler(3) }, p1: { hand: ['cycle_05', 'cycle_06', 'cycle_07'], deck: filler(4) } });
    await play(g, 0, 'cycle_10');
    await g.endTurn(0);
    eq(g.players[1].hand.length, 2, '3 - 2 + 1 draw');
    eq(g.players[1].deck.length, 5);
    eq(g.players[1].deck[4].defId, 'cycle_06'); eq(g.players[1].deck[3].defId, 'cycle_05');
  });

  test('深淵の問い: look & discard one', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_11'], mana: 1 }, p1: { hand: ['cycle_05', 'cycle_06'] } });
    await play(g, 0, 'cycle_11');
    eq(g.players[1].hand.length, 1); eq(g.players[1].grave.length, 1);
  });

  test('言霊の洪水: drawn×2 damage', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_05', 'cycle_12'], mana: 3, deck: filler(3) } });
    await play(g, 0, 'cycle_05'); await play(g, 0, 'cycle_12');
    eq(g.players[1].life, 36);
  });

  test('満ちる書架: draw at end of turn when hand ≤ 3', async function () {
    const g = await T.sandbox({ p0: { crests: ['cycle_13'], hand: ['cycle_01'], deck: filler(3) }, p1: { deck: filler(3) } });
    await g.endTurn(0); eq(g.players[0].hand.length, 2);
    const g2 = await T.sandbox({ p0: { crests: ['cycle_13'], hand: filler(4), deck: filler(3) }, p1: { deck: filler(3) } });
    await g2.endTurn(0); eq(g2.players[0].hand.length, 4);
  });

  test('大図書館の司書長: +1 mana per draw', async function () {
    const g = await T.sandbox({ p0: { board: ['cycle_14'], hand: ['cycle_05'], mana: 1, deck: filler(3) } });
    await play(g, 0, 'cycle_05'); eq(g.players[0].mana, 2);
  });

  test('流転の水竜: revives a grave monster (with its onSummon)', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_15'], grave: ['cycle_05', 'cycle_01'], mana: 6, deck: filler(3) } });
    await play(g, 0, 'cycle_15');
    eq(g.players[0].board.length, 2); ok(byDef(g.players[0].board, 'cycle_01'));
    eq(g.players[0].hand.length, 1, 'revived dwarf drew');
  });

  test('巻き戻しの泉: casts a grave spell for free, then exiles it', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_16'], grave: ['cycle_05'], mana: 2, deck: filler(3) } });
    await play(g, 0, 'cycle_16');
    eq(g.players[0].hand.length, 2); eq(g.players[0].exile.length, 1); eq(g.players[0].exile[0].defId, 'cycle_05');
    eq(g.players[0].grave.length, 1, 'only the fountain itself');
  });

  test('沈む書庫: draw when own spell goes to grave', async function () {
    const g = await T.sandbox({ p0: { crests: ['cycle_18'], hand: ['cycle_12'], mana: 1, deck: filler(3) } });
    await play(g, 0, 'cycle_12'); eq(g.players[0].hand.length, 1);
  });

  test('底なしの湖: both draw 2 at turn start; expand draws 2', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_19'], mana: 2, deck: filler(6) }, p1: { deck: filler(6) } });
    await play(g, 0, 'cycle_19'); eq(g.players[0].hand.length, 2);
    await g.endTurn(0); eq(g.players[1].hand.length, 2);
    await g.endTurn(1); eq(g.players[0].hand.length, 4);
  });

  test('逆巻く大海嘯: grave count damage, then grave → deck', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_20'], grave: filler(7), mana: 4, deck: [] } });
    await play(g, 0, 'cycle_20');
    eq(g.players[1].life, 33); eq(g.players[0].deck.length, 7); eq(g.players[0].grave.length, 1, 'the spell itself lands after');
  });

  test('永劫の書: spells return to hand instead of grave', async function () {
    const g = await T.sandbox({ p0: { crests: ['cycle_21'], hand: ['cycle_12'], mana: 1 } });
    await play(g, 0, 'cycle_12');
    ok(byDef(g.players[0].hand, 'cycle_12')); eq(g.players[0].grave.length, 0);
  });

  test('時を綴る大賢者 / 全知の雫', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_22'], grave: filler(6), mana: 5, deck: [] } });
    await play(g, 0, 'cycle_22');
    eq(g.players[0].hand.length, 5); eq(g.players[0].deck.length, 1); eq(g.players[0].grave.length, 0);
    const g2 = await T.sandbox({ p0: { hand: ['cycle_24'], mana: 3, deck: ['cycle_01', 'cycle_02', 'cycle_03', 'cycle_04'], chooser: T.lastChooser } });
    await play(g2, 0, 'cycle_24');
    eq(g2.players[0].hand.length, 3); eq(g2.players[0].deck.length, 1);
    eq(T.names(g2.players[0].hand).sort().join(','), 'cycle_02,cycle_03,cycle_04');
  });

  test('書喰らいの海魔: mills drawn×2', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_05', 'cycle_23'], mana: 9, deck: filler(3) }, p1: { deck: filler(6) } });
    await play(g, 0, 'cycle_05'); await play(g, 0, 'cycle_23');
    eq(g.players[1].deck.length, 2); eq(g.players[1].grave.length, 4);
  });

  test('終わりなき頁: grave cards are playable like hand (no exile after)', async function () {
    const g = await T.sandbox({ p0: { crests: ['cycle_25'], grave: ['cycle_05', 'cycle_01'], mana: 5, deck: filler(3) } });
    const pl = g.getPlayable(0);
    eq(pl.length, 2); ok(pl.every(function (x) { return x.from === 'grave'; }));
    await play(g, 0, 'cycle_05');
    eq(g.players[0].hand.length, 2); eq(g.players[0].exile.length, 0); eq(g.players[0].grave.length, 2, 'spell returns to grave');
    await play(g, 0, 'cycle_01'); eq(g.players[0].board.length, 1);
  });

  // ---- combos ----------------------------------------------------------------
  test('コンボ 永劫ループ: 永劫の書 + 火種 → infinite mana/draw, loop detected, 言霊の洪水 finisher', async function () {
    const g = await T.sandbox({ p0: { crests: ['cycle_21'], hand: ['accel_06', 'cycle_12'], mana: 0, deck: filler(40, 'cycle_01') }, p1: { life: 40 } });
    // each 火種 play: +1 mana, +1 card. The hand grows every pass so the structural loop detector stays quiet
    // (see the next test for the detected form); here we verify the engine itself and the finisher.
    for (let i = 0; i < 10; i++) await play(g, 0, 'accel_06');
    eq(g.players[0].mana, 10); eq(g.players[0].drawnThisTurn, 10);
    ok(byDef(g.players[0].hand, 'accel_06'), 'firebrand back in hand each time');
    await play(g, 0, 'cycle_12');
    eq(g.players[1].life, 20);
    ok(byDef(g.players[0].hand, 'cycle_12'), 'finisher also returns');
    for (let i = 0; i < 10; i++) await play(g, 0, 'accel_06');
    await play(g, 0, 'cycle_12');
    eq(g.winner, 0, 'drawn 20 → 40 dmg');
  });

  test('コンボ 永劫ループ (detected form): 永劫の書 + 魔力奔流 → loop detected, runLoop, 焦熱解放 X finisher', async function () {
    // 火種 grows the hand each pass so the structural hash differs and the detector stays quiet (correct: the state
    // is not cycling). 永劫の書 + 魔力奔流 leaves hand/grave identical each pass → detected as a 1-card loop.
    const g = await T.sandbox({ p0: { crests: ['cycle_21'], hand: ['accel_16', 'accel_09'], mana: 1 }, p1: { life: 300 } });
    const rec = T.record(g, ['loopDetected']);
    for (let i = 0; i < 3; i++) await play(g, 0, 'accel_16');
    eq(rec.count('loopDetected'), 1, 'single-card loop detected');
    eq(g.players[0].mana, 8);
    const res = await g.runLoop(0, 6);
    eq(res.iterations, 6); eq(g.players[0].mana, 512);
    await play(g, 0, 'accel_09', { x: 300 });
    eq(g.winner, 0);
  });

  test('コンボ 司書長で加速: 溢れ出す記憶 → mana per draw, 火喰い竜 cost 0', async function () {
    const g = await T.sandbox({ p0: { board: ['cycle_14'], hand: ['cycle_17', 'accel_14'], mana: 3, deck: filler(10) } });
    await play(g, 0, 'cycle_17');
    eq(g.players[0].hand.length, 7); eq(g.players[0].manaGainedThisTurn, 6); eq(g.players[0].mana, 6);
    eq(g.costOf(0, byDef(g.players[0].hand, 'accel_14')), 1);
    const g2 = await T.sandbox({ p0: { board: ['cycle_14'], hand: ['cycle_19', 'accel_14'], mana: 2, deck: filler(10) }, p1: { deck: filler(5) } });
    await play(g2, 0, 'cycle_19');
    eq(g2.players[0].mana, 2);
    await g2.endTurn(0); await g2.endTurn(1);
    eq(g2.players[0].manaGainedThisTurn, 2, 'drew 2 at turn start → +2');
  });

  test('コンボ 山札切れ勝ち: big draw turn, 書喰らいの海魔 mills the rest → opponent decks out at their draw', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_17', 'cycle_23'], mana: 11, deck: filler(10) }, p1: { deck: filler(8), life: 300 } });
    await play(g, 0, 'cycle_17'); // draw to 7 → drew 6
    await play(g, 0, 'cycle_23'); // mill 12 ≥ 8
    eq(g.players[1].deck.length, 0);
    eq(g.winner, null, 'not yet: deck-out happens on failed draw');
    await g.endTurn(0);
    eq(g.winner, 0); eq(g.winReason, 'deckout');
  });

  test('コンボ 墓地を溜めて流す: 水鏡の占い fills grave, 大海嘯 hits and recycles', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_08', 'cycle_08', 'cycle_20'], mana: 4, deck: filler(12) } });
    await play(g, 0, 'cycle_08'); await play(g, 0, 'cycle_08');
    eq(g.players[0].grave.length, 10);
    await play(g, 0, 'cycle_20');
    eq(g.players[1].life, 30); eq(g.players[0].deck.length, 12);
  });

  test('コンボ 不死鳥と水竜: 流転の水竜 revives a legend monster from grave (onSummon fires)', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_15'], grave: ['accel_24'], mana: 6 } });
    g.players[0].manaGainedThisTurn = 4;
    await play(g, 0, 'cycle_15');
    ok(byDef(g.players[0].board, 'accel_24'));
    eq(g.players[1].life, 36, 'revived 焔帝竜 onSummon dealt mana gained this turn');
  });
})(globalThis.G);
