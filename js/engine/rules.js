(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // rules.js — statuses, passive-hook sources & dispatch, costs,
  // legality (getPlayable / getAttackers), win checks, hand limit.
  // ---------------------------------------------------------------
  const Game = G.Engine.Game;
  const util = G.util;

  // How several sources of the same status key combine.
  // multiply: product; min/max; sum; or: boolean OR; last: explicit status wins, else last grant.
  const STATUS_MODE = {
    spellMultiplier: 'multiply', summonMultiplier: 'multiply', allEffectsMultiplier: 'multiply',
    chainMultiplier: 'multiply', timedTickRate: 'multiply',
    cardsPerTurnLimit: 'min', sameNamePerTurnLimit: 'min',
    maxBoard: 'max', drawPerTurn: 'last', phantomAtkBonus: 'sum', phantomHpBonus: 'sum',
    sealWildBonus: 'sum', damageTakenDelta: 'sum', maxManaGainDelta: 'sum', costDelta: 'sum',
    spellCostDelta: 'sum', chainAtTurnStart: 'sum', initialHandDelta: 'sum', reserveLasts: 'max',
    extraCostAfterN: 'last', curseRedirectToMonsterUid: 'last', firstSpellStolenBy: 'last',
    handLimitDelta: 'sum', monsterAtkDelta: 'sum', atkPerHandCard: 'sum', curseShrink: 'sum'
  };
  const STATUS_DEFAULT = {
    spellMultiplier: 1, summonMultiplier: 1, allEffectsMultiplier: 1, chainMultiplier: 1, timedTickRate: 1,
    cardsPerTurnLimit: Infinity, sameNamePerTurnLimit: Infinity, maxBoard: Game.BOARD_CAP, drawPerTurn: 1,
    phantomAtkBonus: 0, phantomHpBonus: 0, sealWildBonus: 0, damageTakenDelta: 0, maxManaGainDelta: 0, costDelta: 0,
    spellCostDelta: 0, chainAtTurnStart: 0, initialHandDelta: 0,
    handLimitDelta: 0, monsterAtkDelta: 0, atkPerHandCard: 0, curseShrink: 0
  };

  function combine(mode, a, b) {
    switch (mode) {
      case 'multiply': return a * b;
      case 'min': return Math.min(a, b);
      case 'max': return Math.max(a, b);
      case 'sum': return a + b;
      case 'or': return !!(a || b);
      default: return b;
    }
  }

  // ---- statuses ------------------------------------------------------
  // Explicit statuses: player.statuses[key] = {value, until, sourceUid}
  // until: null | {player: pIdx, turnsLeft: n}  (expires at the end of that player's turn)
  Game.prototype.setStatus = function (who, key, value, opts) {
    opts = opts || {};
    const p = this.player(who);
    // untilEndOfTurnOf: pIdx | 'self' (the status holder) | 'opponentNext' (the acting player's opponent)
    // | 'thisTurn' (the currently active player). Expires at the END of that player's turn (turns: n → nth such end).
    let until = null;
    if (opts.untilEndOfTurnOf !== undefined && opts.untilEndOfTurnOf !== null) {
      let target = opts.untilEndOfTurnOf;
      if (target === 'self') target = p.idx;
      else if (target === 'opponentNext') target = 1 - this.active;
      else if (target === 'thisTurn') target = this.active;
      until = { player: target, turnsLeft: opts.turns || 1 };
    } else if (opts.until) until = opts.until;
    p.statuses[key] = { value: value, until: until, sourceUid: opts.sourceUid || null };
    this.emit('statusChange', { who: p.idx, key: key, value: value });
    return p.statuses[key];
  };

  Game.prototype.clearStatus = function (who, key) {
    const p = this.player(who);
    if (p.statuses[key]) { delete p.statuses[key]; this.emit('statusChange', { who: p.idx, key: key, value: undefined }); }
  };

  Game.prototype.explicitStatus = function (who, key) {
    const s = this.player(who).statuses[key];
    return s ? s.value : undefined;
  };

  // Effective status: explicit value combined with grants from active permanents/relics/reserves.
  Game.prototype.status = function (who, key) {
    const p = this.player(who);
    const mode = STATUS_MODE[key] || 'or';
    let acc = STATUS_DEFAULT[key];
    if (acc === undefined && mode === 'or') acc = false;
    const values = [];
    const sources = this.hookSources();
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const grants = src.hooks.grants;
      if (!grants) continue;
      for (let j = 0; j < grants.length; j++) {
        const gr = grants[j];
        if (gr.key !== key) continue;
        const side = gr.side || 'ally';
        // for reserves, "ally" means the reserve's target (the player it affects)
        const ownerIdx = src.affects !== undefined ? src.affects : src.owner;
        const applies = side === 'any' || (side === 'ally' && ownerIdx === p.idx) || (side === 'enemy' && ownerIdx !== p.idx);
        if (!applies) continue;
        if (src.kind === 'reserve' && this.active !== src.affects) continue;
        if (gr.when && !gr.when(this.makeCtx(src.owner, src.inst, { relic: src.relic, reserve: src.reserve }), p)) continue;
        values.push(gr.value);
      }
    }
    const ex = p.statuses[key];
    if (ex) values.push(ex.value); // explicit status last so 'last' mode prefers it
    for (let i = 0; i < values.length; i++) acc = (acc === undefined) ? values[i] : combine(mode, acc, values[i]);
    return acc;
  };

  // Expire statuses/buffs bound to the end of player pIdx's turn.
  Game.prototype.expireStatuses = function (pIdx) {
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      for (const key in p.statuses) {
        const st = p.statuses[key];
        if (st.until && st.until.player === pIdx) {
          st.until.turnsLeft -= 1;
          if (st.until.turnsLeft <= 0) { delete p.statuses[key]; this.emit('statusChange', { who: i, key: key, value: undefined }); }
        }
      }
    }
  };

  // ---- hook sources ----------------------------------------------------
  // Returns [{kind:'card'|'relic'|'reserve', inst, hooks, owner, scope, affects}]
  // Order: field, crests (p0,p1), board monsters, reserves (active only), relics.
  Game.prototype.hookSources = function () {
    const out = [];
    const self = this;
    function addInst(inst) {
      const def = G.CardDB.get(inst.defId);
      const fx = def.effects || {};
      out.push({ kind: 'card', inst: inst, def: def, hooks: fx, owner: inst.owner, scope: fx.scope || 'self' });
    }
    if (this.field) addInst(this.field);
    for (let i = 0; i < 2; i++) this.players[i].crests.forEach(addInst);
    for (let i = 0; i < 2; i++) {
      this.players[i].board.forEach(addInst);
      this.players[i].phantoms.forEach(addInst);
    }
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      for (let r = 0; r < p.reserves.length; r++) {
        const res = p.reserves[r];
        if (this.active !== res.target || this.phase === 'setup') continue;
        const def = G.CardDB.get(res.defId);
        const hooks = def.reserveHooks || {};
        out.push({ kind: 'reserve', inst: res.card, def: def,
          hooks: hooks, owner: res.owner, scope: hooks.scope || 'target', affects: res.target, reserve: res });
      }
    }
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      for (let r = 0; r < p.relics.length; r++) {
        const rdef = G.RelicDB.tryGet(p.relics[r]);
        if (!rdef) continue;
        out.push({ kind: 'relic', inst: null, def: rdef, hooks: rdef.effects || {}, owner: i, scope: (rdef.effects && rdef.effects.scope) || 'self', relic: rdef });
      }
    }
    return out;
  };

  function scopeMatches(src, who) {
    if (who === undefined || who === null) return true;
    if (src.scope === 'any') return true;
    if (src.kind === 'reserve') {
      if (src.scope === 'target') return who === src.affects;
      if (src.scope === 'self') return who === src.owner;
      return true;
    }
    return who === src.owner;
  }

  // Fire a passive trigger hook on every active source. ev.who = event owner.
  // Hooks may be async; dispatch awaits them sequentially. Returns Promise.
  Game.prototype.trigger = async function (hookName, ev) {
    if (this.winner !== null && hookName !== 'onTurnEnd') return;
    ev = ev || {};
    const sources = this.hookSources();
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const fn = src.hooks[hookName];
      if (typeof fn !== 'function') continue;
      if (!scopeMatches(src, ev.who)) continue;
      // source must still be in place (earlier hooks may have removed it)
      if (src.inst && src.kind === 'card' && !this.isInPlay(src.inst)) continue;
      if (src.kind === 'card' && src.inst.zone !== 'field' && src.inst.zone !== 'crests' && src.inst.zone !== 'board' && src.inst.zone !== 'phantoms') continue;
      const times = src.kind === 'card' ? this.effectTimes(src.owner, 'passive') : 1;
      // scope 'any' (shared fields like 竜脈の火山): ctx.me is the player the event belongs to.
      // Reserve hooks: ctx.me is the reserve's target (the player being affected) unless scope 'self'.
      let actAs;
      if (src.scope === 'any' && ev.who !== undefined && ev.who !== null) actAs = ev.who;
      else if (src.kind === 'reserve' && src.scope !== 'self') actAs = src.affects;
      for (let t = 0; t < times; t++) {
        const ctx = this.makeCtx(src.owner, src.inst, { relic: src.relic, reserve: src.reserve, source: src, actAs: actAs });
        ctx.owner = this.players[src.owner];
        await fn(ctx, ev);
        if (this.winner !== null) return;
      }
    }
  };

  // Pure modifier chain: returns the modified value. ev.who is the affected player.
  Game.prototype.modify = function (hookName, ev, field) {
    const sources = this.hookSources();
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      const fn = src.hooks[hookName];
      if (typeof fn !== 'function') continue;
      if (!scopeMatches(src, ev.who)) continue;
      let actAs;
      if (src.scope === 'any' && ev.who !== undefined && ev.who !== null) actAs = ev.who;
      else if (src.kind === 'reserve' && src.scope !== 'self') actAs = src.affects;
      const ctx = this.makeCtx(src.owner, src.inst, { relic: src.relic, reserve: src.reserve, source: src, actAs: actAs });
      ctx.owner = this.players[src.owner];
      const v = fn(ctx, ev);
      if (v !== undefined && v !== null) ev[field] = v;
    }
    return ev[field];
  };

  Game.prototype.isInPlay = function (inst) {
    if (!inst) return false;
    if (inst.zone === 'field') return this.field === inst;
    if (inst.zone === 'board' || inst.zone === 'phantoms' || inst.zone === 'crests') {
      return this.players[inst.owner][inst.zone].indexOf(inst) >= 0;
    }
    return false;
  };

  // How many times an effect of `kind` ('spell'|'summon'|'passive'|'place'|'timed'|'death') fires for player who.
  Game.prototype.effectTimes = function (who, kind) {
    const all = this.status(who, 'allEffectsMultiplier') || 1;
    let n = 1;
    if (kind === 'spell') n = this.status(who, 'spellMultiplier') || 1;
    else if (kind === 'summon') n = this.status(who, 'summonMultiplier') || 1;
    return Math.max(1, Math.round(n * all));
  };

  // ---- costs -------------------------------------------------------------
  Game.prototype.baseCost = function (inst, from, choices) {
    const def = G.CardDB.get(inst.defId);
    if (from === 'grave' && def.reprise !== null && def.reprise !== undefined && !this.status(inst.owner, 'gravePlayable')) {
      return def.reprise === 'X' ? ((choices && choices.x) || 0) : def.reprise;
    }
    if (def.cost === 'X') return (choices && typeof choices.x === 'number') ? choices.x : 0;
    return def.cost;
  };

  // Full cost after every modifier (self costMod, crests/fields/reserves/relics modCost, statuses).
  Game.prototype.costOf = function (pIdx, inst, opts) {
    opts = opts || {};
    const p = this.player(pIdx);
    const def = G.CardDB.get(inst.defId);
    const from = opts.from || inst.zone;
    let cost = this.baseCost(inst, from, opts.choices);
    if (this.status(p.idx, 'allCostsZero')) return 0;
    if (typeof def.effects.costMod === 'function') {
      cost += def.effects.costMod(this.makeCtx(p.idx, inst)) || 0;
    }
    cost += inst.costMod || 0;
    cost += this.status(p.idx, 'costDelta') || 0;
    if (def.type === 'spell') cost += this.status(p.idx, 'spellCostDelta') || 0;
    if (def.type === 'spell' && p.nextSpellCostDelta) cost += p.nextSpellCostDelta;
    const extra = this.status(p.idx, 'extraCostAfterN');
    if (extra && p.playedThisTurn.length >= extra.after) cost += extra.delta;
    cost = this.modify('modCost', { card: inst, who: p.idx, cost: cost, from: from }, 'cost');
    return Math.max(0, cost);
  };

  // ---- legality -----------------------------------------------------------
  Game.prototype.canPlayCard = function (pIdx, inst, choices) {
    const p = this.player(pIdx);
    if (this.winner !== null) return { ok: false, reason: 'gameOver' };
    if (this.active !== p.idx || this.phase !== 'main') return { ok: false, reason: 'notYourTurn' };
    const def = G.CardDB.get(inst.defId);
    const from = inst.zone;
    if (from !== 'hand' && from !== 'grave') return { ok: false, reason: 'notInHandOrGrave' };
    if (inst.owner !== p.idx) return { ok: false, reason: 'notOwner' };
    if (from === 'grave') {
      const gravePlayable = this.status(p.idx, 'gravePlayable');
      if (def.reprise === null && !gravePlayable) return { ok: false, reason: 'noReprise' };
      if (this.status(p.idx, 'noGravePlay')) return { ok: false, reason: 'noGravePlay' };
    }
    const limit = this.status(p.idx, 'cardsPerTurnLimit');
    if (p.playedThisTurn.length >= limit) return { ok: false, reason: 'cardsPerTurnLimit' };
    const same = this.status(p.idx, 'sameNamePerTurnLimit');
    if (same !== Infinity) {
      let n = 0;
      for (let i = 0; i < p.playedThisTurn.length; i++) if (p.playedThisTurn[i] === def.id) n++;
      if (n >= same) return { ok: false, reason: 'sameNamePerTurnLimit' };
    }
    if (def.type === 'monster' && (def.timed === null || def.timed === undefined)) {
      if (p.board.length >= this.status(p.idx, 'maxBoard')) return { ok: false, reason: 'boardFull' };
    }
    if (def.type === 'crest') {
      for (let i = 0; i < p.crests.length; i++) {
        if (G.CardDB.get(p.crests[i].defId).name === def.name) return { ok: false, reason: 'duplicateCrest' };
      }
    }
    if (typeof def.effects.canPlay === 'function') {
      const ctx = this.makeCtx(p.idx, inst, { choices: choices });
      if (!def.effects.canPlay(ctx)) return { ok: false, reason: 'canPlay' };
    }
    const cost = this.costOf(p.idx, inst, { from: from, choices: choices });
    if (def.cost === 'X' && (!choices || typeof choices.x !== 'number')) {
      // X not chosen yet: playable iff any X (0) affordable
      if (cost > p.mana) return { ok: false, reason: 'mana', cost: cost };
      return { ok: true, cost: cost, needsX: true };
    }
    if (cost > p.mana) return { ok: false, reason: 'mana', cost: cost };
    return { ok: true, cost: cost };
  };

  Game.prototype.getPlayable = function (pIdx) {
    const p = this.player(pIdx);
    const out = [];
    const self = this;
    function consider(inst, from) {
      const r = self.canPlayCard(p.idx, inst);
      if (!r.ok) return;
      const def = G.CardDB.get(inst.defId);
      out.push({ uid: inst.uid, defId: inst.defId, cost: r.cost, from: from, needsTarget: !!def.targets, needsX: !!r.needsX, targets: def.targets || null });
    }
    p.hand.forEach(function (c) { consider(c, 'hand'); });
    p.grave.forEach(function (c) { consider(c, 'grave'); });
    return out;
  };

  // Stat changes that aren't buffs on the card itself (2026-11 additions):
  //   def.effects.dynamicStats(game, inst) → {atk, hp}   (マナの巨人: X = max mana)
  //   statuses monsterAtkDelta (重力の谷), atkPerHandCard (知識は力), curseShrink (呪詛の重み: -1/-1 per 5 curse)
  Game.prototype.statAura = function (inst) {
    let a = 0, h = 0;
    const def = G.CardDB.tryGet(inst.defId);
    if (def && def.effects && typeof def.effects.dynamicStats === 'function') {
      const s = def.effects.dynamicStats(this, inst) || {};
      a += s.atk || 0; h += s.hp || 0;
    }
    if ((inst.zone === 'board' || inst.zone === 'phantoms') && inst.owner !== undefined && this.players[inst.owner]) {
      const o = inst.owner;
      a += this.status(o, 'monsterAtkDelta') || 0;
      const per = this.status(o, 'atkPerHandCard') || 0;
      if (per) a += per * this.players[o].hand.length;
      const shrink = this.status(o, 'curseShrink') || 0;
      if (shrink) { const n = Math.floor((this.players[o].curse || 0) / 5) * shrink; a -= n; h -= n; }
    }
    return { atk: a, hp: h };
  };
  Game.prototype.atkOf = function (inst) {
    let a = inst.atk;
    for (let i = 0; i < inst.buffs.length; i++) a += inst.buffs[i].atk || 0;
    if (inst.isPhantom) a += this.status(inst.owner, 'phantomAtkBonus') || 0;
    a += this.statAura(inst).atk;
    return Math.max(0, a);
  };
  Game.prototype.maxHpOf = function (inst) {
    let h = inst.maxHp;
    for (let i = 0; i < inst.buffs.length; i++) h += inst.buffs[i].hp || 0;
    if (inst.isPhantom) h += this.status(inst.owner, 'phantomHpBonus') || 0;
    h += this.statAura(inst).hp;
    return h;
  };
  Game.prototype.hpOf = function (inst) { return this.maxHpOf(inst) - inst.damage; };
  Game.prototype.hasKeyword = function (inst, kw) { return inst.keywords.indexOf(kw) >= 0; };
  // 連撃 (double): 2 attacks per turn
  Game.prototype.attacksPerTurn = function (inst) { return inst.keywords.indexOf('double') >= 0 ? 2 : 1; };
  // 加護 (ward): can't be chosen by the opponent's effects. `actorIdx` = whose effect is choosing.
  Game.prototype.isWardedFrom = function (inst, actorIdx) {
    return !!(inst && inst.keywords && inst.owner !== undefined && actorIdx !== undefined && actorIdx !== null &&
      inst.owner !== actorIdx && inst.keywords.indexOf('ward') >= 0 &&
      (inst.zone === 'board' || inst.zone === 'phantoms'));
  };

  Game.prototype.monstersOf = function (who) {
    const p = this.player(who);
    return p.board.concat(p.phantoms);
  };

  Game.prototype.canAttackWith = function (pIdx, inst) {
    if (this.winner !== null || this.active !== pIdx || this.phase !== 'main') return false;
    if (inst.owner !== pIdx || (inst.zone !== 'board' && inst.zone !== 'phantoms')) return false;
    if (inst.attacksLeft <= 0) return false;
    if (this.status(pIdx, 'cannotAttack')) return false;
    if (inst.summonedTurn === this.turn && !this.hasKeyword(inst, 'rush')) return false;
    if (inst.flags && inst.flags.cannotAttack) return false;
    return true;
  };

  Game.prototype.attackTargetsFor = function (pIdx) {
    const opp = this.players[1 - pIdx];
    // 不可侵 (untouchable): can't be attacked at all (and so never counts as a guard)
    const monsters = this.monstersOf(opp.idx).filter(function (m) { return m.keywords.indexOf('untouchable') < 0; });
    const guards = monsters.filter(function (m) { return m.keywords.indexOf('guard') >= 0; });
    if (guards.length) return guards.map(function (m) { return m.uid; });
    return monsters.map(function (m) { return m.uid; }).concat(['face']);
  };

  Game.prototype.getAttackers = function (pIdx) {
    const self = this;
    const targets = this.attackTargetsFor(pIdx);
    return this.monstersOf(pIdx).filter(function (m) { return self.canAttackWith(pIdx, m); })
      .map(function (m) { return { uid: m.uid, defId: m.defId, atk: self.atkOf(m), targets: targets.slice() }; });
  };

  // ---- win checks -----------------------------------------------------------
  Game.prototype.distinctKeys = function (who) {
    const p = this.player(who);
    const set = {};
    let wild = 0;
    for (let i = 0; i < p.seals.length; i++) {
      const k = G.CardDB.get(p.seals[i].defId).key;
      if (k === 'wild') wild++;
      else if (k) set[k] = true;
    }
    wild += this.status(p.idx, 'sealWildBonus') || 0;
    const distinct = Object.keys(set).length;
    return Math.min(5, distinct + wild);
  };

  Game.prototype.setWinner = function (idx, reason) {
    if (this.winner !== null) return false;
    this.winner = idx;
    this.winReason = reason;
    this.phase = 'over';
    this.addLog((idx === null ? '引き分け' : this.players[idx].name + 'の勝利') + '（' + reason + '）');
    this.emit('win', { winner: idx, reason: reason });
    return true;
  };

  // Called after every action. Returns true if the game ended.
  Game.prototype.checkWin = function () {
    if (this.winner !== null) return true;
    const dead = [];
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      if (p.life <= 0) {
        // 王冠の破片-style relics: onLethal hooks may revive
        this.fireLethalHooks(i);
        if (p.life <= 0) dead.push({ idx: i, reason: 'life' });
      }
      if (p.deckedOut) dead.push({ idx: i, reason: 'deckout' });
      if (p.curse >= p.curseLimit) dead.push({ idx: i, reason: 'curse' });
    }
    if (dead.length === 2) {
      // both lose simultaneously: the non-active player wins (active player caused it)
      return this.setWinner(1 - this.active, dead[1 - this.active].reason);
    }
    if (dead.length === 1) return this.setWinner(1 - dead[0].idx, dead[0].reason);
    for (let i = 0; i < 2; i++) {
      if (this.distinctKeys(i) >= 5 && !this.status(i, 'noSpecialWin')) return this.setWinner(i, 'seals');
    }
    return false;
  };

  // Synchronous lethal hooks on relics: effects.onLethal(ctx) — may set life > 0.
  Game.prototype.fireLethalHooks = function (pIdx) {
    const sources = this.hookSources();
    for (let i = 0; i < sources.length; i++) {
      const src = sources[i];
      if (typeof src.hooks.onLethal !== 'function' || src.owner !== pIdx) continue;
      src.hooks.onLethal(this.makeCtx(pIdx, src.inst, { relic: src.relic }));
      if (this.players[pIdx].life > 0) return;
    }
  };

  // Special win requested by a card (prophecy, 最後の展示…). Honors noSpecialWin.
  Game.prototype.specialWin = function (who, reason) {
    const p = this.player(who);
    if (this.status(p.idx, 'noSpecialWin')) { this.addLog(p.name + 'は特殊勝利できない'); return false; }
    return this.setWinner(p.idx, reason || 'special');
  };

  // ---- hand limit -------------------------------------------------------------
  Game.prototype.enforceHandLimit = async function (pIdx) {
    const p = this.player(pIdx);
    const limit = (this.status(pIdx, 'handLimit') || Game.HAND_LIMIT) + (this.status(pIdx, 'handLimitDelta') || 0);
    if (p.hand.length <= limit) return;
    const ctx = this.makeCtx(pIdx, null);
    const keep = await ctx.pick({ kind: 'handCard', side: 'ally', count: limit, prompt: '手札に残すカードを' + limit + '枚選ぶ' });
    const keepSet = new Set(keep.map(function (c) { return c.uid; }));
    const toDiscard = p.hand.filter(function (c) { return !keepSet.has(c.uid); });
    // if chooser returned fewer than `limit`, discard from the end until we hit the limit
    while (p.hand.length - toDiscard.length > limit) {
      const extra = p.hand.filter(function (c) { return toDiscard.indexOf(c) < 0; });
      toDiscard.push(extra[extra.length - 1]);
    }
    this.addLog(p.name + 'は手札上限のため' + toDiscard.length + '枚捨てた');
    await ctx.discard(toDiscard, p);
  };

  G.Engine.STATUS_MODE = STATUS_MODE;
  G.Engine.STATUS_DEFAULT = STATUS_DEFAULT;
})(globalThis.G = globalThis.G || {});
