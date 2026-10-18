// App-wide constants and shared mutable state.
// Every module imports the same `state` object, so mutations are visible everywhere.

export const SUPABASE_URL = 'https://afmuodzloooetmlyqxmr.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_ifWhRQP70qDA4tHBy6_AKg_3phy0aFo'; // public key; data is protected by login + row-level security

export const TIERS = ['A', 'B', 'C', 'D'];
export const KINDS = ['conversation', 'call', 'message', 'meeting'];
export const RELS = ['Professional', 'Friend', 'Family', 'Family Friend', 'Customer', 'Prospect', 'Business'];
// specific family roles roll up into one "Family" group on the dashboard + People filter
export const FAMILY_ROLES = ['Parent', 'Sibling', 'Grandparent', 'Uncle', 'Aunt', 'Cousin', 'Nephew', 'Niece', 'Sister-in-law', 'Brother-in-law'];
export const FAMILY_VALUES = ['Family', ...FAMILY_ROLES];
export const FAMILY_PLURAL = { Family: 'Family', Parent: 'Parents', Sibling: 'Siblings', Grandparent: 'Grandparents', Uncle: 'Uncles', Aunt: 'Aunts', Cousin: 'Cousins', Nephew: 'Nephews', Niece: 'Nieces', 'Sister-in-law': 'Sisters-in-law', 'Brother-in-law': 'Brothers-in-law' };
// action categories for follow-ups + tasks (the Actions tab)
export const ACTION_CATEGORIES = ['sales', 'networking', 'business', 'social media', 'family', 'birthday', 'dining', 'travel', 'finance', 'health', 'general'];
export const ACTION_IMPORTANCE = ['urgent', 'high', 'medium', 'neutral'];

export const state = {
  people: null,
  session: null,
  peopleFilter: { q: '', tiers: new Set(), circles: new Set(), rels: new Set() },
  actionType: 'all',
  actionStatus: 'open',
  actionCat: 'all', // category filter; 'all' or one of ACTION_CATEGORIES
  actionImpSort: 'none', // importance sort on the Actions tab: 'none' | 'desc' (urgent first) | 'asc' (neutral first)
  hasCategory: false, // set true at boot once the 0003 migration's column exists
  hasImportance: false, // set true at boot once the 0004 migration's column exists
  hasSeries: false, // set true at boot once the 0005 migration's columns exist
  intKind: 'all',
  intQ: '',
  intWeek: 0,
  base: '#/today',
  baseRendered: false,
  cal: null,
  recentActor: 'all', // Recent tab actor filter: all | Chase | Muse | Claude
};
