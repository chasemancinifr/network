import { createClient } from './supabase.js';
import { marked } from './marked.js';
import DOMPurify from './purify.js';

const SUPABASE_URL = 'https://afmuodzloooetmlyqxmr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_ifWhRQP70qDA4tHBy6_AKg_3phy0aFo'; // public key; data is protected by login + row-level security
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

const TIERS = ['A', 'B', 'C', 'D'];
const KINDS = ['conversation', 'call', 'message', 'meeting'];
const $view = document.getElementById('view');
const $title = document.getElementById('title');
const $back = document.getElementById('back');
const $add = document.getElementById('addPersonBtn');
const $tabs = document.getElementById('tabs');

const state = { people: null, session: null, peopleFilter: { q: '', tiers: new Set(), circle: null }, fuTab: 'open' };

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
  return { overdue: left <= 0, label: left <= 0 ? `${-left}d overdue` : `due in ${left}d` };
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
function chrome({ title, back = false, tab = null, add = false }) {
  $title.textContent = title; $back.hidden = !back; $add.hidden = !add; $tabs.hidden = !state.session;
  document.querySelectorAll('.tabs a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  document.title = title === 'Network' ? 'Network' : `${title} · Network`;
}
$back.onclick = () => (history.length > 1 ? history.back() : (location.hash = '#/people'));
$add.onclick = () => (location.hash = '#/new');

async function loadPeople(force) {
  if (state.people && !force) return state.people;
  state.people = await q(sb.from('people')
    .select('id,name,aliases,tier,circles,relationship,org,dept,role,last_contact,cadence_days,birth_month,birth_day,birth_year')
    .is('archived_at', null).order('name'));
  return state.people;
}
const personRow = (p, extra = '') => `
  <li><a class="row" href="#/p/${p.id}">
    <span class="tier ${esc(p.tier)}">${esc(p.tier || '–')}</span>
    <span class="main"><div class="name">${esc(p.name)}</div>
      <div class="sub">${esc([p.role, p.dept].filter(Boolean).join(' · ') || p.relationship || (p.circles || []).join(', '))}</div></span>
    ${extra}</a></li>`;

// ---------- login ----------
function renderLogin(step = 'email', email = '') {
  chrome({ title: 'Network' });
  $view.innerHTML = step === 'email' ? `
    <div class="login">
      <h3>Your network</h3><p>Sign in with your email. You'll get a sign-in link.</p>
      <form id="f"><input class="field" type="email" id="email" required autocomplete="email" placeholder="you@email.com" value="${esc(email)}">
      <button class="btn primary" id="go">Send link</button></form>
    </div>` : `
    <div class="login">
      <h3>Check your email</h3><p>We sent a sign-in link to<br><b>${esc(email)}</b></p>
      <p style="font-size:14px">In a browser: just tap the link.<br>In the home-screen app: long-press the link in the email, tap <b>Copy Link</b>, and paste it here.</p>
      <form id="f"><input class="field" id="code" required placeholder="Paste link (or code)" autocomplete="one-time-code">
      <button class="btn primary" id="go">Sign in</button></form>
      <p><a href="#" id="again">Use a different email</a></p>
    </div>`;
  const f = document.getElementById('f');
  if (step === 'email') {
    f.onsubmit = async (e) => {
      e.preventDefault(); const em = document.getElementById('email').value.trim();
      document.getElementById('go').disabled = true;
      const { error } = await sb.auth.signInWithOtp({ email: em, options: { shouldCreateUser: true, emailRedirectTo: location.origin + location.pathname } });
      if (error) { toast(error.message, true); document.getElementById('go').disabled = false; return; }
      renderLogin('code', em);
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

// ---------- today ----------
async function renderToday() {
  chrome({ title: 'Today', tab: 'today', add: true });
  const [people, fus] = await Promise.all([
    loadPeople(),
    q(sb.from('follow_ups').select('id,title,due_date,status,created_at,person:people(id,name,tier)').eq('status', 'open')
      .order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })),
  ]);
  const overdue = people.map((p) => ({ p, d: dueInfo(p) })).filter((x) => x.d && x.d.overdue);
  const upcoming = people.map((p) => ({ p, d: dueInfo(p) })).filter((x) => x.d && !x.d.overdue);
  const t = today(); const y = +t.slice(0, 4);
  const bdays = people.filter((p) => p.birth_month).map((p) => {
    let d = `${y}-${String(p.birth_month).padStart(2, '0')}-${String(p.birth_day).padStart(2, '0')}`;
    if (d < t) d = `${y + 1}` + d.slice(4);
    return { p, in: daysBetween(t, d) };
  }).filter((x) => x.in <= 21).sort((a, b) => a.in - b.in);

  $view.innerHTML = `
    <h2>Reach out (${overdue.length})</h2>
    ${overdue.length ? `<ul class="list card">${overdue.map((x) => personRow(x.p, `<span class="badge bad">${esc(x.d.label)}</span>`)).join('')}</ul>` : '<div class="card empty">Nobody overdue. Nice.</div>'}
    ${bdays.length ? `<h2>Birthdays · next 3 weeks</h2><ul class="list card">${bdays.map((x) => personRow(x.p, `<span class="badge ${x.in <= 3 ? 'warn' : ''}">${x.in === 0 ? 'today' : x.in === 1 ? 'tomorrow' : `in ${x.in}d`}</span>`)).join('')}</ul>` : ''}
    <h2>Open follow-ups (${fus.length})</h2>
    <div class="card">${fus.length ? `<ul class="list">${fus.map(fuItem).join('')}</ul>` : '<div class="empty">All clear.</div>'}</div>
    ${upcoming.length ? `<h2>On cadence</h2><ul class="list card">${upcoming.map((x) => personRow(x.p, `<span class="badge">${esc(x.d.label)}</span>`)).join('')}</ul>` : ''}
    <p style="text-align:center;margin-top:28px"><a href="#" id="signout" style="color:var(--muted);font-size:14px">Sign out</a></p>`;
  bindFollowups(renderToday);
  document.getElementById('signout').onclick = async (e) => { e.preventDefault(); await sb.auth.signOut(); };
}

// ---------- follow-ups ----------
function fuItem(f) {
  const who = f.person ? `<a href="#/p/${f.person.id}">${esc(f.person.name)}</a>` : '';
  const due = f.due_date ? `${who ? ' · ' : ''}<span style="color:${f.due_date < today() ? 'var(--bad)' : 'var(--warn)'}">due ${fmtDate(f.due_date)}</span>` : '';
  const ctl = f.status === 'open'
    ? `<button class="check" data-done="${f.id}" aria-label="Mark done" title="Done"></button>`
    : `<button class="btn small" data-reopen="${f.id}">Reopen</button>`;
  const park = f.status === 'open' ? `<button class="btn small" data-park="${f.id}">Park</button>` : '';
  return `<li class="fu">${ctl}<div class="main">${esc(f.title)}<div class="meta">${who}${due}${f.status === 'closed' && f.completed_at ? `${who || due ? ' · ' : ''}done ${fmtDate(f.completed_at)}` : ''}</div></div>${park}</li>`;
}
function bindFollowups(rerender) {
  $view.querySelectorAll('[data-done]').forEach((b) => (b.onclick = async () => {
    b.disabled = true; await q(sb.from('follow_ups').update({ status: 'closed', completed_at: new Date().toISOString() }).eq('id', b.dataset.done));
    toast('Done ✓'); rerender();
  }));
  $view.querySelectorAll('[data-park]').forEach((b) => (b.onclick = async () => {
    b.disabled = true; await q(sb.from('follow_ups').update({ status: 'parked' }).eq('id', b.dataset.park)); toast('Parked'); rerender();
  }));
  $view.querySelectorAll('[data-reopen]').forEach((b) => (b.onclick = async () => {
    b.disabled = true; await q(sb.from('follow_ups').update({ status: 'open', completed_at: null }).eq('id', b.dataset.reopen)); toast('Reopened'); rerender();
  }));
}
async function renderFollowups() {
  chrome({ title: 'Follow-ups', tab: 'followups', add: true });
  const s = state.fuTab;
  let qq = sb.from('follow_ups').select('id,title,due_date,status,created_at,completed_at,person:people(id,name,tier)').eq('status', s);
  qq = s === 'closed' ? qq.order('completed_at', { ascending: false, nullsFirst: false }).limit(100)
    : qq.order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
  const fus = await q(qq);
  $view.innerHTML = `
    <div class="seg">${['open', 'parked', 'closed'].map((k) => `<button data-seg="${k}" class="${k === s ? 'on' : ''}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div>
    <div class="card" style="margin-top:12px">${fus.length ? `<ul class="list">${fus.map(fuItem).join('')}</ul>` : '<div class="empty">Nothing here.</div>'}</div>`;
  $view.querySelectorAll('[data-seg]').forEach((b) => (b.onclick = () => { state.fuTab = b.dataset.seg; renderFollowups(); }));
  bindFollowups(renderFollowups);
}

// ---------- people ----------
async function renderPeople() {
  chrome({ title: 'People', tab: 'people', add: true });
  const people = await loadPeople();
  const circles = [...new Set(people.flatMap((p) => p.circles || []))].sort();
  const F = state.peopleFilter;
  $view.innerHTML = `
    <input class="search" id="q" type="search" placeholder="Search ${people.length} people" value="${esc(F.q)}" autocomplete="off">
    <div class="filters">${TIERS.map((t) => `<span class="chip ${F.tiers.has(t) ? 'on' : ''}" data-tier="${t}">Tier ${t}</span>`).join('')}</div>
    <div class="filters">${circles.map((c) => `<span class="chip ${F.circle === c ? 'on' : ''}" data-circle="${esc(c)}">${esc(c)}</span>`).join('')}</div>
    <div id="count" class="sub" style="color:var(--muted);font-size:13px;margin:6px 2px"></div>
    <ul class="list card" id="plist"></ul>`;
  const draw = () => {
    const needle = F.q.trim().toLowerCase();
    const rows = people.filter((p) =>
      (!F.tiers.size || F.tiers.has(p.tier)) && (!F.circle || (p.circles || []).includes(F.circle)) &&
      (!needle || [p.name, ...(p.aliases || []), p.role, p.dept, p.relationship].some((s) => (s || '').toLowerCase().includes(needle))));
    document.getElementById('plist').innerHTML = rows.length ? rows.map((p) => {
      const d = dueInfo(p); return personRow(p, d && d.overdue ? '<span class="badge bad">due</span>' : '');
    }).join('') : '<li class="empty">No matches.</li>';
    document.getElementById('count').textContent = rows.length === people.length ? '' : `${rows.length} shown`;
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

// ---------- person ----------
async function renderPerson(id) {
  chrome({ title: '…', back: true });
  const [p, fus, ints] = await Promise.all([
    q(sb.from('people').select('*').eq('id', id).single()),
    q(sb.from('follow_ups').select('*').eq('person_id', id).order('status').order('created_at', { ascending: false })),
    q(sb.from('interactions').select('*').eq('person_id', id).order('happened_at', { ascending: false }).order('created_at', { ascending: false })),
  ]);
  chrome({ title: p.name, back: true });
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
  $view.innerHTML = `
    <div class="card">
      <div class="hero"><span class="tier ${esc(p.tier)}">${esc(p.tier || '–')}</span>
        <div style="flex:1;min-width:0"><h3>${esc(p.name)}</h3><div class="sub" style="color:var(--muted)">${esc(p.role || p.relationship || '')}</div></div>
        <a class="btn small" href="#/p/${p.id}/edit">Edit</a></div>
      <dl class="facts">${facts.map(([k, v, raw]) => `<dt>${k}</dt><dd>${raw ? v : esc(v)}</dd>`).join('')}</dl>
    </div>

    <div class="actions" style="margin-top:12px">
      <button class="btn primary" id="logBtn">Log interaction</button>
      <button class="btn" id="fuBtn">Add follow-up</button>
    </div>
    <div id="formSlot"></div>

    <h2>Follow-ups</h2>
    <div class="card">${open.length || parked.length ? `<ul class="list">${[...open, ...parked].map((f) => fuItem({ ...f, person: null })).join('')}</ul>` : '<div class="empty">None open.</div>'}
      ${closed.length ? `<details class="more"><summary>${closed.length} done</summary><ul class="list">${closed.map((f) => fuItem({ ...f, person: null })).join('')}</ul></details>` : ''}</div>

    <h2>History</h2>
    <div class="card">${ints.length ? `<ul class="list">${ints.map((i) => `<li class="fu"><div class="main">${esc(i.summary)}
      <div class="meta">${fmtDate(i.happened_at)} · ${esc(i.kind)}${i.duration_min ? ` · ${i.duration_min} min` : ''}</div></div></li>`).join('')}</ul>` : '<div class="empty">No interactions logged yet.</div>'}</div>

    <h2>Notes</h2>
    <div class="card">${p.notes ? `<div class="notes">${md(p.notes)}</div>` : '<div class="empty">No notes.</div>'}
      ${p.muse_notes ? `<details class="more"><summary>Muse's notes</summary><div class="notes" style="padding:0">${md(p.muse_notes.replace(/^---[\s\S]*?---\s*/, ''))}</div></details>` : ''}</div>`;

  bindFollowups(() => renderPerson(id));
  const slot = document.getElementById('formSlot');
  document.getElementById('logBtn').onclick = () => {
    slot.innerHTML = `<form class="card form" id="lf" style="margin-top:12px">
      <div class="grid2"><div><label class="lbl">Type</label><select class="field" id="k">${KINDS.map((k) => `<option>${k}</option>`).join('')}</select></div>
      <div><label class="lbl">Date</label><input class="field" type="date" id="dt" value="${today()}" max="${today()}"></div></div>
      <label class="lbl">What happened</label><textarea class="field" id="sm" required placeholder="Real conversation only: what was said, what you learned"></textarea>
      <label class="lbl">Minutes (optional)</label><input class="field" id="dm" inputmode="numeric">
      <div class="actions" style="margin-top:12px"><button class="btn primary">Save</button><button type="button" class="btn" id="cx">Cancel</button></div></form>`;
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
      <div class="actions" style="margin-top:12px"><button class="btn primary">Add</button><button type="button" class="btn" id="cx">Cancel</button></div></form>`;
    document.getElementById('cx').onclick = () => (slot.innerHTML = '');
    document.getElementById('ff').onsubmit = async (e) => {
      e.preventDefault(); e.submitter && (e.submitter.disabled = true);
      await q(sb.from('follow_ups').insert({ person_id: id, title: document.getElementById('ft').value.trim(), due_date: document.getElementById('fd').value || null }));
      toast('Added ✓'); renderPerson(id);
    };
    document.getElementById('ft').focus();
  };
}

// ---------- add / edit person ----------
async function renderEdit(id) {
  const people = await loadPeople();
  const p = id ? await q(sb.from('people').select('*').eq('id', id).single()) : { circles: [] };
  chrome({ title: id ? `Edit ${p.name}` : 'New person', back: true });
  const allCircles = [...new Set(['Family', 'Friend', 'Mohawk Honda', 'Business', 'Social Media', 'Household', 'Leadership', ...people.flatMap((x) => x.circles || [])])].sort();
  const sel = new Set(p.circles || []);
  const inp = (key, label, type = 'text', extra = '') => `<label class="lbl">${label}</label><input class="field" id="e_${key}" type="${type}" value="${esc(p[key] ?? '')}" ${extra}>`;
  $view.innerHTML = `<form class="card form" id="ef">
    ${inp('name', 'Name', 'text', 'required')}
    <label class="lbl">Tier</label><div class="seg" id="tierSeg">${['', ...TIERS].map((t) => `<button type="button" data-t="${t}" class="${(p.tier || '') === t ? 'on' : ''}">${t || '–'}</button>`).join('')}</div>
    <label class="lbl">Circles</label><div>${allCircles.map((c) => `<span class="chip ${sel.has(c) ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</span>`).join('')}</div>
    <div class="grid2">
      <div>${inp('relationship', 'Relationship')}</div><div>${inp('role', 'Role')}</div>
      <div>${inp('dept', 'Dept')}</div><div>${inp('org', 'Org')}</div>
      <div>${inp('phone', 'Phone', 'tel')}</div><div>${inp('email', 'Email', 'email')}</div>
      <div>${inp('location', 'Location')}</div><div>${inp('cadence_days', 'Cadence (days, blank = none)', 'number', 'min="1"')}</div>
    </div>
    <label class="lbl">Birthday (leave year blank unless you know it)</label>
    <div class="grid2" style="grid-template-columns:1fr 1fr 1fr"><input class="field" id="e_bm" placeholder="Month" inputmode="numeric" value="${esc(p.birth_month ?? '')}">
      <input class="field" id="e_bd" placeholder="Day" inputmode="numeric" value="${esc(p.birth_day ?? '')}">
      <input class="field" id="e_by" placeholder="Year" inputmode="numeric" value="${esc(p.birth_year ?? '')}"></div>
    ${inp('how_met', 'How you met')}
    <label class="lbl">Notes</label><textarea class="field" id="e_notes" style="min-height:${id ? 220 : 120}px">${esc(p.notes ?? '')}</textarea>
    <div class="actions" style="margin-top:14px"><button class="btn primary">${id ? 'Save' : 'Add person'}</button>
      ${id ? '<button type="button" class="btn" id="arch" style="margin-left:auto;color:var(--bad)">Archive</button>' : ''}</div>
  </form>`;
  let tier = p.tier || '';
  $view.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { tier = b.dataset.t; $view.querySelectorAll('[data-t]').forEach((x) => x.classList.toggle('on', x === b)); }));
  $view.querySelectorAll('[data-c]').forEach((c) => (c.onclick = () => { sel.has(c.dataset.c) ? sel.delete(c.dataset.c) : sel.add(c.dataset.c); c.classList.toggle('on'); }));
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

// ---------- router ----------
async function route() {
  if (!state.session) return renderLogin();
  const h = location.hash || '#/today';
  window.scrollTo(0, 0);
  try {
    let m;
    if ((m = h.match(/^#\/p\/([0-9a-f-]{36})\/edit$/))) return await renderEdit(m[1]);
    if ((m = h.match(/^#\/p\/([0-9a-f-]{36})$/))) return await renderPerson(m[1]);
    if (h === '#/new') return await renderEdit(null);
    if (h === '#/people') return await renderPeople();
    if (h === '#/followups') return await renderFollowups();
    return await renderToday();
  } catch (e) {
    console.error(e);
    $view.innerHTML = `<div class="empty">Couldn't load that. ${esc(e.message || '')}</div>`;
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
