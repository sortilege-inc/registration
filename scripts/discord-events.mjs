#!/usr/bin/env node
// Publish the site's games as Discord scheduled events.
//
//   node scripts/discord-events.mjs            # dry run — prints, changes nothing
//   node scripts/discord-events.mjs --apply    # actually creates and updates
//   node scripts/discord-events.mjs --channels # list the server's voice channels
//
// Creating an event announces it to everyone in the server, so a dry run is the
// default and --apply is deliberate. data.js stays the source of truth: this
// only ever pushes outward.
//
// The bot token is read from ~/.secrets/discord-bot.token (mode 600, outside
// every repo) and never printed. The bot needs MANAGE_EVENTS in the guild.

import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const GUILD = '566707195518124053'; // Sortilege
const API = 'https://discord.com/api/v10';
const SITE = 'https://rsvp.sortilege.online';

// A wall-clock with no `zone` is floating on the site, which is right for an
// in-person night. Discord has no floating time — an event is an instant — so
// those resolve against the venue's own zone.
const HOME_ZONE = 'America/Winnipeg';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');

function token() {
  const path = join(homedir(), '.secrets', 'discord-bot.token');
  try {
    return readFileSync(path, 'utf8').trim();
  } catch {
    console.error(`No bot token at ${path} — see the Discord section of CLAUDE.md`);
    process.exit(1);
  }
}

async function discord(method, path, body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Bot ${token()}`,
      'Content-Type': 'application/json',
      'User-Agent': 'SortilegeEvents (rsvp.sortilege.online, 1.0)',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const parsed = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const detail = parsed?.message || text.slice(0, 300);
    throw new Error(`${method} ${path} → ${response.status}: ${detail}`);
  }
  return parsed;
}

/** data.js is browser code; give it a window and read what it hangs there. */
function loadEvents() {
  const window = {};
  new Function('window', readFileSync(join(root, 'data.js'), 'utf8'))(window);
  return window;
}

/**
 * Zone rules newer than Node's bundled ICU — the same pin as shared.js.
 *
 * Manitoba stopped changing its clocks on 2026-11-01 (tz 2026e): Winnipeg stays
 * at UTC-5 from 02:00 CDT that morning, for good. Node 22 ships tz 2026a
 * (`node -p process.versions.tz`), whose Intl still falls back to UTC-6, so
 * every Discord event after that date would start an hour late. Before `from`,
 * old and new data agree and Intl is trusted.
 */
const PINNED_ZONES = {
  'America/Winnipeg': { from: Date.UTC(2026, 10, 1, 7), offset: -300 },
};

/** Minutes a zone is offset from UTC at a given instant. */
function zoneOffset(timeZone, date) {
  const pin = PINNED_ZONES[timeZone];
  if (pin && date.getTime() >= pin.from) return pin.offset;
  const at = new Date(Math.floor(date.getTime() / 60000) * 60000);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).formatToParts(at).map((p) => [p.type, p.value]));
  const asUTC = Date.UTC(+parts.year, parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  return Math.round((asUTC - at.getTime()) / 60000);
}

/** A wall-clock in `zone` as a real ISO instant. */
function instant(wall, zone) {
  const guess = Date.parse(`${wall}:00Z`);
  if (!Number.isFinite(guess)) return null;
  return new Date(guess - zoneOffset(zone, new Date(guess)) * 60000).toISOString();
}

/** Same rule as isPast() in app.js: the cutoff is the START, not the end. */
function isPast(ev) {
  if (typeof ev.past === 'boolean') return ev.past;
  if (ev.repeat) return false;
  if (!ev.starts) return false;
  const began = Date.parse(instant(ev.starts, ev.zone || HOME_ZONE));
  return Number.isFinite(began) && began < Date.now();
}

/** Listed, dated, not called off, and still to come. */
function schedulable(events) {
  return Object.entries(events)
    .filter(([, ev]) => ev.starts && !ev.hidden && !ev.cancelled && !isPast(ev));
}

/**
 * What the event is called on Discord.
 *
 * The site prints the system on its own line above the title, so a title there
 * need not repeat it — "Hacksaw Dell" under "Root: The Roleplaying Game". A
 * Discord event has no such line: the name is the whole of what anyone sees in
 * the events list, so the system goes back in front of it.
 *
 * The system is trimmed at the first colon or bracket, turning "Root: The
 * Roleplaying Game" into "Root" and "Legend of the Five Rings (Edge Studio)"
 * into "Legend of the Five Rings".
 */
function eventName(key, ev) {
  const title = ev.title || key;
  const system = (ev.system || '').split(/[:(]/)[0].trim();
  if (!system || title.toLowerCase().startsWith(system.toLowerCase())) return title.slice(0, 100);
  return `${system}: ${title}`.slice(0, 100);
}

function describe(key, ev) {
  const lines = [];
  if (ev.pitch) lines.push(ev.pitch);
  const facts = [ev.system, ev.hours, ev.length && `${ev.length} a session`,
                 ev.free ? 'Free' : ev.price?.amount].filter(Boolean);
  if (facts.length) lines.push(facts.join(' · '));
  // ?src=discord so a signup coming from here is attributed, which the site
  // already records and mails through.
  lines.push(`Details and registration: ${SITE}/?event=${encodeURIComponent(key)}&src=discord`);
  return lines.join('\n\n').slice(0, 1000);
}

/**
 * The event's cover art, as the data URI the API wants.
 *
 * This is not the base64-in-HTML that is banned everywhere else: the file stays
 * a real file on disk, and the encoding exists only inside one request body
 * because Discord's API has no field that takes a URL.
 */
function cover(ev) {
  if (!ev.art) return null;
  const file = join(root, ev.art);
  const kind = ev.art.endsWith('.png') ? 'image/png'
    : ev.art.endsWith('.webp') ? 'image/webp'
    : 'image/jpeg';
  try {
    return `data:${kind};base64,${readFileSync(file).toString('base64')}`;
  } catch {
    console.log(`          (no art file at ${ev.art})`);
    return null;
  }
}

/**
 * Where Discord thinks the game happens: a voice channel for an online table,
 * the street address for one in a room.
 *
 * An online game with no `discordChannel` is skipped rather than quietly
 * published as an external event located "Online" — that is worse than not
 * publishing it, because it looks finished and tells nobody where to go.
 */
function venue(key, ev) {
  if (ev.discordChannel) {
    return { entity_type: 2, channel_id: String(ev.discordChannel), entity_metadata: null };
  }
  if (ev.place === 'online') {
    return { error: 'online game with no `discordChannel` — run --channels for the ids' };
  }
  const location = ev.address || ev.where;
  if (!location) return { error: 'no address and no discordChannel' };
  return { entity_type: 3, channel_id: null, entity_metadata: { location: location.slice(0, 100) } };
}

/** A wall-clock string moved by whole days, leaving the time of day alone. */
function addDays(wall, days) {
  const [date, time] = String(wall).split('T');
  const [y, mo, d] = date.split('-').map(Number);
  const moved = new Date(Date.UTC(y, mo - 1, d + days));
  const p2 = (n) => String(n).padStart(2, '0');
  return `${moved.getUTCFullYear()}-${p2(moved.getUTCMonth() + 1)}-${p2(moved.getUTCDate())}T${time}`;
}

/**
 * Which sitting of a campaign to publish.
 *
 * `starts` on a repeating table is session ONE, and isPast() deliberately never
 * retires a campaign — so once its Discord event ages out of the guild, a plain
 * re-run would try to recreate it at a date in the past and Discord would
 * refuse. Walk the recurrence forward to the next sitting instead.
 *
 * Stepping in whole days rather than milliseconds, for the same reason the
 * month view does: a fixed week of milliseconds is an hour short across a DST
 * change and slides the sitting onto the day before.
 */
function nextSitting(ev) {
  const zone = ev.zone || HOME_ZONE;
  if (!ev.repeat || !/FREQ=WEEKLY/.test(ev.repeat)) return { starts: ev.starts, ends: ev.ends };
  const every = Number((/INTERVAL=(\d+)/.exec(ev.repeat) || [])[1]) || 1;
  let { starts, ends } = ev;
  for (let n = 0; n < 520; n += 1) {   // ten years of fortnights, then give up
    const at = Date.parse(instant(starts, zone));
    if (!Number.isFinite(at) || at >= Date.now()) break;
    starts = addDays(starts, every * 7);
    if (ends) ends = addDays(ends, every * 7);
  }
  return { starts, ends };
}

function payload(key, ev) {
  const zone = ev.zone || HOME_ZONE;
  const sitting = nextSitting(ev);
  const start = instant(sitting.starts, zone);
  const end = sitting.ends ? instant(sitting.ends, zone) : null;
  if (!start) return { error: `unreadable starts: ${ev.starts}` };
  // Discord requires an end time for an external event.
  const place = venue(key, ev);
  if (place.error) return place;
  if (place.entity_type === 3 && !end) return { error: 'an external event needs `ends`' };

  return {
    name: eventName(key, ev),
    description: describe(key, ev),
    scheduled_start_time: start,
    scheduled_end_time: end,
    privacy_level: 2, // GUILD_ONLY, the only value the API accepts
    ...place,
  };
}

/** Fields worth comparing, so an unchanged event is left alone. */
function differs(existing, wanted) {
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  // Discord returns an image hash rather than the bytes, so the two cannot be
  // compared. Only the absence of one counts as a difference — otherwise every
  // run would re-upload every cover.
  if (!existing.image && wanted.image) return true;
  return !same(existing.description, wanted.description)
    || !same(existing.scheduled_start_time && new Date(existing.scheduled_start_time).toISOString(),
             wanted.scheduled_start_time)
    || !same(existing.scheduled_end_time && new Date(existing.scheduled_end_time).toISOString(),
             wanted.scheduled_end_time)
    || !same(existing.entity_type, wanted.entity_type)
    || !same(existing.channel_id, wanted.channel_id)
    || !same(existing.entity_metadata?.location ?? null, wanted.entity_metadata?.location ?? null);
}

async function listChannels() {
  const channels = await discord('GET', `/guilds/${GUILD}/channels`);
  const voice = channels.filter((c) => c.type === 2 || c.type === 13);
  if (!voice.length) { console.log('No voice or stage channels in the guild.'); return; }
  console.log('Voice channels — put an id in an event\'s `discordChannel`:\n');
  for (const c of voice.sort((a, b) => a.position - b.position)) {
    console.log(`  ${c.id}  ${c.name}${c.type === 13 ? '  (stage)' : ''}`);
  }
}

async function main() {
  if (process.argv.includes('--channels')) return listChannels();

  const { EVENTS = {} } = loadEvents();
  const wanted = schedulable(EVENTS);
  const existing = await discord('GET', `/guilds/${GUILD}/scheduled-events`);
  const byName = new Map(existing.map((e) => [e.name, e]));

  console.log(apply ? 'APPLYING\n' : 'DRY RUN — nothing will change. Pass --apply.\n');

  let created = 0; let updated = 0; let unchanged = 0; let skipped = 0; let failed = 0;
  for (const [key, ev] of wanted) {
    const body = payload(key, ev);
    if (body.error) {
      console.log(`  SKIP    ${ev.title || key} — ${body.error}`);
      skipped += 1;
      continue;
    }

    const match = byName.get(body.name);
    // Send art on create, and on update only when the event has none. Cover
    // images set by hand in Discord are better than anything derived here and
    // must not be overwritten; an omitted field is left alone by PATCH.
    if (!match || !match.image) {
      const image = cover(ev);
      if (image) body.image = image;
    }
    const where = body.entity_type === 2
      ? `voice ${body.channel_id}`
      : body.entity_metadata.location;

    // One refusal must not abandon the rest: a voice event can fail on channel
    // permissions while every external one is fine.
    const attempt = async (label, call) => {
      console.log(`  ${label}  ${body.name}  ${body.scheduled_start_time}  ${where}`);
      if (!apply) return true;
      try {
        await call();
        return true;
      } catch (error) {
        console.log(`          FAILED: ${error.message.replace(/^\S+ \S+ → /, '')}`);
        failed += 1;
        return false;
      }
    };

    if (!match) {
      if (await attempt('CREATE', () => discord('POST', `/guilds/${GUILD}/scheduled-events`, body))) {
        created += 1;
      }
    } else if (differs(match, body)) {
      if (await attempt('UPDATE', () => discord('PATCH', `/guilds/${GUILD}/scheduled-events/${match.id}`, body))) {
        updated += 1;
      }
    } else {
      console.log(`  ok      ${body.name}`);
      unchanged += 1;
    }
  }

  // Anything on Discord the site no longer lists. Reported, never deleted —
  // an event in the server may have been made there on purpose.
  const ours = new Set(wanted.map(([key, ev]) => eventName(key, ev)));
  for (const e of existing) {
    if (!ours.has(e.name)) console.log(`  (on Discord but not on the site: ${e.name})`);
  }

  const verb = apply ? ['created', 'updated'] : ['to create', 'to update'];
  console.log(`\n${created} ${verb[0]}, ${updated} ${verb[1]}, ${unchanged} unchanged, ${skipped} skipped`
    + (failed ? `, ${failed} FAILED.` : '.'));
  if (!apply && (created || updated)) console.log('Re-run with --apply to make it so.');
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exit(1);
});
