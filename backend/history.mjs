// The history of every incident, for the website (wish Chris 09-11-2026).
//
// The live store keeps an ended incident for 7 days and holds whole payloads
// (with fire polygons). Place pages show the last months and articles a
// timeline, so this keeps compact rows for KEEP_DAYS, plus one event for every
// change of status or warning level, and for the moment an incident left the
// agency's list ("ended"). Rows that an article refers to are kept longer.
//
// It runs inside the store's ingest transaction, every minute for some
// states, so every query here must use an index (history_listed for what is
// listed now); review 09-11 measured 5 to 20 s per ingest at 400 days without.
import { places } from './places.mjs';

export const KEEP_DAYS = 400;

const LEVELS = { advice: 1, 'watch and act': 2, 'emergency warning': 3 };

/** 3 = Emergency Warning, 2 = Watch and Act, 1 = Advice, 0 = none. */
export function levelRank(level) {
  const l = String(level ?? '').toLowerCase();
  for (const [k, v] of Object.entries(LEVELS).reverse())
    if (l.includes(k)) return v;
  return 0;
}

/**
 * Never listed on public pages, only counted: ambulance calls (ACT) and the
 * medical calls NSW RFS attends. They are about someone's health.
 */
export function isPrivate(row) {
  return (
    row.category === 'ambulance' ||
    /^\s*medical\s*$|ambulance|cardiac|patient/i.test(String(row.title ?? ''))
  );
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** The incident's own point, or for a warning the point of its area. */
function pointOf(r) {
  for (const p of [r.point, r.areaPoint])
    if (Array.isArray(p) && p.length === 2 && p.every(Number.isFinite))
      return p;
  return null;
}

export class History {
  constructor(db, placeIndex = places()) {
    this.db = db;
    this.places = placeIndex;
    db.exec(`CREATE TABLE IF NOT EXISTS history(
        id TEXT PRIMARY KEY, region TEXT NOT NULL, kind TEXT NOT NULL,
        category TEXT NOT NULL, title TEXT NOT NULL, location TEXT NOT NULL,
        place TEXT, lat REAL, lon REAL, agency TEXT, status TEXT, level TEXT,
        max_level INTEGER NOT NULL DEFAULT 0, resources INTEGER,
        max_resources INTEGER, size_ha REAL, action TEXT, details TEXT,
        private INTEGER NOT NULL DEFAULT 0, created TEXT,
        first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, listed INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS history_place ON history(region, place, last_seen);
      CREATE INDEX IF NOT EXISTS history_seen ON history(last_seen);
      CREATE INDEX IF NOT EXISTS history_region_seen ON history(region, last_seen);
      CREATE INDEX IF NOT EXISTS history_listed ON history(region) WHERE listed=1;
      CREATE INDEX IF NOT EXISTS history_start ON history(region, COALESCE(created, first_seen));
      CREATE TABLE IF NOT EXISTS history_events(
        id TEXT NOT NULL, at TEXT NOT NULL, status TEXT, level TEXT,
        resources INTEGER, listed INTEGER NOT NULL, PRIMARY KEY(id, at));
      CREATE TABLE IF NOT EXISTS history_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    this.q = {
      get: db.prepare(
        'SELECT status, level, max_level, max_resources, size_ha, listed FROM history WHERE id=?',
      ),
      put: db.prepare(`INSERT INTO history VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET category=excluded.category, title=excluded.title,
          location=excluded.location, place=excluded.place, lat=excluded.lat, lon=excluded.lon,
          agency=excluded.agency, status=excluded.status, level=excluded.level,
          max_level=excluded.max_level, resources=excluded.resources,
          max_resources=excluded.max_resources, size_ha=excluded.size_ha,
          action=excluded.action, details=excluded.details, private=excluded.private,
          created=excluded.created, last_seen=excluded.last_seen, listed=1`),
      event: db.prepare(
        'INSERT OR IGNORE INTO history_events VALUES(?,?,?,?,?,?)',
      ),
      listed: db.prepare(
        'SELECT id FROM history INDEXED BY history_listed WHERE region=? AND listed=1',
      ),
      end: db.prepare('UPDATE history SET listed=0 WHERE id=?'),
    };
    this.lastPrune = 0;
  }

  /** When the history began (the first backfill), as ISO time, or null. */
  started() {
    return (
      this.db
        .prepare("SELECT value FROM history_meta WHERE key='started'")
        .get()?.value ?? null
    );
  }

  #values(r, region, prior, now, firstSeen, listed) {
    const point = pointOf(r);
    const place = this.places.match(region, r.location, point);
    const resources = num(r.resources);
    const size = num(r.sizeHa);
    const max = (a, b) => (a == null ? b : b == null ? a : Math.max(a, b));
    return [
      r.id,
      region,
      r.kind === 'warning' ? 'warning' : 'incident',
      r.category || 'other',
      String(r.title || '').slice(0, 300),
      String(r.location || '').slice(0, 300),
      place?.slug ?? null,
      point ? point[0] : (place?.lat ?? null),
      point ? point[1] : (place?.lon ?? null),
      r.agency || null,
      r.status || null,
      r.level || null,
      Math.max(levelRank(r.level), prior?.max_level ?? 0),
      resources,
      max(prior?.max_resources ?? null, resources),
      max(prior?.size_ha ?? null, size),
      typeof r.action === 'string' ? r.action.slice(0, 2000) : null,
      typeof r.text === 'string' ? r.text.slice(0, 2000) : null,
      isPrivate(r) ? 1 : 0,
      r.created || null,
      firstSeen,
      now,
      listed,
    ];
  }

  /**
   * One accepted source update. `rows` are the incidents and warnings as the
   * live store keeps them (ids already canonical); `now` is the update time.
   * Runs inside the store's transaction.
   */
  record(region, rows, now) {
    const seen = new Set();
    for (const r of rows) {
      seen.add(r.id);
      const prior = this.q.get.get(r.id);
      // first_seen is kept on update: the upsert never touches it.
      this.q.put.run(...this.#values(r, region, prior, now, now, 1));
      // Events only for what a reader follows: the status and the warning
      // level. Resource counts change all the time (Victoria every minute)
      // and would fill the table.
      if (!prior) {
        this.q.event.run(
          r.id,
          r.created || now,
          r.status || null,
          r.level || null,
          num(r.resources),
          1,
        );
      } else if (
        prior.status !== (r.status || null) ||
        prior.level !== (r.level || null) ||
        !prior.listed
      ) {
        this.q.event.run(
          r.id,
          now,
          r.status || null,
          r.level || null,
          num(r.resources),
          1,
        );
      }
    }
    // Off the list since the previous update. It ended somewhere between the
    // last time we saw it and now; "now" is the first moment we know it, and
    // never collides with the last status change.
    for (const { id } of this.q.listed.all(region)) {
      if (seen.has(id)) continue;
      this.q.end.run(id);
      this.q.event.run(id, now, 'Ended', null, null, 0);
    }
    this.prune(now);
  }

  /**
   * Drops what is older than KEEP_DAYS, at most once an hour. Incidents with
   * an article stay, so the article keeps its facts; weekly overviews of
   * pruned weeks go, they would count nothing.
   */
  prune(now) {
    const t = Date.parse(now);
    if (!Number.isFinite(t) || t - this.lastPrune < 3_600_000) return;
    this.lastPrune = t;
    const cutoff = new Date(t - KEEP_DAYS * 86_400_000).toISOString();
    const hasArticles = !!this.db
      .prepare(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='articles'",
      )
      .get();
    const keep = hasArticles
      ? "AND id NOT IN (SELECT ref FROM articles WHERE kind='incident')"
      : '';
    this.db
      .prepare(
        `DELETE FROM history_events WHERE id IN (SELECT id FROM history WHERE last_seen<? ${keep})`,
      )
      .run(cutoff);
    this.db
      .prepare(`DELETE FROM history WHERE last_seen<? ${keep}`)
      .run(cutoff);
    if (hasArticles)
      this.db
        .prepare("DELETE FROM articles WHERE kind='week' AND published<?")
        .run(cutoff);
  }

  /**
   * Fills an empty history from what the live store still has (the last 7
   * days), so the place pages start with a week instead of nothing. One
   * transaction: thousands of autocommits on a network volume are slow.
   */
  backfill() {
    if (this.db.prepare('SELECT 1 FROM history LIMIT 1').get()) return 0;
    const rows = this.db
      .prepare('SELECT * FROM incidents ORDER BY first_seen')
      .all();
    const started = rows[0]?.first_seen ?? new Date().toISOString();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const rec of rows) {
        const r = JSON.parse(rec.payload);
        this.q.put.run(
          ...this.#values(
            r,
            rec.region,
            null,
            rec.last_seen,
            rec.first_seen,
            rec.listed,
          ),
        );
        this.q.event.run(
          rec.id,
          r.created || rec.first_seen,
          r.status || null,
          r.level || null,
          num(r.resources),
          1,
        );
        if (!rec.listed)
          this.q.event.run(rec.id, rec.last_seen, 'Ended', null, null, 0);
      }
      this.db
        .prepare("INSERT OR IGNORE INTO history_meta VALUES('started', ?)")
        .run(started);
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
    return rows.length;
  }
}
