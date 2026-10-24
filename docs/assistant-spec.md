# Assistant layer — how it works and who feeds what

Chase's direction (Oct 23 2026): Network should grow into an AI relationship
manager. The Dashboard keeps him updated on upcoming events, who would be into
what, and suggested compliments or messages based on social media.

Roles (decided by Chase, Oct 23 2026):
- **Muse** watches social media (it's connected to Chase's Facebook and
  Instagram) and writes what it sees into `signals`, plus handles into
  `people.socials`.
- **Claude** runs once a day in the cloud, reads the whole CRM (people,
  interests, signals, events, follow-ups, interactions) and writes drafts into
  `suggestions`.
- **Chase** acts on them from the Dashboard: Text (opens Messages with the
  draft filled in), Copy, Sent ✓ (logs a real `message` interaction, so
  last_contact moves), or Dismiss.

## Tables (migrations `assistant_1…16`, Oct 23 2026)

### `people` — two new columns
- `interests text[]` — short lowercase-ish phrases ("volleyball", "real
  estate", "G37"). Only things Chase said, or that a person posted about
  themselves. Editable in the person form (comma separated).
- `socials jsonb` — `{ "instagram": "@handle", "facebook": "https://facebook.com/...", "tiktok": "@handle", "linkedin": "..." }`.
  Handle or full URL both work. Other keys are kept but not shown.

### `signals` — what's new with a person (Muse writes these)
| column | notes |
|---|---|
| person_id | required |
| source | facebook / instagram / tiktok / linkedin / chase / muse / claude / other |
| kind | post / life_event / milestone / interest / news / other |
| summary | one plain sentence of what happened, e.g. "Posted photos from his trip to Aruba" |
| url | link to the post, if there is one (only http/https links are shown) |
| observed_on | the date of the post or event, not the date Muse saw it |

Rules for Muse:
1. **Only what's actually on the post.** No guessing about how someone feels
   or why. "Posted a new truck" yes; "seems to be doing well financially" no.
2. **One signal per real event.** Check for an existing signal for the same
   person + url (or same summary within 7 days) before inserting.
3. **Skip anything sensitive**: health, breakups, deaths/grief, politics,
   religion, legal trouble. Those are for Chase to raise, not for a drafted message.
4. An `interest` signal (e.g. they post about golf every week) may also be added
   to `people.interests`, but only when it is clearly recurring.
5. Send `x-actor: muse` as usual.

### `suggestions` — drafts for Chase (Claude writes these daily)
| column | notes |
|---|---|
| person_id | nullable (an idea can be about an event) |
| event_id / signal_id | what it's tied to, if anything |
| kind | message / compliment / congrats / invite / gift / birthday / check_in / other |
| title | the headline Chase sees |
| message | the draft text, in Chase's voice. Short, casual, no emojis unless he uses them |
| reason | why now, citing the real source ("Instagram post Oct 22", "follow-up due today") |
| for_date | when it matters; dated items more than 2 days past fall off the Dashboard |
| priority | 1 high · 2 normal · 3 low |
| status | new / done / dismissed (the app sets done/dismissed + acted_at) |
| dedupe_key | unique; e.g. `birthday:<person_id>:2026`, `signal:<signal_id>`, `invite:<event_id>:<person_id>` |

Daily-run rules:
- At most ~8 new suggestions a day; quality over volume.
- Never invent facts. Every suggestion's `reason` points at a real row
  (signal, event, follow-up, interaction, birthday) or something Chase said.
- Don't re-suggest something Chase dismissed (check dedupe_key across all statuses).
- Mohawk Honda coworkers: only for real occasions (birthday, milestone, a post),
  never "it's been a while" — he sees them daily.
- "Who would be into what": for an upcoming event, match people's `interests`
  and circles to the event and suggest invites, with the match spelled out in `reason`.
