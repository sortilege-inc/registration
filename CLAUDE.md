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
  Usually unnecessary: an event is past automatically once `ends` has gone by. Set it
  explicitly to retire a table early (`true`) or keep one listed past its date (`false`).

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
  `sessions` is how many sittings in all, `duration` is the tile tag (`Short`/`Long`) —
  a `one-shot` derives `Once` from its `shape`, so only campaigns need the field.
- `starts`/`ends` are local wall-clock. **No `zone` means floating time** — correct for an
  in-person night, where 6pm is 6pm for everyone who can get there. **Set `zone` for
  online games**, or a player in another city gets the wrong hour.
- `repeat` carries an RRULE (`FREQ=WEEKLY;INTERVAL=2`). It makes the calendar entry the
  campaign rather than one evening, expands the month view across every sitting, and
  stops `isPast()` retiring a campaign after session one.
- `where` is the short venue name and `whereUrl` its map link; `address` is the street,
  used only by the `.ics`, because that is what a phone navigates from.
- **`taken` is maintained by hand** — a static page cannot count submissions. `seats: null`
  for StartPlaying tables, whose listing counts seats; a number copied here goes stale.

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
