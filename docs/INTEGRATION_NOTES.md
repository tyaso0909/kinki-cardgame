# Integration notes (collected from Phase 2 reports — for Phase 3/4 agents)

## Data helpers (js/data/_index.js → G.Data)
- `G.Data.idByName(name)`, `defByName`, `relicIdByName`, `cardsByLineage`, `poolForPacks()` (excludes bossOnly & rarity 'boss'), `tabooCards()`, `bossTrumps(n)`, `bossAuxCards(n)`, `relicsBy(kind)`, `validateAll()`.
- `G.Data.runEffectsOf(relicIds)` → merged flags: `shopDiscount:0.2, hazardEarly:true, revealEnemyHand:1, healAfterBattle:4, hideHazard:true, rewardChoices:-1, noRestHeal:true, mapFog:true`.
- **After every battle** the run must call `G.Data.restoreVault(game)` → `[playerDefIds, enemyDefIds]`; put `[0]` back into the player's deck (蒐集箱 / 盗人の手袋).
- Relics with activated abilities (無限の巾着, 原初の炉): `G.Data.relicAbilities(game, pIdx)` / `G.Data.useRelicAbility(game, pIdx, relicId, targetUids)` — battle UI and AI must surface these (not in `game.getAbilities`).
- Hidden relics: any relic with `hidden:true` / `category:'hidden'` (e.g. `_fx_accel_overdrive_endturn`) must never be shown in UI/codex/rewards. `enemyOnly:true` / `category:'enemy'` relics never go to the player.
- Engine emits `reveal` event `{who, viewer, zone:'hand'|'deck', uids, defIds}`; `statuses.handRevealed` (魔封じの猫) → battle UI should show the enemy hand face-up while set.

## Enemy defs (js/data/enemies.js → G.EnemyDB)
- Bosses carry `isBoss:true, kind:'boss'`; elites `kind:'elite'`; normals `kind:'normal'`.
- Battle UI reads: `name, kind, lineage, introText, teaches, lastWords, winText, diary, forecastText`.
- `G.AI.enemyPlayerConfig(enemyDef, {act, depth, playerDeckIds, prevRunDeckIds})` → player config for `G.Engine.createGame`.

## Battle screen (js/ui/screens/battle.js → G.ui.battle)
- `G.ui.battle.start({game, onEnd(result), enemyDef})`; `result = {won, winner, reason, turns, stats, game}`.
- Human is always player 0, enemy player 1.

## Cards
- `basic_01` 見習いの火球 (事故防止用). Boss aux cards: `rarity:'boss'`, tag `bossAux`, `bossOnly:false` (can be rewarded after the boss). Trumps: `bossOnly:true`.

## AI (js/ai/*)
- `G.AI.takeTurn(game, pIdx, {onStep})` awaits onStep after every action; `G.AI.checkEnrage(game, enemyIdx)` may be called by the UI after player actions. Events: `enrage {who,text}`, `theftCountdown`; `player.flags.turnsUntilTheft`; `inst.residual` (鏡の主 残り香 → dimmed border).
- Hidden relics `relic_boss1..5_enrage` (`hidden:true`).
- `G.Depth.modifiers(depth)` (battle side, consumed by AI) may return `{normalLifeMul, eliteLifeMul, bossLifeMul, mistakeMul, eliteRelics, bossExtraRelics, enrageThreshold}`.

## Phase 3/4 contract (binding)

### G.Save (owned by run agent, js/meta/save.js) — localStorage keys prefixed `kinki.`
```
G.Save.meta() → {
  depth, maxDepthCleared, runsStarted, runsCleared, lineageClears:{accel:n,...},
  codex:{cards:{defId:true}, relics:{id:true}, enemies:{id:true}, diary:{id:true}},
  achievements:{id:isoDate}, records:{maxDamageOneTurn, maxChain, longestLoop, maxDepth, lineageUse:{}, cardUse:{}},
  graffitiCard: defId|null, lastRunDeck:[defIds], unlockedPacks:['gold','dual','taboo'...], settings-free
}
G.Save.updateMeta(fn(meta) => void)   // mutate + persist
G.Save.saveRun(runState) / loadRun() / hasRun() / clearRun()
G.Save.settings.get()/set(patch)       // already consumed by G.ui.settings
G.Save.wipe()
G.Save.exportString() / importString(str)
```
### G.Meta hooks (owned by meta agent, js/meta/*) — run agent calls them if present
```
G.Meta.onRunStart({seed, packs, relic, depth, festival})
G.Meta.onCardObtained(defId) / onRelicObtained(relicId) / onDiaryFound(diaryId)
G.Meta.onBattleEnd(result, {enemyDef, act, run})   // result from G.ui.battle (stats: maxDamageOneTurn, maxChain, longestLoop, won, reason, mirrorBeatenBeforeReflect, ...)
G.Meta.onRunEnd({won, run})                        // depth unlock, records, pack unlocks, lastRunDeck, achievements
G.Depth.modifiers(depth), G.Depth.runModifiers(depth) → {normalLifeMul, eliteExtra:1, shopPriceMul:1.1, sellMul:0.9, packChoices:2, bossLifeMul, startCursedRelic:true, ...} (SPEC 深度 table)
G.Festival.today() → {id, seed, name, rules:{allCostZero, twoFields, startTaboo, doubleLife, allChaosPacks}} ; run accepts `festival` param and applies rules via game.options / statuses.
```
### Run state (owned by run agent) `G.Run` — screens in js/ui/screens/{packopen,map,shop,rest,event,reward,runend}.js
- `G.Run.startNew({depth, festival})`, `G.Run.resume()` → returns next screen name, `G.Run.state` (JSON: act, mapNodes, position, deck[defIds], relics, gold, life, maxLife, seed, rng state, flags, history, stats).
- Diary data: `G.Texts.diary` (owned by meta agent, js/data/texts.js) — `[{id, text, boss?:enemyId}]`, plus `G.Texts.shopLines`, `G.Texts.graffiti`, `G.Texts.loading`.

## Drag-to-play (js/ui/battle_drag.js)
- `G.ui.battleDrag.attach(frame, api)` → detach fn; battle.js builds the api (`dragApi()`), attaches in `build()`, detaches in `teardown()`.
- Hand card dragged up and dropped above the hand → normal play flow (`commitHandCard`: X / hidden-zone picks / multi-targets open their usual UI). Single visible-target cards aim with an arrow and play on the target they are dropped on. Own monsters (and phantom stacks) dragged onto an enemy monster / face → attack. Horizontal swipes on the hand scroll it (hand cards are `touch-action:none`; the module scrolls manually). Taps and long-press detail still work.
- Drags are accepted while the human's own animations are still playing (`S.draining`): the press fast-forwards them, the board is redrawn inside the same pointer dispatch, and battle_drag.js re-finds the live card / target elements by uid (`live()`, `refreshTargets()`). Before this, a 速攻 monster dragged right after its summon did nothing (or opened the detail by long-press).

## 一斉攻撃 (battle.js)
- Action-bar button 「一斉攻撃 ×N」 appears on the human's main phase when ≥1 monster (atk > 0) has `'face'` among its `getAttackers` targets (i.e. no enemy guard blocks the face). Tap → prompt with count and total damage (×attacksLeft) → 攻撃する runs `game.attack(0, uid, 'face')` one by one, re-reading `getAttackers` after each attack (so a guard summoned mid-volley, a win, or a 2回攻撃 monster are handled). Stops on win, when no face attacker remains, or when an attack makes no progress.

## Field card layout (cardview.js / cards.css)
- Field cards render **portrait (5:7)** like every other card everywhere (packs, hand, shop, rewards, codex, deck lists, detail). Identity: squarer corners, full-width horizon "vista" art band (fixed 2.2em, not shrunk by the text fitter), ▮ name marker.
- The old landscape banner is opt-in: `G.ui.renderCard(def, { wide: true })` → `.type-field.wide`. Grid "span 2" special cases for fields were removed. The battle's shared field slot is a chip (`.bt-field`), not a card.

## Hosting note (artifact wrapper)
- When published, the page is wrapped by a host skeleton whose `body` rule sets `color:#000; background:#fff; font:14px system`. `css/base.css` therefore sets color, font and background on **`body`** as well as `html` — never rely on inheritance from `html` alone. Test pages that reproduce the wrapper: scratchpad `qa/_hosted_test.html` + `qa/hosted_scan.js`.

## Sound effects (js/ui/sfx.js → G.ui.sfx)
- All sounds are synthesized with Web Audio (no audio files): `G.ui.sfx.play(name)`; 44 named sounds (`G.ui.sfx.names()`). AudioContext is created on the first pointerdown/keydown (browser autoplay rules).
- Battle: `battle.js` `drain()` calls `G.ui.sfx.battle(type, payload, game)` for every queued event, so sounds stay in sync with animations (card type → summon/spell/crest/field, damage size → hit/hitFace/bigHit, chain ticks rising in pitch + 10/50 milestones, forecast drone, hazard heartbeat, loop/overflow, enrage, win/lose).
- App-wide: soft tap on any button; `ui.modal`/`ui.confirm` open sound; warning toasts → deny; `G.Shop` purchases/sells and reward gold → coins; `G.Run.addRelic` → relic; rest heal/remove. Pack reveals by rarity (packopen.js), run end win/lose (runend.js).
- Settings: `sound` (default on) and `soundVol` (0.3 / 0.6 / 1). The old placeholder key `sfx` is ignored.
- Unlock / recovery: phones only grant audio on a tap's pointerup / touchend / click (a touch pointerdown doesn't count), and iOS suspends ("interrupted") the context on screen lock, calls or app switches. sfx.js resumes on every gesture (any non-running state), starts a 1-sample silent buffer inside the gesture (iOS), retries on returning to the tab, and replaces a context that stays stuck. Live voices are counted with a 5 s cap so a missing `ended` event can never mute everything.

## Hand scrolling & card preview (battle.js / battle_drag.js / battle.css)
- The hand keeps its scroll position across redraws (`swap()` copies `scrollLeft`); it used to jump back to the first card after every action.
- Swipes follow the finger, then glide with the release speed and settle with a card edge at the left (`G.ui.battleDrag.glideTo / pageHand / snapPos`). CSS scroll-snap is off (it fought the manual scrolling). The hand can be swiped at any time, also on the enemy's turn. Mouse wheel over the hand scrolls it sideways (PC).
- `.bt-handnav` (same grid area as the hand): ‹ › page buttons + edge fades when more cards are off-screen that way, and a bar with 「手札 N枚」 and a thumb showing the visible part.
- Tapping a hand card shows `.bt-peek`: the card at large size (full text) above the hand / my strip, with the reason when it can't be played. The prompt bar keeps the buttons; tapping the preview closes it. It is removed by `clearMode()` (drags, target modes, etc.).

## 2026-11 additions: keywords, 45 cards, stat auras (cards_ext.js)
- Keywords (ids → JP): `ward` 加護 (opponent effects can't choose it: `Game.isWardedFrom(inst, actorIdx)` filters `ctx.candidatesFor` and play-time targets; global "all" effects still apply), `untouchable` 不可侵 (left out of `attackTargetsFor`, never a guard), `double` 連撃 (`Game.attacksPerTurn(inst)` = 2, used at summon and turn start), `pierce` 貫通 (attack that destroys a monster sends `atk − hpBefore` to its owner). UI: `G.ui.KEYWORDS` (chips + card-detail glossary), board badges `.bt-kwb`.
- New statuses (sum): `handLimitDelta`, `monsterAtkDelta`, `atkPerHandCard`, `curseShrink` (side 'enemy': −1/−1 per 5 curse). `def.effects.dynamicStats(game, inst)` adds to atk/hp (マナの巨人; `def.xStats` makes cards show X/X off the board). All folded in by `Game.statAura`.
- `Game.sweepDead()` destroys monsters at HP ≤ 0 after every action, at turn end (buff expiry) and after turn-start triggers.
- Max mana has no cap (by design).
- 突進 `charge`: on its summon turn (without 速攻) a monster may attack monsters only — `Game.attackTargetsOf(pIdx, inst)` (used by getAttackers, attack(), loop replay); `canAttackWith` is false when no enemy monster can be attacked.
- 朧 (oboro): `ctx.createOboro(defId, who, 'deck'|'deckTop'|'hand', {costMod})` makes a normal card (not isCopy: it goes to the grave etc.) flagged `inst.oboro`; `G.Data.restoreVault` skips it, so it never reaches the run deck. UI: `.card.oboro` (朧 mark, hazy), board badge, card-detail term (`G.ui.TERMS`).

## Dragons (cards_dragon.js, 26 cards; `def.set = 'dragon'`)
- 竜 = `tags: ['dragon']` → 竜 chip + card-detail term. `Game.isDragon(inst)`.
- Effective keywords: `Game.keywordsOf(inst)` / `hasKeyword` merge printed keywords, this-turn keywords (`inst.flags.tempKw` set by `ctx.addKeywordsThisTurn`, removed at that turn's end) and granted ones (`dragonWard` 竜の盟約, `phantomRush` 禁忌の万華竜). Ward/double checks go through hasKeyword.
- `def.effects.attackCondition(game, inst)` gates canAttackWith (封じられし古竜).
- 禁忌の竜: `def.uncastable` (canPlayCard → 'uncastable', cost shown ∞; free-summon effects skip them) and `effects.handAbility` — `getAbilities`/`useAbility` include hand cards. The ability picks 4 same-lineage monsters with `ignoreWard: true` (either side, phantoms count), destroys them and summons a 朧 copy. UI: hand card glows with a 効果 badge; tapping it offers the ability in the prompt bar. Text uses the term 禁忌召喚（〇〇4体） explained in G.ui.TERMS.

## Enemy decks: new cards, dragon elites, deck-out fix (2026-11)
- Normal enemies used to lose by decking themselves (15 cards + many draw/mill cards; ~65% of simulated normal fights ended that way). Now: act 1 normals 15 cards (見張りの石像 20), act 2–3 normals 20 (名もなき挑戦者 builds 20), and fewer draw/mill cards (水鏡の占い, 未来の手紙, 知識の泉水, 血の契約, 沈む書庫…).
- AI (`js/ai/ai.js`): `evaluate` treats an empty own deck as almost a loss (−400; −90 at 1 card, −35 at 2). Unsimulated picks (sim budget spent) are verified and refused when worse than ending the turn. Deliberate mistakes never pick an option 100+ worse than the best. `handleLoop` caps a loop that draws so one card stays in the deck.
- Three dragon elites (one per act): 竜笛の巫女 (act 1, 38), 鏡鱗の竜騎士 (act 2, 78), 古竜の墓守 (act 3, 125). Trumps 竜笛 / 竜騎士の号令 / 竜墓の鐘 (cards_boss.js, elite7–9), enemy relics 竜笛の首飾り / 竜騎士の兜 / 竜骨の数珠, combos elite_flute / elite_dragoon / elite_tomb.
- Enemies never use 禁忌 (taboo/uncastable) cards nor 不可侵の巨神・終末の獣・縮小の呪文・巨人化の秘薬・竜狩りの大弩・重力の谷 (tests/enemy_dragon.test.js).
- 2026-11: the run's first pack choice never offers 妨害パック (`G.Packs.offer` option `exclude`); it can appear from the 2nd pick on.
- 2026-11: 火種の子竜 gains +X/+X where X = its own cost (printed 0 + costMod), via dynamicStats; the battle hand shows real stats for dynamicStats monsters.

## 願いの魔神 (2026-11)
- gen_46 願いの魔神: generic legend monster, 3 mana 1/1. On summon it offers 3 cards (from different categories) and adds the picked one to hand as 朧. Inspired by Hearthstone's Zephrys the Great, without the no-duplicates condition.
- Logic in `js/ai/wish.js` (`G.Wish.offers(game, pIdx)`, `G.Wish.POOLS`). Categories: リーサル / 単体除去 / 一掃 / 回復 / 守り / 手札補充, each with a hand-picked pool. Every candidate is tried on a private clone with the AI simulator (`AI.simulate`, now exported) using AI choosers on both sides (the real players' choosers must never be called); リーサル only when the card plus face attacks actually wins this turn; 守り reads the opponent's threats (keys, timed cards, loops, extra turns, chain, crests, board damage). Clones made by `AI.simulate` and the wish carry `_sim = true`, where the wish takes a cheap fixed answer (no nested searches).
- UI: `ctx.choose` options that carry `card` render as cards with a category caption (`.bt-pickcap`).

## 回復カード: 吸命 / 血吸いの騎士 / 再生の秘術 (2026-11)
- New keyword `lifesteal` (吸命): in `P.damage`, damage whose `source` is a card with that keyword heals the source's owner by the amount dealt (overkill included, capped at max life). Covers attacks, counter-damage, 貫通 and the monster's own effect damage. Listed in `ui.KEYWORDS`; board badge `.kwb-lifesteal`.
- gen_47 血吸いの騎士 (generic rare, 3 mana 3/3, 吸命). gen_48 再生の秘術 (generic rare spell, 3 mana: heal floor(lost life / 2)); added to the 願いの魔神 回復 pool.

## Draw loops (2026-11)
- `stateHash(relaxed)`: with `relaxed`, the active player's hand contents and deck size are ignored. `loopAfterAction` checks the strict hash first, then the relaxed one; a match on the relaxed hash with identical action cycles is a draw loop (`loop.detected.relaxed = true`), e.g. 終わりなき頁＋火種 or 永劫の書＋火種. Playing several copies from hand is still not a loop (the grave grows).
- `runLoop` on a relaxed loop measures the cards drawn per pass and stops (reason `deck`) before a pass would draw from an empty deck. The UI offer says 「同じ手順が繰り返されている」 and the end banner 「山札が尽きる前に止めた」.

## 一斉攻撃 with extra attacks (2026-11 QA fix)
- `Game.prototype.attacksRemaining(inst)`: attacksLeft plus the one extra attack 一瞬の永遠 (`attackTwice`) grants after the next attack. The 一斉攻撃 preview counts swings with it.
- `onAllOut` treated "attacksLeft unchanged after an attack" as no progress and stopped; under 一瞬の永遠 the attack is given back once, so the volley halted after the first swing. Progress is now "the attack was recorded" (`turnActions` grew).
