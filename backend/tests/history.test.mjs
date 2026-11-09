import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IncidentStore } from '../store.mjs';
import { placeText, places, slugify, normName } from '../places.mjs';
import { levelRank } from '../history.mjs';
import {
  Articles,
  newsworthy,
  headline,
  articleSlug,
  isoWeek,
  weekRange,
} from '../articles.mjs';
import { STATES } from '../site-layout.mjs';

const feed = (rows, at) => ({
  incidents: rows,
  warnings: [],
  fetchedAt: at,
  sourceUpdated: null,
  stale: false,
});
const fire = (o = {}) => ({
  id: 'nsw:incident:1',
  sourceId: '1',
  sourceFeed: 'nsw',
  title: 'Bush Fire',
  location: 'Danehurst Rd, Ewingar 2469',
  category: 'fire',
  status: 'Advice · Being controlled',
  level: 'Advice',
  agency: 'NSW RFS',
  created: null,
  updated: null,
  resources: null,
  point: [-28.95, 152.5],
  kind: 'incident',
  action: null,
  ...o,
});

void test('place text: the last part, without postcode, state or "km of"', () => {
  assert.deepEqual(placeText('Ivanhoe Rd, Balranald 2715'), {
    names: ['Balranald'],
    postcode: '2715',
  });
  assert.deepEqual(placeText('Argyle St, Camden, NSW 2570'), {
    names: ['Camden'],
    postcode: '2570',
  });
  assert.deepEqual(placeText('5.6Km Ne Of Noojee').names, ['Noojee']);
  assert.deepEqual(placeText('Black Range (Stawell)').names, [
    'Black Range',
    'Stawell',
  ]);
  assert.deepEqual(placeText('Cloncurry and surrounding areas').names, [
    'Cloncurry',
  ]);
  assert.equal(normName("MT O'CONNOR"), 'mount oconnor');
  assert.equal(slugify("O'Sullivan Beach"), 'osullivan-beach');
});

void test('places: names, twins, postcode and the nearest place', () => {
  const idx = places();
  assert.ok(idx.size > 15000);
  assert.equal(
    idx.match('vic', 'Oakview Pde, Caroline Springs').slug,
    'caroline-springs',
  );
  assert.equal(idx.match('nsw', 'MT DRUITT').slug, 'mount-druitt');
  assert.equal(idx.match('sa', 'OSULLIVAN BEACH').slug, 'osullivan-beach');
  // Glenroy is a suburb of Albury and a locality near Tumut: the point decides.
  const albury = idx.match('nsw', 'Wagga Rd, Glenroy', [-36.05, 146.92]);
  assert.match(albury.slug, /^glenroy/);
  assert.equal(albury.lga, 'Albury');
  // Only a road: the nearest place to the point.
  assert.ok(idx.match('nsw', 'ABERCROMBIE RD', [-33.87, 149.5]));
  assert.equal(idx.match('nsw', 'Unknown road'), null);
});

void test('history: a row per incident, events on change, ended when it leaves the list', () => {
  const s = new IncidentStore();
  try {
    s.ingest('nsw', feed([fire()], '2026-11-09T01:00:00.000Z'));
    s.ingest('nsw', feed([fire()], '2026-11-09T01:30:00.000Z'));
    s.ingest(
      'nsw',
      feed(
        [
          fire({
            status: 'Watch and Act · Out of control',
            level: 'Watch and Act',
            sizeHa: 120,
          }),
        ],
        '2026-11-09T02:00:00.000Z',
      ),
    );
    s.ingest(
      'nsw',
      feed(
        [fire({ status: 'Under control', level: null, sizeHa: 90 })],
        '2026-11-09T05:00:00.000Z',
      ),
    );
    let row = s.db
      .prepare('SELECT * FROM history WHERE id=?')
      .get('nsw:incident:1');
    assert.equal(row.place, 'ewingar');
    assert.equal(row.max_level, 2, 'the highest level stays');
    assert.equal(row.size_ha, 120, 'the largest size stays');
    assert.equal(row.first_seen, '2026-11-09T01:00:00.000Z');
    assert.equal(row.listed, 1);
    s.ingest('nsw', feed([], '2026-11-09T06:00:00.000Z'));
    row = s.db
      .prepare('SELECT * FROM history WHERE id=?')
      .get('nsw:incident:1');
    assert.equal(row.listed, 0);
    const events = s.db
      .prepare('SELECT * FROM history_events WHERE id=? ORDER BY at')
      .all('nsw:incident:1');
    assert.deepEqual(
      events.map((e) => e.status),
      [
        'Advice · Being controlled',
        'Watch and Act · Out of control',
        'Under control',
        'Ended',
      ],
    );
    assert.equal(
      events.at(-1).at,
      '2026-11-09T06:00:00.000Z',
      'ended when the update without it came in',
    );
  } finally {
    s.close();
  }
});

void test('level ranks', () => {
  assert.deepEqual(
    ['Emergency Warning', 'Watch and Act', 'Advice', null, 'Going'].map(
      levelRank,
    ),
    [3, 2, 1, 0, 0],
  );
});

void test('articles: only what matters, in the licensed states', () => {
  const base = {
    region: 'nsw',
    kind: 'incident',
    category: 'fire',
    title: 'Bush Fire',
    max_level: 0,
    first_seen: '2026-11-09T00:00:00Z',
    last_seen: '2026-11-09T02:00:00Z',
  };
  assert.equal(newsworthy({ ...base, max_level: 2 }), true, 'Watch and Act');
  assert.equal(
    newsworthy({ ...base, max_level: 1 }),
    false,
    'Advice for two hours',
  );
  assert.equal(
    newsworthy({ ...base, max_level: 1, last_seen: '2026-11-09T07:00:00Z' }),
    true,
    'Advice for seven hours',
  );
  assert.equal(newsworthy({ ...base, size_ha: 150 }), true, 'a large fire');
  assert.equal(
    newsworthy({ ...base, title: 'Structure Fire', size_ha: 150 }),
    false,
    'not a landscape fire',
  );
  assert.equal(
    newsworthy({ ...base, region: 'vic', max_level: 3 }),
    false,
    'Victoria waits for its licence',
  );
  assert.equal(
    newsworthy({ ...base, region: 'qld', kind: 'warning' }),
    true,
    'Queensland warnings',
  );
  assert.equal(
    newsworthy({ ...base, category: 'ambulance', max_level: 3 }),
    false,
  );
});

void test('headlines follow the incident and slugs stay put', () => {
  const tz = 'Australia/Sydney';
  const row = {
    region: 'nsw',
    kind: 'incident',
    title: 'Bush Fire',
    location: 'Danehurst Rd, Ewingar 2469',
    status: 'Watch and Act · Out of control',
    level: 'Watch and Act',
    listed: 1,
    created: '2026-11-09T03:00:00Z',
    first_seen: '2026-11-09T03:05:00Z',
  };
  assert.equal(
    headline(row, 'Ewingar', tz),
    'Ewingar bush fire: Watch and Act',
  );
  assert.equal(
    headline({ ...row, level: null, status: 'Under control' }, 'Ewingar', tz),
    'Ewingar bush fire: under control',
  );
  assert.equal(
    headline({ ...row, listed: 0 }, 'Ewingar', tz),
    'Ewingar bush fire, 9 November 2026',
  );
  assert.equal(
    headline({ ...row, listed: 0 }, 'Ewingar', tz, true),
    'Ewingar (Danehurst Rd) bush fire, 9 November 2026',
  );
  assert.equal(articleSlug(row, 'ewingar', tz), 'ewingar-bush-fire-2026-11-09');
});

void test('ISO weeks and their local range', () => {
  assert.deepEqual(
    [
      isoWeek('2026-11-08T13:30:00Z', 'Australia/Sydney').week,
      isoWeek('2027-01-03T05:00:00Z', 'Australia/Sydney').week,
    ],
    [46, 53],
  );
  const r = weekRange(2026, 45, 'Australia/Sydney');
  assert.equal(r.from, '2026-11-01T13:00:00.000Z');
  assert.equal(r.to, '2026-11-08T13:00:00.000Z');
});

void test('article refresh: one article per incident, a fresh title, and the weekly overview', () => {
  const s = new IncidentStore();
  try {
    s.ingest(
      'nsw',
      feed(
        [
          fire({
            status: 'Watch and Act · Out of control',
            level: 'Watch and Act',
          }),
        ],
        '2026-11-04T01:00:00.000Z',
      ),
    );
    const a = new Articles(s.db);
    const opts = {
      placeName: (r, slug) => (slug ? places().get(r, slug)?.name : null),
      tz: (r) => STATES[r].tz,
    };
    assert.equal(a.refresh({ ...opts, now: '2026-11-04T02:00:00.000Z' }), 1);
    assert.equal(
      a.refresh({ ...opts, now: '2026-11-04T02:05:00.000Z' }),
      0,
      'not twice',
    );
    const art = a.latest('nsw')[0];
    assert.equal(art.slug, 'ewingar-bush-fire-2026-11-04');
    assert.equal(art.title, 'Ewingar bush fire: Watch and Act');
    s.ingest('nsw', feed([], '2026-11-04T03:00:00.000Z'));
    a.refresh({ ...opts, now: '2026-11-04T03:05:00.000Z' });
    assert.equal(
      a.get('nsw', art.slug).title,
      'Ewingar bush fire, 4 November 2026',
    );
    // Monday 9 November 07:00 in Sydney: the overview of 2 to 8 November.
    a.refresh({ ...opts, now: '2026-11-08T20:00:00.000Z' });
    const week = a.get('nsw', 'week-2026-45');
    assert.ok(week, 'weekly overview');
    assert.equal(
      week.title,
      'NSW fires and emergencies, 2 November to 8 November 2026',
    );
  } finally {
    s.close();
  }
});
