// Regression: SPEC 戦闘ルール「どちらも1ターン目の最大マナは1」 — for every enemy, both turn orders,
// and with the player's mana-related relics equipped.
require('./harness.js'); G.Test.loadAll();
const { test, eq } = G.Test;

const deckIds = () => G.Data.poolForPacks().slice(0, 30).map((d) => d.id);

async function firstTurns(enemyId, first, playerRelics) {
  const def = G.EnemyDB.get(enemyId);
  const deck = deckIds();
  const ecfg = G.AI.enemyPlayerConfig(def, { act: (def.act && def.act[0]) || 1, depth: 0, playerDeckIds: deck, prevRunDeckIds: [] });
  const g = G.Engine.createGame({ seed: 7, players: [{ deck, name: 'あなた', relics: playerRelics || [] }, ecfg], field: ecfg.field || null, options: { firstPlayer: first } });
  const seen = {};
  await g.start();
  seen[g.active] = g.players[g.active].maxMana;
  await g.endTurn(g.active);
  if (seen[g.active] == null) seen[g.active] = g.players[g.active].maxMana;
  return seen;
}

test('最初のターンは敵も味方も最大マナ1（全敵・先攻後攻）', async function () {
  const ids = G.EnemyDB.ids().filter((id) => /^(enemy|elite|boss)_/.test(id));
  for (const id of ids) {
    for (const first of [0, 1]) {
      const s = await firstTurns(id, first, []);
      eq(s[0], 1, id + ' player (first=' + first + ')');
      eq(s[1], 1, id + ' enemy (first=' + first + ')');
    }
  }
});

test('最初のターンは最大マナ1（燃える種火・竜の心臓を持っていても）', async function () {
  for (const first of [0, 1]) {
    const s = await firstTurns('enemy_fire_lizard', first, ['relic_ember', 'relic_dragon_heart']);
    eq(s[0], 1, 'player with ember + dragon heart (first=' + first + ')');
  }
});
