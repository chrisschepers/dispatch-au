# Operations and release boundaries

## Identity

The Sites dispatcher owns ChatGPT sign-in and trusted `oai-authenticated-user-*` headers. Public feed routes need no account. Saved-place and payment routes derive identity server-side and check the Origin on mutations. Never put this Worker directly on the internet without an equivalent trusted authentication boundary. For an independent consumer deployment, replace the identity adapter with verified public consumer identity rather than trusting headers supplied by arbitrary clients.

## Source

`GET /api/incidents` loads the direct Victoria Events feed through D1 caching. Cache TTL is 60 seconds; errors retain the prior payload and set stale. A missing or more-than-five-minute-old source timestamp also sets stale. The client performs a further freshness check as time passes. Fetches have timeouts and responses are size-bounded. Only explicitly allowed public fields are returned; raw CAP/webBody fields are omitted.

The current release has on-demand ingestion, not an always-running collector. Full incident history and background notifications are not available. A missing record is never called resolved. Multi-isolate concurrency can produce more than one upstream request on expiry; at scale move collection to a single scheduled worker or durable coordinator. Do not advertise a refresh SLA.

## Database

Drizzle schema in `db/schema.ts`, immutable generated migrations in `drizzle/`. Queries use prepared statements and user ownership checks. Free/Pro saved-place quotas are applied atomically within the insertion statement. The cache stores one normalised state snapshot, not raw government contact information. User-owned places can be removed through the interface.

## Enable payments only after release prerequisites

1. Obtain and retain the applicable commercial reuse permission for the combined source data.
2. Configure production `APP_ORIGIN` as a trusted HTTPS origin.
3. Create AUD recurring Stripe prices: 499 cents/month and 3999 cents/year. Use inclusive or unspecified tax behaviour consistent with the displayed total; exclusive taxes are rejected. Confirm tax treatment with the operator's actual business setup.
4. Configure `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, and `STRIPE_WEBHOOK_SECRET` as hosted secrets. Never prefix secrets with a public/client environment prefix.
5. Subscribe the public webhook endpoint `/api/billing/webhook` to `customer.subscription.created`, `.updated`, `.deleted`. Ensure platform access permits Stripe to reach this route. The current owner-only Sites preview will not accept external billing callbacks; do not enable billing on it.
6. Configure the customer portal and test purchase, incomplete payment, renewal, payment failure, cancellation, refund policy, replayed events and cancellation at period end in Stripe test mode.
7. Set `VIC_COMMERCIAL_USE_CONFIRMED=true` and `BILLING_ENABLED=true` only when the launch conditions are actually met.

The checkout success URL does not grant privileges. A webhook must verify its signature, fetch canonical subscription state and persist entitlement. Secrets absent or enable flags false => checkout returns 503 and UI says Pro is not on sale. Stripe integration is implemented but not end-to-end validated with an operator account.

## Maps and PWA

OpenStreetMap tiles load only in an interactive map. Keep visible attribution and Referer headers. No prefetch/offline tile downloads. Move to a contracted tile provider before promising paid uptime at scale.

The service worker caches only the offline page and two icons. Authenticated HTML, account responses, incidents, payments and map tiles are not stored in the service-worker cache. An installed app requires network access for current records. iOS installation uses Safari's Add to Home Screen. Native apps are a separate follow-up project stage.

## GitHub CI

`.github/workflows/ci.yml` runs on public-repository standard Ubuntu runners. It performs clean install, unit tests, type checking, lint and production build. Secrets are not exposed to fork pull requests. Source does not automatically deploy from arbitrary pull requests. The private Sites preview is published separately from a validated commit.

## Local schema initialization

After a successful production build, apply generated SQL with `npx wrangler d1 execute DB --local --config dist/server/wrangler.json --file drizzle/0000_fixed_the_hood.sql` for an empty local database. For future migrations, apply only files not already applied. Sites applies packaged migrations in hosted deployments.

Lint excludes vendored Shadcn primitives. React Compiler diagnostics are disabled because this application does not use React Compiler; hook correctness checks remain enabled. The Next.js HTML-link rule is disabled because Sites sign-in/out requires top-level anchor navigation.

## Local production integration check

Build first, initialize the local schema, then run `npm start -- --ip 127.0.0.1 --port 3001 --persist-to .wrangler/state`. Run `npm run check:http` in another terminal. This tests the compiled Worker with a local identity fixture and cleans up its test place. It refuses non-local targets. It does not test ChatGPT authentication. The Vite development middleware correctly strips client-supplied identity headers, so this fixture test intentionally targets the locally served production Worker, never a public deployment.

## Dependency audit

On 11 September 2026, targeted upgrades removed the initial high-severity dependency findings. `npm audit --omit=dev` reports zero advisories. Four moderate findings remain in the Drizzle migration-tool dependency chain (`@esbuild-kit` and its esbuild 0.18 dependency); these are development-only. No forced downgrade or incompatible transitive override has been applied. Do not expose migration tooling as a network service. Recheck the audit when updating dependencies.
