// Sortilege registration — event routing, form building, submission.
//
// Posts the whole form as JSON to the Cloudflare Worker that lives in the
// LANDING repo (github.com/sortilege-inc/landing, worker/). That Worker is
// shared: this site does not own it and must never deploy over it. It renders
// whatever keys arrive, so the questions below need no change there — only the
// origin allowlist and the `kind` subject field did.
//
// If ENDPOINT is null the form logs the payload instead of sending, which is the
// useful mode when editing locally.

const ENDPOINT = 'https://sortilege-onboarding.sortilege.workers.dev';

const form = document.getElementById('register');
const status = document.getElementById('status');
// Resolved lazily: the send control is built by the wizard.
const sendButton = () => document.querySelector('.wizard__skip');

let lastSubmission = {};
// Sliders are built from data, so their scales are registered here rather than
// living in a constant: collect() turns each one into "3 — I have played a saga".
const sliders = [];

/* ---------- Which event ---------- */
// The whole page is one event's registration. The key comes from ?event= — which
// is what each printed QR carries — and an unknown or absent key falls through
// to a chooser rather than an error.

const params = new URLSearchParams(location.search);
const eventKey = (params.get('event') || '').trim();
const events = window.EVENTS || {};
const event = Object.prototype.hasOwnProperty.call(events, eventKey) ? events[eventKey] : null;

const src = params.get('src');
if (src) form.querySelector('input[name="src"]').value = src.slice(0, 60);

/** Short, human-readable, and safe as a Stripe client_reference_id. */
function makeRef(key) {
  const stem = key.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase() || 'RSVP';
  const tail = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `${stem}-${tail}`;
}

const ref = event ? makeRef(eventKey) : '';

/** "32 USD / session", or "Free". The token on a tile is the amount alone. */
function costLine(ev) {
  if (ev.free) return 'Free';
  const price = ev.price;
  if (!price) return '';
  if (typeof price === 'string') return price;
  return [price.amount, price.per].filter(Boolean).join(' / ');
}

/** The [term, value] rows shown in a booking summary. Blank entries drop out. */
function bookingRows(ev) {
  return [['System', ev.system], ['When', ev.when], ['Time', ev.hours],
          ['Length', ev.length], ['Sessions', ev.sessions],
          ['Where', ev.where], ['Cost', costLine(ev)], ['Status', ev.status]]
    .filter(([, value]) => value);
}

function fillMeta(dl, ev) {
  dl.textContent = '';
  for (const [term, value] of bookingRows(ev)) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    // A venue with a map link is worth one tap rather than a copied address.
    if (term === 'Where' && ev.whereUrl) {
      const link = document.createElement('a');
      link.href = ev.whereUrl;
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = value;
      dd.append(link);
    } else {
      dd.textContent = value;
    }
    dl.append(dt, dd);
  }
}

/* ---------- Chooser ---------- */
// No key, or a key we do not recognise: a filter bar and a grid of tiles.
//
// Filtering is faceted: OR within a group, AND across groups, and a group with
// nothing picked does not constrain. The state lives in the URL so a filtered
// view can be linked or turned into its own QR.

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

/** Short markers shown on a tile, in the same vocabulary as the filters. */
const PLACE_TOKEN = { winnipeg: 'WPG', minneapolis: 'MPLS' };

/** Events in chooser order, deduplicated. */
function orderedEvents() {
  const order = [...(window.EVENT_ORDER || []), ...Object.keys(events)];
  const seen = new Set();
  const out = [];
  for (const key of order) {
    if (seen.has(key) || !events[key]) continue;
    seen.add(key);
    // `hidden` keeps an event out of the chooser while leaving it reachable at
    // its own ?event= link — drafts, and anything being tested. A table that
    // has played drops out the same way, but for the opposite reason: its link
    // still works and says so. A past-events view would filter the other way.
    if (events[key].hidden || events[key].cancelled || isPast(events[key])) continue;
    out.push([key, events[key]]);
  }
  return out;
}

/** Only the groups and options some event actually carries. */
function liveFilters(all) {
  const present = (key, value) => all.some(([, ev]) => ev[key] === value);
  return (window.FILTERS || [])
    .map((group) => ({ ...group, options: group.options.filter(([v]) => present(group.key, v)) }))
    // A single remaining option cannot narrow anything: every event has it.
    .filter((group) => group.options.length > 1);
}

function showChooser() {
  const chooser = document.getElementById('chooser');
  const list = document.getElementById('chooser-list');
  const bar = document.getElementById('filters');
  const empty = document.getElementById('chooser-empty');

  const all = orderedEvents();
  const groups = liveFilters(all);

  // Read any filter carried in the URL, keeping only values we know.
  const picked = new Map();
  for (const group of groups) {
    const raw = (params.get(group.key) || '').split(',').map((s) => s.trim()).filter(Boolean);
    const valid = raw.filter((v) => group.options.some(([value]) => value === v));
    if (valid.length) picked.set(group.key, new Set(valid));
  }

  function matches(ev) {
    for (const [key, values] of picked) {
      if (!values.size) continue;
      if (!values.has(ev[key])) return false;
    }
    return true;
  }

  /** Mirror the picks into the URL without adding a history entry per tap. */
  function syncUrl() {
    const next = new URLSearchParams(location.search);
    for (const group of groups) {
      const values = picked.get(group.key);
      if (values && values.size) next.set(group.key, [...values].join(','));
      else next.delete(group.key);
    }
    // `view` is set by the view toggle; a filter change must not drop it.
    const query = next.toString();
    history.replaceState(history.state, '', query ? `?${query}` : location.pathname);
  }

  // ---- filter bar ----
  // Laid out as a grid so it reads as two rows — every heading, then every set
  // of choices — rather than three label-and-chips stacks one after another.
  bar.style.setProperty('--filter-cols', String(groups.length));
  const chipSets = [];

  for (const group of groups) {
    const label = document.createElement('span');
    label.className = 'filters__label';
    label.id = `filter-${group.key}`;
    label.textContent = group.label;
    bar.append(label);

    const chips = document.createElement('div');
    chips.className = 'chips';
    chips.role = 'group';
    chips.setAttribute('aria-labelledby', label.id);

    for (const [value, text] of group.options) {
      const chip = document.createElement('label');
      chip.className = 'chip';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(picked.get(group.key)?.has(value));
      input.addEventListener('change', () => {
        const set = picked.get(group.key) || new Set();
        if (input.checked) set.add(value); else set.delete(value);
        if (set.size) picked.set(group.key, set); else picked.delete(group.key);
        syncUrl();
        syncToggle();
        render();
      });
      const span = document.createElement('span');
      span.textContent = text;
      chip.append(input, span);
      chips.append(chip);
    }
    chipSets.push(chips);
  }
  // Headings first, then the choices: grid fills row by row.
  for (const chips of chipSets) bar.append(chips);

  // ---- collapse ----
  // Shut by default: most people want the tables, not the controls. It opens
  // itself when the URL arrives with a filter already applied, since otherwise
  // a short list would have no visible explanation.
  const toggle = document.getElementById('filters-toggle');
  const active = document.getElementById('filters-active');

  function setOpen(open) {
    bar.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.filters__caret').textContent = open ? '–' : '+';
  }

  function syncToggle() {
    const chosen = [...picked.values()].reduce((n, set) => n + set.size, 0);
    active.hidden = chosen === 0;
    active.textContent = String(chosen);
    toggle.classList.toggle('is-active', chosen > 0);
  }

  toggle.addEventListener('click', () => setOpen(bar.hidden));
  setOpen(picked.size > 0);

  document.getElementById('filters-clear').addEventListener('click', () => {
    picked.clear();
    bar.querySelectorAll('input[type="checkbox"]').forEach((i) => { i.checked = false; });
    syncUrl();
    syncToggle();
    render();
  });

  // ---- tiles ----
  function tile(key, ev) {
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
    if (seats.full) tokens.push(['Waitlist', 'is-full']);
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

  const shownEvents = () => all.filter(([, ev]) => matches(ev));

  // ---- grid or month ----
  const viewToggle = document.getElementById('view-toggle');
  const calendar = initCalendar({ shownEvents });
  let calendarOpen = params.get('view') === 'calendar';

  function setView(open) {
    calendarOpen = open;
    calendar.section.hidden = !open;
    list.hidden = open;
    viewToggle.setAttribute('aria-pressed', String(open));
    viewToggle.classList.toggle('is-on', open);
    // The empty state belongs to whichever view is showing.
    empty.hidden = shownEvents().length > 0;
    if (open) calendar.render();
    const next = new URLSearchParams(location.search);
    if (open) next.set('view', 'calendar'); else next.delete('view');
    const query = next.toString();
    history.replaceState(history.state, '', query ? `?${query}` : location.pathname);
  }

  viewToggle.addEventListener('click', () => setView(!calendarOpen));

  function render() {
    const shown = shownEvents();
    list.textContent = '';
    for (const [key, ev] of shown) list.append(tile(key, ev));

    empty.hidden = shown.length > 0;
    if (calendarOpen) calendar.render();
  }

  render();
  syncToggle();
  setView(calendarOpen);

  // A link that named a table we no longer have should say so. The lede is
  // hidden by default — the chooser opens straight on the filters — so it has
  // to be un-hidden here, not merely written to.
  if (eventKey) {
    const lede = document.getElementById('chooser-lede');
    lede.textContent =
      'That link did not match a table I have open — it may have finished, or filled. Here is everything running now.';
    lede.hidden = false;
  }
  chooser.hidden = false;
}

/* ---------- Calendar ---------- */
// A month grid over the same filtered set the tiles show. Only events with a
// `starts` can be placed — the recurring online tables say "Bi-weekly Sundays"
// and never name a date, so the note under the grid accounts for them rather
// than letting them vanish silently.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
                'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

/** Local Y/M/D for a wall-clock string, with no timezone in the way. */
function localDate(stamp) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(stamp || '');
  return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null;
}

/**
 * Which days of `year`/`month` this event falls on.
 * Handles the one RRULE shape in use — FREQ=WEEKLY with an INTERVAL — so a
 * fortnightly campaign shows every sitting rather than only its first.
 */
function occurrencesIn(ev, year, month) {
  const start = localDate(ev.starts);
  if (!start) return [];
  const first = new Date(start.y, start.m, start.d);
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  const weekly = /FREQ=WEEKLY/.test(ev.repeat || '');
  if (!weekly) {
    return first >= monthStart && first <= monthEnd ? [first.getDate()] : [];
  }

  const every = Number((/INTERVAL=(\d+)/.exec(ev.repeat) || [])[1]) || 1;
  const days = [];
  // Walk from the first sitting in whole DAYS, not milliseconds. A fixed
  // every * 7 * 86400000 is an hour short across the end of DST, so midnight
  // plus a fortnight lands at 23:00 the previous evening and the sitting shows
  // up on the day before — a Sunday campaign moving onto Saturdays in November.
  for (let n = 0; ; n += 1) {
    const when = new Date(start.y, start.m, start.d + n * every * 7);
    if (when > monthEnd) break;
    if (when >= monthStart) days.push(when.getDate());
  }
  return days;
}

function initCalendar({ shownEvents, onMonthRender }) {
  const section = document.getElementById('calendar');
  const grid = document.getElementById('cal-grid');
  const label = document.getElementById('cal-month');
  const note = document.getElementById('cal-note');
  const today = new Date();
  let year = today.getFullYear();
  let month = today.getMonth();

  function detailLines(ev) {
    return [ev.system, ev.hours, ev.where, ev.free ? 'Free' : costLine(ev)]
      .filter(Boolean);
  }

  function render() {
    const events = shownEvents();
    label.textContent = `${MONTHS[month]} ${year}`;
    grid.textContent = '';

    for (const day of WEEKDAYS) {
      const head = document.createElement('span');
      head.className = 'calendar__weekday';
      head.setAttribute('aria-hidden', 'true');
      head.textContent = day;
      grid.append(head);
    }

    // Placed by day number, so a day with two games shows both.
    const byDay = new Map();
    for (const [key, ev] of events) {
      for (const day of occurrencesIn(ev, year, month)) {
        if (!byDay.has(day)) byDay.set(day, []);
        byDay.get(day).push([key, ev]);
      }
    }

    const lead = new Date(year, month, 1).getDay();
    const total = new Date(year, month + 1, 0).getDate();
    for (let i = 0; i < lead; i += 1) {
      const blank = document.createElement('span');
      blank.className = 'calendar__cell is-empty';
      grid.append(blank);
    }

    for (let day = 1; day <= total; day += 1) {
      const cell = document.createElement('div');
      cell.className = 'calendar__cell';
      if (year === today.getFullYear() && month === today.getMonth() && day === today.getDate()) {
        cell.classList.add('is-today');
      }

      const number = document.createElement('span');
      number.className = 'calendar__day';
      number.textContent = String(day);
      cell.append(number);

      for (const [key, ev] of byDay.get(day) || []) {
        const chip = document.createElement('a');
        chip.className = 'calendar__event';
        const carry = new URLSearchParams();
        carry.set('event', key);
        if (src) carry.set('src', src);
        chip.href = `?${carry}`;
        chip.textContent = ev.title || key;

        // The details on hover, and on tap, since a phone has no hover. The
        // popover is inside the link so a tap reveals it and a second tap on
        // the same target follows through.
        const pop = document.createElement('span');
        pop.className = 'calendar__pop';
        const title = document.createElement('strong');
        title.textContent = ev.title || key;
        pop.append(title);
        for (const line of detailLines(ev)) {
          const row = document.createElement('span');
          row.textContent = line;
          pop.append(row);
        }
        const go = document.createElement('span');
        go.className = 'calendar__go';
        go.textContent = 'Open →';
        pop.append(go);
        chip.append(pop);
        chip.setAttribute('aria-label', `${ev.title || key} — ${detailLines(ev).join(', ')}`);

        cell.append(chip);
      }
      grid.append(cell);
    }

    const undated = events.filter(([, ev]) => !ev.starts);
    note.textContent = undated.length
      ? `${undated.length} ${undated.length === 1 ? 'table runs' : 'tables run'} to a recurring schedule with no fixed date, so ${undated.length === 1 ? 'it is' : 'they are'} not on the grid: ${undated.map(([, ev]) => ev.title).join(', ')}.`
      : '';
    note.hidden = !note.textContent;

    if (onMonthRender) onMonthRender();
  }

  document.getElementById('cal-prev').addEventListener('click', () => {
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
    render();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    render();
  });

  return { render, section };
}

/* ---------- Question building ---------- */
// Each event's optional questions are descriptors in data.js. They are built
// into the DOM in full, up front, as ordinary .sec elements — the wizard then
// groups them by data-step exactly as it would hand-written markup, so the
// payload is the same whether or not the step-through ever runs.

let uid = 0;
const nextId = (stem) => `${stem}-${++uid}`;

function labelSpan(text, optional) {
  const span = document.createElement('span');
  span.className = 'field__label';
  span.textContent = text;
  if (optional) span.append(optionalMark());
  return span;
}

function optionalMark() {
  const mark = document.createElement('span');
  mark.className = 'optional';
  mark.textContent = 'OPTIONAL';
  return mark;
}

function buildField(spec) {
  const wrap = document.createElement('div');
  wrap.className = 'field';

  if (spec.type === 'text' || spec.type === 'textarea') {
    const id = nextId(spec.name);
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = spec.label || '';
    if (spec.optional) label.append(optionalMark());
    const input = document.createElement(spec.type === 'textarea' ? 'textarea' : 'input');
    if (spec.type === 'text') input.type = 'text';
    input.id = id;
    input.name = spec.name;
    if (spec.placeholder) input.placeholder = spec.placeholder;
    wrap.append(label, input);
    return wrap;
  }

  if (spec.type === 'chips') {
    const id = nextId(spec.name);
    const label = labelSpan(spec.label || '', spec.optional);
    label.id = id;
    const chips = document.createElement('div');
    chips.className = spec.stack ? 'chips chips--stack' : 'chips';
    chips.role = 'group';
    chips.setAttribute('aria-labelledby', id);
    for (const option of spec.options || []) {
      const chip = document.createElement('label');
      chip.className = 'chip';
      const input = document.createElement('input');
      // `single` gives a radio set — one candidate date, one seat type.
      input.type = spec.single ? 'radio' : 'checkbox';
      input.name = spec.name;
      input.value = option;
      const text = document.createElement('span');
      text.textContent = option;
      chip.append(input, text);
      chips.append(chip);
    }
    wrap.append(label, chips);
    if (spec.writeIn) {
      const other = document.createElement('input');
      other.type = 'text';
      other.className = 'write-in';
      other.name = `${spec.name}-other`;
      other.placeholder = spec.writeIn;
      other.setAttribute('aria-label', `${spec.label || spec.name}, write in`);
      wrap.append(other);
    }
    return wrap;
  }

  if (spec.type === 'tags') {
    const id = nextId(spec.name);
    const label = labelSpan(spec.label || '', spec.optional);
    label.id = id;
    const host = document.createElement('div');
    host.className = 'tagselect';
    host.dataset.name = spec.name;
    if (spec.source) host.dataset.source = spec.source;
    host.dataset.placeholder = spec.placeholder || '';
    host.setAttribute('aria-labelledby', id);
    wrap.append(label, host);
    return wrap;
  }

  if (spec.type === 'switch') {
    const toggle = document.createElement('label');
    toggle.className = 'switch';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = spec.name;
    input.value = spec.value || 'Yes';
    const track = document.createElement('span');
    track.className = 'switch__track';
    track.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span');
    text.className = 'switch__text';
    text.textContent = spec.text || '';
    toggle.append(input, track, text);
    // The switch is its own row; it brings its own spacing.
    return toggle;
  }

  if (spec.type === 'slider') {
    const scale = spec.scale || [];
    const id = nextId(spec.name);
    const textId = `${id}-text`;
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = spec.label || '';
    if (spec.optional) label.append(optionalMark());

    const input = document.createElement('input');
    input.type = 'range';
    input.className = 'slider';
    input.id = id;
    input.name = spec.name;
    input.min = '1';
    input.max = String(Math.max(scale.length, 2));
    input.step = '1';
    input.value = String(spec.value || Math.ceil(Math.max(scale.length, 2) / 2));
    input.setAttribute('aria-describedby', textId);

    const readout = document.createElement('p');
    readout.className = 'slider__text';
    readout.id = textId;
    readout.role = 'status';
    readout.setAttribute('aria-live', 'polite');

    const describe = () => {
      const text = scale[Number(input.value) - 1] || '';
      readout.textContent = text;
      input.setAttribute('aria-valuetext', text);
    };
    input.addEventListener('input', describe);
    describe();

    sliders.push({ name: spec.name, input, scale });
    wrap.append(label, input, readout);
    return wrap;
  }

  // An unknown type is a typo in data.js, not something to render blank.
  console.warn('Unknown question type, skipped:', spec.type, spec.name);
  return null;
}

function buildQuestions(specs, startStep) {
  const mount = document.getElementById('event-steps');
  let step = startStep;

  for (const section of specs || []) {
    const sec = document.createElement('section');
    sec.className = 'sec';
    sec.dataset.step = String(++step);
    sec.dataset.stepTitle = section.title || `Step ${step}`;

    const head = document.createElement('div');
    head.className = 'sec__head';
    const h2 = document.createElement('h2');
    h2.textContent = section.heading || section.title || '';
    // Every event question is optional by definition; page one is the only gate.
    h2.append(optionalMark());
    head.append(h2);
    sec.append(head);

    if (section.lede) {
      const lede = document.createElement('p');
      lede.className = 'lede';
      lede.textContent = section.lede;
      sec.append(lede);
    }

    for (const spec of section.fields || []) {
      const field = buildField(spec);
      if (field) sec.append(field);
    }

    mount.append(sec);
  }
  return step;
}

/* ---------- Tag pickers ---------- */
// Type to filter a seed list, click or Enter to add, and anything typed that is
// not on the list is accepted as-is. Each chosen tag gets its own hidden input
// under the same name, so FormData.getAll picks the whole set up as an array.

function createTagSelect(root) {
  const name = root.dataset.name;
  const options = window[root.dataset.source] || [];
  const chosen = [];

  // With no seed list this is strictly write-in: no menu, and no combobox
  // semantics to promise a popup that will never appear.
  const hasMenu = options.length > 0;

  root.innerHTML = `
    <div class="tagselect__box">
      <span class="tagselect__tags"></span>
      <input type="text" class="tagselect__input" autocomplete="off"
             ${hasMenu ? 'role="combobox" aria-expanded="false" aria-autocomplete="list"' : ''}>
    </div>
    ${hasMenu ? '<ul class="tagselect__menu" role="listbox" hidden></ul>' : ''}
    <span class="tagselect__values"></span>`;

  const tags = root.querySelector('.tagselect__tags');
  const input = root.querySelector('.tagselect__input');
  const menu = root.querySelector('.tagselect__menu');
  const values = root.querySelector('.tagselect__values');
  input.placeholder = root.dataset.placeholder || '';
  const labelledBy = root.getAttribute('aria-labelledby');
  if (labelledBy) input.setAttribute('aria-labelledby', labelledBy);

  let active = -1;

  function render() {
    tags.textContent = '';
    values.textContent = '';
    for (const value of chosen) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      const text = document.createElement('span');
      text.textContent = value;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'tag__x';
      remove.setAttribute('aria-label', `Remove ${value}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => { drop(value); input.focus(); });
      tag.append(text, remove);
      tags.append(tag);

      const hidden = document.createElement('input');
      hidden.type = 'hidden';
      hidden.name = name;
      hidden.value = value;
      values.append(hidden);
    }
  }

  function add(value) {
    let clean = value.trim().slice(0, 80);
    if (!clean) return;
    // Prefer the list's own spelling when the text matches an option.
    const canonical = options.find((o) => o.toLowerCase() === clean.toLowerCase());
    if (canonical) clean = canonical;
    if (!chosen.some((c) => c.toLowerCase() === clean.toLowerCase())) chosen.push(clean);
    input.value = '';
    render();
    // Reopen rather than close: picking one option is usually not the last one,
    // and the input keeps focus, so a plain focus handler would never re-fire.
    if (hasMenu && document.activeElement === input) openMenu();
    else closeMenu();
  }

  function drop(value) {
    const i = chosen.indexOf(value);
    if (i > -1) chosen.splice(i, 1);
    render();
  }

  function matches() {
    const q = input.value.trim().toLowerCase();
    return options
      .filter((o) => !chosen.some((c) => c.toLowerCase() === o.toLowerCase()))
      .filter((o) => !q || o.toLowerCase().includes(q))
      .slice(0, 8);
  }

  function openMenu() {
    if (!hasMenu) return;
    const list = matches();
    menu.textContent = '';
    active = -1;
    if (!list.length) return closeMenu();
    list.forEach((value) => {
      const li = document.createElement('li');
      li.role = 'option';
      li.className = 'tagselect__option';
      li.textContent = value;
      // mousedown, not click: blur would close the menu first.
      li.addEventListener('mousedown', (e) => { e.preventDefault(); add(value); });
      menu.append(li);
    });
    menu.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function closeMenu() {
    if (!hasMenu) return;
    menu.hidden = true;
    active = -1;
    input.setAttribute('aria-expanded', 'false');
    [...menu.children].forEach((li) => li.classList.remove('is-active'));
  }

  function move(step) {
    if (!hasMenu) return;
    const items = [...menu.children];
    if (!items.length) return;
    items.forEach((li) => li.classList.remove('is-active'));
    active = (active + step + items.length) % items.length;
    items[active].classList.add('is-active');
    items[active].scrollIntoView({ block: 'nearest' });
  }

  input.addEventListener('input', openMenu);
  input.addEventListener('focus', openMenu);
  // focus does not re-fire on an already-focused input, so listen for the tap too.
  input.addEventListener('click', openMenu);
  input.addEventListener('blur', () => setTimeout(closeMenu, 120));

  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); menu.hidden ? openMenu() : move(1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
    else if (event.key === 'Enter') {
      event.preventDefault(); // never submit the form from this field
      const items = hasMenu ? [...menu.children] : [];
      add(active > -1 && items[active] ? items[active].textContent : input.value);
    } else if (event.key === 'Escape') { closeMenu(); }
    else if (event.key === 'Backspace' && !input.value && chosen.length) { drop(chosen[chosen.length - 1]); }
  });

  root.querySelector('.tagselect__box').addEventListener('click', () => { input.focus(); openMenu(); });
  render();
}

/* ---------- Seats ---------- */
// A static page cannot count submissions, so the tally is `taken` in data.js,
// bumped by hand as registrations come in. Once it reaches the cap, people can
// still sign up — they are told, here and on the confirmation and in the email,
// that they are joining a waitlist.

function seatState(ev) {
  const cap = ev.seats === null ? null : (ev.seats ?? window.DEFAULT_SEATS ?? null);
  if (!cap) return { cap: null, taken: 0, left: null, full: false };
  const taken = Math.max(0, Number(ev.taken) || 0);
  return { cap, taken, left: Math.max(0, cap - taken), full: taken >= cap };
}

/* ---------- Payload ---------- */

/**
 * Object.fromEntries(new FormData(form)) keeps only the LAST value for a repeated
 * name, which would silently drop all but one chip in every multi-select. Collect
 * with getAll so groups arrive as arrays; the Worker joins them.
 */
function collect() {
  const data = new FormData(form);
  const payload = {};
  for (const key of new Set(data.keys())) {
    const values = data.getAll(key)
      .map((v) => (typeof v === 'string' ? v.trim() : v))
      .filter((v) => v !== '');
    if (!values.length) continue;
    payload[key] = values.length === 1 ? values[0] : values;
  }
  // Copy the registrant in on the confirmation. The Worker reads this flag and
  // drops it from the body; the landing form sends nothing and is unaffected.
  payload.cc = true;
  // A bare "3" in the email means nothing a year from now; send the wording too.
  for (const { name, input, scale } of sliders) {
    payload[name] = `${input.value} — ${scale[Number(input.value) - 1] || ''}`.trim();
  }
  return payload;
}

function say(message, isError) {
  status.textContent = message;
  status.classList.toggle('is-error', Boolean(isError));
}

const looksLikeEmail = (v) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v);

/** The whole form: a name, and an address to confirm to. */
function essentialsAreComplete({ reveal = false } = {}) {
  const error = document.getElementById('essentials-error');
  // Clear first: otherwise a message from the previous attempt stays on screen
  // after the reader has fixed that very thing.
  if (error) { error.hidden = true; error.textContent = ''; }
  const fail = (message, focus) => {
    if (reveal && error) {
      error.hidden = false;
      error.textContent = message;
      (focus || error).scrollIntoView({ behavior: 'smooth', block: 'center' });
      if (focus && focus.focus) focus.focus({ preventScroll: true });
    }
    return false;
  };

  const name = form.querySelector('#name');
  if (!name.value.trim()) return fail('Please tell me what to call you.', name);

  const email = form.querySelector('#email');
  const address = email.value.trim();
  if (!address) return fail('Please give an email address so I can confirm your seat.', email);
  if (!looksLikeEmail(address)) return fail('That email address does not look right.', email);

  if (error) error.hidden = true;
  return true;
}

/* ---------- Submit ---------- */

form.addEventListener('submit', async (submitEvent) => {
  submitEvent.preventDefault();

  if (!essentialsAreComplete({ reveal: true })) return;

  const payload = collect();
  lastSubmission = payload;

  if (!ENDPOINT) {
    console.log('Registration payload (not sent — no endpoint configured):', payload);
    say('Stub: nothing was sent. Payload logged to the console.');
    showConfirmation();
    return;
  }

  const button = sendButton();
  if (button) button.disabled = true;
  say('Sending…');

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${response.status}`);
    }

    showConfirmation();
  } catch (error) {
    if (button) button.disabled = false;
    say(`${error.message} — email jordan@sortilege.online instead.`, true);
  }
});

/* ---------- Confirmation ---------- */
// Replaces the form with what they just booked, the way to pay for it, and the
// Discord invite. A paid table that is not on StartPlaying gets a Stripe Payment
// Link — a plain URL per event, so this static site holds no Stripe key and
// needs no server of its own — with the registration's reference riding along as
// client_reference_id, which is what lets a payment in the dashboard be matched
// back to its registration.

function payUrl(base) {
  try {
    const url = new URL(base);
    if (ref) url.searchParams.set('client_reference_id', ref);
    const email = lastSubmission.email;
    if (typeof email === 'string' && email) url.searchParams.set('prefilled_email', email);
    return url.toString();
  } catch {
    console.warn('Event payment link is not a valid URL:', base);
    return null;
  }
}

function showConfirmation() {
  const done = document.getElementById('done');
  form.hidden = true;
  document.body.classList.remove('is-stepping');
  document.body.classList.add('is-done');
  if (!done) { say('Got it. I will be in touch.'); return; }

  done.hidden = false;
  done.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });

  const seats = seatState(event);
  if (seats.full) {
    done.querySelector('.kicker').textContent = 'WAITLISTED';
    done.querySelector('.done__title').textContent = "You're On The Waitlist";
    document.getElementById('done-lede').textContent =
      `All ${seats.cap} seats were taken when you signed up, so you are next in line. I will write the moment one frees up — and I run these often, so there will be another.`;
  } else {
    document.getElementById('done-lede').textContent =
      'I read every registration myself and reply to confirm your seat — usually within a day. A copy of this is on its way to your inbox.';
  }
  document.getElementById('done-title').textContent = event.title || '';
  fillMeta(document.getElementById('done-meta'), event);
  document.getElementById('ref-shown').textContent = ref;

  const heading = document.getElementById('pay-heading');
  const link = document.getElementById('pay-link');
  const lede = document.getElementById('pay-lede');
  const note = document.getElementById('pay-note');

  // Someone who asked about cost assistance should not be handed a bill.
  const wantsHelp = Boolean(lastSubmission['cost-assistance']);
  // StartPlaying tables never reach this screen — they are handed off before the
  // form — so the only paths left are free, a Stripe link, or neither yet.
  const stripe = event.payment ? payUrl(event.payment) : null;

  if (event.free) {
    heading.textContent = 'Nothing To Pay';
    lede.textContent = 'These nights are free. Turn up a few minutes early, and bring nothing — characters, dice and the rules are all provided.';
    note.textContent = '';
  } else if (wantsHelp) {
    heading.textContent = 'Your Seat';
    lede.textContent = 'You asked about cost assistance, so nothing is due yet — I will write to you about that before anything is payable.';
    note.textContent = '';
  } else if (stripe) {
    heading.textContent = 'Pay For Your Seat';
    lede.textContent = `Your seat is held when payment clears. ${costLine(event)}`.trim();
    link.textContent = 'PAY WITH CARD';
    link.href = stripe;
    link.target = '_blank';
    link.hidden = false;
    note.textContent = 'Opens Stripe in a new tab. Your reference goes with it, so I can match the payment to this registration.';
  } else {
    heading.textContent = 'Your Seat';
    lede.textContent = 'I will send you a payment link when I confirm the seat — nothing to do right now.';
    note.textContent = '';
  }

  offerCalendar(event);

  const discord = document.getElementById('discord-link');
  if (window.DISCORD_INVITE) {
    discord.href = window.DISCORD_INVITE;
    discord.target = '_blank';
  } else {
    discord.hidden = true;
  }
}

/* ---------- Add to calendar ---------- */
// A .ics built in the browser and handed over as a blob — no server, no library.
// Times are FLOATING (no zone, no Z): an in-person night at the Belgian Club is
// 6pm for everyone who can attend it, and floating time is exactly that.

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

/** A wall-clock written in `zone`, as a UTC iCalendar stamp. */
function utcStamp(local, zone) {
  // Read the wall-clock as if it were UTC, then correct it into a real instant.
  const guess = Date.parse(`${local}:00Z`);
  const instant = new Date(guess - zoneOffset(zone, new Date(guess)) * 60000);
  return instant.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

/**
 * The DST rules a recurring zoned event needs spelled out in the file.
 *
 * A UTC DTSTART with an RRULE recurs in UTC: a fortnightly 2pm Winnipeg game
 * would quietly become 1pm for every sitting after the November fall-back. Only
 * a TZID and the zone's own transitions keep the wall-clock hour fixed, and
 * iCalendar has no zone database — the rules travel in the file.
 *
 * Winnipeg has followed the US rules since 2007, so these RRULEs hold without a
 * table of dates. Zones not listed here fall back to a UTC instant, which is
 * exact for a one-off and only wrong across a recurrence.
 */
const VTIMEZONES = {
  'America/Winnipeg': [
    'BEGIN:VTIMEZONE',
    'TZID:America/Winnipeg',
    'BEGIN:DAYLIGHT',
    'TZOFFSETFROM:-0600',
    'TZOFFSETTO:-0500',
    'TZNAME:CDT',
    'DTSTART:20070311T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'END:DAYLIGHT',
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0500',
    'TZOFFSETTO:-0600',
    'TZNAME:CST',
    'DTSTART:20071104T020000',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU',
    'END:STANDARD',
    'END:VTIMEZONE',
  ],
};

const icsEscape = (s) => String(s).replace(/\\/g, '\\\\').replace(/[;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');
const icsStamp = (local) => `${local}`.replace(/[-:]/g, '').replace(/\..*$/, '') + '00';

/** Folds a line to the 75-octet limit iCalendar asks for. */
function icsFold(line) {
  if (line.length <= 73) return line;
  const parts = [line.slice(0, 73)];
  let rest = line.slice(73);
  while (rest.length > 72) { parts.push(' ' + rest.slice(0, 72)); rest = rest.slice(72); }
  if (rest) parts.push(' ' + rest);
  return parts.join('\r\n');
}

function buildIcs(ev, uid) {
  if (!ev.starts) return null;
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  // An event with a `zone` is online: its time must be a real instant, or a
  // player in another city gets the wrong hour. Without one it is in-person and
  // stays floating — 6pm at the Belgian Club is 6pm for everyone who can go.
  // A repeating zoned event carries its zone rules and a TZID, so the hour
  // survives a DST change mid-campaign. Everything else keeps the simpler form.
  const tzid = ev.repeat && ev.zone && VTIMEZONES[ev.zone] ? ev.zone : null;
  const dt = (name, local) => (tzid
    ? `${name};TZID=${tzid}:${icsStamp(local)}`
    : `${name}:${ev.zone ? utcStamp(local, ev.zone) : icsStamp(local)}`);

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sortilege//Registration//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...(tzid ? VTIMEZONES[tzid] : []),
    'BEGIN:VEVENT',
    `UID:${uid}@rsvp.sortilege.online`,
    `DTSTAMP:${now}`,
    dt('DTSTART', ev.starts),
  ];
  if (ev.ends) lines.push(dt('DTEND', ev.ends));
  // e.g. FREQ=WEEKLY;INTERVAL=2 for a fortnightly campaign.
  if (ev.repeat) lines.push(`RRULE:${ev.repeat}`);
  lines.push(`SUMMARY:${icsEscape(ev.title || 'A Sortilege table')}`);
  const where = ev.address || ev.where;
  if (where) lines.push(`LOCATION:${icsEscape(where)}`);
  const description = [ev.pitch, ev.system && `System: ${ev.system}`, `Reference: ${uid}`]
    .filter(Boolean).join('\n');
  if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

function offerCalendar(ev) {
  const link = document.getElementById('calendar-link');
  const text = buildIcs(ev, ref);
  if (!link || !text) return;
  const slug = (eventKey || 'sortilege').replace(/[^a-z0-9-]/gi, '');
  link.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar;charset=utf-8' }));
  link.download = `${slug}.ics`;
  link.hidden = false;
}

/* ---------- Step-through ---------- */
// Progressive enhancement over the built form: every field is in the DOM and
// nothing is hidden until this runs. Steps only control visibility, so the
// payload is identical either way.

function initWizard() {
  const sections = [...form.querySelectorAll('.sec[data-step]')];
  if (!sections.length) return;

  const steps = [];
  for (const section of sections) {
    const n = Number(section.dataset.step);
    let step = steps.find((s) => s.n === n);
    if (!step) steps.push((step = { n, title: section.dataset.stepTitle || `Step ${n}`, sections: [] }));
    step.sections.push(section);
  }

  // An event with no optional questions is one step. That still needs a send
  // control — the wizard builds the only one — so it is set up either way and
  // the numbered progress simply never appears.
  const single = steps.length < 2;

  const submitBar = form.querySelector('.submit-bar');
  const intro = document.getElementById('intro');
  let current = 0;
  let furthest = 0;

  // Progress, above the first step.
  const progress = document.createElement('div');
  progress.className = 'wizard__progress';
  progress.innerHTML = `
    <div class="wizard__dots"></div>
    <div class="wizard__meta">
      <span class="wizard__title"></span>
      <span class="wizard__count"></span>
    </div>
    <div class="wizard__bar"><span></span></div>`;
  form.prepend(progress);

  const dots = progress.querySelector('.wizard__dots');
  steps.forEach((step, i) => {
    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'wizard__dot';
    dot.textContent = String(i + 1);
    dot.setAttribute('aria-label', `Step ${i + 1}: ${step.title}`);
    // Jumping back to somewhere already visited is safe; jumping ahead is not.
    dot.addEventListener('click', () => { if (i <= furthest) go(i); });
    dots.append(dot);
  });

  // Back / Next, below the current step.
  const nav = document.createElement('div');
  nav.className = 'wizard__nav';
  nav.innerHTML = `
    <div class="wizard__row">
      <button type="button" class="wizard__btn wizard__btn--back">&#8592; Back</button>
      <button type="button" class="wizard__btn wizard__btn--next">Next &#8594;</button>
    </div>
    <button type="button" class="wizard__skip">Skip the rest and send</button>`;
  nav.querySelector('.wizard__btn--next').textContent = 'Next →';
  submitBar.before(nav);
  const back = nav.querySelector('.wizard__btn--back');
  const next = nav.querySelector('.wizard__btn--next');
  const skip = nav.querySelector('.wizard__skip');

  function validate(index) {
    const needs = steps[index].sections.some((s) => s.dataset.validate === 'essentials');
    return needs ? essentialsAreComplete({ reveal: true }) : true;
  }

  function go(index, { push = true } = {}) {
    current = Math.max(0, Math.min(index, steps.length - 1));
    furthest = Math.max(furthest, current);

    sections.forEach((s) => { s.hidden = Number(s.dataset.step) !== steps[current].n; });

    const last = current === steps.length - 1;
    const first = current === 0;
    // Page one can be submitted as-is; everything past it is optional, so the
    // submit bar shows on the first step and the last, and the Next button
    // says what continuing actually costs you.
    submitBar.hidden = false;
    next.hidden = last;
    next.textContent = first ? 'Continue to optional questions →' : 'Next →';
    // The one send control. On the last step there is no "rest" left to skip,
    // so it simply sends.
    skip.hidden = false;
    skip.textContent = last ? 'Send' : 'Skip the rest and send';
    skip.classList.toggle('is-primary', last);

    // Page one should not look like the front of a seven-step form, so the
    // numbered progress only appears once someone opts into the optional part.
    progress.hidden = first;
    intro.hidden = !first;
    back.hidden = first;
    back.disabled = first;
    nav.classList.toggle('is-single', first);

    progress.querySelector('.wizard__title').textContent = steps[current].title;
    progress.querySelector('.wizard__count').textContent = `Step ${current + 1} of ${steps.length}`;
    progress.querySelector('.wizard__bar span').style.width = `${((current + 1) / steps.length) * 100}%`;
    [...dots.children].forEach((dot, i) => {
      dot.classList.toggle('is-current', i === current);
      dot.classList.toggle('is-done', i < furthest || (i === furthest && i < current));
      dot.classList.toggle('is-reachable', i <= furthest);
      dot.setAttribute('aria-current', i === current ? 'step' : 'false');
    });

    // The hero is a welcome, not a header — it should not reappear above every
    // question and push the actual step off-screen.
    document.body.classList.toggle('is-stepping', current > 0);
    // The footer is worth showing where someone might want to leave or contact
    // Jordan directly — the opening and the end — but not between questions.
    document.body.classList.toggle('is-final-step', last);

    if (push && history.state?.step !== current) {
      history.pushState({ step: current }, '', location.pathname + location.search);
    }
    // Land on the question, not back up at the hero art. The progress bar is
    // hidden on the first step, so anchor to the form there instead.
    const anchor = progress.hidden ? form : progress;
    const top = anchor.getBoundingClientRect().top + scrollY - 12;
    scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }

  next.addEventListener('click', () => { if (validate(current)) go(current + 1); });
  back.addEventListener('click', () => go(current - 1));
  skip.addEventListener('click', () => form.requestSubmit());

  // Android/browser back should step backwards, not leave the page.
  addEventListener('popstate', (popped) => {
    if (typeof popped.state?.step === 'number') go(popped.state.step, { push: false });
  });

  // Enter anywhere but a textarea advances instead of submitting early.
  form.addEventListener('keydown', (keyed) => {
    if (keyed.key !== 'Enter') return;
    if (keyed.target.matches('textarea, .tagselect__input')) return;
    keyed.preventDefault();
    if (current < steps.length - 1) {
      if (validate(current)) go(current + 1);
    } else {
      form.requestSubmit();
    }
  });

  history.replaceState({ step: 0 }, '', location.pathname + location.search);
  go(0, { push: false });
  form.classList.add('is-wizard');
  if (single) {
    // Nothing to step through: the send button is the whole navigation.
    progress.hidden = true;
    next.hidden = true;
    nav.querySelector('.wizard__row').hidden = true;
    skip.textContent = 'Send';
    skip.classList.add('is-primary');
  }
}

/* ---------- Start ---------- */

/* ---------- Already played ---------- */
// The QR on a table tent outlives the night it advertised. Rather than a
// generic "no such table", the link lands on what it was and what is on now.

function showPast() {
  document.getElementById('past-event').textContent = event.title || eventKey;
  fillMeta(document.getElementById('past-meta'), event);
  document.getElementById('past-lede').textContent = event.when
    ? `This one played on ${event.when}. I run these often — here is what is open now.`
    : 'This one has finished. I run these often — here is what is open now.';
  document.getElementById('past-browse').href = src ? `?src=${encodeURIComponent(src)}` : '?';
  document.getElementById('past').hidden = false;
  document.body.classList.add('is-handoff');
}

/* ---------- Cancelled ---------- */
// A called-off table is not a played one. Saying "this one has run" to someone
// standing in front of the poster it was printed on would be a plain lie, and
// they are the likeliest reader of this page.

function showCancelled() {
  document.getElementById('cancelled-event').textContent = event.title || eventKey;
  fillMeta(document.getElementById('cancelled-meta'), event);
  document.getElementById('cancelled-lede').textContent = event.when
    ? `This one was called off and will not run on ${event.when}. I run these often — here is what is open now.`
    : 'This one was called off and will not run. I run these often — here is what is open now.';
  document.getElementById('cancelled-browse').href = src ? `?src=${encodeURIComponent(src)}` : '?';
  document.getElementById('cancelled').hidden = false;
  document.body.classList.add('is-handoff');
}

/* ---------- Handoff ---------- */
// A StartPlaying table is sold and scheduled there, so asking for a name and an
// email here would collect something nobody acts on and put a second, pointless
// step in front of the listing. Show what it is and send them over.

function showHandoff() {
  const handoff = document.getElementById('handoff');
  document.getElementById('handoff-event').textContent = event.title || eventKey;
  fillMeta(document.getElementById('handoff-meta'), event);
  document.getElementById('handoff-link').href = event.startplaying;
  document.getElementById('handoff-swap').href = src ? `?src=${encodeURIComponent(src)}` : '?';
  handoff.hidden = false;
  document.body.classList.add('is-handoff');
}

/* ---------- Start ---------- */

function fillHero() {
  document.getElementById('hero-title').textContent = event.title || 'Take Your Seat';
  const system = document.getElementById('hero-system');
  if (event.system) { system.textContent = event.system; system.hidden = false; }
  document.getElementById('hero-pitch').textContent = event.pitch || '';
  const heroArt = document.getElementById('hero-art');
  if (event.art) {
    // Fall back to the house line art rather than showing a broken image if the
    // event's cover has not been added to assets/art yet.
    const fallback = heroArt.src;
    heroArt.addEventListener('error', () => {
      console.warn('Event art missing, using the house line art:', event.art);
      document.querySelector('.hero__art').classList.add('is-house');
      heroArt.src = fallback;
    }, { once: true });
    heroArt.src = event.art;
  }
  // The house art is the only thing that should multiply onto the coral; an
  // event with its own art renders it as supplied.
  document.querySelector('.hero__art').classList.toggle('is-house', !event.art);
}

if (!event) {
  showChooser();
} else if (event.cancelled) {
  // Ahead of `past`: a table called off before its date would otherwise still
  // read as upcoming, and one called off after its date would claim it ran.
  fillHero();
  showCancelled();
} else if (isPast(event)) {
  // Checked before the rest: a table that has played neither takes
  // registrations nor sends anyone to a listing that has closed.
  fillHero();
  showPast();
} else if (event.startplaying) {
  fillHero();
  showHandoff();
} else {
  fillHero();

  document.getElementById('booking-title').textContent = event.title || '';
  fillMeta(document.getElementById('booking-meta'), event);
  document.getElementById('booking-swap').href = src ? `?src=${encodeURIComponent(src)}` : '?';

  document.getElementById('event-field').value = event.title || eventKey;
  document.getElementById('system-field').value = event.system || '';
  document.getElementById('ref-field').value = ref;
  // The Worker puts this in the subject line, so registrations are separable
  // from the landing form's seat requests at a glance in the inbox.
  document.getElementById('kind-field').value = `Registration — ${event.title || eventKey}`;

  // Seats, and whether this registration is joining a waitlist.
  const seats = seatState(event);
  const seatsNote = document.getElementById('booking-seats');
  if (seats.cap) {
    seatsNote.hidden = false;
    seatsNote.textContent = seats.full
      ? `All ${seats.cap} seats are taken — sign up anyway and you go on the waitlist.`
      : `${seats.left} of ${seats.cap} seats left.`;
    seatsNote.classList.toggle('is-full', seats.full);
  }
  if (seats.full) {
    document.getElementById('waitlist-field').value = 'Yes — seats were full';
    document.getElementById('kind-field').value = `Waitlist — ${event.title || eventKey}`;
  }

  buildQuestions(event.questions, 1);
  document.querySelectorAll('.tagselect').forEach(createTagSelect);

  form.hidden = false;
  initWizard();
}
