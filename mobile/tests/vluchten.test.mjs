import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseVluchten, parseBrandToestellen, toestandTekst, vluchtAfloop, vluchtDuur, heeftSpoor, grootLabel,
  landingGeheim, brandToestelStand,
} from '../src/vluchtData.ts';
import { parseLuchtBeeld, parseToestand } from '../src/vliegtuigData.ts';

const NU = Date.parse('2026-11-13T12:00:00Z');
const toestel = (o = {}) => ({
  hex: '7c19bd', registration: 'VH-FDB', callsign: null, name: 'VH-FDB', role: 'medical',
  operator: 'Royal Flying Doctor Service', rotor: false, class: null, type: 'B350',
  model: 'BEECHCRAFT Super King Air 350', large: false, ...o,
});
const bommenwerper = (o = {}) => toestel({
  hex: '7c1234', registration: 'N137CG', callsign: 'BOMBER 137', name: 'Bomber 137', role: 'bomber',
  operator: null, class: 'FW - Type 1', type: 'B737', model: 'Boeing 737 Fireliner', large: true, ...o,
});
const SPOOR = [[1794569932, -19.8688, 147.4648, 14000], [1794569990, -19.9, 147.5, 13000], [1794570050, -19.95, 147.55, 9000]];
const vlucht = (o = {}) => ({
  id: '7c19bd-1794569932', state: 'airborne', startedAt: '2026-11-13T11:38:52.277Z', takeoffSeen: false,
  endedAt: null, lastSeenAt: '2026-11-13T11:58:52.277Z', track: SPOOR, landing: null, trackHidden: false, ...o,
});

test('the state of an aircraft in plain words, never a place', () => {
  assert.match(toestandTekst('airborne', '2026-11-13T11:38:52.277Z', true), /^Airborne since \d{1,2}:\d{2}/);
  assert.match(toestandTekst('airborne', '2026-11-13T11:38:52.277Z', null), /^Airborne since /);
  // Take-off not seen: "since" is when it came into view.
  assert.match(toestandTekst('airborne', '2026-11-13T11:38:52.277Z', false), /^Airborne, in view since /);
  assert.equal(toestandTekst('airborne', null), 'Airborne');
  assert.equal(toestandTekst('at_base', null), 'At base');
  assert.equal(toestandTekst('landed_elsewhere', '2026-11-13T11:38:52.277Z'), 'Landed away from base');
  assert.equal(toestandTekst('landed', null), 'On the ground');
  assert.equal(toestandTekst('unknown', null), null);
  assert.equal(toestandTekst(null, null), null);
  assert.equal(parseToestand('landed_elsewhere'), 'landed_elsewhere');
  assert.equal(parseToestand('landed_at_hospital'), null); // a state the app does not know says nothing
});

test('/v1/aircraft: the new fields are read, and an older backend still works', () => {
  const rij = (o = {}) => ({
    ...bommenwerper(), lat: -33.9, lon: 151.2, altFt: 1500, onGround: false, gsKts: 120, track: 90, flight: 'BMBR137',
    seenAt: new Date(NU - 60_000).toISOString(), nearFire: null, ...o,
  });
  const b = parseLuchtBeeld({
    aircraft: [
      rij({
        state: 'airborne', flightId: '7c1234-1', airborneSince: '2026-11-13T11:00:00.000Z',
        workingOn: { id: 'nsw:incident:1', title: 'Bush Fire', location: 'Cookes Rd, Armidale', since: '2026-11-13T11:20:00.000Z' },
      }),
      rij({ hex: '7c0001', large: false }), // no state at all: a backend from before 13-11
      // A medical aircraft never belongs to a fire, whatever is sent.
      rij({
        ...toestel({ hex: '7c0002' }), nearFire: { id: 'x', title: 'Fire', location: 'Y', distanceKm: 1 },
        workingOn: { id: 'x', title: 'Fire', location: 'Y', since: null }, state: 'landed_elsewhere',
      }),
      rij({ hex: '7c0003', lat: '-33.5', lon: '151.0' }), // text: coerced to numbers
    ],
  });
  const [a, oud, rfds, tekst] = b.vliegtuigen;
  assert.equal(a.large, true);
  assert.equal(a.state, 'airborne');
  assert.equal(a.workingOn.id, 'nsw:incident:1');
  assert.equal(a.callsign, 'BOMBER 137');
  assert.deepEqual([oud.state, oud.flightId, oud.airborneSince, oud.workingOn, oud.large], [null, null, null, null, false]);
  assert.deepEqual([rfds.nearFire, rfds.workingOn, rfds.state], [null, null, 'landed_elsewhere']);
  assert.deepEqual([tekst.lat, tekst.lon], [-33.5, 151.0]);
});

test('a large air tanker is called that, and only a firefighting aircraft can be one', () => {
  assert.equal(grootLabel({ large: true, role: 'bomber' }), 'Large air tanker');
  assert.equal(grootLabel({ large: false, role: 'bomber' }), null);
  assert.equal(grootLabel({ large: true, role: 'medical' }), null);
});

test('rescue and medical: a finished flight has no track, whatever the backend sends', () => {
  const v = parseVluchten({
    aircraft: toestel(), state: 'landed_elsewhere', historyDays: 7,
    flights: [
      vlucht({ id: 'a', state: 'airborne' }),
      // As served: hidden and empty.
      vlucht({ id: 'b', state: 'landed', endedAt: '2026-11-12T03:00:00Z', track: [], trackHidden: true, landing: 'base' }),
      // A backend that forgot to hide it: the app hides it anyway.
      vlucht({ id: 'c', state: 'landed', endedAt: '2026-11-11T03:00:00Z', trackHidden: false, landing: 'elsewhere' }),
      vlucht({ id: 'd', state: 'lost', trackHidden: false, landing: 'unknown' }),
      // trackHidden on a running flight is respected too.
      vlucht({ id: 'e', state: 'airborne', trackHidden: true }),
    ],
    attribution: 'Aircraft positions: adsb.lol (ODbL).',
  });
  assert.equal(v.state, 'landed_elsewhere');
  assert.deepEqual(v.vluchten.map((f) => f.spoor.length), [3, 0, 0, 0, 0]);
  assert.deepEqual(v.vluchten.map(heeftSpoor), [true, false, false, false, false]);
  assert.deepEqual(v.vluchten.map((f) => f.landing), [null, 'base', 'elsewhere', null, null]);
  assert.deepEqual(v.vluchten.map(vluchtAfloop), [
    'In the air now, take-off not seen', 'Returned to base', 'Landed away from base', 'Signal lost',
    'In the air now, take-off not seen',
  ]);
  for (const role of ['rescue', 'medical', 'police']) assert.equal(landingGeheim(role), true, role);
  for (const role of ['bomber', 'helitak', 'transport', 'scanner']) assert.equal(landingGeheim(role), false, role);
  // Rescue helicopters follow the same rule as the Flying Doctor.
  const heli = parseVluchten({ aircraft: toestel({ role: 'rescue', rotor: true }), flights: [vlucht({ state: 'landed' })] });
  assert.deepEqual(heli.vluchten[0].spoor, []);
});

test('firefighting flights keep their track and name the fires they worked on', () => {
  const v = parseVluchten({
    aircraft: bommenwerper(), state: 'landed', historyDays: 7,
    flights: [vlucht({
      id: 'f1', state: 'landed', takeoffSeen: true, endedAt: '2026-11-13T12:20:52.277Z', landing: 'base',
      track: [...SPOOR, ['x', 'y', 'z'], [1794570100, '-20.0', '147.6', 0], [1794570200, 500, 147.6, 0]],
      fires: [
        { id: 'nsw:incident:1', title: 'Bush Fire', location: 'Cookes Rd, Armidale', since: '2026-11-13T11:50:00Z', lastNear: '2026-11-13T12:10:00Z', working: false },
        { title: 'no id' }, null,
      ],
    })],
  });
  const [f] = v.vluchten;
  assert.equal(f.spoor.length, 4); // the two bad points are gone, the text one is a number
  assert.equal(f.spoor[3].lat, -20);
  assert.deepEqual(f.branden, [{ id: 'nsw:incident:1', title: 'Bush Fire', location: 'Cookes Rd, Armidale', working: false }]);
  assert.equal(f.landing, null); // base/elsewhere is only a thing for rescue and medical
  assert.equal(vluchtAfloop(f), 'Landed');
  assert.equal(vluchtDuur(f, NU), '42 min');
  assert.equal(vluchtDuur(vlucht({ state: 'airborne', startedAt: '2026-11-13T11:30:00Z' }), NU), '30 min');
  // A medical flight never lists fires.
  const rfds = parseVluchten({ aircraft: toestel(), flights: [vlucht({ fires: [{ id: 'x', title: 'Fire', location: 'Y' }] })] });
  assert.deepEqual(rfds.vluchten[0].branden, []);
});

test('a missing or broken answer is no flights, not an error', () => {
  for (const v of [null, undefined, 'x', {}, { error: 'Unknown aircraft' }, { aircraft: { hex: 'zz' } }]) {
    assert.equal(parseVluchten(v), null);
  }
  const v = parseVluchten({ aircraft: toestel(), flights: [null, {}, vlucht({ id: null }), vlucht({ state: 'taxiing' }), vlucht({ startedAt: 'x' })] });
  assert.deepEqual(v.vluchten, []);
  assert.equal(v.state, null);
});

test('aircraft at a fire: firefighting aircraft only, working ones first', () => {
  const rij = (o = {}) => ({
    ...bommenwerper(), flightId: 'f1', since: '2026-11-13T10:00:00Z', lastNear: '2026-11-13T10:40:00Z',
    working: false, airborne: false, track: SPOOR, ...o,
  });
  const { toestellen, bron } = parseBrandToestellen({
    incidentId: 'nsw:incident:1',
    aircraft: [
      rij(),
      rij({ hex: '7c5555', name: 'Helitak 231', callsign: 'HELITAK 231', role: 'helitak', rotor: true, large: false, working: true, lastNear: '2026-11-13T11:55:00Z', track: [[1, 'x', 2, 3]] }),
      rij({ hex: '7c6666', name: null, callsign: null, registration: 'VH-ABC', lastNear: '2026-11-13T11:00:00Z' }),
      rij({ hex: '7c7777', role: 'rescue' }), // never via a fire
      rij({ hex: '7c8888', role: 'police' }),
      rij({ hex: '7c1234' }), // twice: once
      rij({ hex: 'nope' }), null,
    ],
    attribution: 'Aircraft positions: adsb.lol (ODbL). Call signs: NAFC.',
  });
  assert.deepEqual(toestellen.map((t) => t.naam), ['Helitak 231', 'VH-ABC', 'Bomber 137']);
  assert.equal(toestellen[0].spoor.length, 0);
  assert.equal(toestellen[2].spoor.length, 3);
  assert.equal(toestellen[2].toestel.large, true);
  assert.equal(brandToestelStand(toestellen[0]), 'Working now');
  assert.match(brandToestelStand(toestellen[2]), /^Was here until \d{1,2}:\d{2}/);
  assert.equal(brandToestelStand({ working: false, lastNear: null }), 'Was here earlier');
  assert.match(bron, /adsb\.lol/);
  for (const v of [null, 'x', {}, { aircraft: 'x' }]) assert.deepEqual(parseBrandToestellen(v).toestellen, []);
});
