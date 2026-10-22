// Pages: the main views. Each renders into $view and wires its own events.

import { sb, q, loadPeople, withArchivedPerson, openFollowups, loadEvents, openTasksSoft, openActionMap, buildActionMap } from './db.js';
import { $view, $kicker, setHead, st, sec, monoDate, initials, personRow, personStatus, personMeta, kickerDate, openPanel, panelHead, closePanel, actDot, impRank, toast, $pBody, personPicker, bindPersonPickers } from './ui.js';
import { today, fmtDate, daysBetween, addDays, mondayOf, ago, dayOf, streakOf, dueInfo, upcomingBirthdays, agoShort, feedDay, esc } from './utils.js';
import { state, TIERS, KINDS, RELS, FAMILY_VALUES, FAMILY_PLURAL, ACTION_CATEGORIES, isFamilyRel } from './config.js';
// family values present, known roles first (Parent, Sibling, ...), then custom ones by count
const famOrder = (vals, n) => [...FAMILY_VALUES.filter((r) => vals.includes(r)), ...vals.filter((r) => !FAMILY_VALUES.includes(r)).sort((a, b) => n(b) - n(a) || a.localeCompare(b))];
import { fuItem, fuList, bindFollowups, nextTouch, ntouch } from './followups.js';
import { taskItem, taskList, bindTasks, openTaskForm } from './tasks.js';
import { evList, bindEvents, openEventForm, editEvent } from './events.js';
import { newFollowup } from './new.js';
import { pushSettings } from './settings.js';
import { relColor, tierColor, circleColor, relDefaultHex, tierDefaultHex, REL_KEYS, TIER_KEYS, CIRCLE_PALETTE, getColorOverrides, setColorOverride, resetColorOverrides } from './colors.js';

// ---------- dashboard = the big picture ----------
// relationship value as-is (Title Case free text); '' for blank. Custom values
// stand on their own — no OTHER bucket.
const relKey = (p) => (p.relationship || '').trim();
// labels show the real stored value — no aliases ("Professional" was showing as "Work")
const relLabel = (r) => r || 'Uncategorized';
export async function renderDashboard() {
  setHead({ kicker: 'Network overview', title: 'Dashboard', tab: 'dashboard', add: true });
  const t = today();
  const [people, intRows, fus, tasks, evs] = await Promise.all([loadPeople(),
    q(sb.from('interactions').select('id,happened_at').gte('happened_at', addDays(t, -63)).limit(2000)),
    openFollowups(), openTasksSoft(), loadEvents()]);
  const streak = streakOf(intRows, t);
  const ints7 = intRows.filter((r) => r.happened_at && r.happened_at >= addDays(t, -6)).length;
  const newMonth = people.filter((p) => p.created_at && p.created_at.slice(0, 7) === t.slice(0, 7)).length;
  // needs attention: Tier A/B with no logged conversation in 30+ days (never logged counts).
  // Mohawk Honda people are left out: Chase sees them daily, so a contact timer says nothing.
  const quietDays = (p) => (p.last_contact ? daysBetween(p.last_contact, t) : Infinity);
  const attentionAll = people.filter((p) => (p.tier === 'A' || p.tier === 'B') && !(p.circles || []).includes('Mohawk Honda') && quietDays(p) >= 30)
    .sort((a, b) => a.tier.localeCompare(b.tier) || quietDays(b) - quietDays(a) || a.name.localeCompare(b.name));
  const stale = attentionAll;
  const bdays = upcomingBirthdays(people, 21);

  // ---- network mix: one bar per dimension ----
  const mixParts = (entries) => {
    const total = entries.reduce((a, e) => a + e.n, 0) || 1;
    return {
      bar: entries.map((e) => `<span style="width:${(e.n / total * 100).toFixed(1)}%;background:${e.c}" title="${esc(e.l)}: ${e.n}"></span>`).join(''),
      legend: entries.map((e) => `<span><i class="dotk" style="background:${e.c}"></i><b>${e.n}</b> ${esc(e.l)}</span>`).join(''),
    };
  };
  const mixLine = (label, entries, note, group) => {
    const m = mixParts(entries.filter((e) => e.n));
    const links = entries.filter((e) => e.n).map((e) =>
      `<button class="mixlink" data-g="${group}" data-k="${esc(e.k)}" title="Show in People"><i class="dotk" style="background:${e.c}"></i><b>${e.n}</b> ${esc(e.l)}</button>`).join('');
    return `<div class="mixlabel">${esc(label)}</div><div class="relbar">${m.bar}</div><div class="rel-legend">${links}</div>${note ? `<p class="note">${note}</p>` : ''}`;
  };
  const relN = {};
  people.forEach((p) => { const k = relKey(p); relN[k] = (relN[k] || 0) + 1; });
  const relOrder = [...RELS.filter((r) => relN[r]), ...Object.keys(relN).filter((r) => r && !RELS.includes(r)).sort((a, b) => relN[b] - relN[a])];
  // family roles (Parent, Uncle, ...) roll up into one Family segment; <5 -> Other applies to the rest
  const famRoles = famOrder(Object.keys(relN).filter(isFamilyRel), (r) => relN[r]);
  const famN = famRoles.reduce((a, r) => a + relN[r], 0);
  const nonFam = relOrder.filter((r) => r && !isFamilyRel(r));
  const bigR = nonFam.filter((r) => relN[r] >= 5);
  const smallR = nonFam.filter((r) => relN[r] < 5);
  const otherN = smallR.reduce((a, r) => a + relN[r], 0);
  const segEntries = bigR.map((r) => ({ k: r, l: relLabel(r), n: relN[r], c: relColor(r) }));
  if (famN) segEntries.push({ k: '__family__', l: 'Family', n: famN, c: relColor('Family') });
  segEntries.sort((a, b) => b.n - a.n);
  const relEntries = [...segEntries,
    ...(otherN ? [{ k: '__other__', l: 'Other', n: otherN, c: relColor('__other__') }] : []),
    ...(relN[''] ? [{ k: '__none', l: 'Uncategorized', n: relN[''], c: 'var(--rel-none)' }] : [])];
  const tierEntries = [...TIERS.map((tr) => ({ k: tr, l: `Tier ${tr}`, n: people.filter((p) => p.tier === tr).length, c: tierColor(tr) })),
    { k: '__none', l: 'Unassigned', n: people.filter((p) => !p.tier).length, c: tierColor('') }];
  const circleCounts = {};
  people.forEach((p) => (p.circles || []).forEach((c) => { circleCounts[c] = (circleCounts[c] || 0) + 1; }));
  const circleEntries = Object.entries(circleCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([c, n], i) => ({ k: c, l: c, n, c: circleColor(c, i) }));

  // ---- events coming up + quick reminders ----
  const upcoming = evs.filter((e) => e.event_date >= t).slice(0, 6);
  const actMap = buildActionMap(fus, tasks);

  // ---- insights ----
  const intsPrev7 = intRows.filter((r) => r.happened_at && r.happened_at >= addDays(t, -13) && r.happened_at < addDays(t, -6)).length;
  const overdueN = fus.filter((f) => f.due_date && f.due_date < t).length + tasks.filter((x) => x.due_date && x.due_date < t).length;
  const openN = fus.length + tasks.length;
  const actEntries = Object.values(actMap).sort((a, b) => b.n - a.n);
  const top3Acts = actEntries.slice(0, 3).reduce((a, e) => a + e.n, 0);
  const insights = [];
  if (intsPrev7 > 0) {
    const pct = Math.round((ints7 - intsPrev7) / intsPrev7 * 100);
    insights.push({ c: pct >= 0 ? 'var(--rel-friend)' : 'var(--red)', t: `Conversations ${pct >= 0 ? 'up' : 'down'} ${Math.abs(pct)}% vs last week (${ints7} vs ${intsPrev7}).`, go: '#/interactions' });
  } else if (ints7 > 0) insights.push({ c: 'var(--rel-friend)', t: `${ints7} conversations logged this week — first active week in the window.`, go: '#/interactions' });
  if (overdueN > 0) insights.push({ c: 'var(--red)', t: `${overdueN} of your ${openN} open actions are overdue.`, go: '#/overdue' });
  else if (openN > 0) insights.push({ c: 'var(--rel-friend)', t: `All ${openN} open actions are on schedule — nothing overdue.`, go: '#/actions' });
  if (openN > 0 && actEntries.length >= 3) insights.push({ c: 'var(--amber)', t: `${top3Acts} of your ${openN} open actions belong to just ${Math.min(3, actEntries.length)} people.`, expand: 'conc' });
  if (circleEntries.length) insights.push({
    c: circleEntries[0].c, t: `${circleEntries[0].l} is your biggest circle — ${circleEntries[0].n} of ${people.length} people.`,
    go: () => { const F = state.peopleFilter; F.q = ''; F.tiers.clear(); F.circles.clear(); F.rels.clear(); F.circles.add(circleEntries[0].k); location.hash = '#/people'; },
  });
  const stale90List = people.filter((p) => !p.cadence_days && p.last_contact && daysBetween(p.last_contact, t) > 90)
    .sort((a, b) => daysBetween(b.last_contact, t) - daysBetween(a.last_contact, t));
  if (stale90List.length > 0) insights.push({ c: 'var(--amber)', t: `${stale90List.length} ${stale90List.length === 1 ? 'person' : 'people'} you haven't contacted in 90+ days.`, expand: 'stale' });
  const concDetail = () => {
    const byId = {}; people.forEach((p) => { byId[p.id] = p; });
    const top = Object.entries(actMap).map(([pid, e]) => ({ pid, n: e.n })).sort((a, b) => b.n - a.n).slice(0, 3);
    return `<ul class="list">${top.map((e) => { const p = byId[e.pid]; return p ? `<li class="fu"><div class="main"><span class="t"><a href="#/p/${p.id}">${esc(p.name)}</a></span><span class="meta">${e.n} open action${e.n === 1 ? '' : 's'}</span></div></li>` : ''; }).join('')}</ul>`;
  };
  const staleDetail = () => `<ul class="list">${stale90List.map((p) => personRow(p, st('gray', `${ago(p.last_contact)} ago`), actDot(actMap[p.id]))).join('')}</ul>`;
  const insightsHtml = insights.length ? `<div class="card" style="padding:6px 14px">${insights.map((ins, i) => `
    <button class="insight" data-ins="${i}" aria-expanded="false"><i class="dotk" style="background:${ins.c}"></i><span>${esc(ins.t)}</span>${ins.expand ? chevSvg : ''}</button>${ins.expand ? `<div class="insight-detail" id="insDet${i}" hidden></div>` : ''}`).join('')}</div>` : '';
  const reminders = [
    ...fus.map((f) => ({ due: f.due_date, created: f.created_at, html: withBadge(fuItem(f), 'follow-up', 'fu') })),
    ...tasks.map((x) => ({ due: x.due_date, created: x.created_at, html: withBadge(taskItem(x), 'task', 'task') })),
  ].sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : 1).slice(0, 5);

  $view.innerHTML = `
    <div class="stats">
      <span class="stat"><span class="k">People</span><span class="v">${people.length}</span></span>
      <span class="stat"><span class="k">Added \u00b7 ${t.slice(0, 7)}</span><span class="v">${newMonth}</span></span>
      <span class="stat"><span class="k">Day streak</span><span class="v">${streak ? streak : '\u2013'}</span></span>
      <span class="stat ${attentionAll.length ? 'amber' : ''}"><span class="k">Needs attention</span><span class="v">${attentionAll.length}</span></span>
    </div>
    <div class="cols" style="margin-top:12px">
    <div class="blk${insights.length ? '' : ' wide'}"><div class="card" style="padding:14px">
      ${sec('Network mix')}
      ${mixLine('Relationships', relEntries, relN[''] ? `${relN['']} people still need a relationship category.` : '', 'rels')}
      ${mixLine('Tiers', tierEntries, '', 'tiers')}
      ${mixLine('Circles \u00b7 top 8', circleEntries, '', 'circles')}
    </div></div>
    ${insights.length ? `<div class="blk">${insightsHtml}</div>` : ''}
    </div>
    <div class="dash" style="margin-top:12px"><div class="dash-main">
      ${sec('Needs attention', attentionAll.length, '', attentionAll.length ? 'amber' : '')}
      ${stale.length ? `<ul class="list card">${stale.slice(0, 8).map((p) => personRow(p, st(p.last_contact ? 'gray' : 'amber', p.last_contact ? ago(p.last_contact) : 'never logged'), actDot(actMap[p.id]))).join('')}</ul>
        <p class="note">Tier A and B, no logged conversation in 30+ days. Mohawk Honda people are left out since you see them daily.${attentionAll.length > 8 ? ` <a href="#/overdue">See all ${attentionAll.length} on the Overdue page</a>` : ''}</p>` : '<div class="card empty">Every Tier A and B person has a logged conversation in the last 30 days.</div>'}
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
  // network mix drill-in: tap a legend item to open People filtered to it
  $view.querySelectorAll('[data-ins]').forEach((b) => (b.onclick = () => {
    const ins = insights[+b.dataset.ins];
    if (typeof ins.go === 'function') { ins.go(); return; }
    if (typeof ins.go === 'string') { location.hash = ins.go; return; }
    if (ins.expand) {
      const det = document.getElementById('insDet' + b.dataset.ins);
      const opening = det.hidden;
      det.hidden = !opening;
      b.setAttribute('aria-expanded', String(opening));
      b.classList.toggle('open', opening);
      if (opening && !det.dataset.filled) { det.dataset.filled = '1'; det.innerHTML = ins.expand === 'conc' ? concDetail() : staleDetail(); }
    }
  }));
  $view.querySelectorAll('.mixlink').forEach((b) => (b.onclick = () => {
    const F = state.peopleFilter;
    F.q = ''; F.tiers.clear(); F.circles.clear(); F.rels.clear();
    if (b.dataset.g === 'rels' && b.dataset.k === '__family__') famRoles.forEach((k) => F.rels.add(k));
    else if (b.dataset.g === 'rels' && b.dataset.k === '__other__') smallR.forEach((k) => F.rels.add(k));
    else ({ rels: F.rels, tiers: F.tiers, circles: F.circles })[b.dataset.g].add(b.dataset.k);
    location.hash = '#/people';
  }));
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
  // Chase's rule: open items with no due date always show on the current
  // day — they ride along in the Due today section until they're done
  const undatedFu = fus.filter((f) => !f.due_date);
  const undatedTask = tasks.filter((x) => !x.due_date);
  const tmFu = fus.filter((f) => f.due_date === tomorrow);
  const tmTask = tasks.filter((x) => x.due_date === tomorrow);
  const weekFu = fus.filter((f) => f.due_date && f.due_date > tomorrow && f.due_date <= week);
  const weekTask = tasks.filter((x) => x.due_date && x.due_date > tomorrow && x.due_date <= week);
  const weekEvs = evs.filter((e) => e.event_date >= t && e.event_date <= week);
  const nToday = dueTodayFu.length + dueTodayTask.length + undatedFu.length + undatedTask.length;
  const nTm = tmFu.length + tmTask.length;
  const nWeek = weekFu.length + weekTask.length + weekEvs.length;
  const dayBlock = (fus_, tasks_, empty) => `
    ${fus_.length ? fuList(fus_, '') : ''}
    ${tasks_.length ? `<div style="margin-top:${fus_.length ? 8 : 0}px">${taskList(tasks_, '')}</div>` : ''}
    ${!fus_.length && !tasks_.length ? `<div class="card empty">${empty}</div>` : ''}`;
  $view.innerHTML = `
    <div class="cols">
    <div class="blk">${sec('Due today', nToday, '', nToday ? 'amber' : '')}
    ${dayBlock([...dueTodayFu, ...undatedFu], [...dueTodayTask, ...undatedTask], 'Nothing due today.')}</div>
    <div class="blk">${sec('Tomorrow', nTm, '', nTm ? 'amber' : '')}
    ${dayBlock(tmFu, tmTask, 'Nothing due tomorrow.')}</div>
    <div class="blk">${sec('Rest of the week', nWeek)}
    ${weekEvs.length ? evList(weekEvs, '', true) : ''}
    ${weekFu.length || weekTask.length ? `<div style="margin-top:${weekEvs.length ? 8 : 0}px">${dayBlock(weekFu, weekTask, '')}</div>` : (!weekEvs.length ? '<div class="card empty">Nothing else this week.</div>' : '')}</div>
    </div>
    <div id="evSlot"></div>`;
  bindFollowups(renderToday);
  bindTasks(renderToday);
  bindEvents(renderToday, $view, (id) => editEvent(id, document.getElementById('evSlot'), renderToday));
}

// ---------- overdue ----------
export async function renderOverdue() {
  setHead({ kicker: 'Attention', title: 'Overdue', tab: 'overdue', add: true });
  const [people, fus, tasks, actMap] = await Promise.all([loadPeople(), openFollowups(), openTasksSoft(), openActionMap()]);
  const t = today();
  const people_ = people.map((p) => ({ p, d: dueInfo(p) })).filter((x) => x.d && x.d.overdue);
  const late = fus.filter((f) => f.due_date && f.due_date < t);
  const lateTasks = tasks.filter((x) => x.due_date && x.due_date < t);
  // needs attention (same rule as the dashboard): Tier A/B, no logged
  // conversation in 30+ days, Mohawk Honda people excluded
  const quietDays = (p) => (p.last_contact ? daysBetween(p.last_contact, t) : Infinity);
  const attention = people.filter((p) => (p.tier === 'A' || p.tier === 'B') && !(p.circles || []).includes('Mohawk Honda') && quietDays(p) >= 30)
    .sort((a, b) => a.tier.localeCompare(b.tier) || quietDays(b) - quietDays(a) || a.name.localeCompare(b.name));
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
  $kicker.textContent = `Attention · ${attention.length + people_.length + late.length + lateTasks.length} items`;
  $view.innerHTML = `
    <div class="cols">
    ${people.some((p) => p.cadence_days) ? `<div class="blk">${sec('Cadence · reach out', people_.length, '', people_.length ? 'red' : '')}
    ${people_.length ? `<ul class="list card">${people_.map(cadRow).join('')}</ul>` : '<div class="card empty">Nobody past their cadence.</div>'}</div>` : ''}
    <div class="blk">${sec('Follow-ups past due', late.length, '', late.length ? 'red' : '')}
    ${fuList(late, 'No follow-ups past their due date.', (f) => { const fp = fullPerson(f); return ntouch(nextTouch(fp, lastById[fp.id])); })}</div>
    <div class="blk">${sec('Tasks past due', lateTasks.length, '', lateTasks.length ? 'red' : '')}
    ${taskList(lateTasks, 'No tasks past their due date.')}</div>
    <div class="blk wide">${sec('Needs attention', attention.length, '', attention.length ? 'amber' : '')}
    ${attention.length ? `<ul class="list card split2">${attention.map((p) => personRow(p, st(p.last_contact ? 'gray' : 'amber', p.last_contact ? ago(p.last_contact) : 'never logged'), actDot(actMap[p.id]))).join('')}</ul>
    <p class="note">Tier A and B, no logged conversation in 30+ days. Mohawk Honda people are left out since you see them daily.</p>` : '<div class="card empty">Every Tier A and B person has a logged conversation in the last 30 days.</div>'}</div>
    </div>`;
  bindFollowups(renderOverdue);
  bindTasks(renderOverdue);
}
// ---------- actions: follow-ups + tasks merged, one list ----------
const badge = (label, cls) => `<span class="typebadge ${cls}">${label}</span>`;
const withBadge = (html, label, cls) => html
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
    ...fus.filter(match[s]).map((f) => ({ kind: 'fu', cat: f.category || null, imp: f.importance || 'neutral', due: f.due_date, created: f.created_at, completed: f.completed_at, html: withBadge(fuItem(f), 'follow-up', 'fu') })),
    ...tasks.filter(tmatch[s]).map((x) => ({ kind: 'task', cat: x.category || null, imp: x.importance || 'neutral', due: x.due_date, created: x.created_at, completed: x.completed_at, html: withBadge(taskItem(x), 'task', 'task') })),
  ].filter((i) => (ty === 'all' || i.kind === ty) && catMatch(i));
  const baseSort = s === 'done'
    ? (a, b) => ((a.completed || '') < (b.completed || '') ? 1 : -1) // newest finished first
    : (a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : (a.created < b.created ? 1 : -1);
  if (state.actionImpSort === 'none') items.sort(baseSort);
  else { // importance sort: urgent first (desc) or neutral first (asc), existing order as tiebreak
    const dir = state.actionImpSort === 'desc' ? 1 : -1;
    items.sort((a, b) => dir * (impRank(a.imp) - impRank(b.imp)) || baseSort(a, b));
  }
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
    <div class="pills" style="margin:10px 0" role="tablist">${typ('all', 'All')}${typ('fu', 'Follow-ups')}${typ('task', 'Tasks')}<button class="pill${state.actionImpSort === 'none' ? '' : ' on'}" id="impSort" title="Sort by importance">${{ none: 'Importance', desc: 'Importance ↓', asc: 'Importance ↑' }[state.actionImpSort]}</button></div>
    ${catFilter ? `<div style="margin:0 0 10px">${catFilter}</div>` : ''}
    <div class="card">${items.length ? `<ul class="list split2">${items.map((i) => i.html).join('')}</ul>` : '<div class="empty">Nothing here.</div>'}</div>`;
  $view.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { state.actionStatus = b.dataset.s; renderActions(); }));
  $view.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { state.actionType = b.dataset.t; renderActions(); }));
  document.getElementById('impSort').onclick = () => {
    state.actionImpSort = { none: 'desc', desc: 'asc', asc: 'none' }[state.actionImpSort];
    renderActions();
  };
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
    q(sb.from('events').select('id,title,event_date,created_at,person:people!events_person_id_fkey(id,name)').order('created_at', { ascending: false }).limit(100)),
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
export async function editInteraction(id, onDone = () => renderInteractions()) {
  const it = await q(sb.from('interactions').select('id,kind,happened_at,summary,duration_min,person_id').eq('id', id).single());
  if (!it) return;
  const people = await withArchivedPerson(await loadPeople(), it.person_id);
  openPanel();
  const who = people.find((p) => p.id === it.person_id);
  panelHead({ kicker: who ? who.name : 'Interaction', title: 'Edit interaction' });
  const root = $pBody;
  root.innerHTML = `<form class="card form" id="ief">
    <div class="grid2">
      <div>${personPicker({ id: 'ie_person', people, selected: it.person_id || '' })}</div>
      <div><label class="lbl" for="ie_kind">Type</label><select class="field" id="ie_kind">${KINDS.map((k) => `<option${k === it.kind ? ' selected' : ''}>${k}</option>`).join('')}</select></div>
    </div>
    <div class="grid2">
      <div><label class="lbl" for="ie_date">Date</label><input class="field" type="date" id="ie_date" value="${esc((it.happened_at || '').slice(0, 10))}" max="${today()}"></div>
      <div><label class="lbl" for="ie_min">Minutes (optional)</label><input class="field" id="ie_min" inputmode="numeric" value="${it.duration_min ?? ''}"></div>
    </div>
    <label class="lbl" for="ie_summary">What happened</label><textarea class="field" id="ie_summary" required style="min-height:90px">${esc(it.summary || '')}</textarea>
    <div class="actions" style="margin-top:14px"><button class="btn primary">Save</button><button type="button" class="btn" id="ie_cancel">Cancel</button></div></form>`;
  bindPersonPickers(root);
  document.getElementById('ie_cancel').onclick = () => closePanel();
  document.getElementById('ief').onsubmit = async (e) => {
    e.preventDefault(); e.submitter && (e.submitter.disabled = true);
    const dm = parseInt(document.getElementById('ie_min').value, 10);
    const row = {
      person_id: document.getElementById('ie_person').value || null, kind: document.getElementById('ie_kind').value,
      happened_at: document.getElementById('ie_date').value || null, summary: document.getElementById('ie_summary').value.trim(),
      duration_min: Number.isFinite(dm) ? dm : null,
    };
    try { await q(sb.from('interactions').update(row).eq('id', id)); toast('Saved ✓'); closePanel(); onDone(); }
    catch { e.submitter && (e.submitter.disabled = false); }
  };
  document.getElementById('ie_summary').focus();
}

export async function renderInteractions() {
  setHead({ kicker: 'Conversations', title: 'Interactions', tab: 'interactions', add: true });
  const [ints, people] = await Promise.all([
    q(sb.from('interactions').select('id,kind,happened_at,summary,duration_min,person:people(id,name,tier)').order('happened_at', { ascending: false }).order('created_at', { ascending: false }).limit(500)),
    loadPeople(),
  ]);
  const t = today();
  const inLast = (n) => ints.filter((i) => i.happened_at && i.happened_at >= addDays(t, -n)).length;
  const kindN = (k) => ints.filter((i) => i.kind === k).length;
  // week-scoped insights + scoreboard: state.intWeek 0 = current week (Monday start)
  const wkStart = addDays(mondayOf(t), -7 * state.intWeek);
  const wkEnd = addDays(wkStart, 6);
  const wkLabel = state.intWeek === 0 ? 'This week' : `${monoDate(wkStart)} – ${monoDate(wkEnd)}`;
  const inWk = (d0, d1) => ints.filter((i) => i.happened_at && i.happened_at.slice(0, 10) >= d0 && i.happened_at.slice(0, 10) <= d1);
  const wkInts = inWk(wkStart, wkEnd);
  const pvInts = inWk(addDays(wkStart, -7), addDays(wkStart, -1));
  const talkCounts = {};
  wkInts.forEach((i) => { if (i.person) (talkCounts[i.person.id] ||= { p: i.person, n: 0 }).n++; });
  const topTalk = Object.values(talkCounts).sort((a, b) => b.n - a.n || a.p.name.localeCompare(b.p.name)).slice(0, 5);
  const wkMin = wkInts.reduce((a, i) => a + (i.duration_min || 0), 0);
  const wkPeople = new Set(wkInts.map((i) => i.person?.id).filter(Boolean)).size;
  const kc = {};
  wkInts.forEach((i) => { kc[i.kind] = (kc[i.kind] || 0) + 1; });
  const topKind = Object.entries(kc).sort((a, b) => b[1] - a[1])[0];
  const wkDelta = wkInts.length - pvInts.length;
  $view.innerHTML = `
    <div class="stats">
      <span class="stat"><span class="k">All time</span><span class="v">${ints.length}</span></span>
      <span class="stat"><span class="k">Last 7 days</span><span class="v">${inLast(7)}</span></span>
      <span class="stat"><span class="k">Last 30 days</span><span class="v">${inLast(30)}</span></span>
      <span class="stat"><span class="k">With notes</span><span class="v">${ints.filter((i) => i.summary).length}</span></span>
    </div>
    <div class="cal-bar"><div class="pills" role="tablist" aria-label="Week">
      <button class="pill" id="wkPrev">‹ Prev</button>
      <button class="pill" id="wkNext"${state.intWeek === 0 ? ' disabled' : ''}>Next ›</button>
      ${state.intWeek ? '<button class="pill" id="wkThis">This week</button>' : ''}
    </div><span class="mo">${esc(wkLabel)}</span></div>
    <div class="card board">
      <div class="board-head"><span>Week insights</span><span class="mono">${esc(wkLabel)}</span></div>
      <div class="stats" style="border:0;padding:0 0 4px">
        <span class="stat"><span class="k">Conversations</span><span class="v">${wkInts.length}</span></span>
        <span class="stat"><span class="k">vs prior week</span><span class="v">${wkDelta >= 0 ? '+' : ''}${wkDelta}</span></span>
        <span class="stat"><span class="k">Minutes</span><span class="v">${wkMin}</span></span>
        <span class="stat"><span class="k">People</span><span class="v">${wkPeople}</span></span>
      </div>
      ${topKind ? `<div class="meta">Mostly ${esc(topKind[0])}s${wkMin ? ` · ${wkMin} min talking` : ''}</div>` : '<div class="meta">No conversations logged this week.</div>'}
    </div>
    ${topTalk.length ? `<div class="card board">
      <div class="board-head"><span>Most talked to</span><span class="mono">${esc(wkLabel)}</span></div>
      <ol>${topTalk.map((x, i) => `<li><a class="row" href="#/p/${x.p.id}"><span class="rank">${i + 1}</span><span class="main"><span class="name">${esc(x.p.name)}</span></span><span class="bcount">${x.n} interaction${x.n === 1 ? '' : 's'} this week</span></a></li>`).join('')}</ol>
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
        return `<li class="fu"><div class="main"><span class="t">${who}</span><span class="meta">${st('amber', i.kind)}${i.duration_min ? `<span>${i.duration_min} min</span>` : ''}${i.summary ? `<span>${esc(i.summary.slice(0, 160))}</span>` : ''}</span></div><button class="mini" data-int-edit="${i.id}">Edit</button></li>`;
      }).join('')}</ul></div></div>`).join('')}</div>`
      : '<div class="card empty">No interactions match.</div>';
    document.getElementById('intList').querySelectorAll('[data-int-edit]').forEach((b) => (b.onclick = () => editInteraction(b.dataset.intEdit)));
  };
  const qi = document.getElementById('intQ');
  qi.oninput = () => { state.intQ = qi.value; draw(); };
  document.getElementById('wkPrev').onclick = () => { state.intWeek++; renderInteractions(); };
  const wkNextBtn = document.getElementById('wkNext');
  if (wkNextBtn && !wkNextBtn.disabled) wkNextBtn.onclick = () => { state.intWeek--; renderInteractions(); };
  const wkThisBtn = document.getElementById('wkThis');
  if (wkThisBtn) wkThisBtn.onclick = () => { state.intWeek = 0; renderInteractions(); };
  $view.querySelectorAll('[data-kind]').forEach((b) => (b.onclick = () => {
    state.intKind = b.dataset.kind;
    $view.querySelectorAll('[data-kind]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    draw();
  }));
  document.getElementById('intAddBtn').onclick = () => {
    const slot = document.getElementById('intSlot');
    slot.innerHTML = `<form class="card form" id="ilf" style="margin-top:12px">
      <div class="grid2">
        <div>${personPicker({ id: 'ilp', people, required: true })}</div>
        <div><label class="lbl">Type</label><select class="field" id="ilk">${KINDS.map((k) => `<option>${k}</option>`).join('')}</select></div>
      </div>
      <div class="grid2">
        <div><label class="lbl">Date</label><input class="field" type="date" id="ild" value="${today()}" max="${today()}"></div>
        <div><label class="lbl">Minutes (optional)</label><input class="field" id="ilm" inputmode="numeric"></div>
      </div>
      <label class="lbl">What happened</label><textarea class="field" id="ils" required placeholder="Real conversation only: what was said, what you learned"></textarea>
      <div class="actions" style="margin-top:14px"><button class="btn primary">Save</button><button type="button" class="btn" id="ilx">Cancel</button></div></form>`;
    bindPersonPickers(slot);
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
// filter-group collapse state (module-level so it survives re-renders)
const groupOpen = { tiers: null, rels: null, circles: null, recent: null };
const groupIsOpen = (g) => {
  if (groupOpen[g] === null) groupOpen[g] = !(typeof window !== 'undefined' && window.matchMedia('(max-width: 899px)').matches);
  return groupOpen[g];
};
const chevSvg = '<svg class="chev" viewBox="0 0 24 24" width="11" height="11" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
let peopleActMap = null;
export async function renderPeople(reuse) {
  setHead({ kicker: 'Directory', title: 'People', tab: 'people', add: true });
  const [people, actMap] = await Promise.all([loadPeople(), reuse === true && peopleActMap ? peopleActMap : openActionMap()]);
  peopleActMap = actMap;
  $kicker.textContent = `Directory · ${people.length} records`;
  const circles = [...new Set(people.flatMap((p) => p.circles || []))].sort();
  const tierN = (tr) => people.filter((p) => p.tier === tr).length;
  const noneN = people.filter((p) => !p.tier).length;
  const circleN = (c) => people.filter((p) => (p.circles || []).includes(c)).length;
  const noCircleN = people.filter((p) => !(p.circles || []).length).length;
  const relOf = (p) => (p.relationship || '').trim();
  const relN = (r) => people.filter((p) => relKey(p) === r).length;
  const noRelN = people.filter((p) => !relOf(p)).length;
  const relCustomN = {};
  people.forEach((p) => { const r = relOf(p); if (r && !RELS.includes(r)) relCustomN[r] = (relCustomN[r] || 0) + 1; });
  const relRows = [
    ...RELS.filter((r) => relN(r) && !isFamilyRel(r)).map((r) => ({ k: r, label: relLabel(r), n: relN(r), c: relColor(r) })),
    ...Object.entries(relCustomN).filter(([r]) => !isFamilyRel(r)).sort((a, b) => b[1] - a[1]).map(([r, n]) => ({ k: r, label: r, n, c: relColor(r) })),
  ];
  const relBig = relRows.filter((r) => r.n >= 5);
  const relSmall = relRows.filter((r) => r.n < 5);
  const relOtherN = relSmall.reduce((a, r) => a + r.n, 0);
  // family group: one parent row + a sub-row per role present (Parent, Uncle, ...)
  const famRolesHere = famOrder([...new Set(people.map(relOf).filter(isFamilyRel))], relN);
  const famNHere = famRolesHere.reduce((a, r) => a + relN(r), 0);
  const famAllOn = () => famRolesHere.length > 0 && famRolesHere.every((r) => F.rels.has(r));
  const circleRank = {};
  [...circles].sort((a, b) => circleN(b) - circleN(a)).forEach((c, i) => { circleRank[c] = i; });
  const recent = people.filter((p) => p.created_at).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0)).slice(0, 6);
  const F = state.peopleFilter;
  const chk = (on, label, n, pre = '') => `<span class="box" aria-hidden="true"></span>${pre}<span class="t">${esc(label)}</span><span class="n">${n}</span>`;
  const fgroup = (g, label, clearKey, body) => `
      <div class="fgroup${groupIsOpen(g) ? '' : ' closed'}" data-group="${g}"><div class="flabel"><button class="fgtoggle" data-gtoggle="${g}" aria-expanded="${groupIsOpen(g)}"><span>${label}</span>${chevSvg}</button>${F[clearKey].size ? `<button class="mini" data-clear="${clearKey}">Clear</button>` : ''}</div>
        <div class="checklist">${body}</div></div>`;
  const dot = (c) => `<i class="dotk" style="background:${c}"></i>`;
  const famRowHtml = () => !famNHere ? '' : `<button class="chk ${famAllOn() ? 'on' : ''}" data-rel="__family" aria-pressed="${famAllOn()}">${chk(0, 'Family', famNHere, dot(relColor('Family')))}</button>` +
    famRolesHere.map((r) => `<button class="chk sub ${F.rels.has(r) ? 'on' : ''}" data-rel="${esc(r)}" aria-pressed="${F.rels.has(r)}">${chk(0, r === 'Family' ? 'Family (no role set)' : (FAMILY_PLURAL[r] || r), relN(r), dot(relColor(r)))}</button>`).join('');
  $view.innerHTML = `
    <div class="people-wrap"><div class="people-side">
      <input class="search" id="q" type="search" placeholder="Search name, role, alias…" value="${esc(F.q)}" autocomplete="off">
      ${fgroup('tiers', 'Tiers', 'tiers', `${TIERS.map((t) => `<button class="chk ${F.tiers.has(t) ? 'on' : ''}" data-tier="${t}" aria-pressed="${F.tiers.has(t)}">${chk(0, `Tier ${t}`, tierN(t), dot(tierColor(t)))}</button>`).join('')}
        <button class="chk ${F.tiers.has('__none') ? 'on' : ''}" data-tier="__none" aria-pressed="${F.tiers.has('__none')}">${chk(0, 'Unassigned', noneN, dot(tierColor('')))}</button>`)}
      ${fgroup('rels', 'Relationship', 'rels', `${famRowHtml()}${relBig.map((r) => `<button class="chk ${F.rels.has(r.k) ? 'on' : ''}" data-rel="${esc(r.k)}" aria-pressed="${F.rels.has(r.k)}">${chk(0, r.label, r.n, dot(r.c))}</button>`).join('')}
        ${relOtherN ? `<button class="chk ${relSmall.length && relSmall.every((r) => F.rels.has(r.k)) ? 'on' : ''}" data-rel="__other" aria-pressed="${relSmall.length && relSmall.every((r) => F.rels.has(r.k))}">${chk(0, 'Other', relOtherN, dot('var(--rel-other)'))}</button>` : ''}
        <button class="chk ${F.rels.has('__none') ? 'on' : ''}" data-rel="__none" aria-pressed="${F.rels.has('__none')}">${chk(0, 'Uncategorized', noRelN, dot('var(--rel-none)'))}</button>`)}
      ${fgroup('circles', 'Circles', 'circles', `${circles.map((c) => `<button class="chk ${F.circles.has(c) ? 'on' : ''}" data-circle="${esc(c)}" aria-pressed="${F.circles.has(c)}">${chk(0, c, circleN(c), dot(circleColor(c, circleRank[c])))}</button>`).join('')}
        <button class="chk ${F.circles.has('__none') ? 'on' : ''}" data-circle="__none" aria-pressed="${F.circles.has('__none')}">${chk(0, 'Unassigned', noCircleN)}</button>`)}
      ${recent.length ? `<div class="fgroup recent-only${groupIsOpen('recent') ? '' : ' closed'}" data-group="recent"><div class="flabel"><button class="fgtoggle" data-gtoggle="recent" aria-expanded="${groupIsOpen('recent')}"><span>Recently added</span>${chevSvg}</button></div>
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
    document.getElementById('plist').innerHTML = rows.length ? rows.map((p) => personRow(p, personStatus(p), actDot(actMap[p.id]))).join('') : '<li class="empty">No matches.</li>';
    document.getElementById('count').textContent = rows.length === people.length ? `${people.length} records` : `${rows.length} of ${people.length}`;
  };
  const qi = document.getElementById('q');
  qi.oninput = () => { F.q = qi.value; draw(); };
  const toggle = (set, key, btn) => {
    set.has(key) ? set.delete(key) : set.add(key);
    btn.classList.toggle('on', set.has(key)); btn.setAttribute('aria-pressed', set.has(key));
    renderPeople(true);
  };
  $view.querySelectorAll('[data-tier]').forEach((b) => (b.onclick = () => toggle(F.tiers, b.dataset.tier, b)));
  $view.querySelectorAll('[data-circle]').forEach((b) => (b.onclick = () => toggle(F.circles, b.dataset.circle, b)));
  $view.querySelectorAll('[data-rel]').forEach((b) => (b.onclick = () => {
    if (b.dataset.rel === '__family') {
      const allOn = famAllOn();
      famRolesHere.forEach((r) => { if (allOn) F.rels.delete(r); else F.rels.add(r); });
      renderPeople(true);
    } else if (b.dataset.rel === '__other') {
      const allOn = relSmall.length > 0 && relSmall.every((r) => F.rels.has(r.k));
      relSmall.forEach((r) => { if (allOn) F.rels.delete(r.k); else F.rels.add(r.k); });
      renderPeople(true);
    } else toggle(F.rels, b.dataset.rel, b);
  }));
  $view.querySelectorAll('[data-clear]').forEach((b) => (b.onclick = () => {
    ({ tiers: F.tiers, circles: F.circles, rels: F.rels }[b.dataset.clear]).clear(); renderPeople(true);
  }));
  $view.querySelectorAll('[data-gtoggle]').forEach((b) => (b.onclick = () => {
    const g = b.dataset.gtoggle;
    groupOpen[g] = !groupIsOpen(g);
    b.closest('.fgroup').classList.toggle('closed', !groupOpen[g]);
    b.setAttribute('aria-expanded', String(groupOpen[g]));
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
  // dot color = the person's first circle color (falls back to the status class when none)
  const circleCounts = {};
  people.forEach((p) => (p.circles || []).forEach((c) => { circleCounts[c] = (circleCounts[c] || 0) + 1; }));
  const circleRank = {};
  Object.keys(circleCounts).sort((a, b) => circleCounts[b] - circleCounts[a]).forEach((c, i) => { circleRank[c] = i; });
  const byId = {};
  people.forEach((p) => { byId[p.id] = p; });
  const pCol = (pid) => {
    const p = pid && byId[pid];
    const c = p && (p.circles || [])[0];
    return c ? circleColor(c, circleRank[c] || 0) : null;
  };
  const key = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const buildEvents = () => {
    const ev = {}; const add = (d, e) => (ev[d] ||= []).push(e);
    fus.filter((f) => f.due_date).forEach((f) => add(f.due_date, { kind: 'fu', f, cls: f.due_date < t ? 'red' : f.due_date === t ? 'amber' : 'gray', col: pCol(f.person?.id) }));
    tasks.filter((x) => x.due_date).forEach((x) => add(x.due_date, { kind: 'task', t: x, cls: x.due_date < t ? 'red' : x.due_date === t ? 'amber' : 'gray', col: pCol(x.person?.id) }));
    evs.forEach((e) => add(e.event_date, { kind: 'ev', e, cls: e.event_date < t ? 'gray' : 'amber', col: pCol(e.person?.id) }));
    ints.forEach((i) => { if (i.happened_at) add(i.happened_at.slice(0, 10), { kind: 'int', i, cls: 'past', col: pCol(i.person?.id) }); });
    people.forEach((p) => {
      if (p.birth_month && p.birth_day) add(key(C.y, p.birth_month - 1, p.birth_day), { kind: 'bday', p, cls: 'gray', col: pCol(p.id) });
      if (p.cadence_days) {
        const due = p.last_contact ? addDays(p.last_contact, p.cadence_days) : t;
        add(due, { kind: 'cad', p, cls: due <= t ? 'red' : 'gray', due, col: pCol(p.id) });
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
      const dots = items.slice(0, 3).map((e) => `<i class="${e.cls}"${e.col ? ` style="background:${e.col};border-color:${e.col}"` : ''}></i>`).join('');
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
      <div class="cal-wrap">
      <div class="cal-col"><div id="evSlot"></div>
      <div class="cal"><div class="cal-dow">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<div>${x}</div>`).join('')}</div><div class="cal-grid">${cells.join('')}</div></div></div>
      <div class="cal-col">${sec(new Date(C.sel + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }), items.length)}
      ${!items.length ? '<div class="card empty">Nothing scheduled.</div>' : ''}
      ${evItems.length ? `<div style="margin-bottom:${(pItems.length || fuItems.length) ? 8 : 0}px">${evList(evItems, '')}</div>` : ''}
      ${pItems.length ? `<ul class="list card">${pItems.map((e) => personRow(e.p, e.kind === 'bday' ? st(C.sel === t ? 'amber' : 'gray', 'Birthday') : st(e.cls, e.cls === 'red' ? dueInfo(e.p).label : 'Check-in due'))).join('')}</ul>` : ''}
      ${fuItems.length ? `<div style="margin-top:${(pItems.length || evItems.length) ? 8 : 0}px">${fuList(fuItems, '')}</div>` : ''}
      ${taskItems.length ? `<div style="margin-top:${(pItems.length || evItems.length || fuItems.length) ? 8 : 0}px">${taskList(taskItems, '')}</div>` : ''}
      ${intItems.length ? `<div style="margin-top:12px"><div class="flabel"><span>Past interactions</span></div><ul class="list card">${intItems.map((i) => {
        const who = i.person ? `<a href="#/p/${i.person.id}">${esc(i.person.name)}</a>` : '<span class="meta">No person linked</span>';
        return `<li class="fu past"><div class="main"><span class="t">${who}</span><span class="meta">${st('gray', i.kind)}${i.duration_min ? `<span>${i.duration_min} min</span>` : ''}${i.summary ? `<span>${esc(i.summary.slice(0, 160))}</span>` : ''}</span></div><button class="mini" data-int-edit="${i.id}">Edit</button></li>`;
      }).join('')}</ul></div>` : ''}
      </div></div>
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
    $view.querySelectorAll('[data-int-edit]').forEach((b) => (b.onclick = () => editInteraction(b.dataset.intEdit, renderCalendar)));
    bindEvents(renderCalendar, $view, (id) => editEvent(id, document.getElementById('evSlot'), renderCalendar));
  };
  draw();
}

// ---------- settings: color customization (this device) ----------
export async function renderSettings() {
  setHead({ kicker: 'App', title: 'Settings', tab: 'settings', add: false });
  const people = await loadPeople();
  const circleCounts = {};
  people.forEach((p) => (p.circles || []).forEach((c) => { circleCounts[c] = (circleCounts[c] || 0) + 1; }));
  const circles = Object.keys(circleCounts).sort();
  const circleRank = {};
  [...circles].sort((a, b) => circleCounts[b] - circleCounts[a]).forEach((c, i) => { circleRank[c] = i; });
  const customs = [...new Set(people.map((p) => (p.relationship || '').trim()).filter((r) => r && !REL_KEYS.includes(r)))].sort();
  const ov = getColorOverrides();
  const effRel = (k) => ov.rel?.[k] || relDefaultHex(k);
  const effTier = (t) => ov.tier?.[t || ''] || tierDefaultHex(t);
  const effCircle = (c) => ov.circle?.[c] || CIRCLE_PALETTE[circleRank[c] % CIRCLE_PALETTE.length];
  const colorRow = (group, key, label, hex) => `
    <div class="colorrow"><input type="color" value="${hex}" data-cg="${group}" data-ck="${esc(key)}" aria-label="${esc(label)} color">
      <span class="t">${esc(label)}</span><code class="hex">${hex}</code></div>`;
  $view.innerHTML = `
    <div class="setgrid">
    <div class="blk">${sec('Relationships')}
    <div class="card" style="padding:6px 14px">${[...REL_KEYS, ...customs].map((k) => colorRow('rel', k, k, effRel(k))).join('')}</div></div>
    <div class="blk">${sec('Tiers')}
    <div class="card" style="padding:6px 14px">${[...TIER_KEYS, ''].map((t) => colorRow('tier', t, t ? `Tier ${t}` : 'Unassigned', effTier(t))).join('')}</div>
    ${sec('Circles')}
    <div class="card" style="padding:6px 14px">${circles.map((c) => colorRow('circle', c, `${c} · ${circleCounts[c]}`, effCircle(c))).join('') || '<div class="empty">No circles yet.</div>'}</div></div>
    </div>
    <p class="note">Colors and theme save to your account and show up on every device you sign in on.</p>
    <div class="linkrow"><a href="#" id="colorReset">Reset all colors</a></div>`;
  $view.querySelectorAll('[data-cg]').forEach((inp) => (inp.oninput = () => {
    setColorOverride(inp.dataset.cg, inp.dataset.ck, inp.value);
    pushSettings();
    inp.closest('.colorrow').querySelector('.hex').textContent = inp.value;
  }));
  document.getElementById('colorReset').onclick = (e) => { e.preventDefault(); resetColorOverrides(); pushSettings(); renderSettings(); };
}
