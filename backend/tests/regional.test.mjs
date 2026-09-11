import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IncidentStore } from '../store.mjs';
import { parseNSW, parseQLD, normalizeVICIdentity } from '../regional.mjs';
const now = '2026-09-11T16:00:00.000Z';
const collection = (features) => ({ type: 'FeatureCollection', features });
const row = (agency, created) => ({
  id: `vic:incident:${agency}:ESTA:123`,
  sourceId: 'ESTA:123',
  kind: 'incident',
  agency,
  title: 'Fire',
  location: 'Test',
  created,
  updated: created,
  status: 'Responding',
  category: 'fire',
  point: null,
  geometry: null,
});
void test('VIC agency handoffs share one CAD identity; existing duplicates merge without losing history', () => {
  const s = new IncidentStore();
  const a = row('VIC/ESTA', '2026-09-11T15:00:00.000Z'),
    b = { ...row('VIC/CFA', '2026-09-11T15:02:00.000Z'), status: 'Safe' };
  // Seed the exact legacy schema that caused the screenshot duplicates.
  for (const [r, t, listed] of [
    [a, '2026-09-11T15:01:00.000Z', 0],
    [b, '2026-09-11T15:03:00.000Z', 1],
  ])
    s.db
      .prepare('INSERT INTO incidents VALUES(?,?,?,?,?,?)')
      .run(r.id, 'vic', JSON.stringify(r), t, t, listed);
  s.db
    .prepare(
      'INSERT INTO sources(region,started_at,fetched_at,stale) VALUES(?,?,?,0)',
    )
    .run('vic', now, now);
  s.mergeVICIdentities();
  s.mergeVICIdentities();
  let f = s.feed('vic', 24, Date.parse(now));
  assert.equal(f.incidents.length, 1);
  assert.equal(f.incidents[0].status, 'Safe');
  assert.equal(f.incidents[0].created, a.created);
  assert.equal(f.incidents[0].listed, true);
  s.ingest('vic', {
    incidents: [b],
    warnings: [],
    fetchedAt: now,
    stale: false,
  });
  f = s.feed('vic', 24, Date.parse(now));
  assert.equal(f.incidents.length, 1);
  assert.equal(f.incidents[0].created, a.created);
  assert.equal(normalizeVICIdentity({ incidents: [a, b] }).incidents.length, 1);
  assert.equal(
    normalizeVICIdentity({
      incidents: [a, { ...b, sourceId: 'ESTA:456', id: 'different' }],
    }).incidents.length,
    2,
  );
  s.close();
});
void test('NSW uses stable incident IDs, retains alert level and separates planned activity', () => {
  const make = (id, type, category) => ({
    properties: {
      guid: `https://incidents.rfs.nsw.gov.au/api/v1/incidents/${id}`,
      title: 'Test',
      category,
      description: `TYPE: ${type}<br />LOCATION: Test suburb<br />STATUS: Under control<br />UPDATED: 11 Sep 2026 15:00`,
    },
    geometry: { type: 'Point', coordinates: [151, -33] },
  });
  const f = parseNSW(
    collection([
      make(1, 'Bush Fire', 'Advice'),
      make(2, 'Hazard Reduction', 'Planned Burn'),
    ]),
    now,
  );
  assert.equal(f.incidents.length, 2);
  assert.equal(f.incidents[0].id, 'nsw:incident:1');
  assert.equal(f.incidents[0].level, 'Advice');
  assert.equal(f.incidents[0].created, null);
  assert.equal(f.incidents[0].updated, '2026-09-11T05:00:00.000Z');
  assert.equal(f.incidents[1].category, 'planned');
  assert.throws(() => parseNSW(collection([{ properties: {} }])));
});
void test('Queensland warnings retain polygons without invented pins and expired warnings are removed', () => {
  const make = (id, expiry) => ({
    properties: {
      UniqueID: id,
      GroupedType: 'FIRE VEGETATION',
      WarningTitle: 'Stay informed',
      WarningArea: 'Test',
      WarningLevel: 'Advice',
      CallToAction: 'Stay Informed',
      CurrentStatus: 'Going',
      Locality: 'Test',
      PublishDateLocal_ISO: now,
      ItemDateTimeLocal_ISO: '2026-09-11T12:00:00+10:00',
      ItemExpiryDateTimeLocal_ISO: expiry,
    },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [150, -25],
          [151, -25],
          [151, -26],
          [150, -25],
        ],
      ],
    },
  });
  const f = parseQLD(
    collection([
      make('WARN-1', '2026-09-12T16:00:00Z'),
      make('WARN-2', '2026-09-10T16:00:00Z'),
      make('QF1-1', null),
    ]),
    now,
  );
  assert.equal(f.warnings.length, 1);
  assert.equal(f.warnings[0].point, null);
  assert.equal(f.warnings[0].geometry.type, 'Polygon');
  assert.equal(f.incidents.length, 1);
  assert.equal(f.incidents[0].created, null);
  assert.equal(f.stale, false);
});
void test('Australia view reports missing sources and never mixes shared numeric IDs', () => {
  const s = new IncidentStore();
  for (const region of ['vic', 'nsw'])
    s.ingest(region, {
      fetchedAt: now,
      stale: false,
      incidents: [
        { ...row('VIC/CFA', now), id: `${region}:incident:1`, sourceId: '1' },
      ],
      warnings: [],
    });
  const f = s.feed('au', 24, Date.parse(now));
  assert.equal(f.incidents.length, 2);
  assert.equal(f.stale, true);
  assert.equal(f.sources.filter((x) => !x.ready).length, 3);
  assert.equal(f.region, 'au');
  s.close();
});
void test('SA decodes HTML separators, uses Adelaide time and never invents coordinates', async () => {
  const { parseSA } = await import('../sa.mjs');
  const f = parseSA(
    `<rss><channel><title>CFS</title><item><identifier>123</identifier><title>TEST ROAD, TEST SUBURB (Tree Fire)</title><description>First Reported: Saturday, 12 Sep 2026 00:58:00&lt;br&gt;Status: GOING&lt;br&gt;Region: MFS</description><pubDate>Sat, 12 Sep 2026 00:59:18 +0930</pubDate></item></channel></rss>`,
    now,
  );
  const r = f.incidents[0];
  assert.equal(r.created, '2026-09-11T15:28:00.000Z');
  assert.equal(r.updated, '2026-09-11T15:29:18.000Z');
  assert.equal(r.point, null);
  assert.equal(r.geometry, null);
  assert.equal(r.agency, 'SA MFS via CFS');
  assert.throws(() => parseSA('<html>offline</html>'));
});
void test('NSW elevated levels are visible without labelling a fire extent as a warning zone', () => {
  const f = parseNSW(
    collection([
      {
        properties: {
          guid: 'https://incidents.rfs.nsw.gov.au/api/v1/incidents/42',
          category: 'Emergency Warning',
          description:
            'TYPE: Bush Fire<br />LOCATION: Test<br />STATUS: Out of control',
        },
        geometry: { type: 'Point', coordinates: [151, -33] },
      },
    ]),
    now,
  );
  assert.equal(f.incidents.length, 1);
  assert.equal(f.warnings.length, 1);
  assert.equal(f.warnings[0].level, 'Emergency Warning');
  assert.equal(f.warnings[0].geometry, null);
});
