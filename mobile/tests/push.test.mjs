import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pushBeschikbaarOp } from '../src/pushRegels.ts';

// Android zonder google-services.json heeft geen push: dan geen belofte en geen
// toestemmingsvraag (controle 01-11-2026). iOS heeft altijd push.
test('push is promised only where the build can deliver it', () => {
  assert.equal(pushBeschikbaarOp('ios', undefined), true);
  assert.equal(pushBeschikbaarOp('ios', { androidPushConfigured: false }), true);
  assert.equal(pushBeschikbaarOp('android', { androidPushConfigured: true }), true);
  for (const extra of [undefined, null, {}, { androidPushConfigured: false }, { androidPushConfigured: 'true' }, { androidPushConfigured: 1 }]) {
    assert.equal(pushBeschikbaarOp('android', extra), false, JSON.stringify(extra));
  }
});
