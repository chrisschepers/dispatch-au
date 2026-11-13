// Rescue, police, patrol and fire vessels around Australia on the map: Marine
// Rescue NSW and Queensland, Volunteer Marine Rescue, the Volunteer Coast
// Guard, surf rescue boats with AIS and the water police (wish Chris
// 13-11-2026, like the lifeboats in the Dutch app).
//
// Source: Open Waters AIS (https://openwaters.io/ais/), which bundles AISHub,
// aisstream.io and volunteer receivers. Licence: free for personal use;
// commercial use as a contributor (own AIS receiver) or paid. The data per
// source is CC0/ODbL with attribution. VESSELS_ENABLED=off switches the whole
// layer off; OPENWATERS_TOKEN (optional) is sent as the key of a contributor.
//
// Requests, measured 13-11-2026 without a key:
// - A box may cover about 100 square degrees ("bbox not allowed for this
//   key" above that) and a full answer is cut off around 850 vessels.
// - "Light" query (type=51,55: search and rescue, law enforcement): 1-13 kB
//   per box, also holding the last position of vessels not seen for days.
//   Eleven boxes cover the whole coast; four of them (north-west and north)
//   had no such vessel and are only asked once an hour.
// - Some of our vessels send another type ("MARINE RESCUE MH30" pilot, the
//   NSW police boats pleasure craft). A full scan of sixteen smaller boxes
//   every six hours finds them by name (vessel-rules.mjs); after that their
//   positions come from mmsi queries, ten vessels per request.
// - Open Waters allows 120 requests a minute per address. One round is about
//   7 light + 3 mmsi requests: every minute while someone has the layer open
//   (about 600 an hour, 8% of the limit), every three minutes otherwise (about
//   210 an hour, 3%), so trips are also seen when nobody looks. A bucket caps
//   it at 20 a minute whatever happens.
// - After an error a pause of 30 s, doubling to 10 minutes; after a 4xx
//   (a limit or a refused key) an hour. The pause survives a restart.
import { classify, cleanName } from './vessel-rules.mjs';
import { VesselTrips, UNDERWAY_KN } from './vessel-trips.mjs';

const API = 'https://ais.openwaters.io/v1/vessels';
export const VIEW_WINDOW_MS = 5 * 60_000;
export const CADENCE_VIEWED_MS = 60_000;
export const CADENCE_IDLE_MS = 3 * 60_000;
/** A box without any of our vessels is asked again after this long. */
export const QUIET_BOX_MS = 3_600_000;
export const SCAN_MS = 6 * 3_600_000;
/** Scan requests per round, so a scan spreads over a few rounds. */
const SCANS_PER_ROUND = 4;
/** Open Waters refuses more ("too many mmsi for this key"). */
export const MMSI_PER_REQUEST = 10;
/** The largest box the source accepts without a key, in square degrees. */
export const MAX_BOX_SQ_DEG = 100;
export const SOURCE_LIMIT_PER_MIN = 120;
export const MAX_PER_MIN = 20;
/** A moving vessel not seen for this long is gone from the map. */
export const KEEP_MOVING_MS = 30 * 60_000;
/** A vessel that lay still is shown where it lay for a day (AIS off at the berth). */
export const KEEP_STILL_MS = 24 * 3_600_000;
/** Older than this the position is marked stale. */
export const STALE_MS = 30 * 60_000;
const ERROR_PAUSE_MS = 30_000;
const ERROR_PAUSE_MAX_MS = 10 * 60_000;
const REFUSED_PAUSE_MS = 3_600_000;

// [south, west, north, east]. The whole coast in boxes under 100 square
// degrees; the light query is cheap whatever the size.
export const LIGHT_BOXES = [
  { id: 'cape-york', bbox: [-19.5, 141.5, -9.5, 147.5] },
  { id: 'qld-central', bbox: [-26, 146.5, -19.5, 154] },
  { id: 'seq-nnsw', bbox: [-32, 151, -26, 154.5] },
  { id: 'nsw', bbox: [-38, 149, -32, 153] },
  { id: 'vic-tas', bbox: [-44, 140.5, -37, 149.5] },
  { id: 'sa', bbox: [-38.5, 132.5, -31.5, 141] },
  { id: 'wa-south', bbox: [-35.5, 113.5, -28, 124] },
  { id: 'wa-northwest', bbox: [-28, 112.5, -19.5, 120] },
  { id: 'kimberley', bbox: [-19.5, 120, -13, 129.5] },
  { id: 'top-end', bbox: [-16, 129.5, -10.5, 137.5] },
  { id: 'gulf', bbox: [-18, 137.5, -10.5, 141.5] },
];

// The same coast for the full scan. Sydney-Newcastle and Brisbane-Gold Coast
// are split: as one box their answers were cut off (723 and 630 vessels in
// the busiest parts on 13-11-2026, against a cut around 850).
export const SCAN_BOXES = [
  { id: 'cape-york', bbox: [-19.5, 141.5, -9.5, 147.5] },
  { id: 'qld-central', bbox: [-26, 146.5, -19.5, 154] },
  { id: 'sunshine-coast', bbox: [-27, 152.5, -26, 154] },
  { id: 'moreton-bay', bbox: [-27.75, 152.5, -27, 154] },
  { id: 'gold-coast', bbox: [-28.5, 153, -27.75, 154] },
  { id: 'nsw-north', bbox: [-32, 152, -28.5, 154] },
  { id: 'hunter', bbox: [-33.3, 150.8, -32, 153] },
  { id: 'sydney', bbox: [-34.2, 150.5, -33.3, 152] },
  { id: 'nsw-south', bbox: [-38, 149, -34.2, 151.5] },
  { id: 'vic-tas', bbox: [-44, 140.5, -37, 149.5] },
  { id: 'sa', bbox: [-38.5, 132.5, -31.5, 141] },
  { id: 'wa-south', bbox: [-35.5, 113.5, -28, 124] },
  { id: 'wa-northwest', bbox: [-28, 112.5, -19.5, 120] },
  { id: 'kimberley', bbox: [-19.5, 120, -13, 129.5] },
  { id: 'top-end', bbox: [-16, 129.5, -10.5, 137.5] },
  { id: 'gulf', bbox: [-18, 137.5, -10.5, 141.5] },
];

// Every source Open Waters names in its answers (aishub, aisstream, station).
export const ATTRIBUTION =
  'Vessel positions: Open Waters AIS (https://openwaters.io/ais/), with AISHub (https://www.aishub.net) and aisstream.io.';

/** Token bucket per minute: at most `max` in a row, refilled with `perMin`. */
export class MinuteBudget {
  constructor(max = MAX_PER_MIN, perMin = MAX_PER_MIN, now = Date.now()) {
    this.max = max;
    this.perMin = perMin;
    this.tokens = max;
    this.at = now;
  }
  take(now = Date.now()) {
    // A clock that jumps back never drains the bucket.
    this.tokens = Math.min(
      this.max,
      this.tokens + (Math.max(0, now - this.at) / 60_000) * this.perMin,
    );
    this.at = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

/** Off only when the switch says so. */
export function vesselsEnabled(value = process.env.VESSELS_ENABLED) {
  return !/^(off|false|0|no|uit)$/i.test(String(value ?? '').trim());
}

export class VesselService {
  constructor({
    db = null,
    enabled = vesselsEnabled(),
    token = process.env.OPENWATERS_TOKEN || '',
    fetcher = fetch,
    budget = new MinuteBudget(),
    log = (o) => console.log(JSON.stringify({ vessels: true, ...o })),
  } = {}) {
    this.db = db;
    this.enabled = enabled;
    this.token = token;
    this.fetcher = fetcher;
    this.budget = budget;
    this.log = log;
    /** mmsi -> vessel with its last position. */
    this.vessels = new Map();
    this.trips = new VesselTrips({ db });
    this.lastView = -Infinity;
    this.lastRound = -Infinity;
    this.lastSuccess = 0;
    this.lastScan = 0;
    this.scanQueue = [];
    this.boxAsked = new Map();
    this.boxCount = new Map();
    this.truncated = new Set();
    this.polling = false;
    this.pausedUntil = 0;
    this.pauseMs = 0;
    this.lastError = null;
    this.requests = [];
    if (db) {
      db.exec(`CREATE TABLE IF NOT EXISTS vessel_state(key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS vessel_fleet(mmsi INTEGER PRIMARY KEY, payload TEXT NOT NULL);`);
      const get = (key) =>
        Number(
          db.prepare('SELECT value FROM vessel_state WHERE key=?').get(key)
            ?.value,
        ) || 0;
      this.pausedUntil = get('pausedUntil');
      this.lastScan = get('lastScan');
      // The vessels we knew, so the layer is not empty after a restart and
      // the ones found by name are asked for again at once.
      for (const row of db.prepare('SELECT payload FROM vessel_fleet').all()) {
        try {
          const v = JSON.parse(String(row.payload));
          if (Number.isInteger(v?.mmsi) && typeof v.lat === 'number')
            this.vessels.set(v.mmsi, v);
        } catch {
          // Comes back with the next round.
        }
      }
    }
  }

  #setState(key, value) {
    this.db
      ?.prepare(
        'INSERT INTO vessel_state VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value',
      )
      .run(key, String(value));
  }

  /** The app asked for the layer: count it as viewing and poll if it is time. */
  request(now = Date.now()) {
    this.lastView = now;
    void this.tick(now);
    return this.snapshot(now);
  }

  /** Vessels the light query does not return: found by name, with another AIS type. */
  #byMmsi() {
    const out = [];
    for (const v of this.vessels.values())
      if (v.type !== 51 && v.type !== 55) out.push(v.mmsi);
    return out.sort((a, b) => a - b);
  }

  /** What one round asks for, in order: light boxes, mmsi groups, a part of a scan. */
  plan(now = Date.now()) {
    const queries = [];
    for (const box of LIGHT_BOXES) {
      const quiet = this.boxCount.get(box.id) === 0;
      const asked = this.boxAsked.get(box.id) ?? -Infinity;
      if (quiet && now - asked < QUIET_BOX_MS) continue;
      queries.push({
        kind: 'light',
        box: box.id,
        query: `bbox=${box.bbox.join(',')}&type=51,55`,
      });
    }
    const ids = this.#byMmsi();
    for (let i = 0; i < ids.length; i += MMSI_PER_REQUEST)
      queries.push({
        kind: 'mmsi',
        query: `mmsi=${ids.slice(i, i + MMSI_PER_REQUEST).join(',')}`,
      });
    if (!this.scanQueue.length && now - this.lastScan >= SCAN_MS) {
      this.scanQueue = SCAN_BOXES.map((b) => b.id);
      this.truncated.clear();
      this.lastScan = now;
      this.#setState('lastScan', now);
    }
    for (const id of this.scanQueue.slice(0, SCANS_PER_ROUND)) {
      const box = SCAN_BOXES.find((b) => b.id === id);
      queries.push({
        kind: 'scan',
        box: id,
        query: `bbox=${box.bbox.join(',')}`,
      });
    }
    return queries;
  }

  #pause(now, refused, reason) {
    this.pauseMs = refused
      ? REFUSED_PAUSE_MS
      : Math.min(
          ERROR_PAUSE_MAX_MS,
          this.pauseMs ? this.pauseMs * 2 : ERROR_PAUSE_MS,
        );
    this.pausedUntil = now + this.pauseMs;
    this.#setState('pausedUntil', this.pausedUntil);
    this.lastError = reason;
    this.log({ error: reason, pauseS: Math.round(this.pauseMs / 1000) });
  }

  async tick(now = Date.now()) {
    if (!this.enabled || this.polling || now < this.pausedUntil) return;
    const viewed = now - this.lastView <= VIEW_WINDOW_MS;
    if (now - this.lastRound < (viewed ? CADENCE_VIEWED_MS : CADENCE_IDLE_MS))
      return;
    this.polling = true;
    this.lastRound = now;
    try {
      for (const q of this.plan(now)) {
        // Out of budget: the rest waits for the next round.
        if (!this.budget.take(now)) {
          this.log({ budget: 'empty' });
          break;
        }
        this.requests.push(now);
        const res = await this.fetcher(`${API}?${q.query}`, {
          headers: {
            Accept: 'application/json',
            ...(this.token ? { APIKey: this.token } : {}),
          },
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) {
          const refused = res.status >= 400 && res.status < 500;
          this.#pause(now, refused, `HTTP ${res.status}`);
          return;
        }
        const body = await res.json();
        if (!Array.isArray(body?.features)) {
          this.#pause(now, false, 'Unexpected answer');
          return;
        }
        let ours = 0;
        for (const f of body.features) if (this.ingest(f, now)) ours += 1;
        if (q.kind === 'light') {
          this.boxAsked.set(q.box, now);
          this.boxCount.set(q.box, ours);
        }
        if (q.kind === 'scan') {
          this.scanQueue = this.scanQueue.filter((id) => id !== q.box);
          if (body.truncated) {
            // Split the box in SCAN_BOXES when this shows up.
            this.truncated.add(q.box);
            this.log({ scan: q.box, truncated: true });
          }
        }
      }
      this.pauseMs = 0;
      this.lastSuccess = now;
      this.lastError = null;
    } catch (error) {
      this.#pause(now, false, String(error?.name || error).slice(0, 80));
    } finally {
      try {
        this.trips.sweep(now);
        this.trips.flush(now);
        this.#save(now);
      } catch (error) {
        this.log({ save: 'failed', error: String(error).slice(0, 160) });
      }
      this.polling = false;
    }
  }

  /** One GeoJSON feature of the source. True when it is one of our vessels. */
  ingest(feature, now = Date.now()) {
    const p = feature?.properties;
    const [lon, lat] = feature?.geometry?.coordinates ?? [];
    if (!p || !Number.isInteger(p.mmsi)) return false;
    if (p.kind && p.kind !== 'vessel') return false;
    if (
      typeof lat !== 'number' ||
      typeof lon !== 'number' ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    )
      return false;
    const old = this.vessels.get(p.mmsi);
    // A static report can come without the name; keep what we knew.
    const name = cleanName(p.name) || old?.name || '';
    const type = Number.isInteger(p.type) ? p.type : (old?.type ?? null);
    const length =
      typeof p.length === 'number' && p.length > 0
        ? p.length
        : (old?.length ?? null);
    const callsign = cleanName(p.callsign) || old?.callsign || null;
    const kind = classify({ mmsi: p.mmsi, name, type, callsign, length, lat });
    if (!kind) {
      // Renamed or sold: no longer one of ours.
      if (old) {
        this.vessels.delete(p.mmsi);
        this.gone = (this.gone ?? new Set()).add(p.mmsi);
      }
      return false;
    }
    const seenAt = Date.parse(p.seen);
    if (!Number.isFinite(seenAt) || seenAt > now + 5 * 60_000) return false;
    const fixed = { mmsi: p.mmsi, name, callsign, type, length, ...kind };
    if (old && old.seenAt >= seenAt) {
      this.vessels.set(p.mmsi, { ...old, ...fixed });
      return true;
    }
    const num = (x, max) =>
      typeof x === 'number' && x >= 0 && x <= max ? x : null;
    const v = {
      ...fixed,
      lat: Math.round(lat * 1e5) / 1e5,
      lon: Math.round(lon * 1e5) / 1e5,
      // 102.3 knots, course 360 and heading 511 mean "not available" in AIS.
      sog: num(p.sog, 102.2),
      cog: num(p.cog, 359.9),
      heading: num(p.heading, 359),
      seenAt,
    };
    this.vessels.set(p.mmsi, v);
    this.changed = (this.changed ?? new Set()).add(p.mmsi);
    this.trips.observe(v, now);
    return true;
  }

  #save(now) {
    if (!this.db) {
      this.changed = this.gone = undefined;
      return;
    }
    const put = this.db.prepare(
      'INSERT INTO vessel_fleet VALUES(?,?) ON CONFLICT(mmsi) DO UPDATE SET payload=excluded.payload',
    );
    for (const mmsi of this.changed ?? []) {
      const v = this.vessels.get(mmsi);
      if (v) put.run(mmsi, JSON.stringify(v));
    }
    // Not seen for a week (the source forgets them too) or no longer ours.
    for (const [mmsi, v] of this.vessels)
      if (now - v.seenAt > 8 * 86_400_000) {
        this.vessels.delete(mmsi);
        (this.gone ??= new Set()).add(mmsi);
      }
    for (const mmsi of this.gone ?? [])
      this.db.prepare('DELETE FROM vessel_fleet WHERE mmsi=?').run(mmsi);
    this.changed = this.gone = undefined;
  }

  #requestsLastHour(now) {
    this.requests = this.requests.filter((t) => now - t < 3_600_000);
    return this.requests.length;
  }

  snapshot(now = Date.now()) {
    const vessels = [];
    // Switched off: nothing of what an earlier run stored either.
    for (const v of this.enabled ? this.vessels.values() : []) {
      const age = now - v.seenAt;
      const moving = (v.sog ?? 0) >= UNDERWAY_KN;
      if (age > (moving ? KEEP_MOVING_MS : KEEP_STILL_MS)) continue;
      const berth = this.trips.berthOf(v.mmsi);
      const trip = this.trips.running(v.mmsi);
      vessels.push({
        mmsi: v.mmsi,
        name: v.name || null,
        callsign: v.callsign,
        category: v.category,
        organisation: v.organisation,
        unit: v.unit,
        basis: v.basis,
        lengthM: v.length,
        lat: v.lat,
        lon: v.lon,
        speedKn: v.sog,
        course: v.cog,
        heading: v.heading,
        moving,
        seenAt: new Date(v.seenAt).toISOString(),
        stale: age > STALE_MS,
        berth,
        atBerth: this.trips.atBerth(v.mmsi, v.lat, v.lon),
        trip: trip
          ? { id: trip.id, startedAt: new Date(trip.startedAt).toISOString() }
          : null,
      });
    }
    vessels.sort((a, b) => a.mmsi - b.mmsi);
    return {
      vessels,
      // Which layers exist right now, so the app only offers those.
      categories: [...new Set(vessels.map((v) => v.category))].sort((a, b) =>
        a.localeCompare(b),
      ),
      updatedAt: this.lastSuccess
        ? new Date(this.lastSuccess).toISOString()
        : null,
      attribution: ATTRIBUTION,
      status: {
        enabled: this.enabled,
        pausedUntil:
          this.pausedUntil > now
            ? new Date(this.pausedUntil).toISOString()
            : null,
        error: this.lastError,
        known: this.vessels.size,
        requestsLastHour: this.#requestsLastHour(now),
        truncatedScans: [...this.truncated],
      },
    };
  }

  /** The running trip and the last 7 days of one vessel, or null for a vessel we do not know. */
  tripsOf(mmsi, now = Date.now()) {
    const v = this.vessels.get(mmsi);
    const trips = this.trips.history(mmsi, now);
    if (!v && !trips.length) return null;
    return {
      mmsi,
      name: v?.name || null,
      category: v?.category ?? null,
      organisation: v?.organisation ?? null,
      berth: this.trips.berthOf(mmsi),
      trips,
      attribution: ATTRIBUTION,
    };
  }
}
