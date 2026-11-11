(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // js/data/enemies.js — 15 通常敵 / 9 エリート / 5 ボス (SPEC 通常敵とエリート, ボス詳細設計).
  //
  // Cards, relics and fields are named in Japanese and resolved to ids LAZILY
  // (on first access of def.deck / def.relics / def.field), so this file does not
  // depend on card-file load order. A missing card logs one warning and is
  // substituted by 《見習いの火球》(basic_01) or skipped — the game never crashes.
  //
  // EnemyDef fields: id, name, tier ('normal'|'elite'|'boss') + kind (same), isBoss, act, life,
  //   lineage[], style, deckSpec [{name,n}] → deck (ids), relicNames → relics (ids), fieldName → field (id),
  //   hazard [{test(game, enemy, player), weight}], forecastText, enrage {threshold, text, apply(game, enemyIdx)},
  //   introText, lastWords, diary, teaches, reward {gold:[min,max], auxCard}, trumps [names],
  //   deckBuilder(playerDeckIds, prevRunDeckIds, rng) (鏡の主 / 名もなき挑戦者), copyPlayerRelics (鏡の主),
  //   onBattleStart(ctx, game) (engine hook; flags 残り香 cards with inst.residual = true).
  //
  // Enrage effects are installed as HIDDEN relics (RelicDB entries with hidden:true, category:'enemy'),
  // pushed onto the enemy player's relics at enrage time: relics are permanent uncapped hook sources, so
  // no crest slot is consumed. UI should skip relics whose def has `hidden`.
  // ---------------------------------------------------------------
  const DB = G.EnemyDB;

  // ---- lazy name resolution -------------------------------------------------------
  let nameMap = null, nameMapCount = -1;
  function cardId(name) {
    if (!name) return null;
    if (G.CardDB.has(name)) return name;
    if (nameMapCount !== G.CardDB.count()) {
      nameMap = new Map();
      G.CardDB.all().forEach(function (d) { if (!nameMap.has(d.name)) nameMap.set(d.name, d.id); });
      nameMapCount = G.CardDB.count();
    }
    return nameMap.get(name) || null;
  }
  function relicId(name) {
    if (G.RelicDB.has(name)) return name;
    const r = G.RelicDB.all().find(function (d) { return d.name === name; });
    return r ? r.id : null;
  }
  const warned = {};
  function warn(key, msg) {
    if (warned[key]) return;
    warned[key] = true;
    if (typeof console !== 'undefined' && console.warn && !(G.AI && G.AI.quiet)) console.warn('[enemies] ' + msg);
  }
  function buildDeck(spec, who) {
    const out = [], missing = [];
    const fallback = G.CardDB.has('basic_01') ? 'basic_01' : null;
    spec.forEach(function (e) {
      const id = cardId(e.name);
      for (let i = 0; i < (e.n || 1); i++) { if (id) out.push(id); else if (fallback) out.push(fallback); }
      if (!id) missing.push(e.name);
    });
    if (missing.length) warn('deck:' + who, who + ' のデッキに無いカード（' + (fallback ? '見習いの火球で代用' : 'スキップ') + '）: ' + missing.join('、'));
    return out;
  }
  function D(name, n) { return { name: name, n: n || 1 }; }

  // ---- hazard test helpers (public info only: enemy's own zones + player's public zones) ----
  function count(p, zones, name) {
    const id = cardId(name);
    if (!id) return 0;
    let n = 0;
    zones.forEach(function (z) { (p[z] || []).forEach(function (c) { if (c.defId === id) n++; }); });
    return n;
  }
  const inHand = function (name) { return function (g, e) { return count(e, ['hand'], name) > 0; }; };
  const inZones = function (zones, name) { return function (g, e) { return count(e, zones, name) > 0; }; };
  const anyInZones = function (zones, names) { return function (g, e) { return names.some(function (n) { return count(e, zones, n) > 0; }); }; };
  const handFull = function (g, e) { return e.hand.length >= (g.status(e.idx, 'handLimit') || 6); };
  const H = function (test, weight) { return { test: test, weight: weight }; };

  // ---- hidden enrage relics ---------------------------------------------------------
  function enrageRelic(id, name, text, effects) {
    if (!G.RelicDB.has(id)) G.RelicDB.register({ id: id, name: name, text: text, category: 'enemy', hidden: true, rarity: 'boss', effects: effects });
    return id;
  }
  function installRelic(game, pIdx, relic) {
    const p = game.players[pIdx];
    if (p.relics.indexOf(relic) < 0) p.relics.push(relic);
  }
  const ENRAGE = {
    boss1: enrageRelic('relic_boss1_enrage', '二重螺旋', '毎ターン開始時、職人の予備部品を1枚手札に加える', {
      onTurnStart: async function (ctx, ev) {
        if (ev.who !== ctx.owner.idx) return;
        const id = cardId('職人の予備部品');
        if (id) await ctx.addToHand(id, ctx.owner, { isCopy: true });
      }
    }),
    boss2: enrageRelic('relic_boss2_enrage', '嵐の余韻', 'ターンの連鎖数の半分が次のターンに持ち越される', {
      onTurnEnd: function (ctx, ev) { if (ev.who === ctx.owner.idx) ctx.owner.flags.carryChain = Math.floor(ctx.game.chainOf(ctx.owner) / 2); },
      onTurnStart: async function (ctx, ev) {
        if (ev.who !== ctx.owner.idx || !ctx.owner.flags.carryChain) return;
        const n = ctx.owner.flags.carryChain; ctx.owner.flags.carryChain = 0;
        await ctx.addChain(n, ctx.owner);
        ctx.log('嵐の余韻：連鎖数+' + n);
      }
    }),
    boss3: enrageRelic('relic_boss3_enrage', '時間の窃盗', '3ターンに1回、相手のターンを奪って自分の追加ターンにする', {
      onTurnEnd: function (ctx, ev) {
        if (ev.who !== ctx.owner.idx) return;
        const f = ctx.owner.flags;
        f.turnsUntilTheft = (f.turnsUntilTheft == null ? 3 : f.turnsUntilTheft) - 1;
        if (f.turnsUntilTheft <= 0) {
          f.turnsUntilTheft = 3;
          const victim = ctx.game.players[1 - ctx.owner.idx];
          ctx.log('時間の窃盗：' + victim.name + 'のターンが奪われた');
          ctx.skipTurn(victim);
        }
        ctx.emit('theftCountdown', { who: ctx.owner.idx, turns: f.turnsUntilTheft });
      }
    }),
    boss4: enrageRelic('relic_boss4_enrage', '閉館間際', '毎ターン開始時、墓地の鍵1枚を封印ゾーンに戻す', {
      onTurnStart: async function (ctx, ev) {
        if (ev.who !== ctx.owner.idx) return;
        const key = ctx.owner.grave.find(function (c) { return !!G.CardDB.get(c.defId).key; });
        if (key) { ctx.log('閉館間際：' + ctx.nameOf(key) + 'が封印ゾーンに戻った'); await ctx.addSeal(key, ctx.owner); }
      }
    }),
    boss5: enrageRelic('relic_boss5_enrage', '割れた鏡', '毎ターン開始時、相手が直前のターンに使ったカードのコピーを1枚手札に加える', {
      onTurnStart: async function (ctx, ev) {
        if (ev.who !== ctx.owner.idx) return;
        const opp = ctx.game.players[1 - ctx.owner.idx];
        const pool = (opp.playedThisTurn.length ? opp.playedThisTurn : opp.prevTurnPlayed).filter(function (id) { return G.CardDB.has(id) && !G.CardDB.get(id).bossOnly; });
        if (!pool.length) return;
        const id = ctx.rng.pick(pool);
        await ctx.addToHand(id, ctx.owner, { isCopy: true });
      }
    })
  };

  // ---- fallback boss fields (only when the card files did not register them) -------------
  // SPEC ボス詳細設計: each boss starts with its field in play. Registered here defensively so a
  // boss battle never starts without its field; card authors may replace these (same names) in
  // cards_boss.js, in which case these are skipped.
  function fieldFallback(def) {
    if (cardId(def.name)) return;
    if (G.CardDB.has(def.id)) return;
    G.CardDB.register(Object.assign({ type: 'field', lineage: 'generic', role: 'engine', rarity: 'boss', bossOnly: true, tags: ['bossField'] }, def));
  }
  fieldFallback({ id: 'bossfield_01', name: '螺旋の工房', cost: 3, text: 'お互い、コスト0のカードを使うたびにマナ+1',
    effects: { scope: 'any', onCardPlayed: async function (ctx, ev) { if (!ev.isCopy && ev.cost === 0 && ctx.game.active === ev.who) await ctx.gainMana(1, ctx.game.players[ev.who]); } } });
  fieldFallback({ id: 'bossfield_02', name: '帯電する天空', cost: 3, text: 'お互い、カードを使うたびに相手に1ダメージ',
    effects: { scope: 'any', onCardPlayed: async function (ctx, ev) { if (!ev.isCopy) await ctx.damage(ctx.game.players[1 - ev.who], 1, { source: ctx.card, sourceOwner: ev.who }); } } });
  fieldFallback({ id: 'bossfield_03', name: '逆さ時計の街', cost: 3, text: 'お互い、追加ターンを得るたびに、相手は手札をランダムに1枚捨てる',
    effects: { scope: 'any', onExtraTurn: async function (ctx, ev) { await ctx.discard(1, ctx.game.players[1 - ev.who]); } } });
  fieldFallback({ id: 'bossfield_04', name: '静かな博物館', cost: 3, text: 'お互い、封印ゾーンのカードは除去されない',
    effects: { grants: [{ key: 'sealsProtected', value: true, side: 'any' }] } });
  fieldFallback({ id: 'bossfield_05', name: '合わせ鏡の間', cost: 3, text: 'お互い、相手が使ったことのあるカードと同じ名前のカードは、コスト-1',
    effects: { scope: 'any',
      onCardPlayed: function (ctx, ev) { const f = ctx.game.flags; const m = f.mirrorPlayed || (f.mirrorPlayed = { 0: {}, 1: {} }); m[ev.who][G.CardDB.get(ev.card.defId).name] = true; },
      modCost: function (ctx, ev) { const m = ctx.game.flags.mirrorPlayed; if (!m) return ev.cost; return m[1 - ev.who][G.CardDB.get(ev.card.defId).name] ? ev.cost - 1 : ev.cost; } } });

  // ---- registration helper -------------------------------------------------------------
  function register(def) {
    const spec = def.deck || [];
    def.deckSpec = spec;
    let deckCache = null, deckCount = -1;
    Object.defineProperty(def, 'deck', {
      enumerable: true, configurable: true,
      get: function () {
        if (deckCount !== G.CardDB.count()) { deckCache = buildDeck(spec, def.name); deckCount = G.CardDB.count(); }
        return deckCache;
      },
      set: function (v) { deckCache = v; deckCount = G.CardDB.count(); }
    });
    const relicNames = def.relics || [];
    def.relicNames = relicNames;
    Object.defineProperty(def, 'relics', {
      enumerable: true, configurable: true,
      get: function () {
        const out = [];
        relicNames.forEach(function (n) { const id = relicId(n); if (id) out.push(id); else warn('relic:' + n, def.name + ' の遺物が未登録: ' + n); });
        return out;
      },
      set: function () { /* ignored: relics are name-driven */ }
    });
    const fieldName = def.field || null;
    def.fieldName = fieldName;
    Object.defineProperty(def, 'field', {
      enumerable: true, configurable: true,
      get: function () { if (!fieldName) return null; const id = cardId(fieldName); if (!id) warn('field:' + fieldName, def.name + ' のフィールドが未登録: ' + fieldName); return id; },
      set: function () { }
    });
    def.kind = def.tier;
    def.isBoss = def.tier === 'boss';
    if (def.mistakeRate === undefined) def.mistakeRate = def.tier === 'boss' ? 0 : def.tier === 'elite' ? 0.1 : 0.2;
    if (!def.hazard) def.hazard = [];
    if (!def.trumps) def.trumps = [];
    if (!def.reward) def.reward = { gold: def.tier === 'boss' ? [120, 120] : def.tier === 'elite' ? [50, 70] : [20, 30], auxCard: null };
    if (!def.forecastText) def.forecastText = def.tier === 'elite' ? '次のターン、切り札が来る' : '次のターン、何かが起こる';
    return DB.register(def);
  }

  // =====================================================================================
  // 通常敵（15種）
  // =====================================================================================
  register({ id: 'enemy_fire_lizard', name: '火吹きトカゲ', tier: 'normal', act: 1, life: 14, lineage: ['accel'], style: 'speed',
    teaches: 'マナ加速と出口', introText: '小さな火を吐きながら、こちらを睨んでいる。',
    deck: [D('火の粉の妖精', 3), D('マナ喰いの小妖精', 2), D('火種'), D('帰還の火'), D('夜明けの暴走炉'), D('焦熱解放'), /* QA tuning: 焦熱解放 2→1, 火の粉の妖精 2→3 */ D('竜の卵'), D('魔力の泉'), D('炉番のドワーフ'), D('過充填の槍'), D('群れ火の蜥蜴'), D('炉心の見習い')],
    hazard: [H(anyInZones(['hand'], ['焦熱解放', '過充填の槍']), 50), H(function (g, e) { return e.maxMana >= 5; }, 50)],
    forecastText: '次のターン、炎が解き放たれる' });

  register({ id: 'enemy_lost_codex', name: '迷子の写本', tier: 'normal', act: 1, life: 12, lineage: ['cycle'], style: 'charge',
    teaches: '山札切れのルール', introText: 'ページが勝手にめくれている。自分が何の本か忘れているらしい。',
    deck: [D('書庫の小人', 2), D('知識の泉水'), D('古文書の発掘'), D('潮騒の人魚'), D('写本喰いの紙魚', 2), D('潮の満ち引き'), D('写本の精霊', 2), D('満ちる書架'), D('言霊の洪水', 2), D('渦潮の番人'), D('逆巻く大海嘯')] });

  register({ id: 'enemy_bone_goblin', name: '骨拾いの小鬼', tier: 'normal', act: 1, life: 15, lineage: ['doom'], style: 'specialWin',
    teaches: '呪詛のルール', introText: '拾い集めた骨を並べて、何かを数えている。',
    deck: [D('墓場の骸骨兵', 3), D('呪詛の囁き', 3), D('生け贄の儀', 2), D('呪いの刻印'), D('墓守の死霊術師'), D('呪いを運ぶ鴉'), D('呪詛の爆発'), D('死者の行進'), D('骨鳴らし', 2)],
    hazard: [H(function (g, e, p) { return p.curse >= 12; }, 60), H(inHand('呪詛の爆発'), 40)], forecastText: '次のターン、呪いが弾ける' });

  register({ id: 'enemy_mist_twins', name: '霧の双子姉妹', tier: 'normal', act: 1, life: 16, lineage: ['copy'], style: 'speed',
    teaches: '幻影のルール', introText: '二人いる。いや、三人……数えるほど増えていく。',
    deck: [D('霧の双子', 3), D('幻灯の呪文', 2), D('鏡写しの小鬼', 2), D('影の群狼', 2), D('幻の盾'), D('鏡の破片'), D('万華鏡の紋章'), D('幻影の総攻撃'), D('分裂する粘体'), D('鏡の雛')], // QA tuning: 消えない残像 → 見習いの火球 → 鏡の雛
    hazard: [H(inHand('幻影の総攻撃'), 50), H(function (g, e) { return g.monstersOf(e.idx).length >= 4; }, 50)], forecastText: '次のターン、幻影が総攻撃する' });

  register({ id: 'enemy_watch_statue', name: '見張りの石像', tier: 'normal', act: 1, life: 20, lineage: ['generic'], style: 'disrupt',
    teaches: '予約魔法と妨害', introText: '石像の目が、こちらの手札を数えるように動いた。',
    deck: [D('封じの番兵', 2), D('結界の僧兵', 2), D('渦潮の番人'), D('封言の呪文', 2), D('重圧の呪文'), D('時間停止'), D('手札崩し'), D('消滅の光'), D('砂時計の番人'), D('見習いの火球'), D('脱力の呪い', 2), D('小鬼の爆弾魔'), D('戦の雄叫び', 2), D('魔封じの猫'), D('霧払いの風')] });

  register({ id: 'enemy_thunder_band', name: '雷鳴の楽隊', tier: 'normal', act: 2, life: 35, lineage: ['chain'], style: 'charge',
    teaches: '連鎖数と嵐の前兆', introText: '楽器のかわりに、稲妻を鳴らしている。',
    deck: [D('火花'), D('静電気'), D('迅雷の閃き'), D('雷竜の雛', 2), D('雷鳴の子狐', 3), D('放電する精霊', 3), D('雷撃の連打', 3), D('嵐を呼ぶ巫女'), D('稲光の導線'), D('雷の申し子'), D('迅雷の獅子'), D('帯電の騎士'), D('雷纏い')],
    hazard: [H(handFull, 50), H(inHand('雷撃の連打'), 50)], forecastText: '次のターン、小さな嵐が来る' });

  register({ id: 'enemy_clock_gatekeeper', name: '時計塔の門番', tier: 'normal', act: 2, life: 40, lineage: ['time'], style: 'disrupt',
    teaches: '時限カードへの対処', introText: '門番は懐中時計を見て、わざとらしく首を振った。',
    deck: [D('時限爆弾', 3), D('砂時計の番人', 2), D('時計仕掛けの小鳥', 3), D('時の歯車'), D('砂粒の妖精'), D('時の加護'), D('刻む時の紋章'), D('時間停止', 2), D('眠る時竜', 2), D('渦潮の番人'), D('停滞の番人'), D('封じの番兵'), D('足止めの砂')],
    hazard: [H(function (g, e) { return count(e, ['timed'], '時限爆弾') >= 1; }, 60), H(anyInZones(['hand'], ['時の歯車', '時計仕掛けの小鳥']), 40)], forecastText: '次のターン、爆弾が落ちる' });

  register({ id: 'enemy_nest_hound', name: '竜の巣の番犬', tier: 'normal', act: 2, life: 42, lineage: ['accel'], style: 'speed',
    teaches: '竜による速攻', introText: '卵を守る犬。卵のほうが、犬より熱い。',
    deck: [D('竜の卵', 3), D('焚べ火の祭壇'), D('火喰い竜', 2), D('火種', 2), D('マナ喰いの小妖精', 2), D('夜明けの暴走炉'), D('炎翼の伝令'), D('魔力の泉'), D('炎竜の幼体', 2), D('溶岩の巨竜'), D('火種の子竜'), D('帰還の火'), D('火の粉の妖精', 2)],
    hazard: [H(inHand('火喰い竜'), 50), H(inZones(['board'], '竜の卵'), 30), H(inZones(['crests'], '焚べ火の祭壇'), 20)], forecastText: '次のターン、竜が目覚める' });

  register({ id: 'enemy_mirror_troupe', name: '鏡写しの道化団', tier: 'normal', act: 2, life: 32, lineage: ['copy', 'generic'], style: 'disrupt',
    teaches: 'コピーされる怖さ', introText: '道化たちは、こちらの仕草をそっくり真似してみせた。',
    deck: [D('盗み見の鏡', 3), D('偽りの約束', 2), D('映し身の道化', 3), D('多重詠唱'), D('入れ替えの鏡'), D('霧の双子', 3), D('幻の盾'), D('千の顔の怪盗'), D('封言の呪文', 2), D('鏡像の騎士'), D('幻灯の呪文'), D('鏡写しの小鬼')] });

  register({ id: 'enemy_archive_ghost', name: '古書庫の亡霊', tier: 'normal', act: 2, life: 35, lineage: ['cycle', 'doom'], style: 'assemble',
    teaches: '墓地の除外', introText: '読み終えた本を床に積み上げている。山は、もう亡霊より高い。',
    deck: [D('水鏡の占い'), D('逆巻く大海嘯', 2), D('呪詛の囁き', 2), D('知識の泉水'), D('墓守の死霊術師', 2), D('墓場の骸骨兵', 3), D('潮騒の人魚', 2), D('呪いを運ぶ鴉', 2), D('写本の巨像'), D('死者の力'), D('古文書の発掘'), D('呪いの刻印'), D('封じの番兵')],
    hazard: [H(inHand('逆巻く大海嘯'), 50), H(function (g, e) { return e.grave.length >= 8; }, 50)], forecastText: '次のターン、大海嘯が来る' });

  register({ id: 'enemy_storm_hatchling', name: '嵐竜の雛', tier: 'normal', act: 3, life: 65, lineage: ['chain', 'accel'], style: 'charge',
    teaches: '系統をまたぐコンボ', introText: '雛とは名ばかりの、雷をまとった竜。',
    deck: [D('火種'), D('静電気', 2), D('火花'), D('雷竜の雛', 2), D('夜明けの暴走炉'), D('天雷の裁き', 2), D('嵐の大精霊'), D('天穿つ雷霆竜'), D('雷撃の連打', 2), D('雷纏い', 2), D('魔力奔流'), D('無限の坩堝'), D('帯電の騎士'), D('稲光の導線'), D('雷鳴の子狐')],
    hazard: [H(inHand('天雷の裁き'), 40), H(handFull, 30), H(anyInZones(['hand', 'board'], ['無限の坩堝', '嵐の大精霊']), 30)], forecastText: '次のターン、嵐が来る' });

  register({ id: 'enemy_eternal_keeper', name: '永劫の書守', tier: 'normal', act: 3, life: 55, lineage: ['cycle'], style: 'assemble',
    teaches: '通常敵でも無限ループを使う', introText: '同じページを、何度も何度も読み返している。',
    deck: [D('永劫の書', 2), D('火種', 3), D('泡沫の呪文'), D('知識の泉水'), D('言霊の洪水', 2), D('逆巻く大海嘯'), D('放電する精霊', 2), D('渦潮の番人', 2), D('全知の雫'), D('知識は力'), D('潮騒の人魚', 2), D('古文書の発掘'), D('封じの番兵')],
    hazard: [H(inZones(['crests'], '永劫の書'), 40), H(inHand('火種'), 30), H(anyInZones(['hand', 'board'], ['言霊の洪水', '放電する精霊']), 30)], forecastText: '次のターン、無限ループを開始する' });

  register({ id: 'enemy_dead_procession', name: '死者の行列', tier: 'normal', act: 3, life: 72, lineage: ['doom', 'copy'], style: 'specialWin',
    teaches: '呪詛ループへの対処', introText: '行列はどこまでも続いている。先頭も最後尾も見えない。',
    deck: [D('分裂する粘体', 2), D('焚べ火の祭壇', 2), D('冥界の門番'), D('墓場の骸骨兵', 2), D('生け贄の儀'), D('死者の行進'), D('呪詛の囁き', 2), D('骸の黒竜'), D('墓守の死霊術師', 2), D('呪詛の重み'), D('呪詛の爆発'), D('墓場の骸骨兵'), D('呪いの刻印'), D('幻灯の呪文'), D('霧の双子')],
    hazard: [H(inZones(['board', 'hand'], '冥界の門番'), 40), H(inZones(['crests'], '焚べ火の祭壇'), 30), H(anyInZones(['hand', 'board'], ['分裂する粘体']), 30)], forecastText: '次のターン、呪詛の行進が始まる' });

  register({ id: 'enemy_time_knights', name: '時渡りの騎士団', tier: 'normal', act: 3, life: 70, lineage: ['time'], style: 'assemble',
    teaches: '追加ターンを止める準備', introText: '騎士たちの影が、本人より一歩先を歩いている。',
    deck: [D('時の王冠'), D('時喰いの砂時計', 2), D('時の前借り', 2), D('砂粒の妖精'), D('終わらぬ刻の巨人'), D('時渡りの剣士', 2), D('砂時計の番人', 2), D('時限爆弾', 2), D('時の加護'), D('一瞬の永遠'), D('時の歯車', 2), D('時を巡る魔女'), D('時計仕掛けの小鳥'), D('刻む時の紋章')],
    hazard: [H(anyInZones(['hand', 'crests'], ['時の王冠']), 40), H(inHand('時喰いの砂時計'), 30), H(anyInZones(['hand', 'board'], ['時渡りの剣士', '時を巡る魔女']), 30)], forecastText: '次のターン、時が重なる' });

  const RANDOM_STYLES = ['speed', 'assemble', 'charge', 'disrupt', 'specialWin'];
  register({ id: 'enemy_nameless_challenger', name: '名もなき挑戦者', tier: 'normal', act: 3, life: 60, lineage: ['generic'], style: 'speed',
    teaches: '裏設定：ほかの挑戦者の存在', introText: '顔はよく見えない。手にした束は、どこかで見たことがある。',
    deck: [D('見習いの火球', 20)],
    // Random deck: 20 cards from the player pool of 1〜2 random lineages (+ a few generic), built per battle.
    deckBuilder: function (playerDeckIds, prevRunDeckIds, rng) {
      rng = rng || new G.RNG(1);
      const lineages = ['accel', 'cycle', 'copy', 'chain', 'time', 'doom'];
      const l1 = rng.pick(lineages), l2 = rng.chance(0.5) ? rng.pick(lineages) : l1;
      const pool = G.CardDB.pool(function (d) { return d.lineage === l1 || d.lineage === l2 || (d.lineage === 'generic' && rng.chance(0.3)); })
        .filter(function (d) { return d.rarity !== 'taboo'; });
      const out = [];
      while (out.length < 20 && pool.length) {
        const d = rng.pick(pool);
        const w = d.rarity === 'common' ? 0.7 : d.rarity === 'rare' ? 0.25 : 0.1;
        if (rng.chance(w)) out.push(d.id);
      }
      while (out.length < 20) out.push(G.CardDB.has('basic_01') ? 'basic_01' : pool[0].id);
      return { deck: out, residual: [], style: rng.pick(RANDOM_STYLES) };
    } });

  // =====================================================================================
  // エリート（9種）— 20枚、切り札1種、遺物1つ、予告は1段階
  // =====================================================================================
  register({ id: 'elite_core_dragon', name: '炉心の番竜', tier: 'elite', act: 1, life: 40, lineage: ['accel'], style: 'speed',
    trumps: ['溶けた心臓'], relics: ['竜の鱗'], introText: '炉の奥で、竜の心臓が溶けながら脈打っている。',
    deck: [D('溶けた心臓'), D('火種', 2), D('魔力の種'), D('マナ喰いの小妖精', 2), D('火の粉の妖精', 2), D('魔力の泉', 2), D('暴走する炉心'), D('夜明けの暴走炉', 2), D('竜の卵', 2), D('焦熱解放', 2), D('暁焔の竜王'), D('火喰い竜'), D('黄金の水門')],
    hazard: [H(anyInZones(['hand', 'crests'], ['溶けた心臓']), 60), H(function (g, e) { return count(e, ['hand'], '火種') + count(e, ['hand'], '夜明けの暴走炉') + count(e, ['hand'], 'マナ喰いの小妖精') + count(e, ['hand'], '黄金の水門') >= 2; }, 40)],
    forecastText: '次のターン、心臓が溶け出す', reward: { gold: [50, 70], auxCard: null } });

  register({ id: 'elite_whispering_librarian', name: '囁く司書', tier: 'elite', act: 1, life: 35, lineage: ['cycle', 'generic'], style: 'disrupt',
    trumps: ['禁書の頁'], relics: ['封じ紐の栞'], introText: '「静かに」。司書はそう囁いて、こちらの手札を指さした。',
    deck: [D('禁書の頁', 2), D('忘却の波', 2), D('深淵の問い', 2), D('手札崩し'), D('知識の泉水'), D('写本の巨像'), D('渦潮の番人', 2), D('封じの番兵', 2), D('古文書の発掘'), D('潮騒の人魚', 2), D('言霊の洪水'), D('逆巻く大海嘯'), D('知識の器'), D('魔脈断ち')],
    hazard: [H(inHand('禁書の頁'), 60), H(function (g, e, p) { return p.hand.length >= 5; }, 40)], forecastText: '次のターン、手札が書き換えられる' });

  register({ id: 'elite_twin_thunder_beast', name: '双頭の雷獣', tier: 'elite', act: 2, life: 80, lineage: ['chain'], style: 'charge',
    trumps: ['二つ首の咆哮'], relics: ['帯電した角'], introText: '二つの首が、交互に雷を吐く。',
    deck: [D('二つ首の咆哮', 2), D('火花', 2), D('雷竜の雛', 2), D('静電気'), D('迅雷の閃き'), D('稲光の導線', 2), D('雷鳴の子狐', 2), D('雷撃の連打', 2), D('放電する精霊'), D('嵐を呼ぶ巫女'), D('天雷の裁き'), D('帯電の網'), D('雷の器'), D('雷纏い')],
    hazard: [H(inHand('二つ首の咆哮'), 50), H(function (g, e) { return e.hand.length >= 5; }, 30), H(inHand('稲光の導線'), 20)], forecastText: '次のターン、二つの咆哮が響く' });

  register({ id: 'elite_cursed_doll', name: '呪いの蒐集人形', tier: 'elite', act: 2, life: 70, lineage: ['doom'], style: 'specialWin',
    trumps: ['呪いの人形箱'], relics: ['綿のはみ出た胴'], introText: '人形の箱から、小さな呪いの声が漏れている。',
    deck: [D('呪いの人形箱'), D('呪いの刻印', 2), D('墓場の骸骨兵', 3), D('呪詛の囁き', 2), D('呪いを運ぶ鴉', 2), D('呪詛の爆発', 2), D('冥王の宣告'), D('生け贄の儀', 2), D('血の契約'), D('墓守の死霊術師'), D('呪詛喰らい'), D('終焉を告げる騎士'), D('命の器')],
    hazard: [H(anyInZones(['hand', 'crests'], ['呪いの人形箱']), 40), H(function (g, e, p) { return p.curse >= 10; }, 40), H(anyInZones(['hand'], ['冥王の宣告', '呪詛の爆発']), 20)], forecastText: '次のターン、呪いが満ちる' });

  register({ id: 'elite_time_stopper', name: '時を止める魔導機兵', tier: 'elite', act: 3, life: 140, lineage: ['time', 'accel'], style: 'charge',
    trumps: ['緊急停止'], relics: ['予備の歯車'], introText: '機兵の胸で、見慣れない歯車が逆向きに回っている。',
    deck: [D('緊急停止'), D('時限爆弾', 3), D('時の歯車', 2), D('火種'), D('眠る時竜'), D('夜明けの暴走炉'), D('砂時計の番人', 2), D('刻を統べる竜'), D('時計仕掛けの小鳥'), D('刻の剥落'), D('未来の器'), D('焦熱解放', 2), D('時の加護'), D('刻む時の紋章'), D('時間停止')],
    hazard: [H(inHand('緊急停止'), 50), H(function (g, e) { return count(e, ['timed'], '時限爆弾') >= 1; }, 30), H(inHand('刻を統べる竜'), 20)], forecastText: '次のターン、時が止まる' });

  register({ id: 'elite_thousand_faces', name: '千面の幻術師', tier: 'elite', act: 3, life: 125, lineage: ['copy'], style: 'assemble',
    trumps: ['千の仮面'], relics: ['仮面の山'], introText: '仮面の下に、また仮面。素顔はどこにもない。',
    deck: [D('千の仮面'), D('霧の双子', 3), D('鏡写しの小鬼', 2), D('幻灯の呪文', 2), D('分裂する粘体', 2), D('万華鏡の紋章'), D('幻影の総攻撃', 2), D('影の群狼'), D('百鬼夜行の主'), D('幻の盾'), D('幻影増殖'), D('鏡界の女王'), D('万象を映す魔神'), D('鏡の軍旗')],
    hazard: [H(inHand('千の仮面'), 40), H(function (g, e) { return e.board.length >= 2; }, 30), H(anyInZones(['hand'], ['幻影の総攻撃', '万象を映す魔神']), 30)], forecastText: '次のターン、千の仮面が踊る' });

  // ---- 竜のエリート（2026-11）: 各幕1体。禁忌の竜は使わない -------------------------------------------
  const dragonsOnBoard = function (n) { return function (g, e) { return g.monstersOf(e.idx).filter(function (m) { return g.isDragon(m); }).length >= n; }; };
  register({ id: 'elite_flute_maiden', name: '竜笛の巫女', tier: 'elite', act: 1, life: 38, lineage: ['accel', 'cycle'], style: 'speed',
    trumps: ['竜笛'], relics: ['竜笛の首飾り'], introText: '巫女が笛を吹くと、山の向こうから小さな竜が次々に舞い降りた。',
    teaches: '竜はまとめて出てくる。子竜のうちに数を減らす',
    deck: [D('竜笛'), D('炎竜の幼体', 3), D('潮騒の子竜', 3), D('竜の卵', 3), D('火種', 2), D('火の粉の妖精', 3), D('火喰い竜'), D('竜の咆哮'), D('溶岩の巨竜'), D('魔力の泉', 2)],
    hazard: [H(inHand('竜笛'), 40), H(dragonsOnBoard(2), 30), H(inHand('竜の咆哮'), 30)],
    forecastText: '次のターン、竜の群れが吠える' });

  register({ id: 'elite_mirror_dragoon', name: '鏡鱗の竜騎士', tier: 'elite', act: 2, life: 78, lineage: ['copy', 'chain'], style: 'speed',
    trumps: ['竜騎士の号令'], relics: ['竜騎士の兜'], introText: '鏡の鱗をまとった竜に、騎士がまたがっている。竜の影まで、同じ顔でこちらを見ていた。',
    teaches: '幻影の竜も竜。数が増える前に「すべて」に効く効果で片付ける',
    deck: [D('竜騎士の号令'), D('鏡鱗の子竜', 3), D('雷竜の雛', 3), D('竜の映し身', 2), D('迅雷の竜翼', 2), D('竜の咆哮', 2), D('火花', 2), D('雷纏い'), D('静電気', 2), D('千鏡の幻竜'), D('鏡の破片')],
    hazard: [H(inHand('竜騎士の号令'), 50), H(dragonsOnBoard(3), 30), H(inHand('迅雷の竜翼'), 20)],
    forecastText: '次のターン、竜騎士が突撃を命じる' });

  register({ id: 'elite_dragon_tomb', name: '古竜の墓守', tier: 'elite', act: 3, life: 125, lineage: ['doom', 'time'], style: 'specialWin',
    trumps: ['竜墓の鐘'], relics: ['竜骨の数珠'], introText: '墓守は三本の鍵を鳴らした。地の底で、鎖につながれた何かが寝返りを打つ。',
    teaches: '封じられし古竜は鍵が3種類そろうと目覚める。鍵か古竜を先に除く',
    deck: [D('竜墓の鐘'), D('骨竜の幼体', 3), D('眠る時竜', 2), D('墓場の骸骨兵'), D('竜葬の儀'), D('竜の刻', 2), D('封じられし古竜'), D('終末の鍵・第一'), D('終末の鍵・第二'), D('終末の鍵・第三'), D('千年の時竜'), D('大渦の古竜'), D('竜の盟約'), D('呪詛の囁き'), D('砂時計の番人'), D('刻の剥落')],
    hazard: [H(anyInZones(['hand', 'crests'], ['竜墓の鐘']), 40), H(function (g, e) { return g.distinctKeys(e.idx) >= 2; }, 30), H(function (g, e, p) { return p.curse >= 10; }, 30)],
    forecastText: '次のターン、古竜が目を覚ます' });

  // =====================================================================================
  // ボス（5種）
  // =====================================================================================
  register({ id: 'boss_loop_artisan', name: 'ループ職人', tier: 'boss', act: 1, life: 60, lineage: ['accel'], style: 'assemble',
    field: '螺旋の工房', relics: ['職人の作業台', '欠けた歯車'],
    trumps: ['ぜんまい仕掛けの不死鳥', '最後の一周', 'からくり巨兵・終'],
    introText: '歯車の音が止まらない工房。職人は顔も上げずに言った。「あと一周だ」',
    deck: [D('焚べ火の祭壇', 2), D('ぜんまい仕掛けの不死鳥', 2), D('永久機関'), D('最後の一周', 2), D('からくり巨兵・終'),
      D('火種', 3), D('水鏡の占い', 2), D('知識の泉水', 2), D('全知の雫'), D('渦潮の番人'), D('火種の子竜'), D('封言の呪文'), D('天井知らず'), D('消滅の光'),
      D('夜明けの暴走炉', 2), D('マナ喰いの小妖精', 2), D('魔力の泉'), D('職人の予備部品', 2), D('からくり人形', 2)],
    hazard: [H(inZones(['crests'], '焚べ火の祭壇'), 40), H(inZones(['hand', 'board'], 'ぜんまい仕掛けの不死鳥'), 30), H(anyInZones(['hand'], ['最後の一周', 'からくり巨兵・終']), 30)],
    forecastText: '次のターン、無限ループを開始する',
    enrage: { threshold: 0.5, text: '二重螺旋：毎ターン開始時、職人の予備部品を1枚手札に加える', apply: function (game, idx) { installRelic(game, idx, ENRAGE.boss1); } },
    lastWords: '……あと一周で、終わったのに。', diary: '歯車の音が止まらない。止め方を書いたメモを、どこかに挟んだはずだ。',
    teaches: 'パーツを1枚潰せば止まる', reward: { gold: [120, 120], auxCard: '職人の予備部品', tabooChoices: 3 } });

  register({ id: 'boss_storm_magus', name: 'ストームの魔術師', tier: 'boss', act: 2, life: 125, lineage: ['chain'], style: 'charge',
    field: '帯電する天空', relics: ['雷鳴の指揮棒', '嵐の目'],
    trumps: ['嵐の指揮者', '終曲・万雷', '嵐の化身'],
    introText: '空に雷雲が集まっていく。魔術師は指揮棒を構え、まだ振らない。',
    deck: [D('火種', 3), D('火花', 3), D('静電気', 2), D('迅雷の閃き', 2), D('夜明けの暴走炉', 2),
      D('嵐の指揮者'), D('嵐の大精霊'), D('雷紋の印'), D('無限の坩堝'), D('終曲・万雷', 2), D('嵐の化身'), D('雷撃の連打', 2),
      D('逆流する稲妻', 2), D('雷の申し子'), D('封言の呪文'), D('迅雷の獅子'), D('嵐の前奏曲', 2), D('稲妻の楽団員', 2)],
    hazard: [H(handFull, 30), H(anyInZones(['hand'], ['無限の坩堝', '嵐の指揮者']), 30), H(anyInZones(['hand'], ['終曲・万雷', '嵐の化身']), 30), H(inZones(['board'], '嵐の大精霊'), 10)],
    forecastText: '次のターン、嵐が来る',
    enrage: { threshold: 0.5, text: '嵐の余韻：連鎖数の半分が次のターンに持ち越される', apply: function (game, idx) { installRelic(game, idx, ENRAGE.boss2); } },
    lastWords: '拍手は……まだか。', diary: '雷の音を数えていたら、自分の心臓の音が分からなくなった。',
    teaches: '嵐の前に動く', reward: { gold: [120, 120], auxCard: '嵐の前奏曲', tabooChoices: 4 } });

  register({ id: 'boss_time_thief', name: '時間泥棒', tier: 'boss', act: 2, life: 115, lineage: ['time'], style: 'assemble',
    field: '逆さ時計の街', relics: ['盗人の手袋', '狂った砂時計'],
    trumps: ['時盗みの魔女', '奪われた砂時計', '刻限の処刑', '時を喰らう獣'],
    introText: '街の時計はすべて逆回り。泥棒はこちらの懐中時計を、もう手にしていた。',
    deck: [D('時盗みの魔女'), D('奪われた砂時計', 3), D('時の王冠'), D('刻限の処刑', 2), D('時を喰らう獣'),
      D('時限爆弾', 2), D('未来の手紙', 2), D('時の歯車', 2), D('時間停止', 2), D('歴史改変'), D('砂時計の番人', 2),
      D('火種', 2), D('停滞の番人'), D('刻の剥落'), D('過去からの来訪者', 2), D('時の前借り'), D('くすねた一秒', 2), D('影の掏摸', 2)],
    hazard: [H(inZones(['board'], '時盗みの魔女'), 40), H(inHand('奪われた砂時計'), 30), H(anyInZones(['hand', 'board'], ['刻限の処刑', '時を喰らう獣']), 20), H(inZones(['timed'], '時限爆弾'), 10)],
    forecastText: '次のターン、時が止まる',
    enrage: { threshold: 0.5, text: '時間の窃盗：3ターンに1回、相手のターンを奪う', apply: function (game, idx) { game.players[idx].flags.turnsUntilTheft = 3; installRelic(game, idx, ENRAGE.boss3); } },
    lastWords: '返すよ……全部、返すから。', diary: '盗んだ時間で何をしようとしていたのか、もう思い出せない。',
    teaches: '自分のターンが来る前に備えておく', reward: { gold: [120, 120], auxCard: 'くすねた一秒', tabooChoices: 4 } });

  register({ id: 'boss_collector', name: '蒐集者', tier: 'boss', act: 1, life: 50, lineage: ['doom'], style: 'specialWin',
    field: '静かな博物館', relics: ['鑑定士のルーペ', '埃をかぶった鍵束'],
    trumps: ['陳列棚の鍵', '蒐集の目録', '最後の展示', '標本の巨人'],
    introText: '静かな博物館。棚にはまだ空きがある。蒐集者は、こちらのデッキを値踏みした。',
    deck: [D('終末の鍵・第一', 2), D('終末の鍵・第二', 2), D('終末の鍵・第三', 2), D('陳列棚の鍵', 2),
      D('蒐集の目録'), D('骨の祭司', 2), D('水鏡の占い', 2), D('全知の雫'), D('最後の展示'), D('標本の巨人'),
      D('封言の呪文', 2), D('渦潮の番人', 2), D('墓場の骸骨兵', 2), D('呪いを運ぶ鴉'), D('深淵の問い'), D('封印の巨像'), D('呪文喰らいの魔獣'), D('蒐集家の網', 2), D('ガラス瓶の妖精', 2)],
    hazard: [H(function (g, e) { return g.distinctKeys(e.idx) >= 1; }, 20), H(function (g, e) { return g.distinctKeys(e.idx) >= 2; }, 20),
      H(function (g, e) { return g.distinctKeys(e.idx) >= 3; }, 20), H(function (g, e) { return g.distinctKeys(e.idx) >= 4; }, 20), H(inHand('最後の展示'), 20)],
    forecastText: '次のターン、展示が完成する',
    enrage: { threshold: 0.5, text: '閉館間際：毎ターン開始時、墓地の鍵1枚を封印ゾーンに戻す', apply: function (game, idx) { installRelic(game, idx, ENRAGE.boss4); } },
    lastWords: 'まだ……一つ、足りない。', diary: '集めたものの名前を、一つずつ忘れていく。棚だけが増えていく。',
    teaches: '特殊勝利は放っておけない', reward: { gold: [120, 120], auxCard: '蒐集家の網', tabooChoices: 3 } });

  const MIRROR_TRUMPS = [D('鏡像の写し', 2), D('裏返った姿見'), D('終わりの自画像'), D('もう一人の挑戦者')];
  register({ id: 'boss_mirror_lord', name: '鏡の主', tier: 'boss', act: 3, life: 200, lineage: ['copy'], style: 'mirror',
    field: '合わせ鏡の間', relics: ['曇った姿見'], copyPlayerRelics: true,
    trumps: ['鏡像の写し', '裏返った姿見', '終わりの自画像', 'もう一人の挑戦者'],
    introText: '合わせ鏡の間。向こう側の自分が、先に手を振った。',
    deck: MIRROR_TRUMPS, // placeholder: the real deck comes from deckBuilder
    // SPEC: copy the player's deck (random 25 if over 30) + 5 trumps + up to 3 残り香 from the previous run.
    deckBuilder: function (playerDeckIds, prevRunDeckIds, rng) {
      rng = rng || new G.RNG(1);
      let copied = (playerDeckIds || []).filter(function (id) { return G.CardDB.has(id) && !G.CardDB.get(id).bossOnly; });
      if (copied.length > 30) copied = rng.shuffle(copied.slice()).slice(0, 25);
      const trumps = buildDeck(MIRROR_TRUMPS, '鏡の主');
      const prev = (prevRunDeckIds || []).filter(function (id) { return G.CardDB.has(id) && !G.CardDB.get(id).bossOnly; });
      const residual = prev.length ? rng.shuffle(prev.slice()).slice(0, Math.min(3, prev.length)) : [];
      let deck = copied.concat(trumps, residual);
      // Safety net (no player deck given, e.g. debug battles): pad to 20 with the generic pool so the boss can play.
      if (deck.length < 20) {
        const pool = G.CardDB.pool(function (d) { return d.rarity === 'common'; });
        while (deck.length < 20 && pool.length) deck.push(rng.pick(pool).id);
        while (deck.length < 20 && G.CardDB.has('basic_01')) deck.push('basic_01');
      }
      return { deck: deck, residual: residual };
    },
    // Flag the 残り香 instances (縁がくすんで表示) once the deck exists.
    onBattleStart: function (ctx, game) {
      const p = ctx.me;
      const ids = (p.chooser && p.chooser.residualIds) || p.residualIds || [];
      const left = ids.slice();
      const zones = ['deck', 'hand'];
      zones.forEach(function (z) { p[z].forEach(function (c) { const i = left.indexOf(c.defId); if (i >= 0 && !c.residual) { c.residual = true; left.splice(i, 1); } }); });
    },
    hazard: [H(inHand('鏡像の写し'), 40),
      H(function (g, e) {
        if (!G.Combos) return false;
        const list = G.Combos.deckCombos(g, e.idx).filter(function (c) { return c.id !== 'boss5_mirror'; }); // the copied deck's combos, not the trumps
        return list.some(function (combo) { const ids = G.Combos.ids(combo); return ids.parts.length > 0 && ids.parts.every(function (id) { return G.Combos.hasPart(g, e.idx, id); }); });
      }, 40),
      H(anyInZones(['hand'], ['終わりの自画像', 'もう一人の挑戦者']), 20)],
    forecastText: '次のターン、おまえの前のターンを映す',
    enrage: { threshold: 0.5, text: '割れた鏡：毎ターン開始時、相手が直前のターンに使ったカードのコピーを1枚手札に加える', apply: function (game, idx) { installRelic(game, idx, ENRAGE.boss5); } },
    lastWords: '次は……おまえの番だ。', diary: '鏡の中の俺が、先に手を振った。俺はまだ、手を上げていなかった。',
    teaches: '自分のデッキの弱点を知る', reward: { gold: [0, 0], auxCard: 'ひび割れた手鏡', tabooChoices: 0 } });

  // ---- queries ---------------------------------------------------------------------------
  G.Enemies = {
    byTier: function (tier, act) { return DB.filter(function (e) { return e.tier === tier && (act == null || e.act === act); }); },
    bosses: function (act) { return DB.filter(function (e) { return e.tier === 'boss' && (act == null || e.act === act); }); },
    cardId: cardId, buildDeck: buildDeck, ENRAGE_RELICS: ENRAGE
  };
})(globalThis.G = globalThis.G || {});
