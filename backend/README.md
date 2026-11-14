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

Service settings (Dockerfile build, `/health` probe, restart policy, the volume at `/data`, domains) live in `../.railway/railway.ts` (Railway IaC; it replaced `railway.json`, which Railway stops reading on 1 December 2026). Railway does not read `.railway/` during deploys: after changing it, run `railway config plan` from the repository root, check that nothing is destroyed (above all the volume mount), then `railway config apply`. Variables are not managed there and stay as they are on Railway.

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

## Website (9 November 2026)

The same service renders emergenciesnearme.online (`site*.mjs`), server-side so search engines see the content:

- `/map` and `/map/{state}`: live map (MapLibre with OpenFreeMap tiles) from `/v1/map`, a compact list of active and recently ended incidents. Ambulance calls are left out of everything public.
- `/incidents/{state}`, `/incidents/{state}/places` and `/incidents/{state}/{place}`: what is happening now and the last 90 days per suburb. A place is matched from the agency's location text with `au-places.json` (GeoNames, CC BY 4.0; rebuild with `node scripts/au-places.mjs`). Place pages are `noindex` unless the place had two incidents in 90 days or one in 14.
- `/news`: articles for significant incidents and a weekly overview per state (`articles.mjs`): Watch and Act or Emergency Warning, Queensland warnings, NSW bush and grass fires with an Advice level for 6 hours or 100 ha or more. Only states whose licence allows commercial adaptation: `ARTICLE_REGIONS` (default `nsw,qld,act,vic`; not `sa`, whose feed data.sa.gov.au lists as CC BY-NC-ND).
- History (`history.mjs`): compact rows and status events for 400 days, next to the live store that keeps an ended incident for 7 days.
- Sitemap index at `/sitemap.xml`; pages are compressed (Brotli or gzip) and cached for a minute.

## Rescue and police vessels (13 November 2026)

`vessels.mjs`, `vessel-rules.mjs` and `vessel-trips.mjs`: volunteer marine rescue boats, water police, patrol and fire vessels from AIS, for a map layer in the app.

- Source: Open Waters AIS (`https://ais.openwaters.io/v1/vessels`). Licence: free for personal use; commercial use as a contributor (own AIS receiver) or paid; data per source CC0/ODbL with attribution, which every response carries in `attribution`. `VESSELS_ENABLED=off` switches the layer off (default on). `OPENWATERS_TOKEN` (optional) is sent as the `APIKey` header.
- Recognition (`vessel-rules.mjs`): Australian vessels (MMSI 503) by AIS type 51/55 and by name, because either alone is wrong both ways; the file lists the measured examples. Categories: `rescue`, `police`, `patrol` (law enforcement without a police name: Border Force, fisheries, maritime safety) and `fire`. `basis` says how a vessel was recognised: `known`, `name`, `type+name` or `type`.
- Requests: eleven "light" boxes (`type=51,55`) cover the whole coast, boxes without such vessels once an hour; vessels with another AIS type are found by a full scan of sixteen boxes every six hours and then followed with `mmsi=` queries of ten. One round a minute while someone has the layer open (about 600 requests an hour), every three minutes otherwise (about 210), against a source limit of 120 a minute (7,200 an hour); a bucket caps it at 20 a minute. Errors pause 30 s doubling to 10 minutes, a 4xx an hour; the pause survives a restart.
- `GET /v1/vessels`: `vessels[]` with `mmsi, name, callsign, category, organisation, unit, basis, lengthM, lat, lon, speedKn, course, heading, moving, seenAt, stale, berth {lat, lon} | null, atBerth (true/false/null), trip {id, startedAt} | null`, plus `categories`, `updatedAt`, `attribution` and `status`. A moving vessel is dropped 30 minutes after its last position; a vessel that lay still stays for 24 hours where it lay (AIS is often off at the berth) and is `stale` after 30 minutes. Every call counts as someone looking, so it is not cached.
- `GET /v1/vessels/{mmsi}/trips`: the running trip first, then the trips that ended in the last 7 days: `id, running, startedAt, departureSeen, from (berth|elsewhere), endedAt, end (berth|stopped|lost|null), lastSeenAt, durationMin, distanceKm, maxKn, track` with points `[lat, lon, unix seconds]`. 404 for a vessel we do not know.
- Trips (`vessel-trips.mjs`): the berth is learned as the place where the vessel lies still the longest (at least 30 minutes). A trip starts at 2 knots once the vessel is 300 m from where it started, and ends after five minutes still at the berth, or when the vessel drops out of sight there for 15 minutes; three hours without a signal closes it as `lost`. Tables `vessel_fleet`, `vessel_state`, `vessel_trip_state` and `vessel_trips` in the same SQLite file keep the fleet, the pause, the berths and running trips across a restart.
- Not linked to incidents: the incident feeds hold no located water rescues (one "Marine Fire" in seven days on 13 November 2026). No push notifications.
- Coverage on 13 November 2026: 103 vessels known (70 rescue, 19 police, 14 patrol, no fire boat on AIS). None between Geraldton and Cape York across the north (Pilbara, Kimberley, Darwin, the Gulf) and none in Tasmania: no such vessel was on AIS there.

## Aircraft flights (13 November 2026)

`flights.mjs` keeps one flight per take-off for the firefighting, rescue and medical aircraft of the aircraft layer (not police): its track, the fire a bomber or helitak works on, and for rescue and medical aircraft only whether it is back at base. It is fed by the polls of `aircraft.mjs` and stored in SQLite (`aircraft_flights`, `aircraft_links`, `aircraft_bases`), so a restart keeps a running flight. History is 7 days.

- `GET /v1/aircraft` gains per aircraft: `name` ("Bomber 210"), `large` (large air tanker), `state` (`airborne`, `at_base`, `landed_elsewhere`, `landed`, `unknown` or `null`), `flightId`, `airborneSince` and `workingOn` (`{ id, title, location, since }` or `null`). `nearFire` is now always `null` for medical aircraft. `status.tracking` says whether flights are followed.
- `GET /v1/incidents/{id}/aircraft`: `{ incidentId, aircraft: [...], attribution }`. Each aircraft: `hex`, `registration`, `callsign`, `name`, `role`, `operator`, `rotor`, `class`, `type`, `model`, `large`, `flightId`, `since`, `lastNear`, `working` (a sample near the fire in the last 30 minutes and still flying), `airborne`, `track`. Aircraft linked in the last 24 hours are listed. Only bombers and helitaks.
- `GET /v1/aircraft/{hex}/flights`: `{ aircraft, state, historyDays: 7, flights: [...], attribution }`, newest first. A flight: `id`, `state` (`airborne`, `landed`, `lost`), `startedAt`, `takeoffSeen` (false when the aircraft came into view en route), `endedAt`, `lastSeenAt`, `track`, and `fires` (`[{ id, title, location, since, lastNear, working }]`) for firefighting aircraft. Rescue and medical flights have no `fires`; they have `landing`: `base`, `elsewhere`, `unknown` or `null`. 404 for an aircraft that is not followed.
- `track` is `[[unixSeconds, lat, lon, altitudeFt], ...]`, one point per poll, so 3 to 12 minutes apart.
- Neither route counts as someone looking at the layer. Both are cached for 30 seconds and carry the same `attribution` as `/v1/aircraft` (adsb.lol ODbL, NAFC, plane-alert-db ODbL, tar1090-db).

Rules, all in the header of `flights.mjs`: a link needs two moving samples 4 to 20 minutes apart, both below 8,000 ft and within 5 km of the pin of a listed bush or grass fire that is not safe, patrolled or out (plus the radius of its burnt area), and no second fire about as near. Where a rescue or medical aircraft lands away from base is never named, labelled or matched to an incident; bases are learnt from long stops and never leave the module. A large air tanker is NAFC class `FW - Type 1`.

Request budget: flights are followed without a viewer with one adsb.lol request per round, every 8 minutes while a followed aircraft is in the air (180 a day at most) and every 12 minutes otherwise (120 a day), out of the same bucket of 300 a day as the layer. Tracking stops when the bucket is down to 10, and the bucket's level is stored, so restarts cannot refill it. With a fire the other firefighting aircraft take turns in the request (each about every third round until it is seen flying, then every round).

Switches (Railway variables):

- `AIRCRAFT_TRACKING=off` stops following flights; the layer then polls only while someone looks, as before. On by default.
- `AIR_TANKER_PUSH=on` sends the large air tanker alert (docs/PUSH-API.md). Off by default.
- `FLEET_CASA_REGISTER=on` adds Royal Flying Doctor Service aircraft from CASA's civil aircraft register (`https://services.casa.gov.au/CSV/acrftreg.csv`) to the nightly fleet rebuild; the attribution then names CASA (CC BY 4.0). Off by default: CASA's copyright page puts its website material under CC BY 4.0, but the terms on the page of the data files themselves were not read when this was built. Confirm those before switching it on. On 13-11-2026 it added 7 aircraft (88 to 95).

## Owner dashboard (14 November 2026)

`dashboard.mjs` and `dashboard-page.mjs`: one page for the owner that shows how the app is doing, from what this service already knows. Store figures (App Store, Google Play, RevenueCat) are not connected; the page has an empty "Stores" section for them.

- Open `https://<host>/dashboard`. It is open, without a key (owner's choice, 15-11-2026), refreshes every 60 seconds and is marked `noindex`.
- `GET /v1/stats` (also `/v1/admin/stats`, the old address): counts only, nothing per device. Computed at most once a minute and kept in memory; the feed is not involved.

What it returns: `generatedAt`, `timeZone` (`Australia/Melbourne`), `today`, `cacheSeconds`, `devices` (`total`, `new {today, last7d, last30d}`, `active {last24h, last7d, last30d}`, `platforms {ios, android, unknown}`, `versions [{version, devices}]`, `withPushToken`, `notificationsEnabled`, `withLocation`), `series {days: 60, snapshotsSince, daily [{day, new, total, active24h, pushes}]}`, `pushes {today, last7d, byRank7d {incident, advice, watchAndAct, emergencyWarning}}`, `sources [{region, state, alert, fetchedAt, lastAttemptAt, consecutiveFailures, error, skipped}]` (as `/v1/status`) and `stores {connected: false}`.

Privacy: no push token, device id, install hash, coordinate or anything else per device is returned. An app version on fewer than three devices is counted under `other`, as is everything after the eight most used versions; a value that does not look like a version is counted as `unknown`.

What the numbers mean, and what they do not:

- **Registered devices** are rows in `devices`. The app registers at every start until that has succeeded once (`meldInstallatie` in `mobile/src/push.ts`, called from the first effect in `mobile/App.tsx`), without a push token, before the intro and whatever the answer to the notification question is. So it counts installs that were opened at least once with a connection, not only installs with alerts on. It is not the stores' download figure: an install that was never opened is missing, a simulator does not register, removing the app does not remove the row (nothing deletes devices today), and installing again makes a new device id and counts again.
- **New** today, 7 and 30 days are calendar days in Melbourne with today included, so they add up to the chart. **Active** is by `updated_at` over the last 24 hours, 7 and 30 days: the app sends its settings at every start after the intro and when a setting changes. Coming back from the background does not count, and a device that never finished the intro is never active after its registration.
- **App version** is the version a device had when it registered or last switched alerts on. The settings request carries no version, so an update alone does not change it; this split lags behind the real one.
- **Alerts switched on** is a push token together with `notificationsEnabled` in the filter, read as `push.mjs` reads it (missing means off). A device with only "Emergency Warnings anywhere" is not in it.
- **Alerts sent** counts rows in `push_sent`: one per device, incident and warning level that was handed to Apple, Google or Expo, not what was delivered. Large air tanker alerts are not recorded per device and are missing. `push_sent` keeps 7 days.
- **Daily series**: days are Melbourne days, also across daylight saving. `daily_stats(day, devices_total, devices_new, devices_active_24h, pushes_sent)` gets today's figures at start and every hour (the same row again, so a restart changes nothing), so that history survives when devices are ever removed. Those rows start on the day this shipped: `snapshotsSince` says which day. Earlier days in the chart come from `created_at` of the devices still in the table, and have no `active24h` or `pushes`. Within a day new devices and alerts never go down. If devices are removed, a day's last hour can be undercounted.
