#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
publish_dir="${1:-$repo_root/dist}"

files=(
  masonry-contractor-websites.html
  masonry-review-thanks.html
  masonry.css
  masonry.js
  masonry-assets/favicon.svg
  masonry-assets/jakarta.woff2
  masonry-assets/masonry-social.jpg
  masonry-assets/outfit.woff2
  masonry-assets/todd-founder.jpg
  masonry-assets/todd-masonry-detail-1280.webp
  masonry-assets/todd-masonry-detail-768.webp
  masonry-assets/todd-masonry-hero-1280.webp
  masonry-assets/todd-masonry-hero-1536.webp
  masonry-assets/todd-masonry-hero-768.webp
  analytics.js
  analytics.css
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
  lab-crm.js
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

node "$repo_root/scripts/add-analytics.mjs" "$publish_dir"

# Preview builds also publish the offline synthetic fixture at /lab-review.html.
# /lab.html stays the real password-gated Lab on every context so the prospect
# CRM and its blob API work in deploy previews. Production does not publish the fixture.
rm -f "$publish_dir/lab-review.html" "$publish_dir/lab-review-harness.js"
if [[ "${CONTEXT:-}" == "deploy-preview" || "${CONTEXT:-}" == "branch-deploy" ]]; then
  node "$repo_root/scripts/build-lab-review.mjs" "$publish_dir"
fi
