// Tasks: general to-dos. Follow-ups stay person-centric nudges. A task may
// link a person and may carry a due date — neither is required.

import { sb, q, loadPeople, withArchivedPerson, seriesSiblings, scopeRows, shiftSeriesDate, applyRepeatChange } from './db.js';
import { $pBody, $view, openPanel, panelHead, closePanel, dismissPanel, st, monoDate, toast, categoryField, catBadge, importanceField, impBadge, repeatField, seriesScopeField, seriesNote, openSeriesDeletePanel, personPicker, bindPersonPickers, parseRepeat } from './ui.js';
import { esc, today } from './utils.js';
import { state } from './config.js';

export function taskStatus(t) {
  const d = today();
  if (t.status === 'done') return st('ring', t.completed_at ? `Done ${monoDate(t.completed_at)}` : 'Done');
  if (!t.due_date) return st('ring', 'Open');
  if (t.due_date < d) return st('red', `Overdue · ${monoDate(t.due_date)}`);
  if (t.due_date === d) return st('amber', 'Today');
  return st('gray', monoDate(t.due_date));
}
export function taskItem(t) {
  const who = t.person ? `<a href="#/p/${t.person.id}">${esc(t.person.name)}</a>` : '';
  const ctl = t.status === 'open'
    ? `<button class="check" data-task-done="${t.id}" aria-label="Mark done" title="Mark done"></button>`
    : `<button class="btn small" data-task-reopen="${t.id}">Reopen</button>`;
  return `<li class="fu ${t.status}">${ctl}<div class="main"><button class="t tlink" data-task-edit="${t.id}">${esc(t.title)}</button><span class="meta">${taskStatus(t)}${catBadge(t.category)}${impBadge(t.importance)}${who ? `<span>${who}</span>` : ''}</span></div></li>`;
}
export function bindTasks(rerender, root = $view) {
  root.querySelectorAll('[data-task-done]').forEach((b) => (b.onclick = async () => {
    b.disabled = true; await q(sb.from('tasks').update({ status: 'done', completed_at: new Date().toISOString() }).eq('id', b.dataset.taskDone));
    toast('Done ✓'); rerender();
  }));
  root.querySelectorAll('[data-task-reopen]').forEach((b) => (b.onclick = async () => {
    b.disabled = true; await q(sb.from('tasks').update({ status: 'open', completed_at: null }).eq('id', b.dataset.taskReopen)); toast('Reopened'); rerender();
  }));
  root.querySelectorAll('[data-task-edit]').forEach((b) => (b.onclick = () => editTask(b.dataset.taskEdit, rerender)));
}
export const taskList = (tasks, empty) => `<div class="card">${tasks.length ? `<ul class="list">${tasks.map(taskItem).join('')}</ul>` : `<div class="empty">${empty}</div>`}</div>`;
// shared add-task form; renders into `slot`, calls onDone after save
export async function openTaskForm(slot, { personId = null, date = '', people, onDone }) {
  const cat = categoryField(null);
  const imp = importanceField(null);
  const rep = repeatField();
  slot.innerHTML = `<form class="card form" id="tkf" style="margin-top:12px">
    <label class="lbl">Task</label><input class="field" id="tkt" required placeholder="What needs doing" maxlength="140">
    <div class="grid2">
      <div><label class="lbl">Due (optional)</label><input class="field" type="date" id="tkd" value="${esc(date)}"></div>
      <div>${personPicker({ id: 'tkp', people, selected: String(personId ?? ''), label: 'Person (optional)' })}</div>
    </div>
    ${rep.html}
    <label class="lbl">Detail (optional)</label><textarea class="field" id="tkn" style="min-height:70px"></textarea>
    ${cat.html}
    ${imp.html}
    <div class="actions" style="margin-top:14px"><button class="btn primary">Add task</button><button type="button" class="btn" id="tkx">Cancel</button></div></form>`;
  document.getElementById('tkx').onclick = () => (slot.innerHTML = '');
  cat.bind(slot); imp.bind(slot); rep.bind(slot); bindPersonPickers(slot);
  document.getElementById('tkf').onsubmit = async (e) => {
    e.preventDefault(); e.submitter && (e.submitter.disabled = true);
    const row = { title: document.getElementById('tkt').value.trim(), due_date: document.getElementById('tkd').value || null,
      person_id: document.getElementById('tkp').value || null, detail: document.getElementById('tkn').value.trim() || null };
    if (state.hasCategory) row.category = cat.get();
    if (state.hasImportance) row.importance = imp.get();
    const r = rep.get();
    if (r.k !== 'none' && !row.due_date) { toast('Pick a due date for a repeating task'); e.submitter.disabled = false; return; }
    try {
      if (r.k === 'none') { await q(sb.from('tasks').insert(row)); toast('Task added ✓'); }
      else {
        const sid = state.hasSeries ? crypto.randomUUID() : null;
        await q(sb.from('tasks').insert(Array.from({ length: r.n }, (_, i) => ({ ...row,
          due_date: shiftSeriesDate(r.k, row.due_date, i),
          ...(sid ? { series_id: sid, series_rule: r.k, series_index: i } : {}) }))));
        toast(`${r.n} ${r.label.toLowerCase()} tasks added ✓`);
      }
      slot.innerHTML = ''; onDone();
    }
    catch { e.submitter && (e.submitter.disabled = false); }
  };
  document.getElementById('tkt').focus();
}

// ---------- edit task (panel) ----------
export async function editTask(taskId, rerender) {
  const fields = 'id,title,detail,due_date,status,person_id' + (state.hasCategory ? ',category' : '') + (state.hasImportance ? ',importance' : '') + (state.hasSeries ? ',series_id,series_rule,series_index' : '');
  const t = await q(sb.from('tasks').select(fields).eq('id', taskId).single());
  if (!t) return;
  const people = await withArchivedPerson(await loadPeople(), t.person_id);
  const cat = categoryField(t.category);
  const imp = importanceField(t.importance);
  const rep = repeatField(t.series_rule || 'none');
  const siblings = t.series_id ? await seriesSiblings('tasks', t.series_id) : [];
  const isSeries = siblings.length > 1;
  const scp = isSeries ? seriesScopeField(seriesNote(t.series_rule, t.series_index, siblings.length)) : null;
  openPanel();
  const who = people.find((p) => p.id === t.person_id);
  panelHead({ kicker: who ? who.name : 'Task', title: 'Edit task' });
  const root = $pBody;
  root.innerHTML = `<form class="card form" id="tef">
    <label class="lbl" for="te_title">Title</label><input class="field" id="te_title" required value="${esc(t.title)}">
    <div class="grid2"><div><label class="lbl" for="te_due">Due date</label><input class="field" id="te_due" type="date" value="${esc(t.due_date || '')}"></div>
    <div>${personPicker({ id: 'te_person', people, selected: t.person_id || '', label: 'Person (optional)' })}</div></div>
    <label class="lbl" for="te_detail">Detail (optional)</label><textarea class="field" id="te_detail" style="min-height:90px">${esc(t.detail || '')}</textarea>
    ${cat.html}
    ${imp.html}
    ${scp ? scp.html : ''}
    ${rep.html}
    <div class="actions" style="margin-top:16px"><button class="btn primary">Save</button><button type="button" class="btn" id="te_cancel">Cancel</button><button type="button" class="btn danger" id="te_del" style="margin-left:auto">Delete</button></div></form>`;
  document.getElementById('te_cancel').onclick = () => dismissPanel();
  document.getElementById('te_del').onclick = async (e) => {
    const b = e.currentTarget;
    if (isSeries) {
      openSeriesDeletePanel({
        kicker: 'Delete task', title: 'Delete repeating task?',
        note: `This is part of a ${parseRepeat(t.series_rule).label} series (${siblings.length} tasks).`,
        onScope: async (scope) => {
          if (!scope) return;
          for (const s of scopeRows(siblings, t.series_index, scope)) await q(sb.from('tasks').delete().eq('id', s.id));
          closePanel(); toast('Deleted'); rerender();
        },
      });
      return;
    }
    if (!b.dataset.sure) { b.dataset.sure = 1; b.textContent = 'Sure?'; return; }
    b.disabled = true; await q(sb.from('tasks').delete().eq('id', taskId)); toast('Deleted'); closePanel(); rerender();
  };
  cat.bind(root); imp.bind(root); rep.bind(root); bindPersonPickers(root);
  if (scp) scp.bind(root);
  document.getElementById('tef').onsubmit = async (e) => {
    e.preventDefault(); e.submitter && (e.submitter.disabled = true);
    const row = { title: document.getElementById('te_title').value.trim(), detail: document.getElementById('te_detail').value.trim() || null,
      due_date: document.getElementById('te_due').value || null, person_id: document.getElementById('te_person').value || null };
    if (state.hasCategory) row.category = cat.get();
    if (state.hasImportance) row.importance = imp.get();
    const r = rep.get();
    if (r.k !== 'none' && !row.due_date) { toast('Pick a due date for a repeating task'); e.submitter && (e.submitter.disabled = false); return; }
    try {
      const oldRule = t.series_rule || null;
      if (r.k === (oldRule || 'none')) {
        if (!scp || scp.get() === 'one') {
          await q(sb.from('tasks').update(row).eq('id', taskId)); toast('Saved ✓');
        } else {
          const targets = scopeRows(siblings, t.series_index, scp.get());
          for (const s of targets) {
            await q(sb.from('tasks').update({ ...row, due_date: row.due_date ? shiftSeriesDate(t.series_rule, row.due_date, s.series_index - t.series_index) : null }).eq('id', s.id));
          }
          toast(`Updated ${targets.length} tasks ✓`);
        }
      } else {
        // Frequency changed: regenerate the affected rows under the new rule.
        const msg = await applyRepeatChange({ table: 'tasks', row, newRule: r.k, oldRule, siblings, selfId: taskId, selfIndex: t.series_index, scope: scp ? scp.get() : 'one' });
        toast(msg);
      }
      closePanel(); rerender();
    }
    catch { e.submitter && (e.submitter.disabled = false); }
  };
  document.getElementById('te_title').focus();
}
