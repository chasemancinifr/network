// Chrome: DOM refs, page header, slide-over panel, toast, visual primitives, theme.
// Presentation only — no data fetching here.

import { state, ACTION_CATEGORIES, ACTION_IMPORTANCE } from './config.js';
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
export const personRow = (p, extra = '', act = '') => `
  <li><a class="row" href="#/p/${p.id}">
    <span class="av">${esc(initials(p.name))}</span>
    <span class="main"><span class="name">${esc(p.name)}${act}</span><span class="meta">${esc(personMeta(p))}</span></span>
    ${extra}</a></li>`;
export function kickerDate() {
  const d = new Date();
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} · ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`.toUpperCase();
}

// ---------- chrome: page header, nav, panel ----------
export function setHead({ kicker = '', title, tab = null, add = false }) {
  $kicker.textContent = kicker; $title.textContent = title; $add.hidden = !add; $tabs.hidden = !state.session;
  document.querySelectorAll('.nav a, .nav button').forEach((a) => {
    const tb = a.dataset.tab;
    a.classList.toggle('on', tb === tab || (tb === 'more' && (tab === 'recent' || tab === 'settings')));
  });
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
// $add's action is bound by the router (openNewMenu) — see js/router.js.

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

// ---------- person picker ----------
// A select of everyone plus a type-to-find box above it (160+ names is a long
// scroll on a phone). Required pickers start blank so nothing is pre-chosen.
export function personPicker({ id, people, selected = '', required = false, label = 'Person' }) {
  const opts = people.map((p) => `<option value="${p.id}"${p.id === selected ? ' selected' : ''}>${esc(p.name)}</option>`).join('');
  return `<label class="lbl" for="${id}">${label}</label>
    <input class="field psearch" type="search" data-psearch="${id}" placeholder="Type a name to find…" autocomplete="off" autocapitalize="words" style="margin-bottom:6px">
    <select class="field" id="${id}"${required ? ' required' : ''}><option value="">${required ? 'Choose a person…' : '—'}</option>${opts}</select>`;
}
export function bindPersonPickers(root) {
  root.querySelectorAll('[data-psearch]').forEach((inp) => {
    const sel = root.querySelector('#' + inp.dataset.psearch);
    if (!sel) return;
    const all = [...sel.options].map((o) => ({ v: o.value, t: o.textContent }));
    inp.oninput = () => {
      const q = inp.value.trim().toLowerCase();
      const keep = sel.value;
      const rows = q ? all.filter((o) => !o.v || o.t.toLowerCase().includes(q)) : all;
      sel.innerHTML = rows.map((o) => `<option value="${esc(o.v)}">${esc(o.t)}</option>`).join('');
      const firstHit = rows.find((o) => o.v);
      sel.value = q && firstHit ? firstHit.v : (rows.some((o) => o.v === keep) ? keep : '');
    };
  });
}

// ---------- action categories (follow-ups + tasks) ----------
// Pill selector for the follow-up/task forms. Renders nothing until the 0003
// migration has added the category column (state.hasCategory, probed at boot).
export function categoryField(selected) {
  if (!state.hasCategory) return { html: '', bind() {}, get: () => null };
  let sel = ACTION_CATEGORIES.includes(selected) ? selected : null;
  return {
    html: `<label class="lbl">Category</label><div class="pills" data-catpills>${ACTION_CATEGORIES.map((c) => `<button type="button" class="pill${sel === c ? ' on' : ''}" data-c="${c}">${c}</button>`).join('')}</div>`,
    bind(root) {
      root.querySelectorAll('[data-catpills] [data-c]').forEach((b) => (b.onclick = () => {
        sel = b.dataset.c;
        root.querySelectorAll('[data-catpills] [data-c]').forEach((x) => x.classList.toggle('on', x === b));
      }));
    },
    get: () => sel,
  };
}
// small badge for action rows; empty when uncategorized
export const catBadge = (c) => (c ? `<span class="typebadge">${esc(c)}</span>` : '');

// ---------- action importance (follow-ups + tasks) ----------
// Pill selector for the follow-up/task forms. Renders nothing until the 0004
// migration has added the importance column (state.hasImportance, probed at boot).
// Defaults to neutral; only urgent/high/medium get a badge on rows.
export function importanceField(selected) {
  if (!state.hasImportance) return { html: '', bind() {}, get: () => null };
  let sel = ACTION_IMPORTANCE.includes(selected) ? selected : 'neutral';
  return {
    html: `<label class="lbl">Importance</label><div class="pills" data-imppills>${ACTION_IMPORTANCE.map((c) => `<button type="button" class="pill${sel === c ? ' on' : ''}" data-i="${c}">${c}</button>`).join('')}</div>`,
    bind(root) {
      root.querySelectorAll('[data-imppills] [data-i]').forEach((b) => (b.onclick = () => {
        sel = b.dataset.i;
        root.querySelectorAll('[data-imppills] [data-i]').forEach((x) => x.classList.toggle('on', x === b));
      }));
    },
    get: () => sel,
  };
}
const IMP_COLORS = { urgent: 'var(--red)', high: 'var(--amber)', medium: '#7d99a8', neutral: '#6e6e6e' };
export { IMP_COLORS };
export const impBadge = (i) => (IMP_COLORS[i] ? `<span class="typebadge" style="color:${IMP_COLORS[i]};border-color:${IMP_COLORS[i]}">${esc(i)}</span>` : '');
// notification dot for person rows: open-action count tinted by the highest importance
const IMP_RANK = { urgent: 0, high: 1, medium: 2, neutral: 3 };
export const impRank = (i) => IMP_RANK[i] ?? 3;
export const actDot = (e) => (!e || !e.n) ? ''
  : `<span class="actdot" style="--c:${IMP_COLORS[e.top] || IMP_COLORS.neutral}" title="${e.n} open action${e.n === 1 ? '' : 's'}${e.top && e.top !== 'neutral' ? ` · ${e.top}` : ''}">${e.n}</span>`;

// ---------- series scope (repeating events/tasks) ----------
// Scope pills for editing a series member: only this / this & following / entire series.
export function seriesScopeField(note) {
  let sel = 'one';
  const opts = [['one', 'Only this'], ['following', 'This & following'], ['all', 'Entire series']];
  return {
    html: `${note ? `<p class="note">${note}</p>` : ''}<label class="lbl">Apply to</label><div class="pills" data-scopepills>${opts.map(([k, l]) => `<button type="button" class="pill${sel === k ? ' on' : ''}" data-s="${k}">${l}</button>`).join('')}</div>`,
    bind(root) {
      root.querySelectorAll('[data-scopepills] [data-s]').forEach((b) => (b.onclick = () => {
        sel = b.dataset.s;
        root.querySelectorAll('[data-scopepills] [data-s]').forEach((x) => x.classList.toggle('on', x === b));
      }));
    },
    get: () => sel,
  };
}
// Delete panel for a series member; onScope(scope|null) performs the delete
// (null = cancelled) and closes the panel itself.
export function openSeriesDeletePanel({ kicker, title, note, onScope }) {
  openPanel();
  panelHead({ kicker, title });
  $pBody.innerHTML = `<div class="card form"><p class="note">${note}</p>
    <div class="actions" style="flex-direction:column;align-items:stretch;gap:8px">
      <button class="btn" data-ds="one">Delete only this one</button>
      <button class="btn" data-ds="following">Delete this & following</button>
      <button class="btn danger" data-ds="all">Delete entire series</button>
      <button class="btn" id="sdcancel">Cancel</button>
    </div></div>`;
  $pBody.querySelectorAll('[data-ds]').forEach((b) => (b.onclick = () => onScope(b.dataset.ds)));
  document.getElementById('sdcancel').onclick = () => { closePanel(); onScope(null); };
}
export const seriesNote = (rule, idx, n) => `Repeating · ${rule[0].toUpperCase() + rule.slice(1)} · ${idx + 1} of ${n}`;
// ---------- repeat selector (events + tasks) ----------
// Materializes N dated instances (weekly x12, monthly x12, yearly x10).
// Each instance is a real row, editable/deletable on its own.
// Shown on create AND on edit — changing the rule in the edit form regenerates
// the affected rows (see applyRepeatChange in db.js).
export const REPEAT_OPTIONS = [
  { k: 'none', label: 'No repeat', n: 1 },
  { k: 'weekly', label: 'Weekly', n: 12 },
  { k: 'monthly', label: 'Monthly', n: 12 },
  { k: 'yearly', label: 'Yearly', n: 10 },
];
export function repeatField(selected = 'none') {
  let sel = REPEAT_OPTIONS.some((o) => o.k === selected) ? selected : 'none';
  return {
    html: `<label class="lbl">Repeat</label><div class="pills" data-repeatpills>${REPEAT_OPTIONS.map((o) => `<button type="button" class="pill${sel === o.k ? ' on' : ''}" data-r="${o.k}" title="${o.k === 'none' ? 'Just this once' : `${o.label} · creates ${o.n}`}">${o.label}</button>`).join('')}</div>`,
    bind(root) {
      root.querySelectorAll('[data-repeatpills] [data-r]').forEach((b) => (b.onclick = () => {
        sel = b.dataset.r;
        root.querySelectorAll('[data-repeatpills] [data-r]').forEach((x) => x.classList.toggle('on', x === b));
      }));
    },
    get: () => REPEAT_OPTIONS.find((o) => o.k === sel),
  };
}
