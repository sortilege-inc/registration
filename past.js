/*
 * past.js — the archive at /past/.
 *
 * Not linked from the roster: you get here by knowing the address. It is a
 * record rather than a shopfront, so there are no filters and no calendar —
 * just every table that has played, newest first, grouped by year.
 *
 * "Played" is isPast() from shared.js and nothing else, so the archive is
 * exactly the complement of the roster: a table leaves one as it enters the
 * other, and neither can drift from the other's idea of when that happens.
 */

const events = window.EVENTS || {};
const src = new URLSearchParams(location.search).get('src');

/**
 * When a table ran, as a sortable number.
 *
 * `starts` is a local wall-clock, and the archive only ever compares these
 * against each other, so parsing it as local time is right — a zone would only
 * matter for showing an hour, which this page does not do.
 */
function ranAt(ev) {
  const when = Date.parse(ev.starts || '');
  return Number.isFinite(when) ? when : 0;
}

/**
 * Everything that has played, newest first.
 *
 * `hidden` stays hidden — it means a table was never announced, and running is
 * not an announcement. A cancelled table is left out too: it never played, so
 * it belongs in no record of nights that did.
 */
function archive() {
  return Object.entries(events)
    .filter(([, ev]) => !ev.hidden && !ev.cancelled && isPast(ev))
    .sort((a, b) => ranAt(b[1]) - ranAt(a[1]));
}

/** The year a table ran, or null when it carries no date at all. */
function yearOf(ev) {
  const m = /^(\d{4})/.exec(ev.starts || '');
  return m ? m[1] : null;
}

function render() {
  const root = document.getElementById('archive');
  const empty = document.getElementById('archive-empty');
  const played = archive();

  empty.hidden = played.length > 0;
  root.textContent = '';

  // Group into years as we go. The list is already sorted, so a year is done
  // the moment a different one turns up.
  let openYear;
  let grid;
  for (const [key, ev] of played) {
    // A table retired by hand with `past: true` may carry no date. Those go
    // under one undated heading at the end, which the sort puts them in.
    const year = yearOf(ev) || 'Undated';
    if (year !== openYear) {
      openYear = year;
      const head = document.createElement('h3');
      head.className = 'chooser__fullhead';
      head.textContent = year;
      grid = document.createElement('div');
      grid.className = 'tarots';
      root.append(head, grid);
    }
    grid.append(eventTile(key, ev, src));
  }
}

render();
