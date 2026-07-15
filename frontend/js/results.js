// results.js — recommendation results: stat strip, advice, fund card grid

let _compareMode  = false;
let _compareSet   = new Set();

function renderResults(data, body) {
  const view = $('#view-results');
  if (!view) return;

  view.innerHTML = `
    <div class="results-inner">
      <!-- Stat strip -->
      <div class="stat-strip" id="stat-strip"></div>

      <!-- Advice -->
      <div class="advice-block" id="advice-block" data-reveal></div>

      <!-- Controls bar -->
      <div class="results-controls">
        <div class="results-filter-row">
          <input type="text" class="search-input" id="results-search" placeholder="Search funds…">
          <label class="optimize-toggle">
            <input type="checkbox" id="optimize-toggle"> Optimised allocation
          </label>
          <button class="btn-outline compare-mode-btn" id="compare-mode-btn">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="1" y="3" width="6" height="10" rx="1"/>
              <rect x="9" y="3" width="6" height="10" rx="1"/>
            </svg>
            Compare
          </button>
        </div>
      </div>

      <!-- Fund grid -->
      <div class="fund-grid" id="fund-grid"></div>

      <!-- Optimised allocation (hidden until toggled) -->
      <div class="opt-alloc hidden" id="opt-alloc"></div>

      <!-- Download -->
      <div class="results-footer">
        <button class="btn-outline" id="results-pdf-btn">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M9 1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6L9 1z"/>
            <polyline points="9,1 9,6 14,6"/>
            <line x1="6" y1="10" x2="10" y2="10"/>
            <line x1="8" y1="8" x2="8" y2="12"/>
          </svg>
          Download summary
        </button>
        <button class="btn-ghost" id="restart-btn">Start over</button>
      </div>
    </div>

    <!-- Floating compare button -->
    <div class="compare-fab hidden" id="compare-fab">
      Compare (<span id="compare-count">0</span>)
    </div>
  `;

  // Stat strip
  _renderStatStrip(data, body);

  // Advice
  const adviceEl = $('#advice-block');
  adviceEl.innerHTML = data.advice
    ? `<p class="advice-text">${data.advice}</p>`
    : '';

  // Fund grid
  _renderFundGrid(data.funds || []);

  // Wire controls
  $('#results-search')?.addEventListener('input', debounce(e => {
    const q = e.target.value.toLowerCase();
    $$('.fund-card', $('#fund-grid')).forEach(card => {
      const name = (card.dataset.name || '').toLowerCase();
      card.style.display = name.includes(q) ? '' : 'none';
    });
  }, 200));

  $('#optimize-toggle')?.addEventListener('change', async (e) => {
    if (!e.target.checked) {
      hide($('#opt-alloc'));
      return;
    }
    const optEl = $('#opt-alloc');
    optEl.innerHTML = '<div class="skeleton-inline">Generating optimised allocation…</div>';
    show(optEl);
    try {
      const bodyOpt = { ...body, optimize: true };
      const d = await Api.recommend(bodyOpt);
      _renderOptAlloc(d.optimized_allocation, optEl);
    } catch { optEl.innerHTML = errorState('Optimisation failed', 'Please try again.'); }
  });

  $('#compare-mode-btn')?.addEventListener('click', () => {
    _compareMode = !_compareMode;
    _compareSet.clear();
    $('#compare-mode-btn').classList.toggle('active', _compareMode);
    $$('.fund-card').forEach(c => c.classList.toggle('compare-selectable', _compareMode));
    hide($('#compare-fab'));
    _updateCompareFab();
  });

  $('#compare-fab')?.addEventListener('click', () => {
    if (_compareSet.size >= 2) {
      openCompare([..._compareSet]);
    }
  });

  $('#results-pdf-btn')?.addEventListener('click', () => exportResultsPDF(data, body));

  $('#restart-btn')?.addEventListener('click', () => {
    Session.clear();
    _compareMode = false;
    _compareSet.clear();
    switchView('hero');
  });

  // Scroll reveal for advice
  if (!reduced) {
    ScrollTrigger.create({
      trigger: adviceEl,
      start: 'top 85%',
      onEnter: () => enterElements(adviceEl),
    });
  }
}

function _renderStatStrip(data, body) {
  const strip = $('#stat-strip');
  const stats = [
    { label: 'Required return',  val: data.required_annual_return_pct,   suffix: '%',  dec: 2 },
    { label: 'Funds matched',    val: (data.funds || []).length,          suffix: '',   dec: 0 },
    { label: 'Total invested',   val: data.total_invested / 100,          suffix: 'L', dec: 1, prefix: '₹' },
    { label: 'Model confidence', val: 100 * ((_meta && _meta.classifier_accuracy) || 0), suffix: '%', dec: 1 },
  ];

  strip.innerHTML = stats.map(s => `
    <div class="stat-card">
      <span class="stat-value" data-target="${s.val}"
        data-suffix="${s.suffix}" data-dec="${s.dec}"
        ${s.prefix ? `data-prefix="${s.prefix}"` : ''}>0</span>
      <span class="stat-label">${s.label}</span>
    </div>
  `).join('');

  // Animate counts
  $$('[data-target]', strip).forEach(el => {
    countUp(el, parseFloat(el.dataset.target) || 0, {
      suffix: el.dataset.suffix || '',
      prefix: el.dataset.prefix || '',
      decimals: parseInt(el.dataset.dec || '0'),
    });
  });
}

function _renderFundGrid(funds) {
  const grid = $('#fund-grid');
  if (!funds.length) {
    grid.innerHTML = noResults();
    return;
  }

  grid.innerHTML = '';
  funds.forEach(fund => {
    const ret3y = fund['3yr Return (%)'];
    const vol   = fund['SD (Volatility %)'];
    const risk  = fund['Risk Category'] || fund['Predicted Risk Category'];

    const card = el('div', {
      class: 'fund-card',
      'data-code': fund['Scheme Code'],
      'data-name': fund['Fund Name'] || '',
    });

    card.innerHTML = `
      <div class="card-header">
        <div>
          <h3 class="card-name">${fund['Fund Name'] || '—'}</h3>
          <span class="card-type">${fund['Fund Type'] || ''}</span>
        </div>
        ${riskChip(risk)}
      </div>
      <div class="card-metrics">
        <div class="card-metric">
          <span class="metric-label">3yr return</span>
          <span class="metric-value ${ret3y >= 0 ? 'pos' : 'neg'}">${fmt.pct(ret3y)}</span>
        </div>
        <div class="card-metric">
          <span class="metric-label">Volatility</span>
          <span class="metric-value">${fmt.pctPlain(vol)}</span>
        </div>
        <div class="card-metric">
          <span class="metric-label">Age</span>
          <span class="metric-value">${fmt.num(fund['Fund Age (yrs)'])} yr</span>
        </div>
      </div>
      <div class="card-sparkline" id="spark-${fund['Scheme Code']}"></div>
      <div class="compare-check hidden">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="2,8 6,12 14,4"/>
        </svg>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (_compareMode) {
        _toggleCompareSelect(fund['Scheme Code'], card);
      } else {
        openDetail(fund, card);
      }
    });

    grid.appendChild(card);
  });

  staggerCards($$('.fund-card', grid));
}

function _toggleCompareSelect(code, card) {
  if (_compareSet.has(code)) {
    _compareSet.delete(code);
    card.classList.remove('compare-selected');
    $('.compare-check', card)?.classList.add('hidden');
  } else if (_compareSet.size < 6) {
    _compareSet.add(code);
    card.classList.add('compare-selected');
    $('.compare-check', card)?.classList.remove('hidden');
  }
  _updateCompareFab();
}

function _updateCompareFab() {
  const fab = $('#compare-fab');
  const cnt = $('#compare-count');
  if (!fab) return;
  if (_compareMode && _compareSet.size >= 2) {
    show(fab);
    if (cnt) cnt.textContent = _compareSet.size;
    gsap.fromTo(fab, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.35 });
  } else {
    hide(fab);
  }
}

function _renderOptAlloc(alloc, container) {
  if (!alloc) {
    container.innerHTML = errorState('Not available', 'Optimised allocation could not be computed for this combination.');
    return;
  }
  const funds = alloc.funds || [];
  // Stacked bar
  const segments = funds.map((f, i) => {
    const hue = 160 + i * 40;
    return `<div class="alloc-segment" style="width:${f['Suggested Weight %']}%;background:hsl(${hue},35%,45%)"
      title="${f['Fund Name']}: ${f['Suggested Weight %']}%"></div>`;
  }).join('');

  container.innerHTML = `
    <h3 class="opt-title">Optimised Allocation</h3>
    <div class="alloc-bar">${segments}</div>
    <div class="alloc-legend">
      ${funds.map((f, i) => {
        const hue = 160 + i * 40;
        return `<div class="alloc-legend-item">
          <span class="alloc-dot" style="background:hsl(${hue},35%,45%)"></span>
          <span>${f['Fund Name']} &mdash; <strong>${f['Suggested Weight %']}%</strong></span>
        </div>`;
      }).join('')}
    </div>
    <div class="alloc-stats">
      <div class="alloc-stat">
        <span class="alloc-stat-label">Blended expected return</span>
        <span class="alloc-stat-val">${fmt.pct(alloc.blended_expected_return_pct, 2)}</span>
      </div>
      <div class="alloc-stat">
        <span class="alloc-stat-label">Blended risk score</span>
        <span class="alloc-stat-val">${fmt.num(alloc.blended_risk_score, 1)} / 100</span>
      </div>
    </div>
  `;
}

// PDF export for results
async function exportResultsPDF(data, body) {
  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) return alert('PDF library not loaded.');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('MutualFund AI — Recommendation Summary', 15, y);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Monthly SIP: ₹${Number(body.monthly_sip).toLocaleString('en-IN')}`, 15, y); y += 6;
  doc.text(`Target: ₹${Number(body.target_amount).toLocaleString('en-IN')}  |  Horizon: ${body.years} yrs  |  Risk: ${body.risk_tolerance}`, 15, y); y += 6;
  doc.text(`Required annual return: ${data.required_annual_return_pct?.toFixed(2) ?? '—'}%`, 15, y); y += 8;

  doc.text(data.advice || '', 15, y, { maxWidth: 180 }); y += 14;
  doc.setFont('helvetica', 'bold');
  doc.text('Recommended Funds', 15, y); y += 6;
  doc.setFont('helvetica', 'normal');

  (data.funds || []).slice(0, 12).forEach((f, i) => {
    doc.text(`${i + 1}. ${f['Fund Name'] || '—'}  |  ${f['Risk Category'] || ''}  |  3yr: ${fmt.pctPlain(f['3yr Return (%)'])}`, 15, y, { maxWidth: 180 });
    y += 6;
    if (y > 270) { doc.addPage(); y = 20; }
  });

  doc.save('mf-recommendations.pdf');
}
