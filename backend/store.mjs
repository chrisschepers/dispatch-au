import { DatabaseSync } from 'node:sqlite';
import { canonicalVIC } from './regional.mjs';
import { sources } from './feeds.mjs';
import { sourceHealth } from './health.mjs';
import { History } from './history.mjs';

export class IncidentStore {
  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path, { timeout: 5000 });
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS sources(region TEXT PRIMARY KEY, started_at TEXT NOT NULL, fetched_at TEXT, updated_at TEXT, stale INTEGER NOT NULL DEFAULT 1, error TEXT);
      CREATE TABLE IF NOT EXISTS incidents(id TEXT PRIMARY KEY, region TEXT NOT NULL, payload TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, listed INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS incidents_region_seen ON incidents(region,last_seen);
      CREATE TABLE IF NOT EXISTS source_attempts(region TEXT PRIMARY KEY, last_attempt TEXT NOT NULL, failures INTEGER NOT NULL DEFAULT 0, first_failure TEXT, error TEXT);
    `);
    this.repairLegacyACTText();
    this.mergeVICIdentities();
    // Compact history for the website (history.mjs); starts with the 7 days
    // this store still holds.
    // A broken history must never stop the store (and with it the app API).
    try {
      this.history = new History(this.db);
      this.history.backfill();
    } catch (error) {
      console.warn(
        JSON.stringify({
          history: 'unavailable',
          error: String(error).slice(0, 160),
        }),
      );
      this.history ??= null;
    }
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
  mergeVICIdentities() {
    const groups = new Map();
    for (const r of this.db
      .prepare("SELECT * FROM incidents WHERE region='vic'")
      .all()) {
      const row = JSON.parse(r.payload),
        id = canonicalVIC(row);
      if (!groups.has(id)) groups.set(id, []);
      groups.get(id).push({ ...r, row });
    }
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const [id, records] of groups) {
        if (records.length === 1 && records[0].id === id) continue;
        records.sort(
          (a, b) =>
            b.last_seen.localeCompare(a.last_seen) || b.listed - a.listed,
        );
        const row = { ...records[0].row, id };
        const created = records
          .map((r) => r.row.created)
          .filter(Boolean)
          .sort();
        if (created.length) row.created = created[0];
        const first = records.map((r) => r.first_seen).sort()[0],
          last = records
            .map((r) => r.last_seen)
            .sort()
            .at(-1);
        for (const r of records)
          this.db.prepare('DELETE FROM incidents WHERE id=?').run(r.id);
        this.db
          .prepare('INSERT INTO incidents VALUES(?,?,?,?,?,?)')
          .run(
            id,
            'vic',
            JSON.stringify(row),
            first,
            last,
            records.some((r) => r.listed) ? 1 : 0,
          );
      }
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  ingest(region, feed) {
    const now = feed.receivedAt || feed.fetchedAt;
    if (feed.stale) {
      this.fail(region, 'Source update delayed', now);
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
      const rows = [];
      for (const sourceRow of [...feed.incidents, ...feed.warnings]) {
        const row = { ...sourceRow };
        if (region === 'vic') row.id = canonicalVIC(row);
        const prior = this.db
          .prepare('SELECT payload FROM incidents WHERE id=?')
          .get(row.id);
        const created = prior && JSON.parse(prior.payload).created;
        if (created && (!row.created || created < row.created))
          row.created = created;
        put.run(row.id, region, JSON.stringify(row), now, now);
        rows.push(row);
      }
      // The website's history may never cost the app its update: a failure
      // there (a full disk, a bug) is rolled back on its own and logged.
      this.db.exec('SAVEPOINT history');
      try {
        this.history?.record(region, rows, now);
        this.db.exec('RELEASE history');
      } catch (error) {
        this.db.exec('ROLLBACK TO history');
        this.db.exec('RELEASE history');
        console.warn(
          JSON.stringify({
            region,
            history: 'failed',
            error: String(error).slice(0, 160),
          }),
        );
      }
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
      this.recordAttempt(region, now);
      this.db.exec('COMMIT');
      // Changes with every accepted update; the server caches compressed
      // feeds until it moves.
      this.version = (this.version ?? 0) + 1;
      return true;
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }
  recordAttempt(region, at, error = null) {
    this.db
      .prepare(`INSERT INTO source_attempts VALUES(?,?,?,?,?)
      ON CONFLICT(region) DO UPDATE SET last_attempt=excluded.last_attempt,
      failures=CASE WHEN excluded.error IS NULL THEN 0 ELSE source_attempts.failures+1 END,
      first_failure=CASE WHEN excluded.error IS NULL THEN NULL ELSE COALESCE(source_attempts.first_failure,excluded.first_failure) END,
      error=excluded.error`)
      .run(region, at, error ? 1 : 0, error ? at : null, error);
  }
  health(region, now = Date.now()) {
    if (!sources[region]) throw Error('Unknown region');
    return sourceHealth(
      region,
      sources[region],
      this.db.prepare('SELECT * FROM sources WHERE region=?').get(region),
      this.db
        .prepare('SELECT * FROM source_attempts WHERE region=?')
        .get(region),
      now,
    );
  }
  fail(region, message, at = new Date().toISOString()) {
    this.version = (this.version ?? 0) + 1;
    message = String(message)
      .replace(/[\r\n\t]/g, ' ')
      .slice(0, 300);
    this.recordAttempt(region, at, message);
    this.db
      .prepare('UPDATE sources SET stale=1,error=? WHERE region=?')
      .run(message, region);
  }
  feed(region, hours = 24, now = Date.now()) {
    if (region === 'au') {
      const feeds = Object.keys(sources).map((r) => this.feed(r, hours, now));
      const present = feeds.filter(Boolean);
      if (!present.length) return null;
      return {
        region,
        incidents: present
          .flatMap((f) => f.incidents)
          .sort(
            (a, b) =>
              Date.parse(b.created || b.updated || b.firstSeen) -
              Date.parse(a.created || a.updated || a.firstSeen),
          ),
        warnings: present.flatMap((f) => f.warnings),
        source: 'Australian emergency sources',
        attribution: present.map((f) => f.attribution).join('\n'),
        adviceUrl: 'https://www.australia.gov.au/',
        licenseUrl: 'https://www.australia.gov.au/',
        coverageNote:
          'Available coverage: Victoria, ACT, NSW, Queensland and South Australia. Sources differ; not every emergency call is published. NSW and Queensland sources update about every 30 minutes.',
        fetchedAt: present
          .map((f) => f.fetchedAt)
          .sort()
          .at(-1),
        sourceUpdated: null,
        historyStartedAt: present.map((f) => f.historyStartedAt).sort()[0],
        historyHours: hours,
        stale: feeds.some((f) => !f || f.stale),
        staleAfterMs: 300000,
        sources: Object.keys(sources).map((r) => this.health(r, now)),
      };
    }
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
        Date.parse(b.created || b.updated || b.firstSeen) -
          Date.parse(a.created || a.updated || a.firstSeen) ||
        a.id.localeCompare(b.id),
    );
    return {
      region,
      incidents,
      warnings,
      source: config.name,
      attribution:
        config.attribution +
        (region === 'sa'
          ? ' Sourced ' + meta.fetched_at.slice(0, 10) + '.'
          : ''),
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
      sources: [this.health(region, now)],
    };
  }
  close() {
    this.db.close();
  }
}
