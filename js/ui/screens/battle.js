/* 禁域 — js/ui/screens/battle.js
   The battle screen.
     G.ui.battle.start({ game, onEnd(result), enemyDef })   → shows screen 'battle'
     screen 'battle' params: { game, onEnd, enemyDef }
   result = { won, winner, reason, turns, game }
   Human is always players[0]; the enemy (players[1]) is driven by G.AI.takeTurn
   when present, otherwise it simply ends its turn.
   Rendering helpers: js/ui/battle_hud.js, animations: js/ui/battle_anim.js, styles: css/battle.css
*/
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const h = ui.h;
  const HUD = ui.battleHud;

  let S = null; // current battle session

  // ---------------------------------------------------------------- helpers
  function defOf(inst) { return HUD.defOf(inst); }
  function el(sel) { return S && S.root ? S.root.querySelector(sel) : null; }
  function cardEl(uid) {
    const direct = el('[data-uid="' + uid + '"]');
    if (direct) return direct;
    if (!S || !S.root) return null;
    return Array.prototype.find.call(S.root.querySelectorAll('[data-uids]'), (x) => x.dataset.uids.split(',').indexOf(String(uid)) >= 0) || null;
  }
  function faceEl(pIdx) { return el('[data-face="' + pIdx + '"]'); }
  function setPrompt(text, buttons) {
    const bar = el('.bt-prompt');
    if (!bar) return;
    ui.clear(bar);
    if (!text) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.appendChild(h('span', { class: 'ptext' }, text));
    (buttons || []).forEach((b) => bar.appendChild(h('button', { class: 'btn sm ' + (b.cls || ''), type: 'button', onClick: b.onClick }, b.label)));
  }
  function settings() { try { return ui.settings.get(); } catch (e) { return {}; } }

  // ---------------------------------------------------------------- render
  function view() {
    return {
      isHighlighted: (uid) => S.hl.has(uid),
      isSelected: (uid) => S.sel && S.sel.uid === uid,
      abilities: S.abilities,
      onCard: onCardTap,
      onFace: onFaceTap,
      onChip: onChipTap,
      onAbility: onAbilityTap,
      cardSize: 's',
      handSize: S.desktop ? 'm' : 's',
      fan: S.desktop,
      enemyLineage: S.enemyLineage,
      hideHazard: !!S.params.hideHazard,                 // 盲目の預言者の眼帯
      revealedHand: revealedEnemyHand(),                 // 魔封じの猫 / 危険察知の羅針盤
    };
  }
  // Enemy hand cards the human may see: all of them while statuses.handRevealed is set (魔封じの猫),
  // otherwise the first N (危険察知の羅針盤: revealEnemyHand). Returns CardInst[] (possibly empty).
  function revealedEnemyHand() {
    if (!S || !S.game) return [];
    const g = S.game, p = g.players[1];
    if (safe(() => g.status(1, 'handRevealed'), false)) return p.hand.slice();
    const n = Number(S.params.revealEnemyHand) || 0;
    return n > 0 ? p.hand.slice(0, n) : [];
  }
  function refresh() {
    if (!S || !S.root || !S.game) return;
    const g = S.game;
    const v = view();
    S.abilities = (g.active === 0 && g.phase === 'main' && g.winner === null && typeof g.getAbilities === 'function') ? safe(() => g.getAbilities(0), []) : [];
    v.abilities = S.abilities;
    S.relicAbilities = (g.active === 0 && g.phase === 'main' && g.winner === null && G.Data && typeof G.Data.relicAbilities === 'function') ? safe(() => G.Data.relicAbilities(g, 0), []) : [];
    swap('.bt-enemy-strip', HUD.strip(g, 1, v));
    swap('.bt-enemy-zones', HUD.zones(g, 1, v));
    swap('.bt-enemy-board', HUD.board(g, 1, v));
    swap('.bt-mid', HUD.mid(g, v));
    swap('.bt-my-board', HUD.board(g, 0, v));
    swap('.bt-my-zones', HUD.zones(g, 0, v));
    swap('.bt-my-strip', HUD.strip(g, 0, v));
    swap('.bt-hand', HUD.hand(g, v));
    renderActionBar();
    attachLongPress();
    renderPeek();
    updateHandNav();
  }

  // ---------------------------------------------------------------- hand: scroll guide + card preview
  // ‹ › buttons and edge fades show there are more cards that way; the bar shows which part of the hand is in view.
  function updateHandNav() {
    const nav = el('.bt-handnav'), hand = el('.bt-hand');
    if (!nav || !hand) return;
    const max = Math.max(0, hand.scrollWidth - hand.clientWidth);
    const x = hand.scrollLeft;
    const over = max > 2;
    nav.classList.toggle('over', over);
    nav.classList.toggle('can-l', over && x > 2);
    nav.classList.toggle('can-r', over && x < max - 2);
    const thumb = nav.querySelector('.bt-hn-thumb');
    if (thumb && over) {
      const w = hand.clientWidth / hand.scrollWidth;
      thumb.style.width = (w * 100) + '%';
      thumb.style.left = ((x / hand.scrollWidth) * 100) + '%';
    }
    const cnt = nav.querySelector('.bt-hn-count');
    if (cnt) cnt.textContent = '手札 ' + S.game.players[0].hand.length + '枚';
  }
  function scrollHand(dir) { if (ui.battleDrag && ui.battleDrag.pageHand) ui.battleDrag.pageHand(S.root.querySelector('.bt'), dir); }

  // Tapping a hand card shows it large, with its full text, right above the hand (phones can't read the small cards).
  function removePeek() { document.querySelectorAll('.bt-peek').forEach((x) => x.remove()); }
  function renderPeek() {
    removePeek();
    if (!S || !S.sel || S.sel.kind !== 'hand' || S.mode) return;
    const g = S.game;
    const inst = g.findCard(S.sel.uid);
    if (!inst || (inst.zone !== 'hand' && inst.zone !== 'grave')) return;
    const frame = S.root.querySelector('.bt');
    const top = el('.bt-enemy-board') ? el('.bt-enemy-board').getBoundingClientRect().top : 60;
    const roomAbove = (x) => x.getBoundingClientRect().top - Math.max(8, top) - 16;
    // sit above my life strip when there is room (so it doesn't hide it), else just above the prompt bar / hand
    const strip = el('.bt-my-strip');
    let anchor = strip && roomAbove(strip) >= 190 * 1.4 ? strip : null;
    if (!anchor) anchor = [el('.bt-prompt'), el('.bt-hand')].find((x) => x && !x.hidden && x.getBoundingClientRect().height > 0);
    if (!frame || !anchor) return;
    const ar = anchor.getBoundingClientRect();
    const room = roomAbove(anchor);
    const handR = el('.bt-hand').getBoundingClientRect();
    const cw = Math.max(150, Math.min(S.desktop ? 250 : 230, (room - (S.sel.pl ? 0 : 26)) / 1.4, window.innerWidth - 32));
    const pl = S.sel.pl;
    const card = ui.renderCard(inst, { size: 'l', cost: pl ? pl.cost : undefined });
    card.style.setProperty('--cw', Math.round(cw) + 'px');
    card.classList.add(pl ? 'playable' : 'unplayable');
    const why = pl ? null : h('p', { class: 'bt-peek-why' }, S.sel.why || '今は使えない');
    const peek = h('div', { class: 'bt-peek', role: 'dialog', 'aria-label': defOf(inst).name + 'の詳細' }, card, why);
    peek.style.bottom = Math.round(window.innerHeight - ar.top + 8) + 'px';
    peek.style.left = Math.round(handR.left + handR.width / 2) + 'px';
    // tap the preview to put it away (buttons stay in the prompt bar)
    peek.addEventListener('click', () => { clearMode(); refresh(); });
    document.body.appendChild(peek);
  }
  function swap(sel, node) {
    const old = el(sel);
    if (!old) return;
    const keepClass = sel.slice(1);
    node.classList.add(keepClass);
    const keepScroll = old.scrollLeft; // the hand keeps where the player scrolled it (it used to jump back to the start)
    old.replaceWith(node);
    if (keepScroll) node.scrollLeft = keepScroll;
  }
  function safe(fn, dflt) { try { return fn(); } catch (e) { console.error(e); return dflt; } }

  function renderActionBar() {
    const bar = el('.bt-actions');
    if (!bar) return;
    ui.clear(bar);
    const g = S.game;
    const myTurn = g.active === 0 && g.phase === 'main' && g.winner === null && !S.busy;
    const det = g.loop && g.loop.detected && g.loop.detected.who === 0 ? g.loop.detected : null;
    bar.appendChild(h('button', { class: 'btn-icon', type: 'button', 'aria-label': 'メニュー', onClick: openMenu }, ui.icon('menu')));
    bar.appendChild(h('button', { class: 'btn sm ghost bt-logbtn', type: 'button', 'aria-label': 'ログ', onClick: toggleLog }, 'ログ'));
    if (det && myTurn) {
      bar.appendChild(h('button', { class: 'btn sm bt-loop', type: 'button', onClick: () => offerLoop(det) }, 'ループ実行'));
    }
    // activated relics (無限の巾着・原初の炉) — INTEGRATION_NOTES: not part of game.getAbilities
    if (myTurn) (S.relicAbilities || []).forEach((ab) => {
      bar.appendChild(h('button', { class: 'btn sm bt-relic-ab', type: 'button', title: ab.label, onClick: () => onRelicAbility(ab) }, ab.label));
    });
    // 一斉攻撃: every monster that can hit the enemy's life attacks it (shown only when the face is a legal target)
    const volley = myTurn ? faceVolley() : null;
    if (volley) {
      bar.appendChild(h('button', { class: 'btn sm bt-allout', type: 'button', 'aria-label': '一斉攻撃 ' + volley.count + '体', onClick: confirmAllOut },
        '一斉攻撃', h('b', { class: 't-num' }, '×' + volley.count)));
    }
    bar.appendChild(h('span', { class: 'spacer' }));
    bar.appendChild(h('button', { class: 'btn primary bt-end', type: 'button', disabled: !myTurn, onClick: onEndTurn }, 'ターン終了'));
  }

  // long-press (or right click) on any card opens the detail modal
  function attachLongPress() {
    S.root.querySelectorAll('.card[data-def-id]').forEach((c) => {
      if (c.__lp) return;
      c.__lp = true;
      let timer = null, fired = false, x0 = 0, y0 = 0;
      const start = (e) => {
        fired = false; x0 = e.clientX; y0 = e.clientY;
        timer = setTimeout(() => {
          timer = null;
          if (ui.battleDrag && ui.battleDrag.active()) return; // became a drag
          if (!c.isConnected) return; // redrawn mid-press: this element no longer receives pointerup/leave
          fired = true; openDetail(c.dataset.defId, c.dataset.uid);
        }, 450);
      };
      const cancel = () => { if (timer) clearTimeout(timer); timer = null; };
      c.addEventListener('pointermove', (e) => { if (timer && Math.hypot(e.clientX - x0, e.clientY - y0) > 8) cancel(); });
      c.addEventListener('pointerdown', start);
      c.addEventListener('pointerup', cancel);
      c.addEventListener('pointerleave', cancel);
      c.addEventListener('pointercancel', cancel);
      c.addEventListener('click', (e) => { if (fired) { e.stopImmediatePropagation(); e.preventDefault(); fired = false; } }, true);
      c.addEventListener('contextmenu', (e) => { e.preventDefault(); openDetail(c.dataset.defId, c.dataset.uid); });
    });
  }
  function openDetail(defId, uid) {
    const inst = uid ? S.game.findCard(Number(uid)) : null;
    const def = safe(() => G.CardDB.get(defId), null);
    if (inst || def) ui.cardDetail(inst || def);
  }

  // ---------------------------------------------------------------- selection / modes
  function clearMode() {
    removePeek();
    S.sel = null;
    S.hl = new Set();
    S.mode = null;
    setPrompt(null);
  }
  function enterTargetMode(candidates, prompt, onPick, opts) {
    opts = opts || {};
    S.mode = { type: 'target', cands: candidates, onPick, picked: [], count: opts.count || 1, upTo: !!opts.upTo, optional: !!opts.optional };
    S.hl = new Set(candidates.map((c) => (c.uid != null ? c.uid : 'face' + c.idx)));
    const btns = [];
    if (opts.upTo || opts.optional) btns.push({ label: opts.upTo ? '決定' : 'このまま', cls: 'primary', onClick: () => finishTarget() });
    if (opts.cancelable !== false) btns.push({ label: 'やめる', cls: 'ghost', onClick: () => { const m = S.mode; clearMode(); refresh(); if (m && m.onCancel) m.onCancel(); } });
    S.mode.onCancel = opts.onCancel || null;
    setPrompt(prompt || '対象を選ぶ', btns);
    refresh();
  }
  function targetTapped(target) {
    const m = S.mode;
    if (!m || m.type !== 'target') return false;
    const key = target.uid != null ? target.uid : 'face' + target.idx;
    if (!S.hl.has(key)) return false;
    const i = m.picked.indexOf(target);
    if (i >= 0) { m.picked.splice(i, 1); refresh(); return true; }
    m.picked.push(target);
    if (m.picked.length >= m.count) finishTarget();
    else { setPrompt((m.promptBase || '対象を選ぶ') + '（' + m.picked.length + '/' + m.count + '）', [{ label: '決定', cls: 'primary', onClick: finishTarget }, { label: 'やめる', cls: 'ghost', onClick: () => { clearMode(); refresh(); } }]); refresh(); }
    return true;
  }
  function finishTarget() {
    const m = S.mode;
    if (!m) return;
    const picked = m.picked.slice();
    clearMode();
    m.onPick(picked);
  }

  // ---------------------------------------------------------------- taps
  function onCardTap(inst, cardEl, where) {
    if (!S || S.locked) return;
    if (S.mode && S.mode.type === 'target') { if (targetTapped(inst)) return; }
    const g = S.game;
    if (S.mode && S.mode.type === 'pick') return; // picks use their own UI
    if (g.active !== 0 || g.phase !== 'main' || g.winner !== null || S.busy) { openDetail(inst.defId, inst.uid); return; }
    if (where === 'hand' || where === 'grave') return selectHandCard(inst);
    if (where === 'board' || where === 'phantoms') return selectAttacker(inst, cardEl);
    openDetail(inst.defId, inst.uid);
  }
  function onFaceTap(pIdx) {
    if (!S || S.locked) return;
    if (S.mode && S.mode.type === 'target') {
      const p = S.game.players[pIdx];
      if (S.hl.has('face' + pIdx)) { targetTapped(p); return; }
    }
    const p = S.game.players[pIdx];
    ui.toast(p.name + '　ライフ' + p.life + '　マナ' + p.mana + '/' + p.maxMana + (p.curse ? '　呪詛' + p.curse : ''));
  }
  function onChipTap(kind, inst, pIdx) {
    if (!S || S.locked) return;
    if (inst && S.mode && S.mode.type === 'target' && targetTapped(inst)) return;
    if (inst) { openDetail(inst.defId, inst.uid); return; }
    const g = S.game;
    const k = String(kind).split(':');
    const who = pIdx != null ? pIdx : (k[1] != null ? Number(k[1]) : 0);
    const p = g.players[who];
    const zoneTitles = { grave: '墓地', exile: '除外', deck: '山札', seals: '封印ゾーン', vault: '蒐集箱', timed: '時限', reserves: '予約魔法' };
    const zone = k[0];
    if (zone === 'enemyHand') {
      const seen = revealedEnemyHand();
      if (seen.length) { showPile('相手の手札（見えている' + seen.length + '枚）', seen, seen.length < p.hand.length ? '手札は全部で' + p.hand.length + '枚。残りは伏せられている' : null); return; }
      ui.toast('相手の手札：' + p.hand.length + '枚'); return;
    }
    if (zone === 'deck') { ui.toast(p.name + 'の山札：' + p.deck.length + '枚'); return; }
    if (zone === 'theft') { ui.toast('時間の窃盗：あと' + p.flags.turnsUntilTheft + 'ターンで、あなたのターンが奪われる'); return; }
    if (zone === 'curse') { ui.toast(p.name + 'の呪詛 ' + p.curse + ' / ' + p.curseLimit + '　（上限で敗北）'); return; }
    if (zone === 'reserves') {
      if (who === 0) ui.toast('相手が仕掛けた予約魔法：' + p.reserves.length + '枚（あなたの次のターンに効く）');
      else ui.toast('あなたが仕掛けた予約魔法：' + p.reserves.length + '枚');
      return;
    }
    const cards = p[zone] || [];
    showPile((who === 0 ? '自分の' : '相手の') + (zoneTitles[zone] || zone), cards, zone === 'seals' ? (typeof g.distinctKeys === 'function' ? '鍵 ' + g.distinctKeys(who) + ' / 5' : null) : null);
  }
  function showPile(title, cards, sub) {
    const grid = h('div', { class: 'bt-pilegrid' });
    if (!cards.length) grid.appendChild(h('p', { class: 't-dim' }, 'カードはありません'));
    cards.slice().reverse().forEach((c) => grid.appendChild(ui.renderCard(c, { size: 's', onClick: () => ui.cardDetail(c) })));
    ui.modal({ title: title + '（' + cards.length + '）', body: h('div', null, sub ? h('p', { class: 't-dim t-s' }, sub) : null, grid), wide: true });
  }
  function onAbilityTap(uid) {
    if (!S || S.locked || S.busy) return;
    const ab = (S.abilities || []).find((a) => a.uid === uid);
    if (!ab) return;
    const inst = S.game.findCard(uid);
    if (ab.targets && ab.targets.length) {
      const cands = ab.targets.map((u) => S.game.findCard(u)).filter(Boolean);
      S.sel = { uid, kind: 'ability' };
      enterTargetMode(cands, HUD.nameOf(inst) + '：' + (ab.label || '能力') + 'の対象を選ぶ', (picked) => {
        runAction(() => S.game.useAbility(0, uid, picked.map((t) => t.uid)));
      });
    } else {
      runAction(() => S.game.useAbility(0, uid, []));
    }
  }

  async function onRelicAbility(ab) {
    if (!S || S.locked || S.busy) return;
    const g = S.game;
    let targets = [];
    if (ab.targets && ab.targets.length) {
      const cands = ab.targets.map((u) => g.findCard(u)).filter(Boolean);
      const hidden = cands.every((c) => c.zone === 'hand' || c.zone === 'grave' || c.zone === 'deck');
      let picked;
      if (hidden) picked = await pickFromList({ prompt: ab.label, count: 1 }, cands);
      else picked = await new Promise((res) => { enterTargetMode(cands, ab.label + 'の対象を選ぶ', (p) => res(p), { count: 1, onCancel: () => res(null) }); });
      if (!picked || !picked.length) { clearMode(); refresh(); return; }
      targets = picked.map((t) => t.uid);
    }
    clearMode();
    await runAction(() => G.Data.useRelicAbility(g, 0, ab.relicId, targets));
  }

  // hand card: select → confirm (or target / X)
  function selectHandCard(inst) {
    const g = S.game;
    const pl = g.getPlayable(0).find((x) => x.uid === inst.uid);
    const def = defOf(inst);
    if (S.sel && S.sel.uid === inst.uid && S.mode == null) { clearMode(); refresh(); return; }
    clearMode();
    if (!pl) {
      const legal = safe(() => g.canPlayCard(0, inst), { ok: false, reason: '' });
      const why = { mana: 'マナが足りない', boardFull: '場がいっぱい', duplicateCrest: '同名の紋章がすでにある', cardsPerTurnLimit: 'このターンはもう使えない', sameNamePerTurnLimit: '同名カードは今ターン使えない', canPlay: '今は使えない', noGravePlay: '墓地から使えない' };
      const whyText = why[legal.reason] || '今は使えない';
      S.sel = { uid: inst.uid, kind: 'hand', why: whyText };
      setPrompt(def.name + '：' + whyText, [
        { label: '詳細', cls: '', onClick: () => openDetail(inst.defId, inst.uid) },
        { label: '閉じる', cls: 'ghost', onClick: () => { clearMode(); refresh(); } },
      ]);
      refresh();
      return;
    }
    S.sel = { uid: inst.uid, kind: 'hand', pl };
    const costTxt = 'コスト' + pl.cost + (pl.from === 'grave' ? '（再演）' : '');
    const label = def.type === 'monster' ? '召喚する' : def.type === 'spell' ? '使う' : '置く';
    setPrompt(def.name + '　' + costTxt, [
      { label, cls: 'primary', onClick: () => commitHandCard(inst, pl) },
      { label: '詳細', cls: '', onClick: () => openDetail(inst.defId, inst.uid) },
      { label: 'やめる', cls: 'ghost', onClick: () => { clearMode(); refresh(); } },
    ]);
    refresh();
  }
  async function commitHandCard(inst, pl) {
    const g = S.game;
    const def = defOf(inst);
    const choices = {};
    if (pl.needsX) {
      const x = await pickX(def, g.players[0].mana, inst);
      if (x == null) { clearMode(); refresh(); return; }
      choices.x = x;
    }
    if (pl.needsTarget && def.targets) {
      const spec = def.targets;
      const ctx = g.makeCtx(0, inst);
      const cands = safe(() => ctx.candidatesFor(spec), []);
      if (!cands.length && !spec.optional) { ui.toast('対象がいません', { kind: 'warn' }); clearMode(); refresh(); return; }
      const hidden = /handCard|graveCard|deckCard|exileCard|sealCard|vaultCard/.test(spec.kind);
      let picked;
      if (hidden) {
        picked = await pickFromList(spec, cands);
        if (picked == null) { clearMode(); refresh(); return; }
      } else {
        picked = await new Promise((res) => {
          S.mode = null;
          enterTargetMode(cands, spec.prompt || '対象を選ぶ', (p) => res(p), { count: spec.count || 1, upTo: spec.upTo, optional: spec.optional, onCancel: () => res(null) });
          S.mode.promptBase = spec.prompt || '対象を選ぶ';
        });
        if (picked == null) return;
      }
      choices.targets = picked.map((t) => (t.uid != null ? t.uid : { player: t.idx }));
    }
    clearMode();
    await runAction(() => g.playCard(0, inst.uid, { choices }), { playUid: inst.uid });
  }

  function pickX(def, max, inst) {
    return new Promise((resolve) => {
      let val = max;
      const out = h('b', { class: 't-num bt-xval' }, String(val));
      const range = h('input', { type: 'range', min: '0', max: String(max), value: String(val), class: 'bt-xrange', 'aria-label': 'X' });
      range.addEventListener('input', () => { val = Number(range.value); out.textContent = String(val); });
      const body = h('div', { class: 'bt-xpick' },
        h('p', null, def.name, 'のXを決める（マナ', String(max), 'まで）'),
        h('div', { class: 'row' }, h('button', { class: 'btn sm', type: 'button', onClick: () => { val = Math.max(0, val - 1); range.value = val; out.textContent = String(val); } }, '−'), range,
          h('button', { class: 'btn sm', type: 'button', onClick: () => { val = Math.min(max, val + 1); range.value = val; out.textContent = String(val); } }, '＋')),
        h('div', { class: 't-center' }, 'X = ', out));
      ui.modal({ title: 'Xの値', body, buttons: [{ label: 'やめる', value: null, ghost: true }, { label: '決定', value: true, primary: true }] })
        .then((v) => resolve(v ? val : null));
    });
  }

  // modal list picker for hidden zones (hand / grave / deck …). Returns CardInst[] | null (cancelled)
  function pickFromList(spec, cands, opts) {
    opts = opts || {};
    const count = spec.count || 1;
    const picked = [];
    return new Promise((resolve) => {
      const grid = h('div', { class: 'bt-pickgrid' });
      let box = null;
      function render() {
        ui.clear(grid);
        cands.forEach((c) => {
          const on = picked.indexOf(c) >= 0;
          const card = ui.renderCard(c, { size: 'm', selectable: true, selected: on, onClick: () => {
            const i = picked.indexOf(c);
            if (i >= 0) picked.splice(i, 1);
            else if (picked.length < count) picked.push(c);
            else if (count === 1) { picked.length = 0; picked.push(c); }
            render(); updateBtn();
          } });
          grid.appendChild(card);
        });
      }
      function updateBtn() {
        if (!box) return;
        const okBtn = box.querySelector('.modal-buttons .primary');
        const need = spec.upTo || spec.optional ? 0 : count;
        if (okBtn) okBtn.disabled = picked.length < Math.min(need, cands.length);
        const cnt = box.querySelector('.bt-pickcount');
        if (cnt) cnt.textContent = picked.length + ' / ' + count;
      }
      const body = h('div', null, h('p', { class: 't-dim t-s bt-pickcount' }, '0 / ' + count), grid);
      render();
      const buttons = [];
      if (opts.cancelable !== false) buttons.push({ label: 'やめる', value: null, ghost: true });
      buttons.push({ label: '決定', value: true, primary: true });
      ui.modal({ title: spec.prompt || '選ぶ', body, wide: true, dismissable: false, buttons }).then((v) => resolve(v ? picked.slice() : null));
      setTimeout(() => { box = document.querySelector('.modal:last-of-type'); updateBtn(); }, 0);
    });
  }

  // Why can't this monster attack? (速攻 monsters must never be told 「出したターンは攻撃できない」)
  function cannotAttackReason(g, inst) {
    if (inst.attacksLeft <= 0) return 'このターンはもう攻撃した';
    if (g.status(0, 'cannotAttack')) return 'このターンは攻撃できない効果を受けている';
    if (inst.flags && inst.flags.cannotAttack) return '攻撃できない状態';
    if (inst.summonedTurn === g.turn && !g.hasKeyword(inst, 'rush') && g.hasKeyword(inst, 'charge')) return '突進：出したターンは、相手のモンスターにだけ攻撃できる';
    if (inst.summonedTurn === g.turn && !g.hasKeyword(inst, 'rush')) return '出したターンは攻撃できない（速攻なら攻撃できる）';
    return '今は攻撃できない';
  }
  // attacker: select → targets glow
  function selectAttacker(inst, cardEl) {
    const g = S.game;
    let attacker = inst;
    if (inst.isPhantom) {
      // stack: pick a phantom of the same def that can still attack
      const alt = g.players[0].phantoms.find((p) => p.defId === inst.defId && g.canAttackWith(0, p));
      if (alt) attacker = alt;
    }
    const entry = g.getAttackers(0).find((a) => a.uid === attacker.uid);
    if (!entry) {
      if (S.sel && S.sel.uid === inst.uid) { clearMode(); refresh(); return; }
      const def = defOf(inst);
      const reason = cannotAttackReason(g, inst);
      ui.toast(def.name + '：' + reason, { kind: 'warn' });
      openDetail(inst.defId, inst.uid);
      return;
    }
    clearMode();
    S.sel = { uid: attacker.uid, kind: 'attacker' };
    const cands = entry.targets.map((t) => (t === 'face' ? g.players[1] : g.findCard(t))).filter(Boolean);
    enterTargetMode(cands, HUD.nameOf(attacker) + '（攻撃' + entry.atk + '）の攻撃先を選ぶ', (picked) => {
      const t = picked[0];
      if (!t) return;
      const target = t.uid != null ? t.uid : 'face';
      runAction(() => g.attack(0, attacker.uid, target), { attackUid: attacker.uid, target });
    });
  }

  // ---------------------------------------------------------------- drag-to-play (js/ui/battle_drag.js)
  const WHY = { mana: 'マナが足りない', boardFull: '場がいっぱい', duplicateCrest: '同名の紋章がすでにある', cardsPerTurnLimit: 'このターンはもう使えない', sameNamePerTurnLimit: '同名カードは今ターン使えない', canPlay: '今は使えない', noGravePlay: '墓地から使えない' };
  function dragApi() {
    return {
      // Our own animations may still be playing (S.draining) — a press fast-forwards them (capture listener in build())
      // and the drag goes ahead, same as taps. Otherwise a 速攻 monster dragged right after its summon did nothing.
      canAct: () => !!(S && !S.locked && !S.busy && !S.enemyTurn && S.game.active === 0 && S.game.phase === 'main' && S.game.winner === null && !(S.mode && S.mode.type === 'pick')),
      game: () => S.game,
      playable: (uid) => S.game.getPlayable(0).find((x) => x.uid === uid) || null,
      whyNot: (inst) => {
        const legal = safe(() => S.game.canPlayCard(0, inst), { ok: false, reason: '' });
        return defOf(inst).name + '：' + (WHY[legal.reason] || '今は使えない');
      },
      // single target on a visible zone → aim with an arrow; anything else uses the normal tap flow after the drop
      aimSpec: (inst, pl) => {
        const def = defOf(inst);
        if (!pl.needsTarget || !def.targets || pl.needsX) return null;
        const spec = def.targets;
        if ((spec.count || 1) !== 1 || spec.upTo) return null;
        if (/handCard|graveCard|deckCard|exileCard|sealCard|vaultCard|timedCard/.test(spec.kind)) return null;
        const cands = safe(() => S.game.makeCtx(0, inst).candidatesFor(spec), []);
        return cands.length ? { cands } : null;
      },
      commit: (inst, pl) => commitHandCard(inst, pl),
      playOn: (inst, pl, target) => {
        const choices = { targets: [target.uid != null ? target.uid : { player: target.idx }] };
        return runAction(() => S.game.playCard(0, inst.uid, { choices }), { playUid: inst.uid });
      },
      attacker: (inst) => {
        const g = S.game;
        let attacker = inst;
        if (inst.isPhantom) {
          const alt = g.players[0].phantoms.find((p) => p.defId === inst.defId && g.canAttackWith(0, p));
          if (alt) attacker = alt;
        }
        const entry = g.getAttackers(0).find((a) => a.uid === attacker.uid);
        if (!entry) {
          const reason = cannotAttackReason(g, inst);
          return { error: defOf(inst).name + '：' + reason };
        }
        const cands = entry.targets.map((t) => (t === 'face' ? g.players[1] : g.findCard(t))).filter(Boolean);
        return { attacker, cands };
      },
      attack: (attacker, t) => {
        const target = t.uid != null ? t.uid : 'face';
        return runAction(() => S.game.attack(0, attacker.uid, target), { attackUid: attacker.uid, target });
      },
      beginDrag: () => { if (S.mode || S.sel) { clearMode(); } },
      endDrag: (acted) => { if (!acted && S) refresh(); },
    };
  }

  // ---------------------------------------------------------------- 一斉攻撃 (all monsters → enemy life)
  function faceAttackers() {
    const g = S.game;
    if (g.active !== 0 || g.phase !== 'main' || g.winner !== null) return [];
    return safe(() => g.getAttackers(0), []).filter((a) => a.targets.indexOf('face') >= 0 && a.atk > 0);
  }
  function faceVolley() {
    const list = faceAttackers();
    if (!list.length) return null;
    const g = S.game;
    let dmg = 0, swings = 0;
    list.forEach((a) => { const m = g.findCard(a.uid); const n = Math.max(1, (m && m.attacksLeft) || 1); dmg += a.atk * n; swings += n; });
    return { count: list.length, dmg, swings };
  }
  function confirmAllOut() {
    if (!S || S.busy || S.locked) return;
    const v = faceVolley();
    if (!v) return;
    clearMode();
    const foe = S.game.players[1];
    const lethal = v.dmg >= foe.life;
    S.sel = { kind: 'allout' };
    S.hl = new Set(faceAttackers().map((a) => a.uid).concat(['face1']));
    setPrompt('一斉攻撃：' + v.count + '体で相手のライフへ　合計' + v.dmg + 'ダメージ' + (lethal ? '（とどめ）' : ''), [
      { label: '攻撃する', cls: 'primary', onClick: () => { clearMode(); onAllOut(); } },
      { label: 'やめる', cls: 'ghost', onClick: () => { clearMode(); refresh(); } },
    ]);
    refresh();
  }
  async function onAllOut() {
    if (!S || S.busy) return;
    const g = S.game;
    let guard = 0;
    while (S && g.winner === null && guard++ < 300) {
      const list = faceAttackers();
      if (!list.length) break;
      const a = list[0];
      const before = g.findCard(a.uid);
      const leftBefore = before ? before.attacksLeft : 0;
      if (S.anim && list.length > 2) S.anim.fast = true;   // keep long volleys snappy
      await runAction(() => g.attack(0, a.uid, 'face'), { attackUid: a.uid, target: 'face' });
      if (!S || g.winner !== null) return;
      const after = g.findCard(a.uid);
      // no progress (attack refused / still able with same count) → stop instead of looping forever
      if (after && after.attacksLeft === leftBefore && faceAttackers().some((x) => x.uid === a.uid)) break;
    }
    if (S) refresh();
  }

  async function onEndTurn() {
    if (!S || S.busy || S.game.active !== 0) return;
    clearMode();
    await runAction(() => S.game.endTurn(0));
    await enemyPhase();
  }

  // run one human action with animations; then (if needed) the enemy turn is handled by caller
  async function runAction(fn, meta) {
    if (!S || S.busy) return;
    S.busy = true;
    renderActionBar();
    try {
      const r = await fn();
      if (r && r.ok === false && r.reason) ui.toast(illegalText(r.reason), { kind: 'warn' });
    } catch (e) {
      console.error(e);
      ui.toast('処理に失敗: ' + (e && e.message || e), { kind: 'bad' });
    }
    S.busy = false;
    await drain();
    refresh();
    if (S.game.winner !== null) return finish();
  }
  function illegalText(reason) {
    return { mana: 'マナが足りない', badTarget: 'その対象は選べない', cannotAttack: '攻撃できない', notYourTurn: '自分の番ではない', gameOver: '戦闘は終わっている', needsTarget: '対象が必要' }[reason] || '今はできない';
  }

  // ---------------------------------------------------------------- enemy turn
  async function enemyPhase() {
    const g = S.game;
    while (S && g.winner === null && g.active === 1 && g.phase === 'main') {
      S.busy = true; S.enemyTurn = true;
      renderActionBar();
      const A = S.anim;
      if (settings().autoFast) A.speed = 0.45;
      const remove = A.overlayTurn('敵のターン');
      await A.wait(500);
      remove();
      const take = (G.AI && typeof G.AI.takeTurn === 'function') ? G.AI.takeTurn.bind(G.AI)
        : (ui.devBattle && typeof ui.devBattle.naiveTurn === 'function' ? ui.devBattle.naiveTurn : null);
      const turnNo = g.turn;
      try {
        if (take) await take(g, 1, { onStep: async () => { await drain(); refresh(); } });
      } catch (e) { console.error('AI failed', e); ui.toast('敵AIが失敗したためターンを終了', { kind: 'warn' }); }
      await drain();
      if (g.winner === null && g.active === 1 && g.phase === 'main' && g.turn === turnNo) {
        try { await g.endTurn(1); } catch (e) { console.error(e); }
        await drain();
      }
      A.speed = 1;
      S.enemyTurn = false;
      refresh();
    }
    if (!S) return;
    S.busy = false;
    refresh();
    if (g.winner !== null) return finish();
  }

  // ---------------------------------------------------------------- event drain (animations)
  function onEvent(payload, type) {
    if (!S) return;
    S.queue.push({ type, payload });
    if (type === 'log' && S.logPanel) S.logPanel.append(payload);
    // events arriving while no UI action is in flight (card effects fired from
    // elsewhere, debug tools, timers) still get animated and can end the battle
    if (!S.busy && !S.draining && !S.idleDrain) {
      S.idleDrain = true;
      Promise.resolve().then(async () => {
        if (!S) return;
        S.idleDrain = false;
        if (S.busy || S.draining) return;
        await drain();
        if (!S) return;
        refresh();
        if (S.game.winner !== null) finish();
      });
    }
  }
  async function drain() {
    if (!S) return;
    if (S.draining) return S.draining;
    S.draining = (async () => {
      const A = S.anim;
      while (S && S.queue.length) {
        if (S.queue[0].type === 'loopRun') S.queue = squashLoops(S.queue);
        const ev = S.queue.shift();
        if (ui.sfx) ui.sfx.battle(ev.type, ev.payload, S.game);
        try { await animateEvent(ev.type, ev.payload, A); } catch (e) { if (S) console.error(e); }
      }
    })();
    const st = S;
    await st.draining;
    // the screen may have been unmounted while animating (S === null) — only reset our own state
    st.draining = null;
    if (st.anim) st.anim.fast = false;
  }
  // SPEC (テンポ): a loop shows only the shortcut's result. Between loopRun and loopEnd keep only the
  // events that matter (and the last iteration count); animating every summon/destroy of a 999-周 loop
  // took minutes (QA).
  const LOOP_KEEP = { overflow: 1, loopVoid: 1, win: 1, deckout: 1, forecast: 1, forecastCancelled: 1, enrage: 1, extraTurn: 1 };
  function squashLoops(q) {
    const out = [];
    let inLoop = false, lastIt = null;
    q.forEach((ev) => {
      if (ev.type === 'loopRun') { inLoop = true; out.push(ev); return; }
      if (ev.type === 'loopEnd') { inLoop = false; if (lastIt) out.push(lastIt); lastIt = null; out.push(ev); return; }
      if (!inLoop) { out.push(ev); return; }
      if (ev.type === 'loopIteration') lastIt = ev;
      else if (LOOP_KEEP[ev.type]) out.push(ev);
    });
    if (lastIt) out.push(lastIt);
    return out;
  }
  async function animateEvent(type, p, A) {
    const g = S.game;
    const name = (defId) => safe(() => G.CardDB.get(defId).name, '？');
    switch (type) {
      case 'coinToss':
        await A.banner({ eyebrow: 'コイントス', title: g.players[p.first].name + 'が先攻', kind: p.first === 0 ? 'mine' : 'theirs', ms: 1100 });
        break;
      case 'turnStart':
        refresh();
        if (p.extra) await A.banner({ eyebrow: '追加ターン', title: g.players[p.who].name + 'の連続' + p.streak + 'ターン目', kind: 'extra', ms: 1000 });
        else await A.banner({ title: p.who === 0 ? 'あなたの番' : g.players[1].name + 'の番', kind: p.who === 0 ? 'mine' : 'theirs', ms: 700 });
        break;
      case 'cardPlayed': {
        refresh();
        const inst = g.findCard(p.uid) || { defId: p.defId };
        if (p.isCopy) { await A.showCard(inst, { ms: 220 }); break; }
        const from = p.who === 1 ? el('[data-hand="1"]') : null;
        if (from) await A.flyCard(inst, from, null, { ms: 320 });
        await A.showCard(inst, { ms: p.who === 1 ? 650 : 420 });
        break;
      }
      case 'summon': {
        refresh();
        const c = cardEl(p.uid);
        if (c) await A.pulse(c, p.isPhantom ? 'anim-fadein' : 'anim-pop', 300);
        break;
      }
      case 'phantom': {
        refresh();
        const c = cardEl(p.uid);
        if (c) await A.pulse(c, 'anim-pop', 180);
        break;
      }
      case 'damage': {
        const target = p.target === 'player' ? faceEl(p.who) : cardEl(p.target);
        if (p.amount > 0) {
          A.number(target || faceEl(p.who), '−' + p.amount, p.target === 'player' ? 'dmg face' : 'dmg');
          if (target) A.shake(target);
          refresh();
          await A.wait(p.target === 'player' ? 380 : 260);
        }
        break;
      }
      case 'heal':
        A.number(faceEl(p.who), '+' + p.amount, 'heal'); refresh(); await A.wait(250); break;
      case 'destroy': {
        const c = cardEl(p.uid);
        if (c) { c.classList.add('dying'); await A.wait(320); }
        refresh();
        break;
      }
      case 'vanish':
        refresh(); break;
      case 'draw': {
        if (p.who === 0) {
          refresh();
          const c = cardEl(p.uid);
          if (c) await A.pulse(c, 'anim-pop', 220);
        } else {
          const hs = el('[data-hand="1"]');
          if (hs) await A.pulse(hs, 'anim-pop', 220);
          refresh();
        }
        break;
      }
      case 'discard': case 'moveZone': case 'steal': case 'crestRemoved': case 'buff': case 'statusChange': case 'manaChange': case 'shuffle': case 'reserveActivate': case 'reserveExpire': case 'restore': case 'ability':
        refresh(); break;
      case 'crestSet': case 'fieldSet': case 'timedSet': case 'seal': {
        refresh();
        const c = p.uid != null ? cardEl(p.uid) : null;
        if (c) await A.pulse(c, 'anim-pop', 260);
        if (type === 'seal' && !p.removed) await A.banner({ eyebrow: '封印', title: '鍵 ' + p.keys + ' / 5', kind: 'doom', ms: 800 });
        break;
      }
      case 'reserveSet':
        refresh(); await A.banner({ title: '予約魔法が仕掛けられた', kind: p.who === 0 ? 'mine' : 'theirs', ms: 800 }); break;
      case 'timedTick': {
        refresh();
        const c = cardEl(p.uid);
        if (c) await A.pulse(c, 'anim-flash', 300);
        break;
      }
      case 'timedFire':
        refresh(); await A.banner({ eyebrow: '時限', title: name(p.defId) + 'が発動', kind: 'time', ms: 900 }); break;
      case 'curse': {
        refresh();
        const f = faceEl(p.who);
        if (p.amount > 0) { A.number(f, '呪+' + p.amount, 'curse'); await A.wait(300); }
        break;
      }
      case 'chain': {
        const prev = S.lastChain[p.who] || 0;
        const now = p.effective != null ? p.effective : p.chain;
        S.lastChain[p.who] = now;
        refresh();
        const ce = el('.bt-chain');
        if (ce && now > prev) {
          A.pulse(ce, 'tick', 200);
          if ((prev < 10 && now >= 10) || (prev < 50 && now >= 50)) {
            await A.banner({ eyebrow: '連鎖', title: now + '連鎖', sub: now >= 50 ? '嵐になった' : '勢いが乗ってきた', kind: now >= 50 ? 'storm' : 'chain', ms: 900 });
          }
        }
        break;
      }
      case 'extraTurn':
        refresh(); await A.banner({ eyebrow: '追加ターン', title: g.players[p.who].name + 'は次も動ける', kind: 'extra', ms: 1000 }); break;
      case 'skipTurn':
        refresh(); await A.banner({ title: g.players[p.who].name + 'のターンはスキップ', kind: 'time', ms: 900 }); break;
      case 'hazardChange':
        refresh();
        if (p.who === 1 && p.hazard >= 80 && (S.lastHazard || 0) < 80) await A.banner({ eyebrow: '危険度', title: '敵のコンボが近い', sub: '今が妨害の時', kind: 'hazard', ms: 1200 });
        if (p.who === 1) S.lastHazard = p.hazard;
        break;
      case 'forecast':
        refresh();
        await A.banner({ eyebrow: '予告', title: p.text || '次のターン、何かが起こる', sub: g.players[p.who].name, kind: 'forecast', ms: 2400 });
        break;
      case 'forecastCancelled':
        refresh(); await A.banner({ title: '予告は取り消された', kind: 'mine', ms: 1000 }); break;
      case 'loopDetected':
        refresh();
        if (p.who === 0) { S.pendingLoopOffer = p; }
        else await A.banner({ eyebrow: 'ループ検出', title: g.players[1].name + 'がループに入った', sub: p.length + '手の繰り返し', kind: 'loop', ms: 1200 });
        break;
      case 'loopRun':
        S.loopCount = 0;
        A.sticky('loop', { title: 'ループ実行中 ×' + (p.times === 'inf' ? '∞' : p.times), sub: '0 周', kind: 'loop' });
        break;
      case 'loopIteration':
        S.loopCount = p.iteration;
        A.sticky('loop', { title: 'ループ実行中', sub: p.iteration + ' 周', kind: 'loop' });
        if (p.iteration % 10 === 0) { refresh(); await A.wait(40); }
        break;
      case 'loopEnd':
        A.unsticky('loop'); refresh();
        if (p.reason !== 'overflow') await A.banner({ eyebrow: 'ループ終了', title: p.iterations + ' 周', sub: { done: '指定回数を回した', win: '決着', illegal: '手が続かなくなった', diverged: '盤面が変わった', void: '零の聖域に無効化された' }[p.reason] || '', kind: 'loop', ms: 1100 });
        break;
      case 'loopVoid':
        await A.banner({ title: '零の聖域', sub: 'ループの2周目以降は無効', kind: 'time', ms: 1000 }); break;
      case 'overflow':
        refresh();
        S.root.classList.add('overflow');
        await A.banner({ eyebrow: 'OVERFLOW', title: 'オーバーフロー', sub: '999周で強制終了', kind: 'overflow', ms: 2200 });
        S.root.classList.remove('overflow');
        break;
      case 'deckout':
        await A.banner({ title: g.players[p.who].name + 'の山札が尽きた', kind: 'doom', ms: 1000 }); break;
      case 'reveal': {
        // 魔封じの猫 / 先読みの賢者 etc.: show the human what was revealed (the AI reads it from the log)
        if (p.viewer !== 0) break;
        refresh();
        const cards = (p.uids || []).map((u) => g.findCard(u)).filter(Boolean);
        const title = '相手の' + (p.zone === 'deck' ? '山札の上' : '手札') + 'を見た';
        if (cards.length) await A.banner({ eyebrow: '公開', title, sub: cards.map((c) => name(c.defId)).join('、'), kind: 'mine', ms: 1800 });
        else await A.banner({ eyebrow: '公開', title, sub: 'カードはなかった', kind: 'mine', ms: 1000 });
        break;
      }
      case 'relicAbility':
        refresh(); break;
      case 'enrage':
        // boss 発狂 (SPEC: each boss announces its enraged state) — QA: was not shown at all
        refresh(); await A.banner({ eyebrow: '発狂', title: g.players[p.who].name + 'が本気になった', sub: p.text || '', kind: 'boss', ms: 2200 }); break;
      case 'theftCountdown':
        refresh(); break;
      case 'illegal':
        break;
      case 'win':
        refresh(); break;
      default:
        break;
    }
    if (!S) return;
    if (type !== 'log' && S.pendingLoopOffer && !S.queue.length && S.game.winner === null && S.game.active === 0) {
      const det = S.pendingLoopOffer; S.pendingLoopOffer = null;
      refresh();
      // QA fix: offer the loop *after* this drain has finished. Awaiting it here (inside drain) deadlocked:
      // runLoopUI awaits drain(), which returned the very drain that was waiting for runLoopUI → the UI froze.
      const session = S;
      setTimeout(() => { if (S === session && S.game.winner === null) offerLoop(S.game.loop.detected || det, true); }, 0);
    }
  }

  // loop offer: ×10 / ×100 / ∞ / continue by hand
  async function offerLoop(det, auto) {
    if (!S || S.loopOffering) return;
    S.loopOffering = true;
    const A = S.anim;
    const choice = await A.banner({
      eyebrow: 'ループ検出', title: '同じ盤面が繰り返されている', sub: (det.length || (det.cycle && det.cycle.length) || '?') + '手の繰り返し。まとめて回せる',
      kind: 'loop', buttons: [
        { label: '×10', value: 10 }, { label: '×100', value: 100 }, { label: '∞', value: 'inf', primary: true }, { label: '自分で回す', value: null, ghost: true },
      ],
    });
    S.loopOffering = false;
    if (choice == null) return;
    await runLoopUI(choice);
  }
  async function runLoopUI(times) {
    const g = S.game;
    if (S.draining) await S.draining;
    if (!S || S.busy) return;
    S.busy = true; renderActionBar();
    const A = S.anim;
    if (settings().autoFast) A.speed = 0.3;
    let result = null;
    try {
      if (times === 'inf') {
        A.sticky('loop', { title: 'ループ実行中 ×∞', sub: '決着まで', kind: 'loop' });
        await A.wait(350);
        result = await g.runLoop(0, 'inf');
      } else {
        result = await g.runLoop(0, times); // events are squashed by drain() → only the result is shown
      }
    } catch (e) { console.error(e); ui.toast('ループ実行に失敗', { kind: 'bad' }); }
    await drain();
    A.unsticky('loop');
    if (result && result.reason === 'overflow' && g.winner === null && typeof g.declareLoopWin === 'function') {
      // SPEC: a loop neither side can stop is a win for the one who started it.
      await A.banner({ title: '止められない無限ループ', sub: '仕掛けた側の勝ち', kind: 'overflow', ms: 1600 });
      g.declareLoopWin(0);
      await drain();
    }
    A.speed = 1;
    S.busy = false;
    refresh();
    if (g.winner !== null) return finish();
  }

  // ---------------------------------------------------------------- human chooser (ctx.pick / ctx.choose)
  async function humanChooser(spec, cands, game) {
    if (!S) return G.Engine.defaultChooser(spec, cands, game);
    await drain();
    refresh();
    if (spec.kind === 'option') {
      const v = await ui.modal({ title: spec.prompt || '選ぶ', dismissable: false, body: null, buttons: cands.map((o, i) => ({ label: o.label || o.id, value: o.id, primary: i === 0 })) });
      return v == null ? cands[0].id : v;
    }
    if (spec.kind === 'player') {
      const picked = await new Promise((res) => {
        enterTargetMode(cands, spec.prompt || 'プレイヤーを選ぶ', (p) => res(p), { count: 1, cancelable: !!spec.optional, onCancel: () => res([]) });
      });
      S.locked = false;
      return picked[0] || null;
    }
    const visible = cands.every((c) => c.zone === 'board' || c.zone === 'phantoms' || c.zone === 'crests' || c.zone === 'field' || c.zone === 'timed');
    if (visible && cands.length) {
      const picked = await new Promise((res) => {
        enterTargetMode(cands, spec.prompt || '対象を選ぶ', (p) => res(p), { count: spec.count || 1, upTo: spec.upTo, optional: spec.optional, cancelable: !!spec.optional, onCancel: () => res([]) });
        S.mode.promptBase = spec.prompt || '対象を選ぶ';
      });
      return picked;
    }
    const picked = await pickFromList(spec, cands, { cancelable: !!spec.optional });
    return picked || [];
  }

  // ---------------------------------------------------------------- menu / log / finish
  async function openMenu() {
    const v = await ui.modal({ title: '戦闘メニュー', body: null, buttons: [
      { label: '戻る', value: 'back', ghost: true },
      { label: 'ログを見る', value: 'log' },
      { label: '降参する', value: 'surrender', danger: true },
    ] });
    if (v === 'log') toggleLog(true);
    if (v === 'surrender') {
      const ok = await ui.confirm('降参しますか？\nこの戦闘は敗北になります。', { ok: '降参する', cancel: '戻る', danger: true });
      if (ok && S && S.game.winner === null) { S.game.surrender(0); await drain(); finish(); }
    }
  }
  function toggleLog(force) {
    const panel = el('.bt-log');
    if (!panel) return;
    const open = force === true ? true : !panel.classList.contains('open');
    panel.classList.toggle('open', open);
    if (open && S.logPanel) S.logPanel.scrollToEnd();
  }

  async function finish() {
    if (!S || S.finished) return;
    S.finished = true;
    const g = S.game;
    const A = S.anim;
    S.busy = true; refresh();
    const won = g.winner === 0, draw = g.winner === null;
    const edef = S.params.enemyDef || {};
    const reason = HUD.reasonText(g.winReason);
    await A.wait(400);
    const lastWords = won ? (edef.lastWords || edef.finalWords || edef.defeatText || S.params.lastWords) : (edef.winText || edef.victoryText || null);
    const diary = won ? (edef.diary || edef.diaryFragment || S.params.diary) : null;
    const overlay = h('div', { class: 'bt-result ' + (draw ? 'draw' : won ? 'win' : 'lose') },
      h('div', { class: 'bt-result-in' },
        h('div', { class: 'r-title' }, draw ? '引き分け' : won ? '勝利' : '敗北'),
        h('div', { class: 'r-reason' }, reason ? '決着：' + reason : ''),
        lastWords ? h('blockquote', { class: 'r-words' }, lastWords) : null,
        diary ? h('div', { class: 'r-diary' }, h('span', null, '日記の切れ端'), h('p', null, diary)) : null,
        h('div', { class: 'r-stats t-s' },
          h('span', null, 'ターン ', h('b', { class: 't-num' }, String(g.turn))),
          h('span', null, '最大連鎖 ', h('b', { class: 't-num' }, String(g.stats.maxChain || 0))),
          g.stats.longestLoop ? h('span', null, '最長ループ ', h('b', { class: 't-num' }, String(g.stats.longestLoop))) : null,
          g.stats.longestStreak > 1 ? h('span', null, '連続ターン ', h('b', { class: 't-num' }, String(g.stats.longestStreak))) : null),
        h('button', { class: 'btn primary lg', type: 'button', onClick: () => end() }, '続ける')));
    S.root.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }
  function end() {
    if (!S) return;
    const g = S.game;
    const result = { won: g.winner === 0, winner: g.winner, reason: g.winReason, turns: g.turn, stats: g.stats, game: g };
    const cb = S.params.onEnd;
    teardown();
    if (typeof cb === 'function') { try { cb(result); } catch (e) { console.error(e); } }
    else ui.app.show('menu', null, { replace: true, transition: 'fade' });
  }
  function teardown() {
    if (!S) return;
    try { S.game.off('*', S.listener); } catch (e) { /* ignore */ }
    try { if (S.anim) S.anim.destroy(); } catch (e) { /* ignore */ }
    if (S.game.players[0].chooser === S.chooser) S.game.players[0].chooser = S.prevChooser || G.Engine.defaultChooser;
    if (S.mq) S.mq.removeEventListener('change', S.onMq);
    try { if (S.detachDrag) S.detachDrag(); } catch (e) { /* ignore */ }
    if (S.onResize) window.removeEventListener('resize', S.onResize);
    removePeek();
    S = null;
  }

  // ---------------------------------------------------------------- mount
  function build(root) {
    const logPanel = HUD.logPanel(S.game);
    S.logPanel = logPanel;
    const frame = h('div', { class: 'bt' },
      h('div', { class: 'bt-enemy' },
        h('div', { class: 'bt-enemy-strip' }), h('div', { class: 'bt-enemy-zones' }), h('div', { class: 'bt-enemy-board' })),
      h('div', { class: 'bt-mid' }),
      h('div', { class: 'bt-me' },
        h('div', { class: 'bt-my-board' }), h('div', { class: 'bt-my-zones' }), h('div', { class: 'bt-my-strip' })),
      h('div', { class: 'bt-prompt', hidden: true }),
      h('div', { class: 'bt-hand' }),
      h('div', { class: 'bt-handnav' },
        h('button', { class: 'bt-hn-btn l', type: 'button', 'aria-label': '手札を左へ', onClick: () => scrollHand(-1) }, '‹'),
        h('button', { class: 'bt-hn-btn r', type: 'button', 'aria-label': '手札を右へ', onClick: () => scrollHand(1) }, '›'),
        h('div', { class: 'bt-hn-bar' }, h('span', { class: 'bt-hn-count' }), h('span', { class: 'bt-hn-track' }, h('i', { class: 'bt-hn-thumb' })))),
      h('div', { class: 'bt-actions' }),
      h('aside', { class: 'bt-log' },
        h('div', { class: 'bt-loghead' }, h('span', null, '戦闘ログ'), h('button', { class: 'btn-icon', type: 'button', 'aria-label': '閉じる', onClick: () => toggleLog(false) }, ui.icon('close'))),
        logPanel));
    root.appendChild(frame);
    if (ui.battleDrag) S.detachDrag = ui.battleDrag.attach(frame, dragApi());
    // one-time hint for the drag gestures (stored in save meta so it shows once per player)
    try {
      const meta = G.Save && G.Save.meta ? G.Save.meta() : null;
      if (meta && !(meta.hints && meta.hints.drag)) {
        setTimeout(() => { if (S) ui.toast('カードは上へドラッグして使える。モンスターは敵へドラッグで攻撃。', { ms: 4200 }); }, 2600);
        G.Save.updateMeta((m) => { m.hints = Object.assign({}, m.hints, { drag: true }); });
      }
    } catch (e) { /* hints are optional */ }
    // hand scroll guide follows the hand (scroll events don't bubble — listen in the capture phase)
    frame.addEventListener('scroll', (e) => { if (e.target && e.target.classList && e.target.classList.contains('bt-hand')) updateHandNav(); }, true);
    S.onResize = () => { if (S) { updateHandNav(); renderPeek(); } };
    window.addEventListener('resize', S.onResize);
    // tap anywhere during enemy sequences → fast-forward
    frame.addEventListener('pointerdown', () => { if (S && (S.enemyTurn || S.draining) && S.anim) { S.anim.fast = true; S.anim.skip(); } }, true);
  }

  async function mount(root, params) {
    params = params || {};
    if (!params.game) {
      root.appendChild(h('div', { class: 'col' }, h('div', { class: 'stub' }, h('div', { class: 'stub-mark' }, '戦闘'), h('p', null, 'ゲームが渡されていません。'),
        h('button', { class: 'btn', type: 'button', onClick: () => ui.app.show('menu', null, { replace: true }) }, 'メニューへ'))));
      return;
    }
    if (S) teardown();
    const game = params.game;
    const edef = params.enemyDef || (game.players[1].enemyDefId && G.EnemyDB && G.EnemyDB.has(game.players[1].enemyDefId) ? G.EnemyDB.get(game.players[1].enemyDefId) : null) || {};
    params.enemyDef = edef;
    S = { root, game, params, queue: [], hl: new Set(), sel: null, mode: null, busy: true, lastChain: {}, lastHazard: 0, abilities: [] };
    S.enemyLineage = edef.lineage || 'generic';
    S.desktop = window.matchMedia('(min-width: 1024px)').matches;
    S.mq = window.matchMedia('(min-width: 1024px)');
    S.onMq = (e) => { if (S) { S.desktop = e.matches; refresh(); } };
    S.mq.addEventListener('change', S.onMq);
    build(root);
    S.anim = ui.battleAnim.create(root.querySelector('.bt'));
    S.listener = onEvent;
    game.on('*', onEvent);
    S.prevChooser = game.players[0].chooser;
    S.chooser = humanChooser;
    game.players[0].chooser = humanChooser;
    refresh();

    // The intro / coin toss / first enemy turn can take several seconds; mount() must not wait for
    // them, otherwise the router keeps the previous screen (map HUD) stacked over the battle (QA fix).
    const session = S;
    (async () => {
      if (edef.name || edef.introText) {
        await session.anim.banner({ eyebrow: edef.kind === 'boss' ? 'ボス' : edef.kind === 'elite' ? 'エリート' : '敵', title: edef.name || game.players[1].name, sub: edef.introText || '', kind: edef.kind === 'boss' ? 'boss' : 'theirs', ms: edef.introText ? 2200 : 1200 });
        if (S !== session) return;
        if (edef.teaches) ui.toast(edef.teaches, { ms: 3200 });
      }
      if (game.phase === 'setup') {
        try { await game.start(); } catch (e) { console.error(e); ui.toast('戦闘開始に失敗: ' + e.message, { kind: 'bad' }); }
      }
      if (S !== session) return;
      await drain();
      if (S !== session) return;
      S.busy = false;
      refresh();
      if (game.winner !== null) return finish();
      if (game.active === 1) await enemyPhase();
    })().catch((e) => console.error(e));
  }

  ui.app.register('battle', {
    transition: 'fade',
    mount,
    unmount() { teardown(); },
  });

  ui.battle = {
    start(opts) { return ui.app.show('battle', opts || {}, { transition: 'fade' }); },
    current() { return S ? S.game : null; },
    refresh,
  };
})(globalThis.G = globalThis.G || {});
