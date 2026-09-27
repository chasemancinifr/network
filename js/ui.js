// Chrome: DOM refs, page header, slide-over panel, toast, visual primitives, theme.
// Presentation only — no data fetching here.

import { state } from './config.js';
import { esc, fmtDate, ago, dueInfo, today } from './utils.js';

export const $view = document.getElementById('view');
export const $kicker = document.getElementById('kicker');
export const $title = document.getElementById('title');
export const $add = document.getElementById('addPersonBtn');
export const $tabs = document.getElementById('tabs');
export const $panel = document.getElementById('panel');
export const $scrim = document.getElementById('scrim');
export const $pBody = document.getElementById('pBody');
export const $pKicker = document.getElementById('pKicker');
export const $pTitle = document.getElementById('pTitle');
export const $pActions = document.getElementById('pActions');
export const $themeBtn = document.getElementById('themeBtn');

export function toast(msg, err) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), err ? 4500 : 2200);
}

// ---------- visual primitives ----------
export const initials = (name) => String(name || '?').replace(/\(.*?\)/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
export const st = (cls, label) => `<span class="st ${cls}"><i class="dot"></i>${esc(label)}</span>`;
export const sec = (label, count, extra = '', countCls = '') => `<div class="sec"><span>${esc(label)}</span>${count !== undefined && count !== null ? `<span class="count ${countCls}">${String(count).padStart(2, '0')}</span>` : ''}${extra}</div>`;
export const monoDate = (d) => fmtDate(d).toUpperCase();
export function personStatus(p) {
  const d = dueInfo(p);
  if (!d) return '';
  if (d.overdue) return st('red', d.label);
  if (d.left <= 3) return st('amber', d.label);
  return st('gray', d.label);
}
export function personMeta(p) {
  return [p.tier ? `Tier ${p.tier}` : null, [p.role, p.dept].filter(Boolean).join(' · ') || p.relationship || (p.circles || []).join(', ')].filter(Boolean).join(' · ');
}
export const personRow = (p, extra = '') => `
  <li><a class="row" href="#/p/${p.id}">
    <span class="av">${esc(initials(p.name))}</span>
    <span class="main"><span class="name">${esc(p.name)}</span><span class="meta">${esc(personMeta(p))}</span></span>
    ${extra}</a></li>`;
export function kickerDate() {
  const d = new Date();
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} · ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`.toUpperCase();
}

// ---------- chrome: page header, nav, panel ----------
export function setHead({ kicker = '', title, tab = null, add = false }) {
  $kicker.textContent = kicker; $title.textContent = title; $add.hidden = !add; $tabs.hidden = !state.session;
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  document.title = title === 'Network' ? 'Network' : `${title} · Network`;
}
export function panelHead({ kicker = '', title, actions = '' }) {
  $pKicker.textContent = kicker; $pTitle.textContent = title; $pActions.innerHTML = actions;
}
export function openPanel() {
  if ($panel.hidden) { $panel.hidden = false; $scrim.hidden = false; document.body.classList.add('panel-open'); }
  $pBody.scrollTop = 0; panelHead({ title: '' }); $pBody.innerHTML = '<div class="empty mono">LOADING…</div>';
}
export function closePanel() {
  $panel.hidden = true; $scrim.hidden = true; document.body.classList.remove('panel-open'); $pBody.innerHTML = ''; $pActions.innerHTML = '';
}
export const dismissPanel = () => {
  // Editors opened directly (e.g. the follow-up editor) don't change the hash,
  // so setting it to state.base fires no hashchange — close outright instead.
  if (location.hash === state.base) closePanel();
  else location.hash = state.base;
};
document.getElementById('pClose').onclick = dismissPanel;
$scrim.onclick = dismissPanel;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$panel.hidden) dismissPanel(); });
$add.onclick = () => (location.hash = '#/new');

export function pwField(id, name, autocomplete, placeholder, extra = '') {
  return `<div class="pwwrap"><input class="field" type="password" id="${id}" name="${name}" autocomplete="${autocomplete}" placeholder="${placeholder}"
    autocapitalize="off" autocorrect="off" spellcheck="false" ${extra}><button type="button" class="eye" data-eye="${id}" aria-label="Show password">Show</button></div>`;
}
export function bindEyes(root) {
  root.querySelectorAll('[data-eye]').forEach((b) => (b.onclick = () => {
    const i = document.getElementById(b.dataset.eye); const show = i.type === 'password';
    i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }));
}

// ---------- theme (per-device display preference) ----------
const THEME_ICONS = {
  auto: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg>',
  light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
};
export function getTheme() { try { const t = localStorage.getItem('theme'); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; } }
export function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  $themeBtn.innerHTML = THEME_ICONS[t]; $themeBtn.setAttribute('aria-label', `Theme: ${t}`); $themeBtn.title = `Theme: ${t}`;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#0a0c10' : '#F4F3F0'));
}
$themeBtn.onclick = () => {
  const order = ['auto', 'light', 'dark']; const next = order[(order.indexOf(getTheme()) + 1) % 3];
  try { localStorage.setItem('theme', next); } catch {}
  applyTheme(next); toast(`Theme · ${next}`);
};
applyTheme(getTheme());
