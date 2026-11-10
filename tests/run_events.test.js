'use strict';
// tests/run_events.test.js — the 16 run events: registry, act gating, once-per-run, every option resolves; rewards.
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  if (!G.EventDB || !G.Run || !G.CardDB.has('accel_01') || !G.EnemyDB.has('elite_core_dragon')) return;
  G.AI.quiet = true; G.Run.quiet = true;

  const NAMES = ['怪しい露店', '賭博師の卓', '拾ったカードの束', '祈りの泉', '喋る宝箱', '呪われた宝箱', '鏡の部屋', '迷い込んだ商人', '店主の休憩', '天秤の神殿', '時の止まった部屋', '壁の落書き', 'パック工房', '竜の巣', '禁忌の囁き', '置き去りのデッキ'];

  function freshRun(seed, act) {
    G.Save.clearRun();
    G.Run.startNew({ seed: seed || 1, depth: 0 });
    for (let i = 0; i < 6; i++) G.Run.openChosenPack(G.Run.packOffer()[0]);
    G.Run.chooseStarterRelic(G.Run.relicOffer()[0]);
    const st = G.Run.state;
    st.act = act || 1; st.gold = 300; st.life = 40;
    return st;
  }
  // Put the run into a specific event (bypassing the map) the same way goTo would.
  function enterEvent(st, id) {
    const def = G.EventDB.get(id);
    st.phase = 'event'; st.pending = { event: { eventId: id, stage: 'options', results: [], diary: null } };
    st.flags.usedEvents.push(id);
    if (def.onEnter) def.onEnter(st, G.Run.rng());
  }

  test('events: all 16 registered with SPEC names, act gating (4 are 第2幕〜)', () => {
    const all = G.EventDB.all();
    eq(all.length, 16);
    NAMES.forEach(function (n) { ok(all.some(function (e) { return e.name === n; }), 'missing event ' + n); });
    eq(all.filter(function (e) { return e.act === 2; }).length, 4);
    ['パック工房', '竜の巣', '禁忌の囁き', '置き去りのデッキ'].forEach(function (n) { eq(all.find(function (e) { return e.name === n; }).act, 2, n); });
    all.forEach(function (e) { ok(e.options.length >= 2, e.id + ' has ≥2 options'); e.options.forEach(function (o) { ok(typeof o.resolve === 'function', e.id + ' option resolve'); ok(o.label, 'label'); }); });
  });

  test('events: every option of every event resolves without throwing in a synthetic run (first candidates)', () => {
    G.EventDB.all().forEach(function (e) {
      e.options.forEach(function (o, i) {
        const st = freshRun(100 + i, 2);
        st.relics.push('relic_heavy_chain'); // so 祈りの泉② / 天秤② have something to use
        G.Save.updateMeta(function (m) { m.lastRunDeck = st.deck.slice(0, 25); m.graffitiCard = 'accel_01'; });
        enterEvent(st, e.id);
        const opts = G.Run.eventOptions();
        ok(opts[i].available, e.id + ' option ' + i + ' available in synthetic run');
        const text = G.Run.event().text; ok(typeof text === 'string' && text.length > 0, e.id + ' text');
        const choice = G.Events.firstChoice(st, e.id, i);
        const res = G.Run.resolveEvent(i, choice);
        ok(typeof res.text === 'string', e.id + '/' + i + ' result text');
        ok(st.deck.length >= 20, e.id + '/' + i + ' deck min kept');
        ok(st.gold >= 0, 'gold');
        if (res.battle) { eq(G.Run.nextScreen(), 'battle'); ok(G.EnemyDB.has(res.battle.enemyId)); }
        G.Run.abandon();
      });
    });
  });

  test('events: once per run, act gating when queued from the map', () => {
    const st = freshRun(3, 1);
    const seen = {};
    // queue events repeatedly through the private path used by goTo: emulate with a fake event node
    for (let i = 0; i < 12; i++) {
      st.phase = 'map'; st.pending = {};
      const nd = { id: 'ev' + i, type: 'event', row: 1, col: 0, next: [], fog: false };
      st.map.nodes[nd.id] = nd; st.position = null; st.map.rows[0].push(nd.id);
      G.Run.goTo(nd.id);
      const ev = G.Run.event();
      if (!ev.def) break;
      ok(!seen[ev.def.id], 'event repeated: ' + ev.def.id); seen[ev.def.id] = true;
      eq(ev.def.act, 1, 'act-2 event in act 1: ' + ev.def.id);
      G.Run.resolveEvent(ev.def.options.length - 1, null); G.Run.leaveEvent();
    }
    eq(Object.keys(seen).length, 12, 'all 12 act-1 events seen once');
    G.Run.abandon();
  });

  test('壁の落書き: receives the previous run card, then leaves one (≤ legend, not taboo/boss)', () => {
    G.Save.updateMeta(function (m) { m.graffitiCard = 'accel_01'; });
    const st = freshRun(4, 1);
    const n = st.deck.length;
    enterEvent(st, 'event_graffiti');
    eq(st.deck.length, n + 1, 'received'); eq(G.Save.meta().graffitiCard, null);
    ok(/受け取り/.test(G.Run.event().text));
    const cands = G.Run.eventCandidates(0);
    ok(cands.length > 0); cands.forEach(function (id) { const d = G.CardDB.get(id); ok(d.rarity !== 'taboo' && d.rarity !== 'boss' && !d.bossOnly); });
    const taboo = G.Data.tabooCards()[0].id; st.deck.push(taboo);
    ok(G.Run.eventCandidates(0).indexOf(taboo) < 0, 'taboo cannot be left');
    G.Run.resolveEvent(0, [cands[0]]);
    eq(G.Save.meta().graffitiCard, cands[0]);
    eq(st.deck.indexOf(cands[0]) < 0 || st.deck.filter(function (x) { return x === cands[0]; }).length < 2, true);
    G.Run.abandon();
    G.Save.updateMeta(function (m) { m.graffitiCard = null; });
  });

  test('置き去りのデッキ: offers 3 cards from lastRunDeck (residual) and costs 5 life each', () => {
    G.Save.updateMeta(function (m) { m.lastRunDeck = ['accel_01', 'cycle_01', 'chain_01', 'time_01']; });
    const st = freshRun(5, 2);
    enterEvent(st, 'event_abandoned_deck');
    const offered = G.Run.eventCandidates(0);
    eq(offered.length, 3); offered.forEach(function (id) { ok(['accel_01', 'cycle_01', 'chain_01', 'time_01'].indexOf(id) >= 0); });
    eq(st.flags.ev.abandonedResidual, true);
    G.Run.resolveEvent(0, offered.slice(0, 2));
    eq(st.life, 30); eq(st.flags.residualCards.length, 2);
    G.Run.abandon();
    G.Save.updateMeta(function (m) { m.lastRunDeck = []; });
  });

  test('竜の巣 failure → elite 炉心の番竜; 喋る宝箱 → mimic battle with doubled rewards; 賭博師 coin flips', () => {
    let st = freshRun(6, 2);
    let gotBattle = false, gotGold = false;
    for (let i = 0; i < 40 && !(gotBattle && gotGold); i++) {
      enterEvent(st, 'event_dragon_nest');
      const res = G.Run.resolveEvent(0, null);
      if (res.battle) { gotBattle = true; eq(res.battle.enemyId, 'elite_core_dragon'); eq(res.battle.elite, true); eq(G.Run.pendingBattle().elite, true); }
      else { gotGold = true; ok(res.gold === 200); }
      st.flags.usedEvents = []; st.pending = {}; st.phase = 'map';
    }
    ok(gotBattle && gotGold, 'both outcomes seen');
    enterEvent(st, 'event_talking_chest');
    const r = G.Run.resolveEvent(0, null);
    eq(r.battle.rewardMul, 2); eq(G.EnemyDB.get(r.battle.enemyId).act, 2); eq(G.Run.pendingBattle().rewardMul, 2);
    st.pending = {}; st.phase = 'map';
    enterEvent(st, 'event_gambler');
    const g0 = st.gold;
    const res = G.Run.resolveEvent(0, [50]);
    ok(st.gold === g0 + 50 || st.gold === g0 - 50, 'coin flip changes gold by the stake');
    ok(res.flip === 'win' || res.flip === 'lose');
    G.Run.abandon();
  });

  test('rewards: normal 3 cards (2 with 鎖の王冠, no taboo), elite pack 3 + relic, boss relics 3 + taboo 3/4 excluding owned, aux card', () => {
    const st = freshRun(7, 1);
    const rng = new G.RNG(1);
    const normal = G.Rewards.forBattle(st, { enemyDef: G.EnemyDB.get('enemy_fire_lizard'), rng: rng });
    eq(normal.cards.length, 3); ok(normal.gold >= 20 && normal.gold <= 30); normal.cards.forEach(function (id) { ok(G.CardDB.get(id).rarity !== 'taboo'); });
    st.relics.push('relic_chain_crown');
    eq(G.Rewards.forBattle(st, { enemyDef: G.EnemyDB.get('enemy_fire_lizard'), rng: rng }).cards.length, 2, '鎖の王冠');
    const mimic = G.Rewards.forBattle(st, { enemyDef: G.EnemyDB.get('enemy_fire_lizard'), rng: rng, rewardMul: 2 });
    ok(mimic.gold >= 40 && mimic.gold <= 60); ok(mimic.cardsExtra && mimic.cardsExtra.length >= 1);
    const elite = G.Rewards.forBattle(st, { enemyDef: G.EnemyDB.get('elite_core_dragon'), elite: true, rng: rng });
    eq(elite.packs.length, 3); ok(elite.relic && G.RelicDB.has(elite.relic)); ok(elite.gold >= 50 && elite.gold <= 70);
    ok(['generic', 'lineage'].indexOf(G.RelicDB.get(elite.relic).category) >= 0);
    // boss act 1: 3 taboo, excluding owned
    const owned = G.Data.tabooCards()[0].id; st.deck.push(owned);
    const b1 = G.Rewards.forBattle(st, { enemyDef: G.EnemyDB.get('boss_loop_artisan'), boss: true, rng: rng });
    eq(b1.gold, 120); eq(b1.bossRelics.length, 3); b1.bossRelics.forEach(function (id) { eq(G.RelicDB.get(id).category, 'boss'); });
    eq(b1.taboo.length, 3); ok(b1.taboo.indexOf(owned) < 0, 'owned taboo excluded');
    eq(b1.auxCard, G.Data.idByName('職人の予備部品')); ok(b1.diary && b1.diary.text);
    st.act = 2;
    const b2 = G.Rewards.forBattle(st, { enemyDef: G.EnemyDB.get('boss_storm_magus'), boss: true, rng: rng });
    eq(b2.taboo.length, 4);
    st.act = 3;
    const b3 = G.Rewards.forBattle(st, { enemyDef: G.EnemyDB.get('boss_mirror_lord'), boss: true, rng: rng });
    eq(b3.taboo, null, 'no taboo after 鏡の主'); eq(b3.auxCard, null); eq(b3.auxCodex, G.Data.idByName('ひび割れた手鏡'));
    // owned boss relics excluded
    st.relics.push('relic_raging_heart');
    for (let i = 0; i < 20; i++) ok(G.Rewards.bossRelicChoices(st, rng, 3).indexOf('relic_raging_heart') < 0);
    G.Run.abandon();
  });

  test('regression (engine): game.restore() keeps the AI RNG a real G.RNG (時間逆行 in AI battles)', async () => {
    const g = G.Engine.createGame({ seed: 3, players: [{ deck: ['basic_01', 'basic_01', 'basic_01'] }, { deck: ['basic_01', 'basic_01', 'basic_01'], isAI: true }] });
    await g.start();
    g._aiRng = new G.RNG(5);
    const snap = g.snapshot('t');
    ok(!('_aiRng' in snap), '_aiRng not serialized');
    g.restore('t');
    ok(g._aiRng instanceof G.RNG, 'still a real RNG after restore');
    eq(typeof g.clone()._aiRng, 'undefined', 'clone does not carry a broken copy');
  });

  test('finishBattle: restoreVault returns stolen cards and the deck keeps them; 旅人の水筒 heals; defeat → runend', async () => {
    const st = freshRun(8, 1);
    st.relics.push('relic_canteen');
    st.phase = 'map'; st.pending = {};
    const node = G.Run.availableNodes()[0];
    G.Run.goTo(node);
    const b = G.Run.beginBattle(G.Run.pendingBattle().enemyId, {});
    const g = b.game;
    await g.start();
    // simulate theft into the enemy's vault
    const c = g.players[0].deck[0];
    const ctx = g.makeCtx(1, null);
    await ctx.vaultSteal(c, g.players[1]);
    eq(g.players[1].vault.length, 1);
    const restoredPreview = G.Data.restoreVault(g.clone())[0];
    eq(restoredPreview.length, 1); eq(restoredPreview[0], c.defId);
    g.players[0].life = 17; g.players[1].life = 0; g.checkWin();
    eq(g.winner, 0);
    const deckBefore = st.deck.slice();
    const screen = G.Run.finishBattle({ won: true, winner: 0, reason: g.winReason, turns: g.turn, stats: g.stats, game: g });
    eq(screen, 'reward');
    eq(st.life, 29, '17 + 8 (勝利後回復20%) + 4 (水筒)');
    T.deepEq(st.deck.slice().sort(), deckBefore.sort(), 'deck intact after vault restore');
    eq(st.stats.battles, 1); eq(st.stats.wins, 1);
    // defeat path
    G.Run.finishReward();
    G.Run.goTo(G.Run.availableNodes()[0]);
    const b2 = G.Run.beginBattle(G.Run.pendingBattle().enemyId, {});
    await b2.game.start();
    b2.game.players[0].life = 0; b2.game.checkWin();
    eq(G.Run.finishBattle({ won: false, winner: 1, reason: 'life', turns: 1, stats: b2.game.stats, game: b2.game }), 'runend');
    eq(G.Run.pendingEnd().won, false);
    const sum = G.Run.endRun();
    eq(sum.won, false); eq(G.Run.state, null);
  });

  test('QA tuning: a won normal battle heals 20% of max life, a won boss battle heals fully', () => {
    const st = freshRun(31);
    const water = G.Run.runEffects().healAfterBattle || 0; // 旅人の水筒 stacks on top
    st.life = 10; st.phase = 'battle';
    st.pending = { battle: { enemyId: 'enemy_lost_codex', seed: 1 } };
    eq(G.Run.finishBattle({ won: true, winner: 0, reason: 'life', turns: 3, stats: {}, game: null }), 'reward');
    eq(st.life, 18 + water, '10 + 8');
    G.Run.finishReward();
    st.life = 5; st.phase = 'battle';
    st.pending = { battle: { enemyId: 'boss_loop_artisan', boss: true, seed: 2 } };
    G.Run.finishBattle({ won: true, winner: 0, reason: 'life', turns: 3, stats: {}, game: null });
    eq(st.life, st.maxLife, 'boss win → full heal');
  });
})(globalThis.G);
