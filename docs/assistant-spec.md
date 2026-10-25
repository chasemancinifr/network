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

## Scope correction (Chase, Oct 24 2026)
Network is primarily a **personal-life** CRM — family, friends, hobbies,
interests, an entire personal network — with business and sales as one part
of it, not the frame. Suggestions, briefs, and digests lead with personal
life; sales-floor items are one section among others, never the whole
picture.

## Approved extensions (Chase, Oct 24 2026)
1. **Post-sale touches stay VERY light.** Chase's work system already
   reminds him constantly from a database of hundreds — the assistant must
   not duplicate it. At most the highest-value moments (a thank-you, one
   real check-in), never a multi-step cadence.
2. **Life-event fast lane.** A signal with kind=life_event gets a
   priority-1 suggestion on the next daily run, specific to the event —
   never a generic template. Suggestions and tasks stay current and
   specific, not generic.
3. **Reply loop.** When Chase marks a message suggestion Sent, a follow-up
   is created for +7 days ("Did <name> reply?") so threads don't die
   one-and-done. (The app implements this in the Sent handler.)
4. **Re-entry drafts.** For needs-attention people (Tier A/B, no logged
   conversation in 30+ days, outside Mohawk), drafts are written from their
   real last interaction + latest signal — specific openers, never generic
   "it's been a while" text. Skip anyone with nothing specific to cite.
5. **Introductions.** When two people share real ground (an interest, a
   circle, a world) and would genuinely benefit from meeting, suggest the
   intro with the shared ground spelled out. Only on real shared ground —
   interests are still thin, so this waits until the interests base grows;
   no generic pairings.
6. **Events pipeline (Muse).** Chase's Facebook Interested events feed the
   CRM: friends going or interested get added, as do important listed
   people (hosts, organizers, performers). Plus event prep: who'll be
   there, what they're into, what to ask.
7. **Daily brief, personal-first.** Any brief or digest leads with family,
   friends, events, hobbies, and interests; sales-floor items are one
   section, not the frame.

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
| url | event page link, for events found outside the app (http/https only) |
| event_time | only when the event page states it |
| location | venue, town |

Daily-run rules:
- At most ~8 new suggestions a day; quality over volume.
- Never invent facts. Every suggestion's `reason` points at a real row
  (signal, event, follow-up, interaction, birthday) or something Chase said.
- Don't re-suggest something Chase dismissed (check dedupe_key across all statuses).
- Mohawk Honda coworkers: only for real occasions (birthday, milestone, a post),
  never "it's been a while" — he sees them daily.
- "Who would be into what": for an upcoming event, match people's `interests`
  and circles to the event and suggest invites, with the match spelled out in `reason`.

## Events from outside the app (Chase, Oct 24 2026)
Chase wants the assistant to recommend real upcoming events, not just ones
already in the app, plus who to invite based on interests or history.
- The daily Claude run searches the web (allevents.in, Eventbrite, Times
  Union / Saratoga Living / Albany.org calendars, venue and team sites,
  race calendars, Meetup, track sites) for events 2–21 days out within
  ~45 min of Waterford, driven by Chase's own interests and the network's
  real interests. Max 3 event suggestions a run.
- Every event is verified on its own page (a 2026 date inside the window,
  plus the place). No clear date means it's skipped.
- Stored as `kind = invite` with `url`, `for_date`, `event_time`,
  `location`; `person_id` = the best match (others named in `reason`), or
  null when it's an idea for Chase himself (the app labels it "Event").
  dedupe_key `extevent:<yyyy-mm-dd>:<slug>`.
- **Facebook:** the cloud run can't log in, so Chase's Facebook events come
  through **Muse** (extension 6): Muse writes them into `events` (with
  `event_people` for friends going/interested), and the daily run then
  suggests who else to invite.
- The app's **Add to calendar** button creates the `events` row (title,
  date, time, notes = place + link + why), adds the matched person to
  `event_people`, and sets the suggestion's `event_id`.
