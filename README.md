# Network

Chase's personal relationship network: a phone app (installable web app) on top of Supabase.

- All data lives in Supabase and is only readable after signing in (row-level security).
- The key in `app.js` is Supabase's public "publishable" key. It grants no data access on its own.
- `supabase.js`, `marked.js`, `purify.js` are bundled copies of supabase-js 2, marked 12 and DOMPurify 3.
