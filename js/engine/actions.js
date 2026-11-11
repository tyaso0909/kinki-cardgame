(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // actions.js — the `ctx` object handed to every hook, with all
  // state-mutating action methods (resources, damage, zones, counters,
  // choices). Card play / attack / abilities live in play.js.
  // ---------------------------------------------------------------
  const Game = G.Engine.Game;
  const util = G.util;

  function Ctx(game, pIdx, card, opts) {
    opts = opts || {};
    this.game = game;
    this.owner = game.players[pIdx]; // the hook owner's controller (never swapped by invert/actAs)
    this.me = game.players[pIdx];
    this.opp = game.players[1 - pIdx];
    if (opts.invertible && game.status(pIdx, 'invertEffects')) {
      this.me = game.players[1 - pIdx]; this.opp = game.players[pIdx]; this.inverted = true;
    }
    if (opts.actAs !== undefined && opts.actAs !== null) {
      this.me = game.players[opts.actAs]; this.opp = game.players[1 - opts.actAs];
    }
    this.card = card || null;
    this.source = opts.source || card || null;
    this.relic = opts.relic || null;
    this.reserve = opts.reserve || null;
    this.targets = opts.targets || [];
    this.choices = opts.choices || {};
    this.rng = game.rng;
  }

  const P = Ctx.prototype;

  P.who = function (who) { return who === undefined || who === null ? this.me : this.game.player(who); };
  P.log = function (msg, data) { return this.game.addLog(msg, data); };
  P.emit = function (type, payload) { this.game.emit(type, payload); };
  P.isMyTurn = function () { return this.game.active === this.me.idx; };
  P.turn = function () { return this.game.turn; };
  P.defOf = function (inst) { return G.CardDB.get((inst || this.card).defId); };
  P.rarityOf = function (def) { return (def.defId ? G.CardDB.get(def.defId) : def).rarity; };
  P.countZone = function (who, zone, pred) {
    const arr = this.who(who)[zone] || [];
    if (!pred) return arr.length;
    let n = 0; for (let i = 0; i < arr.length; i++) if (pred(arr[i])) n++;
    return n;
  };
  P.monstersOf = function (who) { return this.game.monstersOf(this.who(who)); };
  P.status = function (who, key) { return this.game.status(this.who(who), key); };
  P.setStatus = function (who, key, value, opts) {
    opts = Object.assign({ sourceUid: this.card ? this.card.uid : null }, opts || {});
    return this.game.setStatus(this.who(who), key, value, opts);
  };
  P.clearStatus = function (who, key) { return this.game.clearStatus(this.who(who), key); };
  P.chainOf = function (who) { return this.game.chainOf(this.who(who)); };
  P.atkOf = function (inst) { return this.game.atkOf(inst); };
  P.hpOf = function (inst) { return this.game.hpOf(inst); };
  P.hasKeyword = function (inst, kw) { return this.game.hasKeyword(inst, kw); };
  P.specialWin = function (who, reason) { return this.game.specialWin(this.who(who), reason); };
  P.checkWin = function () { return this.game.checkWin(); };
  P.nameOf = function (inst) { return G.CardDB.get(inst.defId).name; };

  // ---- resources -------------------------------------------------------
  P.gainMana = async function (n, who) {
    const p = this.who(who);
    const g = this.game;
    if (n <= 0) return 0;
    let amount = n;
    if (g.status(p.idx, 'manaGainHalved')) amount = Math.floor(amount / 2);
    amount = g.modify('modManaGain', { who: p.idx, amount: amount, source: this.card }, 'amount');
    if (amount <= 0) return 0;
    p.mana += amount;
    p.manaGainedThisTurn += amount;
    g.emit('manaChange', { who: p.idx, mana: p.mana, delta: amount });
    this.log(p.name + 'はマナ+' + amount + '（' + p.mana + '）');
    if (g._manaDepth === 0) {
      g._manaDepth++;
      try { await g.trigger('onManaGained', { amount: amount, who: p.idx, source: this.card }); }
      finally { g._manaDepth--; }
    }
    return amount;
  };
  P.loseMana = function (n, who) {
    const p = this.who(who);
    const d = Math.min(p.mana, Math.max(0, n));
    p.mana -= d;
    this.game.emit('manaChange', { who: p.idx, mana: p.mana, delta: -d });
    if (d) this.log(p.name + 'はマナ-' + d);
    return d;
  };
  P.setMana = function (n, who) {
    const p = this.who(who);
    const d = n - p.mana;
    p.mana = Math.max(0, n);
    this.game.emit('manaChange', { who: p.idx, mana: p.mana, delta: d });
    this.log(p.name + 'のマナは' + p.mana + 'になった');
    return p.mana;
  };
  P.gainMaxMana = function (n, who) {
    const p = this.who(who);
    p.maxMana = Math.max(0, p.maxMana + n);
    this.game.emit('manaChange', { who: p.idx, mana: p.mana, maxMana: p.maxMana, delta: 0 });
    this.log(p.name + 'の最大マナ' + (n >= 0 ? '+' : '') + n + '（' + p.maxMana + '）');
    return p.maxMana;
  };

  // ---- deck / hand -------------------------------------------------------
  // deck[0] is the top of the deck.
  P.draw = async function (n, who, opts) {
    const p = this.who(who);
    const g = this.game;
    opts = opts || {};
    if (n === undefined) n = 1;
    if (!opts.noModify) n = g.modify('modDrawCount', { who: p.idx, count: n }, 'count');
    const drawn = [];
    for (let i = 0; i < n; i++) {
      if (!p.deck.length) {
        p.deckedOut = true;
        this.log(p.name + 'は山札からカードを引けない！');
        g.emit('deckout', { who: p.idx });
        break;
      }
      const c = p.deck.shift();
      c.zone = 'hand'; p.hand.push(c); g._ver++;
      p.drawnThisTurn++;
      drawn.push(c);
      g.emit('draw', { who: p.idx, uid: c.uid, defId: c.defId });
      this.log(p.name + 'は' + this.nameOf(c) + 'を引いた');
      await g.trigger('onDraw', { card: c, who: p.idx });
      if (g.winner !== null) break;
    }
    if (p.hand.length === 0 && drawn.length === 0) await g.trigger('onHandEmpty', { who: p.idx });
    return drawn;
  };

  P.discard = async function (cardsOrN, who, opts) {
    const p = this.who(who);
    let cards;
    if (typeof cardsOrN === 'number') {
      cards = [];
      const pool = p.hand.slice();
      for (let i = 0; i < cardsOrN && pool.length; i++) cards.push(pool.splice(this.rng.int(pool.length), 1)[0]);
    } else cards = [].concat(cardsOrN);
    for (let i = 0; i < cards.length; i++) {
      const c = cards[i];
      if (c.zone !== 'hand') continue;
      this.log(p.name + 'は' + this.nameOf(c) + 'を捨てた');
      this.game.emit('discard', { who: p.idx, uid: c.uid, defId: c.defId });
      await this.toGrave(c, { reason: 'discard' });
      await this.game.trigger('onDiscard', { card: c, who: p.idx });
    }
    return cards;
  };

  P.mill = async function (n, who) {
    const p = this.who(who);
    const out = [];
    for (let i = 0; i < n && p.deck.length; i++) {
      const c = p.deck[0];
      out.push(c);
      await this.toGrave(c, { reason: 'mill' });
    }
    if (out.length) this.log(p.name + 'の山札の上から' + out.length + '枚が墓地に送られた');
    return out;
  };

  // Search `from` zone (default deck) for a card matching pred; moves it to hand. Shuffles deck afterwards.
  P.tutor = async function (pred, who, opts) {
    const p = this.who(who);
    opts = opts || {};
    const from = opts.from || 'deck';
    const cands = p[from].filter(function (c) { return !pred || pred(c, G.CardDB.get(c.defId)); });
    if (!cands.length) { this.log(p.name + 'は探したが見つからなかった'); if (from === 'deck') this.shuffleDeck(p); return null; }
    let chosen;
    if (opts.random) chosen = this.rng.pick(cands);
    else {
      const picked = await this.pick({ kind: from + 'Card', side: 'any', count: 1, filter: function (ctx, c) { return cands.indexOf(c) >= 0; }, prompt: opts.prompt || '手札に加えるカードを選ぶ', who: p.idx });
      chosen = picked[0] || cands[0];
    }
    await this.addToHand(chosen, p);
    if (from === 'deck') this.shuffleDeck(p);
    return chosen;
  };

  P.lookTop = function (n, who) { return this.who(who).deck.slice(0, n); };
  P.putOnTop = function (cards, who) {
    const p = this.who(who);
    cards = [].concat(cards);
    for (let i = cards.length - 1; i >= 0; i--) { this.game.removeFromZone(cards[i]); cards[i].owner = p.idx; cards[i].zone = 'deck'; p.deck.unshift(cards[i]); }
    this.game._ver++;
    return cards;
  };
  P.putOnBottom = function (cards, who) {
    const p = this.who(who);
    cards = [].concat(cards);
    for (let i = 0; i < cards.length; i++) { this.game.removeFromZone(cards[i]); cards[i].owner = p.idx; cards[i].zone = 'deck'; p.deck.push(cards[i]); }
    this.game._ver++;
    return cards;
  };
  P.shuffleDeck = function (who) { const p = this.who(who); this.rng.shuffle(p.deck); this.game.emit('shuffle', { who: p.idx }); return p.deck; };
  P.shuffleGraveIntoDeck = function (who) {
    const p = this.who(who);
    const n = p.grave.length;
    while (p.grave.length) { const c = p.grave.pop(); c.zone = 'deck'; p.deck.push(c); }
    this.game._ver++;
    this.shuffleDeck(p);
    this.log(p.name + 'の墓地' + n + '枚を山札に戻してシャッフルした');
    return n;
  };
  P.shuffleHandIntoDeck = function (who) {
    const p = this.who(who);
    const n = p.hand.length;
    while (p.hand.length) { const c = p.hand.pop(); c.zone = 'deck'; p.deck.push(c); }
    this.game._ver++;
    this.shuffleDeck(p);
    return n;
  };

  // ---- damage / life -----------------------------------------------------
  // target: Player | CardInst | 'face' (opponent) | 'opp' | 'me' | pIdx
  P.resolveTarget = function (target) {
    if (target === 'face' || target === 'opp' || target === undefined || target === null) return this.opp;
    if (target === 'me' || target === 'self') return this.me;
    if (typeof target === 'number') return this.game.players[target];
    if (target.uid !== undefined) return target;
    return target;
  };

  P.damage = async function (target, n, opts) {
    opts = opts || {};
    const g = this.game;
    target = this.resolveTarget(target);
    if (n <= 0 || g.winner !== null) return 0;
    const source = opts.source !== undefined ? opts.source : this.card;
    const srcOwner = opts.sourceOwner !== undefined ? opts.sourceOwner : (source && source.owner !== undefined ? source.owner : this.me.idx);
    // 反射の鏡盾: the first damage dealt by srcOwner this turn hits srcOwner instead
    if (!opts.noReflect && srcOwner !== undefined && g.explicitStatus(srcOwner, 'reflectFirstDamage')) {
      g.clearStatus(srcOwner, 'reflectFirstDamage');
      this.log('ダメージが跳ね返った！');
      return this.damage(g.players[srcOwner], n, Object.assign({}, opts, { noReflect: true }));
    }
    const isPlayer = target.idx !== undefined && target.life !== undefined;
    const victimIdx = isPlayer ? target.idx : target.owner;
    const ev = { source: source, sourceOwner: srcOwner, target: target, amount: n, who: victimIdx, isPlayer: isPlayer };
    let amount = g.modify('modDamage', ev, 'amount');
    if (isPlayer) amount += g.status(target.idx, 'damageTakenDelta') || 0;
    amount = Math.max(0, Math.floor(amount));
    if (amount <= 0) return 0;
    if (isPlayer) {
      target.life -= amount;
      this.log(target.name + 'に' + amount + 'ダメージ（残り' + target.life + '）');
    } else {
      if (!g.isInPlay(target)) return 0;
      target.damage += amount;
      this.log(this.nameOf(target) + 'に' + amount + 'ダメージ');
    }
    g.emit('damage', { source: source ? source.uid : null, sourceOwner: srcOwner, target: isPlayer ? 'player' : target.uid, who: victimIdx, amount: amount });
    if (srcOwner !== undefined && srcOwner !== null) {
      const sp = g.players[srcOwner];
      sp.stats.damageDealt += amount;
      if (isPlayer && amount > sp.maxDamageDealtOnce) sp.maxDamageDealtOnce = amount;
    }
    await g.trigger('onDamageDealt', { source: source, sourceOwner: srcOwner, target: target, amount: amount, who: srcOwner });
    if (isPlayer) {
      await g.trigger('onPlayerDamaged', { who: target.idx, amount: amount, source: source });
    } else if (g.isInPlay(target)) {
      const def = G.CardDB.get(target.defId);
      if (typeof def.effects.onDamaged === 'function') await def.effects.onDamaged(g.makeCtx(target.owner, target), amount);
      if (g.hpOf(target) <= 0) await this.destroy(target, { source: source });
    }
    g.checkWin();
    return amount;
  };

  P.heal = function (who, n) {
    const p = this.who(who);
    const before = p.life;
    p.life = Math.min(p.maxLife, p.life + Math.max(0, n));
    const d = p.life - before;
    if (d) { this.log(p.name + 'はライフ+' + d + '（' + p.life + '）'); this.game.emit('heal', { who: p.idx, amount: d }); }
    return d;
  };
  P.loseLife = async function (who, n) {
    const p = this.who(who);
    if (n <= 0) return 0;
    p.life -= n;
    this.log(p.name + 'はライフを' + n + '失った（' + p.life + '）');
    this.game.emit('damage', { source: this.card ? this.card.uid : null, target: 'player', who: p.idx, amount: n, lifeLoss: true });
    await this.game.trigger('onLifeLost', { who: p.idx, amount: n, source: this.card });
    this.game.checkWin();
    return n;
  };
  P.setLife = function (who, n) {
    const p = this.who(who);
    p.life = n;
    this.log(p.name + 'のライフは' + n + 'になった');
    this.game.emit('damage', { target: 'player', who: p.idx, amount: 0, setLife: n });
    this.game.checkWin();
  };

  // ---- zones ------------------------------------------------------------------
  // Summon a monster (CardInst or defId) onto who's board. Returns inst or null if board full.
  P.summon = async function (cardOrDef, who, opts) {
    opts = opts || {};
    const p = this.who(who);
    const g = this.game;
    const inst = typeof cardOrDef === 'string' ? g.createCardInst(cardOrDef, p.idx, { isCopy: !!opts.isCopy }) : cardOrDef;
    const def = G.CardDB.get(inst.defId);
    const asPhantom = !!opts.asPhantom || inst.isPhantom;
    if (asPhantom) {
      if (p.phantoms.length >= Game.PHANTOM_CAP) { this.log('幻影は30体まで'); return null; }
    } else if (p.board.length >= g.status(p.idx, 'maxBoard')) {
      this.log(p.name + 'の場はいっぱいだ');
      return null;
    }
    inst.isPhantom = asPhantom;
    if (opts.persistent) inst.persistent = true;
    if (inst.zone !== 'limbo') g.removeFromZone(inst);
    inst.owner = p.idx;
    inst.summonedTurn = g.turn;
    inst.attacksLeft = g.attacksPerTurn(inst);
    inst.exhausted = false;
    if (opts.resetDamage !== false) inst.damage = 0;
    if (typeof def.atk === 'number' && opts.keepStats !== true) { inst.atk = def.atk; inst.hp = def.hp; inst.maxHp = def.hp; }
    inst.zone = asPhantom ? 'phantoms' : 'board';
    p[inst.zone].push(inst); g._ver++;
    g.emit('summon', { who: p.idx, uid: inst.uid, defId: inst.defId, isPhantom: asPhantom });
    this.log(p.name + 'は' + def.name + (asPhantom ? 'の幻影' : '') + 'を場に出した');
    if (!asPhantom) await g.trigger('onMonsterSummoned', { card: inst, who: p.idx });
    const triggerSummon = opts.triggerSummon !== undefined ? opts.triggerSummon : (!asPhantom || g.status(p.idx, 'phantomSummonEffects'));
    if (triggerSummon && typeof def.effects.onSummon === 'function' && !g.status(p.idx, 'noMonsterTriggers')) {
      let times = g.effectTimes(p.idx, 'summon') * (p.nextSummonTimes || 1);
      p.nextSummonTimes = 1;
      for (let t = 0; t < times && g.isInPlay(inst) && g.winner === null; t++) {
        await def.effects.onSummon(g.makeCtx(p.idx, inst, { invertible: true, choices: opts.choices, targets: opts.targets }));
      }
    }
    g.checkWin();
    return inst;
  };

  // Create `count` phantom copies of a monster for `who`. Honors the 30 cap.
  P.createPhantom = async function (ofCard, who, opts) {
    opts = opts || {};
    const p = this.who(who);
    const g = this.game;
    const count = opts.count || 1;
    const out = [];
    const src = typeof ofCard === 'string' ? null : ofCard;
    const defId = src ? src.defId : ofCard;
    for (let i = 0; i < count; i++) {
      if (p.phantoms.length >= Game.PHANTOM_CAP) { this.log('幻影は30体まで'); break; }
      const ph = g.createCardInst(defId, p.idx, { isPhantom: true, isCopy: true });
      if (src) { ph.atk = src.atk; ph.hp = src.hp; ph.maxHp = src.maxHp; ph.keywords = src.keywords.slice(); ph.buffs = src.buffs.map(util.deepClone); }
      if (opts.keywords) opts.keywords.forEach(function (k) { if (ph.keywords.indexOf(k) < 0) ph.keywords.push(k); });
      if (opts.persistent || g.status(p.idx, 'phantomsPersist')) ph.persistent = true;
      ph.bornTurn = g.turn; // vanishes at the end of the first opponent turn that starts after this (turn.js endTurn)
      const res = await this.summon(ph, p, { asPhantom: true, keepStats: true, triggerSummon: opts.triggerSummon });
      if (!res) break;
      p.stats.phantomsCreated++;
      out.push(ph);
      g.emit('phantom', { who: p.idx, uid: ph.uid, defId: ph.defId });
      await g.trigger('onPhantomCreated', { card: ph, who: p.idx, of: src });
      if (g.winner !== null) break;
    }
    return out;
  };

  P.destroy = async function (inst, opts) {
    opts = opts || {};
    const g = this.game;
    if (!g.isInPlay(inst)) return false;
    const def = G.CardDB.get(inst.defId);
    const owner = g.players[inst.owner];
    const wasZone = inst.zone;
    if (wasZone === 'field') return this.destroyField();
    if (wasZone === 'crests') return this.removeCrest(inst);
    g.removeFromZone(inst); g._ver++;
    inst.zone = 'limbo'; inst.prevZone = wasZone;
    owner.destroyedThisTurn.push({ uid: inst.uid, defId: inst.defId, isPhantom: inst.isPhantom, turn: g.turn });
    this.log(def.name + (inst.isPhantom ? 'の幻影' : '') + 'は破壊された');
    g.emit('destroy', { who: owner.idx, uid: inst.uid, defId: inst.defId, isPhantom: inst.isPhantom, source: opts.source ? opts.source.uid : null });
    if (!inst.isPhantom && typeof def.effects.onDeath === 'function' && !g.status(owner.idx, 'noMonsterTriggers')) {
      const times = g.effectTimes(owner.idx, 'death');
      for (let t = 0; t < times && g.winner === null; t++) await def.effects.onDeath(g.makeCtx(owner.idx, inst, { invertible: true, source: opts.source }));
    } else if (inst.isPhantom && typeof def.effects.onDeath === 'function' && (opts.phantomDeathEffects || def.effects.phantomDeathEffects) && !g.status(owner.idx, 'noMonsterTriggers')) {
      await def.effects.onDeath(g.makeCtx(owner.idx, inst, { invertible: true, source: opts.source }));
    }
    if (typeof def.effects.onLeave === 'function') {
      const lctx = g.makeCtx(owner.idx, inst); lctx.leaveReason = 'destroy';
      await def.effects.onLeave(lctx, { reason: 'destroy' });
    }
    await g.trigger('onMonsterDestroyed', { card: inst, who: owner.idx, isPhantom: inst.isPhantom, source: opts.source });
    if (inst.zone === 'limbo') {
      if (inst.isPhantom || inst.isCopy) { inst.zone = 'void'; }
      else await this.toGrave(inst, { reason: 'destroy', silent: true });
    }
    g.checkWin();
    return true;
  };

  // Phantom simply disappears (end of turn / 霧払いの風). No onMonsterDestroyed.
  P.vanishPhantom = function (inst) {
    const g = this.game;
    if (inst.zone !== 'phantoms') return false;
    g.removeFromZone(inst); g._ver++;
    inst.zone = 'void';
    g.emit('vanish', { who: inst.owner, uid: inst.uid, defId: inst.defId });
    return true;
  };

  // Take a card out of its zone, firing onLeave if it was in play. onLeave may move the card
  // somewhere else (巡る不死鳥 → hand). Returns true if the card is free (limbo) for the caller to
  // place; false if the hook already relocated it. With `force` (exile / vault — destinations that
  // beat "return to hand") the hook's relocation is undone and true is returned.
  P._leave = async function (inst, reason, force) {
    const g = this.game;
    const inPlay = g.isInPlay(inst);
    const def = G.CardDB.get(inst.defId);
    if (inst.zone !== 'limbo') inst.prevZone = inst.zone;
    if (inst.zone === 'field') { g.field = null; g.fieldOwner = null; inst.zone = 'limbo'; g.emit('fieldSet', { uid: null }); }
    else g.removeFromZone(inst);
    g._ver++;
    if (inPlay && typeof def.effects.onLeave === 'function') {
      const ctx = g.makeCtx(inst.owner, inst);
      ctx.leaveReason = reason;
      await def.effects.onLeave(ctx, { reason: reason });
    }
    if (inst.zone !== 'limbo') {
      if (!force) return false;
      g.removeFromZone(inst); inst.zone = 'limbo';
    }
    return true;
  };

  P.toGrave = async function (inst, opts) {
    opts = opts || {};
    const g = this.game;
    if (inst.zone === 'void' || inst.zone === 'exile') return false;
    const wasPhantom = inst.isPhantom || inst.isCopy;
    const def = G.CardDB.get(inst.defId);
    const wasZone = inst.zone;
    if (!(await this._leave(inst, 'grave'))) return false; // onLeave relocated it (e.g. back to hand)
    if (wasPhantom) { inst.zone = 'void'; return false; }
    const owner = g.players[inst.stolenFrom !== null && opts.returnToOriginal ? inst.stolenFrom : inst.owner];
    inst.owner = owner.idx;
    inst.zone = 'grave'; inst.timedCount = null; inst.damage = 0; inst.buffs = [];
    owner.grave.push(inst); g._ver++;
    g.emit('moveZone', { uid: inst.uid, defId: inst.defId, who: owner.idx, from: wasZone, to: 'grave' });
    if (def.type === 'spell' && wasZone !== 'hand' && wasZone !== 'deck') await g.trigger('onSpellToGrave', { card: inst, who: owner.idx });
    return true;
  };

  P.exile = async function (inst) {
    const g = this.game;
    if (inst.zone === 'exile' || inst.zone === 'void') return false;
    const wasZone = inst.zone;
    const def = G.CardDB.get(inst.defId);
    if (wasZone === 'board' || wasZone === 'phantoms') {
      g.players[inst.owner].destroyedThisTurn.push({ uid: inst.uid, defId: inst.defId, isPhantom: inst.isPhantom, exiled: true, turn: g.turn });
    }
    await this._leave(inst, 'exile', true); // exile beats any "return to hand" relocation
    if (inst.isPhantom || inst.isCopy) { inst.zone = 'void'; return true; }
    const owner = g.players[inst.owner];
    inst.zone = 'exile'; inst.timedCount = null; inst.damage = 0; inst.buffs = [];
    owner.exile.push(inst); g._ver++;
    this.log(def.name + 'は除外された');
    g.emit('moveZone', { uid: inst.uid, defId: inst.defId, who: owner.idx, from: wasZone, to: 'exile' });
    return true;
  };

  P.returnToHand = async function (inst, opts) {
    opts = opts || {};
    const g = this.game;
    if (inst.isPhantom || inst.isCopy) { this.vanishPhantom(inst); return false; }
    // when called from an onLeave hook (destroy / _leave) the card is already in limbo: use the zone it came from
    const wasZone = inst.zone === 'limbo' && inst.prevZone ? inst.prevZone : inst.zone;
    if (!(await this._leave(inst, 'hand'))) return inst.zone === 'hand';
    const owner = g.players[inst.owner];
    inst.zone = 'hand'; inst.timedCount = null; inst.damage = 0; inst.buffs = []; inst.summonedTurn = 0;
    owner.hand.push(inst); g._ver++;
    if (wasZone === 'board') owner.returnedToHandThisTurn++;
    this.log(this.nameOf(inst) + 'は手札に戻った');
    g.emit('moveZone', { uid: inst.uid, defId: inst.defId, who: owner.idx, from: wasZone, to: 'hand' });
    await g.trigger('onReturnedToHand', { card: inst, who: owner.idx, from: wasZone });
    return true;
  };

  P.bounceToDeckTop = async function (inst) {
    if (inst.isPhantom || inst.isCopy) { this.vanishPhantom(inst); return false; }
    if (!(await this._leave(inst, 'deck'))) return false;
    this.putOnTop(inst, inst.owner); this.log(this.nameOf(inst) + 'は山札の一番上に戻った'); return true;
  };
  P.bounceToDeckBottom = async function (inst) {
    if (inst.isPhantom || inst.isCopy) { this.vanishPhantom(inst); return false; }
    if (!(await this._leave(inst, 'deck'))) return false;
    this.putOnBottom(inst, inst.owner); this.log(this.nameOf(inst) + 'は山札の一番下に戻った'); return true;
  };

  // Place a crest. Refuses duplicates by name; 6th crest → caller picks one to swap out.
  P.placeCrest = async function (inst, who, opts) {
    opts = opts || {};
    const p = this.who(who);
    const g = this.game;
    const def = G.CardDB.get(inst.defId);
    for (let i = 0; i < p.crests.length; i++) {
      if (G.CardDB.get(p.crests[i].defId).name === def.name) { this.log('同名の紋章はすでにある'); return false; }
    }
    if (p.crests.length >= Game.CREST_CAP) {
      const swap = await this.pick({ kind: 'crest', side: 'any', count: 1, who: p.idx, filter: function (ctx, c) { return c.owner === p.idx; }, prompt: '入れ替える紋章を選ぶ' });
      if (!swap.length) return false;
      await this.removeCrest(swap[0]);
    }
    g.removeFromZone(inst);
    inst.owner = p.idx; inst.zone = 'crests';
    p.crests.push(inst); g._ver++;
    this.log(p.name + 'は紋章' + def.name + 'を置いた');
    g.emit('crestSet', { who: p.idx, uid: inst.uid, defId: inst.defId });
    if (opts.triggerPlace !== false && typeof def.effects.onPlace === 'function') {
      const times = g.effectTimes(p.idx, 'place');
      for (let t = 0; t < times && g.isInPlay(inst); t++) await def.effects.onPlace(g.makeCtx(p.idx, inst, { invertible: true, choices: opts.choices, targets: opts.targets }));
    }
    return true;
  };

  P.removeCrest = async function (inst, opts) {
    opts = opts || {};
    if (inst.zone !== 'crests') return false;
    const def = G.CardDB.get(inst.defId);
    if (def.rarity === 'taboo' && !opts.force) { this.log('禁忌の紋章は除去できない'); return false; }
    if (def.effects.indestructible && !opts.force) { this.log(def.name + 'は除去されない'); return false; }
    this.log('紋章' + def.name + 'は取り除かれた');
    this.game.emit('crestRemoved', { who: inst.owner, uid: inst.uid, defId: inst.defId });
    if (opts.exile) await this.exile(inst); else await this.toGrave(inst, { reason: 'crestRemoved' });
    return true;
  };

  // Set the shared field. Old field → its owner's grave. onPlace fires for the new owner only.
  P.setField = async function (inst, who, opts) {
    opts = opts || {};
    const p = this.who(who);
    const g = this.game;
    const def = G.CardDB.get(inst.defId);
    if (g.field) {
      const old = g.field;
      this.log('フィールド' + this.nameOf(old) + 'は上書きされた');
      await this.toGrave(old, { reason: 'fieldReplaced' });
    }
    g.removeFromZone(inst);
    inst.owner = p.idx; inst.zone = 'field';
    g.field = inst; g.fieldOwner = p.idx; g._ver++;
    this.log(p.name + 'はフィールド' + def.name + 'を展開した');
    g.emit('fieldSet', { who: p.idx, uid: inst.uid, defId: inst.defId });
    if (opts.triggerPlace !== false && typeof def.effects.onPlace === 'function') {
      const times = g.effectTimes(p.idx, 'place');
      for (let t = 0; t < times && g.field === inst; t++) await def.effects.onPlace(g.makeCtx(p.idx, inst, { invertible: true, choices: opts.choices, targets: opts.targets }));
    }
    return true;
  };

  P.destroyField = async function () {
    const g = this.game;
    if (!g.field) return false;
    const old = g.field;
    this.log('フィールド' + this.nameOf(old) + 'は破壊された');
    await this.toGrave(old, { reason: 'fieldDestroyed' });
    return true;
  };

  P.reviveFromGrave = async function (inst, who, opts) {
    if (inst.zone !== 'grave') return null;
    const def = G.CardDB.get(inst.defId);
    if (def.type !== 'monster') return null;
    return this.summon(inst, who === undefined ? inst.owner : who, opts);
  };

  // Move an enemy monster to who's board (簒奪の儀). Returns inst or null if board full.
  P.steal = async function (inst, who) {
    const p = this.who(who);
    const g = this.game;
    if (!g.isInPlay(inst) || (inst.zone !== 'board' && inst.zone !== 'phantoms')) return null;
    const zone = inst.zone;
    if (zone === 'board' && p.board.length >= g.status(p.idx, 'maxBoard')) { this.log(p.name + 'の場はいっぱいだ'); return null; }
    if (zone === 'phantoms' && p.phantoms.length >= Game.PHANTOM_CAP) return null;
    g.removeFromZone(inst);
    if (inst.stolenFrom === null) inst.stolenFrom = inst.owner;
    inst.owner = p.idx; inst.zone = zone; inst.summonedTurn = g.turn;
    p[zone].push(inst); g._ver++;
    this.log(p.name + 'は' + this.nameOf(inst) + 'を奪った');
    g.emit('steal', { who: p.idx, uid: inst.uid, defId: inst.defId });
    return inst;
  };

  // Put a card into who's vault (蒐集箱). The card is unusable for the rest of the battle.
  P.vaultSteal = async function (inst, who) {
    const p = this.who(who);
    const g = this.game;
    if (inst.isPhantom || inst.isCopy) { this.vanishPhantom(inst); return false; }
    const from = inst.zone;
    await this._leave(inst, 'vault', true);
    if (inst.stolenFrom === null) inst.stolenFrom = inst.owner;
    inst.owner = p.idx; inst.zone = 'vault'; inst.damage = 0; inst.buffs = []; inst.timedCount = null;
    p.vault.push(inst); g._ver++;
    this.log(this.nameOf(inst) + 'は蒐集箱に入れられた');
    g.emit('moveZone', { uid: inst.uid, defId: inst.defId, who: p.idx, from: from, to: 'vault' });
    return true;
  };

  // Add a card (defId → new inst, or existing inst) to who's hand.
  P.addToHand = async function (cardOrDef, who, opts) {
    opts = opts || {};
    const p = this.who(who);
    const g = this.game;
    let inst;
    if (typeof cardOrDef === 'string') inst = g.createCardInst(cardOrDef, p.idx, { isCopy: !!opts.isCopy });
    else {
      inst = cardOrDef;
      if (inst.isPhantom) { this.vanishPhantom(inst); return null; }
      if (!(await this._leave(inst, 'hand'))) return inst.zone === 'hand' ? inst : null;
    }
    inst.owner = p.idx; inst.zone = 'hand'; inst.timedCount = null; inst.damage = 0; inst.buffs = [];
    p.hand.push(inst); g._ver++;
    this.log(p.name + 'は' + this.nameOf(inst) + 'を手札に加えた');
    g.emit('moveZone', { uid: inst.uid, defId: inst.defId, who: p.idx, from: 'limbo', to: 'hand' });
    return inst;
  };

  // 朧 (oboro): a card made during the battle. It plays like a normal card (it goes to the grave, can be
  // stolen…) but it is never added to the run deck — the battle deck is rebuilt from the run deck each fight,
  // and G.Data.restoreVault skips it. where: 'deck' (shuffled in) | 'deckTop' | 'hand'. opts: {costMod}
  P.createOboro = async function (defId, who, where, opts) {
    opts = opts || {};
    const p = this.who(who);
    const g = this.game;
    const inst = g.createCardInst(defId, p.idx, {});
    inst.oboro = true;
    if (opts.costMod) inst.costMod = opts.costMod;
    const name = this.nameOf(inst);
    if (where === 'hand') {
      inst.zone = 'hand'; p.hand.push(inst);
      this.log(p.name + 'は朧の' + name + 'を手札に加えた');
    } else {
      const at = where === 'deckTop' ? 0 : this.rng.int(p.deck.length + 1);
      inst.zone = 'deck'; p.deck.splice(at, 0, inst);
      this.log(p.name + 'の山札に朧の' + name + 'が加わった' + (where === 'deckTop' ? '（一番上）' : ''));
    }
    g._ver++;
    g.emit('moveZone', { uid: inst.uid, defId: inst.defId, who: p.idx, from: 'limbo', to: inst.zone, oboro: true });
    return inst;
  };

  P.addSeal = async function (inst, who) {
    const p = this.who(who);
    const g = this.game;
    await this._leave(inst, 'seals', true);
    inst.owner = p.idx; inst.zone = 'seals';
    p.seals.push(inst); g._ver++;
    this.log(p.name + 'は' + this.nameOf(inst) + 'を封印ゾーンに置いた（' + g.distinctKeys(p.idx) + '種）');
    g.emit('seal', { who: p.idx, uid: inst.uid, defId: inst.defId, keys: g.distinctKeys(p.idx) });
    await g.trigger('onSealAdded', { card: inst, who: p.idx });
    g.checkWin();
    return true;
  };

  P.removeSeal = async function (inst, opts) {
    opts = opts || {};
    if (inst.zone !== 'seals') return false;
    if (this.game.status(inst.owner, 'sealsProtected') && !opts.force) { this.log('封印ゾーンのカードは守られている'); return false; }
    this.log(this.nameOf(inst) + 'は封印ゾーンから取り除かれた');
    await this.toGrave(inst, { reason: 'sealRemoved' });
    this.game.emit('seal', { who: inst.owner, uid: inst.uid, defId: inst.defId, removed: true, keys: this.game.distinctKeys(inst.owner) });
    return true;
  };

  // ---- counters & turns --------------------------------------------------------
  P.addCurse = async function (who, n) {
    const p = this.who(who);
    const g = this.game;
    if (n <= 0) return 0;
    const redirect = g.status(p.idx, 'curseRedirectToMonsterUid');
    if (redirect) {
      const m = g.findCard(redirect);
      if (m && g.isInPlay(m)) {
        this.log(this.nameOf(m) + 'が呪詛を喰らった');
        await this.damage(m, n, { source: this.card, noReflect: true });
        return 0;
      }
    }
    p.curse += n;
    this.log(p.name + 'に呪詛' + n + '（' + p.curse + '/' + p.curseLimit + '）');
    g.emit('curse', { who: p.idx, amount: n, curse: p.curse });
    await g.trigger('onCurseAdded', { who: p.idx, amount: n, source: this.card });
    g.checkWin();
    return n;
  };
  P.removeCurse = function (who, n) {
    const p = this.who(who);
    const d = Math.min(p.curse, Math.max(0, n));
    p.curse -= d;
    if (d) { this.log(p.name + 'の呪詛-' + d + '（' + p.curse + '）'); this.game.emit('curse', { who: p.idx, amount: -d, curse: p.curse }); }
    return d;
  };
  P.moveCurse = async function (from, to) {
    const a = this.who(from), b = this.who(to);
    const n = a.curse;
    this.removeCurse(a, n);
    await this.addCurse(b, n);
    return n;
  };
  P.setChain = async function (n, who) {
    const p = this.who(who);
    const before = p.chain;
    p.chain = Math.max(0, n);
    this.game.emit('chain', { who: p.idx, chain: p.chain });
    if (p.chain > before) await this.game.onChainIncreased(p, before);
    return p.chain;
  };
  P.addChain = async function (n, who) { const p = this.who(who); return this.setChain(p.chain + n, p); };

  P.extraTurn = async function (who) {
    const p = this.who(who);
    const g = this.game;
    if (g.status(p.idx, 'noExtraTurn')) { this.log(p.name + 'は追加ターンを得られない'); return false; }
    p.extraTurns++;
    p.stats.extraTurns++;
    this.log(p.name + 'は追加ターンを得た');
    g.emit('extraTurn', { who: p.idx, pending: p.extraTurns });
    await g.trigger('onExtraTurn', { who: p.idx, source: this.card });
    return true;
  };
  P.skipTurn = function (who) {
    const p = this.who(who);
    p.skipNextTurn = true;
    this.log(p.name + 'の次のターンはスキップされる');
    this.game.emit('skipTurn', { who: p.idx });
  };

  // Timed zone -----------------------------------------------------------------
  P.addTimed = async function (inst, who, n) {
    const p = this.who(who);
    const g = this.game;
    const def = G.CardDB.get(inst.defId);
    await this._leave(inst, 'timed', true);
    inst.owner = p.idx; inst.zone = 'timed';
    inst.timedCount = n !== undefined ? n : (def.timed || 1);
    p.timed.push(inst); g._ver++;
    this.log(p.name + 'は' + def.name + 'を時限' + inst.timedCount + 'で仕掛けた');
    g.emit('timedSet', { who: p.idx, uid: inst.uid, defId: inst.defId, count: inst.timedCount });
    await g.trigger('onTimedSet', { card: inst, who: p.idx });
    if (inst.timedCount <= 0) await this.fireTimed(inst);
    return inst;
  };

  // Decrease timed counters of who's timed cards by n (fires those reaching 0). cards: optional subset.
  P.tickTimed = async function (who, n, cards) {
    const p = this.who(who);
    const g = this.game;
    if (n === undefined) n = 1;
    // timed zone cards + crests carrying a timer (終末の預言書)
    const timedCrests = p.crests.filter(function (c) { return c.timedCount !== null && c.timedCount !== undefined; });
    const list = (cards ? [].concat(cards) : p.timed.concat(timedCrests)).filter(function (c) { return c.zone === 'timed' || (c.zone === 'crests' && c.timedCount !== null); });
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      const def = G.CardDB.get(c.defId);
      // fixedTimer (終末の預言書): only the natural turn-start tick moves it
      if (def.effects.fixedTimer && this.manualTick) continue;
      c.timedCount -= n;
      g.emit('timedTick', { who: p.idx, uid: c.uid, defId: c.defId, count: c.timedCount });
      this.log(def.name + 'の時限カウント：' + Math.max(0, c.timedCount));
    }
    for (let i = 0; i < list.length; i++) {
      if ((list[i].zone === 'timed' || list[i].zone === 'crests') && list[i].timedCount !== null && list[i].timedCount <= 0) await this.fireTimed(list[i]);
      if (g.winner !== null) break;
    }
  };
  // Card-driven count manipulation (時の歯車 etc.); respects fixedTimer (預言書).
  // delta < 0 speeds up (count -1), delta > 0 delays (時計止め).
  P.adjustTimed = async function (cards, delta, who) {
    const list = [].concat(cards).filter(function (c) { return c.zone === 'timed' && !G.CardDB.get(c.defId).effects.fixedTimer; });
    if (!list.length) return;
    this.manualTick = true;
    try { await this.tickTimed(who === undefined ? list[0].owner : who, -delta, list); }
    finally { this.manualTick = false; }
  };

  P.fireTimed = async function (inst) {
    const g = this.game;
    if (inst.zone !== 'timed' && inst.zone !== 'crests') return false;
    const owner = g.players[inst.owner];
    const def = G.CardDB.get(inst.defId);
    this.log(def.name + 'の時限効果が発動！');
    g.emit('timedFire', { who: owner.idx, uid: inst.uid, defId: inst.defId });
    if (inst.zone === 'crests') {
      // timed crest: stays in place, fires once, timer cleared
      inst.timedCount = null;
      if (typeof def.effects.onTimed === 'function') await def.effects.onTimed(g.makeCtx(owner.idx, inst, { invertible: true }));
      g.checkWin();
      return true;
    }
    g.removeFromZone(inst); g._ver++;
    inst.zone = 'limbo';
    if (def.type === 'monster' && typeof def.effects.onTimed !== 'function') {
      const res = await this.summon(inst, owner);
      if (!res) await this.toGrave(inst, { reason: 'timedNoRoom' });
    } else if (typeof def.effects.onTimed === 'function') {
      const times = g.effectTimes(owner.idx, 'timed');
      for (let t = 0; t < times && g.winner === null; t++) await def.effects.onTimed(g.makeCtx(owner.idx, inst, { invertible: true }));
    }
    await g.trigger('onTimedFired', { card: inst, who: owner.idx });
    if (inst.zone === 'limbo') {
      if (inst.flags.reprised) await this.exile(inst);
      else if (!inst.flags.returnedOnce && g.status(owner.idx, 'timedReturnOnce')) {
        inst.flags.returnedOnce = true;
        await this.addTimed(inst, owner, def.timed || 1);
      } else if (inst.isCopy) inst.zone = 'void';
      else await this.toGrave(inst, { reason: 'timed' });
    }
    g.checkWin();
    return true;
  };

  // Buff a monster: {atk, hp, until:'endOfTurn'|null}
  P.buff = function (inst, b) {
    const g = this.game;
    const buff = { atk: b.atk || 0, hp: b.hp || 0, until: b.until === 'endOfTurn' ? { player: g.active } : (b.until || null), sourceUid: this.card ? this.card.uid : null };
    inst.buffs.push(buff);
    g.emit('buff', { uid: inst.uid, atk: buff.atk, hp: buff.hp });
    if (g.hpOf(inst) <= 0 && g.isInPlay(inst)) return this.destroy(inst, { source: this.card });
    return Promise.resolve(true);
  };
  P.addKeyword = function (inst, kw) { if (inst.keywords.indexOf(kw) < 0) inst.keywords.push(kw); };
  // Keywords until the end of this turn (迅雷の竜翼). Gaining 連撃 mid-turn adds the extra attack now.
  P.addKeywordsThisTurn = function (inst, kws) {
    const g = this.game;
    const hadDouble = g.hasKeyword(inst, 'double');
    const t = inst.flags.tempKw || { kws: [], until: g.active };
    kws.forEach(function (k) { if (t.kws.indexOf(k) < 0) t.kws.push(k); });
    t.until = g.active;
    inst.flags.tempKw = t;
    if (!hadDouble && kws.indexOf('double') >= 0 && inst.owner === g.active) inst.attacksLeft += 1;
    g.emit('buff', { uid: inst.uid, keywords: kws.slice() });
  };
  P.removeKeyword = function (inst, kw) { util.removeFrom(inst.keywords, kw); };

  // ---- choices ------------------------------------------------------------------
  // Candidate lists for a TargetSpec. `side` is relative to spec.who (default ctx.me).
  P.candidatesFor = function (spec) {
    const g = this.game;
    const meIdx = spec.who !== undefined ? spec.who : this.me.idx;
    const sides = [];
    const side = spec.side || 'any';
    if (side === 'ally' || side === 'any') sides.push(meIdx);
    if (side === 'enemy' || side === 'any') sides.push(1 - meIdx);
    let list = [];
    const self = this;
    sides.forEach(function (pi) {
      const p = g.players[pi];
      switch (spec.kind) {
        case 'monster': list = list.concat(p.board, p.phantoms); break;
        case 'boardMonster': list = list.concat(p.board); break;
        case 'phantom': list = list.concat(p.phantoms); break;
        case 'crest': list = list.concat(p.crests); break;
        case 'card': list = list.concat(p.board, p.phantoms, p.crests); if (g.field && g.fieldOwner === pi) list.push(g.field); break;
        case 'handCard': list = list.concat(p.hand); break;
        case 'graveCard': list = list.concat(p.grave); break;
        case 'deckCard': list = list.concat(p.deck); break;
        case 'exileCard': list = list.concat(p.exile); break;
        case 'timedCard': list = list.concat(p.timed); break;
        case 'sealCard': list = list.concat(p.seals); break;
        case 'vaultCard': list = list.concat(p.vault); break;
        case 'player': list.push(p); break;
        default: throw new Error('unknown pick kind ' + spec.kind);
      }
    });
    // 加護: monsters that can't be chosen by this (the opponent's) effect
    if (!spec.ignoreWard) list = list.filter(function (c) { return !g.isWardedFrom(c, meIdx); });
    if (spec.filter) list = list.filter(function (c) { return spec.filter(self, c); });
    return list;
  };

  // Ask the controlling player's chooser. Resolves to CardInst[] (or Player for kind 'player').
  P.pick = async function (spec) {
    const g = this.game;
    const chooserOwner = g.players[spec.chooser !== undefined ? spec.chooser : this.me.idx];
    if (spec.kind === 'option') return this.choose(spec.options, spec);
    const cands = this.candidatesFor(spec);
    const count = spec.count || 1;
    if (!cands.length) return spec.kind === 'player' ? null : [];
    let result;
    if (cands.length <= count && !spec.optional && !spec.upTo && spec.kind !== 'player') result = cands.slice();
    else {
      const chooser = chooserOwner.chooser || Game.defaultChooser;
      g.pendingChoice = { who: chooserOwner.idx, spec: spec, candidates: cands.map(function (c) { return c.uid !== undefined ? c.uid : 'p' + c.idx; }) };
      g.emit('choice', g.pendingChoice);
      result = await chooser(spec, cands, g, this);
      g.pendingChoice = null;
    }
    if (spec.kind === 'player') return Array.isArray(result) ? result[0] || null : result;
    result = [].concat(result || []).filter(function (c) { return c && cands.indexOf(c) >= 0; });
    if (!spec.upTo && !spec.optional) result = result.slice(0, count);
    if (result.length > count) result = result.slice(0, count);
    return result;
  };

  // options: [{id, label}] → resolves to id.
  P.choose = async function (options, opts) {
    opts = opts || {};
    const g = this.game;
    const chooserOwner = g.players[opts.chooser !== undefined ? opts.chooser : this.me.idx];
    if (!options.length) return null;
    if (options.length === 1 && !opts.optional) return options[0].id;
    const chooser = chooserOwner.chooser || Game.defaultChooser;
    const spec = { kind: 'option', options: options, prompt: opts.prompt || '選ぶ' };
    g.pendingChoice = { who: chooserOwner.idx, spec: spec, candidates: options.map(function (o) { return o.id; }) };
    g.emit('choice', g.pendingChoice);
    let id = await chooser(spec, options, g, this);
    g.pendingChoice = null;
    if (id && typeof id === 'object') id = id.id !== undefined ? id.id : (id[0] && id[0].id);
    const ok = options.some(function (o) { return o.id === id; });
    return ok ? id : options[0].id;
  };

  // ---- cast / replay delegate to play.js ----------------------------------------------
  P.cast = function (cardOrDef, who, opts) { return this.game.cast(cardOrDef, this.who(who).idx, opts || {}, this); };
  P.replay = function (inst, opts) { return this.game.replayCard(inst, this.me.idx, opts || {}); };

  Game.prototype.makeCtx = function (pIdx, card, opts) { return new Ctx(this, pIdx, card, opts); };
  G.Engine.Ctx = Ctx;
})(globalThis.G = globalThis.G || {});
