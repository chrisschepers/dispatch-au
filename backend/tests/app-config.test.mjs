import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appConfig, KAART_TERUGBLIK_UREN } from '../app-config.mjs';

void test('map windows: longer for non-fire services, overridable without an app release (30-10)', () => {
  const c = appConfig({});
  assert.equal(c.region, 'au');
  assert.deepEqual(c.kaartTerugblikUren, KAART_TERUGBLIK_UREN);
  assert.equal(c.kaartTerugblikUren.Ambulance, 24);
  assert.equal(appConfig({ KAART_TERUGBLIK_UREN: '{"Ambulance":12}' }).kaartTerugblikUren.Ambulance, 12);
  assert.equal(appConfig({ KAART_TERUGBLIK_UREN: 'kapot' }).kaartTerugblikUren.Fire, 72);
});
