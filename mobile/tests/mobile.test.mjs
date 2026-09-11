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
    {
      theme: 'dark',
      saved: [p],
      active: p,
      includePlanned: true,
      region: 'au',
      historyHours: 24,
    },
  );
  assert.deepEqual(
    parsePreferences(
      JSON.stringify({
        theme: 'invalid',
        saved: [{ ...p, lat: 999 }, p, { ...p, id: 'second' }],
        active: { ...p, radius: -1 },
      }),
    ),
    {
      theme: 'system',
      saved: [p],
      active: null,
      includePlanned: false,
      region: 'au',
      historyHours: 24,
    },
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

void test('regional feed validates input and keeps history separate from operational filtering', async () => {
  const { parseFeed, filterIncidents, incidentTime, isStale } =
    await import('../src/feed-model.ts');
  const t = '2026-09-11T15:00:00.000Z';
  const row = {
    id: 'act:incident:1',
    sourceId: '1',
    sourceFeed: 'act-esa',
    title: 'Ambulance response',
    location: 'Canberra',
    status: 'On Scene',
    agency: 'ACT Ambulance',
    category: 'ambulance',
    kind: 'incident',
    created: '2026-09-11T14:00:00.000Z',
    updated: t,
    firstSeen: t,
    lastSeen: t,
    listed: false,
    point: [-35.3, 149.1],
    geometry: null,
  };
  const raw = {
    region: 'act',
    incidents: [row],
    warnings: [],
    fetchedAt: t,
    historyStartedAt: t,
    historyHours: 24,
    stale: false,
    attribution: 'ACT ESA',
    licenseUrl: 'https://esa.act.gov.au/',
    coverageNote: null,
  };
  const feed = parseFeed(raw, 'act');
  assert.throws(() => parseFeed(raw, 'vic'));
  assert.throws(() =>
    parseFeed({ ...raw, incidents: [{ ...row, id: 'vic:incident:1' }] }, 'act'),
  );
  assert.throws(() => parseFeed({ ...raw, attribution: {} }, 'act'));
  assert.equal(incidentTime(feed.incidents[0]), row.created);
  const filters = {
    query: '',
    category: 'ambulance',
    includePlanned: false,
    respondingOnly: false,
    centre: null,
    radius: 25,
  };
  assert.equal(filterIncidents(feed.incidents, filters).length, 1);
  assert.equal(
    filterIncidents(feed.incidents, { ...filters, respondingOnly: true })
      .length,
    0,
  );
  assert.equal(isStale(feed, Date.parse(t) + 360000), true);
  assert.equal(isStale(feed, Date.parse(t)), false);
  assert.equal(
    parsePreferences(JSON.stringify({ region: 'act', historyHours: 168 }))
      .historyHours,
    168,
  );
});

void test('Australia view accepts supported regions, retains source links and rejects unsupported rows', async () => {
  const { parseFeed, regions } = await import('../src/feed-model.ts');
  assert.equal(parsePreferences(null).region, 'au');
  assert.equal(
    parsePreferences(JSON.stringify({ region: 'qld', historyHours: 72 }))
      .region,
    'qld',
  );
  assert.equal(
    parsePreferences(JSON.stringify({ region: 'vic', active: p })).region,
    'vic',
  );
  assert.equal(regions.qld.timeZone, 'Australia/Brisbane');
  const t = '2026-09-11T16:00:00.000Z';
  const row = {
    id: 'nsw:incident:1',
    sourceId: '1',
    sourceFeed: 'nsw',
    title: 'Fire',
    location: 'Test',
    status: 'Advice',
    agency: 'NSW RFS',
    category: 'fire',
    kind: 'incident',
    firstSeen: t,
    lastSeen: t,
    listed: true,
    point: null,
  };
  const raw = {
    region: 'au',
    incidents: [row],
    warnings: [],
    fetchedAt: t,
    historyStartedAt: t,
    historyHours: 24,
    stale: false,
    attribution: 'Sources',
    licenseUrl: 'https://example.test',
    coverageNote: null,
  };
  assert.equal(
    parseFeed(raw, 'au').incidents[0].officialUrl,
    regions.nsw.adviceUrl,
  );
  assert.throws(() =>
    parseFeed({ ...raw, incidents: [{ ...row, id: 'wa:incident:1' }] }, 'au'),
  );
});

void test('unknown call times use the source update before collector startup time for ordering', async () => {
  const { incidentTime, filterIncidents } =
    await import('../src/feed-model.ts');
  const old = {
    id: 'qld:incident:old',
    title: 'Fire',
    location: 'Test',
    agency: 'QFD',
    category: 'fire',
    listed: true,
    status: 'Patrolled',
    created: null,
    updated: '2026-08-01T00:00:00.000Z',
    firstSeen: '2026-09-11T16:00:00.000Z',
  };
  const recent = {
    ...old,
    id: 'vic:incident:new',
    created: '2026-09-11T15:00:00.000Z',
    updated: null,
  };
  assert.equal(incidentTime(old), old.updated);
  assert.equal(
    filterIncidents([old, recent], {
      query: '',
      category: 'all',
      includePlanned: false,
      respondingOnly: false,
      centre: null,
      radius: 25,
    })[0].id,
    recent.id,
  );
});
