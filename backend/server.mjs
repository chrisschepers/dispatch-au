import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchSource, sources } from './feeds.mjs';
import { skippedByRegion } from './skipped.mjs';
import { appConfig } from './app-config.mjs';
import { IncidentStore } from './store.mjs';
import { PushService } from './push.mjs';
import { renderSite } from './site.mjs';

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

export function createServer(store, push = null) {
  return http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const send = (status, body) => {
      res.writeHead(status);
      res.end(JSON.stringify(body));
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
      if (url.pathname === '/v1/config') {
        res.setHeader('Cache-Control', 'public, max-age=300');
        return send(200, appConfig());
      }
      const site = renderSite(url.pathname, store);
      if (site) {
        res.setHeader('Content-Type', site.type);
        res.setHeader('Cache-Control', site.cache);
        res.writeHead(site.status);
        return res.end(req.method === 'HEAD' ? undefined : site.body);
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
      const result = store.feed(region, hours);
      if (!result)
        return send(503, {
          error: 'Waiting for the first valid source update',
        });
      res.setHeader('Cache-Control', 'public, max-age=15');
      return send(200, result);
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
  const server = createServer(store, push);
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
