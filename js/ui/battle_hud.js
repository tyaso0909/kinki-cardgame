/* 禁域 — js/ui/battle_hud.js
   Pure render helpers for the battle screen (no interaction logic, no
   engine calls that mutate). battle.js owns state and wires taps.

   G.ui.battleHud.strip(game, pIdx, view)          player name / life / mana / counts
   G.ui.battleHud.zones(game, pIdx, view)          crests / timed / seals / curse / vault / reserves chips
   G.ui.battleHud.board(game, pIdx, view)          monsters + compressed phantom stacks
   G.ui.battleHud.mid(game, view)                  turn indicator, field, hazard meter, chain counter
   G.ui.battleHud.hand(game, view)                 human hand row
   G.ui.battleHud.logPanel(game)                   log list element (+ .append(entry))
   G.ui.battleHud.reasonText(reason)               JP label for winReason
   view = { onCard(inst, el, where), onFace(pIdx), onChip(kind, inst), isHighlighted(uid),
            isSelected(uid), abilities: [{uid,label}], onAbility(uid), cardSize }
*/
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const h = ui.h;

  const REASON = {
    life: 'ライフ', deckout: '山札切れ', curse: '呪詛', seals: '封印', prophecy: '預言',
    loopInfinite: 'ループ', surrender: '降参', turnLimit: 'ターン制限', special: '特殊勝利',
  };
  function reasonText(r) { return REASON[r] || r || ''; }

  function defOf(inst) { try { return G.CardDB.get(inst.defId); } catch (e) { return null; } }
  function nameOf(inst) { const d = defOf(inst); return d ? d.name : '？'; }
  function lineageOf(inst) { const d = defOf(inst); return d && d.lineage ? d.lineage : 'generic'; }

  // ---------- player strip ----------
  function strip(game, pIdx, view) {
    const p = game.players[pIdx];
    const me = pIdx === 0;
    const lifePct = Math.max(0, Math.min(100, (p.life / Math.max(1, p.maxLife)) * 100));
    const lifeCls = lifePct <= 25 ? ' low' : lifePct <= 50 ? ' mid' : '';
    const face = h('button', {
      class: 'bt-face' + (view.isHighlighted('face' + pIdx) ? ' hl' : ''),
      type: 'button', 'data-face': String(pIdx),
      'aria-label': p.name + ' ライフ' + p.life,
      onClick: () => view.onFace(pIdx),
    },
      h('span', { class: 'bt-name' }, p.name),
      h('span', { class: 'bt-life' + lifeCls, 'data-p': String(pIdx) },
        h('span', { class: 'bar' }, h('i', { style: { '--v': lifePct + '%' } })),
        h('span', { class: 'num t-num' }, h('b', null, String(p.life)), h('small', null, '/' + p.maxLife))));

    const manaPips = [];
    const showPips = p.maxMana <= 10;
    if (showPips) for (let i = 0; i < p.maxMana; i++) manaPips.push(h('i', { class: i < p.mana ? 'on' : '' }));
    const mana = h('span', { class: 'bt-mana' + (p.maxMana > 5 ? ' many' : ''), 'data-p': String(pIdx), title: 'マナ' },
      h('span', { class: 'pips' }, manaPips),
      h('span', { class: 't-num' }, h('b', null, String(p.mana)), h('small', null, '/' + p.maxMana)));

    const counts = h('span', { class: 'bt-counts' },
      me ? null : h('button', { class: 'bt-handstack' + ((view.revealedHand || []).length ? ' seen' : ''), type: 'button', 'data-hand': '1', 'aria-label': '相手の手札 ' + p.hand.length + '枚' + ((view.revealedHand || []).length ? '（' + view.revealedHand.length + '枚が見えている）' : ''), onClick: () => view.onChip('enemyHand', null) },
        h('span', { class: 'bt-mini facedown' }), h('b', { class: 't-num' }, String(p.hand.length)),
        (view.revealedHand || []).length ? h('small', { class: 'seen-tag' }, '見') : null),
      h('button', { class: 'bt-pile', type: 'button', 'data-deck': String(pIdx), 'aria-label': '山札 ' + p.deck.length + '枚', onClick: () => view.onChip('deck', null, pIdx) },
        '山', h('b', { class: 't-num' }, String(p.deck.length))),
      h('button', { class: 'bt-pile', type: 'button', 'data-grave': String(pIdx), 'aria-label': '墓地 ' + p.grave.length + '枚', onClick: () => view.onChip('grave', null, pIdx) },
        '墓', h('b', { class: 't-num' }, String(p.grave.length))),
      p.exile.length ? h('button', { class: 'bt-pile dim', type: 'button', 'aria-label': '除外 ' + p.exile.length + '枚', onClick: () => view.onChip('exile', null, pIdx) },
        '除', h('b', { class: 't-num' }, String(p.exile.length))) : null);

    return h('div', { class: 'bt-strip' + (game.active === pIdx ? ' active' : '') }, face, mana, counts);
  }

  // ---------- zone chips ----------
  function chip(cls, inst, label, extra, view, kind) {
    const lin = inst ? lineageOf(inst) : 'generic';
    const hl = inst && view.isHighlighted(inst.uid);
    return h('button', {
      class: 'bt-chip lin-' + lin + ' ' + cls + (hl ? ' hl' : '') + (inst && view.isSelected(inst.uid) ? ' sel' : ''),
      type: 'button',
      dataset: inst ? { uid: String(inst.uid), defId: inst.defId } : null,
      onClick: () => view.onChip(kind, inst),
    }, h('span', { class: 'lbl' }, label), extra != null ? h('b', { class: 't-num' }, String(extra)) : null);
  }

  function zones(game, pIdx, view) {
    const p = game.players[pIdx];
    const out = [];
    p.crests.forEach((c) => {
      const ab = (view.abilities || []).find((a) => a.uid === c.uid);
      const el = chip('crest', c, nameOf(c), c.timedCount != null ? '⌛' + c.timedCount : null, view, 'crest');
      if (ab && pIdx === 0) {
        out.push(h('span', { class: 'bt-chipwrap' }, el,
          h('button', { class: 'bt-ability', type: 'button', onClick: () => view.onAbility(ab.uid) }, ab.label || '能力')));
      } else out.push(el);
    });
    p.timed.forEach((c) => out.push(chip('timed', c, nameOf(c), c.timedCount, view, 'timed')));
    const keys = typeof game.distinctKeys === 'function' ? game.distinctKeys(pIdx) : p.seals.length;
    if (p.seals.length || keys) out.push(chip('seal' + (keys >= 4 ? ' hot' : ''), null, '鍵', keys + '/5', view, 'seals:' + pIdx));
    if (p.curse > 0) out.push(chip('curse' + (p.curse >= p.curseLimit - 5 ? ' hot' : ''), null, '呪詛', p.curse + '/' + p.curseLimit, view, 'curse:' + pIdx));
    if (p.vault.length) out.push(chip('vault', null, '蒐集箱', p.vault.length, view, 'vault:' + pIdx));
    if (p.reserves.length) out.push(chip('reserve', null, '予約', p.reserves.length, view, 'reserves:' + pIdx));
    // 時間泥棒の発狂「時間の窃盗」: SPEC — 奪われるまでの残りターン数は画面に表示する (QA)
    if (p.flags && p.flags.enraged && p.flags.turnsUntilTheft != null) out.push(chip('curse hot', null, '窃盗まで', p.flags.turnsUntilTheft, view, 'theft:' + pIdx));
    const wrap = h('div', { class: 'bt-zones', 'data-p': String(pIdx) }, out);
    if (!out.length) wrap.classList.add('empty');
    return wrap;
  }

  // ---------- board ----------
  // keyword badges on board cards (the small board cards hide the keyword chips; 守護 has its own frame colour)
  function kwBadges(el, inst) {
    const kws = inst.keywords || [];
    const badges = (ui.KEYWORDS || []).filter(function (k) { return kws.indexOf(k.id) >= 0 && k.id !== 'guard'; });
    if (kws.indexOf('ward') >= 0) el.classList.add('is-ward');
    if (kws.indexOf('untouchable') >= 0) el.classList.add('is-untouchable');
    const items = badges.map(function (k) { return { id: k.id, name: k.name }; });
    if (inst.oboro) items.push({ id: 'oboro', name: '朧' });
    if (items.length) el.appendChild(h('span', { class: 'bt-kwb', 'aria-label': items.map(function (k) { return k.name; }).join('・') }, items.map(function (k) { return h('i', { class: 'kwb-' + k.id }, k.name); })));
  }
  function monsterCard(game, inst, view, where) {
    const def = defOf(inst);
    const snapshot = Object.assign({}, inst, { atk: game.atkOf(inst), hp: game.hpOf(inst), maxHp: game.maxHpOf(inst) });
    const canAct = inst.owner === 0 && game.active === 0 && game.phase === 'main' && typeof game.canAttackWith === 'function' && game.canAttackWith(0, inst);
    const el = ui.renderCard(snapshot, {
      size: view.cardSize || 's',
      showCost: false,
      onClick: (x, e, cardEl) => view.onCard(inst, cardEl, where),
      selected: view.isSelected(inst.uid),
    });
    if (view.isHighlighted(inst.uid)) el.classList.add('hl');
    if (canAct) el.classList.add('can-act');
    if (inst.attacksLeft <= 0 && game.active === inst.owner) el.classList.add('spent');
    if (def && def.keywords && def.keywords.indexOf('guard') >= 0) el.classList.add('is-guard');
    kwBadges(el, inst);
    const ab = (view.abilities || []).find((a) => a.uid === inst.uid);
    if (ab && inst.owner === 0) {
      return h('span', { class: 'bt-slot has-ab' }, el,
        h('button', { class: 'bt-ability', type: 'button', onClick: () => view.onAbility(ab.uid) }, ab.label || '能力'));
    }
    return h('span', { class: 'bt-slot' }, el);
  }

  function board(game, pIdx, view) {
    const p = game.players[pIdx];
    const row = h('div', { class: 'bt-board' + (pIdx === 0 ? ' me' : ' enemy'), 'data-p': String(pIdx) });
    p.board.forEach((m) => row.appendChild(monsterCard(game, m, view, 'board')));
    // phantoms: compress by defId into stacks "×N"
    const groups = new Map();
    p.phantoms.forEach((ph) => { const g = groups.get(ph.defId) || []; g.push(ph); groups.set(ph.defId, g); });
    groups.forEach((list) => {
      const first = list.find((x) => view.isHighlighted(x.uid)) || list[0];
      const snapshot = Object.assign({}, first, { atk: game.atkOf(first), hp: game.hpOf(first), maxHp: game.maxHpOf(first) });
      const el = ui.renderCard(snapshot, {
        size: view.cardSize || 's', showCost: false, count: list.length,
        onClick: (x, e, cardEl) => view.onCard(first, cardEl, 'phantoms'),
        selected: list.some((x) => view.isSelected(x.uid)),
      });
      el.dataset.uids = list.map((x) => x.uid).join(',');
      kwBadges(el, first);
      if (list.some((x) => view.isHighlighted(x.uid))) el.classList.add('hl');
      if (first.owner === 0 && game.active === 0 && list.some((x) => game.canAttackWith(0, x))) el.classList.add('can-act');
      row.appendChild(h('span', { class: 'bt-slot stack' }, el));
    });
    if (!p.board.length && !p.phantoms.length) row.appendChild(h('span', { class: 'bt-empty' }, pIdx === 0 ? '自分の場' : '相手の場'));
    return row;
  }

  // ---------- middle strip ----------
  function mid(game, view) {
    const active = game.active;
    const mine = active === 0;
    const forecasted = typeof game.isForecasted === 'function' && game.isForecasted(1);
    const turn = h('div', { class: 'bt-turn' + (mine ? ' mine' : ' theirs') },
      h('span', { class: 'who' }, mine ? 'あなたの番' : '敵の番'),
      h('span', { class: 't-num tn' }, 'ターン' + game.turn),
      game.streak > 1 ? h('span', { class: 'streak' }, '連続', h('b', { class: 't-num' }, String(game.streak)), 'ターン') : null,
      forecasted ? h('span', { class: 'bt-ribbon', title: game.players[1].forecastText || '' }, '予告') : null);

    const f = game.field;
    const fieldEl = f
      ? h('button', { class: 'bt-field lin-' + lineageOf(f) + (view.isHighlighted(f.uid) ? ' hl' : ''), type: 'button', dataset: { uid: String(f.uid), defId: f.defId }, onClick: () => view.onChip('field', f) },
          ui.lineageGlyph(lineageOf(f)), h('span', { class: 'fname' }, nameOf(f)),
          h('small', null, game.fieldOwner === 0 ? '自分' : '相手'))
      : h('span', { class: 'bt-field none' }, 'フィールドなし');

    const hz = typeof game.hazard === 'function' ? game.hazard(1) : 0;
    const hazard = view.hideHazard
      // 盲目の預言者の眼帯: the meter is hidden (the 予告 banner still shows)
      ? h('div', { class: 'bt-hazard hidden lin-' + (view.enemyLineage || 'generic'), role: 'meter', 'aria-label': '危険度（眼帯で見えない）', title: '盲目の預言者の眼帯：危険度メーターが見えない' },
          h('span', { class: 'hlabel' }, '危険度'),
          h('span', { class: 'hbar' }, h('i', { style: { '--v': '0%' } }), h('em', null)),
          h('b', { class: 'hval t-num' }, '？'))
      : h('div', { class: 'bt-hazard lin-' + (view.enemyLineage || 'generic') + (hz >= 80 ? ' hot' : '') + (hz >= 100 ? ' full' : ''), role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(hz), 'aria-label': '危険度' },
          h('span', { class: 'hlabel' }, '危険度'),
          h('span', { class: 'hbar' }, h('i', { style: { '--v': hz + '%' } }), h('em', null)),
          h('b', { class: 'hval t-num' }, String(hz)));

    const chainN = typeof game.chainOf === 'function' ? game.chainOf(active) : game.players[active].chain;
    const chain = h('div', { class: 'bt-chain' + (chainN >= 50 ? ' storm' : chainN >= 10 ? ' hot' : '') + (mine ? '' : ' theirs'), 'data-chain': String(chainN) },
      h('span', { class: 'clabel' }, '連鎖'), h('b', { class: 't-num cval' }, String(chainN)));

    return h('div', { class: 'bt-mid' }, turn, h('div', { class: 'bt-midrow' }, fieldEl, hazard, chain));
  }

  // ---------- hand ----------
  function hand(game, view) {
    const p = game.players[0];
    const playable = game.active === 0 && game.phase === 'main' ? game.getPlayable(0) : [];
    const byUid = new Map(playable.map((x) => [x.uid, x]));
    const row = h('div', { class: 'bt-hand' + (view.fan ? ' fan' : ''), role: 'list' });
    const n = p.hand.length;
    p.hand.forEach((c, i) => {
      const pl = byUid.get(c.uid);
      const el = ui.renderCard(c, {
        size: view.handSize || 's',
        cost: pl ? pl.cost : (typeof game.costOf === 'function' ? game.costOf(0, c) : undefined),
        onClick: (x, e, cardEl) => view.onCard(c, cardEl, 'hand'),
        selected: view.isSelected(c.uid),
      });
      el.classList.add(pl ? 'playable' : 'unplayable');
      // a usable hand effect (禁忌の竜): mark the card so the player knows to tap it
      if ((view.abilities || []).some(function (a) { return a.uid === c.uid; })) { el.classList.add('has-hand-ab'); el.appendChild(h('span', { class: 'bt-handab' }, '効果')); }
      if (view.isHighlighted(c.uid)) el.classList.add('hl');
      el.style.setProperty('--i', String(i));
      el.style.setProperty('--n', String(n));
      el.setAttribute('role', 'listitem');
      row.appendChild(el);
    });
    // graveyard cards playable via 再演
    const graveFromHand = playable.filter((x) => x.from === 'grave');
    if (graveFromHand.length) {
      graveFromHand.forEach((x) => {
        const c = game.findCard(x.uid);
        if (!c) return;
        const el = ui.renderCard(c, { size: view.handSize || 's', cost: x.cost, onClick: (y, e, cardEl) => view.onCard(c, cardEl, 'grave'), selected: view.isSelected(c.uid) });
        el.classList.add('playable', 'from-grave');
        row.appendChild(el);
      });
    }
    if (!n && !graveFromHand.length) row.appendChild(h('span', { class: 'bt-empty' }, '手札なし'));
    return row;
  }

  // ---------- log ----------
  function logPanel(game) {
    const list = h('ol', { class: 'bt-loglist', 'aria-live': 'polite' });
    const wrap = h('div', { class: 'bt-logbody' }, list);
    function line(e) {
      const sys = /^―――/.test(e.msg);
      return h('li', { class: (sys ? 'sys' : '') + (e.who === 1 ? ' enemy' : '') }, e.msg);
    }
    (game.log || []).slice(-120).forEach((e) => list.appendChild(line(e)));
    wrap.append = function (entry) {
      list.appendChild(line(entry));
      while (list.children.length > 200) list.removeChild(list.firstChild);
      wrap.scrollTop = wrap.scrollHeight;
    };
    wrap.scrollToEnd = function () { wrap.scrollTop = wrap.scrollHeight; };
    return wrap;
  }

  ui.battleHud = { strip, zones, board, mid, hand, logPanel, reasonText, nameOf, defOf, lineageOf };
})(globalThis.G = globalThis.G || {});
