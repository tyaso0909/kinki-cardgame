(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // G.util — small pure helpers shared by every module.
  // ---------------------------------------------------------------
  const util = {};

  util.assert = function (cond, msg) {
    if (!cond) throw new Error('Assertion failed: ' + (msg || ''));
  };

  // Deep clone of plain JSON data (objects, arrays, primitives). Functions are
  // copied by reference (they must never live inside serialized state anyway).
  util.deepClone = function deepClone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) {
      const out = new Array(v.length);
      for (let i = 0; i < v.length; i++) out[i] = deepClone(v[i]);
      return out;
    }
    const out = {};
    for (const k in v) {
      if (Object.prototype.hasOwnProperty.call(v, k)) out[k] = deepClone(v[k]);
    }
    return out;
  };

  // Monotonic id generator factory (used for CardInst.uid inside a game).
  util.counter = function (start) {
    let n = start || 0;
    return function () { return ++n; };
  };

  let globalUid = 0;
  util.uid = function () { return ++globalUid; };

  util.clamp = function (n, lo, hi) { return n < lo ? lo : n > hi ? hi : n; };

  util.sum = function (arr, fn) {
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += fn ? fn(arr[i], i) : arr[i];
    return s;
  };

  util.removeFrom = function (arr, item) {
    const i = arr.indexOf(item);
    if (i >= 0) arr.splice(i, 1);
    return i >= 0;
  };

  util.last = function (arr) { return arr.length ? arr[arr.length - 1] : undefined; };

  util.uniq = function (arr) { return Array.from(new Set(arr)); };

  util.isFn = function (v) { return typeof v === 'function'; };

  // Simple string hash (FNV-1a 32bit) for loop-detection state hashes.
  util.hashString = function (str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  };

  // Japanese-friendly pluralless formatting helper: fmt('{0}は{1}を得た', a, b)
  util.fmt = function (tpl) {
    const args = Array.prototype.slice.call(arguments, 1);
    return tpl.replace(/\{(\d+)\}/g, function (_, i) { return String(args[+i]); });
  };

  G.util = util;

  // ---------------------------------------------------------------
  // G.RNG — seedable deterministic PRNG (mulberry32). state()/restore().
  // ---------------------------------------------------------------
  function RNG(seed) {
    this.seed = (seed === undefined || seed === null) ? (Date.now() >>> 0) : (seed >>> 0);
    this.s = this.seed;
  }

  RNG.prototype.next = function () {
    // mulberry32
    let t = (this.s = (this.s + 0x6D2B79F5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Integer in [0, n)
  RNG.prototype.int = function (n) {
    if (n <= 0) return 0;
    return Math.floor(this.next() * n);
  };

  RNG.prototype.pick = function (arr) {
    if (!arr || !arr.length) return undefined;
    return arr[this.int(arr.length)];
  };

  // In-place Fisher–Yates shuffle; returns the array.
  RNG.prototype.shuffle = function (arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
    }
    return arr;
  };

  RNG.prototype.chance = function (p) { return this.next() < p; };

  RNG.prototype.state = function () { return { seed: this.seed, s: this.s }; };

  RNG.prototype.restore = function (st) {
    this.seed = st.seed >>> 0;
    this.s = st.s >>> 0;
    return this;
  };

  RNG.prototype.clone = function () { return new RNG(0).restore(this.state()); };

  RNG.fromState = function (st) { return new RNG(0).restore(st); };

  G.RNG = RNG;
})(globalThis.G = globalThis.G || {});
