// Follow-ups: person-centric nudges. Rows, bindings, editor, next-touch prompts.

import { sb, q, loadPeople } from './db.js';
import { $pBody, $view, openPanel, panelHead, closePanel, dismissPanel, st, monoDate, toast } from './ui.js';
import { esc, today, daysBetween, upcomingBirthdays } from './utils.js';

export function fuStatus(f) {
  const t = today();
  if (f.status === 'closed') return st('ring', f.completed_at ? `Done ${monoDate(f.completed_at)}` : 'Done');
  if (f.status === 'parked') return st('gray', 'Parked');
  if (!f.due_date) return st('ring', 'Open');
  if (f.due_date < t) return st('red', `Overdue · ${monoDate(f.due_date)}`);
  if (f.due_date === t) return st('amber', 'Today');
  return st('gray', monoDate(f.due_date));
}
export function fuItem(f, sub = '') {
  const who = f.person ? `<a href="#/p/${f.person.id}">${esc(f.person.name)}</a>` : '';
  const ctl = f.status === 'open'
    ? `<button class="check" data-done="${f.id}" aria-label="Mark done" title="Mark done"></button>`
    : `<button class="btn small" data-reopen="${f.id}">Reopen</button>`;
  const park = f.status === 'open' ? `<button class="btn small" data-park="${f.id}">Park</button>` : '';
  return `<li class="fu ${f.status}">${ctl}<div class="main"><button class="t tlink" data-fu-edit="${f.id}">${esc(f.title)}</button><span class="meta">${fuStatus(f)}${who ? `<span>${who}</span>` : ''}</span>${sub}</div>${park}</li>`;
}
export function bindFollowups(rerender, root = $view) {
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
  root.querySelectorAll('[data-fu-edit]').forEach((b) => (b.onclick = () => editFollowup(b.dataset.fuEdit, rerender)));
}
export const fuList = (fus, empty, sub = () => '') => `<div class="card">${fus.length ? `<ul class="list">${fus.map((f) => fuItem(f, sub(f))).join('')}</ul>` : `<div class="empty">${empty}</div>`}</div>`;

// suggested next-touch prompt: one concrete message starter built from the
// person's real data. Picked deterministically per person (stable per render),
// from four styles: casual check-in, value drop, question about their world,
// warm re-entry. A birthday inside 3 weeks always wins.
export function nextTouch(p, last) {
  const first = String(p.name || 'them').split(' ')[0];
  const days = p.last_contact ? daysBetween(p.last_contact, today()) : null;
  const when = days == null ? 'a while' : days <= 1 ? 'a day or two' : `${days} days`;
  const bd = p.birth_month ? upcomingBirthdays([p], 21)[0] : null;
  if (bd) return `Hey ${first} — your birthday's ${bd.in <= 1 ? 'right around the corner' : `in ${bd.in} days`}. Let's grab coffee to celebrate?`;
  const cands = [`Hey ${first} — it's been ${when}. What's new on your end?`];
  if (p.org) cands.push(`Hey ${first}, how are things at ${p.org}?`);
  else if (p.role) cands.push(`Hey ${first}, how's the ${String(p.role).toLowerCase()} world treating you lately?`);
  else if ((p.circles || []).length) cands.push(`Hey ${first}, been thinking about the ${(p.circles || [])[0]} crew — how have you been?`);
  if (last && last.summary) cands.push(`Hey ${first} — last we talked was about ${last.summary.slice(0, 70).trim()}… would love to catch up properly.`);
  else if (last) cands.push(`Hey ${first} — been ${when} since our last ${last.kind}. Let's not let it go that long again.`);
  if (p.org) cands.push(`Came across something about ${p.org} I thought you'd like — want me to send it over?`);
  else cands.push(`${first}, saw something I think you'd get a kick out of — want me to pass it along?`);
  const h = [...String(p.id)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return cands[h % cands.length];
}
export const ntouch = (text) => `<div class="ntouch"><span class="nt-k">Next touch</span><span>${esc(text)}</span></div>`;

// ---------- edit follow-up (panel) ----------
export async function editFollowup(fuId, rerender) {
  const f = await q(sb.from('follow_ups').select('id,title,detail,due_date,status,person_id').eq('id', fuId).single());
  if (!f) return;
  const people = await loadPeople();
  openPanel();
  const who = people.find((p) => p.id === f.person_id);
  panelHead({ kicker: who ? who.name : 'Follow-up', title: 'Edit follow-up' });
  const root = $pBody;
  root.innerHTML = `<form class="card form" id="fef">
    <label class="lbl" for="fe_title">Title</label><input class="field" id="fe_title" required value="${esc(f.title)}">
    <div class="grid2"><div><label class="lbl" for="fe_due">Due date</label><input class="field" id="fe_due" type="date" value="${esc(f.due_date || '')}"></div>
    <div><label class="lbl" for="fe_person">Person</label><select class="field" id="fe_person">${people.map((p) => `<option value="${p.id}"${p.id === f.person_id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div></div>
    <label class="lbl" for="fe_detail">Detail (optional)</label><textarea class="field" id="fe_detail" style="min-height:90px" placeholder="Anything extra — context, what 'done' looks like">${esc(f.detail || '')}</textarea>
    <label class="lbl">Status</label><div class="pills" id="feStatus">${['open', 'parked', 'closed'].map((s) => `<button type="button" class="pill${f.status === s ? ' on' : ''}" data-s="${s}">${s}</button>`).join('')}</div>
    <div class="actions" style="margin-top:16px"><button class="btn primary">Save</button><button type="button" class="btn" id="fe_cancel">Cancel</button></div></form>`;
  let status = f.status;
  root.querySelectorAll('#feStatus [data-s]').forEach((b) => (b.onclick = () => { status = b.dataset.s; root.querySelectorAll('#feStatus [data-s]').forEach((x) => x.classList.toggle('on', x === b)); }));
  document.getElementById('fe_cancel').onclick = () => dismissPanel();
  document.getElementById('fef').onsubmit = async (e) => {
    e.preventDefault(); e.submitter && (e.submitter.disabled = true);
    const row = { title: document.getElementById('fe_title').value.trim(), detail: document.getElementById('fe_detail').value.trim() || null,
      due_date: document.getElementById('fe_due').value || null, person_id: document.getElementById('fe_person').value, status };
    if (status === 'closed' && f.status !== 'closed') row.completed_at = new Date().toISOString();
    if (status !== 'closed' && f.status === 'closed') row.completed_at = null;
    try { await q(sb.from('follow_ups').update(row).eq('id', fuId)); toast('Saved ✓'); closePanel(); rerender(); }
    catch { e.submitter && (e.submitter.disabled = false); }
  };
  document.getElementById('fe_title').focus();
}
