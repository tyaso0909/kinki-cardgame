/* 禁域 — js/ui/screens/settings.js */
(function (G) {
  'use strict';
  const ui = G.ui;
  const h = ui.h;

  function header(title, onBack) {
    return h('div', { class: 'screen-head' },
      h('button', { class: 'btn-icon', type: 'button', 'aria-label': '戻る', onClick: onBack }, ui.icon('back')),
      h('h1', null, title));
  }
  ui.header = header;

  function seg(options, value, onChange) {
    const el = h('div', { class: 'seg', role: 'group' });
    options.forEach(([v, label]) => {
      const b = h('button', { type: 'button', 'aria-pressed': String(v === value), onClick: () => {
        el.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', 'false'));
        b.setAttribute('aria-pressed', 'true');
        onChange(v);
      } }, label);
      el.appendChild(b);
    });
    return el;
  }
  function toggle(value, onChange, disabled) {
    const el = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!value), disabled: !!disabled });
    el.addEventListener('click', () => {
      const next = el.getAttribute('aria-checked') !== 'true';
      el.setAttribute('aria-checked', String(next));
      onChange(next);
    });
    return el;
  }
  function setting(label, sub, control) {
    return h('div', { class: 'setting' },
      h('div', { class: 'label' }, label, sub ? h('small', null, sub) : null),
      control);
  }
  ui.controls = { seg, toggle, setting };

  async function wipeSave() {
    const ok = await ui.confirm('セーブデータをすべて削除します。\n図鑑・記録・進行中のランも消えます。元に戻せません。', { ok: '削除する', cancel: 'やめる', danger: true, title: 'セーブデータ削除' });
    if (!ok) return;
    try {
      if (G.Save && typeof G.Save.wipe === 'function') G.Save.wipe();
      else {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.indexOf('kinki') === 0) keys.push(k);
        }
        keys.forEach((k) => localStorage.removeItem(k));
      }
      ui.toast('削除しました');
      ui.settings.apply();
    } catch (e) {
      ui.toast('削除できませんでした', { kind: 'bad' });
    }
  }

  ui.app.register('settings', {
    mount(root) {
      const s = ui.settings.get();
      const set = (patch) => ui.settings.set(patch);

      const list = h('div', { class: 'settings-list' },
        h('div', { class: 'settings-section' }, '表示'),
        setting('アニメーション速度', '戦闘の演出や画面切り替えの速さ',
          seg([['slow', '遅い'], ['normal', '普通'], ['fast', '速い'], ['none', 'なし']], s.anim, (v) => set({ anim: v }))),
        setting('演出の自動早送り', '長いループや連鎖の演出を自動で飛ばす',
          toggle(s.autoFast, (v) => set({ autoFast: v }))),
        setting('テーマ', null,
          seg([['dark', 'ダーク'], ['light', 'ライト']], s.theme, (v) => set({ theme: v }))),
        h('div', { class: 'settings-section' }, '音'),
        setting('効果音', '戦闘・パック開封・ショップなどの音',
          toggle(s.sound !== false, (v) => { set({ sound: v }); if (v && ui.sfx) { ui.sfx.unlock(); ui.sfx.play('spell'); } })),
        setting('音量', null,
          seg([['0.3', '小'], ['0.6', '中'], ['1', '大']], String(s.soundVol != null ? s.soundVol : 0.6), (v) => { set({ soundVol: Number(v) }); if (ui.sfx) ui.sfx.play('summon'); })),
        h('div', { class: 'settings-section' }, 'データ'),
        setting('セーブデータ削除', '図鑑・記録・進行中のランを消す',
          h('button', { class: 'btn sm danger', type: 'button', onClick: wipeSave }, '削除')),
        h('div', { class: 'settings-section' }, '開発'),
        setting('開発: カード一覧', '登録済みカードをすべて表示',
          h('button', { class: 'btn sm', type: 'button', onClick: () => ui.app.show('cardgallery') }, '開く')),
        setting('開発: テスト戦闘', 'ランダムデッキで戦闘画面を試す',
          h('button', { class: 'btn sm', type: 'button', onClick: () => (ui.devBattle ? ui.devBattle.start() : ui.toast('準備中')) }, '開始')),
      );

      root.appendChild(h('div', { class: 'col' },
        header('設定', () => ui.app.back('menu')),
        h('div', { class: 'panel panel-pad' }, list),
      ));
    },
    unmount() {},
  });
})(globalThis.G = globalThis.G || {});
