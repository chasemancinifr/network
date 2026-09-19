import { createClient } from './supabase.js';
import { marked } from './marked.js';
import DOMPurify from './purify.js';

const SUPABASE_URL = 'https://afmuodzloooetmlyqxmr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ifWhRQP70qDA4tHBy6_AKg_3phy0aFo'; // public key; data is protected by login + row-level security
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

const TIERS = ['A', 'B', 'C', 'D'];
const KINDS = ['conversation', 'call', 'message', 'meeting'];
const $view = document.getElementById('view');
const $kicker = document.getElementById('kicker');
const $title = document.getElementById('title');
const $add = document.getElementById('addPersonBtn');
const $tabs = document.getElementById('tabs');
const $panel = document.getElementById('panel');
const $scrim = document.getElementById('scrim');
const $pBody = document.getElementById('pBody');
const $pKicker = document.getElementById('pKicker');
const $pTitle = document.getElementById('pTitle');
const $pActions = document.getElementById('pActions');
const $themeBtn = document.getElementById('themeBtn');

const state = { people: null, session: null, peopleFilter: { q: '', tiers: new Set(), circle: null }, fuTab: 'open',
  base: '#/today', baseRendered: false, cal: null };

// ---------- helpers ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toLocaleDateString('en-CA');
const md = (s) => DOMPurify.sanitize(marked.parse(String(s || '').replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (_, a, b) => (b ? b.slice(1) : a))));
function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d.length === 10 ? d + 'T12:00:00' : d);
  const opts = { month: 'short', day: 'numeric' };
  if (dt.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return dt.toLocaleDateString(undefined, opts);
}
function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
function addDays(d, n) { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); }
function ago(d) {
  if (!d) return 'never';
  const n = daysBetween(d, today());
  if (n <= 0) return 'today'; if (n === 1) return 'yesterday';
  if (n < 60) return `${n}d ago`; return fmtDate(d);
}
function bday(p) {
  if (!p.birth_month) return '';
  const s = new Date(2000, p.birth_month - 1, p.birth_day).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  return p.birth_year ? `${s}, ${p.birth_year}` : s;
}
function dueInfo(p) {
  if (!p.cadence_days) return null;
  if (!p.last_contact) return { overdue: true, label: 'no contact logged' };
  const left = p.cadence_days - daysBetween(p.last_contact, today());
  return { overdue: left <= 0, label: left <= 0 ? `${-left}d overdue` : `due in ${left}d`, left };
}
function toast(msg, err) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (err ? ' err' : ''); t.hidden = false;
  clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), err ? 4500 : 2200);
}
async function q(promise) {
  const { data, error } = await promise;
  if (error) { toast(error.message, true); throw error; }
  return data;
}

// ---------- visual primitives (presentation only) ----------
const initials = (name) => String(name || '?').replace(/\(.*?\)/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const st = (cls, label) => `<span class="st ${cls}"><i class="dot"></i>${esc(label)}</span>`;
const sec = (label, count, extra = '', countCls = '') => `<div class="sec"><span>${esc(label)}</span>${count !== undefined && count !== null ? `<span class="count ${countCls}">${String(count).padStart(2, '0')}</span>` : ''}${extra}</div>`;
const monoDate = (d) => fmtDate(d).toUpperCase();
function personStatus(p) {
  const d = dueInfo(p);
  if (!d) return '';
  if (d.overdue) return st('red', d.label);
  if (d.left <= 3) return st('amber', d.label);
  return st('gray', d.label);
}
function personMeta(p) {
  return [p.tier ? `Tier ${p.tier}` : null, [p.role, p.dept].filter(Boolean).join(' · ') || p.relationship || (p.circles || []).join(', ')].filter(Boolean).join(' · ');
}
const personRow = (p, extra = '') => `
  <li><a class="row" href="#/p/${p.id}">
    <span class="av">${esc(initials(p.name))}</span>
    <span class="main"><span class="name">${esc(p.name)}</span><span class="meta">${esc(personMeta(p))}</span></span>
    ${extra}</a></li>`;
function kickerDate() {
  const d = new Date();
  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} · ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`.toUpperCase();
}

// ---------- chrome: page header, nav, panel ----------
function setHead({ kicker = '', title, tab = null, add = false }) {
  $kicker.textContent = kicker; $title.textContent = title; $add.hidden = !add; $tabs.hidden = !state.session;
  document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  document.title = title === 'Network' ? 'Network' : `${title} · Network`;
}
function panelHead({ kicker = '', title, actions = '' }) {
  $pKicker.textContent = kicker; $pTitle.textContent = title; $pActions.innerHTML = actions;
}
function openPanel() {
  if ($panel.hidden) { $panel.hidden = false; $scrim.hidden = false; document.body.classList.add('panel-open'); }
  $pBody.scrollTop = 0; panelHead({ title: '' }); $pBody.innerHTML = '<div class="empty mono">LOADING…</div>';
}
function closePanel() {
  $panel.hidden = true; $scrim.hidden = true; document.body.classList.remove('panel-open'); $pBody.innerHTML = ''; $pActions.innerHTML = '';
}
const dismissPanel = () => { location.hash = state.base; };
document.getElementById('pClose').onclick = dismissPanel;
$scrim.onclick = dismissPanel;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$panel.hidden) dismissPanel(); });
$add.onclick = () => (location.hash = '#/new');

// ---------- theme (per-device display preference) ----------
const THEME_ICONS = {
  auto: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none"/></svg>',
  light: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  dark: '<svg viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>',
};
function getTheme() { try { const t = localStorage.getItem('theme'); return t === 'light' || t === 'dark' ? t : 'auto'; } catch { return 'auto'; } }
function applyTheme(t) {
  if (t === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t);
  $themeBtn.innerHTML = THEME_ICONS[t]; $themeBtn.setAttribute('aria-label', `Theme: ${t}`); $themeBtn.title = `Theme: ${t}`;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', dark ? '#1A1918' : '#F4F3F0'));
}
$themeBtn.onclick = () => {
  const order = ['auto', 'light', 'dark']; const next = order[(order.indexOf(getTheme()) + 1) % 3];
  try { localStorage.setItem('theme', next); } catch {}
  applyTheme(next); toast(`Theme · ${next}`);
};
applyTheme(getTheme());

async function loadPeople(force) {
  if (state.people && !force) return state.people;
  state.people = await q(sb.from('people')
    .select('id,name,aliases,tier,circles,relationship,org,dept,role,last_contact,cadence_days,birth_month,birth_day,birth_year')
    .is('archived_at', null).order('name'));
  return state.people;
}
// the one query for open follow-ups (unchanged from v1); reused by Today, Overdue and Calendar
const openFollowups = () => q(sb.from('follow_ups').select('id,title,due_date,status,created_at,person:people(id,name,tier)').eq('status', 'open')
  .order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }));

function pwField(id, name, autocomplete, placeholder, extra = '') {
  return `<div class="pwwrap"><input class="field" type="password" id="${id}" name="${name}" autocomplete="${autocomplete}" placeholder="${placeholder}"
    autocapitalize="off" autocorrect="off" spellcheck="false" ${extra}><button type="button" class="eye" data-eye="${id}" aria-label="Show password">Show</button></div>`;
}
function bindEyes(root) {
  root.querySelectorAll('[data-eye]').forEach((b) => (b.onclick = () => {
    const i = document.getElementById(b.dataset.eye); const show = i.type === 'password';
    i.type = show ? 'text' : 'password'; b.textContent = show ? 'Hide' : 'Show'; b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }));
}

// ---------- login ----------
function renderLogin(step = 'email', email = '') {
  setHead({ kicker: step === 'email' ? 'Sign in' : 'Sign in · step 2', title: 'Network' });
  $view.innerHTML = step === 'email' ? `
    <div class="login">
      <p>Sign in once. Your phone keeps you signed in.</p>
      <form id="f">
        <label class="lbl" for="email" style="margin:0">Email</label>
        <input class="field" type="email" id="email" name="username" required autocomplete="username" autocapitalize="off" autocorrect="off" placeholder="you@email.com" value="${esc(email)}">
        <label class="lbl" for="pw" style="margin:6px 0 0">Password</label>
        ${pwField('pw', 'password', 'current-password', 'Password')}
        <button class="btn primary" id="go">Sign in</button>
      </form>
      <p class="alt"><a href="#" id="linkInstead">No password yet? Email me a sign-in link</a></p>
    </div>` : `
    <div class="login">
      <p>We sent a sign-in link to <b style="color:var(--text)">${esc(email)}</b>.</p>
      <p style="font-size:13.5px">In a browser: just tap the link.<br>In the home-screen app: long-press the link in the email, tap <b style="color:var(--text)">Copy Link</b>, and paste it here.</p>
      <form id="f"><input class="field" id="code" required placeholder="Paste link (or code)" autocomplete="one-time-code">
      <button class="btn primary" id="go">Sign in</button></form>
      <p class="alt"><a href="#" id="again">Back</a></p>
    </div>`;
  const f = document.getElementById('f');
  bindEyes($view);
  if (step === 'email') {
    const sendLink = async () => {
      const em = document.getElementById('email').value.trim();
      if (!em) { toast('Enter your email first', true); return; }
      const { error } = await sb.auth.signInWithOtp({ email: em, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } });
      if (error) { toast(error.message, true); return; }
      renderLogin('code', em);
    };
    document.getElementById('linkInstead').onclick = (e) => { e.preventDefault(); sendLink(); };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const em = document.getElementById('email').value.trim(), pw = document.getElementById('pw').value;
      if (!pw) return sendLink();
      document.getElementById('go').disabled = true;
      const { error } = await sb.auth.signInWithPassword({ email: em, password: pw });
      if (error) { toast(error.message === 'Invalid login credentials' ? "Wrong password (or none set yet: use the email link)" : error.message, true); document.getElementById('go').disabled = false; }
    };
  } else {
    document.getElementById('again').onclick = (e) => { e.preventDefault(); renderLogin('email', email); };
    f.onsubmit = async (e) => {
      e.preventDefault(); document.getElementById('go').disabled = true;
      const raw = document.getElementById('code').value.trim();
      let res;
      if (/^https?:\/\//.test(raw)) {
        const u = new URL(raw);
        const hash = u.searchParams.get('token') || u.searchParams.get('token_hash');
        const type = u.searchParams.get('type') || 'magiclink';
        if (!hash) { toast("That link doesn't look like the sign-in link", true); document.getElementById('go').disabled = false; return; }
        res = await sb.auth.verifyOtp({ token_hash: hash, type });
      } else {
        res = await sb.auth.verifyOtp({ email, token: raw.replace(/\D/g, ''), type: 'email' });
      }
      const { error } = res;
      if (error) { toast(error.message, true); document.getElementById('go').disabled = false; }
    };
  }
}

// ---------- follow-up rows (shared) ----------
function fuStatus(f) {
  const t = today();
  if (f.status === 'closed') return st('ring', f.completed_at ? `Done ${monoDate(f.completed_at)}` : 'Done');
  if (f.status === 'parked') return st('gray', 'Parked');
  if (!f.due_date) return st('ring', 'Open');
  if (f.due_date < t) return st('red', `Overdue · ${monoDate(f.due_date)}`);
  if (f.due_date === t) return st('amber', 'Today');
  return st('gray', monoDate(f.due_date));
}
function fuItem(f) {
  const who = f.person ? `<a href="#/p/${f.person.id}">${esc(f.person.name)}</a>` : '';
  const ctl = f.status === 'open'
    ? `<button class="check" data-done="${f.id}" aria-label="Mark done" title="Mark done"></button>`
    : `<button class="btn small" data-reopen="${f.id}">Reopen</button>`;
  const park = f.status === 'open' ? `<button class="btn small" data-park="${f.id}">Park</button>` : '';
  return `<li class="fu ${f.status}">${ctl}<div class="main"><span class="t">${esc(f.title)}</span><span class="meta">${fuStatus(f)}${who ? `<span>${who}</span>` : ''}</span></div>${park}</li>`;
}
function bindFollowups(rerender, root = $view) {
  root.querySelectorAll('[data-done]').forEach((b) => (b.onclick = async () => {
    b.disabled = true; await q(sb.from('follow_ups').update({ status: 'closed', completed_at: new Date().toISOString() }).eq('id', b.dataset.done));
    toast('Done ✓'); rerender();
  }));
  root.querySelectorAll('[data-park]').forEach((b) => (b.onclick = async () => {
    b.disabled = true; await q(sb.from('follow_ups').update({ status: 'parked' }).eq('id', b.dataset.park)); toast('Parked'); rerender();
  }));
  root.querySelectorAll('[data-reopen]').forEach((b) => (b.onclick = async () => {
    b.disabled = true; await q(sb.from('follow_ups').update({ status: 'open', completed_at: null }).eq('id', b.dataset.reopen)); toast('Reopened'); rerender();
  }));
}
const fuList = (fus, empty) => `<div class="card">${fus.length ? `<ul class="list">${fus.map(fuItem).join('')}</ul>` : `<div class="empty">${empty}</div>`}</div>`;
function upcomingBirthdays(people, days) {
  const t = today(); const y = +t.slice(0, 4);
  return people.filter((p) => p.birth_month).map((p) => {
    let d = `${y}-${String(p.birth_month).padStart(2, '0')}-${String(p.birth_day).padStart(2, '0')}`;
    if (d < t) d = `${y + 1}` + d.slice(4);
    return { p, in: daysBetween(t, d) };
  }).filter((x) => x.in <= days).sort((a, b) => a.in - b.in);
}

// ---------- today ----------
async function renderToday() {
  setHead({ kicker: kickerDate(), title: 'Today', tab: 'today', add: true });
  const [people, fus] = await Promise.all([loadPeople(), openFollowups()]);
  const t = today();
  const overdue = people.map((p) => ({ p, d: dueInfo(p) })).filter((x) => x.d && x.d.overdue);
  const upcoming = people.map((p) => ({ p, d: dueInfo(p) })).filter((x) => x.d && !x.d.overdue);
  const bdays = upcomingBirthdays(people, 21);
  const lateFus = fus.filter((f) => f.due_date && f.due_date < t).length;
  const todayFus = fus.filter((f) => f.due_date === t).length;
  const nOver = overdue.length + lateFus;

  $view.innerHTML = `
    <div class="stats">
      <a class="stat ${nOver ? 'red' : ''}" href="#/overdue"><span class="k">Overdue</span><span class="v">${nOver}</span></a>
      <a class="stat" href="#/calendar"><span class="k">${todayFus ? '<i class="dot"></i>' : ''}Due today</span><span class="v">${todayFus}</span></a>
      <a class="stat" href="#/followups"><span class="k">Open</span><span class="v">${fus.length}</span></a>
      <a class="stat" href="#/calendar"><span class="k">Bdays · 21d</span><span class="v">${bdays.length}</span></a>
    </div>
    ${sec('Reach out', overdue.length, '', overdue.length ? 'red' : '')}
    ${overdue.length ? `<ul class="list card">${overdue.map((x) => personRow(x.p, st('red', x.d.label))).join('')}</ul>` : '<div class="card empty">Nobody overdue.</div>'}
    ${bdays.length ? `${sec('Birthdays · next 3 weeks', bdays.length)}<ul class="list card">${bdays.map((x) => personRow(x.p, st(x.in <= 1 ? 'amber' : 'gray', x.in === 0 ? 'today' : x.in === 1 ? 'tomorrow' : `in ${x.in}d`))).join('')}</ul>` : ''}
    ${sec('Open follow-ups', fus.length, '<a href="#/followups">All →</a>')}
    ${fuList(fus, 'All clear.')}
    ${upcoming.length ? `${sec('On cadence', upcoming.length)}<ul class="list card">${upcoming.map((x) => personRow(x.p, personStatus(x.p))).join('')}</ul>` : ''}
    <div class="linkrow"><a href="#/password">Set password</a><a href="#" id="signout">Sign out</a></div>`;
  bindFollowups(renderToday);
  document.getElementById('signout').onclick = async (e) => { e.preventDefault(); await sb.auth.signOut(); };
}

// ---------- overdue ----------
async function renderOverdue() {
  setHead({ kicker: 'Attention', title: 'Overdue', tab: 'overdue', add: true });
  const [people, fus] = await Promise.all([loadPeople(), openFollowups()]);
  const t = today();
  const people_ = people.map((p) => ({ p, d: dueInfo(p) })).filter((x) => x.d && x.d.overdue);
  const late = fus.filter((f) => f.due_date && f.due_date < t);
  $kicker.textContent = `Attention · ${people_.length + late.length} items`;
  $view.innerHTML = `
    ${sec('Cadence · reach out', people_.length, '', people_.length ? 'red' : '')}
    ${people_.length ? `<ul class="list card">${people_.map((x) => personRow(x.p, st('red', x.d.label))).join('')}</ul>` : '<div class="card empty">Nobody past their cadence.</div>'}
    ${sec('Follow-ups past due', late.length, '', late.length ? 'red' : '')}
    ${fuList(late, 'No follow-ups past their due date.')}`;
  bindFollowups(renderOverdue);
}

// ---------- follow-ups (scheduled) ----------
async function renderFollowups() {
  setHead({ kicker: 'Scheduled', title: 'Follow-ups', tab: 'followups', add: true });
  const s = state.fuTab;
  let qq = sb.from('follow_ups').select('id,title,due_date,status,created_at,completed_at,person:people(id,name,tier)').eq('status', s);
  qq = s === 'closed' ? qq.order('completed_at', { ascending: false, nullsFirst: false }).limit(100)
    : qq.order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
  const fus = await q(qq);
  $view.innerHTML = `
    <div class="pills" role="tablist">${['open', 'parked', 'closed'].map((k) => `<button class="pill ${k === s ? 'on' : ''}" data-seg="${k}" role="tab" aria-selected="${k === s}">${k}</button>`).join('')}</div>
    <div class="count">${fus.length} ${s === 'closed' ? 'completed (latest 100)' : s}</div>
    ${fuList(fus, 'Nothing here.')}`;
  $view.querySelectorAll('[data-seg]').forEach((b) => (b.onclick = () => { state.fuTab = b.dataset.seg; renderFollowups(); }));
  bindFollowups(renderFollowups);
}

// ---------- people ----------
async function renderPeople() {
  setHead({ kicker: 'Directory', title: 'People', tab: 'people', add: true });
  const people = await loadPeople();
  $kicker.textContent = `Directory · ${people.length} records`;
  const circles = [...new Set(people.flatMap((p) => p.circles || []))].sort();
  const F = state.peopleFilter;
  $view.innerHTML = `
    <input class="search" id="q" type="search" placeholder="Search name, role, alias…" value="${esc(F.q)}" autocomplete="off">
    <div class="pills">${TIERS.map((t) => `<button class="pill ${F.tiers.has(t) ? 'on' : ''}" data-tier="${t}">Tier ${t}</button>`).join('')}</div>
    <div class="pills">${circles.map((c) => `<button class="pill ${F.circle === c ? 'on' : ''}" data-circle="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div id="count" class="count"></div>
    <ul class="list card" id="plist"></ul>`;
  const draw = () => {
    const needle = F.q.trim().toLowerCase();
    const rows = people.filter((p) =>
      (!F.tiers.size || F.tiers.has(p.tier)) && (!F.circle || (p.circles || []).includes(F.circle)) &&
      (!needle || [p.name, ...(p.aliases || []), p.role, p.dept, p.relationship].some((s) => (s || '').toLowerCase().includes(needle))));
    document.getElementById('plist').innerHTML = rows.length ? rows.map((p) => personRow(p, personStatus(p))).join('') : '<li class="empty">No matches.</li>';
    document.getElementById('count').textContent = rows.length === people.length ? `${people.length} records` : `${rows.length} of ${people.length}`;
  };
  const qi = document.getElementById('q');
  qi.oninput = () => { F.q = qi.value; draw(); };
  $view.querySelectorAll('[data-tier]').forEach((c) => (c.onclick = () => {
    F.tiers.has(c.dataset.tier) ? F.tiers.delete(c.dataset.tier) : F.tiers.add(c.dataset.tier); c.classList.toggle('on'); draw();
  }));
  $view.querySelectorAll('[data-circle]').forEach((c) => (c.onclick = () => {
    F.circle = F.circle === c.dataset.circle ? null : c.dataset.circle;
    $view.querySelectorAll('[data-circle]').forEach((x) => x.classList.toggle('on', x.dataset.circle === F.circle)); draw();
  }));
  draw();
}

// ---------- calendar ----------
async function renderCalendar() {
  setHead({ kicker: 'Schedule', title: 'Calendar', tab: 'calendar', add: true });
  const [people, fus] = await Promise.all([loadPeople(), openFollowups()]);
  const t = today();
  if (!state.cal) state.cal = { y: +t.slice(0, 4), m: +t.slice(5, 7) - 1, sel: t };
  const C = state.cal;
  const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const buildEvents = () => {
    const ev = {}; const add = (d, e) => (ev[d] ||= []).push(e);
    fus.filter((f) => f.due_date).forEach((f) => add(f.due_date, { kind: 'fu', f, cls: f.due_date < t ? 'red' : f.due_date === t ? 'amber' : 'gray' }));
    people.forEach((p) => {
      if (p.birth_month) add(key(C.y, p.birth_month - 1, p.birth_day), { kind: 'bday', p, cls: 'gray' });
      if (p.cadence_days) {
        const due = p.last_contact ? addDays(p.last_contact, p.cadence_days) : t;
        add(due, { kind: 'cad', p, cls: due <= t ? 'red' : 'gray', due });
      }
    });
    return ev;
  };
  const draw = () => {
    const ev = buildEvents();
    const first = new Date(C.y, C.m, 1); const lead = first.getDay(); const dim = new Date(C.y, C.m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push('<div class="cal-day out"></div>');
    for (let d = 1; d <= dim; d++) {
      const k = key(C.y, C.m, d); const items = ev[k] || [];
      const dots = items.slice(0, 3).map((e) => `<i class="${e.cls}"></i>`).join('');
      cells.push(`<button class="cal-day ${k === t ? 'today' : ''} ${k === C.sel ? 'sel' : ''}" data-day="${k}" aria-label="${k}${items.length ? `, ${items.length} items` : ''}"><span class="n">${d}</span><span class="dots">${dots}</span></button>`);
    }
    while (cells.length % 7) cells.push('<div class="cal-day out"></div>');
    const items = (ev[C.sel] || []).sort((a, b) => ({ red: 0, amber: 1, gray: 2 }[a.cls] - { red: 0, amber: 1, gray: 2 }[b.cls]));
    const fuItems = items.filter((e) => e.kind === 'fu').map((e) => e.f);
    const pItems = items.filter((e) => e.kind !== 'fu');
    const monthName = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    $view.innerHTML = `
      <div class="cal-bar"><span class="mo">${esc(monthName)}</span>
        <button class="pill" id="calToday">Today</button>
        <button class="iconbtn" id="calPrev" aria-label="Previous month"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <button class="iconbtn" id="calNext" aria-label="Next month"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button></div>
      <div class="cal"><div class="cal-dow">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<div>${x}</div>`).join('')}</div><div class="cal-grid">${cells.join('')}</div></div>
      ${sec(new Date(C.sel + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }), items.length)}
      ${!items.length ? '<div class="card empty">Nothing scheduled.</div>' : ''}
      ${pItems.length ? `<ul class="list card">${pItems.map((e) => personRow(e.p, e.kind === 'bday' ? st(C.sel === t ? 'amber' : 'gray', 'Birthday') : st(e.cls, e.cls === 'red' ? dueInfo(e.p).label : 'Check-in due'))).join('')}</ul>` : ''}
      ${fuItems.length ? `<div style="margin-top:${pItems.length ? 8 : 0}px">${fuList(fuItems, '')}</div>` : ''}`;
    $view.querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => { C.sel = b.dataset.day; draw(); }));
    document.getElementById('calPrev').onclick = () => { C.m -= 1; if (C.m < 0) { C.m = 11; C.y -= 1; } draw(); };
    document.getElementById('calNext').onclick = () => { C.m += 1; if (C.m > 11) { C.m = 0; C.y += 1; } draw(); };
    document.getElementById('calToday').onclick = () => { C.y = +t.slice(0, 4); C.m = +t.slice(5, 7) - 1; C.sel = t; draw(); };
    bindFollowups(renderCalendar);
  };
  draw();
}

// ---------- person (panel) ----------
async function renderPerson(id) {
  const [p, fus, ints] = await Promise.all([
    q(sb.from('people').select('*').eq('id', id).single()),
    q(sb.from('follow_ups').select('*').eq('person_id', id).order('status').order('created_at', { ascending: false })),
    q(sb.from('interactions').select('*').eq('person_id', id).order('happened_at', { ascending: false }).order('created_at', { ascending: false })),
  ]);
  panelHead({ kicker: [p.tier ? `Tier ${p.tier}` : 'No tier', ...(p.circles || [])].join(' · '), title: p.name,
    actions: `<a class="pill" href="#/p/${p.id}/edit">Edit</a>` });
  const d = dueInfo(p);
  const open = fus.filter((f) => f.status === 'open'), parked = fus.filter((f) => f.status === 'parked'), closed = fus.filter((f) => f.status === 'closed');
  const facts = [
    ['Role', [p.role, p.dept, p.org].filter(Boolean).join(' · ')], ['Relationship', p.relationship],
    ['Circles', (p.circles || []).join(', ')], ['Birthday', bday(p)],
    ['Last contact', p.last_contact ? `${fmtDate(p.last_contact)} (${ago(p.last_contact)})` : ''],
    ['Cadence', p.cadence_days ? `every ${p.cadence_days} days${d ? ' · ' + d.label : ''}` : ''],
    ['Phone', p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : '', true],
    ['Email', p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '', true],
    ['Location', p.location], ['How met', p.how_met], ['Also', (p.aliases || []).join(', ')], ['Tenure', p.tenure === 'vet' ? '5+ years' : p.tenure],
  ].filter((f) => f[1]);
  const root = $pBody;
  root.innerHTML = `
    <div class="p-hero"><span class="av lg">${esc(initials(p.name))}</span>
      <div class="main"><div class="sub">${esc(p.role || p.relationship || '')}</div><div style="margin-top:4px">${personStatus(p) || st('ring', p.last_contact ? `Last contact ${ago(p.last_contact)}` : 'No cadence')}</div></div></div>
    ${facts.length ? `<dl class="facts">${facts.map(([k, v, raw]) => `<dt>${k}</dt><dd>${raw ? v : esc(v)}</dd>`).join('')}</dl>` : ''}

    <div class="actions" style="margin-top:14px">
      <button class="btn primary" id="logBtn">Log interaction</button>
      <button class="btn" id="fuBtn">Add follow-up</button>
    </div>
    <div id="formSlot"></div>

    ${sec('Follow-ups', open.length + parked.length)}
    <div class="card">${open.length || parked.length ? `<ul class="list">${[...open, ...parked].map((f) => fuItem({ ...f, person: null })).join('')}</ul>` : '<div class="empty">None open.</div>'}
      ${closed.length ? `<details class="more"><summary>${closed.length} done</summary><ul class="list">${closed.map((f) => fuItem({ ...f, person: null })).join('')}</ul></details>` : ''}</div>

    ${sec('History', ints.length)}
    <div class="card">${ints.length ? `<ul class="list">${ints.map((i) => `<li class="fu"><div class="main"><span class="t">${esc(i.summary)}</span>
      <span class="meta">${monoDate(i.happened_at)} · ${esc(i.kind)}${i.duration_min ? ` · ${i.duration_min} min` : ''}</span></div></li>`).join('')}</ul>` : '<div class="empty">No interactions logged yet.</div>'}</div>

    ${sec('Notes')}
    <div class="card">${p.notes ? `<div class="notes">${md(p.notes)}</div>` : '<div class="empty">No notes.</div>'}
      ${p.muse_notes ? `<details class="more"><summary>Muse's notes</summary><div class="notes">${md(p.muse_notes.replace(/^---[\s\S]*?---\s*/, ''))}</div></details>` : ''}</div>`;

  bindFollowups(() => renderPerson(id), root);
  const slot = document.getElementById('formSlot');
  document.getElementById('logBtn').onclick = () => {
    slot.innerHTML = `<form class="card form" id="lf" style="margin-top:12px">
      <div class="grid2"><div><label class="lbl">Type</label><select class="field" id="k">${KINDS.map((k) => `<option>${k}</option>`).join('')}</select></div>
      <div><label class="lbl">Date</label><input class="field" type="date" id="dt" value="${today()}" max="${today()}"></div></div>
      <label class="lbl">What happened</label><textarea class="field" id="sm" required placeholder="Real conversation only: what was said, what you learned"></textarea>
      <label class="lbl">Minutes (optional)</label><input class="field" id="dm" inputmode="numeric">
      <div class="actions" style="margin-top:14px"><button class="btn primary">Save</button><button type="button" class="btn" id="cx">Cancel</button></div></form>`;
    document.getElementById('cx').onclick = () => (slot.innerHTML = '');
    document.getElementById('lf').onsubmit = async (e) => {
      e.preventDefault(); e.submitter && (e.submitter.disabled = true);
      const dm = parseInt(document.getElementById('dm').value, 10);
      await q(sb.from('interactions').insert({ person_id: id, kind: document.getElementById('k').value, happened_at: document.getElementById('dt').value,
        summary: document.getElementById('sm').value.trim(), duration_min: Number.isFinite(dm) ? dm : null }));
      toast('Logged ✓'); state.people = null; renderPerson(id);
    };
    document.getElementById('sm').focus();
  };
  document.getElementById('fuBtn').onclick = () => {
    slot.innerHTML = `<form class="card form" id="ff" style="margin-top:12px">
      <label class="lbl">Follow-up</label><input class="field" id="ft" required placeholder="What needs to happen">
      <label class="lbl">Due date (only if you actually have one)</label><input class="field" type="date" id="fd">
      <div class="actions" style="margin-top:14px"><button class="btn primary">Add</button><button type="button" class="btn" id="cx">Cancel</button></div></form>`;
    document.getElementById('cx').onclick = () => (slot.innerHTML = '');
    document.getElementById('ff').onsubmit = async (e) => {
      e.preventDefault(); e.submitter && (e.submitter.disabled = true);
      await q(sb.from('follow_ups').insert({ person_id: id, title: document.getElementById('ft').value.trim(), due_date: document.getElementById('fd').value || null }));
      toast('Added ✓'); renderPerson(id);
    };
    document.getElementById('ft').focus();
  };
}

// ---------- add / edit person (panel) ----------
async function renderEdit(id) {
  const people = await loadPeople();
  const p = id ? await q(sb.from('people').select('*').eq('id', id).single()) : { circles: [] };
  panelHead({ kicker: id ? 'Edit record' : 'New record', title: id ? p.name : 'New person' });
  const allCircles = [...new Set(['Family', 'Friend', 'Mohawk Honda', 'Business', 'Social Media', 'Household', 'Leadership', ...people.flatMap((x) => x.circles || [])])].sort();
  const sel = new Set(p.circles || []);
  const inp = (key, label, type = 'text', extra = '') => `<label class="lbl" for="e_${key}">${label}</label><input class="field" id="e_${key}" type="${type}" value="${esc(p[key] ?? '')}" ${extra}>`;
  const root = $pBody;
  root.innerHTML = `<form class="card form" id="ef">
    ${inp('name', 'Name', 'text', 'required')}
    <label class="lbl">Tier</label><div class="pills" id="tierSeg" style="flex-wrap:wrap">${['', ...TIERS].map((t) => `<button type="button" class="pill ${(p.tier || '') === t ? 'on' : ''}" data-t="${t}">${t ? `Tier ${t}` : 'None'}</button>`).join('')}</div>
    <label class="lbl">Circles</label><div class="pills" style="flex-wrap:wrap">${allCircles.map((c) => `<button type="button" class="pill ${sel.has(c) ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="grid2">
      <div>${inp('relationship', 'Relationship')}</div><div>${inp('role', 'Role')}</div>
      <div>${inp('dept', 'Dept')}</div><div>${inp('org', 'Org')}</div>
      <div>${inp('phone', 'Phone', 'tel')}</div><div>${inp('email', 'Email', 'email')}</div>
      <div>${inp('location', 'Location')}</div><div>${inp('cadence_days', 'Cadence · days', 'number', 'min="1" placeholder="None"')}</div>
    </div>
    <label class="lbl">Birthday · year only if you know it</label>
    <div class="grid3"><input class="field" id="e_bm" placeholder="Month" inputmode="numeric" value="${esc(p.birth_month ?? '')}">
      <input class="field" id="e_bd" placeholder="Day" inputmode="numeric" value="${esc(p.birth_day ?? '')}">
      <input class="field" id="e_by" placeholder="Year" inputmode="numeric" value="${esc(p.birth_year ?? '')}"></div>
    ${inp('how_met', 'How you met')}
    <label class="lbl" for="e_notes">Notes</label><textarea class="field" id="e_notes" style="min-height:${id ? 220 : 120}px">${esc(p.notes ?? '')}</textarea>
    <div class="actions" style="margin-top:16px"><button class="btn primary">${id ? 'Save' : 'Add person'}</button>
      ${id ? '<button type="button" class="btn danger" id="arch" style="margin-left:auto">Archive</button>' : ''}</div>
  </form>`;
  let tier = p.tier || '';
  root.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { tier = b.dataset.t; root.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); }));
  root.querySelectorAll('[data-c]').forEach((c) => (c.onclick = () => { sel.has(c.dataset.c) ? sel.delete(c.dataset.c) : sel.add(c.dataset.c); c.classList.toggle('on'); }));
  const v = (k) => document.getElementById('e_' + k).value.trim() || null;
  const n = (k) => { const x = parseInt(document.getElementById('e_' + k).value, 10); return Number.isFinite(x) ? x : null; };
  document.getElementById('ef').onsubmit = async (e) => {
    e.preventDefault();
    const name = v('name');
    if (!id && people.some((x) => x.name.toLowerCase() === (name || '').toLowerCase() || (x.aliases || []).some((a) => a.toLowerCase() === (name || '').toLowerCase()))) {
      toast(`${name} is already in your network`, true); return;
    }
    const row = { name, tier: tier || null, circles: [...sel], relationship: v('relationship'), role: v('role'), dept: v('dept'), org: v('org'),
      phone: v('phone'), email: v('email'), location: v('location'), cadence_days: n('cadence_days'), how_met: v('how_met'), notes: v('notes'),
      birth_month: n('bm'), birth_day: n('bd'), birth_year: n('by') };
    e.submitter && (e.submitter.disabled = true);
    try {
      const saved = id ? await q(sb.from('people').update(row).eq('id', id).select('id').single())
        : await q(sb.from('people').insert(row).select('id').single());
      state.people = null; toast('Saved ✓'); location.replace('#/p/' + saved.id);
    } catch { e.submitter && (e.submitter.disabled = false); }
  };
  if (id) document.getElementById('arch').onclick = async () => {
    if (!document.getElementById('arch').dataset.sure) { document.getElementById('arch').dataset.sure = 1; document.getElementById('arch').textContent = 'Tap again to archive'; return; }
    await q(sb.from('people').update({ archived_at: new Date().toISOString() }).eq('id', id));
    state.people = null; toast('Archived'); location.hash = '#/people';
  };
}

// ---------- password (panel) ----------
function renderPassword() {
  panelHead({ kicker: 'Account', title: 'Password' });
  const email = state.session?.user?.email || '';
  const root = $pBody;
  root.innerHTML = `<form class="card form" id="pf">
    <p class="hint" style="margin-top:12px">Set a password so signing in on a new device (or after signing out) is one tap with Face ID instead of an email link. Let your iPhone suggest a strong password and save it.</p>
    <label class="lbl">Account</label><input type="email" name="username" autocomplete="username" value="${esc(email)}" readonly class="field">
    <label class="lbl">New password</label>${pwField('np', 'new-password', 'new-password', 'At least 8 characters', 'required minlength="8"')}
    <p class="hint">Tap Show to check it before saving.</p>
    <div class="actions" style="margin-top:16px"><button class="btn primary">Save password</button></div></form>`;
  bindEyes(root);
  document.getElementById('pf').onsubmit = async (e) => {
    e.preventDefault(); e.submitter && (e.submitter.disabled = true);
    const { error } = await sb.auth.updateUser({ password: document.getElementById('np').value });
    if (error) { toast(error.message, true); e.submitter && (e.submitter.disabled = false); return; }
    toast('Password saved ✓'); location.hash = '#/today';
  };
}

// ---------- router ----------
const BASE = { '#/today': renderToday, '#/people': renderPeople, '#/overdue': renderOverdue, '#/followups': renderFollowups, '#/calendar': renderCalendar };
function panelRoute(h) {
  let m;
  if ((m = h.match(/^#\/p\/([0-9a-f-]{36})\/edit$/))) return () => renderEdit(m[1]);
  if ((m = h.match(/^#\/p\/([0-9a-f-]{36})$/))) return () => renderPerson(m[1]);
  if (h === '#/new') return () => renderEdit(null);
  if (h === '#/password') return () => renderPassword();
  return null;
}
async function route() {
  if (!state.session) { closePanel(); state.baseRendered = false; return renderLogin(); }
  const h = location.hash || '#/today';
  const pr = panelRoute(h);
  try {
    if (pr) {
      if (!state.baseRendered) { await BASE[state.base](); state.baseRendered = true; }
      openPanel(); await pr();
    } else {
      const next = BASE[h] ? h : '#/today';
      if (next !== state.base) window.scrollTo(0, 0);
      state.base = next; closePanel();
      await BASE[next](); state.baseRendered = true;
    }
  } catch (e) {
    console.error(e);
    (pr ? $pBody : $view).innerHTML = `<div class="empty">Couldn't load that. ${esc(e.message || '')}</div>`;
  }
}
window.addEventListener('hashchange', route);

sb.auth.onAuthStateChange((_evt, session) => {
  const was = !!state.session; state.session = session;
  if (!!session !== was) { state.people = null; route(); }
});
const { data } = await sb.auth.getSession();
state.session = data.session;
route();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
