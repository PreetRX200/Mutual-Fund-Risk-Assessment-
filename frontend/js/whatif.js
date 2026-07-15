// whatif.js — What-if Analyzer: custom sliders → /api/whatif → gauge + probability bar

async function initWhatif(meta) {
  const view = $('#view-whatif');
  if (!view) return;

  const fundTypes = meta?.fund_types || [];

  view.innerHTML = `
    <div class="whatif-inner">
      <div class="page-header" data-reveal>
        <h2>Model Playground</h2>
        <p class="page-sub">Enter hypothetical fund parameters to interrogate the XGBoost model outputs, including feature logic and probabilities.</p>
      </div>

      <div class="whatif-grid">
        <!-- Inputs -->
        <div class="whatif-inputs">
          <div class="wi-field">
            <label class="form-label">Fund Type</label>
            <select class="form-select" id="wi-fund-type">
              ${fundTypes.map(t => `<option value="${t}">${t}</option>`).join('')}
            </select>
          </div>

          <div class="dial-grid">
            ${_wiSlider('wi-volatility', 'Volatility', 0, 50, 0.5, 10, v => v.toFixed(1) + '%')}
            ${_wiSlider('wi-age',        'Age',  1, 40, 1,   5,  v => v + 'y')}
            ${_wiSlider('wi-ret1',       '1yr Ret',   -20, 80, 0.5, 10, v => v.toFixed(1) + '%')}
            ${_wiSlider('wi-ret3',       '3yr Ret',   -10, 80, 0.5, 12, v => v.toFixed(1) + '%')}
            ${_wiSlider('wi-ret5',       '5yr Ret',   -10, 80, 0.5, 14, v => v.toFixed(1) + '%')}
          </div>

          <button class="btn-primary wi-run" id="wi-run">
            Run prediction
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="3,2 14,8 3,14"/>
            </svg>
          </button>
        </div>

        <!-- Results -->
        <div class="whatif-results" id="wi-results">
          <div class="wi-placeholder">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="24" cy="24" r="20"/>
              <path d="M16 32 Q24 16 32 32"/>
              <circle cx="24" cy="10" r="2" fill="currentColor"/>
            </svg>
            <p>Adjust parameters and run a prediction to see results here.</p>
          </div>
        </div>
      </div>
    </div>
  `;

  // Wire all dials
  $$('.dial-container[id^="dial-wrap-wi-"]', view).forEach(dialContainer => {
    _wireWiDial(dialContainer);
  });
  
  _fetchAndRenderModelInsights();

  $('#wi-run')?.addEventListener('click', _runWhatif);
  enterElements($$('[data-reveal]', view), { y: 20 });
}

function _wiSlider(id, label, min, max, step, defaultVal, fmt) {
  return `
    <div class="dial-container" id="dial-wrap-${id}" data-min="${min}" data-max="${max}" data-step="${step}">
      <svg class="dial-svg" viewBox="-50 -50 100 100" id="${id}-svg">
        <circle class="dial-track" cx="0" cy="0" r="40"/>
        <circle class="dial-fill" cx="0" cy="0" r="40" id="${id}-fill" stroke-dasharray="0 251.2"/>
        <g class="dial-knob" id="${id}-knob">
          <circle cx="0" cy="-40" r="6" fill="var(--surface)" stroke="var(--accent)" stroke-width="2"/>
        </g>
        <text class="dial-val-text" x="0" y="4" id="${id}-out">${fmt(defaultVal)}</text>
      </svg>
      <span class="dial-label">${label}</span>
      <input type="hidden" id="${id}" value="${defaultVal}">
    </div>
  `;
}

function _wireWiDial(container) {
  const svg   = container.querySelector('.dial-svg');
  const fill  = container.querySelector('.dial-fill');
  const knob  = container.querySelector('.dial-knob');
  const out   = container.querySelector('.dial-val-text');
  const input = container.querySelector('input[type="hidden"]');
  
  const min  = Number(container.dataset.min);
  const max  = Number(container.dataset.max);
  const step = Number(container.dataset.step);
  const id   = input.id;
  const c = 2 * Math.PI * 40; // circumference

  let isDragging = false;
  
  const updateVisuals = (pct) => {
    // max visually stop at 359deg so gap is preserved, or go full 360
    const angle = pct * 360; 
    fill.style.strokeDasharray = `${(pct * c)} ${c}`;
    knob.style.transform = `rotate(${angle}deg)`;
    const val = min + pct * (max - min);
    // snap to step
    const snapped = Math.round(val / step) * step;
    input.value = snapped;
    out.textContent = _wiFormatVal(id, snapped);
  };
  
  const cb = (e) => {
    if (!isDragging) return;
    e.preventDefault();
    const bb = svg.getBoundingClientRect();
    const cx = bb.left + bb.width / 2;
    const cy = bb.top + bb.height / 2;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const dx = clientX - cx;
    const dy = clientY - cy;
    let rad = Math.atan2(dy, dx);
    // normal atan2 is -pi to +pi. We want 12 oclock (-pi/2) to be 0
    let deg = rad * (180 / Math.PI) + 90;
    if (deg < 0) deg += 360; // 0 to 360
    
    // We can add a clamp so user can't cross from 100% to 0% easily if we want,
    // but a pure modulo dial is often fine. Let's restrict it simply:
    let pct = deg / 360;
    updateVisuals(pct);
  };

  svg.addEventListener('mousedown', () => { isDragging = true; });
  svg.addEventListener('touchstart', () => { isDragging = true; });
  window.addEventListener('mousemove', cb);
  window.addEventListener('touchmove', cb, {passive: false});
  window.addEventListener('mouseup', () => { isDragging = false; });
  window.addEventListener('touchend', () => { isDragging = false; });

  // init state
  const initialPct = (Number(input.value) - min) / (max - min);
  updateVisuals(initialPct);
}

function _wiFormatVal(id, v) {
  if (id === 'wi-age') return v + 'y';
  return v.toFixed(1) + '%';
}

async function _runWhatif() {
  const btn = $('#wi-run');
  if (btn) { btn.disabled = true; btn.textContent = 'Predicting…'; }

  const body = {
    fund_type:  $('#wi-fund-type')?.value,
    volatility: Number($('#wi-volatility')?.value || 10),
    fund_age:   Number($('#wi-age')?.value || 5),
    ret_1y:     Number($('#wi-ret1')?.value || 10),
    ret_3y:     Number($('#wi-ret3')?.value || 12),
    ret_5y:     Number($('#wi-ret5')?.value || 14),
  };

  const resultsEl = $('#wi-results');

  try {
    const data = await Api.whatif(body);
    _renderWhatifResults(data, resultsEl);
  } catch (err) {
    resultsEl.innerHTML = errorState('Prediction failed', err.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = `Run prediction
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
        <polygon points="3,2 14,8 3,14"/>
      </svg>`; }
  }
}

function _renderWhatifResults(data, container) {
  const score = data.predicted_risk_score ?? 50;
  const cat   = data.predicted_risk_category || '—';
  const probs = data.probabilities || {};

  container.innerHTML = `
    <div class="wi-result-wrap">
      <div class="wi-result-top" style="justify-content: center; text-align: center;">
        <div>
          <p class="wi-result-label">Predicted category</p>
          ${riskChip(cat)}
        </div>
      </div>

      <!-- Gauge — reuse same component -->
      <div class="gauge-wrap gauge-compact">
        ${_gaugeHTML(score, cat)}
      </div>

      <!-- Probability bar -->
      <div class="prob-section">
        <p class="wi-result-label">Category probabilities</p>
        ${_probBar(probs)}
      </div>
    </div>
  `;

  // Animate gauge
  const needle = $('#gauge-needle', container);
  if (needle) animateGauge(needle, score);

  enterElements(container.children, { y: 12, stagger: 0.05 });
}

function _probBar(probs) {
  const order = ['Low', 'Moderate', 'High', 'Very High'];
  const colors = { 'Low': '#6B9E78', 'Moderate': '#C9A24B', 'High': '#C2793F', 'Very High': '#B3543F' };
  const total  = Object.values(probs).reduce((s, v) => s + v, 0) || 1;

  const segments = order.map(cat => {
    const pct = ((probs[cat] || 0) / total) * 100;
    return `<div class="prob-seg" style="width:${pct.toFixed(1)}%;background:${colors[cat]}"
      title="${cat}: ${(pct).toFixed(1)}%"></div>`;
  }).join('');

  const legend = order.map(cat => {
    const pct = ((probs[cat] || 0) / total * 100).toFixed(1);
    return `<div class="prob-legend-item">
      <span class="prob-dot" style="background:${colors[cat]}"></span>
      <span>${cat}: <strong>${pct}%</strong></span>
    </div>`;
  }).join('');

  return `
    <div class="prob-bar">${segments}</div>
    <div class="prob-legend">${legend}</div>
  `;
}

// ─── MODEL INSIGHTS ────────────────────────────────────────────────────────
let _featChart = null;

async function _fetchAndRenderModelInsights() {
  const view = $('#view-whatif');
  if (!view) return;

  try {
    const data = await Api.modelInsights();
    if (!data.features) return;

    // Build the grid if not exists
    let grid = $('#model-insights-grid');
    if (!grid) {
      grid = el('div', { id: 'model-insights-grid', class: 'insights-grid' });
      view.querySelector('.whatif-inner').appendChild(grid);
    }
    
    // Sort features safely handling NaNs/Nulls
    const feats = data.features.map((f, i) => ({ name: f, val: data.importances[i] || 0 }))
                               .sort((a,b) => b.val - a.val);

    grid.innerHTML = `
      <div class="insight-card">
        <h4 class="detail-section-title">Feature Importance (XGBoost)</h4>
        <div class="insight-chart-wrap" style="height: 220px;">
          <canvas id="insight-feat-chart"></canvas>
        </div>
      </div>
      <div class="insight-card">
        <h4 class="detail-section-title">Confusion Matrix (Training Set)</h4>
        <div class="compare-table-wrap">
          <table class="compare-table" style="text-align: center;">
            <thead>
              <tr>
                <th>True \\ Pred</th>
                ${data.classes.map(c => `<th>${c}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${data.confusion_matrix.map((row, i) => `
                <tr>
                  <th>${data.classes[i]}</th>
                  ${row.map((v, j) => `<td style="${i===j ? 'background:rgba(47,93,90,0.1);font-weight:600;' : ''}">${v}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    // Render Chart
    const canvas = $('#insight-feat-chart');
    if (canvas) {
      if (_featChart) _featChart.destroy();
      _featChart = new Chart(canvas, {
        type: 'bar',
        data: {
          labels: feats.map(f => f.name.replace(' (%)', '').replace(' (yrs)', '')),
          datasets: [{
            data: feats.map(f => f.val),
            backgroundColor: 'rgba(47,93,90,0.8)',
            borderRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } },
            x: { grid: { display: false } }
          }
        }
      });
    }

  } catch (err) {
    console.warn('Model insights failed:', err);
  }
}
