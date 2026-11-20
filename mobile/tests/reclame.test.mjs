import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reclameNa, reclameOnderMelding, RECLAME_ELKE } from '../src/reclameRegels.ts';

const rij = (id, niveau = 0) => ({ id, niveau });
const na = (rijen, elke) => [...reclameNa(rijen, (r) => r.niveau, (r) => r.id, elke)];

test('an ad after every eighth incident', () => {
  const rijen = Array.from({ length: 20 }, (_, i) => rij(`m${i + 1}`));
  assert.equal(RECLAME_ELKE, 8);
  assert.deepEqual(na(rijen), ['m8', 'm16']);
});

test('no ad in a short list, and never as the last thing', () => {
  assert.deepEqual(na(Array.from({ length: 7 }, (_, i) => rij(`m${i + 1}`))), []);
  assert.deepEqual(na(Array.from({ length: 8 }, (_, i) => rij(`m${i + 1}`))), []);
  assert.deepEqual(na(Array.from({ length: 9 }, (_, i) => rij(`m${i + 1}`))), ['m8']);
});

test('never directly next to a Watch and Act or an Emergency Warning', () => {
  const rijen = Array.from({ length: 20 }, (_, i) => rij(`m${i + 1}`));
  rijen[7].niveau = 3; // m8 is an Emergency Warning: not after it
  rijen[9].niveau = 2; // m10 is a Watch and Act: not before it either
  // m8 taken, m9 sits before m10, so the ad moves to after m10's neighbour m11.
  assert.deepEqual(na(rijen), ['m11', 'm19']);
});

test('Advice counts as an ordinary incident', () => {
  const rijen = Array.from({ length: 10 }, (_, i) => rij(`m${i + 1}`, 1));
  assert.deepEqual(na(rijen), ['m8']);
});

test('under an incident only when it is no warning and did not open from an alert', () => {
  assert.equal(reclameOnderMelding(0, false), true);
  assert.equal(reclameOnderMelding(1, false), true);
  assert.equal(reclameOnderMelding(2, false), false);
  assert.equal(reclameOnderMelding(3, false), false);
  assert.equal(reclameOnderMelding(0, true), false);
});
