'use strict';
// tests/meta_texts.test.js — G.Texts pools (SPEC 世界観とテキスト) and G.Depth tables.
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const path = require('path');
  if (!G.Texts) require(path.join(T.root(), 'js/data/texts.js'));
  if (!G.Depth) require(path.join(T.root(), 'js/meta/depth.js'));
  const Tx = G.Texts;

  test('texts: 日記の切れ端は30枚、id は diary_01..30、重複なし', function () {
    eq(Tx.diary.length, 30);
    const ids = Tx.diary.map(function (d) { return d.id; });
    eq(new Set(ids).size, 30, 'unique ids');
    for (let i = 1; i <= 30; i++) ok(ids.indexOf('diary_' + (i < 10 ? '0' + i : i)) >= 0, 'has diary_' + i);
    const texts = Tx.diary.map(function (d) { return d.text; });
    eq(new Set(texts).size, 30, 'unique texts');
    Tx.diary.forEach(function (d) { ok(typeof d.text === 'string' && d.text.length >= 8, d.id + ' has text'); });
  });

  test('texts: SPEC の4例が含まれる', function () {
    const texts = Tx.diary.map(function (d) { return d.text; });
    ['三日目。拾ったカードを使ったら、竜が二匹出た。頼んだのは一匹だ。',
      '十二日目。今日の店主は昨日と顔が違う。品ぞろえは同じ。',
      '四十日目。鏡の向こうの俺が、俺より先に砂時計を使った。',
      'ここに捨てられたのは、カードじゃなくて'].forEach(function (t) { ok(texts.indexOf(t) >= 0, 'SPEC example: ' + t); });
    ok(Tx.shopLines.indexOf('禁忌？ 売るなら買うよ。使うなら止めないよ。') >= 0, 'SPEC shop line');
    ok(Tx.graffiti.indexOf('ここで無限を見た者、手を挙げろ') >= 0, 'SPEC graffiti');
  });

  test('texts: 日付は昇順でユニーク、日付なしは末尾側', function () {
    const dated = Tx.diary.filter(function (d) { return d.day != null; });
    ok(dated.length >= 25, 'most fragments carry a day');
    const days = dated.map(function (d) { return d.day; });
    eq(new Set(days).size, days.length, 'days unique');
    for (let i = 1; i < days.length; i++) ok(days[i] > days[i - 1], 'ascending');
  });

  test('texts: 店主・落書き・ロードの本数と重複なし', function () {
    ok(Tx.shopLines.length >= 12, 'shopLines >= 12'); eq(new Set(Tx.shopLines).size, Tx.shopLines.length);
    ok(Tx.graffiti.length >= 15, 'graffiti >= 15'); eq(new Set(Tx.graffiti).size, Tx.graffiti.length);
    ok(Tx.loading.length >= 5);
    ok(typeof Tx.secretGraffiti === 'string' && Tx.secretGraffiti.length > 4);
    ok(Tx.graffiti.indexOf(Tx.secretGraffiti) < 0, 'secret graffiti is not in the regular pool');
    ok(Tx.lastWordsFallback.length >= 2);
  });

  test('texts: allDiary はボス専用5枚を合わせて35枚、ボス定義のテキストと一致', function () {
    const all = Tx.allDiary();
    eq(all.length, 35);
    const boss = all.filter(function (d) { return d.boss; });
    eq(boss.length, 5);
    boss.forEach(function (d) { eq(d.text, G.EnemyDB.get(d.boss).diary); eq(d.id, 'diary_' + d.boss); });
    eq(Tx.diaryById('diary_boss_mirror_lord').text, '鏡の中の俺が、先に手を振った。俺はまだ、手を上げていなかった。');
    eq(Tx.diaryById('nope'), null);
  });

  test('texts: 称号は SPEC の8つ＋深度10', function () {
    const t = Tx.achievementTitles;
    ['百雷', '嵐を呼ぶ者', '永久機関', '封印の主', '鏡返し', '映らぬ者', '禁忌の蒐集家', '託された者', '禁域を越えた者'].forEach(function (n) {
      ok(Object.values(t).indexOf(n) >= 0, 'title ' + n);
    });
  });

  test('texts: pick は RNG で決定的', function () {
    const r1 = new G.RNG(5), r2 = new G.RNG(5);
    eq(Tx.pick(Tx.shopLines, r1), Tx.pick(Tx.shopLines, r2));
    ok(Tx.shopLines.indexOf(Tx.pick(Tx.shopLines)) >= 0, 'no-rng pick returns a pool item');
    eq(Tx.pick([]), null);
  });

  // ---- depth ----
  test('depth: table は 0..10、SPEC の文言', function () {
    eq(G.Depth.MAX, 10);
    eq(G.Depth.table.length, 11);
    G.Depth.table.forEach(function (row, i) { eq(row.depth, i); });
    eq(G.Depth.table[1].text, '通常敵のライフ+25%');
    eq(G.Depth.table[4].text, '初期デッキのパック選択で、並ぶパックが3種類から2種類になる');
    eq(G.Depth.table[9].text, 'ボスの発狂が、ライフ半分ではなく65%で始まる');
    ok(/禁域を越えた者/.test(G.Depth.table[10].text));
  });

  test('depth: modifiers は段階的に積み上がる', function () {
    const m0 = G.Depth.modifiers(0);
    eq(m0.normalLifeMul, 1); eq(m0.bossLifeMul, 1); eq(m0.mistakeMul, 1); eq(m0.eliteRelics, 1); eq(m0.enrageThreshold, null); eq(m0.bossExtraRelics, 0);
    eq(G.Depth.modifiers(1).normalLifeMul, 1.25);
    eq(G.Depth.modifiers(4).bossLifeMul, 1); eq(G.Depth.modifiers(5).bossLifeMul, 1.5);
    eq(G.Depth.modifiers(6).mistakeMul, 1); eq(G.Depth.modifiers(7).mistakeMul, 0.5);
    eq(G.Depth.modifiers(8).eliteRelics, 2);
    eq(G.Depth.modifiers(9).enrageThreshold, 0.65);
    const m10 = G.Depth.modifiers(10);
    eq(m10.bossExtraRelics, 1); eq(m10.normalLifeMul, 1.25); eq(m10.bossLifeMul, 1.5); eq(m10.eliteRelics, 2);
    // clamping
    eq(G.Depth.modifiers(99).bossExtraRelics, 1); eq(G.Depth.modifiers(-3).normalLifeMul, 1); eq(G.Depth.modifiers('x').normalLifeMul, 1);
  });

  test('depth: runModifiers（エリート・ショップ・パック・呪われた遺物）', function () {
    const r0 = G.Depth.runModifiers(0);
    eq(r0.eliteExtra, 0); eq(r0.shopPriceMul, 1); eq(r0.sellMul, 1); eq(r0.packChoices, 3); eq(r0.startCursedRelic, false);
    eq(G.Depth.runModifiers(2).eliteExtra, 1);
    const r3 = G.Depth.runModifiers(3); eq(r3.shopPriceMul, 1.1); eq(r3.sellMul, 0.9); eq(r3.packChoices, 3);
    eq(G.Depth.runModifiers(4).packChoices, 2);
    eq(G.Depth.runModifiers(5).startCursedRelic, false); eq(G.Depth.runModifiers(6).startCursedRelic, true);
  });

  test('depth: describe は前の深度の条件をすべて引き継ぐ', function () {
    const d0 = G.Depth.describe(0); eq(d0.lines.length, 1); eq(d0.lines[0], '通常の難易度');
    const d3 = G.Depth.describe(3); eq(d3.lines.length, 3); eq(d3.added, G.Depth.table[3].text); eq(d3.title, '深度3');
    eq(G.Depth.conditions(10).length, 10);
    ok(G.Depth.describe(10).isMax);
  });

  test('depth: unlocked は maxDepthCleared+1、current はそれを超えない', function () {
    const store = G.MetaStore;
    const hadSave = G.Save; G.Save = undefined; if (store) store.reset();
    try {
      eq(G.Depth.unlocked(), 0, 'never cleared → only depth 0');
      G.MetaStore.update(function (m) { m.maxDepthCleared = 2; m.depth = 7; });
      eq(G.Depth.unlocked(), 3);
      eq(G.Depth.current(), 3, 'clamped to unlocked');
      G.Depth.setCurrent(1); eq(G.Depth.current(), 1);
      G.Depth.setCurrent(9); eq(G.Depth.current(), 3);
      G.MetaStore.update(function (m) { m.maxDepthCleared = 10; });
      eq(G.Depth.unlocked(), 10, 'capped at MAX');
      ok(G.Depth.hasCleared(10));
    } finally { G.Save = hadSave; if (store) store.reset(); }
  });
})(globalThis.G);
