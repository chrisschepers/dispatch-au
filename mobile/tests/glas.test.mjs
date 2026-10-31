import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MOBIEL = fileURLToPath(new URL('..', import.meta.url));
const lees = (pad) => readFileSync(join(MOBIEL, pad), 'utf8');

// Alle broncode van de app: App.tsx plus alles onder src/.
function bronbestanden() {
  const uit = ['App.tsx'];
  for (const naam of readdirSync(join(MOBIEL, 'src'), { recursive: true })) {
    if (/\.(ts|tsx)$/.test(naam)) uit.push(join('src', naam));
  }
  return uit;
}

// isLiquidGlassAvailable() roept requireNativeModule aan en gooit in een
// oudere binary zonder de module. Alleen ZwevendVlak laadt hem, en pas na
// de controle op de native module.
test('expo-glass-effect is loaded in ZwevendVlak only, behind the native-module check', () => {
  const gebruikers = bronbestanden().filter((pad) => lees(pad).includes("'expo-glass-effect'"));
  assert.deepEqual(gebruikers, [join('src', 'components', 'ZwevendVlak.tsx')]);

  const bron = lees('src/components/ZwevendVlak.tsx');
  assert.ok(!/^import [^;]*'expo-glass-effect'/m.test(bron), 'no static import of expo-glass-effect');
  const controle = bron.indexOf("requireOptionalNativeModule('ExpoGlassEffect')");
  const laden = bron.indexOf("require('expo-glass-effect')");
  assert.ok(controle > 0 && laden > controle, 'the module is required only after the native check');
  // Beide controles uit visual-effects.md: de OS-versie en de API zelf.
  assert.ok(bron.includes('isLiquidGlassAvailable()') && bron.includes('isGlassEffectAPIAvailable()'));
});

test('the map has no hand-made controls left', () => {
  const bron = lees('src/screens/KaartScreen.tsx');
  assert.ok(!bron.includes('◉'), 'no ◉ glyph in the My area button');
  assert.ok(!/bottom: 110/.test(bron), 'no hand-tuned bottom offset');
  assert.ok(!/shadowOpacity: 0\.15/.test(bron), 'the old My area shadow is gone');
});
