# DEVIATIONS — 実装が ARCHITECTURE / SPEC と異なる点

各担当は、仕様どおりに実装できなかった点・解釈を決めた点をここに追記する。

## エンジン（js/engine）

1. **ファイル分割**：`actions.js` が大きくなったため、カード使用・攻撃・起動型能力・予約魔法・行動記録を
   `js/engine/play.js` に分けた。ARCHITECTURE §9 の読み込み順に `play.js`（actions.js の直後）を追加済み。
2. **`statuses` の形**：ARCHITECTURE §3 のとおり明示的ステータスは `player.statuses[key] = {value, until, sourceUid}` だが、
   常在カードが与える値（鏡の湖の `spellMultiplier` など）は `effects.grants` として宣言し、`game.status(who, key)` が
   明示値と合成して返す（場を離れれば自動で消えるため、除去時の後始末が不要）。`until` は
   `{player, turnsLeft}`（そのプレイヤーのターン終了時に減る）。
3. **予約魔法のカードの置き場**：有効中のカードは通常ゾーンに存在せず `zone:'reserve'` で `ReserveEffect.card` に保持される
   （墓地に置くと再演などで拾えてしまうため）。期限切れで持ち主の墓地へ。UIは `opp.reserves.length` を伏せ札として表示する。
4. **時限付き紋章（終末の預言書）**：ARCHITECTURE は「時限魔法は時限ゾーン」だが、預言書は「除去されない紋章」でもあるため、
   紋章ゾーンに置いたまま `timedCount` を持ち、持ち主のターン開始時にカウントする実装にした。`effects.fixedTimer` で
   カウント操作（`ctx.adjustTimed`）を無効化。
5. **幻影の消滅**：ターン終了時の消滅と「霧払いの風」は `ctx.vanishPhantom`（墓地へ行かず、`onMonsterDestroyed` も出ない）。
   破壊（`ctx.destroy`）された幻影は SPEC どおり `onMonsterDestroyed` を発火する。
6. **ループ検出のハッシュ**：ARCHITECTURE §6 は life/mana/chain などを含むが、ループは1周ごとに資源が増えるのが目的なので
   「構造ハッシュ」（手札/場/紋章の defId、各ゾーン枚数、時限カウント、フィールド）で検出する。
   さらに2回の繰り返し間で**同じ行動列**であることを要求し、誤検出を避ける。資源を含む `game.fullHash()` も用意。
   追加ターンのループは「同一プレイヤーの連続ターンで同じ行動列」を `endTurn` 時に検出（`kind:'turn'`）。
7. **行動記述子**：`{type:'play', defId, from, choices, targetDefs:[{defId}|'face']}` /
   `{type:'attack', attackerDefId, target:'face'|{defId}}` / `{type:'ability', defId, targets}` / `{type:'endTurn'}`。
   `choices.targets`（uid）は記録時に `targetDefs` へ変換され、再生時に defId から現在の uid を引き直す。
   対象が消えていれば再生は不正手となりループは止まる。
8. **両者同時敗北**：行動したプレイヤー（active）が原因とみなし、非アクティブ側の勝ちにする。
9. **コイントス**：`options.firstPlayer` で固定可能（テスト・イベント「時の止まった部屋」用）。
10. **戦闘開始時の遺物**：`RelicDef.effects.onBattleStart(ctx)` は `trigger('onBattleStart')` 経由で発火する
    （先攻側から）。カード側にも `onBattleStart` を書ける（サンドボックスで事前配置した紋章など）。
11. **歴史改変**：`game.prevTurnActionSnapshots`（前ターンの各行動直前スナップショット）を保持するのみ。
    「そのカード1枚だけを無かったことにする」差分適用はカード側で実装する（ARCHITECTURE §11 の近似どおり）。
12. **予告の自動取り消し**：`updateForecastState` は相手の行動後・ターン終了後に危険度を再計算し、予告側の危険度が
    100未満になったら `forecastCancelled` を出す。予告を出す判断自体はAI（`game.setForecast`）。
13. **`ctx.cast` の墓地からの使用**：墓地のカードを `cast` すると、使用後は SPEC（巻き戻しの泉）どおり除外される
    （`exileAfter:false` で抑止可）。
14. **X コスト**：`choices.x` 未指定で `playCard` すると X = 現在のマナ全部（UI/AIは明示推奨）。
15. **手札上限**：`statuses.handLimit` で変更可能（デフォルト6）。

## Cards A（加速・循環・複製 — js/data/cards_accel.js, cards_cycle.js, cards_copy.js, cards_basic.js）

1. **夜明けの暴走炉（accel_07）**：「ターン終了時、手札をすべて捨てる」はエンジンに遅延トリガーが無いため、
   使用時に隠し遺物 `_fx_accel_overdrive_endturn`（`category:'hidden'`, `hidden:true`）を一時的に `player.relics` に加え、
   その `onTurnEnd` で手札を捨てて自分を外す実装。同ターンに2枚使っても捨てるのは1回。UI/図鑑は `hidden` な遺物を表示しないこと。
2. **暴走する炉心（accel_19）**：「マナを得るたび、さらにマナ+1」を SPEC のコンボ例（暴走炉の+3が+6になる）に合わせ
   「得たマナ1につき+1（＝得た量と同じだけ追加）」と解釈。文字どおりの +1 固定ではない。テキストは SPEC のまま。
3. **竜の卵（accel_05）**：「手札の竜のコスト-3」は `CardInst.costMod` に恒久的に書く（手札にある竜のみ。その後引いた竜には効かない）。
   「竜」= `tags` に `'dragon'`（火喰い竜・焔帝竜・流転の水竜…）。
4. **魔力を啜る蝙蝠（accel_04）**：相手の使用回数を `counters.stored` に溜め、自分のターン開始時（`onTurnStart`）に `gainMana` で付与。
   コピー（`isCopy`）の使用は数えない。炉心・火山などの「マナを得るたび」は開始時の付与にも反応する。
5. **燃え尽き（accel_08）**：`targets` で手札を選ぶ（自分自身は除外）。X コストのカードを捨てた場合は 0 マナ。
6. **炎翼の伝令（accel_15）**：踏み倒したモンスターの召喚時効果も発動する（コストを払わない召喚なので無限回廊などの倍化も適用）。
7. **写本の精霊（cycle_04）**：「好きな順番で戻す」は「一番上に置くカードを選ぶ」を残り1枚まで繰り返す形。デフォルト選択なら順番そのまま。
8. **忘却の波（cycle_10）**：選ぶのは効果を受ける相手（`chooser: 相手`）。AI は chooser に従う。手札が1枚なら1枚だけ戻す。
9. **巻き戻しの泉（cycle_16）**：予約魔法は対象外（予約を墓地から無料で仕掛けると挙動が曖昧なため）。使った魔法は除外（エンジン仕様13）。
10. **終わりなき頁（cycle_25）**：`statuses.gravePlayable`。墓地から使った魔法は再演と違って除外されず、通常どおり墓地に戻る
    （SPEC「手札と同じように使える」の解釈。これにより墓地の魔法1枚で無限ループが成立する＝禁忌の挙動として許容）。
11. **多重詠唱（copy_07）**：「直前に使った魔法」は当ターンの行動記録（`game.turnActions`）から多重詠唱自身を除いた直近の魔法。
    記録された `targetDefs` を現在の盤面に引き直して `ctx.replay`。予約魔法は発動し直せない。
12. **盗み見の鏡（copy_10）**：「相手が最後に使った魔法」は `game.prevTurnActions`（相手の前ターン）→ `opp.lastSpellDefId` → 相手墓地の最新魔法 の順で探す。
    対象持ちの魔法は記録の対象を引き直し、無ければ自分が選ぶ。予約魔法のコピーは **自分の予約として相手に仕掛ける**（`game.setReserve`）。
13. **偽りの約束（copy_11）**：エンジンの `statuses.firstSpellStolenBy`（play.js で対応済み）を相手ターン開始時（`onActivate`）に
    その相手ターン終了まで設定。奪った魔法は `actAs` でこちらの効果として解決され、カード自体は相手の墓地へ。
14. **盗まれた奇跡（copy_24）**：相手墓地の魔法を1枚ずつ「次に使う魔法を選ぶ」で順番決め（デフォルト＝墓地の並び順）。
    鏡合わせを避けるため相手墓地の《盗まれた奇跡》自身はコピーしない。対象持ちはこちらが選ぶ。予約魔法はこちらの予約になる。
15. **万象を映す魔神（copy_23）**：召喚時に `atk/hp/maxHp` を直接「数×3」に設定（自身を含めて数える）。バフとしてではなく基礎値を書き換える。
16. **分裂する粘体（copy_16）**：`effects.phantomDeathEffects: true` で幻影も破壊時に分裂。幻影は ctx.destroy（祭壇など）でのみ分裂し、
    ターン終了時の消滅（vanish）では分裂しない。
17. **複写の大魔典（copy_22）**：加えるコピーは `isCopy:true`（使用後は墓地に行かず消える。永劫の書でも手札に戻らない）。
    墓地に魔法が無くても自身のコピーは加える。
18. **永劫ループの検出について**：永劫の書＋火種は1周ごとに手札が1枚増えるため、構造ハッシュのループ検出（エンジン仕様6）には
    かからない（状態が循環していないので正しい）。検出されるのは永劫の書＋魔力奔流など手札構成が変わらない形。
19. **フレーバー**：SPEC 指定の2枚に加え、各系統 5〜7 枚に1行のフレーバーを追加（SPEC の方針どおり固有名詞なし）。

## Cards B（連鎖・時間・終焉 — js/data/cards_chain.js, cards_time.js, cards_doom.js）

1. **帯電の騎士（chain_03）**：「このターン、連鎖数1につき攻撃力+1」は召喚ターンのみ有効。召喚時と以後カードを使うたびに
   バフを連鎖数（修正込み `chainOf`）に追従させ、ターン終了時に消える。
2. **雷紋の印（chain_12）**：「5枚目に使ったカードの効果2回」は魔法（`nextSpellTimes`）とモンスター召喚時（`nextSummonTimes`）に
   適用。紋章・フィールド・予約・時限魔法は対象外（2回「置く」意味がないため）。嵐の写し身と重なった場合は大きい方を採用。
3. **雷鳴の大鷲（chain_14）**：ダメージを与える相手モンスターは持ち主が選ぶ（AIはチューザー）。相手の場が空なら何もしない。
4. **閃光の双刃（chain_16）**：「連鎖数が5以上なら2回攻撃」＝ `attacksLeft` を1ターンに1回だけ+1。召喚時・連鎖数到達時・
   自分のターン開始時に判定（5以上なら以後のターンも2回攻撃できる）。
5. **嵐の写し身（chain_21）**：回数は使用時点の連鎖数（0なら1回）。コピー回数は連鎖数に数えない（エンジン仕様どおり）。
6. **終わらぬ雷雲（chain_23）**：選択はチューザー経由（デフォルトは「マナ+1」）。相手ターンのカード使用には反応しない。
7. **避雷針／雷雲の封印**：それぞれ `grants: chainMultiplier 0.5` ／ `extraCostAfterN {after:5, delta:3}`（エンジンの既存キー）。
8. **未来視の梟（time_03）**：「召喚時、時限1」はこのカードのコピー（`isCopy`）を時限ゾーンに置き、0で2枚引く。本体は場に残る。
   コピーは発動後に消える（墓地に行かない）。
9. **時の前借り（time_06）**：次ターンの最大マナ-2 は `player.flags.nextMaxManaDelta` でエンジンのターン開始処理に渡す（累積可）。
10. **小さな巻き戻し（time_13）**：戻すのは「このターンに破壊されて今も墓地にあるモンスター」。召喚時効果は再発動しない
    （「場に戻す」であって召喚ではないと解釈）。除外されたものは戻らない。
11. **刻を統べる竜（time_15）**：時限ゾーンのカードのみ即発動。預言書など「紋章ゾーンの時限」は対象外（SPEC「除去もカウント操作も
    できない」に合わせた）。
12. **巻き戻しの鐘（time_17）**：`game.turnSnapshotOf(me,0)` を `restore(..., {keepHandOf})` で復元。手札以外（墓地・場・マナ・ライフ・
    相手の状態）はターン開始時に戻る。復元後も「1ターンに1回」を保つため鐘自身の `abilityUsedTurn` を復元後に再設定。
13. **時渡りの剣士（time_19）**：「追加ターン中」＝ `game.streak > 1`（相手ターンスキップによる連続ターンも含む）。
14. **歴史改変（time_20）**：近似実装。相手の前ターンの `play` 行動を1つ選び、`prevTurnActionSnapshots` の前後差分から
    (a) 自分のライフ減少を回復、(b) 自分に置かれた呪詛を除去、(c) その行動で相手の場に増えたモンスター／幻影のうち今も場に
    いるものを除外（幻影は消滅）、(d) 自分のモンスターが受けたダメージを戻す。マナ・ドロー・墓地移動・紋章・フィールドは
    戻さない。相手の最後の行動の「後」状態は自分のターン開始スナップショットで代用。
15. **時の王冠（time_21）**：判定は `playedThisTurn.length ≥ 5`（本物のカード使用のみ。コピーは数えない）。
16. **時の果て（time_23）**：相手に `enemyDefId` があり `EnemyDB` の定義に `isBoss:true` または `kind:'boss'` があれば
    「ライフを半分（切り上げ、最低1）」。それ以外は1にする。ライフが既に1以下なら変えない。
17. **時間逆行（time_24）**：`turnSnapshotOf(me,1)`（2ターン前の自分のターン開始時）がなければ `turnSnapshotOf(me,0)`。
    手札と墓地は `keepHandOf/keepGraveOf` で現状維持。復元後、過去の状態に残る自分自身の「残像」を消し、本体を除外する。
    巻き戻しは4ターン目以降でないと「2ターン前」が存在しないため、1ターン目は現ターン開始時に戻るだけ。
18. **止まった世界（time_25）**：`grants: turnsSkipped (side:'enemy')`。相手のターンは `endTurn` でスキップされ、自分の連続ターン
    として扱われる（`streak` が増える＝「追加ターン」扱いなので時渡りの剣士や魔女が反応する）。
19. **呪いを運ぶ鴉（doom_02）**：`scope:'any'` の `onSpellPlayed` で相手の魔法のみ反応。コピー発動も数える。
20. **蘇りし不死の王（doom_15）**：「ライフを5失えば」は選択（チューザー、デフォルトは「戻す」）。ライフが5以下なら選べない。
    戻るときの召喚時効果はなし（本人に召喚時効果はない）。
21. **屍山の巨人（doom_17）**：印刷は 0/0、召喚時に X=墓地のモンスター×2 で固定。X=0 なら即破壊。`cost:'X'` ではなく
    通常コスト6。
22. **死者の国（doom_19）**：破壊された（幻影・コピーでない）モンスターの uid を持ち主の `flags.deadLandQueue` に積み、
    その持ち主のターン開始時に墓地に残っていれば場に戻す（召喚時効果なし）。フィールドが上書きされると待機列は消える。
23. **封印の解放者（doom_22）**：`grants: sealWildBonus 1`（封印ゾーンに1枚以上あるときだけ）。「既にある鍵1枚を別種扱い」の
    代わりに「種類数+1（上限5）」で実装。召喚時に勝利判定を即時に行う。
24. **終末の鍵・第五（doom_21）**：山札から選んだ鍵は `ctx.cast`（本物のカード、コスト0）→ 連鎖数+1・`playedThisTurn` に入る。
25. **終末の預言書（doom_25）**：エンジン仕様4のとおり紋章ゾーンで時限カウント。`fixedTimer`＋`indestructible`＋禁忌。
    追加ターン（自分のターン開始）ごとにカウントが進むため SPEC「預言を早める」が成立する。
26. **フレーバー**：各系統5枚に1行追加（SPEC の方針どおり固有名詞なし）。
27. **ボス判定の前提**：`EnemyDef.isBoss` はエンジンの必須項目ではない。敵データ担当は boss 定義に `kind:'boss'`（検証済み既定）
    または `isBoss:true` を付けること。

## Cards C（汎用・妨害 / ボス・エリート切り札 / 遺物 / _index）

1. **緊急停止（elite5_01）**：SPEC は「魔法（予約）」だが、予約魔法は相手ターン開始時に効き始めるため「そのターンを丸ごと飛ばす」ことができない。
   通常の魔法として使用時に `ctx.skipTurn(opp)` を予約し、相手の次のターンを飛ばす実装にした（`reserve:false`, tag `reserveLike`）。
   SPEC どおり **反魔の護符（immuneReserve）で無効化**され、戦闘中1回のみ（`player.flags.emergencyStopUsed`, `canPlay`）。
2. **鏡像の写し（boss5_01）**：`game.prevTurnActions` のうち相手の `type:'play'` の行動のみを順にコピーして `ctx.cast(defId, me, {copy:true})`。
   攻撃・起動型能力（祭壇で壊す等）は再現しない。対象は defId で現在の盤面から引き直し、無ければ対象なしで解決。
   予約魔法・時限魔法はコピーが即時効果を持たないため飛ばす（ログに「映せなかった」）。前のターンにループを runLoop で回していた場合、
   runLoop 中の行動も `turnActions` に記録されるので、その枚数分だけ再現される（999周なら999回）。
3. **もう一人の挑戦者（boss5_04）**：召喚時に自身を墓地へ送り、相手の場で最も攻撃力の高いモンスターの**コピー（isCopy）**を
   速攻付きで場に出す（元の召喚時効果も発動する）。相手の場にモンスターがいなければ 1/1 速攻のまま残る。
4. **裏返った姿見（boss5_02）**：`onDamageDealt`（scope any）で相手側が与えたダメージの半分（切り捨て）を相手に与える。反射の鏡盾は無視（`noReflect`）。
5. **最後の一周・からくり巨兵・終・終曲・万雷・刻限の処刑・終わりの自画像・二つ首の咆哮**：ダメージ量は **使った側（`ctx.owner`）**の値で測り、
   方向だけ `ctx.opp` に従う。これにより全反転の大鏡の下で「相手が得た分のダメージが相手自身に返る」。
6. **虚無の顎**：`ctx.pick` はゾーン横断できないため、場・手札・墓地の候補を `ctx.choose` のオプションにまとめて1枚ずつ3回選ぶ
   （`G.DataUtil.chooseCardAcross`）。候補が尽きれば終了。職人の予備部品（墓地/除外）、蒐集の目録（山札/墓地）、蒐集家の網（場/墓地）も同じ方式。
7. **先読みの賢者**：手札＋山札の上5枚を `reveal` イベント（`{who, viewer, zone, uids, defIds}`）で公開し、`ctx.choose` で1枚除外。
   **魔封じの猫**は `reveal` に加え `statuses.handRevealed=true` を相手に戦闘中付与（UIが読む）。
8. **世界の再創造**：解決中の自身も除外する。現在マナが5を超えていれば5に切り詰める。ドローは手番側から。時限ゾーン・封印ゾーン・除外は触らない（SPEC列挙外）。
9. **呪詛喰らい**：`curseRedirectToMonsterUid` を使うためエンジンは「呪詛n → nダメージ」を与える（SPEC の「1ダメージ」より厳しい）。
   場を離れるとリダイレクト解除。サンドボックスで事前配置した場合は `onBattleStart` で有効化。
10. **人魚の涙**：「墓地から手札に戻した」の検出は近似。墓地に入った uid を記録し、その uid のカードを手札から使うとき
    そのターン最初の1枚だけコスト0（`modCost` + `onCardPlayed`）。
11. **欠けた歯車**：除外のフックが無いため、カード使用・破壊・ターン開始/終了時に除外ゾーンを調べ、パーツがあれば1回だけ山札に戻す。
12. **盗人の手袋**：奪ったカードは `stolenFrom` を立てて敵の手札へ。戦闘後 `G.Data.restoreVault(game)` が蒐集箱と一緒に元の持ち主へ返す
    （戻り値 `{0:[defIds],1:[defIds]}`。ラン側がプレイヤー分をデッキに戻す）。
13. **無限の巾着・原初の炉**：遺物は CardInst ではないため `game.getAbilities` に出ない。`G.Data.relicAbilities(game,pIdx)` /
    `G.Data.useRelicAbility(game,pIdx,relicId,targetUids)` を UI/AI が呼ぶ。
14. **鎖の王冠**：禁忌カードは `isCopy` の手札コピーとして加える（報酬プールには影響しない）。
15. **狂った懐中時計**：エンジンの `flags.firstTimedDelta` を使用（`play.js` が解釈済み）。
16. **ラン側で読むフラグ（`RelicDef.runEffects`）**：`shopDiscount:0.2`（商人の印章）、`hazardEarly:true` + `revealEnemyHand:1`（危険察知の羅針盤）、
    `healAfterBattle:4`（旅人の水筒）、`hideHazard:true`（盲目の預言者の眼帯）、`rewardChoices:-1`（鎖の王冠）、`noRestHeal:true`（砕けた砂時計）、
    `mapFog:true`（嘘つきの地図）。合成は `G.Data.runEffectsOf(relicIds)`（数値は加算・真偽はOR）。
17. **エンジン変更（最小・報告済み）**：`rules.js` の `STATUS_MODE/STATUS_DEFAULT` に `spellCostDelta:'sum'`, `chainAtTurnStart:'sum'`,
    `initialHandDelta:'sum'`, `reserveLasts:'max'` を追加（grants で複数ソースが重なっても合成されるように）。
    `actions.js`：`onLeave` から `returnToHand` された場合（巡る不死鳥系）に `returnedToHandThisTurn` が加算されなかったバグを修正
    （`inst.prevZone` を記録し、limbo からの帰還でも「場から戻った」と判定）。からくり巨兵・終のテストが回帰テスト。
18. **`js/data/_index.js` の読み込み**：`tests/harness.js` の `LOGIC_FILES` と `index.html` に未登録（他者所有）。各テストは `require` で直接読む。
    統合時に `relics.js` の直後（`enemies.js` の前）へ追加してほしい。`validateAll()` はプロジェクトIDの正規表現に一致するカードだけを検査する
    （テスト用 `t_/ta_/tb_/tc_` カードを除外）。

## AI（js/ai, js/data/enemies.js）

1. **名前解決の遅延**：敵デッキ・遺物・フィールドは日本語名で書き、`EnemyDef.deck / relics / field` は getter で初回アクセス時に id へ解決する
   （カードファイルの読み込み順に依存しない）。見つからないカードは警告1回のうえ《見習いの火球》(basic_01) で代用。元の指定は `deckSpec / relicNames / fieldName`。
2. **ボス固有フィールドのフォールバック**：`cards_boss.js` に同名フィールドが無い場合のみ、`enemies.js` が `bossfield_01..05`
   （螺旋の工房・帯電する天空・逆さ時計の街・静かな博物館・合わせ鏡の間）を `bossOnly` で登録する。カード担当が同名で登録すればそちらが使われる。
3. **発狂の実装**：ARCHITECTURE §8 の「hidden crest」ではなく、**hidden 遺物**（`RelicDB` の `relic_bossN_enrage`, `hidden:true, category:'enemy'`）を
   `player.relics` に押し込む方式にした（紋章枠を消費せず、除去不能で、既存の遺物フックがそのまま使える）。UI は `RelicDef.hidden` の遺物を表示しない想定。
   発狂判定は `G.AI.checkEnrage(game, enemyIdx)`（AIターン開始時に自動。プレイヤーの行動直後にも UI から呼んでよい）。深度9は `chooser.enrageThreshold=0.65`。
4. **「予告なしで決着しない」の汎用化**：SPEC の危険度表を持たない敵（通常敵の一部）でも約束を守るため、`enemyPlayerConfig` が合成テスト
   `G.AI.lethalBlockedTest`（`player.flags.aiLethalBlocked` → 100%）を hazard に追加する。AI は1手シミュレーションで「このターンに勝つ／相手最大ライフの40%以上を一撃で削る／
   呪詛を上限の半分以上積む」手を「決着手」と判定し、`game.isForecasted` が偽ならその手を保留してフラグを立てる → ターン終了時に予告 → 次のターンに実行。
   攻撃（モンスターの殴り）は決着手に含めない（SPEC はコンボ決着を対象としているため）。
5. **ループ**：検出されたループは、まず複製盤面で1周だけ回して「資源が増えるか／相手が削れるか」を測り、出口（finisher ロール／コンボ辞書の出口）が手札か
   ループ自体に無ければ始めない。有限ループは `runLoop(n)`（相手ライフ＋α回）、致死ループは `'inf'`。1ターンに1回だけ回し、回したあとは出口カードを優先する。
6. **鏡の主の残り香**：`deckBuilder` が返す `residual` を `chooser.residualIds` 経由で `EnemyDef.onBattleStart` に渡し、山札/手札の該当インスタンスに `inst.residual = true` を付ける（UI はこれで縁をくすませる）。
   プレイヤーデッキ未指定（デバッグ戦など）のときは汎用コモンで20枚まで埋める。遺物コピーは `enemyPlayerConfig({playerRelics})` で行う（`copyPlayerRelics:true`）。
7. **名もなき挑戦者**：`deckBuilder` でランダム系統1〜2種から15枚を毎戦闘生成し、型もランダム。
8. **危険度 100% 判定の細部**：ストームの「手札6枚」は `statuses.handLimit` を尊重。蒐集者は「鍵1種ごと+20」を1〜4種の累積テスト4本で表現（`distinctKeys` を使うので万能鍵も数える）。
9. **ミス率**：`EnemyDef.mistakeRate`（normal 0.2 / elite 0.1 / boss 0）を `chooser.aiMistakeRate` に載せ、`game.options.aiMistakeRate` は後方互換のフォールバック。
   ミスは「決着手でない2〜3番手の行動を選ぶ」形でのみ起こり、予告ルールは破らない。
10. **暴走効果の番犬**：1行動で600回以上 `cardPlayed` が発生した場合（例：盗み見の鏡同士の相互コピー）、AI 側で中断して次の手へ進む。カード側の無限再帰は別途カード担当へ報告。
20. **コピー系の再帰防止（AI総当たりで発見したバグの修正）**：盗み見の鏡・偽りの約束・複写の大魔典・盗まれた奇跡・多重詠唱は
    「コピー系カード」同士を決してコピー／再発動しない（`G.Data.COPIER_IDS`、または `effects.isCopier` / tag `'copier'` で他ファイルから追加可）。
    さらに `game.copyDepth` をコピー入れ子の深さカウンタとし、8 を超えるとコピーを中止してログ（`G.Data.withCopyDepth`, `G.Data.COPY_DEPTH_MAX`）。
    盗み見の鏡は相手の最後の魔法がコピー系なら、それより前の／墓地の次にコピー可能な魔法を探す。

## Meta（js/data/texts.js, js/meta/depth.js・achievements.js・codex.js・records.js・festival.js・meta.js, js/ui/screens/codex.js・records.js・festival.js, css/meta.css）

1. **お祭りルール「フィールドを2枚まで置ける」**：エンジンは `game.field` が1枚固定のため実装不可。代替ルール
   **「フィールドは上書きされない（先に置いた方が残る）」** に置き換えた（`G.Festival.RULES.twoFields`、名前「動かぬ地の日」）。
   `G.Festival.applyToGame` はその game インスタンスの `makeCtx` を包み、2枚目以降の `setField` をコストだけ払って墓地送りにする
   （エンジンのファイルは触らない。`game.clone()` した AI の先読み盤面には掛からないので、AI は上書きできる前提で評価することがある）。
   ラン側（run.js）は独自に `allCostsZero` と倍ダメージ遺物 `_fx_festival_double_damage` を適用しているため、`applyToGame` は
   ラン側が使わない限り待機（二重適用しないよう、ラン側はどちらか一方を使うこと）。
2. **「1ターンの最大ダメージ」**：エンジンが持つのは単発の `player.maxDamageDealtOnce` と `stats.maxChain/longestLoop` のみ。
   `G.Records.attachGame(game)`（`G.Meta.onBattleStart(game)` 経由）で `damage` イベントを集計して `game.stats.maxDamageOneTurn` を作る。
   未接続の場合は `game.log` の「○○にNダメージ（残り…）」行をターンごとに合算して復元し、それも無ければ単発最大を下限として使う。
   **現状 run.js は `onBattleEnd` に `game: undefined` で渡してくる**ので、ログ復元も効かず単発最大（ラン側 `st.stats.maxDamageOneTurn`）に
   なる。統合時は `Run.beginBattle` の後で `G.Meta.onBattleStart(game)` を呼ぶか、`onBattleEnd` に `game` を残してほしい。
3. **ゲーム盤面に依存する実績（鏡返し・映らぬ者・託された者）**：`game` が無いときは `result.stats` / `run.flags` のフラグ
   （`mirrorReturnWin`, `mirrorBeatenBeforeReflect`, `graffitiReceived`=受け取った defId）で判定する。`game` があれば
   鏡返し＝「ボスのターン中（`game.active===1`）にライフ0、かつ `status(1,'invertEffects')`」、映らぬ者＝「鏡の主の《鏡像の写し》が
   全て山札/手札に残ったまま」、託された者＝「落書きで受け取ったカードが山札/手札以外のゾーンにある（＝使った）」で近似する。
   「特殊勝利」は `winReason` が `seals` / `prophecy` / `special`（呪詛・山札切れは含めない）。
4. **実績の数**：SPEC の挑戦8つに加え、深度10クリアの称号「禁域を越えた者」も `G.Achievements`（`ach_depth_10`）として同じ一覧に置いた。
5. **「ランの系統」**（二重系統パックの解放条件「3つ以上の系統でそれぞれ1回クリア」）＝最終デッキで最も枚数の多い系統（汎用は数えない、
   同数は加速→循環→連鎖→時間→複製→終焉の順で先勝ち）。汎用だけのデッキは系統なし＝どの系統のクリアにも数えない。
6. **カード使用回数**：`onBattleEnd` に `game` がある戦闘では `cardPlayed` 集計（無ければゾーンから近似）を戦闘ごとに加算し、
   無い場合はラン終了時に `run.stats.cardUse`（ラン側の累計）を1回だけ加算する（両方は足さない）。系統使用回数は同じ集計から、汎用を除いて数える。
7. **save の `records.maxDepth` 既定値が 0**（run 担当の save.js）なので、「最高クリア深度」の表示は `meta.maxDepthCleared`（既定 -1）を
   優先し、クリア経験が無ければ「未クリア」と出す。
8. **お祭りランの記録**は SPEC「ほかのプレイヤーと比べられる」のサーバーが無いため**端末内のみ**（`meta.festivalRecords[festivalId]`、
   上位10件：勝ち→ターン数少→最大ダメージ多）。日替わりはルール1つ、週替わり（ISO週）はルール2つを、
   `FNV-1a('kinki:' + id)` の種から決定的に選ぶ。お祭りランのクリアは深度を進めない（`G.Meta.onRunEnd`）。
9. **meta に追加したキー**（INTEGRATION_NOTES の G.Save 形に無いもの）：`festivalRecords`。`updateMeta` は任意キーを保存するので互換。
   `G.Save` が無い環境では各 meta モジュールが共通の `G.MetaStore`（メモリ）に退避する。
10. **図鑑の対象**：カード＝`bossOnly` でないカード全部（ボス補助カード・見習いの火球を含む、現在190枚）。遺物＝`hidden`/`enemyOnly`/
    `category:'enemy'|'hidden'` を除いた44種。敵＝`enemy_/elite_/boss_` の26体。日記＝30枚＋ボス5枚＝35枚。達成率は4区分の合計で出す。
    見た目の報酬（25/50/75/100%）は `G.Codex.cosmetics()` / `activeCardBack()` / `foilLevel()` で公開するだけで、カード描画側（cardview.js）
    への適用は未実装（統合時に `card-back` のクラス切り替えを追加してほしい）。
11. **秘密の落書き**：30枚の通常の切れ端が揃うと `G.Codex.secretGraffitiUnlocked()` が真になり、図鑑の日記タブに表示。
    タイトル画面のプール（title.js は `G.Texts.graffiti` を読む）へ混ぜるのはタイトル担当側で `G.Texts.secretGraffiti` を参照。
12. **深度の選択**：`meta.depth` は深度ピッカー（`G.ui.depthPicker` → `G.Depth.setCurrent`）だけが書く。ランクリア時は
    次の深度を自動で選択状態にする（`maxDepthCleared+1`、上限10）。`G.Meta.onRunStart` は `meta.depth` を触らない。

## Run（js/run, js/meta/save.js, js/data/events.js, js/ui/screens/{packopen,map,shop,rest,event,reward,runend}.js）

1. **マップ生成**：各幕は7行（0〜6）＋ボス行。各行2〜4マス、隣接行への非交差エッジ（全マスが到達可能・全マスからボスへ到達可能を `G.RunMap.validate` で保証）。行0は通常戦固定、ボス直前行は休憩固定。ショップ1・イベント1・エリート1（深度2で+1）を最低保証。SPECにない細部は StS 準拠で決めた。
2. **嘘つきの地図**：マップ生成時に約30%のマス（行0・ボス以外）を霧候補にし、遺物を所持している間だけ「？」表示。訪問済みマスは表示が戻る。
3. **ボス報酬の禁忌カード**：第1幕3択・第2幕4択（`EnemyDef.reward.tabooChoices` を優先）、所持済みを除外、スキップ可。鏡の主（第3幕）は禁忌なし、補助カード《ひび割れた手鏡》は図鑑登録のみ（`reward.auxCodex`）。
4. **エリートの遺物報酬**：汎用・系統別（コモン55/レア33/伝説12%）を所持済み除外で1つ。デッキの主系統に60%で寄せる（SPECは「汎用・系統別（コモン〜伝説）」のみ）。
5. **ミミック（喋る宝箱）の報酬2倍**：ゴールド×2に加え、カード3択をもう1回（`reward.cardsExtra`）。
6. **引き分け（turnLimit）**：UIでは起きないが、ヘッドレス戦闘で `turnLimit` に達した場合は報酬なしでマップへ戻す（敗北扱いにしない）。
7. **解放パックの価格**：SPECに価格がないため 黄金200G／二重系統120G／禁忌250G とした。中身：黄金＝伝説1確定+ランダム4、二重系統＝2系統からコモン2+2・レア以上1、禁忌＝禁忌1確定+ランダム4＋呪われた遺物1。
8. **混沌パックのレア以上2枚以外の3枠**：コモン70/レア22/伝説7/禁忌1%。ショップ・通常戦報酬のカードは SPEC のレアリティ割合（50/30/15、禁忌除外）を正規化して使用。
9. **価格の丸め**：倍率適用後は5G単位に丸める（例：深度3×商人の印章 → 100G が 90G）。遺物のショップ価格はSPECに無いため コモン120／レア180／伝説300G（伝説は25%でしか並ばない）。呪われた遺物の除去は75G×倍率。
10. **お祭りルール「フィールドを2枚まで置ける」（twoFields）**：エンジンがフィールド1枚固定のため未実装（ルールは無視される）。「ライフ2倍・ダメージ2倍」は隠し遺物 `_fx_festival_double_damage`（run.js で登録、hidden）で実装。「コストが0」は `statuses.allCostsZero`。
11. **戦闘の中断・再開**：戦闘途中のゲーム状態は保存しない。`G.Run.resume()` が `battle` を返した場合、同じ敵との戦闘を最初からやり直す（`pending.battle.seed` は維持）。
12. **日記の切れ端**：イベントの各選択肢で10%（未取得のみ、`G.Texts.diary` の非ボス断片）。ボス専用断片の id は `diary_<enemyId>`（meta 側の `onBattleEnd` と同じ id なので二重登録しても冪等）。
13. **置き去りのデッキ**：`lastRunDeck` が3枚未満ならランダムなカード（残り香なし）。拾ったカードは `run.flags.residualCards` に記録（鏡の主の残り香表示は敵デッキ側＝AI担当）。ライフ-5×枚数は「ライフが1以上残る枚数」で上限。
14. **壁の落書き**：受け取りは `G.Save.meta().graffitiCard`（1枚）。置けるのは伝説以下（禁忌・ボス専用は不可）、デッキ20枚を下回る場合は置けない。受け取ったカードは `run.flags.graffitiCards`（実績「託された者」用）。
15. **エンジン修正（最小）**：`js/engine/state.js` の `SKIP_FIELDS` に `_aiRng` を追加。AI が game に持たせる RNG が `game.restore()`（時間逆行・巻き戻しの鐘）で素のオブジェクトに戻り `rng.chance is not a function` で落ちていた。回帰テスト：`tests/run_events.test.js`「regression (engine)」。
16. **G.Meta が無いときの最小メタ処理**：`G.Run.endRun` は `G.Meta.onRunEnd` が存在すればそれに委ね、無ければ lastRunDeck／記録／深度解放／黄金パック解放を自前で更新する（二重更新はしない）。

## QA tuning（QA2・2026-11-09）

SPEC のカード文・エンジンの意味は変えず、第1幕の通常敵デッキとラン側の回復量だけを調整した。
計測は `balance_sim`（第1幕を40ラン、seed 1000〜1039、深度0、6パックランダム、人間側は `G.AI.takeTurn`（assemble）＋出口カード許可）。
人間側AIはかなり消極的（攻撃してくる小型モンスターと相打ちしない・敵の山札切れで勝つ試合が約45%）なので、実際の人間の勝率はこれより高いはず。

| 変更 | 前 | 後 | 理由 |
| --- | --- | --- | --- |
| 霧の双子姉妹のデッキ | 消えない残像 ×1 | 見習いの火球 ×1 | 「幻影はターン終了時に消える」を教える先生役なのに、幻影が残って幻影の総攻撃が毎ターン十数点になっていた。全快状態でも勝率42%・平均被ダメ33（ライフ40）。 |
| 火吹きトカゲのデッキ | 焦熱解放 ×2／火の粉の妖精 ×2 | 焦熱解放 ×1／火の粉の妖精 ×3 | 第1幕で最大の被ダメ源（平均30）。出口は1枚残すので「マナ加速と出口」は教えられる。 |
| 戦闘勝利後の回復（`G.Run.POST_BATTLE_HEAL_RATE`, js/run/run.js） | なし | 通常戦・エリート勝利で最大ライフの20%（40→+8）、ボス勝利で全快 | ライフが持ち越されるだけで回復が休憩マス（30%）しかなく、通常戦1戦あたり15〜25点削られて2〜3戦目で力尽きていた。幕の切り替わりでも回復が無かった。旅人の水筒（+4）はこれに上乗せ。 |

計測結果（同じ40ラン）:

| 指標 | 調整前 | 調整後 |
| --- | --- | --- |
| 1戦目の勝率 | 58% | 73%（攻撃的な人間代理: 85%） |
| 2戦目の勝率 | 45% | 61%（73%） |
| 3戦目の勝率 | 40% | 71%（79%） |
| 第1幕ボス到達 | 4 / 40 | 8 / 40（11 / 40） |
| 第1幕クリア | 3 / 40 | 5 / 40 |
| 霧の双子姉妹 勝率 | 25% | 77% |
| 全快状態での通常戦勝率（2〜4戦目） | 77〜92% | 93〜100% |

残る難所（未調整・要判断）：第1幕ボス**蒐集者**は人間代理の勝率0〜33%（封印勝利で負ける。代理AIが鍵を妨害しないため）。火吹きトカゲは調整後も勝率44〜65%（小型モンスターの削りが主因）。

## First-turn mana (integrator, 2026-11-09)
- Both players' first turn always starts at max mana 1 (SPEC 戦闘ルール). `js/engine/turn.js`: on a player's first turn the per-turn max-mana bonus (`maxManaGainDelta`, 竜の心臓) does not apply.
- 「戦闘開始時、マナ+N」 relics (燃える種火 +1, 予備の歯車 +2) previously raised **max** mana permanently (start at 2 or 3). They now add N mana on the first turn only via `player.flags.firstTurnManaBonus`; max mana is unaffected. Regression: `tests/first_turn_mana.test.js`.
