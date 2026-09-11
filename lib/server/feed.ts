import { normalizeFeed, type Feed } from '../incidents';
import { db } from './database';
const SOURCE = 'https://emergency.vic.gov.au/public/events-geojson.json';
let pending: Promise<Feed> | null = null;
async function load(): Promise<Feed> {
  const database = db();
  const now = Date.now();
  const cache = await database
    .prepare(
      'SELECT payload, fetched_at, retry_after FROM feed_cache WHERE key = ?',
    )
    .bind('victoria')
    .first<{ payload: string; fetched_at: number; retry_after: number }>();
  if (cache && now - cache.fetched_at < 60000)
    return JSON.parse(cache.payload) as Feed;
  if (cache && cache.retry_after > now)
    return {
      ...JSON.parse(cache.payload),
      stale: true,
      error:
        'The source is temporarily unavailable. Showing the last successful update.',
    };
  try {
    const response = await fetch(SOURCE, {
      headers: {
        Accept: 'application/geo+json, application/json',
        'User-Agent':
          'DispatchVictoria/0.1 (+https://github.com/chrisschepers/dispatch-au)',
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw Error('Source unavailable');
    const text = await response.text();
    if (text.length > 6000000) throw Error('Unexpected source size');
    const feed = normalizeFeed(JSON.parse(text));
    await database
      .prepare(
        'INSERT INTO feed_cache (key,payload,fetched_at,retry_after) VALUES (?,?,?,0) ON CONFLICT(key) DO UPDATE SET payload=excluded.payload,fetched_at=excluded.fetched_at,retry_after=0',
      )
      .bind('victoria', JSON.stringify(feed), now)
      .run();
    return feed;
  } catch (error) {
    if (cache) {
      await database
        .prepare('UPDATE feed_cache SET retry_after=? WHERE key=?')
        .bind(now + 60000, 'victoria')
        .run();
      return {
        ...JSON.parse(cache.payload),
        stale: true,
        error:
          'The source is temporarily unavailable. Showing the last successful update.',
      };
    }
    throw error;
  }
}
export function getFeed(): Promise<Feed> {
  if (!pending)
    pending = load().finally(() => {
      pending = null;
    });
  return pending;
}
