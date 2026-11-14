(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // js/ai/wish.js — 願いの魔神: "the card you need right now" (after Hearthstone's Zephrys the Great).
  //
  //   G.Wish.offers(game, pIdx) → Promise<[{cat, catName, defId, score, affordable}]>  (up to 3, distinct categories)
  //
  // Six categories, each with a hand-picked pool of existing player cards:
  //   lethal リーサル / removal 単体除去 / sweep 一掃 / heal 回復 / guard 守り（妨害）/ draw 手札補充
  // Each candidate is tried on a clone of the battle with the AI's own simulator (the card is put into the
  // hand as 朧 and played with the AI's best targets), so the offer reflects the real position, not a fixed
  // rule. リーサル is offered only when that card actually wins this turn (the card, then every attack to the
  // face). 守り cards act on the opponent's next turn, which a one-action simulation cannot see, so that
  // category reads the opponent's threats (special-win keys, timed cards, loops, extra turns, chain, board
  // damage) instead. The three offers come from three different categories, best first.
  // ---------------------------------------------------------------
  const Wish = G.Wish = G.Wish || {};

  Wish.CATEGORIES = [
    { id: 'lethal', name: 'リーサル' },
    { id: 'removal', name: '単体除去' },
    { id: 'sweep', name: '一掃' },
    { id: 'heal', name: '回復' },
    { id: 'guard', name: '守り' },
    { id: 'draw', name: '手札補充' }
  ];
  Wish.POOLS = {
    lethal: ['見習いの火球', '過充填の槍', '雷撃の連打', '天雷の裁き', '呪詛の爆発', '幻影の総攻撃', '言霊の洪水', '一瞬の永遠', '戦の雄叫び', '鼓舞の角笛'],
    removal: ['消滅の光', '脱力の呪い', '刻の剥落', '縮小の呪文', '簒奪の儀', '竜狩りの大弩', '見習いの火球'],
    sweep: ['衰弱の霧', '霧払いの風', '雷帝', '万雷の竜神'],
    heal: ['応急手当', '再生の秘術', '浄化の聖水', '呪詛返し'],
    guard: ['因果の断絶', '時計止め', 'ループ断ちの鎖', '時空の錨', '時間停止', '避雷針', '封印の鎖', '封言の呪文', '重圧の呪文', '反射の鏡盾', '封じの番兵', '渦潮の番人'],
    draw: ['知識の泉水', '溢れ出す記憶', '全知の雫', '古文書の発掘', '逆転の一手', '嵐を呼ぶ巫女']
  };
  const CAT_NAME = {};
  Wish.CATEGORIES.forEach(function (c) { CAT_NAME[c.id] = c.name; });

  function idOf(name) { return G.Data && G.Data.idByName ? G.Data.idByName(name) : null; }

  // A private copy of the battle for trying a card: no forecasts, and every choice made by the AI's chooser
  // (a clone keeps the real players' choosers, which for the human would open real selection windows).
  function trialClone(game, pIdx, style) {
    const g = game.clone();
    g._sim = true;
    g.players[pIdx].chooser = G.AI.makeChooser(style);
    g.players[1 - pIdx].chooser = G.AI.makeChooser('disrupt');
    g.players[0].hazardTests = []; g.players[1].hazardTests = [];
    return g;
  }
  function cloneOf(g) { const c = g.clone(); c._sim = true; c.players[0].chooser = g.players[0].chooser; c.players[1].chooser = g.players[1].chooser; return c; }

  // Put an oboro copy of defId into pIdx's hand on a clone; returns the inst.
  function giveCard(g2, pIdx, defId) {
    const inst = g2.createCardInst(defId, pIdx, {});
    inst.oboro = true; inst.zone = 'hand';
    g2.players[pIdx].hand.push(inst);
    return inst;
  }

  // Best simulated play of defId for pIdx. Returns null when the card cannot be played at all here.
  async function tryCard(game, pIdx, defId, style) {
    const g2 = trialClone(game, pIdx, style);
    const inst = giveCard(g2, pIdx, defId);
    const p = g2.players[pIdx];
    const cost = g2.costOf(pIdx, inst);
    const affordable = cost <= p.mana;
    if (!affordable) p.mana = cost; // judge it as if it could be paid (it can be played on a later turn)
    const cands = G.AI.candidates(g2, pIdx, style).filter(function (c) { return c.type === 'play' && c.uid === inst.uid; });
    if (!cands.length) return null;
    let best = null;
    for (let i = 0; i < cands.length; i++) {
      const r = await G.AI.simulate(g2, pIdx, cands[i], style);
      if (r.bad || !isFinite(r.score)) continue;
      if (!best || r.score > best.score) best = { score: r.score, cand: cands[i], winner: r.winner };
    }
    if (!best) return null;
    best.affordable = affordable;
    // measure what the best play actually did (for the category's own yardstick)
    const g4 = cloneOf(g2);
    const me4 = g4.players[pIdx], opp4 = g4.players[1 - pIdx];
    const before = { mons: g4.monstersOf(opp4.idx).length, oppVal: boardSum(g4, opp4.idx), life: me4.life, curse: me4.curse, hand: me4.hand.length - 1 };
    try { await G.AI.apply(g4, pIdx, best.cand); } catch (e) { /* keep the estimate */ }
    best.kills = Math.max(0, before.mons - g4.monstersOf(opp4.idx).length);
    best.oppValDrop = Math.max(0, before.oppVal - boardSum(g4, opp4.idx));
    best.lifeGain = Math.max(0, me4.life - before.life);
    best.curseDrop = Math.max(0, before.curse - me4.curse);
    best.handGain = me4.hand.length - before.hand;
    return best;
  }
  function boardSum(g, who) { let v = 0; g.monstersOf(who).forEach(function (m) { v += g.atkOf(m) + g.hpOf(m) * 0.5; }); return v; }

  // Does playing defId (best targets) and then attacking the face with everything win this turn?
  async function wins(game, pIdx, defId, style) {
    const g2 = trialClone(game, pIdx, style);
    const inst = giveCard(g2, pIdx, defId);
    if (g2.costOf(pIdx, inst) > g2.players[pIdx].mana) return false;
    const cands = G.AI.candidates(g2, pIdx, style).filter(function (c) { return c.type === 'play' && c.uid === inst.uid; });
    for (let i = 0; i < cands.length; i++) {
      const g3 = cloneOf(g2);
      try {
        const r = await G.AI.apply(g3, pIdx, cands[i]);
        if (r && r.ok === false) continue;
        for (let guard = 0; guard < 40 && g3.winner === null; guard++) {
          const atk = g3.getAttackers(pIdx).find(function (a) { return a.targets.indexOf('face') >= 0; });
          if (!atk) break;
          const ar = await g3.attack(pIdx, atk.uid, 'face');
          if (ar && ar.ok === false) break;
        }
      } catch (e) { continue; }
      if (g3.winner === pIdx) return true;
    }
    return false;
  }

  // ---- 守り: read the opponent's threats -------------------------------------------------
  function guardPicks(game, pIdx) {
    const me = game.players[pIdx], opp = game.players[1 - pIdx];
    const picks = [];
    const add = function (name, w) { picks.push({ name: name, w: w }); };
    const keys = typeof game.distinctKeys === 'function' ? game.distinctKeys(opp.idx) : 0;
    if (keys >= 2) add('因果の断絶', 70 + keys * 8);
    if (me.curse >= me.curseLimit * 0.5) add('因果の断絶', 60 + Math.round(me.curse / me.curseLimit * 30));
    if (opp.timed.length) add('時計止め', 55 + opp.timed.length * 10);
    let best = null;
    try { best = G.Combos ? G.Combos.best(game, opp.idx) : null; } catch (e) { best = null; }
    if (best && best.combo && best.progress >= 0.5) {
      if (best.combo.infinite) add('ループ断ちの鎖', 50 + Math.round(best.progress * 40));
      if (best.combo.lineage === 'time') add('時空の錨', 45 + Math.round(best.progress * 40));
      add('封言の呪文', 35 + Math.round(best.progress * 30));
      add('重圧の呪文', 30 + Math.round(best.progress * 25));
    }
    const chain = typeof game.chainOf === 'function' ? game.chainOf(opp.idx) : opp.chain;
    if (chain >= 5) add('避雷針', 40 + chain);
    const nonTabooCrests = opp.crests.filter(function (c) { const d = G.CardDB.tryGet(c.defId); return d && d.rarity !== 'taboo'; });
    if (nonTabooCrests.length) add('封印の鎖', 40 + nonTabooCrests.length * 8);
    const incoming = G.AI.incomingDamage(game, pIdx);
    if (incoming > 0) {
      const share = incoming / Math.max(1, me.life);
      add('時間停止', Math.round(30 + share * 60));
      add('反射の鏡盾', Math.round(20 + share * 40));
      add('封じの番兵', Math.round(20 + share * 30));
      add('渦潮の番人', Math.round(18 + share * 30));
    }
    add('封言の呪文', 22);
    add('渦潮の番人', 15);
    const hazard = typeof game.hazard === 'function' ? game.hazard(opp.idx) : 0;
    picks.sort(function (a, b) { return b.w - a.w; });
    return { picks: picks, need: Math.max(hazard * 0.5, picks.length ? picks[0].w * 0.5 : 0) };
  }

  // How much the position calls for each category, on top of what the simulation shows.
  function needOf(game, pIdx) {
    const me = game.players[pIdx], opp = game.players[1 - pIdx];
    const oppMons = game.monstersOf(opp.idx).length;
    const lifeShare = me.life / Math.max(1, me.maxLife);
    return {
      removal: oppMons ? 6 + Math.min(14, game.monstersOf(opp.idx).reduce(function (s, m) { return Math.max(s, game.atkOf(m) + game.hpOf(m) * 0.5); }, 0)) : -100,
      sweep: oppMons >= 2 ? 8 * (oppMons - 1) : -100,
      heal: (lifeShare < 0.6 ? Math.round((0.6 - lifeShare) * 70) : 0) + (me.curse >= me.curseLimit * 0.4 ? 25 : 0),
      draw: me.hand.length <= 1 ? 26 : me.hand.length <= 3 ? 14 : 2
    };
  }

  Wish.offers = async function (game, pIdx) {
    if (!G.AI || !G.AI.simulate) return [];
    // inside an AI simulation (an enemy weighing its own 願いの魔神): no nested search, a fixed cheap wish
    if (game._sim) return [{ cat: 'draw', catName: CAT_NAME.draw, defId: idOf('知識の泉水'), score: 0, affordable: true }];
    const style = 'speed';
    const base = G.AI.evaluate(game, pIdx, style);
    const need = needOf(game, pIdx);
    const used = {};
    const result = {};

    // リーサル: only a card that wins this turn
    for (const name of Wish.POOLS.lethal) {
      const id = idOf(name); if (!id) continue;
      if (await wins(game, pIdx, id, style)) { result.lethal = { cat: 'lethal', defId: id, score: 1e6, affordable: true }; break; }
    }

    // simulated categories
    for (const cat of ['removal', 'sweep', 'heal', 'draw']) {
      if (need[cat] <= -100) continue;
      let best = null;
      for (const name of Wish.POOLS[cat]) {
        const id = idOf(name); if (!id) continue;
        const r = await tryCard(game, pIdx, id, style);
        if (!r) continue;
        const evalGain = r.score - base;
        let gain;
        if (cat === 'removal') gain = r.oppValDrop > 0 ? r.oppValDrop * 2 + evalGain * 0.3 : -30;
        else if (cat === 'sweep') gain = r.kills >= 1 || r.oppValDrop >= 3 ? r.kills * 10 + r.oppValDrop + evalGain * 0.2 : -30;
        else if (cat === 'heal') gain = r.lifeGain || r.curseDrop ? r.lifeGain * 1.5 + r.curseDrop * 2.5 : -30;
        else gain = r.handGain > 0 ? r.handGain * 4 + evalGain * 0.2 : -30;
        if (r.winner === pIdx) gain += 100;
        if (!r.affordable) gain = gain * 0.4 - 10; // usable only on a later turn
        gain = Math.max(-30, Math.min(60, gain));
        if (!best || gain > best.gain) best = { cat: cat, defId: id, gain: gain, affordable: r.affordable };
      }
      if (best && best.gain > -15) { best.score = best.gain + need[cat]; result[cat] = best; }
    }

    // 守り
    const gp = guardPicks(game, pIdx);
    for (const pk of gp.picks) {
      const id = idOf(pk.name); if (!id) continue;
      const inst = game.createCardInst(id, pIdx, {});
      const cost = game.costOf(pIdx, inst);
      result.guard = { cat: 'guard', defId: id, score: gp.need + (cost <= game.players[pIdx].mana ? 0 : -8), affordable: cost <= game.players[pIdx].mana };
      break;
    }

    const list = Object.keys(result).map(function (k) { return result[k]; }).sort(function (a, b) { return b.score - a.score; });
    const out = [];
    for (const o of list) {
      if (used[o.defId]) continue;
      used[o.defId] = true;
      out.push({ cat: o.cat, catName: CAT_NAME[o.cat], defId: o.defId, score: Math.round(o.score), affordable: o.affordable });
      if (out.length >= 3) break;
    }
    // never fewer than 3 when the pools allow it: fill with the cheapest unused 手札補充 / 守り cards
    const fill = ['知識の泉水', '封言の呪文', '応急手当', '渦潮の番人'];
    for (const name of fill) {
      if (out.length >= 3) break;
      const id = idOf(name); if (!id || used[id]) continue;
      const cat = name === '知識の泉水' ? 'draw' : name === '応急手当' ? 'heal' : 'guard';
      if (out.some(function (o) { return o.cat === cat; })) continue;
      used[id] = true;
      out.push({ cat: cat, catName: CAT_NAME[cat], defId: id, score: 0, affordable: true });
    }
    return out;
  };
})(globalThis.G = globalThis.G || {});
