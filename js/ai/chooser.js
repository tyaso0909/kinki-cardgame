(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // js/ai/chooser.js — name lookups, card/monster valuation and the
  // greedy pick chooser used by AI players (and as the auto-resolver
  // for the human side).
  //
  //   G.AI.cardId(name)                 → defId|null (by Japanese name; ids pass through)
  //   G.AI.relicId(name)                → relicId|null
  //   G.AI.cardValue(def)               → generic worth of a card (for discards/tutors)
  //   G.AI.monsterThreat(game, inst)    → how dangerous an enemy monster is (SPEC order:
  //                                       engine → blocking disrupt → highest atk)
  //   G.AI.visibleHand(game, pIdx)      → opponent hand cards the AI may legitimately see
  //   G.AI.makeChooser(style)           → (spec, candidates, game, ctx) => choice
  //   G.AI.choosePick(spec, cands, game, who, style, hint)
  //   G.AI.playerChooserDefault         → auto-resolver for the human side
  // ---------------------------------------------------------------
  const AI = G.AI = G.AI || {};

  // ---- name → id (cached, invalidated when the registry grows) ----------
  let nameCache = null, nameCacheCount = -1;
  AI.cardId = function (name) {
    if (!name) return null;
    if (G.CardDB.has(name)) return name;
    if (nameCacheCount !== G.CardDB.count()) {
      nameCache = new Map();
      G.CardDB.all().forEach(function (d) { if (!nameCache.has(d.name)) nameCache.set(d.name, d.id); });
      nameCacheCount = G.CardDB.count();
    }
    return nameCache.get(name) || null;
  };
  AI.cardIds = function (names) {
    return (names || []).map(AI.cardId).filter(function (id) { return !!id; });
  };
  let relicCache = null, relicCacheCount = -1;
  AI.relicId = function (name) {
    if (!name) return null;
    if (G.RelicDB.has(name)) return name;
    if (relicCacheCount !== G.RelicDB.count()) {
      relicCache = new Map();
      G.RelicDB.all().forEach(function (d) { if (!relicCache.has(d.name)) relicCache.set(d.name, d.id); });
      relicCacheCount = G.RelicDB.count();
    }
    return relicCache.get(name) || null;
  };
  AI.defOf = function (x) { return typeof x === 'string' ? G.CardDB.get(x) : G.CardDB.get(x.defId); };

  // ---- valuation ---------------------------------------------------------
  const ROLE_W = { engine: 3, finisher: 3, disrupt: 2.5, fuel: 1 };
  const RARITY_W = { common: 0, rare: 1.5, legend: 3, taboo: 4, boss: 3 };
  const PASSIVE_HOOKS = ['onCardPlayed', 'onSpellPlayed', 'onManaGained', 'onDraw', 'onTurnStart', 'onTurnEnd',
    'onMonsterDestroyed', 'onMonsterSummoned', 'onPhantomCreated', 'onSpellToGrave', 'onDamageDealt', 'onExtraTurn',
    'onCurseAdded', 'onLoopIteration', 'onChainReached', 'modCost', 'modManaGain', 'modChain', 'modDamage', 'modDrawCount', 'grants'];

  AI.hasPassive = function (def) {
    const fx = def.effects || {};
    for (let i = 0; i < PASSIVE_HOOKS.length; i++) if (fx[PASSIVE_HOOKS[i]]) return true;
    return false;
  };
  AI.isEngineLike = function (def) {
    return def.role === 'engine' || def.type === 'crest' || def.type === 'field' || (def.type === 'monster' && AI.hasPassive(def));
  };

  // Generic worth of a card irrespective of game state.
  AI.cardValue = function (def) {
    if (!def) return 0;
    let v = (ROLE_W[def.role] || 1) + (RARITY_W[def.rarity] || 0);
    if (def.type === 'monster') {
      v += (typeof def.atk === 'number' ? def.atk : 3) * 0.5 + (typeof def.hp === 'number' ? def.hp : 3) * 0.3;
      if (def.keywords.indexOf('rush') >= 0) v += 0.5;
      if (def.keywords.indexOf('guard') >= 0) v += 0.5;
      if (AI.hasPassive(def)) v += 1.5;
    } else if (def.type === 'crest') v += 1;
    else if (def.type === 'field') v += 0.5;
    if (def.tags.indexOf('loopPart') >= 0) v += 1;
    if (def.tags.indexOf('extraTurn') >= 0) v += 2;
    if (def.tags.indexOf('finisher') >= 0) v += 1;
    if (def.key) v += 1.5;
    return v;
  };

  // Threat of an opposing monster (SPEC: engine → disrupt that blocks us → highest atk).
  AI.monsterThreat = function (game, inst) {
    const def = G.CardDB.get(inst.defId);
    let t = game.atkOf(inst) + game.hpOf(inst) * 0.4;
    if (def.role === 'engine' || (def.type === 'monster' && AI.hasPassive(def))) t += 12;
    if (def.role === 'disrupt') t += 7;
    if (inst.keywords.indexOf('guard') >= 0) t += 1;
    t += (RARITY_W[def.rarity] || 0);
    if (inst.isPhantom) t *= 0.6;
    return t;
  };

  // Value of a permanent (crest/field/seal) seen from its owner's side.
  AI.permanentValue = function (game, inst) {
    const def = G.CardDB.get(inst.defId);
    let v = AI.cardValue(def) + 1;
    if (def.effects && def.effects.indestructible) v += 1;
    return v;
  };

  // Benefit of losing (destroying / bouncing) one of our own monsters: loop parts love it.
  AI.lossBenefit = function (def) {
    const fx = def.effects || {};
    let b = 0;
    if (typeof fx.onLeave === 'function') b += 5;
    if (typeof fx.onDeath === 'function') b += 3;
    if (typeof fx.onSummon === 'function') b += 1.5;
    if (def.tags.indexOf('loopPart') >= 0) b += 3;
    return b;
  };

  // Opponent hand cards the AI may see: only when a card/relic effect revealed them.
  AI.visibleHand = function (game, pIdx) {
    const opp = game.players[1 - pIdx];
    if (game.status(opp.idx, 'handRevealed')) return opp.hand.slice();
    return opp.hand.filter(function (c) { return c.flags && (c.flags.revealed || c.flags.revealedTo === pIdx); });
  };

  // ---- combo awareness (optional dependency on G.Combos) -----------------
  function comboBonus(game, who, defId) {
    if (!G.Combos || !G.Combos.deckCombos) return 0;
    const combos = G.Combos.deckCombos(game, who);
    let b = 0;
    for (let i = 0; i < combos.length; i++) {
      const ids = G.Combos.ids(combos[i]);
      if (ids.parts.indexOf(defId) >= 0) b = Math.max(b, 6);
      else if (ids.finisher.indexOf(defId) >= 0) b = Math.max(b, 4.5);
    }
    return b;
  }

  // ---- intent inference ----------------------------------------------------
  // 'keep'  : choose cards to KEEP (hand limit)            → best
  // 'gain'  : tutor / recover / revive                     → best
  // 'lose'  : sacrifice / discard / bounce / remove own    → cheapest (loop parts first)
  // 'hurt'  : target an opponent's card                    → biggest threat
  // 'best'  : beneficial effect on own permanent (copy it) → strongest
  function inferIntent(spec, cands, game, who) {
    if (spec.aiHint) return spec.aiHint;
    const prompt = spec.prompt || '';
    const allyCands = cands.filter(function (c) { return c.owner === who; });
    const enemyCands = cands.filter(function (c) { return c.owner !== who && c.owner !== undefined; });
    if (enemyCands.length && (spec.side === 'enemy' || spec.side === 'any' || !allyCands.length)) return 'hurt';
    const limit = game.status(who, 'handLimit') || G.Engine.Game.HAND_LIMIT;
    switch (spec.kind) {
      case 'handCard':
        if (/残す/.test(prompt) || (spec.count || 1) >= limit) return 'keep';
        return 'lose';
      case 'graveCard': case 'deckCard': case 'exileCard': case 'vaultCard': return 'gain';
      case 'crest': return /戻|手札/.test(prompt) ? 'gain' : 'lose';
      case 'sealCard': return 'lose';
      case 'timedCard': return 'best';
      case 'monster': case 'boardMonster': case 'phantom': case 'card':
        if (/破壊|捨て|戻す|生け贄|除外|取り除/.test(prompt)) return 'lose';
        return 'best';
      default: return 'best';
    }
  }

  function scoreFor(intent, inst, game, who) {
    const def = G.CardDB.get(inst.defId);
    const base = AI.cardValue(def) + comboBonus(game, who, inst.defId);
    switch (intent) {
      case 'hurt':
        if (inst.zone === 'board' || inst.zone === 'phantoms') return AI.monsterThreat(game, inst) + comboBonus(game, inst.owner, inst.defId) * 0.5;
        if (inst.zone === 'hand' || inst.zone === 'deck' || inst.zone === 'grave') {
          let s = base;
          if (def.role === 'finisher' || def.tags.indexOf('finisher') >= 0) s += 6;
          if (AI.isEngineLike(def)) s += 4;
          if (def.role === 'disrupt') s += 3;
          return s;
        }
        return AI.permanentValue(game, inst) + comboBonus(game, inst.owner, inst.defId);
      case 'lose': {
        let s = base;
        if (inst.zone === 'board' || inst.zone === 'phantoms') s = game.atkOf(inst) + game.hpOf(inst) * 0.5 + (def.role === 'engine' ? 3 : 0) - AI.lossBenefit(def) * 1.5;
        if (inst.isPhantom) s -= 4;
        return -s; // lowest value first
      }
      case 'best': {
        let s = base;
        if (inst.zone === 'board' || inst.zone === 'phantoms') s = game.atkOf(inst) * 1.2 + game.hpOf(inst) * 0.5 + (typeof def.effects.onSummon === 'function' ? 2 : 0);
        if (inst.zone === 'timed') s = 10 - (inst.timedCount || 0); // closest to firing
        return s;
      }
      default: // keep / gain
        return base;
    }
  }

  // Style preferences for 'option' picks ({id,label}).
  function chooseOption(spec, options, game, who, style) {
    const p = game.players[who];
    const ids = options.map(function (o) { return o.id; });
    const labels = options.map(function (o) { return String(o.label || ''); });
    function byId(re) { for (let i = 0; i < options.length; i++) if (re.test(String(ids[i])) || re.test(labels[i])) return options[i].id; return null; }
    const mana = byId(/mana|マナ/), draw = byId(/draw|引く|ドロー/);
    if (mana && draw) {
      if (style === 'charge') return p.hand.length >= 6 ? mana : draw;
      return p.hand.length >= 4 ? mana : draw;
    }
    const prefs = {
      speed: [/damage|ダメージ|攻撃/], charge: [/draw|引く/, /mana|マナ/], specialWin: [/呪詛|鍵|封印/],
      disrupt: [/破壊|除外|捨て|妨害/], assemble: [/mana|マナ/, /draw|引く/], mirror: [/コピー|写し/, /draw|引く/]
    };
    const list = prefs[style] || [];
    for (let i = 0; i < list.length; i++) { const id = byId(list[i]); if (id) return id; }
    return options[0].id;
  }

  // Core: choose from candidates for player `who`.
  AI.choosePick = function (spec, cands, game, who, style, hint) {
    if (spec.kind === 'option') return chooseOption(spec, cands, game, who, style);
    if (!cands || !cands.length) return spec.kind === 'player' ? null : [];
    if (spec.kind === 'player') {
      const wantSelf = spec.aiHint === 'self' || /自分/.test(spec.prompt || '');
      const me = cands.find(function (c) { return c.idx === who; });
      const opp = cands.find(function (c) { return c.idx !== who; });
      return (wantSelf ? me : opp) || cands[0];
    }
    const count = spec.count || 1;
    const intent = hint || inferIntent(spec, cands, game, who);
    let pool = cands;
    if (intent === 'hurt') {
      const enemies = cands.filter(function (c) { return c.owner !== who; });
      if (enemies.length) pool = enemies;
      else if (spec.optional || spec.upTo) return [];
    }
    const scored = pool.map(function (c) { return { c: c, s: scoreFor(intent, c, game, who) }; });
    scored.sort(function (a, b) { return b.s - a.s; });
    // optional detrimental picks: skip when nothing is worth losing
    if (intent === 'lose' && (spec.optional || spec.upTo)) return [];
    return scored.slice(0, count).map(function (x) { return x.c; });
  };

  AI.makeChooser = function (style) {
    return function aiChooser(spec, cands, game, ctx) {
      let who = game.pendingChoice && game.pendingChoice.who !== undefined ? game.pendingChoice.who : null;
      if (who === null) who = spec.chooser !== undefined ? spec.chooser : (ctx && ctx.me ? ctx.me.idx : game.active);
      return AI.choosePick(spec, cands, game, who, style);
    };
  };

  // Human side: used when the UI delegates auto-resolvable picks (single candidate, or no UI attached).
  AI.playerChooserDefault = function (spec, cands, game, ctx) {
    if (spec.kind === 'option') return cands.length ? cands[0].id : null;
    if (!cands || !cands.length) return spec.kind === 'player' ? null : [];
    const n = spec.count || 1;
    if (cands.length <= n && spec.kind !== 'player') return cands.slice();
    let who = game.pendingChoice && game.pendingChoice.who !== undefined ? game.pendingChoice.who : (ctx && ctx.me ? ctx.me.idx : game.active);
    return AI.choosePick(spec, cands, game, who, null);
  };
})(globalThis.G = globalThis.G || {});
