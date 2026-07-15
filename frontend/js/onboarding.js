// onboarding.js — conversational survey flow

let _onbMeta    = {};
let _onbAnswers = {};
let _onbIndex   = 0;

const QUESTIONS = [
  {
    id: 'monthly_sip',
    type: 'slider',
    text: 'How much can you invest each month?',
    sub: 'This becomes your monthly SIP amount.',
    min: 500, max: 100000, step: 500, default: 10000,
    format: (v) => '₹' + Number(v).toLocaleString('en-IN'),
  },
  {
    id: 'target_amount',
    type: 'slider',
    text: 'What corpus are you aiming to build?',
    sub: 'Your wealth goal over the investment horizon.',
    min: 50000, max: 10000000, step: 50000, default: 2500000,
    format: (v) => '₹' + Number(v).toLocaleString('en-IN'),
  },
  {
    id: 'years',
    type: 'slider',
    text: 'How many years do you have?',
    sub: 'Longer horizons open up higher-return options.',
    min: 1, max: 40, step: 1, default: 10,
    format: (v) => v + (parseInt(v) === 1 ? ' year' : ' years'),
  },
  {
    id: 'risk_tolerance',
    type: 'choice',
    text: 'If your portfolio dropped 15% in a month, you would…',
    sub: 'Be honest — this shapes the entire recommendation.',
    choices: [],
    choiceLabels: {
      'Low':       'Sell immediately. Protecting capital comes first.',
      'Moderate':  'Feel anxious but hold and wait it out.',
      'High':      "Hold steady. I've seen volatility before.",
      'Very High': 'Buy more. I see a drawdown as a buying opportunity.',
    },
  },
  {
    id: 'fund_type',
    type: 'choice',
    text: 'Any preference for a fund category?',
    sub: 'Select "No preference" to let the model decide.',
    choices: [],
    choiceLabels: {},
  },
];

function initOnboarding(meta) {
  _onbMeta    = meta || {};
  _onbAnswers = Session.get('onboarding') || {};
  _onbIndex   = 0;

  // Fill dynamic choices from meta
  QUESTIONS[3].choices = (_onbMeta.risk_categories || ['Low', 'Moderate', 'High', 'Very High']);
  QUESTIONS[4].choices = ['Any', ...(_onbMeta.fund_types || [])];

  _updateProgress();
  _renderQuestion();
}

function _updateProgress() {
  const bar = $('#onboarding-progress-bar');
  if (!bar) return;
  const pct = (_onbIndex / QUESTIONS.length) * 100;
  if (window.gsap) {
    gsap.to(bar, { width: pct + '%', duration: 0.4, ease: 'power2.out' });
  } else {
    bar.style.width = pct + '%';
  }
}

function _renderQuestion() {
  const wrap = $('#onboarding-question');
  if (!wrap) return;

  const q   = QUESTIONS[_onbIndex];
  const val = _onbAnswers[q.id] ?? q.default ?? q.choices?.[0];

  let html = `
    <p class="q-number">${_onbIndex + 1} / ${QUESTIONS.length}</p>
    <h2 class="q-text">${q.text}</h2>
    <p class="q-sub">${q.sub}</p>
  `;

  if (q.type === 'slider') {
    html += `
      <div class="q-slider-wrap">
        <div class="custom-slider-container">
          <input type="range" class="custom-slider" id="q-slider"
            min="${q.min}" max="${q.max}" step="${q.step}" value="${val}">
          <div class="slider-track-fill" id="q-slider-fill"></div>
        </div>
        <output class="slider-output" id="q-slider-output">${q.format(val)}</output>
      </div>
    `;
  } else {
    html += `<div class="q-choices">`;
    for (const c of q.choices) {
      const label    = q.choiceLabels?.[c] || c;
      const isSelect = (val === c) ? 'selected' : '';
      html += `
        <button class="q-choice-btn ${isSelect}" data-value="${c}">
          <span class="choice-value">${c}</span>
          ${label !== c ? `<span class="choice-label">${label}</span>` : ''}
        </button>`;
    }
    html += `</div>`;
  }

  html += `
    <div class="q-nav">
      ${_onbIndex > 0
        ? '<button class="btn-ghost" id="q-back">Back</button>'
        : '<span></span>'}
      <button class="btn-primary" id="q-next">
        ${_onbIndex < QUESTIONS.length - 1 ? 'Continue' : 'See my recommendations'}
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" width="16" height="16">
          <line x1="3" y1="8" x2="13" y2="8"/>
          <polyline points="8,3 13,8 8,13"/>
        </svg>
      </button>
    </div>
  `;

  wrap.innerHTML = html;

  // ── Slider wiring ──
  if (q.type === 'slider') {
    const slider = $('#q-slider', wrap);
    const output = $('#q-slider-output', wrap);
    const fill   = $('#q-slider-fill', wrap);

    const update = () => {
      const pct = ((slider.value - q.min) / (q.max - q.min)) * 100;
      fill.style.width = pct + '%';
      output.textContent = q.format(slider.value);
    };
    slider.addEventListener('input', update);
    update();
  }

  // ── Choice wiring ──
  $$('.q-choice-btn', wrap).forEach(btn => {
    btn.addEventListener('click', () => {
      $$('.q-choice-btn', wrap).forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
  });

  // ── Nav buttons ──
  $('#q-next', wrap)?.addEventListener('click', () => _advance());
  $('#q-back', wrap)?.addEventListener('click', () => _goBack());
}

function _readAnswer() {
  const q = QUESTIONS[_onbIndex];
  if (q.type === 'slider') {
    return Number($('#q-slider')?.value ?? q.default);
  }
  const sel = $('.q-choice-btn.selected');
  return sel ? sel.dataset.value : (q.choices?.[0] ?? null);
}

function _advance() {
  const val = _readAnswer();
  _onbAnswers[QUESTIONS[_onbIndex].id] = val;
  Session.set('onboarding', _onbAnswers);

  if (_onbIndex < QUESTIONS.length - 1) {
    _onbIndex++;
    _updateProgress();
    const wrap = $('#onboarding-question');
    // Slide out the old content, render new, slide in
    slideOutLeft(wrap, () => {
      _renderQuestion();
      slideInRight(wrap);
    });
  } else {
    _submit();
  }
}

function _goBack() {
  if (_onbIndex <= 0) return;
  _onbIndex--;
  _updateProgress();
  const wrap = $('#onboarding-question');
  slideOutLeft(wrap, () => {
    _renderQuestion();
    slideInRight(wrap);
  });
}

async function _submit() {
  // Fill in any defaults
  for (const q of QUESTIONS) {
    if (_onbAnswers[q.id] == null) {
      _onbAnswers[q.id] = q.default ?? q.choices?.[0] ?? null;
    }
  }

  const body = {
    monthly_sip:    Number(_onbAnswers.monthly_sip  || 10000),
    target_amount:  Number(_onbAnswers.target_amount || 2500000),
    years:          Number(_onbAnswers.years         || 10),
    risk_tolerance: _onbAnswers.risk_tolerance || _onbMeta.risk_categories?.[0] || 'Moderate',
    fund_type:      (_onbAnswers.fund_type === 'Any' || !_onbAnswers.fund_type) ? undefined : _onbAnswers.fund_type,
    top_n:          12,
  };

  // Switch to results view with skeleton
  switchView('results');
  const resultsEl = $('#view-results');
  if (resultsEl) {
    resultsEl.innerHTML = `
      <div class="results-inner">
        <div class="fund-grid" id="fund-grid" style="grid-column:1/-1"></div>
      </div>`;
    skeletonCards($('#fund-grid'), 6);
  }

  try {
    const data = await Api.recommend(body);
    Session.set('recommend_result', data);
    Session.set('recommend_body', body);
    renderResults(data, body);
  } catch (err) {
    if (resultsEl) resultsEl.innerHTML = errorState('Recommendation failed', err.message);
  }
}
