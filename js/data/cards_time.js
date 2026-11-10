(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // cards_time.js — 時間系統（時の魔術）25枚  time_01..time_25
  // 時限N: timed zone / ctx.adjustTimed(cards, -1) で早める。
  // 巻き戻し: game.turnSnapshotOf(pIdx, k).state + game.restore(state, {keepHandOf, keepGraveOf})
  //   ※ restore 後は game.players が別オブジェクトになるので ctx.me は使わず game.players[idx] を引き直す。
  // ---------------------------------------------------------------
  const Fx = G.Fx;
  const DB = G.CardDB;

  // Pick one own timed card and move its count by -1.
  async function hastenOne(ctx, prompt) {
    if (!ctx.me.timed.length) { ctx.log('時限カードがない'); return; }
    const picked = await ctx.pick({ kind: 'timedCard', side: 'ally', count: 1, prompt: prompt || 'カウントを減らす時限カードを選ぶ' });
    if (picked[0]) await ctx.adjustTimed([picked[0]], -1, ctx.me);
  }
  // All own timed cards -1.
  async function hastenAll(ctx) {
    if (!ctx.me.timed.length) { ctx.log('時限カードがない'); return; }
    await ctx.adjustTimed(ctx.me.timed.slice(), -1, ctx.me);
  }
  // Is the current turn an extra (consecutive) turn of the active player?
  function inExtraTurn(game) { return game.streak > 1; }

  // 時渡りの剣士: +3 atk while in an extra turn (buff lasts to end of turn).
  async function swordsmanBuff(ctx, inst) {
    if (inst.flags.extraBuffTurn === ctx.game.turn) return;
    inst.flags.extraBuffTurn = ctx.game.turn;
    await ctx.buff(inst, { atk: 3, until: 'endOfTurn' });
    ctx.log('時渡りの剣士は追加ターンの力で攻撃力+3');
  }

  // 歴史改変: undo one of the opponent's plays from the previous turn (approximation, see DEVIATIONS "Cards B").
  function playerIn(state, idx) { return state && state.players ? state.players[idx] : null; }
  function uidsOf(arr) { return (arr || []).map(function (c) { return c.uid; }); }
  async function rewriteHistory(ctx) {
    const g = ctx.game;
    const me = ctx.me, opp = ctx.opp;
    const actions = g.prevTurnActions || [];
    const snaps = g.prevTurnActionSnapshots || [];
    const plays = [];
    for (let i = 0; i < actions.length; i++) {
      const a = actions[i];
      if (a.type === 'play' && a.who === opp.idx) plays.push({ idx: i, action: a });
    }
    if (!plays.length) { ctx.log('相手が前のターンに使ったカードはない'); return false; }
    const options = plays.map(function (p) { return { id: String(p.idx), label: DB.get(p.action.defId).name }; });
    const chosenId = await ctx.choose(options, { prompt: 'なかったことにするカードを選ぶ' });
    const chosen = plays.find(function (p) { return String(p.idx) === chosenId; }) || plays[0];
    const idx = chosen.idx;
    function snapAt(i) {
      if (i >= actions.length) return null;
      const byRef = snaps.find(function (s) { return s.action === actions[i]; });
      return byRef ? byRef.state : (snaps[i] ? snaps[i].state : null);
    }
    const pre = snapAt(idx);
    let post = snapAt(idx + 1);
    if (!post) { const ts = g.turnSnapshotOf(me.idx, 0); post = ts ? ts.state : null; }
    if (!pre || !post) { ctx.log('歴史の記録が足りず、巻き戻せなかった'); return false; }
    const preMe = playerIn(pre, me.idx), postMe = playerIn(post, me.idx);
    const preOpp = playerIn(pre, opp.idx), postOpp = playerIn(post, opp.idx);
    const name = DB.get(chosen.action.defId).name;
    ctx.log(name + 'の効果はなかったことになった');
    // 1) damage / life loss I took from that action
    const lifeBack = preMe.life - postMe.life;
    if (lifeBack > 0) ctx.heal(me, lifeBack);
    // 2) curse put on me
    const curseBack = postMe.curse - preMe.curse;
    if (curseBack > 0) ctx.removeCurse(me, curseBack);
    // 3) monsters that appeared on the opponent's side and are still there → vanish
    const before = uidsOf(preOpp.board).concat(uidsOf(preOpp.phantoms));
    const after = uidsOf(postOpp.board).concat(uidsOf(postOpp.phantoms));
    for (let i = 0; i < after.length; i++) {
      if (before.indexOf(after[i]) >= 0) continue;
      const inst = g.findCard(after[i]);
      if (inst && g.isInPlay(inst) && inst.owner === opp.idx) {
        if (inst.isPhantom) ctx.vanishPhantom(inst); else await ctx.exile(inst);
      }
    }
    // 4) damage my monsters took from that action
    for (let i = 0; i < postMe.board.length; i++) {
      const pc = postMe.board[i];
      const pb = preMe.board.find(function (c) { return c.uid === pc.uid; });
      const now = g.findCard(pc.uid);
      if (!pb || !now || !g.isInPlay(now)) continue;
      const d = pc.damage - pb.damage;
      if (d > 0) now.damage = Math.max(0, now.damage - d);
    }
    return true;
  }

  // 時間逆行 / 巻き戻しの鐘 share this: restore `state`, players `keep` keep their hand (and grave).
  function restoreKeeping(game, state, pIdx, keepGrave) {
    const opts = { keepHandOf: pIdx };
    if (keepGrave) opts.keepGraveOf = pIdx;
    game.restore(state, opts);
  }

  DB.registerAll([
    // 1
    { id: 'time_01', name: '時計仕掛けの小鳥', type: 'monster', lineage: 'time', role: 'fuel', rarity: 'common', cost: 1, atk: 1, hp: 1,
      text: '1/1。召喚時、自分の時限カード1枚のカウント-1',
      effects: { onSummon: async function (ctx) { await hastenOne(ctx); } } },
    // 2
    { id: 'time_02', name: '砂時計の番人', type: 'monster', lineage: 'time', role: 'fuel', rarity: 'common', cost: 3, atk: 2, hp: 4, keywords: ['guard'],
      text: '2/4。守護。破壊時、自分の時限カードすべてのカウント-1',
      effects: { onDeath: async function (ctx) { await hastenAll(ctx); } } },
    // 3
    { id: 'time_03', name: '未来視の梟', type: 'monster', lineage: 'time', role: 'fuel', rarity: 'common', cost: 2, atk: 1, hp: 2,
      text: '1/2。召喚時、時限1：カードを2枚引く',
      flavor: '明日の新聞を読んでいる。今日の分はまだ届かない。',
      effects: {
        // the timed effect is carried by a copy of this card placed in the timed zone
        onSummon: async function (ctx) {
          const tok = ctx.game.createCardInst('time_03', ctx.me.idx, { isCopy: true });
          await ctx.addTimed(tok, ctx.me, 1);
        },
        onTimed: Fx.draw(2)
      } },
    // 4
    { id: 'time_04', name: '過去からの来訪者', type: 'monster', lineage: 'time', role: 'fuel', rarity: 'common', cost: 2, atk: 2, hp: 2,
      text: '2/2。召喚時、前のターンに自分が使った魔法1枚を、墓地から手札に戻す',
      effects: {
        onSummon: async function (ctx) {
          const prev = ctx.me.prevTurnSpells || [];
          const picked = await ctx.pick({ kind: 'graveCard', side: 'ally', count: 1,
            filter: function (c, inst) { const d = DB.get(inst.defId); return d.type === 'spell' && prev.indexOf(d.id) >= 0; },
            prompt: '手札に戻す魔法を選ぶ' });
          if (picked[0]) await ctx.addToHand(picked[0], ctx.me); else ctx.log('前のターンに使った魔法は墓地にない');
        }
      } },
    // 5
    { id: 'time_05', name: '時の歯車', type: 'spell', lineage: 'time', role: 'fuel', rarity: 'common', cost: 0,
      text: '自分の時限カードすべてのカウント-1',
      effects: { onPlay: async function (ctx) { await hastenAll(ctx); } } },
    // 6
    { id: 'time_06', name: '時の前借り', type: 'spell', lineage: 'time', role: 'fuel', rarity: 'common', cost: 0,
      text: 'マナ+3。次の自分のターン、最大マナ-2',
      effects: {
        onPlay: async function (ctx) {
          await ctx.gainMana(3);
          ctx.me.flags.nextMaxManaDelta = (ctx.me.flags.nextMaxManaDelta || 0) - 2;
          ctx.log('次のターンの最大マナ-2');
        }
      } },
    // 7
    { id: 'time_07', name: '時限爆弾', type: 'spell', lineage: 'time', role: 'finisher', rarity: 'common', cost: 1, timed: 2,
      text: '時限2：相手に10ダメージを与える', tags: ['finisher'],
      effects: { onTimed: Fx.dmgOpp(10) } },
    // 8
    { id: 'time_08', name: '未来の手紙', type: 'spell', lineage: 'time', role: 'fuel', rarity: 'common', cost: 0, timed: 1,
      text: '時限1：カードを3枚引く',
      effects: { onTimed: Fx.draw(3) } },
    // 9
    { id: 'time_09', name: '一瞬の永遠', type: 'spell', lineage: 'time', role: 'finisher', rarity: 'common', cost: 2,
      text: 'このターン、自分のモンスターは攻撃したあと、もう一度攻撃できる',
      effects: { onPlay: Fx.statusThisTurn('attackTwice', true) } },
    // 10
    { id: 'time_10', name: '時間停止', type: 'spell', lineage: 'time', role: 'disrupt', rarity: 'common', cost: 3, reserve: true,
      text: '相手の次のターン、相手のモンスターは攻撃できない', tags: ['disrupt'],
      effects: {},
      reserveHooks: { grants: [{ key: 'cannotAttack', value: true }] } },
    // 11
    { id: 'time_11', name: '足止めの砂', type: 'spell', lineage: 'time', role: 'disrupt', rarity: 'common', cost: 2, reserve: true,
      text: '相手の次のターン、相手の時限カウントは減らず、相手が追加ターンを得る効果は無効になる', tags: ['disrupt'],
      effects: {},
      reserveHooks: { grants: [{ key: 'timedFrozen', value: true }, { key: 'noExtraTurn', value: true }] } },
    // 12
    { id: 'time_12', name: '刻む時の紋章', type: 'crest', lineage: 'time', role: 'engine', rarity: 'common', cost: 2,
      text: '自分のターン開始時、自分の時限カード1枚のカウントをさらに-1',
      effects: { onTurnStart: async function (ctx) { if (ctx.me.timed.length) await hastenOne(ctx); } } },
    // 13
    { id: 'time_13', name: '小さな巻き戻し', type: 'spell', lineage: 'time', role: 'fuel', rarity: 'common', cost: 1,
      text: 'このターンに破壊された自分のモンスター1体を、場に戻す',
      effects: {
        onPlay: async function (ctx) {
          const dead = ctx.me.destroyedThisTurn.filter(function (d) { return d.turn === ctx.game.turn && !d.exiled; }).map(function (d) { return d.uid; });
          const picked = await ctx.pick({ kind: 'graveCard', side: 'ally', count: 1,
            filter: function (c, inst) { return dead.indexOf(inst.uid) >= 0 && DB.get(inst.defId).type === 'monster'; },
            prompt: '場に戻すモンスターを選ぶ' });
          if (!picked[0]) { ctx.log('このターンに破壊されたモンスターは墓地にない'); return; }
          await ctx.reviveFromGrave(picked[0], ctx.me, { triggerSummon: false });
        }
      } },
    // 14
    { id: 'time_14', name: '時喰いの砂時計', type: 'spell', lineage: 'time', role: 'engine', rarity: 'rare', cost: 4,
      text: '追加ターンを得る。墓地に時喰いの砂時計が3枚以上あるなら、このカードを手札に戻す',
      flavor: '砂は落ちきらない。誰かが毎回ひっくり返している。', tags: ['hourglass', 'extraTurn', 'loopPart'],
      effects: {
        onPlay: async function (ctx) {
          await ctx.extraTurn(ctx.me);
          const n = ctx.countZone(ctx.me, 'grave', function (c) { return c.defId === 'time_14'; });
          if (n >= 3 && ctx.card.zone === 'limbo') { ctx.log('砂時計は手札に戻る'); await ctx.returnToHand(ctx.card); }
        }
      } },
    // 15
    { id: 'time_15', name: '刻を統べる竜', type: 'monster', lineage: 'time', role: 'finisher', rarity: 'rare', cost: 7, atk: 6, hp: 6, tags: ['dragon', 'finisher'],
      text: '6/6。召喚時、自分の時限カードをすべて、カウントに関係なく今すぐ発動する',
      effects: {
        onSummon: async function (ctx) {
          const list = ctx.me.timed.slice();
          if (!list.length) { ctx.log('時限カードがない'); return; }
          for (let i = 0; i < list.length && ctx.game.winner === null; i++) await ctx.fireTimed(list[i]);
        }
      } },
    // 16
    { id: 'time_16', name: '未来から来た英雄', type: 'monster', lineage: 'time', role: 'finisher', rarity: 'rare', cost: 0, atk: 4, hp: 4, keywords: ['rush'], timed: 3,
      text: '4/4。速攻。使うと時限3になり、カウントが0になったとき場に出る',
      effects: {} },
    // 17
    { id: 'time_17', name: '巻き戻しの鐘', type: 'crest', lineage: 'time', role: 'engine', rarity: 'rare', cost: 3,
      text: '1ターンに1回、自分のターン中に、戦闘をこのターン開始時の状態に戻してよい。ただし自分の手札は今のまま残る',
      flavor: '鳴らした者だけが、二度目を覚えている。',
      effects: {
        ability: {
          label: 'ターン開始時に戻す', oncePerTurn: true,
          canUse: function (ctx) { const s = ctx.game.turnSnapshotOf(ctx.me.idx, 0); return !!(s && s.turn === ctx.game.turn); },
          use: async function (ctx) {
            const g = ctx.game;
            const idx = ctx.me.idx;
            const snap = g.turnSnapshotOf(idx, 0);
            if (!snap) return;
            restoreKeeping(g, snap.state, idx, false);
            g.addLog('巻き戻しの鐘：ターン開始時に戻った（手札はそのまま）');
            const bell = g.players[idx].crests.find(function (c) { return c.defId === 'time_17'; });
            if (bell) bell.flags.abilityUsedTurn = g.turn;
          }
        }
      } },
    // 18
    { id: 'time_18', name: '永遠の午後', type: 'field', lineage: 'time', role: 'engine', rarity: 'rare', cost: 3,
      text: 'お互い、時限カードのカウントは1回に2ずつ減る。展開時：カードを1枚引く',
      effects: { scope: 'any', grants: [{ key: 'timedTickRate', value: 2, side: 'any' }], onPlace: Fx.draw(1) } },
    // 19
    { id: 'time_19', name: '時渡りの剣士', type: 'monster', lineage: 'time', role: 'finisher', rarity: 'rare', cost: 3, atk: 3, hp: 2, keywords: ['rush'],
      text: '3/2。速攻。追加ターン中は攻撃力+3',
      effects: {
        onSummon: async function (ctx) { if (inExtraTurn(ctx.game)) await swordsmanBuff(ctx, ctx.card); },
        onTurnStart: async function (ctx, ev) { if (ev.extra || inExtraTurn(ctx.game)) await swordsmanBuff(ctx, ctx.card); }
      } },
    // 20
    { id: 'time_20', name: '歴史改変', type: 'spell', lineage: 'time', role: 'disrupt', rarity: 'rare', cost: 3,
      text: '相手が前のターンに使ったカード1枚を選び、その効果をなかったことにする（受けたダメージは戻り、出たモンスターは消える）', tags: ['disrupt'],
      effects: { onPlay: async function (ctx) { await rewriteHistory(ctx); } } },
    // 21
    { id: 'time_21', name: '時の王冠', type: 'crest', lineage: 'time', role: 'engine', rarity: 'legend', cost: 5,
      text: '自分のターン終了時、このターンに使ったカードが5枚以上なら、追加ターンを得る（1ターンに1回）', tags: ['extraTurn'],
      effects: {
        onTurnEnd: async function (ctx) {
          if (ctx.card.flags.crownTurn === ctx.game.turn) return;
          if (ctx.me.playedThisTurn.length < 5) return;
          ctx.card.flags.crownTurn = ctx.game.turn;
          ctx.log('時の王冠が輝く');
          await ctx.extraTurn(ctx.me);
        }
      } },
    // 22
    { id: 'time_22', name: '時を巡る魔女', type: 'monster', lineage: 'time', role: 'engine', rarity: 'legend', cost: 4, atk: 2, hp: 3,
      text: '2/3。常在：自分の追加ターン開始時、墓地の魔法1枚を手札に戻す',
      flavor: '「また会ったわね」と言われた。初対面のはずだ。', tags: ['loopPart'],
      effects: { onExtraTurnStart: Fx.recoverFromGrave(Fx.isSpell, '手札に戻す魔法を選ぶ') } },
    // 23
    { id: 'time_23', name: '時の果て', type: 'spell', lineage: 'time', role: 'finisher', rarity: 'legend', cost: 5, timed: 3,
      text: '時限3：相手のライフを1にする', tags: ['finisher'],
      effects: {
        onTimed: async function (ctx) {
          const opp = ctx.opp;
          const edef = opp.enemyDefId ? G.EnemyDB.tryGet(opp.enemyDefId) : null;
          const isBoss = !!(edef && (edef.isBoss || edef.kind === 'boss'));
          if (isBoss) {
            const half = Math.max(1, Math.ceil(opp.life / 2));
            ctx.log(opp.name + 'は時の果てに抗った：ライフは半分になる');
            ctx.setLife(opp, half);
          } else {
            ctx.setLife(opp, Math.min(opp.life, 1));
          }
        }
      } },
    // 24
    { id: 'time_24', name: '時間逆行', type: 'spell', lineage: 'time', role: 'disrupt', rarity: 'legend', cost: 3,
      text: '戦闘を、2ターン前の自分のターン開始時の状態に戻す。ただし自分の手札と墓地は今のまま残る。使ったあと除外される', tags: ['disrupt'],
      effects: {
        onPlay: async function (ctx) {
          const g = ctx.game;
          const idx = ctx.me.idx;
          const inst = ctx.card;
          const snap = g.turnSnapshotOf(idx, 1) || g.turnSnapshotOf(idx, 0);
          if (!snap) { ctx.log('戻れる過去がない'); return; }
          restoreKeeping(g, snap.state, idx, true);
          // the card itself may exist in the restored past (deck/hand): remove that echo, then exile the real one
          const echo = g.findCard(inst.uid);
          if (echo && echo !== inst) { g.removeFromZone(echo); echo.zone = 'void'; }
          inst.zone = 'limbo';
          await g.makeCtx(idx, inst).exile(inst);
          g.addLog('時間逆行：' + g.players[idx].name + 'のターン' + snap.turn + 'の開始時に戻った（手札と墓地はそのまま）');
        }
      } },
    // 25
    { id: 'time_25', name: '止まった世界', type: 'crest', lineage: 'time', role: 'engine', rarity: 'taboo', cost: 8,
      text: '相手のターンが来なくなる。自分のターン開始時、自分のライフを5失う',
      flavor: '時計の針は止まった。心臓はまだ動いている。それが問題だ。',
      effects: {
        grants: [{ key: 'turnsSkipped', value: true, side: 'enemy' }],
        onTurnStart: Fx.loseLife(5)
      } }
  ]);
})(globalThis.G = globalThis.G || {});
