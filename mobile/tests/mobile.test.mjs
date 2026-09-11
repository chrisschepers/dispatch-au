import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePreferences, validPlace, defaults } from '../src/preferences.ts';
import { polygons } from '../src/geometry.ts';
const p = {
  id: 'melbourne',
  name: 'Melbourne',
  lat: -37.81,
  lng: 144.96,
  radius: 25,
};
test('device preferences preserve the selected radius and reject corrupt storage', () => {
  assert.deepEqual(parsePreferences('{'), defaults);
  assert.deepEqual(parsePreferences('null'), defaults);
  assert.deepEqual(
    parsePreferences(
      JSON.stringify({
        theme: 'dark',
        saved: [p],
        active: p,
        includePlanned: true,
      }),
    ),
    { theme: 'dark', saved: [p], active: p, includePlanned: true },
  );
  assert.deepEqual(
    parsePreferences(
      JSON.stringify({
        theme: 'invalid',
        saved: [{ ...p, lat: 999 }, p, { ...p, id: 'second' }],
        active: { ...p, radius: -1 },
      }),
    ),
    { theme: 'system', saved: [p], active: null, includePlanned: false },
  );
});
test('stored coordinates and radius must be valid numbers', () => {
  assert.ok(validPlace(p));
  for (const patch of [
    { lat: '-37' },
    { lng: Infinity },
    { name: '' },
    { radius: NaN },
    { radius: 201 },
    { radius: 1.5 },
  ])
    assert.equal(validPlace({ ...p, ...patch }), false);
});
test('native warning areas retain holes and do not invent pin locations', () => {
  const outer = [
    [140, -37],
    [141, -37],
    [141, -38],
    [140, -37],
  ];
  const hole = [
    [140.1, -37.1],
    [140.2, -37.1],
    [140.2, -37.2],
    [140.1, -37.1],
  ];
  const areas = polygons({
    type: 'GeometryCollection',
    geometries: [
      { type: 'Point', coordinates: [140, -37] },
      { type: 'Polygon', coordinates: [outer, hole] },
    ],
  });
  assert.equal(areas.length, 1);
  assert.deepEqual(areas[0].coordinates[0], { latitude: -37, longitude: 140 });
  assert.equal(areas[0].holes.length, 1);
  assert.deepEqual(polygons(null), []);
  assert.deepEqual(polygons({ type: 'Point', coordinates: [140, -37] }), []);
});
