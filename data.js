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

// Every table seats this many unless its own entry says otherwise.
window.DEFAULT_SEATS = 6;

window.EVENTS = {
  sjorseidr: {
    title: 'Sjórseiðr: A Sea-Faring Covenant',
    system: 'Ars Magica 5th Edition',
    art: 'assets/art/game-sjorseidr.jpg',
    pitch: 'A group of mages have established an independent floating covenant in the North Atlantic, operating from their ships while investigating the mysterious disappearance of their founding magus.',
    status: 'One seat left',
    when: 'Bi-weekly, Sundays',
    length: '3–4 hours',
    where: 'Online (Foundry VTT + Discord)',
    price: '$32 / session',

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
    system: 'City of Winter',
    art: 'assets/art/game-winter-city.jpg',
    // The hero art is multiplied onto the coral panel, which is the right
    // treatment for black line work and the wrong one for a photograph. Set
    // plainArt to render this one as-is; delete it to go back to the blend.
    plainArt: true,
    pitch: 'A story-driven exploration game where characters navigate the difficult journey to a new home while deciding which traditions to carry forward from their abandoned homeland.',
    status: 'Not yet started',
    when: 'Bi-weekly, Wednesdays',
    length: '3 hours',
    where: 'Online (Discord)',
    price: '$35 / session',
    startplaying: 'https://startplaying.games/adventure/cmsukcr0l00lplf04l20padwp',
    payment: null,
    seats: null,
    questions: [],
  },

  'troika-well': {
    title: "So You've Been Thrown Down a Well",
    system: 'Troika!',
    art: 'assets/art/game-troika-well.jpg',
    pitch: 'After falling down a strange well, players explore a surreal dungeon in search of escape and redemption.',
    status: 'One-shot · Not yet scheduled',
    when: 'Date to be arranged',
    length: '3 hours',
    where: 'Online (Discord)',
    price: '$35 / session',
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
    title: 'Root: Hacksaw Dell',
    system: 'Root: The Roleplaying Game',
    art: 'assets/art/event-root-hacksaw-dell.jpg',
    plainArt: true,
    pitch: 'A beginner-friendly, free one-shot of the Root RPG.',
    when: 'Tuesday 22 September · 6:00–9:00 PM',
    length: '3 hours',
    where: 'Belgian Club, 407 Provencher Blvd, Winnipeg',
    free: true,
    // Local wall-clock, no zone: the .ics carries floating time, which is what
    // you want for an in-person event where everyone is in the same city.
    starts: '2026-09-22T18:00',
    ends: '2026-09-22T21:00',
    // How many of the seats are spoken for. Bump this as registrations come in;
    // once it reaches `seats` (or DEFAULT_SEATS) the form says so and anyone
    // else who signs up is told they are on the waitlist.
    taken: 0,
    questions: [],
  },

  'l5r-kyotei-castle': {
    title: 'Legend of the Five Rings: Wedding at Kyotei Castle',
    system: 'Legend of the Five Rings (Edge Studio)',
    art: 'assets/art/event-l5r-kyotei-castle.jpg',
    plainArt: true,
    pitch: 'A beginner-friendly, free introduction to the Fantasy Flight/EDGE Studios edition of the Legend of the Five Rings RPG.',
    when: 'Tuesday 29 September · 6:00–9:00 PM',
    length: '3 hours',
    where: 'Belgian Club, 407 Provencher Blvd, Winnipeg',
    free: true,
    // Local wall-clock, no zone: the .ics carries floating time, which is what
    // you want for an in-person event where everyone is in the same city.
    starts: '2026-09-29T18:00',
    ends: '2026-09-29T21:00',
    // How many of the seats are spoken for. Bump this as registrations come in;
    // once it reaches `seats` (or DEFAULT_SEATS) the form says so and anyone
    // else who signs up is told they are on the waitlist.
    taken: 0,
    questions: [],
  },

  'arkham-big-easy': {
    title: 'Arkham Horror: Three Days to the Big Easy',
    system: 'Arkham Horror: The Roleplaying Game',
    art: 'assets/art/event-arkham-big-easy.jpg',
    plainArt: true,
    pitch: 'A beginner-friendly, free introduction to the Arkham Horror RPG.',
    when: 'Tuesday 6 October · 6:00–9:00 PM',
    length: '3 hours',
    where: 'Belgian Club, 407 Provencher Blvd, Winnipeg',
    free: true,
    // Local wall-clock, no zone: the .ics carries floating time, which is what
    // you want for an in-person event where everyone is in the same city.
    starts: '2026-10-06T18:00',
    ends: '2026-10-06T21:00',
    // How many of the seats are spoken for. Bump this as registrations come in;
    // once it reaches `seats` (or DEFAULT_SEATS) the form says so and anyone
    // else who signs up is told they are on the waitlist.
    taken: 0,
    questions: [],
  },
};

// Order of the chooser shown when no ?event= key is given. Keys not listed are
// appended in the order they appear above.
window.EVENT_ORDER = [
  'root-hacksaw-dell', 'l5r-kyotei-castle', 'arkham-big-easy',
  'sjorseidr', 'winter-city', 'troika-well',
];

window.DISCORD_INVITE = 'https://discord.gg/KNcPMrQuSW';
