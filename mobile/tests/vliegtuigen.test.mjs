import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  parseLuchtBeeld, beschikbareGroepen, inLagen, zonderSignaal, minutenStil, rolTekst,
  hoogteTekst, snelheidTekst, STANDAARD_LUCHT, GROEP_VAN_ROL, LUCHT_GROEPEN,
} from '../src/vliegtuigData.ts';

const NU = Date.parse('2026-11-08T22:00:00Z');
const rij = (o = {}) => ({
  hex: '7c5d89', registration: 'VH-SRF', callsign: 'LIFESAVER 21', role: 'rescue', rotor: true,
  class: 'RW - Type 2 Medium', type: 'BK17', model: 'BK117', lat: -33.9, lon: 151.2, altFt: 1500,
  onGround: false, gsKts: 120, track: 90, flight: 'LIFE21', seenAt: new Date(NU - 60_000).toISOString(),
  nearFire: null, ...o,
});

test('the backend answer is read as it is served today', () => {
  const b = parseLuchtBeeld({
    aircraft: [
      rij(),
      rij({ hex: '7C1234', role: 'bomber', rotor: false, callsign: 'BOMBER 355', nearFire: { id: 'nsw:incident:1', title: 'Bush Fire', location: 'Cookes Rd, Armidale', distanceKm: 4.2 } }),
    ],
    updatedAt: '2026-11-08T21:59:00.000Z',
    attribution: 'Aircraft positions: adsb.lol (ODbL). Call signs: NAFC.',
    status: { enabled: true, pausedUntil: null, error: null },
  });
  assert.equal(b.vliegtuigen.length, 2);
  assert.equal(b.vliegtuigen[1].hex, '7c1234');
  assert.equal(b.vliegtuigen[1].nearFire.distanceKm, 4.2);
  assert.equal(b.rollen, null); // no `roles` yet: an older backend
  assert.equal(b.aan, true);
  assert.equal(b.bron, 'Aircraft positions: adsb.lol (ODbL). Call signs: NAFC.');
});

test('police and flying doctor aircraft without a call sign get their flight or registration', () => {
  const b = parseLuchtBeeld({
    aircraft: [
      rij({ hex: '7c0002', callsign: null, flight: 'POL31', role: 'police', operator: 'NSW Police Force' }),
      rij({ hex: '7c0003', callsign: null, flight: null, registration: 'VH-FDB', role: 'medical', operator: 'Royal Flying Doctor Service' }),
    ],
  });
  assert.deepEqual(b.vliegtuigen.map((v) => v.callsign), ['POL31', 'VH-FDB']);
  assert.equal(b.vliegtuigen[0].operator, 'NSW Police Force');
});

test('bad rows drop out, the rest stays', () => {
  const b = parseLuchtBeeld({
    aircraft: [
      rij({ role: 'military' }),
      rij({ hex: 'zzz' }),
      rij({ lat: 'x' }),
      rij({ lat: 95 }),
      rij({ seenAt: 'gisteren' }),
      null,
      rij({ hex: '7c0001' }),
    ],
  });
  assert.deepEqual(b.vliegtuigen.map((v) => v.hex), ['7c0001']);
  assert.deepEqual(parseLuchtBeeld(null).vliegtuigen, []);
  assert.equal(parseLuchtBeeld({ status: { enabled: false } }).aan, false);
});

test('layers follow the roles the backend has', () => {
  assert.deepEqual(beschikbareGroepen(null).map((g) => g.key), ['blussen', 'redding']);
  assert.deepEqual(
    beschikbareGroepen(['bomber', 'helitak', 'rescue', 'police', 'medical']).map((g) => g.key),
    ['blussen', 'redding', 'politie', 'rfds'],
  );
  const b = parseLuchtBeeld({ aircraft: [], roles: ['rescue', 'police', 'onzin'] });
  assert.deepEqual(b.rollen, ['rescue', 'police']);
  // Every role has a layer, every layer a colour.
  for (const r of Object.keys(GROEP_VAN_ROL)) assert.ok(LUCHT_GROEPEN.some((g) => g.key === GROEP_VAN_ROL[r]));
});

test('only the layers that are on', () => {
  const b = parseLuchtBeeld({ aircraft: [rij(), rij({ hex: '7c1234', role: 'medical', rotor: false })] });
  assert.deepEqual(inLagen(b.vliegtuigen, STANDAARD_LUCHT).map((v) => v.role), ['rescue']);
  assert.deepEqual(inLagen(b.vliegtuigen, { ...STANDAARD_LUCHT, rfds: true }).length, 2);
});

test('no signal after 8 minutes; one backend round (3 min) is fine', () => {
  const v = { seenAt: new Date(NU - 4 * 60_000).toISOString() };
  assert.equal(minutenStil(v, NU), 4);
  assert.equal(zonderSignaal(v, NU), false);
  assert.equal(zonderSignaal({ seenAt: new Date(NU - 9 * 60_000).toISOString() }, NU), true);
});

test('plain words for the aircraft', () => {
  assert.equal(rolTekst({ role: 'bomber', rotor: false }), 'Water bomber');
  assert.equal(rolTekst({ role: 'helitak', rotor: true }), 'Firefighting helicopter');
  assert.equal(rolTekst({ role: 'rescue', rotor: true }), 'Rescue helicopter');
  assert.equal(rolTekst({ role: 'police', rotor: false }), 'Police aircraft');
  assert.equal(hoogteTekst({ altFt: 1500, onGround: false }), '1,500 ft');
  assert.equal(hoogteTekst({ altFt: null, onGround: true }), 'On the ground');
  assert.equal(snelheidTekst({ gsKts: 120 }), '120 kn · 222 km/h');
});
