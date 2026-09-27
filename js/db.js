// Data layer: Supabase client plus the shared queries every page reuses.

import { createClient } from '../supabase.js';
import { SUPABASE_URL, SUPABASE_KEY, state } from './config.js';
import { toast } from './ui.js';

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
// the one query for open follow-ups (unchanged from v1); reused by Today, Overdue and Calendar
export const openFollowups = () => q(sb.from('follow_ups').select('id,title,due_date,status,created_at,person:people(id,name,tier)').eq('status', 'open')
  .order('due_date', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false }));
// scheduled events: dated things on the calendar (birthday party, dinner, flight) —
// deliberately separate from follow-ups, which are action items
export const loadEvents = () => q(sb.from('events').select('id,title,event_date,event_time,notes,person_id,person:people(id,name,tier)')
  .order('event_date', { ascending: true }).order('event_time', { ascending: true, nullsFirst: false }));
// raw (no toast) variant for pages that merely fold tasks in — the table may
// not exist yet if the 0002 migration hasn't been run
export const openTasksSoft = async () => {
  const { data, error } = await sb.from('tasks').select('id,title,due_date,status,person:people(id,name,tier)').eq('status', 'open');
  return error ? [] : (data || []);
};
export const personTasks = async (id) => {
  const { data, error } = await sb.from('tasks').select('id,title,due_date,status,created_at,completed_at').eq('person_id', id).eq('status', 'open')
    .order('due_date', { ascending: true, nullsFirst: false });
  return error ? [] : (data || []);
};
