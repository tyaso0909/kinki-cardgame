(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // cards_dragon.js — 竜を軸にしたカード 26枚（2026-11）
  //   各系統の子竜・補助・大きな竜（18）＋汎用2＋禁忌の竜6（汎用以外の各系統）。
  //   竜 = tags 'dragon' (shown as a 竜 chip). ids continue each lineage's numbering.
  //   禁忌の竜: uncastable (cost ∞). effects.handAbility (once per turn, from the hand): destroy 4 monsters on
  //   the field — either side, phantoms count, 加護 doesn't protect — of the same lineage, then put this card's
  //   朧 copy onto the field (counts as a summon: 召喚時 fires). The card itself stays in hand.
  // ---------------------------------------------------------------
  const Fx = G.Fx;
  const DB = G.CardDB;

  function defOf(inst) { return DB.get(inst.defId); }
  function isDragon(inst) { return defOf(inst).tags.indexOf('dragon') >= 0; }
  function myDragons(ctx) { return ctx.monstersOf(ctx.me).filter(isDragon); }
  const TABOO_COST = 4;

  // pick one dragon in my hand (not the source card) — for cost reductions
  async function pickHandDragon(ctx, prompt, extra) {
    const self = ctx.card;
    const ok = function (c) { return c !== self && isDragon(c) && (!extra || extra(c)); };
    if (!ctx.me.hand.some(ok)) { ctx.log('手札に竜がいない'); return null; }
    const picked = await ctx.pick({ kind: 'handCard', side: 'ally', count: 1, filter: function (c2, c) { return ok(c); }, prompt: prompt });
    return picked[0] || null;
  }
  async function reduceHandDragon(ctx, n) {
    const c = await pickHandDragon(ctx, 'コストを下げる手札の竜を選ぶ', function (x) { return !defOf(x).uncastable; });
    if (!c) return;
    c.costMod = (c.costMod || 0) - n;
    ctx.log(ctx.nameOf(c) + 'のコスト-' + n);
  }

  // ---- 禁忌の竜: shared hand ability -------------------------------------------------
  function tabooFodder(ctx, lineage) {
    return ctx.monstersOf(0).concat(ctx.monstersOf(1)).filter(function (m) { return defOf(m).lineage === lineage; });
  }
  function tabooAbility(lineage) {
    return {
      label: '朧を場に出す',
      oncePerTurn: true,
      canUse: function (ctx) { return tabooFodder(ctx, lineage).length >= TABOO_COST; },
      use: async function (ctx) {
        const g = ctx.game;
        const lin = G.ui && G.ui.labels && G.ui.labels.LINEAGE[lineage] ? G.ui.labels.LINEAGE[lineage].name : lineage;
        const picked = await ctx.pick({
          kind: 'monster', side: 'any', count: TABOO_COST, ignoreWard: true, alwaysAsk: true, cancelable: true,
          filter: function (c2, m) { return defOf(m).lineage === lineage; },
          prompt: '破壊する' + lin + 'のモンスターを' + TABOO_COST + '体選ぶ（相手のモンスター・幻影も選べる）'
        });
        // cancelled / not enough chosen: nothing happens and the once-per-turn use is given back
        if (picked.length < TABOO_COST) { ctx.card.flags.abilityUsedTurn = null; ctx.log('禁忌召喚をやめた'); return; }
        for (let i = 0; i < picked.length; i++) if (g.isInPlay(picked[i])) await ctx.destroy(picked[i], { source: ctx.card });
        if (g.winner !== null) return;
        if (ctx.me.board.length >= ctx.status(ctx.me, 'maxBoard')) { ctx.log('場がいっぱいで出せない'); return; }
        const inst = g.createCardInst(ctx.card.defId, ctx.me.idx, {});
        inst.oboro = true;
        ctx.log(ctx.me.name + 'は朧の' + ctx.nameOf(inst) + 'を場に出した');
        await ctx.summon(inst, ctx.me);
      }
    };
  }
  function taboo(def) {
    return Object.assign({
      type: 'monster', role: 'finisher', rarity: 'taboo', cost: 99, uncastable: true,
      tags: ['dragon', 'finisher']
    }, def, {
      // 禁忌召喚 is explained in the card detail (G.ui.TERMS)
      text: '禁忌召喚（' + def.linName + '4体）。' + def.text,
      effects: Object.assign({ handAbility: tabooAbility(def.lineage) }, def.effects)
    });
  }

  const DEFS = [
    // ================================================================ 加速（炎竜）
    { id: 'accel_36', name: '炎竜の幼体', type: 'monster', lineage: 'accel', role: 'fuel', rarity: 'common',
      cost: 2, atk: 1, hp: 2, tags: ['dragon'],
      text: '1/2。召喚時、手札の竜1枚のコスト-2',
      effects: { onSummon: function (ctx) { return reduceHandDragon(ctx, 2); } } },
    { id: 'accel_37', name: '竜の咆哮', type: 'spell', lineage: 'accel', role: 'finisher', rarity: 'rare',
      cost: 2, tags: ['finisher'],
      text: '自分の場の竜1体につき、相手に3ダメージを与える',
      effects: { onPlay: async function (ctx) {
        const n = myDragons(ctx).length;
        if (!n) { ctx.log('場に竜がいない'); return; }
        await ctx.damage(ctx.opp, n * 3);
      } } },
    { id: 'accel_38', name: '原初の焔竜', type: 'monster', lineage: 'accel', role: 'finisher', rarity: 'legend',
      cost: 9, atk: 9, hp: 9, keywords: ['rush'], tags: ['dragon', 'finisher'],
      text: '9/9。速攻。召喚時、自分の場の他の竜すべてに速攻と+3/+3',
      flavor: '最初の火は、竜が吐いた。',
      effects: { onSummon: async function (ctx) {
        const list = myDragons(ctx).filter(function (m) { return m !== ctx.card; });
        for (let i = 0; i < list.length; i++) { ctx.addKeyword(list[i], 'rush'); await ctx.buff(list[i], { atk: 3, hp: 3 }); }
      } } },
    // ================================================================ 循環（水竜・書）
    { id: 'cycle_31', name: '潮騒の子竜', type: 'monster', lineage: 'cycle', role: 'fuel', rarity: 'common',
      cost: 1, atk: 1, hp: 2, tags: ['dragon'],
      text: '1/2。召喚時、山札から竜1枚を探して手札に加える',
      effects: { onSummon: Fx.tutor(function (c, d) { return d.tags.indexOf('dragon') >= 0; }, { prompt: '手札に加える竜を選ぶ' }) } },
    { id: 'cycle_32', name: '竜の書庫', type: 'crest', lineage: 'cycle', role: 'engine', rarity: 'rare',
      cost: 3, text: '自分が竜を出すたび、カードを2枚引く',
      effects: { onMonsterSummoned: async function (ctx, ev) { if (ev.card && isDragon(ev.card)) await ctx.draw(2); } } },
    { id: 'cycle_33', name: '大渦の古竜', type: 'monster', lineage: 'cycle', role: 'engine', rarity: 'legend',
      cost: 9, atk: 8, hp: 10, tags: ['dragon'],
      text: '8/10。召喚時、自分の墓地の竜をすべて手札に戻す',
      flavor: '渦の底には、沈んだ竜の数だけ目がある。',
      effects: { onSummon: async function (ctx) {
        const list = ctx.me.grave.filter(isDragon);
        if (!list.length) { ctx.log('墓地に竜がいない'); return; }
        for (let i = 0; i < list.length; i++) await ctx.addToHand(list[i], ctx.me);
      } } },
    // ================================================================ 連鎖（雷竜）
    { id: 'chain_32', name: '雷竜の雛', type: 'monster', lineage: 'chain', role: 'fuel', rarity: 'common',
      cost: 0, atk: 1, hp: 1, keywords: ['charge'], tags: ['dragon'],
      text: '1/1。突進。召喚時、連鎖数+1',
      effects: { onSummon: Fx.addChain(1) } },
    { id: 'chain_33', name: '迅雷の竜翼', type: 'spell', lineage: 'chain', role: 'finisher', rarity: 'rare',
      cost: 1, tags: ['finisher'],
      text: 'このターン、自分の竜すべてに速攻と連撃を与える',
      effects: { onPlay: function (ctx) {
        const list = myDragons(ctx);
        if (!list.length) { ctx.log('場に竜がいない'); return; }
        list.forEach(function (m) { ctx.addKeywordsThisTurn(m, ['rush', 'double']); });
      } } },
    { id: 'chain_34', name: '万雷の竜神', type: 'monster', lineage: 'chain', role: 'finisher', rarity: 'legend',
      cost: 10, atk: 10, hp: 10, keywords: ['rush'], tags: ['dragon', 'finisher'],
      text: '10/10。速攻。召喚時、連鎖数と同じダメージを、相手と相手のモンスターすべてに与える',
      flavor: '雷鳴の数だけ、神は大きくなる。',
      effects: { onSummon: async function (ctx) {
        const n = ctx.chainOf(ctx.me);
        if (n > 0) await Fx.dmgOppAndBoard(n)(ctx);
      } } },
    // ================================================================ 時間（時竜）
    { id: 'time_32', name: '眠る時竜', type: 'monster', lineage: 'time', role: 'disrupt', rarity: 'common',
      cost: 2, atk: 0, hp: 4, keywords: ['guard'], tags: ['dragon'],
      text: '0/4。守護。自分のターン開始時、+2/+2',
      effects: { onTurnStart: async function (ctx) { if (ctx.game.isInPlay(ctx.card)) await ctx.buff(ctx.card, { atk: 2, hp: 2 }); } } },
    { id: 'time_33', name: '竜の刻', type: 'spell', lineage: 'time', role: 'engine', rarity: 'rare',
      cost: 3, timed: 1,
      text: '時限1：手札の竜1体を、コストを払わずに出す',
      effects: { onTimed: async function (ctx) {
        if (ctx.me.board.length >= ctx.status(ctx.me, 'maxBoard')) { ctx.log('場がいっぱいで出せない'); return; }
        const c = await pickHandDragon(ctx, 'コストを払わずに出す竜を選ぶ', function (x) { return defOf(x).type === 'monster' && !defOf(x).uncastable; });
        if (c) await ctx.summon(c, ctx.me);
      } } },
    { id: 'time_34', name: '千年の時竜', type: 'monster', lineage: 'time', role: 'engine', rarity: 'legend',
      cost: 10, atk: 10, hp: 10, tags: ['dragon'],
      text: '10/10。召喚時、追加ターンを得る。自分の追加ターン開始時、手札の竜1枚のコストを0にする',
      effects: {
        onSummon: Fx.extraTurn(),
        onExtraTurnStart: async function (ctx) {
          const c = await pickHandDragon(ctx, 'コストを0にする手札の竜を選ぶ', function (x) { return !defOf(x).uncastable; });
          if (!c) return;
          c.costMod = (c.costMod || 0) - ctx.game.costOf(ctx.me.idx, c);
          ctx.log(ctx.nameOf(c) + 'のコストが0になった');
        }
      } },
    // ================================================================ 複製（幻竜）
    { id: 'copy_32', name: '鏡鱗の子竜', type: 'monster', lineage: 'copy', role: 'fuel', rarity: 'common',
      cost: 2, atk: 1, hp: 1, tags: ['dragon', 'phantomMaker'],
      text: '1/1。召喚時、このカードの幻影を2体出す（幻影も竜）',
      effects: { onSummon: Fx.phantomOfSelf(2) } },
    { id: 'copy_33', name: '竜の映し身', type: 'spell', lineage: 'copy', role: 'fuel', rarity: 'rare',
      cost: 2, tags: ['phantomMaker'],
      text: '自分の場の竜1体の幻影を3体出す',
      targets: { kind: 'monster', side: 'ally', count: 1, filter: function (c2, m) { return isDragon(m); }, prompt: '幻影を出す竜を選ぶ' },
      effects: { onPlay: Fx.phantomOfTarget(3) } },
    { id: 'copy_34', name: '千鏡の幻竜', type: 'monster', lineage: 'copy', role: 'finisher', rarity: 'legend',
      cost: 8, atk: 6, hp: 6, keywords: ['double'], tags: ['dragon', 'phantomMaker', 'finisher'],
      text: '6/6。連撃。召喚時、自分の場の竜すべての幻影を1体ずつ出す',
      effects: { onSummon: async function (ctx) {
        const list = myDragons(ctx).slice();
        for (let i = 0; i < list.length; i++) { const made = await ctx.createPhantom(list[i], ctx.me, { count: 1 }); if (!made.length) break; }
      } } },
    // ================================================================ 終焉（骨竜・封印の竜）
    { id: 'doom_33', name: '骨竜の幼体', type: 'monster', lineage: 'doom', role: 'fuel', rarity: 'common',
      cost: 1, atk: 1, hp: 1, keywords: ['charge'], tags: ['dragon'],
      text: '1/1。突進。破壊時、手札の竜1枚のコスト-2',
      effects: { onDeath: function (ctx) { return reduceHandDragon(ctx, 2); } } },
    { id: 'doom_34', name: '竜葬の儀', type: 'spell', lineage: 'doom', role: 'finisher', rarity: 'rare',
      cost: 1, tags: ['finisher'],
      text: '自分の竜1体を破壊し、その攻撃力と同じ数の呪詛を相手に置く',
      targets: { kind: 'monster', side: 'ally', count: 1, filter: function (c2, m) { return isDragon(m); }, prompt: '葬る竜を選ぶ' },
      effects: { onPlay: async function (ctx) {
        const t = ctx.targets[0];
        if (!t || t.uid === undefined || !ctx.game.isInPlay(t)) return;
        const n = ctx.atkOf(t);
        await ctx.destroy(t);
        if (n > 0) await ctx.addCurse(ctx.opp, n);
      } } },
    { id: 'doom_35', name: '封じられし古竜', type: 'monster', lineage: 'doom', role: 'finisher', rarity: 'legend',
      cost: 3, atk: 12, hp: 12, tags: ['dragon', 'finisher'],
      text: '12/12。攻撃できない。自分の封印ゾーンの鍵が3種類以上そろうと攻撃できる',
      flavor: '鎖は三本目から、竜のほうを怖がり始める。',
      effects: { attackCondition: function (game, inst) { return game.distinctKeys(inst.owner) >= 3; } } },
    // ================================================================ 汎用
    { id: 'gen_44', name: '竜狩りの大弩', type: 'spell', lineage: 'generic', role: 'disrupt', rarity: 'rare',
      cost: 3, tags: ['disrupt'],
      text: '竜1体を破壊する',
      targets: { kind: 'monster', side: 'any', count: 1, filter: function (c2, m) { return isDragon(m); }, prompt: '破壊する竜を選ぶ' },
      effects: { onPlay: Fx.destroyTarget() } },
    { id: 'gen_45', name: '竜の盟約', type: 'crest', lineage: 'generic', role: 'disrupt', rarity: 'rare',
      cost: 2, text: '自分の竜は加護を持つ',
      effects: { grants: [{ key: 'dragonWard', value: true }] } },

    // ================================================================ 禁忌の竜（6）
    taboo({ id: 'accel_39', name: '禁忌の劫火竜', lineage: 'accel', linName: '加速', atk: 15, hp: 15, keywords: ['rush', 'pierce'],
      text: '15/15。速攻・貫通。召喚時、マナを最大値まで回復する。その後、このターンに得たマナと同じダメージを相手に与える',
      flavor: '世界の終わりは、まず空を焼く。',
      effects: { onSummon: async function (ctx) {
        const d = ctx.me.maxMana - ctx.me.mana;
        if (d > 0) await ctx.gainMana(d);
        const n = ctx.me.manaGainedThisTurn;
        if (n > 0 && ctx.game.winner === null) await ctx.damage(ctx.opp, n);
      } } }),
    taboo({ id: 'cycle_34', name: '禁忌の万巻竜', lineage: 'cycle', linName: '循環', atk: 12, hp: 12,
      text: '12/12。召喚時、カードを5枚引く。その後、相手の山札の上から「自分の手札の枚数×3」枚を墓地に送る',
      flavor: '読まれなかった頁から、竜は生まれる。',
      effects: { onSummon: async function (ctx) {
        await ctx.draw(5);
        if (ctx.game.winner === null) await ctx.mill(ctx.me.hand.length * 3, ctx.opp);
      } } }),
    taboo({ id: 'chain_35', name: '禁忌の天雷竜', lineage: 'chain', linName: '連鎖', atk: 10, hp: 10, keywords: ['rush', 'double'],
      text: '10/10。速攻・連撃。召喚時、連鎖数+10。その後、連鎖数と同じダメージを、相手と相手のモンスターすべてに与える',
      flavor: '一度落ちた雷は、二度と空へ帰らない。',
      effects: { onSummon: async function (ctx) {
        await ctx.addChain(10);
        const n = ctx.chainOf(ctx.me);
        if (ctx.game.winner === null) await Fx.dmgOppAndBoard(n)(ctx);
      } } }),
    taboo({ id: 'time_35', name: '禁忌の永劫竜', lineage: 'time', linName: '時間', atk: 12, hp: 12,
      text: '12/12。召喚時、追加ターンを2回得る。自分の時限カードすべてを、カウントに関係なく今すぐ発動する',
      flavor: '終わりの来ない一日を、竜は二度生きる。',
      effects: { onSummon: async function (ctx) {
        await ctx.extraTurn(ctx.me); await ctx.extraTurn(ctx.me);
        const list = ctx.me.timed.slice();
        for (let i = 0; i < list.length && ctx.game.winner === null; i++) await ctx.fireTimed(list[i]);
      } } }),
    taboo({ id: 'copy_35', name: '禁忌の万華竜', lineage: 'copy', linName: '複製', atk: 8, hp: 8, keywords: ['rush', 'double'],
      text: '8/8。速攻・連撃。召喚時、このカードの幻影を5体出す。常在：自分の幻影はすべて速攻を持つ',
      flavor: '覗き込んだ数だけ、竜はいる。',
      effects: { onSummon: Fx.phantomOfSelf(5), grants: [{ key: 'phantomRush', value: true }] } }),
    taboo({ id: 'doom_36', name: '禁忌の黄泉竜', lineage: 'doom', linName: '終焉', atk: 13, hp: 13, keywords: ['ward'],
      text: '13/13。加護。召喚時、相手に呪詛10。常在：相手のモンスターが破壊されるたび、相手に呪詛3',
      flavor: '黄泉の門は、竜の口の形をしている。',
      effects: {
        onSummon: Fx.curse(10),
        scope: 'any',
        onMonsterDestroyed: async function (ctx, ev) {
          const me = ctx.card.owner;
          if (ev.who === me || !ctx.game.isInPlay(ctx.card)) return;
          await ctx.game.makeCtx(me, ctx.card).addCurse(ctx.game.players[ev.who], 3);
        }
      } })
  ];
  DEFS.forEach(function (d) { d.set = 'dragon'; }); // own tests in tests/cards_dragon.test.js (lineage smoke tests skip the set)
  DB.registerAll(DEFS);
})(globalThis.G = globalThis.G || {});
