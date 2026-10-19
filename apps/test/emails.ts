// Synthetic pitch emails, as a booker's mail client exports them: made-up senders at example.com,
// guests, and works. The inbox's tests upload them in the app and send them to the API.

export const nightFerry = [
  'From: Pat Lindqvist <pat.lindqvist@example.com>',
  'To: bookings@nightshift.example',
  'Subject: Ada Quill on Night Ferry',
  'Date: Mon, 12 Oct 2026 09:30:00 +0000',
  'Content-Type: text/plain; charset=utf-8',
  '',
  "Hi team, Ada Quill's novel Night Ferry is about a projectionist on a car ferry.",
  ''
].join('\r\n')

// An HTML-only email, as some mail clients send.
export const paperMoons = [
  'From: "Rue Vance" <rue@example.com>',
  'Subject: =?utf-8?Q?Paper_Moons_=E2=80=94_new_edition?=',
  'MIME-Version: 1.0',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<html><body><p>Rue Vance has a new edition of <b>Paper Moons</b> out.</p><p>From the author&#39;s desk.</p></body></html>',
  ''
].join('\r\n')

// A multipart email with plain and HTML parts and an attachment.
export const staticBloom = [
  'From: Ben Ochoa <ben.ochoa@example.com>',
  'Subject: Static Bloom',
  'MIME-Version: 1.0',
  'Content-Type: multipart/mixed; boundary="mixed"',
  '',
  '--mixed',
  'Content-Type: multipart/alternative; boundary="alt"',
  '',
  '--alt',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Ben Ochoa directed Static Bloom.',
  'From the first frame, it was a film about radio.',
  '--alt',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Ben Ochoa directed <i>Static Bloom</i>.</p>',
  '--alt--',
  '--mixed',
  'Content-Type: application/pdf; name="press-kit.pdf"',
  'Content-Disposition: attachment; filename="press-kit.pdf"',
  'Content-Transfer-Encoding: base64',
  '',
  'JVBERi0xLjQK',
  '--mixed--',
  ''
].join('\r\n')

// An mbox export holding the three: each message after a "From " line, and a body line that starts
// with "From " escaped as ">From ", as mail clients write it.
export const mbox = [nightFerry, paperMoons, staticBloom.replace('\r\nFrom the first', '\r\n>From the first')]
  .map((m, i) => `From MAILER-DAEMON Mon Oct 12 09:3${i}:00 2026\n${m.replace(/\r\n/g, '\n')}\n`)
  .join('')
