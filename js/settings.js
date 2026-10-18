// Settings that follow Chase across devices: colors (Settings tab) and theme.
// Stored in Supabase (app_settings, key 'prefs'); localStorage stays as the
// fast local copy the rest of the app reads synchronously.
import { sb } from './db.js';
import { getColorOverrides } from './colors.js';
import { getTheme, applyTheme } from './ui.js';

const KEY = 'prefs';
const LS_COLORS = 'network.colors.v1';
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch {} };

// Pull the saved settings into this device. If none are saved yet, this
// device's settings become the saved ones. Never blocks boot for long.
export async function pullSettings() {
  try {
    const { data, error } = await Promise.race([
      sb.from('app_settings').select('value').eq('key', KEY).maybeSingle(),
      new Promise((_, rej) => setTimeout(() => rej(new Error('settings timeout')), 4000)),
    ]);
    if (error) return false; // table missing or offline: keep local settings
    if (!data) { await saveNow(); return true; }
    const v = data.value || {};
    if (v.colors && Object.keys(v.colors).length) lsSet(LS_COLORS, JSON.stringify(v.colors)); else lsDel(LS_COLORS);
    if (v.theme === 'light' || v.theme === 'dark') lsSet('theme', v.theme); else lsDel('theme');
    applyTheme(getTheme());
    return true;
  } catch { return false; }
}

async function saveNow() {
  const value = { colors: getColorOverrides(), theme: getTheme() };
  const { error } = await sb.from('app_settings').upsert({ key: KEY, value, updated_at: new Date().toISOString() });
  if (error) console.warn('[settings] save failed', error.message);
}
let timer;
// Debounced: color pickers fire on every drag step.
export function pushSettings() { clearTimeout(timer); timer = setTimeout(saveNow, 700); }
