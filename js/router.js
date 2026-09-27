// Router: hash routes → pages or the slide-over panel, plus boot.

import { sb } from './db.js';
import { $view, $pBody, setHead, closePanel, openPanel } from './ui.js';
import { esc } from './utils.js';
import { state } from './config.js';
import { renderToday, renderPeople, renderOverdue, renderFollowups, renderTasks, renderInteractions, renderEvents, renderRecent, renderCalendar } from './pages.js';
import { renderPerson, renderEdit } from './person.js';
import { renderLogin, renderPassword } from './auth.js';

// ---------- router ----------
const BASE = { '#/today': renderToday, '#/people': renderPeople, '#/overdue': renderOverdue, '#/followups': renderFollowups, '#/tasks': renderTasks, '#/interactions': renderInteractions, '#/events': renderEvents, '#/recent': renderRecent, '#/calendar': renderCalendar };
function panelRoute(h) {
  let m;
  if ((m = h.match(/^#\/p\/([0-9a-f-]{36})\/edit$/))) return () => renderEdit(m[1]);
  if ((m = h.match(/^#\/p\/([0-9a-f-]{36})$/))) return () => renderPerson(m[1]);
  if (h === '#/new') return () => renderEdit(null);
  if (h === '#/password') return () => renderPassword();
  return null;
}
export async function route() {
  if (!state.session) { closePanel(); state.baseRendered = false; return renderLogin(); }
  const h = location.hash || '#/today';
  const pr = panelRoute(h);
  try {
    if (pr) {
      if (!state.baseRendered) { await BASE[state.base](); state.baseRendered = true; }
      openPanel(); await pr();
    } else {
      const next = BASE[h] ? h : '#/today';
      if (next !== state.base) window.scrollTo(0, 0);
      state.base = next; closePanel();
      await BASE[next](); state.baseRendered = true;
    }
  } catch (e) {
    console.error(e);
    (pr ? $pBody : $view).innerHTML = `<div class="empty">Couldn't load that. ${esc(e.message || '')}</div>`;
  }
}

// Boot guard: the app must never sit on "Loading…" forever. If the first
// render doesn't finish (stalled network, blocked third-party request,
// hung session restore), show a recovery screen with a retry instead.
function bootFail() {
  setHead({ kicker: 'Network', title: 'Couldn\u2019t start' });
  $view.innerHTML = `<div class="login">
    <p><b style="color:var(--text)">The app didn\u2019t finish starting.</b></p>
    <p>This is usually a slow or blocked connection. Make sure you\u2019re online and nothing is blocking this site, then try again.</p>
    <button class="btn primary" id="bootRetry">Retry</button></div>`;
  document.getElementById('bootRetry').onclick = () => location.reload();
}

export function boot() {
  window.addEventListener('hashchange', route);
  sb.auth.onAuthStateChange((_evt, session) => {
    const was = !!state.session; state.session = session;
    if (!!session !== was) { state.people = null; route(); }
  });

  let bootDone = false;
  const bootTimer = setTimeout(() => {
    if (!bootDone) { console.error('[boot] timed out — first render never completed'); bootFail(); }
  }, 15000);
  (async () => {
    try {
      const { data } = await sb.auth.getSession();
      state.session = data.session;
      await route();
    } catch (e) {
      console.error('[boot]', e);
      bootFail();
    } finally {
      bootDone = true; clearTimeout(bootTimer);
    }
  })();
}
