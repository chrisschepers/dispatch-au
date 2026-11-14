import http from 'node:http';
import { gzipSync, brotliCompressSync, constants as zlib } from 'node:zlib';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchSource, sources } from './feeds.mjs';
import { skippedByRegion } from './skipped.mjs';
import { appConfig } from './app-config.mjs';
import { IncidentStore } from './store.mjs';
import { PushService } from './push.mjs';
import { renderSite, STATES } from './site.mjs';
import { AircraftService, trackingOn } from './aircraft.mjs';
import { VesselService } from './vessels.mjs';
import { Articles } from './articles.mjs';
import { mapData } from './site-map.mjs';
import { places } from './places.mjs';
import { Dashboard } from './dashboard.mjs';
import { DASHBOARD_CSP, DASHBOARD_HTML } from './dashboard-page.mjs';

// Device routes for push alerts (docs/PUSH-API.md). Small JSON bodies only.
function readJson(req, limit = 8192) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new RangeError('Body too large'));
        req.destroy();
        return;
      }
      parts.push(c);
    });
    req.on('end', () => {
      try {
        resolve(
          parts.length ? JSON.parse(Buffer.concat(parts).toString('utf8')) : {},
        );
      } catch {
        reject(new SyntaxError('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

async function deviceRoute(req, url, push, send) {
  if (url.pathname === '/v1/devices/register' && req.method === 'POST') {
    const body = await readJson(req);
    return send(200, { data: push.register(body) });
  }
  const m = url.pathname.match(/^\/v1\/devices\/([0-9a-f-]{36})\/filter$/);
  if (m && req.method === 'PATCH') {
    if (!push.authorised(m[1], req.headers['x-install-token']))
      return send(401, { error: 'Unknown device' });
    const body = await readJson(req);
    return push.setFilter(m[1], body)
      ? send(200, { ok: true })
      : send(404, { error: 'Unknown device' });
  }
  return send(404, { error: 'Not found' });
}

/**
 * The encoding a client accepts: Brotli, gzip or none. "br;q=0" means not
 * acceptable, so the q-values count.
 */
export function chooseEncoding(header) {
  const accepted = new Map();
  for (const part of String(header || '').split(',')) {
    const [name, ...params] = part.trim().toLowerCase().split(';');
    if (!name) continue;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    accepted.set(name, q ? Number(q.slice(2)) : 1);
  }
  const ok = (n) => (accepted.get(n) ?? accepted.get('*') ?? 0) > 0;
  return ok('br') ? 'br' : ok('gzip') ? 'gzip' : null;
}

const encoders = {
  br: (buf) =>
    brotliCompressSync(buf, { params: { [zlib.BROTLI_PARAM_QUALITY]: 5 } }),
  gzip: (buf) => gzipSync(buf, { level: 6 }),
};

/**
 * gzip or Brotli for text responses over 1 KB when the client accepts it.
 * The app's feed is up to 3 MB of JSON, the pages tens of KB of HTML; both
 * shrink to about a tenth to a fifth. Brotli at quality 5 keeps it fast.
 * Sets the headers also for HEAD (then without a body). `memo` (optional)
 * keeps the compressed bytes per encoding for the same body.
 */
function encode(req, res, body, memo = null) {
  res.setHeader('Vary', 'Accept-Encoding');
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
  const enc =
    buf.length >= 1024 ? chooseEncoding(req.headers['accept-encoding']) : null;
  if (enc) res.setHeader('Content-Encoding', enc);
  if (req.method === 'HEAD') return undefined;
  if (!enc) return buf;
  if (!memo) return encoders[enc](buf);
  memo[enc] ??= encoders[enc](buf);
  return memo[enc];
}

/** Rendered pages for a minute, so a crawler going through hundreds of places costs little. */
const PAGE_CACHE_MS = 60_000;
/**
 * The app's feed, serialised and compressed, until the next accepted update
 * and at most 15 s (its max-age): "stale" in it depends on the clock too.
 */
const FEED_CACHE_MS = 15_000;

export function createServer(
  store,
  push = null,
  aircraft = null,
  articles = null,
  vessels = null,
  dashboard = null,
) {
  const news = articles ?? new Articles(store.db);
  const pageCache = new Map();
  const feedCache = new Map();
  return http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const send = (status, body) => {
      // Encode first: it sets headers, which must happen before writeHead.
      const out = encode(req, res, JSON.stringify(body));
      res.writeHead(status);
      res.end(out);
    };
    if (req.method === 'OPTIONS') {
      res.setHeader(
        'Access-Control-Allow-Methods',
        'GET, HEAD, POST, PATCH, OPTIONS',
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, x-install-token',
      );
      res.writeHead(204);
      return res.end();
    }
    const url = new URL(req.url, 'http://localhost');
    if (push && url.pathname.startsWith('/v1/devices')) {
      res.setHeader('Cache-Control', 'no-store');
      deviceRoute(req, url, push, send).catch((error) => {
        send(
          error instanceof RangeError || error instanceof SyntaxError
            ? 400
            : 500,
          { error: 'Invalid request' },
        );
      });
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method))
      return send(405, { error: 'Method not allowed' });
    try {
      if (url.pathname === '/health') return send(200, { ok: true });
      // Owner dashboard (dashboard.mjs): a page without data, and the counts
      // behind a key. Both are 404 until ADMIN_KEY is set, and neither is
      // for other websites to read.
      if (url.pathname === '/dashboard' || url.pathname === '/v1/admin/stats') {
        if (!dashboard?.key()) return send(404, { error: 'Not found' });
        res.removeHeader('Access-Control-Allow-Origin');
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Robots-Tag', 'noindex, nofollow');
        res.setHeader('Referrer-Policy', 'no-referrer');
        if (url.pathname === '/dashboard') {
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.setHeader('Content-Security-Policy', DASHBOARD_CSP);
          res.setHeader('X-Frame-Options', 'DENY');
          const out = encode(req, res, DASHBOARD_HTML);
          res.writeHead(200);
          return res.end(out);
        }
        // Who is guessing: the last hop in X-Forwarded-For (the one a proxy
        // adds itself, where a caller can only put names in front), or the
        // socket without a proxy. Only used to slow down wrong keys.
        const client =
          String(req.headers['x-forwarded-for'] ?? '')
            .split(',')
            .pop()
            .trim() ||
          req.socket.remoteAddress ||
          'unknown';
        const verdict = dashboard.check(req.headers['x-admin-key'], client);
        if (verdict === 'limited') {
          res.setHeader('Retry-After', '300');
          return send(429, { error: 'Too many attempts' });
        }
        if (verdict !== 'ok') return send(401, { error: 'Unauthorised' });
        const stats = dashboard.stats();
        return stats
          ? send(200, stats)
          : send(503, { error: 'Statistics unavailable' });
      }
      // Firefighting, rescue, police and medical aircraft (aircraft.mjs).
      // Every call counts as someone looking at the layer, so never cached.
      if (url.pathname === '/v1/aircraft') {
        res.setHeader('Cache-Control', 'no-store');
        if (!aircraft)
          return send(503, { error: 'Aircraft layer unavailable' });
        return send(200, aircraft.request());
      }
      // Flights of one aircraft, and the firefighting aircraft working on an
      // incident (flights.mjs). Reading these does not count as viewing.
      const air = url.pathname.match(
        /^\/v1\/(?:aircraft\/([0-9a-f]{6})\/flights|incidents\/([^/]{1,160})\/aircraft)$/,
      );
      if (air) {
        if (!aircraft)
          return send(503, { error: 'Aircraft layer unavailable' });
        res.setHeader('Cache-Control', 'public, max-age=30');
        if (air[2]) {
          let id;
          try {
            id = decodeURIComponent(air[2]);
          } catch {
            return send(400, { error: 'Invalid incident' });
          }
          return send(200, aircraft.incidentAircraft(id));
        }
        const flights = aircraft.flightsOf(air[1]);
        return flights
          ? send(200, flights)
          : send(404, { error: 'Unknown aircraft' });
      }
      // Rescue, police and fire vessels (vessels.mjs). The list counts as
      // someone looking at the layer, so it is never cached.
      if (url.pathname.startsWith('/v1/vessels')) {
        if (!vessels) return send(503, { error: 'Vessel layer unavailable' });
        if (url.pathname === '/v1/vessels') {
          res.setHeader('Cache-Control', 'no-store');
          return send(200, vessels.request());
        }
        const m = url.pathname.match(/^\/v1\/vessels\/(\d{9})\/trips$/);
        const trips = m && vessels.tripsOf(Number(m[1]));
        if (!trips) return send(404, { error: 'Not found' });
        res.setHeader('Cache-Control', 'public, max-age=30');
        return send(200, trips);
      }
      if (url.pathname === '/v1/config') {
        res.setHeader('Cache-Control', 'public, max-age=300');
        return send(200, appConfig());
      }
      // The website's map (site-map.mjs): active and recently ended incidents.
      if (url.pathname === '/v1/map') {
        const hours = Number(url.searchParams.get('hours') || 24);
        if (![24, 72].includes(hours))
          return send(400, { error: 'Invalid time window' });
        res.setHeader('Cache-Control', 'public, max-age=30');
        return send(200, mapData(store, news, hours));
      }
      // One address per page: no trailing slash, lower case, no double
      // slashes. The last also keeps a path that normalises to "//host"
      // ("/a/..//evil.com/") from becoming a redirect to another site.
      if (!url.pathname.startsWith('/v1/') && url.pathname !== '/') {
        const clean =
          url.pathname
            .replace(/\/{2,}/g, '/')
            .replace(/\/+$/, '')
            .toLowerCase() || '/';
        if (clean !== url.pathname) {
          res.setHeader('Location', clean + url.search);
          res.setHeader('Cache-Control', 'public, max-age=3600');
          res.writeHead(301);
          return res.end();
        }
      }
      const cached = pageCache.get(url.pathname);
      const site =
        cached && Date.now() - cached.at < PAGE_CACHE_MS
          ? cached.site
          : renderSite(url.pathname, store, news);
      if (site) {
        if (!cached || cached.site !== site) {
          pageCache.set(url.pathname, { at: Date.now(), site });
          if (pageCache.size > 800)
            pageCache.delete(pageCache.keys().next().value);
        }
        res.setHeader('Content-Type', site.type);
        res.setHeader('Cache-Control', site.cache);
        const text = /^(text|application\/(xml|json))/.test(site.type);
        // Compressed bytes are kept with the cached page.
        site.encoded ??= {};
        const body = text
          ? encode(req, res, site.body, site.encoded)
          : req.method === 'HEAD'
            ? undefined
            : site.body;
        res.writeHead(site.status);
        return res.end(body);
      }
      if (url.pathname === '/v1/status' || url.pathname === '/health/ready') {
        const checkedAt = new Date().toISOString();
        const health = Object.keys(sources).map((r) => ({
          ...store.health(r, Date.parse(checkedAt)),
          // Records the last snapshot skipped instead of failing the state.
          skipped: skippedByRegion.get(r) ?? null,
        }));
        const ok = health.every((s) => !s.stale);
        res.setHeader('Cache-Control', 'no-store');
        return send(url.pathname === '/health/ready' && !ok ? 503 : 200, {
          ok,
          checkedAt,
          sources: health,
        });
      }
      if (url.pathname !== '/v1/feed') return send(404, { error: 'Not found' });
      const region = url.searchParams.get('region') || 'vic';
      const hours = Number(url.searchParams.get('hours') || 24);
      if (
        (region !== 'au' && !Object.hasOwn(sources, region)) ||
        ![24, 72, 168].includes(hours)
      )
        return send(400, { error: 'Invalid region or time window' });
      const key = `${region}|${hours}`;
      let hit = feedCache.get(key);
      if (
        !hit ||
        hit.version !== store.version ||
        Date.now() - hit.at > FEED_CACHE_MS
      ) {
        const result = store.feed(region, hours);
        if (!result)
          return send(503, {
            error: 'Waiting for the first valid source update',
          });
        hit = {
          version: store.version,
          at: Date.now(),
          json: Buffer.from(JSON.stringify(result)),
          encoded: {},
        };
        feedCache.set(key, hit);
      }
      res.setHeader('Cache-Control', 'public, max-age=15');
      const out = encode(req, res, hit.json, hit.encoded);
      res.writeHead(200);
      return res.end(out);
    } catch {
      return send(500, { error: 'Feed temporarily unavailable' });
    }
  });
}

async function main() {
  const path = process.env.DATABASE_PATH || './data/incidents.sqlite';
  mkdirSync(dirname(path), { recursive: true });
  const store = new IncidentStore(path);
  const push = new PushService(store.db);
  // News articles for significant incidents (articles.mjs), checked every
  // five minutes and once at start.
  const articles = new Articles(store.db);
  const refreshArticles = () => {
    try {
      const created = articles.refresh({
        placeName: (region, slug) =>
          (slug ? places().get(region, slug)?.name : null) ?? null,
        tz: (region) => STATES[region]?.tz ?? 'Australia/Sydney',
        started: store.history?.started() ?? null,
      });
      if (created)
        console.log(JSON.stringify({ articles: 'created', n: created }));
    } catch (error) {
      console.warn(
        JSON.stringify({
          articles: 'failed',
          error: String(error).slice(0, 160),
        }),
      );
    }
  };
  refreshArticles();
  setInterval(refreshArticles, 5 * 60_000).unref();
  const aircraft = new AircraftService({
    db: store.db,
    activeFires: () =>
      (store.feed('au', 24)?.incidents ?? []).filter((i) => i.listed),
    // Flights, fire links and take-offs (flights.mjs); AIRCRAFT_TRACKING=off
    // goes back to polling only while someone looks.
    tracking: trackingOn(),
    // Large air tanker on its way: only sent with AIR_TANKER_PUSH on.
    onEvent: (event) =>
      event.type === 'air-tanker' ? push.airTanker(event) : null,
  });
  // Rescue and police vessels; also polls slowly when nobody looks, for trips.
  const vessels = new VesselService({ db: store.db });
  setInterval(() => void vessels.tick(), 30_000).unref();
  void vessels.tick();
  // Owner dashboard: the day's figures go to daily_stats at start and every
  // hour, so the history survives devices that are removed later.
  const dashboard = new Dashboard(store.db, { store });
  const snapshot = () => {
    try {
      dashboard.snapshot();
    } catch (error) {
      console.warn(
        JSON.stringify({
          dashboard: 'snapshot failed',
          error: String(error).slice(0, 160),
        }),
      );
    }
  };
  snapshot();
  setInterval(snapshot, 3600_000).unref();
  const server = createServer(
    store,
    push,
    aircraft,
    articles,
    vessels,
    dashboard,
  );
  // Keeps the 3-minute rhythm while someone has the layer open.
  setInterval(() => void aircraft.tick(), 30_000).unref();
  // Rebuilds the fleet from NAFC and the aircraft lists once a day.
  setInterval(() => void aircraft.refreshFleetIfDue(), 15 * 60_000).unref();
  let stopping = false;
  const timers = new Set();
  const collect = async (region) => {
    try {
      const feed = await fetchSource(region);
      skippedByRegion.set(
        region,
        feed.skipped ? { ...feed.skipped, at: new Date().toISOString() } : null,
      );
      if (!stopping) {
        const accepted = store.ingest(region, feed);
        // Alerts after a successful ingest. A push failure must never stop
        // the collector, so it is logged and left.
        if (accepted) {
          await push.process(region, feed).catch((error) => {
            console.warn(
              JSON.stringify({
                region,
                push: 'failed',
                error: String(error).slice(0, 160),
              }),
            );
          });
        }
        console.log(
          JSON.stringify({
            region,
            accepted,
            incidents: feed.incidents.length,
            warnings: feed.warnings.length,
            skipped: feed.skipped?.count || 0,
            at: new Date().toISOString(),
          }),
        );
      }
    } catch (error) {
      if (!stopping) {
        const reason =
          error instanceof Error
            ? error.message.slice(0, 160)
            : 'Source unavailable';
        store.fail(region, reason);
        console.warn(
          JSON.stringify({
            region,
            error: reason,
            at: new Date().toISOString(),
          }),
        );
      }
    } finally {
      if (!stopping) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          void collect(region);
        }, sources[region].interval);
        timers.add(timer);
      }
    }
  };
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0');
  for (const region of Object.keys(sources)) void collect(region);
  const stop = () => {
    stopping = true;
    for (const timer of timers) clearTimeout(timer);
    server.close(() => {
      store.close();
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 20000).unref();
  };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  void main();
