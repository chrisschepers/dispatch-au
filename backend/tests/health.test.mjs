import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IncidentStore } from '../store.mjs';
import { createServer } from '../server.mjs';
const t = Date.parse('2026-10-19T19:00:00Z');
const iso = (offset = 0) => new Date(t + offset).toISOString();
const empty = (offset = 0) => ({
  incidents: [],
  warnings: [],
  fetchedAt: iso(offset),
  stale: false,
});

void test('empty and unchanged valid snapshots are healthy; stopped collectors age out per source', () => {
  const s = new IncidentStore();
  s.ingest('vic', empty());
  s.ingest('nsw', empty());
  assert.equal(s.health('vic', t + 299999).alert, false);
  assert.equal(s.health('vic', t + 300001).alert, true);
  assert.equal(s.health('nsw', t + 300001).alert, false);
  s.ingest('vic', empty(600000));
  assert.equal(s.health('vic', t + 600000).stale, false);
  s.close();
});
void test('failures before first snapshot persist across restart, escalate once repeated, and recover only after valid ingestion', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-health-'));
  try {
    const db = join(dir, 'history.sqlite');
    let s = new IncidentStore(db);
    s.fail('sa', 'Invalid format', iso());
    assert.equal(s.health('sa', t).ready, false);
    assert.equal(s.health('sa', t).alert, false);
    s.fail('sa', 'Invalid format', iso(300000));
    s.close();
    s = new IncidentStore(db);
    s.ingest('sa', { ...empty(600000), stale: true });
    assert.equal(s.health('sa', t + 600000).consecutiveFailures, 3);
    assert.equal(s.health('sa', t + 600000).alert, true);
    s.ingest('sa', empty(900000));
    const health = s.health('sa', t + 900000);
    assert.equal(health.state, 'healthy');
    assert.equal(health.alert, false);
    assert.equal(health.consecutiveFailures, 0);
    assert.equal(health.firstFailureAt, null);
    assert.equal(health.error, null);
    s.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
void test('readiness separates upstream health from process liveness without caching status', async () => {
  const s = new IncidentStore();
  const server = createServer(s);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/health')).status, 200);
    assert.equal((await fetch(base + '/health/ready')).status, 503);
    const response = await fetch(base + '/v1/status');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const status = await response.json();
    assert.equal(status.ok, false);
    assert.equal(status.sources.length, 5);
    assert.ok(Number.isFinite(Date.parse(status.checkedAt)));
    for (const region of ['vic', 'act', 'nsw', 'qld', 'sa'])
      s.ingest(region, { ...empty(), fetchedAt: new Date().toISOString() });
    assert.equal((await fetch(base + '/health/ready')).status, 200);
  } finally {
    await new Promise((r) => server.close(r));
    s.close();
  }
});
