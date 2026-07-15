// api.js — typed wrappers around every backend endpoint
// All functions return parsed JSON or throw an Error with a user-friendly message.

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!res.ok) {
    let msg = `Server error (${res.status})`;
    try { msg = (await res.json()).error || msg; } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

const Api = {
  health:   ()           => apiFetch('/api/health'),
  meta:     ()           => apiFetch('/api/meta'),

  funds: ({ fund_type = '', risk_category = '', search = '', limit = 100 } = {}) => {
    const q = new URLSearchParams();
    if (fund_type)     q.set('fund_type', fund_type);
    if (risk_category) q.set('risk_category', risk_category);
    if (search)        q.set('search', search);
    if (limit)         q.set('limit', limit);
    return apiFetch(`/api/funds?${q}`);
  },

  fund: (scheme_code, live = false) =>
    apiFetch(`/api/fund/${scheme_code}?live=${live}`),

  recommend: (body) =>
    apiFetch('/api/recommend', { method: 'POST', body: JSON.stringify(body) }),

  compare: (scheme_codes, live = false) =>
    apiFetch('/api/compare', { method: 'POST', body: JSON.stringify({ scheme_codes, live }) }),

  portfolio: (holdings, live = false) =>
    apiFetch('/api/portfolio/analyze', { method: 'POST', body: JSON.stringify({ holdings, live }) }),

  whatif: (body) =>
    apiFetch('/api/whatif', { method: 'POST', body: JSON.stringify(body) }),

  modelInsights: () => apiFetch('/api/model_insights'),
};
