// portfolio.js — portfolio analysis: fund chips, live donut, debounced API call

let _portfolioHoldings  = {}; // scheme_code → { allocation_pct, fund }
let _portfolioDonut     = null;
let _ptfAllFunds        = [];
const _portfolioDebounced = debounce(_analyzePortfolio, 300);

async function initPortfolio(allFunds) {
  _ptfAllFunds = allFunds;

  // Restore from session
  const saved = Session.get('portfolio');
  if (saved) _portfolioHoldings = saved;

  _renderPortfolioView();
}

function _renderPortfolioView() {
  const view = $('#view-portfolio');
  if (!view) return;

  view.innerHTML = `
    <div class="portfolio-inner">
      <div class="page-header" data-reveal>
        <h2>Portfolio Analysis</h2>
        <p class="page-sub">Build a hypothetical multi-fund portfolio and analyse its aggregate metrics.</p>
      </div>

      <!-- Fund search + add -->
      <div class="fund-search-wrap">
        <input type="text" class="search-input" id="ptf-search" placeholder="Search and add a fund…" autocomplete="off">
        <div class="search-dropdown hidden" id="ptf-dropdown"></div>
      </div>

      <!-- Holdings chips -->
      <div class="chip-list" id="chip-list"></div>

      <!-- Allocation warning (deprecated) -->
      <div class="alloc-warning hidden" id="alloc-warning"></div>

      <!-- Stat callouts -->
      <div class="ptf-stats hidden" id="ptf-stats">
        <div class="stat-card">
          <span class="stat-value" id="ptf-stat-return">—</span>
          <span class="stat-label">Weighted 3yr return</span>
        </div>
        <div class="stat-card">
          <span class="stat-value" id="ptf-stat-vol">—</span>
          <span class="stat-label">Weighted volatility</span>
        </div>
        <div class="stat-card">
          <span class="stat-value" id="ptf-stat-risk">—</span>
          <span class="stat-label">Model Risk Class</span>
        </div>
        <div class="stat-card">
          <span class="stat-value" id="ptf-stat-expense">—</span>
          <span class="stat-label">Weighted Expense Ratio</span>
        </div>
      </div>

      <!-- Donut chart -->
      <div class="donut-wrap hidden" id="donut-wrap">
        <canvas id="ptf-donut"></canvas>
      </div>

      <div class="ptf-footer">
        <button class="btn-outline" id="ptf-pdf">Download portfolio report</button>
        <button class="btn-ghost" id="ptf-clear">Clear portfolio</button>
      </div>
    </div>
  `;

  _renderChips();
  _wirePortfolioSearch();

  $('#ptf-clear')?.addEventListener('click', () => {
    _portfolioHoldings = {};
    Session.set('portfolio', {});
    _renderChips();
    _updateDonut([]);
    $$('#ptf-stats, #donut-wrap').forEach(hide);
  });

  $('#ptf-pdf')?.addEventListener('click', _exportPortfolioPDF);

  enterElements($$('[data-reveal]'), { y: 20 });
}

function _wirePortfolioSearch() {
  const input    = $('#ptf-search');
  const dropdown = $('#ptf-dropdown');
  if (!input) return;

  input.addEventListener('input', debounce(async () => {
    const q = input.value.trim();
    if (q.length < 2) { hide(dropdown); return; }

    const results = _ptfAllFunds.filter(f =>
      (f['Fund Name'] || '').toLowerCase().includes(q.toLowerCase())
    ).slice(0, 8);

    if (!results.length) { hide(dropdown); return; }

    dropdown.innerHTML = results.map(f => `
      <div class="search-item" data-code="${f['Scheme Code']}">
        <span class="si-name">${f['Fund Name']}</span>
        <span class="si-type">${f['Fund Type'] || ''}</span>
      </div>
    `).join('');

    show(dropdown);
    $$('.search-item', dropdown).forEach(item => {
      item.addEventListener('click', () => {
        const code = parseInt(item.dataset.code);
        const fund = _ptfAllFunds.find(f => f['Scheme Code'] === code);
        if (fund) _addHolding(code, fund);
        input.value = '';
        hide(dropdown);
      });
    });
  }, 200));

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target)) hide(dropdown);
  });
}

function _addHolding(code, fund) {
  if (_portfolioHoldings[code]) return;
  const codes = Object.keys(_portfolioHoldings);
  const n = codes.length + 1;
  const newPct = Math.round((100 / n) * 100) / 100;
  
  // scale down others
  let remaining = 100 - newPct;
  codes.forEach(c => {
    _portfolioHoldings[c].allocation_pct = Math.round((_portfolioHoldings[c].allocation_pct / 100) * remaining * 100) / 100;
  });
  
  _portfolioHoldings[code] = { allocation_pct: newPct, fund };
  _normalizePortfolio();
  
  Session.set('portfolio', _portfolioHoldings);
  _renderChips();
  _portfolioDebounced();
}

function _removeHolding(code) {
  delete _portfolioHoldings[code];
  _normalizePortfolio();
  
  Session.set('portfolio', _portfolioHoldings);
  _renderChips();
  _portfolioDebounced();
}

function _normalizePortfolio() {
  const codes = Object.keys(_portfolioHoldings);
  if (!codes.length) return;
  
  const total = codes.reduce((s, c) => s + _portfolioHoldings[c].allocation_pct, 0);
  if (total === 100 || total === 0) {
    if (total === 0 && codes.length > 0) {
      _portfolioHoldings[codes[0]].allocation_pct = 100;
    }
    return;
  }
  
  if (total > 0) {
    // scale to exactly 100 globally
    codes.forEach(c => {
      _portfolioHoldings[c].allocation_pct = (_portfolioHoldings[c].allocation_pct / total) * 100;
    });
  }
  // Ensure sum is exactly 100 with 2 decimal precision
  let decTotal = 0;
  codes.forEach(c => {
    _portfolioHoldings[c].allocation_pct = Math.round(_portfolioHoldings[c].allocation_pct * 100) / 100;
    decTotal += _portfolioHoldings[c].allocation_pct;
  });
  decTotal = Math.round(decTotal * 100) / 100;
  if (decTotal !== 100) {
    const diff = Math.round((100 - decTotal) * 100) / 100;
    _portfolioHoldings[codes[0]].allocation_pct = Math.round((_portfolioHoldings[codes[0]].allocation_pct + diff) * 100) / 100;
  }
}


function _renderChips() {
  const list = $('#chip-list');
  if (!list) return;
  list.innerHTML = '';

  const codes = Object.keys(_portfolioHoldings);
  if (!codes.length) {
    list.innerHTML = '<p class="chip-empty">Add funds using the search above.</p>';
    return;
  }

  codes.forEach(code => {
    const h    = _portfolioHoldings[code];
    const fund = h.fund;
    const chip = el('div', { class: 'holding-chip' });
    chip.innerHTML = `
      <div class="chip-info">
        <span class="chip-name">${fund['Fund Name']?.split(' ').slice(0, 5).join(' ') || '—'}</span>
        ${riskChip(fund['Risk Category'])}
      </div>
      <div class="chip-controls">
        <div class="custom-slider-container chip-slider-wrap">
          <input type="range" class="custom-slider chip-slider" min="0" max="100" step="0.01"
            value="${h.allocation_pct}" data-code="${code}">
          <div class="slider-track-fill chip-slider-fill"></div>
        </div>
        <output class="chip-alloc-out">${Number(h.allocation_pct).toFixed(2)}%</output>
        <button class="chip-remove" data-code="${code}" aria-label="Remove">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="1" y1="1" x2="11" y2="11"/><line x1="11" y1="1" x2="1" y2="11"/>
          </svg>
        </button>
      </div>
    `;

    // Slider events
    const slider = chip.querySelector('.chip-slider');
    
    // We update all sliders on input
    slider.addEventListener('input', () => {
      const newVal = parseFloat(slider.value);
      const oldVal = h.allocation_pct;
      if (newVal === oldVal) return;
      
      const diff = newVal - oldVal;
      const otherCodes = codes.filter(c => c !== code);
      
      // If we are the only one, we force it to 100
      if (otherCodes.length === 0) {
        slider.value = 100;
        return;
      }
      
      // We must decrease / increase others proportionally
      const otherTotal = otherCodes.reduce((s, c) => s + _portfolioHoldings[c].allocation_pct, 0);
      
      if (diff > 0 && newVal >= 100) {
        // user dragged to 100 max
        h.allocation_pct = 100;
        otherCodes.forEach(c => _portfolioHoldings[c].allocation_pct = 0);
      } else {
        h.allocation_pct = newVal;
        if (otherTotal <= 0 && diff > 0) {
          // If others are at 0 and we pull back, where does the missing go? Just put it to the first.
        } else if (otherTotal > 0) {
          let remainder = -diff;
          // Apply proportionally
          const fractions = otherCodes.map(c => _portfolioHoldings[c].allocation_pct / otherTotal);
          otherCodes.forEach((c, idx) => {
            _portfolioHoldings[c].allocation_pct = Math.max(0, _portfolioHoldings[c].allocation_pct + fractions[idx] * remainder);
          });
        }
      }
      _normalizePortfolio();
      
      // Immediately render dom updates for all sliders silently so dragging one moves the others
      codes.forEach(c => {
        const cChip = list.querySelector(`input.chip-slider[data-code="${c}"]`);
        if(cChip) {
           const controls = cChip.closest('.chip-controls');
           const cOut = controls.querySelector('.chip-alloc-out');
           const cFill = controls.querySelector('.chip-slider-fill');
           cChip.value = _portfolioHoldings[c].allocation_pct;
           if (cOut) cOut.textContent = Number(_portfolioHoldings[c].allocation_pct).toFixed(2) + '%';
           if (cFill) cFill.style.width = _portfolioHoldings[c].allocation_pct + '%';
        }
      });
      
      Session.set('portfolio', _portfolioHoldings);
      _portfolioDebounced(); // debounced API call
      _updateDonutImmediate(); // immediate visual feedback
    });
    
    // Initial fill state
    const fill   = chip.querySelector('.chip-slider-fill');
    fill.style.width = h.allocation_pct + '%';

    chip.querySelector('.chip-remove').addEventListener('click', () => _removeHolding(code));
    list.appendChild(chip);
  });
}

function _updateDonutImmediate() {
  const codes  = Object.keys(_portfolioHoldings);
  const labels = codes.map(c => _portfolioHoldings[c]?.fund?.['Fund Name']?.split(' ').slice(0, 3).join(' ') || c);
  const values = codes.map(c => _portfolioHoldings[c]?.allocation_pct || 0);

  if (!codes.length) return;
  show($('#donut-wrap'));
  _drawDonut(labels, values);
}

function _drawDonut(labels, values) {
  const canvas = $('#ptf-donut');
  if (!canvas) return;

  const COLORS = ['#2F5D5A', '#C9A24B', '#C2793F', '#6B9E78', '#B3543F', '#4a7a9b', '#8b6b9e'];

  if (_portfolioDonut) {
    _portfolioDonut.data.labels   = labels;
    _portfolioDonut.data.datasets[0].data = values;
    _portfolioDonut.update({ duration: 400 });
    return;
  }

  _portfolioDonut = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: COLORS, borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '65%',
      plugins: {
        legend: { position: 'right', labels: { font: { size: 11 }, color: '#1A1A1A', boxWidth: 12 } },
        tooltip: { callbacks: { label: ctx => `${ctx.label}: ${ctx.parsed}%` } },
      },
      animation: { animateRotate: true, duration: 500 },
    }
  });
}

async function _analyzePortfolio() {
  const codes = Object.keys(_portfolioHoldings);
  if (codes.length < 1) return;

  const holdings = codes.map(c => ({
    scheme_code: parseInt(c),
    allocation_pct: _portfolioHoldings[c]?.allocation_pct || 0,
  }));

  try {
    const data = await Api.portfolio(holdings, true);

    const statsEl = $('#ptf-stats');
    if (statsEl) {
      show(statsEl);
      const retEl  = $('#ptf-stat-return');
      const volEl  = $('#ptf-stat-vol');
      const riskEl = $('#ptf-stat-risk');
      const expEl  = $('#ptf-stat-expense');

      if (retEl && data.weighted_3yr_return_pct != null)
        countUp(retEl, data.weighted_3yr_return_pct, { suffix: '%', decimals: 2 });
      if (volEl && data.weighted_volatility_pct != null)
        countUp(volEl, data.weighted_volatility_pct, { suffix: '%', decimals: 2 });
      if (riskEl && data.portfolio_risk_category != null)
        riskEl.innerHTML = riskChip(data.portfolio_risk_category);
      if (expEl && data.weighted_expense_ratio_pct != null)
        countUp(expEl, data.weighted_expense_ratio_pct, { suffix: '%', decimals: 2 });
      else if (expEl)
        expEl.textContent = 'N/A';
    }
  } catch {}
}

async function _exportPortfolioPDF() {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) return alert('PDF library not loaded.');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 20;

  doc.setFont('helvetica', 'bold'); doc.setFontSize(18);
  doc.text('MutualFund AI — Portfolio Report', 15, y); y += 10;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);

  const total = Object.values(_portfolioHoldings).reduce((s, h) => s + h.allocation_pct, 0);
  Object.entries(_portfolioHoldings).forEach(([code, h]) => {
    const pct = ((h.allocation_pct / total) * 100).toFixed(1);
    doc.text(`${h.fund?.['Fund Name'] || code} — ${pct}%`, 15, y, { maxWidth: 180 });
    y += 6; if (y > 270) { doc.addPage(); y = 20; }
  });

  doc.save('mf-portfolio.pdf');
}
