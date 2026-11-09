// The Emergencies Near Me website, rendered on the server from the same
// store the app reads. Pages are plain HTML with live incident data in them,
// so search engines see the content without running scripts.
//
// Since 09-11-2026 also a live map (site-map.mjs), a page per state and per
// place with its recent history (site-places.mjs) and news articles for
// significant incidents (site-news.mjs, articles.mjs). Every page has a
// canonical URL, a robots rule, Open Graph data and JSON-LD; the sitemaps
// list only pages worth indexing.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sources } from './feeds.mjs';
import { PRIVACY_HTML } from './privacy.mjs';
import { places } from './places.mjs';
import {
  SITE,
  CONTACT,
  STATES,
  ORG,
  esc,
  crumbs,
  page,
  storeButtons,
  appCta,
} from './site-layout.mjs';
import {
  currentIncidents,
  activePlaces,
  placeIndexable,
  regionsLive,
  credits,
  isPrivate,
  memo,
} from './site-data.mjs';
import {
  statePage,
  placesIndexPage,
  placePage,
  incidentRow,
  newsRow,
} from './site-places.mjs';
import { mapPage } from './site-map.mjs';
import { newsIndex, newsArchive, articlePage } from './site-news.mjs';
import { ARTICLE_REGIONS } from './articles.mjs';

export { STATES } from './site-layout.mjs';

const ASSETS = join(dirname(fileURLToPath(import.meta.url)), 'site', 'assets');

function home(store, articles) {
  const per = regionsLive(STATES).map((r) => ({
    r,
    ...currentIncidents(store, r),
  }));
  const total = per.reduce((n, p) => n + p.incidents.length, 0);
  const latest = per
    .flatMap((p) =>
      p.incidents.filter((i) => !isPrivate(i)).map((i) => ({ i, r: p.r })),
    )
    .sort(
      (a, b) =>
        Date.parse(b.i.created || b.i.updated || b.i.firstSeen) -
        Date.parse(a.i.created || a.i.updated || a.i.firstSeen),
    )
    .slice(0, 8);
  const warnings = per.flatMap((p) =>
    p.warnings.filter((w) => w.level).map((w) => ({ w, r: p.r })),
  );
  const news = articles.latest(null, 5);
  const shots = [
    ['01-map', 'Live map with emergency incidents around Melbourne'],
    ['02-nearby', 'List of incidents near you'],
    ['03-detail', 'Incident details with agency, status and directions'],
    ['04-settings', 'Alert settings with radius per service'],
    ['05-alert', 'Push alert for a grass fire'],
  ];
  const features = [
    [
      'Live map',
      'Every published fire, crash, storm, flood and hazmat incident on one map, updated every minute.',
    ],
    [
      'Near you',
      'A list of what is happening within your radius, newest first, with distance and status.',
    ],
    [
      'Alerts for your area',
      'A push alert when something happens near you. Set a radius per service, for example bushfires 100 km and crashes 10 km.',
    ],
    [
      'Warning levels',
      'Advice, Watch and Act and Emergency Warning, as issued by the agencies, clearly marked.',
    ],
    [
      'Every state in one app',
      'Victoria, New South Wales, Queensland, South Australia and the ACT, without switching apps.',
    ],
    [
      'Details and directions',
      'Agency, status, resources and a route to the incident, plus a link to the official advice.',
    ],
  ];
  const body = `
<section class="hero"><h1>Every emergency<br><span>near you</span>, live.</h1>
<p>Bushfires, floods, road crashes and ambulance calls from Australian emergency services, on one map. With alerts for your own area.</p>
${storeButtons()} <a class="btn" href="/map">Open the live map</a>
<div><span class="live"><span class="dot"></span>${total.toLocaleString('en-AU')} incidents across Australia right now</span></div>
</section>
${
  warnings.length
    ? `<h2>Warnings now</h2><div class="list">${warnings
        .slice(0, 10)
        .map(({ w, r }) => incidentRow(w, r, { articles }))
        .join('')}</div>`
    : ''
}
<div class="shots">${shots.map(([f, alt]) => `<img src="/assets/${f}.jpg" alt="${esc(alt)}" loading="lazy" width="555" height="1200">`).join('')}</div>
<h2>Know what is happening, <span class="red">before</span> you smell the smoke</h2>
<div class="grid">${features.map(([h, p]) => `<div class="card"><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('')}</div>
<h2>Right now</h2>
<div class="states">${per.map((p) => `<a class="state" href="/incidents/${p.r}"><b>${p.incidents.length}</b><span>${esc(STATES[p.r].name)}</span></a>`).join('')}</div>
<h2>Latest incidents</h2>
<div class="list">${latest.map(({ i, r }) => incidentRow(i, r, { articles })).join('') || '<div class="row">No incidents right now.</div>'}</div>
<p><a href="/incidents">All incidents by state →</a> · <a href="/map">Live map →</a></p>
${
  news.length
    ? `<h2>News</h2><div class="list">${news.map((a) => newsRow(a, a.region)).join('')}</div><p><a href="/news">All news →</a></p>`
    : ''
}
<h2>Try it free</h2>
<p>Start with a free trial, then a yearly subscription through the App Store. Cancel any time in your Apple Account settings.</p>
<div class="note">Emergencies Near Me is not an official warning service. In an emergency call <b>000</b>, and follow the advice of your state emergency service.</div>`;
  return page({
    path: '/',
    title:
      'Emergencies Near Me: live bushfire, flood and crash alerts in Australia',
    description: `Live emergency incidents across Australia on one map: bushfires, floods, road crashes and ambulance calls, with alerts for your area. ${total} incidents right now.`,
    body,
    credits: credits(store, regionsLive(STATES)),
    jsonld: [
      { '@context': 'https://schema.org', ...ORG },
      {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        '@id': `${SITE}/#website`,
        name: 'Emergencies Near Me',
        url: `${SITE}/`,
        inLanguage: 'en-AU',
        publisher: { '@id': ORG['@id'] },
      },
    ],
  });
}

function overview(store) {
  const per = regionsLive(STATES).map((r) => ({
    r,
    ...currentIncidents(store, r),
  }));
  const busiest = regionsLive(STATES)
    .flatMap((r) => activePlaces(store, r, 7).map((p) => ({ ...p, r })))
    .sort((a, b) => b.n - a.n)
    .slice(0, 30);
  const trail = crumbs([
    ['Home', '/'],
    ['Incidents', '/incidents'],
  ]);
  const body = `${trail.html}
<h1 class="page">Emergency incidents in Australia</h1>
<p class="lead">Current incidents published by state emergency services, updated every minute. Pick a state for the full list, or a place for what happened there recently.</p>
<div class="states">${per.map((p) => `<a class="state" href="/incidents/${p.r}"><b>${p.incidents.length}</b><span>${esc(STATES[p.r].name)}</span></a>`).join('')}</div>
${
  busiest.length
    ? `<h2>Busiest places this week</h2><div class="chips">${busiest
        .map(
          (p) =>
            `<a href="/incidents/${p.r}/${esc(p.place)}">${esc(p.info.name)}<small>${esc(STATES[p.r].short)} · ${p.n}</small></a>`,
        )
        .join('')}</div>`
    : ''
}
<h2>Places per state</h2>
<div class="chips">${regionsLive(STATES)
    .map((r) => `<a href="/incidents/${r}/places">${esc(STATES[r].name)}</a>`)
    .join('')}</div>
${appCta()}`;
  return page({
    path: '/incidents',
    title: 'Emergency incidents in Australia right now',
    description:
      'Live emergency incidents in Victoria, New South Wales, Queensland, South Australia and the ACT, updated every minute, with a page per suburb.',
    body,
    credits: credits(store, regionsLive(STATES)),
    jsonld: [trail.ld],
    nav: '/incidents',
  });
}

function support() {
  const faq = [
    [
      'Why don’t I see incidents near me?',
      'The app shows incidents that state emergency services publish: Victoria, New South Wales, Queensland, South Australia and the ACT. Not every call is published, and some sources update about every 30 minutes. Try a larger radius in Settings.',
    ],
    [
      'I’m outside Australia. Why does it show Melbourne?',
      'With a location outside Australia nothing would be within your radius, so the app shows Melbourne instead. You can choose any Australian place in Settings.',
    ],
    [
      'I don’t get alerts.',
      'Check that notifications for Emergencies Near Me are allowed in iPhone Settings, and that Receive alerts is on in the app. Alerts follow your radius and the services you switched on.',
    ],
    [
      'How do I cancel my subscription?',
      'In iPhone Settings, tap your name, then Subscriptions, then Emergencies Near Me. Cancel at least 24 hours before the trial or year ends.',
    ],
    [
      'I bought it on another iPhone.',
      'Open the app and tap Restore purchase on the subscription screen, with the same Apple Account.',
    ],
    [
      'Is this an official warning service?',
      'No. Emergencies Near Me is independent and does not represent any government or emergency service. The information comes from the official sources listed under Sources. In an emergency call 000, and follow the advice of your state emergency service.',
    ],
  ];
  const body = `<section class="prose"><h1 class="page">Support</h1>
${faq.map(([q, a]) => `<h2>${esc(q)}</h2><p>${esc(a)}</p>`).join('')}
<h2>Contact</h2><p>Questions or feedback? Email <a href="mailto:${CONTACT}">${CONTACT}</a>. We usually reply within a day.</p></section>`;
  return page({
    path: '/support',
    title: 'Support | Emergencies Near Me',
    description:
      'Help with Emergencies Near Me: coverage, alerts, subscriptions and contact.',
    body,
    jsonld: [
      {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faq.map(([q, a]) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      },
    ],
    nav: '/support',
  });
}

const bare = (url) =>
  String(url)
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/\/$/, '');

/**
 * Where the information comes from. Google Play rejected the app on
 * 26-10-2026 for a "Missing Source Link for Government Information": an app
 * that shows government information must name the official sources with a
 * working link, and make clear it does not represent a government. The store
 * listing links here.
 */
function sourcesPage() {
  const list = regionsLive(STATES)
    .map((r) => {
      const s = sources[r];
      return `<h2>${esc(STATES[r].name)}: ${esc(s.name)}</h2>
<p>Official incidents and warnings: <a href="${esc(s.adviceUrl)}">${esc(bare(s.adviceUrl))}</a><br>
Open data and licence: <a href="${esc(s.licenseUrl)}">${esc(bare(s.licenseUrl))}</a></p>
<p>${esc(s.attribution)}${s.coverageNote ? ` ${esc(s.coverageNote)}` : ''}</p>`;
    })
    .join('');
  const body = `<section class="prose"><h1 class="page">Sources</h1>
<p>Emergencies Near Me is an independent app. It does not represent any government, government agency or emergency service, and is not affiliated with or endorsed by them.</p>
<p>Every incident and warning in the app and on this website comes from the public feeds of the state emergency services below, and names its source. We show the information as published, shortened where needed for display. It can be delayed or incomplete: always check the official source and follow the advice of emergency services. In an emergency call <b>000</b>.</p>
${list}
<h2>Places and maps</h2>
<p>Suburb and town names, postcodes and council areas: <a href="https://www.geonames.org/">GeoNames</a> (CC BY 4.0). Map on the website: <a href="https://openfreemap.org/">OpenFreeMap</a>, © <a href="https://openmaptiles.org/">OpenMapTiles</a>, data © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors.</p>
<h2>News reports</h2>
<p>The reports under <a href="/news">News</a> are compiled automatically from these feeds, for incidents with a warning level and large fires. They state what the agency published and link to its official advice; they are not official warnings.</p></section>`;
  return page({
    path: '/sources',
    title: 'Sources | Emergencies Near Me',
    description:
      'Where the information in Emergencies Near Me comes from: the official websites of VicEmergency, NSW Rural Fire Service, Queensland Fire Department, SA Country Fire Service and ACT Emergency Services Agency.',
    body,
  });
}

function terms() {
  const parts = [
    [
      'The app',
      'Emergencies Near Me shows incident information published by Australian state emergency services. It is an independent app, not an official warning service, and is not affiliated with any government or emergency service. Information can be delayed, incomplete or wrong. In an emergency call 000, and always follow the advice of official emergency services.',
    ],
    [
      'Subscription',
      'Emergencies Near Me Premium is a yearly auto-renewable subscription, sold through the App Store or Google Play. Eligible new subscribers get a free trial; after the trial the yearly price shown in the store is charged, unless you cancel at least 24 hours before the trial ends. The subscription renews every year until you cancel it in your Apple or Google account settings. Refunds follow the rules of the store you bought it in.',
    ],
    [
      'Your use',
      'Use the app for personal, non-commercial purposes. Do not copy, resell or scrape the app or its data, and do not use it in a way that harms the service or other people.',
    ],
    [
      'Liability',
      'The app is provided as is. To the extent the law allows, we are not liable for loss or damage caused by relying on the information in the app, by delayed or missed alerts, or by the app being unavailable. Nothing in these terms limits your rights under the Australian Consumer Law.',
    ],
    [
      'Changes',
      'We may update these terms. The current version is always on this page.',
    ],
  ];
  const body = `<section class="prose"><h1 class="page">Terms of Use</h1>
<p class="m" style="color:var(--muted)">Last updated 20 October 2026</p>
${parts.map(([h, p]) => `<h2>${esc(h)}</h2><p>${esc(p)}</p>`).join('')}
<h2>App Store</h2><p>For purchases through the App Store, Apple's <a href="https://www.apple.com/legal/internet-services/itunes/dev/stdeula/">Standard End User License Agreement</a> also applies.</p>
<h2>Contact</h2><p><a href="mailto:${CONTACT}">${CONTACT}</a></p></section>`;
  return page({
    path: '/terms',
    title: 'Terms of Use | Emergencies Near Me',
    description:
      'Terms of Use for the Emergencies Near Me app and subscription.',
    body,
  });
}

function notFound() {
  const body = `<section class="prose"><h1 class="page">Page not found</h1>
<p>This page does not exist (any more). Try the <a href="/map">live map</a>, the <a href="/incidents">incidents per state</a> or the <a href="/news">news</a>.</p></section>`;
  return page({
    path: '/404',
    title: 'Page not found | Emergencies Near Me',
    description: 'Page not found.',
    body,
    robots: 'noindex,follow',
    canonical: false,
  });
}

// ── Sitemaps ────────────────────────────────────────────────────────────────

const xml = (urls) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map(
      ([path, lastmod]) =>
        `<url><loc>${SITE}${esc(path)}</loc>${lastmod ? `<lastmod>${esc(lastmod)}</lastmod>` : ''}</url>`,
    )
    .join('\n')}\n</urlset>\n`;

function sitemapIndex() {
  const maps = [
    '/sitemaps/pages.xml',
    ...regionsLive(STATES).map((r) => `/sitemaps/places-${r}.xml`),
    '/sitemaps/news.xml',
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps
    .map((m) => `<sitemap><loc>${SITE}${m}</loc></sitemap>`)
    .join('\n')}\n</sitemapindex>\n`;
}

/**
 * Live pages change every minute, so they carry no lastmod: a lastmod that is
 * always "now" teaches Google to ignore the lastmod of the whole site. News
 * and places carry the time they really changed.
 */
function sitemapPages(articles) {
  return xml([
    ['/', null],
    ['/map', null],
    ['/incidents', null],
    ...regionsLive(STATES).flatMap((r) => [
      [`/incidents/${r}`, null],
      [`/incidents/${r}/places`, null],
      [`/map/${r}`, null],
    ]),
    ['/news', articles.latest(null, 1)[0]?.modified ?? null],
    ...ARTICLE_REGIONS.filter((r) => STATES[r]).flatMap((r) => [
      [`/news/${r}`, articles.latest(r, 1)[0]?.modified ?? null],
      ...articles.months(r).map((m) => [`/news/${r}/archive/${m.month}`, null]),
    ]),
    ['/support', null],
    ['/sources', null],
    ['/privacy', null],
    ['/terms', null],
  ]);
}

function sitemapPlaces(store, region) {
  return xml(
    activePlaces(store, region, 90)
      // Same rule as the robots meta on the page (placeIndexable).
      .filter((p) => p.n >= 3 || p.active >= 1)
      .sort((a, b) => b.last.localeCompare(a.last))
      .map((p) => [`/incidents/${region}/${p.place}`, p.last]),
  );
}

function sitemapNews(articles) {
  return xml(
    articles.all().map((a) => [`/news/${a.region}/${a.slug}`, a.modified]),
  );
}

// ── Router ──────────────────────────────────────────────────────────────────

const TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

/**
 * A website response for this path, or null when the path is not a page
 * (the API routes then take over). `articles` is the Articles store.
 */
export function renderSite(pathname, store, articles) {
  const html = (body, cache = 'public, max-age=60') => ({
    status: 200,
    type: 'text/html; charset=utf-8',
    body,
    cache,
  });
  const live = (r) => STATES[r] && sources[r];
  if (pathname === '/') return html(home(store, articles));
  if (pathname === '/incidents') return html(overview(store));
  if (pathname === '/map') return html(mapPage(store, articles));
  let m = pathname.match(/^\/map\/([a-z]{2,3})$/);
  if (m && live(m[1])) return html(mapPage(store, articles, m[1]));
  m = pathname.match(/^\/incidents\/([a-z]{2,3})$/);
  if (m && live(m[1])) return html(statePage(store, m[1], articles));
  m = pathname.match(/^\/incidents\/([a-z]{2,3})\/places$/);
  if (m && live(m[1]))
    return html(placesIndexPage(store, m[1]), 'public, max-age=600');
  m = pathname.match(/^\/incidents\/([a-z]{2,3})\/([a-z0-9-]{1,80})$/);
  if (m && live(m[1])) {
    const body = placePage(store, m[1], m[2], articles);
    return body
      ? html(body, 'public, max-age=120')
      : {
          status: 404,
          type: 'text/html; charset=utf-8',
          body: notFound(),
          cache: 'public, max-age=300',
        };
  }
  if (pathname === '/news')
    return html(newsIndex(store, articles), 'public, max-age=120');
  m = pathname.match(/^\/news\/([a-z]{2,3})$/);
  if (m && ARTICLE_REGIONS.includes(m[1]) && STATES[m[1]])
    return html(newsIndex(store, articles, m[1]), 'public, max-age=120');
  m = pathname.match(/^\/news\/([a-z]{2,3})\/archive\/(\d{4}-\d{2})$/);
  if (m && STATES[m[1]]) {
    const body = newsArchive(store, articles, m[1], m[2]);
    if (body) return html(body, 'public, max-age=600');
  }
  m = pathname.match(/^\/news\/([a-z]{2,3})\/([a-z0-9-]{1,120})$/);
  if (m && STATES[m[1]]) {
    const body = articlePage(store, articles, m[1], m[2]);
    if (body) return html(body, 'public, max-age=120');
  }
  if (pathname === '/support') return html(support(), 'public, max-age=3600');
  if (pathname === '/sources')
    return html(sourcesPage(), 'public, max-age=3600');
  if (pathname === '/terms') return html(terms(), 'public, max-age=3600');
  if (pathname === '/privacy')
    return html(PRIVACY_HTML, 'public, max-age=3600');
  const xmlRes = (body) => ({
    status: 200,
    type: 'application/xml; charset=utf-8',
    body,
    cache: 'public, max-age=900',
  });
  if (pathname === '/sitemap.xml') return xmlRes(sitemapIndex());
  if (pathname === '/sitemaps/pages.xml')
    return xmlRes(
      memo(store, 'sm:pages', 600_000, () => sitemapPages(articles)),
    );
  if (pathname === '/sitemaps/news.xml')
    return xmlRes(memo(store, 'sm:news', 300_000, () => sitemapNews(articles)));
  m = pathname.match(/^\/sitemaps\/places-([a-z]{2,3})\.xml$/);
  if (m && live(m[1]))
    return xmlRes(
      memo(store, `sm:places:${m[1]}`, 600_000, () =>
        sitemapPlaces(store, m[1]),
      ),
    );
  if (pathname === '/robots.txt')
    return {
      status: 200,
      type: 'text/plain',
      body: `User-agent: *\nDisallow: /v1/\nSitemap: ${SITE}/sitemap.xml\n`,
      cache: 'public, max-age=3600',
    };
  const a = pathname.match(/^\/assets\/([a-z0-9-]+\.(png|jpg|js|css|svg))$/);
  if (a) {
    const file = join(ASSETS, a[1]);
    if (!existsSync(file)) return null;
    return {
      status: 200,
      type: TYPES['.' + a[2]],
      body: readFileSync(file),
      cache:
        a[2] === 'js' || a[2] === 'css'
          ? 'public, max-age=86400'
          : 'public, max-age=604800',
    };
  }
  // Pages that are no API route get a real 404 page instead of JSON.
  if (
    !pathname.startsWith('/v1/') &&
    pathname !== '/health' &&
    !pathname.startsWith('/health/')
  )
    return {
      status: 404,
      type: 'text/html; charset=utf-8',
      body: notFound(),
      cache: 'public, max-age=300',
    };
  return null;
}

export { places, placeIndexable };
