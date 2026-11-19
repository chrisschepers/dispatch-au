import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IncidentStore } from '../store.mjs';
import { fetchSource } from '../feeds.mjs';
import { createServer } from '../server.mjs';
import {
  sources,
  optionalSources,
  activeSources,
  enabledOptional,
  extraRegions,
} from '../source-config.mjs';
import {
  parseLiveTraffic,
  parseQLDTraffic,
  parseVICRoads,
  parseQLDWarnings,
  parseWAIncidents,
  parseWAWarnings,
} from '../extra-sources.mjs';
import { serviceOf } from '../push.mjs';
import { parseFeed } from '../../mobile/src/feed-model.ts';

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const json = (name) => JSON.parse(fixture(name));
// The moment the real fixtures were fetched.
const now = '2026-11-19T09:50:00.000Z';
const ALL_ON = {
  LIVETRAFFIC_API_KEY: 'k1',
  QLD_WARNINGS: 'on',
  QLDTRAFFIC_API_KEY: 'k2',
  VIC_ROADS_API_KEY: 'k3',
  WA_ENABLED: 'on',
  WA_WARNINGS: 'on',
};
const CATEGORIES = [
  'fire',
  'planned',
  'rescue',
  'storm',
  'hazmat',
  'ambulance',
  'other',
];
const wellFormed = (rows, region) => {
  for (const r of rows) {
    assert.ok(r.id.startsWith(region + ':'), r.id);
    assert.ok(CATEGORIES.includes(r.category), r.category);
    for (const key of ['title', 'location', 'status', 'agency', 'sourceId'])
      assert.ok(typeof r[key] === 'string' && r[key] && r[key].length <= 500);
    assert.ok(optionalSources[r.sourceFeed], r.sourceFeed);
  }
};

void test('every optional source is off without its switch and is then never fetched', () => {
  assert.deepEqual(enabledOptional({}), []);
  assert.deepEqual(activeSources({}), Object.keys(sources));
  assert.deepEqual(extraRegions({}), []);
  // Warnings for WA need WA itself; "off" and an empty key stay off.
  assert.deepEqual(
    enabledOptional({ WA_WARNINGS: 'on', WA_ENABLED: 'off', QLD_WARNINGS: '' }),
    [],
  );
  assert.deepEqual(enabledOptional({ LIVETRAFFIC_API_KEY: 'k' }), [
    'nsw-traffic',
  ]);
  assert.deepEqual(enabledOptional(ALL_ON), Object.keys(optionalSources));
  assert.deepEqual(extraRegions(ALL_ON), ['wa']);
  for (const config of Object.values(optionalSources)) {
    assert.ok(config.attribution && config.licenseUrl && config.switch);
    assert.ok(config.attribution.length < 200);
  }
});

void test('Live Traffic NSW keeps only open crashes, as rescue with a pin', () => {
  const raw = json('livetraffic-incident-2026-11-19.json');
  const f = parseLiveTraffic(raw, now);
  // 2 crashes (1 ended), a breakdown, emergency roadwork and a 4WD notice.
  assert.equal(raw.features.length, 5);
  assert.equal(f.incidents.length, 1);
  assert.equal(f.warnings.length, 0);
  assert.equal(f.skipped, null);
  assert.equal(f.stale, false);
  const r = f.incidents[0];
  wellFormed(f.incidents, 'nsw');
  assert.equal(r.id, 'nsw:incident:livetraffic-294952');
  assert.equal(r.title, 'Crash: truck, car');
  assert.equal(r.location, 'Masters Road at Springhill Road, Spring Hill');
  assert.equal(r.status, 'Attending: Emergency services');
  assert.equal(r.category, 'rescue');
  assert.equal(serviceOf(r), 'Rescue');
  assert.equal(r.created, '2026-11-19T09:39:42.000Z');
  assert.deepEqual(r.point, [-34.445942, 150.8757912]);
  assert.deepEqual(r.geometry, {
    type: 'Point',
    coordinates: [150.8757912, -34.445942],
  });
  assert.equal(r.level, null);
  // A snapshot published long ago is not live.
  assert.equal(parseLiveTraffic(raw, '2026-11-19T11:00:00.000Z').stale, true);
});

void test('Live Traffic skips a crash without a place and fails only when all are bad', () => {
  const raw = json('livetraffic-incident-2026-11-19.json');
  const crash = raw.features[0];
  const bad = { ...crash, id: 1, geometry: null };
  const f = parseLiveTraffic({ ...raw, features: [crash, bad] }, now);
  assert.equal(f.incidents.length, 1);
  assert.deepEqual(f.skipped, {
    count: 1,
    reasons: { 'Missing Live Traffic location': 1 },
  });
  assert.throws(
    () => parseLiveTraffic({ ...raw, features: [bad] }, now),
    /Every Live Traffic record rejected/,
  );
  // No crashes at all is a quiet road, not a failure.
  assert.equal(
    parseLiveTraffic({ ...raw, features: [] }, now).incidents.length,
    0,
  );
  assert.throws(() => parseLiveTraffic({ ErrorDetails: {} }, now));
});

void test('QLDTraffic keeps only its own open crashes (fixture after the API specification)', () => {
  const f = parseQLDTraffic(
    json('qldtraffic-events-spec-example.json'),
    '2026-11-19T09:25:00.000Z',
  );
  // Reopened, relayed from Transport for NSW and roadworks are left out;
  // the crash without any geometry is skipped and counted.
  assert.equal(f.incidents.length, 1);
  assert.deepEqual(f.skipped, {
    count: 1,
    reasons: { 'Missing QLDTraffic location': 1 },
  });
  const r = f.incidents[0];
  wellFormed(f.incidents, 'qld');
  assert.equal(r.id, 'qld:incident:qldtraffic-4101');
  assert.equal(r.title, 'Crash: multi-vehicle');
  assert.equal(r.location, 'Gympie Arterial Road, Fitzgibbon');
  assert.equal(r.status, 'Right lane blocked');
  assert.equal(r.category, 'rescue');
  assert.equal(r.created, '2026-11-19T09:05:00.000Z');
  assert.deepEqual(r.point, [-27.3399828, 153.0258962]);
  assert.equal(r.geometry.type, 'GeometryCollection');
  assert.equal(f.stale, false);
});

void test('Victorian road disruptions keep one active crash per event (fixture after the OpenAPI description)', () => {
  const f = parseVICRoads(json('vic-unplanned-road-openapi-example.json'), now);
  assert.equal(f.incidents.length, 1);
  const r = f.incidents[0];
  wellFormed(f.incidents, 'vic');
  assert.equal(r.id, 'vic:incident:vicroads-RID-900001');
  assert.equal(r.title, 'Crash');
  assert.equal(r.location, 'Swanston Street, Melbourne');
  assert.equal(r.status, 'Lane closed');
  assert.equal(r.category, 'rescue');
  assert.deepEqual(r.point, [-37.8136, 144.9631]);
  assert.throws(() => parseVICRoads({ message: 'Unauthorized' }, now));
});

void test('Queensland storm and flood warnings carry their level and area', () => {
  const xml = fixture('qld-stormwarnings-capau-2026-02-23.xml');
  // Both real alerts expired in February: nothing is shown today.
  const today = parseQLDWarnings(xml, now);
  assert.equal(today.warnings.length, 0);
  assert.equal(today.skipped, null);
  assert.equal(today.stale, false);
  // While they were in force.
  const f = parseQLDWarnings(xml, '2026-02-19T12:00:00.000Z');
  assert.equal(f.incidents.length, 0);
  assert.equal(f.warnings.length, 2);
  const later = parseQLDWarnings(xml, '2026-02-21T08:00:00.000Z');
  assert.equal(later.warnings.length, 1);
  const r = later.warnings[0];
  wellFormed(f.warnings, 'qld');
  assert.equal(r.id, 'qld:warning:sfc-TR_210226_1700');
  assert.equal(r.kind, 'warning');
  assert.equal(r.level, 'Watch and Act');
  assert.equal(r.status, 'Watch and Act');
  assert.equal(r.action, 'MONITOR CONDITIONS');
  assert.equal(r.category, 'storm');
  assert.equal(serviceOf(r), 'Storm');
  assert.equal(r.location, 'Burdekin LGA');
  assert.equal(r.agency, 'Queensland Police Service');
  assert.match(r.title, /^WATCH AND ACT - MONITOR CONDITIONS - Burdekin LGA/);
  assert.equal(r.updated, '2026-02-21T07:00:00.000Z');
  // The area as GeoJSON ([lon, lat], closed ring); no pin, only its middle.
  assert.equal(r.geometry.type, 'Polygon');
  const ring = r.geometry.coordinates[0];
  assert.deepEqual(ring[0], ring.at(-1));
  assert.deepEqual(ring[0], [146.922053124996, -19.7849057931279]);
  assert.equal(r.point, null);
  assert.deepEqual(r.areaPoint, [-19.737921077297901, 147.2545264122902]);
  // One had expired by then; the other is the Advice for Croydon.
  const advice = f.warnings.find((w) => w.level === 'Advice');
  assert.equal(advice.id, 'qld:warning:sfc-RJ_050226_0800');
  assert.equal(advice.action, 'DO NOT ENTER FLOOD WATER');
});

void test('Queensland warnings: a bad alert is skipped, an error page fails', () => {
  const xml = fixture('qld-stormwarnings-capau-2026-02-23.xml');
  const broken = xml.replace(
    '<cap:value>Watch and Act</cap:value>',
    '<cap:value>Unknown</cap:value>',
  );
  const f = parseQLDWarnings(broken, '2026-02-19T12:00:00.000Z');
  assert.equal(f.warnings.length, 1);
  assert.equal(f.skipped.count, 1);
  assert.throws(() => parseQLDWarnings('<html>offline</html>', now));
  assert.throws(() => parseQLDWarnings('{"error":true}', now));
});

void test('Emergency WA incidents: categories, places and burn offs as planned', () => {
  const f = parseWAIncidents(
    json('emergencywa-incidents-2026-11-19.json'),
    now,
  );
  assert.equal(f.incidents.length, 7);
  assert.equal(f.skipped, null);
  wellFormed(f.incidents, 'wa');
  const by = (id) => f.incidents.find((r) => r.id === `wa:incident:${id}`);
  const burn = by('831530');
  assert.equal(burn.title, 'Burn Off');
  assert.equal(burn.category, 'planned');
  assert.equal(burn.location, 'Taylor Rd, North Jindong');
  assert.equal(burn.status, 'Active');
  assert.equal(burn.created, '2026-11-19T09:47:11.000Z');
  assert.deepEqual(burn.point, [-33.72044747, 115.21428837]);
  assert.equal(by('831512').category, 'fire');
  assert.equal(by('831512').status, 'On scene');
  assert.equal(by('831519').category, 'hazmat');
  assert.equal(by('831485').category, 'rescue');
  assert.equal(by('831523').category, 'fire');
  // A fire with a mapped fire ground keeps both the pin and the area.
  assert.equal(by('830565').geometry.type, 'GeometryCollection');
  assert.ok(by('830565').point);
  // The earthquake has no CAD number and no status.
  const quake = f.incidents.find((r) => r.title === 'Earthquake');
  assert.equal(quake.category, 'other');
  assert.equal(quake.status, 'Status not supplied');
  assert.throws(() => parseWAIncidents({ message: 'Forbidden' }, now));
});

void test('Emergency WA warnings keep the published words, level and area', () => {
  const f = parseWAWarnings(json('emergencywa-warnings-2026-11-19.json'), now);
  assert.equal(f.warnings.length, 2);
  wellFormed(f.warnings, 'wa');
  const [advice, smoke] = f.warnings;
  assert.equal(advice.id, 'wa:warning:6afabba287d7b7040d09506a');
  assert.equal(advice.title, 'Bushfire Advice');
  assert.equal(advice.level, 'Advice');
  assert.equal(advice.action, 'Avoid the area');
  assert.equal(advice.category, 'fire');
  assert.match(advice.location, /^WALPOLE NORNALUP NATIONAL PARK · Bow Bridge/);
  assert.match(advice.text, /^A Bushfire Advice is in place for people south/);
  assert.equal(advice.point, null);
  assert.ok(Array.isArray(advice.areaPoint));
  assert.ok(
    advice.geometry.geometries.some((g) => g.type === 'Polygon'),
    'the warning area is drawn on the map',
  );
  // A smoke alert is not one of the three warning levels.
  assert.equal(smoke.title, 'Smoke Alert');
  assert.equal(smoke.level, null);
  assert.equal(smoke.category, 'fire');
});

const respond = (body) => ({
  ok: true,
  status: 200,
  headers: new Headers({ date: new Date(now).toUTCString() }),
  body: new Response(body).body,
});

void test('a key travels in the request only; the right parser reads the answer', async () => {
  const calls = [];
  const fetcher = (body) => (url, options) => {
    calls.push({ url, headers: options.headers });
    return Promise.resolve(respond(body));
  };
  const nsw = await fetchSource(
    'nsw-traffic',
    fetcher(fixture('livetraffic-incident-2026-11-19.json')),
    new Date(now),
    { LIVETRAFFIC_API_KEY: 'secret-1' },
  );
  assert.equal(nsw.region, 'nsw-traffic');
  assert.equal(nsw.incidents.length, 1);
  assert.equal(calls[0].headers.Authorization, 'apikey secret-1');
  assert.ok(!calls[0].url.includes('secret-1'));
  const qld = await fetchSource(
    'qld-traffic',
    fetcher(fixture('qldtraffic-events-spec-example.json')),
    new Date('2026-11-19T09:25:00.000Z'),
    { QLDTRAFFIC_API_KEY: 'secret 2' },
  );
  assert.equal(qld.incidents.length, 1);
  assert.ok(calls[1].url.endsWith('?apikey=secret%202'));
  const warnings = await fetchSource(
    'qld-warnings',
    fetcher(fixture('qld-stormwarnings-capau-2026-02-23.xml')),
    new Date(now),
    {},
  );
  assert.equal(calls[2].headers.Accept, 'application/xml');
  assert.equal(warnings.warnings.length, 0);
  assert.equal(warnings.stale, false);
  // A refused key is a failed poll that names the status, not the key.
  await assert.rejects(
    fetchSource(
      'vic-traffic',
      () => Promise.resolve({ ok: false, status: 401, headers: new Headers() }),
      new Date(now),
      { VIC_ROADS_API_KEY: 'secret-3' },
    ),
    (error) =>
      error.message === 'Source HTTP 401' && !/secret/.test(error.message),
  );
  await assert.rejects(fetchSource('nt', fetcher('{}')), /Unknown source/);
});

const stateRow = (region, id, extra = {}) => ({
  id: `${region}:incident:${id}`,
  sourceId: String(id),
  sourceFeed: region,
  kind: 'incident',
  agency: 'Test agency',
  title: 'Fire',
  location: 'Test',
  created: '2026-11-19T09:30:00.000Z',
  updated: '2026-11-19T09:30:00.000Z',
  status: 'Responding',
  category: 'fire',
  point: null,
  geometry: null,
  resources: null,
  level: null,
  action: null,
  ...extra,
});
const snapshot = (incidents, warnings = []) => ({
  incidents,
  warnings,
  fetchedAt: now,
  stale: false,
});
function filled(env) {
  const s = new IncidentStore(':memory:', { env });
  for (const region of Object.keys(sources))
    s.ingest(region, snapshot([stateRow(region, 1)]));
  s.ingest(
    'nsw-traffic',
    parseLiveTraffic(json('livetraffic-incident-2026-11-19.json'), now),
  );
  s.ingest('qld-traffic', {
    ...parseQLDTraffic(
      json('qldtraffic-events-spec-example.json'),
      '2026-11-19T09:25:00.000Z',
    ),
    fetchedAt: now,
  });
  s.ingest(
    'vic-traffic',
    parseVICRoads(json('vic-unplanned-road-openapi-example.json'), now),
  );
  // Read as on the day the real warnings were in force.
  s.ingest('qld-warnings', {
    ...parseQLDWarnings(
      fixture('qld-stormwarnings-capau-2026-02-23.xml'),
      '2026-02-21T08:00:00.000Z',
    ),
    fetchedAt: now,
  });
  s.ingest(
    'wa',
    parseWAIncidents(json('emergencywa-incidents-2026-11-19.json'), now),
  );
  s.ingest(
    'wa-warnings',
    parseWAWarnings(json('emergencywa-warnings-2026-11-19.json'), now),
  );
  return s;
}
const at = Date.parse(now) + 60_000;

void test('with every switch off the feeds are exactly the five states', () => {
  const s = filled({});
  const nsw = s.feed('nsw', 24, at);
  assert.deepEqual(
    nsw.incidents.map((r) => r.id),
    ['nsw:incident:1'],
  );
  assert.equal(nsw.attribution, sources.nsw.attribution);
  assert.equal(nsw.coverageNote, sources.nsw.coverageNote);
  assert.equal(nsw.credits.length, 1);
  const au = s.feed('au', 24, at, { extra: ['wa'] });
  assert.equal(au.incidents.length, 5);
  assert.equal(au.warnings.length, 0);
  assert.equal(au.sources.length, 5);
  assert.equal(
    au.coverageNote,
    'Available coverage: Victoria, ACT, NSW, Queensland and South Australia. Sources differ; not every emergency call is published. NSW and Queensland sources update about every 30 minutes.',
  );
  assert.throws(() => s.feed('wa', 24, at), /Unknown region/);
  assert.throws(() => s.feed('nsw-traffic', 24, at), /Unknown region/);
  s.close();
});

void test('an optional source joins its state, with its own credit', () => {
  const s = filled(ALL_ON);
  const nsw = s.feed('nsw', 24, at);
  assert.deepEqual(nsw.incidents.map((r) => r.id).sort(), [
    'nsw:incident:1',
    'nsw:incident:livetraffic-294952',
  ]);
  assert.equal(
    nsw.attribution,
    sources.nsw.attribution + '\n' + optionalSources['nsw-traffic'].attribution,
  );
  assert.deepEqual(
    nsw.credits.map((c) => c.sourceFeed),
    ['nsw', 'nsw-traffic'],
  );
  assert.equal(
    nsw.credits[1].licenseUrl,
    'https://opendata.transport.nsw.gov.au/datalicence',
  );
  // The app allows one status per state: the state's own source.
  assert.deepEqual(
    nsw.sources.map((x) => x.region),
    ['nsw'],
  );
  const qld = s.feed('qld', 24, at);
  assert.equal(qld.warnings.length, 1);
  assert.equal(qld.warnings[0].geometry.type, 'Polygon');
  assert.ok(qld.coverageNote.length <= 1000);
  // Today's app accepts every state feed and the national one as they are.
  for (const region of Object.keys(sources))
    assert.doesNotThrow(() => parseFeed(s.feed(region, 24, at), region));
  const au = s.feed('au', 24, at);
  assert.doesNotThrow(() => parseFeed(au, 'au'));
  assert.ok(au.attribution.length <= 1000);
  assert.ok(!au.incidents.some((r) => r.id.startsWith('wa:')));
  assert.ok(!au.warnings.some((r) => r.id.startsWith('wa:')));
  assert.deepEqual(
    au.sources.map((x) => x.region),
    Object.keys(sources),
  );
  s.close();
});

void test('Western Australia only travels in the national feed when asked', () => {
  const s = filled(ALL_ON);
  const wa = s.feed('wa', 24, at);
  assert.equal(wa.region, 'wa');
  assert.equal(wa.incidents.length, 7);
  assert.equal(wa.warnings.length, 2);
  assert.equal(wa.source, 'Emergency WA');
  assert.match(wa.attribution, /^Supplied by EmergencyWA\. © Government of/);
  const plain = s.feed('au', 24, at);
  const asked = s.feed('au', 24, at, { extra: ['wa', 'nt'] });
  assert.equal(asked.incidents.length, plain.incidents.length + 7);
  assert.equal(asked.warnings.length, plain.warnings.length + 2);
  assert.equal(asked.sources.length, 6);
  assert.equal(asked.sources.at(-1).region, 'wa');
  assert.match(asked.coverageNote, /South Australia and Western Australia\./);
  assert.ok(asked.attribution.length <= 1000);
  assert.ok(asked.credits.some((c) => c.sourceFeed === 'wa-warnings'));
  // Why it must be asked for: the app up to 1.2.0 rejects the whole feed.
  // The app up to 1.2.0 rejected a feed with a state it did not know, which is
  // why WA only travels when asked. From the next version the app knows WA,
  // asks for it, and keeps the rows with their own credit.
  const inApp = parseFeed(asked, 'au');
  assert.equal(inApp.incidents.length, asked.incidents.length);
  assert.equal(
    inApp.incidents.find((r) => r.id.startsWith('wa:')).credit.name,
    'Emergency WA',
  );
  // A WA that is not there yet never delays the five states.
  const fresh = new IncidentStore(':memory:', { env: ALL_ON });
  for (const region of Object.keys(sources))
    fresh.ingest(region, snapshot([stateRow(region, 1)]));
  const waiting = fresh.feed('au', 24, at, { extra: ['wa'] });
  assert.equal(waiting.stale, false);
  assert.equal(waiting.incidents.length, 5);
  fresh.close();
  s.close();
});

void test('an optional source that stopped answering leaves the feed; the state stays fresh', () => {
  const s = filled(ALL_ON);
  s.fail('nsw-traffic', 'Source HTTP 503', now);
  const soon = s.feed('nsw', 24, at);
  assert.equal(soon.stale, false);
  assert.equal(soon.incidents.length, 2);
  assert.equal(s.health('nsw-traffic', at).state, 'delayed');
  // Past its staleAfter the road rows are gone, not shown as live.
  const nswLater = Date.parse(now) + 20 * 60_000;
  s.ingest('nsw', {
    ...snapshot([stateRow('nsw', 1)]),
    fetchedAt: new Date(nswLater).toISOString(),
  });
  const later = s.feed('nsw', 24, nswLater);
  assert.equal(later.stale, false);
  assert.deepEqual(
    later.incidents.map((r) => r.id),
    ['nsw:incident:1'],
  );
  assert.equal(later.attribution, sources.nsw.attribution);
  s.close();
});

void test('a crash the fire service already lists is not shown twice', () => {
  const s = new IncidentStore(':memory:', { env: ALL_ON });
  const crash = parseLiveTraffic(
    json('livetraffic-incident-2026-11-19.json'),
    now,
  );
  const [lat, lon] = crash.incidents[0].point;
  const rescue = (id, extra) =>
    stateRow('nsw', id, {
      title: 'MVA/Transport',
      category: 'rescue',
      created: null,
      point: [lat + 0.003, lon],
      ...extra,
    });
  // 330 m away, first seen 10 minutes after the crash was reported.
  s.ingest('nsw', snapshot([rescue(7)]));
  const nowMs = Date.parse(now);
  assert.equal(
    s.withoutDuplicates('nsw-traffic', crash, nowMs).incidents.length,
    0,
  );
  // Further than 500 m, a fire, another state or hours apart: both stay.
  for (const other of [
    rescue(8, { point: [lat + 0.006, lon] }),
    rescue(9, { category: 'fire' }),
    rescue(10, { created: '2026-11-19T08:00:00.000Z' }),
  ]) {
    const t = new IncidentStore(':memory:', { env: ALL_ON });
    t.ingest('nsw', snapshot([other]));
    t.ingest('vic', snapshot([{ ...rescue(7), id: 'vic:incident:7' }]));
    assert.equal(
      t.withoutDuplicates('nsw-traffic', crash, nowMs).incidents.length,
      1,
    );
    t.close();
  }
  // The road feed came first: once the fire service lists the crash, the
  // road row is dropped and forgotten instead of lingering as "ended".
  const u = new IncidentStore(':memory:', { env: ALL_ON });
  u.ingest('nsw', snapshot([]));
  u.ingest('nsw-traffic', u.withoutDuplicates('nsw-traffic', crash, nowMs));
  assert.equal(u.feed('nsw', 24, at).incidents.length, 1);
  u.ingest('nsw', snapshot([rescue(7)]));
  u.ingest('nsw-traffic', u.withoutDuplicates('nsw-traffic', crash, nowMs));
  assert.deepEqual(
    u.feed('nsw', 24, at).incidents.map((r) => r.id),
    ['nsw:incident:7'],
  );
  u.close();
  s.close();
});

void test('an optional source never ends the rows of its state in the website history', () => {
  const s = filled(ALL_ON);
  if (!s.history) return s.close();
  const listed = s.db
    .prepare("SELECT id FROM history WHERE region='nsw' AND listed=1")
    .all()
    .map((r) => r.id);
  assert.deepEqual(listed, ['nsw:incident:1']);
  s.close();
});

void test('the feed route: WA is its own region when on, and joins au only with extra=wa', async () => {
  const get = async (store, path) => {
    const server = createServer(store);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    try {
      const res = await fetch(
        `http://127.0.0.1:${server.address().port}${path}`,
      );
      return { status: res.status, body: await res.json() };
    } finally {
      await new Promise((r) => server.close(r));
    }
  };
  const count = (body) =>
    body.incidents.filter((r) => r.id.startsWith('wa:')).length;
  const on = filled(ALL_ON);
  assert.equal(count((await get(on, '/v1/feed?region=au')).body), 0);
  const asked = await get(on, '/v1/feed?region=au&extra=wa,nt');
  assert.equal(count(asked.body), 7);
  assert.equal(asked.body.sources.length, 6);
  const wa = await get(on, '/v1/feed?region=wa');
  assert.equal(wa.status, 200);
  assert.equal(wa.body.region, 'wa');
  assert.equal((await get(on, '/v1/feed?region=nsw-traffic')).status, 400);
  const status = (await get(on, '/v1/status')).body;
  assert.deepEqual(
    status.sources.map((x) => x.region),
    Object.keys(sources),
  );
  assert.equal(status.optionalSources.length, 6);
  assert.ok(status.optionalSources.every((x) => x.enabled && x.ready));
  on.close();
  // Switched off: no WA region, the parameter is ignored, nothing "failed".
  const off = filled({});
  assert.equal((await get(off, '/v1/feed?region=wa')).status, 400);
  const plain = await get(off, '/v1/feed?region=au&extra=wa');
  assert.equal(plain.status, 200);
  assert.equal(count(plain.body), 0);
  assert.equal(plain.body.sources.length, 5);
  const quiet = (await get(off, '/v1/status')).body.optionalSources;
  assert.deepEqual(
    quiet.map((x) => [x.source, x.switch, x.enabled]),
    [
      ['nsw-traffic', 'LIVETRAFFIC_API_KEY', false],
      ['qld-warnings', 'QLD_WARNINGS', false],
      ['qld-traffic', 'QLDTRAFFIC_API_KEY', false],
      ['vic-traffic', 'VIC_ROADS_API_KEY', false],
      ['wa', 'WA_ENABLED', false],
      ['wa-warnings', 'WA_WARNINGS', false],
    ],
  );
  assert.ok(quiet.every((x) => !('state' in x) && !('error' in x)));
  off.close();
});
