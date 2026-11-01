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

void test('RevenueCat paywall sheet stays off until switched on in Railway (01-11, Guideline 3.1.2)', () => {
  assert.equal(appConfig({}).revenueCatPaywall, false);
  for (const uit of ['', 'uit', 'off', 'false', '0', 'ja']) {
    assert.equal(appConfig({ REVENUECAT_PAYWALL: uit }).revenueCatPaywall, false, uit);
  }
  for (const aan of ['aan', 'AAN', ' on ', 'true', '1']) {
    assert.equal(appConfig({ REVENUECAT_PAYWALL: aan }).revenueCatPaywall, true, aan);
  }
  // A broken map override must not switch the paywall on.
  assert.equal(appConfig({ KAART_TERUGBLIK_UREN: 'kapot' }).revenueCatPaywall, false);
});
