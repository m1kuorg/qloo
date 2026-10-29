#!/usr/bin/env bash
# Renders the favicon set and the home screen's icons into public/ from scripts/mark.svg, the mark's
# one SVG source (docs/DESIGN.md, "Icons"). librsvg's rsvg-convert draws each size, the renderer
# ImageMagick itself hands SVG to, and ImageMagick draws the ICO's tile, packs the ICO, and drops the
# PNGs' alpha. Both come from Homebrew: `brew install librsvg imagemagick`. Run it from apps/ after
# changing the mark, then look at the 16 and 32px icons in light and dark tabs (apps/README.md,
# "Icons").
set -euo pipefail
cd "$(dirname "$0")/.."

for tool in rsvg-convert magick; do
  command -v "$tool" >/dev/null || {
    echo "scripts/icons.sh needs $tool: brew install librsvg imagemagick" >&2
    exit 1
  }
done

source=scripts/mark.svg
ground='#f8f8fa'
# Everything is drawn into a scratch folder first and copied into public/ only once every render has
# succeeded, so a failed run leaves the set as it was.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir "$work/public"

# The tab's icons: the SVG itself, without the comment it opens with, which Chrome draws light or dark
# as it is, and the ICO at 16, 32 and 48px. Safari takes the ICO whenever it's linked, and draws even
# the SVG in its light colours, so the ICO is the mark on a rounded tile of the light ground, 1px in at
# 16px, which holds on a dark tab bar too.
sed '1,/-->/d' "$source" >"$work/public/icon.svg"
for size in 16 32 48; do
  inset=$((size / 16))
  radius=$((size / 5))
  rsvg-convert -w $((size - 2 * inset)) -h $((size - 2 * inset)) --page-width "$size" --page-height "$size" \
    --left "$inset" --top "$inset" "$source" -o "$work/mark.png"
  magick -size "${size}x$size" xc:none -fill "$ground" -draw "roundrectangle 0,0 $((size - 1)),$((size - 1)) $radius,$radius" \
    "$work/mark.png" -composite "$work/$size.png"
done
magick "$work/16.png" "$work/32.png" "$work/48.png" "$work/public/favicon.ico"

# A tile: the mark's 20-unit box drawn `box` px across, centred on a `size` px square of the light
# ground, opaque, as iOS needs and every launcher can mask.
tile() {
  local size=$1 box=$2 file=$3
  local inset=$(((size - box) / 2))
  rsvg-convert -w "$box" -h "$box" --page-width "$size" --page-height "$size" --left "$inset" --top "$inset" \
    --background-color "$ground" "$source" -o "$work/tile.png"
  magick "$work/tile.png" -alpha off -strip "$work/public/$file"
}

# The mark two-thirds of the tile across, about 60% with its own margin; the maskable icon's half,
# so the whole mark stays well inside the circle a launcher keeps, 40% of the tile in radius.
tile 180 120 apple-touch-icon.png
tile 192 128 icon-192.png
tile 512 340 icon-512.png
tile 512 256 icon-maskable-512.png

# The SVG last, so the browsers that take it change icon only once the rest of the set is in place.
cp "$work/public/favicon.ico" "$work/public/"*.png public/
cp "$work/public/icon.svg" public/
