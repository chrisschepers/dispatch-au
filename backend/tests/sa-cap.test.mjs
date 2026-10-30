import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSA } from '../sa.mjs';
import { fetchSource, sources } from '../feeds.mjs';
import { IncidentStore } from '../store.mjs';
const now = '2026-10-19T18:00:00.000Z';
const param = (name, value) =>
  `<parameter><valueName>${name}</valueName><value>${value}</value></parameter>`;
const entry = ({
  id = 'F2610190161',
  sent = now,
  status = 'Actual',
  scope = 'Public',
  msg = 'Alert',
  level = 'Incident',
  expiry = '',
  area = '<circle>-35.48,138.74 0.0</circle>',
  type = 'Burn Off',
} = {}) =>
  `<entry><id>${id}-${sent}</id><updated>${sent}</updated><content type="text/xml"><alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>${id}-${sent}</identifier><sender>private@example.test</sender><sent>${sent}</sent><status>${status}</status><scope>${scope}</scope><msgType>${msg}</msgType><info><language>en-AU</language><event>Fire</event><effective>${sent}</effective>${expiry ? `<expires>${expiry}</expires>` : ''}<headline>Published warning title</headline><description>PRIVATE FREE TEXT</description><contact>private phone</contact>${level == null ? '' : param('WarningLevel', level)}${param('Status', 'Controlled')}${param('SubCategory', type)}${param('Category', 'Fire')}${param('ControlAuthority', 'SA Country Fire Service')}${param('Location', 'PUBLISHED SUBURB')}${param('CallToAction', 'Stay Informed')}<area><areaDesc>Published area</areaDesc>${area}</area></info></alert></content></entry>`;
const feed = (body = '', updated = now) =>
  `<feed xmlns="http://www.w3.org/2005/Atom"><title>CFS public incidents</title><updated>${updated}</updated>${body}</feed>`;

void test('current CFS CAP-AU incidents retain stable identities, explicit points, and no private CAP fields', () => {
  const first = entry({ sent: '2026-10-19T17:00:00Z' }),
    last = entry({ msg: 'Update' });
  const parsed = parseSA(feed(last + first), now);
  assert.equal(parsed.stale, false);
  assert.equal(parsed.incidents.length, 1);
  const row = parsed.incidents[0];
  assert.equal(row.id, 'sa:incident:F2610190161');
  assert.equal(row.updated, now);
  assert.equal(row.created, null);
  assert.equal(row.category, 'planned');
  assert.deepEqual(row.point, [-35.48, 138.74]);
  assert.equal(row.location, 'PUBLISHED SUBURB');
  assert(!JSON.stringify(parsed).includes('private'));
  assert(!JSON.stringify(parsed).includes('PRIVATE FREE TEXT'));
});
void test('CFS warnings preserve official level, action and polygon without an invented pin', () => {
  const parsed = parseSA(
    feed(
      entry({
        level: 'Emergency Warning',
        type: 'Grass Fire',
        area: '<polygon>-35,138 -35,139 -36,139 -35,138</polygon>',
      }),
    ),
    now,
  );
  assert.equal(parsed.incidents.length, 0);
  assert.equal(parsed.warnings.length, 1);
  const row = parsed.warnings[0];
  assert.equal(row.level, 'Emergency Warning');
  assert.equal(row.action, 'Stay Informed');
  assert.equal(row.point, null);
  assert.equal(row.geometry.type, 'Polygon');
  assert.deepEqual(row.geometry.coordinates[0][0], [138, -35]);
  assert.equal(
    parseSA(feed(entry({ area: '<circle>-35,138 5.0</circle>' })), now)
      .incidents[0].point,
    null,
  );
});
void test('CFS test, private, expired and cancelled alerts cannot become current incidents', () => {
  for (const opts of [
    { status: 'Test' },
    { status: 'Exercise' },
    { scope: 'Private' },
    { expiry: '2026-10-19T17:00:00Z' },
    { msg: 'Cancel' },
  ])
    assert.equal(parseSA(feed(entry(opts)), now).incidents.length, 0);
  assert.equal(
    parseSA(
      feed(entry({ sent: '2026-10-19T17:00:00Z' }) + entry({ msg: 'Cancel' })),
      now,
    ).incidents.length,
    0,
  );
  assert.equal(
    parseSA(
      feed(entry({ msg: 'Cancel' }) + entry({ sent: '2026-10-19T17:00:00Z' })),
      now,
    ).incidents.length,
    0,
  );
  assert.deepEqual(parseSA(feed(), now).incidents, []);
});
void test('bad or stale CAP snapshots preserve the last successful records', () => {
  const store = new IncidentStore();
  const parsed = parseSA(feed(entry()), now);
  store.ingest('sa', parsed);
  assert.throws(() => parseSA('<html>SA ESS - File Unavailable</html>', now));
  assert.throws(() =>
    parseSA(feed('<entry><content><alert/></content></entry>'), now),
  );
  assert.throws(() =>
    parseSA('<!DOCTYPE feed [<!ENTITY x "bad">]>' + feed(), now),
  );
  const old = parseSA(feed('', '2026-10-19T15:00:00Z'), now);
  assert.equal(old.stale, true);
  assert.equal(store.ingest('sa', old), false);
  assert.equal(store.feed('sa', 24, Date.parse(now)).incidents.length, 1);
  store.close();
});
void test('source collector accepts current CAP and ignores a mismatching VIC advisory count while retaining transport checks', async () => {
  assert.equal(
    sources.sa.url,
    'https://data.eso.sa.gov.au/feeds/prod/cap-au.xml',
  );
  const response = (body) =>
    new Response(body, { headers: { Date: new Date(now).toUTCString() } });
  const sa = await fetchSource(
    'sa',
    async () => response(feed(entry())),
    new Date(now),
  );
  assert.equal(sa.stale, false);
  assert.equal(sa.incidents.length, 1);
  const raw = JSON.stringify({
    type: 'FeatureCollection',
    properties: { featureCount: 35, lastUpdated: now },
    features: [
      {
        type: 'Feature',
        properties: {
          id: 'ESTA:123',
          sourceOrg: 'VIC/CFA',
          feedType: 'incident',
          category1: 'Fire',
        },
      },
    ],
  });
  const vic = await fetchSource(
    'vic',
    async () => response(raw),
    new Date(now),
  );
  assert.equal(vic.stale, false);
  assert.equal(vic.incidents.length, 1);
  const stale = await fetchSource(
    'vic',
    async () =>
      new Response(raw, { headers: { Date: 'Mon, 19 Oct 2026 15:00:00 GMT' } }),
    new Date(now),
  );
  assert.equal(stale.stale, true);
  await assert.rejects(() =>
    fetchSource('vic', async () => response(raw.slice(0, -8)), new Date(now)),
  );
});

void test('a CFS incident without WarningLevel is an incident, not a reason to drop all of SA (30-10)', () => {
  const zonder = entry({ id: 'F2610300001', level: null, type: 'Grass Fire' });
  const met = entry({ id: 'F2610300002', type: 'Structure Fire' });
  const parsed = parseSA(feed(zonder + met), now);
  assert.equal(parsed.incidents.length, 2);
  assert.ok(parsed.incidents.every((i) => i.kind !== 'warning'));
});


void test('SA: an unsupported CAP message is skipped instead of failing the feed (30-10)', () => {
  const goed = entry({ id: 'F2610300003' });
  const vreemd = entry({ id: 'F2610300004', msg: 'Ack' });
  const parsed = parseSA(feed(goed + vreemd), now);
  assert.equal(parsed.incidents.length, 1);
  assert.deepEqual(parsed.skipped, { count: 1, reasons: { 'Unsupported SA CAP message': 1 } });
  assert.throws(() => parseSA(feed(vreemd), now), /Every SA CAP record rejected/);
});
