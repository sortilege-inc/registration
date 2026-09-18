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

/** The [term, value] rows shown in a booking summary. Blank entries drop out. */
function bookingRows(ev) {
  return [['System', ev.system], ['When', ev.when], ['Length', ev.length],
          ['Where', ev.where], ['Cost', ev.free ? 'Free' : ev.price], ['Status', ev.status]]
    .filter(([, value]) => value);
}

function fillMeta(dl, ev) {
  dl.textContent = '';
  for (const [term, value] of bookingRows(ev)) {
    const dt = document.createElement('dt');
    dt.textContent = term;
    const dd = document.createElement('dd');
    dd.textContent = value;
    dl.append(dt, dd);
  }
}

/* ---------- Chooser ---------- */
// No key, or a key we do not recognise: a filter bar and a grid of tiles.
//
// Filtering is faceted: OR within a group, AND across groups, and a group with
// nothing picked does not constrain. The state lives in the URL so a filtered
// view can be linked or turned into its own QR.

/** Events in chooser order, deduplicated. */
function orderedEvents() {
  const order = [...(window.EVENT_ORDER || []), ...Object.keys(events)];
  const seen = new Set();
  const out = [];
  for (const key of order) {
    if (seen.has(key) || !events[key]) continue;
    seen.add(key);
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
  const count = document.getElementById('filters-count');
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
    const query = next.toString();
    history.replaceState(history.state, '', query ? `?${query}` : location.pathname);
  }

  // ---- filter bar ----
  for (const group of groups) {
    const row = document.createElement('div');
    row.className = 'filters__row';

    const label = document.createElement('span');
    label.className = 'filters__label';
    label.id = `filter-${group.key}`;
    label.textContent = group.label;

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
        render();
      });
      const span = document.createElement('span');
      span.textContent = text;
      chip.append(input, span);
      chips.append(chip);
    }

    row.append(label, chips);
    bar.append(row);
  }

  document.getElementById('filters-clear').addEventListener('click', () => {
    picked.clear();
    bar.querySelectorAll('input[type="checkbox"]').forEach((i) => { i.checked = false; });
    syncUrl();
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
    } else {
      frame.classList.add('is-fallback');
      const img = document.createElement('img');
      img.alt = '';
      img.src = 'assets/art/the-filth.png';
      frame.append(img);
    }

    // One badge, top-left of the art: the thing worth knowing at a glance. Being
    // full outranks being free — a free table nobody can join is not a free
    // table, and hiding that behind "Free" is the wrong way round.
    const seats = seatState(ev);
    const badge = seats.full ? 'Waitlist'
      : ev.free ? 'Free'
      : seats.cap ? `${seats.left} seats`
      : '';
    if (badge) {
      const flag = document.createElement('span');
      flag.className = `tarot__badge${seats.full ? ' is-full' : ''}`;
      flag.textContent = badge;
      frame.append(flag);
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
    body.append(make('tarot__where', [ev.where, ev.free ? null : ev.price].filter(Boolean).join(' · ')));
    a.append(body);

    return a;
  }

  function render() {
    const shown = all.filter(([, ev]) => matches(ev));
    list.textContent = '';
    for (const [key, ev] of shown) list.append(tile(key, ev));

    empty.hidden = shown.length > 0;
    count.textContent = shown.length === all.length
      ? `${all.length} tables`
      : `${shown.length} of ${all.length} tables`;
  }

  render();

  if (eventKey) {
    document.getElementById('chooser-lede').textContent =
      'That link did not match a table I have open. Pick the game you are signing up for.';
  }
  chooser.hidden = false;
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
// Discord invite. How they pay depends on where the event is sold: a table
// listed on StartPlaying is booked and paid for there, and everything else gets
// a Stripe Payment Link — a plain URL per event, so this static site holds no
// Stripe key and needs no server of its own. On the Stripe path the
// registration's reference rides along as client_reference_id, which is what
// lets a payment in the dashboard be matched back to its registration.

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

  // Someone who asked about cost assistance should not be handed a bill first.
  const wantsHelp = Boolean(lastSubmission['cost-assistance']);
  // A table listed on StartPlaying is booked and paid for there; Stripe is for
  // the ones that are not listed. An event should carry one or the other.
  const listing = typeof event.startplaying === 'string' ? event.startplaying : '';
  const stripe = !listing && event.payment ? payUrl(event.payment) : null;
  if (listing && event.payment) {
    console.warn('Event has both a StartPlaying listing and a Stripe link; using the listing.');
  }

  const show = (label, href) => {
    link.textContent = label;
    link.href = href;
    link.target = '_blank';
    link.hidden = false;
  };

  if (event.free) {
    heading.textContent = 'Nothing To Pay';
    lede.textContent = 'These nights are free. Turn up a few minutes early, and bring nothing — characters, dice and the rules are all provided.';
    note.textContent = '';
  } else if (wantsHelp) {
    heading.textContent = 'Your Seat';
    lede.textContent = 'You asked about cost assistance, so nothing is due yet — I will write to you about that before anything is payable.';
    note.textContent = '';
  } else if (listing) {
    heading.textContent = 'Book Your Seat';
    lede.textContent = `This table books through StartPlaying — claim the seat there and you are set. ${event.price || ''}`.trim();
    show('BOOK ON STARTPLAYING →', listing);
    note.textContent = 'Opens StartPlaying in a new tab.';
  } else if (stripe) {
    heading.textContent = 'Pay For Your Seat';
    lede.textContent = `Your seat is held when payment clears. ${event.price || ''}`.trim();
    show('PAY WITH CARD', stripe);
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
  const stamp = (local) => (ev.zone ? utcStamp(local, ev.zone) : icsStamp(local));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sortilege//Registration//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}@rsvp.sortilege.online`,
    `DTSTAMP:${now}`,
    `DTSTART:${stamp(ev.starts)}`,
  ];
  if (ev.ends) lines.push(`DTEND:${stamp(ev.ends)}`);
  lines.push(`SUMMARY:${icsEscape(ev.title || 'A Sortilege table')}`);
  if (ev.where) lines.push(`LOCATION:${icsEscape(ev.where)}`);
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

if (!event) {
  showChooser();
} else {
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
      document.querySelector('.hero__art').classList.remove('is-plain');
      heroArt.src = fallback;
    }, { once: true });
    heroArt.src = event.art;
  }
  document.querySelector('.hero__art').classList.toggle('is-plain', Boolean(event.plainArt));

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
