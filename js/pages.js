// Pages: the main views. Each renders into $view and wires its own events.

import { sb, q, loadPeople, openFollowups, loadEvents, openTasksSoft } from './db.js';
import { $view, $kicker, setHead, st, sec, monoDate, initials, personRow, personStatus, personMeta, kickerDate, openPanel, panelHead, closePanel } from './ui.js';
import { today, fmtDate, daysBetween, addDays, ago, dayOf, streakOf, dueInfo, upcomingBirthdays, agoShort, feedDay, esc } from './utils.js';
import { state, TIERS, KINDS, RELS } from './config.js';
import { fuItem, fuList, bindFollowups, nextTouch, ntouch } from './followups.js';
import { taskItem, taskList, bindTasks, openTaskForm } from './tasks.js';
import { evList, bindEvents, openEventForm, editEvent } from './events.js';
import { newFollowup } from './new.js';

// ---------- dashboard = the big picture. No action items live here. ----------
const REL_COLORS = { professional: '#0a84ff', friend: '#30d158', family: '#bf5af2', customer: '#ff9f0a', prospect: '#ff453a', business: '#64d2ff', '': '#8e8e93' };
const REL_LABELS = { professional: 'work', friend: 'friends', family: 'family', customer: 'customers', prospect: 'prospects', business: 'business', '': 'uncategorized' };
export async function renderDashboard() {
  setHead({ kicker: 'Network overview', title: 'Dashboard', tab: 'dashboard', add: true });
  const t = today();
  const [people, intRows] = await Promise.all([loadPeople(),
    q(sb.from('interactions').select('id,happened_at').gte('happened_at', addDays(t, -63)).limit(2000))]);
  const streak = streakOf(intRows, t);
  const ints7 = intRows.filter((r) => r.happened_at && r.happened_at >= addDays(t, -7)).length;
  const newMonth = people.filter((p) => p.created_at && p.created_at.slice(0, 7) === t.slice(0, 7)).length;
  const stale = people.filter((p) => !p.cadence_days && p.last_contact && daysBetween(p.last_contact, t) > 60)
    .sort((a, b) => daysBetween(b.last_contact, t) - daysBetween(a.last_contact, t)).slice(0, 8);
  const bdays = upcomingBirthdays(people, 21);
  const relN = {};
  people.forEach((p) => { const r = (p.relationship || '').trim(); relN[r] = (relN[r] || 0) + 1; });
  const relOrder = ['professional', 'friend', 'family', 'customer', 'prospect', 'business', ''];
  const bar = relOrder.filter((r) => relN[r]).map((r) =>
    `<span style="width:${(relN[r] / people.length * 100).toFixed(1)}%;background:${REL_COLORS[r]}" title="${REL_LABELS[r]}: ${relN[r]}"></span>`).join('');
  const legend = relOrder.filter((r) => relN[r]).map((r) =>
    `<span><i class="dotk" style="background:${REL_COLORS[r]}"></i><b>${relN[r]}</b> ${REL_LABELS[r]}</span>`).join('');
  $view.innerHTML = `
    <div class="stats">
      <span class="stat"><span class="k">People</span><span class="v">${people.length}</span></span>
      <span class="stat"><span class="k">Added · ${t.slice(0, 7)}</span><span class="v">${newMonth}</span></span>
      <span class="stat"><span class="k">Day streak</span><span class="v">${streak ? streak : '–'}</span></span>
      <span class="stat ${stale.length ? 'red' : ''}"><span class="k">Going stale</span><span class="v">${stale.length}</span></span>
    </div>
    <div class="card" style="margin-top:12px;padding:14px">
      ${sec('Network mix')}
      <div class="relbar">${bar}</div>
      <div class="rel-legend">${legend}</div>
      ${relN[''] ? `<p class="note">${relN['']} people still need a relationship category.</p>` : ''}
    </div>
    <div class="dash" style="margin-top:12px"><div class="dash-main">
      ${sec('Going stale', stale.length, '', stale.length ? 'red' : '')}
      ${stale.length ? `<ul class="list card">${stale.map((p) => personRow(p, st('gray', ago(p.last_contact)))).join('')}</ul>` : '<div class="card empty">Nobody\u2019s drifting. The cadences are holding.</div>'}
    </div><div class="dash-side">
      ${sec('Conversations · 7 days', ints7)}
      <div class="card pulse"><div class="pulse-row"><span>Logged this week</span><b>${ints7}</b></div>
      <div class="pulse-row"><span>Day streak</span><b>${streak ? streak + '-day' : '–'}</b></div></div>
      ${bdays.length ? `${sec('Birthdays · next 3 weeks', bdays.length)}<ul class="list card">${bdays.map((x) => personRow(x.p, st(x.in <= 1 ? 'amber' : 'gray', x.in === 0 ? 'today' : x.in === 1 ? 'tomorrow' : `in ${x.in}d`))).join('')}</ul>` : ''}
    </div></div>
    <div class="linkrow"><a href="#/password">Set password</a><a href="#" id="signout">Sign out</a></div>`;
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
const withBadge = (html, label, cls) => html.replace('<div class="main">', `${badge(label, cls)}<div class="main">`);
export async function renderActions() {
  setHead({ kicker: 'Follow-ups + tasks', title: 'Actions', tab: 'actions', add: true });
  const s = state.actionStatus; // open | parked | done
  const ty = state.actionType;   // all | fu | task
  const [fus, taskRes] = await Promise.all([
    q(sb.from('follow_ups').select('id,title,due_date,status,created_at,completed_at,person:people(id,name,tier)').limit(300)),
    sb.from('tasks').select('id,title,due_date,status,created_at,completed_at,person:people(id,name,tier)').limit(300),
  ]);
  const tasks = taskRes.error ? [] : (taskRes.data || []);
  const fuOpen = (f) => f.status === 'open', fuParked = (f) => f.status === 'parked', fuDone = (f) => f.status === 'closed';
  const tOpen = (x) => x.status === 'open', tDone = (x) => x.status === 'done';
  const match = { open: (f) => fuOpen(f), parked: (f) => fuParked(f), done: (f) => fuDone(f) };
  const tmatch = { open: tOpen, parked: () => false, done: tDone };
  let items = [
    ...fus.filter(match[s]).map((f) => ({ kind: 'fu', due: f.due_date, created: f.created_at, html: withBadge(fuItem(f), 'follow-up', 'fu') })),
    ...tasks.filter(tmatch[s]).map((x) => ({ kind: 'task', due: x.due_date, created: x.created_at, html: withBadge(taskItem(x), 'task', 'task') })),
  ].filter((i) => ty === 'all' || i.kind === ty);
  items.sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : (a.created < b.created ? 1 : -1));
  const nOpen = fus.filter(fuOpen).length + tasks.filter(tOpen).length;
  const nParked = fus.filter(fuParked).length;
  const nDone = fus.filter(fuDone).length + tasks.filter(tDone).length;
  const seg = (k, label, n) => `<button class="pill ${k === s ? 'on' : ''}" data-s="${k}" role="tab" aria-selected="${k === s}">${label} · ${n}</button>`;
  const typ = (k, label) => `<button class="pill ${k === ty ? 'on' : ''}" data-t="${k}">${label}</button>`;
  $view.innerHTML = `
    <div class="cal-bar"><div class="pills" role="tablist">${seg('open', 'Open', nOpen)}${seg('parked', 'Parked', nParked)}${seg('done', 'Done', nDone)}</div>
      <button class="pill" id="actAddFu">+ Follow-up</button><button class="pill" id="actAddTask">+ Task</button></div>
    <div class="pills" style="margin:10px 0" role="tablist">${typ('all', 'All')}${typ('fu', 'Follow-ups')}${typ('task', 'Tasks')}</div>
    <div class="card">${items.length ? `<ul class="list">${items.map((i) => i.html).join('')}</ul>` : '<div class="empty">Nothing here.</div>'}</div>`;
  $view.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { state.actionStatus = b.dataset.s; renderActions(); }));
  $view.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { state.actionType = b.dataset.t; renderActions(); }));
  document.getElementById('actAddFu').onclick = () => newFollowup();
  document.getElementById('actAddTask').onclick = async () => { const people = await loadPeople(); openPanel(); panelHead({ kicker: 'New', title: 'New task' }); openTaskForm($pBody, { people, onDone: () => { closePanel(); renderActions(); } }); };
  bindFollowups(renderActions);
  bindTasks(renderActions);
}
// ---------- recent activity ----------
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
export async function renderRecent() {
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
  const relN = (r) => people.filter((p) => relOf(p) === r).length;
  const noRelN = people.filter((p) => !relOf(p)).length;
  const relLabel = (r) => r === 'professional' ? 'Work' : r[0].toUpperCase() + r.slice(1) + 's';
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
      (!F.rels.size || F.rels.has(relOf(p)) || (F.rels.has('__none') && !relOf(p))) &&
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
  const [people, fus, evs, tasks] = await Promise.all([loadPeople(), openFollowups(), loadEvents(), openTasksSoft()]);
  const t = today();
  if (!state.cal) state.cal = { y: +t.slice(0, 4), m: +t.slice(5, 7) - 1, sel: t };
  const C = state.cal;
  const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const buildEvents = () => {
    const ev = {}; const add = (d, e) => (ev[d] ||= []).push(e);
    fus.filter((f) => f.due_date).forEach((f) => add(f.due_date, { kind: 'fu', f, cls: f.due_date < t ? 'red' : f.due_date === t ? 'amber' : 'gray' }));
    tasks.filter((x) => x.due_date).forEach((x) => add(x.due_date, { kind: 'task', t: x, cls: x.due_date < t ? 'red' : x.due_date === t ? 'amber' : 'gray' }));
    evs.forEach((e) => add(e.event_date, { kind: 'ev', e, cls: e.event_date < t ? 'gray' : 'amber' }));
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
    const items = (ev[C.sel] || []).sort((a, b) => ({ red: 0, amber: 1, gray: 2 }[a.cls] - { red: 0, amber: 1, gray: 2 }[b.cls]));
    const fuItems = items.filter((e) => e.kind === 'fu').map((e) => e.f);
    const taskItems = items.filter((e) => e.kind === 'task').map((e) => e.t);
    const evItems = items.filter((e) => e.kind === 'ev').map((e) => e.e);
    const pItems = items.filter((e) => e.kind === 'bday' || e.kind === 'cad');
    const monthName = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
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
      ${taskItems.length ? `<div style="margin-top:${(pItems.length || evItems.length || fuItems.length) ? 8 : 0}px">${taskList(taskItems, '')}</div>` : ''}`;
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
