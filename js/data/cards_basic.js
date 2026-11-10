(function (G) {
  'use strict';

  // ---------------------------------------------------------------
  // cards_basic.js — 基本カード（初期デッキの穴埋め用）
  // ---------------------------------------------------------------
  const Fx = G.Fx;

  G.CardDB.register({
    id: 'basic_01', name: '見習いの火球', type: 'spell', lineage: 'generic', role: 'finisher', rarity: 'common',
    cost: 1, text: '3ダメージを与える',
    flavor: '最初に覚える魔法。最後まで使う者もいる。',
    tags: ['finisher'],
    effects: { onPlay: Fx.dmgOpp(3) }
  });
})(globalThis.G = globalThis.G || {});
