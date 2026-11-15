'use strict';
// tests/pick_ask.test.js — a human player is asked even when only one target is possible (2026-11).
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq;
  const F = function (n) { return new Array(n).fill('basic_01'); };
  test('対象が1つしかなくても、人間のプレイヤーには選ぶ画面を出す（AIは自動のまま）', async function () {
    let asked = 0;
    const g = await T.sandbox({ p0: { board: ['doom_27'], deck: F(5), chooser: function (spec, cands) { asked++; return cands.slice(0, 1); } }, p1: { board: ['doom_01'], deck: F(5) } });
    await g.makeCtx(1, null).destroy(g.players[0].board[0]);
    eq(asked, 1, 'human chooser called for the single candidate');
    eq(g.players[1].board.length, 0);
    let asked2 = 0;
    const g2 = await T.sandbox({ p0: { board: ['doom_27'], deck: F(5), chooser: function (spec, cands) { asked2++; return cands.slice(0, 1); } }, p1: { board: ['doom_01'], deck: F(5) } });
    g2.players[0].isAI = true; // the sandbox's P0 is human by default
    await g2.makeCtx(1, null).destroy(g2.players[0].board[0]);
    eq(asked2, 0, 'AI players keep the shortcut');
    eq(g2.players[1].board.length, 0);
  });
})(globalThis.G = globalThis.G || {});
