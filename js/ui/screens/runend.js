/* 禁域 — js/ui/screens/runend.js — victory / defeat summary; calls G.Run.endRun() once */
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const h = ui.h;
  let lastSummary = null;

  function render(root, sum) {
    ui.clear(root);
    const won = sum.won;
    if (ui.sfx) setTimeout(() => ui.sfx.play(won ? 'win' : 'lose'), 250);
    const stats = sum.stats || {};
    const col = h('div', { class: 'col' });
    col.appendChild(h('div', { class: 're-title ' + (won ? 'win' : 'lose') }, won ? '踏破' : '敗北'));
    const bossName = sum.boss && G.EnemyDB.has(sum.boss) ? G.EnemyDB.get(sum.boss).name : '';
    col.appendChild(h('p', { class: 're-sub' }, won ? '鏡の主を越えた。禁域はまだ、奥がある。' : '第' + ['一', '二', '三'][(sum.act || 1) - 1] + '幕で倒れた。' + (bossName ? 'この幕のボスは' + bossName + 'だった。' : ''),
      h('br'), '深度 ' + (sum.depth || 0) + (sum.festival ? '　お祭りラン：' + (sum.festival.name || '') : '')));
    const meta = sum.meta || {};
    const titles = (meta.newAchievements || []).map((id) => (G.Achievements && G.Achievements.get ? (G.Achievements.get(id) || {}).title : null) || id);
    if (titles.length) col.appendChild(h('div', { class: 're-titles' }, titles.map((t) => h('span', null, t))));
    if (meta.newPacks && meta.newPacks.length) col.appendChild(h('div', { class: 'rw-title-banner' }, '新しいパックが解放された：' + meta.newPacks.map((t) => (G.Packs.DEFS[t] || {}).name || t).join('・')));
    if (meta.depthUnlocked != null && won) col.appendChild(h('div', { class: 'rw-title-banner' }, '深度 ' + meta.depthUnlocked + ' が解放された'));

    col.appendChild(h('div', { class: 're-stats' },
      stat(stats.battles || 0, '戦闘'), stat(stats.wins || 0, '勝利'), stat(stats.turns || 0, 'ターン'),
      stat(stats.maxDamageOneTurn || 0, '最大ダメージ'), stat(stats.maxChain || 0, '最大連鎖'), stat(stats.longestLoop || 0, '最長ループ'),
      stat(stats.goldEarned || 0, '得たG'), stat(stats.packsOpened || 0, 'パック'), stat((sum.deck || []).length, 'デッキ枚数')));

    if (sum.topCards && sum.topCards.length) {
      col.appendChild(h('div', { class: 'run-section' }, h('h2', null, 'よく使ったカード'),
        h('div', { class: 're-top' }, sum.topCards.map((t) => {
          const d = G.CardDB.tryGet(t.defId); const lin = ui.run.lineageOf(d);
          return h('div', { class: 'row', style: { '--lc': 'var(--' + lin + ')' } }, h('span', { class: 'nm' }, ui.lineageGlyph(lin), d ? d.name : t.defId), h('span', { class: 'cnt' }, t.count + '回'));
        }))));
    }
    col.appendChild(h('div', { class: 'run-section' }, h('h2', null, '最後のデッキ', h('small', null, (sum.deck || []).length + '枚')), ui.run.tally(sum.deck || []),
      h('div', { class: 'deck-grid', style: { marginTop: '12px' } }, uniq(sum.deck || []).map(([id, n]) => ui.renderCard(G.CardDB.get(id), { size: 'm', count: n > 1 ? n : null, onClick: () => ui.cardDetail(G.CardDB.get(id)) })))));
    if (sum.relics && sum.relics.length) col.appendChild(h('div', { class: 'run-section' }, h('h2', null, '遺物'), h('div', { class: 'relic-list' }, sum.relics.filter((id) => G.RelicDB.has(id) && !G.RelicDB.get(id).hidden).map((id) => ui.run.relicTile(id)))));
    col.appendChild(h('div', { class: 'run-foot' },
      h('button', { class: 'btn primary lg', type: 'button', onClick: () => ui.app.show('menu', null, { replace: true, transition: 'fade' }) }, 'メニューへ'),
      ui.app.has('records') ? h('button', { class: 'btn lg', type: 'button', onClick: () => ui.app.show('records', null, { replace: true }) }, '記録') : null));
    root.appendChild(col);
  }
  function stat(n, label) { return h('div', { class: 're-stat' }, h('b', null, String(n)), h('span', null, label)); }
  function uniq(ids) { const m = new Map(); ids.forEach((id) => { if (G.CardDB.has(id)) m.set(id, (m.get(id) || 0) + 1); }); return Array.from(m.entries()); }

  ui.app.register('runend', {
    transition: 'fade',
    mount(root, params) {
      params = params || {};
      let sum = params.summary || null;
      if (!sum && G.Run.state && G.Run.state.phase === 'runend') { try { sum = G.Run.endRun(); } catch (e) { console.error(e); } }
      if (!sum) sum = lastSummary;
      if (!sum) { root.appendChild(h('div', { class: 'col' }, h('div', { class: 'stub' }, h('p', null, 'ランの結果がありません。'), h('button', { class: 'btn', type: 'button', onClick: () => ui.app.show('menu', null, { replace: true }) }, 'メニューへ')))); return; }
      lastSummary = sum;
      render(root, sum);
    },
    unmount() {},
  });
})(globalThis.G = globalThis.G || {});
