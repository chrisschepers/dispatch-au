import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IncidentStore } from '../store.mjs';
import { PushService } from '../push.mjs';
import { createServer } from '../server.mjs';
import {
  Dashboard,
  adminKey,
  keyMatches,
  melbourneDay,
  melbourneDayStart,
} from '../dashboard.mjs';

const KEY = 'test-admin-key-of-32-characters!';

// Everything that may never appear in a response.
const SECRETS = [];
let serial = 0;

/** One device straight into the table, with its own unmistakable secrets. */
function seed(db, over = {}) {
  serial += 1;
  const d = {
    id: `00000000-0000-4000-8000-${String(serial).padStart(12, '0')}`,
    device_id: `dispatch-secretdevice${serial}`,
    push_token: `tokensecret${serial}`.padEnd(64, 'f'),
    platform: 'ios',
    install_hash: `hashsecret${serial}`.padEnd(64, 'a'),
    lat: -37.8136 - serial / 1000,
    lon: 144.9631 + serial / 1000,
    filter: JSON.stringify({ notificationsEnabled: true }),
    app_version: '1.2.0',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
    ...over,
  };
  db.prepare(
    `INSERT INTO devices(id,device_id,push_token,platform,install_hash,lat,lon,filter,app_version,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    d.id,
    d.device_id,
    d.push_token,
    d.platform,
    d.install_hash,
    d.lat,
    d.lon,
    d.filter,
    d.app_version,
    d.created_at,
    d.updated_at,
  );
  SECRETS.push(d.id, d.device_id, d.install_hash);
  if (d.push_token) SECRETS.push(d.push_token);
  if (d.lat != null) SECRETS.push(String(d.lat), String(d.lon));
  return d;
}

function setup(env = { ADMIN_KEY: KEY }) {
  const store = new IncidentStore();
  const push = new PushService(store.db, { send: async () => [] });
  const dashboard = new Dashboard(store.db, { store, env });
  return { store, push, dashboard, db: store.db };
}

async function serve({ store, push, dashboard }, run) {
  const server = createServer(store, push, null, null, null, dashboard);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    await run(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
    store.close();
  }
}

void test('the admin key must be at least 24 characters and is compared whole', () => {
  assert.equal(adminKey({}), null);
  assert.equal(adminKey({ ADMIN_KEY: '' }), null);
  assert.equal(adminKey({ ADMIN_KEY: 'x'.repeat(23) }), null);
  assert.equal(adminKey({ ADMIN_KEY: 'x'.repeat(24) }), 'x'.repeat(24));
  assert.equal(keyMatches(KEY, KEY), true);
  assert.equal(keyMatches(KEY.slice(0, -1), KEY), false);
  assert.equal(keyMatches(`${KEY}x`, KEY), false);
  assert.equal(keyMatches('', KEY), false);
  assert.equal(keyMatches(undefined, KEY), false);
  assert.equal(keyMatches(KEY, null), false);
});

void test('without ADMIN_KEY, or with a short one, both routes are 404', async () => {
  for (const env of [{}, { ADMIN_KEY: 'short-key' }]) {
    await serve(setup(env), async (base) => {
      for (const path of ['/v1/admin/stats', '/dashboard']) {
        const res = await fetch(base + path, {
          headers: { 'x-admin-key': env.ADMIN_KEY ?? '' },
        });
        assert.equal(res.status, 404, path);
        assert.doesNotMatch(await res.text(), /devices|<html/i);
      }
    });
  }
  // A server built without the dashboard (as the other tests do) too.
  const store = new IncidentStore();
  const server = createServer(store);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    assert.equal((await fetch(`${base}/v1/admin/stats`)).status, 404);
    assert.equal((await fetch(`${base}/dashboard`)).status, 404);
  } finally {
    await new Promise((r) => server.close(r));
    store.close();
  }
});

void test('a missing or wrong key is 401, repeated wrong keys are slowed down, the right key gets the counts', async () => {
  const ctx = setup();
  seed(ctx.db);
  await serve(ctx, async (base) => {
    const get = (key, from = '203.0.113.1') =>
      fetch(`${base}/v1/admin/stats`, {
        headers: {
          'x-forwarded-for': from,
          ...(key == null ? {} : { 'x-admin-key': key }),
        },
      });
    assert.equal((await get(null)).status, 401);
    const wrong = await get(`${KEY}x`);
    assert.equal(wrong.status, 401);
    assert.doesNotMatch(await wrong.text(), /devices/);
    // The key in the query string is not accepted.
    assert.equal(
      (await fetch(`${base}/v1/admin/stats?k=${KEY}&x-admin-key=${KEY}`))
        .status,
      401,
    );
    const ok = await get(KEY);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('cache-control'), 'no-store');
    assert.match(ok.headers.get('x-robots-tag'), /noindex/);
    assert.equal(ok.headers.get('access-control-allow-origin'), null);
    assert.equal((await ok.json()).devices.total, 1);
    assert.equal(
      (await fetch(`${base}/v1/admin/stats`, { method: 'POST' })).status,
      405,
    );
    // Ten wrong keys from one client: after that it is refused unseen,
    // while another client is not affected.
    for (let i = 0; i < 10; i++)
      assert.equal((await get('nope', '198.51.100.7')).status, 401);
    const limited = await get('nope', '198.51.100.7');
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get('retry-after'), '300');
    assert.equal((await get(KEY, '198.51.100.7')).status, 429);
    assert.equal((await get(KEY)).status, 200);
  });
});

void test('the limit on wrong keys ends after five minutes', () => {
  const { dashboard, store } = setup();
  const t = Date.parse('2026-11-14T00:00:00Z');
  for (let i = 0; i < 10; i++)
    assert.equal(dashboard.check('nope', 'a', t), 'wrong');
  assert.equal(dashboard.check(KEY, 'a', t + 1000), 'limited');
  assert.equal(dashboard.check(KEY, 'a', t + 5 * 60_000 + 1), 'ok');
  store.close();
});

void test('Melbourne days across both daylight saving changes', () => {
  // 4 October 2026, 2 am: clocks go forward, UTC+10 becomes UTC+11.
  assert.equal(melbourneDay(Date.parse('2026-10-03T13:59:59Z')), '2026-10-03');
  assert.equal(melbourneDay(Date.parse('2026-10-03T14:00:00Z')), '2026-10-04');
  assert.equal(melbourneDay(Date.parse('2026-10-04T12:59:59Z')), '2026-10-04');
  assert.equal(melbourneDay(Date.parse('2026-10-04T13:00:00Z')), '2026-10-05');
  assert.equal(
    new Date(melbourneDayStart('2026-10-04')).toISOString(),
    '2026-10-03T14:00:00.000Z',
  );
  assert.equal(
    new Date(melbourneDayStart('2026-10-05')).toISOString(),
    '2026-10-04T13:00:00.000Z',
  );
  // 5 April 2026, 3 am: clocks go back, UTC+11 becomes UTC+10.
  assert.equal(
    new Date(melbourneDayStart('2026-04-05')).toISOString(),
    '2026-04-04T13:00:00.000Z',
  );
  assert.equal(
    new Date(melbourneDayStart('2026-04-06')).toISOString(),
    '2026-04-05T14:00:00.000Z',
  );
});

void test('counts from a seeded database: totals, platforms, versions, days and pushes', () => {
  const { db, dashboard, store } = setup();
  // "Now" is Tuesday 6 October 2026, 13:00 in Melbourne (UTC+11).
  const now = Date.parse('2026-10-06T02:00:00Z');

  // Around the start of daylight saving on 4 October:
  seed(db, {
    created_at: '2026-10-03T13:59:59.000Z', // 3 Oct 23:59 (+10)
    updated_at: '2026-09-20T00:00:00.000Z', // not seen for 16 days
  });
  seed(db, { created_at: '2026-10-03T14:00:00.000Z' }); // 4 Oct 00:00 (+10)
  seed(db, { created_at: '2026-10-04T12:59:59.000Z' }); // 4 Oct 23:59 (+11)
  seed(db, { created_at: '2026-10-04T13:00:00.000Z' }); // 5 Oct 00:00 (+11)
  // Today: one just after midnight in Melbourne, one a minute ago.
  seed(db, {
    created_at: '2026-10-05T13:00:00.000Z',
    updated_at: '2026-10-05T13:00:00.000Z',
    platform: 'android',
    app_version: '1.1.0',
  });
  seed(db, {
    created_at: '2026-10-06T01:59:00.000Z',
    updated_at: '2026-10-06T01:59:00.000Z',
    platform: 'android',
    app_version: '1.1.0',
    push_token: null,
  });
  // Yesterday in Melbourne, a second before today started.
  seed(db, {
    created_at: '2026-10-05T12:59:59.000Z',
    updated_at: '2026-10-05T12:59:59.000Z',
    platform: 'android',
    app_version: '1.1.0',
    filter: JSON.stringify({ notificationsEnabled: false }),
  });
  // Older: 20 days ago, 45 days ago, and before the 60 days of the chart.
  seed(db, {
    created_at: '2026-09-16T02:00:00.000Z',
    updated_at: '2026-10-02T02:00:00.000Z',
    platform: null,
    app_version: null,
    lat: null,
    lon: null,
    filter: '{}',
  });
  seed(db, {
    created_at: '2026-08-22T02:00:00.000Z',
    updated_at: '2026-08-22T02:00:00.000Z',
    platform: 'windows',
    app_version: '0.9.0',
    filter: 'not json',
  });
  seed(db, {
    created_at: '2026-07-01T02:00:00.000Z',
    updated_at: '2026-07-01T02:00:00.000Z',
    app_version: '0.9.1',
    // A token without the choice for notifications: off, as in push.mjs.
    filter: JSON.stringify({ emergencyWarningsAnywhere: true }),
  });
  // A version only two devices have, and one that is not a version at all.
  seed(db, {
    created_at: '2026-07-01T03:00:00.000Z',
    updated_at: '2026-07-01T03:00:00.000Z',
    app_version: '0.9.1',
  });
  seed(db, {
    created_at: '2026-07-01T04:00:00.000Z',
    updated_at: '2026-07-01T04:00:00.000Z',
    app_version: '<script>alert(1)</script>',
  });

  const sent = db.prepare('INSERT INTO push_sent VALUES (?,?,?,?)');
  sent.run('d1', 'i1', 0, '2026-10-05T13:00:00.000Z'); // today
  sent.run('d1', 'i2', 3, '2026-10-06T01:00:00.000Z'); // today
  sent.run('d2', 'i1', 2, '2026-10-05T12:59:59.000Z'); // yesterday
  sent.run('d2', 'i3', 1, '2026-09-30T00:00:00.000Z'); // 6 days ago
  sent.run('d3', 'i4', 0, '2026-09-28T00:00:00.000Z'); // over 7 days ago

  const s = dashboard.compute(now);
  assert.equal(s.generatedAt, '2026-10-06T02:00:00.000Z');
  assert.equal(s.timeZone, 'Australia/Melbourne');
  assert.equal(s.today, '2026-10-06');

  assert.equal(s.devices.total, 12);
  assert.deepEqual(s.devices.new, { today: 2, last7d: 7, last30d: 8 });
  assert.deepEqual(s.devices.active, { last24h: 3, last7d: 7, last30d: 8 });
  assert.deepEqual(s.devices.platforms, { ios: 7, android: 3, unknown: 2 });
  // 1.2.0 on four devices, 1.1.0 on three; 0.9.1 (two), 0.9.0 (one), the
  // script tag and the missing version (one each) are below three.
  assert.deepEqual(s.devices.versions, [
    { version: '1.2.0', devices: 4 },
    { version: '1.1.0', devices: 3 },
    { version: 'other', devices: 5 },
  ]);
  assert.equal(s.devices.withPushToken, 11);
  assert.equal(s.devices.notificationsEnabled, 7);
  assert.equal(s.devices.withLocation, 11);

  assert.equal(s.series.days, 60);
  assert.equal(s.series.daily.length, 60);
  assert.equal(s.series.daily[0].day, '2026-08-08');
  assert.equal(s.series.daily.at(-1).day, '2026-10-06');
  assert.equal(s.series.snapshotsSince, null);
  const day = (d) => s.series.daily.find((x) => x.day === d);
  assert.equal(day('2026-10-03').new, 1);
  assert.equal(day('2026-10-04').new, 2);
  assert.equal(day('2026-10-05').new, 2);
  assert.equal(day('2026-10-06').new, 2);
  assert.equal(day('2026-09-16').new, 1);
  assert.equal(day('2026-08-22').new, 1);
  // Three devices are older than the chart; the line starts above them.
  assert.equal(s.series.daily[0].total, 3);
  assert.equal(day('2026-08-22').total, 4);
  assert.equal(day('2026-10-03').total, 6);
  assert.equal(day('2026-10-04').total, 8);
  assert.equal(day('2026-10-05').total, 10);
  assert.equal(day('2026-10-06').total, 12);
  assert.equal(day('2026-10-06').active24h, null);
  assert.equal(
    s.series.daily.reduce((n, d) => n + d.new, 0),
    9,
  );

  assert.equal(s.pushes.today, 2);
  assert.equal(s.pushes.last7d, 4);
  assert.deepEqual(s.pushes.byRank7d, {
    incident: 1,
    advice: 1,
    watchAndAct: 1,
    emergencyWarning: 1,
  });
  assert.deepEqual(s.sources.map((x) => x.region).sort(), [
    'act',
    'nsw',
    'qld',
    'sa',
    'vic',
  ]);
  assert.ok(s.sources.every((x) => x.state === 'unavailable'));
  assert.deepEqual(s.stores, { connected: false });
  store.close();
});

void test('nothing per device is in the response', async () => {
  const ctx = setup();
  for (let i = 0; i < 5; i++)
    seed(ctx.db, {
      created_at: new Date(Date.now() - i * 3600_000).toISOString(),
      updated_at: new Date().toISOString(),
      app_version: i < 2 ? '9.9.9' : '1.2.0',
    });
  ctx.dashboard.snapshot();
  await serve(ctx, async (base) => {
    const res = await fetch(`${base}/v1/admin/stats`, {
      headers: { 'x-admin-key': KEY },
    });
    assert.equal(res.status, 200);
    const text = await res.text();
    assert.equal(JSON.parse(text).devices.total, 5);
    for (const secret of SECRETS)
      assert.equal(text.includes(secret), false, `leaked ${secret}`);
    // Not the admin key either, nor a field that could carry a device.
    assert.equal(text.includes(KEY), false);
    assert.doesNotMatch(
      text,
      /"push_?token"|device_?id|install_?hash|"lat"|"lon"|"filter"|ExponentPushToken|-37\.8|144\.9/i,
    );
    // The version two devices have is not named.
    assert.equal(text.includes('9.9.9'), false);
  });
});

void test('the numbers are computed at most once a minute', () => {
  const { db, dashboard, store } = setup();
  const now = Date.parse('2026-10-06T02:00:00Z');
  seed(db);
  const first = dashboard.stats(now);
  seed(db);
  assert.equal(dashboard.stats(now + 59_000), first, 'the same object');
  assert.equal(dashboard.stats(now + 59_000).devices.total, 1);
  const later = dashboard.stats(now + 61_000);
  assert.equal(later.devices.total, 2);
  assert.equal(later.generatedAt, '2026-10-06T02:01:01.000Z');
  store.close();
});

void test('the daily snapshot is idempotent and keeps history when a device goes', () => {
  const { db, dashboard, store } = setup();
  const now = Date.parse('2026-10-06T02:00:00Z');
  const rows = () =>
    db
      .prepare('SELECT * FROM daily_stats ORDER BY day')
      .all()
      .map((r) => ({ ...r }));
  const a = seed(db, {
    created_at: '2026-10-05T14:00:00.000Z',
    updated_at: '2026-10-05T14:00:00.000Z',
  });
  seed(db, {
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-06T01:00:00.000Z',
  });
  db.prepare('INSERT INTO push_sent VALUES (?,?,?,?)').run(
    a.id,
    'i1',
    0,
    '2026-10-05T15:00:00.000Z',
  );

  dashboard.snapshot(now);
  const once = rows();
  assert.deepEqual(once, [
    {
      day: '2026-10-06',
      devices_total: 2,
      devices_new: 1,
      devices_active_24h: 2,
      pushes_sent: 1,
    },
  ]);
  dashboard.snapshot(now);
  dashboard.snapshot(now);
  assert.deepEqual(rows(), once, 'the same row after running it again');

  // The next day. A device registered at 23:30, after the day's last
  // snapshot: yesterday's row still gets it.
  const next = now + 24 * 3600_000;
  seed(db, {
    created_at: '2026-10-06T12:30:00.000Z',
    updated_at: '2026-10-06T12:30:00.000Z',
  });
  dashboard.snapshot(next);
  const brief = () =>
    rows().map((r) => [r.day, r.devices_new, r.devices_total]);
  assert.deepEqual(brief(), [
    ['2026-10-06', 2, 2],
    ['2026-10-07', 0, 3],
  ]);

  // A device from yesterday is removed: the table forgets it, the day does not.
  db.prepare('DELETE FROM devices WHERE id=?').run(a.id);
  dashboard.snapshot(next + 3600_000);
  assert.deepEqual(brief(), [
    ['2026-10-06', 2, 2],
    ['2026-10-07', 0, 2],
  ]);
  const s = dashboard.compute(next + 3600_000);
  assert.equal(s.devices.total, 2);
  assert.equal(s.series.snapshotsSince, '2026-10-06');
  const day = (d) => s.series.daily.find((x) => x.day === d);
  assert.equal(day('2026-10-06').new, 2);
  assert.equal(day('2026-10-06').total, 2);
  assert.equal(day('2026-10-06').active24h, 2);
  assert.equal(day('2026-10-06').pushes, 1);
  assert.equal(day('2026-10-07').new, 0);
  assert.equal(day('2026-10-07').total, 2);
  assert.equal(day('2026-10-05').active24h, null);
  store.close();
});

void test('the dashboard page holds no data, loads nothing from elsewhere and is locked down', async () => {
  const ctx = setup();
  seed(ctx.db, { app_version: '7.7.7' });
  seed(ctx.db, { app_version: '7.7.7' });
  seed(ctx.db, { app_version: '7.7.7' });
  await serve(ctx, async (base) => {
    // The page needs no key and is the same with a wrong one.
    const res = await fetch(`${base}/dashboard`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/html/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.match(res.headers.get('x-robots-tag'), /noindex/);
    assert.equal(res.headers.get('access-control-allow-origin'), null);
    const csp = res.headers.get('content-security-policy');
    assert.match(csp, /default-src 'none'/);
    assert.match(csp, /connect-src 'self'/);
    assert.match(csp, /script-src 'sha256-[A-Za-z0-9+/=]+'(;|$)/);
    assert.match(csp, /style-src 'sha256-[A-Za-z0-9+/=]+'(;|$)/);
    assert.doesNotMatch(csp, /https?:|\*|unsafe-eval/);
    const html = await res.text();

    // The policy's hashes are those of the page's own style and script.
    const { createHash } = await import('node:crypto');
    const sha = (t) => createHash('sha256').update(t).digest('base64');
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    const style = html.match(/<style>([\s\S]*?)<\/style>/)[1];
    assert.ok(csp.includes(`script-src 'sha256-${sha(script)}'`));
    assert.ok(csp.includes(`style-src 'sha256-${sha(style)}'`));
    assert.equal(html.match(/<script/g).length, 1);
    assert.equal(html.match(/<style/g).length, 1);

    // Nothing from elsewhere: no URL with a host, no src/href, no imports.
    assert.doesNotMatch(html, /https?:\/\/|\/\/[a-z0-9-]+\.[a-z]/i);
    assert.doesNotMatch(html, /\s(src|href|srcset|action)\s*=/i);
    assert.doesNotMatch(html, /@import|url\(|<link|<iframe|<img/i);
    // No inline handlers or style attributes: the policy would block them.
    assert.doesNotMatch(html, /\son[a-z]+\s*=|\sstyle\s*=/i);

    // No data: not the key, no seeded value, no number from the database.
    assert.equal(html.includes(KEY), false);
    assert.equal(html.includes('7.7.7'), false);
    for (const secret of SECRETS)
      assert.equal(html.includes(secret), false, `leaked ${secret}`);
    const again = await (
      await fetch(`${base}/dashboard`, { headers: { 'x-admin-key': 'nope' } })
    ).text();
    assert.equal(again, html);

    // What the page promises to say.
    assert.match(html, /Stores/);
    assert.match(html, /Not connected yet/);
    assert.match(html, /at every start until that has succeeded once/);
    assert.match(html, /sessionStorage/);
    assert.match(html, /history\.replaceState/);

    // A trailing slash or capitals go to the one address.
    const slash = await fetch(`${base}/Dashboard/`, { redirect: 'manual' });
    assert.equal(slash.status, 301);
    assert.equal(slash.headers.get('location'), '/dashboard');
  });
});
