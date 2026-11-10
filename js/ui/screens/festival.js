/* 禁域 — js/ui/screens/festival.js
   お祭りラン: today's (日替わり) and this week's (週替わり) festival, rules, local best, 「挑戦する」. */
(function (G) {
  'use strict';
  const ui = G.ui;
  const h = ui.h;
  const header = ui.header || function (title, onBack) {
    return h('div', { class: 'screen-head' },
      h('button', { class: 'btn-icon', type: 'button', 'aria-label': '戻る', onClick: onBack }, ui.icon('back')),
      h('h1', null, title));
  };

  function hasRun() {
    try { return !!(G.Save && typeof G.Save.hasRun === 'function' && G.Save.hasRun()); } catch (e) { return false; }
  }
  function begin(f) {
    if (!G.Run || typeof G.Run.startNew !== 'function') { ui.toast('お祭りランは準備中'); return; }
    function go() {
      try {
        const next = G.Run.startNew({ festival: f, depth: 0 });
        const screen = typeof next === 'string' ? next : 'packopen';
        if (ui.app.has(screen)) ui.app.show(screen); else ui.toast('画面「' + screen + '」は準備中', { kind: 'warn' });
      } catch (e) { console.error(e); ui.toast('ランを始められなかった', { kind: 'bad' }); }
    }
    if (hasRun()) {
      ui.confirm('進行中のランがあります。\nお祭りランを始めると、今のランは消えます。', { ok: '始める', cancel: '戻る', danger: true }).then(function (ok) { if (ok) go(); });
      return;
    }
    go();
  }

  function card(f, kind) {
    const best = G.Festival.best(f.id);
    const recs = G.Festival.records(f.id);
    const el = h('section', { class: 'fest ' + kind },
      h('div', { class: 'fest-label' }, h('span', null, f.label), h('span', { class: 'fest-date t-num' }, f.dateKey)),
      h('h2', { class: 'fest-name' }, f.name),
      h('ul', { class: 'fest-rules' }, f.ruleList.map(function (r) {
        return h('li', null, h('b', null, r.description), r.detail ? h('small', null, r.detail) : null);
      })),
      h('div', { class: 'fest-best' },
        best ? [
          h('span', { class: 'fest-best-k' }, best.won ? '最短クリア' : '最高記録'),
          best.won ? h('b', { class: 't-num' }, best.turns, h('small', null, 'ターン')) : h('b', { class: 't-num' }, best.maxDamageOneTurn, h('small', null, 'ダメージ')),
          h('span', { class: 't-dim t-s' }, '最大連鎖 ' + best.maxChain + '　' + recs.length + '回挑戦'),
        ] : h('span', { class: 't-dim t-s' }, 'まだ記録はない。同じ種なら、同じパックと同じ敵が待っている。')),
      h('button', { class: 'btn primary block', type: 'button', onClick: function () { begin(f); } }, '挑戦する'),
      h('div', { class: 'fest-seed t-xs t-faint t-num' }, '種 ' + f.seed.toString(16)),
    );
    return el;
  }

  ui.app.register('festival', {
    mount(root) {
      const col = h('div', { class: 'col' }, header('お祭りラン', function () { ui.app.back('menu'); }));
      if (!G.Festival) { col.appendChild(ui.meta.empty('お祭りランのデータがありません')); root.appendChild(col); return; }
      const today = G.Festival.today();
      const week = G.Festival.thisWeek();
      col.appendChild(h('p', { class: 'fest-lead t-dim t-s' }, '全員が同じ種で遊ぶ特別なラン。記録はこの端末に残り、図鑑と実績は普段どおり進む。深度は進まない。'));
      col.appendChild(card(today, 'daily'));
      col.appendChild(card(week, 'weekly'));
      root.appendChild(col);
    },
    unmount() {},
  });
})(globalThis.G = globalThis.G || {});
