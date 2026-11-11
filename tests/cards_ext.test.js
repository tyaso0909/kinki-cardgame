'use strict';
// tests/cards_ext.test.js — 2026-11 追加カード45枚と新キーワード（加護・不可侵・連撃・貫通）。
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const DB = G.CardDB;

  function byDef(arr, id) { return arr.find(function (c) { return c.defId === id; }); }
  async function play(g, i, defId, choices) {
    const p = g.players[i];
    const c = byDef(p.hand, defId);
    ok(c, 'card ' + defId + ' in hand');
    const r = await g.playCard(i, c.uid, { choices: choices || {} });
    ok(r.ok, 'play ' + defId + ' failed: ' + r.reason);
    return r;
  }
  // a plain 2/3 test monster (no effects)
  if (!DB.has('tx_vanilla')) DB.register({ id: 'tx_vanilla', name: 'テスト用の兵士', type: 'monster', lineage: 'generic', role: 'fuel', rarity: 'common', cost: 1, atk: 2, hp: 3, text: '2/3', effects: {} });
  const filler = function (n, id) { return new Array(n).fill(id || 'basic_01'); };
  const ready = function (id, extra) { return Object.assign({ id: id, summonedTurn: 0, attacksLeft: 1 }, extra || {}); };
  const mon = function (g, i, id) { return byDef(g.monstersOf(i), id); };

  const IDS = {
    monsters: ['accel_26', 'accel_27', 'accel_28', 'cycle_26', 'cycle_27', 'copy_26', 'copy_27', 'chain_26', 'chain_27', 'time_26', 'time_27', 'doom_26', 'doom_27', 'doom_28', 'gen_31', 'gen_32', 'gen_33'],
    buffs: ['gen_34', 'gen_35', 'accel_29', 'chain_28', 'copy_28', 'cycle_28', 'time_28', 'doom_30', 'gen_40'],
    debuffs: ['gen_36', 'gen_37', 'gen_38', 'time_29', 'chain_29', 'doom_29', 'copy_29', 'gen_39'],
    mana: ['accel_30', 'accel_31', 'accel_32', 'accel_33', 'cycle_29', 'time_30', 'chain_30', 'doom_31', 'copy_30', 'gen_41', 'gen_42']
  };

  test('ext: 45 cards registered, in the pack pool, names unique', function () {
    const all = [].concat(IDS.monsters, IDS.buffs, IDS.debuffs, IDS.mana);
    eq(all.length, 45);
    const pool = G.Data.poolForPacks().map(function (d) { return d.id; });
    all.forEach(function (id) { ok(DB.has(id), id); ok(pool.indexOf(id) >= 0, id + ' in pool'); ok(G.Data.isProjectCard(DB.get(id)), id + ' project card'); });
    IDS.monsters.forEach(function (id) { eq(DB.get(id).type, 'monster', id); });
    ok(G.Data.validateAll().ok, 'validateAll');
  });

  // ---------------------------------------------------------------- keywords
  test('keyword 加護: opponent effects cannot choose it; own effects can; global effects still hit', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_36', 'gen_37', 'gen_34'], board: ['gen_32', 'tx_vanilla'], deck: filler(3) }, p1: { board: ['gen_31', 'tx_vanilla'], deck: filler(3) } });
    const ctx = g.makeCtx(0, null);
    const enemyCands = ctx.candidatesFor({ kind: 'monster', side: 'enemy' }).map(function (c) { return c.defId; });
    ok(enemyCands.indexOf('gen_31') < 0, 'warded enemy not a candidate');
    ok(enemyCands.indexOf('tx_vanilla') >= 0);
    ok(ctx.candidatesFor({ kind: 'monster', side: 'ally' }).some(function (c) { return c.defId === 'gen_32'; }), 'own warded monster can be chosen by own effects');
    // a stale/forged target uid is dropped at resolve time
    const giant = mon(g, 1, 'gen_31');
    await play(g, 0, 'gen_36', { targets: [giant.uid] });
    eq(g.atkOf(giant), 9, 'warded: debuff fizzles');
    await play(g, 0, 'gen_37'); // all enemies -1/-1 (not targeted)
    eq(g.atkOf(giant), 8, 'global debuff still applies');
    await play(g, 0, 'gen_34', { targets: [mon(g, 0, 'gen_32').uid] });
    eq(g.atkOf(mon(g, 0, 'gen_32')), 7, 'own warded monster buffed');
  });

  test('keyword 不可侵: cannot be attacked, never acts as guard', async function () {
    const g = await T.sandbox({ p0: { board: [ready('tx_vanilla')], deck: filler(3) }, p1: { board: ['gen_31'], deck: filler(3) } });
    const giant = mon(g, 1, 'gen_31');
    const tg = g.getAttackers(0)[0].targets;
    ok(tg.indexOf(giant.uid) < 0, 'untouchable not a target');
    ok(tg.indexOf('face') >= 0, 'face open');
    const g2 = await T.sandbox({ p0: { board: [ready('tx_vanilla')], deck: filler(3) }, p1: { board: ['gen_31', 'cycle_27'], deck: filler(3) } });
    const tg2 = g2.getAttackers(0)[0].targets;
    eq(tg2.length, 1, 'only the guard'); eq(tg2[0], mon(g2, 1, 'cycle_27').uid);
  });

  test('keyword 連撃: two attacks per turn, refreshed each turn', async function () {
    const g = await T.sandbox({ p0: { board: [ready('copy_27', { attacksLeft: 2 })], deck: filler(5) }, p1: { deck: filler(5) } });
    const k = mon(g, 0, 'copy_27');
    await g.attack(0, k.uid, 'face'); await g.attack(0, k.uid, 'face');
    eq(g.players[1].life, 32); ok(!g.canAttackWith(0, k));
    await g.endTurn(0); await g.endTurn(1);
    eq(k.attacksLeft, 2, 'refreshed to 2');
  });

  test('keyword 貫通: excess damage goes to the player', async function () {
    const g = await T.sandbox({ p0: { board: [ready('accel_28')], deck: filler(3) }, p1: { board: [{ id: 'tx_vanilla', hp: 2 }], deck: filler(3) } });
    const t = g.players[1].board[0];
    await g.attack(0, mon(g, 0, 'accel_28').uid, t.uid);
    ok(!g.isInPlay(t)); eq(g.players[1].life, 40 - 3, '5 atk − 2 hp = 3 through');
  });

  // ---------------------------------------------------------------- monsters
  test('暁焔の竜王: refills mana to max (counts as gained mana)', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_26'], mana: 9, maxMana: 9, deck: filler(3) } });
    const before = g.players[0].manaGainedThisTurn;
    await play(g, 0, 'accel_26');
    eq(g.players[0].mana, 9); eq(g.players[0].manaGainedThisTurn - before, 7);
    ok(g.canAttackWith(0, mon(g, 0, 'accel_26')), 'rush');
  });

  test('溶岩の巨竜 / 灼熱の竜騎兵', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_27', 'accel_14', 'accel_28'], mana: 20, deck: filler(3) } });
    const drake = byDef(g.players[0].hand, 'accel_14');
    const c0 = g.costOf(0, drake);
    await play(g, 0, 'accel_27');
    eq(g.costOf(0, drake), c0 - 2);
    const m = g.players[0].mana;
    await play(g, 0, 'accel_28');
    eq(g.players[0].mana, m - 5 + 2);
  });

  test('深淵の大海蛇: draws to 7, hand limit +3', async function () {
    const g = await T.sandbox({ p0: { hand: ['cycle_26', 'basic_01'], mana: 10, deck: filler(12) }, p1: { deck: filler(3) } });
    await play(g, 0, 'cycle_26');
    eq(g.players[0].hand.length, 7);
    eq(g.status(0, 'handLimitDelta'), 3);
    g.players[0].hand.push.apply(g.players[0].hand, []); // keep 7
    await g.endTurn(0);
    eq(g.players[0].hand.length, 7, 'no discard down to 6');
  });

  test('写本の巨像: +1 atk per draw (permanent)', async function () {
    const g = await T.sandbox({ p0: { board: ['cycle_27'], deck: filler(5) } });
    await g.makeCtx(0, null).draw(3);
    eq(g.atkOf(mon(g, 0, 'cycle_27')), 7);
  });

  test('百鬼夜行の主: a phantom of each of my monsters (incl. phantoms)', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_26'], board: ['tx_vanilla', 'tx_vanilla'], phantoms: ['tx_vanilla'], mana: 10, deck: filler(3) } });
    await play(g, 0, 'copy_26');
    eq(g.players[0].board.length, 3); eq(g.players[0].phantoms.length, 1 + 4);
  });

  test('鏡像の騎士: 連撃 and a phantom that also has 連撃', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_27'], mana: 10, deck: filler(3) } });
    await play(g, 0, 'copy_27');
    const ph = g.players[0].phantoms[0];
    ok(ph && ph.keywords.indexOf('double') >= 0); eq(ph.attacksLeft, 2);
  });

  test('天穿つ雷霆竜: cost −chain; rush + double', async function () {
    const g = await T.sandbox({ p0: { hand: ['chain_26'], mana: 0, maxMana: 0, deck: filler(3) } });
    g.players[0].chain = 8;
    const d = byDef(g.players[0].hand, 'chain_26');
    eq(g.costOf(0, d), 0);
    await play(g, 0, 'chain_26');
    const m = mon(g, 0, 'chain_26');
    await g.attack(0, m.uid, 'face'); await g.attack(0, m.uid, 'face');
    eq(g.players[1].life, 40 - 16);
  });

  test('迅雷の獅子: +1 atk per card played this turn, until end of turn', async function () {
    const g = await T.sandbox({ p0: { board: [ready('chain_27')], hand: ['chain_05', 'chain_05'], mana: 10, deck: filler(5) }, p1: { deck: filler(5) } });
    await play(g, 0, 'chain_05'); await play(g, 0, 'chain_05');
    const l = mon(g, 0, 'chain_27');
    eq(g.atkOf(l), 6);
    await g.endTurn(0);
    eq(g.atkOf(l), 4, 'expired');
  });

  test('終わらぬ刻の巨人: extra turn', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_26'], mana: 10, deck: filler(5) }, p1: { deck: filler(5) } });
    await play(g, 0, 'time_26');
    await g.endTurn(0);
    eq(g.active, 0, 'extra turn');
  });

  test('停滞の番人: opponent timed counts +2', async function () {
    const g = await T.sandbox({ p0: { hand: ['time_27'], mana: 10, deck: filler(3) }, p1: { timed: [{ id: 'time_07', count: 1 }], deck: filler(3) } });
    await play(g, 0, 'time_27');
    eq(g.players[1].timed[0].timedCount, 3);
  });

  test('骸の黒竜: exiles grave monsters, +N/+N and curse N', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_26'], grave: ['tx_vanilla', 'tx_vanilla', 'tx_vanilla', 'gen_05'], mana: 10, deck: filler(3) } });
    await play(g, 0, 'doom_26');
    const d = mon(g, 0, 'doom_26');
    eq(g.atkOf(d), 10); eq(g.hpOf(d), 10); eq(g.players[1].curse, 3);
    eq(g.players[0].grave.filter(function (c) { return DB.get(c.defId).type === 'monster'; }).length, 0);
    eq(g.players[0].exile.length, 3);
  });

  test('終焉を告げる騎士: on death destroys an enemy monster', async function () {
    const g = await T.sandbox({ p0: { board: ['doom_27'], deck: filler(3) }, p1: { board: ['tx_vanilla'], deck: filler(3) } });
    await g.makeCtx(0, null).destroy(mon(g, 0, 'doom_27'));
    eq(g.players[1].board.length, 0);
  });

  test('封印の巨像: tutors two keys of different kinds', async function () {
    const g = await T.sandbox({ p0: { hand: ['doom_28'], mana: 10, deck: ['doom_05', 'doom_05', 'doom_06', 'basic_01'] } });
    await play(g, 0, 'doom_28');
    const keys = g.players[0].hand.map(function (c) { return DB.get(c.defId).key; }).filter(Boolean);
    eq(keys.length, 2); ok(keys[0] !== keys[1], 'different kinds');
  });

  test('呪文喰らいの魔獣: +2 atk per opponent spell', async function () {
    const g = await T.sandbox({ first: 1, p0: { board: ['gen_32'], deck: filler(3) }, p1: { hand: ['gen_36', 'chain_05'], mana: 10, deck: filler(3) } });
    await play(g, 1, 'chain_05');
    eq(g.atkOf(mon(g, 0, 'gen_32')), 6);
    ok(!g.makeCtx(1, null).candidatesFor({ kind: 'monster', side: 'enemy' }).length, 'ward');
  });

  test('終末の獣: destroys every other monster', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_33'], board: ['tx_vanilla'], phantoms: ['tx_vanilla'], mana: 10, deck: filler(3) }, p1: { board: ['gen_31', 'tx_vanilla'], deck: filler(3) } });
    await play(g, 0, 'gen_33');
    eq(g.monstersOf(0).length, 1); eq(g.monstersOf(1).length, 0, 'even 加護・不可侵 dies to a global effect');
  });

  // ---------------------------------------------------------------- buffs
  test('buffs: 戦の雄叫び / 鼓舞の角笛 / 竜血の儀 / 雷纏い / 死者の力 / 巨人化の秘薬', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_34', 'gen_35', 'accel_29', 'chain_28', 'doom_30', 'gen_40'], board: ['tx_vanilla'], phantoms: ['tx_vanilla'], grave: ['tx_vanilla', 'tx_vanilla'], mana: 30, deck: filler(5) }, p1: { deck: filler(5) } });
    const m = g.players[0].board[0], a0 = g.atkOf(m), h0 = g.maxHpOf(m);
    await play(g, 0, 'gen_34', { targets: [m.uid] });
    eq(g.atkOf(m), a0 + 3); eq(g.maxHpOf(m), h0 + 3);
    await play(g, 0, 'gen_35');
    eq(g.atkOf(m), a0 + 4); eq(g.atkOf(g.players[0].phantoms[0]), a0 + 1);
    await play(g, 0, 'accel_29', { targets: [m.uid], x: 4 });
    eq(g.atkOf(m), a0 + 8);
    const chain = g.players[0].chain;
    await play(g, 0, 'chain_28', { targets: [m.uid] });
    ok(g.atkOf(m) >= a0 + 8 + chain, '雷纏い adds the chain');
    const beforeDead = g.atkOf(m);
    await play(g, 0, 'doom_30', { targets: [m.uid] });
    eq(g.atkOf(m), beforeDead + 2);
    const at = g.atkOf(m), hp = g.maxHpOf(m);
    await play(g, 0, 'gen_40', { targets: [m.uid] });
    eq(g.atkOf(m), at * 2); eq(g.maxHpOf(m), hp * 2);
    await g.endTurn(0);
    ok(g.atkOf(m) < at * 2, '雷纏い part expired');
  });

  test('buffs: 鏡の軍旗 (phantoms +2/+2), 知識は力 (atk per hand card), 時の加護 (timed)', async function () {
    const g = await T.sandbox({ p0: { crests: ['copy_28'], phantoms: ['tx_vanilla'], board: ['tx_vanilla'], hand: ['basic_01', 'basic_01', 'time_28'], mana: 10, deck: filler(6) }, p1: { deck: filler(6) } });
    const ph = g.players[0].phantoms[0], b = g.players[0].board[0];
    eq(g.atkOf(ph), g.atkOf(b) + 2);
    await play(g, 0, 'time_28');
    eq(g.players[0].timed.length, 1);
    const g2 = await T.sandbox({ p0: { crests: ['cycle_28'], board: ['tx_vanilla'], hand: ['basic_01', 'basic_01', 'basic_01'], deck: filler(3) } });
    const base = DB.get('tx_vanilla').atk;
    eq(g2.atkOf(g2.players[0].board[0]), base + 3);
    await g.endTurn(0); await g.endTurn(1); await g.endTurn(0); await g.endTurn(1);
    eq(g.players[0].timed.length, 0, 'fired');
    ok(g.atkOf(b) >= DB.get('tx_vanilla').atk + 3, '+3 from 時の加護');
  });

  // ---------------------------------------------------------------- debuffs
  test('debuffs: 脱力の呪い / 衰弱の霧 / 縮小の呪文 / 刻の剥落 / 入れ替えの鏡', async function () {
    const g = await T.sandbox({ p0: { hand: ['gen_36', 'gen_37', 'gen_38', 'time_29', 'copy_29'], mana: 20, deck: filler(5) }, p1: { board: ['gen_33', 'cycle_27', 'doom_28', { id: 'tx_vanilla', hp: 1 }], deck: filler(5) } });
    const beast = mon(g, 1, 'gen_33'), col = mon(g, 1, 'cycle_27'), sealc = mon(g, 1, 'doom_28');
    await play(g, 0, 'gen_36', { targets: [beast.uid] });
    eq(g.atkOf(beast), 10); eq(g.maxHpOf(beast), 10);
    await play(g, 0, 'gen_37');
    eq(g.atkOf(beast), 9); eq(g.players[1].board.length, 3, '1-hp monster died');
    await play(g, 0, 'gen_38', { targets: [beast.uid] });
    eq(g.atkOf(beast), 1); eq(g.hpOf(beast), 1);
    g.makeCtx(1, null).buff(col, { atk: 5, hp: 5 });
    await play(g, 0, 'time_29', { targets: [col.uid] });
    eq(g.atkOf(col), 4 - 2); eq(g.maxHpOf(col), 8 - 2);
    await play(g, 0, 'copy_29', { targets: [sealc.uid] });
    eq(g.atkOf(sealc), 9); eq(g.hpOf(sealc), 5);
  });

  test('debuffs: 帯電の網 (per card, until end of turn), 呪詛の重み, 重力の谷', async function () {
    const g = await T.sandbox({ p0: { crests: ['chain_29', 'doom_29'], hand: ['chain_05', 'chain_05'], mana: 10, deck: filler(5) }, p1: { board: ['cycle_27', { id: 'tx_vanilla', hp: 2 }], curse: 9, deck: filler(5) } });
    const col = mon(g, 1, 'cycle_27');
    eq(g.atkOf(col), 3, '呪詛9 → -1/-1'); eq(g.maxHpOf(col), 7);
    await play(g, 0, 'chain_05');
    eq(g.atkOf(col), 2);
    await g.makeCtx(0, null).addCurse(g.players[1], 1); // 10 curse → -2/-2
    await play(g, 0, 'chain_05');
    eq(g.atkOf(col), 0); eq(g.maxHpOf(col), 6);
    eq(g.players[1].board.length, 1, '2-hp monster swept at 呪詛10');
    await g.endTurn(0);
    eq(g.atkOf(col), 3, '帯電の網 expired (4 − 2 for 呪詛10, +1: 写本の巨像 itself grew when P1 drew)');
    const g2 = await T.sandbox({ field: 'gen_39', p0: { board: ['cycle_27'], deck: filler(3) }, p1: { board: ['cycle_27'], deck: filler(3) } });
    eq(g2.atkOf(g2.players[0].board[0]), 2); eq(g2.atkOf(g2.players[1].board[0]), 2);
  });

  // ---------------------------------------------------------------- max mana
  test('max mana: 魔力の種 / 炉心の見習い / 天井知らず (no cap) / 命の器 / 写し取りの杯 / 魔脈断ち / 雷の器', async function () {
    const g = await T.sandbox({ p0: { hand: ['accel_30', 'accel_31', 'accel_33', 'doom_31', 'copy_30', 'gen_41', 'chain_30', 'accel_33'], mana: 50, maxMana: 10, deck: filler(5) }, p1: { maxMana: 30, deck: filler(5) } });
    const p = g.players[0];
    await play(g, 0, 'accel_30'); eq(p.maxMana, 11);
    await play(g, 0, 'accel_31'); eq(p.maxMana, 12);
    await play(g, 0, 'copy_30'); eq(p.maxMana, 30);
    await play(g, 0, 'accel_33'); eq(p.maxMana, 60);
    await play(g, 0, 'accel_33'); eq(p.maxMana, 120, 'no cap');
    await play(g, 0, 'doom_31'); eq(p.maxMana, 122); eq(p.life, 35);
    await play(g, 0, 'gen_41'); eq(g.players[1].maxMana, 28);
    p.chain = 3;
    await play(g, 0, 'chain_30'); eq(p.maxMana, 122, 'chain < 10');
  });

  test('max mana: 竜脈の紋章 (+1 per turn), 未来の器 (timed +3), 知識の器 (discard N → +N), マナの巨人 (X = max mana)', async function () {
    const g = await T.sandbox({ p0: { crests: ['accel_32'], hand: ['time_30', 'cycle_29', 'basic_01', 'basic_01', 'basic_01'], board: ['gen_42'], mana: 10, maxMana: 5, deck: filler(8) }, p1: { deck: filler(8) } });
    const p = g.players[0];
    const giant = mon(g, 0, 'gen_42');
    eq(g.atkOf(giant), 5); eq(g.hpOf(giant), 5);
    await play(g, 0, 'time_30');
    await play(g, 0, 'cycle_29', { targets: [] });
    // default chooser for an up-to pick: count how many were discarded
    const discarded = 3 - p.hand.filter(function (c) { return c.defId === 'basic_01'; }).length;
    eq(p.maxMana, 5 + discarded);
    const mm = p.maxMana;
    await g.endTurn(0); await g.endTurn(1);
    eq(p.maxMana, mm + 2, '竜脈の紋章: +1 +1');
    await g.endTurn(0); await g.endTurn(1);
    eq(p.maxMana, mm + 4 + 3, '未来の器 fired (+3)');
    eq(g.atkOf(giant), p.maxMana, 'giant tracks max mana');
  });
})(globalThis.G = globalThis.G || {});
