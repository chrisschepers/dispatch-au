import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IncidentStore } from '../store.mjs';
import { createServer } from '../server.mjs';
import { Articles } from '../articles.mjs';
import { places } from '../places.mjs';
import { STATES } from '../site-layout.mjs';

const ago = (h) => new Date(Date.now() - h * 3_600_000).toISOString();
const feed = (rows, at) => ({
  incidents: rows,
  warnings: [],
  fetchedAt: at,
  sourceUpdated: null,
  stale: false,
});
const row = (id, o = {}) => ({
  id: `nsw:incident:${id}`,
  sourceId: String(id),
  sourceFeed: 'nsw',
  title: 'Grass Fire',
  location: 'Bundemar Rd, Bundemar 2823',
  category: 'fire',
  status: 'Advice · Under control',
  level: 'Advice',
  agency: 'NSW RFS',
  created: null,
  updated: null,
  resources: null,
  point: [-31.83, 147.95],
  kind: 'incident',
  action: null,
  ...o,
});

async function withSite(fn) {
  const s = new IncidentStore();
  // Two fires in Bundemar (indexable), one old crash in Warren (not), and an
  // ACT ambulance call that must never show on the public map.
  s.ingest(
    'nsw',
    feed([row(1), row(2, { location: 'Mitchell Hwy, Bundemar 2823' })], ago(9)),
  );
  s.ingest(
    'nsw',
    feed([row(1), row(2, { location: 'Mitchell Hwy, Bundemar 2823' })], ago(1)),
  );
  s.ingest(
    'act',
    feed(
      [
        {
          ...row(9),
          id: 'act:incident:9',
          sourceFeed: 'act',
          title: 'Ambulance response',
          category: 'ambulance',
          location: 'KAMBAH',
          point: [-35.38, 149.06],
          level: null,
          status: 'Responding',
        },
      ],
      ago(1),
    ),
  );
  const articles = new Articles(s.db);
  articles.refresh({
    placeName: (r, slug) => (slug ? places().get(r, slug)?.name : null),
    tz: (r) => STATES[r].tz,
  });
  const server = createServer(s, null, null, articles);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base, articles);
  } finally {
    await new Promise((r) => server.close(r));
    s.close();
  }
}

void test('a place page: canonical, breadcrumbs, Place data, indexable with two incidents', async () => {
  await withSite(async (base) => {
    const res = await fetch(`${base}/incidents/nsw/bundemar`);
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(
      html,
      /<link rel="canonical" href="https:\/\/emergenciesnearme\.online\/incidents\/nsw\/bundemar">/,
    );
    assert.match(html, /<meta name="robots" content="index,follow/);
    assert.match(html, /<h1 class="page">Emergencies in Bundemar, NSW<\/h1>/);
    assert.match(html, /"@type":"BreadcrumbList"/);
    assert.match(html, /"@type":"Place"/);
    assert.match(html, /© State of New South Wales/, 'the licence line');
    // A known place without incidents exists, but is not for the index.
    const quiet = await (await fetch(`${base}/incidents/nsw/balranald`)).text();
    assert.match(quiet, /<meta name="robots" content="noindex,follow">/);
    // An unknown place is a real 404 page.
    const missing = await fetch(`${base}/incidents/nsw/not-a-real-place`);
    assert.equal(missing.status, 404);
    assert.match(missing.headers.get('content-type'), /^text\/html/);
  });
});

void test('an article: NewsArticle data, the official link and the status', async () => {
  await withSite(async (base, articles) => {
    const a = articles.latest('nsw').find((x) => x.kind === 'incident');
    assert.ok(a, 'an Advice fire listed for 8 hours has an article');
    const html = await (await fetch(`${base}/news/nsw/${a.slug}`)).text();
    assert.match(html, /"@type":"NewsArticle"/);
    assert.match(html, /<meta property="og:type" content="article">/);
    assert.match(html, /rfs\.nsw\.gov\.au/);
    assert.match(html, /It is not an official warning/);
    const news = await (await fetch(`${base}/news`)).text();
    assert.ok(news.includes(`/news/nsw/${a.slug}`));
  });
});

void test('sitemaps list indexable places and the news; the map leaves ambulance calls out', async () => {
  await withSite(async (base, articles) => {
    const index = await (await fetch(`${base}/sitemap.xml`)).text();
    assert.match(index, /<sitemapindex/);
    const nsw = await (await fetch(`${base}/sitemaps/places-nsw.xml`)).text();
    assert.match(nsw, /\/incidents\/nsw\/bundemar</);
    const act = await (await fetch(`${base}/sitemaps/places-act.xml`)).text();
    assert.doesNotMatch(act, /kambah/, 'ambulance calls make no place page');
    const news = await (await fetch(`${base}/sitemaps/news.xml`)).text();
    assert.ok(news.includes(articles.latest('nsw')[0].slug));
    const map = await (await fetch(`${base}/v1/map?hours=24`)).json();
    assert.ok(map.incidents.length >= 2);
    assert.ok(map.incidents.every((r) => r[4] !== 'ambulance'));
    assert.equal(map.incidents[0].length, 13);
    assert.equal((await fetch(`${base}/v1/map?hours=5`)).status, 400);
  });
});

void test('compression, one address per page, HEAD and a 404 page', async () => {
  await withSite(async (base) => {
    const gz = await fetch(`${base}/incidents/nsw`, {
      headers: { 'Accept-Encoding': 'gzip' },
    });
    assert.equal(gz.headers.get('content-encoding'), 'gzip');
    assert.match(gz.headers.get('vary'), /Accept-Encoding/);
    assert.match(await gz.text(), /New South Wales emergency incidents now/);
    const br = await fetch(`${base}/v1/feed?region=nsw`, {
      headers: { 'Accept-Encoding': 'br' },
    });
    assert.equal(br.headers.get('content-encoding'), 'br');
    assert.equal((await br.json()).region, 'nsw');
    const slash = await fetch(`${base}/Incidents/NSW/`, { redirect: 'manual' });
    assert.equal(slash.status, 301);
    assert.equal(slash.headers.get('location'), '/incidents/nsw');
    // A path that normalises to "//host" stays on this site.
    for (const path of ['/a/..//evil.example/', '//evil.example//']) {
      const r = await fetch(base + path, { redirect: 'manual' });
      if (r.status === 301)
        assert.match(r.headers.get('location'), /^\/(?!\/)/, path);
    }
    const head = await fetch(`${base}/map`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.equal((await head.text()).length, 0);
    const bogus = await fetch(`${base}/no-such-page`);
    assert.equal(bogus.status, 404);
    assert.match(await bogus.text(), /Page not found/);
    assert.equal((await fetch(`${base}/v1/nothing`)).status, 404);
  });
});
