// Flights of the aircraft the aircraft layer follows (aircraft.mjs): one
// flight per take-off, with its track, the fire a firefighting aircraft works
// on and, for rescue and medical aircraft, only whether it is back at base.
//
// Fed with every position a poll brings in; it never calls out itself. With
// the request budget a poll comes every 3 minutes while someone looks at the
// layer and every 8 to 12 minutes otherwise, so a track is a handful of
// points and every rule below needs two samples at most.
//
// Linking an aircraft to a fire (a wrong link is worse than a missed one):
// - only bombers and helitaks, never a rescue, medical or police aircraft;
// - only bush and grass fires that are listed and not safe, patrolled or out;
// - two samples in flight, 4 to 20 minutes apart, both moving (20 kt or
//   more), both below 8,000 ft and both within 5 km of the fire's pin (plus
//   the radius of its burnt area when the agency gives a size). Passing
//   straight through that circle in 4 minutes takes less than 80 kt, so an
//   aircraft in transit does not qualify, and a helicopter parked at a base
//   next to a fire does not move;
// - when a second fire is about as near (less than twice as far) and is not
//   the same fire listed twice, nothing is linked.
// Measured on 13-11-2026 against public traces of 20 fleet aircraft and the
// fires of that week: two helicopters spent 6 to 12 minutes 6 to 9 km from a
// fire that was already under control, one hovering at night and one parked
// at its base. Neither was working on it; 5 km and "moving" keep both out.
//
// Rescue and medical aircraft: where one lands away from base is never named,
// labelled or matched to anything (it would show which hospital a patient
// went to). A flight only says `base`, `elsewhere` or `unknown`. Their bases
// are learnt, not listed: a place where the aircraft stayed three hours or
// more between two flights, twice within 30 days. A stop at a hospital is
// short. The learnt places stay inside this module.

const DAY_MS = 86_400_000;
export const HISTORY_MS = 7 * DAY_MS;

export const TRACK_ROLES = new Set([
  'bomber',
  'helitak',
  'scanner',
  'transport',
  'rescue',
  'medical',
]);
export const LINK_ROLES = new Set(['bomber', 'helitak']);
/** No fire, no incident and no named landing place for these, ever. */
export const PRIVATE_ROLES = new Set(['rescue', 'medical']);

export const LINK_KM = 5;
export const LINK_MAX_ALT_FT = 8000;
export const LINK_MIN_MS = 4 * 60_000;
export const LINK_MAX_GAP_MS = 20 * 60_000;
export const LINK_MIN_KTS = 20;
/** A link counts as "working" this long after the last sample near the fire. */
export const WORKING_MS = 30 * 60_000;
/** The incident route lists aircraft that worked on it in the last day. */
export const LINK_KEEP_MS = DAY_MS;

// A flight opens on a moving sample in the air and closes on the ground, or
// standing still twice on the same spot (a parked helicopter often keeps
// reporting a height instead of "ground").
const MOVING_KTS = 30;
const STILL_KTS = 3;
const STILL_KM = 0.1;
const STALE_MS = 5 * 60_000;
const TAKEOFF_GROUND_MS = 30 * 60_000;
const TAKEOFF_CLIMB_FPM = 300;
const TAKEOFF_MAX_ALT_FT = 4000;
const TAKEOFF_ABSENT_MS = 20 * 60_000;
const TAKEOFF_ABSENT_ALT_FT = 12_000;
/** Two polls without the aircraft and this long without a position: gone. */
export const LOST_MS = 15 * 60_000;
const LOW_FT = 3000;
const SLOW_KTS = 140;
const TRACK_MAX = 720;

// Bases of rescue and medical aircraft (see the top of the file).
const REST_MS = 3 * 3_600_000;
const BASE_KM = 10;
const BASE_RESTS = 2;
const BASE_KEEP_MS = 30 * DAY_MS;
/** A landed state older than this says nothing about now. */
const STATE_KEEP_MS = 12 * 3_600_000;

// Large air tanker take-off (one event per flight, at most).
const TANKER_WINDOW_MS = 90 * 60_000;
const HEADING_MAX_KM = 250;
const HEADING_MIN_KM = LINK_KM;
const HEADING_DEG = 10;
const HEADING_MIN_KTS = 150;
const HEADING_MIN_HA = 100;

/**
 * NAFC's own class decides: "FW - Type 1" is its large air tanker class (the
 * C-130, 737, RJ85, Q400 and MD-87). Type 4 SEAT is a single engine air
 * tanker; helicopters (RW) are never an air tanker.
 */
export function isLargeAirTanker(a) {
  return a?.role === 'bomber' && /^FW - Type 1\b/.test(a.class || '');
}

/** "Bomber 210" from the NAFC call sign, else the registration. */
export function aircraftName(a) {
  const c = String(a?.callsign || '').trim();
  if (!c) return a?.registration ?? null;
  return c.charAt(0) + c.slice(1).toLowerCase();
}

function km(a, b) {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) *
      Math.cos(b.lat * r) *
      Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

function bearing(a, b) {
  const r = Math.PI / 180;
  const y = Math.sin((b.lon - a.lon) * r) * Math.cos(b.lat * r);
  const x =
    Math.cos(a.lat * r) * Math.sin(b.lat * r) -
    Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lon - a.lon) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

const spot = (fire) => ({ lat: fire.point[0], lon: fire.point[1] });

/** Radius of the burnt area in km when the agency gives a size, at most 15. */
function fireRadiusKm(fire) {
  const ha = Number(fire.sizeHa);
  return ha > 0 ? Math.min(15, Math.sqrt(ha / 100 / Math.PI)) : 0;
}

/** A fire that is still being fought, not one that is safe, patrolled or out. */
export function isWorkedFire(fire) {
  return !/\b(safe|patrol(led)?|out|extinguished|completed?)\b/i.test(
    fire?.status || '',
  );
}

const inAustralia = (p) =>
  p.lat <= -9 && p.lat >= -45 && p.lon >= 110 && p.lon <= 155;

/**
 * The one fire this position can be linked to, or null: within reach, low
 * enough, and no other fire about as near.
 */
export function linkFire(p, fires) {
  if (p.altFt == null || p.altFt > LINK_MAX_ALT_FT) return null;
  const near = [];
  for (const fire of fires) {
    if (!isWorkedFire(fire)) continue;
    const d = km(p, spot(fire));
    if (d <= LINK_KM + fireRadiusKm(fire)) near.push({ fire, d });
  }
  if (!near.length) return null;
  near.sort((a, b) => a.d - b.d || a.fire.id.localeCompare(b.fire.id));
  const [best, second] = near;
  if (
    second &&
    second.d < 2 * best.d &&
    km(spot(best.fire), spot(second.fire)) > 1
  )
    return null;
  return best.fire;
}

const levelled = (fire) => /advice|watch|emergency/i.test(fire.level || '');

/**
 * The one significant fire (a warning level, or 100 ha or more) a fast
 * aircraft is flying straight at, or null when there is none or several.
 */
export function headingFire(p, fires) {
  if (p.track == null || !(p.gs >= HEADING_MIN_KTS)) return null;
  const ahead = [];
  for (const fire of fires) {
    if (!isWorkedFire(fire)) continue;
    if (!levelled(fire) && !(Number(fire.sizeHa) >= HEADING_MIN_HA)) continue;
    const d = km(p, spot(fire));
    if (d < HEADING_MIN_KM || d > HEADING_MAX_KM) continue;
    const off = Math.abs(
      ((bearing(p, spot(fire)) - p.track + 540) % 360) - 180,
    );
    if (off <= HEADING_DEG) ahead.push({ fire, d });
  }
  return ahead.length === 1 ? ahead[0] : null;
}

const iso = (ms) => (ms ? new Date(ms).toISOString() : null);

export class FlightTracker {
  constructor({ db = null, log = () => {}, now = Date.now() } = {}) {
    this.db = db;
    this.log = log;
    /** hex -> open flight */
    this.open = new Map();
    /** hex -> last sample { at, lat, lon, parked } */
    this.last = new Map();
    /** hex -> when a poll last asked for it and it was not there */
    this.absent = new Map();
    /** hex -> last ended flight, or null when there is none */
    this.ended = new Map();
    /** hex -> [{ lat, lon, n, last }] */
    this.bases = new Map();
    /** Without a database: every flight, newest last. */
    this.memory = [];
    if (!db) return;
    db.exec(`
      CREATE TABLE IF NOT EXISTS aircraft_flights(id TEXT PRIMARY KEY, hex TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS aircraft_flights_hex ON aircraft_flights(hex, started_at);
      CREATE TABLE IF NOT EXISTS aircraft_links(incident_id TEXT NOT NULL, flight_id TEXT NOT NULL, last_near INTEGER NOT NULL, PRIMARY KEY(incident_id, flight_id));
      CREATE TABLE IF NOT EXISTS aircraft_bases(hex TEXT PRIMARY KEY, value TEXT NOT NULL);
    `);
    this.prune(now);
    for (const row of db
      .prepare('SELECT payload FROM aircraft_flights WHERE ended_at IS NULL')
      .all()) {
      try {
        const f = JSON.parse(String(row.payload));
        // A restart keeps a running flight; one from before a long outage ended unseen.
        if (now - f.lastAt > 2 * 3_600_000) this.#close(f, 'lost', f.lastAt);
        else this.open.set(f.hex, f);
      } catch {
        // A broken row is no reason to stop the service.
      }
    }
    for (const row of db
      .prepare('SELECT hex, value FROM aircraft_bases')
      .all()) {
      try {
        this.bases.set(row.hex, JSON.parse(String(row.value)));
      } catch {
        // Learnt again.
      }
    }
  }

  #save(f) {
    if (!this.db) {
      if (!this.memory.includes(f)) this.memory.push(f);
      return;
    }
    this.db
      .prepare(
        `INSERT INTO aircraft_flights VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET ended_at=excluded.ended_at, payload=excluded.payload`,
      )
      .run(f.id, f.hex, f.startedAt, f.endedAt ?? null, JSON.stringify(f));
    const put = this.db.prepare(
      `INSERT INTO aircraft_links VALUES(?,?,?) ON CONFLICT(incident_id, flight_id) DO UPDATE SET last_near=excluded.last_near`,
    );
    for (const l of f.links) put.run(l.incidentId, f.id, l.lastNear);
  }

  /** Flights and links older than the 7 days of history go. */
  prune(now = Date.now()) {
    const cutoff = now - HISTORY_MS;
    // A flight nobody asked about for six hours (the aircraft left the fleet).
    for (const f of this.open.values())
      if (now - f.lastAt > 6 * 3_600_000) this.#close(f, 'lost', f.lastAt);
    this.memory = this.memory.filter((f) => (f.endedAt ?? f.lastAt) >= cutoff);
    if (!this.db) return;
    this.db
      .prepare(
        'DELETE FROM aircraft_flights WHERE COALESCE(ended_at, started_at) < ?',
      )
      .run(cutoff);
    this.db
      .prepare('DELETE FROM aircraft_links WHERE last_near < ?')
      .run(cutoff);
  }

  #lastEnded(hex) {
    if (this.ended.has(hex)) return this.ended.get(hex);
    let f = null;
    if (this.db) {
      const row = this.db
        .prepare(
          'SELECT payload FROM aircraft_flights WHERE hex=? AND ended_at IS NOT NULL ORDER BY ended_at DESC LIMIT 1',
        )
        .get(hex);
      if (row) f = JSON.parse(String(row.payload));
    }
    this.ended.set(hex, f);
    return f;
  }

  #isBase(hex, p) {
    return (this.bases.get(hex) ?? []).some(
      (b) => b.n >= BASE_RESTS && km(b, p) <= BASE_KM,
    );
  }

  #knowsBase(hex) {
    return (this.bases.get(hex) ?? []).some((b) => b.n >= BASE_RESTS);
  }

  /** The aircraft stood here for hours between two flights. */
  #rest(hex, p, at) {
    const list = (this.bases.get(hex) ?? []).filter(
      (b) => at - b.last <= BASE_KEEP_MS,
    );
    const hit = list.find((b) => km(b, p) <= BASE_KM);
    if (hit) {
      hit.n += 1;
      hit.last = at;
    } else list.push({ lat: p.lat, lon: p.lon, n: 1, last: at });
    list.sort((a, b) => b.last - a.last);
    list.length = Math.min(list.length, 8);
    this.bases.set(hex, list);
    this.db
      ?.prepare(
        'INSERT INTO aircraft_bases VALUES(?,?) ON CONFLICT(hex) DO UPDATE SET value=excluded.value',
      )
      .run(hex, JSON.stringify(list));
  }

  #close(f, end, at, seen = false) {
    f.endedAt = at;
    f.end = end;
    f.landingSeen = end === 'landed' && seen;
    if (PRIVATE_ROLES.has(f.role)) {
      const p = f.track.at(-1);
      // Only ever one of these three words; no place, no name.
      f.landing =
        end !== 'landed' || !p
          ? null
          : this.#isBase(f.hex, { lat: p[1], lon: p[2] })
            ? 'base'
            : this.#knowsBase(f.hex)
              ? 'elsewhere'
              : 'unknown';
    }
    delete f.near;
    delete f.heading;
    this.open.delete(f.hex);
    this.ended.set(f.hex, f);
    this.#save(f);
  }

  /**
   * One fresh position of a fleet aircraft. `p` is the layer's position with
   * `gs` (knots, 0 allowed) and `climbFpm` added; `fires` the active landscape
   * fires. Returns the events it caused (large air tanker on its way).
   */
  observe(a, p, fires = [], now = Date.now()) {
    const events = [];
    if (!a || !TRACK_ROLES.has(a.role)) return events;
    if (!inAustralia(p)) return events;
    const at = p.seenAt;
    const hex = a.hex;
    const prev = this.last.get(hex);
    if (now - at > STALE_MS || (prev && at <= prev.at)) return events;
    const still = !p.onGround && p.gs != null && p.gs < STILL_KTS;
    const parked =
      p.onGround || (still && !!prev?.still && km(prev, p) <= STILL_KM);
    this.last.set(hex, {
      at,
      lat: p.lat,
      lon: p.lon,
      gs: p.gs,
      still: still || p.onGround,
      parked,
    });

    let f = this.open.get(hex);
    if (f && parked) {
      // Standing still twice: it landed by the first of the two.
      const landedAt = p.onGround ? at : prev.at;
      if (p.onGround) this.#point(f, p, at);
      this.#close(f, 'landed', landedAt, true);
      return events;
    }
    if (!f) {
      if (p.onGround || p.altFt == null || !(p.gs >= MOVING_KTS)) return events;
      const before = this.#lastEnded(hex);
      f = {
        id: `${hex}-${Math.round(at / 1000)}`,
        hex,
        role: a.role,
        startedAt: at,
        // Seen on the ground just before, low and climbing, or still on its
        // way up right after a poll that did not find it: this is the
        // take-off. Otherwise the aircraft came into view somewhere en route.
        takeoffSeen:
          (!!prev?.still && at - prev.at <= TAKEOFF_GROUND_MS) ||
          (p.climbFpm >= TAKEOFF_CLIMB_FPM && p.altFt <= TAKEOFF_MAX_ALT_FT) ||
          (at - (this.absent.get(hex) ?? -Infinity) <= TAKEOFF_ABSENT_MS &&
            (p.altFt <= TAKEOFF_ABSENT_ALT_FT ||
              p.climbFpm >= TAKEOFF_CLIMB_FPM)),
        endedAt: null,
        end: null,
        lastAt: at,
        missed: 0,
        track: [],
        links: [],
      };
      if (
        PRIVATE_ROLES.has(a.role) &&
        before?.end === 'landed' &&
        before.track?.length &&
        at - before.endedAt >= REST_MS
      ) {
        const [, lat, lon] = before.track.at(-1);
        if (km({ lat, lon }, p) <= BASE_KM) this.#rest(hex, { lat, lon }, at);
      }
      this.open.set(hex, f);
    }
    f.lastAt = at;
    f.missed = 0;
    this.#point(f, p, at);

    if (LINK_ROLES.has(a.role)) {
      const fire = p.gs >= LINK_MIN_KTS ? linkFire(p, fires) : null;
      const link = fire && f.links.find((l) => l.incidentId === fire.id);
      if (link) link.lastNear = at;
      else if (fire) {
        const first = f.near?.id === fire.id ? f.near : null;
        if (!first || at - first.at > LINK_MAX_GAP_MS)
          f.near = { id: fire.id, at };
        else if (at - first.at >= LINK_MIN_MS) {
          f.links.push({
            incidentId: fire.id,
            title: fire.title ?? null,
            location: fire.location ?? null,
            since: first.at,
            lastNear: at,
          });
          f.near = null;
        }
      } else if (p.gs >= LINK_MIN_KTS) f.near = null;
      // (A slow sample, a hover over a dam, neither counts nor resets.)

      if (
        isLargeAirTanker(a) &&
        f.takeoffSeen &&
        !f.pushed &&
        at - f.startedAt <= TANKER_WINDOW_MS
      ) {
        const linked = f.links.at(-1);
        const linkedFire =
          linked && fires.find((x) => x.id === linked.incidentId);
        let target = null;
        if (linkedFire) target = { fire: linkedFire, mode: 'working' };
        else {
          const ahead = headingFire(p, fires);
          // Twice in a row the same single fire ahead, and closer.
          if (ahead && f.heading?.id === ahead.fire.id && ahead.d < f.heading.d)
            target = { fire: ahead.fire, mode: 'heading' };
          f.heading = ahead ? { id: ahead.fire.id, d: ahead.d } : null;
        }
        if (target) {
          // Marked and stored before anyone sends: never twice for a flight.
          f.pushed = at;
          events.push({
            type: 'air-tanker',
            flightId: f.id,
            hex,
            name: aircraftName(a),
            mode: target.mode,
            fire: target.fire,
          });
        }
      }
    }
    this.#save(f);
    return events;
  }

  #point(f, p, at) {
    f.track.push([
      Math.round(at / 1000),
      Math.round(p.lat * 1e4) / 1e4,
      Math.round(p.lon * 1e4) / 1e4,
      p.onGround ? 0 : (p.altFt ?? null),
    ]);
    // A very long flight keeps its start and thins the older half.
    if (f.track.length > TRACK_MAX) {
      const half = f.track.length >> 1;
      f.track = [
        ...f.track.slice(0, half).filter((_, i) => i % 2 === 0),
        ...f.track.slice(half),
      ];
    }
  }

  /**
   * After a poll that succeeded: aircraft that were asked for and did not
   * come back are out of range or on the ground with the transponder off.
   * Polls that fail or pause never end a flight.
   */
  afterPoll(asked, now = Date.now()) {
    for (const hex of asked) {
      const last = this.last.get(hex);
      if (!last || last.at < now - STALE_MS) this.absent.set(hex, now);
    }
    for (const f of this.open.values()) {
      if (!asked.has(f.hex) || f.lastAt >= now - STALE_MS) continue;
      f.missed += 1;
      if (f.missed < 2 || now - f.lastAt < LOST_MS) {
        this.#save(f);
        continue;
      }
      const p = f.track.at(-1);
      const last = this.last.get(f.hex);
      const low = p?.[3] != null && p[3] <= LOW_FT;
      this.#close(
        f,
        low && !(last?.gs > SLOW_KTS) ? 'landed' : 'lost',
        f.lastAt,
      );
    }
  }

  /** Hex codes with a flight under way: these are polled first. */
  airborne() {
    return [...this.open.keys()];
  }

  /** airborne, at_base, landed_elsewhere, landed, unknown, or null (no flight known). */
  state(hex, now = Date.now()) {
    if (this.open.has(hex)) return 'airborne';
    const f = this.#lastEnded(hex);
    if (!f || now - f.endedAt > STATE_KEEP_MS) return null;
    if (f.end !== 'landed') return 'unknown';
    if (f.landing === 'base') return 'at_base';
    if (f.landing === 'elsewhere') return 'landed_elsewhere';
    return 'landed';
  }

  current(hex) {
    return this.open.get(hex) ?? null;
  }

  /** What the API shows of a flight. Nothing here names a place. */
  publicFlight(f, now = Date.now()) {
    const out = {
      id: f.id,
      state: f.endedAt ? (f.end === 'landed' ? 'landed' : 'lost') : 'airborne',
      startedAt: iso(f.startedAt),
      takeoffSeen: !!f.takeoffSeen,
      endedAt: iso(f.endedAt),
      lastSeenAt: iso(f.lastAt),
      track: f.track,
    };
    if (PRIVATE_ROLES.has(f.role)) {
      out.landing = f.endedAt ? (f.landing ?? null) : null;
      // A finished rescue or medical flight keeps no track in the history: the
      // line would end on the landing place (a hospital, an accident scene),
      // which is exactly what `landing` refuses to name. While the aircraft is
      // airborne its position is on the map anyway, so that track stays.
      out.trackHidden = !!f.endedAt;
      if (f.endedAt) out.track = [];
      return out;
    }
    out.fires = f.links.map((l) => ({
      id: l.incidentId,
      title: l.title,
      location: l.location,
      since: iso(l.since),
      lastNear: iso(l.lastNear),
      working: !f.endedAt && now - l.lastNear <= WORKING_MS,
    }));
    return out;
  }

  /** The flights of one aircraft in the last 7 days, newest first. */
  flights(hex, now = Date.now()) {
    const cutoff = now - HISTORY_MS;
    let list;
    if (this.db)
      list = this.db
        .prepare(
          'SELECT payload FROM aircraft_flights WHERE hex=? AND COALESCE(ended_at, started_at) >= ? ORDER BY started_at DESC LIMIT 200',
        )
        .all(hex, cutoff)
        .map((r) => JSON.parse(String(r.payload)));
    else
      list = this.memory
        .filter((f) => f.hex === hex && (f.endedAt ?? f.lastAt) >= cutoff)
        .sort((a, b) => b.startedAt - a.startedAt);
    return list.map((f) => this.publicFlight(f, now));
  }

  /** Flights linked to an incident in the last day, newest link first. */
  forIncident(incidentId, now = Date.now()) {
    const cutoff = now - LINK_KEEP_MS;
    let list;
    if (this.db)
      list = this.db
        .prepare(
          `SELECT f.payload FROM aircraft_links l JOIN aircraft_flights f ON f.id=l.flight_id
           WHERE l.incident_id=? AND l.last_near>=? ORDER BY l.last_near DESC LIMIT 100`,
        )
        .all(incidentId, cutoff)
        .map((r) => JSON.parse(String(r.payload)));
    else
      list = this.memory.filter((f) =>
        f.links.some(
          (l) => l.incidentId === incidentId && l.lastNear >= cutoff,
        ),
      );
    return list
      .filter((f) => !PRIVATE_ROLES.has(f.role))
      .map((f) => {
        const link = f.links.find((l) => l.incidentId === incidentId);
        return {
          hex: f.hex,
          flightId: f.id,
          since: iso(link.since),
          lastNear: iso(link.lastNear),
          working: !f.endedAt && now - link.lastNear <= WORKING_MS,
          airborne: !f.endedAt,
          track: f.track,
        };
      });
  }
}
