// Pages: the main views. Each renders into $view and wires its own events.

import { sb, q, loadPeople, openFollowups, loadEvents, openTasksSoft } from './db.js';
import { $view, $kicker, setHead, st, sec, monoDate, initials, personRow, personStatus, personMeta, kickerDate, openPanel, panelHead, closePanel } from './ui.js';
import { today, fmtDate, daysBetween, addDays, ago, dayOf, streakOf, dueInfo, upcomingBirthdays, agoShort, feedDay, esc } from './utils.js';
import { state, TIERS, KINDS, RELS, ACTION_CATEGORIES } from './config.js';
import { fuItem, fuList, bindFollowups, nextTouch, ntouch } from './followups.js';
import { taskItem, taskList, bindTasks, openTaskForm } from './tasks.js';
import { evList, bindEvents, openEventForm, editEvent } from './events.js';
import { newFollowup } from './new.js';

// ---------- dashboard = the big picture ----------
const REL_COLORS = { Professional: 'var(--rel-professional)', Friend: 'var(--rel-friend)', Family: 'var(--rel-family)', 'Family Friend': 'var(--rel-familyfriend)', Customer: 'var(--rel-customer)', Prospect: 'var(--rel-prospect)', Business: 'var(--rel-business)', OTHER: 'var(--rel-other)', '': 'var(--rel-none)' };
const REL_LABELS = { Professional: 'work', Friend: 'friends', Family: 'family', 'Family Friend': 'family friends', Customer: 'customers', Prospect: 'prospects', Business: 'business', OTHER: 'other', '': 'uncategorized' };
// relationship bucket: standard category, OTHER for custom values, '' for blank
const relKey = (p) => { const r = (p.relationship || '').trim(); return r ? (RELS.includes(r) ? r : 'OTHER') : ''; };
const relLabel = (r) => ({ Professional: 'Work', Friend: 'Friends', Family: 'Family', 'Family Friend': 'Family Friends', Customer: 'Customers', Prospect: 'Prospects', Business: 'Business', OTHER: 'Other' }[r] || r);
const TIER_COLORS = { A: 'var(--amber)', B: '#7fa07a', C: '#7d99a8', D: '#e0654d', '': '#6e6e6e' };
const CIRCLE_COLORS = ['#d2a24c', '#7fa07a', '#c08b5c', '#7d99a8', '#a8716a', '#a08b62', '#d9704a', '#8d8578'];
export async function renderDashboard() {
  setHead({ kicker: 'Network overview', title: 'Dashboard', tab: 'dashboard', add: true });
  const t = today();
  const [people, intRows, fus, tasks, evs] = await Promise.all([loadPeople(),
    q(sb.from('interactions').select('id,happened_at').gte('happened_at', addDays(t, -63)).limit(2000)),
    openFollowups(), openTasksSoft(), loadEvents()]);
  const streak = streakOf(intRows, t);
  const ints7 = intRows.filter((r) => r.happened_at && r.happened_at >= addDays(t, -7)).length;
  const newMonth = people.filter((p) => p.created_at && p.created_at.slice(0, 7) === t.slice(0, 7)).length;
  const stale = people.filter((p) => !p.cadence_days && p.last_contact && daysBetween(p.last_contact, t) > 60)
    .sort((a, b) => daysBetween(b.last_contact, t) - daysBetween(a.last_contact, t)).slice(0, 8);
  const bdays = upcomingBirthdays(people, 21);

  // ---- network mix: one bar per dimension ----
  const mixParts = (entries) => {
    const total = entries.reduce((a, e) => a + e.n, 0) || 1;
    return {
      bar: entries.map((e) => `<span style="width:${(e.n / total * 100).toFixed(1)}%;background:${e.c}" title="${esc(e.l)}: ${e.n}"></span>`).join(''),
      legend: entries.map((e) => `<span><i class="dotk" style="background:${e.c}"></i><b>${e.n}</b> ${esc(e.l)}</span>`).join(''),
    };
  };
  const mixLine = (label, entries, note) => {
    const m = mixParts(entries.filter((e) => e.n));
    return `<div class="mixlabel">${esc(label)}</div><div class="relbar">${m.bar}</div><div class="rel-legend">${m.legend}</div>${note ? `<p class="note">${note}</p>` : ''}`;
  };
  const relN = {};
  people.forEach((p) => { const k = relKey(p); relN[k] = (relN[k] || 0) + 1; });
  const relEntries = [...RELS, 'OTHER', ''].map((r) => ({ l: REL_LABELS[r], n: relN[r] || 0, c: REL_COLORS[r] }));
  const tierEntries = [...TIERS.map((tr) => ({ l: `Tier ${tr}`, n: people.filter((p) => p.tier === tr).length, c: TIER_COLORS[tr] })),
    { l: 'Unassigned', n: people.filter((p) => !p.tier).length, c: TIER_COLORS[''] }];
  const circleCounts = {};
  people.forEach((p) => (p.circles || []).forEach((c) => { circleCounts[c] = (circleCounts[c] || 0) + 1; }));
  const circleEntries = Object.entries(circleCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([c, n], i) => ({ l: c, n, c: CIRCLE_COLORS[i % CIRCLE_COLORS.length] }));

  // ---- events coming up + quick reminders ----
  const upcoming = evs.filter((e) => e.event_date >= t).slice(0, 6);
  const reminders = [
    ...fus.map((f) => ({ due: f.due_date, created: f.created_at, html: withBadge(fuItem(f), 'follow-up', 'fu') })),
    ...tasks.map((x) => ({ due: x.due_date, created: x.created_at, html: withBadge(taskItem(x), 'task', 'task') })),
  ].sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1).slice(0, 5);

  $view.innerHTML = `
    <div class="stats">
      <span class="stat"><span class="k">People</span><span class="v">${people.length}</span></span>
      <span class="stat"><span class="k">Added \u00b7 ${t.slice(0, 7)}</span><span class="v">${newMonth}</span></span>
      <span class="stat"><span class="k">Day streak</span><span class="v">${streak ? streak : '\u2013'}</span></span>
      <span class="stat ${stale.length ? 'red' : ''}"><span class="k">Going stale</span><span class="v">${stale.length}</span></span>
    </div>
    <div class="card" style="margin-top:12px;padding:14px">
      ${sec('Network mix')}
      ${mixLine('Relationships', relEntries, relN[''] ? `${relN['']} people still need a relationship category.` : '')}
      ${mixLine('Tiers', tierEntries, '')}
      ${mixLine('Circles \u00b7 top 8', circleEntries, '')}
    </div>
    <div class="dash" style="margin-top:12px"><div class="dash-main">
      ${sec('Going stale', stale.length, '', stale.length ? 'red' : '')}
      ${stale.length ? `<ul class="list card">${stale.map((p) => personRow(p, st('gray', ago(p.last_contact)))).join('')}</ul>` : '<div class="card empty">Nobody\u2019s drifting. The cadences are holding.</div>'}
      ${sec('Events coming up', upcoming.length)}
      ${upcoming.length ? evList(upcoming, '', true) : '<div class="card empty">Nothing on the calendar.</div>'}
      <div id="evSlot"></div>
    </div><div class="dash-side">
      ${sec('Conversations \u00b7 7 days', ints7)}
      <div class="card pulse"><div class="pulse-row"><span>Logged this week</span><b>${ints7}</b></div>
      <div class="pulse-row"><span>Day streak</span><b>${streak ? streak + '-day' : '\u2013'}</b></div></div>
      ${sec('Quick reminders', reminders.length)}
      ${reminders.length ? `<div class="card"><ul class="list">${reminders.map((r) => r.html).join('')}</ul></div>` : '<div class="card empty">Nothing pressing.</div>'}
      ${bdays.length ? `${sec('Birthdays \u00b7 next 3 weeks', bdays.length)}<ul class="list card">${bdays.map((x) => personRow(x.p, st(x.in <= 1 ? 'amber' : 'gray', x.in === 0 ? 'today' : x.in === 1 ? 'tomorrow' : `in ${x.in}d`))).join('')}</ul>` : ''}
    </div></div>
    <div class="linkrow"><a href="#/password">Set password</a><a href="#" id="signout">Sign out</a></div>`;
  bindFollowups(renderDashboard);
  bindTasks(renderDashboard);
  bindEvents(renderDashboard, $view, (id) => editEvent(id, document.getElementById('evSlot'), renderDashboard));
  document.getElementById('signout').onclick = async (e) => { e.preventDefault(); await sb.auth.signOut(); };
}

// ---------- today = just the day: due today/tomorrow/this week ----------
export async function renderToday() {
  setHead({ kicker: kickerDate(), title: 'Today', tab: 'today', add: true });
  const t = today();
  const [fus, evs, tasks] = await Promise.all([openFollowups(), loadEvents(), openTasksSoft()]);
  const tomorrow = addDays(t, 1);
  const week = addDays(t, 7);
  const dueTodayFu = fus.filter((f) => f.due_date === t);
  const dueTodayTask = tasks.filter((x) => x.due_date === t);
  const tmFu = fus.filter((f) => f.due_date === tomorrow);
  const tmTask = tasks.filter((x) => x.due_date === tomorrow);
  const weekFu = fus.filter((f) => f.due_date && f.due_date > tomorrow && f.due_date <= week);
  const weekTask = tasks.filter((x) => x.due_date && x.due_date > tomorrow && x.due_date <= week);
  const weekEvs = evs.filter((e) => e.event_date >= t && e.event_date <= week);
  const nToday = dueTodayFu.length + dueTodayTask.length;
  const nTm = tmFu.length + tmTask.length;
  const nWeek = weekFu.length + weekTask.length + weekEvs.length;
  const dayBlock = (fus_, tasks_, empty) => `
    ${fus_.length ? fuList(fus_, '') : ''}
    ${tasks_.length ? `<div style="margin-top:${fus_.length ? 8 : 0}px">${taskList(tasks_, '')}</div>` : ''}
    ${!fus_.length && !tasks_.length ? `<div class="card empty">${empty}</div>` : ''}`;
  $view.innerHTML = `
    ${sec('Due today', nToday, '', nToday ? 'amber' : '')}
    ${dayBlock(dueTodayFu, dueTodayTask, 'Nothing due today.')}
    ${sec('Tomorrow', nTm, '', nTm ? 'amber' : '')}
    ${dayBlock(tmFu, tmTask, 'Nothing due tomorrow.')}
    ${sec('Rest of the week', nWeek)}
    ${weekEvs.length ? evList(weekEvs, '', true) : ''}
    ${weekFu.length || weekTask.length ? `<div style="margin-top:${weekEvs.length ? 8 : 0}px">${dayBlock(weekFu, weekTask, '')}</div>` : (!weekEvs.length ? '<div class="card empty">Nothing else this week.</div>' : '')}
    <div id="evSlot"></div>`;
  bindFollowups(renderToday);
  bindTasks(renderToday);
  bindEvents(renderToday, $view, (id) => editEvent(id, document.getElementById('evSlot'), renderToday));
}

// ---------- overdue ----------
export async function renderOverdue() {
  setHead({ kicker: 'Attention', title: 'Overdue', tab: 'overdue', add: true });
  const [people, fus, tasks] = await Promise.all([loadPeople(), openFollowups(), openTasksSoft()]);
  const t = today();
  const people_ = people.map((p) => ({ p, d: dueInfo(p) })).filter((x) => x.d && x.d.overdue);
  const late = fus.filter((f) => f.due_date && f.due_date < t);
  const lateTasks = tasks.filter((x) => x.due_date && x.due_date < t);
  // last interaction per overdue person, to ground the touch prompts
  const ids = [...new Set([...people_.map((x) => x.p.id), ...late.map((f) => f.person && f.person.id).filter(Boolean)])];
  const lastById = {};
  if (ids.length) {
    const rows = await q(sb.from('interactions').select('person_id,kind,happened_at,summary').in('person_id', ids)
      .order('happened_at', { ascending: false }).order('created_at', { ascending: false }).limit(ids.length * 4));
    rows.forEach((r) => { if (!lastById[r.person_id]) lastById[r.person_id] = r; });
  }
  const fullPerson = (f) => {
    const fp = people.find((pp) => pp.id === (f.person && f.person.id)) || {};
    return { circles: [], org: '', role: '', ...fp, name: (f.person && f.person.name) || fp.name };
  };
  const cadRow = (x) => `<li><a class="row" href="#/p/${x.p.id}">
      <span class="av">${esc(initials(x.p.name))}</span>
      <span class="main"><span class="name">${esc(x.p.name)}</span><span class="meta">${esc(personMeta(x.p))}</span></span>
      ${st('red', x.d.label)}</a>
      ${ntouch(nextTouch(x.p, lastById[x.p.id]))}</li>`;
  $kicker.textContent = `Attention · ${people_.length + late.length + lateTasks.length} items`;
  $view.innerHTML = `
    ${sec('Cadence · reach out', people_.length, '', people_.length ? 'red' : '')}
    ${people_.length ? `<ul class="list card">${people_.map(cadRow).join('')}</ul>` : '<div class="card empty">Nobody past their cadence.</div>'}
    ${sec('Follow-ups past due', late.length, '', late.length ? 'red' : '')}
    ${fuList(late, 'No follow-ups past their due date.', (f) => { const fp = fullPerson(f); return ntouch(nextTouch(fp, lastById[fp.id])); })}
    ${sec('Tasks past due', lateTasks.length, '', lateTasks.length ? 'red' : '')}
    ${taskList(lateTasks, 'No tasks past their due date.')}`;
  bindFollowups(renderOverdue);
  bindTasks(renderOverdue);
}
// ---------- actions: follow-ups + tasks merged, one list ----------
const badge = (label, cls) => `<span class="typebadge ${cls}">${label}</span>`;
const withBadge = (html, label, cls) => html
  .replace(/<button class="btn small" data-park="[^"]*">Park<\/button>/, '')
  .replace('<div class="main">', `${badge(label, cls)}<div class="main">`);
export async function renderActions() {
  setHead({ kicker: 'Follow-ups + tasks', title: 'Actions', tab: 'actions', add: true });
  const s = state.actionStatus; // open | parked | done
  const ty = state.actionType;   // all | fu | task
  const catSel = 'id,title,due_date,status,created_at,completed_at' + (state.hasCategory ? ',category' : '') + (state.hasImportance ? ',importance' : '') + ',person:people(id,name,tier)';
  const [fus, taskRes] = await Promise.all([
    q(sb.from('follow_ups').select(catSel).order('created_at', { ascending: false }).limit(2000)),
    sb.from('tasks').select(catSel).order('created_at', { ascending: false }).limit(2000),
  ]);
  const tasks = taskRes.error ? [] : (taskRes.data || []);
  const fuOpen = (f) => f.status === 'open', fuParked = (f) => f.status === 'parked', fuDone = (f) => f.status === 'closed';
  const tOpen = (x) => x.status === 'open', tDone = (x) => x.status === 'done';
  const match = { open: (f) => fuOpen(f), parked: (f) => fuParked(f), done: (f) => fuDone(f) };
  const tmatch = { open: tOpen, parked: () => false, done: tDone };
  const catMatch = (i) => state.actionCat === 'all' || i.cat === state.actionCat;
  let items = [
    ...fus.filter(match[s]).map((f) => ({ kind: 'fu', cat: f.category || null, due: f.due_date, created: f.created_at, completed: f.completed_at, html: withBadge(fuItem(f), 'follow-up', 'fu') })),
    ...tasks.filter(tmatch[s]).map((x) => ({ kind: 'task', cat: x.category || null, due: x.due_date, created: x.created_at, completed: x.completed_at, html: withBadge(taskItem(x), 'task', 'task') })),
  ].filter((i) => (ty === 'all' || i.kind === ty) && catMatch(i));
  if (s === 'done') items.sort((a, b) => ((a.completed || '') < (b.completed || '') ? 1 : -1)); // newest finished first
  else items.sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : (a.created < b.created ? 1 : -1));
  const nOpen = fus.filter(fuOpen).length + tasks.filter(tOpen).length;
  const nParked = fus.filter(fuParked).length;
  const nDone = fus.filter(fuDone).length + tasks.filter(tDone).length;
  const seg = (k, label, n) => `<button class="pill ${k === s ? 'on' : ''}" data-s="${k}" role="tab" aria-selected="${k === s}">${label} · ${n}</button>`;
  const typ = (k, label) => `<button class="pill ${k === ty ? 'on' : ''}" data-t="${k}">${label}</button>`;
  const catFilter = state.hasCategory
    ? `<select class="field" id="actCat" aria-label="Filter by category" style="max-width:170px"><option value="all">All categories</option>${ACTION_CATEGORIES.map((c) => `<option value="${c}"${state.actionCat === c ? ' selected' : ''}>${c}</option>`).join('')}</select>`
    : '';
  $view.innerHTML = `
    <div class="cal-bar"><div class="pills" role="tablist">${seg('open', 'Open', nOpen)}${seg('parked', 'Parked', nParked)}${seg('done', 'Done', nDone)}</div>
      <button class="pill" id="actAddFu">+ Follow-up</button><button class="pill" id="actAddTask">+ Task</button></div>
    <div class="pills" style="margin:10px 0" role="tablist">${typ('all', 'All')}${typ('fu', 'Follow-ups')}${typ('task', 'Tasks')}</div>
    ${catFilter ? `<div style="margin:0 0 10px">${catFilter}</div>` : ''}
    <div class="card">${items.length ? `<ul class="list">${items.map((i) => i.html).join('')}</ul>` : '<div class="empty">Nothing here.</div>'}</div>`;
  $view.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { state.actionStatus = b.dataset.s; renderActions(); }));
  $view.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { state.actionType = b.dataset.t; renderActions(); }));
  const actCat = document.getElementById('actCat');
  if (actCat) actCat.onchange = (e) => { state.actionCat = e.target.value; renderActions(); };
  document.getElementById('actAddFu').onclick = () => newFollowup();
  document.getElementById('actAddTask').onclick = async () => { const people = await loadPeople(); openPanel(); panelHead({ kicker: 'New', title: 'New task' }); openTaskForm($pBody, { people, onDone: () => { closePanel(); renderActions(); } }); };
  bindFollowups(renderActions);
  bindTasks(renderActions);
}
// ---------- recent activity: who did what, from the activity log ----------
// Reads the activity_feed view (0004 migration): a slim projection of
// activity_log with the actor. Falls back to the old reconstructed feed if
// the view isn't there.
const ACTORS = { chase: 'Chase', muse: 'Muse', claude: 'Claude', 'claude-import': 'Claude' };
const actorOf = (a) => ACTORS[String(a || '').toLowerCase()] || '';
const actorBadge = (a) => { const n = actorOf(a); return n ? `<span class="typebadge actor-${n.toLowerCase()}">${n}</span>` : ''; };
const FIELD_LABELS = { cadence_days: 'cadence', birth_month: 'birthday', birth_day: 'birthday', birth_year: 'birthday', muse_notes: "Muse's notes",
  how_met: 'how met', due_date: 'due date', person_id: 'person', event_date: 'date', event_time: 'time', duration_min: 'minutes', happened_at: 'date' };
const SKIP_FIELDS = new Set(['completed_at', 'last_contact', 'created_at', 'created_by', 'legacy_id', 'vault_path', 'status']);
const fieldList = (ch) => [...new Set((ch || []).filter((k) => !SKIP_FIELDS.has(k)).map((k) => FIELD_LABELS[k] || k.replace(/_/g, ' ')))];
// drop log rows that aren't real activity: last_contact bumps from the
// interaction trigger, and no-op updates
const isNoise = (r) => r.action === 'update' && !(r.changed || []).some((k) => k !== 'last_contact') ;
function feedItem(r, names) {
  const pid = r.entity === 'people' ? r.entity_id : r.person_id;
  const pname = r.entity === 'people' ? r.title : names[pid];
  const who = pid && pname ? `<a href="#/p/${pid}">${esc(pname)}</a>` : '';
  const ttl = r.title ? `'${esc(r.title)}'` : '';
  const fields = fieldList(r.changed);
  const fx = fields.length ? ` · ${esc(fields.slice(0, 3).join(', '))}${fields.length > 3 ? '…' : ''}` : '';
  const statusMove = r.action === 'update' && r.old_status !== r.new_status;
  let desc = '', kind = '', sub = '';
  if (r.entity === 'people') {
    kind = st('gray', 'Person');
    if (r.action === 'insert') desc = `Added ${who || ttl}`;
    else if ((r.changed || []).includes('archived_at')) desc = `${r.archived_at ? 'Archived' : 'Restored'} ${who || ttl}`;
    else desc = `Updated ${who || ttl}${fx}`;
  } else if (r.entity === 'follow_ups' || r.entity === 'tasks') {
    const noun = r.entity === 'tasks' ? 'task' : 'follow-up';
    kind = st('gray', r.entity === 'tasks' ? 'Task' : 'Follow-up');
    if (r.action === 'insert') desc = `New ${noun} ${ttl}`;
    else if (r.action === 'delete') desc = `Deleted ${noun} ${ttl}`;
    else if (statusMove && (r.new_status === 'closed' || r.new_status === 'done')) { desc = `Completed ${ttl}`; kind = st('ring', 'Done'); }
    else if (statusMove && r.new_status === 'parked') desc = `Parked ${ttl}`;
    else if (statusMove && r.new_status === 'open') desc = `Reopened ${ttl}`;
    else desc = `Edited ${noun} ${ttl}${fx}`;
    if (who) desc += ` · ${who}`;
  } else if (r.entity === 'interactions') {
    kind = st('amber', 'Interaction');
    desc = `${r.action === 'insert' ? 'Logged' : r.action === 'delete' ? 'Removed' : 'Edited'} ${esc(r.kind || 'interaction')}${who ? ` with ${who}` : ''}`;
    if (r.summary && r.action !== 'delete') sub = `<span>${esc(r.summary.slice(0, 140))}</span>`;
  } else if (r.entity === 'events') {
    kind = st('gray', 'Event');
    desc = r.action === 'insert' ? `Scheduled ${ttl}${r.event_date ? ` for ${monoDate(r.event_date)}` : ''}` : `${r.action === 'delete' ? 'Deleted' : 'Edited'} event ${ttl}`;
    if (who) desc += ` · ${who}`;
  } else { kind = st('gray', r.entity); desc = `${r.action} ${ttl}`; }
  return `<li class="fu"><div class="main"><span class="t">${desc}</span><span class="meta">${actorBadge(r.actor)}${kind}<span>${agoShort(r.created_at)}</span>${sub}</span></div></li>`;
}
export async function renderRecent() {
  setHead({ kicker: 'Activity', title: 'Recent', tab: 'recent', add: true });
  const [res, people] = await Promise.all([
    sb.from('activity_feed').select('id,created_at,actor,action,entity,entity_id,person_id,title,summary,kind,event_date,old_status,new_status,archived_at,changed')
      .order('created_at', { ascending: false }).limit(400),
    loadPeople(),
  ]);
  if (res.error) return renderRecentLegacy();
  const t = today();
  const names = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const rows = (res.data || []).filter((r) => !isNoise(r));
  const A = state.recentActor || 'all';
  const n = (a) => rows.filter((r) => actorOf(r.actor) === a).length;
  const shown = rows.filter((r) => A === 'all' || actorOf(r.actor) === A).slice(0, 150);
  const groups = [];
  shown.forEach((r) => {
    const d = feedDay(r.created_at);
    const g = groups[groups.length - 1];
    if (g && g.d === d) g.items.push(r); else groups.push({ d, items: [r] });
  });
  const pill = (k, label) => `<button class="pill ${k === A ? 'on' : ''}" data-actor="${k}" role="tab" aria-selected="${k === A}">${label}</button>`;
  $view.innerHTML = `
    <div class="pills" role="tablist" style="margin-bottom:12px;flex-wrap:wrap">${pill('all', 'All')}${pill('Chase', `Chase · ${n('Chase')}`)}${pill('Muse', `Muse · ${n('Muse')}`)}${pill('Claude', `Claude · ${n('Claude')}`)}</div>
    ${groups.length ? `<div class="recent-wrap">${groups.map((g) => `
    <div class="daygroup"><div class="daydiv">${g.d === t ? 'Today' : g.d === addDays(t, -1) ? 'Yesterday' : monoDate(g.d)}</div>
    <div class="card"><ul class="list">${g.items.map((r) => feedItem(r, names)).join('')}</ul></div></div>`).join('')}</div>`
    : '<div class="card empty">No activity yet.</div>'}`;
  $view.querySelectorAll('[data-actor]').forEach((b) => (b.onclick = () => { state.recentActor = b.dataset.actor; renderRecent(); }));
}
// legacy feed: reconstructed from row timestamps, no actor (fallback only)
function actItem(it) {
  const who = it.person ? `<a href="#/p/${it.person.id}">${esc(it.person.name)}</a>` : '';
  let desc = '', kind = '';
  if (it.k === 'interaction') { desc = `Logged ${esc(it.i.kind)}${who ? ` with ${who}` : ''}`; kind = st('amber', 'Interaction'); }
  else if (it.k === 'fu_done') { desc = `Completed '${esc(it.f.title)}'${who ? ` · ${who}` : ''}`; kind = st('ring', 'Done'); }
  else if (it.k === 'fu_created') { desc = `New follow-up '${esc(it.f.title)}'${who ? ` · ${who}` : ''}`; kind = st('gray', 'Follow-up'); }
  else if (it.k === 'person') { desc = `Added ${who}`; kind = st('gray', 'Person'); }
  else { desc = `Scheduled '${esc(it.e.title)}' for ${monoDate(it.e.event_date)}${who ? ` · ${who}` : ''}`; kind = st('gray', 'Event'); }
  const sub = it.k === 'interaction' && it.i.summary ? `<span>${esc(it.i.summary.slice(0, 140))}</span>` : '';
  return `<li class="fu"><div class="main"><span class="t">${desc}</span><span class="meta">${kind}<span>${agoShort(it.ts)}</span>${sub}</span></div></li>`;
}
async function renderRecentLegacy() {
  setHead({ kicker: 'Activity', title: 'Recent', tab: 'recent', add: true });
  const t = today();
  const [ints, fus, ppl, evs] = await Promise.all([
    q(sb.from('interactions').select('id,kind,happened_at,summary,person:people(id,name)').order('happened_at', { ascending: false }).limit(100)),
    q(sb.from('follow_ups').select('id,title,status,created_at,completed_at,person:people(id,name)').order('created_at', { ascending: false }).limit(100)),
    q(sb.from('people').select('id,name,created_at').is('archived_at', null).order('created_at', { ascending: false }).limit(100)),
    q(sb.from('events').select('id,title,event_date,created_at,person:people(id,name)').order('created_at', { ascending: false }).limit(100)),
  ]);
  const feed = [];
  ints.forEach((i) => i.happened_at && feed.push({ ts: i.happened_at, k: 'interaction', i, person: i.person }));
  fus.forEach((f) => {
    if (f.created_at) feed.push({ ts: f.created_at, k: 'fu_created', f, person: f.person });
    if (f.status === 'closed' && f.completed_at) feed.push({ ts: f.completed_at, k: 'fu_done', f, person: f.person });
  });
  ppl.forEach((p) => p.created_at && feed.push({ ts: p.created_at, k: 'person', person: p }));
  evs.forEach((e) => e.created_at && feed.push({ ts: e.created_at, k: 'event', e, person: e.person }));
  feed.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
  const items = feed.slice(0, 100);
  const groups = [];
  items.forEach((it) => {
    const d = feedDay(it.ts);
    const g = groups[groups.length - 1];
    if (g && g.d === d) g.items.push(it); else groups.push({ d, items: [it] });
  });
  $view.innerHTML = groups.length ? `<div class="recent-wrap">${groups.map((g) => `
    <div class="daygroup"><div class="daydiv">${g.d === t ? 'Today' : g.d === addDays(t, -1) ? 'Yesterday' : monoDate(g.d)}</div>
    <div class="card"><ul class="list">${g.items.map(actItem).join('')}</ul></div></div>`).join('')}</div>`
    : '<div class="card empty">No activity yet.</div>';
}

// ---------- interactions ----------
export async function renderInteractions() {
  setHead({ kicker: 'Conversations', title: 'Interactions', tab: 'interactions', add: true });
  const [ints, people] = await Promise.all([
    q(sb.from('interactions').select('id,kind,happened_at,summary,duration_min,person:people(id,name,tier)').order('happened_at', { ascending: false }).order('created_at', { ascending: false }).limit(500)),
    loadPeople(),
  ]);
  const t = today();
  const inLast = (n) => ints.filter((i) => i.happened_at && i.happened_at >= addDays(t, -n)).length;
  const kindN = (k) => ints.filter((i) => i.kind === k).length;
  const mk = t.slice(0, 7);
  const talkCounts = {};
  ints.forEach((i) => {
    if (i.person && i.happened_at && i.happened_at.slice(0, 7) === mk) {
      (talkCounts[i.person.id] ||= { p: i.person, n: 0 }).n++;
    }
  });
  const topTalk = Object.values(talkCounts).sort((a, b) => b.n - a.n || a.p.name.localeCompare(b.p.name)).slice(0, 5);
  const monthName = new Date(t + 'T12:00:00').toLocaleDateString(undefined, { month: 'long' });
  $view.innerHTML = `
    <div class="stats">
      <span class="stat"><span class="k">All time</span><span class="v">${ints.length}</span></span>
      <span class="stat"><span class="k">Last 7 days</span><span class="v">${inLast(7)}</span></span>
      <span class="stat"><span class="k">Last 30 days</span><span class="v">${inLast(30)}</span></span>
      <span class="stat"><span class="k">With notes</span><span class="v">${ints.filter((i) => i.summary).length}</span></span>
    </div>
    ${topTalk.length ? `<div class="card board">
      <div class="board-head"><span>Most talked to</span><span class="mono">${esc(monthName)}</span></div>
      <ol>${topTalk.map((x, i) => `<li><a class="row" href="#/p/${x.p.id}"><span class="rank">${i + 1}</span><span class="main"><span class="name">${esc(x.p.name)}</span></span><span class="bcount">${x.n} interaction${x.n === 1 ? '' : 's'} this month</span></a></li>`).join('')}</ol>
    </div>` : ''}
    <div class="cal-bar"><div class="pills" role="tablist">
      ${['all', ...KINDS].map((k) => `<button class="pill ${k === state.intKind ? 'on' : ''}" data-kind="${k}" role="tab" aria-selected="${k === state.intKind}">${k === 'all' ? 'All' : `${k} · ${kindN(k)}`}</button>`).join('')}</div>
      <button class="pill" id="intAddBtn">+ Log</button></div>
    <div id="intSlot"></div>
    <input class="search" id="intQ" type="search" placeholder="Search person or summary…" value="${esc(state.intQ)}" autocomplete="off" style="margin-bottom:12px">
    <div id="intList"></div>`;
  const draw = () => {
    const K = state.intKind, Q = state.intQ.trim().toLowerCase();
    const rows = ints.filter((i) => (K === 'all' || i.kind === K) &&
      (!Q || (i.person?.name || '').toLowerCase().includes(Q) || (i.summary || '').toLowerCase().includes(Q)));
    const groups = [];
    rows.forEach((i) => {
      const d = (i.happened_at || '').slice(0, 10);
      const g = groups[groups.length - 1];
      if (g && g.d === d) g.items.push(i); else groups.push({ d, items: [i] });
    });
    document.getElementById('intList').innerHTML = groups.length ? `<div class="recent-wrap">${groups.map((g) => `
      <div class="daygroup"><div class="daydiv">${!g.d ? 'Undated' : g.d === t ? 'Today' : g.d === addDays(t, -1) ? 'Yesterday' : monoDate(g.d)}</div>
      <div class="card"><ul class="list">${g.items.map((i) => {
        const who = i.person ? `<a href="#/p/${i.person.id}">${esc(i.person.name)}</a>` : '<span class="meta">No person linked</span>';
        return `<li class="fu"><div class="main"><span class="t">${who}</span><span class="meta">${st('amber', i.kind)}${i.duration_min ? `<span>${i.duration_min} min</span>` : ''}${i.summary ? `<span>${esc(i.summary.slice(0, 160))}</span>` : ''}</span></div></li>`;
      }).join('')}</ul></div></div>`).join('')}</div>`
      : '<div class="card empty">No interactions match.</div>';
  };
  const qi = document.getElementById('intQ');
  qi.oninput = () => { state.intQ = qi.value; draw(); };
  $view.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => {
    state.intKind = b.dataset.kind;
    $view.querySelectorAll('[data-kind]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    draw();
  }));
  document.getElementById('intAddBtn').onclick = () => {
    const slot = document.getElementById('intSlot');
    slot.innerHTML = `<form class="card form" id="ilf" style="margin-top:12px">
      <div class="grid2">
        <div><label class="lbl">Person</label><select class="field" id="ilp">${people.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
        <div><label class="lbl">Type</label><select class="field" id="ilk">${KINDS.map((k) => `<option>${k}</option>`).join('')}</select></div>
      </div>
      <div class="grid2">
        <div><label class="lbl">Date</label><input class="field" type="date" id="ild" value="${today()}" max="${today()}"></div>
        <div><label class="lbl">Minutes (optional)</label><input class="field" id="ilm" inputmode="numeric"></div>
      </div>
      <label class="lbl">What happened</label><textarea class="field" id="ils" required placeholder="Real conversation only: what was said, what you learned"></textarea>
      <div class="actions" style="margin-top:14px"><button class="btn primary">Save</button><button type="button" class="btn" id="ilx">Cancel</button></div></form>`;
    document.getElementById('ilx').onclick = () => (slot.innerHTML = '');
    document.getElementById('ilf').onsubmit = async (e) => {
      e.preventDefault(); e.submitter && (e.submitter.disabled = true);
      const dm = parseInt(document.getElementById('ilm').value, 10);
      try {
        await q(sb.from('interactions').insert({ person_id: document.getElementById('ilp').value, kind: document.getElementById('ilk').value,
          happened_at: document.getElementById('ild').value, summary: document.getElementById('ils').value.trim(),
          duration_min: Number.isFinite(dm) ? dm : null }));
        toast('Logged ✓'); state.people = null; renderInteractions();
      } catch { e.submitter && (e.submitter.disabled = false); }
    };
    document.getElementById('ils').focus();
  };
  draw();
}

// ---------- people ----------
export async function renderPeople() {
  setHead({ kicker: 'Directory', title: 'People', tab: 'people', add: true });
  const people = await loadPeople();
  $kicker.textContent = `Directory · ${people.length} records`;
  const circles = [...new Set(people.flatMap((p) => p.circles || []))].sort();
  const tierN = (tr) => people.filter((p) => p.tier === tr).length;
  const noneN = people.filter((p) => !p.tier).length;
  const circleN = (c) => people.filter((p) => (p.circles || []).includes(c)).length;
  const noCircleN = people.filter((p) => !(p.circles || []).length).length;
  const relOf = (p) => (p.relationship || '').trim();
  const relN = (r) => people.filter((p) => relKey(p) === r).length;
  const noRelN = people.filter((p) => !relOf(p)).length;
  const recent = people.filter((p) => p.created_at).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)).slice(0, 6);
  const F = state.peopleFilter;
  const chk = (on, label, n) => `<span class="box" aria-hidden="true"></span><span class="t">${esc(label)}</span><span class="n">${n}</span>`;
  $view.innerHTML = `
    <div class="people-wrap"><div class="people-side">
      <input class="search" id="q" type="search" placeholder="Search name, role, alias…" value="${esc(F.q)}" autocomplete="off">
      <div class="fgroup"><div class="flabel"><span>Tiers</span>${F.tiers.size ? '<button class="mini" data-clear="tiers">Clear</button>' : ''}</div>
        <div class="checklist" id="tierList">${TIERS.map((t) => `<button class="chk ${F.tiers.has(t) ? 'on' : ''}" data-tier="${t}" aria-pressed="${F.tiers.has(t)}">${chk(0, `Tier ${t}`, tierN(t))}</button>`).join('')}
        <button class="chk ${F.tiers.has('__none') ? 'on' : ''}" data-tier="__none" aria-pressed="${F.tiers.has('__none')}">${chk(0, 'Unassigned', noneN)}</button></div></div>
      <div class="fgroup"><div class="flabel"><span>Relationship</span>${F.rels.size ? '<button class="mini" data-clear="rels">Clear</button>' : ''}</div>
        <div class="checklist" id="relList">${RELS.map((r) => `<button class="chk ${F.rels.has(r) ? 'on' : ''}" data-rel="${r}" aria-pressed="${F.rels.has(r)}">${chk(0, relLabel(r), relN(r))}</button>`).join('')}
        <button class="chk ${F.rels.has('OTHER') ? 'on' : ''}" data-rel="OTHER" aria-pressed="${F.rels.has('OTHER')}">${chk(0, 'Other', relN('OTHER'))}</button>
        <button class="chk ${F.rels.has('__none') ? 'on' : ''}" data-rel="__none" aria-pressed="${F.rels.has('__none')}">${chk(0, 'Uncategorized', noRelN)}</button></div></div>
      <div class="fgroup"><div class="flabel"><span>Circles</span>${F.circles.size ? '<button class="mini" data-clear="circles">Clear</button>' : ''}</div>
        <div class="checklist" id="circleList">${circles.map((c) => `<button class="chk ${F.circles.has(c) ? 'on' : ''}" data-circle="${esc(c)}" aria-pressed="${F.circles.has(c)}">${chk(0, c, circleN(c))}</button>`).join('')}
        <button class="chk ${F.circles.has('__none') ? 'on' : ''}" data-circle="__none" aria-pressed="${F.circles.has('__none')}">${chk(0, 'Unassigned', noCircleN)}</button></div></div>
      ${recent.length ? `<div class="fgroup recent-only"><div class="flabel"><span>Recently added</span></div>
        <div class="checklist">${recent.map((p) => `<a class="chk" href="#/p/${p.id}"><span class="t">${esc(p.name)}</span>${p.tier ? `<span class="tierb">Tier ${p.tier}</span>` : ''}<span class="n">added ${ago(dayOf(p.created_at))}</span></a>`).join('')}</div></div>` : ''}
      <div id="count" class="count"></div>
    </div>
    <ul class="list card" id="plist"></ul></div>`;
  const draw = () => {
    const needle = F.q.trim().toLowerCase();
    const rows = people.filter((p) =>
      (!F.tiers.size || F.tiers.has(p.tier) || (F.tiers.has('__none') && !p.tier)) &&
      (!F.circles.size || (p.circles || []).some((c) => F.circles.has(c)) || (F.circles.has('__none') && !(p.circles || []).length)) &&
      (!F.rels.size || F.rels.has(relKey(p)) || (F.rels.has('__none') && !relOf(p))) &&
      (!needle || [p.name, ...(p.aliases || []), p.role, p.dept, p.relationship].some((s) => (s || '').toLowerCase().includes(needle))));
    document.getElementById('plist').innerHTML = rows.length ? rows.map((p) => personRow(p, personStatus(p))).join('') : '<li class="empty">No matches.</li>';
    document.getElementById('count').textContent = rows.length === people.length ? `${people.length} records` : `${rows.length} of ${people.length}`;
  };
  const qi = document.getElementById('q');
  qi.oninput = () => { F.q = qi.value; draw(); };
  const toggle = (set, key, btn) => {
    set.has(key) ? set.delete(key) : set.add(key);
    btn.classList.toggle('on', set.has(key)); btn.setAttribute('aria-pressed', set.has(key));
    renderPeople();
  };
  $view.querySelectorAll('[data-tier]').forEach((b) => (b.onclick = () => toggle(F.tiers, b.dataset.tier, b)));
  $view.querySelectorAll('[data-circle]').forEach((b) => (b.onclick = () => toggle(F.circles, b.dataset.circle, b)));
  $view.querySelectorAll('[data-rel]').forEach((b) => (b.onclick = () => toggle(F.rels, b.dataset.rel, b)));
  $view.querySelectorAll('[data-clear]').forEach((b) => (b.onclick = () => {
    ({ tiers: F.tiers, circles: F.circles, rels: F.rels }[b.dataset.clear]).clear(); renderPeople();
  }));
  draw();
}

// ---------- calendar ----------
export async function renderCalendar() {
  setHead({ kicker: 'Schedule', title: 'Calendar', tab: 'calendar', add: true });
  const [people, fus, evs, tasks, ints] = await Promise.all([loadPeople(), openFollowups(), loadEvents(), openTasksSoft(),
    q(sb.from('interactions').select('id,kind,happened_at,summary,duration_min,person:people(id,name)').order('happened_at', { ascending: false }).limit(2000))]);
  const t = today();
  if (!state.cal) state.cal = { y: +t.slice(0, 4), m: +t.slice(5, 7) - 1, sel: t };
  const C = state.cal;
  const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const buildEvents = () => {
    const ev = {}; const add = (d, e) => (ev[d] ||= []).push(e);
    fus.filter((f) => f.due_date).forEach((f) => add(f.due_date, { kind: 'fu', f, cls: f.due_date < t ? 'red' : f.due_date === t ? 'amber' : 'gray' }));
    tasks.filter((x) => x.due_date).forEach((x) => add(x.due_date, { kind: 'task', t: x, cls: x.due_date < t ? 'red' : x.due_date === t ? 'amber' : 'gray' }));
    evs.forEach((e) => add(e.event_date, { kind: 'ev', e, cls: e.event_date < t ? 'gray' : 'amber' }));
    ints.forEach((i) => { if (i.happened_at) add(i.happened_at.slice(0, 10), { kind: 'int', i, cls: 'past' }); });
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
    const items = (ev[C.sel] || []).sort((a, b) => ({ red: 0, amber: 1, gray: 2, past: 3 }[a.cls] - { red: 0, amber: 1, gray: 2, past: 3 }[b.cls]));
    const fuItems = items.filter((e) => e.kind === 'fu').map((e) => e.f);
    const taskItems = items.filter((e) => e.kind === 'task').map((e) => e.t);
    const evItems = items.filter((e) => e.kind === 'ev').map((e) => e.e);
    const intItems = items.filter((e) => e.kind === 'int').map((e) => e.i);
    const pItems = items.filter((e) => e.kind === 'bday' || e.kind === 'cad');
    const monthName = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    // all events: upcoming first (grouped by month), then past
    const upcomingEvs = evs.filter((e) => e.event_date >= t).sort((a, b) => (a.event_date < b.event_date ? -1 : 1));
    const pastEvs = evs.filter((e) => e.event_date < t).sort((a, b) => (a.event_date < b.event_date ? 1 : -1));
    const byMonth = {};
    upcomingEvs.forEach((e) => { const m = e.event_date.slice(0, 7); (byMonth[m] ||= []).push(e); });
    const monthGroups = Object.keys(byMonth).sort().map((m) => ({
      label: new Date(m + '-02T12:00:00').toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      evs: byMonth[m],
    }));
    $view.innerHTML = `
      <div class="cal-bar"><span class="mo">${esc(monthName)}</span>
        <button class="pill" id="calAddEv">+ Event</button>
        <button class="pill" id="calToday">Today</button>
        <button class="iconbtn" id="calPrev" aria-label="Previous month"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <button class="iconbtn" id="calNext" aria-label="Next month"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button></div>
      <div id="evSlot"></div>
      <div class="cal"><div class="cal-dow">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<div>${x}</div>`).join('')}</div><div class="cal-grid">${cells.join('')}</div></div>
      ${sec(new Date(C.sel + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }), items.length)}
      ${!items.length ? '<div class="card empty">Nothing scheduled.</div>' : ''}
      ${evItems.length ? `<div style="margin-bottom:${(pItems.length || fuItems.length) ? 8 : 0}px">${evList(evItems, '')}</div>` : ''}
      ${pItems.length ? `<ul class="list card">${pItems.map((e) => personRow(e.p, e.kind === 'bday' ? st(C.sel === t ? 'amber' : 'gray', 'Birthday') : st(e.cls, e.cls === 'red' ? dueInfo(e.p).label : 'Check-in due'))).join('')}</ul>` : ''}
      ${fuItems.length ? `<div style="margin-top:${(pItems.length || evItems.length) ? 8 : 0}px">${fuList(fuItems, '')}</div>` : ''}
      ${taskItems.length ? `<div style="margin-top:${(pItems.length || evItems.length || fuItems.length) ? 8 : 0}px">${taskList(taskItems, '')}</div>` : ''}
      ${intItems.length ? `<div style="margin-top:12px"><div class="flabel"><span>Past interactions</span></div><ul class="list card">${intItems.map((i) => {
        const who = i.person ? `<a href="#/p/${i.person.id}">${esc(i.person.name)}</a>` : '<span class="meta">No person linked</span>';
        return `<li class="fu past"><div class="main"><span class="t">${who}</span><span class="meta">${st('gray', i.kind)}${i.duration_min ? `<span>${i.duration_min} min</span>` : ''}${i.summary ? `<span>${esc(i.summary.slice(0, 160))}</span>` : ''}</span></div></li>`;
      }).join('')}</ul></div>` : ''}
      ${sec('Upcoming events', upcomingEvs.length, '', upcomingEvs.length ? 'amber' : '')}
      ${monthGroups.length ? monthGroups.map((g) => `<div class="flabel" style="margin-top:10px"><span>${esc(g.label)}</span></div>${evList(g.evs, '', true)}`).join('') : '<div class="card empty">No upcoming events.</div>'}
      ${pastEvs.length ? `${sec('Past events', pastEvs.length)}${evList(pastEvs.slice(0, 12), '', true)}` : ''}`;
    $view.querySelectorAll('[data-day]').forEach((b) => (b.onclick = () => { C.sel = b.dataset.day; draw(); }));
    document.getElementById('calPrev').onclick = () => { C.m -= 1; if (C.m < 0) { C.m = 11; C.y -= 1; } draw(); };
    document.getElementById('calNext').onclick = () => { C.m += 1; if (C.m > 11) { C.m = 0; C.y += 1; } draw(); };
    document.getElementById('calToday').onclick = () => { C.y = +t.slice(0, 4); C.m = +t.slice(5, 7) - 1; C.sel = t; draw(); };
    document.getElementById('calAddEv').onclick = () => openEventForm(document.getElementById('evSlot'), { date: C.sel, people, onDone: renderCalendar });
    bindFollowups(renderCalendar);
    bindTasks(renderCalendar);
    bindEvents(renderCalendar, $view, (id) => editEvent(id, document.getElementById('evSlot'), renderCalendar));
  };
  draw();
}
