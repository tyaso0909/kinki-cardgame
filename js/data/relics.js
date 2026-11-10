(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // relics.js — 遺物 44種（初期6・汎用10・系統別18・ボス6・呪われた4）＋ 敵専用遺物（ボス9・エリート6）。
  // RelicDef = { id, name, rarity:'start'|'common'|'rare'|'legend'|'boss'|'cursed', category, lineage, text,
  //              drawback?, effects:{hooks}, runEffects?:{...flags for js/run}, enemyOnly? }
  // 戦闘外の効果は runEffects のフラグで宣言し、ラン側が読む（一覧は docs/DEVIATIONS.md「Cards C」）。
  // 起動型の遺物（無限の巾着・原初の炉）は effects.ability を持ち、G.Data.relicAbilities / useRelicAbility で使う。
  // ---------------------------------------------------------------
  const Fx = G.Fx;
  const DB = G.CardDB;
  const R = G.RelicDB;
  const U = G.DataUtil;

  function reg(def) { if (def.enemyOnly === undefined) def.enemyOnly = false; return R.register(def); }
  function once(flagName, fn) {
    return async function (ctx, ev) {
      if (ctx.owner.flags[flagName]) return;
      ctx.owner.flags[flagName] = true;
      await fn(ctx, ev);
    };
  }
  function isMine(ctx, ev) { return ev && ev.who === ctx.owner.idx; }

  // =====================================================================
  // 初期遺物（6）
  // =====================================================================
  reg({ id: 'relic_ember', name: '燃える種火', rarity: 'start', category: 'starter', lineage: 'accel', text: '戦闘開始時、マナ+1',
    // one-time +1 mana on the first turn (max mana still starts at 1)
    effects: { onBattleStart: async function (ctx) { ctx.owner.flags.firstTurnManaBonus = (ctx.owner.flags.firstTurnManaBonus || 0) + 1; } } });

  reg({ id: 'relic_old_bookmark', name: '古びた栞', rarity: 'start', category: 'starter', lineage: 'cycle', text: '戦闘開始時、カードを1枚多く引く',
    effects: { grants: [{ key: 'initialHandDelta', value: 1 }] } });

  reg({ id: 'relic_thunder_shard', name: '雷の欠片', rarity: 'start', category: 'starter', lineage: 'chain', text: '毎ターン、連鎖数+1の状態で始まる',
    effects: { grants: [{ key: 'chainAtTurnStart', value: 1 }] } });

  reg({ id: 'relic_mad_watch', name: '狂った懐中時計', rarity: 'start', category: 'starter', lineage: 'time', text: '各戦闘で最初に使う時限カードのカウント-1',
    effects: { onBattleStart: async function (ctx) { ctx.owner.flags.firstTimedDelta = -1; ctx.owner.flags.firstTimedUsed = false; } } });

  reg({ id: 'relic_chipped_mirror', name: '欠けた手鏡', rarity: 'start', category: 'starter', lineage: 'copy', text: '各戦闘で最初に使う魔法は2回発動する',
    effects: { onSpellPlayed: async function (ctx, ev) {
      if (!isMine(ctx, ev) || ev.isCopy || ctx.owner.flags.chippedMirrorUsed) return;
      ctx.owner.flags.chippedMirrorUsed = true;
      ctx.owner.nextSpellTimes = Math.max(2, ctx.owner.nextSpellTimes || 1);
      ctx.log('欠けた手鏡が魔法を映す');
    } } });

  reg({ id: 'relic_bone_ring', name: '骨の指輪', rarity: 'start', category: 'starter', lineage: 'doom', text: '戦闘開始時、相手に呪詛1',
    effects: { onBattleStart: async function (ctx) { await ctx.addCurse(ctx.game.players[1 - ctx.owner.idx], 1); } } });

  // =====================================================================
  // 汎用遺物（10）
  // =====================================================================
  reg({ id: 'relic_canteen', name: '旅人の水筒', rarity: 'common', category: 'generic', text: '戦闘終了時、ライフ+4',
    runEffects: { healAfterBattle: 4 }, effects: {} });

  reg({ id: 'relic_fortune_box', name: '占い師の小箱', rarity: 'common', category: 'generic', text: '自分のターン開始時、山札の上2枚を見て1枚を引き、もう1枚を山札の一番下に置く',
    effects: { onTurnStart: async function (ctx, ev) {
      if (!isMine(ctx, ev)) return;
      const top = ctx.lookTop(2, ctx.owner).slice();
      if (!top.length) return;
      if (top.length === 1) { await ctx.draw(1, ctx.owner, { noModify: true }); return; }
      const id = await ctx.choose(top.map(function (c) { return { id: c.uid, label: DB.get(c.defId).name }; }), { prompt: '引くカードを選ぶ', chooser: ctx.owner.idx });
      const keep = top.find(function (c) { return c.uid === id; }) || top[0];
      const other = top[0] === keep ? top[1] : top[0];
      ctx.putOnBottom(other, ctx.owner);
      ctx.putOnTop(keep, ctx.owner);
      await ctx.draw(1, ctx.owner, { noModify: true });
    } } });

  reg({ id: 'relic_sturdy_shield', name: '頑丈な盾', rarity: 'common', category: 'generic', text: '各戦闘の最初の3ターン、受けるダメージ-2',
    effects: { scope: 'any', modDamage: function (ctx, ev) {
      if (!ev.isPlayer || ev.target.idx !== ctx.owner.idx) return ev.amount;
      if (ctx.owner.turnsTaken > 3) return ev.amount;
      return Math.max(0, ev.amount - 2);
    } } });

  reg({ id: 'relic_merchant_seal', name: '商人の印章', rarity: 'common', category: 'generic', text: 'ショップの価格が20%引き',
    runEffects: { shopDiscount: 0.2 }, effects: {} });

  reg({ id: 'relic_compass', name: '危険察知の羅針盤', rarity: 'rare', category: 'generic', text: '危険度メーターが1段階早く知らせる。敵の手札1枚が常に見える',
    runEffects: { hazardEarly: true, revealEnemyHand: 1 }, effects: {} });

  reg({ id: 'relic_two_tongue_mask', name: '二枚舌の仮面', rarity: 'rare', category: 'generic', text: '自分の予約魔法の効果が2ターン続く',
    effects: { grants: [{ key: 'reserveLasts', value: 2 }] } });

  reg({ id: 'relic_shovel', name: '墓暴きのシャベル', rarity: 'rare', category: 'generic', text: '戦闘開始時、山札からランダムなコスト0のカード1枚を手札に加える',
    effects: { onBattleStart: async function (ctx) { await ctx.tutor(function (c, d) { return d.cost === 0; }, ctx.owner, { random: true }); } } });

  reg({ id: 'relic_crown_shard', name: '王冠の破片', rarity: 'legend', category: 'generic', text: '各戦闘で1回、ライフが0になったとき、ライフ10で復活する',
    effects: { onLethal: function (ctx) {
      if (ctx.owner.flags.crownShardUsed || ctx.owner.life > 0) return;
      ctx.owner.flags.crownShardUsed = true;
      ctx.owner.life = 10;
      ctx.log('王冠の破片が砕け、' + ctx.owner.name + 'はライフ10で復活した');
      ctx.emit('heal', { who: ctx.owner.idx, amount: 10, revive: true });
    } } });

  reg({ id: 'relic_infinite_pouch', name: '無限の巾着', rarity: 'legend', category: 'generic', text: '1ターンに1回、手札のカード1枚のコスト-2',
    effects: { ability: {
      label: '巾着：コスト-2', oncePerTurn: true,
      targets: { kind: 'handCard', side: 'ally', count: 1, prompt: 'コストを下げるカードを選ぶ' },
      canUse: function (ctx) { return ctx.owner.hand.length > 0; },
      use: async function (ctx) { const t = ctx.targets[0]; if (!t) return; t.costMod = (t.costMod || 0) - 2; ctx.log(ctx.nameOf(t) + 'のコストは-2された'); }
    } } });

  reg({ id: 'relic_loop_screw', name: 'ループの螺子', rarity: 'legend', category: 'generic', text: '自分のループが1周するたび、マナ+1',
    effects: { onLoopIteration: async function (ctx, ev) { if (isMine(ctx, ev)) await ctx.gainMana(1, ctx.owner); } } });

  // =====================================================================
  // 系統別遺物（18）
  // =====================================================================
  // 加速
  reg({ id: 'relic_tinder_bag', name: '火種の袋', rarity: 'common', category: 'lineage', lineage: 'accel', text: '戦闘開始時、手札に《火種》を1枚加える',
    refs: ['accel_06'],
    effects: { onBattleStart: async function (ctx) { if (DB.has('accel_06')) await ctx.addToHand('accel_06', ctx.owner); else ctx.log('火種が見つからない'); } } });

  reg({ id: 'relic_dragon_heart', name: '竜の心臓', rarity: 'rare', category: 'lineage', lineage: 'accel', text: '毎ターンの最大マナの上昇が+2になる',
    effects: { grants: [{ key: 'maxManaGainDelta', value: 1 }] } });

  reg({ id: 'relic_primal_furnace', name: '原初の炉', rarity: 'legend', category: 'lineage', lineage: 'accel', text: '各戦闘で1回、マナを10にする',
    effects: { ability: {
      label: '原初の炉：マナを10に', oncePerBattle: true,
      canUse: function (ctx) { return !ctx.owner.flags.primalFurnaceUsed && ctx.owner.mana < 10; },
      use: async function (ctx) { ctx.owner.flags.primalFurnaceUsed = true; ctx.setMana(10, ctx.owner); }
    } } });

  // 循環
  reg({ id: 'relic_damp_bookmark', name: '湿った栞', rarity: 'common', category: 'lineage', lineage: 'cycle', text: '戦闘開始時、山札の上5枚を見て、好きな順番で戻す',
    effects: { onBattleStart: async function (ctx) {
      const top = ctx.lookTop(5, ctx.owner).slice();
      if (top.length < 2) return;
      U.reveal(ctx, top, ctx.owner.idx, 'deck');
      const rest = top.slice(), ordered = [];
      while (rest.length > 1) {
        const id = await ctx.choose(rest.map(function (c) { return { id: c.uid, label: DB.get(c.defId).name }; }), { prompt: '次に引くカードを選ぶ（' + (ordered.length + 1) + '枚目）', chooser: ctx.owner.idx });
        const c = rest.find(function (x) { return x.uid === id; }) || rest[0];
        rest.splice(rest.indexOf(c), 1); ordered.push(c);
      }
      ordered.push(rest[0]);
      ctx.putOnTop(ordered, ctx.owner);
    } } });

  // 人魚の涙：墓地にあったカードの uid を記録し、そのターン最初に手札から使うそのカードのコストを0にする（近似）。
  reg({ id: 'relic_mermaid_tear', name: '人魚の涙', rarity: 'rare', category: 'lineage', lineage: 'cycle', text: '毎ターン、墓地から最初に手札に戻したカードのコストは0になる',
    effects: {
      onBattleStart: async function (ctx) { ctx.owner.flags.tearGrave = {}; },
      onTurnStart: async function (ctx, ev) { if (isMine(ctx, ev)) { ctx.owner.flags.tearGrave = {}; ctx.owner.grave.forEach(function (c) { ctx.owner.flags.tearGrave[c.uid] = true; }); } },
      onSpellToGrave: async function (ctx, ev) { if (isMine(ctx, ev)) (ctx.owner.flags.tearGrave = ctx.owner.flags.tearGrave || {})[ev.card.uid] = true; },
      onDiscard: async function (ctx, ev) { if (isMine(ctx, ev)) (ctx.owner.flags.tearGrave = ctx.owner.flags.tearGrave || {})[ev.card.uid] = true; },
      onMonsterDestroyed: async function (ctx, ev) { if (isMine(ctx, ev) && !ev.isPhantom) (ctx.owner.flags.tearGrave = ctx.owner.flags.tearGrave || {})[ev.card.uid] = true; },
      modCost: function (ctx, ev) {
        const f = ctx.owner.flags;
        if (ev.who !== ctx.owner.idx || ev.from !== 'hand' || !f.tearGrave || !f.tearGrave[ev.card.uid]) return ev.cost;
        if (f.tearUsedTurn === ctx.game.turn) return ev.cost;
        return 0;
      },
      onCardPlayed: async function (ctx, ev) {
        const f = ctx.owner.flags;
        if (!isMine(ctx, ev) || ev.isCopy || ev.from !== 'hand' || !f.tearGrave || !f.tearGrave[ev.card.uid]) return;
        if (f.tearUsedTurn === ctx.game.turn) return;
        f.tearUsedTurn = ctx.game.turn; delete f.tearGrave[ev.card.uid];
        ctx.log('人魚の涙：' + ctx.nameOf(ev.card) + 'はコスト0で使われた');
      }
    } });

  function shelfKeyCheck(ctx, ev) {
    if (!isMine(ctx, ev) || ctx.owner.hand.length !== 0) return Promise.resolve();
    if (ctx.owner.flags.shelfKeyTurn === ctx.game.turn) return Promise.resolve();
    ctx.owner.flags.shelfKeyTurn = ctx.game.turn;
    ctx.log('無限書架の鍵が開く');
    return ctx.draw(3, ctx.owner);
  }
  reg({ id: 'relic_infinite_shelf_key', name: '無限書架の鍵', rarity: 'legend', category: 'lineage', lineage: 'cycle', text: '手札が0枚になったとき、カードを3枚引く（1ターンに1回）',
    effects: { onCardPlayed: shelfKeyCheck, onDiscard: shelfKeyCheck, onHandEmpty: shelfKeyCheck } });

  // 連鎖
  function crossed(ev, step) { return Math.floor(ev.chain / step) - Math.floor((ev.previous || 0) / step); }
  reg({ id: 'relic_lightning_bracelet', name: '避雷の腕輪', rarity: 'common', category: 'lineage', lineage: 'chain', text: '連鎖数が10に達するたび、ライフ+3',
    effects: { onChainReached: async function (ctx, ev) { if (!isMine(ctx, ev)) return; const n = crossed(ev, 10); if (n > 0) ctx.heal(ctx.owner, 3 * n); } } });

  reg({ id: 'relic_thunder_drumstick', name: '雷鼓の撥', rarity: 'rare', category: 'lineage', lineage: 'chain', text: '連鎖数が5の倍数になるたび、カードを1枚引く',
    effects: { onChainReached: async function (ctx, ev) { if (!isMine(ctx, ev)) return; const n = crossed(ev, 5); if (n > 0) await ctx.draw(n, ctx.owner); } } });

  reg({ id: 'relic_eternal_thunder_orb', name: '永雷の宝珠', rarity: 'legend', category: 'lineage', lineage: 'chain', text: 'コピーの発動や2回発動でも、連鎖数が増えるようになる',
    effects: { grants: [{ key: 'copiesCountChain', value: true }] } });

  // 時間
  reg({ id: 'relic_old_sandbag', name: '古い砂袋', rarity: 'common', category: 'lineage', lineage: 'time', text: '時限カードを使うたび、カードを1枚引く',
    effects: { onTimedSet: async function (ctx, ev) { if (isMine(ctx, ev)) await ctx.draw(1, ctx.owner); } } });

  reg({ id: 'relic_clockmaker_tools', name: '時計職人の工具', rarity: 'rare', category: 'lineage', lineage: 'time', text: '自分の時限カードは、発動したあと一度だけ時限ゾーンに戻ってくる',
    effects: { grants: [{ key: 'timedReturnOnce', value: true }] } });

  reg({ id: 'relic_eternal_pendulum', name: '永遠の振り子', rarity: 'legend', category: 'lineage', lineage: 'time', text: '各戦闘で1回、自分のターン終了時に追加ターンを得る',
    effects: { onTurnEnd: async function (ctx, ev) {
      if (!isMine(ctx, ev) || ctx.owner.flags.pendulumUsed || ctx.game.winner !== null) return;
      if (ctx.status(ctx.owner, 'noExtraTurn')) return;
      ctx.owner.flags.pendulumUsed = true;
      await ctx.extraTurn(ctx.owner);
    } } });

  // 複製
  reg({ id: 'relic_fog_vial', name: '霧の小瓶', rarity: 'common', category: 'lineage', lineage: 'copy', text: '戦闘開始時、手札に《幻灯の呪文》を1枚加える',
    refs: ['copy_06'],
    effects: { onBattleStart: async function (ctx) { if (DB.has('copy_06')) await ctx.addToHand('copy_06', ctx.owner); else ctx.log('幻灯の呪文が見つからない'); } } });

  reg({ id: 'relic_mirror_crown', name: '鏡の冠', rarity: 'rare', category: 'lineage', lineage: 'copy', text: '自分の幻影は攻撃力+1',
    effects: { grants: [{ key: 'phantomAtkBonus', value: 1 }] } });

  reg({ id: 'relic_twin_star_necklace', name: '双子星の首飾り', rarity: 'legend', category: 'lineage', lineage: 'copy', text: '毎ターン、最初に使うカードの効果は2回発動する',
    effects: { onCardPlayed: async function (ctx, ev) {
      if (!isMine(ctx, ev) || ev.isCopy || ctx.owner.playedThisTurn.length !== 1) return;
      const def = DB.get(ev.card.defId);
      if (def.type === 'spell' && !def.reserve && (def.timed === null || def.timed === undefined)) ctx.owner.nextSpellTimes = Math.max(2, ctx.owner.nextSpellTimes || 1);
      else if (def.type === 'monster') ctx.owner.nextSummonTimes = Math.max(2, ctx.owner.nextSummonTimes || 1);
      else return;
      ctx.log('双子星が' + def.name + 'を二重に輝かせる');
    } } });

  // 終焉
  reg({ id: 'relic_skeleton_keys', name: '骸骨の鍵束', rarity: 'common', category: 'lineage', lineage: 'doom', text: '戦闘開始時、山札から鍵カード1枚を探して手札に加える',
    effects: { onBattleStart: async function (ctx) { await ctx.tutor(Fx.isKey, ctx.owner, { prompt: '手札に加える鍵カードを選ぶ' }); } } });

  reg({ id: 'relic_black_candle', name: '黒い蝋燭', rarity: 'rare', category: 'lineage', lineage: 'doom', text: '相手が呪詛で敗北するラインが20から15になる',
    effects: { onBattleStart: async function (ctx) { const o = ctx.game.players[1 - ctx.owner.idx]; o.curseLimit = Math.min(o.curseLimit, 15); ctx.log(o.name + 'の呪詛の限界は' + o.curseLimit + 'になった'); } } });

  reg({ id: 'relic_underworld_contract', name: '冥府の契約書', rarity: 'legend', category: 'lineage', lineage: 'doom', text: '自分がライフを失う効果を使うたび、失った数と同じ呪詛を相手に置く',
    effects: { onLifeLost: async function (ctx, ev) { if (isMine(ctx, ev) && ev.amount > 0) await ctx.addCurse(ctx.game.players[1 - ctx.owner.idx], ev.amount); } } });

  // =====================================================================
  // ボス遺物（6）：ボス撃破時に選ぶ。必ずデメリット付き。
  // =====================================================================
  reg({ id: 'relic_raging_heart', name: '暴走する心臓', rarity: 'boss', category: 'boss', text: '毎ターン、マナ+3', drawback: 'ターン終了時、ライフ-2',
    effects: {
      onTurnStart: async function (ctx, ev) { if (isMine(ctx, ev)) await ctx.gainMana(3, ctx.owner); },
      onTurnEnd: async function (ctx, ev) { if (isMine(ctx, ev) && ctx.game.winner === null) await ctx.loseLife(ctx.owner, 2); }
    } });

  reg({ id: 'relic_blind_prophet_eyepatch', name: '盲目の預言者の眼帯', rarity: 'boss', category: 'boss', text: '毎ターン、カードを2枚多く引く', drawback: '危険度メーターが見えなくなる',
    runEffects: { hideHazard: true },
    effects: { grants: [{ key: 'drawPerTurn', value: 3 }] } });

  reg({ id: 'relic_chain_crown', name: '鎖の王冠', rarity: 'boss', category: 'boss', text: '戦闘開始時、ランダムな禁忌カード1枚を手札に加える', drawback: 'カード報酬の選択肢が3枚から2枚に減る',
    runEffects: { rewardChoices: -1 },
    effects: { onBattleStart: async function (ctx) {
      const pool = DB.pool(function (d) { return d.rarity === 'taboo'; });
      if (!pool.length) { ctx.log('禁忌カードが存在しない'); return; }
      await ctx.addToHand(ctx.rng.pick(pool).id, ctx.owner, { isCopy: true });
    } } });

  reg({ id: 'relic_broken_hourglass', name: '砕けた砂時計', rarity: 'boss', category: 'boss', text: '3ターンごとに追加ターンを得る', drawback: '休憩マスで回復できなくなる',
    runEffects: { noRestHeal: true },
    effects: { onTurnStart: async function (ctx, ev) {
      if (!isMine(ctx, ev) || ev.extra) return;
      if (ctx.owner.turnsTaken > 0 && ctx.owner.turnsTaken % 3 === 0) await ctx.extraTurn(ctx.owner);
    } } });

  reg({ id: 'relic_cursed_chalice', name: '呪われし聖杯', rarity: 'boss', category: 'boss', text: '自分の魔法のコストはすべて-1', drawback: '戦闘開始時、自分に呪詛5',
    effects: { grants: [{ key: 'spellCostDelta', value: -1 }], onBattleStart: async function (ctx) { await ctx.addCurse(ctx.owner, 5); } } });

  reg({ id: 'relic_mad_king_ring', name: '狂王の指輪', rarity: 'boss', category: 'boss', text: '場に出せるモンスターの上限が10体になる', drawback: '敵の上限も10体になる',
    effects: { grants: [{ key: 'maxBoard', value: 10, side: 'any' }] } });

  // =====================================================================
  // 呪われた遺物（4）
  // =====================================================================
  reg({ id: 'relic_heavy_chain', name: '重い鎖', rarity: 'cursed', category: 'cursed', text: '1ターンに使えるカードは8枚まで',
    effects: { grants: [{ key: 'cardsPerTurnLimit', value: 8 }] } });

  reg({ id: 'relic_rotten_apple', name: '腐った林檎', rarity: 'cursed', category: 'cursed', text: '戦闘開始時、ライフ-5',
    effects: { onBattleStart: async function (ctx) { ctx.setLife(ctx.owner, ctx.owner.life - 5); } } });

  reg({ id: 'relic_crying_doll', name: '泣き叫ぶ人形', rarity: 'cursed', category: 'cursed', text: '敵の最初のターン、敵はカードを2枚多く引く',
    effects: { onBattleStart: async function (ctx) {
      const o = ctx.game.players[1 - ctx.owner.idx];
      let n = ctx.status(o, 'drawPerTurn'); if (n === undefined || n === null) n = 1;
      o.flags.nextDrawCount = n + 2;
    } } });

  reg({ id: 'relic_liar_map', name: '嘘つきの地図', rarity: 'cursed', category: 'cursed', text: 'マップの一部のマスが「？」表示になり、中身がわからない',
    runEffects: { mapFog: true }, effects: {} });

  // =====================================================================
  // ボスの遺物（敵専用）
  // =====================================================================
  reg({ id: 'relic_artisan_workbench', name: '職人の作業台', rarity: 'boss', category: 'enemy', enemyOnly: true, lineage: 'accel', refs: ['accel_13', 'boss1_01'],
    text: '戦闘開始時、焚べ火の祭壇かぜんまい仕掛けの不死鳥のどちらか1枚を手札に加える',
    effects: { onBattleStart: async function (ctx) {
      await ctx.tutor(function (c) { return c.defId === 'accel_13' || c.defId === 'boss1_01'; }, ctx.owner, { prompt: '手札に加えるパーツを選ぶ' });
    } } });

  // 欠けた歯車：除外のフックが無いため、相手の行動後・自分のターン開始時に除外ゾーンを調べて1回だけ山札に戻す。
  async function missingGearCheck(ctx) {
    if (ctx.owner.flags.missingGearUsed) return;
    const part = ctx.owner.exile.find(function (c) { return c.defId === 'accel_13' || c.defId === 'boss1_01'; });
    if (!part) return;
    ctx.owner.flags.missingGearUsed = true;
    ctx.putOnBottom(part, ctx.owner); ctx.shuffleDeck(ctx.owner);
    ctx.log('欠けた歯車が' + ctx.nameOf(part) + 'を山札に戻した');
    ctx.emit('moveZone', { uid: part.uid, defId: part.defId, who: ctx.owner.idx, from: 'exile', to: 'deck' });
  }
  reg({ id: 'relic_missing_gear', name: '欠けた歯車', rarity: 'boss', category: 'enemy', enemyOnly: true, lineage: 'accel', refs: ['accel_13', 'boss1_01'],
    text: '戦闘中に1回だけ、除外されたループパーツ（祭壇・ぜんまい仕掛けの不死鳥）を山札に戻す',
    effects: { scope: 'any', onCardPlayed: missingGearCheck, onMonsterDestroyed: missingGearCheck, onTurnStart: missingGearCheck, onTurnEnd: missingGearCheck } });

  reg({ id: 'relic_thunder_baton', name: '雷鳴の指揮棒', rarity: 'boss', category: 'enemy', enemyOnly: true, lineage: 'chain', text: '毎ターン、連鎖数+2の状態で始まる',
    effects: { grants: [{ key: 'chainAtTurnStart', value: 2 }] } });

  reg({ id: 'relic_eye_of_storm', name: '嵐の目', rarity: 'boss', category: 'enemy', enemyOnly: true, lineage: 'chain', text: '各戦闘で1回、連鎖数が10に達したとき、手札が5枚になるまで引く',
    effects: { onChainReached: async function (ctx, ev) {
      if (!isMine(ctx, ev) || ctx.owner.flags.eyeOfStormUsed || ev.chain < 10) return;
      ctx.owner.flags.eyeOfStormUsed = true;
      const k = 5 - ctx.owner.hand.length;
      if (k > 0) await ctx.draw(k, ctx.owner);
    } } });

  reg({ id: 'relic_thief_gloves', name: '盗人の手袋', rarity: 'boss', category: 'enemy', enemyOnly: true, lineage: 'time',
    text: '戦闘開始時、プレイヤーの手札からランダムに1枚を奪い、戦闘中だけ自分の手札にする',
    effects: { onBattleStart: async function (ctx) {
      const o = ctx.game.players[1 - ctx.owner.idx];
      if (!o.hand.length) return;
      const c = ctx.rng.pick(o.hand);
      if (c.stolenFrom === null) c.stolenFrom = o.idx;
      await ctx.addToHand(c, ctx.owner);
      ctx.log(ctx.owner.name + 'は' + ctx.nameOf(c) + 'を盗んだ');
    } } });

  reg({ id: 'relic_mad_hourglass', name: '狂った砂時計', rarity: 'boss', category: 'enemy', enemyOnly: true, lineage: 'time', text: '3ターン目の開始時に1回、追加ターンを得る',
    effects: { onTurnStart: async function (ctx, ev) {
      if (!isMine(ctx, ev) || ctx.owner.flags.madHourglassUsed || ctx.owner.turnsTaken !== 3) return;
      ctx.owner.flags.madHourglassUsed = true;
      await ctx.extraTurn(ctx.owner);
    } } });

  reg({ id: 'relic_appraiser_loupe', name: '鑑定士のルーペ', rarity: 'boss', category: 'enemy', enemyOnly: true, lineage: 'doom',
    text: '戦闘開始時、プレイヤーの山札の上3枚を見て、1枚を蒐集箱に入れる（妨害カードを優先する）',
    effects: { onBattleStart: async function (ctx) {
      const o = ctx.game.players[1 - ctx.owner.idx];
      const top = ctx.lookTop(3, o).slice();
      if (!top.length) return;
      const pick = top.find(function (c) { return DB.get(c.defId).tags.indexOf('disrupt') >= 0 || DB.get(c.defId).role === 'disrupt'; }) || top[0];
      await ctx.vaultSteal(pick, ctx.owner);
    } } });

  reg({ id: 'relic_dusty_keyring', name: '埃をかぶった鍵束', rarity: 'boss', category: 'enemy', enemyOnly: true, lineage: 'doom', refs: ['doom_05'],
    text: '戦闘開始時、封印ゾーンに終末の鍵・第一が置かれた状態で始まる',
    effects: { onBattleStart: async function (ctx) {
      if (!DB.has('doom_05')) { ctx.log('終末の鍵・第一が存在しない'); return; }
      const inst = ctx.game.createCardInst('doom_05', ctx.owner.idx);
      await ctx.addSeal(inst, ctx.owner);
    } } });

  reg({ id: 'relic_fogged_mirror', name: '曇った姿見', rarity: 'boss', category: 'enemy', enemyOnly: true, lineage: 'copy',
    text: '戦闘開始時、プレイヤーの初期手札5枚を見て、そのうち1枚のコピーを自分の手札に加える',
    effects: { onBattleStart: async function (ctx) {
      const o = ctx.game.players[1 - ctx.owner.idx];
      const hand = o.hand.slice();
      if (!hand.length) return;
      U.reveal(ctx, hand, o.idx, 'hand');
      const id = await ctx.choose(hand.map(function (c) { return { id: c.uid, label: DB.get(c.defId).name }; }), { prompt: 'コピーするカードを選ぶ', chooser: ctx.owner.idx });
      const c = hand.find(function (x) { return x.uid === id; }) || hand[0];
      await ctx.addToHand(c.defId, ctx.owner, { isCopy: true });
    } } });

  // =====================================================================
  // エリートの遺物（敵専用）
  // =====================================================================
  reg({ id: 'relic_dragon_scale', name: '竜の鱗', rarity: 'boss', category: 'enemy', enemyOnly: true, lineage: 'accel', text: '受けるダメージ-1',
    effects: { scope: 'any', modDamage: function (ctx, ev) { return (ev.isPlayer && ev.target.idx === ctx.owner.idx) ? Math.max(0, ev.amount - 1) : ev.amount; } } });

  reg({ id: 'relic_binding_bookmark', name: '封じ紐の栞', rarity: 'boss', category: 'enemy', enemyOnly: true, lineage: 'cycle', text: '戦闘開始時、相手の初期手札は4枚になる',
    effects: { grants: [{ key: 'initialHandDelta', value: -1, side: 'enemy' }] } });

  reg({ id: 'relic_charged_horn', name: '帯電した角', rarity: 'boss', category: 'enemy', enemyOnly: true, lineage: 'chain', text: '毎ターン、連鎖数+1の状態で始まる',
    effects: { grants: [{ key: 'chainAtTurnStart', value: 1 }] } });

  reg({ id: 'relic_stuffing_torso', name: '綿のはみ出た胴', rarity: 'boss', category: 'enemy', enemyOnly: true, lineage: 'doom', text: '受けたダメージが10以上のとき、相手に呪詛1',
    effects: { onPlayerDamaged: async function (ctx, ev) { if (isMine(ctx, ev) && ev.amount >= 10) await ctx.addCurse(ctx.game.players[1 - ctx.owner.idx], 1); } } });

  reg({ id: 'relic_spare_gear', name: '予備の歯車', rarity: 'boss', category: 'enemy', enemyOnly: true, lineage: 'time', text: '戦闘開始時、マナ+2',
    // one-time +2 mana on the first turn (max mana still starts at 1)
    effects: { onBattleStart: async function (ctx) { ctx.owner.flags.firstTurnManaBonus = (ctx.owner.flags.firstTurnManaBonus || 0) + 2; } } });

  reg({ id: 'relic_mask_pile', name: '仮面の山', rarity: 'boss', category: 'enemy', enemyOnly: true, lineage: 'copy', text: '自分の幻影は体力+1',
    effects: { grants: [{ key: 'phantomHpBonus', value: 1 }] } });
})(globalThis.G = globalThis.G || {});
