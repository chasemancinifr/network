// Scheduled events: dated things on the calendar (birthday party, dinner,
// flight). Deliberately separate from follow-ups, which are action items.

import { sb, q, loadPeople, withArchivedPerson, attachAttendees, syncEventAttendees, seriesSiblings, scopeRows, shiftSeriesDate, applyRepeatChange } from './db.js';
import { $view, st, monoDate, toast, closePanel, repeatField, seriesScopeField, seriesNote, openSeriesDeletePanel, personPicker, bindPersonPickers, peopleMultiField, parseRepeat } from './ui.js';
import { esc, today, fmtTime, addDays, addMonths } from './utils.js';
import { state } from './config.js';

export function evItem(e, showDate = false) {
  const folks = e.attendees?.length ? e.attendees : (e.person ? [e.person] : []);
  const who = folks.map((p) => `<a href="#/p/${p.id}">${esc(p.name)}</a>`).join(', ');
  const when = [showDate ? monoDate(e.event_date) : null, e.event_time ? fmtTime(e.event_time) : null].filter(Boolean).join(' · ');
  return `<li class="fu ev"><div class="main"><span class="t">${esc(e.title)}</span><span class="meta">${st('amber', 'Event')}${when ? `<span>${esc(when)}</span>` : ''}${who ? `<span>${who}</span>` : ''}${e.notes ? `<span>${esc(e.notes)}</span>` : ''}</span></div><button class="btn small" data-ev-edit="${e.id}">Edit</button><button class="btn small danger" data-ev-del="${e.id}">Delete</button></li>`;
}
export const evList = (evs, empty, showDate = false) => `<div class="card">${evs.length ? `<ul class="list">${evs.map((e) => evItem(e, showDate)).join('')}</ul>` : `<div class="empty">${empty}</div>`}</div>`;
export function bindEvents(rerender, root = $view, onEdit) {
  root.querySelectorAll('[data-ev-del]').forEach((b) => (b.onclick = async () => {
    if (!b.dataset.sure) {
      if (state.hasSeries) {
        const { data: r } = await sb.from('events').select('id,series_id,series_rule,series_index').eq('id', b.dataset.evDel).single();
        if (r && r.series_id) {
          const sibs = await seriesSiblings('events', r.series_id);
          if (sibs.length > 1) {
            openSeriesDeletePanel({
              kicker: 'Delete event', title: 'Delete repeating event?',
              note: `This is part of a ${parseRepeat(r.series_rule).label} series (${sibs.length} events).`,
              onScope: async (scope) => {
                if (!scope) return;
                for (const s of scopeRows(sibs, r.series_index, scope)) await q(sb.from('events').delete().eq('id', s.id));
                closePanel(); toast('Deleted'); rerender();
              },
            });
            return;
          }
        }
      }
      b.dataset.sure = 1; b.textContent = 'Sure?'; return;
    }
    b.disabled = true; await q(sb.from('events').delete().eq('id', b.dataset.evDel));
    toast('Deleted'); rerender();
  }));
  root.querySelectorAll('[data-ev-edit]').forEach((b) => (b.onclick = () => onEdit && onEdit(b.dataset.evEdit)));
}
// shared add/edit event form; renders into `slot`, calls onDone after save
export async function openEventForm(slot, { ev = null, personId = null, date = today(), people, onDone }) {
  if (ev?.person_id) people = await withArchivedPerson(people, ev.person_id);
  for (const a of ev?.attendees || []) people = await withArchivedPerson(people, a.id);
  const rep = repeatField(ev?.series_rule || 'none');
  const siblings = ev && ev.series_id ? await seriesSiblings('events', ev.series_id) : [];
  const isSeries = siblings.length > 1;
  const scp = isSeries ? seriesScopeField(seriesNote(ev.series_rule, ev.series_index, siblings.length)) : null;
  // multi-person picker once the 0006 table exists; searchable single picker until then
  const mp = state.hasEventPeople ? peopleMultiField({ people, selectedIds: ev ? (ev.attendees || []).map((a) => a.id) : (personId ? [personId] : []) }) : null;
  slot.innerHTML = `<form class="card form" id="evf" style="margin-top:12px">
    <label class="lbl">Event</label><input class="field" id="evt" required placeholder="What's happening" maxlength="120" value="${esc(ev?.title ?? '')}">
    <div class="grid2">
      <div><label class="lbl">Date</label><input class="field" type="date" id="evd" value="${esc(ev?.event_date ?? date)}" required></div>
      <div><label class="lbl">Time (optional)</label><input class="field" type="time" id="evh" value="${esc(String(ev?.event_time ?? '').slice(0, 5))}"></div>
    </div>
    ${ev ? (scp ? scp.html : '') : ''}
    ${rep.html}
    ${mp ? mp.html : `<div>${personPicker({ id: 'evp', people, selected: String(ev?.person_id ?? personId ?? ''), label: 'Person (optional)' })}</div>`}
    <label class="lbl">Notes (optional)</label><textarea class="field" id="evn" style="min-height:70px">${esc(ev?.notes ?? '')}</textarea>
    <div class="actions" style="margin-top:14px"><button class="btn primary">${ev ? 'Save' : 'Add event'}</button><button type="button" class="btn" id="evx">Cancel</button></div></form>`;
  document.getElementById('evx').onclick = () => (slot.innerHTML = '');
  rep.bind(slot);
  if (scp) scp.bind(slot);
  if (mp) mp.bind(slot); else bindPersonPickers(slot);
  document.getElementById('evf').onsubmit = async (e) => {
    e.preventDefault(); e.submitter && (e.submitter.disabled = true);
    const personIds = mp ? mp.get() : [document.getElementById('evp').value].filter(Boolean);
    const row = { title: document.getElementById('evt').value.trim(), event_date: document.getElementById('evd').value,
      event_time: document.getElementById('evh').value || null, person_id: personIds[0] || null,
      notes: document.getElementById('evn').value.trim() || null };
    try {
      if (!ev) {
        const r = rep.get();
        if (r.k === 'none') {
          const ins = await q(sb.from('events').insert(row).select('id'));
          await syncEventAttendees(ins.map((x) => x.id), personIds);
          toast('Event added ✓');
        } else {
          const sid = state.hasSeries ? crypto.randomUUID() : null;
          const ins = await q(sb.from('events').insert(Array.from({ length: r.n }, (_, i) => ({ ...row,
            event_date: shiftSeriesDate(r.k, row.event_date, i),
            ...(sid ? { series_id: sid, series_rule: r.k, series_index: i } : {}) }))).select('id'));
          await syncEventAttendees(ins.map((x) => x.id), personIds);
          toast(`${r.n} ${r.label.toLowerCase()} events added ✓`);
        }
      } else {
        const r = rep.get();
        const oldRule = ev.series_rule || null;
        if (r.k === (oldRule || 'none')) {
          if (!scp || scp.get() === 'one') {
            await q(sb.from('events').update(row).eq('id', ev.id));
            await syncEventAttendees([ev.id], personIds);
            toast('Saved ✓');
          } else {
            const targets = scopeRows(siblings, ev.series_index, scp.get());
            for (const s of targets) {
              await q(sb.from('events').update({ ...row, event_date: shiftSeriesDate(ev.series_rule, row.event_date, s.series_index - ev.series_index) }).eq('id', s.id));
            }
            await syncEventAttendees(targets.map((s) => s.id), personIds);
            toast(`Updated ${targets.length} events ✓`);
          }
        } else {
          // Frequency changed: regenerate the affected rows under the new rule,
          // then put the attendees on whichever rows the rebuild produced.
          const msg = await applyRepeatChange({ table: 'events', row, newRule: r.k, oldRule, siblings, selfId: ev.id, selfIndex: ev.series_index, scope: scp ? scp.get() : 'one' });
          const selfNow = await q(sb.from('events').select('id,series_id,series_index').eq('id', ev.id).maybeSingle());
          let ids = [ev.id];
          if (selfNow?.series_id) {
            const sibs2 = await seriesSiblings('events', selfNow.series_id);
            const scope = scp ? scp.get() : 'one';
            ids = !ev.series_id || scope === 'all' ? sibs2.map((s) => s.id)
              : scope === 'following' ? sibs2.filter((s) => s.series_index >= ev.series_index).map((s) => s.id)
              : [selfNow.id];
          }
          await syncEventAttendees(ids, personIds);
          toast(msg);
        }
      }
      slot.innerHTML = ''; onDone();
    } catch { e.submitter && (e.submitter.disabled = false); }
  };
  document.getElementById('evt').focus();
}
export async function editEvent(id, slot, onDone) {
  const [ev, people] = await Promise.all([
    q(sb.from('events').select('id,title,event_date,event_time,notes,person_id' + (state.hasSeries ? ',series_id,series_rule,series_index' : '')).eq('id', id).single()),
    loadPeople(),
  ]);
  await attachAttendees([ev]);
  openEventForm(slot, { ev, people, onDone });
  slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
