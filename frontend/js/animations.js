// animations.js — GSAP helpers, entrance animations, FLIP detail expand

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ─── Shared entrance animation ────────────────────────────────────────────────
function enterElements(targets, { delay = 0, stagger = 0.06, y = 28 } = {}) {
  if (reduced) {
    gsap.set(targets, { opacity: 1, y: 0, clearProps: 'all' });
    return;
  }
  gsap.fromTo(targets,
    { opacity: 0, y },
    {
      opacity: 1, y: 0,
      duration: 0.65,
      ease: 'power3.out',
      delay,
      stagger,
      clearProps: 'transform',
    }
  );
}

// ─── View transitions ─────────────────────────────────────────────────────────
function fadeOut(el, cb) {
  if (!el) { cb?.(); return; }
  if (reduced) { el.style.display = 'none'; gsap.set(el, { opacity: 1 }); cb?.(); return; }
  gsap.to(el, {
    opacity: 0, duration: 0.28, ease: 'power2.in',
    onComplete: () => {
      el.style.display = 'none';
      gsap.set(el, { opacity: 1 }); // reset so it's ready when re-shown
      cb?.();
    }
  });
}

function fadeIn(el, { y = 16 } = {}) {
  if (!el) return;
  // Remove hidden class AND override any inline display:none
  el.classList.remove('hidden');
  el.style.display = '';   // clear any inline display set by fadeOut
  if (reduced) { gsap.set(el, { opacity: 1, y: 0 }); return; }
  gsap.fromTo(el,
    { opacity: 0, y },
    { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', clearProps: 'transform' }
  );
}

// ─── Show / Hide helpers using inline style (not class) ──────────────────────
// These are used internally so GSAP can work without class fights
function _show(el) {
  if (!el) return;
  el.classList.remove('hidden');
  el.style.display = '';
}

function _hide(el) {
  if (!el) return;
  el.style.display = 'none';
}

// ─── Onboarding: slide question container OUT then call cb, then slide IN ─────
function slideOutLeft(el, cb) {
  if (!el) { cb?.(); return; }
  if (reduced) { cb?.(); return; }  // don't hide/show — just swap content
  gsap.to(el, {
    x: -50, opacity: 0, duration: 0.3, ease: 'power2.in',
    onComplete: () => {
      gsap.set(el, { x: 0, opacity: 1 }); // reset in place
      cb?.();
    }
  });
}

function slideInRight(el) {
  if (!el || reduced) return;
  gsap.fromTo(el,
    { x: 50, opacity: 0 },
    { x: 0, opacity: 1, duration: 0.38, ease: 'power3.out', clearProps: 'transform,opacity' }
  );
}

// ─── FLIP: card → detail overlay ─────────────────────────────────────────────
let _flipState = null;

function flipExpandCard(cardEl, overlayEl) {
  if (!overlayEl) return;
  _show(overlayEl);

  if (reduced) return;

  const cardRect    = cardEl.getBoundingClientRect();
  const overlayRect = overlayEl.getBoundingClientRect();

  const dx = cardRect.left - overlayRect.left;
  const dy = cardRect.top  - overlayRect.top;
  const sx = cardRect.width  / Math.max(overlayRect.width,  1);
  const sy = cardRect.height / Math.max(overlayRect.height, 1);

  _flipState = { cardEl, overlayEl, cardRect };

  gsap.fromTo(overlayEl,
    { x: dx, y: dy, scaleX: sx, scaleY: sy, transformOrigin: '0 0', opacity: 0.7 },
    { x: 0,  y: 0,  scaleX: 1,  scaleY: 1,  opacity: 1,
      duration: 0.52, ease: 'power3.out', clearProps: 'transform,transformOrigin' }
  );
  gsap.to('#overlay-backdrop', { opacity: 1, duration: 0.3, pointerEvents: 'auto' });
}

function flipCollapseOverlay(cb) {
  if (!_flipState) { cb?.(); return; }
  const { cardEl, overlayEl, cardRect } = _flipState;
  _flipState = null;

  if (reduced) {
    _hide(overlayEl);
    gsap.set('#overlay-backdrop', { opacity: 0, pointerEvents: 'none' });
    cb?.();
    return;
  }

  const overlayRect = overlayEl.getBoundingClientRect();
  const dx = cardRect.left - overlayRect.left;
  const dy = cardRect.top  - overlayRect.top;
  const sx = cardRect.width  / Math.max(overlayRect.width,  1);
  const sy = cardRect.height / Math.max(overlayRect.height, 1);

  gsap.to(overlayEl, {
    x: dx, y: dy, scaleX: sx, scaleY: sy, transformOrigin: '0 0', opacity: 0,
    duration: 0.4, ease: 'power3.in',
    onComplete: () => {
      gsap.set(overlayEl, { clearProps: 'all' });
      _hide(overlayEl);
      cb?.();
    }
  });
  gsap.to('#overlay-backdrop', { opacity: 0, pointerEvents: 'none', duration: 0.28 });
}

// ─── Gauge needle ─────────────────────────────────────────────────────────────
function animateGauge(needleEl, fallbackScore) {
  if (!needleEl) return;
  const dataScore = needleEl.dataset.score;
  const visualScore = dataScore != null ? Number(dataScore) : fallbackScore;
  const clamp = Math.max(0, Math.min(100, visualScore ?? 0));
  const angle = -90 + (clamp / 100) * 180;
  if (reduced) {
    gsap.set(needleEl, { rotation: angle, transformOrigin: '50% 100%' });
    return;
  }
  gsap.fromTo(needleEl,
    { rotation: -90, transformOrigin: '50% 100%' },
    { rotation: angle, transformOrigin: '50% 100%', duration: 0.85, ease: 'power3.out', delay: 0.1 }
  );
}

// ─── Card stagger ─────────────────────────────────────────────────────────────
function staggerCards(cards) {
  if (!cards?.length) return;
  if (reduced) { gsap.set(cards, { opacity: 1 }); return; }
  gsap.fromTo(cards,
    { opacity: 0, y: 18 },
    { opacity: 1, y: 0, duration: 0.45, ease: 'power3.out', stagger: 0.055,
      clearProps: 'transform' }
  );
}

// ─── Panel slide up from bottom ───────────────────────────────────────────────
function slideUpPanel(panelEl) {
  if (!panelEl) return;
  _show(panelEl);
  if (reduced) return;
  gsap.fromTo(panelEl,
    { y: '100%', opacity: 0 },
    { y: '0%', opacity: 1, duration: 0.45, ease: 'power3.out' }
  );
}

function slideDownPanel(panelEl, cb) {
  if (!panelEl) { cb?.(); return; }
  if (reduced) { _hide(panelEl); cb?.(); return; }
  gsap.to(panelEl, {
    y: '100%', opacity: 0, duration: 0.35, ease: 'power3.in',
    onComplete: () => { _hide(panelEl); cb?.(); }
  });
}
