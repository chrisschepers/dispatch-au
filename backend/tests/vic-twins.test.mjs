import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IncidentStore } from '../store.mjs';

const row = (n, extra = {}) => ({
  id: `vic:incident:ESTA:${n}`,
  sourceId: `ESTA:${n}`,
  sourceFeed: 'esta-cad-event',
  kind: 'incident',
  agency: 'VIC/ESTA',
  title: 'Structure Fire',
  location: 'Ulm St, Laverton',
  created: '2026-11-22T03:00:00.000Z',
  updated: '2026-11-22T03:00:00.000Z',
  status: 'Responding',
  category: 'fire',
  point: [-37.86, 144.77],
  geometry: null,
  resources: 1,
  level: null,
  action: null,
  ...extra,
});
const snap = (incidents, at = '2026-11-22T03:10:00.000Z') => ({
  incidents,
  warnings: [],
  fetchedAt: at,
  stale: false,
});
const ids = (feed) => feed.incidents.map((r) => r.sourceId.slice(5));
const round = (s, feed) => {
  const kept = s.withoutTwins('vic', feed);
  s.ingest('vic', kept);
  return kept;
};

void test('Victoria: one call listed four times is shown once', () => {
  const s = new IncidentStore(':memory:');
  const kept = round(
    s,
    snap([
      row(4, { created: '2026-11-22T03:08:00.000Z' }),
      row(1),
      row(2, { created: '2026-11-22T03:02:00.000Z', agency: 'VIC/CFA' }),
      row(3, { created: '2026-11-22T03:05:00.000Z' }),
    ]),
  );
  assert.deepEqual(ids(kept), ['1']);
  assert.equal(
    s.feed('vic', 24, Date.parse('2026-11-22T03:10:00.000Z')).incidents.length,
    1,
  );
  s.close();
});

void test('Victoria: the row we already show stays when a repeat arrives', () => {
  const s = new IncidentStore(':memory:');
  round(s, snap([row(5, { created: '2026-11-22T03:04:00.000Z' })]));
  // The repeat has an earlier call time, but row 5 was shown and alerted.
  const later = round(
    s,
    snap(
      [row(5, { created: '2026-11-22T03:04:00.000Z' }), row(1)],
      '2026-11-22T03:12:00.000Z',
    ),
  );
  assert.deepEqual(ids(later), ['5']);
  // The first row has left the list; a repeat is still recognised.
  const gone = round(
    s,
    snap(
      [row(6, { created: '2026-11-22T03:15:00.000Z' })],
      '2026-11-22T03:16:00.000Z',
    ),
  );
  assert.deepEqual(ids(gone), []);
  // Hours later the repeat is still listed: it stays hidden, no late alert.
  const hours = round(
    s,
    snap(
      [row(6, { created: '2026-11-22T03:15:00.000Z' })],
      '2026-11-22T07:00:00.000Z',
    ),
  );
  assert.deepEqual(ids(hours), []);
  s.close();
});

void test('Victoria: separate calls are never merged', () => {
  for (const other of [
    // The same address hours later: a new alarm.
    row(2, { created: '2026-11-22T05:00:00.000Z' }),
    // Another kind of call in the same street.
    row(2, { title: 'Road Accident' }),
    // Another street, or the same street name far away.
    row(2, { location: 'High St, Laverton' }),
    row(2, { point: [-37.88, 144.77] }),
    // No place to compare.
    row(2, { point: null }),
  ]) {
    const s = new IncidentStore(':memory:');
    assert.equal(round(s, snap([row(1), other])).incidents.length, 2);
    s.close();
  }
  // Without a street it is only a suburb: in a storm those are different trees.
  const tree = (n) => row(n, { title: 'Tree Down', location: 'Harrietville' });
  const s = new IncidentStore(':memory:');
  assert.equal(round(s, snap([tree(1), tree(2)])).incidents.length, 2);
  // Other states and a delayed source are left alone.
  const feed = snap([row(1), row(2)]);
  assert.equal(s.withoutTwins('nsw', feed), feed);
  const stale = { ...feed, stale: true };
  assert.equal(s.withoutTwins('vic', stale), stale);
  s.close();
});
