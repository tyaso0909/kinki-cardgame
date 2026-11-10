/* 禁域 — js/ui/demo_cards.js  (DEV ONLY, loaded last)
   1. If G.CardDB is missing or empty, registers sample CardDefs (one per
      lineage / type / rarity, wording from SPEC) so the card view can be
      previewed without the data files.
   2. Registers the hidden `cardgallery` screen (reachable from 設定).
*/
(function (G) {
  'use strict';
  const ui = G.ui;
  const h = ui.h;

  // ---------- minimal CardDB shim (only when the engine has not provided one) ----------
  if (!G.CardDB) {
    const map = new Map();
    G.CardDB = {
      _demoShim: true,
      register(def) { map.set(def.id, def); return def; },
      get(id) { return map.get(id) || null; },
      all() { return Array.from(map.values()); },
    };
  }

  const SAMPLES = [
    { id: 'demo_accel_01', name: '火の粉の妖精', type: 'monster', lineage: 'accel', role: 'fuel', rarity: 'common', cost: 0, atk: 1, hp: 1, text: '召喚時、マナ+1' },
    { id: 'demo_accel_13', name: '焚べ火の祭壇', type: 'crest', lineage: 'accel', role: 'engine', rarity: 'common', cost: 1, text: '自分のターン中、自分のモンスターを何度でも破壊できる', flavor: '火は何度でも灯る。灯す者がいる限り。' },
    { id: 'demo_accel_14', name: '火喰い竜', type: 'monster', lineage: 'accel', role: 'finisher', rarity: 'rare', cost: 7, atk: 5, hp: 5, keywords: ['rush'], tags: ['dragon'], text: 'このターンに得たマナ1につき、このカードのコスト-1' },
    { id: 'demo_accel_20', name: '竜脈の火山', type: 'field', lineage: 'accel', role: 'engine', rarity: 'rare', cost: 2, text: 'お互い、マナを得るたびさらに+1。展開時：マナ+2' },
    { id: 'demo_accel_23', name: '巡る不死鳥', type: 'monster', lineage: 'accel', role: 'engine', rarity: 'legend', cost: 0, atk: 1, hp: 1, text: '召喚時、マナ+1。場を離れたとき、手札に戻る', flavor: '死ぬのにも飽きた鳥。' },
    { id: 'demo_accel_25', name: '天井なき空', type: 'crest', lineage: 'accel', role: 'engine', rarity: 'taboo', cost: 7, text: 'マナがターン終了時に消えなくなる。自分のターン開始時、マナが2倍になる' },
    { id: 'demo_cycle_03', name: '渦潮の番人', type: 'monster', lineage: 'cycle', role: 'fuel', rarity: 'common', cost: 2, atk: 1, hp: 3, keywords: ['guard'], text: '破壊時、カードを2枚引く' },
    { id: 'demo_cycle_09', name: '泡沫の呪文', type: 'spell', lineage: 'cycle', role: 'fuel', rarity: 'common', cost: 0, reprise: 0, text: 'カードを1枚引く。再演（0）' },
    { id: 'demo_cycle_10', name: '忘却の波', type: 'spell', lineage: 'cycle', role: 'disrupt', rarity: 'common', cost: 2, reserve: true, text: '相手の次のターン開始時、相手は手札を2枚選んで山札の一番下に戻す' },
    { id: 'demo_cycle_24', name: '全知の雫', type: 'spell', lineage: 'cycle', role: 'fuel', rarity: 'legend', cost: 3, text: '山札をすべて見て、好きなカード3枚を手札に加える。その後、山札をシャッフルする' },
    { id: 'demo_chain_07', name: '雷撃の連打', type: 'spell', lineage: 'chain', role: 'finisher', rarity: 'common', cost: 1, text: '連鎖数と同じダメージを与える' },
    { id: 'demo_chain_15', name: '嵐の大精霊', type: 'monster', lineage: 'chain', role: 'engine', rarity: 'rare', cost: 5, atk: 3, hp: 5, text: '常在：自分がカードを使うたび、マナ+1' },
    { id: 'demo_time_07', name: '時限爆弾', type: 'spell', lineage: 'time', role: 'finisher', rarity: 'common', cost: 1, timed: 2, text: '時限2：相手に10ダメージを与える' },
    { id: 'demo_time_25', name: '止まった世界', type: 'crest', lineage: 'time', role: 'engine', rarity: 'taboo', cost: 8, text: '相手のターンが来なくなる。自分のターン開始時、自分のライフを5失う' },
    { id: 'demo_copy_02', name: '霧の双子', type: 'monster', lineage: 'copy', role: 'fuel', rarity: 'common', cost: 2, atk: 1, hp: 1, text: '召喚時、このカードの幻影を1体出す' },
    { id: 'demo_copy_17', name: '鏡の湖', type: 'field', lineage: 'copy', role: 'engine', rarity: 'rare', cost: 3, text: 'お互い、魔法はすべて2回発動する。展開時：カードを1枚引く' },
    { id: 'demo_copy_23', name: '万象を映す魔神', type: 'monster', lineage: 'copy', role: 'finisher', rarity: 'legend', cost: 8, atk: 0, hp: 0, keywords: ['rush'], text: '召喚時、攻撃力と体力が「自分の場のモンスター（幻影を含む）の数×3」になる' },
    { id: 'demo_doom_05', name: '終末の鍵・第一', type: 'spell', lineage: 'doom', role: 'finisher', rarity: 'common', cost: 1, key: 1, text: '封印ゾーンに置く。カードを1枚引く' },
    { id: 'demo_doom_17', name: '屍山の巨人', type: 'monster', lineage: 'doom', role: 'finisher', rarity: 'rare', cost: 6, atk: 'X', hp: 'X', keywords: ['rush'], text: 'Xは自分の墓地のモンスターの数×2' },
    { id: 'demo_doom_25', name: '終末の預言書', type: 'crest', lineage: 'doom', role: 'finisher', rarity: 'taboo', cost: 9, timed: 3, text: '時限3：自分が勝利する。この時限カウントは、減らす効果を受けない。このカードは除去されない' },
    { id: 'demo_generic_01', name: '封じの番兵', type: 'monster', lineage: 'generic', role: 'disrupt', rarity: 'common', cost: 2, atk: 2, hp: 3, keywords: ['guard'], text: '常在：相手は墓地からカードを使えない' },
    { id: 'demo_generic_12', name: '静寂の神殿', type: 'field', lineage: 'generic', role: 'disrupt', rarity: 'common', cost: 2, text: 'お互い、1ターンに使えるカードは5枚まで。展開時：カードを1枚引く' },
    { id: 'demo_boss1_01', name: 'ぜんまい仕掛けの不死鳥', type: 'monster', lineage: 'accel', role: 'engine', rarity: 'boss', bossOnly: true, cost: 0, atk: 1, hp: 1, text: '召喚時、マナ+1。場を離れたとき、手札に戻る', flavor: '……あと一周で、終わったのに。' },
    { id: 'demo_boss1_02', name: '最後の一周', type: 'spell', lineage: 'accel', role: 'finisher', rarity: 'boss', bossOnly: true, cost: 1, text: 'このターンに自分が得たマナの合計と同じダメージを与える' },
  ];

  function allCards() {
    try {
      if (G.CardDB && typeof G.CardDB.all === 'function') return G.CardDB.all() || [];
    } catch (e) { /* ignore */ }
    return [];
  }
  if (allCards().length === 0 && typeof G.CardDB.register === 'function') {
    SAMPLES.forEach((d) => { try { G.CardDB.register(d); } catch (e) { console.warn('demo card skipped', d.id, e); } });
    G.CardDB._demoSamples = true;
  }

  // ---------- gallery screen ----------
  const L = ui.labels;
  const LIN_ORDER = ['accel', 'cycle', 'chain', 'time', 'copy', 'doom', 'generic'];
  const TYPE_ORDER = ['monster', 'spell', 'crest', 'field'];
  const RAR_ORDER = ['common', 'rare', 'legend', 'taboo', 'boss'];

  ui.app.register('cardgallery', {
    mount(root) {
      const state = { lin: 'all', type: 'all', rar: 'all' };
      const cards = allCards();
      const grid = h('div', { class: 'card-grid' });
      const count = h('div', { class: 'gallery-count' });

      function render() {
        ui.clear(grid);
        const list = cards.filter((d) => {
          const lin = d.bossOnly ? d.lineage : d.lineage;
          const rar = d.bossOnly ? 'boss' : d.rarity;
          return (state.lin === 'all' || lin === state.lin) &&
                 (state.type === 'all' || d.type === state.type) &&
                 (state.rar === 'all' || rar === state.rar);
        }).sort((a, b) => LIN_ORDER.indexOf(a.lineage) - LIN_ORDER.indexOf(b.lineage) ||
                          RAR_ORDER.indexOf(a.rarity) - RAR_ORDER.indexOf(b.rarity) ||
                          (Number(a.cost) || 0) - (Number(b.cost) || 0));
        count.textContent = list.length + ' 枚 / 全 ' + cards.length + ' 枚' + (G.CardDB._demoSamples ? '（サンプルデータ）' : '');
        if (!list.length) {
          grid.appendChild(h('div', { class: 'gallery-empty' }, '該当するカードはありません'));
          return;
        }
        list.forEach((d) => grid.appendChild(ui.renderCard(d, { size: 'm', onClick: () => ui.cardDetail(d) })));
      }

      function segFilter(key, options) {
        const el = h('div', { class: 'seg', role: 'group' });
        const all = [['all', 'すべて']].concat(options);
        all.forEach(([v, label]) => {
          const b = h('button', {
            type: 'button',
            class: key === 'lin' && v !== 'all' ? 'lin lin-' + v : '',
            'aria-pressed': String(state[key] === v),
            onClick: () => {
              state[key] = v;
              el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
              render();
            },
          }, key === 'lin' && v !== 'all' ? ui.lineageGlyph(v, { style: 'width:14px;height:14px;margin-right:4px;vertical-align:-2px' }) : null, label);
          el.appendChild(b);
        });
        return el;
      }

      root.appendChild(h('div', { class: 'col' },
        ui.header('カード一覧', () => ui.app.back('settings')),
        h('div', { class: 'gallery-filters' },
          segFilter('lin', LIN_ORDER.map((k) => [k, L.LINEAGE[k].name])),
          segFilter('type', TYPE_ORDER.map((k) => [k, L.TYPE[k]])),
          segFilter('rar', RAR_ORDER.map((k) => [k, L.RARITY[k]])),
        ),
        count,
        grid,
      ));
      render();
    },
    unmount() {},
  });
})(globalThis.G = globalThis.G || {});
