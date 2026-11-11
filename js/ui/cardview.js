/* 禁域 — js/ui/cardview.js
   Card rendering.
   G.ui.renderCard(defOrInst, { size:'s'|'m'|'l', onClick, selectable, selected,
                                showCost (default true), faceDown, count, disabled })
   G.ui.cardDetail(defOrInst) → Promise (modal)
   G.ui.lineageMeta(lineage) → { name, glyph(), color }
   G.ui.lineageGlyph(lineage, attrs) → svg element
   G.ui.labels: JP names for type / rarity / role / lineage
*/
(function (G) {
  'use strict';
  const ui = (G.ui = G.ui || {});
  const h = ui.h;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  // ---------- labels ----------
  const LINEAGE = {
    accel:   { name: '加速', theme: '炎と竜' },
    cycle:   { name: '循環', theme: '水と書庫' },
    chain:   { name: '連鎖', theme: '雷' },
    time:    { name: '時間', theme: '時の魔術' },
    copy:    { name: '複製', theme: '幻影' },
    doom:    { name: '終焉', theme: '死霊と古の封印' },
    generic: { name: '汎用', theme: '' },
    boss:    { name: 'ボス', theme: '切り札' },
  };
  const TYPE = { monster: 'モンスター', spell: '魔法', crest: '紋章', field: 'フィールド' };
  const RARITY = { common: 'コモン', rare: 'レア', legend: '伝説', taboo: '禁忌', boss: 'ボス専用' };
  const ROLE = { engine: 'エンジン', fuel: '燃料', finisher: '出口', disrupt: '妨害' };
  const RARITY_PIP = { common: '・', rare: '◆', legend: '◆◆', taboo: '◆◆◆', boss: '鎖' };

  // ---------- glyphs (24×24 paths, stroke-based so they tint via currentColor) ----------
  const S = 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const GLYPH = {
    // flame
    accel: `<path d="M12 2.5c1 3 4.5 4.5 4.5 9a4.5 4.5 0 0 1-9 0c0-1.5.6-2.7 1.4-3.6.1 1.4.8 2.3 1.6 2.6-.6-2.3.2-5.3 1.5-8z" ${S}/><path d="M12 21.5c-4.5 0-7-2-7-4.5" ${S} opacity=".5"/>`,
    // drop with wave
    cycle: `<path d="M12 2.5c3 4 6 7.5 6 11a6 6 0 0 1-12 0c0-3.5 3-7 6-11z" ${S}/><path d="M8.5 14.5c1 1 2.3 1 3.5 0s2.5-1 3.5 0" ${S}/>`,
    // bolt
    chain: `<path d="M13.5 2.5L5.5 13.5h6l-1 8 8-11.5h-6z" ${S}/>`,
    // hourglass
    time: `<path d="M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9" ${S}/><path d="M9.5 19.5h5" ${S} opacity=".6"/>`,
    // mirror (two overlapping frames)
    copy: `<rect x="4" y="5" width="10" height="14" rx="1.5" ${S}/><path d="M9 3h10.5v14.5" ${S} opacity=".55"/><path d="M7 15l4-6" ${S} opacity=".7"/>`,
    // skull
    doom: `<path d="M12 2.5a7.5 7.5 0 0 0-7.5 7.5c0 2.8 1.4 4.6 3 5.6V19h9v-3.4c1.6-1 3-2.8 3-5.6A7.5 7.5 0 0 0 12 2.5z" ${S}/><circle cx="9.3" cy="10.5" r="1.4" fill="currentColor"/><circle cx="14.7" cy="10.5" r="1.4" fill="currentColor"/><path d="M10 19v2.5M14 19v2.5" ${S}/>`,
    // four-point star
    generic: `<path d="M12 2.5l2.2 7.3 7.3 2.2-7.3 2.2L12 21.5l-2.2-7.3-7.3-2.2 7.3-2.2z" ${S}/>`,
    // crown with chain
    boss: `<path d="M4 17l-1.5-9 5 3.5L12 5l4.5 6.5 5-3.5L20 17z" ${S}/><path d="M5 20.5h14" ${S}/><circle cx="8" cy="20.5" r="1.2" fill="currentColor"/><circle cx="12" cy="20.5" r="1.2" fill="currentColor"/><circle cx="16" cy="20.5" r="1.2" fill="currentColor"/>`,
  };
  // type-specific art silhouettes
  const TYPE_ART = {
    monster: null, // uses lineage glyph
    spell: `<path d="M5 6.5c0-1.4 1.1-2.5 2.5-2.5H19v13H7.5A2.5 2.5 0 0 0 5 19.5z" ${S}/><path d="M5 6.5c0 1.4 1.1 2.5 2.5 2.5H19M8 13h7" ${S}/>`,
    crest: `<path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" ${S}/>`,
    field: `<path d="M3 17c3-2 6-2 9 0s6 2 9 0M3 12c3-2 6-2 9 0s6 2 9 0M3 7c3-2 6-2 9 0s6 2 9 0" ${S}/>`,
  };

  function svgEl(inner, attrs) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    if (attrs) for (const k of Object.keys(attrs)) svg.setAttribute(k, attrs[k]);
    svg.innerHTML = inner;
    return svg;
  }
  function lineageGlyph(lineage, attrs) {
    return svgEl(GLYPH[lineage] || GLYPH.generic, attrs);
  }
  function lineageMeta(lineage) {
    const m = LINEAGE[lineage] || LINEAGE.generic;
    return { key: lineage in LINEAGE ? lineage : 'generic', name: m.name, theme: m.theme, glyph: (a) => lineageGlyph(lineage, a) };
  }

  // ---------- def / inst resolution ----------
  function defOf(x) {
    if (!x) return null;
    if (x.defId != null && G.CardDB && typeof G.CardDB.get === 'function') {
      const d = G.CardDB.get(x.defId);
      if (d) return d;
    }
    return x.type ? x : null;
  }
  function isInst(x) {
    return !!(x && x.defId != null && x.uid != null);
  }

  // ---------- keywords ----------
  // Monster keywords: name + one-line rule (shown as chips and explained in the card detail).
  const KEYWORDS = [
    { id: 'rush', name: '速攻', rule: '出したターンから攻撃できる' },
    { id: 'guard', name: '守護', rule: '相手は、守護を持つモンスターから先に攻撃しなければならない' },
    { id: 'ward', name: '加護', rule: '相手のカードの効果の対象にならない（「すべて」に効く効果は受ける）' },
    { id: 'untouchable', name: '不可侵', rule: '攻撃されない' },
    { id: 'double', name: '連撃', rule: '1ターンに2回攻撃できる' },
    { id: 'pierce', name: '貫通', rule: 'モンスターを攻撃して倒したとき、余ったダメージを相手のライフに与える' },
  ];
  ui.KEYWORDS = KEYWORDS;
  function keywordChips(def, inst) {
    const chips = [];
    const kws = (inst && inst.keywords) || def.keywords || [];
    KEYWORDS.forEach(function (k) { if (kws.includes(k.id)) chips.push([k.name, 'kw-' + k.id]); });
    if (def.reserve) chips.push(['予約', 'kw-reserve']);
    if (def.reprise != null && def.reprise !== false) chips.push(['再演' + def.reprise, '']);
    if (def.timed != null && def.timed !== false) chips.push(['時限' + def.timed, '']);
    if (def.key != null) chips.push([def.key === 'wild' ? '鍵・万能' : '鍵', 'kw-key']);
    if (def.bossOnly || def.rarity === 'boss') chips.push(['切り札', '']);
    return chips.map(([t, c]) => h('span', { class: 'kw ' + c }, t));
  }

  // Rules text: emphasise trigger words so the eye finds the shape of the effect.
  const EMPH = /(召喚時|破壊時|常在|展開時|予約|再演|時限\d+|追加ターン|呪詛|幻影|連鎖数|除外|封印ゾーン)/g;
  function textNodes(text) {
    const out = [];
    let last = 0;
    text.replace(EMPH, (m, _g, i) => {
      if (i > last) out.push(text.slice(last, i));
      out.push(h('em', null, m));
      last = i + m.length;
      return m;
    });
    if (last < text.length) out.push(text.slice(last));
    return out;
  }
  // Rough fit (first guess, before layout): how many characters the text box
  // holds at full size for this type, then step the font down until the text
  // should fit. fitCardText() below corrects this against real measurements.
  const SHRINK_LEVELS = 6;
  function shrinkClass(text, size, def, hasKw, hasFlavor) {
    const n = (text || '').length;
    if (!n) return '';
    // field cards are portrait now; their art band is taller, so a little less room for text than a spell
    let budget = def.type === 'monster' ? 18 : def.type === 'crest' ? 26 : def.type === 'field' ? 34 : 40;
    if (hasKw) budget -= 10;
    if (hasFlavor) budget -= 8;
    const levels = [1, 0.78, 0.7, 0.62, 0.55, 0.5, 0.45];
    for (let i = 0; i < levels.length; i++) {
      const cap = budget / (levels[i] * levels[i]);
      if (n <= cap) return i ? ' shrink-' + i : '';
    }
    return ' shrink-' + SHRINK_LEVELS;
  }
  function currentShrink(txt) {
    for (let i = SHRINK_LEVELS; i >= 1; i--) if (txt.classList.contains('shrink-' + i)) return i;
    return 0;
  }
  function setShrink(txt, level) {
    for (let i = 1; i <= SHRINK_LEVELS; i++) txt.classList.toggle('shrink-' + i, i === level);
  }
  // Measure the rendered card and make the rules text fit: drop flavor, shrink
  // the art band, then step the font down. Sizes m/l must show the whole text
  // (size s hides it; the detail modal shows everything).
  function fitCardText(el) {
    if (!el || !el.isConnected || el.classList.contains('size-s') || el.classList.contains('facedown')) return false;
    const txt = el.querySelector('.card-text');
    if (!txt || !txt.textContent) return true;
    if (el.clientWidth === 0) return false; // not laid out yet (hidden); caller may retry
    // clientHeight 0 while the card is laid out = the text was squeezed out by flavor/art
    const fits = () => txt.clientHeight > 0 && txt.scrollHeight <= txt.clientHeight + 1;
    if (fits()) return true;
    const fl = el.querySelector('.card-flavor');
    if (fl) { fl.remove(); if (fits()) return true; }
    el.classList.add('compact-art');
    if (fits()) return true;
    for (let i = currentShrink(txt) + 1; i <= SHRINK_LEVELS; i++) {
      setShrink(txt, i);
      if (fits()) return true;
    }
    el.classList.add('text-overflow');
    return true;
  }
  function scheduleFit(el) {
    if (typeof requestAnimationFrame !== 'function') return;
    requestAnimationFrame(() => {
      if (fitCardText(el) === false && el.isConnected) setTimeout(() => fitCardText(el), 120);
      else if (!el.isConnected) setTimeout(() => fitCardText(el), 60);
    });
  }

  // ---------- main renderer ----------
  function renderCard(x, opts) {
    opts = opts || {};
    const def = defOf(x);
    const inst = isInst(x) ? x : null;
    const size = opts.size || 'm';

    if (!def) {
      return h('div', { class: 'card size-' + size + ' lin-generic type-spell rar-common' },
        h('div', { class: 'card-frame' }, h('div', { class: 'card-name' }, '？')));
    }
    const lineage = def.rarity === 'boss' || def.bossOnly ? 'boss' : (LINEAGE[def.lineage] ? def.lineage : 'generic');
    const rarity = def.bossOnly ? 'boss' : (RARITY[def.rarity] ? def.rarity : 'common');
    const cls = ['card', 'size-' + size, 'lin-' + lineage, 'type-' + (TYPE[def.type] ? def.type : 'spell'), 'rar-' + rarity];
    if (opts.selectable) cls.push('selectable');
    if (opts.selected) cls.push('sel');
    if (opts.disabled) cls.push('disabled');
    if (opts.onClick) cls.push('clickable');
    if (opts.faceDown) cls.push('facedown');
    if (def.type === 'field' && opts.wide) cls.push('wide');   // banner layout only when explicitly asked for
    if (inst && inst.isPhantom) cls.push('phantom');
    if (inst && inst.exhausted) cls.push('exhausted');
    if (inst && inst.residual) cls.push('residual'); // 鏡の主「残り香」: 縁がくすんで表示 (SPEC) — QA: was never shown in battle

    const el = h(opts.onClick ? 'button' : 'div', {
      class: cls.join(' '),
      type: opts.onClick ? 'button' : null,
      'aria-label': def.name,
      'aria-pressed': opts.selectable ? String(!!opts.selected) : null,
      dataset: { defId: def.id || '', uid: inst ? String(inst.uid) : '' },
      onClick: opts.onClick ? (e) => opts.onClick(x, e, el) : null,
    });

    const frame = h('div', { class: 'card-frame' });
    el.appendChild(frame);

    if (opts.faceDown) {
      frame.appendChild(h('div', { class: 'card-back' }, h('span', null, '禁')));
      if (opts.count != null) el.appendChild(h('span', { class: 'card-count' }, String(opts.count)));
      return el;
    }

    // cost
    if (opts.showCost !== false && def.type) {
      const cost = opts.cost != null ? opts.cost : def.cost;
      const isX = cost === 'X';
      frame.appendChild(h('div', { class: 'card-cost' + (isX ? ' x' : ''), title: 'コスト' }, h('span', null, isX ? 'X' : String(cost == null ? 0 : cost))));
    }
    // rarity pip
    frame.appendChild(h('div', { class: 'card-rar', title: RARITY[rarity] }, RARITY_PIP[rarity] || ''));
    // glyph
    frame.appendChild(h('div', { class: 'card-glyph', title: LINEAGE[lineage].name }, lineageGlyph(lineage)));

    // art
    const art = h('div', { class: 'card-art' });
    if (def.art) art.appendChild(h('img', { src: def.art, alt: '' }));
    else art.appendChild(TYPE_ART[def.type] ? svgEl(TYPE_ART[def.type]) : lineageGlyph(lineage));

    const nlen = (def.name || '').length;
    const name = h('div', { class: 'card-name' + (nlen > 9 ? ' xlong' : nlen > 7 ? ' long' : '') }, def.name || '');
    const kws = h('div', { class: 'card-kws' }, keywordChips(def, inst));
    const kwCount = kws.childElementCount;
    // Flavor only when there is room: large view always, medium when rules text is short.
    const tlen = (def.text || '').length;
    // (a monster with keyword chips has no room left above its stats — flavor would sit on top of 攻/体)
    const showFlavor = !!def.flavor && size !== 's' && tlen <= (def.type === 'monster' ? 14 : 26) && !(def.type === 'monster' && kwCount > 0);
    const txt = h('div', { class: 'card-text' + shrinkClass(def.text, size, def, kwCount > 0, showFlavor) }, textNodes(def.text || ''));
    const flavor = showFlavor ? h('div', { class: 'card-flavor' }, def.flavor) : null;

    const foot = h('div', { class: 'card-foot' });
    if (def.type === 'field' && opts.wide) {
      frame.appendChild(art);
      frame.appendChild(h('div', { class: 'card-body' }, name, kws, txt, flavor, foot));
    } else {
      frame.appendChild(art);
      frame.appendChild(name);
      frame.appendChild(kws);
      frame.appendChild(txt);
      if (flavor) frame.appendChild(flavor);
      frame.appendChild(foot);
    }

    // monster stats
    if (def.type === 'monster') {
      // X/X monsters (マナの巨人) read "X" until they are on the board (the battle passes real atk/hp then)
      const xOut = def.xStats && !(inst && (inst.zone === 'board' || inst.zone === 'phantoms'));
      const atk = xOut ? 'X' : inst && inst.atk != null ? inst.atk : def.atk;
      const hp = xOut ? 'X' : inst && inst.hp != null ? inst.hp : def.hp;
      const hurt = inst && inst.maxHp != null && hp < inst.maxHp;
      const atkEl = h('div', { class: 'card-atk', 'data-label': '攻', title: '攻撃力' }, h('span', null, atk === undefined ? '?' : String(atk)));
      const hpEl = h('div', { class: 'card-hp' + (hurt ? ' hurt' : ''), 'data-label': '体', title: '体力' }, h('span', null, hp === undefined ? '?' : String(hp)));
      if (inst && def.atk != null && atk > def.atk) atkEl.classList.add('card-stat-buff');
      frame.appendChild(atkEl);
      frame.appendChild(hpEl);
    }

    if (opts.count != null) el.appendChild(h('span', { class: 'card-count' }, String(opts.count)));
    if (size !== 's' && def.text && opts.fit !== false) scheduleFit(el);
    return el;
  }

  // ---------- detail modal ----------
  function cardDetail(x) {
    const def = defOf(x);
    if (!def) return Promise.resolve();
    const lineage = def.rarity === 'boss' || def.bossOnly ? 'boss' : (LINEAGE[def.lineage] ? def.lineage : 'generic');
    const meta = lineageMeta(lineage);

    const facts = h('dl', null,
      h('dt', null, '系統'), h('dd', null, h('span', { class: 'lineage-tag lin-' + lineage }, lineageGlyph(lineage), meta.name, meta.theme ? '（' + meta.theme + '）' : '')),
      h('dt', null, '種類'), h('dd', null, TYPE[def.type] || def.type || '—'),
      h('dt', null, 'レアリティ'), h('dd', null, RARITY[def.bossOnly ? 'boss' : def.rarity] || '—'),
      def.role ? h('dt', null, '役割') : null, def.role ? h('dd', null, ROLE[def.role] || def.role) : null,
      h('dt', null, 'コスト'), h('dd', { class: 't-num' }, def.cost === 'X' ? 'X' : String(def.cost == null ? 0 : def.cost)),
      def.type === 'monster' ? h('dt', null, '攻撃／体力') : null,
      def.type === 'monster' ? h('dd', { class: 't-num' }, def.xStats ? 'X / X' : String(def.atk) + ' / ' + String(def.hp)) : null,
    );
    const kwChips = keywordChips(def, isInst(x) ? x : null);
    const kwList = ((isInst(x) && x.keywords) || def.keywords || []);
    const glossary = KEYWORDS.filter(function (k) { return kwList.includes(k.id); });
    const body = h('div', { class: 'card-detail lin-' + lineage },
      renderCard(def, { size: 'l' }),
      facts,
      h('div', { class: 'detail-text' }, kwChips.length ? h('div', { class: 'card-kws', style: { margin: '0 0 8px', fontSize: '16px' } }, kwChips) : null, textNodes(def.text || '（効果なし）')),
      glossary.length ? h('dl', { class: 'detail-kwrules' }, glossary.map(function (k) { return [h('dt', null, k.name), h('dd', null, k.rule)]; })) : null,
      def.flavor ? h('div', { class: 'detail-flavor' }, def.flavor) : null,
    );
    return ui.modal({ title: def.name, body, wide: true, buttons: [{ label: '閉じる', value: true }] });
  }

  ui.renderCard = renderCard;
  ui.fitCardText = fitCardText;
  ui.cardDetail = cardDetail;
  ui.lineageGlyph = lineageGlyph;
  ui.lineageMeta = lineageMeta;
  ui.labels = { LINEAGE, TYPE, RARITY, ROLE };
  ui.LINEAGES = ['accel', 'cycle', 'chain', 'time', 'copy', 'doom'];
})(globalThis.G = globalThis.G || {});
