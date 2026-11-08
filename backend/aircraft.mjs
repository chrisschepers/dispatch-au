// Firefighting and rescue aircraft over Australia (wish Chris 08-11-2026).
//
// Positions come from adsb.lol (/v2/hex/{list}, several aircraft per request)
// with HELI_ADSB_API_KEY. That key allows 10,000 requests a month, so:
// - only poll while someone has the aircraft layer open (last 5 minutes);
// - every 3 minutes, two requests for the whole fleet;
// - a budget bucket of 300 a day on top, and after a 429 a growing pause that
//   survives a restart ("Repeated rate-limit hits can revoke a free key").
//
// Which aircraft: aircraft-fleet.json (scripts/aircraft-fleet.mjs, NAFC call
// signs). Rescue helicopters always show. Bombers and helitaks only near an
// active bush or grass fire: many of them fly other jobs too (crop spraying,
// lifting), and a spray run must not look like a water bomber at work.
import { readFileSync } from 'node:fs';

const API = 'https://api.adsb.lol/v2/hex/';
const CHUNK = 150;
export const VIEW_WINDOW_MS = 5 * 60_000;
export const CADENCE_MS = 3 * 60_000;
export const KEEP_MS = 30 * 60_000;
export const NEAR_FIRE_KM = 50;

export function loadFleet(
  path = new URL('./aircraft-fleet.json', import.meta.url),
) {
  return JSON.parse(readFileSync(path, 'utf8')).fleet;
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

/** The fire an aircraft is working near, or null. Rescue helicopters need none. */
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
    fleet = loadFleet(),
    activeFires = () => [],
    budget = new Budget(),
    log = (o) => console.log(JSON.stringify({ aircraft: true, ...o })),
  } = {}) {
    this.db = db;
    this.key = key;
    this.fetcher = fetcher;
    this.fleet = new Map(fleet.map((a) => [a.hex, a]));
    this.activeFires = activeFires;
    this.budget = budget;
    this.log = log;
    this.positions = new Map();
    this.lastView = -Infinity;
    this.lastPoll = -Infinity;
    this.lastSuccess = 0;
    this.polling = false;
    this.tooMany = 0;
    this.pausedUntil = 0;
    this.lastError = null;
    if (db) {
      db.exec(
        'CREATE TABLE IF NOT EXISTS aircraft_state(key TEXT PRIMARY KEY, value TEXT NOT NULL)',
      );
      const row = db
        .prepare("SELECT value FROM aircraft_state WHERE key='pausedUntil'")
        .get();
      this.pausedUntil = Number(row?.value) || 0;
    }
  }

  #savePause() {
    this.db
      ?.prepare(
        "INSERT INTO aircraft_state VALUES('pausedUntil', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
      )
      .run(String(this.pausedUntil));
  }

  /** The app asked for the layer: count it as viewing and poll if it is time. */
  request(now = Date.now()) {
    this.lastView = now;
    void this.tick(now);
    return this.snapshot(now);
  }

  async tick(now = Date.now()) {
    if (!this.key || this.polling) return;
    if (now - this.lastView > VIEW_WINDOW_MS) return;
    if (now - this.lastPoll < CADENCE_MS || now < this.pausedUntil) return;
    const hexes = [...this.fleet.keys()];
    const chunks = [];
    for (let i = 0; i < hexes.length; i += CHUNK)
      chunks.push(hexes.slice(i, i + CHUNK));
    if (!this.budget.take(chunks.length, now)) return;
    this.polling = true;
    this.lastPoll = now;
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
          this.positions.set(hex, {
            lat: a.lat,
            lon: a.lon,
            altFt: a.alt_baro === 'ground' ? 0 : Number(a.alt_baro) || null,
            onGround: a.alt_baro === 'ground',
            gsKts: Number(a.gs) || null,
            track: Number(a.track) || null,
            flight: String(a.flight || '').trim() || null,
            seenAt,
          });
        }
      }
      this.tooMany = 0;
      this.lastSuccess = now;
      this.lastError = null;
    } catch (error) {
      this.lastError = String(error?.name || error).slice(0, 80);
      this.log({ error: this.lastError });
    } finally {
      this.polling = false;
    }
  }

  snapshot(now = Date.now()) {
    const fires = this.activeFires().filter(isLandscapeFire);
    const aircraft = [];
    for (const [hex, p] of this.positions) {
      if (now - p.seenAt > KEEP_MS) {
        this.positions.delete(hex);
        continue;
      }
      const a = this.fleet.get(hex);
      const nearFire = nearestFire([p.lat, p.lon], fires);
      if (a.role !== 'rescue' && !nearFire) continue;
      aircraft.push({
        hex,
        registration: a.registration,
        callsign: a.callsign,
        role: a.role,
        rotor: a.rotor,
        class: a.class,
        type: a.type,
        model: a.model,
        ...p,
        seenAt: new Date(p.seenAt).toISOString(),
        nearFire,
      });
    }
    return {
      aircraft,
      updatedAt: this.lastSuccess
        ? new Date(this.lastSuccess).toISOString()
        : null,
      attribution: 'Aircraft positions: adsb.lol (ODbL). Call signs: NAFC.',
      status: {
        enabled: Boolean(this.key),
        pausedUntil:
          this.pausedUntil > now
            ? new Date(this.pausedUntil).toISOString()
            : null,
        error: this.lastError,
      },
    };
  }
}
