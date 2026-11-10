/* 禁域 — js/ui/sfx.js — synthesized sound effects (Web Audio; no audio files).
 *
 *   G.ui.sfx.play(name, opts)        play one effect by name (see SOUNDS)
 *   G.ui.sfx.battle(type, payload, game)   map a battle event to a sound (called from battle.js drain())
 *   G.ui.sfx.enabled() / volume()    current settings (ui.settings: sound, soundVol)
 *
 * Browsers only allow audio after a user gesture, so the AudioContext is created on the first
 * pointerdown / keydown. Every effect is built from oscillators and filtered noise, mixed into a
 * master gain → compressor. Rapid repeats are throttled per sound and the number of voices is capped,
 * so 999-周 loops and 50-連鎖 storms stay listenable.
 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {};

  let ctx = null, master = null, noiseBuf = null;
  const lastAt = {};          // name → ms of last play (throttle)
  let voices = 0;
  const recent = [];          // last scheduled sound names (for debugging / tests)
  const MAX_VOICES = 14;

  function settings() { try { return ui.settings.get(); } catch (e) { return {}; } }
  function enabled() { const s = settings(); return s.sound !== false; }
  function volume() { const s = settings(); return typeof s.soundVol === 'number' ? s.soundVol : 0.6; }

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); return ctx; }
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { ctx = null; return null; }
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = volume();
    master.connect(comp); comp.connect(ctx.destination);
    // 1s of white noise, reused by every noise voice
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;  // audio texture only; not game logic
    return ctx;
  }
  function unlock() { if (enabled()) ensure(); }
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', unlock, { capture: true, passive: true });
    document.addEventListener('keydown', unlock, { capture: true });
  }

  // ------------------------------------------------------------------ voices
  // tone: one oscillator with an attack/decay envelope and optional pitch slide
  function tone(t0, o) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + (o.slide || o.d));
    if (o.detune) osc.detune.value = o.detune;
    const v = o.v == null ? 0.3 : o.v, a = o.a || 0.005, d = o.d || 0.2;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    let out = g;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; g.connect(f); out = f; }
    osc.connect(g); out.connect(master);
    osc.start(t0); osc.stop(t0 + a + d + 0.05);
    track(osc);
  }
  // noise: filtered noise burst, optional filter sweep
  function noise(t0, o) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = o.ft || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f || 1200, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(Math.max(40, o.to), t0 + (o.d || 0.2));
    const v = o.v == null ? 0.25 : o.v, a = o.a || 0.004, d = o.d || 0.15;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0, Math.random()); src.stop(t0 + a + d + 0.05);
    track(src);
  }
  function track(node) { voices++; node.onended = () => { voices = Math.max(0, voices - 1); }; }
  const notes = (t0, freqs, step, o) => freqs.forEach((f, i) => tone(t0 + i * step, Object.assign({ f }, o)));

  // ------------------------------------------------------------------ the sound set
  // Each entry: (t0, opts) => void. Kept short; dark-fantasy timbres with a festive edge.
  const SOUNDS = {
    tap:      (t) => tone(t, { f: 880, d: 0.04, v: 0.06, type: 'triangle' }),
    open:     (t) => notes(t, [520, 780], 0.05, { d: 0.12, v: 0.08, type: 'sine' }),
    deny:     (t) => { tone(t, { f: 150, d: 0.12, v: 0.14, type: 'square', lp: 900 }); tone(t + 0.09, { f: 120, d: 0.14, v: 0.12, type: 'square', lp: 700 }); },
    draw:     (t) => noise(t, { f: 2600, to: 4200, q: 0.8, d: 0.08, v: 0.10 }),
    flip:     (t) => { noise(t, { f: 1800, to: 3400, q: 0.9, d: 0.07, v: 0.12 }); tone(t + 0.02, { f: 660, d: 0.06, v: 0.05, type: 'triangle' }); },
    spell:    (t) => { notes(t, [784, 988, 1319], 0.035, { d: 0.18, v: 0.10, type: 'triangle' }); noise(t, { f: 5000, q: 2, d: 0.25, v: 0.05 }); },
    summon:   (t) => { tone(t, { f: 150, to: 55, slide: 0.18, d: 0.22, v: 0.32, type: 'sine' }); noise(t, { f: 400, ft: 'lowpass', d: 0.12, v: 0.12 }); },
    crest:    (t) => { tone(t, { f: 660, d: 0.5, v: 0.10, type: 'triangle' }); tone(t, { f: 993, d: 0.45, v: 0.07, type: 'sine' }); tone(t + 0.01, { f: 1320, d: 0.3, v: 0.04, type: 'sine', detune: 8 }); },
    field:    (t) => { noise(t, { f: 300, to: 1600, ft: 'lowpass', q: 0.7, d: 0.55, a: 0.12, v: 0.16 }); notes(t + 0.05, [196, 294, 392], 0.06, { d: 0.6, v: 0.06, type: 'sine', a: 0.08 }); },
    reserve:  (t) => { tone(t, { f: 330, d: 0.25, v: 0.08, type: 'sine', a: 0.04 }); tone(t + 0.06, { f: 247, d: 0.3, v: 0.06, type: 'sine', a: 0.04 }); },
    timed:    (t) => { tone(t, { f: 1500, d: 0.03, v: 0.06, type: 'square', lp: 3000 }); tone(t + 0.12, { f: 1200, d: 0.03, v: 0.05, type: 'square', lp: 3000 }); },
    boom:     (t) => { tone(t, { f: 110, to: 35, slide: 0.4, d: 0.45, v: 0.4 }); noise(t, { f: 900, to: 120, ft: 'lowpass', d: 0.45, v: 0.28 }); },
    attack:   (t) => noise(t, { f: 700, to: 2600, q: 1.4, d: 0.14, v: 0.16 }),
    hit:      (t) => { noise(t, { f: 1400, to: 300, ft: 'lowpass', d: 0.09, v: 0.22 }); tone(t, { f: 160, to: 80, d: 0.1, v: 0.18 }); },
    hitFace:  (t) => { noise(t, { f: 1000, to: 180, ft: 'lowpass', d: 0.16, v: 0.3 }); tone(t, { f: 120, to: 50, d: 0.2, v: 0.3 }); },
    bigHit:   (t) => { SOUNDS.hitFace(t); SOUNDS.boom(t + 0.03); },
    heal:     (t) => notes(t, [523, 659, 784], 0.06, { d: 0.25, v: 0.09, type: 'sine', a: 0.02 }),
    destroy:  (t) => { noise(t, { f: 3000, to: 400, ft: 'highpass', d: 0.18, v: 0.16 }); tone(t, { f: 300, to: 70, d: 0.22, v: 0.14, type: 'sawtooth', lp: 1200 }); },
    phantom:  (t) => tone(t, { f: 1046, to: 1568, d: 0.12, v: 0.05, type: 'sine', detune: 12 }),
    myTurn:   (t) => { tone(t, { f: 659, d: 0.6, v: 0.12, type: 'sine' }); tone(t, { f: 988, d: 0.5, v: 0.06, type: 'sine' }); },
    theirTurn:(t) => { tone(t, { f: 392, d: 0.6, v: 0.12, type: 'sine' }); tone(t, { f: 466, d: 0.5, v: 0.05, type: 'sine' }); },
    extra:    (t) => notes(t, [523, 659, 784, 1047], 0.05, { d: 0.18, v: 0.1, type: 'triangle' }),
    skip:     (t) => notes(t, [784, 587, 392], 0.07, { d: 0.18, v: 0.08, type: 'triangle' }),
    coin:     (t) => { tone(t, { f: 1975, d: 0.12, v: 0.08, type: 'square', lp: 6000 }); tone(t + 0.06, { f: 2637, d: 0.25, v: 0.07, type: 'square', lp: 6000 }); },
    coins:    (t) => { for (let i = 0; i < 4; i++) SOUNDS.coin(t + i * 0.07); },
    chain:    (t, o) => { const n = Math.min(60, (o && o.n) || 1); tone(t, { f: 440 * Math.pow(2, Math.min(n, 36) / 24), d: 0.05, v: 0.07, type: 'square', lp: 4000 }); },
    chainBig: (t) => { noise(t, { f: 6000, q: 3, d: 0.3, v: 0.12 }); notes(t, [587, 740, 880, 1175], 0.03, { d: 0.25, v: 0.09, type: 'sawtooth', lp: 3500 }); },
    curse:    (t) => { tone(t, { f: 110, d: 0.55, v: 0.14, type: 'sawtooth', lp: 600, a: 0.05 }); tone(t, { f: 117, d: 0.55, v: 0.12, type: 'sawtooth', lp: 600, a: 0.05 }); },
    seal:     (t) => { tone(t, { f: 300, to: 220, d: 0.12, v: 0.2 }); noise(t, { f: 2500, q: 4, d: 0.04, v: 0.15 }); tone(t + 0.1, { f: 880, d: 0.35, v: 0.06, type: 'triangle' }); },
    forecast: (t) => { tone(t, { f: 55, d: 1.4, a: 0.35, v: 0.22, type: 'sawtooth', lp: 400 }); tone(t, { f: 82.4, d: 1.3, a: 0.4, v: 0.14, type: 'sawtooth', lp: 500 }); tone(t + 0.5, { f: 116.5, d: 0.9, a: 0.2, v: 0.08, type: 'sine' }); },
    hazard:   (t) => { tone(t, { f: 70, to: 45, d: 0.14, v: 0.3 }); tone(t + 0.22, { f: 70, to: 45, d: 0.14, v: 0.24 }); },
    cancel:   (t) => notes(t, [440, 554, 659], 0.05, { d: 0.18, v: 0.08, type: 'sine' }),
    loop:     (t) => { for (let i = 0; i < 6; i++) tone(t + i * 0.045, { f: 330 * Math.pow(1.19, i), d: 0.08, v: 0.08, type: 'triangle' }); },
    loopTick: (t) => tone(t, { f: 1760, d: 0.02, v: 0.04, type: 'square', lp: 5000 }),
    overflow: (t) => { for (let i = 0; i < 9; i++) tone(t + i * 0.035, { f: 200 + ((i * 677) % 1800), d: 0.04, v: 0.09, type: 'square', lp: 5000 }); SOUNDS.boom(t + 0.32); },
    enrage:   (t) => { noise(t, { f: 500, to: 160, ft: 'lowpass', q: 2, d: 0.9, a: 0.1, v: 0.3 }); tone(t, { f: 73, to: 55, d: 0.9, a: 0.1, v: 0.22, type: 'sawtooth', lp: 700 }); },
    relic:    (t) => { notes(t, [1047, 1319, 1568, 2093], 0.04, { d: 0.3, v: 0.07, type: 'sine' }); noise(t, { f: 7000, q: 2, d: 0.3, v: 0.04 }); },
    coinToss: (t) => { tone(t, { f: 2349, d: 0.06, v: 0.07, type: 'triangle' }); tone(t + 0.18, { f: 2093, d: 0.06, v: 0.06, type: 'triangle' }); tone(t + 0.34, { f: 1760, d: 0.25, v: 0.07, type: 'triangle' }); },
    win:      (t) => { notes(t, [523, 659, 784, 1047], 0.11, { d: 0.35, v: 0.13, type: 'triangle' }); tone(t + 0.48, { f: 784, d: 0.9, v: 0.08, type: 'sine' }); tone(t + 0.48, { f: 1319, d: 0.9, v: 0.06, type: 'sine' }); },
    lose:     (t) => notes(t, [392, 349, 311, 262], 0.18, { d: 0.5, v: 0.11, type: 'sine', a: 0.03 }),
    // pack reveals by rarity
    revCommon:(t) => SOUNDS.flip(t),
    revRare:  (t) => { SOUNDS.flip(t); notes(t + 0.04, [1175, 1568], 0.05, { d: 0.3, v: 0.07, type: 'sine' }); },
    revLegend:(t) => { SOUNDS.flip(t); notes(t + 0.04, [784, 988, 1175, 1568], 0.06, { d: 0.6, v: 0.1, type: 'triangle' }); noise(t + 0.1, { f: 8000, q: 2, d: 0.5, v: 0.05 }); },
    revTaboo: (t) => { tone(t, { f: 880, to: 110, slide: 0.7, d: 0.8, v: 0.14, type: 'sawtooth', lp: 1800 }); tone(t + 0.6, { f: 1661, d: 1.2, v: 0.09, type: 'sine' }); tone(t + 0.6, { f: 1108, d: 1.2, v: 0.07, type: 'sine' }); SOUNDS.boom(t + 0.55); },
  };
  const THROTTLE = { tap: 40, draw: 50, hit: 45, hitFace: 60, chain: 40, loopTick: 120, phantom: 60, destroy: 60, coin: 50, timed: 80 };

  function play(name, opts) {
    if (!enabled()) return;
    const fn = SOUNDS[name];
    if (!fn || !ensure() || ctx.state !== 'running') return;
    const now = performance.now();
    const gap = THROTTLE[name] != null ? THROTTLE[name] : 30;
    if (lastAt[name] && now - lastAt[name] < gap) return;
    if (voices > MAX_VOICES && !/win|lose|forecast|enrage|overflow|revTaboo|revLegend/.test(name)) return;
    lastAt[name] = now;
    recent.push(name); if (recent.length > 60) recent.shift();
    master.gain.setTargetAtTime(volume(), ctx.currentTime, 0.01);
    try { fn(ctx.currentTime + 0.005, opts || {}); } catch (e) { /* never let audio break the game */ }
  }

  // ------------------------------------------------------------------ battle event mapping
  function cardType(defId) { try { return G.CardDB.get(defId).type; } catch (e) { return null; } }
  let lastChain = [0, 0], lastHazard = 0;
  function battle(type, p, game) {
    if (!enabled()) return;
    p = p || {};
    switch (type) {
      case 'coinToss': play('coinToss'); break;
      case 'turnStart': play(p.extra ? 'extra' : p.who === 0 ? 'myTurn' : 'theirTurn'); lastChain = [0, 0]; break;
      case 'cardPlayed': {
        const t = cardType(p.defId);
        play(t === 'monster' ? 'summon' : t === 'crest' ? 'crest' : t === 'field' ? 'field' : 'spell');
        break;
      }
      case 'phantom': play('phantom'); break;
      case 'attack': play('attack'); break;
      case 'damage':
        if (p.amount > 0) play(p.amount >= 10 ? 'bigHit' : p.target === 'player' ? 'hitFace' : 'hit');
        break;
      case 'heal': play('heal'); break;
      case 'destroy': play('destroy'); break;
      case 'draw': if (p.who === 0) play('draw'); break;
      case 'reserveSet': play('reserve'); break;
      case 'timedTick': play('timed'); break;
      case 'timedFire': play('boom'); break;
      case 'seal': play('seal'); break;
      case 'curse': if (p.amount > 0) play('curse'); break;
      case 'chain': {
        const now = p.effective != null ? p.effective : p.chain;
        const prev = lastChain[p.who] || 0;
        lastChain[p.who] = now;
        if (now > prev) {
          if ((prev < 10 && now >= 10) || (prev < 50 && now >= 50)) play('chainBig');
          else play('chain', { n: now });
        }
        break;
      }
      case 'extraTurn': play('extra'); break;
      case 'skipTurn': play('skip'); break;
      case 'hazardChange':
        if (p.who === 1 && p.hazard >= 80 && lastHazard < 80) play('hazard');
        if (p.who === 1) lastHazard = p.hazard;
        break;
      case 'forecast': play('forecast'); break;
      case 'forecastCancelled': play('cancel'); break;
      case 'loopDetected': case 'loopRun': play('loop'); break;
      case 'loopIteration': play('loopTick'); break;
      case 'overflow': play('overflow'); break;
      case 'enrage': play('enrage'); break;
      case 'relicAbility': play('relic'); break;
      case 'deckout': play('lose'); break;
      case 'illegal': play('deny'); break;
      case 'win': play(game && p.winner != null ? (p.winner === 0 ? 'win' : 'lose') : 'win'); break;
      default: break;
    }
  }

  // ------------------------------------------------------------------ app-wide hooks (UI only)
  if (typeof document !== 'undefined') {
    // soft click on any button press (specific screens add their own richer sounds on top)
    document.addEventListener('click', (e) => {
      const b = e.target && e.target.closest && e.target.closest('button, .btn, [role="button"]');
      if (b && !b.disabled) play('tap');
    }, true);
  }
  function wrap(obj, key, before) {
    if (!obj || typeof obj[key] !== 'function' || obj[key].__sfx) return;
    const orig = obj[key];
    const w = function () { const r = orig.apply(this, arguments); try { before(r, arguments); } catch (e) { /* ignore */ } return r; };
    w.__sfx = true;
    obj[key] = w;
  }
  // dialogs and warnings
  wrap(ui, 'modal', () => play('open'));
  wrap(ui, 'confirm', () => play('open'));
  wrap(ui, 'toast', (r, args) => { const o = args[1] || {}; if (o.kind === 'warn' || o.kind === 'bad') play('deny'); });
  // run economy: gold / relics / healing (wrapping keeps run logic untouched)
  function hookRun() {
    if (G.Shop) ['buyCard', 'buyPack', 'buyRelic', 'sell', 'removeCurse'].forEach((k) => wrap(G.Shop, k, (r) => { if (r && r.ok !== false) play('coins'); }));
    if (G.Run) {
      wrap(G.Run, 'takeRewardGold', () => play('coins'));
      wrap(G.Run, 'addRelic', () => play('relic'));
      wrap(G.Run, 'rest', (r, args) => { if (args[0] === 'heal') play('heal'); else if (args[0] === 'remove') play('destroy'); });
    }
  }
  hookRun();

  ui.sfx = { play, battle, enabled, volume, names: () => Object.keys(SOUNDS), unlock: ensure, recent: () => recent.slice(), state: () => (ctx ? ctx.state : 'none') };
})(globalThis.G = globalThis.G || {});
