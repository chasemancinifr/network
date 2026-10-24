// Assistant: the AI relationship-manager layer.
// - suggestions: drafted by the daily Claude run (and Muse), shown on the
//   Dashboard. Chase texts / copies them, marks them sent (logs a real
//   interaction) or dismisses them.
// - signals: what's new with a person, mostly fed by Muse from Facebook /
//   Instagram. Shown on the person page and used as the reason behind
//   compliment / congrats suggestions.
// Both tables came with the assistant migrations (Oct 23 2026); the app hides
// all of this until the probe finds them.

import { sb, q } from './db.js';
import { st, toast, monoDate, sec } from './ui.js';
import { esc, today } from './utils.js';
import { state } from './config.js';

export async function probeAssistant() {
  try {
    const { error } = await Promise.race([
      sb.from('suggestions').select('id').limit(1),
      new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), 6000)),
    ]);
    state.hasAssistant = !error;
  } catch { state.hasAssistant = false; }
  return state.hasAssistant;
}

export const SUG_KINDS = {
  message: 'Message', compliment: 'Compliment', congrats: 'Congrats', invite: 'Invite',
  gift: 'Gift idea', birthday: 'Birthday', check_in: 'Check in', other: 'Idea',
};
// kinds where "Sent" means a real message went out, so it is logged as an interaction
const SENDABLE = new Set(['message', 'compliment', 'congrats', 'invite', 'birthday', 'check_in']);

export async function loadSuggestions() {
  if (!state.hasAssistant) return [];
  const { data, error } = await sb.from('suggestions')
    .select('id,kind,title,message,reason,for_date,priority,status,created_by,person_id,person:people(id,name,phone),signal:signals(source,url)')
    .eq('status', 'new')
    .order('priority', { ascending: true })
    .order('for_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) return [];
  // expired: dated suggestions more than 2 days past their date fall away
  const cutoff = new Date(Date.now() - 2 * 86400000).toLocaleDateString('en-CA');
  return (data || []).filter((s) => !s.for_date || s.for_date >= cutoff);
}

// only http(s) links from stored data ever become hrefs
const safeUrl = (u) => (/^https?:\/\//i.test(String(u || '').trim()) ? String(u).trim() : '');
// iOS Messages: sms:<number>&body=<text>
const smsHref = (phone, body) => `sms:${String(phone).replace(/[^\d+]/g, '')}&body=${encodeURIComponent(body || '')}`;

function whenLabel(d) {
  if (!d) return '';
  const t = today();
  if (d === t) return st('amber', 'Today');
  if (d < t) return st('red', monoDate(d));
  return st('gray', monoDate(d));
}

export function sugItem(s) {
  const who = s.person ? `<a href="#/p/${s.person.id}">${esc(s.person.name)}</a>` : '';
  const src = s.signal && safeUrl(s.signal.url) ? `<a href="${esc(safeUrl(s.signal.url))}" target="_blank" rel="noopener">${esc(s.signal.source)} post</a>` : '';
  const text = s.message ? `<div class="sug-msg">${esc(s.message)}</div>` : '';
  const canText = s.message && s.person && s.person.phone;
  const btns = [
    canText ? `<a class="btn small primary" href="${smsHref(s.person.phone, s.message)}" data-sug-text="${s.id}">Text</a>` : '',
    s.message ? `<button class="btn small" data-sug-copy="${s.id}">Copy</button>` : '',
    `<button class="btn small" data-sug-done="${s.id}">${SENDABLE.has(s.kind) && s.person ? 'Sent ✓' : 'Done ✓'}</button>`,
    `<button class="mini" data-sug-dismiss="${s.id}">Dismiss</button>`,
  ].join('');
  return `<li class="fu sug" data-sug="${s.id}"><div class="main">
    <span class="t">${esc(s.title)}</span>
    <span class="meta"><span class="typebadge">${esc(SUG_KINDS[s.kind] || 'Idea')}</span>${whenLabel(s.for_date)}${who ? `<span>${who}</span>` : ''}${src ? `<span>${src}</span>` : ''}</span>
    ${s.reason ? `<span class="sug-why">${esc(s.reason)}</span>` : ''}
    ${text}
    <div class="sug-btns">${btns}</div>
  </div></li>`;
}

// Dashboard block. `limit` items, then "Show all".
export function assistantBlock(rows, limit = 5) {
  if (!state.hasAssistant) return '';
  const head = sec('Assistant', rows.length);
  if (!rows.length) return `${head}<div class="card empty">No suggestions right now. The assistant refreshes once a day.</div>`;
  const first = rows.slice(0, limit), rest = rows.slice(limit);
  return `${head}<div class="card"><ul class="list">${first.map(sugItem).join('')}</ul>
    ${rest.length ? `<details class="more"><summary>${rest.length} more</summary><ul class="list">${rest.map(sugItem).join('')}</ul></details>` : ''}</div>`;
}

export function bindAssistant(rows, rerender, root) {
  if (!state.hasAssistant) return;
  const byId = Object.fromEntries(rows.map((s) => [s.id, s]));
  const close = async (id, status) => q(sb.from('suggestions').update({ status, acted_at: new Date().toISOString() }).eq('id', id));
  root.querySelectorAll('[data-sug-copy]').forEach((b) => (b.onclick = async () => {
    const s = byId[b.dataset.sugCopy];
    try { await navigator.clipboard.writeText(s.message); toast('Copied'); } catch { toast('Copy failed: long-press the text instead', true); }
  }));
  root.querySelectorAll('[data-sug-done]').forEach((b) => (b.onclick = async () => {
    const s = byId[b.dataset.sugDone];
    b.disabled = true;
    try {
      // a sent message is real contact: log it so last_contact moves
      if (SENDABLE.has(s.kind) && s.person_id) {
        await q(sb.from('interactions').insert({ person_id: s.person_id, kind: 'message', happened_at: today(), summary: s.message ? `Sent: ${s.message}` : s.title }));
        state.people = null;
      }
      await close(s.id, 'done');
      toast(SENDABLE.has(s.kind) && s.person_id ? 'Logged as a message ✓' : 'Done ✓');
      rerender();
    } catch { b.disabled = false; }
  }));
  root.querySelectorAll('[data-sug-dismiss]').forEach((b) => (b.onclick = async () => {
    b.disabled = true;
    try { await close(b.dataset.sugDismiss, 'dismissed'); toast('Dismissed'); rerender(); } catch { b.disabled = false; }
  }));
}

// ---------- person page: what's new + suggestions for this person ----------
export async function personAssistant(id) {
  if (!state.hasAssistant) return { signals: [], sugs: [] };
  const [sig, sugs] = await Promise.all([
    sb.from('signals').select('id,source,kind,summary,url,observed_on').eq('person_id', id).order('observed_on', { ascending: false }).limit(8),
    sb.from('suggestions').select('id,kind,title,message,reason,for_date,priority,status,created_by,person_id,person:people(id,name,phone),signal:signals(source,url)')
      .eq('person_id', id).eq('status', 'new').order('priority'),
  ]);
  return { signals: sig.error ? [] : sig.data, sugs: sugs.error ? [] : sugs.data };
}

export function signalsBlock(signals) {
  if (!state.hasAssistant) return '';
  return `${sec("What's new", signals.length)}<div class="card">${signals.length ? `<ul class="list">${signals.map((g) => `<li class="fu"><div class="main">
    <span class="t">${esc(g.summary)}</span>
    <span class="meta">${st('gray', monoDate(g.observed_on))}<span class="typebadge">${esc(g.source)}</span>${safeUrl(g.url) ? `<a href="${esc(safeUrl(g.url))}" target="_blank" rel="noopener">Open</a>` : ''}</span>
  </div></li>`).join('')}</ul>` : '<div class="empty">Nothing yet. Muse adds updates from Facebook and Instagram.</div>'}</div>`;
}

// socials jsonb → links
const SOCIAL_URL = {
  instagram: (h) => `https://instagram.com/${h.replace(/^@/, '')}`,
  tiktok: (h) => `https://www.tiktok.com/@${h.replace(/^@/, '')}`,
  facebook: (h) => (/^https?:/i.test(h) ? h : `https://facebook.com/${h}`),
  linkedin: (h) => (/^https?:/i.test(h) ? h : `https://www.linkedin.com/in/${h}`),
};
export function socialLinks(socials) {
  const s = socials || {};
  return Object.keys(SOCIAL_URL).filter((k) => s[k]).map((k) => {
    const v = String(s[k]).trim();
    const url = safeUrl(/^https?:/i.test(v) ? v : SOCIAL_URL[k](v));
    if (!url) return '';
    return `<a href="${esc(url)}" target="_blank" rel="noopener">${k[0].toUpperCase() + k.slice(1)}</a>`;
  }).filter(Boolean).join(' · ');
}
export const SOCIAL_KEYS = Object.keys(SOCIAL_URL);
