import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StackRouter, CommonActions } from '@react-navigation/routers';
import { tabVoorMelding } from '../src/navigatieKeuze.ts';

const tabs = (index) => ({
  index,
  routes: [{ name: 'BuurtTab' }, { name: 'KaartTab' }, { name: 'ZoekTab' }, { name: 'InstellingenTab' }],
});

test('a push tap opens Detail in the Map or Search tab you are on, otherwise in Nearby', () => {
  assert.equal(tabVoorMelding(tabs(0)), 'BuurtTab');
  assert.equal(tabVoorMelding(tabs(1)), 'KaartTab');
  assert.equal(tabVoorMelding(tabs(2)), 'ZoekTab');
  // Instellingen heeft geen Detail.
  assert.equal(tabVoorMelding(tabs(3)), 'BuurtTab');
  // Navigatie nog niet klaar, of een gedeeltelijke staat zonder index.
  assert.equal(tabVoorMelding(undefined), 'BuurtTab');
  assert.equal(tabVoorMelding(null), 'BuurtTab');
  assert.equal(tabVoorMelding({ routes: [{ name: 'KaartTab' }] }), 'KaartTab');
});

// Dezelfde opzet als de stapels in navigatie.tsx: Detail met getId op het id
// van de melding.
const melding = (id) => ({ melding: { id } });
const opties = {
  routeNames: ['Kaart', 'Detail'],
  routeParamList: { Kaart: undefined, Detail: undefined },
  routeGetIdList: { Detail: ({ params }) => params?.melding?.id },
};
const router = StackRouter({});
const doe = (staat, actie) => router.getStateForAction(staat, actie, opties);

test('the map preview in Detail pops back to the existing map with the new place', () => {
  let staat = router.getInitialState(opties);
  staat = doe(staat, CommonActions.navigate('Detail', melding('a')));
  assert.deepEqual(staat.routes.map((r) => r.name), ['Kaart', 'Detail']);
  const kaartSleutel = staat.routes[0].key;

  const params = { lat: -33.9, lon: 151.2, id: 'a', t: 1 };
  staat = doe(staat, { type: 'NAVIGATE', payload: { name: 'Kaart', params, pop: true } });
  assert.deepEqual(staat.routes.map((r) => r.name), ['Kaart']);
  assert.equal(staat.routes[0].key, kaartSleutel);
  assert.deepEqual(staat.routes[0].params, params);
  assert.equal(staat.index, 0);
});

test('Detail with getId: another incident pushes a new Detail, the same one goes back to it', () => {
  let staat = router.getInitialState(opties);
  staat = doe(staat, CommonActions.navigate('Detail', melding('a')));
  staat = doe(staat, CommonActions.navigate('Detail', melding('b')));
  assert.deepEqual(staat.routes.map((r) => r.params?.melding?.id ?? r.name), ['Kaart', 'a', 'b']);
  assert.equal(staat.index, 2);

  // Dezelfde melding nog eens: geen derde Detail, wel die melding bovenop.
  staat = doe(staat, CommonActions.navigate('Detail', melding('a')));
  assert.deepEqual(staat.routes.map((r) => r.params?.melding?.id ?? r.name), ['Kaart', 'b', 'a']);
});
