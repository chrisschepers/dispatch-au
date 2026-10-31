import assert from 'node:assert/strict';
import { test } from 'node:test';
import accentPlugin from '../plugins/with-android-accent.cjs';
import navigatiebalkModule from 'expo-navigation-bar/app.plugin.js';
import config from '../app.config.ts';
import { PALET_LICHT, PALET_DONKER, DONKER_ANDROID } from '../src/palet.ts';

const { ACCENT } = accentPlugin;
const navigatiebalkPlugin = navigatiebalkModule.default;

// styles.xml zoals het Expo-sjabloon hem schrijft (geparst door xml2js).
const sjabloonStijlen = () => ({
  resources: {
    style: [
      {
        $: { name: 'AppTheme', parent: 'Theme.AppCompat.DayNight.NoActionBar' },
        item: [{ $: { name: 'android:editTextBackground' }, _: '@drawable/rn_edit_text_material' }],
      },
      {
        $: { name: 'Theme.App.SplashScreen', parent: 'AppTheme' },
        item: [{ $: { name: 'android:windowBackground' }, _: '@drawable/splashscreen_logo' }],
      },
    ],
  },
});

const kleur = (xml, naam) => xml.resources.color?.find((c) => c.$.name === naam)?._;
const item = (xml, stijl, naam) =>
  xml.resources.style.find((s) => s.$.name === stijl)?.item.find((i) => i.$.name === naam)?._;

async function draai(cfg, mod, modResults) {
  const uit = await cfg.mods.android[mod]({ ...cfg, modResults, modRequest: { platform: 'android' } });
  return uit.modResults;
}

test('the Android theme accent is the palette accent, light and dark', () => {
  assert.equal(ACCENT.licht, PALET_LICHT.accent);
  assert.equal(ACCENT.donker, PALET_DONKER.accent);
  // Android donker houdt het accent van de basis (A1).
  assert.equal(DONKER_ANDROID.accent, undefined);
});

test('the plugin writes colorAccent for day and night and points the app theme at it', async () => {
  const cfg = accentPlugin({ name: 'test', slug: 'test' });
  const dag = await draai(cfg, 'colors', {
    resources: { color: [{ $: { name: 'splashscreen_background' }, _: '#FFFFFF' }] },
  });
  assert.equal(kleur(dag, 'colorAccent'), '#e5372c');
  assert.equal(kleur(dag, 'splashscreen_background'), '#FFFFFF');

  // Bestaat values-night/colors.xml nog niet, dan begint het leeg.
  const nacht = await draai(cfg, 'colorsNight', { resources: '' });
  assert.equal(kleur(nacht, 'colorAccent'), '#ff5247');

  const stijlen = await draai(cfg, 'styles', sjabloonStijlen());
  assert.equal(item(stijlen, 'AppTheme', 'colorAccent'), '@color/colorAccent');
  assert.equal(item(stijlen, 'AppTheme', 'android:editTextBackground'), '@drawable/rn_edit_text_material');
  assert.equal(item(stijlen, 'Theme.App.SplashScreen', 'colorAccent'), undefined);
});

test('app.config registers the accent plugin and the navigation bar without scrim', async () => {
  assert.equal(config.primaryColor, PALET_LICHT.accent);
  assert.equal(config.userInterfaceStyle, 'automatic');
  assert.ok(config.plugins.includes('./plugins/with-android-accent.cjs'));
  const balk = config.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-navigation-bar');
  assert.deepEqual(balk, ['expo-navigation-bar', { enforceContrast: false }]);

  // Wat de plugin van expo-navigation-bar met die optie in het thema zet.
  let cfg = accentPlugin({ name: 'test', slug: 'test' });
  cfg = navigatiebalkPlugin(cfg, balk[1]);
  const stijlen = await draai(cfg, 'styles', sjabloonStijlen());
  assert.equal(item(stijlen, 'AppTheme', 'android:enforceNavigationBarContrast'), 'false');
  assert.equal(item(stijlen, 'AppTheme', 'colorAccent'), '@color/colorAccent');
  // Geen vaste knopkleur in het thema: die zet Navigatiebalk per scherm.
  assert.equal(item(stijlen, 'AppTheme', 'android:windowLightNavigationBar'), undefined);
});
