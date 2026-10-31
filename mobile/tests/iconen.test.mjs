import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ICONEN } from '../src/iconen.ts';

const lees = (pad) => readFileSync(new URL(pad, import.meta.url), 'utf8');

// Per SF-naam de eerste SF Symbols-versie, uit de typen van
// sf-symbols-typescript (elke versie somt alleen zijn nieuwe namen op).
function sfVersies() {
  const versie = new Map();
  let huidig = null;
  for (const regel of lees('../node_modules/sf-symbols-typescript/dist/index.d.ts').split('\n')) {
    const kop = regel.match(/^export type SFSymbols(\d+)_(\d+)\s*=/);
    if (kop) { huidig = Number(kop[1]) + Number(kop[2]) / 10; continue; }
    if (regel.startsWith('export ')) { huidig = null; continue; }
    const naam = regel.match(/^\s*\|\s*'([^']+)'/);
    if (naam && huidig != null && !versie.has(naam[1])) versie.set(naam[1], huidig);
  }
  return versie;
}

const SF = sfVersies();
const MDI = JSON.parse(lees('../node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialCommunityIcons.json'));

// De app draait vanaf iOS 16.4; SF Symbols 4.0 hoort bij iOS 16.0.
function sfOk(naam) {
  const v = SF.get(naam);
  assert.ok(v != null, `${naam} is no SF Symbol`);
  assert.ok(v <= 4.0, `${naam} needs SF Symbols ${v}, newer than 4.0`);
}

test('the version table knows old and new symbols', () => {
  assert.equal(SF.get('mappin'), 1.0);
  assert.equal(SF.get('flag.checkered'), 4.0);
  assert.equal(SF.get('flask'), 5.0);
});

test('every chrome icon has an SF Symbol from SF 4.0 or earlier', () => {
  for (const { ios } of Object.values(ICONEN)) sfOk(ios);
});

test('every chrome icon has an Android name in the MDI font', () => {
  for (const [naam, { android }] of Object.entries(ICONEN)) {
    assert.ok(android in MDI, `${naam}: ${android} is not in MaterialCommunityIcons`);
  }
});

test('service SF Symbols are SF 4.0 or earlier and MDI names exist', () => {
  // diensten.ts importeert het thema (react-native), dus de bron lezen.
  const bron = lees('../src/diensten.ts');
  const sf = [...bron.matchAll(/\bsf: '([^']+)'/g)].map((m) => m[1]);
  const mdi = [...bron.matchAll(/\bicoon: '([^']+)'/g)].map((m) => m[1]);
  assert.equal(sf.length, 6);
  assert.equal(mdi.length, 6);
  sf.forEach(sfOk);
  for (const n of mdi) assert.ok(n in MDI, `${n} is not in MaterialCommunityIcons`);
});
