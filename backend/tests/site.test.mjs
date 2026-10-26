import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IncidentStore } from '../store.mjs';
import { createServer } from '../server.mjs';

void test('the website serves its pages, sitemap and assets next to the API', async () => {
  const s = new IncidentStore();
  const server = createServer(s);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    for (const path of [
      '/',
      '/incidents',
      '/incidents/vic',
      '/support',
      '/sources',
      '/privacy',
      '/terms',
    ]) {
      const response = await fetch(base + path);
      assert.equal(response.status, 200, path);
      assert.match(response.headers.get('content-type'), /^text\/html/, path);
      assert.match(await response.text(), /call <b>000<\/b>|000/, path);
    }
    // Google Play (26-10-2026): every source with a working link to its
    // official .gov.au site, and a clear statement that we are not a government.
    const bronnen = await (await fetch(base + '/sources')).text();
    for (const host of [
      'emergency.vic.gov.au',
      'www.rfs.nsw.gov.au',
      'www.fire.qld.gov.au',
      'www.cfs.sa.gov.au',
      'esa.act.gov.au',
    ])
      assert.match(
        bronnen,
        new RegExp(`href="https://${host.replaceAll('.', '\\.')}/`),
        host,
      );
    assert.match(bronnen, /does not represent any government/);
    assert.equal((await fetch(base + '/incidents/xx')).status, 404);
    assert.match(
      await (await fetch(base + '/sitemap.xml')).text(),
      /\/incidents\/nsw/,
    );
    assert.match(
      await (await fetch(base + '/robots.txt')).text(),
      /Disallow: \/v1\//,
    );
    const icon = await fetch(base + '/assets/icon.png');
    assert.equal(icon.headers.get('content-type'), 'image/png');
    assert.equal((await fetch(base + '/assets/../server.mjs')).status, 404);
  } finally {
    await new Promise((r) => server.close(r));
    s.close();
  }
});
