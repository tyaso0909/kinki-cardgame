(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // cards_generic.js — 汎用・妨害カード 30枚（gen_01..gen_30）。SPEC「汎用・妨害カードリスト」順。
  // 共有ヘルパー G.DataUtil もここで定義する（cards_boss.js / relics.js から実行時に参照）。
  // ---------------------------------------------------------------
  const Fx = G.Fx;
  const DB = G.CardDB;

  // ---- shared helpers for data files ----------------------------------------
  const U = G.DataUtil = G.DataUtil || {};
  // Zone-crossing choice: options built from several zones of `who`; resolves to CardInst|null.
  U.chooseCardAcross = async function (ctx, who, zones, pred, prompt, opts) {
    opts = opts || {};
    const p = ctx.who(who);
    let cands = [];
    zones.forEach(function (z) { cands = cands.concat(p[z] || []); });
    if (pred) cands = cands.filter(function (c) { return pred(c, DB.get(c.defId)); });
    if (!cands.length) return null;
    const zoneName = { board: '場', phantoms: '幻影', hand: '手札', grave: '墓地', deck: '山札', exile: '除外', crests: '紋章' };
    const options = cands.map(function (c) { return { id: c.uid, label: DB.get(c.defId).name + '（' + (zoneName[c.zone] || c.zone) + '）', card: c }; });
    if (opts.optional) options.push({ id: 'none', label: '選ばない' });
    const id = await ctx.choose(options, { prompt: prompt || 'カードを選ぶ', chooser: opts.chooser });
    if (id === 'none') return null;
    const found = options.find(function (o) { return o.id === id; });
    return found ? found.card : cands[0];
  };
  // Reveal cards to the opponent of `who` (UI event) and remember the revealed hand for the battle.
  U.reveal = function (ctx, cards, ownerIdx, zone) {
    const uids = cards.map(function (c) { return c.uid; });
    ctx.emit('reveal', { who: ownerIdx, viewer: 1 - ownerIdx, zone: zone || 'hand', uids: uids, defIds: cards.map(function (c) { return c.defId; }) });
    ctx.log(ctx.game.players[1 - ownerIdx].name + 'は' + ctx.game.players[ownerIdx].name + 'の' + (zone === 'deck' ? '山札の上' : '手札') + 'を見た：' +
      (cards.length ? cards.map(function (c) { return DB.get(c.defId).name; }).join('、') : 'なし'));
    return uids;
  };
  U.isLoopPart = function (inst, def) { return (def || DB.get(inst.defId)).tags.indexOf('loopPart') >= 0; };

  function reg(def) {
    if (def.lineage === undefined) def.lineage = 'generic';
    if (def.tags === undefined) def.tags = [];
    if (def.role === 'disrupt' && def.tags.indexOf('disrupt') < 0) def.tags.push('disrupt');
    return DB.register(def);
  }

  // 1 封じの番兵
  reg({ id: 'gen_01', name: '封じの番兵', type: 'monster', role: 'disrupt', rarity: 'common', cost: 2, atk: 2, hp: 3, keywords: ['guard'],
    text: '2/3。守護。常在：相手は墓地からカードを使えない',
    effects: { grants: [{ key: 'noGravePlay', value: true, side: 'enemy' }] } });

  // 2 結界の僧兵
  reg({ id: 'gen_02', name: '結界の僧兵', type: 'monster', role: 'disrupt', rarity: 'common', cost: 3, atk: 2, hp: 4,
    text: '2/4。常在：相手は1ターンにカードを10枚までしか使えない',
    effects: { grants: [{ key: 'cardsPerTurnLimit', value: 10, side: 'enemy' }] } });

  // 3 魔封じの猫
  reg({ id: 'gen_03', name: '魔封じの猫', type: 'monster', role: 'disrupt', rarity: 'common', cost: 1, atk: 1, hp: 1,
    text: '1/1。召喚時、相手の手札をすべて見る',
    effects: { onSummon: async function (ctx) {
      U.reveal(ctx, ctx.opp.hand.slice(), ctx.opp.idx, 'hand');
      ctx.setStatus(ctx.opp, 'handRevealed', true);
    } } });

  // 4 消滅の光
  reg({ id: 'gen_04', name: '消滅の光', type: 'spell', role: 'disrupt', rarity: 'common', cost: 2,
    text: 'モンスター1体を除外する', targets: Fx.T.anyMonster,
    effects: { onPlay: Fx.exileTarget() } });

  // 5 墓地清め
  reg({ id: 'gen_05', name: '墓地清め', type: 'spell', role: 'disrupt', rarity: 'common', cost: 1,
    text: '相手の墓地のカードをすべて除外する',
    effects: { onPlay: Fx.exileOppGrave() } });

  // 6 霧払いの風
  reg({ id: 'gen_06', name: '霧払いの風', type: 'spell', role: 'disrupt', rarity: 'common', cost: 1,
    text: '相手の場の幻影をすべて消す',
    effects: { onPlay: async function (ctx) { const n = ctx.opp.phantoms.length; Fx.clearOppPhantoms()(ctx); ctx.log('幻影' + n + '体が霧とともに消えた'); } } });

  // 7 封言の呪文（予約）
  reg({ id: 'gen_07', name: '封言の呪文', type: 'spell', role: 'disrupt', rarity: 'common', cost: 2, reserve: true,
    text: '相手の次のターン、相手が最初に使う魔法は効果がなくなる',
    effects: {},
    reserveHooks: { onActivate: async function (ctx, ev) { ctx.setStatus(ev.who, 'firstSpellNegated', true, { untilEndOfTurnOf: 'thisTurn' }); } } });

  // 8 重圧の呪文（予約）
  reg({ id: 'gen_08', name: '重圧の呪文', type: 'spell', role: 'disrupt', rarity: 'common', cost: 2, reserve: true,
    text: '相手の次のターン、相手のカードのコストはすべて+1',
    effects: {},
    reserveHooks: { grants: [{ key: 'costDelta', value: 1 }] } });

  // 9 手札崩し
  reg({ id: 'gen_09', name: '手札崩し', type: 'spell', role: 'disrupt', rarity: 'common', cost: 2,
    text: '相手の手札をランダムに2枚捨てさせる',
    effects: { onPlay: Fx.oppDiscard(2) } });

  // 10 時計止め
  reg({ id: 'gen_10', name: '時計止め', type: 'spell', role: 'disrupt', rarity: 'common', cost: 1,
    text: '相手の時限カードすべてのカウントを+2',
    effects: { onPlay: async function (ctx) { await ctx.adjustTimed(ctx.opp.timed.slice(), 2, ctx.opp); } } });

  // 11 浄化の聖水
  reg({ id: 'gen_11', name: '浄化の聖水', type: 'spell', role: 'disrupt', rarity: 'common', cost: 1,
    text: '自分に置かれた呪詛をすべて取り除く。カードを1枚引く',
    effects: { onPlay: Fx.seq(Fx.cleanseCurse(), Fx.draw(1)) } });

  // 12 静寂の神殿
  reg({ id: 'gen_12', name: '静寂の神殿', type: 'field', role: 'disrupt', rarity: 'common', cost: 2,
    text: 'お互い、1ターンに使えるカードは5枚まで。展開時：カードを1枚引く',
    effects: { grants: [{ key: 'cardsPerTurnLimit', value: 5, side: 'any' }], onPlace: Fx.draw(1) } });

  // 13 ただの草原
  reg({ id: 'gen_13', name: 'ただの草原', type: 'field', role: 'disrupt', rarity: 'common', cost: 1,
    text: '効果なし。展開時：カードを1枚引く（敵のフィールドを安く上書きする用）',
    effects: { onPlace: Fx.draw(1) } });

  // 14 反魔の護符
  reg({ id: 'gen_14', name: '反魔の護符', type: 'crest', role: 'disrupt', rarity: 'common', cost: 2,
    text: '自分は相手の予約魔法の効果を受けない',
    effects: { grants: [{ key: 'immuneReserve', value: true }] } });

  // 15 応急手当
  reg({ id: 'gen_15', name: '応急手当', type: 'spell', role: 'fuel', rarity: 'common', cost: 1,
    text: 'ライフ+8',
    effects: { onPlay: Fx.heal(8) } });

  // 16 ループ断ちの鎖（予約）
  reg({ id: 'gen_16', name: 'ループ断ちの鎖', type: 'spell', role: 'disrupt', rarity: 'rare', cost: 3, reserve: true,
    text: '相手の次のターン、相手は同じ名前のカードを1ターンに1回までしか使えない',
    effects: {},
    reserveHooks: { grants: [{ key: 'sameNamePerTurnLimit', value: 1 }] } });

  // 17 反射の鏡盾（予約）
  reg({ id: 'gen_17', name: '反射の鏡盾', type: 'spell', role: 'disrupt', rarity: 'rare', cost: 3, reserve: true,
    text: '相手の次のターン、相手が最初に与えるダメージは、相手自身が受ける',
    effects: {},
    reserveHooks: { onActivate: async function (ctx, ev) { ctx.setStatus(ev.who, 'reflectFirstDamage', true, { untilEndOfTurnOf: 'thisTurn' }); } } });

  // 18 簒奪の儀
  reg({ id: 'gen_18', name: '簒奪の儀', type: 'spell', role: 'disrupt', rarity: 'rare', cost: 3,
    text: '相手の場のモンスター1体を奪い、自分の場に置く', targets: Fx.T.enemyMonster,
    effects: { onPlay: Fx.stealTarget() } });

  // 19 封印の鎖
  reg({ id: 'gen_19', name: '封印の鎖', type: 'spell', role: 'disrupt', rarity: 'rare', cost: 4,
    text: '紋章1枚を除去する（禁忌の紋章は除去できない）',
    targets: { kind: 'crest', side: 'any', count: 1, prompt: '除去する紋章を選ぶ', filter: function (ctx, c) { return DB.get(c.defId).rarity !== 'taboo'; } },
    effects: { onPlay: async function (ctx) { const t = ctx.targets[0]; if (t && t.uid !== undefined) await ctx.removeCrest(t); } } });

  // 20 封魔の大司教
  reg({ id: 'gen_20', name: '封魔の大司教', type: 'monster', role: 'disrupt', rarity: 'rare', cost: 5, atk: 3, hp: 6, keywords: ['guard'],
    text: '3/6。守護。常在：相手のモンスターの召喚時効果と破壊時効果は発動しない',
    effects: { grants: [{ key: 'noMonsterTriggers', value: true, side: 'enemy' }] } });

  // 21 時空の錨
  reg({ id: 'gen_21', name: '時空の錨', type: 'crest', role: 'disrupt', rarity: 'rare', cost: 3,
    text: '相手は追加ターンを得られない',
    effects: { grants: [{ key: 'noExtraTurn', value: true, side: 'enemy' }] } });

  // 22 呪詛喰らい
  function eaterOn(ctx) { ctx.setStatus(ctx.owner, 'curseRedirectToMonsterUid', ctx.card.uid, { sourceUid: ctx.card.uid }); }
  function eaterOff(ctx) { if (ctx.game.explicitStatus(ctx.owner, 'curseRedirectToMonsterUid') === ctx.card.uid) ctx.clearStatus(ctx.owner, 'curseRedirectToMonsterUid'); }
  reg({ id: 'gen_22', name: '呪詛喰らい', type: 'monster', role: 'disrupt', rarity: 'rare', cost: 3, atk: 2, hp: 3,
    text: '2/3。常在：自分に呪詛が置かれる代わりに、このモンスターが1ダメージを受ける',
    effects: {
      onSummon: async function (ctx) { eaterOn(ctx); },
      onBattleStart: async function (ctx) { if (ctx.card && ctx.card.zone === 'board') eaterOn(ctx); },
      onLeave: async function (ctx) { eaterOff(ctx); }
    } });

  // 23 先読みの賢者
  reg({ id: 'gen_23', name: '先読みの賢者', type: 'monster', role: 'disrupt', rarity: 'rare', cost: 2, atk: 1, hp: 2,
    text: '1/2。召喚時、相手の手札と山札の上5枚を見て、そのうち1枚を除外する',
    effects: { onSummon: async function (ctx) {
      const hand = ctx.opp.hand.slice(), top = ctx.lookTop(5, ctx.opp).slice();
      U.reveal(ctx, hand, ctx.opp.idx, 'hand'); U.reveal(ctx, top, ctx.opp.idx, 'deck');
      const cands = hand.concat(top);
      if (!cands.length) return;
      const options = cands.map(function (c) { return { id: c.uid, label: DB.get(c.defId).name + (c.zone === 'hand' ? '（手札）' : '（山札）'), card: c }; });
      const id = await ctx.choose(options, { prompt: '除外するカードを選ぶ' });
      const o = options.find(function (x) { return x.id === id; }) || options[0];
      await ctx.exile(o.card);
    } } });

  // 24 逆転の一手
  reg({ id: 'gen_24', name: '逆転の一手', type: 'spell', role: 'fuel', rarity: 'rare', cost: 0,
    text: '自分のライフが10以下のときだけ使える。カードを3枚引き、マナ+3',
    effects: { canPlay: function (ctx) { return ctx.me.life <= 10; }, onPlay: Fx.seq(Fx.draw(3), Fx.gainMana(3)) } });

  // 25 全反転の大鏡（予約）
  reg({ id: 'gen_25', name: '全反転の大鏡', type: 'spell', role: 'disrupt', rarity: 'legend', cost: 4, reserve: true,
    text: '相手の次のターン、相手のカードの効果は、得る側と受ける側がすべて入れ替わる（相手が得るものは自分が得て、相手が与えるものは相手が受ける）',
    effects: {},
    reserveHooks: { grants: [{ key: 'invertEffects', value: true }] } });

  // 26 虚無の顎
  reg({ id: 'gen_26', name: '虚無の顎', type: 'monster', role: 'disrupt', rarity: 'legend', cost: 6, atk: 5, hp: 5,
    text: '5/5。召喚時、相手の場・手札・墓地から、好きなカード3枚を除外する',
    effects: { onSummon: async function (ctx) {
      for (let i = 0; i < 3; i++) {
        const c = await U.chooseCardAcross(ctx, ctx.opp, ['board', 'phantoms', 'hand', 'grave'], null, '除外するカードを選ぶ（' + (i + 1) + '/3）');
        if (!c) break;
        await ctx.exile(c);
      }
    } } });

  // 27 禁呪の封印
  reg({ id: 'gen_27', name: '禁呪の封印', type: 'spell', role: 'disrupt', rarity: 'legend', cost: 5,
    text: '相手の紋章をすべて除去する（禁忌の紋章も含む）',
    effects: { onPlay: async function (ctx) {
      const list = ctx.opp.crests.slice();
      for (let i = 0; i < list.length; i++) await ctx.removeCrest(list[i], { force: true });
    } } });

  // 28 零の聖域
  reg({ id: 'gen_28', name: '零の聖域', type: 'field', role: 'disrupt', rarity: 'legend', cost: 4,
    text: 'お互い、ループとして検出された動きは2周目以降が無効になる。展開時：カードを1枚引く',
    effects: { grants: [{ key: 'loopSecondIterationVoid', value: true, side: 'any' }], onPlace: Fx.draw(1) } });

  // 29 因果の断絶
  reg({ id: 'gen_29', name: '因果の断絶', type: 'spell', role: 'disrupt', rarity: 'legend', cost: 3,
    text: 'この戦闘中、相手は特殊勝利できない。相手の封印ゾーンのカードをすべて墓地に送る',
    effects: { onPlay: async function (ctx) {
      ctx.setStatus(ctx.opp, 'noSpecialWin', true);
      ctx.log(ctx.opp.name + 'はこの戦闘中、特殊勝利できなくなった');
      const seals = ctx.opp.seals.slice();
      for (let i = 0; i < seals.length; i++) await ctx.removeSeal(seals[i]);
    } } });

  // 30 世界の再創造（禁忌）
  reg({ id: 'gen_30', name: '世界の再創造', type: 'spell', role: 'disrupt', rarity: 'taboo', cost: 7,
    text: 'お互いの場・手札・墓地・紋章・フィールドをすべて除外する。お互い5枚引き、最大マナ5から再開する。ライフと呪詛はそのまま',
    effects: { onPlay: async function (ctx) {
      const g = ctx.game;
      for (let i = 0; i < 2; i++) {
        const p = g.players[i];
        const all = p.board.concat(p.phantoms, p.crests, p.hand, p.grave);
        for (let k = 0; k < all.length; k++) await ctx.exile(all[k]);
      }
      if (g.field) await ctx.exile(g.field);
      if (ctx.card && ctx.card.zone === 'limbo') await ctx.exile(ctx.card);
      for (let i = 0; i < 2; i++) {
        const p = g.players[i];
        p.maxMana = 5;
        if (p.mana > 5) p.mana = 5;
        g.emit('manaChange', { who: i, mana: p.mana, maxMana: p.maxMana, delta: 0 });
      }
      ctx.log('世界は作り直された。最大マナは5に');
      await ctx.draw(5, g.players[g.active]);
      await ctx.draw(5, g.players[1 - g.active]);
    } } });
})(globalThis.G = globalThis.G || {});
