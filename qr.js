// QR code for this site — a button on the hero that shows a scannable code.
//
// The same file is in landing, registration (rsvp) and vote; keep the copies
// identical. Each site differs only in its assets/qr.svg (pre-generated, so the
// page needs no QR library) and in data-url on the script tag:
//
//   <script src="qr.js?v=1" data-url="https://vote.sortilege.online/"></script>
//
// Tap the button and the code opens over the page: the whole screen on a phone,
// a card over a dimmed page on a wider one. Any tap, click or Escape closes it.
// To regenerate assets/qr.svg after a URL change (segno, from PyPI):
//   python3 -c "import segno; segno.make('<url>', error='m', micro=False).save(
//     'assets/qr.svg', kind='svg', dark='#1F2730', light='#ffffff', border=4,
//     omitsize=True, xmldecl=False)"
// then scan the result before pushing.

(function () {
  const script = document.currentScript;
  const url = script && script.dataset.url;
  const hero = document.querySelector('.hero');
  if (!url || !hero) return;
  const label = url.replace(/^https?:\/\//, '').replace(/\/$/, '');

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'qrbtn';
  button.setAttribute('aria-label', `Show a QR code for ${label}`);
  button.setAttribute('aria-haspopup', 'dialog');
  // A small QR glyph: three finder squares and a scatter of modules.
  button.innerHTML = `
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M3 3h7v7H3zM5 5v3h3V5zM14 3h7v7h-7zM16 5v3h3V5zM3 14h7v7H3zM5 16v3h3v-3z" fill-rule="evenodd"/>
      <path d="M14 14h3v3h-3zM18 14h3v3h-3zM14 18h3v3h-3zM18 18h3v3h-3zM12 6h1v2h-1zM6 12h2v1H6z"/>
    </svg>`;
  hero.prepend(button);

  const sheet = document.createElement('div');
  sheet.className = 'qrsheet';
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', `QR code for ${label}`);
  sheet.tabIndex = -1;
  sheet.innerHTML = `
    <div class="qrsheet__card">
      <img class="qrsheet__code" src="assets/qr.svg" alt="">
      <p class="qrsheet__url"></p>
      <p class="qrsheet__hint">Tap anywhere to close</p>
    </div>`;
  sheet.querySelector('.qrsheet__url').textContent = label;
  sheet.querySelector('.qrsheet__code').alt = `QR code linking to ${label}`;
  document.body.append(sheet);

  function open() {
    sheet.hidden = false;
    document.body.classList.add('has-qr');
    sheet.focus();
  }

  function close() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    document.body.classList.remove('has-qr');
    button.focus({ preventScroll: true });
  }

  button.addEventListener('click', open);
  // Anywhere means anywhere: the code itself included, so a phone held up for
  // someone to scan is put away with the same tap wherever the thumb lands.
  sheet.addEventListener('click', close);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });
}());
