import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  alsGetal, plekVan, parseSpoor, spoorRegio, duurTekst, minutenTussen, geledenTekst, alsMoment, MAX_SPOOR,
} from '../src/spoor.ts';

// In the big app one coordinate delivered as text crashed the Android map
// (10-11-2026). Everything that reaches a map component passes through here.
test('a coordinate delivered as text becomes a number', () => {
  assert.equal(alsGetal('-33.9'), -33.9);
  assert.equal(alsGetal(151.2), 151.2);
  for (const v of ['', ' ', 'x', '12abc', null, undefined, NaN, Infinity, {}, [], true]) {
    assert.equal(alsGetal(v), null, JSON.stringify(v));
  }
  assert.deepEqual(plekVan('-33.9', '151.2'), { lat: -33.9, lon: 151.2 });
});

test('what is not a place on earth is no place', () => {
  assert.equal(plekVan(95, 151), null);
  assert.equal(plekVan(-33, 181), null);
  assert.equal(plekVan(null, 151), null);
  assert.equal(plekVan('x', 151), null);
  assert.equal(plekVan(0, 0), null); // an empty value, not the Gulf of Guinea
  assert.deepEqual(plekVan(-33, 151), { lat: -33, lon: 151 });
});

test('a vessel track is [lat, lon, time]; bad points drop out and the order stays', () => {
  const spoor = parseSpoor([
    [-32.0, 115.82, 1794568890],
    ['-32.001', '115.813', '1794569112'], // text: coerced
    [null, 115.8, 1794569200],
    [-32.002, 'east', 1794569300],
    [-320, 115.8, 1794569400],
    'onzin',
    [-32.003],
    [-32.004, 115.81, null], // no time: kept, the map only needs the place
  ], 'lat-lon-t');
  assert.deepEqual(spoor, [
    { lat: -32.0, lon: 115.82, t: 1794568890 },
    { lat: -32.001, lon: 115.813, t: 1794569112 },
    { lat: -32.004, lon: 115.81, t: 0 },
  ]);
  for (const p of spoor) assert.equal(typeof p.lat + typeof p.lon, 'numbernumber');
});

test('an aircraft track is [time, lat, lon, altitude]', () => {
  const spoor = parseSpoor([[1794569932, -19.8688, 147.4648, 14000], [1794569990, '-19.9', '147.5', 'ground'], [1, 2]], 't-lat-lon');
  assert.deepEqual(spoor, [
    { lat: -19.8688, lon: 147.4648, t: 1794569932 },
    { lat: -19.9, lon: 147.5, t: 1794569990 },
  ]);
  // Read with the wrong shape, the time lands in the latitude and the point drops out.
  assert.deepEqual(parseSpoor([[1794569932, -19.8688, 147.4648, 14000]], 'lat-lon-t'), []);
});

test('no track is an empty track', () => {
  for (const v of [null, undefined, 'x', {}, 5]) assert.deepEqual(parseSpoor(v, 'lat-lon-t'), []);
});

test('a very long track is thinned, and keeps where it is now', () => {
  const lang = Array.from({ length: 5000 }, (_, i) => [-30 - i / 10000, 150, 1000 + i]);
  const spoor = parseSpoor(lang, 'lat-lon-t');
  assert.equal(spoor.length, MAX_SPOOR);
  assert.equal(spoor[0].t, 1000);
  assert.equal(spoor.at(-1).t, 5999);
});

test('the map view fits the whole track, and never has a zero size', () => {
  assert.equal(spoorRegio([]), null);
  assert.equal(spoorRegio([{ lat: NaN, lon: 150 }]), null);
  const een = spoorRegio([{ lat: -32, lon: 115.8 }]);
  assert.deepEqual(een, { latitude: -32, longitude: 115.8, latitudeDelta: 0.02, longitudeDelta: 0.02 });
  const r = spoorRegio([{ lat: -32, lon: 115 }, { lat: -33, lon: 116 }, { lat: 'x', lon: 1 }]);
  assert.equal(r.latitude, -32.5);
  assert.equal(r.longitude, 115.5);
  assert.ok(r.latitudeDelta > 1 && r.latitudeDelta < 2);
});

test('durations and ages in plain words', () => {
  assert.equal(duurTekst(16), '16 min');
  assert.equal(duurTekst(80), '1 h 20 min');
  assert.equal(duurTekst(120), '2 h');
  assert.equal(duurTekst(0.2), 'under a minute');
  assert.equal(duurTekst(null), null);
  assert.equal(duurTekst(-5), null);
  assert.equal(minutenTussen('2026-11-13T10:00:00Z', '2026-11-13T10:42:00Z'), 42);
  assert.equal(minutenTussen('2026-11-13T10:00:00Z', null), null);
  assert.equal(minutenTussen('2026-11-13T10:00:00Z', '2026-11-13T09:00:00Z'), null);
  assert.equal(geledenTekst(0), 'Just now');
  assert.equal(geledenTekst(12), '12 min ago');
  assert.equal(geledenTekst(60), '1 hour ago');
  assert.equal(geledenTekst(200), '3 hours ago');
  assert.equal(alsMoment('gisteren'), null);
  assert.equal(alsMoment('2026-11-13T10:00:00Z'), '2026-11-13T10:00:00Z');
});
