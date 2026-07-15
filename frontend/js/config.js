// config.js — single place to change if the backend moves
const API_BASE = 'http://localhost:5000';
const FONTS_LOADED = document.fonts.ready;

// Risk tier CSS variable names (must match style.css)
const RISK_COLORS = {
  'Low':       'var(--risk-low)',
  'Moderate':  'var(--risk-moderate)',
  'High':      'var(--risk-high)',
  'Very High': 'var(--risk-very-high)',
};

const RISK_COLORS_HEX = {
  'Low':       '#6B9E78',
  'Moderate':  '#C9A24B',
  'High':      '#C2793F',
  'Very High': '#B3543F',
};
