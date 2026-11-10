/* 禁域 — js/data/texts.js
   Flavor text pools (SPEC 世界観とテキスト).
   G.Texts.diary            30 fragments [{id, text, day?:number, torn?:true}]  (ids diary_01..30)
   G.Texts.allDiary()       diary + the 5 boss-specific fragments from G.EnemyDB ({id:'diary_<bossId>', boss:bossId})
   G.Texts.diaryById(id)
   G.Texts.shopLines        店主のひとこと
   G.Texts.graffiti         ロード画面の落書き
   G.Texts.secretGraffiti   the one extra graffiti shown once all 30 fragments are collected
   G.Texts.loading          short loading lines
   G.Texts.achievementTitles  {achievementId: 称号}
   G.Texts.lastWordsFallback  used when an enemy has no lastWords
   G.Texts.pick(list, rng?)   deterministic pick (rng) or Date-based rotation (no Math.random)

   Tone (SPEC): 答えを出さない / 固有名詞少なめ / 日付で時系列をにおわせる / ギャグも混ぜる.
   The 裏設定 is never stated; it only leaks through the margins.
*/
(function (G) {
  'use strict';

  const T = (G.Texts = G.Texts || {});

  // ---------------------------------------------------------------
  // 日記の切れ端（30枚）。拾う順番はばらばら。`day` は並べ替え用（無いものは末尾）。
  // ---------------------------------------------------------------
  const diary = [
    { id: 'diary_01', day: 1,  text: '一日目。門はなかった。気づいたら中にいた。帰り道も、たぶんない。' },
    { id: 'diary_02', day: 2,  text: '二日目。落ちているカードを拾った。拾うたびに、袋が軽くなる気がする。重くなるはずなのに。' },
    { id: 'diary_03', day: 3,  text: '三日目。拾ったカードを使ったら、竜が二匹出た。頼んだのは一匹だ。' },
    { id: 'diary_04', day: 4,  text: '四日目。壁に落書きをした。字が下手なのは、手が震えていたからだ。寒かったからだ。' },
    { id: 'diary_05', day: 6,  text: '六日目。店主に名前を聞いたら、笑って値段を言った。' },
    { id: 'diary_06', day: 7,  text: '七日目。初めて無限を見た。向こうが回していた。見ているだけで、一晩が終わった。' },
    { id: 'diary_07', day: 8,  text: '八日目。店の猫がこちらの手札を見て鳴いた。次のターン、その一枚が使えなくなった。猫のせいにしておく。' },
    { id: 'diary_08', day: 9,  text: '九日目。骨の指輪を拾った。はめたら、はまったままになった。まあいい。' },
    { id: 'diary_09', day: 10, text: '十日目。ここに落ちているものは、全部どこかで「やりすぎ」と言われたものらしい。店主がそう言っていた。店主の話は半分でいい。' },
    { id: 'diary_10', day: 12, text: '十二日目。今日の店主は昨日と顔が違う。品ぞろえは同じ。' },
    { id: 'diary_11', day: 13, text: '十三日目。雷を数えていたら、三十まで数えたところで分からなくなった。向こうはまだ数えている。' },
    { id: 'diary_12', day: 15, text: '十五日目。砂時計を逆さにしたら、一日が二回来た。二回目の朝食は、一回目よりうまかった。' },
    { id: 'diary_13', day: 17, text: '十七日目。静かな館で棚を見た。空いている棚に、札が刺さっていた。読まなかった。読まなかったことにした。' },
    { id: 'diary_14', day: 19, text: '十九日目。休憩所で火を起こした。何も頼んでいないのに、火は三回灯った。' },
    { id: 'diary_15', day: 20, text: '二十日目。手札が七枚になると、一枚が消える。消えた一枚はどこへ行くのか。店主は知っていそうな顔をした。' },
    { id: 'diary_16', day: 22, text: '二十二日目。幻影の自分と並んで座った。向こうのほうが、姿勢がいい。' },
    { id: 'diary_17', day: 24, text: '二十四日目。地図が嘘をついた。三回目だ。それでも地図を見る。ほかに見るものがない。' },
    { id: 'diary_18', day: 26, text: '二十六日目。あいつの工房から、歯車の音がする。もう何日も、同じリズムだ。' },
    { id: 'diary_19', day: 28, text: '二十八日目。ループの回数を数える係を、幻影に任せた。幻影は夜に消えるので、毎晩やり直しになる。' },
    { id: 'diary_20', day: 30, text: '三十日目。一日の長さが分からなくなってきた。この日記の日付も、たぶん合っていない。' },
    { id: 'diary_21', day: 33, text: '三十三日目。今日はいいことがあった。何だったか忘れたが、いいことだった。' },
    { id: 'diary_22', day: 35, text: '三十五日目。前の挑戦者の束を拾った。知っているカードばかりだった。知っている並びだった。' },
    { id: 'diary_23', day: 37, text: '三十七日目。鏡の部屋には入らないと決めた。決めたのは、たしか二回目だ。' },
    { id: 'diary_24', day: 40, text: '四十日目。鏡の向こうの俺が、俺より先に砂時計を使った。' },
    { id: 'diary_25', day: 41, text: '四十一日目。鏡に背を向けて寝た。朝、鏡のほうを向いていた。寝相の問題だと思う。' },
    { id: 'diary_26', day: 44, text: '四十四日目。禁忌を一枚、手に入れた。手に入れた、というより、向こうから来た。' },
    { id: 'diary_27', day: 47, text: '四十七日目。店主が「そろそろだね」と言った。何がそろそろなのかは聞かなかった。聞いたら答える気がした。' },
    { id: 'diary_28', day: 50, text: '五十日目。壁の絵に、自分の手を描き足した。何本目かは数えていない。' },
    { id: 'diary_29', text: '（日付なし）足音がする。俺の足音と同じ速さで。立ち止まると、向こうも止まる。たぶん俺の足音だ。たぶん。' },
    { id: 'diary_30', torn: true, text: 'ここに捨てられたのは、カードじゃなくて' },
  ];

  // ---------------------------------------------------------------
  // 店主のひとこと
  // ---------------------------------------------------------------
  const shopLines = [
    '禁忌？ 売るなら買うよ。使うなら止めないよ。',
    'いらっしゃい。顔は覚えないことにしてる。長続きのコツだ。',
    '値札は読まなくていい。どうせ買うんだろう。',
    '返品は受けない。返品しに来た客は、まだ一人もいないけどね。',
    'そのカード、前の持ち主も気に入ってたよ。どこへ行ったかは聞くな。',
    'この店は動かない。動いているのは、あんたたちのほうだ。',
    '遺物は体に悪い。だから売れる。',
    '鏡の前では値切らないでくれ。向こうのあんたが、先に値切る。',
    'うちの猫を撫でるなら、手札を伏せてからにしてくれ。',
    '在庫は毎日同じに見えるだろう？ 俺もそう思う。',
    '何周目だい。……いや、答えなくていい。顔に書いてある。',
    '売りたいものがあるなら出しな。思い出は買い取れないが、カードなら。',
    '砂時計は割れやすい。割れた砂時計は、もっと高く売れる。',
    '今日はよく燃える日だ。竜を買っていくかい。',
    'つり銭は数えてくれ。俺が数えると、たまに増える。',
  ];

  // ---------------------------------------------------------------
  // 壁の落書き（ロード画面）
  // ---------------------------------------------------------------
  const graffiti = [
    'ここで無限を見た者、手を挙げろ',
    '祭壇は売るな。買え。',
    '三周目で止めろ。四周目は向こうが止める。',
    '鏡の奥の奴、先に砂時計を使った',
    '禁忌は捨てたんじゃない。ここに置いたんだ。',
    '店主の顔を覚えている人、連絡ください',
    '左の道は正しかった。前回は。',
    '不死鳥は焼いても戻ってくる。除外しろ。',
    '手札七枚目は、どこへ行く',
    'ここから先、予告なし（嘘）',
    '雷を数えるな。数えると負ける。',
    '鍵は四つまで集めていい。五つ目は向こうの番だ。',
    '猫に手札を見せるな',
    '帰り道を知っている奴は、ここに書いていない',
    '俺の束、拾った奴は大事にしてくれ',
    '「あと一周」は信じるな',
    '上書きできないフィールドはない。たぶん。',
    'この壁の手の絵、どれが自分のか分からなくなった',
  ];

  // The one line that appears only when all 30 fragments are collected.
  // SPEC: 答えは出さず、においを少し強めるだけ。
  const secretGraffiti = '手を挙げた者、全員同じ手だった';

  // ---------------------------------------------------------------
  // ロード画面の短い一言
  // ---------------------------------------------------------------
  const loading = [
    '封を解いている',
    '前の挑戦者の足跡を消している',
    '歯車に油を差している',
    '鏡を拭いている',
    '店主が顔を選んでいる',
    '雷雲を集めている',
    '棚の空きを数えている',
    '砂時計をひっくり返している',
  ];

  // 挑戦（実績）の称号。id は G.Achievements と共通。
  const achievementTitles = {
    ach_hundred_damage: '百雷',
    ach_chain_50: '嵐を呼ぶ者',
    ach_infinite_loop: '永久機関',
    ach_special_win_boss: '封印の主',
    ach_mirror_return: '鏡返し',
    ach_unreflected: '映らぬ者',
    ach_taboo_collector: '禁忌の蒐集家',
    ach_entrusted: '託された者',
    ach_depth_10: '禁域を越えた者',
  };

  const lastWordsFallback = [
    '……ここまでか。',
    '次の奴に、伝えておいてくれ。',
    'もう一周、できると思ったんだが。',
    '……まあ、こういう日もある。',
  ];

  // ---------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------
  function bossFragments() {
    const out = [];
    try {
      if (!G.EnemyDB || typeof G.EnemyDB.all !== 'function') return out;
      G.EnemyDB.all().forEach(function (e) {
        if (!e || !e.diary) return;
        if (!(e.isBoss || e.kind === 'boss' || e.tier === 'boss')) return;
        out.push({ id: 'diary_' + e.id, text: e.diary, boss: e.id, bossName: e.name });
      });
    } catch (e) { /* data not loaded */ }
    return out;
  }
  function allDiary() { return diary.slice().concat(bossFragments()); }
  function diaryById(id) {
    return allDiary().find(function (d) { return d.id === id; }) || null;
  }
  // Deterministic pick: with an RNG use it; otherwise rotate by day-of-year (no Math.random in logic code).
  function pick(list, rng) {
    if (!Array.isArray(list) || !list.length) return null;
    if (rng && typeof rng.int === 'function') return list[rng.int(list.length)];
    const now = new Date();
    const doy = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
    return list[(doy + now.getHours()) % list.length];
  }

  T.diary = diary;
  T.shopLines = shopLines;
  T.graffiti = graffiti;
  T.secretGraffiti = secretGraffiti;
  T.loading = loading;
  T.achievementTitles = achievementTitles;
  T.lastWordsFallback = lastWordsFallback;
  T.allDiary = allDiary;
  T.bossFragments = bossFragments;
  T.diaryById = diaryById;
  T.pick = pick;
  T.DIARY_TOTAL = 30;
})(globalThis.G = globalThis.G || {});
