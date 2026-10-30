#!/usr/bin/env bash
# Renders the README banner, docs/readme/banner-light.png and banner-dark.png, from docs/readme/banner.html
# (docs/DESIGN.md, "README banner"), through apps/scripts/banner.sh, which photographs it in Chrome at
# 1280x640 and two device pixels to a CSS pixel, once in each colour scheme, and fails if the face
# doesn't load or the layout breaks. Run `bun install` in apps/ first, then run it from anywhere, and
# look at both PNGs at full size and at about 830px wide, as GitHub shows a README.
set -euo pipefail
cd "$(dirname "$0")/../../apps"

for scheme in light dark; do
  BANNER_SOURCE=../docs/readme/banner.html BANNER_OUT=../docs/readme/banner-$scheme.png \
    BANNER_WIDTH=1280 BANNER_HEIGHT=640 BANNER_SCALE=2 BANNER_SCHEME=$scheme BANNER_LIMIT=1000000 \
    scripts/banner.sh
done
