(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // js/data/events.js — the 16 run events (SPEC イベントマス). Registered in G.EventDB.
  //
  // EventDef = { id, name, act (first act it may appear), lineage (glyph for the screen), text | text(run),
  //   onEnter(run, rng)?, available(run)?, options: [Option] }
  // Option = { label | label(run), available(run) → bool,
  //            pick?: { kind:'deckCard'|'relic'|'offered'|'amount'|'deckCards', count: n|'any', prompt, candidates(run) → [ids|numbers] },
  //            resolve(run, choice, rng) → { text, battle?: {enemyId, elite?, rewardMul?}, again?: bool } }
  // `run` is G.Run.state; mutations go through G.Run.* so saving/meta hooks happen uniformly.
  // Helpers: G.Events.candidates(run, eventId, optIdx), G.Events.firstChoice(run, eventId, optIdx)
  // ---------------------------------------------------------------
  const DB = G.EventDB;
  const R = function () { return G.Run; };
  const LINEAGES = ['accel', 'cycle', 'chain', 'time', 'copy', 'doom'];
  const RARITY_RANK = { common: 0, rare: 1, legend: 2, taboo: 3, boss: 4 };

  function pool(pred) { return G.CardDB.pool(function (d) { return G.Data.isProjectCard(d) && pred(d); }); }
  function names(ids) { return ids.map(function (id) { return '《' + G.CardDB.get(id).name + '》'; }).join('、'); }
  function relicName(id) { return '「' + G.RelicDB.get(id).name + '」'; }
  function deckCards(run) { return run.deck.slice(); }
  function deckCardsDistinct(run) { const seen = {}; return run.deck.filter(function (id) { if (seen[id]) return false; seen[id] = true; return true; }); }
  function meta() { try { return G.Save && G.Save.meta ? G.Save.meta() : null; } catch (e) { return null; } }
  function randomCursed(run, rng) {
    const all = G.Data.relicsBy('cursed');
    const fresh = all.filter(function (r) { return run.relics.indexOf(r.id) < 0; });
    const c = (fresh.length ? fresh : all);
    return c.length ? rng.pick(c).id : null;
  }
  function one(choice) { return Array.isArray(choice) ? choice[0] : choice; }
  function many(choice) { return choice == null ? [] : Array.isArray(choice) ? choice : [choice]; }
  const leave = function (text) { return { label: '立ち去る', resolve: function () { return { text: text || '何も手を触れずに、その場を離れた。' }; } }; };

  // 1 怪しい露店
  DB.register({ id: 'event_shady_stall', name: '怪しい露店', act: 1, lineage: 'generic',
    text: '布をかぶせた台の上に、中身の見えないパックが一つ。店主らしき影は、値段以外を何も言わない。「50G。中は見てのお楽しみ」',
    options: [
      { label: '50Gで、中身の見えないパックを買う', available: function (run) { return run.gold >= 50; },
        resolve: function (run, choice, rng) {
          R().gold(-50);
          const type = rng.pick(G.Packs.BASE_TYPES);
          const cards = R().openPackIntoDeck(type, rng);
          return { text: '布を払うと、' + G.Packs.def(type).name + 'だった。' + names(cards) + 'がデッキに入った。', cards: cards, pack: type };
        } },
      leave('影は何も言わず、台に布をかぶせ直した。')
    ] });

  // 2 賭博師の卓
  DB.register({ id: 'event_gambler', name: '賭博師の卓', act: 1, lineage: 'chain',
    text: '銀貨を指で弾きながら、賭博師が笑う。「表か裏か。賭けるものは何でもいい。あんたの命以外なら」',
    options: [
      { label: 'ゴールドを賭けてコイントス（最大100G。勝てば2倍、負ければ失う）', available: function (run) { return run.gold >= 10; },
        pick: { kind: 'amount', count: 1, prompt: '賭ける額', candidates: function (run) { return [10, 25, 50, 100].filter(function (n) { return n <= run.gold; }); } },
        resolve: function (run, choice, rng) {
          let amt = Number(one(choice)) || 0; amt = Math.min(100, Math.max(0, Math.min(amt, run.gold)));
          if (amt <= 0) return { text: '何も賭けなかった。賭博師は肩をすくめた。' };
          const win = rng.chance(0.5);
          R().gold(win ? amt : -amt);
          return { text: win ? 'コインは表。' + amt + 'Gが' + (amt * 2) + 'Gになって戻ってきた。' : 'コインは裏。' + amt + 'Gは賭博師の袖に消えた。', win: win, flip: win ? 'win' : 'lose' };
        } },
      { label: 'デッキのカード1枚を賭ける（勝てばレア以上1枚、負ければ賭けたカードを失う）', available: function (run) { return run.deck.length > G.Shop.DECK_MIN; },
        pick: { kind: 'deckCard', count: 1, prompt: '賭けるカード', candidates: deckCardsDistinct },
        resolve: function (run, choice, rng) {
          const id = one(choice); if (!id || run.deck.indexOf(id) < 0) return { text: '何も賭けなかった。' };
          const win = rng.chance(0.5);
          if (win) {
            const rar = G.Packs.rollRarity(rng);
            let cands = pool(function (d) { return d.rarity === rar; }); if (!cands.length) cands = pool(function (d) { return d.rarity === 'rare'; });
            const got = rng.pick(cands).id; R().addCard(got, { source: 'event' });
            return { text: 'コインは表。賭博師は舌打ちして' + names([got]) + 'を放ってよこした。', win: true, flip: 'win', cards: [got] };
          }
          R().removeCard(id, { reason: 'event' });
          return { text: 'コインは裏。' + names([id]) + 'は賭博師の山札に紛れていった。', win: false, flip: 'lose' };
        } },
      leave('「次は本気でやろうぜ」。賭博師の声が背中に当たった。')
    ] });

  // 3 拾ったカードの束
  DB.register({ id: 'event_found_bundle', name: '拾ったカードの束', act: 1, lineage: 'generic',
    text: '通路の隅に、紐で束ねたカードが落ちている。妨害カードばかり。誰かが、誰かを止めるために集めていたものらしい。',
    options: [
      { label: '妨害パックを1つ無料で開ける', resolve: function (run, choice, rng) { const cards = R().openPackIntoDeck('disrupt', rng); return { text: '紐をほどくと、' + names(cards) + 'が出てきた。', cards: cards, pack: 'disrupt' }; } },
      leave('束はそのままにしておいた。次の誰かのために。')
    ] });

  // 4 祈りの泉
  DB.register({ id: 'event_prayer_spring', name: '祈りの泉', act: 1, lineage: 'cycle',
    text: '澄んだ水が音もなく湧いている。水面に映る自分は、こちらより少しだけ疲れていない顔をしていた。',
    options: [
      { label: 'ライフ+20', resolve: function (run) { R().heal(20); return { text: '水を口に含むと、痛みがほどけていった。ライフが20回復した。' }; } },
      { label: '呪われた遺物を1つ外す', available: function (run) { return G.Shop.cursedRelics(run).length > 0; },
        pick: { kind: 'relic', count: 1, prompt: '外す遺物', candidates: function (run) { return G.Shop.cursedRelics(run); } },
        resolve: function (run, choice) { const id = one(choice) || G.Shop.cursedRelics(run)[0]; if (!id) return { text: '外すものがなかった。' }; R().removeRelic(id); return { text: relicName(id) + 'を泉に沈めた。水は一瞬黒く濁り、すぐに澄んだ。' }; } },
      { label: '何もしない', resolve: function () { return { text: '水面をしばらく眺めてから、立ち上がった。' }; } }
    ] });

  // 5 喋る宝箱
  DB.register({ id: 'event_talking_chest', name: '喋る宝箱', act: 1, lineage: 'copy',
    text: '「開けてくれ」と宝箱が言った。宝箱は、普通は喋らない。',
    options: [
      { label: '開ける（中身はミミック。通常敵と戦い、勝てば報酬が2倍）',
        resolve: function (run, choice, rng) {
          const cands = G.Enemies ? G.Enemies.byTier('normal', run.act) : [];
          const e = cands.length ? rng.pick(cands) : null;
          if (!e) return { text: '箱は空だった。……本当に空だった。' };
          return { text: '蓋が開いた瞬間、箱の中から歯が生えた。ミミックは' + e.name + 'の姿を借りて襲いかかってくる。', battle: { enemyId: e.id, elite: false, rewardMul: 2 } };
        } },
      { label: '話しかける（ゴールドを少しもらえる）', resolve: function (run, choice, rng) { const g = 15 + rng.int(16); R().gold(g); return { text: '宝箱は長い身の上話をしたあと、口直しにと' + g + 'Gを吐き出した。', gold: g }; } }
    ] });

  // 6 呪われた宝箱
  DB.register({ id: 'event_cursed_chest', name: '呪われた宝箱', act: 1, lineage: 'doom',
    text: '黒い鎖の巻かれた箱。鎖は錆びて、触れればすぐに切れそうだ。中から、かすかに歯車の音がする。',
    options: [
      { label: '開ける（レア以上2枚か伝説1枚。代わりに呪われた遺物を1つ押し付けられる）',
        resolve: function (run, choice, rng) {
          let got;
          if (rng.chance(0.5)) { const legs = pool(function (d) { return d.rarity === 'legend'; }); got = [rng.pick(legs).id]; }
          else { got = [1, 2].map(function () { const rar = G.Packs.rollRarity(rng); let c = pool(function (d) { return d.rarity === rar; }); if (!c.length) c = pool(function (d) { return d.rarity === 'rare'; }); return rng.pick(c).id; }); }
          got.forEach(function (id) { R().addCard(id, { source: 'event' }); });
          const cursed = randomCursed(run, rng); if (cursed) R().addRelic(cursed, { source: 'event' });
          return { text: '鎖が切れ、' + names(got) + 'が手に入った。箱の底にあった' + (cursed ? relicName(cursed) : '何か') + 'が、勝手に荷物へ潜り込んだ。', cards: got, relic: cursed };
        } },
      { label: '開けない', resolve: function () { return { text: '歯車の音は、こちらが離れるまで止まなかった。' }; } }
    ] });

  // 7 鏡の部屋
  DB.register({ id: 'event_mirror_room', name: '鏡の部屋', act: 1, lineage: 'copy',
    text: '壁も床も鏡。手にしたカードを掲げると、鏡の中のカードだけが少し遅れて動いた。',
    options: [
      { label: 'デッキのカード1枚を選び、そのコピーをデッキに加える',
        pick: { kind: 'deckCard', count: 1, prompt: '写すカード', candidates: deckCardsDistinct },
        resolve: function (run, choice) { const id = one(choice) || run.deck[0]; R().addCard(id, { source: 'event' }); return { text: '鏡から' + names([id]) + 'がもう1枚、滑り出てきた。', cards: [id] }; } },
      { label: '何もしない', resolve: function () { return { text: '鏡の中の自分が、先に背を向けた。' }; } }
    ] });

  // 8 迷い込んだ商人
  DB.register({ id: 'event_lost_merchant', name: '迷い込んだ商人', act: 1, lineage: 'generic',
    text: '道に迷った商人が、荷物を抱えて座り込んでいる。「出口を教えてくれるなら、同じ値打ちのものと交換してやる。……二度までだ」',
    onEnter: function (run) { run.flags.ev.merchantTrades = 0; },
    options: [
      { label: function (run) { return 'デッキのカード1枚を、同じレアリティのランダムなカードと交換する（あと' + (2 - (run.flags.ev.merchantTrades || 0)) + '回）'; },
        available: function (run) { return (run.flags.ev.merchantTrades || 0) < 2; },
        pick: { kind: 'deckCard', count: 1, prompt: '交換に出すカード', candidates: deckCardsDistinct },
        resolve: function (run, choice, rng) {
          const id = one(choice) || run.deck[0]; const d = G.CardDB.get(id);
          let cands = pool(function (c) { return c.rarity === d.rarity && c.id !== id; }); if (!cands.length) cands = pool(function (c) { return c.id !== id; });
          const got = rng.pick(cands).id;
          R().removeCard(id, { reason: 'event' }); R().addCard(got, { source: 'event' });
          run.flags.ev.merchantTrades = (run.flags.ev.merchantTrades || 0) + 1;
          return { text: names([id]) + 'を渡すと、商人は荷物から' + names([got]) + 'を出した。', cards: [got], again: run.flags.ev.merchantTrades < 2 };
        } },
      { label: '何も交換しない', resolve: function () { return { text: '出口の方向だけ教えて、別れた。' }; } }
    ] });

  // 9 店主の休憩
  DB.register({ id: 'event_shopkeeper_break', name: '店主の休憩', act: 1, lineage: 'time',
    text: '店の奥で店主が居眠りをしている。棚には値札のついたカードが並び、見張りは誰もいない。',
    onEnter: function (run, rng) { run.flags.ev.shelf = G.Shop.freeShelf(run, rng); },
    options: [
      { label: 'ショップの棚から好きなカードを1枚タダで持っていく（次のショップは価格が50%高くなる）',
        pick: { kind: 'offered', count: 1, prompt: '持っていくカード', candidates: function (run) { return run.flags.ev.shelf || []; } },
        resolve: function (run, choice) {
          const id = one(choice) || (run.flags.ev.shelf || [])[0]; if (!id) return { text: '棚は空だった。' };
          R().addCard(id, { source: 'event' }); run.flags.nextShopPriceMul = 1.5;
          return { text: names([id]) + 'を懐に入れた。……背後で、店主が片目を開けた気がする。', cards: [id] };
        } },
      { label: '代金を置いていく（次のショップが30%引き）', resolve: function (run) { run.flags.nextShopPriceMul = 0.7; return { text: 'カウンターに小銭を置いた。目を覚ました店主は、黙って帳面に何かを書いた。' }; } }
    ] });

  // 10 天秤の神殿
  DB.register({ id: 'event_scale_temple', name: '天秤の神殿', act: 1, lineage: 'doom',
    text: '巨大な天秤が、誰も乗せずに傾いている。片方の皿には「命」、もう片方には「道具」と刻まれていた。',
    options: [
      { label: '最大ライフ-10の代わりに、遺物を1つ得る', available: function (run) { return run.maxLife > 10; },
        resolve: function (run, choice, rng) {
          const cands = G.Data.relicsBy('player').filter(function (r) { return (r.category === 'generic' || r.category === 'lineage') && run.relics.indexOf(r.id) < 0; });
          if (!cands.length) return { text: '皿は空のまま動かなかった。' };
          const id = rng.pick(cands).id; R().maxLife(-10); R().addRelic(id, { source: 'event' });
          return { text: '皿に手を置くと、重みが抜けた。代わりに' + relicName(id) + 'が降りてきた。最大ライフ-10。', relic: id };
        } },
      { label: '遺物を1つ捧げて、最大ライフ+10', available: function (run) { return run.relics.length > 0; },
        pick: { kind: 'relic', count: 1, prompt: '捧げる遺物', candidates: function (run) { return run.relics.slice(); } },
        resolve: function (run, choice) { const id = one(choice) || run.relics[0]; R().removeRelic(id); R().maxLife(10); return { text: relicName(id) + 'を皿に置いた。天秤が傾き、体が軽くなった。最大ライフ+10。' }; } },
      { label: '何もしない', resolve: function () { return { text: '天秤は、こちらを値踏みするようにわずかに揺れた。' }; } }
    ] });

  // 11 時の止まった部屋
  DB.register({ id: 'event_frozen_room', name: '時の止まった部屋', act: 1, lineage: 'time',
    text: '埃が宙に浮いたまま止まっている。壁の時計は、針が逆さに刺さっていた。ここでは、次の一手だけ先に選べるらしい。',
    options: [
      { label: '次の戦闘で、必ず先攻になる', resolve: function (run) { run.flags.nextBattleFirst = true; return { text: '止まった針を一つ進めた。次の戦闘は、こちらから始まる。' }; } },
      { label: '次の戦闘で、初期手札+1枚', resolve: function (run) { run.flags.nextBattleHandBonus = true; return { text: '宙に浮いたカードを一枚つかんだ。次の戦闘の初期手札が1枚増える。' }; } }
    ] });

  // 12 壁の落書き
  DB.register({ id: 'event_graffiti', name: '壁の落書き', act: 1, lineage: 'generic',
    onEnter: function (run) {
      const m = meta();
      run.flags.ev.graffitiReceived = null;
      if (m && m.graffitiCard && G.CardDB.has(m.graffitiCard)) {
        run.flags.ev.graffitiReceived = m.graffitiCard;
        R().addCard(m.graffitiCard, { source: 'graffiti' });
        run.flags.graffitiCards = (run.flags.graffitiCards || []).concat([m.graffitiCard]);
        try { G.Save.updateMeta(function (mm) { mm.graffitiCard = null; }); } catch (e) { /* ignore */ }
      }
    },
    text: function (run) {
      const got = run.flags.ev.graffitiReceived;
      const line = (G.Texts && Array.isArray(G.Texts.graffiti) && G.Texts.graffiti.length) ? G.Texts.graffiti[0] : '「ここまで来たなら、これを使え」';
      return '壁一面の落書き。筆跡はばらばらだが、同じ言葉が何度も書かれている。' + (typeof line === 'string' ? line : '') +
        (got ? '\n落書きの下に、カードが一枚挟まっていた。' + names([got]) + 'を受け取り、デッキに加えた。' : '\nカードは挟まっていなかった。前の挑戦者は、まだ何も置いていない。');
    },
    options: [
      { label: '落書きを残し、デッキのカード1枚を置いていく（伝説まで。次のラン以降の落書きで受け取れる）',
        available: function (run) { return run.deck.length > G.Shop.DECK_MIN && deckCardsDistinct(run).some(canLeave); },
        pick: { kind: 'deckCard', count: 1, prompt: '置いていくカード', candidates: function (run) { return deckCardsDistinct(run).filter(canLeave); } },
        resolve: function (run, choice) {
          const id = one(choice) || deckCardsDistinct(run).filter(canLeave)[0]; if (!id || !canLeave(id)) return { text: 'そのカードは置いていけない。' };
          R().removeCard(id, { reason: 'graffiti' });
          try { G.Save.updateMeta(function (mm) { mm.graffitiCard = id; }); } catch (e) { /* ignore */ }
          return { text: names([id]) + 'を落書きの下に挟み、自分の言葉を一行足した。次にここへ来る誰かが、受け取るだろう。' };
        } },
      leave('落書きを指でなぞって、先へ進んだ。')
    ] });
  function canLeave(id) { const d = G.CardDB.tryGet(id); return !!d && !d.bossOnly && d.rarity !== 'taboo' && d.rarity !== 'boss' && RARITY_RANK[d.rarity] <= RARITY_RANK.legend; }

  // 13 パック工房（第2幕〜）
  DB.register({ id: 'event_pack_workshop', name: 'パック工房', act: 2, lineage: 'accel',
    text: '炉の前で、職人がカードを溶かしている。「三枚くれ。一番多い色のパックにして返す。出てくるものまでは保証しない」',
    options: [
      { label: 'デッキのカード3枚を溶かして、そのうち一番多い系統のパックを1つ作って開ける', available: function (run) { return run.deck.length >= G.Shop.DECK_MIN + 3; },
        pick: { kind: 'deckCards', count: 3, prompt: '溶かすカード3枚', candidates: deckCards },
        resolve: function (run, choice, rng) {
          let ids = many(choice).slice(0, 3);
          if (ids.length < 3) ids = run.deck.slice(0, 3);
          const count = {};
          ids.forEach(function (id) { const d = G.CardDB.get(id); count[d.lineage] = (count[d.lineage] || 0) + 1; });
          let best = null; Object.keys(count).forEach(function (l) { if (best === null || count[l] > count[best]) best = l; });
          const type = LINEAGES.indexOf(best) >= 0 ? best : 'disrupt';
          ids.forEach(function (id) { R().removeCard(id, { reason: 'event' }); });
          const cards = R().openPackIntoDeck(type, rng);
          return { text: names(ids) + 'が炉に消え、' + G.Packs.def(type).name + 'になって戻ってきた。中身は' + names(cards) + '。', cards: cards, pack: type };
        } },
      leave('炉の熱だけもらって、工房を出た。')
    ] });

  // 14 竜の巣（第2幕〜）
  DB.register({ id: 'event_dragon_nest', name: '竜の巣', act: 2, lineage: 'accel',
    text: '金貨の山の上で、竜が眠っている。寝息のたびに、山が少し崩れる。',
    options: [
      { label: '眠る竜の宝を盗む（60%で200G。失敗するとエリート「炉心の番竜」と戦う）',
        resolve: function (run, choice, rng) {
          if (rng.chance(0.6)) { R().gold(200); return { text: '足音を殺して金貨をかき集めた。200G。竜は寝返りを打っただけだった。', gold: 200, flip: 'win' }; }
          const id = G.EnemyDB.has('elite_core_dragon') ? 'elite_core_dragon' : null;
          if (!id) { return { text: '竜が目を覚ました……が、こちらを見てまた眠った。', flip: 'lose' }; }
          return { text: '金貨が一枚、音を立てて転がった。竜の目が開く。炉心の番竜が、こちらを見ている。', battle: { enemyId: id, elite: true, rewardMul: 1 }, flip: 'lose' };
        } },
      leave('寝息に合わせて後ずさり、巣を離れた。')
    ] });

  // 15 禁忌の囁き（第2幕〜）
  DB.register({ id: 'event_taboo_whisper', name: '禁忌の囁き', act: 2, lineage: 'doom',
    text: '壁の向こうから、知らない言葉で囁く声がする。意味はわからないのに、何を差し出せばいいのかだけは、はっきりわかった。',
    options: [
      { label: '禁忌カードをランダムに1枚得る。代わりに呪われた遺物を2つ押し付けられる',
        resolve: function (run, choice, rng) {
          const cands = G.Data.tabooCards().filter(function (d) { return run.deck.indexOf(d.id) < 0; });
          const all = G.Data.tabooCards();
          const pick = cands.length ? rng.pick(cands) : (all.length ? rng.pick(all) : null);
          if (!pick) return { text: '声は途切れた。' };
          R().addCard(pick.id, { source: 'event' });
          const got = [];
          for (let i = 0; i < 2; i++) { const c = randomCursed(run, rng); if (c) { R().addRelic(c, { source: 'event' }); got.push(c); } }
          return { text: '囁きに頷くと、手の中に' + names([pick.id]) + 'があった。代わりに' + got.map(relicName).join('と') + 'が、荷物の底で重くなった。', cards: [pick.id], relics: got };
        } },
      { label: '耳をふさぐ', resolve: function () { return { text: '両手で耳をふさいで通り過ぎた。声は、ふさいだ手の内側からも聞こえた。' }; } }
    ] });

  // 16 置き去りのデッキ（第2幕〜）
  DB.register({ id: 'event_abandoned_deck', name: '置き去りのデッキ', act: 2, lineage: 'copy',
    onEnter: function (run, rng) {
      const m = meta();
      const prev = ((m && m.lastRunDeck) || []).filter(function (id) { return G.CardDB.has(id) && !G.CardDB.get(id).bossOnly; });
      let cards, residual = true;
      if (prev.length >= 3) cards = rng.shuffle(prev.slice()).slice(0, 3);
      else { residual = false; const p = pool(function (d) { return d.rarity !== 'taboo'; }); cards = [0, 1, 2].map(function () { return rng.pick(p).id; }); }
      run.flags.ev.abandoned = cards; run.flags.ev.abandonedResidual = residual;
    },
    text: function (run) {
      return '床に、誰かのデッキが散らばっている。拾い上げた3枚は' + (run.flags.ev.abandonedResidual ? '縁がくすんでいて、どこかで見た手触りがした。' : '見覚えのないものだった。') + '持ち主は、戻ってこなかったらしい。';
    },
    options: [
      { label: '落ちているカード3枚のうち、好きなだけデッキに加える（1枚につきライフ-5）', available: function (run) { return run.life > 5; },
        pick: { kind: 'offered', count: 'any', prompt: '拾うカード（1枚につきライフ-5）', candidates: function (run) { return run.flags.ev.abandoned || []; }, residual: true },
        resolve: function (run, choice) {
          let ids = many(choice).filter(function (id) { return (run.flags.ev.abandoned || []).indexOf(id) >= 0; });
          const maxN = Math.max(0, Math.ceil((run.life - 1) / 5));
          ids = ids.slice(0, Math.min(ids.length, maxN));
          if (!ids.length) return { text: '手を伸ばしかけて、やめた。' };
          ids.forEach(function (id) { R().addCard(id, { source: 'event' }); if (run.flags.ev.abandonedResidual) { run.flags.residualCards = (run.flags.residualCards || []).concat([id]); } });
          R().heal(-5 * ids.length);
          return { text: names(ids) + 'を拾った。カードに触れた指先が、少し冷たくなった。ライフ-' + (5 * ids.length) + '。', cards: ids };
        } },
      leave('カードはそのままにして、床の持ち主の名残を踏まないように歩いた。')
    ] });

  // ---- helpers for screens / headless -------------------------------------------------------------------
  G.Events = {
    candidates: function (run, eventId, optIdx) { const o = DB.get(eventId).options[optIdx]; if (!o || !o.pick) return []; return o.pick.candidates(run); },
    // A sensible default choice for an option (used by the headless simulation): first candidate(s).
    firstChoice: function (run, eventId, optIdx) {
      const o = DB.get(eventId).options[optIdx]; if (!o || !o.pick) return null;
      const c = o.pick.candidates(run);
      if (o.pick.count === 'any') return c.slice(0, 1);
      return c.slice(0, o.pick.count || 1);
    },
    count: function () { return DB.count(); }
  };
})(globalThis.G = globalThis.G || {});
