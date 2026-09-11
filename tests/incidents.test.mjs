import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeFeed,
  dateISO,
  categoryFor,
  distanceKm,
  filterIncidents,
  feedIsStale,
  safeGeometry,
  pointOf,
} from '../lib/incidents.ts';
const now = new Date('2026-09-11T10:00:00Z');
const feature = (
  p = {},
  geometry = { type: 'Point', coordinates: [145, -37.8] },
) => ({
  type: 'Feature',
  geometry,
  properties: {
    id: 'ESTA:1',
    sourceOrg: 'VIC/CFA',
    feedType: 'incident',
    category1: 'Fire',
    category2: 'Building Fire',
    status: 'Responding',
    location: 'Example suburb',
    created: '2026-09-11T19:50:00+10:00',
    updated: '2026-09-11T19:55:00+10:00',
    resources: 2,
    ...p,
  },
});
const collection = (features) => ({
  type: 'FeatureCollection',
  features,
  properties: { lastUpdated: now.toISOString(), featureCount: features.length },
});
void test('Melbourne timestamps retain the instant across daylight-saving offsets', () => {
  assert.equal(
    dateISO('2026-09-11T19:55:00+10:00'),
    '2026-09-11T09:55:00.000Z',
  );
  assert.equal(
    dateISO('2026-12-11T19:55:00+11:00'),
    '2026-12-11T08:55:00.000Z',
  );
  assert.equal(dateISO('2026-09-11T19:55:00'), null);
  assert.equal(dateISO('not a date'), null);
});
void test('whitelists public fields, normalises numbers and never emits CAP contacts or HTML', () => {
  const feed = normalizeFeed(
    collection([
      feature({
        id: 123,
        cap: { sender: 'private@example.test' },
        webBody: '<script>bad()</script>',
      }),
    ]),
    now,
  );
  assert.equal(feed.incidents[0].sourceId, '123');
  assert.equal(feed.incidents[0].resources, 2);
  assert.deepEqual(feed.incidents[0].point, [-37.8, 145]);
  assert.ok(!JSON.stringify(feed).includes('private@example'));
  assert.ok(!JSON.stringify(feed).includes('script'));
  assert.equal(feed.stale, false);
});
void test('rejects malformed and incomplete snapshots rather than replacing valid data', () => {
  assert.throws(() => normalizeFeed({ features: [] }));
  assert.throws(() =>
    normalizeFeed({
      ...collection([feature()]),
      properties: { featureCount: 2 },
    }),
  );
});
void test('keeps latest duplicate and separates warning/incident IDs and interstate sources', () => {
  const f = normalizeFeed(
    collection([
      feature(),
      feature({ updated: '2026-09-11T10:00:00Z', resources: 4 }),
      feature({
        feedType: 'warning',
        sourceOrg: 'EMV',
        category1: 'Advice',
        action: 'Stay Informed',
      }),
      feature({ sourceOrg: 'NSW/RFS', id: 'NSW:1' }),
    ]),
    now,
  );
  assert.equal(f.incidents.length, 1);
  assert.equal(f.incidents[0].resources, 4);
  assert.equal(f.warnings.length, 1);
  assert.notEqual(f.incidents[0].id, f.warnings[0].id);
  assert.equal(f.warnings[0].action, 'Stay Informed');
});
void test('polygon warnings remain areas, and never invent a point location', () => {
  const polygon = {
    type: 'Polygon',
    coordinates: [
      [
        [145, -38],
        [146, -38],
        [146, -37],
        [145, -38],
      ],
    ],
  };
  assert.deepEqual(safeGeometry(polygon), polygon);
  assert.equal(pointOf(polygon), null);
  const g = {
    type: 'GeometryCollection',
    geometries: [polygon, { type: 'Point', coordinates: [145, -38] }],
  };
  assert.deepEqual(pointOf(safeGeometry(g)), [-38, 145]);
  assert.equal(
    safeGeometry({ type: 'Point', coordinates: [Infinity, 0] }),
    null,
  );
});
void test('missing fields are unknown, not zero or a fabricated emergency', () => {
  const f = normalizeFeed(
    collection([
      feature({ resources: undefined, updated: 'broken', category2: 'Other' }),
    ]),
    now,
  ).incidents[0];
  assert.equal(f.resources, null);
  assert.equal(f.updated, null);
  assert.equal(f.title, 'Fire incident');
});
void test('map distance in kilometres and filters agree', () => {
  const feed = normalizeFeed(
    collection([
      feature(),
      feature({
        id: '2',
        category1: 'Planned Burn',
        category2: 'Planned Burn',
      }),
      feature(
        { id: '3', category1: 'Rescue', category2: 'Road Accident' },
        { type: 'Point', coordinates: [142, -34] },
      ),
    ]),
    now,
  );
  assert.ok(distanceKm([-37.8136, 144.9631], [-38.1499, 144.3617]) > 60);
  assert.equal(distanceKm([0, 0], [0, 0]), 0);
  const filters = {
    query: 'example',
    category: 'all',
    includePlanned: false,
    respondingOnly: false,
    centre: [-37.81, 144.96],
    radius: 10,
  };
  assert.equal(filterIncidents(feed.incidents, filters).length, 1);
  assert.equal(
    filterIncidents(feed.incidents, { ...filters, includePlanned: true })
      .length,
    2,
  );
  assert.equal(
    filterIncidents(feed.incidents, { ...filters, query: 'absent' }).length,
    0,
  );
});
void test('stale source and stalled browser both remove live status', () => {
  const feed = normalizeFeed(collection([]), now);
  assert.equal(feedIsStale(feed, now.getTime() + 360000), true);
  assert.equal(
    normalizeFeed(
      {
        ...collection([]),
        properties: { lastUpdated: '2026-09-10T10:00:00Z' },
      },
      now,
    ).stale,
    true,
  );
  assert.equal(
    normalizeFeed({ ...collection([]), properties: {} }, now).stale,
    true,
  );
});
void test('classification preserves planned burns, hazmat and unknown types', () => {
  assert.equal(categoryFor('Planned Burn', 'Planned Burn'), 'planned');
  assert.equal(categoryFor('Hazardous Material', 'Chemical spill'), 'hazmat');
  assert.equal(categoryFor('Something New', ''), 'other');
  assert.equal(categoryFor('Tree Down', 'Tree Down'), 'storm');
});
