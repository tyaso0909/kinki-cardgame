(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // js/run/map.js — G.RunMap: branching act map (Slay the Spire style).
  //   G.RunMap.generate({act, rng, depth, eliteExtra, enemies, elites, bosses}) → map
  //   map = { act, rows: [[nodeId...]], nodes: {id: Node}, bossId, width }
  //   Node = { id, row, col, type: 'battle'|'elite'|'shop'|'event'|'rest'|'boss', next: [ids], enemyId?, fog, name? }
  //   G.RunMap.validate(map) → { ok, errors }  (every node reachable from row 0, every node reaches boss)
  //   G.RunMap.BOSS_CANDIDATES — SPEC ボスの出現
  // ---------------------------------------------------------------
  const ROWS = 7;          // rows 0..6 before the boss row
  const WIDTH = 4;         // column slots
  const BOSS_CANDIDATES = { 1: ['boss_loop_artisan', 'boss_collector'], 2: ['boss_storm_magus', 'boss_time_thief'], 3: ['boss_mirror_lord'] };
  const TYPE_LABEL = { battle: '通常戦', elite: 'エリート', shop: 'ショップ', event: 'イベント', rest: '休憩', boss: 'ボス' };

  function weightedType(rng, row, counts, wantElite) {
    // row 0 = battle (fixed), last row = rest (fixed). Rows 1..5 draw from weights.
    const w = { battle: 46, event: 22, shop: 10, elite: row >= 2 ? 12 : 0, rest: row >= 3 ? 10 : 0 };
    if (counts.shop >= 2) w.shop = 2;
    if (counts.elite >= (wantElite + 1)) w.elite = 1;
    if (counts.rest >= 2) w.rest = 1;
    let total = 0; Object.keys(w).forEach(function (k) { total += w[k]; });
    let r = rng.next() * total;
    const keys = Object.keys(w);
    for (let i = 0; i < keys.length; i++) { r -= w[keys[i]]; if (r < 0) return keys[i]; }
    return 'battle';
  }

  function pickColumns(rng, n) {
    const cols = [0, 1, 2, 3].slice(0, WIDTH);
    rng.shuffle(cols);
    return cols.slice(0, n).sort(function (a, b) { return a - b; });
  }

  // Monotone (non-crossing) edges between two rows; every node gets ≥1 in and ≥1 out.
  function connect(rng, from, to) {
    const n1 = from.length, n2 = to.length;
    for (let i = 0; i < n1; i++) {
      const lo = Math.floor(i * n2 / n1);
      const hi = Math.max(lo, Math.ceil((i + 1) * n2 / n1) - 1);
      for (let j = lo; j <= hi; j++) from[i].next.push(to[j].id);
      // optional extra edge to the right when it cannot cross the next node's edges
      const nextLo = i + 1 < n1 ? Math.floor((i + 1) * n2 / n1) : n2;
      if (hi + 1 < n2 && nextLo >= hi + 1 && rng.chance(0.35)) from[i].next.push(to[hi + 1].id);
    }
  }

  function generate(opts) {
    opts = opts || {};
    const act = opts.act || 1;
    const rng = opts.rng || new G.RNG(opts.seed != null ? opts.seed : 1);
    const wantElite = 1 + (opts.eliteExtra || 0);
    const nodes = {}, rows = [];
    let nid = 0;
    const counts = { battle: 0, elite: 0, shop: 0, event: 0, rest: 0 };
    function mk(row, col, type) {
      const id = 'a' + act + 'n' + (nid++);
      const node = { id: id, row: row, col: col, type: type, next: [], fog: false };
      nodes[id] = node; counts[type] = (counts[type] || 0) + 1;
      return node;
    }
    for (let r = 0; r < ROWS; r++) {
      const n = 2 + rng.int(3); // 2..4
      const cols = pickColumns(rng, n);
      const row = cols.map(function (c) {
        const type = r === 0 ? 'battle' : r === ROWS - 1 ? 'rest' : weightedType(rng, r, counts, wantElite);
        return mk(r, c, type);
      });
      rows.push(row);
    }
    // Guarantees: at least one shop and `wantElite` elites per act (convert battle nodes in rows 1..5).
    function convertSome(type, need) {
      let have = counts[type] || 0;
      const cands = [];
      for (let r = 1; r < ROWS - 1; r++) rows[r].forEach(function (nd) { if (nd.type === 'battle' && (type !== 'elite' || r >= 2)) cands.push(nd); });
      rng.shuffle(cands);
      while (have < need && cands.length) { const nd = cands.pop(); counts.battle--; nd.type = type; counts[type] = ++have; }
    }
    convertSome('shop', 1);
    convertSome('elite', wantElite);
    if (counts.event === 0) convertSome('event', 1);
    // boss
    const bossPool = opts.bosses || BOSS_CANDIDATES[act] || BOSS_CANDIDATES[3];
    const bossId = rng.pick(bossPool);
    const boss = mk(ROWS, 1.5, 'boss');
    boss.enemyId = bossId;
    rows.push([boss]);
    // edges
    for (let r = 0; r < ROWS - 1; r++) connect(rng, rows[r], rows[r + 1]);
    rows[ROWS - 1].forEach(function (nd) { nd.next.push(boss.id); });
    // enemies: no repeats within the act when possible
    assignEnemies(rng, rows, 'battle', opts.enemies || defaultEnemies('normal', act));
    assignEnemies(rng, rows, 'elite', opts.elites || defaultEnemies('elite', act));
    // fog candidates for 嘘つきの地図 (shown as ？ only while the relic is held)
    Object.keys(nodes).forEach(function (id) { const nd = nodes[id]; if (nd.row > 0 && nd.type !== 'boss' && rng.chance(0.3)) nd.fog = true; });
    const map = { act: act, rows: rows.map(function (row) { return row.map(function (nd) { return nd.id; }); }), nodes: nodes, bossId: boss.id, bossEnemyId: bossId, width: WIDTH, rowCount: rows.length };
    return map;
  }

  function defaultEnemies(tier, act) {
    if (!G.Enemies) return [];
    return G.Enemies.byTier(tier, act).map(function (e) { return e.id; });
  }
  function assignEnemies(rng, rows, type, pool) {
    if (!pool || !pool.length) return;
    let bag = [];
    rows.forEach(function (row) {
      row.forEach(function (nd) {
        if (nd.type !== type) return;
        if (!bag.length) bag = rng.shuffle(pool.slice());
        nd.enemyId = bag.pop();
      });
    });
  }

  // ---- validation ---------------------------------------------------------------------
  function validate(map) {
    const errors = [];
    const nodes = map.nodes;
    const ids = Object.keys(nodes);
    const start = map.rows[0];
    // forward reachability
    const seen = {};
    const stack = start.slice();
    while (stack.length) { const id = stack.pop(); if (seen[id]) continue; seen[id] = true; nodes[id].next.forEach(function (n) { if (!nodes[n]) errors.push('dangling edge ' + id + '→' + n); else stack.push(n); }); }
    ids.forEach(function (id) { if (!seen[id]) errors.push('unreachable node ' + id); });
    // every node reaches the boss
    const reach = {}; reach[map.bossId] = true;
    for (let r = map.rows.length - 2; r >= 0; r--) map.rows[r].forEach(function (id) { if (nodes[id].next.some(function (n) { return reach[n]; })) reach[id] = true; });
    ids.forEach(function (id) { if (!reach[id]) errors.push('node cannot reach boss ' + id); });
    // edges only go to the next row
    ids.forEach(function (id) { nodes[id].next.forEach(function (n) { if (nodes[n] && nodes[n].row !== nodes[id].row + 1) errors.push('edge skips rows ' + id + '→' + n); }); });
    if (!map.rows[0].every(function (id) { return nodes[id].type === 'battle'; })) errors.push('row 0 must be battles');
    if (!map.rows[map.rows.length - 2].every(function (id) { return nodes[id].type === 'rest'; })) errors.push('row before boss must be rests');
    if (nodes[map.bossId].type !== 'boss') errors.push('boss node type');
    return { ok: errors.length === 0, errors: errors };
  }

  function counts(map) {
    const out = {};
    Object.keys(map.nodes).forEach(function (id) { const t = map.nodes[id].type; out[t] = (out[t] || 0) + 1; });
    return out;
  }

  G.RunMap = { generate: generate, validate: validate, counts: counts, ROWS: ROWS, WIDTH: WIDTH, BOSS_CANDIDATES: BOSS_CANDIDATES, TYPE_LABEL: TYPE_LABEL };
})(globalThis.G = globalThis.G || {});
