import { test } from 'node:test';
import assert from 'node:assert/strict';
import { skipCounter } from '../skipped.mjs';
import { parseNSW, parseQLD } from '../regional.mjs';
import { parseACT } from '../feeds.mjs';

// 30-10-2026: one malformed SA alert stopped all of South Australia for 21
// hours. A bad record is now skipped and counted; only a snapshot in which
// every record is rejected still fails (the format itself has changed).
const now = '2026-10-30T16:00:00.000Z';
const collection = (features) => ({ type: 'FeatureCollection', features });
const nsw = (id) => ({
  properties: {
    guid: `https://incidents.rfs.nsw.gov.au/api/v1/incidents/${id}`,
    title: 'Test',
    category: 'Advice',
    description: 'TYPE: Bush Fire<br />LOCATION: Test suburb<br />STATUS: Under control',
  },
  geometry: { type: 'Point', coordinates: [151, -33] },
});

void test('skip counter: counts reasons and only fails when every record is rejected', () => {
  const c = skipCounter();
  assert.equal(c.summary(), null);
  c.skip('Missing ID');
  c.skip('Missing ID');
  assert.deepEqual(c.summary(), { count: 2, reasons: { 'Missing ID': 2 } });
  assert.doesNotThrow(() => c.check(3, 'NSW'));
  assert.throws(() => c.check(2, 'NSW'), /Every NSW record rejected: Missing ID/);
  assert.doesNotThrow(() => skipCounter().check(0, 'NSW'));
});

void test('NSW: one record without an ID no longer drops the whole state', () => {
  const f = parseNSW(collection([nsw(1), { properties: {} }, nsw(2)]), now);
  assert.equal(f.incidents.length, 2);
  assert.deepEqual(f.skipped, { count: 1, reasons: { 'Missing NSW incident ID': 1 } });
  assert.throws(() => parseNSW(collection([{ properties: {} }]), now));
});

void test('Queensland: a duplicate ID is skipped, the rest is kept', () => {
  const qld = (id) => ({
    properties: { UniqueID: id, GroupedType: 'FIRE VEGETATION', CurrentStatus: 'Going', Locality: 'Test', PublishDateLocal_ISO: now, ItemDateTimeLocal_ISO: now },
    geometry: { type: 'Point', coordinates: [152, -27] },
  });
  const f = parseQLD(collection([qld('A1'), qld('A1'), qld('A2')]), now);
  assert.equal(f.incidents.length + f.warnings.length, 2);
  assert.deepEqual(f.skipped, { count: 1, reasons: { 'Duplicate Queensland ID': 1 } });
});

void test('ACT: an incomplete item is skipped, the rest is kept', () => {
  const ok = '<item><cadid>test-1</cadid><type>AMBULANCE RESPONSE</type><agency>Ambulance</agency><description>Suburb: TEST SUBURB</description></item>';
  const kapot = '<item><cadid>test-2</cadid><agency>Ambulance</agency></item>';
  const xml = `<?xml version="1.0"?><rss version="2.0" xmlns:georss="http://www.georss.org/georss"><channel><title>ACT ESA</title>${ok}${kapot}</channel></rss>`;
  const f = parseACT(xml, now);
  assert.equal(f.incidents.length, 1);
  assert.deepEqual(f.skipped, { count: 1, reasons: { 'Incomplete ACT incident': 1 } });
});
