(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // _index.js — G.Data: lookups over CardDB/RelicDB, validation of referenced ids and SPEC names,
  // vault restore helper (蒐集箱), relic abilities (無限の巾着・原初の炉).
  // Load after every js/data/cards_*.js and relics.js.
  // ---------------------------------------------------------------
  const DB = G.CardDB, R = G.RelicDB;
  const Data = G.Data = G.Data || {};

  // ---- SPEC card names (180 = 6×25 + 30) -----------------------------------
  Data.SPEC_NAMES = {
    accel: ['火の粉の妖精', 'マナ喰いの小妖精', '炉番のドワーフ', '魔力を啜る蝙蝠', '竜の卵', '火種', '夜明けの暴走炉', '燃え尽き', '焦熱解放', '帰還の火', 'マナ封鎖', '魔力の泉', '焚べ火の祭壇', '火喰い竜', '炎翼の伝令', '魔力奔流', '過充填の槍', '無限の坩堝', '暴走する炉心', '竜脈の火山', '黄金の水門', '永久機関', '巡る不死鳥', '焔帝竜', '天井なき空'],
    cycle: ['書庫の小人', '潮騒の人魚', '渦潮の番人', '写本の精霊', '知識の泉水', '潮の満ち引き', '古文書の発掘', '水鏡の占い', '泡沫の呪文', '忘却の波', '深淵の問い', '言霊の洪水', '満ちる書架', '大図書館の司書長', '流転の水竜', '巻き戻しの泉', '溢れ出す記憶', '沈む書庫', '底なしの湖', '逆巻く大海嘯', '永劫の書', '時を綴る大賢者', '書喰らいの海魔', '全知の雫', '終わりなき頁'],
    copy: ['鏡写しの小鬼', '霧の双子', '影の群狼', '映し身の道化', '写し身の儀', '幻灯の呪文', '多重詠唱', '鏡の破片', '幻の盾', '盗み見の鏡', '偽りの約束', '万華鏡の紋章', '消えない残像', '双面の魔導士', '千の顔の怪盗', '分裂する粘体', '鏡の湖', '幻影増殖', '幻影の総攻撃', '無限回廊', '鏡界の女王', '複写の大魔典', '万象を映す魔神', '盗まれた奇跡', '鏡合わせの世界'],
    chain: ['雷鳴の子狐', '放電する精霊', '帯電の騎士', '嵐を呼ぶ巫女', '火花', '静電気', '雷撃の連打', '迅雷の閃き', '稲光の導線', '避雷針', '雷雲の封印', '雷紋の印', '嵐の蓄電器', '雷鳴の大鷲', '嵐の大精霊', '閃光の双刃', '天雷の裁き', '逆流する稲妻', '雷神の太鼓', '雷鳴の高原', '嵐の写し身', '雷帝', '終わらぬ雷雲', '万雷の巫女', '世界を貫く雷'],
    time: ['時計仕掛けの小鳥', '砂時計の番人', '未来視の梟', '過去からの来訪者', '時の歯車', '時の前借り', '時限爆弾', '未来の手紙', '一瞬の永遠', '時間停止', '足止めの砂', '刻む時の紋章', '小さな巻き戻し', '時喰いの砂時計', '刻を統べる竜', '未来から来た英雄', '巻き戻しの鐘', '永遠の午後', '時渡りの剣士', '歴史改変', '時の王冠', '時を巡る魔女', '時の果て', '時間逆行', '止まった世界'],
    doom: ['墓場の骸骨兵', '呪いを運ぶ鴉', '墓守の死霊術師', '骨の祭司', '終末の鍵・第一', '終末の鍵・第二', '終末の鍵・第三', '呪詛の囁き', '生け贄の儀', '血の契約', '封印破り', '呪いの刻印', '死者の行進', '終末の鍵・第四', '蘇りし不死の王', '呪詛の爆発', '屍山の巨人', '古の封印庫', '死者の国', '呪詛返し', '終末の鍵・第五', '封印の解放者', '冥王の宣告', '冥界の門番', '終末の預言書'],
    generic: ['封じの番兵', '結界の僧兵', '魔封じの猫', '消滅の光', '墓地清め', '霧払いの風', '封言の呪文', '重圧の呪文', '手札崩し', '時計止め', '浄化の聖水', '静寂の神殿', 'ただの草原', '反魔の護符', '応急手当', 'ループ断ちの鎖', '反射の鏡盾', '簒奪の儀', '封印の鎖', '封魔の大司教', '時空の錨', '呪詛喰らい', '先読みの賢者', '逆転の一手', '全反転の大鏡', '虚無の顎', '禁呪の封印', '零の聖域', '因果の断絶', '世界の再創造'],
    boss: ['ぜんまい仕掛けの不死鳥', '最後の一周', 'からくり巨兵・終', '職人の予備部品', 'からくり人形',
      '嵐の指揮者', '終曲・万雷', '嵐の化身', '嵐の前奏曲', '稲妻の楽団員',
      '時盗みの魔女', '奪われた砂時計', '刻限の処刑', '時を喰らう獣', 'くすねた一秒', '影の掏摸',
      '陳列棚の鍵', '蒐集の目録', '最後の展示', '標本の巨人', '蒐集家の網', 'ガラス瓶の妖精',
      '鏡像の写し', '裏返った姿見', '終わりの自画像', 'もう一人の挑戦者', 'ひび割れた手鏡'],
    elite: ['溶けた心臓', '禁書の頁', '二つ首の咆哮', '呪いの人形箱', '緊急停止', '千の仮面']
  };
  Data.SPEC_RELIC_NAMES = ['燃える種火', '古びた栞', '雷の欠片', '狂った懐中時計', '欠けた手鏡', '骨の指輪',
    '旅人の水筒', '占い師の小箱', '頑丈な盾', '商人の印章', '危険察知の羅針盤', '二枚舌の仮面', '墓暴きのシャベル', '王冠の破片', '無限の巾着', 'ループの螺子',
    '火種の袋', '竜の心臓', '原初の炉', '湿った栞', '人魚の涙', '無限書架の鍵', '避雷の腕輪', '雷鼓の撥', '永雷の宝珠', '古い砂袋', '時計職人の工具', '永遠の振り子',
    '霧の小瓶', '鏡の冠', '双子星の首飾り', '骸骨の鍵束', '黒い蝋燭', '冥府の契約書',
    '暴走する心臓', '盲目の預言者の眼帯', '鎖の王冠', '砕けた砂時計', '呪われし聖杯', '狂王の指輪',
    '重い鎖', '腐った林檎', '泣き叫ぶ人形', '嘘つきの地図',
    '職人の作業台', '欠けた歯車', '雷鳴の指揮棒', '嵐の目', '盗人の手袋', '狂った砂時計', '鑑定士のルーペ', '埃をかぶった鍵束', '曇った姿見',
    '竜の鱗', '封じ紐の栞', '帯電した角', '綿のはみ出た胴', '予備の歯車', '仮面の山'];
  // Which data file owns each name group (for validateAll's "missing file" reporting).
  Data.FILE_OF = { accel: 'cards_accel.js', cycle: 'cards_cycle.js', copy: 'cards_copy.js', chain: 'cards_chain.js', time: 'cards_time.js', doom: 'cards_doom.js', generic: 'cards_generic.js', boss: 'cards_boss.js', elite: 'cards_boss.js' };

  // ---- lookups ----------------------------------------------------------
  let nameCache = null, nameCacheCount = -1;
  function nameMap() {
    if (nameCache && nameCacheCount === DB.count()) return nameCache;
    nameCache = new Map();
    DB.all().forEach(function (d) { if (!nameCache.has(d.name)) nameCache.set(d.name, d.id); });
    nameCacheCount = DB.count();
    return nameCache;
  }
  Data.idByName = function (name) { const id = nameMap().get(name); return id === undefined ? null : id; };
  Data.defByName = function (name) { const id = Data.idByName(name); return id ? DB.get(id) : null; };
  Data.relicIdByName = function (name) { const d = R.all().find(function (r) { return r.name === name; }); return d ? d.id : null; };

  Data.cardsByLineage = function (lineage, opts) {
    opts = opts || {};
    return DB.filter(function (d) { return Data.isProjectCard(d) && d.lineage === lineage && (opts.includeBoss || (!d.bossOnly && d.rarity !== 'boss')); });
  };
  // Player pool for packs/rewards/shop: excludes bossOnly and rarity 'boss' (補助の専用カード are unlocked via rewards/codex, not packs).
  Data.poolForPacks = function (pred) { return DB.pool(pred); };
  Data.tabooCards = function () { return DB.pool(function (d) { return d.rarity === 'taboo'; }); };
  Data.bossTrumps = function (bossNo) {
    return DB.filter(function (d) { return d.bossOnly && (bossNo === undefined || d.id.indexOf('boss' + bossNo + '_') === 0); });
  };
  Data.bossAuxCards = function (bossNo) {
    return DB.filter(function (d) { return d.tags.indexOf('bossAux') >= 0 && (bossNo === undefined || d.id.indexOf('boss' + bossNo + '_') === 0); });
  };
  // kind: 'start'|'common'|'rare'|'legend'|'boss'|'cursed' (rarity), or 'player' (obtainable, not enemyOnly), 'enemy', 'all',
  //       or a lineage id, or 'starter'|'generic'|'lineage' (category).
  Data.relicsBy = function (kind) {
    return R.filter(function (r) {
      const obtainable = !r.enemyOnly && !r.hidden && ['starter', 'generic', 'lineage', 'boss', 'cursed'].indexOf(r.category) >= 0;
      if (kind === undefined || kind === 'all') return true;
      if (kind === 'player') return obtainable;
      if (kind === 'enemy') return !obtainable;
      if (G.Defs.LINEAGES.indexOf(kind) >= 0) return r.lineage === kind && obtainable;
      if (kind === 'starter' || kind === 'generic' || kind === 'lineage' || kind === 'cursed') return r.category === kind;
      return r.rarity === kind && obtainable;
    });
  };
  // Merge runEffects flags of a list of relic ids: numbers are summed, booleans OR'd.
  Data.runEffectsOf = function (relicIds) {
    const out = {};
    (relicIds || []).forEach(function (id) {
      const r = R.tryGet(id); if (!r || !r.runEffects) return;
      Object.keys(r.runEffects).forEach(function (k) {
        const v = r.runEffects[k];
        if (typeof v === 'number') out[k] = (out[k] || 0) + v; else out[k] = out[k] || v;
      });
    });
    return out;
  };

  // ---- 蒐集箱 (vault) --------------------------------------------------------
  // After a battle, cards stolen into either player's vault (and cards stolen by 盗人の手袋 / 簒奪の儀 that are still
  // in the thief's zones) return to their original owner. Returns { 0: [defIds], 1: [defIds] } keyed by original owner idx.
  // The run module adds the player's list (restoreVault(game)[0]) back into the run deck.
  Data.restoreVault = function (game) {
    const out = { 0: [], 1: [] };
    const zones = ['vault', 'hand', 'board', 'grave', 'deck', 'exile', 'timed', 'seals'];
    for (let i = 0; i < 2; i++) {
      const p = game.players[i];
      zones.forEach(function (z) {
        (p[z] || []).slice().forEach(function (c) {
          const from = c.zone === 'vault' ? c.stolenFrom : (c.stolenFrom !== null && c.stolenFrom !== i ? c.stolenFrom : null);
          if (from === null || from === undefined) return;
          if (c.isCopy || c.isPhantom || c.oboro) return; // 朧 cards never outlive the battle
          out[from].push(c.defId);
          game.removeFromZone(c);
          c.zone = 'void';
        });
      });
    }
    game.emit('vaultRestored', { restored: out });
    return out;
  };

  // ---- relic abilities (無限の巾着・原初の炉) ----------------------------------------
  // Relics are not CardInsts, so their activated abilities are exposed here instead of game.getAbilities.
  // UI/AI: G.Data.relicAbilities(game, pIdx) → [{relicId, label, targets:[uid]|null}]; G.Data.useRelicAbility(game, pIdx, relicId, targetUids)
  Data.relicAbilities = function (game, pIdx) {
    const p = game.players[pIdx];
    const out = [];
    if (game.active !== pIdx || game.phase !== 'main' || game.winner !== null) return out;
    p.relics.forEach(function (rid) {
      const r = R.tryGet(rid); if (!r || !r.effects || !r.effects.ability) return;
      const ab = r.effects.ability;
      const used = p.flags.relicAbilityTurn || {};
      if (ab.oncePerTurn && used[rid] === game.turn) return;
      const ctx = game.makeCtx(pIdx, null, { relic: r });
      if (ab.canUse && !ab.canUse(ctx)) return;
      let targets = null;
      if (ab.targets) { targets = ctx.candidatesFor(ab.targets).map(function (c) { return c.uid; }); if (!targets.length) return; }
      out.push({ relicId: rid, label: ab.label || r.name, targets: targets });
    });
    return out;
  };
  Data.useRelicAbility = async function (game, pIdx, relicId, targetUids) {
    const avail = Data.relicAbilities(game, pIdx).find(function (a) { return a.relicId === relicId; });
    if (!avail) return { ok: false, reason: 'unavailable' };
    const r = R.get(relicId), p = game.players[pIdx];
    const targets = game.resolveTargets([].concat(targetUids || []), null);
    if (r.effects.ability.targets && !targets.length) return { ok: false, reason: 'needsTarget' };
    p.flags.relicAbilityTurn = p.flags.relicAbilityTurn || {};
    p.flags.relicAbilityTurn[relicId] = game.turn;
    game.addLog(p.name + 'は遺物' + r.name + 'の力を使った');
    game.emit('relicAbility', { who: pIdx, relicId: relicId });
    await r.effects.ability.use(game.makeCtx(pIdx, null, { relic: r, targets: targets }));
    await game.afterAction();
    return { ok: true };
  };

  // Project ids only (test files register t_/ta_/tb_/tc_ cards; hidden helper relics start with '_').
  const CARD_ID_RE = /^(accel|cycle|copy|chain|time|doom|gen|basic)_\d+$|^(boss|elite)\d+_\d+$/;
  Data.isProjectCard = function (def) { return CARD_ID_RE.test(def.id); };
  Data.isProjectRelic = function (def) { return def.id.indexOf('relic_') === 0; };
  Data.projectCards = function () { return DB.filter(Data.isProjectCard); };

  // ---- validation --------------------------------------------------------------
  // Returns { ok, errors:[...], missingNames:{group:[names]}, missingFiles:[...], counts:{cards, relics, pool} }.
  // Missing names of a whole group are reported (file absent) but only `errors` make ok=false:
  // errors = dangling id references (tutor/refs/pool targets), duplicate names, bad boss flags, bad texts.
  Data.validateAll = function (opts) {
    opts = opts || {};
    const errors = [], missingNames = {}, missingFiles = [];
    const names = nameMap();
    Object.keys(Data.SPEC_NAMES).forEach(function (group) {
      const miss = Data.SPEC_NAMES[group].filter(function (n) { return !names.has(n); });
      if (miss.length === Data.SPEC_NAMES[group].length && !opts.strict) { missingFiles.push(Data.FILE_OF[group]); }
      else if (miss.length) { missingNames[group] = miss; if (opts.strict || group === 'generic' || group === 'boss' || group === 'elite') errors.push('missing cards (' + group + '): ' + miss.join('、')); }
      else if (opts.strict) { /* complete */ }
    });
    if (missingNames.generic === undefined && missingFiles.indexOf('cards_generic.js') >= 0) errors.push('cards_generic.js not loaded');
    const relicMiss = Data.SPEC_RELIC_NAMES.filter(function (n) { return Data.relicIdByName(n) === null; });
    if (relicMiss.length) { missingNames.relics = relicMiss; errors.push('missing relics: ' + relicMiss.join('、')); }
    // duplicate names
    const seen = {};
    const cards = Data.projectCards(), relics = R.filter(Data.isProjectRelic);
    cards.forEach(function (d) { if (seen[d.name]) errors.push('duplicate card name: ' + d.name + ' (' + seen[d.name] + ', ' + d.id + ')'); else seen[d.name] = d.id; });
    // boss flags & refs
    cards.forEach(function (d) {
      if (d.bossOnly && d.rarity !== 'boss') errors.push(d.id + ': bossOnly cards must have rarity boss');
      if (d.tags.indexOf('bossAux') >= 0 && d.bossOnly) errors.push(d.id + ': bossAux must not be bossOnly');
      (d.refs || []).forEach(function (ref) { if (!DB.has(ref)) errors.push(d.id + ' references unknown card ' + ref); });
      if (!d.text) errors.push(d.id + ': empty text');
    });
    relics.forEach(function (r) {
      (r.refs || []).forEach(function (ref) { if (!DB.has(ref)) errors.push(r.id + ' references unknown card ' + ref); });
      if (!r.text) errors.push(r.id + ': empty text');
    });
    // pool sanity
    const pool = DB.pool().filter(Data.isProjectCard);
    pool.forEach(function (d) { if (d.bossOnly || d.rarity === 'boss') errors.push(d.id + ' leaked into pool'); });
    return { ok: errors.length === 0, errors: errors, missingNames: missingNames, missingFiles: missingFiles,
      counts: { cards: cards.length, relics: relics.length, pool: pool.length, taboo: Data.tabooCards().length } };
  };
})(globalThis.G = globalThis.G || {});
