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
  food-businesses.css
  food-businesses.js
  virginia-food-businesses.html
  private-chefs-virginia.html
  catering-businesses-virginia.html
  site.css
  homepage.css
  google-reviews.css
  site-navigation.js
  services.html
  investment.html
  digital-support.html
  process-faq.html
  work.html
  contact.html
  index.html
  lab.html
  lab-workspace.js
  lab-pipeline-editor.js
  lab-management.js
  lab-order-review.js
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

# Preview builds get a network-isolated, synthetic-data Lab. Production never
# includes the fixture and continues to publish the original authenticated Lab.
rm -f "$publish_dir/lab-review.html" "$publish_dir/lab-review-harness.js"
if [[ "${CONTEXT:-}" == "deploy-preview" || "${CONTEXT:-}" == "branch-deploy" ]]; then
  node "$repo_root/scripts/build-lab-review.mjs" "$publish_dir"
  cp "$publish_dir/lab-review.html" "$publish_dir/lab.html"
fi
