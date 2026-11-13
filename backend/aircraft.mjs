// Firefighting, rescue, police and flying doctor aircraft over Australia (wish
// Chris 08-11-2026).
//
// Positions come from adsb.lol (/v2/hex/{list}, several aircraft per request)
// with HELI_ADSB_API_KEY. That key allows 10,000 requests a month, so:
// - only poll while someone has the aircraft layer open (last 5 minutes);
// - every 3 minutes, one request per 150 aircraft (#hexes leaves out what
//   cannot show);
// - a budget bucket of 300 a day on top, and after a 429 a growing pause that
//   survives a restart ("Repeated rate-limit hits can revoke a free key").
//
// Which aircraft: fleet.mjs (NAFC call signs, plane-alert-db, tar1090-db),
// rebuilt once a day. The last good list is kept in SQLite, so a restart needs
// no download; aircraft-fleet.json is the fallback. Rescue, police and medical
// aircraft always show. Bombers and helitaks only near an active bush or grass
// fire: many of them fly other jobs too (crop spraying, lifting), and a spray
// run must not look like a water bomber at work.
//
// Flights (flights.mjs, 13-11-2026): with `tracking` on the service also polls
// when nobody looks, so a flight has a track, a firefighting aircraft can be
// linked to the fire it works on and a large air tanker's take-off is seen.
// That comes out of the same bucket of 300 a day and never adds to it:
// - one request a round, never more: aircraft in flight first, then the large
//   air tankers (only with an active fire), the rescue helicopters, and in the
//   room that is left the other firefighting aircraft in turns (with a fire)
//   or the medical planes (without). Police aircraft are not followed;
// - every 8 minutes while a followed aircraft is in the air (180 a day at
//   most), every 12 minutes otherwise (120 a day);
// - it stops when the bucket is down to 10, which stay for people who open
//   the layer, and a poll for the layer counts as a round here too;
// - the bucket's level is kept in SQLite, so a restart cannot refill it.
import { readFileSync } from 'node:fs';
import { fetchFleet } from './fleet.mjs';
import {
  FlightTracker,
  PRIVATE_ROLES,
  TRACK_ROLES,
  WORKING_MS,
  aircraftName,
  isLargeAirTanker,
} from './flights.mjs';

const API = 'https://api.adsb.lol/v2/hex/';
// adsb.lol documents no limit on the hex list, so this stays at a modest 150.
const CHUNK = 150;
export const VIEW_WINDOW_MS = 5 * 60_000;
export const CADENCE_MS = 3 * 60_000;
export const KEEP_MS = 30 * 60_000;
export const NEAR_FIRE_KM = 50;
export const FLEET_REFRESH_MS = 24 * 3_600_000;
export const FLEET_RETRY_MS = 3_600_000;
export const MIN_FLEET = 100;
// Following flights without a viewer (see the top of the file).
export const WATCH_ACTIVE_MS = 8 * 60_000;
export const WATCH_IDLE_MS = 12 * 60_000;
export const WATCH_RESERVE = 10;
export const ATTRIBUTION =
  'Aircraft positions: adsb.lol (ODbL). Call signs: NAFC. Aircraft lists: plane-alert-db (ODbL), tar1090-db.';

/** Flight tracking is on unless AIRCRAFT_TRACKING says off. */
export function trackingOn(env = process.env) {
  return !['uit', 'off', 'false', '0'].includes(
    String(env.AIRCRAFT_TRACKING ?? '')
      .trim()
      .toLowerCase(),
  );
}
// Shown wherever they are; the firefighting roles only near a fire.
export const ALWAYS_SHOWN = new Set(['rescue', 'police', 'medical']);

const BUNDLED = new URL('./aircraft-fleet.json', import.meta.url);

export function loadFleet(path = BUNDLED) {
  return JSON.parse(readFileSync(path, 'utf8')).fleet;
}

/** Entries with a hex code and a role; anything else in a stored list is dropped. */
export function validFleet(list) {
  return Array.isArray(list)
    ? list.filter(
        (a) => /^[0-9a-f]{6}$/.test(a?.hex) && typeof a.role === 'string',
      )
    : [];
}

/** Token bucket: at most `max` in a row, refilled with `perDay` per 24 hours. */
export class Budget {
  constructor(max = 30, perDay = 300, now = Date.now()) {
    this.max = max;
    this.perDay = perDay;
    this.tokens = max;
    this.at = now;
  }
  #fill(now) {
    // A clock that jumps back (or a test clock) never drains the bucket.
    this.tokens = Math.min(
      this.max,
      this.tokens + (Math.max(0, now - this.at) / 86_400_000) * this.perDay,
    );
    this.at = now;
  }
  level(now = Date.now()) {
    this.#fill(now);
    return this.tokens;
  }
  take(n = 1, now = Date.now()) {
    this.#fill(now);
    if (this.tokens < n) return false;
    this.tokens -= n;
    return true;
  }
  /** Continue from a stored level; never above a full bucket. */
  restore(tokens, at) {
    if (!Number.isFinite(tokens) || !Number.isFinite(at)) return;
    this.tokens = Math.min(this.max, Math.max(0, tokens));
    this.at = at;
  }
}

/** Pause after n 429s in a row: 1 min, 5, 15, 30 min, 1 h, 2 h, then 6 h. Never shorter than Retry-After. */
export function pauseAfter429(n, retryAfterS = 0) {
  const steps = [60, 300, 900, 1800, 3600, 7200, 21600];
  return (
    Math.max(
      steps[Math.min(Math.max(n, 1), steps.length) - 1],
      retryAfterS || 0,
    ) * 1000
  );
}

export function distanceKm([lat1, lon1], [lat2, lon2]) {
  const r = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * r) / 2) ** 2 +
    Math.cos(lat1 * r) *
      Math.cos(lat2 * r) *
      Math.sin(((lon2 - lon1) * r) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

/** Bush, grass, scrub and forest fires; not a house, car or alarm in town. */
export function isLandscapeFire(incident) {
  if (incident?.category !== 'fire' || !Array.isArray(incident.point))
    return false;
  return !/structure|building|house|residential|vehicle|car fire|truck|rubbish|chimney|alarm|smoke|electrical|non[- ]structure/i.test(
    incident.title || '',
  );
}

/** The fire an aircraft is working near, or null. Rescue, police and medical aircraft need none. */
export function nearestFire(point, fires, maxKm = NEAR_FIRE_KM) {
  let best = null;
  for (const f of fires) {
    const km = distanceKm(point, f.point);
    if (km <= maxKm && (!best || km < best.km)) best = { km, fire: f };
  }
  return (
    best && {
      id: best.fire.id,
      title: best.fire.title,
      location: best.fire.location,
      distanceKm: Math.round(best.km * 10) / 10,
    }
  );
}

export class AircraftService {
  constructor({
    db = null,
    key = process.env.HELI_ADSB_API_KEY || '',
    fetcher = fetch,
    fleet = null,
    fleetSource = () => fetchFleet(),
    activeFires = () => [],
    budget = new Budget(),
    tracking = false,
    onEvent = null,
    log = (o) => console.log(JSON.stringify({ aircraft: true, ...o })),
  } = {}) {
    this.db = db;
    this.key = key;
    this.fetcher = fetcher;
    this.fleetSource = fleetSource;
    this.activeFires = activeFires;
    this.budget = budget;
    this.log = log;
    this.positions = new Map();
    this.lastView = -Infinity;
    this.lastPoll = -Infinity;
    this.lastWatch = -Infinity;
    this.watchTurn = 0;
    this.lastPrune = -Infinity;
    this.onEvent = onEvent;
    this.lastSuccess = 0;
    this.polling = false;
    this.round = 0;
    this.tooMany = 0;
    this.pausedUntil = 0;
    this.lastError = null;
    this.fleetCheckedAt = -Infinity;
    this.refreshingFleet = false;
    if (db) {
      db.exec(
        'CREATE TABLE IF NOT EXISTS aircraft_state(key TEXT PRIMARY KEY, value TEXT NOT NULL)',
      );
      const row = db
        .prepare("SELECT value FROM aircraft_state WHERE key='pausedUntil'")
        .get();
      this.pausedUntil = Number(row?.value) || 0;
      try {
        const saved = JSON.parse(
          String(
            db
              .prepare("SELECT value FROM aircraft_state WHERE key='budget'")
              .get()?.value ?? 'null',
          ),
        );
        if (saved) budget.restore(saved.tokens, saved.at);
      } catch {
        // A full bucket, as before.
      }
    }
    this.tracker = tracking ? new FlightTracker({ db, log }) : null;
    if (fleet) this.#useFleet(fleet, 0);
    else {
      // The newest of the last good rebuild and the bundled file.
      let bundled = { fleet: [], builtAt: 0 };
      try {
        const raw = JSON.parse(readFileSync(BUNDLED, 'utf8'));
        bundled = {
          fleet: validFleet(raw.fleet),
          builtAt: Date.parse(raw.built) || 0,
        };
      } catch (error) {
        this.log({
          fleet: 'no bundled list',
          error: String(error).slice(0, 80),
        });
      }
      const stored = this.#storedFleet();
      const pick =
        stored && stored.builtAt >= bundled.builtAt ? stored : bundled;
      this.#useFleet(pick.fleet, pick.builtAt);
    }
  }

  #useFleet(list, builtAt) {
    this.fleet = new Map(list.map((a) => [a.hex, a]));
    // Which layers exist, so the app only offers those.
    this.roles = [...new Set(list.map((a) => a.role))].sort((a, b) =>
      a.localeCompare(b),
    );
    this.fleetBuiltAt = builtAt;
    // CC BY: name CASA whenever its register put an aircraft on the list.
    this.attribution =
      ATTRIBUTION +
      (list.some((a) => a.source === 'casa')
        ? ' Aircraft register: CASA (CC BY 4.0).'
        : '');
  }

  #storedFleet() {
    const row = this.db
      ?.prepare("SELECT value FROM aircraft_state WHERE key='fleet'")
      .get();
    if (!row) return null;
    try {
      const { built, fleet } = JSON.parse(String(row.value));
      const list = validFleet(fleet);
      return list.length >= MIN_FLEET
        ? { fleet: list, builtAt: Date.parse(built) || 0 }
        : null;
    } catch {
      return null;
    }
  }

  #savePause() {
    this.db
      ?.prepare(
        "INSERT INTO aircraft_state VALUES('pausedUntil', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(String(this.pausedUntil));
  }

  #saveBudget() {
    this.db
      ?.prepare(
        "INSERT INTO aircraft_state VALUES('budget', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(JSON.stringify({ tokens: this.budget.tokens, at: this.budget.at }));
  }

  /**
   * Rebuilds the fleet (fleet.mjs). A source that half fails, such as an
   * empty NAFC page or a cut-off download, gives a short list, so the new one
   * must have MIN_FLEET aircraft and 80% of the current count; otherwise, and
   * on any error, the current fleet stays. Never throws.
   */
  async refreshFleet(now = Date.now()) {
    if (this.refreshingFleet) return false;
    this.refreshingFleet = true;
    this.fleetCheckedAt = now;
    try {
      const built = await this.fleetSource();
      const list = validFleet(built?.fleet);
      if (list.length < Math.max(MIN_FLEET, 0.8 * this.fleet.size)) {
        this.log({
          fleet: 'kept',
          reason: 'new list too small',
          size: list.length,
          current: this.fleet.size,
        });
        return false;
      }
      this.db
        ?.prepare(
          "INSERT INTO aircraft_state VALUES('fleet', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        )
        .run(
          JSON.stringify({ built: new Date(now).toISOString(), fleet: list }),
        );
      this.#useFleet(list, now);
      this.log({ fleet: 'refreshed', size: list.length, roles: this.roles });
      return true;
    } catch (error) {
      this.log({
        fleet: 'kept',
        reason: String(error?.message || error).slice(0, 160),
      });
      return false;
    } finally {
      this.refreshingFleet = false;
    }
  }

  /** Once a day; after a failed or rejected attempt, again an hour later. */
  async refreshFleetIfDue(now = Date.now()) {
    if (!this.key) return false;
    if (
      now - this.fleetBuiltAt < FLEET_REFRESH_MS ||
      now - this.fleetCheckedAt < FLEET_RETRY_MS
    )
      return false;
    return await this.refreshFleet(now);
  }

  /** The app asked for the layer: count it as viewing and poll if it is time. */
  request(now = Date.now()) {
    this.lastView = now;
    void this.tick(now);
    return this.snapshot(now);
  }

  // What one poll asks for. The budget pays per request of CHUNK aircraft, so:
  // - firefighting aircraft only show near a fire; without any active
  //   landscape fire they are not asked for at all;
  // - the medical group (Flying Doctor planes on long transfer flights) rides
  //   along in the free room of the last request and gets a request of its own
  //   only every second round. With the 08-11-2026 fleet that is 2.5 requests a
  //   round in the fire season instead of 3, and 1 without fires.
  #hexes() {
    let fires = true;
    try {
      fires = this.activeFires().some(isLandscapeFire);
    } catch {
      // Unknown, so ask for everything as before.
    }
    const fast = [];
    const slow = [];
    for (const a of this.fleet.values()) {
      if (a.role === 'medical') slow.push(a.hex);
      else if (ALWAYS_SHOWN.has(a.role) || fires) fast.push(a.hex);
    }
    const room = (CHUNK - (fast.length % CHUNK)) % CHUNK;
    return fast.concat(this.round % 2 === 0 ? slow : slow.slice(0, room));
  }

  // One request for the flights (see the top of the file), in this order:
  // aircraft in flight, large air tankers when there is a fire, rescue
  // helicopters, then the other firefighting aircraft or the medical planes
  // in turns.
  #watchHexes(fires) {
    const out = new Set();
    const add = (hex) => {
      if (out.size < CHUNK && this.fleet.has(hex)) out.add(hex);
    };
    for (const hex of this.tracker.airborne()) add(hex);
    const fleet = [...this.fleet.values()];
    if (fires.length)
      for (const a of fleet) if (isLargeAirTanker(a)) add(a.hex);
    for (const a of fleet) if (a.role === 'rescue') add(a.hex);
    // With a fire the room goes to the firefighting aircraft, else to the
    // medical planes; whoever does not fit waits for a next round.
    const rest = fleet.filter(
      (a) =>
        TRACK_ROLES.has(a.role) &&
        !out.has(a.hex) &&
        (fires.length ? !ALWAYS_SHOWN.has(a.role) : a.role === 'medical'),
    );
    const room = CHUNK - out.size;
    for (let i = 0; i < Math.min(room, rest.length); i++)
      add(rest[(this.watchTurn + i) % rest.length].hex);
    if (rest.length > room)
      this.watchTurn = (this.watchTurn + room) % rest.length;
    return [...out];
  }

  async tick(now = Date.now()) {
    if (!this.key || this.polling) return;
    if (now < this.pausedUntil) return;
    // For someone looking at the layer: everything, every 3 minutes. Otherwise
    // one request for the flights, which leaves a reserve in the bucket.
    const viewed =
      now - this.lastView <= VIEW_WINDOW_MS &&
      now - this.lastPoll >= CADENCE_MS;
    const watch =
      !viewed &&
      this.tracker &&
      now - this.lastWatch >=
        (this.tracker.airborne().length ? WATCH_ACTIVE_MS : WATCH_IDLE_MS);
    if (!viewed && !watch) return;
    if (watch && this.budget.level(now) - 1 < WATCH_RESERVE) return;
    let fires = [];
    try {
      fires = this.activeFires().filter(isLandscapeFire);
    } catch {
      // No fires known this round: nothing is linked.
    }
    const hexes = viewed ? this.#hexes() : this.#watchHexes(fires);
    const chunks = [];
    for (let i = 0; i < hexes.length; i += CHUNK)
      chunks.push(hexes.slice(i, i + CHUNK));
    if (!chunks.length) return;
    if (!this.budget.take(chunks.length, now)) return;
    this.#saveBudget();
    this.polling = true;
    this.lastWatch = now;
    if (viewed) {
      this.lastPoll = now;
      this.round += 1;
    }
    const events = [];
    try {
      for (const chunk of chunks) {
        const res = await this.fetcher(API + chunk.join(','), {
          headers: { 'x-api-key': this.key, Accept: 'application/json' },
          signal: AbortSignal.timeout(15_000),
        });
        if (res.status === 429) {
          this.tooMany += 1;
          const wait = pauseAfter429(
            this.tooMany,
            Number(res.headers.get('retry-after')) || 0,
          );
          this.pausedUntil = now + wait;
          this.#savePause();
          this.lastError = `429, pause ${Math.round(wait / 60_000)} min`;
          this.log({
            status: 429,
            pauseMin: Math.round(wait / 60_000),
            inARow: this.tooMany,
          });
          return;
        }
        if (!res.ok) {
          this.lastError = `HTTP ${res.status}`;
          this.log({ status: res.status });
          return;
        }
        const body = await res.json();
        for (const a of body.ac ?? []) {
          const hex = String(a.hex || '').toLowerCase();
          if (
            !this.fleet.has(hex) ||
            typeof a.lat !== 'number' ||
            typeof a.lon !== 'number'
          )
            continue;
          const seenAt =
            now - Math.round((Number(a.seen_pos ?? a.seen) || 0) * 1000);
          const old = this.positions.get(hex);
          if (old && old.seenAt >= seenAt) continue;
          const position = {
            lat: a.lat,
            lon: a.lon,
            altFt: a.alt_baro === 'ground' ? 0 : Number(a.alt_baro) || null,
            onGround: a.alt_baro === 'ground',
            gsKts: Number(a.gs) || null,
            track: Number(a.track) || null,
            flight: String(a.flight || '').trim() || null,
            seenAt,
          };
          this.positions.set(hex, position);
          if (this.tracker)
            events.push(
              ...this.tracker.observe(
                this.fleet.get(hex),
                {
                  ...position,
                  gs: typeof a.gs === 'number' ? a.gs : null,
                  climbFpm:
                    typeof a.baro_rate === 'number'
                      ? a.baro_rate
                      : typeof a.geom_rate === 'number'
                        ? a.geom_rate
                        : null,
                },
                fires,
                now,
              ),
            );
        }
      }
      this.tooMany = 0;
      this.lastSuccess = now;
      this.lastError = null;
      this.tracker?.afterPoll(new Set(hexes), now);
      if (this.tracker && now - this.lastPrune > 3_600_000) {
        this.lastPrune = now;
        this.tracker.prune(now);
      }
    } catch (error) {
      this.lastError = String(error?.name || error).slice(0, 80);
      this.log({ error: this.lastError });
    } finally {
      this.polling = false;
      // After the poll, also one that stopped half way, and never in its
      // way: a failing listener is logged.
      for (const event of events) {
        try {
          await this.onEvent?.(event);
        } catch (error) {
          this.log({ event: event.type, error: String(error).slice(0, 120) });
        }
      }
    }
  }

  #describe(a) {
    return {
      hex: a.hex,
      registration: a.registration,
      callsign: a.callsign,
      name: aircraftName(a),
      role: a.role,
      operator: a.operator ?? null,
      rotor: a.rotor,
      class: a.class,
      type: a.type,
      model: a.model,
      large: isLargeAirTanker(a),
    };
  }

  /**
   * The flights of one aircraft in the last 7 days (flights.mjs), or null
   * when the aircraft is not followed. Rescue and medical flights carry no
   * fire and no place: only `landing` base, elsewhere or unknown.
   */
  flightsOf(hex, now = Date.now()) {
    const a = this.fleet.get(hex);
    if (!a || !this.tracker || !TRACK_ROLES.has(a.role)) return null;
    return {
      aircraft: this.#describe(a),
      state: this.tracker.state(hex, now),
      historyDays: 7,
      flights: this.tracker.flights(hex, now),
      attribution: this.attribution,
    };
  }

  /** Firefighting aircraft linked to an incident in the last 24 hours. */
  incidentAircraft(incidentId, now = Date.now()) {
    const aircraft = [];
    for (const link of this.tracker?.forIncident(incidentId, now) ?? []) {
      const a = this.fleet.get(link.hex);
      if (a) aircraft.push({ ...this.#describe(a), ...link });
    }
    return { incidentId, aircraft, attribution: this.attribution };
  }

  snapshot(now = Date.now()) {
    const fires = this.activeFires().filter(isLandscapeFire);
    const aircraft = [];
    for (const [hex, p] of this.positions) {
      const a = this.fleet.get(hex);
      // Gone from a rebuilt fleet, or not seen for too long.
      if (!a || now - p.seenAt > KEEP_MS) {
        this.positions.delete(hex);
        continue;
      }
      const nearFire = nearestFire([p.lat, p.lon], fires);
      if (!ALWAYS_SHOWN.has(a.role) && !nearFire) continue;
      const flight = this.tracker?.current(hex) ?? null;
      const link = PRIVATE_ROLES.has(a.role)
        ? null
        : flight?.links.findLast((l) => now - l.lastNear <= WORKING_MS);
      aircraft.push({
        ...this.#describe(a),
        ...p,
        seenAt: new Date(p.seenAt).toISOString(),
        // A medical aircraft is shown as an aircraft only, next to nothing.
        nearFire: a.role === 'medical' ? null : nearFire,
        // Flight (flights.mjs): airborne, at_base, landed_elsewhere, landed,
        // unknown or null. Never where a rescue or medical aircraft landed.
        state: this.tracker?.state(hex, now) ?? null,
        flightId: flight?.id ?? null,
        airborneSince: flight ? new Date(flight.startedAt).toISOString() : null,
        workingOn: link
          ? {
              id: link.incidentId,
              title: link.title,
              location: link.location,
              since: new Date(link.since).toISOString(),
            }
          : null,
      });
    }
    return {
      aircraft,
      roles: this.roles,
      updatedAt: this.lastSuccess
        ? new Date(this.lastSuccess).toISOString()
        : null,
      attribution: this.attribution,
      status: {
        enabled: Boolean(this.key),
        tracking: Boolean(this.tracker),
        pausedUntil:
          this.pausedUntil > now
            ? new Date(this.pausedUntil).toISOString()
            : null,
        error: this.lastError,
        fleetSize: this.fleet.size,
        fleetBuiltAt: this.fleetBuiltAt
          ? new Date(this.fleetBuiltAt).toISOString()
          : null,
      },
    };
  }
}
