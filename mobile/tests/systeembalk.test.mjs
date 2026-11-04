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

test('expo-navigation-bar is loaded in one file only, behind the native-module check', () => {
  const gebruikers = bronbestanden().filter((pad) => lees(pad).includes("'expo-navigation-bar'"));
  assert.deepEqual(gebruikers, [join('src', 'components', 'Navigatiebalk.android.tsx')]);

  const bron = lees('src/components/Navigatiebalk.android.tsx');
  assert.ok(!/^import [^;]*'expo-navigation-bar'/m.test(bron), 'no static import of expo-navigation-bar');
  const controle = bron.indexOf("requireOptionalNativeModule('ExpoNavigationBar')");
  const laden = bron.indexOf("require('expo-navigation-bar')");
  assert.ok(controle > 0 && laden > controle, 'the module is required only after the native check');
});
