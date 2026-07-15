// utils.js — shared formatters, DOM helpers, state management

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt = {
  currency: (n) => n == null ? '—'
    : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 0 }),

  pct: (n, decimals = 2) => n == null ? '—'
    : (n >= 0 ? '+' : '') + Number(n).toFixed(decimals) + '%',

  pctPlain: (n, decimals = 2) => n == null ? '—'
    : Number(n).toFixed(decimals) + '%',

  num: (n, decimals = 1) => n == null ? '—' : Number(n).toFixed(decimals),
  score: (n) => n == null ? '—' : Math.round(n) + ' / 100',
};

// ─── DOM ─────────────────────────────────────────────────────────────────────
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v);
  }
  for (const c of children) {
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else if (c) e.appendChild(c);
  }
  return e;
}

// Use inline style for show/hide — avoids GSAP opacity conflicts with class toggles
function show(el) {
  if (!el) return;
  el.classList.remove('hidden');
  if (el.style.display === 'none') el.style.display = '';
}
function hide(el) {
  if (!el) return;
  el.style.display = 'none';
}
function toggle(el, force) {
  if (!el) return;
  if (force === undefined) force = el.style.display === 'none';
  if (force) show(el); else hide(el);
}

// ─── Debounce ────────────────────────────────────────────────────────────────
function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ─── Count-up animation ──────────────────────────────────────────────────────
function countUp(element, target, { duration = 1200, prefix = '', suffix = '', decimals = 0 } = {}) {
  if (!element) return;
  const red = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (red || isNaN(target)) {
    element.textContent = prefix + Number(target || 0).toFixed(decimals) + suffix;
    return;
  }
  const start = performance.now();
  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - t, 3);
    const val = (target - 0) * ease;
    element.textContent = prefix + val.toFixed(decimals) + suffix;
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─── Session storage state ────────────────────────────────────────────────────
const Session = {
  _key: 'mf_state',
  get(field) {
    try {
      const s = JSON.parse(sessionStorage.getItem(this._key) || '{}');
      return field ? s[field] : s;
    } catch { return field ? undefined : {}; }
  },
  set(field, val) {
    try {
      const s = this.get();
      s[field] = val;
      sessionStorage.setItem(this._key, JSON.stringify(s));
    } catch {}
  },
  clear() { sessionStorage.removeItem(this._key); },
};

// ─── Risk chip ────────────────────────────────────────────────────────────────
function riskChip(category) {
  const map = {
    'Low':       { bg: 'rgba(107,158,120,0.12)', text: '#3d7a4f' },
    'Moderate':  { bg: 'rgba(201,162,75,0.14)',  text: '#7a5e18' },
    'High':      { bg: 'rgba(194,121,63,0.12)',  text: '#8a4318' },
    'Very High': { bg: 'rgba(179,84,63,0.12)',   text: '#7a2818' },
  };
  const c = map[category] || { bg: 'rgba(0,0,0,0.06)', text: '#6B6B6B' };
  return `<span class="risk-chip" style="background:${c.bg};color:${c.text}">${category || '—'}</span>`;
}

// ─── Skeleton cards ───────────────────────────────────────────────────────────
function skeletonCards(container, count = 6) {
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    container.insertAdjacentHTML('beforeend', `
      <div class="fund-card skeleton" style="opacity:1">
        <div class="skel skel-line w60"></div>
        <div class="skel skel-line w40 mt8"></div>
        <div class="skel skel-block mt12"></div>
        <div class="skel skel-line w50 mt8"></div>
      </div>
    `);
  }
}

// ─── SIP formula ─────────────────────────────────────────────────────────────
function sipFV(monthly, cagr_pct, years) {
  const i = cagr_pct / 100 / 12;
  const n = years * 12;
  if (Math.abs(i) < 1e-9) return monthly * n;
  return monthly * (((1 + i) ** n - 1) / i) * (1 + i);
}

// ─── Empty / Error states ─────────────────────────────────────────────────────
function errorState(title, body) {
  return `
    <div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <circle cx="12" cy="16" r="0.5" fill="currentColor"/>
        </svg>
      </div>
      <h3 class="empty-title">${title}</h3>
      <p class="empty-body">${body}</p>
    </div>`;
}

function noResults(title = 'No funds found', body = 'Try adjusting your filters or risk tolerance.') {
  return `
    <div class="empty-state">
      <div class="empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>
      <h3 class="empty-title">${title}</h3>
      <p class="empty-body">${body}</p>
    </div>`;
}
