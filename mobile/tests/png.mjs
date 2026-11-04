/**
 * Gedeelde hulp voor de beeldtests: een PNG-lezer met alleen de standaard-
 * bibliotheek van Node.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

/** Leest een 8-bit RGBA-PNG zonder interlace: breedte, hoogte en de pixels. */
export function leesPng(pad) {
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
