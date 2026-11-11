'use strict';
// tests/cards_copy.test.js — 複製系統 copy_01..25 smoke + targeted + combo tests.
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const DB = G.CardDB;

  function byDef(arr, id) { return arr.find(function (c) { return c.defId === id; }); }
  function reg(def) { if (!DB.has(def.id)) DB.register(def); return def; }
  async function play(g, i, defId, choices) {
    const p = g.players[i];
    const c = byDef(p.hand, defId) || byDef(p.grave, defId);
    ok(c, 'card ' + defId + ' available');
    const r = await g.playCard(i, c.uid, { choices: choices });
    ok(r.ok, 'play ' + defId + ' failed: ' + r.reason);
    return r;
  }
  async function altar(g, targetUid) {
    const ab = g.getAbilities(0).find(function (a) { return a.defId === 'accel_13'; });
    ok(ab, 'altar ability available');
    const r = await g.useAbility(0, ab.uid, [targetUid]);
    ok(r.ok, 'altar failed: ' + r.reason);
  }
  const filler = function (n, id) { return new Array(n).fill(id || 'copy_02'); };

  test('copy: all 25 cards registered with SPEC names/costs/rarities', function () {
    const spec = [
      ['鏡写しの小鬼', 1, 'common', 'monster'], ['霧の双子', 2, 'common', 'monster'], ['影の群狼', 3, 'common', 'monster'],
      ['映し身の道化', 2, 'common', 'monster'], ['写し身の儀', 1, 'common', 'spell'], ['幻灯の呪文', 0, 'common', 'spell'],
      ['多重詠唱', 2, 'common', 'spell'], ['鏡の破片', 0, 'common', 'spell'], ['幻の盾', 1, 'common', 'spell'],
      ['盗み見の鏡', 1, 'common', 'spell'], ['偽りの約束', 2, 'common', 'spell'], ['万華鏡の紋章', 2, 'common', 'crest'],
      ['消えない残像', 1, 'common', 'crest'], ['双面の魔導士', 4, 'rare', 'monster'], ['千の顔の怪盗', 3, 'rare', 'monster'],
      ['分裂する粘体', 2, 'rare', 'monster'], ['鏡の湖', 3, 'rare', 'field'], ['幻影増殖', 3, 'rare', 'spell'],
      ['幻影の総攻撃', 2, 'rare', 'spell'], ['無限回廊', 3, 'rare', 'crest'], ['鏡界の女王', 5, 'legend', 'monster'],
      ['複写の大魔典', 2, 'legend', 'spell'], ['万象を映す魔神', 8, 'legend', 'monster'], ['盗まれた奇跡', 3, 'legend', 'spell'],
      ['鏡合わせの世界', 6, 'taboo', 'crest']
    ];
    spec.forEach(function (s, i) {
      const id = 'copy_' + String(i + 1).padStart(2, '0');
      const d = DB.get(id);
      eq(d.name, s[0], id); eq(d.cost, s[1], id + ' cost'); eq(d.rarity, s[2], id + ' rarity'); eq(d.type, s[3], id + ' type');
      eq(d.lineage, 'copy'); ok(d.text.length > 0, id + ' text');
    });
    ok(DB.get('copy_11').reserve); ok(DB.get('copy_23').keywords.indexOf('rush') >= 0);
  });

  test('copy: smoke — every card can be played without throwing', async function () {
    const ids = DB.filter(function (d) { return d.lineage === 'copy'; }).map(function (d) { return d.id; });
    for (let k = 0; k < ids.length; k++) {
      const id = ids[k];
      const g = await T.sandbox({
        p0: { hand: [id, 'copy_02', 'copy_05'], board: ['copy_02'], phantoms: ['copy_02'], mana: 20, deck: filler(8), grave: ['copy_05', 'copy_19'] },
        p1: { board: ['copy_03'], hand: ['copy_05'], deck: filler(8), grave: ['copy_19', 'copy_06', 'accel_11'] }
      });
      g.players[1].lastSpellDefId = 'copy_19';
      const c = byDef(g.players[0].hand, id);
      const def = DB.get(id);
      const choices = {};
      if (def.targets) {
        const cands = g.makeCtx(0, c).candidatesFor(def.targets).filter(function (t) { return t.uid !== c.uid; });
        ok(cands.length, id + ' has targets'); choices.targets = [cands[0].uid];
      }
      const r = await g.playCard(0, c.uid, { choices: choices });
      ok(r.ok, id + ' play failed: ' + r.reason);
      if (g.winner === null) await g.endTurn(0);
      if (g.winner === null) await g.endTurn(1);
    }
  });

  // ---- targeted -------------------------------------------------------------
  test('鏡写しの小鬼 / 霧の双子 / 幻灯の呪文 / 幻の盾: phantoms (no onSummon, same stats, vanish at end)', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_02', 'copy_01', 'copy_06', 'copy_09'], board: ['copy_03'], mana: 10, deck: filler(3) }, p1: { deck: filler(3) } });
    await play(g, 0, 'copy_02'); eq(g.players[0].phantoms.length, 1); ok(g.players[0].phantoms[0].isPhantom);
    await play(g, 0, 'copy_01'); eq(g.players[0].phantoms.length, 2, 'goblin copies first ally (影の群狼) — no onSummon on phantom');
    eq(g.players[1].life, 40);
    await play(g, 0, 'copy_06', { targets: [g.players[0].board[0].uid] }); eq(g.players[0].phantoms.length, 3);
    await play(g, 0, 'copy_09', { targets: [g.players[0].board[0].uid] });
    eq(g.players[0].phantoms.length, 5);
    const guards = g.players[0].phantoms.filter(function (p) { return p.keywords.indexOf('guard') >= 0; });
    eq(guards.length, 2);
    eq(g.players[0].board.length, 3, 'phantoms do not use board slots');
    await g.endTurn(0);
    eq(g.players[0].phantoms.length, 5, 'still there on the opponent turn');
    await g.endTurn(1);
    eq(g.players[0].phantoms.length, 0, 'vanished at the end of the opponent turn');
  });

  test('影の群狼: damage per own monster incl. phantoms', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_03'], board: ['copy_02'], phantoms: ['copy_02', 'copy_02'], mana: 3 } });
    await play(g, 0, 'copy_03'); eq(g.players[1].life, 36);
  });

  test('映し身の道化: on death replays an ally onSummon', async function () {
    const g = await T.sandbox({ p0: { board: ['copy_04', 'accel_02'], crests: ['accel_13'], mana: 0 } });
    await altar(g, byDef(g.players[0].board, 'copy_04').uid);
    eq(g.players[0].mana, 2, '小妖精 onSummon replayed');
  });

  test('写し身の儀 / 鏡の破片: next spell / next summon fires twice', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_05', 'copy_19', 'copy_08', 'accel_02'], board: ['copy_02'], mana: 10 } });
    await play(g, 0, 'copy_05'); await play(g, 0, 'copy_19');
    eq(g.players[1].life, 34, '3 ×2');
    const m = g.players[0].mana;
    await play(g, 0, 'copy_08'); eq(g.players[0].mana, m + 1);
    await play(g, 0, 'accel_02'); eq(g.players[0].mana, m + 1 - 1 + 4, 'onSummon ×2');
  });

  test('多重詠唱: replays the spell played just before it (with its target)', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_06', 'copy_07', 'copy_07'], board: ['copy_02'], mana: 10 } });
    await play(g, 0, 'copy_06', { targets: [g.players[0].board[0].uid] });
    await play(g, 0, 'copy_07');
    eq(g.players[0].phantoms.length, 2, '幻灯 replayed with re-resolved target');
    await play(g, 0, 'copy_07');
    eq(g.players[0].phantoms.length, 3, 'second 多重詠唱 still replays 幻灯 (skips itself)');
  });

  test('盗み見の鏡: copies the opponent\'s last spell as my own effect', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_10'], mana: 5, deck: filler(3) }, p1: { hand: ['copy_19'], board: ['copy_02', 'copy_03'], mana: 5, deck: filler(3) } });
    await g.endTurn(0);
    g.players[1].mana = 5;
    await play(g, 1, 'copy_19'); eq(g.players[0].life, 34);
    await g.endTurn(1);
    g.players[0].board.push(); // no own monsters → copy deals 0
    const g0 = g.players[0];
    g.addCard(0, 'copy_02', 'board');
    await play(g, 0, 'copy_10');
    eq(g.players[1].life, 37, 'my copy of 総攻撃 counts MY monsters (1 → 3)');
    eq(g0.grave.length, 1, 'only the mirror itself in grave');
    // reserve spell copy becomes my reserve
    const g2 = await T.sandbox({ p0: { hand: ['copy_10'], mana: 5 }, p1: { grave: ['accel_11'] } });
    g2.players[1].lastSpellDefId = 'accel_11';
    await play(g2, 0, 'copy_10');
    eq(g2.players[1].reserves.length, 1, 'copied マナ封鎖 reserved against the opponent');
  });

  test('偽りの約束: opponent\'s first spell next turn resolves for me', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_11'], mana: 5, deck: filler(3) }, p1: { hand: ['accel_21', 'accel_21'], deck: filler(3) } });
    await play(g, 0, 'copy_11');
    await g.endTurn(0);
    ok(g.explicitStatus(1, 'firstSpellStolenBy') === 0, 'status set at opponent turn start');
    const m0 = g.players[0].mana, m1 = g.players[1].mana;
    await play(g, 1, 'accel_21');
    eq(g.players[0].mana, m0 + 5, 'I got the +5'); eq(g.players[1].mana, m1, 'they got nothing');
    await play(g, 1, 'accel_21');
    eq(g.players[1].mana, m1 + 5, 'second spell is theirs');
  });

  test('万華鏡の紋章: +1 mana per phantom during my turn only', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_09'], crests: ['copy_12'], board: ['copy_02'], mana: 1 } });
    await play(g, 0, 'copy_09', { targets: [g.players[0].board[0].uid] });
    eq(g.players[0].mana, 2);
  });

  test('消えない残像: phantoms persist through end of turn', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_02'], crests: ['copy_13'], mana: 2, deck: filler(3) }, p1: { deck: filler(3) } });
    await play(g, 0, 'copy_02');
    await g.endTurn(0); eq(g.players[0].phantoms.length, 1);
  });

  test('双面の魔導士 / 鏡の湖: spells fire twice (lake for both)', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_19'], board: ['copy_14'], mana: 2 } });
    await play(g, 0, 'copy_19'); eq(g.players[1].life, 34);
    const g2 = await T.sandbox({ p0: { hand: ['copy_17', 'basic_01'], mana: 5, deck: filler(3) }, p1: { hand: ['basic_01'], deck: filler(3) } });
    await play(g2, 0, 'copy_17'); eq(g2.players[0].hand.length, 2, 'expand: draw 1');
    await play(g2, 0, 'basic_01'); eq(g2.players[1].life, 34);
    await g2.endTurn(0); g2.players[1].mana = 2;
    await play(g2, 1, 'basic_01'); eq(g2.players[0].life, 34, 'opponent spells also doubled');
  });

  test('千の顔の怪盗: phantom of an enemy monster on my side', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_15'], mana: 3 }, p1: { board: [{ id: 'copy_03', atk: 5, hp: 5 }] } });
    await play(g, 0, 'copy_15');
    eq(g.players[0].phantoms.length, 1); eq(g.players[0].phantoms[0].defId, 'copy_03'); eq(g.players[0].phantoms[0].atk, 5);
  });

  test('分裂する粘体: splits on death, phantoms split too', async function () {
    const g = await T.sandbox({ p0: { board: ['copy_16'], crests: ['accel_13'], mana: 0 } });
    await altar(g, g.players[0].board[0].uid);
    eq(g.players[0].phantoms.length, 2);
    await altar(g, g.players[0].phantoms[0].uid);
    eq(g.players[0].phantoms.length, 3, '2 - 1 + 2');
  });

  test('幻影増殖 / 幻影の総攻撃 / 無限回廊', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_18', 'copy_19'], board: ['copy_02'], phantoms: ['copy_02', 'copy_02', 'copy_02'], mana: 5 } });
    await play(g, 0, 'copy_18'); eq(g.players[0].phantoms.length, 6);
    await play(g, 0, 'copy_19'); eq(g.players[1].life, 40 - 7 * 3);
    const g2 = await T.sandbox({ p0: { hand: ['copy_02'], crests: ['copy_20'], mana: 2 } });
    await play(g2, 0, 'copy_02'); eq(g2.players[0].phantoms.length, 2, 'onSummon twice');
  });

  test('鏡界の女王: phantoms fire onSummon', async function () {
    const pickSprite = T.scriptedChooser([function (spec, cands) { return [cands.find(function (c) { return c.defId === 'accel_02'; })]; }]);
    const g = await T.sandbox({ p0: { hand: ['copy_01'], board: ['copy_21', 'accel_02'], mana: 1, chooser: pickSprite } });
    const m = g.players[0].mana;
    await play(g, 0, 'copy_01'); // phantom of 小妖精 → its onSummon fires under the queen
    eq(g.players[0].phantoms.length, 1); eq(g.players[0].mana, m - 1 + 2);
    // picking the goblin itself cascades (goblin phantom → phantom → …) up to the cap
    const g2 = await T.sandbox({ p0: { hand: ['copy_01'], board: ['copy_21'], mana: 1, chooser: T.lastChooser } });
    await play(g2, 0, 'copy_01'); eq(g2.players[0].phantoms.length, 30);
  });

  test('複写の大魔典: copy of a grave spell + copy of itself; copies are playable', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_22'], grave: ['copy_19'], board: ['copy_02'], mana: 10 } });
    await play(g, 0, 'copy_22');
    eq(g.players[0].hand.length, 2);
    ok(g.players[0].hand.every(function (c) { return c.isCopy; }));
    ok(byDef(g.players[0].hand, 'copy_19')); ok(byDef(g.players[0].hand, 'copy_22'));
    await play(g, 0, 'copy_19'); eq(g.players[1].life, 37);
    eq(g.players[0].grave.length, 2, 'copies do not go to grave (original 総攻撃 + original 大魔典)');
    await play(g, 0, 'copy_22'); eq(g.players[0].hand.length, 2, 'the copied 大魔典 chains again');
  });

  test('万象を映す魔神: stats = monsters×3, rush', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_23'], board: ['copy_02'], phantoms: ['copy_02', 'copy_02'], mana: 8 } });
    await play(g, 0, 'copy_23');
    const d = byDef(g.players[0].board, 'copy_23');
    eq(g.atkOf(d), 12); eq(g.hpOf(d), 12);
    ok(g.getAttackers(0).some(function (a) { return a.uid === d.uid; }));
  });

  test('盗まれた奇跡: copies every spell in opponent grave, chosen order (lastChooser = reverse)', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_24'], board: ['copy_02'], mana: 3, deck: filler(3), chooser: T.lastChooser }, p1: { grave: ['copy_06', 'copy_19', 'copy_01', 'accel_21'] } });
    await play(g, 0, 'copy_24');
    // reverse order: 黄金の水門 (+5), 幻影の総攻撃 (1 monster → 3), 幻灯 (phantom of first ally → now 2 monsters)
    eq(g.players[0].mana, 5); eq(g.players[1].life, 37); eq(g.players[0].phantoms.length, 1);
    eq(g.players[1].grave.length, 4, 'opponent grave untouched'); eq(g.players[0].grave.length, 1, 'copies leave nothing behind');
    const log = g.log.map(function (l) { return l.msg; }).join('\n');
    ok(log.indexOf('黄金の水門のコピー') < log.indexOf('幻影の総攻撃のコピー') && log.indexOf('幻影の総攻撃のコピー') < log.indexOf('幻灯の呪文のコピー'), 'chosen order honored');
  });

  test('鏡合わせの世界: everything fires twice (spell, summon, crest passive)', async function () {
    const g = await T.sandbox({ p0: { hand: ['basic_01', 'accel_02', 'copy_02'], crests: ['copy_25', 'copy_12'], mana: 10 } });
    await play(g, 0, 'basic_01'); eq(g.players[1].life, 34);
    const m = g.players[0].mana;
    await play(g, 0, 'accel_02'); eq(g.players[0].mana, m - 1 + 4);
    const m2 = g.players[0].mana;
    await play(g, 0, 'copy_02');
    eq(g.players[0].phantoms.length, 2, 'summon ×2');
    eq(g.players[0].mana, m2 - 2 + 4, '万華鏡 passive fires ×2 per phantom');
  });

  // ---- recursion regressions (AI vs AI: boss_mirror_lord vs enemy_mirror_troupe) -------------------
  test('回帰: 盗み見の鏡 vs 盗み見の鏡 — mirrors never copy each other (no recursion), skip to a real spell', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_10'], mana: 5, deck: filler(3) }, p1: { hand: ['copy_10'], grave: ['basic_01'], mana: 5, deck: filler(3) } });
    g.players[0].lastSpellDefId = 'copy_10';
    await g.endTurn(0); g.players[1].mana = 5;
    await play(g, 1, 'copy_10'); // opponent mirror: my last spell is a mirror → nothing copyable → no effect, no recursion
    eq(g.players[0].life, 40); eq(g.players[1].life, 40);
    await g.endTurn(1); g.players[0].mana = 5;
    await play(g, 0, 'copy_10'); // my mirror: opponent's last spell is a mirror → skipped → their grave's 火球 is copied instead
    eq(g.players[1].life, 37, 'copied 見習いの火球, not the mirror');
    eq(g.copyDepth, 0, 'depth counter unwinds');
    // 鏡の湖 doubles both mirrors: still terminates
    const g2 = await T.sandbox({ field: 'copy_17', p0: { hand: ['copy_10', 'copy_10'], mana: 5 }, p1: { grave: ['copy_10', 'copy_24', 'copy_07'] } });
    g2.players[1].lastSpellDefId = 'copy_10';
    await play(g2, 0, 'copy_10'); await play(g2, 0, 'copy_10');
    eq(g2.players[0].life, 40); eq(g2.players[1].life, 40);
  });

  test('回帰: 多重詠唱 directly after 多重詠唱 does not re-fire itself', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_07', 'copy_07', 'copy_07'], mana: 10 } });
    await play(g, 0, 'copy_07'); // nothing before it → no-op
    await play(g, 0, 'copy_07'); // previous spell is 多重詠唱 → skipped → no-op
    await play(g, 0, 'copy_07');
    eq(g.players[0].grave.length, 3); eq(g.players[0].mana, 4); eq(g.copyDepth || 0, 0);
    // with 双面の魔導士 (×2) and lastSpellDefId pointing at itself it still terminates
    const g2 = await T.sandbox({ p0: { hand: ['copy_07'], board: ['copy_14'], mana: 10 } });
    g2.players[0].lastSpellDefId = 'copy_07';
    await play(g2, 0, 'copy_07'); eq(g2.players[0].grave.length, 1);
  });

  test('回帰: 盗まれた奇跡 / 複写の大魔典 skip every copier spell', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_24'], mana: 3 }, p1: { grave: ['copy_24', 'copy_10', 'copy_07', 'copy_22', 'copy_11', 'basic_01'] } });
    await play(g, 0, 'copy_24');
    eq(g.players[1].life, 37, 'only the fireball was copied'); eq(g.players[1].reserves.length, 0, '偽りの約束 not copied');
    eq(g.players[0].hand.length, 0, '大魔典 not copied');
    const g2 = await T.sandbox({ p0: { hand: ['copy_22'], grave: ['copy_10', 'copy_24'], mana: 2 } });
    await play(g2, 0, 'copy_22');
    eq(g2.players[0].hand.length, 1, 'no copyable spell → only the self-copy'); eq(g2.players[0].hand[0].defId, 'copy_22');
  });

  test('回帰: copy depth guard stops nested copies at 8', async function () {
    reg({ id: 't_c_selfmirror', name: 'テスト合わせ鏡', type: 'spell', cost: 0, effects: { onPlay: async function (ctx) {
      ctx.me.flags.mirrorCalls = (ctx.me.flags.mirrorCalls || 0) + 1;
      await G.Data.castCopyAsMine(ctx, 't_c_selfmirror', null); // a non-copier spell that copies itself: only the depth guard can stop it
    } } });
    const g = await T.sandbox({ p0: { hand: ['t_c_selfmirror'], mana: 1 } });
    await play(g, 0, 't_c_selfmirror');
    eq(g.players[0].flags.mirrorCalls, 1 + G.Data.COPY_DEPTH_MAX);
    eq(g.copyDepth, 0);
    ok(g.log.some(function (l) { return l.msg.indexOf('鏡が深すぎる') >= 0; }), 'logged');
  });

  // ---- combos --------------------------------------------------------------------
  test('コンボ 女王と双子: phantoms cascade to the 30 cap, 万華鏡 mana, 幻影の総攻撃 = 90+', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_02', 'copy_19'], board: ['copy_21'], crests: ['copy_12'], mana: 4 }, p1: { life: 100 } });
    await play(g, 0, 'copy_02');
    eq(g.players[0].phantoms.length, 30, 'cap');
    eq(g.players[0].mana, 4 - 2 + 30, '30 mana from 万華鏡');
    await play(g, 0, 'copy_19');
    eq(g.players[1].life, 100 - 32 * 3, '30 phantoms + queen + twins = 32 → 96');
    ok(g.winner === 0 || g.players[1].life <= 4);
  });

  test('コンボ 女王と双子 → 万象を映す魔神 90+/90+ rush', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_02', 'copy_23'], board: ['copy_21'], crests: ['copy_12'], mana: 4 }, p1: { life: 200 } });
    await play(g, 0, 'copy_02');
    await play(g, 0, 'copy_23');
    const d = byDef(g.players[0].board, 'copy_23');
    eq(g.atkOf(d), 33 * 3);
    const at = g.getAttackers(0).find(function (a) { return a.uid === d.uid; }); ok(at, 'rush');
    await g.attack(0, d.uid, 'face');
    eq(g.players[1].life, 200 - 99);
  });

  test('コンボ 粘体と祭壇: 2 → 4 → 8 doubling via altar', async function () {
    const g = await T.sandbox({ p0: { board: ['copy_16'], crests: ['accel_13'], mana: 0 } });
    await altar(g, g.players[0].board[0].uid);
    eq(g.players[0].phantoms.length, 2);
    let n = 2;
    for (let round = 0; round < 2; round++) {
      const list = g.players[0].phantoms.slice();
      for (let i = 0; i < list.length; i++) await altar(g, list[i].uid);
      n *= 2;
      eq(g.players[0].phantoms.length, n, 'doubled to ' + n);
    }
  });

  test('コンボ 大魔典と永劫の書: infinite copies of any spell with 永劫 mana engine', async function () {
    const g = await T.sandbox({ p0: { crests: ['cycle_21'], hand: ['copy_22', 'accel_16'], grave: ['accel_21'], mana: 2 }, p1: { life: 100 } });
    await play(g, 0, 'copy_22');
    ok(byDef(g.players[0].hand, 'accel_21'), 'copied 黄金の水門');
    ok(byDef(g.players[0].hand, 'copy_22'), '大魔典 returns to hand via 永劫の書 AND a copy was added');
    eq(g.players[0].hand.filter(function (c) { return c.defId === 'copy_22'; }).length, 2);
    await play(g, 0, 'accel_21'); // copy: +5, vanishes (copies don't return)
    eq(g.players[0].mana, 5);
    // each 大魔典 (2 mana) → +1 水門 copy (+5 mana) → net +3 mana and +1 大魔典 copy: the engine grows without bound
    for (let i = 0; i < 3; i++) { await play(g, 0, 'copy_22'); await play(g, 0, 'accel_21'); }
    eq(g.players[0].mana, 5 + 3 * 3);
    // (a played copy of 大魔典 vanishes while the original returns via 永劫の書; either way one more copy is added)
    ok(g.players[0].hand.filter(function (c) { return c.defId === 'copy_22'; }).length >= 2, 'the 大魔典 chain never runs dry');
  });

  test('コンボ 重ねがけで加速: 鏡の湖 → 魔力奔流 fires twice = ×4; 写し身の儀 same', async function () {
    const g = await T.sandbox({ field: 'copy_17', fieldOwner: 1, p0: { hand: ['accel_16'], mana: 3 } });
    await play(g, 0, 'accel_16'); eq(g.players[0].mana, 12);
    const g2 = await T.sandbox({ p0: { hand: ['copy_05', 'accel_16'], mana: 4 } });
    await play(g2, 0, 'copy_05'); eq(g2.players[0].mana, 3);
    await play(g2, 0, 'accel_16'); eq(g2.players[0].mana, 12);
  });

  test('コンボ 敵のコンボを奪う: 盗まれた奇跡 replays a storm of enemy spells on my side', async function () {
    const g = await T.sandbox({ p0: { hand: ['copy_24'], mana: 3, deck: filler(5) }, p1: { grave: ['basic_01', 'basic_01', 'basic_01', 'accel_06', 'copy_03'], deck: filler(3), life: 40 } });
    await play(g, 0, 'copy_24');
    eq(g.players[1].life, 31, '3 fireballs'); eq(g.players[0].hand.length, 1, '火種 drew'); eq(g.players[0].mana, 1);
  });
})(globalThis.G);
