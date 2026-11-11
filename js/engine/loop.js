(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // loop.js — loop detection and runLoop (shortcut execution).
  //
  // Detection: after every action we hash the *structural* state (zone
  // contents by defId, not resource counters — a mana/chain/damage loop
  // changes counters every pass, that is the point of looping). When the
  // same structural hash shows up a 3rd time within a turn and the action
  // sequences between the repeats are identical, a loop is detected.
  // Extra-turn loops: two consecutive extra turns by the same player with
  // identical action sequences are detected at turn end.
  // ---------------------------------------------------------------
  const Game = G.Engine.Game;
  const util = G.util;
  const OVERFLOW = 999;

  function zoneIds(arr) {
    const ids = new Array(arr.length);
    for (let i = 0; i < arr.length; i++) ids[i] = arr[i].defId;
    return ids;
  }

  Game.prototype.stateHash = function () {
    const parts = [];
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      parts.push(zoneIds(p.hand).sort().join(','));
      parts.push(zoneIds(p.board).join(','));
      parts.push(p.phantoms.length);
      parts.push(zoneIds(p.crests).sort().join(','));
      parts.push(p.grave.length, p.deck.length, p.exile.length);
      parts.push(p.timed.map(function (c) { return c.defId + ':' + c.timedCount; }).join(','));
      parts.push(p.seals.length, p.vault.length, p.reserves.length);
      parts.push(p.board.map(function (c) { return c.damage + '/' + c.attacksLeft; }).join(','));
      // phantoms attacking one after another must not look like a loop (QA fix): include their attack state
      parts.push(p.phantoms.map(function (c) { return c.damage + '/' + c.attacksLeft; }).join(','));
    }
    parts.push(this.field ? this.field.defId : '-');
    parts.push(this.active);
    return util.hashString(parts.join('|'));
  };

  // Full hash including counters (used by tests / AI to detect "nothing changed").
  Game.prototype.fullHash = function () {
    const parts = [this.stateHash()];
    for (let i = 0; i < 2; i++) {
      const p = this.players[i];
      parts.push(p.life, p.mana, p.maxMana, p.curse, p.chain, p.extraTurns);
    }
    return util.hashString(parts.join('|'));
  };

  function sameAction(a, b) {
    if (!a || !b || a.type !== b.type) return false;
    if (a.type === 'play') return a.defId === b.defId && a.from === b.from && JSON.stringify(a.targetDefs || []) === JSON.stringify(b.targetDefs || []);
    if (a.type === 'attack') return a.attackerDefId === b.attackerDefId && JSON.stringify(a.target) === JSON.stringify(b.target);
    if (a.type === 'ability') return a.defId === b.defId && JSON.stringify(a.targets) === JSON.stringify(b.targets);
    if (a.type === 'endTurn') return true;
    return false;
  }

  function sameSequence(x, y) {
    if (x.length !== y.length || !x.length) return false;
    for (let i = 0; i < x.length; i++) if (!sameAction(x[i], y[i])) return false;
    return true;
  }

  // Called after each player action (play / attack / ability).
  Game.prototype.loopAfterAction = function () {
    if (this.loop.running) return;
    const hash = this.stateHash();
    const action = util.last(this.turnActions) || null;
    const hist = this.loop.history;
    hist.push({ hash: hash, action: action });
    if (hist.length > 400) hist.splice(0, hist.length - 400);
    const idx = [];
    for (let i = hist.length - 1; i >= 0 && idx.length < 3; i--) if (hist[i].hash === hash) idx.unshift(i);
    if (idx.length < 3) return;
    const c1 = hist.slice(idx[0] + 1, idx[1] + 1).map(function (h) { return h.action; });
    const c2 = hist.slice(idx[1] + 1, idx[2] + 1).map(function (h) { return h.action; });
    if (!sameSequence(c1, c2)) return;
    this.setLoopDetected({ kind: 'action', who: this.active, cycle: util.deepClone(c2), hash: hash });
  };

  // Called from endTurn when the same player continues (extra turn).
  Game.prototype.loopCheckExtraTurn = function (pIdx) {
    const rec = { who: pIdx, actions: util.deepClone(this.turnActions), turn: this.turn };
    const prev = this.loop.lastExtraTurn;
    this.loop.lastExtraTurn = rec;
    if (!prev || prev.who !== pIdx || prev.turn !== this.turn - 1) return;
    if (!sameSequence(prev.actions, rec.actions)) return;
    this.setLoopDetected({ kind: 'turn', who: pIdx, cycle: rec.actions.concat([{ type: 'endTurn' }]), hash: null });
  };

  // Two cycles are the same loop if one is a rotation of the other.
  function sameLoop(a, b) {
    if (a.length !== b.length) return false;
    for (let r = 0; r < a.length; r++) {
      let okRot = true;
      for (let i = 0; i < a.length && okRot; i++) if (!sameAction(a[(i + r) % a.length], b[i])) okRot = false;
      if (okRot) return true;
    }
    return false;
  }

  Game.prototype.setLoopDetected = function (det) {
    const already = this.loop.detected && this.loop.detected.kind === det.kind && sameLoop(this.loop.detected.cycle, det.cycle);
    this.loop.detected = det;
    if (!already) {
      this.addLog('ループを検出：' + det.cycle.length + '手の繰り返し');
      this.emit('loopDetected', { who: det.who, kind: det.kind, cycle: det.cycle, length: det.cycle.length });
    }
  };

  Game.prototype.clearLoop = function () { this.loop.detected = null; this.loop.history = []; };

  // Resolve an action descriptor against the current state → concrete call or null if impossible.
  Game.prototype.resolveActionDesc = function (pIdx, desc) {
    const p = this.players[pIdx];
    const self = this;
    function byDef(arr, defId, pred) {
      for (let i = 0; i < arr.length; i++) if (arr[i].defId === defId && (!pred || pred(arr[i]))) return arr[i];
      return null;
    }
    if (desc.type === 'play') {
      const zone = desc.from === 'grave' ? p.grave : p.hand;
      const inst = byDef(zone, desc.defId, function (c) { return self.canPlayCard(pIdx, c, desc.choices).ok; });
      if (!inst) return null;
      const choices = util.deepClone(desc.choices || {});
      // re-resolve targets by defId within the card's own target spec
      if (desc.targetDefs && desc.targetDefs.length) {
        const def = G.CardDB.get(desc.defId);
        const ctx = self.makeCtx(pIdx, inst);
        const cands = def.targets ? ctx.candidatesFor(def.targets) : self.monstersOf(0).concat(self.monstersOf(1));
        const used = [];
        choices.targets = desc.targetDefs.map(function (t) {
          if (t === 'face' || t === 'opp' || t === 'me') return t;
          const found = byDef(cands, t.defId, function (c) { return used.indexOf(c) < 0; });
          if (found) used.push(found);
          return found ? found.uid : null;
        });
        if (choices.targets.indexOf(null) >= 0) return null; // a target vanished → loop broken
      }
      return function () { return self.playCard(pIdx, inst.uid, { choices: choices }); };
    }
    if (desc.type === 'attack') {
      const attacker = byDef(this.monstersOf(pIdx), desc.attackerDefId, function (m) { return self.canAttackWith(pIdx, m); });
      if (!attacker) return null;
      let target = 'face';
      if (desc.target !== 'face') {
        const t = byDef(this.monstersOf(1 - pIdx), desc.target.defId);
        if (!t) return null;
        target = t.uid;
      }
      if (this.attackTargetsOf(pIdx, attacker).indexOf(target) < 0) return null;
      return function () { return self.attack(pIdx, attacker.uid, target); };
    }
    if (desc.type === 'ability') {
      const abil = this.getAbilities(pIdx);
      let chosen = null, targetUids = [];
      for (let i = 0; i < abil.length && !chosen; i++) {
        if (abil[i].defId !== desc.defId) continue;
        targetUids = [];
        let ok = true;
        (desc.targets || []).forEach(function (t) {
          if (!ok) return;
          if (t === 'face' || t === 'opp' || t === 'me') { targetUids.push(t); return; }
          const cands = (abil[i].targets || []).map(function (u) { return self.findCard(u); });
          const found = byDef(cands, t.defId);
          if (!found) ok = false; else targetUids.push(found.uid);
        });
        if (ok) chosen = abil[i];
      }
      if (!chosen) return null;
      return function () { return self.useAbility(pIdx, chosen.uid, targetUids); };
    }
    if (desc.type === 'endTurn') {
      return function () { return self.endTurn(pIdx); };
    }
    return null;
  };

  // Run the detected loop `times` times (or 'inf' = until the game ends, max 999 → overflow).
  // Stops early when an action becomes illegal, the state stops cycling, 零の聖域 voids it, or the game ends.
  Game.prototype.runLoop = async function (pIdx, times, opts) {
    opts = opts || {};
    const det = opts.cycle ? { kind: opts.kind || 'action', who: pIdx, cycle: opts.cycle } : this.loop.detected;
    if (!det) return { ok: false, reason: 'noLoop', iterations: 0 };
    if (det.who !== pIdx || this.active !== pIdx) return { ok: false, reason: 'notYourLoop', iterations: 0 };
    const inf = times === 'inf' || times === Infinity;
    const max = inf ? OVERFLOW : Math.max(0, times | 0);
    const cycle = det.cycle;
    this.loop.running = true;
    this.addLog('ループ実行 ×' + (inf ? '∞' : max));
    this.emit('loopRun', { who: pIdx, times: inf ? 'inf' : max, length: cycle.length });
    let iterations = 0, reason = 'done';
    try {
      while (iterations < max && this.winner === null) {
        if (iterations >= 1 && this.status(pIdx, 'loopSecondIterationVoid')) {
          this.addLog('零の聖域：ループの2周目以降は無効');
          this.emit('loopVoid', { who: pIdx });
          reason = 'void';
          break;
        }
        const before = det.kind === 'action' ? this.stateHash() : null;
        let broke = false;
        for (let a = 0; a < cycle.length; a++) {
          const fn = this.resolveActionDesc(pIdx, cycle[a]);
          if (!fn) { broke = true; reason = 'illegal'; break; }
          const r = await fn();
          if (r && r.ok === false) { broke = true; reason = 'illegal'; break; }
          if (this.winner !== null) break;
        }
        if (broke) break;
        iterations++;
        this.loop.iterations++;
        this.players[pIdx].stats.loops++;
        if (iterations > this.stats.longestLoop) this.stats.longestLoop = iterations;
        this.emit('loopIteration', { who: pIdx, iteration: iterations });
        await this.trigger('onLoopIteration', { who: pIdx, iteration: iterations });
        if (this.winner !== null) { reason = 'win'; break; }
        if (det.kind === 'action' && this.stateHash() !== before) { reason = 'diverged'; break; }
      }
      if (inf && iterations >= OVERFLOW && this.winner === null) {
        reason = 'overflow';
        this.addLog('オーバーフロー！ ループは' + OVERFLOW + '回で強制終了した');
        this.emit('overflow', { who: pIdx, iterations: iterations });
      }
    } finally {
      this.loop.running = false;
    }
    this.loop.history = [];
    if (reason === 'illegal' || reason === 'diverged' || reason === 'void') this.loop.detected = null;
    this.addLog('ループ終了：' + iterations + '周（' + reason + '）');
    this.emit('loopEnd', { who: pIdx, iterations: iterations, reason: reason });
    this.checkWin();
    return { ok: true, iterations: iterations, reason: reason, winner: this.winner };
  };

  // UI/AI may declare the "unstoppable infinite loop" win per SPEC (仕掛けた側の勝ち) after an overflow.
  Game.prototype.declareLoopWin = function (pIdx) { return this.setWinner(pIdx, 'loopInfinite'); };

  G.Engine.LOOP_OVERFLOW = OVERFLOW;
})(globalThis.G = globalThis.G || {});
