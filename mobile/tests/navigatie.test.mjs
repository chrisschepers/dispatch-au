import assert from 'node:assert/strict';
import { test } from 'node:test';
import { StackRouter, StackActions, CommonActions } from '@react-navigation/routers';
import { tabVoorMelding, doelVoorMelding } from '../src/navigatieKeuze.ts';

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
  routeNames: ['Kaart', 'Detail', 'Groep'],
  routeParamList: { Kaart: undefined, Detail: undefined, Groep: undefined },
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

test('a push tap with the group sheet open on the map closes the sheet first', () => {
  const kaartMetBlad = (boven) => ({
    index: 1,
    routes: [
      { name: 'BuurtTab' },
      { name: 'KaartTab', state: { key: 'stapel-kaart', index: 1, routes: [{ name: 'Kaart' }, { name: boven }] } },
      { name: 'ZoekTab' },
      { name: 'InstellingenTab' },
    ],
  });
  assert.deepEqual(doelVoorMelding(kaartMetBlad('Groep')), { tab: 'KaartTab', sluitBladIn: 'stapel-kaart' });
  assert.deepEqual(doelVoorMelding(kaartMetBlad('Detail')), { tab: 'KaartTab', sluitBladIn: null });
  // De bladen van de kaart sinds 08-11: filters, kaartlagen en een toestel.
  for (const blad of ['KaartFilters', 'KaartLagen', 'Vliegtuig']) {
    assert.deepEqual(doelVoorMelding(kaartMetBlad(blad)), { tab: 'KaartTab', sluitBladIn: 'stapel-kaart' });
  }
  // Gedeeltelijke staat zonder index: het laatste scherm van de stapel telt.
  assert.deepEqual(
    doelVoorMelding({ routes: [{ name: 'KaartTab', state: { key: 'k', routes: [{ name: 'Kaart' }, { name: 'Groep' }] } }] }),
    { tab: 'KaartTab', sluitBladIn: 'k' },
  );
  // Alleen het tabblad waar je bent telt: een blad in een ander tabblad niet.
  const opBuurt = { ...kaartMetBlad('Groep'), index: 0 };
  assert.deepEqual(doelVoorMelding(opBuurt), { tab: 'BuurtTab', sluitBladIn: null });
  assert.deepEqual(doelVoorMelding(undefined), { tab: 'BuurtTab', sluitBladIn: null });
  assert.equal(tabVoorMelding(kaartMetBlad('Groep')), 'KaartTab');
});

test('closing the group sheet and then opening Detail leaves Map, Detail and the map place', () => {
  let staat = router.getInitialState(opties);
  const plek = { lat: -33.9, lon: 151.2, id: 'a', t: 1 };
  staat = { ...staat, routes: [{ ...staat.routes[0], params: plek }] };
  staat = doe(staat, CommonActions.navigate('Groep', { leden: [] }));
  assert.deepEqual(staat.routes.map((r) => r.name), ['Kaart', 'Groep']);

  // Zoals openMelding: een POP gericht aan deze stapel, dan NAVIGATE Detail.
  // (GroepScreen doet hetzelfde met goBack en navigate.)
  staat = doe(staat, { ...StackActions.pop(), target: staat.key });
  staat = doe(staat, CommonActions.navigate('Detail', melding('b')));
  assert.deepEqual(staat.routes.map((r) => r.name), ['Kaart', 'Detail']);
  assert.equal(staat.index, 1);
  // De kaart houdt zijn plek, dus het plek-effect in KaartScreen draait niet opnieuw.
  assert.deepEqual(staat.routes[0].params, plek);
});
