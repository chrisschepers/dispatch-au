import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  FlightTracker,
  HISTORY_MS,
  LINK_KM,
  aircraftName,
  headingFire,
  isLargeAirTanker,
  isWorkedFire,
  linkFire,
} from '../flights.mjs';
import {
  AircraftService,
  Budget,
  WATCH_ACTIVE_MS,
  WATCH_IDLE_MS,
  WATCH_RESERVE,
  trackingOn,
} from '../aircraft.mjs';
import { PushService, airTankerPushOn } from '../push.mjs';
import { IncidentStore } from '../store.mjs';
import { createServer } from '../server.mjs';

const MIN = 60_000;
const T0 = Date.UTC(2026, 10, 13, 2, 0, 0);

const helitak = {
  hex: '7c6c91',
  registration: 'VH-VQB',
  callsign: 'HELITAK 201',
  role: 'helitak',
  rotor: true,
  class: 'RW - Type 2 Medium',
  type: 'B412',
  model: 'BELL 412',
};
const tanker = {
  hex: 'a09922',
  registration: 'N138CG',
  callsign: 'BOMBER 210',
  role: 'bomber',
  rotor: false,
  class: 'FW - Type 1 MEAT',
  type: 'B733',
  model: 'BOEING 737-3H4',
};
const seat = {
  hex: '7c1234',
  registration: 'VH-ABC',
  callsign: 'BOMBER 355',
  role: 'bomber',
  rotor: false,
  class: 'FW - Type 4 SEAT',
  type: 'AT8T',
  model: 'AT-802',
};
const rescue = {
  hex: '7c5d89',
  registration: 'VH-SRF',
  callsign: null,
  role: 'rescue',
  rotor: true,
  class: null,
  type: 'A139',
  model: 'AW139',
  operator: 'Toll Ambulance Rescue',
};
const medical = {
  hex: '7c2ba6',
  registration: 'VH-IWO',
  callsign: null,
  role: 'medical',
  rotor: false,
  class: null,
  type: 'PC24',
  model: 'PC-24',
  operator: 'Royal Flying Doctor Service',
};

// A bush fire near Armidale with a warning, and one 300 km south.
const fire = {
  id: 'nsw:incident:1',
  category: 'fire',
  listed: true,
  title: 'Bush Fire',
  location: 'Cookes Rd, Armidale',
  status: 'Being controlled',
  level: 'Advice',
  point: [-30.51, 151.67],
};
const FIRE = { lat: fire.point[0], lon: fire.point[1] };

/** A position `north` km north and `east` km east of a point. */
const at = (from, north = 0, east = 0) => ({
  lat: from.lat + north / 111.2,
  lon: from.lon + east / (111.2 * Math.cos((from.lat * Math.PI) / 180)),
});

/** One sample as aircraft.mjs hands it over. */
function sample(place, t, o = {}) {
  return {
    ...place,
    altFt: 1500,
    onGround: false,
    gs: 90,
    track: 0,
    climbFpm: 0,
    seenAt: t,
    ...o,
  };
}

const ground = (place, t) =>
  sample(place, t, { altFt: 0, onGround: true, gs: 0 });

void test('large air tanker is NAFC class "FW - Type 1", not a SEAT or a heavy helicopter', () => {
  assert.equal(isLargeAirTanker(tanker), true);
  assert.equal(isLargeAirTanker(seat), false);
  assert.equal(
    isLargeAirTanker({ role: 'helitak', class: 'RW - Type 1 Heavy' }),
    false,
  );
  assert.equal(isLargeAirTanker({ role: 'bomber', class: null }), false);
  assert.equal(aircraftName(tanker), 'Bomber 210');
  assert.equal(aircraftName(rescue), 'VH-SRF');
});

void test('link: two moving samples, 5 minutes apart, low and within 5 km of the fire', () => {
  const t = new FlightTracker();
  t.observe(helitak, sample(at(FIRE, 3), T0), [fire], T0);
  assert.deepEqual(t.forIncident(fire.id, T0), [], 'one sample is a fly-by');
  t.observe(
    helitak,
    sample(at(FIRE, -2, 2), T0 + 5 * MIN),
    [fire],
    T0 + 5 * MIN,
  );
  const [link] = t.forIncident(fire.id, T0 + 5 * MIN);
  assert.equal(link.hex, helitak.hex);
  assert.equal(
    link.since,
    new Date(T0).toISOString(),
    'since the first sample',
  );
  assert.equal(link.working, true);
  assert.equal(link.airborne, true);
  assert.equal(link.track.length, 2);
  // Half an hour without a sample near the fire: no longer working on it.
  assert.equal(t.forIncident(fire.id, T0 + 40 * MIN)[0].working, false);
  // A day later it is off the incident.
  assert.deepEqual(t.forIncident(fire.id, T0 + 25 * 60 * MIN), []);
});

/** Feeds two samples and says whether a link came out. */
function linked(aircraft, first, second, gapMin = 5, fires = [fire]) {
  const t = new FlightTracker();
  t.observe(aircraft, first(T0), fires, T0);
  const later = T0 + gapMin * MIN;
  t.observe(aircraft, second(later), fires, later);
  return fires.some((f) => t.forIncident(f.id, later).length > 0);
}

void test('no link: too far, too high, too short, standing still, or not a firefighting aircraft', () => {
  const near = (o) => (t) => sample(at(FIRE, 2), t, o);
  const near2 = (o) => (t) => sample(at(FIRE, -2), t, o);
  assert.equal(linked(helitak, near(), near2()), true, 'the base case links');
  // 6 km out, twice: the helicopter of 12-11 hovered 7.9 km from a fire.
  assert.equal(
    linked(
      helitak,
      (t) => sample(at(FIRE, LINK_KM + 1), t),
      (t) => sample(at(FIRE, 0, LINK_KM + 1), t),
    ),
    false,
  );
  assert.equal(
    linked(helitak, near({ altFt: 9000 }), near2({ altFt: 9000 })),
    false,
    'above 8,000 ft is transit',
  );
  assert.equal(linked(helitak, near(), near2(), 3), false, '3 minutes');
  assert.equal(linked(helitak, near(), near2(), 25), false, '25 minutes apart');
  assert.equal(
    linked(helitak, near(), near2({ gs: 0.7, altFt: 25 })),
    false,
    'parked next to the fire',
  );
  assert.equal(linked(rescue, near(), near2()), false, 'rescue helicopter');
  assert.equal(linked(medical, near(), near2()), false, 'medical aircraft');
  assert.equal(
    linked({ ...helitak, role: 'police' }, near(), near2()),
    false,
    'police',
  );
});

void test('no link to a fire that is safe or patrolled, and none when two fires are about as near', () => {
  assert.equal(isWorkedFire({ status: 'Patrolled' }), false);
  assert.equal(isWorkedFire({ status: 'Safe' }), false);
  assert.equal(isWorkedFire({ status: 'Out' }), false);
  assert.equal(isWorkedFire({ status: 'Advice · Being controlled' }), true);
  assert.equal(isWorkedFire({ status: 'Going' }), true);
  const p = { ...at(FIRE, 2), altFt: 1000 };
  assert.equal(linkFire(p, [{ ...fire, status: 'Patrolled' }]), null);
  // A second fire 3 km from the aircraft, 5 km from the first: ambiguous.
  const other = {
    ...fire,
    id: 'nsw:incident:2',
    point: [at(FIRE, 5).lat, FIRE.lon],
  };
  assert.equal(linkFire(p, [fire, other]), null);
  // The same fire listed twice (NSW does that) still links.
  const twin = { ...fire, id: 'nsw:incident:3' };
  assert.equal(linkFire(p, [fire, twin]).id, fire.id);
  // A big fire reaches further: 1,200 ha is a radius of about 2 km.
  const far = { ...at(FIRE, 6.5), altFt: 1000 };
  assert.equal(linkFire(far, [fire]), null);
  assert.equal(linkFire(far, [{ ...fire, sizeHa: 1200 }]).id, fire.id);
});

void test('take-off: seen on the ground before, or low and climbing; not when it comes into view at height', () => {
  const t = new FlightTracker();
  const base = at(FIRE, -200);
  t.observe(tanker, ground(base, T0), [], T0);
  assert.equal(t.current(tanker.hex), null, 'on the ground is no flight');
  t.observe(
    tanker,
    sample(at(base, 30), T0 + 8 * MIN, { gs: 300, altFt: 15000 }),
    [],
    T0 + 8 * MIN,
  );
  assert.equal(t.current(tanker.hex).takeoffSeen, true);
  assert.equal(t.state(tanker.hex), 'airborne');

  const climbing = new FlightTracker();
  climbing.observe(
    seat,
    sample(base, T0, { altFt: 900, climbFpm: 800, gs: 110 }),
    [],
    T0,
  );
  assert.equal(climbing.current(seat.hex).takeoffSeen, true);

  const enRoute = new FlightTracker();
  enRoute.observe(tanker, sample(base, T0, { altFt: 21000, gs: 380 }), [], T0);
  assert.equal(enRoute.current(tanker.hex).takeoffSeen, false);

  // A poll that asked for it and did not find it, then low: it just left.
  const absent = new FlightTracker();
  absent.afterPoll(new Set([tanker.hex]), T0);
  absent.observe(
    tanker,
    sample(base, T0 + 8 * MIN, { altFt: 9000, gs: 300 }),
    [],
    T0 + 8 * MIN,
  );
  assert.equal(absent.current(tanker.hex).takeoffSeen, true);

  // A parked helicopter that reports a height instead of "ground" does not fly.
  const parked = new FlightTracker();
  parked.observe(helitak, sample(base, T0, { altFt: 25, gs: 0.7 }), [], T0);
  parked.observe(
    helitak,
    sample(base, T0 + 3 * MIN, { altFt: 25, gs: 0.7 }),
    [],
    T0 + 3 * MIN,
  );
  assert.equal(parked.current(helitak.hex), null);
});

/** A tanker taking off 200 km south of the fire and flying north at it. */
function tankerRun(t, aircraft, fires, { from = 200, start = T0 } = {}) {
  const events = [];
  const base = at(FIRE, -from);
  events.push(...t.observe(aircraft, ground(base, start), fires, start));
  for (const [i, north] of [
    [1, 40],
    [2, 100],
    [3, 160],
  ].entries()) {
    const when = start + (i + 1) * 8 * MIN;
    events.push(
      ...t.observe(
        aircraft,
        sample(at(base, north[1]), when, { gs: 320, altFt: 12000, track: 0 }),
        fires,
        when,
      ),
    );
  }
  return events;
}

void test('large air tanker: one event when it heads for the one fire ahead, twice in a row', () => {
  const t = new FlightTracker();
  const events = tankerRun(t, tanker, [fire]);
  assert.equal(events.length, 1, 'never more than one per flight');
  assert.equal(events[0].type, 'air-tanker');
  assert.equal(events[0].mode, 'heading');
  assert.equal(events[0].name, 'Bomber 210');
  assert.equal(events[0].fire.id, fire.id);
  assert.equal(events[0].flightId, t.current(tanker.hex).id);
  // Later in the same flight it works on the fire: still no second event.
  const more = [];
  for (const [i, east] of [-2, 2, -2].entries()) {
    const when = T0 + (40 + i * 5) * MIN;
    more.push(
      ...t.observe(
        tanker,
        sample(at(FIRE, 1, east), when, { gs: 150, altFt: 2500 }),
        [fire],
        when,
      ),
    );
  }
  assert.equal(t.forIncident(fire.id, T0 + 50 * MIN).length, 1, 'it is linked');
  assert.deepEqual(more, []);
});

void test('large air tanker: no event for a SEAT, without a seen take-off, or with two fires ahead', () => {
  assert.deepEqual(tankerRun(new FlightTracker(), seat, [fire]), []);
  // Two significant fires in the same direction: which one is unknown.
  const beyond = {
    ...fire,
    id: 'nsw:incident:9',
    point: [at(FIRE, 30).lat, FIRE.lon],
  };
  assert.deepEqual(tankerRun(new FlightTracker(), tanker, [fire, beyond]), []);
  // A small fire without a warning is not where a large air tanker goes.
  assert.deepEqual(
    tankerRun(new FlightTracker(), tanker, [{ ...fire, level: null }]),
    [],
  );
  assert.equal(
    tankerRun(new FlightTracker(), tanker, [
      { ...fire, level: null, sizeHa: 450 },
    ]).length,
    1,
  );
  // Flying away from the fire.
  const p = { ...at(FIRE, -100), gs: 320, track: 180 };
  assert.equal(headingFire(p, [fire]), null);
  assert.equal(headingFire({ ...p, track: 0 }, [fire]).fire.id, fire.id);
  // First seen at cruise height: no take-off, no event.
  const t = new FlightTracker();
  const events = [];
  for (const [i, north] of [40, 100, 160].entries()) {
    const when = T0 + i * 8 * MIN;
    events.push(
      ...t.observe(
        tanker,
        sample(at(FIRE, north - 200), when, {
          gs: 380,
          altFt: 24000,
          track: 0,
        }),
        [fire],
        when,
      ),
    );
  }
  assert.deepEqual(events, []);
});

void test('large air tanker: when the heading never was clear, the event comes once it works on the fire', () => {
  const t = new FlightTracker();
  const base = at(FIRE, -30, -40);
  const events = [...t.observe(tanker, ground(base, T0), [fire], T0)];
  for (const [i, east] of [-2, 2, -2].entries()) {
    const when = T0 + (8 + i * 5) * MIN;
    events.push(
      ...t.observe(
        tanker,
        sample(at(FIRE, 1, east), when, { gs: 160, altFt: 2500, track: 90 }),
        [fire],
        when,
      ),
    );
  }
  assert.equal(events.length, 1);
  assert.equal(events[0].mode, 'working');
});

void test('a second flight of the same tanker gets its own event; a restart does not repeat one', () => {
  const db = new DatabaseSync(':memory:');
  const t = new FlightTracker({ db, now: T0 });
  assert.equal(tankerRun(t, tanker, [fire]).length, 1);
  const first = t.current(tanker.hex).id;
  // Restart in mid-flight: the flight and its mark come back.
  const again = new FlightTracker({ db, now: T0 + 33 * MIN });
  assert.equal(again.current(tanker.hex).id, first);
  const when = T0 + 34 * MIN;
  assert.deepEqual(
    again.observe(
      tanker,
      sample(at(FIRE, -20), when, { gs: 320, altFt: 9000, track: 0 }),
      [fire],
      when,
    ),
    [],
  );
  // It lands, and takes off again two hours later.
  again.observe(
    tanker,
    ground(at(FIRE, -200), T0 + 60 * MIN),
    [fire],
    T0 + 60 * MIN,
  );
  assert.equal(again.current(tanker.hex), null);
  const second = tankerRun(again, tanker, [fire], { start: T0 + 180 * MIN });
  assert.equal(second.length, 1);
  assert.notEqual(second[0].flightId, first);
});

void test('push: off by default, then only to devices that asked, within their Fire radius, once per flight', async () => {
  assert.equal(airTankerPushOn({}), false);
  assert.equal(airTankerPushOn({ AIR_TANKER_PUSH: 'on' }), true);
  const event = {
    type: 'air-tanker',
    flightId: 'a09922-1',
    hex: tanker.hex,
    name: 'Bomber 210',
    mode: 'heading',
    fire,
  };
  const make = (env) => {
    const sent = [];
    const push = new PushService(new DatabaseSync(':memory:'), {
      env,
      send: async (items) => {
        sent.push(...items);
        return [];
      },
    });
    const device = (deviceId, filter, place = [-30.5, 151.65]) => {
      const { id } = push.register({
        deviceId,
        pushToken: `ExponentPushToken[${deviceId}]`,
        lat: place[0],
        lon: place[1],
      });
      push.setFilter(id, {
        notificationsEnabled: true,
        radiusKm: 20,
        ...filter,
      });
      return id;
    };
    return { push, sent, device };
  };

  const off = make({});
  off.device('device-wants', { airTankers: true });
  assert.deepEqual(await off.push.airTanker(event), { sent: 0, reason: 'off' });
  assert.equal(off.sent.length, 0);

  const on = make({ AIR_TANKER_PUSH: 'on' });
  const wants = on.device('device-wants', { airTankers: true });
  on.device('device-default', {});
  on.device('device-far', { airTankers: true }, [-37.8, 144.9]);
  on.device('device-no-fire', { airTankers: true, services: ['Rescue'] });
  assert.equal((await on.push.airTanker(event)).sent, 1);
  assert.equal(on.sent.length, 1);
  assert.equal(on.sent[0].device, wants);
  assert.equal(on.sent[0].critical, false);
  assert.deepEqual(on.sent[0].msg, {
    title: 'Large air tanker Bomber 210 airborne',
    body: 'Heading towards the fire near Armidale',
    data: { incidentId: fire.id, aircraft: tanker.hex },
  });
  // The same flight again (a retry, a restart): nothing.
  assert.equal((await on.push.airTanker(event)).sent, 0);
  assert.equal(
    (await on.push.airTanker({ ...event, mode: 'working' })).sent,
    0,
  );
  assert.equal(on.sent.length, 1);
  // The preference is a boolean the app sets; anything else is ignored.
  on.push.setFilter(wants, { airTankers: 'yes' });
  assert.equal(
    on.push.devices().find((d) => d.id === wants).filter.airTankers,
    true,
  );
  on.push.setFilter(wants, { airTankers: false });
  assert.equal(
    (await on.push.airTanker({ ...event, flightId: 'a09922-2' })).sent,
    0,
  );
});

/** Flies a rescue helicopter out and back; returns the tracker. */
function mission(t, start, from, to, { landAt = to } = {}) {
  t.observe(rescue, ground(from, start), [fire], start);
  t.observe(
    rescue,
    sample(at(from, 5), start + 4 * MIN, { gs: 130 }),
    [fire],
    start + 4 * MIN,
  );
  t.observe(
    rescue,
    sample(at(to, 1), start + 12 * MIN, { gs: 60 }),
    [fire],
    start + 12 * MIN,
  );
  t.observe(rescue, ground(landAt, start + 16 * MIN), [fire], start + 16 * MIN);
  return start + 16 * MIN;
}

const PRIVATE_KEYS = [
  'endedAt',
  'id',
  'landing',
  'lastSeenAt',
  'startedAt',
  'state',
  'takeoffSeen',
  'track',
];

void test('rescue helicopter: airborne, landed, back at base; a landing elsewhere is never named', () => {
  const t = new FlightTracker();
  const base = at(FIRE, -150);
  // Deliberately next to the fire: a rescue helicopter landing there must
  // not pick up the fire's name or place.
  const scene = at(FIRE, 1);
  const hospital = at(FIRE, -60, 40);
  const HOUR = 60 * MIN;
  // Day 1: out to the scene, to the hospital, home. The base is not known yet.
  let clock = T0;
  mission(t, clock, base, scene);
  assert.equal(t.state(rescue.hex, clock + 20 * MIN), 'landed');
  mission(t, clock + 30 * MIN, scene, hospital);
  mission(t, clock + 70 * MIN, hospital, base);
  assert.equal(
    t.state(rescue.hex, clock + 90 * MIN),
    'landed',
    'base not learnt yet',
  );
  // Two take-offs from the same place after hours of rest: that is the base.
  clock += 8 * HOUR;
  mission(t, clock, base, scene);
  mission(t, clock + 30 * MIN, scene, base);
  clock += 8 * HOUR;
  mission(t, clock, base, scene);
  assert.equal(t.state(rescue.hex, clock + 20 * MIN), 'landed_elsewhere');
  t.observe(
    rescue,
    sample(at(scene, 5), clock + 30 * MIN, { gs: 120 }),
    [fire],
    clock + 30 * MIN,
  );
  assert.equal(t.state(rescue.hex, clock + 31 * MIN), 'airborne');
  t.observe(
    rescue,
    ground(hospital, clock + 50 * MIN),
    [fire],
    clock + 50 * MIN,
  );
  assert.equal(t.state(rescue.hex, clock + 51 * MIN), 'landed_elsewhere');
  mission(t, clock + 80 * MIN, hospital, base);
  assert.equal(t.state(rescue.hex, clock + 100 * MIN), 'at_base');
  // A day later the last landing says nothing about now.
  assert.equal(t.state(rescue.hex, clock + 30 * HOUR), null);

  const flights = t.flights(rescue.hex, clock + 100 * MIN);
  assert.equal(flights.length, 8);
  assert.deepEqual(
    flights.slice(0, 3).map((f) => [f.state, f.landing]),
    [
      ['landed', 'base'],
      ['landed', 'elsewhere'],
      ['landed', 'elsewhere'],
    ],
  );
  for (const f of flights) {
    assert.deepEqual(Object.keys(f).sort(), PRIVATE_KEYS, 'no other field');
    assert.ok([null, 'base', 'elsewhere', 'unknown'].includes(f.landing));
    assert.ok(
      f.track.every(
        (p) => p.length === 4 && p.every((v) => typeof v === 'number'),
      ),
    );
  }
  // No fire, no incident, no place name anywhere in what the API gives.
  const text = JSON.stringify(flights);
  for (const word of [
    'Armidale',
    'Cookes',
    'Bush Fire',
    'nsw:incident',
    'hospital',
    'fires',
  ])
    assert.equal(text.includes(word), false, word);
  assert.deepEqual(t.forIncident(fire.id, clock + 100 * MIN), []);
});

void test('medical aircraft: same rules, and the layer shows no fire next to it', async () => {
  const t = new FlightTracker();
  const strip = at(FIRE, 2);
  t.observe(medical, ground(at(FIRE, -300), T0), [fire], T0);
  t.observe(
    medical,
    sample(at(FIRE, -200), T0 + 10 * MIN, { gs: 280, altFt: 20000 }),
    [fire],
    T0 + 10 * MIN,
  );
  t.observe(
    medical,
    sample(at(FIRE, 3), T0 + 40 * MIN, { gs: 110, altFt: 1200 }),
    [fire],
    T0 + 40 * MIN,
  );
  t.observe(
    medical,
    sample(at(FIRE, -3), T0 + 45 * MIN, { gs: 110, altFt: 1200 }),
    [fire],
    T0 + 45 * MIN,
  );
  t.observe(medical, ground(strip, T0 + 50 * MIN), [fire], T0 + 50 * MIN);
  const [f] = t.flights(medical.hex, T0 + 60 * MIN);
  assert.deepEqual(Object.keys(f).sort(), PRIVATE_KEYS);
  assert.equal(f.landing, 'unknown');
  assert.deepEqual(t.forIncident(fire.id, T0 + 60 * MIN), []);

  const s = new AircraftService({
    key: 'k',
    fleet: [medical, helitak],
    tracking: true,
    activeFires: () => [fire],
    log: () => {},
    fetcher: async () => ({
      status: 200,
      ok: true,
      headers: { get: () => null },
      json: async () => ({
        ac: [
          {
            hex: medical.hex,
            ...at(FIRE, 2),
            alt_baro: 1200,
            gs: 110,
            seen_pos: 1,
          },
          {
            hex: helitak.hex,
            ...at(FIRE, 2),
            alt_baro: 1200,
            gs: 90,
            seen_pos: 1,
          },
        ],
      }),
    }),
  });
  await s.tick(T0);
  const snap = s.snapshot(T0 + 1000);
  const byRole = Object.fromEntries(snap.aircraft.map((a) => [a.role, a]));
  assert.equal(byRole.medical.nearFire, null);
  assert.equal(byRole.medical.workingOn, null);
  assert.equal(byRole.medical.state, 'airborne');
  assert.equal(byRole.helitak.nearFire.id, fire.id);
  const flights = s.flightsOf(medical.hex, T0 + 1000);
  assert.equal(JSON.stringify(flights).includes('Armidale'), false);
  assert.match(flights.attribution, /adsb\.lol \(ODbL\)/);
  assert.equal(s.flightsOf('7c0000'), null, 'not in the fleet');
});

void test('out of range: two polls without the aircraft end the flight, a failed poll never does', () => {
  const t = new FlightTracker();
  const asked = new Set([helitak.hex]);
  t.observe(
    helitak,
    sample(at(FIRE, 40), T0, { altFt: 4500, gs: 150 }),
    [],
    T0,
  );
  t.afterPoll(asked, T0);
  assert.equal(t.state(helitak.hex, T0), 'airborne');
  t.afterPoll(asked, T0 + 8 * MIN);
  assert.equal(t.state(helitak.hex, T0 + 8 * MIN), 'airborne', 'one miss');
  // An hour of failed polls (no afterPoll): still the same flight.
  assert.equal(t.state(helitak.hex, T0 + 60 * MIN), 'airborne');
  t.afterPoll(asked, T0 + 60 * MIN);
  assert.equal(t.state(helitak.hex, T0 + 61 * MIN), 'unknown');
  const [f] = t.flights(helitak.hex, T0 + 61 * MIN);
  assert.equal(f.state, 'lost');
  assert.equal(f.endedAt, new Date(T0).toISOString());
  // Low and slow when it disappeared: it landed, but nobody saw where.
  const low = new FlightTracker();
  low.observe(rescue, sample(at(FIRE, 40), T0, { altFt: 600, gs: 70 }), [], T0);
  low.afterPoll(new Set([rescue.hex]), T0 + 8 * MIN);
  low.afterPoll(new Set([rescue.hex]), T0 + 16 * MIN);
  assert.equal(low.flights(rescue.hex, T0 + 17 * MIN)[0].state, 'landed');
  assert.equal(low.state(rescue.hex, T0 + 17 * MIN), 'landed');
});

void test('history: 7 days per aircraft, and a running flight survives a restart', () => {
  const db = new DatabaseSync(':memory:');
  const t = new FlightTracker({ db, now: T0 });
  const base = at(FIRE, -150);
  mission(t, T0, base, at(FIRE, -100));
  t.observe(
    rescue,
    sample(at(FIRE, -90), T0 + 30 * MIN, { gs: 120 }),
    [],
    T0 + 30 * MIN,
  );
  const again = new FlightTracker({ db, now: T0 + 35 * MIN });
  assert.equal(again.state(rescue.hex, T0 + 35 * MIN), 'airborne');
  again.observe(rescue, ground(base, T0 + 45 * MIN), [], T0 + 45 * MIN);
  const flights = again.flights(rescue.hex, T0 + 50 * MIN);
  assert.equal(flights.length, 2);
  assert.equal(
    flights[0].track.length,
    2,
    'the point from before the restart is kept',
  );
  // Eight days on, a new start finds nothing left.
  const later = T0 + HISTORY_MS + 24 * 60 * MIN;
  const old = new FlightTracker({ db, now: later });
  assert.deepEqual(old.flights(rescue.hex, later), []);
  assert.equal(
    db.prepare('SELECT count(*) AS n FROM aircraft_flights').get().n,
    0,
  );
});

// ── Request budget ──────────────────────────────────────────────────────────

/** A fleet like the live one: 14 tankers, 230 other firefighting, 48 rescue, 110 medical, 13 police. */
function bigFleet() {
  const list = [];
  const add = (n, o) => {
    for (let i = 0; i < n; i++)
      list.push({
        hex: (0x7c0000 + list.length).toString(16),
        registration: `VH-${list.length}`,
        callsign: null,
        rotor: false,
        class: null,
        type: 'X',
        model: 'X',
        ...o,
      });
  };
  add(14, { role: 'bomber', class: 'FW - Type 1 MEAT' });
  add(115, { role: 'bomber', class: 'FW - Type 4 SEAT' });
  add(115, { role: 'helitak', class: 'RW - Type 2 Medium' });
  add(48, { role: 'rescue' });
  add(110, { role: 'medical' });
  add(13, { role: 'police' });
  return list;
}

/** Runs the service for `hours` with a tick every 30 s; returns the requests made. */
async function run(s, calls, hours, { view = false, start = T0 } = {}) {
  for (let t = start; t < start + hours * 60 * MIN; t += 30_000) {
    if (view) s.lastView = t;
    await s.tick(t);
  }
  return calls.length;
}

function service({ fires = [], airborne = [], db = null, budget } = {}) {
  const calls = [];
  const fleet = bigFleet();
  const s = new AircraftService({
    key: 'k',
    fleet,
    db,
    tracking: true,
    budget: budget ?? new Budget(30, 300, T0),
    activeFires: () => fires,
    log: () => {},
    fetcher: async (url) => {
      calls.push(url);
      const asked = new Set(url.split('/').at(-1).split(','));
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        json: async () => ({
          ac: airborne
            .filter((hex) => asked.has(hex))
            .map((hex) => ({
              hex,
              lat: -33 + Math.random() * 0.01,
              lon: 150,
              alt_baro: 2000,
              gs: 120,
              seen_pos: 1,
            })),
        }),
      };
    },
  });
  return { s, calls, fleet };
}

void test('budget: without a viewer one request a round, every 12 minutes, 120 a day', async () => {
  const { s, calls, fleet } = service();
  assert.equal(await run(s, calls, 24), (24 * 60 * MIN) / WATCH_IDLE_MS);
  for (const url of calls) {
    const hexes = url.split('/').at(-1).split(',');
    assert.ok(hexes.length <= 150, 'one request holds at most 150 aircraft');
    const roles = new Set(
      hexes.map((h) => fleet.find((a) => a.hex === h).role),
    );
    // No fire: no firefighting aircraft; police are never followed.
    assert.deepEqual(
      [...roles].sort((a, b) => a.localeCompare(b)),
      ['medical', 'rescue'],
    );
    assert.equal(
      hexes.filter((h) => fleet.find((a) => a.hex === h).role === 'rescue')
        .length,
      48,
    );
  }
});

void test('budget: with aircraft in the air every 8 minutes, 180 a day, still one request a round', async () => {
  const fleet = bigFleet();
  const up = fleet
    .filter((a) => a.role === 'helitak')
    .slice(0, 5)
    .map((a) => a.hex);
  const { s, calls } = service({ fires: [fire], airborne: up });
  const n = await run(s, calls, 24);
  assert.ok(
    n <= Math.ceil((24 * 60 * MIN) / WATCH_ACTIVE_MS) + 1,
    `${n} requests`,
  );
  assert.ok(n >= 170, `${n} requests`);
  // In flight, the tankers and the rescue helicopters ride in every round;
  // the other firefighting aircraft take turns and all come by.
  const seen = new Set();
  for (const url of calls.slice(3)) {
    const hexes = new Set(url.split('/').at(-1).split(','));
    assert.ok(hexes.size <= 150);
    for (const h of up)
      assert.ok(hexes.has(h), 'an aircraft in flight is asked every round');
    for (const a of fleet)
      if (
        (a.role === 'bomber' && a.class.includes('Type 1')) ||
        a.role === 'rescue'
      )
        assert.ok(hexes.has(a.hex));
    for (const h of hexes) seen.add(h);
  }
  for (const a of fleet)
    assert.equal(
      seen.has(a.hex),
      a.role !== 'police' && a.role !== 'medical',
      a.role,
    );
});

void test('budget: a viewer all day on top never gets past the bucket, and tracking leaves a reserve', async () => {
  const fleet = bigFleet();
  const up = fleet
    .filter((a) => a.role === 'rescue')
    .slice(0, 3)
    .map((a) => a.hex);
  const budget = new Budget(30, 300, T0);
  const { s, calls } = service({ fires: [fire], airborne: up, budget });
  const n = await run(s, calls, 24, { view: true });
  // A full bucket of 30 plus 300 a day is the most that can ever go out.
  assert.ok(n <= 330, `${n} requests`);
  assert.ok(n > 250, `${n} requests: the viewer uses what there is`);
  // The viewer has emptied the bucket; tracking alone does not touch the
  // last 10 and waits until the bucket is above them.
  const before = calls.length;
  const end = T0 + 24 * 60 * MIN;
  assert.ok(budget.level(end) < WATCH_RESERVE);
  s.lastView = -Infinity;
  await run(s, calls, 0.5, { start: end });
  assert.equal(calls.length, before, 'below the reserve tracking waits');
  await run(s, calls, 24, { start: end + 30 * MIN });
  assert.ok(budget.level(end + 24.5 * 60 * MIN) >= WATCH_RESERVE - 1);
});

void test('budget: the level survives a restart, so restarts cannot refill the bucket', async () => {
  const db = new DatabaseSync(':memory:');
  const first = service({ db, budget: new Budget(30, 300, T0) });
  first.s.lastView = T0;
  await first.s.tick(T0);
  const used = first.calls.length;
  assert.ok(used >= 1);
  const budget = new Budget(30, 300, T0 + 1000);
  service({ db, budget });
  assert.ok(Math.abs(budget.level(T0 + 1000) - (30 - used)) < 0.01);
});

void test('tracking is on unless AIRCRAFT_TRACKING says off, and off means no poll without a viewer', async () => {
  assert.equal(trackingOn({}), true);
  assert.equal(trackingOn({ AIRCRAFT_TRACKING: 'off' }), false);
  const calls = [];
  const s = new AircraftService({
    key: 'k',
    fleet: bigFleet(),
    log: () => {},
    fetcher: async (url) => {
      calls.push(url);
      return {
        status: 200,
        ok: true,
        headers: { get: () => null },
        json: async () => ({ ac: [] }),
      };
    },
  });
  assert.equal(await run(s, calls, 2), 0);
  assert.equal(s.snapshot(T0).status.tracking, false);
});

// ── Routes ──────────────────────────────────────────────────────────────────

void test('routes: flights of an aircraft and the aircraft working on an incident', async () => {
  const store = new IncidentStore();
  const aircraft = new AircraftService({
    key: 'k',
    fleet: [helitak, rescue],
    tracking: true,
    activeFires: () => [fire],
    log: () => {},
  });
  const now = Date.now();
  aircraft.tracker.observe(
    helitak,
    sample(at(FIRE, 3), now - 6 * MIN),
    [fire],
    now - 6 * MIN,
  );
  aircraft.tracker.observe(
    helitak,
    sample(at(FIRE, -2), now - MIN),
    [fire],
    now - MIN,
  );
  aircraft.tracker.observe(
    rescue,
    sample(at(FIRE, 1), now - MIN, { gs: 100 }),
    [fire],
    now - MIN,
  );
  const server = createServer(store, null, aircraft);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const res = await fetch(
      `${base}/v1/incidents/${encodeURIComponent(fire.id)}/aircraft`,
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.incidentId, fire.id);
    assert.equal(
      body.aircraft.length,
      1,
      'the helitak, not the rescue helicopter',
    );
    const a = body.aircraft[0];
    assert.equal(a.name, 'Helitak 201');
    assert.equal(a.registration, 'VH-VQB');
    assert.equal(a.type, 'B412');
    assert.equal(a.working, true);
    assert.equal(a.track.length, 2);
    assert.match(body.attribution, /adsb\.lol \(ODbL\)/);
    // The id also works unencoded, and an unknown incident is an empty list.
    const plain = await (
      await fetch(`${base}/v1/incidents/${fire.id}/aircraft`)
    ).json();
    assert.equal(plain.aircraft.length, 1);
    const none = await (
      await fetch(`${base}/v1/incidents/nsw:incident:404/aircraft`)
    ).json();
    assert.deepEqual(none.aircraft, []);

    const flights = await (
      await fetch(`${base}/v1/aircraft/${helitak.hex}/flights`)
    ).json();
    assert.equal(flights.aircraft.callsign, 'HELITAK 201');
    assert.equal(flights.state, 'airborne');
    assert.equal(flights.historyDays, 7);
    assert.equal(flights.flights[0].fires[0].id, fire.id);
    const heli = await (
      await fetch(`${base}/v1/aircraft/${rescue.hex}/flights`)
    ).json();
    assert.equal(heli.flights.length, 1);
    assert.equal('fires' in heli.flights[0], false);
    assert.equal(
      (await fetch(`${base}/v1/aircraft/7c0000/flights`)).status,
      404,
    );
    assert.equal(
      (await fetch(`${base}/v1/incidents/%E0%A4%A/aircraft`)).status,
      400,
    );
    // Reading these routes is not "someone looks at the layer".
    assert.equal(aircraft.lastView, -Infinity);
  } finally {
    await new Promise((r) => server.close(r));
    store.close();
  }
});
