'use strict';
// tests/wish.test.js — 願いの魔神 (gen_46) and G.Wish.offers (2026-11).
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const F = function (n, id) { return new Array(n).fill(id || 'basic_01'); };
  const nameOf = function (id) { return G.CardDB.get(id).name; };

  test('願いの魔神: 3コスト1/1・汎用・伝説、全プールのカードが実在する', function () {
    const d = G.CardDB.get('gen_46');
    eq(d.name, '願いの魔神'); eq(d.cost, 3); eq(d.atk + '/' + d.hp, '1/1'); eq(d.rarity, 'legend');
    Object.keys(G.Wish.POOLS).forEach(function (cat) {
      G.Wish.POOLS[cat].forEach(function (n) { ok(G.Data.idByName(n), cat + ': ' + n); });
    });
  });

  test('願い: 勝てる状況なら「リーサル」を最初に出す', async function () {
    const g = await T.sandbox({ p0: { mana: 5, deck: F(8) }, p1: { life: 3, deck: F(8) } });
    const o = await G.Wish.offers(g, 0);
    eq(o[0].cat, 'lethal'); eq(o.length, 3);
    ok(new Set(o.map(function (x) { return x.cat; })).size === 3, 'three different categories');
  });

  test('願い: 相手の場が並んでいれば「一掃」、時限カードには「時計止め」', async function () {
    const g = await T.sandbox({ p0: { mana: 3, deck: F(8), hand: F(4) }, p1: { board: ['doom_01', 'doom_01', 'copy_09', 'copy_09'], deck: F(8) } });
    const o = await G.Wish.offers(g, 0);
    ok(o.some(function (x) { return x.cat === 'sweep'; }), o.map(function (x) { return x.cat; }).join());
    ok(!o.some(function (x) { return x.cat === 'lethal'; }));
    const g2 = await T.sandbox({ p0: { mana: 3, deck: F(8), hand: F(3) }, p1: { timed: ['time_07', 'time_07'], deck: F(8) } });
    const o2 = await G.Wish.offers(g2, 0);
    ok(o2.some(function (x) { return x.cat === 'guard' && nameOf(x.defId) === '時計止め'; }), o2.map(function (x) { return nameOf(x.defId); }).join());
  });

  test('願い: ライフが少ないと「回復」を出す', async function () {
    const g = await T.sandbox({ p0: { mana: 2, deck: F(8) }, p1: { board: ['doom_01'], deck: F(8) } });
    g.players[0].life = 8; g.players[0].maxLife = 40;
    const o = await G.Wish.offers(g, 0);
    ok(o.some(function (x) { return x.cat === 'heal'; }), o.map(function (x) { return x.cat; }).join());
  });

  test('願い: 試しの対戦では本物の選択画面（プレイヤーの chooser）を一度も呼ばない', async function () {
    let calls = 0;
    const g = await T.sandbox({ p0: { mana: 3, deck: F(10), hand: [], chooser: function (spec, cands) { calls++; return cands[0] && cands[0].id !== undefined ? cands[0].id : cands.slice(0, spec.count || 1); } }, p1: { board: ['doom_01'], deck: F(8) } });
    const o = await G.Wish.offers(g, 0);
    eq(calls, 0, 'human chooser untouched while trying 全知の雫 and friends');
    eq(o.length, 3);
  });

  test('願いの魔神: 召喚すると選んだカードが朧として手札に入る（実際の盤面は変わらない）', async function () {
    let seen = null;
    const g = await T.sandbox({ p0: { hand: ['gen_46'], mana: 10, deck: F(8), chooser: function (spec, cands) { seen = cands; return cands[1].id; } }, p1: { board: ['doom_01'], deck: F(8) } });
    const before = g.players[1].board.length;
    const c = g.players[0].hand.find(function (x) { return x.defId === 'gen_46'; });
    ok((await g.playCard(0, c.uid, {})).ok);
    eq(seen.length, 3);
    ok(seen.every(function (o) { return o.card && o.caption; }), 'options carry the card and its category');
    const got = g.players[0].hand.filter(function (x) { return x.oboro; });
    eq(got.length, 1); eq(got[0].defId, seen[1].id);
    eq(g.players[1].board.length, before, 'simulations never touch the real battle');
    eq(g.players[0].mana, 7);
  });
})(globalThis.G = globalThis.G || {});
