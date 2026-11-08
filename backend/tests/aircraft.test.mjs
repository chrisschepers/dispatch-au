import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  AircraftService,
  Budget,
  pauseAfter429,
  isLandscapeFire,
  nearestFire,
  loadFleet,
  CADENCE_MS,
  FLEET_REFRESH_MS,
  FLEET_RETRY_MS,
} from '../aircraft.mjs';

const fleet = [
  {
    hex: '7c5d89',
    registration: 'VH-SRF',
    callsign: 'LIFESAVER 21',
    role: 'rescue',
    rotor: true,
    class: 'RW - Type 2 Medium',
    type: 'BK17',
    model: 'BK117',
  },
  {
    hex: '7c1234',
    registration: 'VH-ABC',
    callsign: 'BOMBER 355',
    role: 'bomber',
    rotor: false,
    class: 'FW - Type 4 SEAT',
    type: 'AT8T',
    model: 'AT-802',
  },
];
// A bush fire near Armidale and a house fire in Melbourne.
const fires = [
  {
    id: 'nsw:incident:1',
    category: 'fire',
    listed: true,
    title: 'Bush Fire',
    location: 'Cookes Rd, Armidale',
    point: [-30.51, 151.67],
  },
  {
    id: 'vic:incident:2',
    category: 'fire',
    listed: true,
    title: 'Structure Fire',
    location: 'Lygon St, Brunswick East',
    point: [-37.76, 144.97],
  },
];

function reply(status, body, headers = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (k) => headers[k.toLowerCase()] ?? null },
    json: async () => body,
  };
}

void test('the fleet file is there and every entry has a hex code and a role', () => {
  const f = loadFleet();
  assert.ok(f.length > 100);
  const roles = new Set();
  for (const a of f) {
    assert.match(a.hex, /^[0-9a-f]{6}$/);
    assert.ok(
      [
        'bomber',
        'helitak',
        'transport',
        'scanner',
        'rescue',
        'police',
        'medical',
      ].includes(a.role),
    );
    roles.add(a.role);
  }
  assert.ok(roles.has('police') && roles.has('medical'));
  assert.equal(new Set(f.map((a) => a.hex)).size, f.length, 'no doubles');
});

void test('budget: a full bucket, then refilled at the daily rate', () => {
  const b = new Budget(30, 300, 0);
  assert.equal(b.take(30, 0), true);
  assert.equal(b.take(1, 0), false);
  // 300 a day = one every 4.8 min.
  assert.equal(b.take(1, 4.8 * 60_000), true);
});

void test('pause after a 429 grows and never undercuts Retry-After', () => {
  assert.deepEqual(
    [1, 2, 3, 7, 20].map((n) => pauseAfter429(n) / 60_000),
    [1, 5, 15, 360, 360],
  );
  assert.equal(pauseAfter429(1, 600), 600_000);
});

void test('only landscape fires count, not a house fire in town', () => {
  assert.equal(isLandscapeFire(fires[0]), true);
  assert.equal(isLandscapeFire(fires[1]), false);
  assert.equal(
    isLandscapeFire({ category: 'fire', title: 'Grass Fire' }),
    false,
  ); // no point
});

void test('nearest fire within 50 km', () => {
  assert.equal(nearestFire([-30.6, 151.7], [fires[0]]).id, 'nsw:incident:1');
  assert.equal(nearestFire([-33.87, 151.21], [fires[0]]), null);
});

void test('polls only while someone looks, then shows rescue always and a bomber only near a fire', async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    return reply(200, {
      ac: [
        {
          hex: '7c5d89',
          lat: -33.9,
          lon: 151.2,
          alt_baro: 1500,
          gs: 120,
          track: 90,
          flight: 'LIFE21 ',
          seen_pos: 2,
        },
        {
          hex: '7c1234',
          lat: -30.55,
          lon: 151.66,
          alt_baro: 800,
          gs: 140,
          track: 180,
          flight: 'BMR355',
          seen_pos: 1,
        },
        { hex: 'abcdef', lat: -30.5, lon: 151.6 }, // not in the fleet
      ],
    });
  };
  const s = new AircraftService({
    key: 'k',
    fetcher,
    fleet,
    activeFires: () => fires,
    log: () => {},
  });
  await s.tick(1_000);
  assert.equal(calls.length, 0, 'nobody looked yet');
  s.request(10_000);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/v2\/hex\/7c5d89,7c1234$/);
  const snap = s.snapshot(10_500);
  assert.deepEqual(
    snap.aircraft.map((a) => a.callsign).sort((a, b) => a.localeCompare(b)),
    ['BOMBER 355', 'LIFESAVER 21'],
  );
  assert.equal(
    snap.aircraft.find((a) => a.role === 'bomber').nearFire.id,
    'nsw:incident:1',
  );
  // Without the fire the bomber is hidden; the rescue helicopter stays.
  const zonder = new AircraftService({
    key: 'k',
    fetcher,
    fleet,
    activeFires: () => [],
    log: () => {},
  });
  zonder.request(0);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(
    zonder.snapshot(100).aircraft.map((a) => a.role),
    ['rescue'],
  );
  // Not again within the cadence (zonder used the same fetcher, so count from here).
  const voor = calls.length;
  s.request(10_000 + CADENCE_MS - 1);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, voor);
  // And again once the cadence has passed.
  s.request(10_000 + CADENCE_MS);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, voor + 1);
});

void test('a 429 pauses polling and the pause survives a restart', async () => {
  const db = new DatabaseSync(':memory:');
  const fetcher = async () => reply(429, {}, { 'retry-after': '120' });
  const s = new AircraftService({
    db,
    key: 'k',
    fetcher,
    fleet,
    log: () => {},
  });
  s.request(0);
  await new Promise((r) => setImmediate(r));
  assert.equal(s.pausedUntil, 120_000);
  const again = new AircraftService({
    db,
    key: 'k',
    fetcher,
    fleet,
    log: () => {},
  });
  assert.equal(again.pausedUntil, 120_000);
});

void test('without a key it never calls out', async () => {
  let called = false;
  const s = new AircraftService({
    key: '',
    fetcher: async () => {
      called = true;
    },
    fleet,
    log: () => {},
  });
  s.request(0);
  await new Promise((r) => setImmediate(r));
  assert.equal(called, false);
  assert.equal(s.snapshot(0).status.enabled, false);
});

// n made-up aircraft with one role, hex codes counting up from `from`.
const made = (n, role, from = 0) =>
  Array.from({ length: n }, (_, i) => ({
    hex: (0x7c8000 + from + i).toString(16),
    registration: `VH-T${from + i}`,
    callsign: null,
    role,
    rotor: role !== 'medical',
    class: null,
    type: null,
    model: null,
    operator: 'Test',
  }));

void test('police and medical aircraft always show, far from any fire, and roles lists the layers', async () => {
  const gov = [
    ...fleet,
    { ...made(1, 'police')[0], registration: 'VH-PIW' },
    { ...made(1, 'medical', 1)[0], registration: 'VH-FDM' },
  ];
  const fetcher = async () =>
    reply(200, {
      ac: [
        // Police over Sydney, the Flying Doctor near Broken Hill, the bomber
        // far from the fire.
        { hex: gov[2].hex, lat: -33.9, lon: 151.1, alt_baro: 1200 },
        { hex: gov[3].hex, lat: -31.9, lon: 141.5, alt_baro: 17000 },
        { hex: '7c1234', lat: -35.3, lon: 149.1, alt_baro: 800 },
      ],
    });
  const s = new AircraftService({
    key: 'k',
    fetcher,
    fleet: gov,
    activeFires: () => fires,
    log: () => {},
  });
  s.lastView = 0;
  await s.tick(0);
  const snap = s.snapshot(1_000);
  assert.deepEqual(
    snap.aircraft.map((a) => [a.registration, a.role, a.nearFire]),
    [
      ['VH-PIW', 'police', null],
      ['VH-FDM', 'medical', null],
    ],
  );
  assert.equal(snap.aircraft[0].operator, 'Test');
  assert.deepEqual(snap.roles, ['bomber', 'medical', 'police', 'rescue']);
  assert.equal(snap.status.fleetSize, 4);
});

void test('without an active fire the firefighting aircraft are not asked for, and medical gets its own request every second round', async () => {
  const urls = [];
  const fetcher = async (url) => {
    urls.push(url.split('/').pop().split(','));
    return reply(200, { ac: [] });
  };
  // 150 police fill a request exactly, so the 2 medical planes have no room.
  const list = [
    ...made(150, 'police'),
    ...made(2, 'medical', 150),
    ...made(1, 'bomber', 152),
  ];
  let burning = [];
  const s = new AircraftService({
    key: 'k',
    fetcher,
    fleet: list,
    activeFires: () => burning,
    log: () => {},
  });
  const poll = async (now) => {
    urls.length = 0;
    s.lastView = now;
    await s.tick(now);
    return urls.map((u) => u.length);
  };
  assert.deepEqual(
    await poll(0),
    [150, 2],
    'round 1: everything but the bomber',
  );
  assert.deepEqual(await poll(CADENCE_MS), [150], 'round 2: no medical');
  assert.deepEqual(await poll(2 * CADENCE_MS), [150, 2]);
  // A bush fire: the bomber is asked for too, and in round 4 the medical
  // planes ride along in the room of the second request.
  burning = fires;
  assert.deepEqual(await poll(3 * CADENCE_MS), [150, 3]);
});

function service(db, size, fleetSource, log = () => {}) {
  return new AircraftService({
    db,
    key: 'k',
    fetcher: async () => reply(200, { ac: [] }),
    fleet: made(size, 'bomber'),
    fleetSource,
    log,
  });
}

void test('a rebuilt fleet needs 100 aircraft and 80% of the current count', async () => {
  const at = Date.parse('2026-12-01T00:00:00Z');
  // 160 of 200 is 80%: accepted, and invalid entries do not count.
  let next = [...made(160, 'police'), { hex: 'nope', role: 'police' }];
  const s = service(null, 200, async () => ({ fleet: next }));
  assert.equal(await s.refreshFleet(at), true);
  assert.equal(s.fleet.size, 160);
  assert.deepEqual(s.snapshot(at).roles, ['police']);
  assert.equal(s.snapshot(at).status.fleetBuiltAt, '2026-12-01T00:00:00.000Z');
  // 127 of 160 is less than 80%: the 160 stay.
  next = made(127, 'medical');
  assert.equal(await s.refreshFleet(at + 1), false);
  assert.equal(s.fleet.size, 160);
  assert.deepEqual(s.roles, ['police']);
  // 99 is 90% of 110 but under 100: kept as well.
  const small = service(null, 110, async () => ({ fleet: made(99, 'rescue') }));
  assert.equal(await small.refreshFleet(at), false);
  assert.equal(small.fleet.size, 110);
});

void test('a failed rebuild keeps the old fleet and never throws', async () => {
  const logged = [];
  const s = service(
    null,
    150,
    async () => {
      throw new Error('NAFC HTTP 503');
    },
    (o) => logged.push(o),
  );
  assert.equal(await s.refreshFleet(0), false);
  assert.equal(s.fleet.size, 150);
  assert.deepEqual(logged, [{ fleet: 'kept', reason: 'NAFC HTTP 503' }]);
  assert.equal(s.refreshingFleet, false);
});

void test('the last good fleet survives a restart, and a newer bundled file wins over an old one', async () => {
  const db = new DatabaseSync(':memory:');
  const at = Date.parse('2030-01-01T00:00:00Z');
  const s = service(db, 120, async () => ({ fleet: made(130, 'rescue') }));
  assert.equal(await s.refreshFleet(at), true);
  // A restart without a download.
  const again = new AircraftService({ db, key: 'k', log: () => {} });
  assert.equal(again.fleet.size, 130);
  assert.equal(again.fleetBuiltAt, at);
  // A stored list older than the bundled file loses to the bundled file.
  const old = new DatabaseSync(':memory:');
  const t = service(old, 120, async () => ({ fleet: made(130, 'rescue') }));
  assert.equal(await t.refreshFleet(Date.parse('2020-01-01T00:00:00Z')), true);
  const restarted = new AircraftService({ db: old, key: 'k', log: () => {} });
  assert.equal(restarted.fleet.size, loadFleet().length);
});

void test('the rebuild runs once a day, an hour apart after a failure', async () => {
  let calls = 0;
  let ok = false;
  const s = service(null, 120, async () => {
    calls++;
    if (!ok) throw new Error('timeout');
    return { fleet: made(120, 'rescue') };
  });
  const day = FLEET_REFRESH_MS;
  await s.refreshFleetIfDue(day);
  assert.equal(calls, 1, 'the given fleet counts as built at 0');
  await s.refreshFleetIfDue(day + FLEET_RETRY_MS - 1);
  assert.equal(calls, 1, 'not again within the hour');
  ok = true;
  await s.refreshFleetIfDue(day + FLEET_RETRY_MS);
  assert.equal(calls, 2);
  await s.refreshFleetIfDue(2 * day + FLEET_RETRY_MS - 1);
  assert.equal(calls, 2, 'a day after the last good rebuild');
  await s.refreshFleetIfDue(2 * day + FLEET_RETRY_MS);
  assert.equal(calls, 3);
  // Without a key the layer is off, so there is nothing to rebuild for.
  const off = new AircraftService({
    key: '',
    fleet: made(120, 'rescue'),
    fleetSource: async () => {
      calls++;
      return { fleet: [] };
    },
    log: () => {},
  });
  await off.refreshFleetIfDue(10 * day);
  assert.equal(calls, 3);
});

void test('positions of an aircraft that left the fleet are dropped', async () => {
  const list = made(120, 'rescue');
  const s = service(null, 0, async () => ({ fleet: list.slice(1) }));
  s.fleet = new Map(list.map((a) => [a.hex, a]));
  s.positions.set(list[0].hex, { lat: -33, lon: 151, seenAt: 0 });
  s.positions.set(list[1].hex, { lat: -33, lon: 151, seenAt: 0 });
  assert.equal(s.snapshot(1).aircraft.length, 2);
  assert.equal(await s.refreshFleet(1), true);
  assert.deepEqual(
    s.snapshot(2).aircraft.map((a) => a.hex),
    [list[1].hex],
  );
  assert.equal(s.positions.has(list[0].hex), false);
});
