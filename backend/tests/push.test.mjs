import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { PushService, fits, levelRank, messageFor } from '../push.mjs';

const MELBOURNE = { lat: -37.81, lon: 144.96 };
const now = Date.parse('2026-10-19T10:00:00Z');
const row = (over = {}) => ({
  id: 'act:incident:1', title: 'Grass fire', status: 'Responding', category: 'fire',
  location: 'Lancefield Rd, Kilmore', point: [-37.3, 144.95], level: null,
  created: '2026-10-19T09:55:00Z', ...over,
});

function service() {
  const sent = [];
  const push = new PushService(new DatabaseSync(':memory:'), { send: async (items) => { sent.push(...items); return []; } });
  return { push, sent };
}

function device(push, filter) {
  const { id } = push.register({ deviceId: 'dispatch-test-1', pushToken: 'a'.repeat(64), ...MELBOURNE });
  push.setFilter(id, { notificationsEnabled: true, ...filter });
  return id;
}

test('warning levels rank Advice < Watch and Act < Emergency Warning', () => {
  assert.equal(levelRank(null), 0);
  assert.equal(levelRank('Advice'), 1);
  assert.equal(levelRank('Watch and Act'), 2);
  assert.equal(levelRank('Emergency Warning'), 3);
});

test('first round only learns, a new incident inside the radius is sent once', async () => {
  const { push, sent } = service();
  device(push, { radiusKm: 80 });
  await push.process('act', { incidents: [row({ id: 'act:incident:0' })], warnings: [] }, now);
  assert.equal(sent.length, 0);
  await push.process('act', { incidents: [row({ id: 'act:incident:0' }), row()], warnings: [] }, now);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].msg.title, 'Grass fire in Kilmore');
  assert.deepEqual(sent[0].msg.data, { incidentId: 'act:incident:1' });
  await push.process('act', { incidents: [row({ id: 'act:incident:0' }), row()], warnings: [] }, now);
  assert.equal(sent.length, 1, 'no second alert for the same incident');
});

test('outside the radius, switched-off service or old incident: no alert', async () => {
  const d = { lat: MELBOURNE.lat, lon: MELBOURNE.lon, filter: { notificationsEnabled: true, radiusKm: 20, services: [], radiusPerService: {} } };
  assert.equal(fits(d, row()), false, '57 km away with 20 km radius');
  assert.equal(fits({ ...d, filter: { ...d.filter, radiusPerService: { Fire: 100 } } }, row()), true);
  assert.equal(fits({ ...d, filter: { ...d.filter, radiusKm: 100, services: ['Rescue'] } }, row()), false);
  assert.equal(fits({ ...d, filter: { ...d.filter, radiusKm: 100, notificationsEnabled: false } }, row()), false);
  assert.equal(fits({ ...d, filter: { ...d.filter, radiusKm: 100, warningsOnly: true } }, row()), false);
});

test('Emergency Warnings anywhere reach devices with alerts off', () => {
  const d = { lat: -33.8, lon: 151.2, filter: { notificationsEnabled: false, emergencyWarningsAnywhere: true } };
  assert.equal(fits(d, row({ level: 'Emergency Warning' })), true);
  assert.equal(fits(d, row({ level: 'Watch and Act' })), false);
});

test('a higher warning level is sent as an upgrade', async () => {
  const { push, sent } = service();
  device(push, { radiusKm: 80 });
  await push.process('act', { incidents: [row()], warnings: [] }, now);
  await push.process('act', { incidents: [row({ level: 'Watch and Act' })], warnings: [] }, now);
  assert.equal(sent.length, 1);
  assert.match(sent[0].msg.title, /^Watch and Act: Grass fire in Kilmore/);
});

test('filter changes need the installation token', () => {
  const { push } = service();
  const { id, installationToken } = push.register({ deviceId: 'dispatch-test-2', pushToken: '' });
  assert.equal(push.authorised(id, installationToken), true);
  assert.equal(push.authorised(id, 'wrong'), false);
  assert.ok(messageFor(row(), { lat: -37.81, lon: 144.96 }).body.includes('km'));
});
