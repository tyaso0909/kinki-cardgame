'use strict';
// tests/cards_workshop.test.js — カード工房で採用した41枚（2026-11-18）と、それに合わせて足したエンジンの仕組み。
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const DB = G.CardDB;

  function byDef(arr, id) { return arr.find(function (c) { return c.defId === id; }); }
  function countDef(arr, id) { return arr.filter(function (c) { return c.defId === id; }).length; }
  async function play(g, i, defId, choices) {
    const c = byDef(g.players[i].hand, defId);
    ok(c, 'card ' + defId + ' in hand');
    const r = await g.playCard(i, c.uid, { choices: choices || {} });
    ok(r.ok, 'play ' + defId + ' failed: ' + r.reason);
    return r;
  }
  if (!DB.has('tx_vanilla')) DB.register({ id: 'tx_vanilla', name: 'テスト用の兵士', type: 'monster', lineage: 'generic', role: 'fuel', rarity: 'common', cost: 1, atk: 2, hp: 3, text: '2/3', effects: {} });
  if (!DB.has('tx_big')) DB.register({ id: 'tx_big', name: 'テスト用の大男', type: 'monster', lineage: 'generic', role: 'fuel', rarity: 'common', cost: 6, atk: 6, hp: 6, text: '6/6', effects: {} });
  const filler = function (n, id) { return new Array(n).fill(id || 'basic_01'); };
  const mon = function (g, i, id) { return byDef(g.monstersOf(i), id); };
  // chooser that answers picks in order with fn(spec, cands) → array (falls back to the default)
  function scripted(fns) {
    let k = 0;
    return function (spec, cands, game) {
      const f = fns[k++];
      if (f) return f(spec, cands, game);
      return G.Engine.Game.defaultChooser(spec, cands, game);
    };
  }

  const IDS = ['accel_40', 'accel_41', 'accel_42', 'cycle_35', 'cycle_36', 'cycle_37', 'cycle_38', 'cycle_39', 'cycle_40', 'cycle_41', 'cycle_42',
    'copy_36', 'copy_37', 'copy_38', 'copy_39', 'copy_40', 'copy_41', 'copy_42', 'copy_43', 'copy_44',
    'chain_36', 'chain_37', 'chain_38', 'chain_39', 'chain_40', 'chain_41', 'chain_42',
    'time_36', 'time_37', 'time_38', 'time_39', 'time_40', 'time_41', 'time_42',
    'doom_38', 'doom_39', 'doom_40', 'doom_41', 'doom_42', 'doom_43', 'gen_49'];

  test('workshop: 41 cards registered, in the pool, valid; the 大魔導士 helper stays hidden', function () {
    eq(IDS.length, 41);
    IDS.forEach(function (id) { ok(DB.has(id), id); ok(G.Data.isProjectCard(DB.get(id)), id + ' project id'); ok(DB.pool().indexOf(DB.get(id)) >= 0, id + ' in pool'); });
    ok(DB.has('time_tok01') && !G.Data.isProjectCard(DB.get('time_tok01')) && DB.pool().indexOf(DB.get('time_tok01')) < 0, 'helper hidden');
    const v = G.Data.validateAll(); ok(v.ok, v.errors.join(' / '));
    const count = function (lin) { return G.Data.cardsByLineage(lin).length; };
    eq(count('accel'), 42); eq(count('cycle'), 42); eq(count('chain'), 42); eq(count('time'), 42); eq(count('copy'), 44); eq(count('generic'), 50);
  });

  // ---------------------------------------------------------------- engine: onSelfToGrave
  test('墓地に送られた時: discard / mill / destroy all fire; 屍竜 only from hand or deck', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_41', 'cycle_38'], board: ['doom_43'], deck: ['basic_01', 'chain_37'].concat(filler(5)), mana: 3 }, p1: { deck: filler(5) } });
    const c = g.makeCtx(0, null);
    await c.discard([byDef(g.players[0].hand, 'accel_41')]);
    eq(g.players[0].mana, 5, '灰被りの火蜥蜴: マナ+2');
    const hand0 = g.players[0].hand.length;
    await c.discard([byDef(g.players[0].hand, 'cycle_38')]);
    eq(g.players[0].hand.length, hand0 - 1 + 1, '沈没船の亡霊: 1枚引く');
    const chain0 = g.players[0].chain;
    await c.mill(1, 0);
    eq(g.players[0].chain, chain0 + 2, '雷鳴の残響: 連鎖+2'); eq(g.players[1].life, 39, '…and 1 damage');
    await c.destroy(mon(g, 0, 'doom_43'));
    ok(byDef(g.players[0].grave, 'doom_43'), '屍竜 destroyed on the board stays in the grave');
  });

  test('墓より這い出る屍竜: discarded or milled → comes out; 大いなる弔い picks another monster', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_43', 'gen_49'], deck: ['basic_01', 'doom_43', 'tx_vanilla', 'basic_01', 'basic_01', 'basic_01'], mana: 10 }, p1: { deck: filler(5) } });
    await g.makeCtx(0, null).discard([byDef(g.players[0].hand, 'doom_43')]);
    eq(countDef(g.players[0].board, 'doom_43'), 1, 'discarded 屍竜 is on the board');
    await play(g, 0, 'gen_49');
    eq(countDef(g.players[0].board, 'doom_43'), 2, 'milled 屍竜 came out by itself');
    ok(mon(g, 0, 'tx_vanilla'), '大いなる弔い put the other milled monster out');
  });

  // ---------------------------------------------------------------- accel
  test('深紅のサムライ: X cost, X damage to an enemy monster (or the opponent)', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_40', 'accel_40'], mana: 10 }, p1: { board: ['tx_big'], deck: filler(5) } });
    await play(g, 0, 'accel_40', { x: 4 });
    eq(g.players[0].mana, 6);
    eq(g.hpOf(mon(g, 1, 'tx_big')), 2, '4 damage to the only enemy monster (default chooser)');
    const g2 = await T.sandbox({ p0: { hand: ['accel_40'], mana: 5 }, p1: { deck: filler(5) } });
    await play(g2, 0, 'accel_40', { x: 5 });
    eq(g2.players[1].life, 35, 'no enemy monster → the opponent takes X');
    ok(g2.hasKeyword(mon(g2, 0, 'accel_40'), 'charge'));
  });

  test('瞬足の豪槍エール: when destroyed, destroys an enemy monster', async function () {
    const g = await T.sandbox({ p0: { board: ['accel_42'] }, p1: { board: ['tx_big'], deck: filler(5) } });
    await g.makeCtx(1, null).destroy(mon(g, 0, 'accel_42'));
    eq(g.players[1].board.length, 0);
  });

  // ---------------------------------------------------------------- cycle
  test('循環する水流: discard any number, draw that +1', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_35', 'basic_01', 'basic_01', 'tx_vanilla'], deck: filler(8, 'tx_big'),
      chooser: scripted([function (s, cands) { return cands.slice(0, 2); }]) }, p1: { deck: filler(5) } });
    await play(g, 0, 'cycle_35');
    eq(g.players[0].grave.length, 3, '2 discarded + the spell'); eq(g.players[0].hand.length, 1 + 3);
  });

  test('波間の選別: draw 3, then 2 hand cards go back on top in the chosen order', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_36', 'tx_vanilla', 'tx_big'], deck: ['basic_01', 'basic_01', 'basic_01', 'cycle_38'],
      chooser: scripted([function (s, cands) { return [byDef(cands, 'tx_big'), byDef(cands, 'tx_vanilla')]; }]) }, p1: { deck: filler(5) } });
    await play(g, 0, 'cycle_36');
    eq(g.players[0].hand.length, 2 + 3 - 2);
    eq(g.players[0].deck[0].defId, 'tx_big', 'first chosen = top'); eq(g.players[0].deck[1].defId, 'tx_vanilla');
  });

  test('潮目の紋章: at turn start, mill any of the top 2 and order the rest', async function () {
    const g = await T.sandbox({ p0: { crests: ['cycle_37'], deck: ['basic_01', 'doom_43', 'tx_vanilla', 'basic_01', 'basic_01'], // turn draw takes the first
      chooser: scripted([function (s, cands) { return [byDef(cands, 'doom_43')]; }]) }, p1: { deck: filler(5) }, first: 1 });
    await g.endTurn(1);
    ok(mon(g, 0, 'doom_43'), 'milled 屍竜 came out');
  });

  test('深海の語り部 (random 1 per draw, 5/turn) / 深海の書王 (2 per draw) / 書庫番の大梟 (draw per hand→grave, 3/turn)', async function () {
    const g = await T.sandbox({ p0: { board: ['cycle_39', 'cycle_42'], deck: filler(10) }, p1: { board: [{ id: 'tx_big', hp: 20 }], deck: filler(5) } });
    const c = g.makeCtx(0, null);
    await c.draw(7);
    eq(g.players[1].life, 40 - 14, '書王: 2 per draw');
    eq(mon(g, 1, 'tx_big').damage, 5, '語り部: 5 per turn');
    const g2 = await T.sandbox({ p0: { board: ['cycle_40'], hand: filler(5), deck: filler(10, 'tx_vanilla') }, p1: { deck: filler(5) } });
    await g2.makeCtx(0, null).discard(g2.players[0].hand.slice(0, 4));
    eq(g2.players[0].hand.length, 1 + 3, '大梟: 3 draws max');
  });

  test('守護竜アーケン: free cost≤5 dragon from hand; my dragons get 守護 (and attackers must hit them)', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_41', 'copy_43', 'chain_42'], board: ['tx_vanilla'], mana: 5 }, p1: { board: [{ id: 'tx_big', summonedTurn: -1 }], deck: filler(5) } });
    await play(g, 0, 'cycle_41');
    const knight = mon(g, 0, 'copy_43');
    ok(knight, '霧纏いの竜騎 came out for free'); eq(g.players[0].mana, 0);
    ok(byDef(g.players[0].hand, 'chain_42'), 'cost 7 dragon stays in hand');
    ok(g.hasKeyword(knight, 'guard'), 'dragons have 守護');
    const targets = g.attackTargetsFor(1);
    ok(targets.indexOf(knight.uid) >= 0 && targets.indexOf('face') < 0 && targets.indexOf(mon(g, 0, 'tx_vanilla').uid) < 0, 'guards only');
  });

  // ---------------------------------------------------------------- copy
  test('影送り needs 2 phantoms; consumed phantoms fire 霧散の書 (2/turn) and 鏡の魔術師', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_36', 'copy_36'], crests: ['copy_41'], board: ['copy_42'], phantoms: ['tx_vanilla', 'tx_vanilla', 'tx_vanilla'], deck: filler(12) }, p1: { deck: filler(5) } });
    const h0 = g.players[0].hand.length;
    await play(g, 0, 'copy_36');
    eq(g.players[0].phantoms.length, 1);
    eq(g.players[0].hand.length, h0 - 1 + 3 + 2, '3 + 霧散の書 2');
    eq(g.atkOf(mon(g, 0, 'copy_42')), 5, '鏡の魔術師 +1/+1 twice');
    const second = byDef(g.players[0].hand, 'copy_36');
    eq(g.canPlayCard(0, second).reason, 'canPlay', 'only 1 phantom left');
  });

  test('phantoms vanishing at the end of the opponent turn count as 消える', async function () {
    const g = await T.sandbox({ p0: { crests: ['copy_41'], deck: filler(8) }, p1: { deck: filler(5) } });
    await g.makeCtx(0, null).createPhantom('tx_vanilla', 0, { count: 3 });
    const h0 = g.players[0].hand.length;
    await g.endTurn(0); // my phantoms stay through the opponent's turn
    eq(g.players[0].phantoms.length, 3);
    await g.endTurn(1); // …and vanish at its end: 霧散の書 draws 2 (cap), then my turn draws 1
    eq(g.players[0].phantoms.length, 0);
    eq(g.players[0].hand.length, h0 + 2 + 1);
  });

  test('破壊錬金術 (copy then destroy) / 鏡砕き (phantom atk to all enemies) / 進軍する幻 (phantoms rush this turn)', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_37', 'copy_40', 'copy_38'], mana: 10 }, p1: { board: ['tx_big', 'tx_vanilla'], deck: filler(5) } });
    const big = mon(g, 1, 'tx_big');
    await g.makeCtx(1, big).buff(big, { atk: 2, hp: 2 });
    await play(g, 0, 'copy_37', { targets: [big.uid] });
    ok(!g.isInPlay(big), 'destroyed');
    const ph = g.players[0].phantoms[0];
    ok(ph && ph.defId === 'tx_big' && g.atkOf(ph) === 8, 'phantom keeps the buff');
    ok(!g.canAttackWith(0, ph), 'fresh phantom cannot attack yet');
    await play(g, 0, 'copy_38');
    ok(g.canAttackWith(0, ph), '進軍する幻: rush');
    await play(g, 0, 'copy_40');
    eq(g.players[0].phantoms.length, 0, 'phantom consumed');
    eq(g.players[1].board.length, 0, '8 damage to every enemy monster');
    await g.endTurn(0);
    eq(g.status(0, 'phantomRush'), false, 'only this turn');
  });

  test('骨の操り人形 (2 phantoms on grave) / 霧纏いの竜騎 (1 per phantom) / 幻影喰らい (+2/+2 each)', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_39', 'copy_43', 'copy_44'], mana: 20 }, p1: { deck: filler(5) } });
    await play(g, 0, 'copy_43');
    // 竜騎 makes its own phantom: the card and its phantom both ping
    eq(g.players[1].life, 38);
    await g.makeCtx(0, null).discard([byDef(g.players[0].hand, 'copy_39')]);
    eq(g.players[0].phantoms.length, 3);
    eq(g.players[1].life, 38 - 2 * 2, '2 more phantoms × (竜騎 + its phantom)');
    await play(g, 0, 'copy_44');
    eq(g.players[0].phantoms.length, 0);
    eq(g.atkOf(mon(g, 0, 'copy_44')), 3 + 6);
  });

  // ---------------------------------------------------------------- chain
  test('線香花火 / 火花散らし: 火花 朧 to hand', async function () {
    const g = await T.sandbox({ p0: { hand: ['chain_36'], crests: ['chain_38'], deck: filler(5) }, p1: { deck: filler(5) }, first: 1 });
    await g.endTurn(1);
    eq(g.players[0].hand.filter(function (c) { return c.defId === 'chain_05' && c.oboro; }).length, 1, 'crest at turn start');
    await play(g, 0, 'chain_36');
    eq(countDef(g.players[0].hand, 'chain_05'), 3);
  });

  test('ライジン: chain halves instead of resetting and carries into my next turn', async function () {
    const g = await T.sandbox({ p0: { board: ['chain_40', 'chain_39'], chain: 9, deck: filler(5) }, p1: { deck: filler(5) } });
    const statue = mon(g, 0, 'chain_39');
    await g.endTurn(0);
    eq(g.players[0].chain, 4);
    eq(g.maxHpOf(statue), 4 + 9, '帯電する結界像: HP + chain (measured before the reset)');
    await g.endTurn(1);
    eq(g.maxHpOf(statue), 4, 'buff gone by my turn');
    eq(g.players[0].chain, 4, 'carried into my turn');
  });

  test('雷を纏う一角獣 (+chain/+chain) / 鎖竜ボルト (cost −chain, 1 per card)', async function () {
    const g = await T.sandbox({ p0: { hand: ['chain_41', 'chain_42', 'basic_01'], chain: 4, mana: 20 }, p1: { deck: filler(5) } });
    await play(g, 0, 'chain_41');
    eq(g.atkOf(mon(g, 0, 'chain_41')), 5, 'chain 5 after playing it');
    eq(g.costOf(0, byDef(g.players[0].hand, 'chain_42')), 2);
    await play(g, 0, 'chain_42');
    const life = g.players[1].life;
    await play(g, 0, 'basic_01');
    ok(g.players[1].life <= life - 1, 'ボルト pings');
  });

  // ---------------------------------------------------------------- time
  test('投資の指南書 (時限4 max mana +5) / 未来への契約 (choose at fire time)', async function () {
    const g = await T.sandbox({ p0: { timed: [{ id: 'time_36', count: 1 }, { id: 'time_37', count: 1 }], deck: filler(5) }, p1: { board: ['tx_big'], deck: filler(5) }, first: 1 });
    const max0 = g.players[0].maxMana;
    await g.endTurn(1);
    eq(g.players[0].maxMana, max0 + 1 + 5);
    eq(g.players[1].board.length, 0, 'contract destroyed the monster');
  });

  test('時をかける女戦士: exiled at my turn end, its 朧 returns with rush at my next turn start', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_38'], mana: 3, deck: filler(5) }, p1: { deck: filler(5) } });
    await play(g, 0, 'time_38');
    await g.endTurn(0);
    ok(byDef(g.players[0].exile, 'time_38'), 'exiled'); eq(g.players[0].board.length, 0);
    await g.endTurn(1);
    const w = mon(g, 0, 'time_38');
    ok(w && w.oboro, '朧 is back'); ok(g.canAttackWith(0, w), 'rush');
    await g.endTurn(0); await g.endTurn(1);
    ok(mon(g, 0, 'time_38'), 'keeps coming back');
  });

  test('遅れて届く遺言: to grave → 時限2 → back on the board, again and again', async function () {
    const g = await T.sandbox({ p0: { board: ['time_39'], deck: filler(8) }, p1: { deck: filler(8) } });
    await g.makeCtx(1, null).destroy(mon(g, 0, 'time_39'));
    const t = byDef(g.players[0].timed, 'time_39');
    ok(t && t.timedCount === 2, 'in the timed zone');
    await g.endTurn(0); await g.endTurn(1);
    ok(byDef(g.players[0].timed, 'time_39'), 'count 1');
    await g.endTurn(0); await g.endTurn(1);
    ok(mon(g, 0, 'time_39'), 'back');
    await g.makeCtx(1, null).destroy(mon(g, 0, 'time_39'));
    ok(byDef(g.players[0].timed, 'time_39'), 'and it waits again');
  });

  test('年老いた大魔導士: 5 ×2 per turn, re-placed per firing (1→2→4); 時告げの鐘撞き counts every firing', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_42'], board: ['time_40'], mana: 7, deck: filler(10) }, p1: { life: 200, deck: filler(10) } });
    await play(g, 0, 'time_42');
    eq(countDef(g.players[0].timed, 'time_tok01'), 1);
    await g.endTurn(0); await g.endTurn(1);
    eq(g.players[1].life, 200 - (10 + 4), '1 timer × 2 (5) + bell 2 × 2');
    eq(countDef(g.players[0].timed, 'time_tok01'), 2);
    await g.endTurn(0); await g.endTurn(1);
    eq(g.players[1].life, 200 - 14 - 28);
    eq(countDef(g.players[0].timed, 'time_tok01'), 4);
    ok(!g.players[0].grave.some(function (c) { return c.defId === 'time_tok01'; }), 'the timed spell never goes to the grave');
  });

  test('時戻しの機械人形: mana +4', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_41'], mana: 4 }, p1: { deck: filler(5) } });
    await play(g, 0, 'time_41');
    eq(g.players[0].mana, 4);
  });

  // ---------------------------------------------------------------- doom
  test('冥府の渡し賃: curse = printed cost (∞ / X → 0)', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_38', 'tx_big'], mana: 1 }, p1: { deck: filler(5) } });
    await play(g, 0, 'doom_38');
    eq(g.players[1].curse, 6);
    const g2 = await T.sandbox({ p0: { hand: ['doom_38', 'cycle_34'], mana: 1 }, p1: { deck: filler(5) } });
    await play(g2, 0, 'doom_38');
    eq(g2.players[1].curse, 0, '禁忌の竜 counts as 0');
  });

  test('枯れない花の戦士: grave ability (mill 1, back to the board), once per turn; 封じの番兵 stops it', async function () {
    const g = await T.sandbox({ p0: { grave: ['doom_39'], deck: filler(5) }, p1: { deck: filler(5) } });
    const card = byDef(g.players[0].grave, 'doom_39');
    ok(g.getAbilities(0).some(function (a) { return a.uid === card.uid; }), 'offered from the grave');
    const r = await g.useAbility(0, card.uid, []);
    ok(r.ok, r.reason);
    ok(mon(g, 0, 'doom_39'), 'on the board'); eq(g.players[0].deck.length, 4); eq(g.players[0].grave.length, 1);
    await g.makeCtx(1, null).destroy(mon(g, 0, 'doom_39'));
    ok(!g.getAbilities(0).some(function (a) { return a.uid === card.uid; }), 'once per turn');
    const g2 = await T.sandbox({ p0: { grave: ['doom_39'], deck: filler(5) }, p1: { board: ['gen_01'], deck: filler(5) } });
    eq(g2.getAbilities(0).length, 0, '封じの番兵');
  });

  test('骸を喰らう大蛇: +1/+1 for every card to any grave (used spells too)', async function () {
    const g = await T.sandbox({ p0: { board: ['doom_40'], hand: ['basic_01'], mana: 5, deck: filler(5) }, p1: { deck: filler(5) } });
    await play(g, 0, 'basic_01');
    await g.makeCtx(0, null).mill(2, 1);
    eq(g.atkOf(mon(g, 0, 'doom_40')), 3 + 3);
  });

  test('魂の狂宴: revive up to the free slots, with summon effects', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_41'], board: ['tx_vanilla', 'tx_vanilla'], grave: ['time_41', 'tx_big', 'tx_vanilla', 'tx_vanilla'], mana: 6, deck: filler(5),
      chooser: scripted([function (s, cands) { return cands.slice(0, s.count); }]) }, p1: { deck: filler(5) } });
    await play(g, 0, 'doom_41');
    eq(g.players[0].board.length, 5);
    eq(g.players[0].mana, 4, '時戻しの機械人形 fired (mana +4)');
  });

  test('スケルトンキング: fills the board with 骸骨兵 朧, all my monsters have 突進, curse 3 when destroyed', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_42'], board: ['tx_vanilla'], mana: 7, deck: filler(5) }, p1: { board: ['tx_vanilla'], deck: filler(5) } });
    await play(g, 0, 'doom_42');
    eq(g.players[0].board.length, 5);
    const sk = g.players[0].board.filter(function (m) { return m.defId === 'doom_01'; });
    eq(sk.length, 3); ok(sk.every(function (m) { return m.oboro; }));
    ok(sk.every(function (m) { return g.canAttackWith(0, m); }), '突進 granted');
    ok(g.attackTargetsOf(0, sk[0]).indexOf('face') < 0, '突進: monsters only');
    await g.makeCtx(1, null).destroy(mon(g, 0, 'doom_42'));
    eq(g.players[1].curse, 3);
    ok(!g.canAttackWith(0, sk[0]), 'the aura is gone with the king');
  });

  // ---------------------------------------------------------------- AI smoke
  test('AI plays a game with workshop cards without errors', async function () {
    const deck0 = ['copy_36', 'copy_39', 'copy_43', 'copy_44', 'copy_40', 'doom_39', 'doom_43', 'cycle_35', 'time_42', 'chain_36', 'accel_40', 'gen_49', 'doom_41', 'cycle_37', 'time_38', 'time_39'];
    const deck1 = ['doom_38', 'doom_42', 'doom_40', 'cycle_41', 'chain_42', 'chain_40', 'chain_39', 'time_37', 'time_36', 'copy_37', 'copy_38', 'cycle_36', 'cycle_39', 'cycle_42', 'accel_42', 'accel_41'];
    const g = new G.Engine.Game({ seed: 7, players: [
      { name: 'A', deck: deck0.concat(deck0), life: 40, isAI: true, chooser: G.AI.makeChooser('assemble') },
      { name: 'B', deck: deck1.concat(deck1), life: 40, isAI: true, chooser: G.AI.makeChooser('speed') }], options: { initialHand: 4 } });
    await g.start();
    for (let i = 0; i < 40 && g.winner === null; i++) await G.AI.takeTurn(g, g.active);
    ok(g.turn > 2, 'played some turns');
  });
})(globalThis.G);
