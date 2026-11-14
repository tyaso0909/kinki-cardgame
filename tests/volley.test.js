'use strict';
// tests/volley.test.js — attacksRemaining (used by the 一斉攻撃 preview) with 連撃 and 一瞬の永遠 (2026-11 QA fix).
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq;
  const F = function (n) { return new Array(n).fill('basic_01'); };
  test('attacksRemaining: 通常1・連撃2・一瞬の永遠で+1（1回殴った後も1回残る）', async function () {
    const g = await T.sandbox({ p0: { board: ['doom_01', 'copy_27'], hand: ['time_09'], mana: 5, deck: F(5) }, p1: { life: 100, deck: F(5) } });
    const [sk, kn] = g.players[0].board;
    [sk, kn].forEach(function (m) { m.summonedTurn = -5; m.attacksLeft = g.attacksPerTurn(m); });
    eq(g.attacksRemaining(sk), 1); eq(g.attacksRemaining(kn), 2);
    await g.playCard(0, g.players[0].hand[0].uid, {});
    eq(g.attacksRemaining(sk), 2); eq(g.attacksRemaining(kn), 3);
    await g.attack(0, sk.uid, 'face');
    eq(sk.attacksLeft, 1); eq(g.attacksRemaining(sk), 1, 'the extra attack is now in attacksLeft');
    await g.attack(0, sk.uid, 'face');
    eq(g.attacksRemaining(sk), 0);
    for (let i = 0; i < 3; i++) await g.attack(0, kn.uid, 'face');
    eq(g.players[1].life, 100 - 2 - 12);
  });
})(globalThis.G = globalThis.G || {});
