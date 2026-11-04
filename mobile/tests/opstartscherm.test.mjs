import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import config from '../app.config.ts';
import { PALET_LICHT, PALET_DONKER } from '../src/palet.ts';
import { leesPng } from './png.mjs';

const MOBIEL = fileURLToPath(new URL('..', import.meta.url));
const require = createRequire(import.meta.url);
// De plugin rekent zelf uit wat per platform geldt (android/ios over de
// gedeelde opties heen); die functies gebruiken, niet nadoen. Via het pad:
// het pakket exporteert ze niet.
const PLUGIN = join(MOBIEL, 'node_modules/expo-splash-screen/plugin/build');
const { getIosSplashConfig } = require(join(PLUGIN, 'getIosSplashConfig.js'));
const { getAndroidSplashConfig } = require(join(PLUGIN, 'getAndroidSplashConfig.js'));

function opstartOpties() {
  const item = config.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen');
  assert.ok(item, 'expo-splash-screen staat in de plugins');
  return item[1];
}

test('iOS launch screen is the plain background of the first screen, without a logo', () => {
  const ios = getIosSplashConfig(opstartOpties());
  // Dezelfde grond als het Laadscherm en Nearby, zodat de overgang niet
  // flitst. palet.ts PALET_DONKER is de iOS-basis (zwart).
  assert.equal(ios.backgroundColor, PALET_LICHT.bg);
  assert.equal(ios.dark.backgroundColor, PALET_DONKER.bg);
  // Het beeld is er alleen voor de kleur (zie hieronder): 1 punt en geheel
  // doorzichtig, dus geen logo.
  assert.equal(ios.imageWidth, 1);
  assert.equal(ios.dark.image, undefined);
  const { pixels } = leesPng(join(MOBIEL, ios.image));
  for (let i = 3; i < pixels.length; i += 4) assert.equal(pixels[i], 0, 'fully transparent');
});

test('the iOS storyboard takes its background from the SplashScreenBackground colour set', async () => {
  // Wat prebuild met het storyboard doet: zonder beeld bleef de achtergrond
  // systemBackgroundColor (wit), met beeld wordt het de kleurset die de
  // plugin per thema schrijft. Uitgaan van het storyboard van de sjabloon,
  // dat systemBackgroundColor heeft.
  const { getTemplateAsync } = require(join(PLUGIN, 'withIosSplashScreenStoryboard.js'));
  const { applySplashScreenStoryboard } = require(join(PLUGIN, 'withIosSplashScreenStoryboardImage.js'));
  const xml = await getTemplateAsync();
  const hoofd = () => xml.document.scenes[0].scene[0].objects[0].viewController[0].view[0];
  hoofd().color = [{ $: { key: 'backgroundColor', systemColor: 'systemBackgroundColor' } }];
  const uit = applySplashScreenStoryboard(xml, getIosSplashConfig(opstartOpties()));
  const view = uit.document.scenes[0].scene[0].objects[0].viewController[0].view[0];
  assert.deepEqual(view.color, [{ $: { key: 'backgroundColor', name: 'SplashScreenBackground' } }]);
});

test('Android splash is the launcher glyph on the launcher red, in light and dark', () => {
  const android = getAndroidSplashConfig(opstartOpties());
  const rood = config.android.adaptiveIcon.backgroundColor;
  assert.equal(android.backgroundColor, rood);
  assert.equal(android.dark.backgroundColor, rood);
  assert.equal(android.image, config.android.adaptiveIcon.foregroundImage);
  assert.equal(android.imageWidth, 200);
});

test('the Android 12 splash glyph fits inside the 192 dp circle', () => {
  const { imageWidth, image } = getAndroidSplashConfig(opstartOpties());
  const { breedte, hoogte, pixels } = leesPng(join(MOBIEL, image));
  assert.equal(breedte, hoogte, 'vierkant beeld');
  // De plugin zet het beeld op imageWidth dp in het midden van een vlak van
  // 288 dp; Android 12+ knipt een icoon zonder eigen achtergrond af op een
  // cirkel van 192 dp. Elke zichtbare pixel moet daarbinnen vallen.
  const dpPerPixel = imageWidth / breedte;
  const midden = breedte / 2;
  let verst = 0;
  for (let y = 0; y < hoogte; y++) {
    for (let x = 0; x < breedte; x++) {
      if (pixels[(y * breedte + x) * 4 + 3] === 0) continue;
      // Verste hoek van de pixel, niet zijn midden.
      const dx = Math.max(Math.abs(x - midden), Math.abs(x + 1 - midden));
      const dy = Math.max(Math.abs(y - midden), Math.abs(y + 1 - midden));
      verst = Math.max(verst, Math.hypot(dx, dy));
    }
  }
  assert.ok(verst > 0, 'het beeld heeft een glyph');
  assert.ok(verst * dpPerPixel <= 96, `glyph reikt ${(verst * dpPerPixel).toFixed(1)} dp van het midden, max 96`);
});
