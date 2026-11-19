import assert from 'node:assert/strict';
import { test } from 'node:test';
import { leesBrandgevaar, ratingKleur, ratingTekst, isErnstig, gevaarZin } from '../src/brandgevaar.ts';

// The real answer for central Sydney, 19-11-2026, shortened.
const sydney = {
  district: {
    state: 'nsw', district: 'Greater Sydney Region', districtId: 'nsw:4',
    today: { date: '2026-11-19', rating: 'Moderate', totalFireBan: false },
    tomorrow: { date: '2026-11-20', rating: 'Extreme', totalFireBan: true },
    source: 'nsw-rfs', attribution: '© State of New South Wales (NSW Rural Fire Service).', stale: false,
  },
  covered: true,
  sources: [{ source: 'nsw-rfs', name: 'NSW Rural Fire Service', adviceUrl: 'https://www.rfs.nsw.gov.au/fire-information/fdr-and-tobans' }],
};

test('reads the district with today and tomorrow, and its source', () => {
  const g = leesBrandgevaar(sydney);
  assert.equal(g.district, 'Greater Sydney Region');
  assert.equal(g.vandaag.rating, 'Moderate');
  assert.equal(g.morgen.totalFireBan, true);
  assert.equal(g.bron, 'NSW Rural Fire Service');
  assert.match(g.url, /^https:\/\/www\.rfs\.nsw\.gov\.au/);
  assert.equal(gevaarZin(g), 'Fire danger in Greater Sydney Region. Today: Moderate. Tomorrow: Extreme, Total Fire Ban.');
});

test('a place that is not covered shows nothing', () => {
  assert.equal(leesBrandgevaar({ district: null, covered: false, sources: [] }), null);
  assert.equal(leesBrandgevaar({ error: 'Fire danger unavailable' }), null);
  assert.equal(leesBrandgevaar(null), null);
  assert.equal(leesBrandgevaar({ ...sydney, district: { ...sydney.district, today: null } }), null);
});

test('an unknown rating or a link that is not https is not shown as if it were known', () => {
  const g = leesBrandgevaar({
    ...sydney,
    district: { ...sydney.district, today: { date: '2026-11-19', rating: 'Severe', totalFireBan: 'no' } },
    sources: [{ source: 'nsw-rfs', name: 'NSW Rural Fire Service', adviceUrl: 'javascript:alert(1)' }],
  });
  assert.equal(g.vandaag.rating, null);
  assert.equal(g.vandaag.totalFireBan, null);
  assert.equal(ratingTekst(g.vandaag), 'Not issued yet');
  assert.equal(g.url, '');
});

test('the colours and the serious days', () => {
  assert.equal(ratingKleur('Catastrophic').tekst, '#ffffff');
  assert.notEqual(ratingKleur('High').vlak, ratingKleur('Extreme').vlak);
  assert.equal(ratingTekst({ date: 'x', rating: 'No Rating', totalFireBan: false }), 'No rating');
  assert.equal(isErnstig({ date: 'x', rating: 'High', totalFireBan: false }), false);
  assert.equal(isErnstig({ date: 'x', rating: 'High', totalFireBan: true }), true);
  assert.equal(isErnstig({ date: 'x', rating: 'Extreme', totalFireBan: false }), true);
});
