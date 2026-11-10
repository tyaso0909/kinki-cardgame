/* 禁域 — js/ui/screens/event.js — event node: illustrated page, options, result text, picks */
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const h = ui.h;
  let S = null;

  function render(root) {
    const st = G.Run.state;
    ui.clear(root);
    const ev = st ? G.Run.event() : null;
    if (!ev) { root.appendChild(h('div', { class: 'col' }, h('div', { class: 'stub' }, h('p', null, 'イベントの情報がありません。'), h('button', { class: 'btn', type: 'button', onClick: () => ui.run.go('map') }, 'マップへ')))); return; }
    const def = ev.def, pe = ev.state;
    const lin = def && ui.labels.LINEAGE[def.lineage] ? def.lineage : 'generic';
    const col = h('div', { class: 'col' });
    col.appendChild(ui.run.hud());
    const page = h('div', { class: 'ev-page', style: { '--lc': 'var(--' + lin + ')' } },
      h('span', { class: 'ev-glyph' }, ui.lineageGlyph(lin)),
      h('span', { class: 'ev-big', 'aria-hidden': 'true' }, ui.lineageGlyph(lin)),
      h('h1', null, def ? def.name : '静かな部屋'),
      h('div', { class: 'ev-text' }, ev.text));
    if (pe.results && pe.results.length) {
      pe.results.forEach((r, i) => {
        const last = i === pe.results.length - 1;
        const flip = last && S.lastRes && S.lastRes.flip;
        if (flip) page.appendChild(h('div', { class: 'ev-coin', 'aria-hidden': 'true' }, h('div', { class: 'coin' }, flip === 'win' ? '表' : '裏')));
        page.appendChild(h('div', { class: 'ev-result' + (flip ? ' ' + flip : '') }, r.text));
      });
    }
    if (pe.diary) page.appendChild(h('div', { class: 'ev-diary' }, h('span', null, '日記の切れ端を見つけた'), h('p', null, pe.diary.text)));
    col.appendChild(page);

    if (S.lastRes && S.lastRes.cards && S.lastRes.cards.length) {
      col.appendChild(h('div', { class: 'run-section' }, h('h2', null, '手に入れたカード'), h('div', { class: 'card-row' }, S.lastRes.cards.map((id) => ui.run.cardPick(id, { onClick: () => ui.cardDetail(G.CardDB.get(id)) })))));
    }
    if (S.lastRes && (S.lastRes.relic || (S.lastRes.relics && S.lastRes.relics.length))) {
      const ids = S.lastRes.relics || [S.lastRes.relic];
      col.appendChild(h('div', { class: 'run-section' }, h('h2', null, '押し付けられた遺物'), h('div', { class: 'relic-list' }, ids.filter(Boolean).map((id) => ui.run.relicTile(id)))));
    }

    if (pe.stage === 'options' && def) {
      const opts = G.Run.eventOptions();
      col.appendChild(h('div', { class: 'ev-opts' }, opts.map((o) => h('button', { class: 'ev-opt', type: 'button', disabled: !o.available || S.busy, onClick: () => choose(o) },
        h('span', { class: 'n' }, ['一', '二', '三', '四'][o.index] || String(o.index + 1)), h('span', null, o.label)))));
      if (S.pickPanel) col.appendChild(S.pickPanel);
    } else if (pe.stage === 'battle') {
      col.appendChild(h('div', { class: 'run-foot' }, h('button', { class: 'btn primary lg', type: 'button', onClick: () => ui.run.go('battle') }, '戦う')));
    } else {
      col.appendChild(h('div', { class: 'run-foot' }, h('button', { class: 'btn primary lg', type: 'button', onClick: () => ui.run.go(G.Run.leaveEvent()) }, 'マップへ戻る')));
    }
    root.appendChild(col);
  }

  async function choose(o) {
    if (S.busy) return;
    const ev = G.Run.event();
    if (!o.pick) return resolve(o.index, null);
    const pick = o.pick;
    const cands = G.Run.eventCandidates(o.index);
    if (!cands.length) return resolve(o.index, null);
    if (pick.kind === 'deckCard') {
      const set = new Set(cands);
      ui.run.deckModal({ title: pick.prompt || 'カードを選ぶ', prompt: pick.prompt, okLabel: '決める', filter: (d) => set.has(d.id), onPick: (id) => resolve(o.index, [id]) });
      return;
    }
    // inline panels
    let chosen = [];
    let finalize = () => chosen;
    const panel = h('div', { class: 'ev-pick run-section' });
    const hint = h('div', { class: 'hint' }, pick.prompt || '選ぶ');
    panel.appendChild(hint);
    const okBtn = h('button', { class: 'btn primary', type: 'button', disabled: pick.count !== 'any', onClick: () => resolve(o.index, finalize()) }, pick.count === 'any' ? '何も拾わない' : '決める');
    const cancel = h('button', { class: 'btn ghost', type: 'button', onClick: () => { S.pickPanel = null; render(S.root); } }, '戻る');
    function refreshOk() {
      if (pick.count === 'any') { okBtn.textContent = chosen.length ? chosen.length + '枚拾う' : '何も拾わない'; okBtn.disabled = false; }
      else okBtn.disabled = chosen.length !== (pick.count || 1);
    }
    if (pick.kind === 'amount') {
      panel.appendChild(h('div', { class: 'ev-amounts' }, cands.map((n) => h('button', { class: 'btn', type: 'button', onClick: () => resolve(o.index, [n]) }, n + 'G'))));
      panel.appendChild(h('div', { class: 'run-foot' }, cancel));
    } else if (pick.kind === 'relic') {
      const tiles = cands.map((id) => ui.run.relicTile(id, { onClick: () => { chosen = [id]; tiles.forEach((t, k) => t.classList.toggle('sel', cands[k] === id)); refreshOk(); } }));
      panel.appendChild(h('div', { class: 'relic-list' }, tiles));
      panel.appendChild(h('div', { class: 'run-foot' }, cancel, okBtn));
    } else { // offered / deckCards: card multi-select
      const max = pick.count === 'any' ? cands.length : (pick.count || 1);
      const list = cands; // deckCards keeps duplicates (each deck copy is its own slot)
      finalize = () => chosen.map((k) => k.split('#')[0]);
      const els = list.map((id, i) => {
        const key = id + '#' + i;
        const el = ui.run.cardPick(id, { residual: !!pick.residual, selectable: true, onClick: () => {
          const at = chosen.indexOf(key);
          if (at >= 0) chosen.splice(at, 1);
          else { if (max === 1) chosen = []; if (chosen.length >= max) return; chosen.push(key); }
          els.forEach((e, k) => e.querySelector('.card').classList.toggle('sel', chosen.indexOf(list[k] + '#' + k) >= 0));
          refreshOk();
        } });
        return el;
      });
      panel.appendChild(h('div', { class: 'card-row' }, els));
      panel.appendChild(h('div', { class: 'run-foot' }, cancel, okBtn));
      refreshOk();
    }
    S.pickPanel = panel;
    render(S.root);
    panel.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  async function resolve(idx, choice) {
    if (S.busy) return;
    S.busy = true; S.pickPanel = null;
    let res;
    try { res = G.Run.resolveEvent(idx, choice); }
    catch (e) { console.error(e); ui.toast(e.message, { kind: 'bad' }); S.busy = false; return; }
    S.lastRes = res;
    S.busy = false;
    render(S.root);
    if (res.diary) ui.toast('日記の切れ端を見つけた', { ms: 2600 });
    const r = S.root.querySelector('.ev-result:last-of-type');
    if (r) r.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  ui.app.register('event', {
    mount(root) { S = { root, busy: false, lastRes: null, pickPanel: null }; render(root); },
    unmount() { S = null; },
  });
})(globalThis.G = globalThis.G || {});
