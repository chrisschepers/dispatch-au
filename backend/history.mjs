// The history of every incident, for the website (wish Chris 09-11-2026).
//
// The live store keeps an ended incident for 7 days and holds whole payloads
// (with fire polygons). Place pages show the last months and articles a
// timeline, so this keeps compact rows for KEEP_DAYS, plus one event for every
// change of status, warning level or resources, and for the moment an
// incident left the agency's list ("ended").
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
        max_level INTEGER NOT NULL DEFAULT 0, resources INTEGER, size_ha REAL,
        action TEXT, details TEXT, created TEXT, first_seen TEXT NOT NULL,
        last_seen TEXT NOT NULL, listed INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS history_place ON history(region, place, last_seen);
      CREATE INDEX IF NOT EXISTS history_seen ON history(last_seen);
      CREATE TABLE IF NOT EXISTS history_events(
        id TEXT NOT NULL, at TEXT NOT NULL, status TEXT, level TEXT,
        resources INTEGER, listed INTEGER NOT NULL, PRIMARY KEY(id, at));`);
    this.q = {
      get: db.prepare(
        'SELECT status, level, resources, max_level, size_ha, listed FROM history WHERE id=?',
      ),
      put: db.prepare(`INSERT INTO history VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET category=excluded.category, title=excluded.title,
          location=excluded.location, place=excluded.place, lat=excluded.lat, lon=excluded.lon,
          agency=excluded.agency, status=excluded.status, level=excluded.level,
          max_level=excluded.max_level, resources=excluded.resources, size_ha=excluded.size_ha,
          action=excluded.action, details=excluded.details, created=excluded.created,
          last_seen=excluded.last_seen,
          listed=1`),
      event: db.prepare(
        'INSERT OR IGNORE INTO history_events VALUES(?,?,?,?,?,?)',
      ),
      listed: db.prepare(
        'SELECT id, last_seen FROM history WHERE region=? AND listed=1',
      ),
      end: db.prepare('UPDATE history SET listed=0 WHERE id=?'),
    };
    this.lastPrune = 0;
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
      const point = pointOf(r);
      const place = this.places.match(region, r.location, point);
      const rank = levelRank(r.level);
      const resources = num(r.resources);
      const size = num(r.sizeHa);
      this.q.put.run(
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
        Math.max(rank, prior?.max_level ?? 0),
        prior?.resources != null && resources != null
          ? Math.max(prior.resources, resources)
          : (resources ?? prior?.resources ?? null),
        prior?.size_ha != null && size != null
          ? Math.max(prior.size_ha, size)
          : (size ?? prior?.size_ha ?? null),
        typeof r.action === 'string' ? r.action.slice(0, 2000) : null,
        typeof r.text === 'string' ? r.text.slice(0, 2000) : null,
        r.created || null,
        // Kept on update: the upsert below never touches first_seen.
        now,
        now,
        1,
      );
      if (!prior) {
        // The first event is the call itself when the agency says when it was.
        this.q.event.run(
          r.id,
          r.created || now,
          r.status || null,
          r.level || null,
          resources,
          1,
        );
      } else if (
        prior.status !== (r.status || null) ||
        prior.level !== (r.level || null) ||
        (resources != null && prior.resources !== resources) ||
        !prior.listed
      ) {
        this.q.event.run(
          r.id,
          now,
          r.status || null,
          r.level || null,
          resources,
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

  /** Drops what is older than KEEP_DAYS, at most once an hour. */
  prune(now) {
    const t = Date.parse(now);
    if (!Number.isFinite(t) || t - this.lastPrune < 3_600_000) return;
    this.lastPrune = t;
    const cutoff = new Date(t - KEEP_DAYS * 86_400_000).toISOString();
    this.db
      .prepare(
        'DELETE FROM history_events WHERE id IN (SELECT id FROM history WHERE last_seen<?)',
      )
      .run(cutoff);
    this.db.prepare('DELETE FROM history WHERE last_seen<?').run(cutoff);
  }

  /**
   * Fills an empty history from what the live store still has (the last 7
   * days), so the place pages start with a week instead of nothing.
   */
  backfill() {
    const n = this.db.prepare('SELECT COUNT(*) AS n FROM history').get().n;
    if (n > 0) return 0;
    const rows = this.db
      .prepare('SELECT * FROM incidents ORDER BY first_seen')
      .all();
    let added = 0;
    for (const rec of rows) {
      const r = JSON.parse(rec.payload);
      const point = pointOf(r);
      const place = this.places.match(rec.region, r.location, point);
      this.q.put.run(
        rec.id,
        rec.region,
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
        levelRank(r.level),
        num(r.resources),
        num(r.sizeHa),
        typeof r.action === 'string' ? r.action.slice(0, 2000) : null,
        typeof r.text === 'string' ? r.text.slice(0, 2000) : null,
        r.created || null,
        rec.first_seen,
        rec.last_seen,
        rec.listed,
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
      added++;
    }
    return added;
  }
}
