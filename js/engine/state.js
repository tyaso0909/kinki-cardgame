(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // state.js — Game / Player / CardInst factories, clone & serialize.
  // The Game "class" is extended by rules.js / ctx.js / actions.js /
  // play.js / turn.js / loop.js (each adds prototype methods).
  // All state lives as plain JSON on the Game instance; the only
  // non-JSON members are `emitter`, `rng` (serialized via state()) and
  // `players[i].chooser` (functions, restored to the default on load).
  // ---------------------------------------------------------------

  const util = G.util;
  const ZONES = ['deck', 'hand', 'board', 'phantoms', 'crests', 'grave', 'exile', 'timed', 'seals', 'vault'];
  const PHANTOM_CAP = 30;
  const BOARD_CAP = 5;
  const CREST_CAP = 5;
  const HAND_LIMIT = 6;
  const LOG_CAP = 300;
  const TURN_SNAPSHOTS = 3;
  const SERIAL_VERSION = 1;

  // Default chooser: first valid option(s). Tests use this; UI/AI replace it.
  function defaultChooser(spec, candidates /*, game */) {
    if (spec.kind === 'option') return candidates.length ? candidates[0].id : null;
    const n = spec.count || 1;
    if (spec.optional && spec.upTo) return [];
    return candidates.slice(0, n);
  }

  function createPlayer(idx, cfg) {
    cfg = cfg || {};
    const p = {
      idx: idx,
      name: cfg.name || (idx === 0 ? 'プレイヤー' : '敵'),
      isAI: !!cfg.isAI,
      enemyDefId: cfg.enemyDefId || null,
      life: cfg.life != null ? cfg.life : 40,
      maxLife: cfg.maxLife != null ? cfg.maxLife : (cfg.life != null ? cfg.life : 40),
      mana: 0, maxMana: 0,
      deck: [], hand: [], board: [], phantoms: [], crests: [], grave: [], exile: [], timed: [], seals: [], vault: [],
      curse: 0, curseLimit: cfg.curseLimit != null ? cfg.curseLimit : 20, chain: 0,
      manaGainedThisTurn: 0, drawnThisTurn: 0, playedThisTurn: [], returnedToHandThisTurn: 0,
      destroyedThisTurn: [], spellsPlayedThisTurn: [], maxDamageDealtOnce: 0,
      extraTurns: 0, skipNextTurn: false,
      nextSpellTimes: 1, nextSummonTimes: 1, nextSpellCostDelta: 0,
      lastSpellDefId: null, lastSpellUid: null,
      prevTurnPlayed: [],        // defIds played in this player's previous turn (歴史改変 / 鏡像の写し / 過去からの来訪者)
      prevTurnSpells: [],
      turnsTaken: 0,
      deckedOut: false,
      reserves: [],
      statuses: {},
      flags: {},                 // free per-battle flags for cards/relics (e.g. onceUsed)
      relics: (cfg.relics || []).slice(),
      forecastText: null,
      stats: { damageDealt: 0, cardsPlayed: 0, loops: 0, extraTurns: 0, phantomsCreated: 0, maxChain: 0 }
    };
    return p;
  }

  function Game(cfg) {
    cfg = cfg || {};
    this.seed = cfg.seed != null ? cfg.seed : (Date.now() >>> 0);
    this.rng = new G.RNG(this.seed);
    this.emitter = new G.Emitter();
    this.turn = 0;
    this.active = 0;
    this.streak = 1;
    this.first = 0;
    this.players = [createPlayer(0, (cfg.players || [])[0]), createPlayer(1, (cfg.players || [])[1])];
    this.field = null;
    this.fieldOwner = null;
    this.phase = 'setup'; // 'setup'|'start'|'main'|'end'|'over'
    this.winner = null;
    this.winReason = null;
    this.log = [];
    this.pendingChoice = null;
    this.loop = { history: [], detected: null, running: false, iterations: 0 };
    this.turnLimit = cfg.turnLimit || null;
    this.options = Object.assign({ aiMistakeRate: 0, noShuffle: false, firstPlayer: null, initialHand: 5 }, cfg.options || {});
    this.nextUid = 1;
    this.stats = { longestLoop: 0, longestStreak: 1, maxChain: 0, turns: 0 };
    this.turnSnapshots = [];   // [{turn, player, state}] last 3 turn starts (immutable once stored)
    this.actionSnapshots = []; // current turn: [{action, state}]
    this.prevTurnActionSnapshots = [];
    this.snapshots = {};       // named snapshots
    this.turnActions = [];     // action descriptors of current turn
    this.prevTurnActions = []; // action descriptors of previous turn (any player)
    this.flags = {};
    this._initialField = cfg.field || null;
    this._initialDecks = (cfg.players || []).map(function (p) { return (p && p.deck) ? p.deck.slice() : []; });
    this._manaDepth = 0;
    this._ver = 0; // bumped on zone changes (cheap "did anything move" check)
  }

  Game.ZONES = ZONES;
  Game.PHANTOM_CAP = PHANTOM_CAP;
  Game.BOARD_CAP = BOARD_CAP;
  Game.CREST_CAP = CREST_CAP;
  Game.HAND_LIMIT = HAND_LIMIT;
  Game.LOG_CAP = LOG_CAP;
  Game.defaultChooser = defaultChooser;

  // ---- events --------------------------------------------------------
  Game.prototype.on = function (type, fn) { this.emitter.on(type, fn); return this; };
  Game.prototype.off = function (type, fn) { this.emitter.off(type, fn); return this; };
  Game.prototype.emit = function (type, payload) {
    this.emitter.emit(type, payload || {});
  };

  Game.prototype.addLog = function (msg, data) {
    const entry = { turn: this.turn, who: this.active, msg: msg };
    if (data !== undefined) entry.data = data;
    this.log.push(entry);
    if (this.log.length > LOG_CAP) this.log.splice(0, this.log.length - LOG_CAP);
    this.emit('log', entry);
    return entry;
  };

  // ---- players / cards -------------------------------------------------
  Game.prototype.player = function (who) {
    if (who === undefined || who === null) return this.players[this.active];
    if (typeof who === 'number') return this.players[who];
    if (who === 'opp') return this.players[1 - this.active];
    return who; // Player object
  };
  Game.prototype.oppOf = function (who) { return this.players[1 - this.player(who).idx]; };
  Game.prototype.isOver = function () { return this.winner !== null; };

  Game.prototype.defOf = function (inst) { return G.CardDB.get(inst.defId); };

  // Build a fresh CardInst from a def (not placed in any zone yet).
  Game.prototype.createCardInst = function (defId, owner, opts) {
    const def = G.CardDB.get(defId);
    opts = opts || {};
    const inst = {
      uid: this.nextUid++, defId: defId, owner: owner,
      atk: typeof def.atk === 'number' ? def.atk : 0,
      hp: typeof def.hp === 'number' ? def.hp : 0,
      maxHp: typeof def.hp === 'number' ? def.hp : 0,
      damage: 0, summonedTurn: 0, attacksLeft: 0,
      isPhantom: !!opts.isPhantom, persistent: !!opts.persistent,
      keywords: def.keywords.slice(), buffs: [], counters: {}, exhausted: false,
      zone: 'limbo', timedCount: null, isCopy: !!opts.isCopy, stolenFrom: null,
      costMod: 0, flags: {}
    };
    return inst;
  };

  Game.prototype.zoneArray = function (owner, zone) {
    if (zone === 'field') return null;
    const p = this.player(owner);
    return p[zone] || null;
  };

  // Scan all zones for a uid. Returns CardInst|null.
  Game.prototype.findCard = function (uid) {
    if (uid === null || uid === undefined) return null;
    if (typeof uid === 'object') return uid;
    if (this.field && this.field.uid === uid) return this.field;
    for (let pi = 0; pi < 2; pi++) {
      const p = this.players[pi];
      for (let zi = 0; zi < ZONES.length; zi++) {
        const arr = p[ZONES[zi]];
        for (let i = 0; i < arr.length; i++) if (arr[i].uid === uid) return arr[i];
      }
      for (let i = 0; i < p.reserves.length; i++) if (p.reserves[i].card && p.reserves[i].card.uid === uid) return p.reserves[i].card;
    }
    return null;
  };

  // Remove inst from whatever zone it is in. Returns true if removed.
  Game.prototype.removeFromZone = function (inst) {
    if (inst.zone === 'field') {
      if (this.field === inst) { this.field = null; this.fieldOwner = null; inst.zone = 'limbo'; return true; }
      return false;
    }
    const arr = this.zoneArray(inst.owner, inst.zone);
    if (arr && util.removeFrom(arr, inst)) { inst.zone = 'limbo'; return true; }
    // fallback: search everywhere (owner may have changed)
    for (let pi = 0; pi < 2; pi++) {
      for (let zi = 0; zi < ZONES.length; zi++) {
        if (util.removeFrom(this.players[pi][ZONES[zi]], inst)) { inst.zone = 'limbo'; return true; }
      }
    }
    inst.zone = 'limbo';
    return false;
  };

  // Place inst directly into a zone (no triggers). Used by setup/sandbox and internal moves.
  Game.prototype.placeInZone = function (inst, owner, zone, opts) {
    opts = opts || {};
    this.removeFromZone(inst);
    const p = this.player(owner);
    inst.owner = p.idx;
    if (zone === 'field') {
      this.field = inst; this.fieldOwner = p.idx; inst.zone = 'field';
      return inst;
    }
    if (zone === 'void') { inst.zone = 'void'; return inst; }
    const arr = p[zone];
    if (!arr) throw new Error('unknown zone ' + zone);
    inst.zone = zone;
    if (zone === 'board' || zone === 'phantoms') {
      if (inst.summonedTurn === 0 && !opts.fresh) inst.summonedTurn = -1; // pre-placed: may attack
    }
    if (opts.top) arr.unshift(inst); else arr.push(inst);
    return inst;
  };

  // Convenience for setup: create a card of defId for owner in zone.
  Game.prototype.addCard = function (owner, defId, zone, opts) {
    opts = opts || {};
    const inst = this.createCardInst(defId, this.player(owner).idx, opts);
    if (zone === 'board' || zone === 'phantoms') {
      inst.attacksLeft = opts.attacksLeft != null ? opts.attacksLeft : 1;
      inst.summonedTurn = opts.summonedTurn != null ? opts.summonedTurn : -1;
      if (opts.damage) inst.damage = opts.damage;
    }
    if (zone === 'timed') inst.timedCount = opts.timedCount != null ? opts.timedCount : (G.CardDB.get(defId).timed || 1);
    this.placeInZone(inst, owner, zone, { fresh: true, top: opts.top });
    return inst;
  };

  // ---- serialization ---------------------------------------------------
  const SKIP_FIELDS = { rng: 1, emitter: 1, _manaDepth: 1, _ver: 1, _aiRng: 1 }; // _aiRng: AI's per-game RNG object (js/ai) must not be serialized/restored as a plain object

  function serializePlayers(players) {
    return players.map(function (p) {
      const out = {};
      for (const k in p) {
        if (k === 'chooser') continue;
        out[k] = util.deepClone(p[k]);
      }
      return out;
    });
  }

  // Full serialization: plain JSON object (log capped, snapshots included).
  Game.prototype.serialize = function (opts) {
    opts = opts || {};
    const out = { version: SERIAL_VERSION, rngState: this.rng.state() };
    for (const k in this) {
      if (!Object.prototype.hasOwnProperty.call(this, k) || SKIP_FIELDS[k]) continue;
      if (k === 'players') { out.players = serializePlayers(this.players); continue; }
      if (k === 'log') { out.log = opts.noLog ? [] : util.deepClone(this.log); continue; }
      if (k === 'turnSnapshots') { out.turnSnapshots = this.turnSnapshots.slice(); continue; } // immutable entries
      if (k === 'actionSnapshots' || k === 'prevTurnActionSnapshots') {
        out[k] = opts.noActionSnapshots ? [] : this[k].slice(); continue;
      }
      if (k === 'snapshots') { out.snapshots = Object.assign({}, this.snapshots); continue; }
      out[k] = util.deepClone(this[k]);
    }
    return out;
  };

  Game.prototype.toJSON = function () { return this.serialize(); };

  // Apply serialized data onto this game instance (used by restore/deserialize).
  Game.prototype.loadState = function (data, opts) {
    opts = opts || {};
    const choosers = this.players.map(function (p) { return p.chooser; });
    for (const k in data) {
      if (k === 'version') continue;
      if (k === 'rngState') { this.rng.restore(data.rngState); continue; }
      if (k === 'players') {
        this.players = serializePlayers(data.players);
        continue;
      }
      if (k === 'turnSnapshots' || k === 'actionSnapshots' || k === 'prevTurnActionSnapshots') { this[k] = data[k].slice(); continue; }
      if (k === 'snapshots') { this.snapshots = Object.assign({}, data.snapshots); continue; }
      if (k === 'log' && opts.keepLog) continue;
      this[k] = util.deepClone(data[k]);
    }
    for (let i = 0; i < 2; i++) this.players[i].chooser = choosers[i] || defaultChooser;
    if (this.field) {
      // re-link field object by uid (deepClone made a copy already stored in this.field)
      this.field.zone = 'field';
    }
    this.pendingChoice = null;
    this._manaDepth = 0;
    return this;
  };

  // Cheap independent copy for AI lookahead: no log, no action snapshots, no listeners.
  Game.prototype.clone = function () {
    const data = this.serialize({ noLog: true, noActionSnapshots: true });
    const g = new Game({ seed: this.seed });
    g.loadState(data);
    g.log = [];
    for (let i = 0; i < 2; i++) g.players[i].chooser = this.players[i].chooser || defaultChooser;
    return g;
  };

  Game.deserialize = function (data) {
    if (typeof data === 'string') data = JSON.parse(data);
    const g = new Game({ seed: data.seed });
    g.loadState(data);
    return g;
  };

  // ---- snapshots -------------------------------------------------------
  Game.prototype.snapshot = function (tag) {
    const st = this.serialize({ noLog: true, noActionSnapshots: true });
    st.turnSnapshots = []; st.snapshots = {};
    if (tag !== undefined && tag !== null) this.snapshots[tag] = st;
    return st;
  };

  // Restore a snapshot (by tag or snapshot object). Options:
  //   keepHandOf: pIdx|[pIdx]  — those players keep their CURRENT hand
  //   keepGraveOf: pIdx|[pIdx] — those players keep their CURRENT grave
  Game.prototype.restore = function (tagOrState, opts) {
    opts = opts || {};
    const st = typeof tagOrState === 'object' ? tagOrState : this.snapshots[tagOrState];
    if (!st) throw new Error('snapshot not found: ' + tagOrState);
    const keepHand = [].concat(opts.keepHandOf === undefined ? [] : opts.keepHandOf);
    const keepGrave = [].concat(opts.keepGraveOf === undefined ? [] : opts.keepGraveOf);
    const kept = {};
    keepHand.forEach(function (i) { kept['h' + i] = this.players[i].hand.map(util.deepClone); }, this);
    keepGrave.forEach(function (i) { kept['g' + i] = this.players[i].grave.map(util.deepClone); }, this);
    const savedTurnSnaps = this.turnSnapshots;
    const savedNamed = this.snapshots;
    const savedNextUid = Math.max(this.nextUid, st.nextUid || 0);
    const emitter = this.emitter;
    this.loadState(st, { keepLog: true });
    this.emitter = emitter;
    this.turnSnapshots = savedTurnSnaps;
    this.snapshots = savedNamed;
    this.nextUid = savedNextUid;
    const self = this;
    function applyKept(i, zone, cards) {
      const p = self.players[i];
      // remove duplicates of the kept cards from everywhere in the restored state
      cards.forEach(function (c) {
        const dup = self.findCard(c.uid);
        if (dup) self.removeFromZone(dup);
      });
      // cards that were in the kept zone in the snapshot but are not kept now: drop them
      p[zone] = cards.map(function (c) { c.zone = zone; c.owner = i; return c; });
    }
    keepHand.forEach(function (i) { applyKept(i, 'hand', kept['h' + i]); });
    keepGrave.forEach(function (i) { applyKept(i, 'grave', kept['g' + i]); });
    this.loop.history = [];
    this.loop.detected = null;
    this.addLog('時が巻き戻った');
    this.emit('restore', { tag: typeof tagOrState === 'object' ? null : tagOrState });
    return this;
  };

  Game.prototype.pushTurnSnapshot = function () {
    const st = this.snapshot();
    this.turnSnapshots.push({ turn: this.turn, player: this.active, state: st });
    if (this.turnSnapshots.length > TURN_SNAPSHOTS) this.turnSnapshots.splice(0, this.turnSnapshots.length - TURN_SNAPSHOTS);
  };

  // Find the snapshot of the start of the k-th most recent turn of player pIdx (k=0 → current/last turn start).
  Game.prototype.turnSnapshotOf = function (pIdx, k) {
    k = k || 0;
    const list = this.turnSnapshots.filter(function (s) { return s.player === pIdx; });
    const idx = list.length - 1 - k;
    return idx >= 0 ? list[idx] : null;
  };

  G.Engine = G.Engine || {};
  G.Engine.Game = Game;
  G.Engine.createPlayer = createPlayer;
  G.Engine.defaultChooser = defaultChooser;
})(globalThis.G = globalThis.G || {});
