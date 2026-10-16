# Recent attribution spec — "who did what" (Chase / Muse / Claude)

Goal (Chase, 2026-10-15): the Recent tab should show who did each thing —
Chase, Muse, or Claude — so the feed reads as a shared work log.

## What already exists

All five tables (`people`, `follow_ups`, `tasks`, `interactions`, `events`)
already have `created_by` and `updated_by` text columns. Current values in
the wild: `chase`, `muse`, `claude`, `claude-import`, `postgres`, `unknown`,
NULL. The data is there; the app just doesn't display it — and doesn't write
it.

## Part 1 — Display (Recent feed)

In `renderRecent` (`js/pages.js`):
- Add `created_by` (and `updated_by`) to all four queries (interactions,
  follow_ups, people, events).
- In `actItem`, render a small actor badge next to the kind badge:
  - `chase` → "Chase"
  - `muse` → "Muse"
  - `claude`, `claude-import` → "Claude"
  - `postgres`, `unknown`, NULL → no badge (system/legacy)
- For `fu_done` feed events (a completion, not a creation), attribute using
  `updated_by` instead of `created_by` — the closer matters, not the creator.
- Add actor filter pills above the feed: All / Chase / Muse / Claude.
  (Filter on the normalized actor, not the raw column value.)

Suggested badge style: reuse `.st` with a new class per actor, e.g.
`.st.chase` (green), `.st.muse` (blue), `.st.claude` (orange) — or a single
neutral `.st.actor` if color feels noisy.

## Part 2 — Capture (app writes)

The app never sets these columns today, so Chase's own app writes land as
`postgres` (DB default). Every app write path should tag the actor:

| Path | File | Change |
|---|---|---|
| New person | `js/person.js` (save) | `created_by: 'chase'`, `updated_by: 'chase'` |
| Edit person | `js/person.js` (save) | `updated_by: 'chase'` |
| New follow-up | `js/new.js` `newFollowup()` | `created_by` / `updated_by`: `'chase'` |
| Edit follow-up | `js/followups.js` `editFollowup()` | `updated_by: 'chase'` |
| Done/park/reopen follow-up | `js/followups.js` `bindFollowups` | `updated_by: 'chase'` |
| New task | `js/tasks.js` `openTaskForm()` | `created_by` / `updated_by`: `'chase'` |
| Edit/delete task | `js/tasks.js` `editTask()` | `updated_by: 'chase'` |
| Done/reopen task | `js/tasks.js` `bindTasks` | `updated_by: 'chase'` |
| New event | `js/events.js` `openEventForm()` | `created_by` / `updated_by`: `'chase'` |
| Edit event | `js/events.js` `editEvent()` | `updated_by: 'chase'` |
| Log interaction | `js/pages.js` `renderInteractions` form | `created_by: 'chase'` |

Convention for non-app writers (already in use): scripts/agents pass their
own tag — `muse` via `x-actor: muse` + explicit `updated_by`, Claude via its
own integration. Keep the values lowercase, single token.

## Out of scope

- Backfilling `postgres`/`unknown` historical rows (can't reliably attribute
  them; leave as system).
- RLS changes — the columns are already writable; this is app-level only.
- Per-field history — "who" at the row level is enough; no audit log.

## Estimate

Small. ~15 one-line payload changes + the Recent feed badge/filter (~40
lines). No migration needed.
