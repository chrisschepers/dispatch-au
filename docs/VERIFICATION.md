# Verification record

Checked on 11 September 2026. This records actual checks and their limits; it is not a claim that all launch requirements are met.

## Passed locally

- Nine parser/filter tests: Melbourne UTC/DST offsets, public-field allowlisting, malformed snapshots, latest-record deduplication, interstate exclusion, warnings versus incidents, actual geometry, missing versus zero resources, categories, kilometre filtering and stale source/browser states.
- TypeScript type checking and application lint.
- Production compilation with React 19.3, Vinext beta.9 and Vite 8.3.
- HTTP integration against the compiled Worker: page and installation metadata, manifest and icons, service worker and offline document, actual live Victoria feed, Origin guards and disabled checkout.
- D1 saved-place create/read/delete, free quota, invalid-coordinate rejection, and isolation between two local fixture identities. The test cleans up the created record.
- Production dependency audit: no reported advisories. Full development audit: four moderate findings in Drizzle's migration-tool dependency chain; no high or critical findings after targeted upgrades.

The live feed count changes naturally. The final integration sample contained 13 incident records and one warning. No synthetic records are served to users.

## Validation limits

- The account-isolation check uses synthetic trusted identity headers against localhost. It does not validate the hosted sign-in journey. The dev middleware strips those headers, as expected.
- One initial local production request failed with a Miniflare proxy connection error; the complete repeat passed. No application exception accompanied that transport error.
- No browser automation, screenshot review, physical iPhone/Android installation test, or assistive-technology test was performed. Responsive layout and PWA assets are implemented; end-to-end device behaviour is not certified.
- Live Stripe checkout, signed webhook delivery, renewals, cancellation and portal journeys have not been run with the operator's credentials. Payments remain disabled.
- Background push and full incident history are not implemented or advertised as working.
- WebMCP registration is feature-detected and implemented, but a supported browser execution context was not available for verification.
- No feed outage/volume/soak test or production availability SLA is claimed.
- Vite reports a future config-loader JSON-import compatibility warning. It does not fail the current build. Vinext reports the root route as unclassified because its static classifier cannot determine all dynamic usage; the compiled route returned HTTP 200.

Commercial release prerequisites are listed in [the analysis](ANALYSE-NL.md) and [operations guide](OPERATIONS.md). GitHub Actions provides the independent clean-install check after source publication.
