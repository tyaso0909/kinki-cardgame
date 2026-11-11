(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // cards_ext.js — 2026-11 追加カード 45枚（企画書「追加モンスター案」「バフ・デバフ」「最大マナ」）
  //   ids continue each lineage's numbering: accel_26.., cycle_26.., copy_26.., chain_26.., time_26..,
  //   doom_26.., gen_31..
  //   New keywords (engine): ward 加護 / untouchable 不可侵 / double 連撃 / pierce 貫通.
  //   New statuses: handLimitDelta, monsterAtkDelta, atkPerHandCard, curseShrink; def.effects.dynamicStats.
  // ---------------------------------------------------------------
  const Fx = G.Fx;
  const DB = G.CardDB;

  function defOf(inst) { return DB.get(inst.defId); }
  function isDragon(inst) { return defOf(inst).tags.indexOf('dragon') >= 0; }
  function isMonsterCard(inst) { return defOf(inst).type === 'monster'; }
  function keyOf(inst) { return defOf(inst).key || null; }
  function allMonsters(ctx) { return ctx.monstersOf(0).concat(ctx.monstersOf(1)); }
  async function buffAll(ctx, list, b) { for (let i = 0; i < list.length; i++) if (ctx.game.isInPlay(list[i])) await ctx.buff(list[i], b); }
  // set a monster's stats outright (clears its buffs and damage)
  async function setStats(ctx, inst, atk, hp) {
    inst.buffs = []; inst.atk = atk; inst.hp = hp; inst.maxHp = hp; inst.damage = 0;
    ctx.emit('buff', { uid: inst.uid, atk: atk, hp: hp, set: true });
    if (ctx.game.hpOf(inst) <= 0 && ctx.game.isInPlay(inst)) await ctx.destroy(inst, { source: ctx.card });
  }
  const ALLY = { kind: 'monster', side: 'ally', count: 1, prompt: '自分のモンスターを選ぶ' };
  const ENEMY = { kind: 'monster', side: 'enemy', count: 1, prompt: '相手のモンスターを選ぶ' };
  const ANY = { kind: 'monster', side: 'any', count: 1, prompt: 'モンスターを選ぶ' };
  function target(ctx) { const t = ctx.targets[0]; return t && t.uid !== undefined && ctx.game.isInPlay(t) ? t : null; }

  DB.registerAll([
    // ================================================================ 追加モンスター（17）
    // ---- 加速
    { id: 'accel_26', name: '暁焔の竜王', type: 'monster', lineage: 'accel', role: 'engine', rarity: 'legend',
      cost: 7, atk: 7, hp: 7, keywords: ['rush'], tags: ['dragon'],
      text: '7/7。速攻。召喚時、マナを最大値まで回復する',
      flavor: '夜明けは毎朝やって来る。この竜は、それを待たない。',
      effects: { onSummon: async function (ctx) {
        const d = ctx.me.maxMana - ctx.me.mana;
        if (d > 0) await ctx.gainMana(d); else ctx.log('マナはもう最大値だ');
      } } },
    { id: 'accel_27', name: '溶岩の巨竜', type: 'monster', lineage: 'accel', role: 'engine', rarity: 'rare',
      cost: 6, atk: 6, hp: 6, keywords: ['rush'], tags: ['dragon'],
      text: '6/6。速攻。召喚時、この戦闘中、手札の竜のコスト-2',
      effects: { onSummon: function (ctx) {
        const list = ctx.me.hand.filter(isDragon);
        list.forEach(function (c) { c.costMod = (c.costMod || 0) - 2; });
        ctx.log(list.length ? '手札の竜' + list.length + '枚のコスト-2' : '手札に竜がいない');
      } } },
    { id: 'accel_28', name: '灼熱の竜騎兵', type: 'monster', lineage: 'accel', role: 'finisher', rarity: 'rare',
      cost: 5, atk: 5, hp: 4, keywords: ['rush', 'pierce'], tags: ['finisher'],
      text: '5/4。速攻・貫通。召喚時、マナ+2',
      effects: { onSummon: Fx.gainMana(2) } },
    // ---- 循環
    { id: 'cycle_26', name: '深淵の大海蛇', type: 'monster', lineage: 'cycle', role: 'engine', rarity: 'legend',
      cost: 8, atk: 8, hp: 8,
      text: '8/8。召喚時、手札が7枚になるまで引く。常在：自分の手札上限+3',
      flavor: '深淵を覗く者は、たいてい本を落とす。',
      effects: { onSummon: Fx.drawTo(7), grants: [{ key: 'handLimitDelta', value: 3 }] } },
    { id: 'cycle_27', name: '写本の巨像', type: 'monster', lineage: 'cycle', role: 'disrupt', rarity: 'rare',
      cost: 6, atk: 4, hp: 8, keywords: ['guard'],
      text: '4/8。守護。常在：自分がカードを引くたび、攻撃力+1（ずっと残る）',
      effects: { onDraw: async function (ctx) { if (ctx.game.isInPlay(ctx.card)) await ctx.buff(ctx.card, { atk: 1 }); } } },
    // ---- 複製
    { id: 'copy_26', name: '百鬼夜行の主', type: 'monster', lineage: 'copy', role: 'fuel', rarity: 'legend',
      cost: 7, atk: 5, hp: 5, tags: ['phantomMaker'],
      text: '5/5。召喚時、自分の場のモンスター（幻影を含む）それぞれの幻影を1体ずつ出す',
      flavor: '行列の最後尾に並んでいたのは、行列そのものだった。',
      effects: { onSummon: async function (ctx) {
        const list = ctx.monstersOf(ctx.me).slice();
        for (let i = 0; i < list.length; i++) {
          const made = await ctx.createPhantom(list[i], ctx.me, { count: 1 });
          if (!made.length) break;
        }
      } } },
    { id: 'copy_27', name: '鏡像の騎士', type: 'monster', lineage: 'copy', role: 'finisher', rarity: 'rare',
      cost: 5, atk: 4, hp: 4, keywords: ['double'], tags: ['phantomMaker', 'finisher'],
      text: '4/4。連撃。召喚時、このカードの幻影を1体出す',
      effects: { onSummon: Fx.phantomOfSelf(1) } },
    // ---- 連鎖
    { id: 'chain_26', name: '天穿つ雷霆竜', type: 'monster', lineage: 'chain', role: 'finisher', rarity: 'legend',
      cost: 8, atk: 8, hp: 8, keywords: ['rush', 'double'], tags: ['dragon', 'finisher'],
      text: '8/8。速攻・連撃。このターンの連鎖数1につき、このカードのコスト-1',
      flavor: '空に穴が開いた日は、雨が降らない。',
      effects: { costMod: function (ctx) { return -ctx.chainOf(ctx.me); } } },
    { id: 'chain_27', name: '迅雷の獅子', type: 'monster', lineage: 'chain', role: 'finisher', rarity: 'rare',
      cost: 4, atk: 4, hp: 2, keywords: ['rush'], tags: ['finisher'],
      text: '4/2。速攻。常在：自分がカードを使うたび、ターン終了まで攻撃力+1',
      effects: { onCardPlayed: async function (ctx, ev) {
        if (ev.card === ctx.card || !ctx.game.isInPlay(ctx.card)) return;
        await ctx.buff(ctx.card, { atk: 1, until: 'endOfTurn' });
      } } },
    // ---- 時間
    { id: 'time_26', name: '終わらぬ刻の巨人', type: 'monster', lineage: 'time', role: 'finisher', rarity: 'legend',
      cost: 9, atk: 9, hp: 9, tags: ['finisher'],
      text: '9/9。召喚時、このターンのあとに追加ターンを1回得る',
      flavor: '巨人の一歩は、一日では終わらない。',
      effects: { onSummon: Fx.extraTurn() } },
    { id: 'time_27', name: '停滞の番人', type: 'monster', lineage: 'time', role: 'disrupt', rarity: 'rare',
      cost: 6, atk: 3, hp: 9, keywords: ['guard'], tags: ['disrupt'],
      text: '3/9。守護。召喚時、相手の時限カードすべてのカウント+2',
      effects: { onSummon: async function (ctx) {
        if (!ctx.opp.timed.length) { ctx.log('相手に時限カードがない'); return; }
        await ctx.adjustTimed(ctx.opp.timed.slice(), 2, ctx.opp);
      } } },
    // ---- 終焉
    { id: 'doom_26', name: '骸の黒竜', type: 'monster', lineage: 'doom', role: 'finisher', rarity: 'legend',
      cost: 7, atk: 7, hp: 7, tags: ['dragon', 'finisher'],
      text: '7/7。召喚時、自分の墓地のモンスターをすべて除外し、1体につき+1/+1、相手に呪詛1',
      flavor: '骨は数えられるのを嫌う。だから全部まとめて来た。',
      effects: { onSummon: async function (ctx) {
        const list = ctx.me.grave.filter(isMonsterCard);
        for (let i = 0; i < list.length; i++) await ctx.exile(list[i]);
        const n = list.length;
        if (!n) { ctx.log('墓地にモンスターがいない'); return; }
        if (ctx.game.isInPlay(ctx.card)) await ctx.buff(ctx.card, { atk: n, hp: n });
        await ctx.addCurse(ctx.opp, n);
      } } },
    { id: 'doom_27', name: '終焉を告げる騎士', type: 'monster', lineage: 'doom', role: 'disrupt', rarity: 'rare',
      cost: 5, atk: 5, hp: 5, keywords: ['ward'], tags: ['disrupt'],
      text: '5/5。加護。破壊時、相手のモンスター1体を破壊する',
      effects: { onDeath: async function (ctx) {
        const picked = await ctx.pick(Object.assign({}, ENEMY, { prompt: '破壊する相手のモンスターを選ぶ' }));
        if (picked[0]) await ctx.destroy(picked[0]); else ctx.log('破壊できる相手のモンスターがいない');
      } } },
    { id: 'doom_28', name: '封印の巨像', type: 'monster', lineage: 'doom', role: 'engine', rarity: 'legend',
      cost: 8, atk: 6, hp: 10, keywords: ['guard'],
      text: '6/10。守護。召喚時、山札から種類の違う鍵カードを2枚探して手札に加える',
      effects: { onSummon: async function (ctx) {
        const first = await ctx.tutor(function (c, d) { return !!d.key; }, ctx.me, { prompt: '手札に加える鍵カードを選ぶ（1枚目）' });
        if (!first) return;
        const k = keyOf(first);
        await ctx.tutor(function (c, d) { return !!d.key && d.key !== k; }, ctx.me, { prompt: '手札に加える鍵カードを選ぶ（2枚目・種類の違うもの）' });
      } } },
    // ---- 汎用
    { id: 'gen_31', name: '不可侵の巨神', type: 'monster', lineage: 'generic', role: 'finisher', rarity: 'legend',
      cost: 8, atk: 9, hp: 9, keywords: ['ward', 'untouchable'], tags: ['finisher'],
      text: '9/9。加護・不可侵',
      flavor: '誰も触れられない。誰も、触れようとしない。',
      effects: {} },
    { id: 'gen_32', name: '呪文喰らいの魔獣', type: 'monster', lineage: 'generic', role: 'disrupt', rarity: 'rare',
      cost: 5, atk: 4, hp: 6, keywords: ['ward'], tags: ['disrupt'],
      text: '4/6。加護。常在：相手が魔法を使うたび、攻撃力+2（ずっと残る）',
      effects: { scope: 'any', onSpellPlayed: async function (ctx, ev) {
        if (ev.who === ctx.card.owner || !ctx.game.isInPlay(ctx.card)) return;
        await ctx.game.makeCtx(ctx.card.owner, ctx.card).buff(ctx.card, { atk: 2 });
      } } },
    { id: 'gen_33', name: '終末の獣', type: 'monster', lineage: 'generic', role: 'finisher', rarity: 'taboo',
      cost: 10, atk: 12, hp: 12, keywords: ['rush', 'pierce'], tags: ['finisher'],
      text: '12/12。速攻・貫通。召喚時、このカード以外のすべてのモンスターを破壊する',
      flavor: '終わりは、いつも一頭でやって来る。',
      effects: { onSummon: async function (ctx) {
        const list = allMonsters(ctx).filter(function (m) { return m !== ctx.card; });
        for (let i = 0; i < list.length; i++) if (ctx.game.isInPlay(list[i])) await ctx.destroy(list[i]);
      } } },

    // ================================================================ バフ（9）
    { id: 'gen_34', name: '戦の雄叫び', type: 'spell', lineage: 'generic', role: 'finisher', rarity: 'common',
      cost: 1, text: '自分のモンスター1体に+3/+3', targets: ALLY,
      effects: { onPlay: async function (ctx) { const t = target(ctx); if (t) await ctx.buff(t, { atk: 3, hp: 3 }); } } },
    { id: 'gen_35', name: '鼓舞の角笛', type: 'spell', lineage: 'generic', role: 'finisher', rarity: 'common',
      cost: 2, text: '自分のモンスターすべて（幻影を含む）に+1/+1',
      effects: { onPlay: function (ctx) { return buffAll(ctx, ctx.monstersOf(ctx.me).slice(), { atk: 1, hp: 1 }); } } },
    { id: 'accel_29', name: '竜血の儀', type: 'spell', lineage: 'accel', role: 'finisher', rarity: 'rare',
      cost: 'X', text: '自分のモンスター1体に+X/+X', targets: ALLY,
      effects: { onPlay: async function (ctx) {
        const t = target(ctx), x = ctx.choices.x || 0;
        if (t && x > 0) await ctx.buff(t, { atk: x, hp: x });
      } } },
    { id: 'chain_28', name: '雷纏い', type: 'spell', lineage: 'chain', role: 'finisher', rarity: 'common',
      cost: 0, text: 'このターン、自分のモンスター1体の攻撃力+連鎖数', targets: ALLY,
      effects: { onPlay: async function (ctx) {
        const t = target(ctx), n = ctx.chainOf(ctx.me);
        if (t && n > 0) await ctx.buff(t, { atk: n, until: 'endOfTurn' });
      } } },
    { id: 'copy_28', name: '鏡の軍旗', type: 'crest', lineage: 'copy', role: 'engine', rarity: 'rare',
      cost: 2, text: '常在：自分の幻影は+2/+2',
      effects: { grants: [{ key: 'phantomAtkBonus', value: 2 }, { key: 'phantomHpBonus', value: 2 }] } },
    { id: 'cycle_28', name: '知識は力', type: 'crest', lineage: 'cycle', role: 'finisher', rarity: 'rare',
      cost: 3, text: '常在：自分の手札1枚につき、自分のモンスターの攻撃力+1',
      flavor: '本は重い。投げればなおさら。',
      effects: { grants: [{ key: 'atkPerHandCard', value: 1 }] } },
    { id: 'time_28', name: '時の加護', type: 'spell', lineage: 'time', role: 'finisher', rarity: 'common',
      cost: 2, timed: 2, text: '時限2：自分のモンスターすべてに+3/+3',
      effects: { onTimed: function (ctx) { return buffAll(ctx, ctx.monstersOf(ctx.me).slice(), { atk: 3, hp: 3 }); } } },
    { id: 'doom_30', name: '死者の力', type: 'spell', lineage: 'doom', role: 'finisher', rarity: 'rare',
      cost: 2, text: '自分のモンスター1体に、自分の墓地のモンスターの数だけ+1/+1', targets: ALLY,
      effects: { onPlay: async function (ctx) {
        const t = target(ctx), n = ctx.me.grave.filter(isMonsterCard).length;
        if (t && n > 0) await ctx.buff(t, { atk: n, hp: n }); else if (!n) ctx.log('墓地にモンスターがいない');
      } } },
    { id: 'gen_40', name: '巨人化の秘薬', type: 'spell', lineage: 'generic', role: 'finisher', rarity: 'legend',
      cost: 4, text: '自分のモンスター1体の攻撃力と体力を2倍にする', targets: ALLY,
      flavor: '用法：一滴。用量：守った者はいない。',
      effects: { onPlay: async function (ctx) {
        const t = target(ctx);
        if (t) await ctx.buff(t, { atk: ctx.atkOf(t), hp: ctx.game.maxHpOf(t) });
      } } },

    // ================================================================ デバフ（8）
    { id: 'gen_36', name: '脱力の呪い', type: 'spell', lineage: 'generic', role: 'disrupt', rarity: 'common',
      cost: 1, text: '相手のモンスター1体に-2/-2', targets: ENEMY, tags: ['disrupt'],
      effects: { onPlay: async function (ctx) { const t = target(ctx); if (t) await ctx.buff(t, { atk: -2, hp: -2 }); } } },
    { id: 'gen_37', name: '衰弱の霧', type: 'spell', lineage: 'generic', role: 'disrupt', rarity: 'rare',
      cost: 3, text: '相手のモンスターすべてに-1/-1', tags: ['disrupt'],
      effects: { onPlay: function (ctx) { return buffAll(ctx, ctx.monstersOf(ctx.opp).slice(), { atk: -1, hp: -1 }); } } },
    { id: 'gen_38', name: '縮小の呪文', type: 'spell', lineage: 'generic', role: 'disrupt', rarity: 'rare',
      cost: 3, text: '相手のモンスター1体の攻撃力と体力を1にする', targets: ENEMY, tags: ['disrupt'],
      effects: { onPlay: async function (ctx) { const t = target(ctx); if (t) await setStats(ctx, t, 1, 1); } } },
    { id: 'time_29', name: '刻の剥落', type: 'spell', lineage: 'time', role: 'disrupt', rarity: 'rare',
      cost: 2, text: '相手のモンスター1体のバフをすべて消し、さらに-2/-2', targets: ENEMY, tags: ['disrupt'],
      effects: { onPlay: async function (ctx) {
        const t = target(ctx);
        if (!t) return;
        t.buffs = [];
        await ctx.buff(t, { atk: -2, hp: -2 });
      } } },
    { id: 'chain_29', name: '帯電の網', type: 'crest', lineage: 'chain', role: 'disrupt', rarity: 'rare',
      cost: 3, text: '常在：自分がカードを使うたび、相手のモンスターすべての攻撃力-1（ターン終了まで）', tags: ['disrupt'],
      effects: { onCardPlayed: function (ctx) { return buffAll(ctx, ctx.monstersOf(ctx.opp).slice(), { atk: -1, until: 'endOfTurn' }); } } },
    { id: 'doom_29', name: '呪詛の重み', type: 'crest', lineage: 'doom', role: 'disrupt', rarity: 'rare',
      cost: 3, text: '常在：相手のモンスターは、相手に置かれた呪詛5つにつき-1/-1', tags: ['disrupt'],
      effects: { grants: [{ key: 'curseShrink', value: 1, side: 'enemy' }] } },
    { id: 'copy_29', name: '入れ替えの鏡', type: 'spell', lineage: 'copy', role: 'disrupt', rarity: 'common',
      cost: 1, text: 'モンスター1体の攻撃力と体力を入れ替える', targets: ANY, tags: ['disrupt'],
      effects: { onPlay: async function (ctx) {
        const t = target(ctx);
        if (!t) return;
        const a = ctx.atkOf(t), hp = ctx.hpOf(t);
        await setStats(ctx, t, hp, a);
        ctx.log(ctx.nameOf(t) + 'は' + hp + '/' + a + 'になった');
      } } },
    { id: 'gen_39', name: '重力の谷', type: 'field', lineage: 'generic', role: 'disrupt', rarity: 'rare',
      cost: 3, text: 'お互いのモンスターは攻撃力-2（0より下がらない）', tags: ['disrupt'],
      effects: { grants: [{ key: 'monsterAtkDelta', value: -2, side: 'any' }] } },

    // ================================================================ 最大マナ（11）
    { id: 'accel_30', name: '魔力の種', type: 'spell', lineage: 'accel', role: 'fuel', rarity: 'common',
      cost: 2, text: '最大マナ+1',
      effects: { onPlay: Fx.gainMaxMana(1) } },
    { id: 'accel_31', name: '炉心の見習い', type: 'monster', lineage: 'accel', role: 'fuel', rarity: 'common',
      cost: 3, atk: 2, hp: 2, text: '2/2。召喚時、最大マナ+1',
      effects: { onSummon: Fx.gainMaxMana(1) } },
    { id: 'accel_32', name: '竜脈の紋章', type: 'crest', lineage: 'accel', role: 'engine', rarity: 'rare',
      cost: 4, text: '自分のターン開始時、最大マナがさらに+1',
      effects: { grants: [{ key: 'maxManaGainDelta', value: 1 }] } },
    { id: 'accel_33', name: '天井知らず', type: 'spell', lineage: 'accel', role: 'engine', rarity: 'legend',
      cost: 5, text: '最大マナを2倍にする',
      flavor: '上限は、誰かが書き忘れた。',
      effects: { onPlay: function (ctx) { return ctx.gainMaxMana(ctx.me.maxMana); } } },
    { id: 'cycle_29', name: '知識の器', type: 'spell', lineage: 'cycle', role: 'fuel', rarity: 'rare',
      cost: 1, text: '手札を好きな枚数捨て、1枚につき最大マナ+1',
      effects: { onPlay: async function (ctx) {
        const hand = ctx.me.hand.filter(function (c) { return c !== ctx.card; });
        if (!hand.length) { ctx.log('捨てる手札がない'); return; }
        const picked = await ctx.pick({ kind: 'handCard', side: 'ally', count: hand.length, upTo: true, filter: function (c2, c) { return hand.indexOf(c) >= 0; }, prompt: '捨てる手札を選ぶ（1枚につき最大マナ+1）' });
        if (!picked.length) { ctx.log('何も捨てなかった'); return; }
        await ctx.discard(picked);
        await ctx.gainMaxMana(picked.length);
      } } },
    { id: 'time_30', name: '未来の器', type: 'spell', lineage: 'time', role: 'fuel', rarity: 'common',
      cost: 1, timed: 2, text: '時限2：最大マナ+3',
      effects: { onTimed: Fx.gainMaxMana(3) } },
    { id: 'chain_30', name: '雷の器', type: 'spell', lineage: 'chain', role: 'fuel', rarity: 'rare',
      cost: 0, text: '連鎖数が10以上なら最大マナ+2',
      effects: { onPlay: Fx.when(Fx.chainAtLeast(10), Fx.gainMaxMana(2), function (ctx) { ctx.log('連鎖数が足りない（10以上で最大マナ+2）'); }) } },
    { id: 'doom_31', name: '命の器', type: 'spell', lineage: 'doom', role: 'fuel', rarity: 'common',
      cost: 1, text: 'ライフを5失い、最大マナ+2',
      effects: { onPlay: async function (ctx) { await ctx.loseLife(ctx.me, 5); if (ctx.game.winner === null) ctx.gainMaxMana(2); } } },
    { id: 'copy_30', name: '写し取りの杯', type: 'spell', lineage: 'copy', role: 'fuel', rarity: 'rare',
      cost: 2, text: '最大マナを相手の最大マナと同じにする（相手の方が多いときだけ）',
      effects: { onPlay: function (ctx) {
        const d = ctx.opp.maxMana - ctx.me.maxMana;
        if (d > 0) ctx.gainMaxMana(d); else ctx.log('相手の最大マナの方が多くない');
      } } },
    { id: 'gen_41', name: '魔脈断ち', type: 'spell', lineage: 'generic', role: 'disrupt', rarity: 'rare',
      cost: 4, text: '相手の最大マナ-2', tags: ['disrupt'],
      effects: { onPlay: function (ctx) { ctx.gainMaxMana(-2, ctx.opp); } } },
    { id: 'gen_42', name: 'マナの巨人', type: 'monster', lineage: 'generic', role: 'finisher', rarity: 'rare',
      cost: 6, atk: 0, hp: 0, xStats: true, tags: ['finisher'],
      text: 'X/X。Xは自分の最大マナ',
      effects: { dynamicStats: function (game, inst) {
        const p = game.players[inst.owner];
        const x = p ? p.maxMana : 0;
        return { atk: x, hp: x };
      } } }
  ]);
})(globalThis.G = globalThis.G || {});
