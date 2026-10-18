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
// Relationship is free text, so family is detected by keyword: "Grandma (Mom's
// Side)", "Uncle on dad's side", "2nd cousin", "Step-sister" all count.
// Not family: anything with "friend" (Family Friend, Dad's girlfriend), and a
// role belonging to someone else ("Kaydens Brother", "Jeremy's wife").
const FAMILY_WORD = /\b(family|parents?|mom|mother|dad|father|step-?\w+|brothers?|sisters?|siblings?|grand\w*|great-?grand\w*|uncles?|aunts?|auntie|cousins?|nephews?|nieces?|sons?|daughters?|\w+-in-law|in-laws?|wife|husband|spouse|twin)\b/i;
const OWNER_OK = /^(my|mom|mother|dad|father|parent|grandparent|brother|sister|sibling|uncle|aunt|cousin|grandma|grandpa|grandmother|grandfather|wife|husband|spouse|nephew|niece|son|daughter|step\w*)$/i;
export function isFamilyRel(r) {
  const s = String(r || '').trim();
  if (!s || /friend/i.test(s) || !FAMILY_WORD.test(s)) return false;
  const own = s.match(/^([A-Za-z]+?)(?:'s|’s|s)\s+\S/);
  return !(own && !OWNER_OK.test(own[1]));
}
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
