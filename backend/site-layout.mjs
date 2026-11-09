// Shared layout of the Emergencies Near Me website: the page frame, styles,
// small formatters and the SEO parts every page uses (canonical URL, robots,
// Open Graph, JSON-LD, breadcrumbs). Pages live in site.mjs, site-places.mjs,
// site-map.mjs and site-news.mjs.
export const SITE = (
  process.env.SITE_URL || 'https://emergenciesnearme.online'
).replace(/\/$/, '');
export const APP_STORE = 'https://apps.apple.com/app/id6811057872';
/** Set once the Play listing is public (production access, expected mid November 2026). */
export const PLAY_STORE = process.env.PLAY_STORE_URL || '';
export const CONTACT = 'chrisschepers22@gmail.com';
/**
 * Search engine ownership checks (Google Search Console "HTML tag", Bing
 * Webmaster Tools), set in Railway so verifying needs no new code.
 */
const VERIFY = [
  ['google-site-verification', process.env.GOOGLE_SITE_VERIFICATION],
  ['msvalidate.01', process.env.BING_SITE_VERIFICATION],
]
  .filter(([, v]) => v)
  .map(
    ([n, v]) =>
      `<meta name="${n}" content="${String(v).replace(/[^A-Za-z0-9_-]/g, '')}">`,
  )
  .join('');
/** Bumped when site/assets/site.js or site.css change, so browsers fetch the new file. */
export const ASSET_VERSION = '2026-11-09';

export const STATES = {
  vic: {
    name: 'Victoria',
    short: 'VIC',
    tz: 'Australia/Melbourne',
    official: 'VicEmergency',
  },
  nsw: {
    name: 'New South Wales',
    short: 'NSW',
    tz: 'Australia/Sydney',
    official: 'NSW Rural Fire Service',
  },
  qld: {
    name: 'Queensland',
    short: 'QLD',
    tz: 'Australia/Brisbane',
    official: 'Queensland Fire Department',
  },
  sa: {
    name: 'South Australia',
    short: 'SA',
    tz: 'Australia/Adelaide',
    official: 'SA Country Fire Service',
  },
  act: {
    name: 'Australian Capital Territory',
    short: 'ACT',
    tz: 'Australia/Sydney',
    official: 'ACT Emergency Services Agency',
  },
};

export const CATEGORY = {
  fire: { label: 'Fire', plural: 'fires', colour: '#e5372c' },
  planned: {
    label: 'Planned burn',
    plural: 'planned burns',
    colour: '#e5372c',
  },
  ambulance: {
    label: 'Ambulance',
    plural: 'ambulance calls',
    colour: '#f4a814',
  },
  rescue: { label: 'Rescue', plural: 'rescues and crashes', colour: '#2f6fde' },
  storm: { label: 'SES', plural: 'storm and flood jobs', colour: '#12897a' },
  hazmat: { label: 'Hazmat', plural: 'hazmat incidents', colour: '#7c4dbe' },
  other: { label: 'Other', plural: 'other incidents', colour: '#8e8e93' },
};

export const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );

/** Feeds often shout suburbs in capitals ("KAMBAH"); show them in title case. */
export function nice(s) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  if (t !== t.toUpperCase() || !/[A-Z]{3,}/.test(t)) return t;
  return t
    .toLowerCase()
    .replace(/\b([a-z])/g, (x) => x.toUpperCase())
    .replace(/\b(Nsw|Vic|Qld|Sa|Act)\b/g, (x) => x.toUpperCase());
}

/** "5 min ago", or a weekday and time in the state's own zone. */
export function when(iso, tz) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 360) return `${Math.floor(min / 60)} h ago`;
  return d.toLocaleString('en-AU', {
    timeZone: tz,
    weekday: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "Mon 9 Nov, 4:05 pm" in the state's zone. */
export function dateTime(iso, tz) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  return d.toLocaleString('en-AU', {
    timeZone: tz,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "9 November 2026" in the state's zone. */
export function longDate(iso, tz) {
  const d = new Date(iso);
  if (Number.isNaN(+d)) return '';
  return d.toLocaleDateString('en-AU', {
    timeZone: tz,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function levelBadge(level) {
  const l = String(level || '').toLowerCase();
  if (l.includes('emergency'))
    return '<span class="lvl e">Emergency Warning</span>';
  if (l.includes('watch')) return '<span class="lvl w">Watch and Act</span>';
  if (l.includes('advice')) return '<span class="lvl a">Advice</span>';
  return '';
}

/** JSON-LD for search engines, safe inside a script element. */
export function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

export const ORG = {
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: 'Emergencies Near Me',
  url: `${SITE}/`,
  logo: {
    '@type': 'ImageObject',
    url: `${SITE}/assets/icon.png`,
    width: 256,
    height: 256,
  },
};

/**
 * Breadcrumbs as a visible trail and as BreadcrumbList. `trail` is a list of
 * [name, path]; the last one is the page itself.
 */
export function crumbs(trail) {
  const html = `<nav class="crumbs" aria-label="Breadcrumb">${trail
    .map(([name, path], k) =>
      k < trail.length - 1
        ? `<a href="${esc(path)}">${esc(name)}</a>`
        : `<span aria-current="page">${esc(name)}</span>`,
    )
    .join('<span class="sep">›</span>')}</nav>`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map(([name, path], k) => ({
      '@type': 'ListItem',
      position: k + 1,
      name,
      item: `${SITE}${path}`,
    })),
  };
  return { html, ld };
}

const CSS = `
:root{--bg:#f6f6f7;--card:#fff;--text:#141414;--soft:#55575d;--muted:#8e8e93;--line:#e6e6e9;--red:#e5372c;--redsoft:#fdeceb;--chip:#efeff2}
@media (prefers-color-scheme:dark){:root{--bg:#0b0b0c;--card:#1c1c1e;--text:#f2f2f7;--soft:#c7c7cc;--muted:#8e8e93;--line:#2c2c2e;--red:#ff5247;--redsoft:#3a1512;--chip:#2c2c2e}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:inherit}.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
header.top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 0}
.brand{display:flex;align-items:center;gap:10px;font-weight:800;text-decoration:none;font-size:17px;flex:none}
.brand img{width:34px;height:34px;border-radius:9px}
nav.main{display:flex;gap:18px;overflow-x:auto}nav.main a{text-decoration:none;color:var(--soft);font-weight:600;font-size:15px;white-space:nowrap}nav.main a:hover,nav.main a[aria-current]{color:var(--text)}
.hero{text-align:center;padding:36px 0 18px}
.hero h1{font-size:clamp(38px,7vw,68px);line-height:1.02;letter-spacing:-.04em;font-weight:900;margin:0 0 16px}
.hero h1 span,.red{color:var(--red)}
.hero p{font-size:clamp(17px,2.4vw,20px);color:var(--soft);max-width:640px;margin:0 auto 26px}
.store{display:inline-flex;align-items:center;gap:10px;background:#000;color:#fff;text-decoration:none;padding:12px 22px;border-radius:14px;font-weight:700}
@media (prefers-color-scheme:dark){.store{background:#fff;color:#000}}
.store small{display:block;font-size:11px;font-weight:500;opacity:.8;line-height:1}
.btn{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--card);text-decoration:none;padding:11px 18px;border-radius:14px;font-weight:700}
.live{display:inline-flex;align-items:center;gap:8px;margin-top:18px;color:var(--soft);font-size:14px}
.dot{width:9px;height:9px;border-radius:50%;background:#34c759;box-shadow:0 0 0 4px #34c75933}
.shots{display:flex;gap:18px;overflow-x:auto;padding:28px 4px 18px;scroll-snap-type:x mandatory}
.shots img{height:min(560px,110vw);width:auto;border-radius:22px;scroll-snap-align:center;flex:none;box-shadow:0 18px 40px #0000001f}
h1.page{font-size:clamp(30px,5vw,42px);letter-spacing:-.03em;line-height:1.1;margin:8px 0 10px}
h2{font-size:clamp(24px,3.6vw,32px);letter-spacing:-.03em;margin:44px 0 14px;line-height:1.15}
h3{font-size:18px;margin:26px 0 8px}
.lead{font-size:18px;color:var(--soft);max-width:760px;margin:0 0 6px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
.card{background:var(--card);border-radius:18px;padding:20px;border:1px solid var(--line)}
.card h3{margin:0 0 6px;font-size:17px}.card p{margin:0;color:var(--soft);font-size:15px}
.states{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.state{display:block;text-decoration:none;background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px}
.state b{display:block;font-size:28px;letter-spacing:-.02em}.state span{color:var(--soft);font-size:14px}
.list{background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden}
.row{display:flex;gap:12px;padding:14px 16px;border-top:1px solid var(--line)}.row:first-child{border-top:0}
.row.ended{background:transparent}.list.flat{background:transparent}
.bar{width:4px;border-radius:2px;flex:none}
.row .t{font-weight:700}.row .t a{text-decoration:underline;text-decoration-color:var(--line);text-underline-offset:3px}.row .t a:hover{text-decoration-color:currentColor}
.row .m{color:var(--soft);font-size:14px}.row .m a{color:var(--soft)}
.row .r{margin-left:auto;text-align:right;color:var(--muted);font-size:13px;white-space:nowrap}
.lvl{display:inline-block;font-size:12px;font-weight:700;border-radius:6px;padding:1px 7px;margin-left:6px;vertical-align:1px}
.lvl.e{background:#e5372c;color:#fff}.lvl.w{background:#f4a814;color:#111}.lvl.a{background:#f5d547;color:#111}
.ended-tag{font-size:12px;font-weight:700;color:var(--muted);margin-left:6px}
.note{background:var(--redsoft);border-radius:16px;padding:16px 18px;margin:28px 0;font-size:15px}
.prose{max-width:720px}.prose h2{font-size:24px;margin-top:34px}.prose p,.prose li{color:var(--soft)}
.crumbs{font-size:14px;color:var(--muted);margin:6px 0 4px;display:flex;flex-wrap:wrap;gap:6px}.crumbs a{color:var(--soft);text-decoration:none}.crumbs a:hover{text-decoration:underline}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:18px 0}
.stat{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 14px}.stat b{display:block;font-size:24px;letter-spacing:-.02em}.stat span{color:var(--soft);font-size:13px}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.chips a[data-hours][aria-pressed="true"]{background:var(--text);color:var(--bg)}.chips a[data-cat][aria-pressed="false"]{opacity:.45;text-decoration:line-through}.chips a{background:var(--chip);border-radius:999px;padding:6px 12px;text-decoration:none;font-size:14px;font-weight:600}.chips a small{color:var(--muted);font-weight:500;margin-left:4px}
.az h3{margin:22px 0 6px}
.updated{color:var(--muted);font-size:13px}
.facts{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:6px 18px;margin:18px 0}
.facts div{display:flex;gap:12px;padding:9px 0;border-top:1px solid var(--line)}.facts div:first-child{border-top:0}
.facts dt{color:var(--soft);min-width:130px}.facts dd{margin:0;font-weight:600}
.timeline{list-style:none;padding:0;margin:12px 0}.timeline li{padding:8px 0 8px 18px;border-left:2px solid var(--line);position:relative;color:var(--soft)}
.timeline li:before{content:"";position:absolute;left:-6px;top:15px;width:10px;height:10px;border-radius:50%;background:var(--red)}
.timeline b{color:var(--text)}
blockquote{margin:14px 0;padding:12px 16px;border-left:4px solid var(--red);background:var(--card);border-radius:0 12px 12px 0}
article.news{max-width:760px}article.news p{font-size:17px}
.cta{display:flex;flex-wrap:wrap;gap:10px;align-items:center;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px 18px;margin:28px 0}.cta p{margin:0;flex:1 1 260px}
footer{margin-top:56px;padding:28px 0 40px;border-top:1px solid var(--line);color:var(--muted);font-size:13px}
footer a{margin-right:16px}
@media (max-width:520px){.brand .bn{display:none}nav.main{gap:14px}.row .r{font-size:12px}.facts dt{min-width:104px}}
.row>div:nth-child(2){min-width:0;overflow-wrap:anywhere}.attr{white-space:pre-line;margin:8px 0 0}
.maker{margin-top:10px}footer p a{margin-right:0}
`;

const NAV = [
  ['Map', '/map'],
  ['Incidents', '/incidents'],
  ['News', '/news'],
  ['Support', '/support'],
];

/** App Store (and later Google Play) buttons. */
export function storeButtons() {
  const apple = `<a class="store" href="${APP_STORE}"><svg width="20" height="24" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/></svg><span><small>Download on the</small>App Store</span></a>`;
  const play = PLAY_STORE
    ? ` <a class="store" href="${esc(PLAY_STORE)}"><svg width="20" height="22" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M325.3 234.3 104.6 13l280.8 161.2-60.1 60.1zM47 0C34 6.8 25.3 19.2 25.3 35.3v441.3c0 16.1 8.7 28.5 21.7 35.3l256.6-256L47 0zm425.2 225.6-58.9-34.1-65.7 64.5 65.7 64.5 60.1-34.1c18-14.3 18-46.5-1.2-60.8zM104.6 499l280.8-161.2-60.1-60.1L104.6 499z"/></svg><span><small>Get it on</small>Google Play</span></a>`
    : '';
  return apple + play;
}

/** The call to install the app, under the content of a page. */
export function appCta(
  text = 'Get an alert when something happens near you, with your own radius per service.',
) {
  return `<div class="cta"><p>${esc(text)}</p>${storeButtons()}</div>`;
}

/**
 * A title with the brand after it when there is room: Google shows about 60
 * characters, and the place or incident matters more than the brand.
 */
export function titled(base) {
  return base.length <= 38 ? `${base} | Emergencies Near Me` : base;
}

/**
 * The credit for the data on a page (site-data.mjs credits): each source's
 * licence line, a link to its licence and when we last received its data.
 * CC BY asks for the credit; VicEmergency also for the update time.
 */
export function creditHtml(list) {
  return list
    .map((c) => {
      const tz = STATES[c.region]?.tz ?? 'Australia/Sydney';
      return `<p class="attr">${esc(c.attribution)}${c.licenseUrl ? ` <a href="${esc(c.licenseUrl)}">Licence</a>.` : ''}${c.fetchedAt ? ` Last updated ${esc(dateTime(c.fetchedAt, tz))}.` : ''}</p>`;
    })
    .join('');
}

/**
 * One page. `robots` is the robots meta ('noindex,follow' for thin pages);
 * `jsonld` a list of schema.org objects; `credits` the sources of the data
 * shown (creditHtml); `canonical` false for pages without an address of
 * their own (the 404 page).
 */
export function page({
  path,
  title,
  description,
  body,
  credits = [],
  attribution = '',
  robots = 'index,follow,max-image-preview:large',
  ogType = 'website',
  ogImage = `${SITE}/assets/og-default.png`,
  jsonld = [],
  head = '',
  nav = '',
  canonical = true,
}) {
  return `<!doctype html><html lang="en-AU"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta name="robots" content="${esc(robots)}">
${canonical ? `<link rel="canonical" href="${SITE}${path}">` : ''}
<meta property="og:site_name" content="Emergencies Near Me"><meta property="og:locale" content="en_AU">
<meta property="og:type" content="${esc(ogType)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(ogImage)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:url" content="${SITE}${path}">
<meta name="twitter:card" content="summary_large_image">
<meta name="apple-itunes-app" content="app-id=6811057872">
<meta name="theme-color" content="#e5372c">${VERIFY}
<link rel="icon" href="/assets/favicon.png"><link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>${CSS}</style>${jsonld.map(jsonLd).join('')}${head}</head><body><div class="wrap">
<header class="top"><a class="brand" href="/"><img src="/assets/icon.png" alt="" width="34" height="34"><span class="bn">Emergencies Near Me</span></a>
<nav class="main" aria-label="Main">${NAV.map(([label, href]) => `<a href="${href}"${nav === href ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav></header>
${body}
<footer>
<a href="/map">Map</a><a href="/incidents">Incidents</a><a href="/news">News</a><a href="/support">Support</a><a href="/sources">Sources</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a>
<p>Emergencies Near Me is an independent app. It does not represent and is not affiliated with any government or emergency service; the information comes from the official <a href="/sources">sources</a> of the state emergency services. In an emergency, call <b>000</b>. Always follow the advice of official emergency services.</p>
<p class="maker">Also by the maker: <a href="https://alarmeringenp2000.nl/" hreflang="nl">Alarmeringen P2000</a>, emergency alerts in the Netherlands</p>
${creditHtml(credits)}${attribution ? `<div class="attr">${esc(attribution)}</div>` : ''}
</footer></div></body></html>`;
}
