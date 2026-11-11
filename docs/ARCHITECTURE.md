# ARCHITECTURE — 『禁域』(working title) ぶっ壊れカードゲーム

This document is the **binding contract** between all contributors (engine, cards, AI, run, UI, meta).
Read `docs/SPEC.md` for game rules/content. When SPEC and this file conflict on *implementation*, this file wins;
on *game rules/content*, SPEC wins (and this file must be updated).

## 0. Tech decisions

- Pure browser game: HTML + CSS + vanilla JS. **No build step, no bundler, no ES modules.**
- Every JS file is a classic script that attaches to a global namespace:
  ```js
  (function (G) {
    'use strict';
    // ... G.Engine = ..., G.CardDB.register(...), etc.
  })(globalThis.G = globalThis.G || {});
  ```
  This runs unchanged in the browser (`<script src>`) and in Node (`require` for tests).
- `index.html` lists all scripts in dependency order (see §9). Keep the list updated when adding files.
- Game logic (engine, data, ai, run) must be **DOM-free** and runnable headless in Node (`node tests/run.js`).
  Only `js/ui/*` touches the DOM.
- Language: all player-facing text in Japanese. Code identifiers in English.
- Randomness: always via `G.RNG` (seedable, `rng.next()`, `rng.int(n)`, `rng.pick(arr)`, `rng.shuffle(arr)`). Never `Math.random()` in logic code.
- Persistence: `localStorage` through `G.Save` only (`js/meta/save.js`).
- Target: phone portrait first (360×740), also desktop. No images; cards are rendered with CSS (lineage color, type frame, icon glyph, text). Design so art can be slotted later (`CardDef.art` optional URL).

## 1. Terminology (JP → code)

| JP | code | notes |
| --- | --- | --- |
| モンスター / 魔法 / 紋章 / フィールド | `type: 'monster' \| 'spell' \| 'crest' \| 'field'` | |
| 加速/循環/連鎖/時間/複製/終焉/汎用 | `lineage: 'accel' \| 'cycle' \| 'chain' \| 'time' \| 'copy' \| 'doom' \| 'generic'` | |
| エンジン/燃料/出口/妨害 | `role: 'engine' \| 'fuel' \| 'finisher' \| 'disrupt'` | |
| コモン/レア/伝説/禁忌 | `rarity: 'common' \| 'rare' \| 'legend' \| 'taboo'` | boss-only cards: `rarity: 'boss'` |
| 速攻 / 守護 | keywords `rush`, `guard` | |
| 召喚時 / 破壊時 / 常在 | hooks `onSummon`, `onDeath`, passive hooks | |
| 予約 (reserve spell) | `reserve: true` + `reserveHooks` | takes effect during opponent's next turn |
| 再演（コスト） | `reprise: <cost>` | playable from grave for that cost; exiled after |
| 時限N | `timed: N` | goes to timed zone; fires when count hits 0 |
| 幻影 | `CardInst.isPhantom` | separate zone `phantoms`, max 30 |
| 連鎖数 | `player.chain` | cards played this turn (not copies) |
| 呪詛 | `player.curse` | lose at 20 (or `player.curseLimit`) |
| 封印ゾーン / 鍵 | `player.seals[]`, `CardDef.key: 1..5 \| 'wild'` | win with 5 distinct keys |
| 除外 | zone `exile` | |
| 追加ターン | `player.extraTurns` | |
| 連続ターン数 | `game.streak` | consecutive turns by same player |
| 危険度メーター | `game.hazard(playerIdx)` → 0..100 | |
| 蒐集箱 | `player.vault[]` | cards stolen for the battle (Boss 4) |
| 最大マナ / マナ | `player.maxMana`, `player.mana` | |

## 2. Data model (serializable, no closures)

```js
CardDef = {
  id: 'accel_01',            // stable, lineage prefix + number; boss cards 'boss1_xx', elite 'elite1_xx'
  name: '火の粉の妖精',
  type: 'monster', lineage: 'accel', role: 'fuel', rarity: 'common',
  cost: 0,                   // number | 'X'
  atk: 1, hp: 1,             // monsters only
  keywords: ['rush','guard'],// optional
  reserve: false, reprise: null, timed: null,
  key: null,                 // 1..5 | 'wild' for seal keys
  text: '召喚時、マナ+1',     // rules text shown on card (JP)
  flavor: '',                // optional
  tags: ['dragon'],          // optional free tags (e.g. 'dragon','hourglass','key','loopPart')
  bossOnly: false,           // true = never in player pool/packs; cannot be rewarded
  effects: { /* hooks, see §4 */ },
  targets: null | TargetSpec // see §4.3
}

CardInst = {
  uid: 17, defId: 'accel_01', owner: 0,
  // monster runtime
  atk, hp, maxHp, damage: 0, summonedTurn, attacksLeft, isPhantom: false, persistent: false (幻影が消えない),
  keywords: [...copy], buffs: [], counters: {}, exhausted: false,
  // generic
  zone: 'deck'|'hand'|'board'|'phantoms'|'crests'|'field'|'grave'|'exile'|'timed'|'seals'|'vault',
  timedCount: null, isCopy: false, stolenFrom: null
}

Player = {
  idx: 0|1, name, isAI, enemyDefId: null,
  life: 40, maxLife: 40, mana: 0, maxMana: 0,
  deck: [], hand: [], board: [], phantoms: [], crests: [], grave: [], exile: [], timed: [], seals: [], vault: [],
  curse: 0, curseLimit: 20, chain: 0,
  // per-turn counters (reset at that player's turn start)
  manaGainedThisTurn: 0, drawnThisTurn: 0, playedThisTurn: [defId...], returnedToHandThisTurn: 0,
  destroyedThisTurn: [], spellsPlayedThisTurn: [], maxDamageDealtOnce: 0,
  extraTurns: 0, skipNextTurn: false,
  reserves: [],              // active ReserveEffect objects targeting THIS player (set by opponent)
  statuses: {},              // named flags: { noExtraTurn: true, cardsPerTurnLimit: 5, ... }
  relics: ['relic_id', ...], // battle-relevant relics (hooks via G.RelicDB)
  stats: { ... }             // for records/achievements
}

Game = {
  seed, rng, turn: 1, active: 0, streak: 1, first: 0,
  players: [P0, P1],
  field: CardInst|null, fieldOwner: null,
  phase: 'start'|'main'|'end',
  winner: null, winReason: null,     // 'life'|'deckout'|'curse'|'seals'|'prophecy'|'loopInfinite'|'surrender'
  log: [LogEntry], pendingChoice: null,
  loop: { ... },                     // loop detector state (§6)
  turnLimit: null, options: { aiMistakeRate }
}
```

**Deep clone**: `game.clone()` must produce an independent copy (used by AI lookahead). Keep state JSON-friendly; `rng` has `.state()`/`.restore()`.

## 3. Engine API (`js/engine/*.js` → `G.Engine`)

```js
const game = G.Engine.createGame({ seed, players: [{deck: [defIds], relics, isAI, name, life}, {...}], field: defId|null, options });
await game.start();                       // coin toss, initial hands, first turn start
await game.playCard(pIdx, cardUid, { choices })   // from hand (or grave if reprise). Resolves fully.
await game.attack(pIdx, attackerUid, targetUid|'face')
await game.endTurn(pIdx)
game.getPlayable(pIdx)   // [{uid, cost, from:'hand'|'grave', needsTarget}]
game.getAttackers(pIdx)  // [{uid, targets:[uid|'face']}]
game.hazard(pIdx)        // hazard meter of player pIdx's *opponent-facing* threat (see §7)
game.on(eventName, fn) / game.off   // UI/AI subscribe to log events (see §5)
game.clone()
game.serialize() / G.Engine.deserialize(json)
```

All mutation goes through **engine action methods** on a context object so hooks fire consistently:

```js
ctx = {
  game, me (Player), opp (Player), card (CardInst that is resolving), source,
  // resources
  gainMana(n, who=me), loseMana(n, who), gainMaxMana(n, who), setMana(n, who),
  draw(n, who=me) → CardInst[], discard(cards|n, who), mill(n, who), tutor(predicate, who, {from:'deck'}) → CardInst|null,
  lookTop(n, who), putOnTop(cards, who), putOnBottom(cards, who), shuffleDeck(who), shuffleGraveIntoDeck(who),
  // damage/life
  damage(target: Player|CardInst|'face'|'opp', n, {source}) , heal(who, n), loseLife(who, n),
  // zones
  summon(cardInst|defId, who, {asPhantom, persistent, triggerSummon=true}) → CardInst|null (null if board full),
  createPhantom(ofCard, who, {count}) → CardInst[]  // obeys 30 cap, no onSummon unless statuses.phantomSummonEffects
  destroy(cardInst, {source}), exile(cardInst), returnToHand(cardInst), toGrave(cardInst),
  bounceToDeckTop / bounceToDeckBottom(cardInst),
  placeCrest(cardInst, who) → bool (handles 6th → caller must have chosen which to swap via pick),
  removeCrest(cardInst), setField(cardInst, who), destroyField(),
  reviveFromGrave(cardInst, who), steal(cardInst, who) /* move monster to who's board */, vaultSteal(cardInst, who),
  addToHand(defId|cardInst, who, {isCopy}), addSeal(cardInst, who), removeSeal(cardInst), 
  // counters & turns
  addCurse(who, n), removeCurse(who, n), moveCurse(from, to), setChain(n), addChain(n),
  extraTurn(who), skipTurn(who), addTimed(cardInst, who, n), tickTimed(who, n), fireTimed(cardInst),
  // cast
  cast(defId|cardInst, who, {free:true, copy:true, times:1}),   // play a card/copy without paying; copies do not add chain
  replay(cardInst)   // re-fire its onPlay (多重詠唱)
  // info
  isMyTurn(), turn(), rarityOf(def), defOf(cardInst), countZone(who,'grave', pred), 
  // choices (async)
  pick(spec) → Promise<CardInst[]|Player|string>   // spec from §4.3; auto-resolved for AI via player.chooser
  choose(options:[{id,label}], {prompt}) → Promise<id>
  // misc
  log(msg, data), rng
}
```

- Costs: `game.costOf(pIdx, cardInst)` applies all cost modifiers (crests, fields, reserves, statuses, relics). X cost: UI/AI passes `choices.x`.
- Mana gain always routes through `ctx.gainMana` so `onManaGained`/`modManaGain` hooks (炉心, 火山, 司書長…) fire. `manaGainedThisTurn` accumulates post-modifier amounts.
- Playing a card: pay cost → remove from hand → `chain += 1` (unless copy) → `playedThisTurn.push` → fire `onCardPlayed` triggers (global) → resolve by type:
  - spell: `effects.onPlay(ctx)` (2× if 鏡の湖/双面 etc. via `statuses.spellMultiplier` + per-card `nextSpellTimes`), then `toGrave` (or hand if 永劫の書: `statuses.spellsReturnToHand`), fire `onSpellToGrave`.
  - reserve spell: becomes a `ReserveEffect` attached to `opp.reserves` with `expiresAfterTurn` = opp's next turn; its `reserveHooks` behave like passive hooks only during that turn. Blocked by `statuses.immuneReserve` (反魔の護符).
  - timed spell: `addTimed(card, me, def.timed)`; `effects.onTimed(ctx)` fires at 0.
  - monster: `summon` → `onSummon` (×2 if `statuses.summonMultiplier`), 速攻 sets `attacksLeft=1`.
  - crest: `placeCrest` (dup name refused; 6th requires swap), fire `onPlace`.
  - field: replace game.field (old → grave), `onPlace` only for owner's 展開時 effect.
- Turn structure (per SPEC): start → `maxMana += 1` (×modifiers), `mana = maxMana` (+carryover), tick timed, draw 1 (skip if first player's first turn; `statuses.drawPerTurn` may be 2), reset per-turn counters, fire `onTurnStart`; main; end → `onTurnEnd`, hand limit 6 (choose via pick), `chain` reset (unless 世界を貫く雷), mana cleared (unless 天井なき空), phantoms vanish (unless persistent), expire reserves, extra-turn check (`extraTurns>0` → same player, `streak+1`), else switch.
- Win checks after every action: life ≤ 0, deck-out on failed draw, curse ≥ curseLimit, 5 distinct keys (wild counts), prophecy flag, `loopInfinite`.
- `statuses` is the generic switchboard. Known keys (engine must honor): `spellMultiplier`, `summonMultiplier`, `allEffectsMultiplier`(禁忌 鏡合わせ), `spellsReturnToHand`, `manaPersists`, `manaDoubleAtStart`, `chainPersists`, `chainMultiplier`, `phantomsPersist`, `phantomSummonEffects`, `drawPerTurn`, `cardsPerTurnLimit`, `sameNamePerTurnLimit`, `noExtraTurn`, `noGravePlay`, `noMonsterTriggers`, `noSpecialWin`, `immuneReserve`, `loopSecondIterationVoid`, `maxBoard`, `reflectFirstDamage`, `invertEffects`, `cannotAttack`, `timedTickRate`, `extraCostAfterN`, `firstSpellNegated`, `manaGainHalved`, `phantomAtkBonus`, `curseRedirectToMonsterUid`. Each is stored as `{value, until: {turn, player}|null, sourceUid}` so expiry is uniform: `ctx.setStatus(who, key, value, {untilEndOfTurnOf: pIdx | 'opponentNext'})`.

## 4. Card effect hooks

### 4.1 Own-card hooks (fire for the card itself)
`onPlay(ctx)`, `onPlace(ctx)` (crest/field placed by owner), `onSummon(ctx)`, `onDeath(ctx)`, `onLeave(ctx)`, `onTimed(ctx)`, `onAttack(ctx, target)`, `onDamaged(ctx, n)`, `canPlay(ctx) → bool`, `xValue(ctx) → number` (for X), `costMod(ctx) → delta` (self cost mod, e.g. 火喰い竜).

### 4.2 Passive/trigger hooks (active while the card is on board/crests/field, or while a reserve is live)
Each receives `(ctx, ev)` where `ctx.card` is the hook owner and `ev` is the event payload.
`onCardPlayed(ctx, {card, who, isCopy})`, `onSpellPlayed`, `onManaGained(ctx, {amount, who})`, `onDraw(ctx,{card,who})`,
`onTurnStart(ctx,{who})`, `onTurnEnd(ctx,{who})`, `onMonsterDestroyed(ctx,{card, who})`, `onMonsterSummoned`,
`onPhantomCreated(ctx,{card,who})`, `onSpellToGrave(ctx,{card,who})`, `onDamageDealt(ctx,{source,target,amount})`,
`onReturnedToHand(ctx,{card,who})`, `onLifeLost(ctx,{who,amount})`, `onExtraTurn(ctx,{who})`, `onCurseAdded(ctx,{who,amount})`,
`onLoopIteration(ctx,{who})`, `onChainReached(ctx,{who,chain})`.
Modifier hooks (pure, return new value): `modCost(ctx, {card, who, cost}) → cost`, `modManaGain(ctx,{who,amount}) → amount`,
`modChain(ctx,{who,chain}) → chain`, `modDamage(ctx,{source,target,amount}) → amount`, `modDrawCount`.
Scope: `effects.scope = 'self' | 'any'` — whether a trigger fires only for the owner's events (default) or both players' (e.g. 帯電する天空, 竜脈の火山 fields are `'any'`).

### 4.3 Targeting
```js
targets: { kind: 'monster'|'card'|'crest'|'player'|'handCard'|'graveCard'|'timedCard'|'sealCard',
           side: 'ally'|'enemy'|'any', filter: (ctx, cardInst) => bool, count: 1, upTo: false, optional: false,
           prompt: '破壊するモンスターを選ぶ' }
```
UI prompts before `playCard`; result passed as `choices.targets = [uid,...]`. Effects read `ctx.targets`.
Additional mid-resolution picks use `await ctx.pick({...same spec...})`. AI players resolve picks through `player.chooser(spec, candidates)`; a default greedy chooser lives in `js/ai/chooser.js`.

### 4.4 Helpers (`G.Fx`, `js/engine/fx.js`)
Shared mini-effects to avoid duplication: `Fx.dmgOpp(n)`, `Fx.gainMana(n)`, `Fx.draw(n)`, `Fx.curse(n)`, `Fx.tutor(pred)`, `Fx.destroyTarget()`, etc. Returning `(ctx) => {...}` functions. Card authors should use these for simple cards and write custom closures for complex ones.

## 5. Events / log (for UI & tests)
`game.emit(type, payload)` — every state change emits. Types: `turnStart`, `turnEnd`, `cardPlayed`, `cardResolved`, `summon`, `destroy`, `damage`, `heal`, `draw`, `discard`, `manaChange`, `moveZone`, `attack`, `curse`, `seal`, `timedTick`, `timedFire`, `reserveSet`, `extraTurn`, `fieldSet`, `crestSet`, `loopDetected`, `loopIteration`, `hazardChange`, `forecast` (予告), `win`, `log`.
Payloads reference uids/defIds only. UI replays these to animate; AI ignores.

## 6. Loop detection (`js/engine/loop.js`)
- After every player action, compute `stateHash` (life/mana/maxMana/hand defIds sorted/board/grave sizes/crest ids/curse/seals/chain). Keep `history` of `{hash, actionDesc}` for the current turn.
- If the same hash appears a **3rd** time in the turn, emit `loopDetected` with `cycle` = actions between repeats. Engine exposes `game.runLoop(pIdx, times | 'inf')` which replays the cycle (re-issuing the same action descriptors) `times` times or until the game ends / an action becomes illegal / state stops cycling. `'inf'`: run until win; if 999 iterations pass with no win → emit `overflow`, stop (per SPEC). If both sides cannot stop… (engine doesn't judge; AI/UI just run to win). `statuses.loopSecondIterationVoid` (零の聖域) makes iterations ≥2 no-ops → loop ends. `statuses.sameNamePerTurnLimit` prevents loops via playCard legality.
- Each iteration emits `onLoopIteration` (ループの螺子 relic). Loop count tracked for records/achievements (`game.stats.longestLoop`).

## 7. Hazard meter & forecast (予告)
`EnemyDef.hazard = [{ test: (game, enemyPlayer, playerPlayer) => bool, weight: 40 }, ...]` (sum 100). `game.hazard(enemyIdx)` sums weights. The AI, at **its turn end**, if hazard ≥ 100 → `emit('forecast', {text})` and sets `enemy.statuses.forecasted = true`; it may only execute a *finisher combo* on the turn after a forecast (SPEC §敵AI). If hazard drops <100 the forecast is cancelled (`forecastCancelled`).

## 8. AI (`js/ai/*.js` → `G.AI`)
`G.AI.takeTurn(game, pIdx)` async: loop { pick best action from `getPlayable/getAttackers/endTurn` via `G.AI.evaluate(game, pIdx, action)` (1-ply simulation on `game.clone()` when cheap, heuristic otherwise, informed by `EnemyDef.style` and `G.Combos` dictionary); apply mistake rate; stop at endTurn }. Also runs loops via `game.runLoop`. Must respect: no finisher before forecast, never start loop without finisher, disrupt priorities (SPEC).
`G.Combos` (`js/ai/combos.js`): `[{ id, parts: [defId...], finisher: [defId...], lineage, note }]` used by AI and by 鏡の主 to read the player's deck.

## 9. File layout & load order (index.html must follow this order)
```
js/core/util.js        G.util (deepClone, uid, assert), G.RNG
js/core/events.js      G.Emitter
js/engine/defs.js      G.CardDB (register/get/all/pool filters), G.RelicDB, G.EnemyDB, G.EventDB (run events)
js/engine/fx.js        G.Fx helpers
js/engine/state.js     createGame, Player/Game factories, clone/serialize
js/engine/rules.js     costOf, legality, win checks, hand limit
js/engine/actions.js   ctx + all action methods (resources, damage, zones, counters, picks)
js/engine/play.js      playCard / cast / replay / attack / abilities / reserves / action recording
js/engine/turn.js      start/main/end, extra turns, timed tick, hazard & forecast state
js/engine/loop.js      loop detector + runLoop
js/engine/game.js      G.Engine facade (createGame, deserialize)
js/data/cards_accel.js … cards_cycle.js, cards_copy.js, cards_chain.js, cards_time.js, cards_doom.js, cards_generic.js, cards_boss.js, cards_ext.js (2026-11 additions)
js/data/relics.js      44 relics (+ boss/elite relics)
js/data/enemies.js     15 normal, 6 elite, 5 bosses (decks, hazard, style, field, relics, flavor)
js/data/events.js      16 run events
js/data/texts.js       diary fragments(30+), shop lines, graffiti, flavor pools
js/ai/chooser.js, js/ai/combos.js, js/ai/ai.js
js/run/packs.js, js/run/map.js, js/run/shop.js, js/run/run.js (run state machine), js/run/rewards.js
js/meta/save.js, js/meta/codex.js, js/meta/achievements.js, js/meta/depth.js, js/meta/festival.js
js/ui/dom.js (helpers), js/ui/cardview.js, js/ui/screens/title.js, menu.js, packopen.js, map.js, battle.js, shop.js, rest.js, event.js, reward.js, runend.js, codex.js, settings.js
js/ui/app.js           screen router, boot
js/main.js             entry
```

## 10. Testing
`tests/run.js` loads all logic files in order (not ui) and runs `tests/*.test.js`. Minimal assert framework in `tests/harness.js` (`test(name, async fn)`, `assert`, `eq`). Every card file ships with at least a smoke test that plays each card once in a synthetic game (`G.Test.sandbox()` helper in `tests/harness.js`: builds a game with given hands/boards for both players, AI choosers set to "first option"). A headless full-run simulation (`tests/sim_run.test.js`) plays whole runs with random AI vs AI to catch crashes.

## 11. Rules decisions not fully fixed in SPEC (binding)
- Player life 40. Enemy lives per SPEC. Deck ≥ 20 (run rule), battle has no deck size rule.
- First player: coin toss; first player skips draw on turn 1. Both get maxMana 1 on turn 1 (maxMana increments at each own turn start, so turn-1 start sets maxMana to 1).
- Attack: monsters can attack the turn after summon (or with `rush`); `guard` monsters must be attacked first; attacker deals atk to target, defender deals atk back simultaneously (monster vs monster); damage persists.
- Hand limit 6 enforced at end of turn only (choose 6 to keep).
- Phantom (幻影): copies of a monster with same atk/hp/keywords, `isPhantom=true`, vanish at end of turn, don't trigger `onSummon` (unless 女王), don't count toward board cap, cap 30; destroyed phantoms go nowhere (no grave) but DO fire `onMonsterDestroyed` events for things like 門番 (SPEC says 幻影を含む).
- 連鎖数 increments only on real plays (hand/grave reprise/vault?); copies/cast(free,copy) don't. Relic 永雷の宝珠 flips `statuses.copiesCountChain`.
- Curse limit default 20; 黒い蝋燭 relic → 15.
- Extra turn: a full normal turn (maxMana+1, draw). `streak` increments.
- Reserve spells apply during the *opponent's next turn* only; UI shows them face-down count to the opponent (AI sees only count).
- Boss "切り札" cards: `bossOnly: true`, never enter the player's deck/rewards; `steal` (簒奪の儀) allowed in-battle only.
- 時間逆行/巻き戻しの鐘: engine supports snapshots: `game.snapshot(tag)` / `game.restore(tag, {keepHandOf, keepGraveOf})` — snapshot at each turn start automatically (`game.turnSnapshots`, keep last 3).
- 歴史改変: implemented as undo of one logged action from previous turn where feasible: engine stores per-action pre-snapshots for the previous turn (`game.actionSnapshots`); card picks an action and restores that snapshot's delta for that card only (approximation: revert damage dealt by that card and remove monsters it summoned; document limits in card text).

## 12. Coding conventions
- Prefer small pure functions. No globals besides `G`. `'use strict'`.
- Every card/relic/enemy def is registered via `G.CardDB.register(def)` etc. Register in the data file; the engine must not import data.
- Keep card `text` exactly matching SPEC wording (players read it). If an implementation deviates from SPEC, note it in `docs/DEVIATIONS.md`.
- Log every effect with `ctx.log` in Japanese so the battle log is readable.
