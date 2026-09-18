// Registration data: the events people can sign up for, and the questions each
// one asks.
//
// This file is the whole content layer. Adding an event is an entry here and a
// push — no markup, no code. The page is reached as
//   https://rsvp.sortilege.online/?event=<key>
// so the key is what goes in the printed QR. An unknown or missing key shows a
// chooser listing everything below instead of erroring.
//
// Details for the three seed events were taken from the StartPlaying listings on
// 2026-08-21 (carried over from the landing repo's data.js); schedules and prices
// drift, so re-check them against the listings periodically.

// The filter bar above the chooser. Each event declares one value per key; a
// button only appears when at least one event actually carries its value, so
// Minneapolis shows up the moment there is a Minneapolis table and never sits
// there as a control that returns nothing.
//
// Within a group the picks are OR'd, across groups they are AND'd, and a group
// with nothing picked does not constrain. The choice is mirrored into the URL,
// so a filtered view is a link you can print a QR for.
window.FILTERS = [
  {
    key: 'run', label: 'STATUS',
    options: [['ongoing', 'Ongoing'], ['not-started', 'Not started']],
  },
  {
    key: 'shape', label: 'LENGTH',
    options: [['one-shot', 'One-shot'], ['multi-session', 'Multi-session']],
  },
  {
    key: 'place', label: 'WHERE',
    options: [
      ['online', 'Online'],
      ['winnipeg', 'WPG'],
      ['minneapolis', 'MPLS'],
    ],
  },
];

// Every table seats this many unless its own entry says otherwise.
window.DEFAULT_SEATS = 6;

window.EVENTS = {
  sjorseidr: {
    title: 'Sjórseiðr: A Sea-Faring Covenant',
    run: 'ongoing',
    shape: 'multi-session',
    place: 'online',
    system: 'Ars Magica 5th Edition',
    art: 'assets/art/game-sjorseidr.jpg',
    pitch: 'A group of mages have established an independent floating covenant in the North Atlantic, operating from their ships while investigating the mysterious disappearance of their founding magus.',
    status: 'One seat left',
    when: 'Bi-weekly, Sundays',
    length: '3–4 hours',
    where: 'Online',
    price: { amount: '32 USD', per: 'session' },

    // HOW THE SEAT GETS PAID FOR. Exactly one of these two, or neither:
    //
    //   startplaying — the listing URL, for anything sold through
    //     StartPlaying.games. Booking and payment both happen there, so the
    //     confirmation hands them straight over and no Stripe link applies.
    //   payment — a Stripe Payment Link, for events NOT on StartPlaying. A
    //     Payment Link is a plain URL, so this site needs no server and holds
    //     no Stripe key of any kind. The registration's reference and email
    //     ride along in the query string, which is what lets a payment in the
    //     Stripe dashboard be matched back to its registration.
    //
    // Neither set is fine: the confirmation then says a link is coming.
    startplaying: 'https://startplaying.games/adventure/cm2lsx0ok00325goj0sybhg5q',
    payment: null,
    // Seats for a StartPlaying table are counted on the listing, not here.
    seats: null,

    questions: [],
  },

  'winter-city': {
    title: 'Journey to the Winter City',
    run: 'not-started',
    shape: 'multi-session',
    place: 'online',
    system: 'City of Winter',
    art: 'assets/art/game-winter-city.jpg',
    pitch: 'A story-driven exploration game where characters navigate the difficult journey to a new home while deciding which traditions to carry forward from their abandoned homeland.',
    status: 'Not yet started',
    when: 'Bi-weekly, Wednesdays',
    length: '3 hours',
    where: 'Online',
    price: { amount: '35 USD', per: 'session' },
    startplaying: 'https://startplaying.games/adventure/cmsukcr0l00lplf04l20padwp',
    payment: null,
    seats: null,
    questions: [],
  },

  'troika-well': {
    title: "So You've Been Thrown Down a Well",
    run: 'not-started',
    shape: 'one-shot',
    place: 'online',
    system: 'Troika!',
    art: 'assets/art/game-troika-well.jpg',
    pitch: 'After falling down a strange well, players explore a surreal dungeon in search of escape and redemption.',
    status: 'One-shot',
    when: 'Friday 2 October',
    hours: '4:00–7:00 PM (Winnipeg)',
    length: '3 hours',
    where: 'Online',
    // Online, so the .ics needs a real instant rather than floating local time:
    // `zone` is the zone the wall-clock above is written in, and the builder
    // converts to UTC so a player in another city gets the right hour.
    starts: '2026-10-02T16:00',
    ends: '2026-10-02T19:00',
    zone: 'America/Winnipeg',
    price: { amount: '35 USD', per: 'session' },
    startplaying: 'https://startplaying.games/adventure/cmsuncli60006l404ybpsvxxn',
    payment: null,
    seats: null,
    questions: [],
  },

  // ---- Free in-person one-shots at the Belgian Club -------------------------
  // Beginner-friendly introductions, no charge. These carry neither a
  // StartPlaying listing nor a Stripe link: `free` is what tells the
  // confirmation to say there is nothing to pay rather than promising an
  // invoice. Blurbs are the event listings' own wording, verbatim.

  'root-hacksaw-dell': {
    title: 'Hacksaw Dell',
    run: 'not-started',
    shape: 'one-shot',
    place: 'winnipeg',
    system: 'Root: The Roleplaying Game',
    art: 'assets/art/event-root-hacksaw-dell.jpg',
    pitch: 'A beginner-friendly, free one-shot of the Root RPG.',
    when: 'Tuesday 22 September',
    hours: '6:00–9:00 PM',
    length: '3 hours',
    where: 'Belgian Club',
    whereUrl: 'https://www.google.com/maps/search/?api=1&query=Belgian+Club%2C+407+Provencher+Blvd%2C+Winnipeg',
    // The page shows `where` and links it to the map; a calendar entry wants the
    // street, since that is what a phone navigates from.
    address: 'Belgian Club, 407 Provencher Blvd, Winnipeg',
    free: true,
    // Local wall-clock with no `zone`: the .ics carries floating time, which is
    // what you want for an in-person event where everyone is in the same city.
    starts: '2026-09-22T18:00',
    ends: '2026-09-22T21:00',
    // How many of the seats are spoken for. Bump this as registrations come in;
    // once it reaches `seats` (or DEFAULT_SEATS) the form says so and anyone
    // else who signs up is told they are on the waitlist.
    taken: 0,
    questions: [],
  },

  'l5r-kyotei-castle': {
    title: 'Wedding at Kyotei Castle',
    run: 'not-started',
    shape: 'one-shot',
    place: 'winnipeg',
    system: 'Legend of the Five Rings (Edge Studio)',
    art: 'assets/art/event-l5r-kyotei-castle.jpg',
    pitch: 'A beginner-friendly, free introduction to the Fantasy Flight/EDGE Studios edition of the Legend of the Five Rings RPG.',
    when: 'Tuesday 29 September',
    hours: '6:00–9:00 PM',
    length: '3 hours',
    where: 'Belgian Club',
    whereUrl: 'https://www.google.com/maps/search/?api=1&query=Belgian+Club%2C+407+Provencher+Blvd%2C+Winnipeg',
    // The page shows `where` and links it to the map; a calendar entry wants the
    // street, since that is what a phone navigates from.
    address: 'Belgian Club, 407 Provencher Blvd, Winnipeg',
    free: true,
    // Local wall-clock with no `zone`: the .ics carries floating time, which is
    // what you want for an in-person event where everyone is in the same city.
    starts: '2026-09-29T18:00',
    ends: '2026-09-29T21:00',
    // How many of the seats are spoken for. Bump this as registrations come in;
    // once it reaches `seats` (or DEFAULT_SEATS) the form says so and anyone
    // else who signs up is told they are on the waitlist.
    taken: 0,
    questions: [],
  },

  'arkham-big-easy': {
    title: 'Three Days to the Big Easy',
    run: 'not-started',
    shape: 'one-shot',
    place: 'winnipeg',
    system: 'Arkham Horror: The Roleplaying Game',
    art: 'assets/art/event-arkham-big-easy.jpg',
    pitch: 'A beginner-friendly, free introduction to the Arkham Horror RPG.',
    when: 'Tuesday 6 October',
    hours: '6:00–9:00 PM',
    length: '3 hours',
    where: 'Belgian Club',
    whereUrl: 'https://www.google.com/maps/search/?api=1&query=Belgian+Club%2C+407+Provencher+Blvd%2C+Winnipeg',
    // The page shows `where` and links it to the map; a calendar entry wants the
    // street, since that is what a phone navigates from.
    address: 'Belgian Club, 407 Provencher Blvd, Winnipeg',
    free: true,
    // Local wall-clock with no `zone`: the .ics carries floating time, which is
    // what you want for an in-person event where everyone is in the same city.
    starts: '2026-10-06T18:00',
    ends: '2026-10-06T21:00',
    // How many of the seats are spoken for. Bump this as registrations come in;
    // once it reaches `seats` (or DEFAULT_SEATS) the form says so and anyone
    // else who signs up is told they are on the waitlist.
    taken: 0,
    questions: [],
  },
  // ---- Paid campaigns at the Belgian Club ---------------------------------

  'terra-antarctica': {
    title: 'Terra Antarctica',
    system: 'Arkham Horror: The Roleplaying Game',
    art: 'assets/art/event-terra-antarctica.jpg',
    run: 'not-started',
    shape: 'multi-session',
    place: 'winnipeg',
    when: 'Bi-weekly Tuesdays from 1 December',
    hours: '6:00–9:00 PM',
    length: '3 hours',
    where: 'Belgian Club',
    whereUrl: 'https://www.google.com/maps/search/?api=1&query=Belgian+Club%2C+407+Provencher+Blvd%2C+Winnipeg',
    address: 'Belgian Club, 407 Provencher Blvd, Winnipeg',
    price: { amount: '35 CAD', per: 'session, billed every 2 weeks' },
    // First session; `repeat` makes the .ics cover the whole campaign and keeps
    // isPast() from retiring it once session one has been played.
    starts: '2026-12-01T18:00',
    ends: '2026-12-01T21:00',
    repeat: 'FREQ=WEEKLY;INTERVAL=2',
    // Stripe product prod_VHeQF88UAMW2gX, price price_1UH57SPvhIvMp2JYGAaSxJCR
    // (CA$35.00 every 2 weeks, LIVE). No Payment Link exists yet, deliberately:
    // a link is payable the moment it is created, and billing starts when
    // someone pays, not on 1 December. Create the link in late November with
    //   ./scripts/stripe-event.sh --price price_1UH57SPvhIvMp2JYGAaSxJCR --live
    // and add its URL here as `payment`. Until then the confirmation correctly
    // says a payment link is coming.
    taken: 0,
    questions: [],
  },
  // ---- TEETH one-shots, online, sold on StartPlaying ----------------------
  // Details taken from the StartPlaying listings on 2026-09-18; the listing is
  // the source of truth for seats and scheduling, which is why `seats` is null
  // here. Pitches are the listings' own wording.

  'hogmen': {
    title: 'Night of the Hogmen',
    system: 'TEETH',
    // TEETH house ornament, a pointing hand — "the Hogmen are abroad".
    art: 'assets/art/event-hogmen.jpg',
    // An ornament, not a cover: show it whole, on its own white.
    fit: 'contain',
    pitch: '“Hogmen!” screams the coachman, fumbling to load a flintlock pistol. “The Hogmen are abroad!” Eighteenth-century England has gone wrong.',
    run: 'not-started',
    shape: 'one-shot',
    place: 'online',
    status: 'One-shot · 18+',
    when: 'Thursday 8 October',
    hours: '7:00 PM CDT',
    length: '3–4 hours',
    where: 'Online',
    price: { amount: '35 USD', per: 'session' },
    startplaying: 'https://startplaying.games/adventure/cmu77i6f10073l704zhphx9ul',
    seats: null,
    starts: '2026-10-08T19:00',
    ends: '2026-10-08T23:00',
    zone: 'America/Winnipeg',
    questions: [],
  },

  'stranger-and-stranger': {
    title: 'Stranger & Stranger',
    system: 'TEETH',
    // TEETH house ornament, a tricorn and a blade — "bring a musket".
    art: 'assets/art/event-stranger-and-stranger.jpg',
    // An ornament, not a cover: show it whole, on its own white.
    fit: 'contain',
    pitch: 'Eighteenth-century England has gone wrong. Bring a musket, a strong stomach, and pray you keep the shape you arrived in.',
    run: 'not-started',
    shape: 'one-shot',
    place: 'online',
    status: 'One-shot · 18+',
    when: 'Thursday 15 October',
    hours: '7:00 PM CDT',
    length: '3–4 hours',
    where: 'Online',
    price: { amount: '35 USD', per: 'session' },
    startplaying: 'https://startplaying.games/adventure/cmu77j11r00a2i704rkqo29fq',
    seats: null,
    starts: '2026-10-15T19:00',
    ends: '2026-10-15T23:00',
    zone: 'America/Winnipeg',
    questions: [],
  },

  'blood-cotillion': {
    title: 'Blood Cotillion',
    system: 'TEETH',
    // TEETH house ornament, apple and serpents — temptation at the ball.
    art: 'assets/art/event-blood-cotillion.jpg',
    // An ornament, not a cover: show it whole, on its own white.
    fit: 'contain',
    pitch: 'Eighteenth-century England has gone wrong. Blood-horror Bridgerton.',
    run: 'not-started',
    shape: 'one-shot',
    place: 'online',
    status: 'One-shot · 18+',
    when: 'Thursday 22 October',
    hours: '7:00 PM CDT',
    length: '3–4 hours',
    where: 'Online',
    price: { amount: '35 USD', per: 'session' },
    startplaying: 'https://startplaying.games/adventure/cmu77jojn000wl5043ztuh5of',
    seats: null,
    starts: '2026-10-22T19:00',
    ends: '2026-10-22T23:00',
    zone: 'America/Winnipeg',
    questions: [],
  },
};

// Order of the chooser shown when no ?event= key is given. Keys not listed are
// appended in the order they appear above.
window.EVENT_ORDER = [
  'root-hacksaw-dell', 'l5r-kyotei-castle', 'arkham-big-easy', 'terra-antarctica',
  'sjorseidr', 'winter-city', 'troika-well',
  'hogmen', 'stranger-and-stranger', 'blood-cotillion',
];

window.DISCORD_INVITE = 'https://discord.gg/KNcPMrQuSW';
