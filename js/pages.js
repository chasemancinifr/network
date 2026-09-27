// Pages: the nine main views. Each renders into $view and wires its own events.

import { sb, q, loadPeople, openFollowups, loadEvents, openTasksSoft } from './db.js';
import { $view, $kicker, setHead, st, sec, monoDate, initials, personRow, personStatus, personMeta, kickerDate } from './ui.js';
import { today, fmtDate, daysBetween, addDays, ago, dayOf, streakOf, dueInfo, upcomingBirthdays, agoShort, feedDay, esc } from './utils.js';
import { state, TIERS, KINDS } from './config.js';
import { fuItem, fuList, bindFollowups, nextTouch, ntouch } from './followups.js';
import { taskItem, taskList, bindTasks, openTaskForm } from './tasks.js';
import { evList, bindEvents, openEventForm, editEvent } from './events.js';

// ---------- today = the dashboard (same widgets everywhere; two columns on desktop) ----------
export async function renderToday() {
  setHead({ kicker: kickerDate(), title: 'Today', tab: 'today', add: true });
  const t = today();
  const [people, fus, evs, tasks, intRows, intsMonth] = await Promise.all([loadPeople(), openFollowups(), loadEvents(), openTasksSoft(),
    q(sb.from('interactions').select('id,happened_at').gte('happened_at', addDays(t, -63)).limit(2000)),
    q(sb.from('interactions').select('id').gte('happened_at', t.slice(0, 8) + '01'))]);
  const ints7 = intRows.filter((r) => r.happened_at && r.happened_at >= addDays(t, -7)).length;
  const streak = streakOf(intRows, t);
  const week = addDays(t, 7);
  const overdue = people.map((p) => ({ p, d: dueInfo(p) })).filter((x) => x.d && x.d.overdue);
  const upcoming = people.map((p) => ({ p, d: dueInfo(p) })).filter((x) => x.d && !x.d.overdue);
  const bdays = upcomingBirthdays(people, 21);
  const lateFus = fus.filter((f) => f.due_date && f.due_date < t);
  const todayFus = fus.filter((f) => f.due_date === t);
  const weekFus = fus.filter((f) => f.due_date && f.due_date > t && f.due_date <= week);
  const lateTasks = tasks.filter((x) => x.due_date && x.due_date < t);
  const todayTasks = tasks.filter((x) => x.due_date === t);
  const weekTasks = tasks.filter((x) => x.due_date && x.due_date > t && x.due_date <= week);
  const nDueToday = todayFus.length + todayTasks.length;
  const nOver = overdue.length + lateFus.length + lateTasks.length;

  // attention queue: overdue people + overdue follow-ups, most overdue first
  const attn = [
    ...overdue.map((x) => ({ days: -x.d.left, html: personRow(x.p, st('red', x.d.label)) })),
    ...lateFus.map((f) => ({ days: daysBetween(f.due_date, t), html: fuItem(f) })),
    ...lateTasks.map((x) => ({ days: daysBetween(x.due_date, t), html: taskItem(x) })),
  ].sort((a, b) => b.days - a.days);

  // this week: today through the next 7 days
  const weekEvs = evs.filter((e) => e.event_date >= t && e.event_date <= week);

  // going stale: no cadence, last real contact 60+ days ago
  const stale = people.filter((p) => !p.cadence_days && p.last_contact && daysBetween(p.last_contact, t) > 60)
    .sort((a, b) => daysBetween(b.last_contact, t) - daysBetween(a.last_contact, t)).slice(0, 8);

  // network pulse
  const tierN = (tr) => people.filter((p) => p.tier === tr).length;
  const newThisMonth = people.filter((p) => p.created_at && p.created_at.slice(0, 7) === t.slice(0, 7)).length;

  $view.innerHTML = `
    <div class="stats">
      <a class="stat ${nOver ? 'red' : ''}" href="#/overdue"><span class="k">Overdue</span><span class="v">${nOver}</span></a>
      <a class="stat ${nDueToday ? 'amber' : ''}" href="#/calendar"><span class="k">${nDueToday ? '<i class="dot"></i>' : ''}Due today</span><span class="v">${nDueToday}</span></a>
      <a class="stat" href="#/followups"><span class="k">Open</span><span class="v">${fus.length}</span></a>
      <a class="stat" href="#/calendar"><span class="k">Bdays · 21d</span><span class="v">${bdays.length}</span></a>
    </div>
    <div class="dash"><div class="dash-main">
      ${sec('Needs attention', attn.length, '', attn.length ? 'red' : '')}
      ${attn.length ? `<ul class="list card">${attn.map((a) => a.html).join('')}</ul>` : '<div class="card empty">All clear.</div>'}
      ${(weekEvs.length || weekFus.length || weekTasks.length) ? `${sec('This week', weekEvs.length + weekFus.length + weekTasks.length, '<a href="#/calendar">Calendar →</a>', 'amber')}
      <div id="evSlot"></div>
      ${weekEvs.length ? evList(weekEvs, '', true) : ''}
      ${weekFus.length ? `<div style="margin-top:8px">${fuList(weekFus, '')}</div>` : ''}
      ${weekTasks.length ? `<div style="margin-top:8px">${taskList(weekTasks, '')}</div>` : ''}` : '<div id="evSlot"></div>'}
      ${sec('Open follow-ups', fus.length, '<a href="#/followups">All →</a>')}
      ${fuList(fus, 'All clear.')}
      ${upcoming.length ? `${sec('On cadence', upcoming.length)}<ul class="list card">${upcoming.map((x) => personRow(x.p, personStatus(x.p))).join('')}</ul>` : ''}
    </div><div class="dash-side">
      ${bdays.length ? `${sec('Birthdays · next 3 weeks', bdays.length)}<ul class="list card">${bdays.map((x) => personRow(x.p, st(x.in <= 1 ? 'amber' : 'gray', x.in === 0 ? 'today' : x.in === 1 ? 'tomorrow' : `in ${x.in}d`))).join('')}</ul>` : ''}
      ${stale.length ? `${sec('Going stale', stale.length)}<ul class="list card">${stale.map((p) => personRow(p, st('gray', ago(p.last_contact)))).join('')}</ul>` : ''}
      ${sec('Network pulse')}
      <div class="card pulse">
        <div class="pulse-tiers">${TIERS.map((tr) => `<span><b>${tierN(tr)}</b>Tier ${tr}</span>`).join('')}</div>
        <div class="pulse-row"><span>People</span><b>${people.length}</b></div>
        <div class="pulse-row"><span>New this month</span><b>${newThisMonth}</b></div>
        <div class="pulse-row"><span>Conversations · 7 days</span><b>${ints7}</b></div>
        <div class="pulse-row"><span>Conversations · this month</span><b>${intsMonth.length}</b></div>
        <div class="pulse-row"><span>🔥 Streak</span><b>${streak ? streak + '-day' : '–'}</b></div>
      </div>
    </div></div>
    <div class="linkrow"><a href="#/password">Set password</a><a href="#" id="signout">Sign out</a></div>`;
  bindFollowups(renderToday);
  bindTasks(renderToday);
  bindEvents(renderToday, $view, (id) => editEvent(id, document.getElementById('evSlot'), renderToday));
  document.getElementById('signout').onclick = async (e) => { e.preventDefault(); await sb.auth.signOut(); };
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

// ---------- follow-ups (scheduled) ----------
export async function renderFollowups() {
  setHead({ kicker: 'Scheduled', title: 'Follow-ups', tab: 'followups', add: true });
  const s = state.fuTab;
  let qq = sb.from('follow_ups').select('id,title,due_date,status,created_at,completed_at,person:people(id,name,tier)').eq('status', s);
  qq = s === 'closed' ? qq.order('completed_at', { ascending: false, nullsFirst: false }).limit(100)
    : qq.order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
  const fus = await q(qq);
  $view.innerHTML = `
    <div class="pills" role="tablist">${['open', 'parked', 'closed'].map((k) => `<button class="pill ${k === s ? 'on' : ''}" data-seg="${k}" role="tab" aria-selected="${k === s}">${k}</button>`).join('')}</div>
    <div class="count">${fus.length} ${s === 'closed' ? 'completed (latest 100)' : s}</div>
    ${fuList(fus, 'Nothing here.')}`;
  $view.querySelectorAll('[data-seg]').forEach((b) => (b.onclick = () => { state.fuTab = b.dataset.seg; renderFollowups(); }));
  bindFollowups(renderFollowups);
}

// ---------- tasks (general to-dos; follow-ups stay separate) ----------
export async function renderTasks() {
  setHead({ kicker: 'Action items', title: 'Tasks', tab: 'tasks', add: true });
  const s = state.taskTab;
  let tasks;
  try {
    let qq = sb.from('tasks').select('id,title,detail,due_date,status,created_at,completed_at,person:people(id,name,tier)').eq('status', s);
    qq = s === 'done' ? qq.order('completed_at', { ascending: false, nullsFirst: false }).limit(100)
      : qq.order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
    tasks = await q(qq);
  } catch (e) {
    if (/could not find the table|relation .* does not exist/i.test(e.message || '')) {
      $view.innerHTML = `<div class="card"><div class="empty">Tasks needs a one-time setup.<br><br>Run <span class="mono">supabase/migrations/0002_create_tasks.sql</span> in Supabase → SQL Editor, then reload.</div></div>`;
      return;
    }
    throw e;
  }
  const people = await loadPeople();
  const t = today();
  if (s === 'done') {
    $view.innerHTML = `
      <div class="cal-bar"><div class="pills" role="tablist">${['open', 'done'].map((k) => `<button class="pill ${k === s ? 'on' : ''}" data-seg="${k}" role="tab" aria-selected="${k === s}">${k}</button>`).join('')}</div>
        <button class="pill" id="taskAddBtn">+ Task</button></div>
      <div id="taskSlot"></div>
      ${sec('Completed', tasks.length)}${taskList(tasks, 'Nothing completed yet.')}`;
  } else {
    const late = tasks.filter((x) => x.due_date && x.due_date < t);
    const todayT = tasks.filter((x) => x.due_date === t);
    const upcoming = tasks.filter((x) => x.due_date && x.due_date > t);
    const nodate = tasks.filter((x) => !x.due_date);
    $view.innerHTML = `
      <div class="cal-bar"><div class="pills" role="tablist">${['open', 'done'].map((k) => `<button class="pill ${k === s ? 'on' : ''}" data-seg="${k}" role="tab" aria-selected="${k === s}">${k}</button>`).join('')}</div>
        <button class="pill" id="taskAddBtn">+ Task</button></div>
      <div id="taskSlot"></div>
      ${late.length ? `${sec('Overdue', late.length, '', 'red')}${taskList(late, '')}` : ''}
      ${sec('Today', todayT.length, '', todayT.length ? 'amber' : '')}${todayT.length ? taskList(todayT, '') : ''}
      ${sec('Upcoming', upcoming.length)}${upcoming.length ? taskList(upcoming, '') : ''}
      ${sec('No due date', nodate.length)}${nodate.length ? taskList(nodate, '') : ''}
      ${!tasks.length ? '<div class="card empty">No open tasks. Enjoy the clear.</div>' : ''}`;
  }
  const slot = document.getElementById('taskSlot');
  document.getElementById('taskAddBtn').onclick = () => openTaskForm(slot, { people, onDone: renderTasks });
  $view.querySelectorAll('[data-seg]').forEach((b) => (b.onclick = () => { state.taskTab = b.dataset.seg; renderTasks(); }));
  bindTasks(renderTasks);
}

// ---------- events ----------
export async function renderEvents() {
  setHead({ kicker: 'Scheduled', title: 'Events', tab: 'events', add: true });
  const [people, evs] = await Promise.all([loadPeople(), loadEvents()]);
  const t = today();
  const upcoming = evs.filter((e) => e.event_date >= t);
  const past = evs.filter((e) => e.event_date < t).reverse();
  $view.innerHTML = `
    <div class="cal-bar"><span class="mo">${upcoming.length} upcoming</span>
      <button class="pill" id="evAddBtn">+ Event</button></div>
    <div id="evSlot"></div>
    <div class="events-wrap"><div>
      ${sec('Upcoming', upcoming.length, '', upcoming.length ? 'amber' : '')}
      ${evList(upcoming, 'No upcoming events.', true)}
    </div><div>
      ${past.length ? `${sec('Past', past.length)}<div class="past">${evList(past, '', true)}</div>` : ''}
    </div></div>`;
  const slot = document.getElementById('evSlot');
  document.getElementById('evAddBtn').onclick = () => openEventForm(slot, { people, onDone: renderEvents });
  bindEvents(renderEvents, $view, (id) => editEvent(id, slot, renderEvents));
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
  const recent = people.filter((p) => p.created_at).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)).slice(0, 6);
  const F = state.peopleFilter;
  const chk = (on, label, n) => `<span class="box" aria-hidden="true"></span><span class="t">${esc(label)}</span><span class="n">${n}</span>`;
  $view.innerHTML = `
    <div class="people-wrap"><div class="people-side">
      <input class="search" id="q" type="search" placeholder="Search name, role, alias…" value="${esc(F.q)}" autocomplete="off">
      <div class="fgroup"><div class="flabel"><span>Tiers</span>${F.tiers.size ? '<button class="mini" data-clear="tiers">Clear</button>' : ''}</div>
        <div class="checklist" id="tierList">${TIERS.map((t) => `<button class="chk ${F.tiers.has(t) ? 'on' : ''}" data-tier="${t}" aria-pressed="${F.tiers.has(t)}">${chk(0, `Tier ${t}`, tierN(t))}</button>`).join('')}
        <button class="chk ${F.tiers.has('__none') ? 'on' : ''}" data-tier="__none" aria-pressed="${F.tiers.has('__none')}">${chk(0, 'Unassigned', noneN)}</button></div></div>
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
  $view.querySelectorAll('[data-clear]').forEach((b) => (b.onclick = () => {
    (b.dataset.clear === 'tiers' ? F.tiers : F.circles).clear(); renderPeople();
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
