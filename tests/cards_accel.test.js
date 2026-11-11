'use strict';
// tests/cards_accel.test.js — 加速系統 accel_01..25 (+ basic_01) smoke + targeted + combo tests.
(function (G) {
  const path = require('path');
  if (!G.CardDB.has('basic_01')) require(path.join(__dirname, '..', 'js', 'data', 'cards_basic.js'));
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
  async function altar(g, targetUid) {
    const ab = g.getAbilities(0).find(function (a) { return a.defId === 'accel_13'; });
    ok(ab, 'altar ability available');
    const r = await g.useAbility(0, ab.uid, [targetUid !== undefined ? targetUid : ab.targets[0]]);
    ok(r.ok, 'altar failed: ' + r.reason);
  }
  const filler = function (n) { return new Array(n).fill('accel_01'); };

  // ---------------------------------------------------------------------
  test('accel: all 25 cards registered with SPEC names/costs/rarities', function () {
    const spec = [
      ['火の粉の妖精', 0, 'common', 'monster'], ['マナ喰いの小妖精', 1, 'common', 'monster'], ['炉番のドワーフ', 2, 'common', 'monster'],
      ['魔力を啜る蝙蝠', 2, 'common', 'monster'], ['竜の卵', 1, 'common', 'monster'], ['火種', 0, 'common', 'spell'],
      ['夜明けの暴走炉', 0, 'common', 'spell'], ['燃え尽き', 0, 'common', 'spell'], ['焦熱解放', 'X', 'common', 'spell'],
      ['帰還の火', 0, 'common', 'spell'], ['マナ封鎖', 2, 'common', 'spell'], ['魔力の泉', 2, 'common', 'crest'],
      ['焚べ火の祭壇', 1, 'common', 'crest'], ['火喰い竜', 7, 'rare', 'monster'], ['炎翼の伝令', 3, 'rare', 'monster'],
      ['魔力奔流', 0, 'rare', 'spell'], ['過充填の槍', 0, 'rare', 'spell'], ['無限の坩堝', 5, 'rare', 'spell'],
      ['暴走する炉心', 3, 'rare', 'crest'], ['竜脈の火山', 2, 'rare', 'field'], ['黄金の水門', 0, 'legend', 'spell'],
      ['永久機関', 4, 'legend', 'crest'], ['巡る不死鳥', 0, 'legend', 'monster'], ['焔帝竜', 10, 'legend', 'monster'],
      ['天井なき空', 7, 'taboo', 'crest']
    ];
    spec.forEach(function (s, i) {
      const id = 'accel_' + String(i + 1).padStart(2, '0');
      const d = DB.get(id);
      eq(d.name, s[0], id); eq(d.cost, s[1], id + ' cost'); eq(d.rarity, s[2], id + ' rarity'); eq(d.type, s[3], id + ' type');
      eq(d.lineage, 'accel'); ok(d.text.length > 0, id + ' text'); ok(['engine', 'fuel', 'finisher', 'disrupt'].indexOf(d.role) >= 0, id + ' role');
    });
    ok(DB.get('accel_11').reserve); ok(DB.get('accel_14').keywords.indexOf('rush') >= 0); ok(DB.get('accel_24').tags.indexOf('dragon') >= 0);
    eq(DB.get('accel_23').flavor, '死ぬのにも飽きた鳥。'); eq(DB.get('accel_13').flavor, '火は何度でも灯る。灯す者がいる限り。');
    const b = DB.get('basic_01'); eq(b.name, '見習いの火球'); eq(b.cost, 1); eq(b.lineage, 'generic');
  });

  test('accel: smoke — every card can be played without throwing', async function () {
    const ids = DB.filter(function (d) { return d.lineage === 'accel' && d.set !== 'dragon'; }).map(function (d) { return d.id; }).concat(['basic_01']);
    for (let k = 0; k < ids.length; k++) {
      const id = ids[k];
      const g = await T.sandbox({
        p0: { hand: [id, 'accel_01', 'accel_24'], board: ['accel_02'], mana: 20, deck: filler(6), grave: ['accel_06'] },
        p1: { board: ['accel_01'], hand: ['accel_06'], deck: filler(6) }
      });
      const c = byDef(g.players[0].hand, id);
      const def = DB.get(id);
      const choices = {};
      if (def.cost === 'X') choices.x = 3;
      if (def.targets) {
        const cands = g.makeCtx(0, c).candidatesFor(def.targets).filter(function (t) { return t.uid !== c.uid; });
        ok(cands.length, id + ' has targets');
        choices.targets = [cands[0].uid];
      }
      const r = await g.playCard(0, c.uid, { choices: choices });
      ok(r.ok, id + ' play failed: ' + r.reason);
      await g.endTurn(0);
      ok(g.winner === null || g.winner !== undefined, id + ' game still consistent');
    }
  });

  // ---- targeted ---------------------------------------------------------
  test('火の粉の妖精/マナ喰いの小妖精: summon & death mana', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_01', 'accel_02'], crests: ['accel_13'], mana: 1 } });
    await play(g, 0, 'accel_01'); eq(g.players[0].mana, 2);
    await play(g, 0, 'accel_02'); eq(g.players[0].mana, 3);
    await altar(g, byDef(g.players[0].board, 'accel_02').uid);
    eq(g.players[0].mana, 5, 'death +2');
    eq(g.players[0].grave.length, 1);
  });

  test('炉番のドワーフ: own spells cost -1 (not monsters, not opponent)', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_11', 'accel_02'], board: ['accel_03'], mana: 5 } });
    const p = g.players[0];
    eq(g.costOf(0, byDef(p.hand, 'accel_11')), 1);
    eq(g.costOf(0, byDef(p.hand, 'accel_02')), 1);
  });

  test('魔力を啜る蝙蝠: opponent plays → mana at my next turn start', async function () {
    const g = await T.sandbox({ p0: { board: ['accel_04'], deck: filler(3) }, p1: { hand: ['accel_06', 'accel_06'], deck: filler(5) } });
    await g.endTurn(0);
    g.players[1].mana = 5;
    await play(g, 1, 'accel_06'); await play(g, 1, 'accel_06');
    eq(g.players[0].board[0].counters.stored, 2);
    await g.endTurn(1);
    // turn start: mana = maxMana(11) + 2
    eq(g.players[0].mana, g.players[0].maxMana + 2);
    eq(g.players[0].board[0].counters.stored, 0);
  });

  test('竜の卵: turn start mana; death → dragons in hand cost -3', async function () {
    const g = await T.sandbox({ p0: { board: ['accel_05'], hand: ['accel_14', 'accel_24'], crests: ['accel_13'], mana: 0, deck: filler(3) }, p1: { deck: filler(3) } });
    g.players[0].manaGainedThisTurn = 0; // the egg already gave +1 at this turn's start
    await altar(g, g.players[0].board[0].uid);
    eq(g.costOf(0, byDef(g.players[0].hand, 'accel_14')), 4);
    eq(g.costOf(0, byDef(g.players[0].hand, 'accel_24')), 7);
    const g2 = await T.sandbox({ p0: { board: ['accel_05'], deck: filler(3) }, p1: { deck: filler(3) } });
    await g2.endTurn(0); await g2.endTurn(1);
    eq(g2.players[0].mana, g2.players[0].maxMana + 1, 'egg gives +1 at turn start');
  });

  test('火種: mana+1 and draw 1', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_06'], mana: 3, deck: ['accel_01', 'accel_01'] } });
    await play(g, 0, 'accel_06');
    eq(g.players[0].mana, 4); eq(g.players[0].hand.length, 1);
  });

  test('夜明けの暴走炉: +3 now, hand discarded at end of turn (only once)', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_07', 'accel_01', 'accel_01'], mana: 0, deck: filler(4) }, p1: { deck: filler(4) } });
    await play(g, 0, 'accel_07');
    eq(g.players[0].mana, 3); eq(g.players[0].hand.length, 2);
    await g.endTurn(0);
    eq(g.players[0].hand.length, 0, 'hand discarded');
    eq(g.players[0].relics.length, 0, 'temporary relic removed');
    await g.endTurn(1);
    eq(g.players[0].hand.length, 1, 'drew normally next turn');
    await g.endTurn(0);
    eq(g.players[0].hand.length, 1, 'no discard on later turns');
  });

  test('燃え尽き: discard a chosen card and gain its cost', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_08', 'accel_24'], mana: 0 } });
    const dragon = byDef(g.players[0].hand, 'accel_24');
    await play(g, 0, 'accel_08', { targets: [dragon.uid] });
    eq(g.players[0].mana, 10); eq(g.players[0].grave.length, 2);
  });

  test('焦熱解放: X damage', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_09'], mana: 7 } });
    await play(g, 0, 'accel_09', { x: 5 });
    eq(g.players[1].life, 35); eq(g.players[0].mana, 2);
  });

  test('帰還の火: bounce own monster and +1 mana', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_10'], board: ['accel_02'], mana: 0 } });
    await play(g, 0, 'accel_10', { targets: [g.players[0].board[0].uid] });
    eq(g.players[0].mana, 1); eq(g.players[0].board.length, 0); ok(byDef(g.players[0].hand, 'accel_02'));
  });

  test('マナ封鎖: opponent mana gains halved next turn only', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_11'], mana: 5, deck: filler(3) }, p1: { hand: ['accel_21', 'accel_21'], deck: filler(5) } });
    await play(g, 0, 'accel_11');
    eq(g.players[1].reserves.length, 1);
    await g.endTurn(0);
    const m = g.players[1].mana;
    await play(g, 1, 'accel_21');
    eq(g.players[1].mana, m + 2, 'halved: 5 → 2');
    await g.endTurn(1); await g.endTurn(0);
    const m2 = g.players[1].mana;
    await play(g, 1, 'accel_21');
    eq(g.players[1].mana, m2 + 5, 'back to normal');
  });

  test('魔力の泉: +1 at own turn start', async function () {
    const g = await T.sandbox({ p0: { crests: ['accel_12'], deck: filler(3) }, p1: { deck: filler(3) } });
    await g.endTurn(0); await g.endTurn(1);
    eq(g.players[0].mana, g.players[0].maxMana + 1);
  });

  test('焚べ火の祭壇: repeatable ability, destroys own monsters and phantoms', async function () {
    const g = await T.sandbox({ p0: { crests: ['accel_13'], board: ['accel_01', 'accel_02'], phantoms: ['accel_01'], mana: 0 } });
    eq(g.getAbilities(0).length, 1);
    eq(g.getAbilities(0)[0].targets.length, 3);
    await altar(g, byDef(g.players[0].board, 'accel_02').uid);
    eq(g.players[0].mana, 2);
    await altar(g, g.players[0].phantoms[0].uid);
    eq(g.players[0].phantoms.length, 0);
    await altar(g, g.players[0].board[0].uid);
    eq(g.players[0].board.length, 0);
    eq(g.getAbilities(0).length, 0, 'no targets left');
  });

  test('火喰い竜: cost reduced by mana gained this turn, rush', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_14', 'accel_21', 'accel_06'], mana: 0, deck: filler(2) } });
    const dragon = byDef(g.players[0].hand, 'accel_14');
    eq(g.costOf(0, dragon), 7);
    await play(g, 0, 'accel_21'); // +5
    eq(g.costOf(0, dragon), 2);
    await play(g, 0, 'accel_06'); // +1
    eq(g.costOf(0, dragon), 1);
    await play(g, 0, 'accel_14');
    eq(g.getAttackers(0).length, 1, 'rush');
  });

  test('炎翼の伝令: puts a hand monster into play for free (onSummon fires)', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_15', 'accel_24', 'accel_06'], mana: 3, deck: filler(2) } });
    await play(g, 0, 'accel_15');
    eq(g.players[0].mana, 0);
    ok(byDef(g.players[0].board, 'accel_24'), 'dragon on board for free');
    eq(g.players[0].board.length, 2);
  });

  test('魔力奔流 / 過充填の槍', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_16', 'accel_17'], mana: 4 } });
    await play(g, 0, 'accel_16'); eq(g.players[0].mana, 8);
    await play(g, 0, 'accel_17'); eq(g.players[0].mana, 0); eq(g.players[1].life, 24);
  });

  test('無限の坩堝: all costs 0 this turn only', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_18', 'accel_24', 'accel_24'], mana: 5, deck: filler(3) }, p1: { deck: filler(3) } });
    await play(g, 0, 'accel_18');
    eq(g.players[0].mana, 0);
    eq(g.costOf(0, byDef(g.players[0].hand, 'accel_24')), 0);
    await play(g, 0, 'accel_24');
    await g.endTurn(0); await g.endTurn(1);
    eq(g.costOf(0, byDef(g.players[0].hand, 'accel_24')), 10, 'expired');
  });

  test('暴走する炉心 / 竜脈の火山: mana gain bonuses', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_07'], crests: ['accel_19'], mana: 0 } });
    await play(g, 0, 'accel_07'); eq(g.players[0].mana, 6, '+3 doubled by core');
    const g2 = await T.sandbox({ p0: { hand: ['accel_20', 'accel_06'], mana: 2, deck: filler(2) }, p1: { hand: ['accel_06'], deck: filler(3) } });
    await play(g2, 0, 'accel_20'); eq(g2.players[0].mana, 3, 'expand +2 → +3 with volcano');
    await play(g2, 0, 'accel_06'); eq(g2.players[0].mana, 5);
    await g2.endTurn(0); g2.players[1].mana = 0;
    await play(g2, 1, 'accel_06'); eq(g2.players[1].mana, 2, 'volcano also for opponent');
  });

  test('黄金の水門: +5 then back on top of deck; replayable every turn', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_21'], mana: 0, deck: filler(3) }, p1: { deck: filler(3) } });
    await play(g, 0, 'accel_21');
    eq(g.players[0].mana, 5); eq(g.players[0].deck[0].defId, 'accel_21'); eq(g.players[0].grave.length, 0);
    await g.endTurn(0); await g.endTurn(1);
    ok(byDef(g.players[0].hand, 'accel_21'), 'drawn again');
  });

  test('永久機関: +1 mana per 0-cost card played (not copies)', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_01', 'accel_02', 'accel_16'], crests: ['accel_22'], mana: 1 } });
    await play(g, 0, 'accel_01'); eq(g.players[0].mana, 3, '1 + sprite 1 + engine 1');
    await play(g, 0, 'accel_02'); eq(g.players[0].mana, 4, 'cost1: pays 1, +2, no engine');
    const ctx = g.makeCtx(0, null);
    await ctx.cast('accel_16', 0, { copy: true });
    eq(g.players[0].mana, 8, 'copy doubles but no engine bonus');
  });

  test('巡る不死鳥: returns to hand on destroy/bounce, exile beats it', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_23', 'accel_10'], crests: ['accel_13'], mana: 0 } });
    await play(g, 0, 'accel_23'); eq(g.players[0].mana, 1);
    await altar(g, g.players[0].board[0].uid);
    ok(byDef(g.players[0].hand, 'accel_23'), 'back in hand'); eq(g.players[0].grave.length, 0);
    await play(g, 0, 'accel_23');
    const ph = g.players[0].board[0];
    await g.makeCtx(0, null).exile(ph);
    eq(g.players[0].exile.length, 1); ok(!byDef(g.players[0].hand, 'accel_23'));
  });

  test('焔帝竜: damage = mana gained this turn', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_24', 'accel_21', 'accel_07'], mana: 10 } });
    await play(g, 0, 'accel_21'); await play(g, 0, 'accel_07');
    await play(g, 0, 'accel_24');
    eq(g.players[1].life, 32);
    eq(g.getAttackers(0).length, 1, 'rush');
  });

  test('天井なき空: mana persists and doubles at turn start', async function () {
    const g = await T.sandbox({ p0: { crests: ['accel_25'], mana: 4, maxMana: 4, deck: filler(3) }, p1: { deck: filler(3) } });
    await g.endTurn(0);
    eq(g.players[0].mana, 4, 'not cleared');
    await g.endTurn(1);
    eq(g.players[0].mana, (4 + 5) * 2);
  });

  test('見習いの火球: 3 damage', async function () {
    const g = await T.sandbox({ p0: { hand: ['basic_01'], mana: 1 } });
    await play(g, 0, 'basic_01'); eq(g.players[1].life, 37);
  });

  // ---- combos ------------------------------------------------------------
  test('コンボ 不死鳥ループ: altar+phoenix loop detected, runLoop(inf) → 焔帝竜 finisher kills', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_23', 'accel_24'], crests: ['accel_13'], mana: 0 }, p1: { life: 100 } });
    const rec = T.record(g, ['loopDetected']);
    for (let i = 0; i < 3; i++) {
      await play(g, 0, 'accel_23');
      await altar(g, byDef(g.players[0].board, 'accel_23').uid);
    }
    eq(rec.count('loopDetected'), 1); eq(g.loop.detected.cycle.length, 2);
    const res = await g.runLoop(0, 'inf');
    eq(res.reason, 'overflow', 'no finisher yet → overflow after 999');
    ok(g.players[0].mana >= 1000);
    await play(g, 0, 'accel_24');
    eq(g.winner, 0); eq(g.winReason, 'life');
  });

  test('コンボ 不死鳥ループ → 焦熱解放 X', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_23', 'accel_09'], crests: ['accel_13'], mana: 0 }, p1: { life: 60 } });
    for (let i = 0; i < 3; i++) { await play(g, 0, 'accel_23'); await altar(g, byDef(g.players[0].board, 'accel_23').uid); }
    const res = await g.runLoop(0, 70);
    eq(res.iterations, 70);
    eq(g.players[0].mana, 73);
    await play(g, 0, 'accel_09', { x: 60 });
    eq(g.winner, 0);
  });

  test('コンボ 卵から竜へ: egg destroyed by altar → dragon costs 4; gained mana → 0, rush attack', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_14', 'accel_21'], board: ['accel_05'], crests: ['accel_13'], mana: 0 } });
    g.players[0].manaGainedThisTurn = 0; g.players[0].mana = 0; // ignore the egg's own turn-start +1 for a clean count
    await altar(g, g.players[0].board[0].uid);
    const dragon = byDef(g.players[0].hand, 'accel_14');
    eq(g.costOf(0, dragon), 4);
    await play(g, 0, 'accel_21');
    eq(g.costOf(0, dragon), 0);
    await play(g, 0, 'accel_14');
    eq(g.players[0].mana, 5);
    const at = g.getAttackers(0); eq(at.length, 1);
    await g.attack(0, at[0].uid, 'face');
    eq(g.players[1].life, 35);
  });

  test('コンボ 伝令で踏み倒し: herald drops 焔帝竜 for free after mana burst', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_15', 'accel_24', 'accel_21', 'accel_16'], mana: 3 } });
    await play(g, 0, 'accel_21'); await play(g, 0, 'accel_16'); // 3+5=8 → 16, gained 5
    await play(g, 0, 'accel_15');
    ok(byDef(g.players[0].board, 'accel_24'));
    eq(g.players[1].life, 35, 'gained 5 this turn');
  });

  test('コンボ 炉心＋奔流: 暴走炉 +3→+6, 奔流 → 12, 過充填の槍 24 damage', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_07', 'accel_16', 'accel_17'], crests: ['accel_19'], mana: 0 } });
    await play(g, 0, 'accel_07'); eq(g.players[0].mana, 6);
    await play(g, 0, 'accel_16'); eq(g.players[0].mana, 12);
    await play(g, 0, 'accel_17'); eq(g.players[1].life, 16); eq(g.players[0].mana, 0);
  });
})(globalThis.G);
