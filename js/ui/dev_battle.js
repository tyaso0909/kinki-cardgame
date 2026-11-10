/* 禁域 — js/ui/dev_battle.js  (DEV ONLY)
   Builds a test battle so the battle screen can be exercised before run
   mode exists.  G.ui.devBattle.start({seed}) → opens screen 'battle'.
   - Uses G.CardDB.pool() when ≥10 real cards exist, otherwise registers a
     small set of test defs (ids dev_*) modelled on tests/engine.test.js.
   - G.ui.devBattle.naiveTurn(game, pIdx, {onStep}) is the fallback enemy
     brain used by battle.js when G.AI is absent: play what it can, attack
     face, end turn.
*/
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});

  function reg(def) { try { if (!G.CardDB.has(def.id)) G.CardDB.register(def); } catch (e) { console.warn('dev card skipped', def.id, e); } }

  function registerTestDefs() {
    const Fx = G.Fx;
    if (!Fx) return [];
    const defs = [
      { id: 'dev_sprite', name: '火の粉の妖精', type: 'monster', lineage: 'accel', role: 'fuel', rarity: 'common', cost: 0, atk: 1, hp: 1, text: '召喚時、マナ+1', effects: { onSummon: Fx.gainMana(1) } },
      { id: 'dev_imp', name: 'マナ喰いの小妖精', type: 'monster', lineage: 'accel', role: 'fuel', rarity: 'common', cost: 1, atk: 1, hp: 1, text: '召喚時、マナ+2。破壊時、マナ+2', effects: { onSummon: Fx.gainMana(2), onDeath: Fx.gainMana(2) } },
      { id: 'dev_guard', name: '渦潮の番人', type: 'monster', lineage: 'cycle', role: 'fuel', rarity: 'common', cost: 2, atk: 1, hp: 3, keywords: ['guard'], text: '守護。破壊時、カードを2枚引く', effects: { onDeath: Fx.draw(2) } },
      { id: 'dev_rush', name: '火吹きトカゲ', type: 'monster', lineage: 'accel', role: 'finisher', rarity: 'common', cost: 2, atk: 3, hp: 1, keywords: ['rush'], text: '速攻', effects: {} },
      { id: 'dev_big', name: '火喰い竜', type: 'monster', lineage: 'accel', role: 'finisher', rarity: 'rare', cost: 5, atk: 5, hp: 5, keywords: ['rush'], tags: ['dragon'], text: 'このターンに得たマナ1につき、このカードのコスト-1', effects: { costMod: function (ctx) { return -ctx.me.manaGainedThisTurn; } } },
      { id: 'dev_twins', name: '霧の双子', type: 'monster', lineage: 'copy', role: 'fuel', rarity: 'common', cost: 2, atk: 1, hp: 1, text: '召喚時、このカードの幻影を1体出す', effects: { onSummon: Fx.phantomOfSelf(1) } },
      { id: 'dev_skel', name: '骨拾いの小鬼', type: 'monster', lineage: 'doom', role: 'fuel', rarity: 'common', cost: 1, atk: 1, hp: 1, text: '破壊時、相手に呪詛1', effects: { onDeath: Fx.curse(1) } },
      { id: 'dev_phoenix', name: '巡る不死鳥', type: 'monster', lineage: 'accel', role: 'engine', rarity: 'legend', cost: 0, atk: 1, hp: 1, text: '召喚時、マナ+1。場を離れたとき、手札に戻る', flavor: '死ぬのにも飽きた鳥。', effects: { onSummon: Fx.gainMana(1), onLeave: async function (ctx) { await ctx.returnToHand(ctx.card); } } },
      { id: 'dev_spark', name: '火種', type: 'spell', lineage: 'accel', role: 'fuel', rarity: 'common', cost: 0, text: 'マナ+1。カードを1枚引く', effects: { onPlay: Fx.seq(Fx.gainMana(1), Fx.draw(1)) } },
      { id: 'dev_bolt', name: '雷撃', type: 'spell', lineage: 'chain', role: 'finisher', rarity: 'common', cost: 1, text: '相手に3ダメージを与える', effects: { onPlay: Fx.dmgOpp(3) } },
      { id: 'dev_chainbolt', name: '雷撃の連打', type: 'spell', lineage: 'chain', role: 'finisher', rarity: 'common', cost: 1, text: '連鎖数と同じダメージを与える', effects: { onPlay: Fx.dmgOpp(Fx.chain(1)) } },
      { id: 'dev_xbolt', name: '嵐の砲撃', type: 'spell', lineage: 'chain', role: 'finisher', rarity: 'rare', cost: 'X', text: 'Xダメージを与える', effects: { onPlay: Fx.dmgOpp(Fx.xValue()) } },
      { id: 'dev_kill', name: '消滅の光', type: 'spell', lineage: 'generic', role: 'disrupt', rarity: 'common', cost: 2, text: 'モンスター1体を除外する', targets: Fx.T.anyMonster, effects: { onPlay: Fx.exileTarget() } },
      { id: 'dev_bounce', name: '帰還の術', type: 'spell', lineage: 'copy', role: 'engine', rarity: 'common', cost: 0, text: '自分のモンスター1体を手札に戻す。マナ+1', targets: Fx.T.allyBoardMonster, effects: { onPlay: Fx.seq(Fx.bounceTarget(), Fx.gainMana(1)) } },
      { id: 'dev_draw2', name: '知識の泉水', type: 'spell', lineage: 'cycle', role: 'fuel', rarity: 'common', cost: 1, text: 'カードを2枚引く', effects: { onPlay: Fx.draw(2) } },
      { id: 'dev_reprise', name: '泡沫の呪文', type: 'spell', lineage: 'cycle', role: 'fuel', rarity: 'common', cost: 0, reprise: 0, text: 'カードを1枚引く。再演（0）', effects: { onPlay: Fx.draw(1) } },
      { id: 'dev_extra', name: '砂時計の反転', type: 'spell', lineage: 'time', role: 'engine', rarity: 'rare', cost: 4, text: 'このターンの後に追加ターンを得る', effects: { onPlay: Fx.extraTurn() } },
      { id: 'dev_reserve', name: 'マナ封鎖', type: 'spell', lineage: 'accel', role: 'disrupt', rarity: 'common', cost: 2, reserve: true, text: '相手の次のターン中、相手が得るマナは半分になる', effects: {}, reserveHooks: { grants: [{ key: 'manaGainHalved', value: true }] } },
      { id: 'dev_bomb', name: '時限爆弾', type: 'spell', lineage: 'time', role: 'finisher', rarity: 'common', cost: 1, timed: 2, text: '時限2：相手に10ダメージを与える', effects: { onTimed: Fx.dmgOpp(10) } },
      { id: 'dev_key1', name: '終末の鍵・第一', type: 'spell', lineage: 'doom', role: 'finisher', rarity: 'common', cost: 1, key: 1, text: '封印ゾーンに置く。カードを1枚引く', effects: { onPlay: Fx.seq(Fx.seal(), Fx.draw(1)) } },
      { id: 'dev_curse', name: '黒い囁き', type: 'spell', lineage: 'doom', role: 'finisher', rarity: 'common', cost: 1, text: '相手に呪詛2', effects: { onPlay: Fx.curse(2) } },
      { id: 'dev_altar', name: '焚べ火の祭壇', type: 'crest', lineage: 'accel', role: 'engine', rarity: 'common', cost: 1, text: '自分のターン中、自分のモンスターを何度でも破壊できる', flavor: '火は何度でも灯る。灯す者がいる限り。',
        effects: { ability: { label: '破壊', targets: { kind: 'boardMonster', side: 'ally', count: 1, prompt: '破壊する自分のモンスターを選ぶ' }, use: async function (ctx) { await ctx.destroy(ctx.targets[0]); } } } },
      { id: 'dev_core', name: '暴走する炉心', type: 'crest', lineage: 'accel', role: 'engine', rarity: 'rare', cost: 3, text: 'マナを得るたび、さらにマナ+1', effects: { onManaGained: Fx.gainMana(1) } },
      { id: 'dev_mirror', name: '双面の紋章', type: 'crest', lineage: 'copy', role: 'engine', rarity: 'rare', cost: 3, text: '自分の魔法はすべて2回発動する', effects: { grants: [{ key: 'spellMultiplier', value: 2 }] } },
      { id: 'dev_volcano', name: '竜脈の火山', type: 'field', lineage: 'accel', role: 'engine', rarity: 'rare', cost: 2, text: 'お互い、マナを得るたびさらに+1。展開時：マナ+2', effects: { scope: 'any', onManaGained: Fx.gainMana(1), onPlace: Fx.gainMana(2) } },
      { id: 'dev_temple', name: '静寂の神殿', type: 'field', lineage: 'generic', role: 'disrupt', rarity: 'common', cost: 2, text: 'お互い、1ターンに使えるカードは5枚まで。展開時：カードを1枚引く', effects: { grants: [{ key: 'cardsPerTurnLimit', value: 5, side: 'any' }], onPlace: Fx.draw(1) } },
    ];
    defs.forEach(reg);
    return defs.map((d) => d.id);
  }

  // Random 30-card deck with a sane curve from the given defs.
  function buildDeck(rng, defs, n) {
    n = n || 30;
    const out = [];
    const weight = (d) => (d.rarity === 'common' ? 5 : d.rarity === 'rare' ? 3 : 1);
    const bag = [];
    defs.forEach((d) => { for (let i = 0; i < weight(d); i++) bag.push(d.id); });
    const copies = {};
    let guard = 0;
    while (out.length < n && guard++ < 4000) {
      const id = rng.pick(bag);
      if ((copies[id] || 0) >= 3) continue;
      copies[id] = (copies[id] || 0) + 1;
      out.push(id);
    }
    return out;
  }

  function devEnemyDef(defs, seed) {
    // hazard tests over whatever defs exist: finishers in hand/board/crests move the meter
    const finishers = defs.filter((d) => d.role === 'finisher').map((d) => d.id);
    const engines = defs.filter((d) => d.role === 'engine').map((d) => d.id);
    const has = (p, ids, zones) => zones.some((z) => (p[z] || []).some((c) => ids.indexOf(c.defId) >= 0));
    return {
      id: 'dev_enemy', name: 'テストの敵', kind: 'normal', lineage: 'accel', life: 40,
      introText: '開発用の相手。盤面と演出の確認用。',
      teaches: '手札を上へドラッグ（またはタップ）→ 使う。場のモンスターを敵へドラッグ（またはタップ）→ 攻撃。',
      forecastText: '次のターン、火が降る',
      lastWords: '……テストは、通ったか。',
      diary: '歯車の音が止まらない。止め方を書いたメモを、どこかに挟んだはずだ。',
      hazardTests: [
        { test: (g, me) => has(me, engines, ['crests', 'board']), weight: 40 },
        { test: (g, me) => has(me, finishers, ['hand', 'board']), weight: 30 },
        { test: (g, me) => me.mana + me.maxMana >= 8, weight: 30 },
      ],
      seed,
    };
  }

  // Fallback enemy brain when G.AI is missing.
  async function naiveTurn(game, pIdx, opts) {
    opts = opts || {};
    const step = async () => { if (opts.onStep) await opts.onStep(); };
    let guard = 0;
    while (game.winner === null && game.active === pIdx && game.phase === 'main' && guard++ < 40) {
      const pl = game.getPlayable(pIdx).filter((x) => !x.needsTarget && !x.needsX).sort((a, b) => b.cost - a.cost);
      if (pl.length) {
        const r = await game.playCard(pIdx, pl[0].uid, {});
        await step();
        if (r && r.ok) continue;
      }
      const targeted = game.getPlayable(pIdx).filter((x) => x.needsTarget);
      let played = false;
      for (const x of targeted) {
        const inst = game.findCard(x.uid);
        const def = G.CardDB.get(inst.defId);
        const ctx = game.makeCtx(pIdx, inst);
        const cands = ctx.candidatesFor(def.targets);
        const enemy = cands.filter((c) => c.owner !== pIdx);
        const pick = (def.targets.side === 'ally' ? cands : enemy)[0];
        if (!pick) continue;
        const r = await game.playCard(pIdx, inst.uid, { choices: { targets: [pick.uid] } });
        await step();
        if (r && r.ok) { played = true; break; }
      }
      if (played) continue;
      const atk = game.getAttackers(pIdx);
      if (atk.length) {
        const a = atk[0];
        const target = a.targets.indexOf('face') >= 0 ? 'face' : a.targets[0];
        await game.attack(pIdx, a.uid, target);
        await step();
        continue;
      }
      break;
    }
    if (game.winner === null && game.active === pIdx && game.phase === 'main') await game.endTurn(pIdx);
  }

  function start(opts) {
    opts = opts || {};
    if (!G.Engine || !G.CardDB) { ui.toast('エンジンが読み込まれていません', { kind: 'bad' }); return; }
    const seed = opts.seed != null ? opts.seed : (Date.now() % 100000);
    const rng = new G.RNG(seed);
    let pool = [];
    try { pool = G.CardDB.pool().filter((d) => !/^(demo_|t_)/.test(d.id)); } catch (e) { pool = []; }
    if (pool.length < 10) {
      const ids = registerTestDefs();
      pool = ids.map((id) => G.CardDB.get(id));
    }
    const edef = devEnemyDef(pool, seed);
    const game = G.Engine.createGame({
      seed,
      players: [
        { name: 'あなた', deck: buildDeck(rng, pool), isAI: false, life: 40 },
        { name: edef.name, deck: buildDeck(rng, pool), isAI: true, life: edef.life, hazardTests: edef.hazardTests },
      ],
      options: { aiMistakeRate: 0.2 },
    });
    game.players[1].forecastText = edef.forecastText;
    const onEnd = (res) => {
      ui.toast(res.won ? 'テスト戦闘に勝利' : '敗北（' + (res.reason || '') + '）');
      ui.app.show('settings', null, { replace: true });
    };
    return ui.app.show('battle', { game, onEnd, enemyDef: edef }, { transition: 'fade' });
  }

  ui.devBattle = { start, naiveTurn, buildDeck, registerTestDefs };
})(globalThis.G = globalThis.G || {});
