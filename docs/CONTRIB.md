# Contributor brief (Phase 2 — parallel work)

Project: `/home/claude/kinki-cardgame`. Browser card game 『禁域』. Read `docs/ARCHITECTURE.md` (contract), `js/engine/README.md` (how to write card hooks — follow its patterns), and the relevant `docs/SPEC.md` sections. Engine tests: `node tests/run.js` (must stay green). Run `node tests/run.js <filter>` to run a subset.

## Hard rules for every agent
- Classic script wrapper `(function(G){ 'use strict'; ... })(globalThis.G = globalThis.G || {});`. No ES modules, no DOM in non-UI files, no `Math.random()` (use `ctx.rng` / `G.RNG`).
- **Do not edit** `index.html`, `docs/ARCHITECTURE.md`, `js/engine/*`, `js/core/*`, `tests/harness.js`, `tests/run.js`, or any file owned by another agent. If you need an engine change, implement a workaround in your own file and list the request in your final report (the integrator will apply it). If you find an engine bug that blocks you, fix it minimally in the engine, add a regression test in **your own** test file, and report the exact change.
- Only create files inside the paths you own. Add tests under `tests/<yourarea>_*.test.js`.
- Card/relic/enemy `text` must match SPEC wording. Deviations → `docs/DEVIATIONS.md` (append a section with your area name; never rewrite others' sections).
- Player-facing strings in Japanese.

## ID conventions
- Cards: `accel_01..25`, `cycle_01..25`, `copy_01..25`, `chain_01..25`, `time_01..25`, `doom_01..25` numbered **in SPEC table order**; generic/妨害 `gen_01..30`; boss cards `boss1_01..` (ループ職人), `boss2_` (ストームの魔術師), `boss3_` (時間泥棒), `boss4_` (蒐集者), `boss5_` (鏡の主); elite cards `elite1_01..elite6_01`; basic card 《見習いの火球》= `basic_01`.
- Relics: `relic_<slug>` (English slug), enemies `enemy_<slug>`, elites `elite_<slug>`, bosses `boss_<slug>`, run events `event_<slug>`.
- Every CardDef should set `tags` where useful: `'dragon'`, `'hourglass'`, `'key'`, `'loopPart'`, `'phantomMaker'`, `'extraTurn'`, `'finisher'`, `'disrupt'`.
- To look up a card by Japanese name use `G.CardDB.all().find(d => d.name === name)`; data authors may add `G.Data.idByName(name)` helper in `js/data/_index.js` (owned by the Cards-C agent).

## Testing pattern
```js
// tests/cards_accel.test.js
require('./harness.js'); G.Test.loadAll();
const { test, assert, eq, sandbox } = G.Test;
test('火種: マナ+1 と 1ドロー', async () => {
  const g = await sandbox({ p0: { hand: ['accel_06'], mana: 3, deck: ['accel_01','accel_01'] } });
  await g.playCard(0, g.players[0].hand[0].uid);
  eq(g.players[0].mana, 4); eq(g.players[0].hand.length, 1);
});
```
Smoke test: iterate every card in your file, build a sandbox where it is playable (fill opponent board for targets), play it, assert no throw. Then add targeted tests for every non-trivial card and for each combo listed in the SPEC "この系統で生まれるコンボ例" of your lineages (the combo must actually work in the engine).
