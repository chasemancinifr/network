// App-wide constants and shared mutable state.
// Every module imports the same `state` object, so mutations are visible everywhere.

export const SUPABASE_URL = 'https://afmuodzloooetmlyqxmr.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_ifWhRQP70qDA4tHBy6_AKg_3phy0aFo'; // public key; data is protected by login + row-level security

export const TIERS = ['A', 'B', 'C', 'D'];
export const KINDS = ['conversation', 'call', 'message', 'meeting'];

export const state = {
  people: null,
  session: null,
  peopleFilter: { q: '', tiers: new Set(), circles: new Set() },
  fuTab: 'open',
  taskTab: 'open',
  intKind: 'all',
  intQ: '',
  base: '#/today',
  baseRendered: false,
  cal: null,
};
