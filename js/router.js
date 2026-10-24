// Router: hash routes → pages or the slide-over panel, plus boot.

import { sb, probeActionCategory, probeActionImportance, probeSeries, probeEventPeople, probeFuSeries } from './db.js';
import { probeAssistant } from './assistant.js';
import { $view, $pBody, $add, setHead, closePanel, openPanel } from './ui.js';
import { esc } from './utils.js';
import { state } from './config.js';
import { renderDashboard, renderToday, renderPeople, renderOverdue, renderActions, renderInteractions, renderRecent, renderCalendar, renderSettings } from './pages.js';
import { renderPerson, renderEdit } from './person.js';
import { renderLogin, renderPassword } from './auth.js';
import { openNewMenu } from './new.js';
import { pullSettings, pushSettings } from './settings.js';

// ---------- router ----------
const BASE = { '#/dashboard': renderDashboard, '#/today': renderToday, '#/people': renderPeople, '#/overdue': renderOverdue, '#/actions': renderActions, '#/interactions': renderInteractions, '#/recent': renderRecent, '#/calendar': renderCalendar, '#/settings': renderSettings };
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
  const h = location.hash || '#/dashboard';
  const pr = panelRoute(h);
  try {
    if (pr) {
      if (!state.baseRendered) { await BASE[state.base](); state.baseRendered = true; }
      openPanel(); await pr();
    } else {
      const next = BASE[h] ? h : '#/dashboard';
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
  // Home-screen icons installed before v57 saved start_url "./#/today", and iOS
  // never re-reads the manifest after install. A cold launch from that icon
  // lands on #/today, so send it to the Dashboard. Only on boot, only when
  // running as the installed app, so tapping Today later still works.
  const standalone = window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  if (standalone && location.hash === '#/today') history.replaceState(null, '', '#/dashboard');
  window.addEventListener('hashchange', route);
  $add.onclick = () => openNewMenu();
  // theme button (ui.js) saves locally first; this then syncs it to the other devices
  document.getElementById('themeBtn').addEventListener('click', () => { if (state.session) pushSettings(); });
  const moreBtn = document.getElementById('moreBtn');
  const moreSheet = document.getElementById('moreSheet');
  const moreScrim = document.getElementById('moreScrim');
  const closeMore = () => { moreSheet.hidden = true; moreScrim.hidden = true; moreBtn.setAttribute('aria-expanded', 'false'); };
  moreBtn.onclick = () => {
    const opening = moreSheet.hidden;
    closeMore();
    if (opening) { moreSheet.hidden = false; moreScrim.hidden = false; moreBtn.setAttribute('aria-expanded', 'true'); }
  };
  moreScrim.onclick = closeMore;
  moreSheet.querySelectorAll('a').forEach((a) => a.addEventListener('click', closeMore));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMore(); });
  window.addEventListener('hashchange', closeMore);
  sb.auth.onAuthStateChange((_evt, session) => {
    const was = !!state.session; state.session = session;
    if (!!session !== was) { state.people = null; (session ? pullSettings() : Promise.resolve()).then(() => probeActionCategory()).then(() => probeActionImportance()).then(() => probeSeries()).then(() => probeEventPeople()).then(() => probeFuSeries()).then(() => probeAssistant()).then(() => route()); }
  });

  let bootDone = false;
  const bootTimer = setTimeout(() => {
    if (!bootDone) { console.error('[boot] timed out — first render never completed'); bootFail(); }
  }, 15000);
  (async () => {
    try {
      const { data } = await sb.auth.getSession();
      state.session = data.session;
      if (state.session) await pullSettings();
      await probeActionCategory();
      await probeActionImportance();
      await probeSeries();
      await probeEventPeople();
      await probeFuSeries();
      await probeAssistant();
      await route();
    } catch (e) {
      console.error('[boot]', e);
      bootFail();
    } finally {
      bootDone = true; clearTimeout(bootTimer);
    }
  })();
}
