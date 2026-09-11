import { DatabaseSync } from 'node:sqlite';
import { sources } from './feeds.mjs';

export class IncidentStore {
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sources(region TEXT PRIMARY KEY, started_at TEXT NOT NULL, fetched_at TEXT, updated_at TEXT, stale INTEGER NOT NULL DEFAULT 1, error TEXT);
      CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY, region TEXT NOT NULL, payload TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, listed INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS incidents_region_seen ON incidents(region,last_seen);
    `);
    this.repairLegacyACTText();
  }
  // Repair carriage-return entities written by the first ACT parser without
  // changing incident status or the observation timestamps.
  repairLegacyACTText() {
    const records = this.db
      .prepare(
        "SELECT id,payload FROM incidents WHERE region='act' AND payload LIKE '%&#%'",
      )
      .all();
    const update = this.db.prepare('UPDATE incidents SET payload=? WHERE id=?');
    for (const record of records) {
      const payload = JSON.parse(record.payload);
      const location = payload.location
        .replace(/&#(?:x0*d|0*13);/gi, '')
        .trim();
      if (location !== payload.location) {
        payload.location = location;
        update.run(JSON.stringify(payload), record.id);
      }
    }
  }
  ingest(region, feed) {
    const now = feed.receivedAt || feed.fetchedAt;
    if (feed.stale) {
      this.fail(region, 'Source update delayed');
      return false;
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db
        .prepare(
          'INSERT INTO sources(region,started_at) VALUES (?,?) ON CONFLICT DO NOTHING',
        )
        .run(region, now);
      this.db
        .prepare('UPDATE incidents SET listed=0 WHERE region=?')
        .run(region);
      const put = this.db.prepare(
        `INSERT INTO incidents VALUES(?,?,?,?,?,1) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,last_seen=excluded.last_seen,listed=1`,
      );
      for (const row of [...feed.incidents, ...feed.warnings])
        put.run(row.id, region, JSON.stringify(row), now, now);
      this.db
        .prepare(
          'UPDATE sources SET fetched_at=?,updated_at=?,stale=0,error=NULL WHERE region=?',
        )
        .run(now, feed.sourceUpdated || null, region);
      const cutoff = new Date(Date.parse(now) - 7 * 86400000).toISOString();
      this.db
        .prepare(
          'DELETE FROM incidents WHERE region=? AND listed=0 AND last_seen<?',
        )
        .run(region, cutoff);
      this.db.exec('COMMIT');
      return true;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  fail(region, message) {
    this.db
      .prepare('UPDATE sources SET stale=1,error=? WHERE region=?')
      .run(message, region);
  }
  feed(region, hours = 24, now = Date.now()) {
    const config = sources[region];
    if (!config) throw Error('Unknown region');
    const meta = this.db
      .prepare('SELECT * FROM sources WHERE region=?')
      .get(region);
    if (!meta?.fetched_at) return null;
    const cutoff = new Date(now - hours * 3600000).toISOString();
    const records = this.db
      .prepare(
        'SELECT * FROM incidents WHERE region=? AND (listed=1 OR last_seen>=?)',
      )
      .all(region, cutoff);
    const incidents = [],
      warnings = [];
    for (const record of records) {
      const row = {
        ...JSON.parse(record.payload),
        firstSeen: record.first_seen,
        lastSeen: record.last_seen,
        listed: !!record.listed,
      };
      if (row.kind === 'warning') {
        if (row.listed) warnings.push(row);
      } else incidents.push(row);
    }
    incidents.sort(
      (a, b) =>
        Date.parse(b.created || b.firstSeen) -
          Date.parse(a.created || a.firstSeen) || a.id.localeCompare(b.id),
    );
    return {
      region,
      incidents,
      warnings,
      source: config.name,
      attribution: config.attribution,
      licenseUrl: config.licenseUrl,
      adviceUrl: config.adviceUrl,
      coverageNote: config.coverageNote || null,
      fetchedAt: meta.fetched_at,
      sourceUpdated: meta.updated_at,
      historyStartedAt: meta.started_at,
      historyHours: hours,
      stale:
        !!meta.stale || now - Date.parse(meta.fetched_at) > config.staleAfter,
      error: meta.error,
      staleAfterMs: config.staleAfter,
    };
  }
  close() {
    this.db.close();
  }
}
