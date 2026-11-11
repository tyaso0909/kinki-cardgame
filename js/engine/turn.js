(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // turn.js — battle start (coin toss, hands), turn start/end,
  // extra turns & streak, phantoms vanish, reserves/timed, hazard &
  // forecast state.
  // ---------------------------------------------------------------
  const Game = G.Engine.Game;

  // ---- start ---------------------------------------------------------------
  Game.prototype.start = async function () {
    if (this.phase !== 'setup') throw new Error('game already started');
    // build decks
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      const ids = this._initialDecks[i] || [];
      for (let k = 0; k < ids.length; k++) this.addCard(i, ids[k], 'deck');
      if (!this.options.noShuffle) this.rng.shuffle(p.deck);
    }
    // field
    if (this._initialField) {
      const owner = this.options.fieldOwner != null ? this.options.fieldOwner : 1;
      const f = this.createCardInst(this._initialField, owner);
      this.placeInZone(f, owner, 'field');
      this.emit('fieldSet', { who: owner, uid: f.uid, defId: f.defId, initial: true });
    }
    // coin toss
    this.first = this.options.firstPlayer != null ? this.options.firstPlayer : this.rng.int(2);
    this.active = this.first;
    this.addLog('コイントス：' + this.players[this.first].name + 'が先攻');
    this.emit('coinToss', { first: this.first });
    // initial hands
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      const n = (p.flags.initialHand != null ? p.flags.initialHand : this.options.initialHand) + (this.status(i, 'initialHandDelta') || 0);
      const ctx = this.makeCtx(i, null);
      await ctx.draw(Math.max(0, n), p, { noModify: true });
      p.drawnThisTurn = 0;
    }
    // relic / enemy onBattleStart hooks (first player first)
    await this.fireBattleStart();
    this.phase = 'start';
    this.turn = 0;
    await this.beginTurn(this.first, false);
    return this;
  };

  // onBattleStart: relics (as hook sources), pre-placed cards (sandbox / boss fields), then EnemyDef.onBattleStart.
  Game.prototype.fireBattleStart = async function () {
    const order = [this.first, 1 - this.first];
    for (let k = 0; k < 2; k++) {
      const i = order[k];
      await this.trigger('onBattleStart', { who: i });
      const p = this.players[i];
      if (p.enemyDefId && G.EnemyDB.has(p.enemyDefId)) {
        const edef = G.EnemyDB.get(p.enemyDefId);
        if (typeof edef.onBattleStart === 'function') await edef.onBattleStart(this.makeCtx(i, null), this);
      }
    }
  };

  // ---- turn start ------------------------------------------------------------
  Game.prototype.resetTurnCounters = function (p) {
    p.manaGainedThisTurn = 0; p.drawnThisTurn = 0;
    p.prevTurnPlayed = p.playedThisTurn; p.playedThisTurn = [];
    p.prevTurnSpells = p.spellsPlayedThisTurn; p.spellsPlayedThisTurn = [];
    p.returnedToHandThisTurn = 0; p.destroyedThisTurn = [];
    p.nextSpellTimes = 1; p.nextSummonTimes = 1; p.nextSpellCostDelta = 0;
    p.lastSpellDefId = null; p.lastSpellUid = null;
  };

  Game.prototype.beginTurn = async function (pIdx, isExtra) {
    const p = this.players[pIdx];
    const opp = this.players[1 - pIdx];
    this.turn += 1;
    this.stats.turns = this.turn;
    this.active = pIdx;
    this.phase = 'start';
    p.turnsTaken++;
    if (this.streak > this.stats.longestStreak) this.stats.longestStreak = this.streak;
    // previous-turn action bookkeeping (歴史改変 uses the previous turn of the OTHER player)
    this.prevTurnActions = this.turnActions; this.turnActions = [];
    this.prevTurnActionSnapshots = this.actionSnapshots; this.actionSnapshots = [];
    this.loop.history = [];
    if (this.loop.detected && this.loop.detected.kind !== 'turn') this.loop.detected = null;
    if (!isExtra) { this.loop.detected = null; this.loop.lastExtraTurn = null; }
    this.resetTurnCounters(p);
    // monsters refresh
    const self = this;
    this.monstersOf(pIdx).forEach(function (m) { m.attacksLeft = self.attacksPerTurn(m); m.exhausted = false; m.flags.attackedTwice = false; });
    this.addLog('――― ターン' + this.turn + '：' + p.name + (isExtra ? '（追加ターン）' : '') + ' ―――');
    this.emit('turnStart', { who: pIdx, turn: this.turn, extra: !!isExtra, streak: this.streak });
    const ctx = this.makeCtx(pIdx, null);
    // mana
    // SPEC: both players start their first turn at max mana 1 — per-turn bonuses (竜の心臓) begin from turn 2,
    // and 「戦闘開始時、マナ+N」 effects arrive as one-time extra mana on that first turn (flags.firstTurnManaBonus).
    const firstTurn = p.turnsTaken === 1;
    let gain = 1 + (firstTurn ? 0 : (this.status(pIdx, 'maxManaGainDelta') || 0));
    if (p.flags.nextMaxManaDelta) { gain += p.flags.nextMaxManaDelta; p.flags.nextMaxManaDelta = 0; }
    p.maxMana = Math.max(0, p.maxMana + gain);
    if (this.status(pIdx, 'manaPersists')) p.mana += p.maxMana; else p.mana = p.maxMana;
    if (this.status(pIdx, 'manaDoubleAtStart')) p.mana *= 2;
    if (firstTurn && p.flags.firstTurnManaBonus) { p.mana += p.flags.firstTurnManaBonus; p.flags.firstTurnManaBonus = 0; }
    this.emit('manaChange', { who: pIdx, mana: p.mana, maxMana: p.maxMana, delta: 0 });
    this.addLog(p.name + 'のマナ：' + p.mana + '/' + p.maxMana);
    // chain: reset unless chainPersists; relics may start with chain>0 (雷の欠片)
    if (!this.status(pIdx, 'chainPersists')) p.chain = 0;
    const startChain = this.status(pIdx, 'chainAtTurnStart') || 0;
    if (startChain) await ctx.addChain(startChain, p);
    // reserves set by opponent become active
    await this.activateReserves(pIdx);
    // timed tick
    if (!this.status(pIdx, 'timedFrozen')) {
      const rate = this.status(pIdx, 'timedTickRate') || 1;
      await ctx.tickTimed(p, rate);
    }
    if (this.winner !== null) return;
    // draw (first player skips on turn 1)
    const isFirstTurnOfFirstPlayer = (this.turn === 1 && pIdx === this.first);
    if (!isFirstTurnOfFirstPlayer) {
      let n = this.status(pIdx, 'drawPerTurn');
      if (n === undefined || n === null) n = 1;
      if (p.flags.nextDrawCount !== undefined) { n = p.flags.nextDrawCount; delete p.flags.nextDrawCount; }
      if (n > 0) await ctx.draw(n, p);
    } else this.addLog(p.name + 'は先攻のため最初のターンはカードを引かない');
    if (this.checkWin()) return;
    this.phase = 'main';
    // snapshot "start of turn" = after mana/draw, before onTurnStart triggers (巻き戻しの鐘 / 時間逆行 restore here)
    this.pushTurnSnapshot();
    await this.trigger('onTurnStart', { who: pIdx, extra: !!isExtra, streak: this.streak });
    if (isExtra) await this.trigger('onExtraTurnStart', { who: pIdx, streak: this.streak });
    await this.sweepDead();
    this.checkWin();
    void opp;
  };

  // ---- end turn --------------------------------------------------------------
  Game.prototype.endTurn = async function (pIdx) {
    if (this.winner !== null) return { ok: false, reason: 'gameOver' };
    if (this.active !== pIdx || this.phase !== 'main') { this.emit('illegal', { action: 'endTurn', reason: 'notYourTurn' }); return { ok: false, reason: 'notYourTurn' }; }
    const p = this.players[pIdx];
    const ctx = this.makeCtx(pIdx, null);
    this.phase = 'end';
    this.emit('turnEnd', { who: pIdx, turn: this.turn });
    await this.trigger('onTurnEnd', { who: pIdx, turn: this.turn });
    // hand limit
    if (this.winner === null) await this.enforceHandLimit(pIdx);
    // chain reset (unless 世界を貫く雷)
    if (!this.status(pIdx, 'chainPersists')) { p.chain = 0; this.emit('chain', { who: pIdx, chain: 0 }); }
    // mana cleared (unless 天井なき空)
    if (!this.status(pIdx, 'manaPersists')) { p.mana = 0; this.emit('manaChange', { who: pIdx, mana: 0, delta: 0 }); }
    // phantoms vanish at the end of their owner's OPPONENT's turn — they attack on the owner's turn and stand
    // (and block, and can be attacked) through the opponent's next turn. A phantom made during this very turn
    // (e.g. 分裂する粘体 splitting while defending) waits for the end of the opponent's next turn.
    const oIdx = 1 - pIdx;
    const op = this.players[oIdx];
    const persistAll = this.status(oIdx, 'phantomsPersist');
    const phs = op.phantoms.slice();
    const octx = this.makeCtx(oIdx, null);
    let vanished = 0;
    for (let i = 0; i < phs.length; i++) {
      if (persistAll || phs[i].persistent) continue;
      if (phs[i].bornTurn != null && phs[i].bornTurn >= this.turn) continue;
      octx.vanishPhantom(phs[i]); vanished++;
    }
    if (vanished) this.addLog(op.name + 'の幻影' + vanished + '体が消えた');
    // end-of-turn buffs expire
    for (let i = 0; i < 2; i++) this.monstersOf(i).forEach(function (m) {
      m.buffs = m.buffs.filter(function (b) { return !(b.until && b.until.player === pIdx); });
      if (m.flags.tempKw && m.flags.tempKw.until === pIdx) delete m.flags.tempKw;
    });
    // reserves targeting this player expire; statuses bound to this turn expire
    await this.expireReserves(pIdx);
    this.expireStatuses(pIdx);
    await this.sweepDead(); // e.g. an until-end-of-turn HP buff ran out on a damaged monster
    // enemy forecast handled by AI; just recompute hazard state here
    this.updateForecastState(pIdx);
    if (this.turnLimit && this.turn >= this.turnLimit && this.winner === null) this.setWinner(null, 'turnLimit');
    if (this.checkWin()) return { ok: true, over: true };
    // next player
    let next = 1 - pIdx;
    let isExtra = false;
    if (p.extraTurns > 0) {
      p.extraTurns -= 1;
      next = pIdx; isExtra = true;
      this.streak += 1;
      this.addLog(p.name + 'の追加ターン！（連続' + this.streak + 'ターン目）');
    } else if (this.status(1 - pIdx, 'turnsSkipped') || this.players[1 - pIdx].skipNextTurn) {
      const o = this.players[1 - pIdx];
      if (o.skipNextTurn) o.skipNextTurn = false;
      next = pIdx; isExtra = true;
      this.streak += 1;
      this.addLog(o.name + 'のターンはスキップされた');
      this.emit('skipTurn', { who: o.idx, skipped: true });
    } else {
      this.streak = 1;
    }
    if (isExtra && !this.loop.running) this.loopCheckExtraTurn(pIdx);
    await this.beginTurn(next, isExtra);
    return { ok: true };
  };

  // ---- hazard & forecast ----------------------------------------------------------
  // hazard(pIdx): threat meter of player pIdx (how close their combo is), 0..100. Uses EnemyDef.hazard tests
  // (or Player.hazard tests set by the sandbox).
  Game.prototype.hazard = function (pIdx) {
    const p = this.players[pIdx];
    const opp = this.players[1 - pIdx];
    let tests = p.hazardTests || null;
    if (!tests && p.enemyDefId && G.EnemyDB.has(p.enemyDefId)) tests = G.EnemyDB.get(p.enemyDefId).hazard;
    if (!tests || !tests.length) return 0;
    let sum = 0;
    for (let i = 0; i < tests.length; i++) {
      try { if (tests[i].test(this, p, opp)) sum += tests[i].weight; } catch (e) { /* defensive: a broken test adds nothing */ }
    }
    return Math.max(0, Math.min(100, sum));
  };

  // AI decides to forecast; engine stores the state and emits events.
  Game.prototype.setForecast = function (pIdx, on, text) {
    const p = this.players[pIdx];
    const was = !!(p.statuses.forecasted && p.statuses.forecasted.value);
    if (on && !was) {
      this.setStatus(pIdx, 'forecasted', true);
      p.forecastText = text || (p.enemyDefId && G.EnemyDB.has(p.enemyDefId) ? G.EnemyDB.get(p.enemyDefId).forecastText : '次のターン、何かが起こる');
      p.forecastCancelled = false;
      this.addLog('【予告】' + p.forecastText);
      this.emit('forecast', { who: pIdx, text: p.forecastText });
    } else if (!on && was) {
      this.clearStatus(pIdx, 'forecasted');
      p.forecastCancelled = true;
      this.addLog('予告は取り消された');
      this.emit('forecastCancelled', { who: pIdx });
    }
    return !!on;
  };

  Game.prototype.isForecasted = function (pIdx) { return !!this.explicitStatus(pIdx, 'forecasted'); };

  // Called after actions and at turn end: emits hazardChange; auto-cancels a forecast when the
  // forecasting player's hazard drops below 100 during the OPPONENT's turn (parts got destroyed).
  Game.prototype.updateForecastState = function (actingIdx) {
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      const h = this.hazard(i);
      if (p.lastHazard !== h) { p.lastHazard = h; this.emit('hazardChange', { who: i, hazard: h }); }
      if (this.isForecasted(i) && h < 100 && actingIdx !== i) this.setForecast(i, false);
    }
  };
})(globalThis.G = globalThis.G || {});
