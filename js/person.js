// Person panel: full record view + add/edit form.

import { sb, q, loadPeople, personTasks, buildActionMap, attachAttendees } from './db.js';
import { $pBody, panelHead, st, monoDate, initials, personStatus, sec, toast, categoryField, importanceField, actDot } from './ui.js';
import { today, fmtDate, ago, dayOf, bday, dueInfo, md, esc, titleCase } from './utils.js';
import { state, TIERS, KINDS, RELS, FAMILY_ROLES } from './config.js';
import { avStyle } from './colors.js';
import { fuItem, bindFollowups } from './followups.js';
import { taskList, bindTasks, openTaskForm } from './tasks.js';
import { evList, bindEvents, openEventForm, editEvent } from './events.js';
import { editInteraction } from './pages.js';
import { personAssistant, signalsBlock, sugItem, bindAssistant, socialLinks, SOCIAL_KEYS } from './assistant.js';

// ---------- person (panel) ----------
export async function renderPerson(id) {
  const [p, fus, ints, pevs, ptasks, pa] = await Promise.all([
    q(sb.from('people').select('*').eq('id', id).single()),
    q(sb.from('follow_ups').select('*').eq('person_id', id).order('status').order('created_at', { ascending: false })),
    q(sb.from('interactions').select('*').eq('person_id', id).order('happened_at', { ascending: false }).order('created_at', { ascending: false })),
    q(sb.from('events').select('id,title,event_date,event_time,notes,person_id').eq('person_id', id).gte('event_date', today()).order('event_date').order('event_time')),
    personTasks(id),
    personAssistant(id),
  ]);
  // events where this person is a co-attendee (not the primary) count too
  let allEvs = pevs;
  if (state.hasEventPeople) {
    const links = await q(sb.from('event_people').select('event_id').eq('person_id', id));
    const have = new Set(pevs.map((e) => e.id));
    const extraIds = [...new Set(links.map((l) => l.event_id))].filter((x) => !have.has(x));
    if (extraIds.length) {
      const extra = await q(sb.from('events').select('id,title,event_date,event_time,notes,person_id').in('id', extraIds).gte('event_date', today()));
      allEvs = [...pevs, ...extra].sort((a, b) => (a.event_date === b.event_date ? String(a.event_time || '').localeCompare(String(b.event_time || '')) : (a.event_date < b.event_date ? -1 : 1)));
    }
    await attachAttendees(allEvs);
    // on their own page, list the OTHER attendees as the "who"
    allEvs = allEvs.map((e) => ({ ...e, attendees: (e.attendees || []).filter((a) => a.id !== id) }));
  }
  panelHead({ kicker: [p.tier ? `Tier ${p.tier}` : 'No tier', ...(p.circles || [])].join(' · '), title: p.name,
    actions: `<a class="pill" href="#/p/${p.id}/edit">Edit</a>` });
  const d = dueInfo(p);
  const open = fus.filter((f) => f.status === 'open'), parked = fus.filter((f) => f.status === 'parked'), closed = fus.filter((f) => f.status === 'closed');
  const myActs = buildActionMap(open, ptasks)[id];
  const facts = [
    ['Role', [p.role, p.dept, p.org].filter(Boolean).join(' · ')], ['Relationship', p.relationship],
    ['Circles', (p.circles || []).join(', ')], ['Interests', (p.interests || []).join(', ')], ['Birthday', bday(p)],
    ['Last contact', p.last_contact ? `${fmtDate(p.last_contact)} (${ago(p.last_contact)})` : ''],
    ['Cadence', p.cadence_days ? `every ${p.cadence_days} days${d ? ' · ' + d.label : ''}` : ''],
    ['Phone', p.phone ? `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>` : '', true],
    ['Email', p.email ? `<a href="mailto:${esc(p.email)}">${esc(p.email)}</a>` : '', true],
    ['Socials', socialLinks(p.socials), true],
    ['Location', p.location], ['How met', p.how_met], ['Also', (p.aliases || []).join(', ')], ['Tenure', p.tenure === 'vet' ? '5+ years' : p.tenure],
  ].filter((f) => f[1]);
  const root = $pBody;
  const last = ints[0];
  const lastD = last && last.happened_at ? dayOf(last.happened_at) : null;
  root.innerHTML = `
    <div class="p-hero"><span class="av lg" style="${avStyle(p.relationship)}">${esc(initials(p.name))}</span>
      <div class="main"><div class="sub">${esc(p.role || p.relationship || '')}${actDot(myActs)}</div><div style="margin-top:4px">${personStatus(p) || st('ring', p.last_contact ? `Last contact ${ago(p.last_contact)}` : 'No cadence')}</div></div></div>
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

    ${pa.sugs.length ? `${sec('Assistant', pa.sugs.length)}<div class="card"><ul class="list">${pa.sugs.map(sugItem).join('')}</ul></div>` : ''}

    ${sec('Follow-ups', open.length + parked.length)}
    <div class="card">${open.length || parked.length ? `<ul class="list">${[...open, ...parked].map((f) => fuItem({ ...f, person: null })).join('')}</ul>` : '<div class="empty">None open.</div>'}
      ${closed.length ? `<details class="more"><summary>${closed.length} done</summary><ul class="list">${closed.map((f) => fuItem({ ...f, person: null })).join('')}</ul></details>` : ''}</div>

    ${sec('Tasks', ptasks.length)}
    ${taskList(ptasks.map((x) => ({ ...x, person: null })), 'None open.')}

    ${sec('Upcoming events', allEvs.length)}
    ${evList(allEvs, 'None scheduled.', true)}

    ${signalsBlock(pa.signals)}

    ${sec('History', ints.length)}
    <div class="card">${ints.length ? `<ul class="list">${ints.map((i) => `<li class="fu"><div class="main"><span class="t">${esc(i.summary)}</span>
      <span class="meta">${monoDate(i.happened_at)} · ${esc(i.kind)}${i.duration_min ? ` · ${i.duration_min} min` : ''}</span></div><button class="mini" data-int-edit="${i.id}">Edit</button></li>`).join('')}</ul>` : '<div class="empty">No interactions logged yet.</div>'}</div>

    ${sec('Notes')}
    <div class="card">${p.notes ? `<div class="notes">${md(p.notes)}</div>` : '<div class="empty">No notes.</div>'}
      ${p.muse_notes ? `<details class="more"><summary>Muse's notes</summary><div class="notes">${md(p.muse_notes.replace(/^---[\s\S]*?---\s*/, ''))}</div></details>` : ''}</div>`;

  bindFollowups(() => renderPerson(id), root);
  bindTasks(() => renderPerson(id), root);
  bindAssistant(pa.sugs, () => renderPerson(id), root);
  root.querySelectorAll('[data-int-edit]').forEach((b) => (b.onclick = () => editInteraction(b.dataset.intEdit, () => renderPerson(id))));
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
      try {
        await q(sb.from('interactions').insert({ person_id: id, kind: document.getElementById('k').value, happened_at: document.getElementById('dt').value,
          summary: document.getElementById('sm').value.trim(), duration_min: Number.isFinite(dm) ? dm : null }));
        toast('Logged ✓'); state.people = null; renderPerson(id);
      } catch { e.submitter && (e.submitter.disabled = false); }
    };
    document.getElementById('sm').focus();
  };
  document.getElementById('fuBtn').onclick = () => {
    const cat = categoryField(null);
    const imp = importanceField(null);
    slot.innerHTML = `<form class="card form" id="ff" style="margin-top:12px">
      <label class="lbl">Follow-up</label><input class="field" id="ft" required placeholder="What needs to happen">
      <label class="lbl">Due date (only if you actually have one)</label><input class="field" type="date" id="fd">
      ${cat.html}
      ${imp.html}
      <div class="actions" style="margin-top:14px"><button class="btn primary">Add</button><button type="button" class="btn" id="cx">Cancel</button></div></form>`;
    document.getElementById('cx').onclick = () => (slot.innerHTML = '');
    cat.bind(slot); imp.bind(slot);
    document.getElementById('ff').onsubmit = async (e) => {
      e.preventDefault(); e.submitter && (e.submitter.disabled = true);
      const row = { person_id: id, title: document.getElementById('ft').value.trim(), due_date: document.getElementById('fd').value || null };
      if (state.hasCategory) row.category = cat.get();
      if (state.hasImportance) row.importance = imp.get();
      try { await q(sb.from('follow_ups').insert(row)); toast('Added ✓'); renderPerson(id); }
      catch { e.submitter && (e.submitter.disabled = false); }
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
  const allCircles = [...new Set(['Family', 'Family Friend', 'Friend', 'Mohawk Honda', 'Business', 'Customers', 'Social Media', 'Household', 'Leadership', ...people.flatMap((x) => x.circles || [])])].sort();
  const sel = new Set(p.circles || []);
  // relationship stays free text; suggestions = standard values + everything already used
  const relSuggest = [...new Set([...RELS, ...FAMILY_ROLES, ...people.map((x) => (x.relationship || '').trim()).filter(Boolean)])].sort();
  const inp = (key, label, type = 'text', extra = '') => `<label class="lbl" for="e_${key}">${label}</label><input class="field" id="e_${key}" type="${type}" value="${esc(p[key] ?? '')}" ${extra}>`;
  const root = $pBody;
  root.innerHTML = `<form class="card form" id="ef">
    ${inp('name', 'Name', 'text', 'required')}
    <label class="lbl">Tier</label><div class="pills" id="tierSeg" style="flex-wrap:wrap">${['', ...TIERS].map((t) => `<button type="button" class="pill ${(p.tier || '') === t ? 'on' : ''}" data-t="${t}">${t ? `Tier ${t}` : 'None'}</button>`).join('')}</div>
    <label class="lbl">Circles</label><div class="pills" style="flex-wrap:wrap">${allCircles.map((c) => `<button type="button" class="pill ${sel.has(c) ? 'on' : ''}" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <div class="grid2">
      <div>${inp('relationship', 'Relationship', 'text', 'list="relList" autocomplete="off" placeholder="Type anything, e.g. Uncle on dad\u2019s side"')}<datalist id="relList">${relSuggest.map((r) => `<option value="${esc(r)}">`).join('')}</datalist></div><div>${inp('role', 'Role')}</div>
      <div>${inp('dept', 'Dept')}</div><div>${inp('org', 'Org')}</div>
      <div>${inp('phone', 'Phone', 'tel')}</div><div>${inp('email', 'Email', 'email')}</div>
      <div>${inp('location', 'Location')}</div><div>${inp('cadence_days', 'Cadence · days', 'number', 'min="1" placeholder="None"')}</div>
    </div>
    <label class="lbl">Birthday · year only if you know it</label>
    <div class="grid3"><input class="field" id="e_bm" placeholder="Month" inputmode="numeric" value="${esc(p.birth_month ?? '')}">
      <input class="field" id="e_bd" placeholder="Day" inputmode="numeric" value="${esc(p.birth_day ?? '')}">
      <input class="field" id="e_by" placeholder="Year" inputmode="numeric" value="${esc(p.birth_year ?? '')}"></div>
    ${inp('how_met', 'How you met')}
    <label class="lbl" for="e_interests">Interests · comma separated</label><input class="field" id="e_interests" value="${esc((p.interests || []).join(', '))}" placeholder="e.g. cars, volleyball, Yankees, real estate">
    <label class="lbl">Socials · handle or link</label>
    <div class="grid2">${SOCIAL_KEYS.map((k) => `<div><input class="field" id="e_so_${k}" placeholder="${k[0].toUpperCase() + k.slice(1)}" value="${esc((p.socials || {})[k] ?? '')}" autocomplete="off" autocapitalize="off"></div>`).join('')}</div>
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
    if (people.some((x) => x.id !== id && (x.name.toLowerCase() === (name || '').toLowerCase() || (x.aliases || []).some((a) => a.toLowerCase() === (name || '').toLowerCase())))) {
      toast(`${name} is already in your network`, true); return;
    }
    const bm = n('bm'), bd = n('bd'), by = n('by'), cad = n('cadence_days');
    if (bm !== null && (bm < 1 || bm > 12)) { toast('Birthday month must be 1–12', true); return; }
    if (bd !== null && (bd < 1 || bd > 31)) { toast('Birthday day must be 1–31', true); return; }
    if (bd !== null && bm === null) { toast('Birthday day needs a month too', true); return; }
    if (by !== null && (by < 1900 || by > +today().slice(0, 4))) { toast('Birthday year looks off', true); return; }
    if (cad !== null && cad < 1) { toast('Cadence must be at least 1 day', true); return; }
    const row = { name, tier: tier || null, circles: [...sel], relationship: titleCase(v('relationship')) || null, role: v('role'), dept: v('dept'), org: v('org'),
      phone: v('phone'), email: v('email'), location: v('location'), cadence_days: cad, how_met: v('how_met'), notes: v('notes'),
      birth_month: bm, birth_day: bd, birth_year: by };
    if (state.hasAssistant) {
      const seen = new Set();
      row.interests = document.getElementById('e_interests').value.split(',').map((x) => x.trim()).filter((x) => x && !seen.has(x.toLowerCase()) && seen.add(x.toLowerCase()));
      // keep any socials keys the form doesn't show (e.g. written by Muse)
      const so = { ...(p.socials || {}) };
      SOCIAL_KEYS.forEach((k) => { const val = document.getElementById('e_so_' + k).value.trim(); if (val) so[k] = val; else delete so[k]; });
      row.socials = so;
    }
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
