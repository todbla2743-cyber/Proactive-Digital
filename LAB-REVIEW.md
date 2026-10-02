# Lab management improvements · review candidate

Status: review candidate. No production merge, deployment, or live Lab data change is authorized by this review.

## Source and scope

Base: `todbla2743-cyber/Proactive-Digital`, commit `7e8b65b6ca1fdd14729563092f6e0c574d4577c9`.
The base `lab.html` was byte-for-byte identical to `https://getproactivedigital.com/lab.html` when checked October 2, 2026.

### Changes

- Pipeline cards have an Edit details form for name, description, next action, priority, and an optional follow-up date. Existing stage, value, payment schedule, IDs, unknown fields, and status history are retained. Previous detail values are kept in detailHistory. Cancel/Escape and a repeated submission do not write extra edits.
- Activity has an explicit next action and priority. Blank due dates become null. The default view shows open follow-ups across all dates; a month filter remains available when deliberately chosen. Existing completed entries remain available under Completed or All statuses, with completion/status history preserved.
- The Clients tab gets independent client/project and monthly-care records in a new Lab-only management collection. This requires no deposit, installment count, or start date. Upcoming plans are excluded from the new section’s active recurring total. These records are separate from legacy project/payment records; their totals are not automatically combined.
- A separate Order review tab identifies possible test/demo/sample labels in the already-loaded Design Fusion feed. Candidates are suggestions for human review, not confirmed test orders. It does not fetch orders itself, modify orders, recalculate original invoice/revenue totals, or alter Rudy’s dashboard. The feed is limited to existing loaded orders and is not a complete audit.

No private client records are embedded in source or seeded automatically. Existing dollar values, sales stages, payment history, routes, authentication, AI gateway, and original Design Fusion feed/payment functions remain unchanged. No database schema or credential change is required. The only server modification allows one new collection name in the existing authenticated Lab store.

## Validation

See TEST-RESULTS.txt for the final run. The candidate includes:

- Existing gateway, storage, synchronization, context, and workspace tests
- Pipeline legacy-finance/history preservation, idempotent repeat edits, cancellation, Escape, and safe rendering
- Activity cross-month visibility, legacy/undated entries, priority/next-action edits, nullable due date, completion/reopening, cancellation, repeated saves, and local-save failures
- Separate care record classification, persistence, and backup coverage, including guarded first cloud load, offline-first behavior, pending-queue quota rejection, accepted cache-only failure recovery, and retained draft/retry
- SHA-256 baseline assertions proving original Design Fusion feed, legacy client/payment block, login/logout, public payment route, redirects, deployment config, and AI gateway remain byte-identical
- Static checks ensuring the order-review module has no network/persistence/order mutation calls
- The repository’s public build and JavaScript syntax checks

DOM workflows use synthetic data and mocked network responses. They do not contact the live database, billing system, or AI provider.

## Remaining release checks

Actual visual-browser QA could not run: the cloud browser refused the local preview with `net::ERR_BLOCKED_BY_CLIENT`. No alternate route was used to bypass that restriction. Before publication, use an authorized preview environment to verify desktop/mobile layout, keyboard focus, navigation/back/forward, and the combined client forms visually.

The feature branch may be uploaded for a draft pull request and nonproduction preview. Production merge or deployment requires separate approval. Preview builds replace the published Lab page with a synthetic, network-isolated fixture; production builds exclude it. Existing cloud synchronization remains last-write-wins across devices; this candidate does not claim to solve concurrent multi-device editing. Take an ordinary Lab backup before any later release and avoid simultaneous editing from different devices.

The original Design Fusion totals still include all loaded orders. Review candidate orders with Rudy before trusting those totals; the candidate deliberately does not remove or modify them.

## Applying for review

The ZIP contains the changed/new files at repository-relative paths, a unified patch, this review note, and test evidence. Apply to the exact base commit in a separate review branch. Do not upload the ZIP directly as a production deploy; it is not a full site build. New files and the changed asset manifest must be kept together. The original ZIP was created before the draft PR; the repository branch includes subsequent preview-only QA support.

Run:

    npm ci --ignore-scripts
    node --test tests/*.test.mjs
    JSDOM_MODULE=/path/to/jsdom/lib/api.js node tests/lab-workspace-ui.mjs
    JSDOM_MODULE=/path/to/jsdom/lib/api.js node tests/lab-activity-ui.mjs
    JSDOM_MODULE=/path/to/jsdom/lib/api.js node tests/lab-pipeline-ui.mjs
    JSDOM_MODULE=/path/to/jsdom/lib/api.js node tests/lab-management-ui.mjs
    bash scripts/build-public.sh

All 32 unit tests and all five DOM workflow suites passed, along with the public build, syntax checks, and whitespace check. Use a writable npm cache if the environment's default cache is unavailable.


## Nonproduction browser fixture

Deploy-preview and branch-deploy builds expose `/lab-review.html` and replace that deploy's `/lab.html` with the same synthetic fixture. A prominent banner labels every screen; saves are memory-only and reset on reload. Live endpoint credentials and fallback client/business prompt data are stripped from the generated copy. CSP blocks network connections, forms, frames, and workers; the harness never delegates fetch to the browser. External/admin/payment actions are disabled. The live website’s deployment is unaffected.

Production and default builds remove the fixture files and publish the exact normal Lab source. Server functions remain part of the existing Netlify deployment configuration, but the synthetic page does not invoke them. This fixture verifies UI interaction and layout, not live authentication, provider billing, or real-cloud persistence. The latter remain covered by mocked endpoint tests and unchanged-auth isolation checks.
