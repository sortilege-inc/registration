# Sortilege registration — rsvp.sortilege.online

A buildless static page: people scan a QR for a specific table and register for it.
Sibling of the onboarding form in the [landing](https://github.com/sortilege-inc/landing)
repo — same design tokens, same form chassis, same email backend.

No framework, no bundler, no npm. Open `index.html` and it works.

## One page, many events

The URL says which table:

```
https://rsvp.sortilege.online/?event=troika-well
https://rsvp.sortilege.online/?event=troika-well&src=table-tent
```

`?event=` is the key of an entry in `data.js`; `?src=` is carried into the email so a
per-event QR can say where it was scanned. A missing or unknown key shows a chooser
listing every event instead of an error, and the chooser preserves `?src=`.

## Adding an event

Add an entry to `window.EVENTS` in `data.js` and push. Nothing else — no markup, no code.

```js
'my-event': {
  // The system prints directly above the title, so the title should not repeat
  // it: "Arkham Horror: The Roleplaying Game" / "Three Days to the Big Easy",
  // never "Arkham Horror: Three Days to the Big Easy".
  title: 'A Table With A Name',
  system: 'Troika!',
  art: 'assets/art/my-event.jpg',   // optional; falls back to the Sortilege line art
  plainArt: true,                   // optional; see "Hero art" below
  pitch: 'One paragraph.',
  status: 'Two seats left',
  when: 'Sat 3 Oct, 7pm',
  length: '3 hours',
  where: 'Online (Discord)',
  price: '$35 / session',

  startplaying: 'https://startplaying.games/adventure/…',  // OR
  payment: 'https://buy.stripe.com/…',                     // OR
  free: true,                                              // one of the three

  run: 'not-started',               // filter facets; see "Filters" below
  shape: 'one-shot',
  place: 'winnipeg',

  seats: 8,                         // optional; DEFAULT_SEATS (6) otherwise,
                                    // null to not track seats at all
  taken: 0,                         // bump as registrations come in
  starts: '2026-10-06T18:00',       // optional; enables Add to calendar
  ends: '2026-10-06T21:00',
  zone: 'America/Winnipeg',         // set for ONLINE events; see below

  questions: [ /* see below */ ],
}
```

Then add the key to `EVENT_ORDER` to place it in the chooser.

### Filters

The chooser carries a filter bar built from `window.FILTERS`, and every event declares
one value per key:

| key | values |
|-----|--------|
| `run` | `ongoing`, `not-started` |
| `shape` | `one-shot`, `multi-session` |
| `place` | `online`, `winnipeg`, `minneapolis` |

Picks are **OR'd within a group and AND'd across groups**; a group with nothing picked
does not constrain. A button only renders when at least one event actually carries its
value, and a group whose options all collapse to one is dropped entirely — so
"In person: Minneapolis" is absent today and appears by itself the moment a Minneapolis
table exists. No event is ever hidden from the chooser by a control that returns nothing.

The picks are mirrored into the URL (`?place=winnipeg&shape=one-shot`) with
`replaceState`, so a filtered view is a link — and therefore a QR code. Values in the URL
that are not in the vocabulary are ignored rather than filtering everything away.

### How the seat gets paid for

Exactly one of these, or none:

- **`free: true`** — no charge. The confirmation says there is nothing to pay, and the
  Cost row reads "Free" with no `price` needed. Wins over everything else.
- **`startplaying`** — the listing URL. Anything sold through StartPlaying.games is
  booked and paid for there, so the confirmation hands them straight over.
- **`payment`** — a Stripe Payment Link, for paid events **not** on StartPlaying. A
  Payment Link is a plain URL, so this site needs no server and holds no Stripe key of
  any kind. The registration's reference and email are appended as `client_reference_id`
  and `prefilled_email`, which is what lets a payment in the Stripe dashboard be matched
  back to its registration email.
- **None of them** — the confirmation says a payment link is coming.

Ticking the cost-assistance switch suppresses the button on the paid paths: nobody who
just asked about affording it should be handed a bill. Free events have no such switch.

### Seats and the waitlist

Every table seats `DEFAULT_SEATS` (6) unless its entry sets `seats`; `seats: null` turns
seat tracking off entirely, which is what the StartPlaying tables use since their seats
are counted on the listing.

**`taken` is maintained by hand.** A static page has no way to count submissions — there
is no database and no server keeping a tally — so the number in `data.js` is the number,
and you bump it and push as registrations come in. Once `taken` reaches the cap the page
says so on the way in, the confirmation says "You're On The Waitlist" instead of "You're
On The List", the email subject becomes `Waitlist — <event>` rather than
`Registration — <event>`, and the body carries a `WAITLIST` line. Nobody is ever turned
away — they are just told where they stand.

If you would rather the count were real, that needs somewhere to keep state. See
"Counting seats for real" at the bottom.

### Add to calendar

An event with `starts` (and ideally `ends`) shows an **Add to calendar** button on the
confirmation. The `.ics` is built in the browser and handed over as a blob — no server,
no library.

`starts` and `ends` are written as local wall-clock. What happens to them depends on
whether the event has a `zone`:

- **No `zone`** — the times stay **floating** (`DTSTART:20261006T180000`), which is
  exactly right for an in-person night: 6pm at the Belgian Club is 6pm for everyone who
  can get there, whatever their laptop thinks its timezone is.
- **With `zone`** — the wall-clock is read as being in that zone and converted to UTC
  (`DTSTART:20261002T210000Z`), which is what an online game needs so a player in another
  city gets the right hour. Set it for anything played over Discord or a VTT.

### Questions

Every event currently asks nothing beyond a name and an email. The machinery below is
live and tested, so a future event can ask whatever it needs by filling in its
`questions` array — one object per step:

```js
{
  title: 'Boundaries',                 // step name in the progress bar
  heading: 'Boundaries To Note',       // section heading on the page
  lede: 'Optional paragraph.',
  fields: [ … ],
}
```

Field types, all built by `buildField()` in `app.js`:

| `type`     | Renders                                  | Extra keys |
|------------|------------------------------------------|------------|
| `text`     | one-line input                           | `placeholder` |
| `textarea` | multi-line input                         | |
| `chips`    | pill multi-select                        | `options`, `single` (radios), `stack`, `writeIn` |
| `tags`     | type-to-filter tag picker; write-ins kept | `source` (a `window.<NAME>` seed array), `placeholder` |
| `switch`   | toggle                                   | `text`, `value` |
| `slider`   | notched slider with a live readout       | `scale` (the wording per notch), `value` |

All take `name` and `label`; `optional: true` adds the coral OPTIONAL marker.
Every event question is optional by definition — page one (name and email) is the only
gate. An event with no questions is a single page with one Send button; the numbered
progress bar appears only once there is more than one step.

A `chips` field with `writeIn` also emits `<name>-other`. A `tags` field emits one
hidden input per tag under the same name, so `FormData.getAll` picks up the whole set.

## Email backend — SHARED, DO NOT DEPLOY FROM HERE

Submissions POST to the Cloudflare Worker at
`https://sortilege-onboarding.sortilege.workers.dev`.

**That Worker's source lives in the landing repo, at `worker/`, and that repo owns it.**
Never copy it here and deploy — that overwrites the live one, which the onboarding form
also depends on. To change it, edit `~/Sortilege/Projects/Active/landing/worker` and
deploy from there:

```bash
cd ~/Sortilege/Projects/Active/landing/worker && NODE_OPTIONS=--no-network-family-autoselection npx wrangler deploy
```

The Worker renders whatever JSON keys it receives, title-casing unknown ones, so adding
a question here needs no Worker change. `LABELS` and `ORDER` in its `src/index.js` only
make the email prettier.

Two things in the Worker do matter to this site:

- `ALLOWED_ORIGIN` in `worker/wrangler.toml` must include `https://rsvp.sortilege.online`
  (and `http://localhost:4318` for local testing), or the browser blocks the POST.
- This form sends `kind: "Registration — <event>"` (or `Waitlist — <event>`), which the
  Worker puts in the subject line so registrations are separable from the landing form's
  seat requests. With no `kind` the Worker falls back to `A seat request`, which is what
  landing still sends.
- This form also sends `cc: true`, which tells the Worker to copy the registrant's own
  address on the email — that copy *is* their confirmation. The landing form sends no
  `cc` and is unaffected: it is an intake, not a booking, and copying people in on it
  would be a surprise. Neither `kind` nor `cc` appears in the email body.

Mail lands in the same inboxes as onboarding (`MG_TO`). Note that mail to
`jordan@sortilege.online` is delivered to **Google Workspace**, not the Namecheap
PrivateEmail mailbox — if something "isn't arriving", check mail.google.com as that
address, and check spam: `mg.sortilege.online` is a young sending domain.

## Hosting

GitHub Pages from `main` / root, custom domain via the `CNAME` file
(`rsvp.sortilege.online` → `sortilege-inc.github.io`), DNS at Namecheap.

**Turn on Enforce HTTPS** in Settings → Pages. The form POSTs to an `https` endpoint, so
an `http` visitor is blocked by mixed content and sees only a generic failure.

## Cache busting

`index.html` references `styles.css?v=N`, `data.js?v=N`, `app.js?v=N`. **Bump `N` whenever
you change any of them.** Without it, returning visitors get the cached copy after a
deploy — which bit the landing site twice.

## Local development

```bash
python3 -m http.server 4318
```

Port 4318 is the one allowlisted in the Worker's `ALLOWED_ORIGIN`, so submissions work
locally — and go to the real inboxes. Set `ENDPOINT = null` at the top of `app.js` to
log the payload to the console instead of sending.

## Notes

### Hero art

The hero art is multiplied onto the coral panel (`mix-blend-mode: multiply`), which is
the right treatment for **black line work on white** — it drops the white out. A
full-colour cover or photograph under it collapses to a single coral tone, so those
events set `plainArt: true` to render the art as-is.

Covers come in every shape — portrait quickstarts, square posters, landscape plates — so
the hero image is capped at `52vh` and `object-fit: contain`ed rather than cropped. The
whole cover stays visible, its own title lockup is never cut, the coral shows through the
letterbox, and a tall cover cannot eat the screen before the reader reaches the form.

An `art` path that 404s is not fatal: the hero falls back to the Sortilege line art and
the chooser drops that card's thumbnail, both with a console warning. So an event entry
can be added before its cover is.

### Progressive enhancement

The form is built into the DOM in full, with nothing hidden, before the step-through runs;
`initWizard()` only groups sections by `data-step` and toggles visibility. Every field
stays in the DOM the whole time, so the payload is identical with or without the wizard,
and an event with no optional questions degrades to a single page with one Send button.

## Counting seats for real

`taken` in `data.js` is a hand-maintained number, which is the only option a static page
has on its own. Making it real needs somewhere to keep state, and the cheapest honest
version is a KV namespace on the shared Worker:

- POST increments a per-event counter and returns the registrant's position.
- A GET route returns current counts, which this page fetches on load.
- The waitlist line then reflects reality with no bookkeeping.

That is a change to the landing repo's Worker plus a KV binding, and it makes this page
depend on a network call to render its seat count — so it is worth doing only once the
manual number starts being wrong. Until then, the manual tally is honest and free.
