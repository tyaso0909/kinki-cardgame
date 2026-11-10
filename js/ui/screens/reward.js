/* 禁域 — js/ui/screens/reward.js — battle rewards (normal / elite / boss) */
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const h = ui.h;
  let S = null;

  function render(root) {
    const st = G.Run.state, r = st ? G.Run.reward() : null;
    ui.clear(root);
    if (!r) { root.appendChild(h('div', { class: 'col' }, h('div', { class: 'stub' }, h('p', null, '報酬の情報がありません。'), h('button', { class: 'btn', type: 'button', onClick: () => ui.run.go('map') }, 'マップへ')))); return; }
    if (!r.goldTaken) { G.Run.takeRewardGold(); }
    const col = h('div', { class: 'col' });
    col.appendChild(ui.run.hud());
    col.appendChild(h('div', { class: 'rw-head' },
      h('div', { class: 'eyebrow' }, r.boss ? 'ボス撃破' : r.elite ? 'エリート撃破' : '勝利'),
      h('div', { class: 'enemy' }, r.enemyName || ''),
      r.lastWords ? h('blockquote', { class: 'words' }, '「' + r.lastWords + '」') : null));
    col.appendChild(h('div', { class: 'rw-gold' }, '+' + r.gold, h('small', null, 'G' + (r.rewardMul > 1 ? '　報酬' + r.rewardMul + '倍' : ''))));
    if (r.achievements && r.achievements.length) col.appendChild(titlesBanner(r.achievements));
    if (r.diary) col.appendChild(h('div', { class: 'ev-diary' }, h('span', null, '日記の切れ端（' + (r.enemyName || '') + '）'), h('p', null, r.diary.text)));

    // normal: card choice
    if (r.cards) col.appendChild(cardBlock(r, 'cards', 'カードを1枚選ぶ', r.cardTaken, r.cardChosen, (id) => G.Run.takeRewardCard(id), 'cardTaken'));
    if (r.cardsExtra) col.appendChild(cardBlock(r, 'cardsExtra', 'もう1枚選ぶ（ミミックの宝）', r.cardExtraTaken, r.cardExtraChosen, (id) => { r.cardExtraTaken = true; if (id) { G.Run.addCard(id, { source: 'reward' }); r.cardExtraChosen = id; } G.Run.save(); }, 'cardExtraTaken'));
    // elite: pack choice + relic
    if (r.packs) {
      const blk = h('div', { class: 'rw-block' + (r.packTaken ? ' done' : '') }, h('h2', null, 'パックを1つ選ぶ', h('small', null, '中身の5枚はすべてデッキに入る')));
      if (r.packTaken) blk.appendChild(h('div', { class: 'card-row' }, r.packCards.map((id) => ui.run.cardPick(id, { onClick: () => ui.cardDetail(G.CardDB.get(id)) }))));
      else blk.appendChild(h('div', { class: 'shop-packs' }, r.packs.map((t) => ui.packEl(t, { onClick: async () => {
        const cards = G.Run.takeRewardPack(t);
        await ui.showOpenedPack(G.Packs.def(t).name, cards);
        render(root);
      } }))));
      col.appendChild(blk);
    }
    if (r.relic) {
      if (!r.relicTaken) G.Run.takeRewardRelic();
      col.appendChild(h('div', { class: 'rw-block' }, h('h2', null, '遺物を手に入れた'), h('div', { class: 'relic-list' }, ui.run.relicTile(r.relic))));
    }
    // boss: relic 3-choice, taboo choice, aux card
    if (r.bossRelics) {
      const blk = h('div', { class: 'rw-block boss' + (r.bossRelicTaken ? ' done' : '') }, h('h2', null, 'ボス遺物を1つ選ぶ', h('small', null, 'とても強いが、必ず代償がつく')));
      if (r.bossRelicTaken) blk.appendChild(h('div', { class: 'relic-list' }, ui.run.relicTile(r.bossRelicChosen)));
      else blk.appendChild(h('div', { class: 'relic-list' }, r.bossRelics.map((id) => ui.run.relicTile(id, { onClick: async () => {
        const ok = await ui.confirm('「' + G.RelicDB.get(id).name + '」を選びますか？', { ok: '選ぶ', cancel: '戻る' });
        if (!ok) return; G.Run.takeBossRelic(id); render(root);
      } }))));
      col.appendChild(blk);
    }
    if (r.taboo) {
      const blk = h('div', { class: 'rw-block taboo' + (r.tabooTaken ? ' done' : '') }, h('h2', null, '禁忌カードを1枚選ぶ', h('small', null, r.taboo.length + '択。選ばなくてもよい')));
      if (r.tabooTaken) blk.appendChild(r.tabooChosen ? h('div', { class: 'card-row' }, ui.run.cardPick(r.tabooChosen, { onClick: () => ui.cardDetail(G.CardDB.get(r.tabooChosen)) })) : h('div', { class: 'rw-chosen' }, '禁忌には触れなかった'));
      else {
        let sel = null;
        const picks = r.taboo.map((id) => ui.run.cardPick(id, { selectable: true, onClick: () => { sel = id; picks.forEach((p, k) => p.querySelector('.card').classList.toggle('sel', r.taboo[k] === id)); take.disabled = false; } }));
        const take = h('button', { class: 'btn primary', type: 'button', disabled: true, onClick: () => { G.Run.takeTaboo(sel); render(root); } }, 'デッキに加える');
        blk.appendChild(h('div', { class: 'card-row' }, picks));
        blk.appendChild(h('div', { class: 'row-actions' }, h('button', { class: 'btn ghost', type: 'button', onClick: () => { G.Run.takeTaboo(null); render(root); } }, 'スキップ'), take));
      }
      col.appendChild(blk);
    }
    if (r.auxCard) {
      const blk = h('div', { class: 'rw-block boss' + (r.auxTaken ? ' done' : '') }, h('h2', null, '補助の専用カード', h('small', null, 'デッキに加えるかどうか選べる')));
      blk.appendChild(h('div', { class: 'card-row' }, ui.run.cardPick(r.auxCard, { onClick: () => ui.cardDetail(G.CardDB.get(r.auxCard)) })));
      if (r.auxTaken) blk.appendChild(h('div', { class: 'rw-chosen' }, r.auxChosen ? 'デッキに加えた' : '置いていった'));
      else blk.appendChild(h('div', { class: 'row-actions' }, h('button', { class: 'btn ghost', type: 'button', onClick: () => { G.Run.takeAux(false); render(root); } }, 'いらない'), h('button', { class: 'btn primary', type: 'button', onClick: () => { G.Run.takeAux(true); render(root); } }, 'デッキに加える')));
      col.appendChild(blk);
    }
    if (r.auxCodex) col.appendChild(h('div', { class: 'rw-block boss' }, h('h2', null, '図鑑に登録'), h('div', { class: 'card-row' }, ui.run.cardPick(r.auxCodex)), h('p', { class: 't-dim t-s', style: { marginTop: '8px' } }, '次のラン以降、パックから出るようになる。')));

    const pending = (r.cards && !r.cardTaken) || (r.cardsExtra && !r.cardExtraTaken) || (r.packs && !r.packTaken) || (r.bossRelics && !r.bossRelicTaken) || (r.taboo && !r.tabooTaken) || (r.auxCard && !r.auxTaken);
    const nextLabel = r.boss ? (st.act >= 3 ? 'ランの結果へ' : '第' + ['一', '二', '三'][st.act] + '幕へ') : 'マップへ戻る';
    col.appendChild(h('div', { class: 'run-foot' }, h('button', { class: 'btn primary lg', type: 'button', onClick: async () => {
      if (pending) { const ok = await ui.confirm('まだ受け取っていない報酬があります。\nこのまま進みますか？', { ok: '進む', cancel: '戻る' }); if (!ok) return; }
      ui.run.go(G.Run.finishReward());
    } }, nextLabel)));
    root.appendChild(col);
  }

  function cardBlock(r, key, title, taken, chosen, take, flag) {
    const blk = h('div', { class: 'rw-block' + (taken ? ' done' : '') }, h('h2', null, title, h('small', null, 'スキップもできる')));
    if (taken) blk.appendChild(chosen ? h('div', { class: 'card-row' }, ui.run.cardPick(chosen, { onClick: () => ui.cardDetail(G.CardDB.get(chosen)) })) : h('div', { class: 'rw-chosen' }, '受け取らなかった'));
    else {
      let sel = null;
      const picks = r[key].map((id) => ui.run.cardPick(id, { selectable: true, onClick: () => { sel = id; picks.forEach((p, k) => p.querySelector('.card').classList.toggle('sel', r[key][k] === id)); btn.disabled = false; } }));
      const btn = h('button', { class: 'btn primary', type: 'button', disabled: true, onClick: () => { take(sel); render(S.root); } }, 'デッキに加える');
      blk.appendChild(h('div', { class: 'card-row' }, picks));
      blk.appendChild(h('div', { class: 'row-actions' }, h('button', { class: 'btn ghost', type: 'button', onClick: () => { take(null); render(S.root); } }, 'スキップ'), btn));
    }
    return blk;
  }
  function titlesBanner(ids) {
    const names = ids.map((id) => (G.Achievements && G.Achievements.get ? (G.Achievements.get(id) || {}).title : null) || (G.Texts && G.Texts.achievementTitles ? G.Texts.achievementTitles[id] : null) || id);
    return h('div', { class: 'rw-title-banner' }, '称号を得た：' + names.join('・'));
  }

  ui.app.register('reward', { mount(root) { S = { root }; render(root); }, unmount() { S = null; } });
})(globalThis.G = globalThis.G || {});
