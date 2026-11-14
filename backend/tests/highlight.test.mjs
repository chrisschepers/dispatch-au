// Incident of the day (concept, highlight/). These tests guard what may end
// up in a public post: the right incident, only real figures and moments,
// the official warning colours, the attribution, and nothing from a feed
// that can break the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  selectIncidentOfTheDay,
  excludedBecause,
  rankKey,
} from '../highlight/select.mjs';
import {
  AWS,
  INDEPENDENT,
  APPLE_TRADEMARK,
  buildScene,
  chooseNumber,
  chooseSteps,
  isControlStatus,
  renderSceneHtml,
  splitHeadline,
  TOTAL_SEC,
  FPS,
} from '../highlight/scene.mjs';
import { buildCaption, firstLine, hashtags } from '../highlight/caption.mjs';
import { ffmpegArgs, BADGE_PATH } from '../highlight/render.mjs';
import { watchAndActFixture } from '../highlight/fixture.mjs';
import { sources } from '../source-config.mjs';

const NOW = Date.parse('2026-11-14T08:30:00Z');
const H = 3_600_000;
const ago = (h) => new Date(NOW - h * H).toISOString();

// A NSW RFS row as /v1/feed returns it.
const nsw = (o = {}) => ({
  id: 'nsw:incident:1',
  sourceId: '1',
  sourceFeed: 'nsw',
  agency: 'NSW RFS',
  created: null,
  updated: ago(1),
  resources: null,
  geometry: { type: 'Point', coordinates: [151.1, -32.9] },
  point: [-32.9, 151.1],
  kind: 'incident',
  level: 'Advice',
  action: null,
  officialUrl: 'https://www.rfs.nsw.gov.au/fire-information/fires-near-me',
  title: 'Bush Fire',
  location: 'PAYNES CROSSING RD, WOLLOMBI 2325',
  category: 'fire',
  status: 'Advice · Being controlled',
  sizeHa: null,
  firstSeen: ago(6),
  lastSeen: ago(0),
  listed: true,
  ...o,
});
// A Victorian row: resources, a call time, never a level on the incident.
const vic = (o = {}) => ({
  ...nsw(),
  id: 'vic:incident:ESTA:1',
  sourceId: 'ESTA:1',
  sourceFeed: 'cfa-incident',
  agency: 'VIC/CFA',
  title: 'Grass Fire',
  location: 'Plumpton Rd, Diggers Rest',
  status: 'Responding',
  level: null,
  sizeHa: undefined,
  created: ago(3),
  resources: 5,
  point: [-37.6, 144.7],
  ...o,
});
const pick = (rows, opts = {}) =>
  selectIncidentOfTheDay(
    { incidents: rows, warnings: [] },
    { now: NOW, ...opts },
  );
const plane = (hex, o = {}) => ({
  hex,
  name: hex,
  rotor: false,
  since: ago(4),
  lastNear: ago(3),
  track: [],
  ...o,
});

test('selection: the warning level comes first, whatever the size', () => {
  const s = pick([
    nsw({ id: 'nsw:incident:1', level: 'Advice', sizeHa: 5000 }),
    nsw({ id: 'nsw:incident:2', level: 'Emergency Warning', sizeHa: 3 }),
    nsw({ id: 'nsw:incident:3', level: 'Watch and Act', sizeHa: 900 }),
  ]);
  assert.equal(s.chosen.id, 'nsw:incident:2');
  assert.equal(s.deciding, 'level');
  assert.match(s.why, /only Emergency Warning/);
});

test('selection: then aircraft, then hectares, then resources, then duration', () => {
  const air = { 'nsw:incident:small': [plane('a'), plane('b'), plane('b')] };
  const a = pick(
    [
      nsw({ id: 'nsw:incident:big', sizeHa: 900 }),
      nsw({ id: 'nsw:incident:small', sizeHa: 20 }),
    ],
    { aircraftFor: (id) => air[id] },
  );
  assert.equal(a.chosen.id, 'nsw:incident:small');
  assert.equal(a.deciding, 'aircraft');
  assert.equal(a.key.aircraft, 2, 'unique aircraft, not flights');

  const b = pick([
    nsw({ id: 'nsw:incident:1', sizeHa: 40 }),
    nsw({ id: 'nsw:incident:2', sizeHa: 1840 }),
  ]);
  assert.equal(b.chosen.id, 'nsw:incident:2');
  assert.equal(b.deciding, 'sizeHa');
  assert.match(
    b.why,
    /largest fire \(1,840 ha\) of the 2 incidents at Advice level/,
  );
  assert.ok(b.reasons.some((r) => /next largest 40 ha/.test(r)));

  const c = pick([
    vic({ id: 'vic:incident:ESTA:1', resources: 3 }),
    vic({ id: 'vic:incident:ESTA:2', resources: 7 }),
  ]);
  assert.equal(c.chosen.id, 'vic:incident:ESTA:2');
  assert.equal(c.deciding, 'resources');

  const d = pick([
    vic({ id: 'vic:incident:ESTA:1', created: ago(2) }),
    vic({ id: 'vic:incident:ESTA:2', created: ago(9) }),
  ]);
  assert.equal(d.chosen.id, 'vic:incident:ESTA:2');
  assert.equal(d.deciding, 'durationMin');
});

test('selection: a missing figure ranks below any real one and is never 0', () => {
  assert.equal(rankKey(nsw({ sizeHa: null })).sizeHa, null);
  assert.equal(
    rankKey(nsw({ sizeHa: '1840' })).sizeHa,
    null,
    'text is not a number',
  );
  const s = pick([
    nsw({ id: 'nsw:incident:1', sizeHa: null }),
    nsw({ id: 'nsw:incident:2', sizeHa: 12 }),
  ]);
  assert.equal(s.chosen.id, 'nsw:incident:2');
});

test('selection: no planned burns, no medical calls, no warning-only areas, no SA', () => {
  const rows = [
    nsw({
      id: 'nsw:incident:hr',
      title: 'Hazard Reduction',
      category: 'planned',
      level: 'Watch and Act',
      sizeHa: 4000,
    }),
    nsw({
      id: 'nsw:incident:hr2',
      title: 'Hazard Reduction Burn',
      category: 'fire',
      sizeHa: 4000,
    }),
    vic({
      id: 'vic:incident:burn',
      sourceFeed: 'deeca-burns',
      title: 'Planned Burn',
      category: 'fire',
    }),
    nsw({ id: 'nsw:incident:med', title: 'Medical', category: 'other' }),
    {
      ...nsw(),
      id: 'act:incident:9',
      title: 'Ambulance Response',
      category: 'ambulance',
      level: null,
    },
    {
      ...nsw(),
      id: 'sa:incident:F1',
      sourceFeed: 'sa-cfs-cap',
      level: 'Emergency Warning',
    },
    nsw({ id: 'nsw:incident:2', sizeHa: 3 }),
  ];
  const warning = {
    ...nsw(),
    id: 'qld:warning:WARN-1',
    kind: 'warning',
    level: 'Emergency Warning',
    point: null,
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [145, -17],
          [145.1, -17],
          [145.1, -17.1],
          [145, -17],
        ],
      ],
    },
  };
  const s = selectIncidentOfTheDay(
    { incidents: rows, warnings: [warning] },
    { now: NOW },
  );
  assert.equal(s.chosen.id, 'nsw:incident:2');
  assert.deepEqual(s.excluded, {
    planned: 3,
    medical: 2,
    licence: 1,
    'warning-only': 1,
  });
  assert.equal(
    excludedBecause(nsw({ listed: false, lastSeen: ago(30) }), { now: NOW }),
    'outside-window',
  );
  assert.equal(
    excludedBecause(nsw({ point: null, geometry: null }), { now: NOW }),
    'no-location',
  );
});

test('selection: a featured incident can be left out, and nothing qualifying gives null', () => {
  const rows = [
    nsw({ id: 'nsw:incident:1', sizeHa: 900 }),
    nsw({ id: 'nsw:incident:2', sizeHa: 20 }),
  ];
  assert.equal(
    pick(rows, { exclude: ['nsw:incident:1'] }).chosen.id,
    'nsw:incident:2',
  );
  const none = pick([nsw({ category: 'planned' })]);
  assert.equal(none.chosen, null);
  assert.equal(none.why, null);
});

test('the big number is never invented', () => {
  assert.equal(chooseNumber({ aircraft: 1, sizeHa: null }), null);
  assert.equal(chooseNumber({ aircraft: 0, sizeHa: 9.4 }), null);
  assert.equal(chooseNumber({ aircraft: 0, sizeHa: '1840' }), null);
  assert.equal(chooseNumber({ aircraft: 0, sizeHa: Number.NaN }), null);
  assert.equal(chooseNumber(), null);
  assert.deepEqual(chooseNumber({ aircraft: 3, sizeHa: 640 }), {
    value: '3',
    label: 'aircraft worked this fire',
    kind: 'aircraft',
  });
  assert.deepEqual(chooseNumber({ aircraft: 1, sizeHa: 1840 }), {
    value: '1,840',
    label: 'hectares',
    kind: 'sizeHa',
  });
  // A Victorian incident has resources but no size and no aircraft: no number.
  const scene = buildScene({ incident: vic({ resources: 12 }), now: NOW });
  assert.equal(scene.number, null);
  assert.ok(
    !renderSceneHtml(scene, 'still', { fonts: '', map: false }).includes(
      'class="getal"',
    ),
  );
});

test('moments: only real times, at most three, and "out of control" is not control', () => {
  const tz = 'Australia/Sydney';
  // From the feed alone: first listed and the latest update with its status.
  const feedOnly = chooseSteps({
    incident: nsw({ status: 'Advice · Under control' }),
    tz,
    day: '2026-11-14',
    now: NOW,
  });
  assert.deepEqual(
    feedOnly.map((s) => s.label),
    ['First listed', 'Update: under control'],
  );
  // A call time is "Reported"; no update time, no second moment.
  assert.deepEqual(
    chooseSteps({ incident: vic({ updated: null }), tz, now: NOW }).map(
      (s) => s.label,
    ),
    ['Reported'],
  );
  // An ended incident: when we last saw it listed.
  assert.equal(
    chooseSteps({
      incident: nsw({ listed: false, lastSeen: ago(2) }),
      tz,
      now: NOW,
    }).at(-1).label,
    'Last listed',
  );
  // With history events: the level rise and the control status; aircraft drop out at four.
  const events = [
    { at: ago(6), status: 'Advice · Not yet controlled', level: 'Advice' },
    {
      at: ago(5),
      status: 'Watch and Act · Out of control',
      level: 'Watch and Act',
    },
    { at: ago(2), status: 'Advice · Being controlled', level: 'Advice' },
  ];
  const full = chooseSteps({
    incident: nsw(),
    events,
    aircraft: [plane('a', { since: ago(5.5) })],
    tz,
    day: '2026-11-14',
    now: NOW,
  });
  assert.deepEqual(
    full.map((s) => s.label),
    ['First listed', 'Watch and Act', 'Being controlled'],
  );
  assert.ok(full.every((s) => s.time && Number.isFinite(Date.parse(s.at))));
  assert.equal(isControlStatus('Out of control'), false);
  assert.equal(isControlStatus('Not yet controlled'), false);
  assert.equal(isControlStatus('Under control'), true);
  // Times are in the state's zone: 01:58 UTC is 12:58 pm in Sydney.
  const one = chooseSteps({
    incident: nsw({ firstSeen: '2026-11-14T01:58:00Z', updated: null }),
    tz,
    day: '2026-11-14',
    now: NOW,
  });
  assert.equal(one[0].time, '12:58 pm');
});

test('the warning level pill uses the official AWS colours', () => {
  assert.deepEqual(
    Object.values(AWS).map((l) => [l.label, l.bg]),
    [
      ['Advice', '#FBE032'],
      ['Watch and Act', '#FF7900'],
      ['Emergency Warning', '#D6001C'],
    ],
  );
  for (const [level, bg] of [
    ['Advice', '#FBE032'],
    ['Watch and Act', '#FF7900'],
    ['Emergency Warning', '#D6001C'],
  ]) {
    const html = renderSceneHtml(
      buildScene({ incident: nsw({ level }), now: NOW }),
      'still',
      { fonts: '', map: false },
    );
    assert.ok(html.includes(`style="--bg:${bg};`), level);
    assert.ok(html.includes(`>${level}</b>`), level);
  }
  const none = renderSceneHtml(
    buildScene({ incident: vic(), now: NOW }),
    'still',
    { fonts: '', map: false },
  );
  assert.ok(!/--bg:#(FBE032|FF7900|D6001C)/.test(none));
});

test('scene: headline, place, date and the source as source-config requires', () => {
  assert.deepEqual(splitHeadline('Bush Fire'), ['Bush', 'fire']);
  assert.deepEqual(splitHeadline('GRASS FIRE'), ['Grass', 'fire']);
  assert.deepEqual(splitHeadline('Fire'), ['', 'Fire']);
  assert.deepEqual(splitHeadline('MVA'), ['Road', 'crash']);
  const scene = buildScene({ incident: nsw({ sizeHa: 1840 }), now: NOW });
  assert.equal(scene.place, 'Wollombi');
  assert.equal(scene.state, 'NSW');
  assert.equal(scene.tz, 'Australia/Sydney');
  assert.equal(scene.date, '14 November');
  assert.ok(scene.source.line.includes(sources.nsw.attribution));
  assert.ok(scene.source.line.startsWith('Source: NSW Rural Fire Service.'));
  // Victoria's attribution already names the source: used as it is.
  assert.ok(
    buildScene({ incident: vic(), now: NOW }).source.line.startsWith(
      sources.vic.attribution,
    ),
  );
  const html = renderSceneHtml(scene, 'still', { fonts: '', map: false });
  assert.ok(
    html.includes('<span>Incident of the day</span><b>14 November</b>'),
  );
  assert.ok(html.includes(INDEPENDENT));
  assert.ok(html.includes('width:1080px;height:1350px'));
});

test('feed text cannot break the page', () => {
  const evil = nsw({
    title: 'Bush <script>alert(1)</script>',
    location: 'Main "Rd" </div><img src=x onerror=alert(1)>, WOLLOMBI 2325',
    status: 'Advice · </script><script>alert(2)</script>',
  });
  const scene = buildScene({
    incident: evil,
    aircraft: [
      plane('abc123', {
        name: '<b>Bomber</b>',
        track: [
          [1, -32.9, 151.1, 900],
          [2, -32.91, 151.11, 900],
        ],
      }),
    ],
    now: NOW,
  });
  for (const format of ['still', 'reel'])
    for (const map of [true, false]) {
      const html = renderSceneHtml(scene, format, { fonts: '', map });
      assert.ok(!html.includes('<script>alert'), `${format} ${map}`);
      assert.ok(!html.includes('<b>Bomber</b>'));
      assert.ok(!html.includes('onerror=alert'));
      // The data block for the page script cannot close the script tag.
      const data = html.slice(
        html.indexOf('const D = '),
        html.indexOf('window.__klaar'),
      );
      assert.ok(!data.includes('<'));
    }
});

test('reel: end card with app icon, the official App Store badge only, and "Link in bio"', () => {
  const scene = buildScene({ incident: nsw(), now: NOW });
  const withBadge = renderSceneHtml(scene, 'reel', {
    fonts: '',
    map: false,
    icon: 'data:image/png;base64,AA',
    badge: 'data:image/svg+xml;base64,AA',
  });
  assert.ok(withBadge.includes('data-a="uit"'));
  assert.ok(withBadge.includes('alt="Download on the App Store"'));
  assert.ok(withBadge.includes('Link in bio'));
  assert.ok(withBadge.includes(APPLE_TRADEMARK.replace(/'/g, '&#39;')));
  assert.ok(!/google play/i.test(withBadge));
  // Without the official file: a marked placeholder, never a drawn badge.
  const noBadge = renderSceneHtml(scene, 'reel', {
    fonts: '',
    map: false,
    icon: null,
    badge: null,
  });
  assert.ok(noBadge.includes('PLACEHOLDER'));
  assert.ok(!noBadge.includes('alt="Download on the App Store"'));
  // The still is the end state of the scene, without the end card.
  assert.ok(
    !renderSceneHtml(scene, 'still', { fonts: '', map: false }).includes(
      'data-a="uit"',
    ),
  );
});

test("the App Store badge in the repo is Apple's file, unmodified", () => {
  const hash = createHash('sha256')
    .update(readFileSync(BADGE_PATH))
    .digest('hex');
  assert.equal(
    hash,
    'a26fc5b38380272c92e9019a2eb8b45542a66814b3e2b203772db8904b9fb99f',
  );
  assert.match(
    readFileSync(BADGE_PATH, 'utf8'),
    /Download_on_the_App_Store_Badge_US-UK_RGB_blk/,
  );
});

test('caption: essentials first, why, independence, official link, attribution, hashtags', () => {
  const fx = watchAndActFixture();
  const selection = selectIncidentOfTheDay(fx.feed, {
    aircraftFor: (id) => fx.aircraft[id],
    now: fx.now,
  });
  const id = selection.chosen.id;
  const scene = buildScene({
    incident: selection.chosen,
    aircraft: fx.aircraft[id],
    events: fx.events[id],
    now: fx.now,
    fetchedAt: fx.feed.fetchedAt,
  });
  const caption = buildCaption(scene, selection);
  const paras = caption.split('\n\n');
  assert.equal(paras[0], 'Watch and Act: bush fire at Wollombi, NSW');
  assert.equal(
    firstLine({ ...scene, level: null }),
    'Bush fire at Wollombi, NSW',
  );
  assert.equal(
    paras[1],
    'Why this one: the only Watch and Act in the last 24 hours.',
  );
  assert.ok(
    caption.includes(
      `${INDEPENDENT}. For warnings and advice: https://www.rfs.nsw.gov.au/fire-information/fires-near-me`,
    ),
  );
  assert.ok(caption.includes(sources.nsw.attribution));
  assert.ok(caption.includes('Aircraft positions: adsb.lol (ODbL).'));
  assert.ok(caption.includes('© OpenStreetMap contributors'));
  const tags = paras.at(-1).split(' ');
  assert.ok(tags.length >= 5 && tags.length <= 8, tags.join(' '));
  assert.ok(tags.every((t) => /^#[a-z0-9]+$/.test(t)));
  assert.ok(
    tags.includes('#bushfire') &&
      tags.includes('#nswfires') &&
      tags.includes('#wollombi'),
  );
  // Never a call to go there. The agency's own attribution line is the only "go to", and it is a website.
  const own = caption.replace(sources.nsw.attribution, '');
  assert.ok(
    !/\b(visit|head (to|out|over)|go (to|and see|there)|come (and|to) see|check (it|this) out|drive)\b/i.test(
      own,
    ),
    own,
  );
  assert.ok(caption.length < 2200, 'Instagram limit');
  assert.deepEqual(
    hashtags({
      ...scene,
      headline: ['Structure', 'fire'],
      region: 'vic',
      place: 'Collingwood',
      aircraftCount: 0,
    }).slice(0, 3),
    ['#housefire', '#vicfires', '#collingwood'],
  );
});

test('fixture: Watch and Act with three aircraft gives the rich variant', () => {
  const fx = watchAndActFixture();
  const selection = selectIncidentOfTheDay(fx.feed, {
    aircraftFor: (id) => fx.aircraft[id],
    now: fx.now,
  });
  assert.equal(
    selection.chosen.id,
    'nsw:incident:699001',
    'beats a larger Advice fire and a bigger planned burn',
  );
  const scene = buildScene({
    incident: selection.chosen,
    aircraft: fx.aircraft[selection.chosen.id],
    events: fx.events[selection.chosen.id],
    now: fx.now,
  });
  assert.deepEqual(scene.number, {
    value: '3',
    label: 'aircraft worked this fire',
    kind: 'aircraft',
  });
  assert.equal(scene.tracks.length, 3);
  assert.ok(scene.tracks.every((t) => t.pts.length >= 2));
  assert.deepEqual(
    scene.steps.map((s) => s.label),
    ['First listed', 'First aircraft at the fire', 'Watch and Act'],
  );
  assert.equal(scene.level.bg, '#FF7900');
  assert.ok(scene.area.length >= 1);
});

test('ffmpeg: H.264 yuv420p at 25 fps, the whole reel, moov first', () => {
  const a = ffmpegArgs('/tmp/x.mp4');
  const after = (flag) => a[a.lastIndexOf(flag) + 1];
  assert.equal(after('-c:v'), 'libx264');
  assert.equal(after('-pix_fmt'), 'yuv420p');
  assert.equal(after('-r'), '25');
  assert.equal(FPS, 25);
  assert.equal(after('-t'), String(TOTAL_SEC));
  assert.equal(TOTAL_SEC, 9.5);
  assert.equal(after('-movflags'), '+faststart');
  assert.ok(
    a.join(' ').includes('anullsrc'),
    'a silent track: Instagram expects audio',
  );
});
