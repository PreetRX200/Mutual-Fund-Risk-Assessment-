// compare.js — fund comparison panel with SVG radar chart

let _compareChart = null;
let _compareReturnsChart = null;
let _compareVolChart = null;

async function openCompare(schemeCodes) {
  const panel = $('#compare-panel');
  if (!panel) return;

  panel.innerHTML = `
    <div class="compare-inner">
      <div class="compare-header">
        <h3>Fund Comparison</h3>
        <div class="compare-header-right">
          <label class="optimize-toggle">
            <input type="checkbox" id="compare-live-toggle"> Include live expense ratio
          </label>
          <button class="detail-close" id="compare-close">
            <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="2" y1="2" x2="14" y2="14"/>
              <line x1="14" y1="2" x2="2" y2="14"/>
            </svg>
          </button>
        </div>
      </div>
      <div class="compare-loading">
        <div class="skel skel-block w100 h300"></div>
      </div>
    </div>
  `;

  slideUpPanel(panel);

  $('#compare-close')?.addEventListener('click', () => {
    slideDownPanel(panel);
  });

  $('#compare-live-toggle')?.addEventListener('change', async (e) => {
    await _loadCompare(schemeCodes, e.target.checked);
  });

  await _loadCompare(schemeCodes, false);
}

async function _loadCompare(codes, live) {
  const inner = $('.compare-inner');
  if (!inner) return;

  const loadingEl = $('.compare-loading', inner);
  if (loadingEl) {
    loadingEl.innerHTML = '<div class="skel skel-block w100 h300"></div>';
    show(loadingEl);
  }

  try {
    const data  = await Api.compare(codes, live);
    const funds = data.funds || [];

    if (!funds.length) {
      if (loadingEl) loadingEl.innerHTML = noResults('No comparison data', 'Check that the selected schemes exist.');
      return;
    }

    hide(loadingEl);

    let html = '<div class="compare-content" id="compare-content">';

    // Radar chart
    html += `
      <div class="radar-wrap">
        <canvas id="radar-chart"></canvas>
      </div>
      
      <div class="compare-charts-wrap mt24" style="display: flex; gap: 24px; flex-wrap: wrap; margin-bottom: 24px;">
        <div style="flex: 1; min-width: 300px;">
          <h4 class="detail-section-title" style="margin-bottom:12px; font-size:12px; font-weight:600;">Returns Comparison</h4>
          <canvas id="compare-returns-chart"></canvas>
        </div>
        <div style="flex: 1; min-width: 300px;">
          <h4 class="detail-section-title" style="margin-bottom:12px; font-size:12px; font-weight:600;">Volatility Comparison</h4>
          <canvas id="compare-vol-chart"></canvas>
        </div>
      </div>
    `;

    // Metrics table
    const metrics = [
      { key: '1yr Return (%)', label: '1yr Return' },
      { key: '3yr Return (%)', label: '3yr Return' },
      { key: '5yr Return (%)', label: '5yr Return' },
      { key: 'SD (Volatility %)', label: 'Volatility' },
      { key: 'Fund Age (yrs)', label: 'Age (yrs)' },
    ];
    if (live) metrics.push({ key: 'expense_ratio', label: 'Expense Ratio' });

    html += `<div class="compare-table-wrap"><table class="compare-table">`;
    html += `<thead><tr><th>Metric</th>${funds.map(f =>
      `<th>${f['Fund Name']?.split(' ').slice(0, 4).join(' ') || '—'}</th>`
    ).join('')}</tr></thead><tbody>`;

    for (const m of metrics) {
      html += `<tr><td class="compare-metric-label">${m.label}</td>`;
      for (const f of funds) {
        const v = f[m.key];
        const cls = m.key.includes('Return') ? (v >= 0 ? 'pos' : 'neg') : '';
        html += `<td class="${cls}">${v != null ? (typeof v === 'number' ? v.toFixed(2) : v) : '—'}</td>`;
      }
      html += `</tr>`;
    }
    html += `</tbody></table></div>`;
    html += `</div>`;

    // Insert after the header
    const header = $('.compare-header', inner);
    const content = inner.querySelector('#compare-content');
    if (content) content.outerHTML = html;
    else header.insertAdjacentHTML('afterend', html);

    // Draw charts
    _drawRadar(funds, live);
    _drawCompareAdditionalCharts(funds);
    enterElements('#compare-content', { y: 10 });

  } catch (err) {
    if (loadingEl) loadingEl.innerHTML = errorState('Could not load comparison', err.message);
  }
}

function _drawRadar(funds, live) {
  const canvas = $('#radar-chart');
  if (!canvas) return;
  if (_compareChart) { _compareChart.destroy(); _compareChart = null; }

  // Normalize axes 0-1 across all funds
  const axes = ['1yr Return (%)', '3yr Return (%)', 'SD (Volatility %)', 'Risk Score', 'Fund Age (yrs)'];
  const axisLabels = ['1yr Return', '3yr Return', 'Volatility', 'Risk Score', 'Fund Age'];
  if (live) { axes.push('expense_ratio'); axisLabels.push('Expense Ratio'); }

  const allVals = {};
  axes.forEach(a => {
    const vals = funds.map(f => f[a]).filter(v => v != null);
    allVals[a] = { min: Math.min(...vals), max: Math.max(...vals) };
  });

  function norm(fund, ax) {
    const v   = fund[ax];
    if (v == null) return 0;
    const { min, max } = allVals[ax];
    if (max === min) return 0.5;
    // For volatility + expense: lower is better → invert
    const inverted = ax === 'SD (Volatility %)' || ax === 'expense_ratio';
    const n = (v - min) / (max - min);
    return inverted ? 1 - n : n;
  }

  const COLORS = ['#2F5D5A', '#C9A24B', '#C2793F', '#6B9E78', '#B3543F', '#4a7a9b'];

  _compareChart = new Chart(canvas, {
    type: 'radar',
    data: {
      labels: axisLabels,
      datasets: funds.map((f, i) => ({
        label: f['Fund Name']?.split(' ').slice(0, 3).join(' ') || `Fund ${i + 1}`,
        data: axes.map(a => norm(f, a)),
        borderColor: COLORS[i % COLORS.length],
        backgroundColor: COLORS[i % COLORS.length] + '18',
        borderWidth: 2,
        pointRadius: 3,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      scales: {
        r: {
          min: 0, max: 1,
          ticks: { display: false },
          grid: { color: 'rgba(0,0,0,0.06)' },
          pointLabels: { font: { size: 11, family: 'Inter, sans-serif' }, color: '#6B6B6B' },
        }
      },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 }, color: '#1A1A1A', boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${(ctx.parsed.r * 100).toFixed(0)} normalised`,
          }
        }
      },
    }
  });
}

function _drawCompareAdditionalCharts(funds) {
  if (_compareReturnsChart) { _compareReturnsChart.destroy(); _compareReturnsChart = null; }
  if (_compareVolChart) { _compareVolChart.destroy(); _compareVolChart = null; }

  const COLORS = ['#2F5D5A', '#C9A24B', '#C2793F', '#6B9E78', '#B3543F', '#4a7a9b'];
  const fundNames = funds.map((f, i) => f['Fund Name']?.split(' ').slice(0, 3).join(' ') || `Fund ${i+1}`);

  // Returns Grouped Bar Chart
  const retCtx = $('#compare-returns-chart');
  if (retCtx) {
    _compareReturnsChart = new Chart(retCtx, {
      type: 'bar',
      data: {
        labels: ['1yr Return', '3yr Return', '5yr Return'],
        datasets: funds.map((f, i) => ({
          label: fundNames[i],
          data: [f['1yr Return (%)'] || 0, f['3yr Return (%)'] || 0, f['5yr Return (%)'] || 0],
          backgroundColor: COLORS[i % COLORS.length],
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } },
          tooltip: {
            callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}%` }
          }
        },
        scales: {
          y: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#6B6B6B', font: { size: 10 }, callback: v => v + '%' } },
          x: { grid: { display: false }, ticks: { color: '#6B6B6B', font: { size: 10 } } }
        }
      }
    });
    retCtx.parentElement.style.height = "250px";
  }

  // Volatility Bar Chart
  const volCtx = $('#compare-vol-chart');
  if (volCtx) {
    _compareVolChart = new Chart(volCtx, {
      type: 'bar',
      data: {
        labels: fundNames,
        datasets: [{
          label: 'Volatility (SD %)',
          data: funds.map(f => f['SD (Volatility %)'] || 0),
          backgroundColor: funds.map((_, i) => COLORS[i % COLORS.length]),
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: { label: ctx => `Volatility: ${ctx.parsed.y.toFixed(2)}%` }
          }
        },
        scales: {
          y: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#6B6B6B', font: { size: 10 }, callback: v => v + '%' } },
          x: { grid: { display: false }, ticks: { color: '#6B6B6B', font: { size: 10 } } }
        }
      }
    });
    volCtx.parentElement.style.height = "250px";
  }
}
