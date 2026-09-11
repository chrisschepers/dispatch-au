# Dispatch · Victoria

A calm, local-first view of public fire, rescue and SES incidents in Victoria, Australia. An installable web app inspired by the visual principles of the owner's 112 Meldingen app.

**Status: working preview, not a launched paid service.** No background push notifications. Pro checkout remains disabled until the operator configures Stripe and confirms commercial feed rights. This is not an emergency service; use VicEmergency for official advice and call 000 in an emergency.

## Included

- Live VicEmergency adapter with validation, source attribution and explicit stale/error states.
- Search, categories, optional planned burns, operational status and kilometre-radius filters.
- List and Leaflet map, retained official warning levels, incident details and share links.
- Melbourne time zones, light/dark appearance, responsive mobile navigation.
- PWA installation metadata and a clear offline fallback, without caching stale incidents as live data.
- ChatGPT sign-in, D1-backed saved places (one free, five with a verified subscription).
- Stripe Checkout, signed subscription webhooks and billing portal implementation, disabled by default.
- Type checks, parser/filter tests and GitHub Actions build checks.

Read the [Dutch product and source analysis](docs/ANALYSE-NL.md), [operations guide](docs/OPERATIONS.md) and [verification record](docs/VERIFICATION.md).

## Development

Node 22.13+ (Node 24 recommended). `npm ci`, `npm run db:generate` after schema changes, and `npm run dev`. The Sites development plugin supplies local sign-in. Apply generated SQL to the local D1 database before using persisted features; see the operations guide. Production requires the Sites dispatcher for its trusted identity headers; do not expose this Worker directly while trusting arbitrary incoming identity headers.

`npm test`, `npm run typecheck`, `npm run build`.

Copy `.env.example` to `.env` for local configuration. Do not commit secrets. Hosted secrets must be configured using the hosting platform.

The public incident feed can be used without app sign-in. Saved places use the current preview identity provider. No raw pager interception, private ambulance data, official agency logos, invented vehicles or full-history claims are included.

## Data and licence

Source data belongs to its respective providers and is not licensed by this code repository. The combined feed's commercial reuse conditions still need confirmation; see the source analysis. Public repository visibility does not grant a licence to copy the proprietary application. Third-party packages retain their own licences.
