(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // cards_cycle.js — 循環系統（水と書庫）25枚  cycle_01..cycle_25
  // SPEC: docs/SPEC.md「循環系統カードリスト」。新キーワード「再演」= def.reprise。
  // ---------------------------------------------------------------
  const Fx = G.Fx;
  const DB = G.CardDB;

  function isSpell(inst, def) { return (def || DB.get(inst.defId)).type === 'spell'; }
  function isMonster(inst, def) { return (def || DB.get(inst.defId)).type === 'monster'; }

  // Let the chooser order a list of cards (used by 写本の精霊). Returns a new array.
  // The chooser is asked "which goes on top" repeatedly; default chooser keeps the order as is.
  async function orderCards(ctx, cards, prompt) {
    const rest = cards.slice();
    const out = [];
    while (rest.length > 1) {
      const picked = await ctx.pick({ kind: 'deckCard', side: 'ally', count: 1, filter: function (c2, c) { return rest.indexOf(c) >= 0; }, prompt: prompt });
      const c = picked[0] || rest[0];
      G.util.removeFrom(rest, c);
      out.push(c);
    }
    return out.concat(rest);
  }

  DB.registerAll([
    // 1
    {
      id: 'cycle_01', name: '書庫の小人', type: 'monster', lineage: 'cycle', role: 'fuel', rarity: 'common',
      cost: 1, atk: 1, hp: 1, text: '1/1。召喚時、カードを1枚引く',
      flavor: '読んではいない。運んでいるだけだ、と本人は言う。',
      effects: { onSummon: Fx.draw(1) }
    },
    // 2
    {
      id: 'cycle_02', name: '潮騒の人魚', type: 'monster', lineage: 'cycle', role: 'fuel', rarity: 'common',
      cost: 2, atk: 2, hp: 2, text: '2/2。召喚時、墓地の魔法1枚を手札に戻す',
      effects: { onSummon: Fx.recoverFromGrave(isSpell, '手札に戻す魔法を選ぶ') }
    },
    // 3
    {
      id: 'cycle_03', name: '渦潮の番人', type: 'monster', lineage: 'cycle', role: 'fuel', rarity: 'common',
      cost: 2, atk: 1, hp: 3, keywords: ['guard'], text: '1/3。守護。破壊時、カードを2枚引く',
      effects: { onDeath: Fx.draw(2) }
    },
    // 4
    {
      id: 'cycle_04', name: '写本の精霊', type: 'monster', lineage: 'cycle', role: 'fuel', rarity: 'common',
      cost: 0, atk: 0, hp: 1, text: '0/1。召喚時、山札の上3枚を見て、好きな順番で戻す',
      effects: {
        onSummon: async function (ctx) {
          const top = ctx.lookTop(3, ctx.me);
          if (!top.length) return;
          ctx.log('山札の上' + top.length + '枚：' + top.map(function (c) { return ctx.nameOf(c); }).join('、'));
          const ordered = await orderCards(ctx, top, '一番上に置くカードを選ぶ');
          ctx.putOnTop(ordered, ctx.me);
        }
      }
    },
    // 5
    {
      id: 'cycle_05', name: '知識の泉水', type: 'spell', lineage: 'cycle', role: 'fuel', rarity: 'common',
      cost: 1, text: 'カードを2枚引く',
      effects: { onPlay: Fx.draw(2) }
    },
    // 6
    {
      id: 'cycle_06', name: '潮の満ち引き', type: 'spell', lineage: 'cycle', role: 'fuel', rarity: 'common',
      cost: 0, text: '手札をすべて山札に戻してシャッフルし、戻した枚数と同じだけ引く',
      effects: {
        onPlay: async function (ctx) {
          const n = ctx.shuffleHandIntoDeck(ctx.me);
          ctx.log('手札' + n + '枚を山札に戻した');
          if (n > 0) await ctx.draw(n);
        }
      }
    },
    // 7
    {
      id: 'cycle_07', name: '古文書の発掘', type: 'spell', lineage: 'cycle', role: 'fuel', rarity: 'common',
      cost: 1, text: '墓地のカード2枚を手札に戻す',
      effects: {
        onPlay: async function (ctx) {
          const picked = await ctx.pick({ kind: 'graveCard', side: 'ally', count: 2, prompt: '手札に戻すカードを2枚選ぶ' });
          for (let i = 0; i < picked.length; i++) await ctx.addToHand(picked[i], ctx.me);
        }
      }
    },
    // 8
    {
      id: 'cycle_08', name: '水鏡の占い', type: 'spell', lineage: 'cycle', role: 'fuel', rarity: 'common',
      cost: 0, text: '山札の上5枚を見て、1枚を手札に加え、残りを墓地に送る',
      effects: {
        onPlay: async function (ctx) {
          const top = ctx.lookTop(5, ctx.me);
          if (!top.length) { ctx.log('山札がない'); return; }
          const picked = await ctx.pick({ kind: 'deckCard', side: 'ally', count: 1, filter: function (c2, c) { return top.indexOf(c) >= 0; }, prompt: '手札に加えるカードを選ぶ' });
          const keep = picked[0] || top[0];
          await ctx.addToHand(keep, ctx.me);
          for (let i = 0; i < top.length; i++) if (top[i] !== keep) await ctx.toGrave(top[i], { reason: 'mill' });
          ctx.log('残り' + (top.length - 1) + '枚を墓地に送った');
        }
      }
    },
    // 9
    {
      id: 'cycle_09', name: '泡沫の呪文', type: 'spell', lineage: 'cycle', role: 'fuel', rarity: 'common',
      cost: 0, reprise: 0, text: 'カードを1枚引く。再演（0）',
      flavor: '消える前に、もう一度だけ。',
      effects: { onPlay: Fx.draw(1) }
    },
    // 10
    {
      id: 'cycle_10', name: '忘却の波', type: 'spell', lineage: 'cycle', role: 'disrupt', rarity: 'common',
      cost: 2, reserve: true, text: '相手の次のターン開始時、相手は手札を2枚選んで山札の一番下に戻す',
      tags: ['disrupt'],
      effects: {},
      reserveHooks: {
        onActivate: async function (ctx, ev) {
          const victim = ctx.game.players[ev.who];
          if (!victim.hand.length) return;
          const picked = await ctx.pick({ kind: 'handCard', side: 'ally', count: 2, who: victim.idx, chooser: victim.idx, prompt: '山札の一番下に戻すカードを2枚選ぶ' });
          if (picked.length) {
            ctx.putOnBottom(picked, victim);
            ctx.log(victim.name + 'は手札' + picked.length + '枚を山札の一番下に戻した');
          }
        }
      }
    },
    // 11
    {
      id: 'cycle_11', name: '深淵の問い', type: 'spell', lineage: 'cycle', role: 'disrupt', rarity: 'common',
      cost: 1, text: '相手の手札を見て、1枚選んで捨てさせる',
      tags: ['disrupt'],
      effects: {
        onPlay: async function (ctx) {
          if (!ctx.opp.hand.length) { ctx.log('相手の手札はない'); return; }
          ctx.log('相手の手札：' + ctx.opp.hand.map(function (c) { return ctx.nameOf(c); }).join('、'));
          const picked = await ctx.pick({ kind: 'handCard', side: 'enemy', count: 1, prompt: '捨てさせるカードを選ぶ' });
          if (picked[0]) await ctx.discard([picked[0]], ctx.opp);
        }
      }
    },
    // 12
    {
      id: 'cycle_12', name: '言霊の洪水', type: 'spell', lineage: 'cycle', role: 'finisher', rarity: 'common',
      cost: 0, text: 'このターンに自分が引いたカードの枚数×2ダメージを与える',
      tags: ['finisher'],
      effects: { onPlay: Fx.dmgOpp(Fx.drawnThisTurn(2)) }
    },
    // 13
    {
      id: 'cycle_13', name: '満ちる書架', type: 'crest', lineage: 'cycle', role: 'engine', rarity: 'common',
      cost: 2, text: '自分のターン終了時、手札が3枚以下ならカードを1枚引く',
      effects: { onTurnEnd: Fx.when(function (ctx) { return ctx.me.hand.length <= 3; }, Fx.draw(1)) }
    },
    // 14
    {
      id: 'cycle_14', name: '大図書館の司書長', type: 'monster', lineage: 'cycle', role: 'engine', rarity: 'rare',
      cost: 4, atk: 3, hp: 5, text: '3/5。常在：自分がカードを引くたび、マナ+1',
      flavor: '静かに、と言われたことは一度もない。誰も来ないからだ。',
      tags: ['loopPart'],
      effects: { onDraw: Fx.gainMana(1) }
    },
    // 15
    {
      id: 'cycle_15', name: '流転の水竜', type: 'monster', lineage: 'cycle', role: 'engine', rarity: 'rare',
      cost: 6, atk: 4, hp: 6, text: '4/6。召喚時、墓地のモンスター1体を場に出す',
      tags: ['dragon'],
      effects: { onSummon: Fx.reviveFromGrave(null, '場に出すモンスターを選ぶ') }
    },
    // 16
    {
      id: 'cycle_16', name: '巻き戻しの泉', type: 'spell', lineage: 'cycle', role: 'engine', rarity: 'rare',
      cost: 2, text: '墓地の魔法1枚を、コストを払わずに使う。その魔法は使ったあと除外される',
      effects: {
        onPlay: async function (ctx) {
          const picked = await ctx.pick({ kind: 'graveCard', side: 'ally', count: 1, filter: function (c2, c) { return isSpell(c) && !DB.get(c.defId).reserve; }, prompt: 'コストを払わずに使う魔法を選ぶ' });
          if (!picked[0]) { ctx.log('墓地に魔法がない'); return; }
          await ctx.cast(picked[0], ctx.me, { exileAfter: true });
        }
      }
    },
    // 17
    {
      id: 'cycle_17', name: '溢れ出す記憶', type: 'spell', lineage: 'cycle', role: 'fuel', rarity: 'rare',
      cost: 3, text: '手札が7枚になるまでカードを引く',
      effects: { onPlay: Fx.drawTo(7) }
    },
    // 18
    {
      id: 'cycle_18', name: '沈む書庫', type: 'crest', lineage: 'cycle', role: 'engine', rarity: 'rare',
      cost: 3, text: '自分の魔法が墓地に送られるたび、カードを1枚引く',
      effects: { onSpellToGrave: Fx.draw(1) }
    },
    // 19
    {
      id: 'cycle_19', name: '底なしの湖', type: 'field', lineage: 'cycle', role: 'engine', rarity: 'rare',
      cost: 2, text: 'お互い、ターン開始時に引く枚数が2枚になる。展開時：カードを2枚引く',
      effects: { grants: [{ key: 'drawPerTurn', value: 2, side: 'any' }], onPlace: Fx.draw(2) }
    },
    // 20
    {
      id: 'cycle_20', name: '逆巻く大海嘯', type: 'spell', lineage: 'cycle', role: 'finisher', rarity: 'rare',
      cost: 4, text: '自分の墓地のカード1枚につき1ダメージを与える。その後、墓地のカードをすべて山札に戻してシャッフルする',
      tags: ['finisher'],
      effects: {
        onPlay: async function (ctx) {
          const n = ctx.me.grave.length;
          if (n > 0) await ctx.damage(ctx.opp, n);
          ctx.shuffleGraveIntoDeck(ctx.me);
        }
      }
    },
    // 21
    {
      id: 'cycle_21', name: '永劫の書', type: 'crest', lineage: 'cycle', role: 'engine', rarity: 'legend',
      cost: 4, text: '自分が使った魔法は、墓地に送られる代わりに手札に戻る',
      flavor: '最後の頁をめくると、最初の頁だった。',
      tags: ['loopPart'],
      effects: { grants: [{ key: 'spellsReturnToHand', value: true }] }
    },
    // 22
    {
      id: 'cycle_22', name: '時を綴る大賢者', type: 'monster', lineage: 'cycle', role: 'fuel', rarity: 'legend',
      cost: 5, atk: 3, hp: 3, text: '3/3。召喚時、墓地のカードをすべて山札に戻してシャッフルし、5枚引く',
      effects: { onSummon: Fx.seq(Fx.shuffleGraveIntoDeck(), Fx.draw(5)) }
    },
    // 23
    {
      id: 'cycle_23', name: '書喰らいの海魔', type: 'monster', lineage: 'cycle', role: 'finisher', rarity: 'legend',
      cost: 8, atk: 7, hp: 7, text: '7/7。召喚時、このターンに自分が引いたカードの枚数×2枚、相手の山札の上から墓地に送る',
      flavor: '読んだ本は忘れない。食べた本は、もっと忘れない。',
      tags: ['finisher'],
      effects: { onSummon: Fx.millOpp(Fx.drawnThisTurn(2)) }
    },
    // 24
    {
      id: 'cycle_24', name: '全知の雫', type: 'spell', lineage: 'cycle', role: 'fuel', rarity: 'legend',
      cost: 3, text: '山札をすべて見て、好きなカード3枚を手札に加える。その後、山札をシャッフルする',
      effects: {
        onPlay: async function (ctx) {
          if (!ctx.me.deck.length) { ctx.log('山札がない'); return; }
          const picked = await ctx.pick({ kind: 'deckCard', side: 'ally', count: 3, prompt: '手札に加えるカードを3枚選ぶ' });
          for (let i = 0; i < picked.length; i++) await ctx.addToHand(picked[i], ctx.me);
          ctx.shuffleDeck(ctx.me);
        }
      }
    },
    // 25
    {
      id: 'cycle_25', name: '終わりなき頁', type: 'crest', lineage: 'cycle', role: 'engine', rarity: 'taboo',
      cost: 6, text: '自分の墓地のカードを、手札と同じように使える',
      flavor: '書き終えた者はいない。読み終えた者もいない。',
      effects: { grants: [{ key: 'gravePlayable', value: true }] }
    }
  ]);
})(globalThis.G = globalThis.G || {});
