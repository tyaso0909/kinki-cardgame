(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // js/ai/combos.js — the combo dictionary (SPEC「この系統で生まれるコンボ例」
  // + boss combos). Entries name cards in Japanese; ids are resolved
  // lazily by name so this file does not depend on card data load order.
  //
  //   G.Combos.list                        → all ComboDefs
  //   G.Combos.ids(combo)                  → {parts:[defId], finisher:[defId], engines:[defId], all:[defId]} (cached)
  //   G.Combos.forDeck(defIds)             → combos the deck can assemble (all parts + ≥1 finisher present)
  //   G.Combos.progress(game, pIdx, combo) → 0..1 share of parts in hand/board/crests/field (+finisher weight)
  //   G.Combos.deckCombos(game, pIdx)      → forDeck of everything the player owns in the battle (cached per game)
  //   G.Combos.best(game, pIdx)            → {combo, progress} with highest progress
  //   G.Combos.isPartFor(game, pIdx, defId)
  // ---------------------------------------------------------------
  const Combos = G.Combos = G.Combos || {};

  function C(id, name, lineage, parts, finisher, engines, infinite, note) {
    return { id: id, name: name, lineage: lineage, parts: parts, finisher: finisher || [], engines: engines || parts.slice(0, 1), infinite: !!infinite, note: note || '' };
  }

  Combos.list = [
    // 加速
    C('phoenix_loop', '不死鳥ループ', 'accel', ['焚べ火の祭壇', '巡る不死鳥'], ['焔帝竜', '焦熱解放', '過充填の槍'], ['焚べ火の祭壇'], true, '祭壇で不死鳥を破壊→手札に戻る→0コストで再召喚。無限マナ'),
    C('egg_dragon', '卵から竜へ', 'accel', ['竜の卵', '焚べ火の祭壇', '火喰い竜'], ['火喰い竜'], ['焚べ火の祭壇'], false, '卵を祭壇で割って火喰い竜を0コストで速攻'),
    C('herald_emperor', '伝令で踏み倒し', 'accel', ['炎翼の伝令', '焔帝竜'], ['焔帝竜'], ['炎翼の伝令'], false, 'マナ爆発後、伝令で焔帝竜をタダ出し'),
    C('core_surge', '炉心＋奔流', 'accel', ['暴走する炉心', '夜明けの暴走炉', '魔力奔流'], ['過充填の槍', '焦熱解放'], ['暴走する炉心'], false, '暴走炉+3が+6、奔流で12、過充填の槍で24'),
    // 循環
    C('eternal_loop', '永劫ループ', 'cycle', ['永劫の書', '火種'], ['言霊の洪水', '焦熱解放', '過充填の槍'], ['永劫の書'], true, '永劫の書で火種が手札に戻り続ける。無限マナ・無限ドロー'),
    C('librarian_accel', '司書長で加速', 'cycle', ['大図書館の司書長', '溢れ出す記憶'], ['火喰い竜', '言霊の洪水'], ['大図書館の司書長'], false, '引くたびマナ+1'),
    C('deckout', '山札切れ勝ち', 'cycle', ['書喰らいの海魔', '溢れ出す記憶'], ['書喰らいの海魔'], ['溢れ出す記憶'], false, '大量ドローのターンに海魔で相手の山札を削る'),
    C('grave_flood', '墓地を溜めて流す', 'cycle', ['水鏡の占い', '逆巻く大海嘯'], ['逆巻く大海嘯'], ['水鏡の占い'], false, '墓地を肥やして大海嘯'),
    C('phoenix_hydra', '不死鳥と水竜', 'cycle', ['焚べ火の祭壇', '巡る不死鳥', '流転の水竜'], ['流転の水竜'], ['焚べ火の祭壇'], false, '不死鳥ループで墓地を回し水竜で呼び戻す'),
    // 複製
    C('queen_twins', '女王と双子', 'copy', ['鏡界の女王', '霧の双子'], ['幻影の総攻撃', '万象を映す魔神'], ['鏡界の女王', '万華鏡の紋章'], true, '幻影が幻影を呼び30体。万華鏡で30マナ'),
    C('slime_altar', '粘体と祭壇', 'copy', ['分裂する粘体', '焚べ火の祭壇'], ['幻影の総攻撃', '影の群狼'], ['焚べ火の祭壇'], true, '祭壇で粘体を破壊、幻影が倍々'),
    C('grimoire_book', '大魔典と永劫の書', 'copy', ['複写の大魔典', '永劫の書', '火種'], ['言霊の洪水', '焦熱解放'], ['永劫の書'], true, '永劫ループの無限マナで大魔典を無限コピー'),
    C('double_surge', '重ねがけで加速', 'copy', ['写し身の儀', '魔力奔流'], ['過充填の槍', '焦熱解放'], ['写し身の儀', '鏡の湖', '双面の魔導士'], false, '奔流を2回発動でマナ4倍'),
    // 連鎖
    C('book_discharge', '永劫の書と放電', 'chain', ['永劫の書', '火種', '放電する精霊'], ['放電する精霊'], ['永劫の書'], true, 'ループ1回ごとに1ダメージ。ループ自体が出口'),
    C('crucible_storm', '坩堝で全開放', 'chain', ['無限の坩堝', '天雷の裁き'], ['天雷の裁き', '雷帝'], ['無限の坩堝'], false, 'コスト0で手札を全部使い、天雷の裁き'),
    C('priestess_echo', '巫女と写し身', 'chain', ['万雷の巫女', '嵐の写し身', '天雷の裁き'], ['天雷の裁き'], ['万雷の巫女'], false, '連鎖数2倍、写し身で天雷を連鎖数回'),
    C('drum_turn', '太鼓で追加ターン', 'chain', ['雷神の太鼓'], ['雷撃の連打', '天雷の裁き'], ['雷神の太鼓'], false, '連鎖10で追加ターン'),
    // 時間
    C('witch_hourglass', '魔女と砂時計', 'time', ['時を巡る魔女', '時喰いの砂時計'], ['時渡りの剣士', '時限爆弾', '刻を統べる竜'], ['時を巡る魔女'], true, '追加ターン開始時に砂時計を回収。無限ターン'),
    C('crown_chain', '王冠と連鎖', 'time', ['時の王冠', '火種'], ['雷撃の連打', '時限爆弾'], ['時の王冠'], false, '5枚使って追加ターン'),
    C('bomb_dragon', '時限爆弾の一斉起爆', 'time', ['時限爆弾', '刻を統べる竜'], ['刻を統べる竜', '時限爆弾'], ['刻を統べる竜'], false, '爆弾を複数仕掛け、竜で同時起爆'),
    C('bell_mana', '鐘でマナ爆発を2回', 'time', ['巻き戻しの鐘', '魔力奔流'], ['過充填の槍', '焦熱解放'], ['巻き戻しの鐘'], false, '爆発ターンをやり直す'),
    // 終焉
    C('phoenix_gate', '不死鳥と門番', 'doom', ['焚べ火の祭壇', '巡る不死鳥', '冥界の門番'], ['冥界の門番'], ['焚べ火の祭壇', '冥界の門番'], true, '不死鳥破壊ごとに呪詛2。10周で勝利'),
    C('slime_gate', '粘体と門番', 'doom', ['分裂する粘体', '冥界の門番', '焚べ火の祭壇'], ['冥界の門番'], ['冥界の門番'], true, '幻影が破壊されても呪詛'),
    C('key_rush', '鍵の一気集め', 'doom', ['全知の雫', '終末の鍵・第五'], ['終末の鍵・第五', '封印の解放者'], ['全知の雫'], false, '雫で鍵3枚、第五でもう1枚無料'),
    C('curse_double', '呪詛の倍々', 'doom', ['呪いの刻印', '冥王の宣告'], ['冥王の宣告', '呪詛の爆発'], ['呪いの刻印'], false, '呪詛10を宣告で20'),
    C('prophecy_rush', '預言を早める', 'doom', ['終末の預言書', '時喰いの砂時計'], ['終末の預言書'], ['終末の預言書'], false, '追加ターンで時限3を一瞬で迎える'),
    // ボス
    C('boss1_lastlap', '職人の無限ループ', 'accel', ['焚べ火の祭壇', 'ぜんまい仕掛けの不死鳥'], ['最後の一周', 'からくり巨兵・終'], ['焚べ火の祭壇'], true, 'ループ職人の切り札コンボ'),
    C('boss2_storm', '終曲・万雷', 'chain', ['嵐の指揮者', '無限の坩堝'], ['終曲・万雷', '嵐の化身', '天雷の裁き'], ['嵐の指揮者'], false, 'ストームの魔術師の嵐'),
    C('boss3_timetheft', '時間の窃盗', 'time', ['時盗みの魔女', '奪われた砂時計'], ['刻限の処刑', '時を喰らう獣'], ['時盗みの魔女'], true, '時間泥棒の無限ターン'),
    C('boss4_exhibit', '最後の展示', 'doom', ['蒐集の目録', '陳列棚の鍵'], ['最後の展示', '標本の巨人'], ['蒐集の目録'], false, '蒐集者の特殊勝利'),
    C('boss5_mirror', '鏡像の写し', 'copy', ['鏡像の写し'], ['終わりの自画像', 'もう一人の挑戦者', '鏡像の写し'], ['裏返った姿見'], false, '鏡の主の切り札'),
    // エリート
    C('elite_core', '溶けた心臓', 'accel', ['溶けた心臓', '火種'], ['溶けた心臓'], ['溶けた心臓'], false, '炉心の番竜：マナを得るたび1ダメージ'),
    C('elite_twinhead', '二つ首の咆哮', 'chain', ['二つ首の咆哮', '稲光の導線'], ['二つ首の咆哮'], ['稲光の導線'], false, '双頭の雷獣'),
    C('elite_doll', '呪いの人形箱', 'doom', ['呪いの人形箱'], ['呪詛の爆発', '冥王の宣告'], ['呪いの人形箱'], false, '呪いの蒐集人形'),
    C('elite_stop', '緊急停止', 'time', ['緊急停止'], ['時限爆弾', '刻を統べる竜'], ['緊急停止'], false, '時を止める魔導機兵'),
    C('elite_masks', '千の仮面', 'copy', ['千の仮面', '霧の双子'], ['幻影の総攻撃', '万象を映す魔神'], ['千の仮面'], false, '千面の幻術師')
  ];
  Combos.byId = function (id) { return Combos.list.find(function (c) { return c.id === id; }) || null; };

  // ---- name → id resolution (cached, refreshed when CardDB grows) ------------
  let idCache = new Map(), idCacheCount = -1;
  Combos.ids = function (combo) {
    if (idCacheCount !== G.CardDB.count()) { idCache = new Map(); idCacheCount = G.CardDB.count(); }
    let r = idCache.get(combo.id);
    if (r) return r;
    const parts = G.AI.cardIds(combo.parts), fin = G.AI.cardIds(combo.finisher), eng = G.AI.cardIds(combo.engines);
    r = { parts: parts, finisher: fin, engines: eng, all: parts.concat(fin.filter(function (f) { return parts.indexOf(f) < 0; })),
      complete: parts.length === combo.parts.length && (combo.finisher.length === 0 || fin.length > 0) };
    idCache.set(combo.id, r);
    return r;
  };

  // Combos a deck (list of defIds, duplicates ok) can assemble.
  Combos.forDeck = function (defIds) {
    const set = new Set(defIds || []);
    return Combos.list.filter(function (combo) {
      const ids = Combos.ids(combo);
      if (!ids.complete) return false;
      for (let i = 0; i < ids.parts.length; i++) if (!set.has(ids.parts[i])) return false;
      if (ids.finisher.length && !ids.finisher.some(function (f) { return set.has(f); })) return false;
      return true;
    });
  };

  // Every defId a player owns in this battle (all zones) — public info about one's own cards.
  Combos.ownedIds = function (game, pIdx) {
    const p = game.players[pIdx];
    const zones = ['deck', 'hand', 'board', 'crests', 'grave', 'exile', 'timed', 'seals'];
    const out = [];
    zones.forEach(function (z) { p[z].forEach(function (c) { out.push(c.defId); }); });
    if (game.field && game.fieldOwner === pIdx) out.push(game.field.defId);
    p.reserves.forEach(function (r) { out.push(r.defId); });
    return out;
  };

  // Cached per game instance (keyed by player + deck composition fingerprint).
  Combos.deckCombos = function (game, pIdx) {
    const cache = game._comboCache || (game._comboCache = {});
    const ids = Combos.ownedIds(game, pIdx);
    const key = pIdx + ':' + ids.slice().sort().join(',');
    if (cache[pIdx] && cache[pIdx].key === key) return cache[pIdx].list;
    const list = Combos.forDeck(ids);
    cache[pIdx] = { key: key, list: list };
    return list;
  };

  // Where parts count as "assembled": hand, board, crests, field, timed (zones visible to the player as the meter).
  function inPlayOrHand(game, pIdx, defId) {
    const p = game.players[pIdx];
    const zones = ['hand', 'board', 'crests', 'timed'];
    for (let z = 0; z < zones.length; z++) {
      const arr = p[zones[z]];
      for (let i = 0; i < arr.length; i++) if (arr[i].defId === defId) return true;
    }
    if (game.field && game.fieldOwner === pIdx && game.field.defId === defId) return true;
    return false;
  }
  Combos.hasPart = inPlayOrHand;

  // 0..1 : parts weigh 75%, having at least one finisher weighs 25% (0 finishers declared → parts 100%).
  Combos.progress = function (game, pIdx, combo) {
    const ids = Combos.ids(combo);
    if (!ids.parts.length) return 0;
    let have = 0;
    for (let i = 0; i < ids.parts.length; i++) if (inPlayOrHand(game, pIdx, ids.parts[i])) have++;
    const partShare = have / ids.parts.length;
    if (!ids.finisher.length) return partShare;
    const hasFin = ids.finisher.some(function (f) { return inPlayOrHand(game, pIdx, f); });
    return partShare * 0.75 + (hasFin ? 0.25 : 0);
  };

  Combos.best = function (game, pIdx) {
    const list = Combos.deckCombos(game, pIdx);
    let best = null, bestP = -1;
    for (let i = 0; i < list.length; i++) {
      const pr = Combos.progress(game, pIdx, list[i]);
      if (pr > bestP) { bestP = pr; best = list[i]; }
    }
    return { combo: best, progress: Math.max(0, bestP) };
  };

  Combos.isPartFor = function (game, pIdx, defId) {
    const list = Combos.deckCombos(game, pIdx);
    for (let i = 0; i < list.length; i++) { const ids = Combos.ids(list[i]); if (ids.all.indexOf(defId) >= 0) return true; }
    return false;
  };
  Combos.isFinisherFor = function (game, pIdx, defId) {
    const list = Combos.deckCombos(game, pIdx);
    for (let i = 0; i < list.length; i++) if (Combos.ids(list[i]).finisher.indexOf(defId) >= 0) return true;
    return false;
  };
})(globalThis.G = globalThis.G || {});
