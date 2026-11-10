/* 禁域 — js/ui/screens/map.js
   The act map (branching, Slay-the-Spire style) + shared run-UI helpers.
     G.ui.run.go(screen)            route to the next run screen (handles 'battle' → G.ui.battle.start)
     G.ui.run.hud(opts)             sticky HUD strip (life / gold / deck / relics)
     G.ui.run.deckModal(opts)       card grid of the run deck (sell disabled); opts.onPick → pick mode
     G.ui.run.relicsModal()         relic list
     G.ui.run.relicTile(id, opts)   one relic row
     G.ui.run.cardPick(defId, opts) card + lineage tag (+price)
     G.ui.run.tally(deck)           lineage count chips
     G.ui.run.enemyPreview(def)     pre-battle modal for elites/bosses (relics shown before the fight)
*/
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const h = ui.h;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------------------------------------------------------------- shared helpers
  function safe(fn, dflt) { try { return fn(); } catch (e) { console.error(e); return dflt; } }
  function lineageOf(def) { return def && ui.labels.LINEAGE[def.lineage] ? def.lineage : 'generic'; }

  function hud(opts) {
    opts = opts || {};
    const st = G.Run.state;
    if (!st) return h('div');
    const relics = st.relics.filter((id) => { const r = G.RelicDB.tryGet(id); return r && !r.hidden; });
    // QA: at 360px five dots + deck button pushed the last dots under the global menu button
    const maxDots = (typeof window !== 'undefined' && window.innerWidth < 420) ? 2 : 5;
    const dots = relics.slice(0, maxDots).map((id) => {
      const r = G.RelicDB.get(id);
      return h('span', { class: 'relic-dot' + (r.category === 'cursed' ? ' cursed' : ''), style: { '--lc': r.lineage ? 'var(--' + r.lineage + ')' : null }, title: r.name }, ui.lineageGlyph(r.lineage || (r.category === 'boss' ? 'boss' : 'generic')));
    });
    if (relics.length > maxDots) dots.push(h('span', { class: 'relic-dot more' }, '+' + (relics.length - maxDots)));
    const el = h('div', { class: 'rhud' },
      h('span', { class: 'stat life', title: 'ライフ' }, h('i', null, '命'), String(st.life), h('small', null, '/' + st.maxLife)),
      h('span', { class: 'stat gold', title: 'ゴールド' }, h('i', null, '金'), String(st.gold) + 'G'),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn sm ghost', type: 'button', onClick: () => deckModal(), 'aria-label': 'デッキを見る' }, 'デッキ ' + st.deck.length),
      h('button', { class: 'relics', type: 'button', 'aria-label': '遺物を見る', style: { display: 'flex' }, onClick: () => relicsModal() }, dots.length ? dots : h('span', { class: 'relic-dot more' }, '—')),
    );
    if (opts.extra) el.appendChild(opts.extra);
    return el;
  }

  function tally(deck) {
    const count = {};
    deck.forEach((id) => { const d = G.CardDB.tryGet(id); if (!d) return; const l = lineageOf(d); count[l] = (count[l] || 0) + 1; });
    const lins = ui.LINEAGES.concat(['generic']);
    return h('div', { class: 'tally' }, lins.map((l) => h('span', { class: count[l] ? '' : 'zero', style: { '--lc': 'var(--' + l + ')' } }, ui.lineageGlyph(l), ui.labels.LINEAGE[l].name, ' ', String(count[l] || 0))));
  }

  function cardPick(defId, opts) {
    opts = opts || {};
    const def = G.CardDB.tryGet(defId);
    const card = ui.renderCard(def || { type: 'spell', name: '？' }, { size: opts.size || 'm', onClick: opts.onClick, selectable: opts.selectable, selected: opts.selected, disabled: opts.disabled });
    if (opts.residual) card.classList.add('residual');
    const l = lineageOf(def);
    const kids = [card];
    if (opts.tag !== false && def) kids.push(h('span', { class: 'tag', style: { color: 'var(--' + l + ')' } }, ui.lineageGlyph(l), ui.labels.LINEAGE[l].name, ' / ', ui.labels.RARITY[def.rarity] || ''));
    if (opts.price != null) kids.push(h('span', { class: 'price' + (opts.cant ? ' cant' : '') }, String(opts.price) + 'G'));
    if (opts.below) kids.push(opts.below);
    const wrap = h('div', { class: 'card-pick' + (opts.sold ? ' sold' : '') + (def && def.type === 'field' ? ' is-field' : '') }, kids);
    // long-press / right-click → detail
    card.addEventListener('contextmenu', (e) => { e.preventDefault(); if (def) ui.cardDetail(def); });
    return wrap;
  }

  function relicTile(id, opts) {
    opts = opts || {};
    const r = G.RelicDB.tryGet(id);
    if (!r) return h('div');
    const lin = r.lineage || (r.category === 'boss' ? 'boss' : 'generic');
    const el = h(opts.onClick ? 'button' : 'div', {
      class: 'relic-tile' + (r.category === 'cursed' ? ' cursed' : '') + (opts.onClick ? ' selectable' : '') + (opts.selected ? ' sel' : ''),
      type: opts.onClick ? 'button' : null, style: { '--lc': 'var(--' + lin + ')' }, onClick: opts.onClick,
    },
      h('span', { class: 'rg' }, ui.lineageGlyph(lin)),
      h('span', { class: 'rn' }, r.name),
      opts.price != null ? h('span', { class: 'price' + (opts.cant ? ' cant' : '') }, opts.price + 'G') : h('span', { class: 'rr' }, relicRarity(r)),
      h('span', { class: 'rt' }, r.text, r.drawback ? [' ', h('b', null, '代償：' + r.drawback)] : null));
    return el;
  }
  function relicRarity(r) {
    const map = { start: '初期', common: 'コモン', rare: 'レア', legend: '伝説', boss: 'ボス', cursed: '呪い' };
    return map[r.rarity] || (r.category === 'cursed' ? '呪い' : '');
  }

  function deckModal(opts) {
    opts = opts || {};
    const st = G.Run.state;
    if (!st) return Promise.resolve();
    const ids = st.deck.slice();
    const defs = ids.map((id) => G.CardDB.tryGet(id)).filter(Boolean);
    const order = { accel: 0, cycle: 1, chain: 2, time: 3, copy: 4, doom: 5, generic: 6 };
    defs.sort((a, b) => (order[lineageOf(a)] - order[lineageOf(b)]) || ((a.cost === 'X' ? 99 : a.cost) - (b.cost === 'X' ? 99 : b.cost)) || a.name.localeCompare(b.name, 'ja'));
    const counts = {};
    defs.forEach((d) => { counts[d.id] = (counts[d.id] || 0) + 1; });
    const seen = {};
    let chosen = null;
    let okBtn = null;
    const grid = h('div', { class: 'deck-grid' });
    defs.forEach((d) => {
      if (seen[d.id]) return; seen[d.id] = true;
      const allowed = !opts.filter || opts.filter(d);
      const card = ui.renderCard(d, { size: 'm', count: counts[d.id] > 1 ? counts[d.id] : null, disabled: opts.onPick && !allowed,
        onClick: opts.onPick ? () => { if (!allowed) return; chosen = d.id; grid.querySelectorAll('.card').forEach((c) => c.classList.toggle('sel', c.dataset.defId === d.id)); if (okBtn) okBtn.disabled = false; } : () => ui.cardDetail(d) });
      grid.appendChild(card);
    });
    const body = h('div', null,
      h('div', { class: 'deck-summary' }, h('span', null, ids.length + '枚' + (opts.onPick ? '　' + (opts.prompt || '1枚選ぶ') : '')), tally(ids)),
      grid);
    const buttons = opts.onPick
      ? [{ label: 'やめる', value: null, ghost: true }, { label: opts.okLabel || '決める', value: 'ok', primary: true }]
      : [{ label: '閉じる', value: true }];
    const p = ui.modal({ title: opts.title || 'デッキ', body, wide: true, buttons });
    if (opts.onPick) {
      setTimeout(() => { okBtn = document.querySelector('.modal-backdrop:not(.closing) .modal-buttons .btn.primary'); if (okBtn) okBtn.disabled = true; }, 0);
      return p.then((v) => { if (v === 'ok' && chosen) { opts.onPick(chosen); return chosen; } return null; });
    }
    return p;
  }

  function relicsModal() {
    const st = G.Run.state;
    if (!st) return Promise.resolve();
    const list = st.relics.filter((id) => { const r = G.RelicDB.tryGet(id); return r && !r.hidden; });
    const body = list.length ? h('div', { class: 'relic-list' }, list.map((id) => relicTile(id))) : h('p', { class: 't-dim' }, 'まだ遺物を持っていない。');
    return ui.modal({ title: '遺物 ' + list.length, body, wide: true });
  }

  // the life this enemy will have in the current run at that map row (depth / row ramp / festival)
  function lifeOf(def, row) { try { return G.Run.enemyLife(def, row); } catch (e) { return def.life; } }

  function enemyPreview(def, opts) {
    opts = opts || {};
    const lin = (Array.isArray(def.lineage) ? def.lineage[0] : def.lineage) || 'generic';
    const relics = (def.relics || []).filter((id) => G.RelicDB.has(id) && !G.RelicDB.get(id).hidden);
    const kind = def.kind === 'boss' ? 'ボス' : def.kind === 'elite' ? 'エリート' : '敵';
    const body = h('div', { class: 'enemy-preview', style: { '--lc': 'var(--' + (ui.labels.LINEAGE[lin] ? lin : 'generic') + ')' } },
      h('div', { class: 'ep-head' },
        h('span', { class: 'ep-glyph' }, ui.lineageGlyph(def.kind === 'boss' ? 'boss' : lin)),
        h('div', null, h('div', { class: 'ep-kind' }, kind), h('div', { class: 'ep-name' }, def.name), h('div', { class: 'ep-life' }, 'ライフ ' + lifeOf(def, opts.row)))),
      def.introText ? h('p', { class: 'ep-intro' }, def.introText) : null,
      relics.length ? h('div', { class: 'ep-relics' }, h('h3', null, '持っている遺物'), h('div', { class: 'relic-list' }, relics.map((id) => relicTile(id)))) : null,
      opts.note ? h('p', { class: 'ep-intro' }, opts.note) : null);
    return ui.modal({ title: null, body, wide: true, dismissable: false, buttons: [{ label: '戦う', value: true, primary: true }] });
  }

  // Route to the next run screen. 'battle' builds the game via G.Run and hands it to the battle screen.
  async function go(screen, opts) {
    opts = opts || {};
    if (!screen) screen = 'menu';
    if (screen === 'battle') {
      const pb = G.Run.pendingBattle();
      if (!pb) return ui.app.show('map', null, { replace: true });
      const edef = G.EnemyDB.get(pb.enemyId);
      if ((pb.elite || pb.boss) && !opts.skipPreview) await enemyPreview(edef, { row: pb.row });
      const b = G.Run.beginBattle(pb.enemyId, {});
      const rewardMul = pb.rewardMul;
      return ui.battle.start({
        game: b.game, enemyDef: edef, hideHazard: b.hideHazard, revealEnemyHand: b.revealEnemyHand,
        onEnd(result) {
          let next;
          try { next = G.Run.finishBattle(result); } catch (e) { console.error(e); ui.toast('戦闘結果の処理に失敗: ' + e.message, { kind: 'bad' }); next = 'map'; }
          go(next, { rewardMul });
        },
      });
    }
    return ui.app.show(screen, null, { replace: true, transition: screen === 'runend' ? 'fade' : undefined });
  }

  ui.run = { go, hud, tally, cardPick, relicTile, deckModal, relicsModal, enemyPreview, lineageOf };

  // ---------------------------------------------------------------- map rendering
  const ICON = {
    battle: '<path d="M4 20l6-6M20 20l-6-6M5 5l9 9M19 5l-9 9M3 4l2 1 1 2M21 4l-2 1-1 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    elite: '<path d="M4 17l-1.5-9 5 3.5L12 5l4.5 6.5 5-3.5L20 17z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M5 20.5h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    shop: '<path d="M7 9h10l1 11H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 9V7a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 14h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    event: '<path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><circle cx="12" cy="18" r="1.2" fill="currentColor"/>',
    rest: '<path d="M12 3c1 3 4.5 4.5 4.5 9a4.5 4.5 0 0 1-9 0c0-1.5.6-2.7 1.4-3.6.1 1.4.8 2.3 1.6 2.6-.6-2.3.2-5.3 1.5-8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M6 21h12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    unknown: '<path d="M9 9a3 3 0 1 1 4.5 2.6c-.9.5-1.5 1.2-1.5 2.4" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-dasharray="2 2"/><circle cx="12" cy="18" r="1.2" fill="currentColor"/>',
    boss: '<path d="M12 3l2.5 4.5L19 6l-1 5 3 3-4 1.5L16 20l-4-2.5L8 20l-1-4.5L3 14l3-3-1-5 4.5 1.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
  };
  function svg(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    if (attrs) for (const k of Object.keys(attrs)) if (attrs[k] != null) el.setAttribute(k, String(attrs[k]));
    return el;
  }

  const COL_W = 72, ROW_H = 86, PAD_X = 36, PAD_TOP = 22, PAD_BOT = 30, R = 17;

  function layout(map, width) {
    const colsW = (map.width - 1) * COL_W;
    const left = Math.max(PAD_X, (width - colsW) / 2);
    const rows = map.rows.length; // includes boss row
    const height = PAD_TOP + (rows - 1) * ROW_H + PAD_BOT;
    const pos = {};
    Object.keys(map.nodes).forEach((id) => {
      const n = map.nodes[id];
      pos[id] = { x: n.type === 'boss' ? width / 2 : left + n.col * COL_W, y: height - PAD_BOT - n.row * ROW_H };
    });
    return { pos, height };
  }

  function render(root) {
    ui.clear(root);
    const st = G.Run.state;
    if (!st || !st.map) {
      root.appendChild(h('div', { class: 'col' }, h('div', { class: 'stub' }, h('div', { class: 'stub-mark' }, 'マップ'), h('p', null, '進行中のランがありません。'),
        h('button', { class: 'btn', type: 'button', onClick: () => ui.app.show('menu', null, { replace: true }) }, 'メニューへ'))));
      return;
    }
    const map = st.map;
    const boss = G.EnemyDB.tryGet(map.bossEnemyId) || { name: '？', introText: '' };
    const avail = G.Run.availableNodes();
    const visitedSet = new Set(st.visited);

    const col = h('div', { class: 'col' });
    col.appendChild(hud());
    // boss banner
    col.appendChild(h('button', { class: 'map-boss', type: 'button', onClick: () => enemyPreviewOnly(boss) },
      h('span', { class: 'stamp' }, '封'),
      h('div', { class: 'eyebrow' }, '第' + ['一', '二', '三'][st.act - 1] + '幕のボス'),
      h('div', { class: 'name' }, boss.name),
      h('div', { class: 'sub' }, boss.teaches ? [h('b', null, '攻略の鍵：'), boss.teaches] : (boss.introText || ''))));

    // svg map
    const width = Math.min(root.clientWidth || 360, 900) - 32;
    const L = layout(map, width);
    const s = svg('svg', { class: 'map-svg', viewBox: '0 0 ' + width + ' ' + L.height, width, height: L.height, role: 'img', 'aria-label': 'マップ' });
    // edges
    Object.keys(map.nodes).forEach((id) => {
      const n = map.nodes[id];
      n.next.forEach((to) => {
        const a = L.pos[id], b = L.pos[to];
        const lit = visitedSet.has(id) && visitedSet.has(to);
        const open = st.position === id && avail.indexOf(to) >= 0 || (st.position === null && false);
        const d = 'M' + a.x + ',' + (a.y - R) + ' C' + a.x + ',' + (a.y - ROW_H / 2) + ' ' + b.x + ',' + (b.y + ROW_H / 2) + ' ' + b.x + ',' + (b.y + R);
        s.appendChild(svg('path', { class: 'edge' + (lit ? ' lit' : '') + (open ? ' open' : ''), d }));
      });
    });
    // nodes
    const order = Object.keys(map.nodes).sort((a, b) => map.nodes[b].row - map.nodes[a].row);
    order.forEach((id) => {
      const info = G.Run.nodeInfo(id);
      const p = L.pos[id];
      const isAvail = avail.indexOf(id) >= 0;
      const dim = !isAvail && !info.visited && !info.current && st.position !== null && map.nodes[id].row <= map.nodes[st.position].row;
      const g = svg('g', { class: 'map-node type-' + info.type + (info.visited ? ' visited' : '') + (info.current ? ' current' : '') + (isAvail ? ' available' : '') + (dim ? ' dim' : ''), transform: 'translate(' + p.x + ',' + p.y + ')', tabindex: isAvail ? 0 : null, role: isAvail ? 'button' : null, 'aria-label': info.label + (info.enemyId && G.EnemyDB.has(info.enemyId) ? '：' + G.EnemyDB.get(info.enemyId).name : '') });
      const rr = info.type === 'boss' ? R + 7 : R;
      if (isAvail) g.appendChild(svg('circle', { class: 'halo', r: rr + 3 }));
      g.appendChild(svg('circle', { class: 'ring', r: rr }));
      const ico = svg('svg', { class: 'ico', viewBox: '0 0 24 24', width: rr * 1.25, height: rr * 1.25, x: -rr * 0.625, y: -rr * 0.625 });
      ico.innerHTML = ICON[info.type] || ICON.unknown;
      g.appendChild(ico);
      let lbl = info.label;
      if (info.type === 'battle' || info.type === 'elite') { const e = info.enemyId && G.EnemyDB.tryGet(info.enemyId); if (e && (info.visited || isAvail)) lbl = e.name; }
      if (info.type !== 'boss') { const t = svg('text', { class: 'lbl', y: rr + 13 }); t.textContent = lbl; g.appendChild(t); }
      if (isAvail) {
        const act = () => onPick(id, info);
        g.addEventListener('click', act);
        g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
      } else if (info.enemyId && G.EnemyDB.has(info.enemyId) && info.visited) {
        g.addEventListener('click', () => enemyPreviewOnly(G.EnemyDB.get(info.enemyId), info.row != null ? info.row : (G.Run.nodeInfo ? (G.Run.nodeInfo(info.id) || {}).row : 0)));
      }
      s.appendChild(g);
    });
    const scroll = h('div', { class: 'map-scroll' }, s);
    col.appendChild(scroll);
    col.appendChild(h('div', { class: 'map-tip' }, st.position === null ? '光っているマスを選んで、第' + ['一', '二', '三'][st.act - 1] + '幕を始める' : '次に進むマスを選ぶ'));
    root.appendChild(col);
    // scroll to the current position (bottom of the map for a fresh act)
    requestAnimationFrame(() => {
      const cur = st.position ? L.pos[st.position] : null;
      const y = cur ? Math.max(0, cur.y - (root.clientHeight || 600) * 0.55) : L.height;
      root.scrollTop = y + scroll.offsetTop;
    });
  }

  function enemyPreviewOnly(def, row) {
    if (!def || !def.name) return;
    const lin = (Array.isArray(def.lineage) ? def.lineage[0] : def.lineage) || 'generic';
    const relics = (def.relics || []).filter((id) => G.RelicDB.has(id) && !G.RelicDB.get(id).hidden);
    const body = h('div', { class: 'enemy-preview', style: { '--lc': 'var(--' + (ui.labels.LINEAGE[lin] ? lin : 'generic') + ')' } },
      h('div', { class: 'ep-head' }, h('span', { class: 'ep-glyph' }, ui.lineageGlyph(def.kind === 'boss' ? 'boss' : lin)),
        h('div', null, h('div', { class: 'ep-kind' }, def.kind === 'boss' ? 'ボス' : def.kind === 'elite' ? 'エリート' : '敵'), h('div', { class: 'ep-name' }, def.name), h('div', { class: 'ep-life' }, 'ライフ ' + lifeOf(def, row)))),
      def.introText ? h('p', { class: 'ep-intro' }, def.introText) : null,
      def.teaches ? h('p', { class: 'ep-intro' }, '攻略の鍵：' + def.teaches) : null,
      relics.length ? h('div', { class: 'ep-relics' }, h('h3', null, '持っている遺物'), h('div', { class: 'relic-list' }, relics.map((id) => relicTile(id)))) : null);
    ui.modal({ body, wide: true });
  }

  async function onPick(id, info) {
    const labels = { battle: '通常戦', elite: 'エリート', shop: 'ショップ', event: 'イベント', rest: '休憩', boss: 'ボス', unknown: '？' };
    let name = labels[info.type];
    if (info.enemyId && G.EnemyDB.has(info.enemyId)) name += '：' + G.EnemyDB.get(info.enemyId).name;
    const ok = await ui.confirm(name + 'に進みますか？', { ok: '進む', cancel: '戻る' });
    if (!ok) return;
    let next;
    try { next = G.Run.goTo(id); } catch (e) { console.error(e); ui.toast(e.message, { kind: 'bad' }); return; }
    go(next);
  }

  ui.app.register('map', {
    transition: 'fade',
    mount(root) {
      render(root);
      ui.app.setMenuButton(async () => {
        const v = await ui.modal({ title: 'ラン', buttons: [{ label: '戻る', value: null, ghost: true }, { label: 'デッキ', value: 'deck' }, { label: '遺物', value: 'relics' }, { label: 'メニューへ（中断して保存）', value: 'menu' }] });
        if (v === 'deck') deckModal(); else if (v === 'relics') relicsModal();
        else if (v === 'menu') { G.Run.save(); ui.app.show('menu', null, { replace: true, transition: 'fade' }); }
      });
    },
    unmount() { ui.app.setMenuButton(null); },
  });
})(globalThis.G = globalThis.G || {});
