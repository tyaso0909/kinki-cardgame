/* 幻影は相手のターン終了時に消える（2026-11 ルール変更）。 */
(function (G) {
  'use strict';
  const T = G.Test, test = T.test, eq = T.eq;
  const filler = (n) => Array.from({ length: n }, () => 'basic_01');

  test('phantom timing: made on my turn → stays through the opponent turn, vanishes at its end', async function () {
    const g = await T.sandbox({ p0: { board: ['t_sprite'], deck: filler(5) }, p1: { deck: filler(5) } });
    await g.makeCtx(0, null).createPhantom(g.players[0].board[0], 0, { count: 2 });
    await g.endTurn(0);
    eq(g.players[0].phantoms.length, 2, 'can block / be attacked on the opponent turn');
    eq(g.monstersOf(0).length, 3);
    await g.endTurn(1);
    eq(g.players[0].phantoms.length, 0);
  });

  test('phantom timing: made during the opponent turn → survives that turn end, vanishes after the next opponent turn', async function () {
    const g = await T.sandbox({ p0: { board: ['t_sprite'], deck: filler(5) }, p1: { deck: filler(5) } });
    await g.endTurn(0);                                   // p1's turn
    await g.makeCtx(0, null).createPhantom(g.players[0].board[0], 0, { count: 1 }); // e.g. 分裂する粘体 splitting
    await g.endTurn(1);
    eq(g.players[0].phantoms.length, 1, 'not wiped by the turn it was made in');
    await g.endTurn(0);
    eq(g.players[0].phantoms.length, 1, 'my turn end does not remove it');
    await g.endTurn(1);
    eq(g.players[0].phantoms.length, 0);
  });

  test('phantom timing: the opponent\'s own phantoms are untouched by my turn end', async function () {
    const g = await T.sandbox({ p0: { deck: filler(5) }, p1: { board: ['t_sprite'], deck: filler(5) } });
    await g.endTurn(0);
    await g.makeCtx(1, null).createPhantom(g.players[1].board[0], 1, { count: 1 });
    await g.endTurn(1);
    eq(g.players[1].phantoms.length, 1, 'p1 made it on its own turn: still there on p0\'s turn');
    await g.endTurn(0);
    eq(g.players[1].phantoms.length, 0, 'gone at the end of p0\'s turn');
  });
})(globalThis.G = globalThis.G || {});
