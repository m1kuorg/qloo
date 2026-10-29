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
# src/shell.tsx's Head.
banner=public/og-1.png
# Social cards take a far larger file, but a small one unfurls quickly on a slow connection.
limit=300000
session=crossfeed-banner
work=$(mktemp -d)
trap 'playwright-cli -s=$session close >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

# playwright-cli prints what failed to its output, which is shown only then. The screenshot waits for the
# face, and fails rather than photograph the fallback.
cli() {
  local out
  out=$(playwright-cli -s=$session "$@") || {
    echo "$out" >&2
    exit 1
  }
}
cli open --browser chrome
cli run-code "async page => {
  const context = await page.context().browser().newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
  const banner = await context.newPage()
  await banner.goto('file://$PWD/scripts/banner.html')
  const faces = await banner.evaluate(async () => (await document.fonts.ready, [...document.fonts].map((f) => f.status)))
  if (!faces.length || faces.some((status) => status !== 'loaded')) throw new Error('The face did not load: ' + faces)
  await banner.screenshot({ path: '$work/banner.png' })
  await context.close()
}"

size=$(wc -c <"$work/banner.png")
if [ "$size" -gt "$limit" ]; then
  echo "scripts/banner.sh drew $size bytes, over the $limit the banner keeps to" >&2
  exit 1
fi
cp "$work/banner.png" "$banner"
echo "$banner: $size bytes"
