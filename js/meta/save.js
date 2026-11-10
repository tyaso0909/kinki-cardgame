(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // js/meta/save.js — G.Save: the only module that touches localStorage.
  //   keys: kinki.meta / kinki.run / kinki.settings (JSON, versioned)
  //   G.Save.meta() / updateMeta(fn) / saveRun / loadRun / hasRun / clearRun
  //   G.Save.settings.get()/set(patch) / wipe() / exportString() / importString(str)
  // Works headless (Node): falls back to an in-memory store when localStorage is absent.
  // ---------------------------------------------------------------
  const PREFIX = 'kinki.';
  const KEYS = { meta: PREFIX + 'meta', run: PREFIX + 'run', settings: PREFIX + 'settings' };
  const META_VERSION = 1;
  const RUN_VERSION = 1;

  // ---- storage backend -------------------------------------------------------------
  const memory = {};
  function store() {
    try {
      if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
    } catch (e) { /* blocked storage */ }
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(memory, k) ? memory[k] : null; },
      setItem: function (k, v) { memory[k] = String(v); },
      removeItem: function (k) { delete memory[k]; },
      key: function (i) { return Object.keys(memory)[i] || null; },
      get length() { return Object.keys(memory).length; }
    };
  }
  function readJSON(key) {
    try { const raw = store().getItem(key); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function writeJSON(key, value) {
    try { store().setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
  }

  // ---- meta -------------------------------------------------------------------------
  function defaultMeta() {
    return {
      version: META_VERSION,
      depth: 0, maxDepthCleared: -1, runsStarted: 0, runsCleared: 0,
      lineageClears: { accel: 0, cycle: 0, chain: 0, time: 0, copy: 0, doom: 0 },
      codex: { cards: {}, relics: {}, enemies: {}, diary: {} },
      achievements: {},
      records: { maxDamageOneTurn: 0, maxChain: 0, longestLoop: 0, maxDepth: 0, lineageUse: {}, cardUse: {} },
      graffitiCard: null, lastRunDeck: [], unlockedPacks: []
    };
  }
  // Fill missing fields (forward-compatible) and run version migrations.
  function migrateMeta(m) {
    const d = defaultMeta();
    if (!m || typeof m !== 'object') return d;
    const out = Object.assign(d, m);
    out.lineageClears = Object.assign(d.lineageClears, m.lineageClears || {});
    out.codex = Object.assign(d.codex, m.codex || {});
    ['cards', 'relics', 'enemies', 'diary'].forEach(function (k) { if (!out.codex[k] || typeof out.codex[k] !== 'object') out.codex[k] = {}; });
    out.records = Object.assign(d.records, m.records || {});
    if (!Array.isArray(out.lastRunDeck)) out.lastRunDeck = [];
    if (!Array.isArray(out.unlockedPacks)) out.unlockedPacks = [];
    if (!out.achievements || typeof out.achievements !== 'object') out.achievements = {};
    // version migrations (stub): switch (out.version) { case 0: ...; }
    if (typeof out.version !== 'number' || out.version < META_VERSION) out.version = META_VERSION;
    return out;
  }

  let metaCache = null;
  function meta() {
    if (!metaCache) metaCache = migrateMeta(readJSON(KEYS.meta));
    return metaCache;
  }
  function updateMeta(fn) {
    const m = meta();
    if (typeof fn === 'function') fn(m);
    metaCache = migrateMeta(m);
    writeJSON(KEYS.meta, metaCache);
    return metaCache;
  }

  // ---- run ----------------------------------------------------------------------------
  function saveRun(runState) {
    if (!runState) return clearRun();
    const payload = Object.assign({}, runState, { version: RUN_VERSION, savedAt: Date.now() });
    return writeJSON(KEYS.run, payload);
  }
  function migrateRun(r) {
    if (!r || typeof r !== 'object') return null;
    // version migrations (stub)
    if (typeof r.version !== 'number') r.version = RUN_VERSION;
    return r;
  }
  function loadRun() { return migrateRun(readJSON(KEYS.run)); }
  function hasRun() { return !!readJSON(KEYS.run); }
  function clearRun() { try { store().removeItem(KEYS.run); return true; } catch (e) { return false; } }

  // ---- settings -------------------------------------------------------------------------
  const settings = {
    get: function () { return readJSON(KEYS.settings) || {}; },
    set: function (patch) { const next = Object.assign(settings.get(), patch || {}); writeJSON(KEYS.settings, next); return next; }
  };

  // ---- wipe / export / import ---------------------------------------------------------------
  function allKeys() {
    const s = store(), out = [];
    for (let i = 0; i < s.length; i++) { const k = s.key(i); if (k && k.indexOf(PREFIX) === 0) out.push(k); }
    return out;
  }
  function wipe() {
    allKeys().forEach(function (k) { try { store().removeItem(k); } catch (e) { /* ignore */ } });
    metaCache = null;
  }
  function toBase64(str) {
    const utf8 = unescape(encodeURIComponent(str));
    if (typeof btoa === 'function') return btoa(utf8);
    return Buffer.from(utf8, 'binary').toString('base64');
  }
  function fromBase64(b64) {
    const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    return decodeURIComponent(escape(bin));
  }
  function exportString() {
    const data = { format: 'kinki-save', version: 1, exportedAt: Date.now(), meta: meta(), run: loadRun(), settings: settings.get() };
    return toBase64(JSON.stringify(data));
  }
  function importString(str) {
    let data;
    try { data = JSON.parse(fromBase64(String(str || '').trim())); } catch (e) { return { ok: false, reason: 'parse' }; }
    if (!data || data.format !== 'kinki-save') return { ok: false, reason: 'format' };
    metaCache = migrateMeta(data.meta);
    writeJSON(KEYS.meta, metaCache);
    if (data.run) writeJSON(KEYS.run, migrateRun(data.run)); else clearRun();
    if (data.settings) writeJSON(KEYS.settings, data.settings);
    return { ok: true };
  }
  function load() { metaCache = null; return meta(); }

  G.Save = {
    KEYS: KEYS, META_VERSION: META_VERSION, RUN_VERSION: RUN_VERSION,
    meta: meta, updateMeta: updateMeta, defaultMeta: defaultMeta, load: load,
    saveRun: saveRun, loadRun: loadRun, hasRun: hasRun, clearRun: clearRun,
    settings: settings, wipe: wipe, exportString: exportString, importString: importString,
    _reset: function () { metaCache = null; }
  };
})(globalThis.G = globalThis.G || {});
