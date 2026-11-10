(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // G.Fx — factory helpers returning `(ctx) => Promise` hook functions.
  // Card authors compose them for simple cards:
  //   effects: { onPlay: Fx.seq(Fx.gainMana(1), Fx.draw(1)) }
  // Every helper is one line of intent; see js/engine/README.md.
  // ---------------------------------------------------------------
  const Fx = {};

  // Run several effects in order.
  Fx.seq = function () {
    const fns = Array.prototype.slice.call(arguments);
    return async function (ctx, ev) { for (let i = 0; i < fns.length; i++) await fns[i](ctx, ev); };
  };
  // Run `fn` only when pred(ctx, ev) is true.
  Fx.when = function (pred, fn, elseFn) {
    return async function (ctx, ev) { if (pred(ctx, ev)) await fn(ctx, ev); else if (elseFn) await elseFn(ctx, ev); };
  };
  // Repeat an effect n times (n may be a function of ctx).
  Fx.times = function (n, fn) {
    return async function (ctx, ev) { const k = typeof n === 'function' ? n(ctx, ev) : n; for (let i = 0; i < k; i++) await fn(ctx, ev); };
  };
  // Resolve n: number or (ctx)=>number.
  function num(n, ctx, ev) { return typeof n === 'function' ? n(ctx, ev) : n; }

  // ---- resources ----
  // Gain n mana (routes through onManaGained / modManaGain).
  Fx.gainMana = function (n) { return function (ctx, ev) { return ctx.gainMana(num(n, ctx, ev)); }; };
  // Opponent loses n mana.
  Fx.drainOppMana = function (n) { return function (ctx, ev) { ctx.loseMana(num(n, ctx, ev), ctx.opp); }; };
  // Increase own max mana by n (may be negative).
  Fx.gainMaxMana = function (n) { return function (ctx, ev) { ctx.gainMaxMana(num(n, ctx, ev)); }; };
  // Multiply current mana by k (魔力奔流).
  Fx.multiplyMana = function (k) { return function (ctx) { ctx.setMana(ctx.me.mana * k); }; };
  // Draw n cards.
  Fx.draw = function (n) { return function (ctx, ev) { return ctx.draw(num(n, ctx, ev)); }; };
  // Opponent draws n cards.
  Fx.oppDraw = function (n) { return function (ctx, ev) { return ctx.draw(num(n, ctx, ev), ctx.opp); }; };
  // Draw until hand has n cards.
  Fx.drawTo = function (n) { return function (ctx) { const k = n - ctx.me.hand.length; return k > 0 ? ctx.draw(k) : Promise.resolve([]); }; };
  // Discard n random cards from own hand (or all with 'all').
  Fx.discard = function (n) { return function (ctx) { return ctx.discard(n === 'all' ? ctx.me.hand.slice() : n); }; };
  // Opponent discards n random cards.
  Fx.oppDiscard = function (n) { return function (ctx) { return ctx.discard(n, ctx.opp); }; };
  // Mill n cards from opponent's deck.
  Fx.millOpp = function (n) { return function (ctx, ev) { return ctx.mill(num(n, ctx, ev), ctx.opp); }; };
  // Search own deck for a card matching pred(inst, def) and add it to hand.
  Fx.tutor = function (pred, opts) { return function (ctx) { return ctx.tutor(pred, ctx.me, opts); }; };
  // Shuffle own grave into deck.
  Fx.shuffleGraveIntoDeck = function () { return function (ctx) { ctx.shuffleGraveIntoDeck(ctx.me); }; };

  // ---- damage / life ----
  // Deal n damage to the opponent's face.
  Fx.dmgOpp = function (n) { return function (ctx, ev) { return ctx.damage(ctx.opp, num(n, ctx, ev)); }; };
  // Deal n damage to the first target (ctx.targets[0]) — monster or player.
  Fx.dmgTarget = function (n) { return function (ctx, ev) { const t = ctx.targets[0]; return t ? ctx.damage(t, num(n, ctx, ev)) : Promise.resolve(0); }; };
  // Deal n damage to every enemy monster (incl. phantoms).
  Fx.dmgAllEnemyMonsters = function (n) {
    return async function (ctx, ev) { const k = num(n, ctx, ev); const list = ctx.monstersOf(ctx.opp).slice(); for (let i = 0; i < list.length; i++) await ctx.damage(list[i], k); };
  };
  // Deal n damage to opponent AND all their monsters (雷帝).
  Fx.dmgOppAndBoard = function (n) { return Fx.seq(Fx.dmgOpp(n), Fx.dmgAllEnemyMonsters(n)); };
  // Heal self n.
  Fx.heal = function (n) { return function (ctx, ev) { ctx.heal(ctx.me, num(n, ctx, ev)); }; };
  // Lose n life (own).
  Fx.loseLife = function (n) { return function (ctx, ev) { return ctx.loseLife(ctx.me, num(n, ctx, ev)); }; };

  // ---- counters ----
  // Put n curse on the opponent.
  Fx.curse = function (n) { return function (ctx, ev) { return ctx.addCurse(ctx.opp, num(n, ctx, ev)); }; };
  // Put n curse on self.
  Fx.selfCurse = function (n) { return function (ctx, ev) { return ctx.addCurse(ctx.me, num(n, ctx, ev)); }; };
  // Remove all own curse.
  Fx.cleanseCurse = function () { return function (ctx) { ctx.removeCurse(ctx.me, ctx.me.curse); }; };
  // Add n to own chain.
  Fx.addChain = function (n) { return function (ctx, ev) { return ctx.addChain(num(n, ctx, ev)); }; };
  // Gain an extra turn.
  Fx.extraTurn = function () { return function (ctx) { return ctx.extraTurn(ctx.me); }; };
  // Put this card into the seal zone (鍵カード). Call first in onPlay for key spells.
  Fx.seal = function () { return function (ctx) { return ctx.addSeal(ctx.card, ctx.me); }; };

  // ---- zones ----
  // Destroy the first target.
  Fx.destroyTarget = function () { return function (ctx) { const t = ctx.targets[0]; return t && t.uid !== undefined ? ctx.destroy(t) : Promise.resolve(false); }; };
  // Exile the first target.
  Fx.exileTarget = function () { return function (ctx) { const t = ctx.targets[0]; return t && t.uid !== undefined ? ctx.exile(t) : Promise.resolve(false); }; };
  // Return the first target to hand.
  Fx.bounceTarget = function () { return function (ctx) { const t = ctx.targets[0]; return t && t.uid !== undefined ? ctx.returnToHand(t) : Promise.resolve(false); }; };
  // Steal the first target monster.
  Fx.stealTarget = function () { return function (ctx) { const t = ctx.targets[0]; return t && t.uid !== undefined ? ctx.steal(t, ctx.me) : Promise.resolve(null); }; };
  // Create `count` phantoms of the first target (or of this card when self=true).
  Fx.phantomOfTarget = function (count, opts) {
    return function (ctx) { const t = ctx.targets[0]; return t && t.uid !== undefined ? ctx.createPhantom(t, ctx.me, Object.assign({ count: count || 1 }, opts || {})) : Promise.resolve([]); };
  };
  // Create `count` phantoms of this card itself (霧の双子).
  Fx.phantomOfSelf = function (count, opts) { return function (ctx) { return ctx.createPhantom(ctx.card, ctx.me, Object.assign({ count: count || 1 }, opts || {})); }; };
  // Summon a monster by defId onto own board.
  Fx.summon = function (defId, opts) { return function (ctx) { return ctx.summon(defId, ctx.me, opts); }; };
  // Exile all cards in opponent's grave.
  Fx.exileOppGrave = function () {
    return async function (ctx) { const list = ctx.opp.grave.slice(); for (let i = 0; i < list.length; i++) await ctx.exile(list[i]); };
  };
  // Vanish all enemy phantoms.
  Fx.clearOppPhantoms = function () { return function (ctx) { ctx.opp.phantoms.slice().forEach(function (p) { ctx.vanishPhantom(p); }); }; };
  // Pick one of own grave cards matching pred and return it to hand.
  Fx.recoverFromGrave = function (pred, prompt) {
    return async function (ctx) {
      const picked = await ctx.pick({ kind: 'graveCard', side: 'ally', count: 1, filter: function (c, inst) { return !pred || pred(inst, G.CardDB.get(inst.defId)); }, prompt: prompt || '手札に戻すカードを選ぶ' });
      if (picked[0]) await ctx.addToHand(picked[0], ctx.me);
      return picked[0] || null;
    };
  };
  // Revive one own grave monster matching pred.
  Fx.reviveFromGrave = function (pred, prompt) {
    return async function (ctx) {
      const picked = await ctx.pick({ kind: 'graveCard', side: 'ally', count: 1, filter: function (c, inst) { const d = G.CardDB.get(inst.defId); return d.type === 'monster' && (!pred || pred(inst, d)); }, prompt: prompt || '場に出すモンスターを選ぶ' });
      if (picked[0]) await ctx.reviveFromGrave(picked[0], ctx.me);
      return picked[0] || null;
    };
  };
  // Add a copy of defId to own hand.
  Fx.addCopyToHand = function (defId) { return function (ctx) { return ctx.addToHand(defId, ctx.me, { isCopy: true }); }; };

  // ---- statuses ----
  // Set a status on self until the end of this turn.
  Fx.statusThisTurn = function (key, value) { return function (ctx) { ctx.setStatus(ctx.me, key, value, { untilEndOfTurnOf: 'thisTurn' }); }; };
  // Set a status on the opponent during their next turn (reserve-style, from a normal spell).
  Fx.statusOppNextTurn = function (key, value) { return function (ctx) { ctx.setStatus(ctx.opp, key, value, { untilEndOfTurnOf: 'opponentNext' }); }; };
  // Set a permanent status on self.
  Fx.statusPermanent = function (key, value, who) { return function (ctx) { ctx.setStatus(who === 'opp' ? ctx.opp : ctx.me, key, value); }; };
  // Next spell this turn fires k times (写し身の儀).
  Fx.nextSpellTimes = function (k) { return function (ctx) { ctx.me.nextSpellTimes = k; }; };
  // Next monster's onSummon fires k times (鏡の破片).
  Fx.nextSummonTimes = function (k) { return function (ctx) { ctx.me.nextSummonTimes = k; }; };
  // Next spell costs delta less/more (迅雷の閃き).
  Fx.nextSpellCost = function (delta) { return function (ctx) { ctx.me.nextSpellCostDelta += delta; }; };

  // ---- predicates / numbers (for Fx.when / numeric args) ----
  Fx.chainAtLeast = function (n) { return function (ctx) { return ctx.chainOf(ctx.me) >= n; }; };
  Fx.chain = function (mult) { return function (ctx) { return ctx.chainOf(ctx.me) * (mult || 1); }; };
  Fx.manaGained = function (mult) { return function (ctx) { return ctx.me.manaGainedThisTurn * (mult || 1); }; };
  Fx.drawnThisTurn = function (mult) { return function (ctx) { return ctx.me.drawnThisTurn * (mult || 1); }; };
  Fx.myMonsterCount = function (mult) { return function (ctx) { return ctx.monstersOf(ctx.me).length * (mult || 1); }; };
  Fx.graveCount = function (pred, mult) { return function (ctx) { return ctx.countZone(ctx.me, 'grave', pred) * (mult || 1); }; };
  Fx.oppCurse = function (mult) { return function (ctx) { return ctx.opp.curse * (mult || 1); }; };
  Fx.streak = function (mult) { return function (ctx) { return ctx.game.streak * (mult || 1); }; };
  Fx.xValue = function () { return function (ctx) { return ctx.choices.x || 0; }; };
  Fx.isMonster = function (inst, def) { return (def || G.CardDB.get(inst.defId)).type === 'monster'; };
  Fx.isSpell = function (inst, def) { return (def || G.CardDB.get(inst.defId)).type === 'spell'; };
  Fx.hasTag = function (tag) { return function (inst, def) { return (def || G.CardDB.get(inst.defId)).tags.indexOf(tag) >= 0; }; };
  Fx.isKey = function (inst, def) { return !!(def || G.CardDB.get(inst.defId)).key; };

  // ---- common target specs ----
  Fx.T = {
    enemyMonster: { kind: 'monster', side: 'enemy', count: 1, prompt: '相手のモンスターを選ぶ' },
    allyMonster: { kind: 'monster', side: 'ally', count: 1, prompt: '自分のモンスターを選ぶ' },
    allyBoardMonster: { kind: 'boardMonster', side: 'ally', count: 1, prompt: '自分のモンスターを選ぶ' },
    anyMonster: { kind: 'monster', side: 'any', count: 1, prompt: 'モンスターを選ぶ' },
    anyCrest: { kind: 'crest', side: 'any', count: 1, prompt: '紋章を選ぶ' },
    enemySeal: { kind: 'sealCard', side: 'enemy', count: 1, prompt: '相手の封印ゾーンのカードを選ぶ' },
    allyTimed: { kind: 'timedCard', side: 'ally', count: 1, prompt: '自分の時限カードを選ぶ' },
    allyHand: { kind: 'handCard', side: 'ally', count: 1, prompt: '手札のカードを選ぶ' },
    enemyHand: { kind: 'handCard', side: 'enemy', count: 1, prompt: '相手の手札のカードを選ぶ' },
    allyGrave: { kind: 'graveCard', side: 'ally', count: 1, prompt: '墓地のカードを選ぶ' }
  };

  G.Fx = Fx;
})(globalThis.G = globalThis.G || {});
