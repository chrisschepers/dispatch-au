// What the website pages read: the live store for what is happening now, the
// history (history.mjs) for places and the past. Queries that every crawl of
// a state or place would repeat are kept for a short while.
import { sources } from './feeds.mjs';
import { places, distanceKm } from './places.mjs';

/**
 * Over: off the agency's list, or the agency itself says Safe or Complete
 * (Victoria leaves those listed for a while). Same rule as the app.
 */
export function isOver(r) {
  return (
    !r.listed ||
    /\b(safe|complete|completed|closed)\b/i.test(String(r.status ?? ''))
  );
}

/** Never in public lists or place pages: ambulance calls only count (privacy). */
export const PRIVATE_CATEGORIES = new Set(['ambulance']);

const memos = new WeakMap();
/** fn() at most once per ttl for this store and key. */
export function memo(store, key, ttlMs, fn) {
  if (!memos.has(store)) memos.set(store, new Map());
  const m = memos.get(store);
  const hit = m.get(key);
  const now = Date.now();
  if (hit && now - hit.at < ttlMs) return hit.value;
  const value = fn();
  m.set(key, { at: now, value });
  if (m.size > 2000) m.delete(m.keys().next().value);
  return value;
}

export function currentIncidents(store, region) {
  const feed = store.feed(region, 24);
  if (!feed) return { incidents: [], warnings: [], feed: null };
  return {
    incidents: feed.incidents.filter((i) => i.listed),
    warnings: feed.warnings,
    feed,
  };
}

/** The states we have a feed for, in the site's order. */
export function regionsLive(STATES) {
  return Object.keys(STATES).filter((r) => sources[r]);
}

/** Licence line and last update of a state's source (VicEmergency asks to show the update time). */
export function sourceInfo(store, region) {
  return memo(store, `src:${region}`, 30_000, () => {
    const f = store.feed(region, 24);
    return {
      attribution: f?.attribution || sources[region]?.attribution || '',
      fetchedAt: f?.fetchedAt || null,
      adviceUrl: sources[region]?.adviceUrl || null,
      name: sources[region]?.name || null,
      licenseUrl: sources[region]?.licenseUrl || null,
    };
  });
}

const since = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

/** History rows of one place, newest first. Incidents only, warnings have their own pages. */
export function placeHistory(store, region, slug, days = 90, limit = 200) {
  return store.db
    .prepare(
      `SELECT * FROM history WHERE region=? AND place=? AND kind='incident' AND last_seen>=?
       ORDER BY COALESCE(created, first_seen) DESC LIMIT ?`,
    )
    .all(region, slug, since(days), limit);
}

/** Counts per category for a place over the last `days`. */
export function placeCounts(store, region, slug, days) {
  const rows = store.db
    .prepare(
      `SELECT category, COUNT(*) AS n FROM history
       WHERE region=? AND place=? AND kind='incident' AND last_seen>=? GROUP BY category`,
    )
    .all(region, slug, since(days));
  return Object.fromEntries(rows.map((r) => [r.category, r.n]));
}

/**
 * Places with incidents in the last `days` (ambulance calls left out), with
 * the number and the latest time. For the sitemaps, the A to Z pages and
 * "most active" lists.
 */
export function activePlaces(store, region, days = 90) {
  return memo(store, `places:${region}:${days}`, 300_000, () => {
    const idx = places();
    return store.db
      .prepare(
        `SELECT place, COUNT(*) AS n, MAX(last_seen) AS last,
                SUM(CASE WHEN last_seen>=? THEN 1 ELSE 0 END) AS recent
         FROM history WHERE region=? AND place IS NOT NULL AND kind='incident'
           AND category<>'ambulance' AND last_seen>=?
         GROUP BY place`,
      )
      .all(since(14), region, since(days))
      .map((r) => ({ ...r, info: idx.get(region, r.place) }))
      .filter((r) => r.info);
  });
}

/**
 * Whether a place page is worth indexing: at least two incidents in 90 days,
 * or one in the last 14. Other place pages exist for visitors but are
 * noindex, so search engines do not see thousands of nearly empty pages.
 */
export function placeIndexable(store, region, slug) {
  const p = activePlaces(store, region, 90).find((x) => x.place === slug);
  return !!p && (p.n >= 2 || p.recent >= 1);
}

/** Listed incidents within `km` of a point, nearest first (ambulance calls left out). */
export function activeNear(store, lat, lon, km, region = null) {
  const all = memo(store, 'active-all', 30_000, () =>
    store.db
      .prepare(
        `SELECT * FROM history WHERE listed=1 AND kind='incident' AND lat IS NOT NULL
           AND category<>'ambulance'`,
      )
      .all(),
  );
  return all
    .filter((r) => (!region || r.region === region) && !isOver(r))
    .map((r) => ({ ...r, km: distanceKm([lat, lon], [r.lat, r.lon]) }))
    .filter((r) => r.km <= km)
    .sort((a, b) => a.km - b.km);
}

/**
 * The map's data: incidents that are listed now, or ended within `hours`,
 * as compact rows. Ambulance calls are left out of the public map.
 */
export function mapRows(store, hours = 24) {
  return memo(store, `map:${hours}`, 30_000, () => {
    const rows = store.db
      .prepare(
        `SELECT id, region, category, title, location, place, lat, lon, status, level, listed,
                COALESCE(created, first_seen) AS t, last_seen
         FROM history WHERE kind='incident' AND lat IS NOT NULL AND category<>'ambulance'
           AND (listed=1 OR last_seen>=?)`,
      )
      .all(new Date(Date.now() - hours * 3_600_000).toISOString());
    return rows;
  });
}
