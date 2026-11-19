import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PREMIUM_FUNCTIES, functiesVoor, titelVoor, effectief, geldigePlekken, metPlek, isPremium, MAX_EXTRA_PLEKKEN,
} from '../src/premium.ts';

const inst = {
  alleenGroot: false, straalPerDienst: { Fire: 100 }, gripAlarm: true, blusvliegtuigen: true,
  geluidPerDienst: { Fire: 'sirene' }, extraPlekken: [{ naam: 'Beach house', lat: -38.3, lon: 144.3 }],
  straalKm: 20,
};

test('without Premium only official warnings at your own place go to the server', () => {
  const e = effectief(inst, false);
  assert.equal(e.alleenGroot, true);
  assert.deepEqual(e.straalPerDienst, {});
  assert.equal(e.gripAlarm, false);
  assert.equal(e.blusvliegtuigen, false);
  assert.deepEqual(e.extraPlekken, []);
  assert.equal(e.straalKm, 20);
  // The settings on the phone are untouched: they come back with Premium.
  assert.equal(inst.alleenGroot, false);
  assert.equal(inst.extraPlekken.length, 1);
});

test('with Premium everything goes as set', () => {
  const e = effectief(inst, true);
  assert.equal(e.alleenGroot, false);
  assert.deepEqual(e.straalPerDienst, { Fire: 100 });
  assert.equal(e.extraPlekken.length, 1);
});

test('places: valid, named, no doubles, at most five', () => {
  assert.deepEqual(geldigePlekken([{ naam: ' Mum ', lat: -35, lon: 149 }, { naam: '', lat: 1, lon: 1 }, { naam: 'x', lat: 200, lon: 1 }, null]),
    [{ naam: 'Mum', lat: -35, lon: 149 }]);
  let p = [];
  for (let i = 0; i < 8; i++) p = metPlek(p, { naam: `Place ${i}`, lat: -30 - i, lon: 140 });
  assert.equal(p.length, MAX_EXTRA_PLEKKEN);
  assert.equal(metPlek([{ naam: 'Mum', lat: -35, lon: 149 }], { naam: 'mum', lat: -20, lon: 130 }).length, 1);
  assert.equal(metPlek([{ naam: 'Mum', lat: -35, lon: 149 }], { naam: 'Other name', lat: -35.001, lon: 149.001 }).length, 1);
  assert.equal(metPlek([{ naam: 'Mum', lat: -35, lon: 149 }], { naam: 'Shack', lat: -42, lon: 147 }).length, 2);
});

test('the paywall puts the reason someone came for on top', () => {
  assert.equal(functiesVoor('plekken')[0].sleutel, 'plekken');
  assert.equal(functiesVoor('plekken').length, PREMIUM_FUNCTIES.length);
  assert.equal(functiesVoor(undefined)[0].sleutel, 'incidenten');
  assert.match(titelVoor('plekken', true), /extra places is part of Premium/);
  assert.equal(titelVoor('intro', true), 'Try Premium free');
  assert.equal(titelVoor('intro', false), 'Get more with Premium');
  assert.equal(titelVoor('verlopen', false), 'Your Premium has ended');
});

test('a paying user keeps Premium while the store has not answered', () => {
  assert.equal(isPremium(false, 'geen', false), true);   // no store in this build
  assert.equal(isPremium(true, 'actief', false), true);
  assert.equal(isPremium(true, 'onbekend', true), true);
  assert.equal(isPremium(true, 'onbekend', false), false);
  assert.equal(isPremium(true, 'geen', true), false);
  assert.equal(isPremium(true, 'wacht', true), false);
});
