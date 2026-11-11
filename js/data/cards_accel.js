(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // cards_accel.js — 加速系統（炎と竜）25枚  accel_01..accel_25
  // SPEC: docs/SPEC.md「加速系統カードリスト」。テキストは SPEC の効果欄そのまま。
  // ---------------------------------------------------------------
  const Fx = G.Fx;
  const DB = G.CardDB;
  const util = G.util;

  function isDragon(inst, def) { return (def || DB.get(inst.defId)).tags.indexOf('dragon') >= 0; }
  function isMonsterDef(inst, def) { return (def || DB.get(inst.defId)).type === 'monster'; }

  // 夜明けの暴走炉：ターン終了時に手札をすべて捨てる。
  // エンジンに「遅延トリガー」が無いため、隠し遺物を一時的に付与してターン終了時に自分を外す（workaround）。
  const OVERDRIVE_RELIC = '_fx_accel_overdrive_endturn';
  if (!G.RelicDB.has(OVERDRIVE_RELIC)) {
    G.RelicDB.register({
      id: OVERDRIVE_RELIC, name: '夜明けの暴走炉（持続効果）', category: 'hidden', hidden: true,
      text: 'ターン終了時、手札をすべて捨てる',
      effects: {
        onTurnEnd: async function (ctx, ev) {
          const p = ctx.owner;
          if (ev.who !== p.idx) return;
          util.removeFrom(p.relics, OVERDRIVE_RELIC);
          if (p.hand.length) {
            ctx.log('夜明けの暴走炉：手札をすべて捨てる');
            await ctx.discard(p.hand.slice(), p);
          }
        }
      }
    });
  }

  DB.registerAll([
    // 1
    {
      id: 'accel_01', name: '火の粉の妖精', type: 'monster', lineage: 'accel', role: 'fuel', rarity: 'common',
      cost: 0, atk: 1, hp: 1, text: '1/1。召喚時、マナ+1',
      flavor: '燃えかすから生まれて、燃えかすに戻る。本人は気にしていない。',
      tags: ['loopPart'],
      effects: { onSummon: Fx.gainMana(1) }
    },
    // 2
    {
      id: 'accel_02', name: 'マナ喰いの小妖精', type: 'monster', lineage: 'accel', role: 'fuel', rarity: 'common',
      cost: 1, atk: 1, hp: 1, text: '1/1。召喚時、マナ+2。破壊時、マナ+2',
      effects: { onSummon: Fx.gainMana(2), onDeath: Fx.gainMana(2) }
    },
    // 3
    {
      id: 'accel_03', name: '炉番のドワーフ', type: 'monster', lineage: 'accel', role: 'engine', rarity: 'common',
      cost: 2, atk: 2, hp: 3, text: '2/3。常在：自分の魔法のコスト-1',
      effects: {
        modCost: function (ctx, ev) { return DB.get(ev.card.defId).type === 'spell' ? ev.cost - 1 : ev.cost; }
      }
    },
    // 4
    {
      id: 'accel_04', name: '魔力を啜る蝙蝠', type: 'monster', lineage: 'accel', role: 'disrupt', rarity: 'common',
      cost: 2, atk: 1, hp: 2, text: '1/2。常在：相手がカードを使うたび、次の自分のターン開始時のマナ+1',
      tags: ['disrupt'],
      effects: {
        scope: 'any',
        onCardPlayed: function (ctx, ev) {
          if (ev.who === ctx.owner.idx || ev.isCopy) return;
          ctx.card.counters.stored = (ctx.card.counters.stored || 0) + 1;
          ctx.log('蝙蝠が魔力を啜った（' + ctx.card.counters.stored + '）');
        },
        onTurnStart: async function (ctx, ev) {
          if (ev.who !== ctx.owner.idx) return;
          const n = ctx.card.counters.stored || 0;
          ctx.card.counters.stored = 0;
          if (n > 0) await ctx.gainMana(n, ctx.owner);
        }
      }
    },
    // 5
    {
      id: 'accel_05', name: '竜の卵', type: 'monster', lineage: 'accel', role: 'fuel', rarity: 'common',
      cost: 1, atk: 0, hp: 3, text: '0/3。自分のターン開始時、マナ+1。破壊時、手札の竜のコスト-3',
      flavor: '中で何かが数を数えている。',
      tags: ['loopPart'],
      effects: {
        onTurnStart: Fx.gainMana(1),
        onDeath: async function (ctx) {
          const dragons = ctx.me.hand.filter(function (c) { return isDragon(c); });
          dragons.forEach(function (c) { c.costMod -= 3; });
          if (dragons.length) ctx.log('卵が割れた：手札の竜' + dragons.length + '枚のコスト-3');
        }
      }
    },
    // 6
    {
      id: 'accel_06', name: '火種', type: 'spell', lineage: 'accel', role: 'fuel', rarity: 'common',
      cost: 0, text: 'マナ+1。カードを1枚引く',
      tags: ['loopPart'],
      effects: { onPlay: Fx.seq(Fx.gainMana(1), Fx.draw(1)) }
    },
    // 7
    {
      id: 'accel_07', name: '夜明けの暴走炉', type: 'spell', lineage: 'accel', role: 'fuel', rarity: 'common',
      cost: 0, text: 'マナ+3。ターン終了時、手札をすべて捨てる',
      flavor: '朝までもてばいい。朝が来ればの話だが。',
      effects: {
        onPlay: async function (ctx) {
          await ctx.gainMana(3);
          if (ctx.me.relics.indexOf(OVERDRIVE_RELIC) < 0) ctx.me.relics.push(OVERDRIVE_RELIC);
        }
      }
    },
    // 8
    {
      id: 'accel_08', name: '燃え尽き', type: 'spell', lineage: 'accel', role: 'fuel', rarity: 'common',
      cost: 0, text: '手札を1枚捨て、そのカードのコスト分のマナを得る',
      targets: { kind: 'handCard', side: 'ally', count: 1, prompt: '捨てるカードを選ぶ', filter: function (ctx, c) { return !ctx.card || c.uid !== ctx.card.uid; } },
      effects: {
        onPlay: async function (ctx) {
          let t = ctx.targets[0];
          if (!t || t.zone !== 'hand') {
            const picked = await ctx.pick({ kind: 'handCard', side: 'ally', count: 1, prompt: '捨てるカードを選ぶ', filter: function (c2, c) { return c.uid !== ctx.card.uid; } });
            t = picked[0];
          }
          if (!t) { ctx.log('捨てる手札がない'); return; }
          const def = DB.get(t.defId);
          const n = def.cost === 'X' ? 0 : def.cost;
          await ctx.discard([t], ctx.me);
          if (n > 0) await ctx.gainMana(n);
        }
      }
    },
    // 9
    {
      id: 'accel_09', name: '焦熱解放', type: 'spell', lineage: 'accel', role: 'finisher', rarity: 'common',
      cost: 'X', text: 'Xダメージを与える',
      tags: ['finisher'],
      effects: { onPlay: Fx.dmgOpp(Fx.xValue()) }
    },
    // 10
    {
      id: 'accel_10', name: '帰還の火', type: 'spell', lineage: 'accel', role: 'engine', rarity: 'common',
      cost: 0, text: '自分の場のモンスター1体を手札に戻す。マナ+1',
      targets: { kind: 'boardMonster', side: 'ally', count: 1, prompt: '手札に戻すモンスターを選ぶ' },
      tags: ['loopPart'],
      effects: { onPlay: Fx.seq(Fx.bounceTarget(), Fx.gainMana(1)) }
    },
    // 11
    {
      id: 'accel_11', name: 'マナ封鎖', type: 'spell', lineage: 'accel', role: 'disrupt', rarity: 'common',
      cost: 2, reserve: true, text: '相手の次のターン中、相手が得るマナは半分になる',
      tags: ['disrupt'],
      effects: {},
      reserveHooks: { grants: [{ key: 'manaGainHalved', value: true }] }
    },
    // 12
    {
      id: 'accel_12', name: '魔力の泉', type: 'crest', lineage: 'accel', role: 'engine', rarity: 'common',
      cost: 2, text: '自分のターン開始時、マナ+1',
      effects: { onTurnStart: Fx.gainMana(1) }
    },
    // 13
    {
      id: 'accel_13', name: '焚べ火の祭壇', type: 'crest', lineage: 'accel', role: 'engine', rarity: 'common',
      cost: 1, text: '自分のターン中、自分のモンスターを何度でも破壊できる',
      flavor: '火は何度でも灯る。灯す者がいる限り。',
      tags: ['loopPart'],
      effects: {
        ability: {
          label: 'モンスターを破壊', oncePerTurn: false,
          targets: { kind: 'monster', side: 'ally', count: 1, prompt: '破壊する自分のモンスターを選ぶ' },
          use: async function (ctx) {
            const t = ctx.targets[0];
            if (t && t.uid !== undefined) await ctx.destroy(t, { source: ctx.card });
          }
        }
      }
    },
    // 14
    {
      id: 'accel_14', name: '火喰い竜', type: 'monster', lineage: 'accel', role: 'finisher', rarity: 'rare',
      cost: 7, atk: 5, hp: 5, keywords: ['rush'],
      text: '5/5。速攻。このターンに得たマナ1につき、このカードのコスト-1',
      tags: ['dragon', 'finisher'],
      effects: { costMod: function (ctx) { return -ctx.me.manaGainedThisTurn; } }
    },
    // 15
    {
      id: 'accel_15', name: '炎翼の伝令', type: 'monster', lineage: 'accel', role: 'engine', rarity: 'rare',
      cost: 3, atk: 2, hp: 2, keywords: ['rush'],
      text: '2/2。速攻。召喚時、手札のモンスター1体をコストを払わずに出す',
      effects: {
        onSummon: async function (ctx) {
          if (ctx.me.board.length >= ctx.status(ctx.me, 'maxBoard')) { ctx.log('場がいっぱいで出せない'); return; }
          // 禁忌の竜 (uncastable) can't be put out this way
          const cands = ctx.me.hand.filter(function (c) { return isMonsterDef(c) && !DB.get(c.defId).uncastable; });
          if (!cands.length) { ctx.log('手札にモンスターがいない'); return; }
          const picked = await ctx.pick({ kind: 'handCard', side: 'ally', count: 1, filter: function (c, inst) { return isMonsterDef(inst) && !DB.get(inst.defId).uncastable; }, prompt: 'コストを払わずに出すモンスターを選ぶ' });
          const m = picked[0];
          if (!m) return;
          ctx.log('伝令が' + ctx.nameOf(m) + 'を呼び出した');
          await ctx.summon(m, ctx.me);
        }
      }
    },
    // 16
    {
      id: 'accel_16', name: '魔力奔流', type: 'spell', lineage: 'accel', role: 'engine', rarity: 'rare',
      cost: 0, text: '今あるマナを2倍にする',
      tags: ['loopPart'],
      effects: { onPlay: Fx.multiplyMana(2) }
    },
    // 17
    {
      id: 'accel_17', name: '過充填の槍', type: 'spell', lineage: 'accel', role: 'finisher', rarity: 'rare',
      cost: 0, text: 'マナをすべて消費し、その2倍のダメージを与える',
      tags: ['finisher'],
      effects: {
        onPlay: async function (ctx) {
          const n = ctx.me.mana;
          if (n <= 0) { ctx.log('マナがない'); return; }
          ctx.loseMana(n, ctx.me);
          await ctx.damage(ctx.opp, n * 2);
        }
      }
    },
    // 18
    {
      id: 'accel_18', name: '無限の坩堝', type: 'spell', lineage: 'accel', role: 'engine', rarity: 'rare',
      cost: 5, text: 'このターン、すべてのカードのコストが0になる',
      effects: { onPlay: Fx.seq(Fx.statusThisTurn('allCostsZero', true), function (ctx) { ctx.log('坩堝が開いた：このターン、コストはすべて0'); }) }
    },
    // 19
    {
      id: 'accel_19', name: '暴走する炉心', type: 'crest', lineage: 'accel', role: 'engine', rarity: 'rare',
      cost: 3, text: 'マナを得るたび、さらにマナ+1',
      // 「得たマナ1につき、さらに+1」と解釈（SPECコンボ例：暴走炉の+3が+6になる）。再帰はエンジン側で1段に止まる。
      effects: { onManaGained: function (ctx, ev) { return ctx.gainMana(ev.amount); } }
    },
    // 20
    {
      id: 'accel_20', name: '竜脈の火山', type: 'field', lineage: 'accel', role: 'engine', rarity: 'rare',
      cost: 2, text: 'お互い、マナを得るたびさらに+1。展開時：マナ+2',
      effects: { scope: 'any', onManaGained: Fx.gainMana(1), onPlace: Fx.gainMana(2) }
    },
    // 21
    {
      id: 'accel_21', name: '黄金の水門', type: 'spell', lineage: 'accel', role: 'fuel', rarity: 'legend',
      cost: 0, text: 'マナ+5。使ったあと山札の一番上に戻る',
      flavor: '開けた者の名は、門のどこにも刻まれていない。',
      effects: { onPlay: Fx.gainMana(5), returnsToDeckTop: true }
    },
    // 22
    {
      id: 'accel_22', name: '永久機関', type: 'crest', lineage: 'accel', role: 'engine', rarity: 'legend',
      cost: 4, text: 'コスト0のカードを使うたび、マナ+1',
      tags: ['loopPart'],
      effects: {
        onCardPlayed: async function (ctx, ev) {
          if (ev.isCopy || ev.cost !== 0) return;
          await ctx.gainMana(1);
        }
      }
    },
    // 23
    {
      id: 'accel_23', name: '巡る不死鳥', type: 'monster', lineage: 'accel', role: 'engine', rarity: 'legend',
      cost: 0, atk: 1, hp: 1, text: '1/1。召喚時、マナ+1。場を離れたとき、手札に戻る',
      flavor: '死ぬのにも飽きた鳥。',
      tags: ['loopPart'],
      effects: {
        onSummon: Fx.gainMana(1),
        onLeave: async function (ctx) { await ctx.returnToHand(ctx.card); }
      }
    },
    // 24
    {
      id: 'accel_24', name: '焔帝竜', type: 'monster', lineage: 'accel', role: 'finisher', rarity: 'legend',
      cost: 10, atk: 8, hp: 8, keywords: ['rush'],
      text: '8/8。速攻。召喚時、このターンに得たマナの合計と同じダメージを相手に与える',
      flavor: 'あいつが来た日、あそこの雪が一晩で消えた。',
      tags: ['dragon', 'finisher'],
      effects: { onSummon: Fx.dmgOpp(Fx.manaGained(1)) }
    },
    // 25
    {
      id: 'accel_25', name: '天井なき空', type: 'crest', lineage: 'accel', role: 'engine', rarity: 'taboo',
      cost: 7, text: 'マナがターン終了時に消えなくなる。自分のターン開始時、マナが2倍になる',
      flavor: '上を見た者は、二度と下を見なかった。',
      effects: { grants: [{ key: 'manaPersists', value: true }, { key: 'manaDoubleAtStart', value: true }] }
    }
  ]);

  G.Data = G.Data || {};
  G.Data.ACCEL_OVERDRIVE_RELIC = OVERDRIVE_RELIC;
})(globalThis.G = globalThis.G || {});
