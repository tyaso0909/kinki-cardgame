# エンジン利用ガイド（カード作者向け）

`js/engine/` はDOM非依存の戦闘エンジンです。カード・遺物・敵のデータは `js/data/*.js` に
`G.CardDB.register(def)` / `G.RelicDB.register(def)` / `G.EnemyDB.register(def)` で登録します。
エンジンはデータを import しません。フックは定義の `effects` に書き、実行時に `defId` から引かれます
（状態はすべてJSONなので、クロージャは `effects` の中だけに置くこと）。

テスト: `node tests/run.js`（`tests/*.test.js` を全部実行。`G.Test.sandbox()` で盤面を作れる）。

## フックの基本

- すべてのフックは `(ctx, ev)` を受け取り、`async` でよい（エンジンは必ず `await` する）。
- 状態の変更は **必ず `ctx` のメソッド経由** で行う（`ctx.gainMana`, `ctx.draw`, `ctx.damage`, `ctx.destroy`,
  `ctx.summon`, `ctx.createPhantom`, `ctx.addCurse`, `ctx.addSeal`, `ctx.extraTurn`, `ctx.addTimed` …）。
  直接 `player.mana += 1` と書くと `onManaGained` などが発火しない。
- `ctx.me` / `ctx.opp`：効果の主体と相手。全反転の大鏡（`statuses.invertEffects`）の下では自動で入れ替わる。
  共有フィールド（`scope:'any'`）やパッシブ発火時は「イベントの持ち主」が `ctx.me` になる。カード自身の持ち主は `ctx.owner`。
- `ctx.card`：解決中のカード（CardInst）。`ctx.targets`：UI/AIが選んだ対象（`def.targets` で宣言）。
  追加で選ばせたいときは `await ctx.pick({kind, side, count, filter, prompt})`（結果は CardInst[]）、
  選択肢なら `await ctx.choose([{id,label}], {prompt})`。
- ログは `ctx.log('日本語で')`。
- 簡単な効果は `G.Fx` のヘルパーで組む：`Fx.seq(Fx.gainMana(1), Fx.draw(1))`、`Fx.when(Fx.chainAtLeast(3), Fx.gainMana(2))`、
  `Fx.dmgOpp(Fx.chain(3))` など。数値引数には `(ctx)=>number` も渡せる。

### 自分自身のフック（§4.1）
`onPlay`（魔法）、`onSummon`/`onDeath`/`onLeave`（モンスター）、`onPlace`（紋章・フィールド、置いた側のみ）、
`onTimed`（時限0で発動）、`onAttack(ctx, target)`、`onDamaged(ctx, n)`、`canPlay(ctx)→bool`、`costMod(ctx)→delta`。

### 常在・トリガー（§4.2）：場・紋章・フィールドにある間、遺物は常に
`onCardPlayed, onSpellPlayed, onManaGained, onDraw, onTurnStart, onTurnEnd, onMonsterDestroyed, onMonsterSummoned,
onPhantomCreated, onSpellToGrave, onDamageDealt, onReturnedToHand, onLifeLost, onExtraTurn, onExtraTurnStart, onCurseAdded,
onLoopIteration, onChainReached, onSealAdded, onTimedSet, onTimedFired, onDiscard, onHandEmpty, onBattleStart, onLethal`
修正フック（値を返す）: `modCost(ctx,{card,who,cost})`, `modManaGain`, `modChain`, `modDamage`, `modDrawCount`。
`effects.scope = 'any'` で両者のイベントに反応（デフォルトは持ち主のみ）。

### ステータス付与（常在のON/OFF系）
`effects.grants = [{ key:'spellMultiplier', value:2, side:'ally'|'enemy'|'any', when?(ctx, player) }]`
を書くと、場にある間だけ `game.status(player, key)` に合成される（除去すれば自動で消える）。
一時的なものは `ctx.setStatus(who, key, value, { untilEndOfTurnOf: 'thisTurn' | 'opponentNext' | pIdx, turns })`。
エンジンが解釈するキー: ARCHITECTURE §3 のリスト＋ `gravePlayable, allCostsZero, costDelta, spellCostDelta, handLimit,
chainAtTurnStart, copiesCountChain, attackTwice, timedFrozen, timedReturnOnce, reserveLasts, sealsProtected, sealWildBonus,
phantomHpBonus, damageTakenDelta, maxManaGainDelta, initialHandDelta, turnsSkipped, firstSpellStolenBy`。

### 起動型能力（焚べ火の祭壇など）
`effects.ability = { label, oncePerTurn, canUse(ctx), targets: TargetSpec|null, use(ctx) }`。
UI/AIは `game.getAbilities(pIdx)` → `game.useAbility(pIdx, uid, targetUids)`。

### 予約魔法
`reserve: true` にし、`reserveHooks` に常在フック／`grants`／`onActivate(ctx, {who})`（相手ターン開始時）／`onExpire` を書く。
相手の次のターンの間だけ有効。`ctx.me` は相手（効果を受ける側）。

### 時限
`timed: N`。時限ゾーンに置かれ、持ち主のターン開始時に -1、0で `onTimed`。モンスターで `onTimed` が無ければそのまま場に出る。
禁忌の預言書のように紋章に `timed` を付けると紋章ゾーンのままカウントし、`effects.fixedTimer:true` で操作不能、
`indestructible:true` で除去不能。

### その他の宣言
`reprise: cost`（墓地から使用→使用後除外）、`key: 1..5|'wild'`（鍵。`onPlay` 冒頭で `Fx.seal()`）、
`effects.returnsToHand / returnsToDeckTop`（使用後の行き先）、`effects.phantomDeathEffects`（幻影でも破壊時発動）。

## 例

```js
(function (G) {
  'use strict';
  const Fx = G.Fx;

  // 1) 魔法：火種（マナ+1、1枚引く）
  G.CardDB.register({
    id: 'accel_06', name: '火種', type: 'spell', lineage: 'accel', role: 'fuel', rarity: 'common', cost: 0,
    text: 'マナ+1。カードを1枚引く',
    effects: { onPlay: Fx.seq(Fx.gainMana(1), Fx.draw(1)) }
  });

  // 2) モンスター：召喚時・破壊時・場を離れたとき
  G.CardDB.register({
    id: 'accel_02', name: 'マナ喰いの小妖精', type: 'monster', lineage: 'accel', role: 'fuel', rarity: 'common',
    cost: 1, atk: 1, hp: 1, text: '1/1。召喚時、マナ+2。破壊時、マナ+2',
    effects: {
      onSummon: Fx.gainMana(2),
      onDeath: async function (ctx) {           // 手書きの例（Fx.gainMana(2) と同じ）
        await ctx.gainMana(2);
        ctx.log('小妖精の最期の輝き');
      }
      // onLeave: async (ctx) => { await ctx.returnToHand(ctx.card); }   // 巡る不死鳥ならこれ
    }
  });

  // 3) 紋章：常在フック（マナを得るたび、さらに+1）
  G.CardDB.register({
    id: 'accel_19', name: '暴走する炉心', type: 'crest', lineage: 'accel', role: 'engine', rarity: 'rare', cost: 3,
    text: 'マナを得るたび、さらにマナ+1',
    effects: { onManaGained: Fx.gainMana(1) }   // 再帰はエンジン側で止まる（連鎖は1段）
    // 常在のON/OFF系なら: effects: { grants: [{ key: 'spellMultiplier', value: 2 }] }
  });

  // 4) 予約魔法：相手の次のターン中、相手が得るマナは半分
  G.CardDB.register({
    id: 'accel_11', name: 'マナ封鎖', type: 'spell', lineage: 'accel', role: 'disrupt', rarity: 'common', cost: 2,
    reserve: true, text: '相手の次のターン中、相手が得るマナは半分になる',
    effects: {},
    reserveHooks: {
      grants: [{ key: 'manaGainHalved', value: true }],          // side 省略 = 効果を受ける側（相手）
      // onActivate: async (ctx, ev) => { await ctx.discard(2, ctx.me); }   // ターン開始時に1回だけ動く型
    }
  });

  // 5) 時限魔法：時限2で10ダメージ
  G.CardDB.register({
    id: 'time_07', name: '時限爆弾', type: 'spell', lineage: 'time', role: 'finisher', rarity: 'common', cost: 1,
    timed: 2, text: '時限2：相手に10ダメージを与える',
    effects: { onTimed: Fx.dmgOpp(10) }
  });

  // 対象を取る魔法は targets を宣言し、効果は ctx.targets[0] を使う
  G.CardDB.register({
    id: 'generic_04', name: '消滅の光', type: 'spell', lineage: 'generic', role: 'disrupt', rarity: 'common', cost: 2,
    text: 'モンスター1体を除外する', targets: Fx.T.anyMonster,
    effects: { onPlay: Fx.exileTarget() }
  });

  // 遺物も同じフック名（永続・除去不能の紋章として扱われる）＋ onBattleStart
  G.RelicDB.register({
    id: 'relic_ember', name: '燃える種火', category: 'starter', lineage: 'accel', text: '戦闘開始時、マナ+1',
    effects: { onBattleStart: async function (ctx) { await ctx.gainMaxMana(1); } }
  });
})(globalThis.G = globalThis.G || {});
```

## よく使う ctx メソッド早見

| 分類 | メソッド |
| --- | --- |
| 資源 | `gainMana(n, who)`, `loseMana`, `setMana`, `gainMaxMana`, `draw(n, who)`, `discard(cards|n, who)`, `mill`, `tutor(pred, who, {from, random})`, `lookTop`, `putOnTop`, `putOnBottom`, `shuffleDeck`, `shuffleGraveIntoDeck`, `shuffleHandIntoDeck` |
| ダメージ | `damage(target, n, {source})`, `heal(who, n)`, `loseLife(who, n)`, `setLife` |
| ゾーン | `summon(inst|defId, who, {asPhantom, persistent, triggerSummon})`, `createPhantom(of, who, {count, keywords, persistent})`, `destroy`, `vanishPhantom`, `exile`, `returnToHand`, `toGrave`, `bounceToDeckTop/Bottom`, `placeCrest`, `removeCrest(inst,{force})`, `setField`, `destroyField`, `reviveFromGrave`, `steal`, `vaultSteal`, `addToHand(defId|inst, who, {isCopy})`, `addSeal`, `removeSeal` |
| カウンター | `addCurse`, `removeCurse`, `moveCurse`, `setChain`, `addChain`, `extraTurn`, `skipTurn`, `addTimed(inst, who, n)`, `tickTimed`, `adjustTimed(cards, delta)`, `fireTimed`, `buff(inst,{atk,hp,until:'endOfTurn'})`, `addKeyword` |
| 詠唱 | `cast(defId|inst, who, {copy, times, targets, choices})`（コピーは連鎖数に数えない）, `replay(inst)` |
| 情報 | `isMyTurn()`, `turn()`, `defOf`, `nameOf`, `countZone(who, zone, pred)`, `monstersOf`, `chainOf`, `atkOf`, `hpOf`, `status(who,key)`, `specialWin(who, reason)` |
| 選択 | `pick(spec)`, `choose(options, {prompt})`, `candidatesFor(spec)` |
| ゲーム | `ctx.game.snapshot(tag)` / `restore(tag|state, {keepHandOf, keepGraveOf})`, `turnSnapshotOf(pIdx, k)`, `prevTurnActions`, `hazard(pIdx)` |
