# Dispatch incident collector

Standalone public read-only API for the native preview. This is separate from the Sites web application's authenticated Worker. No accounts, payments or push delivery are provided here.

- Node 24, `npm ci`, `npm test`, `npm start` inside `backend`.
- Root `Dockerfile` deploys only the collector and the shared incident parser.
- `PORT=8080`, `DATABASE_PATH=/data/incidents.sqlite`; mount a persistent Railway volume at `/data`.
- Run one replica with serverless sleeping disabled. Each source polls independently: VIC/ACT after 60 seconds, NSW/QLD after two minutes (their feeds change more often than the documented 30 minutes), and SA after five minutes. Source-specific freshness limits are applied. Failed/invalid/stale snapshots cannot erase the last good records.
- `/health` checks process availability. `/v1/status` separately reports source readiness/freshness and the last bounded source error.
- `/v1/feed?region=au|vic|act|nsw|qld|sa&hours=24|72|168` returns current records plus records last seen within the selected window. History starts with the first successful collection; it is not a backfill. Removed records retain the last known source status. Only currently listed warnings are returned.
- Seven days of unlisted records are retained. Source failure pauses cleanup until the next valid snapshot. `firstSeen` and `lastSeen` describe our observations, not an incident's start or resolution.
- Data collection and client filtering do not send the user's location to the server. Traffic metadata may still be processed by the hosting platform.

Deployment: Railway project `Dispatch` (`dac3e80e-868b-491f-99ac-a2869cb171a2`), service `incident-feed` (`b0d3c424-2010-4f58-b8ba-80e0a37f9683`), volume `incident-feed-volume` at `/data`. Endpoint: https://incident-feed-production.up.railway.app . Deploy from repository root using `railway up --service incident-feed --detach`; inspect deployment state and `/v1/status` after deploying.

See `../docs/CFSSCAN-EN-MEER-MELDINGEN-2026-09-11.md` for source provenance, limitations and the next Victoria road-data integration. CFSScan is not a source in this service. The native mobile preview consumes this endpoint; the existing Sites web preview is unchanged.


The Australia response reports partial/missing source health. SA CFS now uses the official CAP-AU Atom feed linked at https://www.cfs.sa.gov.au/warnings-restrictions/warnings/rss-feeds/. The retired RSS endpoint returns an HTML unavailable page. CAP-AU explicit zero-radius circles supply points; warning polygons remain areas. Positive-radius circles do not become exact pins. CAP publication times are not incident start times, and sender/contact fields are omitted. NSW elevated alert levels are also exposed as warnings without treating a burnt-area polygon as a warning zone. A warning can refer to the same event as an incident; do not sum them as unique emergencies. Victoria ESTA records use their CAD identifier independently of the publishing agency; startup merges legacy duplicates and preserves observation history. See `../docs/UITBREIDING-AU-EN-DUBBELE-MELDINGEN-2026-09-11.md`.


19 October 2026 source repair: Victoria publishes a fresh complete JSON array whose advisory `featureCount` can differ from the array length. That counter no longer rejects the entire snapshot; JSON structure/size, source timestamp and HTTP freshness checks remain active. Old source records are replaced only after a valid fresh update. Regression coverage includes malformed/truncated responses, stale snapshots, CAP identity updates, public/test scope, expiry and cancellation.

## Source watchdog (19 October 2026)

- `/health` remains process liveness and the Railway deployment probe. `/health/ready` returns 503 when any region is unavailable or delayed. Do not use upstream readiness as a restart probe: restarting cannot repair an official feed.
- `/v1/status` is uncached, stamped with `checkedAt`, and reports each region's last successful validation, last completed attempt, persistent consecutive failures, first failure, freshness policy and alert state. Failed attempts are recorded even before the first successful snapshot. A valid unchanged or empty snapshot resets failure state; an HTTP-200 HTML/error page does not.
- Alert after three consecutive failed polls, or when the last valid snapshot exceeds its source freshness limit (VIC/ACT five minutes; SA fifteen; NSW/QLD forty). A first failed attempt with no snapshot gets the same startup grace. Preserve the last good incident records throughout an outage.
- `.github/workflows/feed-health.yml` checks the production status and all five feed endpoints on a fifteen-minute schedule, outside Railway. It independently evaluates timestamp age, missing regions, response format and service reachability. GitHub schedules can be delayed; this is not an exact fifteen-minute delivery guarantee.
- `.github/workflows/source-contracts.yml` fetches all five official sources daily, running the production parsers and source/HTTP clock checks. It retries transient fetch/validation failures up to three times. This catches feed format changes separately from process uptime.
- Both workflows create a deduplicated GitHub issue assigned to `chrisschepers` on failure, then comment and close it after a healthy observation. Direct-source checks use separate issue markers from production outages. Delivery follows the owner's GitHub notification preferences; email/push receipt is not guaranteed by a successful API call. Workflow notification failures fail the run rather than being silently swallowed. Reports are artifacts retained for fourteen days. No paid service or new external credential is required.
- Review the Actions pages for stopped/disabled schedules (public GitHub repositories can have schedules disabled after prolonged repository inactivity). GitHub Actions itself is a monitoring dependency; a missing run is not evidence of healthy feeds.
- Manual checks: `node scripts/check-feed-health.mjs` (read-only, no GitHub issues unless `NOTIFY_GITHUB=1`); `node --experimental-strip-types scripts/check-live-sources.mjs` after installing backend dependencies. Inspect `monitor-output/health.json` and `contracts.json`.
- Mobile source now names delayed regions and the age of their last successful collection in Nearby/Map, preserving the last received incidents. Each source ages independently even if another region keeps refreshing the Australia response. These additional messages and the restored SA map require a new native build; the collector watchdog works with the already installed app. Existing clients retain their general delayed-source indication.
