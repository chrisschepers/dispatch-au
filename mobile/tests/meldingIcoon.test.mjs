import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import config from '../app.config.ts';
import { PALET_LICHT } from '../src/palet.ts';

const MOBIEL = fileURLToPath(new URL('..', import.meta.url));

function meldingOpties() {
  const item = config.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications');
  assert.ok(item, 'expo-notifications staat in de plugins');
  return item[1];
}

/** Leest een 8-bit RGBA-PNG zonder interlace: breedte, hoogte en de pixels. */
function leesPng(pad) {
  const png = readFileSync(pad);
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  let pos = 8, breedte = 0, hoogte = 0;
  const idat = [];
  while (pos < png.length) {
    const lengte = png.readUInt32BE(pos);
    const soort = png.subarray(pos + 4, pos + 8).toString('ascii');
    const inhoud = png.subarray(pos + 8, pos + 8 + lengte);
    if (soort === 'IHDR') {
      breedte = inhoud.readUInt32BE(0);
      hoogte = inhoud.readUInt32BE(4);
      assert.equal(inhoud[8], 8, 'bitdiepte 8');
      assert.equal(inhoud[9], 6, 'kleurtype 6: RGBA');
      assert.equal(inhoud[12], 0, 'geen interlace');
    }
    if (soort === 'IDAT') idat.push(inhoud);
    pos += 12 + lengte;
  }
  const ruw = inflateSync(Buffer.concat(idat));
  const stride = breedte * 4;
  const pixels = Buffer.alloc(hoogte * stride);
  for (let y = 0; y < hoogte; y++) {
    const filter = ruw[y * (stride + 1)];
    for (let x = 0; x < stride; x++) {
      const waarde = ruw[y * (stride + 1) + 1 + x];
      const a = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? pixels[(y - 1) * stride + x - 4] : 0;
      let voorspeld = 0;
      if (filter === 1) voorspeld = a;
      else if (filter === 2) voorspeld = b;
      else if (filter === 3) voorspeld = (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        voorspeld = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = (waarde + voorspeld) & 255;
    }
  }
  return { breedte, hoogte, pixels };
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
