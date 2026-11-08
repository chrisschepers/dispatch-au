import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isAfgelopen, niveauVan, opKaart, feedUren, filterActief, herhalingTekst,
  schoneKeuze, standaardKeuze, periodeLabel, periodeVoluit,
} from '../src/kaartFilter.ts';

const ALLE = ['Fire', 'Ambulance', 'Rescue', 'Storm', 'Hazmat', 'Other'];
const NU = Date.parse('2026-11-08T22:00:00Z');
const uurGeleden = (u) => new Date(NU - u * 3_600_000).toISOString();
const melding = (o = {}) => ({
  discipline: 'Fire', timestamp: uurGeleden(1), status: 'Responding', listed: true,
  lastSeen: uurGeleden(0), ...o,
});
const filter = (o = {}) => ({ periode: 0, diensten: ALLE, niveau: 'alle', ...o });

test('ended: off the official list, or Safe/Complete as its own status', () => {
  assert.equal(isAfgelopen({ listed: false, status: 'Responding' }), true);
  assert.equal(isAfgelopen({ listed: true, status: 'Safe' }), true);
  assert.equal(isAfgelopen({ listed: true, status: 'Complete' }), true);
  assert.equal(isAfgelopen({ listed: true, status: 'Under control' }), false);
  // Older data without the flag: only the status counts.
  assert.equal(isAfgelopen({ status: 'Going' }), false);
});

test('warning levels from level or status', () => {
  assert.equal(niveauVan({ level: 'Emergency Warning' }), 3);
  assert.equal(niveauVan({ level: 'Watch and Act' }), 2);
  assert.equal(niveauVan({ priority: 'Advice · Under control' }), 1);
  assert.equal(niveauVan({ level: null, priority: 'Responding' }), 0);
});

test('active now: everything still going, nothing that ended (the Caroline Springs case)', () => {
  const lopend = melding({ timestamp: uurGeleden(70) }); // a fire burning for days still shows
  const af = melding({ listed: false, lastSeen: uurGeleden(0.5) });
  assert.equal(opKaart(lopend, filter(), NU), true);
  assert.equal(opKaart(af, filter(), NU), false);
});

test('a longer period adds what ended within it, measured from when it ended', () => {
  const af = melding({ listed: false, timestamp: uurGeleden(6), lastSeen: uurGeleden(3) });
  assert.equal(opKaart(af, filter({ periode: 4 }), NU), true);
  assert.equal(opKaart(af, filter({ periode: 4 }), NU + 2 * 3_600_000), false);
  assert.equal(opKaart(af, filter({ periode: 24 }), NU + 2 * 3_600_000), true);
  // Without lastSeen the start time counts.
  const zonder = melding({ listed: false, timestamp: uurGeleden(30), lastSeen: undefined });
  assert.equal(opKaart(zonder, filter({ periode: 24 }), NU), false);
  assert.equal(opKaart(zonder, filter({ periode: 72 }), NU), true);
});

test('services and warning level filter out, also for active incidents', () => {
  assert.equal(opKaart(melding(), filter({ diensten: ['Storm'] }), NU), false);
  assert.equal(opKaart(melding({ discipline: 'Storm' }), filter({ diensten: ['Storm'] }), NU), true);
  assert.equal(opKaart(melding({ level: 'Advice' }), filter({ niveau: 'watch' }), NU), false);
  assert.equal(opKaart(melding({ level: 'Watch and Act' }), filter({ niveau: 'watch' }), NU), true);
  assert.equal(opKaart(melding({ level: 'Watch and Act' }), filter({ niveau: 'emergency' }), NU), false);
  assert.equal(opKaart(melding({ level: 'Emergency Warning' }), filter({ niveau: 'emergency' }), NU), true);
});

test('feed window: 24 h covers active, 4 h and 24 h; 3 days needs 72', () => {
  assert.deepEqual([0, 4, 24, 72].map(feedUren), [24, 24, 24, 72]);
  assert.deepEqual([0, 4, 24, 72].map(periodeLabel), ['Active now', '4 h', '24 h', '3 days']);
  assert.equal(periodeVoluit(4), 'Last 4 hours');
});

test('the filter counts as changed only when it differs from the default', () => {
  assert.equal(filterActief(filter(), ALLE), false);
  assert.equal(filterActief(filter({ periode: 24 }), ALLE), true);
  assert.equal(filterActief(filter({ niveau: 'watch' }), ALLE), true);
  assert.equal(filterActief(filter({ diensten: ['Fire'] }), ALLE), true);
});

test('repeated callouts at one address', () => {
  const op = (u) => ({ location: 'Oakview Pde', city: 'Caroline Springs', timestamp: uurGeleden(u) });
  assert.equal(herhalingTekst([op(58), op(57.8), op(32), op(0)]), '4 callouts at this address in 3 days');
  assert.equal(herhalingTekst([op(5), op(0)]), '2 callouts at this address in 5 hours');
  assert.equal(herhalingTekst([op(1.2), op(0)]), '2 callouts at this address in 1 hour');
  assert.equal(herhalingTekst([op(0.5), op(0)]), '2 callouts at this address within an hour');
  // Different addresses, a suburb only, or a single incident: no story.
  assert.equal(herhalingTekst([op(1), { ...op(0), location: 'Lygon St' }]), null);
  assert.equal(herhalingTekst([{ ...op(1), location: null }, { ...op(0), location: null }]), null);
  assert.equal(herhalingTekst([op(1)]), null);
});

test('a stored choice is checked; anything odd falls back to the default', () => {
  assert.deepEqual(schoneKeuze(null, ALLE), standaardKeuze(ALLE));
  const k = schoneKeuze({
    periode: 24, diensten: ['Fire', 'Nonsense'], niveau: 'watch', kaartType: 'hybrid',
    lucht: { blussen: false, rfds: true, onzin: true },
  }, ALLE);
  assert.equal(k.periode, 24);
  assert.deepEqual(k.diensten, ['Fire']);
  assert.equal(k.niveau, 'watch');
  assert.equal(k.kaartType, 'hybrid');
  assert.deepEqual(k.lucht, { blussen: false, redding: true, politie: true, rfds: true });
  const raar = schoneKeuze({ periode: 5, diensten: [], niveau: 'x', kaartType: 'satellite' }, ALLE);
  assert.equal(raar.periode, 0);
  assert.deepEqual(raar.diensten, ALLE);
  assert.equal(raar.niveau, 'alle');
  assert.equal(raar.kaartType, 'standard');
});

test('the default shows what is going now, with the Flying Doctor off', () => {
  const s = standaardKeuze(ALLE);
  assert.equal(s.periode, 0);
  assert.equal(s.lucht.blussen, true);
  assert.equal(s.lucht.redding, true);
  assert.equal(s.lucht.rfds, false);
});
