import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseVaartBeeld, beschikbareWaterLagen, inWaterLagen, koersVan, vaartToestand, knopenTekst, lengteTekst,
  vaartuigRegel, parseTochten, tochtMaat, tochtVerloop, STANDAARD_WATER, WATER_LAGEN,
} from '../src/vaartuigData.ts';
import { LUCHT_GROEPEN } from '../src/vliegtuigData.ts';
import { schoneKeuze, standaardKeuze } from '../src/kaartFilter.ts';

const NU = Date.parse('2026-11-13T12:00:00Z');
// A row as /v1/vessels served it on 13-11-2026.
const rij = (o = {}) => ({
  mmsi: 503159630, name: 'RELIANT2', callsign: 'VJN1234', category: 'rescue', organisation: 'Marine Rescue NSW',
  unit: 'Port Stephens 31', basis: 'type+name', lengthM: 12, lat: -31.99977, lon: 115.82036, speedKn: 7.2,
  course: 156.1, heading: 207, moving: true, seenAt: '2026-11-13T11:58:00.000Z', stale: false,
  berth: { lat: -32.0, lon: 115.8 }, atBerth: false, trip: { id: 1, startedAt: '2026-11-13T11:21:30.000Z' }, ...o,
});

test('the backend answer is read as it is served today', () => {
  const b = parseVaartBeeld({
    vessels: [rij(), rij({ mmsi: 503000720, name: 'QPV VEDETTE', category: 'police', moving: false, stale: true, course: null, heading: null, atBerth: null, trip: null, speedKn: 0 })],
    categories: ['patrol', 'police', 'rescue'],
    updatedAt: '2026-11-13T11:59:00.000Z',
    attribution: 'Vessel positions: Open Waters AIS (https://openwaters.io/ais/), with AISHub (https://www.aishub.net) and aisstream.io.',
    status: { enabled: true, pausedUntil: null, error: null, known: 102, requestsLastHour: 14, truncatedScans: [] },
  });
  assert.equal(b.vaartuigen.length, 2);
  assert.equal(b.vaartuigen[0].soort, 'rescue');
  assert.deepEqual(b.vaartuigen[0].tocht, { id: 1, startedAt: '2026-11-13T11:21:30.000Z' });
  assert.equal(b.vaartuigen[1].stale, true);
  assert.equal(b.vaartuigen[1].atBerth, null);
  assert.deepEqual(b.soorten, ['rescue', 'police', 'patrol']);
  assert.match(b.bron, /Open Waters AIS/);
  assert.equal(b.aan, true);
});

test('a bad coordinate never reaches the map: text is coerced, the rest drops out', () => {
  const b = parseVaartBeeld({
    vessels: [
      rij({ mmsi: 1, lat: '-31.9', lon: '115.8' }), // text: becomes numbers
      rij({ mmsi: 2, lat: 'south' }),
      rij({ mmsi: 3, lat: null }),
      rij({ mmsi: 4, lon: 200 }),
      rij({ mmsi: 5, lat: 0, lon: 0 }),
      rij({ mmsi: 6, category: 'navy' }),
      rij({ mmsi: 7, seenAt: 'gisteren' }),
      rij({ mmsi: 'x' }),
      rij({ mmsi: 1 }), // the same vessel twice: once
      null, 'onzin',
      rij({ mmsi: 8, course: 'north', heading: 720, speedKn: 'fast', lengthM: -3 }),
    ],
  });
  assert.deepEqual(b.vaartuigen.map((v) => v.mmsi), [1, 8]);
  assert.equal(b.vaartuigen[0].lat, -31.9);
  assert.equal(typeof b.vaartuigen[0].lon, 'number');
  const raar = b.vaartuigen[1];
  assert.deepEqual([raar.course, raar.heading, raar.speedKn, raar.lengthM], [null, null, null, null]);
  for (const v of [null, undefined, 'x', 5, {}, { vessels: 'x' }]) assert.deepEqual(parseVaartBeeld(v).vaartuigen, []);
});

test('layers: rescue is on in a new install, the others are off', () => {
  assert.deepEqual(STANDAARD_WATER, { rescue: true, police: false, patrol: false, fire: false });
  const s = standaardKeuze(['Fire']);
  assert.deepEqual(s.water, STANDAARD_WATER);
  // A choice saved before the vessel layer existed gets the defaults; a saved one is kept.
  assert.deepEqual(schoneKeuze({ periode: 4, lucht: { rfds: true } }, ['Fire']).water, STANDAARD_WATER);
  assert.deepEqual(
    schoneKeuze({ water: { rescue: false, police: true, onzin: true, fire: 'ja' } }, ['Fire']).water,
    { rescue: false, police: true, patrol: false, fire: false },
  );
});

test('only the categories the backend has get a switch, in a fixed order with the agreed labels', () => {
  assert.deepEqual(beschikbareWaterLagen(null), []); // older backend, or no answer yet
  assert.deepEqual(beschikbareWaterLagen(parseVaartBeeld({ vessels: [] })), []);
  const b = parseVaartBeeld({ vessels: [], categories: ['patrol', 'police', 'rescue', 'submarine'] });
  assert.deepEqual(beschikbareWaterLagen(b).map((l) => l.label), ['Rescue vessels', 'Police vessels', 'Patrol vessels']);
  const alles = parseVaartBeeld({ vessels: [], categories: ['fire', 'rescue', 'police', 'patrol'] });
  assert.deepEqual(beschikbareWaterLagen(alles).map((l) => l.label), ['Rescue vessels', 'Police vessels', 'Patrol vessels', 'Fire boats']);
});

test('only the vessels of the layers that are on', () => {
  const b = parseVaartBeeld({ vessels: [rij(), rij({ mmsi: 2, category: 'police' }), rij({ mmsi: 3, category: 'patrol' })] });
  assert.deepEqual(inWaterLagen(b.vaartuigen, STANDAARD_WATER).map((v) => v.soort), ['rescue']);
  assert.equal(inWaterLagen(b.vaartuigen, { ...STANDAARD_WATER, police: true }).length, 2);
  assert.equal(inWaterLagen(b.vaartuigen, { rescue: false, police: false, patrol: false, fire: false }).length, 0);
});

test('vessel colours are their own: no aircraft layer colour', () => {
  const lucht = new Set(LUCHT_GROEPEN.map((g) => g.kleur.toLowerCase()));
  const water = WATER_LAGEN.map((l) => l.kleur.toLowerCase());
  for (const k of water) assert.ok(!lucht.has(k), k);
  assert.equal(new Set(water).size, water.length);
});

test('a moving vessel points along its course, a still one has no direction', () => {
  assert.equal(koersVan({ moving: true, course: 156.1, heading: 207 }), 156.1);
  assert.equal(koersVan({ moving: true, course: null, heading: 207 }), 207);
  assert.equal(koersVan({ moving: true, course: null, heading: null }), null);
  assert.equal(koersVan({ moving: false, course: 156.1, heading: 207 }), null);
});

test('what the vessel is doing, in plain words', () => {
  const [v] = parseVaartBeeld({ vessels: [rij()] }).vaartuigen;
  assert.match(vaartToestand(v, true, NU), /^Under way since \d{1,2}:\d{2}/);
  assert.match(vaartToestand(v, null, NU), /^Under way since /);
  assert.match(vaartToestand(v, false, NU), /^Under way, in view since /);
  assert.equal(vaartToestand({ ...v, tocht: null }, null, NU), 'Under way');
  assert.equal(vaartToestand({ ...v, tocht: null, moving: false, atBerth: true }, null, NU), 'At its berth');
  // Lying still somewhere else, or not heard for half an hour: when it was last seen.
  assert.match(vaartToestand({ ...v, tocht: null, moving: false, atBerth: null, stale: true }, null, NU), /^Last seen /);
  assert.match(vaartToestand({ ...v, tocht: null, moving: false, atBerth: false }, null, NU), /^Last seen /);
  // A trip that is still open on a vessel that went quiet is not "under way".
  assert.match(vaartToestand({ ...v, stale: true, moving: false, atBerth: null }, true, NU), /^Last seen /);
});

test('speed in knots, length in metres, and who it belongs to', () => {
  assert.equal(knopenTekst(7.2), '7.2 kn · 13 km/h');
  assert.equal(knopenTekst(22.6), '23 kn · 42 km/h');
  assert.equal(knopenTekst(null), null);
  assert.equal(lengteTekst({ lengthM: 59 }), '59 m');
  assert.equal(lengteTekst({ lengthM: null }), null);
  assert.equal(
    vaartuigRegel({ soort: 'rescue', organisation: 'Marine Rescue NSW', unit: 'Port Stephens 31', name: 'RELIANT2' }),
    'Rescue vessel · Marine Rescue NSW · Port Stephens 31',
  );
  // The unit is often just the name again.
  assert.equal(
    vaartuigRegel({ soort: 'patrol', organisation: 'Australian Border Force', unit: 'CAPE NELSON', name: 'ABFC CAPE NELSON' }),
    'Patrol vessel · Australian Border Force',
  );
  assert.equal(vaartuigRegel({ soort: 'police', organisation: null, unit: null, name: 'WP-401' }), 'Police vessel');
});

test('trips as the backend serves them, with a track of valid points only', () => {
  const t = parseTochten({
    mmsi: 503159630, name: 'RELIANT2', category: 'rescue', organisation: null, berth: null,
    trips: [
      {
        id: 1, running: true, startedAt: '2026-11-13T11:21:30.000Z', departureSeen: false, from: 'elsewhere',
        endedAt: null, end: null, lastSeenAt: '2026-11-13T11:37:43.000Z', durationMin: 16, distanceKm: 1.1, maxKn: 7.2,
        track: [[-31.99977, 115.82036, 1794568890], ['-32.00142', '115.81354', 1794569112], [null, null, 1], ['x', 115, 2]],
      },
      {
        id: 0, running: false, startedAt: '2026-11-12T01:00:00.000Z', departureSeen: true, from: 'berth',
        endedAt: '2026-11-12T02:20:00.000Z', end: 'berth', lastSeenAt: '2026-11-12T02:20:00.000Z',
        durationMin: null, distanceKm: 23.4, maxKn: 18, track: 'weg',
      },
      { id: 'x', startedAt: '2026-11-12T01:00:00.000Z' },
      { id: 5, startedAt: 'nooit' },
      null,
    ],
    attribution: 'Vessel positions: Open Waters AIS.',
  });
  assert.equal(t.tochten.length, 2);
  assert.equal(t.tochten[0].running, true);
  assert.deepEqual(t.tochten[0].spoor.map((p) => [p.lat, p.lon]), [[-31.99977, 115.82036], [-32.00142, 115.81354]]);
  assert.deepEqual(t.tochten[1].spoor, []);
  assert.equal(t.tochten[1].durationMin, 80); // worked out from start and end
  assert.equal(t.ligplaats, null);
  assert.equal(t.bron, 'Vessel positions: Open Waters AIS.');
  assert.equal(tochtMaat(t.tochten[0]), '16 min · 1.1 km');
  assert.equal(tochtMaat(t.tochten[1]), '1 h 20 min · 23 km');
  assert.equal(tochtVerloop(t.tochten[0]), 'Under way now, departure not seen');
  assert.equal(tochtVerloop(t.tochten[1]), 'From its berth and back');
  assert.equal(tochtVerloop({ running: false, from: 'elsewhere', end: 'lost', departureSeen: false }), 'Signal lost');
  assert.equal(tochtVerloop({ running: false, from: 'berth', end: 'stopped', departureSeen: true }), 'From its berth, stopped elsewhere');
  assert.equal(tochtVerloop({ running: false, from: null, end: null, departureSeen: true }), 'Ended');
  for (const v of [null, 'x', {}, { trips: 5 }]) assert.deepEqual(parseTochten(v).tochten, []);
  assert.deepEqual(parseTochten({ berth: { lat: '-32', lon: '115.8' }, trips: [] }).ligplaats, { lat: -32, lon: 115.8 });
});
