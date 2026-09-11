import assert from 'node:assert/strict';
const base = process.env.DISPATCH_TEST_ORIGIN || 'http://127.0.0.1:3001';
if (!['localhost', '127.0.0.1'].includes(new URL(base).hostname))
  throw Error('Run this integration check against a local test server only.');
async function get(path, options) {
  const r = await fetch(base + path, {
    signal: AbortSignal.timeout(20000),
    ...options,
  });
  return r;
}
const page = await get('/');
assert.equal(page.status, 200, 'app route');
const html = await page.text();
assert.match(html, /Dispatch/);
assert.match(html, /manifest.webmanifest/);
console.log('PASS: app route and PWA metadata');
const manifest = await (await get('/manifest.webmanifest')).json();
assert.equal(manifest.display, 'standalone');
for (const icon of manifest.icons)
  assert.equal((await get(icon.src)).status, 200);
assert.equal((await get('/sw.js')).status, 200);
assert.equal((await get('/offline.html')).status, 200);
console.log(
  'PASS: install manifest, icons, service worker and offline fallback',
);
const response = await get('/api/incidents');
assert.equal(response.status, 200, 'live source response');
const feed = await response.json();
assert.ok(Array.isArray(feed.incidents));
assert.ok(Array.isArray(feed.warnings));
assert.equal(feed.source, 'VicEmergency');
assert.ok(feed.fetchedAt);
assert.ok(!JSON.stringify(feed).includes('webBody'));
console.log(
  `PASS: actual Victoria feed (${feed.incidents.length} incidents, ${feed.warnings.length} warnings)`,
);
assert.equal(
  (await get('/api/places', { method: 'POST', body: '{}' })).status,
  403,
);
assert.equal(
  (await get('/api/billing/checkout', { method: 'POST', body: '{}' })).status,
  403,
);
assert.equal(
  (
    await get('/api/billing/checkout', {
      method: 'POST',
      headers: { Origin: base, 'Content-Type': 'application/json' },
      body: '{"plan":"monthly"}',
    })
  ).status,
  503,
);
console.log('PASS: cross-origin guards and disabled checkout');
const account = await (await get('/api/account')).json();
assert.equal(account.pro, false);
assert.equal(account.billingReady, false);
assert.equal(account.user, null);
assert.equal((await get('/api/places')).status, 401);
// Local fixture emulates identity normally injected by the trusted Sites dispatcher.
// get() rejects non-local targets above; this is not an authentication-flow test.
const fixture = {
  'oai-authenticated-user-id': 'dispatch-integration-' + crypto.randomUUID(),
  'oai-authenticated-user-email': 'integration@example.invalid',
  Origin: base,
  'Content-Type': 'application/json',
};
const other = {
  ...fixture,
  'oai-authenticated-user-id': fixture['oai-authenticated-user-id'] + '-other',
};
const payload = JSON.stringify({
  name: 'Integration test place',
  lat: -37.81,
  lng: 144.96,
  radius: 25,
});
let id;
try {
  const created = await get('/api/places', {
    method: 'POST',
    headers: fixture,
    body: payload,
  });
  assert.equal(created.status, 201);
  id = (await created.json()).place.id;
  const reread = await (await get('/api/places', { headers: fixture })).json();
  assert.ok(reread.places.some((p) => p.id === id));
  assert.equal(
    (
      await get('/api/places', {
        method: 'POST',
        headers: fixture,
        body: payload,
      })
    ).status,
    409,
  );
  const otherRead = await (await get('/api/places', { headers: other })).json();
  assert.deepEqual(otherRead.places, []);
  assert.equal(
    (
      await get('/api/places?id=' + encodeURIComponent(id), {
        method: 'DELETE',
        headers: other,
      })
    ).status,
    200,
  );
  const stillThere = await (
    await get('/api/places', { headers: fixture })
  ).json();
  assert.ok(stillThere.places.some((p) => p.id === id));
  assert.equal(
    (
      await get('/api/places', {
        method: 'POST',
        headers: other,
        body: JSON.stringify({
          name: 'Invalid',
          lat: -100,
          lng: 144,
          radius: 25,
        }),
      })
    ).status,
    400,
  );
  console.log(
    'PASS: saved-place persistence, free quota, validation and isolation between accounts',
  );
} finally {
  if (id) {
    assert.equal(
      (
        await get('/api/places?id=' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: fixture,
        })
      ).status,
      200,
    );
    const cleaned = await (
      await get('/api/places', { headers: fixture })
    ).json();
    assert.deepEqual(cleaned.places, []);
  }
}
