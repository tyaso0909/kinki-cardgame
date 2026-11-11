'use strict';
// tests/ai_enemies.test.js — EnemyDB contents, deck resolution, boss hazard tables, 鏡の主 deckBuilder,
// enemyPlayerConfig / depth modifiers, enrage hooks.
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  if (!G.EnemyDB || !G.AI || !G.EnemyDB.has('boss_loop_artisan')) return;
  G.AI.quiet = true;
  const DB = G.EnemyDB;
  const cardsLoaded = G.CardDB.has('accel_01') && G.CardDB.has('boss1_01');
  const id = function (name) { return G.AI.cardId(name); };

  test('EnemyDB: 15 normal / 9 elite / 5 boss, kind+tier+isBoss set, acts and lives per SPEC', () => {
    const normals = DB.filter(function (e) { return e.tier === 'normal'; });
    const elites = DB.filter(function (e) { return e.tier === 'elite'; });
    const bosses = DB.filter(function (e) { return e.tier === 'boss'; });
    eq(normals.length, 15); eq(elites.length, 9); eq(bosses.length, 5);
    [1, 2, 3].forEach(function (act) {
      eq(normals.filter(function (e) { return e.act === act; }).length, 5, 'act ' + act + ' normals');
      eq(elites.filter(function (e) { return e.act === act; }).length, 3, 'act ' + act + ' elites');
    });
    DB.all().forEach(function (e) {
      eq(e.kind, e.tier, e.id + ' kind');
      eq(e.isBoss, e.tier === 'boss', e.id + ' isBoss');
      ok(typeof e.life === 'number' && e.life > 0, e.id + ' life');
      ok(G.AI.STYLES[e.style], e.id + ' style ' + e.style);
      ok(Array.isArray(e.lineage) && e.lineage.length, e.id + ' lineage');
      ok(e.reward && e.reward.gold, e.id + ' reward');
    });
    eq(DB.get('boss_loop_artisan').life, 60); eq(DB.get('boss_storm_magus').life, 125);
    eq(DB.get('boss_time_thief').life, 115); eq(DB.get('boss_collector').life, 50); eq(DB.get('boss_mirror_lord').life, 200);
    bosses.forEach(function (b) { ok(b.enrage && typeof b.enrage.apply === 'function', b.id + ' enrage'); ok(b.lastWords && b.diary, b.id + ' flavor'); ok(b.field, b.id + ' field'); });
    elites.forEach(function (e) { eq(e.trumps.length, 1, e.id + ' one trump'); eq(e.relicNames.length, 1, e.id + ' one relic'); });
  });

  test('enemy decks resolve by Japanese name without missing cards (15〜20 / 20 / 30)', () => {
    if (!cardsLoaded) return; // card files absent at this time → skip gracefully
    const sizes = { normal: 15, elite: 20, boss: 30 };
    DB.all().forEach(function (e) {
      if (e.deckBuilder) return; // 鏡の主 / 名もなき挑戦者 build per battle
      const deck = e.deck;
      // normal: act 1 = 15 (見張りの石像 20), act 2〜3 = 20 — デッキ切れで自滅しないように（2026-11）
      if (e.tier === 'normal') ok(deck.length === (e.act === 1 ? (e.id === 'enemy_watch_statue' ? 20 : 15) : 20), e.id + ' deck size ' + deck.length);
      else eq(deck.length, sizes[e.tier], e.id + ' deck size');
      const missing = e.deckSpec.filter(function (s) { return !id(s.name); }).map(function (s) { return s.name; });
      eq(missing.length, 0, e.id + ' missing cards: ' + missing.join('、'));
      ok(deck.every(function (d) { return G.CardDB.has(d); }), e.id + ' all ids registered');
    });
    // trumps are registered as bossOnly
    DB.all().forEach(function (e) { e.trumps.forEach(function (n) { const d = G.CardDB.get(id(n)); ok(d.bossOnly, e.id + ' trump ' + n + ' bossOnly'); }); });
  });

  test('enemy relics and fields resolve', () => {
    if (!cardsLoaded || !G.RelicDB.has('relic_artisan_workbench')) return;
    DB.all().forEach(function (e) {
      eq(e.relics.length, e.relicNames.length, e.id + ' relics: ' + e.relicNames.join('、'));
      if (e.fieldName) ok(e.field && G.CardDB.has(e.field), e.id + ' field ' + e.fieldName);
    });
  });

  test('missing card in a deck spec substitutes basic_01 and never throws', () => {
    const deck = G.AI.buildDeck([{ name: '存在しないカード', n: 2 }, { name: '見習いの火球', n: 1 }], { silent: true });
    if (G.CardDB.has('basic_01')) { eq(deck.length, 3); ok(deck.every(function (d) { return d === 'basic_01'; })); }
    else eq(deck.length, 0);
  });

  // ---- boss hazard tables ----
  async function bossSandbox(bossId, p1) {
    p1 = p1 || {};
    const def = DB.get(bossId);
    const g = await T.sandbox(Object.assign({ seed: 1, first: 1, p0: { deck: ['basic_01', 'basic_01'] } }, { p1: Object.assign({ deck: ['basic_01', 'basic_01'], hazardTests: def.hazard, chooser: G.AI.makeChooser(def.style) }, p1) }));
    g.players[1].enemyDefId = bossId;
    return g;
  }

  test('hazard ループ職人: 祭壇40 + 不死鳥30 + 出口30 = 100', async () => {
    if (!cardsLoaded) return;
    const g = await bossSandbox('boss_loop_artisan', { crests: [id('焚べ火の祭壇')], hand: [id('ぜんまい仕掛けの不死鳥'), id('最後の一周')] });
    eq(g.hazard(1), 100);
    const g2 = await bossSandbox('boss_loop_artisan', { crests: [id('焚べ火の祭壇')], board: [id('ぜんまい仕掛けの不死鳥')] });
    eq(g2.hazard(1), 70);
  });
  test('hazard ストームの魔術師: 手札6 + 坩堝/指揮者 + 出口 + 大精霊 = 100', async () => {
    if (!cardsLoaded) return;
    const g = await bossSandbox('boss_storm_magus', { hand: [id('無限の坩堝'), id('終曲・万雷'), id('火種'), id('火花'), id('静電気'), id('火種')], board: [id('嵐の大精霊')] });
    eq(g.hazard(1), 100);
    const g2 = await bossSandbox('boss_storm_magus', { hand: [id('嵐の指揮者'), id('嵐の化身')] });
    eq(g2.hazard(1), 60);
  });
  test('hazard 時間泥棒: 魔女40 + 砂時計30 + 出口20 + 爆弾10 = 100', async () => {
    if (!cardsLoaded) return;
    const g = await bossSandbox('boss_time_thief', { board: [id('時盗みの魔女')], hand: [id('奪われた砂時計'), id('刻限の処刑')], timed: [{ id: id('時限爆弾'), count: 2 }] });
    eq(g.hazard(1), 100);
  });
  test('hazard 蒐集者: 鍵4種(80) + 最後の展示(20) = 100、3種で60', async () => {
    if (!cardsLoaded) return;
    const g = await bossSandbox('boss_collector', { seals: [id('終末の鍵・第一'), id('終末の鍵・第二'), id('終末の鍵・第三'), id('終末の鍵・第四')], hand: [id('最後の展示')] });
    eq(g.hazard(1), 100);
    const g2 = await bossSandbox('boss_collector', { seals: [id('終末の鍵・第一'), id('終末の鍵・第二'), id('終末の鍵・第三')] });
    eq(g2.hazard(1), 60);
  });
  test('hazard 鏡の主: 写し40 + コピーしたコンボ成立40 + 出口20 = 100', async () => {
    if (!cardsLoaded) return;
    const g = await bossSandbox('boss_mirror_lord', { hand: [id('鏡像の写し'), id('終わりの自画像'), id('巡る不死鳥')], crests: [id('焚べ火の祭壇')], deck: [id('焔帝竜'), 'basic_01'] });
    eq(g.hazard(1), 100);
    const g2 = await bossSandbox('boss_mirror_lord', { hand: [id('鏡像の写し')] });
    eq(g2.hazard(1), 40);
  });

  test('elite hazards reach 100 (1-stage forecast) with their trump in hand', async () => {
    if (!cardsLoaded) return;
    const cases = {
      elite_core_dragon: { hand: [id('溶けた心臓'), id('火種'), id('火種')] },
      elite_whispering_librarian: { hand: [id('禁書の頁')] },
      elite_twin_thunder_beast: { hand: [id('二つ首の咆哮'), id('稲光の導線'), id('火花'), id('火花'), id('火花')] },
      elite_cursed_doll: { hand: [id('呪いの人形箱'), id('冥王の宣告')] },
      elite_time_stopper: { hand: [id('緊急停止'), id('刻を統べる竜')], timed: [{ id: id('時限爆弾'), count: 2 }] },
      elite_thousand_faces: { hand: [id('千の仮面'), id('幻影の総攻撃')], board: [id('霧の双子'), id('霧の双子')] }
    };
    for (const eid in cases) {
      const def = DB.get(eid);
      const g = await T.sandbox({ seed: 1, first: 1, p0: { deck: ['basic_01'], hand: eid === 'elite_whispering_librarian' ? ['basic_01', 'basic_01', 'basic_01', 'basic_01', 'basic_01'] : [] }, p1: Object.assign({ deck: ['basic_01'], hazardTests: def.hazard }, cases[eid]) });
      if (eid === 'elite_cursed_doll') g.players[0].curse = 10;
      eq(g.hazard(1), 100, eid);
    }
  });

  // ---- 鏡の主 deck builder ----
  test('鏡の主 deckBuilder: copies ≤25 of the player deck + 5 trumps + ≤3 残り香 flagged residual', async () => {
    if (!cardsLoaded) return;
    const def = DB.get('boss_mirror_lord');
    const player = []; for (let i = 1; i <= 25; i++) player.push('accel_' + (i < 10 ? '0' + i : i));
    player.push('cycle_01', 'cycle_02', 'cycle_03', 'cycle_04', 'cycle_05', 'cycle_06', 'cycle_07'); // 32 cards → 25 copied
    const prev = ['doom_01', 'doom_02', 'doom_03', 'doom_04', 'doom_05'];
    const built = def.deckBuilder(player, prev, new G.RNG(5));
    eq(built.deck.length, 25 + 5 + 3);
    eq(built.residual.length, 3);
    eq(built.deck.filter(function (d) { return d === id('鏡像の写し'); }).length, 2);
    ok(built.residual.every(function (d) { return prev.indexOf(d) >= 0; }));
    // small deck: copied whole; first run: no residual
    const b2 = def.deckBuilder(['accel_01', 'accel_02', 'accel_06'].concat(new Array(17).fill('accel_06')), [], new G.RNG(1));
    eq(b2.deck.length, 25); eq(b2.residual.length, 0);
    // through enemyPlayerConfig + createGame: residual instances carry residual:true after start
    const cfg = G.AI.enemyPlayerConfig(def, { playerDeckIds: player, prevRunDeckIds: prev, seed: 5, playerRelics: [] });
    eq(cfg.deck.length, 33); eq(cfg.residualIds.length, 3); eq(cfg.name, '鏡の主'); eq(cfg.life, 200);
    const g = G.Engine.createGame({ seed: 5, players: [{ name: 'P', deck: player, isAI: false }, cfg], field: cfg.field, options: { fieldOwner: 1 } });
    await g.start();
    const all = g.players[1].deck.concat(g.players[1].hand);
    eq(all.filter(function (c) { return c.residual; }).length, 3, 'residual flags');
    ok(g.field && g.field.defId === cfg.field, 'boss field in play');
    ok(G.Combos.forDeck(player).length >= 1, '鏡の主 reads the player combos');
  });

  test('enemyPlayerConfig: depth modifiers (life, mistake rate, extra relics) and base values', () => {
    if (!cardsLoaded) return;
    const liz = G.AI.enemyPlayerConfig('enemy_fire_lizard', { depth: 0 });
    eq(liz.life, 14); eq(liz.mistakeRate, 0.2); eq(liz.deck.length, 15); eq(liz.isAI, true); eq(liz.enemyDefId, 'enemy_fire_lizard');
    ok(liz.hazardTests.length >= 1 && liz.hazardTests[liz.hazardTests.length - 1].synthetic, 'synthetic lethal-block hazard appended');
    const d7 = G.AI.enemyPlayerConfig('enemy_fire_lizard', { depth: 7 });
    eq(d7.life, 18); eq(d7.mistakeRate, 0.1);
    const boss = G.AI.enemyPlayerConfig('boss_loop_artisan', { depth: 10, seed: 3 });
    eq(boss.life, 90); eq(boss.mistakeRate, 0);
    ok(boss.relics.length >= 3, 'boss has an extra relic at depth 10');
    eq(boss.chooser.enrageThreshold, 0.65);
    const elite = G.AI.enemyPlayerConfig('elite_core_dragon', { depth: 8, seed: 2 });
    ok(elite.relics.length >= 2, 'elite has 2 relics at depth 8');
  });

  test('名もなき挑戦者 builds a random 20-card deck per battle', () => {
    if (!cardsLoaded) return;
    const a = G.AI.enemyPlayerConfig('enemy_nameless_challenger', { seed: 1 });
    const b = G.AI.enemyPlayerConfig('enemy_nameless_challenger', { seed: 2 });
    eq(a.deck.length, 20); eq(b.deck.length, 20);
    ok(a.deck.join() !== b.deck.join(), 'different seeds → different decks');
    ok(a.deck.every(function (d) { return !G.CardDB.get(d).bossOnly; }));
  });

  // ---- enrage ----
  test('enrage ループ職人: at ≤50% life installs hidden relic adding 職人の予備部品 each turn start', async () => {
    if (!cardsLoaded) return;
    const g = await T.sandbox({ seed: 2, first: 0, p0: { deck: ['basic_01', 'basic_01', 'basic_01'] }, p1: { life: 120, deck: ['basic_01', 'basic_01', 'basic_01'] } });
    g.players[1].enemyDefId = 'boss_loop_artisan'; g.players[1].chooser = G.AI.makeChooser('assemble');
    g.players[1].life = 50;
    ok(G.AI.checkEnrage(g, 1)); ok(!G.AI.checkEnrage(g, 1), 'only once');
    ok(g.players[1].relics.indexOf('relic_boss1_enrage') >= 0);
    ok(G.RelicDB.get('relic_boss1_enrage').hidden);
    await g.endTurn(0);
    eq(g.players[1].hand.filter(function (c) { return c.defId === id('職人の予備部品'); }).length, 1);
  });

  test('enrage 時間泥棒: steals the player turn every 3 of its turns', async () => {
    const g = await T.sandbox({ seed: 2, first: 1, p0: { deck: new Array(12).fill('basic_01') }, p1: { life: 180, deck: new Array(12).fill('basic_01') } });
    g.players[1].enemyDefId = 'boss_time_thief'; g.players[1].life = 60;
    ok(G.AI.checkEnrage(g, 1));
    const skips = T.record(g, ['skipTurn']);
    for (let i = 0; i < 3; i++) { await g.endTurn(g.active); if (g.active === 0) await g.endTurn(0); }
    ok(skips.count('skipTurn') >= 1, 'a turn was stolen: ' + skips.count('skipTurn'));
  });

  test('enrage 蒐集者 / 鏡の主 / ストーム hooks run without error', async () => {
    if (!cardsLoaded) return;
    const g = await T.sandbox({ seed: 2, first: 0, p0: { hand: ['accel_06'], mana: 3, deck: new Array(6).fill('basic_01') }, p1: { life: 120, grave: [id('終末の鍵・第一')], deck: new Array(6).fill('basic_01') } });
    g.players[1].enemyDefId = 'boss_collector'; g.players[1].life = 10;
    ok(G.AI.checkEnrage(g, 1));
    await g.playCard(0, g.players[0].hand[0].uid);
    await g.endTurn(0);
    eq(g.players[1].seals.length, 1, '鍵 returned to seals');
    const g2 = await T.sandbox({ seed: 2, first: 0, p0: { hand: ['accel_06'], mana: 3, deck: new Array(6).fill('basic_01') }, p1: { life: 250, deck: new Array(6).fill('basic_01') } });
    g2.players[1].enemyDefId = 'boss_mirror_lord'; g2.players[1].life = 100;
    ok(G.AI.checkEnrage(g2, 1));
    await g2.playCard(0, g2.players[0].hand[0].uid);
    await g2.endTurn(0);
    ok(g2.players[1].hand.some(function (c) { return c.defId === 'accel_06' && c.isCopy; }), '割れた鏡 copied 火種');
    const g3 = await T.sandbox({ seed: 2, first: 1, p0: { deck: new Array(6).fill('basic_01') }, p1: { life: 180, hand: ['accel_06', 'accel_06'], mana: 5, deck: new Array(6).fill('basic_01') } });
    g3.players[1].enemyDefId = 'boss_storm_magus'; g3.players[1].life = 50;
    ok(G.AI.checkEnrage(g3, 1));
    await g3.playCard(1, g3.players[1].hand[0].uid); await g3.playCard(1, g3.players[1].hand[0].uid);
    await g3.endTurn(1); await g3.endTurn(0);
    eq(g3.players[1].chain, 1, '嵐の余韻 carried half the chain');
  });

  test('full battles: every enemy vs an AI opponent for 2 seeds, no throw, ends within turn limit', async () => {
    if (!cardsLoaded) return;
    const ids = DB.ids();
    for (let seed = 1; seed <= 2; seed++) {
      for (let i = 0; i < ids.length; i++) {
        const e = DB.get(ids[i]);
        const opp = DB.get(ids[(i + 7 * seed) % ids.length]);
        const pc1 = G.AI.enemyPlayerConfig(e, { seed: seed, playerDeckIds: opp.deck.slice() });
        const pc0 = G.AI.enemyPlayerConfig(opp, { seed: seed + 50, playerDeckIds: e.deck.slice() });
        const g = G.Engine.createGame({ seed: seed, players: [pc0, pc1], field: pc1.field, options: { fieldOwner: 1 }, turnLimit: 40 });
        await g.start();
        let guard = 0;
        while (g.winner === null && guard++ < 200) await G.AI.takeTurn(g, g.active);
        ok(g.winner !== null || g.phase === 'over', ids[i] + ' seed ' + seed + ' ended');
      }
    }
  });
})(globalThis.G);
