(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // play.js — playing cards (hand/grave), cast/replay, attacks,
  // activated abilities, chain bookkeeping, action recording.
  // ---------------------------------------------------------------
  const Game = G.Engine.Game;

  // Effective chain for a player (万雷の巫女 ×2, 避雷針 ½ …).
  Game.prototype.chainOf = function (who) {
    const p = this.player(who);
    let chain = p.chain * (this.status(p.idx, 'chainMultiplier') || 1);
    chain = this.modify('modChain', { who: p.idx, chain: chain }, 'chain');
    return Math.floor(chain);
  };

  Game.prototype.onChainIncreased = async function (p, before) {
    const now = this.chainOf(p);
    if (now > p.stats.maxChain) p.stats.maxChain = now;
    if (now > this.stats.maxChain) this.stats.maxChain = now;
    this.emit('chain', { who: p.idx, chain: p.chain, effective: now });
    if (now > before) await this.trigger('onChainReached', { who: p.idx, chain: now, previous: before });
  };

  // ---- resolution of a played card by type ------------------------------------
  // Resolves a card's effect as if just played. `inst` may be a real card or a copy.
  // opts: {isCopy, free, choices, targets, actAs}
  Game.prototype.resolveCard = async function (inst, pIdx, opts) {
    opts = opts || {};
    const p = this.players[pIdx];
    const def = G.CardDB.get(inst.defId);
    const self = this;
    const targets = this.resolveTargets(opts.targets, def).filter(function (t) { return !self.isWardedFrom(t, pIdx); });
    const ctxOpts = { invertible: true, choices: opts.choices || {}, targets: targets, isCopy: !!opts.isCopy };
    switch (def.type) {
      case 'spell': {
        if (def.reserve && !opts.isCopy) {
          await this.setReserve(inst, pIdx);
          return;
        }
        if (def.timed !== null && def.timed !== undefined && !opts.isCopy) {
          const ctx = this.makeCtx(pIdx, inst);
          let n = def.timed;
          if (p.flags.firstTimedDelta !== undefined && !p.flags.firstTimedUsed) { n = Math.max(0, n + p.flags.firstTimedDelta); p.flags.firstTimedUsed = true; }
          await ctx.addTimed(inst, p, n);
          return;
        }
        const stolenBy = this.explicitStatus(pIdx, 'firstSpellStolenBy');
        let actAs = pIdx;
        if (stolenBy !== undefined && stolenBy !== null && !opts.isCopy) {
          this.clearStatus(pIdx, 'firstSpellStolenBy');
          actAs = stolenBy;
          this.addLog(def.name + 'の効果は' + this.players[stolenBy].name + 'のものになった');
        }
        if (this.explicitStatus(pIdx, 'firstSpellNegated') && !opts.isCopy) {
          this.clearStatus(pIdx, 'firstSpellNegated');
          this.addLog(def.name + 'の効果は打ち消された');
        } else if (typeof def.effects.onPlay === 'function') {
          let times = this.effectTimes(pIdx, 'spell') * (p.nextSpellTimes || 1);
          if (opts.times) times = opts.times;
          p.nextSpellTimes = 1;
          for (let t = 0; t < times && this.winner === null; t++) {
            await def.effects.onPlay(this.makeCtx(pIdx, inst, Object.assign({}, ctxOpts, { actAs: actAs !== pIdx ? actAs : undefined })));
          }
        }
        if (!opts.isCopy) {
          p.lastSpellDefId = def.id; p.lastSpellUid = inst.uid;
          p.spellsPlayedThisTurn.push(def.id);
        }
        if (inst.zone === 'limbo') {
          const ctx = this.makeCtx(pIdx, inst);
          if (opts.isCopy || inst.isCopy) inst.zone = 'void';
          else if (inst.flags.reprised || opts.exileAfter) await ctx.exile(inst);
          else if (this.status(pIdx, 'spellsReturnToHand') || def.effects.returnsToHand) await ctx.returnToHand(inst);
          else if (def.effects.returnsToDeckTop) await ctx.bounceToDeckTop(inst);
          else await ctx.toGrave(inst, { reason: 'resolved' });
        }
        return;
      }
      case 'monster': {
        const ctx = this.makeCtx(pIdx, inst);
        if (def.timed !== null && def.timed !== undefined && !opts.isCopy) { await ctx.addTimed(inst, p, def.timed); return; }
        const res = await ctx.summon(inst, p, { choices: opts.choices, targets: targets, isCopy: opts.isCopy });
        if (!res) await ctx.toGrave(inst, { reason: 'noRoom' });
        return;
      }
      case 'crest': {
        const ctx = this.makeCtx(pIdx, inst);
        if (def.timed !== null && def.timed !== undefined) inst.timedCount = def.timed; // timed crest ticks in the crest zone
        const ok = await ctx.placeCrest(inst, p, { choices: opts.choices, targets: targets });
        if (!ok) await ctx.toGrave(inst, { reason: 'crestRefused' });
        return;
      }
      case 'field': {
        const ctx = this.makeCtx(pIdx, inst);
        await ctx.setField(inst, p, { choices: opts.choices, targets: targets });
        return;
      }
    }
  };

  Game.prototype.resolveTargets = function (targetUids, def) {
    if (!targetUids || !targetUids.length) return [];
    const self = this;
    return targetUids.map(function (t) {
      if (t === 'face' || t === 'opp' || t === 'me') return t;
      if (typeof t === 'number') { return self.findCard(t) || t; }
      if (typeof t === 'object' && t.player !== undefined) return self.players[t.player];
      return t;
    }).filter(function (t) { return t !== null && t !== undefined; });
  };

  // ---- playCard (the public action) ---------------------------------------------
  Game.prototype.playCard = async function (pIdx, cardUid, opts) {
    opts = opts || {};
    const choices = opts.choices || {};
    const p = this.players[pIdx];
    const inst = this.findCard(cardUid);
    if (!inst) throw new Error('playCard: card not found ' + cardUid);
    const legal = this.canPlayCard(pIdx, inst, choices);
    if (!legal.ok) {
      this.emit('illegal', { action: 'play', uid: cardUid, reason: legal.reason });
      return { ok: false, reason: legal.reason };
    }
    const def = G.CardDB.get(inst.defId);
    const from = inst.zone;
    const cost = legal.cost;
    if (def.cost === 'X' && typeof choices.x !== 'number') choices.x = p.mana; // default X = all mana
    const finalCost = this.costOf(pIdx, inst, { from: from, choices: choices });
    if (finalCost > p.mana) return { ok: false, reason: 'mana' };
    const self = this;
    const targetDefs = (choices.targets || []).map(function (t) {
      if (t === 'face' || t === 'opp' || t === 'me') return t;
      const c = self.findCard(t); return c ? { defId: c.defId } : null;
    }).filter(function (t) { return t !== null; });
    const recChoices = Object.assign({}, choices); delete recChoices.targets;
    this.recordActionPre({ type: 'play', defId: def.id, from: from, choices: recChoices, targetDefs: targetDefs });
    const ctx = this.makeCtx(pIdx, inst);
    // pay
    p.mana -= finalCost;
    this.emit('manaChange', { who: pIdx, mana: p.mana, delta: -finalCost });
    if (def.type === 'spell' && p.nextSpellCostDelta) p.nextSpellCostDelta = 0;
    // leave hand/grave
    this.removeFromZone(inst); this._ver++;
    inst.zone = 'limbo';
    if (from === 'grave' && def.reprise !== null && !this.status(pIdx, 'gravePlayable')) inst.flags.reprised = true;
    // chain / bookkeeping
    p.playedThisTurn.push(def.id);
    p.stats.cardsPlayed++;
    this.addLog(p.name + 'は' + def.name + 'を使った' + (from === 'grave' ? '（墓地から）' : '') + (finalCost ? '（コスト' + finalCost + '）' : ''));
    this.emit('cardPlayed', { who: pIdx, uid: inst.uid, defId: def.id, from: from, cost: finalCost, type: def.type });
    await ctx.addChain(1, p);
    await this.trigger('onCardPlayed', { card: inst, who: pIdx, isCopy: false, cost: finalCost, from: from, def: def });
    if (def.type === 'spell') await this.trigger('onSpellPlayed', { card: inst, who: pIdx, isCopy: false, def: def });
    // 双子星の首飾り-like "first card this turn fires twice": statuses.firstCardTwice handled by relic via nextSpellTimes
    await this.resolveCard(inst, pIdx, { choices: choices, targets: choices.targets });
    this.emit('cardResolved', { who: pIdx, uid: inst.uid, defId: def.id });
    await this.afterAction();
    return { ok: true, uid: inst.uid, cost: finalCost };
  };

  // Play a card (or a copy) without paying. cast(defId|inst, pIdx, {free, copy, times, targets, choices})
  // copies do not add chain unless statuses.copiesCountChain.
  Game.prototype.cast = async function (cardOrDef, pIdx, opts, callerCtx) {
    opts = opts || {};
    const p = this.players[pIdx];
    let inst, isCopy = !!opts.copy;
    if (typeof cardOrDef === 'string') { inst = this.createCardInst(cardOrDef, pIdx, { isCopy: true }); isCopy = true; }
    else {
      inst = cardOrDef;
      if (opts.copy) { const c = this.createCardInst(inst.defId, pIdx, { isCopy: true }); inst = c; isCopy = true; }
      else {
        const wasGrave = inst.zone === 'grave';
        this.removeFromZone(inst); this._ver++; inst.zone = 'limbo';
        if (wasGrave && opts.exileAfter !== false && !opts.fromGraveToGrave) opts.exileAfter = true;
      }
    }
    const def = G.CardDB.get(inst.defId);
    const times = opts.times || 1;
    for (let t = 0; t < times && this.winner === null; t++) {
      const copyInst = (t > 0 || (isCopy && times > 1)) ? this.createCardInst(def.id, pIdx, { isCopy: true }) : inst;
      const copyFlag = isCopy || t > 0;
      this.addLog(p.name + 'は' + def.name + (copyFlag ? 'のコピー' : '') + 'をコストを払わずに使った');
      this.emit('cardPlayed', { who: pIdx, uid: copyInst.uid, defId: def.id, from: 'cast', cost: 0, type: def.type, isCopy: copyFlag });
      if (!copyFlag || this.status(pIdx, 'copiesCountChain')) {
        const ctx = callerCtx || this.makeCtx(pIdx, copyInst);
        await ctx.addChain(1, p);
      }
      if (!copyFlag) { p.playedThisTurn.push(def.id); p.stats.cardsPlayed++; }
      await this.trigger('onCardPlayed', { card: copyInst, who: pIdx, isCopy: copyFlag, cost: 0, from: 'cast', def: def });
      if (def.type === 'spell') await this.trigger('onSpellPlayed', { card: copyInst, who: pIdx, isCopy: copyFlag, def: def });
      await this.resolveCard(copyInst, pIdx, { isCopy: copyFlag, choices: opts.choices, targets: opts.targets, exileAfter: opts.exileAfter, actAs: opts.actAs });
      this.emit('cardResolved', { who: pIdx, uid: copyInst.uid, defId: def.id });
    }
    this.checkWin();
    return inst;
  };

  // Re-fire a card's own effect (多重詠唱 / 映し身の道化): onPlay for spells, onSummon for monsters.
  Game.prototype.replayCard = async function (inst, pIdx, opts) {
    opts = opts || {};
    const def = G.CardDB.get(inst.defId);
    const p = this.players[pIdx];
    this.addLog(def.name + 'の効果をもう一度発動');
    if (def.type === 'spell' && typeof def.effects.onPlay === 'function') {
      const copy = this.createCardInst(def.id, pIdx, { isCopy: true });
      await def.effects.onPlay(this.makeCtx(pIdx, copy, { invertible: true, targets: this.resolveTargets(opts.targets, def), choices: opts.choices || {} }));
      copy.zone = 'void';
    } else if (def.type === 'monster' && typeof def.effects.onSummon === 'function' && !this.status(pIdx, 'noMonsterTriggers')) {
      await def.effects.onSummon(this.makeCtx(pIdx, inst, { invertible: true, targets: this.resolveTargets(opts.targets, def), choices: opts.choices || {} }));
    } else if ((def.type === 'crest' || def.type === 'field') && typeof def.effects.onPlace === 'function') {
      await def.effects.onPlace(this.makeCtx(pIdx, inst, { invertible: true }));
    }
    void p;
    this.checkWin();
  };

  // ---- reserve spells ----------------------------------------------------------
  Game.prototype.setReserve = async function (inst, pIdx) {
    const p = this.players[pIdx];
    const opp = this.players[1 - pIdx];
    const def = G.CardDB.get(inst.defId);
    const ctx = this.makeCtx(pIdx, inst);
    if (this.status(opp.idx, 'immuneReserve')) {
      this.addLog(opp.name + 'は予約魔法の効果を受けない');
      await ctx.toGrave(inst, { reason: 'reserveBlocked' });
      return null;
    }
    // The card waits outside every normal zone (zone 'reserve'), held by the ReserveEffect itself,
    // and goes to the grave when the reserve expires.
    inst.zone = 'reserve';
    const turns = (this.status(pIdx, 'reserveLasts') || 1);
    const res = { uid: inst.uid, defId: def.id, owner: pIdx, target: opp.idx, turnsLeft: turns, setTurn: this.turn, card: inst };
    opp.reserves.push(res);
    this.addLog(p.name + 'は予約魔法を仕掛けた');
    this.emit('reserveSet', { who: pIdx, target: opp.idx, uid: inst.uid, defId: def.id, count: opp.reserves.length });
    return res;
  };

  // Fire the reserve's onActivate hooks at the start of the target's turn; expire at its end.
  Game.prototype.activateReserves = async function (targetIdx) {
    const p = this.players[targetIdx];
    const list = p.reserves.slice();
    for (let i = 0; i < list.length; i++) {
      const res = list[i];
      const def = G.CardDB.get(res.defId);
      this.addLog(this.players[res.owner].name + 'の予約魔法' + def.name + 'が効き始めた');
      this.emit('reserveActivate', { who: res.owner, target: targetIdx, uid: res.uid, defId: res.defId });
      const hooks = def.reserveHooks || {};
      if (typeof hooks.onActivate === 'function') {
        await hooks.onActivate(this.makeCtx(res.owner, res.card, { reserve: res }), { who: targetIdx });
      }
    }
  };

  Game.prototype.expireReserves = async function (targetIdx) {
    const p = this.players[targetIdx];
    const keep = [];
    for (let i = 0; i < p.reserves.length; i++) {
      const res = p.reserves[i];
      res.turnsLeft -= 1;
      if (res.turnsLeft > 0) { keep.push(res); continue; }
      const def = G.CardDB.get(res.defId);
      const hooks = def.reserveHooks || {};
      if (typeof hooks.onExpire === 'function') await hooks.onExpire(this.makeCtx(res.owner, res.card, { reserve: res }), { who: targetIdx });
      const inst = res.card;
      inst.zone = 'limbo';
      const ctx = this.makeCtx(res.owner, inst);
      if (inst.flags.reprised) await ctx.exile(inst); else await ctx.toGrave(inst, { reason: 'reserveExpired' });
      this.emit('reserveExpire', { who: res.owner, target: targetIdx, uid: res.uid, defId: res.defId });
    }
    p.reserves = keep;
  };

  // ---- attack -------------------------------------------------------------------
  Game.prototype.attack = async function (pIdx, attackerUid, targetUid) {
    const p = this.players[pIdx];
    const opp = this.players[1 - pIdx];
    const attacker = this.findCard(attackerUid);
    if (!attacker || !this.canAttackWith(pIdx, attacker)) {
      this.emit('illegal', { action: 'attack', uid: attackerUid, reason: 'cannotAttack' });
      return { ok: false, reason: 'cannotAttack' };
    }
    const legalTargets = this.attackTargetsOf(pIdx, attacker);
    const tkey = targetUid === 'face' ? 'face' : targetUid;
    if (legalTargets.indexOf(tkey) < 0) {
      this.emit('illegal', { action: 'attack', uid: attackerUid, reason: 'badTarget' });
      return { ok: false, reason: 'badTarget' };
    }
    this.recordActionPre({ type: 'attack', attackerDefId: attacker.defId, attackerUid: attacker.uid, target: targetUid === 'face' ? 'face' : { defId: this.findCard(targetUid).defId } });
    attacker.attacksLeft -= 1;
    const def = G.CardDB.get(attacker.defId);
    const ctx = this.makeCtx(pIdx, attacker);
    const target = targetUid === 'face' ? opp : this.findCard(targetUid);
    const atk = this.atkOf(attacker);
    this.addLog(p.name + 'の' + def.name + 'が' + (targetUid === 'face' ? opp.name : G.CardDB.get(target.defId).name) + 'を攻撃（' + atk + '）');
    this.emit('attack', { who: pIdx, uid: attacker.uid, target: targetUid === 'face' ? 'face' : target.uid });
    if (typeof def.effects.onAttack === 'function') await def.effects.onAttack(ctx, target);
    await this.trigger('onAttack', { card: attacker, who: pIdx, target: target });
    if (targetUid === 'face') {
      await ctx.damage(opp, atk, { source: attacker });
    } else {
      const tatk = this.atkOf(target);
      const hpBefore = this.hpOf(target);
      // simultaneous: compute both, then apply
      await ctx.damage(target, atk, { source: attacker });
      if (this.isInPlay(attacker) && tatk > 0) await this.makeCtx(target.owner, target).damage(attacker, tatk, { source: target });
      // 貫通 (pierce): destroying the defender sends the rest of the damage to its owner
      if (this.hasKeyword(attacker, 'pierce') && !this.isInPlay(target) && atk > hpBefore && this.winner === null) {
        this.addLog('貫通：' + (atk - hpBefore) + 'ダメージが' + opp.name + 'に届いた');
        await ctx.damage(opp, atk - hpBefore, { source: attacker });
      }
    }
    if (this.isInPlay(attacker) && this.status(pIdx, 'attackTwice') && !attacker.flags.attackedTwice) {
      attacker.flags.attackedTwice = true; attacker.attacksLeft += 1;
    }
    await this.afterAction();
    return { ok: true };
  };

  // ---- activated abilities (焚べ火の祭壇 "destroy any of my monsters", 巻き戻しの鐘 …) -------
  // CardDef.effects.ability = { label, oncePerTurn, canUse(ctx) → bool, targets: TargetSpec|null, use(ctx) }
  Game.prototype.getAbilities = function (pIdx) {
    const p = this.players[pIdx];
    const out = [];
    if (this.active !== pIdx || this.phase !== 'main' || this.winner !== null) return out;
    const self = this;
    const sources = p.crests.concat(p.board, this.field && this.fieldOwner === pIdx ? [this.field] : []);
    sources.forEach(function (inst) {
      const def = G.CardDB.get(inst.defId);
      const ab = def.effects.ability;
      if (!ab) return;
      if (ab.oncePerTurn && inst.flags.abilityUsedTurn === self.turn) return;
      const ctx = self.makeCtx(pIdx, inst);
      if (ab.canUse && !ab.canUse(ctx)) return;
      let targets = null;
      if (ab.targets) { targets = ctx.candidatesFor(ab.targets).map(function (c) { return c.uid; }); if (!targets.length) return; }
      out.push({ uid: inst.uid, defId: inst.defId, label: ab.label || def.name, targets: targets });
    });
    return out;
  };

  Game.prototype.useAbility = async function (pIdx, sourceUid, targetUids) {
    const inst = this.findCard(sourceUid);
    const avail = this.getAbilities(pIdx).find(function (a) { return a.uid === sourceUid; });
    if (!inst || !avail) { this.emit('illegal', { action: 'ability', uid: sourceUid }); return { ok: false, reason: 'unavailable' }; }
    const def = G.CardDB.get(inst.defId);
    const ab = def.effects.ability;
    const targets = this.resolveTargets([].concat(targetUids || []), def);
    if (ab.targets && !targets.length) return { ok: false, reason: 'needsTarget' };
    this.recordActionPre({ type: 'ability', defId: def.id, targets: targets.map(function (t) { return t.defId ? { defId: t.defId } : t; }) });
    inst.flags.abilityUsedTurn = this.turn;
    this.addLog(this.players[pIdx].name + 'は' + def.name + 'の能力を使った');
    this.emit('ability', { who: pIdx, uid: inst.uid, defId: def.id });
    await ab.use(this.makeCtx(pIdx, inst, { targets: targets }));
    await this.afterAction();
    return { ok: true };
  };

  // ---- action bookkeeping ---------------------------------------------------------
  Game.prototype.recordActionPre = function (desc) {
    desc.turn = this.turn; desc.who = this.active;
    this.turnActions.push(desc);
    if (!this.loop.running) {
      this.actionSnapshots.push({ action: desc, state: this.snapshot() });
      if (this.actionSnapshots.length > 60) this.actionSnapshots.splice(0, this.actionSnapshots.length - 60);
    }
  };

  // After any player action: win check + loop detection hook.
  // Monsters whose HP is 0 or less after a stat change (debuff auras, 呪詛の重み, buffs expiring…) are destroyed.
  Game.prototype.sweepDead = async function () {
    for (let i = 0; i < 2 && this.winner === null; i++) {
      const list = this.monstersOf(i).slice();
      for (let k = 0; k < list.length; k++) {
        const m = list[k];
        if (!this.isInPlay(m) || typeof m.maxHp !== 'number') continue;
        if (this.hpOf(m) <= 0) await this.makeCtx(m.owner, null).destroy(m, { reason: 'stats' });
      }
    }
  };

  Game.prototype.afterAction = async function () {
    if (this.winner === null) await this.sweepDead();
    this.checkWin();
    if (this.winner === null) {
      this.updateForecastState(this.active);
      this.loopAfterAction();
    }
  };

  // Surrender.
  Game.prototype.surrender = function (pIdx) { return this.setWinner(1 - pIdx, 'surrender'); };
})(globalThis.G = globalThis.G || {});
