import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { PushService, fits, levelRank, messageFor } from '../push.mjs';

const MELBOURNE = { lat: -37.81, lon: 144.96 };
const now = Date.parse('2026-10-19T10:00:00Z');
const row = (over = {}) => ({
  id: 'act:incident:1',
  title: 'Grass fire',
  status: 'Responding',
  category: 'fire',
  location: 'Lancefield Rd, Kilmore',
  point: [-37.3, 144.95],
  level: null,
  created: '2026-10-19T09:55:00Z',
  ...over,
});

function service() {
  const sent = [];
  const push = new PushService(new DatabaseSync(':memory:'), {
    send: async (items) => {
      sent.push(...items);
      return [];
    },
  });
  return { push, sent };
}

function device(push, filter) {
  const { id } = push.register({
    deviceId: 'dispatch-test-1',
    pushToken: 'a'.repeat(64),
    ...MELBOURNE,
  });
  push.setFilter(id, { notificationsEnabled: true, ...filter });
  return id;
}

void test('warning levels rank Advice < Watch and Act < Emergency Warning', () => {
  assert.equal(levelRank(null), 0);
  assert.equal(levelRank('Advice'), 1);
  assert.equal(levelRank('Watch and Act'), 2);
  assert.equal(levelRank('Emergency Warning'), 3);
});

void test('first round only learns, a new incident inside the radius is sent once', async () => {
  const { push, sent } = service();
  device(push, { radiusKm: 80 });
  await push.process(
    'act',
    { incidents: [row({ id: 'act:incident:0' })], warnings: [] },
    now,
  );
  assert.equal(sent.length, 0);
  await push.process(
    'act',
    { incidents: [row({ id: 'act:incident:0' }), row()], warnings: [] },
    now,
  );
  assert.equal(sent.length, 1);
  assert.equal(sent[0].msg.title, 'Grass fire in Kilmore');
  assert.deepEqual(sent[0].msg.data, { incidentId: 'act:incident:1' });
  await push.process(
    'act',
    { incidents: [row({ id: 'act:incident:0' }), row()], warnings: [] },
    now,
  );
  assert.equal(sent.length, 1, 'no second alert for the same incident');
});

void test('outside the radius, switched-off service or old incident: no alert', async () => {
  const d = {
    lat: MELBOURNE.lat,
    lon: MELBOURNE.lon,
    filter: {
      notificationsEnabled: true,
      radiusKm: 20,
      services: [],
      radiusPerService: {},
    },
  };
  assert.equal(fits(d, row()), false, '57 km away with 20 km radius');
  assert.equal(
    fits(
      { ...d, filter: { ...d.filter, radiusPerService: { Fire: 100 } } },
      row(),
    ),
    true,
  );
  assert.equal(
    fits(
      { ...d, filter: { ...d.filter, radiusKm: 100, services: ['Rescue'] } },
      row(),
    ),
    false,
  );
  assert.equal(
    fits(
      {
        ...d,
        filter: { ...d.filter, radiusKm: 100, notificationsEnabled: false },
      },
      row(),
    ),
    false,
  );
  assert.equal(
    fits(
      { ...d, filter: { ...d.filter, radiusKm: 100, warningsOnly: true } },
      row(),
    ),
    false,
  );
});

void test('Emergency Warnings anywhere reach devices with alerts off', () => {
  const d = {
    lat: -33.8,
    lon: 151.2,
    filter: { notificationsEnabled: false, emergencyWarningsAnywhere: true },
  };
  assert.equal(fits(d, row({ level: 'Emergency Warning' })), true);
  assert.equal(fits(d, row({ level: 'Watch and Act' })), false);
});

void test('a higher warning level is sent as an upgrade', async () => {
  const { push, sent } = service();
  device(push, { radiusKm: 80 });
  await push.process('act', { incidents: [row()], warnings: [] }, now);
  await push.process(
    'act',
    { incidents: [row({ level: 'Watch and Act' })], warnings: [] },
    now,
  );
  assert.equal(sent.length, 1);
  assert.match(sent[0].msg.title, /^Watch and Act: Grass fire in Kilmore/);
});

void test('filter changes need the installation token', () => {
  const { push } = service();
  const { id, installationToken } = push.register({
    deviceId: 'dispatch-test-2',
    pushToken: '',
  });
  assert.equal(push.authorised(id, installationToken), true);
  assert.equal(push.authorised(id, 'wrong'), false);
  assert.ok(
    messageFor(row(), { lat: -37.81, lon: 144.96 }).body.includes('km'),
  );
});

void test('Android FCM tokens go to FCM v1 with the sound channel, and unregistered tokens are dropped', async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = {
    project_id: 'demo-project',
    client_email: 'push@demo-project.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
  const push = new PushService(new DatabaseSync(':memory:'), {
    env: { FCM_SERVICE_ACCOUNT: JSON.stringify(sa) },
  });
  const calls = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href =
      typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
    calls.push({ url: href, body: init?.body });
    if (href.includes('oauth2'))
      return new Response(JSON.stringify({ access_token: 'tok' }));
    const token = JSON.parse(init.body).message.token;
    return token === 'gone:APA91'
      ? new Response(
          '{"error":{"status":"NOT_FOUND","details":[{"errorCode":"UNREGISTERED"}]}}',
          { status: 404 },
        )
      : new Response('{"name":"ok"}');
  };
  try {
    const msg = {
      title: 'Grass fire in Kilmore',
      body: 'Lancefield Rd',
      data: { incidentId: 'vic:1' },
    };
    const dead = await push.send([
      { token: 'live:APA91', msg, sound: 'pager' },
      { token: 'gone:APA91', msg, sound: null },
    ]);
    assert.deepEqual(dead, ['gone:APA91']);
    const sent = calls.filter((c) => c.url.includes('fcm.googleapis.com'));
    assert.equal(sent.length, 2);
    assert.match(sent[0].url, /projects\/demo-project\/messages:send/);
    const m = JSON.parse(sent[0].body).message;
    assert.equal(m.android.notification.channel_id, 'dispatch_snd_pager');
    assert.equal(m.data.incidentId, 'vic:1');
  } finally {
    globalThis.fetch = realFetch;
  }
});
