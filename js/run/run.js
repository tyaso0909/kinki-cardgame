(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // js/run/run.js — G.Run: the roguelike run state machine (DOM-free).
  //
  //   G.Run.startNew({depth, festival, seed}) → 'packopen'
  //   G.Run.resume() → screen name | null          G.Run.state (JSON) / save() / abandon()
  //   pack opening: packOffer() / openChosenPack(type) → {cards, step, done} / relicOffer() / chooseStarterRelic(id) → 'map'
  //   map:  map() / availableNodes() / currentNode() / goTo(nodeId) → screen / nodeInfo(id)
  //   battle: beginBattle(enemyId, {elite, boss, rewardMul, returnTo}) → {game, enemyDef}
  //           startBattle = beginBattle;  finishBattle(result) → screen ('reward'|'map'|'runend')
  //   reward: reward() / takeRewardCard(defId|null) / takeRewardPack(type) / takeBossRelic(id) / takeTaboo(id|null) / takeAux(bool) / finishReward() → screen
  //   shop:   shop() / leaveShop() ;  rest: restOptions() / rest('heal'|'remove', defId) → 'map'
  //   event:  event() / eventCandidates(optIdx) / resolveEvent(optIdx, choice) → result / leaveEvent() → screen
  //   deck:   addCard / removeCard / sellCard / addRelic / removeRelic / gold(n) / heal(n) / life() / maxLife() / runEffects()
  //   endRun({won}) → summary ;  nextScreen() → screen for the current phase ;  rng() → G.RNG (persisted)
  //
  // Phases: packopen → map ⇄ (battle → reward) | shop | event | rest → … → runend
  // ---------------------------------------------------------------
  const Run = G.Run = G.Run || {};
  const LINEAGES = ['accel', 'cycle', 'chain', 'time', 'copy', 'doom'];
  const PLAYER_LIFE = 40;
  // QA tuning (docs/DEVIATIONS.md「QA tuning」): life carried over between battles with no healing made
  // act 1 a war of attrition. A won normal/elite battle heals 20% of max life; beating a boss heals fully.
  Run.POST_BATTLE_HEAL_RATE = 0.2;

  let R = null; // live RNG (synced to state.rngState on save)
  Run.state = null;

  // ---- helpers -------------------------------------------------------------------------------
  function S() { if (!Run.state) throw new Error('Run: no active run'); return Run.state; }
  function meta() { try { return G.Save && G.Save.meta ? G.Save.meta() : null; } catch (e) { return null; } }
  function metaHook(name) {
    if (!G.Meta || typeof G.Meta[name] !== 'function') return undefined;
    try { return G.Meta[name].apply(G.Meta, Array.prototype.slice.call(arguments, 1)); } catch (e) { warn('Meta.' + name + ' failed: ' + (e && e.message)); }
  }
  function warn(msg) { if (typeof console !== 'undefined' && console.warn && !Run.quiet) console.warn('[run] ' + msg); }
  function codexMark(kind, id) {
    // Codex is owned by the meta agent; when G.Meta is absent we still record the entry in the save.
    if (G.Meta) return;
    try { G.Save.updateMeta(function (m) { m.codex[kind][id] = true; }); } catch (e) { /* ignore */ }
  }
  Run.rng = function () {
    if (!R) { const st = Run.state && Run.state.rngState; R = st ? G.RNG.fromState(st) : new G.RNG(Run.state ? Run.state.seed : undefined); }
    return R;
  };
  Run.depthMods = function () { return G.RunCommon.depthMods(Run.state ? Run.state.depth : 0); };
  Run.runEffects = function () { return G.Data.runEffectsOf(S().relics); };
  Run.save = function () {
    if (!Run.state) return false;
    if (R) Run.state.rngState = R.state();
    try { return G.Save && G.Save.saveRun ? G.Save.saveRun(Run.state) : false; } catch (e) { warn('save failed: ' + e.message); return false; }
  };
  Run.abandon = function () { Run.state = null; R = null; try { if (G.Save) G.Save.clearRun(); } catch (e) { /* ignore */ } };

  // ---- start / resume -------------------------------------------------------------------------
  Run.startNew = function (opts) {
    opts = opts || {};
    const m = meta();
    const depth = opts.depth != null ? opts.depth : (m ? m.depth || 0 : 0);
    const festival = opts.festival || null;
    const seed = opts.seed != null ? (opts.seed >>> 0) : (festival && festival.seed != null ? (festival.seed >>> 0) : ((Date.now() ^ (Math.floor(Math.random() * 0xffffffff))) >>> 0));
    R = new G.RNG(seed);
    const mods = G.RunCommon.depthMods(depth);
    let maxLife = PLAYER_LIFE;
    Run.state = {
      version: 1, seed: seed, rngState: R.state(), depth: depth, festival: festival ? { id: festival.id, name: festival.name, rules: festival.rules || {} } : null,
      startedAt: Date.now(), phase: 'packopen', act: 1, map: null, position: null, visited: [],
      deck: [], relics: [], gold: 0, life: maxLife, maxLife: maxLife,
      flags: { usedEvents: [], ev: {} }, pending: {}, history: [],
      stats: { battles: 0, wins: 0, elitesBeaten: 0, bossesBeaten: 0, goldEarned: 0, cardsPlayed: 0, cardUse: {}, maxDamageOneTurn: 0, maxChain: 0, longestLoop: 0, turns: 0, packsOpened: 0, eventsSeen: 0 },
      packopen: { step: 0, offer: null, opened: [], openedTypes: [], relicOffer: null, chosenRelic: null }
    };
    const st = Run.state;
    if (mods.startCursedRelic) {
      const cursed = G.Data.relicsBy('cursed');
      if (cursed.length) st.relics.push(R.pick(cursed).id);
    }
    if (festival && festival.rules && festival.rules.startTaboo) {
      const taboo = G.Data.tabooCards();
      if (taboo.length) st.deck.push(R.pick(taboo).id);
    }
    if (festival && festival.rules && festival.rules.doubleLife) { st.maxLife = maxLife * 2; st.life = st.maxLife; }
    st.packopen.offer = G.Packs.offer(R, { count: mods.packChoices || 3, meta: m, festival: festival, exclude: ['disrupt'] });   // 1パック目に妨害パックは出さない
    try { if (G.Save) G.Save.updateMeta(function (mm) { mm.runsStarted = (mm.runsStarted || 0) + 1; }); } catch (e) { /* ignore */ }
    Run.save();
    return 'packopen';
  };

  Run.resume = function () {
    if (!G.Save || !G.Save.loadRun) return null;
    const st = G.Save.loadRun();
    if (!st) return null;
    Run.state = st; R = null; Run.rng();
    return Run.nextScreen();
  };
  Run.nextScreen = function () {
    const st = Run.state; if (!st) return null;
    switch (st.phase) {
      case 'packopen': return 'packopen';
      case 'map': return 'map';
      case 'battle': return st.pending.battle ? 'battle' : 'map';
      case 'reward': return st.pending.reward ? 'reward' : 'map';
      case 'shop': return st.pending.shop ? 'shop' : 'map';
      case 'event': return st.pending.event ? 'event' : 'map';
      case 'rest': return 'rest';
      case 'runend': return 'runend';
      default: return 'map';
    }
  };

  // ---- pack opening (initial deck) --------------------------------------------------------------
  Run.packOffer = function () { const po = S().packopen; return po.offer ? po.offer.slice() : []; };
  Run.openChosenPack = function (type) {
    const st = S(), po = st.packopen;
    if (st.phase !== 'packopen') throw new Error('Run: not in pack opening');
    if (po.step >= G.Packs.INITIAL_PACKS) throw new Error('Run: all packs opened');
    if (po.offer && po.offer.indexOf(type) < 0) throw new Error('Run: pack not offered: ' + type);
    const last = po.step === G.Packs.INITIAL_PACKS - 1;
    const guarantee = last && !G.Packs.hasFinisher(st.deck);
    const cards = G.Packs.openPack(type, Run.rng(), { guaranteeFinisher: guarantee });
    cards.forEach(function (id) { Run.addCard(id, { source: 'pack', silent: true }); });
    if (type === 'taboo') Run.addRelic(randomCursed(), { source: 'pack' });
    po.opened.push({ type: type, cards: cards.slice() });
    po.openedTypes.push(type);
    po.step++;
    st.stats.packsOpened++;
    const done = po.step >= G.Packs.INITIAL_PACKS;
    po.offer = done ? null : G.Packs.offer(Run.rng(), { count: Run.depthMods().packChoices || 3, meta: meta(), festival: st.festival });
    if (done) po.relicOffer = G.Packs.starterRelicOffer(po.openedTypes, Run.rng());
    Run.save();
    return { cards: cards, step: po.step, done: done, guaranteed: guarantee };
  };
  Run.relicOffer = function () { const po = S().packopen; return po.relicOffer ? po.relicOffer.slice() : []; };
  Run.chooseStarterRelic = function (relicId) {
    const st = S(), po = st.packopen;
    if (!po.relicOffer || po.relicOffer.indexOf(relicId) < 0) throw new Error('Run: relic not offered');
    Run.addRelic(relicId, { source: 'starter' });
    po.chosenRelic = relicId;
    metaHook('onRunStart', { seed: st.seed, packs: po.openedTypes.slice(), relic: relicId, depth: st.depth, festival: st.festival });
    startAct(1);
    return 'map';
  };
  function randomCursed() { const c = G.Data.relicsBy('cursed'); return c.length ? Run.rng().pick(c).id : null; }

  // ---- map ---------------------------------------------------------------------------------------
  function startAct(act) {
    const st = S();
    st.act = act;
    st.map = G.RunMap.generate({ act: act, rng: Run.rng(), eliteExtra: Run.depthMods().eliteExtra || 0 });
    st.position = null; st.visited = [];
    st.phase = 'map'; st.pending = {};
    st.history.push({ t: 'act', act: act, boss: st.map.bossEnemyId });
    Run.save();
  }
  Run.map = function () { return S().map; };
  Run.currentNode = function () { const st = S(); return st.position ? st.map.nodes[st.position] : null; };
  Run.availableNodes = function () {
    const st = S();
    if (!st.map || st.phase !== 'map') return [];
    if (!st.position) return st.map.rows[0].slice();
    return st.map.nodes[st.position].next.slice();
  };
  Run.bossOfAct = function () { const st = S(); return st.map ? G.EnemyDB.tryGet(st.map.bossEnemyId) : null; };
  // What the map shows for a node (嘘つきの地図 → ？ for fogged nodes).
  Run.nodeInfo = function (id) {
    const st = S(), nd = st.map.nodes[id];
    const fog = !!(nd.fog && Run.runEffects().mapFog && st.visited.indexOf(id) < 0);
    return { id: nd.id, row: nd.row, col: nd.col, type: fog ? 'unknown' : nd.type, fog: fog, label: fog ? '？' : G.RunMap.TYPE_LABEL[nd.type], enemyId: fog ? null : nd.enemyId || null,
      visited: st.visited.indexOf(id) >= 0, current: st.position === id, available: Run.availableNodes().indexOf(id) >= 0 };
  };
  Run.goTo = function (nodeId) {
    const st = S();
    if (Run.availableNodes().indexOf(nodeId) < 0) throw new Error('Run: node not reachable: ' + nodeId);
    const nd = st.map.nodes[nodeId];
    st.position = nodeId; st.visited.push(nodeId);
    st.history.push({ t: 'node', id: nodeId, type: nd.type });
    switch (nd.type) {
      case 'battle': return queueBattle(nd.enemyId, { elite: false, boss: false, rewardMul: 1 });
      case 'elite': return queueBattle(nd.enemyId, { elite: true, boss: false, rewardMul: 1 });
      case 'boss': return queueBattle(nd.enemyId, { elite: false, boss: true, rewardMul: 1 });
      case 'shop': st.phase = 'shop'; st.pending = { shop: G.Shop.generate(st, Run.rng()) }; Run.save(); return 'shop';
      case 'rest': st.phase = 'rest'; st.pending = {}; Run.save(); return 'rest';
      case 'event': return queueEvent();
    }
    throw new Error('Run: unknown node type ' + nd.type);
  };
  function queueBattle(enemyId, opts) {
    const st = S();
    st.phase = 'battle';
    const here = Run.currentNode();
    st.pending = { battle: { enemyId: enemyId, elite: !!opts.elite, boss: !!opts.boss, rewardMul: opts.rewardMul || 1, returnTo: opts.returnTo || null, row: here ? here.row || 0 : 0, seed: Run.rng().int(0x7fffffff) } };
    Run.save();
    return 'battle';
  }

  // ---- battle ------------------------------------------------------------------------------------
  // Hidden relic for the festival rule 敵も味方もライフが2倍、ダメージも2倍.
  if (G.RelicDB && !G.RelicDB.has('_fx_festival_double_damage')) {
    G.RelicDB.register({ id: '_fx_festival_double_damage', name: 'お祭り：倍のダメージ', text: 'すべてのダメージが2倍になる', hidden: true, category: 'hidden', rarity: 'common',
      effects: { scope: 'any', modDamage: function (ctx, ev) { return ev.isPlayer && ev.target.idx === ctx.owner.idx ? ev.amount * 2 : ev.amount; } } });
  }
  Run.pendingBattle = function () { return S().pending.battle || null; };
  // Enemy life ramps up along the act's map: +6% per map row for normal enemies and elites (row 0 = ×1.0,
  // row 5 = ×1.3). Bosses are fixed. Depth multipliers (G.Depth.modifiers) and festival doubleLife apply on top.
  Run.ROW_LIFE_RAMP = 0.06;
  Run.rowLifeMul = function (def, row) { return def && (def.kind === 'boss' || def.isBoss) ? 1 : 1 + Run.ROW_LIFE_RAMP * Math.max(0, row || 0); };
  // The life an enemy will actually have in this run at this map row (used by battles and map previews).
  Run.enemyLife = function (enemyIdOrDef, row) {
    const def = typeof enemyIdOrDef === 'string' ? G.EnemyDB.get(enemyIdOrDef) : enemyIdOrDef;
    const st = S();
    const mods = G.Depth && G.Depth.modifiers ? G.Depth.modifiers(st.depth || 0) : {};
    const tier = def.tier || def.kind || 'normal';
    const depthMul = tier === 'boss' ? (mods.bossLifeMul || 1) : tier === 'elite' ? (mods.eliteLifeMul || 1) : (mods.normalLifeMul || 1);
    let life = Math.round(Math.round(def.life * depthMul) * Run.rowLifeMul(def, row));
    if (st.festival && st.festival.rules && st.festival.rules.doubleLife) life *= 2;
    return life;
  };
  Run.beginBattle = function (enemyId, opts) {
    const st = S();
    opts = opts || {};
    let pb = st.pending.battle;
    if (!pb || pb.enemyId !== enemyId) { queueBattle(enemyId, opts); pb = st.pending.battle; }
    const edef = G.EnemyDB.get(enemyId);
    const m = meta();
    const fx = Run.runEffects();
    const rules = (st.festival && st.festival.rules) || {};
    const playerRelics = st.relics.filter(function (id) { const r = G.RelicDB.tryGet(id); return r && !r.hidden; });
    const enemyCfg = G.AI.enemyPlayerConfig(edef, { act: st.act, depth: st.depth, playerDeckIds: st.deck.slice(), prevRunDeckIds: (m && m.lastRunDeck) || [], playerRelics: playerRelics, seed: pb.seed });
    const human = { name: 'あなた', isAI: false, deck: st.deck.slice(), relics: st.relics.slice(), life: st.life, maxLife: st.maxLife };
    enemyCfg.life = Math.round(enemyCfg.life * Run.rowLifeMul(edef, pb.row));
    if (rules.doubleLife) { enemyCfg.life *= 2; human.relics.push('_fx_festival_double_damage'); enemyCfg.relics = enemyCfg.relics.concat(['_fx_festival_double_damage']); }
    const options = { fieldOwner: 1 };
    if (st.flags.nextBattleFirst) options.firstPlayer = 0;
    const game = G.Engine.createGame({ seed: pb.seed, players: [human, enemyCfg], field: enemyCfg.field || null, options: options, turnLimit: opts.turnLimit || null });
    if (st.flags.nextBattleHandBonus) game.players[0].flags.initialHand = (game.options.initialHand || 5) + 1;
    if (rules.allCostZero) { game.setStatus(0, 'allCostsZero', true); game.setStatus(1, 'allCostsZero', true); }
    delete st.flags.nextBattleFirst; delete st.flags.nextBattleHandBonus;
    // stats: per-card use
    game.on('cardPlayed', function (ev) {
      if (ev.who !== 0 || ev.isCopy) return;
      st.stats.cardUse[ev.defId] = (st.stats.cardUse[ev.defId] || 0) + 1;
      st.stats.cardsPlayed++;
    });
    pb.started = true;
    metaHook('onBattleStart', game, { enemyDef: edef, act: st.act, run: st, playerIdx: 0 });
    Run.save();
    return { game: game, enemyDef: edef, elite: pb.elite, boss: pb.boss, rewardMul: pb.rewardMul, hideHazard: !!fx.hideHazard, revealEnemyHand: fx.revealEnemyHand || 0 };
  };
  Run.startBattle = Run.beginBattle;

  Run.finishBattle = function (result) {
    const st = S();
    const pb = st.pending.battle || {};
    const game = result.game;
    const edef = G.EnemyDB.tryGet(pb.enemyId) || null;
    const won = !!result.won;
    const draw = !won && result.winner == null && result.reason === 'turnLimit';
    // vault / stolen cards return to the deck (the run deck is a def list; make sure nothing is missing)
    let restored = [];
    if (game) {
      try { restored = G.Data.restoreVault(game)[0] || []; } catch (e) { warn('restoreVault failed: ' + e.message); }
      const have = st.deck.slice();
      restored.forEach(function (id) { const i = have.indexOf(id); if (i >= 0) have.splice(i, 1); else st.deck.push(id); });
    }
    // stats
    const p0 = game ? game.players[0] : null;
    const gs = (game && game.stats) || {};
    st.stats.battles++;
    st.stats.turns += result.turns || (game ? game.turn : 0);
    if (won) st.stats.wins++;
    if (p0) st.stats.maxDamageOneTurn = Math.max(st.stats.maxDamageOneTurn, p0.maxDamageDealtOnce || 0, (result.stats && result.stats.maxDamageOneTurn) || 0);
    st.stats.maxChain = Math.max(st.stats.maxChain, gs.maxChain || 0, (p0 && p0.stats.maxChain) || 0);
    st.stats.longestLoop = Math.max(st.stats.longestLoop, gs.longestLoop || 0);
    if (edef) { st.history.push({ t: 'battle', enemy: edef.id, won: won, turns: result.turns }); if (won) codexMark('enemies', edef.id); }
    if (draw) {
      if (p0) st.life = Math.max(1, Math.min(st.maxLife, p0.life));
    } else if (won) {
      if (p0) st.life = Math.max(1, Math.min(st.maxLife, p0.life));
      if (pb.elite) st.stats.elitesBeaten++;
      if (pb.boss) st.stats.bossesBeaten++;
      if (pb.boss) st.life = st.maxLife;
      else if (Run.POST_BATTLE_HEAL_RATE > 0) Run.heal(Math.round(st.maxLife * Run.POST_BATTLE_HEAL_RATE));
      const fx = Run.runEffects();
      if (fx.healAfterBattle) Run.heal(fx.healAfterBattle);
    } else {
      st.life = 0;
    }
    const metaOut = metaHook('onBattleEnd', Object.assign({}, result, { stats: Object.assign({}, result.stats || {}, { won: won, reason: result.reason }) }), { enemyDef: edef, act: st.act, run: st });
    if (metaOut && metaOut.newAchievements && metaOut.newAchievements.length) st.flags.lastAchievements = metaOut.newAchievements.slice();
    if (draw) { st.phase = 'map'; st.pending = {}; Run.save(); return 'map'; }
    if (!won) { st.pending = {}; return finishRun(false, 'defeat'); }
    // rewards
    const reward = G.Rewards.forBattle(st, { enemyDef: edef, elite: pb.elite, boss: pb.boss, rewardMul: pb.rewardMul || 1, rng: Run.rng() });
    reward.returnTo = pb.returnTo || null;
    if (st.flags.lastAchievements) { reward.achievements = st.flags.lastAchievements; delete st.flags.lastAchievements; }
    st.phase = 'reward'; st.pending = { reward: reward };
    Run.save();
    return 'reward';
  };

  // ---- reward -----------------------------------------------------------------------------------------
  Run.reward = function () { return S().pending.reward || null; };
  function rw() { const r = S().pending.reward; if (!r) throw new Error('Run: no pending reward'); return r; }
  Run.takeRewardGold = function () { const r = rw(); if (r.goldTaken) return 0; r.goldTaken = true; Run.gold(r.gold); Run.save(); return r.gold; };
  Run.takeRewardCard = function (defId) {
    const r = rw(); if (r.cardTaken) return null; r.cardTaken = true;
    if (defId) { if ((r.cards || []).indexOf(defId) < 0) throw new Error('Run: card not offered'); Run.addCard(defId, { source: 'reward' }); r.cardChosen = defId; }
    Run.save(); return defId || null;
  };
  Run.takeRewardPack = function (type) {
    const r = rw(); if (r.packTaken) return null;
    if ((r.packs || []).indexOf(type) < 0) throw new Error('Run: pack not offered');
    r.packTaken = true; r.packChosen = type;
    r.packCards = Run.openPackIntoDeck(type);
    Run.save(); return r.packCards;
  };
  Run.takeRewardRelic = function () { const r = rw(); if (r.relicTaken || !r.relic) return null; r.relicTaken = true; Run.addRelic(r.relic, { source: 'reward' }); Run.save(); return r.relic; };
  Run.takeBossRelic = function (id) {
    const r = rw(); if (r.bossRelicTaken) return null;
    if ((r.bossRelics || []).indexOf(id) < 0) throw new Error('Run: boss relic not offered');
    r.bossRelicTaken = true; r.bossRelicChosen = id; Run.addRelic(id, { source: 'boss' }); Run.save(); return id;
  };
  Run.takeTaboo = function (id) {
    const r = rw(); if (r.tabooTaken) return null; r.tabooTaken = true;
    if (id) { if ((r.taboo || []).indexOf(id) < 0) throw new Error('Run: taboo not offered'); Run.addCard(id, { source: 'boss' }); r.tabooChosen = id; }
    Run.save(); return id || null;
  };
  Run.takeAux = function (yes) {
    const r = rw(); if (r.auxTaken) return null; r.auxTaken = true;
    if (yes && r.auxCard) { Run.addCard(r.auxCard, { source: 'boss' }); r.auxChosen = true; }
    Run.save(); return yes ? r.auxCard : null;
  };
  Run.finishReward = function () {
    const st = S(); const r = rw();
    if (!r.goldTaken) Run.takeRewardGold();
    if (r.relic && !r.relicTaken) Run.takeRewardRelic();
    if (r.diary) { st.stats.diaryFound = (st.stats.diaryFound || 0) + 1; }
    const wasBoss = r.boss;
    st.pending = {};
    if (wasBoss) {
      if (st.act >= 3) return finishRun(true, 'cleared');
      startAct(st.act + 1);
      return 'map';
    }
    st.phase = 'map';
    Run.save();
    return 'map';
  };

  // ---- shop / rest --------------------------------------------------------------------------------------
  Run.shop = function () { return S().pending.shop || null; };
  Run.leaveShop = function () { const st = S(); st.phase = 'map'; st.pending = {}; Run.save(); return 'map'; };
  Run.restOptions = function () {
    const st = S(); const fx = Run.runEffects();
    return { canHeal: !fx.noRestHeal && st.life < st.maxLife, healAmount: Math.round(st.maxLife * 0.3), noRestHeal: !!fx.noRestHeal, canRemove: st.deck.length > G.Shop.DECK_MIN };
  };
  Run.rest = function (choice, defId) {
    const st = S(); const o = Run.restOptions();
    if (choice === 'heal') { if (o.noRestHeal) throw new Error('Run: 砕けた砂時計 forbids rest healing'); Run.heal(o.healAmount); }
    else if (choice === 'remove') { if (!o.canRemove) throw new Error('Run: deck at minimum'); if (!Run.removeCard(defId, { reason: 'rest' })) throw new Error('Run: card not in deck'); }
    else if (choice !== 'skip') throw new Error('Run: unknown rest choice ' + choice);
    st.history.push({ t: 'rest', choice: choice });
    st.phase = 'map'; st.pending = {}; Run.save();
    return 'map';
  };

  // ---- events ------------------------------------------------------------------------------------------------
  function queueEvent() {
    const st = S();
    const rng = Run.rng();
    const cands = G.EventDB.filter(function (e) {
      if ((e.act || 1) > st.act) return false;
      if (st.flags.usedEvents.indexOf(e.id) >= 0) return false;
      if (typeof e.available === 'function') { try { return !!e.available(st); } catch (err) { return false; } }
      return true;
    });
    const def = cands.length ? rng.pick(cands) : null;
    st.phase = 'event';
    st.pending = { event: { eventId: def ? def.id : null, stage: 'options', results: [], diary: null } };
    if (def) { st.flags.usedEvents.push(def.id); if (typeof def.onEnter === 'function') { try { def.onEnter(st, rng); } catch (e) { warn('event onEnter failed: ' + e.message); } } }
    st.stats.eventsSeen++;
    Run.save();
    return 'event';
  }
  Run.event = function () {
    const st = S(); const pe = st.pending.event; if (!pe) return null;
    const def = pe.eventId ? G.EventDB.tryGet(pe.eventId) : null;
    return { def: def, state: pe, text: def ? (typeof def.text === 'function' ? def.text(st) : def.text) : '静かな部屋。埃の匂いがするだけで、何も起きなかった。' };
  };
  Run.eventOptions = function () {
    const ev = Run.event(); if (!ev || !ev.def) return [];
    const st = S();
    return ev.def.options.map(function (o, i) {
      let avail = true; try { avail = typeof o.available === 'function' ? !!o.available(st) : true; } catch (e) { avail = false; }
      return { index: i, label: typeof o.label === 'function' ? o.label(st) : o.label, available: avail, pick: o.pick || null };
    });
  };
  Run.eventCandidates = function (optIdx) {
    const ev = Run.event(); if (!ev || !ev.def) return [];
    const o = ev.def.options[optIdx]; if (!o || !o.pick) return [];
    try { return typeof o.pick.candidates === 'function' ? o.pick.candidates(S()) : []; } catch (e) { return []; }
  };
  Run.resolveEvent = function (optIdx, choice) {
    const st = S(); const pe = st.pending.event; if (!pe) throw new Error('Run: no pending event');
    const def = pe.eventId ? G.EventDB.get(pe.eventId) : null;
    if (!def) { pe.stage = 'done'; Run.save(); return { text: '', done: true }; }
    const o = def.options[optIdx]; if (!o) throw new Error('Run: bad option');
    if (typeof o.available === 'function' && !o.available(st)) throw new Error('Run: option unavailable');
    const res = o.resolve(st, choice, Run.rng()) || {};
    res.text = res.text || '';
    pe.results.push({ option: optIdx, text: res.text });
    pe.lastResult = res.text;
    pe.stage = res.again ? 'options' : 'done';
    // diary fragment 10% on any event choice (SPEC 日記の切れ端の入手)
    if (!pe.diary && Run.rng().chance(0.1)) { const d = G.Rewards.findDiary(st, Run.rng()); if (d) { pe.diary = d; res.diary = d; } }
    st.history.push({ t: 'event', id: def.id, option: optIdx });
    if (res.battle) {
      const b = res.battle;
      pe.stage = 'battle';
      Run.save();
      queueBattle(b.enemyId, { elite: !!b.elite, boss: false, rewardMul: b.rewardMul || 1, returnTo: 'map' });
      res.next = 'battle';
    }
    Run.save();
    return res;
  };
  Run.leaveEvent = function () { const st = S(); st.phase = 'map'; st.pending = {}; Run.save(); return 'map'; };

  // ---- deck / relic / resource ops ---------------------------------------------------------------------------------
  Run.addCard = function (defId, opts) {
    const st = S(); opts = opts || {};
    if (!G.CardDB.has(defId)) { warn('unknown card ' + defId); return false; }
    st.deck.push(defId);
    codexMark('cards', defId);
    metaHook('onCardObtained', defId);
    if (!opts.silent) Run.save();
    return true;
  };
  Run.removeCard = function (defId, opts) {
    const st = S(); const i = st.deck.indexOf(defId);
    if (i < 0) return false;
    st.deck.splice(i, 1);
    if (!(opts && opts.silent)) Run.save();
    return true;
  };
  Run.sellCard = function (defId) { const sh = Run.shop(); if (!sh) throw new Error('Run: not in a shop'); return G.Shop.sell(S(), sh, defId); };
  Run.addRelic = function (relicId, opts) {
    const st = S();
    if (!relicId || !G.RelicDB.has(relicId)) { warn('unknown relic ' + relicId); return false; }
    if (st.relics.indexOf(relicId) >= 0 && G.RelicDB.get(relicId).category !== 'cursed') return false;
    st.relics.push(relicId);
    codexMark('relics', relicId);
    metaHook('onRelicObtained', relicId);
    if (!(opts && opts.silent)) Run.save();
    return true;
  };
  Run.removeRelic = function (relicId) { const st = S(); const i = st.relics.indexOf(relicId); if (i < 0) return false; st.relics.splice(i, 1); Run.save(); return true; };
  Run.gold = function (n) { const st = S(); if (typeof n === 'number') { st.gold = Math.max(0, st.gold + n); if (n > 0) st.stats.goldEarned += n; } return st.gold; };
  Run.heal = function (n) { const st = S(); st.life = Math.max(0, Math.min(st.maxLife, st.life + n)); return st.life; };
  Run.life = function () { return S().life; };
  Run.maxLife = function (delta) { const st = S(); if (typeof delta === 'number') { st.maxLife = Math.max(1, st.maxLife + delta); st.life = Math.min(st.life, st.maxLife); if (delta > 0) st.life += delta; } return st.maxLife; };
  Run.openPackIntoDeck = function (type, rng) {
    const st = S();
    const cards = G.Packs.openPack(type, rng || Run.rng(), {});
    cards.forEach(function (id) { Run.addCard(id, { source: 'pack', silent: true }); });
    if (type === 'taboo') Run.addRelic(randomCursed(), { source: 'pack', silent: true });
    st.stats.packsOpened++;
    Run.save();
    return cards;
  };
  Run.dominantLineage = function (deck) {
    const count = {};
    (deck || S().deck).forEach(function (id) { const d = G.CardDB.tryGet(id); if (d && LINEAGES.indexOf(d.lineage) >= 0) count[d.lineage] = (count[d.lineage] || 0) + 1; });
    let best = null; LINEAGES.forEach(function (l) { if (count[l] && (best === null || count[l] > count[best])) best = l; });
    return best;
  };

  // ---- end -----------------------------------------------------------------------------------------------------------
  function finishRun(won, reason) {
    const st = S();
    st.phase = 'runend';
    st.pending = { end: { won: won, reason: reason } };
    Run.save();
    return 'runend';
  }
  Run.pendingEnd = function () { return S().pending.end || null; };
  Run.endRun = function (opts) {
    const st = S(); opts = opts || {};
    const won = opts.won != null ? !!opts.won : !!(st.pending.end && st.pending.end.won);
    const cardUse = st.stats.cardUse || {};
    const topCards = Object.keys(cardUse).sort(function (a, b) { return cardUse[b] - cardUse[a]; }).slice(0, 5).map(function (id) { return { defId: id, count: cardUse[id] }; });
    const summary = { won: won, act: st.act, depth: st.depth, seed: st.seed, festival: st.festival, stats: Object.assign({}, st.stats), deck: st.deck.slice(), relics: st.relics.slice(),
      topCards: topCards, lineage: Run.dominantLineage(st.deck), boss: st.map ? st.map.bossEnemyId : null, gold: st.gold, life: st.life, maxLife: st.maxLife, elapsedMs: Date.now() - (st.startedAt || Date.now()) };
    if (G.Meta && typeof G.Meta.onRunEnd === 'function') summary.meta = metaHook('onRunEnd', { won: won, run: st, summary: summary }) || null;
    else {
      // minimal meta bookkeeping when the meta agent's module is absent
      try {
        G.Save.updateMeta(function (m) {
          m.lastRunDeck = st.deck.slice();
          const r = m.records;
          r.maxDamageOneTurn = Math.max(r.maxDamageOneTurn || 0, st.stats.maxDamageOneTurn || 0);
          r.maxChain = Math.max(r.maxChain || 0, st.stats.maxChain || 0);
          r.longestLoop = Math.max(r.longestLoop || 0, st.stats.longestLoop || 0);
          Object.keys(cardUse).forEach(function (id) { r.cardUse[id] = (r.cardUse[id] || 0) + cardUse[id]; });
          if (summary.lineage) r.lineageUse[summary.lineage] = (r.lineageUse[summary.lineage] || 0) + 1;
          if (won) {
            m.runsCleared = (m.runsCleared || 0) + 1;
            m.maxDepthCleared = Math.max(m.maxDepthCleared == null ? -1 : m.maxDepthCleared, st.depth);
            r.maxDepth = Math.max(r.maxDepth || 0, st.depth);
            if (st.depth >= (m.depth || 0) && m.depth < 10) m.depth = st.depth + 1;
            if (summary.lineage) m.lineageClears[summary.lineage] = (m.lineageClears[summary.lineage] || 0) + 1;
            if (m.unlockedPacks.indexOf('gold') < 0) m.unlockedPacks.push('gold');
            if (Object.keys(m.lineageClears).filter(function (l) { return m.lineageClears[l] > 0; }).length >= 3 && m.unlockedPacks.indexOf('dual') < 0) m.unlockedPacks.push('dual');
            if (st.depth >= 5 && m.unlockedPacks.indexOf('taboo') < 0) m.unlockedPacks.push('taboo');
          }
        });
      } catch (e) { warn('meta update failed: ' + e.message); }
    }
    Run.state = null; R = null;
    try { if (G.Save) G.Save.clearRun(); } catch (e) { /* ignore */ }
    return summary;
  };
})(globalThis.G = globalThis.G || {});
