'use strict';
// tests/enemy_dragon.test.js — 竜のエリート3体（切り札・遺物）、敵デッキの使用禁止カード、AIのデッキ切れ回避（2026-11）。
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const DB = G.CardDB;
  const byDef = function (arr, id) { return arr.find(function (c) { return c.defId === id; }); };
  const filler = function (n, id) { return new Array(n).fill(id || 'basic_01'); };
  const id = function (name) { return G.AI.cardId(name); };

  // 敵に持たせないカード（企画書「敵には入れないカード」）
  const FORBIDDEN = ['不可侵の巨神', '終末の獣', '縮小の呪文', '巨人化の秘薬', '竜狩りの大弩', '重力の谷'];

  test('竜のエリート: 各幕1体、20枚、切り札1・遺物1、禁忌の竜を持たない', function () {
    const list = ['elite_flute_maiden', 'elite_mirror_dragoon', 'elite_dragon_tomb'].map(function (k) { return G.EnemyDB.get(k); });
    eq(list.map(function (e) { return e.act; }).join(), '1,2,3');
    list.forEach(function (e) {
      eq(e.tier, 'elite'); eq(e.deck.length, 20, e.name);
      eq(e.relics.length, 1, e.name + ' relic'); eq(e.trumps.length, 1);
      ok(e.deck.indexOf(id(e.trumps[0])) >= 0, e.name + ' has its trump');
      const dragons = e.deck.filter(function (d) { return DB.get(d).tags.indexOf('dragon') >= 0; }).length;
      ok(dragons >= 7, e.name + ' is dragon-based: ' + dragons);
    });
  });

  test('敵デッキ: 禁忌の竜・使えないカード・敵に持たせないカードを含まない', function () {
    G.EnemyDB.all().forEach(function (e) {
      if (e.deckBuilder) return;
      e.deck.forEach(function (d) {
        const def = DB.get(d);
        ok(!def.uncastable && def.rarity !== 'taboo', e.name + ': ' + def.name);
        ok(FORBIDDEN.indexOf(def.name) < 0, e.name + ' must not use ' + def.name);
      });
    });
    // 名もなき挑戦者 (random) never gets a 禁忌 card either
    for (let s = 1; s <= 20; s++) {
      const cfg = G.AI.enemyPlayerConfig('enemy_nameless_challenger', { seed: s });
      ok(cfg.deck.every(function (d) { return DB.get(d).rarity !== 'taboo'; }), 'seed ' + s);
    }
  });

  test('竜笛: 山札から竜を2枚手札に加え、手札の竜すべてのコスト-1', async function () {
    const g = await T.sandbox({ p0: { hand: ['elite7_01', 'accel_36'], deck: ['basic_01', 'accel_38', 'basic_01', 'cycle_31'], mana: 10 } });
    const c = byDef(g.players[0].hand, 'elite7_01');
    ok((await g.playCard(0, c.uid, {})).ok);
    const hand = g.players[0].hand;
    ok(byDef(hand, 'accel_38') && byDef(hand, 'cycle_31'), 'two dragons tutored');
    eq(g.costOf(0, byDef(hand, 'accel_38')), 8, '原初の焔竜 9 → 8');
    eq(g.costOf(0, byDef(hand, 'accel_36')), 1, '炎竜の幼体 2 → 1');
  });

  test('竜騎士の号令: 自分の竜すべて（幻影を含む）に+2/+2と速攻', async function () {
    const g = await T.sandbox({ p0: { hand: ['elite8_01'], board: ['copy_32', 'chain_32'], phantoms: ['copy_32'], mana: 10, deck: filler(5) } });
    const c = byDef(g.players[0].hand, 'elite8_01');
    ok((await g.playCard(0, c.uid, {})).ok);
    g.monstersOf(0).forEach(function (m) {
      eq(g.atkOf(m), 3, DB.get(m.defId).name + ' atk'); ok(g.hasKeyword(m, 'rush'), 'rush');
    });
  });

  test('竜墓の鐘: 自分の竜が破壊されるたび相手に呪詛2（竜以外は数えない）', async function () {
    const g = await T.sandbox({ p0: { crests: ['elite9_01'], board: ['doom_33', 'doom_01'], deck: filler(5) } });
    const ctx = g.makeCtx(1, null);
    await ctx.destroy(byDef(g.players[0].board, 'doom_01'));
    eq(g.players[1].curse, 1, '骸骨兵 (not a dragon) only curses by itself');
    await ctx.destroy(byDef(g.players[0].board, 'doom_33'));
    eq(g.players[1].curse, 3, 'dragon destroyed → +2');
  });

  test('竜騎士の兜: 竜を出すたび連鎖数+1（幻影も）／竜骨の数珠: 墓地に竜がいればターン開始時に呪詛1', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_32'], relics: ['relic_dragoon_helm'], mana: 10, deck: filler(5) } });
    const c = byDef(g.players[0].hand, 'copy_32');
    const before = g.chainOf(g.players[0]);
    ok((await g.playCard(0, c.uid, {})).ok);
    eq(g.chainOf(g.players[0]) - before, 1 + 1 + 2, 'card played (+1) + dragon (+1) + 2 dragon phantoms (+2)');

    const g2 = await T.sandbox({ p1: { relics: ['relic_dragonbone_beads'], grave: ['doom_33'], deck: filler(5) }, p0: { deck: filler(5) } });
    await g2.endTurn(0);
    eq(g2.players[0].curse, 1, 'curse at P1 turn start');
    const g3 = await T.sandbox({ p1: { relics: ['relic_dragonbone_beads'], grave: ['doom_01'], deck: filler(5) }, p0: { deck: filler(5) } });
    await g3.endTurn(0);
    eq(g3.players[0].curse, 0, 'no dragon in grave → nothing');
  });

  test('AI: 引くカードで自分の山札を空にしない', async function () {
    // 泡沫の呪文 (0 cost, draw 1, 再演) ×4 in hand, only 2 cards left in the deck
    const g = await T.sandbox({ first: 1, p1: { hand: ['cycle_09', 'cycle_09', 'cycle_09', 'cycle_09'], deck: filler(2, 'gen_01'), mana: 5 }, p0: { deck: filler(10) } });
    await G.AI.takeTurn(g, 1);
    ok(g.players[1].deck.length >= 1, 'deck left: ' + g.players[1].deck.length);
    ok(!g.players[1].deckedOut);
  });
})(globalThis.G = globalThis.G || {});
