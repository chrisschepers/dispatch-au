// What the website pages read: the live store for what is happening now, the
// history (history.mjs) for places and the past. Queries that every crawl of
// a state or place would repeat are kept for a short while, and every query
// names its index: the history grows to about 300k rows (review 09-11).
import { sources } from './feeds.mjs';
import { places, distanceKm } from './places.mjs';
import { isPrivate } from './history.mjs';

export { isPrivate };

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

/**
 * Who to credit for the data on a page: per state the licence line, the
 * licence link and when we last received data (VicEmergency asks for that
 * time next to its data; CC BY asks for the credit).
 */
export function credits(store, regions) {
  return regions
    .filter((r) => sources[r])
    .map((r) =>
      memo(store, `credit:${r}`, 30_000, () => {
        const f = store.feed(r, 24);
        return {
          region: r,
          name: sources[r].name,
          attribution: f?.attribution || sources[r].attribution || '',
          licenseUrl: sources[r].licenseUrl || null,
          adviceUrl: sources[r].adviceUrl || null,
          fetchedAt: f?.fetchedAt || null,
        };
      }),
    );
}

/** Licence line and last update of one state's source. */
export function sourceInfo(store, region) {
  return (
    credits(store, [region])[0] ?? {
      attribution: '',
      fetchedAt: null,
      adviceUrl: null,
      name: null,
      licenseUrl: null,
    }
  );
}

const since = (days) => new Date(Date.now() - days * 86_400_000).toISOString();

/** Public history rows of one place, newest first. Incidents only; warnings have their own pages. */
export function placeHistory(store, region, slug, days = 90, limit = 200) {
  return store.db
    .prepare(
      `SELECT * FROM history INDEXED BY history_place
       WHERE region=? AND place=? AND last_seen>=? AND kind='incident' AND private=0
       ORDER BY COALESCE(created, first_seen) DESC LIMIT ?`,
    )
    .all(region, slug, since(days), limit);
}

/** Private calls (ambulance, medical) in a place: counted, never listed. */
export function placePrivateCount(store, region, slug, days = 90) {
  return store.db
    .prepare(
      `SELECT COUNT(*) AS n FROM history INDEXED BY history_place
       WHERE region=? AND place=? AND last_seen>=? AND kind='incident' AND private=1`,
    )
    .get(region, slug, since(days)).n;
}

/** Public counts per category for a place over the last `days`. */
export function placeCounts(store, region, slug, days) {
  const rows = store.db
    .prepare(
      `SELECT category, COUNT(*) AS n FROM history INDEXED BY history_place
       WHERE region=? AND place=? AND last_seen>=? AND kind='incident' AND private=0
       GROUP BY category`,
    )
    .all(region, slug, since(days));
  return Object.fromEntries(rows.map((r) => [r.category, r.n]));
}

/**
 * Places with public incidents in the last `days`, with the number, how many
 * are active now and the latest time. For the sitemaps, the A to Z pages and
 * "busiest" lists.
 */
export function activePlaces(store, region, days = 90) {
  return memo(store, `places:${region}:${days}`, 300_000, () => {
    const idx = places();
    return store.db
      .prepare(
        `SELECT place, COUNT(*) AS n, MAX(last_seen) AS last, SUM(listed) AS active
         FROM history INDEXED BY history_region_seen
         WHERE region=? AND last_seen>=? AND place IS NOT NULL AND kind='incident' AND private=0
         GROUP BY place`,
      )
      .all(region, since(days))
      .map((r) => ({ ...r, info: idx.get(region, r.place) }))
      .filter((r) => r.info);
  });
}

/**
 * Whether a place page is worth indexing: three incidents in 90 days, or one
 * that is active now. Other place pages exist for visitors but are noindex,
 * so search engines do not see thousands of nearly empty pages.
 */
export function placeIndexable(store, region, slug) {
  const p = activePlaces(store, region, 90).find((x) => x.place === slug);
  return !!p && (p.n >= 3 || p.active >= 1);
}

/** Public incidents listed now, for every state (30 s). */
function listedNow(store) {
  return memo(store, 'listed-now', 30_000, () =>
    store.db
      .prepare(
        `SELECT * FROM history INDEXED BY history_listed
         WHERE listed=1 AND kind='incident' AND lat IS NOT NULL AND private=0`,
      )
      .all(),
  );
}

/** Active public incidents within `km` of a point, nearest first. */
export function activeNear(store, lat, lon, km, region = null) {
  return listedNow(store)
    .filter((r) => (!region || r.region === region) && !isOver(r))
    .map((r) => ({ ...r, km: distanceKm([lat, lon], [r.lat, r.lon]) }))
    .filter((r) => r.km <= km)
    .sort((a, b) => a.km - b.km);
}

/**
 * The map's data: incidents that are listed now, or ended within `hours`.
 * Two queries, each on its own index; one with OR scans the whole history.
 */
export function mapRows(store, hours = 24) {
  return memo(store, `map:${hours}`, 30_000, () => {
    const cols = `id, region, category, title, location, place, lat, lon, status, level, listed,
                  COALESCE(created, first_seen) AS t, last_seen`;
    const live = store.db
      .prepare(
        `SELECT ${cols} FROM history INDEXED BY history_listed
         WHERE listed=1 AND kind='incident' AND lat IS NOT NULL AND private=0`,
      )
      .all();
    const ended = store.db
      .prepare(
        `SELECT ${cols} FROM history INDEXED BY history_seen
         WHERE last_seen>=? AND listed=0 AND kind='incident' AND lat IS NOT NULL AND private=0`,
      )
      .all(new Date(Date.now() - hours * 3_600_000).toISOString());
    return [...live, ...ended];
  });
}
