// App-wide constants and shared mutable state.
// Every module imports the same `state` object, so mutations are visible everywhere.

export const SUPABASE_URL = 'https://afmuodzloooetmlyqxmr.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_ifWhRQP70qDA4tHBy6_AKg_3phy0aFo'; // public key; data is protected by login + row-level security

export const TIERS = ['A', 'B', 'C', 'D'];
export const KINDS = ['conversation', 'call', 'message', 'meeting'];
export const RELS = ['Professional', 'Friend', 'Family', 'Family Friend', 'Customer', 'Prospect', 'Business'];
// action categories for follow-ups + tasks (the Actions tab)
export const ACTION_CATEGORIES = ['sales', 'networking', 'business', 'social media', 'family', 'birthday', 'dining', 'travel', 'finance', 'health', 'general'];

export const state = {
  people: null,
  session: null,
  peopleFilter: { q: '', tiers: new Set(), circles: new Set(), rels: new Set() },
  actionType: 'all',
  actionStatus: 'open',
  actionCat: 'all', // category filter; 'all' or one of ACTION_CATEGORIES
  hasCategory: false, // set true at boot once the 0003 migration's column exists
  intKind: 'all',
  intQ: '',
  base: '#/today',
  baseRendered: false,
  cal: null,
};
