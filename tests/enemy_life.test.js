// Enemy life tuning (2026-11-10): base lives per SPEC table, +6%/map row for normals & elites, depth multipliers.
require('./harness.js'); G.Test.loadAll();
const { test, eq } = G.Test;

test('第1幕の序盤の敵は体力10〜20、鏡の主は200', async function () {
  ['enemy_fire_lizard', 'enemy_lost_codex', 'enemy_bone_goblin', 'enemy_mist_twins', 'enemy_watch_statue'].forEach((id) => {
    const l = G.EnemyDB.get(id).life; eq(l >= 10 && l <= 20, true, id + ' life ' + l);
  });
  eq(G.EnemyDB.get('boss_mirror_lord').life, 200);
});

test('マップの段ごとの体力増加（ボスは固定）', async function () {
  const liz = G.EnemyDB.get('enemy_fire_lizard'), boss = G.EnemyDB.get('boss_loop_artisan'), elite = G.EnemyDB.get('elite_core_dragon');
  eq(G.Run.rowLifeMul(liz, 0), 1);
  eq(Math.round(G.Run.rowLifeMul(liz, 5) * 100), 130);
  eq(Math.round(G.Run.rowLifeMul(elite, 3) * 100), 118);
  eq(G.Run.rowLifeMul(boss, 6), 1);
});

test('深度の倍率：深度1で通常敵×1.25、深度5でボス×1.5', async function () {
  eq(G.AI.enemyPlayerConfig('enemy_watch_statue', { depth: 1 }).life, 25);
  eq(G.AI.enemyPlayerConfig('boss_mirror_lord', { depth: 5, playerDeckIds: [], prevRunDeckIds: [] }).life, 300);
});
