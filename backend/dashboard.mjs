// Owner dashboard: how the app is doing, from what this service already knows.
//
//  - GET /v1/stats   counts only (also at /v1/admin/stats, the old address);
//  - GET /dashboard   one page without any data in it (dashboard-page.mjs).
//
// Open, without a key (wish of the owner, 15-11-2026). That is why only
// counts ever leave this module, and why they are cached for a minute.
//
// Privacy: nothing per device ever leaves this module. No push tokens, device
// ids, install hashes or coordinates, only counts; an app version that fewer
// than three devices have is folded into "other".
//
// Cost: the numbers are computed at most once a minute and kept in memory.
// SQLite is synchronous here, so one computation runs at a time by itself and
// the queries stay small: counts over indexes, one pass over `devices`.
//
// History: `created_at` only exists for devices still in the table, so an
// hourly snapshot writes the day's figures to `daily_stats`. Those rows start
// on the day this shipped; earlier days in the series come from `created_at`.
import { sources } from './feeds.mjs';
import { skippedByRegion } from './skipped.mjs';

export const DASHBOARD_TZ = 'Australia/Melbourne';
export const SERIES_DAYS = 60;
const CACHE_MS = 60_000;
const MIN_GROUP = 3;
const TOP_VERSIONS = 8;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: DASHBOARD_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const clockFormat = new Intl.DateTimeFormat('en-GB', {
  timeZone: DASHBOARD_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** The calendar day in Melbourne, "2026-11-14". */
export function melbourneDay(ms) {
  return dayFormat.format(new Date(ms));
}

function offsetMs(ms) {
  const p = Object.fromEntries(
    clockFormat.formatToParts(new Date(ms)).map((x) => [x.type, x.value]),
  );
  const wall = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour,
    +p.minute,
    +p.second,
  );
  return wall - Math.floor(ms / 1000) * 1000;
}

/**
 * The instant a Melbourne day starts. Daylight saving changes at 2 or 3 am,
 * so midnight always exists once; the offset is read from the zone itself.
 */
export function melbourneDayStart(day) {
  const [y, m, d] = day.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d);
  let at = wall - 10 * HOUR;
  for (let i = 0; i < 3; i++) {
    const next = wall - offsetMs(at);
    if (next === at) break;
    at = next;
  }
  return at;
}

/** A calendar day some days earlier or later, without touching a clock. */
export function shiftDay(day, days) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const iso = (ms) => new Date(ms).toISOString();

const RANK_NAMES = ['incident', 'advice', 'watchAndAct', 'emergencyWarning'];

export class Dashboard {
  constructor(db, { store = null } = {}) {
    this.db = db;
    this.store = store;
    this.cache = null;
    // The device tables belong to push.mjs; they exist before this runs in
    // the server. Without them (a bare store in a test) the indexes wait.
    db.exec(`
      CREATE TABLE IF NOT EXISTS daily_stats(
        day TEXT PRIMARY KEY, devices_total INTEGER NOT NULL, devices_new INTEGER NOT NULL,
        devices_active_24h INTEGER NOT NULL, pushes_sent INTEGER NOT NULL);
    `);
    this.ready = false;
    this.#prepare();
  }

  /** Indexes for the counts by date; the feed never reads these tables. */
  #prepare() {
    if (this.ready) return true;
    const tables = this.db
      .prepare(
        "SELECT count(*) AS n FROM sqlite_master WHERE type='table' AND name IN ('devices','push_sent')",
      )
      .get().n;
    if (tables < 2) return false;
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS devices_created ON devices(created_at);
      CREATE INDEX IF NOT EXISTS devices_updated ON devices(updated_at);
      CREATE INDEX IF NOT EXISTS push_sent_at ON push_sent(sent_at);
    `);
    this.ready = true;
    return true;
  }

  #count(sql, ...args) {
    return this.db.prepare(sql).get(...args).n;
  }

  /**
   * Writes today's figures (Melbourne day) to `daily_stats`; run at start and
   * every hour. Running it again gives the same row. New devices and pushes
   * never go down within a day, so a device removed later stays counted.
   * Yesterday's row gets its last hour added if it exists.
   */
  snapshot(now = Date.now()) {
    if (!this.#prepare()) return null;
    const day = melbourneDay(now);
    const start = melbourneDayStart(day);
    const between = (table, column, from, to) =>
      this.#count(
        `SELECT count(*) AS n FROM ${table} WHERE ${column}>=? AND ${column}<?`,
        iso(from),
        iso(to),
      );
    const row = {
      day,
      devicesTotal: this.#count('SELECT count(*) AS n FROM devices'),
      devicesNew: between('devices', 'created_at', start, now + 1),
      devicesActive24h: between('devices', 'updated_at', now - DAY, now + 1),
      pushesSent: between('push_sent', 'sent_at', start, now + 1),
    };
    this.db
      .prepare(
        `INSERT INTO daily_stats(day,devices_total,devices_new,devices_active_24h,pushes_sent) VALUES (?,?,?,?,?)
        ON CONFLICT(day) DO UPDATE SET devices_total=excluded.devices_total,
          devices_new=MAX(daily_stats.devices_new, excluded.devices_new),
          devices_active_24h=excluded.devices_active_24h,
          pushes_sent=MAX(daily_stats.pushes_sent, excluded.pushes_sent)`,
      )
      .run(
        row.day,
        row.devicesTotal,
        row.devicesNew,
        row.devicesActive24h,
        row.pushesSent,
      );
    const yesterday = shiftDay(day, -1);
    const before = melbourneDayStart(yesterday);
    this.db
      .prepare(
        `UPDATE daily_stats SET devices_new=MAX(devices_new, ?), pushes_sent=MAX(pushes_sent, ?) WHERE day=?`,
      )
      .run(
        between('devices', 'created_at', before, start),
        between('push_sent', 'sent_at', before, start),
        yesterday,
      );
    return row;
  }

  /** The numbers, at most a minute old. */
  stats(now = Date.now()) {
    if (this.cache && Math.abs(now - this.cache.at) < CACHE_MS)
      return this.cache.body;
    const body = this.compute(now);
    this.cache = { at: now, body };
    return body;
  }

  compute(now = Date.now()) {
    if (!this.#prepare()) return null;
    const today = melbourneDay(now);
    const days = Array.from({ length: SERIES_DAYS }, (_, i) =>
      shiftDay(today, i - (SERIES_DAYS - 1)),
    );
    const startOf = (day) => iso(melbourneDayStart(day));
    const since = (table, column, from) =>
      this.#count(
        `SELECT count(*) AS n FROM ${table} WHERE ${column}>=?`,
        from,
      );

    // One pass over the table for everything that needs every row. The filter
    // is read as push.mjs reads it: no value means notifications are off.
    const all = this.db
      .prepare(
        `SELECT count(*) AS total,
          coalesce(sum(push_token IS NOT NULL), 0) AS token,
          coalesce(sum(push_token IS NOT NULL AND CASE WHEN json_valid(filter)
            THEN json_extract(filter, '$.notificationsEnabled') END = 1), 0) AS enabled,
          coalesce(sum(lat IS NOT NULL AND lon IS NOT NULL), 0) AS located
        FROM devices`,
      )
      .get();

    const platforms = { ios: 0, android: 0, unknown: 0 };
    for (const r of this.db
      .prepare('SELECT platform, count(*) AS n FROM devices GROUP BY platform')
      .all()) {
      const p = String(r.platform ?? '').toLowerCase();
      platforms[p === 'ios' || p === 'android' ? p : 'unknown'] += r.n;
    }

    // The app sends its version; anything else there is not ours to show.
    const byVersion = new Map();
    for (const r of this.db
      .prepare(
        'SELECT app_version AS v, count(*) AS n FROM devices GROUP BY app_version',
      )
      .all()) {
      const v =
        typeof r.v === 'string' && /^[0-9][0-9A-Za-z.+-]{0,19}$/.test(r.v)
          ? r.v
          : 'unknown';
      byVersion.set(v, (byVersion.get(v) ?? 0) + r.n);
    }
    const sorted = [...byVersion]
      .filter(([, n]) => n >= MIN_GROUP)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    const versions = sorted
      .slice(0, TOP_VERSIONS)
      .map(([version, devices]) => ({ version, devices }));
    const other = all.total - versions.reduce((s, v) => s + v.devices, 0);
    if (other > 0) versions.push({ version: 'other', devices: other });

    // New devices per UTC hour, then into Melbourne days: its offset is a
    // whole number of hours, so an hour never straddles two days.
    const windowStart = startOf(days[0]);
    const perDay = new Map(days.map((d) => [d, 0]));
    for (const r of this.db
      .prepare(
        `SELECT substr(created_at, 1, 13) AS h, count(*) AS n FROM devices WHERE created_at>=? GROUP BY h`,
      )
      .all(windowStart)) {
      const day = melbourneDay(Date.parse(`${r.h}:00:00Z`));
      if (perDay.has(day)) perDay.set(day, perDay.get(day) + r.n);
    }
    const snapshots = new Map(
      this.db
        .prepare('SELECT * FROM daily_stats WHERE day>=?')
        .all(days[0])
        .map((r) => [r.day, r]),
    );
    let running = this.#count(
      'SELECT count(*) AS n FROM devices WHERE created_at<?',
      windowStart,
    );
    const daily = days.map((day) => {
      running += perDay.get(day);
      const snap = snapshots.get(day);
      return {
        day,
        // A snapshot remembers devices that were removed since.
        new: Math.max(perDay.get(day), snap?.devices_new ?? 0),
        total: Math.max(running, snap?.devices_total ?? 0),
        active24h: snap?.devices_active_24h ?? null,
        pushes: snap?.pushes_sent ?? null,
      };
    });
    const newOver = (n) => daily.slice(-n).reduce((s, d) => s + d.new, 0);
    const firstSnapshot = this.db
      .prepare('SELECT min(day) AS day FROM daily_stats')
      .get().day;

    const byRank7d = Object.fromEntries(RANK_NAMES.map((n) => [n, 0]));
    for (const r of this.db
      .prepare(
        'SELECT rank, count(*) AS n FROM push_sent WHERE sent_at>=? GROUP BY rank',
      )
      .all(iso(now - 7 * DAY)))
      byRank7d[RANK_NAMES[r.rank] ?? 'incident'] += r.n;

    return {
      generatedAt: iso(now),
      timeZone: DASHBOARD_TZ,
      today,
      cacheSeconds: CACHE_MS / 1000,
      devices: {
        total: all.total,
        // Calendar days in Melbourne, today included, so they add up to the chart.
        new: { today: newOver(1), last7d: newOver(7), last30d: newOver(30) },
        active: {
          last24h: since('devices', 'updated_at', iso(now - DAY)),
          last7d: since('devices', 'updated_at', iso(now - 7 * DAY)),
          last30d: since('devices', 'updated_at', iso(now - 30 * DAY)),
        },
        platforms,
        versions,
        withPushToken: all.token,
        notificationsEnabled: all.enabled,
        withLocation: all.located,
      },
      series: { days: SERIES_DAYS, snapshotsSince: firstSnapshot, daily },
      pushes: {
        today: since('push_sent', 'sent_at', startOf(today)),
        last7d: Object.values(byRank7d).reduce((s, n) => s + n, 0),
        byRank7d,
      },
      sources: this.store
        ? Object.keys(sources).map((region) => {
            const h = this.store.health(region, now);
            return {
              region,
              state: h.state,
              alert: h.alert,
              fetchedAt: h.fetchedAt,
              lastAttemptAt: h.lastAttemptAt,
              consecutiveFailures: h.consecutiveFailures,
              error: h.error,
              skipped: skippedByRegion.get(region)?.count ?? 0,
            };
          })
        : [],
      stores: { connected: false },
    };
  }
}
