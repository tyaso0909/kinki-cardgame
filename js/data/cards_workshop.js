(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // cards_workshop.js — カード工房で採用した41枚（2026-11-18）
  //   ids continue each lineage's numbering: accel_40.., cycle_35.., copy_36.., chain_36.., time_36.., doom_38.., gen_49.
  //   time_tok01 is a hidden helper (年老いた大魔導士の時限魔法): oboroOnly and not a project id, so it never reaches
  //   packs, rewards, the shop or the codex.
  //   Engine hooks used here (added with these cards):
  //     effects.onSelfToGrave(ctx, {from, prevZone, reason}) — 「このカードが墓地に送られた時」
  //     effects.graveAbility — an ability used from the grave (枯れない花の戦士; 封じの番兵 stops it)
  //     onPhantomVanished — a phantom of mine disappeared (time-out at the end of the turn or ctx.consumePhantom)
  //     ctx.consumePhantom(inst) / ctx.summonOboro(defId, who)
  //     statuses timedMultiplier (年老いた大魔導士), dragonGuard (守護竜アーケン), allCharge (スケルトンキング),
  //     chainHalfCarry (ライジン); player.flags.returnAtTurnStart (時をかける女戦士)
  // ---------------------------------------------------------------
  const Fx = G.Fx;
  const DB = G.CardDB;

  function defOf(inst) { return DB.get(inst.defId); }
  function isMonster(inst) { return defOf(inst).type === 'monster'; }
  function isDragonDef(d) { return d.tags.indexOf('dragon') >= 0; }
  // the printed cost as a number (X and ∞ count as 0)
  function printedCost(def) { return typeof def.cost === 'number' && !def.uncastable ? def.cost : 0; }
  // once-per-turn style counters kept on the card itself
  function bump(ctx, key, max) {
    const t = ctx.game.turn;
    const f = ctx.card.flags;
    if (f[key + 'Turn'] !== t) { f[key + 'Turn'] = t; f[key] = 0; }
    if (f[key] >= max) return false;
    f[key] += 1;
    return true;
  }
  function boardRoom(ctx, p) { return Math.max(0, ctx.status(p, 'maxBoard') - p.board.length); }
  const SPARK = 'chain_05'; // 火花
  const SKELETON = 'doom_01'; // 墓場の骸骨兵
  const MAGE_SPELL = 'time_tok01';

  const DEFS = [
    // ================================================================ 加速
    { id: 'accel_40', name: '深紅のサムライ', type: 'monster', lineage: 'accel', role: 'finisher', rarity: 'rare',
      cost: 'X', atk: 2, hp: 1, keywords: ['charge'], tags: ['finisher'],
      text: '2/1。突進。召喚時、相手のモンスター1体か相手にXダメージを与える（Xは払ったコスト）',
      effects: { onSummon: async function (ctx) {
        const x = ctx.choices.x || 0;
        if (x <= 0) { ctx.log('X=0：ダメージはない'); return; }
        let t = ctx.opp;
        if (ctx.monstersOf(ctx.opp).length) {
          const picked = await ctx.pick({ kind: 'monster', side: 'enemy', count: 1, optional: true,
            prompt: x + 'ダメージを与える相手のモンスターを選ぶ（選ばなければ相手に与える）' });
          if (picked[0]) t = picked[0];
        }
        await ctx.damage(t, x);
      } } },
    { id: 'accel_41', name: '灰被りの火蜥蜴', type: 'monster', lineage: 'accel', role: 'fuel', rarity: 'common',
      cost: 2, atk: 2, hp: 1,
      text: '2/1。このカードが墓地に送られた時、マナ+2',
      effects: { onSelfToGrave: function (ctx) { return ctx.gainMana(2, ctx.owner); } } },
    { id: 'accel_42', name: '瞬足の豪槍エール', type: 'monster', lineage: 'accel', role: 'finisher', rarity: 'rare',
      cost: 5, atk: 6, hp: 4, keywords: ['rush', 'pierce'], tags: ['finisher'],
      text: '6/4。速攻・貫通。破壊時、相手のモンスター1体を選んで破壊する',
      effects: { onDeath: async function (ctx) {
        if (!ctx.monstersOf(ctx.opp).length) return;
        const picked = await ctx.pick({ kind: 'monster', side: 'enemy', count: 1, prompt: '破壊する相手のモンスターを選ぶ' });
        if (picked[0]) await ctx.destroy(picked[0], { source: ctx.card });
      } } },

    // ================================================================ 循環
    { id: 'cycle_35', name: '循環する水流', type: 'spell', lineage: 'cycle', role: 'fuel', rarity: 'common',
      cost: 1,
      text: '手札を好きな枚数捨て、捨てた枚数+1枚カードを引く',
      effects: { onPlay: async function (ctx) {
        const hand = ctx.me.hand.filter(function (c) { return c !== ctx.card; });
        let picked = [];
        if (hand.length) {
          picked = await ctx.pick({ kind: 'handCard', side: 'ally', count: hand.length, upTo: true,
            filter: function (c2, c) { return hand.indexOf(c) >= 0; }, prompt: '捨てるカードを選ぶ（捨てた枚数+1枚引く）' });
          if (picked.length) await ctx.discard(picked);
        }
        await ctx.draw(picked.length + 1);
      } } },
    { id: 'cycle_36', name: '波間の選別', type: 'spell', lineage: 'cycle', role: 'fuel', rarity: 'common',
      cost: 1,
      text: 'カードを3枚引き、手札を2枚選んで好きな順番で山札の上に戻す',
      effects: { onPlay: async function (ctx) {
        await ctx.draw(3);
        const hand = ctx.me.hand.filter(function (c) { return c !== ctx.card; });
        const n = Math.min(2, hand.length);
        if (!n) return;
        let picked = await ctx.pick({ kind: 'handCard', side: 'ally', count: n, filter: function (c2, c) { return hand.indexOf(c) >= 0; },
          prompt: '山札の上に戻すカードを' + n + '枚選ぶ（先に選んだカードが一番上）' });
        picked = picked.slice(0, n);
        for (let i = 0; picked.length < n && i < hand.length; i++) if (picked.indexOf(hand[i]) < 0) picked.push(hand[i]);
        ctx.putOnTop(picked, ctx.me);
        ctx.log(ctx.me.name + 'は手札' + picked.length + '枚を山札の上に戻した');
      } } },
    { id: 'cycle_37', name: '潮目の紋章', type: 'crest', lineage: 'cycle', role: 'engine', rarity: 'rare',
      cost: 2,
      text: '自分のターン開始時、山札の上2枚を見て、好きな枚数を墓地に送り、残りを好きな順番で山札の上に戻す',
      effects: { onTurnStart: async function (ctx) {
        const top = ctx.lookTop(2, ctx.me);
        if (!top.length) return;
        const toGrave = await ctx.pick({ kind: 'deckCard', side: 'ally', count: top.length, upTo: true, aiHint: 'lose',
          filter: function (c2, c) { return top.indexOf(c) >= 0; }, prompt: '墓地に送るカードを選ぶ（選ばなかったカードは山札の上に戻す）' });
        for (let i = 0; i < toGrave.length; i++) if (toGrave[i].zone === 'deck') await ctx.toGrave(toGrave[i], { reason: 'mill' });
        if (toGrave.length) ctx.log(ctx.me.name + 'は山札の上から' + toGrave.length + '枚を墓地に送った');
        const rest = top.filter(function (c) { return c.zone === 'deck'; });
        if (rest.length === 2 && rest[0].defId !== rest[1].defId) {
          const first = await ctx.pick({ kind: 'deckCard', side: 'ally', count: 1, filter: function (c2, c) { return rest.indexOf(c) >= 0; },
            prompt: '山札の一番上にするカードを選ぶ' });
          if (first[0]) ctx.putOnTop([first[0], rest[0] === first[0] ? rest[1] : rest[0]], ctx.me);
        }
      } } },
    { id: 'cycle_38', name: '沈没船の亡霊', type: 'monster', lineage: 'cycle', role: 'fuel', rarity: 'common',
      cost: 3, atk: 2, hp: 3,
      text: '2/3。このカードが墓地に送られた時、カードを1枚引く',
      effects: { onSelfToGrave: function (ctx) { return ctx.draw(1, ctx.owner); } } },
    { id: 'cycle_39', name: '深海の語り部', type: 'monster', lineage: 'cycle', role: 'disrupt', rarity: 'rare',
      cost: 3, atk: 2, hp: 4,
      text: '2/4。常在：自分がカードを引くたび、相手のモンスター1体（ランダム）に1ダメージを与える（1ターンに5回まで）',
      effects: { onDraw: async function (ctx) {
        const g = ctx.game;
        const list = ctx.monstersOf(ctx.opp).filter(function (m) { return !g.isWardedFrom(m, ctx.me.idx); });
        if (!list.length || !bump(ctx, 'teller', 5)) return;
        await ctx.damage(ctx.rng.pick(list), 1);
      } } },
    { id: 'cycle_40', name: '書庫番の大梟', type: 'monster', lineage: 'cycle', role: 'engine', rarity: 'rare',
      cost: 4, atk: 2, hp: 4,
      text: '2/4。常在：自分の手札のカードが墓地に送られるたび、カードを1枚引く（1ターンに3回まで）',
      effects: { onCardToGrave: async function (ctx, ev) {
        if (ev.from !== 'hand' || ev.who !== ctx.card.owner) return;
        if (!bump(ctx, 'owl', 3)) return;
        await ctx.draw(1, ctx.card.owner);
      } } },
    { id: 'cycle_41', name: '守護竜アーケン', type: 'monster', lineage: 'cycle', role: 'engine', rarity: 'rare',
      cost: 5, atk: 3, hp: 5, keywords: ['guard'], tags: ['dragon'],
      text: '3/5。守護。召喚時、手札のコスト5以下の竜1体を、コストを払わずに場に出す。常在：自分の場の竜は守護を持つ',
      flavor: '今こそ！団結の時！',
      effects: {
        grants: [{ key: 'dragonGuard', value: true }],
        onSummon: async function (ctx) {
          const ok = function (c) { const d = defOf(c); return c !== ctx.card && d.type === 'monster' && isDragonDef(d) && !d.uncastable && typeof d.cost === 'number' && d.cost <= 5; };
          if (!ctx.me.hand.some(ok)) { ctx.log('手札にコスト5以下の竜がいない'); return; }
          const picked = await ctx.pick({ kind: 'handCard', side: 'ally', count: 1, filter: function (c2, c) { return ok(c); }, prompt: 'コストを払わずに出す竜を選ぶ', aiHint: 'gain' });
          if (picked[0]) await ctx.summon(picked[0], ctx.me);
        }
      } },
    { id: 'cycle_42', name: '深海の書王', type: 'monster', lineage: 'cycle', role: 'finisher', rarity: 'legend',
      cost: 6, atk: 5, hp: 7, tags: ['finisher'],
      text: '5/7。常在：自分がカードを引くたび、相手に2ダメージを与える',
      flavor: '頁をめくる音は、深海では雷鳴に聞こえる。',
      effects: { onDraw: Fx.dmgOpp(2) } },

    // ================================================================ 複製
    { id: 'copy_36', name: '影送り', type: 'spell', lineage: 'copy', role: 'fuel', rarity: 'common',
      cost: 0,
      text: '自分の幻影を2体消し、カードを3枚引く',
      effects: {
        canPlay: function (ctx) { return ctx.me.phantoms.length >= 2; },
        onPlay: async function (ctx) {
          if (ctx.me.phantoms.length < 2) { ctx.log('消せる幻影が足りない'); return; }
          const picked = await ctx.pick({ kind: 'phantom', side: 'ally', count: 2, aiHint: 'lose', prompt: '消す幻影を2体選ぶ' });
          const list = picked.length >= 2 ? picked.slice(0, 2) : ctx.me.phantoms.slice(0, 2);
          for (let i = 0; i < list.length; i++) await ctx.consumePhantom(list[i]);
          await ctx.draw(3);
        }
      } },
    { id: 'copy_37', name: '破壊錬金術', type: 'spell', lineage: 'copy', role: 'disrupt', rarity: 'common',
      cost: 1, targets: Fx.T.enemyMonster,
      text: '相手のモンスター1体を破壊し、そのモンスターの幻影を自分の場に出す（強化もそのまま写す）',
      effects: { onPlay: async function (ctx) {
        const t = ctx.targets[0];
        if (!t || t.uid === undefined || !ctx.game.isInPlay(t)) return;
        await ctx.createPhantom(t, ctx.me);
        await ctx.destroy(t, { source: ctx.card });
      } } },
    { id: 'copy_38', name: '進軍する幻', type: 'spell', lineage: 'copy', role: 'finisher', rarity: 'common',
      cost: 2, tags: ['finisher'],
      text: 'このターン、自分の幻影はすべて速攻を持つ',
      effects: { onPlay: function (ctx) {
        ctx.setStatus(ctx.me, 'phantomRush', true, { untilEndOfTurnOf: 'thisTurn' });
        ctx.log(ctx.me.name + 'の幻影は、このターン速攻を持つ');
      } } },
    { id: 'copy_39', name: '骨の操り人形', type: 'monster', lineage: 'copy', role: 'fuel', rarity: 'common',
      cost: 2, atk: 1, hp: 1, tags: ['phantomMaker'],
      text: '1/1。このカードが墓地に送られた時、このカードの幻影を2体出す',
      effects: { onSelfToGrave: function (ctx) { return ctx.createPhantom(ctx.card, ctx.owner, { count: 2 }); } } },
    { id: 'copy_40', name: '鏡砕き', type: 'spell', lineage: 'copy', role: 'disrupt', rarity: 'common',
      cost: 2,
      text: '自分の幻影1体を消し、その攻撃力と同じダメージを相手のモンスターすべてに与える',
      effects: {
        canPlay: function (ctx) { return ctx.me.phantoms.length >= 1; },
        onPlay: async function (ctx) {
          if (!ctx.me.phantoms.length) { ctx.log('消せる幻影がいない'); return; }
          const picked = await ctx.pick({ kind: 'phantom', side: 'ally', count: 1, aiHint: 'best', prompt: '消す幻影を選ぶ（その攻撃力が全体へのダメージになる）' });
          const ph = picked[0] || ctx.me.phantoms[0];
          const n = ctx.atkOf(ph);
          await ctx.consumePhantom(ph);
          if (n > 0) await Fx.dmgAllEnemyMonsters(n)(ctx);
        }
      } },
    { id: 'copy_41', name: '霧散の書', type: 'crest', lineage: 'copy', role: 'engine', rarity: 'rare',
      cost: 2,
      text: '自分の幻影が消えるたび、カードを1枚引く（1ターンに2回まで）',
      effects: { onPhantomVanished: async function (ctx) {
        if (!bump(ctx, 'mist', 2)) return;
        await ctx.draw(1, ctx.card.owner);
      } } },
    { id: 'copy_42', name: '鏡の魔術師', type: 'monster', lineage: 'copy', role: 'engine', rarity: 'rare',
      cost: 3, atk: 3, hp: 3, keywords: ['ward'],
      text: '3/3。加護。常在：自分の幻影が消えるたび、自分の場の幻影でないモンスター1体（ランダム）に+1/+1',
      effects: { onPhantomVanished: async function (ctx) {
        const list = ctx.game.players[ctx.card.owner].board.slice();
        if (!list.length) return;
        const m = ctx.rng.pick(list);
        await ctx.buff(m, { atk: 1, hp: 1 });
        ctx.log(ctx.nameOf(m) + 'に+1/+1');
      } } },
    { id: 'copy_43', name: '霧纏いの竜騎', type: 'monster', lineage: 'copy', role: 'finisher', rarity: 'rare',
      cost: 4, atk: 3, hp: 3, keywords: ['rush'], tags: ['dragon', 'phantomMaker', 'finisher'],
      text: '3/3。速攻。召喚時、このカードの幻影を1体出す。常在：自分の幻影が出るたび、相手に1ダメージを与える',
      flavor: '霧の向こうにも、同じ槍の穂先が光る。',
      effects: { onSummon: Fx.phantomOfSelf(1), onPhantomCreated: Fx.dmgOpp(1) } },
    { id: 'copy_44', name: '幻影喰らい', type: 'monster', lineage: 'copy', role: 'finisher', rarity: 'rare',
      cost: 4, atk: 3, hp: 3, tags: ['finisher'],
      text: '3/3。召喚時、自分の幻影を好きな数消す。消した1体につき+2/+2',
      effects: { onSummon: async function (ctx) {
        const n0 = ctx.me.phantoms.length;
        if (!n0) { ctx.log('消せる幻影がいない'); return; }
        const picked = await ctx.pick({ kind: 'phantom', side: 'ally', count: n0, upTo: true, aiHint: 'best', prompt: '消す幻影を選ぶ（1体につき+2/+2）' });
        let n = 0;
        for (let i = 0; i < picked.length; i++) if (await ctx.consumePhantom(picked[i])) n++;
        if (n && ctx.game.isInPlay(ctx.card)) await ctx.buff(ctx.card, { atk: 2 * n, hp: 2 * n });
      } } },

    // ================================================================ 連鎖
    { id: 'chain_36', name: '線香花火', type: 'spell', lineage: 'chain', role: 'fuel', rarity: 'common',
      cost: 0, related: [SPARK],
      text: '「火花」の朧を2枚手札に加える',
      effects: { onPlay: async function (ctx) { await ctx.createOboro(SPARK, ctx.me, 'hand'); await ctx.createOboro(SPARK, ctx.me, 'hand'); } } },
    { id: 'chain_37', name: '雷鳴の残響', type: 'monster', lineage: 'chain', role: 'fuel', rarity: 'common',
      cost: 1, atk: 1, hp: 1,
      text: '1/1。このカードが墓地に送られた時、連鎖数+2し、相手に1ダメージを与える',
      effects: { onSelfToGrave: async function (ctx) { await ctx.addChain(2, ctx.owner); await ctx.damage(ctx.opp, 1); } } },
    { id: 'chain_38', name: '火花散らし', type: 'crest', lineage: 'chain', role: 'engine', rarity: 'common',
      cost: 1, related: [SPARK],
      text: '自分のターン開始時、「火花」の朧を1枚手札に加える',
      effects: { onTurnStart: function (ctx) { return ctx.createOboro(SPARK, ctx.card.owner, 'hand'); } } },
    { id: 'chain_39', name: '帯電する結界像', type: 'monster', lineage: 'chain', role: 'disrupt', rarity: 'rare',
      cost: 3, atk: 1, hp: 4, keywords: ['guard'],
      text: '1/4。守護。自分のターン終了時、次の自分のターンが始まるまで体力+連鎖数',
      effects: { onTurnEnd: async function (ctx) {
        if (!ctx.game.isInPlay(ctx.card)) return;
        const owner = ctx.game.players[ctx.card.owner];
        const n = ctx.chainOf(owner);
        if (n <= 0) return;
        // expires at the end of the opponent's turn = until my next turn starts
        await ctx.buff(ctx.card, { hp: n, until: { player: 1 - owner.idx } });
        ctx.log(ctx.nameOf(ctx.card) + 'の体力+' + n + '（次の自分のターンまで）');
      } } },
    { id: 'chain_40', name: 'ライジン', type: 'monster', lineage: 'chain', role: 'finisher', rarity: 'legend',
      cost: 5, atk: 4, hp: 4, keywords: ['rush'], tags: ['finisher'],
      text: '4/4。速攻。常在：自分のターン終了時、連鎖数は0ではなく半分（切り捨て）になり、次のターンに持ち越す',
      flavor: '鳴り終えた太鼓も、まだ震えている。',
      effects: { grants: [{ key: 'chainHalfCarry', value: true }] } },
    { id: 'chain_41', name: '雷を纏う一角獣', type: 'monster', lineage: 'chain', role: 'disrupt', rarity: 'common',
      cost: 5, atk: 0, hp: 2, keywords: ['guard'],
      text: '0/2。守護。召喚時、連鎖数と同じだけ攻撃力と体力が増える',
      effects: { onSummon: async function (ctx) {
        const n = ctx.chainOf(ctx.me);
        if (n > 0 && ctx.game.isInPlay(ctx.card)) await ctx.buff(ctx.card, { atk: n, hp: n });
      } } },
    { id: 'chain_42', name: '鎖竜ボルト', type: 'monster', lineage: 'chain', role: 'finisher', rarity: 'rare',
      cost: 7, atk: 9, hp: 9, keywords: ['ward'], tags: ['dragon', 'finisher'],
      text: '9/9。加護。このカードのコストは連鎖数だけ下がる。常在：自分がカードを使うたび、相手に1ダメージを与える',
      flavor: '何人も私を縛ることはできない',
      effects: { costMod: function (ctx) { return -ctx.chainOf(ctx.me); }, onCardPlayed: Fx.dmgOpp(1) } },

    // ================================================================ 時間
    { id: 'time_36', name: '投資の指南書', type: 'spell', lineage: 'time', role: 'engine', rarity: 'rare',
      cost: 1, timed: 4,
      text: '時限4：最大マナ+5',
      effects: { onTimed: function (ctx) { ctx.gainMaxMana(5); } } },
    { id: 'time_37', name: '未来への契約', type: 'spell', lineage: 'time', role: 'disrupt', rarity: 'common',
      cost: 2, timed: 2,
      text: '時限2：相手のモンスター1体を選んで破壊する（選ぶのは時限が切れたとき）',
      effects: { onTimed: async function (ctx) {
        if (!ctx.monstersOf(ctx.opp).length) { ctx.log('破壊できる相手のモンスターがいない'); return; }
        const picked = await ctx.pick({ kind: 'monster', side: 'enemy', count: 1, prompt: '破壊する相手のモンスターを選ぶ' });
        if (picked[0]) await ctx.destroy(picked[0], { source: ctx.card });
      } } },
    { id: 'time_38', name: '時をかける女戦士', type: 'monster', lineage: 'time', role: 'finisher', rarity: 'rare',
      cost: 3, atk: 3, hp: 1, keywords: ['rush'], tags: ['finisher'],
      text: '3/1。速攻。自分のターン終了時、このカードを除外する。次の自分のターン開始時、このカードの朧を場に出す',
      effects: { onTurnEnd: async function (ctx) {
        const c = ctx.card;
        if (c.isPhantom || !ctx.game.isInPlay(c)) return;
        const owner = ctx.game.players[c.owner];
        await ctx.exile(c);
        (owner.flags.returnAtTurnStart = owner.flags.returnAtTurnStart || []).push(c.defId);
        ctx.log(ctx.nameOf(c) + 'は時の向こうへ消えた（次の' + owner.name + 'のターンに戻る）');
      } } },
    { id: 'time_39', name: '遅れて届く遺言', type: 'monster', lineage: 'time', role: 'engine', rarity: 'rare',
      cost: 3, atk: 3, hp: 3,
      text: '3/3。このカードが墓地に送られた時、このカードを時限2で時限ゾーンに置く（時限が切れると場に出る）',
      effects: { onSelfToGrave: function (ctx) { return ctx.addTimed(ctx.card, ctx.owner, 2); } } },
    { id: 'time_40', name: '時告げの鐘撞き', type: 'monster', lineage: 'time', role: 'finisher', rarity: 'rare',
      cost: 3, atk: 2, hp: 4, tags: ['finisher'],
      text: '2/4。常在：自分の時限カードが発動するたび、相手に2ダメージを与える',
      effects: { onTimedFired: async function (ctx, ev) {
        const n = (ev && ev.times) || 1;
        for (let i = 0; i < n && ctx.game.winner === null; i++) await ctx.damage(ctx.opp, 2);
      } } },
    { id: 'time_41', name: '時戻しの機械人形', type: 'monster', lineage: 'time', role: 'fuel', rarity: 'rare',
      cost: 4, atk: 3, hp: 3, keywords: ['guard'],
      text: '3/3。守護。召喚時、マナ+4',
      effects: { onSummon: Fx.gainMana(4) } },
    { id: 'time_42', name: '年老いた大魔導士', type: 'monster', lineage: 'time', role: 'finisher', rarity: 'legend',
      cost: 7, atk: 3, hp: 5, tags: ['finisher'],
      text: '3/5。召喚時、「時限1：相手に5ダメージ。その後、同じ時限をもう一度置く」を置く。常在：自分の時限カードは、発動するとき2回発動する',
      flavor: '耐えてみせるのだぞ',
      effects: {
        grants: [{ key: 'timedMultiplier', value: 2 }],
        onSummon: function (ctx) { return placeMageSpell(ctx, ctx.me); }
      } },

    // ================================================================ 終焉
    { id: 'doom_38', name: '冥府の渡し賃', type: 'spell', lineage: 'doom', role: 'finisher', rarity: 'common',
      cost: 1, tags: ['finisher'],
      text: '手札を1枚捨て、そのカードのコストと同じだけ相手に呪詛（コストX・∞のカードは0）',
      effects: { onPlay: async function (ctx) {
        const hand = ctx.me.hand.filter(function (c) { return c !== ctx.card; });
        if (!hand.length) { ctx.log('捨てる手札がない'); return; }
        const picked = await ctx.pick({ kind: 'handCard', side: 'ally', count: 1, filter: function (c2, c) { return hand.indexOf(c) >= 0; }, prompt: '捨てるカードを選ぶ（コストと同じだけ相手に呪詛）' });
        const c = picked[0] || hand[0];
        const n = printedCost(defOf(c));
        await ctx.discard([c]);
        if (n > 0) await ctx.addCurse(ctx.opp, n);
      } } },
    { id: 'doom_39', name: '枯れない花の戦士', type: 'monster', lineage: 'doom', role: 'fuel', rarity: 'common',
      cost: 2, atk: 3, hp: 2, keywords: ['guard'],
      text: '3/2。守護。このカードが墓地にあるとき、自分のターンに1回、山札の上から1枚を墓地に送って、このカードを墓地から場に出せる',
      effects: { graveAbility: {
        label: '墓地から場に出す', oncePerTurn: true,
        canUse: function (ctx) { return ctx.me.deck.length > 0 && boardRoom(ctx, ctx.me) > 0; },
        use: async function (ctx) {
          await ctx.mill(1, ctx.me);
          if (ctx.card.zone === 'grave') await ctx.reviveFromGrave(ctx.card, ctx.me);
        }
      } } },
    { id: 'doom_40', name: '骸を喰らう大蛇', type: 'monster', lineage: 'doom', role: 'engine', rarity: 'rare',
      cost: 5, atk: 3, hp: 5,
      text: '3/5。常在：カードが墓地に送られるたび（どちらのプレイヤーのカードでも）、+1/+1（ずっと残る）',
      effects: { scope: 'any', onCardToGrave: async function (ctx) {
        if (ctx.game.isInPlay(ctx.card)) await ctx.buff(ctx.card, { atk: 1, hp: 1 });
      } } },
    { id: 'doom_41', name: '魂の狂宴', type: 'spell', lineage: 'doom', role: 'finisher', rarity: 'legend',
      cost: 6, tags: ['finisher'],
      text: '自分の墓地のモンスターを好きな数（場の空きまで）場に出す。召喚時の効果も発動する',
      flavor: '荒ぶる魂を蘇らせよ',
      effects: { onPlay: async function (ctx) {
        const room = boardRoom(ctx, ctx.me);
        const mons = ctx.me.grave.filter(isMonster);
        if (!room || !mons.length) { ctx.log(!room ? '場に空きがない' : '墓地にモンスターがいない'); return; }
        const picked = await ctx.pick({ kind: 'graveCard', side: 'ally', count: Math.min(room, mons.length), upTo: true,
          filter: function (c2, c) { return isMonster(c); }, prompt: '場に出すモンスターを選ぶ（' + Math.min(room, mons.length) + '体まで）' });
        for (let i = 0; i < picked.length && ctx.game.winner === null; i++) {
          if (picked[i].zone === 'grave') await ctx.reviveFromGrave(picked[i], ctx.me);
        }
      } } },
    { id: 'doom_42', name: 'スケルトンキング', type: 'monster', lineage: 'doom', role: 'finisher', rarity: 'legend',
      cost: 7, atk: 5, hp: 5, keywords: ['charge'], tags: ['finisher'], related: [SKELETON],
      text: '5/5。突進。召喚時、場が埋まるまで「墓場の骸骨兵」の朧を出す。常在：自分のモンスターは突進を持つ。破壊時、相手に呪詛3',
      flavor: '王は止まらぬ',
      effects: {
        grants: [{ key: 'allCharge', value: true }],
        onSummon: async function (ctx) {
          for (let i = 0; i < 10 && boardRoom(ctx, ctx.me) > 0 && ctx.game.winner === null; i++) {
            if (!(await ctx.summonOboro(SKELETON, ctx.me))) break;
          }
        },
        onDeath: Fx.curse(3)
      } },
    { id: 'doom_43', name: '墓より這い出る屍竜', type: 'monster', lineage: 'doom', role: 'finisher', rarity: 'legend',
      cost: 8, atk: 7, hp: 7, tags: ['dragon', 'finisher'],
      text: '7/7。このカードが手札か山札から墓地に送られた時、このカードを場に出す',
      flavor: '捨てられた竜ほど、よく這い上がる。',
      effects: { onSelfToGrave: async function (ctx, ev) {
        if (ev.from !== 'hand' && ev.from !== 'deck') return;
        await ctx.reviveFromGrave(ctx.card, ctx.owner);
      } } },

    // ================================================================ 汎用
    { id: 'gen_49', name: '大いなる弔い', type: 'spell', lineage: 'generic', role: 'engine', rarity: 'rare',
      cost: 3,
      text: '自分の山札の上から5枚を墓地に送る。その中のモンスター1体を場に出す',
      effects: { onPlay: async function (ctx) {
        const milled = await ctx.mill(5, ctx.me);
        const cands = milled.filter(function (c) { return c.zone === 'grave' && c.owner === ctx.me.idx && isMonster(c); });
        if (!cands.length) { ctx.log('墓地に送ったカードにモンスターがいない'); return; }
        const picked = await ctx.pick({ kind: 'graveCard', side: 'ally', count: 1, filter: function (c2, c) { return cands.indexOf(c) >= 0; }, prompt: '場に出すモンスターを選ぶ' });
        const m = picked[0] || cands[0];
        if (m.zone === 'grave') await ctx.reviveFromGrave(m, ctx.me);
      } } },

    // ================================================================ hidden helper
    { id: MAGE_SPELL, name: '大魔導士の時限魔法', type: 'spell', lineage: 'time', role: 'finisher', rarity: 'legend',
      cost: 0, timed: 1, oboroOnly: true,
      text: '時限1：相手に5ダメージを与える。その後、同じ時限をもう一度置く',
      effects: { onTimed: async function (ctx) {
        await ctx.damage(ctx.opp, 5);
        if (ctx.game.winner === null) await placeMageSpell(ctx, ctx.owner);
      } } }
  ];

  // 年老いた大魔導士: the repeating timed spell (a copy: it vanishes after it fires instead of going to the grave)
  async function placeMageSpell(ctx, who) {
    const p = ctx.who(who);
    const inst = ctx.game.createCardInst(MAGE_SPELL, p.idx, { isCopy: true });
    inst.oboro = true;
    await ctx.addTimed(inst, p, 1);
    return inst;
  }

  DB.registerAll(DEFS);
})(globalThis.G = globalThis.G || {});
