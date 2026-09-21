# rsvp.sortilege.online — working notes

Buildless static site: `index.html`, `styles.css`, `app.js`, `data.js`. No framework, no
bundler, no npm. `data.js` is the whole content layer — adding or changing a game is an
edit there and a push, never markup or code.

`README.md` is the reference. This file is the part that bites.

## Bump `?v=N` on every change to css/js

`index.html` references `styles.css?v=N`, `data.js?v=N`, `app.js?v=N`. **Bump N whenever
any of them changes**, in the same commit. Skipping it means returning visitors run old
code against new data. This has caused real breakage twice on the sibling site.

Images are exempt: they keep stable filenames and GitHub Pages serves assets with
`max-age=600`, so a re-cropped image self-corrects within ten minutes. Verified, not
assumed — don't add `?v=` to art paths.

## The Worker is not ours

Submissions POST to `sortilege-onboarding.sortilege.workers.dev`. **Its source lives in
the landing repo (`../landing/worker/`) and that repo owns it. Never copy it here and
never deploy it from here** — that overwrites the live Worker the onboarding form also
depends on. To change it, edit `../landing/worker` and deploy from there:

```bash
cd ~/Sortilege/Projects/Active/landing/worker && NODE_OPTIONS=--no-network-family-autoselection npx wrangler deploy
```

`NODE_OPTIONS=--no-network-family-autoselection` is required for every Node fetch tool on
this machine — without it wrangler dies with a bare "fetch failed" (Tailscale has a global
IPv6 address with no default route).

This site sends two flags the Worker reads and drops from the body: `kind` (the subject
line) and `cc: true` (copies the registrant, which *is* their confirmation).

## How a seat gets sold

Exactly one of these per event. They are mutually exclusive:

| field | page shown | asks for |
|---|---|---|
| `startplaying: '<url>'` | handoff — "this one runs on StartPlaying" | **nothing**, zero inputs |
| `free: true` | form | name + email |
| `payment: '<stripe link>'` | form, then PAY WITH CARD | name + email |
| none of them | form, "a payment link is coming" | name + email |

**StartPlaying games never show the form.** They are booked and scheduled there; asking
for a name and email here would collect something nobody acts on and put a pointless step
in front of the listing. They also need no Stripe product.

The form is name and email only, both required. The email is required because the Worker
copies the registrant on the submission.

Routing in `app.js` runs: no event → chooser, **`isPast` → the played notice**,
`startplaying` → handoff, otherwise the form. So a table that has run never takes
registrations and never points at a listing that has closed, whatever else it carries.

## `hidden` vs `past`

Both drop an event from the tiles *and* the month view. They mean opposite things:

- **`hidden: true`** — not announced yet. The `?event=` link still serves everything:
  art, details, form, payment button, calendar file. A table can be sellable by direct
  link while staying off the public roster.
- **`past: true`** — it has run. The link lands on "this one has run" and takes nothing.
  Usually unnecessary: an event goes past automatically once **`starts`** has gone by,
  read against the viewing client's clock as the page loads. The cutoff is the start and
  not the end because nobody can take a seat at a table that has already begun — a poster
  scanned at ten past six should say so rather than offer a form. Set the flag explicitly
  to retire a table early (`true`) or keep one listed past its date (`false`). A page left
  open across a start time keeps what it showed on load; the next load is right.

**Never delete a finished event.** Every printed QR outlives the night it advertised. A
deleted key lands on a generic "that link did not match a table I have open"; a kept one
lands on the table it named and points at what is open now.

**`hidden` does not stop sales.** A Stripe Payment Link is payable the moment it exists,
listed or not. To actually stop a table selling, deactivate the link in Stripe.

## Stripe

**Only ever touch products, prices and payment links created for this site.** Other live
payment links exist on the account, they are unrelated, and they are not to be
deactivated or raised as concerns. The ids that belong to us are recorded in `data.js`
beside each event's `payment`.

The key lives at `~/.secrets/stripe-claude.key`, mode 600, outside every repo. It is read
into the environment for a single command and never printed, never an argument, never
pasted into chat. **The site itself holds no Stripe credential of any kind and must never
be given one** — a Payment Link is a plain URL.

`scripts/stripe-event.sh` creates product, price and link. **Test mode is the default**;
it reads the key's prefix and refuses a live key without `--live`. `--no-link` stops
before the link, for a table that should not be sellable yet. `--price` reuses an existing
price after a half-finished run.

Catalog shape, forced by Stripe's data model: **a Price belongs to exactly one Product,
and the Product name is what the payer reads at checkout.** So it is product-per-game with
the cadence in the price *nickname*, never product-per-cadence. The nicknames in use:

- `$35 CAD Biweekly Campaign Subscription` — `--recurring week --every 2`
- `$35 CAD Weekly Campaign Subscription` — `--recurring week --every 1`
- `$35 CAD One-Shot` — no `--recurring`

**Currency: CAD for in-person tables, USD for online ones.** The Stripe price and the
`price.amount` token on the tile are separate systems; check them against each other.
Leave `per` out for a one-shot — "35 CAD / session" invites a question with no answer.

Two things a subscription will not do, both the owner's manual work:

- **Billing starts when someone pays, not when the campaign starts.** An early
  subscription is paused in the Stripe dashboard.
- **It charges until cancelled.** Skipped sessions still bill, and when a campaign ends
  nothing in Stripe knows. There is no backend and no webhook here, so nothing will
  remind anyone. Cancelling every player at the end is a manual step.

Nothing tells the site whether a payment succeeded. Reconciliation is in the dashboard by
the registration's reference, which rides on the link as `client_reference_id`.

## Art

**Only the house art (`the-filth.png`) multiplies.** It is ink on white, and the blend
drops the white to leave the ink on coral. Everything an event supplies renders as given —
under multiply a painting or a photograph collapses towards one coral tone. There is no
flag: the hero starts with the house treatment and loses it when an event has its own
`art`.

- `fit: 'contain'` for an ornament rather than a cover, so a 3:4 crop doesn't keep the
  middle and throw away the rest. Default is `cover`.
- **Prefer wide art.** The hero is full width at natural height with no cap; a portrait
  cover runs very tall.
- **Trim white margins before adding line art** (`magick in.png -fuzz 2% -trim +repage`).
  Under multiply the white is invisible, so baked-in margin reads as unexplained space.
- Prefer art with no title lockup on it — the page prints the system and title itself.
- A missing `art` is not fatal: the hero falls back to the house art and the tile drops
  its thumbnail, both with a console warning.

## Dates, `.ics` and seats

- `when` is the date, `hours` is the time on its own line, `length` is one sitting,
  `sessions` is how many sittings in all, `duration` is the tile tag (`Short`/`Medium`/`Long`) —
  a `one-shot` derives `Once` from its `shape`, so only campaigns need the field.
- `starts` is what retires a table (see `hidden` vs `past`); `ends` feeds the `.ics` and
  the month view only. `starts`/`ends` are local wall-clock. **No `zone` means floating time** — correct for an
  in-person night, where 6pm is 6pm for everyone who can get there. **Set `zone` for
  online games**, or a player in another city gets the wrong hour.
- `repeat` carries an RRULE (`FREQ=WEEKLY;INTERVAL=2`). It makes the calendar entry the
  campaign rather than one evening, expands the month view across every sitting, and
  stops `isPast()` retiring a campaign after session one.
- **A recurrence crossing a DST change breaks twice, both silently.** In the month view,
  stepping by `every * 7 * 86400000` is an hour short after the November fall-back, so
  midnight plus a fortnight lands at 23:00 the evening before and a Sunday campaign shows
  up on Saturdays — `occurrencesIn()` steps in whole days for this reason. In the `.ics`,
  a UTC `DTSTART` with an `RRULE` recurs *in UTC*, so a 2pm game becomes 1pm for every
  sitting after the change; a repeating zoned event therefore emits `DTSTART;TZID=` and
  carries a `VTIMEZONE` from `VTIMEZONES` in `app.js`. **Adding a zone there means adding
  its transition rules** — iCalendar has no zone database. Unlisted zones fall back to a
  UTC instant, which is exact for a one-off and only wrong across a recurrence.
- `where` is the short venue name and `whereUrl` its map link; `address` is the street,
  used only by the `.ics`, because that is what a phone navigates from.
- **`taken` is maintained by hand** — a static page cannot count submissions. `seats: null`
  for StartPlaying tables, whose listing counts seats; a number copied here goes stale.

## Discord scheduled events

`scripts/discord-events.mjs` publishes the site's games to the Sortilege guild
(`566707195518124053`). **Dry run is the default**; `--apply` is deliberate, because
creating an event announces it to everyone in the server. `--channels` lists the voice
channels and their ids.

The bot token lives at `~/.secrets/discord-bot.token`, mode 600, read into the process
and never printed. The bot needs `MANAGE_EVENTS` in the guild. **Nothing about Discord
belongs in this repo or in `data.js` except a `discordChannel` id, which is not secret.**

It pushes one way: `data.js` is the source of truth and the script never writes back.

- **What it publishes**: listed (`!hidden`), dated (`starts`), still to come (`!isPast`).
  A hidden table is unannounced and a Discord event is an announcement, so hidden stays
  off. The recurring online tables name a weekday and never a date, so they cannot be
  scheduled at all.
- **What it calls things**: the site prints the system on its own line above the title,
  so a title there need not repeat it. A Discord event has no such line — the name is all
  anyone sees — so the name is rebuilt as *short system* + title, trimming the system at
  its first colon or bracket: "Root: The Roleplaying Game" + "Hacksaw Dell" becomes
  "Root: Hacksaw Dell". This is also what makes the events already in the guild match
  instead of duplicating.
- **Where it says the game is**: `discordChannel` makes it a voice event; otherwise
  `address` (or `where`) makes it external. **An online game with no `discordChannel` is
  skipped**, never published as an external event located "Online" — that looks finished
  and tells nobody where to go.
- **A voice event needs the bot to see the channel.** Guild-level `VIEW_CHANNEL` is not
  enough: almost every channel in this guild denies it by overwrite, and a create against
  one fails `403 Missing Permissions`. Grant the bot's role **View Channel** on the
  specific channels in use. Listing channels is unaffected — the REST endpoint returns
  every channel regardless, which is why picking one always works even when using it does
  not.
- Per-event failures are reported and the run continues; one refused voice event does not
  abandon the external ones.
- **Cover art** comes from the event's `art` file, sent as the data URI Discord's API
  requires — it has no field that takes a URL. This is not the base64-in-HTML that is
  banned elsewhere: the file stays a real file and the encoding lives only in one request
  body. Art is sent **on create, and on update only when the event has none**, because a
  cover set by hand in Discord beats anything derived here and an omitted field is left
  alone by PATCH. `differs()` cannot compare images — Discord returns a hash, not bytes —
  so only their *absence* counts as a difference, or every run would re-upload every
  cover.
- **Re-runs**: existing events are matched by name and PATCHed when details differ, so
  fixing a time in `data.js` and re-running corrects Discord. Renaming a game in
  `data.js` orphans its Discord event and creates a second one — rename in both, or
  delete the old one by hand.
- Events on Discord that the site does not list are **reported and never deleted**; one
  may have been created in the server on purpose.

Discord has no floating time — an event is an instant — so a wall-clock with no `zone`
resolves against `America/Winnipeg`, which is right for every in-person night here.

## Working discipline

- **Assert every string replacement.** Patching these files with `str.replace` and no
  `assert` has silently no-op'd more than once and looked like success.
- **Verify live, and cache-bust when you do.** Pages serves the HTML with `max-age=600`,
  so a browser will happily hand you the previous version and let you conclude the deploy
  failed. Add a throwaway query parameter.
- **Chase styling you cannot explain.** An unaccountably centred popover turned out to be
  a class collision — `.calendar` was both the month view and the "Add to calendar"
  button, so the grid inherited the button's border and padding.
- Class names are shared across a single stylesheet with no scoping. Check before reusing
  one.
