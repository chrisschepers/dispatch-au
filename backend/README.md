# Dispatch incident collector

Standalone public read-only API for the native preview. This is separate from the Sites web application's authenticated Worker. No accounts, payments or push delivery are provided here.

- Node 24, `npm ci`, `npm test`, `npm start` inside `backend`.
- Root `Dockerfile` deploys only the collector and the shared incident parser.
- `PORT=8080`, `DATABASE_PATH=/data/incidents.sqlite`; mount a persistent Railway volume at `/data`.
- Run one replica with serverless sleeping disabled. Each region polls independently, 60 seconds after its previous attempt completes. Failed/invalid/stale snapshots cannot erase the last good records.
- `/health` checks process availability. `/v1/status` separately reports source readiness/freshness.
- `/v1/feed?region=vic|act&hours=24|72|168` returns current records plus records last seen within the selected window. History starts with the first successful collection; it is not a backfill. Removed records retain the last known source status. Only currently listed warnings are returned.
- Seven days of unlisted records are retained. Source failure pauses cleanup until the next valid snapshot. `firstSeen` and `lastSeen` describe our observations, not an incident's start or resolution.
- Data collection and client filtering do not send the user's location to the server. Traffic metadata may still be processed by the hosting platform.

Deployment: Railway project `Dispatch` (`dac3e80e-868b-491f-99ac-a2869cb171a2`), service `incident-feed` (`b0d3c424-2010-4f58-b8ba-80e0a37f9683`), volume `incident-feed-volume` at `/data`. Endpoint: https://incident-feed-production.up.railway.app . Deploy from repository root using `railway up --service incident-feed --detach`; inspect deployment state and `/v1/status` after deploying.

See `../docs/CFSSCAN-EN-MEER-MELDINGEN-2026-09-11.md` for source provenance, limitations and the next Victoria road-data integration. CFSScan is not a source in this service. The native mobile preview consumes this endpoint; the existing Sites web preview is unchanged.
