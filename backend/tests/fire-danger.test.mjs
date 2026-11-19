import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FireDangerService,
  RATINGS,
  afdrsRating,
  districtAt,
  fireDangerOn,
  fireDangerSources,
  localDay,
  parseNSWFireDanger,
} from '../fire-danger.mjs';
import { places } from '../places.mjs';
import { createServer } from '../server.mjs';
import { IncidentStore } from '../store.mjs';

// The real NSW RFS file of 19-11-2026, 20:50 AEDT: 20 NSW fire areas and the
// ACT, no Total Fire Ban, ratings None to High.
const sample = readFileSync(
  new URL('./fixtures/rfs-fdrtoban-2026-11-19.xml', import.meta.url),
  'utf8',
);
const AT = Date.parse('2026-11-19T09:50:00Z');
const ISSUED = '2026-11-19T05:20:43.000Z';
const parse = (xml = sample) =>
  parseNSWFireDanger(xml, { issuedAt: ISSUED, now: AT });

/** The sample with one district's values changed. */
function withDistrict(name, changes) {
  const start = sample.indexOf(`<Name>${name}</Name>`);
  const end = sample.indexOf('</District>', start);
  let block = sample.slice(start, end);
  for (const [tag, value] of Object.entries(changes))
    block = block.replace(
      new RegExp(`<${tag}>[^<]*</${tag}>`),
      `<${tag}>${value}</${tag}>`,
    );
  return sample.slice(0, start) + block + sample.slice(end);
}

const response = (body, headers = {}) =>
  new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/xml', ...headers },
  });

void test('switch: fire danger is off unless FIRE_DANGER_ENABLED is on', () => {
  assert.equal(fireDangerOn({}), false);
  assert.equal(fireDangerOn({ FIRE_DANGER_ENABLED: 'false' }), false);
  assert.equal(fireDangerOn({ FIRE_DANGER_ENABLED: ' On ' }), true);
  assert.equal(fireDangerOn({ FIRE_DANGER_ENABLED: '1' }), true);
});

void test('ratings: source words become AFDRS terms, unknown words are not guessed', () => {
  assert.equal(afdrsRating('NONE'), 'No Rating');
  assert.equal(afdrsRating('No  Rating'), 'No Rating');
  assert.equal(afdrsRating('MODERATE'), 'Moderate');
  assert.equal(afdrsRating('Catastrophic'), 'Catastrophic');
  assert.equal(afdrsRating(''), null);
  assert.equal(afdrsRating('SEVERE'), undefined);
  assert.deepEqual(RATINGS, [
    'No Rating',
    'Moderate',
    'High',
    'Extreme',
    'Catastrophic',
  ]);
});

void test('local day: today and tomorrow in the source time zone', () => {
  // 13:30 UTC on the 19th is already the 20th in Sydney.
  const late = Date.parse('2026-11-19T13:30:00Z');
  assert.equal(localDay(AT, 'Australia/Sydney'), '2026-11-19');
  assert.equal(localDay(late, 'Australia/Sydney'), '2026-11-20');
  assert.equal(localDay(late, 'Australia/Sydney', 1), '2026-11-21');
});

void test('NSW RFS: the real file gives 20 NSW fire areas and the ACT', () => {
  const { districts, skipped } = parse();
  assert.equal(skipped, null);
  assert.equal(districts.length, 21);
  assert.equal(districts.filter((d) => d.state === 'nsw').length, 20);
  const sydney = districts.find((d) => d.districtId === 'nsw:4');
  assert.deepEqual(
    { ...sydney, councils: sydney.councils.slice(0, 3) },
    {
      state: 'nsw',
      district: 'Greater Sydney Region',
      districtId: 'nsw:4',
      councils: ['The Hills', 'Blacktown', 'Blue Mountains'],
      today: { date: '2026-11-19', rating: 'Moderate', totalFireBan: false },
      tomorrow: {
        date: '2026-11-20',
        rating: 'Moderate',
        totalFireBan: false,
      },
      issuedAt: ISSUED,
      source: 'nsw-rfs',
      attribution: fireDangerSources['nsw-rfs'].attribution,
    },
  );
  const act = districts.find((d) => d.state === 'act');
  assert.equal(act.districtId, 'act:8');
  assert.equal(act.district, 'ACT');
  assert.deepEqual(act.councils, []);
  // "NONE" in the file is the AFDRS "No Rating".
  assert.equal(districts[0].district, 'Far North Coast');
  assert.equal(districts[0].today.rating, 'No Rating');
  assert.equal(
    districts.find((d) => d.district === 'Northern Slopes').today.rating,
    'High',
  );
  for (const d of districts) {
    assert.ok(RATINGS.includes(d.today.rating));
    assert.ok(RATINGS.includes(d.tomorrow.rating));
  }
});

void test('NSW RFS: a Total Fire Ban and Extreme for tomorrow are read per day', () => {
  const { districts } = parse(
    withDistrict('Greater Hunter', {
      DangerLevelTomorrow: 'EXTREME',
      FireBanTomorrow: 'Yes',
    }),
  );
  const hunter = districts.find((d) => d.district === 'Greater Hunter');
  assert.deepEqual(hunter.today, {
    date: '2026-11-19',
    rating: 'Moderate',
    totalFireBan: false,
  });
  assert.deepEqual(hunter.tomorrow, {
    date: '2026-11-20',
    rating: 'Extreme',
    totalFireBan: true,
  });
});

void test('NSW RFS: a district we cannot read is skipped and counted, the rest is kept', () => {
  const f = parse(withDistrict('Far Western', { DangerLevelToday: 'SEVERE' }));
  assert.equal(f.districts.length, 20);
  assert.deepEqual(f.skipped, {
    count: 1,
    reasons: { 'Unknown NSW fire danger rating': 1 },
  });
  const ban = parse(withDistrict('ACT', { FireBanToday: 'Maybe' }));
  assert.deepEqual(ban.skipped.reasons, { 'Unknown NSW fire ban value': 1 });
  // An empty rating is "not supplied", not a reason to drop the district.
  const empty = parse(withDistrict('ACT', { DangerLevelTomorrow: '' }));
  assert.equal(empty.skipped, null);
  assert.equal(
    empty.districts.find((d) => d.state === 'act').tomorrow.rating,
    null,
  );
});

void test('NSW RFS: only a file in which every district is rejected fails', () => {
  const one = (level) =>
    `<FireDangerMap><District><Name>Test</Name><RegionNumber>1</RegionNumber><Councils>A; B</Councils><DangerLevelToday>${level}</DangerLevelToday><DangerLevelTomorrow>HIGH</DangerLevelTomorrow><FireBanToday>No</FireBanToday><FireBanTomorrow>No</FireBanTomorrow></District></FireDangerMap>`;
  assert.equal(parse(one('HIGH')).districts.length, 1);
  assert.throws(() => parse(one('SEVERE')), /Every NSW fire district record/);
  assert.throws(() => parse('<FireDangerMap></FireDangerMap>'));
  assert.throws(() => parse('<html><body>Just a moment...</body></html>'));
  assert.throws(() => parse('<!DOCTYPE x><FireDangerMap/>'), /Invalid/);
  assert.throws(() => parse(null), /Invalid/);
});

void test('district for a point: nearest locality, its council, the fire area that lists it', () => {
  const { districts } = parse();
  const at = (lat, lon) => districtAt(districts, lat, lon, places());
  // Penrith: the council is listed under Greater Sydney Region.
  const penrith = at(-33.751, 150.694);
  assert.equal(penrith.district.districtId, 'nsw:4');
  assert.equal(penrith.match.method, 'nearest-locality');
  assert.equal(penrith.match.council, 'Penrith');
  assert.ok(penrith.match.km < 5);
  // "Nambucca" in the file, "Nambucca Valley" in the place list.
  assert.equal(at(-30.643, 153.0).district.district, 'North Coast');
  // Canberra is the ACT district of the same file.
  assert.equal(at(-35.28, 149.13).district.districtId, 'act:8');
  assert.equal(at(-32.25, 148.6).district.district, 'Lower Central West Plains');
});

void test('district for a point: a split council and an unlisted one follow the nearest clear neighbour', () => {
  const { districts } = parse();
  const at = (lat, lon) => districtAt(districts, lat, lon, places());
  // Murrumbidgee is split: Darlington Point north, Jerilderie south.
  const north = at(-34.57, 146.0);
  assert.equal(north.match.council, 'Murrumbidgee');
  assert.equal(north.match.method, 'nearest-neighbouring-council');
  assert.equal(north.district.district, 'Northern Riverina');
  assert.equal(at(-35.36, 145.73).district.district, 'Southern Riverina');
  // Tibooburra lies in Unincorporated NSW, which the file does not list.
  assert.equal(at(-29.43, 142.01).district.district, 'Far Western');
});

void test('district for a point: nothing outside the states we have a source for', () => {
  const { districts } = parse();
  const melbourne = districtAt(districts, -37.81, 144.96, places());
  assert.equal(melbourne.district, null);
  assert.equal(melbourne.match.state, 'vic');
  const sea = districtAt(districts, -35, 160, places());
  assert.deepEqual(sea, { district: null, match: null });
});

void test('service: keeps the last good answer when the source fails, and says so', async () => {
  let now = AT;
  let answer = () => response(sample, { 'last-modified': new Date(ISSUED).toUTCString() });
  const calls = [];
  const service = new FireDangerService({
    now: () => now,
    fetcher: async (url, init) => {
      calls.push({ url, agent: init.headers['User-Agent'] });
      return answer();
    },
  });
  assert.equal(service.status()[0].state, 'unavailable');
  assert.deepEqual(service.all().districts, []);
  await service.refresh();
  assert.equal(calls[0].url, 'https://www.rfs.nsw.gov.au/feeds/fdrToban.xml');
  assert.doesNotMatch(calls[0].agent, /@/);
  const all = service.all();
  assert.equal(all.districts.length, 21);
  assert.equal(all.districts[0].issuedAt, ISSUED);
  assert.equal(all.districts[0].stale, false);
  assert.equal(all.sources[0].attribution, fireDangerSources['nsw-rfs'].attribution);
  assert.deepEqual(all.sources[0].states, ['nsw', 'act']);
  assert.equal(service.status()[0].state, 'healthy');

  // Not due again within the half hour.
  now += 10 * 60_000;
  await service.refresh();
  assert.equal(calls.length, 1);

  // An error page: the districts stay, the failure is counted and retried
  // after five minutes instead of thirty.
  now += 20 * 60_000;
  answer = () => response('<html><body>Just a moment...</body></html>');
  await service.refresh();
  assert.equal(calls.length, 2);
  assert.equal(service.all().districts.length, 21);
  let status = service.status()[0];
  assert.equal(status.consecutiveFailures, 1);
  assert.match(status.error, /Invalid NSW fire danger/);
  assert.equal(status.state, 'healthy');
  now += 5 * 60_000;
  answer = () => new Response('', { status: 503 });
  await service.refresh();
  assert.equal(calls.length, 3);
  assert.equal(service.status()[0].error, 'Source HTTP 503');

  // Three hours without a good answer: the districts are marked stale.
  now = AT + 3 * 3600_000 + 60_000;
  assert.equal(service.all().districts[0].stale, true);
  assert.equal(service.status()[0].state, 'delayed');

  // A good answer clears it and stamps the new days.
  now = Date.parse('2026-11-19T20:00:00Z');
  answer = () => response(sample);
  await service.refresh();
  status = service.status()[0];
  assert.equal(status.consecutiveFailures, 0);
  assert.equal(status.error, null);
  assert.equal(status.state, 'healthy');
  const fresh = service.all().districts[0];
  assert.equal(fresh.today.date, '2026-11-20');
  assert.equal(fresh.issuedAt, null);
});

void test('service: past midnight yesterday\'s answer is stale until the next one', async () => {
  let now = Date.parse('2026-11-19T12:50:00Z'); // 23:50 in Sydney
  const service = new FireDangerService({
    now: () => now,
    fetcher: async () => response(sample),
  });
  await service.refresh();
  assert.equal(service.all().districts[0].stale, false);
  now += 15 * 60_000;
  assert.equal(service.all().districts[0].stale, true);
});

void test('routes: /v1/fire-danger is off without the switch, and in /v1/status with it', async () => {
  const store = new IncidentStore();
  const service = new FireDangerService({
    fetcher: async () => response(sample),
  });
  await service.refresh();
  const off = createServer(store);
  const on = createServer(store, null, null, null, null, null, service);
  await new Promise((r) => off.listen(0, '127.0.0.1', r));
  await new Promise((r) => on.listen(0, '127.0.0.1', r));
  const get = async (server, path) => {
    const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    return { status: res.status, cache: res.headers.get('cache-control'), body: await res.json() };
  };
  try {
    assert.equal((await get(off, '/v1/fire-danger')).status, 503);
    assert.deepEqual((await get(off, '/v1/status')).body.fireDanger, {
      enabled: false,
      sources: [],
    });

    const all = await get(on, '/v1/fire-danger');
    assert.equal(all.status, 200);
    assert.equal(all.cache, 'public, max-age=300');
    assert.equal(all.body.districts.length, 21);
    assert.match(all.body.sources[0].attribution, /NSW Rural Fire Service/);

    const point = await get(on, '/v1/fire-danger?lat=-33.751&lon=150.694');
    assert.equal(point.status, 200);
    assert.equal(point.body.covered, true);
    assert.equal(point.body.district.district, 'Greater Sydney Region');
    assert.equal(point.body.district.today.totalFireBan, false);
    assert.equal(point.body.match.method, 'nearest-locality');
    assert.equal(point.body.sources.length, 1);

    const outside = await get(on, '/v1/fire-danger?lat=-37.81&lon=144.96');
    assert.equal(outside.status, 200);
    assert.equal(outside.body.district, null);
    assert.equal(outside.body.covered, false);

    for (const bad of ['lat=abc&lon=150', 'lat=-33.7', 'lat=-91&lon=150', 'lon=150'])
      assert.equal((await get(on, `/v1/fire-danger?${bad}`)).status, 400);

    const status = (await get(on, '/v1/status')).body.fireDanger;
    assert.equal(status.enabled, true);
    assert.equal(status.sources[0].source, 'nsw-rfs');
    assert.equal(status.sources[0].districts, 21);
    assert.equal(status.sources[0].state, 'healthy');
  } finally {
    await new Promise((r) => off.close(r));
    await new Promise((r) => on.close(r));
    store.close();
  }
});
