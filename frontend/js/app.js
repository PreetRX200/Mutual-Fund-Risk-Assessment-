// app.js — main router / state machine

let _meta       = {};
let _lastMeta   = {};
let _allFunds   = [];

async function boot() {
  // ── Health check ────────────────────────────────────────────────────────
  try {
    await Api.health();
  } catch {
    document.body.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;
                  font-family:'General Sans',Inter,sans-serif;background:#F7F6F3">
        <div style="text-align:center;max-width:420px;padding:2rem">
          <h2 style="font-family:Fraunces,Georgia,serif;font-size:2rem;margin-bottom:1rem;
                     color:#1A1A1A">Backend not reachable</h2>
          <p style="color:#6B6B6B;line-height:1.6">Make sure the Flask API is running:<br><br>
          <code style="background:#e8e6e1;padding:6px 12px;border-radius:8px;font-size:0.9rem;
                       display:inline-block">python flask_api.py</code></p>
        </div>
      </div>`;
    return;
  }

  // ── Load meta ───────────────────────────────────────────────────────────
  try {
    _meta     = await Api.meta();
    _lastMeta = _meta;
  } catch { _meta = {}; }

  // ── Load all funds for portfolio search (non-blocking) ──────────────────
  Api.funds({ limit: 900 }).then(d => { _allFunds = d.funds || []; }).catch(() => {});

  // ── Init hero ───────────────────────────────────────────────────────────
  initHero(_meta);

  // ── Pre-init views (inject their shell HTML) ────────────────────────────
  initPortfolio(_allFunds);
  initWhatif(_meta);

  // ── Restore session ─────────────────────────────────────────────────────
  const savedResult = Session.get('recommend_result');
  const savedBody   = Session.get('recommend_body');
  if (savedResult && savedBody) {
    switchView('results');
    renderResults(savedResult, savedBody);
  }

  // ── Wire "Get started" button ────────────────────────────────────────────
  $('#cta-btn')?.addEventListener('click', () => {
    switchView('onboarding');
    initOnboarding(_meta);
  });

  // ── Wire nav links ───────────────────────────────────────────────────────
  $$('[data-nav]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.dataset.nav;

      if (target === 'results') {
        const saved = Session.get('recommend_result');
        if (saved) {
          switchView('results');
          renderResults(saved, Session.get('recommend_body') || {});
        } else {
          // No results yet — go to onboarding
          switchView('onboarding');
          initOnboarding(_meta);
        }
        return;
      }

      switchView(target);

      // Re-hydrate views that need fresh data
      if (target === 'portfolio') initPortfolio(_allFunds);
      if (target === 'whatif')    initWhatif(_meta);
    });
  });

  // ── Overlay backdrop dismisses detail ───────────────────────────────────
  $('#overlay-backdrop')?.addEventListener('click', closeDetail);

  // ── ScrollTrigger refresh after fonts ───────────────────────────────────
  document.fonts.ready.then(() => ScrollTrigger?.refresh());
}

// ─── Central view switcher ────────────────────────────────────────────────────
const VIEWS = ['hero', 'onboarding', 'results', 'portfolio', 'whatif'];

function switchView(target) {
  // Hide all view sections
  VIEWS.forEach(v => {
    const el = $(`#view-${v}`);
    if (el) {
      el.classList.add('hidden');   // adds display:none!important via CSS
      el.style.display = '';        // clear any inline override
    }
  });

  // Show target — remove .hidden so CSS lets it render, then GSAP fades in
  const targetEl = $(`#view-${target}`);
  if (targetEl) {
    targetEl.classList.remove('hidden');
    targetEl.style.display = '';
    fadeIn(targetEl, { y: 14 });
  }

  // Update nav active state
  $$('[data-nav]').forEach(l => {
    l.classList.toggle('active', l.dataset.nav === target);
  });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', boot);
