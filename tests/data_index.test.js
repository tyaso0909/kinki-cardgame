'use strict';
// tests/data_index.test.js — G.Data lookups and validateAll (SPEC names, references, pool filters).
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const DB = G.CardDB;
  if (!G.Data || !G.Data.validateAll) require(require('path').join(T.root(), 'js/data/_index.js'));

  test('G.Data.idByName / cardsByLineage / poolForPacks / tabooCards / relicsBy', function () {
    eq(G.Data.idByName('零の聖域'), 'gen_28'); eq(G.Data.idByName('鏡像の写し'), 'boss5_01'); eq(G.Data.idByName('存在しないカード'), null);
    eq(G.Data.defByName('最後の一周').id, 'boss1_02');
    eq(G.Data.cardsByLineage('generic').filter(function (d) { return d.id.indexOf('gen_') === 0; }).length, 43, '30 original + 13 added in 2026-11');
    eq(G.Data.cardsByLineage('accel').filter(function (d) { return d.rarity === 'boss'; }).length, 0, 'boss-rarity cards excluded by default');
    ok(G.Data.cardsByLineage('accel', { includeBoss: true }).some(function (d) { return d.id === 'boss1_01'; }));
    const pool = G.Data.poolForPacks();
    ok(pool.every(function (d) { return !d.bossOnly && d.rarity !== 'boss'; }), 'pool excludes boss cards');
    ok(pool.some(function (d) { return d.id === 'gen_01'; }));
    ok(G.Data.tabooCards().some(function (d) { return d.id === 'gen_30'; }));
    ok(G.Data.tabooCards().every(function (d) { return d.rarity === 'taboo'; }));
    eq(G.Data.bossTrumps(1).length, 3); eq(G.Data.bossTrumps(5).length, 4); eq(G.Data.bossAuxCards(3).length, 2); eq(G.Data.bossAuxCards(5).length, 1);
    eq(G.Data.relicsBy('start').length, 6); eq(G.Data.relicsBy('enemy').filter(function (r) { return r.enemyOnly; }).length, 15);
    eq(G.Data.relicIdByName('ループの螺子'), 'relic_loop_screw');
  });

  test('validateAll: own files (generic/boss/elite/relics) are complete and all references resolve', function () {
    const res = G.Data.validateAll();
    ok(!res.missingNames.generic, 'generic complete: ' + JSON.stringify(res.missingNames.generic));
    ok(!res.missingNames.boss, 'boss complete: ' + JSON.stringify(res.missingNames.boss));
    ok(!res.missingNames.elite, 'elite complete: ' + JSON.stringify(res.missingNames.elite));
    ok(!res.missingNames.relics, 'relics complete: ' + JSON.stringify(res.missingNames.relics));
    const own = res.errors.filter(function (e) { return !/^missing cards \((accel|cycle|copy|chain|time|doom)\)/.test(e) && !/references unknown card (accel|cycle|copy|chain|time|doom)_/.test(e); });
    T.deepEq(own, [], 'no errors in own data');
    ok(res.counts.cards >= 30 + 27 + 6, 'card count ' + res.counts.cards);
    ok(res.counts.relics >= 59);
    // when every lineage file is present (integration), the whole validation must pass
    if (!res.missingFiles.length && !Object.keys(res.missingNames).length) ok(res.ok, 'full validation: ' + res.errors.join(' | '));
  });

  test('validateAll (strict) reports whole-group absences as missing names instead of throwing', function () {
    const res = G.Data.validateAll({ strict: true });
    ok(Array.isArray(res.errors)); ok(typeof res.ok === 'boolean');
    Object.keys(res.missingNames).forEach(function (k) { ok(Array.isArray(res.missingNames[k])); });
  });

  test('runEffects flags are exactly the documented set', function () {
    const keys = {};
    G.RelicDB.all().forEach(function (r) { Object.keys(r.runEffects || {}).forEach(function (k) { keys[k] = true; }); });
    T.deepEq(Object.keys(keys).sort(), ['hazardEarly', 'healAfterBattle', 'hideHazard', 'mapFog', 'noRestHeal', 'revealEnemyHand', 'rewardChoices', 'shopDiscount']);
  });

  test('restoreVault: stolen cards return by original owner; copies ignored', async function () {
    const g = await T.sandbox({ p0: { hand: ['tc_bolt', 'tc_spark'], board: ['tc_big'] }, p1: { hand: ['tc_heal'] } });
    const ctx = g.makeCtx(1, null);
    await ctx.vaultSteal(g.players[0].hand[0], 1);
    await ctx.steal(g.players[0].board[0], 1);
    await ctx.addToHand('tc_bolt', 1, { isCopy: true });
    const r = G.Data.restoreVault(g);
    T.deepEq(r[0].sort(), ['tc_big', 'tc_bolt']); T.deepEq(r[1], []);
    eq(g.players[1].vault.length, 0); eq(g.players[1].board.length, 0);
    ok(g.players[1].hand.some(function (c) { return c.defId === 'tc_heal'; }), 'own cards untouched');
  });
})(globalThis.G = globalThis.G || {});
