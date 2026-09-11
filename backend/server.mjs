import http from 'node:http';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { fetchSource, sources } from './feeds.mjs';
import { IncidentStore } from './store.mjs';

export function createServer(store) {
  return http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Access-Control-Allow-Origin', '*');
    const send = (status, body) => {
      res.writeHead(status);
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.writeHead(204);
      return res.end();
    }
    if (!['GET', 'HEAD'].includes(req.method))
      return send(405, { error: 'Method not allowed' });
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/health') return send(200, { ok: true });
      if (url.pathname === '/v1/status')
        return send(200, {
          sources: Object.keys(sources).map((region) => {
            const f = store.feed(region);
            return {
              region,
              ready: !!f,
              stale: f?.stale ?? true,
              fetchedAt: f?.fetchedAt ?? null,
            };
          }),
        });
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
  const server = createServer(store);
  let stopping = false;
  const timers = new Set();
  const collect = async (region) => {
    try {
      const feed = await fetchSource(region);
      if (!stopping) {
        const accepted = store.ingest(region, feed);
        console.log(
          JSON.stringify({
            region,
            accepted,
            incidents: feed.incidents.length,
            warnings: feed.warnings.length,
            at: new Date().toISOString(),
          }),
        );
      }
    } catch {
      if (!stopping) {
        store.fail(region, 'Could not update the official source');
        console.warn(JSON.stringify({ region, error: 'Source unavailable' }));
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
