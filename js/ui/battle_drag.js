/* js/ui/battle_drag.js — drag-to-play for the battle screen (pointer events; touch + mouse).
 *
 *   G.ui.battleDrag.attach(frameEl, api) → detach()
 *
 * Gestures (taps keep working exactly as before):
 *   - hand card dragged upward, dropped above the hand        → play it (X / hidden-zone picks open their usual modal)
 *   - hand card with a single visible target, dropped on it    → play it on that target (aim arrow while dragging)
 *   - own monster (or phantom stack) dragged onto an enemy / the enemy face → attack
 *   - drop back on the hand / on nothing valid                 → cancel (card snaps back)
 * Horizontal swipes on the hand still scroll it: a hand drag only starts when the finger moves mostly upward.
 *
 * api (supplied by screens/battle.js):
 *   canAct() → bool                         it is the human's main phase and the UI is idle
 *   game() → Game
 *   playable(uid) → playable entry | null    (game.getPlayable(0) item)
 *   whyNot(inst) → string                    reason text for a card that can't be played
 *   aimSpec(inst, pl) → { cands:[inst|player] } | null   single visible-target spec, else null
 *   commit(inst, pl)                          the normal tap flow (handles X, hidden picks, multi-targets)
 *   playOn(inst, pl, target)                  play with exactly this target (inst or player)
 *   attacker(inst) → { attacker, cands } | { error }     resolve attacker (phantom stacks) and its targets
 *   attack(attackerInst, target)              target = inst | player
 *   beginDrag() / endDrag()                   clear tap-mode prompts etc.
 */
(function (G) {
  'use strict';
  const ui = G.ui = G.ui || {};

  const START_PX = 10;          // movement before a press becomes a drag
  const SUPPRESS_CLICK_MS = 350;
  let activeCount = 0;   // drags in progress (any frame)

  // ---------------------------------------------------------------- hand scrolling helpers
  // Shared by the swipe (with inertia), the ‹ › buttons and the mouse wheel. The hand element can be replaced
  // by a redraw while a glide runs, so every frame re-queries it from the battle frame.
  function handOf(frame) { return frame && frame.querySelector('.bt-hand'); }
  function maxScroll(hand) { return Math.max(0, hand.scrollWidth - hand.clientWidth); }
  // nearest scroll position that puts a card's left edge at the hand's left padding (ends are exact)
  function snapPos(hand, desired) {
    const max = maxScroll(hand);
    if (desired <= 4) return 0;
    if (desired >= max - 4) return max;
    const pad = parseFloat(getComputedStyle(hand).paddingLeft) || 0;
    let best = desired, bd = Infinity;
    hand.querySelectorAll(':scope > .card').forEach((c) => {
      const pos = c.offsetLeft - pad;
      const d = Math.abs(pos - desired);
      if (d < bd) { bd = d; best = pos; }
    });
    return Math.max(0, Math.min(max, best));
  }
  function stopGlide(frame) { if (frame && frame.__glide) { cancelAnimationFrame(frame.__glide); frame.__glide = 0; } }
  function glideTo(frame, desired, ms) {
    const hand = handOf(frame);
    if (!hand) return;
    stopGlide(frame);
    const from = hand.scrollLeft, to = snapPos(hand, desired);
    if (Math.abs(to - from) < 1) { hand.scrollLeft = to; return; }
    const t0 = performance.now(), dur = ms || 260;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3); // ease-out
      const hEl = handOf(frame);
      if (hEl) hEl.scrollLeft = from + (to - from) * e;
      frame.__glide = k < 1 ? requestAnimationFrame(step) : 0;
    };
    frame.__glide = requestAnimationFrame(step);
  }
  // page the hand by about one screenful (dir = -1 / +1)
  function pageHand(frame, dir) {
    const hand = handOf(frame);
    if (!hand) return;
    glideTo(frame, hand.scrollLeft + dir * Math.max(80, hand.clientWidth * 0.8), 320);
  }

  function attach(frame, api) {
    let press = null;     // { el, inst, kind:'hand'|'board', x0, y0, pointerId }
    let drag = null;      // active drag state
    let suppressUntil = 0;

    function cardInstFromEl(el) {
      const g = api.game();
      const uid = Number(el.dataset.uid);
      if (!uid && uid !== 0) return null;
      return g.findCard(uid) || null;
    }

    // The battle screen may re-render between our listeners (a press fast-forwards the running animation and the
    // board is redrawn in the same event dispatch), so a card element we hold can be detached — find its live twin.
    function live(el) {
      if (!el) return null;
      if (el.isConnected && frame.contains(el)) return el;
      const uid = el.dataset && el.dataset.uid;
      if (uid == null || uid === '') return null;
      return frame.querySelector('.card[data-uid="' + uid + '"]');
    }

    function onDown(e) {
      if (e.button !== undefined && e.button !== 0) return;
      if (drag) return;
      if (e.target.closest && e.target.closest('.bt-hand')) stopGlide(frame); // a touch catches a gliding hand
      const el = live(e.target.closest && e.target.closest('.card[data-uid]'));
      if (!el) return;
      let kind = null;
      if (el.closest('.bt-hand')) kind = 'hand';
      else if (el.closest('.bt-my-board')) kind = 'board';
      if (!kind) return;
      const inst = cardInstFromEl(el);
      if (!inst) return;
      // the hand can always be scrolled (enemy turn, animations…); playing / attacking needs our main phase
      const scrollOnly = !api.canAct();
      if (scrollOnly && kind !== 'hand') return;
      press = { el, inst, kind, scrollOnly, x0: e.clientX, y0: e.clientY, pointerId: e.pointerId };
    }

    function onMove(e) {
      if (drag) { e.preventDefault(); moveDrag(e.clientX, e.clientY); return; }
      if (!press || e.pointerId !== press.pointerId) return;
      const dx = e.clientX - press.x0, dy = e.clientY - press.y0;
      const dist = Math.hypot(dx, dy);
      if (dist < START_PX) return;
      // hand: a mostly-horizontal swipe scrolls the hand; anything with a clear upward component starts a drag
      if (press.kind === 'hand' && !press.scroll && !(dy < 0 && -dy > Math.abs(dx) * 0.45)) {
        stopGlide(frame);
        press.scroll = { lastX: press.x0, samples: [{ t: performance.now(), x: press.x0 }] };
      }
      if (press.scroll) {
        // follow the finger 1:1 (re-query the hand: the battle screen may redraw it mid-swipe; its scroll is kept)
        const hand = frame.querySelector('.bt-hand');
        if (hand) hand.scrollLeft -= e.clientX - press.scroll.lastX;
        press.scroll.lastX = e.clientX;
        const s = press.scroll.samples;
        s.push({ t: performance.now(), x: e.clientX });
        if (s.length > 6) s.shift();
        suppressUntil = Date.now() + SUPPRESS_CLICK_MS;
        e.preventDefault();
        return;
      }
      const p = press; press = null;
      if (p.scrollOnly) return;
      p.el = live(p.el);
      if (!p.el) return;
      startDrag(p, e);
    }

    function onUp(e) {
      if (drag && e.pointerId === drag.pointerId) { e.preventDefault(); finishDrag(e.clientX, e.clientY, e.type === 'pointercancel'); return; }
      if (press && e.pointerId === press.pointerId) {
        if (press.scroll) {
          suppressUntil = Date.now() + SUPPRESS_CLICK_MS;
          // release: keep gliding with the swipe's speed, then settle with a card edge at the left
          const s = press.scroll.samples, now = performance.now();
          const recent = s.filter((p) => now - p.t < 90);
          let v = 0; // px per ms, finger direction
          if (recent.length >= 2) {
            const a = recent[0], b = recent[recent.length - 1];
            v = (b.x - a.x) / Math.max(8, b.t - a.t);
          }
          const hand = frame.querySelector('.bt-hand');
          if (hand) glideTo(frame, hand.scrollLeft - v * 260, Math.abs(v) > 0.3 ? 380 : 200);
        }
        press = null;
      }
    }

    // swallow the click that follows a drag so the tap flow doesn't also fire
    function onClickCapture(e) {
      if (Date.now() < suppressUntil) { e.stopImmediatePropagation(); e.preventDefault(); suppressUntil = 0; }
    }

    // ------------------------------------------------------------------ drag lifecycle
    function startDrag(p, e) {
      const g = api.game();
      let mode, pl = null, aim = null, att = null;
      if (p.kind === 'hand') {
        pl = api.playable(p.inst.uid);
        if (!pl) { ui.toast(api.whyNot(p.inst), { kind: 'warn' }); return; }
        aim = api.aimSpec(p.inst, pl);
        mode = aim ? 'aim-card' : 'play';
      } else {
        att = api.attacker(p.inst);
        if (!att || att.error) { if (att && att.error) ui.toast(att.error, { kind: 'warn' }); return; }
        mode = 'attack';
      }
      api.beginDrag();
      activeCount++;
      const rect = p.el.getBoundingClientRect();
      drag = {
        mode, inst: p.inst, srcEl: p.el, pl, aim, att, pointerId: e.pointerId,
        origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        offset: { x: p.x0 - rect.left, y: p.y0 - rect.top },
        rect, hover: null, ghost: null, svg: null, path: null, head: null,
      };
      frame.classList.add('dragging', 'drag-' + mode);
      p.el.classList.add('drag-src');
      try { frame.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      if (mode === 'play') makeGhost(p.el, rect);
      else makeArrow(p.kind === 'hand' ? p.el : null);
      markTargets(true);
      moveDrag(e.clientX, e.clientY);
      if (navigator.vibrate) { try { navigator.vibrate(8); } catch (err) { /* ignore */ } }
    }

    function makeGhost(src, rect) {
      const gh = src.cloneNode(true);
      gh.classList.add('drag-ghost');
      gh.classList.remove('drag-src', 'selected', 'hl');
      gh.removeAttribute('data-uid'); gh.removeAttribute('data-uids');
      gh.style.width = rect.width + 'px';
      gh.style.height = rect.height + 'px';
      document.body.appendChild(gh);
      drag.ghost = gh;
    }

    function makeArrow(cardEl) {
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('class', 'drag-arrow' + (drag.mode === 'attack' ? ' attack' : ''));
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('class', 'drag-arrow-line');
      const head = document.createElementNS(NS, 'path');
      head.setAttribute('class', 'drag-arrow-head');
      const ring = document.createElementNS(NS, 'circle');
      ring.setAttribute('class', 'drag-arrow-origin');
      ring.setAttribute('r', '7');
      svg.appendChild(path); svg.appendChild(head); svg.appendChild(ring);
      document.body.appendChild(svg);
      drag.svg = svg; drag.path = path; drag.head = head; drag.ring = ring;
      // an aimed hand card also gets a small ghost riding the arrow's tail
      if (cardEl) {
        const gh = cardEl.cloneNode(true);
        gh.classList.add('drag-ghost', 'drag-ghost-mini');
        gh.classList.remove('drag-src', 'selected', 'hl');
        gh.removeAttribute('data-uid');
        const r = cardEl.getBoundingClientRect();
        gh.style.width = r.width + 'px'; gh.style.height = r.height + 'px';
        document.body.appendChild(gh);
        drag.ghost = gh;
        drag.offset = { x: r.width / 2, y: r.height / 2 };
      }
    }

    // candidate elements for aimed drags
    function candidateEls() {
      const out = [];
      const list = drag.mode === 'attack' ? drag.att.cands : drag.mode === 'aim-card' ? drag.aim.cands : [];
      list.forEach((t) => {
        const el = elementFor(t);
        if (el) out.push({ el, target: t });
      });
      return out;
    }
    function elementFor(t) {
      if (t && t.uid != null) {
        let el = frame.querySelector('.card[data-uid="' + t.uid + '"]');
        if (!el) {
          el = Array.prototype.find.call(frame.querySelectorAll('.card[data-uids]'),
            (x) => x.dataset.uids.split(',').indexOf(String(t.uid)) >= 0) || null;
        }
        return el;
      }
      if (t && t.idx != null) return frame.querySelector('[data-face="' + t.idx + '"]');
      return null;
    }
    function markTargets(on) {
      if (drag.mode === 'play') { frame.classList.toggle('drag-zone-on', on); return; }
      drag.targets = on ? candidateEls() : (drag.targets || []);
      drag.targets.forEach((x) => x.el.classList.toggle('drag-cand', on));
    }

    // The board can be redrawn while a drag is in progress (the summon animation finishing, etc.) — re-collect
    // the target elements when the ones we marked were replaced, or the drop would hit nothing.
    function refreshTargets() {
      if (drag.srcEl && !drag.srcEl.isConnected) {
        const s = live(drag.srcEl);
        if (s) { drag.srcEl = s; s.classList.add('drag-src'); }
      }
      if (!drag.targets || drag.targets.every((t) => t.el.isConnected)) return;
      drag.targets = candidateEls();
      drag.targets.forEach((t) => t.el.classList.add('drag-cand'));
      if (drag.hover && !drag.hover.el.isConnected) drag.hover = null;
    }

    function targetAt(x, y) {
      refreshTargets();
      const hit = document.elementFromPoint(x, y);
      if (!hit) return null;
      const found = (drag.targets || []).find((t) => t.el === hit || t.el.contains(hit));
      return found || null;
    }

    function overHand(y) {
      const hand = frame.querySelector('.bt-hand');
      if (!hand) return false;
      const r = hand.getBoundingClientRect();
      return y > r.top - 8;
    }

    function moveDrag(x, y) {
      if (drag.ghost) {
        drag.ghost.style.transform = 'translate(' + (x - drag.offset.x) + 'px,' + (y - drag.offset.y) + 'px)' +
          (drag.mode === 'play' ? ' rotate(' + Math.max(-8, Math.min(8, (x - drag.origin.x) / 30)) + 'deg) scale(1.06)' : ' scale(.72)');
      }
      if (drag.mode === 'play') {
        const armed = !overHand(y);
        frame.classList.toggle('drag-armed', armed);
        if (drag.ghost) drag.ghost.classList.toggle('armed', armed);
        return;
      }
      // aim arrow
      const o = drag.mode === 'attack' ? drag.origin : { x: drag.origin.x, y: drag.rect.top };
      const mx = (o.x + x) / 2, my = Math.min(o.y, y) - Math.abs(x - o.x) * 0.15 - 40;
      drag.path.setAttribute('d', 'M' + o.x + ',' + o.y + ' Q' + mx + ',' + my + ' ' + x + ',' + y);
      const ang = Math.atan2(y - my, x - mx);
      const L = 16, W = 0.5;
      const p1 = (x - L * Math.cos(ang - W)) + ',' + (y - L * Math.sin(ang - W));
      const p2 = (x - L * Math.cos(ang + W)) + ',' + (y - L * Math.sin(ang + W));
      drag.head.setAttribute('d', 'M' + x + ',' + y + ' L' + p1 + ' L' + p2 + ' Z');
      drag.ring.setAttribute('cx', o.x); drag.ring.setAttribute('cy', o.y);
      const hov = targetAt(x, y);
      if ((hov && hov.el) !== (drag.hover && drag.hover.el)) {
        if (drag.hover) drag.hover.el.classList.remove('drag-hover');
        if (hov) hov.el.classList.add('drag-hover');
        drag.hover = hov;
      }
      drag.svg.classList.toggle('locked', !!hov);
      if (drag.ghost) drag.ghost.style.opacity = hov ? '0' : '1';
    }

    function cleanup() {
      if (!drag) return;
      activeCount = Math.max(0, activeCount - 1);
      markTargets(false);
      if (drag.hover) drag.hover.el.classList.remove('drag-hover');
      frame.classList.remove('dragging', 'drag-play', 'drag-aim-card', 'drag-attack', 'drag-armed', 'drag-zone-on');
      if (drag.srcEl) drag.srcEl.classList.remove('drag-src');
      if (drag.svg) drag.svg.remove();
      try { frame.releasePointerCapture(drag.pointerId); } catch (err) { /* ignore */ }
      suppressUntil = Date.now() + SUPPRESS_CLICK_MS;
    }

    function snapBack(gh, rect) {
      if (!gh) return;
      gh.classList.add('returning');
      gh.style.transform = 'translate(' + rect.left + 'px,' + rect.top + 'px)';
      setTimeout(() => gh.remove(), 220);
    }

    function finishDrag(x, y, cancelled) {
      const d = drag;
      const gh = d.ghost;
      let action = null;
      if (!cancelled) {
        if (d.mode === 'play') {
          if (!overHand(y)) action = () => api.commit(d.inst, d.pl);
        } else {
          const hit = targetAt(x, y);
          if (hit) {
            action = d.mode === 'attack' ? () => api.attack(d.att.attacker, hit.target) : () => api.playOn(d.inst, d.pl, hit.target);
          }
        }
      }
      cleanup();
      drag = null;
      if (action) {
        if (gh) { gh.classList.add('dropped'); setTimeout(() => gh.remove(), 180); }
        api.endDrag(true);
        action();
      } else {
        // an aimed drag dropped above the hand (not on a target) falls back to the tap flow
        if (!cancelled && d.mode === 'aim-card' && !overHand(y)) {
          if (gh) gh.remove();
          api.endDrag(true);
          api.commit(d.inst, d.pl);
          return;
        }
        snapBack(gh, d.rect);
        api.endDrag(false);
      }
    }

    // mouse wheel over the hand scrolls it sideways (PC)
    function onWheel(e) {
      const hand = e.target.closest && e.target.closest('.bt-hand');
      if (!hand || maxScroll(hand) <= 0) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      stopGlide(frame);
      hand.scrollLeft += d * (e.deltaMode === 1 ? 32 : 1);
    }

    frame.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    frame.addEventListener('click', onClickCapture, true);
    frame.addEventListener('wheel', onWheel, { passive: false });

    return function detach() {
      if (drag) { const gh = drag.ghost; cleanup(); if (gh) gh.remove(); drag = null; }
      stopGlide(frame);
      frame.removeEventListener('wheel', onWheel, { passive: false });
      frame.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      frame.removeEventListener('click', onClickCapture, true);
    };
  }

  ui.battleDrag = { attach, active: () => activeCount > 0, pageHand, glideTo, snapPos };
})(globalThis.G = globalThis.G || {});
