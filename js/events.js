// Scheduled events: dated things on the calendar (birthday party, dinner,
// flight). Deliberately separate from follow-ups, which are action items.

import { sb, q, loadPeople, seriesSiblings, scopeRows, shiftSeriesDate, applyRepeatChange } from './db.js';
import { $view, st, monoDate, toast, closePanel, repeatField, seriesScopeField, seriesNote, openSeriesDeletePanel } from './ui.js';
import { esc, today, fmtTime, addDays, addMonths } from './utils.js';
import { state } from './config.js';

export function evItem(e, showDate = false) {
  const who = e.person ? `<a href="#/p/${e.person.id}">${esc(e.person.name)}</a>` : '';
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
              note: `This is part of a ${r.series_rule} series (${sibs.length} events).`,
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
  const rep = repeatField(ev?.series_rule || 'none');
  const siblings = ev && ev.series_id ? await seriesSiblings('events', ev.series_id) : [];
  const isSeries = siblings.length > 1;
  const scp = isSeries ? seriesScopeField(seriesNote(ev.series_rule, ev.series_index, siblings.length)) : null;
  slot.innerHTML = `<form class="card form" id="evf" style="margin-top:12px">
    <label class="lbl">Event</label><input class="field" id="evt" required placeholder="What's happening" maxlength="120" value="${esc(ev?.title ?? '')}">
    <div class="grid2">
      <div><label class="lbl">Date</label><input class="field" type="date" id="evd" value="${esc(ev?.event_date ?? date)}" required></div>
      <div><label class="lbl">Time (optional)</label><input class="field" type="time" id="evh" value="${esc(String(ev?.event_time ?? '').slice(0, 5))}"></div>
    </div>
    ${ev ? (scp ? scp.html : '') : ''}
    ${rep.html}
    <label class="lbl">Person (optional)</label>
    <select class="field" id="evp"><option value="">—</option>${people.map((p) => `<option value="${p.id}" ${String(ev?.person_id ?? personId ?? '') === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    <label class="lbl">Notes (optional)</label><textarea class="field" id="evn" style="min-height:70px">${esc(ev?.notes ?? '')}</textarea>
    <div class="actions" style="margin-top:14px"><button class="btn primary">${ev ? 'Save' : 'Add event'}</button><button type="button" class="btn" id="evx">Cancel</button></div></form>`;
  document.getElementById('evx').onclick = () => (slot.innerHTML = '');
  rep.bind(slot);
  if (scp) scp.bind(slot);
  document.getElementById('evf').onsubmit = async (e) => {
    e.preventDefault(); e.submitter && (e.submitter.disabled = true);
    const row = { title: document.getElementById('evt').value.trim(), event_date: document.getElementById('evd').value,
      event_time: document.getElementById('evh').value || null, person_id: document.getElementById('evp').value || null,
      notes: document.getElementById('evn').value.trim() || null };
    try {
      if (!ev) {
        const r = rep.get();
        if (r.k === 'none') { await q(sb.from('events').insert(row)); toast('Event added ✓'); }
        else {
          const sid = state.hasSeries ? crypto.randomUUID() : null;
          await q(sb.from('events').insert(Array.from({ length: r.n }, (_, i) => ({ ...row,
            event_date: shiftSeriesDate(r.k, row.event_date, i),
            ...(sid ? { series_id: sid, series_rule: r.k, series_index: i } : {}) }))));
          toast(`${r.n} ${r.label.toLowerCase()} events added ✓`);
        }
      } else {
        const r = rep.get();
        const oldRule = ev.series_rule || null;
        if (r.k === (oldRule || 'none')) {
          if (!scp || scp.get() === 'one') {
            await q(sb.from('events').update(row).eq('id', ev.id)); toast('Saved ✓');
          } else {
            const targets = scopeRows(siblings, ev.series_index, scp.get());
            for (const s of targets) {
              await q(sb.from('events').update({ ...row, event_date: shiftSeriesDate(ev.series_rule, row.event_date, s.series_index - ev.series_index) }).eq('id', s.id));
            }
            toast(`Updated ${targets.length} events ✓`);
          }
        } else {
          // Frequency changed: regenerate the affected rows under the new rule.
          const msg = await applyRepeatChange({ table: 'events', row, newRule: r.k, oldRule, siblings, selfId: ev.id, selfIndex: ev.series_index, scope: scp ? scp.get() : 'one' });
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
  openEventForm(slot, { ev, people, onDone });
  slot.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
