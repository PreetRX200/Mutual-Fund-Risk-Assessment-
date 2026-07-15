// detail.js — fund detail overlay: FLIP expand, NAV chart, risk gauge, SIP calculator

let _detailChartNav = null;
let _detailChartSip = null;
let _activeFund     = null;

function openDetail(fund, cardEl) {
  _activeFund = fund;
  const overlay = $('#detail-overlay');
  if (!overlay) return;

  _renderDetailContent(fund);
  flipExpandCard(cardEl, overlay);

  // After FLIP, fetch live data if needed
  setTimeout(() => _enrichDetailLive(fund['Scheme Code']), 400);
}

function closeDetail() {
  const overlay = $('#detail-overlay');
  if (!overlay) return;

  if (_detailChartNav) { _detailChartNav.destroy(); _detailChartNav = null; }
  if (_detailChartSip) { _detailChartSip.destroy(); _detailChartSip = null; }

  flipCollapseOverlay(() => { overlay.innerHTML = ''; });
}

function _renderDetailContent(fund) {
  const overlay = $('#detail-overlay');
  const risk    = fund['Predicted Risk Category'] || fund['Risk Category'];
  const score   = fund['Predicted Risk Score']    ?? fund['Risk Score'] ?? 50;
  const cagr    = fund['3yr Return (%)'] ?? fund['5yr Return (%)'] ?? 10;

  overlay.innerHTML = `
    <div class="detail-inner">
      <button class="detail-close" id="detail-close" aria-label="Close">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="2" y1="2" x2="14" y2="14"/>
          <line x1="14" y1="2" x2="2" y2="14"/>
        </svg>
      </button>

      <div class="detail-head">
        <div>
          <h2 class="detail-name">${fund['Fund Name'] || '—'}</h2>
          <span class="card-type">${fund['Fund Type'] || ''}</span>
          ${riskChip(risk)}
          
          <div class="actual-vs-predicted mt12">
            <p class="wi-result-label" style="margin-bottom: 4px;">Risk Assessment</p>
            <p style="font-size: 11px; color: var(--text-secondary);">
              Actual: <strong>${fund['Risk Category'] || 'Unrated'}</strong> &nbsp;|&nbsp; 
              Model Predicted: <strong>${fund['Predicted Risk Category'] || 'N/A'}</strong>
            </p>
          </div>
        </div>
        <div class="detail-headline-metrics">
          <div class="hm">
            <span class="hm-val ${(cagr >= 0) ? 'pos' : 'neg'}">${fmt.pct(cagr)}</span>
            <span class="hm-label">3yr return</span>
          </div>
          <div class="hm">
            <span class="hm-val">${fmt.pctPlain(fund['SD (Volatility %)'])}</span>
            <span class="hm-label">Volatility</span>
          </div>
          <div class="hm">
            <span class="hm-val">${fmt.num(fund['Fund Age (yrs)'])} yr</span>
            <span class="hm-label">Age</span>
          </div>
        </div>
      </div>

      <!-- Live data placeholder -->
      <div class="detail-live hidden" id="detail-live-row">
        <div class="live-stat" id="live-expense">
          <span class="live-label">Expense ratio</span>
          <span class="live-val" id="live-expense-val">—</span>
        </div>
        <div class="live-stat" id="live-sip">
          <span class="live-label">Min SIP</span>
          <span class="live-val" id="live-sip-val">—</span>
        </div>
        <div class="live-stat" id="live-lump">
          <span class="live-label">Min lumpsum</span>
          <span class="live-val" id="live-lump-val">—</span>
        </div>
      </div>

      <div class="detail-grid">
        <!-- Left column: returns bar -->
        <div class="detail-col">

          <h4 class="detail-section-title mt24">Historical Returns</h4>
          <div class="return-bars">
            ${_returnBar('1yr', fund['1yr Return (%)'])}
            ${_returnBar('3yr', fund['3yr Return (%)'])}
            ${_returnBar('5yr', fund['5yr Return (%)'])}
          </div>
        </div>

        <!-- Right column: gauge + SIP calc -->
        <div class="detail-col">
          <h4 class="detail-section-title">Risk Score</h4>
          <div class="gauge-wrap">
            ${_gaugeHTML(score, risk)}
          </div>
          ${fund['Category Confidence'] != null
            ? `<p class="gauge-caption">AI confidence: <strong>${(fund['Category Confidence'] * 100).toFixed(1)}%</strong></p>`
            : ''}

          <h4 class="detail-section-title mt24">SIP Projection</h4>
          <div class="sip-calc" id="sip-calc">
            ${_sipCalcHTML(cagr)}
          </div>
        </div>
      </div>

    </div>
  `;

  // Close button
  $('#detail-close', overlay)?.addEventListener('click', closeDetail);

  // Gauge needle
  const needle = $('#gauge-needle');
  if (needle) animateGauge(needle, score);

  // SIP calculator wiring
  _wireSipCalc(cagr);
}

function _returnBar(label, val) {
  if (val == null) return '';
  const max = 50; // max % shown
  const clamp = Math.max(-max, Math.min(max, val));
  const pct = Math.abs(clamp) / max * 100;
  const pos = val >= 0;
  return `
    <div class="ret-bar-row">
      <span class="ret-label">${label}</span>
      <div class="ret-track">
        <div class="ret-fill ${pos ? 'pos' : 'neg'}" style="width:${pct}%"></div>
      </div>
      <span class="ret-val ${pos ? 'pos' : 'neg'}">${fmt.pct(val)}</span>
    </div>
  `;
}

function _gaugeHTML(score, risk) {
  // Raw score is skewed (median ~27), mapped via qcut quartiles to categories.
  // We override the visual needle position to match the quartile bucket.
  let needleVal = score ?? 50;
  if (risk === 'Low') needleVal = 12.5;
  else if (risk === 'Moderate') needleVal = 37.5;
  else if (risk === 'High') needleVal = 62.5;
  else if (risk === 'Very High') needleVal = 87.5;
  else needleVal = Math.max(0, Math.min(100, (needleVal / 80) * 100)); // Fallback scaling

  const clamp  = Math.max(0, Math.min(100, score ?? 50));
  // semicircle SVG gauge
  return `
    <svg class="gauge-svg" viewBox="0 0 200 110" xmlns="http://www.w3.org/2000/svg">
      <!-- Track arc -->
      <path d="M 10 100 A 90 90 0 0 1 190 100" fill="none" stroke="var(--border-subtle)" stroke-width="14" stroke-linecap="round"/>
      <!-- Risk tier segments (decorative) -->
      <path d="M 10 100 A 90 90 0 0 1 55 23"  fill="none" stroke="#6B9E7844" stroke-width="14"/>
      <path d="M 55 23 A 90 90 0 0 1 100 10"  fill="none" stroke="#C9A24B44" stroke-width="14"/>
      <path d="M 100 10 A 90 90 0 0 1 145 23" fill="none" stroke="#C2793F44" stroke-width="14"/>
      <path d="M 145 23 A 90 90 0 0 1 190 100" fill="none" stroke="#B3543F44" stroke-width="14"/>
      <!-- Needle -->
      <line id="gauge-needle" data-score="${needleVal}" x1="100" y1="100" x2="100" y2="18"
        stroke="var(--text-primary)" stroke-width="3" stroke-linecap="round"/>
      <circle cx="100" cy="100" r="5" fill="var(--text-primary)"/>
      <!-- Labels -->
      <text x="6"   y="112" class="gauge-label">Low</text>
      <text x="150" y="112" class="gauge-label">Very High</text>
    </svg>
  `;
}

function _sipCalcHTML(cagr) {
  return `
    <div class="sip-row">
      <label class="sip-label">Monthly amount</label>
      <div class="custom-slider-container">
        <input type="range" class="custom-slider" id="sip-amount" min="500" max="100000" step="500" value="10000">
        <div class="slider-track-fill" id="sip-amount-fill"></div>
      </div>
      <output class="slider-output" id="sip-amount-out">₹10,000</output>
    </div>
    <div class="sip-row">
      <label class="sip-label">Investment years</label>
      <div class="custom-slider-container">
        <input type="range" class="custom-slider" id="sip-years" min="1" max="40" step="1" value="10">
        <div class="slider-track-fill" id="sip-years-fill"></div>
      </div>
      <output class="slider-output" id="sip-years-out">10 years</output>
    </div>
    <div class="sip-result">
      <span class="sip-result-label">Projected corpus</span>
      <span class="sip-result-val" id="sip-result-val">—</span>
    </div>
    <div class="sip-chart-wrap">
      <canvas id="sip-proj-chart"></canvas>
    </div>
  `;
}

function _wireSipCalc(cagr) {
  const amtEl  = $('#sip-amount');
  const yrsEl  = $('#sip-years');
  const amtOut = $('#sip-amount-out');
  const yrsOut = $('#sip-years-out');
  const resEl  = $('#sip-result-val');
  const amtFill = $('#sip-amount-fill');
  const yrsFill = $('#sip-years-fill');

  function updateFill(slider, fill) {
    const pct = ((slider.value - slider.min) / (slider.max - slider.min)) * 100;
    fill.style.width = pct + '%';
  }

  function compute() {
    const amt = Number(amtEl.value);
    const yrs = Number(yrsEl.value);
    amtOut.textContent = '₹' + amt.toLocaleString('en-IN');
    yrsOut.textContent = yrs + (yrs === 1 ? ' year' : ' years');
    updateFill(amtEl, amtFill);
    updateFill(yrsEl, yrsFill);

    const fv = sipFV(amt, cagr || 10, yrs);
    resEl.textContent = '₹' + Math.round(fv).toLocaleString('en-IN');

    // Build projection data points (yearly)
    const labels = [];
    const values = [];
    for (let y = 1; y <= yrs; y++) {
      labels.push(`Yr ${y}`);
      values.push(Math.round(sipFV(amt, cagr || 10, y)));
    }
    _updateSipChart(labels, values);
  }

  amtEl?.addEventListener('input', compute);
  yrsEl?.addEventListener('input', compute);
  compute(); // initial render
}

function _updateSipChart(labels, values) {
  const canvas = $('#sip-proj-chart');
  if (!canvas) return;

  if (_detailChartSip) {
    _detailChartSip.data.labels = labels;
    _detailChartSip.data.datasets[0].data = values;
    _detailChartSip.update({ duration: 300 });
    return;
  }

  _detailChartSip = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: values,
        borderColor: 'var(--accent)',
        backgroundColor: 'rgba(47,93,90,0.08)',
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: { label: ctx => '₹' + ctx.parsed.y.toLocaleString('en-IN') }
      }},
      scales: {
        x: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { color: '#6B6B6B', font: { size: 10 } } },
        y: { grid: { color: 'rgba(0,0,0,0.04)' }, ticks: {
          color: '#6B6B6B', font: { size: 10 },
          callback: v => '₹' + (v >= 100000 ? (v / 100000).toFixed(1) + 'L' : v.toLocaleString('en-IN')),
        }},
      },
    }
  });
}

async function _enrichDetailLive(scheme_code) {
  if (!scheme_code) return;
  try {
    const fund = await Api.fund(scheme_code, true);
    _activeFund = { ..._activeFund, ...fund };

    // Live stats row
    if (fund.expense_ratio != null || fund.sip_min != null || fund.lump_min != null) {
      const row = $('#detail-live-row');
      if (row) {
        show(row);
        if (fund.expense_ratio != null) $('#live-expense-val').textContent = fund.expense_ratio + '%';
        if (fund.sip_min != null) $('#live-sip-val').textContent = fmt.currency(fund.sip_min);
        if (fund.lump_min != null) $('#live-lump-val').textContent = fmt.currency(fund.lump_min);
        enterElements(row, { y: 10 });
      }
    }
  } catch { /* live enrichment is optional — fail silently */ }
}

