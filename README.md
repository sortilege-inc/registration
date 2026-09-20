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
  art: 'assets/art/my-event.jpg',   // optional; falls back to the house line art
  fit: 'contain',                   // optional; show art whole, see "Hero art"
  pitch: 'One paragraph.',
  status: 'Two seats left',
  when: 'Sat 3 Oct',                // the date
  hours: '7:00-10:00 PM',           // the time, on its own line
  length: '3 hours',                // one sitting
  sessions: '8-12',                 // optional; how many sittings in all
  duration: 'Short',                // tile tag: Short | Medium | Long. A one-shot
                                    // derives 'Once' and needs no field.
  where: 'Belgian Club',            // short name; use the map link for the rest
  whereUrl: 'https://www.google.com/maps/search/?api=1&query=...',
  address: 'Belgian Club, 407 Provencher Blvd, Winnipeg',  // for the .ics
  price: { amount: '35 USD', per: 'session' },

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
  repeat: 'FREQ=WEEKLY;INTERVAL=2', // recurring campaign; see below
  hidden: true,                     // keep out of the chooser, link still works
  past: true,                       // force "already played"; see below

  questions: [ /* see below */ ],
}
```

Then add the key to `EVENT_ORDER` to place it in the chooser.

### Suppressing an event

`hidden: true` takes an event out of **both** browsing surfaces — the tiles and the month
view — and out of the filter options, without touching a word of its content. Its
`?event=` link still works in full: art, details, form, payment, calendar file. So a table
can be set up and sellable while being handed out directly rather than listed, which is
what a game gets before it is announced. Delete the line to list it.

That is different from `past: true`, which says a table has **run**: a past event also
drops out of both surfaces, but its link lands on "this one has run" instead of taking
registrations.

### Tables that have played

**Do not delete an event once it has run.** Every printed QR outlives the night it
advertised, and a deleted key lands on a generic "that link did not match a table I have
open". Leave the entry in place and it lands on the table it named, says it has run, and
points at what is open now.

An event counts as past when `ends` is in the past, so the common case needs no
maintenance at all — there is no flag to remember to set the morning after a session.
Setting `past` explicitly overrides that either way: `past: true` retires a table early,
`past: false` keeps one listed after its date. Events with no `ends` (the recurring
tables) are never past on their own.

Past events drop out of the chooser the same way `hidden` ones do. A past-events view
would filter the other way, on the same `isPast()` predicate in `app.js`.

### Month view

The control opposite FILTER swaps the tiles for a month grid, and `?view=calendar`
opens straight into it. It renders the **same filtered set** as the tiles, so narrowing
to Winnipeg narrows the calendar too.

An event lands on the grid only if it has `starts`. A `repeat` is expanded across the
month, so a fortnightly campaign shows every sitting rather than only its first — the one
RRULE shape in use, `FREQ=WEEKLY` with an `INTERVAL`, is what `occurrencesIn()`
understands. The recurring online tables advertise "Bi-weekly Sundays" and never name a
date, so they cannot be placed; the note under the grid names them rather than letting
them disappear.

Each game is a chip linking to its page, with the details in a popover shown on hover,
on keyboard focus, and on tap — a phone has no hover, so the popover sits inside the link
and a first tap reveals it before a second follows through.

### Filters

The chooser carries a filter bar built from `window.FILTERS`, and every event declares
one value per key:

| key | values |
|-----|--------|
| `run` | `ongoing`, `not-started` |
| `shape` | `one-shot`, `multi-session` |
| `place` | `online`, `winnipeg`, `minneapolis` |

The bar renders as two rows — every heading, then every set of choices — with the chips
stacked inside each column, because three side-by-side chip sets do not fit a phone.

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

- **`startplaying`** — the listing URL. A table sold through StartPlaying.games is booked
  and scheduled there, so **it never shows the form at all**: the page becomes a handoff
  explaining that a free StartPlaying account is needed, with the listing's details and a
  button through to it. Asking for a name and an email here would collect something
  nobody acts on and put a pointless step in front of the listing.
- **`free: true`** — no charge. The confirmation says there is nothing to pay, and the
  Cost row reads "Free" with no `price` needed.
- **`payment`** — a Stripe Payment Link, for paid events **not** on StartPlaying. A
  Payment Link is a plain URL, so this site needs no server and holds no Stripe key of
  any kind. The registration's reference and email are appended as `client_reference_id`
  and `prefilled_email`, which is what lets a payment in the Stripe dashboard be matched
  back to its registration email.
- **None of them** — the confirmation says a payment link is coming.

Ticking the cost-assistance switch suppresses the button on the paid paths: nobody who
just asked about affording it should be handed a bill. Free events have no such switch.

`price` is an object so the tile token and the summary line cannot drift: the tile shows
`amount` alone ("35 USD") and the summary builds "35 USD / session" from both halves.
Leave `per` out for a one-shot — "35 CAD / session" invites the question of how many
sessions there are.

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

For a recurring campaign, `starts`/`ends` describe the **first session** and `repeat`
carries an iCalendar RRULE (`FREQ=WEEKLY;INTERVAL=2` for fortnightly), so the calendar
entry covers the campaign rather than one evening. `repeat` also stops `isPast()` from
retiring the whole campaign once session one has been played.

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

### Tile tokens

Each tile carries a short stack of tokens down the top-left of its art, colour-coded by
category: coral for "act now" (Waitlist), teal for Free, plum for place (`WPG`, `MPLS`,
`SP.G`), gold for money (the price `amount`), lilac for how long the run is. Being full
outranks being free — a free table nobody can join is not a free table.

The run-length tag comes from `duration` (`Short`, `Medium`, `Long`); a `one-shot` derives `Once`
from its `shape`, so the common case needs no field and a new one-shot is tagged
correctly the moment it is added.

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

**Only the house art multiplies.** `assets/art/the-filth.png` is black line work on
white, and `mix-blend-mode: multiply` drops its white out to leave the ink sitting on the
coral. Everything an event supplies — a painting, a photograph, a publisher's ornament —
renders exactly as given, because under multiply all of it collapses towards one coral
tone. Nothing needs a flag: the hero starts with the house treatment and loses it the
moment an event provides its own `art`.

**Prefer event art with no title lockup on it.** The page prints the system and the title
itself, so a cover carrying its own wordmark says everything twice and constrains how the
image can be cropped.

The hero image is **full bleed**: the full width of the sheet, its natural height, and no
padding above or below. There is no height cap, so **prefer wide art** — a portrait cover
would be very tall here. Tarot tiles crop to a 3:4 window with `object-fit: cover`, so
centre-weighted art works best there.

Trim the white margin off line art before adding it. Under `multiply` the white is
invisible, so any margin baked into the file reads as empty space around the art with no
way to tell from the page why it is there. `magick in.png -fuzz 2% -trim +repage out.png`
took The Filth from 2500x2000 to 2413x1240 — the same picture, 107px shorter on a phone.

On an event's page the art is framed — a paper mat and a gold hairline, the same frame
the tiles use. The house art takes none of that: its white is blended away, so there
would be nothing for a mat to sit against.

An `art` path that 404s is not fatal: the hero falls back to the house line art and the
tile falls back to it too, both with a console warning. So an event entry can be added
before its cover is.

### Progressive enhancement

The form is built into the DOM in full, with nothing hidden, before the step-through runs;
`initWizard()` only groups sections by `data-step` and toggles visibility. Every field
stays in the DOM the whole time, so the payload is identical with or without the wizard,
and an event with no optional questions degrades to a single page with one Send button.

## Stripe

A paid table that is not on StartPlaying gets a **Payment Link** — a plain URL in the
event's `payment` field. That is the whole integration: **this site holds no Stripe key
of any kind**, and one should never be added. A publishable key would have no job here
and a secret key would be a disaster.

`app.js` appends two things to the link when it builds the button:

- `client_reference_id` — the registration's reference (`ROOTHA-B608A`). It shows against
  the payment in the Stripe dashboard, which is what lets a payment be matched back to
  the registration email.
- `prefilled_email` — so nobody types their address twice.

**Nothing tells the site whether payment succeeded.** The registration email arrives when
the form is submitted, regardless; the payment is reconciled in the Stripe dashboard by
its reference. That is a deliberate consequence of having no backend, not an oversight.

### Testing

To exercise the payment path without taking money, create the product and link with a
**test-mode** key (`rk_test_…`) and point a `hidden: true` event at the resulting link.
Stripe's test checkout takes `4242 4242 4242 4242` with any future expiry and any CVC.
Archive the product and delete the event when you are done — a stale test product in the
catalog is the kind of thing that later gets mistaken for a real one.

### Creating a link

`scripts/stripe-event.sh` creates the product, price and Payment Link in one go:

```bash
./scripts/stripe-event.sh --name "A Table With A Name" --amount 3500 --currency cad
```

`--amount` is whole cents. **Test mode is the default** — the script reads the key's
prefix and refuses a live key unless `--live` is also passed, so a live charge cannot
happen by typo.

The key lives at `~/.secrets/stripe-claude.key` (mode 600, outside every repo) and is
read into the environment for the duration of the command. It is never an argument,
never in shell history, and never printed. To place one:

```bash
mkdir -p ~/.secrets && chmod 700 ~/.secrets && install -m 600 /dev/null ~/.secrets/stripe-claude.key && cat > ~/.secrets/stripe-claude.key
```

Paste, Enter, Ctrl-D. Use a **restricted** key (`rk_test_…`) with write on Products,
Prices and Payment Links and nothing else.

### Campaign subscriptions

A campaign seat is a **recurring** Stripe price — `--recurring week --every 2` for
fortnightly — nicknamed by cadence so the catalog sorts sensibly. The nickname is the
only place those cadence labels live: a Stripe Price belongs to exactly one Product, so
prices cannot be shared between games, and the **Product name is what the customer sees
at checkout**. Product per game, therefore, never product per cadence.

Two things a subscription will not do for you, both worth holding in mind:

- **Billing starts when someone pays, not on the date the campaign starts.** A link
  published months early charges people for sessions that have not happened. Create the
  product and price whenever, and create the *link* when the seat should be sellable —
  `--no-link` stops the script short for exactly this reason.
- **It keeps charging until somebody cancels it.** Skipped sessions still bill, and when
  the campaign ends nothing in Stripe knows. There is no backend and no webhook here, so
  nothing will remind you. Cancelling every player's subscription is a manual step at the
  end of a campaign, and forgetting it charges people for a game that is over.

### Currency

Standing policy, carried over from the landing site: **CAD for in-person tables, USD for
online ones.** The Stripe price, the `price.amount` token on the tile and the summary
line must all agree — the first two are separate systems, so check them against each
other when creating a link.

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
