(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // js/ai/ai.js — enemy turn logic.
  //
  //   await G.AI.takeTurn(game, pIdx, { onStep })   plays one full turn (ends it)
  //   G.AI.evaluate(game, pIdx, style)              position score for pIdx
  //   G.AI.styleOf(game, pIdx) / mistakeRateOf      from EnemyDef / chooser props / options
  //   G.AI.checkEnrage(game, pIdx)                  applies EnemyDef.enrage once (UI may call after player actions)
  //   G.AI.enemyPlayerConfig(def, opts)             player config for G.Engine.createGame
  //
  // SPEC promises:
  //  1. No cheating: evaluation reads only public zones + own cards; the opponent's hand is a count
  //     (cards revealed by effects reach the AI only through pick candidates / statuses.handRevealed).
  //  2. No decisive action without a prior forecast: any non-attack action whose simulation ends the
  //     game (or deals a one-shot ≥ 40% of the opponent's max life), and any infinite loop run, is
  //     allowed only when game.isForecasted(pIdx) was true at the start of the AI's turn. When such an
  //     action is withheld the player flag `aiLethalBlocked` is raised; a synthetic hazard test
  //     (installed by enemyPlayerConfig / ensureHazard) reads it as 100%, so the forecast is issued
  //     at this turn's end and the finisher comes the turn after — even for enemies without SPEC
  //     hazard tables.
  //  3. Forecast/cancel are decided at the AI's turn end from game.hazard(pIdx).
  // ---------------------------------------------------------------
  const AI = G.AI = G.AI || {};
  const MAX_ACTIONS = 80;

  // ---- style profiles ---------------------------------------------------------
  AI.STYLES = {
    speed:      { life: 2.0, board: 1.4, hand: 0.8, mana: 0.8, combo: 0.6, threat: 0.8, special: 0.6, disrupt: 0.8, attack: 1.3 },
    assemble:   { life: 0.9, board: 0.9, hand: 1.2, mana: 1.0, combo: 2.2, threat: 1.0, special: 0.8, disrupt: 1.0, attack: 0.8 },
    charge:     { life: 0.6, board: 0.7, hand: 1.8, mana: 1.4, combo: 1.4, threat: 0.8, special: 0.6, disrupt: 0.7, attack: 0.5 },
    disrupt:    { life: 1.0, board: 1.2, hand: 1.0, mana: 0.8, combo: 0.6, threat: 2.2, special: 0.8, disrupt: 2.0, attack: 0.9 },
    specialWin: { life: 0.5, board: 0.7, hand: 1.0, mana: 0.9, combo: 1.4, threat: 1.0, special: 2.4, disrupt: 1.0, attack: 0.6 },
    mirror:     { life: 1.0, board: 1.0, hand: 1.2, mana: 1.0, combo: 1.8, threat: 1.2, special: 1.0, disrupt: 1.2, attack: 0.9 }
  };
  const STYLE_ALIAS = { aggro: 'speed', combo: 'assemble', control: 'disrupt', copy: 'mirror' };

  function enemyDefOf(game, pIdx) {
    const id = game.players[pIdx].enemyDefId;
    return id && G.EnemyDB.has(id) ? G.EnemyDB.get(id) : null;
  }
  AI.styleOf = function (game, pIdx) {
    const p = game.players[pIdx];
    const def = enemyDefOf(game, pIdx);
    let s = p.aiStyle || (p.chooser && p.chooser.aiStyle) || (def && def.style) || game.options.aiStyle || 'speed';
    s = STYLE_ALIAS[s] || s;
    return AI.STYLES[s] ? s : 'speed';
  };
  AI.mistakeRateOf = function (game, pIdx) {
    const p = game.players[pIdx];
    if (typeof p.aiMistakeRate === 'number') return p.aiMistakeRate;
    if (p.chooser && typeof p.chooser.aiMistakeRate === 'number') return p.chooser.aiMistakeRate;
    const def = enemyDefOf(game, pIdx);
    if (def && typeof def.mistakeRate === 'number') return def.mistakeRate;
    return game.options.aiMistakeRate || 0;
  };
  function aiRng(game) { return game._aiRng || (game._aiRng = new G.RNG((game.seed ^ 0xA15EED) >>> 0)); }

  // ---- synthetic hazard (promise 2 for enemies without a SPEC table) ----------------
  AI.lethalBlockedTest = { test: function (game, p) { return !!(p.flags && p.flags.aiLethalBlocked); }, weight: 100, synthetic: true };
  AI.ensureHazard = function (game, pIdx) {
    const p = game.players[pIdx];
    if (p.hazardTests && p.hazardTests.some(function (t) { return t.synthetic; })) return;
    let base = p.hazardTests;
    if (!base) { const def = enemyDefOf(game, pIdx); base = def ? def.hazard.slice() : []; }
    p.hazardTests = base.concat([AI.lethalBlockedTest]);
  };

  // ---- evaluation --------------------------------------------------------------
  function boardValue(game, who) {
    let v = 0;
    game.monstersOf(who).forEach(function (m) {
      const def = G.CardDB.get(m.defId);
      v += game.atkOf(m) * 1.0 + game.hpOf(m) * 0.5;
      if (m.keywords.indexOf('guard') >= 0) v += 1;
      if (AI.hasPassive(def) || def.role === 'engine') v += 3;
      if (m.isPhantom) v *= 0.7;
    });
    return v;
  }
  // Damage the opponent could push through next turn (public info: their board only).
  function incomingDamage(game, pIdx) {
    const opp = game.players[1 - pIdx];
    const me = game.players[pIdx];
    let atk = 0;
    game.monstersOf(opp.idx).forEach(function (m) { atk += game.atkOf(m); });
    let guardHp = 0;
    game.monstersOf(me.idx).forEach(function (m) { if (m.keywords.indexOf('guard') >= 0) guardHp += game.hpOf(m); });
    if (game.status(opp.idx, 'cannotAttack')) atk = 0;
    return Math.max(0, atk - guardHp);
  }
  AI.incomingDamage = incomingDamage;

  AI.evaluate = function (game, pIdx, style) {
    const W = AI.STYLES[style || AI.styleOf(game, pIdx)];
    const me = game.players[pIdx], opp = game.players[1 - pIdx];
    if (game.winner === pIdx) return 10000;
    if (game.winner === 1 - pIdx) return -10000;
    if (game.winner === null && game.phase === 'over') return -100;
    let s = 0;
    // life
    const lifeMe = me.life / Math.max(1, me.maxLife), lifeOpp = opp.life / Math.max(1, opp.maxLife);
    s += (lifeMe - lifeOpp) * 30 * W.life + (me.life - opp.life) * 0.15 * W.life;
    if (opp.life <= 10) s += (10 - opp.life) * 1.5 * W.life;
    if (me.life <= 10) s -= (10 - me.life) * 2;
    // board / permanents
    s += (boardValue(game, pIdx) - boardValue(game, 1 - pIdx) * 0.9) * W.board;
    s += me.crests.length * 2.5 * W.combo;
    me.crests.forEach(function (c) { s += AI.cardValue(G.CardDB.get(c.defId)) * 0.4 * W.combo; });
    if (game.field) s += (game.fieldOwner === pIdx ? 3 : -3) * W.threat;
    s += me.timed.length * 2;
    s += me.reserves.length * -2; // opponent's reserves aimed at me
    s += opp.reserves.length * 2 * W.disrupt;
    // hand / resources (own hand only; opponent hand = count)
    const limit = game.status(pIdx, 'handLimit') || G.Engine.Game.HAND_LIMIT;
    let hq = 0;
    me.hand.forEach(function (c) { hq += 0.6 + AI.cardValue(G.CardDB.get(c.defId)) * 0.25; });
    if (me.hand.length > limit) hq -= (me.hand.length - limit) * 2.5;
    s += hq * W.hand;
    s -= opp.hand.length * 0.4 * W.threat;
    s += (me.maxMana * 1.0 + me.mana * 0.25) * W.mana;
    s -= opp.maxMana * 0.4;
    // deck-out danger: each card below a 6-card cushion costs more the thinner the deck gets
    if (me.deck.length < 6) s -= Math.pow(6 - me.deck.length, 2) * 2.5;
    // An empty deck loses at our next draw step unless we win first: treat it as nearly a loss so the
    // AI never thins itself out for a little damage or card advantage (normal enemies have 15-card decks).
    if (me.deck.length === 0) s -= 400;
    else if (me.deck.length === 1) s -= 90;   // one more draw step, then out
    else if (me.deck.length === 2) s -= 35;
    if (opp.deck.length < 6) s += Math.pow(6 - opp.deck.length, 1.5) * 1.5;
    s += me.extraTurns * 8;
    if (me.skipNextTurn) s -= 10;
    if (opp.skipNextTurn) s += 10;
    // combo progress (own) / threats (opponent's public engines)
    if (G.Combos) {
      const b = G.Combos.best(game, pIdx);
      s += b.progress * 14 * W.combo;
    }
    let oppEngines = 0;
    opp.crests.forEach(function () { oppEngines += 1; });
    game.monstersOf(opp.idx).forEach(function (m) { const d = G.CardDB.get(m.defId); if (d.role === 'engine' || AI.hasPassive(d)) oppEngines += 1; });
    s -= oppEngines * 3 * W.threat;
    // danger: can the opponent kill me next turn?
    const incoming = incomingDamage(game, pIdx);
    if (incoming >= me.life) s -= 40;
    else if (incoming >= me.life * 0.5) s -= 10;
    // special-win progress
    const myKeys = game.distinctKeys(pIdx), oppKeys = game.distinctKeys(1 - pIdx);
    s += myKeys * 5 * W.special;
    s -= oppKeys * 5 * W.threat;
    if (oppKeys >= 3) s -= 10 * W.threat;
    s += (opp.curse / Math.max(1, opp.curseLimit)) * 25 * W.special;
    s -= (me.curse / Math.max(1, me.curseLimit)) * 25;
    if (me.curse >= me.curseLimit * 0.7) s -= 10;
    // chain / streak (storm & time styles)
    s += Math.min(20, game.chainOf(pIdx)) * 0.3 * W.combo;
    return s;
  };

  // ---- candidate generation ---------------------------------------------------
  function sig(a) {
    if (a.type === 'play') return 'p:' + a.defId + ':' + JSON.stringify(a.targetDefs || []);
    // candidates carry target uids + targetDefs, recorded loop cycles carry targets as [{defId}] — compare by defId (QA fix)
    if (a.type === 'ability') return 'a:' + a.defId + ':' + JSON.stringify(a.targetDefs || a.targets || []);
    if (a.type === 'attack') return 'k:' + a.attackerDefId + ':' + JSON.stringify(a.target);
    return a.type;
  }
  AI.actionSig = sig;

  function targetDefsOf(game, uids) {
    return (uids || []).map(function (u) { if (typeof u === 'string') return u; const c = game.findCard(u); return c ? { defId: c.defId } : null; }).filter(Boolean);
  }

  // SPEC disruption timing: engines on the opponent's side, chain signs, keys / curse near the line.
  function disruptTriggers(game, pIdx) {
    const opp = game.players[1 - pIdx], me = game.players[pIdx];
    let n = 0;
    if (opp.crests.length) n++;
    if (game.monstersOf(opp.idx).some(function (m) { const d = G.CardDB.get(m.defId); return d.role === 'engine' || AI.hasPassive(d); })) n++;
    const oppPlayed = game.active === opp.idx ? opp.playedThisTurn.length : opp.prevTurnPlayed.length;
    if (oppPlayed >= 5) n++;
    if (game.distinctKeys(opp.idx) >= 3) n++;
    if (me.curse >= me.curseLimit * 0.6) n++;
    if (game.field && game.fieldOwner === opp.idx) n++;
    if (incomingDamage(game, pIdx) >= me.life * 0.6) n++;
    return n;
  }

  // Combos whose parts are all in hand/board/crests: the AI tries to "turn the crank" on them.
  function assembledCombos(game, pIdx) {
    if (!G.Combos) return [];
    return G.Combos.deckCombos(game, pIdx).filter(function (combo) {
      const ids = G.Combos.ids(combo);
      return ids.parts.length && ids.parts.every(function (id) { return G.Combos.hasPart(game, pIdx, id); });
    });
  }
  // Bonus for an action that works a ready combo (play/ability on its parts, or its finisher when allowed).
  function comboCrank(game, pIdx, cand, ready, forecasted) {
    if (!ready.length) return 0;
    let b = 0;
    for (let i = 0; i < ready.length; i++) {
      const ids = G.Combos.ids(ready[i]);
      const mult = ready[i].infinite ? 1.5 : 1;
      if (cand.type === 'play' && ids.parts.indexOf(cand.defId) >= 0) b = Math.max(b, 8 * mult);
      if (cand.type === 'ability' && ids.parts.indexOf(cand.defId) >= 0) {
        const hitsPart = (cand.targetDefs || []).some(function (t) { return t && ids.parts.indexOf(t.defId) >= 0; });
        b = Math.max(b, hitsPart ? 10 * mult : 3);
      }
      if (cand.type === 'play' && forecasted && ids.finisher.indexOf(cand.defId) >= 0) b = Math.max(b, 6);
    }
    return b;
  }

  // Prior (cheap heuristic) used for ordering candidates and as fallback score.
  function prior(game, pIdx, cand, style) {
    const W = AI.STYLES[style];
    const me = game.players[pIdx], opp = game.players[1 - pIdx];
    if (cand.type === 'endTurn') return -1;
    if (cand.type === 'attack') {
      const atkr = game.findCard(cand.uid);
      const atk = game.atkOf(atkr);
      if (cand.target === 'face') return (atk * 1.2 + (opp.life <= atk ? 50 : 0)) * W.attack;
      const t = game.findCard(cand.target);
      const kill = atk >= game.hpOf(t), die = game.atkOf(t) >= game.hpOf(atkr);
      return ((kill ? AI.monsterThreat(game, t) : atk * 0.3) - (die ? game.atkOf(atkr) + game.hpOf(atkr) * 0.5 : 0)) * W.attack;
    }
    if (cand.type === 'ability') {
      let s = 2;
      (cand.targets || []).forEach(function (u) { const c = game.findCard(u); if (c && c.owner === pIdx) s += AI.lossBenefit(G.CardDB.get(c.defId)) - game.atkOf(c) * 0.5; });
      return s;
    }
    const def = G.CardDB.get(cand.defId);
    let s = AI.cardValue(def) - cand.cost * 0.3;
    if (G.Combos && G.Combos.isPartFor(game, pIdx, def.id)) s += 5 * W.combo;
    if (def.role === 'disrupt') {
      const tr = disruptTriggers(game, pIdx);
      s += tr ? (2 + tr * 2) * W.disrupt : -4 / W.disrupt;
    }
    if (def.type === 'field' && game.field && game.fieldOwner !== pIdx) s += 4 * W.threat;
    if (def.type === 'field' && game.field && game.fieldOwner === pIdx) s -= 6;
    if (def.type === 'monster' && def.keywords.indexOf('guard') >= 0 && incomingDamage(game, pIdx) >= me.life * 0.4) s += 4;
    return s;
  }

  function pickTargets(game, pIdx, def, inst, style, variants) {
    const spec = def.targets;
    const ctx = game.makeCtx(pIdx, inst);
    let cands;
    try { cands = ctx.candidatesFor(spec); } catch (e) { return []; }
    if (!cands.length) return spec.optional ? [[]] : [];
    if (spec.kind === 'player') {
      const chosen = AI.choosePick(spec, cands, game, pIdx, style);
      return [[chosen && chosen.idx === pIdx ? 'me' : 'opp']];
    }
    const count = spec.count || 1;
    const main = AI.choosePick(spec, cands, game, pIdx, style);
    const out = [];
    if (main.length || spec.optional) out.push(main.map(function (c) { return c.uid; }));
    if (variants && count === 1 && cands.length > 1) {
      const rest = cands.filter(function (c) { return main.indexOf(c) < 0; });
      const alt = AI.choosePick(spec, rest, game, pIdx, style);
      if (alt.length) out.push(alt.map(function (c) { return c.uid; }));
    }
    return out;
  }

  AI.candidates = function (game, pIdx, style, state) {
    const out = [];
    const p = game.players[pIdx];
    const blocked = (state && state.blocked) || {};
    game.getPlayable(pIdx).forEach(function (pl) {
      const inst = game.findCard(pl.uid);
      const def = G.CardDB.get(pl.defId);
      const choices = {};
      if (pl.needsX) choices.x = p.mana;
      let targetSets = [null];
      if (def.targets) { targetSets = pickTargets(game, pIdx, def, inst, style, true); if (!targetSets.length) return; }
      targetSets.forEach(function (ts) {
        const ch = Object.assign({}, choices);
        if (ts) ch.targets = ts;
        const c = { type: 'play', uid: pl.uid, defId: pl.defId, from: pl.from, cost: pl.cost, choices: ch, targetDefs: targetDefsOf(game, ts) };
        if (!blocked[sig(c)]) out.push(c);
      });
    });
    game.getAbilities(pIdx).forEach(function (ab) {
      let targets = [];
      if (ab.targets) {
        const insts = ab.targets.map(function (u) { return game.findCard(u); }).filter(Boolean);
        const def = G.CardDB.get(ab.defId);
        const spec = Object.assign({}, def.effects.ability.targets);
        const chosen = AI.choosePick(spec, insts, game, pIdx, style, insts.every(function (c) { return c.owner === pIdx; }) ? 'lose' : undefined);
        if (!chosen.length) return;
        targets = chosen.map(function (c) { return c.uid; });
      }
      const c = { type: 'ability', uid: ab.uid, defId: ab.defId, targets: targets, targetDefs: targetDefsOf(game, targets) };
      if (!blocked[sig(c)]) out.push(c);
    });
    game.getAttackers(pIdx).forEach(function (a) {
      const atkr = game.findCard(a.uid);
      if (a.targets.indexOf('face') >= 0) out.push({ type: 'attack', uid: a.uid, attackerDefId: a.defId, target: 'face' });
      let best = null, bestS = -Infinity;
      a.targets.forEach(function (t) {
        if (t === 'face') return;
        const m = game.findCard(t);
        if (!m) return;
        const kill = game.atkOf(atkr) >= game.hpOf(m), die = game.atkOf(m) >= game.hpOf(atkr);
        const s = (kill ? AI.monsterThreat(game, m) : 1) - (die ? game.atkOf(atkr) * 2 : 0);
        if (s > bestS) { bestS = s; best = m; }
      });
      if (best) out.push({ type: 'attack', uid: a.uid, attackerDefId: a.defId, target: best.uid });
    });
    out.push({ type: 'endTurn' });
    return out;
  };

  // Watchdog: a single action that fires more than RUNAWAY_EVENTS card plays (a card bug such as two
  // 盗み見の鏡 mirroring each other forever) is aborted so the AI turn, and the browser, survive.
  const RUNAWAY_EVENTS = 600;
  async function apply(game, pIdx, cand) {
    let n = 0;
    const watchdog = function () { if (++n > RUNAWAY_EVENTS) throw new Error('runaway effect aborted by AI watchdog'); };
    game.on('cardPlayed', watchdog);
    try {
      if (cand.type === 'play') return await game.playCard(pIdx, cand.uid, { choices: cand.choices });
      if (cand.type === 'ability') return await game.useAbility(pIdx, cand.uid, cand.targets);
      if (cand.type === 'attack') return await game.attack(pIdx, cand.uid, cand.target);
      return { ok: true };
    } finally { game.off('cardPlayed', watchdog); }
  }
  AI.apply = apply;

  function stateSize(game) {
    let n = 0;
    for (let i = 0; i < 2; i++) { const p = game.players[i]; G.Engine.Game.ZONES.forEach(function (z) { n += p[z].length; }); }
    return n;
  }

  // Simulate one candidate on a clone. Returns {score, decisive, bad}.
  async function simulate(game, pIdx, cand, style) {
    const g2 = game.clone();
    g2._sim = true; // effects that search themselves (願いの魔神) take a cheap path inside simulations
    const chooser = AI.makeChooser(style);
    g2.players[pIdx].chooser = chooser;
    g2.players[1 - pIdx].chooser = AI.makeChooser('disrupt');
    const oppBefore = g2.players[1 - pIdx];
    const lifeBefore = oppBefore.life, curseBefore = oppBefore.curse;
    let ok = true;
    try {
      const r = await apply(g2, pIdx, cand);
      if (r && r.ok === false) ok = false;
    } catch (e) { ok = false; }
    if (!ok) return { score: -Infinity, decisive: false, bad: true };
    const opp = g2.players[1 - pIdx];
    const dmg = lifeBefore - opp.life;
    const decisive = cand.type !== 'attack' && (g2.winner === pIdx || dmg >= Math.max(20, opp.maxLife * 0.4) || (opp.curse - curseBefore) >= opp.curseLimit * 0.5);
    let score = AI.evaluate(g2, pIdx, style);
    // Look past the end of turn (delayed discards like 夜明けの暴走炉, hand limit, timed cards firing,
    // reserves wearing off): blend in the position right after our endTurn + the opponent's turn start.
    if (g2.winner === null && g2.active === pIdx && g2.phase === 'main') {
      const g3 = g2.clone();
      g3.players[pIdx].chooser = chooser; g3.players[1 - pIdx].chooser = AI.makeChooser('disrupt');
      g3.players[pIdx].hazardTests = []; // no forecast side effects inside the simulation
      try { await g3.endTurn(pIdx); } catch (e) { /* ignore */ }
      if (g3.winner === 1 - pIdx) return { score: -Infinity, decisive: false, bad: true };
      if (g3.winner === null) score = score * 0.6 + AI.evaluate(g3, pIdx, style) * 0.4;
    }
    // Do not waste a combo finisher for a small effect: keep it for the real turn.
    if (cand.type === 'play' && !decisive && g2.winner === null && isFinisherCard(game, pIdx, cand.defId)) {
      const lifeShare = dmg / Math.max(1, lifeBefore);
      if (lifeShare < 0.25 && (opp.curse - curseBefore) < opp.curseLimit * 0.25) score -= 10 * AI.STYLES[style].combo;
    }
    return { score: score, decisive: decisive, bad: g2.winner === 1 - pIdx, winner: g2.winner, dmg: dmg };
  }
  AI.simulate = simulate;
  function isFinisherCard(game, pIdx, defId) {
    const def = G.CardDB.get(defId);
    return def.role === 'finisher' || def.tags.indexOf('finisher') >= 0 || (G.Combos && G.Combos.isFinisherFor(game, pIdx, defId));
  }

  // ---- loop handling ------------------------------------------------------------
  // Decide what to do with a detected loop. Returns true if the loop was run.
  async function handleLoop(game, pIdx, state, style, forecasted, onStep) {
    const det = game.loop.detected;
    if (!det || det.who !== pIdx) return false;
    // sample one iteration to learn what the loop produces
    const g2 = game.clone();
    g2.players[pIdx].chooser = AI.makeChooser(style);
    const me0 = g2.players[pIdx], opp0 = g2.players[1 - pIdx];
    const before = { life: opp0.life, curse: opp0.curse, mana: me0.mana, hand: me0.hand.length, phantoms: me0.phantoms.length, deck: me0.deck.length };
    let r;
    try { r = await g2.runLoop(pIdx, 1); } catch (e) { r = { iterations: 0 }; }
    const me1 = g2.players[pIdx], opp1 = g2.players[1 - pIdx];
    const lethalLoop = r.iterations > 0 && (opp1.life < before.life || opp1.curse > before.curse || opp1.deck.length < opp0.deck.length);
    const gainLoop = r.iterations > 0 && (me1.mana > before.mana || me1.hand.length > before.hand || me1.phantoms.length > before.phantoms);
    const hasExit = lethalLoop || game.players[pIdx].hand.some(function (c) { const d = G.CardDB.get(c.defId); return d.role === 'finisher' || d.tags.indexOf('finisher') >= 0 || (G.Combos && G.Combos.isFinisherFor(game, pIdx, d.id)); });
    if (!r.iterations || !hasExit || !forecasted) {
      if (hasExit && !forecasted) state.lethalBlocked = true;
      // do not keep cycling by hand: block the cycle's actions for the rest of the turn
      det.cycle.forEach(function (a) { state.blocked[sig(a)] = true; });
      game.clearLoop();
      return false;
    }
    const opp = game.players[1 - pIdx];
    let times = 'inf';
    if (!lethalLoop) times = Math.min(300, Math.max(10, opp.life + opp.maxMana + 10));
    // A loop that draws (e.g. 永劫の書 + 火種) is bounded by our own deck: stop while one card is left for
    // the next draw step, unless the loop wins first (then the deck no longer matters).
    const deckCost = before.deck - me1.deck.length;
    if (deckCost > 0 && g2.winner !== pIdx) {
      const cap = Math.floor((game.players[pIdx].deck.length - 1) / deckCost);
      if (cap < 1) {
        det.cycle.forEach(function (a) { state.blocked[sig(a)] = true; });
        game.clearLoop();
        return false;
      }
      times = times === 'inf' ? cap : Math.min(times, cap);
    }
    const res = await game.runLoop(pIdx, times);
    state.actions += 1;
    state.loopsRun = (state.loopsRun || 0) + 1;
    if (res.reason === 'overflow' && game.winner === null) game.declareLoopWin(pIdx);
    if (onStep) { const pr = onStep({ type: 'loop', iterations: res.iterations, reason: res.reason, game: game }); if (pr && typeof pr.then === 'function') await pr; }
    // the loop has done its job this turn: stop cycling by hand and move on to the finisher
    det.cycle.forEach(function (a) { state.blocked[sig(a)] = true; });
    game.clearLoop();
    return true;
  }

  // ---- enrage --------------------------------------------------------------------
  AI.checkEnrage = function (game, pIdx) {
    const def = enemyDefOf(game, pIdx);
    const p = game.players[pIdx];
    if (!def || !def.enrage || p.flags.enraged) return false;
    const th = p.flags.enrageThreshold || (p.chooser && p.chooser.enrageThreshold) || def.enrage.threshold || 0.5;
    if (p.life > p.maxLife * th) return false;
    p.flags.enraged = true;
    game.addLog('【発狂】' + def.name + '：' + (def.enrage.text || ''));
    try { if (typeof def.enrage.apply === 'function') def.enrage.apply(game, pIdx); } catch (e) { game.addLog('発狂の適用に失敗: ' + e.message); }
    game.emit('enrage', { who: pIdx, text: def.enrage.text || '' });
    return true;
  };

  // ---- the turn -------------------------------------------------------------------
  async function step(game, onStep, info) {
    if (onStep) { const r = onStep(info); if (r && typeof r.then === 'function') await r; }
    else if (game.options.aiStepDelay > 0) await new Promise(function (res) { setTimeout(res, game.options.aiStepDelay); });
  }

  AI.takeTurn = async function (game, pIdx, opts) {
    opts = opts || {};
    const onStep = opts.onStep || null;
    const p = game.players[pIdx];
    if (game.winner !== null || game.active !== pIdx) return { ok: false, reason: 'notYourTurn' };
    const style = opts.style || AI.styleOf(game, pIdx);
    if (!p.chooser || p.chooser === G.Engine.defaultChooser || p.chooser === G.Engine.Game.defaultChooser) {
      p.chooser = AI.makeChooser(style);
    }
    AI.ensureHazard(game, pIdx);
    AI.checkEnrage(game, pIdx);
    const forecasted = game.isForecasted(pIdx);
    p.flags.aiLethalBlocked = false;
    const mistake = AI.mistakeRateOf(game, pIdx);
    const maxSims = game.options.aiMaxSims != null ? game.options.aiMaxSims : 60;
    const maxCands = game.options.aiMaxCandidates != null ? game.options.aiMaxCandidates : 12;
    const state = { actions: 0, sims: 0, blocked: {}, lethalBlocked: false, forecasted: forecasted };
    const rng = aiRng(game);
    const big = stateSize(game) > 160;

    while (game.winner === null && game.active === pIdx && game.phase === 'main' && state.actions < MAX_ACTIONS) {
      if (game.loop.detected && game.loop.detected.who === pIdx && !game.loop.running) {
        const ran = await handleLoop(game, pIdx, state, style, forecasted, onStep);
        if (ran) continue;
      }
      let cands = AI.candidates(game, pIdx, style, state);
      const base = AI.evaluate(game, pIdx, style);
      const ready = assembledCombos(game, pIdx);
      cands.forEach(function (c) { c.crank = comboCrank(game, pIdx, c, ready, forecasted); c.prior = prior(game, pIdx, c, style) + c.crank; });
      cands.sort(function (a, b) { return b.prior - a.prior; });
      if (cands.length > maxCands) {
        const end = cands.find(function (c) { return c.type === 'endTurn'; });
        cands = cands.slice(0, maxCands);
        if (end && cands.indexOf(end) < 0) cands.push(end);
      }
      // score
      for (let i = 0; i < cands.length; i++) {
        const c = cands[i];
        if (c.type === 'endTurn') { c.score = base - 0.5; c.decisive = false; continue; }
        const canSim = !big && state.sims < maxSims;
        if (canSim) {
          state.sims++;
          const r = await simulate(game, pIdx, c, style);
          c.score = r.bad ? -Infinity : r.score + c.crank * AI.STYLES[style].combo;
          c.decisive = r.decisive;
          c.simulated = true;
        } else {
          c.score = base + c.prior;
          const def = c.type === 'play' ? G.CardDB.get(c.defId) : null;
          // without a simulation, treat finisher-role plays as potentially decisive (conservative)
          c.decisive = !!(def && (def.role === 'finisher' || def.tags.indexOf('finisher') >= 0 || (G.Combos && G.Combos.isFinisherFor(game, pIdx, def.id))) && c.type !== 'attack');
        }
        if (c.decisive && !forecasted) { c.forbidden = true; state.lethalBlocked = true; }
      }
      const legal = cands.filter(function (c) { return !c.forbidden && c.score > -Infinity; });
      legal.sort(function (a, b) { return b.score - a.score; });
      let choice = legal[0] || cands.find(function (c) { return c.type === 'endTurn'; });
      // deliberate mistakes: sometimes take the 2nd/3rd best non-decisive option
      if (mistake > 0 && legal.length > 1 && rng.chance(mistake)) {
        // ...but never a catastrophic one (e.g. drawing the deck empty)
        const alt = legal.slice(1, 3).filter(function (c) { return !c.decisive && c.score > legal[0].score - 100; });
        if (alt.length) choice = rng.pick(alt);
      }
      if (!choice || choice.type === 'endTurn') break;
      // Safety: an unsimulated pick (sim budget exhausted / big state) is verified once before it is
      // applied, so the AI never decks itself out or wins without a forecast by accident.
      if (!choice.simulated && choice.type !== 'attack') {
        const v = await simulate(game, pIdx, choice, style);
        choice.simulated = true;
        // also refuse a pick that turns out worse than simply ending the turn (e.g. cantrips drawing the
        // deck empty) once the sim budget is spent and it was ranked by prior alone
        if (v.bad || (v.decisive && !forecasted) || v.score < base - 1) {
          if (v.decisive && !forecasted) state.lethalBlocked = true;
          state.blocked[sig(choice)] = true;
          continue;
        }
      }
      let res;
      try { res = await apply(game, pIdx, choice); }
      catch (e) { game.addLog('AIの行動でエラー: ' + (e && e.message)); res = { ok: false }; }
      state.actions++;
      if (res && res.ok === false) { state.blocked[sig(choice)] = true; continue; }
      await step(game, onStep, { type: choice.type, action: choice, game: game });
      if (game.winner !== null) return { ok: true, over: true };
    }
    if (game.winner !== null) return { ok: true, over: true };
    if (game.active !== pIdx || game.phase !== 'main') return { ok: true };
    // forecast decision at turn end
    if (state.lethalBlocked) p.flags.aiLethalBlocked = true;
    const hz = game.hazard(pIdx);
    if (hz >= 100) {
      const def = enemyDefOf(game, pIdx);
      game.setForecast(pIdx, true, def ? def.forecastText : undefined);
    } else if (game.isForecasted(pIdx)) game.setForecast(pIdx, false);
    await game.endTurn(pIdx);
    await step(game, onStep, { type: 'endTurn', game: game });
    return { ok: true, actions: state.actions, sims: state.sims, forecast: hz >= 100 };
  };

  // ---- enemy → player config -------------------------------------------------------
  AI.defaultDepthModifiers = function (depth) {
    depth = depth || 0;
    return {
      normalLifeMul: depth >= 1 ? 1.25 : 1, eliteLifeMul: 1, bossLifeMul: depth >= 5 ? 1.5 : 1,
      mistakeMul: depth >= 7 ? 0.5 : 1, eliteRelics: depth >= 8 ? 2 : 1, bossExtraRelics: depth >= 10 ? 1 : 0,
      enrageThreshold: depth >= 9 ? 0.65 : null
    };
  };

  function resolveNames(names, kind, warn) {
    const out = [];
    (names || []).forEach(function (n) {
      const id = kind === 'relic' ? AI.relicId(n) : AI.cardId(n);
      if (id) out.push(id); else if (warn) warn(kind + ' not found: ' + n);
    });
    return out;
  }
  AI.warn = function (msg) { if (typeof console !== 'undefined' && console.warn && !AI.quiet) console.warn('[AI] ' + msg); };

  // Build a deck (ids) from [{name, n}] specs; missing cards → 見習いの火球 (basic_01) or skipped.
  AI.buildDeck = function (spec, opts) {
    opts = opts || {};
    const out = [], missing = [];
    const fallback = G.CardDB.has('basic_01') ? 'basic_01' : null;
    (spec || []).forEach(function (e) {
      const id = AI.cardId(e.name);
      const n = e.n || 1;
      for (let i = 0; i < n; i++) {
        if (id) out.push(id);
        else if (fallback) out.push(fallback);
      }
      if (!id) missing.push(e.name);
    });
    if (missing.length && !opts.silent) AI.warn('deck cards missing (' + (fallback ? 'substituted basic_01' : 'skipped') + '): ' + missing.join('、'));
    return out;
  };

  // Fill the lazily resolved fields of an EnemyDef (deck ids, relic ids, field id). Idempotent.
  AI.resolveEnemy = function (def) {
    const desc = Object.getOwnPropertyDescriptor(def, 'deck');
    if (def.deckSpec && !(desc && desc.get) && (!def.deck.length || def._deckCount !== G.CardDB.count())) {
      def.deck = AI.buildDeck(def.deckSpec, { silent: def._deckCount !== undefined });
      def._deckCount = G.CardDB.count();
    }
    if (def.fieldName) def.field = AI.cardId(def.fieldName) || null;
    if (def.relicNames) def.relics = resolveNames(def.relicNames, 'relic', def._relicsWarned ? null : AI.warn);
    def._relicsWarned = true;
    return def;
  };
  AI.resolveEnemies = function () { G.EnemyDB.all().forEach(AI.resolveEnemy); };

  AI.enemyPlayerConfig = function (def, opts) {
    opts = opts || {};
    if (typeof def === 'string') def = G.EnemyDB.get(def);
    AI.resolveEnemy(def);
    const depth = opts.depth || 0;
    const mods = Object.assign(AI.defaultDepthModifiers(depth), (G.Depth && typeof G.Depth.modifiers === 'function') ? (G.Depth.modifiers(depth) || {}) : {});
    const rng = opts.rng || new G.RNG(opts.seed != null ? opts.seed : (Date.now() >>> 0));
    let deck = def.deck.slice(), residual = [], style = def.style;
    if (typeof def.deckBuilder === 'function') {
      const built = def.deckBuilder(opts.playerDeckIds || [], opts.prevRunDeckIds || [], rng, opts);
      deck = Array.isArray(built) ? built : built.deck;
      residual = (built && built.residual) || [];
      if (built && built.style) style = built.style;
    }
    let relics = def.relics.slice();
    if (def.copyPlayerRelics && opts.playerRelics) relics = opts.playerRelics.slice().concat(relics);
    const tier = def.tier || def.kind || 'normal';
    const lifeMul = tier === 'boss' ? (mods.bossLifeMul || 1) : tier === 'elite' ? (mods.eliteLifeMul || 1) : (mods.normalLifeMul || 1);
    const life = Math.round(def.life * lifeMul);
    const mistakeRate = (typeof def.mistakeRate === 'number' ? def.mistakeRate : (tier === 'boss' ? 0 : tier === 'elite' ? 0.1 : 0.2)) * (mods.mistakeMul != null ? mods.mistakeMul : 1);
    const extraRelics = tier === 'elite' ? Math.max(0, (mods.eliteRelics || 1) - 1) : tier === 'boss' ? (mods.bossExtraRelics || 0) : 0;
    if (extraRelics > 0) {
      const pool = G.RelicDB.filter(function (r) { return !r.hidden && r.category !== 'boss' && r.category !== 'enemy' && r.category !== 'cursed' && relics.indexOf(r.id) < 0; });
      for (let i = 0; i < extraRelics && pool.length; i++) { const r = pool.splice(rng.int(pool.length), 1)[0]; relics.push(r.id); }
    }
    const chooser = AI.makeChooser(style);
    chooser.aiStyle = style; chooser.aiMistakeRate = mistakeRate; chooser.residualIds = residual.slice();
    chooser.enrageThreshold = mods.enrageThreshold || null;
    return {
      deck: deck, relics: relics, life: life, isAI: true, name: def.name, enemyDefId: def.id, chooser: chooser,
      hazardTests: def.hazard.concat([AI.lethalBlockedTest]), field: def.field || null,
      mistakeRate: mistakeRate, style: style, residualIds: residual, depth: depth
    };
  };
})(globalThis.G = globalThis.G || {});
