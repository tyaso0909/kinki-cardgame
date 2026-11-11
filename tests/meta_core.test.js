'use strict';
// tests/meta_core.test.js — G.Codex / G.Achievements / G.Records / G.Festival / G.Meta hooks.
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert, deepEq = T.deepEq;
  const path = require('path');
  ['js/data/texts.js', 'js/meta/depth.js', 'js/meta/codex.js', 'js/meta/achievements.js', 'js/meta/records.js', 'js/meta/festival.js', 'js/meta/meta.js']
    .forEach(function (f) { require(path.join(T.root(), f)); });

  // Fake localStorage shim (G.Save persists through it when present).
  function makeStorage() {
    const mem = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; },
      key: function (i) { return Object.keys(mem)[i] || null; },
      get length() { return Object.keys(mem).length; },
      _mem: mem,
    };
  }
  // Run `fn` in a clean meta state. mode 'save' keeps G.Save (fresh storage), 'nosave' removes G.Save.
  function withMeta(mode, fn) {
    const hadSave = G.Save, hadLS = globalThis.localStorage;
    G.MetaStore.reset();
    function restore() {
      G.Save = hadSave;
      if (hadLS === undefined) delete globalThis.localStorage; else globalThis.localStorage = hadLS;
      if (G.Save && typeof G.Save.load === 'function') { try { G.Save.load(); } catch (e) { /* ignore */ } }
      G.MetaStore.reset();
    }
    let out;
    try {
      if (mode === 'nosave') { G.Save = undefined; }
      else {
        globalThis.localStorage = makeStorage();
        if (G.Save && typeof G.Save.wipe === 'function') { try { G.Save.wipe(); } catch (e) { /* ignore */ } }
        if (G.Save && typeof G.Save.load === 'function') { try { G.Save.load(); } catch (e) { /* ignore */ } }
      }
      out = fn();
    } catch (e) { restore(); throw e; }
    if (out && typeof out.then === 'function') return out.then(function (v) { restore(); return v; }, function (e) { restore(); throw e; });
    restore();
    return out;
  }
  const MODES = G.Save ? ['save', 'nosave'] : ['nosave'];

  // ---- codex ----
  test('codex: totals は図鑑の対象数（カード=非切り札、遺物44、敵26、日記35）', function () {
    const t = G.Codex.totals();
    eq(t.relics, 44); eq(t.enemies, 26); eq(t.diary, 35);
    ok(t.cards >= 255 && t.cards <= 280, 'cards ' + t.cards); // 190 + 79 added in 2026-11
    G.Codex.cardPool().forEach(function (d) { ok(!d.bossOnly, d.id + ' not bossOnly'); });
    G.Codex.relicPool().forEach(function (r) { ok(!r.hidden && !r.enemyOnly, r.id + ' visible'); });
  });

  MODES.forEach(function (mode) {
    test('codex[' + mode + ']: 登録と達成率の計算', function () {
      withMeta(mode, function () {
        const c0 = G.Codex.completion();
        eq(c0.total.have, 0); eq(c0.total.pct, 0);
        ok(G.Codex.register('cards', 'accel_01'));
        ok(!G.Codex.register('cards', 'accel_01'), 'second registration is not fresh');
        ok(G.Codex.has('cards', 'accel_01'));
        G.Codex.register('cards', 'not_a_card'); // stale ids never count
        const t = G.Codex.totals();
        const c1 = G.Codex.completion();
        eq(c1.cards.have, 1); eq(c1.cards.pct, Math.floor(100 / t.cards));
        eq(c1.total.have, 1); eq(c1.total.total, t.cards + t.relics + t.enemies + t.diary);
        // fill everything
        G.Codex.cardPool().forEach(function (d) { G.Codex.register('cards', d.id); });
        G.Codex.relicPool().forEach(function (d) { G.Codex.register('relics', d.id); });
        G.Codex.enemyPool().forEach(function (d) { G.Codex.register('enemies', d.id); });
        G.Codex.diaryPool().forEach(function (d) { G.Codex.register('diary', d.id); });
        const c2 = G.Codex.completion();
        eq(c2.total.pct, 100); eq(c2.relics.pct, 100); eq(c2.diary.have, 35);
        eq(G.Codex.cosmetics().filter(function (x) { return x.unlocked; }).length, 4);
        eq(G.Codex.foilLevel(), 2); eq(G.Codex.activeCardBack(), 'back_gold');
      });
    });
  });

  test('codex: 化粧品の閾値 25/50/75/100', function () {
    withMeta('nosave', function () {
      const pool = G.Codex.cardPool().concat(G.Codex.relicPool(), G.Codex.enemyPool(), G.Codex.diaryPool());
      const total = pool.length;
      function fillTo(pct) {
        G.MetaStore.reset();
        const n = Math.ceil((pct / 100) * total);
        pool.slice(0, n).forEach(function (d) {
          const kind = d.type ? 'cards' : d.life != null ? 'enemies' : d.text && d.effects ? 'relics' : 'diary';
          G.Codex.register(kind, d.id);
        });
      }
      fillTo(24); eq(G.Codex.cosmetics()[0].unlocked, false); eq(G.Codex.activeCardBack(), null); eq(G.Codex.foilLevel(), 0);
      fillTo(25); eq(G.Codex.cosmetics()[0].unlocked, true); eq(G.Codex.activeCardBack(), 'back_scorched');
      fillTo(50); eq(G.Codex.activeCardBack(), 'back_mirror'); eq(G.Codex.foilLevel(), 0);
      fillTo(75); eq(G.Codex.foilLevel(), 1);
    });
  });

  test('codex: 日記の並べ替え（拾った順 / 日付）と秘密の落書き', function () {
    withMeta('nosave', function () {
      G.Codex.register('diary', 'diary_24'); // 四十日目
      G.Codex.register('diary', 'diary_03'); // 三日目
      G.Codex.register('diary', 'diary_boss_loop_artisan');
      G.Codex.register('diary', 'diary_30'); // torn
      const found = G.Codex.diaryList({ sort: 'found' }).map(function (d) { return d.id; });
      deepEq(found, ['diary_24', 'diary_03', 'diary_boss_loop_artisan', 'diary_30']);
      const byDay = G.Codex.diaryList({ sort: 'day' }).map(function (d) { return d.id; });
      deepEq(byDay, ['diary_03', 'diary_24', 'diary_boss_loop_artisan', 'diary_30']);
      ok(!G.Codex.secretGraffitiUnlocked());
      G.Texts.diary.forEach(function (d) { G.Codex.register('diary', d.id); });
      ok(G.Codex.secretGraffitiUnlocked(), 'all 30 base fragments → secret graffiti');
    });
  });

  test('codex: 敵の項目は倒すまで切り札を見せない', function () {
    withMeta('nosave', function () {
      let e = G.Codex.enemyEntry('boss_loop_artisan');
      eq(e.seen, false); eq(e.trumps.length, 0);
      G.Codex.register('enemies', 'boss_loop_artisan');
      e = G.Codex.enemyEntry('boss_loop_artisan');
      eq(e.seen, true); eq(e.trumps.length, 3); eq(e.trumps[0].name, 'ぜんまい仕掛けの不死鳥');
      eq(G.Codex.enemyEntry('nobody'), null);
    });
  });

  // ---- achievements ----
  const BOSS = G.EnemyDB.get('boss_loop_artisan');
  const MIRROR = G.EnemyDB.get('boss_mirror_lord');
  function bctx(over) {
    return Object.assign({ type: 'battle', result: { won: true, reason: 'life', stats: {} }, stats: {}, enemyDef: null, game: null, playerIdx: 0 }, over || {});
  }
  test('achievements: 8つ＋深度10、称号は Texts と一致', function () {
    const list = G.Achievements.list();
    eq(list.length, 9);
    list.forEach(function (a) { eq(G.Texts.achievementTitles[a.id], a.title, a.id); ok(a.name && a.description); });
  });
  test('achievements: 百雷・嵐を呼ぶ者・永久機関・封印の主', function () {
    withMeta('nosave', function () {
      deepEq(G.Achievements.evaluate(bctx({ stats: { maxDamageOneTurn: 99 } })), []);
      deepEq(G.Achievements.evaluate(bctx({ stats: { maxDamageOneTurn: 100 } })), ['ach_hundred_damage']);
      deepEq(G.Achievements.evaluate(bctx({ stats: { maxDamageOneTurn: 150 } })), [], 'not awarded twice');
      deepEq(G.Achievements.evaluate(bctx({ stats: { maxChain: 50 } })), ['ach_chain_50']);
      deepEq(G.Achievements.evaluate(bctx({ result: { won: false, reason: 'loopInfinite' } })), [], 'loss does not count');
      deepEq(G.Achievements.evaluate(bctx({ result: { won: true, reason: 'loopInfinite' } })), ['ach_infinite_loop']);
      deepEq(G.Achievements.evaluate(bctx({ result: { won: true, reason: 'seals' } })), [], 'special win vs non-boss');
      deepEq(G.Achievements.evaluate(bctx({ result: { won: true, reason: 'seals' }, enemyDef: BOSS })), ['ach_special_win_boss']);
      eq(G.Achievements.unlocked().length, 4);
      deepEq(G.Achievements.titles(), ['百雷', '嵐を呼ぶ者', '永久機関', '封印の主']);
      ok(G.Achievements.isUnlocked('ach_chain_50'));
      ok(!G.Achievements.award('ach_nope'));
    });
  });
  test('achievements: 鏡返し（ボスのターン中に invertEffects で決着）', async function () {
    await withMeta('nosave', async function () {
      const g = await T.sandbox({ p0: { hand: [] }, p1: { hand: [] } });
      g.active = 1; g.winner = 0; g.winReason = 'life';
      deepEq(G.Achievements.evaluate(bctx({ game: g, enemyDef: BOSS })), [], 'no mirror → nothing');
      g.setStatus(1, 'invertEffects', true);
      deepEq(G.Achievements.evaluate(bctx({ game: g, enemyDef: BOSS })), ['ach_mirror_return']);
      G.MetaStore.reset();
      g.active = 0;
      deepEq(G.Achievements.evaluate(bctx({ game: g, enemyDef: BOSS })), [], 'win on own turn is not a reflection');
      deepEq(G.Achievements.evaluate(bctx({ stats: { mirrorReturnWin: true }, enemyDef: BOSS })), ['ach_mirror_return'], 'explicit flag');
    });
  });
  test('achievements: 映らぬ者（鏡像の写しが未使用のまま）', async function () {
    await withMeta('nosave', async function () {
      const copyId = G.Data.idByName('鏡像の写し');
      ok(copyId, 'boss5 trump exists');
      const g = await T.sandbox({ p0: { hand: [] }, p1: { deck: [copyId, copyId], hand: ['basic_01'] } });
      g.winner = 0; g.winReason = 'life';
      deepEq(G.Achievements.evaluate(bctx({ game: g, enemyDef: MIRROR })), ['ach_unreflected']);
      G.MetaStore.reset();
      g.players[1].grave.push(g.players[1].deck.pop()); g.players[1].grave[g.players[1].grave.length - 1].zone = 'grave';
      deepEq(G.Achievements.evaluate(bctx({ game: g, enemyDef: MIRROR })), [], 'a used copy blocks it');
      deepEq(G.Achievements.evaluate(bctx({ game: g, enemyDef: BOSS, stats: { mirrorBeatenBeforeReflect: true } })), [], 'only vs 鏡の主');
      deepEq(G.Achievements.evaluate(bctx({ enemyDef: MIRROR, stats: { mirrorBeatenBeforeReflect: true } })), ['ach_unreflected']);
    });
  });
  test('achievements: 託された者（落書きのカードを使って勝つ）', async function () {
    await withMeta('nosave', async function () {
      const g = await T.sandbox({ p0: { hand: ['accel_01'], grave: ['cycle_01'] }, p1: {} });
      g.winner = 0; g.winReason = 'life';
      deepEq(G.Achievements.evaluate(bctx({ game: g, run: { flags: { graffitiReceived: 'accel_01' } } })), [], 'still in hand → not used');
      deepEq(G.Achievements.evaluate(bctx({ game: g, run: { flags: { graffitiReceived: 'cycle_01' } } })), ['ach_entrusted']);
    });
  });
  test('achievements: 禁忌の蒐集家・禁域を越えた者（ラン終了）', function () {
    withMeta('nosave', function () {
      const taboo = G.Data.tabooCards().map(function (d) { return d.id; });
      ok(taboo.length >= 3);
      deepEq(G.Achievements.evaluate({ type: 'run', won: true, deck: taboo.slice(0, 2), depth: 0 }), []);
      deepEq(G.Achievements.evaluate({ type: 'run', won: false, deck: taboo.slice(0, 3), depth: 10 }), [], 'loss');
      deepEq(G.Achievements.evaluate({ type: 'run', won: true, deck: taboo.slice(0, 3).concat(['accel_01']), depth: 10 }), ['ach_taboo_collector', 'ach_depth_10']);
    });
  });
  test('achievements: check は壊れた ctx でも例外を出さない', function () {
    withMeta('nosave', function () {
      deepEq(G.Achievements.evaluate(null), []);
      deepEq(G.Achievements.evaluate({}), []);
      deepEq(G.Achievements.evaluate({ type: 'battle', result: { won: true }, game: { players: null } }), []);
    });
  });

  // ---- records ----
  test('records: 戦闘結果から更新（ベストのみ更新、カード使用は加算）', function () {
    withMeta('nosave', function () {
      const r1 = G.Records.updateFromBattle({ stats: { maxDamageOneTurn: 30, maxChain: 7, longestLoop: 12, cardUse: { accel_01: 2, gen_01: 1 } } });
      deepEq(r1.changed, ['maxDamageOneTurn', 'maxChain', 'longestLoop', 'cardUse']);
      const r2 = G.Records.updateFromBattle({ stats: { maxDamageOneTurn: 10, maxChain: 9, longestLoop: 3, cardUse: { accel_01: 1 } } });
      deepEq(r2.changed, ['maxChain', 'cardUse']);
      const rec = G.Records.get();
      eq(rec.maxDamageOneTurn, 30); eq(rec.maxChain, 9); eq(rec.longestLoop, 12);
      eq(rec.cardUse.accel_01, 3); eq(rec.lineageUse.accel, 3); eq(rec.lineageUse.generic, undefined, 'generic not counted as a lineage');
      eq(G.Records.topCards(1)[0].defId, 'accel_01');
      eq(G.Records.topLineage().lineage, 'accel');
      ok(G.Records.noteDepthCleared(2)); ok(!G.Records.noteDepthCleared(1)); eq(G.Records.get().maxDepth, 2);
      const sum = G.Records.summary();
      eq(sum.length, 6); eq(sum[0].value, 30); eq(sum[4].value, '加速'); eq(sum[5].value, G.CardDB.get('accel_01').name);
    });
  });
  test('records: attachGame で1ターン最大ダメージとカード使用を追跡', async function () {
    await withMeta('nosave', async function () {
      const g = await T.sandbox({ p0: { hand: ['accel_01', 'accel_01'], mana: 10 }, p1: { hand: [] } });
      ok(G.Records.attachGame(g, 0));
      ok(G.Records.attachGame(g, 0), 'idempotent');
      const ctx = g.makeCtx(0, null);
      await ctx.damage(g.players[1], 7); await ctx.damage(g.players[1], 5);
      await g.playCard(0, g.players[0].hand[0].uid);
      eq(g.stats.maxDamageOneTurn, 12);
      eq(g.stats.cardUse[0].accel_01, 1);
      const b = G.Records.battleStats({ stats: {} }, { game: g });
      eq(b.maxDamageOneTurn, 12); eq(b.cardUse.accel_01, 1);
      // enemy damage must not count
      await ctx.damage(g.players[0], 40);
      eq(g.stats.maxDamageOneTurn, 12);
    });
  });
  test('records: 未接続のゲームはログから1ターン最大ダメージを復元', async function () {
    await withMeta('nosave', async function () {
      const g = await T.sandbox({ p0: { hand: [] }, p1: { hand: [] } });
      const ctx = g.makeCtx(0, null);
      await ctx.damage(g.players[1], 4); await ctx.damage(g.players[1], 6);
      const b = G.Records.battleStats({ stats: {} }, { game: g });
      eq(b.maxDamageOneTurn, 10);
    });
  });

  // ---- festival ----
  test('festival: 同じ日付 → 同じ種・同じルール、違う日付 → 違う種', function () {
    const a = G.Festival.today(new Date(2026, 10, 9)), b = G.Festival.today(new Date(2026, 10, 9, 23, 59));
    eq(a.id, 'daily:2026-11-09'); eq(a.seed, b.seed); deepEq(a.rules, b.rules); eq(a.name, b.name);
    const c = G.Festival.today(new Date(2026, 10, 10));
    ok(c.seed !== a.seed);
    eq(a.ruleList.length, 1);
    eq(G.Festival.forId(a.id).seed, a.seed);
    eq(G.Festival.forId('nonsense'), null);
    // rules object always has all 5 keys
    deepEq(Object.keys(a.rules).sort(), ['allChaosPacks', 'allCostZero', 'doubleLife', 'startTaboo', 'twoFields']);
    // the picked rule is consistent with the name/description
    ok(a.description.indexOf(G.Festival.RULES[a.ruleList[0].key].description) >= 0);
  });
  test('festival: 週替わりは ISO 週で固定、ルール2つ', function () {
    const mon = G.Festival.thisWeek(new Date(2026, 10, 9)), sun = G.Festival.thisWeek(new Date(2026, 10, 15));
    eq(mon.id, 'weekly:2026-W46'); eq(mon.seed, sun.seed); deepEq(mon.rules, sun.rules);
    eq(mon.ruleList.length, 2); ok(mon.ruleList[0].key !== mon.ruleList[1].key);
    ok(G.Festival.thisWeek(new Date(2026, 10, 16)).seed !== mon.seed);
    eq(G.Festival.weekKeyOf(new Date(2027, 0, 1)), '2026-W53', 'ISO week year boundary');
  });
  test('festival: 全ての日替わりが5ルールのどれかを選ぶ（分布確認）', function () {
    const seen = {};
    for (let i = 0; i < 60; i++) { const f = G.Festival.today(new Date(2026, 0, 1 + i)); seen[f.ruleList[0].key] = true; }
    eq(Object.keys(seen).length, 5, 'every rule shows up within 60 days');
  });
  test('festival: applyToGame（コスト0・ライフ2倍とダメージ2倍・フィールド固定）', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_14'], mana: 0, life: 40 }, p1: { hand: [], life: 30 } });
    const applied = G.Festival.applyToGame(g, { allCostZero: true, doubleLife: true, twoFields: true });
    deepEq(applied, ['allCostZero', 'doubleLife', 'twoFields']);
    eq(g.players[0].life, 80); eq(g.players[1].life, 60);
    eq(g.costOf(0, g.players[0].hand[0]), 0, 'allCostsZero');
    const ctx = g.makeCtx(0, null);
    await ctx.damage(g.players[1], 5);
    eq(g.players[1].life, 50, 'damage doubled once');
    ok(G.RelicDB.get(G.Festival.DOUBLE_RELIC).hidden);
    // field lock: second field goes to grave, first stays
    const f1 = G.CardDB.pool(function (d) { return d.type === 'field'; });
    ok(f1.length >= 2);
    const i1 = g.addCard ? null : null; // sandbox has no helper; use ctx.addToHand then play
    const c1 = await ctx.addToHand(f1[0].id, g.players[0]);
    const c2 = await ctx.addToHand(f1[1].id, g.players[0]);
    await g.playCard(0, c1.uid); eq(g.field && g.field.defId, f1[0].id);
    const r = await g.playCard(0, c2.uid);
    ok(r.ok, 'second field is playable');
    eq(g.field.defId, f1[0].id, 'first field kept');
    ok(g.players[0].grave.some(function (c) { return c.defId === f1[1].id; }), 'second field went to the grave');
    void i1;
  });
  test('festival: runOptions / startDeckExtras', function () {
    deepEq(G.Festival.runOptions({ allChaosPacks: true, startTaboo: true }).packsOverride, 'chaos');
    eq(G.Festival.runOptions({}).startTabooCount, 0);
    const extras = G.Festival.startDeckExtras({ startTaboo: true }, new G.RNG(1));
    eq(extras.length, 1); eq(G.CardDB.get(extras[0]).rarity, 'taboo');
    deepEq(G.Festival.startDeckExtras({ startTaboo: false }), []);
  });
  MODES.forEach(function (mode) {
    test('festival[' + mode + ']: ローカル記録（勝ち→ターン少ない順、最大10件）', function () {
      withMeta(mode, function () {
        const f = G.Festival.today(new Date(2026, 10, 9));
        eq(G.Festival.best(f.id), null);
        G.Festival.recordRun({ festival: f, won: false, turns: 12, maxDamageOneTurn: 40, maxChain: 3 });
        G.Festival.recordRun({ festival: f, won: true, turns: 30, maxDamageOneTurn: 10, maxChain: 3 });
        G.Festival.recordRun({ festivalId: f.id, won: true, turns: 20, maxDamageOneTurn: 10, maxChain: 3 });
        const r = G.Festival.records(f.id);
        eq(r.length, 3); eq(r[0].turns, 20); ok(r[0].won); eq(r[2].won, false);
        eq(G.Festival.best(f.id).turns, 20);
        for (let i = 0; i < 12; i++) G.Festival.recordRun({ festival: f, won: false, turns: i, maxDamageOneTurn: i });
        eq(G.Festival.records(f.id).length, 10);
        const all = G.Festival.allRecords();
        eq(all.length, 1); eq(all[0].count, 15); eq(all[0].best.turns, 20);
        eq(G.Festival.recordRun({ festivalId: 'bad' }), null);
      });
    });
  });

  // ---- G.Meta hooks ----
  MODES.forEach(function (mode) {
    test('meta[' + mode + ']: 一連のフックが例外なく動き、図鑑・記録・解放を更新する', function () {
      withMeta(mode, function () {
        const taboo = G.Data.tabooCards().map(function (d) { return d.id; });
        const deck = ['accel_01', 'accel_02', 'accel_03', 'cycle_01', 'gen_01'].concat(taboo.slice(0, 3));
        G.Meta.onRunStart({ seed: 1, packs: ['accel'], relic: 'relic_ember', depth: 0 });
        ok(G.Codex.has('relics', 'relic_ember'));
        eq(G.MetaStore.get().runsStarted, 1);
        G.Meta.onCardObtained('accel_01'); G.Meta.onRelicObtained('relic_boss1_enrage'); G.Meta.onRelicObtained(null);
        ok(!G.Codex.has('relics', 'relic_boss1_enrage'), 'hidden relics never enter the codex');
        const d = G.Meta.onDiaryFound('diary_03');
        ok(d.fresh); eq(d.day, 3);
        ok(G.Meta.pickDiary(new G.RNG(1)) !== 'diary_03');
        // battle without game (as the run agent reports it)
        const b = G.Meta.onBattleEnd({ won: true, reason: 'seals', turns: 9, stats: { maxDamageOneTurn: 120, maxChain: 51, longestLoop: 4, won: true, reason: 'seals' } },
          { enemyDef: BOSS, act: 1, run: { deck: deck, flags: {}, stats: { cardUse: { accel_01: 4 } } } });
        ok(b.won); eq(b.diaryId, 'diary_boss_loop_artisan'); ok(b.diaryFresh);
        deepEq(b.newAchievements, ['ach_hundred_damage', 'ach_chain_50', 'ach_special_win_boss']);
        ok(G.Codex.has('enemies', 'boss_loop_artisan')); ok(G.Codex.has('diary', 'diary_boss_loop_artisan'));
        eq(G.Records.get().maxDamageOneTurn, 120);
        eq(G.Records.get().cardUse.accel_01, undefined, 'card use deferred to run end when no game');
        // a loss is also fine
        G.Meta.onBattleEnd({ won: false, reason: 'life', stats: {} }, { enemyDef: G.EnemyDB.all()[0] });
        ok(!G.Codex.has('enemies', G.EnemyDB.all()[0].id), 'losing does not register the enemy');
        // run end
        const r = G.Meta.onRunEnd({ won: true, run: { deck: deck, relics: ['relic_ember', 'relic_boss1_enrage'], depth: 0, stats: { cardUse: { accel_01: 4, gen_01: 1 }, turns: 40, maxDamageOneTurn: 120, maxChain: 51 } } });
        eq(r.lineage, 'accel'); ok(r.depthCleared); eq(r.depthUnlocked, 1);
        deepEq(r.newPacks, ['gold']);
        deepEq(r.newAchievements, ['ach_taboo_collector']);
        const m = G.MetaStore.get();
        eq(m.runsCleared, 1); eq(m.lineageClears.accel, 1); eq(m.maxDepthCleared, 0); eq(m.depth, 1, 'next depth pre-selected');
        deepEq(m.lastRunDeck, deck);
        eq(G.Records.get().cardUse.accel_01, 4); eq(G.Records.get().maxDepth, 0);
        deck.forEach(function (id) { ok(G.Codex.has('cards', id), id + ' in codex'); });
        deepEq(G.Meta.unlockedPacks(), ['gold']);
        const s = G.Meta.summary();
        eq(s.runsCleared, 1); eq(s.depth, 1); eq(s.depthUnlocked, 1); eq(s.achievements, 4); ok(s.festivalToday && s.festivalToday.id);
      });
    });
  });

  test('meta: パック解放（二重系統=3系統クリア、禁忌=深度5クリア）と祭りは深度を進めない', function () {
    withMeta('nosave', function () {
      function clear(deckLin, depth, festival) {
        const deck = G.Data.cardsByLineage ? G.Data.cardsByLineage(deckLin).slice(0, 5).map(function (d) { return d.id; }) : G.CardDB.byLineage(deckLin).slice(0, 5).map(function (d) { return d.id; });
        return G.Meta.onRunEnd({ won: true, run: { deck: deck, depth: depth, festival: festival || null, stats: {} } });
      }
      let r = clear('accel', 0); deepEq(r.newPacks, ['gold']);
      r = clear('cycle', 1); deepEq(r.newPacks, []);
      r = clear('chain', 2); deepEq(r.newPacks, ['dual']);
      r = clear('time', 5); deepEq(r.newPacks, ['taboo']); eq(G.Depth.unlocked(), 6);
      r = clear('doom', 9, G.Festival.today()); ok(!r.depthCleared); eq(G.Depth.unlocked(), 6, 'festival clear does not unlock depth');
      ok(r.festivalEntry && r.festivalEntry.won);
      eq(G.Festival.allRecords().length, 1);
      deepEq(G.Meta.unlockedPacks(), ['gold', 'dual', 'taboo']);
      eq(G.Meta.runLineage([]), null);
      eq(G.Meta.runLineage(['gen_01', 'gen_02']), null, 'generic-only deck has no lineage');
    });
  });

  test('meta: 壊れた入力でも例外を出さない', function () {
    withMeta('nosave', function () {
      G.Meta.onRunStart(); G.Meta.onRunStart(null);
      G.Meta.onBattleStart(null); G.Meta.onBattleStart({});
      deepEq(G.Meta.onBattleEnd(null).newAchievements, []);
      G.Meta.onBattleEnd({}, null); G.Meta.onBattleEnd({ won: true }, { enemyDef: { id: 'ghost', isBoss: true, diary: 'x' } });
      G.Meta.onRunEnd(); G.Meta.onRunEnd({ won: true, run: null }); G.Meta.onRunEnd({ won: true, run: { deck: [{ bogus: 1 }, 'nope'] } });
      G.Meta.onDiaryFound(); G.Meta.onCardObtained(); G.Meta.onRelicObtained();
      ok(G.Meta.summary());
    });
  });
})(globalThis.G);
