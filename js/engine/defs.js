(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // Definition registries: G.CardDB, G.RelicDB, G.EnemyDB, G.EventDB.
  // Each has register(def) / get(id) / all() / filter(pred) / has(id) / clear().
  // register validates required fields and throws on duplicates.
  // ---------------------------------------------------------------

  const CARD_TYPES = ['monster', 'spell', 'crest', 'field'];
  const LINEAGES = ['accel', 'cycle', 'chain', 'time', 'copy', 'doom', 'generic'];
  const ROLES = ['engine', 'fuel', 'finisher', 'disrupt'];
  const RARITIES = ['common', 'rare', 'legend', 'taboo', 'boss'];

  function makeRegistry(name, validate) {
    const map = new Map();
    const reg = {
      name: name,
      register: function (def) {
        if (!def || typeof def !== 'object') throw new Error(name + ': def must be an object');
        if (typeof def.id !== 'string' || !def.id) throw new Error(name + ': def.id is required');
        if (map.has(def.id)) throw new Error(name + ': duplicate id "' + def.id + '"');
        if (validate) validate(def);
        map.set(def.id, def);
        return def;
      },
      registerAll: function (defs) { defs.forEach(reg.register); return defs; },
      get: function (id) {
        const d = map.get(id);
        if (!d) throw new Error(name + ': unknown id "' + id + '"');
        return d;
      },
      tryGet: function (id) { return map.get(id) || null; },
      has: function (id) { return map.has(id); },
      all: function () { return Array.from(map.values()); },
      ids: function () { return Array.from(map.keys()); },
      filter: function (pred) { return reg.all().filter(pred); },
      count: function () { return map.size; },
      // remove one def (tests) or everything
      unregister: function (id) { return map.delete(id); },
      clear: function () { map.clear(); }
    };
    return reg;
  }

  function req(def, field, name) {
    if (def[field] === undefined || def[field] === null) {
      throw new Error(name + ' "' + def.id + '": missing required field "' + field + '"');
    }
  }

  function oneOf(def, field, list, name) {
    if (def[field] !== undefined && def[field] !== null && list.indexOf(def[field]) < 0) {
      throw new Error(name + ' "' + def.id + '": invalid ' + field + ' "' + def[field] + '"');
    }
  }

  // ---- CardDB -----------------------------------------------------
  function validateCard(def) {
    const name = 'CardDef';
    req(def, 'name', name);
    req(def, 'type', name);
    oneOf(def, 'type', CARD_TYPES, name);
    req(def, 'cost', name);
    if (!(typeof def.cost === 'number' || def.cost === 'X')) {
      throw new Error(name + ' "' + def.id + '": cost must be a number or "X"');
    }
    if (def.lineage === undefined) def.lineage = 'generic';
    oneOf(def, 'lineage', LINEAGES, name);
    oneOf(def, 'role', ROLES, name);
    if (def.rarity === undefined) def.rarity = 'common';
    oneOf(def, 'rarity', RARITIES, name);
    if (def.type === 'monster') {
      if (typeof def.atk !== 'number' && def.atk !== 'X') throw new Error(name + ' "' + def.id + '": monster needs numeric atk');
      if (typeof def.hp !== 'number' && def.hp !== 'X') throw new Error(name + ' "' + def.id + '": monster needs numeric hp');
    }
    if (def.keywords && !Array.isArray(def.keywords)) throw new Error(name + ' "' + def.id + '": keywords must be an array');
    if (def.key !== undefined && def.key !== null && def.key !== 'wild' && !(def.key >= 1 && def.key <= 5)) {
      throw new Error(name + ' "' + def.id + '": key must be 1..5 or "wild"');
    }
    if (def.reserve && def.type !== 'spell') throw new Error(name + ' "' + def.id + '": only spells can be reserve');
    if (def.timed !== undefined && def.timed !== null && typeof def.timed !== 'number') {
      throw new Error(name + ' "' + def.id + '": timed must be a number');
    }
    if (def.effects === undefined) def.effects = {};
    if (typeof def.effects !== 'object') throw new Error(name + ' "' + def.id + '": effects must be an object');
    if (def.text === undefined) def.text = '';
    if (!def.keywords) def.keywords = [];
    if (!def.tags) def.tags = [];
    if (def.reserve === undefined) def.reserve = false;
    if (def.reprise === undefined) def.reprise = null;
    if (def.timed === undefined) def.timed = null;
    if (def.key === undefined) def.key = null;
    if (def.bossOnly === undefined) def.bossOnly = false;
    if (def.targets === undefined) def.targets = null;
  }

  const CardDB = makeRegistry('CardDB', validateCard);
  // Cards eligible for the player's pool (packs/rewards/shop).
  CardDB.pool = function (pred) {
    return CardDB.filter(function (d) { return !d.bossOnly && d.rarity !== 'boss' && (!pred || pred(d)); });
  };
  CardDB.byLineage = function (lineage) { return CardDB.pool(function (d) { return d.lineage === lineage; }); };
  CardDB.byRarity = function (rarity) { return CardDB.pool(function (d) { return d.rarity === rarity; }); };

  // ---- RelicDB ----------------------------------------------------
  function validateRelic(def) {
    const name = 'RelicDef';
    req(def, 'name', name);
    if (def.effects === undefined) def.effects = {};
    if (typeof def.effects !== 'object') throw new Error(name + ' "' + def.id + '": effects must be an object');
    if (def.text === undefined) def.text = '';
    if (def.rarity === undefined) def.rarity = 'common';
    if (def.lineage !== undefined && def.lineage !== null) oneOf(def, 'lineage', LINEAGES, name);
    // category: 'starter'|'generic'|'lineage'|'boss'|'cursed'|'enemy'
    if (def.category === undefined) def.category = 'generic';
  }
  const RelicDB = makeRegistry('RelicDB', validateRelic);

  // ---- EnemyDB ----------------------------------------------------
  function validateEnemy(def) {
    const name = 'EnemyDef';
    req(def, 'name', name);
    req(def, 'life', name);
    if (!Array.isArray(def.deck)) throw new Error(name + ' "' + def.id + '": deck must be an array of defIds');
    if (def.hazard === undefined) def.hazard = [];
    if (!Array.isArray(def.hazard)) throw new Error(name + ' "' + def.id + '": hazard must be an array');
    def.hazard.forEach(function (h, i) {
      if (typeof h.test !== 'function' || typeof h.weight !== 'number') {
        throw new Error(name + ' "' + def.id + '": hazard[' + i + '] needs {test:fn, weight:number}');
      }
    });
    if (def.relics === undefined) def.relics = [];
    if (def.field === undefined) def.field = null;
    if (def.kind === undefined) def.kind = 'normal'; // 'normal'|'elite'|'boss'
    if (def.act === undefined) def.act = 1;
    if (def.style === undefined) def.style = 'aggro';
    if (def.mistakeRate === undefined) def.mistakeRate = def.kind === 'boss' ? 0 : def.kind === 'elite' ? 0.1 : 0.2;
    if (def.forecastText === undefined) def.forecastText = '次のターン、何かが起こる';
  }
  const EnemyDB = makeRegistry('EnemyDB', validateEnemy);

  // ---- EventDB (run events) ----------------------------------------
  function validateEvent(def) {
    const name = 'EventDef';
    req(def, 'name', name);
    if (!Array.isArray(def.options) || !def.options.length) {
      throw new Error(name + ' "' + def.id + '": options must be a non-empty array');
    }
    if (def.act === undefined) def.act = 1;
  }
  const EventDB = makeRegistry('EventDB', validateEvent);

  G.CardDB = CardDB;
  G.RelicDB = RelicDB;
  G.EnemyDB = EnemyDB;
  G.EventDB = EventDB;
  G.Defs = {
    CARD_TYPES: CARD_TYPES, LINEAGES: LINEAGES, ROLES: ROLES, RARITIES: RARITIES,
    makeRegistry: makeRegistry
  };
})(globalThis.G = globalThis.G || {});
