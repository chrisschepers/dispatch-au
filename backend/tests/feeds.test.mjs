import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseACT, actDate } from '../feeds.mjs';
import { IncidentStore } from '../store.mjs';
import { createServer } from '../server.mjs';

const xml = (body = '') =>
  `<rss><channel><title>ACT incidents</title>${body}</channel></rss>`;
const item = `<item><cadid>test-1</cadid><type>AMBULANCE RESPONSE</type><agency>Ambulance</agency><description>Suburb: TEST SUBURB
Location: PRIVATE DETAIL
Time of Call: 11 Sep 2026 23:30:00
Updated: 12 Sep 2026 00:00:00</description><resourceStatus>On Scene</resourceStatus><georss:point>-35.3 149.1</georss:point></item>`;
const t0 = '2026-09-11T14:00:00.000Z';
const snapshot = (body = item, t = t0) => ({
  ...parseACT(xml(body), t),
  receivedAt: t,
});

void test('ACT parser retains useful dispatch metadata, deduplicates and omits private free text', () => {
  const rows = snapshot(item + item).incidents;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, 'ambulance');
  assert.equal(rows[0].created, '2026-09-11T13:30:00.000Z');
  assert.equal(rows[0].updated, t0);
  assert.deepEqual(rows[0].point, [-35.3, 149.1]);
  assert.equal(JSON.stringify(rows).includes('PRIVATE DETAIL'), false);
  assert.equal(rows[0].location, 'TEST SUBURB');
});
void test('Canberra call dates account for summer time and reject nonexistent DST times', () => {
  assert.equal(actDate('01 Jan 2026 12:00:00'), '2026-01-01T01:00:00.000Z');
  assert.equal(actDate('01 Jul 2026 12:00:00'), '2026-07-01T02:00:00.000Z');
  assert.equal(actDate('04 Oct 2026 02:30:00'), null);
  assert.equal(actDate('31 Feb 2026 12:00:00'), null);
});
void test('invalid and entity-bearing XML cannot replace a source snapshot', () => {
  for (const input of [
    '<html>offline</html>',
    xml('<item><type>Fire</type></item>'),
    '<!DOCTYPE rss [<!ENTITY x "test">]>' + xml(),
  ])
    assert.throws(() => parseACT(input));
  assert.deepEqual(parseACT(xml()).incidents, []);
});
void test('history survives restart, preserves reported time, and disappearance never means resolved', () => {
  const dir = mkdtempSync(join(tmpdir(), 'dispatch-history-'));
  try {
    let s = new IncidentStore(join(dir, 'db.sqlite'));
    s.ingest('act', snapshot());
    s.close();
    s = new IncidentStore(join(dir, 'db.sqlite'));
    const t1 = '2026-09-11T14:01:00.000Z';
    s.ingest('act', snapshot('', t1));
    const f = s.feed('act', 24, Date.parse(t1));
    assert.equal(f.incidents.length, 1);
    assert.equal(f.incidents[0].listed, false);
    assert.equal(f.incidents[0].status, 'On Scene');
    assert.equal(f.incidents[0].firstSeen, t0);
    assert.equal(f.incidents[0].created, '2026-09-11T13:30:00.000Z');
    assert.equal(
      s.feed('act', 24, Date.parse(t0) + 25 * 3600000).incidents.length,
      0,
    );
    s.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
void test('failed or stale sources retain latest records and do not mark them removed', () => {
  const s = new IncidentStore();
  s.ingest('act', snapshot());
  assert.equal(s.ingest('act', { ...snapshot(''), stale: true }), false);
  const f = s.feed('act', 24, Date.parse(t0));
  assert.equal(f.stale, true);
  assert.equal(f.incidents[0].listed, true);
  s.close();
});
void test('historical warnings are omitted, current warnings remain', () => {
  const s = new IncidentStore();
  const feed = snapshot();
  const warning = {
    ...feed.incidents[0],
    id: 'act:warning:1',
    kind: 'warning',
  };
  s.ingest('act', { ...feed, warnings: [warning] });
  assert.equal(s.feed('act', 24, Date.parse(t0)).warnings.length, 1);
  s.ingest('act', snapshot('', '2026-09-11T14:01:00Z'));
  assert.equal(s.feed('act', 24, Date.parse(t0)).warnings.length, 0);
  s.close();
});
void test('API isolates regions and validates inputs; restart readiness does not pretend source freshness', async () => {
  const s = new IncidentStore();
  s.ingest('act', snapshot());
  const server = createServer(s);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await fetch(base + '/v1/feed?region=vic')).status, 503);
    assert.equal((await fetch(base + '/v1/feed?region=unknown')).status, 400);
    assert.equal((await fetch(base + '/v1/feed?hours=999')).status, 400);
    const f = await (await fetch(base + '/v1/feed?region=act')).json();
    assert.equal(f.region, 'act');
    assert.equal(
      (await fetch(base + '/v1/feed', { method: 'POST' })).status,
      405,
    );
  } finally {
    await new Promise((r) => server.close(r));
    s.close();
  }
});

void test('ACT numeric XML carriage returns are decoded before extracting dates and suburb', () => {
  const encoded = item.replaceAll('\n', '&#xD;\n');
  const row = parseACT(xml(encoded)).incidents[0];
  assert.equal(row.location, 'TEST SUBURB');
  assert.equal(row.created, '2026-09-11T13:30:00.000Z');
  assert.equal(row.updated, t0);
});

void test('legacy ACT text repair preserves historical observations and status', () => {
  const s = new IncidentStore();
  const f = snapshot();
  f.incidents[0].location = 'TEST SUBURB&#xD;';
  s.ingest('act', f);
  s.ingest('act', snapshot('', '2026-09-11T14:01:00.000Z'));
  s.repairLegacyACTText();
  const row = s.feed('act', 24, Date.parse(t0)).incidents[0];
  assert.equal(row.location, 'TEST SUBURB');
  assert.equal(row.firstSeen, t0);
  assert.equal(row.lastSeen, t0);
  assert.equal(row.listed, false);
  assert.equal(row.status, 'On Scene');
  s.close();
});
