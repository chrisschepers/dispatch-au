import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ICONEN } from '../src/iconen.ts';

const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8');

// Per SF-naam de eerste SF Symbols-versie en de iOS-versie die hem
// meebrengt, uit de typen van sf-symbols-typescript: elke versie somt alleen
// zijn nieuwe namen op, met erboven een kop als ' * iOS v16.1+,'.
function sfVersies() {
  const versie = new Map();
  let huidig = null;
  let ios = null;
  let laatsteIos = null;
  for (const regel of lees('../node_modules/sf-symbols-typescript/dist/index.d.ts').split('\n')) {
    const iosKop = regel.match(/^\s*\*\s*iOS v(\d+)\.(\d+)\+/);
    if (iosKop) { laatsteIos = Number(iosKop[1]) * 100 + Number(iosKop[2]); continue; }
    const kop = regel.match(/^export type SFSymbols(\d+)_(\d+)\s*=/);
    if (kop) { huidig = Number(kop[1]) + Number(kop[2]) / 10; ios = laatsteIos; continue; }
    if (regel.startsWith('export ')) { huidig = null; continue; }
    const naam = regel.match(/^\s*\|\s*'([^']+)'/);
    if (naam && huidig != null && !versie.has(naam[1])) versie.set(naam[1], { sf: huidig, ios });
  }
  return versie;
}

const SF = sfVersies();
const MDI = JSON.parse(lees('../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json'));

// De app draait vanaf iOS 16.4: alles tot en met SF Symbols 4.2 (iOS 16.4)
// mag, niets wat pas met iOS 17 of later komt.
const MIN_IOS = 1604;
function sfOk(naam) {
  const v = SF.get(naam);
  assert.ok(v != null, `${naam} is no SF Symbol`);
  assert.ok(v.ios != null && v.ios <= MIN_IOS, `${naam} needs SF Symbols ${v.sf} (iOS ${v.ios}), newer than iOS 16.4`);
}

test('the version table knows old and new symbols and their iOS version', () => {
  assert.deepEqual(SF.get('mappin'), { sf: 1.0, ios: 1300 });
  assert.deepEqual(SF.get('flag.checkered'), { sf: 4.0, ios: 1600 });
  assert.deepEqual(SF.get('hazardsign.fill'), { sf: 4.1, ios: 1601 });
  assert.deepEqual(SF.get('flask'), { sf: 5.0, ios: 1700 });
  assert.throws(() => sfOk('flask'));
});

test('every chrome icon has an SF Symbol that ships with iOS 16.4', () => {
  for (const { ios } of Object.values(ICONEN)) sfOk(ios);
});

test('every chrome icon has an Android name in the MDI font', () => {
  for (const [naam, { android }] of Object.entries(ICONEN)) {
    assert.ok(android in MDI, `${naam}: ${android} is not in MaterialCommunityIcons`);
  }
});

test('service SF Symbols ship with iOS 16.4 and MDI names exist', () => {
  // diensten.ts importeert het thema (react-native), dus de bron lezen.
  const bron = lees('../src/diensten.ts');
  const sf = [...bron.matchAll(/\bsf: '([^']+)'/g)].map((m) => m[1]);
  const mdi = [...bron.matchAll(/\bicoon: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(sf.length, 6);
  assert.equal(mdi.length, 6);
  sf.forEach(sfOk);
  for (const n of mdi) assert.ok(n in MDI, `${n} is not in MaterialCommunityIcons`);
});
