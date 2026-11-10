'use strict';
// tests/ai_core.test.js — AI vs AI battles, forecast promise, loop handling, chooser heuristics.
(function (G) {
  const T = G.Test, test = T.test, eq = T.eq, ok = T.assert;
  const Fx = G.Fx;
  const DB = G.CardDB;
  if (!G.AI || !G.AI.takeTurn) return;
  G.AI.quiet = true;

  function reg(def) { if (!DB.has(def.id)) DB.register(def); return def; }
  // test-only cards (ids prefixed ta_)
  reg({ id: 'ta_vanilla', name: 'AI試験兵', type: 'monster', cost: 1, atk: 2, hp: 2, effects: {} });
  reg({ id: 'ta_guard', name: 'AI試験守護', type: 'monster', cost: 2, atk: 1, hp: 4, keywords: ['guard'], effects: {} });
  reg({ id: 'ta_spark', name: 'AI試験火種', type: 'spell', cost: 0, role: 'fuel', effects: { onPlay: Fx.seq(Fx.gainMana(1), Fx.draw(1)) } });
  reg({ id: 'ta_bolt', name: 'AI試験稲妻', type: 'spell', cost: 1, effects: { onPlay: Fx.dmgOpp(3) } });
  reg({ id: 'ta_nuke', name: 'AI試験大爆発', type: 'spell', cost: 1, role: 'finisher', tags: ['finisher'], effects: { onPlay: Fx.dmgOpp(99) } });
  reg({ id: 'ta_kill', name: 'AI試験除去', type: 'spell', cost: 1, role: 'disrupt', targets: Fx.T.enemyMonster, effects: { onPlay: Fx.destroyTarget() } });
  reg({ id: 'ta_engine', name: 'AI試験炉', type: 'monster', cost: 2, atk: 1, hp: 2, role: 'engine', effects: { onTurnStart: Fx.gainMana(1) } });
  reg({ id: 'ta_bigatk', name: 'AI試験巨人', type: 'monster', cost: 3, atk: 6, hp: 2, effects: {} });
  reg({ id: 'ta_crest', name: 'AI試験紋章', type: 'crest', cost: 1, role: 'engine', effects: { onTurnStart: Fx.draw(1) } });
  reg({ id: 'ta_phoenix', name: 'AI試験不死鳥', type: 'monster', cost: 0, atk: 1, hp: 1, tags: ['loopPart'],
    effects: { onSummon: Fx.gainMana(1), onLeave: async function (ctx) { await ctx.returnToHand(ctx.card); } } });
  reg({ id: 'ta_altar', name: 'AI試験祭壇', type: 'crest', cost: 1, role: 'engine', tags: ['loopPart'], effects: {
    ability: { label: '破壊', targets: { kind: 'boardMonster', side: 'ally', count: 1 }, use: async function (ctx) { await ctx.destroy(ctx.targets[0]); } } } });
  reg({ id: 'ta_lastlap', name: 'AI試験最後の一周', type: 'spell', cost: 1, role: 'finisher', tags: ['finisher'], effects: { onPlay: Fx.dmgOpp(function (ctx) { return ctx.me.manaGainedThisTurn; }) } });
  reg({ id: 'ta_draw3', name: 'AI試験大泉', type: 'spell', cost: 1, effects: { onPlay: Fx.draw(3) } });
  reg({ id: 'ta_choose', name: 'AI試験選択', type: 'spell', cost: 0, effects: { onPlay: async function (ctx) {
    const id = await ctx.choose([{ id: 'mana', label: 'マナ+1' }, { id: 'draw', label: 'カードを1枚引く' }], { prompt: '選ぶ' });
    if (id === 'mana') await ctx.gainMana(1); else await ctx.draw(1);
    ctx.me.flags.lastChoice = id;
  } } });

  const TEST_COMBO = { id: 'ta_loop', name: 'AI試験ループ', lineage: 'accel', parts: ['AI試験祭壇', 'AI試験不死鳥'], finisher: ['AI試験最後の一周'], engines: ['AI試験祭壇'], infinite: true, note: '' };
  if (G.Combos && !G.Combos.byId('ta_loop')) G.Combos.list.push(TEST_COMBO);

  const POOL = ['ta_vanilla', 'ta_guard', 'ta_spark', 'ta_bolt', 'ta_kill', 'ta_engine', 'ta_bigatk', 'ta_crest', 'ta_draw3', 'ta_choose', 'ta_phoenix', 'ta_altar', 'ta_lastlap'];
  function randomDeck(rng, n) { const d = []; for (let i = 0; i < n; i++) d.push(rng.pick(POOL)); return d; }

  function aiPlayer(name, deck, style, extra) {
    const chooser = G.AI.makeChooser(style);
    chooser.aiStyle = style; chooser.aiMistakeRate = 0.2;
    return Object.assign({ name: name, deck: deck, isAI: true, life: 30, chooser: chooser }, extra || {});
  }
  async function playOut(g, maxTurns) {
    let guard = 0;
    while (g.winner === null && guard++ < (maxTurns || 200)) await G.AI.takeTurn(g, g.active);
    return g;
  }

  test('AI vs AI: 30 random seeds never throw and end within the turn limit', async () => {
    const styles = ['speed', 'assemble', 'charge', 'disrupt', 'specialWin', 'mirror'];
    for (let seed = 1; seed <= 30; seed++) {
      const rng = new G.RNG(seed);
      const g = G.Engine.createGame({ seed: seed, turnLimit: 30,
        players: [aiPlayer('A', randomDeck(rng, 20), styles[seed % 6]), aiPlayer('B', randomDeck(rng, 20), styles[(seed + 3) % 6])] });
      await g.start();
      await playOut(g, 120);
      ok(g.winner !== null || g.phase === 'over', 'seed ' + seed + ' ended (turn ' + g.turn + ')');
      ok(g.turn <= 30, 'seed ' + seed + ' within turn limit');
    }
  });

  test('AI never plays a finisher (lethal) on a turn without prior forecast', async () => {
    // The AI has lethal in hand from turn 1 but no forecast has been issued → must hold it, forecast, then fire next turn.
    const g = await T.sandbox({ seed: 5, first: 1,
      p0: { life: 30, deck: ['ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla'] },
      p1: { hand: ['ta_nuke', 'ta_vanilla'], mana: 5, maxMana: 5, life: 30, deck: ['ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla'], chooser: G.AI.makeChooser('speed') } });
    const played = [];
    g.on('cardPlayed', function (e) { if (e.who === 1) played.push({ defId: e.defId, forecasted: g.isForecasted(1), turn: g.turn }); });
    const forecasts = [];
    g.on('forecast', function (e) { forecasts.push(g.turn); });
    eq(g.active, 1);
    const r1 = await G.AI.takeTurn(g, 1);
    ok(!played.some(function (p) { return p.defId === 'ta_nuke'; }), 'no nuke on turn 1');
    eq(g.winner, null);
    ok(r1.forecast, 'forecast raised at the end of the first turn');
    eq(forecasts.length, 1);
    ok(g.isForecasted(1));
    // opponent passes
    await g.endTurn(0);
    eq(g.active, 1);
    await G.AI.takeTurn(g, 1);
    eq(g.winner, 1, 'wins on the forecasted turn');
    eq(played.filter(function (p) { return p.defId === 'ta_nuke'; })[0].forecasted, true);
  });

  test('finisher check holds over 30 seeds (instrumented lethal card)', async () => {
    for (let seed = 1; seed <= 30; seed++) {
      const rng = new G.RNG(seed + 100);
      const deckA = randomDeck(rng, 14).concat(['ta_nuke', 'ta_nuke']);
      const g = G.Engine.createGame({ seed: seed, turnLimit: 30, players: [aiPlayer('A', deckA, 'speed'), aiPlayer('B', randomDeck(rng, 16), 'disrupt')] });
      let violation = null;
      g.on('cardPlayed', function (e) { if (e.defId === 'ta_nuke' && e.who === 0 && !e.isCopy && !g.isForecasted(0)) violation = 'turn ' + g.turn; });
      await g.start();
      await playOut(g, 120);
      ok(!violation, 'seed ' + seed + ': finisher without forecast at ' + violation);
    }
  });

  test('loop: AI runs a detected infinite loop only after forecast, then plays the finisher', async () => {
    const deck1 = ['ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla'];
    const g = await T.sandbox({ seed: 3, first: 1,
      p0: { life: 40, deck: deck1.slice() },
      p1: { hand: ['ta_phoenix', 'ta_lastlap'], crests: ['ta_altar'], mana: 3, maxMana: 3, life: 40, deck: deck1.slice(), chooser: G.AI.makeChooser('assemble') } });
    const loops = [];
    g.on('loopRun', function (e) { loops.push({ turn: g.turn, forecasted: g.isForecasted(1) }); });
    const r1 = await G.AI.takeTurn(g, 1);
    eq(g.winner, null, 'no win on the un-forecasted turn');
    eq(loops.length, 0, 'no loop run before forecast');
    ok(r1.forecast, 'forecasted');
    await g.endTurn(0);
    await G.AI.takeTurn(g, 1);
    eq(g.winner, 1, 'wins after forecast');
    ok(loops.length >= 1 && loops[0].forecasted, 'loop ran under forecast');
  });

  test('loop: AI does not start an exit-less loop (no finisher available)', async () => {
    const deck1 = ['ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla'];
    const g = await T.sandbox({ seed: 4, first: 1,
      p0: { life: 40, deck: deck1.slice() },
      p1: { hand: ['ta_phoenix'], crests: ['ta_altar'], mana: 3, maxMana: 3, life: 40, deck: deck1.slice(), chooser: G.AI.makeChooser('assemble') } });
    let ran = 0;
    g.on('loopRun', function () { ran++; });
    for (let i = 0; i < 3 && g.winner === null; i++) { await G.AI.takeTurn(g, 1); if (g.winner === null) await g.endTurn(0); }
    eq(ran, 0, 'exit-less loop never run');
    eq(g.winner, null);
  });

  test('QA: an exit-less ability-only loop is blocked after detection (no re-detection spam in one turn)', async () => {
    // 鏡の主 regression: 祭壇の能力 on a self-replacing monster was re-detected 15× per turn because the
    // blocked signature used target defIds while candidates carried target uids.
    reg({ id: 'ta_reborn', name: 'AI試験再生体', type: 'monster', cost: 9, atk: 1, hp: 1,
      effects: { onDeath: async function (ctx) { await ctx.summon('ta_reborn', ctx.me); await ctx.gainMana(1); } } });
    const deck1 = ['ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla'];
    const g = await T.sandbox({ seed: 5, first: 1,
      p0: { life: 40, deck: deck1.slice() },
      p1: { board: ['ta_reborn'], crests: ['ta_altar'], mana: 0, maxMana: 0, life: 40, deck: deck1.slice(), chooser: G.AI.makeChooser('assemble') } });
    let det = 0;
    g.on('loopDetected', function () { det++; });
    await G.AI.takeTurn(g, 1);
    ok(det <= 1, 'loop detected at most once in the turn (got ' + det + ')');
    ok(G.AI.actionSig({ type: 'ability', defId: 'x', targets: [7], targetDefs: [{ defId: 'y' }] }) === G.AI.actionSig({ type: 'ability', defId: 'x', targets: [{ defId: 'y' }] }), 'candidate and recorded ability share a signature');
  });

  test('forecast is cancelled when hazard drops below 100', async () => {
    const g = await T.sandbox({ seed: 6, first: 1,
      p0: { life: 40, hand: ['ta_kill'], mana: 5, deck: ['ta_vanilla', 'ta_vanilla', 'ta_vanilla'] },
      p1: { hand: ['ta_vanilla'], board: ['ta_engine'], mana: 2, maxMana: 2, life: 40, deck: ['ta_vanilla', 'ta_vanilla', 'ta_vanilla'],
        hazardTests: [{ test: function (game, e) { return game.monstersOf(e.idx).some(function (m) { return m.defId === 'ta_engine'; }); }, weight: 100 }],
        chooser: G.AI.makeChooser('speed') } });
    const ev = T.record(g, ['forecast', 'forecastCancelled']);
    await G.AI.takeTurn(g, 1);
    eq(ev.count('forecast'), 1);
    ok(g.isForecasted(1));
    // player kills the engine → forecast cancelled
    const kill = g.players[0].hand[0];
    const eng = g.players[1].board.find(function (m) { return m.defId === 'ta_engine'; });
    await g.playCard(0, kill.uid, { choices: { targets: [eng.uid] } });
    eq(ev.count('forecastCancelled'), 1);
    ok(!g.isForecasted(1));
  });

  test('attack logic: lethal face attack taken; guard kept when threatened', async () => {
    const g = await T.sandbox({ seed: 7, first: 1,
      p0: { life: 5, board: ['ta_bigatk'], deck: ['ta_vanilla', 'ta_vanilla'] },
      p1: { board: ['ta_bigatk', 'ta_guard'], mana: 0, maxMana: 1, life: 10, deck: ['ta_vanilla', 'ta_vanilla'], chooser: G.AI.makeChooser('speed') } });
    await G.AI.takeTurn(g, 1);
    eq(g.winner, 1, 'took lethal with the giant');
    // guard scenario: opponent has a 6-atk monster, AI life low → guard should stay home (not trade into giant for a 1-dmg face hit)
    const g2 = await T.sandbox({ seed: 8, first: 1,
      p0: { life: 40, board: ['ta_bigatk'], deck: ['ta_vanilla', 'ta_vanilla'] },
      p1: { board: ['ta_guard'], mana: 0, maxMana: 1, life: 6, deck: ['ta_vanilla', 'ta_vanilla'], chooser: G.AI.makeChooser('speed') } });
    await G.AI.takeTurn(g2, 1);
    const guard = g2.players[1].board.find(function (m) { return m.defId === 'ta_guard'; });
    ok(guard && g2.hpOf(guard) === 4, 'guard did not suicide into the giant');
  });

  test('chooser: destroy targets the highest-threat enemy monster (engine first)', async () => {
    const g = await T.sandbox({ seed: 9, first: 1,
      p0: { board: ['ta_bigatk', 'ta_engine', 'ta_vanilla'], deck: ['ta_vanilla'] },
      p1: { hand: ['ta_kill'], mana: 3, deck: ['ta_vanilla'], chooser: G.AI.makeChooser('disrupt') } });
    const spec = Fx.T.enemyMonster;
    const cands = g.makeCtx(1, null).candidatesFor(spec);
    const pick = G.AI.choosePick(spec, cands, g, 1, 'disrupt');
    eq(pick[0].defId, 'ta_engine');
    // without engines → highest attack
    const g2 = await T.sandbox({ seed: 9, first: 1, p0: { board: ['ta_vanilla', 'ta_bigatk'], deck: ['ta_vanilla'] }, p1: { deck: ['ta_vanilla'], chooser: G.AI.makeChooser('speed') } });
    const c2 = g2.makeCtx(1, null).candidatesFor(spec);
    eq(G.AI.choosePick(spec, c2, g2, 1, 'speed')[0].defId, 'ta_bigatk');
  });

  test('chooser: hand-limit discard keeps combo parts and finishers', async () => {
    const g = await T.sandbox({ seed: 10, first: 1,
      p1: { hand: ['ta_vanilla', 'ta_phoenix', 'ta_bolt', 'ta_lastlap', 'ta_spark', 'ta_vanilla', 'ta_vanilla', 'ta_altar'], crests: [], mana: 0, deck: ['ta_vanilla'], chooser: G.AI.makeChooser('assemble') } });
    const spec = { kind: 'handCard', side: 'ally', count: 6, prompt: '手札に残すカードを6枚選ぶ' };
    const cands = g.makeCtx(1, null).candidatesFor(spec);
    const keep = G.AI.choosePick(spec, cands, g, 1, 'assemble').map(function (c) { return c.defId; });
    eq(keep.length, 6);
    ok(keep.indexOf('ta_phoenix') >= 0 && keep.indexOf('ta_altar') >= 0 && keep.indexOf('ta_lastlap') >= 0, 'combo parts kept: ' + keep.join(','));
    ok(['ta_altar', 'ta_phoenix', 'ta_lastlap'].every(function (d) { return keep.indexOf(d) < 3; }), 'parts ranked first: ' + keep.join(','));
  });

  test('chooser: option picks follow style (mana when hand large, draw otherwise)', async () => {
    const g = await T.sandbox({ seed: 11, first: 1, p1: { hand: ['ta_choose'], mana: 2, deck: ['ta_vanilla', 'ta_vanilla'], chooser: G.AI.makeChooser('assemble') } });
    await g.playCard(1, g.players[1].hand[0].uid);
    eq(g.players[1].flags.lastChoice, 'draw');
    const g2 = await T.sandbox({ seed: 11, first: 1, p1: { hand: ['ta_choose', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla', 'ta_vanilla'], mana: 2, deck: ['ta_vanilla'], chooser: G.AI.makeChooser('assemble') } });
    await g2.playCard(1, g2.players[1].hand[0].uid);
    eq(g2.players[1].flags.lastChoice, 'mana');
  });

  test('playerChooserDefault auto-resolves single candidates and stays greedy otherwise', async () => {
    const g = await T.sandbox({ seed: 12, p0: { hand: ['ta_kill'], mana: 2, deck: ['ta_vanilla'], chooser: G.AI.playerChooserDefault }, p1: { board: ['ta_vanilla'], deck: ['ta_vanilla'] } });
    const spec = Fx.T.enemyMonster;
    const cands = g.makeCtx(0, null).candidatesFor(spec);
    eq(G.AI.playerChooserDefault(spec, cands, g, g.makeCtx(0, null)).length, 1);
    eq(G.AI.playerChooserDefault({ kind: 'option' }, [{ id: 'a' }, { id: 'b' }], g, null), 'a');
  });

  test('onStep is awaited after each action and aiStepDelay is honored via the callback', async () => {
    const g = await T.sandbox({ seed: 13, first: 1, options: { aiStepDelay: 1 },
      p0: { deck: ['ta_vanilla', 'ta_vanilla'] },
      p1: { hand: ['ta_spark', 'ta_vanilla', 'ta_bolt'], mana: 3, maxMana: 3, deck: ['ta_vanilla', 'ta_vanilla'], chooser: G.AI.makeChooser('speed') } });
    const steps = [];
    let pending = 0, overlapped = false;
    await G.AI.takeTurn(g, 1, { onStep: function (info) {
      steps.push(info.type);
      if (pending) overlapped = true;
      pending++;
      return new Promise(function (res) { setTimeout(function () { pending--; res(); }, 2); });
    } });
    ok(steps.length >= 2, 'steps reported: ' + steps.join(','));
    eq(steps[steps.length - 1], 'endTurn');
    ok(!overlapped, 'each onStep promise was awaited before the next action');
  });

  test('mistake rate: boss (0) is deterministic for identical seeds; evaluate() prefers winning states', async () => {
    const mk = async function () {
      const rng = new G.RNG(77);
      const g = G.Engine.createGame({ seed: 77, turnLimit: 20, players: [aiPlayer('A', randomDeck(rng, 16), 'speed', { }), aiPlayer('B', randomDeck(rng, 16), 'assemble')] });
      g.players[0].chooser.aiMistakeRate = 0; g.players[1].chooser.aiMistakeRate = 0;
      await g.start(); await playOut(g, 100); return g.log.map(function (l) { return l.msg; }).join('\n');
    };
    eq(await mk(), await mk());
    const g = await T.sandbox({ seed: 1, p0: { life: 10 }, p1: { life: 40 } });
    const low = G.AI.evaluate(g, 0, 'speed'), high = G.AI.evaluate(g, 1, 'speed');
    ok(high > low, 'player with more life evaluates higher');
  });
})(globalThis.G);
