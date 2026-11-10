(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // js/run/rewards.js — G.Rewards: battle rewards (SPEC 通常敵とエリート / ボス詳細設計 撃破時).
  //   G.Rewards.forBattle(run, {enemyDef, elite, boss, rewardMul, rng}) → reward
  //   reward = { kind:'normal'|'elite'|'boss', gold, cards:[defIds]|null, packs:[types]|null, relic:id|null,
  //              bossRelics:[ids]|null, taboo:[ids]|null, auxCard:id|null, diary:{id,text}|null, lastWords, boss:bool }
  //   G.Rewards.cardChoices(run, rng, n) → [defIds]   (SPEC rarity weights; no taboo; 鎖の王冠 → 2)
  //   G.Rewards.findDiary(run, rng) → {id, text} | null   (an unread entry from G.Texts.diary)
  //   G.Rewards.tabooChoices(run, rng, n) → [defIds] excluding owned
  // ---------------------------------------------------------------
  const GOLD = { normal: [20, 30], elite: [50, 70], boss: [120, 120] };

  function rollRarity(rng) { const r = rng.next() * 95; return r < 50 ? 'common' : r < 80 ? 'rare' : 'legend'; }

  function cardChoices(run, rng, n) {
    const fx = G.Data.runEffectsOf(run.relics || []);
    const count = Math.max(1, (n || 3) + (fx.rewardChoices || 0));
    const pool = G.CardDB.pool(function (d) { return G.Data.isProjectCard(d) && d.rarity !== 'taboo'; });
    const out = [];
    for (let i = 0; i < count && pool.length; i++) {
      const rar = rollRarity(rng);
      let cands = pool.filter(function (d) { return d.rarity === rar && out.indexOf(d.id) < 0; });
      if (!cands.length) cands = pool.filter(function (d) { return out.indexOf(d.id) < 0; });
      out.push(rng.pick(cands).id);
    }
    return out;
  }
  function packChoices(run, rng, n) {
    const types = G.Packs.available(G.Save && G.Save.meta ? G.Save.meta() : null, run.festival);
    return rng.shuffle(types.slice()).slice(0, Math.min(n || 3, types.length));
  }
  // Elite relic: 汎用・系統別 (common〜legend), biased toward the deck's dominant lineage, never owned.
  function eliteRelic(run, rng) {
    const owned = run.relics || [];
    const dominant = G.Run && G.Run.dominantLineage ? G.Run.dominantLineage(run.deck) : null;
    let pool = G.Data.relicsBy('player').filter(function (r) { return (r.category === 'generic' || r.category === 'lineage') && owned.indexOf(r.id) < 0; });
    if (!pool.length) return null;
    const r = rng.next() * 100;
    const rar = r < 55 ? 'common' : r < 88 ? 'rare' : 'legend';
    let cands = pool.filter(function (x) { return x.rarity === rar; });
    if (!cands.length) cands = pool;
    const biased = cands.filter(function (x) { return x.lineage === dominant || x.category === 'generic'; });
    if (dominant && biased.length && rng.chance(0.6)) cands = biased;
    return rng.pick(cands).id;
  }
  function bossRelicChoices(run, rng, n) {
    const owned = run.relics || [];
    const pool = G.Data.relicsBy('boss').filter(function (r) { return owned.indexOf(r.id) < 0; });
    return rng.shuffle(pool.slice()).slice(0, Math.min(n || 3, pool.length)).map(function (r) { return r.id; });
  }
  function tabooChoices(run, rng, n) {
    const owned = run.deck || [];
    const pool = G.Data.tabooCards().filter(function (d) { return owned.indexOf(d.id) < 0; });
    return rng.shuffle(pool.slice()).slice(0, Math.min(n, pool.length)).map(function (d) { return d.id; });
  }
  function readDiary() {
    try { const m = G.Save && G.Save.meta ? G.Save.meta() : null; return (m && m.codex && m.codex.diary) || {}; } catch (e) { return {}; }
  }
  function findDiary(run, rng) {
    if (!G.Texts || !Array.isArray(G.Texts.diary)) return null;
    const read = readDiary();
    const found = (run.flags && run.flags.diaryFound) || [];
    const cands = G.Texts.diary.filter(function (d) { return !d.boss && !read[d.id] && found.indexOf(d.id) < 0; });
    if (!cands.length) return null;
    const d = rng.pick(cands);
    noteDiary(run, d.id);
    return { id: d.id, text: d.text };
  }
  function bossDiary(run, enemyDef) {
    if (!enemyDef || !enemyDef.diary) return null;
    let id = 'diary_' + enemyDef.id;
    if (G.Texts && Array.isArray(G.Texts.diary)) { const d = G.Texts.diary.find(function (x) { return x.boss === enemyDef.id; }); if (d) id = d.id; }
    noteDiary(run, id);
    return { id: id, text: enemyDef.diary, boss: enemyDef.id };
  }
  function noteDiary(run, id) {
    if (run.flags) { run.flags.diaryFound = run.flags.diaryFound || []; if (run.flags.diaryFound.indexOf(id) < 0) run.flags.diaryFound.push(id); }
    if (G.Meta && typeof G.Meta.onDiaryFound === 'function') { try { G.Meta.onDiaryFound(id); } catch (e) { /* ignore */ } }
    else { try { G.Save.updateMeta(function (m) { m.codex.diary[id] = true; }); } catch (e) { /* ignore */ } }
  }

  function forBattle(run, opts) {
    opts = opts || {};
    const rng = opts.rng || new G.RNG(1);
    const edef = opts.enemyDef || {};
    const kind = opts.boss ? 'boss' : opts.elite ? 'elite' : 'normal';
    const mul = opts.rewardMul || 1;
    const range = (edef.reward && edef.reward.gold) || GOLD[kind];
    const gold = Math.round((range[0] + rng.int(range[1] - range[0] + 1)) * mul);
    const reward = { kind: kind, boss: kind === 'boss', elite: kind === 'elite', enemyId: edef.id || null, enemyName: edef.name || '', gold: gold, rewardMul: mul,
      cards: null, packs: null, relic: null, bossRelics: null, taboo: null, auxCard: null, diary: null, lastWords: edef.lastWords || null };
    if (kind === 'normal') {
      reward.cards = cardChoices(run, rng, 3);
      if (mul > 1) reward.cardsExtra = cardChoices(run, rng, 3); // ミミック: doubled rewards → a second card pick
    } else if (kind === 'elite') {
      reward.packs = packChoices(run, rng, 3);
      reward.relic = eliteRelic(run, rng);
    } else {
      reward.bossRelics = bossRelicChoices(run, rng, 3);
      const nTaboo = edef.reward && typeof edef.reward.tabooChoices === 'number' ? edef.reward.tabooChoices : (run.act === 1 ? 3 : run.act === 2 ? 4 : 0);
      reward.taboo = nTaboo > 0 ? tabooChoices(run, rng, nTaboo) : null;
      const auxName = edef.reward && edef.reward.auxCard;
      const auxId = auxName ? G.Data.idByName(auxName) : null;
      if (auxId && run.act < 3) reward.auxCard = auxId;
      if (auxId && run.act >= 3) { reward.auxCodex = auxId; try { if (!G.Meta) G.Save.updateMeta(function (m) { m.codex.cards[auxId] = true; }); } catch (e) { /* ignore */ } }
      reward.diary = bossDiary(run, edef);
    }
    return reward;
  }

  G.Rewards = { GOLD: GOLD, forBattle: forBattle, cardChoices: cardChoices, packChoices: packChoices, eliteRelic: eliteRelic, bossRelicChoices: bossRelicChoices, tabooChoices: tabooChoices, findDiary: findDiary, bossDiary: bossDiary };
})(globalThis.G = globalThis.G || {});
