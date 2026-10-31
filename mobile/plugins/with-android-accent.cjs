/**
 * Het merkrood als accent van het Android-thema, in plaats van het teal dat
 * AppCompat standaard meebrengt. Dat accent kleurt wat de app niet zelf
 * tekent: de knoppen van de AppCompat-dialogen van Alert, en de cursor en
 * tekstgrepen in velden zonder eigen kleur.
 *
 * colorAccent staat in values/colors.xml én values-night/colors.xml, en het
 * thema verwijst ernaar met @color/colorAccent. Zo wisselt het mee met de
 * nachtstand, ook als die uit de app komt (Appearance.setColorScheme in
 * ThemaProvider).
 *
 * Dezelfde waarden als `accent` in src/palet.ts, licht en donker;
 * tests/androidAccent.test.mjs houdt ze gelijk.
 */
const {
  withAndroidColors, withAndroidColorsNight, withAndroidStyles, AndroidConfig,
} = require('expo/config-plugins');

const ACCENT = { licht: '#e5372c', donker: '#ff5247' };
const NAAM = 'colorAccent';

function withAndroidAccent(config) {
  config = withAndroidColors(config, (mod) => {
    mod.modResults = AndroidConfig.Colors.assignColorValue(mod.modResults, { name: NAAM, value: ACCENT.licht });
    return mod;
  });
  config = withAndroidColorsNight(config, (mod) => {
    mod.modResults = AndroidConfig.Colors.assignColorValue(mod.modResults, { name: NAAM, value: ACCENT.donker });
    return mod;
  });
  config = withAndroidStyles(config, (mod) => {
    mod.modResults = AndroidConfig.Styles.assignStylesValue(mod.modResults, {
      add: true,
      parent: AndroidConfig.Styles.getAppThemeGroup(),
      name: NAAM,
      value: `@color/${NAAM}`,
    });
    return mod;
  });
  return config;
}

module.exports = withAndroidAccent;
module.exports.ACCENT = ACCENT;
