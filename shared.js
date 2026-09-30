/*
 * shared.js — what the roster and the archive both need.
 *
 * Loaded before app.js on the registration page and before past.js on /past/.
 * `isPast()` lives here above all: two copies of "has this run yet?" would
 * drift, and the archive is defined as the complement of the roster.
 *
 * Nothing here touches the page on load — no element lookups, no side effects —
 * so either page can load it safely.
 */

/** Minutes a zone is offset from UTC at a given instant. */
function zoneOffset(timeZone, date) {
  // Floor to a whole minute first: Date.UTC below has no seconds field, so any
  // seconds on the input would come back as a spurious minute of offset.
  const at = new Date(Math.floor(date.getTime() / 60000) * 60000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(at).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(+parts.year, parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  return Math.round((asUTC - at.getTime()) / 60000);
}

/**
 * Has this table already played?
 *
 * An explicit `past` in data.js always wins, so a game can be retired early or
 * kept listed after its date. Otherwise it is derived from `starts`, because a
 * flag that has to be set by hand the morning after every session is a flag
 * that gets forgotten — and every printed QR outlives its event.
 *
 * The cutoff is the START, not the end: once a table has begun, nobody can
 * still take a seat at it, so a registration arriving mid-session is no more
 * useful than one arriving the next day. Scanning the poster at ten past six
 * should say the night has started, not offer a form.
 *
 * Read against the viewing client's own clock, once, as the page loads. A page
 * left open across a start time keeps showing what it showed on load; the next
 * load is correct.
 *
 * Events with no `starts` (the recurring tables) are never past on their own.
 */
function isPast(ev) {
  if (typeof ev.past === 'boolean') return ev.past;
  // A repeating table's `starts` is its FIRST session, not the campaign —
  // deriving from it would retire the whole thing the moment session one began.
  if (ev.repeat) return false;
  if (!ev.starts) return false;
  // Same reading as the .ics: a zone makes it a real instant, otherwise the
  // wall-clock is taken as local — which is what an in-person night means.
  const began = ev.zone
    ? Date.parse(`${ev.starts}:00Z`) - zoneOffset(ev.zone, new Date(`${ev.starts}:00Z`)) * 60000
    : Date.parse(ev.starts);
  return Number.isFinite(began) && began < Date.now();
}

/** "32 USD / session", or "Free". The token on a tile is the amount alone. */
function costLine(ev) {
  if (ev.free) return 'Free';
  const price = ev.price;
  if (!price) return '';
  if (typeof price === 'string') return price;
  return [price.amount, price.per].filter(Boolean).join(' / ');
}

/** How many seats are left, and whether there are any. */
function seatState(ev) {
  // `full: true` says so outright, for a table this site cannot count: a
  // StartPlaying listing keeps its own seat tally, and a number copied here
  // goes stale. It stands in for a count rather than overriding one.
  const cap = ev.seats === null ? null : (ev.seats ?? window.DEFAULT_SEATS ?? null);
  if (!cap) return { cap: null, taken: 0, left: null, full: ev.full === true };
  const taken = Math.max(0, Number(ev.taken) || 0);
  return { cap, taken, left: Math.max(0, cap - taken), full: ev.full === true || taken >= cap };
}

/**
 * Is there anything this page can actually do for someone?
 *
 * A full table whose seats this site does not count (`seats: null`) and which
 * has no listing or payment link to send them to has nothing to offer: no seat,
 * no waitlist worth keeping, nowhere to go. Showing the form would collect an
 * address nobody acts on. A waitlist still makes sense where we run the roster,
 * so this turns on `seats: null` and not on `full` alone.
 */
function takesNothing(ev) {
  return seatState(ev).full && ev.seats === null && !ev.startplaying && !ev.payment;
}

/** Short markers shown on a tile, in the same vocabulary as the filters. */
const PLACE_TOKEN = { winnipeg: 'WPG', minneapolis: 'MPLS' };

/**
 * One tarot tile. `src` is the printed-QR attribution to carry through, if any.
 * Used by the roster and by the archive at /past/, so the two always look and
 * link alike.
 */
function eventTile(key, ev, src) {
  const a = document.createElement('a');
  a.className = 'tarot';
  const carry = new URLSearchParams();
  carry.set('event', key);
  if (src) carry.set('src', src);
  a.href = `?${carry}`;

  const frame = document.createElement('div');
  frame.className = 'tarot__frame';

  if (ev.art) {
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.addEventListener('error', () => {
      console.warn('Event art missing, falling back to the house line art:', ev.art);
      img.src = 'assets/art/the-filth.png';
      frame.classList.add('is-fallback');
    }, { once: true });
    img.src = ev.art;
    frame.append(img);
    if (ev.fit === 'contain') frame.classList.add('is-contain');
  } else {
    frame.classList.add('is-fallback');
    const img = document.createElement('img');
    img.alt = '';
    img.src = 'assets/art/the-filth.png';
    frame.append(img);
  }

  // Tokens down the top-left of the art: how it stands, where it is, what it
  // costs. Being full outranks being free — a free table nobody can join is
  // not a free table, and hiding that behind "Free" is the wrong way round.
  const seats = seatState(ev);
  const tokens = [];
  // "Waitlist" only where this page would actually take one — a table we
  // roster ourselves, whose form switches to waitlist mode when it fills.
  // Anything booked elsewhere takes nothing here, so it is simply full.
  const waitlisted = !takesNothing(ev) && !ev.startplaying;
  if (seats.full) tokens.push([waitlisted ? 'Waitlist' : 'Full', 'is-full']);
  else if (ev.free) tokens.push(['Free', 'is-free']);
  else if (seats.cap) tokens.push([`${seats.left} seats`, '']);
  if (PLACE_TOKEN[ev.place]) tokens.push([PLACE_TOKEN[ev.place], 'is-place']);
  if (ev.startplaying) tokens.push(['SP.G', 'is-place']);
  if (!ev.free && ev.price?.amount) tokens.push([ev.price.amount, 'is-cost']);
  // How long the whole run is. A one-shot says so without needing the field.
  const runs = ev.duration || (ev.shape === 'one-shot' ? 'Once' : '');
  if (runs) tokens.push([runs, 'is-length']);

  if (tokens.length) {
    const strip = document.createElement('span');
    strip.className = 'tarot__tokens';
    for (const [text, mod] of tokens) {
      const flag = document.createElement('span');
      flag.className = `tarot__token ${mod}`.trim();
      flag.textContent = text;
      strip.append(flag);
    }
    frame.append(strip);
  }
  a.append(frame);

  const body = document.createElement('div');
  body.className = 'tarot__body';
  const make = (cls, text, tag = 'p') => {
    const el = document.createElement(tag);
    el.className = cls;
    el.textContent = text; // textContent: event copy can never inject markup
    return el;
  };
  if (ev.system) body.append(make('tarot__system', ev.system));
  body.append(make('tarot__title', ev.title || key, 'h3'));
  if (ev.when) body.append(make('tarot__when', ev.when));
  // Hours sit under the date rather than trailing it on the same line.
  if (ev.hours) body.append(make('tarot__hours', ev.hours));
  if (ev.where) body.append(make('tarot__where', ev.where));
  a.append(body);

  return a;
}
