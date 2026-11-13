import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { classify } from '../vessel-rules.mjs';
import { VesselTrips, metres, LOST_MS, HISTORY_MS } from '../vessel-trips.mjs';
import {
  VesselService,
  MinuteBudget,
  vesselsEnabled,
  LIGHT_BOXES,
  SCAN_BOXES,
  MAX_BOX_SQ_DEG,
  MAX_PER_MIN,
  SOURCE_LIMIT_PER_MIN,
  MMSI_PER_REQUEST,
  CADENCE_IDLE_MS,
  QUIET_BOX_MS,
} from '../vessels.mjs';
import { createServer } from '../server.mjs';
import { IncidentStore } from '../store.mjs';

// Real answers of Open Waters AIS, 13-11-2026 (see the note in the file).
const sample = JSON.parse(
  readFileSync(
    new URL('./fixtures/openwaters-2026-11-13.json', import.meta.url),
    'utf8',
  ),
);
const SAMPLE_AT = Date.parse('2026-11-13T11:10:00Z');
const byName = (name) =>
  sample.features.find((f) => f.properties.name === name);
const kindOf = (f) =>
  classify({ ...f.properties, lat: f.geometry.coordinates[1] });

// ── Recognition ────────────────────────────────────────────────────────────

void test('real vessels: category, organisation and how they were recognised', () => {
  const expected = {
    'MARINE RESCUE BW21': ['rescue', 'Marine Rescue NSW', 'BW 21', 'name'],
    'MARINE RESCUE PJ-31': ['rescue', 'Marine Rescue NSW', 'PJ 31', 'name'],
    // Type 50 (pilot) in AIS.
    'MARINE RESCUE MH30': ['rescue', 'Marine Rescue NSW', 'MH 30', 'name'],
    'MARINE RESCUE RB11': [
      'rescue',
      'Marine Rescue Queensland',
      'RB 11',
      'name',
    ],
    'CG33 DOLPHINS': [
      'rescue',
      'Australian Volunteer Coast Guard',
      'CG 33',
      'type+name',
    ],
    'RSL REDCLIFFE QF32': [
      'rescue',
      'Australian Volunteer Coast Guard',
      'QF32',
      'type+name',
    ],
    'SURF-RESCUE30': ['rescue', 'Surf Life Saving', null, 'type+name'],
    'RESCUE 304': ['rescue', null, null, 'type+name'],
    // No type at all, and types 31 and 53.
    'MOOLOOLABA RESCUE': ['rescue', null, null, 'name'],
    'JETSKI RESCUE 2': ['rescue', null, null, 'name'],
    GLADSTONERESCUE3: ['rescue', null, null, 'name'],
    // Type 51 and nothing in the name.
    'BRIBIE 2': ['rescue', null, null, 'type'],
    'BOTANY HACKING 30': ['rescue', null, null, 'type'],
    'QPV STEWART KERLIN': [
      'police',
      'Queensland Police Service',
      'STEWART KERLIN',
      'name',
    ],
    // Type 37 (pleasure craft) in AIS.
    'QPV VEDETTE': ['police', 'Queensland Police Service', 'VEDETTE', 'name'],
    'WP-401': ['police', 'NSW Police Force', 'WP 401', 'name'],
    WP41: ['police', 'NSW Police Force', 'WP 41', 'name'],
    NEMESIS: ['police', 'NSW Police Force', 'WP 11', 'known'],
    AFP10: ['police', 'Australian Federal Police', 'AFP 10', 'name'],
    VP15: ['police', 'Victoria Police', 'VP 15', 'type+name'],
    'PV HAMELIN': ['police', null, 'HAMELIN', 'type+name'],
    'POLICE LAUNCH 2': ['police', null, null, 'type+name'],
    'ABFC CAPE NELSON': [
      'patrol',
      'Australian Border Force',
      'CAPE NELSON',
      'name',
    ],
    // Law enforcement without a police name: fisheries and the like.
    'LYLE M HOEY II': ['patrol', null, null, 'type'],
  };
  for (const [name, [category, organisation, unit, basis]] of Object.entries(
    expected,
  )) {
    const f = byName(name);
    assert.ok(f, `${name} is in the sample`);
    assert.deepEqual(kindOf(f), { category, organisation, unit, basis }, name);
  }
});

void test('real vessels that look like ours and are not', () => {
  for (const name of [
    // Type 51 or 55, but navy or foreign.
    'ADV STOKER',
    'RSIPV TARO',
    'RKS TEANOAI II',
    // "PV" with type 50 is a pilot vessel.
    'PV SHARP',
    'PV YANAGA',
    'PV SINCLAIR',
    // Fire, surf and harbour in the name of a tug, a ferry and yachts.
    'HELLFIRE BAY',
    'SPITFIRE',
    'FIREBIRD',
    'OCEAN SURFER',
    'HARBOUR MASTER',
    // Yachts whose call sign starts like a unit (VP319Q, QF267Q, CG2338).
    'STARWATCH',
    'WALDEN',
    'ECSTATIC',
  ]) {
    const f = byName(name);
    assert.ok(f, `${name} is in the sample`);
    assert.equal(kindOf(f), null, name);
  }
  // The same code is police in Victoria (type 55) and a rescue boat of
  // Victoria Point in Queensland (type 51).
  assert.equal(kindOf(byName('VP31')).category, 'rescue');
  assert.equal(kindOf(byName('VP31')).organisation, null);
});

void test('the whole sample: counts per category, and nothing but AIS vessels', () => {
  const count = {};
  for (const f of sample.features) {
    const k = kindOf(f);
    if (!k) continue;
    count[k.category] = (count[k.category] ?? 0) + 1;
    assert.match(String(f.properties.mmsi), /^503/);
    assert.equal(f.properties.kind, 'vessel');
  }
  assert.deepEqual(count, { rescue: 70, police: 19, patrol: 14 });
});

void test('made-up false positives', () => {
  const no = (v) =>
    assert.equal(classify({ mmsi: 503000001, ...v }), null, v.name);
  no({ name: 'RESCUE ME', type: 37 });
  no({ name: 'RESCUE ME' });
  no({ name: 'TO THE RESCUE' });
  no({ name: 'RESCUE 1', type: 36 });
  no({ name: 'SEA RESCUE 2', type: 30 });
  no({ name: 'COAST GUARD', type: 37 });
  no({ name: 'POLICE ACADEMY', type: 37 });
  no({ name: 'FIREFLY' });
  no({ name: 'BONFIRE 2' });
  no({ name: 'SURFERS PARADISE', type: 60 });
  no({ name: 'CG', type: 70 });
  // A ship with type 51 and no rescue name.
  no({ name: 'ENGAGE CRUSADER', type: 51, length: 33 });
  // A New Zealand rescue boat: not Australian.
  assert.equal(
    classify({ mmsi: 512000001, name: 'COASTGUARD RESCUE', type: 51 }),
    null,
  );
  // Fire boats: none was on AIS when measured, so only made-up names here.
  assert.equal(
    classify({ mmsi: 503000001, name: 'FIRE BOAT 1', type: 37 }).category,
    'fire',
  );
  assert.equal(
    classify({ mmsi: 503000001, name: 'FIRE RESCUE 2' }).category,
    'fire',
  );
  // "MARINE RESCUE" without a position: no state organisation guessed.
  assert.equal(
    classify({ mmsi: 503000001, name: 'MARINE RESCUE XX 30' }).organisation,
    'Marine Rescue',
  );
});

// ── Trips ──────────────────────────────────────────────────────────────────

const MIN = 60_000;
const T0 = Date.parse('2026-11-14T00:00:00Z');
const BERTH = [-33.6, 151.3];
/** A point `m` metres north of the berth. */
const north = (m) => [BERTH[0] + m / 111_195, BERTH[1]];

/** Feeds positions [minute, metres north, knots] as they arrive. */
function sail(trips, mmsi, rows) {
  for (const [min, m, sog] of rows) {
    const [lat, lon] = north(m);
    trips.observe(
      { mmsi, lat, lon, sog, seenAt: T0 + min * MIN },
      T0 + min * MIN,
    );
    trips.sweep(T0 + min * MIN);
  }
}
/** Moored at the berth from minute `from` for an hour: enough to learn it. */
const moored = (from) =>
  Array.from({ length: 13 }, (_, i) => [from + i * 5, 0, 0]);

void test('a trip from the berth and back, with the track', () => {
  const trips = new VesselTrips();
  sail(trips, 1, moored(0));
  const berth = trips.berthOf(1);
  assert.ok(metres(berth.lat, berth.lon, ...BERTH) < 10);
  assert.equal(trips.running(1), null);
  // Leaves at 12 knots, works 5 km out, lies still there for 20 minutes
  // (a tow being set up: not the end), and comes back.
  sail(trips, 1, [
    [61, 100, 6],
    [62, 400, 12],
    [66, 2500, 12],
    [70, 5000, 10],
    [75, 5000, 0],
    [90, 5010, 0.2],
    [95, 5000, 0],
  ]);
  const running = trips.running(1);
  assert.ok(running, 'still running while it lies still at sea');
  assert.equal(running.from, 'berth');
  assert.equal(running.departureSeen, true);
  assert.equal(running.startedAt, T0 + 61 * MIN);
  sail(trips, 1, [
    [100, 2500, 9],
    [105, 300, 6],
    [107, 20, 0.3],
    [110, 10, 0],
  ]);
  assert.ok(trips.running(1), 'three minutes at the berth is not moored yet');
  sail(trips, 1, [[113, 10, 0]]);
  assert.equal(trips.running(1), null);
  trips.flush(T0 + 113 * MIN);
  const [trip] = trips.history(1, T0 + 120 * MIN);
  assert.equal(trip.running, false);
  assert.equal(trip.end, 'berth');
  assert.equal(trip.endedAt, new Date(T0 + 107 * MIN).toISOString());
  assert.equal(trip.durationMin, 46);
  assert.ok(
    trip.distanceKm > 9.5 && trip.distanceKm < 10.5,
    String(trip.distanceKm),
  );
  assert.equal(trip.maxKn, 12);
  // The track starts at the berth and holds [lat, lon, unix seconds].
  assert.ok(metres(trip.track[0][0], trip.track[0][1], ...BERTH) < 10);
  assert.equal(trip.track[0][2], (T0 + 60 * MIN) / 1000 + 60);
  assert.ok(trip.track.length >= 7);
});

void test('GPS noise at the pontoon is not a trip', () => {
  const trips = new VesselTrips();
  sail(trips, 1, moored(0));
  // Speed without getting anywhere.
  sail(trips, 1, [
    [61, 30, 2.5],
    [62, 60, 3],
    [63, 20, 2.2],
    [64, 0, 0],
  ]);
  assert.equal(trips.running(1), null);
  assert.deepEqual(trips.history(1, T0 + 70 * MIN), []);
});

void test('an old position never starts a trip', () => {
  const trips = new VesselTrips();
  // First seen under way, but these positions are two days old when we get them.
  const at = T0 + 2 * 86_400_000;
  for (const [min, m] of [
    [0, 0],
    [1, 400],
    [2, 800],
  ]) {
    const [lat, lon] = north(m);
    trips.observe({ mmsi: 1, lat, lon, sog: 12, seenAt: T0 + min * MIN }, at);
  }
  assert.equal(trips.running(1), null);
});

void test('first seen under way: a trip without a departure, from elsewhere', () => {
  const trips = new VesselTrips();
  sail(trips, 1, [
    [0, 3000, 15],
    [1, 3500, 15],
  ]);
  const trip = trips.running(1);
  assert.equal(trip.departureSeen, false);
  assert.equal(trip.from, 'elsewhere');
  // No berth known: half an hour still ends it where it lies.
  sail(trips, 1, [
    [5, 5000, 0],
    [20, 5000, 0],
    [36, 5000, 0],
  ]);
  assert.equal(trips.running(1), null);
  assert.equal(trips.history(1, T0 + 40 * MIN)[0].end, 'stopped');
});

void test('AIS off at the berth, and a vessel that never comes back', () => {
  const trips = new VesselTrips();
  sail(trips, 1, [...moored(0), [61, 100, 8], [62, 500, 10], [70, 100, 4]]);
  assert.ok(trips.running(1));
  // Last seen 100 m from the berth, then nothing for a quarter of an hour.
  trips.sweep(T0 + 86 * MIN);
  assert.equal(trips.running(1), null);
  trips.flush(T0 + 86 * MIN);
  assert.equal(trips.history(1, T0 + 90 * MIN)[0].end, 'berth');

  sail(trips, 1, [
    [100, 100, 8],
    [101, 600, 12],
    [110, 6000, 12],
  ]);
  trips.sweep(T0 + 110 * MIN + LOST_MS - MIN);
  assert.ok(trips.running(1), 'out of range at sea: still running');
  trips.sweep(T0 + 110 * MIN + LOST_MS);
  assert.equal(trips.running(1), null);
  trips.flush(T0 + 110 * MIN + LOST_MS);
  const [lost, back] = trips.history(1, T0 + 110 * MIN + LOST_MS);
  assert.equal(lost.end, 'lost');
  assert.equal(lost.endedAt, new Date(T0 + 110 * MIN).toISOString());
  assert.equal(back.end, 'berth');
});

void test('a restart keeps the berth and the running trip; history lasts 7 days', () => {
  const db = new DatabaseSync(':memory:');
  const before = new VesselTrips({ db });
  sail(before, 1, [...moored(0), [61, 100, 8], [62, 500, 10], [70, 4000, 12]]);
  before.flush(T0 + 70 * MIN);
  const id = before.running(1).id;

  const after = new VesselTrips({ db });
  assert.ok(after.berthOf(1));
  assert.equal(after.running(1).id, id);
  assert.equal(after.running(1).track.length, 3);
  sail(after, 1, [
    [80, 300, 8],
    [82, 0, 0],
    [88, 0, 0],
  ]);
  after.flush(T0 + 88 * MIN);
  const again = new VesselTrips({ db });
  assert.equal(again.running(1), null);
  const [trip] = again.history(1, T0 + 90 * MIN);
  assert.equal(trip.id, id);
  assert.equal(trip.end, 'berth');
  assert.equal(trip.track.length, 5);
  // A new trip gets a new number after a restart.
  sail(again, 1, [
    [100, 100, 8],
    [101, 600, 12],
  ]);
  assert.equal(again.running(1).id, id + 1);
  // A week later the first trip is gone.
  const later = T0 + 82 * MIN + HISTORY_MS + MIN;
  again.flush(later);
  assert.deepEqual(
    again.history(1, later).map((t) => t.id),
    [id + 1],
  );
});

// ── Service: requests, budget, staleness ───────────────────────────────────

const empty = { type: 'FeatureCollection', features: [] };
function reply(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}
/** A source that answers every query from the sample, like Open Waters does. */
function source(calls, { at = SAMPLE_AT, features = sample.features } = {}) {
  return async (url) => {
    calls.push(url);
    const q = new URL(url).searchParams;
    let list = features;
    if (q.get('mmsi')) {
      const ids = q.get('mmsi').split(',').map(Number);
      list = list.filter((f) => ids.includes(f.properties.mmsi));
    } else {
      const [s, w, n, e] = q.get('bbox').split(',').map(Number);
      list = list.filter((f) => {
        const [lon, lat] = f.geometry.coordinates;
        return lat >= s && lat <= n && lon >= w && lon <= e;
      });
    }
    if (q.get('type')) {
      const types = q.get('type').split(',').map(Number);
      list = list.filter((f) => types.includes(f.properties.type));
    }
    void at;
    return reply(200, {
      ...empty,
      attribution: sample.attribution,
      features: list,
    });
  };
}
const quiet = () => {};

void test('boxes: every box is one the source accepts, and the coast is covered', () => {
  for (const { id, bbox } of [...LIGHT_BOXES, ...SCAN_BOXES]) {
    const [s, w, n, e] = bbox;
    assert.ok(n > s && e > w, id);
    assert.ok((n - s) * (e - w) <= MAX_BOX_SQ_DEG, `${id} is too large`);
  }
  const inside = (boxes, lat, lon) =>
    boxes.some(
      ({ bbox: [s, w, n, e] }) => lat >= s && lat <= n && lon >= w && lon <= e,
    );
  for (const [place, lat, lon] of [
    ['Sydney', -33.85, 151.25],
    ['Newcastle', -32.92, 151.79],
    ['Brisbane', -27.4, 153.17],
    ['Gold Coast', -27.95, 153.43],
    ['Cairns', -16.92, 145.78],
    ['Thursday Island', -10.58, 142.22],
    ['Melbourne', -37.87, 144.92],
    ['Hobart', -42.89, 147.34],
    ['Adelaide', -34.78, 138.48],
    ['Perth', -32.05, 115.74],
    ['Broome', -17.99, 122.21],
    ['Darwin', -12.47, 130.85],
    ['Karumba', -17.49, 140.83],
  ]) {
    assert.ok(inside(LIGHT_BOXES, lat, lon), `light: ${place}`);
    assert.ok(inside(SCAN_BOXES, lat, lon), `scan: ${place}`);
  }
});

void test('the first rounds: light boxes, then a scan that finds the vessels with another type', async () => {
  const calls = [];
  const svc = new VesselService({ fetcher: source(calls), log: quiet });
  await svc.tick(SAMPLE_AT);
  // Eleven light boxes and the first four of the sixteen scan boxes.
  assert.equal(calls.filter((u) => u.includes('type=51,55')).length, 11);
  assert.equal(calls.length, 15);
  let now = SAMPLE_AT;
  for (let i = 0; i < 4; i += 1) await svc.tick((now += CADENCE_IDLE_MS));
  const snap = svc.snapshot(now);
  const names = new Set(snap.vessels.map((v) => v.name));
  // Found by the scan only: they send type 50, 37 and no type.
  for (const name of ['MARINE RESCUE MH30', 'WP-401', 'NEMESIS', 'QPV VEDETTE'])
    assert.ok(
      svc.vessels.size &&
        [...svc.vessels.values()].some((v) => v.name === name),
      name,
    );
  assert.ok(names.has('NEMESIS'));
  assert.ok(!names.has('ADV STOKER') && !names.has('PV SHARP'));
  assert.equal(svc.vessels.size, 103);
  assert.deepEqual(snap.categories, ['patrol', 'police', 'rescue']);
  assert.match(snap.attribution, /Open Waters AIS/);
  assert.match(snap.attribution, /AISHub/);
  // After the scan those vessels are asked for by mmsi, ten per request.
  calls.length = 0;
  await svc.tick((now += CADENCE_IDLE_MS));
  const mmsi = calls.filter((u) => u.includes('mmsi='));
  assert.ok(mmsi.length >= 2 && mmsi.length <= 3, String(mmsi.length));
  for (const u of mmsi)
    assert.ok(
      new URL(u).searchParams.get('mmsi').split(',').length <= MMSI_PER_REQUEST,
    );
  // No key and nothing that names anyone in the request.
  assert.ok(
    calls.every((u) => u.startsWith('https://ais.openwaters.io/v1/vessels?')),
  );
});

void test('request volume stays far below the limit of the source', async () => {
  const run = async (viewed) => {
    const calls = [];
    const svc = new VesselService({ fetcher: source(calls), log: quiet });
    let now = SAMPLE_AT;
    // Two hours in steps of 30 s, as the server ticks; count the second hour.
    let secondHour = 0;
    for (let i = 0; i < 240; i += 1) {
      now += 30_000;
      const before = calls.length;
      if (viewed) svc.request(now);
      await svc.tick(now);
      // request() starts a round without waiting for it.
      await new Promise((r) => setImmediate(r));
      if (i >= 120) secondHour += calls.length - before;
    }
    return secondHour;
  };
  const limit = SOURCE_LIMIT_PER_MIN * 60;
  const idle = await run(false);
  const viewed = await run(true);
  assert.ok(idle > 150 && idle < 260, `idle ${idle}/h`);
  assert.ok(viewed > 450 && viewed < 700, `viewed ${viewed}/h`);
  assert.ok(idle < limit * 0.04, 'idle under 4% of the limit');
  assert.ok(viewed < limit * 0.1, 'viewed under 10% of the limit');
  // The cap whatever happens: a sixth of the limit.
  assert.ok(MAX_PER_MIN * 6 <= SOURCE_LIMIT_PER_MIN);
});

void test('the bucket stops a round that would go over the cap', async () => {
  const calls = [];
  const svc = new VesselService({
    fetcher: source(calls),
    budget: new MinuteBudget(5, 5, SAMPLE_AT),
    log: quiet,
  });
  await svc.tick(SAMPLE_AT);
  assert.equal(calls.length, 5);
  const budget = new MinuteBudget(20, 20, 0);
  let taken = 0;
  for (let t = 0; t < 60_000; t += 100) if (budget.take(t)) taken += 1;
  assert.ok(taken <= 40, String(taken));
  assert.equal(new MinuteBudget(1, 20, 1000).take(0), true);
});

void test('a box without our vessels is only asked once an hour', async () => {
  const calls = [];
  const svc = new VesselService({ fetcher: source(calls), log: quiet });
  await svc.tick(SAMPLE_AT);
  calls.length = 0;
  await svc.tick(SAMPLE_AT + CADENCE_IDLE_MS);
  const light = calls.filter((u) => u.includes('type=51,55'));
  // North-west, Kimberley, Top End and the Gulf had none.
  assert.equal(light.length, 7);
  calls.length = 0;
  svc.scanQueue = [];
  await svc.tick(SAMPLE_AT + QUIET_BOX_MS + 1);
  assert.equal(calls.filter((u) => u.includes('type=51,55')).length, 11);
});

void test('errors: a growing pause, an hour after a refusal, and it survives a restart', async () => {
  const db = new DatabaseSync(':memory:');
  let status = 502;
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    return reply(status, empty);
  };
  const svc = new VesselService({ db, fetcher, log: quiet });
  let now = SAMPLE_AT;
  await svc.tick(now);
  assert.equal(calls.length, 1, 'the round stops at the first error');
  assert.equal(svc.pausedUntil, now + 30_000);
  await svc.tick((now += 10_000));
  assert.equal(calls.length, 1);
  await svc.tick((now += CADENCE_IDLE_MS));
  assert.equal(svc.pausedUntil, now + 60_000);
  for (let i = 0; i < 8; i += 1) await svc.tick((now += 11 * 60_000));
  assert.equal(svc.pausedUntil, now + 10 * 60_000, 'at most ten minutes');
  status = 429;
  await svc.tick((now += 11 * 60_000));
  assert.equal(svc.pausedUntil, now + 3_600_000);
  assert.match(svc.snapshot(now).status.error, /429/);
  const n = calls.length;
  const restarted = new VesselService({ db, fetcher, log: quiet });
  await restarted.tick(now + 59 * 60_000);
  assert.equal(calls.length, n, 'still paused after a restart');
  status = 200;
  await restarted.tick(now + 61 * 60_000);
  assert.ok(calls.length > n);
  assert.equal(restarted.snapshot(now + 61 * 60_000).status.error, null);
  // A thrown error (timeout) pauses too.
  const broken = new VesselService({
    fetcher: async () => {
      throw new DOMException('timeout', 'TimeoutError');
    },
    log: quiet,
  });
  await broken.tick(now);
  assert.equal(broken.pausedUntil, now + 30_000);
  assert.equal(broken.snapshot(now).status.error, 'TimeoutError');
});

void test('switched off: no request and nothing shown', async () => {
  assert.equal(vesselsEnabled(undefined), true);
  assert.equal(vesselsEnabled(''), true);
  assert.equal(vesselsEnabled('on'), true);
  for (const v of ['off', 'OFF', 'false', '0', 'no'])
    assert.equal(vesselsEnabled(v), false);
  const calls = [];
  const svc = new VesselService({
    enabled: false,
    fetcher: source(calls),
    log: quiet,
  });
  svc.request(SAMPLE_AT);
  await svc.tick(SAMPLE_AT);
  assert.equal(calls.length, 0);
  const snap = svc.snapshot(SAMPLE_AT);
  assert.deepEqual(snap.vessels, []);
  assert.equal(snap.status.enabled, false);
});

const feature = (mmsi, name, type, lat, lon, sog, seen, extra = {}) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: [lon, lat] },
  properties: {
    mmsi,
    name,
    type,
    sog,
    seen: new Date(seen).toISOString(),
    kind: 'vessel',
    ...extra,
  },
});

void test('the API fields, moving, and stale positions dropped', () => {
  const svc = new VesselService({ log: quiet });
  const now = SAMPLE_AT;
  svc.ingest(
    feature(
      503000001,
      'MARINE RESCUE  BW21',
      51,
      -33.44,
      151.33,
      14.2,
      now - 2 * MIN,
      {
        cog: 204.2,
        heading: 183,
        length: 9,
        callsign: 'BW21',
      },
    ),
    now,
  );
  // Moving, last seen 40 minutes ago: nobody knows where it is now.
  svc.ingest(
    feature(503000002, 'RESCUE 2', 51, -33.5, 151.4, 12, now - 40 * MIN),
    now,
  );
  // Still, seen 5 hours ago: shown where it lay, marked stale.
  svc.ingest(
    feature(503000003, 'WP41', 55, -33.85, 151.2, 0, now - 5 * 3_600_000),
    now,
  );
  // Still, seen two days ago: gone.
  svc.ingest(
    feature(503000004, 'CG07', 51, -37.9, 144.9, 0.1, now - 48 * 3_600_000),
    now,
  );
  // "Not available" values of AIS, an aid to navigation and a clock in the future.
  svc.ingest(
    feature(503000005, 'QPV TEST', 55, -27.4, 153.2, 102.3, now - MIN, {
      cog: 360,
      heading: 511,
    }),
    now,
  );
  svc.ingest(
    feature(503000006, 'RESCUE 6', 51, -33, 151, 0, now, { kind: 'aton' }),
    now,
  );
  svc.ingest(
    feature(503000007, 'RESCUE 7', 51, -33, 151, 0, now + 3_600_000),
    now,
  );
  const snap = svc.snapshot(now);
  assert.deepEqual(
    snap.vessels.map((v) => v.mmsi),
    [503000001, 503000003, 503000005],
  );
  assert.deepEqual(snap.vessels[0], {
    mmsi: 503000001,
    name: 'MARINE RESCUE BW21',
    callsign: 'BW21',
    category: 'rescue',
    organisation: 'Marine Rescue NSW',
    unit: 'BW 21',
    basis: 'name',
    lengthM: 9,
    lat: -33.44,
    lon: 151.33,
    speedKn: 14.2,
    course: 204.2,
    heading: 183,
    moving: true,
    seenAt: new Date(now - 2 * MIN).toISOString(),
    stale: false,
    berth: null,
    atBerth: null,
    trip: null,
  });
  assert.equal(snap.vessels[1].moving, false);
  assert.equal(snap.vessels[1].stale, true);
  assert.deepEqual(
    [snap.vessels[2].speedKn, snap.vessels[2].course, snap.vessels[2].heading],
    [null, null, null],
  );
  // An older position never replaces a newer one.
  svc.ingest(
    feature(
      503000001,
      'MARINE RESCUE BW21',
      51,
      -33.0,
      151.0,
      0,
      now - 10 * MIN,
    ),
    now,
  );
  assert.equal(svc.snapshot(now).vessels[0].lat, -33.44);
  // Renamed to something that is not ours: gone.
  svc.ingest(feature(503000003, 'SEA BREEZE', 37, -33.85, 151.2, 0, now), now);
  assert.equal(svc.snapshot(now).vessels.length, 2);
});

void test('trips through the service and the API, also after a restart', async () => {
  const db = new IncidentStore(':memory:');
  let now = T0;
  let pos = [0, 0];
  const fetcher = async (url) => {
    const light = url.includes('type=51,55') && url.includes('bbox=-38,149');
    const [lat, lon] = north(pos[0]);
    return reply(200, {
      ...empty,
      features: light
        ? [feature(503076590, 'MARINE RESCUE BW21', 51, lat, lon, pos[1], now)]
        : [],
    });
  };
  const step = async (svc, min, m, sog) => {
    now = T0 + min * MIN;
    pos = [m, sog];
    svc.lastRound = -Infinity;
    await svc.tick(now);
  };
  let svc = new VesselService({ db: db.db, fetcher, log: quiet });
  for (let min = 0; min <= 60; min += 5) await step(svc, min, 0, 0);
  await step(svc, 61, 100, 8);
  await step(svc, 62, 500, 12);
  await step(svc, 66, 3000, 12);
  let v = svc.snapshot(now).vessels[0];
  assert.equal(v.moving, true);
  assert.equal(v.atBerth, false);
  assert.ok(metres(v.berth.lat, v.berth.lon, ...BERTH) < 10);
  assert.equal(v.trip.startedAt, new Date(T0 + 61 * MIN).toISOString());

  // Restart in the middle of the trip.
  svc = new VesselService({ db: db.db, fetcher, log: quiet });
  v = svc.snapshot(now).vessels[0];
  assert.equal(v.name, 'MARINE RESCUE BW21');
  assert.ok(v.trip, 'the trip is still running');
  await step(svc, 75, 200, 6);
  await step(svc, 77, 0, 0);
  await step(svc, 83, 0, 0);
  v = svc.snapshot(now).vessels[0];
  assert.equal(v.trip, null);
  assert.equal(v.atBerth, true);

  const server = createServer(db, null, null, null, svc);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const list = await fetch(`${base}/v1/vessels`);
    assert.equal(list.status, 200);
    assert.equal(list.headers.get('cache-control'), 'no-store');
    const body = await list.json();
    assert.equal(body.vessels.length, 1);
    assert.match(body.attribution, /Open Waters AIS/);
    const res = await fetch(`${base}/v1/vessels/503076590/trips`);
    assert.equal(res.status, 200);
    const trips = await res.json();
    assert.equal(trips.name, 'MARINE RESCUE BW21');
    assert.match(trips.attribution, /Open Waters AIS/);
    assert.equal(trips.trips.length, 1);
    assert.equal(trips.trips[0].end, 'berth');
    assert.equal(trips.trips[0].from, 'berth');
    assert.equal(trips.trips[0].running, false);
    assert.equal(trips.trips[0].track.length, 5);
    assert.equal(
      (await fetch(`${base}/v1/vessels/503999999/trips`)).status,
      404,
    );
    assert.equal((await fetch(`${base}/v1/vessels/abc/trips`)).status, 404);
    // Without the service the routes say so; the rest of the API is untouched.
    const bare = createServer(db);
    await new Promise((r) => bare.listen(0, '127.0.0.1', r));
    try {
      const port = bare.address().port;
      assert.equal(
        (await fetch(`http://127.0.0.1:${port}/v1/vessels`)).status,
        503,
      );
      assert.equal(
        (await fetch(`http://127.0.0.1:${port}/health`)).status,
        200,
      );
    } finally {
      bare.close();
    }
  } finally {
    server.close();
    db.close();
  }
});
