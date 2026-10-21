// Data layer: Supabase client plus the shared queries every page reuses.

import { createClient } from '../supabase.js';
import { SUPABASE_URL, SUPABASE_KEY, state } from './config.js';
import { toast, impRank, REPEAT_OPTIONS } from './ui.js';
import { addDays, addMonths } from './utils.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });

export async function q(promise) {
  const { data, error } = await promise;
  if (error) { toast(error.message, true); throw error; }
  return data;
}

export async function loadPeople(force) {
  if (state.people && !force) return state.people;
  state.people = await q(sb.from('people')
    .select('id,name,aliases,tier,circles,relationship,org,dept,role,last_contact,cadence_days,birth_month,birth_day,birth_year,created_at')
    .is('archived_at', null).order('name'));
  return state.people;
}
// Editors build person dropdowns from loadPeople() (active only). If the item
// being edited belongs to an archived person, they'd be missing from the
// list — and saving would silently reassign or unlink them. Append the
// archived person (labelled) so the current value survives an edit untouched.
export async function withArchivedPerson(people, personId) {
  if (!personId || people.some((p) => p.id === personId)) return people;
  const { data } = await sb.from('people').select('id,name').eq('id', personId).maybeSingle();
  return data ? [...people, { id: data.id, name: `${data.name} (archived)` }] : people;
}
// the one query for open follow-ups (unchanged from v1); reused by Today, Overdue and Calendar
export const openFollowups = () => q(sb.from('follow_ups').select('id,person_id,title,due_date,status,created_at' + (state.hasCategory ? ',category' : '') + (state.hasImportance ? ',importance' : '') + ',person:people(id,name,tier)').eq('status', 'open')
  .order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }));
// scheduled events: dated things on the calendar (birthday party, dinner, flight) —
// deliberately separate from follow-ups, which are action items
export const loadEvents = () => q(sb.from('events').select('id,title,event_date,event_time,notes,person_id,person:people(id,name,tier)')
  .order('event_date', { ascending: true }).order('event_time', { ascending: true, nullsFirst: false }));
// series-column probe: the 0005 migration may not have been run yet.
// Repeating creates still work without it (standalone copies); the
// edit/delete scope UI only appears once the columns exist.
export async function probeSeries() {
  try {
    const { error } = await Promise.race([
      sb.from('events').select('id,series_id').limit(1),
      new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), 6000)),
    ]);
    state.hasSeries = !error;
  } catch { state.hasSeries = false; }
  return state.hasSeries;
}
// siblings of a series, ordered by position; [] when not a series member
export async function seriesSiblings(table, seriesId) {
  if (!state.hasSeries || !seriesId) return [];
  const { data, error } = await sb.from(table).select('id,series_index').eq('series_id', seriesId).order('series_index');
  return error ? [] : (data || []);
}
// shift a YYYY-MM-DD by `steps` of a repeat rule (weekly/monthly/yearly)
export const shiftSeriesDate = (rule, d, steps) =>
  rule === 'weekly' ? addDays(d, 7 * steps) : rule === 'monthly' ? addMonths(d, steps) : addMonths(d, 12 * steps);
// rows of a series in a delete/edit scope: 'one' | 'following' | 'all'
export const scopeRows = (siblings, idx, scope) =>
  siblings.filter((s) => scope === 'all' ? true : scope === 'following' ? s.series_index >= idx : s.series_index === idx);
// Regenerate rows after the repeat rule changed in an edit form.
// `row` = the edited fields; `oldRule` = the row's current series_rule (null
// for a standalone item); `siblings` = current series members ([] when
// standalone); `scope` = the series scope picker value ('one' when standalone
// or the picker chose Only-this). Returns the toast message. Caller checks
// dates before calling (tasks: repeating needs a due date).
export async function applyRepeatChange({ table, row, newRule, oldRule, siblings, selfId, selfIndex, scope }) {
  const dateKey = table === 'events' ? 'event_date' : 'due_date';
  const repeatN = (k) => (REPEAT_OPTIONS.find((o) => o.k === k) || { n: 1 }).n;
  const repeatLabel = (k) => (REPEAT_OPTIONS.find((o) => o.k === k) || { label: 'once' }).label;
  const seriesCols = state.hasSeries ? {} : null; // null => no series columns in DB
  const mkSeries = (sid) => Array.from({ length: repeatN(newRule) }, (_, i) => ({
    ...row,
    [dateKey]: shiftSeriesDate(newRule, row[dateKey], i),
    ...(seriesCols ? { series_id: sid, series_rule: newRule, series_index: i } : {}),
  }));
  const mkStandalone = () => ({ ...row, ...(seriesCols ? { series_id: null, series_rule: null, series_index: null } : {}) });
  const newSid = () => (state.hasSeries ? crypto.randomUUID() : null);

  if (!oldRule) {
    // Standalone item now repeats: tag the edited row as index 0, insert the rest.
    const rows = mkSeries(newSid());
    await q(sb.from(table).update(rows[0]).eq('id', selfId));
    if (rows.length > 1) await q(sb.from(table).insert(rows.slice(1)));
    return `Now repeats ${repeatLabel(newRule).toLowerCase()} ✓`;
  }
  if (scope === 'one') {
    // Only this instance changes: detach it from the old series; the rest stay.
    if (newRule === 'none') {
      await q(sb.from(table).update(mkStandalone()).eq('id', selfId));
      return 'Removed from series ✓';
    }
    const rows = mkSeries(newSid());
    await q(sb.from(table).update(rows[0]).eq('id', selfId));
    if (rows.length > 1) await q(sb.from(table).insert(rows.slice(1)));
    return `This one now repeats ${repeatLabel(newRule).toLowerCase()} ✓`;
  }
  // 'following' / 'all': drop the affected rows and rebuild under the new rule.
  for (const s of scopeRows(siblings, selfIndex, scope)) await q(sb.from(table).delete().eq('id', s.id));
  if (newRule === 'none') {
    await q(sb.from(table).insert(mkStandalone()));
    return scope === 'all' ? 'Repeat removed ✓' : 'Future repeats removed ✓';
  }
  await q(sb.from(table).insert(mkSeries(newSid())));
  return `Series now repeats ${repeatLabel(newRule).toLowerCase()} ✓`;
}
// per-person open-action counts with the highest importance level, for the
// notification dot on person rows. Null importance counts as neutral.
// Pure builder (pages that already loaded the rows reuse it); openActionMap
// fetches the two slim queries itself.
const IMP_NAMES = ['urgent', 'high', 'medium', 'neutral'];
export function buildActionMap(fuRows, taskRows) {
  const map = {};
  const fold = (rows) => (rows || []).forEach((r) => {
    if (!r || !r.person_id) return;
    const e = map[r.person_id] || (map[r.person_id] = { n: 0, top: 3 });
    e.n += 1;
    const rk = impRank(r.importance);
    if (rk < e.top) e.top = rk;
  });
  fold(fuRows); fold(taskRows);
  Object.values(map).forEach((e) => { e.top = IMP_NAMES[e.top] || 'neutral'; });
  return map;
}
export async function openActionMap() {
  const cols = 'person_id' + (state.hasImportance ? ',importance' : '');
  const [fus, tres] = await Promise.all([
    q(sb.from('follow_ups').select(cols).eq('status', 'open')),
    sb.from('tasks').select(cols).eq('status', 'open'),
  ]);
  return buildActionMap(fus, tres.error ? [] : tres.data);
}
// raw (no toast) variant for pages that merely fold tasks in — the table may
// not exist yet if the 0002 migration hasn't been run
export const openTasksSoft = async () => {
  const { data, error } = await sb.from('tasks').select('id,person_id,title,due_date,status,created_at' + (state.hasCategory ? ',category' : '') + (state.hasImportance ? ',importance' : '') + ',person:people(id,name,tier)').eq('status', 'open')
    .order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
  return error ? [] : (data || []);
};
export const personTasks = async (id) => {
  const { data, error } = await sb.from('tasks').select('id,title,due_date,status,created_at,completed_at' + (state.hasImportance ? ',importance' : '')).eq('person_id', id).eq('status', 'open')
    .order('due_date', { ascending: true, nullsFirst: false });
  return error ? [] : (data || []);
};
// category-column probe: the 0003 migration may not have been run yet.
// Resolves true when follow_ups.category exists; the app hides all category
// UI until then, so the app update is safe to push before or after the SQL.
export async function probeActionCategory() {
  try {
    const { error } = await Promise.race([
      sb.from('follow_ups').select('id,category').limit(1),
      new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), 6000)),
    ]);
    state.hasCategory = !error;
  } catch { state.hasCategory = false; }
  return state.hasCategory;
}
// importance-column probe: the 0004 migration may not have been run yet.
// Same hide-until-present contract as the category probe.
export async function probeActionImportance() {
  try {
    const { error } = await Promise.race([
      sb.from('follow_ups').select('id,importance').limit(1),
      new Promise((_, rej) => setTimeout(() => rej(new Error('probe timeout')), 6000)),
    ]);
    state.hasImportance = !error;
  } catch { state.hasImportance = false; }
  return state.hasImportance;
}
