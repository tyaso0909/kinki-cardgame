(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // cards_chain.js — 連鎖系統（雷）25枚  chain_01..chain_25
  // 連鎖数 = player.chain（本物のカードを使った回数）。ctx.chainOf(me) は
  // 万雷の巫女（×2）／避雷針（½）などの修正込みの「扱い上の連鎖数」。
  // ---------------------------------------------------------------
  const Fx = G.Fx;
  const DB = G.CardDB;

  // Set "next spell fires k times" without lowering an already larger value (嵐の写し身 vs 雷紋の印).
  function raiseNextSpellTimes(p, k) { p.nextSpellTimes = Math.max(p.nextSpellTimes || 1, k); }
  function raiseNextSummonTimes(p, k) { p.nextSummonTimes = Math.max(p.nextSummonTimes || 1, k); }

  // Give a monster one extra attack this turn, once per turn (閃光の双刃).
  function grantSecondAttack(ctx, inst) {
    if (inst.flags.twinBladeTurn === ctx.game.turn) return;
    inst.flags.twinBladeTurn = ctx.game.turn;
    inst.attacksLeft += 1;
    ctx.log(ctx.nameOf(inst) + 'はこのターン2回攻撃できる');
  }

  // 帯電の騎士: keep "atk bonus == current chain" during the summon turn.
  async function syncKnightBuff(ctx, inst) {
    if (inst.summonedTurn !== ctx.game.turn) return;
    const want = ctx.chainOf(ctx.owner || ctx.me);
    const have = inst.flags.knightBuff || 0;
    if (want > have) {
      await ctx.buff(inst, { atk: want - have, until: 'endOfTurn' });
      inst.flags.knightBuff = want;
    }
  }

  DB.registerAll([
    // 1
    { id: 'chain_01', name: '雷鳴の子狐', type: 'monster', lineage: 'chain', role: 'fuel', rarity: 'common', cost: 0, atk: 1, hp: 1,
      text: '1/1。召喚時、連鎖数が3以上ならマナ+2',
      effects: { onSummon: Fx.when(Fx.chainAtLeast(3), Fx.gainMana(2)) } },
    // 2
    { id: 'chain_02', name: '放電する精霊', type: 'monster', lineage: 'chain', role: 'finisher', rarity: 'common', cost: 1, atk: 1, hp: 1,
      text: '1/1。常在：自分がカードを使うたび、相手に1ダメージを与える',
      flavor: '「触るな」とは言った。', tags: ['loopPart', 'finisher'],
      effects: { onCardPlayed: Fx.dmgOpp(1) } },
    // 3
    { id: 'chain_03', name: '帯電の騎士', type: 'monster', lineage: 'chain', role: 'finisher', rarity: 'common', cost: 3, atk: 2, hp: 3, keywords: ['rush'],
      text: '2/3。速攻。このターン、連鎖数1につき攻撃力+1',
      effects: {
        onSummon: async function (ctx) { ctx.card.flags.knightBuff = 0; await syncKnightBuff(ctx, ctx.card); },
        onCardPlayed: async function (ctx) { await syncKnightBuff(ctx, ctx.card); }
      } },
    // 4
    { id: 'chain_04', name: '嵐を呼ぶ巫女', type: 'monster', lineage: 'chain', role: 'fuel', rarity: 'common', cost: 2, atk: 1, hp: 2,
      text: '1/2。召喚時、カードを1枚引く。連鎖数が5以上なら、さらに1枚引く',
      effects: { onSummon: Fx.seq(Fx.draw(1), Fx.when(Fx.chainAtLeast(5), Fx.draw(1))) } },
    // 5
    { id: 'chain_05', name: '火花', type: 'spell', lineage: 'chain', role: 'fuel', rarity: 'common', cost: 0,
      text: '1ダメージを与える。カードを1枚引く',
      effects: { onPlay: Fx.seq(Fx.dmgOpp(1), Fx.draw(1)) } },
    // 6
    { id: 'chain_06', name: '静電気', type: 'spell', lineage: 'chain', role: 'fuel', rarity: 'common', cost: 0,
      text: 'マナ+1。連鎖数が5以上なら、さらにマナ+2',
      effects: { onPlay: Fx.seq(Fx.gainMana(1), Fx.when(Fx.chainAtLeast(5), Fx.gainMana(2))) } },
    // 7
    { id: 'chain_07', name: '雷撃の連打', type: 'spell', lineage: 'chain', role: 'finisher', rarity: 'common', cost: 1,
      text: '連鎖数と同じダメージを与える',
      effects: { onPlay: Fx.dmgOpp(Fx.chain(1)) } },
    // 8
    { id: 'chain_08', name: '迅雷の閃き', type: 'spell', lineage: 'chain', role: 'fuel', rarity: 'common', cost: 0,
      text: 'カードを1枚引く。このターン次に使う魔法のコスト-1',
      effects: { onPlay: Fx.seq(Fx.draw(1), Fx.nextSpellCost(-1)) } },
    // 9
    { id: 'chain_09', name: '稲光の導線', type: 'spell', lineage: 'chain', role: 'fuel', rarity: 'common', cost: 1,
      text: 'このターンの連鎖数+3',
      effects: { onPlay: Fx.addChain(3) } },
    // 10
    { id: 'chain_10', name: '避雷針', type: 'spell', lineage: 'chain', role: 'disrupt', rarity: 'common', cost: 2, reserve: true,
      text: '相手の次のターン、相手の連鎖数は半分（切り捨て）として扱う', tags: ['disrupt'],
      effects: {},
      reserveHooks: { grants: [{ key: 'chainMultiplier', value: 0.5 }] } },
    // 11
    { id: 'chain_11', name: '雷雲の封印', type: 'spell', lineage: 'chain', role: 'disrupt', rarity: 'common', cost: 2, reserve: true,
      text: '相手の次のターン、相手が6枚目以降に使うカードのコストは+3', tags: ['disrupt'],
      effects: {},
      reserveHooks: { grants: [{ key: 'extraCostAfterN', value: { after: 5, delta: 3 } }] } },
    // 12
    { id: 'chain_12', name: '雷紋の印', type: 'crest', lineage: 'chain', role: 'engine', rarity: 'common', cost: 2,
      text: '自分のターン中、5枚目に使ったカードの効果は2回発動する',
      effects: {
        onCardPlayed: async function (ctx, ev) {
          if (ev.isCopy || !ctx.isMyTurn()) return;
          if (ctx.me.playedThisTurn.length !== 5) return;
          const def = ev.def || ctx.defOf(ev.card);
          if (def.reserve || (def.timed !== null && def.timed !== undefined)) return;
          if (def.type === 'spell') raiseNextSpellTimes(ctx.me, 2);
          else if (def.type === 'monster') raiseNextSummonTimes(ctx.me, 2);
          else return;
          ctx.log('雷紋の印：5枚目の' + def.name + 'は2回発動する');
        }
      } },
    // 13
    { id: 'chain_13', name: '嵐の蓄電器', type: 'crest', lineage: 'chain', role: 'fuel', rarity: 'common', cost: 1,
      text: '自分のターン終了時、連鎖数が10以上ならカードを2枚引く',
      effects: { onTurnEnd: Fx.when(Fx.chainAtLeast(10), Fx.draw(2)) } },
    // 14
    { id: 'chain_14', name: '雷鳴の大鷲', type: 'monster', lineage: 'chain', role: 'finisher', rarity: 'rare', cost: 4, atk: 3, hp: 3, keywords: ['rush'],
      text: '3/3。速攻。常在：自分がカードを使うたび、相手のモンスター1体に1ダメージを与える',
      effects: {
        onCardPlayed: async function (ctx) {
          if (!ctx.monstersOf(ctx.opp).length) return;
          const picked = await ctx.pick({ kind: 'monster', side: 'enemy', count: 1, prompt: '1ダメージを与える相手のモンスターを選ぶ' });
          if (picked[0]) await ctx.damage(picked[0], 1);
        }
      } },
    // 15
    { id: 'chain_15', name: '嵐の大精霊', type: 'monster', lineage: 'chain', role: 'engine', rarity: 'rare', cost: 5, atk: 3, hp: 5,
      text: '3/5。常在：自分がカードを使うたび、マナ+1', tags: ['loopPart'],
      effects: { onCardPlayed: Fx.gainMana(1) } },
    // 16
    { id: 'chain_16', name: '閃光の双刃', type: 'monster', lineage: 'chain', role: 'finisher', rarity: 'rare', cost: 2, atk: 2, hp: 2, keywords: ['rush'],
      text: '2/2。速攻。連鎖数が5以上なら、このターン2回攻撃できる',
      effects: {
        onSummon: async function (ctx) { if (ctx.chainOf(ctx.me) >= 5) grantSecondAttack(ctx, ctx.card); },
        onChainReached: async function (ctx, ev) { if (ev.chain >= 5) grantSecondAttack(ctx, ctx.card); },
        onTurnStart: async function (ctx) { if (ctx.chainOf(ctx.me) >= 5) grantSecondAttack(ctx, ctx.card); }
      } },
    // 17
    { id: 'chain_17', name: '天雷の裁き', type: 'spell', lineage: 'chain', role: 'finisher', rarity: 'rare', cost: 3,
      text: '連鎖数×3ダメージを与える', tags: ['finisher'],
      effects: { onPlay: Fx.dmgOpp(Fx.chain(3)) } },
    // 18
    { id: 'chain_18', name: '逆流する稲妻', type: 'spell', lineage: 'chain', role: 'fuel', rarity: 'rare', cost: 2,
      text: 'このターンに使った魔法のうち3枚を、墓地から手札に戻す',
      effects: {
        onPlay: async function (ctx) {
          const played = ctx.me.spellsPlayedThisTurn;
          const picked = await ctx.pick({ kind: 'graveCard', side: 'ally', count: 3,
            filter: function (c, inst) { const d = G.CardDB.get(inst.defId); return d.type === 'spell' && played.indexOf(d.id) >= 0; },
            prompt: '手札に戻す魔法を3枚選ぶ' });
          for (let i = 0; i < picked.length; i++) await ctx.addToHand(picked[i], ctx.me);
          if (!picked.length) ctx.log('戻せる魔法がなかった');
        }
      } },
    // 19
    { id: 'chain_19', name: '雷神の太鼓', type: 'crest', lineage: 'chain', role: 'engine', rarity: 'rare', cost: 3,
      text: '連鎖数が10に達したとき、追加ターンを得る（1ターンに1回）',
      flavor: '十の雷で、もう一日。', tags: ['extraTurn'],
      effects: {
        onChainReached: async function (ctx, ev) {
          if (ev.chain < 10 || ctx.card.flags.drumTurn === ctx.game.turn) return;
          ctx.card.flags.drumTurn = ctx.game.turn;
          ctx.log('雷神の太鼓が鳴り響く');
          await ctx.extraTurn(ctx.me);
        }
      } },
    // 20
    { id: 'chain_20', name: '雷鳴の高原', type: 'field', lineage: 'chain', role: 'engine', rarity: 'rare', cost: 2,
      text: 'お互い、連鎖数が5以上のとき、すべてのカードのコスト-1。展開時：このターンの連鎖数+3',
      effects: {
        scope: 'any',
        grants: [{ key: 'costDelta', value: -1, side: 'any', when: function (ctx, p) { return ctx.game.chainOf(p) >= 5; } }],
        onPlace: Fx.addChain(3)
      } },
    // 21
    { id: 'chain_21', name: '嵐の写し身', type: 'spell', lineage: 'chain', role: 'engine', rarity: 'legend', cost: 2,
      text: 'このターン次に使う魔法を、連鎖数と同じ回数だけ発動する',
      flavor: 'こだまが、本物より先に落ちた。',
      effects: {
        onPlay: async function (ctx) {
          const k = Math.max(1, ctx.chainOf(ctx.me));
          raiseNextSpellTimes(ctx.me, k);
          ctx.log('次の魔法は' + k + '回発動する');
        }
      } },
    // 22
    { id: 'chain_22', name: '雷帝', type: 'monster', lineage: 'chain', role: 'finisher', rarity: 'legend', cost: 6, atk: 5, hp: 5, keywords: ['rush'],
      text: '5/5。速攻。召喚時、連鎖数×2ダメージを、相手と相手のすべてのモンスターに与える', tags: ['finisher'],
      effects: { onSummon: Fx.dmgOppAndBoard(Fx.chain(2)) } },
    // 23
    { id: 'chain_23', name: '終わらぬ雷雲', type: 'crest', lineage: 'chain', role: 'engine', rarity: 'legend', cost: 4,
      text: '自分のターン中、カードを使うたびに「マナ+1」か「カードを1枚引く」を選ぶ', tags: ['loopPart'],
      effects: {
        onCardPlayed: async function (ctx, ev) {
          if (!ctx.isMyTurn()) return;
          const id = await ctx.choose([{ id: 'mana', label: 'マナ+1' }, { id: 'draw', label: 'カードを1枚引く' }], { prompt: '終わらぬ雷雲：どちらを得る？' });
          if (id === 'draw') await ctx.draw(1); else await ctx.gainMana(1);
          void ev;
        }
      } },
    // 24
    { id: 'chain_24', name: '万雷の巫女', type: 'monster', lineage: 'chain', role: 'engine', rarity: 'legend', cost: 3, atk: 1, hp: 3,
      text: '1/3。常在：自分の連鎖数は2倍として扱う',
      flavor: '数えるのは、わたしの仕事。',
      effects: { grants: [{ key: 'chainMultiplier', value: 2 }] } },
    // 25
    { id: 'chain_25', name: '世界を貫く雷', type: 'crest', lineage: 'chain', role: 'engine', rarity: 'taboo', cost: 6,
      text: '自分の連鎖数はターン終了時に0に戻らず、戦闘が終わるまで累積する',
      flavor: '落ちた雷は、まだ落ち続けている。',
      effects: { grants: [{ key: 'chainPersists', value: true }] } }
  ]);
})(globalThis.G = globalThis.G || {});
