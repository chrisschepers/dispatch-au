import assert from 'node:assert/strict';
import { test } from 'node:test';
import { opKleur, mengKleur, contrast, leesbaar } from '../src/kleur.ts';
import { PALET_LICHT, PALET_DONKER, DONKER_ANDROID } from '../src/palet.ts';

// Zelfde samenstelling als theme.ts op Android: M3-donkervlakken over het
// donkere basispalet.
const DONKER_OP_ANDROID = { ...PALET_DONKER, ...DONKER_ANDROID };
const PALETTEN = { licht: PALET_LICHT, donker: PALET_DONKER, donkerAndroid: DONKER_OP_ANDROID };
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

test('body text reaches 4.5:1 on every ground in every palette', () => {
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

test('leesbaar makes every service colour readable as text on every card', () => {
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

test('Android dark: M3 grey surfaces instead of black, all hex, same accent', () => {
  const C = DONKER_OP_ANDROID;
  assert.notEqual(C.bg, '#000000');
  assert.equal(C.bg, '#131313');
  // Elk vlak boven de grond is lichter dan de grond zelf.
  for (const vlak of ['card', 'chipBg']) {
    assert.ok(contrast(C[vlak], '#000000') > contrast(C.bg, '#000000'), `${vlak} is not lighter than bg`);
  }
  // Schakelaar interpoleert en schermen plakken `${kleur}14` achter: hex.
  for (const [sleutel, waarde] of Object.entries(DONKER_ANDROID)) {
    assert.match(waarde, /^#[0-9a-f]{6}$/, sleutel);
  }
  // Alleen vlakken en tekst wisselen; accent, rimpel en disciplines blijven.
  for (const sleutel of ['donker', 'accent', 'accentSoft', 'accentTekst', 'rimpel', ...DIENSTKLEUREN]) {
    assert.equal(C[sleutel], PALET_DONKER[sleutel], sleutel);
  }
  // Ook de stillere tekst blijft leesbaar op de Android-kaart.
  assert.ok(contrast(C.textMuted, C.card) >= 4.5);
});

test('Detail timeline glyph: opKleur stands out on every dot colour', () => {
  // De bolletjes zijn de dienstkleur of het accent; het icoon erin is een
  // grafisch element, dus 3:1. Vast wit haalde op amber maar 2:1.
  for (const [naam, C] of Object.entries(PALETTEN)) {
    for (const bol of [...DIENSTKLEUREN, 'accent']) {
      const r = contrast(opKleur(C[bol]), C[bol]);
      assert.ok(r >= 3, `${naam}: glyph on ${bol} is ${r.toFixed(2)}:1`);
    }
  }
});

test('Detail title tile: the flame cut-out matches the tile on the screen ground', () => {
  // DetailScreen mengt naar C.bg, niet naar wit: in het donker is de tegel
  // dan donker en valt de uitspaarrand weg in plaats van licht op te lichten.
  const licht = mengKleur(PALET_LICHT.brandweer, PALET_LICHT.bg, 0x18 / 255);
  const donker = mengKleur(PALET_DONKER.brandweer, PALET_DONKER.bg, 0x18 / 255);
  assert.ok(contrast(donker, '#000000') < 1.5, `dark tile ${donker} is not dark`);
  assert.ok(contrast(licht, '#ffffff') < 1.5, `light tile ${licht} is not light`);
});

test('the off switch stands out: outline on the card, thumb on the track, 3:1', () => {
  for (const [naam, C] of Object.entries(PALETTEN)) {
    const rand = contrast(C.schakelRand, C.card);
    const knop = contrast(C.schakelKnop, C.schakelBaan);
    assert.ok(rand >= 3, `${naam}: switch outline on card is ${rand.toFixed(2)}:1`);
    assert.ok(knop >= 3, `${naam}: switch thumb on track is ${knop.toFixed(2)}:1`);
  }
});

test('the selected tab label in the accent reads as text on the light tab bar', () => {
  // navigatie.tsx kleurt het gekozen label met accentTekst; de Android-balk
  // is C.card, op iOS wit glas of een witte balk.
  assert.ok(contrast(PALET_LICHT.accentTekst, PALET_LICHT.card) >= 4.5);
  assert.ok(contrast(PALET_LICHT.accent, PALET_LICHT.card) < 4.5, 'raw accent alone would fail');
  for (const C of [PALET_DONKER, DONKER_OP_ANDROID]) {
    assert.ok(contrast(C.accentTekst, C.card) >= 4.5);
  }
});
