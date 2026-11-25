import assert from 'node:assert/strict';
import { test } from 'node:test';
import { magVragen, MIN_KEREN, VRAAG } from '../src/recensieRegels.ts';

const DAG = 24 * 3600 * 1000;
const nu = Date.UTC(2026, 10, 25);

test('asks only after a few opens and a few days, then not for months', () => {
  assert.equal(magVragen({ keren: MIN_KEREN - 1, eerste: nu - 10 * DAG, gevraagd: null }, nu), false);
  assert.equal(magVragen({ keren: MIN_KEREN, eerste: nu - 1 * DAG, gevraagd: null }, nu), false);
  assert.equal(magVragen({ keren: MIN_KEREN, eerste: nu - 2 * DAG, gevraagd: null }, nu), true);
  assert.equal(magVragen({ keren: 20, eerste: nu - 50 * DAG, gevraagd: nu - 30 * DAG }, nu), false);
  assert.equal(magVragen({ keren: 20, eerste: nu - 200 * DAG, gevraagd: nu - 121 * DAG }, nu), true);
});

test('the question offers rating and feedback side by side, without asking whether people like the app', () => {
  assert.match(VRAAG.tekst, /just started/);
  assert.match(VRAAG.tekst, /feedback is more than welcome/);
  assert.doesNotMatch(VRAAG.tekst + VRAAG.titel, /\?/);
  assert.ok(VRAAG.beoordelen && VRAAG.feedback && VRAAG.later);
});
