import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import plugin from '../plugins/with-tab-iconen.cjs';
import * as mdi from '@mdi/js';
import { ICONEN } from '../src/iconen.ts';

const { TAB_ICONEN, vectorXml } = plugin;

// Welke iconen.ts-sleutel bij welke drawable hoort.
const SPIEGEL = {
  tab_buurt: 'tabBuurt',
  tab_buurt_actief: 'tabBuurtActief',
  tab_kaart: 'tabKaart',
  tab_kaart_actief: 'tabKaartActief',
  tab_instellingen: 'tabInstellingen',
  tab_instellingen_actief: 'tabInstellingenActief',
  tab_zoeken: 'zoeken',
};

// 'map-marker-radius-outline' -> 'mdiMapMarkerRadiusOutline'
const naarMdiJs = (naam) => `mdi${naam.split('-').map((d) => d[0].toUpperCase() + d.slice(1)).join('')}`;

test('every tab icon has a path in @mdi/js and becomes a 24dp vector drawable', () => {
  assert.equal(Object.keys(TAB_ICONEN).length, 7);
  for (const [naam, mdiNaam] of Object.entries(TAB_ICONEN)) {
    const pad = mdi[mdiNaam];
    assert.equal(typeof pad, 'string', `${mdiNaam} (${naam}) is missing from @mdi/js`);
    assert.match(naam, /^[a-z][a-z0-9_]*$/, `${naam} is no valid Android resource name`);
    const xml = vectorXml(pad);
    assert.ok(xml.includes(`android:pathData="${pad}"`), `${naam} lacks its pathData`);
    assert.ok(xml.includes('android:viewportWidth="24"'), `${naam} lacks viewportWidth`);
    assert.ok(xml.includes('android:width="24dp"'), `${naam} lacks width`);
  }
});

test('the drawables mirror the android names of the tab icons in iconen.ts', () => {
  assert.deepEqual(Object.keys(TAB_ICONEN).sort(), Object.keys(SPIEGEL).sort());
  for (const [naam, sleutel] of Object.entries(SPIEGEL)) {
    assert.equal(TAB_ICONEN[naam], naarMdiJs(ICONEN[sleutel].android), `${naam} differs from ICONEN.${sleutel}`);
  }
});

test('the plugin writes every drawable into res/drawable at prebuild', async () => {
  const map = mkdtempSync(join(tmpdir(), 'tabiconen-'));
  try {
    const config = plugin({ name: 'test', slug: 'test' });
    await config.mods.android.dangerous({ ...config, modRequest: { platformProjectRoot: map } });
    const drawable = join(map, 'app/src/main/res/drawable');
    assert.deepEqual(
      readdirSync(drawable).sort(),
      Object.keys(TAB_ICONEN).map((n) => `${n}.xml`).sort(),
    );
    const buurt = readFileSync(join(drawable, 'tab_buurt.xml'), 'utf8');
    assert.ok(buurt.startsWith('<?xml version="1.0" encoding="utf-8"?>'));
    assert.ok(buurt.includes(mdi.mdiMapMarkerRadiusOutline));
    // Keep-bestand, zodat resource shrinking de drawables laat staan: de app
    // noemt ze alleen bij naam vanuit JS.
    const keep = readFileSync(join(map, 'app/src/main/res/raw/keep_tab_iconen.xml'), 'utf8');
    assert.ok(keep.includes('xmlns:tools="http://schemas.android.com/tools"'));
    assert.ok(keep.includes('tools:keep="@drawable/tab_*"'));
    for (const naam of Object.keys(TAB_ICONEN)) assert.ok(naam.startsWith('tab_'), `${naam} is not covered by tab_*`);
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
});
