// "+ New" chooser: one entry point for creating a person, interaction,
// follow-up, task, or event.

import { sb, q, loadPeople } from './db.js';
import { $pBody, openPanel, closePanel, panelHead, toast, categoryField, importanceField, personPicker as pickerHtml, bindPersonPickers } from './ui.js';
import { esc, today } from './utils.js';
import { KINDS, state } from './config.js';
import { openTaskForm } from './tasks.js';
import { openEventForm } from './events.js';
import { route } from './router.js';

export async function openNewMenu() {
  openPanel();
  panelHead({ kicker: 'New', title: 'What are you adding?' });
  $pBody.innerHTML = `<div class="card" style="display:grid;gap:10px">
    <button class="btn primary" data-new="person">Person</button>
    <button class="btn" data-new="interaction">Interaction</button>
    <button class="btn" data-new="followup">Follow-up</button>
    <button class="btn" data-new="task">Task</button>
    <button class="btn" data-new="event">Event</button>
  </div>`;
  $pBody.querySelectorAll('[data-new]').forEach((b) => (b.onclick = () => {
    const kind = b.dataset.new;
    if (kind === 'person') location.hash = '#/new';
    else if (kind === 'interaction') newInteraction();
    else if (kind === 'followup') newFollowup();
    else if (kind === 'task') newTask();
    else if (kind === 'event') newEvent();
  }));
}

const personPicker = (people, id, required) => pickerHtml({ id, people, required });

async function newInteraction() {
  const people = await loadPeople();
  openPanel();
  panelHead({ kicker: 'New', title: 'Log interaction' });
  $pBody.innerHTML = `<form class="card form" id="nif">
    ${personPicker(people, 'ni_person', true)}
    <div class="grid2"><div><label class="lbl" for="ni_kind">Type</label><select class="field" id="ni_kind">${KINDS.map((k) => `<option>${k}</option>`).join('')}</select></div>
    <div><label class="lbl" for="ni_date">Date</label><input class="field" type="date" id="ni_date" value="${today()}" max="${today()}"></div></div>
    <label class="lbl" for="ni_summary">What happened</label><textarea class="field" id="ni_summary" required placeholder="Real conversation only: what was said, what you learned" style="min-height:90px"></textarea>
    <label class="lbl" for="ni_min">Minutes (optional)</label><input class="field" id="ni_min" inputmode="numeric">
    <div class="actions" style="margin-top:14px"><button class="btn primary">Save</button><button type="button" class="btn" id="ni_cancel">Back</button></div></form>`;
  bindPersonPickers($pBody);
  document.getElementById('ni_cancel').onclick = () => openNewMenu();
  document.getElementById('nif').onsubmit = async (e) => {
    e.preventDefault(); e.submitter && (e.submitter.disabled = true);
    const dm = parseInt(document.getElementById('ni_min').value, 10);
    try {
      await q(sb.from('interactions').insert({ person_id: document.getElementById('ni_person').value,
        kind: document.getElementById('ni_kind').value, happened_at: document.getElementById('ni_date').value,
        summary: document.getElementById('ni_summary').value.trim(), duration_min: Number.isFinite(dm) ? dm : null }));
      state.people = null; toast('Logged ✓'); closePanel(); route();
    } catch { e.submitter && (e.submitter.disabled = false); }
  };
  document.getElementById('ni_summary').focus();
}

export async function newFollowup() {
  const people = await loadPeople();
  const cat = categoryField(null);
  const imp = importanceField(null);
  openPanel();
  panelHead({ kicker: 'New', title: 'New follow-up' });
  $pBody.innerHTML = `<form class="card form" id="nff">
    <label class="lbl" for="nf_title">Follow-up</label><input class="field" id="nf_title" required placeholder="What needs to happen">
    ${personPicker(people, 'nf_person', true)}
    <label class="lbl" for="nf_due">Due date (only if you actually have one)</label><input class="field" type="date" id="nf_due">
    <label class="lbl" for="nf_detail">Detail (optional)</label><textarea class="field" id="nf_detail" style="min-height:70px" placeholder="Anything extra — context, what 'done' looks like"></textarea>
    ${cat.html}
    ${imp.html}
    <div class="actions" style="margin-top:14px"><button class="btn primary">Add</button><button type="button" class="btn" id="nf_cancel">Back</button></div></form>`;
  bindPersonPickers($pBody);
  document.getElementById('nf_cancel').onclick = () => openNewMenu();
  cat.bind($pBody); imp.bind($pBody);
  document.getElementById('nff').onsubmit = async (e) => {
    e.preventDefault(); e.submitter && (e.submitter.disabled = true);
    try {
      const row = { person_id: document.getElementById('nf_person').value,
        title: document.getElementById('nf_title').value.trim(), due_date: document.getElementById('nf_due').value || null,
        detail: document.getElementById('nf_detail').value.trim() || null };
      if (state.hasCategory) row.category = cat.get();
      if (state.hasImportance) row.importance = imp.get();
      await q(sb.from('follow_ups').insert(row));
      toast('Added ✓'); closePanel(); route();
    } catch { e.submitter && (e.submitter.disabled = false); }
  };
  document.getElementById('nf_title').focus();
}

async function newTask() {
  const people = await loadPeople();
  openPanel();
  panelHead({ kicker: 'New', title: 'New task' });
  openTaskForm($pBody, { people, onDone: () => { closePanel(); route(); } });
  document.getElementById('tkx').onclick = () => openNewMenu();
}

async function newEvent() {
  const people = await loadPeople();
  openPanel();
  panelHead({ kicker: 'New', title: 'New event' });
  openEventForm($pBody, { people, onDone: () => { closePanel(); route(); } });
  document.getElementById('evx').onclick = () => openNewMenu();
}
