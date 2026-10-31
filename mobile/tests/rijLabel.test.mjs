import assert from 'node:assert/strict';
import { test } from 'node:test';
import { rijLabel } from '../src/rijLabel.ts';

const basis = {
  kop: 'Bushfire', opschaling: null, onder: 'Smithfield', urgentie: null,
  urgentieInOnder: false, km: '2 km', tijd: '14:05',
};

test('the warning level is read once when the urgency already names it', () => {
  assert.equal(
    rijLabel({ ...basis, opschaling: 'Emergency Warning', urgentie: 'Emergency Warning: act now' }),
    'Bushfire, Smithfield, Emergency Warning: act now, 2 km, 14:05',
  );
});

test('the warning level stays when the urgency is only a status', () => {
  assert.equal(
    rijLabel({ ...basis, opschaling: 'Watch and Act', urgentie: 'Responding' }),
    'Bushfire, Watch and Act, Smithfield, Responding, 2 km, 14:05',
  );
});

test('a level from `level` that differs from the priority is still read', () => {
  assert.equal(
    rijLabel({ ...basis, opschaling: 'Watch and Act', urgentie: 'Advice: stay informed' }),
    'Bushfire, Watch and Act, Smithfield, Advice: stay informed, 2 km, 14:05',
  );
});

test('a flipped row reads the urgency from the line below, not twice', () => {
  assert.equal(
    rijLabel({
      ...basis, kop: 'Smithfield', opschaling: 'Emergency Warning',
      onder: 'Fire · Emergency Warning: act now', urgentie: 'Emergency Warning: act now', urgentieInOnder: true,
    }),
    'Smithfield, Fire · Emergency Warning: act now, 2 km, 14:05',
  );
  assert.equal(
    rijLabel({ ...basis, kop: 'Smithfield', opschaling: 'Advice', onder: 'Fire · Going', urgentie: 'Going', urgentieInOnder: true }),
    'Smithfield, Advice, Fire · Going, 2 km, 14:05',
  );
});

test('empty parts are left out', () => {
  assert.equal(rijLabel({ ...basis, onder: null, km: null }), 'Bushfire, 14:05');
});
