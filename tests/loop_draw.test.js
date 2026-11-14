'use strict';
// tests/loop_draw.test.js — loops that draw every pass (2026-11 fix): detected with the relaxed hash,
// run until just before the deck would run out.
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const F = function (n) { return new Array(n).fill('basic_01'); };
  const id = function (n) { return G.Data.idByName(n); };
  async function playFromGrave(g, defId, times) {
    for (let i = 0; i < times; i++) {
      const pl = g.getPlayable(0).filter(function (x) { return x.from === 'grave' && x.defId === defId; });
      if (!pl.length) return i;
      await g.playCard(0, pl[0].uid, {});
    }
    return times;
  }

  test('終わりなき頁＋火種（墓地から0マナ・マナ+1・1枚引く）は3回目でループとして検出される', async function () {
    const g = await T.sandbox({ p0: { crests: [id('終わりなき頁')], grave: [id('火種')], mana: 3, deck: F(10) }, p1: { deck: F(8) } });
    await playFromGrave(g, id('火種'), 2);
    ok(!g.loop.detected, 'not yet after 2 plays');
    await playFromGrave(g, id('火種'), 1);
    ok(g.loop.detected && g.loop.detected.relaxed, 'detected as a draw loop');
    eq(g.loop.detected.cycle.length, 1);
  });

  test('引くループは山札が尽きる手前で止まり、山札切れで負けない', async function () {
    const g = await T.sandbox({ p0: { crests: [id('終わりなき頁')], grave: [id('火種')], mana: 3, deck: F(10) }, p1: { deck: F(8) } });
    await playFromGrave(g, id('火種'), 3);
    const r = await g.runLoop(0, 'inf');
    eq(r.reason, 'deck'); eq(g.players[0].deck.length, 0);
    eq(g.winner, null); ok(!g.players[0].deckedOut);
    eq(g.players[0].mana, 3 + 10, 'one mana per pass, 10 passes in all');
  });

  test('永劫の書＋火種（手札に戻る）も引くループとして検出される', async function () {
    const g = await T.sandbox({ p0: { crests: [id('永劫の書')], hand: [id('火種')], mana: 3, deck: F(10) }, p1: { deck: F(8) } });
    for (let i = 0; i < 3; i++) {
      const c = g.players[0].hand.find(function (x) { return x.defId === id('火種'); });
      await g.playCard(0, c.uid, {});
    }
    ok(g.loop.detected && g.loop.detected.relaxed);
  });

  test('ループでないもの：手札の火種3枚を順に使っても検出されない／引かないループは今まで通り', async function () {
    const g = await T.sandbox({ p0: { hand: [id('火種'), id('火種'), id('火種')], mana: 3, deck: F(10) }, p1: { deck: F(8) } });
    for (let i = 0; i < 3; i++) {
      const c = g.players[0].hand.find(function (x) { return x.defId === id('火種'); });
      await g.playCard(0, c.uid, {});
    }
    ok(!g.loop.detected, 'grave grows every play → not a loop');
    const g2 = await T.sandbox({ p0: { crests: [id('終わりなき頁')], grave: [id('静電気')], mana: 3, deck: F(10) }, p1: { deck: F(8) } });
    await playFromGrave(g2, id('静電気'), 3);
    ok(g2.loop.detected && !g2.loop.detected.relaxed, 'a non-drawing loop stays a normal loop');
  });
})(globalThis.G = globalThis.G || {});
