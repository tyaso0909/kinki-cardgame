/* 禁域 — js/ui/screens/codex.js
   図鑑: tabs カード / 遺物 / 敵 / 日記. Unknown entries are silhouettes (？？？).
   Also installs shared meta-UI helpers on G.ui:
     G.ui.meta.progress(pct, {marks})   completion bar with cosmetic marks
     G.ui.meta.tabs(items, value, onChange)
     G.ui.meta.unknownCard(def|null)    silhouette card
     G.ui.depthPicker({depth}) → Promise<depth|undefined>   (used by menu 「ランを始める」)
*/
(function (G) {
  'use strict';
  const ui = G.ui;
  const h = ui.h;

  const header = ui.header || function (title, onBack) {
    return h('div', { class: 'screen-head' },
      h('button', { class: 'btn-icon', type: 'button', 'aria-label': '戻る', onClick: onBack }, ui.icon('back')),
      h('h1', null, title));
  };

  // ---------- shared helpers ----------
  function progress(pct, opts) {
    opts = opts || {};
    pct = Math.max(0, Math.min(100, Number(pct) || 0));
    const bar = h('div', { class: 'mprog', role: 'progressbar', 'aria-valuenow': String(pct), 'aria-valuemin': '0', 'aria-valuemax': '100' },
      h('i', { style: { '--v': pct + '%' } }));
    (opts.marks || []).forEach(function (m) {
      bar.appendChild(h('b', { class: 'mark' + (m.unlocked ? ' on' : ''), style: { left: m.pct + '%' }, title: m.name }));
    });
    return bar;
  }
  function tabs(items, value, onChange) {
    const el = h('div', { class: 'seg mtabs', role: 'tablist' });
    items.forEach(function (it) {
      const b = h('button', { type: 'button', role: 'tab', 'aria-pressed': String(it.value === value), 'aria-selected': String(it.value === value), onClick: function () {
        el.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); x.setAttribute('aria-selected', String(x === b)); });
        onChange(it.value);
      } }, it.label, it.count != null ? h('small', null, it.count) : null);
      el.appendChild(b);
    });
    return el;
  }
  function unknownCard(def, opts) {
    opts = opts || {};
    const lin = def && def.lineage && ui.labels.LINEAGE[def.lineage] ? def.lineage : 'generic';
    const el = h(opts.onClick ? 'button' : 'div', { class: 'card size-' + (opts.size || 'm') + ' lin-' + lin + ' type-' + ((def && def.type) || 'spell') + ' rar-common unknown', type: opts.onClick ? 'button' : null, 'aria-label': '未発見のカード', onClick: opts.onClick || null },
      h('div', { class: 'card-frame' },
        h('div', { class: 'card-art' }, ui.lineageGlyph(lin)),
        h('div', { class: 'card-name' }, '？？？')));
    return el;
  }
  function empty(text) { return h('div', { class: 'mempty' }, text); }
  function count(have, total) { return h('span', { class: 'mcount t-num' }, String(have), h('small', null, ' / ' + total)); }

  ui.meta = Object.assign(ui.meta || {}, { progress: progress, tabs: tabs, unknownCard: unknownCard, empty: empty, count: count });

  // ---------- depth picker ----------
  function depthPicker(opts) {
    opts = opts || {};
    const D = G.Depth;
    if (!D) return Promise.resolve(0);
    const max = D.unlocked();
    let sel = Math.min(opts.depth != null ? D.clamp(opts.depth) : D.current(), max);
    const desc = h('div', { class: 'dp-desc' });
    const list = h('div', { class: 'dp-list', role: 'listbox' });
    function renderDesc() {
      ui.clear(desc);
      const d = D.describe(sel);
      desc.appendChild(h('div', { class: 'dp-title' }, h('b', { class: 't-num' }, String(sel)), h('span', null, sel === 0 ? '通常の難易度' : '引き継ぐ条件 ' + d.lines.length + '件')));
      const ul = h('ul', { class: 'dp-lines' });
      d.lines.forEach(function (t, i) { ul.appendChild(h('li', { class: i === d.lines.length - 1 && sel > 0 ? 'new' : '' }, t)); });
      desc.appendChild(ul);
      if (sel === max && max < D.MAX) desc.appendChild(h('p', { class: 't-dim t-s' }, 'この深度をクリアすると、深度' + (max + 1) + 'が開く。'));
    }
    function renderList() {
      ui.clear(list);
      for (let i = 0; i <= D.MAX; i++) {
        const locked = i > max;
        const b = h('button', { type: 'button', class: 'dp-cell' + (i === sel ? ' sel' : '') + (locked ? ' locked' : '') + (D.hasCleared(i) ? ' cleared' : ''), role: 'option', 'aria-selected': String(i === sel), disabled: locked, 'aria-label': '深度' + i + (locked ? '（未解放）' : ''), onClick: function () { sel = i; renderList(); renderDesc(); } }, h('span', { class: 't-num' }, String(i)));
        list.appendChild(b);
      }
    }
    renderList(); renderDesc();
    const body = h('div', { class: 'dp' }, list, desc);
    return ui.modal({ title: '禁域の深度', body: body, buttons: [
      { label: 'やめる', value: undefined, ghost: true },
      { label: '出発する', value: 'ok', primary: true },
    ] }).then(function (v) {
      if (v !== 'ok') return undefined;
      D.setCurrent(sel);
      return sel;
    });
  }
  ui.depthPicker = depthPicker;

  // ---------- codex screen ----------
  const LIN_ORDER = ['accel', 'cycle', 'chain', 'time', 'copy', 'doom', 'generic'];
  const TYPE_ORDER = ['monster', 'spell', 'crest', 'field'];
  const RAR_ORDER = ['common', 'rare', 'legend', 'taboo', 'boss'];
  const RELIC_CAT = [['starter', '初期遺物'], ['generic', '汎用遺物'], ['lineage', '系統別遺物'], ['boss', 'ボス遺物'], ['cursed', '呪われた遺物']];
  const RELIC_RAR_CAT = { start: 'starter', common: 'generic', rare: 'generic', legend: 'generic', boss: 'boss', cursed: 'cursed' };
  const KIND_JP = { normal: '通常敵', elite: 'エリート', boss: 'ボス' };

  function cardsTab(state) {
    const C = G.Codex;
    const pool = C ? C.cardPool() : [];
    const grid = h('div', { class: 'card-grid codex-grid' });
    const info = h('div', { class: 'gallery-count' });
    function render() {
      ui.clear(grid);
      const list = pool.filter(function (d) {
        return (state.lin === 'all' || d.lineage === state.lin) && (state.type === 'all' || d.type === state.type) && (state.rar === 'all' || d.rarity === state.rar);
      }).sort(function (a, b) {
        return LIN_ORDER.indexOf(a.lineage) - LIN_ORDER.indexOf(b.lineage) || RAR_ORDER.indexOf(a.rarity) - RAR_ORDER.indexOf(b.rarity) || (Number(a.cost) || 0) - (Number(b.cost) || 0) || (a.id < b.id ? -1 : 1);
      });
      const have = list.filter(function (d) { return C.has('cards', d.id); }).length;
      ui.clear(info); info.appendChild(count(have, list.length)); info.appendChild(h('span', null, ' 枚'));
      if (!list.length) { grid.appendChild(empty('該当するカードはありません')); return; }
      list.forEach(function (d) {
        if (C.has('cards', d.id)) grid.appendChild(ui.renderCard(d, { size: 'm', onClick: function () { ui.cardDetail(d); } }));
        else grid.appendChild(unknownCard(d, { onClick: function () { ui.toast('まだ見つけていない'); } }));
      });
    }
    function seg(key, options) {
      const el = h('div', { class: 'seg', role: 'group' });
      [['all', 'すべて']].concat(options).forEach(function (pair) {
        const v = pair[0], label = pair[1];
        const b = h('button', { type: 'button', class: key === 'lin' && v !== 'all' ? 'lin lin-' + v : '', 'aria-pressed': String(state[key] === v), onClick: function () {
          state[key] = v; el.querySelectorAll('button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); }); render();
        } }, key === 'lin' && v !== 'all' ? ui.lineageGlyph(v, { style: 'width:14px;height:14px;margin-right:4px;vertical-align:-2px' }) : null, label);
        el.appendChild(b);
      });
      return el;
    }
    render();
    return h('div', { class: 'codex-tab' },
      h('div', { class: 'gallery-filters' },
        seg('lin', LIN_ORDER.map(function (k) { return [k, ui.labels.LINEAGE[k].name]; })),
        seg('type', TYPE_ORDER.map(function (k) { return [k, ui.labels.TYPE[k]]; })),
        seg('rar', RAR_ORDER.map(function (k) { return [k, ui.labels.RARITY[k]]; }))),
      info, grid);
  }

  function relicsTab() {
    const C = G.Codex;
    const pool = C ? C.relicPool() : [];
    const wrap = h('div', { class: 'codex-tab' });
    RELIC_CAT.forEach(function (pair) {
      const cat = pair[0], label = pair[1];
      const list = pool.filter(function (r) { return (r.category || RELIC_RAR_CAT[r.rarity] || 'generic') === cat; });
      if (!list.length) return;
      const have = list.filter(function (r) { return C.has('relics', r.id); }).length;
      wrap.appendChild(h('div', { class: 'msection' }, h('span', null, label), count(have, list.length)));
      const ul = h('ul', { class: 'relic-list' });
      list.forEach(function (r) {
        const seen = C.has('relics', r.id);
        const lin = r.lineage && ui.labels.LINEAGE[r.lineage] ? r.lineage : null;
        ul.appendChild(h('li', { class: 'relic-row' + (seen ? '' : ' unknown') + (lin ? ' lin-' + lin : ''), onClick: seen ? function () { relicDetail(r); } : null },
          h('div', { class: 'relic-mark' }, lin ? ui.lineageGlyph(lin) : h('span', null, cat === 'cursed' ? '呪' : cat === 'boss' ? '王' : '遺')),
          h('div', { class: 'relic-body' },
            h('div', { class: 'relic-name' }, seen ? r.name : '？？？'),
            h('div', { class: 'relic-text' }, seen ? r.text : (cat === 'cursed' ? '呪われた遺物。手に入れると登録される。' : 'まだ手に入れていない。'))),
        ));
      });
      wrap.appendChild(ul);
    });
    if (!pool.length) wrap.appendChild(empty('遺物のデータがありません'));
    return wrap;
  }
  function relicDetail(r) {
    const body = h('div', { class: 'relic-detail' + (r.lineage ? ' lin-' + r.lineage : '') },
      h('p', null, r.text),
      r.drawback ? h('p', { class: 'relic-drawback' }, r.drawback) : null,
      h('dl', null, h('dt', null, '種別'), h('dd', null, (RELIC_CAT.find(function (p) { return p[0] === (r.category || RELIC_RAR_CAT[r.rarity]); }) || ['', '遺物'])[1]),
        r.lineage ? h('dt', null, '系統') : null, r.lineage ? h('dd', null, ui.labels.LINEAGE[r.lineage] ? ui.labels.LINEAGE[r.lineage].name : r.lineage) : null));
    return ui.modal({ title: r.name, body: body });
  }

  function enemiesTab() {
    const C = G.Codex;
    const pool = C ? C.enemyPool() : [];
    const wrap = h('div', { class: 'codex-tab' });
    ['normal', 'elite', 'boss'].forEach(function (kind) {
      const list = pool.filter(function (e) { return (e.kind || e.tier) === kind; });
      if (!list.length) return;
      const have = list.filter(function (e) { return C.has('enemies', e.id); }).length;
      wrap.appendChild(h('div', { class: 'msection' }, h('span', null, KIND_JP[kind]), count(have, list.length)));
      const ul = h('ul', { class: 'enemy-list kind-' + kind });
      list.forEach(function (e) {
        const entry = C.enemyEntry(e.id);
        const seen = entry && entry.seen;
        const lin = Array.isArray(e.lineage) && e.lineage[0] && ui.labels.LINEAGE[e.lineage[0]] ? e.lineage[0] : 'generic';
        ul.appendChild(h('li', { class: 'enemy-row' + (seen ? '' : ' unknown') + ' lin-' + lin },
          h('button', { type: 'button', class: 'enemy-btn', onClick: function () { if (seen) enemyDetail(entry); else ui.toast('まだ倒していない'); } },
            h('div', { class: 'enemy-mark' }, seen ? ui.lineageGlyph(lin) : h('span', null, '？')),
            h('div', { class: 'enemy-body' },
              h('div', { class: 'enemy-name' }, seen ? e.name : '？？？', h('small', null, '第' + (e.act || 1) + '幕')),
              h('div', { class: 'enemy-sub' }, seen ? (e.teaches || e.introText || '') : (KIND_JP[kind] + '。倒すと登録される。'))),
            seen && kind !== 'normal' ? ui.icon('chevron') : null)));
      });
      wrap.appendChild(ul);
    });
    if (!pool.length) wrap.appendChild(empty('敵のデータがありません'));
    return wrap;
  }
  function enemyDetail(entry) {
    const e = entry.def;
    const body = h('div', { class: 'enemy-detail' },
      e.introText ? h('p', { class: 'enemy-intro' }, e.introText) : null,
      h('dl', null,
        h('dt', null, 'ライフ'), h('dd', { class: 't-num' }, String(e.life)),
        e.teaches ? h('dt', null, '教えること') : null, e.teaches ? h('dd', null, e.teaches) : null,
        e.forecastText ? h('dt', null, '予告') : null, e.forecastText ? h('dd', null, e.forecastText) : null),
      entry.trumps.length ? h('div', { class: 'msection' }, h('span', null, '切り札'), h('small', { class: 't-dim' }, '奪えない')) : null,
      entry.trumps.length ? h('div', { class: 'trump-row' }, entry.trumps.map(function (d) { return ui.renderCard(d, { size: 's', onClick: function () { ui.cardDetail(d); } }); })) : null,
      e.lastWords ? h('blockquote', { class: 'r-words' }, e.lastWords) : null,
      e.diary ? h('div', { class: 'r-diary' }, h('span', null, '日記の切れ端'), h('p', null, e.diary)) : null);
    return ui.modal({ title: e.name, body: body, wide: true });
  }

  function diaryTab(state) {
    const C = G.Codex;
    const wrap = h('div', { class: 'codex-tab' });
    const total = C ? C.diaryPool().length : 0;
    const list = C ? C.diaryList({ sort: state.diarySort }) : [];
    const head = h('div', { class: 'diary-head' },
      tabs([{ value: 'found', label: '拾った順' }, { value: 'day', label: '日付' }], state.diarySort, function (v) { state.diarySort = v; redraw(); }),
      h('div', { class: 'gallery-count' }, count(list.length, total), ' 枚'));
    const body = h('div', { class: 'diary-body' });
    function redraw() {
      ui.clear(body);
      const items = C.diaryList({ sort: state.diarySort });
      if (!items.length) { body.appendChild(empty('まだ一枚も拾っていない。イベントの「？」のマスで、たまに見つかる。')); }
      items.forEach(function (d, i) {
        const slip = h('div', { class: 'diary-slip' + (d.torn ? ' torn' : '') + (d.boss ? ' boss' : ''), style: { '--r': (((i * 7) % 5) - 2) * 0.5 + 'deg' } },
          h('div', { class: 'slip-meta' }, d.day != null ? h('span', { class: 't-num' }, d.day + '日目') : h('span', null, d.boss ? d.bossName || 'ボス' : '日付なし'), h('span', { class: 'slip-no t-num' }, d.id.replace(/^diary_/, '').replace(/^boss_/, '')) ),
          h('p', null, d.text, d.torn ? h('span', { class: 'slip-tear', 'aria-label': 'ここで途切れている' }) : null));
        body.appendChild(slip);
      });
      const left = total - items.length;
      if (left > 0 && items.length) body.appendChild(h('p', { class: 't-dim t-s t-center' }, 'あと' + left + '枚、どこかに落ちている。'));
      if (C.secretGraffitiUnlocked() && G.Texts && G.Texts.secretGraffiti) {
        body.appendChild(h('div', { class: 'secret-graffiti' }, h('span', null, '壁に増えた落書き'), h('p', null, G.Texts.secretGraffiti)));
      }
    }
    redraw();
    wrap.appendChild(head); wrap.appendChild(body);
    return wrap;
  }

  ui.app.register('codex', {
    mount(root, params) {
      const C = G.Codex;
      const state = { tab: (params && params.tab) || 'cards', lin: 'all', type: 'all', rar: 'all', diarySort: 'found' };
      const comp = C ? C.completion() : null;
      const cos = C ? C.cosmetics() : [];
      const top = h('div', { class: 'codex-top panel' },
        h('div', { class: 'codex-pct' }, h('b', { class: 't-num' }, String(comp ? comp.total.pct : 0)), h('span', null, '％'), h('small', { class: 't-dim' }, '達成率')),
        progress(comp ? comp.total.pct : 0, { marks: cos }),
        h('div', { class: 'codex-cos' }, cos.map(function (c) {
          return h('span', { class: 'cos' + (c.unlocked ? ' on' : ''), title: c.text }, h('b', { class: 't-num' }, c.pct + '%'), c.name);
        })));
      const tabsEl = tabs([
        { value: 'cards', label: 'カード', count: comp ? comp.cards.have : null },
        { value: 'relics', label: '遺物', count: comp ? comp.relics.have : null },
        { value: 'enemies', label: '敵', count: comp ? comp.enemies.have : null },
        { value: 'diary', label: '日記', count: comp ? comp.diary.have : null },
      ], state.tab, function (v) { state.tab = v; show(); });
      const pane = h('div', { class: 'codex-pane' });
      function show() {
        ui.clear(pane);
        if (!C) { pane.appendChild(empty('図鑑のデータがありません')); return; }
        if (state.tab === 'cards') pane.appendChild(cardsTab(state));
        else if (state.tab === 'relics') pane.appendChild(relicsTab());
        else if (state.tab === 'enemies') pane.appendChild(enemiesTab());
        else pane.appendChild(diaryTab(state));
      }
      show();
      root.appendChild(h('div', { class: 'col' }, header('図鑑', function () { ui.app.back('menu'); }), top, tabsEl, pane));
    },
    unmount() {},
  });
})(globalThis.G = globalThis.G || {});
