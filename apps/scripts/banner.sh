#!/usr/bin/env bash
# Renders the link-embed banner into public/ from scripts/banner.html, its one source (docs/DESIGN.md,
# "Link-embed banner"): a Playwright screenshot in Chrome, through playwright-cli from Homebrew
# (`brew install playwright-cli`), at 1200x630 and one device pixel to a CSS pixel. The page sets its
# type in the face `bun install` puts in node_modules/, so run that first. Run it from apps/ after
# changing the banner, then look at the PNG at full size and about 600px wide (apps/README.md,
# "Link-embed banner").
set -euo pipefail
cd "$(dirname "$0")/.."

command -v playwright-cli >/dev/null || {
  echo "scripts/banner.sh needs playwright-cli: brew install playwright-cli" >&2
  exit 1
}
[ -f node_modules/@fontsource-variable/schibsted-grotesk/package.json ] || {
  echo "scripts/banner.sh needs Schibsted Grotesk: run bun install in apps/" >&2
  exit 1
}

# Unfurlers keep an image by its URL for days, so a changed banner takes the next number, here and in
# BANNER in src/shell.tsx, which also gives its size.
banner=public/og-1.png
width=1200
height=630
# Social cards take a far larger file, but a small one unfurls quickly on a slow connection.
limit=300000
session=crossfeed-banner
work=$(mktemp -d)
trap 'playwright-cli -s=$session close >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

# playwright-cli prints what failed to its output, which is shown only then. The screenshot waits for the
# face and fails rather than photograph the fallback. It fails too when the layout breaks: anything
# past the frame's edge, a line of text running past its own box, such as a show's name past its
# column, two pieces of text on each other, or the claim on more than two lines.
cli() {
  local out
  out=$(playwright-cli -s=$session "$@") || {
    echo "$out" >&2
    exit 1
  }
}
cli open --browser chrome
cli run-code "async page => {
  const context = await page.context().browser().newContext({ viewport: { width: $width, height: $height }, deviceScaleFactor: 1 })
  const banner = await context.newPage()
  await banner.goto('file://$PWD/scripts/banner.html')
  const faces = await banner.evaluate(async () => (await document.fonts.ready, [...document.fonts].map((f) => f.status)))
  if (!faces.length || faces.some((status) => status !== 'loaded')) throw new Error('The face did not load: ' + faces)
  const broken = await banner.evaluate(() => {
    const all = [document.body, ...document.body.querySelectorAll('*')]
    const texts = all.filter((el) => [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()))
    const name = (el) => el.textContent.trim().replace(/\\s+/g, ' ').slice(0, 40) || el.tagName
    const meet = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    const past = all.filter((el) => {
      const box = el.getBoundingClientRect()
      return box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight
    })
    const runs = texts.filter((el) => el.scrollWidth > el.clientWidth)
    const overlaps = texts.flatMap((a, i) =>
      texts.slice(i + 1).filter((b) => meet(a.getBoundingClientRect(), b.getBoundingClientRect())).map((b) => name(a) + ' on ' + name(b))
    )
    const claim = document.querySelector('h1')
    const lines = Math.round(claim.getBoundingClientRect().height / parseFloat(getComputedStyle(claim).lineHeight))
    return [
      ...past.map((el) => name(el) + ' past the frame'),
      ...runs.map((el) => name(el) + ' past its box'),
      ...overlaps,
      ...(lines > 2 ? ['the claim on ' + lines + ' lines'] : [])
    ]
  })
  if (broken.length) throw new Error('The banner breaks: ' + broken.join('; '))
  await banner.screenshot({ path: '$work/banner.png' })
  await context.close()
}"

# The PNG's own size, from its header: its width and height, big-endian, in bytes 16 to 23.
read -r w0 w1 w2 w3 h0 h1 h2 h3 < <(od -An -tu1 -j16 -N8 "$work/banner.png")
drawn="$(((w0 << 24) | (w1 << 16) | (w2 << 8) | w3))x$(((h0 << 24) | (h1 << 16) | (h2 << 8) | h3))"
if [ "$drawn" != "${width}x$height" ]; then
  echo "scripts/banner.sh drew $drawn, not ${width}x$height" >&2
  exit 1
fi
size=$(wc -c <"$work/banner.png")
if [ "$size" -gt "$limit" ]; then
  echo "scripts/banner.sh drew $size bytes, over the $limit the banner keeps to" >&2
  exit 1
fi
cp "$work/banner.png" "$banner"
echo "$banner: $size bytes"
