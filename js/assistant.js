// Assistant: the AI relationship-manager layer.
// - suggestions: drafted by the daily Claude run (and Muse), shown on the
//   Dashboard. Chase texts / copies them, marks them sent (logs a real
//   interaction) or dismisses them.
// - signals: what's new with a person, mostly fed by Muse from Facebook /
//   Instagram. Shown on the person page and used as the reason behind
//   compliment / congrats suggestions.
// Both tables came with the assistant migrations (Oct 23 2026); the app hides
// all of this until the probe finds them.

import { sb, q, loadPeople, withArchivedPerson, shiftSeriesDate } from './db.js';
import { st, toast, monoDate, sec, $pBody, openPanel, panelHead, dismissPanel, categoryField, importanceField, repeatField, personPicker, bindPersonPickers } from './ui.js';
import { esc, today } from './utils.js';
import { state } from './config.js';

export async function probeAssistant() {
  try {
    const { error } = await Promise.race([
      sb.from('suggestions').select('id').limit(1),
      new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), 6000)),
    ]);
    state.hasAssistant = !error;
  } catch { state.hasAssistant = false; }
  return state.hasAssistant;
}

export const SUG_KINDS = {
  message: 'Message', compliment: 'Compliment', congrats: 'Congrats', invite: 'Invite',
  gift: 'Gift idea', birthday: 'Birthday', check_in: 'Check in', other: 'Idea',
};
// kinds where "Sent" means a real message went out, so it is logged as an interaction
const SENDABLE = new Set(['message', 'compliment', 'congrats', 'invite', 'birthday', 'check_in']);

export async function loadSuggestions() {
  if (!state.hasAssistant) return [];
  const { data, error } = await sb.from('suggestions')
    .select('id,kind,title,message,reason,for_date,priority,status,created_by,person_id,person:people(id,name,phone),signal:signals(source,url)')
    .eq('status', 'new')
    .order('priority', { ascending: true })
    .order('for_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) return [];
  // expired: dated suggestions more than 2 days past their date fall away
  const cutoff = new Date(Date.now() - 2 * 86400000).toLocaleDateString('en-CA');
  return (data || []).filter((s) => !s.for_date || s.for_date >= cutoff);
}

// only http(s) links from stored data ever become hrefs
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');
// iOS Messages: sms:<number>&body=<text>
const smsHref = (phone, body) => `sms:${String(phone).replace(/[^\d+]/g, '')}&body=${encodeURIComponent(body || '')}`;

function whenLabel(d) {
  if (!d) return '';
  const t = today();
  if (d === t) return st('amber', 'Today');
  if (d < t) return st('red', monoDate(d));
  return st('gray', monoDate(d));
}

export function sugItem(s) {
  const who = s.person ? `<a href="#/p/${s.person.id}">${esc(s.person.name)}</a>` : '';
  const src = s.signal && safeUrl(s.signal.url) ? `<a href="${esc(safeUrl(s.signal.url))}" target="_blank" rel="noopener">${esc(s.signal.source)} post</a>` : '';
  const text = s.message ? `<div class="sug-msg">${esc(s.message)}</div>` : '';
  const canText = s.message && s.person && s.person.phone;
  const btns = [
    canText ? `<a class="btn small primary" href="${smsHref(s.person.phone, s.message)}" data-sug-text="${s.id}">Text</a>` : '',
    s.message ? `<button class="btn small" data-sug-copy="${s.id}">Copy</button>` : '',
    `<button class="btn small" data-sug-done="${s.id}">${SENDABLE.has(s.kind) && s.person ? 'Sent ✓' : 'Done ✓'}</button>`,
    `<button class="mini" data-sug-dismiss="${s.id}">Dismiss</button>`,
  ].join('');
  return `<li class="fu sug" data-sug="${s.id}"><div class="main">
    <span class="t"><a href="#/s/${s.id}">${esc(s.title)}</a></span>
    <span class="meta"><span class="typebadge">${esc(SUG_KINDS[s.kind] || 'Idea')}</span>${whenLabel(s.for_date)}${who ? `<span>${who}</span>` : ''}${src ? `<span>${src}</span>` : ''}</span>
    ${s.reason ? `<span class="sug-why">${esc(s.reason)}</span>` : ''}
    ${text}
    <div class="sug-btns">${btns}</div>
  </div></li>`;
}

// Dashboard block. `limit` items, then "Show all".
export function assistantBlock(rows, limit = 5) {
  if (!state.hasAssistant) return '';
  const head = sec('Assistant', rows.length);
  if (!rows.length) return `${head}<div class="card empty">No suggestions right now. The assistant refreshes once a day.</div>`;
  const first = rows.slice(0, limit), rest = rows.slice(limit);
  return `${head}<div class="card"><ul class="list">${first.map(sugItem).join('')}</ul>
    ${rest.length ? `<details class="more"><summary>${rest.length} more</summary><ul class="list">${rest.map(sugItem).join('')}</ul></details>` : ''}</div>`;
}

// Reply loop: after a sent message, leave a +7 day check so the thread
// doesn't die one-and-done. Its own failure never blocks the Sent action.
const firstName = (n) => String(n || 'them').replace(/\(.*?\)/g, ' ').trim().split(/\s+/)[0] || 'them';
const plusDays = (d, n) => { const dt = new Date(`${d}T00:00:00`); dt.setDate(dt.getDate() + n); return dt.toLocaleDateString('en-CA'); };
async function replyLoop(s, message) {
  if (!s.person_id) return;
  try {
    await q(sb.from('follow_ups').insert({ person_id: s.person_id, status: 'open',
      title: `Did ${firstName(s.person ? s.person.name : '')} reply?`,
      detail: message ? `Sent: ${message}` : s.title, due_date: plusDays(today(), 7) }));
  } catch { toast('Sent logged, but the reply check did not save', true); }
}

export function bindAssistant(rows, rerender, root) {
  if (!state.hasAssistant) return;
  const byId = Object.fromEntries(rows.map((s) => [s.id, s]));
  const close = async (id, status) => q(sb.from('suggestions').update({ status, acted_at: new Date().toISOString() }).eq('id', id));
  root.querySelectorAll('[data-sug-copy]').forEach((b) => (b.onclick = async () => {
    const s = byId[b.dataset.sugCopy];
    try { await navigator.clipboard.writeText(s.message); toast('Copied'); } catch { toast('Copy failed: long-press the text instead', true); }
  }));
  root.querySelectorAll('[data-sug-done]').forEach((b) => (b.onclick = async () => {
    const s = byId[b.dataset.sugDone];
    b.disabled = true;
    try {
      // a sent message is real contact: log it so last_contact moves
      if (SENDABLE.has(s.kind) && s.person_id) {
        await q(sb.from('interactions').insert({ person_id: s.person_id, kind: 'message', happened_at: today(), summary: s.message ? `Sent: ${s.message}` : s.title }));
        state.people = null;
        await replyLoop(s, s.message);
      }
      await close(s.id, 'done');
      toast(SENDABLE.has(s.kind) && s.person_id ? 'Logged as a message ✓' : 'Done ✓');
      rerender();
    } catch { b.disabled = false; }
  }));
  root.querySelectorAll('[data-sug-dismiss]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await close(b.dataset.sugDismiss, 'dismissed'); toast('Dismissed'); rerender(); } catch { b.disabled = false; }
  }));
}

// ---------- suggestion panel: tap in, edit, schedule as task / follow-up ----------
export async function renderSuggestion(id) {
  if (!state.hasAssistant) return;
  openPanel();
  let s;
  try {
    s = await q(sb.from('suggestions')
      .select('id,kind,title,message,reason,for_date,priority,status,person_id,person:people(id,name,phone),signal:signals(source,url)')
      .eq('id', id).single());
  } catch { $pBody.innerHTML = '<div class="empty">That suggestion is gone.</div>'; return; }
  if (!s) return;
  const people = await withArchivedPerson(await loadPeople(), s.person_id);
  const who = s.person ? s.person.name : 'Assistant';
  panelHead({ kicker: who, title: 'Suggestion' });
  const cat = categoryField(null);
  const imp = importanceField(null);
  const rep = repeatField();
  const src = s.signal && safeUrl(s.signal.url) ? `<div class="sug-why">Source: <a href="${esc(safeUrl(s.signal.url))}" target="_blank" rel="noopener">${esc(s.signal.source)} post</a></div>` : '';
  const canText = s.message && s.person && s.person.phone;
  $pBody.innerHTML = `
  <form class="card form" id="sgf">
    <label class="lbl" for="sg_kind">Kind</label>
    <select class="field" id="sg_kind">${Object.entries(SUG_KINDS).map(([k, v]) => `<option value="${k}"${s.kind === k ? ' selected' : ''}>${v}</option>`).join('')}</select>
    <label class="lbl" for="sg_title">Title</label><input class="field" id="sg_title" required value="${esc(s.title)}">
    <label class="lbl" for="sg_msg">Message</label><textarea class="field" id="sg_msg" style="min-height:90px" placeholder="The drafted text">${esc(s.message || '')}</textarea>
    <label class="lbl" for="sg_reason">Why now</label><textarea class="field" id="sg_reason" style="min-height:56px">${esc(s.reason || '')}</textarea>
    ${src}
    <div class="grid2"><div><label class="lbl" for="sg_for">For date</label><input class="field" id="sg_for" type="date" value="${esc(s.for_date || '')}"></div>
    <div><label class="lbl">Priority</label><div class="pills" id="sgPri">${[[1, 'High'], [2, 'Normal'], [3, 'Low']].map(([n, l]) => `<button type="button" class="pill${(s.priority || 2) === n ? ' on' : ''}" data-p="${n}">${l}</button>`).join('')}</div></div></div>
    <div class="actions" style="margin-top:14px"><button class="btn primary">Save edits</button><button type="button" class="btn" id="sg_cancel">Cancel</button></div>
  </form>
  <div class="card form" style="margin-top:12px">
    <div class="lbl" style="margin-top:0">Schedule as a task or follow-up</div>
    <div class="grid2"><div><label class="lbl" for="sg_due">Due date</label><input class="field" id="sg_due" type="date" value="${esc(s.for_date || '')}"></div>
    <div>${personPicker({ id: 'sg_person', people, selected: s.person_id || '', label: 'Person (needed for a follow-up)' })}</div></div>
    ${rep.html}
    ${cat.html}
    ${imp.html}
    <div class="actions" style="margin-top:14px"><button type="button" class="btn primary" id="sg_task">Add as task</button><button type="button" class="btn primary" id="sg_fu">Add as follow-up</button></div>
  </div>
  <div class="card" style="margin-top:12px"><div class="sug-btns">
    ${canText ? `<a class="btn small primary" href="${smsHref(s.person.phone, s.message)}">Text</a>` : ''}
    ${s.message ? `<button class="btn small" id="sg_copy">Copy</button>` : ''}
    <button class="btn small" id="sg_done">${SENDABLE.has(s.kind) && s.person_id ? 'Sent ✓' : 'Done ✓'}</button>
    <button class="mini" id="sg_dismiss">Dismiss</button>
  </div></div>`;
  let priority = s.priority || 2;
  $pBody.querySelectorAll('#sgPri [data-p]').forEach((b) => (b.onclick = () => { priority = Number(b.dataset.p); $pBody.querySelectorAll('#sgPri [data-p]').forEach((x) => x.classList.toggle('on', x === b)); }));
  cat.bind($pBody); imp.bind($pBody); rep.bind($pBody); bindPersonPickers($pBody);
  const closeSug = async (status) => q(sb.from('suggestions').update({ status, acted_at: new Date().toISOString() }).eq('id', s.id));
  document.getElementById('sg_cancel').onclick = () => dismissPanel();
  document.getElementById('sgf').onsubmit = async (e) => {
    e.preventDefault(); e.submitter && (e.submitter.disabled = true);
    try {
      await q(sb.from('suggestions').update({
        kind: document.getElementById('sg_kind').value,
        title: document.getElementById('sg_title').value.trim(),
        message: document.getElementById('sg_msg').value.trim() || null,
        reason: document.getElementById('sg_reason').value.trim() || null,
        for_date: document.getElementById('sg_for').value || null,
        priority,
      }).eq('id', s.id));
      toast('Saved ✓'); dismissPanel();
    } catch { e.submitter && (e.submitter.disabled = false); }
  };
  const schedule = async (table, hasSeriesFlag) => {
    const title = document.getElementById('sg_title').value.trim();
    const msg = document.getElementById('sg_msg').value.trim();
    const reason = document.getElementById('sg_reason').value.trim();
    const pid = document.getElementById('sg_person').value || null;
    if (table === 'follow_ups' && !pid) { toast('Follow-ups need a person — pick one first', true); return; }
    const due = document.getElementById('sg_due').value || null;
    const r = rep.get();
    if (r.k !== 'none' && !due) { toast('Pick a due date for a repeating item'); return; }
    const row = { title, detail: [msg, reason ? `Why: ${reason}` : ''].filter(Boolean).join('\n\n') || null, due_date: due, person_id: pid };
    if (state.hasCategory) row.category = cat.get();
    if (state.hasImportance) row.importance = imp.get();
    try {
      if (r.k === 'none') { await q(sb.from(table).insert(row)); }
      else {
        const sid = hasSeriesFlag ? crypto.randomUUID() : null;
        await q(sb.from(table).insert(Array.from({ length: r.n }, (_, i) => ({ ...row,
          due_date: shiftSeriesDate(r.k, due, i),
          ...(sid ? { series_id: sid, series_rule: r.k, series_index: i } : {}) }))));
      }
      await closeSug('done');
      toast(table === 'tasks' ? 'Task created ✓' : 'Follow-up created ✓');
      dismissPanel();
    } catch { toast('Could not schedule that', true); }
  };
  document.getElementById('sg_task').onclick = (e) => { e.currentTarget.disabled = true; schedule('tasks', state.hasSeries).finally(() => { const b = document.getElementById('sg_task'); if (b) b.disabled = false; }); };
  document.getElementById('sg_fu').onclick = (e) => { e.currentTarget.disabled = true; schedule('follow_ups', state.hasFuSeries).finally(() => { const b = document.getElementById('sg_fu'); if (b) b.disabled = false; }); };
  const copyBtn = document.getElementById('sg_copy');
  if (copyBtn) copyBtn.onclick = async () => { try { await navigator.clipboard.writeText(document.getElementById('sg_msg').value); toast('Copied'); } catch { toast('Copy failed: long-press the text instead', true); } };
  document.getElementById('sg_done').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try {
      if (SENDABLE.has(s.kind) && s.person_id) {
        const msg = document.getElementById('sg_msg').value.trim();
        await q(sb.from('interactions').insert({ person_id: s.person_id, kind: 'message', happened_at: today(), summary: msg ? `Sent: ${msg}` : document.getElementById('sg_title').value.trim() }));
        state.people = null;
        await replyLoop(s, msg);
      }
      await closeSug('done'); toast('Done ✓'); dismissPanel();
    } catch { b.disabled = false; }
  };
  document.getElementById('sg_dismiss').onclick = async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try { await closeSug('dismissed'); toast('Dismissed'); dismissPanel(); } catch { b.disabled = false; }
  };
}

// ---------- person page: what's new + suggestions for this person ----------
export async function personAssistant(id) {
  if (!state.hasAssistant) return { signals: [], sugs: [] };
  const [sig, sugs] = await Promise.all([
    sb.from('signals').select('id,source,kind,summary,url,observed_on').eq('person_id', id).order('observed_on', { ascending: false }).limit(8),
    sb.from('suggestions').select('id,kind,title,message,reason,for_date,priority,status,created_by,person_id,person:people(id,name,phone),signal:signals(source,url)')
      .eq('person_id', id).eq('status', 'new').order('priority'),
  ]);
  return { signals: sig.error ? [] : sig.data, sugs: sugs.error ? [] : sugs.data };
}

export function signalsBlock(signals) {
  if (!state.hasAssistant) return '';
  return `${sec("What's new", signals.length)}<div class="card">${signals.length ? `<ul class="list">${signals.map((g) => `<li class="fu"><div class="main">
    <span class="t">${esc(g.summary)}</span>
    <span class="meta">${st('gray', monoDate(g.observed_on))}<span class="typebadge">${esc(g.source)}</span>${safeUrl(g.url) ? `<a href="${esc(safeUrl(g.url))}" target="_blank" rel="noopener">Open</a>` : ''}</span>
  </div></li>`).join('')}</ul>` : '<div class="empty">Nothing yet. Muse adds updates from Facebook and Instagram.</div>'}</div>`;
}

// socials jsonb → links
const SOCIAL_URL = {
  instagram: (h) => `https://instagram.com/${h.replace(/^@/, '')}`,
  tiktok: (h) => `https://www.tiktok.com/@${h.replace(/^@/, '')}`,
  facebook: (h) => (/^https?:/i.test(h) ? h : `https://facebook.com/${h}`),
  linkedin: (h) => (/^https?:/i.test(h) ? h : `https://www.linkedin.com/in/${h}`),
};
export function socialLinks(socials) {
  const s = socials || {};
  return Object.keys(SOCIAL_URL).filter((k) => s[k]).map((k) => {
    const v = String(s[k]).trim();
    const url = safeUrl(/^https?:/i.test(v) ? v : SOCIAL_URL[k](v));
    if (!url) return '';
    return `<a href="${esc(url)}" target="_blank" rel="noopener">${k[0].toUpperCase() + k.slice(1)}</a>`;
  }).filter(Boolean).join(' · ');
}
export const SOCIAL_KEYS = Object.keys(SOCIAL_URL);
