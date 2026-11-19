import assert from 'node:assert/strict';
import { test } from 'node:test';
import { vlakken, heeftVlak, binnenGebied, omvang, middenVan, vlakKleur, kaartVlakken, binnenTekst } from '../src/gebied.ts';

// The Mapoon warning from the Queensland feed of 19-11-2026: only an area, no pin.
const mapoon = { type: 'Polygon', coordinates: [[
  [142.4351, -11.5037], [142.3666, -11.1799], [142.1927, -11.1844], [142.2268, -11.5022], [142.4351, -11.5037],
]] };
const metGat = { type: 'Polygon', coordinates: [
  [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
  [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
] };

test('finds the polygons in every wrapping', () => {
  assert.equal(vlakken(mapoon).length, 1);
  assert.equal(vlakken({ type: 'MultiPolygon', coordinates: [mapoon.coordinates, metGat.coordinates] }).length, 2);
  assert.equal(vlakken({ type: 'GeometryCollection', geometries: [{ type: 'Point', coordinates: [1, 2] }, mapoon] }).length, 1);
  assert.equal(heeftVlak({ type: 'Point', coordinates: [1, 2] }), false);
  assert.equal(heeftVlak(null), false);
});

test('inside the outline, not inside a hole, not outside', () => {
  assert.equal(binnenGebied(mapoon, -11.35, 142.3), true);
  assert.equal(binnenGebied(mapoon, -12.0, 142.3), false);
  assert.equal(binnenGebied(metGat, 2, 2), true);
  assert.equal(binnenGebied(metGat, 5, 5), false);
  assert.equal(binnenGebied(metGat, Number.NaN, 5), false);
  assert.equal(binnenGebied({ type: 'Point', coordinates: [5, 5] }, 5, 5), false);
});

test('an area without a pin gets one in the middle of its box', () => {
  assert.deepEqual(omvang(metGat), [0, 0, 10, 10]);
  assert.deepEqual(middenVan(metGat), [5, 5]);
  const [lat, lon] = middenVan(mapoon);
  assert.ok(lat < -11.17 && lat > -11.51 && lon > 142.19 && lon < 142.44);
  assert.equal(middenVan({ type: 'Point', coordinates: [1, 2] }), null);
});

test('the colours follow the Australian Warning System', () => {
  assert.match(vlakKleur(3).rand, /^#D6/);
  assert.match(vlakKleur(2).rand, /^#F0/);
  assert.match(vlakKleur(1).rand, /^#C9/);
  assert.notEqual(vlakKleur(0).rand, vlakKleur(1).rand);
});

test('a very detailed outline is thinned out, and stays closed', () => {
  const ring = Array.from({ length: 2000 }, (_, i) => [140 + Math.cos(i / 318) , -30 + Math.sin(i / 318)]);
  ring.push(ring[0]);
  const [v] = kaartVlakken({ type: 'Polygon', coordinates: [ring] });
  assert.ok(v.coordinates.length <= 301);
  assert.deepEqual(v.coordinates.at(-1), { latitude: ring[0][1], longitude: ring[0][0] });
  assert.equal(kaartVlakken(mapoon)[0].coordinates.length, 5);
});

test('says which kind of area you are in', () => {
  assert.equal(binnenTekst(2), 'You are inside this Watch and Act area');
  assert.equal(binnenTekst(3), 'You are inside this Emergency Warning area');
});
