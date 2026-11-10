/* 禁域 — js/ui/screens/records.js
   記録: 自分の記録 (G.Records) + 挑戦と称号 (G.Achievements) + お祭りランのローカル記録 (G.Festival). */
(function (G) {
  'use strict';
  const ui = G.ui;
  const h = ui.h;
  const header = ui.header || function (title, onBack) {
    return h('div', { class: 'screen-head' },
      h('button', { class: 'btn-icon', type: 'button', 'aria-label': '戻る', onClick: onBack }, ui.icon('back')),
      h('h1', null, title));
  };

  function fmtDate(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function recordsBlock() {
    const rows = G.Records ? G.Records.summary() : [];
    const wrap = h('div', { class: 'rec-grid' });
    if (!rows.length) { wrap.appendChild(ui.meta.empty('記録のデータがありません')); return wrap; }
    rows.forEach(function (r) {
      const hasVal = r.value != null && r.value !== '' && !(typeof r.value === 'number' && r.value === 0 && r.key !== 'maxDepth');
      const val = hasVal ? r.value : (r.empty || '—');
      const isNum = typeof val === 'number';
      const cell = h('div', { class: 'rec-cell' + (hasVal ? '' : ' none') + (r.lineage ? ' lin-' + r.lineage : '') },
        h('div', { class: 'rec-label' }, r.label),
        h('div', { class: 'rec-val' + (isNum ? ' t-num' : '') }, r.lineage && hasVal ? ui.lineageGlyph(r.lineage) : null, String(val), isNum && r.unit ? h('small', null, r.unit) : null),
        r.sub && hasVal ? h('div', { class: 'rec-sub t-num' }, r.sub) : null);
      if (r.defId && hasVal) {
        cell.classList.add('clickable');
        cell.addEventListener('click', function () { try { ui.cardDetail(G.CardDB.get(r.defId)); } catch (e) { /* ignore */ } });
      }
      wrap.appendChild(cell);
    });
    return wrap;
  }

  function achievementsBlock() {
    const list = G.Achievements ? G.Achievements.list() : [];
    const ul = h('ul', { class: 'ach-list' });
    if (!list.length) return ui.meta.empty('挑戦のデータがありません');
    list.forEach(function (a) {
      const on = !!a.unlockedAt;
      ul.appendChild(h('li', { class: 'ach-row' + (on ? ' on' : '') },
        h('div', { class: 'ach-seal', 'aria-hidden': 'true' }, h('span', null, on ? a.title.slice(0, 1) : '')),
        h('div', { class: 'ach-body' },
          h('div', { class: 'ach-title' }, on ? a.title : '？？？', on ? h('small', { class: 't-num' }, fmtDate(a.unlockedAt)) : null),
          h('div', { class: 'ach-name' }, a.name),
          on ? null : h('div', { class: 'ach-desc' }, a.description))));
    });
    return ul;
  }

  function festivalBlock() {
    const all = G.Festival ? G.Festival.allRecords() : [];
    if (!all.length) return ui.meta.empty('お祭りランの記録はまだない。');
    const ul = h('ul', { class: 'fest-rec-list' });
    all.slice(0, 12).forEach(function (f) {
      const b = f.best;
      ul.appendChild(h('li', { class: 'fest-rec' + (b && b.won ? ' won' : '') },
        h('div', { class: 'fest-rec-head' }, h('span', { class: 'fest-kind' }, f.kind === 'weekly' ? '週替わり' : '日替わり'), h('b', null, f.name), h('span', { class: 'fest-date t-num' }, f.dateKey)),
        b ? h('div', { class: 'fest-rec-stats t-s' },
          h('span', null, b.won ? 'クリア ' : '敗北 ', b.won ? h('b', { class: 't-num' }, b.turns + 'ターン') : null),
          h('span', null, '最大ダメージ ', h('b', { class: 't-num' }, String(b.maxDamageOneTurn))),
          h('span', null, '最大連鎖 ', h('b', { class: 't-num' }, String(b.maxChain))),
          h('span', { class: 't-dim' }, f.count + '回挑戦')) : null));
    });
    return ul;
  }

  function section(title, sub) {
    return h('div', { class: 'msection big' }, h('span', null, title), sub ? h('small', { class: 't-dim' }, sub) : null);
  }

  ui.app.register('records', {
    mount(root) {
      const titles = G.Achievements ? G.Achievements.titles() : [];
      const total = G.Achievements ? G.Achievements.DEFS.length : 0;
      const sum = G.Meta ? G.Meta.summary() : null;
      root.appendChild(h('div', { class: 'col' },
        header('記録', function () { ui.app.back('menu'); }),
        sum ? h('div', { class: 'rec-runs t-s' },
          h('span', null, 'ラン ', h('b', { class: 't-num' }, String(sum.runsStarted)), '回'),
          h('span', null, 'クリア ', h('b', { class: 't-num' }, String(sum.runsCleared)), '回'),
          h('span', null, '解放深度 ', h('b', { class: 't-num' }, String(sum.depthUnlocked)))) : null,
        section('自分の記録'),
        recordsBlock(),
        section('挑戦と称号', titles.length + ' / ' + total),
        achievementsBlock(),
        section('お祭りランの記録', '端末内のみ'),
        festivalBlock(),
      ));
    },
    unmount() {},
  });
})(globalThis.G = globalThis.G || {});
