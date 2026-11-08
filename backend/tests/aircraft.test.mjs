import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  AircraftService, Budget, pauseAfter429, isLandscapeFire, nearestFire, loadFleet, CADENCE_MS,
} from '../aircraft.mjs';

const fleet = [
  { hex: '7c5d89', registration: 'VH-SRF', callsign: 'LIFESAVER 21', role: 'rescue', rotor: true, class: 'RW - Type 2 Medium', type: 'BK17', model: 'BK117' },
  { hex: '7c1234', registration: 'VH-ABC', callsign: 'BOMBER 355', role: 'bomber', rotor: false, class: 'FW - Type 4 SEAT', type: 'AT8T', model: 'AT-802' },
];
// A bush fire near Armidale and a house fire in Melbourne.
const fires = [
  { id: 'nsw:incident:1', category: 'fire', listed: true, title: 'Bush Fire', location: 'Cookes Rd, Armidale', point: [-30.51, 151.67] },
  { id: 'vic:incident:2', category: 'fire', listed: true, title: 'Structure Fire', location: 'Lygon St, Brunswick East', point: [-37.76, 144.97] },
];

function reply(status, body, headers = {}) {
  return { status, ok: status >= 200 && status < 300, headers: { get: (k) => headers[k.toLowerCase()] ?? null }, json: async () => body };
}

test('the fleet file is there and every entry has a hex code and a role', () => {
  const f = loadFleet();
  assert.ok(f.length > 100);
  for (const a of f) {
    assert.match(a.hex, /^[0-9a-f]{6}$/);
    assert.ok(['bomber', 'helitak', 'transport', 'scanner', 'rescue'].includes(a.role));
  }
});

test('budget: a full bucket, then refilled at the daily rate', () => {
  const b = new Budget(30, 300, 0);
  assert.equal(b.take(30, 0), true);
  assert.equal(b.take(1, 0), false);
  // 300 a day = one every 4.8 min.
  assert.equal(b.take(1, 4.8 * 60_000), true);
});

test('pause after a 429 grows and never undercuts Retry-After', () => {
  assert.deepEqual([1, 2, 3, 7, 20].map((n) => pauseAfter429(n) / 60_000), [1, 5, 15, 360, 360]);
  assert.equal(pauseAfter429(1, 600), 600_000);
});

test('only landscape fires count, not a house fire in town', () => {
  assert.equal(isLandscapeFire(fires[0]), true);
  assert.equal(isLandscapeFire(fires[1]), false);
  assert.equal(isLandscapeFire({ category: 'fire', title: 'Grass Fire' }), false); // no point
});

test('nearest fire within 50 km', () => {
  assert.equal(nearestFire([-30.6, 151.7], [fires[0]]).id, 'nsw:incident:1');
  assert.equal(nearestFire([-33.87, 151.21], [fires[0]]), null);
});

test('polls only while someone looks, then shows rescue always and a bomber only near a fire', async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    return reply(200, { ac: [
      { hex: '7c5d89', lat: -33.9, lon: 151.2, alt_baro: 1500, gs: 120, track: 90, flight: 'LIFE21 ', seen_pos: 2 },
      { hex: '7c1234', lat: -30.55, lon: 151.66, alt_baro: 800, gs: 140, track: 180, flight: 'BMR355', seen_pos: 1 },
      { hex: 'abcdef', lat: -30.5, lon: 151.6 }, // not in the fleet
    ] });
  };
  const s = new AircraftService({ key: 'k', fetcher, fleet, activeFires: () => fires, log: () => {} });
  await s.tick(1_000);
  assert.equal(calls.length, 0, 'nobody looked yet');
  s.request(10_000);
  await new Promise((r) => setImmediate(r));
  assert.equal(calls.length, 1);
  assert.match(calls[0], /\/v2\/hex\/7c5d89,7c1234$/);
  const snap = s.snapshot(10_500);
  assert.deepEqual(snap.aircraft.map((a) => a.callsign).sort(), ['BOMBER 355', 'LIFESAVER 21']);
  assert.equal(snap.aircraft.find((a) => a.role === 'bomber').nearFire.id, 'nsw:incident:1');
  // Without the fire the bomber is hidden; the rescue helicopter stays.
  const zonder = new AircraftService({ key: 'k', fetcher, fleet, activeFires: () => [], log: () => {} });
  zonder.request(0);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(zonder.snapshot(100).aircraft.map((a) => a.role), ['rescue']);
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

test('a 429 pauses polling and the pause survives a restart', async () => {
  const db = new DatabaseSync(':memory:');
  const fetcher = async () => reply(429, {}, { 'retry-after': '120' });
  const s = new AircraftService({ db, key: 'k', fetcher, fleet, log: () => {} });
  s.request(0);
  await new Promise((r) => setImmediate(r));
  assert.equal(s.pausedUntil, 120_000);
  const again = new AircraftService({ db, key: 'k', fetcher, fleet, log: () => {} });
  assert.equal(again.pausedUntil, 120_000);
});

test('without a key it never calls out', async () => {
  let called = false;
  const s = new AircraftService({ key: '', fetcher: async () => { called = true; }, fleet, log: () => {} });
  s.request(0);
  await new Promise((r) => setImmediate(r));
  assert.equal(called, false);
  assert.equal(s.snapshot(0).status.enabled, false);
});
