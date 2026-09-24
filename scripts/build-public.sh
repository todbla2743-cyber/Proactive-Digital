#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
publish_dir="${1:-$repo_root/dist}"

files=(
  _redirects
  angels-case-study.html
  anume-case-study.html
  design-fusion-case-study.html
  googleebb70eb34089121f.html
  img/angels-desktop.jpg
  img/angels.webp
  img/anume-desktop.jpg
  img/anume.webp
  img/designfusion-desktop.jpg
  img/designfusion.webp
  img/hc-desktop.jpg
  img/hc.webp
  img/ingreattaste-desktop.jpg
  img/ingreattaste.webp
  img/masonry-company-desktop.jpg
  img/mra-desktop.jpg
  img/pvb-desktop.jpg
  img/pvb.webp
  index.html
  monthly-website-support.html
  mra-case-study.html
  pay.html
  privacy.html
  robots.txt
  sitemap.xml
  small-business-website-design-richmond-va.html
  social-preview.png
  terms.html
)

mkdir -p "$publish_dir"
for file in "${files[@]}"; do
  install -D -m 644 "$repo_root/$file" "$publish_dir/$file"
done
