"""
Mutual Fund Risk Dashboard — Flask JSON API
============================================
Acts as the backend for the premium web frontend.
Serves API routes at /api/* and the static frontend at /.

Run: python flask_api.py
Then open: http://localhost:5000
"""

import os
import re
import json
import joblib
import requests
import numpy as np
import pandas as pd
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from scipy.optimize import brentq
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from mftool import Mftool
    _mftool = Mftool()
except Exception:
    _mftool = None

# ──────────────────────────────────────────────────────────────────────────────
# App setup
# ──────────────────────────────────────────────────────────────────────────────
app = Flask(__name__, static_folder='frontend', static_url_path='')
CORS(app)

DATASET_PATH   = os.environ.get('MF_DATASET_PATH',   'mutual_fund_dataset_cleaned.csv')
CLASSIFIER_PATH = os.environ.get('MF_CLASSIFIER_PATH', 'risk_classifier_xgb.joblib')
REGRESSOR_PATH  = os.environ.get('MF_REGRESSOR_PATH',  'risk_regressor_xgb.joblib')
ARTIFACTS_PATH  = os.environ.get('MF_ARTIFACTS_PATH',  'risk_model_artifacts.joblib')

CAPTNEMO_KUVERA = 'https://mf.captnemo.in/kuvera/{isin}'
CAPTNEMO_NAV    = 'https://mf.captnemo.in/nav/{isin}'
ISIN_PATTERN    = re.compile(r'^INF[0-9A-Z]{9}$')

# ──────────────────────────────────────────────────────────────────────────────
# Load data + models at startup
# ──────────────────────────────────────────────────────────────────────────────
def _load():
    df = pd.read_csv(DATASET_PATH) if os.path.exists(DATASET_PATH) else None
    
    isin_map = {}
    if os.path.exists('scheme_to_isin.csv'):
        idf = pd.read_csv('scheme_to_isin.csv')
        idf = idf[idf['ISIN'].notna()]
        isin_map = dict(zip(idf['Scheme Code'], idf['ISIN']))

    models = None
    for p in [CLASSIFIER_PATH, REGRESSOR_PATH, ARTIFACTS_PATH]:
        if not os.path.exists(p):
            break
    else:
        clf  = joblib.load(CLASSIFIER_PATH)
        reg  = joblib.load(REGRESSOR_PATH)
        arts = joblib.load(ARTIFACTS_PATH)
        models = {'clf': clf, 'reg': reg, **arts}
    return df, models, isin_map

df, models, isin_map = _load()

ACTIVE_CATEGORIES = (
    models['active_categories']
    if models and 'active_categories' in models
    else (sorted(df['Risk Category'].dropna().unique().tolist()) if df is not None else [])
)
FUND_TYPES = sorted(df['Fund Type'].dropna().unique().tolist()) if df is not None else []

# ──────────────────────────────────────────────────────────────────────────────
# Helpers
# ──────────────────────────────────────────────────────────────────────────────
def _safe(v):
    """Convert numpy scalars / NaN to JSON-safe Python types."""
    if v is None:
        return None
    if isinstance(v, float) and np.isnan(v):
        return None
    if isinstance(v, (np.integer,)):
        return int(v)
    if isinstance(v, (np.floating,)):
        return float(v)
    if isinstance(v, (np.bool_,)):
        return bool(v)
    return v


def _row_to_dict(row):
    return {k: _safe(v) for k, v in row.items()}


def _resolve_isin(scheme_code):
    try:
        return isin_map.get(int(scheme_code))
    except (ValueError, TypeError):
        return None


def _fetch_live(isin):
    if not isin:
        return None
    try:
        r = requests.get(CAPTNEMO_KUVERA.format(isin=isin), timeout=8)
        if r.status_code != 200:
            return None
        data = r.json()
        if isinstance(data, list):
            data = data[0] if data else None
        return data
    except Exception:
        return None


def _fetch_nav_history(isin):
    if not isin:
        return []
    try:
        r = requests.get(CAPTNEMO_NAV.format(isin=isin), timeout=8)
        if r.status_code != 200:
            return []
        data = r.json()
        hist = data.get('historical_nav', [])
        result = []
        for entry in hist:
            if isinstance(entry, (list, tuple)) and len(entry) >= 2:
                result.append({'date': str(entry[0]), 'nav': _safe(entry[1])})
            elif isinstance(entry, dict):
                result.append({'date': str(entry.get('date', '')), 'nav': _safe(entry.get('nav'))})
        return result
    except Exception:
        return []


def _calculate_required_return(monthly_sip, target_amount, years):
    n = int(round(years * 12))
    if n <= 0 or monthly_sip <= 0:
        return None

    def fv(r):
        i = r / 12
        if abs(i) < 1e-9:
            return monthly_sip * n
        return monthly_sip * (((1 + i) ** n - 1) / i) * (1 + i)

    lo, hi = -0.5, 3.0
    if fv(lo) > target_amount:
        return lo
    if fv(hi) < target_amount:
        return None
    return brentq(lambda r: fv(r) - target_amount, lo, hi, xtol=1e-8)


def _encode_rows(rows_df):
    enc = pd.get_dummies(rows_df, columns=['Fund Type'], prefix='Type')
    for col in models['type_dummy_cols']:
        if col not in enc.columns:
            enc[col] = 0
    if models.get('has_fund_house') and 'Fund House Freq' in models['feature_columns']:
        default_freq = (np.mean(list(models['house_freq_map'].values()))
                        if models['house_freq_map'] else 0)
        enc['Fund House Freq'] = (
            rows_df.get('Fund House', pd.Series(index=rows_df.index))
            .map(models['house_freq_map']).fillna(default_freq)
        )
    return enc[models['feature_columns']]


def _predict_fund_row(row_df):
    """Add model predictions to a copy of a single/multiple fund rows."""
    X = _encode_rows(row_df)
    labels = models['clf'].predict(X)
    proba  = models['clf'].predict_proba(X)
    scores = models['reg'].predict(X)
    classes = models['clf'].classes_

    row_df = row_df.copy()
    row_df['Predicted Risk Category'] = [models['label_to_cat'][int(l)] for l in labels]
    # Generalise and clamp out-of-bounds ML predictions to [0, 100] cleanly
    row_df['Predicted Risk Score']    = np.clip(scores, 0, 100).tolist()
    row_df['Category Confidence']     = proba.max(axis=1).tolist()
    row_df['Model Agrees']            = (
        row_df['Predicted Risk Category'] == row_df['Risk Category']
    ).tolist()

    # Risk-adjusted efficiency: 3yr return / volatility (higher = better)
    if '3yr Return (%)' in row_df.columns and 'SD (Volatility %)' in row_df.columns:
        row_df['Risk-Adjusted Efficiency'] = (
            row_df['3yr Return (%)'] / row_df['SD (Volatility %)'].replace(0, np.nan)
        )
    return row_df, proba, classes


# ──────────────────────────────────────────────────────────────────────────────
# Serve frontend
# ──────────────────────────────────────────────────────────────────────────────
@app.route('/')
def index():
    return send_from_directory('frontend', 'index.html')


# ──────────────────────────────────────────────────────────────────────────────
# API routes
# ──────────────────────────────────────────────────────────────────────────────
@app.route('/api/health')
def health():
    return jsonify({
        'status': 'ok',
        'dataset_loaded': df is not None,
        'models_loaded': models is not None,
    })


@app.route('/api/meta')
def meta():
    if df is None:
        return jsonify({'error': 'Dataset not loaded'}), 503
    metrics = models.get('metrics', {}) if models else {}
    return jsonify({
        'total_funds': int(len(df)),
        'fund_types': FUND_TYPES,
        'risk_categories': ACTIVE_CATEGORIES,
        'classifier_accuracy': _safe(metrics.get('classifier_overall_accuracy')),
        'regressor_r2': _safe(metrics.get('regressor_overall_r2')),
        'classifier_cv_mean': _safe(metrics.get('classifier_cv_mean_accuracy')),
        'cv_folds': _safe(metrics.get('n_splits_used')),
    })


@app.route('/api/funds')
def funds():
    if df is None:
        return jsonify({'error': 'Dataset not loaded'}), 503

    fund_type     = request.args.get('fund_type', '')
    risk_category = request.args.get('risk_category', '')
    search        = request.args.get('search', '').strip().lower()
    limit         = request.args.get('limit', 100, type=int)

    result = df.copy()
    if fund_type:
        result = result[result['Fund Type'] == fund_type]
    if risk_category:
        result = result[result['Risk Category'] == risk_category]
    if search:
        result = result[result['Fund Name'].str.lower().str.contains(search, na=False)]

    result = result.head(limit)
    return jsonify({
        'count': int(len(result)),
        'funds': [_row_to_dict(r) for _, r in result.iterrows()],
    })


@app.route('/api/fund/<int:scheme_code>')
def fund_detail(scheme_code):
    if df is None:
        return jsonify({'error': 'Dataset not loaded'}), 503

    row = df[df['Scheme Code'] == scheme_code]
    if row.empty:
        return jsonify({'error': 'Fund not found'}), 404

    live_flag = request.args.get('live', 'false').lower() == 'true'
    fund_dict = _row_to_dict(row.iloc[0])

    if models:
        try:
            enriched, proba, classes = _predict_fund_row(row.copy())
            r = enriched.iloc[0]
            fund_dict['Predicted Risk Category'] = _safe(r.get('Predicted Risk Category'))
            fund_dict['Predicted Risk Score']    = _safe(r.get('Predicted Risk Score'))
            fund_dict['Category Confidence']     = _safe(r.get('Category Confidence'))
            fund_dict['Risk-Adjusted Efficiency'] = _safe(r.get('Risk-Adjusted Efficiency'))
            fund_dict['Model Agrees']            = bool(r.get('Model Agrees', False))
            fund_dict['probabilities'] = {
                str(models['label_to_cat'][int(classes[i])]): float(proba[0][i])
                for i in range(len(classes))
            }
        except Exception:
            pass

    if live_flag:
        isin = _resolve_isin(scheme_code)
        fund_dict['isin'] = isin
        live = _fetch_live(isin) if isin else None
        fund_dict['expense_ratio'] = _safe(live.get('expense_ratio')) if live else None
        fund_dict['sip_min']       = _safe(live.get('sip_min'))       if live else None
        fund_dict['lump_min']      = _safe(live.get('lump_min'))      if live else None
        fund_dict['nav_history']   = _fetch_nav_history(isin)

    return jsonify(fund_dict)


@app.route('/api/recommend', methods=['POST'])
def recommend():
    if df is None or models is None:
        return jsonify({'error': 'Dataset or models not loaded'}), 503

    body = request.get_json(force=True, silent=True) or {}
    monthly_sip    = float(body.get('monthly_sip', 10000))
    target_amount  = float(body.get('target_amount', 2500000))
    years          = float(body.get('years', 10))
    risk_tolerance = body.get('risk_tolerance', ACTIVE_CATEGORIES[0])
    fund_type      = body.get('fund_type', None)
    top_n          = int(body.get('top_n', 10))
    optimize       = bool(body.get('optimize', False))

    required_rate = _calculate_required_return(monthly_sip, target_amount, years)
    total_invested = monthly_sip * years * 12

    subset = df[df['Risk Category'] == risk_tolerance].copy()
    if fund_type and fund_type not in ('Any', ''):
        subset = subset[subset['Fund Type'] == fund_type]

    REALISTIC_MAX_RATE = 0.30
    achievable = required_rate is not None and required_rate <= REALISTIC_MAX_RATE

    if subset.empty:
        return jsonify({
            'required_annual_return_pct': None,
            'achievable': achievable,
            'total_invested': total_invested,
            'target_amount': target_amount,
            'funds': [],
            'advice': 'No funds found matching that risk and type combination. Try broadening your filters.',
            'optimized_allocation': None,
        })

    # Model predictions
    enriched, _, _ = _predict_fund_row(subset)

    # Pick return column for ranking
    if years <= 2 and '1yr Return (%)' in enriched.columns:
        ret_col = '1yr Return (%)'
    elif years <= 4 and '3yr Return (%)' in enriched.columns:
        ret_col = '3yr Return (%)'
    else:
        ret_col = '5yr Return (%)' if '5yr Return (%)' in enriched.columns else '3yr Return (%)'

    # Advice text
    rate_str = f"{required_rate*100:.2f}%" if required_rate else "unknown"
    if not achievable:
        top = pd.DataFrame()
        funds_out = []
        advice = (
            f"Your target of ₹{target_amount:,.0f} in {int(years)} years with a "
            f"₹{monthly_sip:,.0f}/month SIP requires a growth rate ({rate_str}) beyond realistic market "
            f"expectations (capped at 30%). Consider increasing your SIP amount, extending your horizon, "
            f"or adjusting your target."
        )
    else:
        enriched['Meets Required Return'] = enriched[ret_col] >= (required_rate * 100)
        top = enriched.sort_values(ret_col, ascending=False).head(top_n)
        funds_out = [_row_to_dict(r) for _, r in top.iterrows()]

        advice = (
            f"To reach ₹{target_amount:,.0f} in {int(years)} years, your portfolio needs "
            f"to grow at roughly {rate_str} per annum — a target well within historical "
            f"ranges for {risk_tolerance}-risk funds. We've surfaced the top {len(funds_out)} "
            f"funds from your selected category, ranked by {ret_col.replace(' (%)', '')} return. "
            f"Your total invested capital over this period: ₹{total_invested:,.0f}."
        )

    # Optional optimized allocation
    opt_alloc = None
    if optimize and len(top) >= 2:
        try:
            # Equal-weight baseline, biased toward higher return
            weights = top[ret_col].fillna(0).values
            weights = weights / weights.sum() if weights.sum() > 0 else np.ones(len(top)) / len(top)
            blended_return = float((weights * top[ret_col].fillna(0).values).sum())
            blended_risk   = float((weights * top['Predicted Risk Score'].fillna(50).values).sum())

            alloc_funds = []
            for i, (_, r) in enumerate(top.iterrows()):
                alloc_funds.append({
                    'Fund Name': r.get('Fund Name'),
                    'Fund Type': r.get('Fund Type'),
                    'Suggested Weight %': round(float(weights[i]) * 100, 1),
                    ret_col: _safe(r.get(ret_col)),
                    'Predicted Risk Score': _safe(r.get('Predicted Risk Score')),
                })
            opt_alloc = {
                'funds': alloc_funds,
                'blended_expected_return_pct': round(blended_return, 2),
                'blended_risk_score': round(blended_risk, 1),
            }
        except Exception:
            opt_alloc = None

    return jsonify({
        'required_annual_return_pct': _safe(required_rate * 100) if required_rate is not None else None,
        'achievable': achievable,
        'total_invested': total_invested,
        'target_amount': target_amount,
        'funds': funds_out,
        'advice': advice,
        'optimized_allocation': opt_alloc,
    })


@app.route('/api/compare', methods=['POST'])
def compare():
    if df is None:
        return jsonify({'error': 'Dataset not loaded'}), 503

    body        = request.get_json(force=True, silent=True) or {}
    codes       = body.get('scheme_codes', [])
    live_flag   = bool(body.get('live', False))

    subset = df[df['Scheme Code'].isin(codes)].copy()
    if subset.empty:
        return jsonify({'funds': []})

    if models:
        try:
            subset, _, _ = _predict_fund_row(subset)
        except Exception:
            pass

    funds_out = [_row_to_dict(r) for _, r in subset.iterrows()]

    def enrich(fd):
        isin = _resolve_isin(int(fd['Scheme Code']))
        fd['isin'] = isin
        live = _fetch_live(isin) if isin else None
        fd['expense_ratio'] = _safe(live.get('expense_ratio')) if live else None
        fd['sip_min']       = _safe(live.get('sip_min'))       if live else None
        fd['lump_min']      = _safe(live.get('lump_min'))      if live else None
        fd['nav_history']   = _fetch_nav_history(isin)
        return fd

    if live_flag and funds_out:
        with ThreadPoolExecutor(max_workers=10) as executor:
            funds_out = list(executor.map(enrich, funds_out))

    return jsonify({'funds': funds_out})


@app.route('/api/portfolio/analyze', methods=['POST'])
def portfolio_analyze():
    if df is None:
        return jsonify({'error': 'Dataset not loaded'}), 503

    body      = request.get_json(force=True, silent=True) or {}
    holdings  = body.get('holdings', [])  # [{scheme_code, allocation_pct}]
    live_flag = bool(body.get('live', False))

    if not holdings:
        return jsonify({'error': 'No holdings provided'}), 400

    codes   = [h['scheme_code'] for h in holdings]
    allocs  = {h['scheme_code']: float(h['allocation_pct']) for h in holdings}
    subset  = df[df['Scheme Code'].isin(codes)].copy()

    total_w = sum(allocs.values())
    subset['__weight'] = subset['Scheme Code'].map(allocs) / (total_w if total_w else 1)

    if models:
        try:
            subset, _, _ = _predict_fund_row(subset)
        except Exception:
            pass

    def w_avg(col):
        if col not in subset.columns:
            return None
        vals = pd.to_numeric(subset[col], errors='coerce')
        wts  = subset['__weight']
        mask = vals.notna()
        if mask.sum() == 0:
            return None
        return float((vals[mask] * wts[mask]).sum() / wts[mask].sum())

    alloc_by_type = (
        subset.groupby('Fund Type')['__weight'].sum()
        .apply(float).to_dict()
    )
    alloc_by_risk = (
        subset.groupby('Risk Category')['__weight'].sum()
        .apply(float).to_dict()
    )

    holdings_out = []
    for _, r in subset.iterrows():
        fd = _row_to_dict(r)
        fd['allocation_pct'] = allocs.get(int(r['Scheme Code']), 0)
        holdings_out.append(fd)

    def ptf_enrich(fd):
        isin = _resolve_isin(int(fd['Scheme Code']))
        fd['isin'] = isin
        live = _fetch_live(isin) if isin else None
        fd['expense_ratio'] = _safe(live.get('expense_ratio')) if live else None
        return fd

    if live_flag and holdings_out:
        with ThreadPoolExecutor(max_workers=10) as executor:
            holdings_out = list(executor.map(ptf_enrich, holdings_out))
            
        for fd in holdings_out:
            idx = subset.index[subset['Scheme Code'] == fd['Scheme Code']].tolist()[0]
            subset.at[idx, 'expense_ratio'] = fd['expense_ratio']

    out = {
        'weighted_3yr_return_pct': w_avg('3yr Return (%)'),
        'weighted_volatility_pct': w_avg('SD (Volatility %)'),
        'weighted_risk_score': w_avg('Predicted Risk Score') or w_avg('Risk Score'),
        'allocation_by_fund_type': alloc_by_type,
        'allocation_by_risk_category': alloc_by_risk,
        'holdings': holdings_out,
    }

    if models:
        try:
            # Create a synthetic meta-fund representing the portfolio
            meta_fund = pd.DataFrame([{
                'Fund Type': max(alloc_by_type, key=alloc_by_type.get) if alloc_by_type else 'Flexi Cap',
                'SD (Volatility %)': out['weighted_volatility_pct'] or 15,
                'Fund Age (yrs)': w_avg('Fund Age (yrs)') or 5,
                '1yr Return (%)': w_avg('1yr Return (%)') or 10,
                '3yr Return (%)': out['weighted_3yr_return_pct'] or 10,
                '5yr Return (%)': w_avg('5yr Return (%)') or 10,
                'Risk Category': 'Moderate',  # placeholder
                'Fund House': '',
            }])
            X = _encode_rows(meta_fund)
            label = models['clf'].predict(X)[0]
            out['portfolio_risk_category'] = models['label_to_cat'][int(label)]
        except Exception:
            out['portfolio_risk_category'] = 'Unknown'

    if live_flag:
        out['weighted_expense_ratio_pct'] = w_avg('expense_ratio')

    return jsonify(out)


@app.route('/api/whatif', methods=['POST'])
def whatif():
    if models is None:
        return jsonify({'error': 'Models not loaded'}), 503

    body = request.get_json(force=True, silent=True) or {}
    fund_type  = body.get('fund_type', FUND_TYPES[0] if FUND_TYPES else 'Large Cap')
    volatility = float(body.get('volatility', 10))
    fund_age   = float(body.get('fund_age', 5))
    ret_1y     = float(body.get('ret_1y', 10))
    ret_3y     = float(body.get('ret_3y', 12))
    ret_5y     = float(body.get('ret_5y', 14))
    fund_house = body.get('fund_house', None)

    row = pd.DataFrame([{
        'Fund Type': fund_type,
        'SD (Volatility %)': volatility,
        'Fund Age (yrs)': fund_age,
        '1yr Return (%)': ret_1y,
        '3yr Return (%)': ret_3y,
        '5yr Return (%)': ret_5y,
        'Risk Category': 'Moderate',  # placeholder for encoding
        'Fund House': fund_house or '',
    }])

    try:
        X = _encode_rows(row)
        label   = models['clf'].predict(X)[0]
        score   = float(models['reg'].predict(X)[0])
        # Generalise bounding to avoid out of bounds ML noise
        score   = max(0.0, min(100.0, score))
        proba   = models['clf'].predict_proba(X)[0]
        classes = models['clf'].classes_
        cat     = models['label_to_cat'][int(label)]

        probs_dict = {
            str(models['label_to_cat'][int(classes[i])]): float(proba[i])
            for i in range(len(classes))
        }

        return jsonify({
            'predicted_risk_category': cat,
            'predicted_risk_score': round(score, 2),
            'probabilities': probs_dict,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/model_insights')
def model_insights():
    if models is None or df is None:
        return jsonify({'error': 'Models/data not loaded'}), 503
    try:
        features = models.get('feature_columns', [])
        importances = models['clf'].feature_importances_.tolist() if hasattr(models['clf'], 'feature_importances_') else []
        
        # Calculate full confusion matrix by running clf on the training dataset
        valid_df = df.dropna(subset=['Risk Category'])
        X_all = _encode_rows(valid_df)
        y_true = valid_df['Risk Category'].map({v:k for k,v in models['label_to_cat'].items()}).values
        y_pred = models['clf'].predict(X_all)
        
        from sklearn.metrics import confusion_matrix
        cm = confusion_matrix(y_true, y_pred, labels=models['clf'].classes_).tolist()
        
        return jsonify({
            'features': features,
            'importances': importances,
            'confusion_matrix': cm,
            'classes': [models['label_to_cat'][c] for c in models['clf'].classes_]
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ──────────────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    app.run(debug=True, port=5000)
