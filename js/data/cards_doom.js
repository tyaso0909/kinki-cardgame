(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // cards_doom.js — 終焉系統（死霊と古の封印）25枚  doom_01..doom_25
  // 勝ち筋: 封印の鍵（player.seals / def.key）・呪詛（player.curse, 20で敗北）・預言（時限付き紋章）。
  // ---------------------------------------------------------------
  const Fx = G.Fx;
  const DB = G.CardDB;

  function isMonsterDef(inst, def) { return (def || DB.get(inst.defId)).type === 'monster'; }
  function keyPred(inst, def) { return !!(def || DB.get(inst.defId)).key; }

  // Search deck for a key card (pick if several) and add to hand.
  async function tutorKey(ctx) { return ctx.tutor(keyPred, ctx.me, { prompt: '手札に加える鍵カードを選ぶ' }); }

  // Revive one own grave monster (optional predicate). No-op with a log if none.
  async function reviveOne(ctx, pred, prompt) {
    const cands = ctx.me.grave.filter(function (c) { const d = DB.get(c.defId); return d.type === 'monster' && (!pred || pred(c, d)); });
    if (!cands.length) { ctx.log('場に出せるモンスターが墓地にない'); return null; }
    const picked = await ctx.pick({ kind: 'graveCard', side: 'ally', count: 1, filter: function (c, inst) { return cands.indexOf(inst) >= 0; }, prompt: prompt || '場に出すモンスターを選ぶ' });
    if (!picked[0]) return null;
    return ctx.reviveFromGrave(picked[0], ctx.me);
  }

  DB.registerAll([
    // 1
    { id: 'doom_01', name: '墓場の骸骨兵', type: 'monster', lineage: 'doom', role: 'fuel', rarity: 'common', cost: 1, atk: 1, hp: 1,
      text: '1/1。破壊時、相手に呪詛1',
      effects: { onDeath: Fx.curse(1) } },
    // 2
    { id: 'doom_02', name: '呪いを運ぶ鴉', type: 'monster', lineage: 'doom', role: 'disrupt', rarity: 'common', cost: 2, atk: 1, hp: 2,
      text: '1/2。常在：相手が魔法を使うたび、相手に呪詛1', tags: ['disrupt'],
      effects: {
        scope: 'any',
        onSpellPlayed: async function (ctx, ev) {
          if (ev.who === ctx.owner.idx) return;
          await ctx.game.makeCtx(ctx.owner.idx, ctx.card).addCurse(ctx.game.players[ev.who], 1);
        }
      } },
    // 3
    { id: 'doom_03', name: '墓守の死霊術師', type: 'monster', lineage: 'doom', role: 'fuel', rarity: 'common', cost: 3, atk: 2, hp: 3,
      text: '2/3。召喚時、墓地のコスト2以下のモンスター1体を場に出す',
      effects: { onSummon: async function (ctx) { await reviveOne(ctx, function (c, d) { return typeof d.cost === 'number' && d.cost <= 2; }, '場に出すコスト2以下のモンスターを選ぶ'); } } },
    // 4
    { id: 'doom_04', name: '骨の祭司', type: 'monster', lineage: 'doom', role: 'fuel', rarity: 'common', cost: 2, atk: 1, hp: 3,
      text: '1/3。召喚時、ライフを3失い、山札から鍵カード1枚を探して手札に加える',
      effects: { onSummon: async function (ctx) { await ctx.loseLife(ctx.me, 3); if (ctx.game.winner === null) await tutorKey(ctx); } } },
    // 5
    { id: 'doom_05', name: '終末の鍵・第一', type: 'spell', lineage: 'doom', role: 'finisher', rarity: 'common', cost: 1, key: 1, tags: ['key'],
      text: '封印ゾーンに置く。カードを1枚引く',
      effects: { onPlay: Fx.seq(Fx.seal(), Fx.draw(1)) } },
    // 6
    { id: 'doom_06', name: '終末の鍵・第二', type: 'spell', lineage: 'doom', role: 'finisher', rarity: 'common', cost: 2, key: 2, tags: ['key'],
      text: '封印ゾーンに置く。相手に呪詛2',
      effects: { onPlay: Fx.seq(Fx.seal(), Fx.curse(2)) } },
    // 7
    { id: 'doom_07', name: '終末の鍵・第三', type: 'spell', lineage: 'doom', role: 'finisher', rarity: 'common', cost: 2, key: 3, tags: ['key'],
      text: '封印ゾーンに置く。墓地のモンスター1体を場に出す',
      effects: { onPlay: Fx.seq(Fx.seal(), async function (ctx) { if (ctx.game.winner === null) await reviveOne(ctx); }) } },
    // 8
    { id: 'doom_08', name: '呪詛の囁き', type: 'spell', lineage: 'doom', role: 'finisher', rarity: 'common', cost: 0,
      text: '相手に呪詛2',
      flavor: '聞こえた者は、もう数えはじめている。',
      effects: { onPlay: Fx.curse(2) } },
    // 9
    { id: 'doom_09', name: '生け贄の儀', type: 'spell', lineage: 'doom', role: 'fuel', rarity: 'common', cost: 0,
      text: '自分のモンスター1体を破壊し、マナ+2。カードを1枚引く', tags: ['loopPart'],
      targets: Fx.T.allyBoardMonster,
      effects: { onPlay: Fx.seq(Fx.destroyTarget(), Fx.gainMana(2), Fx.draw(1)) } },
    // 10
    { id: 'doom_10', name: '血の契約', type: 'spell', lineage: 'doom', role: 'fuel', rarity: 'common', cost: 0,
      text: 'ライフを4失い、カードを2枚引く',
      effects: { onPlay: Fx.seq(Fx.loseLife(4), async function (ctx) { if (ctx.game.winner === null) await ctx.draw(2); }) } },
    // 11
    { id: 'doom_11', name: '封印破り', type: 'spell', lineage: 'doom', role: 'disrupt', rarity: 'common', cost: 2, tags: ['disrupt'],
      text: '相手の封印ゾーンのカード1枚を墓地に送る',
      targets: Fx.T.enemySeal,
      effects: { onPlay: async function (ctx) { const t = ctx.targets[0]; if (t && t.uid !== undefined) await ctx.removeSeal(t); else ctx.log('相手の封印ゾーンは空だ'); } } },
    // 12
    { id: 'doom_12', name: '呪いの刻印', type: 'crest', lineage: 'doom', role: 'engine', rarity: 'common', cost: 2,
      text: '自分のターン開始時、相手に呪詛1',
      effects: { onTurnStart: Fx.curse(1) } },
    // 13
    { id: 'doom_13', name: '死者の行進', type: 'crest', lineage: 'doom', role: 'engine', rarity: 'common', cost: 1,
      text: '自分のモンスターが破壊されるたび、マナ+1', tags: ['loopPart'],
      effects: { onMonsterDestroyed: Fx.gainMana(1) } },
    // 14
    { id: 'doom_14', name: '終末の鍵・第四', type: 'spell', lineage: 'doom', role: 'finisher', rarity: 'rare', cost: 3, key: 4, tags: ['key'],
      text: '封印ゾーンに置く。墓地の鍵カード1枚を手札に戻す',
      effects: { onPlay: Fx.seq(Fx.seal(), async function (ctx) {
        if (ctx.game.winner !== null) return;
        const picked = await ctx.pick({ kind: 'graveCard', side: 'ally', count: 1, filter: function (c, inst) { return keyPred(inst); }, prompt: '手札に戻す鍵カードを選ぶ' });
        if (picked[0]) await ctx.addToHand(picked[0], ctx.me); else ctx.log('墓地に鍵カードはない');
      }) } },
    // 15
    { id: 'doom_15', name: '蘇りし不死の王', type: 'monster', lineage: 'doom', role: 'finisher', rarity: 'rare', cost: 5, atk: 4, hp: 4,
      text: '4/4。破壊時、ライフを5失えば場に戻る',
      flavor: '玉座は空かない。座る者が死なないからだ。',
      effects: {
        onDeath: async function (ctx) {
          if (ctx.me.life <= 5) { ctx.log('ライフが足りず、王は戻れない'); return; }
          const id = await ctx.choose([{ id: 'yes', label: 'ライフを5失って場に戻す' }, { id: 'no', label: '戻さない' }], { prompt: '蘇りし不死の王を戻す？' });
          if (id !== 'yes') return;
          await ctx.loseLife(ctx.me, 5);
          if (ctx.game.winner !== null) return;
          await ctx.summon(ctx.card, ctx.me, { triggerSummon: false });
        }
      } },
    // 16
    { id: 'doom_16', name: '呪詛の爆発', type: 'spell', lineage: 'doom', role: 'finisher', rarity: 'rare', cost: 3, tags: ['finisher'],
      text: '相手の呪詛の数×2ダメージを与える',
      effects: { onPlay: Fx.dmgOpp(Fx.oppCurse(2)) } },
    // 17
    { id: 'doom_17', name: '屍山の巨人', type: 'monster', lineage: 'doom', role: 'finisher', rarity: 'rare', cost: 6, atk: 0, hp: 0, keywords: ['rush'], tags: ['finisher'],
      text: 'X/X。速攻。Xは自分の墓地のモンスターの数×2',
      effects: {
        // stats are fixed at summon time (0/0 printed; dies immediately if the grave has no monsters)
        onSummon: async function (ctx) {
          const x = ctx.countZone(ctx.me, 'grave', function (c) { return isMonsterDef(c); }) * 2;
          const inst = ctx.card;
          inst.atk = x; inst.hp = x; inst.maxHp = x; inst.damage = 0;
          ctx.log('屍山の巨人は' + x + '/' + x + 'になった');
          if (x <= 0) await ctx.destroy(inst);
        }
      } },
    // 18
    { id: 'doom_18', name: '古の封印庫', type: 'crest', lineage: 'doom', role: 'engine', rarity: 'rare', cost: 3,
      text: '自分のターン開始時、山札から鍵カード1枚を探して手札に加える',
      effects: { onTurnStart: async function (ctx) { await tutorKey(ctx); } } },
    // 19
    { id: 'doom_19', name: '死者の国', type: 'field', lineage: 'doom', role: 'engine', rarity: 'rare', cost: 3,
      text: 'お互い、破壊されたモンスターは、次のそのプレイヤーのターン開始時に場に戻る。展開時：墓地のモンスター1体を場に出す',
      effects: {
        scope: 'any',
        onMonsterDestroyed: async function (ctx, ev) {
          if (ev.isPhantom || ev.card.isCopy) return;
          const p = ctx.game.players[ev.who];
          p.flags.deadLandQueue = (p.flags.deadLandQueue || []).concat([ev.card.uid]);
        },
        onTurnStart: async function (ctx, ev) {
          const p = ctx.game.players[ev.who];
          const q = p.flags.deadLandQueue || [];
          p.flags.deadLandQueue = [];
          for (let i = 0; i < q.length; i++) {
            const inst = ctx.game.findCard(q[i]);
            if (!inst || inst.zone !== 'grave') continue;
            const r = await ctx.reviveFromGrave(inst, p, { triggerSummon: false });
            if (r) ctx.log('死者の国から' + ctx.nameOf(inst) + 'が戻ってきた');
          }
        },
        onPlace: async function (ctx) { await reviveOne(ctx); }
      } },
    // 20
    { id: 'doom_20', name: '呪詛返し', type: 'spell', lineage: 'doom', role: 'disrupt', rarity: 'rare', cost: 1, tags: ['disrupt'],
      text: '自分に置かれた呪詛をすべて相手に移す',
      effects: { onPlay: async function (ctx) { if (!ctx.me.curse) { ctx.log('移す呪詛がない'); return; } await ctx.moveCurse(ctx.me, ctx.opp); } } },
    // 21
    { id: 'doom_21', name: '終末の鍵・第五', type: 'spell', lineage: 'doom', role: 'finisher', rarity: 'legend', cost: 4, key: 5, tags: ['key'],
      text: '封印ゾーンに置く。山札から鍵カード1枚を探し、コストを払わずに使う',
      effects: { onPlay: Fx.seq(Fx.seal(), async function (ctx) {
        if (ctx.game.winner !== null) return;
        const cands = ctx.me.deck.filter(function (c) { return keyPred(c); });
        if (!cands.length) { ctx.log('山札に鍵カードはない'); ctx.shuffleDeck(ctx.me); return; }
        const picked = await ctx.pick({ kind: 'deckCard', side: 'ally', count: 1, filter: function (c, inst) { return cands.indexOf(inst) >= 0; }, prompt: 'コストを払わずに使う鍵カードを選ぶ' });
        const chosen = picked[0] || cands[0];
        ctx.shuffleDeck(ctx.me);
        await ctx.cast(chosen, ctx.me);
      }) } },
    // 22
    { id: 'doom_22', name: '封印の解放者', type: 'monster', lineage: 'doom', role: 'engine', rarity: 'legend', cost: 4, atk: 2, hp: 2, tags: ['wild'],
      text: '2/2。常在：自分の封印ゾーンの鍵1枚を、まだそろっていない種類の鍵として扱う',
      flavor: '鍵穴の形など、覚えていない。開けばいい。',
      // one of my seals counts as a wild key → only while I actually hold at least one key
      effects: { grants: [{ key: 'sealWildBonus', value: 1, when: function (ctx, p) { return p.seals.length > 0; } }],
        onSummon: async function (ctx) { ctx.checkWin(); } } },
    // 23
    { id: 'doom_23', name: '冥王の宣告', type: 'spell', lineage: 'doom', role: 'finisher', rarity: 'legend', cost: 5, tags: ['finisher'],
      text: '相手の呪詛を2倍にする',
      flavor: '宣告は一度きり。聞き返しても、二度言う。',
      effects: { onPlay: async function (ctx) { if (!ctx.opp.curse) { ctx.log('相手に呪詛はない'); return; } await ctx.addCurse(ctx.opp, ctx.opp.curse); } } },
    // 24
    { id: 'doom_24', name: '冥界の門番', type: 'monster', lineage: 'doom', role: 'finisher', rarity: 'legend', cost: 7, atk: 6, hp: 6, tags: ['finisher', 'loopPart'],
      text: '6/6。常在：自分のモンスター（幻影を含む）が破壊されるたび、相手に呪詛2',
      effects: { onMonsterDestroyed: Fx.curse(2) } },
    // 25
    { id: 'doom_25', name: '終末の預言書', type: 'crest', lineage: 'doom', role: 'finisher', rarity: 'taboo', cost: 9, timed: 3, tags: ['finisher'],
      text: '時限3：自分が勝利する。この時限カウントは、減らす効果を受けない。このカードは除去されない',
      flavor: '最後の頁は、はじめから書いてあった。',
      effects: { fixedTimer: true, indestructible: true, onTimed: async function (ctx) { ctx.log('預言は成就した'); ctx.specialWin(ctx.me, 'prophecy'); } } }
  ]);
})(globalThis.G = globalThis.G || {});
