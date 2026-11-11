(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // cards_boss.js — ボスの切り札（bossOnly）・補助の専用カード（bossAux）・エリートの切り札。
  // 切り札: bossOnly:true, rarity:'boss'。補助: rarity:'boss', bossOnly:false, tags:['bossAux']。
  // lineage はそのボスの系統。
  // ---------------------------------------------------------------
  const Fx = G.Fx;
  const DB = G.CardDB;
  const U = G.DataUtil;

  function trump(def) { def.bossOnly = true; def.rarity = 'boss'; def.tags = (def.tags || []).concat(['bossTrump']); return DB.register(def); }
  function aux(def) { def.bossOnly = false; def.rarity = 'boss'; def.tags = (def.tags || []).concat(['bossAux']); return DB.register(def); }

  // =====================================================================
  // ボス1：ループ職人（加速）
  // =====================================================================
  trump({ id: 'boss1_01', name: 'ぜんまい仕掛けの不死鳥', type: 'monster', lineage: 'accel', role: 'engine', cost: 0, atk: 1, hp: 1,
    tags: ['loopPart'],
    text: '1/1。召喚時、マナ+1。場を離れたとき、手札に戻る',
    effects: { onSummon: Fx.gainMana(1), onLeave: async function (ctx) { await ctx.returnToHand(ctx.card); } } });

  trump({ id: 'boss1_02', name: '最後の一周', type: 'spell', lineage: 'accel', role: 'finisher', cost: 1, tags: ['finisher'],
    text: 'このターンに自分が得たマナの合計と同じダメージを与える',
    // 量は使った側（ctx.owner）で測る：全反転の下でも「相手が得た分」が相手自身に返るようにするため
    effects: { onPlay: Fx.dmgOpp(function (ctx) { return ctx.owner.manaGainedThisTurn; }) } });

  trump({ id: 'boss1_03', name: 'からくり巨兵・終', type: 'monster', lineage: 'accel', role: 'finisher', cost: 6, atk: 6, hp: 6, keywords: ['rush'], tags: ['finisher'],
    text: '6/6。速攻。召喚時、このターンに自分のモンスターが手札に戻った回数×3ダメージを与える',
    effects: { onSummon: Fx.dmgOpp(function (ctx) { return ctx.owner.returnedToHandThisTurn * 3; }) } });

  aux({ id: 'boss1_04', name: '職人の予備部品', type: 'spell', lineage: 'accel', role: 'fuel', cost: 1,
    text: '墓地か除外ゾーンから、ループパーツ1枚を手札に戻す',
    effects: { onPlay: async function (ctx) {
      const c = await U.chooseCardAcross(ctx, ctx.me, ['grave', 'exile'], U.isLoopPart, '手札に戻すループパーツを選ぶ');
      if (!c) { ctx.log('ループパーツは見つからなかった'); return; }
      await ctx.addToHand(c, ctx.me);
    } } });

  aux({ id: 'boss1_05', name: 'からくり人形', type: 'monster', lineage: 'accel', role: 'fuel', cost: 2, atk: 2, hp: 2,
    text: '2/2。破壊時、マナ+1（祭壇で壊すための部品）',
    effects: { onDeath: Fx.gainMana(1) } });

  // =====================================================================
  // ボス2：ストームの魔術師（連鎖）
  // =====================================================================
  trump({ id: 'boss2_01', name: '嵐の指揮者', type: 'monster', lineage: 'chain', role: 'engine', cost: 3, atk: 1, hp: 3,
    text: '1/3。常在：自分の連鎖数は2倍として扱う。このモンスターが破壊されると、そのターンの連鎖数は0に戻る',
    effects: {
      grants: [{ key: 'chainMultiplier', value: 2 }],
      onDeath: async function (ctx) { await ctx.setChain(0, ctx.owner); ctx.log('指揮者を失い、嵐は止んだ'); }
    } });

  trump({ id: 'boss2_02', name: '終曲・万雷', type: 'spell', lineage: 'chain', role: 'finisher', cost: 3, tags: ['finisher'],
    text: '連鎖数×3ダメージを与える。連鎖数が20以上なら、さらに相手の場のモンスターをすべて破壊する',
    effects: { onPlay: async function (ctx) {
      const chain = ctx.chainOf(ctx.owner);
      await ctx.damage(ctx.opp, chain * 3);
      if (chain >= 20) {
        const list = ctx.monstersOf(ctx.opp).slice();
        for (let i = 0; i < list.length; i++) await ctx.destroy(list[i]);
      }
    } } });

  trump({ id: 'boss2_03', name: '嵐の化身', type: 'monster', lineage: 'chain', role: 'finisher', cost: 5, atk: 'X', hp: 'X', keywords: ['rush'], tags: ['finisher'],
    text: 'X/X。速攻。Xはこのターンの連鎖数',
    effects: { onSummon: async function (ctx) {
      const x = Math.max(1, ctx.chainOf(ctx.owner));
      ctx.card.atk = x; ctx.card.hp = x; ctx.card.maxHp = x;
      ctx.log('嵐の化身は' + x + '/' + x + 'になった');
    } } });

  aux({ id: 'boss2_04', name: '嵐の前奏曲', type: 'spell', lineage: 'chain', role: 'fuel', cost: 0,
    text: 'このターンの連鎖数+2。カードを1枚引く',
    effects: { onPlay: Fx.seq(Fx.addChain(2), Fx.draw(1)) } });

  aux({ id: 'boss2_05', name: '稲妻の楽団員', type: 'monster', lineage: 'chain', role: 'fuel', cost: 1, atk: 1, hp: 1,
    text: '1/1。召喚時、このターンの連鎖数+1。破壊時、カードを1枚引く',
    effects: { onSummon: Fx.addChain(1), onDeath: Fx.draw(1) } });

  // =====================================================================
  // ボス3：時間泥棒（時間）
  // =====================================================================
  trump({ id: 'boss3_01', name: '時盗みの魔女', type: 'monster', lineage: 'time', role: 'engine', cost: 4, atk: 2, hp: 3,
    text: '2/3。常在：自分の追加ターン開始時、墓地の魔法1枚を手札に戻す。このモンスターが破壊されたとき、ボスの次のターンはスキップされる',
    effects: {
      onExtraTurnStart: Fx.recoverFromGrave(function (inst, def) { return def.type === 'spell'; }, '手札に戻す魔法を選ぶ'),
      onDeath: async function (ctx) { ctx.skipTurn(ctx.owner); }
    } });

  trump({ id: 'boss3_02', name: '奪われた砂時計', type: 'spell', lineage: 'time', role: 'engine', cost: 4, tags: ['extraTurn', 'hourglass'],
    text: '追加ターンを得る。相手が次のターン開始時に引くカードは0枚になる',
    effects: { onPlay: async function (ctx) {
      await ctx.extraTurn(ctx.me);
      ctx.opp.flags.nextDrawCount = 0;
      ctx.log(ctx.opp.name + 'の次のドローは盗まれた');
    } } });

  trump({ id: 'boss3_03', name: '刻限の処刑', type: 'spell', lineage: 'time', role: 'finisher', cost: 2, tags: ['finisher'],
    text: '連続ターン数×8ダメージを与える',
    effects: { onPlay: Fx.dmgOpp(function (ctx) { return ctx.game.streak * 8; }) } });

  trump({ id: 'boss3_04', name: '時を喰らう獣', type: 'monster', lineage: 'time', role: 'finisher', cost: 5, atk: 3, hp: 3, keywords: ['rush'], tags: ['finisher'],
    text: '3/3。速攻。自分のターンが連続するたびに+3/+3（場にいる限り累積する）',
    effects: { onExtraTurnStart: async function (ctx) { await ctx.buff(ctx.card, { atk: 3, hp: 3 }); ctx.log('時を喰らう獣は大きくなった'); } } });

  aux({ id: 'boss3_05', name: 'くすねた一秒', type: 'spell', lineage: 'time', role: 'fuel', cost: 0,
    text: 'マナ+1。自分の時限カード1枚のカウント-1',
    effects: { onPlay: async function (ctx) {
      await ctx.gainMana(1);
      if (!ctx.me.timed.length) return;
      const picked = await ctx.pick({ kind: 'timedCard', side: 'ally', count: 1, prompt: 'カウントを進める時限カードを選ぶ' });
      if (picked[0]) await ctx.adjustTimed([picked[0]], -1, ctx.me);
    } } });

  aux({ id: 'boss3_06', name: '影の掏摸', type: 'monster', lineage: 'time', role: 'disrupt', cost: 1, atk: 1, hp: 1, tags: ['disrupt'],
    text: '1/1。召喚時、相手の手札をランダムに1枚見る。それが魔法なら、この戦闘中そのコスト+2',
    effects: { onSummon: async function (ctx) {
      if (!ctx.opp.hand.length) return;
      const c = ctx.rng.pick(ctx.opp.hand);
      U.reveal(ctx, [c], ctx.opp.idx, 'hand');
      if (DB.get(c.defId).type === 'spell') { c.costMod = (c.costMod || 0) + 2; ctx.log(DB.get(c.defId).name + 'のコストは+2された'); }
    } } });

  // =====================================================================
  // ボス4：蒐集者（終焉）
  // =====================================================================
  trump({ id: 'boss4_01', name: '陳列棚の鍵', type: 'spell', lineage: 'doom', role: 'engine', cost: 3, key: 'wild', tags: ['key'],
    text: '封印ゾーンに置く。まだそろっていない種類の鍵として扱う',
    effects: { onPlay: Fx.seal() } });

  trump({ id: 'boss4_02', name: '蒐集の目録', type: 'crest', lineage: 'doom', role: 'engine', cost: 3,
    text: '自分のターン開始時、山札か墓地から鍵カード1枚を手札に加える',
    effects: { onTurnStart: async function (ctx) {
      const c = await U.chooseCardAcross(ctx, ctx.owner, ['deck', 'grave'], Fx.isKey, '手札に加える鍵カードを選ぶ');
      if (!c) { ctx.log('鍵カードは見つからなかった'); return; }
      const fromDeck = c.zone === 'deck';
      await ctx.addToHand(c, ctx.owner);
      if (fromDeck) ctx.shuffleDeck(ctx.owner);
    } } });

  trump({ id: 'boss4_03', name: '最後の展示', type: 'spell', lineage: 'doom', role: 'finisher', cost: 5, tags: ['finisher'],
    text: '自分の封印ゾーンに鍵が4種以上あるなら、勝利する',
    effects: { onPlay: async function (ctx) {
      if (ctx.game.distinctKeys(ctx.me.idx) >= 4) ctx.specialWin(ctx.me, 'seals');
      else ctx.log('展示はまだ完成していない');
    } } });

  trump({ id: 'boss4_04', name: '標本の巨人', type: 'monster', lineage: 'doom', role: 'finisher', cost: 6, atk: 'X', hp: 'X', keywords: ['rush'], tags: ['finisher'],
    text: 'X/X。速攻。Xは蒐集箱にあるカードの枚数×2',
    effects: { onSummon: async function (ctx) {
      const x = Math.max(1, ctx.owner.vault.length * 2);
      ctx.card.atk = x; ctx.card.hp = x; ctx.card.maxHp = x;
      ctx.log('標本の巨人は' + x + '/' + x + 'になった');
    } } });

  aux({ id: 'boss4_05', name: '蒐集家の網', type: 'spell', lineage: 'doom', role: 'disrupt', cost: 2, tags: ['disrupt'],
    text: '相手の場か墓地のカード1枚を蒐集箱に入れる',
    effects: { onPlay: async function (ctx) {
      const c = await U.chooseCardAcross(ctx, ctx.opp, ['board', 'crests', 'grave'], function (inst) { return !inst.isPhantom && !inst.isCopy; }, '蒐集箱に入れるカードを選ぶ');
      if (!c) return;
      await ctx.vaultSteal(c, ctx.me);
    } } });

  aux({ id: 'boss4_06', name: 'ガラス瓶の妖精', type: 'monster', lineage: 'doom', role: 'disrupt', cost: 1, atk: 1, hp: 1, tags: ['disrupt'],
    text: '1/1。破壊時、相手の手札からランダムに1枚を蒐集箱に入れる',
    effects: { onDeath: async function (ctx) {
      if (!ctx.opp.hand.length) return;
      await ctx.vaultSteal(ctx.rng.pick(ctx.opp.hand), ctx.me);
    } } });

  // =====================================================================
  // ボス5：鏡の主（複製）
  // =====================================================================
  // 鏡像の写し：game.prevTurnActions（直前のターンの行動記録）のうち相手の「使う」行動を順にコピーして
  // コストを払わずに使う。攻撃・起動型能力は再現しない。対象は defId で現在の盤面から引き直し、見つからなければ
  // 対象なしで解決する。予約魔法・時限魔法のコピーは即時効果を持たないため飛ばす（DEVIATIONS 参照）。
  trump({ id: 'boss5_01', name: '鏡像の写し', type: 'spell', lineage: 'copy', role: 'engine', cost: 2,
    text: '相手が前のターンに使ったカードを、同じ順番ですべてコピーして、コストを払わずに使う',
    effects: { onPlay: async function (ctx) {
      const g = ctx.game;
      const acts = (g.prevTurnActions || []).filter(function (a) { return a.type === 'play' && a.who === ctx.opp.idx; });
      if (!acts.length) { ctx.log('映すものがなかった'); return; }
      ctx.log(ctx.opp.name + 'の前のターン（' + acts.length + '枚）を映す');
      for (let i = 0; i < acts.length && g.winner === null; i++) {
        const a = acts[i];
        if (!DB.has(a.defId)) continue;
        const def = DB.get(a.defId);
        if (def.reserve || (def.timed !== null && def.timed !== undefined)) { ctx.log(def.name + 'は映せなかった'); continue; }
        let targets;
        if (a.targetDefs && a.targetDefs.length && def.targets) {
          const cands = ctx.candidatesFor(def.targets);
          const used = [];
          targets = a.targetDefs.map(function (t) {
            if (t === 'face' || t === 'opp' || t === 'me') return t;
            const f = cands.find(function (c) { return c.defId === t.defId && used.indexOf(c) < 0; });
            if (f) used.push(f);
            return f ? f.uid : null;
          }).filter(function (t) { return t !== null; });
        }
        await ctx.cast(a.defId, ctx.me, { copy: true, targets: targets, choices: a.choices ? G.util.deepClone(a.choices) : {} });
      }
    } } });

  trump({ id: 'boss5_02', name: '裏返った姿見', type: 'crest', lineage: 'copy', role: 'engine', cost: 3,
    text: '相手が与えるダメージの半分を、相手自身も受ける',
    effects: { scope: 'any', onDamageDealt: async function (ctx, ev) {
      const ownerIdx = ctx.owner.idx;
      if (ev.sourceOwner === undefined || ev.sourceOwner === null || ev.sourceOwner === ownerIdx) return;
      if (ev.reflectedByMirror) return;
      const half = Math.floor(ev.amount / 2);
      if (half <= 0) return;
      const victim = ctx.game.players[ev.sourceOwner];
      ctx.log('姿見が' + victim.name + 'のダメージを映し返す');
      await ctx.damage(victim, half, { source: ctx.card, sourceOwner: ownerIdx, noReflect: true, reflectedByMirror: true });
    } } });

  trump({ id: 'boss5_03', name: '終わりの自画像', type: 'spell', lineage: 'copy', role: 'finisher', cost: 4, tags: ['finisher'],
    text: '相手がこの戦闘で一度に与えた最大のダメージと同じダメージを与える',
    effects: { onPlay: Fx.dmgOpp(function (ctx) { return ctx.game.players[1 - ctx.owner.idx].maxDamageDealtOnce; }) } });

  // もう一人の挑戦者：相手の場で最も攻撃力の高いモンスターの「コピー」を速攻付きで場に出し、このカード自身は墓地へ。
  // コピーは元のカードの効果（召喚時含む）をそのまま持つ。相手の場にモンスターがいなければ 1/1 速攻のまま。
  trump({ id: 'boss5_04', name: 'もう一人の挑戦者', type: 'monster', lineage: 'copy', role: 'finisher', cost: 6, atk: 1, hp: 1, keywords: ['rush'], tags: ['finisher'],
    text: '速攻。召喚時、相手の場で一番攻撃力が高いモンスターと同じ攻撃力・体力・効果を持つ',
    effects: { onSummon: async function (ctx) {
      const g = ctx.game;
      const list = ctx.monstersOf(ctx.opp);
      if (!list.length) { ctx.log('映す相手がいない'); return; }
      let best = list[0];
      for (let i = 1; i < list.length; i++) if (g.atkOf(list[i]) > g.atkOf(best)) best = list[i];
      const self = ctx.card;
      const copy = g.createCardInst(best.defId, ctx.owner.idx, { isCopy: true });
      copy.atk = g.atkOf(best); copy.hp = g.maxHpOf(best); copy.maxHp = copy.hp;
      copy.keywords = best.keywords.slice(); if (copy.keywords.indexOf('rush') < 0) copy.keywords.push('rush');
      ctx.log('もう一人の挑戦者は' + ctx.nameOf(best) + 'の姿になった');
      g.removeFromZone(self); self.zone = 'limbo';
      await ctx.toGrave(self, { reason: 'transformed' });
      await ctx.summon(copy, ctx.owner, { keepStats: true });
    } } });

  aux({ id: 'boss5_05', name: 'ひび割れた手鏡', type: 'spell', lineage: 'copy', role: 'fuel', cost: 1, tags: ['phantomMaker'],
    text: '自分の場のモンスター1体の幻影を1体出す。カードを1枚引く',
    targets: { kind: 'boardMonster', side: 'ally', count: 1, optional: true, prompt: '幻影を出すモンスターを選ぶ' },
    effects: { onPlay: Fx.seq(Fx.phantomOfTarget(1), Fx.draw(1)) } });

  // =====================================================================
  // エリートの切り札
  // =====================================================================
  trump({ id: 'elite1_01', name: '溶けた心臓', type: 'crest', lineage: 'accel', role: 'finisher', cost: 3,
    text: '自分がマナを得るたび、相手に1ダメージ',
    effects: { onManaGained: Fx.dmgOpp(1) } });

  trump({ id: 'elite2_01', name: '禁書の頁', type: 'spell', lineage: 'cycle', role: 'disrupt', cost: 2, tags: ['disrupt'],
    text: '相手の手札をすべて山札に戻してシャッフルし、相手は3枚引く',
    effects: { onPlay: async function (ctx) { ctx.shuffleHandIntoDeck(ctx.opp); ctx.log(ctx.opp.name + 'の手札は山札に戻された'); await ctx.draw(3, ctx.opp); } } });

  trump({ id: 'elite3_01', name: '二つ首の咆哮', type: 'spell', lineage: 'chain', role: 'finisher', cost: 3, tags: ['finisher'],
    text: '連鎖数×2ダメージを2回与える',
    effects: { onPlay: Fx.times(2, Fx.dmgOpp(function (ctx) { return ctx.chainOf(ctx.owner) * 2; })) } });

  trump({ id: 'elite4_01', name: '呪いの人形箱', type: 'crest', lineage: 'doom', role: 'engine', cost: 3,
    text: '自分のターン開始時、相手に呪詛2',
    effects: { onTurnStart: Fx.curse(2) } });

  // 緊急停止：SPEC では予約魔法だが、「相手の次のターンを丸ごとスキップ」は使用時に skipTurn を予約する形で実装する
  // （予約魔法として相手ターン開始時に発動すると、そのターンは既に始まっているため）。反魔の護符は SPEC どおり有効。
  trump({ id: 'elite5_01', name: '緊急停止', type: 'spell', lineage: 'time', role: 'disrupt', cost: 5, tags: ['disrupt', 'reserveLike'],
    text: '相手の次のターンを丸ごとスキップする（戦闘中1回のみ）',
    effects: {
      canPlay: function (ctx) { return !ctx.owner.flags.emergencyStopUsed; },
      onPlay: async function (ctx) {
        ctx.owner.flags.emergencyStopUsed = true;
        if (ctx.status(ctx.opp, 'immuneReserve')) { ctx.log(ctx.opp.name + 'は予約魔法の効果を受けない'); return; }
        ctx.skipTurn(ctx.opp);
      }
    } });

  trump({ id: 'elite6_01', name: '千の仮面', type: 'spell', lineage: 'copy', role: 'finisher', cost: 4, tags: ['phantomMaker'],
    text: '自分の場のモンスター1体につき幻影を2体出す。このターン、幻影も召喚時効果を発動する',
    effects: { onPlay: async function (ctx) {
      ctx.setStatus(ctx.me, 'phantomSummonEffects', true, { untilEndOfTurnOf: 'thisTurn' });
      const list = ctx.me.board.slice();
      for (let i = 0; i < list.length; i++) await ctx.createPhantom(list[i], ctx.me, { count: 2, triggerSummon: true });
    } } });

  // ---- 竜のエリート（2026-11）: 竜笛の巫女 / 鏡鱗の竜騎士 / 古竜の墓守 -----------------------------
  function isDragonInst(inst) { const d = DB.tryGet(inst.defId); return !!(d && d.tags.indexOf('dragon') >= 0); }
  trump({ id: 'elite7_01', name: '竜笛', type: 'spell', lineage: 'accel', role: 'engine', cost: 1,
    text: '山札から竜を2枚手札に加え、手札の竜すべてのコスト-1',
    effects: { onPlay: async function (ctx) {
      const pred = function (c, d) { return d.tags.indexOf('dragon') >= 0 && !d.uncastable; };
      for (let i = 0; i < 2; i++) { const got = await ctx.tutor(pred, ctx.me, { prompt: '手札に加える竜を選ぶ' }); if (!got) break; }
      const list = ctx.me.hand.filter(function (c) { return isDragonInst(c) && !DB.get(c.defId).uncastable; });
      list.forEach(function (c) { c.costMod = (c.costMod || 0) - 1; });
      if (list.length) ctx.log('手札の竜' + list.length + '枚のコスト-1');
    } } });

  trump({ id: 'elite8_01', name: '竜騎士の号令', type: 'spell', lineage: 'copy', role: 'finisher', cost: 2, tags: ['finisher'],
    text: '自分の竜すべて（幻影を含む）に+2/+2と速攻',
    effects: { onPlay: async function (ctx) {
      const list = ctx.monstersOf(ctx.me).filter(isDragonInst);
      if (!list.length) { ctx.log('場に竜がいない'); return; }
      for (let i = 0; i < list.length; i++) { ctx.addKeyword(list[i], 'rush'); await ctx.buff(list[i], { atk: 2, hp: 2 }); }
    } } });

  trump({ id: 'elite9_01', name: '竜墓の鐘', type: 'crest', lineage: 'doom', role: 'engine', cost: 3,
    text: '自分の竜が破壊されるたび、相手に呪詛2',
    effects: { onMonsterDestroyed: async function (ctx, ev) {
      if (ev.who !== ctx.owner.idx || !ev.card || !isDragonInst(ev.card)) return;
      await ctx.addCurse(ctx.game.players[1 - ctx.owner.idx], 2);
    } } });
})(globalThis.G = globalThis.G || {});
