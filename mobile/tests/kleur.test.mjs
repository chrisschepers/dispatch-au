import assert from 'node:assert/strict';
import { test } from 'node:test';
import { opKleur, mengKleur, contrast, leesbaar } from '../src/kleur.ts';
import { PALET_LICHT, PALET_DONKER } from '../src/palet.ts';

const PALETTEN = { licht: PALET_LICHT, donker: PALET_DONKER };
const DIENSTKLEUREN = ['brandweer', 'ambulance', 'politie', 'knrm', 'mmt', 'dienstOnbekend'];

test('text on a coloured surface: dark on amber, white on red and blue', () => {
  assert.equal(opKleur('#f4a814'), '#1c1c1e');
  assert.equal(opKleur('#e5372c'), '#ffffff');
  assert.equal(opKleur('#2f6fde'), '#ffffff');
  assert.equal(opKleur('x'), '#ffffff');
});

test('mengKleur matches the tile fill DetailScreen draws today', () => {
  assert.equal(mengKleur('#e5372c', '#ffffff', 0x18 / 255), 'rgb(253, 236, 235)');
  assert.equal(mengKleur('nope', '#ffffff', 0.5), 'nope');
});

test('contrast follows WCAG and fails closed on bad input', () => {
  assert.equal(contrast('#000000', '#ffffff'), 21);
  assert.equal(contrast('#ffffff', '#ffffff'), 1);
  assert.equal(contrast('#777777', '#ffffff'), contrast('#ffffff', '#777777'));
  assert.ok(contrast('#767676', '#ffffff') >= 4.5);
  assert.ok(contrast('#777777', '#ffffff') < 4.5);
  assert.equal(contrast('rgb(255, 255, 255)', '#000000'), 21);
  assert.equal(contrast('x', '#000000'), 1);
});

test('body text reaches 4.5:1 on every ground in both palettes', () => {
  for (const [naam, C] of Object.entries(PALETTEN)) {
    const paren = [
      ['textPrimary', 'bg'], ['textPrimary', 'card'],
      ['textSecondary', 'bg'], ['textSecondary', 'card'],
      ['accentTekst', 'bg'], ['accentTekst', 'card'], ['accentTekst', 'accentSoft'],
    ];
    for (const [tekst, grond] of paren) {
      const r = contrast(C[tekst], C[grond]);
      assert.ok(r >= 4.5, `${naam}: ${tekst} on ${grond} is ${r.toFixed(2)}:1`);
    }
  }
});

test('leesbaar makes every service colour readable as text on both cards', () => {
  for (const [naam, C] of Object.entries(PALETTEN)) {
    for (const dienst of DIENSTKLEUREN) {
      const uit = leesbaar(C[dienst], C.card);
      assert.match(uit, /^#[0-9a-f]{6}$/);
      const r = contrast(uit, C.card);
      assert.ok(r >= 4.5, `${naam}: ${dienst} on card is ${r.toFixed(2)}:1`);
    }
  }
  // Al leesbaar: blijft (genormaliseerd) gelijk. Lichte grond: donkerder,
  // donkere grond: lichter.
  assert.equal(leesbaar('#1C1C1E', '#ffffff'), '#1c1c1e');
  assert.ok(contrast(leesbaar('#f4a814', '#ffffff'), '#000000') < contrast('#f4a814', '#000000'));
  assert.ok(contrast(leesbaar('#7c4dbe', '#1c1c1e'), '#ffffff') < contrast('#7c4dbe', '#ffffff'));
  assert.equal(leesbaar('x', '#ffffff'), 'x');
});
