// Colors for relationships, tiers, and circles.
// Defaults: theme-aware CSS vars (relationships) and fixed palettes (tiers,
// circles). The Settings tab stores per-key hex overrides in localStorage;
// an override always wins over the default.
const LS = 'network.colors.v1';
const read = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
const write = (o) => localStorage.setItem(LS, JSON.stringify(o));
export const getColorOverrides = () => read();
export function setColorOverride(group, key, hex) {
  const o = read(); o[group] = o[group] || {};
  if (hex) o[group][key] = hex; else delete o[group][key];
  write(o);
}
export const resetColorOverrides = () => localStorage.removeItem(LS);
export const cssVarHex = (name, fb = '#888888') =>
  (typeof getComputedStyle !== 'undefined' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '') || fb;

// ---------- relationships ----------
import { isFamilyRel } from './config.js';
export const REL_KEYS = ['Professional', 'Friend', 'Family', 'Family Friend', 'Customer', 'Prospect', 'Business'];
const REL_VARS = { Professional: '--rel-professional', Friend: '--rel-friend', Family: '--rel-family', 'Family Friend': '--rel-familyfriend', Customer: '--rel-customer', Prospect: '--rel-prospect', Business: '--rel-business' };
const relVar = (k) => REL_VARS[k] || (isFamilyRel(k) ? '--rel-family' : '--rel-other');
export const relColor = (k) => read().rel?.[k] || `var(${relVar(k)})`;
export const relDefaultHex = (k) => cssVarHex(relVar(k), '#8d8578');
// concrete hex for a relationship: the saved override when it is a hex,
// else the theme default the Settings swatches use
const HEXRE = /^#[0-9a-f]{6}$/i;
export const relHex = (k) => { const o = read().rel?.[k]; return HEXRE.test(o || '') ? o : relDefaultHex(k); };
// scale a hex toward black (f = fraction kept) for dark tints
export const darken = (hex, f = 0.42) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  if (Number.isNaN(n)) return '#3a3a3a';
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0');
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
};
// initials avatar: dark tint of the relationship color, full color as the ring
export const avStyle = (k) => { const h = relHex(k); return `background:${darken(h)};border-color:${h};color:#f7f1e6`; };

// ---------- tiers ----------
export const TIER_KEYS = ['A', 'B', 'C', 'D'];
const TIER_DEFAULTS = { A: 'var(--amber)', B: '#7fa07a', C: '#7d99a8', D: '#e0654d' };
export const TIER_NONE = '#6e6e6e';
export const tierColor = (t) => read().tier?.[t || ''] || (t ? (TIER_DEFAULTS[t] || TIER_NONE) : TIER_NONE);
export const tierDefaultHex = (t) => (t ? (t === 'A' ? cssVarHex('--amber', '#d2a24c') : TIER_DEFAULTS[t] || TIER_NONE) : TIER_NONE);

// ---------- circles ----------
export const CIRCLE_PALETTE = ['#d2a24c', '#7fa07a', '#c08b5c', '#7d99a8', '#a8716a', '#a08b62', '#d9704a', '#8d8578'];
export const circleColor = (name, rank = 0) => read().circle?.[name] || CIRCLE_PALETTE[rank % CIRCLE_PALETTE.length];
