import assert from 'node:assert/strict';
import { test } from 'node:test';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../app.config.ts';
import { PALET_LICHT } from '../src/palet.ts';
import { leesPng } from './png.mjs';

const MOBIEL = fileURLToPath(new URL('..', import.meta.url));

function meldingOpties() {
  const item = config.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications');
  assert.ok(item, 'expo-notifications staat in de plugins');
  return item[1];
}

test('Android notifications get their own small icon in the brand red, and no default channel', () => {
  const opties = meldingOpties();
  assert.equal(opties.icon, './assets/notification-icon.png');
  assert.equal(opties.color, PALET_LICHT.accent);
  // Geen defaultChannel (keuze 31-10): het kanaal komt per melding van de
  // backend, zie kanaalVoor in src/geluiden.ts.
  assert.equal(opties.defaultChannel, undefined);
  assert.equal(opties.mode, 'production');
  assert.equal(opties.sounds.length, 6);
});

test('the notification icon is a white glyph on transparent, 96 px', () => {
  const { breedte, hoogte, pixels } = leesPng(join(MOBIEL, 'assets/notification-icon.png'));
  assert.equal(breedte, 96);
  assert.equal(hoogte, 96);
  // Android kleurt alleen de alfa in; een gekleurde of dichte pixel wordt
  // een wit vlak. Dus: elke zichtbare pixel wit, de hoeken leeg.
  let zichtbaar = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] === 0) continue;
    zichtbaar++;
    assert.deepEqual([...pixels.subarray(i, i + 3)], [255, 255, 255], `pixel ${i / 4} is wit`);
  }
  assert.ok(zichtbaar > 500 && zichtbaar < breedte * hoogte / 2, `een glyph, geen vlak (${zichtbaar} pixels)`);
  for (const [x, y] of [[0, 0], [95, 0], [0, 95], [95, 95]]) {
    assert.equal(pixels[(y * breedte + x) * 4 + 3], 0, `hoek ${x},${y} is doorzichtig`);
  }
});
