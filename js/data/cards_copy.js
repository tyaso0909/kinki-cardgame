(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // cards_copy.js — 複製系統（幻影）25枚  copy_01..copy_25
  // SPEC: docs/SPEC.md「複製系統カードリスト」。幻影 = ctx.createPhantom（上限30、召喚時効果なし。
  // 鏡界の女王 = statuses.phantomSummonEffects で例外）。
  // ---------------------------------------------------------------
  const Fx = G.Fx;
  const DB = G.CardDB;

  function isSpell(inst, def) { return (def || DB.get(inst.defId)).type === 'spell'; }

  // Cards that re-fire / copy other spells. They never copy each other (mirror-vs-mirror recursion):
  // 盗み見の鏡, 偽りの約束, 複写の大魔典, 盗まれた奇跡, 多重詠唱. Other files may add ids via G.Data.COPIER_IDS.
  const COPIER_IDS = ['copy_07', 'copy_10', 'copy_11', 'copy_22', 'copy_24'];
  function isCopier(defId) {
    if (COPIER_IDS.indexOf(defId) >= 0) return true;
    const d = DB.tryGet(defId);
    return !!(d && (d.effects.isCopier || d.tags.indexOf('copier') >= 0));
  }
  function copyable(defId) { return !isCopier(defId); }

  // Recursion guard: nested copy/replay deeper than this is refused.
  const COPY_DEPTH_MAX = 8;
  async function withCopyDepth(ctx, fn) {
    const g = ctx.game;
    g.copyDepth = g.copyDepth || 0;
    if (g.copyDepth >= COPY_DEPTH_MAX) { ctx.log('鏡が深すぎる：これ以上コピーできない'); return false; }
    g.copyDepth++;
    try { await fn(); } finally { g.copyDepth--; }
    return true;
  }

  // Re-resolve recorded targetDefs ([{defId}|'face']) of an earlier play against the current board.
  function targetsFromDefs(ctx, def, targetDefs) {
    if (!targetDefs || !targetDefs.length) return [];
    const cands = def.targets ? ctx.candidatesFor(def.targets) : ctx.monstersOf(ctx.me).concat(ctx.monstersOf(ctx.opp));
    const used = [];
    const out = [];
    targetDefs.forEach(function (t) {
      if (t === 'face' || t === 'opp' || t === 'me') { out.push(t); return; }
      const found = cands.find(function (c) { return c.defId === t.defId && used.indexOf(c) < 0; });
      if (found) { used.push(found); out.push(found.uid); }
    });
    return out;
  }

  // The last spell played by player p this turn (not a copy) — from the action log, with its targets.
  function lastSpellActionOf(game, pIdx, excludeDefId) {
    const acts = game.turnActions;
    for (let i = acts.length - 1; i >= 0; i--) {
      const a = acts[i];
      if (a.type !== 'play' || a.who !== pIdx || a.defId === excludeDefId) continue;
      if (DB.get(a.defId).type !== 'spell' || !copyable(a.defId)) continue;
      return a;
    }
    return null;
  }

  // Last spell the opponent used (copier cards skipped): previous turn's actions → lastSpellDefId → newest grave spell.
  function lastOppSpell(ctx) {
    const g = ctx.game;
    const acts = g.prevTurnActions || [];
    for (let i = acts.length - 1; i >= 0; i--) {
      const a = acts[i];
      if (a.type === 'play' && a.who === ctx.opp.idx && DB.get(a.defId).type === 'spell' && copyable(a.defId)) return { defId: a.defId, targetDefs: a.targetDefs };
    }
    if (ctx.opp.lastSpellDefId && copyable(ctx.opp.lastSpellDefId)) return { defId: ctx.opp.lastSpellDefId, targetDefs: null };
    for (let i = ctx.opp.grave.length - 1; i >= 0; i--) {
      const c = ctx.opp.grave[i];
      if (isSpell(c) && copyable(c.defId)) return { defId: c.defId, targetDefs: null };
    }
    return null;
  }

  // Cast a copy of a spell as ctx.me's own effect. Reserve spells become a reserve against ctx.opp.
  // Refuses copier cards and nesting deeper than COPY_DEPTH_MAX.
  async function castCopyAsMine(ctx, defId, targetDefs) {
    const def = DB.get(defId);
    if (!copyable(defId)) { ctx.log(def.name + 'は鏡に映らない'); return false; }
    return withCopyDepth(ctx, async function () {
      if (def.reserve) {
        const inst = ctx.game.createCardInst(defId, ctx.me.idx, { isCopy: true });
        ctx.log(ctx.me.name + 'は' + def.name + 'のコピーを予約した');
        await ctx.game.setReserve(inst, ctx.me.idx);
        return;
      }
      let targets = targetsFromDefs(ctx, def, targetDefs);
      if (def.targets && !targets.length) {
        // the original's targets are gone (or unknown): let the new caster choose
        const picked = await ctx.pick(Object.assign({}, def.targets, { who: ctx.me.idx, chooser: ctx.me.idx }));
        targets = picked.map(function (t) { return t.uid !== undefined ? t.uid : t; });
      }
      await ctx.cast(defId, ctx.me, { copy: true, targets: targets });
    });
  }

  DB.registerAll([
    // 1
    {
      id: 'copy_01', name: '鏡写しの小鬼', type: 'monster', lineage: 'copy', role: 'engine', rarity: 'common',
      cost: 1, atk: 1, hp: 1, text: '1/1。召喚時、自分の場のモンスター1体の幻影を1体出す',
      tags: ['phantomMaker'],
      effects: {
        onSummon: async function (ctx) {
          const picked = await ctx.pick({ kind: 'monster', side: 'ally', count: 1, prompt: '幻影を出すモンスターを選ぶ' });
          if (picked[0]) await ctx.createPhantom(picked[0], ctx.me, { count: 1 });
        }
      }
    },
    // 2
    {
      id: 'copy_02', name: '霧の双子', type: 'monster', lineage: 'copy', role: 'fuel', rarity: 'common',
      cost: 2, atk: 1, hp: 1, text: '1/1。召喚時、このカードの幻影を1体出す',
      flavor: 'どちらが先に生まれたかで、まだ揉めている。',
      tags: ['phantomMaker', 'loopPart'],
      effects: { onSummon: Fx.phantomOfSelf(1) }
    },
    // 3
    {
      id: 'copy_03', name: '影の群狼', type: 'monster', lineage: 'copy', role: 'finisher', rarity: 'common',
      cost: 3, atk: 2, hp: 2, text: '2/2。召喚時、自分の場のモンスター（幻影を含む）1体につき1ダメージを与える',
      tags: ['finisher'],
      effects: { onSummon: Fx.dmgOpp(Fx.myMonsterCount(1)) }
    },
    // 4
    {
      id: 'copy_04', name: '映し身の道化', type: 'monster', lineage: 'copy', role: 'engine', rarity: 'common',
      cost: 2, atk: 2, hp: 1, text: '2/1。破壊時、自分の場のモンスター1体の召喚時効果をもう一度発動する',
      effects: {
        onDeath: async function (ctx) {
          const picked = await ctx.pick({ kind: 'monster', side: 'ally', count: 1, filter: function (c2, c) { return typeof DB.get(c.defId).effects.onSummon === 'function'; }, prompt: '召喚時効果をもう一度発動するモンスターを選ぶ' });
          if (picked[0]) await ctx.replay(picked[0]);
        }
      }
    },
    // 5
    {
      id: 'copy_05', name: '写し身の儀', type: 'spell', lineage: 'copy', role: 'engine', rarity: 'common',
      cost: 1, text: 'このターン次に使う魔法は2回発動する',
      effects: { onPlay: Fx.seq(Fx.nextSpellTimes(2), function (ctx) { ctx.log('次の魔法は2回発動する'); }) }
    },
    // 6
    {
      id: 'copy_06', name: '幻灯の呪文', type: 'spell', lineage: 'copy', role: 'fuel', rarity: 'common',
      cost: 0, text: '自分の場のモンスター1体の幻影を1体出す',
      targets: { kind: 'monster', side: 'ally', count: 1, prompt: '幻影を出すモンスターを選ぶ' },
      tags: ['phantomMaker'],
      effects: { onPlay: Fx.phantomOfTarget(1) }
    },
    // 7
    {
      id: 'copy_07', name: '多重詠唱', type: 'spell', lineage: 'copy', role: 'engine', rarity: 'common',
      cost: 2, text: 'このターンに直前に使った魔法を、もう一度発動する',
      effects: {
        onPlay: async function (ctx) {
          const a = lastSpellActionOf(ctx.game, ctx.me.idx, 'copy_07');
          const defId = a ? a.defId : (ctx.me.lastSpellDefId && copyable(ctx.me.lastSpellDefId) ? ctx.me.lastSpellDefId : null);
          if (!defId) { ctx.log('このターンに使った魔法がない（コピー系の魔法は発動し直せない）'); return; }
          const def = DB.get(defId);
          if (def.reserve) { ctx.log(def.name + 'は予約魔法なので発動し直せない'); return; }
          await withCopyDepth(ctx, function () { return ctx.replay({ defId: defId }, { targets: targetsFromDefs(ctx, def, a ? a.targetDefs : null) }); });
        }
      }
    },
    // 8
    {
      id: 'copy_08', name: '鏡の破片', type: 'spell', lineage: 'copy', role: 'fuel', rarity: 'common',
      cost: 0, text: 'マナ+1。このターン次に出すモンスターの召喚時効果は2回発動する',
      effects: { onPlay: Fx.seq(Fx.gainMana(1), Fx.nextSummonTimes(2)) }
    },
    // 9
    {
      id: 'copy_09', name: '幻の盾', type: 'spell', lineage: 'copy', role: 'disrupt', rarity: 'common',
      cost: 1, text: '自分の場のモンスター1体の幻影を2体出す。その幻影は守護を持つ',
      targets: { kind: 'monster', side: 'ally', count: 1, prompt: '幻影を出すモンスターを選ぶ' },
      tags: ['phantomMaker'],
      effects: { onPlay: Fx.phantomOfTarget(2, { keywords: ['guard'] }) }
    },
    // 10
    {
      id: 'copy_10', name: '盗み見の鏡', type: 'spell', lineage: 'copy', role: 'disrupt', rarity: 'common',
      cost: 1, text: '相手が最後に使った魔法をコピーして、自分の効果として使う',
      tags: ['disrupt'],
      effects: {
        onPlay: async function (ctx) {
          const last = lastOppSpell(ctx);
          if (!last) { ctx.log('相手はまだ魔法を使っていない'); return; }
          ctx.log('鏡が' + DB.get(last.defId).name + 'を映した');
          await castCopyAsMine(ctx, last.defId, last.targetDefs);
        }
      }
    },
    // 11
    {
      id: 'copy_11', name: '偽りの約束', type: 'spell', lineage: 'copy', role: 'disrupt', rarity: 'common',
      cost: 2, reserve: true, text: '相手の次のターン、相手が最初に使う魔法は、こちらの効果として発動する',
      flavor: '約束は守られた。誰との約束かは、書いていなかった。',
      tags: ['disrupt'],
      effects: {},
      reserveHooks: {
        onActivate: function (ctx, ev) {
          ctx.setStatus(ev.who, 'firstSpellStolenBy', ctx.owner.idx, { untilEndOfTurnOf: ev.who });
        }
      }
    },
    // 12
    {
      id: 'copy_12', name: '万華鏡の紋章', type: 'crest', lineage: 'copy', role: 'engine', rarity: 'common',
      cost: 2, text: '自分のターン中、自分の幻影が出るたびマナ+1',
      tags: ['loopPart'],
      effects: { onPhantomCreated: Fx.when(function (ctx) { return ctx.isMyTurn(); }, Fx.gainMana(1)) }
    },
    // 13
    {
      id: 'copy_13', name: '消えない残像', type: 'crest', lineage: 'copy', role: 'engine', rarity: 'common',
      cost: 1, text: '自分の幻影は相手のターン終了時に消えない',
      effects: { grants: [{ key: 'phantomsPersist', value: true }] }
    },
    // 14
    {
      id: 'copy_14', name: '双面の魔導士', type: 'monster', lineage: 'copy', role: 'engine', rarity: 'rare',
      cost: 4, atk: 2, hp: 4, text: '2/4。常在：自分の魔法はすべて2回発動する',
      flavor: '片方が嘘をつくと、もう片方が謝る。',
      effects: { grants: [{ key: 'spellMultiplier', value: 2 }] }
    },
    // 15
    {
      id: 'copy_15', name: '千の顔の怪盗', type: 'monster', lineage: 'copy', role: 'disrupt', rarity: 'rare',
      cost: 3, atk: 2, hp: 2, text: '2/2。召喚時、相手の場のモンスター1体の幻影を自分の場に出す',
      tags: ['phantomMaker', 'disrupt'],
      effects: {
        onSummon: async function (ctx) {
          const picked = await ctx.pick({ kind: 'monster', side: 'enemy', count: 1, prompt: '幻影を作る相手のモンスターを選ぶ' });
          if (picked[0]) await ctx.createPhantom(picked[0], ctx.me, { count: 1 });
          else ctx.log('相手の場にモンスターがいない');
        }
      }
    },
    // 16
    {
      id: 'copy_16', name: '分裂する粘体', type: 'monster', lineage: 'copy', role: 'fuel', rarity: 'rare',
      cost: 2, atk: 1, hp: 1, text: '1/1。破壊時、このカードの幻影を2体出す（幻影も破壊時に分裂する）',
      flavor: '数えるのをやめたとき、はじめて静かになる。',
      tags: ['phantomMaker', 'loopPart'],
      effects: { phantomDeathEffects: true, onDeath: Fx.phantomOfSelf(2) }
    },
    // 17
    {
      id: 'copy_17', name: '鏡の湖', type: 'field', lineage: 'copy', role: 'engine', rarity: 'rare',
      cost: 3, text: 'お互い、魔法はすべて2回発動する。展開時：カードを1枚引く',
      effects: { grants: [{ key: 'spellMultiplier', value: 2, side: 'any' }], onPlace: Fx.draw(1) }
    },
    // 18
    {
      id: 'copy_18', name: '幻影増殖', type: 'spell', lineage: 'copy', role: 'fuel', rarity: 'rare',
      cost: 3, text: '自分の場の幻影の数を2倍にする',
      tags: ['phantomMaker'],
      effects: {
        onPlay: async function (ctx) {
          const list = ctx.me.phantoms.slice();
          if (!list.length) { ctx.log('幻影がいない'); return; }
          for (let i = 0; i < list.length; i++) {
            const made = await ctx.createPhantom(list[i], ctx.me, { count: 1 });
            if (!made.length) break;
          }
        }
      }
    },
    // 19
    {
      id: 'copy_19', name: '幻影の総攻撃', type: 'spell', lineage: 'copy', role: 'finisher', rarity: 'rare',
      cost: 2, text: '自分の場のモンスター（幻影を含む）1体につき3ダメージを与える',
      tags: ['finisher'],
      effects: { onPlay: Fx.dmgOpp(Fx.myMonsterCount(3)) }
    },
    // 20
    {
      id: 'copy_20', name: '無限回廊', type: 'crest', lineage: 'copy', role: 'engine', rarity: 'rare',
      cost: 3, text: '自分のモンスターの召喚時効果はすべて2回発動する',
      effects: { grants: [{ key: 'summonMultiplier', value: 2 }] }
    },
    // 21
    {
      id: 'copy_21', name: '鏡界の女王', type: 'monster', lineage: 'copy', role: 'engine', rarity: 'legend',
      cost: 5, atk: 3, hp: 5, text: '3/5。常在：自分の幻影も、出たときに召喚時効果を発動してよい',
      flavor: '鏡の国に王はいない。女王が映っているだけだ。',
      tags: ['loopPart'],
      effects: { grants: [{ key: 'phantomSummonEffects', value: true }] }
    },
    // 22
    {
      id: 'copy_22', name: '複写の大魔典', type: 'spell', lineage: 'copy', role: 'engine', rarity: 'legend',
      cost: 2, text: '自分の墓地の魔法1枚のコピーを手札に加える。その後、このカードのコピーを手札に加える',
      tags: ['loopPart'],
      effects: {
        onPlay: async function (ctx) {
          const picked = await ctx.pick({ kind: 'graveCard', side: 'ally', count: 1, filter: function (c2, c) { return isSpell(c) && copyable(c.defId); }, prompt: 'コピーする魔法を選ぶ' });
          if (picked[0]) await ctx.addToHand(picked[0].defId, ctx.me, { isCopy: true });
          else ctx.log('墓地にコピーできる魔法がない');
          await ctx.addToHand('copy_22', ctx.me, { isCopy: true });
        }
      }
    },
    // 23
    {
      id: 'copy_23', name: '万象を映す魔神', type: 'monster', lineage: 'copy', role: 'finisher', rarity: 'legend',
      cost: 8, atk: 0, hp: 0, keywords: ['rush'],
      text: '0/0。速攻。召喚時、攻撃力と体力が「自分の場のモンスター（幻影を含む）の数×3」になる',
      tags: ['finisher'],
      effects: {
        onSummon: function (ctx) {
          const n = ctx.monstersOf(ctx.me).length * 3;
          ctx.card.atk = n; ctx.card.hp = n; ctx.card.maxHp = n; ctx.card.damage = 0;
          ctx.log('魔神は' + n + '/' + n + 'になった');
          ctx.emit('buff', { uid: ctx.card.uid, atk: n, hp: n, set: true });
        }
      }
    },
    // 24
    {
      id: 'copy_24', name: '盗まれた奇跡', type: 'spell', lineage: 'copy', role: 'disrupt', rarity: 'legend',
      cost: 3, text: '相手の墓地の魔法をすべてコピーし、好きな順番でコストを払わずに使う',
      tags: ['disrupt'],
      effects: {
        onPlay: async function (ctx) {
          // copier spells (盗まれた奇跡, 盗み見の鏡, 多重詠唱…) are skipped to avoid mirror recursion
          let rest = ctx.opp.grave.filter(function (c) { return isSpell(c) && copyable(c.defId); });
          if (!rest.length) { ctx.log('相手の墓地にコピーできる魔法がない'); return; }
          const order = [];
          while (rest.length) {
            let c = rest[0];
            if (rest.length > 1) {
              const picked = await ctx.pick({ kind: 'graveCard', side: 'enemy', count: 1, filter: function (c2, x) { return rest.indexOf(x) >= 0; }, prompt: '次に使う魔法を選ぶ' });
              if (picked[0]) c = picked[0];
            }
            order.push(c.defId);
            rest = rest.filter(function (x) { return x !== c; });
          }
          for (let i = 0; i < order.length && ctx.game.winner === null; i++) await castCopyAsMine(ctx, order[i], null);
        }
      }
    },
    // 25
    {
      id: 'copy_25', name: '鏡合わせの世界', type: 'crest', lineage: 'copy', role: 'engine', rarity: 'taboo',
      cost: 6, text: '自分のカードの効果は、種類を問わずすべて2回発動する',
      flavor: '向こう側の自分も、同じ紋章を置いた。',
      effects: { grants: [{ key: 'allEffectsMultiplier', value: 2 }] }
    }
  ]);

  G.Data = G.Data || {};
  G.Data.castCopyAsMine = castCopyAsMine;
  G.Data.COPIER_IDS = COPIER_IDS;          // other files may push ids (e.g. 嵐の写し身) or set effects.isCopier / tag 'copier'
  G.Data.isCopier = isCopier;
  G.Data.withCopyDepth = withCopyDepth;
  G.Data.COPY_DEPTH_MAX = COPY_DEPTH_MAX;
})(globalThis.G = globalThis.G || {});
