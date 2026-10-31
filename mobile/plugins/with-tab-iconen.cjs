/**
 * Tabiconen voor Android als vector-drawables, geschreven bij prebuild uit
 * de @mdi/js-paden die de app al meelevert.
 *
 * Waarom zo:
 *  - react-native-screens zoekt een tabicoon `{ uri: 'naam' }` op met
 *    getIdentifier(naam, 'drawable', packageName) (SystemDrawable.kt). Het
 *    moet dus een echte res/drawable zijn.
 *  - imageSource kan op Android geen SVG laden.
 *  - bottom-tabs 7.21.0 kent nog geen materialSymbol-icoon.
 *  - /android staat in .gitignore (CNG): een plugin is de enige manier om
 *    res-bestanden blijvend toe te voegen.
 *
 * De kleur in het bestand doet er niet toe: react-native-screens kleurt het
 * icoon zelf met de tint van de tabbalk (gekozen of niet).
 *
 * De app noemt de drawables alleen bij naam, als tekst in de JS-bundel. De
 * resource shrinker ziet die verwijzing niet en zou ze weggooien zodra
 * shrinkResources aangaat (nu uit); dan stond de tabbalk zonder iconen.
 * Daarom ook een keep-bestand in res/raw (wordt niet meegebundeld).
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

// Spiegelt de android-namen van de tab*-iconen (en `zoeken`) in
// src/iconen.ts: omlijnd als de tab niet gekozen is, gevuld als hij dat wel
// is, zoals M3 het wil. Zoeken heeft geen gevulde variant.
const TAB_ICONEN = {
  tab_buurt: 'mdiMapMarkerRadiusOutline',
  tab_buurt_actief: 'mdiMapMarkerRadius',
  tab_kaart: 'mdiMapOutline',
  tab_kaart_actief: 'mdiMap',
  tab_instellingen: 'mdiCogOutline',
  tab_instellingen_actief: 'mdiCog',
  tab_zoeken: 'mdiMagnify',
};

/** Houdt alle tab_*-drawables vast bij resource shrinking. */
const KEEP_XML = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<resources xmlns:tools="http://schemas.android.com/tools"',
  '    tools:keep="@drawable/tab_*" />',
  '',
].join('\n');

/** Eén pad van 24x24 als Android-vector-drawable. */
function vectorXml(pad) {
  // Een MDI-pad bevat alleen letters, cijfers en leestekens; een aanhalingsteken
  // of < zou de XML breken, dus dat is een fout en geen icoon.
  if (/["<>&]/.test(pad)) throw new Error(`with-tab-iconen: unexpected character in path ${pad.slice(0, 40)}`);
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
    '    android:width="24dp"',
    '    android:height="24dp"',
    '    android:viewportWidth="24"',
    '    android:viewportHeight="24">',
    `    <path android:fillColor="#FF000000" android:pathData="${pad}" />`,
    '</vector>',
    '',
  ].join('\n');
}

function withTabIconen(config) {
  return withDangerousMod(config, [
    'android',
    async (cfg) => {
      const mdi = require('@mdi/js');
      const map = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/drawable');
      fs.mkdirSync(map, { recursive: true });
      for (const [naam, mdiNaam] of Object.entries(TAB_ICONEN)) {
        const pad = mdi[mdiNaam];
        // Liever een kapotte prebuild dan een tabbalk zonder iconen.
        if (typeof pad !== 'string' || !pad) throw new Error(`with-tab-iconen: ${mdiNaam} is missing from @mdi/js`);
        fs.writeFileSync(path.join(map, `${naam}.xml`), vectorXml(pad));
      }
      const raw = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/raw');
      fs.mkdirSync(raw, { recursive: true });
      fs.writeFileSync(path.join(raw, 'keep_tab_iconen.xml'), KEEP_XML);
      return cfg;
    },
  ]);
}

module.exports = withTabIconen;
module.exports.vectorXml = vectorXml;
module.exports.TAB_ICONEN = TAB_ICONEN;
module.exports.KEEP_XML = KEEP_XML;
