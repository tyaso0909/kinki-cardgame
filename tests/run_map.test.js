'use strict';
// tests/run_map.test.js — act map generation validity (G.RunMap).
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  if (!G.RunMap) return;

  test('map: 200 generated maps are valid (reachable, boss reachable, row rules, no row skipping)', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const act = 1 + (seed % 3);
      const m = G.RunMap.generate({ act: act, rng: new G.RNG(seed), eliteExtra: seed % 5 === 0 ? 1 : 0 });
      const v = G.RunMap.validate(m);
      ok(v.ok, 'seed ' + seed + ': ' + v.errors.join('; '));
      eq(m.rows.length, G.RunMap.ROWS + 1, 'rows');
      m.rows.slice(0, -1).forEach(function (row) { ok(row.length >= 2 && row.length <= 4, '2..4 nodes per row'); });
      const c = G.RunMap.counts(m);
      ok(c.shop >= 1, 'at least one shop'); ok(c.elite >= 1 + (seed % 5 === 0 ? 1 : 0), 'elite count honours eliteExtra'); ok(c.event >= 1, 'at least one event');
      ok(c.battle >= 4, 'enough battles');
      eq(c.boss, 1);
      // non-crossing edges
      m.rows.slice(0, -2).forEach(function (row, r) {
        const next = m.rows[r + 1];
        row.forEach(function (a, i) {
          row.slice(i + 1).forEach(function (b) {
            m.nodes[a].next.forEach(function (ta) { m.nodes[b].next.forEach(function (tb) { ok(next.indexOf(ta) <= next.indexOf(tb), 'edges cross at row ' + r); }); });
          });
        });
      });
    }
  });

  test('map: boss chosen from the act candidates; 鏡の主 fixed in act 3; enemies by act without repeats', () => {
    if (!G.EnemyDB.has('boss_mirror_lord')) return;
    const seen = {};
    for (let seed = 1; seed <= 30; seed++) {
      [1, 2, 3].forEach(function (act) {
        const m = G.RunMap.generate({ act: act, rng: new G.RNG(seed) });
        ok(G.RunMap.BOSS_CANDIDATES[act].indexOf(m.bossEnemyId) >= 0, 'boss candidate act ' + act);
        seen[m.bossEnemyId] = true;
        const battles = Object.keys(m.nodes).map(function (id) { return m.nodes[id]; }).filter(function (n) { return n.type === 'battle'; });
        const ids = battles.map(function (n) { return n.enemyId; });
        ids.forEach(function (id) { eq(G.EnemyDB.get(id).act, act, 'enemy act'); eq(G.EnemyDB.get(id).tier, 'normal'); });
        // no repeats until the pool (5 per act) is exhausted
        const firstFive = ids.slice(0, 5);
        eq(new Set(firstFive).size, firstFive.length, 'no repeats within the first 5 battles');
        Object.keys(m.nodes).forEach(function (id) { const n = m.nodes[id]; if (n.type === 'elite') eq(G.EnemyDB.get(n.enemyId).tier, 'elite'); });
      });
    }
    eq(seen.boss_mirror_lord, true);
    ok(seen.boss_loop_artisan && seen.boss_collector, 'both act-1 bosses appear over 30 seeds');
    ok(seen.boss_storm_magus && seen.boss_time_thief, 'both act-2 bosses appear over 30 seeds');
  });

  test('map: deterministic for a seed; fog candidates exist for 嘘つきの地図', () => {
    const a = G.RunMap.generate({ act: 2, rng: new G.RNG(77) }), b = G.RunMap.generate({ act: 2, rng: new G.RNG(77) });
    eq(JSON.stringify(a), JSON.stringify(b));
    ok(Object.keys(a.nodes).some(function (id) { return a.nodes[id].fog; }), 'some fog nodes');
    ok(!a.nodes[a.bossId].fog, 'boss never fogged');
  });
})(globalThis.G);
