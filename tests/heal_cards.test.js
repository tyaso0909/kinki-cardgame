'use strict';
// tests/heal_cards.test.js — 吸命 (lifesteal) / 血吸いの騎士 / 再生の秘術 (2026-11).
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const F = function (n) { return new Array(n).fill('basic_01'); };
  const byDef = function (arr, id) { return arr.find(function (c) { return c.defId === id; }); };

  test('血吸いの騎士: 顔を殴ると与えたダメージ分ライフが回復する（最大ライフは超えない）', async function () {
    const g = await T.sandbox({ p0: { board: ['gen_47'], deck: F(5) }, p1: { deck: F(5) } });
    g.players[0].life = 20; g.players[0].maxLife = 40;
    const k = byDef(g.players[0].board, 'gen_47'); k.summonedTurn = -1; k.attacksLeft = 1;
    ok((await g.attack(0, k.uid, 'face')).ok);
    eq(g.players[1].life, 37); eq(g.players[0].life, 23);
    g.players[0].life = 39; k.attacksLeft = 1;
    await g.attack(0, k.uid, 'face');
    eq(g.players[0].life, 40, 'capped at max life');
  });

  test('吸命: モンスター同士の戦闘でも、反撃でも回復する', async function () {
    const g = await T.sandbox({ p0: { board: ['gen_47'], deck: F(5) }, p1: { board: ['doom_01'], deck: F(5) } });
    g.players[0].life = 30; g.players[0].maxLife = 40;
    const k = byDef(g.players[0].board, 'gen_47'); k.summonedTurn = -1; k.attacksLeft = 1;
    const sk = byDef(g.players[1].board, 'doom_01');
    ok((await g.attack(0, k.uid, sk.uid)).ok);
    eq(g.players[0].life, 33, '与えたダメージ3（倒しきった余りも含む）→ +3');
    // as a defender: the enemy attacks the knight, the knight's counter-damage heals too
    const g2 = await T.sandbox({ p0: { board: ['gen_47'], deck: F(5) }, p1: { board: ['doom_01'], deck: F(5) }, first: 1 });
    g2.players[0].life = 30; g2.players[0].maxLife = 40;
    const atk = g2.players[1].board[0]; atk.summonedTurn = -1; atk.attacksLeft = 1;
    const k2 = byDef(g2.players[0].board, 'gen_47');
    await g2.attack(1, atk.uid, k2.uid);
    ok(g2.players[0].life > 30, 'counter-damage heals: ' + g2.players[0].life);
  });

  test('再生の秘術: 失ったライフの半分（切り捨て）を回復、満タンなら何もしない', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_48', 'gen_48'], mana: 10, deck: F(5) }, p1: { deck: F(5) } });
    g.players[0].maxLife = 40; g.players[0].life = 9;
    const c = g.players[0].hand[0];
    ok((await g.playCard(0, c.uid, {})).ok);
    eq(g.players[0].life, 24, '31 lost → +15');
    g.players[0].life = 40;
    ok((await g.playCard(0, g.players[0].hand[0].uid, {})).ok);
    eq(g.players[0].life, 40);
  });

  test('再生の秘術は願いの魔神の「回復」候補に入っている', function () {
    ok(G.Wish.POOLS.heal.indexOf('再生の秘術') >= 0);
    ok(G.CardDB.get('gen_47').keywords.indexOf('lifesteal') >= 0);
  });
})(globalThis.G = globalThis.G || {});
