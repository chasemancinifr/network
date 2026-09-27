// Person panel: full record view + add/edit form.

import { sb, q, loadPeople, personTasks } from './db.js';
import { $pBody, panelHead, st, monoDate, initials, personStatus, sec, toast } from './ui.js';
import { today, fmtDate, ago, dayOf, bday, dueInfo, md, esc } from './utils.js';
import { state, TIERS, KINDS } from './config.js';
import { fuItem, bindFollowups } from './followups.js';
import { taskList, bindTasks, openTaskForm } from './tasks.js';
import { evList, bindEvents, openEventForm, editEvent } from './events.js';

// ---------- person (panel) ----------
export async function renderPerson(id) {
  const [p, fus, ints, pevs, ptasks] = await Promise.all([
    q(sb.from('people').select('*').eq('id', id).single()),
    q(sb.from('follow_ups').select('*').eq('person_id', id).order('status').order('created_at', { ascending: false })),
    q(sb.from('interactions').select('*').eq('person_id', id).order('happened_at', { ascending: false }).order('created_at', { ascending: false })),
    q(sb.from('events').select('id,title,event_date,event_time,notes,person_id').eq('person_id', id).gte('event_date', today()).order('event_date').order('event_time')),
    personTasks(id),
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
  const last = ints[0];
  const lastD = last && last.happened_at ? dayOf(last.happened_at) : null;
  root.innerHTML = `
    <div class="p-hero"><span class="av lg">${esc(initials(p.name))}</span>
      <div class="main"><div class="sub">${esc(p.role || p.relationship || '')}</div><div style="margin-top:4px">${personStatus(p) || st('ring', p.last_contact ? `Last contact ${ago(p.last_contact)}` : 'No cadence')}</div></div></div>
    ${last ? `<div class="card recap">
      <div class="recap-head"><span>Last interaction</span><span class="mono">${lastD ? `${monoDate(lastD)} · ${ago(lastD)}` : 'Undated'}</span></div>
      <div class="recap-body">${st('amber', last.kind)}${last.duration_min ? `<span class="meta">${last.duration_min} min</span>` : ''}${last.summary ? `<p>${esc(last.summary)}</p>` : ''}</div>
    </div>` : ''}
    ${facts.length ? `<dl class="facts">${facts.map(([k, v, raw]) => `<dt>${k}</dt><dd>${raw ? v : esc(v)}</dd>`).join('')}</dl>` : ''}

    <div class="actions" style="margin-top:14px">
      <button class="btn primary" id="logBtn">Log interaction</button>
      <button class="btn" id="fuBtn">Add follow-up</button>
      <button class="btn" id="taskBtn">Add task</button>
      <button class="btn" id="evBtn">Add event</button>
    </div>
    <div id="formSlot"></div>

    ${sec('Follow-ups', open.length + parked.length)}
    <div class="card">${open.length || parked.length ? `<ul class="list">${[...open, ...parked].map((f) => fuItem({ ...f, person: null })).join('')}</ul>` : '<div class="empty">None open.</div>'}
      ${closed.length ? `<details class="more"><summary>${closed.length} done</summary><ul class="list">${closed.map((f) => fuItem({ ...f, person: null })).join('')}</ul></details>` : ''}</div>

    ${sec('Tasks', ptasks.length)}
    ${taskList(ptasks.map((x) => ({ ...x, person: null })), 'None open.')}

    ${sec('Upcoming events', pevs.length)}
    ${evList(pevs, 'None scheduled.', true)}

    ${sec('History', ints.length)}
    <div class="card">${ints.length ? `<ul class="list">${ints.map((i) => `<li class="fu"><div class="main"><span class="t">${esc(i.summary)}</span>
      <span class="meta">${monoDate(i.happened_at)} · ${esc(i.kind)}${i.duration_min ? ` · ${i.duration_min} min` : ''}</span></div></li>`).join('')}</ul>` : '<div class="empty">No interactions logged yet.</div>'}</div>

    ${sec('Notes')}
    <div class="card">${p.notes ? `<div class="notes">${md(p.notes)}</div>` : '<div class="empty">No notes.</div>'}
      ${p.muse_notes ? `<details class="more"><summary>Muse's notes</summary><div class="notes">${md(p.muse_notes.replace(/^---[\s\S]*?---\s*/, ''))}</div></details>` : ''}</div>`;

  bindFollowups(() => renderPerson(id), root);
  bindTasks(() => renderPerson(id), root);
  const slot = document.getElementById('formSlot');
  bindEvents(() => renderPerson(id), root, (eid) => editEvent(eid, slot, () => renderPerson(id)));
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
  document.getElementById('evBtn').onclick = async () => {
    const people = await loadPeople();
    openEventForm(slot, { personId: id, people, onDone: () => renderPerson(id) });
  };
  document.getElementById('taskBtn').onclick = async () => {
    const people = await loadPeople();
    openTaskForm(slot, { personId: id, people, onDone: () => renderPerson(id) });
  };
}

// ---------- add / edit person (panel) ----------
export async function renderEdit(id) {
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
