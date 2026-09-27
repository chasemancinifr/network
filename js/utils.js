// Pure helpers: dates, strings, markdown. No DOM, no network.

import { marked } from '../marked.js';
import DOMPurify from '../purify.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const today = () => new Date().toLocaleDateString('en-CA');
export const md = (s) => DOMPurify.sanitize(marked.parse(String(s || '').replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, (_, a, b) => (b ? b.slice(1) : a))));

export function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d.length === 10 ? d + 'T12:00:00' : d);
  const opts = { month: 'short', day: 'numeric' };
  if (dt.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return dt.toLocaleDateString(undefined, opts);
}
export function daysBetween(a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); }
export function addDays(d, n) { const x = new Date(d + 'T12:00:00'); x.setDate(x.getDate() + n); return x.toLocaleDateString('en-CA'); }
export function ago(d) {
  if (!d) return 'never';
  const n = daysBetween(d, today());
  if (n <= 0) return 'today'; if (n === 1) return 'yesterday';
  if (n < 60) return `${n}d ago`; return fmtDate(d);
}
// calendar-day (YYYY-MM-DD) of a date or timestamp value
export const dayOf = (ts) => { const s = String(ts || ''); return s.length === 10 ? s : (s ? new Date(s).toLocaleDateString('en-CA') : ''); };
// consecutive-day interaction streak ending today (counts through yesterday
// when nothing is logged yet today)
export function streakOf(rows, t) {
  const days = new Set(rows.map((r) => dayOf(r.happened_at)).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)));
  let d = t, n = 0;
  if (!days.has(d)) d = addDays(d, -1);
  while (days.has(d)) { n++; d = addDays(d, -1); }
  return n;
}
export function bday(p) {
  if (!p.birth_month) return '';
  const s = new Date(2000, p.birth_month - 1, p.birth_day).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  return p.birth_year ? `${s}, ${p.birth_year}` : s;
}
export function dueInfo(p) {
  if (!p.cadence_days) return null;
  if (!p.last_contact) return { overdue: true, label: 'no contact logged' };
  const left = p.cadence_days - daysBetween(p.last_contact, today());
  return { overdue: left <= 0, label: left <= 0 ? `${-left}d overdue` : `due in ${left}d`, left };
}
export function fmtTime(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
export function upcomingBirthdays(people, days) {
  const t = today(); const y = +t.slice(0, 4);
  return people.filter((p) => p.birth_month).map((p) => {
    let d = `${y}-${String(p.birth_month).padStart(2, '0')}-${String(p.birth_day).padStart(2, '0')}`;
    if (d < t) d = `${y + 1}` + d.slice(4);
    return { p, in: daysBetween(t, d) };
  }).filter((x) => x.in <= days).sort((a, b) => a.in - b.in);
}
export function agoShort(ts) {
  const ms = Date.now() - new Date(ts).getTime();
  if (!(ms >= 0)) return fmtDate(ts);
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  if (ms < 86400000) return `${Math.floor(m / 60)}h ago`;
  return ago(String(ts).slice(0, 10));
}
export const feedDay = (ts) => { const s = String(ts); return s.length === 10 ? s : new Date(s).toLocaleDateString('en-CA'); };
