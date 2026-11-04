import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zoomVan, naarWereldPixels, groepeer, opEenPlek } from '../src/kaartGroepen.ts';

// Op zoom 10 is de wereld 256 · 1024 pixels breed: één pixel is 360/262144 graden.
const ZOOM = 10;
const GRAAD_PER_PX = 360 / (256 * 2 ** ZOOM);
const punt = (m) => m;
const melding = (id, lat, lon, gewicht = 0, tijd = 0) => ({ id, lat, lon, gewicht, tijd });

test('zoomVan follows the map width and rounds to half steps', () => {
  assert.equal(zoomVan(360 / 1024, 256), 10);
  assert.equal(zoomVan(0.5, 390), 10);
  assert.equal(zoomVan(0.45, 390), 10.5);
  // Twee keer zo breed in graden is één zoomniveau minder.
  assert.equal(zoomVan(1, 390), 9);
});

test('naarWereldPixels: Web Mercator, (0, 0) in the middle of the world', () => {
  const { x, y } = naarWereldPixels(0, 0, 0);
  assert.equal(x, 128);
  assert.ok(Math.abs(y - 128) < 1e-9);
  // Zuidelijk halfrond ligt lager op het scherm; de pool blijft eindig.
  assert.ok(naarWereldPixels(-33.9, 151.2, ZOOM).y > naarWereldPixels(0, 151.2, ZOOM).y);
  assert.ok(Number.isFinite(naarWereldPixels(-90, 0, ZOOM).y));
});

test('identical coordinates group together, at the heaviest member', () => {
  const items = [
    melding('a', -33.87, 151.21, 0, 1),
    melding('b', -33.87, 151.21, 3, 1),
    melding('c', -33.87, 151.21, 0, 5),
  ];
  const groepen = groepeer(items, punt, ZOOM, 44);
  assert.equal(groepen.length, 1);
  assert.equal(groepen[0].sleutel, 'g:b');
  // Middelpunt eerst, dan de nieuwste.
  assert.deepEqual(groepen[0].leden.map((m) => m.id), ['b', 'c', 'a']);
});

test('pins about 100 px apart stay single, with their own id as key', () => {
  const items = [
    melding('a', -33.87, 151.21),
    melding('b', -33.87, 151.21 + 100 * GRAAD_PER_PX),
  ];
  const groepen = groepeer(items, punt, ZOOM, 44);
  assert.deepEqual(groepen.map((g) => g.sleutel).sort(), ['a', 'b']);
  // Een keer verder uitgezoomd staan ze 50 px uit elkaar: nog steeds los;
  // nog een keer (25 px): samen.
  assert.equal(groepeer(items, punt, ZOOM - 1, 44).length, 2);
  assert.equal(groepeer(items, punt, ZOOM - 2, 44).length, 1);
});

test('keys are stable when grouping the same items twice', () => {
  const items = Array.from({ length: 60 }, (_, i) =>
    melding(`m${i}`, -33.8 - (i % 7) * 0.004, 151.1 + Math.floor(i / 7) * 0.006, i % 3, i));
  const een = groepeer(items, punt, ZOOM, 44);
  const twee = groepeer(items, punt, ZOOM, 44);
  assert.deepEqual(een.map((g) => g.sleutel), twee.map((g) => g.sleutel));
  // Er verdwijnt niets: elk item zit in precies één groep.
  const ids = een.flatMap((g) => g.leden.map((m) => m.id)).sort();
  assert.deepEqual(ids, items.map((m) => m.id).sort());
});

test('shuffled input gives the same groups in the same order', () => {
  const items = Array.from({ length: 40 }, (_, i) =>
    melding(`m${i}`, -37.8 + (i % 5) * 0.002, 144.9 + (i % 8) * 0.003, i % 2, i % 4));
  const basis = groepeer(items, punt, ZOOM, 48);
  for (let ronde = 0; ronde < 5; ronde++) {
    const geschud = [...items].sort(() => Math.random() - 0.5);
    const uit = groepeer(geschud, punt, ZOOM, 48);
    assert.deepEqual(
      uit.map((g) => [g.sleutel, g.leden.map((m) => m.id)]),
      basis.map((g) => [g.sleutel, g.leden.map((m) => m.id)]),
    );
  }
});

test('opEenPlek: members within 0.0003 degrees share one spot', () => {
  assert.equal(opEenPlek([{ lat: -33.87, lon: 151.21 }, { lat: -33.8702, lon: 151.2102 }]), true);
  assert.equal(opEenPlek([{ lat: -33.87, lon: 151.21 }, { lat: -33.871, lon: 151.21 }]), false);
  assert.equal(opEenPlek([]), false);
});
