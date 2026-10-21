# Masonry contractor services landing page

Canonical destination: https://getproactivedigital.com/masonry-contractor-websites

The approved design now presents a public Proactive Digital service: website and project portfolio design, local visibility support, useful estimate requests, inquiry workflows, and ongoing support for masonry and small construction businesses. The homepage navigation and Explore section, plus Services → Solutions by business, link to the page.

## Search and sharing

- A unique title and description, absolute canonical, indexable robots directive, and Open Graph / Twitter metadata are present in the built HTML.
- Organization, Person, WebSite, WebPage, Service, ImageObject, and visible BreadcrumbList data describe Proactive Digital's actual service. No masonry-business identity, review-star markup, traffic result, or ranking guarantee is asserted.
- The production URL is included in the existing sitemap. The existing robots file already advertises that sitemap.
- Dedicated 1200 × 630 sharing artwork and responsive WebP photos are published. The 1280-pixel hero is approximately 96 KB, compared with the 2.4 MB concept PNG. The images preserve the approved concept and remain captioned as concept imagery.
- The confirmation page is noindex and omitted from the sitemap.

## Requests and measurement

The production form uses the existing `proactive-contact` form and its registered field names. It preserves that form's established submission and notification setup. The priority values and a source line in the message identify masonry inquiries. Submissions are URL-encoded, include the honeypot, prevent duplicate clicks, and show success only after the request is accepted. The normal POST action supports visitors without JavaScript.

The existing consent-based analytics script is added by the public build. It records production page visits and a `generate_lead` event after an accepted request. It does not receive the request's name, email, or message through the custom event.

## Verification

The public build, JavaScript syntax, page-specific SEO and form tests, and existing analytics tests pass. Browser review covered the desktop hero, phone-width request form with no horizontal overflow, homepage entry points, and the interactive approach/inquiry features inherited from the approved concept.

An existing Lab isolation check reports a stale hash for `site-navigation.js`. The file is byte-identical to the original production HEAD; its baseline predates the existing analytics addition. This change does not modify that file or relax the guard. The unrelated Lab and payment source remain untouched.

Publishing makes the page eligible for discovery; this launch does not establish that a search engine has indexed it or that rankings or inquiry volumes have increased.
