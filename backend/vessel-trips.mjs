// Trips of rescue and police vessels (vessels.mjs): under way from the berth,
// back at the berth, the track in between and a week of history.
//
// Nobody publishes where these boats are kept, so the berth is learned: the
// place where a vessel lies still the longest. A trip starts when the vessel
// moves (2 knots or more) and gets 300 m away from where it started; GPS noise
// at the pontoon also shows speed. It ends when the vessel lies still at its
// berth for five minutes, or drops out of sight there (many boats switch AIS
// off when moored). Lying still elsewhere does not end a trip for two hours:
// during a search or a tow a boat lies still too. Three hours without a signal
// closes a trip without an arrival.
//
// Running trips and what was learned are kept in SQLite, so a restart loses
// neither.

export const UNDERWAY_KN = 2;
/** A position older than this never starts a trip: the source also returns week-old ones. */
export const FRESH_MS = 10 * 60_000;
const DEPART_M = 300;
const CANDIDATE_MS = 20 * 60_000;
/** Within this radius of one point a vessel lies still. */
const STILL_M = 150;
const BERTH_M = 500;
/** Spots this close together are one spot. */
const SPOT_M = 300;
const MAX_SPOTS = 6;
/** Still time a spot needs before it counts as the berth. */
export const BERTH_MIN_MS = 30 * 60_000;
/** One observation adds at most this much still time (AIS is often off at the berth). */
const CREDIT_MAX_MS = 30 * 60_000;
const CREDIT_MIN_MS = 60_000;
/** A spot holds at most a week, so a vessel that moves house is followed. */
const SPOT_MAX_MS = 7 * 86_400_000;
const MOORED_MS = 5 * 60_000;
const MIN_TRIP_MS = 3 * 60_000;
/** Still this long without a known berth: the trip ends where it lies. */
const STOPPED_MS = 30 * 60_000;
/** Still this long away from the known berth (another harbour): the same. */
const STOPPED_AWAY_MS = 2 * 3_600_000;
/** Out of sight this long, last seen at the berth: moored. */
const GONE_AT_BERTH_MS = 15 * 60_000;
export const LOST_MS = 3 * 3_600_000;
export const HISTORY_MS = 7 * 86_400_000;
const TRACK_MIN_S = 20;
const TRACK_MIN_M = 50;
const TRACK_MAX = 2_000;

const r5 = (n) => Math.round(n * 1e5) / 1e5;

export function metres(lat1, lon1, lat2, lon2) {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) *
      Math.cos(lat2 * r) *
      Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12_742_000 * Math.asin(Math.sqrt(a));
}

export class VesselTrips {
  constructor({ db = null } = {}) {
    this.db = db;
    /** mmsi -> { spots, last, stillSince, stillPoint, candidate, trip } */
    this.state = new Map();
    this.dirty = new Set();
    this.ended = [];
    this.nextId = 1;
    if (db) {
      db.exec(`CREATE TABLE IF NOT EXISTS vessel_trip_state(mmsi INTEGER PRIMARY KEY, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS vessel_trips(id INTEGER PRIMARY KEY, mmsi INTEGER NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER, payload TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS vessel_trips_mmsi ON vessel_trips(mmsi, started_at);`);
      for (const row of db
        .prepare('SELECT mmsi, payload FROM vessel_trip_state')
        .all()) {
        try {
          this.state.set(Number(row.mmsi), JSON.parse(String(row.payload)));
        } catch {
          // A broken row only costs what was learned about one vessel.
        }
      }
      // A trip that was running at the restart runs on.
      for (const row of db
        .prepare(
          'SELECT id, mmsi, payload FROM vessel_trips WHERE ended_at IS NULL',
        )
        .all()) {
        try {
          const s = this.#of(Number(row.mmsi));
          s.trip = { ...JSON.parse(String(row.payload)), id: Number(row.id) };
        } catch {
          db.prepare('DELETE FROM vessel_trips WHERE id=?').run(row.id);
        }
      }
      const max = db.prepare('SELECT MAX(id) AS id FROM vessel_trips').get();
      this.nextId = (Number(max?.id) || 0) + 1;
    }
  }

  #of(mmsi) {
    let s = this.state.get(mmsi);
    if (!s) {
      s = {
        spots: [],
        last: null,
        stillSince: null,
        stillPoint: null,
        candidate: null,
        trip: null,
      };
      this.state.set(mmsi, s);
    }
    return s;
  }

  /** Where the vessel usually lies still: { lat, lon }, or null while unknown. */
  berthOf(mmsi) {
    const spots = this.state.get(mmsi)?.spots ?? [];
    let best = null;
    for (const p of spots) if (!best || p.ms > best.ms) best = p;
    return best && best.ms >= BERTH_MIN_MS
      ? { lat: best.lat, lon: best.lon }
      : null;
  }

  atBerth(mmsi, lat, lon) {
    const b = this.berthOf(mmsi);
    return b ? metres(b.lat, b.lon, lat, lon) <= BERTH_M : null;
  }

  running(mmsi) {
    return this.state.get(mmsi)?.trip ?? null;
  }

  #credit(s, lat, lon, ms) {
    let spot = s.spots.find((p) => metres(p.lat, p.lon, lat, lon) <= SPOT_M);
    if (!spot) {
      spot = { lat: r5(lat), lon: r5(lon), ms: 0 };
      s.spots.push(spot);
      if (s.spots.length > MAX_SPOTS) {
        s.spots.sort((a, b) => b.ms - a.ms);
        // The newcomer has the least time, so it replaces the last one.
        s.spots.splice(MAX_SPOTS - 1, s.spots.length - MAX_SPOTS);
      }
    }
    spot.ms = Math.min(SPOT_MAX_MS, spot.ms + ms);
  }

  #end(mmsi, s, how, at, point) {
    const trip = s.trip;
    trip.endedAt = at;
    trip.end = how;
    if (point) trip.endPoint = [r5(point[0]), r5(point[1])];
    s.trip = null;
    s.candidate = null;
    this.ended.push({ mmsi, trip });
    this.dirty.add(mmsi);
  }

  /**
   * One new position of a vessel: { mmsi, lat, lon, sog, seenAt (ms) }.
   * `now` is when we received it; the source also returns old positions.
   */
  observe(v, now = Date.now()) {
    const s = this.#of(v.mmsi);
    const t = v.seenAt;
    if (!Number.isFinite(t) || (s.last && t <= s.last.t)) return;
    const moving = (v.sog ?? 0) >= UNDERWAY_KN;
    const prev = s.last;
    this.dirty.add(v.mmsi);

    if (moving) {
      s.stillPoint = null;
      s.stillSince = null;
    } else {
      const same =
        s.stillPoint &&
        metres(s.stillPoint[0], s.stillPoint[1], v.lat, v.lon) <= STILL_M;
      if (!same) {
        s.stillPoint = [r5(v.lat), r5(v.lon)];
        s.stillSince = t;
      }
      // Learn the berth, but not from a stop during a trip (a search, a tow).
      if (!s.trip || this.atBerth(v.mmsi, v.lat, v.lon) === true)
        this.#credit(
          s,
          v.lat,
          v.lon,
          same && prev
            ? Math.max(CREDIT_MIN_MS, Math.min(t - prev.t, CREDIT_MAX_MS))
            : CREDIT_MIN_MS,
        );
    }

    if (s.trip) this.#during(v, s, t, moving);
    else this.#before(v, s, t, moving, prev, now);
    s.last = { lat: r5(v.lat), lon: r5(v.lon), t, moving };
  }

  #before(v, s, t, moving, prev, now) {
    if (s.candidate && t - s.candidate.t > CANDIDATE_MS) s.candidate = null;
    if (!moving && !s.candidate) return;
    if (now - t > FRESH_MS) return;
    if (!s.candidate) {
      // It leaves from where it lay still, if we saw that shortly before.
      const lay = prev && !prev.moving && t - prev.t <= CREDIT_MAX_MS;
      s.candidate = {
        t,
        lat: lay ? prev.lat : r5(v.lat),
        lon: lay ? prev.lon : r5(v.lon),
        seen: Boolean(lay),
        maxKn: 0,
      };
    }
    const c = s.candidate;
    c.maxKn = Math.max(c.maxKn, v.sog ?? 0);
    if (metres(c.lat, c.lon, v.lat, v.lon) < DEPART_M) return;
    const from = this.atBerth(v.mmsi, c.lat, c.lon);
    s.trip = {
      id: this.nextId++,
      startedAt: c.t,
      // false: it was already under way when we first saw it.
      departureSeen: c.seen,
      from: from ? 'berth' : 'elsewhere',
      track: [
        [c.lat, c.lon, Math.round(c.t / 1000)],
        [r5(v.lat), r5(v.lon), Math.round(t / 1000)],
      ],
      distanceM: Math.round(metres(c.lat, c.lon, v.lat, v.lon)),
      maxKn: c.maxKn,
      lastSeen: t,
      endedAt: null,
      end: null,
    };
    s.candidate = null;
  }

  #during(v, s, t, moving) {
    const trip = s.trip;
    trip.lastSeen = t;
    trip.maxKn = Math.max(trip.maxKn, v.sog ?? 0);
    const tail = trip.track.at(-1);
    const step = metres(tail[0], tail[1], v.lat, v.lon);
    if (t / 1000 - tail[2] >= TRACK_MIN_S && step >= TRACK_MIN_M) {
      trip.track.push([r5(v.lat), r5(v.lon), Math.round(t / 1000)]);
      trip.distanceM += Math.round(step);
      // A very long trip keeps its shape: every second point goes.
      if (trip.track.length > TRACK_MAX)
        trip.track = trip.track.filter(
          (_, i, all) => i % 2 === 0 || i === all.length - 1,
        );
    }
    if (moving || s.stillSince == null) return;
    const still = t - s.stillSince;
    const home = this.atBerth(v.mmsi, v.lat, v.lon);
    const at = s.stillSince;
    if (home === true) {
      if (still >= MOORED_MS && t - trip.startedAt >= MIN_TRIP_MS)
        this.#end(v.mmsi, s, 'berth', at, s.stillPoint);
    } else if (still >= (home === null ? STOPPED_MS : STOPPED_AWAY_MS)) {
      this.#end(v.mmsi, s, 'stopped', at, s.stillPoint);
    }
  }

  /** Closes trips of vessels that fell silent. Call after every round. */
  sweep(now = Date.now()) {
    for (const [mmsi, s] of this.state) {
      const trip = s.trip;
      if (!trip || !s.last) continue;
      const silent = now - trip.lastSeen;
      const home = this.atBerth(mmsi, s.last.lat, s.last.lon);
      const point = [s.last.lat, s.last.lon];
      if (
        home === true &&
        silent >= GONE_AT_BERTH_MS &&
        trip.lastSeen - trip.startedAt >= MIN_TRIP_MS
      )
        this.#end(mmsi, s, 'berth', trip.lastSeen, point);
      else if (silent >= LOST_MS)
        this.#end(mmsi, s, 'lost', trip.lastSeen, point);
    }
  }

  /** Writes what changed, in one transaction, and drops history older than a week. */
  flush(now = Date.now()) {
    if (!this.db) {
      this.memory = [...(this.memory ?? []), ...this.ended].filter(
        (e) => e.trip.endedAt >= now - HISTORY_MS,
      );
      this.ended = [];
      this.dirty.clear();
      return;
    }
    if (!this.dirty.size && !this.ended.length) return;
    const putState = this.db.prepare(
      'INSERT INTO vessel_trip_state VALUES(?,?) ON CONFLICT(mmsi) DO UPDATE SET payload=excluded.payload',
    );
    const putTrip = this.db.prepare(
      'INSERT INTO vessel_trips VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET ended_at=excluded.ended_at, payload=excluded.payload',
    );
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const mmsi of this.dirty) {
        const s = this.state.get(mmsi);
        if (!s) continue;
        // The running trip has its own row.
        putState.run(mmsi, JSON.stringify({ ...s, trip: null }));
        if (s.trip)
          putTrip.run(
            s.trip.id,
            mmsi,
            s.trip.startedAt,
            null,
            JSON.stringify(s.trip),
          );
      }
      for (const { mmsi, trip } of this.ended)
        putTrip.run(
          trip.id,
          mmsi,
          trip.startedAt,
          trip.endedAt,
          JSON.stringify(trip),
        );
      this.db
        .prepare(
          'DELETE FROM vessel_trips WHERE ended_at IS NOT NULL AND ended_at < ?',
        )
        .run(now - HISTORY_MS);
      this.db.exec('COMMIT');
      this.dirty.clear();
      this.ended = [];
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  /** The running trip first, then the trips that ended in the last 7 days, newest first. */
  history(mmsi, now = Date.now()) {
    const out = [];
    const running = this.running(mmsi);
    if (running) out.push(running);
    const pending = this.ended
      .filter((e) => e.mmsi === mmsi)
      .map((e) => e.trip);
    const stored = this.db
      ? this.db
          .prepare(
            'SELECT payload FROM vessel_trips WHERE mmsi=? AND ended_at IS NOT NULL AND ended_at >= ? ORDER BY started_at DESC',
          )
          .all(mmsi, now - HISTORY_MS)
          .map((r) => JSON.parse(String(r.payload)))
      : (this.memory ?? []).filter((e) => e.mmsi === mmsi).map((e) => e.trip);
    const ended = [...pending, ...stored]
      .filter((t) => t.endedAt >= now - HISTORY_MS)
      .sort((a, b) => b.startedAt - a.startedAt);
    return [...out, ...ended].map(publicTrip);
  }
}

/** A trip as the API gives it. Track points are [lat, lon, unix seconds]. */
export function publicTrip(trip) {
  const until = trip.endedAt ?? trip.lastSeen;
  return {
    id: trip.id,
    running: trip.endedAt == null,
    startedAt: new Date(trip.startedAt).toISOString(),
    departureSeen: trip.departureSeen,
    from: trip.from,
    endedAt: trip.endedAt == null ? null : new Date(trip.endedAt).toISOString(),
    end: trip.end,
    lastSeenAt: new Date(trip.lastSeen).toISOString(),
    durationMin: Math.max(0, Math.round((until - trip.startedAt) / 60_000)),
    distanceKm: Math.round(trip.distanceM / 100) / 10,
    maxKn: Math.round(trip.maxKn * 10) / 10,
    track: trip.track,
  };
}
